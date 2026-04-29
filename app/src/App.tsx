import React, { useEffect, useState } from 'react'
import './index.css'
import { useStore } from './store/useStore'
import { loadOrCreateIdentity } from './lib/crypto'
import { loadToken } from './lib/roles'
import Setup from './pages/Setup'
import Join from './pages/Join'
import Chat from './pages/Chat'
import InstallBanner from './components/InstallBanner'
import SideNav from './components/SideNav'
import { registerBackgroundSync } from './lib/platform'

function OfflineBanner() {
  const [offline, setOffline] = useState(!navigator.onLine)
  useEffect(() => {
    const on = () => setOffline(false)
    const off = () => setOffline(true)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])
  if (!offline) return null
  return <div className="offline-banner">📡 Offline Mode — Mesh network active, no internet required · OfflineConnect</div>
}

export default function App() {
  const { phase, setPhase, setIdentity, setRole } = useStore()

  useEffect(() => {
    // Restore identity on load
    const identity = loadOrCreateIdentity()
    setIdentity(identity)
    // Restore role token
    const token = loadToken()
    if (token) setRole(token.role)
    // Background sync (Android Doze workaround)
    registerBackgroundSync()
  }, [])

  return (
    <>
      <OfflineBanner />
      <InstallBanner />
      <SideNav />
      {phase === 'setup' && <Setup />}
      {phase === 'join'  && <Join />}
      {phase === 'chat'  && <Chat />}
    </>
  )
}
