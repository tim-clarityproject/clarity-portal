// The whole path on the Stripe stand-in (Phase 6b run 1, step 10): an agreement signed, its invoices drafted, sent,
// settled, an instalment missed, its reminders drafted at 3, 7 and 14 days and sent, a refund and a credit with their
// credit notes, and a portal subscription started and cancelled; every Stripe message through the real webhook rules,
// some of them twice.
import test from 'node:test';
import assert from 'node:assert/strict';
import { billing } from '../../api/_routes/coach-billing.js';
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
  assert.deepEqual([inv.number ?? null, inv.status, inv.total_minor, inv.instalment_n], [null, 'draft', 300000, 1], 'a draft has no number yet (follow-up 5)');
  assert.equal(stripe.state.sent.length, 0, 'nothing sends until Send');
  assert.deepEqual(await b.send(inv.id), { status: 'sent', number: 'CLARITY-1201' });
  assert.equal(stripe.state.invoices.get(inv.stripe_invoice_id).number, 'CLARITY-1201', 'Stripe\'s invoice carries the number');
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
  assert.deepEqual(await b.reminderToSend(fourteen.id), { unsure: true }, 'pressed twice while it goes: sent once');
  await b.reminderSent(r);
  assert.deepEqual(await b.reminderToSend(fourteen.id), { already: true }, 'pressed again once it went: sent once');
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
  const { nightlyRound } = await import('../../api/_routes/billing-nightly.js');
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
  assert.ok(db.tables.invoice_reminders[0].sending_at, 'marked as sending before the email service is asked');
  assert.deepEqual(await b.reminderToSend(rem.id), { unsure: true }, 'a second press never sends it twice');
  await b.releaseReminder(r);
  assert.deepEqual([db.tables.invoice_reminders[0].sent_at ?? null, db.tables.invoice_reminders[0].sending_at], [null, null], 'let go, so it waits to be sent again');
  assert.ok((await b.reminderToSend(rem.id)).reminder);
});

test('the handler: a reminder Resend refuses is let go and the coach is told it didn\'t send', async () => {
  const { sendReminder } = await import('../../api/_routes/coach-billing.js');
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
    const env = { RESEND_API_KEY: 're_test_invented', COACH_EMAIL_FROM: 'Invented <x@example.invalid>' };
    assert.equal(await sendReminder(env, db, COACH, r), 'unsure', 'a server error: it may have gone (follow-up 5)');
    globalThis.fetch = async () => new Response('{}', { status: 422 });
    assert.equal(await sendReminder(env, db, COACH, r), 'refused', 'a refusal: it never went');
    globalThis.fetch = async () => { throw new DOMException('timed out', 'TimeoutError'); };
    assert.equal(await sendReminder(env, db, COACH, r), 'unsure', 'no answer in time: it may have gone');
    globalThis.fetch = async () => new Response('{"id":"x"}', { status: 200 });
    assert.equal(await sendReminder(env, db, COACH, r), 'sent');
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
  const { askedFor } = await import('../../api/_routes/coach-billing.js');
  const now = { value: new Date('2026-11-19T10:00:00Z') };
  const { db, stripe } = world(now);
  db.tables.organisations = [{ id: 'o-north', name: 'Northfield Logistics', sector: 'Business' }];
  db.tables.organisation_contacts = [{ organisation_id: 'o-north', name: 'Femi Ade', email: 'femi@example.invalid', role: 'Finance' }];
  db.tables.organisation_deals = [{ id: 'd-north', organisation_id: 'o-north', name: 'Leadership programme' }]; // the owner's deal ties it to him
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
  assert.equal(made.number, null, 'a draft has no number until it is sent (follow-up 5)');
  const row = db.tables.invoices.find((i) => i.id === made.id);
  assert.deepEqual([row.status, row.kind, row.terms_days, row.settles_to, row.payer_email, row.sector], ['draft', 'one_off', 30, 'organisation', 'femi@example.invalid', 'Business']);
  assert.equal(stripe.state.sent.length, 0, 'Save as a draft sends nothing');
  const sent = await owner.oneOff({ ...inv, organisationId: 'o-north', send: true, currency: 'GBP', due: 'on_receipt' });
  assert.equal(sent.status, 'sent');
  assert.match(sent.number, /^CLARITY-\d+$/);
  const s = db.tables.invoices.find((i) => i.id === sent.id);
  assert.equal(s.due_on, s.issued_on, 'on receipt: due the day it goes');
});

