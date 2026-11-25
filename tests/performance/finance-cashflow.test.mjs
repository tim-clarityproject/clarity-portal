// The cash flow (Phase 6b run 2, step 9): the forecast with and without likely deals, the tax pot, associate pay from
// bookings and from the 3-month average, yearly costs, and cash now from the bank balance. Invented figures only.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as f from '../../src/lib/finance/index.js';

const TODAY = '2026-11-24';
const base = { bank_balance_minor: 1000000, bank_checked_at: '2026-11-24T07:00:00', tax_share_percent: 0, keep_above_minor: 0 };
const row = (cf, label) => cf.rows.find((r) => r.label === label);

test('cash now: the balance as checked, plus payments in and less costs out since', () => {
  const lines = f.incomeLines({ payments: [
    { id: 'before', amount_minor: 50000, currency: 'GBP', paid_at: '2026-11-10T09:00:00' },
    { id: 'after', amount_minor: 30000, currency: 'GBP', paid_at: '2026-11-20T09:00:00' },
  ], creditNotes: [{ id: 'r', kind: 'refund', amount_minor: 10000, currency: 'GBP', created_at: '2026-11-21T09:00:00', invoice_id: null }] });
  const outgoings = [{ name: 'Software', group_name: 'Software', amount_minor: 2000, every: 'month', starts_on: '2026-01-18' }];
  const now = f.cashNow({ settings: { bank_balance_minor: 400000, bank_checked_at: '2026-11-15T12:00:00' }, today: TODAY, lines, outgoings,
    associatePayouts: [{ coach_id: 'c', month: '2026-10-01', amount_minor: 5000, paid_at: '2026-11-16T09:00:00' }] });
  assert.equal(now.cash, 400000 + 30000 - 10000 - 2000 - 5000);
  assert.equal(f.bankCheckDue({ settings: { bank_checked_at: '2026-10-30T12:00:00' }, today: TODAY }), true);
  assert.equal(f.bankCheckDue({ settings: { bank_checked_at: '2026-11-02T12:00:00' }, today: TODAY }), false);
  assert.equal(f.bankCheckDue({ settings: {}, today: TODAY }), true);
});

test('3, 6 or 12 months ahead, from the rest of this month', () => {
  for (const months of [3, 6, 12]) {
    const cf = f.cashFlow({ today: TODAY, months, settings: base });
    assert.equal(cf.rows.length, months + 1);
    assert.equal(cf.rows[0].label, 'Rest of November');
    assert.equal(cf.endLabel, `In ${months} months`);
  }
  assert.equal(f.cashFlow({ today: TODAY, months: 12, settings: base }).rows.at(-1).label, 'November');
  assert.throws(() => f.cashFlow({ today: TODAY, months: 9, settings: base }));
});

test('likely deals only with the switch on, each at its stage’s chance', () => {
  const leads = [
    { value_minor: 1000000, likelihood: 50, expected_on: '2027-01-20' },
    { value_minor: 300000, likelihood: 40, expected_on: null }, // £1,200 over the next 3 months
    { value_minor: 900000, likelihood: 100 }, // won: a client with an agreement now
    { value_minor: 900000, likelihood: 0 },
  ];
  const off = f.cashFlow({ today: TODAY, months: 6, settings: base, leads });
  const on = f.cashFlow({ today: TODAY, months: 6, settings: base, leads, includeLikely: true });
  assert.ok(off.rows.every((r) => r.in === 0));
  assert.deepEqual(on.rows.map((r) => r.in), [0, 40000, 500000 + 40000, 40000, 0, 0, 0]);
  assert.equal(on.end - off.end, 620000);
});

test('the tax pot grows at the share of each month’s profit, never below nothing, and pays out on tax dates', () => {
  const invoices = [
    { id: 'd', status: 'sent', total_minor: 400000, paid_minor: 0, currency: 'GBP', due_on: '2026-12-10' },
    { id: 'j', status: 'draft', total_minor: 100000, paid_minor: 0, currency: 'GBP', due_on: '2027-01-10' },
  ];
  const outgoings = [{ name: 'Salary', group_name: 'Your pay', amount_minor: 200000, every: 'month', starts_on: '2026-01-28' }];
  const deadlines = [
    { name: 'Corporation tax', due_on: '2027-02-01', every: 'year', amount_minor: null }, // no amount: the pot is paid
    { name: 'Confirmation statement', kind: 'confirmation_statement', due_on: '2027-03-14', every: 'year', amount_minor: 5000 }, // an ordinary cost
  ];
  // The pot so far is worked out from 1 May: May's £3,200 in less £2,000 salary sets aside £300; every month since lost money.
  const lines = f.incomeLines({ payments: [{ id: 'may', amount_minor: 320000, currency: 'GBP', paid_at: '2026-05-10T09:00:00' }] });
  const cf = f.cashFlow({ today: TODAY, months: 6, settings: { ...base, tax_share_percent: 25 }, lines, invoices, outgoings, deadlines });
  assert.equal(cf.taxPotNow, 30000);
  const pots = Object.fromEntries(cf.rows.map((r) => [r.label, r.taxPot]));
  // November: no money in, £2,000 out (a loss adds nothing). December: £4,000 in less £2,000 out → £500 set aside.
  // January: £1,000 less £2,000 → nothing. February: Corporation tax pays the whole pot (£300 + £500).
  assert.deepEqual([pots['Rest of November'], pots.December, pots.January, pots.February], [30000, 80000, 80000, 0]);
  assert.equal(row(cf, 'February').out, 200000 + 80000);
  assert.equal(row(cf, 'March').out, 200000 + 5000);
  assert.equal(row(cf, 'December').spendable, row(cf, 'December').cash - 80000);
});

