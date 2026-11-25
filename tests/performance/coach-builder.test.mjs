// src/lib/coach/agreementBuilder.js: starting an agreement from the coach's side (Phase 6b run 3, Group B; M28
// s-client, s-start, s-packages, the builders, s-library, s-clause, s-check, s-sign and s-sent).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as b from '../../src/lib/coach/agreementBuilder.js';
import { overrideFor } from '../../src/lib/agreements/clauses.js';

const SESSIONS = { id: 'p1', name: '6-month coaching', agreement_kind: 'sessions', personal_price_minor: 1800000, org_price_minor: 2400000, currency: 'GBP',
  personal_note: 'It was good to talk, [name]. Here’s everything we agreed.',
  defaults: { blocks: [{ n: 1, minutes: 90 }, { n: 15, minutes: 60 }], rhythm: 'Weekly for 6 weeks, then every 2 weeks', place: 'either', priceMode: 'total', settle: 'equal', fullTerm: true, offerUpfront: true } };
const RETAINER = { id: 'p2', name: 'Monthly retainer', agreement_kind: 'retainer', personal_price_minor: 300000, currency: 'GBP', defaults: { retainer: { sessions: 'Up to 2 a month, 60 minutes each', invoice: 'monthly' } } };
const TEAM = { id: 'p3', name: 'Team programme', agreement_kind: 'team', org_price_minor: 2700000, currency: 'GBP', defaults: {} };
const ONEOFF = { id: 'p4', name: 'Health Check and debrief', agreement_kind: 'oneoff', detail: 'One Health Check and a 90-minute debrief', personal_price_minor: 150000, currency: 'GBP', defaults: { oneoff: { place: 'zoom', settle: 'before' } } };
const HOURS = { id: 'p5', name: 'Block of hours', agreement_kind: 'hours', personal_price_minor: 200000, currency: 'GBP', defaults: { hours: { rateMinor: 15000, owner: 'client', tellAt80: true } } };
const coach = { id: 'c1', full_name: 'Dr. Tim Dutton', display_first_name: 'Tim' };
const sam = { id: '11111111-1111-4111-8111-111111111111', name: 'Sam Reid', organisation_id: null };
const ids = { agreementId: 'a1', versionId: 'v1' };

test('who it is for comes from the address', () => {
  assert.deepEqual(b.startFor('client:11111111-1111-4111-8111-111111111111'), { kind: 'client', id: sam.id });
  assert.equal(b.startFor('org:nope'), null);
  assert.equal(b.startFor(''), null);
});

test('packages read as M28 draws them, on the start page and in Settings', () => {
  assert.deepEqual(b.packageRow(SESSIONS), { id: 'p1', title: '6-month coaching', meta: '16 coaching sessions, £18,000', kind: 'sessions', short: 'Set sessions' });
  assert.equal(b.packageRow(RETAINER).meta, 'Up to 2 coaching sessions a month, £3,000/month');
  assert.equal(b.packageRow(TEAM, { funded: true }).meta, 'For an organisation, from £27,000');
  assert.equal(b.packageRow(ONEOFF).meta, 'One Health Check and a 90-minute debrief, £1,500');
  assert.equal(b.packageRow(HOURS).meta, 'Bought up front, £150/hr');
  assert.equal(b.packageRow(RETAINER, { where: 'settings' }).meta, '£3,000/month');
  assert.equal(b.packageRow(TEAM, { where: 'settings' }).meta, 'From £27,000');
  assert.equal(b.packageRow(HOURS, { where: 'settings' }).meta, '£150/hr');
});

test('a new draft from a package: the agreement, its first version, the note with the name filled in', () => {
  const d = b.newDraft({ pkg: SESSIONS, who: { profile: sam }, coach, ids, todayKey: '2026-11-25' });
  assert.equal(d.agreement.kind, 'coaching');
  assert.equal(d.agreement.agreement_kind, 'sessions');
  assert.equal(d.agreement.package_id, 'p1');
  assert.equal(d.agreement.status, 'draft');
  assert.equal(d.version.version, 1);
  assert.equal(d.version.terms.startsOn, '2026-11-30');
  assert.equal(d.version.terms.healthCheck, false);
  assert.equal(d.version.terms.totalMinor, 1800000);
  assert.equal(d.version.personal_note, 'It was good to talk, Sam. Here’s everything we agreed.');
  assert.equal(d.version.terms.clientFirst, 'Sam');
  // In 6 monthly instalments the version's total is the full price; up front's 5% is the client's choice.
  assert.equal(d.version.total_minor, 1800000);
});

