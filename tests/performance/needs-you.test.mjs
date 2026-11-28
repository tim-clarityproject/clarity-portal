// src/lib/agreements/duringAgreement.js, Needs you's facts (Phase 6b run 3, Group D; M28 s-today; brief items 4, 10,
// 13, 23, 24, 40, 41, 43, 44): which rows make which item, that Who needs attention and Needs you never list one
// overdue invoice twice, Done and Not now, and the agreement page's panels' choices and counts.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as d from '../../src/lib/agreements/duringAgreement.js';
import { visible, doneRow } from '../../src/lib/agreements/needsYou.js';
import { refund14, offered } from '../../src/lib/agreements/coolingOff.js';

const today = '2026-11-25';
const now = Date.parse('2026-11-25T15:00:00Z');
const coachId = 'c1';
const clients = [{ id: 'p1', name: 'Sam Reid' }, { id: 'p2', name: 'Jo Patel' }, { id: 'p3', name: 'Rhys Evans' }, { id: 'p4', name: 'Alex Morgan' }];
const organisations = [{ id: 'o1', name: 'Northfield Logistics' }];
const signedAt = '2026-11-01T10:00:00Z';
const v = (id, agreementId, terms, extra = {}) => ({ id, agreement_id: agreementId, coach_id: coachId, version: 1, status: 'signed', client_signed_at: signedAt, terms, ...extra });

test('as delivered: the held and late-cancelled sessions since the last invoice, at the even split', () => {
  const t = { kind: 'sessions', settle: 'delivered', choice: 'plan', blocks: [{ n: 16, minutes: 60 }], priceMode: 'total', totalMinor: 1200000, startsOn: '2026-11-02', currency: 'GBP' };
  const agreements = [{ id: 'a1', coach_id: coachId, profile_id: 'p2', status: 'signed' }];
  const sessions = [
    { id: 's1', profile_id: 'p2', starts_at: '2026-11-03T10:00:00Z', minutes: 60, outcome: 'held' },
    { id: 's2', profile_id: 'p2', starts_at: '2026-11-19T10:00:00Z', minutes: 60, outcome: 'late_cancel' },
    { id: 's3', profile_id: 'p2', starts_at: '2026-11-12T10:00:00Z', minutes: 60, outcome: 'moved' },
    { id: 's4', profile_id: 'p2', starts_at: '2026-11-10T10:00:00Z', minutes: 60, outcome: 'held' },
  ];
  const items = d.needsYouItems({ coachId, today, now, agreements, versions: [v('v1', 'a1', t)], sessions, sources: [{ session_id: 's4', released_at: null }], clients });
  const it = items.find((i) => i.kind === 'delivered');
  assert.equal(it.title, 'Invoice ready for Jo Patel');
  // The first session that counts (s1) was settled at signing, so only s2 is drafted (functionality tester, run 3, finding 4).
  assert.equal(it.line, '1 coaching session since the last one, £750');
  assert.equal(d.perSessionMinor(t), 75000);
  // Up front chosen: nothing is invoiced as delivered.
  assert.equal(d.needsYouItems({ coachId, today, now, agreements, versions: [v('v1', 'a1', { ...t, choice: 'upfront' })], sessions, clients }).filter((i) => i.kind === 'delivered').length, 0);
});

test('a retainer as delivered: its fee divided by the coaching sessions a month it states (agreements rule 12)', () => {
  assert.equal(d.perSessionMinor({ kind: 'retainer', retainer: { feeMinor: 300000, invoice: 'delivered', sessions: 'Up to 2 a month, 60 minutes each' }, beyondRateMinor: 75000 }), 150000);
  assert.equal(d.perSessionMinor({ kind: 'retainer', retainer: { feeMinor: 300000, invoice: 'delivered' } }), 300000);
  assert.equal(d.invoicedAsDelivered({ kind: 'retainer', retainer: { invoice: 'delivered' } }), true);
  assert.equal(d.invoicedAsDelivered({ kind: 'retainer', retainer: { invoice: 'monthly' } }), false);
});

