import { supabase } from './supabase';
import { getLocalDateKey, parseDbTimestamp } from './dateFormatter';
import {
  STANDARD_AREAS, CHART_STYLES, DEFAULT_CHART_STYLE, FOCUS_NOTE_MAX, NOTE_MAX,
  areaFromRow, areaName, sortAreas, isDuplicateName, validateOwnName,
  makeOwnKey, nextOwnSortOrder,
} from './wheelOfLife';

// Wheel of Life data layer (wheel-of-life-spec.md sections 2, 3 and 4).
// Uses the portal's own Supabase client as the signed-in person; row
// level security keeps every row to its owner. Every function returns
// { data, error } and never throws to a page: error is null, or
// { code, message } with a short message the page can show as it is.
// No alert, confirm or prompt.

const AREA_COLUMNS = 'area_key, kind, label, active, sort_order, target, target_updated_at, created_at';
const CHECKIN_COLUMNS = 'id, checkin_at, checkin_date, scores, areas, focus_area_key, focus_note';

const MSG = {
  signedOut: 'Please sign in again to use your Wheel of Life.',
  load: "We couldn't load your Wheel of Life. Check your connection and try again.",
  change: "That change hasn't saved. Check your connection and try again.",
  checkin: "Your check-in hasn't saved yet. Check your connection and try again.",
  delete: "That check-in hasn't been deleted. Check your connection and try again.",
  targets: "Your targets haven't saved yet. Check your connection and try again.",
  lastArea: 'Keep at least one area on your wheel.',
};

function fail(code, message, cause) {
  if (cause) console.error(`Wheel of Life (${code}):`, cause);
  return { data: null, error: { code, message } };
}

function ok(data) {
  return { data, error: null };
}

async function currentUserId() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data?.session?.user?.id || null;
}

// Runs fn(userId) with the signed-in person, turning anything thrown into
// a friendly { data: null, error }.
async function asUser(failMessage, fn) {
  let userId;
  try {
    userId = await currentUserId();
  } catch (e) {
    return fail('network', failMessage, e);
  }
  if (!userId) return fail('signed_out', MSG.signedOut);
  try {
    return await fn(userId);
  } catch (e) {
    return fail('network', failMessage, e);
  }
}

function standardRows(userId) {
  return STANDARD_AREAS.map((a, i) => ({ user_id: userId, area_key: a.key, kind: 'standard', sort_order: i }));
}

async function fetchAreas(userId) {
  const { data, error } = await supabase
    .from('wheel_of_life_areas')
    .select(AREA_COLUMNS)
    .eq('user_id', userId);
  if (error) throw error;
  return sortAreas((data || []).map(areaFromRow));
}

// insert ... on conflict (user_id, area_key) do nothing - seeding twice is harmless.
async function seedStandard(userId) {
  const { error } = await supabase
    .from('wheel_of_life_areas')
    .upsert(standardRows(userId), { onConflict: 'user_id,area_key', ignoreDuplicates: true });
  if (error) throw error;
}

function splitAreas(all) {
  return { all, active: all.filter((a) => a.active), removed: all.filter((a) => !a.active) };
}

/**
 * Loads the person's areas, seeding the ten standard rows the first time
 * (when they have none).
 * @returns {Promise<{ data: { all: object[], active: object[], removed: object[] }|null, error: { code: string, message: string }|null }>}
 *   areas in wheel order (see wheelOfLife.js areaFromRow for the shape)
 */
export async function loadAreas() {
  return asUser(MSG.load, async (userId) => {
    let all = await fetchAreas(userId);
    if (!all.length) {
      await seedStandard(userId);
      all = await fetchAreas(userId);
    }
    return ok(splitAreas(all));
  });
}

/**
 * Adds one of the person's own areas (spec 1.2). A name matching an active
 * area is refused; a name matching a REMOVED own area restores that area
 * instead, so its history is kept.
 * @param {string} label - the typed name (trimmed here; 1 to 24 characters)
 * @returns {Promise<{ data: { result: 'added'|'restored', area: object, message: string, areas: object }|null, error: { code: 'invalid'|'duplicate'|'network'|'signed_out', message: string }|null }>}
 *   data.message is the toast ("Travel added to your wheel." or
 *   "Travel is back on your wheel."); data.areas is the fresh area list
 */
