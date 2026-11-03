import { sendingNow } from './syncQueue';
import { checkForNewWorker, onWorkerWaiting, registerServiceWorker, serviceWorkerSupported, takeOver, workerWaiting } from './serviceWorker';

// Quiet updates (Tim, 26 Oct): the installed web app updates itself. A new
// version is noticed in the background (each build writes its id to
// /version.json, see vite.config.js) and loads on the next open: when the
// app comes back to the screen after being away, never while someone is
// in the middle of something. A page never stays stale after a deploy:
// opening the app from cold always fetches the new index.html (vercel.json
// keeps it uncached), and a tab left open picks it up on its next return.
// Lazily loaded pages also reload once if their old files have gone
// (loadWithReload.js).
//
// With the service worker (Phase 4 step 8), the app's files come from the
// device, so a reload alone would open the same version again. A new
// version is installed by the worker in the background and waits; when
// it is safe (the page hidden or coming back after a while, nobody typing,
// no dialog open, nothing being sent) the waiting version takes over and
// the page reloads into it. Otherwise it takes over on the next full open,
// when no window still uses the old one. Drafts and saves waiting to be
// sent live on the device (drafts.js, syncQueue.js), so they are there in
// the new version, whichever way it arrives.

/* global __BUILD_ID__ */
const BUILD_ID = typeof __BUILD_ID__ === 'undefined' ? 'dev' : __BUILD_ID__;
const CHECK_EVERY_MS = 30 * 60 * 1000;
// Away at least this long counts as a new visit, not a glance elsewhere.
const AWAY_MS = 60 * 1000;
const RETRY_HIDDEN_MS = 5 * 1000;

let waiting = false;
let hiddenAt = null;
// Typing in the last few seconds counts as mid-entry, as does a field
// that still has the cursor.
const TYPING_MS = 10 * 1000;
let typedAt = 0;

async function check() {
  if (BUILD_ID === 'dev') return;
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return;
    const { id } = await res.json();
    if (id && id !== BUILD_ID) {
      waiting = true;
      // Ask the browser to fetch and install the new worker now.
      checkForNewWorker();
    }
  } catch {
    /* offline: check again later */
  }
}

function safeToReload() {
  // Saves waiting for a connection are kept on the device and survive a
  // reload (and any cut off mid-send is sent again at the start, safely:
  // syncQueue.js), but never reload while they are being sent.
  if (sendingNow()) return false;
  // Typing is kept as a draft (drafts.js), so it comes back after a
  // reload with "Draft restored"; a dialog that is open means mid-task.
  if (document.querySelector('.ds-modal--shown')) return false;
  // Never while someone is typing (Phase 4 step 8).
  if (Date.now() - typedAt < TYPING_MS) return false;
  const active = document.activeElement;
  if (active && (active.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName))) return false;
  return true;
}

// Loads the new version: through the waiting worker when there is one
// (it takes over, then the page reloads into it), else a plain reload.
// With a worker but nothing installed yet, nothing happens: a reload
// would only open the old version again. If the moment has passed by the
// time it has taken over, the reload waits for the next safe moment
// (tookOver), and the next open is the new version anyway.
let tookOver = false;
let takingOver = false;
function loadNewVersion() {
  if (serviceWorkerSupported() && navigator.serviceWorker.controller && !tookOver) {
    if (takingOver) return;
    takingOver = takeOver(() => {
      takingOver = false;
      tookOver = true;
      // Checked again: the moment may have passed while it took over.
      if (safeToReload()) window.location.reload();
    });
    return;
  }
  window.location.reload();
}

function newVersionReady() {
  if (tookOver) return true;
  if (!waiting) return false;
  if (serviceWorkerSupported() && navigator.serviceWorker.controller) return workerWaiting();
  return true;
}

export function startUpdateChecks() {
  if (typeof window === 'undefined' || BUILD_ID === 'dev') return;
  registerServiceWorker();
  // The browser's own check (on every open) found a new worker.
  onWorkerWaiting(() => { waiting = true; });
  document.addEventListener('input', () => { typedAt = Date.now(); }, true);
  check();
  window.setInterval(() => {
    if (document.visibilityState === 'visible') check();
  }, CHECK_EVERY_MS);
  let hiddenTimer = null;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now();
      // Away for a while with a new version waiting: load it while the
      // app is out of sight, so the next open is simply the new version.
      // Not safe yet (saves being sent, say): looked at again every few
      // seconds while the app stays out of sight.
      const tryHidden = () => {
        if (document.visibilityState !== 'hidden' || !newVersionReady()) return;
        if (safeToReload()) loadNewVersion();
        hiddenTimer = window.setTimeout(tryHidden, RETRY_HIDDEN_MS);
      };
      window.clearTimeout(hiddenTimer);
      hiddenTimer = window.setTimeout(tryHidden, AWAY_MS);
      return;
    }
    window.clearTimeout(hiddenTimer);
    const away = hiddenAt != null && Date.now() - hiddenAt >= AWAY_MS;
    hiddenAt = null;
    if (newVersionReady() && away && safeToReload()) {
      loadNewVersion();
      return;
    }
    check();
  });
}
