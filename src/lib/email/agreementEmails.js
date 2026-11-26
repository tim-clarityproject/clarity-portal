// The agreement, quote and invoicing emails of Phase 6b run 3 (M28 version 4: s-c-email, s-s-email, s-n-signrem; plan
// section 5), each a document for the one shared template (template.js), so the HTML and the plain text never differ.
//
// - Each comes from the coach, written as "I" and signed with the coach's first name on the last line; the server sends
//   it with the coach's name and Reply-To the coach (risk 13), never by itself: only when the coach presses Send (a
//   quote, an agreement, a reminder, an invoice) or as the direct result of what someone just did (a sponsor's signed
//   copy, the agreements a team's sponsor starts).
// - The personal note from the package opens the email (brief item 31), as the coach left it before sending.
// - Money is invested and settled, never "pay" (Apple Pay is a product name); no late-payment interest anywhere
//   (brief item 32). A client funded by an organisation never sees money in an email.
// - M28's words where M28 draws the email (Ready to sign, the quote, the signing reminder, the sponsor's email); the
//   others are Claude's, for Tim to approve, written in the same voice (marked CLAUDE below).
// Every example is on /email-preview (src/pages/emailPreview/examples.js); checked by tests/performance/agreement-emails.test.mjs.
import { EMAIL_SIGN_OFF, oneLine, safeHref } from './template.js';
import { greeting } from './emails.js';

const firstOf = (name) => oneLine(name).split(' ')[0];
const possessive = (name) => `${name}’s`;

function coachLine(coachFirst) {
  const name = firstOf(coachFirst).slice(0, 60);
  if (!name) throw new Error('An email from a coach needs the coach’s first name.');
  return name;
}

/** The coach's own note, kept to its paragraphs (blank lines between them), each one line of text. */
export function noteBlocks(note) {
  return String(note ?? '').split(/\n\s*\n/).map(oneLine).filter(Boolean).slice(0, 8).map((text) => ({ type: 'text', text: text.slice(0, 1000) }));
}

/** The coach's edited wording (Edit on a drafted reminder): its paragraphs, or null to keep the drafted words. */
export function editedBlocks(text) {
  const blocks = noteBlocks(text);
  return blocks.length ? blocks : null;
}

const link = (label, href) => ({ type: 'button', label, href: safeHref(href) });
const footer = (why) => ({ lines: [why, EMAIL_SIGN_OFF] });
const coachFooter = (coach) => footer(`You get this because ${coach} is your coach.`);

/** M28's default note when the coach leaves none ("Here is everything we agreed."). */
export const DEFAULT_NOTE = 'Here is everything we agreed.';

// ---------------------------------------------------------------- an agreement and a quote (M28 s-c-email)

/**
 * M28 v6 "email" (Polish 1, Stage C): the line saying what the agreement is, "Here’s the agreement for your six months
 * of coaching, starting on Monday 4 January.", when the caller knows it (`what`: "six months of coaching", `startsWords`:
 * "Monday 4 January"); null otherwise.
 */
export function agreementForLine(what, startsWords) {
  const w = oneLine(what).slice(0, 160);
  const s = oneLine(startsWords).slice(0, 60);
  if (!w) return null;
  return `Here’s the agreement for your ${w}${s ? `, starting on ${s}` : ''}.`;
}

/**
 * Ready to sign (M28 s-c-email; v6 "email"): the note first, then what the agreement is (when `what` is given), how
 * long it takes, one button.
 * @param {{ firstName: string, coachFirst: string, note?: string, link: string, what?: string, startsWords?: string }} o
 *   link: the client's signing page
 */
export function readyToSignEmail({ firstName, coachFirst, note = '', link: href, what = '', startsWords = '' }) {
  const coach = coachLine(coachFirst);
  const blocks = noteBlocks(note);
  const forLine = agreementForLine(what, startsWords);
  return {
    brand: 'portal',
    subject: 'Your coaching agreement is ready to sign',
    blocks: [
      { type: 'heading', text: greeting(firstName) },
      // M28 v6: the note and what the agreement is read as one paragraph ("Thank you for this morning. Here’s …").
      ...(blocks.length
        ? (forLine ? [...blocks.slice(0, -1), { ...blocks[blocks.length - 1], text: `${blocks[blocks.length - 1].text} ${forLine}` }] : blocks)
        : [{ type: 'text', text: forLine || DEFAULT_NOTE }]),
      { type: 'text', text: 'It takes ~5 minutes to read and sign.' },
      link('Read and sign', href),
      { type: 'text', text: coach },
    ],
    footer: coachFooter(coach),
  };
}

