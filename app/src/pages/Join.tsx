import React, { useState, useRef, useCallback, useEffect } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { useStore } from '../store/useStore'
import { loadOrCreateIdentity, bytesToHex } from '../lib/crypto'

export default function Join() {
  const { setIdentity, setRoomConfig, setRole, setPhase, setAlias, roomConfig } = useStore()
  const [alias, setAliasLocal] = useState('')
  const [pin, setPin] = useState(['', '', '', '', '', ''])
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'qr' | 'pin'>('qr')
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const pinRefs = useRef<(HTMLInputElement | null)[]>([])

  // If a config was pre-loaded from a QR deep link, skip straight to quick-join UI
  const hasPreloaded = !!(roomConfig?.roomId && roomConfig?.cryptoSalt)

  const joinWithConfig = useCallback((configRaw: string) => {
    try {
      const config = JSON.parse(configRaw)
      if (!config.roomId || !config.seedIp || !config.cryptoSalt) throw new Error('Invalid')
      // Check expiry
      if (config.expiresAt && Date.now() > config.expiresAt) {
        setError('This QR code has expired. Ask the host to generate a new one.')
        return
      }
      const identity = loadOrCreateIdentity()
      setIdentity(identity)
      setRoomConfig(config)
      setRole('member')
      setAlias(alias.trim() || `peer-${bytesToHex(identity.publicKey).slice(0, 6)}`)
      setPhase('chat')
    } catch (e: unknown) {
      if (e instanceof Error && e.message === 'expired') return
      setError('Invalid QR code or room config.')
    }
  }, [alias])

  // Quick join using pre-loaded config (from ?join= deep link)
  const handleQuickJoin = useCallback(() => {
    if (!roomConfig || !alias.trim()) return
    if (roomConfig.expiresAt && Date.now() > roomConfig.expiresAt) {
      setError('This invite has expired. Ask the host for a new QR code.')
      return
    }
    const identity = loadOrCreateIdentity()
    setIdentity(identity)
    setRole('member')
    setAlias(alias.trim())
    setPhase('chat')
  }, [roomConfig, alias])

  const startScan = useCallback(async () => {
    setScanning(true)
    setError('')
    const scanner = new Html5Qrcode('qr-reader')
    scannerRef.current = scanner
    try {
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: 250 },
        (text) => {
          scanner.stop()
          setScanning(false)
          // Handle both deep-link URLs and legacy raw JSON
          try {
            const url = new URL(text)
            const joinParam = url.searchParams.get('join')
            if (joinParam) {
              joinWithConfig(atob(decodeURIComponent(joinParam)))
              return
            }
          } catch { /* not a URL — fall through to raw JSON */ }
          joinWithConfig(text)
        },
        () => {}
      )
    } catch { setError('Camera access denied. Use PIN instead.'); setScanning(false) }
  }, [joinWithConfig])

  const stopScan = () => {
    scannerRef.current?.stop()
    setScanning(false)
  }

  const handlePinChange = (i: number, val: string) => {
    const v = val.replace(/[^0-9A-Za-z]/g, '').toUpperCase().slice(-1)
    const next = [...pin]
    next[i] = v
    setPin(next)
    if (v && i < 5) pinRefs.current[i + 1]?.focus()
  }

  const handlePinJoin = useCallback(() => {
    const code = pin.join('')
    if (code.length < 6) { setError('Enter all 6 digits'); return }
    setError('PIN join requires the host\'s IP. Ask them to share it.')
  }, [pin])

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
                <div className="join-code">
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
                      }}
                      id={`pin-digit-${i}`}
                    />
                  ))}
                </div>
                <button id="btn-pin-join" className="btn btn-primary w-full mt-4" onClick={handlePinJoin}>
                  🔓 Join with Code
                </button>
              </>
            )}
          </>
        )}

        {error && <p style={{ color: 'var(--sos)', marginTop: 12, fontSize: 13, textAlign: 'center' }}>{error}</p>}

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
