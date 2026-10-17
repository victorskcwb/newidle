import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    // Installable app (milestone 2): manifest + service worker that precaches the game,
    // its maps and sprites, so it opens without a network. Off in development.
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      manifest: {
        name: 'Abismo Idle',
        short_name: 'Abismo',
        description: 'RPG idle de fantasia sombria: cace, junte loot e fique mais forte.',
        lang: 'pt-BR',
        start_url: '.',
        display: 'standalone',
        orientation: 'any',
        background_color: '#0e0d12',
        theme_color: '#0e0d12',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,json,tmj}'],
        // Source sheets and the placeholder tiles are only read by the art tools.
        globIgnores: ['vendor/**', 'sprites/placeholder_tiles.png'],
        // The Phaser bundle is larger than Workbox's 2 MB default.
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\//,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'fonts' },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  // Maps, tilesets and sprite manifests are served straight from the repo's assets/ folder.
  publicDir: fileURLToPath(new URL('../../assets', import.meta.url)),
  server: { port: 5173 },
  build: { chunkSizeWarningLimit: 2000 },
});
