// Phase 6b run 3's server routes (Group E): the shapes each route takes (asks.js's ASKS, never renamed), and the agreement
// asks on a fake database and the Stripe stand-in: Send claims once and emails once from the coach with Reply-To; a quote
// takes its Q- number at Send; reminders are claimed before they go (never twice, unsure never again by itself); the
// 14-day cancel refunds the right amount once; a sponsor's link is kept only as a fingerprint; nothing is emailed off the
// live site. The real database's own rules (065's guards and functions) are checked on the local stand-in.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { agreementsApi, askedFor as agreementsAsked, fromWithName, sendAs, standardsOf, KINDS } from '../../api/_routes/coach-agreements.js';
import { askedFor as settleAsked, publishableKey } from '../../api/_routes/agreement-settle.js';
import { askedFor as linkAsked } from '../../api/_routes/agreement-link.js';
import { askedFor as billingAsked, billing } from '../../api/_routes/coach-billing.js';
import { agreementsNightly } from '../../api/_routes/billing-nightly.js';
import { ASKS } from '../../src/lib/agreements/asks.js';
import { blankTerms } from '../../src/lib/agreements/terms.js';
import { forStorage } from '../../src/lib/agreements/clauses.js';
import { stripeStandIn } from '../../src/lib/billing/stripe.js';
import { versionFields } from '../../src/lib/coach/agreementBuilder.js';
import { fakeDb065, numberRpc } from './_fakeDb065.mjs';

const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
// The practice's owner (an associate's own sends wait for approval: the break-it tester's tests below).
const COACH = { id: U(1), role: 'owner', active: true, user_id: U(2) };
const LIVE = { VERCEL_ENV: 'production', RESEND_API_KEY: 're_stub_only', COACH_EMAIL_FROM: 'The Clarity Portal <portal@example.invalid>' };

function terms(extra = {}) {
  return { ...blankTerms('sessions'), coaching: '6-month coaching', clientName: 'Sam Reid', clientFirst: 'Sam', coachName: 'Dr. Tim Dutton', coachFirst: 'Tim',
    totalMinor: 1800000, discounts: [{ type: 'returning', percent: 15 }], settle: 'deposit', startsOn: '2027-01-04', endsOn: '2027-07-02', ...extra };
}

function world({ now = new Date('2026-11-25T12:00:00Z'), env = LIVE, outcome = 'sent' } = {}) {
  const t = terms();
  let quoteNo = 0;
  const db = fakeDb065({
    coaches: [{ id: COACH.id, user_id: COACH.user_id, role: 'owner', display_first_name: 'Tim', email: 'tim@example.invalid', active: true }],
    client_profiles: [{ id: U(10), coach_id: COACH.id, name: 'Sam Reid', email: 'sam@example.invalid', time_zone: 'Europe/London', user_id: U(11) }],
    signatures: [{ id: U(20), user_id: COACH.user_id, kind: 'typed', typed_name: 'Tim Dutton', created_at: '2026-11-01T00:00:00Z' }],
    agreements: [{ id: U(30), coach_id: COACH.id, kind: 'coaching', profile_id: U(10), status: 'draft', current_version: 1, agreement_kind: 'sessions' }],
    agreement_versions: [{ id: U(31), agreement_id: U(30), coach_id: COACH.id, version: 1, status: 'draft', terms: t, clauses: forStorage(t), currency: 'GBP', funded_by: null }],
  }, {
    unique: { agreement_reminders: [['version_id', 'kind']], agreement_cancellations: [['agreement_id']], agreement_quotes: [['version_id']], credit_notes: [['number']], fx_reference_rates: [['day', 'currency']] },
    rpc: {
      quote_take_number: (args, tables) => {
        const q = tables.agreement_quotes.find((x) => x.id === args.p_quote);
        if (q.number == null) { q.number = (quoteNo += 1); q.share_token ||= 'ab'.repeat(32); }
        return { data: q.number, error: null };
      },
      invoice_take_number: numberRpc(),
      // 065's print of a version's content (md5 in the database; any stable text here).
      _version_print: (args) => ({ data: JSON.stringify([args.p_terms, args.p_clauses, args.p_total, args.p_overrides, args.p_currency, args.p_funded_by]), error: null }),
    },
  });
  const mails = [];
  const send = async (e, msg) => { mails.push(msg); return sendAs(e, msg, { fetcher: async () => ({ ok: outcome === 'sent', status: outcome === 'sent' ? 200 : outcome === 'refused' ? 422 : 503 }) }); };
  const api = agreementsApi({ db, server: db, coach: COACH, env, send, now: () => now });
  return { db, api, mails, t };
}

