import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Relative base: the production build is copied into a subfolder of the GitHub Pages site
// (scripts/deploy-web.sh -> https://nkohen.github.io/human-chess/), and hash routing means the
// pathname never changes, so every asset can be addressed relative to index.html. Dev and the
// screenshot harness still serve from the root and are unaffected.
export default defineConfig({
  base: './',
  plugins: [
    react(),
    // Installable PWA + offline app shell. The app is used from a phone, where iOS evicts
    // background tabs; a precached shell means it still opens (and every screen already survives a
    // reload — docs/design/2026-09-18-reload-survival.md — so `autoUpdate` reloading into a new
    // version is safe). Relative `scope`/`start_url` keep it working under the /human-chess/
    // subpath it deploys to. The SW is a build-only artefact: `devOptions.enabled` is false, so
    // `dev`, the screenshot harness and the local reload-smoke (all the Vite dev server) never
    // register it.
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'human-chess',
        short_name: 'human-chess',
        description: 'Chess learning, analysis and training tools, and mini-games.',
        lang: 'en',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#14181b',
        theme_color: '#14181b',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        // Precache the app shell (JS/CSS/HTML/icons). SPA navigations fall back to index.html.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: 'index.html',
        // The Stockfish engine (a ~1.8 MB wasm + its loader) is not precached — that would bloat
        // the install — but it is cached on first use so analysis keeps working offline afterward.
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes('/engine/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'hc-engine',
              expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
});
