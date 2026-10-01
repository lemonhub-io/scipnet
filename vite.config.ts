import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cloudflare } from '@cloudflare/vite-plugin';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    cloudflare(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        id: '/',
        name: 'SCiPNET — Foundation Personnel Terminal',
        short_name: 'SCiPNET',
        description:
          'SCiPNET — SCP Foundation internal personnel terminal. File documents, append addenda, maintain departmental records. Secure. Contain. Protect.',
        lang: 'en',
        dir: 'ltr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#fbfbfa',
        theme_color: '#0a0a09',
        categories: ['social', 'utilities'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        shortcuts: [
          { name: 'Site Directives', url: '/c/announcements', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
          { name: 'Personnel Commons', url: '/c/general', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
          { name: 'Network API', url: '/docs', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff,woff2}'],
        // Push handler for browsers without declarative push (Chrome/Firefox).
        // Safari displays declarative (web_push: 8030) payloads natively.
        importScripts: ['push-handler.js'],
        // Cloudflare assets 307-redirect /index.html → /, which fails precaching.
        // Cache the app shell under '/' (same revision hash) and fall back to it.
        manifestTransforms: [
          (entries) => ({
            manifest: entries.map((e) => (e.url === 'index.html' ? { ...e, url: '/' } : e)),
          }),
        ],
        navigateFallback: '/',
        navigateFallbackDenylist: [/^\/api\//, /^\/media\//],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        runtimeCaching: [
          {
            urlPattern: /\/api\/(threads|categories|users|replies)(\/|\?|$)/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'scipnet-api',
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 100, maxAgeSeconds: 86400 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            urlPattern: /\/media\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'scipnet-media',
              expiration: { maxEntries: 200, maxAgeSeconds: 30 * 86400 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],
  build: {
    outDir: 'dist/client',
  },
});