test('every ask in asks.js has its route here, with the same names', () => {
  assert.deepEqual([...KINDS].sort(), Object.keys(ASKS.agreements).sort());
  for (const k of Object.keys(ASKS.settle)) assert.ok(settleAsked({ kind: k, versionId: U(1), invoiceId: U(2), creditNoteId: U(3) }), k);
  for (const k of Object.keys(ASKS.link)) assert.equal(linkAsked({ kind: k, token: 'x' }), null, `${k}: a token is 64 hex`);
  assert.ok(billingAsked({ kind: 'delivered_invoice', agreementId: U(1), sessionIds: [U(2)] }));
  assert.ok(billingAsked({ kind: 'top_up', agreementId: U(1) }));
  assert.ok(billingAsked({ kind: 'org_invoice_send', organisationId: U(1), sessionIds: [U(2)], entryIds: [], poNumber: 'PO-1', rateMinor: 30000, evidenceIds: [] }));
  assert.ok(billingAsked({ kind: 'mark_uploaded', invoiceId: U(1) }));
  assert.ok(billingAsked({ kind: 'funding_details', organisationId: U(1) }));
  assert.ok(billingAsked({ kind: 'updated_price', agreementId: U(1), newFeeMinor: 330000, fromDay: '2027-01-04', note: 'From January.' }));
});

test('shapes are checked: wrong ones are refused before anything is read', () => {
  assert.equal(agreementsAsked({ kind: 'send', agreementId: U(1), versionId: U(2) }), null, 'no signature');
  assert.equal(agreementsAsked({ kind: 'send', agreementId: U(1), versionId: U(2), signatureId: U(3), sendAs: 'quote', validDays: 21 }), null, '14, 30 or 60 days');
  assert.equal(agreementsAsked({ kind: 'send', agreementId: U(1), versionId: U(2), newSignature: { kind: 'drawn', image: 'javascript:alert(1)' } }), null);
  assert.equal(agreementsAsked({ kind: 'reopen', versionId: U(1), quoteId: U(2) }), null, 'one or the other');
  assert.equal(agreementsAsked({ kind: 'extend', agreementId: U(1), endsOn: '2027-02-31' }), null, 'a real day');
  assert.equal(agreementsAsked({ kind: 'pause', agreementId: U(1), from: '2027-03-26', to: '2027-03-01' }), null, 'until after from');
  assert.equal(agreementsAsked({ kind: 'answer_change', requestIds: [U(1), 'nope'] }), null);
  assert.equal(agreementsAsked({ kind: 'sponsor_send', agreementId: U(1), versionId: U(2), sponsor: { name: 'Priya', email: 'a@b.c, d@e.f' } }), null, 'one address');
  assert.equal(agreementsAsked({ kind: 'send_sign_reminder', versionId: U(1), reminder: 'sign_5' }), null);
  assert.equal(billingAsked({ kind: 'org_invoice_send', organisationId: U(1), sessionIds: ['x'], entryIds: [], evidenceIds: [] }), null);
  assert.equal(billingAsked({ kind: 'delivered_invoice', agreementId: U(1), sessionIds: [] }), null, 'at least one');
  assert.equal(billingAsked({ kind: 'updated_price', agreementId: U(1), newFeeMinor: '330000', fromDay: '2027-01-04' }), null, 'a number');
  assert.equal(linkAsked({ kind: 'quote_accept', token: 'a'.repeat(64), extras: ['ok', 'Not A Key'] }), null);
  assert.equal(linkAsked({ kind: 'sponsor_sign', token: 'a'.repeat(64), name: 'Priya', fingerprint: 'f', image: 'data:image/png;base64,AAAA', typed: 'Priya' }), null, 'drawn or typed, not both');
  assert.equal(settleAsked({ kind: 'later', versionId: U(1) }), null, 'no "settle later"');
});

test('Send: the coach signs, it goes once, and the email comes from the coach (Reply-To) with the note first', async () => {
  const { db, api, mails } = world();
  const out = await api.send({ agreementId: U(30), versionId: U(31), signatureId: U(20), personalNote: 'Sam, it was great to talk.', sendAs: 'agreement', validDays: 30 });
  assert.deepEqual([out.expiresOn, out.emailed], ['2026-12-25', true]);
  const v = db.tables.agreement_versions[0];
  assert.deepEqual([v.status, v.coach_signature_id, v.personal_note, v.send_as], ['sent', U(20), 'Sam, it was great to talk.', 'agreement']);
  assert.equal(db.tables.agreements[0].status, 'sent');
  const again = await api.send({ agreementId: U(30), versionId: U(31), signatureId: U(20), personalNote: '', sendAs: 'agreement', validDays: 30 });
  assert.equal(again.already, true);
  assert.equal(mails.length, 1, 'pressed twice: one email');
  assert.deepEqual([mails[0].to, mails[0].fromName, mails[0].replyTo], ['sam@example.invalid', 'Dr. Tim Dutton', 'tim@example.invalid']);
  const blocks = mails[0].doc.blocks.filter(Boolean);
  // The note opens the email, and M28 version 6 reads what the agreement is for straight after it (Polish 1, Stage C).
  assert.equal(blocks[1].text, 'Sam, it was great to talk. Here’s the agreement for your 6-month coaching, starting on Monday 4 January.', 'the note opens the email');
  assert.equal(blocks.find((b) => b.type === 'button').href, `https://portal.theclarityproject.co.uk/coaching/agreement/${U(31)}`);
});

