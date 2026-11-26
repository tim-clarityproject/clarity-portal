import { dayKeyWords } from '../time/index.js';
import { CURRENCY_LIST, moneyText } from '../agreements/currency.js';
import { kindOf, selfFunded } from '../agreements/terms.js';
import { firstPayment, hasRest, payTitle, restLine } from '../agreements/settling.js';
import { applies as coolingApplies, bookableFrom, SETTLE_LINE } from '../agreements/coolingOff.js';
import { balanceLine, entryLength, percentUsed } from '../agreements/hours.js';
import { quoteNumber } from '../agreements/quote.js';
import { UPFRONT_PERCENT, choiceOptions } from '../agreements/upfront.js';

// The client's side of an agreement and their money (Phase 6b run 3, Group C; M28 version 4: s-q-client, s-c-sign,
// s-c-change, s-c-asked, s-c-pay, s-c-signed, s-s-sign, s-s-signed, s-h-client, s-acct, s-payments), as plain rules with
// no database, so every line a page shows is here and tested (tests/performance/client-money.test.mjs).
//
// Clients invest and settle: no line here says pay, paid or payment (Apple Pay is a product name; agreements rule 2).
// Opened is the coach's only, so nothing here ever says the client opened anything (agreements rule 6).

const text = (v) => (typeof v === 'string' ? v.trim() : '');
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const cur = (t) => (CURRENCY_LIST.includes(t?.currency) ? t.currency : 'GBP');

export const AGREEMENT_TITLE = 'Your coaching agreement';
export const QUOTE_TITLE = 'Your coaching quote';
export const SPONSOR_TITLE = 'Coaching agreement';
export const READ_TIME = 'It takes ~5 minutes to read.';
export const NOTE_FALLBACK = 'Here is everything we agreed.';
export const ASK_CHANGE = 'Ask for a change';
export const ASK_LABEL = 'What would you like changed?';
export const BACK_TO_AGREEMENT = 'Back to your agreement';
export const AGREE_TICK = 'I’ve read this agreement and I agree to it.';
export const FULL_NAME = 'Your full name';
export const YOUR_ROLE = 'Your role';
export const DRAW = 'Draw your signature';
export const SIGN_HEADING = 'Sign';
export const SETTLE_QUESTION = 'How would you like to settle?';
export const BACS_LINE = 'You can set up Direct Debit for the rest straight after this.';
export const STAND_IN_CARD = 'Stripe’s secure card form sits here.';
export const STAND_IN_APPLE = 'Apple Pay opens on your device.';
export const STAND_IN_BACS = 'Stripe’s secure Direct Debit form sits here.';
export const WHAT_NEXT = 'What happens next';
export const PO_LABEL = 'Do you have a purchase order?';
export const PO_HINT = 'If you have one';
export const PAPER = 'Rather sign on paper? Download the PDF';

/** What is missing before signing, in M28's words (one line, in the alert above the button). */
export const SIGN_NEEDS = Object.freeze({
  tick: 'Tick the box to say you agree.',
  name: 'Add your full name.',
  signature: 'Draw or type your signature.',
  change: 'Say what you’d like changed.',
});

/** The first thing missing, or null when ready (M28's signClient and signSponsor, in that order). */
export function signNeeds({ agreed = false, name = '', hasSignature = false } = {}) {
  if (!agreed) return SIGN_NEEDS.tick;
  if (!text(name)) return SIGN_NEEDS.name;
  if (!hasSignature) return SIGN_NEEDS.signature;
  return null;
}

/** "Prepared for Sam Reid by Dr. Tim Dutton · Version 1" or "… · Quote Q-0042" (M28's cover). */
export function preparedLine({ clientName, coachName, version = null, quoteNo = null }) {
  const who = [text(clientName) && `Prepared for ${text(clientName)}`, text(coachName) && `by ${text(coachName)}`].filter(Boolean).join(' ');
  const tail = quoteNo ? `Quote ${quoteNumber(Number(quoteNo))}` : version ? `Version ${version}` : '';
  return [who, tail].filter(Boolean).join(' · ');
}

/** The coach's own note that opens the agreement and the quote (brief item 31), or M28's fallback. */
export const noteText = (note) => text(note) || NOTE_FALLBACK;

