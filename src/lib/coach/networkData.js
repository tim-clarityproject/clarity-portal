import { useSyncExternalStore } from 'react';
import { supabase } from '../supabase';
import { isNetworkError } from '../connection';
import { deviceKey, readJson, removeKey, writeJson } from '../deviceStore';
import { getLocalDateKey } from '../dateFormatter';
import { newId, saveOrQueue } from '../syncQueue';
import { beforeMoveAcross, coachCrmReady, coachCrmReadyNow } from './store';
import { focusOf, importRow, mergedPerson, networkCounts, networkDuplicates, networkMap, networkPage, RATINGS, withWorkedOut } from './network.js';

// Where Network's people are read and kept (migration 052; Phase 6a run 4).
//
// Network is built for thousands, so its people are NEVER loaded whole into
// the coach portal's context: a page asks this module for ONE PAGE (50 at
// a time), the map's 150, the counts, or one person. Every function here
// answers in the same shape whichever way it is answered:
//
//   - Once Tim has run 052: by the database (network_page(), network_map(),
//     network_counts() and the rest), so search, sort and Show only are done
//     there. A change is sent through the offline queue ("Saved", or "Will
//     sync" while it waits).
//   - Before 052: device first, as the coach store. The people are kept on
//     the device under clarity-coach-network-local:<account> (a Sign out
//     never clears it: it is then the only copy there is) and the same
//     questions are answered by network.js, the database's twin. When 052
//     is there, what waited is moved across once, before the store sends
//     anything that points at a person (a lead's "Referred by").
//
// Network's own COLUMNS (network_columns) are few, so they live in the
// coach store with everything else (useCoachPortal().networkColumns).

const LOCAL = 'coach-network-local';
const BODIES = 'coach-email-bodies-local';
const localKey = (userId) => deviceKey(LOCAL, userId);
const EMPTY = () => ({ people: {}, gives: {}, ratings: [], merges: {} });

/** The columns of network_people a save may carry (focus, due_on and the counts are the database's). */
const PERSON_COLUMNS = ['id', 'coach_id', 'name', 'organisation', 'organisation_id', 'role', 'email', 'phone', 'influence', 'trust',
  'value_delivery', 'what_you_get', 'rhythm_months', 'last_spoke_on', 'snoozed_until', 'added_on', 'own', 'archived_at', 'keep',
  'profile_id', 'notes', 'merged_into'];
const GIVE_COLUMNS = ['id', 'person_id', 'coach_id', 'direction', 'kind', 'note', 'happened_on'];
const pick = (row, columns) => Object.fromEntries(columns.filter((c) => row[c] !== undefined).map((c) => [c, row[c]]));

// ---------------------------------------------------------------- "something changed": pages ask again
let version = 0;
const listeners = new Set();
const changed = () => { version += 1; listeners.forEach((fn) => fn()); };
const subscribe = (fn) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

/**
 * A number that goes up whenever Network changes on this device (a save, an
 * archive, an import, a merge, the move across): a page lists it among an
 * effect's dependencies, so the table, Actions and the map update together.
 */
export function useNetworkVersion() {
  return useSyncExternalStore(subscribe, () => version, () => 0);
}

// ---------------------------------------------------------------- the device's copy (before 052)
const cache = new Map();

