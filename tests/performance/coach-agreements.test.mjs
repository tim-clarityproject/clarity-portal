// Phase 6b run 1, the coach's side (M11 B1, B3 and B4; migration 061): a client's Agreement fold, the money on
// Everything, and overdue invoices in Who needs attention, for the coach and for the owner. The rules are
// src/lib/coach/agreements.js; Who needs attention is day.js's attentionRows.
import test from 'node:test';
import assert from 'node:assert/strict';
import { agreementFold, agreementSections, clientAgreement, moneyTimeline, overdueRows } from '../../src/lib/coach/agreements.js';
import { attentionRows } from '../../src/lib/coach/day.js';
import { timeline, TIMELINE_KINDS } from '../../src/lib/coach/model.js';
import { coachRowsWaiting, READ_ONLY_TABLES } from '../../src/lib/coach/copyWaiting.js';
import { PROBE_TABLES } from '../../src/lib/coach/screenPlan.js';

const TODAY = '2026-11-24';
const TIM = 'coach-tim';
const MAYA = 'coach-maya';
const kestrel = { id: 'org-kestrel', name: 'Kestrel Group' };
const northfield = { id: 'org-north', name: 'Northfield Logistics' };
const sam = { id: 'p-sam', name: 'Sam Okafor', coach_id: TIM, organisation_id: kestrel.id, status: 'active' };
const leo = { id: 'p-leo', name: 'Leo Grant', coach_id: TIM, organisation_id: northfield.id, status: 'active' };
const contacts = [
  { id: 'c1', organisation_id: kestrel.id, name: 'Dana Whitfield', roles: ['sponsor'], job_title: 'Chief people officer' },
  { id: 'c2', organisation_id: kestrel.id, name: 'Lee Hart', roles: ['invoices'], job_title: 'Finance' },
  { id: 'c3', organisation_id: northfield.id, name: 'Ruth Adams', roles: ['sponsor', 'invoices'], job_title: 'HR director' },
];
const samAgreement = { id: 'a-sam', coach_id: TIM, kind: 'coaching', profile_id: sam.id, status: 'signed', current_version: 1, created_at: '2026-09-01T09:00:00+00:00' };
const samVersion = {
  id: 'v-sam-1', agreement_id: 'a-sam', coach_id: TIM, version: 1, status: 'signed', funded_by: 'Kestrel Group', currency: 'GBP', total_minor: 1346000,
  terms: { coaching: '6-month coaching', sessions: 12, minutes: 60, rhythm: 'every 2 weeks', startsOn: '2026-09-07', endsOn: '2027-03-08', fundedBy: 'Kestrel Group', expenses: true },
  clauses: [], sent_at: '2026-09-04T10:00:00+00:00', coach_signed_at: '2026-09-04T10:00:00+00:00', client_signed_at: '2026-09-07T08:15:00+00:00',
};

test('Sam’s Agreement fold: the summary and M11’s rows, in M11’s order', () => {
  const fold = agreementFold({ agreements: [samAgreement], versions: [samVersion], profileId: sam.id, contacts, organisation: kestrel, zone: 'Europe/London', todayKey: TODAY });
  assert.equal(fold.summary, '6-month coaching, signed Mon 7 Sep');
  assert.deepEqual(fold.rows, [
    { label: 'Funded by', value: 'Kestrel Group' },
    { label: 'Coaching sessions', value: '12 of 60 minutes, every 2 weeks' },
    { label: 'Sponsor', value: 'Dana Whitfield' },
    { label: 'Invoices contact', value: 'Lee Hart, finance' },
    { label: 'Expenses allowed', value: 'Yes' },
    { label: 'Ends', value: 'Mon 8 Mar 2027' },
  ]);
});

test('Leo: one contact as sponsor and invoices contact reads the name alone; the terms can name them too', () => {
  const a = { ...samAgreement, id: 'a-leo', profile_id: leo.id };
  const v = { ...samVersion, id: 'v-leo', agreement_id: 'a-leo', funded_by: 'Northfield Logistics', client_signed_at: '2026-11-13T12:00:00+00:00',
    terms: { ...samVersion.terms, endsOn: '2027-05-14', fundedBy: 'Northfield Logistics' } };
  const fold = agreementFold({ agreements: [a], versions: [v], profileId: leo.id, contacts, organisation: northfield, zone: 'Europe/London', todayKey: TODAY });
  assert.equal(fold.summary, '6-month coaching, signed Fri 13 Nov');
  assert.deepEqual(fold.rows.map((r) => `${r.label}: ${r.value}`), ['Funded by: Northfield Logistics', 'Coaching sessions: 12 of 60 minutes, every 2 weeks', 'Sponsor: Ruth Adams',
    'Invoices contact: Ruth Adams', 'Expenses allowed: Yes', 'Ends: Fri 14 May 2027']);
  // Named in the terms (an associate reads no organisation contacts): the terms' own names.
  const typed = { ...v, terms: { ...v.terms, sponsor: 'Ruth Adams', invoicesContact: { name: 'Ruth Adams' } } };
  const fromTerms = agreementFold({ agreements: [a], versions: [typed], profileId: leo.id, contacts: [], organisation: null, zone: 'Europe/London', todayKey: TODAY });
  assert.deepEqual(fromTerms.rows.filter((r) => /Sponsor|Invoices/.test(r.label)).map((r) => r.value), ['Ruth Adams', 'Ruth Adams']);
});

