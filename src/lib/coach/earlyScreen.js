import { supabase } from '../supabase';
import { getLocalDateKey } from '../dateFormatter';
import { LOW_PRIORITY_HEADER } from '../connection';
import { sendCoachAuthEarly } from '../signIn/coachAuthData';

// The coach portal's opening reads, sent as the app starts (main.jsx), before the coach portal's own code has
// arrived (coach first screen run, 24 Nov 2026). On a slowed phone that code, the sign-in check and the coach's role
// took about 1.5 s before the first read went out; now the reads go out at once and the portal takes their answers:
//   - the coach's role and the five "is this migration there?" looks: plain reads that readShare.js hands to the
//     portal's own identical reads a moment later;
//   - a page's first screen (060's coach_first_screen), kept here for store.js's loadCoach, which takes it only for
//     the same account, page and clients, and asks again otherwise;
//   - the sign-in check itself (053's coach_auth_state and Supabase's factor list, which asks /auth/v1/user), first of
//     all: the portal's frame waits for its answer, and it used to go out only once the portal's code had arrived
//     (tidy follow-up 4, part 1, item 2). coachAuthData.js's loadCoachAuth takes the answers once, for this account,
//     and reads them exactly as before; every later check asks again.
// Nothing here is shown or kept on the device: the portal shows nothing until the sign-in check has answered (054's
// 6-digit code rule is checked exactly as before), and every row comes under the database's own rules, which give a
// coach without the code nothing at all. This file is small and part of the app's opening code, so it imports only what
// that code already holds: the client, the date key, the low-priority header and the sign-in check's reads.

export { CAL_BACK_DAYS, DAY_MS, PROBE_TABLES, profilesOf, SCREEN_NOT_YET_KEY, screenKindOf, screenWindow, viewDays } from './screenPlan';
import {
  assocPieces, CAL_BACK_DAYS, DAY_MS, FINANCE_AHEAD_MS, FINANCE_BACK_MS, FINANCE_NOT_YET_KEY, FINANCE_SCREEN_TABLES, financeMinuteMonths, LEAN_NOT_YET_KEY,
  PROBE_TABLES, profilesOf, SCREEN_NOT_YET_KEY, screenKindOf, screenWindow,
} from './screenPlan';

const NOT_YET_MS = 60 * 60 * 1000;

/**
 * The first screen's read: the same for the opening and for store.js. 063's coach_first_screen_lean (060's answer with
 * its sessions trimmed to what the first screens use; store.js puts back what it left out), or, before Tim runs 063
 * (remembered an hour), 060's coach_first_screen itself, as before.
 */
