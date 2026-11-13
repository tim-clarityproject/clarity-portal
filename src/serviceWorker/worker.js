/* The Clarity Portal's service worker (Phase 4 step 8: the portal opens
   with no connection; decisions part 2, "Works on a flight").

   It keeps the app itself on the device, so the portal opens from the Home
   Screen on a plane. It is written by hand and finished at build time
   (vite.config.js, clarityServiceWorker): the build puts in front of this
   file one line, self.__CLARITY_BUILD__ = { id, precache, onDemand }, with
   every file of the portal's build and the fonts and brand images in
   public/. Nothing here is run in development.

   What it does:
   - Every file of this version is saved on the device when the worker
     installs, before it may take over, so any page opens offline, even one
     never opened before.
   - Opening any of the portal's own pages serves this version's saved
     index.html (the app then shows the page). The app's data comes from
     the app's own copies on the device (src/lib/pageCache.js), never from
     here: nothing from the database or the sign-in is ever kept by this
     worker, and nothing on another site is touched.
   - Left alone completely, straight to the network as if this worker did
     not exist: the outside Health Check (health-check.html, /health-check/
     and everything its page asks for, even the font files it shares with
     the portal), /api/, the design
     reference, the addresses a sign-in email link or Google comes back to
     (/auth/google, /auth/confirmed, /auth/invite, /auth/reset-password,
     and the older /auth/callback, /auth/mission, /email-confirmation and
     /check-email-confirmation),
     /version.json and this file.
   - A new version waits (no skipWaiting on install). It takes over on the
     next full open, or when the app asks it to: only while the page is
     hidden and nobody is typing (src/lib/serviceWorker.js, appUpdate.js).
     The last version's files are kept until the one after, so a window
     still running it never loses a file it needs.
   - A preview build (Vercel's branch address and each deployment's own,
     never the live site) always opens the newest build (Tim, 10 Nov: the
     branch address showed the build before the newest push, because a
     fixed address kept its saved copy until the next full open). There a
     page comes from the network first, with the saved copy only when
     there is no connection, and a new worker takes over as soon as it has
     installed. The live site is unchanged. */

const BUILD = self.__CLARITY_BUILD__;
const PREFIX = 'clarity-app-';
const CACHE = `${PREFIX}${BUILD.id}`;
// Big font parts only a few PDFs need (Chinese text): kept once used.
const ON_DEMAND_CACHE = 'clarity-on-demand';
const PREVIEW = Boolean(BUILD.preview);
// How long a preview waits for the network before showing its saved copy.
const PREVIEW_WAIT_MS = 4000;
const PRECACHE = new Set(BUILD.precache);
const ON_DEMAND = new Set(BUILD.onDemand);

// Paths that always go to the network, untouched.
const NETWORK_ONLY = [
  /^\/api\//,
  /^\/health-check(\/|\.html$|$)/,
  /^\/design-reference(\/|$)/,
  /^\/email-preview(\/|$)/,
  /^\/auth\/callback(\/|$)/,
  /^\/auth\/google(\/|$)/,
  /^\/auth\/confirmed(\/|$)/,
  /^\/auth\/mission(\/|$)/,
  /^\/auth\/invite(\/|$)/,
  /^\/auth\/reset-password(\/|$)/,
  /^\/email-confirmation(\/|$)/,
  /^\/check-email-confirmation(\/|$)/,
  /^\/version\.json$/,
  /^\/sw\.js$/,
];
const networkOnly = (path) => NETWORK_ONLY.some((re) => re.test(path));
const isFile = (path) => /\.[a-z0-9]+$/i.test(path) && !path.endsWith('.html');

// Asked for by a page or file that isn't the portal's (the outside
// Health Check shares a few font files with the portal): left alone, so
// that page loads exactly as it would with no worker at all. A request
// says who asked through its referrer: the page, or the stylesheet or
// script that asked for it.
function askedByOutside(request) {
  if (!request.referrer) return false;
  const from = new URL(request.referrer);
  if (from.origin !== self.location.origin) return false;
  const path = from.pathname;
  if (networkOnly(path)) return true;
  return isFile(path) && !PRECACHE.has(path) && !ON_DEMAND.has(path);
}

self.addEventListener('install', (event) => {
  // Fresh copies, never the browser's own cache of an older file.
  event.waitUntil(caches.open(CACHE)
    .then((cache) => cache.addAll([...PRECACHE].map((url) => new Request(url, { cache: 'reload' }))))
    // A preview never waits: the newest build looks after the next page opened.
    .then(() => (PREVIEW ? self.skipWaiting() : undefined)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Keep this version and the one before it; anything older goes.
    const mine = (await caches.keys()).filter((k) => k.startsWith(PREFIX) && k !== CACHE);
    const keep = mine.slice(-1);
    await Promise.all(mine.filter((k) => !keep.includes(k)).map((k) => caches.delete(k)));
    // Font parts no version lists any more.
    const od = await caches.open(ON_DEMAND_CACHE);
    for (const req of await od.keys()) {
      if (!ON_DEMAND.has(new URL(req.url).pathname)) await od.delete(req);
    }
    // A first install looks after the page that installed it at once, so
    // the very first visit is already on the device.
    await self.clients.claim();
  })());
});

// The app asks the waiting version to take over (only when nobody is mid-entry).
self.addEventListener('message', (event) => {
  if (event.data?.type === 'clarity-take-over') self.skipWaiting();
});

async function fromCache(path) {
  const own = await caches.open(CACHE);
  return (await own.match(path)) || caches.match(path);
}

// A preview's page: the newest build from the network, or the saved copy
// when there's no connection (or no answer within a few seconds).
async function freshPage(request) {
  let timer;
  const late = new Promise((resolve) => { timer = setTimeout(() => resolve(null), PREVIEW_WAIT_MS); });
  try {
    const fresh = await Promise.race([fetch(request), late]);
    if (fresh && fresh.status < 500) return fresh;
  } catch {
    // No connection: the saved copy.
  } finally {
    clearTimeout(timer);
  }
  return null;
}

async function page(request) {
  if (PREVIEW) {
    const fresh = await freshPage(request);
    if (fresh) return fresh;
  }
  const saved = await fromCache('/index.html');
  if (saved) return saved;
  return fetch(request);
}

async function file(request, path) {
  const saved = await fromCache(path);
  if (saved) return saved;
  const response = await fetch(request);
  if (response.ok && ON_DEMAND.has(path)) {
    const copy = response.clone();
    caches.open(ON_DEMAND_CACHE).then((c) => c.put(path, copy)).catch(() => {});
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // Another site (the database, the sign-in, fonts elsewhere): untouched.
  if (url.origin !== self.location.origin) return;
  const path = url.pathname;
  if (networkOnly(path)) return;
  if (request.mode === 'navigate') {
    // A file opened on its own (an image, a PDF font) is a file, not a page.
    if (isFile(path)) return;
    event.respondWith(page(request));
    return;
  }
  if (askedByOutside(request)) return;
  if (PRECACHE.has(path) || ON_DEMAND.has(path)) event.respondWith(file(request, path));
  // Anything else on this site goes to the network as usual.
});