test('Send as a quote: its Q- number at Send, valid 14 days, emailed with its private link; the version stays a draft', async () => {
  const { db, api, mails } = world();
  const out = await api.send({ agreementId: U(30), versionId: U(31), signatureId: U(20), personalNote: '', sendAs: 'quote', validDays: 14 });
  assert.deepEqual([out.quoteNumber, out.validUntil, out.emailed], [1, '2026-12-09', true]);
  assert.equal(db.tables.agreement_versions[0].status, 'draft', 'a quote is the draft version until it is accepted');
  const q = db.tables.agreement_quotes[0];
  assert.deepEqual([q.status, q.valid_days, q.coach_signature_id], ['sent', 14, U(20)]);
  assert.match(mails[0].doc.subject, /^Your coaching quote from Tim$/);
  assert.ok(mails[0].doc.blocks.some((b) => b?.type === 'button' && b.href.endsWith(`/quote/${'ab'.repeat(32)}`)));
  const again = await api.send({ agreementId: U(30), versionId: U(31), signatureId: U(20), personalNote: '', sendAs: 'quote', validDays: 14 });
  assert.deepEqual([again.already, again.quoteNumber, mails.length], [true, 1, 1], 'never a second number or email');
});

test('off the live site the work is done and nothing is emailed', async () => {
  const { api, mails } = world({ env: { VERCEL_ENV: 'preview', RESEND_API_KEY: 're_x', COACH_EMAIL_FROM: 'a@example.invalid' } });
  const out = await api.send({ agreementId: U(30), versionId: U(31), signatureId: U(20), personalNote: '', sendAs: 'agreement', validDays: 30 });
  assert.equal(out.emailed, false);
  assert.equal(mails.length, 1, 'asked');
  assert.equal(await sendAs({ VERCEL_ENV: 'preview' }, mails[0], { fetcher: () => assert.fail('never reaches Resend') }), 'skipped');
});

test('the email is sent from the portal’s address in the coach’s name, Reply-To the coach', async () => {
  assert.equal(fromWithName(LIVE, 'Dr. Tim Dutton'), 'Dr. Tim Dutton <portal@example.invalid>');
  assert.equal(fromWithName(LIVE, 'Tim "<x@evil>"'), 'Tim x@evil <portal@example.invalid>');
  let body = null;
  const doc = { brand: 'portal', subject: 'S', blocks: [{ type: 'text', text: 'Hello.' }], footer: { lines: ['Why'] } };
  assert.equal(await sendAs(LIVE, { to: 'sam@example.invalid', doc, fromName: 'Tim', replyTo: 'tim@example.invalid', files: [{ filename: 'A.pdf', content: 'JVBE' }] },
    { fetcher: async (url, init) => { body = JSON.parse(init.body); return { ok: true }; }, timeoutMs: 0 }), 'sent');
  assert.deepEqual([body.reply_to, body.to, body.attachments.at(-1).filename], ['tim@example.invalid', ['sam@example.invalid'], 'A.pdf']);
  assert.equal(await sendAs(LIVE, { to: 'a@b.c, d@e.f', doc }, { fetcher: () => assert.fail('never') }), 'refused', 'one address only');
});

