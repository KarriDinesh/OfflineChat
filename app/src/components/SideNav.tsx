/**
 * SideNav.tsx
 * Floating side-peek navigation tab — always accessible on all pages.
 *
 * - A small vertical pill tab on the right edge of the screen
 * - Slides out a full side panel with: About, How it Works, Security, Contact
 * - Works on both mobile and desktop
 * - Closes on backdrop click or Escape key
 */
import React, { useState, useEffect, useCallback } from 'react'

const SECTIONS = [
  {
    id: 'about',
    icon: '📡',
    title: 'About OfflineConnect',
    content: (
      <>
        <p style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text-secondary)', marginBottom: 12 }}>
          <strong style={{ color: 'var(--text-primary)' }}>OfflineConnect</strong> is an offline-first, peer-to-peer encrypted mesh chat app. It lets people communicate <em>without any internet connection</em> — just a shared WiFi hotspot or LAN.
        </p>
        <p style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text-secondary)', marginBottom: 12 }}>
          Built for events, classrooms, emergency response, and anywhere connectivity fails you.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {['Offline-first', 'P2P Mesh', 'E2E Encrypted', 'No App Store', 'PWA'].map(tag => (
            <span key={tag} style={{
              fontSize: 11, fontWeight: 600, padding: '3px 10px',
              background: 'var(--accent-soft)', border: '1px solid rgba(108,99,255,0.25)',
              borderRadius: 20, color: 'var(--accent)',
            }}>{tag}</span>
          ))}
        </div>
      </>
    ),
  },
  {
    id: 'how',
    icon: '⚙️',
    title: 'How It Works',
    content: (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {[
          { step: '1', icon: '📱', title: 'Host creates a room', desc: 'Admin sets a room name, picks a purpose, and gets a QR code — all auto-configured.' },
          { step: '2', icon: '📷', title: 'Others scan the QR', desc: 'Participants scan the QR or enter the 6-digit code. No sign-up, no passwords.' },
          { step: '3', icon: '🔗', title: 'Direct peer-to-peer mesh', desc: 'WebRTC connects devices directly. Messages hop through the mesh — no server in the middle.' },
          { step: '4', icon: '🔐', title: 'Everything is encrypted', desc: 'XChaCha20-Poly1305 encrypts every message. Signed with Ed25519. Zero trust architecture.' },
        ].map(({ step, icon, title, desc }) => (
          <div key={step} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
              background: 'linear-gradient(135deg, var(--accent), #a78bfa)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, fontWeight: 700, color: 'white',
            }}>{step}</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>{icon} {title}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>{desc}</div>
            </div>
          </div>
        ))}
      </div>
    ),
  },
  {
    id: 'privacy',
    icon: '🔐',
    title: 'Privacy & Security',
    content: (
      <>
        {[
          { icon: '🚫', title: 'Zero data collection', desc: 'No accounts, no cloud storage, no analytics. Your messages never leave your local network.' },
          { icon: '🔑', title: 'End-to-end encryption', desc: 'XChaCha20-Poly1305 encrypts every payload. Room key derived locally via HKDF-SHA256.' },
          { icon: '✍️', title: 'Cryptographic signatures', desc: 'Every message is signed with Ed25519. Tampered or forged messages are silently dropped.' },
          { icon: '📴', title: 'Works completely offline', desc: 'The signaling server is only used for initial WebRTC handshake. All chat is direct P2P.' },
          { icon: '🗑️', title: 'Ephemeral by default', desc: 'No messages are stored on any server. CRDT state is local to your device only.' },
        ].map(({ icon, title, desc }) => (
          <div key={title} style={{
            display: 'flex', gap: 10, padding: '10px 0',
            borderBottom: '1px solid var(--border)',
          }}>
            <span style={{ fontSize: 20, flexShrink: 0, lineHeight: 1.2 }}>{icon}</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>{title}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>{desc}</div>
            </div>
          </div>
        ))}
      </>
    ),
  },
  {
    id: 'contact',
    icon: '📬',
    title: 'Contact & Feedback',
    content: (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          OfflineConnect is open-source and community-driven. Found a bug? Have an idea? We’d love to hear from you.
        </p>
        {[
          { icon: '⭐', label: 'Star on GitHub', href: 'https://github.com', color: '#f59e0b', desc: 'Support the project' },
          { icon: '🐛', label: 'Report a Bug', href: 'https://github.com/issues', color: '#ff3b5c', desc: 'Open an issue on GitHub' },
          { icon: '💡', label: 'Request a Feature', href: 'https://github.com/discussions', color: '#6c63ff', desc: 'Share your ideas' },
          { icon: '📧', label: 'Email Us', href: 'mailto:hello@nearchat.app', color: '#00e5a0', desc: 'hello@nearchat.app' },
        ].map(({ icon, label, href, color, desc }) => (
          <a
            key={label} href={href} target="_blank" rel="noopener noreferrer"
            style={{
              display: 'flex', gap: 12, alignItems: 'center',
              padding: '12px 14px', borderRadius: 12, textDecoration: 'none',
              background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              transition: 'border-color 0.15s ease, background 0.15s ease',
              cursor: 'pointer',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = color; (e.currentTarget as HTMLElement).style.background = `${color}12` }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.background = 'var(--bg-elevated)' }}
          >
            <span style={{
              width: 38, height: 38, borderRadius: 10, flexShrink: 0,
              background: `${color}20`, border: `1px solid ${color}40`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
            }}>{icon}</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{label}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{desc}</div>
            </div>
            <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: 14 }}>↗</span>
          </a>
        ))}

        {/* Creator credit */}
        <a
          href="https://www.dineshkarri.in"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '14px 16px', borderRadius: 14, textDecoration: 'none',
            background: 'linear-gradient(135deg, rgba(108,99,255,0.1), rgba(167,139,250,0.06))',
            border: '1px solid rgba(108,99,255,0.25)',
            transition: 'all 0.15s ease', marginTop: 4,
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'; (e.currentTarget as HTMLElement).style.background = 'var(--accent-soft)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(108,99,255,0.25)'; (e.currentTarget as HTMLElement).style.background = 'linear-gradient(135deg, rgba(108,99,255,0.1), rgba(167,139,250,0.06))' }}
        >
          <div style={{
            width: 42, height: 42, borderRadius: 12, flexShrink: 0,
            background: 'linear-gradient(135deg, var(--accent), #a78bfa)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20, boxShadow: '0 0 14px rgba(108,99,255,0.35)',
          }}>👨‍💻</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Built by Dinesh Karri</div>
            <div style={{ fontSize: 11, color: 'var(--accent)', marginTop: 2, fontWeight: 500 }}>www.dineshkarri.in ↗</div>
          </div>
        </a>

        <div style={{
          marginTop: 10, padding: '12px 14px',
          background: 'var(--bg-elevated)', borderRadius: 12, border: '1px solid var(--border)',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Version</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
            v1.0.0 · Protocol v1
          </div>
        </div>
      </div>
    ),
  },
]

