import { useEffect, useSyncExternalStore } from 'react';
import { supabase } from '../supabase';
import { newId, saveOrQueue, waitingToSend } from '../syncQueue';
import { tableReady } from '../performance/tableReady';
import { deviceKey, readJson, removeKey, writeJson } from '../deviceStore';

// Where the coach portal's data is kept (migration 049; Phase 6a run 1).
//
// Device first, as peakMoments/store.js and toolAnswers.js describe. Every
// change is kept on the device at once, so the page shows it, offline too.
// Until Tim has run 049 that is all, with no error shown. Once the tables
// are there a change is sent through the offline queue ("Saved", or "Will
// sync" while it waits), whatever waits on the device from before is moved
// across once, parents before their parts, and a load brings the device's
// copy up to date with the tables.
//
// The device copy:
//   - clarity-coach-local:<coach's account> while anything on it has not
//     reached the database (before 049, or a save that waits). A Sign out
//     never clears it, because it is then the only copy there is.
//   - clarity-cache:<coach's account>:coach once the database holds
//     everything: a Sign out clears it like every other page's last data.
// It carries the account's id, so nobody else signing in here is shown it.
//
//   { rows: { [table]: { [key]: row } }, marks: { [table]: { [key]: { sent, gone, refused } } } }
// A row is exactly its database columns. `sent`: the table has it. `gone`:
// deleted here, its delete still to be sent. `refused`: the database
// refused it; it stays here, unsent, until it is changed.

// Each table and the columns that name one row. Parents come before their
// parts, the order the move across sends them in.
export const TABLES = {
  organisations: ['id'],
  coach_settings: ['coach_id'],
  coach_profiles: ['coach_id'],
  coach_away: ['id'], // from 026; kept with the rest so away dates work offline too
  client_profiles: ['id'],
  client_about: ['profile_id', 'coach_id'],
  client_notes: ['id'],
  client_files: ['id'],
  client_view_requests: ['id'],
  coach_tags: ['id'],
  coach_tag_links: ['tag_id', 'item_kind', 'item_id'],
  coach_fields: ['id'],
  coach_field_values: ['field_id', 'item_id'],
  coach_views: ['id'],
  organisation_contacts: ['id'],
  organisation_documents: ['id'],
  coach_groups: ['id'],
  coach_group_members: ['id'],
  engagements: ['id'],
  engagement_packs: ['id'],
  engagement_projects: ['id'],
  time_entries: ['id'],
  workshops: ['id'],
  workshop_attendees: ['id'],
  workshop_materials: ['id'],
  workshop_survey_answers: ['id'],
  coach_cover: ['id'],
  data_requests: ['id'],
  coach_notifications: ['id'],
  activity_log: ['id'],
};
// Read from the database but never written by a plain save (the database
// adds these rows itself, or a checked function does).
const READ_ONLY = new Set(['activity_log', 'workshop_survey_answers']);
// Tables a coach may add to but never change: a save is sent as "add it
// unless it is there" (a plain upsert would need the right to change rows).
const ADD_ONLY = new Set(['client_files', 'client_view_requests']);
// Tables a coach may only mark: the one column a save may change.
const MARK_ONLY = { coach_notifications: ['read_at'] };
// Columns the database fills in; never sent with a save.
const DB_ONLY = ['created_at', 'updated_at'];
// The codes that mean the database will never take this row as it is.
const NEVER = new Set(['42501', '23503', '23514', '23505', '22023', '22P02', 'PGRST204']);
const NOT_YET_KEY = 'clarity-coach-not-yet';
const NOT_YET_MS = 60 * 60 * 1000;
const LOCAL = 'coach-local';

const localKey = (userId) => deviceKey(LOCAL, userId);
const cacheKey = (userId) => deviceKey('cache', userId, 'coach');
const EMPTY = Object.freeze({ rows: {}, marks: {} });

export const keyOf = (table, row) => (TABLES[table] || ['id']).map((c) => row?.[c]).join('|');

