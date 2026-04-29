/**
 * platform.ts — iOS Safari + Android Doze patches
 */

let keepaliveTimer: ReturnType<typeof setInterval> | null = null
let pingFn: (() => void) | null = null

/** Register Page Visibility keepalive pings every 30s */
export function registerVisibilityKeepalive(ping: () => void) {
  pingFn = ping
  document.addEventListener('visibilitychange', onVisibilityChange)
  startKeepalive()
}

export function unregisterVisibilityKeepalive() {
  document.removeEventListener('visibilitychange', onVisibilityChange)
  stopKeepalive()
}

function onVisibilityChange() {
  if (document.visibilityState === 'hidden') {
    // App moved to background — increase ping frequency
    startKeepalive(15_000)
  } else {
    startKeepalive(30_000)
  }
}

function startKeepalive(intervalMs = 30_000) {
  stopKeepalive()
  keepaliveTimer = setInterval(() => {
    pingFn?.()
  }, intervalMs)
}

function stopKeepalive() {
  if (keepaliveTimer) { clearInterval(keepaliveTimer); keepaliveTimer = null }
}

/** Detect iOS Safari */
export function isIOSSafari(): boolean {
  const ua = navigator.userAgent
  return /iP(hone|od|ad)/.test(ua) && /WebKit/.test(ua) && !/CriOS|FxiOS/.test(ua)
}

/** Detect Android */
export function isAndroid(): boolean {
  return /Android/.test(navigator.userAgent)
}

/** Build RTCConfiguration with STUN fallback (offline-safe) */
export function buildRTCConfig(): RTCConfiguration {
  // STUN only used when internet is available; gracefully skipped offline
  const iceServers: RTCIceServer[] = []

  if (navigator.onLine) {
    iceServers.push({ urls: 'stun:stun.l.google.com:19302' })
    iceServers.push({ urls: 'stun:stun1.l.google.com:19302' })
  }

  return {
    iceServers,
    // Force relay as last-resort fallback for NAT traversal
    iceTransportPolicy: 'all',
    // Limit ICE candidates to reduce signaling overhead on LAN
    iceCandidatePoolSize: 4,
  }
}

/** Register Background Sync if available (Android Doze workaround) */
export async function registerBackgroundSync(tag = 'nearchat-sync') {
  if ('serviceWorker' in navigator && 'SyncManager' in window) {
    const reg = await navigator.serviceWorker.ready
    try {
      // @ts-ignore — SyncManager not in all TS libs
      await reg.sync.register(tag)
    } catch { /* not supported */ }
  }
}

/** Trigger vibration for SOS alerts */
export function sosvibrate() {
  if ('vibrate' in navigator) {
    navigator.vibrate([200, 100, 200, 100, 600])
  }
}
