// The functionality tester's findings for Phase 6b run 3, each as a check (agreements rule 12): one billing schedule for
// every 065 agreement (amendments, renewing retainers, pauses, organisations), one per-session price, the first signing's
// 14 days, Needs you's first payment, quotes with extras, the projections, the client's invoices and the sent file name.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as s from '../../src/lib/agreements/settling.js';
import * as dl from '../../src/lib/agreements/delivered.js';
import * as d from '../../src/lib/agreements/duringAgreement.js';
import { blankTerms } from '../../src/lib/agreements/terms.js';
import { plannedInstalments } from '../../src/lib/finance/projected.js';
import { futureSessionsPlan } from '../../src/lib/coach/calendar.js';
import { afterSigning } from '../../src/lib/coaching/clientMoney.js';

const retainer = (fee = 300000, extra = {}) => ({ ...blankTerms('retainer'), coaching: 'Leadership Sounding Board', retainer: { sessions: 'Up to 2 a month, 60 minutes each', feeMinor: fee, invoice: 'monthly' }, ...extra });
const ver = (id, version, terms, signedAt, extra = {}) => ({ id, agreement_id: 'a1', version, status: 'signed', terms, currency: 'GBP', client_signed_at: signedAt, settle_choice: 'plan', ...extra });

test('finding 1: a 065 discount never crashes the projections, and a paid deposit leaves only the instalments', () => {
  const t = { ...blankTerms('sessions'), blocks: [{ n: 12, minutes: 60 }], totalMinor: 1200000, settle: 'deposit', discounts: [{ type: 'returning', percent: 10 }] };
  const v = ver('v1', 1, t, '2026-11-01T10:00:00Z');
  const out = plannedInstalments({ versions: [v], invoices: [{ agreement_id: 'a1', kind: 'deposit', instalment_n: 1, status: 'paid' }], today: '2026-11-25', zone: 'Europe/London' });
  // £12,000 less 10% = £10,800; deposit 30% → £3,200 (to the nearest £100); then 5 × £1,520.
  assert.deepEqual(out.map((p) => [p.n, p.amount_minor]), [[2, 152000], [3, 152000], [4, 152000], [5, 152000], [6, 152000]]);
  // A bad row is left out quietly (onSkip hears of it), never a crash.
  const skipped = [];
  const bad = { ...v, id: 'v9', agreement_id: 'a9', terms: null, client_signed_at: '2026-11-01T10:00:00Z', total_minor: 5000, terms_bad: true };
  assert.doesNotThrow(() => plannedInstalments({ versions: [{ ...bad, terms: { discounts: [{ type: 'returning', percent: 10 }], total_minor: 5000 } }], today: '2026-11-25', onSkip: (x) => skipped.push(x) }));
  assert.equal(skipped.length, 1);
});

test('finding 1: a retainer is projected month by month, never one £18,000 lump', () => {
  const out = plannedInstalments({ versions: [ver('v1', 1, retainer(), '2026-11-25T10:00:00Z')], invoices: [{ agreement_id: 'a1', kind: 'first_payment', instalment_n: 1, status: 'paid' }], today: '2026-11-25', until: '2027-02-28' });
  assert.deepEqual(out.map((p) => [p.n, p.amount_minor, p.draft_on]), [[2, 300000, '2026-12-25'], [3, 300000, '2027-01-25'], [4, 300000, '2027-02-25']]);
});

test('finding 3: a retainer renews in 6-month terms, drafting on month after month, its lines naming the month', () => {
  const plan = s.agreementSchedule([ver('v1', 1, retainer(), '2026-01-10T10:00:00Z')], { until: '2027-03-31' });
  assert.equal(plan.length, 15);
  assert.equal(plan.at(-1).day, '2027-03-10');
  assert.equal(plan.at(-1).of, null);
  assert.equal(plan[1].line, 'Leadership Sounding Board, February 2026');
  assert.ok(plan.every((p) => !/ of 6/.test(p.line)));
  // 6 months up front: the first invoice is the 6 months, then monthly from month 7.
  const up = s.agreementSchedule([ver('v1', 1, retainer(), '2026-01-10T10:00:00Z', { settle_choice: 'upfront' })], { until: '2026-09-30' });
  assert.deepEqual(up.map((p) => [p.n, p.day, p.amount]), [[1, '2026-01-10', 1710000], [2, '2026-07-10', 300000], [3, '2026-08-10', 300000], [4, '2026-09-10', 300000]]);
  assert.equal(up[0].line, 'Leadership Sounding Board, the first 6 months');
});

