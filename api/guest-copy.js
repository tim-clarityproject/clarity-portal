// Guest links: emails a guest a copy of the plan they just made (mock-up M9,
// the guest's end page: "A copy is on its way to …").
//   POST /api/guest-copy  { visit }
//
// The browser never says who the email goes to, or what it says. It sends
// only its visit key; the database (migration 042, guest_copy_issue, asked
// with the server's key) checks the visit, counts the send (3 a link each
// hour, 10 a guest each day) and hands back the guest's own email and
// their own rows. Anything else in the request is ignored.
//
// It sends only from the live site (maySend): on a preview or a developer's
// machine it answers { ok: true, sent: false } without asking the database
// or the email provider anything, so a test there can never email a person.
//
// Answers: { ok, sent }. Errors are generic, the address is never sent back,
// and nothing is logged: no address, visit key or answer.
//   200 { ok: true,  sent: true }    the copy went
//   200 { ok: true,  sent: false }   this deployment never sends
//   200 { ok: false, sent: false }   not set up yet (no server key, or 035
//                                    and 042 haven't run), or nothing to send
//   400 the visit key is the wrong shape, or the visit has ended
//   429 the send limit
//   502 the database or the email provider didn't answer
//
// The link in the email starts with one of the portal's own addresses
// (_portalOrigin.js), never the request's host.
//
// Environment variables (Vercel): RESEND_API_KEY, GUEST_EMAIL_FROM (or
// ALIGNMENT_EMAIL_FROM), SUPABASE_SERVICE_ROLE_KEY, and the Supabase URL
// the app already has (SUPABASE_URL or VITE_SUPABASE_URL).

import { COPY_TOOLS, copyContent, maySend, planCopyEmail } from './_guestEmails.js';
import { portalOrigin } from './_portalOrigin.js';

const VISIT = /^[0-9a-f]{64}$/;

function reply(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).json(body);
}

const config = () => ({
  url: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  key: process.env.SUPABASE_SERVICE_ROLE_KEY,
  resend: process.env.RESEND_API_KEY,
  from: process.env.GUEST_EMAIL_FROM || process.env.ALIGNMENT_EMAIL_FROM,
});

// Always with the server's key: both functions are closed to everyone else.
async function rpc(name, args) {
  const { url, key } = config();
  // A newer Supabase secret key (not a JWT) goes in apikey only.
  const headers = { 'Content-Type': 'application/json', apikey: key };
  if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`;
  const r = await fetch(`${url}/rest/v1/rpc/${name}`, { method: 'POST', headers, body: JSON.stringify(args) });
  if (!r.ok) {
    const e = new Error('rpc');
    e.status = r.status;
    throw e;
  }
  return r.json();
}

async function sendWithResend({ to, subject, html, text, attachments }) {
  const { resend, from } = config();
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resend}` },
    body: JSON.stringify({ from, to: [to], subject, html, text, attachments }),
  });
  if (!r.ok) throw new Error('send');
}

// The count of this send is taken back, so the copy can be asked for again.
async function notSent(visit) {
  try { await rpc('guest_copy_failed', { p_visit: visit }); } catch { /* nothing more to do */ }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return reply(res, 405, { ok: false, sent: false, error: 'invalid' });

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const { visit } = body;
  if (typeof visit !== 'string' || !VISIT.test(visit)) return reply(res, 400, { ok: false, sent: false, error: 'invalid' });

  // The first line of defence: only the live site ever sends.
  if (!maySend(process.env)) return reply(res, 200, { ok: true, sent: false });

  const { url, key, resend, from } = config();
  if (!url || !key || !resend || !from) return reply(res, 200, { ok: false, sent: false });

  let issue;
  try {
    issue = await rpc('guest_copy_issue', { p_visit: visit });
  } catch (e) {
    // 404: migration 042 hasn't run yet. 403: the visit has ended.
    if (e.status === 404) return reply(res, 200, { ok: false, sent: false });
    if (e.status === 403) return reply(res, 400, { ok: false, sent: false, error: 'invalid' });
    return reply(res, 502, { ok: false, sent: false });
  }
  if (!issue || issue.ok !== true) {
    if (issue?.error === 'limit') return reply(res, 429, { ok: false, sent: false, error: 'limit' });
    return reply(res, 200, { ok: false, sent: false });
  }

  // Who it goes to and what it says come from the database's answer only.
  const to = typeof issue.email === 'string' ? issue.email.trim() : '';
  const content = COPY_TOOLS.includes(issue.tool) && Array.isArray(issue.rows) ? copyContent(issue.rows[0]) : null;
  if (!/^[^\s@]+@[^\s@]+$/.test(to) || !content) {
    await notSent(visit);
    return reply(res, 200, { ok: false, sent: false });
  }

  try {
    await sendWithResend({
      to,
      ...planCopyEmail({
        // Only ever one of the portal's own addresses, never the request's host.
        origin: portalOrigin(req.headers),
        toolLabel: issue.tool_label,
        coachName: issue.coach_first_name,
        goal: content.goal,
        nextSteps: content.nextSteps,
      }),
    });
  } catch {
    await notSent(visit);
    return reply(res, 502, { ok: false, sent: false });
  }
  return reply(res, 200, { ok: true, sent: true });
}
