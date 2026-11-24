import { supabase } from '../supabase';
import { coachReady } from './store';

// The owner's view of associates' coaching sessions on the calendar (tidy
// follow-up 3, run 6's 25; migration 058's coach_associate_sessions): only
// their sessions' time, length, kind, the client's name and the coach's
// first name, never anything else of their calendars. The database decides:
// anyone but the owner with the 6-digit code gets nothing. Read for the
// weeks on screen; the last answer is kept on the device
// (clarity-cache:<account>:coach-assoc, cleared by Sign out) so the
// calendar shows it at once and offline. Before 058 is there, nothing.

const KEY = (userId) => `clarity-cache:${userId}:coach-assoc`;
const KEEP_MAX = 4000;

/** What the device last had: the rows, kept by id. */
export function keptAssociateSessions(userId) {
  try {
    const kept = JSON.parse(window.localStorage.getItem(KEY(userId)) || 'null');
    return Array.isArray(kept?.rows) ? kept.rows : [];
  } catch { return []; }
}

/** Whether this device has ever kept them (even none): a return visit shows them at once, as before. */
export function associateSessionsKept(userId) {
  try { return window.localStorage.getItem(KEY(userId)) != null; } catch { return false; }
}

/**
 * The sessions from `from` to `to` (instants), merged into what the device
 * had for those weeks: the answer replaces every kept row in its range.
 * Returns null when the database couldn't be asked (offline, or 058 isn't
 * there yet), so the page keeps showing what it had.
 */
export async function loadAssociateSessions(userId, from, to) {
  if (!userId || (await coachReady()) !== true) return null;
  // 058 answers at most 63 days a call, so a longer range (Finances' forecast) is read in pieces, all or nothing.
  const lo = new Date(from).getTime();
  const hi = new Date(to).getTime();
  const pieces = [];
  for (let a = lo; a < hi; a += PIECE_MS) pieces.push([a, Math.min(hi, a + PIECE_MS)]);
  const answers = await Promise.all(pieces.map(([a, b]) => supabase.rpc('coach_associate_sessions', { p_from: new Date(a).toISOString(), p_to: new Date(b).toISOString() })));
  if (answers.some(({ data, error }) => error || !Array.isArray(data))) return null;
  return keepAssociateSessions(userId, from, to, answers.flatMap(({ data }) => data));
}

const DAY_MS = 24 * 60 * 60 * 1000;
const PIECE_MS = 60 * DAY_MS;
// Finances (Overview, Cash flow, Settings, Coaches) and Today's Finances line all read the same range: 3 months back
// (the 3-month average) to a year ahead (the forecast), so every figure that counts associates' pay agrees.
export const FINANCE_BACK_MS = 100 * DAY_MS;
export const FINANCE_AHEAD_MS = 400 * DAY_MS;
let financeRead = { userId: null, at: 0, promise: null };

/**
 * The finance range's sessions, read at most once every 5 minutes per account (every Finances tab and Today ask);
 * resolves to the device's rows, or null when the database couldn't be asked.
 */
export function loadFinanceAssociateSessions(userId, nowMs = Date.now()) {
  if (financeRead.userId === userId && financeRead.promise && nowMs - financeRead.at < 5 * 60 * 1000) return financeRead.promise;
  const promise = loadAssociateSessions(userId, nowMs - FINANCE_BACK_MS, nowMs + FINANCE_AHEAD_MS).catch(() => null);
  financeRead = { userId, at: nowMs, promise };
  promise.then((rows) => { if (!rows && financeRead.promise === promise) financeRead = { userId: null, at: 0, promise: null }; });
  return promise;
}

/**
 * Sessions read for `from` to `to` (the read above, or a calendar's first screen: store.js's takeScreenAssociates), kept
 * on the device in place of every kept row in that range. Returns the device's rows.
 */
export function keepAssociateSessions(userId, from, to, data) {
  const lo = new Date(from).getTime();
  const hi = new Date(to).getTime();
  const inRange = (r) => { const t = new Date(r.starts_at).getTime(); return t >= lo && t < hi; };
  const rows = [...keptAssociateSessions(userId).filter((r) => !inRange(r)), ...data.filter((r) => r && r.id)]
    .sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at)))
    .slice(-KEEP_MAX);
  try { window.localStorage.setItem(KEY(userId), JSON.stringify({ rows })); } catch { /* the page still shows them */ }
  return rows;
}
