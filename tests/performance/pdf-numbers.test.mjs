// The UI tester's findings on the PDFs and money words (Polish 1, FX1, 26 Nov): numbers as the approved 25 Nov PDFs
// print them (F14), the quotation's "Or monthly" line (Q7), the debrief report's Sleep tile (Q5), and this year's
// dates without their year on screen (writing rule 28).
import test from 'node:test';
import assert from 'node:assert/strict';
import { agreementRef } from '../../src/lib/pdf/docs/agreement.js';
import { invoicePdf } from '../../src/lib/pdf/docs/invoice.js';
import { orMonthly } from '../../src/lib/pdf/docs/quote.js';
import { debriefFacts, weeklyDebriefPdf } from '../../src/lib/pdf/docs/weeklyDebrief.js';
import { expiryLine } from '../../src/lib/agreements/status.js';
import { sentFacts } from '../../src/lib/coach/money.js';

test('an agreement reference prints as AGR-0151; the stored CLARITY-AG- value is never changed', () => {
  assert.equal(agreementRef('CLARITY-AG-0151'), 'AGR-0151');
  assert.equal(agreementRef('CLARITY-AG-7'), 'AGR-0007');
  assert.equal(agreementRef('CLARITY-AG-12345'), 'AGR-12345');
  assert.equal(agreementRef('Something else'), 'Something else');
});

test('an invoice number prints with four figures at least: CLARITY-0151, CLARITY-1251', () => {
  const doc = (number) => invoicePdf({ number, issuedOn: '2026-11-25', dueOn: '2026-12-01', orgName: 'Sam Carter', lines: [{ description: 'Coaching', amount: 75000 }] });
  const facts = (d) => Object.fromEntries(d.facts);
  assert.equal(facts(doc(151))['Invoice number'], 'CLARITY-0151');
  assert.equal(facts(doc(1251))['Invoice number'], 'CLARITY-1251');
});

test('a quotation paid in advance shows "Or monthly £750.00 × 6" for a monthly plan, else "Or as planned"', () => {
  assert.deepEqual(orMonthly({ kind: 'sessions', priceMode: 'monthly', months: 6 }, 450000, 'GBP'), ['Or monthly', '£750.00 × 6']);
  assert.deepEqual(orMonthly({ kind: 'sessions', settle: 'deposit' }, 450000, 'GBP'), ['Or as planned', '£4,500.00']);
  assert.deepEqual(orMonthly({ kind: 'sessions', priceMode: 'monthly', months: 6 }, 450001, 'GBP'), ['Or as planned', '£4,500.01']);
});

test('the debrief report shows the Sleep tile when the week has sleep logged, the streak when it has none', () => {
  const view = { groups: [], days: [{ key: '2026-11-16' }, { key: '2026-11-22' }], week: 8, lengthWeeks: 26, score: { value: 72 }, streak: 3 };
  const withSleep = weeklyDebriefPdf(debriefFacts(view, { name: 'Sam', sleep: { hours: [{ value: 7 }, { value: 8 }, { value: 7.5 }], quality: [{ value: 'fair' }, { value: 'fair' }] } }));
  assert.deepEqual(withSleep.glance.map((g) => g.label), ['Performance score', 'Sleep']);
  assert.equal(withSleep.glance[1].value, '7½');
  assert.equal(withSleep.glance[1].note, 'Average a night, mostly Good');
  const without = weeklyDebriefPdf(debriefFacts(view, { name: 'Sam' }));
  assert.equal(without.glance[1].label, 'Debrief streak');
});

test('screen dates this year leave the year out; another year keeps it', () => {
  assert.equal(expiryLine({ version: { expires_on: '2026-12-23' }, firstName: 'Sam', today: '2026-11-26' }), 'If Sam hasn’t signed, it runs out on Wed 23 Dec. You can reopen it in one step.');
  assert.equal(expiryLine({ version: { expires_on: '2027-01-08' }, firstName: 'Sam', today: '2026-11-26' }), 'If Sam hasn’t signed, it runs out on Fri 8 Jan 2027. You can reopen it in one step.');
  assert.equal(sentFacts({ terms: { startsOn: '2026-11-30', endsOn: '2027-02-26' } }, '2026-11-26').dates, 'Mon 30 Nov to Fri 26 Feb 2027');
  assert.equal(sentFacts({ terms: { startsOn: '2026-11-30', endsOn: '2026-12-18' } }, '2026-11-26').dates, 'Mon 30 Nov to Fri 18 Dec');
});