/** What the device keeps, read so that nothing kept by another version stops a page. */
export function tidyNetwork(raw) {
  const out = EMPTY();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [k, p] of Object.entries(raw.people && typeof raw.people === 'object' ? raw.people : {})) {
    if (k === '__proto__' || !p || typeof p !== 'object' || Array.isArray(p) || p.id !== k || typeof p.name !== 'string' || !p.name.trim()) continue;
    out.people[k] = { ...p, own: p.own && typeof p.own === 'object' && !Array.isArray(p.own) ? p.own : {} };
  }
  for (const [k, g] of Object.entries(raw.gives && typeof raw.gives === 'object' ? raw.gives : {})) {
    if (k === '__proto__' || !g || typeof g !== 'object' || g.id !== k || !out.people[g.person_id] || !['gave', 'asked'].includes(g.direction)) continue;
    out.gives[k] = g;
  }
  out.ratings = (Array.isArray(raw.ratings) ? raw.ratings : []).filter((r) => r && typeof r === 'object' && out.people[r.person_id]
    && RATINGS.includes(r.rating) && typeof r.rated_on === 'string');
  for (const [k, m] of Object.entries(raw.merges && typeof raw.merges === 'object' ? raw.merges : {})) {
    if (k !== '__proto__' && m && typeof m === 'object' && m.keep && m.drop) out.merges[k] = m;
  }
  return out;
}

function local(userId) {
  if (!cache.has(userId)) cache.set(userId, tidyNetwork(readJson(localKey(userId))));
  return cache.get(userId);
}

function keep(userId, next) {
  cache.set(userId, next);
  const empty = !Object.keys(next.people).length;
  if (empty) removeKey(localKey(userId));
  else if (!writeJson(localKey(userId), next)) {
    // The device has no room: the page is told, so nothing is shown as kept when it isn't.
    throw Object.assign(new Error('This device has no room left to keep that.'), { code: 'NO_ROOM' });
  }
  changed();
}

/** Another tab's change shows here too. */
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    const prefix = `clarity-${LOCAL}:`;
    if (!e.key || !e.key.startsWith(prefix)) return;
    cache.delete(e.key.slice(prefix.length));
    changed();
  });
}

/** The device's people as the database would hand them back (focus, due day and the two counts worked out). */
function localPeople(userId) {
  const state = local(userId);
  const counts = {};
  for (const g of Object.values(state.gives)) {
    const c = (counts[g.person_id] ||= { gave: 0, asked: 0 });
    c[g.direction] += 1;
  }
  return Object.values(state.people).map((p) => ({ ...p, given_count: counts[p.id]?.gave || 0, asked_count: counts[p.id]?.asked || 0 }));
}

/** Is anything of Network's on this device still waiting for 052? */
export const networkWaiting = (userId) => Boolean(userId) && Object.keys(local(userId).people).length > 0;

// ---------------------------------------------------------------- which way to answer
/** Whether 052 is there: true, false (not yet: device first) or null (can't be told: offline). */
export const networkReady = () => coachCrmReady();

const lastAnswers = new Map();
/** What a page is told when Network can't be reached and there is nothing to show: one shape, code OFFLINE. */
const offlineError = () => Object.assign(new Error('Network needs a connection.'), { code: 'OFFLINE' });
/**
 * Asks the database. When it can't be reached, hands back the last answer
 * to the same question (marked `stale`), or tells the page so (code
 * OFFLINE) when that question was never answered here.
 */
async function ask(key, fn) {
  try {
    const { data, error } = await fn();
    if (error) throw error;
    lastAnswers.set(key, data);
    return data;
  } catch (error) {
    if (error?.code || !isNetworkError(error)) throw error;
    if (!lastAnswers.has(key)) throw offlineError();
    const last = lastAnswers.get(key);
    return last && typeof last === 'object' && !Array.isArray(last) ? { ...last, stale: true } : last;
  }
}

const SEEN_KEY = 'clarity-coach-crm-seen';
const seen = () => { try { return window.localStorage.getItem(SEEN_KEY) === '1'; } catch { return false; } };
const noteSeen = () => { try { window.localStorage.setItem(SEEN_KEY, '1'); } catch { /* storage blocked */ } };

/**
 * Device first while 052 isn't there; otherwise the database. When it can't
 * be told (no connection) on a device that has already seen 052 and holds
 * nobody, the page is told so (code OFFLINE) and never shown an empty Network.
 */
