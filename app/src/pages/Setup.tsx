import React, { useState, useCallback, useEffect } from 'react'
import QRCode from 'qrcode'
import { useStore, PURPOSE_META, type RoomPurpose } from '../store/useStore'
import { generateIdentity, randomSalt, bytesToHex } from '../lib/crypto'
import { issueToken, saveToken } from '../lib/roles'
import { v4 as uuid } from 'uuid'

async function detectLanIP(): Promise<string> {
  const host = window.location.hostname
  // Already running on a LAN IP — use it directly
  if (host && host !== 'localhost' && host !== '127.0.0.1' && /^\d+\.\d+\.\d+\.\d+$/.test(host)) return host
  // Running on a named host (e.g. github.io) — can't auto-detect, ask user
  if (host && !/^(localhost|127\.0\.0\.1)$/.test(host)) return ''
  try {
    const res = await fetch(`http://127.0.0.1:3000/config`, { signal: AbortSignal.timeout(1500) })
    if (res.ok) { const d = await res.json(); if (d.lanIp) return d.lanIp }
  } catch {}
  return new Promise((resolve) => {
    const pc = new RTCPeerConnection({ iceServers: [] })
    const t = setTimeout(() => { pc.close(); resolve('') }, 2000)
    pc.createDataChannel('')
    pc.createOffer().then(o => pc.setLocalDescription(o))
    pc.onicecandidate = (e) => {
      if (!e.candidate) return
      const m = /(\d+\.\d+\.\d+\.\d+)/.exec(e.candidate.candidate)
      if (m && m[1] !== '127.0.0.1') { clearTimeout(t); pc.close(); resolve(m[1]) }
    }
  })
}

const PURPOSES = Object.entries(PURPOSE_META) as [RoomPurpose, typeof PURPOSE_META[RoomPurpose]][]

