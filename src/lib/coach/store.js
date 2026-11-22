import { useEffect, useSyncExternalStore } from 'react';
import { supabase } from '../supabase';
import { newId, saveOrQueue, waitingToSend } from '../syncQueue';
import { tableReady } from '../performance/tableReady';
import { deviceKey, readJson, removeKey, writeJson } from '../deviceStore';
import { deviceCopyAvailable, readCopy, writeTables } from './deviceCopy';

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
  coach_lead_stages: ['id'], // 052: here so a stage is sent before the leads in it
  coach_leads: ['id'],
  coach_cal_items: ['id'],
  coach_cal_guests: ['id'],
  coach_open_blocks: ['id'],
  coach_bookings: ['id'],
  coach_cal_reminder_sends: ['id'],
  // Leads, the CRM and Network's own columns (migration 052; Phase 6a run 4). Network's PEOPLE are never here:
  // they are read a page at a time (networkData.js).
  coach_lead_events: ['id'],
  coach_automations: ['id'],
  coach_automation_runs: ['id'],
  coach_boards: ['id'],
  coach_board_stages: ['id'],
  coach_board_items: ['id'],
  coach_emails: ['id'],
  coach_email_links: ['email_id', 'person_kind', 'person_id'],
  coach_email_waiting: ['id'],
  coach_email_addresses: ['id'],
  client_check_ins: ['id'],
  organisation_deals: ['id'],
  organisation_growth: ['id'],
  network_columns: ['id'],
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
// The tables of migration 052 (Leads, the CRM and Network). Until Tim has
// run it they are kept on the device only, in the same way. coach_leads
// itself is 051's; 052 adds columns to it (CRM_COLUMNS).
const CRM_TABLES = new Set(['coach_lead_stages', 'coach_lead_events', 'coach_automations', 'coach_automation_runs', 'coach_boards',
  'coach_board_stages', 'coach_board_items', 'coach_emails', 'coach_email_links', 'coach_email_waiting', 'coach_email_addresses',
  'client_check_ins', 'organisation_deals', 'organisation_growth', 'network_columns']);
// Columns only migration 052 adds to an older table: left out of a save until it is there. A row that holds one is
// then only PART sent: it stays marked unsent, so the device's copy stays in front and the whole row goes once 052 is there.
const CRM_COLUMNS = {
  coach_leads: ['stage_id', 'organisation', 'organisation_id', 'job_title', 'phone', 'value', 'currency', 'next_step', 'next_step_on',
    'next_step_time', 'referred_by', 'referred_by_person', 'network_person_id', 'last_contact_on', 'want_outcome', 'want_pain',
    'who_decides', 'who_funds', 'decide_when', 'won_at', 'won_profile_id', 'cold_at', 'cold_reason', 'cold_check_on', 'merged_into'],
  coach_todos: ['network_person_id', 'automation_id', 'board_item_id', 'from_email_ref'],
  coach_settings: ['crm'],
};
// Rows of one table that point at another row of the same table: the row
// pointed at is sent first (a series before the times that stand in for
// it, a call before its travel time, a lead before one merged into it).
const PARENT_COLUMNS = { coach_cal_items: ['series_id', 'travel_for'], coach_leads: ['merged_into'] };
// Read from the database but never written by a plain save (the database
// adds these rows itself, or a checked function does).
const READ_ONLY = new Set(['activity_log', 'workshop_survey_answers', 'workshop_sends', 'coach_poll_votes', 'coach_bookings',
  'coach_cal_reminder_sends', 'coach_email_addresses']);
