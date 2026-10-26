import { useState, useSyncExternalStore } from 'react';
import { supabase } from './supabase';
import { isNetworkError, isOnline, subscribeOnline } from './connection';
import { deviceKey, readJson, writeJson } from './deviceStore';

// Saves and ticks made offline (Tim, 26 Oct): they are kept on the device
// and sent, in the order they were made, as soon as the connection is
// back. The page shows "Will sync" while one waits, then "Saved". Nothing
// typed is ever lost.
//
// A save is one write to one table:
//   { table, kind: 'upsert' | 'update' | 'delete', values, match, onConflict }
// Every new row carries an id made on the device (newId()), so sending it
// twice can never make two rows.

const listeners = new Set();
let flushing = false;
let currentUser = null;

function key(userId) {
  return deviceKey('queue', userId);
}

function read(userId) {
  return (userId && readJson(key(userId))) || [];
}

function write(userId, items) {
  writeJson(key(userId), items);
  notify();
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
    query = query.upsert(op.values, op.onConflict ? { onConflict: op.onConflict } : undefined);
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
 * Resolves { status: 'saved', data } or { status: 'queued' }. Rejects only
 * when the server answered with a real error (not a lost connection).
 */
export async function saveOrQueue(userId, op) {
  const item = { ...op, qid: newId(), at: Date.now() };
  // Anything already waiting goes first, so saves never arrive out of order.
  if (!isOnline() || read(userId).length > 0) {
    write(userId, [...read(userId), item]);
    if (isOnline()) flush(userId);
    return { status: 'queued' };
  }
  try {
    const data = await perform(item);
    return { status: 'saved', data };
  } catch (error) {
    if (isNetworkError(error)) {
      write(userId, [...read(userId), item]);
      return { status: 'queued' };
    }
    throw error;
  }
}

/**
 * Sends everything waiting, oldest first. A save the server refuses (not
 * a lost connection) is kept aside under failed, so it is never retried
 * for ever and never silently dropped.
 */
export async function flush(userId = currentUser) {
  if (!userId || flushing || !isOnline()) return;
  flushing = true;
  try {
    for (;;) {
      const items = read(userId);
      const item = items.find((x) => !x.failed);
      if (!item) break;
      try {
        await perform(item);
        write(userId, read(userId).filter((x) => x.qid !== item.qid));
      } catch (error) {
        if (isNetworkError(error)) break;
        write(userId, read(userId).map((x) => (x.qid === item.qid ? { ...x, failed: true } : x)));
      }
    }
  } finally {
    flushing = false;
    notify();
  }
}

/** Who is signed in: their waiting saves are sent on every reconnect. */
export function startSyncQueue(userId) {
  currentUser = userId;
  if (userId) flush(userId);
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
 * save waits on the device, then 'saved' once everything has gone; 'idle'
 * before anything was kept. Feed it to SaveStatus.
 */
export function useQueuedSave() {
  const { waiting } = useQueueState();
  const [queued, setQueued] = useState(false);
  let state = 'idle';
  if (queued) state = waiting > 0 ? 'offline' : 'saved';
  return [state, () => setQueued(true)];
}
