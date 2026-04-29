/**
 * roles.ts — Ed25519-signed capability tokens + ACL enforcement
 */
import { sign, verify, bytesToHex, hexToBytes, utf8ToBytes } from './crypto'

export type Role = 'admin' | 'speaker' | 'member'
export type Channel = 'general' | 'emergency' | 'speakers' | 'admin'

export interface CapabilityToken {
  role: Role
  roomId: string
  peerId: string   // hex public key
  exp: number      // unix ms expiry
  sig: string      // hex Ed25519 sig
}

/** Channels accessible per role */
export const CHANNEL_ACCESS: Record<Role, Channel[]> = {
  admin:   ['general', 'emergency', 'speakers', 'admin'],
  speaker: ['general', 'emergency', 'speakers'],
  member:  ['general', 'emergency'],
}

/** Admin issues a token for a peer */
export function issueToken(
  adminPrivKey: Uint8Array,
  peerId: string,
  role: Role,
  roomId: string,
  ttlMs = 24 * 60 * 60 * 1000 // 24h default
): CapabilityToken {
  const exp = Date.now() + ttlMs
  const payload = utf8ToBytes(JSON.stringify({ role, roomId, peerId, exp }))
  const sig = sign(adminPrivKey, payload)
  return { role, roomId, peerId, exp, sig: bytesToHex(sig) }
}

/** Verify a token was signed by the room admin */
export function verifyToken(token: CapabilityToken, adminPubKey: Uint8Array): boolean {
  if (Date.now() > token.exp) return false // expired
  const payload = utf8ToBytes(JSON.stringify({
    role: token.role, roomId: token.roomId, peerId: token.peerId, exp: token.exp
  }))
  return verify(adminPubKey, payload, hexToBytes(token.sig))
}

/** Check if a role can access a channel */
export function canAccess(role: Role, channel: Channel): boolean {
  return CHANNEL_ACCESS[role]?.includes(channel) ?? false
}

/** Persist token to localStorage */
export function saveToken(token: CapabilityToken) {
  localStorage.setItem('nc_token', JSON.stringify(token))
}

/** Load token from localStorage */
export function loadToken(): CapabilityToken | null {
  try {
    const raw = localStorage.getItem('nc_token')
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}
