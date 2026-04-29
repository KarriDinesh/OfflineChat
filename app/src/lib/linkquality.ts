/**
 * linkquality.ts — WebRTC-based link quality scoring per peer
 *
 * Since browsers have NO WiFi RSSI API, we derive a "signal score"
 * from real measured WebRTC stats:
 *   - currentRoundTripTime (RTT in seconds) — lower = better
 *   - packetsLost / packetsSent ratio       — lower = better
 *   - availableOutgoingBitrate              — higher = better
 *
 * Score is 0–100 (100 = perfect link).
 * Used by the gossip router to prefer strong-link peers as relay nodes.
 */

export interface LinkStats {
  peerId: string
  rttMs: number           // round-trip time in ms
  packetLossPercent: number
  bitrateKbps: number     // available outgoing bitrate
  score: number           // 0–100 composite quality score
  updatedAt: number
}

const peerStats = new Map<string, LinkStats>()

/** Compute a 0–100 quality score from raw WebRTC stats */
function computeScore(rttMs: number, lossPercent: number, bitrateKbps: number): number {
  // RTT: 0ms=100pts, 50ms=80pts, 200ms=40pts, 500ms+=0pts
  const rttScore = Math.max(0, 100 - (rttMs / 5))

  // Packet loss: 0%=100pts, 5%=50pts, 10%+=0pts
  const lossScore = Math.max(0, 100 - lossPercent * 10)

  // Bitrate: 0kbps=0pts, 500kbps=50pts, 2000kbps+=100pts
  const bitrateScore = Math.min(100, bitrateKbps / 20)

  // Weighted average: RTT matters most for chat
  return Math.round(rttScore * 0.5 + lossScore * 0.3 + bitrateScore * 0.2)
}

/** Poll a single RTCPeerConnection and update its link stats */
export async function measurePeerLink(peerId: string, pc: RTCPeerConnection): Promise<LinkStats> {
  const stats = await pc.getStats()

  let rttMs = 999
  let lossPercent = 0
  let bitrateKbps = 0

  stats.forEach((report) => {
    if (report.type === 'candidate-pair' && report.state === 'succeeded') {
      if (report.currentRoundTripTime !== undefined) {
        rttMs = Math.min(rttMs, report.currentRoundTripTime * 1000)
      }
      if (report.availableOutgoingBitrate !== undefined) {
        bitrateKbps = Math.max(bitrateKbps, report.availableOutgoingBitrate / 1000)
      }
    }
    if (report.type === 'outbound-rtp') {
      const sent = report.packetsSent ?? 0
      const lost = report.packetsLost ?? 0
      if (sent > 0) lossPercent = Math.min(100, (lost / sent) * 100)
    }
  })

  const score = computeScore(rttMs, lossPercent, bitrateKbps)
  const result: LinkStats = { peerId, rttMs, packetLossPercent: lossPercent, bitrateKbps, score, updatedAt: Date.now() }
  peerStats.set(peerId, result)
  return result
}

/** Get current cached stats for all peers */
export function getAllLinkStats(): LinkStats[] {
  return [...peerStats.values()].sort((a, b) => b.score - a.score)
}

/** Get score for a specific peer (default 50 if unknown) */
export function getPeerScore(peerId: string): number {
  return peerStats.get(peerId)?.score ?? 50
}

/** Remove stats when a peer disconnects */
export function removePeerStats(peerId: string) {
  peerStats.delete(peerId)
}

/** Start periodic polling of all active PeerConnections (every 5s) */
export function startLinkMonitor(
  getPeers: () => Map<string, RTCPeerConnection>,
  onUpdate: (stats: LinkStats[]) => void
): () => void {
  const interval = setInterval(async () => {
    const peers = getPeers()
    await Promise.allSettled([...peers.entries()].map(([id, pc]) => measurePeerLink(id, pc)))
    onUpdate(getAllLinkStats())
  }, 5000)

  return () => clearInterval(interval)
}

/** Signal strength label + color from score */
export function signalLabel(score: number): { label: string; bars: number; color: string } {
  if (score >= 80) return { label: 'Excellent', bars: 4, color: '#00e5a0' }
  if (score >= 60) return { label: 'Good',      bars: 3, color: '#86efac' }
  if (score >= 35) return { label: 'Fair',       bars: 2, color: '#f59e0b' }
  if (score >= 10) return { label: 'Weak',       bars: 1, color: '#fb923c' }
  return              { label: 'Poor',       bars: 0, color: '#ff3b5c' }
}