// Tables a coach may add to but never change: a save is sent as "add it
// unless it is there" (a plain upsert would need the right to change rows).
const ADD_ONLY = new Set(['client_files', 'client_view_requests', 'coach_automation_runs', 'coach_email_links']);
// Tables a coach may only mark: the one column a save may change.
const MARK_ONLY = { coach_notifications: ['read_at'] };
// Columns the database fills in; never sent with a save.
const DB_ONLY = ['created_at', 'updated_at'];
// The codes that mean the database will never take this row as it is.
const NEVER = new Set(['42501', '23503', '23001', '23514', '23505', '22023', '22P02', 'PGRST204']);
const NOT_YET_KEY = 'clarity-coach-not-yet';
const DAY_NOT_YET_KEY = 'clarity-coach-day-not-yet';
const CAL_NOT_YET_KEY = 'clarity-coach-cal-not-yet';
const CRM_NOT_YET_KEY = 'clarity-coach-crm-not-yet';
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
  // Leads, the CRM and Network's columns (052): a row a page can't name or place is left out.
  coach_lead_stages: (r) => (isText(r.name) ? r : null),
  coach_lead_events: (r) => (isText(r.lead_id) && isText(r.kind) ? (isObject(r.data ?? {}) ? r : { ...r, data: {} }) : null),
  coach_automations: (r) => (isText(r.trigger) && isText(r.action) ? r : null),
  coach_automation_runs: (r) => (isText(r.automation_id) && isText(r.event_key) ? r : null),
  coach_boards: (r) => (isText(r.name) ? (Array.isArray(r.columns ?? []) ? r : { ...r, columns: [] }) : null),
  coach_board_stages: (r) => (isText(r.name) && isText(r.board_id) ? r : null),
  coach_board_items: (r) => (isText(r.title) && isText(r.board_id) ? (isObject(r.field_values ?? {}) ? r : { ...r, field_values: {} }) : null),
  coach_emails: (r) => (Array.isArray(r.to_people ?? []) && Array.isArray(r.cc_people ?? []) ? r : { ...r, to_people: Array.isArray(r.to_people) ? r.to_people : [], cc_people: Array.isArray(r.cc_people) ? r.cc_people : [] }),
  coach_email_waiting: (r) => (isText(r.email) ? r : null),
  client_check_ins: (r) => (isText(r.profile_id) && isText(r.due_on) ? r : null),
  organisation_deals: (r) => (isText(r.name) && isText(r.organisation_id) ? r : null),
  organisation_growth: (r) => (isText(r.title) && isText(r.organisation_id) ? r : null),
  network_columns: (r) => (isText(r.name) ? (Array.isArray(r.options ?? []) ? r : { ...r, options: [] }) : null),
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
      if (m && typeof m === 'object') (out.marks[table] ||= {})[k] = { sent: m.sent === true, gone: m.gone === true, refused: m.refused === true, ...(m.part === true ? { part: true } : {}) };
    }
  }
  return out;
}

// ---------------------------------------------------------------- the device copy, shared by every part of a page

const listeners = new Set();
const cache = new Map();
let readyNow = null; // what the last look at the database said
let generation = 0; // a test's reset: answers that arrive after it are dropped

// A large copy (scale check, 22 Nov). At 1,000 clients a coach's copy is 5 to 15 MB, over localStorage's limit, and
// writing it whole on every save took longer than a tap may. Once it holds more than BIG_ROWS rows (or localStorage
// refuses it) it is kept in IndexedDB instead, a table at a time and only the tables that changed (deviceCopy.js),
// while whatever hasn't reached the database stays in localStorage under clarity-coach-local:, marked `partial`, where
// a Sign out leaves it. Small copies (and every test of the run 1 to 6 suites) are kept exactly as before.
const BIG_ROWS = 2000;
const big = new Set(); // the accounts whose copy is in IndexedDB this visit
const hydrating = new Map(); // account -> the read of its IndexedDB copy
const persisted = new Map(); // account -> { rows: { [table]: object }, marks: { [table]: object } } as last written there
const copyTimers = new Map();

const countOf = new WeakMap();
const tableCount = (rows) => {
  if (!rows) return 0;
  let n = countOf.get(rows);
  if (n == null) { n = Object.keys(rows).length; countOf.set(rows, n); }
  return n;
};
const totalRows = (state) => Object.values(state.rows).reduce((n, rows) => n + tableCount(rows), 0);

// What of one table hasn't reached the database ({ rows, marks } or null), worked out once per version of the table.
const unsentMemo = new WeakMap();
function unsentPart(table, rows, marks) {
  if (!rows) return null;
  const hit = unsentMemo.get(rows);
  if (hit && hit.marks === marks) return hit.part;
  let part = null;
  if (!READ_ONLY.has(table)) {
    for (const k of Object.keys(rows)) {
      const m = marks?.[k];
      if (!m?.sent || m.gone) {
        part ||= { rows: {}, marks: {} };
        part.rows[k] = rows[k];
        if (m) part.marks[k] = m;
      }
    }
  }
  unsentMemo.set(rows, { marks, part });
  return part;
}
function unsentState(state) {
  let out = null;
  for (const table of Object.keys(state.rows)) {
    const part = unsentPart(table, state.rows[table], state.marks[table]);
    if (!part) continue;
    out ||= { rows: {}, marks: {} };
    out.rows[table] = part.rows;
    out.marks[table] = part.marks;
  }
  return out;
}

