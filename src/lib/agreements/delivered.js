import { dayIn, dayKeyWords } from '../time/index.js';
import { moneyText } from './currency.js';
import { counts, isOver } from './sessionOutcome.js';
import { extras, planTotal, sessions as planSessions } from './pricing.js';
import { finalTotal } from './upfront.js';
import { kindOf } from './terms.js';

// Invoicing as delivered (brief item 4; M28's s-n-delivered): each coaching session that counts (held, or cancelled
// late and not waived), since the last invoice, drafted into Needs you for the coach to check and send. Never a
// rearranged one, one not said yet, one still to come, one already on a live invoice (065's invoice_sources), or one
// settled when the agreement was signed (the prepaid ones, below). One per-session price everywhere (agreements rule 12):
// Needs you, the server's invoice, the 14-day refund and the settling words all read perSession().
// Checked by tests/performance/agreements-delivered.test.mjs.

/** The coaching sessions a month a retainer states ("Up to 2 a month, 60 minutes each" → 2), at least 1. */
export function sessionsAMonth(t) {
  const n = Number(String(t?.retainer?.sessions || '').match(/\d+/)?.[0]);
  return Number.isInteger(n) && n > 0 ? n : 1;
}

/**
 * One coaching session's price (agreements rule 12): set sessions, the plan's total without its extras (with 5% off
 * when up front was chosen) divided by the sessions in the plan, rounded down; a retainer, its monthly fee divided by
 * the coaching sessions a month it states. Extras are never in it: an extra coaching session counts at its own price.
 */
export function perSession(t, choice = 'plan') {
  if (kindOf(t) === 'retainer') return Math.floor((Number(t?.retainer?.feeMinor) || 0) / sessionsAMonth(t));
  const n = planSessions(t) || 1;
  return Math.floor(finalTotal(t, choice, []) / n);
}

/** The extra coaching sessions ticked (key 'session'), each with its own price. */
export const extraSessions = (t, chosen = t?.extrasChosen || []) => extras(t, chosen).filter((e) => e.chosen && e.key === 'session');

/**
 * How many coaching sessions were settled at signing and are never invoiced again: as delivered, the first (set
 * sessions) or the first month's (a retainer), and every extra coaching session ticked.
 */
export function prepaid(t, chosen = t?.extrasChosen || []) {
  const k = kindOf(t);
  const first = k === 'retainer' ? sessionsAMonth(t) : 1;
  return first + extraSessions(t, chosen).length;
}

/** The plan's total without its extras (what perSession divides). */
export const withoutExtras = (t) => planTotal(t, []);

/**
 * The sessions to invoice: this client's, from the agreement's start, that count, are over, and are on no live invoice.
 * @param {{ sessions: object[], sources?: { session_id: string, released_at?: string|null }[], profileId: string, startsOn?: string, zone?: string, now?: number }} a
 */
export function sessionsToInvoice({ sessions, sources = [], profileId, startsOn = null, zone = 'Europe/London', now = Date.now() }) {
  const live = new Set((sources || []).filter((s) => s.session_id && !s.released_at).map((s) => s.session_id));
  return (sessions || [])
    .filter((s) => s.profile_id === profileId && counts(s) && isOver(s, now) && !live.has(s.id)
      && (!startsOn || dayIn(zone, new Date(s.starts_at)) >= startsOn))
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
}

/**
 * The agreement's own sessions to invoice as delivered: sessionsToInvoice, less the first `prepaid` sessions that count
 * (settled at signing, so never on an invoice). One list for Needs you and the server alike.
 */
export function deliveredToInvoice({ terms, sessions, sources = [], profileId, zone = 'Europe/London', now = Date.now() }) {
  const startsOn = terms?.startsOn || null;
  const settled = new Set(prepaidSessions({ terms, sessions, profileId, zone, now }).map((s) => s.id));
  return sessionsToInvoice({ sessions, sources, profileId, startsOn, zone, now }).filter((s) => !settled.has(s.id) && (s.kind || 'coaching') === 'coaching');
}

/**
 * The sessions settled at signing (the first coaching session, a retainer's first month's, and each extra ticked): the
 * first ones that count and are over, from the agreement's start, oldest first.
 */
export function prepaidSessions({ terms, sessions, profileId, zone = 'Europe/London', now = Date.now() }) {
  const startsOn = terms?.startsOn || null;
  return (sessions || [])
    .filter((s) => s.profile_id === profileId && (s.kind || 'coaching') === 'coaching' && counts(s) && isOver(s, now)
      && (!startsOn || dayIn(zone, new Date(s.starts_at)) >= startsOn))
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))
    .slice(0, prepaid(terms));
}

/** One line a session: "Coaching session, Tue 3 Nov". */
export const lines = (sessions, perSessionMinor, zone = 'Europe/London') => (sessions || []).map((s) => ({
  sessionId: s.id, description: `Coaching session, ${dayKeyWords(dayIn(zone, new Date(s.starts_at)))}`, amount: Math.round(Number(perSessionMinor) || 0),
}));

/** "2 coaching sessions at £750, so £1,500." and the button "Send invoice for £1,500" (M28's invLine, invBtn). */
export const invoiceLine = (n, perSessionMinor, c = 'GBP') => `${n} coaching ${n === 1 ? 'session' : 'sessions'} at ${moneyText(perSessionMinor, c)}, so ${moneyText(n * perSessionMinor, c)}.`;
export const sendLabel = (n, perSessionMinor, c = 'GBP') => `Send invoice for ${moneyText(n * perSessionMinor, c)}`;
export const NONE_TICKED = 'Tick at least one coaching session.';
