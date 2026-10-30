import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { supabase } from './supabase';
import { isNetworkError, isOnline, subscribeOnline } from './connection';
import { deviceKey, readJson, removeKey, writeJson } from './deviceStore';

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
//
// Each change carries the version it was based on (Tim, 29 Oct): the
// updated_at of the row as this window last read or saved it (the version
// book below, filled by the pages' loads through noteVersions). A change
// is sent as "only if the row is still at that version", so an older save
// from a second window, or one resent after a refresh, never replaces a
// newer one. When the row has moved on, the save is refused as superseded:
// never silently (the page shows "This was changed in another window.
// Showing the latest." and reloads; useSuperseded), unless the row already
// holds exactly what was being saved, which counts as saved. A save that
// lands moves the version on for the later saves to the same row that
// wait on the device, so a run of offline changes still goes through.

const listeners = new Set();
const supersededListeners = new Set();
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

// A save sent straight away is noted on the device until the server
// answers, so a refresh or a closed tab mid-save never loses it: whatever
// is still noted when the app starts again is sent with the queue (every
// save can be sent twice safely, see the top). (Break-it tester: a to-do
// added just before a refresh was lost.)
function sendingKey(userId) {
  return deviceKey('sending', userId);
}

function noteSending(userId, item) {
  writeJson(sendingKey(userId), [...(readJson(sendingKey(userId)) || []).filter((x) => x.qid !== item.qid), item]);
}