/**
 * The quote (M28 s-c-email with a quote sent): the note first, then accept, sign and settle in one go.
 * @param {{ firstName: string, coachFirst: string, note?: string, link: string, number: string, validUntilWords: string }} o
 */
export function quoteEmail({ firstName, coachFirst, note = '', link: href, number, validUntilWords }) {
  const coach = coachLine(coachFirst);
  const q = oneLine(number);
  if (!/^Q-\d{4,9}$/.test(q)) throw new Error('A quote email names its Q- number.');
  const blocks = noteBlocks(note);
  return {
    brand: 'portal',
    subject: `Your coaching quote from ${coach}`,
    blocks: [
      { type: 'heading', text: greeting(firstName) },
      ...(blocks.length ? blocks : [{ type: 'text', text: DEFAULT_NOTE }]),
      { type: 'text', text: 'It takes ~5 minutes to read, and you can accept, sign and settle in one go.' },
      link('See my quote', href),
      // CLAUDE: the quote's number and how long it stands, quietly, under the button.
      oneLine(validUntilWords) ? { type: 'text', text: `Quote ${q}, valid until ${oneLine(validUntilWords)}.`, quiet: true } : null,
      { type: 'text', text: coach },
    ],
    footer: coachFooter(coach),
  };
}

/**
 * The signing reminder (M28 s-n-signrem), drafted at 3 and 7 days, sent only when the coach presses Send. `lines`:
 * the coach's own words after Edit, replacing the drafted ones (the button and the name stay).
 */
export function signReminderEmail({ firstName, coachFirst, link: href, lines = null }) {
  const coach = coachLine(coachFirst);
  return {
    brand: 'portal',
    subject: 'Your coaching agreement is ready to sign',
    blocks: [
      { type: 'heading', text: greeting(firstName) },
      ...(editedBlocks(lines) || [
        { type: 'text', text: 'Just a nudge that your coaching agreement is waiting for you in the portal.' },
        { type: 'text', text: 'If anything in it doesn’t work for you, ask for a change on that clause and I’ll look at it.' },
      ]),
      link('Read and sign', href),
      { type: 'text', text: coach },
    ],
    footer: coachFooter(coach),
  };
}

/**
 * CLAUDE: the first payment isn't settled 24 hours after signing (brief item 10), drafted for the coach to send.
 * @param {{ firstName: string, coachFirst: string, link: string, amountWords: string, lines?: string|null }} o
 */
export function firstPaymentReminderEmail({ firstName, coachFirst, link: href, amountWords, lines = null }) {
  const coach = coachLine(coachFirst);
  const amount = oneLine(amountWords);
  return {
    brand: 'portal',
    subject: 'Your first coaching invoice is ready to settle',
    blocks: [
      { type: 'heading', text: greeting(firstName) },
      ...(editedBlocks(lines) || [
        { type: 'text', text: 'Thanks for signing your coaching agreement.' },
        { type: 'text', text: amount ? `Your first invoice, ${amount}, isn’t settled yet.` : 'Your first invoice isn’t settled yet.' },
        { type: 'text', text: 'You can settle it here in a couple of minutes, by card or Apple Pay.' },
      ]),
      link('Settle my first invoice', href),
      { type: 'text', text: 'If something’s getting in the way, just reply and we’ll find what works.' },
      { type: 'text', text: coach },
    ],
    footer: coachFooter(coach),
  };
}

// ---------------------------------------------------------------- sponsors and teams (M28 s-s-email)

/** "Sam Reid", "Sam Reid and Jo Bell", "Sam Reid, Jo Bell and Ali Khan". */
export function peopleNames(names) {
  const list = (names || []).map(oneLine).filter(Boolean).slice(0, 30);
  if (list.length <= 1) return list[0] || '';
  return `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`;
}

/**
 * The sponsor's email (M28 s-s-email): the link works without an account.
 * @param {{ sponsorFirst: string, orgName: string, names: string[], coachFirst: string, note?: string, link: string }} o
 */
export function sponsorSignEmail({ sponsorFirst, orgName, names = [], coachFirst, note = '', link: href }) {
  const coach = coachLine(coachFirst);
  const org = oneLine(orgName).slice(0, 160);
  if (!org) throw new Error('A sponsor agreement names its organisation.');
  const who = peopleNames(names);
  return {
    brand: 'portal',
    subject: `Coaching agreement for ${org}`,
    blocks: [
      { type: 'heading', text: greeting(sponsorFirst) },
      ...noteBlocks(note),
      { type: 'text', text: `Here’s the agreement for the coaching we discussed${who ? ` for ${who}` : ''}. It takes ~5 minutes to read, and you can sign it online.` },
      link('Read and sign', href),
      { type: 'text', text: coach },
    ],
    footer: footer(`You get this because you’re the sponsor for ${possessive(org)} coaching.`),
  };
}

