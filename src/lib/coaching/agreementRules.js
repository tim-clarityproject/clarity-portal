import { PROVIDER, clauses as clausesFor, mainPoints } from '../billing/agreementText.js';
import { moneyWords } from '../billing/money.js';
import { CURRENCY_LIST } from '../agreements/currency.js';
import { dayKeyWords } from '../time/index.js';
import { formatClockTime, formatSavedDate, getLocalDateKey, parseDbTimestamp } from '../dateFormatter.js';

// The client's side of agreements, signing and Billing (Phase 6b run 1, mock-up M13 A1 to A8),
// as plain rules with no database: what my_agreements() and my_invoices() (migration 061) answer,
// tidied into what the screens draw, and every line they say. Loading and signing are in
// agreements.js, which uses only 061's own functions. Checked by tests/performance/agreements.test.mjs.
//
// Clients invest and settle, never pay (Tim's brief, which wins over M13's "Pay" and "Paid"); an
// organisation-funded client never sees an amount anywhere: my_agreements() already cuts the money
// from their terms and clauses, and these rules cut it again so nothing can slip through.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isId = (v) => typeof v === 'string' && UUID.test(v);
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const text = (v) => (typeof v === 'string' ? v.trim() : '');
const whole = (v) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Math.round(Number(v)) : null);
const when = (v) => {
  if (!v) return null;
  const d = parseDbTimestamp(v);
  return Number.isNaN(d.getTime()) ? null : v;
};

/** The money keys my_agreements() cuts from a funded client's terms (061), cut here again. */
export const MONEY_KEYS = Object.freeze(['investment', 'rate', 'instalments', 'discounts', 'total_minor', 'fees', 'payment', 'currency', 'fx_rate', 'fx_at', 'vat']);

// ---------------------------------------------------------------- agreements

/**
 * One version from my_agreements(), tidied, or null when it can't be drawn.
 * @returns {null|{ id, agreementId, reference, version, status, current, sentAt, signedAt, coachSignedAt,
 *   fundedBy, currency, totalMinor, terms, clauses, signedName, signedEmail, fingerprint, signatureId }}
 */
export function tidyVersion(raw) {
  if (!raw || typeof raw !== 'object' || !isId(raw.id)) return null;
  const version = whole(raw.version);
  if (!version || version < 1) return null;
  const status = ['sent', 'signed', 'superseded'].includes(raw.status) ? raw.status : null;
  if (!status) return null;
  const fundedBy = text(raw.funded_by) || null;
  const terms = raw.terms && typeof raw.terms === 'object' && !Array.isArray(raw.terms) ? { ...raw.terms } : {};
  if (fundedBy) MONEY_KEYS.forEach((k) => { delete terms[k]; });
  return {
    id: raw.id,
    agreementId: isId(raw.agreement_id) ? raw.agreement_id : null,
    reference: text(raw.reference),
    version,
    status,
    current: raw.current === true,
    sentAt: when(raw.sent_at),
    signedAt: when(raw.client_signed_at),
    coachSignedAt: when(raw.coach_signed_at),
    fundedBy,
    currency: fundedBy ? null : (CURRENCY_LIST.includes(raw.currency) ? raw.currency : null),
    totalMinor: fundedBy ? null : whole(raw.total_minor),
    terms,
    clauses: Array.isArray(raw.clauses) ? raw.clauses : [],
    signedName: text(raw.signed_name),
    signedEmail: text(raw.signed_email),
    fingerprint: /^[0-9a-f]{64}$/.test(raw.fingerprint || '') ? raw.fingerprint : null,
    // Not in 061's answer today: the PDF then finds the signature by its time (signatureFor).
    signatureId: isId(raw.client_signature_id) ? raw.client_signature_id : null,
    // 065's additions (Phase 6b run 3, Group C): the kind, how it was sent, the coach's note, when it runs out, the
    // change asked for and not answered yet, and what was chosen at signing. Never when it was opened (rule 6).
    agreementKind: text(raw.agreement_kind) || null,
    sendAs: raw.send_as === 'quote' ? 'quote' : 'agreement',
    personalNote: text(raw.personal_note),
    expiresOn: DAY.test(raw.expires_on || '') ? raw.expires_on : null,
    changePending: raw.change_pending && typeof raw.change_pending === 'object' ? {
      clauseKey: text(raw.change_pending.clause_key), title: text(raw.change_pending.title), askedAt: when(raw.change_pending.asked_at),
    } : null,
    startNow: raw.start_now === true,
    settleChoice: raw.settle_choice === 'upfront' || raw.settle_choice === 'plan' ? raw.settle_choice : null,
  };
}