export function screenRead({ kind, from, to, todayKey, split, profiles }) {
  const args = {
    p_page: kind, p_from: new Date(from).toISOString(), p_to: new Date(to).toISOString(), p_today: todayKey,
    p_since: new Date(split).toISOString(), p_profiles: profiles,
  };
  if (recently(LEAN_NOT_YET_KEY)) return supabase.rpc('coach_first_screen', args);
  return Promise.resolve(supabase.rpc('coach_first_screen_lean', args)).then((got) => {
    const code = got?.error?.code;
    if (!(code === 'PGRST202' || code === '42883' || got?.error?.status === 404)) return got;
    try { window.localStorage.setItem(LEAN_NOT_YET_KEY, String(Date.now())); } catch { /* asked again next time */ }
    return supabase.rpc('coach_first_screen', args);
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
let finance = null;
/** store.js's fetchTable reads up to this many rows at once (a table that fills it is read again in pages). */
export const SCREEN_FIRST_READ = 5000;

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
    // The sign-in check first: the frame waits for it (ProtectedLayout's signInStop, through loadCoachAuth).
    sendCoachAuthEarly(supabase, userId);
    // The role's answer is also kept here, so the portal's first render can use it (useCoachRole) rather than wait a
    // render for its own identical read (which readShare.js answers with this one).
    role = { userId, coach: undefined };
    const roleAnswer = Promise.resolve(supabase.from('coaches').select('*').eq('user_id', userId).limit(1)).then(({ data, error }) => {
      const coach = error ? undefined : (data?.[0]?.active ? data[0] : null);
      if (!error && role?.userId === userId) role.coach = coach;
      return coach;
    }, () => undefined);
    const kind = screenKindOf(path);
    // Finances' first screen waits for the role (it is the owner's alone), so the role goes out first there, and the
    // looks once it has answered (they are needed only once the sign-in check has answered, well after).
    const probes = () => {
      for (const table of PROBE_TABLES) supabase.from(table).select('id').limit(1).then(noop, noop);
      // 065 (Phase 6b run 3), unless this device knows it isn't there yet (store.js's coach065Ready asks the same).
      if (!recently('clarity-coach-065-not-yet')) supabase.from('agreement_extras').select('id').limit(1).then(noop, noop);
    };
    if (kind === 'finances') roleAnswer.then(probes, probes); else probes();
    if (!kind) return 1;
    const mark = window.localStorage.getItem(`clarity-cache:${userId}:coach-copy`);
    if (mark === 'whole' || (mark !== 'screen' && window.localStorage.getItem(`clarity-cache:${userId}:coach`))) return 1;
    if (kind === 'finances') return startFinanceOpening(userId, roleAnswer);
    if (recently(SCREEN_NOT_YET_KEY)) return 1;
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

/**
 * Finances' first screen (the owner's Overview, Money and Cash flow), sent once the coach's role has answered and only
 * for the owner: an associate's portal never asks for the owner's tables (they are sent to Today anyway). Every read is
 * the owner's own plain read under its table's rules (054's 6-digit code included), each the same as the portal's
 * own a moment later: 062's look and the tables (store.js's loadCoach takes them: takeFinanceOpening), associates'
 * sessions over Finances' range (058; associateSessions.js), each month's delivered minutes (062, once the settings say
 * when the financial year starts; financeParts.jsx) and the coach list (049; CoachApp). Nothing waits for any of it.
 */
function startFinanceOpening(userId, roleAnswer) {
  if (recently(FINANCE_NOT_YET_KEY)) return 1;
  const noop = () => {};
  const at = Date.now();
  const todayKey = getLocalDateKey();
  const owner = roleAnswer.then((coach) => Boolean(coach && coach.role === 'owner'));
  // Low priority: with only a few connections to the database at once, the sign-in check the frame waits for goes first.
  const settled = (q) => Promise.resolve(q.setHeader(LOW_PRIORITY_HEADER, 'low')).then((r) => r, (error) => ({ data: null, error }));
  // Each table's read, by name, once the role says this is the owner and 062's look says its tables are there (before
  // Tim runs 062 that is one "not there" answer, as store.js's own, never one for each table).
  const reads = owner.then(async (yes) => {
    if (!yes) return null;
    // 062's look, exactly as store.js asks it (readShare.js hands its answer on).
    const look = await settled(supabase.from('finance_settings').select('id').limit(1));
    if (look.error) return null;
    return new Map(FINANCE_SCREEN_TABLES.map((t) => [t, settled(supabase.from(t).select('*').limit(SCREEN_FIRST_READ))]));
  });
  const tables = reads.then((byTable) => (byTable ? Promise.all([...byTable].map(([t, p]) => p.then((r) => [t, r]))) : null));
  const coachList = owner.then((yes) => (yes ? settled(supabase.rpc('coach_list')) : null));
  const from = at - FINANCE_BACK_MS;
  const to = at + FINANCE_AHEAD_MS;
  const assoc = owner.then((yes) => (yes ? Promise.all(assocPieces(from, to).map(([a, b]) => settled(supabase.rpc('coach_associate_sessions', { p_from: new Date(a).toISOString(), p_to: new Date(b).toISOString() })))) : null));
  // The months follow the settings' first month of the year (the first answer back), as financeParts.jsx asks them.
  const minutes = reads.then(async (byTable) => {
    if (!byTable) return null;
    const settings = await byTable.get('finance_settings');
    if (!settings || settings.error) return null;
    const startMonth = Number(settings.data?.[0]?.year_start_month) || 5;
    const months = financeMinuteMonths(todayKey, startMonth);
    return new Map(months.map((m) => [m, settled(supabase.rpc('associate_month_minutes', { p_month: `${m}-01` }))
      .then(({ data, error }) => (!error && Array.isArray(data) ? data : null))]));
  });
  [tables, coachList, assoc, minutes].forEach((p) => p.catch(noop));
  finance = { userId, at, tables, coachList, assoc: { from, to, answers: assoc }, minutes, taken: new Set() };
  return 2;
}

/** One part of the Finances opening ('tables', 'coachList', 'assoc', 'minutes'), once, for the same account within 30 seconds. */
export function takeFinanceOpening(userId, part) {
  const f = finance;
  if (!f || f.userId !== userId || Date.now() - f.at > 30000 || f.taken.has(part)) return null;
  f.taken.add(part);
  return part === 'assoc' ? f.assoc : f[part];
}
