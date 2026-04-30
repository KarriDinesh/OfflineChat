/**
 * LocalNetworkBanner
 * Shows when the app is loaded over HTTPS but the room's signaling server
 * is on a plain HTTP local IP — browsers block ws:// and http:// from https://.
 * Offers a one-tap redirect to the local server where everything works.
 */
import React from 'react'
import { useStore } from '../store/useStore'

/** Returns true if we're on HTTPS but need to talk to a plain HTTP local server */
export function isInMixedContentMode(seedIp?: string): boolean {
  if (!seedIp) return false
  if (window.location.protocol !== 'https:') return false
  // Local IP ranges: 192.168.x.x, 10.x.x.x, 172.16-31.x.x
  return /^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(seedIp)
}

export default function LocalNetworkBanner() {
  const { roomConfig, phase } = useStore()
  if (phase !== 'chat' && phase !== 'join') return null

  const seedIp = roomConfig?.seedIp as string | undefined
  if (!isInMixedContentMode(seedIp)) return null

  const localUrl = `http://${seedIp}:3000/`

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9997,
      background: 'linear-gradient(90deg, #f59e0b, #f97316)',
      color: 'white', fontSize: 13, fontWeight: 600,
      padding: `calc(10px + env(safe-area-inset-top, 0px)) 16px 10px`,
      display: 'flex', alignItems: 'center', gap: 10,
      flexWrap: 'wrap',
      animation: 'banner-in 0.3s ease',
    }}>
      <span style={{ flex: 1 }}>
        ⚠️ Open the <strong>local version</strong> of the app for full connectivity — this HTTPS version can't reach your local server.
      </span>
      <a
        href={localUrl}
        style={{
          background: 'rgba(0,0,0,0.25)', color: 'white',
          padding: '5px 14px', borderRadius: 20, textDecoration: 'none',
          fontWeight: 700, fontSize: 12, whiteSpace: 'nowrap',
          border: '1px solid rgba(255,255,255,0.3)',
        }}
      >
        Open {localUrl} →
      </a>
    </div>
  )
}
