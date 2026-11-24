// The whole path on the Stripe stand-in (Phase 6b run 1, step 10): an agreement signed, its invoices drafted, sent,
// settled, an instalment missed, its reminders drafted at 3, 7 and 14 days and sent, a refund and a credit with their
// credit notes, and a portal subscription started and cancelled; every Stripe message through the real webhook rules,
// some of them twice.
import test from 'node:test';
import assert from 'node:assert/strict';
import { billing } from '../../api/coach-billing.js';
import { handleEvent } from '../../api/stripe-webhook.js';
import { stripeStandIn } from '../../src/lib/billing/stripe.js';
import { fakeDb } from './_fakeDb.mjs';

const COACH = { id: 'c-maya', role: 'coach', active: true };
const OTHER = { id: 'c-tess', role: 'owner', active: true };
const terms = { coaching: '6-month coaching', instalments: 6, termsDays: 14 };

function world(now) {
  const db = fakeDb({
    agreements: [{ id: 'a-ben', coach_id: COACH.id, profile_id: 'p-ben', status: 'signed', current_version: 1 }],
    agreement_versions: [{ id: 'v-ben', agreement_id: 'a-ben', version: 1, status: 'signed', terms, total_minor: 1800000, currency: 'GBP', funded_by: null, client_signed_at: '2026-12-01T10:00:00Z' }],
    client_profiles: [{ id: 'p-ben', name: 'Ben Carter', email: 'ben@example.invalid', time_zone: 'Europe/London' }],
  });
  const stripe = stripeStandIn({ now: () => now.value.getTime() });
  return { db, stripe, b: billing({ server: db, stripe, coach: COACH, now: () => now.value }) };
}
const deliver = async (db, stripe) => { for (const e of stripe.state.events.splice(0)) await handleEvent(db, e); };

