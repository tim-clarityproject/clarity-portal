import { addDays } from '../time/index.js';
import { addMonths, monthDays, monthKey } from './year.js';
import { toNearestHundredPounds } from './words.js';

// Outgoings (Phase 6b run 2, step 2: Cash flow). Recurring outgoings repeat each month, quarter or year from their
// first day (on the same day of the month, or the month's last day when it is shorter) until they end; a one-off
// cost is on its own day. A yearly cost goes out in the month it's paid, and the list shows its monthly average.
// Checked by tests/performance/finance-cashflow.test.mjs.

export const OUTGOING_GROUPS = Object.freeze(['Associates', 'Software', 'Marketing', 'Travel', 'Training and supervision', 'Insurance and professional fees', 'Your pay', 'Tax']);
const STEP = { month: 1, quarter: 3, year: 12 };
const PER_MONTH = { month: 1, quarter: 3, year: 12 };
const pad = (n) => String(n).padStart(2, '0');

function onDayOf(month, day) {
  const { length } = monthDays(month);
  return `${month}-${pad(Math.min(day, length))}`;
}

/**
 * The days an outgoing goes out between `from` and `to` (both included).
 * @param {{ every: 'month'|'quarter'|'year'|'once', starts_on?: string, ends_on?: string|null, on_date?: string }} o
 * @returns {string[]}
 */
export function occurrences(o, from, to) {
  if (!o) return [];
  if (o.every === 'once') {
    const d = o.on_date || o.starts_on;
    return d && d >= from && d <= to ? [d] : [];
  }
  const step = STEP[o.every];
  if (!step || !o.starts_on) return [];
  const day = Number(o.starts_on.slice(8, 10));
  const out = [];
  for (let m = monthKey(o.starts_on); `${m}-01` <= to; m = addMonths(m, step)) {
    const d = onDayOf(m, day);
    if (o.ends_on && d > o.ends_on) break;
    if (d >= from && d <= to) out.push(d);
  }
  return out;
}

/** An outgoing's monthly average in pence (a yearly £1,200 is £100/month); a one-off has none. */
export function monthlyAverage(o) {
  const per = PER_MONTH[o?.every];
  return per ? Math.round(Number(o.amount_minor) / per) : 0;
}

/** Whether a recurring outgoing still runs on `today` or starts later (the list leaves out the ended ones). */
export const stillRunning = (o, today) => o.every !== 'once' && (!o.ends_on || o.ends_on >= today);

/**
 * Recurring outgoings by group, as the list shows them: each group's names (the most first) and its monthly average,
 * with each associate as an Associates line at their 3-month average.
 * @param {{ outgoings: object[], today: string, associates?: { name: string, monthlyMinor: number }[] }} a
 * @returns {{ rows: { group: string, names: string, monthly: number, items: { name: string, monthly: number }[] }[], total: number }}
 *   total is "Going out each month"
 */
export function outgoingRows({ outgoings, today, associates = [] }) {
  const groups = new Map();
  const add = (group, name, monthly) => {
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push({ name, monthly });
  };
  for (const a of associates || []) if (a.monthlyMinor > 0) add('Associates', a.name, a.monthlyMinor);
  for (const o of outgoings || []) if (stillRunning(o, today)) add(o.group_name || 'Other', o.name, monthlyAverage(o));
  const order = (g) => { const i = OUTGOING_GROUPS.indexOf(g); return i < 0 ? OUTGOING_GROUPS.length : i; };
  const rows = [...groups.entries()].sort((a, b) => order(a[0]) - order(b[0])).map(([group, items]) => {
    const sorted = [...items].sort((a, b) => b.monthly - a.monthly);
    return { group, names: sorted.map((i) => i.name).join(', '), monthly: sorted.reduce((a, i) => a + i.monthly, 0), items: sorted };
  });
  return { rows, total: rows.reduce((a, r) => a + r.monthly, 0) };
}

/** "Keep cash above", until Tim sets it: 2 months of outgoings, to the nearest £100 (£1,810 a month → £3,600). */
export const keepAboveDefault = (monthlyOut) => toNearestHundredPounds(2 * monthlyOut);

/**
 * Every cost out between two days from the outgoings (recurring and one-off).
 * @returns {{ day: string, amount: number, name: string, group: string|null, kind: 'outgoing'|'one_off' }[]}
 */
export function costsBetween(outgoings, from, to) {
  const out = [];
  for (const o of outgoings || []) {
    for (const d of occurrences(o, from, to)) {
      out.push({ day: d, amount: Number(o.amount_minor), name: o.name, group: o.group_name ?? null, kind: o.every === 'once' ? 'one_off' : 'outgoing', id: o.id ?? null, receipt: o.receipt_name ?? null });
    }
  }
  return out.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
}

/** The day after a day (for windows that start after a balance was checked). */
export const dayAfter = (day) => addDays(day, 1);