test('signing reminders: the newest drafted, unsent and unsigned; none while one is being sent', () => {
  const t = { kind: 'sessions', blocks: [{ n: 16, minutes: 60 }] };
  const agreements = [{ id: 'a2', coach_id: coachId, profile_id: 'p1', status: 'sent' }];
  const versions = [{ id: 'v2', agreement_id: 'a2', coach_id: coachId, version: 1, status: 'sent', sent_at: '2026-11-22T10:00:00Z', expires_on: '2026-12-22', terms: t }];
  const reminders = [{ id: 'r3', coach_id: coachId, version_id: 'v2', kind: 'sign_3', drafted_at: '2026-11-25T03:15:00Z' }];
  const [it] = d.needsYouItems({ coachId, today, now, agreements, versions, agreementReminders: reminders, clients }).filter((i) => i.kind === 'sign_reminder');
  assert.equal(it.title, 'Reminder ready for Sam Reid');
  assert.equal(it.line, 'Hasn’t signed version 1, sent 3 days ago');
  assert.equal(it.data.reminder, 'sign_3');
  assert.equal(d.needsYouItems({ coachId, today, now, agreements, versions, agreementReminders: [{ ...reminders[0], sending_at: '2026-11-25T09:00:00Z' }], clients }).length, 0);
  // Run out: nothing to remind about.
  assert.equal(d.needsYouItems({ coachId, today, now, agreements, versions: [{ ...versions[0], expires_on: '2026-11-24' }], agreementReminders: reminders, clients }).length, 0);
});

test('a block of hours at 80%: the top-up drafted, counted again after each top-up', () => {
  const t = { kind: 'hours', hours: { blockMinor: 200000, rateMinor: 15000, tellAt80: true } };
  const agreements = [{ id: 'a3', coach_id: coachId, profile_id: 'p3', engagement_id: 'e1', status: 'signed' }];
  const entries = [90, 240, 190, 120].map((m, i) => ({ id: `t${i}`, engagement_id: 'e1', started_at: `2026-11-1${i}T09:00:00Z`, ended_at: new Date(Date.parse(`2026-11-1${i}T09:00:00Z`) + m * 60000).toISOString() }));
  const [it] = d.needsYouItems({ coachId, today, now, agreements, versions: [v('v3', 'a3', t)], entries, clients });
  assert.equal(it.title, 'Rhys’ block is 80% used');
  assert.equal(it.line, '10 hours 40 minutes of 13 hours 20 minutes');
  assert.equal(it.key, 'hours:a3:0');
  const after = d.needsYouItems({ coachId, today, now, agreements, versions: [v('v3', 'a3', t)], entries, clients, invoices: [{ agreement_id: 'a3', kind: 'top_up', status: 'sent' }] });
  assert.equal(after.length, 0, 'a top-up doubles the block, so 640 of 1,600 minutes is under 80%');
});

