import React, { useState, useEffect, useRef, useCallback, memo } from 'react'
import { useStore, PURPOSE_META } from '../store/useStore'
import { useP2P } from '../hooks/useP2P'
import { observeChannel, initCRDT } from '../lib/crdt'
import { canAccess } from '../lib/roles'
import { sosvibrate } from '../lib/platform'
import { getPeerScore } from '../lib/linkquality'
import SignalBars from '../components/SignalBars'
import type { ChatMessage } from '../lib/crdt'
import type { Channel } from '../lib/roles'

const CHANNELS: { id: Channel; label: string; icon: string }[] = [
  { id: 'general',   label: 'General',   icon: '💬' },
  { id: 'emergency', label: 'Emergency', icon: '🚨' },
  { id: 'speakers',  label: 'Speakers',  icon: '🎤' },
  { id: 'admin',     label: 'Admin',     icon: '🔐' },
]

const PEER_COLORS = ['#6c63ff','#00e5a0','#f59e0b','#e879f9','#38bdf8','#fb923c']
function peerColor(id: string) { return PEER_COLORS[id.charCodeAt(0) % PEER_COLORS.length] }

const MessageItem = memo(({ msg, myId }: { msg: ChatMessage; myId: string }) => {
  const isOwn = msg.from === myId
  const isSOS = msg.type === 'sos'
  const time = new Date(msg.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: isOwn ? 'flex-end' : 'flex-start', marginBottom: 6 }}>
      {!isOwn && (
        <div className="message-author">
          <span style={{ color: peerColor(msg.from) }}>{msg.alias}</span>
          <span className="msg-time">{time}</span>
        </div>
      )}
      <div className={`message-bubble${isOwn ? ' own' : ''}${isSOS ? ' sos' : ''}`}>
        {isSOS && <span style={{ marginRight: 6 }}>🚨</span>}
        {msg.deleted ? <em style={{ opacity: 0.5 }}>[deleted]</em> : msg.text}
        {isOwn && <span style={{ fontSize: 10, opacity: 0.7, marginLeft: 8 }}>{time}</span>}
      </div>
    </div>
  )
})

