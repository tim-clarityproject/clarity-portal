// src/lib/agreements/quote.js: quote numbers, validity and totals with ticked extras (brief items 19 to 21).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as q from '../../src/lib/agreements/quote.js';
import { blankTerms } from '../../src/lib/agreements/terms.js';

const sam = { ...blankTerms('sessions'), coaching: '6-month coaching', totalMinor: 1800000, discounts: [{ type: 'returning', percent: 15 }], settle: 'equal',
  extrasOffered: [{ key: 'session', title: 'Extra coaching session', priceMinor: 75000 }, { key: 'visit', title: 'Visit day', priceMinor: 250000 }] };

test('Q- numbers, never 0', () => {
  assert.equal(q.quoteNumber(42), 'Q-0042');
  assert.equal(q.quoteNumber(1), 'Q-0001');
  assert.equal(q.quoteNumberOf('Q-0042'), 42);
  assert.throws(() => q.quoteNumber(0));
});

test('30 days from Wed 25 Nov 2026 is Fri 25 Dec 2026; 14, 30 or 60 only', () => {
  assert.equal(q.validUntil('2026-11-25', 30), '2026-12-25');
  assert.equal(q.validLine('2026-12-25'), 'Valid until Fri 25 Dec 2026');
  assert.throws(() => q.validUntil('2026-11-25', 45));
  assert.equal(q.isExpired('2026-12-25', '2026-12-25'), false);
  assert.equal(q.isExpired('2026-12-25', '2026-12-26'), true);
});

test('ticking a £2,500 visit day on £15,300 makes £17,800, and the settling options follow', () => {
  const none = q.total(sam, [], 'plan');
  const visit = q.total(sam, ['visit'], 'plan');
  assert.equal(none.planTotal, 1530000);
  assert.equal(visit.planTotal, 1780000);
  assert.equal(visit.settleOptions.find((o) => o.value === 'equal').label, '6 monthly instalments, the first £2,966.70 and then £2,966.66');
  assert.equal(visit.firstPayment, 296670, 'the leftover pennies go on the first instalment');
  const up = q.total(sam, ['visit'], 'upfront');
  assert.equal(up.invest, 1691000);
  const rows = q.quoteRows(sam, ['visit'], 'plan');
  assert.deepEqual(rows.lines.map((l) => [l.label, l.amount]), [['6-month coaching, 16 coaching sessions', '£18,000'], ['Returning client, 15% off', '−£2,700']]);
  assert.deepEqual(rows.extras.map((e) => e.chosen), [false, true]);
  assert.equal(rows.inAll, '£17,800');
  assert.equal(rows.upfront, null, 'no up-front line while the plan is chosen');
});

test('up front chosen puts its 5% off on its own line before In all (UI finding 4)', () => {
  const rows = q.quoteRows(sam, ['visit'], 'upfront');
  assert.deepEqual(rows.upfront, { label: 'Up front, 5% off', amount: '−£890' });
  assert.equal(rows.inAll, '£16,910');
});
