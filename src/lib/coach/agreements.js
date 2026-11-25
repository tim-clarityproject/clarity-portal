import { moneyWords, rateWords, daysOverdue, invoiceNumber } from '../billing/money.js';
import { clauses as agreementClauses } from '../billing/agreementText.js';
import { dayIn, isZone } from '../time/index.js';
import { parseDbTimestamp } from '../dateFormatter.js';
import { dayWords, firstName, possessive } from './model.js';

// Agreements, invoices and payments as the coach portal shows them (Phase 6b run 1; M11 B1, B3 and B4; migration 061).
// Plain rules with no database, checked by tests/performance/coach-agreements.test.mjs. No page works out an
// agreement's summary, its rows, a payment's line on the timeline or an overdue invoice for itself.
//
// - The Agreement fold (B3): closed, "6-month coaching, signed Mon 7 Sep" (a version sent and not signed yet: "…, sent
//   Mon 7 Sep, waiting to be signed"); open, label and value rows from the version's terms and the engagement, only
//   the rows whose data exists, never a row with nothing in it. No agreement: no fold (nothing invented).
// - Everything (B4): "Invoice CLARITY-1031 settled" / "Payment, £2,250" on its settled day, and "Agreement signed" /
//   "File, 6-month coaching" on the day it was signed. Clients settle, never pay (Tim's money rules), so M11's
//   "Invoice 1031 paid" reads "Invoice CLARITY-1031 settled": the brief's invoice numbers and words win over M11's.
// - Who needs attention (B1): an invoice overdue on the payer's own clock (money.js's daysOverdue, invoices.payer_zone,
//   else the coach's zone). The coach's own: the client or organisation's name, "An invoice for £4,800 is 7 days
//   overdue." and View the invoice; for the owner also associates': the client's name and "An invoice for Maya’s
//   client is 3 days overdue.", with no amount and no link (an associate's client never opens for the owner: rule 6).
// - Nothing here pauses coaching or sends anything.

const HOME = 'Europe/London';
const zoneOr = (zone) => (isZone(zone) ? zone : HOME);
const text = (v) => (typeof v === 'string' ? v.trim() : '');
const isObj = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const int = (v) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : null);

/** The day an instant falls on in a zone (a day key), from a saved timestamp. */
export function dayOf(instant, zone) {
  if (!instant) return null;
  const d = parseDbTimestamp(instant);
  return Number.isNaN(d.getTime()) ? null : dayIn(zoneOr(zone), d);
}

/** The version a coach sees for an agreement: its current one when sent or signed, else its newest signed one. */
export function shownVersion(agreement, versions = []) {
  const mine = versions.filter((v) => v.agreement_id === agreement.id);
  const current = mine.find((v) => v.version === agreement.current_version);
  if (current && (current.status === 'sent' || current.status === 'signed')) return current;
  return mine.filter((v) => v.status === 'signed' || v.client_signed_at).sort((a, b) => b.version - a.version)[0] || null;
}

/**
 * A client's agreement: their newest coaching agreement with a version sent or signed (a draft is never shown), and
 * that version. Null when there is none.
 */
export function clientAgreement({ agreements = [], versions = [], profileId }) {
  const theirs = agreements
    .filter((a) => a.profile_id === profileId && (a.kind || 'coaching') === 'coaching' && a.status !== 'draft')
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  for (const agreement of theirs) {
    const version = shownVersion(agreement, versions);
    if (version) return { agreement, version };
  }
  return null;
}

const termsOf = (version) => (isObj(version?.terms) ? version.terms : {});
const coachingName = (terms, engagement) => text(terms.coaching) || text(engagement?.name) || 'Coaching';

/** "every 2 weeks", "every week": an engagement's rhythm when the terms don't say. */
const everyWords = (weeks) => (weeks === 1 ? 'every week' : `every ${weeks} weeks`);

/** The rate in minor units an hour, from terms.rate ({ minor, per: 'hour' } or a number), or null. */
export function hourlyRate(terms) {
  const r = terms?.rate;
  if (isObj(r)) {
    const minor = int(r.minor ?? r.amount_minor);
    return minor != null && minor > 0 && (r.per == null || r.per === 'hour') ? minor : null;
  }
  const n = int(r ?? terms?.rate_minor);
  return n != null && n > 0 ? n : null;
}

const personName = (v) => (isObj(v) ? text(v.name) : text(v));
const lowerFirst = (s) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);

/**
 * The Agreement fold: { summary, rows: [{ label, value }], agreement, version, signed } or null when the client has no
 * agreement. `credit` is the engagement's time credit as model.js's timeCredit gives it ({ total, left } in minutes).
 */
