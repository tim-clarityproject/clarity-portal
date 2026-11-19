// Every email the portal sends, each as a document for the one shared
// template (template.js; mock-up email-template.html, Tim, 10 Nov). A
// function here says what the email says; the template decides how it
// looks, and makes the plain-text version from the same words.
//
// Sent today: the three Health Check emails (api/alignment-email.js) and
// the sign-in emails Supabase sends (their templates are made from
// these by scripts/make-email-templates.mjs, for Tim to paste into
// Supabase). The guest's copy of a plan (api/guest-copy.js) is sent only
// from the live site, once migrations 035 and 042 have run. Templates
// only, nothing sends them yet (booking and Kit come in Phase 6a): the
// session reminders and Leading Ideas.
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
 * database, never the browser (api/alignment-email.js).
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
 * the database (api/guest-copy.js).
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

// ---------------------------------------------------------------- the session recap (Phase 6a run 2)
/** The most actions one recap email lists, and the most characters of the recap it carries. */
export const RECAP_EMAIL_ACTIONS_MAX = 30;
export const RECAP_EMAIL_MAX = 12000;

/**
 * A session's recap, to the client (or each member of a group), sent only
 * when their coach presses Send the recap (api/coach-send.js; migration
 * 050's session_send_recap decides it goes once). The recap is the coach's
 * own typed words, shown as text, a paragraph at a time; the actions are the
 * ones the coach ticked to send. The address it goes to is never passed in
 * here: the server takes it from the database.
 * @param {object} o
 * @param {string} o.origin      the portal's own address (api/_portalOrigin.js)
 * @param {string} o.coach       the coach's first name
 * @param {string} o.dateText    the session's day in words, "Mon 16 Nov 2026"
 * @param {string} o.recap
 * @param {string[]} [o.actions] the ticked actions' words
 */
export function sessionRecapEmail({ origin, coach, dateText, recap, actions = [] }) {
  const name = oneLine(coach).slice(0, 60) || 'your coach';
  const day = oneLine(dateText);
  const paragraphs = String(recap || '').slice(0, RECAP_EMAIL_MAX).split(/\n\s*\n/).map(oneLine).filter(Boolean);
  const steps = (Array.isArray(actions) ? actions : []).map((a) => oneLine(a).slice(0, 300)).filter(Boolean).slice(0, RECAP_EMAIL_ACTIONS_MAX);
  return {
    brand: 'portal',
    subject: `Your session recap from ${name}${day ? `, ${day}` : ''}`,
    blocks: [
      { type: 'heading', text: 'Your session recap' },
      { type: 'text', text: day ? `From ${name}, after your session on ${day}.` : `From ${name}.`, quiet: true },
      ...paragraphs.map((text) => ({ type: 'text', text })),
      ...(steps.length ? [{ type: 'label', text: steps.length === 1 ? 'Your action' : 'Your actions' }, ...steps.map((step, i) => ({ type: 'note', text: steps.length > 1 ? `${i + 1}. ${step}` : step }))] : []),
      { type: 'button', label: 'Open my portal', href: `${origin}/welcome` },
    ],
    footer: { lines: [`You get this because ${name} is your coach.`, EMAIL_SIGN_OFF] },
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
