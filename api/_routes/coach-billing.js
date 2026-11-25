// A coach's invoices (Phase 6b run 1, steps 4 to 6): drafting them in Stripe, sending, a payment made to the bank,
// refunds and credits, and the overdue reminders.
//
//   POST /api/coach-billing  { kind: 'draft', agreementId }            the agreement's invoices due by today, as drafts
//   POST /api/coach-billing  { kind: 'send', invoiceId }               the coach's Send: Stripe sends it, with its payment link
//   POST /api/coach-billing  { kind: 'paid_by_hand', invoiceId, landedMinor? }   "Add a payment made to your bank" (marked Added by you);
//                            landedMinor: what landed in pounds (pence), needed when the invoice isn't in pounds
//   POST /api/coach-billing  { kind: 'refund' | 'credit', invoiceId, amount, reason? }   confirmed on screen first
//   POST /api/coach-billing  { kind: 'send_reminder', reminderId }     the coach's Send on a drafted reminder
//
// Every ask is the coach's own (the sign-in is read as the caller, with the 6-digit code, 054), about their own
// invoices only: the owner reads associates' invoices but never sends, settles or refunds them. Nothing is ever sent by
// itself: a draft waits for Send, and so does a reminder. Stripe in test mode only in this run (src/lib/billing/stripe.js
// refuses a live key); with no key, every ask answers { ok: false, reason: 'not_connected' }. No late fees or interest.
//
// Environment variables (Vercel): STRIPE_SECRET_KEY (sk_test_…), SUPABASE_SERVICE_ROLE_KEY, the Supabase URL and anon key.
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { codeRefusal } from '../_coachCode.js';
import { asCallerClient, canSend, emailFrom, sendOutcome, supabaseOf } from '../_coachEmails.js';
import { maySend } from '../_guestEmails.js';
import { invoiceReminderEmail } from '../../src/lib/email/billingEmails.js';
import { dayKeyWords } from '../../src/lib/time/index.js';
import { moneyWords } from '../../src/lib/billing/money.js';
import { stripeApi, keyAllowed } from '../../src/lib/billing/stripe.js';
import { dueToDraft, invoicesFor } from '../../src/lib/billing/invoicePlan.js';
import { addDays, dayIn, isZone } from '../../src/lib/time/index.js';
import { reminderDue, settleBy } from '../../src/lib/billing/money.js';
import { currencyOf } from '../../src/lib/billing/stripeWebhook.js';
import { cleanName } from '../../src/lib/coaching/agreementRules.js';

export const config = { maxDuration: 60 };
const reply = (res, status, body) => { res.status(status).setHeader('Cache-Control', 'no-store'); res.json(body); };
const DIDNT_WORK = 'That didn’t work. Try again in a moment.';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KINDS = ['draft', 'send', 'paid_by_hand', 'refund', 'credit', 'send_reminder', 'bank_payment', 'one_off'];
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const RECEIPT = /^[0-9a-f-]{36}\/finances\/[a-z_]{1,20}\/[0-9a-f-]{36}-[A-Za-z0-9_.-]{1,120}$/;
const SECTOR = (s) => (typeof s === 'string' && s.trim().length >= 1 && s.trim().length <= 40 ? s.trim() : null);

