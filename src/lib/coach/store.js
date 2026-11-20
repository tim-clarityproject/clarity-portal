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
  // The coaching day (migration 050; Phase 6a run 2).
  coach_todo_lists: ['id'],
  coach_todo_headings: ['id'],
  coach_todos: ['id'],
  coach_days: ['coach_id', 'day'],
  coach_weeks: ['coach_id', 'week_start'],
  coach_sessions: ['id'],
  coach_session_people: ['session_id', 'profile_id'],
  coach_session_actions: ['id'],
  coach_session_notes: ['session_id'],
  workshop_sends: ['id'],
  // The calendar and booking (migration 051; Phase 6a run 3).
  coach_call_types: ['id'],
  coach_polls: ['id'],
  coach_poll_people: ['id'],
  coach_poll_options: ['id'],
  coach_poll_votes: ['option_id', 'person_id'],
  coach_booking_links: ['id'],
  coach_leads: ['id'],
  coach_cal_items: ['id'],
  coach_cal_guests: ['id'],
  coach_open_blocks: ['id'],
  coach_bookings: ['id'],
  coach_cal_reminder_sends: ['id'],
};
// The tables of migration 050. Until Tim has run it they are kept on the
// device only, exactly as every coach table was before 049: no error, and
// what waits is moved across once the tables are there.
const DAY_TABLES = new Set(['coach_todo_lists', 'coach_todo_headings', 'coach_todos', 'coach_days', 'coach_weeks', 'coach_sessions',
  'coach_session_people', 'coach_session_actions', 'coach_session_notes', 'workshop_sends']);
// Columns only migration 050 adds to an older table: left out of a save until it is there.
const DAY_COLUMNS = { coach_settings: ['hidden_help'], engagements: ['sessions_held_base'] };
// The tables of migration 051 (the calendar and booking). Until Tim has run
// it they are kept on the device only, in the same way.
const CAL_TABLES = new Set(['coach_call_types', 'coach_polls', 'coach_poll_people', 'coach_poll_options', 'coach_poll_votes',
  'coach_booking_links', 'coach_leads', 'coach_cal_items', 'coach_cal_guests', 'coach_open_blocks', 'coach_bookings',
  'coach_cal_reminder_sends']);
// Rows of one table that point at another row of the same table: the row
// pointed at is sent first (a series before the times that stand in for
// it, a call before its travel time).
const PARENT_COLUMNS = { coach_cal_items: ['series_id', 'travel_for'] };
// Read from the database but never written by a plain save (the database
// adds these rows itself, or a checked function does).
const READ_ONLY = new Set(['activity_log', 'workshop_survey_answers', 'workshop_sends', 'coach_poll_votes', 'coach_bookings',
  'coach_cal_reminder_sends']);
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
const DAY_NOT_YET_KEY = 'clarity-coach-day-not-yet';
const CAL_NOT_YET_KEY = 'clarity-coach-cal-not-yet';
const NOT_YET_MS = 60 * 60 * 1000;
const LOCAL = 'coach-local';

const localKey = (userId) => deviceKey(LOCAL, userId);
const cacheKey = (userId) => deviceKey('cache', userId, 'coach');
const EMPTY = Object.freeze({ rows: {}, marks: {} });

export const keyOf = (table, row) => (TABLES[table] || ['id']).map((c) => row?.[c]).join('|');

