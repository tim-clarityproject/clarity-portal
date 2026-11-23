// The coach portal's large device copy (scale check, step 3; 22 Nov).
//
// At Tim's scale a coach's copy is 5 to 15 MB, over the browser's
// localStorage limit (about 5 MB a site), so it was never kept: a warm
// visit and an offline reload had nothing to show. A large copy is kept
// here instead, in IndexedDB, one record per table:
//
//   database clarity-coach, store tables, key "<coach's account>|<table>"
//   value { rows, marks } exactly as store.js holds that table
//
// Only the tables that changed are written, after the page has drawn, so
// a save never waits for the whole copy. It is only the last data shown:
// whatever hasn't reached the database is also kept in localStorage
// (store.js), where a Sign out leaves it. A Sign out deletes this whole
// database (clearAppStorage.js), as it clears every other page's last data.
// Every call is wrapped: with IndexedDB blocked (a private window) or
// broken, the page still works, it just keeps no copy.

const DB_NAME = 'clarity-coach';
const STORE = 'tables';
let opening = null;
const OPEN_WAIT_MS = 1500;

const idb = () => {
  try {
    return globalThis.indexedDB || null;
  } catch {
    return null;
  }
};

export const deviceCopyAvailable = () => Boolean(idb());

function open() {
  if (opening) return opening;
  const factory = idb();
  if (!factory) return Promise.resolve(null);
  opening = new Promise((resolve) => {
    let req;
    try {
      req = factory.open(DB_NAME, 1);
    } catch {
      resolve(null);
      return;
    }
    req.onupgradeneeded = () => {
      try { req.result.createObjectStore(STORE); } catch { /* already there */ }
    };
    req.onsuccess = () => {
      clearTimeout(wait);
      const db = req.result;
      // A Sign out in another tab deletes the database: let it go at once.
      db.onversionchange = () => { try { db.close(); } catch { /* closed */ } opening = null; };
      db.onclose = () => { opening = null; };
      resolve(db);
    };
    req.onerror = () => { clearTimeout(wait); opening = null; resolve(null); };
    req.onblocked = () => { /* waits for the other tab to let go */ };
    // Never waits long: a database held open elsewhere (a Sign out deleting it) means no copy this time.
    const wait = setTimeout(() => { opening = null; resolve(null); }, OPEN_WAIT_MS);
  });
  return opening;
}

const prefix = (userId) => `${userId}|`;

/** Every table kept for this coach: { [table]: { rows, marks } }, or null when nothing is kept (or it can't be read). */
export async function readCopy(userId) {
  const db = await open();
  if (!db || !userId) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readonly');
      const store = tx.objectStore(STORE);
      const range = globalThis.IDBKeyRange.bound(prefix(userId), `${prefix(userId)}￿`);
      const out = {};
      let any = false;
      const req = store.openCursor(range);
      req.onsuccess = () => {
        const cur = req.result;
        if (!cur) { resolve(any ? out : null); return; }
        const table = String(cur.key).slice(prefix(userId).length);
        if (table && cur.value && typeof cur.value === 'object') { out[table] = cur.value; any = true; }
        cur.continue();
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/** Keeps these tables ({ [table]: { rows, marks } | null to remove }). Resolves true when kept. */
export async function writeTables(userId, tables) {
  const db = await open();
  if (!db || !userId) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      for (const [table, value] of Object.entries(tables)) {
        if (value) store.put(value, `${prefix(userId)}${table}`);
        else store.delete(`${prefix(userId)}${table}`);
      }
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

// Two lists the frame reads beside the tables, kept so a warm visit shows them at once (UI tester, scale
// check: the owner's Clients showed "Your clients" and her own 300, then "Everyone" and all 1,000 a moment
// later, every row moving down): the coaches, and the owner's admin facts for every client (about 0.4 MB at
// 1,000 clients). Key "<coach's account>#<name>", outside the tables' "<account>|" range, so readCopy and
// removeCopy never see them; a Sign out deletes them with the rest of the database.
const extraKey = (userId, name) => `${userId}#${name}`;

/** One kept list, or null. Never throws. */
export async function readExtra(userId, name) {
  const db = await open();
  if (!db || !userId) return null;
  return new Promise((resolve) => {
    try {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(extraKey(userId, name));
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/** Keeps one list. Resolves true when kept; never throws. */
export async function writeExtra(userId, name, value) {
  const db = await open();
  if (!db || !userId) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, extraKey(userId, name));
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

/** Removes this coach's copy (the copy is small enough for localStorage again). */
export async function removeCopy(userId) {
  const db = await open();
  if (!db || !userId) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(globalThis.IDBKeyRange.bound(prefix(userId), `${prefix(userId)}￿`));
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

/** A Sign out: every coach's copy on this device goes (clearAppStorage.js). Never throws. */
export function clearDeviceCopies() {
  const factory = idb();
  if (!factory) return;
  try {
    if (opening) opening.then((db) => { try { db?.close(); } catch { /* closed */ } });
    opening = null;
    factory.deleteDatabase(DB_NAME);
  } catch {
    /* storage blocked: nothing kept */
  }
}
