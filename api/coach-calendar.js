// Clarity Coach: Google Calendar and Zoom for the calendar (Phase 6a run 3).
// The browser never holds a key: its adapters (src/lib/coach/connect) post
// here with the coach's own sign-in, and this function uses the keys in its
// environment.
//   POST /api/coach-calendar  { kind: 'status' }
//        → { ok: true, google_calendar: boolean, zoom: boolean, google_ready: boolean }
//          google_ready: Google's keys are set, so the coach can connect
//          their own account (api/coach-calendar-connect.js)
//   POST /api/coach-calendar  { service: 'google_calendar', kind: 'list', syncToken? }
//        → { ok: true, events, syncToken }
//   POST /api/coach-calendar  { service: 'google_calendar', kind: 'create' | 'update' | 'delete', id?, event?, invite? }
//        → { ok: true, event? }
//   POST /api/coach-calendar  { service: 'zoom', kind: 'create' | 'update' | 'delete', id?, meeting? }
//        → { ok: true, meeting?: { id, joinUrl } }
//
// With no key it answers "not connected" calmly: status says false for that
// service, and anything asked of it answers { ok: false, reason:
// 'not_connected' }. The app then uses its stand-in (connect/standIn.js).
//
// It works only on the live site (maySend): a preview or a developer's
// machine answers status false and { ok: false, reason: 'preview' }, so a
// test there can never make a real event, invite or meeting.
//
// Who may ask is the database's to say: the caller's own sign-in must be an
// active coach (coach_connections_mine, migration 051, asked AS THE CALLER).
// The coach's own Google token is the server's alone (coach_connections.
// secret, read with the server's key); it is never sent to the browser and
// nothing is logged.
//
// A coach connects their own Google account from Settings, My calendars
// (api/coach-calendar-connect.js: Google's consent page and the return that
// stores the token; the row's status is then 'on'). Until a coach has, Google
// stays not connected even with the keys set. Zoom needs no consent screen:
// it uses the company's own Server-to-Server app. The calls to Google and
// Zoom below have never met the real services: test them when the keys are
// added.
//
// Environment variables (Vercel, Production only):
//   GOOGLE_CALENDAR_CLIENT_ID, GOOGLE_CALENDAR_CLIENT_SECRET   Google Cloud, an OAuth client (Web application)
//   ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET         Zoom Marketplace, a Server-to-Server OAuth app
//   SUPABASE_SERVICE_ROLE_KEY                                   already there for the other server functions
// and the Supabase URL and anon key the app already has.
import { createClient } from '@supabase/supabase-js';
import { maySend } from './_guestEmails.js';
import { asCallerClient, isMissingFunction, supabaseOf } from './_coachEmails.js';

export const config = { maxDuration: 30 };

const GOOGLE_KINDS = ['list', 'create', 'update', 'delete'];
const ZOOM_KINDS = ['create', 'update', 'delete'];
const BODY_MAX = 20000;
const DIDNT_WORK = 'That didn’t work. Try again in a moment.';
const reply = (res, status, body) => { res.status(status).setHeader('Cache-Control', 'no-store'); res.json(body); };

/** Which services have their keys in the environment. No key is ever returned, only whether it is there. */
export function keysSet(env) {
  return {
    google_calendar: Boolean(env.GOOGLE_CALENDAR_CLIENT_ID && env.GOOGLE_CALENDAR_CLIENT_SECRET && env.SUPABASE_SERVICE_ROLE_KEY),
    zoom: Boolean(env.ZOOM_ACCOUNT_ID && env.ZOOM_CLIENT_ID && env.ZOOM_CLIENT_SECRET),
  };
}

/** The request, tidied, or null when it is the wrong shape. */
export function askedFor(body) {
  const b = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  if (b.kind === 'status' && b.service == null) return { kind: 'status' };
  const idOk = (id) => typeof id === 'string' && /^[A-Za-z0-9_\-@.]{1,1024}$/.test(id);
  const small = (v) => v && typeof v === 'object' && !Array.isArray(v) && JSON.stringify(v).length <= BODY_MAX;
  if (b.service === 'google_calendar' && GOOGLE_KINDS.includes(b.kind)) {
    if (b.kind === 'list') return b.syncToken == null || (typeof b.syncToken === 'string' && b.syncToken.length <= 2000) ? { service: b.service, kind: b.kind, syncToken: b.syncToken ?? null } : null;
    if (b.kind !== 'create' && !idOk(b.id)) return null;
    if (b.kind !== 'delete' && !small(b.event)) return null;
    return { service: b.service, kind: b.kind, id: b.id ?? null, event: b.event ?? null, invite: b.invite !== false };
  }
  if (b.service === 'zoom' && ZOOM_KINDS.includes(b.kind)) {
    if (b.kind !== 'create' && !idOk(b.id)) return null;
    if (b.kind !== 'delete' && !small(b.meeting)) return null;
    return { service: b.service, kind: b.kind, id: b.id ?? null, meeting: b.meeting ?? null };
  }
  return null;
}

