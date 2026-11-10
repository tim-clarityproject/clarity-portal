// Strategic Alignment Health Check: what its three emails say. Each is a
// document for the one shared email template (src/lib/email: light, the
// bold crosshair and "The Clarity Portal" at the top, one coral button, the
// sign-in box, "The Clarity Project LTD, founded by Dr. Tim Dutton" at the
// foot), which also makes the plain-text version from the same words. The
// template's image travels inside the email as an inline attachment
// (content ID), so it shows in every inbox whichever deployment sent the
// email. The file name starts with an underscore so Vercel does not
// publish it as a route.

import { EMAIL_IMAGE_BASE64 } from './_emailImages.js';
import { draftFromData } from '../src/pages/alignment/alignmentFlow.js';
import { headlineSentence, resultsModel } from '../src/health-check/words.js';
import { parseDbTimestamp } from '../src/lib/dateFormatter.js';
import { renderEmail, imagesFor } from '../src/lib/email/template.js';
import { healthCheckResultsEmail, healthCheckFinishedForCoachEmail, healthCheckFinishedNoteEmail } from '../src/lib/email/emails.js';
import { dayWords, whenWords } from '../src/lib/time/index.js';

// The coach's and the person's own time zones aren't known to this
// function, so its dates and times are the UK's, and say so ("14:05 UK
// time"); the day alone is written in words ("Tue 10 Nov 2026").
const UK = 'Europe/London';

/** What Resend is given: the subject, both versions and the inline image. */
function ready(doc) {
  const { subject, html, text, images } = renderEmail(doc);
  return { subject, html, text, attachments: imagesFor(images, EMAIL_IMAGE_BASE64) };
}

/** "2026-10-26": the day in the UK, the same clock as the email's dates. */
function ukDateKey(date) {
  return date.toLocaleDateString('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Europe/London' });
}

/**
 * The results in brief, for the completion email: the same headline and
 * questions to start with as the results page and the PDF, from the same
 * model (resultsModel in src/health-check/words.js, from
 * src/lib/scores/m20.js). Written about the respondent ("They rated…"),
 * because the email goes to the coach.
 * @param {Object} data the saved answers (alignment_sessions.data)
 * @param {string|Date} completedAt when it was completed: the Timing question counts from it
 * @returns {{line: number, headline: string, questions: {label: string, question: string, reason: string}[]}}
 */
export function completionSummary(data, completedAt) {
  const asOf = ukDateKey(parseDbTimestamp(completedAt));
  const model = resultsModel(draftFromData(data), { asOf, theirs: true });
  return {
    line: model.line,
    headline: headlineSentence(model.headline),
    questions: model.questions.map(({ label, question, reason }) => ({ label, question, reason })),
  };
}

/** "Tue 10 Nov 2026": the day in the UK, in words. */
export function ukDate(value) {
  return dayWords(value instanceof Date ? value : parseDbTimestamp(value), UK, { year: true });
}

/** "Tue 10 Nov 2026, 14:05 UK time". */
export function ukDateTime(value) {
  return whenWords(parseDbTimestamp(value), UK, { year: true });
}

/**
 * The email to the person who did the Health Check: their results, with
 * the email address and access code that open them under the button (Tim,
 * 10 Nov, 13:31; this replaces the 28 Oct rule that the code is never in
 * it). It only ever goes to the address that did the Health Check.
 */
export function linkEmail({ origin, token, dateText, clientLabel, email, code }) {
  return ready(healthCheckResultsEmail({ link: `${origin}/health-check/${token}`, organisation: clientLabel, dateText, email, code }));
}

/**
 * Who gets which email when a Health Check is finished (Tim, 29 Oct): the
 * answers go only to the coach who made the link. The owner list
 * (ALIGNMENT_NOTIFY_TO) gets a short notice with no answers, unless the link
 * is older and has no coach recorded, when the owner list gets the answers,
 * as before. An owner who made the link is its coach, so gets the answers;
 * the rest of the owner list gets the notice.
 * @param {{coachEmail: string|null, owners: string[]}} who
 * @returns {{answersTo: string[], noticeTo: string[]}}
 */
export function completionRecipients({ coachEmail, owners }) {
  const coach = String(coachEmail || '').trim();
  if (!coach) return { answersTo: [...owners], noticeTo: [] };
  const same = (a) => a.toLowerCase() === coach.toLowerCase();
  return { answersTo: [coach], noticeTo: owners.filter((a) => !same(a)) };
}

/** The owner list from ALIGNMENT_NOTIFY_TO: comma separated. */
export const ownerList = (value) => String(value || '').split(',').map((a) => a.trim()).filter(Boolean);

/**
 * The notice to the owner when someone else's Health Check link is finished:
 * only the organisation and the date. No answers, no PDF, no link, and
 * never the person's email or access code.
 */
export function finishedEmail({ clientLabel, dateText }) {
  return ready(healthCheckFinishedNoteEmail({ organisation: clientLabel, dateText }));
}

/**
 * The email to the coach who made the link (or the owner, for an older link)
 * when a Strategic Alignment Health Check is completed: the person's email
 * and access code under "Open the results" (Tim, 10 Nov, 13:31), then
 * completionSummary's headline and questions to start with, each with its
 * reason.
 */
export function completeEmail({ origin, token, clientLabel, respondentEmail, code, completedText, objective, summary, madeTheLink = true }) {
  return ready(healthCheckFinishedForCoachEmail({
    link: `${origin}/health-check/${token}`,
    organisation: clientLabel,
    email: respondentEmail,
    code,
    finishedText: completedText,
    objective,
    summary,
    madeTheLink,
  }));
}
