/**
 * useP2P.ts — WebRTC mesh hook
 * Primary messaging: WebSocket relay through signaling server.
 * Secondary: WebRTC direct channels when both peers are connected.
 */
import { useEffect, useRef, useCallback, useState } from 'react'
import { useStore } from '../store/useStore'
import { createGossipRouter } from '../lib/gossip'
import { createQoSQueue } from '../lib/qos'
import { encodeMessage, decodeMessage, WireMessage } from '../lib/codec'
import { encrypt, decrypt, deriveRoomKey, sign, verify, hexToBytes, bytesToHex, utf8ToBytes } from '../lib/crypto'
import { initCRDT, insertMessage } from '../lib/crdt'
import { buildRTCConfig, registerVisibilityKeepalive, sosvibrate } from '../lib/platform'
import { startLinkMonitor, removePeerStats, type LinkStats } from '../lib/linkquality'
import { v4 as uuid } from 'uuid'

const MAX_PEERS = 6

export function useP2P() {
  const {
    roomConfig, identity,
    addPeer, removePeer, setConnected,
    setSOSAlert,
  } = useStore()

  const [linkStats, setLinkStats] = useState<LinkStats[]>([])

  const wsRef = useRef<WebSocket | null>(null)
  const pcsRef = useRef<Map<string, RTCPeerConnection>>(new Map())
  const channelsRef = useRef<Map<string, RTCDataChannel>>(new Map())
  const gossipRef = useRef(createGossipRouter())
  const roomKeyRef = useRef<Uint8Array | null>(null)
  const reconnectDelayRef = useRef(1000)
  const crdtReadyRef = useRef(false)

  // QoS queue — flushes to WebRTC data channels only (if open)
  const qosRef = useRef(createQoSQueue((batch) => {
    for (const data of batch) {
      for (const [peerId, dc] of channelsRef.current.entries()) {
        if (dc.readyState === 'open') {
          try { dc.send(data as Uint8Array<ArrayBuffer>) } catch { removePeerConn(peerId) }
        }
      }
    }
  }))

  function removePeerConn(peerId: string) {
    pcsRef.current.get(peerId)?.close()
    pcsRef.current.delete(peerId)
    channelsRef.current.delete(peerId)
    gossipRef.current.removePeer(peerId)
    removePeerStats(peerId)
    removePeer(peerId)
  }

  /** Safely insert a message — waits for CRDT to be ready */
  function safeInsert(msg: Parameters<typeof insertMessage>[0]) {
    if (crdtReadyRef.current) {
      insertMessage(msg)
    } else {
      // Queue until CRDT is ready (max 3s)
      const start = Date.now()
      const poll = setInterval(() => {
        if (crdtReadyRef.current || Date.now() - start > 3000) {
          clearInterval(poll)
          if (crdtReadyRef.current) insertMessage(msg)
        }
      }, 50)
    }
  }

  /** Decode a raw binary payload from a peer and display it */
  const handleBinaryMessage = useCallback((data: ArrayBuffer, fromPeerId: string) => {
    if (!roomKeyRef.current || !identity) return
    try {
      const wire = decodeMessage(data)
      const sigData = utf8ToBytes(`${wire.id}${wire.type}${wire.channel}`)
      if (!verify(hexToBytes(wire.from), sigData, wire.sig)) return

      // Gossip forward via WebRTC
      if (wire.from !== bytesToHex(identity.publicKey)) {
        const encoded = encodeMessage(wire)
        gossipRef.current.route(wire.id, encoded, wire.ttl - 1, wire.type === 'sos')
      }

      if (wire.type === 'ping') return

      const plaintext = decrypt(roomKeyRef.current, wire.payload)
      const text = new TextDecoder().decode(plaintext)

      if (wire.type === 'sos') {
        sosvibrate()
        setSOSAlert({ from: wire.from, text, ts: wire.ts })
      }

      safeInsert({
        id: wire.id, channel: wire.channel, from: wire.from,
        alias: wire.from.slice(0, 8), text, ts: wire.ts,
        type: wire.type as 'chat' | 'sos' | 'system',
      })
      void fromPeerId
    } catch { /* malformed — drop */ }
  }, [identity, setSOSAlert])

  const createPeerConnection = useCallback((peerId: string, isInitiator: boolean) => {
    if (pcsRef.current.size >= MAX_PEERS) return null
    const pc = new RTCPeerConnection(buildRTCConfig())
    pcsRef.current.set(peerId, pc)

    let dc: RTCDataChannel
    if (isInitiator) {
      dc = pc.createDataChannel('nearchat', { ordered: false, maxRetransmits: 3 })
      setupDataChannel(dc, peerId)
    } else {
      pc.ondatachannel = (e) => setupDataChannel(e.channel, peerId)
    }

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        wsRef.current?.send(JSON.stringify({ type: 'ice', to: peerId, candidate: e.candidate }))
      }
    }

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        removePeerConn(peerId)
      }
    }

    return pc
  }, [])

  function setupDataChannel(dc: RTCDataChannel, peerId: string) {
    channelsRef.current.set(peerId, dc)
    dc.binaryType = 'arraybuffer'
    dc.onopen = () => {
      addPeer(peerId)
      setConnected(true)
      reconnectDelayRef.current = 1000
      gossipRef.current.addPeer(peerId, (data) => {
        if (dc.readyState === 'open') dc.send(data as Uint8Array<ArrayBuffer>)
      })
    }
    dc.onmessage = (e) => handleBinaryMessage(e.data, peerId)
    dc.onclose = () => removePeerConn(peerId)
  }

  function connectSignaling() {
    if (!roomConfig) return
    // Always try ws:// first (works when app is loaded from local HTTP server)
    // On HTTPS the browser will block ws:// — in that case fall back to wss://
    const isSecure = window.location.protocol === 'https:'
    const wsUrl = `${isSecure ? 'wss' : 'ws'}://${roomConfig.seedIp}:3000`
    let ws: WebSocket
    try {
      ws = new WebSocket(wsUrl)
    } catch {
      return
    }
    wsRef.current = ws

    ws.onopen = () => {
      setConnected(true)
      reconnectDelayRef.current = 1000
      ws.send(JSON.stringify({
        type: 'join',
        roomId: roomConfig.roomId,
        peerId: bytesToHex(identity!.publicKey),
      }))
    }

    ws.onmessage = async (e) => {
      try {
        const msg = JSON.parse(e.data)

        // ── Primary path: relay messages from other peers ──────────
        if (msg.type === 'relay' && msg.data) {
          const { id, channel, from, text, ts, msgType, alias: senderAlias } = msg.data
          if (!id || !from || !text) return
          safeInsert({
            id, channel: channel ?? 'general', from,
            alias: senderAlias ?? from.slice(0, 8),
            text, ts: ts ?? Date.now(),
            type: (msgType ?? 'chat') as 'chat' | 'sos' | 'system',
          })
          if (msgType === 'sos') {
            sosvibrate()
            setSOSAlert({ from, text, ts: ts ?? Date.now() })
          }
          return
        }

        // ── WebRTC signaling ────────────────────────────────────────
        if (msg.type === 'peers') {
          for (const peerId of msg.peers) {
            if (peerId === bytesToHex(identity!.publicKey)) continue
            if (pcsRef.current.has(peerId)) continue
            const pc = createPeerConnection(peerId, true)
            if (!pc) continue
            const offer = await pc.createOffer()
            await pc.setLocalDescription(offer)
            ws.send(JSON.stringify({ type: 'offer', to: peerId, sdp: offer }))
          }
        }
        if (msg.type === 'offer') {
          const pc = createPeerConnection(msg.from, false)
          if (!pc) return
          await pc.setRemoteDescription(msg.sdp)
          const answer = await pc.createAnswer()
          await pc.setLocalDescription(answer)
          ws.send(JSON.stringify({ type: 'answer', to: msg.from, sdp: answer }))
        }
        if (msg.type === 'answer') {
          await pcsRef.current.get(msg.from)?.setRemoteDescription(msg.sdp)
        }
        if (msg.type === 'ice') {
          await pcsRef.current.get(msg.from)?.addIceCandidate(msg.candidate)
        }
      } catch { /* ignore parse errors */ }
    }

    ws.onclose = () => {
      setConnected(pcsRef.current.size > 0)
      // Reconnect with backoff
      const delay = reconnectDelayRef.current
      reconnectDelayRef.current = Math.min(delay * 2, 30_000)
      setTimeout(connectSignaling, delay)
    }
    ws.onerror = () => ws.close()
  }

  // ── Public: send a chat message ────────────────────────────────────
  const sendMessage = useCallback((text: string, channel: string, isSOS = false) => {
    if (!identity) return
    const msgId = uuid()
    const myId = bytesToHex(identity.publicKey)
    const myAlias = useStore.getState().alias || myId.slice(0, 8)
    const ts = Date.now()
    const msgType = isSOS ? 'sos' : 'chat'

    // 1. Insert own message immediately (local display)
    safeInsert({ id: msgId, channel, from: myId, alias: 'You', text, ts, type: msgType })

    // 2. Relay through WebSocket (primary path — server broadcasts to all peers)
    const ws = wsRef.current
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'relay',
        data: { id: msgId, channel, from: myId, alias: myAlias, text, ts, msgType },
      }))
    }

    // 3. Also send via WebRTC data channels if any are open (secondary path)
    if (roomKeyRef.current) {
      try {
        const plaintext = new TextEncoder().encode(text)
        const payload = encrypt(roomKeyRef.current, plaintext)
        const sigData = utf8ToBytes(`${msgId}${msgType}${channel}`)
        const sig = sign(identity.privateKey, sigData)
        const wire: WireMessage = {
          id: msgId, type: msgType as WireMessage['type'], channel,
          from: myId, payload, ttl: isSOS ? 5 : 3, ts, compressed: false, sig,
        }
        const encoded = encodeMessage(wire)
        const priority = isSOS ? 0 : 2
        qosRef.current.enqueue(encoded, priority)
      } catch { /* WebRTC encoding failure — WS relay already sent */ }
    }
  }, [identity])

  useEffect(() => {
    if (!roomConfig || !identity) return
    roomKeyRef.current = deriveRoomKey(hexToBytes(roomConfig.cryptoSalt), roomConfig.roomId)
    qosRef.current.start()

    // Init CRDT first, then connect (fixes race where insertMessage drops early messages)
    initCRDT(roomConfig.roomId).then(() => {
      crdtReadyRef.current = true
      connectSignaling()
    })

    registerVisibilityKeepalive(() => {
      wsRef.current?.send(JSON.stringify({ type: 'relay', data: null })) // keepalive ping
    })

    const stopMonitor = startLinkMonitor(
      () => pcsRef.current,
      (stats) => setLinkStats(stats)
    )
    return () => {
      stopMonitor()
      qosRef.current.stop()
      wsRef.current?.close()
      for (const pc of pcsRef.current.values()) pc.close()
    }
  }, [roomConfig, identity])

  return { sendMessage, linkStats }
}