/** CLAUDE: the sponsor's own signed copy, attached by the sender. */
export function sponsorSignedCopyEmail({ sponsorFirst, orgName, coachFirst, fileName = '' }) {
  const coach = coachLine(coachFirst);
  const org = oneLine(orgName).slice(0, 160) || 'your organisation';
  return {
    brand: 'portal',
    subject: `Your signed coaching agreement for ${org}`,
    blocks: [
      { type: 'heading', text: greeting(sponsorFirst) },
      { type: 'text', text: 'Thank you for signing.' },
      { type: 'text', text: 'Your signed copy is attached, for your records.' },
      { type: 'text', text: 'I’ll be in touch about the first coaching sessions.' },
      { type: 'text', text: coach },
    ],
    footer: footer(`You get this because you signed ${possessive(org)} coaching agreement.`),
  };
}

/** CLAUDE: each person's own agreement once their sponsor has signed. No money: the organisation funds it. */
export function teamMemberAgreementEmail({ firstName, orgName, coachFirst, note = '', link: href }) {
  const coach = coachLine(coachFirst);
  const org = oneLine(orgName).slice(0, 160);
  return {
    brand: 'portal',
    subject: 'Your coaching agreement is ready to sign',
    blocks: [
      { type: 'heading', text: greeting(firstName) },
      ...noteBlocks(note),
      { type: 'text', text: org ? `${org} is funding your coaching, and your own agreement is ready.` : 'Your own coaching agreement is ready.' },
      { type: 'text', text: 'It takes ~5 minutes to read and sign.' },
      link('Read and sign', href),
      { type: 'text', text: coach },
    ],
    footer: coachFooter(coach),
  };
}

// ---------------------------------------------------------------- during the agreement (CLAUDE)

/** The end date moved later (Extend). */
export function extendedEmail({ firstName, coachFirst, endWords }) {
  const coach = coachLine(coachFirst);
  const end = oneLine(endWords);
  if (!end) throw new Error('An extension names its new end date.');
  return {
    brand: 'portal',
    subject: `Your coaching now runs to ${end}`,
    blocks: [
      { type: 'heading', text: greeting(firstName) },
      { type: 'text', text: `As we agreed, your coaching now runs to ${end}.` },
      { type: 'text', text: 'Nothing else in your agreement changes.' },
      { type: 'text', text: coach },
    ],
    footer: coachFooter(coach),
  };
}

/** Coaching paused, and the end date moved by the same time. */
export function pausedEmail({ firstName, coachFirst, fromWords, toWords, endWords }) {
  const coach = coachLine(coachFirst);
  const [from, to, end] = [fromWords, toWords, endWords].map(oneLine);
  if (!from || !to || !end) throw new Error('A pause names its days and the new end date.');
  return {
    brand: 'portal',
    subject: 'Your coaching is paused',
    blocks: [
      { type: 'heading', text: greeting(firstName) },
      { type: 'text', text: `As we agreed, your coaching pauses from ${from} to ${to}.` },
      { type: 'text', text: `Your agreement now runs to ${end}, so you don’t lose any coaching sessions.` },
      { type: 'text', text: coach },
    ],
    footer: coachFooter(coach),
  };
}

/** Ending early, as asked by the client or the coach. */
export function endingEmail({ firstName, coachFirst, endWords, by = 'client' }) {
  const coach = coachLine(coachFirst);
  const end = oneLine(endWords);
  if (!end) throw new Error('An ending names its day.');
  return {
    brand: 'portal',
    subject: `Your coaching agreement ends on ${end}`,
    blocks: [
      { type: 'heading', text: greeting(firstName) },
      { type: 'text', text: by === 'coach' ? `As we discussed, your coaching agreement ends on ${end}.` : `As you asked, your coaching agreement ends on ${end}.` },
      { type: 'text', text: 'Thank you for the work you’ve put in.' },
      { type: 'text', text: coach },
    ],
    footer: coachFooter(coach),
  };
}

/** Cancelled within the 14 days: the refund and its credit note (attached by the sender). */
export function cancelledEmail({ firstName, coachFirst, refundWords = '', creditNoteNumber = '', fileName = '' }) {
  const coach = coachLine(coachFirst);
  const refund = oneLine(refundWords);
  const cn = oneLine(creditNoteNumber);
  return {
    brand: 'portal',
    subject: 'Your coaching agreement is cancelled',
    blocks: [
      { type: 'heading', text: greeting(firstName) },
      { type: 'text', text: 'As you asked, your coaching agreement is cancelled within your 14 days.' },
      refund ? { type: 'text', text: `${refund} is on its way back to you${cn ? `, and credit note ${cn} is attached` : ''}.` }
        : { type: 'text', text: 'Nothing was settled, so there’s nothing to refund.' },
      refund ? { type: 'text', text: 'It usually reaches your account within 5 to 10 working days.', quiet: true } : null,
      { type: 'text', text: coach },
    ],
    footer: coachFooter(coach),
  };
}