test('Marcus, time credit: the Credit row with what is left at the rate, and no Ends row without an end', () => {
  const a = { ...samAgreement, id: 'a-marcus', profile_id: 'p-marcus' };
  const v = { ...samVersion, id: 'v-marcus', agreement_id: 'a-marcus', funded_by: 'Northfield Logistics', total_minor: 200000, client_signed_at: '2026-08-03T09:00:00+00:00',
    terms: { coaching: 'Time credit', kind: 'time_credit', rate: { minor: 15000, per: 'hour' }, fundedBy: 'Northfield Logistics', expenses: true } };
  const engagement = { id: 'e-marcus', profile_id: 'p-marcus', time_credit_minutes: 800, default_minutes: 60 };
  const fold = agreementFold({ agreements: [a], versions: [v], profileId: 'p-marcus', engagement, credit: { total: 800, left: 130 }, contacts, organisation: northfield, zone: 'Europe/London', todayKey: TODAY });
  assert.equal(fold.summary, 'Time credit, signed Mon 3 Aug');
  assert.deepEqual(fold.rows.map((r) => r.label), ['Funded by', 'Credit', 'Sponsor', 'Invoices contact', 'Expenses allowed']);
  assert.equal(fold.rows[1].value, '£2,000 at £150/hr, with £325 to go');
});

test('only rows whose data exists; a version sent and not signed; a draft or no agreement shows no fold', () => {
  const bare = { ...samVersion, funded_by: null, status: 'sent', client_signed_at: null, terms: { coaching: '6-month coaching' } };
  const fold = agreementFold({ agreements: [{ ...samAgreement, status: 'sent' }], versions: [bare], profileId: sam.id, zone: 'Europe/London', todayKey: TODAY });
  assert.equal(fold.summary, '6-month coaching, sent Fri 4 Sep, waiting to be signed');
  assert.deepEqual(fold.rows, [], 'nothing typed, nothing shown: never a row with nothing in it');
  // The engagement fills what the terms leave out.
  const eng = { sessions_total: 6, default_minutes: 90, every_weeks: 1, ends_on: '2027-01-29', funded_by: null };
  const withEng = agreementFold({ agreements: [{ ...samAgreement, status: 'sent' }], versions: [bare], profileId: sam.id, engagement: eng, zone: 'Europe/London', todayKey: TODAY });
  assert.deepEqual(withEng.rows, [{ label: 'Coaching sessions', value: '6 of 90 minutes, every week' }, { label: 'Ends', value: 'Fri 29 Jan 2027' }]);
  assert.equal(agreementFold({ agreements: [], versions: [], profileId: sam.id, zone: 'Europe/London', todayKey: TODAY }), null);
  const draft = { ...samAgreement, status: 'draft' };
  assert.equal(agreementFold({ agreements: [draft], versions: [{ ...samVersion, status: 'draft', client_signed_at: null }], profileId: sam.id, zone: 'Europe/London', todayKey: TODAY }), null);
  assert.equal(clientAgreement({ agreements: [samAgreement], versions: [samVersion], profileId: leo.id }), null, 'another client’s agreement is never theirs');
});

test('a new version being drafted after signing: the fold keeps the signed one', () => {
  const a = { ...samAgreement, current_version: 2 };
  const v2 = { ...samVersion, id: 'v-sam-2', version: 2, status: 'draft', client_signed_at: null, terms: { coaching: '6-month coaching, renewed' } };
  const fold = agreementFold({ agreements: [a], versions: [samVersion, v2], profileId: sam.id, zone: 'Europe/London', todayKey: TODAY });
  assert.equal(fold.version.id, 'v-sam-1');
  assert.equal(fold.summary, '6-month coaching, signed Mon 7 Sep');
});

