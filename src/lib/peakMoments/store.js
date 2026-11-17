import { useEffect, useState, useSyncExternalStore } from 'react';
import { supabase } from '../supabase';
import { saveOrQueue, waitingToSend } from '../syncQueue';
import { isMissingTable, tableReady } from '../performance/tableReady';
import { parseDbTimestamp } from '../dateFormatter';
import { deviceKey, readJson, writeJson } from '../deviceStore';
import { tidyMoment, tidyRepeat } from './model';

// Where peak moments are kept (migration 048: public.peak_moments and
// public.peak_reviews; Phase 8b part A).
//
// Device first, as toolAnswers.js and tableReady.js describe. Every change
// is kept on the device at once, so the page shows it, offline too. Until
// Tim has run 048 that is all, with no error shown. Once the tables are
// there a change is sent through the offline queue ("Saved", or "Will
// sync" while it waits), whatever waits on the device from before is moved
// across once (moments before their reviews), and a load brings the
// device's copy up to date with the tables, so another device's moments
// show here.
//
// The device copy is clarity-peak-moments-local:<person>, which a Sign out
// never clears (like the Daily plan's habits before 039: clearAppStorage.js),
// because until 048 it is the only copy there is. It carries the person's
// id, so nobody else signing in here is shown it.
//
//   { moments: { [id]: moment }, reviews: { ['id:YYYY-MM-DD']: review },
//     leadUps: { ['id:YYYY-MM-DD']: { [day]: { text, todoId, did } } },
//     shareWork: boolean }
// A moment or review may carry `sent: true` (the table has it) and `gone:
// true` (deleted here, its delete still to be sent).
//
// The lead-up answers (what the Daily plan's question was answered with,
// and Daily review's "Did you do it?") have no table of their own: each one
// is also a to-do (todos.source 'peak_moment' once 048 is there, its
// source_id the moment), so the sprint, Home and the score see it. The
// device's note of them only lets the review after show them at its end.

export const MOMENTS_TABLE = 'peak_moments';
export const REVIEWS_TABLE = 'peak_reviews';
const NEVER = new Set(['42501', '23503', '23514']);
const NOT_YET_KEY = 'clarity-peak-moments-not-yet';
const NOT_YET_MS = 60 * 60 * 1000;

const keyFor = (userId) => deviceKey('peak-moments-local', userId);
const EMPTY = Object.freeze({ moments: {}, reviews: {}, leadUps: {}, shareWork: false });

const iso = (v) => {
  if (!v) return null;
  const d = parseDbTimestamp(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

/** What the device keeps, read so that nothing kept by another version stops a page. */
export function tidyState(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...EMPTY };
  const moments = {};
  for (const [id, m] of Object.entries(raw.moments || {})) {
    const t = tidyMoment(m);
    if (t && t.id === id && t.startsOn) moments[id] = { ...t, sent: m.sent === true, gone: m.gone === true };
  }
  const reviews = {};
  for (const [k, r] of Object.entries(raw.reviews || {})) {
    if (!r || typeof r !== 'object' || typeof r.momentId !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.occursOn || '')) continue;
    reviews[k] = {
      id: typeof r.id === 'string' ? r.id : null,
      momentId: r.momentId,
      occursOn: r.occursOn,
      answer: typeof r.answer === 'string' ? r.answer : '',
      kept: typeof r.kept === 'string' ? r.kept : '',
      lesson: typeof r.lesson === 'string' ? r.lesson : '',
      updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : null,
      sent: r.sent === true,
      gone: r.gone === true,
    };
  }
  const leadUps = raw.leadUps && typeof raw.leadUps === 'object' && !Array.isArray(raw.leadUps) ? raw.leadUps : {};
  return { moments, reviews, leadUps, shareWork: raw.shareWork === true };
}

// ---------------------------------------------------------------- the device copy, shared by every part of the page

const listeners = new Set();
const cache = new Map();

function read(userId) {
  if (!userId) return EMPTY;
  if (!cache.has(userId)) cache.set(userId, tidyState(readJson(keyFor(userId))));
  return cache.get(userId);
}

function write(userId, next) {
  cache.set(userId, next);
  const ok = writeJson(keyFor(userId), next);
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
    if (!e.key || !e.key.startsWith('clarity-peak-moments-local:')) return;
    const userId = e.key.slice('clarity-peak-moments-local:'.length);
    cache.set(userId, tidyState(readJson(e.key)));
    listeners.forEach((fn) => fn());
  });
}

