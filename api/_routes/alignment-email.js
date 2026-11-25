// Strategic Alignment Health Check: sends the two emails.
//   POST /api/alignment-email  { token, email, code, kind: 'link' | 'complete' | 'code' }
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
// are generic. Nothing is logged: no address, access code or token. The access
// code goes only into the person's own emails, never into the coach's answers
// email or the owner's notice (follow-up 1, 15 Nov).
//
// The link in each email starts with one of the portal's own addresses
// (_portalOrigin.js), never the request's host.
//
// A guest who chose Only you (migration 044): alignment_email_check answers
// 'private' for 'complete' before anything is marked as sent, so no email
// goes to the coach or the owner list; the answer is { ok: false, error:
// 'private' }. Their own 'link' email is unchanged.
//
// 'code' (migration 045): the guest chose Only you, so their access code has
// just changed. The new code goes to the address on the link only, and only
// the server can read it (alignment_new_code_to_send, the server's key); it is
// never returned to the browser. The page sends the code it had, which the
// function still accepts for this one purpose (to ask again), with the same
// lockout and at most 3 emails an hour.
// The coach's completion email never carries the access code (follow-up 1).
//
// It sends only from the live site (maySend, as api/_routes/guest-copy.js): on a
// preview or a developer's machine it answers { ok: true, sent: false }
// without asking the database or the email provider anything, so a test
// there can never email a person.
//
// 'link' (follow-up 5): a finished Health Check's email carries the results
// PDF, made here, light, from the answers alignment_email_check handed back
// for that session (the browser sends no answers; it may send its time zone,
// which only chooses the paper, with the browser's Accept-Language). If the
// PDF can't be made the email still goes, and then doesn't say a PDF is
// attached. An unfinished one has no PDF and says it can be carried on.
// Results never close (Tim, 25 Nov): the link and code open them at any time.
//
// Environment variables (Vercel): RESEND_API_KEY, ALIGNMENT_EMAIL_FROM,
// ALIGNMENT_NOTIFY_TO, SUPABASE_SERVICE_ROLE_KEY (only to ask who made the
// link), and the Supabase URL and anon key the app already has
// (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY, or SUPABASE_URL / SUPABASE_ANON_KEY).

import {
  linkEmail, completeEmail, newCodeEmail, completionSummary, completionRecipients, finishedEmail, ownerList, resultsPdf, ukDate, ukDateTime,
} from '../_alignmentEmails.js';
import { parseDbTimestamp } from '../../src/lib/dateFormatter.js';
import { portalOrigin } from '../_portalOrigin.js';
import { maySend } from '../_guestEmails.js';

const KINDS = ['link', 'complete', 'code'];

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
  // Only to choose the PDF's paper (serverPaper): a zone name, or nothing.
  const timeZone = typeof body.timeZone === 'string' && /^[A-Za-z_+\-/0-9]{1,64}$/.test(body.timeZone) ? body.timeZone : null;
  if (
    typeof token !== 'string' || token.length < 8 || token.length > 128
    || typeof email !== 'string' || email.length > 254
    || typeof code !== 'string' || code.length > 12
    || !KINDS.includes(kind)
  ) {
    return reply(res, 400, { ok: false, error: 'invalid' });
  }

  // The first line of defence: only the live site ever sends.
  if (!maySend(process.env)) return reply(res, 200, { ok: true, sent: false });

  // The guest's new access code, to their own address only.
  if (kind === 'code') {
    let fresh;
    try {
      fresh = await rpc('alignment_new_code_to_send', { p_token: token, p_email: email, p_code: code }, { server: true });
    } catch {
      return reply(res, 502, { ok: false, error: 'failed' });
    }
    if (!fresh || !fresh.ok) {
      if (fresh?.error === 'limit') return reply(res, 429, { ok: false, error: 'limit' });
      return reply(res, 400, { ok: false, error: 'invalid' });
    }
    try {
      await sendWithResend({
        to: [fresh.respondent_email],
        ...newCodeEmail({ origin: portalOrigin(req.headers), token, clientLabel: fresh.client_label, email: fresh.respondent_email, code: fresh.code }),
      });
    } catch {
      return reply(res, 502, { ok: false, error: 'failed' });
    }
    return reply(res, 200, { ok: true, sent: true });
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
    if (check?.error === 'private') return reply(res, 200, { ok: false, error: 'private' });
    return reply(res, 400, { ok: false, error: 'invalid' });
  }

  // Only ever one of the portal's own addresses, never the request's host
  // (a forged host gets the live address): a preview still sends preview links.
  const origin = portalOrigin(req.headers);

  try {
    if (kind === 'link') {
      const finished = check.status === 'complete';
      let pdf = null;
      if (finished) {
        try {
          pdf = await resultsPdf({ data: check.data, completedAt: check.completed_at, clientLabel: check.client_label, acceptLanguage: req.headers?.['accept-language'], timeZone });
        } catch { pdf = null; /* the email still goes, and says nothing of a PDF */ }
      }
      // The person's own email and the access code they just proved they hold (Tim, 10 Nov, 13:31).
      await sendWithResend({ to: [check.respondent_email], ...linkEmail({ origin, token, dateText: ukDate(new Date()), clientLabel: check.client_label, email: check.respondent_email, code, finished, pdf }) });
      return reply(res, 200, { ok: true, sent: true });
    }

    const data = check.data || {};
    const completed = check.completed_at || data.completedAt || new Date().toISOString();
    const coachEmail = await coachEmailFor(check, token);
    const { answersTo, noticeTo } = completionRecipients({
      coachEmail,
      owners: ownerList(process.env.ALIGNMENT_NOTIFY_TO),
    });
    await sendWithResend({
      to: answersTo,
      ...completeEmail({
        origin,
        token,
        clientLabel: check.client_label,
        respondentEmail: check.respondent_email,
        madeTheLink: Boolean(coachEmail),
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
    return reply(res, 200, { ok: true, sent: true });
  } catch {
    // Undo the record of this send so it can be tried again.
    try { await rpc('alignment_email_failed', args); } catch { /* nothing more to do */ }
    return reply(res, 502, { ok: false, error: 'failed' });
  }
}