test('a team programme is the organisation’s sponsor agreement', () => {
  const org = { id: 'o1', name: 'Northfield Logistics' };
  const d = b.newDraft({ pkg: TEAM, who: { organisation: org }, coach, ids, todayKey: '2026-11-25' });
  assert.equal(d.agreement.kind, 'sponsor');
  assert.equal(d.agreement.organisation_id, 'o1');
  assert.equal(d.version.terms.team.totalMinor, 2700000);
  assert.equal(d.version.funded_by, 'Northfield Logistics');
});

test('the end date follows the start, the blocks and How often until the coach picks one', () => {
  let t = b.newDraft({ pkg: SESSIONS, who: { profile: sam }, coach, ids, todayKey: '2026-11-25' }).version.terms;
  t = b.withChange(t, { startsOn: '2027-01-04' });
  assert.equal(t.endsOn, '2027-07-02');
  assert.equal(b.builderLines(t).end, 'Worked out: the last coaching session is in the week of Mon 28 Jun 2027.');
  t = b.withChange(t, { endsOn: '2027-07-16' });
  assert.equal(t.endsPicked, true);
  t = b.withChange(t, { rhythm: 'Weekly' });
  assert.equal(t.endsOn, '2027-07-16');
  assert.equal(b.builderLines(t).end, 'You chose this. Suggested: Fri 23 Apr 2027.');
  t = b.withChange(t, { endsOn: '2027-04-23' });
  assert.equal(t.endsPicked, false);
  assert.equal(b.endDays(t)[0].label, 'Fri 23 Apr 2027, suggested');
});

test('blocks, discounts and the lines under them', () => {
  let t = b.newDraft({ pkg: SESSIONS, who: { profile: sam }, coach, ids, todayKey: '2026-11-25' }).version.terms;
  assert.equal(b.builderLines(t).sessions, '16 coaching sessions, 16 hours 30 minutes in all.');
  t = b.addBlock(t);
  assert.equal(t.blocks.length, 3);
  t = b.removeBlock(t, 2);
  t = b.setBlock(t, 1, { n: 14 });
  assert.equal(b.builderLines(t).sessions, '15 coaching sessions, 15 hours 30 minutes in all.');
  t = b.setBlock(t, 1, { n: 15 });
  const { terms, problem } = b.addDiscount(t, { type: 'returning', amount: '15' });
  assert.equal(problem, null);
  assert.equal(b.builderLines(terms).fin, 'In all: £14,535.');
  assert.equal(b.builderLines({ ...terms, choice: 'plan' }).fin, 'In all: £15,300.');
  assert.equal(b.builderLines(terms).upfront, 'Up front: £14,535, saving £765.');
  assert.equal(b.builderLines(terms, { first: 'Sam' }).firstPay, 'Sam settles £14,535 when signing, as the last step of agreeing.');
  assert.equal(b.builderLines({ ...terms, choice: 'plan' }, { first: 'Sam' }).firstPay, 'Sam settles £2,550 when signing, as the last step of agreeing.');
  assert.equal(b.addDiscount(t, { type: 'reduced', amount: '' }).problem, 'Add how much off first.');
  const reduced = b.addDiscount(t, { type: 'reduced', amount: '500' }).terms;
  assert.deepEqual(reduced.discounts.at(-1), { type: 'reduced', amountMinor: 50000 });
});

test('funded by an organisation: nothing settled at signing', () => {
  let t = b.newDraft({ pkg: SESSIONS, who: { profile: sam }, coach, ids, todayKey: '2026-11-25' }).version.terms;
  t = b.withChange(t, { orgName: 'Northfield Logistics' });
  t = b.withChange(t, { funder: 'org' });
  assert.equal(t.fundedBy, 'Northfield Logistics');
  assert.equal(b.builderLines(t, { first: 'Sam' }).firstPay, 'Northfield Logistics is invoiced, so Sam settles nothing when signing.');
});