test('renewal a month before the 6 months end; price review 6 weeks before it is due', () => {
  const sessionsT = { kind: 'sessions', fullTerm: true, blocks: [{ n: 16, minutes: 60 }], startsOn: '2026-08-17', endsOn: '2027-02-12' };
  const retainerT = { kind: 'retainer', retainer: { feeMinor: 300000 }, startsOn: '2026-01-04' };
  const agreements = [{ id: 'a4', coach_id: coachId, profile_id: 'p4', status: 'signed' }, { id: 'a5', coach_id: coachId, profile_id: 'p2', status: 'signed' }];
  const items = d.needsYouItems({ coachId, today: '2027-01-12', now, agreements, versions: [v('v4', 'a4', sessionsT), v('v5', 'a5', retainerT)], clients });
  const renew = items.find((i) => i.kind === 'renew' && i.data.agreementId === 'a4');
  assert.equal(renew.title, 'Offer Alex Morgan the next 6 months');
  assert.equal(renew.line, 'These 6 months end Fri 12 Feb, 31 days to go'); // a true countdown (Stage D UI tester, fault 6)
  const price = d.needsYouItems({ coachId, today, now, agreements, versions: [v('v5', 'a5', retainerT)], clients }).find((i) => i.kind === 'price');
  assert.equal(price.title, 'Yearly price review for Jo Patel');
  assert.match(price.line, /^Retainer, £3,000\/month since Jan 2026, review due Mon 4 Jan$/);
  // Already renewed: no offer.
  assert.equal(d.needsYouItems({ coachId, today: '2027-01-12', now, agreements: [...agreements, { id: 'a6', coach_id: coachId, renews_id: 'a4', status: 'draft' }], versions: [v('v4', 'a4', sessionsT)], clients }).filter((i) => i.kind === 'renew').length, 0);
});

test('overdue: in Needs you with a reminder waiting or owed, never also in Who needs attention', () => {
  const inv = { id: 'i1', coach_id: coachId, profile_id: 'p1', status: 'sent', number: 1243, total_minor: 300000, paid_minor: 0, due_on: '2026-11-11', currency: 'GBP' };
  const waiting = [{ id: 'r1', invoice_id: 'i1', stage: 14, drafted_at: '2026-11-25T03:15:00Z' }];
  assert.equal(d.overdueInNeedsYou(inv, { reminders: waiting, coachId, today }), true);
  const [it] = d.needsYouItems({ coachId, today, now, invoices: [inv], invoiceReminders: waiting, clients });
  assert.equal(it.title, 'Reminder ready for Sam Reid');
  assert.equal(it.line, 'CLARITY-1243, £3,000, 14 days overdue');
  // One that may have gone stays with Who needs attention's Send again; a paused payer is in neither list as a reminder.
  assert.equal(d.overdueInNeedsYou(inv, { reminders: [...waiting, { id: 'r0', invoice_id: 'i1', stage: 7, sending_at: '2026-11-20T00:00:00Z' }], coachId, today }), false);
  assert.equal(d.overdueInNeedsYou(inv, { reminders: waiting, pauses: [{ profile_id: 'p1' }], coachId, today }), false);
  assert.equal(d.overdueInNeedsYou({ ...inv, coach_id: 'someone else' }, { reminders: waiting, coachId, today }), false);
  // Stage D, item 15: owed and not drafted yet (the nightly round hadn't run) is in Needs you too, so it and Finances
  // agree; under 3 days overdue nothing is owed yet, and Who needs attention keeps it.
  assert.equal(d.overdueInNeedsYou(inv, { reminders: [], coachId, today }), true);
  assert.equal(d.overdueInNeedsYou({ ...inv, due_on: '2026-11-23' }, { reminders: [], coachId, today }), false);
});

