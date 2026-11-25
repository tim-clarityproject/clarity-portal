// src/lib/agreements/pricing.js: totals, hourly, monthly, discounts as lines, visit days and extras (brief item 3; M28's C).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as p from '../../src/lib/agreements/pricing.js';
import { blankTerms } from '../../src/lib/agreements/terms.js';

const sam = { ...blankTerms('sessions'), priceMode: 'total', totalMinor: 1800000, discounts: [{ type: 'returning', percent: 15 }] };

test('1 × 90 then 15 × 60 is 16 coaching sessions, 16 hours 30 minutes', () => {
  assert.equal(p.sessions(sam), 16);
  assert.equal(p.minutes(sam), 990);
  assert.equal(p.sessionsSummary(sam), '16 coaching sessions, 16 hours 30 minutes in all.');
  assert.equal(p.blocksText(sam.blocks), '1 of 90 minutes, then 15 of 60 minutes');
  assert.equal(p.mixedLengths(sam), true);
});

test('by the hour at £750/hr is £12,375; monthly £3,000 × 6 is £18,000', () => {
  const hourly = { ...sam, priceMode: 'hourly', rateMinor: 75000, discounts: [] };
  assert.equal(p.base(hourly), 1237500);
  assert.equal(p.hourlyLine(hourly), '16 hours 30 minutes at £750/hr, so £12,375.');
  assert.equal(p.base({ ...sam, priceMode: 'monthly', monthlyMinor: 300000, months: 6 }), 1800000);
});

test('£18,000 less returning 15% is a line of −£2,700, so £15,300; a reduced fee is its own line', () => {
  assert.deepEqual(p.discountLines(sam), [{ label: 'Returning client, 15% off', amount: -270000 }]);
  assert.equal(p.planTotal(sam), 1530000);
  assert.equal(p.finLine(sam), 'In all: £15,300.');
  const two = { ...sam, discounts: [...sam.discounts, { type: 'reduced', amountMinor: 50000 }] };
  assert.deepEqual(p.discountLines(two).map((l) => l.label), ['Returning client, 15% off', 'Reduced fee, £500 off']);
  assert.equal(p.planTotal(two), 1480000);
});

test('2 visit days at £2,500 add £5,000; a ticked extra adds its price', () => {
  const v = { ...sam, discounts: [], visitDays: { n: 2, rateMinor: 250000 } };
  assert.equal(p.subtotal(v), 2300000);
  assert.equal(p.finLine(v), 'In all: £23,000, with the visit days.');
  const q = { ...sam, extrasOffered: [{ key: 'session', title: 'Extra coaching session', priceMinor: 75000 }, { key: 'visit', title: 'Visit day', priceMinor: 250000 }] };
  assert.equal(p.planTotal(q, ['visit']), 1780000, '£15,300 + a £2,500 visit day = £17,800');
  assert.deepEqual(p.extras(q, ['visit']).map((e) => e.chosen), [false, true]);
});
