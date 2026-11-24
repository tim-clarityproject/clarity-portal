// Clarity Coach: what its email functions share (api/coach-send.js and
// api/workshop-emails.js). The file name starts with an underscore so
// Vercel does not publish it as a route.
import { createClient } from '@supabase/supabase-js';
import { EMAIL_IMAGE_BASE64 } from './_emailImages.js';
import { oneAddress } from './_guestEmails.js';
import { imagesFor, renderEmail } from '../src/lib/email/template.js';

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** The address the coach portal's emails come from, or '' when none is set up. */
export const fromAddress = (env) => env.COACH_EMAIL_FROM || env.GUEST_EMAIL_FROM || env.ALIGNMENT_EMAIL_FROM || '';

/** Whether an email provider is set up at all. */
export const canSend = (env) => Boolean(env.RESEND_API_KEY && fromAddress(env));

/** The Supabase address and public key the app already has. */
export const supabaseOf = (env) => ({ url: env.SUPABASE_URL || env.VITE_SUPABASE_URL, anon: env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY });

/** The database, asked as the caller: its rules decide what is read and done. */
export function asCallerClient(env, token) {
  const { url, anon } = supabaseOf(env);
  return createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
}

/** The database's answer for a function it doesn't have yet (the migration hasn't run). */
export function isMissingFunction(error) {
  const code = error?.code || '';
  return code === 'PGRST202' || code === '42883' || /could not find the function|function .* does not exist/i.test(`${error?.message || ''}`);
}

/** The database's answer for a table it doesn't have yet. */
export function isMissingTable(error) {
  const code = error?.code || '';
  return code === 'PGRST205' || code === '42P01' || /could not find the table|relation .* does not exist/i.test(`${error?.message || ''}`);
}

/** An email document as Resend is given it: the subject, both versions and the inline image. */
export function emailFrom(doc) {
  const { subject, html, text, images } = renderEmail(doc);
  return { subject, html, text, attachments: imagesFor(images, EMAIL_IMAGE_BASE64) };
}

/**
 * Sends one email. Resend refuses more than its rate (2 a second unless the
 * account's limit is raised) with 429, and a 429 means it was NOT taken, so
 * it is tried again after Retry-After (at most 2 seconds), twice at most
 * (the run 8 break-it tester: a reminder is claimed before it is sent, so a
 * 429 left as it was lost that guest's reminder for good). Any other refusal,
 * or no answer, is never tried again: it may have gone.
 */
export async function sendWithResend(env, { to, subject, html, text, attachments }, { tries = 3, wait = (ms) => new Promise((r) => { setTimeout(r, ms); }) } = {}) {
  for (let attempt = 1; ; attempt += 1) {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.RESEND_API_KEY}` },
      body: JSON.stringify({ from: fromAddress(env), to: [to], subject, html, text, attachments }),
    });
    if (r.ok) return;
    if (r.status !== 429 || attempt >= tries) {
      const e = new Error('send');
      e.status = r.status;
      throw e;
    }
    const after = Number(r.headers?.get?.('retry-after'));
    await wait(Number.isFinite(after) && after > 0 ? Math.min(after * 1000, 2000) : 1000);
  }
}

/**
 * One address each, never a list or a name beside an address, and nobody
 * twice: the people's rows with a clean lower-case `email`, at most `max`.
 */
export function onePerAddress(people, max, emailOf = (p) => p?.email) {
  const seen = new Set();
  const out = [];
  for (const person of Array.isArray(people) ? people : []) {
    const email = oneAddress(emailOf(person)).toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    out.push({ ...person, email });
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Sends one email to each person, two at a time (the provider's own pace),
 * each person's email made by `emailFor(person)`. One that doesn't go never
 * stops the others. Resolves how many went.
 */
export async function sendEach(env, people, emailFor) {
  let went = 0;
  const queue = [...people];
  const worker = async () => {
    for (let person = queue.shift(); person; person = queue.shift()) {
      try { await sendWithResend(env, { to: person.email, ...emailFor(person) }); went += 1; } catch { /* the others still go */ }
    }
  };
  await Promise.all([worker(), worker()]);
  return went;
}
