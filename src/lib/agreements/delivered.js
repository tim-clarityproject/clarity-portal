import { dayIn, dayKeyWords } from '../time/index.js';
import { moneyText } from './currency.js';
import { counts, isOver } from './sessionOutcome.js';

// Invoicing as delivered (brief item 4; M28's s-n-delivered): each coaching session that counts (held, or cancelled
// late and not waived), since the last invoice, drafted into Needs you for the coach to check and send. Never a
// rearranged one, one not said yet, one still to come, or one already on a live invoice (065's invoice_sources).
// Checked by tests/performance/agreements-delivered.test.mjs.

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

/** One line a session: "Coaching session, Tue 3 Nov". */
export const lines = (sessions, perSessionMinor, zone = 'Europe/London') => (sessions || []).map((s) => ({
  sessionId: s.id, description: `Coaching session, ${dayKeyWords(dayIn(zone, new Date(s.starts_at)))}`, amount: Math.round(Number(perSessionMinor) || 0),
}));

/** "2 coaching sessions at £750, so £1,500." and the button "Send invoice for £1,500" (M28's invLine, invBtn). */
export const invoiceLine = (n, perSessionMinor, c = 'GBP') => `${n} coaching ${n === 1 ? 'session' : 'sessions'} at ${moneyText(perSessionMinor, c)}, so ${moneyText(n * perSessionMinor, c)}.`;
export const sendLabel = (n, perSessionMinor, c = 'GBP') => `Send invoice for ${moneyText(n * perSessionMinor, c)}`;
export const NONE_TICKED = 'Tick at least one coaching session.';
