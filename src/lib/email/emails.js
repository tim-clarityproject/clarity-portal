// Every email the portal sends, each as a document for the one shared
// template (template.js; mock-up email-template.html, Tim, 10 Nov). A
// function here says what the email says; the template decides how it
// looks, and makes the plain-text version from the same words.
//
// Sent today: the three Health Check emails (api/_routes/alignment-email.js) and
// the sign-in emails Supabase sends (their templates are made from
// these by scripts/make-email-templates.mjs, for Tim to paste into
// Supabase). The guest's copy of a plan (api/_routes/guest-copy.js) is sent only
// from the live site, once migrations 035 and 042 have run. Templates
// only, nothing sends them yet (booking and Kit come in Phase 6a): the
// session reminders and Leading Ideas.
//
// The coaching session emails, the welcome, the Health Check link and the
// guest's copy of their Health Check use the words Tim approved on 23 Nov
// 2026 (draft-2-emails.md), word for word; names, days and times come from
// the data. Anything personal comes from the coach, written as "I" and
// signed with their first name; reminders and notices come from The Clarity
// Portal. The billing and agreement emails are in billingEmails.js.
//
// Times in an email follow src/lib/time (time-zone-safeguards.md): in the
// reader's own zone with a city or country name, 12-hour for readers in
// the US and Canada, dates in words. The 1-hour reminder gives its clock
// time too (draft-2, 23 Nov, which is newer than the 10 Nov note that it
// never did), worked out in the reader's own zone.
import { EMAIL_SIGN_OFF, oneLine } from './template.js';
import { shownCallName } from '../callNames.js';
import { sessionWhenWords, timeWords, relativeDayWords, dayWords } from '../time/index.js';

import { possessive } from '../possessive.js';
/** "Hi Sam," from a name, or "Hello," when there is none. */
export const greeting = (name) => { const first = oneLine(name).split(' ')[0]; return first ? `Hi ${first},` : 'Hello,'; };
/** A coach's sign-off: their first name, alone on the last line (draft-2: "Tim"). */
const signedBy = (coach) => ({ type: 'text', text: oneLine(coach).slice(0, 60) || 'Your coach' });
/** "on Zoom", "in person", "by phone". */
const placeWords = (kind) => (kind === 'in_person' ? 'in person' : kind === 'phone' ? 'by phone' : 'on Zoom');
/** "tomorrow at 15:00 UK time", "today at …", "on Thu 26 Nov at …": the reader's own day and clock. */
const dayAndTime = (at, zone, now) => {
  const day = relativeDayWords(at, zone, now);
  return `${day === 'today' || day === 'tomorrow' ? day : `on ${day}`} at ${timeWords(at, zone)}`;
};

// ---------------------------------------------------------------- Health Check
/**
 * The copy of a guest's answers: to the person who did the Health Check
 * ("Email my link"), from the coach, in draft-2's words ("Copy of a guest's
 * answers", 23 Nov). The sign-in box keeps their link, the email address
 * and the access code that open them (Tim, 10 Nov, 13:31: so they can copy
 * them instead of searching for them). It never carries a "Talk it through
 * with Tim" link or any booking link (Tim, 10 Nov, 23:53).
 * The PDF the words name is attached by the sender.
 * @param {object} o
 * @param {string} o.link, o.email, o.code
 * @param {string} [o.organisation]
 * @param {string} [o.firstName]   the person's first name, when it is known ("Hello," without it)
 * @param {string} [o.coachFirst]  the first name of the coach who made the link
 * @param {string} [o.dateText]    kept for older callers; draft-2's words have no date
 * @param {boolean} [o.finished]   false: the Health Check isn't finished, so there are no results yet
 *   (no PDF, and its link and code carry on with no end: 064)
 * @param {boolean} [o.attached]   false: finished, but the PDF couldn't be made, so nothing says it's attached
 */
