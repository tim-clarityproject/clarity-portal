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

/**
 * The sessions from `from` to `to` (instants), merged into what the device
 * had for those weeks: the answer replaces every kept row in its range.
 * Returns null when the database couldn't be asked (offline, or 058 isn't
 * there yet), so the page keeps showing what it had.
 */
export async function loadAssociateSessions(userId, from, to) {
  if (!userId || (await coachReady()) !== true) return null;
  const { data, error } = await supabase.rpc('coach_associate_sessions', { p_from: new Date(from).toISOString(), p_to: new Date(to).toISOString() });
  if (error || !Array.isArray(data)) return null;
  return keepAssociateSessions(userId, from, to, data);
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
