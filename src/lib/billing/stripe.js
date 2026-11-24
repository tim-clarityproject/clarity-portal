// Stripe for coaching invoices and portal levels (Phase 6b run 1): the one adapter the server uses, either the real
// Stripe API (test mode only in this run: a live key is refused) or the stand-in, which keeps everything in memory and
// signs its own messages exactly as Stripe does, so the whole path (draft, send, settle, a reminder, a refund, a
// subscription) runs with no key and no network (tests/performance/billing-path.test.mjs). Server only.
//
// Invoices use Stripe's own design (Tim's logo and a black accent are set once in Stripe's own Branding settings) and
// Stripe's hosted payment page (card, Apple Pay, bank transfer; Bacs Direct Debit for UK instalment plans once Tim
// switches it on). Stripe's own automatic reminders are switched off in Stripe; the portal drafts its own.
import { signatureFor } from './stripeWebhook.js';

const API = 'https://api.stripe.com/v1';

/** Whether a key may be used: test mode only (sk_test_…). A live key is refused in this run, whatever else is set. */
export const keyAllowed = (key) => typeof key === 'string' && /^sk_test_[A-Za-z0-9]{10,}$/.test(key);

// Stripe's form encoding: nested objects and arrays as a[b][0][c]=….
function form(obj, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj || {})) {
    if (v == null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object') form(v, key, out); else out.append(key, String(v));
  }
  return out;
}

/** The real Stripe API, with a test key only. */
export function stripeApi(key, fetcher = globalThis.fetch) {
  if (!keyAllowed(key)) throw new Error('Stripe is used in test mode only: set a test key (sk_test_…).');
  const call = async (method, path, body = null, idem = null) => {
    const headers = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Stripe-Version': '2024-06-20' };
    if (idem) headers['Idempotency-Key'] = idem;
    const r = await fetcher(`${API}${path}`, { method, headers, body: body ? form(body).toString() : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j?.error?.message || 'Stripe didn’t answer.'); e.code = j?.error?.code || `stripe_${r.status}`; throw e; }
    return j;
  };
  return {
    real: true,
    customer: (c, idem) => call('POST', '/customers', c, idem),
    draftInvoice: async ({ customer, currency, daysUntilDue, lines, metadata, poNumber, description }, idem) => {
      const inv = await call('POST', '/invoices', {
        customer, currency: currency.toLowerCase(), collection_method: 'send_invoice', days_until_due: daysUntilDue, auto_advance: false,
        metadata, description, ...(poNumber ? { custom_fields: [{ name: 'Purchase order', value: poNumber }] } : {}),
        payment_settings: { payment_method_types: ['card', 'customer_balance', ...(currency === 'GBP' ? ['bacs_debit'] : [])] },
      }, idem && `${idem}:invoice`);
      for (const [i, l] of lines.entries()) {
        await call('POST', '/invoiceitems', { customer, invoice: inv.id, currency: currency.toLowerCase(), amount: l.amount, description: l.description }, idem && `${idem}:line:${i}`);
      }
      return call('GET', `/invoices/${inv.id}`);
    },
    send: async (id) => { await call('POST', `/invoices/${id}/finalize`, { auto_advance: false }); return call('POST', `/invoices/${id}/send`); },
    markPaidByHand: (id) => call('POST', `/invoices/${id}/pay`, { paid_out_of_band: true }),
    void: (id) => call('POST', `/invoices/${id}/void`),
    refund: ({ paymentIntent, amount }, idem) => call('POST', '/refunds', { payment_intent: paymentIntent, amount }, idem),
    creditNote: ({ invoice, amount, memo }, idem) => call('POST', '/credit_notes', { invoice, lines: [{ type: 'custom_line_item', unit_amount: amount, quantity: 1, description: memo || 'Credit' }] }, idem),
    // Every page of them, not only the first 100 (break-it tester, 6b run 1); at most 50 pages a night.
    events: async ({ since }) => {
      const all = [];
      let after = null;
      for (let page = 0; page < 50; page += 1) {
        const r = await call('GET', `/events?limit=100&created[gte]=${Math.floor(new Date(since).getTime() / 1000)}${after ? `&starting_after=${encodeURIComponent(after)}` : ''}`);
        all.push(...(r.data || []));
        if (!r.has_more || !r.data?.length) break;
        after = r.data.at(-1).id;
      }
      return { data: all };
    },
    checkout: ({ priceId, customerEmail, userId, level, successUrl, cancelUrl }) => call('POST', '/checkout/sessions', {
      mode: 'subscription', line_items: [{ price: priceId, quantity: 1 }], customer_email: customerEmail, success_url: successUrl, cancel_url: cancelUrl,
      subscription_data: { metadata: { user_id: userId, level } },
    }),
    cancelSubscription: (id) => call('POST', `/subscriptions/${id}`, { cancel_at_period_end: true }),
  };
}