/** Every version from my_agreements(), newest agreement and version first. */
export function agreementRows(list) {
  return (Array.isArray(list) ? list : []).map(tidyVersion).filter(Boolean);
}

/** The version waiting to be signed: sent, the agreement's current one, not signed yet. Null for none. */
export function readyToSign(rows) {
  return (rows || []).find((v) => v.status === 'sent' && v.current && !v.signedAt) || null;
}

/** Signed versions, the newest signing first (a later one supersedes the one before, which stays signed). */
export function signedVersions(rows) {
  return (rows || []).filter((v) => v.signedAt)
    .sort((a, b) => parseDbTimestamp(b.signedAt) - parseDbTimestamp(a.signedAt) || b.version - a.version);
}

/** The agreement that sets out the coaching now: the one waiting, else the newest signed. */
export function currentAgreement(rows) {
  return readyToSign(rows) || signedVersions(rows)[0] || null;
}

/** Whether this client sees money: never when an organisation funds the coaching (061, money.js seesMoney). */
export const seesMoneyFor = (v) => Boolean(v) && !v.fundedBy;

/** The terms the wording is filled from: the version's own, with its funding and money as 061 gives them. */
export function termsFor(v) {
  if (!v) return {};
  const t = { ...v.terms };
  if (v.fundedBy) {
    MONEY_KEYS.forEach((k) => { delete t[k]; });
    t.fundedBy = v.fundedBy;
  } else {
    t.fundedBy = null;
    if (v.totalMinor != null) t.total_minor = v.totalMinor;
    if (v.currency) t.currency = v.currency;
  }
  return t;
}

/** At a glance: the wording's Main points rows (agreementText.js), never M13's. */
export function glanceRows(v) {
  if (!v) return [];
  const t = termsFor(v);
  // Main points need the amount to write the investment row; without one it is left out.
  return mainPoints(t, { seesMoney: seesMoneyFor(v) && t.total_minor != null });
}

const paragraphsOf = (c) => {
  if (Array.isArray(c.paragraphs)) return c.paragraphs.map(text).filter(Boolean);
  if (typeof c.text === 'string') return c.text.split(/\n\s*\n/).map(text).filter(Boolean);
  return [];
};

/**
 * The agreement's sections as signed: the clauses kept with the version (they are what the
 * fingerprint covers), else the wording filled from its terms. Numbered as the reader sees them;
 * a funded client never gets the money section.
 * @returns {{ key: string, number: number|null, title: string|null, paragraphs: string[] }[]}
 */
export function agreementSections(v) {
  if (!v) return [];
  const sees = seesMoneyFor(v);
  const stored = (v.clauses || []).filter((c) => c && typeof c === 'object' && paragraphsOf(c).length);
  const source = stored.length ? stored : clausesFor(termsFor(v), { seesMoney: sees });
  let n = 0;
  return source
    .filter((c) => sees || !(c.money === true || c.money === 'true'))
    .map((c, i) => {
      const title = text(c.title) || null;
      return { key: text(c.key) || `clause-${i}`, number: title ? (n += 1) : null, title, paragraphs: paragraphsOf(c) };
    });
}

// ---------------------------------------------------------------- the lines the screens say

export const versionTitle = (n) => `Coaching agreement, version ${n}`;
export const readyLine = (n) => `Version ${n} of your coaching agreement is ready to sign.`;
export const SIGNED_PDF = 'Signed PDF';