test('a signing reminder is claimed before it goes: sent once; an unsure send is never sent again by itself', async () => {
  const w = world();
  await w.api.send({ agreementId: U(30), versionId: U(31), signatureId: U(20), personalNote: '', sendAs: 'agreement', validDays: 30 });
  const r = await w.api.sendReminder({ versionId: U(31), reminder: 'sign_3', text: 'Just checking in, Sam.\n\nAny questions, ask.' });
  assert.ok(r.sentAt);
  assert.deepEqual(w.mails.at(-1).doc.blocks.filter((b) => b?.type === 'text').map((b) => b.text).slice(0, 2), ['Just checking in, Sam.', 'Any questions, ask.'], 'the coach’s edit');
  assert.equal((await w.api.sendReminder({ versionId: U(31), reminder: 'sign_3' })).already, true);
  assert.equal(w.mails.length, 2);
  const u = world({ outcome: 'unsure' });
  await u.api.send({ agreementId: U(30), versionId: U(31), signatureId: U(20), personalNote: '', sendAs: 'agreement', validDays: 30 });
  await assert.rejects(u.api.sendReminder({ versionId: U(31), reminder: 'sign_7' }), (e) => e.unsure === true);
  await assert.rejects(u.api.sendReminder({ versionId: U(31), reminder: 'sign_7' }), (e) => e.unsure === true, 'pressed again: asks to check first');
  const f = world({ outcome: 'refused' });
  await f.api.send({ agreementId: U(30), versionId: U(31), signatureId: U(20), personalNote: '', sendAs: 'agreement', validDays: 30 });
  await assert.rejects(f.api.sendReminder({ versionId: U(31), reminder: 'sign_3' }), /didn’t send/);
  assert.equal(f.db.tables.agreement_reminders[0].sending_at, null, 'refused: let go, so it can be sent again');
});

test('the nightly round drafts the reminders at 3 and 7 days, runs an agreement out, and keeps the day’s rates', async () => {
  const w = world();
  await w.api.send({ agreementId: U(30), versionId: U(31), signatureId: U(20), personalNote: '', sendAs: 'agreement', validDays: 30 });
  const day = (d) => () => new Date(`${d}T03:15:00Z`);
  const rates = async () => [{ day: '2026-11-27', currency: 'EUR', units_per_gbp: 1.19, source: 'ECB', fetched_at: 'x' }];
  assert.equal((await agreementsNightly({ server: w.db, now: day('2026-11-27'), fetchRates: rates })).signReminders, 0, 'day 2: nothing yet');
  assert.equal((await agreementsNightly({ server: w.db, now: day('2026-11-28'), fetchRates: rates })).signReminders, 1, 'day 3');
  assert.equal((await agreementsNightly({ server: w.db, now: day('2026-11-29'), fetchRates: rates })).signReminders, 0, 'once');
  assert.equal((await agreementsNightly({ server: w.db, now: day('2026-12-02'), fetchRates: async () => [] })).signReminders, 1, 'day 7');
  assert.deepEqual(w.db.tables.agreement_reminders.map((r) => r.kind), ['sign_3', 'sign_7']);
  assert.equal(w.db.tables.fx_reference_rates.length, 1);
  assert.equal((await agreementsNightly({ server: w.db, now: day('2026-12-26'), fetchRates: async () => [] })).expired, 1, 'past its day: runs out');
  assert.equal(w.db.tables.agreements[0].status, 'expired');
  const re = await w.api.reopen({ versionId: U(31), days: 14 });
  assert.equal(re.expiresOn, '2026-12-09', 'reopened from today (25 Nov) for 14 days');
  assert.equal(w.db.tables.agreements[0].status, 'sent');
});

test('cancel within 14 days: £4,600 deposit, start-now ticked, 1 coaching session had at £956.25 → £3,643.75 back, once', async () => {
  const w = world();
  const v = w.db.tables.agreement_versions[0];
  Object.assign(v, { status: 'signed', client_signed_at: '2026-11-20T10:00:00Z', start_now: true, settle_choice: 'plan' });
  w.db.tables.agreements[0].status = 'signed';
  w.db.tables.invoices = [{ id: U(40), coach_id: COACH.id, agreement_id: U(30), status: 'paid', paid_minor: 460000, total_minor: 460000, currency: 'GBP', paid_at: '2026-11-20T10:05:00Z', number: 1251, stripe_invoice_id: 'in_x' }];
  w.db.tables.payments = [{ id: U(41), invoice_id: U(40), stripe_id: 'pi_x', added_by_coach: false, paid_at: '2026-11-20T10:05:00Z' }];
  w.db.tables.coach_sessions = [{ id: U(50), coach_id: COACH.id, profile_id: U(10), starts_at: '2026-11-23T10:00:00Z', minutes: 60, outcome: 'held' },
    { id: U(51), coach_id: COACH.id, profile_id: U(10), starts_at: '2026-11-30T10:00:00Z', minutes: 60, outcome: null }];
  const refunds = [];
  const bill = { refundOrCredit: async (id, kind, amount) => { refunds.push([id, kind, amount]); w.db.tables.credit_notes = [...(w.db.tables.credit_notes || []), { id: U(60), invoice_id: id, number: 'CLARITY-CN-0007', amount_minor: amount, stripe_id: 're_x' }]; return { kind, number: 'CLARITY-CN-0007' }; } };
  const api = agreementsApi({ db: w.db, server: w.db, coach: COACH, env: LIVE, send: async (e, m) => { w.mails.push(m); return 'sent'; }, now: () => new Date('2026-11-25T12:00:00Z'), billing: bill });
  const out = await api.cancel14({ agreementId: U(30) });
  assert.deepEqual([out.refundMinor, out.creditNoteNumber, out.emailed], [364375, 'CLARITY-CN-0007', true]);
  assert.deepEqual(refunds, [[U(40), 'refund', 364375]]);
  assert.equal(w.db.tables.agreements[0].status, 'cancelled');
  assert.ok(w.mails.at(-1).files[0].filename.startsWith('Credit note CLARITY-CN-0007'), 'the credit note PDF goes with the email');
  assert.equal((await api.cancel14({ agreementId: U(30) })).already, true);
  assert.equal(refunds.length, 1, 'never refunded twice');
});