/** `part`'s rows over `base`'s, table by table (a partial copy from localStorage over the whole one). */
function overlay(base, part) {
  if (!part || !Object.keys(part.rows).length) return base;
  const out = { rows: { ...base.rows }, marks: { ...base.marks } };
  for (const table of Object.keys(part.rows)) {
    out.rows[table] = { ...(base.rows[table] || {}), ...part.rows[table] };
    out.marks[table] = { ...(base.marks[table] || {}), ...(part.marks[table] || {}) };
  }
  return out;
}

const parseRaw = (raw) => { try { return raw ? JSON.parse(raw) : null; } catch { return null; } };

function read(userId) {
  if (!userId) return EMPTY;
  if (!cache.has(userId)) {
    cache.set(userId, tidyState(readJson(localKey(userId)) || readJson(cacheKey(userId))));
    hydrate(userId);
  }
  return cache.get(userId);
}

/** Reads the IndexedDB copy once a visit: what it holds shows at once, under anything newer here. */
function hydrate(userId) {
  if (!userId) return Promise.resolve();
  if (hydrating.has(userId)) return hydrating.get(userId);
  const gen = generation;
  const run = (async () => {
    if (!deviceCopyAvailable()) return;
    const copy = await readCopy(userId);
    if (!copy || gen !== generation) return;
    const kept = tidyState({ rows: Object.fromEntries(Object.entries(copy).map(([t, v]) => [t, v?.rows])), marks: Object.fromEntries(Object.entries(copy).map(([t, v]) => [t, v?.marks])) });
    big.add(userId);
    persisted.set(userId, { rows: { ...kept.rows }, marks: { ...kept.marks } });
    // What this tab already holds (localStorage's copy, or a save made since it opened) is newer: it wins, row by row.
    const now = cache.get(userId);
    const next = now && totalRows(now) ? overlay(kept, now) : kept;
    cache.set(userId, next);
    listeners.forEach((fn) => fn());
  })().catch(() => {});
  hydrating.set(userId, run);
  return run;
}

const anyUnsent = (state) => Object.keys(state.rows).some((table) => unsentPart(table, state.rows[table], state.marks[table]) !== null);

let channel = null;
function copyChannel() {
  if (channel !== null) return channel;
  try {
    channel = typeof globalThis.BroadcastChannel === 'function' ? new globalThis.BroadcastChannel('clarity-coach-copy') : false;
    // Another tab's change, for a large copy (the storage event only carries what waits to be sent).
    if (channel) {
      channel.onmessage = (e) => {
        const { userId, tables } = e.data || {};
        if (!userId || !tables || !cache.has(userId)) return;
        const now = cache.get(userId);
        const next = { rows: { ...now.rows }, marks: { ...now.marks } };
        for (const [t, v] of Object.entries(tables)) {
          if (!TABLES[t]) continue;
          if (v) { next.rows[t] = v.rows; next.marks[t] = v.marks; } else { delete next.rows[t]; delete next.marks[t]; }
        }
        cache.set(userId, tidyState(next));
        listeners.forEach((fn) => fn());
      };
    }
  } catch {
    channel = false;
  }
  return channel;
}

/** The tables that differ from what IndexedDB last took. */
function changedTables(userId, state) {
  const was = persisted.get(userId) || { rows: {}, marks: {} };
  const out = {};
  for (const t of new Set([...Object.keys(state.rows), ...Object.keys(was.rows)])) {
    if (state.rows[t] === was.rows[t] && state.marks[t] === was.marks[t]) continue;
    out[t] = state.rows[t] ? { rows: state.rows[t], marks: state.marks[t] || {} } : null;
  }
  return out;
}

function flushCopy(userId) {
  copyTimers.delete(userId);
  const state = cache.get(userId);
  if (!state || !big.has(userId)) return;
  const tables = changedTables(userId, state);
  if (!Object.keys(tables).length) return;
  persisted.set(userId, { rows: { ...state.rows }, marks: { ...state.marks } });
  writeTables(userId, tables);
  try { copyChannel()?.postMessage({ userId, tables }); } catch { /* another tab reads it next time */ }
}

// The copy is written after the page has drawn (a save never waits for it), and at once when the page is hidden.
function scheduleCopy(userId) {
  if (copyTimers.has(userId)) return;
  const later = typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function'
    ? (fn) => window.requestIdleCallback(fn, { timeout: 1000 }) : (fn) => setTimeout(fn, 200);
  copyTimers.set(userId, later(() => flushCopy(userId)));
}
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const flushAll = () => { for (const userId of [...copyTimers.keys()]) flushCopy(userId); };
  window.addEventListener('pagehide', flushAll);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushAll(); });
}

