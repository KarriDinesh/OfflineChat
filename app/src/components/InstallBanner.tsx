/**
 * InstallBanner.tsx
 * Always-visible install entry point:
 * - Android/Chrome: native beforeinstallprompt
 * - iOS Safari: 3-step bottom sheet guide
 * - Dev/Other: shows manual instructions modal
 *
 * Important: does NOT hide unless already running as installed PWA.
 */
import React, { useState } from 'react'
import { useInstallPrompt } from '../hooks/useInstallPrompt'

export default function InstallBanner() {
  const { canInstall, isIOS, isStandalone, triggerInstall } = useInstallPrompt()
  const [showGuide, setShowGuide] = useState(false)
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem('nc_install_dismissed') === '1'
  )
  const [installed, setInstalled] = useState(false)

  // Already running as PWA — no banner needed
  if (isStandalone || installed) return null
  if (dismissed) return null

  const handleInstall = async () => {
    if (canInstall) {
      const result = await triggerInstall()
      if (result === 'accepted') setInstalled(true)
    } else {
      setShowGuide(true)
    }
  }

  const dismiss = () => {
    localStorage.setItem('nc_install_dismissed', '1')
    setDismissed(true)
  }

  const isDesktop = !isIOS && window.innerWidth > 768

  return (
    <>
      {/* ── Install bar ── */}
      <div
        id="install-banner"
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0, right: 0,
          zIndex: 200,
          padding: '12px 16px',
          paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))',
          background: 'rgba(17,17,31,0.97)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          borderTop: '1px solid rgba(108,99,255,0.3)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          animation: 'slide-up-banner 0.4s cubic-bezier(0.34,1.56,0.64,1)',
        }}
      >
        {/* App icon */}
        <div style={{
          width: 44, height: 44, flexShrink: 0,
          background: 'linear-gradient(135deg, #6c63ff, #a78bfa)',
          borderRadius: 12,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 22,
          boxShadow: '0 0 16px rgba(108,99,255,0.4)',
        }}>📡</div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Install OfflineConnect
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>
            {canInstall ? 'Add to home screen · Works offline'
              : isIOS ? 'Use Safari → Share → Add to Home Screen'
              : 'Works offline after install · No app store'}
          </div>
        </div>

        <button
          id="btn-install-app"
          onClick={handleInstall}
          style={{
            flexShrink: 0,
            background: 'linear-gradient(135deg, #6c63ff, #a78bfa)',
            color: 'white', border: 'none',
            borderRadius: 22, padding: '9px 18px',
            fontSize: 13, fontWeight: 700,
            cursor: 'pointer',
            boxShadow: '0 2px 12px rgba(108,99,255,0.5)',
            whiteSpace: 'nowrap',
          }}
        >
          {canInstall ? '⬇ Install' : isIOS ? 'How?' : '📋 How to'}
        </button>

        <button
          onClick={dismiss}
          aria-label="Dismiss install prompt"
          style={{
            flexShrink: 0,
            background: 'none', border: 'none',
            color: 'var(--text-muted)', fontSize: 20,
            cursor: 'pointer', padding: '4px 2px',
            lineHeight: 1,
          }}
        >×</button>
      </div>

      {/* ── Guide modal (iOS + fallback) ── */}
      {showGuide && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 400,
            background: 'rgba(0,0,0,0.75)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'flex-end',
            animation: 'fade-in 0.2s ease',
          }}
          onClick={() => setShowGuide(false)}
        >
          <div
            style={{
              background: 'var(--bg-surface)',
              borderRadius: '24px 24px 0 0',
              padding: '0 24px',
              paddingBottom: 'calc(24px + env(safe-area-inset-bottom, 0px))',
              width: '100%',
              animation: 'slide-up 0.35s cubic-bezier(0.34,1.56,0.64,1)',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Drag handle */}
            <div style={{ padding: '14px 0 20px', display: 'flex', justifyContent: 'center' }}>
              <div style={{ width: 36, height: 4, background: 'var(--border)', borderRadius: 2 }} />
            </div>

            {/* Header */}
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div style={{
                width: 64, height: 64, margin: '0 auto 12px',
                background: 'linear-gradient(135deg, #6c63ff, #a78bfa)',
                borderRadius: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 32, boxShadow: '0 0 20px rgba(108,99,255,0.4)',
              }}>📡</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>Install OfflineConnect</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
                Works offline · No app store · Instant access
              </div>
            </div>

            {/* Steps — iOS or desktop */}
            {isIOS ? (
              <>
                {[
                  { icon: '⬆️', title: 'Tap the Share button', sub: 'The box-with-arrow at the bottom of Safari' },
                  { icon: '➕', title: 'Add to Home Screen', sub: 'Scroll down and tap this option' },
                  { icon: '✅', title: 'Tap "Add"', sub: 'NearChat appears on your home screen' },
                ].map((step, i) => (
                  <div key={i} style={{
                    display: 'flex', gap: 14, padding: '14px 0',
                    borderBottom: i < 2 ? '1px solid var(--border)' : 'none',
                  }}>
                    <span style={{ fontSize: 26, width: 32, textAlign: 'center', flexShrink: 0 }}>{step.icon}</span>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 600 }}>{step.title}</div>
                      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>{step.sub}</div>
                    </div>
                  </div>
                ))}
              </>
            ) : (
              <>
                {[
                  { icon: '🌐', title: isDesktop ? 'Click the install icon' : 'Open in Chrome/Edge', sub: isDesktop ? 'Look for ⊕ or ↓ in the browser address bar' : 'Install works best in Chrome or Edge browser' },
                  { icon: '⬇', title: 'Tap "Install" or "Add"', sub: 'The browser will prompt you to install NearChat' },
                  { icon: '📱', title: 'Launch from home screen', sub: 'NearChat runs offline, like a native app' },
                ].map((step, i) => (
                  <div key={i} style={{
                    display: 'flex', gap: 14, padding: '14px 0',
                    borderBottom: i < 2 ? '1px solid var(--border)' : 'none',
                  }}>
                    <span style={{ fontSize: 26, width: 32, textAlign: 'center', flexShrink: 0 }}>{step.icon}</span>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 600 }}>{step.title}</div>
                      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>{step.sub}</div>
                    </div>
                  </div>
                ))}
              </>
            )}

            <button
              style={{
                width: '100%', marginTop: 20,
                padding: '15px', border: 'none', borderRadius: 14,
                background: 'linear-gradient(135deg, #6c63ff, #a78bfa)',
                color: 'white', fontSize: 16, fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 4px 16px rgba(108,99,255,0.4)',
              }}
              onClick={() => setShowGuide(false)}
            >
              Got it!
            </button>
          </div>
        </div>
      )}
    </>
  )
}
