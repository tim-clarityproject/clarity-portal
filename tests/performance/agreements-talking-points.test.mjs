// src/lib/agreements/talkingPoints.js: M28's What to say, word for word, and a coach's own (brief item 41).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as tp from '../../src/lib/agreements/talkingPoints.js';

test('the five moments, in M28’s order and titles', () => {
  assert.deepEqual(tp.MOMENTS.map((m) => tp.MOMENT_TITLES[m]), ['Raising your price', 'Renewing', 'Extra work', 'Ending well', 'Testimonials and referrals']);
});

test('“From January, my fee for your coaching is £3,300 a month.”', () => {
  const p = tp.fill('price', { price: 330000, from: '2027-01-04' });
  assert.equal(p.lines[0], '“From January, my fee for your coaching is £3,300 a month.”');
  assert.equal(p.tip, 'Say the price first, give one reason, then stop and let them respond. Don’t apologise or explain further.');
  assert.equal(tp.fill('extra', { rate: 75000 }).lines[1], '“I can do it as an extra coaching session, at £750 an hour. Shall I send that over?”');
  assert.equal(tp.fill('renew').lines[2], '“Most people settle the six months up front, which saves 5%. I’ll send it over today.”');
});

test('a coach’s own points replace the defaults', () => {
  const p = tp.pointsFor('ending', [{ moment: 'ending', lines: ['Mine.'], tip: 'My tip.' }]);
  assert.deepEqual([p.lines, p.tip, p.own], [['Mine.'], 'My tip.', true]);
});
