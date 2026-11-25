// What a to-do made from a forwarded email shows (moved here from crm.js unchanged in tidy follow-up 4, part 1, item 1):
// a to-do row needs it, never the rest of the CRM's rules. A pure function (tests/performance/coach-crm.test.mjs);
// crm.js still names it.
import { clean } from './model.js';

/** What a to-do made from a forwarded email shows under Attachments: "Email from Ruth Adams", "Forwarded from Gmail" (M11's "A to-do from a forwarded email"), and the email itself when it is on a timeline too. */
export function todoEmailLine(todo, emails = []) {
  if (!todo?.from_email_sender && !todo?.from_email_ref) return null;
  const email = todo.from_email_ref ? (emails || []).find((e) => e.external_id === todo.from_email_ref) || null : null;
  return { title: `Email from ${clean(todo.from_email_sender) || 'someone'}`, small: email?.source === 'gmail' ? 'Forwarded from Gmail' : 'Forwarded by email', email };
}
