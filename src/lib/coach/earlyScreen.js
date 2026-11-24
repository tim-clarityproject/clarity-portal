import { supabase } from '../supabase';
import { getLocalDateKey } from '../dateFormatter';

// The coach portal's opening reads, sent as the app starts (main.jsx), before the coach portal's own code has
// arrived (coach first screen run, 24 Nov 2026). On a slowed phone that code, the sign-in check and the coach's role
// took about 1.5 s before the first read went out; now the reads go out at once and the portal takes their answers:
//   - the coach's role and the five "is this migration there?" looks: plain reads that readShare.js hands to the
//     portal's own identical reads a moment later;
//   - a page's first screen (060's coach_first_screen), kept here for store.js's loadCoach, which takes it only for
//     the same account, page and clients, and asks again otherwise.
// Nothing here is shown or kept on the device: the portal shows nothing until the sign-in check has answered (054's
// 6-digit code rule is checked exactly as before), and every row comes under the database's own rules, which give a
// coach without the code nothing at all. This file is small and part of the app's opening code, so it imports only the
// client and the date key.

export { CAL_BACK_DAYS, DAY_MS, PROBE_TABLES, profilesOf, SCREEN_NOT_YET_KEY, screenKindOf, screenWindow, viewDays } from './screenPlan';
import { CAL_BACK_DAYS, DAY_MS, PROBE_TABLES, profilesOf, SCREEN_NOT_YET_KEY, screenKindOf, screenWindow } from './screenPlan';

const NOT_YET_MS = 60 * 60 * 1000;

/** The first screen's read, unsent: the same for the opening and for store.js. */
export function screenRead({ kind, from, to, todayKey, split, profiles }) {
  return supabase.rpc('coach_first_screen', {
    p_page: kind, p_from: new Date(from).toISOString(), p_to: new Date(to).toISOString(), p_today: todayKey,
    p_since: new Date(split).toISOString(), p_profiles: profiles,
  });
}

function stored() {
  try {
    const raw = window.localStorage.getItem('clarity-portal-auth');
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed?.refresh_token && typeof parsed?.user?.id === 'string' ? parsed.user.id : null;
  } catch {
    return null;
  }
}
const recently = (key) => {
  try { const at = Number(window.localStorage.getItem(key)); return Number.isFinite(at) && at > 0 && Date.now() - at < NOT_YET_MS && Date.now() >= at; } catch { return false; }
};

let opening = null;
let role = null;

/** The coach's row as the opening read it (null: not a coach), or undefined while it isn't known. */
export function openingRole(userId) {
  return role && role.userId === userId ? role.coach : undefined;
}

/**
 * Sends the coach portal's opening reads now, for someone signed in on this device opening a coach portal page (never
 * its sign-in pages). The first screen is asked for only on a device with no whole copy of the coach's data (store.js
 * keeps 'whole' or 'screen' under clarity-cache:<account>:coach-copy). Nothing waits for any of it.
 */
export function startCoachOpening(pathname = window.location.pathname, search = window.location.search) {
  try {
    const path = String(pathname || '').replace(/\/+$/, '');
    if (!/^\/coach(\/|$)/.test(path) || /^\/coach\/sign-in(\/|$)/.test(path)) return 0;
    const userId = stored();
    if (!userId) return 0;
    const noop = () => {};
    // The role's answer is also kept here, so the portal's first render can use it (useCoachRole) rather than wait a
    // render for its own identical read (which readShare.js answers with this one).
    role = { userId, coach: undefined };
    supabase.from('coaches').select('*').eq('user_id', userId).limit(1).then(({ data, error }) => {
      if (!error && role?.userId === userId) role.coach = data?.[0]?.active ? data[0] : null;
    }, noop);
    for (const table of PROBE_TABLES) supabase.from(table).select('id').limit(1).then(noop, noop);
    const kind = screenKindOf(path);
    if (!kind || recently(SCREEN_NOT_YET_KEY)) return 1;
    const mark = window.localStorage.getItem(`clarity-cache:${userId}:coach-copy`);
    if (mark === 'whole' || (mark !== 'screen' && window.localStorage.getItem(`clarity-cache:${userId}:coach`))) return 1;
    const nowMs = Date.now();
    const todayKey = getLocalDateKey();
    const [from, to] = screenWindow(kind, nowMs, search, todayKey);
    const ask = { kind, from, to, todayKey, split: nowMs - CAL_BACK_DAYS * DAY_MS, profiles: profilesOf(path) };
    const answer = screenRead(ask);
    opening = { userId, at: nowMs, ...ask, answer: Promise.resolve(answer).catch((error) => ({ data: null, error })) };
    return 2;
  } catch {
    return 0;
  }
}

/** The opening's first screen, once, for the same account and page within 30 seconds, or null. */
export function takeCoachOpening(userId, kind) {
  const o = opening;
  opening = null;
  if (!o || o.userId !== userId || o.kind !== kind || Date.now() - o.at > 30000) return null;
  return o;
}
