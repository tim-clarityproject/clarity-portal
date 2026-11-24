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

// The client pages' shared code in one part (the scale check, step 3). Each
// page is its own part (App.jsx page()), and the code they share (the design
// parts, the performance system, scores, time, own questions, peak moments,
// travel) would otherwise come as some 35 small files, each a round trip on
// a phone before the first screen. Anything the app's opening part already
// holds stays there, so the opening download never grows.
const CLIENT_CORE = /\/src\/(components\/(design|ownQuestions|ui)|lib\/(performance|scores|time|ownQuestions|peakMoments|travel))\//
function clientCoreChunks() {
  let opening = null // every module the opening part reaches by static imports
  return {
    // Only the modules named below: what they import stays where it was.
    includeDependenciesRecursively: false,
    groups: [{
      name(id, ctx) {
        if (!CLIENT_CORE.test(id)) return null
        if (!opening) {
          opening = new Set()
          const main = findMain(ctx, id)
          const queue = main ? [main] : []
          while (queue.length) {
            const m = queue.pop()
            if (opening.has(m)) continue
            opening.add(m)
            for (const next of ctx.getModuleInfo(m)?.importedIds || []) queue.push(next)
          }
        }
        return opening.has(id) ? null : 'client-core'
      },
    }],
  }
}
// The app's opening module, found by walking up from any module.
function findMain(ctx, from) {
  const seen = new Set()
  const queue = [from]
  while (queue.length) {
    const m = queue.pop()
    if (seen.has(m)) continue
    seen.add(m)
    if (/\/src\/main(\.preview)?\.jsx$/.test(m)) return m
    const info = ctx.getModuleInfo(m)
    for (const up of [...(info?.importers || []), ...(info?.dynamicImporters || [])]) queue.push(up)
  }
  return null
}