/** What the device keeps, read so that nothing kept by another version stops a page. */
export function tidyState(raw) {
  const out = { rows: {}, marks: {} };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const table of Object.keys(TABLES)) {
    const rows = raw.rows?.[table];
    if (!rows || typeof rows !== 'object' || Array.isArray(rows)) continue;
    for (const [k, row] of Object.entries(rows)) {
      if (k === '__proto__' || !row || typeof row !== 'object' || Array.isArray(row) || keyOf(table, row) !== k) continue;
      (out.rows[table] ||= {})[k] = row;
      const m = raw.marks?.[table]?.[k];
      if (m && typeof m === 'object') (out.marks[table] ||= {})[k] = { sent: m.sent === true, gone: m.gone === true, refused: m.refused === true };
    }
  }
  return out;
}

// ---------------------------------------------------------------- the device copy, shared by every part of a page

const listeners = new Set();
const cache = new Map();
let readyNow = null; // what the last look at the database said

function read(userId) {
  if (!userId) return EMPTY;
  if (!cache.has(userId)) cache.set(userId, tidyState(readJson(localKey(userId)) || readJson(cacheKey(userId))));
  return cache.get(userId);
}

const anyUnsent = (state) => Object.entries(state.rows).some(([table, rows]) => !READ_ONLY.has(table)
  && Object.keys(rows).some((k) => !state.marks[table]?.[k]?.sent || state.marks[table]?.[k]?.gone));

function write(userId, next) {
  cache.set(userId, next);
  // While something here hasn't reached the database it is kept where a
  // Sign out leaves it; once everything has, it is only the last data shown.
  const asCache = readyNow === true && !anyUnsent(next);
  const ok = writeJson(asCache ? cacheKey(userId) : localKey(userId), next);
  if (ok) removeKey(asCache ? localKey(userId) : cacheKey(userId));
  listeners.forEach((fn) => fn());
  return ok;
}

function subscribe(fn) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

// Another tab's change (the storage event) shows here too.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (!e.key) return;
    const local = `clarity-${LOCAL}:`;
    const userId = e.key.startsWith(local) ? e.key.slice(local.length) : (/^clarity-cache:(.+):coach$/.exec(e.key) || [])[1];
    if (!userId || !e.newValue) return;
    cache.set(userId, tidyState(readJson(e.key)));
    listeners.forEach((fn) => fn());
  });
}

/** The coach's data on this device, kept in step with every part of the page and every tab. */
export function useCoachStore(userId) {
  return useSyncExternalStore(subscribe, () => read(userId), () => EMPTY);
}

/** A table's rows, deleted ones left out. */
export function rowsOf(state, table) {
  const rows = state.rows[table];
  if (!rows) return [];
  const marks = state.marks[table] || {};
  return Object.entries(rows).filter(([k]) => !marks[k]?.gone).map(([, row]) => row);
}

export const rowOf = (state, table, key) => {
  const row = state.rows[table]?.[key];
  return row && !state.marks[table]?.[key]?.gone ? row : null;
};

/** Is anything here still waiting to reach the database? */
export const coachWaiting = (userId) => anyUnsent(read(userId));

function setRow(state, table, row, mark) {
  const k = keyOf(table, row);
  return {
    rows: { ...state.rows, [table]: { ...(state.rows[table] || {}), [k]: row } },
    marks: { ...state.marks, [table]: { ...(state.marks[table] || {}), [k]: { sent: false, gone: false, refused: false, ...mark } } },
  };
}

function dropRow(state, table, k) {
  const rows = { ...(state.rows[table] || {}) };
  const marks = { ...(state.marks[table] || {}) };
  delete rows[k];
  delete marks[k];
  return { rows: { ...state.rows, [table]: rows }, marks: { ...state.marks, [table]: marks } };
}

function mark(userId, table, k, change) {
  const state = read(userId);
  if (!state.rows[table]?.[k]) return;
  write(userId, { rows: state.rows, marks: { ...state.marks, [table]: { ...(state.marks[table] || {}), [k]: { ...(state.marks[table]?.[k] || {}), ...change } } } });
}

// ---------------------------------------------------------------- whether 049 is there

function notYet() {
  try {
    const at = Number(window.localStorage.getItem(NOT_YET_KEY));
    return Number.isFinite(at) && at > 0 && Date.now() - at < NOT_YET_MS && Date.now() >= at;
  } catch {
    return false;
  }
}

