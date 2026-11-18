import { useEffect, useState, useSyncExternalStore } from 'react';
import { supabase } from '../supabase';
import { saveOrQueue, waitingToSend } from '../syncQueue';
import { isMissingTable, tableReady } from '../performance/tableReady';
import { parseDbTimestamp } from '../dateFormatter';
import { deviceKey, readJson, writeJson } from '../deviceStore';
import { awayOf, planFor, planKey, planTitle, tidyPlan, tidyState } from './model';
import { ownEntry } from '../peakMoments/model';

// Where Travel plans are kept (migration 048: travel_plans, travel_flights,
// travel_plan_moments, travel_ticks and travel_away; Phase 8b part B).
//
// Device first, exactly as Peak moments (src/lib/peakMoments/store.js): every
// change is kept on the device at once, so the page shows it, offline too.
// Until Tim has run 048 that is all, with no error shown. Once the tables
// are there a change is sent through the offline queue ("Saved", or "Will
// sync" while it waits), whatever waits on the device is moved across once,
// and a load brings the device's copy up to date with the tables.
//
// The device copy is clarity-travel-plans-local:<person>, which Sign out
// never clears (it isn't one of deviceStore's prefixes), because until 048
// it is the only copy there is. It carries the person's id.
//
//   { plans: { [id]: plan }, ticks: { [planId]: { [day]: { [step]: true } } } }
//
// A plan's steps are never stored: the engine (src/lib/travel) works them
// out from the flights, the key moments (peak moments: travel_plan_moments
// links them, with the time of day) and usual sleep. A plan edited while
// under way keeps its earlier days on the device (`past`), so they stay as
// they were here; another device works them out again.
//
// A plan is marked as sent only once the database has answered every one of
// its saves. One waiting in the offline queue stays unsent until a load
// finds the tables holding exactly it (planKey); one the database refused
// stays here, unsent, marked `refused`, and isn't sent again until it is
// changed. So a refused plan is never cleared from the device by a load
// (the break-it tester, 18 Nov).
//
// Ticks are private (never read by a coach, and nothing ever says what
// wasn't ticked). The away flag (travel_away: where, when, hours apart) is
// the one thing a coach may read, written whenever a plan is saved.

export const PLANS_TABLE = 'travel_plans';
const NEVER = new Set(['42501', '23503', '23514']);
const NOT_YET_KEY = 'clarity-travel-plans-not-yet';
const NOT_YET_MS = 60 * 60 * 1000;
const PREFIX = 'clarity-travel-plans-local:';

const keyFor = (userId) => deviceKey('travel-plans-local', userId);
const EMPTY = Object.freeze({ plans: {}, ticks: {} });

const iso = (v) => {
  if (!v) return null;
  const d = parseDbTimestamp(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

export { tidyState };

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
    if (!e.key || !e.key.startsWith(PREFIX)) return;
    const userId = e.key.slice(PREFIX.length);
    cache.set(userId, tidyState(readJson(e.key)));
    listeners.forEach((fn) => fn());
  });
}

