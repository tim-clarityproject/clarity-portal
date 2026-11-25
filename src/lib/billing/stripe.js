/* global structuredClone */
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
/** What a webhook message names, and where it is read fresh (follow-up 5). */
export const RETRIEVE_PATHS = Object.freeze({ invoice: 'invoices', charge: 'charges', subscription: 'subscriptions' });
const OBJECT_ID = /^(in|ch|sub)_[A-Za-z0-9]{1,200}$/;

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
    // Phase 6b run 3: `methods` narrows how it can be settled (the first payment at signing: ['card'] only, Apple Pay
    // riding on card; an organisation's: ['customer_balance'] with UK bank transfer details), `defaultPaymentMethod` with
    // `automatic` collects a later instalment by the Bacs Direct Debit set up after the first payment.
    draftInvoice: async ({ customer, currency, daysUntilDue, lines, metadata, poNumber, description, methods = null, automatic = false, defaultPaymentMethod = null, customFields = [] }, idem) => {
      const types = methods || ['card', 'customer_balance', ...(currency === 'GBP' ? ['bacs_debit'] : [])];
      const fields = [...(poNumber ? [{ name: 'Purchase order', value: poNumber }] : []), ...customFields].slice(0, 4);
      const inv = await call('POST', '/invoices', {
        customer, currency: currency.toLowerCase(), auto_advance: false, metadata, description,
        ...(automatic ? { collection_method: 'charge_automatically', default_payment_method: defaultPaymentMethod } : { collection_method: 'send_invoice', days_until_due: daysUntilDue }),
        ...(fields.length ? { custom_fields: fields } : {}),
        payment_settings: {
          payment_method_types: types,
          ...(types.includes('customer_balance') && currency === 'GBP'
            ? { payment_method_options: { customer_balance: { funding_type: 'bank_transfer', bank_transfer: { type: 'gb_bank_transfer' } } } } : {}),
        },
      }, idem && `${idem}:invoice`);
      for (const [i, l] of lines.entries()) {
        await call('POST', '/invoiceitems', { customer, invoice: inv.id, currency: currency.toLowerCase(), amount: l.amount, description: l.description }, idem && `${idem}:line:${i}`);
      }
      return call('GET', `/invoices/${inv.id}`);
    },
    // The object a webhook message is about, read fresh at this code's own pinned version (2024-06-20), so the shape
    // of the message itself (Stripe's webhook may run on a newer version, such as 2025-04-30.basil) never matters.
    retrieve: (kind, id) => {
      const path = RETRIEVE_PATHS[kind];
      if (!path || !OBJECT_ID.test(String(id || ''))) return Promise.reject(Object.assign(new Error('Not a Stripe object.'), { code: 'resource_missing' }));
      return call('GET', `/${path}/${id}`);
    },
    // The draft's number and its portal number, set just before it is finalised (Stripe allows a number on a draft only).
    // Asked again for a draft that already has it, Stripe answers with the same invoice.
    number: (id, portalNumber) => call('POST', `/invoices/${id}`, { number: portalNumber, metadata: { portal_number: portalNumber } }),
    send: async (id) => { await call('POST', `/invoices/${id}/finalize`, { auto_advance: false }); return call('POST', `/invoices/${id}/send`); },
    // ---- Phase 6b run 3 (065): the first payment at signing, Bacs for the rest, organisations' bank transfer details.
    /** A purchase order added to a draft before it is sent. */
    purchaseOrder: (id, po) => call('POST', `/invoices/${id}`, { custom_fields: [{ name: 'Purchase order', value: String(po).slice(0, 30) }] }),
    /** Finalised without Stripe's own email (the first payment is settled on the portal's page; an organisation's goes from the coach). */
    finalize: (id) => call('POST', `/invoices/${id}/finalize?expand%5B%5D=payment_intent`, { auto_advance: false }),
    /** The payment intent's secret for Stripe's Payment Element, and its state. */
    paymentIntent: (id) => {
      if (!/^pi_[A-Za-z0-9]{1,200}$/.test(String(id || ''))) return Promise.reject(Object.assign(new Error('Not a payment.'), { code: 'resource_missing' }));
      return call('GET', `/payment_intents/${id}`);
    },
    /** A Bacs Direct Debit set up for later instalments (pounds only), confirmed on the client's page. */
    setupIntent: ({ customer, metadata }, idem) => call('POST', '/setup_intents', { customer, usage: 'off_session', payment_method_types: ['bacs_debit'], metadata }, idem),
    /** The customer's Bacs Direct Debit, once set up: its payment method's id, or null. */
    bacsMethod: async (customer) => {
      if (!/^cus_[A-Za-z0-9]{1,200}$/.test(String(customer || ''))) return null;
      const r = await call('GET', `/payment_methods?customer=${encodeURIComponent(customer)}&type=bacs_debit&limit=1`);
      return r?.data?.[0]?.id || null;
    },
    /** An organisation's own UK bank transfer details (sort code and account number), so its transfers match by themselves. */
    fundingInstructions: async (customer) => {
      const r = await call('POST', `/customers/${customer}/funding_instructions`, { currency: 'gbp', funding_type: 'bank_transfer', bank_transfer: { type: 'gb_bank_transfer' } });
      const sc = (r?.bank_transfer?.financial_addresses || []).find((a) => a.type === 'sort_code')?.sort_code;
      return sc ? { accountName: sc.account_holder_name || '', sortCode: sc.sort_code || '', accountNumber: sc.account_number || '' } : null;
    },
    /** Test mode only: a bank transfer arriving in a customer's balance (Stripe then settles its open invoices). */
    fundCashBalance: (customer, amount, reference) => call('POST', `/test_helpers/customers/${customer}/fund_cash_balance`, { amount, currency: 'gbp', reference }),
    /** The email of an invoice already finalised (an earlier Send whose email didn't go). */
    email: (id) => call('POST', `/invoices/${id}/send`),
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
    /**
     * What a payment came to in the account's own currency: its balance transaction's amount and fee (pence), from a
     * payment intent (its latest charge's) or a charge; null when Stripe has none yet.
     */
    balanceFor: async (id) => {
      const ref = String(id || '');
      let bt = null;
      if (/^pi_[A-Za-z0-9]+$/.test(ref)) bt = (await call('GET', `/payment_intents/${ref}?expand%5B%5D=latest_charge.balance_transaction`))?.latest_charge?.balance_transaction;
      else if (/^ch_[A-Za-z0-9]+$/.test(ref)) bt = (await call('GET', `/charges/${ref}?expand%5B%5D=balance_transaction`))?.balance_transaction;
      else return null;
      return bt && typeof bt === 'object' ? { amount: bt.amount, fee: bt.fee, currency: bt.currency } : null;
    },
    checkout: ({ priceId, customerEmail, userId, level, successUrl, cancelUrl }) => call('POST', '/checkout/sessions', {
      mode: 'subscription', line_items: [{ price: priceId, quantity: 1 }], customer_email: customerEmail, success_url: successUrl, cancel_url: cancelUrl,
      subscription_data: { metadata: { user_id: userId, level } },
    }),
    cancelSubscription: (id) => call('POST', `/subscriptions/${id}`, { cancel_at_period_end: true }),
  };
}