test('cancel within 14 days takes the coaching sessions still to come off the calendar on the server, with no email about them', async () => {
  const w = world();
  const v = w.db.tables.agreement_versions[0];
  Object.assign(v, { status: 'signed', client_signed_at: '2026-11-20T10:00:00Z', start_now: true, settle_choice: 'plan' });
  w.db.tables.agreements[0].status = 'signed';
  w.db.tables.invoices = [];
  const OTHER = U(12);
  w.db.tables.coach_sessions = [
    { id: U(50), coach_id: COACH.id, profile_id: U(10), kind: 'coaching', starts_at: '2026-11-23T10:00:00Z', minutes: 60, outcome: 'held' }, // had: stays
    { id: U(51), coach_id: COACH.id, profile_id: U(10), kind: 'coaching', starts_at: '2026-11-30T10:00:00Z', minutes: 60, outcome: null }, // to come: goes
    { id: U(52), coach_id: COACH.id, profile_id: U(10), starts_at: '2026-12-07T10:00:00Z', minutes: 60, outcome: null }, // kind left empty: coaching, goes
    { id: U(53), coach_id: COACH.id, profile_id: U(10), kind: 'chemistry', starts_at: '2026-12-01T10:00:00Z', minutes: 30, outcome: null }, // not coaching: stays
    { id: U(54), coach_id: COACH.id, profile_id: U(10), kind: 'coaching', starts_at: '2026-12-02T10:00:00Z', minutes: 60, outcome: null, recap_sent_at: '2026-11-24T10:00:00Z' }, // written up: stays
    { id: U(55), coach_id: COACH.id, profile_id: OTHER, kind: 'coaching', starts_at: '2026-12-03T10:00:00Z', minutes: 60, outcome: null }, // another client: stays
    { id: U(56), coach_id: U(3), profile_id: U(10), kind: 'coaching', starts_at: '2026-12-04T10:00:00Z', minutes: 60, outcome: null }, // another coach: stays
  ];
  w.db.tables.coach_cal_items = [
    { id: U(80), coach_id: COACH.id, session_id: U(51), kind: 'client_call', google_event_id: 'g80', meeting_id: 'z80' },
    { id: U(81), coach_id: COACH.id, travel_for: U(80), kind: 'travel' },
    { id: U(82), coach_id: COACH.id, session_id: U(53), kind: 'client_call' },
    { id: U(83), coach_id: COACH.id, session_id: U(55), kind: 'client_call' },
  ];
  w.db.tables.coach_cal_guests = [{ id: U(90), coach_id: COACH.id, item_id: U(80) }, { id: U(91), coach_id: COACH.id, item_id: U(83) }];
  const before = w.mails.length;
  const out = await w.api.cancel14({ agreementId: U(30) });
  assert.equal(out.sessionsOff, 2);
  assert.deepEqual(w.db.tables.coach_sessions.map((x) => x.id).sort(), [U(50), U(53), U(54), U(55), U(56)]);
  assert.deepEqual(w.db.tables.coach_cal_items.map((x) => x.id).sort(), [U(82), U(83)], 'the call and its travel time go; the others stay');
  assert.deepEqual(w.db.tables.coach_cal_guests.map((x) => x.id), [U(91)], 'the call’s guests go');
  assert.deepEqual(out.removed, [['coach_cal_guests', U(90)], ['coach_cal_items', U(81)], ['coach_cal_items', U(80)], ['coach_sessions', U(51)], ['coach_sessions', U(52)]]);
  assert.deepEqual(out.calls, [{ id: U(80), google_event_id: 'g80', meeting_id: 'z80' }], 'for the device’s Google and Zoom sync');
  assert.equal(w.mails.length - before, 1, 'one email: the cancellation, nothing about the sessions');
  assert.ok(!JSON.stringify(w.mails.at(-1)).includes('30 Nov'), 'the cancellation email names no session');
  const again = await w.api.cancel14({ agreementId: U(30) });
  assert.deepEqual([again.already, again.sessionsOff], [true, 0], 'pressed again: nothing more removed');
});

