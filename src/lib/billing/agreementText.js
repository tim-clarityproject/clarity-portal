import { datesWords, moneyWords } from './money.js';

// The coaching agreement's words (Phase 6b run 1), from draft-1-agreement-wording.md, approved by Tim on 23 Nov 2026,
// copied word for word: only the bracketed parts are filled in from each client's terms, and clients never see a
// bracket. The coach's name comes from each client's own coach, never a fixed name. Shared by the signing screens, the
// coach's Agreement fold and the PDF; checked by tests/performance/billing-agreement-text.test.mjs.
//
// An organisation-funded client who isn't the sponsor sees no money: no investment row in Main points (Funded by in its
// place), and no "Your investment" section (the sections after it are numbered on, so none is ever missing a number).

export const PROVIDER = Object.freeze({
  name: 'The Clarity Project LTD', number: '12817337', address: '30 Francis Green Lane, Penkridge, Stafford, ST19 5HF',
});

/**
 * The terms an agreement is written from (agreement_versions.terms). Amounts in minor units.
 * @typedef {{ coaching: string, sessions?: number, minutes: number, place?: string, rhythm: string, startsOn?: string,
 *   endsOn?: string, ongoing?: boolean, currency?: 'GBP'|'USD', total_minor?: number, instalments?: number,
 *   fundedBy?: string|null, goals?: string, contactWays?: string, termsDays?: number, vat?: boolean,
 *   clientName: string, clientEmail: string, coachName: string, coachFirst: string }} Terms
 */

const sessionsWords = (t) => `${t.sessions} ${t.sessions === 1 ? 'session' : 'sessions'} of ${t.minutes} minutes on ${t.place || 'Zoom'}, ${t.rhythm}`;
const investmentWords = (t) => {
  const total = moneyWords(t.total_minor, t.currency || 'GBP');
  const n = Number(t.instalments) || 1;
  if (n <= 1) return `${total}, in full`;
  return `${total}, in ${n} monthly instalments of ${moneyWords(Math.floor(t.total_minor / n), t.currency || 'GBP')}`;
};

/** Main points, at a glance, in the wording file's order. A funded client's view has Funded by in place of the money. */
export function mainPoints(t, { seesMoney = !t.fundedBy } = {}) {
  const rows = [
    ['Coaching provider', PROVIDER.name],
    ['Your coach', t.coachName],
    ['Your coaching', t.coaching],
    ['Coaching sessions', t.ongoing && !t.sessions ? `${t.minutes}-minute sessions on ${t.place || 'Zoom'}, ${t.rhythm}` : sessionsWords(t)],
    ['Dates', datesWords({ ongoing: t.ongoing, startsOn: t.startsOn, endsOn: t.endsOn })],
  ];
  // Funded: Funded by, instead of the investment row (the wording file), for everyone who reads this agreement.
  if (t.fundedBy) rows.push(['Funded by', t.fundedBy]);
  else if (seesMoney && t.total_minor != null) rows.push(['Your investment', investmentWords(t)]);
  rows.push(['Rearranging', 'Up to 24 hours before, at no charge'], ['Session summaries', 'Shared with you automatically'], ['Ending early', '30 days’ notice, in writing, from either of us']);
  return rows.filter(([, v]) => v).map(([label, value]) => ({ label, value }));
}

/**
 * The agreement's sections, numbered as the reader sees them: { key, number, title, paragraphs, money }. `key` stays the
 * same whoever reads it (a change asked for names it); `money` marks the one section a funded client never sees.
 */
