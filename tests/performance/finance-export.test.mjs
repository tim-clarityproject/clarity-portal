// The year-end export (Phase 6b run 2, steps 7 and 9): every payment, refund and cost in the financial year, its
// totals matching the Finances figures for the same year, and CSV written by RFC 4180 with formulas neutralised.
// Invented names and figures only.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as f from '../../src/lib/finance/index.js';

const invoices = [
  { id: 'inv-1', number: 1201, sector: 'Business', organisation_id: 'org-1', lines: [{ description: 'Team workshop, instalment 1 of 2', amount: 300000 }] },
  { id: 'inv-2', number: 1202, sector: 'Sport', profile_id: 'person-1', lines: [{ description: 'Season coaching', amount: 200000 }] },
];
const payments = [
  { id: 'p1', amount_minor: 300000, currency: 'GBP', paid_at: '2026-05-01T00:30:00', invoice_id: 'inv-1', fee_minor: 4500 }, // 01:30 BST on 1 May: this year
  { id: 'p0', amount_minor: 99900, currency: 'GBP', paid_at: '2026-04-30T22:30:00', invoice_id: 'inv-1' }, // 23:30 BST on 30 Apr: last year
  { id: 'p2', amount_minor: 254000, currency: 'USD', landed_gbp_minor: 200000, paid_at: '2026-09-03T15:00:00', invoice_id: 'inv-2' },
  { id: 'p3', amount_minor: 50000, currency: 'USD', landed_gbp_minor: null, paid_at: '2026-10-03T15:00:00', invoice_id: 'inv-2' },
  { id: 'p4', amount_minor: 45000, currency: 'GBP', paid_at: '2026-11-03T15:00:00', added_by_coach: true, profile_id: 'person-2', sector: 'Personal' },
];
const creditNotes = [{ id: 'cn', kind: 'refund', amount_minor: 63500, currency: 'USD', created_at: '2026-11-10T10:00:00', invoice_id: 'inv-2', number: 'CLARITY-CN-0002' }];
const outgoings = [
  { name: 'Zoom', group_name: 'Software', amount_minor: 1300, every: 'month', starts_on: '2026-01-02', receipt_name: 'zoom.pdf' },
  { name: 'Conference ticket', group_name: 'Training and supervision', amount_minor: 45000, every: 'once', on_date: '2026-06-14' },
  { name: 'Insurance', group_name: 'Insurance and professional fees', amount_minor: 60000, every: 'year', starts_on: '2026-02-01' },
];
const people = { 'person-1': { name: 'Jo Invented', country: 'US' }, 'person-2': { name: '=HYPERLINK("http://example.test")', country: 'GB' } };
const organisations = { 'org-1': { name: 'Example Holdings, Ltd', country: 'GB' } };

test('the export’s income total is the Finances figure for the same year, refunds taken off and dollars at the landed rate', () => {
  const lines = f.incomeLines({ payments, creditNotes, invoices });
  const exp = f.yearExport({ yearLabel: 2026, today: '2026-11-24', lines, invoices, outgoings, people, organisations, receipts: { p4: 'bank-slip.jpg' },
    deadlines: [{ name: 'Confirmation statement', due_on: '2026-10-14', every: 'year', amount_minor: 3400 }],
    associatePayouts: [{ name: 'Associate Example', amount_minor: 220000, paid_at: '2026-11-02T09:00:00' }] });
  const finances = f.moneyFigures({ period: 'year', today: '2026-11-24', lines });
  assert.equal(exp.totals.income, finances.paid);
  assert.equal(exp.totals.income, 300000 + 200000 + 45000 - 50000);
  const money = exp.rows.filter((r) => r[1] !== 'Cost');
  assert.equal(Math.round(money.reduce((a, r) => a + (r[9] ?? 0), 0) * 100), exp.totals.income);
  assert.deepEqual([exp.totals.payments, exp.totals.refunds, exp.totals.notInPounds], [4, 1, 1]);
  // Costs to today: Zoom May to November (7), the ticket, nothing for Insurance (next due February), the deadline and the associate.
  assert.equal(exp.totals.costs, 7 * 1300 + 45000 + 3400 + 220000);
  assert.equal(Math.round(-exp.rows.filter((r) => r[1] === 'Cost').reduce((a, r) => a + r[9], 0) * 100), exp.totals.costs);
  const usd = exp.rows.find((r) => r[5] === 'CLARITY-1202' && r[1] === 'Payment' && r[9] === 2000);
  assert.deepEqual([usd[2], usd[3], usd[7], usd[8], usd[10]], ['Jo Invented', 'US', 2540, 'USD', 1.27]);
  assert.equal(exp.rows.find((r) => r[1] === 'Refund')[4], 'Refund, CLARITY-CN-0002');
  assert.equal(exp.rows.find((r) => r[2] === 'Zoom')[12], 'zoom.pdf');
  assert.equal(exp.rows.find((r) => r[12] === 'bank-slip.jpg')[4], 'Paid to your bank');
  assert.ok(exp.rows.every((r, i) => i === 0 || exp.rows[i - 1][0] <= r[0]));
  assert.equal(exp.rows[0][0], '2026-05-01');
  assert.equal(f.exportFileName(exp), 'finances-2026-to-2027.csv');
  assert.equal(f.exportFileName(exp, 'excel'), 'finances-2026-to-2027.xlsx');
  const sheets = f.yearExportSheets(exp);
  assert.deepEqual(sheets.map((s) => s.name), ['Money in and out', 'Totals']);
  assert.equal(sheets[1].rows[0][1], exp.totals.income / 100);
});

test('CSV: RFC 4180 quoting, CRLF lines, and a cell starting with = + - @ gets an apostrophe (numbers stay numbers)', () => {
  assert.equal(f.csvCell('Example Holdings, Ltd'), '"Example Holdings, Ltd"');
  assert.equal(f.csvCell('She said "yes"'), '"She said ""yes"""');
  assert.equal(f.csvCell('two\nlines'), '"two\nlines"');
  assert.equal(f.csvCell('=HYPERLINK("http://example.test")'), '"\'=HYPERLINK(""http://example.test"")"');
  for (const bad of ['+44 20', '-2+3', '@SUM(A1)', '\tx']) assert.equal(f.csvCell(bad)[0] === '"' ? f.csvCell(bad)[1] : f.csvCell(bad)[0], "'");
  assert.equal(f.csvCell(-450.5), '-450.5');
  assert.equal(f.csvCell(null), '');
  assert.equal(f.toCsv([['a', 'b'], [1, 'c,d']]), 'a,b\r\n1,"c,d"\r\n');
  const lines = f.incomeLines({ payments, creditNotes, invoices });
  const csv = f.yearExportCsv(f.yearExport({ yearLabel: 2026, today: '2026-11-24', lines, invoices, people, organisations }));
  const back = f.parseCsv(csv);
  assert.deepEqual(back[0], [...f.EXPORT_COLUMNS]);
  assert.ok(back.some((r) => r[2] === "'=HYPERLINK(\"http://example.test\")"));
  assert.ok(back.some((r) => r[2] === 'Example Holdings, Ltd'));
  assert.deepEqual(f.parseCsv('\uFEFFa,"b ""c""",\r\n\r\n1,2,3'), [['a', 'b "c"', ''], ['1', '2', '3']]);
});