function noteNotYet(missing) {
  try {
    if (missing) window.localStorage.setItem(NOT_YET_KEY, String(Date.now()));
    else window.localStorage.removeItem(NOT_YET_KEY);
  } catch {
    // Storage blocked: it is asked again next time.
  }
}

let asking = null;

/**
 * Whether 049's tables are there: true, false (not yet), or null when it
 * can't be told (offline). "Not yet" is remembered for an hour, so the
 * browser's console shows one 404 an hour, not one a page.
 */
export async function coachReady() {
  if (readyNow === true) return true;
  if (notYet()) { readyNow = false; return false; }
  if (!asking) {
    asking = (async () => {
      try {
        const there = await tableReady('client_profiles');
        if (there === false) noteNotYet(true);
        if (there === true) noteNotYet(false);
        if (there !== null) readyNow = there;
        return there;
      } catch {
        return null;
      }
    })().finally(() => { asking = null; });
  }
  return asking;
}

/** What the last look said, without asking again: true, false or null (not asked yet). */
export const coachReadyNow = () => readyNow;

// ---------------------------------------------------------------- saving

const forDb = (row) => Object.fromEntries(Object.entries(row).filter(([c]) => !DB_ONLY.includes(c)));

async function send(userId, table, row) {
  const k = keyOf(table, row);
  try {
    const op = MARK_ONLY[table]
      ? { table, kind: 'update', values: Object.fromEntries(MARK_ONLY[table].map((c) => [c, row[c] ?? null])), match: Object.fromEntries(TABLES[table].map((c) => [c, row[c]])) }
      : { table, kind: 'upsert', values: forDb(row), onConflict: TABLES[table].join(','), ...(ADD_ONLY.has(table) ? { ignoreDuplicates: true } : {}) };
    const answer = await saveOrQueue(userId, op);
    if (answer.status === 'saved') mark(userId, table, k, { sent: true, refused: false });
    return answer.status;
  } catch (error) {
    if (NEVER.has(error?.code)) mark(userId, table, k, { refused: true });
    throw error;
  }
}

/**
 * Keeps a row (new or changed) on the device at once, then sends it when
 * the tables are there. Resolves 'saved', 'queued' (it will sync) or
 * 'device' (kept on the device: 049 hasn't run yet). Rejects only when the
 * database answered with a real refusal; the row then stays on the device.
 */
export async function saveRow(userId, table, row) {
  if (!userId || !TABLES[table]) throw new Error(`Not a coach table: ${table}`);
  const stamped = { ...row, updated_at: new Date().toISOString() };
  if (!stamped.created_at) stamped.created_at = stamped.updated_at;
  write(userId, setRow(read(userId), table, stamped));
  if (READ_ONLY.has(table)) return 'device';
  if ((await coachReady()) !== true) return 'device';
  return send(userId, table, stamped);
}

/** Several rows at once, parents first; resolves the weakest of their answers. */
export async function saveRows(userId, pairs) {
  let state = read(userId);
  const now = new Date().toISOString();
  const stamped = pairs.map(([table, row]) => [table, { ...row, updated_at: now, created_at: row.created_at || now }]);
  for (const [table, row] of stamped) state = setRow(state, table, row);
  write(userId, state);
  if ((await coachReady()) !== true) return 'device';
  let worst = 'saved';
  for (const [table, row] of stamped) {
    if (READ_ONLY.has(table)) continue;
    const status = await send(userId, table, row);
    if (status !== 'saved') worst = status;
  }
  return worst;
}

/**
 * Deletes a row here at once and in the database when the tables are
 * there. Returns the row it removed (for Undo: save it again), or null.
 */
export async function removeRow(userId, table, key) {
  const state = read(userId);
  const row = state.rows[table]?.[key];
  if (!row) return null;
  const wasSent = state.marks[table]?.[key]?.sent === true;
  if (!wasSent) {
    write(userId, dropRow(state, table, key));
    // It may be on its way in the queue: its delete follows it there.
    if ((await coachReady()) !== true) return row;
  } else {
    mark(userId, table, key, { gone: true });
  }
  try {
    const match = Object.fromEntries(TABLES[table].map((c) => [c, row[c]]));
    const answer = await saveOrQueue(userId, { table, kind: 'delete', match });
    if (answer.status === 'saved' && read(userId).marks[table]?.[key]?.gone) write(userId, dropRow(read(userId), table, key));
  } catch (error) {
    if (!NEVER.has(error?.code)) throw error;
    // Refused: it is still in the database, so it shows again.
    mark(userId, table, key, { gone: false });
    throw error;
  }
  return row;
}

