// The coaching agreement's words (Phase 6b run 1), as draft-1-agreement-wording.md has them, filled from each client's terms.
import test from 'node:test';
import assert from 'node:assert/strict';
import { clauses, mainPoints, pdfDetails, signingWords } from '../../src/lib/billing/agreementText.js';

const SAM = {
  coaching: '6-month coaching, with a momentum phase', sessions: 16, minutes: 60, place: 'Zoom', rhythm: 'weekly for 6 weeks, then every 2 weeks',
  startsOn: '2027-01-04', endsOn: '2027-07-02', currency: 'GBP', total_minor: 1800000, instalments: 6, goals: 'lead the merger well',
  clientName: 'Sam Reid', clientEmail: 'sam@example.invalid', coachName: 'Dr. Tim Dutton', coachFirst: 'Tim',
};

test('Main points, in the wording file\'s order, word for word', () => {
  assert.deepEqual(mainPoints(SAM).map((r) => [r.label, r.value]), [
    ['Coaching provider', 'The Clarity Project LTD'],
    ['Your coach', 'Dr. Tim Dutton'],
    ['Your coaching', '6-month coaching, with a momentum phase'],
    ['Coaching sessions', '16 sessions of 60 minutes on Zoom, weekly for 6 weeks, then every 2 weeks'],
    ['Dates', 'Mon 4 Jan 2027 to Fri 2 Jul 2027'],
    ['Your investment', '£18,000, in 6 monthly instalments of £3,000'],
    ['Rearranging', 'Up to 24 hours before, at no charge'],
    ['Session summaries', 'Shared with you automatically'],
    ['Ending early', '30 days’ notice, in writing, from either of us'],
  ]);
  assert.equal(mainPoints({ ...SAM, ongoing: true }).find((r) => r.label === 'Dates').value, 'Ongoing, with a yearly price review');
});

test('funded: Funded by in place of the investment, and no money anywhere in what the client reads', () => {
  const t = { ...SAM, fundedBy: 'Northfield Logistics' };
  const rows = mainPoints(t);
  assert.ok(rows.some((r) => r.label === 'Funded by' && r.value === 'Northfield Logistics'));
  assert.ok(!rows.some((r) => r.label === 'Your investment'));
  const text = JSON.stringify([rows, clauses(t)]);
  assert.ok(!/£|\$|investment|instalment|invoices come|settle/i.test(text), 'no amount, investment, instalment or invoice to settle');
  assert.deepEqual(clauses(t).filter((c) => c.number).map((c) => `${c.number} ${c.title}`).slice(0, 4), ['1 Purpose', '2 The coaching', '3 Rearranging and cancelling', '4 Confidentiality and records']);
});

test('the clauses, filled in, with no bracket left', () => {
  const c = clauses(SAM);
  assert.equal(c[0].paragraphs[0], 'This agreement is between The Clarity Project LTD, company number 12817337, of 30 Francis Green Lane, Penkridge, Stafford, ST19 5HF, and Sam Reid of sam@example.invalid.');
  assert.equal(c.find((x) => x.key === 'investment').number, 3);
  assert.equal(c.find((x) => x.key === 'investment').paragraphs[0], 'Your investment is £18,000 in pounds, in 6 monthly instalments.');
  assert.ok(!c.find((x) => x.key === 'investment').paragraphs.some((p) => /VAT/.test(p)), 'no VAT wording until VAT is switched on');
  assert.ok(clauses({ ...SAM, vat: true }).find((x) => x.key === 'investment').paragraphs.includes('Prices exclude VAT, which is added at the current rate.'));
  assert.ok(c.every((x) => x.paragraphs.every((p) => !/[[\]]/.test(p))), 'no bracket left in any paragraph');
  assert.equal(c.at(-1).paragraphs[0], 'Signed for The Clarity Project LTD by Dr. Tim Dutton, then by you.');
});

test('the signing words name the client\'s own coach; the PDF\'s details line', () => {
  assert.equal(signingWords('Maya').asked, 'Sent to Maya. You’ll get a new version to sign.');
  assert.equal(signingWords('Tim').signed, 'Signed. Tim has a copy, and yours is in My Account, Coaching.');
  assert.equal(pdfDetails({ clientName: 'Sam Reid', dayWords: 'Mon 4 Jan 2027', reference: 'CLARITY-AG-0001', version: 1 }), 'Sam Reid, Mon 4 Jan 2027, reference CLARITY-AG-0001, version 1');
});