export default function Setup() {
  const { setIdentity, setRoomConfig, setRole, setPhase, setAlias, setQuietMode } = useStore()
  const [alias, setAliasLocal] = useState('')
  const [roomName, setRoomName] = useState('')
  const [purpose, setPurpose] = useState<RoomPurpose>('event')
  const [expiryMinutes, setExpiryMinutes] = useState(30)  // QR expiry
  const [memberCap, setMemberCap] = useState(0)           // 0 = unlimited
  const [step, setStep] = useState<'identity' | 'purpose' | 'done'>('identity')
  const [detectedIp, setDetectedIp] = useState<string>('')
  const [ipStatus, setIpStatus] = useState<'detecting' | 'found' | 'manual'>('detecting')
  const [manualIp, setManualIp] = useState('')
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [joinCode, setJoinCode] = useState('')
  const [expiresAt, setExpiresAt] = useState<number>(0)
  const [now, setNow] = useState(Date.now())

  // Countdown ticker
  useEffect(() => {
    if (!expiresAt) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [expiresAt])

  useEffect(() => {
    detectLanIP().then(ip => {
      if (ip) {
        setDetectedIp(ip)
        setIpStatus('found')
      } else {
        setIpStatus('manual')
      }
    })
  }, [])

  const effectiveIp = ipStatus === 'manual' ? manualIp : detectedIp

  const handleCreate = useCallback(async () => {
    if (!alias.trim() || !effectiveIp) return
    setLoading(true)
    try {
      const identity = generateIdentity()
      const salt = randomSalt()
      const roomId = uuid()
      const saltHex = bytesToHex(salt)
      const adminPub = bytesToHex(identity.publicKey)

      const expiresAtMs = Date.now() + expiryMinutes * 60 * 1000
      const config = {
        roomId, seedIp: effectiveIp.trim(),
        cryptoSalt: saltHex, adminPub, protocolV: 1,
        purpose, roomName: roomName.trim() || `${PURPOSE_META[purpose].label} Room`,
        expiresAt: expiresAtMs,
        memberCap,
      }

      const token = issueToken(identity.privateKey, adminPub, 'admin', roomId)
      saveToken(token)
      setIdentity(identity)
      setRoomConfig(config)
      setRole('admin')
      setAlias(alias.trim())
      // Apply purpose defaults
      setQuietMode(PURPOSE_META[purpose].defaultQuietMode)

      const url = await QRCode.toDataURL(JSON.stringify(config), {
        errorCorrectionLevel: 'M', width: 256, margin: 2,
        color: { dark: '#0a0a14', light: '#ffffff' },
      })
      setQrDataUrl(url)
      setJoinCode(roomId.replace(/-/g, '').slice(0, 6).toUpperCase())
      setExpiresAt(expiresAt || Date.now() + expiryMinutes * 60 * 1000)
      setStep('done')

      fetch(`http://${effectiveIp.trim()}:3000/room`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      }).catch(() => {})
    } finally { setLoading(false) }
  }, [alias, roomName, purpose, effectiveIp])

  return (
    <div className="page-center">
      <div className="setup-card">
        <div className="setup-hero">
          <div className="setup-hero-icon">📡</div>
          <h1>Create a Room</h1>
          <p>Start a private offline mesh network.<br />Share the QR with participants.</p>
        </div>

        {/* ── Step 1: Identity ── */}
        {step === 'identity' && (
          <>
            <div className="form-group">
              <label className="form-label">YOUR NAME</label>
              <input className="form-input" placeholder="e.g. Alice" value={alias}
                onChange={e => setAliasLocal(e.target.value)} id="setup-alias" autoFocus />
            </div>

            <div className="form-group">
              <label className="form-label">ROOM NAME (optional)</label>
              <input className="form-input" placeholder={`e.g. Annual Tech Meetup`} value={roomName}
                onChange={e => setRoomName(e.target.value)} id="setup-room-name" />
            </div>

            {/* IP detection */}
            <div style={{
              padding: '12px 14px', background: 'var(--bg-elevated)',
              border: `1px solid ${ipStatus === 'found' ? 'rgba(0,229,160,0.25)' : 'var(--border)'}`,
              borderRadius: 'var(--radius-sm)', marginBottom: 16,
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              {ipStatus === 'detecting' && <>
                <span style={{ fontSize: 18 }}>🔍</span>
                <div><div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>DETECTING NETWORK…</div></div>
              </>}
              {ipStatus === 'found' && <>
                <span style={{ fontSize: 18 }}>✅</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--online)' }}>NETWORK DETECTED</div>
                  <div style={{ fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', marginTop: 2 }}>{detectedIp}</div>
                </div>
                <button style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer' }}
                  onClick={() => setIpStatus('manual')}>change</button>
              </>}
              {ipStatus === 'manual' && <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 5 }}>LAN IP</div>
                <input className="form-input font-mono" placeholder="192.168.1.x"
                  value={manualIp} onChange={e => setManualIp(e.target.value)} id="setup-ip-manual" />
              </div>}
            </div>

            <button className="btn btn-primary w-full" id="btn-next-purpose"
              disabled={!alias.trim() || (ipStatus === 'manual' && !manualIp.trim())}
              onClick={() => setStep('purpose')}>
              {ipStatus === 'detecting' ? '⏳ Detecting network…' : 'Next — Choose Room Type →'}
            </button>

            <div className="divider"><div className="divider-line" /><span className="divider-text">already have a room?</span><div className="divider-line" /></div>
            <button id="btn-go-join" className="btn btn-ghost w-full" onClick={() => setPhase('join')}>
              📷 &nbsp;Scan QR / Enter Code to Join
            </button>
          </>
        )}

        {/* ── Step 2: Room Purpose ── */}
        {step === 'purpose' && (
          <>
            <button onClick={() => setStep('identity')} style={{
              background: 'none', border: 'none', color: 'var(--text-muted)',
              fontSize: 13, cursor: 'pointer', marginBottom: 12, padding: 0, display: 'flex', alignItems: 'center', gap: 4,
            }}>← Back</button>

            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 12 }}>
              What's this room for?
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
              {PURPOSES.map(([id, meta]) => {
                const isSelected = purpose === id
                const features = meta.features
                return (
                  <button
                    key={id}
                    id={`purpose-${id}`}
                    onClick={() => setPurpose(id)}
                    style={{
                      display: 'flex', alignItems: 'flex-start', gap: 12,
                      padding: '12px 14px',
                      background: isSelected ? 'var(--accent-soft)' : 'var(--bg-elevated)',
                      border: `1.5px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                      borderRadius: 12, cursor: 'pointer', textAlign: 'left',
                      transition: 'all 0.15s ease',
                      boxShadow: isSelected ? '0 0 0 3px var(--accent-soft)' : 'none',
                    }}
                  >
                    <span style={{ fontSize: 26, lineHeight: 1, flexShrink: 0 }}>{meta.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: isSelected ? 'var(--accent)' : 'var(--text-primary)' }}>
                        {meta.label}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{meta.description}</div>
                      {isSelected && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
                          {features.includes('raise_hand') && <FeaturePill icon="✋" label="Raise Hand" />}
                          {features.includes('quiet_mode') && <FeaturePill icon="🔇" label="Quiet Mode" />}
                          {features.includes('announce')   && <FeaturePill icon="📌" label="Announcements" />}
                          {features.includes('sos_first')  && <FeaturePill icon="🚨" label="SOS First" />}
                          {features.includes('promote')    && <FeaturePill icon="👑" label="Promote Peers" />}
                        </div>
                      )}
                    </div>
                    {isSelected && (
                      <span style={{ color: 'var(--accent)', fontSize: 18, flexShrink: 0 }}>✓</span>
                    )}
                  </button>
                )
              })}
            </div>

            {/* ── Security controls ── */}
            <div style={{
              padding: '14px', marginBottom: 16,
              background: 'var(--bg-elevated)', borderRadius: 12,
              border: '1px solid var(--border)',
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 12 }}>
                🔒 Access Controls
              </div>

              {/* QR Expiry */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>⏱ QR Expires in</span>
                  <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--accent)', fontWeight: 700 }}>
                    {expiryMinutes} min
                  </span>
                </div>
                <input type="range" min={5} max={120} step={5} value={expiryMinutes}
                  onChange={e => setExpiryMinutes(Number(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--accent)', cursor: 'pointer' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                  <span>5 min</span><span>120 min</span>
                </div>
              </div>

              {/* Member Cap */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>👥 Max Participants</span>
                  <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--accent)', fontWeight: 700 }}>
                    {memberCap === 0 ? 'Unlimited' : memberCap}
                  </span>
                </div>
                <input type="range" min={0} max={200} step={10} value={memberCap}
                  onChange={e => setMemberCap(Number(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--accent)', cursor: 'pointer' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                  <span>Unlimited</span><span>200</span>
                </div>
              </div>
            </div>

            <button className="btn btn-primary w-full" id="btn-create-room"
              onClick={handleCreate} disabled={loading}>
              {loading ? '⏳ Creating…' : `${PURPOSE_META[purpose].icon} Create ${PURPOSE_META[purpose].label} Room`}
            </button>
          </>
        )}

        {/* ── Step 3: QR Code ── */}
        {step === 'done' && qrDataUrl && (() => {
          const msLeft = expiresAt - now
          const expired = msLeft <= 0
          const minsLeft = Math.floor(msLeft / 60000)
          const secsLeft = Math.floor((msLeft % 60000) / 1000)
          const isUrgent = msLeft < 5 * 60 * 1000 // < 5 min

          return (
            <div style={{ textAlign: 'center' }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 12,
                padding: '6px 14px', background: 'var(--accent-soft)',
                border: '1px solid rgba(108,99,255,0.25)', borderRadius: 20,
              }}>
                <span>{PURPOSE_META[purpose].icon}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)' }}>
                  {roomName || PURPOSE_META[purpose].label}
                </span>
                {memberCap > 0 && (
                  <span style={{
                    fontSize: 11, padding: '2px 8px', borderRadius: 10,
                    background: 'rgba(108,99,255,0.2)', color: 'var(--accent)', fontWeight: 700,
                  }}>👥 max {memberCap}</span>
                )}
              </div>

              {/* Countdown */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                marginBottom: 12, padding: '8px 16px', borderRadius: 12,
                background: expired ? 'rgba(255,59,92,0.12)'
                  : isUrgent ? 'rgba(245,158,11,0.12)'
                  : 'var(--bg-elevated)',
                border: `1px solid ${expired ? 'rgba(255,59,92,0.3)'
                  : isUrgent ? 'rgba(245,158,11,0.3)'
                  : 'var(--border)'}`,
              }}>
                <span style={{ fontSize: 16 }}>{expired ? '🔴' : isUrgent ? '⚠️' : '⏱'}</span>
                <span style={{
                  fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-mono)',
                  color: expired ? 'var(--sos)' : isUrgent ? '#f59e0b' : 'var(--text-primary)',
                }}>
                  {expired ? 'QR EXPIRED' : `${minsLeft}m ${secsLeft.toString().padStart(2,'0')}s remaining`}
                </span>
              </div>

              {expired ? (
                <div style={{
                  padding: '20px', background: 'rgba(255,59,92,0.08)',
                  border: '1px solid rgba(255,59,92,0.25)', borderRadius: 12, marginBottom: 16,
                }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>🔴</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--sos)' }}>QR Code Expired</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                    No new participants can join with this QR.
                  </div>
                  <button className="btn btn-ghost w-full" style={{ marginTop: 12 }}
                    onClick={() => { setStep('purpose'); setQrDataUrl(null) }}>
                    🔄 Generate New QR
                  </button>
                </div>
              ) : (
                <>
                  <p className="text-sm text-muted" style={{ marginBottom: 10 }}>
                    Share this QR — participants scan to auto-join
                  </p>
                  <div className="qr-wrapper">
                    <img src={qrDataUrl} alt="Room QR Code" width={220} height={220} />
                  </div>
                </>
              )}

              <div className="divider"><div className="divider-line" /><span className="divider-text">or 6-digit code</span><div className="divider-line" /></div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 16 }}>
                {joinCode.split('').map((d, i) => (
                  <div key={i} style={{
                    width: 44, height: 54, background: 'var(--bg-elevated)',
                    border: '2px solid var(--accent)', borderRadius: 8,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 700, color: 'var(--accent)',
                    opacity: expired ? 0.4 : 1,
                  }}>{d}</div>
                ))}
              </div>

              <button id="btn-enter-chat" className="btn btn-primary w-full" onClick={() => setPhase('chat')}>
                ✅ Open Chat as Admin
              </button>
            </div>
          )
        })()}
      </div>
    </div>
  )
}

function FeaturePill({ icon, label }: { icon: string; label: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 9px', borderRadius: 20,
      background: 'rgba(108,99,255,0.2)', border: '1px solid rgba(108,99,255,0.25)',
      fontSize: 11, fontWeight: 600, color: 'var(--accent)',
    }}>
      {icon} {label}
    </span>
  )
}
