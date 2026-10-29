import { useRef, useState, useSyncExternalStore } from 'react';
import { supabase } from './supabase';
import { isNetworkError, isOnline, subscribeOnline } from './connection';
import { deviceKey, readJson, writeJson } from './deviceStore';

// Saves and ticks made offline (Tim, 26 Oct): they are kept on the device
// and sent, in the order they were made, as soon as the connection is
// back. The page shows "Will sync" while one waits, then "Saved". Nothing
// typed is ever lost.
//
// A save is one write to one table:
//   { table, kind: 'upsert' | 'update' | 'delete', values, match, onConflict,
//     ignoreDuplicates }
// Every new row carries an id made on the device (newId()), so sending it
// twice can never make two rows. ignoreDuplicates is for rows that are
// never changed once written (plan history): a second send of the same
// row does nothing, and the table needs no right to change rows.

const listeners = new Set();
let flushPromise = null;
let currentUser = null;
// Bumped by stopSyncQueue (Sign out), so a send already under way never
// writes anything back to the device after it has been cleared.
let epoch = 0;

function key(userId) {
  return deviceKey('queue', userId);
}

function read(userId) {
  return (userId && readJson(key(userId))) || [];
}

function write(userId, items) {
  const ok = writeJson(key(userId), items);
  notify();
  return ok;
}

/** Thrown when the device can't keep a save (storage full or blocked). */
export class NoRoomError extends Error {
  constructor() {
    super('This device has no room to keep the save.');
    this.name = 'NoRoomError';
  }
}

// Worth trying again later: no connection, or the sign-in needs
// refreshing first (an expired session sends the anonymous key, which the
// database refuses). Anything else is the server really saying no.
function retryable(error) {
  if (isNetworkError(error)) return true;
  if (error?.status === 401 || error?.code === 'PGRST301') return true;
  return /jwt|token is expired|invalid claim/i.test(`${error?.message || ''}`);
}

function keep(userId, item) {
  if (!write(userId, [...read(userId), item])) throw new NoRoomError();
}

function notify() {
  listeners.forEach((fn) => fn());
}

/** A new row's id, made on the device. */
export function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  // Older browsers: a version 4 UUID from Math.random.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    return (c === 'x' ? r : ((r & 0x3) | 0x8)).toString(16);
  });
}

async function perform(op) {
  let query = supabase.from(op.table);
  if (op.kind === 'upsert') {
    const options = {};
    if (op.onConflict) options.onConflict = op.onConflict;
    if (op.ignoreDuplicates) options.ignoreDuplicates = true;
    query = query.upsert(op.values, Object.keys(options).length ? options : undefined);
  } else if (op.kind === 'update') {
    query = query.update(op.values);
    Object.entries(op.match || {}).forEach(([k, v]) => { query = query.eq(k, v); });
  } else if (op.kind === 'delete') {
    query = query.delete();
    Object.entries(op.match || {}).forEach(([k, v]) => { query = query.eq(k, v); });
  } else {
    throw new Error(`Unknown save kind: ${op.kind}`);
  }
  const { data, error } = await query.select();
  if (error) throw error;
  if (op.kind === 'update' && (!data || data.length === 0)) {
    throw Object.assign(new Error('Nothing was found to update.'), { code: 'NOT_FOUND' });
  }
  return data;
}

/**
 * Sends a save now, or keeps it on the device when there's no connection.
 * Resolves { status: 'saved', data } or { status: 'queued', qid }. Rejects
 * when the server answered with a real error, or with NoRoomError when the
 * device can't keep it (so it is never shown as kept when it isn't).
 */
export async function saveOrQueue(userId, op) {
  const item = { ...op, qid: newId(), at: Date.now() };
  // Anything still waiting goes first, so saves never arrive out of order
  // (refused ones are set aside and don't hold the rest up).
  if (!isOnline() || read(userId).some((x) => !x.failed)) {
    keep(userId, item);
    if (isOnline()) flush(userId);
    return { status: 'queued', qid: item.qid };
  }
  try {
    const data = await perform(item);
    return { status: 'saved', data };
  } catch (error) {
    if (retryable(error)) {
      keep(userId, item);
      return { status: 'queued', qid: item.qid };
    }
    throw error;
  }
}

/**
 * Keeps a save on the device straight away, to be sent with the rest of
 * the queue (now if online, else on the next start or reconnect). For a
 * page being closed or refreshed with a save still waiting for its delay:
 * there's no time left to send it, but the device can keep it.
 */
