import React, { useState, useRef, useCallback } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { useStore } from '../store/useStore'
import { loadOrCreateIdentity, deriveKeyFromPin, hexToBytes, bytesToHex, randomSalt } from '../lib/crypto'

export default function Join() {
  const { setIdentity, setRoomConfig, setRole, setPhase, setAlias } = useStore()
  const [alias, setAliasLocal] = useState('')
  const [pin, setPin] = useState(['', '', '', '', '', ''])
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'qr' | 'pin'>('qr')
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const pinRefs = useRef<(HTMLInputElement | null)[]>([])

  const joinWithConfig = useCallback((configRaw: string) => {
    try {
      const config = JSON.parse(configRaw)
      if (!config.roomId || !config.seedIp || !config.cryptoSalt) throw new Error('Invalid')
      const identity = loadOrCreateIdentity()
      setIdentity(identity)
      setRoomConfig(config)
      setRole('member')
      setAlias(alias.trim() || `peer-${bytesToHex(identity.publicKey).slice(0, 6)}`)
      setPhase('chat')
    } catch { setError('Invalid QR code or room config.') }
  }, [alias])

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
    // Derive a key from pin — actual room config must be broadcast separately
    // For now, prompt user to also input the signaling IP
    setError('PIN join requires the host\'s IP. Ask them to share it.')
  }, [pin])

  return (
    <div className="page-center">
      <div className="setup-card">
        <div className="setup-hero">
          <div className="setup-hero-icon">🔗</div>
          <h1>Join a Room</h1>
          <p>Scan the QR code or enter the 6-digit code shared by the host.</p>
        </div>

        <div className="form-group">
          <label className="form-label">YOUR NAME</label>
          <input
            className="form-input"
            placeholder="e.g. Bob"
            value={alias}
            onChange={e => setAliasLocal(e.target.value)}
            id="join-alias"
          />
        </div>

        <div className="tabs" style={{ marginBottom: 20 }}>
          <button id="tab-qr" className={`tab-btn ${tab === 'qr' ? 'active' : ''}`} onClick={() => setTab('qr')}>📷 Scan QR</button>
          <button id="tab-pin" className={`tab-btn ${tab === 'pin' ? 'active' : ''}`} onClick={() => setTab('pin')}>🔢 Enter Code</button>
        </div>

        {tab === 'qr' && (
          <>
            <div id="qr-reader" style={{ width: '100%', borderRadius: 12, overflow: 'hidden', minHeight: scanning ? 260 : 0 }} />
            {!scanning ? (
              <button id="btn-start-scan" className="btn btn-primary w-full" onClick={startScan}>
                📷 Open Camera & Scan
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

        {error && <p style={{ color: 'var(--sos)', marginTop: 12, fontSize: 13, textAlign: 'center' }}>{error}</p>}

        <div className="divider" style={{ marginTop: 20 }}>
          <div className="divider-line" />
          <span className="divider-text">or</span>
          <div className="divider-line" />
        </div>
        <button id="btn-go-setup" className="btn btn-ghost w-full" onClick={() => setPhase('setup')}>
          ➕ Create a New Room Instead
        </button>
      </div>
    </div>
  )
}