/**
 * A meeting as Zoom is given it: made in the call's own time zone (its
 * place name), the start written on that zone's own clock.
 */
export function zoomMeetingBody({ topic, startsAt, minutes, timeZone }) {
  const at = new Date(startsAt);
  if (Number.isNaN(at.getTime()) || typeof timeZone !== 'string' || !/^[A-Za-z_]+\/[A-Za-z0-9_+\-/]+$/.test(timeZone)) return null;
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(at).map((p) => [p.type, p.value]));
  return {
    topic: String(topic || 'Call').slice(0, 200), type: 2, timezone: timeZone,
    start_time: `${parts.year}-${parts.month}-${parts.day}T${String(Number(parts.hour) % 24).padStart(2, '0')}:${parts.minute}:${parts.second}`,
    duration: Math.min(1440, Math.max(15, Math.round(Number(minutes) || 60))),
    settings: { join_before_host: true, waiting_room: false },
  };
}

// ---------------------------------------------------------------- Zoom (a Server-to-Server OAuth app: no consent screen)
async function zoomToken(env) {
  const r = await fetch(`https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(env.ZOOM_ACCOUNT_ID)}`, {
    method: 'POST', headers: { Authorization: `Basic ${Buffer.from(`${env.ZOOM_CLIENT_ID}:${env.ZOOM_CLIENT_SECRET}`).toString('base64')}` },
  });
  const j = r.ok ? await r.json() : null;
  if (!j?.access_token) throw new Error('zoom');
  return j.access_token;
}

async function zoom({ env, res, asked }) {
  const token = await zoomToken(env);
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const id = asked.id ? encodeURIComponent(asked.id) : null;
  if (asked.kind === 'delete') {
    const r = await fetch(`https://api.zoom.us/v2/meetings/${id}`, { method: 'DELETE', headers });
    return r.ok || r.status === 404 ? reply(res, 200, { ok: true }) : reply(res, 502, { ok: false, reason: 'no_answer', message: DIDNT_WORK });
  }
  const body = zoomMeetingBody(asked.meeting);
  if (!body) return reply(res, 400, { ok: false, reason: 'shape', message: DIDNT_WORK });
  if (asked.kind === 'update') {
    const r = await fetch(`https://api.zoom.us/v2/meetings/${id}`, { method: 'PATCH', headers, body: JSON.stringify(body) });
    if (!r.ok) return reply(res, 502, { ok: false, reason: 'no_answer', message: DIDNT_WORK });
    const got = await fetch(`https://api.zoom.us/v2/meetings/${id}`, { headers });
    const m = got.ok ? await got.json() : null;
    return reply(res, 200, { ok: true, meeting: { id: asked.id, joinUrl: m?.join_url || null } });
  }
  const r = await fetch('https://api.zoom.us/v2/users/me/meetings', { method: 'POST', headers, body: JSON.stringify(body) });
  const m = r.ok ? await r.json() : null;
  if (!m?.id || !m?.join_url) return reply(res, 502, { ok: false, reason: 'no_answer', message: DIDNT_WORK });
  return reply(res, 200, { ok: true, meeting: { id: String(m.id), joinUrl: m.join_url } });
}

// ---------------------------------------------------------------- Google Calendar (the coach's own account)
async function googleToken(env, coachId) {
  const { url } = supabaseOf(env);
  // The coach's own token is the server's alone: read with the server's key, for this coach only.
  const server = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data } = await server.from('coach_connections').select('secret,status').eq('coach_id', coachId).eq('service', 'google_calendar').maybeSingle();
  if (!data?.secret || data.status !== 'on') return null;
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.GOOGLE_CALENDAR_CLIENT_ID, client_secret: env.GOOGLE_CALENDAR_CLIENT_SECRET, refresh_token: data.secret, grant_type: 'refresh_token' }),
  });
  const j = r.ok ? await r.json() : null;
  return j?.access_token || null;
}

