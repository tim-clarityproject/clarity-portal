import { useCallback, useContext, useEffect, useLayoutEffect, useRef } from 'react';
import { AuthContext } from '../../context/AuthContext';
import { announceDraftRestored } from '../../lib/drafts';
import { clearPanelDraft, fieldEntry, fieldsToRestore, hasTyping, keepPanelDraft, readPanelDraft } from '../../lib/panelDraft';

// The shared panel's draft (tidy pass item 3; the rules are in
// src/lib/panelDraft.js). Modal calls it with the panel's `draftKey`; with
// no key it does nothing. It reads the boxes people type into straight from
// the panel, so a panel opts in with its key alone, whatever holds its
// state, and puts typing back the way typing arrives (an input event), so
// the panel's own state follows.

const FIELDS = 'textarea, input:not([type]), input[type=text], input[type=email], input[type=tel], input[type=url], input[type=search], input[type=number]';
const SAVE_AFTER_MS = 300;

function boxes(root) {
  if (!root) return [];
  return [...root.querySelectorAll(FIELDS)].filter((el) => !el.disabled && !el.readOnly
    && el.getAttribute('autocomplete') !== 'one-time-code' && !el.closest('[data-no-draft]'));
}

function labelOf(el) {
  const by = el.getAttribute('aria-labelledby');
  const named = by ? by.split(/\s+/).map((id) => document.getElementById(id)?.textContent || '').join(' ') : '';
  return el.getAttribute('aria-label') || el.labels?.[0]?.textContent || named || el.getAttribute('placeholder') || el.name || '';
}

function readFields(root) {
  return boxes(root).map((el, i) => fieldEntry(i, labelOf(el), el.value));
}

function put(el, v) {
  const proto = el instanceof window.HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, v);
  el.dispatchEvent(new window.Event('input', { bubbles: true }));
}

/**
 * @param {{ draftKey?: string|null, open: boolean, shown: boolean, bodyRef: { current: HTMLElement|null } }} o
 * @returns {{ dismiss: () => void }} dismiss: call before the panel closes itself (its cross, Escape, a tap
 *   outside, a swipe, the phone's Back), so what is typed stays for next time.
 */
export function usePanelDraft({ draftKey, open, shown, bodyRef }) {
  const userId = useContext(AuthContext)?.user?.id || null;
  const keyRef = useRef(draftKey);
  const userRef = useRef(userId);
  const opened = useRef(null); // the boxes as the panel opened, before any draft went back in
  const dismissed = useRef(false);
  const openRef = useRef(open);
  useLayoutEffect(() => {
    keyRef.current = draftKey;
    userRef.current = userId;
    openRef.current = open;
  });

  const flush = useCallback(() => {
    const key = keyRef.current;
    const root = bodyRef.current;
    if (!key || !root || !opened.current) return;
    const now = readFields(root);
    if (hasTyping(now, opened.current)) keepPanelDraft(userRef.current, key, now);
    else clearPanelDraft(userRef.current, key);
  }, [bodyRef]);

  // Shown: note how it opened, then put back what was typed last time.
  useEffect(() => {
    if (!shown || !draftKey) return;
    const root = bodyRef.current;
    if (!root) return;
    dismissed.current = false;
    const start = readFields(root);
    opened.current = start;
    const kept = readPanelDraft(userId, draftKey);
    if (!kept) return;
    const back = fieldsToRestore(kept, start);
    if (!back.length) return;
    const els = boxes(root);
    back.forEach(({ i, v }) => put(els[i], v));
    announceDraftRestored();
  }, [shown, draftKey, userId, bodyRef]);

  // While it shows: a copy a moment after each change, and at once when the page is hidden or closed.
  useEffect(() => {
    const root = bodyRef.current;
    if (!shown || !draftKey || !root) return undefined;
    let timer;
    const onInput = () => { clearTimeout(timer); timer = setTimeout(flush, SAVE_AFTER_MS); };
    const now = () => flush();
    const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
    root.addEventListener('input', onInput);
    window.addEventListener('pagehide', now);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      clearTimeout(timer);
      root.removeEventListener('input', onInput);
      window.removeEventListener('pagehide', now);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [shown, draftKey, flush, bodyRef]);

  // Closed by its own button (a save, or a choice that finishes it): the copy goes.
  const finish = useCallback(() => {
    if (!keyRef.current || !opened.current) return;
    if (!dismissed.current) clearPanelDraft(userRef.current, keyRef.current);
    opened.current = null;
  }, []);
  const wasOpen = useRef(open);
  useEffect(() => {
    if (wasOpen.current && !open) finish();
    wasOpen.current = open;
  }, [open, finish]);
  // Taken out of the page while open: the same (a parent that shows the panel only while it is wanted).
  useLayoutEffect(() => () => { if (openRef.current) finish(); }, [finish]);

  const dismiss = useCallback(() => {
    dismissed.current = true;
    flush();
  }, [flush]);

  return { dismiss };
}
