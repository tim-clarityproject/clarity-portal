// src/lib/agreements/differences.js: Check before sending lists every difference (brief item 18; M28's unusual()).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as d from '../../src/lib/agreements/differences.js';
import { overrideFor } from '../../src/lib/agreements/clauses.js';
import { blankTerms } from '../../src/lib/agreements/terms.js';

const plain = { ...blankTerms('sessions'), blocks: [{ n: 16, minutes: 60 }], totalMinor: 1800000, startsOn: '2027-01-04', clientFirst: 'Sam' };

test('nothing different reads as one calm line', () => {
  assert.deepEqual(d.differences(plain), []);
  assert.equal(d.NOTHING_LINE, 'Nothing. It uses your standard wording and package.');
  assert.equal(d.wordingLine(plain), 'No changes');
});

test('every kind of difference, in M28’s words', () => {
  const t = { ...plain, blocks: [{ n: 1, minutes: 90 }, { n: 15, minutes: 60 }], discounts: [{ type: 'returning', percent: 15 }],
    visitDays: { n: 2, rateMinor: 250000 }, noticeHours: 12, dueDays: 30, expiryDays: 60, pausing: false };
  const rows = d.differences(t, { overrides: { rearranging: overrideFor('rearranging', t, [{ text: 'Changed for Sam.' }]) } });
  assert.deepEqual(rows.map((r) => [r.label, r.detail]), [
    ['4. Rearranging and cancelling', 'Edited for Sam'],
    ['Returning client, 15% off', '−£3,450, so £19,550 in all'],
    ['Coaching session lengths', '1 of 90 minutes, then 15 of 60 minutes'],
    ['Visit days', '2 days at £2,500'],
    ['Rearranging notice', '12 hours'],
    ['Invoices due within', '30 days'],
    ['Offer runs out after', '60 days'],
    ['Pausing', 'Not allowed'],
  ]);
  assert.equal(rows[0].where, 'clause');
  assert.equal(rows[0].clauseKey, 'rearranging');
});

test('£18,000 with 15% returning reads "−£2,700, so £15,300 in all"; hourly, monthly, funded, a retainer as delivered', () => {
  assert.equal(d.differences({ ...plain, discounts: [{ type: 'returning', percent: 15 }] })[0].detail, '−£2,700, so £15,300 in all');
  assert.equal(d.differences({ ...plain, priceMode: 'hourly', rateMinor: 75000 })[0].detail, 'By the hour, £750/hr');
  assert.equal(d.differences({ ...plain, priceMode: 'monthly', monthlyMinor: 300000 })[0].detail, 'Monthly, £3,000/month');
  assert.deepEqual(d.differences({ ...plain, funder: 'org', fundedBy: 'Northfield Logistics' })[0], { label: 'Funded by', detail: 'Northfield Logistics', where: 'builder' });
  const r = { ...blankTerms('retainer'), retainer: { sessions: 'x', feeMinor: 300000, invoice: 'delivered' } };
  assert.deepEqual(d.differences(r).map((x) => x.label), ['Invoiced as delivered']);
});