/** "Version 3, sent by Tim yesterday" (M13 A3): today, yesterday, or "on Mon 19 Oct". */
export function sentLabel(v, coachFirst, todayKey = getLocalDateKey()) {
  const who = text(coachFirst) || 'your coach';
  const day = v?.sentAt ? formatSavedDate(v.sentAt, todayKey) : '';
  const words = day === 'Today' ? 'today' : day === 'Yesterday' ? 'yesterday' : day ? `on ${day}` : '';
  return `Version ${v?.version ?? ''}, sent by ${who}${words ? ` ${words}` : ''}`;
}

/** "Signed Wed 28 Oct at 18:40" (M13 A5), on the device's own clock (rule 19). */
export function signedLabel(signedAt, todayKey = getLocalDateKey()) {
  if (!signedAt) return 'Signed';
  const key = getLocalDateKey(parseDbTimestamp(signedAt));
  return `Signed ${dayKeyWords(key, { year: key.slice(0, 4) !== todayKey.slice(0, 4) })} at ${formatClockTime(signedAt)}`;
}

/** "Thank you, Ben." from the full name they signed with. */
export function thankYou(name) {
  const first = text(name).split(/\s+/)[0];
  return first ? `Thank you, ${first}.` : 'Thank you.';
}

/** The day on a row's right: "Today", "Yesterday", "Mon 19 Oct" (formatSavedDate). */
export const rowDay = (at, todayKey = getLocalDateKey()) => (at ? formatSavedDate(at, todayKey) : '');

// ---------------------------------------------------------------- signing

export const SIG_MIN = 200;
export const SIG_MAX = 300000;
const PNG = /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/;
/** A drawn signature 061 keeps: a PNG data URL of 200 to 300,000 characters. */
export const isSignatureImage = (s) => typeof s === 'string' && s.length >= SIG_MIN && s.length <= SIG_MAX && PNG.test(s);
/** A full name 061 signs with: 3 to 160 characters once trimmed. */
// As sign_agreement: invisible and direction marks taken out, at least one letter, no markup (break-it tester).
const INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF\u00AD]/g;
export const cleanName = (s) => String(s ?? '').replace(INVISIBLE, '').trim();
export const nameOk = (s) => { const n = cleanName(s); return n.length >= 3 && n.length <= 160 && /\p{L}/u.test(n) && !/[<>{}]/.test(n); };

export const NEEDS = Object.freeze({
  draw: 'Draw your signature to carry on.',
  use: 'Press Use this signature to carry on.',
  name: 'Type your full name to carry on.',
  tick: 'Tick the box to carry on.',
});

/**
 * What is still missing before signing, each said under its own part (the button is never greyed
 * out). mode: 'saved' (the saved signature), 'draw' (the box) or 'typed' (the name is the signature).
 * @returns {{ signature: string|null, name: string|null, tick: string|null }|null} null when ready
 */
export function signProblems({ mode, saved = false, used = false, ink = false, name = '', ticked = false }) {
  let signature = null;
  if (mode === 'saved' && !saved) signature = NEEDS.draw;
  if (mode === 'draw' && !used) signature = ink ? NEEDS.use : NEEDS.draw;
  const p = { signature, name: nameOk(name) ? null : NEEDS.name, tick: ticked ? null : NEEDS.tick };
  return p.signature || p.name || p.tick ? p : null;
}

export const OFFLINE_SIGN = Object.freeze(['That didn’t send, because you’re offline.', 'Your signature and tick are kept, so try again when you’re back online.']);
export const SIGN_PROBLEM = 'That didn’t send. Check your connection and try again.';
export const ALREADY_SIGNED = 'This agreement is already signed.';

/**
 * What a refused or failed signing means. The database's own sentences (061's sign_agreement) are
 * shown as they are: already signed (a second tab), changed since it was read, not the newest
 * version, an email not confirmed, a name or signature missing.
 * @returns {{ kind: 'offline'|'signed'|'refused'|'problem', lines: string[] }}
 */