async function google({ env, res, asked, coachId }) {
  const token = await googleToken(env, coachId);
  if (!token) return reply(res, 200, { ok: false, reason: 'not_connected' });
  const base = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const updates = `sendUpdates=${asked.invite === false ? 'none' : 'all'}`;
  if (asked.kind === 'list') {
    const events = [];
    let syncToken = asked.syncToken;
    let next = null;
    for (let page = 0; page < 20; page += 1) {
      const q = new URLSearchParams({ maxResults: '250', showDeleted: 'true' });
      if (next) q.set('pageToken', next); else if (syncToken) q.set('syncToken', syncToken);
      const r = await fetch(`${base}?${q}`, { headers });
      // A token Google no longer honours: start again with everything.
      if (r.status === 410 && syncToken) { syncToken = null; next = null; events.length = 0; continue; }
      if (!r.ok) return reply(res, 502, { ok: false, reason: 'no_answer', message: DIDNT_WORK });
      const j = await r.json();
      events.push(...(j.items || []));
      if (j.nextPageToken) { next = j.nextPageToken; continue; }
      return reply(res, 200, { ok: true, events, syncToken: j.nextSyncToken || null });
    }
    return reply(res, 502, { ok: false, reason: 'no_answer', message: DIDNT_WORK });
  }
  const id = asked.id ? encodeURIComponent(asked.id) : null;
  if (asked.kind === 'delete') {
    const r = await fetch(`${base}/${id}?${updates}`, { method: 'DELETE', headers });
    return r.ok || r.status === 404 || r.status === 410 ? reply(res, 200, { ok: true }) : reply(res, 502, { ok: false, reason: 'no_answer', message: DIDNT_WORK });
  }
  const r = asked.kind === 'create'
    ? await fetch(`${base}?${updates}`, { method: 'POST', headers, body: JSON.stringify(asked.event) })
    : await fetch(`${base}/${id}?${updates}`, { method: 'PATCH', headers, body: JSON.stringify(asked.event) });
  const event = r.ok ? await r.json() : null;
  if (!event?.id) return reply(res, 502, { ok: false, reason: 'no_answer', message: DIDNT_WORK });
  return reply(res, 200, { ok: true, event });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return reply(res, 405, { ok: false, message: DIDNT_WORK });
  const env = process.env;
  const asked = askedFor(req.body);
  if (!asked) return reply(res, 400, { ok: false, reason: 'shape', message: DIDNT_WORK });

  // The first line of defence: only the live site ever reaches Google or Zoom.
  if (!maySend(env)) return reply(res, 200, asked.kind === 'status' ? { ok: true, google_calendar: false, zoom: false, reason: 'preview' } : { ok: false, reason: 'preview' });

  const { url, anon } = supabaseOf(env);
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!url || !anon || !token) return reply(res, 401, { ok: false, message: 'Sign in again to carry on.' });
  const keys = keysSet(env);
  // With no key at all there is nothing to ask the database about.
  if (!keys.google_calendar && !keys.zoom) return reply(res, 200, asked.kind === 'status' ? { ok: true, google_calendar: false, zoom: false } : { ok: false, reason: 'not_connected' });

  // Asked as the caller: only an active coach gets an answer, and only about their own connections.
  const asCaller = asCallerClient(env, token);
  const { data: who, error: whoError } = await asCaller.auth.getUser(token);
  if (whoError || !who?.user?.id) return reply(res, 401, { ok: false, message: 'Sign in again to carry on.' });
  const [{ data: coachRows, error: coachError }, { data: mine, error: mineError }] = await Promise.all([
    asCaller.from('coaches').select('id,active').eq('user_id', who.user.id).limit(1),
    asCaller.rpc('coach_connections_mine'),
  ]);
  const coach = coachRows?.[0];
  if (coachError || !coach || coach.active === false) return reply(res, 404, { ok: false, message: 'That isn’t yours to use.' });
  if (mineError && !isMissingFunction(mineError)) return reply(res, 502, { ok: false, reason: 'no_answer', message: DIDNT_WORK });
  const connected = (service) => (Array.isArray(mine) ? mine : []).some((c) => c.service === service && c.status === 'on');
  const status = { google_calendar: keys.google_calendar && connected('google_calendar'), zoom: keys.zoom, google_ready: keys.google_calendar };
  if (asked.kind === 'status') return reply(res, 200, { ok: true, ...status });
  if (!status[asked.service]) return reply(res, 200, { ok: false, reason: 'not_connected' });

  try {
    return asked.service === 'zoom' ? await zoom({ env, res, asked }) : await google({ env, res, asked, coachId: coach.id });
  } catch {
    // Generic, and nothing is logged: no token, title or address.
    return reply(res, 502, { ok: false, reason: 'no_answer', message: DIDNT_WORK });
  }
}