export function keepForLater(userId, op) {
  if (!userId) return;
  try {
    keep(userId, { ...op, qid: newId(), at: Date.now() });
  } catch {
    // No room on the device: nothing more can be done as the page closes.
    return;
  }
  // Worth a try (a page kept for Back sends it now); if the page is going,
  // it stays kept and is sent next time.
  if (isOnline()) flush(userId);
}

/**
 * Sends everything waiting, oldest first. A save the server refuses (not
 * a lost connection) is kept aside under failed, so it is never retried
 * for ever and never silently dropped.
 */
export function flush(userId = currentUser) {
  if (!userId || !isOnline()) return Promise.resolve();
  // One send at a time; a second call waits for the one under way.
  if (flushPromise) return flushPromise;
  const mine = epoch;
  flushPromise = (async () => {
    for (;;) {
      if (mine !== epoch) break;
      const item = read(userId).find((x) => !x.failed);
      if (!item) break;
      // A session that expired while offline is refreshed first; until it
      // is, nothing is sent (it would be refused as anonymous).
      try {
        const { data } = await supabase.auth.getSession();
        if (!data?.session) break;
      } catch {
        break;
      }
      try {
        await perform(item);
        if (mine !== epoch) break;
        write(userId, read(userId).filter((x) => x.qid !== item.qid));
      } catch (error) {
        if (retryable(error) || mine !== epoch) break;
        write(userId, read(userId).map((x) => (x.qid === item.qid ? { ...x, failed: true } : x)));
      }
    }
  })().finally(() => {
    flushPromise = null;
    notify();
  });
  return flushPromise;
}

/** Who is signed in: their waiting saves are sent on every reconnect. */
export function startSyncQueue(userId) {
  currentUser = userId;
  if (userId) flush(userId);
}

/** Sign out: nothing more is sent, and nothing is written back. */
export function stopSyncQueue() {
  epoch += 1;
  currentUser = null;
}

/**
 * Once the person has been told a save was refused, it is set aside for
 * good: its typing is still in the page's draft, so it comes back when the
 * page is opened again, and it isn't announced on every start.
 */
export function dismissFailed(userId = currentUser) {
  if (!userId) return;
  const items = read(userId);
  if (items.some((x) => x.failed)) write(userId, items.filter((x) => !x.failed));
}

/**
 * Forget saves still waiting for one row (a plan discarded before its
 * save was sent), so it can't come back once the connection returns.
 * Returns how many were dropped.
 */
export function dropQueued(userId, table, id) {
  if (!userId) return 0;
  const items = read(userId);
  const keepItems = items.filter((x) => !(x.table === table && (x.values?.id === id || x.match?.id === id)));
  if (keepItems.length !== items.length) write(userId, keepItems);
  return items.length - keepItems.length;
}

/** After a refreshed sign-in, try again whatever waited for it. */
export function retrySyncQueue() {
  if (currentUser) flush(currentUser);
}

subscribeOnline((on) => {
  if (on && currentUser) flush(currentUser);
});

/** How many saves are waiting, and how many the server refused. */
export function queueState(userId = currentUser) {
  const items = read(userId);
  return { waiting: items.filter((x) => !x.failed).length, failed: items.filter((x) => x.failed).length };
}

let snapshot = { waiting: 0, failed: 0 };
function getSnapshot() {
  const next = queueState();
  if (next.waiting !== snapshot.waiting || next.failed !== snapshot.failed) snapshot = next;
  return snapshot;
}

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** For a component: { waiting, failed } for the signed-in person. */
export function useQueueState() {
  return useSyncExternalStore(subscribe, getSnapshot, () => snapshot);
}

/**
 * For a page that saved while offline: 'offline' ("Will sync") while its
 * own save waits on the device, 'saved' once the server has it, and
 * 'failed' if the server refused it; 'idle' before anything was kept.
 * Feed it to SaveStatus. markQueued takes the qid saveOrQueue returned.
 */
export function useQueuedSave() {
  useQueueState(); // re-render whenever the queue changes
  const [qid, setQid] = useState(null);
  // Once refused, always refused: a refused save set aside later
  // (dismissFailed) must never then read as saved.
  const refused = useRef(new Set());
  let state = 'idle';
  if (qid) {
    const item = read(currentUser).find((x) => x.qid === qid);
    if (item?.failed) refused.current.add(qid);
    if (refused.current.has(qid)) state = 'failed';
    else state = item ? 'offline' : 'saved';
  }
  return [state, (id) => setQid(id)];
}