export function signError(error, { online = true } = {}) {
  const code = String(error?.code || '');
  const message = text(error?.message);
  if (code === 'CC409' && message === ALREADY_SIGNED) return { kind: 'signed', lines: [ALREADY_SIGNED] };
  if (['CC409', '42501', '22023'].includes(code) && message && message.length < 200) return { kind: 'refused', lines: [message] };
  if (!online || error?.offline) return { kind: 'offline', lines: [...OFFLINE_SIGN] };
  return { kind: 'problem', lines: [SIGN_PROBLEM] };
}

// ---------------------------------------------------------------- invoices and Billing

/** One invoice from my_invoices(), tidied, or null. Only an https page is ever opened (061's own check). */
export function tidyInvoice(raw) {
  if (!raw || typeof raw !== 'object' || !isId(raw.id)) return null;
  const number = text(raw.number);
  if (!/^CLARITY-\d{4,9}$/.test(number)) return null;
  const status = raw.status === 'paid' ? 'paid' : raw.status === 'sent' ? 'sent' : null;
  if (!status) return null;
  const hosted = text(raw.hosted_url);
  return {
    id: raw.id,
    number,
    status,
    currency: CURRENCY_LIST.includes(raw.currency) ? raw.currency : 'GBP',
    totalMinor: Math.max(0, whole(raw.total_minor) || 0),
    paidMinor: Math.max(0, whole(raw.paid_minor) || 0),
    dueOn: DAY.test(raw.due_on || '') ? raw.due_on : null,
    paidAt: when(raw.paid_at),
    paidDay: when(raw.paid_at) ? getLocalDateKey(parseDbTimestamp(raw.paid_at)) : null,
    hostedUrl: /^https:\/\/[^\s]+$/.test(hosted) ? hosted : null,
    kind: text(raw.kind),
  };
}

export const invoiceRows = (list) => (Array.isArray(list) ? list : []).map(tidyInvoice).filter(Boolean);

const unsettled = (inv) => inv.status === 'sent';
const numberOf = (inv) => Number(inv.number.slice(8));

/** The next invoice to settle: the unsettled one due first (then the lowest number), or null. */
export function nextInvoice(invoices) {
  return (invoices || []).filter(unsettled).sort((a, b) => {
    if (a.dueOn !== b.dueOn) return !a.dueOn ? 1 : !b.dueOn ? -1 : a.dueOn < b.dueOn ? -1 : 1;
    return numberOf(a) - numberOf(b);
  })[0] || null;
}

/** What is left to settle on an invoice. */
export const amountLeft = (inv) => Math.max(0, inv.totalMinor - inv.paidMinor);

/** Invested so far: every settled invoice in full, and what is already in on one still open. */
export function investedSoFar(invoices) {
  return (invoices || []).reduce((sum, inv) => sum + (inv.status === 'paid' ? Math.max(inv.totalMinor, inv.paidMinor) : inv.paidMinor), 0);
}

const dayWords = (key, todayKey) => dayKeyWords(key, { year: key.slice(0, 4) !== todayKey.slice(0, 4) });

/** A row's status on the right: "Settled Fri 2 Oct" in mint, or "Due Mon 2 Nov" plain (never coral). */
export function invoiceStatus(inv, todayKey = getLocalDateKey()) {
  if (inv.status === 'paid') {
    const key = inv.paidAt ? getLocalDateKey(parseDbTimestamp(inv.paidAt)) : null;
    return { text: key ? `Settled ${dayWords(key, todayKey)}` : 'Settled', good: true };
  }
  return { text: inv.dueOn ? `Due ${dayWords(inv.dueOn, todayKey)}` : 'Due', good: false };
}

/** My coaching's Billing row: "Invoice CLARITY-1243 is due on Mon 2 Nov." for the next unsettled one. */
export function billingLine(invoices, todayKey = getLocalDateKey()) {
  const next = nextInvoice(invoices);
  if (!next) return '';
  if (!next.dueOn) return `Invoice ${next.number} is ready to settle.`;
  return `Invoice ${next.number} ${next.dueOn < todayKey ? 'was' : 'is'} due on ${dayWords(next.dueOn, todayKey)}.`;
}