test('follow-up 5, item 6: numbers are given at Send, in order, with no gap from a draft that failed or was never sent', async () => {
  const now = { value: new Date('2026-12-01T12:00:00Z') };
  const { db, stripe, b } = world(now);
  await b.draft('a-ben');
  const first = db.tables.invoices[0];
  // A second draft whose save fails (Stripe made it, the database refused): no number is used up.
  const insert = db.from;
  db.from = (table) => { const q = insert(table); if (table === 'invoices') q.insert = () => ({ select: () => ({ maybeSingle: async () => ({ data: null, error: { code: '23505' } }) }), then: (res) => res({ data: null, error: { code: '23505' } }) }); return q; };
  now.value = new Date('2027-01-01T12:00:00Z');
  await b.draft('a-ben').catch(() => {});
  db.from = insert;
  assert.equal(db.tables.invoices.length, 1);
  // Stripe refuses the first Send: the number stays on the invoice, and the retry uses the same one.
  const realSend = stripe.send;
  stripe.send = async () => { throw Object.assign(new Error('Stripe didn’t answer.'), { code: 'stripe_500' }); };
  await assert.rejects(b.send(first.id));
  stripe.send = realSend;
  assert.equal(db.tables.invoices[0].number, 1201, 'kept for the retry');
  assert.deepEqual(await b.send(first.id), { status: 'sent', number: 'CLARITY-1201' });
  await b.draft('a-ben');
  const second = db.tables.invoices.find((i) => i.id !== first.id);
  assert.equal(second.number ?? null, null);
  assert.deepEqual(await b.send(second.id), { status: 'sent', number: 'CLARITY-1202' }, 'the next number, no gap');
});

test('follow-up 5, item 5: a reminder whose email gets no answer stays marked as sending; Send again only after a check', async () => {
  const now = { value: new Date('2026-12-01T12:00:00Z') };
  const { db, stripe, b } = world(now);
  await b.draft('a-ben');
  await b.send(db.tables.invoices[0].id);
  await deliver(db, stripe);
  now.value = new Date('2026-12-18T09:00:00Z');
  await b.draftReminders();
  const id = db.tables.invoice_reminders[0].id;
  const r = await b.reminderToSend(id);
  assert.ok(r.reminder && r.has064);
  // No answer: nothing is let go and nothing marks it sent.
  assert.deepEqual([db.tables.invoice_reminders[0].sent_at ?? null, Boolean(db.tables.invoice_reminders[0].sending_at)], [null, true]);
  assert.deepEqual(await b.reminderToSend(id), { unsure: true }, 'never sent again by itself');
  assert.deepEqual(await b.reminderToSend(id, { again: true }), { unsure: true }, 'not while a send could still be on its way');
  now.value = new Date('2026-12-18T09:03:00Z');
  const again = await b.reminderToSend(id, { again: true });
  assert.ok(again.reminder, 'Send again, once checked');
  await b.reminderSent(again);
  assert.deepEqual([Boolean(db.tables.invoice_reminders[0].sent_at), db.tables.invoice_reminders[0].sending_at], [true, null]);
  assert.deepEqual(await b.reminderToSend(id, { again: true }), { already: true });
});

test('follow-up 5, item 8: an organisation the owner set up himself, tied to nothing else, is still his to invoice and record a payment from', async () => {
  const now = { value: new Date('2026-11-19T10:00:00Z') };
  const { db, stripe } = world(now);
  const tess = { ...OTHER, user_id: 'u-tess' };
  db.tables.organisations = [{ id: 'o-own', name: 'Harbour Studio', sector: 'Business', created_by: 'u-tess' },
    { id: 'o-else', name: 'Someone Else Ltd', sector: 'Business', created_by: 'u-other' }];
  const owner = billing({ server: db, stripe, coach: tess, now: () => now.value });
  const assoc = billing({ server: db, stripe, coach: { ...COACH, user_id: 'u-tess' }, now: () => now.value });
  const pay = { kind: 'bank_payment', amount: 50000, arrivedOn: '2026-11-19', sector: 'Business', whatFor: 'Workshop' };
  assert.ok((await owner.bankPayment({ ...pay, organisationId: 'o-own' })).id);
  const made = await owner.oneOff({ kind: 'one_off', amount: 50000, organisationId: 'o-own', whatFor: 'Workshop', currency: 'GBP', due: 'in_30' });
  assert.equal(made.status, 'draft');
  await assert.rejects(owner.bankPayment({ ...pay, organisationId: 'o-else' }), /isn’t yours/, 'one he didn’t set up, tied to nothing of his, is refused');
  await assert.rejects(assoc.oneOff({ kind: 'one_off', amount: 50000, organisationId: 'o-own', whatFor: 'x', currency: 'GBP', due: 'in_30' }), /Only the owner/);
});