async function onDevice(userId) {
  const there = await networkReady();
  if (there === true) {
    noteSeen();
    await moveNetworkAcross(userId);
    return networkWaiting(userId);
  }
  if (there === null && seen() && !networkWaiting(userId)) throw offlineError();
  return true;
}

// ---------------------------------------------------------------- reading
/**
 * ONE PAGE of Network (50 at a time): searched by name or organisation,
 * sorted and narrowed, in the database once 052 is there.
 * @param {string} userId the signed-in account
 * @param {{ search?: string, sort?: string, desc?: boolean, only?: object, archived?: boolean, limit?: number, offset?: number, today?: string }} query
 *   see network.js `networkPage` for `sort` and `only`
 * @param {object[]} [columns] your own columns (only needed device first, for `own:<id>` sorts)
 * @returns {Promise<{ total: number, all: number, rows: object[], stale?: boolean }>}
 */
export async function networkPageOf(userId, query = {}, columns = []) {
  const today = query.today || getLocalDateKey();
  if (await onDevice(userId)) return networkPage(localPeople(userId), { ...query, today }, columns);
  const args = { p_search: query.search || null, p_sort: query.sort || 'name', p_desc: query.desc === true, p_only: query.only || {},
    p_archived: query.archived === true, p_limit: query.limit ?? 50, p_offset: query.offset ?? 0, p_today: today };
  return ask(`page:${JSON.stringify(args)}`, () => supabase.rpc('network_page', args));
}

/**
 * The map's people: up to 150 with a spot, focus lists first, then most recently spoken to.
 * @returns {Promise<{ total: number, placed: number, rows: object[] }>}
 */
export async function networkMapOf(userId, { show = 'everyone', limit = 150, today } = {}) {
  if (await onDevice(userId)) return networkMap(localPeople(userId), { show, limit });
  const args = { p_show: show, p_limit: limit, p_today: today || getLocalDateKey() };
  return ask(`map:${JSON.stringify(args)}`, () => supabase.rpc('network_map', args));
}

/**
 * The counts: { active, archived, due (the menu's count), ready (to archive) }.
 * @returns {Promise<{ active: number, archived: number, due: number, ready: number }>}
 */
export async function networkCountsOf(userId, today = getLocalDateKey()) {
  if (await onDevice(userId)) return networkCounts(localPeople(userId), today);
  return ask('counts', () => supabase.rpc('network_counts', { p_today: today }));
}

/**
 * One person with what you've given and asked (newest first) and each rating's dated history.
 * @returns {Promise<{ person: object, gives: object[], ratings: object[] }|null>} null: not there (any more)
 */
