// src/lib/agreements/upfront.js: 5% off for settling up front (brief item 37; Tim, 25 Nov, 12:42).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as u from '../../src/lib/agreements/upfront.js';
import { blankTerms } from '../../src/lib/agreements/terms.js';

const sam = { ...blankTerms('sessions'), totalMinor: 1800000, discounts: [{ type: 'returning', percent: 15 }], settle: 'equal' };
const jo = { ...blankTerms('retainer'), retainer: { sessions: 'Up to 2 a month, 60 minutes each', feeMinor: 300000, invoice: 'monthly' } };

test('£15,300 up front is £14,535, saving £765', () => {
  assert.equal(u.upfrontTotal(1530000), 1453500);
  assert.equal(u.saving(1530000), 76500);
  assert.equal(u.upfrontLine(sam), 'Up front: £14,535, saving £765.');
  assert.equal(u.finalTotal(sam, 'upfront'), 1453500);
  assert.equal(u.finalTotal(sam, 'plan'), 1530000);
});

test('a retainer: 6 months up front at £3,000 is £17,100, saving £900', () => {
  assert.equal(u.sixUpFront(300000), 1710000);
  assert.equal(u.upfrontLine(jo), '6 months up front: £17,100, saving £900.');
  assert.deepEqual(u.choiceOptions(jo).map((o) => o.label), ['6 months up front, £17,100, 5% off', '£3,000/month']);
});

test('up front is first and chosen to start with; the offer switched off shows no choice; funded never', () => {
  const o = u.choiceOptions(sam, '6 monthly instalments of £2,550');
  assert.deepEqual(o.map((x) => x.value), ['upfront', 'plan']);
  assert.equal(o[0].label, 'Up front, £14,535, 5% off');
  assert.equal(u.upfrontActive(sam), true, 'no choice made yet means up front');
  assert.equal(u.canChoose({ ...sam, offerUpfront: false }), false);
  assert.equal(u.upfrontActive({ ...sam, offerUpfront: false }), false);
  assert.equal(u.canChoose({ ...sam, funder: 'org', fundedBy: 'Northfield' }), false);
  assert.equal(u.canChoose({ ...sam, settle: 'full' }), false, 'in full is up front already');
  assert.equal(u.upfrontActive({ ...sam, settle: 'full' }), true, 'in full with the offer on takes the 5%');
});
