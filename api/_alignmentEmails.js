// Strategic Alignment Health Check: email content (plain, well-spaced HTML plus a
// plain-text version). Black page, white text, the logo mark only (the NEGATIVE
// emblem, with its crosshair, because the background is dark). The logo travels
// inside the email as an inline attachment (content ID), so it shows in every
// inbox whichever deployment sent the email. The file name
// starts with an underscore so Vercel does not publish it as a route.

import { LOGO_NEGATIVE_BASE64 } from './_alignmentLogo.js';
import { draftFromData } from '../src/pages/alignment/alignmentFlow.js';
import { headlineSentence, resultsModel } from '../src/health-check/words.js';
import { parseDbTimestamp } from '../src/lib/dateFormatter.js';

const LOGO_CID = 'clarity-logomark';

/** The inline logo attachment, referenced in the HTML as cid:clarity-logomark. */
export const logoAttachment = () => ({
  filename: 'the-clarity-project.png',
  content: LOGO_NEGATIVE_BASE64,
  content_id: LOGO_CID,
  content_type: 'image/png',
  disposition: 'inline',
});

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const oneLine = (s) => String(s ?? '').replace(/[\r\n]+/g, ' ').trim();

const COLOURS = { bg: '#000000', text: '#FFFFFF', muted: '#A3A3A0', line: '#262626', coral: '#FF6F5C' };

function shell({ heading, bodyHtml }) {
  return `<!doctype html>
<html lang="en-GB">
<body style="margin:0;padding:0;background:${COLOURS.bg};">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${COLOURS.bg};">
<tr><td align="center" style="padding:40px 20px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;">
<tr><td style="padding-bottom:32px;"><img src="cid:${LOGO_CID}" width="40" height="40" alt="The Clarity Project" style="display:block;border:0;width:40px;height:40px;"></td></tr>
<tr><td style="font-family:Helvetica,Arial,sans-serif;font-size:20px;line-height:1.3;letter-spacing:2px;text-transform:uppercase;color:${COLOURS.text};padding-bottom:12px;">${esc(heading)}</td></tr>
<tr><td style="padding-bottom:24px;"><div style="width:56px;height:1px;background:${COLOURS.coral};"></div></td></tr>
${bodyHtml}
<tr><td style="font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:${COLOURS.muted};padding-top:32px;border-top:1px solid ${COLOURS.line};">The Clarity Project &middot; theclarityproject.co.uk</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

const para = (html) => `<tr><td style="font-family:Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6;color:${COLOURS.text};padding-bottom:20px;">${html}</td></tr>`;
const small = (html) => `<tr><td style="font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:${COLOURS.muted};padding-bottom:20px;">${html}</td></tr>`;
const button = (href, label) => `<tr><td style="padding-bottom:28px;"><a href="${esc(href)}" style="display:inline-block;background:${COLOURS.coral};color:#000000;font-family:Helvetica,Arial,sans-serif;font-size:12px;letter-spacing:2px;text-transform:uppercase;text-decoration:none;padding:16px 32px;border-radius:999px;">${esc(label)}</a></td></tr>`;

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

export function ukDate(value) {
  return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' });
}

export function ukDateTime(value) {
  const d = parseDbTimestamp(value);
  const date = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' });
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/London' });
  return `${date}, ${time}`;
}

/** The email to the respondent: a link to their results. Never contains the access code. */
export function linkEmail({ origin, token, dateText }) {
  const link = `${origin}/health-check/${token}`;
  const subject = 'Your Strategic Alignment Health Check';
  const html = shell({
    heading: 'Your Strategic Alignment Health Check',
    bodyHtml: [
      para('Here is the link to your Strategic Alignment Health Check results, so you can find them again at any time.'),
      button(link, 'Open your results'),
      small('To open it you will need the same email address and the access code you were given.'),
      small(esc(dateText)),
    ].join('\n'),
  });
  const text = [
    'Your Strategic Alignment Health Check',
    '',
    'Here is the link to your Strategic Alignment Health Check results, so you can find them again at any time:',
    link,
    '',
    'To open it you will need the same email address and the access code you were given.',
    '',
    dateText,
    '',
    'The Clarity Project - theclarityproject.co.uk',
  ].join('\n');
  return { subject, html, text, attachments: [logoAttachment()] };
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
 * only the organisation and the date. No answers, no PDF and no link.
 */
export function finishedEmail({ clientLabel, dateText }) {
  const label = oneLine(clientLabel);
  const subject = `Strategic Alignment Health Check finished: ${label}`;
  const html = shell({
    heading: 'Strategic Alignment Health Check finished',
    bodyHtml: [
      para(`<strong>${esc(label)}</strong> has finished a Strategic Alignment Health Check.`),
      small(`Finished: ${esc(dateText)}`),
      small('The answers went only to the coach who sent the link.'),
    ].join('\n'),
  });
  const text = [
    `${label} has finished a Strategic Alignment Health Check.`,
    '',
    `Finished: ${dateText}`,
    'The answers went only to the coach who sent the link.',
    '',
    'The Clarity Project - theclarityproject.co.uk',
  ].join('\n');
  return { subject, html, text, attachments: [logoAttachment()] };
}

/**
 * The email to the coach who made the link (or the owner, for an older link)
 * when a Strategic Alignment Health Check is completed. Its summary is
 * completionSummary's: the headline, then the questions to start with, each
 * with its reason.
 */
export function completeEmail({ origin, token, clientLabel, respondentEmail, completedText, objective, summary }) {
  const link = `${origin}/health-check/${token}`;
  const label = oneLine(clientLabel);
  const subject = `Strategic Alignment Health Check completed: ${label}`;
  const heading = (words) => `<span style="color:${COLOURS.muted};font-size:12px;letter-spacing:2px;text-transform:uppercase;">${words}</span>`;
  const questionsHtml = summary.questions.map((q) => (
    `<p style="margin:0 0 14px 0;"><span style="color:${COLOURS.muted};font-size:14px;">${esc(q.label)}</span><br>${esc(q.question)}<br><span style="color:${COLOURS.muted};font-size:14px;">${esc(q.reason)}</span></p>`
  )).join('');
  const html = shell({
    heading: 'Strategic Alignment Health Check completed',
    bodyHtml: [
      para(`<strong>${esc(label)}</strong> has completed the Strategic Alignment Health Check.`),
      small(`Respondent: ${esc(respondentEmail)}<br>Completed: ${esc(completedText)}`),
      para(`${heading('Objective')}<br>${esc(objective)}`),
      para(`${heading('At a glance')}<br>${esc(summary.headline)}<br><span style="color:${COLOURS.muted};font-size:14px;">Important means above ${summary.line}%.</span>`),
      para(`${heading('Questions to start with')}<br>${questionsHtml}`),
      button(link, 'Open the one-pager'),
      small('Opening it needs the respondent’s email address and the access code you sent them.'),
    ].join('\n'),
  });
  const text = [
    `${label} has completed the Strategic Alignment Health Check.`,
    '',
    `Respondent: ${respondentEmail}`,
    `Completed: ${completedText}`,
    '',
    'Objective:',
    objective,
    '',
    'At a glance:',
    summary.headline,
    `Important means above ${summary.line}%.`,
    '',
    'Questions to start with:',
    ...summary.questions.flatMap((q) => [`${q.label}. ${q.question}`, q.reason, '']),
    `One-pager: ${link}`,
    'Opening it needs the respondent’s email address and the access code you sent them.',
    '',
    'The Clarity Project - theclarityproject.co.uk',
  ].join('\n');
  return { subject, html, text, attachments: [logoAttachment()] };
}
