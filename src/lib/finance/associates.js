import { moneyWords, rateWords } from '../billing/money.js';
import { dayOnTimsClock, incomeIn } from './income.js';
import { addMonths, monthDays, monthKey, monthName } from './year.js';
import { hoursWords } from './words.js';

// Associates' pay (Phase 6b run 2, step 5). An associate is paid their hourly rate for the coaching hours they
// delivered each month: sessions held, late cancellations (they count as delivered and are paid) unless waived, and
// no-shows only when Tim chooses (finance settings' no_shows_paid). A cancelled or moved session is never paid. A past
// session with no outcome written yet counts as held until it's marked otherwise (the one rule everywhere: 062's
// associate_month_minutes, the forecast, Settings, Coaches, the associate's own Today and their statement; UI tester,
// run 2): "past" is once it has ended, its start plus its minutes at or before `nowMs`. Each month's pay goes out the
// month after. Where nothing is booked for a month ahead, the forecast uses the associate's average of the last 3
// complete months. Checked by tests/performance/finance-associates.test.mjs.

/** Whether an outcome is paid as delivered. An outcome not written yet (null) isn't, on its own: see sessionCounts. */
export function countsAsDelivered(outcome, noShowsPaid = false) {
  if (outcome === 'held' || outcome === 'late_cancel') return true;
  return outcome === 'no_show' && Boolean(noShowsPaid);
}

/** Whether a session has ended by `nowMs` (its start plus its minutes). */
export const sessionEnded = (s, nowMs = 0) => {
  const start = Date.parse(s?.starts_at);
  return Number.isFinite(start) && start + Math.max(0, Number(s.minutes) || 0) * 60000 <= Number(nowMs || 0);
};

/**
 * Whether one session is paid as delivered: held; or no outcome yet and already ended (it counts as held until it's
 * marked otherwise); a late cancellation unless waived; a no-show only when Tim pays them; cancelled or moved never.
 */
export function sessionCounts(s, { noShowsPaid = false, nowMs = 0 } = {}) {
  if (!s) return false;
  if (s.outcome == null || s.outcome === '') return sessionEnded(s, nowMs);
  if (s.outcome === 'late_cancel' && s.waived) return false;
  return countsAsDelivered(s.outcome, noShowsPaid);
}

const theirs = (sessions, coachId, month, zone) => (sessions || [])
  .filter((s) => (coachId == null || s.coach_id === coachId) && monthKey(dayOnTimsClock(s.starts_at, zone)) === month);

/**
 * An associate's delivered month.
 * @param {{ coachId: string, rateMinor: number, sessions: object[], month: string, zone?: string, noShowsPaid?: boolean, nowMs?: number }} a
 *   nowMs: the moment a session with no outcome yet counts as held once it has ended by (0: none of them do)
 * @returns {{ month: string, minutes: number, payMinor: number, lateCancels: number, noShows: number, hours: string, words: string }}
 *   words "22 hours at £100"
 */
export function associateMonth({ coachId, rateMinor, sessions, month, zone, noShowsPaid = false, nowMs = 0 }) {
  const m = monthKey(month);
  let minutes = 0;
  let lateCancels = 0;
  let noShows = 0;
  for (const s of theirs(sessions, coachId, m, zone)) {
    if (!sessionCounts(s, { noShowsPaid, nowMs })) continue;
    minutes += Math.max(0, Number(s.minutes) || 0);
    if (s.outcome === 'late_cancel') lateCancels += 1;
    if (s.outcome === 'no_show') noShows += 1;
  }
  const payMinor = Math.round((minutes * Number(rateMinor)) / 60);
  return { month: m, minutes, payMinor, lateCancels, noShows, hours: hoursWords(minutes), words: `${hoursWords(minutes)} at ${moneyWords(Number(rateMinor))}` };
}

/**
 * An associate's delivered minutes for a month from 062's associate_month_minutes (the owner's only read of their
 * outcomes): held (or ended with no outcome yet), late cancellations unless waived, and no-shows only when Tim pays
 * them. `monthMinutes` is { 'YYYY-MM': rows } for the months read; null when that month wasn't read (then the caller
 * falls back to 058's sessions). A month read with no row for the associate is 0 minutes.
 * @returns {{ minutes: number, lateCancelMinutes: number, noShowMinutes: number }|null}
 */
export function minutesFromFunction({ coachId, month, monthMinutes, noShowsPaid = false }) {
  const rows = monthMinutes?.[monthKey(month)];
  if (!Array.isArray(rows)) return null;
  const r = rows.find((x) => x && x.coach_id === coachId) || {};
  const held = Math.max(0, Number(r.held_minutes) || 0);
  const late = Math.max(0, Number(r.late_cancel_minutes) || 0);
  const noShow = noShowsPaid ? Math.max(0, Number(r.no_show_minutes) || 0) : 0;
  return { minutes: held + late + noShow, lateCancelMinutes: late, noShowMinutes: noShow };
}