export default function Chat() {
  const {
    identity, role, activeChannel, setActiveChannel, peers, connected,
    sosAlert, setSOSAlert, alias, roomConfig,
    pinnedAnnouncement, setPinnedAnnouncement,
    raisedHands, raiseHand, lowerHand,
    quietMode, setQuietMode,
    roomLocked, setRoomLocked,
  } = useStore()

  const { sendMessage, linkStats } = useP2P()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [showAdminPanel, setShowAdminPanel] = useState(false)
  const [announceText, setAnnounceText] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const myId = identity ? Array.from(identity.publicKey).map(b => b.toString(16).padStart(2,'0')).join('') : ''
  const isAdmin = role === 'admin'
  const isSpeaker = role === 'speaker' || role === 'admin'
  const purpose = roomConfig?.purpose ?? 'team'
  const purposeMeta = PURPOSE_META[purpose]
  const features = purposeMeta.features

  // Can this user send in current channel?
  const canSend = !quietMode
    || activeChannel !== 'general'
    || isSpeaker

  useEffect(() => {
    let unobserve: (() => void) | null = null
    const roomId = roomConfig?.roomId ?? 'default'
    initCRDT(roomId).then(() => {
      unobserve = observeChannel(activeChannel, setMessages)
    })
    return () => unobserve?.()
  }, [activeChannel, roomConfig])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = useCallback(() => {
    const text = draft.trim()
    if (!text || !canSend) return
    sendMessage(text, activeChannel)
    setDraft('')
    textareaRef.current?.focus()
  }, [draft, activeChannel, sendMessage, canSend])

  const handleSOS = useCallback(() => {
    const text = `🚨 SOS from ${alias || 'Unknown'} — EMERGENCY`
    sendMessage(text, 'emergency', true)
    sosvibrate()
  }, [alias, sendMessage])

  const handleAnnounce = useCallback(() => {
    const text = announceText.trim()
    if (!text) return
    setPinnedAnnouncement(text)
    sendMessage(`📌 ${text}`, 'general')
    setAnnounceText('')
    setShowAdminPanel(false)
  }, [announceText, setPinnedAnnouncement, sendMessage])

  const handleRaiseHand = useCallback(() => {
    raiseHand(myId)
    sendMessage(`✋ ${alias} raised their hand`, 'general')
  }, [myId, alias, raiseHand, sendMessage])

  const handleApproveHand = useCallback((peerId: string) => {
    lowerHand(peerId)
    const peer = peers.get(peerId)
    sendMessage(`👑 ${peer?.alias ?? peerId.slice(0, 8)} has been given the floor`, 'general')
  }, [lowerHand, peers, sendMessage])

  const accessibleChannels = CHANNELS.filter(c => canAccess(role, c.id))
  const currentChannel = CHANNELS.find(c => c.id === activeChannel)
  const myHandRaised = raisedHands.includes(myId)

  return (
    <div className="app-layout page-enter">

      {/* ── Topbar ── */}
      <header className="topbar">
        <div className="topbar-logo">
          <div className="logo-icon">📡</div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ lineHeight: 1 }}>OfflineConnect</span>
            {roomConfig?.roomName && (
              <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 400 }}>{roomConfig.roomName}</span>
            )}
          </div>
        </div>
        {purposeMeta && (
          <span className="topbar-purpose" style={{
            fontSize: 11, color: 'var(--text-muted)', padding: '3px 8px',
            background: 'var(--bg-elevated)', borderRadius: 10, border: '1px solid var(--border)',
            whiteSpace: 'nowrap', flexShrink: 0,
          }}>
            {purposeMeta.icon} {purposeMeta.label}
          </span>
        )}
        <div className="topbar-spacer" />
        {quietMode && (
          <span className="topbar-quiet" style={{ fontSize: 12, color: 'var(--sos)', background: 'var(--sos-soft)', padding: '3px 10px', borderRadius: 10, border: '1px solid rgba(255,59,92,0.2)', flexShrink: 0, whiteSpace: 'nowrap' }}>
            🔇 Quiet
          </span>
        )}
        {isAdmin && (
          <button
            id="btn-admin-panel"
            onClick={() => setShowAdminPanel(v => !v)}
            style={{
              background: showAdminPanel ? 'var(--accent-soft)' : 'var(--bg-elevated)',
              border: `1px solid ${showAdminPanel ? 'var(--accent)' : 'var(--border)'}`,
              color: showAdminPanel ? 'var(--accent)' : 'var(--text-secondary)',
              borderRadius: 8, padding: '6px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              flexShrink: 0, whiteSpace: 'nowrap',
            }}
          >
            ⚙️ Admin
          </button>
        )}
        <button id="btn-sos-top" className="btn btn-sos" onClick={handleSOS}
          style={{ padding: '6px 10px', fontSize: 13, flexShrink: 0 }}>🚨</button>
        <div className="peer-badge" style={{ marginLeft: 2 }}>
          {peers.size}p
        </div>
        <span className={`status-dot ${connected ? 'online' : 'offline'}`} style={{ marginLeft: 4, flexShrink: 0 }} />
      </header>

      {/* ── Sidebar (desktop) ── */}
      <aside className="sidebar">
        <div className="sidebar-section">
          <div className="sidebar-label">Channels</div>
          {accessibleChannels.map(ch => (
            <div key={ch.id} id={`channel-${ch.id}`}
              className={`channel-item${activeChannel === ch.id ? ' active' : ''}${ch.id === 'emergency' ? ' emergency' : ''}`}
              onClick={() => setActiveChannel(ch.id)}>
              <span className="channel-icon">{ch.icon}</span>{ch.label}
            </div>
          ))}
        </div>

        <div className="sidebar-label" style={{ padding: '12px 20px 6px' }}>Peers ({peers.size})</div>
        <div className="peer-list">
          <div className="peer-item">
            <div className="peer-avatar" style={{ background: peerColor(myId) }}>
              {(alias || 'Me').charAt(0).toUpperCase()}
            </div>
            <span style={{ fontSize: 13, flex: 1 }}>{alias || 'Me'} <span style={{ color: 'var(--accent)', fontSize: 11 }}>(you)</span></span>
            <span className="status-dot online" />
          </div>
          {[...peers.values()].map(p => (
            <div key={p.id} className="peer-item">
              <div className="peer-avatar" style={{ background: peerColor(p.id) }}>
                {p.alias.charAt(0).toUpperCase()}
              </div>
              <span style={{ fontSize: 13, flex: 1 }}>{p.alias}</span>
              {raisedHands.includes(p.id) && <span title="Hand raised" style={{ fontSize: 14 }}>✋</span>}
              <SignalBars score={getPeerScore(p.id)} size={14} />
            </div>
          ))}
        </div>

        <div style={{ marginTop: 'auto', padding: '12px 16px' }}>
          <div style={{ padding: '10px 12px', background: 'var(--bg-elevated)', borderRadius: 10, border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>ROLE</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)', textTransform: 'capitalize' }}>{role}</div>
          </div>
        </div>
      </aside>

      {/* ── Main chat ── */}
      <main className="chat-main">
        <div className="chat-header">
          <span style={{ fontSize: 22 }}>{currentChannel?.icon}</span>
          <div>
            <div className="chat-title">{currentChannel?.label}</div>
            <div className="chat-subtitle">{messages.length} msgs · E2EE · mesh</div>
          </div>
        </div>

        {/* Pinned announcement */}
        {pinnedAnnouncement && (
          <div style={{
            margin: '0 12px 0', padding: '10px 14px',
            background: 'linear-gradient(135deg, rgba(108,99,255,0.12), rgba(167,139,250,0.08))',
            border: '1px solid rgba(108,99,255,0.25)',
            borderRadius: 10, display: 'flex', alignItems: 'flex-start', gap: 8,
            animation: 'msg-in 0.3s ease',
          }}>
            <span style={{ fontSize: 16, flexShrink: 0 }}>📌</span>
            <div style={{ flex: 1, fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.4 }}>
              {pinnedAnnouncement}
            </div>
            {isAdmin && (
              <button onClick={() => setPinnedAnnouncement(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16, padding: 0 }}>×</button>
            )}
          </div>
        )}

        <div className="messages-container" id="messages-container">
          {messages.length === 0 && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, opacity: 0.45, marginTop: 60 }}>
              <div style={{ fontSize: 52 }}>{currentChannel?.icon}</div>
              <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>No messages yet. Say hello!</div>
              {quietMode && !isSpeaker && (
                <div style={{ fontSize: 12, color: 'var(--sos)', background: 'var(--sos-soft)', padding: '6px 14px', borderRadius: 10 }}>
                  🔇 Quiet mode — only speakers can post here
                </div>
              )}
            </div>
          )}
          {messages.map(msg => <MessageItem key={msg.id} msg={msg} myId={myId} />)}
          <div ref={bottomRef} />
        </div>

        <div className="input-bar">
          {/* Raise Hand (members in event/classroom) */}
          {!isAdmin && features.includes('raise_hand') && (
            <button
              id="btn-raise-hand"
              onClick={myHandRaised ? () => lowerHand(myId) : handleRaiseHand}
              title={myHandRaised ? 'Lower hand' : 'Raise hand to speak'}
              style={{
                width: 44, height: 44, borderRadius: '50%', border: 'none', flexShrink: 0,
                background: myHandRaised ? '#f59e0b' : 'var(--bg-elevated)',
                fontSize: 20, cursor: 'pointer',
                boxShadow: myHandRaised ? '0 0 12px rgba(245,158,11,0.5)' : 'none',
                transition: 'all 0.2s ease',
                animation: myHandRaised ? 'pulse-dot 1.5s infinite' : 'none',
              }}
            >✋</button>
          )}

          <textarea
            ref={textareaRef}
            id="chat-input"
            className="input-field"
            placeholder={canSend ? `Message ${currentChannel?.label}…` : '🔇 Quiet mode — you cannot post here'}
            rows={1}
            value={draft}
            disabled={!canSend}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
            }}
            style={{ opacity: canSend ? 1 : 0.5 }}
          />
          <button id="btn-send" className="btn-send" onClick={handleSend}
            disabled={!draft.trim() || !canSend} aria-label="Send">➤</button>
        </div>
      </main>

      {/* ── Mobile bottom nav ── */}
      <nav className="bottom-nav">
        {accessibleChannels.map(ch => (
          <button key={ch.id} id={`mobile-nav-${ch.id}`}
            className={`bottom-nav-item${activeChannel === ch.id ? ' active' : ''}${ch.id === 'emergency' ? ' emergency' : ''}`}
            onClick={() => setActiveChannel(ch.id)}>
            <span className="bottom-nav-icon">{ch.icon}</span>
            <span className="bottom-nav-label">{ch.label}</span>
          </button>
        ))}
        {!isAdmin && features.includes('raise_hand') && (
          <button className={`bottom-nav-item${myHandRaised ? ' active' : ''}`}
            id="mobile-nav-hand" onClick={myHandRaised ? () => lowerHand(myId) : handleRaiseHand}
            style={{ flex: 0, minWidth: 56 }}>
            <span className="bottom-nav-icon" style={{
              background: myHandRaised ? '#f59e0b' : 'var(--bg-elevated)',
              borderRadius: '50%', width: 36, height: 36,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background 0.2s',
            }}>✋</span>
            <span className="bottom-nav-label" style={{ color: myHandRaised ? '#f59e0b' : undefined }}>Hand</span>
          </button>
        )}
        <button className="bottom-nav-item emergency" id="mobile-nav-sos" onClick={handleSOS}
          style={{ flex: 0, minWidth: 56 }}>
          <span className="bottom-nav-icon" style={{
            background: 'linear-gradient(135deg,#ff3b5c,#ff6b8a)', borderRadius: '50%',
            width: 38, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 12px rgba(255,59,92,0.5)',
          }}>🚨</span>
          <span className="bottom-nav-label" style={{ color: 'var(--sos)' }}>SOS</span>
        </button>
      </nav>

      {/* ── Admin Panel (slide-up) ── */}
      {showAdminPanel && isAdmin && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 150,
          background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'flex-end',
          animation: 'fade-in 0.2s ease',
        }} onClick={() => setShowAdminPanel(false)}>
          <div style={{
            background: 'var(--bg-surface)', borderRadius: '20px 20px 0 0',
            padding: '20px 20px calc(20px + env(safe-area-inset-bottom, 0px))',
            width: '100%', maxWidth: 520, margin: '0 auto',
            maxHeight: '80vh', overflowY: 'auto',
            animation: 'slide-up 0.3s cubic-bezier(0.34,1.56,0.64,1)',
          }} onClick={e => e.stopPropagation()}>

            {/* Handle */}
            <div style={{ width: 36, height: 4, background: 'var(--border)', borderRadius: 2, margin: '0 auto 20px' }} />

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <span style={{ fontSize: 22 }}>{purposeMeta.icon}</span>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>Admin Controls</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{purposeMeta.label}</div>
              </div>
            </div>

            {/* ── Pinned Announcement ── */}
            {features.includes('announce') && (
              <AdminSection icon="📌" title="Pin Announcement">
                <textarea
                  className="input-field"
                  placeholder="Broadcast a pinned message to all…"
                  rows={2}
                  value={announceText}
                  onChange={e => setAnnounceText(e.target.value)}
                  style={{ width: '100%', marginBottom: 8, borderRadius: 10 }}
                />
                <button className="btn btn-primary w-full" onClick={handleAnnounce} disabled={!announceText.trim()}>
                  📌 Pin & Broadcast
                </button>
                {pinnedAnnouncement && (
                  <button className="btn btn-ghost w-full" style={{ marginTop: 6 }}
                    onClick={() => { setPinnedAnnouncement(null); setShowAdminPanel(false) }}>
                    🗑 Remove Current Pin
                  </button>
                )}
              </AdminSection>
            )}

            {/* ── Quiet Mode ── */}
            {features.includes('quiet_mode') && (
              <AdminSection icon="🔇" title="Quiet Mode">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '4px 0' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{quietMode ? 'Quiet mode ON' : 'Quiet mode OFF'}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                      {quietMode ? 'Only admin/speakers can post in General' : 'Everyone can post in General'}
                    </div>
                  </div>
                  <Toggle checked={quietMode} onChange={setQuietMode} />
                </div>
              </AdminSection>
            )}

            {/* ── Raised Hands Queue ── */}
            {features.includes('raise_hand') && (
              <AdminSection icon="✋" title={`Raised Hands (${raisedHands.length})`}>
                {raisedHands.length === 0 ? (
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '8px 0' }}>
                    No hands raised yet
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {raisedHands.map((peerId, idx) => {
                      const peer = peers.get(peerId)
                      return (
                        <div key={peerId} style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '10px 12px', background: 'var(--bg-elevated)',
                          borderRadius: 10, border: '1px solid var(--border)',
                        }}>
                          <span style={{ fontSize: 13, color: 'var(--text-muted)', width: 20, textAlign: 'center' }}>#{idx + 1}</span>
                          <div className="peer-avatar" style={{ background: peerColor(peerId), width: 32, height: 32 }}>
                            {(peer?.alias ?? peerId.slice(0, 1)).toUpperCase()}
                          </div>
                          <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{peer?.alias ?? peerId.slice(0, 8)}</span>
                          <button
                            onClick={() => handleApproveHand(peerId)}
                            style={{
                              background: 'linear-gradient(135deg,#6c63ff,#a78bfa)',
                              color: 'white', border: 'none', borderRadius: 8,
                              padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                            }}
                          >Give Floor 👑</button>
                          <button onClick={() => lowerHand(peerId)}
                            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16 }}>×</button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </AdminSection>
            )}

            {/* ── Lock Room ── */}
            <AdminSection icon="🔒" title="Room Access">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '4px 0', marginBottom: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{roomLocked ? '🔴 Room is LOCKED' : '🟢 Room is open'}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    {roomLocked ? 'No new participants can join' : 'New participants can scan QR and join'}
                  </div>
                </div>
                <Toggle checked={roomLocked} onChange={v => {
                  setRoomLocked(v)
                  sendMessage(v ? '🔒 Admin has locked the room — no new joins' : '🟢 Admin has opened the room', 'general')
                }} />
              </div>
              {roomConfig && roomConfig.memberCap > 0 && (
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '8px 12px', background: 'var(--bg-overlay)', borderRadius: 8,
                }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>👥 Member cap</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>
                    {peers.size + 1} / {roomConfig.memberCap}
                  </span>
                </div>
              )}
            </AdminSection>

            {/* ── Emergency Broadcast ── */}
            {features.includes('sos_first') && (
              <AdminSection icon="🚨" title="Emergency Broadcast">
                <button className="btn btn-sos w-full" onClick={() => { handleSOS(); setShowAdminPanel(false) }}>
                  🚨 Broadcast Emergency Alert
                </button>
              </AdminSection>
            )}
          </div>
        </div>
      )}

      {/* ── SOS Overlay ── */}
      {sosAlert && (
        <div className="sos-overlay" onClick={() => setSOSAlert(null)}>
          <div className="sos-card" onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 56, marginBottom: 12 }}>🚨</div>
            <h2 style={{ color: 'var(--sos)', fontSize: 22, marginBottom: 8 }}>EMERGENCY</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 4 }}>
              from <strong style={{ color: 'var(--text-primary)' }}>{sosAlert.from.slice(0, 12)}…</strong>
            </p>
            <p style={{ fontSize: 16, fontWeight: 600, margin: '16px 0', color: 'var(--text-primary)' }}>{sosAlert.text}</p>
            <button id="btn-dismiss-sos" className="btn btn-sos w-full" onClick={() => setSOSAlert(null)}>Acknowledge</button>
          </div>
        </div>
      )}
    </div>
  )
}

function AdminSection({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
        <span style={{ fontSize: 16 }}>{icon}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>{title}</span>
      </div>
      {children}
    </div>
  )
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      style={{
        width: 48, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer',
        background: checked ? 'var(--accent)' : 'var(--bg-overlay)',
        position: 'relative', transition: 'background 0.2s ease', flexShrink: 0,
        boxShadow: checked ? '0 0 8px var(--accent-glow)' : 'none',
      }}
    >
      <span style={{
        position: 'absolute', top: 3,
        left: checked ? 25 : 3,
        width: 20, height: 20, borderRadius: '50%',
        background: 'white',
        transition: 'left 0.2s ease',
        boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
      }} />
    </button>
  )
}
