/**
 * crypto.ts — E2EE layer: HKDF + XChaCha20-Poly1305 + Ed25519
 * Never logs plaintext or raw key material.
 */
import { xchacha20poly1305 } from '@noble/ciphers/chacha'
import { randomBytes } from '@noble/ciphers/webcrypto'
import { ed25519 } from '@noble/curves/ed25519'
import { sha256 } from '@noble/hashes/sha256'
import { hkdf } from '@noble/hashes/hkdf'
import { pbkdf2 } from '@noble/hashes/pbkdf2'
import { bytesToHex, hexToBytes, utf8ToBytes, concatBytes } from '@noble/hashes/utils'

export type KeyPair = { privateKey: Uint8Array; publicKey: Uint8Array }

/** Generate a new Ed25519 identity key pair */
export function generateIdentity(): KeyPair {
  const privateKey = ed25519.utils.randomPrivateKey()
  const publicKey = ed25519.getPublicKey(privateKey)
  return { privateKey, publicKey }
}

/** Persist identity to localStorage (hex-encoded) */
export function loadOrCreateIdentity(): KeyPair {
  const stored = localStorage.getItem('nc_identity')
  if (stored) {
    try {
      const { priv, pub } = JSON.parse(stored)
      return { privateKey: hexToBytes(priv), publicKey: hexToBytes(pub) }
    } catch { /* fall through */ }
  }
  const kp = generateIdentity()
  localStorage.setItem('nc_identity', JSON.stringify({
    priv: bytesToHex(kp.privateKey),
    pub: bytesToHex(kp.publicKey),
  }))
  return kp
}

/** Derive symmetric room key from salt + passphrase via HKDF-SHA256 */
export function deriveRoomKey(salt: Uint8Array, passphrase: string): Uint8Array {
  const ikm = utf8ToBytes(passphrase)
  return hkdf(sha256, ikm, salt, utf8ToBytes('nearchat-v1-room'), 32)
}

/** Derive key from 6-digit PIN via PBKDF2 (100k iterations) */
export function deriveKeyFromPin(pin: string, salt: Uint8Array): Uint8Array {
  return pbkdf2(sha256, utf8ToBytes(pin), salt, { c: 100_000, dkLen: 32 })
}

/** Encrypt plaintext with XChaCha20-Poly1305. Returns nonce+ciphertext */
export function encrypt(key: Uint8Array, plaintext: Uint8Array): Uint8Array {
  const nonce = randomBytes(24)
  const chacha = xchacha20poly1305(key, nonce)
  const ciphertext = chacha.encrypt(plaintext)
  return concatBytes(nonce, ciphertext)
}

/** Decrypt nonce+ciphertext. Returns plaintext or throws on auth failure */
export function decrypt(key: Uint8Array, data: Uint8Array): Uint8Array {
  const nonce = data.slice(0, 24)
  const ciphertext = data.slice(24)
  const chacha = xchacha20poly1305(key, nonce)
  return chacha.decrypt(ciphertext)
}

/** Sign arbitrary bytes with Ed25519 private key */
export function sign(privateKey: Uint8Array, message: Uint8Array): Uint8Array {
  return ed25519.sign(message, privateKey)
}

/** Verify Ed25519 signature. Returns false instead of throwing */
export function verify(publicKey: Uint8Array, message: Uint8Array, signature: Uint8Array): boolean {
  try { return ed25519.verify(signature, message, publicKey) }
  catch { return false }
}

/** Generate a random 32-byte salt */
export function randomSalt(): Uint8Array {
  return randomBytes(32)
}

export { bytesToHex, hexToBytes, utf8ToBytes }
