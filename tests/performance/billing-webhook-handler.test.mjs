// The webhook end to end on an in-memory stand-in for the database (Phase 6b run 1, step 5 and the break-it list):
// a message sent twice is acted on once, messages out of order never move an invoice back, a forged or stale message
// is refused, and with no secret set nothing is believed.
import test from 'node:test';
import assert from 'node:assert/strict';
import handler, { handleEvent } from '../../api/stripe-webhook.js';
import { signatureFor } from '../../src/lib/billing/stripeWebhook.js';

/** Just enough of supabase-js's query builder over plain arrays, with unique keys as 061 has them. */
function fakeDb(seed) {
  const t = structuredClone(seed);
  const UNIQUE = { stripe_events: 'id', payments: 'stripe_id', credit_notes: 'stripe_id', portal_subscriptions: 'stripe_subscription_id' };
  const q = (table) => {
    const rows = (t[table] ||= []);
    const where = [];
    let op = null;
    let values = null;
    let opts = {};
    const match = (r) => where.every(([k, v, how]) => (how === 'is' ? r[k] == v : r[k] === v));
    const run = () => {
      if (op === 'upsert') {
        const key = opts.onConflict || UNIQUE[table];
        const out = [];
        for (const v of [values].flat()) {
          const hit = rows.find((r) => r[key] === v[key]);
          if (hit) { if (!opts.ignoreDuplicates) { Object.assign(hit, v); out.push(hit); } } else { const r = { ...v }; rows.push(r); out.push(r); }
        }
        return { data: out, error: null };
      }
      if (op === 'update') { const hit = rows.filter(match); hit.forEach((r) => Object.assign(r, values)); return { data: hit, error: null }; }
      if (op === 'delete') { const keep = rows.filter((r) => !match(r)); rows.length = 0; rows.push(...keep); return { data: null, error: null }; }
      return { data: rows.filter(match), error: null };
    };
    const b = {
      upsert(v, o = {}) { op = 'upsert'; values = v; opts = o; return b; },
      update(v) { op = 'update'; values = v; return b; },
      delete() { op = 'delete'; return b; },
      select() { if (!op) op = 'select'; return b; },
      eq(k, v) { where.push([k, v]); return b; },
      is(k, v) { where.push([k, v, 'is']); return b; },
      maybeSingle() { const r = run(); return Promise.resolve({ data: (r.data || [])[0] || null, error: null }); },
      then(res, rej) { return Promise.resolve(run()).then(res, rej); },
    };
    return b;
  };
  return { from: q, tables: t };
}

const SECRET = 'whsec_test_not_real_0123456789';
const INVOICE = { id: 'inv-1', coach_id: 'c1', status: 'sent', total_minor: 300000, stripe_invoice_id: 'in_1', stripe_updated_at: '2026-11-24T10:00:00.000Z' };
const T = (iso) => Math.floor(Date.parse(iso) / 1000);
const paid = (id, at) => ({ id, type: 'invoice.paid', created: T(at), data: { object: { object: 'invoice', id: 'in_1', status: 'paid', amount_paid: 300000, currency: 'gbp', payment_intent: 'pi_1' } } });

test('the same message twice: one payment, one change', async () => {
  const db = fakeDb({ invoices: [INVOICE], invoice_reminders: [{ id: 'r1', invoice_id: 'inv-1', stage: 3, sent_at: null }] });
  assert.equal(await handleEvent(db, paid('evt_1', '2026-11-25T09:00:00Z')), 'handled');
  assert.equal(await handleEvent(db, paid('evt_1', '2026-11-25T09:00:00Z')), 'already');
  // The same payment under a second message id (Stripe's invoice.payment_succeeded beside invoice.paid): still one.
  assert.equal(await handleEvent(db, { ...paid('evt_2', '2026-11-25T09:00:01Z'), type: 'invoice.payment_succeeded' }), 'handled');
  assert.equal(db.tables.payments.length, 1);
  assert.equal(db.tables.invoices[0].status, 'paid');
  assert.equal(db.tables.invoice_reminders.length, 0, 'the reminder drafted for it goes once it is paid');
});

test('out of order: "finalized" arriving after "paid" leaves it paid', async () => {
  const db = fakeDb({ invoices: [INVOICE] });
  await handleEvent(db, paid('evt_1', '2026-11-25T09:00:00Z'));
  await handleEvent(db, { id: 'evt_0', type: 'invoice.finalized', created: T('2026-11-24T11:00:00Z'), data: { object: { object: 'invoice', id: 'in_1', status: 'open' } } });
  assert.equal(db.tables.invoices[0].status, 'paid');
});

const call = async (body, headers, env) => {
  const res = { code: 0, body: null, status(c) { this.code = c; return this; }, setHeader() { return this; }, json(b) { this.body = b; return this; } };
  await handler({ method: 'POST', body, headers }, res, env);
  return res;
};

test('the endpoint: forged, stale or unsigned messages are refused before anything is read', async () => {
  const body = JSON.stringify(paid('evt_9', '2026-11-25T09:00:00Z'));
  const env = { STRIPE_WEBHOOK_SECRET: SECRET, SUPABASE_SERVICE_ROLE_KEY: '' };
  assert.equal((await call(body, { 'stripe-signature': signatureFor(body, 'whsec_forged_000000000000') }, env)).code, 400);
  assert.equal((await call(body, { 'stripe-signature': signatureFor(body, SECRET, Math.floor(Date.now() / 1000) - 3600) }, env)).code, 400);
  assert.equal((await call(body, {}, env)).code, 400);
  assert.equal((await call(body, { 'stripe-signature': signatureFor(body, SECRET) }, { STRIPE_WEBHOOK_SECRET: '' })).code, 400, 'no secret set: nothing believed');
  // Signed properly, it gets as far as the database (none here: 503, Stripe tries again later).
  assert.equal((await call(body, { 'stripe-signature': signatureFor(body, SECRET) }, env)).code, 503);
});

