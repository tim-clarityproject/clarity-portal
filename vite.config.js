import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { defineConfig, build } from 'vite'
import react from '@vitejs/plugin-react'
import { join, resolve } from 'node:path'
import { trimStyles } from './scripts/build/trimStyles.mjs'

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
// every page follows the choice since 10 Nov), so the live site looks
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

// The service worker (Phase 4 step 8: the portal opens with no
// connection). src/serviceWorker/worker.js is written by hand; at build
// time it gets one line in front naming this build and every file to keep
// on the device, and is written to /sw.js. The list is the portal's own
// build (this pass only, so the outside Health Check's files, built in the
// second pass, are never in it) and public/ (fonts, brand images, icons).
// Left out: version.json, maps, the design gallery's own files (preview
// builds only), the Quick guide's videos and captions (left to the network),
// and the Chinese font parts a PDF fetches only when it has
// Chinese text (about 3 MB), which are kept once used instead.
function publicFiles(dir, base = '') {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory()
    ? publicFiles(join(dir, e.name), `${base}${e.name}/`)
    : [`${base}${e.name}`]));
}

function serviceWorker(buildId, preview) {
  let config
  return {
    name: 'clarity-service-worker',
    apply: 'build',
    enforce: 'post',
    configResolved(resolved) {
      config = resolved
    },
    generateBundle(_options, bundle) {
      const gallery = new Set()
      for (const out of Object.values(bundle)) {
        if (out.type === 'chunk' && /\/designReference\//.test(out.facadeModuleId || '')) {
          gallery.add(out.fileName)
          for (const css of out.viteMetadata?.importedCss || []) gallery.add(css)
        }
      }
      const files = [
        ...Object.keys(bundle),
        ...(config.publicDir && existsSync(config.publicDir) ? publicFiles(config.publicDir) : []),
      ].filter((f) => !gallery.has(f) && !/\.map$/.test(f) && f !== 'version.json' && f !== 'sw.js' && !/(^|\/)\.[^/]+$/.test(f)
        // The Quick guide's videos and captions (about 11 MB) stay with the
        // network: never downloaded up front, and a browser asks for a video
        // a piece at a time, which a kept whole file can't answer in Safari.
        && !/\.(mp4|vtt)$/.test(f))
      const onDemand = files.filter((f) => /noto-sans-sc-/.test(f))
      const precache = [...new Set(files.filter((f) => !onDemand.includes(f)))].map((f) => `/${f}`).sort()
      // preview: a Vercel preview build (a branch address or a deployment's
      // own), where the worker always opens the newest build (worker.js).
      const head = `self.__CLARITY_BUILD__ = ${JSON.stringify({ id: buildId, preview, precache, onDemand: onDemand.map((f) => `/${f}`) })};\n`
      const body = readFileSync(new URL('./src/serviceWorker/worker.js', import.meta.url), 'utf8')
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: head + body })
    },
  }
}

// The outside Strategic Alignment Health Check is its own small page
// (health-check.html; vercel.json serves it for /health-check/*). It is built
// in a second, separate pass once the portal's build has finished, into the
// same folder, so the two never share a file: the portal's build is exactly
// what it would be without the Health Check page. The page follows the
// device's light or dark (the colour mode boot does that for /health-check),
// and gets no gallery or version file.
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
        // The colour mode is set before the first paint here too: the page is
        // built from the portal's shared parts, whose colours follow it.
        // Only the styles the page's own code can use (follow-up 1, step 4):
        // the portal's whole stylesheet trimmed to the classes it names.
        plugins: [react(), colourMode(), trimStyles()],
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
    plugins: [react(), colourMode(), designGallery(galleryEnabled), buildVersion(buildId), serviceWorker(buildId, process.env.VERCEL_ENV === 'preview'), healthCheckPage(buildId)],
    define: { __BUILD_ID__: JSON.stringify(buildId) },
  }
})