test('the signed day is the coach’s own day, through the time library (no device clock)', () => {
  const late = { ...samVersion, client_signed_at: '2026-09-07T23:30:00+00:00' };
  const at = (zone) => agreementFold({ agreements: [samAgreement], versions: [late], profileId: sam.id, zone, todayKey: TODAY }).summary;
  assert.equal(at('Europe/London'), '6-month coaching, signed Tue 8 Sep');
  assert.equal(at('America/New_York'), '6-month coaching, signed Mon 7 Sep');
  // A database reading with no zone ending is UTC (CLAUDE.md rule 19).
  const bareTs = { ...samVersion, client_signed_at: '2026-09-07 23:30:00' };
  assert.equal(agreementFold({ agreements: [samAgreement], versions: [bareTs], profileId: sam.id, zone: 'Europe/London', todayKey: TODAY }).summary, '6-month coaching, signed Tue 8 Sep');
});

test('the agreement’s full text: its signed sections first, else the approved wording from its terms', () => {
  const stored = { ...samVersion, clauses: [{ key: '4', title: 'Rearranging and cancelling', text: '12 hours' }] };
  assert.deepEqual(agreementSections(stored), [{ key: '4', title: 'Rearranging and cancelling', paragraphs: ['12 hours'] }]);
  const made = agreementSections(samVersion, { clientName: 'Sam Okafor', clientEmail: 'sam@example.com', coachName: 'Dr. Tim Dutton' });
  assert.ok(made.length > 5);
  assert.equal(made.some((c) => /Your investment/.test(c.title || '')), false, 'a funded client’s agreement has no money section');
  assert.match(made[0].paragraphs[0], /Sam Okafor of sam@example\.com/);
  assert.equal(made.some((c) => c.paragraphs.some((p) => /\[|\]/.test(p))), false, 'no bracket is ever left');
});

test('Everything: Payments sits after Files in the Show list (M11 B4), Time and Engagement last', () => {
  assert.deepEqual(TIMELINE_KINDS.map((k) => k.label), ['Everything', 'Notes', 'Files', 'Payments', 'Time', 'Engagement']);
});

const invoices = [
  { id: 'i-1031', coach_id: TIM, profile_id: sam.id, organisation_id: kestrel.id, number: 1231, status: 'paid', currency: 'GBP', total_minor: 225000, paid_minor: 225000, paid_at: '2026-11-02T10:00:00+00:00', settles_to: 'organisation' },
  { id: 'i-open', coach_id: TIM, profile_id: sam.id, number: 1240, status: 'sent', currency: 'GBP', total_minor: 225000, paid_minor: 0, due_on: '2026-12-01' },
  { id: 'i-leo', coach_id: TIM, profile_id: leo.id, number: 1232, status: 'paid', currency: 'GBP', total_minor: 100000, paid_minor: 100000, paid_at: '2026-11-03T10:00:00+00:00' },
];

test('Everything’s money: a settled invoice on its settled day, and the signed agreement as a file', () => {
  const items = moneyTimeline({ invoices, payments: [], agreements: [samAgreement], versions: [samVersion], profileId: sam.id, zone: 'Europe/London' });
  assert.deepEqual(items.map((i) => [i.kind, i.day, i.title, i.line]), [
    ['payment', '2026-11-02', 'Invoice CLARITY-1231 settled', 'Payment, £2,250'],
    ['file', '2026-09-07', 'Agreement signed', 'File, 6-month coaching'],
  ]);
  // Through the page's own timeline: with Payments chosen only the invoice shows; with Files the agreement.
  const only = (kind) => timeline({ more: items }, { kind }).map((i) => i.title);
  assert.deepEqual(only('payment'), ['Invoice CLARITY-1231 settled']);
  assert.deepEqual(only('file'), ['Agreement signed']);
  assert.deepEqual(only('all'), ['Invoice CLARITY-1231 settled', 'Agreement signed'], 'newest first');
  assert.deepEqual(timeline({ more: items }, { kind: 'all', q: 'clarity-1231' }).map((i) => i.id), ['i:i-1031'], 'searched by its number');
});

test('a payment’s day and amount come from its payments when the invoice doesn’t carry them', () => {
  const inv = { id: 'i-x', coach_id: TIM, profile_id: sam.id, number: 1250, status: 'paid', currency: 'USD', total_minor: 300000, paid_minor: 0, paid_at: null };
  const pays = [{ id: 'p1', invoice_id: 'i-x', amount_minor: 100000, paid_at: '2026-10-01T09:00:00+00:00' }, { id: 'p2', invoice_id: 'i-x', amount_minor: 200000, paid_at: '2026-10-20T23:30:00+00:00' }];
  const [item] = moneyTimeline({ invoices: [inv], payments: pays, agreements: [], versions: [], profileId: sam.id, zone: 'Europe/London' });
  assert.equal(item.day, '2026-10-21');
  assert.equal(item.line, 'Payment, $3,000');
});

