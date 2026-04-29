/**
 * codec.ts — LZ4 + CBOR encode/decode for normal messages.
 * SOS messages skip compression entirely.
 */
import { encode as cborEncode, decode as cborDecode } from 'cbor-x'

// lz4js doesn't have TS types; load as JS
// @ts-ignore
import LZ4 from 'lz4js'

export interface WireMessage {
  id: string
  type: 'chat' | 'sos' | 'system' | 'crdt' | 'ice' | 'offer' | 'answer' | 'ping'
  channel: string
  from: string        // hex public key
  payload: Uint8Array // encrypted bytes
  sig: Uint8Array     // Ed25519 signature over (id+type+channel+payload)
  ttl: number
  ts: number          // unix ms
  compressed: boolean
}

/** Encode a WireMessage to bytes for DataChannel transport */
export function encodeMessage(msg: WireMessage): Uint8Array {
  if (msg.type === 'sos' || msg.type === 'system') {
    // SOS: skip compression — CBOR only
    const raw = cborEncode({ ...msg, compressed: false })
    return raw
  }
  // Normal: CBOR → LZ4
  const cbor = cborEncode({ ...msg, compressed: true })
  const compressed = LZ4.compress(cbor)
  // Only use compression if it actually reduces size
  if (compressed.length < cbor.length) return compressed
  return cborEncode({ ...msg, compressed: false })
}

/** Decode bytes from DataChannel back to WireMessage */
export function decodeMessage(data: ArrayBuffer | Uint8Array): WireMessage {
  const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data
  try {
    // Try direct CBOR first
    const msg = cborDecode(bytes) as WireMessage
    return msg
  } catch {
    // Must be LZ4-compressed CBOR
    const decompressed = LZ4.decompress(bytes)
    return cborDecode(decompressed) as WireMessage
  }
}