// What a page needs of a coaching-day row before it can draw it (the break-it tester, 20 Nov): a row without it is
// left out, as one whose key doesn't match is; a part of the wrong kind is put right. A good row is handed back as it is.
const isText = (v) => typeof v === 'string';
const isInstant = (v) => isText(v) && !Number.isNaN(new Date(v).getTime());
const isObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const SHAPES = {
  coach_todos: (r) => {
    if (!isText(r.title)) return null;
    if (Array.isArray(r.checklist ?? []) && (r.notes == null || isText(r.notes))) return r;
    return { ...r, checklist: Array.isArray(r.checklist) ? r.checklist : [], notes: isText(r.notes) ? r.notes : null };
  },
  coach_todo_lists: (r) => (isText(r.name) ? r : null),
  coach_todo_headings: (r) => (isText(r.name) ? r : null),
  coach_session_actions: (r) => (isText(r.title) ? r : null),
  coach_sessions: (r) => (isText(r.starts_at) && !Number.isNaN(new Date(r.starts_at).getTime()) ? (r.recap == null || isText(r.recap) ? r : { ...r, recap: null }) : null),
  // The calendar (051): a row a page can't place in time, or name, is left out.
  coach_cal_items: (r) => {
    if (!isText(r.title) || !isInstant(r.starts_at) || !isInstant(r.ends_at) || !isText(r.time_zone)) return null;
    if (Array.isArray(r.reminders ?? []) && Array.isArray(r.attachments ?? []) && (r.repeat_rule == null || isObject(r.repeat_rule))) return r;
    return { ...r, reminders: Array.isArray(r.reminders) ? r.reminders : [], attachments: Array.isArray(r.attachments) ? r.attachments : [], repeat_rule: isObject(r.repeat_rule) ? r.repeat_rule : null };
  },
  coach_open_blocks: (r) => (isInstant(r.starts_at) && isInstant(r.ends_at) && isText(r.time_zone) ? r : null),
  coach_poll_options: (r) => (isInstant(r.starts_at) && isInstant(r.ends_at) ? r : null),
  coach_bookings: (r) => (isText(r.name) && isInstant(r.starts_at) && isInstant(r.ends_at) ? (isObject(r.answers ?? {}) ? r : { ...r, answers: {} }) : null),
  coach_call_types: (r) => (isText(r.name) && isText(r.key) ? (Array.isArray(r.questions ?? []) ? r : { ...r, questions: [] }) : null),
  coach_polls: (r) => (isText(r.title) ? r : null),
  coach_poll_people: (r) => (isText(r.name) ? r : null),
  coach_booking_links: (r) => (isText(r.purpose) ? r : null),
  coach_leads: (r) => (isText(r.name) ? (isObject(r.answers ?? {}) ? r : { ...r, answers: {} }) : null),
};

