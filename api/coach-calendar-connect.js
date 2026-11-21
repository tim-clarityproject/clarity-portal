// Clarity Coach: connecting a coach's own Google account to the calendar
// (Phase 6a run 3, step 3). Settings, My calendars asks here; the browser
// never sees a key or a token.
//
//   POST /api/coach-calendar-connect  { kind: 'start' }        (the coach's own sign-in)
//        → { ok: true, url }   the address of Google's own consent page
//   GET  /api/coach-calendar-connect?code=…&state=…            (Google sends the coach back here)
//        → 302 to /coach/settings/calendars?google=on | problem
//   POST /api/coach-calendar-connect  { kind: 'disconnect' }   (the coach's own sign-in)
//        → { ok: true }
//
// How it is kept safe:
//   - Only the live site ever runs it (maySend): a preview or a developer's
//     machine answers { ok: false, reason: 'preview' } and asks nothing.
//   - Who may start is the database's to say: the caller's own sign-in must
//     be an active coach (asked AS THE CALLER).
//   - `state` names the coach and runs out after 10 minutes, and is signed
//     with the server's own secret (HMAC-SHA256), so a return that Google
//     didn't make for that coach, or a late one, is refused.
//   - The return address is built from the portal's own allow-list
//     (_portalOrigin.js), never from the request's host, and must be saved
//     exactly in Google Cloud: <the portal's address>/api/coach-calendar-connect
//   - It asks Google for one thing only, the coach's calendar events
//     (calendar.events), and keeps the token Google gives in
//     coach_connections.secret (migration 051), which is the server's alone:
//     no person, the coach included, can read it. Nothing is logged.
//
// THIS HAS NEVER MET THE REAL GOOGLE: no key exists yet. Walk it once when
// the keys are added (the report lists them).
//
// Environment variables (Vercel, Production only):
//   GOOGLE_CALENDAR_CLIENT_ID, GOOGLE_CALENDAR_CLIENT_SECRET, SUPABASE_SERVICE_ROLE_KEY
import { createClient } from '@supabase/supabase-js';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { maySend } from './_guestEmails.js';
import { codeRefusal } from './_coachCode.js';
import { asCallerClient, supabaseOf, UUID } from './_coachEmails.js';
import { LIVE_ORIGIN, portalOrigin } from './_portalOrigin.js';

export const config = { maxDuration: 15 };

export const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
export const STATE_MINUTES = 10;
const BACK = '/coach/settings/calendars';
const DIDNT_WORK = 'That didn’t work. Try again in a moment.';
const reply = (res, status, body) => { res.status(status).setHeader('Cache-Control', 'no-store'); res.json(body); };
const b64 = (text) => Buffer.from(text).toString('base64url');
const sign = (text, secret) => createHmac('sha256', String(secret)).update(text).digest('base64url');

/** The address Google sends the coach back to: the portal's own, exactly as saved in Google Cloud. */
export const returnAddress = (origin) => `${origin}/api/coach-calendar-connect`;

/** The state Google hands back: which coach asked and until when, signed with the server's secret. */
export function makeState(coachId, secret, now = Date.now()) {
  const body = b64(JSON.stringify({ c: coachId, e: now + STATE_MINUTES * 60000 }));
  return `${body}.${sign(body, secret)}`;
}

/** The coach a state was made for, or null when it isn't ours, was changed, or has run out. */
export function readState(state, secret, now = Date.now()) {
  const [body, mark, ...rest] = String(state || '').split('.');
  if (!body || !mark || rest.length || !secret) return null;
  const wanted = Buffer.from(sign(body, secret));
  const given = Buffer.from(mark);
  if (wanted.length !== given.length || !timingSafeEqual(wanted, given)) return null;
  try {
    const { c, e } = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return UUID.test(String(c || '')) && Number.isFinite(e) && e > now ? String(c) : null;
  } catch {
    return null;
  }
}

