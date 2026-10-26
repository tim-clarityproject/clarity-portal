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

// Each browser tab keeps its own copy of a draft (`<name>~<tab>`), so two
// tabs on the same page (the same Journal day) never overwrite each
// other's typing. The tab's id lasts as long as the tab, refreshes
// included. A reopened tab, or a refresh, takes the newest copy.
const TAB_KEY = 'clarity-tab-id';
let tabId = null;
function thisTab() {
  if (tabId) return tabId;
  try {
    tabId = window.sessionStorage.getItem(TAB_KEY);
    if (!tabId) {
      tabId = Math.random().toString(36).slice(2, 10);
      window.sessionStorage.setItem(TAB_KEY, tabId);
    }
  } catch {
    tabId = Math.random().toString(36).slice(2, 10);
  }
  return tabId;
}

// Every copy of one draft on the device: this tab's, other tabs', and one
// kept before tabs had their own (the plain name). Newest first.
function copies(userId, name) {
  const base = deviceKey('draft', userId, name);
  const found = [];
  try {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const k = window.localStorage.key(i);
      if (k === base || (k && k.startsWith(`${base}~`))) {
        const v = readJson(k);
        if (v) found.push({ key: k, ...v });
      }
    }
  } catch {
    /* storage blocked */
  }
  return found.sort((a, b) => (b.at || 0) - (a.at || 0));
}

/** The newest copy of a draft, from any tab. */
export function readDraft(userId, name) {
  if (!userId) return null;
  return copies(userId, name)[0] || null;
}

/** Removes a draft: every tab's copy (it has been saved or discarded). */
export function clearDraft(userId, name) {
  if (!userId) return;
  copies(userId, name).forEach((c) => removeKey(c.key));
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
  const key = userId && name ? deviceKey('draft', userId, `${name}~${thisTab()}`) : null;
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
    // This tab's own copy first; otherwise the newest from any tab (a
    // closed tab's typing), which this tab then keeps as its own. Another
    // tab still open writes its copy again on its next change, so nothing
    // is lost.
    const own = readJson(key);
    const stored = own || readDraft(userId, name);
    if (stored && stored.v !== undefined && !same(stored.v, latest.current)) {
      restoreRef.current?.(stored.v);
      announceDraftRestored();
      if (!own && stored.key) {
        writeJson(key, { v: stored.v, at: Date.now() });
        removeKey(stored.key);
      }
    }
    setStarted(true);
  }, [ready, key, started, userId, name]);

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

  // Saved or discarded: every tab's copy goes. (Another tab still open
  // keeps its typing on screen and writes it again if it changes.)
  const clear = useCallback(() => {
    if (!key) return;
    clearDraft(userId, name);
    // What is on screen now counts as saved.
    baseline.current = latest.current;
  }, [key, userId, name]);

  return { clear };
}
