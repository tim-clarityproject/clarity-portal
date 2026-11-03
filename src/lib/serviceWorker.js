// The service worker on the page's side (Phase 4 step 8: the portal opens
// with no connection). The worker itself is src/serviceWorker/worker.js,
// built to /sw.js; it keeps the app's own files on the device so the
// portal opens from the Home Screen with no signal.
//
// Registered only in a production build (never in development, where Vite
// serves the files), and never from the outside Health Check, whose page
// is its own build and never loads this file.
//
// A new version installs quietly and waits. It takes over only when
// appUpdate.js says it's safe (the page hidden, nobody typing, nothing
// being sent), or by itself on the next full open, when no window is
// still using the old one.

/* global __BUILD_ID__ */
const BUILD_ID = typeof __BUILD_ID__ === 'undefined' ? 'dev' : __BUILD_ID__;

let registration = null;
const waitingListeners = new Set();

export function serviceWorkerSupported() {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator && BUILD_ID !== 'dev' && import.meta.env.PROD;
}

function announceWaiting() {
  waitingListeners.forEach((fn) => fn());
}

function watch(reg) {
  if (reg.waiting) announceWaiting();
  reg.addEventListener('updatefound', () => {
    const next = reg.installing;
    next?.addEventListener('statechange', () => {
      // Installed while another version looks after the page: it waits.
      if (next.state === 'installed' && navigator.serviceWorker.controller) announceWaiting();
    });
  });
}

/** Registers /sw.js once (production builds only). */
export function registerServiceWorker() {
  if (!serviceWorkerSupported() || registration) return;
  if (/^\/health-check(\/|$)/.test(window.location.pathname)) return;
  const start = () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then((reg) => {
        registration = reg;
        watch(reg);
      })
      .catch((error) => console.warn('[serviceWorker] not registered:', error?.message));
  };
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
}

/** Asks the browser to look for a newer worker (after version.json said so). */
export function checkForNewWorker() {
  registration?.update().catch(() => { /* offline: tried again later */ });
}

/** A newer version is installed and waiting to take over. */
export function workerWaiting() {
  return Boolean(registration?.waiting);
}

export function onWorkerWaiting(fn) {
  waitingListeners.add(fn);
  return () => waitingListeners.delete(fn);
}

/**
 * Lets the waiting version take over, then calls done() once it looks
 * after this page (so a reload opens the new version). Resolves false
 * when there was nothing waiting.
 */
export function takeOver(done) {
  const next = registration?.waiting;
  if (!next) return false;
  navigator.serviceWorker.addEventListener('controllerchange', () => done(), { once: true });
  next.postMessage({ type: 'clarity-take-over' });
  return true;
}
