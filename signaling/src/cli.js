/**
 * NearChat Signaling Server — Stateful WS server
 * Stores room metadata + peer list for late joiners.
 * Runs on 0.0.0.0:3000 (LAN accessible).
 */
import { WebSocketServer, WebSocket } from 'ws'
import { createServer } from 'http'
import { networkInterfaces } from 'os'
import { readFileSync, existsSync, statSync } from 'fs'
import { resolve, extname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
// Serve from app/dist (relative to project root, two levels up from signaling/src/)
const DIST_DIR = resolve(__dirname, '../../app/dist')
const HAS_DIST = existsSync(DIST_DIR)

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.woff2':'font/woff2',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
}

/** Get first non-loopback IPv4 address */
function getLanIp() {
  const nets = networkInterfaces()
  for (const addrs of Object.values(nets)) {
    for (const addr of addrs ?? []) {
      if (addr.family === 'IPv4' && !addr.internal) return addr.address
    }
  }
  return '127.0.0.1'
}
const LAN_IP = getLanIp()

const PORT = 3000

// Room state persisted in memory for the session
const rooms = new Map()   // roomId → { config, peers: Map<peerId, ws> }

const httpServer = createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }

  if (req.method === 'GET' && req.url === '/config') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ lanIp: LAN_IP, port: PORT }))
    return
  }

  if (req.method === 'POST' && req.url === '/room') {
    let body = ''
    req.on('data', chunk => body += chunk)
    req.on('end', () => {
      try {
        const config = JSON.parse(body)
        if (!rooms.has(config.roomId)) {
          rooms.set(config.roomId, { config, peers: new Map() })
          console.log(`[+] Room created: ${config.roomId.slice(0, 8)}…`)
        }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true }))
      } catch {
        res.writeHead(400); res.end('Bad Request')
      }
    })
    return
  }

  if (req.method === 'GET' && req.url?.startsWith('/room/')) {
    const roomId = req.url.replace('/room/', '')
    const room = rooms.get(roomId)
    if (!room) { res.writeHead(404); res.end(); return }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ config: room.config, peerCount: room.peers.size }))
    return
  }

  // ── Serve built app static files ─────────────────────────────────
  if (req.method === 'GET' && HAS_DIST) {
    const urlPath = (req.url ?? '/').split('?')[0]  // strip query string
    let filePath = join(DIST_DIR, urlPath === '/' ? 'index.html' : urlPath)
    // SPA fallback: if file doesn't exist, serve index.html
    if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
      filePath = join(DIST_DIR, 'index.html')
    }
    try {
      const ext = extname(filePath)
      const mime = MIME[ext] ?? 'application/octet-stream'
      res.writeHead(200, { 'Content-Type': mime, 'Access-Control-Allow-Origin': '*' })
      res.end(readFileSync(filePath))
    } catch {
      res.writeHead(404); res.end('Not found')
    }
    return
  }

  res.writeHead(200); res.end('NearChat Signaling OK')
})

const wss = new WebSocketServer({ server: httpServer })

wss.on('connection', (ws) => {
  let peerId = null
  let roomId = null

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString())

      if (msg.type === 'join') {
        peerId = msg.peerId
        roomId = msg.roomId

        // Create room if it doesn't exist (late-create)
        if (!rooms.has(roomId)) {
          rooms.set(roomId, { config: null, peers: new Map() })
        }

        const room = rooms.get(roomId)
        room.peers.set(peerId, ws)

        // Send existing peer list to new joiner
        const existingPeers = [...room.peers.keys()].filter(id => id !== peerId)
        ws.send(JSON.stringify({ type: 'peers', peers: existingPeers }))

        // If room has stored config, send it (helps late joiners)
        if (room.config) {
          ws.send(JSON.stringify({ type: 'room_config', config: room.config }))
        }

        console.log(`[+] Peer joined ${roomId.slice(0,8)}: ${peerId.slice(0,8)} (${room.peers.size} total)`)
        return
      }

      // Relay: offer / answer / ice
      if (msg.to && roomId) {
        const room = rooms.get(roomId)
        const targetWs = room?.peers.get(msg.to)
        if (targetWs?.readyState === WebSocket.OPEN) {
          targetWs.send(JSON.stringify({ ...msg, from: peerId }))
        }
      }
    } catch { /* ignore malformed */ }
  })

  ws.on('close', () => {
    if (peerId && roomId) {
      const room = rooms.get(roomId)
      room?.peers.delete(peerId)
      console.log(`[-] Peer left ${roomId?.slice(0,8)}: ${peerId?.slice(0,8)}`)
    }
  })
})

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🔗 NearChat Signaling Server`)
  console.log(`   Listening on: http://0.0.0.0:${PORT}`)
  console.log(`   Share your LAN IP with participants\n`)

  // Print LAN IPs
  try {
    const { networkInterfaces } = await import('os')
    const nets = networkInterfaces()
    for (const [name, addrs] of Object.entries(nets)) {
      for (const addr of addrs ?? []) {
        if (addr.family === 'IPv4' && !addr.internal) {
          console.log(`   📡 LAN: http://${addr.address}:${PORT}`)
        }
      }
    }
  } catch {}
  console.log('')
})
