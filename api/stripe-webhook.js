// Stripe's messages about invoices, refunds and portal subscriptions (Phase 6b run 1, step 5).
//
//   POST /api/stripe-webhook   (from Stripe only, with its Stripe-Signature header)
//
// Each message is believed only with Stripe's signature over its exact bytes, made with STRIPE_WEBHOOK_SECRET (Tim adds
// it in Vercel, Preview, after this run), and acted on exactly once: its id is claimed in stripe_events first (061),
// so a second delivery, or the nightly catch-up reading it again, does nothing. Messages may come in any order: an
// invoice's status only ever moves on and paid is final (src/lib/billing/stripeWebhook.js). Nothing here sends
// anything. With no secret set, every message is refused (400), so nothing unsigned is ever believed.
//
// A payment Stripe settles is kept with the pounds that landed and Stripe's fee, read from its balance transaction
// (Phase 6b run 2) when Stripe can be asked (STRIPE_SECRET_KEY, a test key); if it can't, the payment is still kept
// without them (a payment in pounds as its own amount) and the nightly round fills them in (fillLanded).
//
// Only a message's type and its object's id are used: the invoice, charge or subscription is read fresh from Stripe at
// the code's own pinned version (2024-06-20), whatever version the webhook itself runs on (follow-up 5).
//
// Environment variables (Vercel): STRIPE_WEBHOOK_SECRET, SUPABASE_SERVICE_ROLE_KEY, STRIPE_SECRET_KEY (needed: a test key),
// and the Supabase URL the app has.
import { createClient } from '@supabase/supabase-js';
import { supabaseOf } from './_coachEmails.js';
import { freshEvent, invoiceChange, landedFrom, refundRow, subscriptionRow, verifySignature } from '../src/lib/billing/stripeWebhook.js';
import { keyAllowed, stripeApi } from '../src/lib/billing/stripe.js';

// Stripe signs the exact bytes, so the body is read as it came, never parsed first.
export const config = { maxDuration: 30, api: { bodyParser: false } };

const reply = (res, status, body) => { res.status(status).setHeader('Cache-Control', 'no-store'); res.json(body); };
const BODY_MAX = 256 * 1024;

async function rawBodyOf(req) {
  if (typeof req.body === 'string') return req.body;
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > BODY_MAX) throw new Error('too big');
    chunks.push(typeof c === 'string' ? Buffer.from(c) : c);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * Acts on one message, exactly once (the claim in stripe_events), with the server's own key. Shared with the nightly
 * round (api/_routes/billing-nightly.js), which hands it the messages Stripe kept, already signed by Stripe's own API.
 * `stripe` (optional: the real API or the stand-in) is asked what a new payment landed as in pounds, and its fee.
 * @returns {Promise<'handled'|'already'|'ignored'>}
 */
