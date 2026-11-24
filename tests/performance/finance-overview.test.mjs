// Finances (Phase 6b run 2): M11's drawn November, rebuilt from invented rows, so Overview, Money, the chart, the cash
// flow and Today's line all read exactly as the mock-up words them (INVENTORY C1, C4, C5, C6). Names and figures are
// invented; where M11's own figures disagree with each other (INVENTORY D3) they aren't chased.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as f from '../../src/lib/finance/index.js';
import { rateWords } from '../../src/lib/billing/money.js';

const TODAY = '2026-11-23'; // Mon 23 Nov 2026: 6 working days left
const pay = (day, pounds, sector, extra = {}) => ({ id: `p-${day}-${sector}-${pounds}`, amount_minor: pounds * 100, currency: 'GBP', landed_gbp_minor: null,
  fee_minor: Math.round(pounds * 1.5), paid_at: `${day}T10:00:00`, sector, invoice_id: null, profile_id: `client-${sector}`, ...extra });

// Paid this financial year: £23,100.
const payments = [
  pay('2026-05-12', 2500, 'Business'), pay('2026-05-20', 700, 'Sport'),
  pay('2026-06-15', 2800, 'Business'),
  pay('2026-07-10', 5400, 'Business'),
  pay('2026-08-14', 1500, 'Medicine'),
  pay('2026-09-09', 6000, 'Business'),
  pay('2026-10-21', 1900, 'Business'),
  pay('2026-11-04', 1340, 'Business'), pay('2026-11-09', 550, 'Sport'), pay('2026-11-11', 250, 'Medicine'), pay('2026-11-13', 160, 'Personal'),
];
const inv = (id, status, due, pounds, sector = 'Business') => ({ id, status, total_minor: pounds * 100, paid_minor: 0, currency: 'GBP', due_on: due, sector, kind: 'one_off' });
const invoices = [
  inv('i-due', 'sent', '2026-11-27', 1200),
  inv('i-draft-nov', 'draft', '2026-11-30', 700, 'Sport'),
  inv('i-overdue', 'sent', '2026-11-16', 940),
  inv('i-dec', 'draft', '2026-12-09', 2400), inv('i-jan', 'draft', '2027-01-12', 1800), inv('i-feb', 'draft', '2027-02-10', 2100),
  inv('i-mar', 'draft', '2027-03-10', 1700), inv('i-apr', 'draft', '2027-04-12', 1500), inv('i-may', 'draft', '2027-05-11', 1500),
  // Instalment 1 of a signed three-part agreement is already invoiced (and settled in November's Business £1,340).
  { id: 'i-a1', status: 'paid', agreement_id: 'ag-1', instalment_n: 1, kind: 'instalment', total_minor: 100000, paid_minor: 100000, currency: 'GBP', due_on: '2026-11-17' },
];
const versions = [{ agreement_id: 'ag-1', status: 'signed', client_signed_at: '2026-11-03T09:00:00', currency: 'GBP', sector: 'Business',
  terms: { coaching: 'Leadership coaching', total_minor: 300000, instalments: 3, termsDays: 14 } }];
const targets = [5000, 5000, 3000, 3000, 6000, 6000, 5000, 4000, 6000, 6000, 6000, 5000]
  .map((t, i) => ({ month: `${f.addMonths('2026-05', i)}-01`, target_minor: t * 100 }));
const lines = f.incomeLines({ payments, invoices });

test('Overview figures: "£2,300" "of £5,000" this month and "£23,100" "of £60,000" this year', () => {
  const rows = f.targetRows({ today: TODAY, lines, targets, minimumMinor: 200000, associatePayMinor: 20000 });
  assert.equal(f.poundsWords(rows.month.paid), '£2,300');
  assert.equal(f.ofWords(rows.month.paid, rows.month.target), 'of £5,000');
  assert.equal(f.poundsWords(rows.year.paid), '£23,100');
  assert.equal(f.ofWords(rows.year.paid, rows.year.target), 'of £60,000');
});

test('Your targets: This month, This quarter (November to January) and This year, word for word', () => {
  const rows = f.targetRows({ today: TODAY, lines, targets, minimumMinor: 200000, associatePayMinor: 20000 });
  assert.deepEqual([rows.month.label, rows.month.figure, rows.month.detail, rows.month.minimum, rows.month.percentWords],
    ['This month', '£2,300 of £5,000', '6 working days left', 'Minimum £2,000, reached', '46%']);
  assert.deepEqual([rows.quarter.label, rows.quarter.figure, rows.quarter.percentWords], ['This quarter, November to January', '£2,300 of £15,000', '15%']);
  assert.deepEqual([rows.year.label, rows.year.figure, rows.year.percentWords], ['This year, from 1 May', '£23,100 of £60,000', '39%']);
});

