// Clarity Coach: the email of a session's recap (Phase 6a run 2; M11's
// "After a call: the recap").
//   POST /api/coach-send  { kind: 'recap', sessionId }
// with the coach's own sign-in as the Authorization header.
//
// Nothing here sends by itself, and nothing here decides that a recap is
// sent: the coach presses Send the recap, the database marks it sent once
// (migration 050's session_send_recap), and only then does the page ask for
// this email. Everything is read WITH THE CALLER'S OWN SIGN-IN, so the
// database's rules decide what can be read: the session (its coach alone
// reads it), its ticked actions, and who it goes to (session_recap_people,
// which answers only for a sent recap of the caller's own). No server key
// is used, and the browser never says who the email goes to or what it says.
//
// It sends only from the live site (maySend): on a preview or a developer's
// machine it answers { sent: false, reason: 'preview' } before asking the
// database or the email provider anything, so a test there can never email
// a person. It also sends only in the 10 minutes after the recap was marked
// sent, so an old recap can't be emailed again by asking twice.
//
// Answers. Errors are generic, no address is ever sent back, and nothing is
// logged: no address, name or word of a recap.
//   200 { sent: true, people: 6 }           it went
//   200 { sent: false, reason: 'preview' }  this deployment never sends
//   200 { sent: false, reason }             'setup' (no email provider yet), 'nobody' (no address to send to),
//                                           'late' (sent longer ago), 'not_sent' (the recap hasn't been sent)
//   400 the request is the wrong shape      401 not signed in
//   404 no such session for this coach      502 the database or the email provider didn't answer
//
// Environment variables (Vercel): RESEND_API_KEY, COACH_EMAIL_FROM (or
// GUEST_EMAIL_FROM, or ALIGNMENT_EMAIL_FROM), and the Supabase URL and anon
// key the app already has.
import { createClient } from '@supabase/supabase-js';
import { EMAIL_IMAGE_BASE64 } from './_emailImages.js';
import { maySend, oneAddress } from './_guestEmails.js';
import { portalOrigin } from './_portalOrigin.js';
import { imagesFor, renderEmail } from '../src/lib/email/template.js';
import { sessionRecapEmail } from '../src/lib/email/emails.js';
import { dayWords, isZone } from '../src/lib/time/index.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SEND_WINDOW_MS = 10 * 60 * 1000;
const PEOPLE_MAX = 60;

const reply = (res, status, body) => { res.status(status).setHeader('Cache-Control', 'no-store'); res.json(body); };

/** What Resend is given for one person: the subject, both versions and the inline image. */
export function recapEmail({ origin, coach, dateText, recap, actions }) {
  const { subject, html, text, images } = renderEmail(sessionRecapEmail({ origin, coach, dateText, recap, actions }));
  return { subject, html, text, attachments: imagesFor(images, EMAIL_IMAGE_BASE64) };
}

/** May this recap still be emailed? Only one marked sent, and only just now. */
export function recapSendable(session, now = Date.now()) {
  if (!session || !session.recap_sent_at) return 'not_sent';
  const at = new Date(session.recap_sent_at).getTime();
  if (!Number.isFinite(at) || now - at > SEND_WINDOW_MS || at - now > SEND_WINDOW_MS) return 'late';
  return 'ok';
}

async function sendWithResend(env, { to, subject, html, text, attachments }) {
  const from = env.COACH_EMAIL_FROM || env.GUEST_EMAIL_FROM || env.ALIGNMENT_EMAIL_FROM;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.RESEND_API_KEY}` },
    body: JSON.stringify({ from, to: [to], subject, html, text, attachments }),
  });
  if (!r.ok) throw new Error('send');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return reply(res, 405, { sent: false, message: 'That didn’t work. Try again in a moment.' });
  const env = process.env;
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  if (body.kind !== 'recap' || typeof body.sessionId !== 'string' || !UUID.test(body.sessionId)) return reply(res, 400, { sent: false, message: 'That didn’t work. Try again in a moment.' });

  // The first line of defence: only the live site ever sends.
  if (!maySend(env)) return reply(res, 200, { sent: false, reason: 'preview' });

  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const anon = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!url || !anon || !token) return reply(res, 401, { sent: false, message: 'Sign in again to carry on.' });
  if (!env.RESEND_API_KEY || !(env.COACH_EMAIL_FROM || env.GUEST_EMAIL_FROM || env.ALIGNMENT_EMAIL_FROM)) return reply(res, 200, { sent: false, reason: 'setup' });

  // Asked as the caller: the database's rules decide what is read.
  const asCaller = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: who, error: whoError } = await asCaller.auth.getUser(token);
  if (whoError || !who?.user?.id) return reply(res, 401, { sent: false, message: 'Sign in again to carry on.' });

  const { data: session, error: sessionError } = await asCaller.from('coach_sessions').select('id,profile_id,group_id,starts_at,recap,recap_sent_at').eq('id', body.sessionId).maybeSingle();
  if (sessionError) return reply(res, 502, { sent: false, message: 'That didn’t send. Try again in a moment.' });
  if (!session) return reply(res, 404, { sent: false, message: 'That session isn’t yours.' });
  const state = recapSendable(session);
  if (state !== 'ok') return reply(res, 200, { sent: false, reason: state });

  const [{ data: people, error: peopleError }, { data: actions, error: actionsError }, { data: coaches }, { data: profile }, { data: settings }] = await Promise.all([
    asCaller.rpc('session_recap_people', { p_session: session.id }),
    asCaller.from('coach_session_actions').select('title,position').eq('session_id', session.id).eq('send', true).order('position', { ascending: true }).limit(60),
    asCaller.from('coaches').select('id,display_first_name').eq('user_id', who.user.id).limit(1),
    session.profile_id ? asCaller.from('client_profiles').select('time_zone').eq('id', session.profile_id).maybeSingle() : Promise.resolve({ data: null }),
    asCaller.from('coach_settings').select('time_zone').limit(1),
  ]);
  if (peopleError || actionsError) return reply(res, 502, { sent: false, message: 'That didn’t send. Try again in a moment.' });

  // One address each, never a list or a name beside an address; nobody twice.
  const to = [...new Set((Array.isArray(people) ? people : []).map((p) => oneAddress(p?.email).toLowerCase()).filter(Boolean))].slice(0, PEOPLE_MAX);
  if (!to.length) return reply(res, 200, { sent: false, reason: 'nobody' });

  // The session's day in words, on the reader's own calendar where it is known (a client's zone), otherwise the coach's.
  const zone = [profile?.time_zone, settings?.[0]?.time_zone, 'Europe/London'].find((z) => isZone(z));
  const email = recapEmail({
    // Only ever one of the portal's own addresses, never the request's host.
    origin: portalOrigin(req.headers, env),
    coach: coaches?.[0]?.display_first_name || '',
    dateText: dayWords(session.starts_at, zone, { year: true }),
    recap: session.recap,
    actions: (actions || []).map((a) => a.title),
  });

  let went = 0;
  for (const address of to) {
    try { await sendWithResend(env, { to: address, ...email }); went += 1; } catch { /* the others still go */ }
  }
  if (!went) return reply(res, 502, { sent: false, message: 'That didn’t send. Try again in a moment.' });
  return reply(res, 200, { sent: true, people: went });
}
