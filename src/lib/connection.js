import { useSyncExternalStore } from 'react';

// Whether the device has a connection, known as fast as possible (Tim,
// 26 Oct: a calm offline message within 2 seconds; lists used to take
// about 7 seconds to give up).
//
// - The browser's own online and offline events say so straight away
//   when the network is switched off.
// - Every request to the database goes through connectionFetch (set as
//   Supabase's fetch in src/lib/supabase.js): with the device offline it
//   fails at once instead of waiting, and a request that fails at the
//   network level, or hangs, marks the connection as lost.
// - While marked lost, a tiny request is tried every few seconds, so a
//   connection that comes back without an "online" event is noticed.

const REQUEST_TIMEOUT_MS = 15000;
const PROBE_EVERY_MS = 5000;

let online = typeof navigator === 'undefined' ? true : navigator.onLine !== false;
const listeners = new Set();
let probeTimer = null;
let probeUrl = null;

function set(next) {
  if (next === online) return;
  online = next;
  listeners.forEach((fn) => fn(online));
  if (online) stopProbe();
  else startProbe();
}

function startProbe() {
  if (probeTimer || !probeUrl || typeof window === 'undefined') return;
  probeTimer = window.setInterval(async () => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    try {
      // Any answer at all, even "not allowed", means the network is back.
      await fetch(probeUrl, { method: 'HEAD', cache: 'no-store' });
      set(true);
    } catch {
      /* still offline */
    }
  }, PROBE_EVERY_MS);
}

function stopProbe() {
  if (probeTimer) window.clearInterval(probeTimer);
  probeTimer = null;
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => set(true));
  window.addEventListener('offline', () => set(false));
}

/** The address tried while the connection is lost (the database's own). */
export function setProbeUrl(url) {
  probeUrl = url;
}

export function isOnline() {
  return online;
}

export function subscribeOnline(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** True when an error means "no connection", not "the server said no". */
export function isNetworkError(error) {
  if (!error) return false;
  if (error.name === 'TypeError' || error.name === 'AbortError') return true;
  const text = `${error.message || ''} ${error.details || ''}`;
  return /Failed to fetch|NetworkError|Load failed|network|offline|timed out/i.test(text);
}

/**
 * fetch, but it fails at once when the device is offline, gives up on a
 * request that hangs, and keeps the connection state up to date.
 */
export async function connectionFetch(input, init = {}) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    set(false);
    throw new TypeError('Failed to fetch: the device is offline');
  }
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);
  const outer = init.signal;
  const onOuterAbort = () => controller.abort();
  if (outer) {
    if (outer.aborted) controller.abort();
    else outer.addEventListener('abort', onOuterAbort, { once: true });
  }
  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    set(true);
    return response;
  } catch (error) {
    // Aborted by the caller: not a connection problem.
    if (error?.name === 'AbortError' && !timedOut) throw error;
    set(false);
    if (timedOut) throw new TypeError('Failed to fetch: the request timed out');
    throw error;
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener('abort', onOuterAbort);
  }
}

/** The connection, for a component: true online, false offline. */
export function useOnline() {
  return useSyncExternalStore(subscribeOnline, isOnline, () => true);
}
