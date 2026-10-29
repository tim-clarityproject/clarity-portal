// Strategic Alignment Health Check: sends the two emails.
//   POST /api/alignment-email  { token, email, code, kind: 'link' | 'complete' }
//
// The browser never says who the email goes to:
//   'link'     -> always the session's own email address (from the database)
//   'complete' -> the answers only to the coach who made the link (migration
//                 036, alignment_recipients, with the server's key); the owner
//                 list (ALIGNMENT_NOTIFY_TO) gets a notice with no answers.
//                 An older link with no coach recorded sends the answers to
//                 the owner list, as before (completionRecipients).
// Every request is first checked in the database (alignment_email_check: link,
// email and access code, with the same lockout, plus the send limits). Errors
// are generic. Nothing is logged: no address, access code or token.
//
// Environment variables (Vercel): RESEND_API_KEY, ALIGNMENT_EMAIL_FROM,
// ALIGNMENT_NOTIFY_TO, SUPABASE_SERVICE_ROLE_KEY (only to ask who made the
// link), and the Supabase URL and anon key the app already has
// (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY, or SUPABASE_URL / SUPABASE_ANON_KEY).

import {
  linkEmail, completeEmail, completionSummary, completionRecipients, finishedEmail, ownerList, ukDate, ukDateTime,
} from './_alignmentEmails.js';
import { parseDbTimestamp } from '../src/lib/dateFormatter.js';

const KINDS = ['link', 'complete'];

function reply(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).json(body);
}

async function rpc(name, args, { server = false } = {}) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = server
    ? process.env.SUPABASE_SERVICE_ROLE_KEY
    : process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('config');
  // A newer Supabase secret key (not a JWT) goes in apikey only.
  const headers = { 'Content-Type': 'application/json', apikey: key };
  if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`;
  const r = await fetch(`${url}/rest/v1/rpc/${name}`, { method: 'POST', headers, body: JSON.stringify(args) });
  if (!r.ok) throw new Error('rpc');
  return r.json();
}

// The coach's address for a coach's link (036), or null for an older link.
// A coach's link whose coach can't be found sends nothing, rather than
// sending the answers to anyone else.
async function coachEmailFor(check, token) {
  if (check.has_coach !== true) return null;
  const who = await rpc('alignment_recipients', { p_token: token }, { server: true });
  const email = who && who.ok && typeof who.coach_email === 'string' ? who.coach_email.trim() : '';
  if (!email) throw new Error('recipients');
  return email;
}

async function sendWithResend({ to, subject, html, text, attachments }) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.ALIGNMENT_EMAIL_FROM;
  if (!key || !from || to.length === 0) throw new Error('config');
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ from, to, subject, html, text, attachments }),
  });
  if (!r.ok) throw new Error('send');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return reply(res, 405, { ok: false, error: 'invalid' });

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const { token, email, code, kind } = body;
  if (
    typeof token !== 'string' || token.length < 8 || token.length > 128
    || typeof email !== 'string' || email.length > 254
    || typeof code !== 'string' || code.length > 12
    || !KINDS.includes(kind)
  ) {
    return reply(res, 400, { ok: false, error: 'invalid' });
  }

  const args = { p_token: token, p_email: email, p_code: code, p_kind: kind };
  let check;
  try {
    check = await rpc('alignment_email_check', args);
  } catch {
    return reply(res, 502, { ok: false, error: 'failed' });
  }
  if (!check || !check.ok) {
    if (check?.error === 'limit') return reply(res, 429, { ok: false, error: 'limit' });
    if (check?.error === 'already') return reply(res, 200, { ok: false, error: 'already' });
    return reply(res, 400, { ok: false, error: 'invalid' });
  }

  // The site's own origin, so a preview sends preview links.
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const origin = `https://${String(host).split(',')[0].trim()}`;

  try {
    if (kind === 'link') {
      await sendWithResend({ to: [check.respondent_email], ...linkEmail({ origin, token, dateText: ukDate(new Date()) }) });
      return reply(res, 200, { ok: true });
    }

    const data = check.data || {};
    const completed = check.completed_at || data.completedAt || new Date().toISOString();
    const { answersTo, noticeTo } = completionRecipients({
      coachEmail: await coachEmailFor(check, token),
      owners: ownerList(process.env.ALIGNMENT_NOTIFY_TO),
    });
    await sendWithResend({
      to: answersTo,
      ...completeEmail({
        origin,
        token,
        clientLabel: check.client_label,
        respondentEmail: check.respondent_email,
        completedText: ukDateTime(completed),
        objective: data.objective || '',
        // the same headline and questions as the results page and the PDF
        summary: completionSummary(data, completed),
      }),
    });
    // The owner's notice: only that it was finished. The coach already has the
    // answers, so a notice that doesn't go is not tried again.
    if (noticeTo.length) {
      try {
        await sendWithResend({ to: noticeTo, ...finishedEmail({ clientLabel: check.client_label, dateText: ukDate(parseDbTimestamp(completed)) }) });
      } catch { /* the coach's email went; nothing more to do */ }
    }
    return reply(res, 200, { ok: true });
  } catch {
    // Undo the record of this send so it can be tried again.
    try { await rpc('alignment_email_failed', args); } catch { /* nothing more to do */ }
    return reply(res, 502, { ok: false, error: 'failed' });
  }
}
