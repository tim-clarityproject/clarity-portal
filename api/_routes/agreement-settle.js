// /api/agreement-settle (Phase 6b run 3, brief item 8; M28 s-c-pay): a self-funded client settles their first payment
// straight after signing, in Stripe's Payment Element, by card or Apple Pay only (Apple Pay rides on card), with no
// "settle later" on that step; then, where something is left to settle in pounds, a Bacs Direct Debit is set up for the
// rest (it takes days to set up, so never for the first payment).
//
//   POST { kind: 'start', versionId }   the first invoice: made once, numbered (064's one CLARITY- run), finalised by
//                                       Stripe without Stripe's own email, linked to the signed version (065's
//                                       invoices.version_id); answers its payment's secret for the Payment Element
//   POST { kind: 'bacs', versionId }    a Bacs Direct Debit set up for the rest (pounds only): its setup's secret
//   POST { kind: 'state', versionId }   whether the first payment is settled (read fresh from Stripe while it's open)
//   POST { kind: 'invoice_pdf', invoiceId }        one of the client's own invoices as a PDF (the shared template, light)
//   POST { kind: 'credit_notes' }                  the client's own credit notes (M28 s-payments' CN- rows)
//   POST { kind: 'credit_note_pdf', creditNoteId } one of them as a PDF
//   (the last three for My Account, Invoices: Group C's request 6; asked as the caller through my_invoices(), so only the
//   client's own, and never anything an organisation settles)
//
// The client's own sign-in: the version must be theirs, signed, and self-funded, read AS THE CALLER through
// my_agreements() (the database decides). The server's key then writes the invoice (invoices are the server's, 061)
// and Stripe is asked with a test key only. Shapes: src/lib/agreements/asks.js ASKS.settle.
//
// Environment variables (Vercel): STRIPE_SECRET_KEY (sk_test_…), STRIPE_PUBLISHABLE_KEY (pk_test_…, handed to the page),
// SUPABASE_SERVICE_ROLE_KEY, the Supabase URL and anon key.
import { createClient } from '@supabase/supabase-js';
import { asCallerClient, supabaseOf } from '../_coachEmails.js';
import { dayIn, isZone, addDays } from '../../src/lib/time/index.js';
import { keyAllowed, stripeApi } from '../../src/lib/billing/stripe.js';
import { invoiceChange } from '../../src/lib/billing/stripeWebhook.js';
import { firstPayment, hasRest, schedule } from '../../src/lib/agreements/settling.js';
import { selfFunded } from '../../src/lib/agreements/terms.js';

export const config = { maxDuration: 30 };
const reply = (res, status, body) => { res.status(status).setHeader('Cache-Control', 'no-store'); res.json(body); };
const DIDNT_WORK = 'That didn’t work. Try again in a moment.';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FIRST_KINDS = ['first_payment', 'deposit', 'instalment'];

/** The ask: { kind, versionId } or null. */
export function askedFor(body) {
  const b = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  if (b.kind === 'credit_notes') return { kind: b.kind };
  if (b.kind === 'invoice_pdf') return UUID.test(String(b.invoiceId || '')) ? { kind: b.kind, invoiceId: String(b.invoiceId).toLowerCase() } : null;
  if (b.kind === 'credit_note_pdf') return UUID.test(String(b.creditNoteId || '')) ? { kind: b.kind, creditNoteId: String(b.creditNoteId).toLowerCase() } : null;
  if (!['start', 'bacs', 'state'].includes(b.kind) || !UUID.test(String(b.versionId || ''))) return null;
  return { kind: b.kind, versionId: String(b.versionId).toLowerCase() };
}

/** The client's own invoices' ids, as the caller reads them (my_invoices(): theirs, settled by them, sent or paid). */
export async function myInvoiceIds(asCaller) {
  const { data, error } = await asCaller.rpc('my_invoices');
  if (error) throw error;
  return new Set((Array.isArray(data) ? data : []).map((i) => i.id));
}

