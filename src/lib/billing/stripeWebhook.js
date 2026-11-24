import { createHmac, timingSafeEqual } from 'node:crypto';

// Stripe's messages to the portal (Phase 6b run 1, step 5): the rules the webhook (api/stripe-webhook.js) and the
// nightly catch-up (api/stripe-catch-up.js) follow, with no database and no network, checked by
// tests/performance/billing-webhook.test.mjs. Server only (node:crypto).
//
// - A message is believed only with Stripe's signature over its exact bytes, made with STRIPE_WEBHOOK_SECRET, at most
//   5 minutes old (Stripe's own scheme: "t=<seconds>,v1=<hex HMAC-SHA256 of '<t>.<body>'>").
// - Each message is acted on exactly once: the server claims its id in stripe_events first (061); a second delivery,
//   or the catch-up reading it again, finds it claimed and does nothing.
// - Messages can arrive in any order: an invoice's status only ever moves on (draft, then sent, then paid, void or
//   uncollectible), never back, and a paid invoice stays paid whatever comes after.

export const TOLERANCE_SECONDS = 300;

/** Whether `header` (Stripe-Signature) is Stripe's signature of `rawBody` with `secret`, made within the tolerance. */
export function verifySignature(rawBody, header, secret, nowSeconds = Math.floor(Date.now() / 1000), tolerance = TOLERANCE_SECONDS) {
  if (typeof rawBody !== 'string' || !rawBody || typeof header !== 'string' || typeof secret !== 'string' || secret.length < 10) return false;
  const parts = header.split(',').map((p) => p.trim().split('=')).filter((p) => p.length === 2);
  const t = Number(parts.find(([k]) => k === 't')?.[1]);
  const sigs = parts.filter(([k]) => k === 'v1').map(([, v]) => v).filter((v) => /^[0-9a-f]{64}$/.test(v));
  if (!Number.isInteger(t) || !sigs.length || Math.abs(nowSeconds - t) > tolerance) return false;
  const want = Buffer.from(createHmac('sha256', secret).update(`${t}.${rawBody}`, 'utf8').digest('hex'), 'utf8');
  return sigs.some((s) => { const got = Buffer.from(s, 'utf8'); return got.length === want.length && timingSafeEqual(got, want); });
}

/** Stripe's own signature header for a body (the stand-in and the tests sign their messages the same way). */
export function signatureFor(rawBody, secret, t = Math.floor(Date.now() / 1000)) {
  return `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${rawBody}`, 'utf8').digest('hex')}`;
}

const RANK = { draft: 0, sent: 1, uncollectible: 2, void: 3, paid: 4 };
/** Stripe's invoice status in the portal's words. */
export const statusOf = (stripeStatus) => ({ draft: 'draft', open: 'sent', paid: 'paid', void: 'void', uncollectible: 'uncollectible' }[stripeStatus] || null);

/**
 * What one invoice message changes, given the portal's row as it is now: { invoice: patch | null, payment: row | null }.
 * The status only ever moves on; paid is final; a message older than the last one applied changes nothing but what can
 * only be added (a payment, which is unique by its Stripe id).
 */
export function invoiceChange(event, row) {
  const inv = event?.data?.object;
  if (!inv || inv.object !== 'invoice' || !row) return { invoice: null, payment: null };
  const at = new Date((Number(event.created) || 0) * 1000).toISOString();
  const was = row.status;
  let next = statusOf(inv.status) || was;
  if (event.type === 'invoice.paid' || event.type === 'invoice.payment_succeeded') next = 'paid';
  if (event.type === 'invoice.voided') next = 'void';
  if (event.type === 'invoice.marked_uncollectible') next = 'uncollectible';
  const newer = !row.stripe_updated_at || at >= row.stripe_updated_at;
  const moves = RANK[next] > RANK[was] || (was === 'uncollectible' && next === 'paid');
  const patch = {};
  if (moves && (newer || next === 'paid')) {
    patch.status = next;
    if (next === 'paid') { patch.paid_at = inv.status_transitions?.paid_at ? new Date(inv.status_transitions.paid_at * 1000).toISOString() : at; patch.paid_minor = Number(inv.amount_paid) || row.total_minor; }
    if (next === 'void') patch.voided_at = at;
  }
  if (newer && inv.hosted_invoice_url && /^https:\/\//.test(inv.hosted_invoice_url)) patch.hosted_url = inv.hosted_invoice_url;
  if (newer) patch.stripe_updated_at = at;
  const paidNow = (event.type === 'invoice.paid' || event.type === 'invoice.payment_succeeded') && Number(inv.amount_paid) > 0;
  const payment = paidNow ? {
    invoice_id: row.id, coach_id: row.coach_id, stripe_id: String(inv.payment_intent || inv.charge || `${inv.id}:paid`),
    amount_minor: Number(inv.amount_paid), currency: String(inv.currency || '').toUpperCase() === 'USD' ? 'USD' : 'GBP',
    method: inv.payment_settings?.payment_method_types?.[0] || null, paid_at: patch.paid_at || at, added_by_coach: false,
  } : null;
  return { invoice: Object.keys(patch).length ? patch : null, payment };
}

/** A refund message: the credit note row to keep (refund through Stripe), unique by Stripe's refund id. */
export function refundRow(event, invoice) {
  const ch = event?.data?.object;
  if (!ch || event.type !== 'charge.refunded' || !invoice) return null;
  const refund = (ch.refunds?.data || [])[0];
  if (!refund?.id || !(Number(refund.amount) > 0)) return null;
  return { invoice_id: invoice.id, coach_id: invoice.coach_id, kind: 'refund', amount_minor: Number(refund.amount),
    currency: String(refund.currency || ch.currency || '').toUpperCase() === 'USD' ? 'USD' : 'GBP', stripe_id: refund.id, reason: refund.reason || null };
}

/** A subscription message: the portal level row to keep (Individual or Executive by the price's own name). */
export function subscriptionRow(event, userId) {
  const sub = event?.data?.object;
  if (!sub || sub.object !== 'subscription' || !userId) return null;
  const level = sub.metadata?.level === 'executive' ? 'executive' : sub.metadata?.level === 'individual' ? 'individual' : null;
  if (!level) return null;
  const status = event.type === 'customer.subscription.deleted' || sub.status === 'canceled' ? 'cancelled'
    : sub.cancel_at_period_end ? 'cancelling' : sub.status === 'past_due' ? 'past_due' : 'active';
  return { user_id: userId, level, source: 'self', stripe_subscription_id: sub.id, status,
    current_period_end: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
    cancelled_at: status === 'cancelled' ? new Date((Number(event.created) || 0) * 1000).toISOString() : null };
}
