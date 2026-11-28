// The billing and agreement emails (Phase 6b run 1, step 9), each as a
// document for the one shared template (template.js), in the words Tim
// approved on 23 Nov 2026 (draft-2-emails.md), word for word; names,
// amounts, days and times come from the data, never typed.
//
// - Overdue invoice reminders and agreements come from the client's coach,
//   written as "I" and signed with the coach's first name on the last line.
//   "A change asked for" goes to the coach from The Clarity Portal.
// - Money is invested and settled, never paid or cost; organisations fund.
// - A funded client never sees money in any email: no agreement email
//   carries an amount, whoever reads it. Only the reminders do, and they go
//   to whoever settles the invoice (the client, or the organisation's
//   finance contact, with the line naming the coachee and the PO).
// - Nothing here sends by itself: each goes when the coach presses Send
//   (the reminders and the agreements), or when a client asks for a change.
//   Attachments (the agreement PDFs) are added by the sender.
import { EMAIL_SIGN_OFF, oneLine, safeHref } from './template.js';
import { greeting } from './emails.js';
import { dayWords, timeWords } from '../time/index.js';

import { possessive } from '../possessive.js';
const firstOf = (name) => oneLine(name).split(' ')[0];

/** The coach's first name, alone on the last line (draft-2: "Tim"). A coach's email always has one. */
function coachLine(coachFirst) {
  const name = firstOf(coachFirst).slice(0, 60);
  if (!name) throw new Error('An email from a coach needs the coach’s first name.');
  return name;
}