/** Everything kept for the person, deleted items left out: { moments: [..], reviews, leadUps, shareWork }. */
export function peakState(userId) {
  const s = read(userId);
  return s;
}

export function visibleMoments(state) {
  return Object.values(state.moments).filter((m) => !m.gone);
}

export function visibleReviews(state) {
  return Object.fromEntries(Object.entries(state.reviews).filter(([, r]) => !r.gone));
}

// ---------------------------------------------------------------- whether 048 is there

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
 * Whether 048's tables are there: true, false (not yet), or null when it
 * can't be told (offline). "Not yet" is remembered for an hour, so the
 * browser's console shows one 404 an hour, not one a page.
 */
export async function peakReady() {
  if (notYet()) return false;
  if (!asking) {
    asking = (async () => {
      try {
        const there = await tableReady(MOMENTS_TABLE);
        if (there === false) noteNotYet(true);
        if (there === true) noteNotYet(false);
        return there;
      } catch {
        return null;
      }
    })().finally(() => { asking = null; });
  }
  return asking;
}

/**
 * The to-do source for a lead-up answer: 'peak_moment' once 048 has widened
 * todos.source, 'other_tool' before (with the moment as its source_id either way).
 */
export async function peakTodoSource() {
  try {
    return (await peakReady()) === true ? 'peak_moment' : 'other_tool';
  } catch {
    return 'other_tool';
  }
}

// ---------------------------------------------------------------- rows

function momentRow(userId, m) {
  return {
    id: m.id,
    user_id: userId,
    name: m.name.trim().slice(0, 80),
    area: m.area,
    kind: m.kind,
    starts_on: m.startsOn,
    ends_on: m.endsOn || m.startsOn,
    place_city: m.placeCity || null,
    place_zone: m.placeCity ? m.placeZone : null,
    repeat_rule: m.repeat ? tidyRepeat(m.repeat) : null,
    lesson: m.lesson?.trim() ? m.lesson.trim().slice(0, 600) : null,
    shared: m.area === 'work' && m.shared === true,
  };
}

function momentFrom(row) {
  return tidyMoment({
    id: row.id,
    name: row.name,
    area: row.area,
    kind: row.kind,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    placeCity: row.place_city,
    placeZone: row.place_zone,
    repeat: row.repeat_rule,
    lesson: row.lesson || '',
    shared: row.shared,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  });
}

function reviewRow(userId, r) {
  return {
    ...(r.id ? { id: r.id } : {}),
    user_id: userId,
    moment_id: r.momentId,
    occurs_on: r.occursOn,
    answer: r.answer,
    kept: r.kept?.trim() ? r.kept.trim().slice(0, 600) : null,
    lesson: r.lesson?.trim() ? r.lesson.trim().slice(0, 600) : null,
  };
}

function reviewFrom(row) {
  return {
    id: row.id,
    momentId: row.moment_id,
    occursOn: row.occurs_on,
    answer: row.answer || '',
    kept: row.kept || '',
    lesson: row.lesson || '',
    updatedAt: iso(row.updated_at),
    sent: true,
  };
}

// ---------------------------------------------------------------- sending

async function sendMoment(userId, m) {
  const op = m.gone
    ? { table: MOMENTS_TABLE, kind: 'delete', match: { id: m.id, user_id: userId } }
    : { table: MOMENTS_TABLE, kind: 'upsert', onConflict: 'id', values: momentRow(userId, m) };
  const r = await saveOrQueue(userId, op);
  // Marked as sent only when nothing newer was kept meanwhile.
  const s = read(userId);
  const now = s.moments[m.id];
  if (now && now.updatedAt === m.updatedAt) {
    const moments = { ...s.moments };
    if (now.gone) delete moments[m.id];
    else moments[m.id] = { ...now, sent: true };
    write(userId, { ...s, moments });
  }
  return r?.status === 'queued' ? 'queued' : 'saved';
}

async function sendReview(userId, key, r) {
  if (!r.answer && !r.gone) return 'saved';
  const op = r.gone
    ? { table: REVIEWS_TABLE, kind: 'delete', match: { moment_id: r.momentId, occurs_on: r.occursOn, user_id: userId } }
    : { table: REVIEWS_TABLE, kind: 'upsert', onConflict: 'moment_id,occurs_on', values: reviewRow(userId, r) };
  const res = await saveOrQueue(userId, op);
  const s = read(userId);
  const now = s.reviews[key];
  if (now && now.updatedAt === r.updatedAt) {
    const reviews = { ...s.reviews };
    if (now.gone) delete reviews[key];
    else reviews[key] = { ...now, sent: true };
    write(userId, { ...s, reviews });
  }
  return res?.status === 'queued' ? 'queued' : 'saved';
}

