// src/lib/agreements/settling.js: the ways of settling and the first payment (brief items 4 and 8; M28's settleOpts, firstPay).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as s from '../../src/lib/agreements/settling.js';
import { blankTerms } from '../../src/lib/agreements/terms.js';

const sam = (settle, extra = {}) => ({ ...blankTerms('sessions'), totalMinor: 1800000, discounts: [{ type: 'returning', percent: 15 }], settle, ...extra });

test('£15,300: a deposit of £4,600 then 5 × £2,140; 6 × £2,550; as delivered £956.25 a session', () => {
  assert.deepEqual(s.settleOptions(sam('equal')).map((o) => o.label), [
    'In full, up front, £14,535, 5% off',
    'A deposit of £4,600, then 5 monthly instalments of £2,140',
    '6 monthly instalments of £2,550',
    'As delivered, £956.25 a coaching session',
  ]);
  assert.equal(s.firstPayment(sam('deposit'), 'plan'), 460000);
  assert.equal(s.firstPayment(sam('equal'), 'plan'), 255000);
  assert.equal(s.firstPayment(sam('delivered'), 'plan'), 95625);
  assert.equal(s.firstPayment(sam('equal'), 'upfront'), 1453500, 'up front chosen: the whole, 5% off');
  assert.equal(s.firstPayment(sam('full')), 1453500);
});

test('the settle step’s title and what follows', () => {
  assert.equal(s.payTitle(sam('deposit'), 'plan'), 'Your deposit');
  assert.equal(s.restLine(sam('deposit'), 'plan'), 'Then 5 monthly instalments of £2,140, collected the same way.');
  assert.equal(s.restLine(sam('equal'), 'plan'), 'Then 5 more monthly instalments of £2,550, collected the same way.');
  assert.equal(s.restLine(sam('equal'), 'upfront'), 'This settles your agreement in full. You save £765.');
  // Nothing follows a one-off or a block of hours settled in full, so nothing is said (UI finding 7).
  assert.equal(s.restLine({ kind: 'oneoff', oneoff: { totalMinor: 150000, settle: 'full' } }), '');
  assert.equal(s.restLine({ kind: 'oneoff', oneoff: { totalMinor: 150000, settle: 'after' } }), 'The rest is invoiced as agreed.');
  assert.equal(s.restLine({ kind: 'hours', hours: { blockMinor: 200000, rateMinor: 15000 } }), '');
  assert.equal(s.payTitle(sam('delivered'), 'plan'), 'First coaching session');
  assert.equal(s.investmentWords(sam('equal'), 'plan'), '£15,300, in 6 monthly instalments of £2,550');
  assert.equal(s.investmentWords(sam('delivered'), 'plan'), '£15,300, invoiced as delivered at £956.25 a coaching session');
  assert.equal(s.investmentWords(sam('equal'), 'upfront'), '£14,535, in full, up front, with 5% off');
});

test('a one-off after the work: a 30% deposit of £500 (£450 to the nearest £100); before it: the whole', () => {
  const o = { ...blankTerms('oneoff'), work: 'A Health Check and a 90-minute debrief', oneoff: { on: '2027-01-11', place: 'zoom', totalMinor: 150000, settle: 'after' } };
  assert.equal(s.firstPayment(o), 50000);
  assert.equal(s.payTitle(o), 'Your deposit');
  assert.equal(s.firstPayment({ ...o, oneoff: { ...o.oneoff, settle: 'before' } }), 150000);
});

test('a retainer: the first month, or £17,100 for 6 months up front', () => {
  const r = { ...blankTerms('retainer'), retainer: { sessions: 'Up to 2 a month, 60 minutes each', feeMinor: 300000, invoice: 'monthly' } };
  assert.equal(s.firstPayment(r, 'plan'), 300000);
  assert.equal(s.firstPayment(r, 'upfront'), 1710000);
  assert.equal(s.payTitle(r, 'upfront'), 'Six months up front');
  assert.equal(s.restLine(r, 'upfront'), 'Then £3,000/month from month 7.');
});

test('funded: nothing at signing; the organisation is invoiced on the same schedule, with no 5% (agreements rule 12)', () => {
  const f = sam('equal', { funder: 'org', fundedBy: 'Northfield Logistics' });
  assert.equal(s.firstPayment(f), 0);
  const plan = s.schedule(f, { signedDay: '2026-11-25' });
  assert.equal(plan.length, 6);
  assert.equal(plan[0].amount, 255000);
  assert.equal(plan.reduce((a, x) => a + x.amount, 0), 1530000);
});

test('instalments add up to the penny, deposit first then monthly', () => {
  const plan = s.schedule(sam('deposit'), { signedDay: '2026-11-25', choice: 'plan' });
  assert.equal(plan.length, 6);
  assert.equal(plan[0].kind, 'deposit');
  assert.equal(plan.reduce((a, x) => a + x.amount, 0), 1530000);
  assert.deepEqual(plan.map((x) => x.day), ['2026-11-25', '2026-12-25', '2027-01-25', '2027-02-25', '2027-03-25', '2027-04-25']);
  const odd = s.schedule({ ...sam('equal'), totalMinor: 1000001, discounts: [] }, { signedDay: '2026-11-25', choice: 'plan' });
  assert.equal(odd.reduce((a, x) => a + x.amount, 0), 1000001);
  assert.equal(odd[0].kind, 'first_payment');
});

test('a team programme: M28’s three ways (risk 5)', () => {
  const t = { ...blankTerms('team'), team: { ...blankTerms('team').team, totalMinor: 2700000, settle: 'deposit' } };
  assert.deepEqual(s.teamOptions(t).map((o) => o.label), ['A deposit of £9,000, then 3 instalments of £6,000', '3 instalments of £9,000', 'In full, up front, £27,000']);
});
