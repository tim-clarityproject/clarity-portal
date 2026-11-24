// Money for coaching (Phase 6b run 1): Tim's money rules as src/lib/billing/money.js keeps them.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as m from '../../src/lib/billing/money.js';

test('amounts and rates: £18,000, £3,000.50, $1,250, and rates with no spaces (£750/hr, £860/month)', () => {
  assert.equal(m.moneyWords(1800000), '£18,000');
  assert.equal(m.moneyWords(300050), '£3,000.50');
  assert.equal(m.moneyWords(125000, 'USD'), '$1,250');
  assert.equal(m.moneyWords(-45000), '−£450');
  assert.equal(m.rateWords(75000, 'hour'), '£750/hr');
  assert.equal(m.rateWords(86000, 'month'), '£860/month');
  assert.equal(m.rateWords(20000, 'session', 'USD'), '$200/session');
  assert.throws(() => m.moneyWords(100, 'EUR'));
  assert.throws(() => m.rateWords(100, 'week'));
});

test('invoice numbers: CLARITY- from 1201, in order, never reused or going back', () => {
  assert.equal(m.invoiceNumber(1201), 'CLARITY-1201');
  assert.throws(() => m.invoiceNumber(1200));
  assert.equal(m.invoiceNumberOf('CLARITY-1243'), 1243);
  assert.equal(m.invoiceNumberOf('CLARITY-0156'), null);
  assert.equal(m.invoiceNumberOf('INV-1243'), null);
  assert.ok(m.numbersInOrder(['CLARITY-1201', 'CLARITY-1202', 'CLARITY-1205']), 'a gap from a voided draft is fine');
  assert.ok(!m.numbersInOrder(['CLARITY-1201', 'CLARITY-1201']), 'never one used twice');
  assert.ok(!m.numbersInOrder(['CLARITY-1203', 'CLARITY-1202']), 'never going back');
});

test('terms: 14 days for a person, 30 for an organisation, changeable on any invoice', () => {
  assert.equal(m.termsDays({}), 14);
  assert.equal(m.termsDays({ fundedBy: 'Northfield Logistics' }), 30);
  assert.equal(m.termsDays({ fundedBy: 'Northfield Logistics', override: 45 }), 45);
  assert.throws(() => m.termsDays({ override: 0 }));
  assert.equal(m.dueDay('2026-11-24', 14), '2026-12-08');
  assert.equal(m.dueDay('2026-12-20', 30), '2027-01-19');
});

test('instalments add up exactly, monthly on the same day, the month\'s last day when shorter', () => {
  const six = m.instalments({ total: 1800000, count: 6, firstDay: '2027-01-04' });
  assert.deepEqual(six.map((x) => x.amount), [300000, 300000, 300000, 300000, 300000, 300000]);
  assert.deepEqual(six.map((x) => x.day), ['2027-01-04', '2027-02-04', '2027-03-04', '2027-04-04', '2027-05-04', '2027-06-04']);
  const odd = m.instalments({ total: 100000, count: 3, firstDay: '2027-01-31' });
  assert.equal(odd.reduce((n, x) => n + x.amount, 0), 100000);
  assert.deepEqual(odd.map((x) => x.amount), [33334, 33333, 33333]);
  assert.deepEqual(odd.map((x) => x.day), ['2027-01-31', '2027-02-28', '2027-03-31']);
  assert.deepEqual(m.instalments({ total: 500, count: 1, firstDay: '2026-12-31' }), [{ n: 1, day: '2026-12-31', amount: 500 }]);
  assert.deepEqual(m.instalments({ total: 1200, count: 2, firstDay: '2026-11-30' }).map((x) => x.day), ['2026-11-30', '2026-12-30']);
  assert.throws(() => m.instalments({ total: 0, count: 2, firstDay: '2027-01-01' }));
});

test('a discount is its own named line under the full price, never a cheaper price', () => {
  const f = m.feeLines({ full: 1800000, discounts: [{ name: 'Returning client, 15% off', percent: 15 }] });
  assert.deepEqual(f, { full: 1800000, lines: [{ name: 'Returning client, 15% off', amount: -270000 }], total: 1530000 });
  const two = m.feeLines({ full: 100000, discounts: [{ name: 'Charity rate', amount: 30000 }, { name: 'All of it', percent: 100 }] });
  assert.equal(two.total, 0, 'never below zero');
  assert.equal(two.lines[1].amount, -70000);
  assert.throws(() => m.feeLines({ full: 1000, discounts: [{ name: '', percent: 10 }] }));
});

