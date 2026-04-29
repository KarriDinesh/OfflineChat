/**
 * crdt.ts — Y.js document + y-indexeddb persistence bridge
 * Handles offline queuing and partition recovery.
 */
import * as Y from 'yjs'
import { IndexeddbPersistence } from 'y-indexeddb'

export interface ChatMessage {
  id: string
  channel: string
  from: string      // hex pubkey
  alias: string
  text: string
  ts: number
  type: 'chat' | 'sos' | 'system'
  deleted?: boolean
}

let ydoc: Y.Doc | null = null
let persistence: IndexeddbPersistence | null = null

/** Init Y.js doc for a given room, persisted to IndexedDB */
export async function initCRDT(roomId: string): Promise<Y.Doc> {
  if (ydoc) return ydoc

  ydoc = new Y.Doc()
  persistence = new IndexeddbPersistence(`nearchat-${roomId}`, ydoc)
  await new Promise<void>(resolve => persistence!.once('synced', resolve))
  return ydoc
}

/** Get the Y.Array of messages for a channel */
export function getChannelArray(channel: string): Y.Array<ChatMessage> {
  if (!ydoc) throw new Error('CRDT not initialized')
  return ydoc.getArray<ChatMessage>(`ch:${channel}`)
}

/** Insert a message into the CRDT (auto-syncs to all connected peers) */
export function insertMessage(msg: ChatMessage) {
  if (!ydoc) return
  const arr = getChannelArray(msg.channel)
  ydoc.transact(() => arr.push([msg]))
}

/** Soft-delete a message by ID (tombstone) */
export function deleteMessage(channel: string, id: string) {
  if (!ydoc) return
  const arr = getChannelArray(channel)
  ydoc.transact(() => {
    const idx = arr.toArray().findIndex(m => m.id === id)
    if (idx !== -1) {
      const msg = arr.get(idx)
      arr.delete(idx, 1)
      arr.insert(idx, [{ ...msg, deleted: true, text: '[deleted]' }])
    }
  })
}

/** Encode the current state vector for sync exchange */
export function encodeStateVector(): Uint8Array {
  if (!ydoc) return new Uint8Array()
  return Y.encodeStateVector(ydoc)
}

/** Encode a diff update given a remote state vector */
export function encodeDiff(remoteStateVector: Uint8Array): Uint8Array {
  if (!ydoc) return new Uint8Array()
  return Y.encodeStateAsUpdate(ydoc, remoteStateVector)
}

/** Apply a received update from a remote peer */
export function applyUpdate(update: Uint8Array) {
  if (!ydoc) return
  Y.applyUpdate(ydoc, update)
}

/** Observe channel changes and call handler */
export function observeChannel(channel: string, handler: (msgs: ChatMessage[]) => void) {
  const arr = getChannelArray(channel)
  const fn = () => handler(arr.toArray())
  arr.observe(fn)
  handler(arr.toArray()) // initial load
  return () => arr.unobserve(fn)
}

/** Awareness: broadcast local peer info */
export function setAwareness(ydoc: Y.Doc, info: Record<string, unknown>) {
  // Awareness is handled via useP2P hook's awareness channel
  void ydoc
  void info
}

export function getDoc(): Y.Doc | null { return ydoc }

export function destroyCRDT() {
  persistence?.destroy()
  ydoc?.destroy()
  ydoc = null
  persistence = null
}
