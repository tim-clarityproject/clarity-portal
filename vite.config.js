import { readFileSync } from 'node:fs'
import { defineConfig, build } from 'vite'
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

// The outside Strategic Alignment Health Check is its own small page
// (health-check.html; vercel.json serves it for /health-check/*). It is built
// in a second, separate pass once the portal's build has finished, into the
// same folder, so the two never share a file: the portal's build is exactly
// what it would be without the Health Check page. The colour mode boot goes
// into its <head> too, so it is held in dark exactly as inside the portal;
// it has no gallery and no version file.
function healthCheckPage(buildId) {
  let config
  return {
    name: 'clarity-health-check-page',
    apply: 'build',
    configResolved(resolved) {
      config = resolved
    },
    async closeBundle() {
      await build({
        configFile: false,
        root: config.root,
        mode: config.mode,
        logLevel: config.logLevel,
        publicDir: false, // the portal's pass has already copied public/
        plugins: [react(), colourMode()],
        define: { __BUILD_ID__: JSON.stringify(buildId) },
        build: {
          outDir: config.build.outDir,
          emptyOutDir: false,
          sourcemap: config.build.sourcemap,
          rollupOptions: { input: { healthCheck: resolve(config.root, 'health-check.html') } },
        },
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ command }) => {
  const galleryEnabled = command === 'serve' || process.env.VERCEL_ENV === 'preview'
  const buildId = command === 'serve' ? 'dev' : (process.env.VERCEL_GIT_COMMIT_SHA || String(Date.now()))
  return {
    plugins: [react(), colourMode(), designGallery(galleryEnabled), buildVersion(buildId), healthCheckPage(buildId)],
    define: { __BUILD_ID__: JSON.stringify(buildId) },
  }
})