test('signed, drafted once, sent, settled (Stripe\'s message twice: one payment)', async () => {
  const now = { value: new Date('2026-12-01T12:00:00Z') };
  const { db, stripe, b } = world(now);
  assert.deepEqual(await b.draft('a-ben'), { drafted: 1 });
  assert.deepEqual(await b.draft('a-ben'), { drafted: 0 }, 'asked again: nothing more');
  const [inv] = db.tables.invoices;
  assert.deepEqual([inv.number >= 1201, inv.status, inv.total_minor, inv.instalment_n], [true, 'draft', 300000, 1]);
  assert.equal(stripe.state.sent.length, 0, 'nothing sends until Send');
  assert.deepEqual(await b.send(inv.id), { status: 'sent' });
  const sent = db.tables.invoices[0];
  assert.deepEqual([sent.status, sent.issued_on, sent.due_on, /^https:\/\//.test(sent.hosted_url)], ['sent', '2026-12-01', '2026-12-15', true]);
  const paid = stripe.settle(inv.stripe_invoice_id);
  await deliver(db, stripe);
  await handleEvent(db, paid); // delivered twice
  assert.equal(db.tables.invoices[0].status, 'paid');
  assert.equal(db.tables.payments.length, 1);
});

test('an instalment missed: reminders drafted at 3, 7 and 14 days, once each; the 14-day one sent with its settle-by day; paid takes the rest away', async () => {
  const now = { value: new Date('2026-12-01T12:00:00Z') };
  const { db, stripe, b } = world(now);
  await b.draft('a-ben');
  const id = db.tables.invoices[0].id;
  await b.send(id);
  await deliver(db, stripe);
  now.value = new Date('2026-12-18T09:00:00Z'); // due 15 Dec: 3 days overdue
  assert.deepEqual(await b.draftReminders(), { drafted: 1 });
  assert.deepEqual(await b.draftReminders(), { drafted: 0 });
  now.value = new Date('2026-12-22T09:00:00Z');
  await b.draftReminders();
  now.value = new Date('2026-12-29T09:00:00Z');
  await b.draftReminders();
  assert.deepEqual(db.tables.invoice_reminders.map((r) => r.stage), [3, 7, 14]);
  const fourteen = db.tables.invoice_reminders.find((r) => r.stage === 14);
  const r = await b.reminderToSend(fourteen.id);
  assert.equal(r.settleBy.words, 'Tue 5 Jan');
  assert.deepEqual(await b.reminderToSend(fourteen.id), { already: true }, 'pressed twice: sent once');
  stripe.settle(db.tables.invoices[0].stripe_invoice_id);
  await deliver(db, stripe);
  assert.deepEqual(db.tables.invoice_reminders.map((x) => x.stage), [14], 'the drafts not sent go the moment it is paid');
});

test('paused: no reminder drafted; added by hand: settled, Added by you', async () => {
  const now = { value: new Date('2026-12-01T12:00:00Z') };
  const { db, stripe, b } = world(now);
  await b.draft('a-ben');
  const id = db.tables.invoices[0].id;
  await b.send(id);
  db.tables.invoice_reminder_pauses = [{ id: 'x', coach_id: COACH.id, profile_id: 'p-ben' }];
  now.value = new Date('2026-12-29T09:00:00Z');
  assert.deepEqual(await b.draftReminders(), { drafted: 0 });
  assert.deepEqual(await b.paidByHand(id), { status: 'paid' });
  assert.deepEqual([db.tables.payments[0].added_by_coach, db.tables.payments[0].amount_minor], [true, 300000]);
  await deliver(db, stripe); // Stripe's own "paid" for the out-of-band mark adds no second payment
  assert.equal(db.tables.payments.length, 1);
});

test('a refund through Stripe and a credit kept, each with its credit note, never more than was settled', async () => {
  const now = { value: new Date('2026-12-01T12:00:00Z') };
  const { db, stripe, b } = world(now);
  await b.draft('a-ben');
  const id = db.tables.invoices[0].id;
  await b.send(id);
  stripe.settle(db.tables.invoices[0].stripe_invoice_id);
  await deliver(db, stripe);
  const refund = await b.refundOrCredit(id, 'refund', 100000, 'Two sessions not used');
  assert.match(refund.number, /^CLARITY-CN-\d{4}$/);
  await deliver(db, stripe); // Stripe's charge.refunded for it: still one credit note
  assert.equal(db.tables.credit_notes.length, 1);
  await b.refundOrCredit(id, 'credit', 150000, 'Kept for the next coaching');
  await assert.rejects(b.refundOrCredit(id, 'credit', 60000), /more than was settled/);
  assert.deepEqual(db.tables.credit_notes.map((c) => [c.kind, c.amount_minor]), [['refund', 100000], ['credit', 150000]]);
});

test('another coach\'s invoice can\'t be sent, settled or refunded, the owner\'s included', async () => {
  const now = { value: new Date('2026-12-01T12:00:00Z') };
  const { db, stripe, b } = world(now);
  await b.draft('a-ben');
  const owner = billing({ server: db, stripe, coach: OTHER, now: () => now.value });
  await assert.rejects(owner.send(db.tables.invoices[0].id), /isn’t yours/);
  await assert.rejects(owner.draft('a-ben'), /isn’t yours/);
  await assert.rejects(owner.paidByHand(db.tables.invoices[0].id), /isn’t yours/);
});

test('a portal subscription started and cancelled, through Stripe\'s messages', async () => {
  const now = { value: new Date('2026-12-01T12:00:00Z') };
  const { db, stripe } = world(now);
  await stripe.checkout({ customerEmail: 'ana@example.invalid', userId: 'u-ana', level: 'executive' });
  await deliver(db, stripe);
  const [sub] = db.tables.portal_subscriptions;
  assert.deepEqual([sub.user_id, sub.level, sub.status], ['u-ana', 'executive', 'active']);
  await stripe.cancelSubscription(sub.stripe_subscription_id);
  await deliver(db, stripe);
  assert.equal(db.tables.portal_subscriptions[0].status, 'cancelling');
});

test('the nightly round: the next instalment drafted on its day, a reminder drafted, and a message that never arrived caught up', async () => {
  const { nightlyRound } = await import('../../api/billing-nightly.js');
  const now = { value: new Date('2026-12-01T12:00:00Z') };
  const { db, stripe, b } = world(now);
  db.tables.coaches = [{ id: COACH.id, role: 'coach', active: true }];
  await b.draft('a-ben');
  await b.send(db.tables.invoices[0].id);
  now.value = new Date('2026-12-30T10:00:00Z');
  stripe.settle(db.tables.invoices[0].stripe_invoice_id); // Stripe's "paid" is never delivered to the webhook
  now.value = new Date('2027-01-01T04:00:00Z');
  const r = await nightlyRound({ server: db, stripe, now: () => now.value });
  assert.equal(r.invoices, 1, 'instalment 2 of 6 drafted on 1 Jan');
  assert.equal(db.tables.invoices[0].status, 'paid', 'caught up from Stripe\'s own record');
  assert.ok(r.caughtUp >= 1);
  const again = await nightlyRound({ server: db, stripe, now: () => now.value });
  assert.deepEqual([again.invoices, again.caughtUp], [0, 0], 'a second round drafts and handles nothing twice');
  assert.equal(db.tables.payments.length, 1);
});

test('functionality tester, 6b run 1: paid by hand then Stripe\'s own out-of-band "paid" with the full amount adds no second payment', async () => {
  const now = { value: new Date('2026-12-01T12:00:00Z') };
  const { db, stripe, b } = world(now);
  await b.draft('a-ben');
  const id = db.tables.invoices[0].id;
  await b.send(id);
  await deliver(db, stripe);
  await b.paidByHand(id);
  const last = stripe.state.events.at(-1);
  assert.equal(last.data.object.paid_out_of_band, true);
  assert.equal(last.data.object.amount_paid, 300000, 'as real Stripe: the full amount');
  await deliver(db, stripe);
  assert.equal(db.tables.payments.length, 1);
  assert.equal(db.tables.payments.reduce((a, p) => a + p.amount_minor, 0), 300000);
});

test('functionality tester, 6b run 1: one Stripe customer for every instalment of an agreement', async () => {
  const now = { value: new Date('2026-12-01T12:00:00Z') };
  const { db, stripe, b } = world(now);
  await b.draft('a-ben');
  now.value = new Date('2027-01-01T12:00:00Z');
  await b.draft('a-ben');
  now.value = new Date('2027-02-01T12:00:00Z');
  await b.draft('a-ben');
  assert.equal(db.tables.invoices.length, 3);
  assert.equal(stripe.state.customers.size, 1);
  assert.equal(new Set(db.tables.invoices.map((i) => i.stripe_customer_id)).size, 1);
});

test('functionality tester, 6b run 1: a reminder with no address is refused before it is claimed; one that didn\'t go is let go', async () => {
  const now = { value: new Date('2026-12-01T12:00:00Z') };
  const { db, stripe, b } = world(now);
  await b.draft('a-ben');
  const id = db.tables.invoices[0].id;
  await b.send(id);
  await deliver(db, stripe);
  now.value = new Date('2026-12-18T09:00:00Z');
  await b.draftReminders();
  const rem = db.tables.invoice_reminders[0];
  const email = db.tables.invoices[0].payer_email;
  db.tables.invoices[0].payer_email = null;
  assert.deepEqual(await b.reminderToSend(rem.id), { noAddress: true });
  assert.equal(db.tables.invoice_reminders[0].sent_at ?? null, null, 'not claimed');
  db.tables.invoices[0].payer_email = email;
  const r = await b.reminderToSend(rem.id);
  assert.ok(r.reminder);
  await b.releaseReminder(rem.id);
  assert.equal(db.tables.invoice_reminders[0].sent_at, null, 'let go, so it waits to be sent again');
  assert.ok((await b.reminderToSend(rem.id)).reminder);
});

test('the handler: a reminder Resend refuses is let go and the coach is told it didn\'t send', async () => {
  const { sendReminder } = await import('../../api/coach-billing.js');
  const now = { value: new Date('2026-12-01T12:00:00Z') };
  const { db, stripe, b } = world(now);
  db.tables.coaches = [{ id: COACH.id, display_first_name: 'Maya' }];
  await b.draft('a-ben');
  await b.send(db.tables.invoices[0].id);
  await deliver(db, stripe);
  now.value = new Date('2026-12-18T09:00:00Z');
  await b.draftReminders();
  const r = await b.reminderToSend(db.tables.invoice_reminders[0].id);
  const real = globalThis.fetch;
  globalThis.fetch = async () => new Response('{}', { status: 500 });
  try {
    const went = await sendReminder({ RESEND_API_KEY: 're_test_invented', EMAIL_FROM: 'Invented <x@example.invalid>' }, db, COACH, r).catch(() => 0);
    assert.equal(went, 0);
  } finally { globalThis.fetch = real; }
});

test('break-it tester, 6b run 1: a database error while handling a message is thrown, never marked handled, and the retry lands', async () => {
  const now = { value: new Date('2026-12-01T12:00:00Z') };
  const { db, stripe, b } = world(now);
  await b.draft('a-ben');
  await b.send(db.tables.invoices[0].id);
  await deliver(db, stripe);
  const paid = stripe.settle(db.tables.invoices[0].stripe_invoice_id);
  stripe.state.events.splice(0);
  const from = db.from;
  db.from = (table) => {
    const q = from(table);
    if (table !== 'payments') return q;
    const upsert = q.upsert;
    q.upsert = (...a) => { upsert(...a); return { select: () => q, then: (res) => res({ data: null, error: { code: '57014', message: 'timeout' } }) }; };
    return q;
  };
  await assert.rejects(handleEvent(db, paid));
  db.from = from;
  assert.equal(db.tables.stripe_events.find((e) => e.id === paid.id).handled_at ?? null, null, 'not marked handled');
  assert.equal(await handleEvent(db, paid), 'handled');
  assert.equal(db.tables.payments.length, 1);
  assert.equal(db.tables.invoices[0].status, 'paid');
});

test('break-it tester, 6b run 1: subscription messages out of order never bring back a cancelled level, nor move it to someone else', async () => {
  const db = fakeDb({});
  const ev = (id, type, created, extra = {}) => ({ id, type, created, data: { object: { id: 'sub_1', object: 'subscription', status: 'active', cancel_at_period_end: false, metadata: { user_id: 'u-ana', level: 'executive' }, ...extra } } });
  await handleEvent(db, ev('e1', 'customer.subscription.created', 100));
  await handleEvent(db, ev('e3', 'customer.subscription.deleted', 300, { status: 'canceled' }));
  await handleEvent(db, ev('e2', 'customer.subscription.updated', 200, { cancel_at_period_end: true }));
  await handleEvent(db, ev('e0', 'customer.subscription.updated', 150));
  assert.equal(db.tables.portal_subscriptions[0].status, 'cancelled');
  const db2 = fakeDb({});
  await handleEvent(db2, ev('f1', 'customer.subscription.created', 100));
  await handleEvent(db2, ev('f2', 'customer.subscription.updated', 200, { metadata: { user_id: 'u-other', level: 'executive' } }));
  assert.equal(db2.tables.portal_subscriptions[0].user_id, 'u-ana');
});

test('break-it tester, 6b run 1: a refund made in Stripe (a charge with no refunds list) gets its credit note once; one through the portal adds none', async () => {
  const now = { value: new Date('2026-12-01T12:00:00Z') };
  const { db, stripe, b } = world(now);
  await b.draft('a-ben');
  const id = db.tables.invoices[0].id;
  await b.send(id);
  stripe.settle(db.tables.invoices[0].stripe_invoice_id);
  await deliver(db, stripe);
  await b.refundOrCredit(id, 'refund', 100000, 'Two sessions not used');
  await deliver(db, stripe);
  assert.equal(db.tables.credit_notes.length, 1, 'the portal refund is kept once');
  const inStripe = { id: 'evt_dash', type: 'charge.refunded', created: 1, data: { object: { id: 'ch_1', object: 'charge', invoice: db.tables.invoices[0].stripe_invoice_id, currency: 'gbp', amount_refunded: 150000 } } };
  await handleEvent(db, inStripe);
  await handleEvent(db, { ...inStripe, id: 'evt_dash_again' });
  assert.deepEqual(db.tables.credit_notes.map((c) => c.amount_minor), [100000, 50000]);
});

test('break-it tester, 6b run 1: a refund and a credit pressed at once never return more than was settled', async () => {
  const now = { value: new Date('2026-12-01T12:00:00Z') };
  const { db, stripe, b } = world(now);
  await b.draft('a-ben');
  const id = db.tables.invoices[0].id;
  await b.send(id);
  stripe.settle(db.tables.invoices[0].stripe_invoice_id);
  await deliver(db, stripe);
  const both = await Promise.allSettled([b.refundOrCredit(id, 'refund', 300000), b.refundOrCredit(id, 'credit', 300000)]);
  assert.equal(both.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(db.tables.credit_notes.reduce((n, c) => n + c.amount_minor, 0), 300000);
});

test('break-it tester, 6b run 1: a draft whose save failed is drafted again with a new key, not refused by Stripe', async () => {
  const now = { value: new Date('2026-12-01T12:00:00Z') };
  const { db, stripe, b } = world(now);
  const keys = [];
  const draftInvoice = stripe.draftInvoice;
  stripe.draftInvoice = (x, idem) => { keys.push(idem); return draftInvoice(x, idem); };
  const from = db.from;
  let fail = true;
  db.from = (table) => {
    const q = from(table);
    if (table === 'invoices' && fail) { const ins = q.insert; q.insert = (v) => { fail = false; ins({ ...v, number: null, stripe_invoice_id: null, agreement_id: null }); return { then: (res) => res({ data: null, error: { code: '57014' } }) }; }; }
    return q;
  };
  assert.deepEqual(await b.draft('a-ben'), { drafted: 0 });
  db.from = from;
  db.tables.invoices = [];
  assert.deepEqual(await b.draft('a-ben'), { drafted: 1 });
  assert.equal(new Set(keys).size, 2, 'each try its own key');
});

test('Finances (run 2): Add bank payment and New invoice are the owner\'s alone, and name who they\'re from or for', async () => {
  const { askedFor } = await import('../../api/coach-billing.js');
  const now = { value: new Date('2026-11-19T10:00:00Z') };
  const { db, stripe } = world(now);
  db.tables.organisations = [{ id: 'o-north', name: 'Northfield Logistics', sector: 'Business' }];
  db.tables.organisation_contacts = [{ organisation_id: 'o-north', name: 'Femi Ade', email: 'femi@example.invalid', role: 'Finance' }];
  const owner = billing({ server: db, stripe, coach: OTHER, now: () => now.value });
  const assoc = billing({ server: db, stripe, coach: COACH, now: () => now.value });
  const pay = askedFor({ kind: 'bank_payment', amount: 120000, organisationId: '11111111-1111-4111-8111-111111111111', arrivedOn: '2026-11-19', sector: 'Business', whatFor: 'CLARITY-1212' });
  assert.equal(pay.kind, 'bank_payment');
  assert.equal(askedFor({ kind: 'bank_payment', amount: 120000, arrivedOn: '2026-11-19' }), null, 'nobody named');
  assert.equal(askedFor({ kind: 'bank_payment', amount: -5, payerName: 'X', arrivedOn: '2026-11-19' }), null, 'negative');
  assert.equal(askedFor({ kind: 'bank_payment', amount: 5, payerName: 'X', arrivedOn: '2026-11-19', receiptPath: '../etc/passwd' }).receiptPath, null, 'a path that climbs out is dropped');
  await assert.rejects(assoc.bankPayment({ ...pay, organisationId: 'o-north' }), /Only the owner/);
  await owner.bankPayment({ ...pay, organisationId: 'o-north' });
  const [p] = db.tables.payments;
  assert.deepEqual([p.added_by_coach, p.amount_minor, p.landed_gbp_minor, p.payer_name, p.sector, p.paid_at.slice(0, 10), p.invoice_id ?? null], [true, 120000, 120000, 'Northfield Logistics', 'Business', '2026-11-19', null]);
  const inv = askedFor({ kind: 'one_off', amount: 94000, organisationId: '11111111-1111-4111-8111-111111111111', whatFor: 'Team Workshop, November', currency: 'EUR', due: 'on_receipt' });
  assert.equal(inv.currency, 'EUR');
  assert.equal(askedFor({ kind: 'one_off', amount: 94000, organisationId: '11111111-1111-4111-8111-111111111111', whatFor: '', currency: 'GBP', due: 'in_30' }), null, 'what it is for is needed');
  await assert.rejects(assoc.oneOff({ ...inv, organisationId: 'o-north' }), /Only the owner/);
  const made = await owner.oneOff({ ...inv, organisationId: 'o-north', currency: 'GBP', due: 'in_30' });
  assert.match(made.number, /^CLARITY-\d+$/);
  const row = db.tables.invoices.find((i) => i.id === made.id);
  assert.deepEqual([row.status, row.kind, row.terms_days, row.settles_to, row.payer_email, row.sector], ['draft', 'one_off', 30, 'organisation', 'femi@example.invalid', 'Business']);
  assert.equal(stripe.state.sent.length, 0, 'Save as a draft sends nothing');
  const sent = await owner.oneOff({ ...inv, organisationId: 'o-north', send: true, currency: 'GBP', due: 'on_receipt' });
  assert.equal(sent.status, 'sent');
  const s = db.tables.invoices.find((i) => i.id === sent.id);
  assert.equal(s.due_on, s.issued_on, 'on receipt: due the day it goes');
});
