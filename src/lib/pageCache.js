import { useCallback, useEffect, useRef, useState } from 'react';
import { deviceKey, readJson, writeJson } from './deviceStore';
import { isNetworkError, subscribeOnline } from './connection';

// Instant pages (Tim, 26 Oct): a page shows the data it showed last time
// straight away, from a copy on the device, then refreshes quietly in the
// background and swaps in the new data in the same layout, with no jump.
// The turning-crosshair loader only shows on a first visit, when there is
// no copy yet. Offline, the copy stays on screen and the page says it is
// offline (ConnectionNotice) instead of an error.

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

  const run = useCallback(async () => {
    if (!userId) return;
    try {
      const fresh = await loadRef.current();
      if (!live.current) return;
      writeCache(userId, name, fresh);
      setState({ data: fresh, loading: false, error: null, offline: false });
    } catch (error) {
      if (!live.current) return;
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

  // A change made on the page (a delete, a rename) updates the copy too.
  const setData = useCallback((fn) => {
    setState((prev) => {
      const data = typeof fn === 'function' ? fn(prev.data) : fn;
      writeCache(userId, name, data);
      return { ...prev, data };
    });
  }, [userId, name]);

  return { ...state, reload: run, setData };
}