test('the device’s own list of sessions to take off is the server’s (futureSessionsPlan is futureSessionRows)', async () => {
  const { futureSessionsPlan } = await import('../../src/lib/coach/calendar.js');
  const { futureSessionRows } = await import('../../src/lib/agreements/coolingOff.js');
  const data = {
    sessions: [{ id: 's1', profile_id: 'p', kind: 'coaching', starts_at: '2026-12-01T10:00:00Z' }, { id: 's2', profile_id: 'p', kind: 'coaching', starts_at: '2026-11-01T10:00:00Z' }],
    items: [{ id: 'i1', session_id: 's1' }, { id: 't1', travel_for: 'i1' }], guests: [{ id: 'g1', item_id: 'i1' }],
  };
  const now = Date.parse('2026-11-25T12:00:00Z');
  const rows = futureSessionRows('p', { ...data, now });
  const dev = futureSessionsPlan('p', { data, now });
  assert.equal(dev.count, 1);
  assert.deepEqual(dev.plan.remove, rows.remove);
  assert.deepEqual(rows.remove, [['coach_cal_guests', 'g1'], ['coach_cal_items', 't1'], ['coach_cal_items', 'i1'], ['coach_sessions', 's1']]);
  assert.deepEqual(futureSessionRows(null, { ...data, now }).remove, [], 'no client, nothing');
});

test('cancel within 14 days is never for a funded agreement, and not after day 14', async () => {
  const w = world();
  const v = w.db.tables.agreement_versions[0];
  Object.assign(v, { status: 'signed', client_signed_at: '2026-11-10T10:00:00Z', funded_by: 'Northfield Logistics' });
  w.db.tables.agreements[0].status = 'signed';
  await assert.rejects(w.api.cancel14({ agreementId: U(30) }), /only for clients who fund their own coaching/);
  v.funded_by = null;
  await assert.rejects(w.api.cancel14({ agreementId: U(30) }), /14 days to change their mind have passed/, 'signed 10 Nov, today 25 Nov: day 15');
});

test('a sponsor’s link is kept only as a fingerprint; off the live site it comes back to open by hand', async () => {
  const w = world({ env: { VERCEL_ENV: 'preview' } });
  w.db.tables.agreements.push({ id: U(70), coach_id: COACH.id, kind: 'sponsor', organisation_id: U(71), status: 'draft', current_version: 1 });
  const st = { ...blankTerms('team'), orgName: 'Northfield Logistics', team: { ...blankTerms('team').team, people: [{ name: 'Jo Bell' }] } };
  w.db.tables.agreement_versions.push({ id: U(72), agreement_id: U(70), coach_id: COACH.id, version: 1, status: 'draft', terms: st, clauses: forStorage(st) });
  w.db.tables.organisations = [{ id: U(71), name: 'Northfield Logistics' }];
  const out = await w.api.sponsorSend({ agreementId: U(70), versionId: U(72), sponsor: { name: 'Priya Nair', email: 'priya@example.invalid', role: 'Head of People' } });
  const token = /\/sign\/([0-9a-f]{64})$/.exec(out.link)[1];
  const [link] = w.db.tables.sponsor_sign_links;
  assert.equal(link.token_hash, createHash('sha256').update(token).digest('hex'));
  assert.ok(!JSON.stringify(w.db.tables).includes(token), 'the token itself is never kept');
  assert.equal(out.emailed, false);
  assert.match(w.mails[0].doc.blocks.find((b) => b?.type === 'text' && /agreement for the coaching/.test(b.text)).text, /for Jo Bell\. It takes ~5 minutes/);
});

test('another coach’s agreement, version or change request is never touched', async () => {
  const w = world();
  const other = agreementsApi({ db: w.db, server: w.db, coach: { id: U(99), role: 'owner', user_id: U(98) }, env: LIVE, send: async () => 'sent' });
  await assert.rejects(other.send({ agreementId: U(30), versionId: U(31), signatureId: U(20), personalNote: '', sendAs: 'agreement', validDays: 30 }), /isn’t yours/);
  await assert.rejects(other.extend({ agreementId: U(30), endsOn: '2027-09-03' }), /isn’t yours/);
  w.db.tables.agreement_change_requests = [{ id: U(80), coach_id: COACH.id, version_id: U(31), answered_at: null }];
  await assert.rejects(other.answerChange({ requestIds: [U(80)], reply: null }), /isn’t yours/);
  assert.equal(w.db.tables.agreement_change_requests[0].answered_at, null);
});

