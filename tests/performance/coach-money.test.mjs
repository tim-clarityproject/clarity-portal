// The coach's money screens' words (Polish 1, Stage C, C2; M28 version 6 "client", "sent", "needs"):
// src/lib/coach/money.js and the Needs you line in src/content/pageLines/coach.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { agreementRows, agreementState, amountsText, moneySummary, monthSpan, sentFacts, sentLabel, sentLead, somethingWaiting, reminderLine } from '../../src/lib/coach/money.js';
import { needsYouLine } from '../../src/content/pageLines/coach.js';

const SAM = 'p-sam';
const TODAY = '2026-11-25';

test('months: M28’s "Jun to Dec 2025", across years, open-ended', () => {
  assert.equal(monthSpan('2025-06-02', '2025-12-18'), 'Jun to Dec 2025');
  assert.equal(monthSpan('2025-09-01', '2026-03-01'), 'Sep 2025 to Mar 2026');
  assert.equal(monthSpan('2026-02-03', null), 'From Feb 2026');
  assert.equal(monthSpan('2026-02-03', '2026-02-20'), 'Feb 2026');
  assert.equal(monthSpan(null, null), '');
});

test('where an agreement stands, in a word', () => {
  const signed = { version: 1, status: 'signed', client_signed_at: '2026-01-02T10:00:00Z', terms: { kind: 'sessions', startsOn: '2026-01-05', endsOn: '2026-12-20' } };
  assert.equal(agreementState({ agreement: { status: 'signed' }, latest: signed, inForce: signed, today: TODAY }).word, 'Running');
  assert.equal(agreementState({ agreement: { status: 'signed' }, latest: signed, inForce: signed, today: '2026-12-21' }).word, 'Ended');
  assert.equal(agreementState({ agreement: { status: 'signed' }, latest: signed, inForce: signed, today: '2026-01-01' }).word, 'Signed');
  assert.equal(agreementState({ agreement: { status: 'ended' }, latest: signed, inForce: signed, today: TODAY }).word, 'Ended');
  assert.equal(agreementState({ agreement: { status: 'cancelled' }, latest: signed, inForce: signed, today: TODAY }).word, 'Cancelled');
  const sent = { version: 1, status: 'sent', terms: { kind: 'sessions' } };
  assert.equal(agreementState({ agreement: { status: 'sent' }, latest: sent, inForce: null, today: TODAY }).word, 'Sent');
  assert.equal(agreementState({ agreement: { status: 'sent' }, latest: sent, inForce: null, opened: true, today: TODAY }).word, 'Opened');
  const draft = { version: 1, status: 'draft', terms: { kind: 'sessions' } };
  assert.equal(agreementState({ agreement: { status: 'draft', approval: 'waiting' }, latest: draft, inForce: null, today: TODAY }).word, 'Waiting for approval');
  assert.equal(agreementState({ agreement: { status: 'draft' }, latest: draft, inForce: null, today: TODAY }).word, 'Draft');
  assert.equal(agreementState({ agreement: { status: 'draft' }, latest: draft, inForce: null, quote: { status: 'sent' }, today: TODAY }).word, 'Quote sent');
  // A price review waiting to be signed on a running agreement is the one to follow.
  const v2 = { version: 2, status: 'sent', terms: { kind: 'sessions' } };
  assert.equal(agreementState({ agreement: { status: 'signed' }, latest: v2, inForce: signed, today: TODAY }).word, 'Sent');
});

test('a client’s agreements: newest first, M28’s line, where each opens', () => {
  const agreements = [
    { id: 'a-old', profile_id: SAM, status: 'ended', created_at: '2025-05-01T00:00:00Z' },
    { id: 'a-new', profile_id: SAM, status: 'sent', created_at: '2026-11-20T00:00:00Z' },
    { id: 'a-draft', profile_id: SAM, status: 'draft', created_at: '2026-11-21T00:00:00Z' },
    { id: 'a-run1', profile_id: SAM, status: 'signed', created_at: '2024-01-01T00:00:00Z' },
    { id: 'a-other', profile_id: 'p-jo', status: 'draft', created_at: '2026-11-22T00:00:00Z' },
  ];
  const versions = [
    { id: 'v-old', agreement_id: 'a-old', version: 2, status: 'signed', client_signed_at: '2025-05-20T09:00:00Z', terms: { kind: 'sessions', coaching: 'Six months of one-to-one coaching', startsOn: '2025-06-02', endsOn: '2025-12-18' } },
    { id: 'v-new', agreement_id: 'a-new', version: 1, status: 'sent', terms: { kind: 'sessions', coaching: 'Leadership Accelerator, 6 months', startsOn: '2027-01-04', endsOn: '2027-06-11' } },
    { id: 'v-draft', agreement_id: 'a-draft', version: 1, status: 'draft', terms: { kind: 'hours' } },
    { id: 'v-run1', agreement_id: 'a-run1', version: 1, status: 'signed', client_signed_at: '2024-01-02T09:00:00Z', terms: { sessions: 6 } },
  ];
  const rows = agreementRows({ agreements, versions, opens: [{ version_id: 'v-new', opened_at: '2026-11-24T09:00:00Z' }], profileId: SAM, today: TODAY });
  assert.deepEqual(rows.map((r) => r.id), ['a-draft', 'a-new', 'a-old', 'a-run1']);
  assert.deepEqual(rows.map((r) => r.value), ['Draft', 'Opened', 'Ended', 'Running']);
  assert.equal(rows[2].name, 'Six months of one-to-one coaching');
  assert.equal(rows[2].sub, 'Jun to Dec 2025, version 2');
  assert.equal(rows[0].name, 'Block of hours');
  assert.equal(rows[0].to, '/coach/agreements/a-draft/edit');
  assert.equal(rows[1].to, '/coach/agreements/a-new/sent');
  assert.equal(rows[2].to, '/coach/agreements/a-old');
  assert.equal(rows[3].run1, true);
  assert.equal(somethingWaiting(rows), true);
  assert.equal(somethingWaiting(rows.slice(2)), false);
});

