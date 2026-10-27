import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

// The design gallery (/design-reference) exists only in local development
// and on Vercel preview deployments, never on the live site. Vercel sets
// VERCEL_ENV to 'production' when it builds the live site and 'preview'
// for branch builds. When the gallery is on, index.html loads
// src/main.preview.jsx instead of src/main.jsx; otherwise the build never
// sees the gallery's code at all.
//
// The colour mode (Light, Dark or Match my device) must be set before the
// first paint, so src/lib/colourMode/boot.js is inlined into <head> on
// every page of every build. It holds existing pages in dark (only the
// pages in its BOTH_MODES list follow the choice), so the live site looks
// exactly as before.
const colourModeBoot = readFileSync(new URL('./src/lib/colourMode/boot.js', import.meta.url), 'utf8')

function colourMode() {
  return {
    name: 'clarity-colour-mode',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        return { html, tags: [{ tag: 'script', injectTo: 'head', children: colourModeBoot }] }
      },
    },
  }
}

function designGallery(enabled) {
  return {
    name: 'clarity-design-gallery',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        if (!enabled) return html
        return html.replace('/src/main.jsx', '/src/main.preview.jsx')
      },
    },
  }
}

// Quiet updates (src/lib/appUpdate.js): each build has an id, baked into
// the app and written to /version.json, so an open app can tell when a
// newer version has been deployed and load it on its next open.
function buildVersion(id) {
  return {
    name: 'clarity-build-version',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ id }) })
    },
  }
}

// https://vite.dev/config/
// Two pages: the portal (index.html) and the outside Strategic Alignment
// Health Check (health-check.html), which vercel.json serves for
// /health-check/*. The colour mode boot goes into both (the Health Check's
// design parts use it); the gallery swap only ever matches index.html.
export default defineConfig(({ command }) => {
  const galleryEnabled = command === 'serve' || process.env.VERCEL_ENV === 'preview'
  const buildId = command === 'serve' ? 'dev' : (process.env.VERCEL_GIT_COMMIT_SHA || String(Date.now()))
  return {
    plugins: [react(), colourMode(), designGallery(galleryEnabled), buildVersion(buildId)],
    define: { __BUILD_ID__: JSON.stringify(buildId) },
    build: {
      rollupOptions: {
        input: {
          index: resolve(import.meta.dirname, 'index.html'),
          healthCheck: resolve(import.meta.dirname, 'health-check.html'),
        },
      },
    },
  }
})
