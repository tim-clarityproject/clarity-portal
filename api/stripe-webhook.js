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
// Environment variables (Vercel): STRIPE_WEBHOOK_SECRET, SUPABASE_SERVICE_ROLE_KEY, and the Supabase URL the app has.
import { createClient } from '@supabase/supabase-js';
import { supabaseOf } from './_coachEmails.js';
import { invoiceChange, refundRow, subscriptionRow, verifySignature } from '../src/lib/billing/stripeWebhook.js';

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
 * catch-up (api/stripe-catch-up.js), which hands it the messages Stripe kept, already signed by Stripe's own API.
 * @returns {Promise<'handled'|'already'|'ignored'>}
 */
export async function handleEvent(server, event) {
  if (!event?.id || typeof event.type !== 'string') return 'ignored';
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
      if (change.payment) await must(server.from('payments').upsert(change.payment, { onConflict: 'stripe_id', ignoreDuplicates: true }));
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
    const done = await handleEvent(serverClient(env), event);
    return reply(res, 200, { ok: true, done });
  } catch {
    // Stripe tries again later; the claim keeps it from being acted on twice.
    return reply(res, 500, { ok: false });
  }
}
