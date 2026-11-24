// Associates' hours and pay (Phase 6b run 2, step 5): held hours and late cancellations count as delivered, no-shows
// only at Tim's choice, the statement's lines, and the 3-month average. Invented names and figures only.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as f from '../../src/lib/finance/index.js';

const s = (day, minutes, outcome, coach = 'assoc-1') => ({ coach_id: coach, starts_at: `${day}T10:00:00`, minutes, outcome });
const november = [
  ...Array.from({ length: 21 }, (_, i) => s(`2026-11-${String(i + 2).padStart(2, '0')}`, 60, 'held')),
  s('2026-11-25', 60, 'late_cancel'),
  s('2026-11-26', 60, 'no_show'),
  s('2026-11-27', 60, 'cancelled'),
  s('2026-11-12', 120, 'held', 'someone-else'),
  s('2026-12-01', 60, 'held'),
];

test('22 hours at £100: held plus late cancellations, never cancelled, no-shows only when Tim chooses', () => {
  const m = f.associateMonth({ coachId: 'assoc-1', rateMinor: 10000, sessions: november, month: '2026-11' });
  assert.deepEqual([m.minutes, m.payMinor, m.lateCancels, m.noShows, m.words], [22 * 60, 220000, 1, 0, '22 hours at £100']);
  const paidNoShows = f.associateMonth({ coachId: 'assoc-1', rateMinor: 10000, sessions: november, month: '2026-11', noShowsPaid: true });
  assert.deepEqual([paidNoShows.minutes, paidNoShows.payMinor, paidNoShows.noShows], [23 * 60, 230000, 1]);
  assert.equal(f.countsAsDelivered('cancelled', true), false);
  assert.equal(f.countsAsDelivered(null), false);
  const half = f.associateMonth({ coachId: 'assoc-1', rateMinor: 9000, sessions: [s('2026-11-03', 45, 'held')], month: '2026-11' });
  assert.deepEqual([half.payMinor, half.words], [6750, '45 minutes at £90']);
});

test('the statement and the figures’ words', () => {
  const m = f.associateMonth({ coachId: 'assoc-1', rateMinor: 10000, sessions: november, month: '2026-11' });
  assert.deepEqual(f.statementLines({ month: m }).map((l) => [l.label, l.detail, l.value]), [
    ['Coaching hours', '22 hours at £100', '£2,200'],
    ['Late cancellations that count', 'Paid as delivered', 'Included'],
  ]);
  assert.equal(f.statementLines({ month: m, noShowsPaid: true }).length, 3);
  assert.deepEqual(f.payLabels('2026-11'), { hours: 'Coaching hours in November', owed: 'Pay owed for November', pay: 'Pay for November', download: 'Download my November statement' });
  assert.equal(f.associateSummary({ clients: 5, rateMinor: 10000 }), 'Associate, 5 clients, £100/hr');
  assert.equal(f.payReminderDue('2026-11-30'), true);
  assert.equal(f.payReminderDue('2026-11-29'), false);
});

test('the 3-month average, and what is expected from bookings', () => {
  const sessions = [
    ...Array.from({ length: 6 }, (_, i) => s(`2026-08-0${i + 1}`, 60, 'held')),
    ...Array.from({ length: 9 }, (_, i) => s(`2026-09-0${i + 1}`, 60, 'held')),
    s('2026-10-05', 60, 'held'),
    s('2026-12-03', 90, null),
  ];
  assert.equal(f.threeMonthAverage({ coachId: 'assoc-1', rateMinor: 10000, sessions, month: '2026-11' }), Math.round((60000 + 90000 + 10000) / 3));
  assert.deepEqual(f.expectedPay({ coachId: 'assoc-1', rateMinor: 10000, sessions, month: '2026-12', fromMonth: '2026-11' }), { month: '2026-12', payMinor: 15000, from: 'booked' });
  assert.deepEqual(f.expectedPay({ coachId: 'assoc-1', rateMinor: 10000, sessions, month: '2027-01', fromMonth: '2026-11' }), { month: '2027-01', payMinor: 53333, from: 'average' });
});

test('what their clients paid: only the associate’s own clients, in pounds', () => {
  const lines = f.incomeLines({ payments: [
    { id: '1', amount_minor: 200000, currency: 'GBP', paid_at: '2026-11-03T10:00:00', profile_id: 'client-a' },
    { id: '2', amount_minor: 216000, currency: 'USD', landed_gbp_minor: 170000, paid_at: '2026-11-04T10:00:00', profile_id: 'client-b' },
    { id: '3', amount_minor: 900000, currency: 'GBP', paid_at: '2026-11-05T10:00:00', profile_id: 'tims-own-client' },
  ] });
  assert.equal(f.clientsPaid({ lines, profileIds: ['client-a', 'client-b'], months: ['2026-11'] }), 370000);
});
