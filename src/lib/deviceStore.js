// What the app keeps on the device for one signed-in person (Tim, 26 Oct):
// the last data each page showed, drafts of what is being typed, and
// saves waiting for a connection. Every key carries the person's id, so
// nobody else signing in on the same device is ever shown it, and only a
// deliberate Sign out removes it (clearAppStorage.js).
//
//   clarity-cache:<userId>:<name>   the last data a page showed
//   clarity-draft:<userId>:<name>   unsaved typing
//   clarity-queue:<userId>          saves and ticks waiting to be sent
//   clarity-sending:<userId>        saves on their way, until the server answers

export const DEVICE_PREFIXES = ['clarity-cache:', 'clarity-draft:', 'clarity-queue:', 'clarity-sending:'];

export function deviceKey(kind, userId, name) {
  return name == null ? `clarity-${kind}:${userId}` : `clarity-${kind}:${userId}:${name}`;
}

export function readJson(key) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeJson(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    // Storage full or blocked (a private window): the page still works,
    // it just can't keep a copy.
    return false;
  }
}

export function removeKey(key) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* storage blocked */
  }
}