test('a purchase order held, a supplier portal to upload to, a change asked for, the pound moved', () => {
  const invoices = [
    { id: 'i2', coach_id: coachId, organisation_id: 'o1', status: 'draft', number: null, total_minor: 600000, created_at: '2026-11-24T10:00:00Z' },
    { id: 'i3', coach_id: coachId, organisation_id: 'o1', status: 'sent', number: 1251, total_minor: 150000, sent_at: '2026-11-25T10:00:00Z', emailed_at: '2026-11-25T10:00:00Z' },
  ];
  const profiles = [{ coach_id: coachId, organisation_id: 'o1', needs_po: true, supplier_portal: true }];
  const items = d.needsYouItems({ coachId, today, now, invoices, profiles, organisations, clients });
  assert.deepEqual(items.map((i) => i.title).sort(), ['Northfield Logistics needs a purchase order', 'Upload CLARITY-1251 to Northfield Logistics’ supplier portal'].sort());
  assert.equal(items.find((i) => i.kind === 'po').line, 'An invoice for £6,000 is waiting');
  const agreements = [{ id: 'a7', coach_id: coachId, profile_id: 'p1', status: 'signed' }];
  const versions = [{ id: 'v7', agreement_id: 'a7', coach_id: coachId, version: 1, status: 'sent', clauses: [{ key: 'ending', number: 8, title: 'Ending and changes' }], terms: {} }];
  const [ch] = d.needsYouItems({ coachId, today, now, agreements, versions, clients, changeRequests: [{ id: 'q1', version_id: 'v7', coach_id: coachId, clause_key: 'ending', words: 'Could the notice be 14 days?', created_at: '2026-11-23T10:00:00Z' }] });
  assert.equal(ch.title, 'Sam Reid asked for a change to their agreement');
  assert.equal(ch.line, '8. Ending and changes');
  // €: signed at 1.19 to the pound, today 1.30: the pound value is down 8%.
  const eur = [v('v8', 'a7', { kind: 'sessions', currency: 'EUR', settle: 'equal', blocks: [{ n: 16, minutes: 60 }] }, { fx_rate: 1.19 })];
  const fx = d.needsYouItems({ coachId, today, now, agreements, versions: eur, clients, fxToday: { EUR: 1.3 } }).find((i) => i.kind === 'fx');
  assert.equal(fx.title, 'The pound value of Sam Reid’s next invoice is down 8%');
  assert.equal(d.needsYouItems({ coachId, today, now, agreements, versions: eur, clients, fxToday: { EUR: 1.2 } }).filter((i) => i.kind === 'fx').length, 0);
});

test('Done and Not now take an item off; Not now brings it back on its day', () => {
  const items = [{ key: 'renew:a4:2027-02-12', kind: 'renew', day: today }, { key: 'po:o1', kind: 'po', day: today }];
  const rows = [doneRow(coachId, 'po:o1'), doneRow(coachId, 'renew:a4:2027-02-12', { state: 'not_now', until: d.notNowUntil('renew', today) })];
  assert.equal(visible(items, rows, today).length, 0);
  assert.equal(d.notNowUntil('renew', today), '2026-12-02');
  assert.equal(d.notNowUntil('delivered', today), '2026-11-26');
  assert.equal(visible(items, rows, '2026-12-02').length, 1);
});

test('the owner’s approvals only', () => {
  const allAgreements = [{ id: 'a9', coach_id: 'c2', approval: 'waiting', profile_id: 'px' }];
  const coaches = [{ coach_id: 'c2', first_name: 'Priya', last_name: 'Shah' }];
  const admin = [{ profile_id: 'px', name: 'Kai Thompson' }];
  const allVersions = [{ id: 'v9', agreement_id: 'a9', version: 1, terms: { coaching: '6-month coaching' } }];
  const [it] = d.needsYouItems({ coachId, today, now, isOwner: true, allAgreements, allVersions, coaches, admin });
  assert.equal(it.title, 'Priya Shah made an agreement for you to approve');
  assert.equal(it.line, 'Kai Thompson, 6-month coaching');
  assert.equal(d.needsYouItems({ coachId, today, now, isOwner: false, allAgreements, allVersions, coaches, admin }).length, 0);
});

