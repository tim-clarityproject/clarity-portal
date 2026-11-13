// Every email the portal sends, each as a document for the one shared
// template (template.js; mock-up email-template.html, Tim, 10 Nov). A
// function here says what the email says; the template decides how it
// looks, and makes the plain-text version from the same words.
//
// Sent today: the three Health Check emails (api/alignment-email.js) and
// the two sign-in emails Supabase sends (their templates are made from
// these by scripts/make-email-templates.mjs, for Tim to paste into
// Supabase). Templates only, nothing sends them yet (booking and Kit come
// in Phase 6a): the session reminders and Leading Ideas.
//
// Times in an email follow src/lib/time (time-zone-safeguards.md): in the
// reader's own zone with a city or country name, 12-hour for readers in
// the US and Canada, dates in words. The 1-hour reminder never gives a
// clock time, so it can never be wrong.
import { EMAIL_SIGN_OFF, oneLine } from './template.js';
import { sessionWhenWords, timeWords, relativeDayWords } from '../time/index.js';

const possessive = (name) => `${name}’s`;

// ---------------------------------------------------------------- Health Check
/**
 * To the person who did the Health Check ("Email my link"): their results,
 * with the email address and access code that open them (Tim, 10 Nov,
 * 13:31: so they can copy them instead of searching for them). It never
 * carries a "Talk it through with Tim" link or any booking link (Tim, 10
 * Nov, 23:53: people only get the Health Check when a call or a workshop is
 * already arranged).
 */
export function healthCheckResultsEmail({ link, organisation, dateText, email, code }) {
  const org = oneLine(organisation);
  return {
    brand: 'portal',
    subject: org ? `Your Health Check results for ${org}` : 'Your Health Check results',
    blocks: [
      { type: 'heading', text: 'Your Health Check results are ready.' },
      { type: 'text', text: org ? `${org}, ${dateText}.` : `${dateText}.` },
      { type: 'button', label: 'Open my results', href: link },
      { type: 'details', rows: [['Email', email], ['Access code', code]] },
    ],
    footer: { lines: ['You asked for this link at the end of your Health Check.', EMAIL_SIGN_OFF] },
  };
}

/**
 * To the coach who made the link (or the owner, for an older link with no
 * coach recorded) when a Health Check is finished: the person's email and
 * access code under the button (Tim, 10 Nov, 13:31: "Same for the coach
 * one"), then the same headline and questions to start with as the results
 * page and the PDF (completionSummary).
 */
export function healthCheckFinishedForCoachEmail({ link, organisation, email, code, finishedText, objective, summary, madeTheLink = true }) {
  const org = oneLine(organisation);
  return {
    brand: 'portal',
    // With no organisation name, never a subject that starts with a space (Claude's call, 11 Nov).
    subject: org ? `${org} finished their Health Check` : 'A Health Check has finished',
    blocks: [
      { type: 'heading', text: org ? `${org} finished their Health Check.` : 'A Health Check has finished.' },
      { type: 'text', text: `They finished on ${finishedText}.` },
      { type: 'button', label: 'Open the results', href: link },
      { type: 'details', rows: [['Email', email], ['Access code', code]] },
      ...(oneLine(objective) ? [{ type: 'label', text: 'Objective' }, { type: 'note', text: oneLine(objective) }] : []),
      { type: 'label', text: 'At a glance' },
      { type: 'note', text: summary.headline, after: `Important means above ${summary.line}%.` },
      { type: 'label', text: 'Questions to start with' },
      ...summary.questions.map((q) => ({ type: 'note', lead: q.label, text: q.question, after: q.reason })),
    ],
    footer: { lines: [madeTheLink ? 'You made this Health Check link.' : 'This Health Check link has no coach recorded, so its answers come to you.', EMAIL_SIGN_OFF] },
  };
}

/**
 * The owner's note when someone else's Health Check link is finished: only
 * the organisation and the day. Never the answers, the PDF, the link, the
 * person's email or their access code.
 */
export function healthCheckFinishedNoteEmail({ organisation, dateText }) {
  const org = oneLine(organisation);
  return {
    brand: 'portal',
    subject: org ? `${org} finished a Health Check` : 'A Health Check has finished',
    blocks: [
      { type: 'heading', text: org ? `${org} finished a Health Check.` : 'A Health Check has finished.' },
      { type: 'text', text: `They finished on ${dateText}.` },
      { type: 'text', text: 'The answers went only to the coach who sent the link.', quiet: true },
    ],
    footer: { lines: ['You get a note when another coach’s Health Check link is finished.', EMAIL_SIGN_OFF] },
  };
}

