import { addDays, dayIn, daysBetween, dayKeyWords, weekdayOf } from '../time/index.js';
import { parseDbTimestamp, getLocalDateKey } from '../dateFormatter.js';
import { at80, blockMinutes, used as usedMinutes } from './hours.js';
import { deliveredToInvoice, perSession } from './delivered.js';
import { fridayOnOrAfter } from './endDate.js';
import { movedDown, fallSince, perUnit } from './fx.js';
import {
  approvalItem, changeItem, deliveredItem, firstPaymentItem, fxItem, hoursItem, overdueItem, poItem, portalItem, priceItem, renewItem, signReminderItem,
} from './needsYou.js';
import { sessions as sessionTotal } from './pricing.js';
import { fileName as orgFileName } from './orgInvoice.js';
import { priceReviewDue, priceReviewShows, renewalShows, termEnds, TERM_MONTHS } from './renewals.js';
import { addMonths, signedVersionsOf } from './settling.js';
import { kindOf, selfFunded } from './terms.js';

// During an agreement (Phase 6b run 3, Group D; M28 s-today, the Needs you panels, s-agr, s-cal-session, s-h-log,
// s-org-billing, s-inv-new, s-inv-sent): which facts the coach's rows hold, worked out once, so no page counts sessions,
// hours, a price review or a Needs you item for itself. Pure: rows in, words and items out; days are day keys.
// Group A's builders (needsYou.js, delivered.js, hours.js, renewals.js) make the words; this file only finds the facts.
// Checked by tests/performance/needs-you.test.mjs and tests/performance/org-invoice-screens.test.mjs.

const text = (v) => (typeof v === 'string' ? v.trim() : '');
const dayOfStamp = (v) => (v ? getLocalDateKey(parseDbTimestamp(v)) : null);
const firstWord = (name) => text(name).split(/\s+/)[0] || '';
const FIRST_KINDS = ['first_payment', 'deposit', 'instalment'];

// ---------------------------------------------------------------- an agreement's versions and sessions

/** The newest version of an agreement (the highest number). */
export function newestVersion(versions, agreementId) {
  return (versions || []).filter((v) => v.agreement_id === agreementId).sort((a, b) => (b.version || 0) - (a.version || 0))[0] || null;
}
/** The version in force: the newest signed one, else the newest. */
export function versionInForce(versions, agreementId) {
  const mine = (versions || []).filter((v) => v.agreement_id === agreementId).sort((a, b) => (b.version || 0) - (a.version || 0));
  return mine.find((v) => v.status === 'signed' || v.client_signed_at || v.sponsor_signed_at) || mine[0] || null;
}
export const isSigned = (v) => Boolean(v && (v.status === 'signed' || v.client_signed_at || v.sponsor_signed_at));
export const signedDay = (v) => dayOfStamp(v?.client_signed_at || v?.sponsor_signed_at);
/**
 * The first signing of an agreement (agreements rule 12): a later signed version (a price review, an extension, a
 * change) is an amendment, so the 14 days, the start-now tick and Cancel within 14 days always go by the first.
 */
export function firstSignedVersion(versions, agreementId) {
  return signedVersionsOf((versions || []).filter((v) => v.agreement_id === agreementId))[0] || null;
}

/** "Version 1, signed" or "Version 2, not signed yet" (M28's agrStatus). */
export function statusLine(agreement, version) {
  if (agreement?.status === 'cancelled') return `Version ${version?.version || 1}, cancelled within 14 days`;
  if (agreement?.status === 'ended' || agreement?.status === 'ended_not_renewed') return `Version ${version?.version || 1}, ended`;
  return `Version ${version?.version || 1}${isSigned(version) ? ', signed' : ', not signed yet'}`;
}

/**
 * The end a running agreement has now: as moved by Extend or Pause (065's agreements.ends_on, the server's), else
 * ending_on with no `ending_by` (where the server kept a moved end before ends_on existed), else as signed (terms.endsOn).
 * An early end is ending_on with ending_by (earlyEnd).
 */
export const currentEnd = (agreement, terms) => agreement?.ends_on || (agreement?.ending_on && !agreement?.ending_by ? agreement.ending_on : null) || terms?.endsOn || null;
/** The day an agreement ends early (End early: ending_on with who ended it), or null. */
export const earlyEnd = (agreement) => (agreement?.ending_on && agreement?.ending_by ? agreement.ending_on : null);

/** "Sam's agreement" (the page's title), with the right apostrophe. */
export const agreementTitle = (name) => (name ? `${firstWord(name)}’s agreement` : 'The agreement');

