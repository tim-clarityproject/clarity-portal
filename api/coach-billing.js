// A coach's invoices (Phase 6b run 1, steps 4 to 6): drafting them in Stripe, sending, a payment made to the bank,
// refunds and credits, and the overdue reminders.
//
//   POST /api/coach-billing  { kind: 'draft', agreementId }            the agreement's invoices due by today, as drafts
//   POST /api/coach-billing  { kind: 'send', invoiceId }               the coach's Send: Stripe sends it, with its payment link
//   POST /api/coach-billing  { kind: 'paid_by_hand', invoiceId }       "Add a payment made to your bank" (marked Added by you)
//   POST /api/coach-billing  { kind: 'refund' | 'credit', invoiceId, amount, reason? }   confirmed on screen first
//   POST /api/coach-billing  { kind: 'send_reminder', reminderId }     the coach's Send on a drafted reminder
//
// Every ask is the coach's own (the sign-in is read as the caller, with the 6-digit code, 054), about their own
// invoices only: the owner reads associates' invoices but never sends, settles or refunds them. Nothing is ever sent by
// itself: a draft waits for Send, and so does a reminder. Stripe in test mode only in this run (src/lib/billing/stripe.js
// refuses a live key); with no key, every ask answers { ok: false, reason: 'not_connected' }. No late fees or interest.
//
// Environment variables (Vercel): STRIPE_SECRET_KEY (sk_test_…), SUPABASE_SERVICE_ROLE_KEY, the Supabase URL and anon key.
import { createClient } from '@supabase/supabase-js';
import { codeRefusal } from './_coachCode.js';
import { asCallerClient, canSend, emailFrom, sendEach, supabaseOf } from './_coachEmails.js';
import { maySend } from './_guestEmails.js';
import { invoiceReminderEmail } from '../src/lib/email/billingEmails.js';
import { dayKeyWords } from '../src/lib/time/index.js';
import { moneyWords } from '../src/lib/billing/money.js';
import { stripeApi, keyAllowed } from '../src/lib/billing/stripe.js';
import { dueToDraft, invoicesFor } from '../src/lib/billing/invoicePlan.js';
import { addDays, dayIn, isZone } from '../src/lib/time/index.js';
import { reminderDue, settleBy } from '../src/lib/billing/money.js';

export const config = { maxDuration: 60 };
const reply = (res, status, body) => { res.status(status).setHeader('Cache-Control', 'no-store'); res.json(body); };
const DIDNT_WORK = 'That didn’t work. Try again in a moment.';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KINDS = ['draft', 'send', 'paid_by_hand', 'refund', 'credit', 'send_reminder'];

export function askedFor(body) {
  const b = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  if (!KINDS.includes(b.kind)) return null;
  const idKey = b.kind === 'draft' ? 'agreementId' : b.kind === 'send_reminder' ? 'reminderId' : 'invoiceId';
  if (!UUID.test(String(b[idKey] || ''))) return null;
  const out = { kind: b.kind, id: String(b[idKey]).toLowerCase() };
  if (b.kind === 'refund' || b.kind === 'credit') {
    const amount = Number(b.amount);
    if (!Number.isInteger(amount) || amount <= 0 || amount > 100000000) return null;
    out.amount = amount;
    out.reason = typeof b.reason === 'string' ? b.reason.slice(0, 500) : null;
  }
  return out;
}

/**
 * The coach's own billing, with the server's key and Stripe. `coach` is the caller's own coach row; every invoice acted
 * on must be theirs. Shared by the handler, the nightly round and the tests (tests/performance/billing-path.test.mjs).
 */