test('a client’s money: settled in all, what’s owed, an organisation invoiced instead', () => {
  const invoices = [
    { id: 'i1', profile_id: SAM, status: 'paid', currency: 'GBP', total_minor: 450000, paid_minor: 450000 },
    { id: 'i2', profile_id: SAM, status: 'paid', currency: 'GBP', total_minor: 450000, paid_minor: 0 },
    { id: 'i3', profile_id: SAM, status: 'sent', currency: 'GBP', number: 1202, total_minor: 75000, paid_minor: 0, due_on: '2026-12-04' },
    { id: 'i4', profile_id: SAM, status: 'sent', currency: 'GBP', number: 1190, total_minor: 75000, paid_minor: 25000, due_on: '2026-11-22' },
    { id: 'i5', profile_id: SAM, status: 'void', currency: 'GBP', total_minor: 99900 },
    { id: 'i6', profile_id: SAM, status: 'draft', currency: 'GBP', total_minor: 75000 },
    { id: 'i7', profile_id: SAM, status: 'paid', currency: 'USD', total_minor: 75000, paid_minor: 75000 },
    { id: 'i8', profile_id: SAM, status: 'sent', settles_to: 'organisation', currency: 'GBP', total_minor: 500000 },
  ];
  const m = moneySummary({ invoices, profileId: SAM, today: TODAY });
  assert.equal(amountsText(m.settled), '£9,000 and US$750');
  assert.deepEqual(m.owed.map((o) => [o.name, o.sub, o.value]), [
    ['£500 owed', 'Invoice CLARITY-1190', '3 days overdue'],
    ['£750 owed', 'Invoice CLARITY-1202', 'Due Fri 4 Dec'],
  ]);
  assert.equal(m.funder, null);
  const funded = moneySummary({ invoices: [], agreements: [{ id: 'a', profile_id: SAM }], versions: [{ agreement_id: 'a', status: 'signed', client_signed_at: '2026-01-01T00:00:00Z', funded_by: 'Cymru Active' }], profileId: SAM, today: TODAY });
  assert.equal(funded.funder, 'Cymru Active');
  assert.deepEqual(funded.settled, []);
});

test('Sent: M28’s words', () => {
  const v = { version: 1, status: 'sent', sent_at: '2026-11-25T09:15:00Z', terms: { kind: 'retainer', retainer: { feeMinor: 75000 }, currency: 'GBP', startsOn: '2027-01-04', endsOn: '2027-06-11' } };
  assert.equal(sentLabel(v, null), 'Agreement, version 1');
  assert.equal(sentLabel(v, { number: 1042 }), 'Quote Q-1042');
  const f = sentFacts(v);
  assert.equal(f.price, '£750');
  assert.equal(f.unit, '/month');
  assert.equal(f.dates, 'Mon 4 Jan to Fri 11 Jun 2027');
  const sessions = sentFacts({ terms: { kind: 'sessions', blocks: [{ n: 1, minutes: 90 }, { n: 11, minutes: 60 }], priceMode: 'total', totalMinor: 900000, currency: 'GBP' } });
  assert.equal(sessions.sessions, '12 sessions');
  assert.equal(sessions.unit, 'in all');
  assert.equal(sentLead({ version: v, first: 'Sam', clock: () => '09:15' }), 'You signed it at 09:15. You’ll see here the moment Sam opens, signs and settles it.');
  assert.equal(reminderLine('Sam', false), 'If Sam hasn’t signed in 3 days, a reminder is drafted in Needs you for you to send.');
  assert.equal(reminderLine('Sam', true), '');
});

test('Needs you’s line: M28’s "Five things are drafted…", in words to ten', () => {
  assert.equal(needsYouLine(5), 'Five things are drafted and waiting for you. Nothing goes until you send it.');
  assert.equal(needsYouLine(1), 'One thing is drafted and waiting for you. Nothing goes until you send it.');
  assert.equal(needsYouLine(12), '12 things are drafted and waiting for you. Nothing goes until you send it.');
  assert.match(needsYouLine(0), /^Nothing is waiting for you\./);
});

test('the agreement email as M28 v6 draws it: the note and what the agreement is in one paragraph, a black button', async () => {
  const { readyToSignEmail } = await import('../../src/lib/email/agreementEmails.js');
  const { renderEmail } = await import('../../src/lib/email/template.js');
  const L = 'https://portal.example.invalid/coaching/agreement/x';
  const r = renderEmail(readyToSignEmail({ firstName: 'Sam', coachFirst: 'Tim', note: 'Thank you for this morning.', what: 'six months of coaching', startsWords: 'Monday 4 January', link: L }));
  assert.match(r.text, /Thank you for this morning\. Here’s the agreement for your six months of coaching, starting on Monday 4 January\./);
  assert.match(renderEmail(readyToSignEmail({ firstName: 'Sam', coachFirst: 'Tim', what: 'six months of coaching', link: L })).text, /\nHere’s the agreement for your six months of coaching\.\n/);
  assert.match(renderEmail(readyToSignEmail({ firstName: 'Sam', coachFirst: 'Tim', link: L })).text, /Here is everything we agreed\./);
  // The reference's main button: black with white words, never coral.
  assert.match(r.html, /class="btn-cell" bgcolor="#000000"/);
  assert.doesNotMatch(r.html, /bgcolor="#FF6F5C"/i);
});