export function agreementFold({ agreements = [], versions = [], profileId, engagement = null, contacts = [], organisation = null, credit = null, zone, todayKey }) {
  const found = clientAgreement({ agreements, versions, profileId });
  if (!found) return null;
  const { agreement, version } = found;
  const t = termsOf(version);
  const name = coachingName(t, engagement);
  const signed = version.status === 'signed' || Boolean(version.client_signed_at);
  const signedDay = dayOf(version.client_signed_at, zone);
  const sentDay = dayOf(version.sent_at, zone);
  const summary = signed && signedDay ? `${name}, signed ${dayWords(signedDay, todayKey)}`
    : sentDay ? `${name}, sent ${dayWords(sentDay, todayKey)}, waiting to be signed` : `${name}, waiting to be signed`;

  const rows = [];
  const add = (label, value) => { if (value != null && String(value).trim() !== '') rows.push({ label, value: String(value) }); };
  const currency = version.currency === 'USD' || t.currency === 'USD' ? 'USD' : 'GBP';

  add('Funded by', text(version.funded_by) || text(t.fundedBy) || text(t.funded_by) || text(engagement?.funded_by));

  const timeCredit = t.kind === 'time_credit' || t.timeCredit === true || (engagement?.time_credit_minutes != null && !(int(t.sessions) > 0));
  if (timeCredit) {
    const total = int(version.total_minor ?? t.total_minor);
    const rate = hourlyRate(t);
    if (total != null && total > 0) {
      const toGo = rate != null && credit && Number.isFinite(credit.left) ? Math.max(0, Math.round((credit.left * rate) / 60)) : null;
      add('Credit', `${moneyWords(total, currency)}${rate != null ? ` at ${rateWords(rate, 'hour', currency)}` : ''}${toGo != null ? `, with ${moneyWords(toGo, currency)} to go` : ''}`);
    }
  } else {
    const sessions = int(t.sessions) ?? int(engagement?.sessions_total);
    const minutes = int(t.minutes) ?? int(engagement?.default_minutes);
    const rhythm = text(t.rhythm) || (int(engagement?.every_weeks) ? everyWords(int(engagement.every_weeks)) : '');
    if (sessions != null && sessions > 0 && minutes != null && minutes > 0) add('Coaching sessions', `${sessions} of ${minutes} minutes${rhythm ? `, ${rhythm}` : ''}`);
  }

  const orgContacts = organisation ? contacts.filter((c) => c.organisation_id === organisation.id) : [];
  const sponsorContact = orgContacts.find((c) => (c.roles || []).includes('sponsor')) || null;
  const invoicesContact = orgContacts.find((c) => (c.roles || []).includes('invoices')) || null;
  const sponsor = personName(t.sponsor) || sponsorContact?.name || '';
  add('Sponsor', sponsor);
  const typedInvoices = t.invoicesContact ?? t.invoices_contact;
  if (typedInvoices) {
    const job = isObj(typedInvoices) ? text(typedInvoices.job_title ?? typedInvoices.role) : '';
    const who = personName(typedInvoices);
    add('Invoices contact', who ? `${who}${job && who !== sponsor ? `, ${lowerFirst(job)}` : ''}` : '');
  } else if (invoicesContact) {
    const job = text(invoicesContact.job_title);
    add('Invoices contact', `${invoicesContact.name}${job && invoicesContact.name !== sponsor ? `, ${lowerFirst(job)}` : ''}`);
  }

  const expenses = isObj(t.expenses) ? t.expenses.allowed : t.expenses ?? t.expensesAllowed;
  if (typeof expenses === 'boolean') add('Expenses allowed', expenses ? 'Yes' : 'No');

  const endsOn = t.ongoing ? null : (text(t.endsOn) || text(t.ends_on) || text(engagement?.ends_on));
  if (/^\d{4}-\d{2}-\d{2}$/.test(endsOn || '')) add('Ends', dayWords(endsOn, todayKey));

  return { summary, rows, agreement, version, signed };
}

/**
 * The agreement's full text for the side panel: the sections as they were signed (the version's own clauses), or,
 * when the version holds none, as the approved wording writes them from its terms. [{ key, title, paragraphs }].
 */
export function agreementSections(version, { clientName = '', clientEmail = '', coachName = '' } = {}) {
  const stored = Array.isArray(version?.clauses) ? version.clauses.filter(isObj) : [];
  if (stored.length) {
    return stored.map((c, i) => ({
      key: String(c.key ?? i), title: text(c.title) || null,
      paragraphs: Array.isArray(c.paragraphs) ? c.paragraphs.map(String) : text(c.text) ? [text(c.text)] : [],
    })).filter((c) => c.title || c.paragraphs.length);
  }
  const t = termsOf(version);
  if (!(int(t.sessions) > 0) || !(int(t.minutes) > 0)) return [];
  const words = { ...t, clientName: text(t.clientName) || clientName, clientEmail: text(t.clientEmail) || clientEmail, coachName: text(t.coachName) || coachName,
    fundedBy: text(t.fundedBy) || text(version.funded_by) || null, total_minor: version.total_minor ?? t.total_minor, currency: version.currency || t.currency };
  // The coach sees the agreement as it was written for the client: a funded client's has no money section.
  return agreementClauses(words).map((c) => ({ key: c.key, title: c.title ? `${c.number}. ${c.title}` : null, paragraphs: c.paragraphs }));
}

