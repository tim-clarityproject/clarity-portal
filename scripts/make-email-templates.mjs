// Makes the email templates that are saved OUTSIDE the portal's code, from
// the one shared email template (src/lib/email), so they match every other
// email. Tim pastes each into its service once; nothing here sends or
// changes anything.
//
//   node scripts/make-email-templates.mjs          writes email-templates/
//   node scripts/make-email-templates.mjs --check  fails if the saved files are out of date
//
//   supabase-confirm-signup.html / .txt   Supabase, Authentication, Emails, "Confirm signup"
//   supabase-reset-password.html / .txt   Supabase, Authentication, Emails, "Reset password"
//   supabase-change-email.html / .txt     Supabase, Authentication, Emails, "Change email address"
//   supabase-invite.html / .txt           Supabase, Authentication, Emails, "Invite user"
//       Each link is in the form that opens in any browser (Tim, 13 Nov):
//       the page it lands on ({{ .RedirectTo }}; the site's own invite page
//       for an invite), then ?token_hash={{ .TokenHash }}&type=… . These are
//       Supabase's own placeholders, and the page hands the token in itself.
//   kit-leading-ideas.html                Kit, Email Templates, New HTML template:
//       {{ message_content }}, {{ unsubscribe_url }} and {{ address }} are
//       Kit's own placeholders (Kit requires the last two).
//
// These services can't carry an image inside the email, so here the image
// is a link to the live portal's own copy (public/brand), which is there
// once this branch is live.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { EMAIL_IMAGES, renderEmail, tokenLink } from '../src/lib/email/template.js';
import { confirmEmailEmail, resetPasswordEmail, changeEmailEmail, inviteEmail, leadingIdeasPublicEmail } from '../src/lib/email/emails.js';

const LIVE = 'https://portal.theclarityproject.co.uk';
const image = (key) => `${LIVE}${EMAIL_IMAGES[key].path}`;
const DIR = 'email-templates';

const kit = leadingIdeasPublicEmail({ issue: 0, theme: '', quote: '', by: '', question: '', shareLink: 'https://theclarityproject.co.uk/leading-ideas', signUpLink: `${LIVE}/auth/sign-up`, unsubscribeLink: '{{ unsubscribe_url }}', address: '{{ address }}' });
// Kit puts each issue's own words (headline, quote, question) where the message goes.
kit.blocks = [{ type: 'slot', placeholder: '{{ message_content }}' }, ...kit.blocks.filter((b) => b.type === 'section')];
kit.subject = 'Leading Ideas';

const files = {};
const add = (name, doc, { text = true } = {}) => {
  const r = renderEmail(doc, { image });
  files[`${name}.html`] = `${r.html}\n`;
  if (text) files[`${name}.txt`] = `${r.text}\n`;
  files[`${name}.subject.txt`] = `${r.subject}\n`;
};
add('supabase-confirm-signup', confirmEmailEmail({ link: tokenLink('email') }));
add('supabase-reset-password', resetPasswordEmail({ link: tokenLink('recovery') }));
add('supabase-change-email', changeEmailEmail({ link: tokenLink('email_change') }));
add('supabase-invite', inviteEmail({ link: tokenLink('invite') }));
add('kit-leading-ideas', kit, { text: false });
delete files['kit-leading-ideas.subject.txt'];

if (process.argv.includes('--check')) {
  const stale = Object.entries(files).filter(([name, body]) => !existsSync(`${DIR}/${name}`) || readFileSync(`${DIR}/${name}`, 'utf8') !== body).map(([name]) => name);
  if (stale.length) { console.error(`Out of date: ${stale.join(', ')}. Run node scripts/make-email-templates.mjs.`); process.exit(1); }
  console.log(`${Object.keys(files).length} email template files are up to date.`);
} else {
  mkdirSync(DIR, { recursive: true });
  for (const [name, body] of Object.entries(files)) writeFileSync(`${DIR}/${name}`, body);
  console.log(`Wrote ${Object.keys(files).length} files to ${DIR}/.`);
}
