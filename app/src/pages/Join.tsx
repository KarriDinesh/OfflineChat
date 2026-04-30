import React, { useState, useRef, useCallback } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { useStore } from '../store/useStore'
import { loadOrCreateIdentity, bytesToHex } from '../lib/crypto'

/** Safely decode a base64 string */
function safeAtob(b64: string): string {
  try { return atob(b64) } catch { return atob(decodeURIComponent(b64)) }
}

/** Parse QR text into a room config object. Handles multiple formats.
 *  Returns { config, redirectUrl } — if redirectUrl is set, browser should navigate there.
 */
function parseQRText(text: string): { config: Record<string, unknown> | null; redirectUrl: string | null } {
  const trimmed = text.trim()

  // Format 1: URL with ?join=base64 (new canonical format)
  // e.g. http://192.168.1.42:3000/?join=eyJy...
  try {
    const url = new URL(trimmed)
    const joinParam = url.searchParams.get('join')
    if (joinParam) {
      // If we're on HTTPS and this is a local HTTP URL, redirect browser there
      // so WebSocket ws:// works correctly
      if (window.location.protocol === 'https:' && url.protocol === 'http:') {
        return { config: null, redirectUrl: trimmed }
      }
      const decoded = JSON.parse(safeAtob(joinParam))
      // Compact format {r,s,n,e} — add seedIp from URL hostname
      const config = decoded.r && !decoded.roomId ? {
        roomId: decoded.r,
        seedIp: url.hostname,
        cryptoSalt: decoded.s,
        roomName: decoded.n ?? 'Room',
        expiresAt: decoded.e ?? null,
        protocolV: 1,
      } : { ...decoded, seedIp: decoded.seedIp ?? url.hostname }
      return { config, redirectUrl: null }
    }
  } catch { /* not a URL */ }

  // Format 2: compact JSON {r,i,s,n,e}
  try {
    const compact = JSON.parse(trimmed)
    if (compact.r && compact.s) {
      const config = {
        roomId: compact.r,
        seedIp: compact.i ?? '',
        cryptoSalt: compact.s,
        roomName: compact.n ?? 'Room',
        expiresAt: compact.e ?? null,
        protocolV: 1,
      }
      return { config, redirectUrl: null }
    }
    if (compact.roomId && compact.cryptoSalt) return { config: compact, redirectUrl: null }
  } catch { /* not JSON */ }

  return { config: null, redirectUrl: null }
}



