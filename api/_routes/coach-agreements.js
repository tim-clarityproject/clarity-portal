// /api/coach-agreements (Phase 6b run 3, plan section 5): the coach's agreement asks, with the coach's own sign-in and
// 6-digit code (054). The request and answer shapes are src/lib/agreements/asks.js's ASKS, never renamed.
//
//   POST { kind: 'send' | 'reopen' | 'approve' | 'ask_change' | 'send_sign_reminder' | 'send_first_payment_reminder' |
//          'extend' | 'pause' | 'end_early' | 'cancel_14' | 'answer_change' | 'sponsor_send' | 'team_agreements', ... }
//
// What the coach can do themselves is done AS THE CALLER (the database's rules decide: a version sent never changes, an
// agreement waiting for the owner's approval isn't sent, a signature is one's own). The server's key is used only for
// what 065 keeps for the server: a quote's number, sending and running-out day; reminders' claims; a sponsor's link;
// cancelling within 14 days (Stripe's refund and the credit note); marking changes answered; making each team member's
// agreement after the sponsor signs. Every email is claimed before it goes (a second press never sends it twice), comes
// from the coach's name with Reply-To the coach (risk 13), and goes only from the live site (maySend): elsewhere the ask
// still does its work and answers `emailed: false`. Nothing is sent by itself.
//
// Environment variables (Vercel): SUPABASE_SERVICE_ROLE_KEY, the Supabase URL and anon key, RESEND_API_KEY and
// COACH_EMAIL_FROM (or the guest one), STRIPE_SECRET_KEY (test mode, for cancel_14 only).
import { createHash, randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { codeRefusal } from '../_coachCode.js';
import { asCallerClient, canSend, emailFrom, fromAddress, supabaseOf } from '../_coachEmails.js';
import { maySend, oneAddress } from '../_guestEmails.js';
import { portalOrigin } from '../_portalOrigin.js';
import { addDays, dayIn, dayKeyWords, isZone } from '../../src/lib/time/index.js';
import { applies as coolingApplies, futureSessionRows, inWindow, refund14 } from '../../src/lib/agreements/coolingOff.js';
import { forStorage } from '../../src/lib/agreements/clauses.js';
import { moneyText } from '../../src/lib/agreements/currency.js';
import { pauseMove } from '../../src/lib/agreements/endDate.js';
import { quoteNumber, validUntil, VALID_DAYS } from '../../src/lib/agreements/quote.js';
import { counts, isOver } from '../../src/lib/agreements/sessionOutcome.js';
import { firstPayment, firstSigning } from '../../src/lib/agreements/settling.js';
import { perSession } from '../../src/lib/agreements/delivered.js';
import { blankTerms, kindOf, selfFunded } from '../../src/lib/agreements/terms.js';
import { versionFields } from '../../src/lib/coach/agreementBuilder.js';
import {
  readyToSignEmail, quoteEmail, signReminderEmail, firstPaymentReminderEmail, sponsorSignEmail, teamMemberAgreementEmail,
  extendedEmail, pausedEmail, endingEmail, cancelledEmail, changeReplyEmail,
} from '../../src/lib/email/agreementEmails.js';

export const config = { maxDuration: 60 };

const reply = (res, status, body) => { res.status(status).setHeader('Cache-Control', 'no-store'); res.json(body); };
export const DIDNT_WORK = 'That didn’t work. Try again in a moment.';
export const REMINDER_UNSURE = 'We couldn’t confirm that reminder went. Check before sending again.';
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const LONDON = 'Europe/London';
export const KINDS = Object.freeze(['send', 'reopen', 'approve', 'ask_change', 'send_sign_reminder', 'send_first_payment_reminder', 'extend', 'pause',
  'end_early', 'cancel_14', 'answer_change', 'sponsor_send', 'team_agreements']);

/** A calm refusal: its status and words, passed to the page as they are (asks.js reads `calm: true`). */
export function calm(status, message, extra = {}) {
  const e = new Error(message);
  e.status = status;
  e.calm = true;
  Object.assign(e, extra);
  return e;
}
const notYours = () => calm(403, 'That isn’t yours to change.');

const realDay = (d) => {
  if (!DAY.test(String(d || ''))) return false;
  const [y, m, dd] = String(d).split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, dd));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === dd && d >= '2000-01-01' && d <= '2100-12-31';
};
const id = (v) => (UUID.test(String(v || '')) ? String(v).toLowerCase() : null);
const words = (v, max) => (typeof v === 'string' ? v.replace(/\r\n?/g, '\n').trim().slice(0, max) : '');

/** The ask's fields, checked: null when it isn't one this route answers, or the wrong shape. */
export function askedFor(body) {
  const b = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  if (!KINDS.includes(b.kind)) return null;
  const k = b.kind;
  if (k === 'send') {
    const agreementId = id(b.agreementId);
    const versionId = id(b.versionId);
    if (!agreementId || !versionId) return null;
    const sendAs = b.sendAs === 'quote' ? 'quote' : 'agreement';
    let newSignature = null;
    if (b.newSignature && typeof b.newSignature === 'object') {
      const s = b.newSignature;
      if (s.kind === 'drawn' && typeof s.image === 'string' && /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(s.image) && s.image.length <= 300000) newSignature = { kind: 'drawn', image: s.image };
      else if (s.kind === 'typed' && typeof s.typedName === 'string' && s.typedName.trim().length >= 3 && s.typedName.trim().length <= 160) newSignature = { kind: 'typed', typedName: s.typedName.trim() };
      else return null;
    }
    const signatureId = id(b.signatureId);
    if (!signatureId && !newSignature) return null;
    const validDays = b.validDays == null ? 30 : Number(b.validDays);
    if (sendAs === 'quote' && !VALID_DAYS.includes(validDays)) return null;
    return { kind: k, agreementId, versionId, signatureId, newSignature, personalNote: words(b.personalNote, 1000), sendAs, validDays };
  }
  if (k === 'reopen') {
    const versionId = id(b.versionId);
    const quoteId = id(b.quoteId);
    if (!versionId === !quoteId) return null;
    const days = b.days == null ? null : Number(b.days);
    if (days != null && !VALID_DAYS.includes(days)) return null;
    return { kind: k, versionId, quoteId, days };
  }
  if (k === 'cancel_14') {
    // A one-off's part delivered so far, as the coach says it (minor units), where coaching started inside the 14 days.
    const agreementId = id(b.agreementId);
    const d = b.deliveredMinor;
    if (d != null && d !== '' && !(typeof d === 'number' && Number.isInteger(d) && d >= 0 && d <= 100000000)) return null;
    return agreementId ? { kind: k, agreementId, deliveredMinor: d == null || d === '' ? null : d } : null;
  }
  if (k === 'approve' || k === 'team_agreements') {
    const agreementId = id(b.agreementId);
    return agreementId ? { kind: k, agreementId } : null;
  }
  if (k === 'ask_change') {
    const agreementId = id(b.agreementId);
    const note = words(b.note, 1000);
    return agreementId && note ? { kind: k, agreementId, note } : null;
  }
  if (k === 'send_sign_reminder' || k === 'send_first_payment_reminder') {
    const versionId = id(b.versionId);
    if (!versionId) return null;
    const reminder = k === 'send_first_payment_reminder' ? 'first_payment' : b.reminder;
    if (!['sign_3', 'sign_7', 'first_payment'].includes(reminder)) return null;
    return { kind: k, versionId, reminder, text: words(b.text, 4000) || null, again: b.again === true };
  }
  if (k === 'extend') {
    const agreementId = id(b.agreementId);
    return agreementId && realDay(b.endsOn) ? { kind: k, agreementId, endsOn: b.endsOn } : null;
  }
  if (k === 'pause') {
    const agreementId = id(b.agreementId);
    return agreementId && realDay(b.from) && realDay(b.to) && b.to > b.from ? { kind: k, agreementId, from: b.from, to: b.to } : null;
  }
  if (k === 'end_early') {
    const agreementId = id(b.agreementId);
    const by = b.by === 'coach' ? 'coach' : b.by === 'client' ? 'client' : null;
    return agreementId && by && realDay(b.endsOn) ? { kind: k, agreementId, endsOn: b.endsOn, by } : null;
  }
  if (k === 'answer_change') {
    const ids = Array.isArray(b.requestIds) ? [...new Set(b.requestIds.map(id).filter(Boolean))] : [];
    if (!ids.length || ids.length > 20 || ids.length !== b.requestIds.length) return null;
    return { kind: k, requestIds: ids, reply: words(b.reply, 4000) || null };
  }
  if (k === 'sponsor_send') {
    const agreementId = id(b.agreementId);
    const versionId = id(b.versionId);
    const s = b.sponsor && typeof b.sponsor === 'object' ? b.sponsor : {};
    const name = words(s.name, 160);
    const email = oneAddress(s.email).toLowerCase();
    if (!agreementId || !versionId || name.length < 2 || !email) return null;
    return { kind: k, agreementId, versionId, sponsor: { name, email, role: words(s.role, 120) || null } };
  }
  return null;
}