/** Google's consent page for one coach: offline access (so the calendar stays in step while they are away), asked for each time so a token always comes back. */
export function consentUrl({ clientId, origin, state }) {
  const q = new URLSearchParams({
    client_id: clientId, redirect_uri: returnAddress(origin), response_type: 'code', scope: GOOGLE_SCOPE,
    access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

const serverClient = (env) => createClient(supabaseOf(env).url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

/** The caller's own active coach row, asked as the caller; null for anyone else. */
async function callerCoach(env, token) {
  const asCaller = asCallerClient(env, token);
  const { data: who, error } = await asCaller.auth.getUser(token);
  if (error || !who?.user?.id) return null;
  const { data } = await asCaller.from('coaches').select('id,active').eq('user_id', who.user.id).limit(1);
  const coach = data?.[0];
  return coach && coach.active !== false ? coach : null;
}

export default async function handler(req, res) {
  const env = process.env;
  const origin = maySend(env) ? portalOrigin(req.headers, env) : LIVE_ORIGIN;
  const ready = Boolean(env.GOOGLE_CALENDAR_CLIENT_ID && env.GOOGLE_CALENDAR_CLIENT_SECRET && env.SUPABASE_SERVICE_ROLE_KEY && supabaseOf(env).url);

  // Google sends the coach back here, in their own browser.
  if (req.method === 'GET') {
    const back = (how) => { res.status(302).setHeader('Cache-Control', 'no-store'); res.setHeader('Location', `${origin}${BACK}?google=${how}`); res.end(); };
    if (!maySend(env) || !ready) return back('problem');
    const coachId = readState(req.query?.state, env.GOOGLE_CALENDAR_CLIENT_SECRET);
    const code = typeof req.query?.code === 'string' && req.query.code.length <= 2000 ? req.query.code : null;
    if (!coachId || !code) return back('problem'); // refused at Google, changed on the way, or too late
    try {
      const r = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ code, client_id: env.GOOGLE_CALENDAR_CLIENT_ID, client_secret: env.GOOGLE_CALENDAR_CLIENT_SECRET, redirect_uri: returnAddress(origin), grant_type: 'authorization_code' }),
      });
      const j = r.ok ? await r.json() : null;
      if (!j?.refresh_token) return back('problem');
      const { error } = await serverClient(env).from('coach_connections').upsert(
        { coach_id: coachId, service: 'google_calendar', status: 'on', secret: j.refresh_token, sync_token: null, last_error: null, updated_at: new Date().toISOString() },
        { onConflict: 'coach_id,service' },
      );
      return back(error ? 'problem' : 'on');
    } catch {
      return back('problem');
    }
  }

  if (req.method !== 'POST') return reply(res, 405, { ok: false, message: DIDNT_WORK });
  const kind = req.body && typeof req.body === 'object' ? req.body.kind : null;
  if (kind !== 'start' && kind !== 'disconnect') return reply(res, 400, { ok: false, reason: 'shape', message: DIDNT_WORK });
  if (!maySend(env)) return reply(res, 200, { ok: false, reason: 'preview' });
  if (!ready) return reply(res, 200, { ok: false, reason: 'not_connected' });
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return reply(res, 401, { ok: false, message: 'Sign in again to carry on.' });
  // Only a sign-in that has given its 6-digit code (054).
  const noCode = codeRefusal(token, { ok: false });
  if (noCode) return reply(res, noCode.status, noCode.body);
  const coach = await callerCoach(env, token).catch(() => null);
  if (!coach) return reply(res, 404, { ok: false, message: 'That isn’t yours to use.' });

  if (kind === 'start') {
    return reply(res, 200, { ok: true, url: consentUrl({ clientId: env.GOOGLE_CALENDAR_CLIENT_ID, origin, state: makeState(coach.id, env.GOOGLE_CALENDAR_CLIENT_SECRET) }) });
  }
  // Disconnect: Google is told to forget the token (if it answers), and the portal forgets it whatever Google says.
  try {
    const server = serverClient(env);
    const { data } = await server.from('coach_connections').select('secret').eq('coach_id', coach.id).eq('service', 'google_calendar').maybeSingle();
    if (data?.secret) await fetch('https://oauth2.googleapis.com/revoke', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: data.secret }) }).catch(() => {});
    const { error } = await server.from('coach_connections').upsert(
      { coach_id: coach.id, service: 'google_calendar', status: 'off', secret: null, sync_token: null, last_error: null, updated_at: new Date().toISOString() },
      { onConflict: 'coach_id,service' },
    );
    return error ? reply(res, 502, { ok: false, reason: 'no_answer', message: DIDNT_WORK }) : reply(res, 200, { ok: true });
  } catch {
    return reply(res, 502, { ok: false, reason: 'no_answer', message: DIDNT_WORK });
  }
}