test('Money, This month and This year: Paid, Due, Overdue and Not invoiced yet', () => {
  const m = f.moneyFigures({ period: 'month', today: TODAY, lines, invoices, versions });
  assert.deepEqual([m.paid, m.due, m.overdue, m.notInvoiced].map(f.poundsWords), ['£2,300', '£1,200', '£940', '£700']);
  const y = f.moneyFigures({ period: 'year', today: TODAY, lines, invoices, versions });
  assert.deepEqual([y.paid, y.due, y.overdue, y.notInvoiced].map(f.poundsWords), ['£23,100', '£1,200', '£940', '£12,200']);
  assert.equal(f.shareWords('month', TODAY), 'Share of income, November');
  assert.equal(f.shareWords('year', TODAY), 'Share of income, since 1 May');
  const sectors = f.sectorsFor({ figures: m, lines });
  assert.deepEqual(sectors.map((s) => s.sector), ['Business', 'Sport', 'Medicine', 'Personal']);
  assert.equal(sectors.reduce((a, s) => a + s.share, 0), 100);
  assert.equal(sectors.find((s) => s.sector === 'Sport').toCome, 70000);
});

test('the chart reads out every bar as M11 words it, and the year ends around £36,500', () => {
  const expected = f.expectedIncome({ today: TODAY, untilMonth: '2027-04', invoices, versions });
  const c = f.incomeChart({ today: TODAY, lines, expected, targets, minimumMinor: 200000 });
  const say = Object.fromEntries(c.bars.map((b) => [b.month, b.readout]));
  assert.equal(say['2026-05'], 'May, £3,200, target £5,000');
  assert.equal(say['2026-07'], 'July, £5,400, £2,400 over the target');
  assert.equal(say['2026-09'], 'September, £6,000, target £6,000');
  assert.equal(say['2026-11'], 'November so far, £2,300, £1,900 more projected, target £5,000');
  assert.equal(say['2026-12'], 'December, £3,400 projected, target £4,000');
  assert.equal(c.note, 'At this rate, the year ends around £36,500.');
  assert.equal(c.line.words, 'Minimum £2,000');
  assert.deepEqual(c.bars.filter((b) => b.reached).map((b) => b.month), ['2026-07', '2026-09']);
  assert.deepEqual(c.bars.filter((b) => b.belowMinimum).map((b) => b.month), ['2026-08', '2026-10']);
  assert.ok(c.scaleMax >= 600000);

  const running = f.incomeChart({ today: TODAY, lines, expected, targets, mode: 'running' });
  assert.equal(running.title, 'Income, running total');
  assert.equal(running.bars[0].readout, 'May, running total £3,200, target £5,000');
  assert.equal(running.line.words, 'Year target £60,000');

  const sport = f.incomeChart({ today: TODAY, lines, expected, targets, sector: 'Sport' });
  assert.equal(sport.bars[0].readout, 'May, £700');
  assert.equal(sport.note, 'Targets show with All income.');
  assert.ok(sport.bars.every((b) => b.target == null && !b.reached && !b.belowMinimum));
  assert.equal(sport.line, null);
});

test('a month that beat the target: "£900 over, with 6 working days left", 118%', () => {
  const more = f.incomeLines({ payments: [...payments, pay('2026-11-20', 3600, 'Business')], invoices });
  const rows = f.targetRows({ today: TODAY, lines: more, targets, minimumMinor: 200000 });
  assert.deepEqual([rows.month.figure, rows.month.detail, rows.month.minimum, rows.month.percentWords],
    ['£5,900 of £5,000', '£900 over, with 6 working days left', 'Minimum £2,000, reached', '118%']);
  assert.equal(f.ofWords(rows.month.paid, rows.month.target), 'of £5,000, £900 over');
});