/** "8. Ending and changes": the clause a change was asked for, from the version's own clauses, else its words. */
export function pendingClause(changePending, clauses = []) {
  if (!changePending) return '';
  const key = text(changePending.clause_key ?? changePending.clauseKey);
  const c = (clauses || []).find((x) => x?.key === key);
  if (c && c.number && c.title) return `${c.number}. ${c.title}`;
  return text(changePending.title) || 'this agreement';
}

/** Brief item 36: the line that replaces the signing block while a change is unanswered. */
export const pendingLine = (clause, coachFirst) => `You asked for a change to ${clause || 'this agreement'}. ${text(coachFirst) || 'Your coach'} will look at it and send you a new version to sign.`;

/** s-c-asked: "Sent to Tim. You’ll get a new version to sign." */
export const askedLine = (coachFirst) => `Sent to ${text(coachFirst) || 'your coach'}. You’ll get a new version to sign.`;

/** "Send to Tim" (s-c-change). */
export const sendChangeWords = (coachFirst) => `Send to ${text(coachFirst) || 'your coach'}`;

/** "Ask Tim a question" (s-q-client). */
export const askQuestionWords = (coachFirst) => `Ask ${text(coachFirst) || 'your coach'} a question`;

/** The signing button: a self-funded client carries on to settle (M28's signBtn). */
export const signButton = (terms) => (selfFunded(terms) ? 'Sign and continue' : 'Sign my agreement');

/** The steps a reader has: a client funded by an organisation has no Settle (StepsMarker's steps). */
export const stepsFor = (terms) => (selfFunded(terms) && kindOf(terms) !== 'team' ? ['Read', 'Sign', 'Settle'] : ['Read', 'Sign']);

/**
 * The choice a version is read with: the one signed, else the one accepted on its quote (terms.choice: the break-it
 * tester, run 3, finding 7), else up front where the client chooses (item 37), else none.
 */
export function choiceFor(terms, settleChoice = null) {
  if (settleChoice === 'upfront' || settleChoice === 'plan') return settleChoice;
  if (terms?.choice === 'upfront' || terms?.choice === 'plan') return terms.choice;
  return 'upfront';
}

/** Where signing leads: settling the first amount (self-funded with something to settle), else the welcome. */
export function afterSigning(terms, choice, { amends = false } = {}) {
  // An amendment (a later version of an agreement signed before) settles nothing new at signing (agreements rule 12);
  // Welcome then asks whether the first signing's payment is settled (needsSettleCheck).
  return !amends && selfFunded(terms) && firstPayment(terms, choice) > 0 ? 'settle' : 'welcome';
}

/**
 * Whether Welcome asks the server if the first payment is settled before showing every step done: a self-funded
 * client's version with something to settle, and any amendment of one (its first payment is the first signing's, still
 * due until settled: the break-it tester, run 3, finding 2).
 */
export const needsSettleCheck = (terms, choice, { amends = false } = {}) => selfFunded(terms) && (amends || firstPayment(terms, choice) > 0);

/** An agreement that no longer runs (cancelled within 14 days, run out, ended): nothing to settle or welcome. */
export const ENDED_STATUSES = Object.freeze(['cancelled', 'expired', 'ended', 'ended_not_renewed']);
/** Its one calm line for Settle and Welcome (finding 1). */
export function endedLine(status, coachFirst = '') {
  const who = typeof coachFirst === 'string' && coachFirst.trim() ? coachFirst.trim() : 'your coach';
  if (status === 'cancelled') return `This agreement was cancelled, so there’s nothing to settle. Talk to ${who} if you’d like to start again.`;
  if (status === 'expired') return `This agreement ran out before it was signed, so there’s nothing to settle. Ask ${who} to open it again.`;
  return 'This agreement has ended, so there’s nothing to settle.';
}

/**
 * Everything the settle step (s-c-pay) shows: its title, the amount, the line about what follows, whether Direct Debit is
 * offered for the rest (pounds only: risk 16), the button's words and the 14-day line (self-funded individuals only).
 * `amountMinor` is the server's own first amount when it has answered (it wins), else the terms' (M28's firstPay).
 */
export function settleView(terms, choice, amountMinor = null) {
  const c = cur(terms);
  const amount = Number.isFinite(Number(amountMinor)) && Number(amountMinor) > 0 ? Math.round(Number(amountMinor)) : firstPayment(terms, choice);
  const rest = hasRest(terms, choice);
  return {
    title: payTitle(terms, choice),
    amount: moneyText(amount, c),
    amountMinor: amount,
    currency: c,
    rest: restLine(terms, choice),
    bacs: rest && c === 'GBP',
    button: `Settle ${moneyText(amount, c)}`,
    cooling: coolingApplies(terms) ? SETTLE_LINE : '',
  };
}