/** "Invoice CLARITY-1031", or "An invoice" when it has no number yet. */
const invoiceName = (n) => {
  try { return `Invoice ${invoiceNumber(Number(n))}`; } catch { return 'An invoice'; }
};

/**
 * Everything's money items for one client (B4), in model.js timeline's own shape: each settled invoice on the day it
 * was settled ("Invoice CLARITY-1031 settled" / "Payment, £2,250", kind 'payment'), and each signed agreement on the day
 * it was signed ("Agreement signed" / "File, 6-month coaching", kind 'file', as M11 draws it).
 */
export function moneyTimeline({ invoices = [], payments = [], agreements = [], versions = [], profileId, zone }) {
  const items = [];
  const theirAgreements = new Set(agreements.filter((a) => a.profile_id === profileId).map((a) => a.id));
  for (const inv of invoices) {
    if (inv.status !== 'paid') continue;
    if (inv.profile_id !== profileId && !(inv.agreement_id && theirAgreements.has(inv.agreement_id))) continue;
    const paid = payments.filter((p) => p.invoice_id === inv.id);
    const last = paid.map((p) => p.paid_at).filter(Boolean).sort().at(-1);
    const at = inv.paid_at || last;
    if (!at) continue;
    const sum = paid.reduce((n, p) => n + (int(p.amount_minor) || 0), 0);
    const amount = int(inv.paid_minor) || sum || int(inv.total_minor) || 0;
    items.push({ id: `i:${inv.id}`, kind: 'payment', at, day: dayOf(at, zone), title: `${invoiceName(inv.number)} settled`, line: `Payment, ${moneyWords(amount, inv.currency === 'USD' ? 'USD' : 'GBP')}` });
  }
  for (const v of versions) {
    if (!v.client_signed_at || !theirAgreements.has(v.agreement_id)) continue;
    items.push({ id: `a:${v.id}`, kind: 'file', at: v.client_signed_at, day: dayOf(v.client_signed_at, zone), title: 'Agreement signed', line: `File, ${coachingName(termsOf(v), null)}` });
  }
  return items;
}

/**
 * Who needs attention's overdue invoices (B1): sent, with a number and a due day, not settled, and past due on the
 * payer's own clock. The coach's own first, then (the owner) associates', the most overdue first in each.
 * @returns {{ key, profileId, name, line, action, to, state, days }[]}
 */
export function overdueRows({ invoices = [], coachId, isOwner = false, clients = [], admin = [], organisations = [], coaches = [], now, coachZone }) {
  const own = [];
  const theirs = [];
  for (const inv of invoices) {
    if (inv.status !== 'sent' || !inv.due_on || inv.number == null || inv.voided_at) continue;
    const mine = inv.coach_id === coachId;
    if (!mine && !isOwner) continue;
    const days = daysOverdue(inv.due_on, now, isZone(inv.payer_zone) ? inv.payer_zone : coachZone);
    if (days < 1) continue;
    const left = Math.max(0, (int(inv.total_minor) || 0) - (int(inv.paid_minor) || 0));
    if (left === 0) continue;
    const dayText = `${days} ${days === 1 ? 'day' : 'days'} overdue`;
    const org = organisations.find((o) => o.id === inv.organisation_id) || null;
    if (mine) {
      const client = clients.find((c) => c.id === inv.profile_id) || null;
      const name = (inv.settles_to === 'organisation' && org?.name) || client?.name || org?.name || text(inv.payer_name);
      if (!name) continue;
      const to = client ? `/coach/clients/${client.id}` : isOwner && org ? `/coach/organisations/${org.id}` : null;
      own.push({ key: `o:${inv.id}`, profileId: client?.id || null, name, line: `An invoice for ${moneyWords(left, inv.currency === 'USD' ? 'USD' : 'GBP')} is ${dayText}.`,
        action: 'View the invoice', to, state: client ? { view: 'all', show: 'payment' } : null, days });
    } else {
      const row = admin.find((a) => a.profile_id === inv.profile_id) || null;
      const name = row?.name || org?.name || row?.organisation_name || text(inv.payer_name);
      const coachFirst = row?.coach_first_name || coaches.find((c) => c.coach_id === inv.coach_id)?.first_name || '';
      if (!name || !coachFirst) continue;
      // The owner's admin view of that client shows its invoices (follow-up 5, item 10).
      const to = row?.profile_id ? `/coach/clients/${row.profile_id}` : null;
      theirs.push({ key: `o:${inv.id}`, profileId: null, name, line: `An invoice for ${possessive(firstName(coachFirst))} client is ${dayText}.`, action: to ? 'View the invoice' : null, to, state: null, days });
    }
  }
  const byDays = (a, b) => b.days - a.days || a.name.localeCompare(b.name);
  return [...own.sort(byDays), ...theirs.sort(byDays)];
}
