import { useCallback, useEffect, useRef, useState } from 'react';
import { deviceKey, readJson, writeJson } from './deviceStore';
import { isNetworkError, subscribeOnline } from './connection';
import { changesMade, subscribeQueue, waitingToSend, whenSent } from './syncQueue';

// Instant pages (Tim, 26 Oct): a page shows the data it showed last time
// straight away, from a copy on the device, then refreshes quietly in the
// background and swaps in the new data in the same layout, with no jump.
// The turning-crosshair loader only shows on a first visit, when there is
// no copy yet. Offline, the copy stays on screen and the page says it is
// offline (ConnectionNotice) instead of an error.
//
// A refresh never puts an older copy over the person's own change (quick
// ticks, 30 Oct: three quick ticks, then a refresh that had read the rows
// just before they saved landed after them and showed them unticked). So
// a refresh reads only once this window's saves have been sent; one that
// sees a change made on the page, or a save made, while it loads is set
// aside and done again once the page has been still for a moment; and
// while saves wait on the device to be sent, the screen keeps the
// person's changes and refreshes when the queue has sent them. Only the
// newest refresh is shown, so an earlier one answering late never wins.
const STILL_MS = 1000; // longer than any page's save delay (700 to 800ms)
const TRIES = 5;
const pause = (ms) => new Promise((r) => { setTimeout(r, ms); });

export function readCache(userId, name) {
  if (!userId) return null;
  return readJson(deviceKey('cache', userId, name));
}

export function writeCache(userId, name, data) {
  if (!userId) return;
  writeJson(deviceKey('cache', userId, name), { v: data, at: Date.now() });
}

/**
 * Loads a page's data: the device's copy first, then the server's.
 *
 * @param {object} opts
 * @param {string|null} opts.userId
 * @param {string} opts.name - which page's data, e.g. 'my-plans'
 * @param {() => Promise<*>} opts.load - fetches fresh data (throws on failure)
 * @param {Array} [opts.deps] - load again when these change
 * @returns {{ data: *, loading: boolean, error: Error|null, offline: boolean,
 *             reload: () => Promise<void>, setData: (fn) => void }}
 *   loading is true only while there is nothing at all to show yet.
 *   error is set only when there is nothing to show and the load failed.
 *   offline is true when the copy is showing because there's no connection.
 */
export function useCachedLoad({ userId, name, load, deps = [] }) {
  const [state, setState] = useState(() => {
    const cached = readCache(userId, name);
    return cached ? { data: cached.v, loading: false, error: null, offline: false } : { data: null, loading: true, error: null, offline: false };
  });
  const loadRef = useRef(load);
  loadRef.current = load;
  const live = useRef(true);
  const edits = useRef({ count: 0, at: 0 }); // changes made on the page (setData)
  const latest = useRef(0); // the newest refresh
  const afterQueue = useRef(false); // refresh once the waiting saves are sent

  const run = useCallback(async () => {
    if (!userId) return;
    latest.current += 1;
    const me = latest.current;
    try {
      for (let tries = 1; ; tries += 1) {
        // Read only after this window's saves have their answers.
        await whenSent();
        const mark = edits.current.count;
        const saves = changesMade();
        const fresh = await loadRef.current();
        if (!live.current || me !== latest.current) return;
        const changed = edits.current.count !== mark || changesMade() !== saves;
        if (!changed && waitingToSend(userId)) {
          // Saves still wait on the device: the screen has them and the
          // server doesn't yet. Refresh once they are sent.
          afterQueue.current = true;
          setState((prev) => (prev.data != null ? { ...prev, loading: false } : { data: fresh, loading: false, error: null, offline: false }));
          return;
        }
        if (!changed) {
          writeCache(userId, name, fresh);
          setState({ data: fresh, loading: false, error: null, offline: false });
          return;
        }
        // Changed on the page while loading: this answer may be older
        // than the screen. Wait until the page is still, and read again.
        if (tries >= TRIES) return;
        for (;;) {
          const left = STILL_MS - (Date.now() - edits.current.at);
          if (left <= 0) break;
          await pause(left);
        }
        if (!live.current || me !== latest.current) return;
      }
    } catch (error) {
      if (!live.current || me !== latest.current) return;
      const offline = isNetworkError(error);
      setState((prev) => (prev.data != null
        ? { ...prev, loading: false, offline }
        : { data: null, loading: false, error, offline }));
    }
  }, [userId, name]);

  useEffect(() => {
    live.current = true;
    // A different page or person: start from that one's copy.
    const cached = readCache(userId, name);
    setState(cached ? { data: cached.v, loading: false, error: null, offline: false } : { data: null, loading: true, error: null, offline: false });
    run();
    return () => { live.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, name, ...deps]);

  // Back online: refresh quietly.
  useEffect(() => subscribeOnline((on) => { if (on) run(); }), [run]);

  // Saves that waited on the device have all been sent: refresh now.
  useEffect(() => subscribeQueue(() => {
    if (afterQueue.current && !waitingToSend(userId)) {
      afterQueue.current = false;
      run();
    }
  }), [run, userId]);

  // A change made on the page (a delete, a rename) updates the copy too.
  const setData = useCallback((fn) => {
    edits.current = { count: edits.current.count + 1, at: Date.now() };
    setState((prev) => {
      const data = typeof fn === 'function' ? fn(prev.data) : fn;
      writeCache(userId, name, data);
      return { ...prev, data };
    });
  }, [userId, name]);

  return { ...state, reload: run, setData };
}
