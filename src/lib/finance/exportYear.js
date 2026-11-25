import { invoiceNumber } from '../billing/money.js';
import { dayOnTimsClock, incomeIn } from './income.js';
import { costsBetween, occurrences } from './outgoings.js';
import { isTaxDeadline } from './cashflow.js';
import { yearStarting, DEFAULT_YEAR_START_MONTH } from './year.js';
import { toCsv } from './csv.js';

// The year-end export (Phase 6b run 2, step 7): one row for every payment, refund and cost in the financial year, for
// Tim's accountant, with the currency, the rate it landed at, where each client lives and any receipt's name. Its
// totals are the Finances figures for the same year (income is exactly incomeIn over the year's months). Never a
// monthly summary email. Excel: `yearExportSheets` gives the sheets for whichever library the screen uses; CSV:
// `yearExportCsv`. Checked by tests/performance/finance-export.test.mjs.

export const EXPORT_COLUMNS = Object.freeze(['Date', 'Type', 'Who', 'Where they live', 'What for', 'Invoice', 'Sector', 'Amount', 'Currency',
  'In pounds', 'Rate, dollars to the pound', 'Stripe fee in pounds', 'Receipt']);

const pounds = (minor) => (minor == null ? null : Math.round(Number(minor)) / 100);

/**
 * @param {{ yearLabel: number, startMonth?: number, today?: string, lines: object[], invoices?: object[], outgoings?: object[],
 *   deadlines?: object[], associatePayouts?: { name?: string, amount_minor: number, paid_at: string, month?: string }[],
 *   people?: Record<string, { name: string, country?: string }>, organisations?: Record<string, { name: string, country?: string }>,
 *   receipts?: Record<string, string>, zone?: string }} a
 *   costs run to `today` when the year isn't over (the export is what happened); receipts maps a payment's id to its file's name
 * @returns {{ year: object, rows: (string|number|null)[][], totals: { income: number, costs: number, notInPounds: number, payments: number,
 *   refunds: number, costRows: number } }} rows sorted by date; amounts in pounds as numbers, costs and refunds minus
 */
export function yearExport({ yearLabel, startMonth = DEFAULT_YEAR_START_MONTH, today = null, lines = [], invoices = [], outgoings = [],
  deadlines = [], associatePayouts = [], people = {}, organisations = {}, receipts = {}, zone }) {
  const year = yearStarting(yearLabel, startMonth);
  const to = today && today < year.end ? today : year.end;
  const inv = new Map((invoices || []).map((i) => [i.id, i]));
  // Who: the organisation or client when the payment is linked to one, else the payer's own name as it was typed (a
  // payment made straight to the bank).
  const who = (l) => (l.organisation_id && organisations[l.organisation_id]) || (l.profile_id && people[l.profile_id]) || { name: l.payer_name || '', country: '' };
  const rows = [];
  let payments = 0;
  let refunds = 0;
  for (const l of lines || []) {
    if (l.day < year.start || l.day > year.end) continue;
    const i = inv.get(l.invoice_id) || {};
    const w = who(l);
    const what = l.kind === 'refund' ? `Refund${l.number ? `, ${l.number}` : ''}` : (i.lines?.[0]?.description || l.what_for || (l.added_by_coach ? 'Paid to your bank' : ''));
    rows.push([l.day, l.kind === 'refund' ? 'Refund' : 'Payment', w.name || '', w.country || '', what, i.number ? invoiceNumber(Number(i.number)) : '',
      l.sector || '', pounds(l.amount_minor), l.currency, pounds(l.pounds), l.rate ? Math.round(l.rate * 10000) / 10000 : null,
      l.fee_minor ? pounds(l.fee_minor) : null, (l.id && receipts[l.id]) || '']);
    if (l.kind === 'refund') refunds += 1; else payments += 1;
  }
  const costs = [];
  for (const c of costsBetween(outgoings, year.start, to)) costs.push([c.day, 'Cost', c.name, '', c.group || '', '', '', -pounds(c.amount), 'GBP', -pounds(c.amount), null, null, c.receipt || '']);
  for (const d of deadlines || []) {
    if (!(Number(d.amount_minor) > 0)) continue;
    for (const day of occurrences({ every: d.every || 'once', starts_on: d.due_on, on_date: d.due_on }, year.start, to)) {
      costs.push([day, 'Cost', d.name, '', isTaxDeadline(d) ? 'Tax' : 'Company deadline', '', '', -pounds(d.amount_minor), 'GBP', -pounds(d.amount_minor), null, null, '']);
    }
  }
  for (const p of associatePayouts || []) {
    if (!p.paid_at) continue;
    const day = dayOnTimsClock(p.paid_at, zone);
    if (day < year.start || day > to) continue;
    costs.push([day, 'Cost', p.name || 'Associate', '', 'Associates', '', '', -pounds(p.amount_minor), 'GBP', -pounds(p.amount_minor), null, null, '']);
  }
  const all = [...rows, ...costs].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const costMinor = costs.reduce((a, r) => a - Math.round(r[9] * 100), 0);
  return {
    year,
    rows: all,
    totals: { income: incomeIn(lines, year.months), costs: costMinor, notInPounds: (lines || []).filter((l) => l.pending && l.day >= year.start && l.day <= year.end).length,
      payments, refunds, costRows: costs.length },
  };
}

/** The export as sheets for an Excel writer: the rows, then the totals. */
export function yearExportSheets(exp) {
  return [
    { name: 'Money in and out', columns: [...EXPORT_COLUMNS], rows: exp.rows },
    { name: 'Totals', columns: ['What', 'In pounds'], rows: [
      ['Income, refunds taken off', pounds(exp.totals.income)],
      ['Costs', -pounds(exp.totals.costs)],
      ['Left after costs', pounds(exp.totals.income - exp.totals.costs)],
    ] },
  ];
}

/** The export as CSV text: the heading row, then every row. */
export const yearExportCsv = (exp) => toCsv([[...EXPORT_COLUMNS], ...exp.rows]);

/** The file's name: "finances-2026-to-2027.csv". */
export const exportFileName = (exp, format = 'csv') => `finances-${exp.year.label}-to-${exp.year.label + 1}.${format === 'excel' ? 'xlsx' : 'csv'}`;