/**
 * The agreement's own coaching sessions: the client's, from the day it starts (on the coach's clock), oldest first,
 * never a group's. Sessions before the start belong to an earlier agreement.
 */
export function agreementSessions({ agreement, terms, sessions = [], zone = 'Europe/London' }) {
  if (!agreement?.profile_id) return [];
  const from = terms?.startsOn || null;
  const to = earlyEnd(agreement) || currentEnd(agreement, terms);
  return (sessions || [])
    .filter((s) => s.profile_id === agreement.profile_id && (s.kind || 'coaching') === 'coaching')
    .filter((s) => { const d = dayIn(zone, new Date(s.starts_at)); return (!from || d >= from) && (!to || d <= addDays(to, 0)); })
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
}

/** How many coaching sessions the agreement holds (set sessions only; a retainer's are a month's, not a total). */
export const sessionsIn = (t) => (kindOf(t) === 'sessions' ? sessionTotal(t) : null);

/** One coaching session's price (delivered.js's perSession, the one function: agreements rule 12). */
export const perSessionMinor = (t, choice = 'plan') => perSession(t, choice);
/** Whether its coaching sessions are invoiced after they happen. */
export const invoicedAsDelivered = (t) => (kindOf(t) === 'retainer' ? t?.retainer?.invoice === 'delivered' : kindOf(t) === 'sessions' && t?.settle === 'delivered' && t?.choice !== 'upfront');

// ---------------------------------------------------------------- a block of hours

/** The block's state: minutes bought (with each top-up invoiced), used, and the time log newest first. */
export function hoursState({ agreement, terms, entries = [], invoices = [] }) {
  const h = terms?.hours || {};
  const topUps = (invoices || []).filter((i) => i.agreement_id === agreement?.id && i.kind === 'top_up' && i.status !== 'void').length;
  const block = blockMinutes((Number(h.blockMinor) || 0) * (1 + topUps), h.rateMinor);
  const log = (entries || []).filter((e) => agreement?.engagement_id && e.engagement_id === agreement.engagement_id && e.ended_at)
    .sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at));
  return { block, used: usedMinutes(log), log, topUps };
}

/** When? on the hours log: today, then the three working days before it (M28: Wed 25 Nov, Tue 24, Mon 23, Fri 20). */
export function logDays(today) {
  const out = [today];
  let d = today;
  while (out.length < 4) { d = addDays(d, -1); if (weekdayOf(d) <= 5) out.push(d); }
  return out.map((v) => ({ value: v, label: dayKeyWords(v) }));
}
/** How long? 15 minutes to 8 hours in quarter hours (M28's minsOpts). */
export const LOG_MINUTES = Object.freeze(Array.from({ length: 32 }, (_, i) => (i + 1) * 15));
export const SAY_WHAT = 'Say what the time was for.';

// ---------------------------------------------------------------- the panels on an agreement's page

/** Pause from when? The next three Mondays (M28: Mon 1 Mar, 8 Mar, 15 Mar); the year only when it isn't this one. */
export function pauseFromOptions(today) {
  const first = addDays(today, ((8 - weekdayOf(today)) % 7) || 7);
  return [0, 7, 14].map((n) => addDays(first, n)).map((v) => ({ value: v, label: dayKeyWords(v, { year: true, today }) }));
}
/** Until when? Fridays 4, 6 and 9 weeks after it starts (M28: Fri 26 Mar, 9 Apr, 30 Apr from Mon 1 Mar). `today`: as above. */
export function pauseToOptions(from, today = null) {
  if (!from) return [];
  return [25, 39, 60].map((n) => fridayOnOrAfter(addDays(from, n))).map((v) => ({ value: v, label: dayKeyWords(v, { year: true, today }) }));
}
/** What's the last day? Fridays from 30 days' notice, then 4 and 8 weeks later; never after the end already set. */
export function endEarlyOptions(today, end = null) {
  const first = fridayOnOrAfter(addDays(today, 30));
  const days = [first, addDays(first, 28), addDays(first, 56)].filter((d) => !end || d < end);
  return (days.length ? days : [end].filter(Boolean)).map((v) => ({ value: v, label: dayKeyWords(v, { year: true, today }) }));
}
/** The line under End early on the agreement's page, and the panel's own sentence. */
export const endEarlyLine = (t) => (t?.fullTerm ? 'Only by agreement, when something exceptional happens' : '30 days’ notice in writing');
export const endEarlySentence = (t) => (t?.fullTerm
  ? 'A 6-month agreement ends early only by agreement, when something exceptional happens. Any refund is what you agree.'
  : 'Either of you can end it with 30 days’ notice in writing. Any refund is what you agree.');

