import { useCallback, useEffect, useRef, useState } from 'react';

// Everything saves by itself as people type (decisions: "Saving",
// "Weak or no signal", "Errors"), and nothing is lost if the app closes.
//
// Every change is first kept on the device (under `draftKey`), straight
// away when the page is hidden or closed, then sent with `save(value)`
// once typing pauses. The state drives the shared indicator:
//   'idle' → 'saving' (grey turning crosshair) → 'saved' (mint)
//   or 'offline' ("Will sync"): kept on the device and tried again when
//   the signal is back, and every few seconds, until it goes.
// The copy on the device is removed once the server has the same text.
//
// readDraft(draftKey) gives back what was kept, for a page to offer it
// when it opens again.

const DRAFT_PREFIX = 'ds-draft:';
const PAUSE_MS = 800;
const DRAFT_MS = 250;
const RETRY_MS = 5000;

export function readDraft(draftKey) {
  if (!draftKey) return null;
  try {
    const raw = window.localStorage.getItem(DRAFT_PREFIX + draftKey);
    return raw == null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeDraft(draftKey, value) {
  if (!draftKey) return;
  try {
    window.localStorage.setItem(DRAFT_PREFIX + draftKey, JSON.stringify(value));
  } catch {
    // Storage full or blocked: the server save still goes ahead.
  }
}

export function clearDraft(draftKey) {
  if (!draftKey) return;
  try {
    window.localStorage.removeItem(DRAFT_PREFIX + draftKey);
  } catch {
    // Nothing to clear.
  }
}

export default function useAutosave(value, save, { draftKey, pause = PAUSE_MS } = {}) {
  const [state, setStateRaw] = useState('idle');
  // The state is only set when it changes, so typing (which keeps it at
  // Saving) never queues an update on each keystroke.
  const stateRef = useRef('idle');
  const setState = useCallback((next) => {
    if (stateRef.current === next) return;
    stateRef.current = next;
    setStateRaw(next);
  }, []);
  const draftTimer = useRef(null);
  const seen = useRef(value);
  const latest = useRef(value);
  const saveRef = useRef(save);
  const timer = useRef(null);
  const retry = useRef(null);
  const sending = useRef(false);
  const sendRef = useRef(null);
  const later = (ms) => setTimeout(() => sendRef.current?.(), ms);

  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  const send = useCallback(async () => {
    clearTimeout(timer.current);
    clearTimeout(retry.current);
    timer.current = null;
    retry.current = null;
    if (sending.current) return;
    sending.current = true;
    const sent = latest.current;
    try {
      await saveRef.current?.(sent);
      sending.current = false;
      if (latest.current === sent) {
        clearDraft(draftKey);
        setState('saved');
      } else {
        // More was typed while it was sending: send that too.
        timer.current = later(pause);
      }
    } catch {
      sending.current = false;
      setState('offline');
      retry.current = later(RETRY_MS);
    }
  }, [draftKey, pause, setState]);

  useEffect(() => {
    sendRef.current = send;
  }, [send]);

  // Each change: keep it on the device, show Saving, send once typing pauses.
  useEffect(() => {
    latest.current = value;
    if (value === seen.current) return;
    seen.current = value;
    clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => writeDraft(draftKey, latest.current), DRAFT_MS);
    if (stateRef.current !== 'offline') setState('saving');
    clearTimeout(timer.current);
    timer.current = later(pause);
    // `later` only reads refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, draftKey, pause, setState]);

  // Leaving or hiding the page: keep what's there and try to send it now.
  useEffect(() => {
    const flush = () => {
      clearTimeout(draftTimer.current);
      if (state === 'saving' || state === 'offline') {
        writeDraft(draftKey, latest.current);
        send();
      }
    };
    const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
    const onOnline = () => { if (state === 'offline') send(); };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('online', onOnline);
    };
  }, [state, draftKey, send]);

  // Closing with a save still waiting: send it now (the copy on the
  // device stays until a later visit confirms it).
  useEffect(() => () => {
    const waiting = timer.current != null || retry.current != null;
    clearTimeout(timer.current);
    clearTimeout(retry.current);
    clearTimeout(draftTimer.current);
    if (waiting) writeDraft(draftKey, latest.current);
    if (waiting && !sending.current) {
      Promise.resolve(saveRef.current?.(latest.current)).catch(() => {});
    }
    // Runs once, on closing; the key doesn't change while open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return state;
}