test('standard wording: the newest version of each clause for the kind', () => {
  const rows = [
    { agreement_kind: 'sessions', clause_key: 'rearranging', version: 1, title: 'A', paragraphs: [{ text: 'one' }] },
    { agreement_kind: 'sessions', clause_key: 'rearranging', version: 2, title: 'B', paragraphs: [{ text: 'two' }] },
    { agreement_kind: 'retainer', clause_key: 'rearranging', version: 9, title: 'C', paragraphs: [{ text: 'other kind' }] },
  ];
  assert.deepEqual(standardsOf(rows, 'sessions'), { rearranging: { version: 2, title: 'B', paragraphs: [{ text: 'two' }] } });
});

test('the publishable key handed to the page is a test key or none', () => {
  assert.equal(publishableKey({ STRIPE_PUBLISHABLE_KEY: 'pk_test_abcdefghij12' }), 'pk_test_abcdefghij12');
  assert.equal(publishableKey({ STRIPE_PUBLISHABLE_KEY: 'pk_live_abcdefghij12' }), null);
});

test('billing: Mark as uploaded once; a price review sends a new version both sign, once', async () => {
  const w = world();
  const v = w.db.tables.agreement_versions[0];
  Object.assign(v, { status: 'signed', client_signed_at: '2026-01-04T10:00:00Z', terms: { ...blankTerms('retainer'), coachName: 'Dr. Tim Dutton', retainer: { ...blankTerms('retainer').retainer, feeMinor: 300000 } } });
  w.db.tables.agreements[0].status = 'signed';
  w.db.tables.invoices = [{ id: U(90), coach_id: COACH.id, status: 'sent' }];
  const mails = [];
  const b = billing({ server: w.db, db: w.db, stripe: stripeStandIn(), coach: COACH, env: LIVE, send: async (e, m) => { mails.push(m); return 'sent'; }, now: () => new Date('2026-11-25T12:00:00Z') });
  const up = await b.markUploaded(U(90));
  assert.equal((await b.markUploaded(U(90))).uploadedAt, up.uploadedAt);
  const p = await b.updatedPrice({ agreementId: U(30), newFeeMinor: 330000, fromDay: '2027-01-04', note: 'From January my fee is £3,300 a month.' });
  const nv = w.db.tables.agreement_versions.find((x) => x.id === p.versionId);
  assert.deepEqual([nv.version, nv.status, nv.terms.retainer.feeMinor, nv.terms.priceFrom], [2, 'sent', 330000, '2027-01-04']);
  assert.equal(w.db.tables.agreements[0].current_version, 2);
  assert.equal(mails[0].doc.blocks.find((x) => x?.type === 'text').text, 'As we discussed, here’s your updated agreement.');
  await assert.rejects(b.updatedPrice({ agreementId: U(30), newFeeMinor: 340000, fromDay: '2027-01-04', note: '' }), /already waiting/);
});

test('Extend and Pause keep the moved end in ends_on (ending_on with no "by" before that column exists); End early keeps who asked', async () => {
  const w = world();
  Object.assign(w.db.tables.agreement_versions[0], { status: 'signed', client_signed_at: '2026-11-01T10:00:00Z' });
  w.db.tables.agreements[0].status = 'signed';
  await assert.rejects(w.api.extend({ agreementId: U(30), endsOn: '2027-06-25' }), /after the current one/, 'the version ends Fri 2 Jul 2027');
  assert.equal((await w.api.extend({ agreementId: U(30), endsOn: '2027-07-30' })).endsOn, '2027-07-30');
  assert.equal(w.db.tables.agreements[0].ends_on, '2027-07-30');
  const p = await w.api.pause({ agreementId: U(30), from: '2027-03-01', to: '2027-03-26' });
  assert.equal(p.endsOn, '2027-08-27', 'paused 4 weeks from the extended end');
  // Before the column: PostgREST says it isn't there, and ending_on (no `ending_by`) holds it.
  const real = w.db.from;
  w.db.from = (table) => { const q = real(table); const up = q.update; q.update = (v) => (v.ends_on ? { eq: async () => ({ error: { code: 'PGRST204', message: 'no column' } }) } : up(v)); return q; };
  await w.api.extend({ agreementId: U(30), endsOn: '2027-09-03' });
  assert.deepEqual([w.db.tables.agreements[0].ending_on, w.db.tables.agreements[0].ending_by], ['2027-09-03', null]);
  w.db.from = real;
  const e = await w.api.endEarly({ agreementId: U(30), endsOn: '2027-04-30', by: 'client' });
  assert.deepEqual([e.endingOn, w.db.tables.agreements[0].ending_by], ['2027-04-30', 'client']);
});

// ---------------------------------------------------------------- the break-it tester's findings (run 3)