// ---------------------------------------------------------------- Who needs attention: overdue invoices
const NOW = Date.parse('2026-11-24T10:00:00Z');
const owed = (over) => ({ id: 'i-north', coach_id: TIM, profile_id: leo.id, organisation_id: northfield.id, number: 1242, status: 'sent', currency: 'GBP', total_minor: 480000, paid_minor: 0, due_on: '2026-11-17', settles_to: 'organisation', ...over });
const mayaClient = { profile_id: 'p-owen', name: 'Owen Price', coach_id: MAYA, coach_first_name: 'Maya', organisation_id: kestrel.id, organisation_name: 'Kestrel Group' };
const mayas = { id: 'i-owen', coach_id: MAYA, profile_id: 'p-owen', organisation_id: kestrel.id, number: 1243, status: 'sent', currency: 'GBP', total_minor: 90000, paid_minor: 0, due_on: '2026-11-21', settles_to: 'client' };

test('the coach’s own overdue invoice: the organisation that settles it, the amount and the days, on the payer’s clock', () => {
  const rows = overdueRows({ invoices: [owed()], coachId: TIM, isOwner: true, clients: [sam, leo], organisations: [northfield, kestrel], now: NOW, coachZone: 'Europe/London' });
  assert.deepEqual(rows.map(({ days, ...r }) => r), [{ key: 'o:i-north', profileId: leo.id, name: 'Northfield Logistics', line: 'An invoice for £4,800 is 7 days overdue.', action: 'View the invoice', to: `/coach/clients/${leo.id}`, state: { view: 'all', show: 'payment' } }]);
  // A client who settles their own: the client's name. What is left of it, once part is in.
  const own = overdueRows({ invoices: [owed({ settles_to: 'client', paid_minor: 80000 })], coachId: TIM, clients: [leo], organisations: [northfield], now: NOW, coachZone: 'Europe/London' });
  assert.equal(own[0].name, 'Leo Grant');
  assert.equal(own[0].line, 'An invoice for £4,000 is 7 days overdue.');
  // At 02:00 UTC it is still 23 Nov in Los Angeles (6 days) and already 24 Nov in London (7 days).
  const early = Date.parse('2026-11-24T02:00:00Z');
  assert.match(overdueRows({ invoices: [owed({ payer_zone: 'America/Los_Angeles' })], coachId: TIM, clients: [leo], organisations: [northfield], now: early, coachZone: 'Europe/London' })[0].line, /6 days overdue/);
  assert.match(overdueRows({ invoices: [owed()], coachId: TIM, clients: [leo], organisations: [northfield], now: early, coachZone: 'Europe/London' })[0].line, /7 days overdue/, 'no payer zone: the coach’s');
  assert.match(overdueRows({ invoices: [owed({ due_on: '2026-11-23' })], coachId: TIM, clients: [leo], organisations: [northfield], now: NOW, coachZone: 'Europe/London' })[0].line, /is 1 day overdue\.$/);
});

test('never overdue: due today or later, settled, void, a draft, or nothing left to settle', () => {
  const none = (over) => overdueRows({ invoices: [owed(over)], coachId: TIM, isOwner: true, clients: [leo], organisations: [northfield], now: NOW, coachZone: 'Europe/London' });
  assert.deepEqual(none({ due_on: '2026-11-24' }), []);
  assert.deepEqual(none({ status: 'paid' }), []);
  assert.deepEqual(none({ status: 'void' }), []);
  assert.deepEqual(none({ status: 'draft' }), []);
  assert.deepEqual(none({ status: 'uncollectible' }), []);
  assert.deepEqual(none({ paid_minor: 480000 }), []);
  assert.deepEqual(none({ number: null }), []);
});

test('the owner also sees an associate’s overdue invoice, by the client’s name, with no amount, opening the admin view (follow-up 5)', () => {
  const rows = overdueRows({ invoices: [mayas, owed()], coachId: TIM, isOwner: true, clients: [leo], admin: [mayaClient], organisations: [northfield, kestrel], now: NOW, coachZone: 'Europe/London' });
  assert.deepEqual(rows.map((r) => [r.name, r.line, r.to]), [
    ['Northfield Logistics', 'An invoice for £4,800 is 7 days overdue.', `/coach/clients/${leo.id}`],
    ['Owen Price', 'An invoice for Maya’s client is 3 days overdue.', `/coach/clients/${mayaClient.profile_id}`],
  ]);
});