async function quietly(fn) {
  try {
    return await fn();
  } catch (error) {
    if (isMissingTable(error)) return 'device';
    throw error;
  }
}

// ---------------------------------------------------------------- what pages call

/**
 * Save one moment: on the device at once, then sent when 048 is there.
 * @returns {Promise<'saved'|'queued'|'device'>}
 */
export async function saveMoment(userId, moment) {
  if (!userId || !moment?.id) return 'device';
  const now = new Date().toISOString();
  const s = read(userId);
  const had = s.moments[moment.id];
  const m = { ...tidyMoment(moment), createdAt: had?.createdAt || moment.createdAt || now, updatedAt: now, sent: false, gone: false };
  delete m.today;
  if (!write(userId, { ...s, moments: { ...s.moments, [m.id]: m } })) throw new Error('The device has no room to keep this.');
  if (!(await peakReady())) return 'device';
  return quietly(() => sendMoment(userId, m));
}

/** Delete one moment (its Undo saves it again with saveMoment). */
export async function deleteMoment(userId, id) {
  const s = read(userId);
  const had = s.moments[id];
  if (!had) return 'device';
  const now = new Date().toISOString();
  const there = await peakReady();
  // Never sent and the table can't be told: there is nothing to take away there.
  if (there === false || (!there && !had.sent)) {
    const moments = { ...s.moments };
    delete moments[id];
    write(userId, { ...read(userId), moments });
    return 'device';
  }
  const gone = { ...had, gone: true, updatedAt: now };
  const cur = read(userId);
  write(userId, { ...cur, moments: { ...cur.moments, [id]: gone } });
  return quietly(() => sendMoment(userId, gone));
}

/** Save the review after one time a moment came round, and its lesson on the moment for the next time. */
export async function saveReview(userId, review) {
  if (!userId || !review?.momentId || !review.occursOn) return 'device';
  const key = `${review.momentId}:${review.occursOn}`;
  const now = new Date().toISOString();
  const s = read(userId);
  const had = s.reviews[key];
  const r = { ...had, ...review, id: had?.id || review.id || null, updatedAt: now, sent: false, gone: false };
  let moments = s.moments;
  const m = s.moments[review.momentId];
  // The lesson is saved for the next peak moment (M18): the moment keeps the newest one.
  const lesson = review.lesson?.trim();
  const withLesson = m && lesson && lesson !== m.lesson ? { ...m, lesson, updatedAt: now, sent: false } : null;
  if (withLesson) moments = { ...moments, [m.id]: withLesson };
  write(userId, { ...s, moments, reviews: { ...s.reviews, [key]: r } });
  if (!(await peakReady())) return 'device';
  return quietly(async () => {
    if (withLesson) await sendMoment(userId, withLesson);
    else if (m && !m.sent) await sendMoment(userId, m);
    return sendReview(userId, key, r);
  });
}

/** The page's eye: whether work moments are shared with the coach. Personal ones never are. */
export async function setShareWork(userId, share) {
  const s = read(userId);
  const now = new Date().toISOString();
  const moments = { ...s.moments };
  const changed = [];
  for (const m of Object.values(moments)) {
    if (m.gone || m.area !== 'work' || m.shared === share) continue;
    moments[m.id] = { ...m, shared: share, updatedAt: now, sent: false };
    changed.push(moments[m.id]);
  }
  write(userId, { ...s, moments, shareWork: Boolean(share) });
  if (!changed.length || !(await peakReady())) return 'device';
  let status = 'saved';
  for (const m of changed) {
    if ((await quietly(() => sendMoment(userId, m))) === 'queued') status = 'queued';
  }
  return status;
}

/** Note what a day's lead-up question was answered with (and its to-do). */
export function noteLeadUp(userId, occurrenceKey, day, value) {
  const s = read(userId);
  const forOcc = { ...(s.leadUps[occurrenceKey] || {}) };
  if (value == null) delete forOcc[day];
  else forOcc[day] = { ...(forOcc[day] || {}), ...value };
  write(userId, { ...s, leadUps: { ...s.leadUps, [occurrenceKey]: forOcc } });
}

/** A day's lead-up, or null. */
export function leadUpOn(userId, occurrenceKey, day) {
  return read(userId).leadUps[occurrenceKey]?.[day] || null;
}

