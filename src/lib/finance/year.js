import { addDays, daysBetween, mustBeZone, dayIn, weekdayOf } from '../time/index.js';

// The financial year (Phase 6b run 2, step 2): Tim's year runs from 1 May (finance settings' year_start_month), and
// every Finances figure is counted in months of it. Months are 'YYYY-MM' keys; days are 'YYYY-MM-DD' keys. Plain
// calendar sums only: no clock is read here (the day "today" comes from the caller, on Tim's own clock).

export const DEFAULT_YEAR_START_MONTH = 5;
export const DEFAULT_ZONE = 'Europe/London';
export const MONTH_NAMES = Object.freeze(['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']);
const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const pad = (n) => String(n).padStart(2, '0');
const startMonthOf = (m) => {
  const n = Number(m ?? DEFAULT_YEAR_START_MONTH);
  if (!Number.isInteger(n) || n < 1 || n > 12) throw new Error('The financial year starts in a month from 1 to 12.');
  return n;
};

/** The zone Finances counts days in: Tim's own, Europe/London unless a real place-name zone is given. */
export const financeZone = (zone) => (zone ? mustBeZone(zone) : DEFAULT_ZONE);

/** 'YYYY-MM' for a day key, a 'YYYY-MM-01' target month or a month key. */
export function monthKey(day) {
  const m = /^(\d{4})-(\d{2})(?:-\d{2})?$/.exec(String(day || ''));
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) throw new Error(`"${String(day).slice(0, 20)}" is not a month.`);
  return `${m[1]}-${m[2]}`;
}

/** A month key some months on ('2026-11', 2 → '2027-01'). */
export function addMonths(month, n) {
  const [y, m] = monthKey(month).split('-').map(Number);
  const i = y * 12 + (m - 1) + n;
  return `${Math.floor(i / 12)}-${pad((i % 12) + 1)}`;
}

/** Whole months from a to b ('2026-11' to '2027-01' is 2). */
export function monthsBetween(a, b) {
  const [ya, ma] = monthKey(a).split('-').map(Number);
  const [yb, mb] = monthKey(b).split('-').map(Number);
  return (yb * 12 + mb) - (ya * 12 + ma);
}

/** The first and last day of a month. */
export function monthDays(month) {
  const [y, m] = monthKey(month).split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { first: `${y}-${pad(m)}-01`, last: `${y}-${pad(m)}-${pad(last)}`, length: last };
}

/** "November"; { short: true } "Nov"; { letter: true } "N" (the phone chart's single letters). */
export function monthName(month, { short = false, letter = false } = {}) {
  const m = Number(monthKey(month).slice(5)) - 1;
  if (letter) return MONTH_NAMES[m][0];
  return short ? SHORT[m] : MONTH_NAMES[m];
}

/**
 * The financial year a day is in.
 * @param {string} day 'YYYY-MM-DD'
 * @param {number} [startMonth] 1 to 12, May by default
 * @returns {{ label: number, start: string, end: string, months: string[], words: string }} label is the year it starts
 *   in; words "1 May 2026 to 30 Apr 2027" (the Year end rows' words).
 */
export function financialYear(day, startMonth = DEFAULT_YEAR_START_MONTH) {
  const sm = startMonthOf(startMonth);
  const [y, m] = monthKey(day).split('-').map(Number);
  const label = m >= sm ? y : y - 1;
  return yearStarting(label, sm);
}

/** The financial year that starts in `label` (2026 → 1 May 2026 to 30 Apr 2027). */
export function yearStarting(label, startMonth = DEFAULT_YEAR_START_MONTH) {
  const sm = startMonthOf(startMonth);
  if (!Number.isInteger(label)) throw new Error('A financial year is named by the year it starts in.');
  const first = `${label}-${pad(sm)}`;
  const months = Array.from({ length: 12 }, (_, i) => addMonths(first, i));
  const start = monthDays(months[0]).first;
  const end = monthDays(months[11]).last;
  const [, em, ed] = end.split('-').map(Number);
  const words = `1 ${SHORT[sm - 1]} ${label} to ${ed} ${SHORT[em - 1]} ${end.slice(0, 4)}`;
  return { label, start, end, months, words };
}

/** "Your financial year runs from 1 May" (the Finances header's meta line). */
export const yearStartWords = (startMonth = DEFAULT_YEAR_START_MONTH) => `Your financial year runs from 1 ${MONTH_NAMES[startMonthOf(startMonth) - 1]}`;

/**
 * The quarter of the financial year a month is in: May to July, August to October, November to January, February to
 * April for a 1 May year.
 * @returns {{ n: 1|2|3|4, months: string[], words: string }} words "This quarter, November to January".
 */
export function quarterOf(month, startMonth = DEFAULT_YEAR_START_MONTH) {
  const sm = startMonthOf(startMonth);
  const year = financialYear(monthDays(month).first, sm);
  const i = year.months.indexOf(monthKey(month));
  const q = Math.floor(i / 3);
  const months = year.months.slice(q * 3, q * 3 + 3);
  return { n: q + 1, months, words: `This quarter, ${monthName(months[0])} to ${monthName(months[2])}` };
}

/**
 * Working days left in the month, Monday to Friday, from `today` and counting today (bank holidays aren't taken off).
 * Tue 24 Nov 2026 → 5; Mon 23 Nov 2026 → 6.
 */
export function workingDaysLeft(today) {
  const { last } = monthDays(today);
  let n = 0;
  for (let d = today; daysBetween(d, last) >= 0; d = addDays(d, 1)) if (weekdayOf(d) <= 5) n += 1;
  return n;
}

/** "6 working days left", "1 working day left", "No working days left". */
export function workingDaysWords(n) {
  if (n <= 0) return 'No working days left';
  return n === 1 ? '1 working day left' : `${n} working days left`;
}

/** Today on Tim's clock (Europe/London unless given). */
export const financeToday = (now = new Date(), zone) => dayIn(financeZone(zone), now);