function write(userId, next) {
  cache.set(userId, next);
  // While something here hasn't reached the database it is kept where a
  // Sign out leaves it; once everything has, it is only the last data shown.
  const asCache = readyNow === true && !anyUnsent(next);
  let ok;
  if (!big.has(userId) && !(deviceCopyAvailable() && totalRows(next) > BIG_ROWS)) {
    ok = writeJson(asCache ? cacheKey(userId) : localKey(userId), next);
    if (ok) removeKey(asCache ? localKey(userId) : cacheKey(userId));
    else if (deviceCopyAvailable()) big.add(userId); // too big for localStorage: IndexedDB takes it
  }
  if (big.has(userId) || (ok === undefined && deviceCopyAvailable())) {
    big.add(userId);
    const part = asCache ? null : unsentState(next);
    if (part) {
      const raw = JSON.stringify({ ...part, partial: true });
      try { window.localStorage.setItem(localKey(userId), raw); rawSeen.set(userId, raw); ok = true; } catch { ok = false; }
    } else {
      removeKey(localKey(userId));
      ok = true;
    }
    removeKey(cacheKey(userId));
    scheduleCopy(userId);
  }
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
    const raw = parseRaw(e.newValue);
    // A large copy's waiting rows: laid over this tab's copy, never in place of it.
    cache.set(userId, raw?.partial ? overlay(read(userId), tidyState(raw)) : tidyState(raw));
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

const NO_TABLE = Object.freeze({});
const tableMemo = new WeakMap();
/**
 * Something worked out from one table's rows (`make(rowsOf(state, table))`), kept until that table changes: the frame
 * hands every page the same lists until their own table changes, so a page's own memos don't start again on every save
 * elsewhere. `name` tells apart the different things worked out from one table. Never change what it hands back.
 */
export function fromTable(state, table, name, make) {
  const rows = state.rows[table] || NO_TABLE;
  const marks = state.marks[table] || NO_TABLE;
  let m = tableMemo.get(rows);
  if (!m || m.marks !== marks) { m = { marks, out: new Map() }; tableMemo.set(rows, m); }
  const key = `${table}\u0000${name}`;
  if (!m.out.has(key)) m.out.set(key, make(rowsOf(state, table)));
  return m.out.get(key);
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
    if (raw == null && !big.has(userId)) { key = cacheKey(userId); raw = window.localStorage.getItem(key); }
  } catch {
    return read(userId);
  }
  if (raw == null || (cache.has(userId) && rawSeen.get(userId) === raw)) return read(userId);
  rawSeen.set(userId, raw);
  const parsed = parseRaw(raw);
  if (parsed?.partial) {
    // A large copy: only what waits to be sent is in localStorage. Another tab's waiting rows go over this tab's copy.
    const before = read(userId);
    const part = tidyState(parsed);
    const differs = Object.keys(part.rows).some((t) => Object.keys(part.rows[t]).some((k) => JSON.stringify(part.rows[t][k]) !== JSON.stringify(before.rows[t]?.[k])
      || JSON.stringify(part.marks[t]?.[k]) !== JSON.stringify(before.marks[t]?.[k])));
    if (!differs) return before;
    const fresh = overlay(before, part);
    cache.set(userId, fresh);
    listeners.forEach((fn) => fn());
    return fresh;
  }
  const fresh = tidyState(parsed);
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

/** Puts the database's copy of a row on the device, marked sent, while the device still holds `sentRow` (the version that went). */
function settle(userId, table, sentRow, dbRow) {
  const state = read(userId);
  const k = keyOf(table, sentRow);
  const here = state.rows[table]?.[k];
  if (here && here.updated_at !== sentRow.updated_at) return; // changed here again since: that change is still to go
  write(userId, setRow(state, table, dbRow, { sent: true }));
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

let crmReadyNow = null;
let askingCrm = null;

/**
 * Whether migration 052's tables (Leads, the CRM and Network) are there:
 * true, false (not yet) or null (can't be told). Asked only once 051 is
 * there (052 needs it), and "not yet" is remembered for an hour, as above.
 */
export async function coachCrmReady() {
  if (crmReadyNow === true) return true;
  if ((await coachCalReady()) !== true) return coachCalReadyNow() === false ? false : null;
  if (notYet(CRM_NOT_YET_KEY)) { crmReadyNow = false; return false; }
  if (!askingCrm) {
    askingCrm = (async () => {
      try {
        const there = await tableReady('coach_lead_stages');
        if (there === false) noteNotYet(true, CRM_NOT_YET_KEY);
        if (there === true) noteNotYet(false, CRM_NOT_YET_KEY);
        if (there !== null) crmReadyNow = there;
        return there;
      } catch {
        return null;
      }
    })().finally(() => { askingCrm = null; });
  }
  return askingCrm;
}
export const coachCrmReadyNow = () => crmReadyNow;

/** Is this table's home in the database yet? */
async function tableThere(table) {
  if ((await coachReady()) !== true) return false;
  if (CRM_TABLES.has(table)) return (await coachCrmReady()) === true;
  if (CAL_TABLES.has(table)) return (await coachCalReady()) === true;
  return DAY_TABLES.has(table) ? (await coachDayReady()) === true : true;
}

// ---------------------------------------------------------------- saving

const forDb = (table, row) => Object.fromEntries(Object.entries(row).filter(([c]) => !DB_ONLY.includes(c)
  && !(dayReadyNow !== true && DAY_COLUMNS[table]?.includes(c))
  && !(crmReadyNow !== true && CRM_COLUMNS[table]?.includes(c))));
/** Does this row hold something of 052's that the database can't take yet? */
const heldBack = (table, row) => crmReadyNow !== true && Boolean(CRM_COLUMNS[table]?.some((c) => row[c] != null && !(c === 'currency' && row[c] === 'GBP')
  && !(c === 'crm' && Object.keys(row[c] || {}).length === 0)));

async function send(userId, table, row) {
  const k = keyOf(table, row);
  try {
    const op = MARK_ONLY[table]
      ? { table, kind: 'update', values: Object.fromEntries(MARK_ONLY[table].map((c) => [c, row[c] ?? null])), match: Object.fromEntries(TABLES[table].map((c) => [c, row[c]])) }
      : { table, kind: 'upsert', values: forDb(table, row), onConflict: TABLES[table].join(','), ...(ADD_ONLY.has(table) ? { ignoreDuplicates: true } : {}) };
    const part = heldBack(table, row);
    const answer = await saveOrQueue(userId, op);
    if (answer.status === 'saved') {
      mark(userId, table, k, part ? { sent: false, refused: false, part: true } : { sent: true, refused: false, part: false });
      // The database's own copy (its updated_at, and anything its guards kept: a sent recap, a merge, Won or Cold)
      // replaces the device's, unless the row has changed here again since this save left.
      const there = Array.isArray(answer.data) ? answer.data.find((r) => r && keyOf(table, r) === k) : null;
      if (there && !part) settle(userId, table, row, { ...row, ...there });
    }
    // Refused because the row changed in another tab or device since this one read it (a guarded row, syncQueue's
    // basedOn): the device goes back to the database's copy, and the page says so.
    if (answer.status === 'superseded' && answer.row) settle(userId, table, row, answer.row);
    return answer.status === 'saved' && part ? 'device' : answer.status;
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
  let superseded = false;
  for (const [table, row] of stamped) {
    if (READ_ONLY.has(table)) continue;
    if (!(await tableThere(table))) { worst = 'device'; continue; }
    const status = await send(userId, table, row);
    if (status === 'superseded') superseded = true;
    else if (status !== 'saved') worst = status;
  }
  return superseded ? 'superseded' : worst;
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

// What is read first and what follows (scale check, 22 Nov). A coach's whole copy at Tim's scale is 32,000 rows and
// 15 MB, and the calendar alone passed the old cap of 5,000 rows and quietly lost the rest. Now:
//   - FIRST, before the page shows the database's data: every table in full but the ones below, the calendar from
//     6 weeks back to 4 months ahead (with every repeating series and the stand-ins of its times), and the to-dos still
//     open or done in the last 60 days. Sessions and their people stay whole: sessions held are counted from them.
//   - LATER, once the page has drawn, quietly and once a visit: the older to-dos, every session's notes, client notes,
//     the activity log and the lead events.
//   - The calendar's other weeks are read as the coach moves to them (ensureCalRange), never all at once.
// A read that fills its 5,000 rows goes on a page of 1,000 at a time until the table has no more, so nothing is ever
// cut off unseen.
const PAGE = 1000;
const FIRST_READ = 5000;
const DAY_MS = 24 * 60 * 60 * 1000;
const CAL_BACK_DAYS = 42;
const CAL_AHEAD_DAYS = 120;
const TODO_DONE_DAYS = 60;
const LATER_TABLES = new Set(['coach_session_notes', 'client_notes', 'activity_log', 'coach_lead_events']);
const iso = (ms) => new Date(ms).toISOString();
const dayOf = (ms) => iso(ms).slice(0, 10);
const instant = (v) => { const t = typeof v === 'string' ? Date.parse(v) : NaN; return Number.isNaN(t) ? null : t; };

/** The calendar between two instants: single items that overlap them, every series, and the stand-ins of their times. */
export function calWindow(fromMs, toMs) {
  const fromDay = dayOf(fromMs - DAY_MS);
  const toDay = dayOf(toMs + DAY_MS);
  return {
    narrow: (q) => q.or(`repeat_rule.not.is.null,and(starts_at.lt."${iso(toMs)}",ends_at.gt."${iso(fromMs)}"),and(occurrence_on.gte.${fromDay},occurrence_on.lte.${toDay})`),
    inScope: (r) => {
      if (r.repeat_rule != null) return true;
      const a = instant(r.starts_at);
      const b = instant(r.ends_at);
      if (a !== null && b !== null && a < toMs && b > fromMs) return true;
      return typeof r.occurrence_on === 'string' && r.occurrence_on >= fromDay && r.occurrence_on <= toDay;
    },
  };
}

function plans(names, nowMs, tier) {
  const cut = nowMs - TODO_DONE_DAYS * DAY_MS;
  const out = [];
  for (const table of names) {
    if (table === 'coach_cal_items') {
      if (tier === 'first') out.push({ table, ...calWindow(nowMs - CAL_BACK_DAYS * DAY_MS, nowMs + CAL_AHEAD_DAYS * DAY_MS) });
    } else if (table === 'coach_todos') {
      out.push(tier === 'first'
        ? { table, narrow: (q) => q.or(`done_at.is.null,done_at.gte."${iso(cut)}"`), inScope: (r) => r.done_at == null || !(instant(r.done_at) < cut) }
        : { table, narrow: (q) => q.lt('done_at', iso(cut)), inScope: (r) => r.done_at != null && instant(r.done_at) !== null && instant(r.done_at) < cut });
    } else if (LATER_TABLES.has(table) === (tier === 'later')) {
      out.push({ table, narrow: null, inScope: null });
    }
  }
  return out;
}

/**
 * Every row of one read. First as before (one read, up to 5,000 rows, in the database's own order, so the pages see
 * their rows in the order they always have); a table that fills it is then read again a page of 1,000 at a time in the
 * order of its key until it has no more, so nothing is ever cut off unseen (the owner's calendar once was).
 */
async function fetchTable(table, narrow) {
  let q = supabase.from(table).select('*');
  if (narrow) q = narrow(q);
  const first = await q.limit(FIRST_READ);
  if (first.error) throw first.error;
  if ((first.data || []).length < FIRST_READ) return first.data || [];
  const out = [];
  const seen = new Set();
  for (let from = 0; ; from += PAGE) {
    let p = supabase.from(table).select('*');
    if (narrow) p = narrow(p);
    for (const c of TABLES[table]) p = p.order(c, { ascending: true });
    const { data, error } = await p.range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = data || [];
    let fresh = 0;
    for (const r of rows) {
      const k = keyOf(table, r);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(r);
      fresh += 1;
    }
    if (rows.length < PAGE || fresh === 0) return out;
  }
}

async function fetchPlans(list) {
  const out = new Map();
  // A few at a time: gentle on the database, quick enough for the page.
  for (let i = 0; i < list.length; i += 6) {
    const batch = list.slice(i, i + 6);
    const answers = await Promise.all(batch.map((p) => fetchTable(p.table, p.narrow)));
    answers.forEach((rows, j) => out.set(batch[j].table, { rows, inScope: batch[j].inScope }));
  }
  return out;
}

const sameMark = (a, b) => a === b || (Boolean(a) && Boolean(b) && a.sent === b.sent && a.gone === b.gone && a.refused === b.refused && a.part === b.part);
// Field by field (a stamp like updated_at isn't enough: not every table's is moved by the database on a change).
function sameRow(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  for (const k of keys) {
    const x = a[k];
    const y = b[k];
    if (x === y) continue;
    if (x && y && typeof x === 'object' && typeof y === 'object' && JSON.stringify(x) === JSON.stringify(y)) continue;
    return false;
  }
  return true;
}

/**
 * One table brought up to date, in one pass (it once copied the whole table for every row: 10 seconds for the owner).
 * The database's rows replace what the device holds as sent; what waits here unsent stays in front; a row deleted here
 * stays deleted while its delete waits. `inScope` says which of the device's rows this read covered: the others (older
 * weeks of the calendar, say) are kept as they are. Rows and the table that haven't changed are handed back as they
 * were, so the pages that show them don't work them out again.
 */
export function mergeTable(table, beforeRows = {}, beforeMarks = {}, dbRows = [], inScope = null) {
  const rows = {};
  const marks = {};
  for (const row of dbRows) {
    const k = keyOf(table, row);
    rows[k] = row;
    marks[k] = { sent: true, gone: false, refused: false };
  }
  for (const k of Object.keys(beforeRows)) {
    const row = beforeRows[k];
    const m = beforeMarks[k] || {};
    const inDb = Object.prototype.hasOwnProperty.call(rows, k);
    if (inScope && !inDb && !inScope(row)) {
      // Not covered by this read: kept as it was.
      rows[k] = row;
      if (beforeMarks[k]) marks[k] = beforeMarks[k];
      continue;
    }
    if (m.gone) {
      // Deleted here: stays deleted while its delete waits; once the
      // table no longer has it, it is forgotten.
      if (inDb) { rows[k] = row; marks[k] = { sent: true, gone: true, refused: false }; }
      continue;
    }
    if (m.sent) continue; // the database's copy (or its absence) is the truth
    if (READ_ONLY.has(table)) continue;
    // Unsent: the device's copy stays in front until it has been sent.
    rows[k] = row;
    marks[k] = { sent: false, gone: false, refused: m.refused === true, ...(m.part === true ? { part: true } : {}) };
  }
  // Unchanged rows (and an unchanged table) are handed back as they were.
  const keys = Object.keys(rows);
  let same = keys.length === Object.keys(beforeRows).length;
  for (const k of keys) {
    const old = beforeRows[k];
    if (old !== undefined && rows[k] !== old && sameRow(old, rows[k])) rows[k] = old;
    if (same && (rows[k] !== old || !sameMark(marks[k], beforeMarks[k]))) same = false;
  }
  if (same && Object.keys(beforeMarks).length === Object.keys(marks).length) return { rows: beforeRows, marks: beforeMarks };
  return { rows, marks };
}

/** The device's copy brought up to date with what was read: { [table]: { rows, inScope } }. Pure, for the tests too. */
export function mergeLoaded(before, read) {
  const next = { rows: { ...before.rows }, marks: { ...before.marks } };
  for (const [table, { rows, inScope }] of read) {
    const merged = mergeTable(table, before.rows[table], before.marks[table], rows, inScope);
    if (!Object.keys(merged.rows).length && !before.rows[table]) continue;
    next.rows[table] = merged.rows;
    next.marks[table] = merged.marks;
  }
  return next;
}

const calLoaded = new Map(); // account -> [[fromMs, toMs]] of the calendar read this visit
const calAsking = new Map();
const laterDone = new Set(); // accounts whose LATER tables have been read this visit

function tablesThere(dayThere, calThere, crmThere) {
  return Object.keys(TABLES).filter((t) => (dayThere || !DAY_TABLES.has(t)) && (calThere || !CAL_TABLES.has(t)) && (crmThere || !CRM_TABLES.has(t)));
}

const whenIdle = (fn) => {
  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') window.requestIdleCallback(fn, { timeout: 1500 });
  else setTimeout(fn, 50);
};

/** The LATER tables, once a visit, after the page has drawn. Resolves when they are in (tests wait for it). */
export function loadCoachLater(userId) {
  if (!userId || laterDone.has(userId)) return Promise.resolve(false);
  laterDone.add(userId);
  const gen = generation;
  return new Promise((resolve) => {
    whenIdle(async () => {
      try {
        const names = tablesThere(dayReadyNow === true, calReadyNow === true, crmReadyNow === true);
        const db = await fetchPlans(plans(names, Date.now(), 'later'));
        if (gen !== generation) { resolve(false); return; }
        await hydrate(userId);
        write(userId, mergeLoaded(read(userId), db));
        resolve(true);
      } catch {
        laterDone.delete(userId); // tried again on the next load
        resolve(false);
      }
    });
  });
}

/**
 * The calendar's items between two days (the weeks a page shows), read once a visit with a few weeks either side, so
 * moving through the calendar asks the database only now and then. Resolves true when they are in.
 */
export function ensureCalRange(userId, fromDay, toDay) {
  if (!userId || calReadyNow !== true || !fromDay || !toDay) return Promise.resolve(false);
  const want = [Date.parse(`${fromDay}T00:00:00Z`) - 2 * DAY_MS, Date.parse(`${toDay}T00:00:00Z`) + 3 * DAY_MS];
  if (Number.isNaN(want[0]) || Number.isNaN(want[1])) return Promise.resolve(false);
  const have = calLoaded.get(userId) || [];
  if (have.some(([a, b]) => a <= want[0] && b >= want[1])) return Promise.resolve(true);
  const span = [want[0] - 28 * DAY_MS, want[1] + 28 * DAY_MS];
  const key = `${userId}|${span[0]}|${span[1]}`;
  if (calAsking.has(key)) return calAsking.get(key);
  const gen = generation;
  const w = calWindow(span[0], span[1]);
  const run = fetchTable('coach_cal_items', w.narrow).then(async (rows) => {
    if (gen !== generation) return false;
    await hydrate(userId);
    write(userId, mergeLoaded(read(userId), new Map([['coach_cal_items', { rows, inScope: w.inScope }]])));
    calLoaded.set(userId, [...(calLoaded.get(userId) || []), span]);
    return true;
  }).catch(() => false).finally(() => { calAsking.delete(key); });
  calAsking.set(key, run);
  return run;
}

/** Calendar items whose title, notes or place hold what was typed, from the database (search: never the whole calendar). */
export async function findCalItems(typed, { max = 30 } = {}) {
  const words = String(typed || '').replace(/[%*,()"\\:.]/g, ' ').trim().replace(/\s+/g, ' ');
  if (words.length < 2 || calReadyNow !== true) return [];
  const like = `"*${words}*"`;
  const { data, error } = await supabase.from('coach_cal_items').select('*')
    .or(`title.ilike.${like},notes.ilike.${like},location.ilike.${like}`).order('starts_at', { ascending: false }).limit(max);
  if (error) throw error;
  return (data || []).map((r) => (SHAPES.coach_cal_items ? SHAPES.coach_cal_items(r) : r)).filter(Boolean);
}

/**
 * Brings the device's copy up to date. Before 049: nothing to do. With it:
 * the tables' rows replace everything the device has marked as sent, what
 * the device still holds unsent is kept and sent, parents first.
 * Resolves true (loaded), false (049 not there yet) or null (offline), once
 * the FIRST reads are in; the LATER ones follow quietly (loadCoachLater).
 */
export function loadCoach(userId) {
  if (!userId) return Promise.resolve(null);
  if (loading.has(userId)) return loading.get(userId);
  const gen = generation;
  const run = (async () => {
    const there = await coachReady();
    if (there !== true) return there;
    const dayThere = (await coachDayReady()) === true;
    const calThere = dayThere && (await coachCalReady()) === true;
    const crmThere = calThere && (await coachCrmReady()) === true;
    const nowMs = Date.now();
    const first = plans(tablesThere(dayThere, calThere, crmThere), nowMs, 'first');
    let db;
    try {
      // The device's own copy is read meanwhile, so what the database doesn't send now (the older weeks) is kept.
      [db] = await Promise.all([fetchPlans(first), hydrate(userId)]);
    } catch {
      return null;
    }
    if (gen !== generation) return null;
    const waiting = waitingToSend(userId) > 0;
    write(userId, mergeLoaded(read(userId), db));
    if (calThere) calLoaded.set(userId, [...(calLoaded.get(userId) || []), [nowMs - CAL_BACK_DAYS * DAY_MS, nowMs + CAL_AHEAD_DAYS * DAY_MS]]);
    if (!waiting) await moveAcross(userId);
    loadCoachLater(userId);
    return true;
  })().finally(() => { loading.delete(userId); });
  loading.set(userId, run);
  return run;
}

const movers = new Set();
/**
 * Registers something to move across before the store's own rows are sent
 * (networkData.js: Network's people, which leads and to-dos point at).
 */
export function beforeMoveAcross(fn) {
  movers.add(fn);
  return () => { movers.delete(fn); };
}

// What waited on the device from before 049 (or from a save that never
// landed) is sent once, parents before their parts. A refused row stays.
async function moveAcross(userId) {
  // What these rows may point at but the store doesn't hold (Network's people) goes first.
  for (const fn of movers) {
    try { await fn(userId); } catch { /* it tries again on the next load */ }
  }
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
      // Part sent, and 052 still isn't there: nothing new to send.
      if (m.part && crmReadyNow !== true) continue;
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
  generation += 1;
  loading.clear();
  calAsking.clear();
  cache.clear();
  rawSeen.clear();
  big.clear();
  hydrating.clear();
  persisted.clear();
  calLoaded.clear();
  laterDone.clear();
  readyNow = null;
  dayReadyNow = null;
  calReadyNow = null;
  crmReadyNow = null;
}