/** My Account, Invoices: an invoice's PDF, the credit notes and theirs, for the client's own invoices only. */
export function clientMoneyApi({ server }) {
  const { invoiceDoc, creditDoc } = {
    invoiceDoc: (i, p) => ({ number: i.number, issuedOn: i.issued_on || String(i.sent_at || i.created_at).slice(0, 10), dueOn: i.due_on || i.issued_on,
      termsDays: i.terms_days || 14, orgName: p?.name || i.payer_name || '', lines: (i.lines || []).map((l) => ({ description: l.description, amount: l.amount })),
      currency: i.currency || 'GBP', bank: null, timesheet: null }),
    creditDoc: (c, i, p) => ({ number: c.number, issuedOn: String(c.created_at).slice(0, 10), payerName: p?.name || i?.payer_name || '',
      invoiceNumber: i?.number ? `CLARITY-${i.number}` : null, amountMinor: Number(c.amount_minor), currency: c.currency || i?.currency || 'GBP', kind: c.kind, reason: c.reason }),
  };
  const profileOf = async (id) => (id ? (await server.from('client_profiles').select('name, time_zone').eq('id', id).maybeSingle()).data : null);
  return {
    async invoicePdf(ids, invoiceId) {
      if (!ids.has(invoiceId)) throw calm(403, 'That invoice isn’t yours.');
      const { data: i } = await server.from('invoices').select('*').eq('id', invoiceId).maybeSingle();
      if (!i?.number) throw calm(409, 'That invoice isn’t ready yet.');
      const p = await profileOf(i.profile_id);
      const { pdfFrom } = await import('../_agreementPdf.js');
      const { invoicePdf } = await import('../../src/lib/pdf/docs/invoice.js');
      const made = await pdfFrom(invoicePdf(invoiceDoc(i, p)), p?.time_zone || 'Europe/London');
      return { pdf: Buffer.from(made.bytes).toString('base64'), fileName: made.fileName };
    },
    async creditNotes(ids) {
      if (!ids.size) return { creditNotes: [] };
      const { data } = await server.from('credit_notes').select('id, number, invoice_id, amount_minor, currency, kind, created_at').in('invoice_id', [...ids]);
      const { data: invs } = await server.from('invoices').select('id, number').in('id', [...ids]);
      const num = new Map((invs || []).map((i) => [i.id, i.number]));
      return { creditNotes: (data || []).filter((c) => c.number).map((c) => ({ id: c.id, number: c.number, invoiceId: c.invoice_id,
        invoiceNumber: num.get(c.invoice_id) ? `CLARITY-${num.get(c.invoice_id)}` : null, amountMinor: Number(c.amount_minor), currency: c.currency, kind: c.kind, createdAt: c.created_at })) };
    },
    async creditNotePdf(ids, creditNoteId) {
      const { data: c } = await server.from('credit_notes').select('*').eq('id', creditNoteId).maybeSingle();
      if (!c || !ids.has(c.invoice_id)) throw calm(403, 'That credit note isn’t yours.');
      const { data: i } = await server.from('invoices').select('*').eq('id', c.invoice_id).maybeSingle();
      const p = await profileOf(i?.profile_id);
      const { creditNoteFile } = await import('../_agreementPdf.js');
      const made = await creditNoteFile(creditDoc(c, i, p), p?.time_zone || 'Europe/London');
      return { pdf: Buffer.from(made.bytes).toString('base64'), fileName: made.fileName };
    },
  };
}

const calm = (status, message) => Object.assign(new Error(message), { status, calm: true });

/** The publishable key handed to the page: a test key only, or none (the page then uses its stand-in off live). */
export const publishableKey = (env) => (/^pk_test_[A-Za-z0-9]{10,}$/.test(env.STRIPE_PUBLISHABLE_KEY || '') ? env.STRIPE_PUBLISHABLE_KEY : null);