/** What the device keeps, read so that nothing kept by another version stops a page. */
export function tidyState(raw) {
  const out = { rows: {}, marks: {} };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const table of Object.keys(TABLES)) {
    const rows = raw.rows?.[table];
    if (!rows || typeof rows !== 'object' || Array.isArray(rows)) continue;
    for (const [k, kept] of Object.entries(rows)) {
      if (k === '__proto__' || !kept || typeof kept !== 'object' || Array.isArray(kept) || keyOf(table, kept) !== k) continue;
      const row = SHAPES[table] ? SHAPES[table](kept) : kept;
      if (!row) continue;
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

const rawSeen = new Map();
/**
 * The coach's data on this device as it stands this moment, read from the
 * device itself (never during a page's render): for a check made just
 * before a save, so a change made in another tab is seen even if this tab
 * hasn't heard of it yet. When the device holds something newer, this
 * tab's copy and its pages follow.
 */
export function coachState(userId) {
  if (!userId) return EMPTY;
  let raw = null;
  let key = localKey(userId);
  try {
    raw = window.localStorage.getItem(key);
    if (raw == null) { key = cacheKey(userId); raw = window.localStorage.getItem(key); }
  } catch {
    return read(userId);
  }
  if (raw == null || (cache.has(userId) && rawSeen.get(userId) === raw)) return read(userId);
  rawSeen.set(userId, raw);
  const fresh = tidyState(readJson(key));
  const before = cache.get(userId);
  if (before && JSON.stringify(before) === JSON.stringify(fresh)) return before;
  cache.set(userId, fresh);
  listeners.forEach((fn) => fn());
  return fresh;
}

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

function notYet(key = NOT_YET_KEY) {
  try {
    const at = Number(window.localStorage.getItem(key));
    return Number.isFinite(at) && at > 0 && Date.now() - at < NOT_YET_MS && Date.now() >= at;
  } catch {
    return false;
  }
}

function noteNotYet(missing, key = NOT_YET_KEY) {
  try {
    if (missing) window.localStorage.setItem(key, String(Date.now()));
    else window.localStorage.removeItem(key);
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

let dayReadyNow = null;
let askingDay = null;

/**
 * Whether migration 050's tables (the coaching day) are there: true, false
 * (not yet) or null (can't be told). Asked only once 049 is there, and
 * "not yet" is remembered for an hour, as above.
 */
export async function coachDayReady() {
  if (dayReadyNow === true) return true;
  if ((await coachReady()) !== true) return coachReadyNow() === false ? false : null;
  if (notYet(DAY_NOT_YET_KEY)) { dayReadyNow = false; return false; }
  if (!askingDay) {
    askingDay = (async () => {
      try {
        const there = await tableReady('coach_todos');
        if (there === false) noteNotYet(true, DAY_NOT_YET_KEY);
        if (there === true) noteNotYet(false, DAY_NOT_YET_KEY);
        if (there !== null) dayReadyNow = there;
        return there;
      } catch {
        return null;
      }
    })().finally(() => { askingDay = null; });
  }
  return askingDay;
}
export const coachDayReadyNow = () => dayReadyNow;

let calReadyNow = null;
let askingCal = null;

/**
 * Whether migration 051's tables (the calendar and booking) are there:
 * true, false (not yet) or null (can't be told). Asked only once 050 is
 * there (051 needs it), and "not yet" is remembered for an hour, as above.
 */
export async function coachCalReady() {
  if (calReadyNow === true) return true;
  if ((await coachDayReady()) !== true) return coachDayReadyNow() === false ? false : null;
  if (notYet(CAL_NOT_YET_KEY)) { calReadyNow = false; return false; }
  if (!askingCal) {
    askingCal = (async () => {
      try {
        const there = await tableReady('coach_cal_items');
        if (there === false) noteNotYet(true, CAL_NOT_YET_KEY);
        if (there === true) noteNotYet(false, CAL_NOT_YET_KEY);
        if (there !== null) calReadyNow = there;
        return there;
      } catch {
        return null;
      }
    })().finally(() => { askingCal = null; });
  }
  return askingCal;
}
export const coachCalReadyNow = () => calReadyNow;

/** Is this table's home in the database yet? */
async function tableThere(table) {
  if ((await coachReady()) !== true) return false;
  if (CAL_TABLES.has(table)) return (await coachCalReady()) === true;
  return DAY_TABLES.has(table) ? (await coachDayReady()) === true : true;
}

// ---------------------------------------------------------------- saving

const forDb = (table, row) => Object.fromEntries(Object.entries(row).filter(([c]) => !DB_ONLY.includes(c)
  && !(dayReadyNow !== true && DAY_COLUMNS[table]?.includes(c))));

async function send(userId, table, row) {
  const k = keyOf(table, row);
  try {
    const op = MARK_ONLY[table]
      ? { table, kind: 'update', values: Object.fromEntries(MARK_ONLY[table].map((c) => [c, row[c] ?? null])), match: Object.fromEntries(TABLES[table].map((c) => [c, row[c]])) }
      : { table, kind: 'upsert', values: forDb(table, row), onConflict: TABLES[table].join(','), ...(ADD_ONLY.has(table) ? { ignoreDuplicates: true } : {}) };
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
  if (!(await tableThere(table))) return 'device';
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
    if (!(await tableThere(table))) { worst = 'device'; continue; }
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
    if (!(await tableThere(table))) return row;
  } else {
    mark(userId, table, key, { gone: true });
  }
  if (!(await tableThere(table))) return row;
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

async function fetchAll(dayThere, calThere) {
  const names = Object.keys(TABLES).filter((t) => (dayThere || !DAY_TABLES.has(t)) && (calThere || !CAL_TABLES.has(t)));
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
    const dayThere = (await coachDayReady()) === true;
    const calThere = dayThere && (await coachCalReady()) === true;
    let db;
    try {
      db = await fetchAll(dayThere, calThere);
    } catch {
      return null;
    }
    const before = read(userId);
    const waiting = waitingToSend(userId) > 0;
    let next = { rows: {}, marks: {} };
    for (const table of Object.keys(TABLES)) {
      if (!db[table]) {
        // Its table isn't there yet (050, 051): the device's copy is all there is.
        if (before.rows[table]) { next.rows[table] = before.rows[table]; next.marks[table] = before.marks[table] || {}; }
        continue;
      }
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
    if (!(await tableThere(table))) continue;
    const state = read(userId);
    // A row that points at another row of its own table goes after it.
    const points = (row) => (PARENT_COLUMNS[table] || []).some((c) => row[c] != null);
    const waitingRows = Object.entries(state.rows[table] || {});
    if (PARENT_COLUMNS[table]) waitingRows.sort((a, b) => Number(points(a[1])) - Number(points(b[1])));
    for (const [k, row] of waitingRows) {
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
  rawSeen.clear();
  readyNow = null;
  dayReadyNow = null;
  calReadyNow = null;
}