export function billing({ server, stripe, coach, now = () => new Date() }) {
  const today = (zone) => dayIn(isZone(zone) ? zone : 'Europe/London', now());
  const mine = async (table, id) => {
    const { data } = await server.from(table).select('*').eq('id', id).maybeSingle();
    if (!data || data.coach_id !== coach.id) { const e = new Error('That isn’t yours.'); e.status = 403; throw e; }
    return data;
  };

  /** The payer of an agreement's invoices: the client, or the organisation's finance contact for a funded client. */
  async function payerOf(agreement, terms) {
    const { data: profile } = await server.from('client_profiles').select('id, name, email, time_zone, organisation_id').eq('id', agreement.profile_id).maybeSingle();
    if (!terms.fundedBy) return { name: profile?.name || '', email: profile?.email || '', zone: profile?.time_zone || null, profile };
    const { data: contacts } = await server.from('organisation_contacts').select('*').eq('organisation_id', profile?.organisation_id || agreement.organisation_id || '');
    const finance = (contacts || []).find((c) => /finance|invoice/i.test(`${c.role || ''} ${c.roles || ''}`)) || (contacts || [])[0] || null;
    return { name: finance?.name || terms.fundedBy, email: finance?.email || '', zone: profile?.time_zone || null, profile };
  }

  return {
    /** The agreement's invoices due by today that aren't drafted yet, drafted in Stripe and kept here; never sent. */
    async draft(agreementId) {
      const agreement = await mine('agreements', agreementId);
      if (agreement.status !== 'signed') return { drafted: 0 };
      const { data: version } = await server.from('agreement_versions').select('*').eq('agreement_id', agreement.id).eq('version', agreement.current_version).maybeSingle();
      if (!version || version.status !== 'signed') return { drafted: 0 };
      const terms = { ...version.terms, total_minor: version.total_minor ?? version.terms?.total_minor, currency: version.currency, fundedBy: version.funded_by };
      const payer = await payerOf(agreement, terms);
      const planned = invoicesFor(terms, { signedDay: dayIn(isZone(payer.zone) ? payer.zone : 'Europe/London', new Date(version.client_signed_at)) });
      const { data: have } = await server.from('invoices').select('instalment_n, status').eq('agreement_id', agreement.id).eq('kind', 'instalment');
      const due = dueToDraft(planned, (have || []).filter((i) => i.status !== 'void').map((i) => i.instalment_n), today(payer.zone));
      let drafted = 0;
      for (const p of due) {
        const { data: number } = await server.rpc('next_invoice_number');
        const idem = `agreement:${agreement.id}:instalment:${p.n}`;
        const customer = await stripe.customer({ name: payer.name, email: payer.email, metadata: { profile_id: agreement.profile_id } }, `${idem}:customer`);
        const inv = await stripe.draftInvoice({ customer: customer.id, currency: version.currency, daysUntilDue: p.termsDays, lines: p.lines, poNumber: p.poNumber,
          metadata: { portal_number: `CLARITY-${number}`, agreement_id: agreement.id, instalment: String(p.n) } }, idem);
        const { error } = await server.from('invoices').insert({
          coach_id: coach.id, agreement_id: agreement.id, profile_id: agreement.profile_id, organisation_id: payer.profile?.organisation_id || null,
          number, stripe_invoice_id: inv.id, kind: 'instalment', status: 'draft', currency: version.currency, lines: p.lines, total_minor: p.total,
          terms_days: p.termsDays, po_number: p.poNumber, settles_to: p.settlesTo, payer_name: payer.name, payer_email: payer.email, payer_zone: payer.zone, instalment_n: p.n,
        });
        // Asked twice at once: the database keeps one (one invoice for each instalment); the other draft is voided in Stripe.
        if (error) { await stripe.void(inv.id).catch(() => {}); continue; }
        drafted += 1;
      }
      return { drafted };
    },

    /** The coach's Send: Stripe finalises it and sends it with its payment link. */
    async send(invoiceId) {
      const inv = await mine('invoices', invoiceId);
      if (inv.status !== 'draft') return { status: inv.status };
      const sent = await stripe.send(inv.stripe_invoice_id);
      const issued = today(inv.payer_zone);
      await server.from('invoices').update({ status: 'sent', sent_at: now().toISOString(), issued_on: issued, due_on: addDays(issued, inv.terms_days),
        hosted_url: sent.hosted_invoice_url || null, updated_at: now().toISOString() }).eq('id', inv.id).eq('status', 'draft');
      return { status: 'sent' };
    },

    /** "Add a payment made to your bank": marked paid in Stripe (out of band) and here, Added by you. */
    async paidByHand(invoiceId) {
      const inv = await mine('invoices', invoiceId);
      if (inv.status === 'paid') return { status: 'paid' };
      if (inv.status !== 'sent') { const e = new Error('Only an invoice that has been sent can be settled.'); e.status = 409; throw e; }
      await stripe.markPaidByHand(inv.stripe_invoice_id);
      const at = now().toISOString();
      await server.from('payments').insert({ invoice_id: inv.id, coach_id: coach.id, amount_minor: inv.total_minor - inv.paid_minor, currency: inv.currency, added_by_coach: true, paid_at: at });
      await server.from('invoices').update({ status: 'paid', paid_at: at, paid_minor: inv.total_minor, updated_at: at }).eq('id', inv.id);
      await server.from('invoice_reminders').delete().eq('invoice_id', inv.id).is('sent_at', null);
      return { status: 'paid' };
    },

    /** A refund through Stripe, or a credit kept against future work, each with its credit note; never more than was settled. */
    async refundOrCredit(invoiceId, kind, amount, reason) {
      const inv = await mine('invoices', invoiceId);
      const { data: notes } = await server.from('credit_notes').select('amount_minor').eq('invoice_id', inv.id);
      const left = inv.paid_minor - (notes || []).reduce((n, c) => n + Number(c.amount_minor), 0);
      if (inv.status !== 'paid' || amount > left) { const e = new Error('That’s more than was settled on this invoice.'); e.status = 409; throw e; }
      const idem = `${kind}:${inv.id}:${amount}:${(notes || []).length}`;
      let stripeId = null;
      if (kind === 'refund') {
        const { data: pay } = await server.from('payments').select('stripe_id, added_by_coach').eq('invoice_id', inv.id).order('paid_at').limit(1).maybeSingle();
        if (!pay?.stripe_id || pay.added_by_coach) { const e = new Error('This was settled to your bank, so refund it from there and add it as a credit.'); e.status = 409; throw e; }
        stripeId = (await stripe.refund({ paymentIntent: pay.stripe_id, amount }, idem)).id;
      } else {
        stripeId = (await stripe.creditNote({ invoice: inv.stripe_invoice_id, amount, memo: reason || 'Credit' }, idem)).id;
      }
      const { data: note } = await server.from('credit_notes').upsert({ invoice_id: inv.id, coach_id: coach.id, kind, amount_minor: amount, currency: inv.currency, stripe_id: stripeId, reason },
        { onConflict: 'stripe_id', ignoreDuplicates: true }).select('number').maybeSingle();
      return { kind, number: note?.number || null };
    },

    /** The nightly round's part for this coach: reminders due at 3, 7 and 14 days, drafted once each, never sent. */
    async draftReminders() {
      const { data: invs } = await server.from('invoices').select('*').eq('coach_id', coach.id).eq('status', 'sent');
      const { data: pauses } = await server.from('invoice_reminder_pauses').select('*').eq('coach_id', coach.id);
      let drafted = 0;
      for (const inv of invs || []) {
        const paused = (pauses || []).some((p) => (p.profile_id && p.profile_id === inv.profile_id) || (p.organisation_id && p.organisation_id === inv.organisation_id));
        const { data: done } = await server.from('invoice_reminders').select('stage').eq('invoice_id', inv.id);
        const stage = reminderDue({ dueKey: inv.due_on, now: now(), zone: inv.payer_zone, drafted: (done || []).map((d) => d.stage), paused });
        if (!stage) continue;
        const { error } = await server.from('invoice_reminders').insert({ invoice_id: inv.id, coach_id: coach.id, stage });
        if (!error) drafted += 1;
      }
      return { drafted };
    },

    /** The coach's Send on a reminder: the settle-by day is worked out now (7 days after it goes) for the 14-day one. */
    async reminderToSend(reminderId) {
      const rem = await mine('invoice_reminders', reminderId);
      if (rem.sent_at) return { already: true };
      const inv = await mine('invoices', rem.invoice_id);
      if (inv.status !== 'sent') return { settled: true };
      const at = now();
      const by = rem.stage === 14 ? settleBy(at, inv.payer_zone) : null;
      const { data: claimed } = await server.from('invoice_reminders').update({ sent_at: at.toISOString(), settle_by: by?.day || null })
        .eq('id', rem.id).is('sent_at', null).select('id');
      if (!claimed?.length) return { already: true };
      return { reminder: rem, invoice: inv, settleBy: by };
    },
  };
}