export async function handleEvent(server, given, stripe = null) {
  if (!given?.id || typeof given.type !== 'string') return 'ignored';
  // The message is used only for its type and its object's id: the object is read fresh from Stripe at the code's own
  // version whenever Stripe can be asked (follow-up 5: the webhook now runs on 2025-04-30.basil).
  const event = stripe?.retrieve ? await freshEvent(given, stripe) : given;
  if (!event) {
    await server.from('stripe_events').upsert({ id: given.id, type: given.type, object_id: given.data?.object?.id || null, handled_at: new Date().toISOString() }, { onConflict: 'id', ignoreDuplicates: true });
    return 'ignored';
  }
  const obj = event.data?.object || {};
  const { data: claimed, error: claimError } = await server.from('stripe_events')
    .upsert({ id: event.id, type: event.type, object_id: obj.id || null, stripe_at: event.created ? new Date(event.created * 1000).toISOString() : null },
      { onConflict: 'id', ignoreDuplicates: true }).select('id, handled_at');
  if (claimError) throw claimError;
  if (!claimed?.length) {
    // Claimed before: handled already, or a delivery that stopped part-way (then handled again now, which is safe:
    // every change below only moves forward and every row is unique by Stripe's own id).
    const { data: was } = await server.from('stripe_events').select('handled_at').eq('id', event.id).maybeSingle();
    if (was?.handled_at) return 'already';
  }
  // Every database answer is checked: an error is thrown, so the message isn't marked handled and Stripe (or the
  // nightly catch-up) tries again; only a real "no such invoice" counts as handled (break-it tester, 6b run 1).
  const must = async (q) => { const r = await q; if (r?.error) throw r.error; return r; };
  if (obj.object === 'invoice' && obj.id) {
    const { data: row } = await must(server.from('invoices').select('*').eq('stripe_invoice_id', obj.id).maybeSingle());
    if (row) {
      const change = invoiceChange(event, row);
      if (change.payment) {
        const balance = stripe?.balanceFor ? await stripe.balanceFor(change.payment.stripe_id).catch(() => null) : null;
        const payment = { ...change.payment, ...landedFrom(balance, change.payment) };
        await must(server.from('payments').upsert(payment, { onConflict: 'stripe_id', ignoreDuplicates: true }));
      }
      if (change.invoice) await must(server.from('invoices').update({ ...change.invoice, updated_at: new Date().toISOString() }).eq('id', row.id));
      // Paid: the overdue reminders drafted for it go at once (they would ask for what's settled).
      if (change.invoice?.status === 'paid') await must(server.from('invoice_reminders').delete().eq('invoice_id', row.id).is('sent_at', null));
    }
  } else if (event.type === 'charge.refunded' && obj.invoice) {
    const { data: row } = await must(server.from('invoices').select('*').eq('stripe_invoice_id', obj.invoice).maybeSingle());
    const { data: notes } = row ? await must(server.from('credit_notes').select('amount_minor, kind').eq('invoice_id', row.id)) : { data: [] };
    const credit = refundRow(event, row, notes || []);
    if (credit) await must(server.from('credit_notes').upsert(credit, { onConflict: 'stripe_id', ignoreDuplicates: true }));
  } else if (obj.object === 'subscription' && obj.id && obj.metadata?.user_id) {
    const { data: was } = await must(server.from('portal_subscriptions').select('user_id, status, stripe_updated_at').eq('stripe_subscription_id', obj.id).maybeSingle());
    const sub = subscriptionRow(event, was?.user_id || obj.metadata.user_id, was);
    if (sub) await must(server.from('portal_subscriptions').upsert({ ...sub, updated_at: new Date().toISOString() }, { onConflict: 'stripe_subscription_id' }));
  } else {
    await must(server.from('stripe_events').update({ handled_at: new Date().toISOString() }).eq('id', event.id));
    return 'ignored';
  }
  await must(server.from('stripe_events').update({ handled_at: new Date().toISOString() }).eq('id', event.id));
  return 'handled';
}

/**
 * The nightly round's part: Stripe's payments of the last 30 days still without their fee (and so, for another
 * currency, without the pounds that landed) are looked up again and filled in. Nothing else changes.
 * @returns {Promise<number>} how many were filled in
 */
export async function fillLanded({ server, stripe, now = () => new Date(), days = 30 }) {
  if (!stripe?.balanceFor) return 0;
  const { data, error } = await server.from('payments').select('id, stripe_id, amount_minor, currency, landed_gbp_minor, fee_minor, paid_at, added_by_coach')
    .eq('added_by_coach', false).is('fee_minor', null);
  if (error) throw error;
  const since = now().getTime() - days * 86400000;
  let filled = 0;
  for (const p of data || []) {
    if (!p.stripe_id || !(Date.parse(p.paid_at) >= since)) continue;
    const balance = await stripe.balanceFor(p.stripe_id).catch(() => null);
    if (!balance) continue;
    const got = landedFrom(balance, p);
    if (got.fee_minor == null) continue;
    const r = await server.from('payments').update({ landed_gbp_minor: got.landed_gbp_minor, fee_minor: got.fee_minor }).eq('id', p.id);
    if (r?.error) throw r.error;
    filled += 1;
  }
  return filled;
}

export function serverClient(env) {
  const { url } = supabaseOf(env);
  return createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}

export default async function handler(req, res, env = process.env) {
  if (req.method !== 'POST') return reply(res, 405, { ok: false });
  const secret = env.STRIPE_WEBHOOK_SECRET || '';
  let raw;
  try { raw = await rawBodyOf(req); } catch { return reply(res, 413, { ok: false }); }
  if (!secret || !verifySignature(raw, String(req.headers?.['stripe-signature'] || ''), secret)) return reply(res, 400, { ok: false });
  let event;
  try { event = JSON.parse(raw); } catch { return reply(res, 400, { ok: false }); }
  if (!env.SUPABASE_SERVICE_ROLE_KEY) return reply(res, 503, { ok: false });
  try {
    // Every object is read fresh from Stripe (with a test key only), so without one nothing is acted on: Stripe tries
    // the message again later, once the key is there (follow-up 5).
    let stripe = null;
    try { stripe = keyAllowed(env.STRIPE_SECRET_KEY || '') ? stripeApi(env.STRIPE_SECRET_KEY) : null; } catch { stripe = null; }
    if (!stripe) return reply(res, 503, { ok: false });
    const done = await handleEvent(serverClient(env), event, stripe);
    return reply(res, 200, { ok: true, done });
  } catch {
    // Stripe tries again later; the claim keeps it from being acted on twice.
    return reply(res, 500, { ok: false });
  }
}