export function healthCheckResultsEmail({ link, organisation, email, code, firstName = '', coachFirst = 'Tim', finished = true, attached = true }) {
  const org = oneLine(organisation);
  if (!finished) {
    return {
      brand: 'portal',
      subject: org ? `Your Health Check link for ${org}` : 'Your Health Check link',
      blocks: [
        { type: 'heading', text: greeting(firstName) },
        { type: 'text', text: 'Here’s your link to the Health Check, so you can carry on where you left off.' },
        { type: 'text', text: 'Your answers are saved, and your results will be ready when you finish.' },
        { type: 'link', label: 'Your link', href: link },
        { type: 'details', rows: [['Email', email], ['Access code', code]] },
        signedBy(coachFirst),
      ],
      footer: { lines: ['You asked for this link during your Health Check.', EMAIL_SIGN_OFF] },
    };
  }
  return {
    brand: 'portal',
    subject: org ? `Your Health Check results for ${org}` : 'Your Health Check results',
    blocks: [
      { type: 'heading', text: greeting(firstName) },
      { type: 'text', text: 'Thanks for completing the Health Check.' },
      { type: 'text', text: attached
        ? 'Your results are attached as a PDF, and you can open them again at any time with your link and code.'
        : 'You can open your results again at any time with your link and code.' },
      { type: 'link', label: 'Your link', href: link },
      { type: 'details', rows: [['Email', email], ['Access code', code]] },
      { type: 'text', text: 'If you’d like to talk them through, reply and we’ll find a time.' },
      signedBy(coachFirst),
    ],
    footer: { lines: ['You asked for this link at the end of your Health Check.', EMAIL_SIGN_OFF] },
  };
}

/**
 * The Health Check link a coach sends (draft-2's "Health Check link", 23
 * Nov), from the coach: the link and its code. Nothing sends it yet: a
 * coach shares the link from the coach portal today.
 * @param {{ firstName?: string, coachFirst: string, link: string, code: string }} o
 */
export function healthCheckLinkEmail({ firstName = '', coachFirst, link, code }) {
  const coach = oneLine(coachFirst).slice(0, 60);
  return {
    brand: 'portal',
    subject: coach ? `Your Strategic Alignment Health Check from ${coach}` : 'Your Strategic Alignment Health Check',
    blocks: [
      { type: 'heading', text: greeting(firstName) },
      { type: 'text', text: 'Here’s the Health Check we talked about.' },
      { type: 'text', text: 'It takes ~15 minutes, and it gives your team one shared picture of where your time, energy and resource are going.' },
      { type: 'link', label: 'Your link', href: link },
      { type: 'details', rows: [['Your code', oneLine(code)]] },
      { type: 'text', text: 'The link works for 30 days, and only you and I see your answers.' },
      signedBy(coach),
    ],
    footer: { lines: [`You get this because ${coach || 'a coach'} sent you a Health Check link.`, EMAIL_SIGN_OFF] },
  };
}

/**
 * To the coach who made the link (or the owner, for an older link with no
 * coach recorded) when a Health Check is finished: the person's email
 * under the button, never their access code (Health Check follow-up 1, 15
 * Nov: replaces Tim's 10 Nov rule for this email), then the same headline as the results page and the PDF, the
 * objective, and last the questions to start with (completionSummary).
 */
export function healthCheckFinishedForCoachEmail({ link, organisation, email, finishedText, objective, summary, madeTheLink = true }) {
  const org = oneLine(organisation);
  return {
    brand: 'portal',
    // With no organisation name, never a subject that starts with a space (Claude's call, 11 Nov).
    subject: org ? `${org} finished their Health Check` : 'A Health Check has finished',
    blocks: [
      { type: 'heading', text: org ? `${org} finished their Health Check.` : 'A Health Check has finished.' },
      { type: 'text', text: `They finished on ${finishedText}.` },
      { type: 'button', label: 'Open the results', href: link },
      // Never the access code (Health Check follow-up 1, 15 Nov): a code in the
      // coach's email would open answers the guest may later make Only you.
      { type: 'details', rows: [['Email', email]] },
      // The headline first, and the questions to start with last (rule 29ar; Tim, 13 Nov, 18:11).
      { type: 'label', text: 'At a glance' },
      { type: 'note', text: summary.headline, after: `Important means above ${summary.line}%.` },
      ...(oneLine(objective) ? [{ type: 'label', text: 'Objective' }, { type: 'note', text: oneLine(objective) }] : []),
      { type: 'label', text: 'Questions to start with' },
      ...summary.questions.map((q) => ({ type: 'note', lead: q.label, text: q.question, after: q.reason })),
    ],
    footer: { lines: [madeTheLink ? 'You made this Health Check link.' : 'This Health Check link has no coach recorded, so its answers come to you.', EMAIL_SIGN_OFF] },
  };
}

/**
 * To the guest only, when they choose Only you (migration 045): the new
 * access code that now opens their answers. The old one, which the coach
 * was given with the link, stops working. The address comes from the
 * database, never the browser (api/_routes/alignment-email.js).
 */
