import { useCallback, useEffect, useRef, useState } from 'react';
import { deviceKey, readJson, removeKey, writeJson } from './deviceStore';

// Drafts (Tim, 26 Oct): typing survives a refresh or a closed tab. What
// is typed is copied to the device a moment after each change, and at
// once when the page is hidden or closed. When the page opens again, the
// draft is put back quietly and "Draft restored" shows. A draft is
// cleared once it has been saved or discarded.

const SAVE_AFTER_MS = 300;
const RESTORED_EVENT = 'clarity:draft-restored';

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function readDraft(userId, name) {
  if (!userId) return null;
  return readJson(deviceKey('draft', userId, name));
}

export function clearDraft(userId, name) {
  if (!userId) return;
  removeKey(deviceKey('draft', userId, name));
}

/** Says "Draft restored" (DraftNotices in App.jsx shows it). */
export function announceDraftRestored() {
  try {
    window.dispatchEvent(new CustomEvent(RESTORED_EVENT));
  } catch {
    /* not in a browser */
  }
}

export function onDraftRestored(fn) {
  window.addEventListener(RESTORED_EVENT, fn);
  return () => window.removeEventListener(RESTORED_EVENT, fn);
}

/**
 * Keeps a draft of `value` on the device.
 *
 * @param {object} opts
 * @param {string|null} opts.userId - whose draft it is (nothing is kept without one)
 * @param {string} opts.name - which draft, e.g. `journal:2026-10-26` or `meeting:new`
 * @param {*} opts.value - what is typed (anything JSON can hold)
 * @param {boolean} opts.ready - true once the page has loaded what was saved; until
 *   then nothing is read or written
 * @param {(draft: *) => void} opts.onRestore - puts a draft back into the page
 * @returns {{ clear: () => void }} clear: call after a save or a discard
 */
export function useDraft({ userId, name, value, ready, onRestore }) {
  const key = userId && name ? deviceKey('draft', userId, name) : null;
  const baseline = useRef(undefined); // what the page loaded, so an unchanged page keeps no draft
  const latest = useRef(value);
  const restoreRef = useRef(onRestore);
  const [started, setStarted] = useState(false);
  latest.current = value;
  restoreRef.current = onRestore;

  // Once the page has loaded: put back a draft that differs from what
  // was saved, quietly, and say so.
  useEffect(() => {
    if (!ready || !key || started) return;
    baseline.current = latest.current;
    const stored = readJson(key);
    if (stored && stored.v !== undefined && !same(stored.v, latest.current)) {
      restoreRef.current?.(stored.v);
      announceDraftRestored();
    }
    setStarted(true);
  }, [ready, key, started]);

  const write = useCallback(() => {
    if (!key || baseline.current === undefined) return;
    if (same(latest.current, baseline.current)) removeKey(key);
    else writeJson(key, { v: latest.current, at: Date.now() });
  }, [key]);

  // A moment after each change.
  useEffect(() => {
    if (!started) return undefined;
    const timer = setTimeout(write, SAVE_AFTER_MS);
    return () => clearTimeout(timer);
  }, [value, started, write]);

  // At once when the page is hidden, closed or left.
  useEffect(() => {
    if (!started) return undefined;
    const now = () => write();
    const onHide = () => { if (document.visibilityState === 'hidden') write(); };
    window.addEventListener('pagehide', now);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('pagehide', now);
      document.removeEventListener('visibilitychange', onHide);
      write();
    };
  }, [started, write]);

  const clear = useCallback(() => {
    if (!key) return;
    removeKey(key);
    // What is on screen now counts as saved.
    baseline.current = latest.current;
  }, [key]);

  return { clear };
}
