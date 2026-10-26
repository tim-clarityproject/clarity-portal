import { queueState } from './syncQueue';

// Quiet updates (Tim, 26 Oct): the installed web app updates itself. A new
// version is noticed in the background (each build writes its id to
// /version.json, see vite.config.js) and loads on the next open: when the
// app comes back to the screen after being away, never while someone is
// in the middle of something. A page never stays stale after a deploy:
// opening the app from cold always fetches the new index.html (vercel.json
// keeps it uncached), and a tab left open picks it up on its next return.
// Lazily loaded pages also reload once if their old files have gone
// (loadWithReload.js).

/* global __BUILD_ID__ */
const BUILD_ID = typeof __BUILD_ID__ === 'undefined' ? 'dev' : __BUILD_ID__;
const CHECK_EVERY_MS = 30 * 60 * 1000;
// Away at least this long counts as a new visit, not a glance elsewhere.
const AWAY_MS = 60 * 1000;

let waiting = false;
let hiddenAt = null;

async function check() {
  if (BUILD_ID === 'dev') return;
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return;
    const { id } = await res.json();
    if (id && id !== BUILD_ID) waiting = true;
  } catch {
    /* offline: check again later */
  }
}

function safeToReload() {
  // Saves waiting for a connection are kept on the device and survive a
  // reload, but never reload while they are being sent.
  if (queueState().waiting > 0) return false;
  // Typing is kept as a draft (drafts.js), so it comes back after a
  // reload with "Draft restored"; a dialog that is open means mid-task.
  if (document.querySelector('.ds-modal--shown')) return false;
  return true;
}

export function startUpdateChecks() {
  if (typeof window === 'undefined' || BUILD_ID === 'dev') return;
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
      hiddenTimer = window.setTimeout(() => {
        if (waiting && document.visibilityState === 'hidden' && safeToReload()) window.location.reload();
      }, AWAY_MS);
      return;
    }
    window.clearTimeout(hiddenTimer);
    const away = hiddenAt != null && Date.now() - hiddenAt >= AWAY_MS;
    hiddenAt = null;
    if (waiting && away && safeToReload()) {
      window.location.reload();
      return;
    }
    check();
  });
}