export async function addOwnArea(label) {
  const name = (label || '').trim();
  const invalid = validateOwnName(name);
  if (invalid) return fail('invalid', invalid);
  return asUser(MSG.change, async (userId) => {
    const all = await fetchAreas(userId);
    const dup = isDuplicateName(name, all);
    if (dup.duplicate) return fail('duplicate', dup.message);
    if (dup.restore) {
      const { data, error } = await supabase
        .from('wheel_of_life_areas')
        .update({ active: true })
        .eq('user_id', userId)
        .eq('area_key', dup.restore.key)
        .select(AREA_COLUMNS);
      if (error) throw error;
      if (!data || !data.length) return fail('network', MSG.change);
      const area = areaFromRow(data[0]);
      return ok({ result: 'restored', area, message: dup.message, areas: splitAreas(await fetchAreas(userId)) });
    }
    const { data, error } = await supabase
      .from('wheel_of_life_areas')
      .insert({ user_id: userId, area_key: makeOwnKey(), kind: 'own', label: name, sort_order: nextOwnSortOrder(all) })
      .select(AREA_COLUMNS);
    if (error) throw error;
    if (!data || !data.length) return fail('network', MSG.change);
    const area = areaFromRow(data[0]);
    return ok({ result: 'added', area, message: `${name} added to your wheel.`, areas: splitAreas(await fetchAreas(userId)) });
  });
}

/**
 * Removes an area from the wheel (active false) or restores it (active
 * true). Never deletes. Refuses to remove the last active area.
 * @param {string} areaKey
 * @param {boolean} active
 * @returns {Promise<{ data: { area: object, areas: object }|null, error: { code: 'last_area'|'not_found'|'network'|'signed_out', message: string }|null }>}
 */
export async function setAreaActive(areaKey, active) {
  return asUser(MSG.change, async (userId) => {
    const all = await fetchAreas(userId);
    const target = all.find((a) => a.key === areaKey);
    if (!target) return fail('not_found', MSG.change);
    if (!active && target.active && all.filter((a) => a.active).length <= 1) {
      return fail('last_area', MSG.lastArea);
    }
    const { data, error } = await supabase
      .from('wheel_of_life_areas')
      .update({ active: !!active })
      .eq('user_id', userId)
      .eq('area_key', areaKey)
      .select(AREA_COLUMNS);
    if (error) throw error;
    if (!data || !data.length) return fail('not_found', MSG.change);
    return ok({ area: areaFromRow(data[0]), areas: splitAreas(await fetchAreas(userId)) });
  });
}

/**
 * "Go back to the ten standard areas": all ten standard areas on, every
 * own area off (kept, with its history). Standard areas are switched on
 * first, so the wheel is never left empty if the second step fails.
 * @returns {Promise<{ data: { areas: object, message: string }|null, error: object|null }>}
 *   data.message is the toast "Back to the ten standard areas."
 */
export async function resetToStandard() {
  return asUser(MSG.change, async (userId) => {
    await seedStandard(userId);
    const on = await supabase
      .from('wheel_of_life_areas')
      .update({ active: true })
      .eq('user_id', userId)
      .eq('kind', 'standard')
      .eq('active', false);
    if (on.error) throw on.error;
    const off = await supabase
      .from('wheel_of_life_areas')
      .update({ active: false })
      .eq('user_id', userId)
      .eq('kind', 'own')
      .eq('active', true);
    if (off.error) throw off.error;
    return ok({ areas: splitAreas(await fetchAreas(userId)), message: 'Back to the ten standard areas.' });
  });
}

function checkinFromRow(row) {
  return {
    id: row.id,
    checkinAt: parseDbTimestamp(row.checkin_at),
    date: row.checkin_date,
    scores: row.scores || {},
    areas: Array.isArray(row.areas) ? row.areas : [],
    focusAreaKey: row.focus_area_key || null,
    focusNote: row.focus_note || '',
  };
}

/**
 * Every saved check-in, newest first. Notes are not loaded: they are not
 * shown anywhere in the first release.
 * @param {{ summaryOnly?: boolean }} [options] - summaryOnly loads just the
 *   id and dates (My Reviews); scores, areas and focus come back empty
 * @returns {Promise<{ data: Array<{ id: string, checkinAt: Date, date: string, scores: object, areas: Array<{ key: string, label: string }>, focusAreaKey: string|null, focusNote: string }>|null, error: object|null }>}
 */
export async function listCheckins({ summaryOnly = false } = {}) {
  return asUser(MSG.load, async (userId) => {
    const { data, error } = await supabase
      .from('wheel_of_life_checkins')
      .select(summaryOnly ? 'id, checkin_at, checkin_date' : CHECKIN_COLUMNS)
      .eq('user_id', userId)
      .order('checkin_at', { ascending: false });
    if (error) throw error;
    return ok((data || []).map(checkinFromRow));
  });
}