/** Every day's lead-up for one time a moment came round, in day order: [{ day, text, todoId, did }]. */
export function leadUpsOf(userId, occurrenceKey) {
  const forOcc = read(userId).leadUps[occurrenceKey] || {};
  return Object.entries(forOcc).sort(([a], [b]) => (a < b ? -1 : 1)).map(([day, v]) => ({ day, ...v }));
}

/** The lead-up (if any) whose to-do is this one, for Daily review's "Did you do it?". */
export function leadUpByDay(userId, day) {
  const s = read(userId);
  for (const [key, days] of Object.entries(s.leadUps)) {
    if (days?.[day]?.todoId) return { key, ...days[day] };
  }
  return null;
}

let moving = null;

/** Once 048 is there: everything still waiting on this device is sent across, moments first. Quiet. */
export function movePeak(userId) {
  if (!userId) return Promise.resolve(0);
  if (moving) return moving;
  moving = (async () => {
    const s = read(userId);
    const moments = Object.values(s.moments).filter((m) => m.sent !== true);
    const reviews = Object.entries(s.reviews).filter(([, r]) => r.sent !== true);
    if ((!moments.length && !reviews.length) || !(await peakReady())) return 0;
    let moved = 0;
    for (const m of moments) {
      try {
        await sendMoment(userId, m);
        moved += 1;
      } catch (error) {
        if (!NEVER.has(`${error?.code || ''}`)) return moved; // offline: tried again next time
        const cur = read(userId);
        if (cur.moments[m.id]) write(userId, { ...cur, moments: { ...cur.moments, [m.id]: { ...cur.moments[m.id], sent: true } } });
      }
    }
    for (const [key, r] of reviews) {
      try {
        await sendReview(userId, key, r);
        moved += 1;
      } catch (error) {
        if (!NEVER.has(`${error?.code || ''}`)) return moved;
        const cur = read(userId);
        if (cur.reviews[key]) write(userId, { ...cur, reviews: { ...cur.reviews, [key]: { ...cur.reviews[key], sent: true } } });
      }
    }
    return moved;
  })().catch(() => 0).finally(() => { moving = null; });
  return moving;
}

/**
 * Bring the device's copy up to date with the tables (after moving across
 * what waits here). Never replaces a change still to be sent. Never throws.
 */
export async function refreshPeak(userId) {
  if (!userId || !(await peakReady())) return false;
  try {
    await movePeak(userId);
    const waitingBefore = waitingToSend(userId);
    const [mRes, rRes] = await Promise.all([
      supabase.from(MOMENTS_TABLE).select('*').eq('user_id', userId),
      supabase.from(REVIEWS_TABLE).select('*').eq('user_id', userId),
    ]);
    if (mRes.error) throw mRes.error;
    if (rRes.error) throw rRes.error;
    if (waitingBefore || waitingToSend(userId)) return false;
    const s = read(userId);
    const moments = { ...s.moments };
    const ids = new Set();
    for (const row of mRes.data || []) {
      const m = momentFrom(row);
      if (!m) continue;
      ids.add(m.id);
      if (!moments[m.id] || moments[m.id].sent === true) moments[m.id] = { ...m, sent: true, gone: false };
    }
    // Sent before and gone from the table: deleted on another device.
    for (const m of Object.values(moments)) if (m.sent === true && !ids.has(m.id)) delete moments[m.id];
    const reviews = { ...s.reviews };
    const keys = new Set();
    for (const row of rRes.data || []) {
      const r = reviewFrom(row);
      const key = `${r.momentId}:${r.occursOn}`;
      keys.add(key);
      if (!reviews[key] || reviews[key].sent === true) reviews[key] = r;
    }
    for (const [key, r] of Object.entries(reviews)) if (r.sent === true && !keys.has(key)) delete reviews[key];
    write(userId, { ...s, moments, reviews });
    return true;
  } catch {
    return false;
  }
}

/**
 * The person's peak moments, kept up to date: the device's copy at once,
 * then the tables' quietly (once 048 is there). Every part of a page that
 * uses it sees the same copy.
 */
export function usePeakMoments(userId) {
  const state = useSyncExternalStore(subscribe, () => read(userId), () => EMPTY);
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    let live = true;
    if (!userId) return undefined;
    refreshPeak(userId).finally(() => { if (live) setChecked(true); });
    return () => { live = false; };
  }, [userId]);
  return {
    state,
    moments: visibleMoments(state),
    reviews: visibleReviews(state),
    shareWork: state.shareWork,
    checked,
  };
}

/** For tests: forget the in-memory copy, so the next read is from storage. */
export function forgetPeakCache() {
  cache.clear();
}