/** The Direct Debit step for the rest (brief item 8; Claude's words, M28 draws only the line that offers it). */
export const BACS = Object.freeze({
  title: 'Direct Debit',
  line: 'Set up Direct Debit once, and the rest is collected on each due date.',
  button: 'Set up Direct Debit',
  later: 'Not now',
  done: 'Direct Debit is set up.',
});

/** "You’re in, Sam." (s-c-signed). */
export const welcomeTitle = (first) => (text(first) ? `You’re in, ${text(first)}.` : 'You’re in.');

/**
 * M28's welcomeLine, without its "payment" (the brief: no pay word in client text): "Tim has your signed agreement, and
 * your first £1,484.70 is settled. Your receipt is in your email."
 */
export function welcomeLine({ coachFirst, settled = null }) {
  const who = text(coachFirst) || 'Your coach';
  return settled ? `${who} has your signed agreement, and your first ${settled} is settled. Your receipt is in your email.` : `${who} has your signed agreement. Your receipt is in your email.`;
}

/**
 * The first day a coaching session can be booked, said under Book your first coaching session: the start date, or the
 * day after the 14 days when that is later and the start-now box wasn't ticked (065's booking guard says the same), and
 * never a day before today (UI finding 7: a start already passed read "From Mon 16 Nov 2026").
 */
export function firstSessionLine({ terms, signedDay = null, startNow = false, today = null }) {
  const starts = DAY.test(terms?.startsOn || '') ? terms.startsOn : null;
  const guard = signedDay && DAY.test(signedDay) && coolingApplies(terms) ? bookableFrom(signedDay, Boolean(startNow)) : null;
  const from = [starts, guard, DAY.test(today || '') && (starts || guard) ? today : null].filter(Boolean).sort().pop();
  // This year's day without its year (writing rule 28), once today is known; without it the year shows.
  return from ? `From ${dayKeyWords(from, { year: !DAY.test(today || '') || today.slice(0, 4) !== from.slice(0, 4) })}` : 'Whenever suits you both';
}

/** The welcome's list (M28's three rows), with where each goes. */
export function welcomeRows({ terms, signedDay = null, startNow = false, today = null }) {
  return [
    { key: 'book', title: 'Book your first coaching session', meta: firstSessionLine({ terms, signedDay, startNow, today }) },
    { key: 'pack', title: 'Your welcome pack', meta: 'Getting started with the portal, ~6 minutes' },
    { key: 'signed', title: 'Your signed agreement and receipt', meta: 'In your email, and in My Account, Coaching' },
  ];
}
export const BOOK_FIRST = 'Book my first coaching session';

/** s-s-signed: "Signed. Tim has a copy, and we’ve emailed yours to you." */
export const sponsorSignedLine = (coachFirst) => `Signed. ${text(coachFirst) || 'Your coach'} has a copy, and we’ve emailed yours to you.`;
/** The sponsor's tick, for their organisation. */
export const sponsorTick = (org) => `I’ve read this agreement and I agree to it for ${text(org) || 'your organisation'}.`;
/** "Sign for Northfield Logistics". */
export const sponsorButton = (org) => (text(org) ? `Sign for ${text(org)}` : 'Sign');

/** A link's page that can't be used now: calm, what happened, then what to do (rule 28). */
export const LINK_WORDS = Object.freeze({
  notFound: 'This link isn’t working. Ask your coach to send it again.',
  quoteExpired: (coachFirst) => `This quote has run out. Ask ${text(coachFirst) || 'your coach'} to open it again.`,
  quoteAccepted: 'You’ve accepted this quote. Sign in to The Clarity Portal to read and sign your agreement.',
  accepted: 'Accepted. Now read and sign your agreement.',
  needsAccount: 'Accepted. We’ve emailed you a link to set up your account, then you can read and sign your agreement.',
  sponsorEnded: (coachFirst) => `This link has ended. Ask ${text(coachFirst) || 'your coach'} to send a new one.`,
  offline: 'This page needs a connection, so try again when you’re back online.',
  didntLoad: 'The page didn’t load. Check your connection and try again.',
  questionSent: (coachFirst) => `Sent to ${text(coachFirst) || 'your coach'}. They’ll reply by email.`,
  questionLabel: 'What would you like to ask?',
  questionNeeds: 'Say what you’d like to ask.',
});

