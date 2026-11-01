import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Build stamp shown on the login screen so anyone can confirm which commit is
// actually live. Netlify exposes COMMIT_REF; local builds fall back to git.
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }
function commitRef(): string {
  if (process.env.COMMIT_REF) return process.env.COMMIT_REF.slice(0, 7)
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return 'dev'
  }
}

// https://vite.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_COMMIT__: JSON.stringify(commitRef()),
    __APP_BUILT_AT__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'VIK Clan - eFootball Clan Platform',
        short_name: 'VIK Clan',
        description: 'Official digital headquarters for the VIK eFootball Mobile clan.',
        lang: 'en',
        dir: 'ltr',
        theme_color: '#0a0a0a',
        background_color: '#0a0a0a',
        display: 'standalone',
        display_override: ['standalone', 'browser'],
        orientation: 'portrait',
        id: '/',
        start_url: '/',
        scope: '/',
        categories: ['sports', 'social', 'entertainment'],
        shortcuts: [
          { name: 'Next battle', url: '/home', icons: [{ src: 'pwa-192x192.png', sizes: '192x192' }] },
          { name: 'Battles', url: '/battles', icons: [{ src: 'pwa-192x192.png', sizes: '192x192' }] },
          { name: 'Competitions', url: '/competitions', icons: [{ src: 'pwa-192x192.png', sizes: '192x192' }] },
        ],
        screenshots: [
          { src: 'screenshot-wide.png', sizes: '1280x720', type: 'image/png', form_factor: 'wide' },
          { src: 'screenshot-narrow.png', sizes: '750x1334', type: 'image/png', form_factor: 'narrow' },
        ],
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,jpg,jpeg,svg,woff2,mp3}'],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,jpg,jpeg,svg,woff2,mp3}'],
      },
    }),
  ],
})