/** The newest standard version of each clause for a kind (065's agreement_clause_standards rows): clauses.js's `standards`. */
export function standardsOf(rows, kind) {
  const out = {};
  for (const r of rows || []) {
    if (r.agreement_kind !== kind) continue;
    if (!out[r.clause_key] || r.version > out[r.clause_key].version) out[r.clause_key] = { version: r.version, title: r.title, paragraphs: r.paragraphs };
  }
  return out;
}

/** The practice's standard wording for a kind, as a coach reads it: their own and the owner's versions (065's policy). */
export async function standardsFor(server, coachId, kind, { asOf = null } = {}) {
  const { data: owners } = await server.from('coaches').select('id').eq('role', 'owner');
  const ids = [...new Set([coachId, ...(owners || []).map((o) => o.id)])];
  let q = server.from('agreement_clause_standards').select('*').eq('agreement_kind', kind).in('coach_id', ids);
  // The wording as it stood at a moment (a quote's as sent: the break-it tester, run 3, finding 9).
  if (asOf) q = q.lte('created_at', asOf);
  const { data: rows } = await q;
  return standardsOf(rows, kind);
}

/** JSON with its keys in order, so stored jsonb (which reorders keys) compares with what the code builds. */
export function canonical(value) {
  const walk = (x) => (Array.isArray(x) ? x.map(walk)
    : x && typeof x === 'object' ? Object.fromEntries(Object.keys(x).sort().filter((k) => x[k] !== undefined).map((k) => [k, walk(x[k])])) : x);
  return JSON.stringify(walk(JSON.parse(JSON.stringify(value ?? null))));
}

/**
 * A builder version's wording and total as the server builds them from its terms, its own overrides and the practice's
 * standards (the builder's own versionFields), or null for run 1's versions (no terms.kind), which are as written. The
 * break-it tester, run 3, finding 5: nobody puts clause text or a total past Send or approval that the terms don't make.
 */
export async function rebuiltFields(server, coachId, v) {
  const t = v?.terms || {};
  if (!t.kind) return null;
  const standards = await standardsFor(server, coachId, kindOf(t));
  const f = versionFields(t, { standards, overrides: v.overrides || {} });
  return { clauses: f.clauses, total_minor: f.total_minor, same: canonical(f.clauses) === canonical(v.clauses) && Number(f.total_minor) === Number(v.total_minor) };
}

// ---------------------------------------------------------------- sending email (Resend, the coach's name, Reply-To)