/** Every plan kept here, deleted ones left out, newest trip first. */
export function visiblePlans(state) {
  return Object.values(state.plans).filter((p) => !p.gone).sort((a, b) => (a.flightOut.leaves < b.flightOut.leaves ? 1 : a.flightOut.leaves > b.flightOut.leaves ? -1 : 0));
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

/** Whether 048's travel tables are there: true, false (not yet, remembered for an hour), or null (can't be told). */
export async function travelReady() {
  if (notYet()) return false;
  if (!asking) {
    asking = (async () => {
      try {
        const there = await tableReady(PLANS_TABLE);
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

// ---------------------------------------------------------------- rows

function flightRow(userId, plan, f, leg, order) {
  return {
    id: f.id,
    user_id: userId,
    plan_id: plan.id,
    leg,
    sort_order: order,
    departs_on: f.leaves.slice(0, 10),
    departs_at: f.leaves.slice(11, 16),
    from_city: f.from.city,
    from_zone: f.from.zone,
    arrives_on: f.lands.slice(0, 10),
    arrives_at: f.lands.slice(11, 16),
    to_city: f.to.city,
    to_zone: f.to.zone,
  };
}

/** Every write for one plan, in the order the tables need them (the plan, then what points at it). */
function planOps(userId, plan, moments) {
  if (plan.gone) return [{ table: PLANS_TABLE, kind: 'delete', match: { id: plan.id, user_id: userId } }];
  const ops = [
    {
      table: PLANS_TABLE,
      kind: 'upsert',
      onConflict: 'id',
      values: { id: plan.id, user_id: userId, title: (plan.title || planTitle(plan)).slice(0, 120), sleep_start: plan.usualSleep.start, sleep_end: plan.usualSleep.end, no_caffeine: plan.noCaffeine },
    },
    { table: 'travel_flights', kind: 'upsert', onConflict: 'id', values: flightRow(userId, plan, plan.flightOut, 'out', 0) },
    { table: 'travel_flights', kind: 'upsert', onConflict: 'id', values: flightRow(userId, plan, plan.flightHome, 'home', 1) },
    // The links are written whole each time: the old ones go first.
    { table: 'travel_plan_moments', kind: 'delete', match: { plan_id: plan.id, user_id: userId } },
    ...plan.momentIds.map((id) => ({ table: 'travel_plan_moments', kind: 'upsert', onConflict: 'plan_id,moment_id', values: { plan_id: plan.id, moment_id: id, user_id: userId, starts_at: ownEntry(plan.momentTimes, id) || null } })),
  ];
  const away = awayOf(plan, planFor(plan, moments));
  if (away) {
    ops.push({ table: 'travel_away', kind: 'upsert', onConflict: 'plan_id', values: { plan_id: plan.id, user_id: userId, city: away.city, zone: away.zone, starts_on: away.startsOn, ends_on: away.endsOn, hours_apart: away.hoursApart } });
  }
  return ops;
}

async function sendPlan(userId, plan, moments) {
  let status = 'saved';
  for (const op of planOps(userId, plan, moments)) {
    const r = await saveOrQueue(userId, op);
    if (r?.status === 'queued') status = 'queued';
  }
  // Marked as sent only once the database has every save, and only when nothing newer was kept meanwhile.
  const s = read(userId);
  const now = s.plans[plan.id];
  if (status === 'saved' && now && now.updatedAt === plan.updatedAt) {
    const plans = { ...s.plans };
    if (now.gone) delete plans[plan.id];
    else plans[plan.id] = { ...now, sent: true };
    write(userId, { ...s, plans });
  }
  return status;
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
 * Save one plan (made, edited, or "I don’t have caffeine"): on the device at
 * once, then sent when 048 is there. `moments` are the person's peak moments
 * (its key moments, for the away flag).
 * @returns {Promise<'saved'|'queued'|'device'>}
 */
export async function savePlan(userId, plan, moments = []) {
  if (!userId || !plan?.id) return 'device';
  const now = new Date().toISOString();
  const s = read(userId);
  const had = s.plans[plan.id];
  const p = { ...tidyPlan(plan), createdAt: had?.createdAt || plan.createdAt || now, updatedAt: now, sent: false, gone: false, refused: false };
  if (!p.title) p.title = planTitle(p);
  if (!write(userId, { ...s, plans: { ...s.plans, [p.id]: p } })) throw new Error('The device has no room to keep this.');
  if (!(await travelReady())) return 'device';
  return quietly(() => sendPlan(userId, p, moments));
}

/** Delete one plan (its Undo saves it again with savePlan). Its ticks go with it. */
export async function deletePlan(userId, id) {
  const s = read(userId);
  const had = ownEntry(s.plans, id);
  if (!had) return 'device';
  const there = await travelReady();
  if (there === false || (!there && !had.sent)) {
    const plans = { ...read(userId).plans };
    delete plans[id];
    write(userId, { ...read(userId), plans });
    return 'device';
  }
  const gone = { ...had, gone: true, updatedAt: new Date().toISOString() };
  const cur = read(userId);
  write(userId, { ...cur, plans: { ...cur.plans, [id]: gone } });
  return quietly(() => sendPlan(userId, gone, []));
}

/** A plan as it was, for Undo after a delete: its ticks come back too. */
export function planSnapshot(userId, id) {
  const s = read(userId);
  const plan = ownEntry(s.plans, id);
  return plan ? { plan, ticks: ownEntry(s.ticks, id) || null } : null;
}

export async function restorePlan(userId, snapshot, moments = []) {
  if (!snapshot?.plan) return 'device';
  if (snapshot.ticks) {
    const s = read(userId);
    write(userId, { ...s, ticks: { ...s.ticks, [snapshot.plan.id]: snapshot.ticks } });
  }
  const r = await savePlan(userId, { ...snapshot.plan, gone: false }, moments);
  for (const [day, steps] of Object.entries(snapshot.ticks || {})) {
    for (const step of Object.keys(steps)) await sendTick(userId, snapshot.plan.id, day, step, true).catch(() => null);
  }
  return r;
}

/** One day's private ticks for a plan: { [step]: true }. */
export function ticksOn(state, planId, day) {
  return ownEntry(ownEntry(state.ticks, planId), day) || {};
}

async function sendTick(userId, planId, day, step, on) {
  if (!(await travelReady())) return 'device';
  return quietly(async () => {
    const op = on
      ? { table: 'travel_ticks', kind: 'upsert', onConflict: 'plan_id,day,step', values: { plan_id: planId, user_id: userId, day, step } }
      : { table: 'travel_ticks', kind: 'delete', match: { plan_id: planId, user_id: userId, day, step } };
    const r = await saveOrQueue(userId, op);
    return r?.status === 'queued' ? 'queued' : 'saved';
  });
}

/** Tick a step on a day, or take the tick off. Private: never read by a coach. */
export async function setTick(userId, planId, day, step, on) {
  if (planId === '__proto__' || day === '__proto__' || step === '__proto__') return 'device';
  const s = read(userId);
  const forPlan = { ...(ownEntry(s.ticks, planId) || {}) };
  const forDay = { ...(forPlan[day] || {}) };
  if (on) forDay[step] = true;
  else delete forDay[step];
  forPlan[day] = forDay;
  write(userId, { ...s, ticks: { ...s.ticks, [planId]: forPlan } });
  return sendTick(userId, planId, day, step, on);
}

let moving = null;

/** Once 048 is there: every plan still waiting on this device is sent across. Quiet. */
export function moveTravel(userId, moments = []) {
  if (!userId) return Promise.resolve(0);
  if (moving) return moving;
  moving = (async () => {
    // Saves already waiting in the queue go first, as the queue sends them.
    if (waitingToSend(userId)) return 0;
    const s = read(userId);
    const waiting = Object.values(s.plans).filter((p) => p.sent !== true && p.refused !== true);
    if (!waiting.length || !(await travelReady())) return 0;
    let moved = 0;
    for (const p of waiting) {
      try {
        await sendPlan(userId, p, moments);
        for (const [day, steps] of Object.entries(s.ticks[p.id] || {})) {
          for (const step of Object.keys(steps)) await sendTick(userId, p.id, day, step, true);
        }
        moved += 1;
      } catch (error) {
        if (!NEVER.has(`${error?.code || ''}`)) return moved; // offline: tried again next time
        // Refused: kept here, unsent, and not sent again until it is changed. Never marked sent.
        const cur = read(userId);
        const had = cur.plans[p.id];
        if (had && had.updatedAt === p.updatedAt) write(userId, { ...cur, plans: { ...cur.plans, [p.id]: { ...had, refused: true } } });
      }
    }
    return moved;
  })().catch(() => 0).finally(() => { moving = null; });
  return moving;
}

const hhmm = (t) => String(t || '').slice(0, 5);

function planFromRows(row, flights, links) {
  const flight = (leg) => {
    const f = flights.find((x) => x.plan_id === row.id && x.leg === leg);
    if (!f) return null;
    return {
      id: f.id,
      from: { key: f.from_zone, code: null, name: f.from_city, city: f.from_city, zone: f.from_zone },
      to: { key: f.to_zone, code: null, name: f.to_city, city: f.to_city, zone: f.to_zone },
      leaves: `${f.departs_on}T${hhmm(f.departs_at)}`,
      lands: `${f.arrives_on}T${hhmm(f.arrives_at)}`,
    };
  };
  const mine = links.filter((l) => l.plan_id === row.id);
  return tidyPlan({
    id: row.id,
    title: row.title,
    flightOut: flight('out'),
    flightHome: flight('home'),
    momentIds: mine.map((l) => l.moment_id),
    momentTimes: Object.fromEntries(mine.filter((l) => l.starts_at).map((l) => [l.moment_id, hhmm(l.starts_at)])),
    usualSleep: { start: hhmm(row.sleep_start), end: hhmm(row.sleep_end) },
    noCaffeine: row.no_caffeine === true,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  });
}

/**
 * Bring the device's copy up to date with the tables (after moving across
 * what waits here). Never replaces a change still to be sent; keeps a plan's
 * earlier days as this device kept them. Never throws.
 */
export async function refreshTravel(userId, moments = []) {
  if (!userId || !(await travelReady())) return false;
  try {
    await moveTravel(userId, moments);
    const waitingBefore = waitingToSend(userId);
    const [pRes, fRes, lRes, tRes] = await Promise.all([
      supabase.from(PLANS_TABLE).select('*').eq('user_id', userId),
      supabase.from('travel_flights').select('*').eq('user_id', userId),
      supabase.from('travel_plan_moments').select('*').eq('user_id', userId),
      supabase.from('travel_ticks').select('plan_id, day, step').eq('user_id', userId),
    ]);
    for (const r of [pRes, fRes, lRes, tRes]) if (r.error) throw r.error;
    if (waitingBefore || waitingToSend(userId)) return false;
    const s = read(userId);
    const plans = { ...s.plans };
    const ids = new Set();
    for (const row of pRes.data || []) {
      const p = planFromRows(row, fRes.data || [], lRes.data || []);
      if (!p || !p.flightOut.from || !p.flightHome.from) continue;
      ids.add(p.id);
      const here = plans[p.id];
      if (!here || here.sent === true) plans[p.id] = { ...p, past: here?.past || null, seen: here?.seen || null, sent: true, gone: false };
      // A save the queue sent later: the tables hold exactly what this device kept.
      else if (!here.gone && planKey(here) === planKey(p)) plans[p.id] = { ...here, sent: true, refused: false };
    }
    // Sent before and gone from the table: deleted on another device. A delete
    // waiting here that the table no longer holds has gone through.
    for (const p of Object.values(plans)) if (!ids.has(p.id) && (p.sent === true || p.gone === true)) delete plans[p.id];
    const ticks = { ...s.ticks };
    for (const id of ids) {
      if (id === '__proto__' || (s.plans[id] && s.plans[id].sent !== true)) continue;
      ticks[id] = {};
      for (const t of (tRes.data || []).filter((x) => x.plan_id === id)) {
        ticks[id][t.day] = { ...(ticks[id][t.day] || {}), [t.step]: true };
      }
    }
    write(userId, { plans, ticks });
    return true;
  } catch {
    return false;
  }
}

/**
 * The person's Travel plans, kept up to date: the device's copy at once,
 * then the tables' quietly (once 048 is there). Every part of a page that
 * uses it sees the same copy.
 */
export function useTravelPlans(userId, moments = []) {
  const state = useSyncExternalStore(subscribe, () => read(userId), () => EMPTY);
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    let live = true;
    if (!userId) return undefined;
    refreshTravel(userId, moments).finally(() => { if (live) setChecked(true); });
    return () => { live = false; };
    // Once per person: the moments only feed the away flag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);
  return { state, plans: visiblePlans(state), checked };
}

/** Every plan kept for a person, for lists outside the plan's pages (My Plans). */
export function travelPlansOf(userId) {
  return visiblePlans(read(userId));
}

/** For tests: forget the in-memory copy, so the next read is from storage. */
export function forgetTravelCache() {
  cache.clear();
}