/**
 * The settle step for one client. `mine` is the version as the client reads it (my_agreements() shape, checked as
 * the caller); `server` writes the invoice; `stripe` is the real API or the stand-in.
 */
export function settleApi({ server, stripe, now = () => new Date(), env = {} }) {
  const iso = () => now().toISOString();

  async function context(mine) {
    if (!mine || mine.status !== 'signed' || !mine.client_signed_at) throw calm(409, 'Sign your agreement first, then settle.');
    if (mine.funded_by) throw calm(409, 'Your organisation is invoiced for your coaching, so there’s nothing for you to settle.');
    const { data: v } = await server.from('agreement_versions').select('*').eq('id', mine.id).maybeSingle();
    const { data: a } = v ? await server.from('agreements').select('*').eq('id', v.agreement_id).maybeSingle() : { data: null };
    if (!v || !a) throw calm(403, 'That agreement isn’t yours.');
    const { data: p } = await server.from('client_profiles').select('id, name, email, time_zone').eq('id', a.profile_id).maybeSingle();
    const terms = { ...(v.terms || {}), fundedBy: v.funded_by };
    const choice = v.settle_choice || 'upfront';
    const zone = isZone(p?.time_zone) ? p.time_zone : 'Europe/London';
    return { v, a, p, terms, choice, zone, currency: v.currency || terms.currency || 'GBP' };
  }

  const firstOf = async (versionId) => {
    const { data } = await server.from('invoices').select('*').eq('version_id', versionId).eq('instalment_n', 1);
    return (data || []).filter((i) => FIRST_KINDS.includes(i.kind) && i.status !== 'void').sort((x, y) => String(x.created_at).localeCompare(String(y.created_at)))[0] || null;
  };

  /** Stripe's invoice for a row, and its payment's secret. */
  async function secretOf(row) {
    const inv = await stripe.retrieve('invoice', row.stripe_invoice_id);
    const piId = typeof inv.payment_intent === 'string' ? inv.payment_intent : inv.payment_intent?.id;
    if (!piId) return { inv, secret: null };
    const pi = await stripe.paymentIntent(piId);
    return { inv, secret: pi?.client_secret || null, pi };
  }

  /** The invoice paid in Stripe but not here yet: kept as the webhook would (it moves only forward; one payment). */
  async function catchUp(row, inv) {
    if (inv?.status !== 'paid' || row.status === 'paid') return row.status === 'paid' || inv?.status === 'paid';
    const change = invoiceChange({ type: 'invoice.paid', created: Math.floor(now().getTime() / 1000), data: { object: inv } }, row);
    if (change.payment) await server.from('payments').upsert(change.payment, { onConflict: 'stripe_id', ignoreDuplicates: true });
    if (change.invoice) await server.from('invoices').update({ ...change.invoice, updated_at: iso() }).eq('id', row.id);
    return true;
  }

  return {
    /** The first invoice (made once) and its payment's secret for the Payment Element. */
    async start(mine) {
      const ctx = await context(mine);
      const amount = firstPayment(ctx.terms, ctx.choice, ctx.terms.extrasChosen || []);
      if (!(amount > 0)) throw calm(409, 'There’s nothing to settle now.');
      let row = await firstOf(ctx.v.id);
      if (row?.status === 'paid') return { clientSecret: null, invoiceId: row.id, amountMinor: Number(row.total_minor), currency: row.currency, settled: true };
      if (!row) {
        const signedDay = dayIn(ctx.zone, new Date(ctx.v.client_signed_at));
        const plan = schedule(ctx.terms, { signedDay, choice: ctx.choice, chosen: ctx.terms.extrasChosen || [] })[0];
        const kind = plan?.kind === 'deposit' ? 'deposit' : plan?.kind === 'instalment' ? 'instalment' : 'first_payment';
        const what = String(ctx.terms.coaching || ctx.terms.work || ctx.terms.hours?.work || 'Coaching').slice(0, 160);
        const lines = [{ description: plan && plan.of > 1 ? `${what}, ${kind === 'deposit' ? 'deposit' : `instalment 1 of ${plan.of}`}` : what, amount }];
        const ins = await server.from('invoices').insert({
          coach_id: ctx.v.coach_id, agreement_id: ctx.a.id, profile_id: ctx.a.profile_id, version_id: ctx.v.id, kind, status: 'draft', currency: ctx.currency,
          lines, total_minor: amount, terms_days: 1, instalment_n: 1, settles_to: 'client', payer_name: ctx.p?.name || '', payer_email: ctx.p?.email || null, payer_zone: ctx.zone,
        }).select('*');
        // Pressed twice, or two tabs: the database keeps one first invoice (one per instalment); the other reads it.
        row = ins.error ? await firstOf(ctx.v.id) : ins.data?.[0];
        if (!row) throw calm(409, DIDNT_WORK);
      }
      if (!row.stripe_invoice_id) {
        // Claimed for this press (064's send_claimed_at), so two presses never make two Stripe invoices.
        const claimedAt = iso();
        const claim = await server.from('invoices').update({ send_claimed_at: claimedAt }).eq('id', row.id).is('stripe_invoice_id', null)
          .or(`send_claimed_at.is.null,send_claimed_at.lt.${new Date(now().getTime() - 120000).toISOString()}`).select('id');
        if (!claim.error && !claim.data?.length) throw calm(409, 'Your invoice is being prepared. Try again in a moment.');
        try {
          const { data: before } = await server.from('invoices').select('stripe_customer_id').eq('agreement_id', ctx.a.id);
          const known = (before || []).find((i) => i.stripe_customer_id)?.stripe_customer_id;
          const customer = known ? { id: known } : await stripe.customer({ name: ctx.p?.name || '', email: ctx.p?.email || undefined, metadata: { profile_id: ctx.a.profile_id } }, `first:${row.id}:customer`);
          const draft = await stripe.draftInvoice({ customer: customer.id, currency: ctx.currency, daysUntilDue: 1, lines: row.lines, methods: ['card'],
            metadata: { agreement_id: ctx.a.id, version_id: ctx.v.id, instalment: '1', kind: row.kind } }, `first:${row.id}`);
          const kept = await server.from('invoices').update({ stripe_invoice_id: draft.id, stripe_customer_id: customer.id }).eq('id', row.id);
          if (kept.error) { await stripe.void(draft.id).catch(() => {}); throw kept.error; }
          row = { ...row, stripe_invoice_id: draft.id, stripe_customer_id: customer.id };
          const { data: number, error } = await server.rpc('invoice_take_number', { p_invoice: row.id });
          if (error || !Number.isInteger(number)) throw new Error('number');
          await stripe.number(draft.id, `CLARITY-${number}`);
          const fin = await stripe.finalize(draft.id);
          const issued = dayIn(ctx.zone, now());
          await server.from('invoices').update({ status: 'sent', number, sent_at: iso(), issued_on: issued, due_on: addDays(issued, 1),
            hosted_url: fin?.hosted_invoice_url || null, updated_at: iso() }).eq('id', row.id).eq('status', 'draft');
        } finally {
          if (!claim.error) await server.from('invoices').update({ send_claimed_at: null }).eq('id', row.id).eq('send_claimed_at', claimedAt);
        }
      }
      const { inv, secret } = await secretOf(row);
      if (await catchUp(row, inv)) return { clientSecret: null, invoiceId: row.id, amountMinor: Number(row.total_minor), currency: row.currency, settled: true };
      if (!secret) throw calm(502, DIDNT_WORK);
      return { clientSecret: secret, invoiceId: row.id, amountMinor: Number(row.total_minor), currency: row.currency, publishableKey: publishableKey(env) };
    },

    /** A Bacs Direct Debit for the rest, in pounds only, once the first payment's customer exists. */
    async bacs(mine) {
      const ctx = await context(mine);
      if (ctx.currency !== 'GBP') throw calm(409, 'Direct Debit is for agreements in pounds.');
      if (!hasRest(ctx.terms, ctx.choice, ctx.terms.extrasChosen || [])) throw calm(409, 'There’s nothing more to settle.');
      const row = await firstOf(ctx.v.id);
      if (!row?.stripe_customer_id) throw calm(409, 'Settle the first payment first.');
      const si = await stripe.setupIntent({ customer: row.stripe_customer_id, metadata: { agreement_id: ctx.a.id, version_id: ctx.v.id } }, `bacs:${ctx.v.id}:${Math.floor(now().getTime() / 600000)}`);
      return { clientSecret: si.client_secret };
    },

    /** Whether the first payment is settled. */
    async state(mine) {
      const ctx = await context(mine);
      const row = await firstOf(ctx.v.id);
      if (!row) return { settled: false, amountMinor: firstPayment(ctx.terms, ctx.choice, ctx.terms.extrasChosen || []), currency: ctx.currency };
      let settled = row.status === 'paid';
      if (!settled && row.stripe_invoice_id && row.status === 'sent') {
        const inv = await stripe.retrieve('invoice', row.stripe_invoice_id).catch(() => null);
        settled = await catchUp(row, inv);
      }
      return { settled, amountMinor: Number(row.total_minor), currency: row.currency };
    },
  };
}