/**
 * The stand-in: Stripe in memory, for the tests and any build without a key. Every change makes the message Stripe
 * would send (`events`), signed with `secret` so it can be handed to the webhook exactly as Stripe's would be.
 */
export function stripeStandIn({ secret = 'whsec_stand_in_0000000000', now = () => Date.now() } = {}) {
  let n = 0;
  const id = (p) => `${p}_standin${(n += 1)}`;
  const s = { customers: new Map(), invoices: new Map(), refunds: [], creditNotes: [], subs: new Map(), events: [], sent: [] };
  const t = () => Math.floor(now() / 1000);
  const emit = (type, object) => {
    const event = { id: id('evt'), object: 'event', type, created: t(), data: { object: structuredClone(object) } };
    s.events.push(event);
    return event;
  };
  return {
    real: false, state: s,
    /** A message as Stripe would post it: its body and its signature header. */
    delivery: (event) => { const body = JSON.stringify(event); return { body, signature: signatureFor(body, secret, event.created) }; },
    customer: async (c) => { const cu = { id: id('cus'), ...c }; s.customers.set(cu.id, cu); return cu; },
    draftInvoice: async ({ customer, currency, daysUntilDue, lines, metadata, poNumber }) => {
      const inv = { id: id('in'), object: 'invoice', customer, currency: currency.toLowerCase(), status: 'draft', days_until_due: daysUntilDue,
        amount_due: lines.reduce((a, l) => a + l.amount, 0), amount_paid: 0, lines: { data: lines.map((l) => ({ ...l })) }, metadata: metadata || {},
        custom_fields: poNumber ? [{ name: 'Purchase order', value: poNumber }] : null, hosted_invoice_url: null, payment_intent: null };
      s.invoices.set(inv.id, inv);
      emit('invoice.created', inv);
      return structuredClone(inv);
    },
    send: async (invId) => {
      const inv = s.invoices.get(invId);
      if (!inv || inv.status !== 'draft') throw Object.assign(new Error('That invoice isn’t a draft.'), { code: 'invoice_not_draft' });
      inv.status = 'open';
      inv.hosted_invoice_url = `https://invoice.stripe.example/${inv.id}`;
      inv.payment_intent = id('pi');
      emit('invoice.finalized', inv);
      s.sent.push(inv.id);
      emit('invoice.sent', inv);
      return structuredClone(inv);
    },
    /** The client settles it on Stripe's page (the stand-in's own button). */
    settle: (invId) => {
      const inv = s.invoices.get(invId);
      inv.status = 'paid'; inv.amount_paid = inv.amount_due; inv.status_transitions = { paid_at: t() };
      return emit('invoice.paid', inv);
    },
    markPaidByHand: async (invId) => { const inv = s.invoices.get(invId); inv.status = 'paid'; inv.amount_paid = inv.amount_due; inv.paid_out_of_band = true; return structuredClone(emit('invoice.paid', inv).data.object); },
    void: async (invId) => { const inv = s.invoices.get(invId); inv.status = 'void'; emit('invoice.voided', inv); return structuredClone(inv); },
    refund: async ({ paymentIntent, amount }) => {
      const inv = [...s.invoices.values()].find((i) => i.payment_intent === paymentIntent);
      const re = { id: id('re'), amount, currency: inv?.currency || 'gbp', payment_intent: paymentIntent };
      s.refunds.push(re);
      emit('charge.refunded', { object: 'charge', id: id('ch'), invoice: inv?.id || null, currency: re.currency, refunds: { data: [re] } });
      return re;
    },
    creditNote: async ({ invoice, amount, memo }) => { const cn = { id: id('cn'), invoice, amount, memo }; s.creditNotes.push(cn); return cn; },
    events: async ({ since }) => ({ data: s.events.filter((e) => e.created >= Math.floor(new Date(since).getTime() / 1000)) }),
    checkout: async ({ customerEmail, userId, level }) => {
      const sub = { id: id('sub'), object: 'subscription', status: 'active', cancel_at_period_end: false, metadata: { user_id: userId, level }, customer_email: customerEmail, current_period_end: t() + 30 * 86400 };
      s.subs.set(sub.id, sub);
      emit('customer.subscription.created', sub);
      return { id: id('cs'), url: `https://checkout.stripe.example/${sub.id}` };
    },
    cancelSubscription: async (subId) => { const sub = s.subs.get(subId); sub.cancel_at_period_end = true; emit('customer.subscription.updated', sub); return structuredClone(sub); },
  };
}