const payOf = (minutes, rateMinor) => Math.round((minutes * Number(rateMinor)) / 60);

/** A finished month's pay: from 062's minutes when that month was read, else from the sessions. */
function deliveredPay({ coachId, rateMinor, sessions, month, zone, noShowsPaid, monthMinutes }) {
  const fn = minutesFromFunction({ coachId, month, monthMinutes, noShowsPaid });
  if (fn) return payOf(fn.minutes, rateMinor);
  return associateMonth({ coachId, rateMinor, sessions, month, zone, noShowsPaid }).payMinor;
}

/** The average pay of the 3 complete months before `month`, in pence (rounded); 062's minutes where they were read. */
export function threeMonthAverage({ coachId, rateMinor, sessions, month, zone, noShowsPaid = false, monthMinutes = null }) {
  let total = 0;
  for (let k = 1; k <= 3; k += 1) total += deliveredPay({ coachId, rateMinor, sessions, month: addMonths(month, -k), zone, noShowsPaid, monthMinutes });
  return Math.round(total / 3);
}

/**
 * The pay a month is expected to come to: what's delivered so far plus what's booked (not cancelled) at the hourly
 * rate; a month with nothing delivered or booked uses the 3-month average from before `fromMonth` (this month).
 * With 062's minutes (`monthMinutes`): a month before `fromMonth` is exactly what the function says was delivered;
 * this month is what it says so far plus 058's sessions still to come (no outcome: not yet held). Without them, 058's
 * reading (sessions marked held once past) is used, quietly.
 * @returns {{ month: string, payMinor: number, from: 'delivered'|'booked'|'average' }}
 */
export function expectedPay({ coachId, rateMinor, sessions, month, fromMonth, zone, noShowsPaid = false, monthMinutes = null }) {
  const m = monthKey(month);
  const mine = theirs(sessions, coachId, m, zone);
  const fn = m <= monthKey(fromMonth) ? minutesFromFunction({ coachId, month: m, monthMinutes, noShowsPaid }) : null;
  if (fn && m < monthKey(fromMonth)) return { month: m, payMinor: payOf(fn.minutes, rateMinor), from: 'delivered' };
  const minutes = fn
    ? fn.minutes + mine.filter((s) => s.outcome == null).reduce((a, s) => a + Math.max(0, Number(s.minutes) || 0), 0)
    : mine.filter((s) => s.outcome == null || (!(s.outcome === 'late_cancel' && s.waived) && countsAsDelivered(s.outcome, noShowsPaid)))
      .reduce((a, s) => a + Math.max(0, Number(s.minutes) || 0), 0);
  if (minutes > 0) return { month: m, payMinor: payOf(minutes, rateMinor), from: 'booked' };
  return { month: m, payMinor: threeMonthAverage({ coachId, rateMinor, sessions, month: fromMonth, zone, noShowsPaid, monthMinutes }), from: 'average' };
}

/**
 * The monthly statement's lines (Maya's November statement, as M11 draws it): late cancellations that count are listed only
 * when the month had some.
 * @returns {{ label: string, detail: string, value: string, amount: number|null }[]}
 */
export function statementLines({ month: delivered, noShowsPaid = false }) {
  const lines = [{ label: 'Coaching hours', detail: delivered.words, value: moneyWords(delivered.payMinor), amount: delivered.payMinor }];
  // Only for a month that had some (functionality tester, run 2).
  if (Number(delivered.lateCancels) > 0) lines.push({ label: 'Late cancellations that count', detail: 'Paid as delivered', value: 'Included', amount: null });
  if (noShowsPaid) lines.push({ label: 'No-shows that count', detail: 'Paid as delivered', value: 'Included', amount: null });
  return lines;
}

/** Settings, Coaches: "Associate, 5 clients, £100/hr". */
export const associateSummary = ({ clients, rateMinor }) => `Associate, ${clients === 1 ? '1 client' : `${clients} clients`}, ${rateWords(Number(rateMinor), 'hour')}`;

/** The figures' labels for a month: "Coaching hours in November", "Pay owed for November" (Tim), "Pay for November" (the associate). */
export const payLabels = (month) => ({
  hours: `Coaching hours in ${monthName(month)}`,
  owed: `Pay owed for ${monthName(month)}`,
  pay: `Pay for ${monthName(month)}`,
  download: `Download my ${monthName(month)} statement`,
});

/** "What their clients paid": the associate's clients' payments in the months, in pounds. */
export const clientsPaid = ({ lines, profileIds, months }) => {
  const set = new Set(profileIds || []);
  return incomeIn((lines || []).filter((l) => set.has(l.profile_id)), months);
};

/** Needs you reminds Tim to pay each associate on the last day of the month. */
export const payReminderDue = (today) => monthDays(today).last === today;