// ---------------------------------------------------------------- session reminders (templates only)
/**
 * The day before a coaching session, sent in the reader's own morning.
 * @param {object} o
 * @param {string} o.coach          the coach's first name
 * @param {Date|string} o.at        the session's instant
 * @param {string} o.zone           the READER's zone, by place name
 * @param {boolean} [o.frequentTraveller] only true when the coach has ticked this person as a frequent traveller
 * @param {string} o.prepLink, o.zoomLink, o.preferencesLink
 * @param {Date} [o.now]
 */
export function sessionTomorrowEmail({ coach, at, zone, frequentTraveller = false, prepLink, zoomLink, preferencesLink, now = new Date() }) {
  const day = relativeDayWords(at, zone, now);
  const when = sessionWhenWords(at, zone, now);
  return {
    brand: 'portal',
    subject: `Your coaching session with ${coach} is ${day === 'tomorrow' || day === 'today' ? day : `on ${day}`} at ${timeWords(at, zone)}`,
    blocks: [
      { type: 'heading', text: day === 'tomorrow' ? 'What would make tomorrow’s coaching session useful?' : 'What would make your coaching session useful?' },
      { type: 'text', text: `Your coaching session with ${coach} is ${when}.` },
      // Only for people the coach has marked as a frequent traveller (Tim, 13:25); everyone else never sees it.
      frequentTraveller ? { type: 'text', text: 'Travelling? Your calendar invite moves with you.', quiet: true } : null,
      { type: 'button', label: 'Start my prep', href: prepLink, time: '~2 minutes' },
      { type: 'link', label: 'Join on Zoom', href: zoomLink },
    ],
    footer: { lines: [`You get session reminders as one of ${possessive(coach)} coaching clients.`, EMAIL_SIGN_OFF, { label: 'Choose which emails to get', href: preferencesLink }] },
  };
}

/** One hour before: no clock time at all, so it can't be wrong (Tim, 13:23). */
export function sessionInOneHourEmail({ coach, zoomLink, preferencesLink }) {
  return {
    brand: 'portal',
    subject: `Your coaching session with ${coach} starts in 1 hour`,
    blocks: [
      { type: 'heading', text: `Your coaching session with ${coach} starts in 1 hour.` },
      { type: 'button', label: 'Join on Zoom', href: zoomLink },
    ],
    footer: { lines: [`You get session reminders as one of ${possessive(coach)} coaching clients.`, EMAIL_SIGN_OFF, { label: 'Choose which emails to get', href: preferencesLink }] },
  };
}

// ---------------------------------------------------------------- Leading Ideas (templates only)
const LEADING_IDEAS_HEADLINE = 'Your weekly fuel for leading under pressure.';
const LEADING_IDEAS_BY = 'Leading Ideas by Dr. Tim Dutton, every Thursday.';
const leadingIdeasBody = ({ quote, by, question }) => [
  { type: 'heading', text: LEADING_IDEAS_HEADLINE },
  { type: 'label', text: 'One quote' },
  { type: 'quote', text: `“${quote}”`, by },
  { type: 'label', text: 'One question' },
  { type: 'question', text: question },
];

/**
 * Leading Ideas for a client, from The Clarity Project: the same quote and
 * question as everyone, plus one line tied to their own plan. Read, never
 * actioned: no button and nothing to answer (Tim, 13:04).
 */
export function leadingIdeasClientEmail({ issue, theme, quote, by, question, tailoredLine, shareLink, portalLink, preferencesLink }) {
  return {
    brand: 'project',
    subject: `Leading Ideas #${issue}: ${theme}`,
    blocks: [
      ...leadingIdeasBody({ quote, by, question }),
      tailoredLine ? { type: 'text', text: tailoredLine, quiet: true } : null,
    ],
    footer: { lines: [LEADING_IDEAS_BY, { label: 'Share with a friend', href: shareLink }, { label: 'Open The Clarity Portal', href: portalLink }, { label: 'Choose which emails to get', href: preferencesLink }] },
  };
}

/**
 * Leading Ideas for the public list, sent through Kit: no tailored line; a
 * small "New" section just above the footer, whose link carries the
 * email's only coral (Tim, 14:25); Kit's own unsubscribe link, and the
 * address saved in Kit (never a home or family address; nothing is sent
 * to the public list until a non-personal one is saved there).
 */