test('switching kind keeps who it is for and the terms, and starts the rest afresh', () => {
  const t = b.newDraft({ pkg: SESSIONS, who: { profile: sam }, coach, ids, todayKey: '2026-11-25' }).version.terms;
  const r = b.withChange({ ...t, noticeHours: 48 }, { kind: 'retainer' });
  assert.equal(r.kind, 'retainer');
  assert.equal(r.noticeHours, 48);
  assert.equal(r.clientFirst, 'Sam');
  assert.equal(r.retainer.sessions, 'Up to 2 a month, 60 minutes each');
  const h = b.withChange(t, { kind: 'hours' });
  assert.equal(h.offerUpfront, false);
});

test('the totals each kind saves', () => {
  const r = b.newDraft({ pkg: RETAINER, who: { profile: sam }, coach, ids, todayKey: '2026-11-25' }).version;
  assert.equal(r.total_minor, 1800000);
  assert.equal(b.builderLines(r.terms).upfront, '6 months up front: £17,100, saving £900.');
  const o = b.newDraft({ pkg: ONEOFF, who: { profile: sam }, coach, ids, todayKey: '2026-11-25' }).version;
  assert.equal(o.total_minor, 150000);
  assert.equal(o.terms.work, 'One Health Check and a 90-minute debrief');
  const h = b.newDraft({ pkg: HOURS, who: { profile: sam }, coach, ids, todayKey: '2026-11-25' }).version;
  assert.equal(b.builderLines(h.terms).block, 'That’s 13 hours 20 minutes, settled in full, up front.');
});

test('another currency: the £ line, the warning on what lands, and Match my £ price', () => {
  let t = b.newDraft({ pkg: SESSIONS, who: { profile: sam }, coach, ids, todayKey: '2026-11-25' }).version.terms;
  t = b.withChange(t, { currency: 'EUR', totalMinor: 2000000 });
  const fx = b.fxLines(t, { rate: 0.84, packageGbpMinor: 1800000 });
  assert.equal(fx.line, 'About £16,800 at today’s rate (1 EUR = £0.84), about £16,464 after Stripe converts it.');
  assert.equal(fx.warn, 'That’s £1,536 under your £18,000 price for this package.');
  assert.equal(fx.match, 2190000);
  const m = b.matched(t, fx.match);
  assert.equal(b.fxLines(m, { rate: 0.84, packageGbpMinor: 1800000 }).warn, '');
  assert.deepEqual(b.rateOf({ day: '2026-11-25', rates: { EUR: 1.25 } }, 'EUR'), { rate: 0.8, unitsPerGbp: 1.25, day: '2026-11-25' });
  const f = b.versionFields(m, { rate: { unitsPerGbp: 1.25 }, now: new Date('2026-11-25T12:00:00Z') });
  assert.equal(f.currency, 'EUR');
  assert.equal(f.fx_rate, 1.25);
  assert.equal(f.fx_at, '2026-11-25T12:00:00.000Z');
  assert.equal(b.versionFields(m, {}).currency, undefined, 'no rate yet: the version keeps its own currency until today’s rate is here');
  assert.deepEqual(b.sendProblems(m, {}), ['Today’s rate for that currency hasn’t loaded. Check your connection and try again.']);
});

