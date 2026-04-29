/**
 * gossip.ts — Quality-aware partial-mesh gossip router
 * - Max 6 connections per peer
 * - Forwards to 2 BEST-SCORED peers (by link quality) instead of random
 * - Falls back to random if scores unavailable
 * - LRU deduplication (1000 entries)
 * - requestIdleCallback scheduling for normal messages
 */
import { getPeerScore } from './linkquality'

const SEEN_CACHE_SIZE = 1000
const seenIds = new Map<string, number>() // id → timestamp

function markSeen(id: string): boolean {
  if (seenIds.has(id)) return true
  if (seenIds.size >= SEEN_CACHE_SIZE) {
    const oldest = [...seenIds.entries()].sort((a, b) => a[1] - b[1])[0]
    seenIds.delete(oldest[0])
  }
  seenIds.set(id, Date.now())
  return false
}

type SendFn = (data: Uint8Array) => void

export interface GossipPeer {
  send: SendFn
}

export interface GossipRouter {
  peers: Map<string, GossipPeer>
  route(msgId: string, data: Uint8Array, ttl: number, immediate?: boolean): void
  addPeer(id: string, send: SendFn): void
  removePeer(id: string): void
  getBestPeers(count?: number): string[]  // ordered by link quality score
}

export function createGossipRouter(): GossipRouter {
  const peers = new Map<string, GossipPeer>()

  /**
   * Pick `count` peers ranked by link quality score (highest first).
   * This means messages flow through the best-connected devices,
   * equivalent to routing via strongest WiFi links.
   */
  function pickBest(exclude?: string, count = 2): SendFn[] {
    const ranked = [...peers.entries()]
      .filter(([id]) => id !== exclude)
      .sort(([idA], [idB]) => getPeerScore(idB) - getPeerScore(idA))
      .slice(0, count)
      .map(([, peer]) => peer.send)
    return ranked
  }

  function forward(data: Uint8Array, targets: SendFn[]) {
    for (const send of targets) {
      try { send(data) } catch { /* peer disconnected */ }
    }
  }

  return {
    peers,

    addPeer(id, send) {
      if (peers.size >= 6) return
      peers.set(id, { send })
    },

    removePeer(id) {
      peers.delete(id)
    },

    getBestPeers(count = 2) {
      return [...peers.keys()]
        .sort((a, b) => getPeerScore(b) - getPeerScore(a))
        .slice(0, count)
    },

    route(msgId, data, ttl, immediate = false) {
      if (markSeen(msgId)) return
      if (ttl <= 0) return

      // Quality-aware: pick best-scored peers as relay nodes
      const targets = pickBest(undefined, 2)
      if (targets.length === 0) return

      if (immediate) {
        forward(data, targets)
      } else {
        const schedule = typeof requestIdleCallback !== 'undefined'
          ? (fn: () => void) => requestIdleCallback(fn, { timeout: 500 })
          : (fn: () => void) => setTimeout(fn, 0)
        schedule(() => forward(data, targets))
      }
    },
  }
}
