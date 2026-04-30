import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/OfflineChat/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        name: 'OfflineConnect — Connect Without Internet',
        short_name: 'OffConn',
        description: 'P2P encrypted mesh chat. Connect with anyone nearby without internet.',
        theme_color: '#0a0a14',
        background_color: '#0a0a14',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/OfflineChat/',
        start_url: '/OfflineChat/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
        categories: ['communication', 'utilities'],
        shortcuts: [
          { name: 'Create Room', url: '/?action=create', icons: [{ src: 'icons/icon-192.png', sizes: '192x192' }] },
          { name: 'Join Room',   url: '/?action=join',   icons: [{ src: 'icons/icon-192.png', sizes: '192x192' }] },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
      // Enable SW in dev so beforeinstallprompt fires during development
      devOptions: {
        enabled: true,
        type: 'module',
      },
    }),
  ],
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
})
