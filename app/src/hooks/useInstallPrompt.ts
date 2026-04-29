/**
 * useInstallPrompt.ts
 * Reliable PWA install prompt that works even when beforeinstallprompt
 * fires before React mounts (the common case).
 *
 * Strategy:
 *  1. index.html inline script captures the event → window.__pwaPrompt
 *  2. This hook reads window.__pwaPrompt on mount (already captured)
 *  3. Also listens for the 'pwa-installable' custom event for late fires
 *  4. Detects iOS Safari for manual "Add to Home Screen" guidance
 *  5. Falls back to always showing instructions if neither works
 */
import { useState, useEffect } from 'react'

export interface InstallState {
  /** Android/Chrome: native browser install prompt available */
  canInstall: boolean
  /** iOS Safari: must use manual Add to Home Screen */
  isIOS: boolean
  /** Already running as installed PWA */
  isStandalone: boolean
  /** Trigger native install dialog (Android only) */
  triggerInstall: () => Promise<'accepted' | 'dismissed' | 'unavailable'>
}

declare global {
  interface Window { __pwaPrompt: any }
}

export function useInstallPrompt(): InstallState {
  const [prompt, setPrompt] = useState<any>(() => window.__pwaPrompt ?? null)

  const isIOS =
    /iP(hone|od|ad)/.test(navigator.userAgent) &&
    /WebKit/.test(navigator.userAgent) &&
    !/CriOS|FxiOS/.test(navigator.userAgent)

  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as any).standalone === true

  useEffect(() => {
    // In case the event fires after mount (rare but possible)
    const onInstallable = () => setPrompt(window.__pwaPrompt)
    window.addEventListener('pwa-installable', onInstallable)

    // Also listen for the raw event in case index.html script wasn't loaded
    const onRaw = (e: Event) => {
      e.preventDefault()
      window.__pwaPrompt = e
      setPrompt(e)
    }
    window.addEventListener('beforeinstallprompt', onRaw)

    return () => {
      window.removeEventListener('pwa-installable', onInstallable)
      window.removeEventListener('beforeinstallprompt', onRaw)
    }
  }, [])

  const triggerInstall = async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
    const p = prompt ?? window.__pwaPrompt
    if (!p) return 'unavailable'
    p.prompt()
    const { outcome } = await p.userChoice
    window.__pwaPrompt = null
    setPrompt(null)
    return outcome as 'accepted' | 'dismissed'
  }

  return {
    canInstall: !!(prompt ?? window.__pwaPrompt),
    isIOS,
    isStandalone,
    triggerInstall,
  }
}