test('the coach’s own standard: newest version per clause; "for everyone" makes the next version', () => {
  const rows = [
    { id: 's1', agreement_kind: 'sessions', clause_key: 'rearranging', version: 1, title: 'Rearranging and cancelling', paragraphs: [{ text: 'Old.', why: null }], created_at: '2026-11-20T10:00:00Z' },
    { id: 's2', agreement_kind: 'sessions', clause_key: 'rearranging', version: 2, title: 'Rearranging and cancelling', paragraphs: [{ text: 'New.', why: null }], created_at: '2026-11-25T10:00:00Z' },
    { id: 's3', agreement_kind: 'retainer', clause_key: 'rearranging', version: 5, title: 'X', paragraphs: [{ text: 'Y.' }] },
  ];
  const std = b.standardsFor(rows, 'sessions');
  assert.equal(std.rearranging.version, 2);
  const row = b.newStandardRow({ id: 'n', coachId: 'c1', kind: 'sessions', key: 'rearranging', title: 'Rearranging and cancelling', paragraphs: [{ text: ' Newer. ', why: '' }], standards: std });
  assert.equal(row.version, 3);
  assert.deepEqual(row.paragraphs, [{ text: 'Newer.', why: null }]);
  assert.equal(b.standardLine('sessions', rows, '2026-11-25'), '11 clauses, changed today');
  const t = b.newDraft({ pkg: SESSIONS, who: { profile: sam }, coach, ids, todayKey: '2026-11-25' }).version.terms;
  const lib = b.libraryRows(t, { standards: std, first: 'Sam', todayKey: '2026-11-25' });
  assert.equal(lib.find((r) => r.key === 'rearranging').line, 'Your standard, changed today');
  assert.equal(lib.find((r) => r.key === 'purpose').line, 'Your standard wording');
});

test('an edit just for Sam shows in the library, and the version stores it linked to its standard', () => {
  const t = b.newDraft({ pkg: SESSIONS, who: { profile: sam }, coach, ids, todayKey: '2026-11-25' }).version.terms;
  const over = { rearranging: overrideFor('rearranging', t, [{ text: 'You can rearrange up to 12 hours before.', why: 'Short notice.' }]) };
  const lib = b.libraryRows(t, { overrides: over, first: 'Sam' });
  assert.equal(lib.find((r) => r.key === 'rearranging').line, 'Edited for Sam');
  assert.equal(lib.find((r) => r.key === 'rearranging').label, '4. Rearranging and cancelling');
  const f = b.versionFields(t, { overrides: over });
  assert.equal(f.clauses.find((c) => c.key === 'rearranging').base, 'code');
  assert.equal(f.clauses.find((c) => c.key === 'rearranging').edited, true);
  // Where Sam chooses how to settle, the investment clause carries both texts.
  assert.ok(f.clauses.find((c) => c.key === 'investment').choices);
  assert.equal(b.differsFrom([{ text: 'a', why: '' }], [{ text: 'a', why: null }]), false);
});

test('a send: its body, and the rows the stand-in writes (never on the live site)', () => {
  const d = b.newDraft({ pkg: SESSIONS, who: { profile: sam }, coach, ids, todayKey: '2026-11-25' });
  assert.deepEqual(b.sendBody({ agreement: d.agreement, version: d.version, signatureId: 'sig', personalNote: ' Hello ' }),
    { agreementId: 'a1', versionId: 'v1', signatureId: 'sig', personalNote: 'Hello', sendAs: 'agreement' });
  assert.equal(b.sendBody({ agreement: d.agreement, version: d.version, sendAs: 'quote', validDays: 14, quoteId: 'q' }).validDays, 14);
  const s = b.sentRows({ agreement: d.agreement, version: d.version, signatureId: 'sig', sentAt: '2026-11-25T12:40:00Z', todayKey: '2026-11-25' });
  assert.equal(s.version.status, 'sent');
  assert.equal(s.version.expires_on, '2026-12-25');
  assert.equal(s.agreement.status, 'sent');
  const q = b.sentRows({ agreement: d.agreement, version: d.version, sentAt: 'x', sendAs: 'quote', todayKey: '2026-11-25' });
  assert.equal(q.version.status, 'draft');
  assert.equal(b.sendWords({ kind: 'sessions', first: 'Sam' }), 'Sign and send to Sam');
  assert.equal(b.sendWords({ kind: 'team' }), 'Sign and send to the sponsor');
});

