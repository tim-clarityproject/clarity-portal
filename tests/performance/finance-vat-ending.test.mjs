// VAT's £90,000 threshold and ending an engagement early (Phase 6b run 2). Invented figures only.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as f from '../../src/lib/finance/index.js';

test('UK taxable income over the last 12 months: clients outside the UK left out unless the work was in person here', () => {
  const lines = f.incomeLines({ payments: [
    { id: 'uk', amount_minor: 2000000, currency: 'GBP', paid_at: '2026-03-01T10:00:00', profile_id: 'uk-person' },
    { id: 'us', amount_minor: 1000000, currency: 'USD', landed_gbp_minor: 800000, paid_at: '2026-04-01T10:00:00', profile_id: 'us-person' },
    { id: 'us-here', amount_minor: 500000, currency: 'GBP', paid_at: '2026-05-01T10:00:00', profile_id: 'us-person', in_person: true },
    { id: 'unknown', amount_minor: 680000, currency: 'GBP', paid_at: '2026-06-01T10:00:00', profile_id: 'unknown' },
    { id: 'old', amount_minor: 9000000, currency: 'GBP', paid_at: '2025-11-24T10:00:00', profile_id: 'uk-person' }, // a year ago today: outside
  ] });
  const country = { 'uk-person': 'GB', 'us-person': 'US' };
  const inPerson = new Set(['us-here']);
  const vat = f.ukTaxableIncome({ lines, today: '2026-11-24', countryOf: (l) => country[l.profile_id] || null, inPersonOf: (l) => inPerson.has(l.id) });
  assert.equal(vat.from, '2025-11-25');
  assert.deepEqual([vat.minor, vat.figure, vat.of, vat.over, vat.outsideUk], [3180000, '£31,800', 'of £90,000', false, 800000]);
  assert.equal(f.ukTaxableIncome({ lines, today: '2026-02-28' }).from, '2025-03-01');
  assert.equal(f.ukTaxableIncome({ lines, today: '2028-02-29' }).from, '2027-03-01');
});

test('ending early: the instalments left, and what each choice would do', () => {
  const planned = [{ n: 4, day: '2026-12-03', amount_minor: 100000 }, { n: 5, day: '2027-01-03', amount_minor: 100000 }, { n: 6, day: '2027-02-03', amount_minor: 100000 }];
  const invoices = [
    { id: 'sent-3', status: 'sent', total_minor: 100000, paid_minor: 0, due_on: '2026-11-17' },
    { id: 'paid-1', status: 'paid', total_minor: 100000, paid_minor: 100000, due_on: '2026-08-17' },
  ];
  const e = f.endEarly({ planned, invoices, endOn: '2026-11-24', noticeDays: 30, sessionsTotal: 12, sessionsHeld: 4, sessionsCountedAsUsed: 1, priceMinor: 600000, paidMinor: 200000 });
  assert.deepEqual(e.left.map((x) => [x.kind, x.amount]), [['invoice', 100000], ['instalment', 100000], ['instalment', 100000], ['instalment', 100000]]);
  assert.equal(e.leftTotal, 400000);
  assert.deepEqual(e.choices.cancel.cancel.map((x) => x.n), [4, 5, 6]);
  assert.deepEqual(e.choices.cancel.keep.map((x) => x.id), ['sent-3']);
  assert.deepEqual(e.choices.keep.keep.map((x) => x.id ?? x.n), ['sent-3', 4]); // within 30 days of the end
  assert.deepEqual(e.choices.keep.cancel.map((x) => x.n), [5, 6]);
  // 5 sessions used at £500 is £2,500; £2,000 settled and £1,000 already invoiced: nothing more is owed.
  assert.equal(e.choices.invoice.newInvoice, 0);
  assert.equal(e.refund.minor, 0);
});

test('ending early: the refund for sessions invested in and not used, less any counted as used', () => {
  const paidUp = f.endEarly({ endOn: '2026-11-24', sessionsTotal: 12, sessionsHeld: 4, sessionsCountedAsUsed: 1, priceMinor: 600000, paidMinor: 600000 });
  assert.deepEqual([paidUp.refund.minor, paidUp.refund.sessionsUnused, paidUp.refund.perSession], [350000, 7, 50000]);
  const owes = f.endEarly({ endOn: '2026-11-24', sessionsTotal: 12, sessionsHeld: 6, priceMinor: 600000, paidMinor: 200000 });
  assert.deepEqual([owes.choices.invoice.newInvoice, owes.refund.minor], [100000, 0]);
  const ongoing = f.endEarly({ endOn: '2026-11-24', sessionsTotal: null, priceMinor: 600000, paidMinor: 200000 });
  assert.deepEqual([ongoing.refund.minor, ongoing.choices.invoice.newInvoice], [0, 0]);
});