/** Whether a 'YYYY-MM-DD' is a real calendar day (never 31 Feb). */
export function realDay(day) {
  if (!DAY.test(String(day || ''))) return false;
  const [y, m, d] = String(day).split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

/** A whole number of pence sent as a JSON number, 1 to 100,000,000; never true, an array, "0x10" or "1e3". */
export const strictMinor = (v) => (typeof v === 'number' && Number.isInteger(v) && v > 0 && v <= 100000000 ? v : null);

export function askedFor(body, now = new Date()) {
  const b = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  if (!KINDS.includes(b.kind)) return null;
  // Finances (run 2, owner only): a payment made straight to the bank, and a one-off invoice. Each names who it's from
  // or for: a client, an organisation, or (a bank payment only) a name typed in.
  if (b.kind === 'bank_payment' || b.kind === 'one_off') {
    const amount = strictMinor(b.amount);
    if (amount == null) return null;
    const profileId = UUID.test(String(b.profileId || '')) ? String(b.profileId).toLowerCase() : null;
    const organisationId = UUID.test(String(b.organisationId || '')) ? String(b.organisationId).toLowerCase() : null;
    // A name of only invisible characters (zero-width, direction marks) is no name (agreementRules' cleanName).
    const payerName = typeof b.payerName === 'string' && cleanName(b.payerName) ? cleanName(b.payerName).slice(0, 160) : null;
    if (!profileId && !organisationId && !(b.kind === 'bank_payment' && payerName)) return null;
    const whatFor = typeof b.whatFor === 'string' ? b.whatFor.trim().slice(0, 200) : '';
    if (b.kind === 'bank_payment') {
      // A real calendar day, and never after tomorrow on Tim's clock (London): money can't arrive in the future.
      // Never before 2000 either (062 keeps days between 2000 and 2100).
      if (!realDay(b.arrivedOn) || String(b.arrivedOn) < '2000-01-01' || String(b.arrivedOn) > addDays(dayIn('Europe/London', now), 1)) return null;
      // 062's shape for a receipt (uploadReceipt's): <account>/finances/<kind>/<uuid>-<name>, never climbing out.
      const receipt = typeof b.receiptPath === 'string' && RECEIPT.test(b.receiptPath) && !b.receiptPath.includes('..') ? b.receiptPath : null;
      return { kind: b.kind, amount, profileId, organisationId, payerName, whatFor: whatFor || null, arrivedOn: String(b.arrivedOn), sector: SECTOR(b.sector), receiptPath: receipt };
    }
    if (!whatFor) return null;
    const currency = ['GBP', 'USD', 'EUR'].includes(b.currency) ? b.currency : null;
    const due = ['in_14', 'in_30', 'on_receipt'].includes(b.due) ? b.due : null;
    if (!currency || !due) return null;
    return { kind: b.kind, amount, profileId, organisationId, whatFor, currency, due, sector: SECTOR(b.sector), send: b.send === true };
  }
  const idKey = b.kind === 'draft' ? 'agreementId' : b.kind === 'send_reminder' ? 'reminderId' : 'invoiceId';
  if (!UUID.test(String(b[idKey] || ''))) return null;
  const out = { kind: b.kind, id: String(b[idKey]).toLowerCase() };
  if (b.kind === 'send_reminder' && b.again === true) out.again = true;
  if (b.kind === 'paid_by_hand' && b.landedMinor != null && b.landedMinor !== '') {
    const landed = strictMinor(b.landedMinor);
    if (landed == null) return null;
    out.landedMinor = landed;
  }
  if (b.kind === 'refund' || b.kind === 'credit') {
    const amount = strictMinor(b.amount);
    if (amount == null) return null;
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

  const ownerOnly = () => { if (coach.role !== 'owner') { const e = new Error('Only the owner can do that.'); e.status = 403; throw e; } };

  // One answer for "doesn't exist" and "isn't yours", so nothing can be learnt by asking (break-it tester, 6b run 2).
  const notYours = (what) => { const e = new Error(`That ${what} isn’t yours.`); e.status = 403; return e; };
  /**
   * Whether an organisation is tied to the coach: one of their own clients works there, or one of their own leads,
   * agreements or (the owner's alone, 052) the account map's deals names it, or the owner set it up himself (026).
   */
  async function orgIsMine(orgId) {
    const has = async (q) => { const { data } = await q.limit(1); return Boolean(data?.length); };
    if (await has(server.from('client_profiles').select('id').eq('organisation_id', orgId).eq('coach_id', coach.id).is('merged_into', null))) return true;
    if (await has(server.from('coach_leads').select('id').eq('organisation_id', orgId).eq('coach_id', coach.id))) return true;
    if (await has(server.from('agreements').select('id').eq('organisation_id', orgId).eq('coach_id', coach.id))) return true;
    if (coach.role !== 'owner') return false;
    if (await has(server.from('organisation_deals').select('id').eq('organisation_id', orgId))) return true;
    // 026: only the owner sets an organisation up, so one he made is his.
    return Boolean(coach.user_id) && has(server.from('organisations').select('id').eq('id', orgId).eq('created_by', coach.user_id));
  }

  /** Who a one-off invoice or a bank payment is from: the coach's own client or an organisation, never anyone else's. */
  async function whoFor(asked) {
    if (asked.profileId) {
      const { data: p } = await server.from('client_profiles').select('id, coach_id, merged_into, name, email, time_zone, organisation_id, sector').eq('id', asked.profileId).maybeSingle();
      if (!p || p.coach_id !== coach.id || p.merged_into) throw notYours('client');
      return { profile: p, name: p.name, email: p.email, zone: p.time_zone, sector: p.sector, organisationId: p.organisation_id };
    }
    if (asked.organisationId) {
      // Checked before anything about it is read back.
      if (!(await orgIsMine(asked.organisationId))) throw notYours('organisation');
      const { data: o } = await server.from('organisations').select('id, name, sector').eq('id', asked.organisationId).maybeSingle();
      if (!o) throw notYours('organisation');
      const { data: contacts } = await server.from('organisation_contacts').select('*').eq('organisation_id', o.id);
      const finance = (contacts || []).find((c) => /finance|invoice/i.test(`${c.role || ''} ${c.roles || ''}`)) || (contacts || [])[0] || null;
      return { organisation: o, name: finance?.name || o.name, email: finance?.email || '', zone: null, sector: o.sector, organisationId: o.id };
    }
    return { name: asked.payerName, email: '', zone: null, sector: null, organisationId: null };
  }

  return {
    /** Add bank payment (owner): a payment made straight to the bank, counted on the day it arrived, marked Added by you. */
    async bankPayment(asked) {
      ownerOnly();
      const who = await whoFor(asked);
      // Noon in London on the day it arrived, so the day never moves whichever zone reads it.
      const paidAt = new Date(`${asked.arrivedOn}T12:00:00Z`).toISOString();
      const { data, error } = await server.from('payments').insert({
        coach_id: coach.id, amount_minor: asked.amount, currency: 'GBP', landed_gbp_minor: asked.amount, added_by_coach: true, paid_at: paidAt,
        profile_id: who.profile?.id || null, organisation_id: who.organisationId || null, payer_name: who.organisation?.name || who.profile?.name || asked.payerName,
        // A receipt only from the caller's own folder of coach-files (062 checks the shape; the folder is checked here).
        sector: asked.sector || who.sector || null, what_for: asked.whatFor,
        receipt_path: asked.receiptPath && coach.user_id && asked.receiptPath.startsWith(`${coach.user_id}/`) ? asked.receiptPath : null,
      }).select('id').maybeSingle();
      if (error) throw error;
      return { id: data?.id || null };
    },

    /** New invoice (owner): a one-off invoice in Stripe, saved as a draft or sent at once; due in 14 or 30 days or on receipt. */
    async oneOff(asked) {
      ownerOnly();
      const who = await whoFor(asked);
      const days = asked.due === 'in_14' ? 14 : asked.due === 'in_30' ? 30 : 0;
      // A fresh key for each press: a draft has no number until it is sent (follow-up 5, item 6), so a retry is a new request.
      const idem = `one_off:${coach.id}:${randomUUID()}`;
      const customer = await stripe.customer({ name: who.name, email: who.email, metadata: { profile_id: who.profile?.id || '', organisation_id: who.organisationId || '' } }, `${idem}:customer`);
      const lines = [{ description: asked.whatFor, amount: asked.amount }];
      const inv = await stripe.draftInvoice({ customer: customer.id, currency: asked.currency, daysUntilDue: Math.max(days, 1), lines,
        metadata: { kind: 'one_off' } }, idem);
      const { data: row, error } = await server.from('invoices').insert({
        coach_id: coach.id, profile_id: who.profile?.id || null, organisation_id: who.organisationId || null, stripe_invoice_id: inv.id,
        stripe_customer_id: customer.id, kind: 'one_off', status: 'draft', currency: asked.currency, lines, total_minor: asked.amount, terms_days: days,
        settles_to: who.organisation ? 'organisation' : 'client', payer_name: who.name, payer_email: who.email || null, payer_zone: who.zone || null,
        sector: asked.sector || who.sector || null,
      }).select('id').maybeSingle();
      if (error) { await stripe.void(inv.id).catch(() => {}); throw error; }
      if (!asked.send) return { id: row.id, number: null, status: 'draft' };
      const sent = await this.send(row.id);
      return { id: row.id, number: sent.number || null, status: 'sent' };
    },

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
      // One Stripe customer for the agreement's payer, reused by every instalment (a Bacs Direct Debit belongs to one).
      let known = null;
      const customerFor = async (ag, who, idem) => {
        if (known) return known;
        const { data: before } = await server.from('invoices').select('stripe_customer_id, payer_email').eq('agreement_id', ag.id);
        const same = (before || []).find((i) => i.stripe_customer_id && String(i.payer_email || '').toLowerCase() === String(who.email || '').toLowerCase());
        known = same ? { id: same.stripe_customer_id }
          : await stripe.customer({ name: who.name, email: who.email, metadata: { profile_id: ag.profile_id } }, `${idem}:customer`);
        return known;
      };
      for (const p of due) {
        // A fresh key each time: a retry after a failed save is a new request to Stripe, never Stripe's "same key, other
        // parameters" refusal (break-it tester, 6b run 1). The CLARITY- number waits for Send (follow-up 5, item 6).
        const idem = `agreement:${agreement.id}:instalment:${p.n}:${randomUUID()}`;
        const customer = await customerFor(agreement, payer, idem);
        const inv = await stripe.draftInvoice({ customer: customer.id, currency: version.currency, daysUntilDue: p.termsDays, lines: p.lines, poNumber: p.poNumber,
          metadata: { agreement_id: agreement.id, instalment: String(p.n) } }, idem);
        const { error } = await server.from('invoices').insert({
          coach_id: coach.id, agreement_id: agreement.id, profile_id: agreement.profile_id, organisation_id: payer.profile?.organisation_id || null,
          stripe_invoice_id: inv.id, stripe_customer_id: customer.id, kind: 'instalment', status: 'draft', currency: version.currency, lines: p.lines, total_minor: p.total,
          terms_days: p.termsDays, po_number: p.poNumber, settles_to: p.settlesTo, payer_name: payer.name, payer_email: payer.email, payer_zone: payer.zone, instalment_n: p.n,
        });
        // Asked twice at once: the database keeps one (one invoice for each instalment); the other draft is voided in Stripe.
        if (error) { await stripe.void(inv.id).catch(() => {}); continue; }
        drafted += 1;
      }
      return { drafted };
    },

    /**
     * The coach's Send: the invoice takes its CLARITY- number now (064's invoice_take_number, the same number again on a
     * retry), Stripe's draft is given it, then Stripe finalises it and sends it with its payment link. A draft that is
     * never sent never takes a number, so the numbers have no gaps (follow-up 5, item 6). An older draft that already has
     * a number keeps it.
     */
    async send(invoiceId) {
      const inv = await mine('invoices', invoiceId);
      if (inv.status !== 'draft') return { status: inv.status, number: inv.number ? `CLARITY-${inv.number}` : null };
      let number = inv.number;
      if (number == null) {
        let { data, error } = await server.rpc('invoice_take_number', { p_invoice: inv.id });
        // Before 064: 061's sequence, kept on the invoice before Stripe is asked, so a retry keeps the same number.
        if (error && (error.code === 'PGRST202' || error.code === '42883')) {
          ({ data, error } = await server.rpc('next_invoice_number'));
          if (!error && Number.isInteger(data)) ({ error } = await server.from('invoices').update({ number: data }).eq('id', inv.id).is('number', null));
        }
        if (error || !Number.isInteger(data)) { const e = new Error('That didn’t send. Try again in a moment.'); e.status = 502; throw e; }
        number = data;
      }
      await stripe.number(inv.stripe_invoice_id, `CLARITY-${number}`);
      const sent = await stripe.send(inv.stripe_invoice_id);
      const issued = today(inv.payer_zone);
      await server.from('invoices').update({ status: 'sent', sent_at: now().toISOString(), issued_on: issued, due_on: addDays(issued, inv.terms_days),
        hosted_url: sent.hosted_invoice_url || null, updated_at: now().toISOString() }).eq('id', inv.id).eq('status', 'draft');
      return { status: 'sent', number: `CLARITY-${number}` };
    },

    /**
     * "Add a payment made to your bank": marked paid in Stripe (out of band) and here, Added by you. An invoice in
     * dollars or euros needs what landed in pounds, as the coach typed it (`landedMinor`, pence); one in pounds landed
     * as its own amount.
     */
    async paidByHand(invoiceId, landedMinor = null) {
      const inv = await mine('invoices', invoiceId);
      if (inv.status === 'paid') return { status: 'paid' };
      if (inv.status !== 'sent') { const e = new Error('Only an invoice that has been sent can be settled.'); e.status = 409; throw e; }
      const currency = currencyOf(inv);
      const amount = inv.total_minor - inv.paid_minor;
      if (currency !== 'GBP' && !(Number.isInteger(landedMinor) && landedMinor > 0)) { const e = new Error('Type what landed in pounds to carry on.'); e.status = 400; throw e; }
      await stripe.markPaidByHand(inv.stripe_invoice_id);
      const at = now().toISOString();
      await server.from('payments').insert({ invoice_id: inv.id, coach_id: coach.id, amount_minor: amount, currency, landed_gbp_minor: currency === 'GBP' ? amount : landedMinor,
        added_by_coach: true, paid_at: at });
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
      let pay = null;
      if (kind === 'refund') {
        ({ data: pay } = await server.from('payments').select('stripe_id, added_by_coach').eq('invoice_id', inv.id).order('paid_at').limit(1).maybeSingle());
        if (!pay?.stripe_id || pay.added_by_coach) { const e = new Error('This was settled to your bank, so refund it from there and add it as a credit.'); e.status = 409; throw e; }
      }
      // The credit note is kept first, with the invoice locked by the database's own check (never more than was settled),
      // so a refund and a credit pressed at once can't both pass; Stripe is asked only once it's kept, and if Stripe
      // refuses, it goes again (break-it tester, 6b run 1).
      const { data: note, error: keepError } = await server.from('credit_notes')
        .insert({ invoice_id: inv.id, coach_id: coach.id, kind, amount_minor: amount, currency: inv.currency, reason }).select('id, number').maybeSingle();
      if (keepError || !note) { const e = new Error('That’s more than was settled on this invoice.'); e.status = 409; throw e; }
      const idem = `${kind}:${note.id}`;
      try {
        const stripeId = kind === 'refund'
          ? (await stripe.refund({ paymentIntent: pay.stripe_id, amount }, idem)).id
          : (await stripe.creditNote({ invoice: inv.stripe_invoice_id, amount, memo: reason || 'Credit' }, idem)).id;
        await server.from('credit_notes').update({ stripe_id: stripeId }).eq('id', note.id);
      } catch (err) {
        await server.from('credit_notes').delete().eq('id', note.id);
        throw err;
      }
      return { kind, number: note.number || null };
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

    /**
     * The coach's Send on a reminder: the settle-by day is worked out now (7 days after it goes) for the 14-day one.
     * It is marked as sending (064's sending_at) before the email service is asked, so a second press can't send it
     * twice. `again`: Needs you's Send again, for one whose sending couldn't be confirmed (follow-up 5, item 5), once
     * the coach has checked. Before 064 the claim is sent_at itself, as 061 had it.
     */
    async reminderToSend(reminderId, { again = false } = {}) {
      const rem = await mine('invoice_reminders', reminderId);
      if (rem.sent_at) return { already: true };
      const unsure = 'sending_at' in rem && rem.sending_at != null;
      // Marked as sending and not confirmed: only Send again, and only once a send still on its way would have ended.
      if (unsure && (!again || now().getTime() - new Date(rem.sending_at).getTime() < REMINDER_SETTLE_MS)) return { unsure: true };
      const inv = await mine('invoices', rem.invoice_id);
      if (inv.status !== 'sent') return { settled: true };
      // Nobody to send it to, or no page to settle on: refused before it's claimed, so it stays waiting (functionality tester).
      if (!inv.payer_email || !/^https:\/\//.test(inv.hosted_url || '')) return { noAddress: true };
      const at = now();
      const by = rem.stage === 14 ? settleBy(at, inv.payer_zone) : null;
      const has064 = 'sending_at' in rem;
      let q = server.from('invoice_reminders').update(has064 ? { sending_at: at.toISOString(), settle_by: by?.day || null } : { sent_at: at.toISOString(), settle_by: by?.day || null })
        .eq('id', rem.id).is('sent_at', null);
      q = !has064 ? q : unsure ? q.eq('sending_at', rem.sending_at) : q.is('sending_at', null);
      const { data: claimed } = await q.select('id');
      if (!claimed?.length) return { already: true };
      return { reminder: rem, invoice: inv, settleBy: by, at, has064 };
    },

    /** It went: marked sent (with 064, the sending mark is cleared). */
    async reminderSent(r) {
      if (!r.has064) return;
      await server.from('invoice_reminders').update({ sent_at: r.at.toISOString(), sending_at: null }).eq('id', r.reminder.id).eq('coach_id', coach.id);
    },

    /** Nothing went (the email service said no): the claim is let go, so the reminder waits to be sent again. */
    async releaseReminder(r) {
      await server.from('invoice_reminders').update(r.has064 ? { sending_at: null, settle_by: null } : { sent_at: null, settle_by: null }).eq('id', r.reminder.id).eq('coach_id', coach.id);
    },
  };
}

/** The reminder email, from the coach, in the shared template, to whoever settles the invoice, with Stripe's own link. */
/** @returns {Promise<'sent'|'refused'|'unsure'>} what is known about it (sendOutcome) */
export async function sendReminder(env, server, coach, { reminder, invoice, settleBy: by }, options = {}) {
  if (!invoice.payer_email || !/^https:\/\//.test(invoice.hosted_url || '')) return 'refused';
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
  return sendOutcome(env, { to: invoice.payer_email, ...emailFrom(doc) }, options);
}

/** How long a reminder marked as sending may still be on its way (the send gives up after 15 seconds; the function after 60). */
export const REMINDER_SETTLE_MS = 2 * 60 * 1000;

/** Needs you's words for a reminder whose sending couldn't be confirmed (follow-up 5, item 5). */
export const REMINDER_UNSURE = 'We couldn’t confirm that reminder went. Check before sending again.';

export default async function handler(req, res, env = process.env) {
  if (req.method !== 'POST') return reply(res, 405, { ok: false, message: DIDNT_WORK });
  const asked = askedFor(req.body);
  if (!asked) return reply(res, 400, { ok: false, message: DIDNT_WORK });
  const { url, anon } = supabaseOf(env);
  const token = String(req.headers?.authorization || '').replace(/^Bearer\s+/i, '');
  if (!url || !anon || !token) return reply(res, 401, { ok: false, message: 'Sign in again to carry on.' });
  const noCode = codeRefusal(token, { ok: false });
  if (noCode) return reply(res, noCode.status, noCode.body);
  // A payment straight to the bank needs no Stripe; everything else does.
  if (!env.SUPABASE_SERVICE_ROLE_KEY || (asked.kind !== 'bank_payment' && !keyAllowed(env.STRIPE_SECRET_KEY || ''))) return reply(res, 200, { ok: false, reason: 'not_connected' });
  const asCaller = asCallerClient(env, token);
  const { data: who, error: whoError } = await asCaller.auth.getUser(token);
  if (whoError || !who?.user?.id) return reply(res, 401, { ok: false, message: 'Sign in again to carry on.' });
  const { data: coach } = await asCaller.from('coaches').select('id, role, active, user_id').eq('user_id', who.user.id).maybeSingle();
  if (!coach?.active) return reply(res, 403, { ok: false, message: 'Only a coach can do that.' });
  const server = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const b = billing({ server, stripe: asked.kind === 'bank_payment' ? null : stripeApi(env.STRIPE_SECRET_KEY), coach });
  try {
    if (asked.kind === 'bank_payment') return reply(res, 200, { ok: true, ...(await b.bankPayment(asked)) });
    if (asked.kind === 'one_off') return reply(res, 200, { ok: true, ...(await b.oneOff(asked)) });
    if (asked.kind === 'draft') return reply(res, 200, { ok: true, ...(await b.draft(asked.id)) });
    if (asked.kind === 'send') return reply(res, 200, { ok: true, ...(await b.send(asked.id)) });
    if (asked.kind === 'paid_by_hand') return reply(res, 200, { ok: true, ...(await b.paidByHand(asked.id, asked.landedMinor ?? null)) });
    if (asked.kind === 'refund' || asked.kind === 'credit') return reply(res, 200, { ok: true, ...(await b.refundOrCredit(asked.id, asked.kind, asked.amount, asked.reason)) });
    // Only the live site ever sends: a preview claims nothing, so a reminder pressed there is still waiting on the live site.
    if (!maySend(env) || !canSend(env)) return reply(res, 200, { ok: false, reason: 'preview' });
    const r = await b.reminderToSend(asked.id, { again: asked.again === true });
    if (r.noAddress) return reply(res, 409, { ok: false, message: 'This invoice has no email address to send a reminder to, so add one and try again.' });
    if (r.unsure) return reply(res, 409, { ok: false, unsure: true, message: REMINDER_UNSURE });
    if (!r.reminder) return reply(res, 200, { ok: true, sent: false, already: Boolean(r.already), settled: Boolean(r.settled) });
    const outcome = await sendReminder(env, server, coach, r).catch(() => 'unsure');
    if (outcome === 'sent') {
      await b.reminderSent(r);
      return reply(res, 200, { ok: true, sent: true });
    }
    // Refused: it never went, so it waits to be sent again. No answer: it may have gone, so it stays marked as
    // sending, never let go by itself, and Needs you asks the coach to check first.
    if (outcome === 'refused' || !r.has064) {
      await b.releaseReminder(r);
      return reply(res, 502, { ok: false, message: 'That reminder didn’t send. Check your connection and try again.' });
    }
    return reply(res, 502, { ok: false, unsure: true, message: REMINDER_UNSURE });
  } catch (e) {
    return reply(res, e?.status || 502, { ok: false, message: e?.status ? e.message : DIDNT_WORK });
  }
}
