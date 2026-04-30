/**
 * useP2P.ts — WebRTC mesh hook
 * Manages connections, signaling, gossip routing, E2EE, and CRDT sync.
 */
import { useEffect, useRef, useCallback, useState } from 'react'
import { useStore } from '../store/useStore'
import { createGossipRouter } from '../lib/gossip'
import { createQoSQueue } from '../lib/qos'
import { encodeMessage, decodeMessage, WireMessage } from '../lib/codec'
import { encrypt, decrypt, deriveRoomKey, sign, verify, hexToBytes, bytesToHex, utf8ToBytes } from '../lib/crypto'
import { applyUpdate, encodeStateVector, insertMessage } from '../lib/crdt'
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

  // QoS queue — flushes batches to all peers
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

  const sendWireMessage = useCallback((msg: Omit<WireMessage, 'sig'>) => {
    if (!identity || !roomKeyRef.current) return
    const payload = msg.payload
    const sigData = utf8ToBytes(`${msg.id}${msg.type}${msg.channel}`)
    const sig = sign(identity.privateKey, sigData)
    const wire: WireMessage = { ...msg, payload, sig }
    const encoded = encodeMessage(wire)
    const priority = msg.type === 'sos' ? 0 : msg.type === 'system' ? 1 : 2
    qosRef.current.enqueue(encoded, priority)
    // SOS: also gossip immediately with TTL=5
    if (msg.type === 'sos') {
      gossipRef.current.route(msg.id, encoded, 5, true)
    }
  }, [identity])

  const handleIncoming = useCallback((data: ArrayBuffer, fromPeerId: string) => {
    if (!roomKeyRef.current || !identity) return
    try {
      const wire = decodeMessage(data)
      // Verify signature before any processing
      const sigData = utf8ToBytes(`${wire.id}${wire.type}${wire.channel}`)
      if (!verify(hexToBytes(wire.from), sigData, wire.sig)) return

      // Gossip forward (skip own messages)
      if (wire.from !== bytesToHex(identity.publicKey)) {
        const encoded = encodeMessage(wire)
        const ttl = wire.ttl - 1
        gossipRef.current.route(wire.id, encoded, ttl, wire.type === 'sos')
      }

      if (wire.type === 'crdt') {
        applyUpdate(wire.payload)
        return
      }

      if (wire.type === 'ping') {
        // Echo pong back
        return
      }

      // Decrypt
      const plaintext = decrypt(roomKeyRef.current, wire.payload)
      const text = new TextDecoder().decode(plaintext)

      if (wire.type === 'sos') {
        sosvibrate()
        setSOSAlert({ from: wire.from, text, ts: wire.ts })
      }

      insertMessage({
        id: wire.id,
        channel: wire.channel,
        from: wire.from,
        alias: wire.from.slice(0, 8),
        text,
        ts: wire.ts,
        type: wire.type as 'chat' | 'sos' | 'system',
      })

      void fromPeerId
    } catch { /* malformed/tampered — drop silently */ }
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
        wsRef.current?.send(JSON.stringify({
          type: 'ice', to: peerId, candidate: e.candidate
        }))
      }
    }

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        removePeerConn(peerId)
        attemptReconnect()
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
      // Exchange CRDT state on connect
      const sv = encodeStateVector()
      const syncMsg: Omit<WireMessage, 'sig'> = {
        id: uuid(), type: 'system', channel: 'general',
        from: bytesToHex(identity!.publicKey),
        payload: sv, ttl: 1, ts: Date.now(), compressed: false,
      }
      sendWireMessage(syncMsg)

      gossipRef.current.addPeer(peerId, (data) => {
        if (dc.readyState === 'open') dc.send(data as Uint8Array<ArrayBuffer>)
      })
    }

    dc.onmessage = (e) => handleIncoming(e.data, peerId)
    dc.onclose = () => removePeerConn(peerId)
  }

  function attemptReconnect() {
    const delay = reconnectDelayRef.current
    reconnectDelayRef.current = Math.min(delay * 2, 30_000)
    setTimeout(connectSignaling, delay)
  }

  function connectSignaling() {
    if (!roomConfig) return
    // Use wss:// when page is HTTPS to avoid mixed-content block.
    // The local server doesn't support TLS, so wss:// will fail — but at
    // least it won't be silently blocked. Real fix: use the app from http://seedIp:3000/
    const wsProto = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${wsProto}://${roomConfig.seedIp}:3000`)
    wsRef.current = ws

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'join', roomId: roomConfig.roomId, peerId: bytesToHex(identity!.publicKey) }))
    }

    ws.onmessage = async (e) => {
      const msg = JSON.parse(e.data)
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
    }

    ws.onclose = () => {
      setConnected(pcsRef.current.size > 0)
      attemptReconnect()
    }
    ws.onerror = () => ws.close()
  }

  // Public: send a chat message
  const sendMessage = useCallback((text: string, channel: string, isSOS = false) => {
    if (!roomKeyRef.current || !identity) return
    const plaintext = new TextEncoder().encode(text)
    const payload = encrypt(roomKeyRef.current, plaintext)
    const msg: Omit<WireMessage, 'sig'> = {
      id: uuid(),
      type: isSOS ? 'sos' : 'chat',
      channel,
      from: bytesToHex(identity.publicKey),
      payload,
      ttl: isSOS ? 5 : 3,
      ts: Date.now(),
      compressed: false,
    }
    sendWireMessage(msg)
    // Insert own message locally
    insertMessage({
      id: msg.id, channel, from: msg.from,
      alias: 'You', text, ts: msg.ts,
      type: msg.type as 'chat' | 'sos',
    })
  }, [identity, sendWireMessage])

  useEffect(() => {
    if (!roomConfig || !identity) return
    roomKeyRef.current = deriveRoomKey(hexToBytes(roomConfig.cryptoSalt), roomConfig.roomId)
    qosRef.current.start()
    connectSignaling()
    registerVisibilityKeepalive(() => {
      if (!identity) return
      const ping: Omit<WireMessage, 'sig'> = {
        id: uuid(), type: 'ping', channel: 'general',
        from: bytesToHex(identity.publicKey),
        payload: new Uint8Array(), ttl: 1, ts: Date.now(), compressed: false,
      }
      sendWireMessage(ping)
    })
    // Start link quality monitor — polls WebRTC stats every 5s
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
