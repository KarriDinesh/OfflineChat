# OfflineConnect — Connect Without Internet

> P2P encrypted mesh chat that works **completely offline** — no internet, no servers, no app store.

[![PWA](https://img.shields.io/badge/PWA-ready-6c63ff?style=flat-square)](https://web.dev/progressive-web-apps/)
[![WebRTC](https://img.shields.io/badge/WebRTC-P2P-00e5a0?style=flat-square)](https://webrtc.org/)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)

---

## What is OfflineConnect?

OfflineConnect lets a group of people on the **same WiFi/LAN** chat securely — without any internet connection. Just scan a QR code and start messaging.

Perfect for: 🎤 Events · 🏫 Classrooms · 🚨 Emergency Response · 👥 Teams · 🏕️ Outdoor

---

## Key Features

- **Zero-config join** — QR encodes everything, scan to auto-connect
- **E2E Encrypted** — XChaCha20-Poly1305 + Ed25519 signatures
- **6 Room Purposes** — each unlocks tailored admin features
- **Admin Controls** — Announcements, quiet mode, raise hand, lock room
- **QR Expiry + Member Cap** — automatic access control, no approval queues
- **SOS Priority** — emergency messages delivered in under 500ms
- **PWA** — installable on Android and iOS, works fully offline
- **Mobile-first** — bottom nav, safe-area, haptics

---

## Getting Started

```bash
# Install & run signaling server
cd server && npm install && npm start

# Install & run app (in another terminal)
cd app && npm install && npm run dev
```

Open `http://<your-lan-ip>:5173` on all devices on the same WiFi.

---

## Architecture

```
React + Vite PWA  <->  WebRTC P2P Mesh
Y.js CRDT         <->  Signaling Server (LAN only)
XChaCha20 E2EE    <->  No internet required
```

---

## Security Model

- **LAN-isolated** — private IPs, unreachable from the internet
- **No accounts** — ephemeral Ed25519 keypairs, generated on-device
- **Signed messages** — tampered messages silently dropped
- **Ephemeral** — no messages stored on any server
- **QR expiry** — invite codes auto-expire

---

## Project Structure

```
nearchat/
├── app/          # Vite + React PWA
│   └── src/
│       ├── pages/       # Setup, Join, Chat
│       ├── components/  # InstallBanner, SideNav
│       ├── hooks/       # useP2P, useInstallPrompt
│       ├── lib/         # crypto, crdt, roles
│       └── store/       # Zustand state
└── server/       # Node.js signaling server
```

---

Built by **Dinesh Karri** — [www.dineshkarri.in](https://www.dineshkarri.in)

MIT License
