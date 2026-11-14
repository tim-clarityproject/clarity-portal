// Guest links: the copy of a guest's plan that is emailed to them (mock-up
// M9, the guest's end page: "A copy is on its way to …"). The email is a
// document for the one shared email template (src/lib/email), which also
// makes the plain-text version; its image travels inside it as an inline
// attachment. The file name starts with an underscore so Vercel does not
// publish it as a route.

import { EMAIL_IMAGE_BASE64 } from './_emailImages.js';
import { renderEmail, imagesFor } from '../src/lib/email/template.js';
import { guestPlanCopyEmail } from '../src/lib/email/emails.js';
import { planContent, planFrom, TOOL_NAME, TOOL_TYPE } from '../src/lib/getUnstuck/model.js';

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

/**
 * The plan in a saved row, as the email shows it: the goal and the next
 * steps, blanks left out. Null when there is nothing to send.
 */
export function copyContent(row) {
  const { goal, nextSteps } = planContent(planFrom(row && typeof row === 'object' ? row.form_data : null));
  return goal || nextSteps.length ? { goal, nextSteps } : null;
}

/** What Resend is given: the subject, both versions and the inline image. */
export function planCopyEmail({ origin, toolLabel, coachName, goal, nextSteps }) {
  const doc = guestPlanCopyEmail({ origin, toolName: toolLabel || TOOL_NAME, coachName, goal, nextSteps });
  const { subject, html, text, images } = renderEmail(doc);
  return { subject, html, text, attachments: imagesFor(images, EMAIL_IMAGE_BASE64) };
}