/** A link to Stripe's page or the portal: an https address only, never localhost or anything else. */
function httpsOnly(href) {
  if (typeof href !== 'string' || !/^https:\/\//i.test(href)) throw new Error('An email link must be an https address.');
  return safeHref(href);
}

const footer = (why) => ({ lines: [why, EMAIL_SIGN_OFF] });

// ---------------------------------------------------------------- overdue invoice reminders (3, 7 and 14 days)
export const REMINDER_STAGES = Object.freeze([3, 7, 14]);

/**
 * "It’s for Sam Reid’s coaching, purchase order PO-7781." for an organisation; without a PO the sentence ends after
 * "coaching" ("It’s for Sam Reid’s coaching."), so it stays whole. Null for a client settling their own invoice.
 */
export function organisationLine(coachee, poNumber = null) {
  const who = oneLine(coachee);
  if (!who) return null;
  const po = oneLine(poNumber);
  return po ? `It’s for ${possessive(who)} coaching, purchase order ${po}.` : `It’s for ${possessive(who)} coaching.`;
}

/**
 * An overdue invoice reminder, from the coach, to whoever settles it. Sent only when the coach presses Send.
 * @param {object} o
 * @param {3|7|14} o.stage            days overdue
 * @param {string} o.firstName        the reader's first name: the client's, or the finance contact's
 * @param {string} o.number           "CLARITY-1243"
 * @param {string} o.amountWords      "£3,000" (money.js's moneyWords)
 * @param {string} o.dueDayWords      "Mon 16 Nov"
 * @param {string} [o.settleByWords]  the 14-day one only: "Fri 4 Dec", worked out when it goes (money.js's settleBy)
 * @param {string} o.coachFirst       the coach's first name, who signs it
 * @param {string} o.settleLink       Stripe's own page for this invoice (https only)
 * @param {string|null} [o.coachee]   for an organisation: whose coaching it is ("Sam Reid")
 * @param {string|null} [o.poNumber]  for an organisation: its purchase order, when there is one
 * @param {boolean} [o.toOrganisation] to an organisation's finance contact (its own words: "Pay the invoice")
 * @param {number} [o.daysOverdue]    how many days overdue it is on the day it's drafted or sent: the 7-day and 14-day
 *   texts state it truly ("now 9 days past its due date"), the stage still choosing which reminder it is (Stage D, F3)
 */
export function invoiceReminderEmail({ stage, firstName, number, amountWords, dueDayWords, settleByWords = null, coachFirst, settleLink, coachee = null, poNumber = null, toOrganisation = false, daysOverdue = null }) {
  if (!REMINDER_STAGES.includes(stage)) throw new Error('A reminder goes at 3, 7 or 14 days overdue.');
  const inv = oneLine(number);
  const amount = oneLine(amountWords);
  if (!/^CLARITY-\d+$/.test(inv) || !amount) throw new Error('A reminder needs the invoice’s number and amount.');
  const by = oneLine(settleByWords);
  if (stage === 14 && !by) throw new Error('The 14-day reminder needs its settle-by day, worked out when it goes.');
  const coach = coachLine(coachFirst);
  const forWhom = organisationLine(coachee, poNumber);
  // An organisation's finance contact gets the conventional words (Q10, Polish 1); a client settles their own.
  const org2 = Boolean(forWhom) || toOrganisation === true;
  const settle = org2 ? 'pay' : 'settle';
  const button = { type: 'button', label: org2 ? 'Pay the invoice' : 'Settle my invoice', href: httpsOnly(settleLink) };
  const org = forWhom ? { type: 'text', text: forWhom } : null;
  // The true count, never fewer days than the stage itself (a reminder drafted late says how late it really is).
  const late = Number.isInteger(daysOverdue) && daysOverdue >= stage ? daysOverdue : stage;
  const words = {
    3: {
      subject: `Invoice ${inv} is now due`,
      blocks: [
        { type: 'text', text: 'I hope the coaching is going well.' },
        { type: 'text', text: `Invoice ${inv} for ${amount} was due on ${oneLine(dueDayWords)}.` },
        org,
        { type: 'text', text: `You can ${settle} it here in a couple of minutes.` },
        button,
        { type: 'text', text: 'If it’s already on its way, thank you, and you can ignore this.' },
      ],
    },
    7: {
      subject: `A reminder about invoice ${inv}`,
      blocks: [
        { type: 'text', text: `Invoice ${inv} for ${amount} is now ${late} days past its due date.` },
        org,
        { type: 'text', text: `Could you ${settle} it this week?` },
        button,
        { type: 'text', text: 'If something’s getting in the way, just reply and we’ll find what works.' },
      ],
    },
    14: {
      subject: `Invoice ${inv} is ${late} days overdue`,
      blocks: [
        { type: 'text', text: `Invoice ${inv} for ${amount} is now ${late} days overdue.` },
        org,
        { type: 'text', text: `I’d like to keep our coaching sessions going without a gap, so please ${settle} it by ${by}.` },
        button,
        { type: 'text', text: 'If there’s a problem, reply to this email and let’s talk it through.' },
      ],
    },
  }[stage];
  return {
    brand: 'portal',
    subject: words.subject,
    blocks: [{ type: 'heading', text: greeting(firstName) }, ...words.blocks, { type: 'text', text: coach }],
    footer: footer(`You get this because invoice ${inv} was sent to you.`),
  };
}

// ---------------------------------------------------------------- agreements (each sent only when the coach presses Send)
/**
 * Ready to sign: to the client, from the coach, who has already signed. No money, whoever reads it.
 * @param {{ firstName: string, coachFirst: string, link: string }} o  link: the client's signing page (https only)
 */
export function agreementReadyEmail({ firstName, coachFirst, link }) {
  const coach = coachLine(coachFirst);
  return {
    brand: 'portal',
    subject: 'Your coaching agreement is ready to sign',
    blocks: [
      { type: 'heading', text: greeting(firstName) },
      { type: 'text', text: 'I’m really looking forward to working with you.' },
      { type: 'text', text: 'Your coaching agreement is ready, and I’ve already signed it.' },
      { type: 'text', text: 'It takes ~5 minutes to read, and you sign it in the portal.' },
      { type: 'text', text: 'If anything doesn’t look right, you can ask for a change on any part of it.' },
      { type: 'button', label: 'Read and sign my agreement', href: httpsOnly(link) },
      { type: 'text', text: coach },
    ],
    footer: footer(`You get this because ${coach} is your coach.`),
  };
}

/** The most characters of a client's own words a change email quotes. */
export const CHANGE_WORDS_MAX = 2000;

/**
 * A change asked for: to the coach, from The Clarity Portal, with the section as the client saw it (its number and
 * title) and the client's own words, quoted as text on one line.
 * @param {{ clientFirst: string, sectionNumber: number, sectionTitle: string, words: string, link: string }} o
 */
export function agreementChangeAskedEmail({ clientFirst, sectionNumber, sectionTitle, words, link }) {
  const client = firstOf(clientFirst).slice(0, 60) || 'Your client';
  const n = Number(sectionNumber);
  const title = oneLine(sectionTitle);
  if (!Number.isInteger(n) || n < 1 || !title) throw new Error('A change asked for names its section’s number and title.');
  const said = oneLine(words).slice(0, CHANGE_WORDS_MAX);
  return {
    brand: 'portal',
    subject: `${client} has asked for a change to their agreement`,
    blocks: [
      { type: 'heading', text: `${client} has asked for a change to section ${n}, ${title}.` },
      said ? { type: 'text', text: `They wrote: “${said}”` } : null,
      { type: 'button', label: 'Open the agreement', href: httpsOnly(link) },
    ],
    footer: footer(`You get this because ${client} is one of your clients.`),
  };
}

/**
 * Signed: to the client, from the coach. The signed PDF is attached by the sender. The first session line only when a
 * first session is booked: "Your first coaching session is on Mon 4 Jan at 10:00 UK time on Zoom.", in the reader's
 * own zone. No money, whoever reads it.
 * @param {{ firstName: string, coachFirst: string, firstSession?: { at: Date|string, zone: string, placeKind?: string }|null }} o
 */
export function agreementSignedEmail({ firstName, coachFirst, firstSession = null }) {
  const coach = coachLine(coachFirst);
  const s = firstSession && firstSession.at && firstSession.zone ? firstSession : null;
  const place = s ? (s.placeKind === 'in_person' ? 'in person' : s.placeKind === 'phone' ? 'by phone' : 'on Zoom') : '';
  return {
    brand: 'portal',
    subject: 'Your signed coaching agreement',
    blocks: [
      { type: 'heading', text: greeting(firstName) },
      { type: 'text', text: 'Thanks for signing your coaching agreement.' },
      { type: 'text', text: 'Your copy is attached, and it’s always in My Account, Coaching.' },
      { type: 'text', text: 'Let’s get started.' },
      s ? { type: 'text', text: `Your first coaching session is on ${dayWords(s.at, s.zone)} at ${timeWords(s.at, s.zone)} ${place}.` } : null,
      { type: 'text', text: coach },
    ],
    footer: footer(`You get this because ${coach} is your coach.`),
  };
}

/**
 * The sponsor agreement: to the organisation's sponsor, from the coach, with the PDF signed on the coach's side
 * attached by the sender.
 * @param {{ sponsorFirst: string, coachee: string, coachFirst: string }} o  coachee: the client's full name ("Sam Reid")
 */
export function sponsorAgreementEmail({ sponsorFirst, coachee, coachFirst }) {
  const coach = coachLine(coachFirst);
  const full = oneLine(coachee).slice(0, 120);
  if (!full) throw new Error('A sponsor agreement names whose coaching it is.');
  return {
    brand: 'portal',
    subject: `Coaching agreement for ${full}`,
    blocks: [
      { type: 'heading', text: greeting(sponsorFirst) },
      { type: 'text', text: `I’ve attached the coaching agreement for ${possessive(firstOf(full))} coaching, signed on my side.` },
      { type: 'text', text: 'Please sign and date it, then send the signed copy back to me.' },
      { type: 'text', text: 'If you’d like anything changed, reply and I’ll send a new version.' },
      { type: 'text', text: coach },
    ],
    footer: footer(`You get this because you’re the sponsor for ${possessive(full)} coaching.`),
  };
}
