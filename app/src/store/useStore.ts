/**
 * useStore.ts — Zustand global state
 */
import { create } from 'zustand'
import type { KeyPair } from '../lib/crypto'
import type { Role, Channel } from '../lib/roles'

export type RoomPurpose =
  | 'event'       // Conference, meetup — raise hand, spotlight speakers
  | 'classroom'   // Teacher leads — raise hand, quiet mode on by default
  | 'emergency'   // Disaster/field response — SOS first, all channels
  | 'team'        // Work coordination — announcements, all channels
  | 'social'      // Party/gathering — open chat, informal
  | 'outdoor'     // Camping/hiking — SOS prominent, battery mode

export const PURPOSE_META: Record<RoomPurpose, {
  icon: string; label: string; description: string;
  defaultQuietMode: boolean;
  features: ('raise_hand' | 'quiet_mode' | 'announce' | 'sos_first' | 'promote')[]
}> = {
  event: {
    icon: '🎤', label: 'Event / Conference',
    description: 'Meetup, talk, or conference. Control who speaks.',
    defaultQuietMode: true,
    features: ['raise_hand', 'quiet_mode', 'announce', 'promote'],
  },
  classroom: {
    icon: '🏫', label: 'Classroom',
    description: 'Teacher-led session. Students raise hand to speak.',
    defaultQuietMode: true,
    features: ['raise_hand', 'quiet_mode', 'announce', 'promote'],
  },
  emergency: {
    icon: '🚨', label: 'Emergency Response',
    description: 'Disaster, rescue, or field ops. SOS always first.',
    defaultQuietMode: false,
    features: ['announce', 'sos_first', 'promote'],
  },
  team: {
    icon: '👥', label: 'Team / Work',
    description: 'Coordinate a team. All channels open.',
    defaultQuietMode: false,
    features: ['announce', 'promote', 'quiet_mode'],
  },
  social: {
    icon: '🎉', label: 'Social / Gathering',
    description: 'Party, hangout, or casual group. Open & informal.',
    defaultQuietMode: false,
    features: ['announce'],
  },
  outdoor: {
    icon: '🏕️', label: 'Outdoor / Field',
    description: 'Camping, hiking, or off-grid. Range & battery aware.',
    defaultQuietMode: false,
    features: ['announce', 'sos_first', 'promote'],
  },
}

export interface RoomConfig {
  roomId: string
  seedIp: string
  cryptoSalt: string   // hex
  adminPub: string     // hex
  protocolV: number
  purpose: RoomPurpose
  roomName: string
  expiresAt: number    // unix ms — QR invalid after this
  memberCap: number    // 0 = unlimited
}

export interface PeerInfo {
  id: string
  alias: string
  online: boolean
}

export interface SOSAlert {
  from: string
  text: string
  ts: number
}

interface AppStore {
  // Identity
  identity: KeyPair | null
  setIdentity: (kp: KeyPair) => void

  // Room
  roomConfig: RoomConfig | null
  setRoomConfig: (cfg: RoomConfig) => void

  // Role
  role: Role
  setRole: (r: Role) => void

  // Active channel
  activeChannel: Channel
  setActiveChannel: (c: Channel) => void

  // Peers
  peers: Map<string, PeerInfo>
  addPeer: (id: string) => void
  removePeer: (id: string) => void

  // Connection
  connected: boolean
  setConnected: (v: boolean) => void

  // Messages
  messages: Record<string, import('../lib/crdt').ChatMessage[]>
  addMessage: (msg: import('../lib/crdt').ChatMessage) => void

  // SOS
  sosAlert: SOSAlert | null
  setSOSAlert: (alert: SOSAlert | null) => void

  // UI
  alias: string
  setAlias: (a: string) => void

  // Phase
  phase: 'setup' | 'join' | 'chat'
  setPhase: (p: 'setup' | 'join' | 'chat') => void

  // ── Room features ──────────────────────────────────────────
  // Pinned announcement (set by admin, broadcast to all)
  pinnedAnnouncement: string | null
  setPinnedAnnouncement: (msg: string | null) => void

  // Raised hands queue (peer IDs in order raised)
  raisedHands: string[]
  raiseHand: (peerId: string) => void
  lowerHand: (peerId: string) => void

  // Quiet mode (only admin/speakers can post in General)
  quietMode: boolean
  setQuietMode: (v: boolean) => void

  // Room lock (admin blocks new joins)
  roomLocked: boolean
  setRoomLocked: (v: boolean) => void
}

export const useStore = create<AppStore>((set) => ({
  identity: null,
  setIdentity: (kp) => set({ identity: kp }),

  roomConfig: null,
  setRoomConfig: (cfg) => set({ roomConfig: cfg }),

  role: 'member',
  setRole: (r) => set({ role: r }),

  activeChannel: 'general',
  setActiveChannel: (c) => set({ activeChannel: c }),

  peers: new Map(),
  addPeer: (id) => set((s) => {
    const peers = new Map(s.peers)
    peers.set(id, { id, alias: id.slice(0, 8), online: true })
    return { peers }
  }),
  removePeer: (id) => set((s) => {
    const peers = new Map(s.peers)
    peers.delete(id)
    return { peers }
  }),

  connected: false,
  setConnected: (v) => set({ connected: v }),

  messages: {},
  addMessage: (msg) => set((s) => {
    const ch = s.messages[msg.channel] ?? []
    return { messages: { ...s.messages, [msg.channel]: [...ch, msg] } }
  }),

  sosAlert: null,
  setSOSAlert: (alert) => set({ sosAlert: alert }),

  alias: '',
  setAlias: (a) => set({ alias: a }),

  phase: 'setup',
  setPhase: (p) => set({ phase: p }),

  pinnedAnnouncement: null,
  setPinnedAnnouncement: (msg) => set({ pinnedAnnouncement: msg }),

  raisedHands: [],
  raiseHand: (peerId) => set((s) => ({
    raisedHands: s.raisedHands.includes(peerId)
      ? s.raisedHands
      : [...s.raisedHands, peerId],
  })),
  lowerHand: (peerId) => set((s) => ({
    raisedHands: s.raisedHands.filter(id => id !== peerId),
  })),

  quietMode: false,
  setQuietMode: (v) => set({ quietMode: v }),

  roomLocked: false,
  setRoomLocked: (v) => set({ roomLocked: v }),
}))