test('finding 2: a price review is an amendment: numbers carry on, the new price from its day, the first signing stays', () => {
  const v1 = ver('v1', 1, retainer(), '2026-06-25T10:00:00Z', { status: 'superseded' });
  const v2 = ver('v2', 2, retainer(330000, { priceFrom: '2027-01-04', startsOn: '2027-01-04' }), '2026-11-27T10:00:00Z');
  const plan = s.agreementSchedule([v1, v2], { until: '2027-03-31' });
  assert.deepEqual(plan.map((p) => [p.n, p.day, p.amount, p.versionId]).slice(5), [
    [6, '2026-11-25', 300000, 'v1'], [7, '2026-12-25', 300000, 'v1'], [8, '2027-01-25', 330000, 'v2'], [9, '2027-02-25', 330000, 'v2'], [10, '2027-03-25', 330000, 'v2'],
  ]);
  // While v2 waits to be signed, v1 keeps billing.
  const waiting = s.agreementSchedule([{ ...v1, status: 'signed' }, { ...v2, status: 'sent', client_signed_at: null }], { until: '2027-03-31' });
  assert.ok(waiting.every((p) => p.versionId === 'v1' && p.amount === 300000));
  assert.equal(waiting.length, 10);
  // The 14 days and the start-now tick go by the first signing.
  assert.equal(s.firstSigning([v2, v1]).day, '2026-06-25');
  assert.equal(s.isAmendment(v2, [v1, v2]), true);
  assert.equal(s.isAmendment(v1, [v1, v2]), false);
  assert.equal(d.firstSignedVersion([v2, v1], 'a1').id, 'v1');
  // An amendment settles nothing at signing.
  assert.equal(afterSigning(retainer(), 'plan', { amends: true }), 'welcome');
  assert.equal(afterSigning(retainer(), 'plan'), 'settle');
});

test('finding 11: a pause moves every invoice due from its start on by its length; an early end stops the rest', () => {
  const v1 = ver('v1', 1, retainer(), '2026-01-10T10:00:00Z');
  const plan = s.agreementSchedule([v1], { until: '2026-06-30', agreement: { status: 'signed', paused_from: '2026-03-01', paused_to: '2026-03-28' } });
  assert.deepEqual(plan.map((p) => p.day), ['2026-01-10', '2026-02-10', '2026-04-07', '2026-05-08', '2026-06-07']);
  const ended = s.agreementSchedule([v1], { until: '2026-12-31', agreement: { status: 'signed', ending_on: '2026-04-30', ending_by: 'client' } });
  assert.equal(ended.at(-1).day, '2026-04-10');
  assert.deepEqual(s.agreementSchedule([v1], { until: '2026-12-31', agreement: { status: 'cancelled' } }), []);
});

test('finding 4: as delivered, the prepaid first session is never invoiced again; one per-session price', () => {
  const t = { ...blankTerms('sessions'), blocks: [{ n: 4, minutes: 60 }], totalMinor: 300000, settle: 'delivered', startsOn: '2026-11-01' };
  assert.equal(dl.perSession(t), 75000);
  assert.equal(s.firstPayment(t, 'plan'), 75000);
  const sessions = [
    { id: 's1', profile_id: 'p', kind: 'coaching', starts_at: '2026-11-02T10:00:00Z', minutes: 60, outcome: 'held' },
    { id: 's2', profile_id: 'p', kind: 'coaching', starts_at: '2026-11-09T10:00:00Z', minutes: 60, outcome: 'held' },
  ];
  assert.deepEqual(dl.deliveredToInvoice({ terms: t, sessions, profileId: 'p', now: Date.parse('2026-11-25T00:00:00Z') }).map((x) => x.id), ['s2']);
  // An extra coaching session ticked is settled at signing at its own price, and counts as one more prepaid.
  const withExtra = { ...t, extrasOffered: [{ key: 'session', title: 'Extra coaching session', priceMinor: 90000 }], extrasChosen: ['session'] };
  assert.equal(s.firstPayment(withExtra, 'plan'), 165000);
  assert.equal(dl.perSession(withExtra), 75000);
  assert.equal(dl.prepaid(withExtra), 2);
  // A retainer: the fee divided by the sessions a month it states.
  assert.equal(dl.perSession(retainer()), 150000);
});