export default function Join() {
  const { setIdentity, setRoomConfig, setRole, setPhase, setAlias, roomConfig } = useStore()
  const [alias, setAliasLocal] = useState('')
  const [pin, setPin] = useState(['', '', '', '', '', ''])
  const [hostIp, setHostIp] = useState('')
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState('')
  const [pinLoading, setPinLoading] = useState(false)
  const [tab, setTab] = useState<'qr' | 'pin'>('qr')
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const pinRefs = useRef<(HTMLInputElement | null)[]>([])

  // If a config was pre-loaded from a QR deep link, skip straight to quick-join UI
  const hasPreloaded = !!(roomConfig?.roomId && roomConfig?.cryptoSalt)

  const joinWithParsedConfig = useCallback((config: Record<string, unknown>) => {
    if (!config.roomId || !config.cryptoSalt) {
      setError('Could not read room info from QR. Ask the host to generate a new one.')
      return
    }
    if ((config.expiresAt as number) && Date.now() > (config.expiresAt as number)) {
      setError('This invite has expired. Ask the host for a new QR code.')
      return
    }
    const identity = loadOrCreateIdentity()
    setIdentity(identity)
    setRoomConfig(config as never)
    setRole('member')
    setAlias(alias.trim() || `peer-${bytesToHex(identity.publicKey).slice(0, 6)}`)
    setPhase('chat')
  }, [alias])

  // Quick join using pre-loaded config (from ?join= deep link)
  const handleQuickJoin = useCallback(() => {
    if (!roomConfig || !alias.trim()) return
    joinWithParsedConfig(roomConfig as unknown as Record<string, unknown>)
  }, [roomConfig, alias, joinWithParsedConfig])

  const startScan = useCallback(async () => {
    setScanning(true)
    setError('')
    const scanner = new Html5Qrcode('qr-reader')
    scannerRef.current = scanner
    try {
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (text) => {
          scanner.stop().catch(() => {})
          setScanning(false)
          const { config, redirectUrl } = parseQRText(text)
          if (redirectUrl) {
            // QR points to local HTTP server — navigate there so ws:// works
            window.location.href = redirectUrl
            return
          }
          if (!config) { setError('Could not read QR code. Try again.'); return }
          joinWithParsedConfig(config)
        },
        () => {}
      )
    } catch {
      setError('Camera access denied. Please allow camera or use code join.')
      setScanning(false)
    }
  }, [joinWithParsedConfig])

  const stopScan = () => {
    scannerRef.current?.stop().catch(() => {})
    setScanning(false)
  }

  const handlePinChange = (i: number, val: string) => {
    const v = val.replace(/[^0-9A-Za-z]/g, '').toUpperCase().slice(-1)
    const next = [...pin]
    next[i] = v
    setPin(next)
    if (v && i < 5) pinRefs.current[i + 1]?.focus()
  }

  // PIN join: fetch full room config from host's signaling server
  const handlePinJoin = useCallback(async () => {
    const code = pin.join('')
    if (code.length < 6) { setError('Enter all 6 digits'); return }
    const ip = hostIp.trim()
    if (!ip) { setError('Enter the host\'s IP address (e.g. 192.168.1.42)'); return }
    setPinLoading(true)
    setError('')
    try {
      const res = await fetch(`http://${ip}:3000/join/${code}`, {
        signal: AbortSignal.timeout(6000),
      })
      if (!res.ok) {
        setError(res.status === 404
          ? 'Room not found. Double-check the code and IP.'
          : 'Could not reach the host. Make sure you\'re on the same WiFi.')
        return
      }
      const { config } = await res.json()
      joinWithParsedConfig(config)
    } catch {
      setError('Could not reach host. Check the IP address and make sure the host app is running.')
    } finally { setPinLoading(false) }
  }, [pin, hostIp, joinWithParsedConfig])

  return (
    <div className="page-center">
      <div className="setup-card">
        <div className="setup-hero">
          <div className="setup-hero-icon">🔗</div>
          <h1>Join a Room</h1>
          <p>
            {hasPreloaded
              ? `You've been invited to "${roomConfig!.roomName || 'a room'}". Enter your name to join.`
              : 'Scan the QR code or enter the 6-digit code shared by the host.'}
          </p>
        </div>

        <div className="form-group">
          <label className="form-label">YOUR NAME</label>
          <input
            className="form-input"
            placeholder="e.g. Bob"
            value={alias}
            onChange={e => setAliasLocal(e.target.value)}
            id="join-alias"
            autoFocus
            onKeyDown={e => { if (e.key === 'Enter' && hasPreloaded) handleQuickJoin() }}
          />
        </div>

        {/* ── Pre-loaded config (QR deep link) — Quick Join ── */}
        {hasPreloaded ? (
          <>
            <div style={{
              padding: '12px 14px', marginBottom: 16,
              background: 'rgba(0,229,160,0.07)',
              border: '1px solid rgba(0,229,160,0.25)',
              borderRadius: 12,
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <span style={{ fontSize: 22 }}>✅</span>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--online)', letterSpacing: '0.5px' }}>INVITE DETECTED</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
                  Room: <strong style={{ color: 'var(--text-primary)' }}>{roomConfig!.roomName}</strong>
                </div>
              </div>
            </div>
            <button
              id="btn-quick-join"
              className="btn btn-primary w-full"
              onClick={handleQuickJoin}
              disabled={!alias.trim()}
            >
              ✅ Join Room
            </button>
          </>
        ) : (
          /* ── Manual scan / PIN flow ── */
          <>
            <div className="tabs" style={{ marginBottom: 20 }}>
              <button id="tab-qr" className={`tab-btn ${tab === 'qr' ? 'active' : ''}`} onClick={() => setTab('qr')}>📷 Scan QR</button>
              <button id="tab-pin" className={`tab-btn ${tab === 'pin' ? 'active' : ''}`} onClick={() => setTab('pin')}>🔢 Enter Code</button>
            </div>

            {tab === 'qr' && (
              <>
                <div id="qr-reader" style={{ width: '100%', borderRadius: 12, overflow: 'hidden', minHeight: scanning ? 260 : 0 }} />
                {!scanning ? (
                  <button id="btn-start-scan" className="btn btn-primary w-full" onClick={startScan}>
                    📷 Open Camera &amp; Scan
                  </button>
                ) : (
                  <button id="btn-stop-scan" className="btn btn-ghost w-full mt-4" onClick={stopScan}>
                    ✕ Cancel Scan
                  </button>
                )}
              </>
            )}

            {tab === 'pin' && (
              <>
                <div style={{ marginBottom: 14 }}>
                  <div className="form-label">6-DIGIT ROOM CODE</div>
                  <div className="join-code" style={{ margin: '8px 0 0' }}>
                    {pin.map((d, i) => (
                      <input
                        key={i}
                        ref={el => { pinRefs.current[i] = el }}
                        className="join-code-digit"
                        maxLength={1}
                        value={d}
                        onChange={e => handlePinChange(i, e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Backspace' && !d && i > 0) pinRefs.current[i - 1]?.focus()
                          if (e.key === 'Enter' && pin.join('').length === 6) handlePinJoin()
                        }}
                        id={`pin-digit-${i}`}
                        autoFocus={i === 0}
                      />
                    ))}
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">HOST'S IP ADDRESS</label>
                  <input
                    className="form-input"
                    style={{ fontFamily: 'var(--font-mono)', letterSpacing: '1px' }}
                    placeholder="e.g. 192.168.1.42"
                    value={hostIp}
                    onChange={e => setHostIp(e.target.value)}
                    id="pin-host-ip"
                    onKeyDown={e => { if (e.key === 'Enter') handlePinJoin() }}
                  />
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                    Ask the room host to share their WiFi IP address
                  </div>
                </div>

                <button
                  id="btn-pin-join"
                  className="btn btn-primary w-full"
                  onClick={handlePinJoin}
                  disabled={pinLoading || pin.join('').length < 6 || !hostIp.trim()}
                >
                  {pinLoading ? '⏳ Connecting…' : '🔓 Join with Code'}
                </button>
              </>
            )}
          </>
        )}

        {error && (
          <div style={{ marginTop: 12, fontSize: 13, textAlign: 'center', color: 'var(--sos)', lineHeight: 1.5 }}>
            {error}
            {/* If error mentions a local URL, render it as a tap-able link */}
            {/http:\/\/[\d.]+:\d+\//.test(error) && (() => {
              const match = error.match(/http:\/\/[\d.]+:\d+\//)
              return match ? (
                <div style={{ marginTop: 8 }}>
                  <a
                    href={match[0]}
                    style={{
                      display: 'inline-block',
                      background: 'var(--accent)', color: 'white',
                      padding: '8px 20px', borderRadius: 20, textDecoration: 'none',
                      fontWeight: 700, fontSize: 13,
                    }}
                  >
                    👉 Open {match[0]}
                  </a>
                </div>
              ) : null
            })()}
          </div>
        )}

        <div className="divider" style={{ marginTop: 20 }}>
          <div className="divider-line" />
          <span className="divider-text">or</span>
          <div className="divider-line" />
        </div>
        <button id="btn-go-setup" className="btn btn-ghost w-full" onClick={() => { setRoomConfig(null as never); setPhase('setup') }}>
          ➕ Create a New Room Instead
        </button>
      </div>
    </div>
  )
}