export function leadingIdeasPublicEmail({ issue, theme, quote, by, question, shareLink, signUpLink, unsubscribeLink, address }) {
  return {
    brand: 'project',
    subject: `Leading Ideas #${issue}: ${theme}`,
    blocks: [
      ...leadingIdeasBody({ quote, by, question }),
      { type: 'section', blocks: [
        { type: 'label', text: 'New' },
        { type: 'text', text: 'The Clarity Project has a personal performance tool you can use for free.', quiet: true },
        { type: 'coral-link', label: 'Create your free account', href: signUpLink },
      ] },
    ],
    footer: {
      lines: [LEADING_IDEAS_BY, [{ label: 'Share with a friend', href: shareLink }, { label: 'Unsubscribe', href: unsubscribeLink }]],
      legal: address ? `The Clarity Project LTD · ${address}` : 'The Clarity Project LTD',
    },
  };
}

// ---------------------------------------------------------------- sign-in emails (sent by Supabase)
/** Confirm a new account's email address. `link` is Supabase's own placeholder in the saved template. */
export function confirmEmailEmail({ link }) {
  return {
    brand: 'portal',
    subject: 'Confirm your email for The Clarity Portal',
    blocks: [
      { type: 'heading', text: 'Confirm your email address.' },
      { type: 'text', text: 'It’s the last step before you open The Clarity Portal.' },
      { type: 'button', label: 'Confirm my email', href: link },
      { type: 'text', text: 'If you didn’t sign up, you can ignore this email.', quiet: true },
    ],
    footer: { lines: ['You get this because this email address was used to sign up for The Clarity Portal.', EMAIL_SIGN_OFF] },
  };
}

/** Choose a new password. `link` is Supabase's own placeholder in the saved template. */
export function resetPasswordEmail({ link }) {
  return {
    brand: 'portal',
    subject: 'Choose a new password for The Clarity Portal',
    blocks: [
      { type: 'heading', text: 'Choose a new password.' },
      { type: 'button', label: 'Choose my new password', href: link },
      // Reset links work for 1 hour, and the email says so (Tim, 11 Nov).
      { type: 'text', text: 'The link works for 1 hour.' },
      { type: 'text', text: 'If you didn’t ask for this, you can ignore this email and your password stays as it is.', quiet: true },
    ],
    footer: { lines: ['You get this because a new password was asked for with this email address.', EMAIL_SIGN_OFF] },
  };
}

/**
 * Confirm a change of email, asked for in My Account. With Supabase's
 * "Secure email change" on (Tim, 13 Nov) the same email goes to the
 * current address and to the new one, each with its own link, and the
 * email changes once both are opened: so the words fit either reader.
 * `link` is Supabase's own placeholder in the saved template.
 */
export function changeEmailEmail({ link }) {
  return {
    brand: 'portal',
    subject: 'Confirm your change of email for The Clarity Portal',
    blocks: [
      { type: 'heading', text: 'Confirm your change of email.' },
      { type: 'text', text: 'We’ve sent a link to your current email and to your new one. Open both to finish.' },
      { type: 'button', label: 'Confirm my change of email', href: link },
      { type: 'text', text: 'If you didn’t ask for this, don’t open the link. Your email then stays as it is.', quiet: true },
    ],
    footer: { lines: ['You get this because a change of email was asked for in The Clarity Portal.', EMAIL_SIGN_OFF] },
  };
}

/**
 * A coach's invite: the link opens the invite's own page ("Welcome, Sam").
 * Nothing sends this yet, and its words are a plain stand-in until the
 * coach portal (M11) draws the invite email. `link` is Supabase's own
 * placeholder in the saved template.
 */
export function inviteEmail({ link }) {
  return {
    brand: 'portal',
    subject: 'Set up your account on The Clarity Portal',
    blocks: [
      { type: 'heading', text: 'Set up your account.' },
      { type: 'text', text: 'Your coach has set up your account on The Clarity Portal.' },
      { type: 'button', label: 'Set up my account', href: link },
      { type: 'text', text: 'If you weren’t expecting this, you can ignore this email.', quiet: true },
    ],
    footer: { lines: ['You get this because your coach added this email address to The Clarity Portal.', EMAIL_SIGN_OFF] },
  };
}