export function healthCheckNewCodeEmail({ link, organisation, email, code }) {
  const org = oneLine(organisation);
  return {
    brand: 'portal',
    subject: 'Your new Health Check access code',
    blocks: [
      { type: 'heading', text: 'Your new access code.' },
      { type: 'text', text: org ? `You chose Only you for the ${org} Health Check, so your answers now open with this code.` : 'You chose Only you, so your answers now open with this code.' },
      { type: 'text', text: 'The code you had before no longer opens them.', quiet: true },
      { type: 'button', label: 'Open my Health Check', href: link },
      { type: 'details', rows: [['Email', email], ['Access code', code]] },
    ],
    footer: { lines: ['You chose who sees your Health Check answers.', EMAIL_SIGN_OFF] },
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

// ---------------------------------------------------------------- guest links
/**
 * A guest's copy of the plan they made through a coach's link (mock-up M9,
 * the guest's end page: "A copy is on its way to …"). The next steps come
 * first (Action first), then the goal, then the one invitation: a free
 * account, which the plan moves into. It never carries a booking link.
 * What was typed is shown as text, each answer on one line.
 * The address it goes to is never passed in here: the server takes it from
 * the database (api/_routes/guest-copy.js).
 * @param {object} o
 * @param {string} o.origin       the portal's own address (api/_portalOrigin.js)
 * @param {string} [o.toolName]   "Get unstuck"
 * @param {string} [o.coachName]  the first name of the coach who made the link
 * @param {string} [o.goal]
 * @param {string[]} [o.nextSteps]
 */
export function guestPlanCopyEmail({ origin, toolName = 'Get unstuck', coachName = '', goal = '', nextSteps = [] }) {
  const tool = oneLine(toolName) || 'Get unstuck';
  const coach = oneLine(coachName).slice(0, 60);
  const steps = (Array.isArray(nextSteps) ? nextSteps : []).map(oneLine).filter(Boolean);
  const theGoal = oneLine(goal);
  return {
    brand: 'portal',
    subject: `Your ${tool} plan`,
    blocks: [
      { type: 'heading', text: steps.length ? 'Here’s what you’ll do next.' : 'Here’s your plan.' },
      // One next step stands alone; several are numbered.
      ...steps.map((step, i) => ({ type: 'note', text: steps.length > 1 ? `${i + 1}. ${step}` : step })),
      ...(theGoal ? [{ type: 'label', text: 'Your goal' }, { type: 'note', text: theGoal }] : []),
      { type: 'section', blocks: [
        { type: 'text', text: 'Plan this into your week with The Clarity Portal, your personal performance tool.' },
        { type: 'text', text: 'It’s free, and this plan moves into it.', quiet: true },
        { type: 'button', label: 'Create my free account', href: `${origin}/auth/sign-up` },
      ] },
    ],
    footer: { lines: [`You’re getting this because you used ${tool} through a link from ${coach || 'your coach'}.`, EMAIL_SIGN_OFF] },
  };
}

/**
 * The 6-digit code that shows a guest their earlier answers when they open
 * their link again after choosing Only you (migration 046, 035's
 * guest_email_code_issue; Phase 8a follow-up, step 3). It goes only to the
 * guest's own address, which the database gives the server: the coach,
 * who knows the link's code, never sees this one. No button: the code is
 * typed into the page that asked for it, which is still open.
 */
export function guestEmailCodeEmail({ toolName = 'Get unstuck', code }) {
  const tool = oneLine(toolName) || 'Get unstuck';
  return {
    brand: 'portal',
    subject: `Your code to see your ${tool} answers`,
    blocks: [
      { type: 'heading', text: 'Your code.' },
      { type: 'text', text: `Type this code where you opened your ${tool} link, and your answers will show.` },
      { type: 'text', text: 'It works for 10 minutes.', quiet: true },
      { type: 'details', rows: [['Code', oneLine(code)]] },
    ],
    footer: { lines: ['You chose Only you, so your answers show only once this email address is confirmed.', EMAIL_SIGN_OFF] },
  };
}

// ---------------------------------------------------------------- coaching sessions (draft-2, 23 Nov)
// From The Clarity Portal, in the client's own time zone: the day and the
// clock in the READER's zone with its place's name (12-hour for the US and
// Canada). The words are draft-2's "Coaching sessions", word for word.
const sessionFooter = (coach, preferencesLink) => [`You get this as one of ${possessive(coach)} coaching clients.`, EMAIL_SIGN_OFF, preferencesLink ? { label: 'Choose which emails to get', href: preferencesLink } : null].filter(Boolean);
const PREP_LINE = 'The day before, you’ll be offered a short prep of ~2 minutes, so the time is as useful as it can be.';
const USEFUL = 'What would make it really useful for you?';

/**
 * Booked, as a document: "Your coaching session with Tim is booked for Thu 26 Nov at 15:00 UK time, for 60 minutes on
 * Zoom." `what` is "coaching session", or a booked call's own name. Join on Zoom is the one coral button; Rearrange and
 * Cancel are quiet links (one coral button at most, Emails rule 4). The prep line only where a prep is offered.
 */
function bookedDoc({ brand, what, coach, at, zone, minutes, placeKind, zoomLink, rearrangeLink, cancelLink, prep, footer }) {
  const withWho = coach ? ` with ${coach}` : '';
  const day = dayWords(at, zone);
  const length = Number.isInteger(minutes) && minutes > 0 ? `, for ${minutes} minutes` : '';
  return {
    brand,
    subject: `Your ${what}${withWho} is booked for ${day}`,
    blocks: [
      { type: 'heading', text: `Your ${what}${withWho} is booked for ${day} at ${timeWords(at, zone)}${length} ${placeWords(placeKind)}.` },
      prep ? { type: 'text', text: PREP_LINE } : null,
      zoomLink ? { type: 'button', label: 'Join on Zoom', href: zoomLink } : null,
      rearrangeLink ? { type: 'link', label: 'Rearrange', href: rearrangeLink } : null,
      cancelLink ? { type: 'link', label: 'Cancel', href: cancelLink } : null,
    ],
    footer: { lines: footer },
  };
}

/** Moved, as a document: "Your coaching session has moved to Fri 27 Nov at 10:00 UK time". */
function movedDoc({ brand, what, coach, at, zone, zoomLink, rearrangeLink, footer }) {
  const withWho = coach ? ` with ${coach}` : '';
  const when = `${dayWords(at, zone)} at ${timeWords(at, zone)}`;
  return {
    brand,
    subject: `Your ${what} has moved to ${when}`,
    blocks: [
      { type: 'heading', text: `Your ${what}${withWho} is now on ${when}.` },
      zoomLink ? { type: 'button', label: 'Join on Zoom', href: zoomLink } : null,
      rearrangeLink ? { type: 'link', label: 'Rearrange', href: rearrangeLink } : null,
    ],
    footer: { lines: footer },
  };
}

/**
 * A client's coaching session is booked (draft-2's "Booked"). Nothing sends it yet: sessions a coach books for a client
 * have no sender, and a session booked on a booking page is bookingConfirmedEmail.
 * @param {{ coach: string, at: Date|string, zone: string, minutes?: number, placeKind?: string, zoomLink?: string|null,
 *   rearrangeLink?: string|null, cancelLink?: string|null, prep?: boolean, preferencesLink?: string|null }} o
 */
export function sessionBookedEmail({ coach, at, zone, minutes = null, placeKind = 'zoom', zoomLink = null, rearrangeLink = null, cancelLink = null, prep = true, preferencesLink = null }) {
  const name = oneLine(coach) || 'your coach';
  return bookedDoc({ brand: 'portal', what: 'coaching session', coach: name, at, zone, minutes, placeKind, zoomLink, rearrangeLink, cancelLink, prep, footer: sessionFooter(name, preferencesLink) });
}

/** A client's coaching session has moved (draft-2's "Moved"). Nothing sends it yet. */
export function sessionMovedEmail({ coach, at, zone, zoomLink = null, rearrangeLink = null, preferencesLink = null }) {
  const name = oneLine(coach) || 'your coach';
  return movedDoc({ brand: 'portal', what: 'coaching session', coach: name, at, zone, zoomLink, rearrangeLink, footer: sessionFooter(name, preferencesLink) });
}

/**
 * A coaching session is cancelled (draft-2's "Cancelled"), with the late-cancellation line when it was cancelled with
 * less than 24 hours' notice. Nothing sends it yet.
 * @param {{ coach: string, at: Date|string, zone: string, late?: boolean, bookLink?: string|null, preferencesLink?: string|null }} o
 */
export function sessionCancelledEmail({ coach, at, zone, late = false, bookLink = null, preferencesLink = null }) {
  const name = oneLine(coach) || 'your coach';
  const day = dayWords(at, zone);
  return {
    brand: 'portal',
    subject: `Your coaching session on ${day} is cancelled`,
    blocks: [
      { type: 'heading', text: `Your coaching session with ${name} on ${day} at ${timeWords(at, zone)} is cancelled.` },
      late ? { type: 'text', text: 'It was cancelled with less than 24 hours’ notice, so it counts as used.' } : null,
      bookLink ? { type: 'text', text: 'When you’re ready, you can book another time here.' } : null,
      bookLink ? { type: 'button', label: 'Book a coaching session', href: bookLink } : null,
    ],
    footer: { lines: sessionFooter(name, preferencesLink) },
  };
}

/**
 * The day before a coaching session (draft-2's "24 hours before"), sent by api/_routes/coach-reminders.js from 18:00 the day
 * before in the reader's own time.
 * @param {object} o
 * @param {string} o.coach          the coach's first name
 * @param {Date|string} o.at        the session's instant
 * @param {string} o.zone           the READER's zone, by place name
 * @param {boolean} [o.frequentTraveller] only true when the coach has ticked this person as a frequent traveller
 * @param {string} o.prepLink, o.zoomLink, o.preferencesLink
 * @param {Date} [o.now]
 */
export function sessionTomorrowEmail({ coach, at, zone, frequentTraveller = false, prepLink, zoomLink, preferencesLink, now = new Date() }) {
  const line = `Your coaching session with ${coach} is ${dayAndTime(at, zone, now)}`;
  return {
    brand: 'portal',
    subject: line,
    blocks: [
      { type: 'heading', text: `${line}.` },
      // Only for people the coach has marked as a frequent traveller (Tim, 13:25); everyone else never sees it.
      frequentTraveller ? { type: 'text', text: 'Travelling? Your calendar invite moves with you.', quiet: true } : null,
      { type: 'text', text: USEFUL },
      prepLink ? { type: 'button', label: 'Start my 2-minute prep', href: prepLink } : null,
      // A session in person has no Zoom link, and the link is left out rather than sent empty. With no prep it is the button.
      zoomLink ? (prepLink ? { type: 'link', label: 'Join on Zoom', href: zoomLink } : { type: 'button', label: 'Join on Zoom', href: zoomLink }) : null,
    ],
    footer: { lines: reminderFooter(coach, preferencesLink) },
  };
}

// "Choose which emails to get" needs its page first (Emails, rule 8): until a link is given it is left out.
const reminderFooter = (coach, preferencesLink) => [`You get session reminders as one of ${possessive(coach)} coaching clients.`, EMAIL_SIGN_OFF, preferencesLink ? { label: 'Choose which emails to get', href: preferencesLink } : null].filter(Boolean);
/** "starts at 15:00 UK time" in the reader's zone; with no time given (an older caller), "starts in 1 hour". */
const startsAt = (at, zone) => (at && zone ? `starts at ${timeWords(at, zone)}` : 'starts in 1 hour');

/** One hour before (draft-2's "1 hour before"): its clock time in the reader's own zone. */
export function sessionInOneHourEmail({ coach, at = null, zone = null, zoomLink, preferencesLink }) {
  const line = `Your coaching session with ${coach} ${startsAt(at, zone)}`;
  return {
    brand: 'portal',
    subject: line,
    blocks: [
      { type: 'heading', text: `${line}.` },
      zoomLink ? { type: 'button', label: 'Join on Zoom', href: zoomLink } : null,
    ],
    footer: { lines: reminderFooter(coach, preferencesLink) },
  };
}

// ---------------------------------------------------------------- group-call reminders (Phase 6a run 8, item 1)
// A group call's two reminders, one email to each guest at their own
// address (api/_routes/coach-reminders.js; migration 059's group claim): the same
// moments, switches, template and words as a single call's (draft-2), as a
// group coaching session. Nothing in them names or shows another guest; the
// group's name is the only "who". Times in the READER's zone with its place's name.
const groupFooter = (coach, groupName, preferencesLink) => [
  groupName ? `You get session reminders as a member of ${groupName}, coached by ${coach}.` : `You get session reminders as one of ${possessive(coach)} coaching clients.`,
  EMAIL_SIGN_OFF,
  preferencesLink ? { label: 'Choose which emails to get', href: preferencesLink } : null,
].filter(Boolean);

/**
 * The day before a group call, at 18:00 the reader's own time.
 * @param {{ coach: string, groupName?: string, at: Date|string, zone: string, frequentTraveller?: boolean, prepLink?: string|null, zoomLink?: string|null, preferencesLink?: string|null, now?: Date }} o
 */
export function groupSessionTomorrowEmail({ coach, groupName = '', at, zone, frequentTraveller = false, prepLink = null, zoomLink = null, preferencesLink = null, now = new Date() }) {
  const group = oneLine(groupName);
  const line = `Your group coaching session with ${coach} is ${dayAndTime(at, zone, now)}`;
  return {
    brand: 'portal',
    subject: line,
    blocks: [
      { type: 'heading', text: `${line}.` },
      group ? { type: 'details', rows: [['Group', group]] } : null,
      frequentTraveller ? { type: 'text', text: 'Travelling? Your calendar invite moves with you.', quiet: true } : null,
      { type: 'text', text: USEFUL },
      prepLink ? { type: 'button', label: 'Start my 2-minute prep', href: prepLink } : null,
      zoomLink ? (prepLink ? { type: 'link', label: 'Join on Zoom', href: zoomLink } : { type: 'button', label: 'Join on Zoom', href: zoomLink }) : null,
    ],
    footer: { lines: groupFooter(coach, group, preferencesLink) },
  };
}

/** One hour before a group call: its clock time in the reader's own zone. */
export function groupSessionInOneHourEmail({ coach, groupName = '', at = null, zone = null, zoomLink = null, preferencesLink = null }) {
  const group = oneLine(groupName);
  const line = `Your group coaching session with ${coach} ${startsAt(at, zone)}`;
  return {
    brand: 'portal',
    subject: line,
    blocks: [
      { type: 'heading', text: `${line}.` },
      group ? { type: 'details', rows: [['Group', group]] } : null,
      zoomLink ? { type: 'button', label: 'Join on Zoom', href: zoomLink } : null,
    ],
    footer: { lines: groupFooter(coach, group, preferencesLink) },
  };
}

// ---------------------------------------------------------------- the session summary (Phase 6a run 2; draft-2's "Summary ready")
/** The most actions one recap lists, and the most characters of the recap kept (the client reads it in the portal). */
export const RECAP_EMAIL_ACTIONS_MAX = 30;
export const RECAP_EMAIL_MAX = 12000;

/**
 * A session's summary is ready, to the client (or each member of a group), sent only when their coach presses Send the
 * recap (api/_routes/coach-send.js; migration 050's session_send_recap decides it goes once). Draft-2's words: the email says
 * the summary is ready, and the summary itself (the coach's words and the ticked actions) is read on the client's
 * Coaching page, never carried in the email. Someone with no portal account to read it in (a group member who was
 * never invited; follow-up 5, item 3) gets the summary in the email itself instead, with no "Read my summary" button.
 * The address it goes to is never passed in here.
 * @param {object} o
 * @param {string} o.origin      the portal's own address (api/_portalOrigin.js)
 * @param {string} o.coach       the coach's first name
 * @param {Date|string} [o.at]   the session's instant, and the reader's zone: "today's" when it was today for them
 * @param {string} [o.zone]
 * @param {string} [o.dateText]  the session's day in words ("Mon 16 Nov 2026"), for a session on another day
 * @param {Date} [o.now]
 * @param {boolean} [o.inPortal] false: the reader has no account, so the recap and actions are in the email
 * @param {string} [o.recap]     the coach's words, for a reader with no account
 * @param {string[]} [o.actions] the ticked actions, for a reader with no account
 * @param {string} [o.firstName] the reader's first name, for a reader with no account ("Hello," without it)
 */
export function sessionRecapEmail({ origin, coach, at = null, zone = null, dateText = '', now = new Date(), inPortal = true, recap = '', actions = [], firstName = '' }) {
  const name = oneLine(coach).slice(0, 60) || 'your coach';
  const day = oneLine(dateText);
  const today = !(at && zone) || relativeDayWords(at, zone, now) === 'today';
  const footer = { lines: [`You get this because ${name} is your coach.`, EMAIL_SIGN_OFF] };
  if (!inPortal) {
    // The coach's words, a paragraph each (a blank line between them in what was typed), and the actions agreed.
    const paragraphs = String(recap || '').slice(0, RECAP_EMAIL_MAX).split(/\n\s*\n/).map((t) => oneLine(t)).filter(Boolean);
    const todo = (Array.isArray(actions) ? actions : []).map((a) => oneLine(a)).filter(Boolean).slice(0, RECAP_EMAIL_ACTIONS_MAX);
    return {
      brand: 'portal',
      subject: 'Your coaching session summary',
      blocks: [
        { type: 'heading', text: greeting(firstName) },
        { type: 'text', text: today || !day ? `Here’s your summary from today’s coaching session with ${name}.` : `Here’s your summary from your coaching session with ${name} on ${day}.` },
        ...(paragraphs.length ? [{ type: 'label', text: 'What we talked about' }, ...paragraphs.map((text) => ({ type: 'text', text }))] : []),
        ...(todo.length ? [{ type: 'label', text: todo.length === 1 ? 'The action you agreed' : 'The actions you agreed' }, ...todo.map((text) => ({ type: 'text', text }))] : []),
      ],
      // Someone with no account may have come to a group's session only: the reason they get it says so.
      footer: { lines: [`You get this because you were at a coaching session with ${name}.`, EMAIL_SIGN_OFF] },
    };
  }
  return {
    brand: 'portal',
    subject: 'Your coaching session summary is ready',
    blocks: [
      { type: 'heading', text: today || !day ? `Your summary from today’s coaching session with ${name} is ready.` : `Your summary from your coaching session with ${name} on ${day} is ready.` },
      { type: 'text', text: 'It has what you talked about and the actions you agreed.' },
      { type: 'button', label: 'Read my summary', href: `${origin}/coaching` },
    ],
    footer,
  };
}

// ---------------------------------------------------------------- the welcome (Phase 6a run 2; draft-2's "Welcome")
/**
 * When a coach sets up a client's account: from the coach, signed with their first name, sent only when the coach
 * presses "Invite" on the client's page (api/_routes/coach-send.js, kind 'invite'), and only from the live site. The button
 * opens `link` when the sender gives one, otherwise the portal's own Create your account page (where the password is
 * chosen); once the person has an account with this email address, their Coaching page offers the invite to accept
 * (049's my_coach_invites). The address it goes to is never passed in here.
 * @param {object} o
 * @param {string} o.origin       the portal's own address (api/_portalOrigin.js)
 * @param {string} o.coach        the coach's first name
 * @param {string} [o.firstName]  the client's first name ("Hello," without it)
 * @param {string|null} [o.link]  the set-password link, when there is one
 */
export function clientInviteEmail({ origin, coach, firstName = '', link = null }) {
  const name = oneLine(coach).slice(0, 60);
  return {
    brand: 'portal',
    subject: name ? `${name} has set up your account on The Clarity Portal` : 'Your coach has set up your account on The Clarity Portal',
    blocks: [
      { type: 'heading', text: greeting(firstName) },
      { type: 'text', text: 'I’ve set up your account on The Clarity Portal, where we’ll plan, track and review your progress together.' },
      { type: 'text', text: 'It takes ~2 minutes to set your password.' },
      { type: 'button', label: 'Set my password', href: link || `${origin}/auth/sign-up` },
      { type: 'text', text: 'The link works for 7 days.' },
      signedBy(name),
    ],
    footer: { lines: [`You get this because ${name || 'your coach'} added this email address as a client in The Clarity Portal.`, EMAIL_SIGN_OFF] },
  };
}

// ---------------------------------------------------------------- workshops (templates only; Phase 6a run 1)
// A workshop's attendees are emails, not clients, so these come from the
// business. Times are in the workshop's own place (zone), where the people
// coming are. Nothing sends them yet: the coach portal keeps each
// workshop's choices, and sending arrives with the booking emails.
const workshopFooter = (title) => ({ lines: [`You get this because you registered for ${oneLine(title)}.`, EMAIL_SIGN_OFF] });

/** The day before a workshop. */
export function workshopTomorrowEmail({ title, at, zone, place, now = new Date() }) {
  const day = relativeDayWords(at, zone, now);
  const name = oneLine(title);
  return {
    brand: 'project',
    subject: `${name} is ${day === 'tomorrow' || day === 'today' ? day : `on ${day}`} at ${timeWords(at, zone)}`,
    blocks: [
      { type: 'heading', text: day === 'tomorrow' ? `${name} is tomorrow.` : `${name} is coming up.` },
      { type: 'text', text: `It starts ${sessionWhenWords(at, zone, now)}.` },
      place ? { type: 'details', rows: [['Where', oneLine(place)]] } : null,
    ],
    footer: workshopFooter(title),
  };
}

/** One hour before: no clock time at all, so it can't be wrong. */
export function workshopInOneHourEmail({ title, place }) {
  const name = oneLine(title);
  return {
    brand: 'project',
    subject: `${name} starts in 1 hour`,
    blocks: [
      { type: 'heading', text: `${name} starts in 1 hour.` },
      place ? { type: 'details', rows: [['Where', oneLine(place)]] } : null,
    ],
    footer: workshopFooter(title),
  };
}

/** The follow-up the day after: the coach's own words, then the short survey by each person's own link. */
export function workshopFollowUpEmail({ title, words = '', surveyLink = null }) {
  const name = oneLine(title);
  const lines = String(words || '').split(/\n+/).map((l) => l.trim()).filter(Boolean).slice(0, 12);
  return {
    brand: 'project',
    subject: `Thank you for coming to ${name}`,
    blocks: [
      { type: 'heading', text: 'Thank you for coming.' },
      ...lines.map((text) => ({ type: 'text', text })),
      surveyLink ? { type: 'button', label: 'Answer 3 questions', href: surveyLink, time: '~1 minute' } : null,
    ],
    footer: workshopFooter(title),
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

// ---------------------------------------------------------------- a call booked through a booking page (Phase 6a run 3)
// To the person who booked: draft-2's "Booked" and "Moved" words, with the
// call's own name ("Your Discovery call with Tim is booked for …"; a
// coaching session reads exactly as draft-2), the time in THEIR own zone
// with its city's name (12-hour for the US and Canada), the day in words,
// Join on Zoom when the call has a link, and Rearrange and Cancel on their
// own page. It goes from the business (the person may have no account, so
// no prep is offered). Sent only by api/_routes/booking-email.js, from the live
// site, once for each time booked.
/** "coaching session" for a coaching session, otherwise the call's own name, or "call". */
const callWords = (callName) => { const c = oneLine(shownCallName(callName)); return !c ? 'call' : /^coaching session$/i.test(c) ? 'coaching session' : c; };
const bookedFooter = (call) => [`You get this because you booked ${call === 'call' ? 'a call' : call}.`, EMAIL_SIGN_OFF];

/**
 * @param {{ name?: string, callName: string, coach?: string, at: Date|string, zone: string, minutes?: number, placeKind?: string, zoomLink?: string, mineLink: string, moved?: boolean, now?: Date }} booking
 */
export function bookingConfirmedEmail({ callName, coach, at, zone, minutes = null, placeKind = 'zoom', zoomLink = null, mineLink, moved = false }) {
  const what = callWords(callName);
  const who = coach ? oneLine(coach) : '';
  const footer = bookedFooter(what);
  return moved
    ? movedDoc({ brand: 'project', what, coach: who, at, zone, zoomLink, rearrangeLink: mineLink, footer })
    : bookedDoc({ brand: 'project', what, coach: who, at, zone, minutes, placeKind, zoomLink, rearrangeLink: mineLink, cancelLink: mineLink, prep: false, footer });
}

// ---------------------------------------------------------------- reminders for a call someone booked (Phase 6a run 3, step 6)
// To the person who booked a call on a booking page (they may have no
// account, so there is no prep and nothing to sign in to): the day before
// at 18:00 their own time, and 1 hour before, in draft-2's words with the
// call's own name. Times are in THEIR zone with its city's name. Sent only
// by api/_routes/coach-reminders.js, from the live site, once each.

/**
 * @param {{ name?: string, callName: string, coach?: string, at: Date|string, zone: string, placeKind?: string, zoomLink?: string, mineLink?: string, now?: Date }} call
 */
export function callTomorrowEmail({ callName, coach, at, zone, zoomLink = null, mineLink = null, now = new Date() }) {
  const what = callWords(callName);
  const withWho = coach ? ` with ${oneLine(coach)}` : '';
  const line = `Your ${what}${withWho} is ${dayAndTime(at, zone, now)}`;
  return {
    brand: 'project',
    subject: line,
    blocks: [
      { type: 'heading', text: `${line}.` },
      { type: 'text', text: USEFUL },
      zoomLink ? { type: 'button', label: 'Join on Zoom', href: zoomLink } : null,
      mineLink ? { type: 'link', label: 'Rearrange', href: mineLink } : null,
    ],
    footer: { lines: bookedFooter(what) },
  };
}

/** One hour before a booked call: its clock time in the reader's own zone. */
export function callInOneHourEmail({ callName, coach, at = null, zone = null, zoomLink = null, mineLink = null }) {
  const what = callWords(callName);
  const withWho = coach ? ` with ${oneLine(coach)}` : '';
  const line = `Your ${what}${withWho} ${startsAt(at, zone)}`;
  return {
    brand: 'project',
    subject: line,
    blocks: [
      { type: 'heading', text: `${line}.` },
      zoomLink ? { type: 'button', label: 'Join on Zoom', href: zoomLink } : null,
      !zoomLink && mineLink ? { type: 'link', label: 'Rearrange', href: mineLink } : null,
    ],
    footer: { lines: bookedFooter(what) },
  };
}