const ASSOCIATE = { id: U(1), role: 'coach', active: true, user_id: U(2) };
const printOf = (v) => JSON.stringify([v.terms, v.clauses, v.total_minor, v.overrides, v.currency, v.funded_by]);

test('finding 6: an associate sends only the version the owner approved, exactly as approved', async () => {
  const w = world();
  const api = agreementsApi({ db: w.db, server: w.db, coach: ASSOCIATE, env: LIVE, send: async () => 'sent', now: () => new Date('2026-11-25T12:00:00Z') });
  const ask = { agreementId: U(30), versionId: U(31), signatureId: U(20), personalNote: '', sendAs: 'agreement', validDays: 30 };
  await assert.rejects(api.send(ask), /owner approves it/, 'left not needed');
  await assert.rejects(api.send({ ...ask, sendAs: 'quote' }), /owner approves it/, 'a quote too');
  const [a] = w.db.tables.agreements;
  const [v] = w.db.tables.agreement_versions;
  Object.assign(v, { clauses: versionFields(v.terms).clauses, total_minor: versionFields(v.terms).total_minor });
  Object.assign(a, { approval: 'approved', approved_version: 1, approved_print: 'something else' });
  await assert.rejects(api.send(ask), /owner approves it/, 'changed since it was approved');
  a.approved_print = printOf(v);
  const out = await api.send(ask);
  assert.ok(out.sentAt);
  assert.equal(w.db.tables.agreement_versions[0].status, 'sent');
});

test('finding 6: an associate’s price review waits for the owner, signed and asked, nothing emailed', async () => {
  const w = world();
  const v = w.db.tables.agreement_versions[0];
  Object.assign(v, { status: 'signed', client_signed_at: '2026-01-04T10:00:00Z', terms: { ...blankTerms('retainer'), retainer: { ...blankTerms('retainer').retainer, feeMinor: 300000 } } });
  w.db.tables.agreements[0].status = 'signed';
  const mails = [];
  const b = billing({ server: w.db, db: w.db, stripe: stripeStandIn(), coach: ASSOCIATE, env: LIVE, send: async (e, m) => { mails.push(m); return 'sent'; }, now: () => new Date('2026-11-25T12:00:00Z') });
  const p = await b.updatedPrice({ agreementId: U(30), newFeeMinor: 330000, fromDay: '2027-01-04', note: 'From January.' });
  assert.equal(p.waiting, true);
  const nv = w.db.tables.agreement_versions.find((x) => x.id === p.versionId);
  assert.deepEqual([nv.status, Boolean(nv.coach_signature_id)], ['draft', true]);
  assert.deepEqual([w.db.tables.agreements[0].approval, w.db.tables.agreements[0].current_version], ['waiting', 2]);
  assert.equal(mails.length, 0);
});

test('finding 5: Send keeps the wording its terms make; the owner never approves wording stored by hand', async () => {
  const w = world();
  const v = w.db.tables.agreement_versions[0];
  const forged = () => forStorage(v.terms).map((c) => (c.key === 'rearranging' ? { ...c, paragraphs: [{ text: 'Any coaching session cancelled is charged at £5,000.', why: null }] } : c));
  Object.assign(v, { clauses: forged(), total_minor: 1 });
  await w.api.send({ agreementId: U(30), versionId: U(31), signatureId: U(20), personalNote: '', sendAs: 'agreement', validDays: 30 });
  const sent = w.db.tables.agreement_versions[0];
  assert.ok(!JSON.stringify(sent.clauses).includes('£5,000'));
  assert.equal(sent.total_minor, versionFields(v.terms).total_minor);
  // The owner's approval of an associate's draft with wording its terms don't make is refused.
  const w2 = world();
  w2.db.tables.coaches.push({ id: U(5), user_id: U(6), role: 'coach', display_first_name: 'Wren', active: true });
  Object.assign(w2.db.tables.agreements[0], { coach_id: U(5), approval: 'waiting' });
  Object.assign(w2.db.tables.agreement_versions[0], { coach_id: U(5), clauses: forged() });
  await assert.rejects(w2.api.approve({ agreementId: U(30) }), /wording doesn’t match its terms/);
});

test('finding 8: a quote is never sent to someone their organisation funds', async () => {
  const w = world();
  Object.assign(w.db.tables.agreement_versions[0], { funded_by: 'Northfield', terms: terms({ funder: 'org', fundedBy: 'Northfield' }) });
  await assert.rejects(w.api.send({ agreementId: U(30), versionId: U(31), signatureId: U(20), personalNote: '', sendAs: 'quote', validDays: 30 }), /only to clients who fund their own coaching/);
  assert.equal(w.db.tables.agreement_quotes?.length || 0, 0);
});
