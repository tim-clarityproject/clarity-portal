// src/lib/agreements/renewals.js: the next 6 months and the yearly price review (brief items 38 to 41).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as r from '../../src/lib/agreements/renewals.js';
import { blankTerms } from '../../src/lib/agreements/terms.js';

test('ends Fri 12 Feb 2027: offered from Tue 12 Jan 2027', () => {
  assert.equal(r.renewalDue('2027-02-12'), '2027-01-12');
  assert.equal(r.renewalShows('2027-02-12', '2027-01-11'), false);
  assert.equal(r.renewalShows('2027-02-12', '2027-01-12'), true);
  assert.equal(r.renewalLine('2027-02-12'), 'These 6 months end Fri 12 Feb, a month from now');
  assert.equal(r.termEnds('2027-01-04'), '2027-07-03');
});

test('£3,000 since Mon 4 Jan 2026: review due Mon 4 Jan 2027, shown from Mon 23 Nov 2026', () => {
  assert.equal(r.priceReviewDue('2026-01-04'), '2027-01-04');
  assert.equal(r.priceReviewShows('2027-01-04'), '2026-11-23');
  assert.equal(r.priceLine(300000, 330000, '2026-11-25', '2027-01-04'), 'Up 10%, with 40 days’ notice.');
  assert.equal(r.monthName('2027-01-04'), 'January');
  assert.equal(r.upfrontAt(330000), 1881000, '6 up front at £3,300 is £18,810');
});

test('the next 6 months are drafted from the current agreement with up front chosen', () => {
  const t = { ...blankTerms('sessions'), endsOn: '2027-07-02', choice: 'plan', extrasChosen: ['visit'], endsPicked: true };
  const n = r.nextTermDraft(t);
  assert.equal(n.startsOn, '2027-07-05', 'the Monday after');
  assert.equal(n.choice, 'upfront');
  assert.equal(n.endsPicked, false);
  assert.deepEqual(n.extrasChosen, []);
  assert.equal(t.choice, 'plan', 'the current terms are untouched');
});
