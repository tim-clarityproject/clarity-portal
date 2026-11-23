// Stale-file recovery for lazily loaded code.
//
// A tab opened before a new deploy still asks for build files the new deploy
// no longer has (their names carry a hash). When such a load fails, reloading
// the page once picks up the new deploy. A flag in sessionStorage makes sure it
// can never loop: if the reload already happened in the last 30 seconds, the
// error is passed on so the page's own calm error message shows.
const KEY = 'clarity-chunk-reload-at';
const WINDOW_MS = 30000;

// The page is going away (a link to another address, a typed address, a
// reload): the browser stops its loads, and a part stopped that way is not a
// stale file. Reloading then would take the person back to the page they were
// leaving (the UI tester, scale check: opening the Journal straight after
// signing in came back to Home).
let leaving = false;
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => { leaving = true; });
  window.addEventListener('pagehide', () => { leaving = true; });
  window.addEventListener('pageshow', () => { leaving = false; });
}
const LEAVING_WAIT_MS = 300;

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
    // A moment first: a part stopped because the page is leaving fails just
    // before (or as) the browser says so.
    return new Promise((resolve, reject) => {
      window.setTimeout(() => {
        if (leaving) {
          try { sessionStorage.removeItem(KEY); } catch { /* none */ }
          reject(error);
          return;
        }
        window.location.reload(); // the page is going away
      }, LEAVING_WAIT_MS);
    });
  });
}
