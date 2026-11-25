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
// Phase 6b run 3 (065; src/lib/agreements/asks.js's ASKS.billing, the same shapes):
//   delivered_invoice { agreementId, sessionIds }   invoice from what's delivered (each session once: invoice_sources)
//   top_up { agreementId }                          another block of hours at the same rate (Needs you at 80%)
//   org_invoice_preview / org_invoice_send { organisationId, sessionIds, entryIds, poNumber, rateMinor, evidenceIds }
//                                                   an organisation's one PDF (invoice, timesheet, evidence); Send numbers it,
//                                                   finalises it in Stripe with its own bank transfer details, and emails it
//                                                   from the coach with Reply-To the coach (live site only)
//   mark_uploaded { invoiceId }                     put on their supplier portal too
//   funding_details { organisationId }              the organisation's own Stripe bank transfer details
//   updated_price { agreementId, newFeeMinor, fromDay, note }   a new version after a price review, coach-signed and sent
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
// Phase 6b run 3 (065)
import { forStorage } from '../../src/lib/agreements/clauses.js';
import { moneyText } from '../../src/lib/agreements/currency.js';
import { lines as deliveredLines } from '../../src/lib/agreements/delivered.js';
import { topUp as topUpInvoice } from '../../src/lib/agreements/hours.js';
import { descriptionLine, dueOn as orgDueOn, minutesOf, problems as orgProblems, rate as orgRate, total as orgTotal } from '../../src/lib/agreements/orgInvoice.js';
import { planTotal } from '../../src/lib/agreements/pricing.js';
import { counts, isOver } from '../../src/lib/agreements/sessionOutcome.js';
import { agreementSchedule } from '../../src/lib/agreements/settling.js';
import { onSchedule, scheduledProfiles } from '../../src/lib/agreements/duringAgreement.js';
import { deliveredToInvoice, perSession, prepaidSessions } from '../../src/lib/agreements/delivered.js';
import { kindOf } from '../../src/lib/agreements/terms.js';
import { noteBlocks, orgInvoiceEmail, updatedAgreementEmail } from '../../src/lib/email/agreementEmails.js';
import { calm, sendAs, standardsFor } from './coach-agreements.js';
import { portalOrigin } from '../_portalOrigin.js';