/** The stand-in's fixed, invented rates: dollars or euros to the pound (never a real rate). */
export const STAND_IN_RATES = Object.freeze({ GBP: 1, USD: 1.25, EUR: 1.16 });

/**
 * The stand-in: Stripe in memory, for the tests and any build without a key. Every change makes the message Stripe
 * would send (`events`), signed with `secret` so it can be handed to the webhook exactly as Stripe's would be.
 */
export function stripeStandIn({ secret = 'whsec_stand_in_0000000000', now = () => Date.now(), prefix = 'standin' } = {}) {
  let n = 0;
  // `prefix`: a run against a database that outlives one stand-in (the local stand-in's checks) keeps its ids apart.
  const id = (p) => `${p}_${prefix}${(n += 1)}`;
  const s = { customers: new Map(), invoices: new Map(), charges: new Map(), refunds: [], creditNotes: [], subs: new Map(), events: [], sent: [],
    intents: new Map(), setups: new Map(), bacs: new Map() };
  const t = () => Math.floor(now() / 1000);
  const emit = (type, object) => {
    const event = { id: id('evt'), object: 'event', type, created: t(), data: { object: structuredClone(object) } };
    s.events.push(event);
    return event;
  };
  return {
    real: false, state: s,
    /** As the real one: the object as it stands now, at the code's own version. */
    retrieve: async (kind, objId) => {
      const found = { invoice: s.invoices, charge: s.charges, subscription: s.subs }[kind]?.get(objId);
      if (!found) throw Object.assign(new Error('No such object.'), { code: 'resource_missing' });
      return structuredClone(found);
    },
    /** A message as Stripe would post it: its body and its signature header. */
    delivery: (event) => { const body = JSON.stringify(event); return { body, signature: signatureFor(body, secret, event.created) }; },
    customer: async (c) => { const cu = { id: id('cus'), ...c }; s.customers.set(cu.id, cu); return cu; },
    draftInvoice: async ({ customer, currency, daysUntilDue, lines, metadata, poNumber, methods = null, automatic = false, defaultPaymentMethod = null, customFields = [] }) => {
      const types = methods || ['card', 'customer_balance', ...(currency === 'GBP' ? ['bacs_debit'] : [])];
      const fields = [...(poNumber ? [{ name: 'Purchase order', value: poNumber }] : []), ...customFields].slice(0, 4);
      const inv = { id: id('in'), object: 'invoice', customer, currency: currency.toLowerCase(), status: 'draft', days_until_due: automatic ? null : daysUntilDue,
        collection_method: automatic ? 'charge_automatically' : 'send_invoice', default_payment_method: automatic ? defaultPaymentMethod : null,
        payment_settings: { payment_method_types: types },
        amount_due: lines.reduce((a, l) => a + l.amount, 0), amount_paid: 0, lines: { data: lines.map((l) => ({ ...l })) }, metadata: metadata || {},
        custom_fields: fields.length ? fields : null, hosted_invoice_url: null, payment_intent: null };
      s.invoices.set(inv.id, inv);
      emit('invoice.created', inv);
      return structuredClone(inv);
    },
    number: async (invId, portalNumber) => {
      const inv = s.invoices.get(invId);
      if (!inv || inv.status !== 'draft') throw Object.assign(new Error('That invoice isn’t a draft.'), { code: 'invoice_not_draft' });
      if ([...s.invoices.values()].some((o) => o.id !== invId && o.number === portalNumber)) throw Object.assign(new Error('That number is in use.'), { code: 'invoice_number_taken' });
      inv.number = portalNumber;
      inv.metadata = { ...inv.metadata, portal_number: portalNumber };
      emit('invoice.updated', inv);
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
    // ---- Phase 6b run 3 (065), as the real ones.
    purchaseOrder: async (invId, po) => {
      const inv = s.invoices.get(invId);
      if (!inv || inv.status !== 'draft') throw Object.assign(new Error('That invoice isn’t a draft.'), { code: 'invoice_not_draft' });
      inv.custom_fields = [{ name: 'Purchase order', value: String(po).slice(0, 30) }];
      return structuredClone(inv);
    },
    finalize: async (invId) => {
      const inv = s.invoices.get(invId);
      if (!inv || inv.status !== 'draft') throw Object.assign(new Error('That invoice isn’t a draft.'), { code: 'invoice_not_draft' });
      inv.status = 'open';
      inv.hosted_invoice_url = `https://invoice.stripe.example/${inv.id}`;
      const pi = { id: id('pi'), object: 'payment_intent', status: 'requires_payment_method', amount: inv.amount_due, currency: inv.currency, invoice: inv.id };
      pi.client_secret = `${pi.id}_secret_standin`;
      s.intents.set(pi.id, pi);
      inv.payment_intent = pi.id;
      emit('invoice.finalized', inv);
      return { ...structuredClone(inv), payment_intent: structuredClone(pi) };
    },
    paymentIntent: async (piId) => {
      const pi = s.intents.get(piId);
      if (!pi) throw Object.assign(new Error('No such payment.'), { code: 'resource_missing' });
      return structuredClone(pi);
    },
    setupIntent: async ({ customer, metadata }) => {
      const si = { id: id('seti'), object: 'setup_intent', customer, status: 'requires_payment_method', usage: 'off_session', payment_method_types: ['bacs_debit'], metadata: metadata || {} };
      si.client_secret = `${si.id}_secret_standin`;
      s.setups.set(si.id, si);
      return structuredClone(si);
    },
    /** The client confirms the Direct Debit on the portal's page (the stand-in's own button). */
    confirmSetup: (siId) => {
      const si = s.setups.get(siId);
      si.status = 'succeeded';
      const pm = id('pm');
      si.payment_method = pm;
      s.bacs.set(si.customer, pm);
      return structuredClone(si);
    },
    bacsMethod: async (customer) => s.bacs.get(customer) || null,
    fundingInstructions: async (customer) => {
      if (!s.customers.has(customer)) throw Object.assign(new Error('No such customer.'), { code: 'resource_missing' });
      const n = [...s.customers.keys()].indexOf(customer) + 1;
      // Invented and never real: Stripe's test sort code, and an account number from the customer's place in the list.
      return { accountName: 'The Clarity Project LTD', sortCode: '10-88-00', accountNumber: String(10000000 + n).slice(-8) };
    },
    /** A bank transfer arriving: the customer's oldest open bank-transfer invoices it covers are settled, as Stripe's reconciliation does. */
    fundCashBalance: async (customer, amount) => {
      let left = Number(amount) || 0;
      for (const inv of s.invoices.values()) {
        if (inv.customer !== customer || inv.status !== 'open' || !inv.payment_settings?.payment_method_types?.includes('customer_balance')) continue;
        if (left < inv.amount_due) break;
        left -= inv.amount_due;
        inv.status = 'paid'; inv.amount_paid = inv.amount_due; inv.status_transitions = { paid_at: t() };
        emit('invoice.paid', inv);
      }
      return { object: 'customer_cash_balance_transaction', customer, amount, remaining: left };
    },
    /** The client settles the first payment in the Payment Element (the stand-in's own card). */
    payIntent: (piId) => {
      const pi = s.intents.get(piId);
      pi.status = 'succeeded';
      const inv = s.invoices.get(pi.invoice);
      inv.status = 'paid'; inv.amount_paid = inv.amount_due; inv.status_transitions = { paid_at: t() };
      return emit('invoice.paid', inv);
    },
    /** The client settles it on Stripe's page (the stand-in's own button). */
    settle: (invId) => {
      const inv = s.invoices.get(invId);
      inv.status = 'paid'; inv.amount_paid = inv.amount_due; inv.status_transitions = { paid_at: t() };
      return emit('invoice.paid', inv);
    },
    email: async (invId) => {
      const inv = s.invoices.get(invId);
      if (!inv || inv.status !== 'open') throw Object.assign(new Error('That invoice isn’t open.'), { code: 'invoice_not_open' });
      s.sent.push(inv.id);
      emit('invoice.sent', inv);
      return structuredClone(inv);
    },
    markPaidByHand: async (invId) => { const inv = s.invoices.get(invId); inv.status = 'paid'; inv.amount_paid = inv.amount_due; inv.paid_out_of_band = true; return structuredClone(emit('invoice.paid', inv).data.object); },
    void: async (invId) => { const inv = s.invoices.get(invId); inv.status = 'void'; emit('invoice.voided', inv); return structuredClone(inv); },
    refund: async ({ paymentIntent, amount }) => {
      const inv = [...s.invoices.values()].find((i) => i.payment_intent === paymentIntent);
      const re = { id: id('re'), amount, currency: inv?.currency || 'gbp', payment_intent: paymentIntent };
      s.refunds.push(re);
      const ch = { object: 'charge', id: id('ch'), invoice: inv?.id || null, currency: re.currency, refunds: { data: [re] } };
      s.charges.set(ch.id, ch);
      emit('charge.refunded', ch);
      return re;
    },
    creditNote: async ({ invoice, amount, memo }) => { const cn = { id: id('cn'), invoice, amount, memo }; s.creditNotes.push(cn); return cn; },
    /**
     * A settled payment's balance transaction, as Stripe's would read: pounds at a fixed invented rate (STAND_IN_RATES,
     * dollars or euros to the pound) and a fee of 1.5% + 20p. `state.balanceDown = true` makes Stripe unreachable.
     */
    balanceFor: async (ref) => {
      if (s.balanceDown) throw Object.assign(new Error('Stripe didn’t answer.'), { code: 'stripe_503' });
      const inv = [...s.invoices.values()].find((i) => i.payment_intent === ref && i.status === 'paid');
      if (!inv) return null;
      const rate = STAND_IN_RATES[String(inv.currency).toUpperCase()] || null;
      if (!rate) return null;
      const amount = Math.round(Number(inv.amount_paid) / rate);
      return { amount, fee: Math.round(amount * 0.015) + 20, currency: 'gbp' };
    },
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
