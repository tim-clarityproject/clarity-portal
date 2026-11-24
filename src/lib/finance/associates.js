import { moneyWords, rateWords } from '../billing/money.js';
import { dayOnTimsClock, incomeIn } from './income.js';
import { addMonths, monthDays, monthKey, monthName } from './year.js';
import { hoursWords } from './words.js';

// Associates' pay (Phase 6b run 2, step 5). An associate is paid their hourly rate for the coaching hours they
// delivered each month: sessions held, late cancellations (they count as delivered and are paid), and no-shows only
// when Tim chooses (finance settings' no_shows_paid). A cancelled session is never paid. Each month's pay goes out the
// month after. Where nothing is booked for a month ahead, the forecast uses the associate's average of the last 3
// complete months. Checked by tests/performance/finance-associates.test.mjs.

/** Whether a session's outcome is paid as delivered. A session not held yet (outcome null) isn't delivered. */
export function countsAsDelivered(outcome, noShowsPaid = false) {
  if (outcome === 'held' || outcome === 'late_cancel') return true;
  return outcome === 'no_show' && Boolean(noShowsPaid);
}

const theirs = (sessions, coachId, month, zone) => (sessions || [])
  .filter((s) => (coachId == null || s.coach_id === coachId) && monthKey(dayOnTimsClock(s.starts_at, zone)) === month);

/**
 * An associate's delivered month.
 * @param {{ coachId: string, rateMinor: number, sessions: object[], month: string, zone?: string, noShowsPaid?: boolean }} a
 * @returns {{ month: string, minutes: number, payMinor: number, lateCancels: number, noShows: number, hours: string, words: string }}
 *   words "22 hours at £100"
 */
export function associateMonth({ coachId, rateMinor, sessions, month, zone, noShowsPaid = false }) {
  const m = monthKey(month);
  let minutes = 0;
  let lateCancels = 0;
  let noShows = 0;
  for (const s of theirs(sessions, coachId, m, zone)) {
    if (!countsAsDelivered(s.outcome, noShowsPaid)) continue;
    minutes += Math.max(0, Number(s.minutes) || 0);
    if (s.outcome === 'late_cancel') lateCancels += 1;
    if (s.outcome === 'no_show') noShows += 1;
  }
  const payMinor = Math.round((minutes * Number(rateMinor)) / 60);
  return { month: m, minutes, payMinor, lateCancels, noShows, hours: hoursWords(minutes), words: `${hoursWords(minutes)} at ${moneyWords(Number(rateMinor))}` };
}

/** The average pay of the 3 complete months before `month`, in pence (rounded). */
export function threeMonthAverage({ coachId, rateMinor, sessions, month, zone, noShowsPaid = false }) {
  let total = 0;
  for (let k = 1; k <= 3; k += 1) total += associateMonth({ coachId, rateMinor, sessions, month: addMonths(month, -k), zone, noShowsPaid }).payMinor;
  return Math.round(total / 3);
}

/**
 * The pay a month is expected to come to: what's delivered so far plus what's booked (not cancelled) at the hourly
 * rate; a month with nothing delivered or booked uses the 3-month average from before `fromMonth` (this month).
 * @returns {{ month: string, payMinor: number, from: 'booked'|'average' }}
 */
export function expectedPay({ coachId, rateMinor, sessions, month, fromMonth, zone, noShowsPaid = false }) {
  const m = monthKey(month);
  const mine = theirs(sessions, coachId, m, zone);
  const minutes = mine.filter((s) => s.outcome == null || countsAsDelivered(s.outcome, noShowsPaid))
    .reduce((a, s) => a + Math.max(0, Number(s.minutes) || 0), 0);
  if (minutes > 0) return { month: m, payMinor: Math.round((minutes * Number(rateMinor)) / 60), from: 'booked' };
  return { month: m, payMinor: threeMonthAverage({ coachId, rateMinor, sessions, month: fromMonth, zone, noShowsPaid }), from: 'average' };
}

/**
 * The monthly statement's lines (Maya's November statement, as M11 draws it).
 * @returns {{ label: string, detail: string, value: string, amount: number|null }[]}
 */
export function statementLines({ month: delivered, noShowsPaid = false }) {
  const lines = [
    { label: 'Coaching hours', detail: delivered.words, value: moneyWords(delivered.payMinor), amount: delivered.payMinor },
    { label: 'Late cancellations that count', detail: 'Paid as delivered', value: 'Included', amount: null },
  ];
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