// The opening page's part of the app, asked for by index.html itself (the
// scale check, step 3). Each page is its own part (App.jsx page()), and the
// app asks for the opening one as soon as its own code has run; on a phone
// that is some 350 ms after the first files arrive. A few lines in <head>
// name the opening page's files (from this build) for the address being
// opened, so they come down alongside the app's own. The same list as
// App.jsx's OPENING_PAGES; an address not named here loads as before.
const OPENING = [
  ['^/welcome$', 'src/pages/Home.jsx'],
  ['^/daily-plan(/|$)', 'src/pages/performance/PlanMyDay.jsx'],
  ['^/daily-review(/|$)', 'src/pages/performance/ReviewMyDay.jsx'],
  ['^/performance-sprint/debrief(/|$)', 'src/pages/performance/WeeklyDebrief.jsx'],
  ['^/performance-sprint$', 'src/pages/performance/PerformanceSprint.jsx'],
  ['^/performance-plan$', 'src/pages/performance/PerformancePlan.jsx'],
  ['^/dashboard$', 'src/pages/performance/Dashboard.jsx'],
  ['^/monthly-review(/|$)', 'src/pages/performance/CheckIn.jsx'],
  ['^/my-account$', 'src/pages/MyAccount.jsx'],
  ['^/my-plans$', 'src/pages/MyPlans.jsx'],
  ['^/my-reviews$', 'src/pages/MyReviews.jsx'],
  ['^/breathe$', 'src/pages/BreathingPage.jsx'],
  ['^/auth/login$', 'src/pages/signin/SignIn.jsx'],
  ['^/coach/sign-in$', 'src/pages/signin/SignIn.jsx'],
  ['^/coach/sign-in/code$', 'src/pages/signin/CoachCode.jsx'],
  // The coach portal, with the page each first screen draws (coach first screen run): Today, Clients, a client's page
  // and the calendar come with the portal's own part, so neither waits for the other.
  ['^/coach$', ['src/pages/coach/CoachApp.jsx', 'src/pages/coach/Today.jsx']],
  ['^/coach/clients$', ['src/pages/coach/CoachApp.jsx', 'src/pages/coach/Clients.jsx']],
  ['^/coach/clients/[0-9a-fA-F-]{36}$', ['src/pages/coach/CoachApp.jsx', 'src/pages/coach/ClientPage.jsx']],
  ['^/coach/calendar$', ['src/pages/coach/CoachApp.jsx', 'src/pages/coach/Calendar.jsx']],
  ['^/coach(/|$)', 'src/pages/coach/CoachApp.jsx'],
]
function openingPreload() {
  return {
    name: 'clarity-opening-preload',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const bundle = ctx.bundle
        if (!bundle) return html
        const chunks = Object.values(bundle).filter((c) => c.type === 'chunk')
        const byName = new Map(chunks.map((c) => [c.fileName, c]))
        // The portal's page (index.html); the outside Health Check is built apart.
        const entry = chunks.find((c) => c.isEntry && /\/index\.html$/.test(c.facadeModuleId || ''))
        if (!entry) return html
        // What index.html already loads.
        const have = new Set()
        const walk = (name, into) => {
          if (into.has(name)) return
          into.add(name)
          for (const next of byName.get(name)?.imports || []) walk(next, into)
        }
        walk(entry.fileName, have)
        const files = (modulePaths) => {
          const js = new Set()
          for (const modulePath of [modulePaths].flat()) {
            const page = chunks.find((c) => (c.facadeModuleId || '').endsWith(`/${modulePath}`))
            if (!page) return null
            walk(page.fileName, js)
          }
          const list = [...js].filter((f) => !have.has(f))
          return { js: list.map((f) => `/${f}`) }
        }
        const map = OPENING.map(([pattern, modulePath]) => [pattern, files(modulePath)]).filter(([, f]) => f)
        const home = files('src/pages/Home.jsx')
        const signIn = files('src/pages/signin/SignIn.jsx')
        const code = `(function(){try{var m=${JSON.stringify(map)},h=${JSON.stringify(home)},s=${JSON.stringify(signIn)};`
          + `var p=location.pathname.replace(/\\/+$/,'')||'/',f=null;`
          + `if(p==='/'){f=localStorage.getItem('clarity-portal-auth')?h:s}else{for(var i=0;i<m.length;i++){if(new RegExp(m[i][0]).test(p)){f=m[i][1];break}}}`
          + `if(!f)return;var add=function(rel,href){var l=document.createElement('link');l.rel=rel;l.href=href;l.crossOrigin='';document.head.appendChild(l)};`
          // Its styles come with its code as before: asked for here they
          // would hold up the app's own first paint.
          + `f.js.forEach(function(x){add('modulepreload',x)})}catch(e){}})();`
        // The two faces every first screen sets its words in (DM Sans, and
        // Nekst for the title), asked for with the page itself: without this
        // the browser found them only once the first words were drawn, so on
        // a first visit the words showed in the fallback font and then
        // changed (font-display: swap; UI tester, scale check).
        const dmSans = Object.values(bundle).find((a) => a.type === 'asset' && /^assets\/dm-sans-latin-opsz-normal-[^/]+\.woff2$/.test(a.fileName))
        const fonts = [dmSans && `/${dmSans.fileName}`, '/fonts/Nekst-Regular.woff2'].filter(Boolean)
          .map((href) => ({ tag: 'link', injectTo: 'head', attrs: { rel: 'preload', href, as: 'font', type: 'font/woff2', crossorigin: '' } }))
        return { html, tags: [...fonts, { tag: 'script', injectTo: 'head', children: code }] }
      },
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ command }) => {
  const galleryEnabled = command === 'serve' || process.env.VERCEL_ENV === 'preview'
  const buildId = command === 'serve' ? 'dev' : (process.env.VERCEL_GIT_COMMIT_SHA || String(Date.now()))
  return {
    plugins: [react(), colourMode(), designGallery(galleryEnabled), buildVersion(buildId), serviceWorker(buildId, process.env.VERCEL_ENV === 'preview'), healthCheckPage(buildId), openingPreload()],
    // __CLARITY_LIVE__: true only in the live site's build. The coach portal
    // shows pages still to come, and takes test calls for the next-call bar,
    // everywhere else (previews, local builds), never on the live site.
    define: { __BUILD_ID__: JSON.stringify(buildId), __CLARITY_LIVE__: JSON.stringify(process.env.VERCEL_ENV === 'production') },
    build: { rolldownOptions: { output: { codeSplitting: clientCoreChunks() } } },
  }
})