/** From when? on a price review: the day it is due, then the first Monday of the next two months (M28). `today`: the
 * year shows only when it isn't today's. */
export function priceFromOptions(due, today = null) {
  if (!due) return [];
  const firstMonday = (day) => { const first = `${day.slice(0, 8)}01`; return addDays(first, (8 - weekdayOf(first)) % 7); };
  return [due, firstMonday(addMonths(due, 1)), firstMonday(addMonths(due, 2))].map((v) => ({ value: v, label: dayKeyWords(v, { year: true, today }) }));
}

/** Give money back: the agreement's settled invoices, newest first, each with what can still go back. */
export function settledInvoices(invoices, agreementId, creditNotes = []) {
  return (invoices || []).filter((i) => i.agreement_id === agreementId && i.status === 'paid' && i.number != null)
    .map((i) => {
      const back = (creditNotes || []).filter((c) => c.invoice_id === i.id).reduce((a, c) => a + (Number(c.amount_minor ?? c.total_minor) || 0), 0);
      return { ...i, left_minor: Math.max(0, (Number(i.paid_minor) || Number(i.total_minor) || 0) - back) };
    })
    .sort((a, b) => String(b.paid_at || b.issued_on || '').localeCompare(String(a.paid_at || a.issued_on || '')));
}
/** What a self-funded client has settled on this agreement (for the 14-day refund). */
export const paidOn = (invoices, agreementId) => (invoices || []).filter((i) => i.agreement_id === agreementId && (i.status === 'paid' || Number(i.paid_minor) > 0))
  .reduce((a, i) => a + (Number(i.paid_minor) || (i.status === 'paid' ? Number(i.total_minor) || 0 : 0)), 0);

// ---------------------------------------------------------------- Needs you on Today

/** An overdue invoice's reminder waiting to send (061: drafted, not sent, not being sent), unless one may have gone. */
export function waitingReminder(invoice, reminders = []) {
  const mine = (reminders || []).filter((r) => r.invoice_id === invoice.id);
  if (mine.some((r) => !r.sent_at && r.sending_at)) return null; // one may have gone: Who needs attention's Send again
  return mine.filter((r) => !r.sent_at && !r.sending_at).sort((a, b) => b.stage - a.stage)[0] || null;
}
/** Whether a reminder for this payer is paused (061's invoice_reminder_pauses). */
export const remindersPaused = (invoice, pauses = []) => (pauses || []).some((p) => (invoice.organisation_id && invoice.settles_to === 'organisation'
  ? p.organisation_id === invoice.organisation_id : p.profile_id === invoice.profile_id));
const left = (inv) => Math.max(0, (Number(inv.total_minor) || 0) - (Number(inv.paid_minor) || 0));

/**
 * Whether an overdue invoice is in Needs you (its reminder drafted and waiting for Send): Who needs attention leaves
 * these out, so one invoice is never listed twice on Today (risk 11). The coach's own invoices only.
 */
export function overdueInNeedsYou(invoice, { reminders = [], pauses = [], coachId, today }) {
  if (!invoice || invoice.coach_id !== coachId || invoice.status !== 'sent' || invoice.number == null || invoice.voided_at || invoice.waived_at) return false;
  if (!invoice.due_on || !today || invoice.due_on >= today || left(invoice) === 0) return false;
  return Boolean(waitingReminder(invoice, reminders)) && !remindersPaused(invoice, pauses);
}

/**
 * The invoices Who needs attention reads on Today: every one but those Needs you lists (an overdue invoice whose reminder
 * is drafted and waiting for Send), so one invoice is never in both (risk 11). One whose reminder may have gone stays,
 * for Who needs attention's Send again (follow-up 5).
 */
export const attentionInvoices = (invoices = [], facts = {}) => (invoices || []).filter((i) => !overdueInNeedsYou(i, facts));

/** The payer's name on an invoice: the organisation for one it settles, else the client, else the name on it. */
function payerName(inv, { clients = [], organisations = [] }) {
  const org = organisations.find((o) => o.id === inv.organisation_id);
  const client = clients.find((c) => c.id === inv.profile_id);
  return (inv.settles_to === 'organisation' && org?.name) || client?.name || org?.name || text(inv.payer_name) || '';
}

/**
 * Every Needs you item for this coach, newest facts first within M28's order once `visible` has sorted them.
 * facts: { coachId, isOwner, today, now (ms), zone, agreements, versions, sessions, sources, agreementReminders,
 *   invoices, invoiceReminders, pauses, changeRequests, entries, clients, organisations, profiles (org billing),
 *   coaches, allAgreements (the owner's read of every coach's, for approval), fxToday { EUR: units per £ } }
 */