export function clauses(t, { seesMoney = !t.fundedBy } = {}) {
  const all = [
    { key: 'parties', title: null, paragraphs: [
      `This agreement is between ${PROVIDER.name}, company number ${PROVIDER.number}, of ${PROVIDER.address}, and ${t.clientName} of ${t.clientEmail}.`,
      `Your coach is ${t.coachName}.`] },
    { key: 'purpose', title: 'Purpose', paragraphs: [
      'The coaching is here to help you perform at your best in a demanding role, and to make real progress on the goals you set in your First check-in.',
      `Your goals: ${t.goals || 'the goals you set in your First check-in'}.`,
      'You and your coach review these goals together as the coaching goes on, and you can change them at any time.'] },
    { key: 'coaching', title: 'The coaching', paragraphs: [
      `You have ${t.sessions} coaching sessions of ${t.minutes} minutes, ${t.rhythm}, on ${t.place || 'Zoom'}.`,
      'The Clarity Portal is included for the length of this agreement, with every tool available to you.',
      `Between coaching sessions you can reach your coach by ${t.contactWays || 'email or the portal’s chat'}, and they reply within 2 working days.`,
      'Your coaching sessions are recorded with Fathom to write your session summary, only with your agreement. You can say no to recording at any time, for one session or for all of them.'] },
    { key: 'investment', money: true, title: 'Your investment', paragraphs: [
      `Your investment is ${moneyWords(t.total_minor ?? 0, t.currency || 'GBP')} in ${t.currency === 'USD' ? 'dollars' : 'pounds'}, ${Number(t.instalments) > 1 ? `in ${t.instalments} monthly instalments` : 'in full'}.`,
      `Invoices come from Stripe and are due within ${t.termsDays || (t.fundedBy ? 30 : 14)} days. You can settle each one by card, Apple Pay or bank transfer, and instalments can be by Direct Debit.`,
      ...(t.vat ? ['Prices exclude VAT, which is added at the current rate.'] : []),
      'Travel and other agreed expenses, if any, are invoiced at cost, either with the next invoice or on their own.',
      'If an invoice is unpaid 14 days after it’s due, your coach may pause new coaching sessions until it’s settled, after talking to you first.'] },
    { key: 'rearranging', title: 'Rearranging and cancelling', paragraphs: [
      'You can rearrange or cancel a coaching session at no charge up to 24 hours before it starts, from the portal or by letting your coach know.',
      'A coaching session cancelled with less than 24 hours’ notice, or missed, counts as used.',
      'Your coach can waive this when something exceptional happens.',
      'If your coach needs to rearrange, they offer you a new time, and the coaching session is never counted as used.'] },
    { key: 'confidentiality', title: 'Confidentiality and records', paragraphs: [
      'What you share in coaching stays between you and your coach.',
      'It is not shared with anyone else, including an organisation that funds your coaching, without your agreement.',
      'The only exceptions are where there is a serious risk of harm to you or someone else, or where the law requires it. Your coach would talk to you first wherever they can.',
      'Your coach keeps private notes and session summaries for this coaching. Recordings are kept until this agreement ends, then deleted.',
      'Your coach may discuss their practice in professional supervision, without naming you.'] },
    { key: 'data', title: 'Your data', paragraphs: [
      'The Clarity Portal keeps your data securely, as the privacy notice explains.',
      'You choose what your coach sees in the portal, and you can change it any time in My Account.',
      'You can download or delete your data at any time. Coaching records such as this agreement and invoices are kept for 6 years after it ends, because UK law requires it.'] },
    { key: 'responsibilities', title: 'Responsibilities', paragraphs: [
      'Your coach turns up prepared, keeps to this agreement, and is honest with you, including when coaching isn’t the right support for something.',
      'You own your decisions and the actions you take between coaching sessions, and you tell your coach early if something isn’t working.',
      'Coaching isn’t therapy, counselling or medical advice. If something would be better helped by another professional, your coach will say so and can suggest someone.'] },
    { key: 'ending', title: 'Ending and changes', paragraphs: [
      'Either of you can end this agreement early with 30 days’ notice in writing.',
      'Coaching sessions not used by the end date expire, unless you and your coach agree to extend it.',
      'If you end early, coaching sessions already invested in and not yet used are refunded, less any that counted as used.',
      'Any change to this agreement is made as a new version that you both sign. Every version is kept.',
      'Your portal account stays open after the agreement ends, so your plans and records stay yours.'] },
    { key: 'concerns', title: 'Concerns and law', paragraphs: [
      'If you have a concern, tell your coach first. If it isn’t resolved, you and your coach agree on an independent mediator to help.',
      'This agreement is governed by the law of England and Wales.'] },
    { key: 'signatures', title: 'Signatures', paragraphs: [
      `Signed for ${PROVIDER.name} by ${t.coachName}, then by you.`,
      'The signing record shows each person’s verified email, the date and time, and the document’s fingerprint.'] },
  ];
  let n = 0;
  return all.filter((c) => seesMoney || !c.money).map((c) => ({ ...c, money: c.money === true, number: c.title ? (n += 1) : null }));
}

/** The signing screens' and the PDF's own words (the wording file's last table), with the coach's first name filled in. */
export const signingWords = (coachFirst) => Object.freeze({
  homeLine: 'Your coaching agreement is ready to sign.',
  title: 'Your coaching agreement',
  readTime: 'It takes ~5 minutes to read.',
  askChange: 'Ask for a change',
  askLabel: 'What would you like changed?',
  asked: `Sent to ${coachFirst}. You’ll get a new version to sign.`,
  tick: 'I’ve read this agreement and I agree to it.',
  fullName: 'Your full name',
  drawFirst: 'Draw your signature',
  clear: 'Clear', useThis: 'Use this signature', typeInstead: 'Type instead',
  savedSign: 'Sign with my saved signature', drawNew: 'Draw a new signature',
  sign: 'Sign my agreement',
  signed: `Signed. ${coachFirst} has a copy, and yours is in My Account, Coaching.`,
  pdfTitle: 'Coaching agreement',
  pdfRecord: 'Signing record',
});

/** The PDF's details line: "[Client name], [date], reference [CLARITY-AG-0001], version [1]". */
export const pdfDetails = ({ clientName, dayWords, reference, version }) => `${clientName}, ${dayWords}, reference ${reference}, version ${version}`;

// ---------------------------------------------------------------- Phase 6b run 3 (065)
// The five kinds' wording now lives in src/lib/agreements (standardWording.js, clauses.js): paragraphs with their
// reasons, numbered with no gaps, the coach's own standards and each agreement's edits. A version made from 065 on
// stores those clauses as sent (version.clauses: { key, number, title, paragraphs: [{ text, why }], money, choices? }),
// and every page and PDF reads a version's own stored clauses. The functions above stay for versions written before
// 065 (run 1's shape: paragraphs as plain strings), so nothing already sent or signed reads differently.
export { buildClauses, forStorage, resolveChoice, clauseTitle, mainPoints as agreementMainPoints, teamPoints, hoursPoints } from '../agreements/clauses.js';
export { STANDARD, clauseKeys } from '../agreements/standardWording.js';
/** Whether a stored clause is 065's shape (paragraphs of { text, why }) rather than run 1's (plain strings). */
export const isNewClause = (c) => Array.isArray(c?.paragraphs) && c.paragraphs.some((p) => p && typeof p === 'object' && 'text' in p);