test('an agreement in dollars keeps the rate and its moment, and its amounts are fixed in dollars', () => {
  const d = m.fixedInDollars({ pounds: 1800000, rate: 1.2734, rateAt: '2026-11-24T10:15:00Z' });
  assert.deepEqual([d.currency, d.amount, d.rateAt], ['USD', 2292120, '2026-11-24T10:15:00.000Z']);
  assert.equal(d.words, '$22,921.20, at $1.2734 to the pound');
  assert.throws(() => m.fixedInDollars({ pounds: 1000, rate: 0, rateAt: '2026-11-24T10:15:00Z' }));
});

test('reminders at 3, 7 and 14 days overdue, on the payer\'s own clock, across the clock change, never twice', () => {
  // Due Mon 16 Nov: 3 days overdue on Thu 19 Nov in London, whatever the hour.
  assert.equal(m.reminderDue({ dueKey: '2026-11-16', now: '2026-11-19T00:30:00Z', zone: 'Europe/London' }), 3);
  assert.equal(m.reminderDue({ dueKey: '2026-11-16', now: '2026-11-18T23:30:00Z', zone: 'Europe/London' }), null);
  // In Los Angeles it is still the 18th at that moment.
  assert.equal(m.reminderDue({ dueKey: '2026-11-16', now: '2026-11-19T06:30:00Z', zone: 'America/Los_Angeles' }), null);
  // Across the US clock change (1 Nov 2026): due Fri 30 Oct, 3 days on Mon 2 Nov there.
  assert.equal(m.reminderDue({ dueKey: '2026-10-30', now: '2026-11-02T08:30:00Z', zone: 'America/New_York' }), 3);
  assert.equal(m.reminderDue({ dueKey: '2026-11-16', now: '2026-11-23T12:00:00Z', zone: 'Europe/London', drafted: [3] }), 7);
  assert.equal(m.reminderDue({ dueKey: '2026-11-16', now: '2026-11-23T12:00:00Z', zone: 'Europe/London', drafted: [3, 7] }), null);
  assert.equal(m.reminderDue({ dueKey: '2026-11-16', now: '2026-12-01T12:00:00Z', zone: 'Europe/London', drafted: [3] }), 14, 'the newest one due, never an older one as well');
  assert.equal(m.reminderDue({ dueKey: '2026-11-16', now: '2026-12-01T12:00:00Z', zone: 'Europe/London', paid: true }), null);
  assert.equal(m.reminderDue({ dueKey: '2026-11-16', now: '2026-12-01T12:00:00Z', zone: 'Europe/London', paused: true }), null);
});

test('the settle-by day is 7 days after the 14-day email goes, on the payer\'s clock', () => {
  assert.deepEqual(m.settleBy('2026-11-27T09:00:00Z', 'Europe/London'), { day: '2026-12-04', words: 'Fri 4 Dec' });
  // Sent late on Fri 27 Nov in Los Angeles (already the 28th in UTC): Fri 4 Dec there.
  assert.equal(m.settleBy('2026-11-28T06:00:00Z', 'America/Los_Angeles').day, '2026-12-04');
});

test('money is never shown to an organisation-funded client who isn\'t the sponsor', () => {
  assert.equal(m.seesMoney({ fundedBy: 'Larkfield Health', viewer: 'client' }), false);
  assert.equal(m.seesMoney({ fundedBy: null, viewer: 'client' }), true);
  assert.equal(m.seesMoney({ fundedBy: 'Larkfield Health', viewer: 'sponsor' }), true);
  assert.equal(m.seesMoney({ fundedBy: 'Larkfield Health', viewer: 'finance' }), true);
  assert.equal(m.seesMoney({ fundedBy: 'Larkfield Health', viewer: 'coach' }), true);
});

test('a refund counts against the month it was refunded, on the coach\'s clock', () => {
  assert.equal(m.refundMonth('2026-12-01T00:30:00Z', 'Europe/London'), '2026-12');
  assert.equal(m.refundMonth('2026-12-01T00:30:00Z', 'America/New_York'), '2026-11');
});

test('Main points\' Dates: the two days, or Ongoing, with a yearly price review', () => {
  assert.equal(m.datesWords({ startsOn: '2027-01-04', endsOn: '2027-07-02' }), 'Mon 4 Jan 2027 to Fri 2 Jul 2027');
  assert.equal(m.datesWords({ ongoing: true }), 'Ongoing, with a yearly price review');
});