// The cash flow: recurring outgoings of £1,810 a month (Fathom and Zoom split as invented here), with
// £1,160 still to go out in the rest of November, and one-off costs in December to March.
const out = (name, group, pounds, day, every = 'month') => ({ id: name, name, group_name: group, amount_minor: pounds * 100, every, starts_on: `2026-01-${day}`, ends_on: null });
const outgoings = [
  out('Your salary', 'Your pay', 1050, '28'), out('Maya Collins', 'Associates', 400, '01'), out('Accountant', 'Insurance and professional fees', 80, '05'),
  out('Insurance', 'Insurance and professional fees', 45, '06'), out('Supervision', 'Training and supervision', 80, '30'), out('Marketing', 'Marketing', 60, '10'),
  out('Kit', 'Software', 33, '03'), out('Hosting for the portal', 'Software', 20, '09'), out('Fathom', 'Software', 16, '24'),
  out('Google Workspace', 'Software', 14, '25'), out('Zoom', 'Software', 12, '02'),
  { id: 'o1', name: 'Team day venue', group_name: 'Travel', amount_minor: 85000, every: 'once', on_date: '2026-12-08' },
  { id: 'o2', name: 'Conference ticket', group_name: 'Training and supervision', amount_minor: 25000, every: 'once', on_date: '2027-01-14' },
  { id: 'o3', name: 'New laptop', group_name: 'Software', amount_minor: 147000, every: 'once', on_date: '2027-02-01' },
  { id: 'o4', name: 'Dividend', group_name: 'Your pay', amount_minor: 150000, every: 'once', on_date: '2027-03-01' },
];
const settings = { bank_balance_minor: 420000, bank_checked_at: '2026-11-23T08:00:00', tax_share_percent: 0, keep_above_minor: null };

test('the cash flow, 6 months: every row, Keep cash above £3,600, the lowest point and the Needs you line', () => {
  const cf = f.cashFlow({ today: TODAY, months: 6, settings, lines, outgoings, invoices, versions });
  assert.equal(cf.todayReadout, 'Today, £4,200');
  assert.deepEqual(cf.rows.map((r) => [r.label, r.in / 100, r.out / 100, r.cash / 100, r.belowWords]), [
    ['Rest of November', 1900, 1160, 4940, ''],
    ['December', 3400, 2660, 5680, ''],
    ['January', 2800, 2060, 6420, ''],
    ['February', 2100, 3280, 5240, ''],
    ['March', 1700, 3310, 3630, ''],
    ['April', 1500, 1810, 3320, 'Below £3,600'],
    ['May', 1500, 1810, 3010, 'Below £3,600'],
  ]);
  assert.equal(cf.rows[0].readout, 'End of November (so far), £4,940, in £1,900, out £1,160');
  assert.equal(cf.rows.at(-1).readout, 'End of May, £3,010, in £1,500, out £1,810');
  assert.equal(f.poundsWords(cf.goingOut), '£1,810');
  assert.equal(f.poundsWords(cf.keepAbove), '£3,600');
  assert.deepEqual([cf.endLabel, f.poundsWords(cf.end)], ['In 6 months', '£3,010']);
  assert.deepEqual([f.poundsWords(cf.lowest.cash), cf.lowest.words], ['£3,010', 'May']);
  assert.equal(cf.needsYou, 'Cash dips to £3,010 in May.');
  assert.equal(cf.todayShort, 'Cash dips in May');
  const list = f.outgoingRows({ outgoings, today: TODAY });
  assert.equal(list.rows.find((r) => r.group === 'Software').names, 'Kit, Hosting for the portal, Fathom, Google Workspace, Zoom');
  assert.equal(rateWords(list.rows.find((r) => r.group === 'Software').monthly, 'month'), '£95/month');
});

test('Today’s Finances line: this month against its target, low cash first, then overdue', () => {
  const cf = f.cashFlow({ today: TODAY, months: 6, settings, lines, outgoings, invoices, versions });
  const line = f.todayFinanceLine({ today: TODAY, lines, targets, cashShort: cf.todayShort, overdueCount: f.overdueCount(invoices, TODAY) });
  assert.equal(line.figure, 'November £2,300 of £5,000');
  assert.equal(line.urgent, 'Cash dips in May');
  assert.equal(line.aria, 'Finances. November £2,300 of £5,000. Cash dips in May.');
  const calm = f.todayFinanceLine({ today: TODAY, lines, targets, cashShort: null, overdueCount: f.overdueCount(invoices, TODAY) });
  assert.equal(calm.text, 'November £2,300 of £5,000 · 1 overdue');
  assert.equal(f.todayFinanceLine({ today: TODAY, lines, targets: [], overdueCount: 0 }).text, 'November £2,300');
});
