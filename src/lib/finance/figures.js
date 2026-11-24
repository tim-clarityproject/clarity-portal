import { incomeIn, sectorRows } from './income.js';
import { openInvoices, plannedInstalments } from './projected.js';
import { DEFAULT_YEAR_START_MONTH, financialYear, monthDays, monthKey, monthName, quarterOf } from './year.js';

// Money's four figures (Phase 6b run 2, step 2): Paid, Due, Overdue and Not invoiced yet, for This month, This quarter
// or This year, on an equal-column grid. Checked by tests/performance/finance-figures.test.mjs.
//
// - Paid: income in the period, on its paid day, in pounds at the landed amount, refunds taken off.
// - Due: sent invoices not yet overdue whose due day falls from today to the period's end.
// - Overdue: every sent invoice past its due day, whatever the period (it is owed now).
// - Not invoiced yet: signed instalments with no invoice yet, and drafts, expected by the period's end.
// - Pounds only: an invoice in dollars counts at rates.USD (dollars to the pound) when given, and is left out (with
//   `notInPounds` counting it) when not.

/** The months of "month", "quarter" or "year" for today. */
export function periodMonths(period, today, startMonth = DEFAULT_YEAR_START_MONTH) {
  if (period === 'month') return [monthKey(today)];
  if (period === 'quarter') return quarterOf(today, startMonth).months;
  if (period === 'year') return financialYear(today, startMonth).months;
  throw new Error('The period is month, quarter or year.');
}

/**
 * @param {{ period: 'month'|'quarter'|'year', today: string, lines: object[], invoices?: object[], versions?: object[], rates?: object,
 *   startMonth?: number, zone?: string }} a
 * @returns {{ months: string[], paid: number, due: number, overdue: number, notInvoiced: number, notInPounds: number,
 *   toCome: object[] }} toCome is every expected item in the period, for By sector's "To come"
 */
export function moneyFigures({ period, today, lines, invoices = [], versions = [], rates = {}, startMonth = DEFAULT_YEAR_START_MONTH, zone }) {
  const months = periodMonths(period, today, startMonth);
  const end = monthDays(months.at(-1)).last;
  const open = openInvoices({ invoices, today, rates });
  const planned = plannedInstalments({ versions, invoices, today, zone });
  let notInPounds = 0;
  const sum = (items) => items.reduce((a, i) => { if (i.pounds == null) { notInPounds += 1; return a; } return a + i.pounds; }, 0);
  const byEnd = (i) => i.day <= end;
  const dueItems = open.filter((i) => i.kind === 'sent' && byEnd(i));
  const overdueItems = open.filter((i) => i.kind === 'overdue');
  const notInvoicedItems = [...open.filter((i) => i.kind === 'draft'), ...planned].filter(byEnd);
  return {
    months,
    paid: incomeIn(lines, months),
    due: sum(dueItems),
    overdue: sum(overdueItems),
    notInvoiced: sum(notInvoicedItems),
    notInPounds,
    toCome: [...dueItems, ...overdueItems, ...notInvoicedItems].filter((i) => months.includes(i.month)),
  };
}

/** By sector for the same period: Paid and To come, each sector's share of what came in adding up to 100%. */
export const sectorsFor = ({ figures, lines, sectors }) => sectorRows({ lines, months: figures.months, toCome: figures.toCome, sectors });

/** "Share of income, November" or "Share of income, since 1 May" (By sector's note). */
export function shareWords(period, today, startMonth = DEFAULT_YEAR_START_MONTH) {
  const months = periodMonths(period, today, startMonth);
  return period === 'month' ? `Share of income, ${monthName(months[0])}` : `Share of income, since 1 ${monthName(months[0])}`;
}
