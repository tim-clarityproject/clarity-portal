// Guest links: the copy of a guest's plan that is emailed to them (mock-up
// M9, the guest's end page: "A copy is on its way to …"). The email is a
// document for the one shared email template (src/lib/email), which also
// makes the plain-text version; its image travels inside it as an inline
// attachment. The file name starts with an underscore so Vercel does not
// publish it as a route.

import { EMAIL_IMAGE_BASE64 } from './_emailImages.js';
import { renderEmail, imagesFor } from '../src/lib/email/template.js';
import { guestEmailCodeEmail, guestPlanCopyEmail } from '../src/lib/email/emails.js';
import { GOAL_MAX, ROW_MAX, planContent, planFrom, TOOL_NAME, TOOL_TYPE } from '../src/lib/getUnstuck/model.js';

/**
 * May this deployment send a guest their copy? Only the live site. A
 * preview, a developer's machine and anything unnamed never send: a test
 * run there must not email a real person.
 */
export function maySend(env = process.env) {
  return Boolean(env) && env.VERCEL_ENV === 'production';
}

/** The tools whose plan has a copy email: the guest link's tool name (035's guest_tools). */
export const COPY_TOOLS = [TOOL_TYPE];

/** The most next steps one copy email lists. */
export const COPY_STEPS_MAX = 50;

/**
 * One address and nothing else: exactly one @, a dot after it, no space,
 * and none of the characters that write a list of addresses or a name
 * beside one (the same rule as 035's _guest_email).
 */
const ONE_ADDRESS = /^[^\s@,;<>()[\]\\":]+@[^\s@,;<>()[\]\\":.]+(\.[^\s@,;<>()[\]\\":.]+)+$/;
export function oneAddress(value) {
  const to = typeof value === 'string' ? value.trim() : '';
  return to.length <= 254 && ONE_ADDRESS.test(to) ? to : '';
}

/**
 * The plan in a saved row, as the email shows it: the goal and the next
 * steps, blanks left out. Null when there is nothing to send.
 *
 * The page takes 300 characters for the goal and for each next step. A row
 * saved some other way (the guest functions can be called without the
 * page) may hold far more, and the email goes to an address nobody has
 * confirmed, so it never carries more than the page could have written:
 * the same 300 characters each, and 50 next steps (the break-it tester,
 * 14 Nov: one saved row made a 1.7 MB email).
 */
export function copyContent(row) {
  const { goal, nextSteps } = planContent(planFrom(row && typeof row === 'object' ? row.form_data : null));
  const short = (text, max) => Array.from(text).slice(0, max).join('').trim();
  const steps = nextSteps.slice(0, COPY_STEPS_MAX).map((s) => short(s, ROW_MAX)).filter(Boolean);
  const theGoal = short(goal, GOAL_MAX);
  return theGoal || steps.length ? { goal: theGoal, nextSteps: steps } : null;
}

/** What Resend is given: the subject, both versions and the inline image. */
export function planCopyEmail({ origin, toolLabel, coachName, goal, nextSteps }) {
  const doc = guestPlanCopyEmail({ origin, toolName: toolLabel || TOOL_NAME, coachName, goal, nextSteps });
  const { subject, html, text, images } = renderEmail(doc);
  return { subject, html, text, attachments: imagesFor(images, EMAIL_IMAGE_BASE64) };
}

/** The 6-digit code that shows a guest their earlier answers (046): what Resend is given. */
export function guestCodeEmail({ toolLabel, code }) {
  const { subject, html, text, images } = renderEmail(guestEmailCodeEmail({ toolName: toolLabel || TOOL_NAME, code }));
  return { subject, html, text, attachments: imagesFor(images, EMAIL_IMAGE_BASE64) };
}