export const config = { maxDuration: 60 };
const reply = (res, status, body) => { res.status(status).setHeader('Cache-Control', 'no-store'); res.json(body); };
const DIDNT_WORK = 'That didn’t work. Try again in a moment.';
const FIRST_KINDS = ['first_payment', 'deposit', 'instalment'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KINDS = ['draft', 'send', 'paid_by_hand', 'refund', 'credit', 'send_reminder', 'bank_payment', 'one_off',
  'delivered_invoice', 'top_up', 'org_invoice_preview', 'org_invoice_send', 'mark_uploaded', 'funding_details', 'updated_price'];
const IDS = (list, max = 200) => (Array.isArray(list) && list.length <= max && list.every((x) => UUID.test(String(x || ''))) ? [...new Set(list.map((x) => String(x).toLowerCase()))] : null);
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
  if (b.kind === 'delivered_invoice' || b.kind === 'top_up') {
    if (!UUID.test(String(b.agreementId || ''))) return null;
    const sessionIds = b.kind === 'delivered_invoice' ? IDS(b.sessionIds, 60) : [];
    if (!sessionIds || (b.kind === 'delivered_invoice' && !sessionIds.length)) return null;
    return { kind: b.kind, agreementId: String(b.agreementId).toLowerCase(), sessionIds };
  }
  if (b.kind === 'org_invoice_send' && b.again === true) {
    return UUID.test(String(b.invoiceId || '')) ? { kind: b.kind, again: true, invoiceId: String(b.invoiceId).toLowerCase() } : null;
  }
  if (b.kind === 'org_invoice_preview' || b.kind === 'org_invoice_send') {
    if (!UUID.test(String(b.organisationId || ''))) return null;
    const text = (v, n) => (typeof v === 'string' && !/[<>{}]/.test(v) ? v.trim().slice(0, n) : null);
    const sessionIds = IDS(b.sessionIds || []);
    const entryIds = IDS(b.entryIds || []);
    const evidenceIds = IDS(b.evidenceIds || [], 20);
    if (!sessionIds || !entryIds || !evidenceIds) return null;
    const rateMinor = b.rateMinor == null || b.rateMinor === '' ? null : strictMinor(b.rateMinor);
    if (b.rateMinor != null && b.rateMinor !== '' && rateMinor == null) return null;
    const poNumber = typeof b.poNumber === 'string' ? b.poNumber.trim().slice(0, 80) : '';
    if (/[<>{}]/.test(poNumber)) return null;
    return { kind: b.kind, organisationId: String(b.organisationId).toLowerCase(), sessionIds, entryIds, evidenceIds, rateMinor, poNumber,
      supplierNumber: text(b.supplierNumber, 80), reference: text(b.reference, 160) };
  }
  if (b.kind === 'funding_details') return UUID.test(String(b.organisationId || '')) ? { kind: b.kind, organisationId: String(b.organisationId).toLowerCase() } : null;
  if (b.kind === 'updated_price') {
    const fee = strictMinor(b.newFeeMinor);
    if (!UUID.test(String(b.agreementId || '')) || fee == null || !realDay(b.fromDay)) return null;
    return { kind: b.kind, agreementId: String(b.agreementId).toLowerCase(), newFeeMinor: fee, fromDay: String(b.fromDay),
      note: typeof b.note === 'string' ? b.note.replace(/\r\n?/g, '\n').trim().slice(0, 1000) : '' };
  }
  const idKey = b.kind === 'draft' ? 'agreementId' : b.kind === 'send_reminder' ? 'reminderId' : 'invoiceId';
  if (!UUID.test(String(b[idKey] || ''))) return null;
  const out = { kind: b.kind, id: String(b[idKey]).toLowerCase() };
  if (b.kind === 'send_reminder' && b.again === true) out.again = true;
  // Phase 6b run 3 (Group D): the coach's edited reminder words, and a purchase order added on Send.
  if (b.kind === 'send_reminder' && typeof b.text === 'string' && b.text.trim()) out.text = b.text.replace(/\r\n?/g, '\n').trim().slice(0, 4000);
  if (b.kind === 'send' && b.poNumber != null && b.poNumber !== '') {
    if (typeof b.poNumber !== 'string' || b.poNumber.trim().length > 80 || /[<>{}]/.test(b.poNumber)) return null;
    out.poNumber = b.poNumber.trim();
  }
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
export function billing({ server, stripe, coach, now = () => new Date(), db = server, env = {}, origin = 'https://portal.theclarityproject.co.uk', send = sendAs }) {
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

    /**
     * The organisation that settles an agreement funded by it (agreements rule 12): its billing profile's legal name,
     * invoices email, payment terms and purchase order (the sponsor's, the terms', or the open one), else its finance
     * contact with 30 days.
     */
    async _orgPayer(agreement, version) {
      let orgId = agreement.organisation_id || null;
      if (!orgId && agreement.profile_id) {
        const { data: p } = await server.from('client_profiles').select('organisation_id').eq('id', agreement.profile_id).maybeSingle();
        orgId = p?.organisation_id || null;
      }
      const { data: org } = orgId ? await server.from('organisations').select('id, name').eq('id', orgId).maybeSingle() : { data: null };
      const { data: profile } = orgId ? await server.from('org_billing_profiles').select('*').eq('coach_id', coach.id).eq('organisation_id', orgId).maybeSingle() : { data: null };
      const { data: contacts } = orgId ? await server.from('organisation_contacts').select('*').eq('organisation_id', orgId) : { data: [] };
      const finance = (contacts || []).find((c) => /finance|invoice/i.test(`${c.role || ''} ${c.roles || ''}`)) || (contacts || [])[0] || null;
      const { data: po } = orgId ? await server.from('purchase_orders').select('number').eq('organisation_id', orgId).eq('coach_id', coach.id).eq('status', 'open').limit(1).maybeSingle() : { data: null };
      const t = version?.terms || {};
      return {
        name: profile?.legal_name || org?.name || version?.funded_by || '', email: profile?.invoices_email || finance?.email || '', zone: null,
        organisationId: orgId, profile, termsDays: [14, 30, 60].includes(Number(profile?.terms_days)) ? Number(profile.terms_days) : 30,
        poNumber: String(version?.sponsor_po || t.team?.poNumber || t.poNumber || po?.number || '').slice(0, 100) || null,
      };
    },

    /**
     * The agreement's invoices due by today that aren't drafted yet, drafted in Stripe and kept here; never sent. An
     * agreement made by the builder (065: terms.kind) follows the one billing schedule (settling.js's agreementSchedule,
     * agreements rule 12) over all its signed versions: an amendment's price from its day on, the numbers carrying on, a
     * pause moving invoices on; a self-funded client's first is the first payment made at signing (agreement-settle.js),
     * an organisation's first is drafted here on the signing day to the organisation, held for a PO where it needs one.
     * While a newer version waits to be signed, the signed one keeps billing. Reminder pauses (061's
     * invoice_reminder_pauses) pause reminders only: drafting goes on.
     */
    async draft(agreementId) {
      const agreement = await mine('agreements', agreementId);
      if (agreement.status !== 'signed') return { drafted: 0 };
      const { data: all } = await server.from('agreement_versions').select('*').eq('agreement_id', agreement.id);
      const signedAll = (all || []).filter((v) => v.client_signed_at || v.sponsor_signed_at).sort((x, y) => y.version - x.version);
      if (!signedAll.length) return { drafted: 0 };
      if (signedAll.some((v) => v.terms?.kind)) return this._draft065(agreement, all, signedAll[0]);
      const version = (all || []).find((v) => v.version === agreement.current_version);
      if (!version || version.status !== 'signed') return { drafted: 0 };
      const terms = { ...version.terms, total_minor: version.total_minor ?? version.terms?.total_minor, currency: version.currency, fundedBy: version.funded_by };
      const payer = await payerOf(agreement, terms);
      const signedDay = dayIn(isZone(payer.zone) ? payer.zone : 'Europe/London', new Date(version.client_signed_at));
      const planned = invoicesFor(terms, { signedDay });
      const { data: have } = await server.from('invoices').select('instalment_n, status').eq('agreement_id', agreement.id).eq('kind', 'instalment');
      const due = dueToDraft(planned, (have || []).filter((i) => i.status !== 'void').map((i) => i.instalment_n), today(payer.zone));
      return this._draftEach(agreement, version, payer, due.map((p) => ({ ...p, kind: 'instalment', versionId: null })), { bacsOk: false });
    },

    async _draft065(agreement, all, newest) {
      const funded = Boolean(newest.funded_by || newest.terms?.fundedBy || newest.terms?.funder === 'org');
      const payer = funded ? await this._orgPayer(agreement, newest) : await payerOf(agreement, { ...newest.terms, fundedBy: null });
      const zone = isZone(payer.zone) ? payer.zone : 'Europe/London';
      const day = today(zone);
      const plan = agreementSchedule(all, { zone, until: day, agreement }).filter((p) => p.amount > 0 && (funded || p.n > 1));
      const { data: have } = await server.from('invoices').select('instalment_n, status, kind').eq('agreement_id', agreement.id);
      const taken = (have || []).filter((i) => i.status !== 'void' && i.instalment_n != null && FIRST_KINDS.includes(i.kind)).map((i) => i.instalment_n);
      const due = dueToDraft(plan, taken, day).map((p) => ({
        n: p.n, of: p.of, day: p.day, total: p.amount, kind: p.kind, versionId: p.versionId,
        termsDays: funded ? payer.termsDays : Number(p.terms.dueDays) || 14, settlesTo: funded ? 'organisation' : 'client', poNumber: funded ? payer.poNumber : null,
        lines: [{ description: p.line, amount: p.amount }], currency: newest.currency || p.terms.currency || 'GBP',
      }));
      return this._draftEach(agreement, newest, payer, due, { bacsOk: !funded, funded });
    },

    async _draftEach(agreement, version, payer, due, { bacsOk = false, funded = false } = {}) {
      let drafted = 0;
      // One Stripe customer for the agreement's payer, reused by every instalment (a Bacs Direct Debit belongs to one).
      let known = null;
      const customerFor = async (ag, who, idem) => {
        if (known) return known;
        if (funded && who.profile?.stripe_customer_id) { known = { id: who.profile.stripe_customer_id }; return known; }
        const { data: before } = await server.from('invoices').select('stripe_customer_id, payer_email').eq('agreement_id', ag.id);
        const same = (before || []).find((i) => i.stripe_customer_id && String(i.payer_email || '').toLowerCase() === String(who.email || '').toLowerCase());
        known = same ? { id: same.stripe_customer_id }
          : await stripe.customer({ name: who.name, email: who.email || undefined, metadata: funded ? { organisation_id: who.organisationId || '' } : { profile_id: ag.profile_id || '' } }, `${idem}:customer`);
        return known;
      };
      for (const p of due) {
        // A fresh key each time: a retry after a failed save is a new request to Stripe, never Stripe's "same key, other
        // parameters" refusal (break-it tester, 6b run 1). The CLARITY- number waits for Send (follow-up 5, item 6).
        const idem = `agreement:${agreement.id}:instalment:${p.n}:${randomUUID()}`;
        const currency = p.currency || version.currency;
        const customer = await customerFor(agreement, payer, idem);
        const bacs = bacsOk && currency === 'GBP' && stripe.bacsMethod ? await stripe.bacsMethod(customer.id).catch(() => null) : null;
        const inv = await stripe.draftInvoice({ customer: customer.id, currency, daysUntilDue: p.termsDays, lines: p.lines, poNumber: p.poNumber,
          metadata: { agreement_id: agreement.id, instalment: String(p.n) },
          ...(bacs ? { automatic: true, defaultPaymentMethod: bacs, methods: ['bacs_debit', 'card'] } : funded && currency === 'GBP' ? { methods: ['customer_balance'] } : {}) }, idem);
        const { error } = await server.from('invoices').insert({
          coach_id: coach.id, agreement_id: agreement.id, profile_id: agreement.profile_id || null, organisation_id: payer.organisationId || payer.profile?.organisation_id || null,
          version_id: p.versionId || null, stripe_invoice_id: inv.id, stripe_customer_id: customer.id, kind: p.kind || 'instalment', status: 'draft', currency, lines: p.lines,
          total_minor: p.total, terms_days: p.termsDays, po_number: p.poNumber, settles_to: p.settlesTo, payer_name: payer.name, payer_email: payer.email || null,
          payer_zone: payer.zone || null, instalment_n: p.n,
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
    async send(invoiceId, { poNumber = null } = {}) {
      const inv = await mine('invoices', invoiceId);
      if (inv.status !== 'draft') return { status: inv.status, number: inv.number ? `CLARITY-${inv.number}` : null };
      // An organisation that needs a purchase order: held until one is on it (Needs you's PO line; agreements rule 12).
      if (inv.settles_to === 'organisation' && inv.organisation_id && !poNumber && !String(inv.po_number || '').trim()) {
        const { data: prof } = await server.from('org_billing_profiles').select('needs_po').eq('coach_id', coach.id).eq('organisation_id', inv.organisation_id).maybeSingle();
        if (prof?.needs_po) {
          const { data: org } = await server.from('organisations').select('name').eq('id', inv.organisation_id).maybeSingle();
          throw calm(409, `${org?.name || 'They'} needs a purchase order on the invoice. Add the PO number first.`);
        }
      }
      // A purchase order added on Send (Needs you's "Add and send invoice"): on the invoice here and on Stripe's.
      if (poNumber && poNumber !== inv.po_number) {
        await server.from('invoices').update({ po_number: poNumber }).eq('id', inv.id).eq('status', 'draft');
        if (stripe.purchaseOrder) await stripe.purchaseOrder(inv.stripe_invoice_id, poNumber);
        inv.po_number = poNumber;
      }
      // One press at a time (064's send_claimed_at, held for at most 2 minutes): a second press while one is on its way
      // is told it's going, and never finalises or emails it again (break-it tester, follow-up 5).
      const claimedAt = now().toISOString();
      const claim = await server.from('invoices').update({ send_claimed_at: claimedAt }).eq('id', inv.id).eq('status', 'draft')
        .or(`send_claimed_at.is.null,send_claimed_at.lt.${new Date(now().getTime() - 120000).toISOString()}`).select('id');
      const claims = !claim.error; // before 064 there is no column: as before, with no claim
      if (claims && !claim.data?.length) return { status: 'sending', number: inv.number ? `CLARITY-${inv.number}` : null };
      try {
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
        let sent;
        try {
          await stripe.number(inv.stripe_invoice_id, `CLARITY-${number}`);
          sent = await stripe.send(inv.stripe_invoice_id);
        } catch (e) {
          // Finalised already (an earlier press whose email didn't go): its email is asked for again, and only an email
          // that went counts as sent. A draft Stripe still has is a real refusal (break-it tester, follow-up 5).
          const there = stripe.retrieve ? await stripe.retrieve('invoice', inv.stripe_invoice_id).catch(() => null) : null;
          if (!there || !there.status || there.status === 'draft') throw e;
          if (there.status !== 'open') { sent = there; } else {
            try { sent = await stripe.email(inv.stripe_invoice_id); } catch {
              const err = new Error('It’s ready in Stripe, but its email didn’t go. Press Send again.');
              err.status = 502;
              throw err;
            }
          }
        }
        const issued = today(inv.payer_zone);
        await server.from('invoices').update({ status: 'sent', sent_at: now().toISOString(), issued_on: issued, due_on: addDays(issued, inv.terms_days),
          hosted_url: sent.hosted_invoice_url || null, updated_at: now().toISOString() }).eq('id', inv.id).eq('status', 'draft');
        return { status: 'sent', number: `CLARITY-${number}` };
      } finally {
        if (claims) await server.from('invoices').update({ send_claimed_at: null }).eq('id', inv.id).eq('send_claimed_at', claimedAt);
      }
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

    // ---------------------------------------------------------------- Phase 6b run 3 (065)

    /** A signed agreement of the coach's, its current version and who settles it. */
    async _signed(agreementId) {
      const a = await mine('agreements', agreementId);
      if (a.status !== 'signed') throw calm(409, 'Only a signed agreement can be invoiced.');
      const { data: v } = await server.from('agreement_versions').select('*').eq('agreement_id', a.id).eq('version', a.current_version).maybeSingle();
      const { data: signedV } = v?.status === 'signed' ? { data: v } : await server.from('agreement_versions').select('*').eq('agreement_id', a.id).eq('status', 'signed').order('version', { ascending: false }).limit(1).maybeSingle();
      if (!signedV) throw calm(409, 'Only a signed agreement can be invoiced.');
      const terms = { ...signedV.terms, fundedBy: signedV.funded_by };
      return { a, v: signedV, terms, payer: await payerOf(a, terms), currency: signedV.currency || terms.currency || 'GBP' };
    },

    /** One invoice for a client's agreement, claimed on its sources first (never invoiced twice), drafted in Stripe and sent. */
    async _invoiceAndSend({ a, v, payer, currency, kind, lines, termsDays, sources = [] }) {
      const total = lines.reduce((x, l) => x + l.amount, 0);
      if (!(total > 0)) throw calm(409, 'There’s nothing to invoice.');
      const { data: row, error } = await server.from('invoices').insert({
        coach_id: coach.id, agreement_id: a.id, profile_id: a.profile_id, organisation_id: payer.profile?.organisation_id || null, version_id: v.id,
        kind, status: 'draft', currency, lines, total_minor: total, terms_days: Math.min(120, Math.max(1, termsDays || 14)),
        settles_to: v.funded_by ? 'organisation' : 'client', payer_name: payer.name, payer_email: payer.email || null, payer_zone: payer.zone || null,
      }).select('id').maybeSingle();
      if (error || !row) throw error || new Error('invoice');
      if (sources.length) {
        const claimed = await server.from('invoice_sources').insert(sources.map((src) => ({ coach_id: coach.id, invoice_id: row.id, ...src })));
        if (claimed.error) {
          await server.from('invoice_sources').delete().eq('invoice_id', row.id);
          await server.from('invoices').delete().eq('id', row.id);
          throw calm(409, 'One of those coaching sessions is on an invoice already.');
        }
      }
      try {
        const idem = `${kind}:${row.id}`;
        const { data: before } = await server.from('invoices').select('stripe_customer_id').eq('agreement_id', a.id);
        const known = (before || []).find((i) => i.stripe_customer_id)?.stripe_customer_id;
        const customer = known ? { id: known } : await stripe.customer({ name: payer.name, email: payer.email, metadata: { profile_id: a.profile_id || '' } }, `${idem}:customer`);
        const inv = await stripe.draftInvoice({ customer: customer.id, currency, daysUntilDue: Math.max(1, termsDays || 14), lines, metadata: { agreement_id: a.id, kind } }, idem);
        const kept = await server.from('invoices').update({ stripe_invoice_id: inv.id, stripe_customer_id: customer.id }).eq('id', row.id);
        if (kept.error) { await stripe.void(inv.id).catch(() => {}); throw kept.error; }
      } catch (e) {
        await server.from('invoice_sources').delete().eq('invoice_id', row.id);
        await server.from('invoices').delete().eq('id', row.id);
        throw e;
      }
      const sent = await this.send(row.id);
      const n = Number(String(sent.number || '').replace(/^CLARITY-/, '')) || null;
      return { invoiceId: row.id, number: n, totalMinor: total, currency };
    },

    /** Invoice from what's delivered (M28 s-n-delivered): the ticked coaching sessions that happened (or count), each once. */
    async deliveredInvoice({ agreementId, sessionIds }) {
      const ctx = await this._signed(agreementId);
      const { terms } = ctx;
      const k = kindOf(terms);
      if (!(k === 'sessions' && terms.settle === 'delivered') && !(k === 'retainer' && terms.retainer?.invoice === 'delivered')) {
        throw calm(409, 'This agreement isn’t invoiced as delivered.');
      }
      const { data: rows } = await server.from('coach_sessions').select('*').in('id', sessionIds);
      const list = (rows || []).filter((x) => x.coach_id === coach.id && x.profile_id === ctx.a.profile_id);
      if (list.length !== sessionIds.length) throw notYours('coaching session');
      if (list.some((x) => !counts(x) || !isOver(x, now().getTime()))) throw calm(409, 'Only coaching sessions that happened, or count as used, can be invoiced.');
      // The same list Needs you drafts from (delivered.js): never a session settled at signing, never one invoiced already.
      const { data: around } = await server.from('coach_sessions').select('*').eq('coach_id', coach.id).eq('profile_id', ctx.a.profile_id);
      const { data: srcs } = await server.from('invoice_sources').select('session_id, released_at').in('session_id', (around || []).map((x) => x.id).slice(0, 1000));
      const zone = ctx.payer.zone || 'Europe/London';
      // The sessions settled at signing are recorded against the first payment (invoice_sources), so no other invoice,
      // an organisation's included, takes them again (the break-it tester, run 3, finding 4).
      const { data: firsts } = await server.from('invoices').select('id, kind, instalment_n, status').eq('agreement_id', ctx.a.id).eq('status', 'paid');
      const firstPaid = (firsts || []).find((i) => FIRST_KINDS.includes(i.kind) && (i.instalment_n ?? 1) === 1);
      if (firstPaid) {
        const live = new Set((srcs || []).filter((x) => !x.released_at).map((x) => x.session_id));
        for (const x of prepaidSessions({ terms, sessions: around || [], profileId: ctx.a.profile_id, zone, now: now().getTime() })) {
          if (live.has(x.id)) continue;
          await server.from('invoice_sources').insert({ coach_id: coach.id, invoice_id: firstPaid.id, session_id: x.id, minutes: Number(x.minutes) || 60 });
        }
      }
      const open = new Set(deliveredToInvoice({ terms, sessions: around || [], sources: srcs || [], profileId: ctx.a.profile_id, zone, now: now().getTime() }).map((x) => x.id));
      const settledLive = new Set((srcs || []).filter((x) => !x.released_at).map((x) => x.session_id));
      if (list.some((x) => settledLive.has(x.id))) throw calm(409, 'One of those coaching sessions is on an invoice already.');
      if (list.some((x) => !open.has(x.id))) throw calm(409, 'One of those coaching sessions was settled when the agreement was signed.');
      const per = perSession(terms);
      const lines = deliveredLines(list.sort((x, y) => Date.parse(x.starts_at) - Date.parse(y.starts_at)), per, zone)
        .map((l) => ({ description: l.description, amount: l.amount }));
      return this._invoiceAndSend({ ...ctx, kind: 'delivered', lines, termsDays: Number(terms.dueDays) || 14,
        sources: list.map((x) => ({ session_id: x.id, minutes: Number(x.minutes) || 60 })) });
    },

    /** Another block of hours at the same rate (M28 s-n-hours), one at a time. */
    async topUp({ agreementId }) {
      const ctx = await this._signed(agreementId);
      if (kindOf(ctx.terms) !== 'hours') throw calm(409, 'Only a block of hours can be topped up.');
      const { data: open } = await server.from('invoices').select('id, status').eq('agreement_id', ctx.a.id).eq('kind', 'top_up');
      if ((open || []).some((i) => i.status === 'draft' || i.status === 'sent')) throw calm(409, 'A top-up invoice is already waiting to be settled.');
      const t = topUpInvoice(ctx.terms);
      return this._invoiceAndSend({ ...ctx, kind: 'top_up', lines: t.lines, termsDays: Number(ctx.terms.dueDays) || 14 });
    },

    /** What an organisation's invoice is made from, checked: its profile, the ticked rows, the rate, the PO, the evidence. */
    async _orgInvoice(asked) {
      ownerOnly();
      if (!(await orgIsMine(asked.organisationId))) throw notYours('organisation');
      const { data: org } = await server.from('organisations').select('id, name').eq('id', asked.organisationId).maybeSingle();
      if (!org) throw notYours('organisation');
      const { data: saved } = await server.from('org_billing_profiles').select('*').eq('coach_id', coach.id).eq('organisation_id', org.id).maybeSingle();
      if (!saved) throw calm(409, `Set up ${org.name}’s billing first.`);
      // This invoice's own supplier number and reference, where the coach typed them (Group D), else the profile's.
      const profile = { ...saved, ...(asked.supplierNumber ? { supplier_number: asked.supplierNumber } : {}), ...(asked.reference ? { their_reference: asked.reference } : {}) };
      const { data: people } = await server.from('client_profiles').select('id, name, organisation_id, coach_id').eq('organisation_id', org.id).eq('coach_id', coach.id);
      const inOrg = new Map((people || []).map((p) => [p.id, p]));
      const rows = [];
      if (asked.sessionIds.length) {
        const { data: ss } = await server.from('coach_sessions').select('*').in('id', asked.sessionIds);
        for (const x of ss || []) {
          if (x.coach_id !== coach.id || !inOrg.has(x.profile_id)) throw notYours('coaching session');
          rows.push({ key: x.id, sessionId: x.id, day: dayIn('Europe/London', new Date(x.starts_at)), what: `Coaching session with ${inOrg.get(x.profile_id).name}`, minutes: Number(x.minutes) || 60 });
        }
        if ((ss || []).length !== asked.sessionIds.length) throw notYours('coaching session');
        // A client whose coaching is settled through an agreement of its own (the organisation's on its own schedule, or
        // one the client funded themselves, whatever its status now): never invoiced to the organisation by the hour too
        // (agreements rule 12; the break-it tester, run 3, finding 4).
        const who = [...new Set((ss || []).map((x) => x.profile_id))];
        const { data: ags } = who.length ? await server.from('agreements').select('id, profile_id, status, ends_on, ending_on, ending_by').in('profile_id', who).eq('coach_id', coach.id) : { data: [] };
        const { data: avs } = (ags || []).length ? await server.from('agreement_versions').select('agreement_id, version, status, terms, funded_by, client_signed_at, sponsor_signed_at').in('agreement_id', ags.map((x) => x.id)) : { data: [] };
        const covered = scheduledProfiles(ags || [], avs || []);
        if ((ss || []).some((x) => onSchedule(covered, x.profile_id, dayIn('Europe/London', new Date(x.starts_at))))) throw calm(409, 'That coaching session is covered by its own agreement, so it isn’t invoiced to the organisation.');
      }
      if (asked.entryIds.length) {
        const { data: es } = await server.from('time_entries').select('*').in('id', asked.entryIds);
        const engIds = [...new Set((es || []).map((e) => e.engagement_id))];
        const { data: engs } = engIds.length ? await server.from('engagements').select('id, profile_id').in('id', engIds) : { data: [] };
        const engProfile = new Map((engs || []).map((e) => [e.id, e.profile_id]));
        for (const e of es || []) {
          if (e.coach_id !== coach.id || !e.ended_at || !inOrg.has(engProfile.get(e.engagement_id))) throw notYours('time entry');
          rows.push({ key: e.id, entryId: e.id, day: dayIn('Europe/London', new Date(e.started_at)), what: e.note || `Work for ${inOrg.get(engProfile.get(e.engagement_id)).name}`,
            minutes: Math.max(0, Math.round((Date.parse(e.ended_at) - Date.parse(e.started_at)) / 60000)) });
        }
        if ((es || []).length !== asked.entryIds.length) throw notYours('time entry');
        // Time for a client whose own agreement settles it is never invoiced to the organisation too (finding 4).
        const whoE = [...new Set((engs || []).map((e) => e.profile_id).filter(Boolean))];
        const { data: agsE } = whoE.length ? await server.from('agreements').select('id, profile_id, status, ends_on, ending_on, ending_by').in('profile_id', whoE).eq('coach_id', coach.id) : { data: [] };
        const { data: avsE } = (agsE || []).length ? await server.from('agreement_versions').select('agreement_id, version, status, terms, funded_by, client_signed_at, sponsor_signed_at').in('agreement_id', agsE.map((x) => x.id)) : { data: [] };
        const coveredE = scheduledProfiles(agsE || [], avsE || []);
        if ((es || []).some((e) => engProfile.get(e.engagement_id) && onSchedule(coveredE, engProfile.get(e.engagement_id), dayIn('Europe/London', new Date(e.started_at))))) {
          throw calm(409, 'That time is covered by the client’s own agreement, so it isn’t invoiced to the organisation.');
        }
      }
      rows.sort((x, y) => x.day.localeCompare(y.day));
      const { data: sponsor } = await server.from('agreements').select('id, current_version').eq('organisation_id', org.id).eq('coach_id', coach.id).eq('kind', 'sponsor').eq('status', 'signed').limit(1).maybeSingle();
      const { data: sv } = sponsor ? await server.from('agreement_versions').select('terms').eq('agreement_id', sponsor.id).eq('version', sponsor.current_version).maybeSingle() : { data: null };
      const rateMinor = orgRate(profile, sv?.terms, asked.rateMinor);
      const { data: po } = await server.from('purchase_orders').select('number').eq('organisation_id', org.id).eq('coach_id', coach.id).eq('status', 'open').limit(1).maybeSingle();
      const poNumber = asked.poNumber || po?.number || '';
      let evidence = [];
      if (asked.evidenceIds.length) {
        const { data: ev } = await server.from('invoice_evidence').select('*').in('id', asked.evidenceIds);
        if ((ev || []).length !== asked.evidenceIds.length || ev.some((x) => x.coach_id !== coach.id || x.organisation_id !== org.id)) throw notYours('attachment');
        evidence = [...ev].sort((x, y) => x.position - y.position);
      }
      const problems = orgProblems({ orgName: org.name, profile, rows, poNumber, evidence });
      const currency = profile.currency || 'GBP';
      const total = orgTotal(rows, rateMinor);
      const lines = rows.length ? [{
        description: descriptionLine({ orgName: org.name, count: rows.length, firstDay: rows[0].day, lastDay: rows.at(-1).day, timesheet: profile.timesheet }),
        minutes: minutesOf(rows), rateMinor, amount: total,
      }] : [];
      return { org, profile, rows, rateMinor, poNumber, evidence, problems, currency, total, lines };
    },

    /** The evidence's bytes from coach-files, each only from the coach's own folder. */
    async _evidenceBytes(evidence) {
      const out = [];
      for (const ev of evidence) {
        // An attachment that can't be read stops the invoice, never quietly left out (functionality tester, run 3, finding 12).
        if (!coach.user_id || !String(ev.storage_path).startsWith(`${coach.user_id}/`)) throw calm(409, `${ev.file_name || 'An attachment'} can’t be read. Remove it and add it again.`);
        const { data } = await server.storage.from('coach-files').download(ev.storage_path).catch(() => ({ data: null }));
        if (!data) throw calm(409, `${ev.file_name || 'An attachment'} can’t be read. Remove it and add it again.`);
        out.push({ bytes: new Uint8Array(await data.arrayBuffer()), name: ev.file_name });
      }
      return out;
    },

    async _orgPdf(o, { number = null, issuedOn, bank = null }) {
      const { invoiceFile } = await import('../_agreementPdf.js');
      return invoiceFile({
        number, issuedOn, dueOn: orgDueOn(issuedOn, o.profile.terms_days), termsDays: o.profile.terms_days, orgName: o.org.name,
        legalName: o.profile.legal_name, address: o.profile.billing_address, poNumber: o.poNumber || null, supplierNumber: o.profile.supplier_number,
        theirReference: o.profile.their_reference, lines: o.lines, currency: o.currency, bank: bank || o.profile.bank_details || null,
        timesheet: o.profile.timesheet ? o.rows.map((r) => ({ day: r.day, what: r.what, minutes: r.minutes })) : null,
      }, await this._evidenceBytes(o.evidence));
    },

    /** The one PDF before Send (M28 s-inv-pdf): not numbered yet (numbers are taken at Send). */
    async orgInvoicePreview(asked) {
      const o = await this._orgInvoice(asked);
      if (!o.rows.length) throw calm(409, o.problems[0]);
      const pdf = await this._orgPdf(o, { issuedOn: today('Europe/London') });
      return { pdf: Buffer.from(pdf.bytes).toString('base64'), fileName: pdf.fileName, pages: pdf.pages };
    },

    /** The organisation's own Stripe customer and its UK bank transfer details, made once and kept on the profile. */
    async _orgCustomer(o) {
      let customerId = o.profile.stripe_customer_id;
      if (!customerId) {
        const cu = await stripe.customer({ name: o.profile.legal_name || o.org.name, email: o.profile.invoices_email || undefined, metadata: { organisation_id: o.org.id } }, `org:${o.org.id}:${coach.id}:customer`);
        customerId = cu.id;
        await server.from('org_billing_profiles').update({ stripe_customer_id: customerId }).eq('id', o.profile.id).is('stripe_customer_id', null);
        const { data: again } = await server.from('org_billing_profiles').select('stripe_customer_id').eq('id', o.profile.id).maybeSingle();
        customerId = again?.stripe_customer_id || customerId;
      }
      let bank = o.profile.bank_details || null;
      if (!bank?.accountNumber && o.currency === 'GBP' && stripe.fundingInstructions) {
        bank = await stripe.fundingInstructions(customerId).catch(() => null);
        if (bank) await server.from('org_billing_profiles').update({ bank_details: bank }).eq('id', o.profile.id);
      }
      return { customerId, bank };
    },

    /** The organisation's bank transfer details (funding_details). */
    async fundingDetails({ organisationId }) {
      ownerOnly();
      if (!(await orgIsMine(organisationId))) throw notYours('organisation');
      const { data: org } = await server.from('organisations').select('id, name').eq('id', organisationId).maybeSingle();
      const { data: profile } = await server.from('org_billing_profiles').select('*').eq('coach_id', coach.id).eq('organisation_id', organisationId).maybeSingle();
      if (!org || !profile) throw calm(409, 'Set up their billing first.');
      if ((profile.currency || 'GBP') !== 'GBP') throw calm(409, 'Bank transfer details are for invoices in pounds.');
      const { bank } = await this._orgCustomer({ org, profile, currency: 'GBP' });
      if (!bank) throw calm(502, 'Stripe didn’t give the bank details yet. Try again in a moment.');
      return { bankDetails: { accountName: bank.accountName, sortCode: bank.sortCode, accountNumber: bank.accountNumber } };
    },

    /**
     * Send an organisation's invoice (M28 s-inv-sent): only when the profile's needs are met; its sources claimed first;
     * numbered (064's one run), finalised in Stripe with the organisation's own bank transfer details and no Stripe email;
     * the one PDF kept in coach-files and emailed from the coach, Reply-To the coach (live site only).
     */
    async orgInvoiceSend(asked) {
      if (asked.again) return this._orgInvoiceAgain(asked.invoiceId);
      const o = await this._orgInvoice(asked);
      if (o.problems.length) throw calm(409, o.problems[0]);
      if (!o.profile.invoices_email) throw calm(409, `Add ${o.org.name}’s invoices email first.`);
      // Every attachment read before anything is numbered or sent: one that can't be read stops it, in calm words.
      await this._evidenceBytes(o.evidence);
      const termsDays = o.profile.terms_days || 30;
      const { data: row, error } = await server.from('invoices').insert({
        coach_id: coach.id, organisation_id: o.org.id, kind: 'org_hours', status: 'draft', currency: o.currency,
        lines: o.lines.map((l) => ({ description: l.description, amount: l.amount })), total_minor: o.total, terms_days: termsDays,
        po_number: o.poNumber || null, supplier_number: o.profile.supplier_number || null, their_reference: o.profile.their_reference || null,
        timesheet: Boolean(o.profile.timesheet), settles_to: 'organisation', payer_name: o.profile.legal_name || o.org.name, payer_email: o.profile.invoices_email,
      }).select('id').maybeSingle();
      if (error || !row) throw error || new Error('invoice');
      const claimed = await server.from('invoice_sources').insert(o.rows.map((r) => ({ coach_id: coach.id, invoice_id: row.id, session_id: r.sessionId || null, time_entry_id: r.entryId || null, minutes: r.minutes })));
      if (claimed.error) {
        await server.from('invoice_sources').delete().eq('invoice_id', row.id);
        await server.from('invoices').delete().eq('id', row.id);
        throw calm(409, 'One of those is on an invoice already.');
      }
      let customerId;
      let bank;
      let inv;
      try {
        ({ customerId, bank } = await this._orgCustomer(o));
        inv = await stripe.draftInvoice({ customer: customerId, currency: o.currency, daysUntilDue: termsDays, lines: o.lines.map((l) => ({ description: l.description, amount: l.amount })),
          poNumber: o.poNumber || null, metadata: { organisation_id: o.org.id, kind: 'org_hours' }, methods: o.currency === 'GBP' ? ['customer_balance'] : ['card'] }, `org_hours:${row.id}`);
        const kept = await server.from('invoices').update({ stripe_invoice_id: inv.id, stripe_customer_id: customerId }).eq('id', row.id);
        if (kept.error) { await stripe.void(inv.id).catch(() => {}); throw kept.error; }
      } catch (e) {
        await server.from('invoice_sources').delete().eq('invoice_id', row.id);
        await server.from('invoices').delete().eq('id', row.id);
        throw e;
      }
      const { data: number, error: numberError } = await server.rpc('invoice_take_number', { p_invoice: row.id });
      if (numberError || !Number.isInteger(number)) throw calm(502, 'That didn’t send. Try again in a moment.');
      await stripe.number(inv.id, `CLARITY-${number}`);
      const fin = await stripe.finalize(inv.id);
      const issued = today('Europe/London');
      const due = orgDueOn(issued, termsDays);
      const pdf = await this._orgPdf(o, { number, issuedOn: issued, bank });
      const path = coach.user_id ? `${coach.user_id}/finances/invoices/${row.id}.pdf` : null;
      if (path) await server.storage.from('coach-files').upload(path, pdf.bytes, { contentType: 'application/pdf', upsert: true }).catch(() => null);
      const { data: me } = await server.from('coaches').select('display_first_name, email').eq('id', coach.id).maybeSingle();
      const contact = await server.from('organisation_contacts').select('name, role, roles').eq('organisation_id', o.org.id);
      const finance = (contact.data || []).find((c) => /finance|invoice/i.test(`${c.role || ''} ${c.roles || ''}`));
      const outcome = await send(env, {
        to: o.profile.invoices_email,
        doc: orgInvoiceEmail({ firstName: finance?.name || '', coachFirst: me?.display_first_name || 'Tim', number: `CLARITY-${number}`, amountWords: moneyText(o.total, o.currency),
          dueWords: dayKeyWords(due, { year: true }), orgName: o.org.name, poNumber: o.poNumber || null, fileName: pdf.fileName }),
        fromName: me?.display_first_name || '', replyTo: me?.email || null,
        files: [{ filename: pdf.fileName, content: Buffer.from(pdf.bytes).toString('base64') }],
      });
      const at = now().toISOString();
      await server.from('invoices').update({ status: 'sent', sent_at: at, issued_on: issued, due_on: due, hosted_url: fin?.hosted_invoice_url || null,
        pdf_path: path, bank_details: bank || null, ...(outcome === 'sent' ? { emailed_at: at } : {}), updated_at: at }).eq('id', row.id);
      if (o.evidence.length) await server.from('invoice_evidence').update({ invoice_id: row.id }).in('id', o.evidence.map((e) => e.id)).eq('coach_id', coach.id);
      return { invoiceId: row.id, number, fileName: pdf.fileName, sentTo: o.profile.invoices_email, dueOn: due, emailed: outcome === 'sent' };
    },

    /** Send again (M28 s-inv-sent): the same kept PDF, to the same address, from the coach. */
    async _orgInvoiceAgain(invoiceId) {
      ownerOnly();
      const inv = await mine('invoices', invoiceId);
      if (inv.kind !== 'org_hours' || !['sent', 'paid'].includes(inv.status) || !inv.pdf_path || !inv.payer_email) throw calm(409, 'This invoice can’t be sent again from here.');
      if (inv.status === 'paid') throw calm(409, 'This invoice is settled already.');
      const { data: file } = await server.storage.from('coach-files').download(inv.pdf_path);
      if (!file) throw calm(502, 'The invoice’s PDF couldn’t be read. Try again in a moment.');
      const { data: org } = await server.from('organisations').select('name').eq('id', inv.organisation_id).maybeSingle();
      const { data: me } = await server.from('coaches').select('display_first_name, email').eq('id', coach.id).maybeSingle();
      const fileName = `Invoice CLARITY-${inv.number}, ${org?.name || ''}, ${dayKeyWords(inv.issued_on, { year: true }).replace(/^[A-Z][a-z]{2} /, '')}.pdf`;
      const outcome = await send(env, {
        to: inv.payer_email,
        doc: orgInvoiceEmail({ coachFirst: me?.display_first_name || 'Tim', number: `CLARITY-${inv.number}`, amountWords: moneyText(inv.total_minor, inv.currency),
          dueWords: dayKeyWords(inv.due_on, { year: true }), orgName: org?.name || '', poNumber: inv.po_number, fileName }),
        fromName: me?.display_first_name || '', replyTo: me?.email || null,
        files: [{ filename: fileName, content: Buffer.from(await file.arrayBuffer()).toString('base64') }],
      });
      if (outcome === 'sent') await server.from('invoices').update({ emailed_at: now().toISOString() }).eq('id', inv.id);
      return { invoiceId: inv.id, number: inv.number, fileName, sentTo: inv.payer_email, dueOn: inv.due_on, emailed: outcome === 'sent' };
    },

    /** Put on their supplier portal too (Needs you's Mark as uploaded). */
    async markUploaded(invoiceId) {
      const inv = await mine('invoices', invoiceId);
      if (inv.portal_uploaded_at) return { uploadedAt: inv.portal_uploaded_at };
      const at = now().toISOString();
      await server.from('invoices').update({ portal_uploaded_at: at }).eq('id', inv.id).is('portal_uploaded_at', null);
      return { uploadedAt: at };
    },

    /**
     * After a price review (M28 s-n-price): a new version at the new fee from the day given, with the coach's short note,
     * coach-signed with their newest saved signature and sent (both sign it again). As the caller wherever it can be.
     */
    async updatedPrice({ agreementId, newFeeMinor, fromDay, note }) {
      const { data: a } = await db.from('agreements').select('*').eq('id', agreementId).maybeSingle();
      if (!a || a.coach_id !== coach.id) throw notYours('agreement');
      if (a.status !== 'signed') throw calm(409, 'Only a signed agreement can have its price updated.');
      const { data: versions } = await db.from('agreement_versions').select('*').eq('agreement_id', a.id);
      const signed = (versions || []).filter((v) => v.status === 'signed').sort((x, y) => y.version - x.version)[0];
      if (!signed) throw calm(409, 'Only a signed agreement can have its price updated.');
      if ((versions || []).some((v) => v.status === 'sent' && v.version > signed.version)) throw calm(409, 'A new version is already waiting to be signed.');
      const t = structuredClone(signed.terms || {});
      const k = kindOf(t);
      if (k === 'retainer') t.retainer = { ...(t.retainer || {}), feeMinor: newFeeMinor };
      else if (t.priceMode === 'monthly') t.monthlyMinor = newFeeMinor;
      else if (t.priceMode === 'hourly') t.rateMinor = newFeeMinor;
      else t.totalMinor = newFeeMinor;
      t.priceFrom = fromDay;
      t.startsOn = t.startsOn && t.startsOn > fromDay ? t.startsOn : fromDay;
      const clauses = forStorage(t, { standards: await standardsFor(server, coach.id, k), overrides: signed.overrides || {} });
      const version = Math.max(...(versions || []).map((v) => v.version)) + 1;
      const made = await db.from('agreement_versions').insert({ agreement_id: a.id, coach_id: coach.id, version, status: 'draft', terms: t, clauses,
        overrides: signed.overrides || {}, currency: signed.currency, fx_rate: signed.fx_rate, funded_by: signed.funded_by,
        total_minor: k === 'retainer' ? newFeeMinor : planTotal(t, t.extrasChosen || []), personal_note: note || null }).select('*');
      if (made.error) throw made.error.message && made.error.code ? calm(409, made.error.message) : made.error;
      const v = made.data[0];
      const { data: sig } = await db.from('signatures').select('id').eq('user_id', coach.user_id).order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (!sig) throw calm(409, 'Add your signature first, then send it.');
      if (coach.role !== 'owner') {
        // An associate's new version waits for the owner's approval like any other (the break-it tester, run 3, finding
        // 6): signed by the coach, made the agreement's current version, and asked; the owner's Approve sends it.
        const signedAt = now().toISOString();
        const held = await db.from('agreement_versions').update({ coach_signed_at: signedAt, coach_signature_id: sig.id, send_as: 'agreement' }).eq('id', v.id).eq('status', 'draft').select('id');
        if (held.error) throw calm(409, held.error.message || DIDNT_WORK);
        const asked = await db.from('agreements').update({ current_version: version, approval: 'waiting' }).eq('id', a.id).select('id');
        if (asked.error) throw calm(409, asked.error.message || DIDNT_WORK);
        return { versionId: v.id, sentAt: null, emailed: false, waiting: true };
      }
      const sentAt = now().toISOString();
      const sent = await db.from('agreement_versions').update({ status: 'sent', coach_signed_at: sentAt, coach_signature_id: sig.id, sent_at: sentAt, send_as: 'agreement',
        expires_on: addDays(today('Europe/London'), Number(t.expiryDays) || 30) }).eq('id', v.id).eq('status', 'draft').select('id');
      if (sent.error) throw calm(409, sent.error.message || DIDNT_WORK);
      await db.from('agreements').update({ current_version: version }).eq('id', a.id);
      const { data: p } = await server.from('client_profiles').select('name, email').eq('id', a.profile_id).maybeSingle();
      const { data: me } = await server.from('coaches').select('display_first_name, email').eq('id', coach.id).maybeSingle();
      const outcome = p?.email ? await send(env, { to: p.email, doc: updatedAgreementEmail({ firstName: String(p.name || '').split(' ')[0], coachFirst: me?.display_first_name || '',
        note, link: `${origin}/coaching/agreement/${v.id}` }), fromName: t.coachName || me?.display_first_name || '', replyTo: me?.email || null }) : 'refused';
      return { versionId: v.id, sentAt, emailed: outcome === 'sent' };
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
  // The coach's own words after Edit (Group D): they replace the drafted lines; the greeting, the button and the name stay.
  if (typeof reminder.text === 'string' && reminder.text.trim()) {
    const blocks = doc.blocks.filter(Boolean);
    const edited = noteBlocks(reminder.text);
    if (edited.length) doc.blocks = [blocks[0], ...edited, blocks.find((x) => x.type === 'button'), blocks.at(-1)];
  }
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
  // A payment straight to the bank, Mark as uploaded and a price review need no Stripe; everything else does.
  const noStripe = ['bank_payment', 'mark_uploaded', 'updated_price', 'org_invoice_preview'].includes(asked.kind);
  if (!env.SUPABASE_SERVICE_ROLE_KEY || (!noStripe && !keyAllowed(env.STRIPE_SECRET_KEY || ''))) return reply(res, 200, { ok: false, reason: 'not_connected' });
  const asCaller = asCallerClient(env, token);
  const { data: who, error: whoError } = await asCaller.auth.getUser(token);
  if (whoError || !who?.user?.id) return reply(res, 401, { ok: false, message: 'Sign in again to carry on.' });
  const { data: coach } = await asCaller.from('coaches').select('id, role, active, user_id').eq('user_id', who.user.id).maybeSingle();
  if (!coach?.active) return reply(res, 403, { ok: false, message: 'Only a coach can do that.' });
  const server = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const b = billing({ server, stripe: noStripe ? null : stripeApi(env.STRIPE_SECRET_KEY), coach, db: asCaller, env, origin: portalOrigin(req.headers || {}, env) });
  try {
    const run065 = {
      delivered_invoice: () => b.deliveredInvoice(asked), top_up: () => b.topUp(asked), org_invoice_preview: () => b.orgInvoicePreview(asked),
      org_invoice_send: () => b.orgInvoiceSend(asked), mark_uploaded: () => b.markUploaded(asked.id), funding_details: () => b.fundingDetails(asked),
      updated_price: () => b.updatedPrice(asked),
    }[asked.kind];
    if (run065) return reply(res, 200, { ok: true, ...(await run065()) });
    if (asked.kind === 'bank_payment') return reply(res, 200, { ok: true, ...(await b.bankPayment(asked)) });
    if (asked.kind === 'one_off') return reply(res, 200, { ok: true, ...(await b.oneOff(asked)) });
    if (asked.kind === 'draft') return reply(res, 200, { ok: true, ...(await b.draft(asked.id)) });
    if (asked.kind === 'send') return reply(res, 200, { ok: true, ...(await b.send(asked.id, { poNumber: asked.poNumber || null })) });
    if (asked.kind === 'paid_by_hand') return reply(res, 200, { ok: true, ...(await b.paidByHand(asked.id, asked.landedMinor ?? null)) });
    if (asked.kind === 'refund' || asked.kind === 'credit') return reply(res, 200, { ok: true, ...(await b.refundOrCredit(asked.id, asked.kind, asked.amount, asked.reason)) });
    // Only the live site ever sends: a preview claims nothing, so a reminder pressed there is still waiting on the live site.
    if (!maySend(env) || !canSend(env)) return reply(res, 200, { ok: false, reason: 'preview' });
    const r = await b.reminderToSend(asked.id, { again: asked.again === true });
    if (r.noAddress) return reply(res, 409, { ok: false, message: 'This invoice has no email address to send a reminder to, so add one and try again.' });
    if (r.unsure) return reply(res, 409, { ok: false, unsure: true, message: REMINDER_UNSURE });
    if (!r.reminder) return reply(res, 200, { ok: true, sent: false, already: Boolean(r.already), settled: Boolean(r.settled) });
    const outcome = await sendReminder(env, server, coach, { ...r, reminder: { ...r.reminder, text: asked.text || null } }).catch(() => 'unsure');
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
    return reply(res, e?.status || 502, { ok: false, ...(e?.calm ? { calm: true } : {}), message: e?.status ? e.message : DIDNT_WORK });
  }
}