test('finding 5: an organisation-funded agreement, individual or team, is scheduled for the organisation', () => {
  const funded = { ...blankTerms('sessions'), funder: 'org', fundedBy: 'Northfield', blocks: [{ n: 8, minutes: 60 }], totalMinor: 400000, settle: 'equal' };
  const plan = s.agreementSchedule([ver('v1', 1, funded, '2026-11-25T10:00:00Z', { funded_by: 'Northfield', settle_choice: null })]);
  assert.deepEqual(plan.map((p) => p.amount), [66670, 66666, 66666, 66666, 66666, 66666]);
  const team = { ...blankTerms('team'), team: { ...blankTerms('team').team, totalMinor: 2700000, settle: 'deposit' } };
  const tp = s.agreementSchedule([{ ...ver('v1', 1, team, null, { funded_by: 'Northfield' }), sponsor_signed_at: '2026-11-25T10:00:00Z' }]);
  assert.deepEqual(tp.map((p) => [p.kind, p.amount, p.day]), [['deposit', 900000, '2026-11-25'], ['instalment', 600000, '2026-12-25'], ['instalment', 600000, '2027-01-25'], ['instalment', 600000, '2027-02-25']]);
  // Their sessions are never invoiced by the hour as well.
  assert.ok(d.scheduledProfiles([{ id: 'a1', profile_id: 'p1', status: 'signed' }], [ver('v1', 1, funded, '2026-11-25T10:00:00Z', { funded_by: 'Northfield' })]).has('p1'));
});

test('finding 7: the first payment line goes once settled, and never for a cancelled agreement', () => {
  const t = { ...blankTerms('sessions'), blocks: [{ n: 6, minutes: 60 }], totalMinor: 600000, settle: 'equal' };
  const base = { coachId: 'c', today: '2026-11-27', now: Date.parse('2026-11-27T10:00:00Z'), clients: [{ id: 'p', name: 'Jade Ashdown' }],
    versions: [{ ...ver('v1', 1, t, '2026-11-25T10:00:00Z'), coach_id: 'c' }], agreementReminders: [{ id: 'r', coach_id: 'c', version_id: 'v1', kind: 'first_payment', drafted_at: '2026-11-26T03:15:00Z' }] };
  const ag = (status) => [{ id: 'a1', coach_id: 'c', profile_id: 'p', status }];
  const first = (f) => d.needsYouItems(f).filter((i) => /first payment/i.test(`${i.title} ${i.line}`));
  assert.equal(first({ ...base, agreements: ag('signed'), invoices: [] }).length, 1);
  assert.equal(first({ ...base, agreements: ag('signed'), invoices: [{ agreement_id: 'a1', kind: 'first_payment', instalment_n: 1, status: 'paid' }] }).length, 0);
  assert.equal(first({ ...base, agreements: ag('cancelled'), invoices: [] }).length, 0);
});

test('finding 9: a retainer, one-off or block of hours quote with an extra ticked settles the extra', () => {
  const extras = [{ key: 'session', title: 'Extra coaching session', priceMinor: 75000 }];
  const r = { ...retainer(), extrasOffered: extras };
  assert.equal(s.firstPayment(r, 'plan', ['session']), 375000);
  assert.equal(s.agreementTotal(r, 'plan', ['session']), 1875000);
  const o = { ...blankTerms('oneoff'), oneoff: { totalMinor: 325000, settle: 'before' }, extrasOffered: extras };
  assert.equal(s.agreementTotal(o, 'upfront', ['session']), 400000);
  assert.equal(s.firstPayment(o, 'upfront', ['session']), 400000);
  const h = { ...blankTerms('hours'), hours: { blockMinor: 200000, rateMinor: 15000 }, extrasOffered: extras };
  assert.equal(s.firstPayment(h, 'upfront', ['session']), 275000);
});

test('finding 6: cancelling within 14 days takes the coaching sessions still to come off the calendar, sending nothing', () => {
  const now = Date.parse('2026-11-25T10:00:00Z');
  const data = {
    sessions: [{ id: 's1', profile_id: 'p', kind: 'coaching', starts_at: '2026-12-01T10:00:00Z' }, { id: 's0', profile_id: 'p', kind: 'coaching', starts_at: '2026-11-20T10:00:00Z', outcome: 'held' }],
    items: [{ id: 'i1', session_id: 's1' }, { id: 't1', travel_for: 'i1' }], guests: [{ id: 'g1', item_id: 'i1' }],
  };
  const out = futureSessionsPlan('p', { data, now });
  assert.equal(out.count, 1);
  assert.deepEqual(out.plan.remove, [['coach_cal_guests', 'g1'], ['coach_cal_items', 't1'], ['coach_cal_items', 'i1'], ['coach_sessions', 's1']]);
  assert.equal(out.plan.tell, undefined);
});

test('findings 8 and 10: my_hours counts top-ups; the client’s Invoices page uses the server’s PDFs and lists credit notes', () => {
  const sql = readFileSync(new URL('../../supabase/migrations/065_agreements_engine.sql', import.meta.url), 'utf8');
  assert.match(sql, /ti\.kind = 'top_up' and ti\.status <> 'void'/);
  const page = readFileSync(new URL('../../src/pages/account/Invoices.jsx', import.meta.url), 'utf8');
  assert.match(page, /'invoice_pdf'/);
  assert.match(page, /'credit_notes'/);
  assert.match(page, /'credit_note_pdf'/);
});