// ---------------------------------------------------------------- My Account (s-acct), Invoices (s-payments), hours (s-h-client)

/** My Account's rows: Coaching, Invoices, Your plan, Block of hours, each only where it has something (M28 s-acct). */
export function accountRows({ hasAgreement = false, seesInvoices = false, planLine = null, hours = [] } = {}) {
  const rows = [];
  if (hasAgreement) rows.push({ key: 'coaching', title: 'Coaching', meta: 'Your agreement and its signed copies', to: '/coaching' });
  if (seesInvoices) rows.push({ key: 'invoices', title: 'Invoices', meta: 'Settle and download your invoices', to: '/my-account/invoices' });
  if (planLine) rows.push({ key: 'plan', title: 'Your plan', meta: planLine, to: '/my-account/plan' });
  if ((hours || []).length) rows.push({ key: 'hours', title: 'Block of hours', meta: hoursMeta(hours[0]), to: '/my-account/hours' });
  return rows;
}

/** "10 hours 40 minutes used of 13 hours 20 minutes" for My Account's row (M28 draws Adie's own words there). */
export function hoursMeta(h) {
  if (!h) return '';
  const block = Math.max(0, Math.round(Number(h.blockMinutes ?? h.block_minutes) || 0));
  const usedM = Math.max(0, Math.round(Number(h.usedMinutes ?? h.used_minutes) || 0));
  return `${percentUsed(usedM, block)}% used`;
}

const yearIf = (day, today) => dayKeyWords(day, { year: String(day).slice(0, 4) !== String(today).slice(0, 4) });

/**
 * One block of hours from my_hours(), tidied for s-h-client: the meter's share, the balance line and each entry (the
 * newest first) with its day and length. Null when it can't be drawn.
 */
export function hoursView(raw, today) {
  if (!raw || typeof raw !== 'object') return null;
  const block = Math.max(0, Math.round(Number(raw.block_minutes) || 0));
  const usedM = Math.max(0, Math.round(Number(raw.used_minutes) || 0));
  const entries = (Array.isArray(raw.entries) ? raw.entries : [])
    .filter((e) => e && DAY.test(e.day || '') && Number(e.minutes) > 0)
    .sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0))
    .map((e, i) => ({ key: `${e.day}-${i}`, title: text(e.note) || 'Time logged', meta: yearIf(e.day, today), length: entryLength(Math.round(Number(e.minutes))) }));
  return {
    id: raw.agreement_id || raw.version_id || 'hours',
    work: text(raw.work),
    share: block > 0 ? Math.min(1, usedM / block) : 0,
    line: balanceLine(usedM, block),
    entries,
  };
}

/** An invoice row on My Account, Invoices (s-payments): its words, whether it's overdue, and what it offers. */
export function invoiceRow(inv, today) {
  const c = CURRENCY_LIST.includes(inv.currency) ? inv.currency : 'GBP';
  const amount = moneyText(inv.totalMinor, c);
  if (inv.status === 'paid') {
    const day = inv.paidDay || null;
    return { id: inv.id, number: inv.number, meta: day ? `${amount}, settled ${yearIf(day, today)}` : `${amount}, settled`, settled: true, overdue: false, url: inv.hostedUrl };
  }
  const overdue = Boolean(inv.dueOn && today && inv.dueOn < today);
  return { id: inv.id, number: inv.number, meta: inv.dueOn ? `${amount}, due ${yearIf(inv.dueOn, today)}` : amount, settled: false, overdue, url: inv.hostedUrl };
}

/** Every invoice, the ones to settle first (due first), then the settled ones (newest number first). */
export function invoiceList(invoices, today) {
  const num = (inv) => Number(String(inv.number).replace(/^\D+/, '')) || 0;
  const open = (invoices || []).filter((i) => i.status !== 'paid').sort((a, b) => (a.dueOn || '9') < (b.dueOn || '9') ? -1 : (a.dueOn || '9') > (b.dueOn || '9') ? 1 : num(a) - num(b));
  const done = (invoices || []).filter((i) => i.status === 'paid').sort((a, b) => num(b) - num(a));
  return [...open, ...done].map((i) => invoiceRow(i, today));
}