export async function networkPerson(userId, id) {
  if (await onDevice(userId)) {
    const state = local(userId);
    const person = localPeople(userId).find((p) => p.id === id);
    if (!person) return null;
    return {
      person: withWorkedOut(person),
      gives: Object.values(state.gives).filter((g) => g.person_id === id).sort((a, b) => String(b.happened_on).localeCompare(String(a.happened_on)) || String(b.created_at || '').localeCompare(String(a.created_at || ''))),
      ratings: state.ratings.filter((r) => r.person_id === id).sort((a, b) => a.rated_on.localeCompare(b.rated_on)),
    };
  }
  return ask(`person:${id}`, async () => {
    const [person, gives, ratings] = await Promise.all([
      supabase.from('network_people').select('*').eq('id', id).maybeSingle(),
      supabase.from('network_gives').select('*').eq('person_id', id).order('happened_on', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('network_ratings').select('*').eq('person_id', id).order('rated_on', { ascending: true }),
    ]);
    const error = person.error || gives.error || ratings.error;
    return { error, data: error || !person.data ? null : { person: person.data, gives: gives.data || [], ratings: ratings.data || [] } };
  });
}

/** People by their ids (a lead's "Referred by", a to-do's person): a few at a time, never everyone. */
export async function networkPeopleByIds(userId, ids) {
  const wanted = [...new Set((ids || []).filter(Boolean))].slice(0, 200);
  if (!wanted.length) return [];
  if (await onDevice(userId)) return localPeople(userId).filter((p) => wanted.includes(p.id)).map(withWorkedOut);
  return ask(`ids:${wanted.join(',')}`, () => supabase.from('network_people').select('*').in('id', wanted));
}

// ---------------------------------------------------------------- writing
const stamp = () => new Date().toISOString();

/**
 * Keeps a person (new or changed). Device first: at once, with each changed
 * rating's dated history. With 052: through the offline queue (the database
 * writes the history itself).
 * @param {string} userId
 * @param {object} row the person: `id` (newId()), `coach_id` and `name` at least; a change may carry only what changed plus `id`
 * @returns {Promise<'saved'|'queued'|'device'>}
 */
export async function saveNetworkPerson(userId, row) {
  if (!userId || !row?.id) throw new Error('A Network person needs an id.');
  if (await onDevice(userId)) {
    const state = local(userId);
    const before = state.people[row.id];
    const now = stamp();
    const next = { added_on: getLocalDateKey(), own: {}, keep: false, ...(before || {}), ...pick(row, PERSON_COLUMNS), created_at: before?.created_at || now, updated_at: now };
    const today = getLocalDateKey();
    let ratings = state.ratings;
    for (const k of RATINGS) {
      const now10 = next[k] ?? null;
      // New: a line for each rating given. Changed: a line for each rating that changed (emptied too).
      if (before ? (before[k] ?? null) === now10 : now10 == null) continue;
      ratings = [...ratings.filter((r) => !(r.person_id === row.id && r.rating === k && r.rated_on === today)), { person_id: row.id, coach_id: next.coach_id, rating: k, rated_on: today, value: next[k] ?? null }];
    }
    keep(userId, { ...state, people: { ...state.people, [row.id]: next }, ratings });
    return 'device';
  }
  // A whole person is added (or put back); a change carries only what changed.
  const values = pick(row, PERSON_COLUMNS);
  const whole = values.name != null && values.coach_id != null;
  const { id, ...rest } = values;
  const answer = await saveOrQueue(userId, whole
    ? { table: 'network_people', kind: 'upsert', values, onConflict: 'id' }
    : { table: 'network_people', kind: 'update', values: rest, match: { id } });
  changed();
  return answer.status;
}

/** Takes a person out altogether (the Undo of "Add someone"). Returns the row removed, or null. */
export async function removeNetworkPerson(userId, id) {
  if (await onDevice(userId)) {
    const state = local(userId);
    const row = state.people[id];
    if (!row) return null;
    const people = { ...state.people };
    delete people[id];
    keep(userId, { ...state, people, gives: Object.fromEntries(Object.entries(state.gives).filter(([, g]) => g.person_id !== id)), ratings: state.ratings.filter((r) => r.person_id !== id) });
    return row;
  }
  const found = await networkPerson(userId, id);
  await saveOrQueue(userId, { table: 'network_people', kind: 'delete', match: { id } });
  changed();
  return found?.person || null;
}

/**
 * Logs what you gave or asked ("Log what you gave", "Log an ask"). Undo is removeNetworkGive().
 * @param {object} give { id, person_id, coach_id, direction: 'gave'|'asked', kind, note, happened_on }
 * @returns {Promise<'saved'|'queued'|'device'>}
 */
export async function saveNetworkGive(userId, give) {
  if (!userId || !give?.id || !give.person_id) throw new Error('A give needs an id and a person.');
  if (await onDevice(userId)) {
    const state = local(userId);
    if (!state.people[give.person_id]) throw Object.assign(new Error('That person isn’t in your Network.'), { code: '23503' });
    const before = state.gives[give.id];
    keep(userId, { ...state, gives: { ...state.gives, [give.id]: { happened_on: getLocalDateKey(), ...(before || {}), ...pick(give, GIVE_COLUMNS), created_at: before?.created_at || stamp() } } });
    return 'device';
  }
  const answer = await saveOrQueue(userId, { table: 'network_gives', kind: 'upsert', values: pick(give, GIVE_COLUMNS), onConflict: 'id' });
  changed();
  return answer.status;
}

/** Takes one give or ask back. */
export async function removeNetworkGive(userId, id) {
  if (await onDevice(userId)) {
    const state = local(userId);
    const gives = { ...state.gives };
    delete gives[id];
    keep(userId, { ...state, gives });
    return 'device';
  }
  const answer = await saveOrQueue(userId, { table: 'network_gives', kind: 'delete', match: { id } });
  changed();
  return answer.status;
}

/**
 * "Archive 33": the ticked people are archived; anyone unticked (`keepIds`)
 * is kept and never suggested again. Undo: restoreNetwork(ids, keepIds).
 * @returns {Promise<number>} how many were archived
 */
export async function archiveNetwork(userId, ids, keepIds = []) {
  if (await onDevice(userId)) {
    const state = local(userId);
    const people = { ...state.people };
    const now = stamp();
    let n = 0;
    for (const id of keepIds) if (people[id]) people[id] = { ...people[id], keep: true };
    for (const id of ids) if (people[id] && !people[id].archived_at && !people[id].merged_into) { people[id] = { ...people[id], archived_at: now, updated_at: now }; n += 1; }
    keep(userId, { ...state, people });
    return n;
  }
  const { data, error } = await supabase.rpc('network_archive', { p_ids: ids, p_keep: keepIds });
  if (error) throw error;
  changed();
  return data;
}

/** Restore (and the Undo of an archive: `unkeepIds` takes back the "keep" the same archive set). */
export async function restoreNetwork(userId, ids, unkeepIds = []) {
  if (await onDevice(userId)) {
    const state = local(userId);
    const people = { ...state.people };
    let n = 0;
    for (const id of unkeepIds) if (people[id]) people[id] = { ...people[id], keep: false };
    for (const id of ids) if (people[id]?.archived_at) { people[id] = { ...people[id], archived_at: null, updated_at: stamp() }; n += 1; }
    keep(userId, { ...state, people });
    return n;
  }
  const { data, error } = await supabase.rpc('network_restore', { p_ids: ids, p_unkeep: unkeepIds });
  if (error) throw error;
  changed();
  return data;
}

/** Import, step 1: the rows that may already be in Network (duplicates show first). */
export async function networkDuplicatesOf(userId, rows) {
  const asked = (rows || []).map((r) => ({ name: r?.name ?? null, email: r?.email ?? null }));
  if (await onDevice(userId)) return networkDuplicates(localPeople(userId), asked);
  const { data, error } = await supabase.rpc('network_duplicates', { p_rows: asked });
  if (error) throw error;
  return data || [];
}

/**
 * Import, step 2: adds everyone in one go (up to 5,000). Each row is read
 * by network.js `importRow` (a missing or impossible rating is left empty).
 * @param {string} userId
 * @param {string} coachId the owner's coach row
 * @param {object[]} rows
 * @returns {Promise<{ added: number, ids: string[] }>} `ids`: who was added, for Undo (removeNetworkPeople)
 */
export async function importNetwork(userId, coachId, rows) {
  const clean = (rows || []).map(importRow).filter(Boolean).slice(0, 5000).map((r) => ({ ...r, id: r.id || newId() }));
  if (!clean.length) return { added: 0, ids: [] };
  if (await onDevice(userId)) {
    const state = local(userId);
    const people = { ...state.people };
    const now = stamp();
    const today = getLocalDateKey();
    const ratings = [...state.ratings];
    const ids = [];
    for (const r of clean) {
      if (people[r.id]) continue;
      people[r.id] = { coach_id: coachId, added_on: today, keep: false, ...r, created_at: now, updated_at: now };
      for (const k of RATINGS) if (r[k] != null) ratings.push({ person_id: r.id, coach_id: coachId, rating: k, rated_on: today, value: r[k] });
      ids.push(r.id);
    }
    keep(userId, { ...state, people, ratings });
    return { added: ids.length, ids };
  }
  const { data, error } = await supabase.rpc('network_import', { p_rows: clean });
  if (error) throw error;
  changed();
  return { added: data?.added ?? 0, ids: clean.map((r) => r.id) };
}

/** Takes several people out altogether (the Undo of an import). */
export async function removeNetworkPeople(userId, ids) {
  if (await onDevice(userId)) {
    const state = local(userId);
    const gone = new Set(ids);
    keep(userId, { ...state, people: Object.fromEntries(Object.entries(state.people).filter(([k]) => !gone.has(k))),
      gives: Object.fromEntries(Object.entries(state.gives).filter(([, g]) => !gone.has(g.person_id))), ratings: state.ratings.filter((r) => !gone.has(r.person_id)) });
    return ids.length;
  }
  for (let i = 0; i < ids.length; i += 200) {
    const { error } = await supabase.from('network_people').delete().in('id', ids.slice(i, i + 200));
    if (error) throw error;
  }
  changed();
  return ids.length;
}

/**
 * Merges two people into one. `values` names the fields to keep from the
 * one merged away. Returns the merge's id: unmergeNetwork(id) is its Undo.
 */
export async function mergeNetwork(userId, keepId, dropId, values = {}) {
  if (await onDevice(userId)) {
    const state = local(userId);
    const k = state.people[keepId];
    const d = state.people[dropId];
    if (keepId === dropId) throw Object.assign(new Error('Choose two different people to merge.'), { code: '22023' });
    if (!k || !d) throw Object.assign(new Error('Both people must be in your Network.'), { code: '42501' });
    if (k.merged_into || d.merged_into) throw Object.assign(new Error('One of these has already been merged.'), { code: '22023' });
    const id = newId();
    const moved = Object.values(state.gives).filter((g) => g.person_id === dropId).map((g) => g.id);
    const gives = Object.fromEntries(Object.entries(state.gives).map(([gid, g]) => [gid, g.person_id === dropId ? { ...g, person_id: keepId } : g]));
    keep(userId, { ...state, gives, merges: { ...state.merges, [id]: { keep: k, drop: d, gives: moved } },
      people: { ...state.people, [keepId]: { ...mergedPerson(k, d, values), updated_at: stamp() }, [dropId]: { ...d, merged_into: keepId } } });
    return id;
  }
  const { data, error } = await supabase.rpc('network_merge', { p_keep: keepId, p_drop: dropId, p_values: values });
  if (error) throw error;
  changed();
  return data;
}

/** The Undo of a merge: both people are put back exactly as they were. */
export async function unmergeNetwork(userId, mergeId) {
  if (await onDevice(userId)) {
    const state = local(userId);
    const m = state.merges[mergeId];
    if (!m) throw Object.assign(new Error('That merge can’t be undone any more.'), { code: '22023' });
    const merges = { ...state.merges };
    delete merges[mergeId];
    const back = new Set(m.gives || []);
    keep(userId, { ...state, merges, people: { ...state.people, [m.keep.id]: m.keep, [m.drop.id]: m.drop },
      gives: Object.fromEntries(Object.entries(state.gives).map(([gid, g]) => [gid, back.has(gid) ? { ...g, person_id: m.drop.id } : g])) });
    return;
  }
  const { error } = await supabase.rpc('network_unmerge', { p_merge: mergeId });
  if (error) throw error;
  changed();
}

// ---------------------------------------------------------------- moving across, once 052 is there
const moving = new Map();

/**
 * What waited on the device from before 052 is sent once: people first (500
 * at a time), then what was given and asked, then the ratings' history. The
 * device's copy is forgotten only when all of it has landed; a refusal
 * leaves it where it is, to try again on the next load.
 */
export function moveNetworkAcross(userId) {
  if (!userId || coachCrmReadyNow() !== true || !networkWaiting(userId)) return Promise.resolve(false);
  if (moving.has(userId)) return moving.get(userId);
  const run = (async () => {
    const state = local(userId);
    const people = Object.values(state.people).sort((a, b) => Number(Boolean(a.merged_into)) - Number(Boolean(b.merged_into)));
    for (let i = 0; i < people.length; i += 500) {
      const { error } = await supabase.from('network_people').upsert(people.slice(i, i + 500).map((p) => pick(p, PERSON_COLUMNS)), { onConflict: 'id' });
      if (error) return false;
    }
    const gives = Object.values(state.gives);
    for (let i = 0; i < gives.length; i += 500) {
      const { error } = await supabase.from('network_gives').upsert(gives.slice(i, i + 500).map((g) => pick(g, GIVE_COLUMNS)), { onConflict: 'id' });
      if (error) return false;
    }
    for (let i = 0; i < state.ratings.length; i += 500) {
      const { error } = await supabase.from('network_ratings').upsert(state.ratings.slice(i, i + 500).map((r) => pick(r, ['person_id', 'coach_id', 'rating', 'rated_on', 'value'])), { onConflict: 'person_id,rating,rated_on' });
      if (error) return false;
    }
    // Only what was read above is forgotten: anything added meanwhile stays for the next pass.
    const now = local(userId);
    const sent = new Set(people.map((p) => p.id));
    const sentGives = new Set(gives.map((g) => g.id));
    keep(userId, { people: Object.fromEntries(Object.entries(now.people).filter(([k]) => !sent.has(k))),
      gives: Object.fromEntries(Object.entries(now.gives).filter(([k]) => !sentGives.has(k))),
      ratings: now.ratings.filter((r) => !sent.has(r.person_id)), merges: {} });
    return true;
  })().catch(() => false).finally(() => { moving.delete(userId); });
  moving.set(userId, run);
  return run;
}
// The store sends nothing that points at a person until the people have gone.
beforeMoveAcross(moveNetworkAcross);

// ---------------------------------------------------------------- an email's body (read one at a time, never with the list)
const bodiesKey = (userId) => deviceKey(BODIES, userId);

/**
 * An email's full text. With 052 it is read from coach_email_bodies; before
 * that, from what the device kept (the newest 200 bodies).
 * @returns {Promise<string|null>}
 */
export async function emailBody(userId, emailId) {
  const kept = readJson(bodiesKey(userId))?.[emailId]?.body;
  if ((await coachCrmReady()) !== true) return kept ?? null;
  try {
    const data = await ask(`body:${emailId}`, () => supabase.from('coach_email_bodies').select('body').eq('email_id', emailId).maybeSingle());
    return data?.body ?? kept ?? null;
  } catch {
    return kept ?? null;
  }
}

/** Keeps an email's full text (device first before 052; in the database with it). */
export async function saveEmailBody(userId, coachId, emailId, body) {
  const text = String(body ?? '').slice(0, 100000);
  if (!text) return 'device';
  if ((await coachCrmReady()) === true) {
    const answer = await saveOrQueue(userId, { table: 'coach_email_bodies', kind: 'upsert', values: { email_id: emailId, coach_id: coachId, body: text }, onConflict: 'email_id' });
    return answer.status;
  }
  const all = readJson(bodiesKey(userId)) || {};
  all[emailId] = { body: text, at: Date.now() };
  const newest = Object.entries(all).sort((a, b) => (b[1]?.at || 0) - (a[1]?.at || 0)).slice(0, 200);
  writeJson(bodiesKey(userId), Object.fromEntries(newest));
  return 'device';
}

// For tests: forget what this module remembers.
export function resetNetworkDataForTests() {
  cache.clear();
  lastAnswers.clear();
  moving.clear();
  version = 0;
}

export { focusOf };