/** "Tim Dutton <portal@…>": the coach's name with the portal's own sending address (never the coach's: it isn't verified). */
export function fromWithName(env, name) {
  const raw = fromAddress(env);
  const address = (/<([^>]+)>/.exec(raw)?.[1] || raw).trim();
  const clean = String(name || '').replace(/["<>\r\n]/g, '').trim().slice(0, 80);
  return clean && address ? `${clean} <${address}>` : raw;
}

/**
 * Sends one document from the coach: { to, doc, fromName, replyTo, files: [{ filename, content (base64) }] }.
 * 'sent' | 'refused' (it never went: may be sent again) | 'unsure' (no answer: never sent again without checking) |
 * 'skipped' (not the live site, or no email service: nothing went).
 */
export async function sendAs(env, { to, doc, fromName, replyTo = null, files = [] }, { fetcher = globalThis.fetch, timeoutMs = 15000 } = {}) {
  if (!maySend(env) || !canSend(env)) return 'skipped';
  const address = oneAddress(to);
  if (!address) return 'refused';
  const { subject, html, text, attachments } = emailFrom(doc);
  try {
    const r = await fetcher('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.RESEND_API_KEY}` },
      body: JSON.stringify({
        from: fromWithName(env, fromName), to: [address], subject, html, text,
        ...(oneAddress(replyTo) ? { reply_to: oneAddress(replyTo) } : {}),
        attachments: [...attachments, ...files.map((f) => ({ filename: f.filename, content: f.content }))],
      }),
      ...(timeoutMs > 0 ? { signal: AbortSignal.timeout(timeoutMs) } : {}),
    });
    if (r.ok) return 'sent';
    return r.status >= 400 && r.status < 500 && r.status !== 429 ? 'refused' : 'unsure';
  } catch {
    return 'unsure';
  }
}

// ---------------------------------------------------------------- the asks

/**
 * The agreement asks for one coach. `db` reads and writes as the caller (the database's rules decide); `server` is the
 * server's own client, used only where 065 keeps the step for the server. Shared with the link pages (a sponsor signing
 * starts the team's agreements: `db` is then the server, for the link's own coach) and the tests.
 * @param {{ db: object, server: object, coach: { id: string, role: string, user_id?: string }, env?: object, origin?: string,
 *   stripe?: object|null, billing?: object|null, now?: () => Date, send?: Function }} o
 */
export function agreementsApi({ db, server, coach, env = {}, origin = 'https://portal.theclarityproject.co.uk', stripe = null, billing = null, now = () => new Date(), send = sendAs }) {
  const today = (zone = LONDON) => dayIn(isZone(zone) ? zone : LONDON, now());
  const iso = () => now().toISOString();
  const must = async (q) => { const r = await q; if (r?.error) throw r.error; return r.data; };

  async function mine(table, rowId) {
    const { data } = await db.from(table).select('*').eq('id', rowId).maybeSingle();
    if (!data || (data.coach_id && data.coach_id !== coach.id)) throw notYours();
    return data;
  }
  async function me() {
    const { data } = await server.from('coaches').select('id, user_id, display_first_name, email').eq('id', coach.id).maybeSingle();
    return data || {};
  }
  async function profileOf(profileId) {
    if (!profileId) return null;
    const { data } = await server.from('client_profiles').select('id, coach_id, name, email, time_zone, user_id, organisation_id').eq('id', profileId).maybeSingle();
    return data && data.coach_id === coach.id ? data : null;
  }
  const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || '';
  const coachName = (c, t) => t?.coachName || c.display_first_name || '';

  /** One email from the coach: their name, Reply-To their own address. */
  async function mail(to, doc, { files = [], who = null } = {}) {
    const c = who || await me();
    return send(env, { to, doc, fromName: c.full_name || c.display_first_name || '', replyTo: c.email || null, files });
  }

  /** The newest saved signature of the coach (as the caller: one's own only). */
  async function signatureFor(asked) {
    if (asked.newSignature) {
      const row = asked.newSignature.kind === 'drawn'
        ? { user_id: coach.user_id, kind: 'drawn', image: asked.newSignature.image }
        : { user_id: coach.user_id, kind: 'typed', typed_name: asked.newSignature.typedName };
      const made = await must(db.from('signatures').insert(row).select('id'));
      return made?.[0]?.id || null;
    }
    const { data } = await db.from('signatures').select('id, user_id').eq('id', asked.signatureId).maybeSingle();
    if (!data || (coach.user_id && data.user_id !== coach.user_id)) throw calm(403, 'Sign with your own signature.');
    return data.id;
  }

  /** Database refusals in their own calm words (065's guards), anything else as "didn't work". */
  const fromDb = (error) => {
    const code = String(error?.code || '');
    const message = typeof error?.message === 'string' && error.message.length < 200 ? error.message : '';
    if (['42501', '23514', 'CC409', '22023'].includes(code) && message) return calm(code === '42501' ? 403 : 409, message);
    return error;
  };

  /** A draft version sent as the agreement, as the caller: claimed by moving draft to sent (a second press finds it sent). */
  async function sendVersion(a, v, signatureId, note, expiryDays) {
    const sentAt = iso();
    const expiresOn = addDays(today(), [14, 30, 60].includes(Number(expiryDays)) ? Number(expiryDays) : 30);
    const r = await db.from('agreement_versions').update({ status: 'sent', coach_signed_at: sentAt, coach_signature_id: signatureId, sent_at: sentAt,
      personal_note: note || null, send_as: 'agreement', expires_on: expiresOn }).eq('id', v.id).eq('status', 'draft').select('id');
    if (r.error) throw fromDb(r.error);
    if (!r.data?.length) return null;
    // The agreement now points at this version; any earlier one still waiting is replaced.
    const ag = await db.from('agreements').update({ current_version: v.version, ...(a.status === 'draft' ? { status: 'sent' } : {}) }).eq('id', a.id).select('id');
    if (ag.error) throw fromDb(ag.error);
    await db.from('agreement_versions').update({ status: 'superseded' }).eq('agreement_id', a.id).eq('status', 'sent').neq('id', v.id);
    // A new version answers the changes asked for on the earlier ones (plan section 5).
    const { data: others } = await server.from('agreement_versions').select('id').eq('agreement_id', a.id).neq('id', v.id);
    const ids = (others || []).map((o) => o.id);
    if (ids.length) await server.from('agreement_change_requests').update({ answered_at: sentAt }).in('version_id', ids).is('answered_at', null);
    return { sentAt, expiresOn };
  }

  const linkTo = (path) => `${origin}${path}`;

  /**
   * The end the agreement has now: a date moved by Extend or Pause (agreements.ends_on, the lead's addition to 065; before
   * it, ending_on with no `ending_by`), else the version's own.
   */
  const currentEnd = (a, v) => a.ends_on || (a.ending_on && !a.ending_by ? a.ending_on : null) || v.terms?.endsOn || null;
  /**
   * Keeps a moved end date in ends_on, or, while that column isn't there yet, in ending_on with no `ending_by`. Written
   * by the server (065's guard keeps a coach's own writes from moving ends_on), only after `mine` found the agreement
   * the caller's.
   */
  async function moveEnd(agreementId, day) {
    const r = await server.from('agreements').update({ ends_on: day }).eq('id', agreementId);
    if (!r?.error) return;
    if (!['PGRST204', '42703'].includes(String(r.error.code || ''))) throw fromDb(r.error);
    await must(db.from('agreements').update({ ending_on: day, ending_by: null }).eq('id', agreementId));
  }

  return {
    /** Send: the agreement (coach-signed, emailed Ready to sign) or a quote (its Q- number now, emailed with its link). */
    async send(asked) {
      const a = await mine('agreements', asked.agreementId);
      let v = await mine('agreement_versions', asked.versionId);
      if (v.agreement_id !== a.id) throw notYours();
      // A coach who isn't the owner sends only a version the owner approved (the break-it tester, run 3, finding 6);
      // a quote included. The database holds the same line for agreements (065's _agreement_send_ok).
      if (coach.role !== 'owner' && v.status === 'draft') {
        // Approval is of this version exactly as it stands (065's approved_print).
        const print = await db.rpc('_version_print', { p_terms: v.terms, p_clauses: v.clauses, p_total: v.total_minor, p_overrides: v.overrides,
          p_currency: v.currency, p_funded_by: v.funded_by });
        if (print.error || !(a.approval === 'approved' && Number(a.approved_version) === Number(v.version) && a.approved_print === print.data)) {
          throw calm(403, 'This agreement goes once your practice’s owner approves it.');
        }
      }
      // A quote shows the price, so it is never sent to someone their organisation funds (finding 8: agreements rule 12).
      if (asked.sendAs === 'quote' && (v.funded_by || !selfFunded(v.terms || {}))) {
        throw calm(409, 'A quote shows the price, so it goes only to clients who fund their own coaching. Send the agreement to sign instead.');
      }
      // The wording and total sent are the ones its terms make (finding 5): a draft's are rebuilt and kept before it goes.
      if (v.status === 'draft') {
        const r = await rebuiltFields(server, a.coach_id, v);
        // An associate's was approved as it stands, so it is refused rather than changed after approval.
        if (r && !r.same && coach.role !== 'owner') throw calm(409, 'This agreement’s wording doesn’t match its terms. Open it in the builder and sign it again.');
        if (r && !r.same) {
          const kept = await db.from('agreement_versions').update({ clauses: r.clauses, total_minor: r.total_minor }).eq('id', v.id).eq('status', 'draft').select('*');
          if (kept.error) throw fromDb(kept.error);
          if (kept.data?.[0]) v = kept.data[0];
        }
      }
      if (a.kind === 'sponsor') {
        // A team's sponsor agreement (Group B's builder): Send signs and sends the version; sponsor_send then makes the
        // sponsor's own link and emails it. Nothing is emailed here.
        if (asked.sendAs === 'quote') throw calm(409, 'A sponsor’s agreement is sent to the sponsor to sign, not as a quote.');
        if (v.status !== 'draft') return { sentAt: v.sent_at, expiresOn: v.expires_on, emailed: false, already: true };
        const sent = await sendVersion(a, v, await signatureFor(asked), asked.personalNote, (v.terms || {}).expiryDays);
        return sent ? { ...sent, emailed: false } : { sentAt: v.sent_at, expiresOn: v.expires_on, emailed: false, already: true };
      }
      const terms = v.terms || {};
      const c = await me();
      const profile = await profileOf(a.profile_id);
      const to = profile?.email || terms.team?.sponsor?.email || '';
      const first = firstName(profile?.name || terms.clientFirst || terms.clientName || terms.team?.sponsor?.name);
      if (asked.sendAs === 'quote') {
        const { data: existing } = await db.from('agreement_quotes').select('*').eq('version_id', v.id).maybeSingle();
        if (existing && existing.status !== 'draft' && existing.status !== 'withdrawn') {
          return { sentAt: existing.sent_at, expiresOn: null, quoteId: existing.id, quoteNumber: existing.number, emailed: false, already: true };
        }
        if (v.status !== 'draft') throw calm(409, 'This version has been sent already. Make a new version to quote.');
        const signatureId = await signatureFor(asked);
        const held = await db.from('agreement_versions').update({ personal_note: asked.personalNote || null, send_as: 'quote', coach_signature_id: signatureId })
          .eq('id', v.id).eq('status', 'draft').select('id');
        if (held.error) throw fromDb(held.error);
        let q = existing && existing.status === 'draft' ? existing : null;
        if (!q) {
          const made = await db.from('agreement_quotes').insert({ coach_id: coach.id, agreement_id: a.id, version_id: v.id, valid_days: asked.validDays, coach_signature_id: signatureId, status: 'draft' }).select('*');
          if (made.error) {
            // A quote withdrawn before keeps the version's place: it's made a draft again by the server.
            if (existing?.status === 'withdrawn') {
              await must(server.from('agreement_quotes').update({ status: 'draft', valid_days: asked.validDays, coach_signature_id: signatureId }).eq('id', existing.id).eq('status', 'withdrawn'));
              q = { ...existing, status: 'draft' };
            } else throw fromDb(made.error);
          } else [q] = made.data;
        } else if (q.valid_days !== asked.validDays || q.coach_signature_id !== signatureId) {
          await must(db.from('agreement_quotes').update({ valid_days: asked.validDays, coach_signature_id: signatureId }).eq('id', q.id).eq('status', 'draft'));
        }
        const sentAt = iso();
        const until = validUntil(today(), asked.validDays);
        const claimed = await must(server.from('agreement_quotes').update({ status: 'sent', sent_at: sentAt, valid_until: until, valid_days: asked.validDays })
          .eq('id', q.id).eq('status', 'draft').eq('coach_id', coach.id).select('id'));
        if (!claimed?.length) {
          const { data: now2 } = await server.from('agreement_quotes').select('*').eq('id', q.id).maybeSingle();
          return { sentAt: now2?.sent_at || null, expiresOn: null, quoteId: q.id, quoteNumber: now2?.number ?? null, emailed: false, already: true };
        }
        const { data: number, error } = await server.rpc('quote_take_number', { p_quote: q.id });
        if (error || !Number.isInteger(number)) throw new Error('number');
        const { data: token } = await server.from('agreement_quotes').select('share_token').eq('id', q.id).maybeSingle();
        const outcome = to && token?.share_token ? await mail(to, quoteEmail({ firstName: first, coachFirst: c.display_first_name, note: asked.personalNote,
          link: linkTo(`/quote/${token.share_token}`), number: quoteNumber(number), validUntilWords: dayKeyWords(until, { year: true }) }), { who: { ...c, full_name: coachName(c, terms) } }) : 'refused';
        return { sentAt, expiresOn: null, quoteId: q.id, quoteNumber: number, validUntil: until, emailed: outcome === 'sent' };
      }
      if (v.status !== 'draft') return { sentAt: v.sent_at, expiresOn: v.expires_on, emailed: false, already: true };
      if (!a.profile_id) throw calm(409, 'An organisation’s agreement goes to its sponsor.');
      const signatureId = await signatureFor(asked);
      const sent = await sendVersion(a, v, signatureId, asked.personalNote, terms.expiryDays);
      if (!sent) return { sentAt: v.sent_at, expiresOn: v.expires_on, emailed: false, already: true };
      const outcome = to ? await mail(to, readyToSignEmail({ firstName: first, coachFirst: c.display_first_name, note: asked.personalNote,
        link: linkTo(`/coaching/agreement/${v.id}`) }), { who: { ...c, full_name: coachName(c, terms) } }) : 'refused';
      return { ...sent, emailed: outcome === 'sent' };
    },

    /** Reopen an agreement or a quote that ran out, in one step, for its 14, 30 or 60 days again. */
    async reopen(asked) {
      if (asked.quoteId) {
        const q = await mine('agreement_quotes', asked.quoteId);
        const { data: v } = await server.from('agreement_versions').select('terms, status').eq('id', q.version_id).maybeSingle();
        if (q.status === 'accepted' || v?.status !== 'draft') throw calm(409, 'This quote is already an agreement.');
        if (q.status === 'withdrawn' || q.status === 'draft') throw calm(409, 'This quote hasn’t been sent. Send it from the builder.');
        const ran = q.status === 'expired' || (q.status === 'sent' && q.valid_until && q.valid_until < today());
        if (!ran) throw calm(409, 'This quote is still open.');
        const until = validUntil(today(), asked.days || q.valid_days || 30);
        await must(server.from('agreement_quotes').update({ status: 'sent', valid_until: until, reopened_at: iso(), ...(asked.days ? { valid_days: asked.days } : {}) })
          .eq('id', q.id).eq('coach_id', coach.id).in('status', ['sent', 'expired']));
        return { validUntil: until };
      }
      const v = await mine('agreement_versions', asked.versionId);
      const a = await mine('agreements', v.agreement_id);
      if (v.client_signed_at || v.status !== 'sent') throw calm(409, 'Only an agreement that hasn’t been signed can be opened again.');
      const ran = a.status === 'expired' || (v.expires_on && v.expires_on < today());
      if (!ran) throw calm(409, 'This agreement hasn’t run out.');
      const expiresOn = addDays(today(), asked.days || Number(v.terms?.expiryDays) || 30);
      await must(server.from('agreement_versions').update({ expires_on: expiresOn }).eq('id', v.id).eq('status', 'sent'));
      if (a.status === 'expired') await must(server.from('agreements').update({ status: 'sent' }).eq('id', a.id).eq('status', 'expired'));
      return { expiresOn };
    },

    /** The owner approves an associate's agreement, and it goes to the client from the associate. */
    async approve(asked) {
      if (coach.role !== 'owner') throw calm(403, 'Only the owner can do that.');
      // What is approved is what its terms make (the break-it tester, run 3, finding 5): wording or a total stored by hand
      // that the terms don't make is never approved or sent; its total is the terms' own.
      {
        const { data: a0 } = await server.from('agreements').select('id, coach_id, current_version, approval').eq('id', asked.agreementId).maybeSingle();
        const { data: v0 } = a0 ? await server.from('agreement_versions').select('*').eq('agreement_id', a0.id).eq('version', a0.current_version).maybeSingle() : { data: null };
        if (a0 && v0 && v0.status === 'draft' && a0.approval === 'waiting') {
          const r = await rebuiltFields(server, a0.coach_id, v0);
          if (r && canonical(r.clauses) !== canonical(v0.clauses)) {
            const { data: who } = await server.from('coaches').select('display_first_name').eq('id', a0.coach_id).maybeSingle();
            throw calm(409, `This agreement’s wording doesn’t match its terms, so it can’t be approved. Ask ${who?.display_first_name || 'them'} to open it in the builder and sign it again.`);
          }
          if (r && Number(r.total_minor) !== Number(v0.total_minor)) await must(server.from('agreement_versions').update({ total_minor: r.total_minor }).eq('id', v0.id).eq('status', 'draft'));
        }
      }
      const ok = await db.rpc('agreement_approve', { p_agreement: asked.agreementId, p_ok: true, p_note: null });
      if (ok.error) throw fromDb(ok.error);
      const { data: a } = await server.from('agreements').select('*').eq('id', asked.agreementId).maybeSingle();
      const { data: v } = a ? await server.from('agreement_versions').select('*').eq('agreement_id', a.id).eq('version', a.current_version).maybeSingle() : { data: null };
      if (!a || !v || v.status !== 'draft' || !v.coach_signature_id || v.send_as === 'quote') return { sentAt: null, emailed: false };
      const sentAt = iso();
      const expiresOn = addDays(today(), Number(v.terms?.expiryDays) || 30);
      const r = await must(server.from('agreement_versions').update({ status: 'sent', coach_signed_at: sentAt, sent_at: sentAt, expires_on: expiresOn })
        .eq('id', v.id).eq('status', 'draft').select('id'));
      if (!r?.length) return { sentAt: v.sent_at || null, emailed: false };
      await must(server.from('agreements').update({ current_version: v.version, ...(a.status === 'draft' ? { status: 'sent' } : {}) }).eq('id', a.id));
      const { data: assoc } = await server.from('coaches').select('id, display_first_name, email').eq('id', a.coach_id).maybeSingle();
      const { data: p } = a.profile_id ? await server.from('client_profiles').select('name, email').eq('id', a.profile_id).maybeSingle() : { data: null };
      const outcome = p?.email && assoc ? await send(env, { to: p.email, doc: readyToSignEmail({ firstName: firstName(p.name), coachFirst: assoc.display_first_name,
        note: v.personal_note || '', link: linkTo(`/coaching/agreement/${v.id}`) }), fromName: v.terms?.coachName || assoc.display_first_name, replyTo: assoc.email }) : 'refused';
      return { sentAt, emailed: outcome === 'sent' };
    },

    /** The owner asks the associate to change it (their own words, shown on the associate's agreement). */
    async askChange(asked) {
      if (coach.role !== 'owner') throw calm(403, 'Only the owner can do that.');
      const r = await db.rpc('agreement_approve', { p_agreement: asked.agreementId, p_ok: false, p_note: asked.note });
      if (r.error) throw fromDb(r.error);
      return {};
    },

    /**
     * A drafted reminder, sent on the coach's Send (claimed with 065's sending_at first): a signing reminder (3 or 7 days)
     * or the first payment's. `text`: the coach's own words after Edit.
     */
    async sendReminder(asked) {
      const v = await mine('agreement_versions', asked.versionId);
      const a = await mine('agreements', v.agreement_id);
      const terms = v.terms || {};
      if (asked.reminder !== 'first_payment' && (v.client_signed_at || v.status !== 'sent')) throw calm(409, 'This agreement is already signed, so no reminder is needed.');
      let amount = 0;
      if (asked.reminder === 'first_payment') {
        if (!v.client_signed_at || !selfFunded({ ...terms, fundedBy: v.funded_by })) throw calm(409, 'There’s no first payment to remind about.');
        if (['cancelled', 'expired', 'ended', 'ended_not_renewed'].includes(a.status)) throw calm(409, 'This agreement doesn’t run any more, so there’s no first payment to remind about.');
        // The agreement's first payment, whichever version it was made from (an amendment's is the first signing's:
        // the break-it tester, run 3, finding 2).
        const { data: firsts } = await server.from('invoices').select('status, total_minor, instalment_n').eq('agreement_id', a.id).in('kind', ['first_payment', 'deposit', 'instalment']);
        const live = (firsts || []).filter((i) => (i.instalment_n ?? 1) === 1 && i.status !== 'void');
        if (live.some((i) => i.status === 'paid')) throw calm(409, 'The first payment is settled already.');
        const { data: all } = await server.from('agreement_versions').select('*').eq('agreement_id', a.id);
        const base = firstSigning(all || [])?.version || v;
        amount = live[0]?.total_minor ?? firstPayment({ ...(base.terms || {}), fundedBy: base.funded_by }, base.settle_choice || 'upfront', base.terms?.extrasChosen || []);
      }
      if (!maySend(env) || !canSend(env)) return { sentAt: null, preview: true };
      const profile = await profileOf(a.profile_id);
      if (!profile?.email) throw calm(409, 'This client has no email address to send a reminder to, so add one and try again.');
      let { data: rem } = await server.from('agreement_reminders').select('*').eq('version_id', v.id).eq('kind', asked.reminder).maybeSingle();
      if (!rem) {
        await server.from('agreement_reminders').insert({ coach_id: coach.id, version_id: v.id, kind: asked.reminder });
        ({ data: rem } = await server.from('agreement_reminders').select('*').eq('version_id', v.id).eq('kind', asked.reminder).maybeSingle());
      }
      if (!rem || rem.coach_id !== coach.id) throw notYours();
      if (rem.sent_at) return { sentAt: rem.sent_at, already: true };
      const at = iso();
      let claim = server.from('agreement_reminders').update({ sending_at: at }).eq('id', rem.id).is('sent_at', null);
      claim = rem.sending_at
        ? (asked.again && now().getTime() - Date.parse(rem.sending_at) >= 120000 ? claim.eq('sending_at', rem.sending_at) : null)
        : claim.is('sending_at', null);
      if (!claim) throw calm(409, REMINDER_UNSURE, { unsure: true });
      const claimed = await must(claim.select('id'));
      if (!claimed?.length) return { sentAt: null, already: true };
      const c = await me();
      const doc = asked.reminder === 'first_payment'
        ? firstPaymentReminderEmail({ firstName: firstName(profile.name), coachFirst: c.display_first_name, link: linkTo(`/coaching/agreement/${v.id}/settle`),
          amountWords: moneyText(amount, v.currency || terms.currency || 'GBP'), lines: asked.text })
        : signReminderEmail({ firstName: firstName(profile.name), coachFirst: c.display_first_name, link: linkTo(`/coaching/agreement/${v.id}`), lines: asked.text });
      const outcome = await mail(profile.email, doc, { who: { ...c, full_name: coachName(c, terms) } });
      if (outcome === 'sent') {
        await server.from('agreement_reminders').update({ sent_at: iso(), sending_at: null }).eq('id', rem.id);
        return { sentAt: iso() };
      }
      if (outcome === 'refused') {
        await server.from('agreement_reminders').update({ sending_at: null }).eq('id', rem.id).eq('sending_at', at);
        throw calm(502, 'That reminder didn’t send. Check your connection and try again.');
      }
      throw calm(502, REMINDER_UNSURE, { unsure: true });
    },

    /** Extend the end date (a picked date, kept in 065's agreements.ends_on: moveEnd). */
    async extend(asked) {
      const a = await mine('agreements', asked.agreementId);
      const { v, profile, c } = await this._current(a);
      const end = currentEnd(a, v);
      if (end && asked.endsOn <= end) throw calm(409, 'Choose an end date after the current one.');
      await moveEnd(a.id, asked.endsOn);
      const outcome = profile?.email ? await mail(profile.email, extendedEmail({ firstName: firstName(profile.name), coachFirst: c.display_first_name,
        endWords: dayKeyWords(asked.endsOn, { year: true }) }), { who: { ...c, full_name: coachName(c, v.terms) } }) : 'refused';
      return { endsOn: asked.endsOn, emailed: outcome === 'sent' };
    },

    /** Pause: the end moves on by the time paused (endDate.pauseMove). */
    async pause(asked) {
      const a = await mine('agreements', asked.agreementId);
      const { v, profile, c } = await this._current(a);
      if (v.terms?.pausing === false) throw calm(409, 'This agreement doesn’t allow pausing.');
      const end = currentEnd(a, v);
      if (!end) throw calm(409, 'This agreement has no end date to move.');
      const moved = pauseMove(end, asked.from, asked.to);
      if (!moved.ok) throw calm(400, moved.line);
      await must(db.from('agreements').update({ paused_from: asked.from, paused_to: asked.to }).eq('id', a.id));
      await moveEnd(a.id, moved.end);
      const outcome = profile?.email ? await mail(profile.email, pausedEmail({ firstName: firstName(profile.name), coachFirst: c.display_first_name,
        fromWords: dayKeyWords(asked.from, { year: true }), toWords: dayKeyWords(asked.to, { year: true }), endWords: dayKeyWords(moved.end, { year: true }) }),
      { who: { ...c, full_name: coachName(c, v.terms) } }) : 'refused';
      return { endsOn: moved.end, emailed: outcome === 'sent' };
    },

    /** End early: the day and who asked for it. */
    async endEarly(asked) {
      const a = await mine('agreements', asked.agreementId);
      const { v, profile, c } = await this._current(a);
      if (asked.endsOn < today()) throw calm(409, 'Choose today or a later day.');
      await must(db.from('agreements').update({ ending_on: asked.endsOn, ending_by: asked.by }).eq('id', a.id));
      const outcome = profile?.email ? await mail(profile.email, endingEmail({ firstName: firstName(profile.name), coachFirst: c.display_first_name,
        endWords: dayKeyWords(asked.endsOn, { year: true }), by: asked.by }), { who: { ...c, full_name: coachName(c, v.terms) } }) : 'refused';
      return { endingOn: asked.endsOn, emailed: outcome === 'sent' };
    },

    async _current(a) {
      if (a.status !== 'signed') throw calm(409, 'Only a signed agreement can be changed this way.');
      const { data: v } = await db.from('agreement_versions').select('*').eq('agreement_id', a.id).eq('version', a.current_version).maybeSingle();
      if (!v || v.coach_id !== coach.id) throw notYours();
      return { v, profile: await profileOf(a.profile_id), c: await me() };
    },

    /**
     * Cancel within 14 days (brief item 13): the refund is everything settled, or, with the start-now tick, less the
     * coaching sessions had at the agreement's per-session price; refunded through Stripe with its credit note, the open
     * invoices voided, the agreement cancelled. Never for an agreement funded by an organisation. Claimed once (065's
     * agreement_cancellations is one per agreement), so a second press refunds nothing more.
     */
    async cancel14(asked) {
      const a = await mine('agreements', asked.agreementId);
      if (a.status === 'cancelled') {
        const { data: done } = await server.from('agreement_cancellations').select('*').eq('agreement_id', a.id).maybeSingle();
        return { refundMinor: Number(done?.refund_minor) || 0, currency: 'GBP', creditNoteNumber: null, emailed: false, already: true, sessionsOff: 0, removed: [], calls: [] };
      }
      const { v, profile, c } = await this._current(a);
      const terms = { ...(v.terms || {}), fundedBy: v.funded_by };
      if (!coolingApplies(terms)) throw calm(409, 'The 14 days are only for clients who fund their own coaching.');
      const zone = isZone(profile?.time_zone) ? profile.time_zone : LONDON;
      // The 14 days and the start-now tick go by the agreement's FIRST signing: a later signed version is an amendment
      // and never starts them again (agreements rule 12).
      const { data: allVersions } = await server.from('agreement_versions').select('*').eq('agreement_id', a.id);
      const firstSigned = firstSigning(allVersions || [], zone);
      if (!firstSigned) throw calm(409, 'Only a signed agreement can be changed this way.');
      const signedDay = firstSigned.day;
      const startNow = firstSigned.version.start_now === true;
      if (!inWindow(signedDay, today(zone))) throw calm(409, 'The 14 days to change their mind have passed.');
      const currency = v.currency || terms.currency || 'GBP';
      const { data: invs } = await server.from('invoices').select('*').eq('agreement_id', a.id);
      const invIds = (invs || []).map((i) => i.id);
      const { data: notes } = invIds.length ? await server.from('credit_notes').select('invoice_id, amount_minor').in('invoice_id', invIds) : { data: [] };
      const credited = (invId) => (notes || []).filter((n) => n.invoice_id === invId).reduce((s, n) => s + Number(n.amount_minor), 0);
      const paidInvs = (invs || []).filter((i) => i.status === 'paid' && i.coach_id === coach.id)
        .map((i) => ({ ...i, left: Number(i.paid_minor) - credited(i.id) })).filter((i) => i.left > 0)
        .sort((x, y) => String(y.paid_at || '').localeCompare(String(x.paid_at || '')));
      const paid = paidInvs.reduce((s, i) => s + i.left, 0);
      const since = Date.parse(firstSigned.version.client_signed_at);
      const { data: sess } = a.profile_id ? await server.from('coach_sessions').select('*').eq('profile_id', a.profile_id).eq('coach_id', coach.id) : { data: [] };
      const had = (sess || []).filter((s) => (s.kind || 'coaching') === 'coaching' && counts(s) && isOver(s, now().getTime()) && Date.parse(s.starts_at) >= since).length;
      // What was delivered, at the one per-session price (delivered.js): set sessions and a retainer, each session had;
      // a block of hours, the hours logged at its rate; a one-off, the part the coach says was delivered (else nothing,
      // so a full refund).
      const k = kindOf(terms);
      let perSessionPrice = 0;
      let sessionsHad = had;
      let deliveredExtra = 0;
      if (k === 'sessions' || k === 'retainer') perSessionPrice = perSession(terms, firstSigned.version.settle_choice || 'plan');
      if (k === 'hours') {
        const { data: entries } = a.engagement_id ? await server.from('time_entries').select('started_at, ended_at').eq('engagement_id', a.engagement_id) : { data: [] };
        const minutes = (entries || []).filter((e) => e.ended_at && Date.parse(e.started_at) >= since)
          .reduce((m, e) => m + Math.max(0, Math.round((Date.parse(e.ended_at) - Date.parse(e.started_at)) / 60000)), 0);
        deliveredExtra = Math.round(minutes * (Number(terms.hours?.rateMinor) || 0) / 60);
        sessionsHad = 0;
      }
      if (k === 'oneoff') { deliveredExtra = Math.max(0, Number(asked.deliveredMinor) || 0); sessionsHad = 0; }
      const refund = startNow ? Math.max(0, refund14({ paidMinor: paid, sessionsHad, perSessionMinor: perSessionPrice, startNow }) - deliveredExtra) : paid;
      const perSessionMinor = perSessionPrice;
      const claim = await server.from('agreement_cancellations').insert({ coach_id: coach.id, agreement_id: a.id, version_id: v.id, asked_on: today(zone),
        sessions_had: had, per_session_minor: perSessionMinor, paid_minor: paid, refund_minor: refund }).select('id');
      if (claim.error) throw calm(409, 'This agreement is being cancelled already.');
      const cancelId = claim.data?.[0]?.id;
      let left = refund;
      let first = null;
      for (const inv of paidInvs) {
        if (left <= 0) break;
        const amt = Math.min(left, inv.left);
        let done;
        try {
          done = await billing.refundOrCredit(inv.id, 'refund', amt, 'Cancelled within 14 days');
        } catch (e) {
          // Settled straight to the bank: kept as a credit note, and the coach refunds it from the bank.
          if (e?.status === 409) done = await billing.refundOrCredit(inv.id, 'credit', amt, 'Cancelled within 14 days, refunded from the bank');
          else throw e;
        }
        left -= amt;
        if (!first) {
          const { data: cn } = await server.from('credit_notes').select('*').eq('invoice_id', inv.id).eq('number', done.number).maybeSingle();
          first = { ...cn, number: done.number, invoiceNumber: inv.number ? `CLARITY-${inv.number}` : null };
        }
      }
      if (cancelId) await server.from('agreement_cancellations').update({ credit_note_id: first?.id || null, stripe_refund_id: first?.stripe_id || null }).eq('id', cancelId);
      // Anything still open is voided, so nothing more is asked for.
      for (const inv of (invs || []).filter((i) => (i.status === 'draft' || i.status === 'sent') && i.coach_id === coach.id)) {
        if (inv.stripe_invoice_id && stripe?.void) await stripe.void(inv.stripe_invoice_id).catch(() => {});
        await server.from('invoices').update({ status: 'void', voided_at: iso() }).eq('id', inv.id);
      }
      await must(server.from('agreements').update({ status: 'cancelled' }).eq('id', a.id));
      // Coaching sessions still to come come off the calendar here, as its own Delete takes them (agreements rule 12),
      // so no reminder for one ever goes (051's reminders read the calls); nothing is emailed about them.
      const off = await this._sessionsOff(a);
      let files = [];
      if (first && refund > 0) {
        try {
          const { creditNoteFile } = await import('../_agreementPdf.js');
          const pdf = await creditNoteFile({ number: first.number, issuedOn: today(zone), payerName: profile?.name || '', invoiceNumber: first.invoiceNumber, amountMinor: refund,
            currency, kind: 'refund', reason: 'Cancelled within 14 days' }, zone);
          files = [{ filename: pdf.fileName, content: Buffer.from(pdf.bytes).toString('base64') }];
        } catch { files = []; }
      }
      const outcome = profile?.email ? await mail(profile.email, cancelledEmail({ firstName: firstName(profile.name), coachFirst: c.display_first_name,
        refundWords: refund > 0 ? moneyText(refund, currency) : '', creditNoteNumber: first?.number || '', fileName: files[0]?.filename || '' }),
      { files, who: { ...c, full_name: coachName(c, v.terms) } }) : 'refused';
      return { refundMinor: refund, currency, creditNoteNumber: first?.number || null, emailed: outcome === 'sent', ...off };
    },

    /**
     * The client's coaching sessions still to come, under this coach, removed with their calls, guests and travel time
     * (coolingOff.js's futureSessionRows, the calendar's own Delete). Answers { sessionsOff, removed, calls }: the rows
     * gone, for the device to forget, and the calls' Google event and Zoom meeting, for its sync to delete there too.
     * When it can't be done, { sessionsOff: null } and the coach's device takes them off itself.
     */
    async _sessionsOff(a) {
      if (!a.profile_id) return { sessionsOff: 0, removed: [], calls: [] };
      try {
        const at = now();
        const { data: sessions, error } = await server.from('coach_sessions').select('id, profile_id, kind, starts_at, outcome, recap_sent_at')
          .eq('coach_id', coach.id).eq('profile_id', a.profile_id).gt('starts_at', at.toISOString());
        if (error) throw error;
        const ids = (sessions || []).map((x) => x.id);
        const calls = ids.length ? await must(server.from('coach_cal_items').select('id, session_id, travel_for, google_event_id, meeting_id').eq('coach_id', coach.id).in('session_id', ids)) : [];
        const callIds = (calls || []).map((i) => i.id);
        const travel = callIds.length ? await must(server.from('coach_cal_items').select('id, session_id, travel_for, google_event_id, meeting_id').eq('coach_id', coach.id).in('travel_for', callIds)) : [];
        const guests = callIds.length ? await must(server.from('coach_cal_guests').select('id, item_id').in('item_id', callIds)) : [];
        const items = [...(calls || []), ...(travel || [])];
        const { sessions: ahead, remove } = futureSessionRows(a.profile_id, { sessions, items, guests, now: at.getTime() });
        const of = (table) => remove.filter(([t]) => t === table).map(([, rowId]) => rowId);
        const gone = new Set(of('coach_cal_items'));
        if (of('coach_cal_guests').length) await must(server.from('coach_cal_guests').delete().in('id', of('coach_cal_guests')));
        const travelIds = (travel || []).filter((i) => gone.has(i.id)).map((i) => i.id);
        if (travelIds.length) await must(server.from('coach_cal_items').delete().eq('coach_id', coach.id).in('id', travelIds));
        const callGone = (calls || []).filter((i) => gone.has(i.id)).map((i) => i.id);
        if (callGone.length) await must(server.from('coach_cal_items').delete().eq('coach_id', coach.id).in('id', callGone));
        // Checked again as it goes: a session written up meanwhile stays.
        const sessionIds = ahead.map((x) => x.id);
        const left = sessionIds.length ? await must(server.from('coach_sessions').delete().eq('coach_id', coach.id).in('id', sessionIds)
          .is('outcome', null).is('recap_sent_at', null).select('id')) : [];
        const leftIds = new Set((left || []).map((x) => x.id));
        return {
          sessionsOff: leftIds.size,
          removed: remove.filter(([t, rowId]) => t !== 'coach_sessions' || leftIds.has(rowId)),
          calls: items.filter((i) => gone.has(i.id) && (i.google_event_id || i.meeting_id)).map((i) => ({ id: i.id, google_event_id: i.google_event_id || null, meeting_id: i.meeting_id || null })),
        };
      } catch {
        return { sessionsOff: null };
      }
    },

    /** Changes asked for, answered (the coach's own); with a reply, it's emailed to the client. */
    async answerChange(asked) {
      const { data: rows } = await server.from('agreement_change_requests').select('*').in('id', asked.requestIds);
      if ((rows || []).length !== asked.requestIds.length || rows.some((r) => r.coach_id !== coach.id)) throw notYours();
      await must(server.from('agreement_change_requests').update({ answered_at: iso() }).in('id', asked.requestIds).eq('coach_id', coach.id).is('answered_at', null));
      if (!asked.reply) return {};
      const { data: v } = await server.from('agreement_versions').select('id, agreement_id, terms').eq('id', rows[0].version_id).maybeSingle();
      const { data: a } = v ? await server.from('agreements').select('profile_id').eq('id', v.agreement_id).maybeSingle() : { data: null };
      const profile = await profileOf(a?.profile_id);
      const c = await me();
      const outcome = profile?.email ? await mail(profile.email, changeReplyEmail({ firstName: firstName(profile.name), coachFirst: c.display_first_name,
        reply: asked.reply, link: linkTo(`/coaching/agreement/${v.id}`) }), { who: { ...c, full_name: coachName(c, v.terms) } }) : 'refused';
      return { emailed: outcome === 'sent' };
    },

    /**
     * Send a sponsor's agreement: coach-signed with the newest saved signature, a link of its own (kept as a
     * fingerprint, handed out only in the email), running out after the agreement's 14, 30 or 60 days.
     */
    async sponsorSend(asked) {
      const a = await mine('agreements', asked.agreementId);
      const v = await mine('agreement_versions', asked.versionId);
      if (v.agreement_id !== a.id || a.kind !== 'sponsor') throw notYours();
      const terms = v.terms || {};
      if (v.status === 'draft') {
        const { data: sig } = await db.from('signatures').select('id').eq('user_id', coach.user_id).order('created_at', { ascending: false }).limit(1).maybeSingle();
        const signatureId = v.coach_signature_id || sig?.id || null;
        if (!signatureId) throw calm(409, 'Add your signature first, then send it.');
        const sent = await sendVersion(a, v, signatureId, v.personal_note, terms.expiryDays);
        if (!sent) throw calm(409, 'This version has been sent already.');
      } else if (v.status !== 'sent') throw calm(409, 'This agreement is signed already.');
      const days = [14, 30, 60].includes(Number(terms.expiryDays)) ? Number(terms.expiryDays) : 30;
      const expiresAt = new Date(now().getTime() + days * 86400000).toISOString();
      await server.from('sponsor_sign_links').update({ ended_at: iso() }).eq('agreement_id', a.id).is('ended_at', null);
      const token = randomBytes(32).toString('hex');
      await must(server.from('sponsor_sign_links').insert({ coach_id: coach.id, agreement_id: a.id, version_id: v.id,
        token_hash: createHash('sha256').update(token).digest('hex'), sponsor_name: asked.sponsor.name, sponsor_email: asked.sponsor.email,
        sponsor_role: asked.sponsor.role, expires_at: expiresAt }));
      const c = await me();
      const { data: org } = a.organisation_id ? await server.from('organisations').select('name').eq('id', a.organisation_id).maybeSingle() : { data: null };
      const link = linkTo(`/sign/${token}`);
      const outcome = await mail(asked.sponsor.email, sponsorSignEmail({ sponsorFirst: firstName(asked.sponsor.name), orgName: org?.name || terms.orgName || '',
        names: (terms.team?.people || []).map((p) => p.name), coachFirst: c.display_first_name, note: v.personal_note || '', link }),
      { who: { ...c, full_name: coachName(c, terms) } });
      // Off the live site nothing is emailed, so the link comes back to open by hand (a preview's testers); never on live.
      return { sentAt: v.sent_at || iso(), expiresAt, emailed: outcome === 'sent', ...(maySend(env) ? {} : { link }) };
    },

    /**
     * Each person's own agreement once their sponsor has signed (M28 s-b-team): funded by the organisation (no money),
     * coach-signed with the sponsor version's signature, sent, and emailed. Once each: a person who has one already is
     * left as they are. People named without a client profile wait until they are made clients.
     */
    async teamAgreements(asked) {
      const a = await mine('agreements', asked.agreementId);
      if (a.kind !== 'sponsor') throw notYours();
      const { data: sv } = await server.from('agreement_versions').select('*').eq('agreement_id', a.id).eq('version', a.current_version).maybeSingle();
      if (!sv || !sv.sponsor_signed_at) throw calm(409, 'The sponsor hasn’t signed yet.');
      const t = sv.terms || {};
      const { data: org } = a.organisation_id ? await server.from('organisations').select('name').eq('id', a.organisation_id).maybeSingle() : { data: null };
      const orgName = org?.name || t.orgName || '';
      const standards = await standardsFor(server, coach.id, 'sessions');
      const c = await me();
      let made = 0;
      for (const person of (t.team?.people || []).slice(0, 50)) {
        const profile = await profileOf(id(person.profileId));
        if (!profile) continue;
        const { data: has } = await server.from('agreements').select('id').eq('team_parent_id', a.id).eq('profile_id', profile.id).limit(1);
        if (has?.length) continue;
        const terms = { ...blankTerms('sessions'), coaching: t.coaching || 'Team coaching', funder: 'org', fundedBy: orgName, orgName,
          blocks: Array.isArray(t.blocks) && t.blocks.length ? t.blocks : blankTerms('team').blocks, rhythm: t.rhythm || 'Every 2 weeks', place: t.place || 'zoom',
          startsOn: t.startsOn || null, endsOn: t.endsOn || null, clientName: profile.name, clientFirst: firstName(profile.name),
          coachName: t.coachName || c.display_first_name, coachFirst: t.coachFirst || c.display_first_name, offerUpfront: false, fullTerm: false,
          expiryDays: t.expiryDays || 30, settle: 'full', totalMinor: 0 };
        const ins = await db.from('agreements').insert({ coach_id: coach.id, kind: 'coaching', profile_id: profile.id, organisation_id: a.organisation_id,
          agreement_kind: 'sessions', team_parent_id: a.id, status: 'draft' }).select('*');
        if (ins.error) continue;
        const ag = ins.data[0];
        const vi = await db.from('agreement_versions').insert({ agreement_id: ag.id, coach_id: coach.id, version: 1, status: 'draft', terms,
          clauses: forStorage(terms, { standards }), currency: sv.currency || 'GBP', funded_by: orgName || 'Their organisation' }).select('*');
        if (vi.error) continue;
        const sent = await sendVersion(ag, vi.data[0], sv.coach_signature_id, sv.personal_note, terms.expiryDays).catch(() => null);
        if (!sent) continue;
        made += 1;
        if (profile.email) {
          await mail(profile.email, teamMemberAgreementEmail({ firstName: firstName(profile.name), orgName, coachFirst: c.display_first_name,
            link: linkTo(`/coaching/agreement/${vi.data[0].id}`) }), { who: { ...c, full_name: terms.coachName } });
        }
      }
      return { made };
    },
  };
}

/** The coach behind a sign-in, checked: the caller's own client and coach row, or a refusal { status, body }. */
export async function coachFrom(env, token) {
  const { url, anon } = supabaseOf(env);
  if (!url || !anon || !token) return { refusal: { status: 401, body: { ok: false, message: 'Sign in again to carry on.' } } };
  const noCode = codeRefusal(token, { ok: false });
  if (noCode) return { refusal: noCode };
  if (!env.SUPABASE_SERVICE_ROLE_KEY) return { refusal: { status: 200, body: { ok: false, reason: 'not_connected' } } };
  const db = asCallerClient(env, token);
  const { data: who, error } = await db.auth.getUser(token);
  if (error || !who?.user?.id) return { refusal: { status: 401, body: { ok: false, message: 'Sign in again to carry on.' } } };
  const { data: coach } = await db.from('coaches').select('id, role, active, user_id').eq('user_id', who.user.id).maybeSingle();
  if (!coach?.active) return { refusal: { status: 403, body: { ok: false, message: 'Only a coach can do that.' } } };
  const server = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  return { db, server, coach };
}

/** One answer for a thrown error: calm words as they are, anything else "didn't work". */
export function answerFor(res, e) {
  if (e?.calm) return reply(res, e.status || 409, { ok: false, calm: true, message: e.message, ...(e.unsure ? { unsure: true } : {}) });
  return reply(res, 502, { ok: false, message: DIDNT_WORK });
}

export default async function handler(req, res, env = process.env) {
  if (req.method !== 'POST') return reply(res, 405, { ok: false, message: DIDNT_WORK });
  const asked = askedFor(req.body);
  if (!asked) return reply(res, 400, { ok: false, message: DIDNT_WORK });
  const token = String(req.headers?.authorization || '').replace(/^Bearer\s+/i, '');
  const who = await coachFrom(env, token);
  if (who.refusal) return reply(res, who.refusal.status, who.refusal.body);
  let stripe = null;
  let billing = null;
  if (asked.kind === 'cancel_14') {
    const [{ keyAllowed, stripeApi }, { billing: billingOf }] = await Promise.all([import('../../src/lib/billing/stripe.js'), import('./coach-billing.js')]);
    if (!keyAllowed(env.STRIPE_SECRET_KEY || '')) return reply(res, 200, { ok: false, reason: 'not_connected' });
    stripe = stripeApi(env.STRIPE_SECRET_KEY);
    billing = billingOf({ server: who.server, stripe, coach: who.coach });
  }
  const api = agreementsApi({ db: who.db, server: who.server, coach: who.coach, env, origin: portalOrigin(req.headers || {}, env), stripe, billing });
  try {
    const run = {
      send: () => api.send(asked), reopen: () => api.reopen(asked), approve: () => api.approve(asked), ask_change: () => api.askChange(asked),
      send_sign_reminder: () => api.sendReminder(asked), send_first_payment_reminder: () => api.sendReminder(asked), extend: () => api.extend(asked),
      pause: () => api.pause(asked), end_early: () => api.endEarly(asked), cancel_14: () => api.cancel14(asked), answer_change: () => api.answerChange(asked),
      sponsor_send: () => api.sponsorSend(asked), team_agreements: () => api.teamAgreements(asked),
    }[asked.kind];
    const out = await run();
    if (out?.preview) return reply(res, 200, { ok: false, reason: 'preview' });
    return reply(res, 200, { ok: true, ...out });
  } catch (e) {
    return answerFor(res, e);
  }
}