export const INVOICES = Object.freeze({
  title: 'Invoices',
  eye: 'Only you can see this.',
  settle: 'Settle my invoice',
  download: 'Download PDF',
  overdue: 'Overdue',
  none: 'No invoices yet.',
  funded: (org) => `${text(org) || 'Your organisation'} funds your coaching, so there’s nothing for you to settle.`,
  offline: 'That needs a connection, so try again when you’re back online.',
});

/** The device's copy of the client's blocks of hours (pageCache). */
export const HOURS_CACHE = 'my-hours';

export const HOURS = Object.freeze({
  title: 'Your block of hours',
  none: 'No block of hours yet.',
});

/* ------------------------------------------------------------------ Polish 1, Stage C (C3): Read, Sign and Settle in focus mode */
// M28 v6 "sign" and "quote": the three steps as one flow in the tool frame, the clauses opening one at a time, Ask for a
// change as Quick Add, the quotation's Included, Add if you'd like and In all. Run 3's words above stay where they are
// tested and still read right; these are the flow's own.

export const FLOW = Object.freeze({
  points: 'The main points',
  agreement: 'The agreement',
  ask: 'Ask for a change',
  askLabel: 'What would you like changed?',
  askPlaceholder: 'Could the notice be 48 hours?',
  askSend: (coachFirst) => `Send to ${text(coachFirst) || 'your coach'}`,
  askSent: (coachFirst) => `Sent to ${text(coachFirst) || 'your coach'}. You can sign once ${text(coachFirst) ? 'they reply' : 'your coach replies'} with a new version.`,
  readNext: 'I’ve read it',
  signQuestion: 'Sign',
  signNext: 'Sign',
  agreementLabel: 'Your coaching agreement',
  settleWhen: 'Up front or over time?',
  settleHow: 'How would you like to settle?',
  doneTitle: 'You’re all set',
  doneSteps: 'Done',
  signedSteps: 'Signed',
  quoteTitle: 'Your quotation',
  included: 'Included',
  addIf: 'Add if you’d like',
  inAll: 'In all',
  accept: 'Accept and sign',
});

/** "16 clauses". */
export const clauseCount = (n) => `${n} ${n === 1 ? 'clause' : 'clauses'}`;

/** The Read step's eyebrow (M28: "Prepared for Sam by Dr. Tim Dutton"), first name where there is one. */
export function preparedFor({ clientFirst, clientName, coachName }) {
  const who = text(clientFirst) || text(clientName).split(/\s+/)[0] || '';
  return [who && `Prepared for ${who}`, text(coachName) && `by ${text(coachName)}`].filter(Boolean).join(' ') || FLOW.agreementLabel;
}

/** The done screen's line (M28 v6: "Tim has your signed agreement. A copy is on its way to your email."), with what was settled. */
export function doneLine({ coachFirst, settled = null }) {
  const who = text(coachFirst) || 'Your coach';
  return settled ? `${who} has your signed agreement, and your first ${settled} is settled. A copy is on its way to your email.` : `${who} has your signed agreement. A copy is on its way to your email.`;
}

/** The quotation's label (M28: "Quotation Q-0042 · Valid until Fri 25 Dec"). */
export function quoteLabel({ number = null, validUntil = null }) {
  const n = Number.isInteger(number) && number > 0 ? `Quotation ${quoteNumber(number)}` : 'Quotation';
  return DAY.test(validUntil || '') ? `${n} · Valid until ${dayKeyWords(validUntil)}` : n;
}

/**
 * The Up front or the plan switch's words (M28 quote: "Up front, 5% off" and "Monthly"): short words in the switch, the
 * full words of the one chosen under it. `planLabel` is settleOptions' label for the coach's way of settling.
 */
export function settleSwitchOptions(terms, planLabel, chosen) {
  const retainer = kindOf(terms) === 'retainer';
  const way = terms?.settle;
  const long = choiceOptions(terms, planLabel, chosen);
  const plan = retainer || way === 'equal' ? 'Monthly' : way === 'deposit' ? 'Deposit, then monthly' : way === 'delivered' ? 'As delivered' : 'Over time';
  return [
    { value: 'upfront', short: retainer ? `6 months, ${UPFRONT_PERCENT}% off` : `Up front, ${UPFRONT_PERCENT}% off`, long: long[0]?.label || '' },
    { value: 'plan', short: plan, long: long[1]?.label || text(planLabel) },
  ];
}