export function needsYouItems(f) {
  const { coachId, today } = f;
  const now = f.now ?? Date.now();
  const zone = f.zone || 'Europe/London';
  const clients = f.clients || [];
  const organisations = f.organisations || [];
  const versions = f.versions || [];
  const out = [];
  const nameOf = (a) => clients.find((c) => c.id === a.profile_id)?.name || organisations.find((o) => o.id === a.organisation_id)?.name || '';
  const mine = (f.agreements || []).filter((a) => a.coach_id === coachId);

  for (const a of mine) {
    const v = versionInForce(versions, a.id);
    const t = v?.terms || {};
    const name = nameOf(a);
    if (!v || !name) continue;
    const signed = isSigned(v) && a.status !== 'cancelled' && a.status !== 'ended' && a.status !== 'expired';

    // As delivered: the coaching sessions since the last invoice, drafted for the coach to check and send.
    if (signed && invoicedAsDelivered(t)) {
      const list = deliveredToInvoice({ terms: t, sessions: f.sessions, sources: f.sources, profileId: a.profile_id, zone, now });
      if (list.length) {
        const per = perSessionMinor(t);
        const lastDay = dayIn(zone, new Date(list.at(-1).starts_at));
        out.push(deliveredItem({ agreementId: a.id, name, count: list.length, amountMinor: per * list.length, currency: t.currency || 'GBP', day: lastDay, today }));
      }
    }
    // A block of hours 80% used: the top-up invoice drafted (each top-up starts the count again).
    if (signed && kindOf(t) === 'hours' && t.hours?.tellAt80 !== false) {
      const h = hoursState({ agreement: a, terms: t, entries: f.entries, invoices: f.invoices });
      if (h.block > 0 && at80(h.used, h.block)) {
        const it = hoursItem({ agreementId: a.id, firstName: firstWord(name), usedMinutes: h.used, blockMinutes: h.block, day: dayOfStamp(h.log[0]?.ended_at) || today, today });
        out.push({ ...it, key: `${it.key}:${h.topUps}` });
      }
    }
    // A yearly price review for a retainer, from 6 weeks before it is due.
    if (signed && kindOf(t) === 'retainer') {
      const since = t.priceSince || t.startsOn || signedDay(v);
      const due = since ? priceReviewDue(since) : null;
      if (due && today >= priceReviewShows(due) && daysBetween(due, today) <= 31) {
        out.push({ ...priceItem({ agreementId: a.id, name, feeMinor: Number(t.retainer?.feeMinor) || 0, currency: t.currency || 'GBP', sinceDay: since, dueDay: due, day: priceReviewShows(due), today }), key: `price:${a.id}:${due}` });
      }
    }
    // The next 6 months, a month before these end (set sessions committed for the full term, or a retainer's term).
    if (signed && !(f.agreements || []).some((x) => x.renews_id === a.id)) {
      let end = null;
      if (kindOf(t) === 'sessions' && t.fullTerm) end = earlyEnd(a) || currentEnd(a, t);
      if (kindOf(t) === 'retainer' && t.startsOn) {
        end = termEnds(t.startsOn, TERM_MONTHS);
        for (let k = 0; end < today && k < 40; k += 1) end = termEnds(addMonths(t.startsOn, TERM_MONTHS * (k + 1)), TERM_MONTHS);
      }
      if (end && renewalShows(end, today)) out.push({ ...renewItem({ agreementId: a.id, name, endDay: end, day: addMonths(end, -1), today }), key: `renew:${a.id}:${end}` });
    }
    // The pound value of the next invoice down more than 5% since signing (another currency only).
    const c = t.currency || v.currency || 'GBP';
    const atSigning = Number(v.fx_rate || t.fxRate);
    const nowRate = Number(f.fxToday?.[c]);
    if (signed && c !== 'GBP' && atSigning > 0 && nowRate > 0 && kindOf(t) !== 'hours' && kindOf(t) !== 'oneoff') {
      const was = perUnit(atSigning);
      const is = perUnit(nowRate);
      if (movedDown(was, is)) out.push({ ...fxItem({ agreementId: a.id, name, currency: c, fallPercent: Math.round(fallSince(was, is) * 100), day: today, today }), key: `fx:${a.id}:${today.slice(0, 7)}` });
    }
  }

  // Signing reminders (3 and 7 days, drafted by the nightly round) and the first payment's, waiting for Send.
  const byVersion = new Map();
  for (const r of f.agreementReminders || []) {
    if (r.coach_id !== coachId || r.sent_at || r.sending_at) continue;
    const list = byVersion.get(r.version_id) || [];
    list.push(r);
    byVersion.set(r.version_id, list);
  }
  for (const [versionId, list] of byVersion) {
    const v = versions.find((x) => x.id === versionId);
    const a = v && mine.find((x) => x.id === v.agreement_id);
    if (!v || !a) continue;
    const name = nameOf(a);
    if (!name) continue;
    const sign = list.filter((r) => r.kind === 'sign_3' || r.kind === 'sign_7').sort((x, y) => (y.kind === 'sign_7') - (x.kind === 'sign_7'))[0];
    if (sign && !isSigned(v) && v.status === 'sent' && (!v.expires_on || v.expires_on >= today)) {
      const it = signReminderItem({ versionId, name, version: v.version || 1, sentDay: dayOfStamp(v.sent_at) || today, day: dayOfStamp(sign.drafted_at) || today, today });
      const sentDay = dayOfStamp(v.sent_at) || today;
      out.push({ ...it, ...(sentDay >= today ? { line: `Hasn’t signed version ${v.version || 1}, sent today` } : {}), key: `${it.key}:${sign.kind}`, data: { ...it.data, reminderId: sign.id, reminder: sign.kind, agreementId: a.id } });
    }
    const first = list.find((r) => r.kind === 'first_payment');
    // Only while the agreement runs and its first invoice isn't settled (functionality tester, run 3, finding 7).
    const firstSettled = (f.invoices || []).some((i) => i.agreement_id === a.id && (i.instalment_n ?? 1) === 1 && FIRST_KINDS.includes(i.kind) && i.status === 'paid');
    if (first && isSigned(v) && a.status === 'signed' && !firstSettled) {
      const it = firstPaymentItem({ versionId, firstName: firstWord(name), day: dayOfStamp(first.drafted_at) || today, today });
      out.push({ ...it, data: { ...it.data, reminderId: first.id, agreementId: a.id } });
    }
  }

  // Overdue invoices with a reminder drafted (the coach's own; an associate's are theirs to send).
  for (const inv of f.invoices || []) {
    if (!overdueInNeedsYou(inv, { reminders: f.invoiceReminders, pauses: f.pauses, coachId, today })) continue;
    const name = payerName(inv, { clients, organisations });
    if (!name) continue;
    const r = waitingReminder(inv, f.invoiceReminders);
    const it = overdueItem({ invoiceId: inv.id, name, number: inv.number, amountMinor: left(inv), currency: inv.currency || 'GBP', daysOverdue: daysBetween(inv.due_on, today), day: dayOfStamp(r.drafted_at) || today, today });
    out.push({ ...it, key: `${it.key}:${r.stage}`, data: { ...it.data, reminderId: r.id } });
  }

  // An organisation's invoice held for a purchase order, and one sent that also goes on their supplier portal.
  const profileOf = (orgId) => (f.profiles || []).find((p) => p.organisation_id === orgId && p.coach_id === coachId) || null;
  const heldByOrg = new Map();
  for (const inv of f.invoices || []) {
    if (inv.coach_id !== coachId || !inv.organisation_id || inv.voided_at || inv.waived_at) continue;
    const p = profileOf(inv.organisation_id);
    if (inv.status === 'draft' && p?.needs_po && !text(inv.po_number)) {
      if (!heldByOrg.has(inv.organisation_id)) heldByOrg.set(inv.organisation_id, inv);
    }
    if ((inv.status === 'sent' || inv.status === 'paid') && p?.supplier_portal && !inv.portal_uploaded_at && inv.number != null && (inv.emailed_at || inv.sent_at)) {
      const orgName = organisations.find((o) => o.id === inv.organisation_id)?.name || '';
      const sentDay = dayOfStamp(inv.emailed_at || inv.sent_at);
      const it = portalItem({ invoiceId: inv.id, number: inv.number, orgName, day: sentDay, today });
      out.push(sentDay === today ? it : { ...it, line: `Sent by email ${dayKeyWords(sentDay)}; they also want it on their portal` });
    }
  }
  for (const [orgId, inv] of heldByOrg) {
    const orgName = organisations.find((o) => o.id === orgId)?.name || '';
    if (!orgName) continue;
    const it = poItem({ organisationId: orgId, orgName, number: inv.number, day: dayOfStamp(inv.created_at) || today, today });
    out.push({ ...it, line: inv.number != null ? it.line : `An invoice for ${moneyOf(inv)} is waiting`, data: { ...it.data, invoiceId: inv.id } });
  }

  // A change asked for (061's change requests, not answered yet).
  for (const r of f.changeRequests || []) {
    if (r.coach_id !== coachId || r.answered_at) continue;
    const v = versions.find((x) => x.id === r.version_id);
    const a = v && mine.find((x) => x.id === v.agreement_id);
    if (!a) continue;
    const clause = (v.clauses || []).find((c) => c.key === r.clause_key);
    const title = clause ? `${clause.number}. ${clause.title}` : r.clause_key;
    const it = changeItem({ requestId: r.id, name: nameOf(a), clauseTitle: title, day: dayOfStamp(r.created_at) || today, today });
    out.push({ ...it, data: { ...it.data, agreementId: a.id, versionId: v.id } });
  }

  // The owner approves an associate's agreement before it goes (risk 23).
  if (f.isOwner) {
    for (const a of f.allAgreements || []) {
      if (a.coach_id === coachId || a.approval !== 'waiting') continue;
      const v = newestVersion(versions.concat(f.allVersions || []), a.id);
      const coachName = (f.coaches || []).find((c) => c.coach_id === a.coach_id || c.id === a.coach_id);
      const who = coachName ? [coachName.first_name || coachName.display_first_name, coachName.last_name].filter(Boolean).join(' ') : 'An associate';
      const client = (f.admin || []).find((x) => x.profile_id === a.profile_id)?.name || nameOf(a) || 'A client';
      out.push(approvalItem({ agreementId: a.id, coachName: who, clientName: client, coaching: text(v?.terms?.coaching) || 'Coaching', day: dayOfStamp(a.updated_at || a.created_at) || today, today }));
    }
  }
  return out;
}
function moneyOf(inv) {
  const n = Number(inv.total_minor) || 0;
  const c = inv.currency || 'GBP';
  const sym = { GBP: '£', USD: 'US$', EUR: '€' }[c] || `${c} `;
  return `${sym}${(n / 100).toLocaleString('en-GB', { minimumFractionDigits: n % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
}

/** Not now: tomorrow for most, next week for the renewal and the price review (M28's "Moved to next week"). */
export const notNowUntil = (kind, today) => addDays(today, kind === 'renew' || kind === 'price' || kind === 'fx' ? 7 : 1);
export const notNowWords = (kind) => (kind === 'renew' || kind === 'price' || kind === 'fx' ? 'Moved to next week' : 'Moved to tomorrow');

// ---------------------------------------------------------------- an organisation's invoice

/**
 * What can go on an organisation's invoice: the coaching sessions held (or cancelled late) with its people since the
 * last invoice, and the time logged on its engagements, none already on a live invoice. Oldest first.
 * Rows: { key, kind: 'session'|'entry', id, day, what, minutes }.
 */
export function orgInvoiceRows({ organisationId, clients = [], sessions = [], entries = [], engagements = [], sources = [], zone = 'Europe/London', now = Date.now(), covered = null }) {
  const people = new Set(clients.filter((c) => c.organisation_id === organisationId).map((c) => c.id));

  const engs = new Set((engagements || []).filter((e) => e.organisation_id === organisationId || people.has(e.profile_id)).map((e) => e.id));
  const liveSessions = new Set((sources || []).filter((s) => s.session_id && !s.released_at).map((s) => s.session_id));
  const liveEntries = new Set((sources || []).filter((s) => s.time_entry_id && !s.released_at).map((s) => s.time_entry_id));
  const out = [];
  for (const s of sessions || []) {
    if (!people.has(s.profile_id) || liveSessions.has(s.id) || onSchedule(covered, s.profile_id, dayIn(zone, new Date(s.starts_at)))) continue;
    if (!(s.outcome === 'held' || s.outcome === 'no_show' || (s.outcome === 'late_cancel' && !s.waived))) continue;
    if (Date.parse(s.starts_at) + (Number(s.minutes) || 60) * 60000 > now) continue;
    const who = clients.find((c) => c.id === s.profile_id)?.name || '';
    out.push({ key: `s:${s.id}`, kind: 'session', id: s.id, day: dayIn(zone, new Date(s.starts_at)), what: `Coaching session with ${who}`, minutes: Number(s.minutes) || 60, at: Date.parse(s.starts_at) });
  }
  const engProfile = new Map((engagements || []).map((e) => [e.id, e.profile_id]));
  for (const e of entries || []) {
    if (!engs.has(e.engagement_id) || !e.ended_at || liveEntries.has(e.id)) continue;
    // Time for a client whose own agreement settles it (finding 4) never goes on the organisation's invoice.
    if (engProfile.get(e.engagement_id) && onSchedule(covered, engProfile.get(e.engagement_id), dayIn(zone, new Date(e.started_at)))) continue;
    const m = Math.round((Date.parse(e.ended_at) - Date.parse(e.started_at)) / 60000);
    if (!(m > 0)) continue;
    out.push({ key: `e:${e.id}`, kind: 'entry', id: e.id, day: dayIn(zone, new Date(e.started_at)), what: text(e.note) || 'Time logged', minutes: m, at: Date.parse(e.started_at) });
  }
  // Since the last invoice: only what comes after the newest session or hour already on one of its invoices.
  const invoicedAt = [
    ...(sessions || []).filter((x) => people.has(x.profile_id) && liveSessions.has(x.id)).map((x) => Date.parse(x.starts_at)),
    ...(entries || []).filter((e) => engs.has(e.engagement_id) && liveEntries.has(e.id)).map((e) => Date.parse(e.started_at)),
  ];
  const after = invoicedAt.length ? Math.max(...invoicedAt) : -Infinity;
  return out.filter((r) => r.at > after).sort((a, b) => a.at - b.at);
}
/**
 * The clients whose coaching sessions are settled through an agreement of their own, so they never go on an hourly
 * organisation invoice too (nothing invoiced twice): a running 065 agreement an organisation funds (priced, or a team
 * member's under the team's), from its start on (agreements rule 12); and ANY signed self-funded agreement, whatever its
 * status now, from its start (or first signing, if earlier) to the end it has now (the break-it tester, run 3, finding
 * 4: the client already settled those). Map: profile id → [{ from, to }] day keys, '' for open.
 */
export function scheduledProfiles(agreements = [], versions = []) {
  const out = new Map();
  const add = (profileId, from, to) => out.set(profileId, [...(out.get(profileId) || []), { from: from || '', to: to || '' }]);
  for (const a of agreements || []) {
    if (!a?.profile_id) continue;
    const v = versionInForce(versions, a.id);
    if (!v || !isSigned(v)) continue;
    const t = v.terms || {};
    if (!selfFunded({ ...t, fundedBy: v.funded_by ?? t.fundedBy })) {
      if (a.status !== 'signed' || !t.kind) continue;
      add(a.profile_id, t.startsOn || signedDay(v) || '', '');
      continue;
    }
    const first = firstSignedVersion(versions, a.id) || v;
    const from = [t.startsOn, signedDay(first)].filter(Boolean).sort()[0] || '';
    const to = earlyEnd(a) || currentEnd(a, t) || '';
    // An end that isn't known is open only for a builder agreement that runs on (a retainer); run 1's are left as they were.
    if (!to && !t.kind) continue;
    add(a.profile_id, from, to);
  }
  return out;
}
/** Whether a session (its day) is settled through an agreement of its own (scheduledProfiles). */
export const onSchedule = (covered, profileId, day) => {
  const ranges = covered?.get?.(profileId);
  return Array.isArray(ranges) && ranges.some((r) => day >= (r.from || '') && (!r.to || day <= r.to));
};

/**
 * The invoice's period (UI finding 7: on a busy practice every row since the last invoice showed, all ticked): the
 * calendar month of the newest row logged. Its rows show and start ticked; anything older waits behind "Show older",
 * unticked, so a month's invoice is a month's work unless the coach adds more. Rows keep orgInvoiceRows' order.
 */
export function invoicePeriod(rows = []) {
  if (!rows.length) return { month: null, recent: [], older: [] };
  const month = rows.map((r) => String(r.day).slice(0, 7)).sort().pop();
  return { month, recent: rows.filter((r) => String(r.day).slice(0, 7) === month), older: rows.filter((r) => String(r.day).slice(0, 7) !== month) };
}
/** "Show 12 older" for the fold of rows before the invoice's month. */
export const olderWords = (n) => `Show ${n} older`;

/** A row's day on the invoice: "Tue 3 Nov", with the year when it isn't this one. */
export const rowDay = (day, today) => dayKeyWords(day, { year: Boolean(today) && day.slice(0, 4) !== today.slice(0, 4) });
/** "1.5 hours" or "1 hour" on a row (M28's hrs). */
export const rowHours = (minutes) => { const h = Math.round((minutes / 60) * 100) / 100; return `${h} ${h === 1 ? 'hour' : 'hours'}`; };
/** The bill-to block: the legal name, then the address, one line each. */
export const billTo = (p, orgName) => [text(p?.legal_name) || orgName, ...String(p?.billing_address || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean)];

/** An organisation's billing profile as the form holds it, from its row (or a new one). */
export function profileForm(row, org) {
  return {
    legal: row?.legal_name ?? '', address: row?.billing_address ?? '', email: row?.invoices_email ?? '', supplier: row?.supplier_number ?? '',
    needsPo: Boolean(row?.needs_po), reference: row?.their_reference ?? '', rate: row?.hourly_rate_minor != null ? String(row.hourly_rate_minor / 100) : '',
    terms: row?.terms_days || 30, timesheet: Boolean(row?.timesheet), evidence: Boolean(row?.evidence_required), portal: Boolean(row?.supplier_portal),
    portalUrl: row?.portal_url ?? '', name: org?.name || '',
  };
}
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const HTTPS = /^https:\/\/[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+(:[0-9]{1,5})?(\/[^\s"<>]*)?$/;
/** Pounds typed ("300", "£1,250.50") to pence, or null. */
export function penceFrom(typed) {
  const s = String(typed ?? '').replace(/[£,\s]/g, '');
  if (!s) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return NaN;
  return Math.round(Number(s) * 100);
}
/** The row to save, or { problem: { at, words } } in calm words. */
export function profileRow(form, { coachId, organisationId, before = null }) {
  const email = text(form.email);
  if (email && !EMAIL.test(email)) return { problem: { at: 'email', words: 'Type an email address like finance@company.com to carry on.' } };
  const rate = penceFrom(form.rate);
  if (Number.isNaN(rate) || (rate != null && rate > 100000000)) return { problem: { at: 'rate', words: 'Type the hourly rate in pounds, like 300.' } };
  const portalUrl = text(form.portalUrl);
  if (portalUrl && !HTTPS.test(portalUrl)) return { problem: { at: 'portal', words: 'Type the portal’s address, starting https://, to carry on.' } };
  return {
    row: {
      ...(before || {}), coach_id: coachId, organisation_id: organisationId,
      legal_name: text(form.legal).slice(0, 200) || null, billing_address: String(form.address || '').trim().slice(0, 500) || null, invoices_email: email || null,
      supplier_number: text(form.supplier).slice(0, 80) || null, needs_po: Boolean(form.needsPo), their_reference: text(form.reference).slice(0, 160) || null,
      hourly_rate_minor: rate, terms_days: [14, 30, 60].includes(Number(form.terms)) ? Number(form.terms) : 30,
      timesheet: Boolean(form.timesheet), evidence_required: Boolean(form.evidence), supplier_portal: Boolean(form.portal), portal_url: portalUrl || null,
    },
  };
}
/** The open purchase order for an organisation (062's), newest first. */
export const openPo = (pos, organisationId) => (pos || []).filter((p) => p.organisation_id === organisationId && p.status !== 'closed')
  .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))[0] || null;

/** Invoice sent's rows (M28's invStatus): Sent to, Attached, [Their supplier portal], Due, Settled. */
export function sentRows({ invoice, profile, orgName = '', pages = null, today }) {
  // The PDF's own name, as it was attached (orgInvoice.fileName; functionality tester, run 3, finding 12).
  const file = invoice.issued_on ? orgFileName({ number: invoice.number, orgName: orgName || invoice.payer_name || '', day: invoice.issued_on }) : `Invoice CLARITY-${invoice.number}.pdf`;
  const rows = [
    { label: 'Sent to', value: invoice.payer_email || profile?.invoices_email || '' },
    { label: 'Attached', value: `${file}, one file${pages ? `, ${pages} ${pages === 1 ? 'page' : 'pages'}` : ''}` },
    { label: 'Due', value: invoice.due_on ? `${dayKeyWords(invoice.due_on)}, by bank transfer` : '' },
    { label: 'Settled', value: invoice.status === 'paid' ? `${invoice.paid_at && dayOfStamp(invoice.paid_at) === today ? 'Today' : invoice.paid_at ? dayKeyWords(dayOfStamp(invoice.paid_at)) : 'Settled'}, by bank transfer` : 'Not yet', done: invoice.status === 'paid' },
  ];
  if (profile?.supplier_portal) rows.splice(2, 0, { label: 'Their supplier portal', value: invoice.portal_uploaded_at ? 'Uploaded' : 'Upload it there too, reminder in Needs you', done: Boolean(invoice.portal_uploaded_at) });
  return rows.filter((r) => r.value).map((r) => ({ ...r, done: r.done ?? (r.label === 'Sent to' || r.label === 'Attached' || r.label === 'Due') }));
}

export { selfFunded, dayOfStamp };