export const BILLING = Object.freeze({
  title: 'Billing',
  meta: `Invoices from ${PROVIDER.name}`,
  next: 'Next invoice',
  invested: 'Invested so far',
  invoices: 'Invoices',
  none: 'You have no invoices yet.',
  settle: 'Settle my invoice',
  back: 'My coaching',
  open: 'Open My coaching',
  nothing: 'There’s nothing for you to settle.',
  offline: Object.freeze(['That didn’t open, because you’re offline.', 'Try again when you’re back online.']),
});

export const fundsLine = (org) => `${org} funds your coaching.`;
// A day already gone reads in the past ("It was due on Tue 17 Nov."; functionality tester, 6b run 1).
export const dueLine = (inv, todayKey = getLocalDateKey()) => (inv?.dueOn ? `${inv.dueOn < todayKey ? 'It was' : 'It’s'} due on ${dayWords(inv.dueOn, todayKey)}.` : '');

/**
 * Everything Billing draws. A funded client gets only who funds it (no amount, no invoice); a
 * self-funded one the next invoice, Invested so far against the agreement's total, and the rows.
 */
export function billingView({ agreements = [], invoices = [] } = {}, todayKey = getLocalDateKey()) {
  const current = currentAgreement(agreements);
  if (current?.fundedBy) return { funded: current.fundedBy };
  const rows = invoices.slice().sort((a, b) => numberOf(b) - numberOf(a));
  const next = nextInvoice(rows);
  const currency = current?.currency || rows[0]?.currency || 'GBP';
  const invested = investedSoFar(rows);
  const total = current?.totalMinor != null && current.totalMinor > 0 ? current.totalMinor : null;
  return {
    funded: null,
    next: next ? { invoice: next, amount: moneyWords(amountLeft(next), next.currency), line: dueLine(next, todayKey) } : null,
    invested: { amount: moneyWords(invested, currency), share: total ? Math.min(1, invested / total) : null, total: total ? moneyWords(total, currency) : null },
    rows: rows.map((inv) => ({ ...inv, amount: moneyWords(inv.totalMinor, inv.currency), state: invoiceStatus(inv, todayKey) })),
  };
}

/** Whether My coaching shows the Billing row: a self-funded client with an agreement or an invoice. */
export function showsBilling({ agreements = [], invoices = [] } = {}) {
  const current = currentAgreement(agreements);
  if (current?.fundedBy) return false;
  return Boolean(current) || invoices.length > 0;
}

/** The page copy's shape, whatever the device or the database answers. */
export function tidyAgreements(data) {
  const d = data && typeof data === 'object' ? data : {};
  // Already tidied (the loader tidies, and pages tidy what they're handed): handed back as it is, never tidied twice,
  // which read the camel-case fields as missing and lost every amount, day and funder (UI tester, 6b run 1).
  if (d.tidied === true) return d;
  return {
    tidied: true,
    ready: d.ready === true,
    agreements: agreementRows(d.agreements),
    invoices: invoiceRows(d.invoices),
  };
}

/**
 * The signature used for a signed version, from the person's own signatures (newest first): its
 * own id when 061 gives one, else the newest made at or before the signing (signing always adds
 * the signature it signs with just before, so that is the one).
 */
export function signatureFor(v, signatures) {
  const list = Array.isArray(signatures) ? signatures : [];
  if (v?.signatureId) return list.find((s) => s.id === v.signatureId) || null;
  if (!v?.signedAt) return null;
  const at = parseDbTimestamp(v.signedAt).getTime();
  return list
    .filter((s) => s && parseDbTimestamp(s.created_at).getTime() <= at)
    .sort((a, b) => parseDbTimestamp(b.created_at) - parseDbTimestamp(a.created_at))[0] || null;
}