/** The reminder email, from the coach, in the shared template, to whoever settles the invoice, with Stripe's own link. */
export async function sendReminder(env, server, coach, { reminder, invoice, settleBy: by }) {
  if (!invoice.payer_email || !/^https:\/\//.test(invoice.hosted_url || '')) return 0;
  const { data: me } = await server.from('coaches').select('display_first_name').eq('id', coach.id).maybeSingle();
  let coachee = null;
  if (invoice.settles_to === 'organisation' && invoice.profile_id) {
    const { data: p } = await server.from('client_profiles').select('name').eq('id', invoice.profile_id).maybeSingle();
    coachee = p?.name || null;
  }
  const doc = invoiceReminderEmail({
    stage: reminder.stage, firstName: String(invoice.payer_name || '').split(/\s+/)[0] || '', number: `CLARITY-${invoice.number}`,
    amountWords: moneyWords(invoice.total_minor - invoice.paid_minor, invoice.currency), dueDayWords: dayKeyWords(invoice.due_on),
    settleByWords: by?.words || null, coachFirst: me?.display_first_name || '', settleLink: invoice.hosted_url, coachee, poNumber: invoice.po_number,
  });
  return sendEach(env, [{ email: invoice.payer_email }], () => emailFrom(doc));
}

export default async function handler(req, res, env = process.env) {
  if (req.method !== 'POST') return reply(res, 405, { ok: false, message: DIDNT_WORK });
  const asked = askedFor(req.body);
  if (!asked) return reply(res, 400, { ok: false, message: DIDNT_WORK });
  const { url, anon } = supabaseOf(env);
  const token = String(req.headers?.authorization || '').replace(/^Bearer\s+/i, '');
  if (!url || !anon || !token) return reply(res, 401, { ok: false, message: 'Sign in again to carry on.' });
  const noCode = codeRefusal(token, { ok: false });
  if (noCode) return reply(res, noCode.status, noCode.body);
  if (!keyAllowed(env.STRIPE_SECRET_KEY || '') || !env.SUPABASE_SERVICE_ROLE_KEY) return reply(res, 200, { ok: false, reason: 'not_connected' });
  const asCaller = asCallerClient(env, token);
  const { data: who, error: whoError } = await asCaller.auth.getUser(token);
  if (whoError || !who?.user?.id) return reply(res, 401, { ok: false, message: 'Sign in again to carry on.' });
  const { data: coach } = await asCaller.from('coaches').select('id, role, active, user_id').eq('user_id', who.user.id).maybeSingle();
  if (!coach?.active) return reply(res, 403, { ok: false, message: 'Only a coach can do that.' });
  const server = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const b = billing({ server, stripe: stripeApi(env.STRIPE_SECRET_KEY), coach });
  try {
    if (asked.kind === 'draft') return reply(res, 200, { ok: true, ...(await b.draft(asked.id)) });
    if (asked.kind === 'send') return reply(res, 200, { ok: true, ...(await b.send(asked.id)) });
    if (asked.kind === 'paid_by_hand') return reply(res, 200, { ok: true, ...(await b.paidByHand(asked.id)) });
    if (asked.kind === 'refund' || asked.kind === 'credit') return reply(res, 200, { ok: true, ...(await b.refundOrCredit(asked.id, asked.kind, asked.amount, asked.reason)) });
    // Only the live site ever sends: a preview claims nothing, so a reminder pressed there is still waiting on the live site.
    if (!maySend(env) || !canSend(env)) return reply(res, 200, { ok: false, reason: 'preview' });
    const r = await b.reminderToSend(asked.id);
    if (r.reminder) await sendReminder(env, server, coach, r);
    return reply(res, 200, { ok: true, sent: Boolean(r.reminder), already: Boolean(r.already), settled: Boolean(r.settled) });
  } catch (e) {
    return reply(res, e?.status || 502, { ok: false, message: e?.status ? e.message : DIDNT_WORK });
  }
}