test('an associate sees only their own overdue invoices', () => {
  const rows = overdueRows({ invoices: [mayas, owed()], coachId: MAYA, isOwner: false, clients: [{ id: 'p-owen', name: 'Owen Price', coach_id: MAYA, status: 'active' }], organisations: [], now: NOW, coachZone: 'Europe/London' });
  assert.deepEqual(rows.map((r) => [r.name, r.line, r.to]), [['Owen Price', 'An invoice for £900 is 3 days overdue.', '/coach/clients/p-owen']]);
});

test('Who needs attention lists the overdue invoices first, before the recaps, then its own rows in their order (follow-up 5, item 9)', () => {
  // Leo has a recap written and not sent yet.
  const sessions = [{ id: 's-leo', profile_id: leo.id, starts_at: '2026-11-23T10:00:00Z', minutes: 60, outcome: 'held', recap: 'We agreed the plan.', recap_sent_at: null }];
  const before = attentionRows({ clients: [leo], engagements: [], sessions, now: NOW, todayKey: TODAY });
  assert.ok(before.some((r) => r.key === 'r:s-leo'), 'the recap row is there');
  const after = attentionRows({ clients: [leo], engagements: [], sessions, now: NOW, todayKey: TODAY, invoices: [owed(), mayas], coachId: TIM, isOwner: true, admin: [mayaClient], organisations: [northfield, kestrel], coachZone: 'Europe/London' });
  assert.deepEqual(after.slice(0, 2).map((r) => r.key), ['o:i-north', 'o:i-owen']);
  assert.deepEqual(after.slice(2), before);
  // No invoices passed (before 061): exactly as before.
  assert.deepEqual(attentionRows({ clients: [leo], sessions, now: NOW, todayKey: TODAY }), before);
});

// ---------------------------------------------------------------- the store
test('the store never sends what the server writes, and looks for 061 by its agreements table (TABLES: coach-store-merge.test.mjs)', () => {
  for (const t of ['invoices', 'payments', 'credit_notes', 'invoice_reminders', 'agreement_change_requests']) assert.ok(READ_ONLY_TABLES.has(t), `${t} is only read`);
  for (const t of ['agreements', 'agreement_versions', 'expenses', 'invoice_reminder_pauses']) assert.equal(READ_ONLY_TABLES.has(t), false, `${t} is the coach’s own`);
  assert.equal(PROBE_TABLES.at(-1), 'agreements', '061 is looked for by its agreements table');
  // An invoice read from the database never counts as waiting to be sent at Sign out.
  assert.equal(coachRowsWaiting({ rows: { invoices: { a: { id: 'a' } }, payments: { b: { id: 'b' } }, agreements: { c: { id: 'c' } } }, marks: {} }), 1);
});

test('functionality tester, follow-up 5: a reminder that may have gone is its own coach\'s to check, on Today; Needs you shows only the owner\'s own', async () => {
  const { needsYouRows } = await import('../../src/lib/coach/financeData.js');
  const inv = { ...owed(), id: 'i-unsure', coach_id: TIM };
  const theirs = { ...mayas, id: 'i-maya' };
  const old = new Date(new Date(NOW).getTime() - 10 * 60 * 1000).toISOString();
  const reminders = [{ id: 'r-tim', invoice_id: 'i-unsure', coach_id: TIM, sending_at: old, sent_at: null },
    { id: 'r-maya', invoice_id: 'i-maya', coach_id: MAYA, sending_at: old, sent_at: null }];
  const tim = attentionRows({ clients: [leo], sessions: [], now: NOW, todayKey: TODAY, invoices: [inv, theirs], coachId: TIM, isOwner: true, admin: [mayaClient], organisations: [northfield, kestrel], coachZone: 'Europe/London', reminders });
  assert.deepEqual(tim.filter((r) => r.reminderId).map((r) => [r.reminderId, r.action]), [['r-tim', 'Send again']]);
  const maya = attentionRows({ clients: [{ id: 'p-owen', name: 'Owen Price', coach_id: MAYA, status: 'active' }], sessions: [], now: NOW, todayKey: TODAY, invoices: [theirs], coachId: MAYA, organisations: [], coachZone: 'Europe/London', reminders });
  assert.deepEqual(maya.filter((r) => r.reminderId).map((r) => r.reminderId), ['r-maya']);
  const needs = needsYouRows({ invoices: [inv, theirs], today: TODAY, reminders, nowMs: new Date(NOW).getTime(), coachId: TIM });
  assert.deepEqual(needs.filter((r) => r.reminderId).map((r) => r.reminderId), ['r-tim']);
});