function doneSending(userId, item) {
  const left = (readJson(sendingKey(userId)) || []).filter((x) => x.qid !== item.qid);
  if (left.length) writeJson(sendingKey(userId), left);
  else removeKey(sendingKey(userId));
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

// ---- the version book ---------------------------------------------------------
// Which row a save is for: its id, or the natural key a table's rows are
// found by (one log per habit and day, one answer per Recovery and day).
const ROW_KEYS = {
  habit_logs: ['sprint_habit_id', 'local_date'],
  recovery_recharge_answers: ['recovery_id', 'local_date'],
  day_plans: ['user_id', 'local_date'],
  day_reviews: ['user_id', 'local_date'],
  weekly_debriefs: ['sprint_id', 'sprint_week'],
  person_settings: ['user_id'],
  sprint_reviews: ['sprint_id'],
};
// Only the tables whose updated_at the database keeps itself (the p1_touch
// trigger, server time). Older tables (decisions, journal_entries) write
// their own, so they are never guarded and save exactly as before.
export const VERSIONED_TABLES = ['outcome_objectives', 'performance_plans', 'plan_strategies', 'habits', 'sprints', 'todos', 'wins', 'habit_logs', 'recovery_periods', 'recovery_recharge_answers', 'day_plans', 'day_reviews', 'weekly_debriefs', 'person_settings', 'sprint_reviews'];
const versioned = new Set(VERSIONED_TABLES);
const versions = new Map();
// Queued saves refused as superseded: never read as "Saved" (useQueuedSave).
const supersededQids = new Set();

function rowKey(table, fields) {
  if (!versioned.has(table)) return null;
  const cols = ROW_KEYS[table] || ['id'];
  if (!fields || cols.some((c) => fields[c] == null)) return null;
  return `${table}|${cols.map((c) => fields[c]).join('|')}`;
}

function opKey(op) {
  return rowKey(op.table, { ...(op.values || {}), ...(op.match || {}) });
}

/**
 * A page's load tells the book which version of each row it now shows
 * (rows read with updated_at). Later changes to those rows are based on it.
 */
export function noteVersions(table, rows) {
  for (const row of rows || []) {
    const k = rowKey(table, row);
    if (k && row.updated_at) noteVersion(k, row.updated_at);
  }
  return rows;
}

// The book only ever moves forward. A load that read a row just before
// this window's own save landed answers after it, with the older version
// (quick ticks, 30 Oct): taking that would base the next change on the
// older version, and it would be refused as if another window had made
// the newer one. Another window's change is always later, so it is still
// taken.
function noteVersion(k, at) {
  const had = versions.get(k);
  if (had && Date.parse(had) > Date.parse(at)) return;
  versions.set(k, at);
}

// The versions this window's own saves made, per row: a row found at one
// of these has moved on only because of this window, never another one.
const own = new Map();
function noteOwn(k, at) {
  if (!own.has(k)) own.set(k, new Set());
  own.get(k).add(at);
}
const isOwn = (k, at) => Boolean(k && at && own.get(k)?.has(at));

/** Thrown inside the queue when a save's row has moved on since it was read. */
export class SupersededError extends Error {
  constructor(table, row) {
    super('This was changed in another window.');
    this.name = 'SupersededError';
    this.code = 'SUPERSEDED';
    this.table = table;
    this.row = row;
  }
}

/** Tell a page (useSuperseded) when one of its saves was refused as superseded. */
export function onSuperseded(fn) {
  supersededListeners.add(fn);
  return () => supersededListeners.delete(fn);
}

function announceSuperseded(error) {
  supersededListeners.forEach((fn) => fn(error));
}

// The same value as the server holds (numbers and times compare by
// value: 1.5 and "1.5", "…Z" and "…+00:00").
function same(a, b) {
  if (a === b || (a == null && b == null)) return true;
  if (a == null || b == null) return false;
  if (typeof a === 'object' || typeof b === 'object') return JSON.stringify(a) === JSON.stringify(b);
  if (`${a}` === `${b}`) return true;
  if (Number.isFinite(Number(a)) && Number.isFinite(Number(b)) && `${a}`.trim() !== '' && `${b}`.trim() !== '') return Number(a) === Number(b);
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  return !Number.isNaN(ta) && !Number.isNaN(tb) && /\d{4}-\d{2}-\d{2}T/.test(`${a}`) && ta === tb;
}

// A save landed: the book and every later save to the same row that waits
// on the device (or was cut off mid-send) move on to the new version.
function rebase(userId, op, data) {
  const k = opKey(op);
  if (!k) return;
  if (op.kind === 'delete') {
    versions.delete(k);
    return;
  }
  const at = data?.[0]?.updated_at;
  if (!at) return;
  noteOwn(k, at);
  noteVersion(k, at);
  if (!userId) return;
  const move = (items) => items.map((x) => (x.basedOn && x.qid !== op.qid && opKey(x) === k ? { ...x, basedOn: at } : x));
  const queued = read(userId);
  if (queued.some((x) => x.basedOn && x.qid !== op.qid && opKey(x) === k)) write(userId, move(queued));
  const cut = readJson(sendingKey(userId)) || [];
  if (cut.some((x) => x.basedOn && x.qid !== op.qid && opKey(x) === k)) writeJson(sendingKey(userId), move(cut));
}

// The version a new change is based on, when the book knows the row.
function withVersion(op) {
  if (op.basedOn || op.kind === 'delete' || op.ignoreDuplicates) return op;
  const k = opKey(op);
  const at = k && versions.get(k);
  return at ? { ...op, basedOn: at } : op;
}

// "Only if the row is still at the version it was based on": an update
// matched by its row and its updated_at. Nothing matched: the row has
// moved on (superseded), unless it already holds what was being saved.
async function performBased(op, retried = false) {
  const cols = ROW_KEYS[op.table] || ['id'];
  const fields = { ...(op.values || {}), ...(op.match || {}) };
  const match = op.kind === 'update' ? { ...(op.match || {}) } : Object.fromEntries(cols.map((c) => [c, fields[c]]));
  let query = supabase.from(op.table).update(op.values);
  Object.entries(match).forEach(([k, v]) => { query = query.eq(k, v); });
  const { data, error } = await query.eq('updated_at', op.basedOn).select();
  if (error) throw error;
  if (data?.length) return data;
  let now = supabase.from(op.table).select('*');
  Object.entries(match).forEach(([k, v]) => { now = now.eq(k, v); });
  const { data: rows, error: readError } = await now.limit(1);
  if (readError) throw readError;
  const row = rows?.[0];
  if (!row) {
    if (op.kind === 'update') throw Object.assign(new Error('Nothing was found to update.'), { code: 'NOT_FOUND' });
    throw new SupersededError(op.table, null); // taken away in another window since
  }
  if (Object.entries(op.values || {}).every(([k, v]) => same(v, row[k]))) return [row];
  // Moved on only by this window's own earlier save (its answer reached
  // the book after this change was based): this change is the newer one,
  // so it goes on top of it. Never refused as another window's.
  if (!retried && isOwn(opKey(op), row.updated_at)) return performBased({ ...op, basedOn: row.updated_at }, true);
  throw new SupersededError(op.table, row);
}

async function perform(op) {
  if (op.basedOn && (op.kind === 'update' || op.kind === 'upsert')) return performBased(op);
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

// Saves sent straight away go one at a time, in the order they were
// made, so two quick changes to the same row (a tick, untick, tick) can
// never arrive the other way round and leave the last one undone
// (break-it tester). One that hangs holds the next back for at most
// WAIT_MS, so a stuck connection never stops every later save.
const WAIT_MS = 10000;
let sending = Promise.resolve();
// How many saves this window has made: a page's quiet refresh that sees
// this move while it loads knows its answer may be older than the screen.
let changes = 0;

/** A count that moves on with every save made (for useCachedLoad). */
export function changesMade() {
  return changes;
}

/**
 * Resolves once every save made so far has had its answer (or waits on
 * the device), and the queue's send under way is done. A quiet refresh
 * reads after this, so it reads what this window has already saved.
 */
export async function whenSent() {
  for (let i = 0; i < 20; i += 1) {
    const tail = sending;
    const flushing = flushPromise;
    await Promise.all([tail, flushing].map((p) => (p ? p.catch(() => null) : null)));
    if (tail === sending && flushing === flushPromise) return;
  }
}

/** Saves still waiting on the device to be sent (not the refused ones). */
export function waitingToSend(userId = currentUser) {
  return read(userId).some((x) => !x.failed);
}

/** Tell a listener whenever the queue changes. */
export function subscribeQueue(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Sends a save now, or keeps it on the device when there's no connection.
 * Resolves { status: 'saved', data } or { status: 'queued', qid }. Rejects
 * when the server answered with a real error, or with NoRoomError when the
 * device can't keep it (so it is never shown as kept when it isn't).
 */
export function saveOrQueue(userId, op) {
  changes += 1;
  let timer;
  const before = Promise.race([sending, new Promise((r) => { timer = setTimeout(r, WAIT_MS); })]);
  const turn = before.then(() => {
    clearTimeout(timer);
    return sendOrKeep(userId, op);
  });
  sending = turn.catch(() => null);
  return turn;
}

async function sendOrKeep(userId, op) {
  // Based on the version this window shows now (after any earlier save to
  // the same row in this window has landed: saves go one at a time).
  const item = { ...withVersion(op), qid: newId(), at: Date.now() };
  // Anything still waiting goes first, so saves never arrive out of order
  // (refused ones are set aside and don't hold the rest up).
  if (!isOnline() || read(userId).some((x) => !x.failed)) {
    keep(userId, item);
    if (isOnline()) flush(userId);
    return { status: 'queued', qid: item.qid };
  }
  noteSending(userId, item);
  try {
    const data = await perform(item);
    rebase(userId, item, data);
    return { status: 'saved', data };
  } catch (error) {
    if (error instanceof SupersededError) {
      announceSuperseded(error);
      return { status: 'superseded', row: error.row };
    }
    if (retryable(error)) {
      keep(userId, item);
      return { status: 'queued', qid: item.qid };
    }
    throw error;
  } finally {
    doneSending(userId, item);
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
  changes += 1;
  try {
    keep(userId, { ...withVersion(op), qid: newId(), at: Date.now() });
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
        const data = await perform(item);
        if (mine !== epoch) break;
        write(userId, read(userId).filter((x) => x.qid !== item.qid));
        rebase(userId, item, data);
      } catch (error) {
        if (mine !== epoch) break;
        // Superseded: a newer version is on the server. Not kept (it would
        // replace the newer one), never silent: the page says so and
        // shows the latest.
        if (error instanceof SupersededError) {
          supersededQids.add(item.qid);
          write(userId, read(userId).filter((x) => x.qid !== item.qid));
          announceSuperseded(error);
          continue;
        }
        if (retryable(error)) break;
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
  if (!userId) return;
  // Saves cut off by a refresh or a closed tab go first.
  const cut = readJson(sendingKey(userId)) || [];
  if (cut.length) {
    const queued = read(userId);
    write(userId, [...cut.filter((x) => !queued.some((q) => q.qid === x.qid)), ...queued]);
    removeKey(sendingKey(userId));
  }
  flush(userId);
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

/**
 * For a page: call onLatest(error) when one of its saves (to one of
 * `tables`) was refused because the row had moved on in another window.
 * The page shows the friendly message and reloads the newest version.
 */
export function useSuperseded(tables, onLatest) {
  const ref = useRef(onLatest);
  useEffect(() => { ref.current = onLatest; });
  const list = tables.join(',');
  useEffect(() => onSuperseded((error) => {
    if (list.split(',').includes(error.table)) ref.current?.(error);
  }), [list]);
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
    else if (supersededQids.has(qid)) state = 'idle'; // the page shows the latest instead
    else state = item ? 'offline' : 'saved';
  }
  return [state, (id) => setQid(id)];
}
