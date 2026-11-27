// The sign-in's storage on the device (Polish 1, Stage D, item 17).
//
// supabase-js reads its saved sign-in through this adapter on every request it makes (getSession before each
// fetch), and the portal asks auth.getSession() itself in about 30 places, so one page could read localStorage
// thousands of times (a preview session logged "Retrieved clarity-portal-auth from storage" about 21,000 times).
// This keeps an in-memory copy of each key it is asked for, so a burst of requests reads the device once:
// - every write and removal through the adapter updates the copy at once (signing in, a refresh, Sign out);
// - another tab's change arrives as a `storage` event (or supabase-js's own message to its tabs) and drops the copy;
// - a write that goes round the adapter in this tab (clearAppStorage, sessionManager) calls forgetAuthCopy();
// - and a copy is trusted for at most FRESH_MS, so anything else that changes the device is read within a second.
// Nothing is logged: the old adapter's console lines are gone (they ran in every build).

export const FRESH_MS = 1000;

const copies = new Map(); // key -> { value, at }
let listening = false;
const channels = new Set();

function storage() {
  try {
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return null;
    return window.localStorage;
  } catch {
    return null; // storage blocked
  }
}

function listen() {
  if (listening || typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
  listening = true;
  // Another tab signed in, refreshed or signed out: the next read is the device's own.
  window.addEventListener('storage', (e) => {
    if (e.key == null) copies.clear();
    else copies.delete(e.key);
  });
}

// supabase-js tells its other tabs of a sign-in, refresh or sign-out on a BroadcastChannel named after the key, which
// can arrive before the storage event: listening on the same name drops the copy as soon as it does.
function hearChannel(key) {
  if (channels.has(key) || typeof BroadcastChannel !== 'function') return;
  channels.add(key);
  try {
    const ch = new BroadcastChannel(key);
    ch.onmessage = () => copies.delete(key);
  } catch { /* no channel: the storage event and FRESH_MS still hold */ }
}

const now = () => Date.now();

/** Drops the in-memory copy of one key (or of all of them), so the next read is the device's. */
export function forgetAuthCopy(key) {
  if (key == null) copies.clear();
  else copies.delete(key);
}

/** The storage supabase-js is given (createClient's auth.storage). */
export const authStorage = {
  getItem(key) {
    listen();
    hearChannel(key);
    const held = copies.get(key);
    if (held && now() - held.at < FRESH_MS) return held.value;
    const s = storage();
    if (!s) return null;
    try {
      const value = s.getItem(key);
      copies.set(key, { value, at: now() });
      return value;
    } catch (e) {
      console.error(`Error retrieving ${key}:`, e);
      return null;
    }
  },
  setItem(key, value) {
    listen();
    const s = storage();
    if (!s) return;
    try {
      s.setItem(key, value);
      copies.set(key, { value: String(value), at: now() });
    } catch (e) {
      copies.delete(key);
      console.error(`Error storing ${key}:`, e);
    }
  },
  removeItem(key) {
    listen();
    const s = storage();
    copies.set(key, { value: null, at: now() });
    if (!s) return;
    try {
      s.removeItem(key);
    } catch (e) {
      copies.delete(key);
      console.error(`Error removing ${key}:`, e);
    }
  },
};