/**
 * Saves a finished check-in as one row. Scores must cover every area given,
 * each a whole number from 0 to 10. Notes are trimmed and only kept for
 * areas with one; the focus is kept only if it is one of the areas.
 * @param {{
 *   scores: Object<string, number>,
 *   areas: object[],          // the active areas, in wheel order
 *   notes?: Object<string, string>,
 *   focusAreaKey?: string|null,
 *   focusNote?: string,
 *   checkinDate?: string      // 'YYYY-MM-DD', defaults to the device's local date
 * }} input
 * @returns {Promise<{ data: object|null, error: { code: 'invalid'|'network'|'signed_out', message: string }|null }>}
 *   data is the saved check-in, in the listCheckins shape
 */
export async function createCheckin({ scores, areas, notes, focusAreaKey, focusNote, checkinDate } = {}) {
  const list = Array.isArray(areas) ? areas : [];
  const outScores = {};
  for (const a of list) {
    const v = scores ? scores[a.key] : undefined;
    if (!Number.isInteger(v) || v < 0 || v > 10) {
      return fail('invalid', `Choose a score for ${areaName(a)} first.`);
    }
    outScores[a.key] = v;
  }
  if (!list.length) return fail('invalid', 'Your wheel needs at least one area.');
  const outNotes = {};
  for (const a of list) {
    const n = notes && typeof notes[a.key] === 'string' ? notes[a.key].trim() : '';
    if (n.length > NOTE_MAX) return fail('invalid', `Keep each note to ${NOTE_MAX} characters or fewer.`);
    if (n) outNotes[a.key] = n;
  }
  const fn = typeof focusNote === 'string' ? focusNote.trim() : '';
  if (fn.length > FOCUS_NOTE_MAX) return fail('invalid', `Keep this to ${FOCUS_NOTE_MAX} characters or fewer.`);
  const focusKey = focusAreaKey && Object.prototype.hasOwnProperty.call(outScores, focusAreaKey) ? focusAreaKey : null;

  return asUser(MSG.checkin, async (userId) => {
    const { data, error } = await supabase
      .from('wheel_of_life_checkins')
      .insert({
        user_id: userId,
        checkin_date: checkinDate || getLocalDateKey(),
        scores: outScores,
        areas: list.map((a) => ({ key: a.key, label: areaName(a) })),
        notes: outNotes,
        focus_area_key: focusKey,
        focus_note: fn || null,
      })
      .select(CHECKIN_COLUMNS);
    if (error) throw error;
    if (!data || !data.length) return fail('network', MSG.checkin);
    return ok(checkinFromRow(data[0]));
  });
}

/**
 * Deletes one check-in (that row only).
 * @param {string} id
 * @returns {Promise<{ data: { id: string }|null, error: { code: 'not_found'|'network'|'signed_out', message: string }|null }>}
 */
export async function deleteCheckin(id) {
  if (!id) return fail('not_found', MSG.delete);
  return asUser(MSG.delete, async (userId) => {
    const { data, error } = await supabase
      .from('wheel_of_life_checkins')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
      .select('id');
    if (error) throw error;
    if (!data || !data.length) return fail('not_found', MSG.delete);
    return ok({ id });
  });
}

/**
 * Saves the whole Targets screen in one request: a map of area key to a
 * target (whole number 0 to 10) or null to clear it. Only the areas named
 * change. target_updated_at is stamped by the database whenever a target
 * changes.
 * @param {Object<string, number|null>} targets e.g. { career: 8, fun: 5, home: null }
 * @returns {Promise<{ data: { areas: object, message: string }|null, error: { code: 'invalid'|'network'|'signed_out', message: string }|null }>}
 *   data.message is the toast "Targets saved."
 */
export async function setTargets(targets) {
  const entries = Object.entries(targets || {});
  for (const [, t] of entries) {
    if (t !== null && (!Number.isInteger(t) || t < 0 || t > 10)) {
      return fail('invalid', 'Targets are whole numbers from 0 to 10.');
    }
  }
  return asUser(MSG.targets, async (userId) => {
    const all = await fetchAreas(userId);
    const byKey = Object.fromEntries(all.map((a) => [a.key, a]));
    const rows = [];
    for (const [key, t] of entries) {
      const a = byKey[key];
      if (!a) return fail('invalid', MSG.targets);
      // kind and label never change for a key; they are sent only because
      // an upsert needs them, so the update touches target alone.
      rows.push({ user_id: userId, area_key: key, kind: a.kind, label: a.kind === 'own' ? a.label : null, target: t });
    }
    if (rows.length) {
      const { error } = await supabase
        .from('wheel_of_life_areas')
        .upsert(rows, { onConflict: 'user_id,area_key' });
      if (error) throw error;
    }
    return ok({ areas: splitAreas(await fetchAreas(userId)), message: 'Targets saved.' });
  });
}