/** The version as the caller reads it (my_agreements(): their own, the database decides), or null. */
export async function myVersion(asCaller, versionId) {
  const { data, error } = await asCaller.rpc('my_agreements');
  if (error) throw error;
  return (Array.isArray(data) ? data : []).find((v) => v.id === versionId) || null;
}

export default async function handler(req, res, env = process.env) {
  if (req.method !== 'POST') return reply(res, 405, { ok: false, message: DIDNT_WORK });
  const asked = askedFor(req.body);
  if (!asked) return reply(res, 400, { ok: false, message: DIDNT_WORK });
  const { url, anon } = supabaseOf(env);
  const token = String(req.headers?.authorization || '').replace(/^Bearer\s+/i, '');
  if (!url || !anon || !token) return reply(res, 401, { ok: false, message: 'Sign in again to carry on.' });
  const money = ['invoice_pdf', 'credit_notes', 'credit_note_pdf'].includes(asked.kind);
  if (!env.SUPABASE_SERVICE_ROLE_KEY || (!money && !keyAllowed(env.STRIPE_SECRET_KEY || ''))) return reply(res, 200, { ok: false, reason: 'not_connected' });
  try {
    if (money) {
      const ids = await myInvoiceIds(asCallerClient(env, token));
      const m = clientMoneyApi({ server: createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } }) });
      const out = asked.kind === 'invoice_pdf' ? await m.invoicePdf(ids, asked.invoiceId) : asked.kind === 'credit_notes' ? await m.creditNotes(ids) : await m.creditNotePdf(ids, asked.creditNoteId);
      return reply(res, 200, { ok: true, ...out });
    }
    const mine = await myVersion(asCallerClient(env, token), asked.versionId);
    if (!mine) return reply(res, 403, { ok: false, message: 'That agreement isn’t yours.' });
    if (mine.funded_by == null && !selfFunded(mine.terms || {})) return reply(res, 409, { ok: false, calm: true, message: 'There’s nothing for you to settle.' });
    const server = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const api = settleApi({ server, stripe: stripeApi(env.STRIPE_SECRET_KEY), env });
    const out = await api[asked.kind](mine);
    return reply(res, 200, { ok: true, ...out });
  } catch (e) {
    if (e?.calm) return reply(res, e.status || 409, { ok: false, calm: true, message: e.message });
    if (e?.code === 'PGRST301' || /jwt/i.test(String(e?.message || ''))) return reply(res, 401, { ok: false, message: 'Sign in again to carry on.' });
    return reply(res, 502, { ok: false, message: DIDNT_WORK });
  }
}