/** A new version after a price review: "As we discussed, here's your updated agreement." (plan section 5). */
export function updatedAgreementEmail({ firstName, coachFirst, note = '', link: href }) {
  const coach = coachLine(coachFirst);
  return {
    brand: 'portal',
    subject: 'Your updated coaching agreement',
    blocks: [
      { type: 'heading', text: greeting(firstName) },
      { type: 'text', text: 'As we discussed, here’s your updated agreement.' },
      ...noteBlocks(note),
      { type: 'text', text: 'It takes ~5 minutes to read and sign.' },
      link('Read and sign', href),
      { type: 'text', text: coach },
    ],
    footer: coachFooter(coach),
  };
}

/** CLAUDE: the coach's reply to a change asked for (Reply to Sam on the change's Needs you panel). */
export function changeReplyEmail({ firstName, coachFirst, reply, link: href }) {
  const coach = coachLine(coachFirst);
  const blocks = noteBlocks(reply);
  if (!blocks.length) throw new Error('A reply has words.');
  return {
    brand: 'portal',
    subject: 'About the change you asked for',
    blocks: [{ type: 'heading', text: greeting(firstName) }, ...blocks, link('Open my agreement', href), { type: 'text', text: coach }],
    footer: coachFooter(coach),
  };
}

/**
 * CLAUDE: a question from the quote page, to the coach from The Clarity Portal. The quote's link has no account behind
 * it, so the client's address isn't known: the email says so, and the coach replies the way they usually reach them.
 */
export function quoteQuestionEmail({ clientName, number, words, link: href }) {
  const who = oneLine(clientName).slice(0, 120) || 'Your client';
  const said = oneLine(words).slice(0, 2000);
  if (!said) throw new Error('A question has words.');
  return {
    brand: 'portal',
    subject: `${who} has a question about quote Q-${String(Number(number) || 0).padStart(4, '0')}`,
    blocks: [
      { type: 'heading', text: `${who} has a question about their quote.` },
      { type: 'text', text: `They wrote: “${said}”` },
      { type: 'text', text: 'It was asked from the quote’s own page, so reply the way you usually reach them.', quiet: true },
      link('Open the agreement', href),
    ],
    footer: footer(`You get this because ${who} is one of your clients.`),
  };
}

// ---------------------------------------------------------------- invoicing organisations (brief items 26 to 30)

/**
 * An organisation's invoice, from the coach's own email with the one PDF attached (brief item 28). No button: it's
 * settled by bank transfer to the details on the invoice, quoting its number.
 * @param {{ firstName?: string, coachFirst: string, number: string, amountWords: string, dueWords: string, orgName: string,
 *   poNumber?: string|null, fileName: string }} o
 */
export function orgInvoiceEmail({ firstName = '', coachFirst, number, amountWords, dueWords, orgName, poNumber = null, fileName }) {
  const coach = coachLine(coachFirst);
  const inv = oneLine(number);
  if (!/^CLARITY-\d+$/.test(inv)) throw new Error('An invoice email names its CLARITY- number.');
  const po = oneLine(poNumber);
  const org = oneLine(orgName).slice(0, 160);
  return {
    brand: 'portal',
    subject: `Invoice ${inv}${org ? ` for ${org}` : ''}`,
    blocks: [
      { type: 'heading', text: greeting(firstName) },
      { type: 'text', text: `Invoice ${inv} for ${oneLine(amountWords)} is attached, due by ${oneLine(dueWords)}.` },
      po ? { type: 'text', text: `It quotes purchase order ${po}.` } : null,
      { type: 'text', text: 'It can be settled by bank transfer to the details on the invoice, quoting the invoice number.' },
      { type: 'text', text: 'If anything needs changing for your records, just reply.' },
      { type: 'text', text: coach },
    ],
    footer: footer(`You get this because ${org || 'your organisation'} is invoiced for coaching from ${coach}.`),
  };
}

/** Every email above, for the check that no client text says "pay" or mentions interest (tests). */
export const AGREEMENT_EMAILS = Object.freeze({
  readyToSignEmail, quoteEmail, signReminderEmail, firstPaymentReminderEmail, sponsorSignEmail, sponsorSignedCopyEmail,
  teamMemberAgreementEmail, extendedEmail, pausedEmail, endingEmail, cancelledEmail, updatedAgreementEmail, orgInvoiceEmail, changeReplyEmail, quoteQuestionEmail,
});