test('the agreement page: sessions counted, its panels’ dates, and Cancel within 14 days never for a funded client', () => {
  const t = { kind: 'sessions', blocks: [{ n: 1, minutes: 90 }, { n: 15, minutes: 60 }], startsOn: '2027-01-04', endsOn: '2027-07-02', fullTerm: true };
  const a = { id: 'a1', profile_id: 'p1' };
  const sessions = [
    { id: 'x0', profile_id: 'p1', starts_at: '2026-12-20T10:00:00Z', outcome: 'held' },
    { id: 'x1', profile_id: 'p1', starts_at: '2027-01-04T10:00:00Z', outcome: 'held', outcome_source: 'fathom' },
    { id: 'x2', profile_id: 'p1', starts_at: '2027-01-11T10:00:00Z', outcome: 'late_cancel' },
    { id: 'x3', profile_id: 'p1', starts_at: '2027-01-18T10:00:00Z', outcome: 'moved' },
    { id: 'x4', profile_id: 'p1', group_id: 'g1', kind: 'group', starts_at: '2027-01-19T10:00:00Z', outcome: 'held' },
  ];
  const list = d.agreementSessions({ agreement: a, terms: t, sessions });
  assert.deepEqual(list.map((s) => s.id), ['x1', 'x2', 'x3']);
  assert.equal(d.sessionsIn(t), 16);
  // This year's days without their year (writing rule 28); another year's with it.
  assert.deepEqual(d.pauseFromOptions('2027-02-24').map((o) => o.label), ['Mon 1 Mar', 'Mon 8 Mar', 'Mon 15 Mar']);
  assert.deepEqual(d.pauseFromOptions('2026-12-20').map((o) => o.label), ['Mon 21 Dec', 'Mon 28 Dec', 'Mon 4 Jan 2027']);
  assert.deepEqual(d.pauseToOptions('2027-03-01').map((o) => o.label), ['Fri 26 Mar 2027', 'Fri 9 Apr 2027', 'Fri 30 Apr 2027']);
  assert.deepEqual(d.pauseToOptions('2027-03-01', '2027-02-24').map((o) => o.label), ['Fri 26 Mar', 'Fri 9 Apr', 'Fri 30 Apr']);
  assert.deepEqual(d.priceFromOptions('2027-01-04').map((o) => o.label), ['Mon 4 Jan 2027', 'Mon 1 Feb 2027', 'Mon 1 Mar 2027']);
  assert.deepEqual(d.priceFromOptions('2026-12-14', '2026-11-25').map((o) => o.label), ['Mon 14 Dec', 'Mon 4 Jan 2027', 'Mon 1 Feb 2027']);
  assert.deepEqual(d.endEarlyOptions('2026-11-25', '2027-07-02').map((o) => o.label), ['Fri 25 Dec', 'Fri 22 Jan 2027', 'Fri 19 Feb 2027']);
  assert.deepEqual(d.logDays('2026-11-25').map((o) => o.label), ['Wed 25 Nov', 'Tue 24 Nov', 'Mon 23 Nov', 'Fri 20 Nov']);
  assert.equal(d.endEarlyLine(t), 'Only by agreement, when something exceptional happens');
  assert.equal(d.endEarlyLine({ fullTerm: false }), '30 days’ notice in writing');
  assert.ok(d.endEarlyOptions('2026-11-25', '2027-07-02').every((o) => o.value < '2027-07-02'));
  // 14 days: offered to a self-funded client inside them, never when an organisation funds it; the refund less the sessions had.
  assert.equal(offered({ terms: { kind: 'sessions', funder: 'self' }, signedDay: '2026-11-20', today }), true);
  assert.equal(offered({ terms: { kind: 'sessions', funder: 'org', fundedBy: 'Northfield' }, signedDay: '2026-11-20', today }), false);
  assert.equal(offered({ terms: { kind: 'sessions', funder: 'self' }, signedDay: '2026-11-10', today }), false);
  assert.equal(refund14({ paidMinor: 300000, sessionsHad: 1, perSessionMinor: 112500, startNow: true }), 187500);
  assert.equal(d.statusLine({ status: 'signed' }, { version: 1, status: 'signed', client_signed_at: signedAt }), 'Version 1, signed');
  assert.equal(d.statusLine({ status: 'sent' }, { version: 2, status: 'sent' }), 'Version 2, not signed yet');
  assert.equal(d.agreementTitle('Sam Reid'), 'Sam’s agreement');
  // An organisation by its whole name (Stage D, DG item 8).
  assert.equal(d.agreementTitle('Harbour Rowing', { whole: true }), 'Harbour Rowing’s agreement');
});