// ---------------------------------------------------------------- follow-up 5: a webhook on 2025-04-30.basil
// A basil invoice has no payment_intent or charge of its own (its payments sit under `payments`, its subscription
// under `parent`), and nothing in a message is trusted beyond its type and its object's id: the invoice is read fresh
// from Stripe at the code's own version (2024-06-20), here a stand-in answering in that shape.
const basilPaid = (id, at) => ({
  id, object: 'event', api_version: '2025-04-30.basil', type: 'invoice.paid', created: T(at),
  data: { object: {
    object: 'invoice', id: 'in_1', status: 'paid', currency: 'eur', amount_paid: 1, total: 1,
    parent: { type: 'subscription_details', subscription_details: { subscription: 'sub_x' } },
    payments: { object: 'list', data: [{ object: 'invoice_payment', payment: { type: 'payment_intent', payment_intent: 'pi_wrong' }, amount_paid: 1 }] },
    status_transitions: { paid_at: T('2020-01-01T00:00:00Z') },
  } },
});
const pinned = (invoices) => ({
  asked: [],
  async retrieve(kind, id) {
    this.asked.push([kind, id]);
    const found = kind === 'invoice' ? invoices[id] : null;
    if (!found) throw Object.assign(new Error('No such object.'), { code: 'resource_missing' });
    return structuredClone(found);
  },
});

test('follow-up 5: a basil-shaped invoice.paid is used only for its type and id; the invoice is read fresh at the code’s version', async () => {
  const db = fakeDb({ invoices: [INVOICE] });
  const stripe = pinned({ in_1: { object: 'invoice', id: 'in_1', status: 'paid', amount_paid: 300000, currency: 'gbp', payment_intent: 'pi_1',
    status_transitions: { paid_at: T('2026-11-25T08:59:00Z') }, hosted_invoice_url: 'https://invoice.stripe.com/i/in_1' } });
  assert.equal(await handleEvent(db, basilPaid('evt_b1', '2026-11-25T09:00:00Z'), stripe), 'handled');
  assert.deepEqual(stripe.asked, [['invoice', 'in_1']]);
  const [p] = db.tables.payments;
  assert.deepEqual([p.stripe_id, p.amount_minor, p.currency, p.paid_at], ['pi_1', 300000, 'GBP', '2026-11-25T08:59:00.000Z'], 'the fresh invoice’s payment, never the message’s');
  assert.equal(db.tables.invoices[0].status, 'paid');
  assert.equal(db.tables.invoices[0].paid_minor, 300000);
  // Stripe no longer has the invoice: handled, nothing changed.
  const db2 = fakeDb({ invoices: [INVOICE] });
  assert.equal(await handleEvent(db2, basilPaid('evt_b2', '2026-11-25T09:00:00Z'), pinned({})), 'ignored');
  assert.equal((db2.tables.payments || []).length, 0);
  // Stripe can't be asked: thrown, so the message is tried again and never marked handled.
  const db3 = fakeDb({ invoices: [INVOICE] });
  await assert.rejects(handleEvent(db3, basilPaid('evt_b3', '2026-11-25T09:00:00Z'), { retrieve: async () => { throw Object.assign(new Error('no answer'), { code: 'stripe_500' }); } }));
  assert.equal((db3.tables.stripe_events || []).length, 0);
});

test('follow-up 5: the endpoint acts on nothing without a test key to read the object fresh (Stripe tries again)', async () => {
  const body = JSON.stringify(basilPaid('evt_b4', '2026-11-25T09:00:00Z'));
  const env = { STRIPE_WEBHOOK_SECRET: SECRET, SUPABASE_SERVICE_ROLE_KEY: 'service-invented', SUPABASE_URL: 'http://127.0.0.1:9', STRIPE_SECRET_KEY: '' };
  assert.equal((await call(body, { 'stripe-signature': signatureFor(body, SECRET) }, env)).code, 503);
  assert.equal((await call(body, { 'stripe-signature': signatureFor(body, SECRET) }, { ...env, STRIPE_SECRET_KEY: 'sk_live_not_allowed_000000' })).code, 503, 'never a live key');
});

test('follow-up 5: Stripe is asked for the object at the code’s own pinned version, and only for a Stripe id', async () => {
  const { stripeApi } = await import('../../src/lib/billing/stripe.js');
  const seen = [];
  const api = stripeApi('sk_test_invented0123456789', async (url, init) => { seen.push([url, init.method, init.headers['Stripe-Version']]); return new Response('{"id":"in_1","object":"invoice"}', { status: 200 }); });
  await api.retrieve('invoice', 'in_1');
  await api.retrieve('charge', 'ch_2');
  await api.retrieve('subscription', 'sub_3');
  assert.deepEqual(seen, [['https://api.stripe.com/v1/invoices/in_1', 'GET', '2024-06-20'], ['https://api.stripe.com/v1/charges/ch_2', 'GET', '2024-06-20'], ['https://api.stripe.com/v1/subscriptions/sub_3', 'GET', '2024-06-20']]);
  await assert.rejects(api.retrieve('invoice', '../customers/cus_1'), { code: 'resource_missing' });
  assert.equal(seen.length, 3);
});