test('associate pay goes out the month after: from booked sessions, else the 3-month average', () => {
  const s = (at, minutes, outcome = 'held') => ({ coach_id: 'maya', starts_at: at, minutes, outcome });
  const sessions = [
    // August to October, 10, 20 and 30 hours delivered: an average of 20 hours, £2,000 at £100/hr.
    ...Array.from({ length: 10 }, (_, i) => s(`2026-08-${String(i + 3).padStart(2, '0')}T09:00:00`, 60)),
    ...Array.from({ length: 20 }, (_, i) => s(`2026-09-${String(i + 1).padStart(2, '0')}T09:00:00`, 60)),
    ...Array.from({ length: 30 }, (_, i) => s(`2026-10-${String(i + 1).padStart(2, '0')}T09:00:00`, 60)),
    // November: 12 hours held, 1 late cancellation, 1 no-show, 1 cancelled, and 2 hours still booked.
    ...Array.from({ length: 12 }, (_, i) => s(`2026-11-${String(i + 2).padStart(2, '0')}T09:00:00`, 60)),
    s('2026-11-16T09:00:00', 60, 'late_cancel'), s('2026-11-17T09:00:00', 60, 'no_show'), s('2026-11-18T09:00:00', 60, 'cancelled'),
    s('2026-11-26T09:00:00', 60, null), s('2026-11-27T09:00:00', 60, null),
    // December: 5 hours booked.
    ...Array.from({ length: 5 }, (_, i) => s(`2026-12-0${i + 1}T09:00:00`, 60, null)),
  ];
  const associates = [{ coach_id: 'maya', name: 'Maya Example', hourly_rate_minor: 10000 }];
  const cf = f.cashFlow({ today: TODAY, months: 3, settings: base, associates, sessions,
    associatePayouts: [{ coach_id: 'maya', month: '2026-10-01', amount_minor: 300000, paid_at: '2026-11-02T09:00:00' }] });
  const pay = (label) => row(cf, label).items.filter((i) => i.kind === 'associate').map((i) => [i.forMonth, i.amount, i.from]);
  assert.deepEqual(pay('Rest of November'), []); // October's is marked as paid
  assert.deepEqual(pay('December'), [['2026-11', 150000, 'booked']]); // 12 held + 1 late cancellation + 2 booked
  assert.deepEqual(pay('January'), [['2026-12', 50000, 'booked']]);
  assert.deepEqual(pay('February'), [['2027-01', 200000, 'average']]);
  assert.equal(cf.goingOut, 200000); // the list's Associates line is the 3-month average
  const withNoShows = f.cashFlow({ today: TODAY, months: 3, settings: { ...base, no_shows_paid: true }, associates, sessions,
    associatePayouts: [{ coach_id: 'maya', month: '2026-10-01', amount_minor: 300000, paid_at: '2026-11-02T09:00:00' }] });
  assert.equal(row(withNoShows, 'December').items.find((i) => i.kind === 'associate').amount, 160000);
});

test('a yearly cost goes out in the month it’s paid; the list shows its monthly average', () => {
  const outgoings = [
    { name: 'Insurance', group_name: 'Insurance and professional fees', amount_minor: 120000, every: 'year', starts_on: '2025-02-15' },
    { name: 'Accountant', group_name: 'Insurance and professional fees', amount_minor: 30000, every: 'quarter', starts_on: '2026-10-31' },
    { name: 'Old tool', group_name: 'Software', amount_minor: 5000, every: 'month', starts_on: '2025-01-01', ends_on: '2026-10-31' },
  ];
  const cf = f.cashFlow({ today: TODAY, months: 6, settings: base, outgoings });
  assert.deepEqual(cf.rows.map((r) => r.out), [0, 0, 30000, 120000, 0, 30000, 0]);
  assert.deepEqual(f.occurrences(outgoings[1], '2026-11-01', '2027-08-31'), ['2027-01-31', '2027-04-30', '2027-07-31']);
  const list = f.outgoingRows({ outgoings, today: TODAY });
  assert.deepEqual(list.rows.map((r) => [r.group, r.names, r.monthly]), [['Insurance and professional fees', 'Insurance, Accountant', 20000]]);
  assert.equal(f.keepAboveDefault(181000), 360000);
});

test('low cash: the Needs you line, Today’s short note, and none when cash stays above the level', () => {
  const outgoings = [{ name: 'Salary', group_name: 'Your pay', amount_minor: 300000, every: 'month', starts_on: '2026-01-28' }];
  const cf = f.cashFlow({ today: TODAY, months: 6, settings: { ...base, keep_above_minor: 200000 }, outgoings });
  assert.equal(cf.needsYou, 'Cash dips to −£11,000 in May.');
  const calm = f.cashFlow({ today: TODAY, months: 3, settings: { ...base, bank_balance_minor: 5000000, keep_above_minor: 200000 }, outgoings });
  assert.equal(calm.needsYou, null);
  assert.equal(calm.todayShort, null);
  const dip = f.cashFlow({ today: TODAY, months: 3, settings: { ...base, bank_balance_minor: 1000000, keep_above_minor: 360000 },
    outgoings: [{ name: 'Salary', group_name: 'Your pay', amount_minor: 280000, every: 'month', starts_on: '2026-01-28' }],
    repeating: [{ name: 'Seats', amount_minor: 100000, per: 'month' }] });
  assert.equal(dip.needsYou, 'Cash dips to £1,800 in February.');
  assert.equal(dip.todayShort, 'Cash dips in February');
});
