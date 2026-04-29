/**
 * SignalBars.tsx — Animated WiFi-style signal strength indicator
 * Visualizes WebRTC link quality (RTT + packet loss + bitrate)
 */
import React from 'react'
import { signalLabel } from '../lib/linkquality'

interface Props {
  score: number   // 0–100
  size?: number
  showLabel?: boolean
}

export default function SignalBars({ score, size = 16, showLabel = false }: Props) {
  const { bars, color, label } = signalLabel(score)
  const barCount = 4
  const barWidth = size * 0.18
  const gap = size * 0.08

  return (
    <span
      title={`Link quality: ${label} (${score}/100)`}
      style={{ display: 'inline-flex', alignItems: 'flex-end', gap, height: size }}
    >
      {Array.from({ length: barCount }).map((_, i) => {
        const active = i < bars
        const barHeight = size * (0.3 + (i / (barCount - 1)) * 0.7)
        return (
          <span
            key={i}
            style={{
              display: 'inline-block',
              width: barWidth,
              height: barHeight,
              borderRadius: 2,
              background: active ? color : 'rgba(255,255,255,0.1)',
              transition: 'background 0.5s ease, height 0.5s ease',
              boxShadow: active ? `0 0 4px ${color}88` : 'none',
            }}
          />
        )
      })}
      {showLabel && (
        <span style={{ marginLeft: 4, fontSize: size * 0.7, color, fontWeight: 500, whiteSpace: 'nowrap' }}>
          {label}
        </span>
      )}
    </span>
  )
}