test('the client page’s fold: none, a draft, waiting for approval, sent, opened, signed', () => {
  const now = new Date('2026-11-25T13:00:00');
  assert.equal(b.foldModel({ profileId: sam.id, first: 'Sam', now }).line, 'Sam has no agreement yet.');
  const a = { id: 'a1', profile_id: sam.id, kind: 'coaching', status: 'draft', approval: 'not_needed', created_at: '2026-11-25T10:00:00Z' };
  const v = { id: 'v1', agreement_id: 'a1', version: 1, status: 'draft', terms: {} };
  assert.equal(b.foldModel({ agreements: [a], versions: [v], profileId: sam.id, first: 'Sam', now }).line, 'Version 1 is a draft. Nothing has gone to Sam yet.');
  assert.equal(b.foldModel({ agreements: [{ ...a, approval: 'waiting' }], versions: [v], profileId: sam.id, first: 'Sam', now }).line, 'Version 1 is waiting for Tim to approve it.');
  const sent = { ...v, status: 'sent', sent_at: '2026-11-25T12:40:00', expires_on: '2026-12-25', terms: { startsOn: '2027-01-04', endsOn: '2027-07-02' } };
  const m = b.foldModel({ agreements: [{ ...a, status: 'sent' }], versions: [sent], profileId: sam.id, first: 'Sam', now });
  assert.equal(m.line, 'Version 1 is waiting for Sam to sign.');
  assert.equal(m.head, 'Agreement, version 1');
  assert.deepEqual(m.rows.map((r) => [r.label, r.value]), [['Sent', 'Today, 12:40'], ['Opened', 'Not yet'], ['Signed', 'Not yet'], ['Settled', 'Not yet']]);
  assert.equal(m.expiry, 'If Sam hasn’t signed, it runs out on Fri 25 Dec 2026. You can reopen it in one step.');
  const opened = b.foldModel({ agreements: [{ ...a, status: 'sent' }], versions: [sent], opens: [{ version_id: 'v1', opened_at: '2026-11-25T12:52:00' }], profileId: sam.id, first: 'Sam', now });
  assert.equal(opened.rows[1].value, 'Today, 12:52');
  const signed = b.foldModel({ agreements: [{ ...a, status: 'signed' }], versions: [{ ...sent, status: 'signed', client_signed_at: '2026-11-25T12:58:00' }], profileId: sam.id, first: 'Sam', now });
  assert.equal(signed.line, 'Version 1, signed. Mon 4 Jan 2027 to Fri 2 Jul 2027.');
  assert.equal(signed.expiry, 'Sam has signed, so nothing runs out.');
  const quote = b.foldModel({ agreements: [a], versions: [v], quotes: [{ id: 'q', version_id: 'v1', status: 'sent', number: 42, sent_at: '2026-11-25T12:40:00', valid_until: '2026-12-25' }], profileId: sam.id, first: 'Sam', now });
  assert.equal(quote.head, 'Quote Q-0042');
  assert.equal(quote.line, 'Quote Q-0042 is with Sam.');
  assert.equal(quote.rows.length, 2);
  // A newer draft beside the one that went out never hides it (UI finding 7).
  const later = { ...a, id: 'a2', created_at: '2026-11-25T11:00:00Z' };
  const both = b.foldModel({ agreements: [later, { ...a, status: 'sent' }], versions: [{ ...v, id: 'v2', agreement_id: 'a2' }, sent], profileId: sam.id, first: 'Sam', now });
  assert.equal(both.line, 'Version 1 is waiting for Sam to sign.');
  assert.equal(both.agreement.id, 'a1');
});

test('start days are Mondays; extras fall back to M28’s four', () => {
  const days = b.startDays('2026-11-25');
  assert.equal(days[0].label, 'Mon 30 Nov 2026');
  assert.equal(days.length, 12);
  assert.equal(b.extrasList([]).length, 4);
  assert.equal(b.extraLine(b.DEFAULT_EXTRAS[3]), 'Health Check with a debrief, £1,500, for teams and CEOs');
  assert.deepEqual(b.extrasList([{ key: 'x', title: 'Extra', price_minor: 100, position: 1 }]), [{ key: 'x', title: 'Extra', priceMinor: 100, hint: null }]);
});

test('switching kind carries the price typed so far', () => {
  const t = b.newDraft({ pkg: SESSIONS, who: { profile: sam }, coach, ids, todayKey: '2026-11-25' }).version.terms;
  assert.equal(b.switchKind(t, 'team').team.totalMinor, 1800000);
  assert.equal(b.switchKind(t, 'oneoff').oneoff.totalMinor, 1800000);
});