/** Takes rows off the device only (what a checked function has already deleted in the database). */
export function forgetRows(userId, pairs) {
  let state = read(userId);
  for (const [table, key] of pairs) if (state.rows[table]?.[key]) state = dropRow(state, table, key);
  write(userId, state);
}

/** Puts rows on the device as the database has them (what a checked function has just written). */
export function noteRows(userId, pairs) {
  let state = read(userId);
  for (const [table, row] of pairs) state = setRow(state, table, row, { sent: true });
  write(userId, state);
}

// ---------------------------------------------------------------- loading

const loading = new Map();

async function fetchAll() {
  const names = Object.keys(TABLES);
  const out = {};
  // A few at a time: gentle on the database, quick enough for the page.
  for (let i = 0; i < names.length; i += 6) {
    const batch = names.slice(i, i + 6);
    const answers = await Promise.all(batch.map((table) => supabase.from(table).select('*').limit(5000)));
    answers.forEach((a, j) => {
      if (a.error) throw a.error;
      out[batch[j]] = a.data || [];
    });
  }
  return out;
}

/**
 * Brings the device's copy up to date. Before 049: nothing to do. With it:
 * the tables' rows replace everything the device has marked as sent, what
 * the device still holds unsent is kept and sent, parents first.
 * Resolves true (loaded), false (049 not there yet) or null (offline).
 */
export function loadCoach(userId) {
  if (!userId) return Promise.resolve(null);
  if (loading.has(userId)) return loading.get(userId);
  const run = (async () => {
    const there = await coachReady();
    if (there !== true) return there;
    let db;
    try {
      db = await fetchAll();
    } catch {
      return null;
    }
    const before = read(userId);
    const waiting = waitingToSend(userId) > 0;
    let next = { rows: {}, marks: {} };
    for (const table of Object.keys(TABLES)) {
      for (const row of db[table]) next = setRow(next, table, row, { sent: true });
      for (const [k, row] of Object.entries(before.rows[table] || {})) {
        const m = before.marks[table]?.[k] || {};
        const inDb = Boolean(next.rows[table]?.[k]);
        if (m.gone) {
          // Deleted here: stays deleted while its delete waits; once the
          // table no longer has it, it is forgotten.
          if (inDb) next = setRow(next, table, row, { sent: true, gone: true });
          continue;
        }
        if (m.sent) continue; // the database's copy (or its absence) is the truth
        if (READ_ONLY.has(table)) continue;
        // Unsent: the device's copy stays in front until it has been sent.
        next = setRow(next, table, row, { sent: false, refused: m.refused === true });
      }
    }
    write(userId, next);
    if (!waiting) await moveAcross(userId);
    return true;
  })().finally(() => { loading.delete(userId); });
  loading.set(userId, run);
  return run;
}

// What waited on the device from before 049 (or from a save that never
// landed) is sent once, parents before their parts. A refused row stays.
async function moveAcross(userId) {
  for (const table of Object.keys(TABLES)) {
    if (READ_ONLY.has(table)) continue;
    const state = read(userId);
    for (const [k, row] of Object.entries(state.rows[table] || {})) {
      const m = state.marks[table]?.[k] || {};
      if (m.sent || m.refused) continue;
      if (m.gone) continue;
      try {
        await send(userId, table, row);
      } catch {
        // Kept on the device, marked refused or still unsent.
      }
    }
  }
}

/** Loads the coach's data when a page opens, and again when the tab is shown. */
export function useCoachLoad(userId) {
  useEffect(() => {
    if (!userId) return undefined;
    loadCoach(userId);
    const again = () => { if (document.visibilityState === 'visible') loadCoach(userId); };
    document.addEventListener('visibilitychange', again);
    window.addEventListener('online', again);
    return () => {
      document.removeEventListener('visibilitychange', again);
      window.removeEventListener('online', again);
    };
  }, [userId]);
}

export { newId };

// For tests: forget what this module remembers.
export function resetCoachStoreForTests() {
  cache.clear();
  readyNow = null;
}
