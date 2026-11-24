import { poundsWords, percentOf } from './words.js';
import { incomeIn } from './income.js';
import { financialYear, monthKey, monthName, quarterOf, workingDaysLeft, workingDaysWords, yearStarting, DEFAULT_YEAR_START_MONTH } from './year.js';

// Targets (Phase 6b run 2, step 2): one target a month (finance targets' month 'YYYY-MM-01' and target_minor), set each
// month or the same every month; a quarter's and a year's are the sums of their months. The £2,000 minimum is what
// Tim needs to stand still, measured after associate pay. Checked by tests/performance/finance-targets.test.mjs.

export const MAX_TARGET_MINOR = 100000000; // £1,000,000 a month, the same ceiling as an invoice in 061

/** A target in pence, or a clear error: a whole number from 0 to £1,000,000. */
export function checkTarget(minor) {
  const n = Number(minor);
  if (!Number.isInteger(n) || n < 0 || n > MAX_TARGET_MINOR) throw new Error('A target is a whole amount from £0 to £1,000,000.');
  return n;
}

/** Each month's target: { '2026-05': 500000, … } for the months asked (0 where none is set). */
export function targetsByMonth(targets, months) {
  const set = new Map((targets || []).map((t) => [monthKey(t.month), Number(t.target_minor) || 0]));
  return Object.fromEntries((months || []).map((m) => [monthKey(m), set.get(monthKey(m)) || 0]));
}

/** The sum of the months' targets (a quarter's, a year's). */
export const targetFor = (targets, months) => Object.values(targetsByMonth(targets, months)).reduce((a, b) => a + b, 0);

/**
 * "Same every month": twelve rows from one monthly figure, or from a year's figure split exactly (in whole pounds when
 * the year is whole pounds, the pounds left over on the first months; £50,000 → £4,167 four times, then £4,166).
 * @param {{ yearLabel: number, monthly?: number, yearly?: number, startMonth?: number }} a
 * @returns {{ month: string, target_minor: number }[]} month as 'YYYY-MM-01'
 */
export function sameEveryMonth({ yearLabel, monthly = null, yearly = null, startMonth = DEFAULT_YEAR_START_MONTH }) {
  const { months } = yearStarting(yearLabel, startMonth);
  let each;
  if (monthly != null) each = months.map(() => checkTarget(monthly));
  else {
    const total = checkTarget(yearly);
    const unit = total % 100 === 0 ? 100 : 1;
    const units = total / unit;
    const base = Math.floor(units / 12);
    each = months.map((_, i) => (base + (i < units - base * 12 ? 1 : 0)) * unit);
  }
  return months.map((m, i) => ({ month: `${m}-01`, target_minor: each[i] }));
}

/** Edit targets' "Same every month" figures: Each month, Each quarter, This financial year. */
export const sameEveryMonthSums = (monthly) => ({ month: checkTarget(monthly), quarter: monthly * 3, year: monthly * 12 });

/**
 * A new financial year starts with last year's monthly targets, month for month (May for May). Months the new year
 * already has keep theirs.
 * @returns {{ month: string, target_minor: number }[]} only the rows to add
 */
export function copyToNewYear({ targets, fromYear, toYear, startMonth = DEFAULT_YEAR_START_MONTH }) {
  const from = yearStarting(fromYear, startMonth).months;
  const to = yearStarting(toYear, startMonth).months;
  const had = targetsByMonth(targets, from);
  const have = new Set((targets || []).map((t) => monthKey(t.month)));
  return to.map((m, i) => ({ month: `${m}-01`, target_minor: had[from[i]] })).filter((r) => !have.has(monthKey(r.month)) && r.target_minor > 0);
}

/** Whether Needs you asks Tim to check the year's targets: they were copied and he hasn't looked since. */
export const newYearCheckDue = ({ copiedAt = null, checkedAt = null }) => Boolean(copiedAt) && (!checkedAt || checkedAt < copiedAt);

/**
 * Every target raised by a percentage, each rounded to whole pounds (half up). 3% on £5,000 → £5,150.
 * @returns {{ month: string, target_minor: number }[]}
 */
export function raiseTargets(rows, percent) {
  const p = Number(percent);
  if (!Number.isFinite(p) || p <= -100 || p > 100) throw new Error('Raise targets by more than −100% and at most 100%.');
  return (rows || []).map((r) => ({ ...r, target_minor: checkTarget(Math.round((Number(r.target_minor) * (100 + p)) / 10000) * 100) }));
}

/** "of £5,000" or, over it, "of £5,000, £900 over" (Overview's figure). */
export function ofWords(paid, target) {
  if (!(target > 0)) return '';
  return paid > target ? `of ${poundsWords(target)}, ${poundsWords(paid - target)} over` : `of ${poundsWords(target)}`;
}

/** "Minimum £2,000, reached" or "Minimum £2,000, not reached yet", on what's left after associate pay. */
export function minimumWords(afterAssociatePay, minimum) {
  if (!(minimum > 0)) return '';
  return afterAssociatePay >= minimum ? `Minimum ${poundsWords(minimum)}, reached` : `Minimum ${poundsWords(minimum)}, not reached yet`;
}

/**
 * Your targets: This month, This quarter and This year, as Overview draws them.
 * @param {{ today: string, lines: object[], targets: object[], minimumMinor?: number, associatePayMinor?: number, startMonth?: number }} a
 *   associatePayMinor is this month's associate pay, taken off before the minimum is measured
 * @returns {{ month: Row, quarter: Row, year: Row }} where Row is { label, paid, target, figure: "£2,300 of £5,000",
 *   percent: number|null, percentWords: "46%", detail: string, minimum: string }
 */
export function targetRows({ today, lines, targets, minimumMinor = 0, associatePayMinor = 0, startMonth = DEFAULT_YEAR_START_MONTH }) {
  const month = monthKey(today);
  const q = quarterOf(month, startMonth);
  const fy = financialYear(today, startMonth);
  const row = (label, months, extra = {}) => {
    const paid = incomeIn(lines, months);
    const target = targetFor(targets, months);
    const percent = percentOf(paid, target);
    return { label, paid, target, figure: target > 0 ? `${poundsWords(paid)} of ${poundsWords(target)}` : poundsWords(paid),
      percent, percentWords: percent == null ? '' : `${percent}%`, detail: '', minimum: '', ...extra(paid, target) };
  };
  const days = workingDaysWords(workingDaysLeft(today));
  return {
    month: row('This month', [month], (paid, target) => ({
      detail: target > 0 && paid > target ? `${poundsWords(paid - target)} over, with ${days.charAt(0).toLowerCase()}${days.slice(1)}` : days,
      minimum: minimumWords(paid - associatePayMinor, minimumMinor),
    })),
    quarter: row(q.words, q.months, () => ({})),
    year: row(`This year, from 1 ${monthName(fy.months[0])}`, fy.months, () => ({})),
  };
}
