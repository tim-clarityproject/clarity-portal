// Stripe's messages (Phase 6b run 1, step 5): signed or refused, and an invoice's status only ever moving on.
import test from 'node:test';
import assert from 'node:assert/strict';
import { invoiceChange, refundRow, signatureFor, subscriptionRow, verifySignature } from '../../src/lib/billing/stripeWebhook.js';

const SECRET = 'whsec_test_not_real_0123456789';
const BODY = JSON.stringify({ id: 'evt_1', type: 'invoice.paid' });
const NOW = 1795600000;

test('only a message signed with the secret, over its exact bytes, within 5 minutes, is believed', () => {
  assert.equal(verifySignature(BODY, signatureFor(BODY, SECRET, NOW), SECRET, NOW), true);
  assert.equal(verifySignature(BODY, signatureFor(BODY, SECRET, NOW - 299), SECRET, NOW), true);
  assert.equal(verifySignature(BODY, signatureFor(BODY, SECRET, NOW - 301), SECRET, NOW), false, 'too old: replayed');
  assert.equal(verifySignature(`${BODY} `, signatureFor(BODY, SECRET, NOW), SECRET, NOW), false, 'a byte changed');
  assert.equal(verifySignature(BODY, signatureFor(BODY, 'whsec_someone_else_000000', NOW), SECRET, NOW), false, 'forged with another secret');
  assert.equal(verifySignature(BODY, `t=${NOW},v1=${'0'.repeat(64)}`, SECRET, NOW), false);
  assert.equal(verifySignature(BODY, '', SECRET, NOW), false);
  assert.equal(verifySignature(BODY, signatureFor(BODY, SECRET, NOW), '', NOW), false, 'no secret set: nothing is believed');
  // Stripe may send two v1 signatures while a secret is rolled: either one will do.
  const two = `t=${NOW},v1=${'a'.repeat(64)},${signatureFor(BODY, SECRET, NOW).split(',')[1]}`;
  assert.equal(verifySignature(BODY, two, SECRET, NOW), true);
});

const row = (over = {}) => ({ id: 'inv-1', coach_id: 'c1', status: 'sent', total_minor: 300000, stripe_updated_at: '2026-11-24T10:00:00.000Z', ...over });
const ev = (type, status, created, extra = {}) => ({ type, created, data: { object: { object: 'invoice', id: 'in_1', status, amount_paid: status === 'paid' ? 300000 : 0, currency: 'gbp', payment_intent: 'pi_1', hosted_invoice_url: 'https://invoice.stripe.com/i/1', ...extra } } });
const T = (iso) => Math.floor(Date.parse(iso) / 1000);

test('paid: the invoice is paid and one payment is kept (unique by Stripe\'s id, so twice adds it once)', () => {
  const c = invoiceChange(ev('invoice.paid', 'paid', T('2026-11-25T09:00:00Z')), row());
  assert.equal(c.invoice.status, 'paid');
  assert.equal(c.invoice.paid_minor, 300000);
  assert.deepEqual([c.payment.stripe_id, c.payment.amount_minor, c.payment.currency, c.payment.added_by_coach], ['pi_1', 300000, 'GBP', false]);
});

test('out of order: an older "sent" after "paid" changes nothing; "paid" after "void" never; paid is final', () => {
  const paid = row({ status: 'paid', stripe_updated_at: '2026-11-25T09:00:00.000Z' });
  assert.equal(invoiceChange(ev('invoice.finalized', 'open', T('2026-11-24T12:00:00Z')), paid).invoice, null);
  assert.equal(invoiceChange(ev('invoice.voided', 'void', T('2026-11-26T12:00:00Z')), paid).invoice?.status, undefined, 'a paid invoice is never voided by a message');
  const voided = row({ status: 'void', stripe_updated_at: '2026-11-25T09:00:00.000Z' });
  assert.equal(invoiceChange(ev('invoice.finalized', 'open', T('2026-11-26T12:00:00Z')), voided).invoice?.status, undefined);
  // A late "paid" still lands, even if an older message was applied after it.
  const late = invoiceChange(ev('invoice.paid', 'paid', T('2026-11-24T08:00:00Z')), row({ stripe_updated_at: '2026-11-24T10:00:00.000Z' }));
  assert.equal(late.invoice.status, 'paid');
  assert.equal(late.invoice.stripe_updated_at, undefined, 'its time doesn\'t move the newest one back');
  // Uncollectible, then paid after all.
  assert.equal(invoiceChange(ev('invoice.paid', 'paid', T('2026-11-27T08:00:00Z')), row({ status: 'uncollectible' })).invoice.status, 'paid');
});

test('a refund keeps a credit note row by Stripe\'s refund id; a subscription keeps its level', () => {
  const r = refundRow({ type: 'charge.refunded', data: { object: { currency: 'gbp', refunds: { data: [{ id: 're_1', amount: 50000, currency: 'gbp' }] } } } }, row());
  assert.deepEqual([r.kind, r.amount_minor, r.stripe_id, r.currency], ['refund', 50000, 're_1', 'GBP']);
  assert.equal(refundRow({ type: 'charge.refunded', data: { object: { refunds: { data: [] } } } }, row()), null);
  const s = subscriptionRow({ type: 'customer.subscription.updated', created: T('2026-11-24T10:00:00Z'), data: { object: { object: 'subscription', id: 'sub_1', status: 'active', cancel_at_period_end: true, metadata: { level: 'executive' }, current_period_end: T('2026-12-24T10:00:00Z') } } }, 'u1');
  assert.deepEqual([s.level, s.status, s.stripe_subscription_id], ['executive', 'cancelling', 'sub_1']);
  assert.equal(subscriptionRow({ type: 'customer.subscription.updated', data: { object: { object: 'subscription', id: 'sub_2', metadata: { level: 'platinum' } } } }, 'u1'), null, 'a level nobody sells is never kept');
});
