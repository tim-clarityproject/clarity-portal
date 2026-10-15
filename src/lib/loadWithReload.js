// Stale-file recovery for lazily loaded code.
//
// A tab opened before a new deploy still asks for build files the new deploy
// no longer has (their names carry a hash). When such a load fails, reloading
// the page once picks up the new deploy. A flag in sessionStorage makes sure it
// can never loop: if the reload already happened in the last 30 seconds, the
// error is passed on so the page's own calm error message shows.
const KEY = 'clarity-chunk-reload-at';
const WINDOW_MS = 30000;

/**
 * @template T
 * @param {() => Promise<T>} factory e.g. () => import('./Page')
 * @returns {Promise<T>}
 */
export function loadWithReload(factory) {
  return factory().catch((error) => {
    try {
      const last = Number(sessionStorage.getItem(KEY));
      if (last && Date.now() - last < WINDOW_MS) throw error;
      sessionStorage.setItem(KEY, String(Date.now()));
    } catch {
      // No usable storage (or reloaded just now): we cannot guard a reload, so
      // do not reload. Report the original failure.
      throw error;
    }
    window.location.reload();
    return new Promise(() => {}); // the page is going away
  });
}