export default function SideNav() {
  const [open, setOpen] = useState(false)
  const [activeSection, setActiveSection] = useState('about')

  const close = useCallback(() => setOpen(false), [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  const current = SECTIONS.find(s => s.id === activeSection) ?? SECTIONS[0]

  return (
    <>
      {/* ── Peek tab ── */}
      <div
        id="side-nav-tab"
        role="button"
        aria-label="Open info panel"
        onClick={() => setOpen(v => !v)}
        style={{
          position: 'fixed',
          right: 0,
          top: '50%',
          transform: `translateY(-50%) ${open ? 'translateX(4px)' : 'translateX(0)'}`,
          zIndex: 300,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
          width: 28,
          padding: '14px 4px',
          background: 'linear-gradient(180deg, var(--accent), #a78bfa)',
          borderRadius: '12px 0 0 12px',
          cursor: 'pointer',
          boxShadow: '-4px 0 20px rgba(108,99,255,0.35)',
          transition: 'transform 0.25s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.2s ease',
          userSelect: 'none',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = '-6px 0 28px rgba(108,99,255,0.55)' }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = '-4px 0 20px rgba(108,99,255,0.35)' }}
      >
        {/* Vertical text */}
        <span style={{
          fontSize: 10, fontWeight: 700, color: 'white', letterSpacing: '1.5px',
          writingMode: 'vertical-rl', textTransform: 'uppercase', opacity: 0.9,
        }}>
          {open ? 'Close' : 'Info'}
        </span>
        <span style={{ fontSize: 14, marginTop: 4 }}>{open ? '✕' : 'ℹ'}</span>
      </div>

      {/* ── Backdrop ── */}
      {open && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 290,
            background: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
            animation: 'fade-in 0.2s ease',
          }}
          onClick={close}
        />
      )}

      {/* ── Side panel ── */}
      <div
        style={{
          position: 'fixed',
          top: 0, right: 0, bottom: 0,
          width: 'min(360px, 92vw)',
          zIndex: 295,
          background: 'var(--bg-surface)',
          borderLeft: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.3s cubic-bezier(0.4,0,0.2,1)',
          boxShadow: open ? '-8px 0 40px rgba(0,0,0,0.5)' : 'none',
          paddingTop: 'var(--sat)',
        }}
      >
        {/* Panel header */}
        <div style={{
          padding: '18px 20px 12px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'rgba(17,17,31,0.9)',
          backdropFilter: 'blur(20px)',
          flexShrink: 0,
        }}>
          <div style={{
            width: 36, height: 36,
            background: 'linear-gradient(135deg, var(--accent), #a78bfa)',
            borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18,
          }}>📡</div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>OfflineConnect</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Offline · Encrypted · P2P</div>
          </div>
          <button
            onClick={close}
            aria-label="Close panel"
            style={{
              marginLeft: 'auto', background: 'var(--bg-elevated)',
              border: '1px solid var(--border)', borderRadius: 8,
              color: 'var(--text-muted)', width: 32, height: 32,
              fontSize: 16, cursor: 'pointer', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
            }}
          >✕</button>
        </div>

        {/* Section tabs */}
        <div style={{
          display: 'flex', gap: 0,
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-elevated)',
          flexShrink: 0, overflowX: 'auto',
        }}>
          {SECTIONS.map(s => (
            <button
              key={s.id}
              id={`side-nav-${s.id}`}
              onClick={() => setActiveSection(s.id)}
              style={{
                flex: 1, minWidth: 60,
                padding: '10px 6px 8px',
                border: 'none', borderBottom: `2px solid ${activeSection === s.id ? 'var(--accent)' : 'transparent'}`,
                background: 'transparent',
                color: activeSection === s.id ? 'var(--accent)' : 'var(--text-muted)',
                fontSize: 10, fontWeight: 700, letterSpacing: '0.5px',
                textTransform: 'uppercase', cursor: 'pointer',
                transition: 'all 0.15s ease',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                fontFamily: 'var(--font-ui)',
              }}
            >
              <span style={{ fontSize: 18 }}>{s.icon}</span>
              <span style={{ whiteSpace: 'nowrap' }}>{s.title.split(' ')[0]}</span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{
          flex: 1, overflowY: 'auto', padding: '20px',
          WebkitOverflowScrolling: 'touch' as any,
        }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>{current.icon}</span> {current.title}
          </div>
          <div key={activeSection} style={{ animation: 'page-slide-in 0.25s ease' }}>
            {current.content}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '10px 20px',
          paddingBottom: 'calc(10px + env(safe-area-inset-bottom, 0px))',
          borderTop: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          background: 'var(--bg-elevated)',
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Made with ❤️ for offline communities</span>
          <a
            href="https://www.dineshkarri.in"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: 11, fontWeight: 700, color: 'var(--accent)',
              textDecoration: 'none', whiteSpace: 'nowrap',
              padding: '3px 8px', background: 'var(--accent-soft)',
              border: '1px solid rgba(108,99,255,0.2)', borderRadius: 8,
              transition: 'opacity 0.15s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '0.75' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '1' }}
          >
            @dineshkarri.in
          </a>
        </div>
      </div>
    </>
  )
}