/**
 * The person's chosen chart style. No row means 'sectional'.
 * @returns {Promise<{ data: 'sectional'|'radar'|'delta'|null, error: object|null }>}
 */
export async function getChartStyle() {
  return asUser(MSG.load, async (userId) => {
    const { data, error } = await supabase
      .from('wheel_of_life_settings')
      .select('chart_style')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    const style = data && CHART_STYLES.includes(data.chart_style) ? data.chart_style : DEFAULT_CHART_STYLE;
    return ok(style);
  });
}

/**
 * Saves the chart style (insert or update).
 * @param {'sectional'|'radar'|'delta'} style
 * @returns {Promise<{ data: string|null, error: object|null }>}
 */
export async function setChartStyle(style) {
  if (!CHART_STYLES.includes(style)) return fail('invalid', MSG.change);
  return asUser(MSG.change, async (userId) => {
    const { error } = await supabase
      .from('wheel_of_life_settings')
      .upsert({ user_id: userId, chart_style: style }, { onConflict: 'user_id' });
    if (error) throw error;
    return ok(style);
  });
}

// ---------------------------------------------------------------- in progress
// The check-in being filled in lives only in this browser until Finish
// check-in (spec 4). Not a draft: nothing reaches the database. Every read
// and write is wrapped, so the pages work without storage. Removed on
// Finish, on Discard, after 7 days, and on log out (clearAppStorage).

/** localStorage key prefix; the full key is clarity.wol.inprogress.<userId>. */
export const IN_PROGRESS_PREFIX = 'clarity.wol.inprogress.';
const IN_PROGRESS_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * The in-progress storage key for a person.
 * @param {string} userId
 * @returns {string}
 */
export function inProgressKey(userId) {
  return `${IN_PROGRESS_PREFIX}${userId}`;
}

/**
 * Reads the in-progress check-in, or null when there is none, it cannot be
 * read, or it was started more than 7 days ago (then it is removed).
 * Run the result through reconcileInProgress (wheelOfLife.js) before use.
 * @param {string} userId
 * @returns {{ startedAt: number, screenIndex: number, scores: object, notes: object, focusAreaKey: string|null, focusNote: string }|null}
 */
export function readInProgress(userId) {
  if (!userId) return null;
  try {
    const raw = window.localStorage.getItem(inProgressKey(userId));
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (!v || typeof v !== 'object' || typeof v.startedAt !== 'number') {
      clearInProgress(userId);
      return null;
    }
    if (Date.now() - v.startedAt > IN_PROGRESS_MAX_AGE_MS) {
      clearInProgress(userId);
      return null;
    }
    return {
      startedAt: v.startedAt,
      screenIndex: Number.isInteger(v.screenIndex) ? v.screenIndex : 0,
      scores: v.scores && typeof v.scores === 'object' ? v.scores : {},
      notes: v.notes && typeof v.notes === 'object' ? v.notes : {},
      focusAreaKey: typeof v.focusAreaKey === 'string' ? v.focusAreaKey : null,
      focusNote: typeof v.focusNote === 'string' ? v.focusNote : '',
    };
  } catch {
    return null;
  }
}

/**
 * Saves the in-progress check-in. startedAt is kept from the first save
 * (pass it back in), or set to now.
 * @param {string} userId
 * @param {{ startedAt?: number, screenIndex: number, scores: object, notes?: object, focusAreaKey?: string|null, focusNote?: string }} state
 * @returns {boolean} false when storage is unavailable (the page carries on)
 */
export function writeInProgress(userId, state) {
  if (!userId || !state) return false;
  try {
    const value = {
      startedAt: typeof state.startedAt === 'number' ? state.startedAt : Date.now(),
      screenIndex: Number.isInteger(state.screenIndex) ? state.screenIndex : 0,
      scores: state.scores || {},
      notes: state.notes || {},
      focusAreaKey: state.focusAreaKey || null,
      focusNote: state.focusNote || '',
    };
    window.localStorage.setItem(inProgressKey(userId), JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/**
 * Removes the in-progress check-in (Finish, Discard, too old).
 * @param {string} userId
 */
export function clearInProgress(userId) {
  if (!userId) return;
  try {
    window.localStorage.removeItem(inProgressKey(userId));
  } catch {
    /* storage blocked */
  }
}
