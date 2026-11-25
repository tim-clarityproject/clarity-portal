// src/lib/agreements/coolingOff.js: the 14-day right to cancel (brief items 11 to 14).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as c from '../../src/lib/agreements/coolingOff.js';
import { blankTerms } from '../../src/lib/agreements/terms.js';

test('a deposit of £4,600 with start-now ticked and one £956.25 session had: £3,643.75 back', () => {
  assert.equal(c.refund14({ paidMinor: 460000, sessionsHad: 1, perSessionMinor: 95625, startNow: true }), 364375);
  assert.equal(c.refund14({ paidMinor: 460000, sessionsHad: 1, perSessionMinor: 95625, startNow: false }), 460000, 'not ticked: in full');
  assert.equal(c.refund14({ paidMinor: 50000, sessionsHad: 2, perSessionMinor: 95625, startNow: true }), 0);
});

test('offered for a self-funded individual inside the 14 days only', () => {
  const t = blankTerms('sessions');
  assert.equal(c.offered({ terms: t, signedDay: '2026-11-25', today: '2026-12-09' }), true, 'day 14');
  assert.equal(c.offered({ terms: t, signedDay: '2026-11-25', today: '2026-12-10' }), false, 'day 15');
  assert.equal(c.offered({ terms: { ...t, funder: 'org', fundedBy: 'Northfield' }, signedDay: '2026-11-25', today: '2026-11-26' }), false, 'funded');
  assert.equal(c.offered({ terms: blankTerms('team'), signedDay: '2026-11-25', today: '2026-11-26' }), false, 'a team');
  assert.equal(c.applies(blankTerms('oneoff')), true, 'one-offs and retainers too (risk 18)');
});

test('bookable from the day after the 14 days, or at once with the tick (the database’s rule too)', () => {
  assert.equal(c.windowEnds('2026-11-25'), '2026-12-09');
  assert.equal(c.bookableFrom('2026-11-25'), '2026-12-10');
  assert.equal(c.bookableFrom('2026-11-25', true), '2026-11-25');
  assert.equal(c.tooSoonLine('Sam', '2026-11-25'), 'That’s inside Sam’s 14 days to change their mind. Book it from Thu 10 Dec.');
  assert.equal(c.SETTLE_LINE, 'You can still change your mind within 14 days.');
});
