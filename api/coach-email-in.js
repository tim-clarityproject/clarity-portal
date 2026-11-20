// Clarity Coach: emails logged by themselves (Phase 6a run 4). Two callers:
//
// 1. THE INBOUND-EMAIL SERVICE, when an email arrives at one of the owner's
//    two addresses (the copy-in address, or the address that turns a
//    forwarded email into a to-do):
//      POST /api/coach-email-in   <the service's webhook, as JSON>
//      with the shared secret, as  Authorization: Bearer <secret>
//                              or  Authorization: Basic <base64 of "clarity:<secret>">
//                              or  X-Webhook-Secret: <secret>
//      → 200 { ok: true, status: 'logged' | 'todo' | 'unknown' | 'unreadable' }
//    The email is read (src/lib/coach/connect/copyInEmail.js's readInbound:
//    which address it was copied to, who it is from and to, its subject and
//    its words) and handed to the database with the server's key
//    (email_in(key, email), migration 052). THE DATABASE decides everything
//    else: whose coach the key is, whose timeline the email goes on, who
//    waits on Leads, and that the same email is never kept twice.
//
// 2. THE OWNER'S OWN PORTAL, asking whether the addresses are set up:
//      POST /api/coach-email-in   { kind: 'status' }      (the owner's own sign-in)
//      → { ok: true, copy_in: boolean, gmail: false, domain: string | null }
//    and, for the optional Gmail connection:
//      POST /api/coach-email-in   { service: 'gmail', kind: 'list', cursor? }
//      → { ok: false, reason: 'not_connected' }
//    GMAIL'S SERVER SIDE IS NOT BUILT: reading Gmail needs one of Google's
//    restricted scopes (Google reviews the app first), a consent step like
//    the calendar's, and coach_connections to take the service 'gmail'.
//    The browser's adapter and its stand-in are ready for it.
//
// How it is kept safe:
//   - Only the live site ever runs it (maySend): a preview or a developer's
//     machine answers { ok: false, reason: 'preview' } and asks the database
//     nothing, so a test can never log an email or make a to-do.
//   - The webhook's secret is compared without leaking where it differs,
//     and must be at least 16 characters. With no secret set, nothing runs.
//   - Nothing is ever sent, and nothing is logged: no address, name, subject
//     or key is written to the server's log or sent back.
//   - An email is at most 256 KB of JSON; its words are cut to 100,000
//     characters. Attachments are not kept.
//
// THIS HAS NEVER MET A REAL INBOUND-EMAIL SERVICE: no key exists yet. Walk
// it once when the keys are added.
//
// Environment variables (Vercel, Production only):
//   COACH_EMAIL_IN_SECRET     the shared secret the inbound-email service sends (16 characters or more)
//   COACH_EMAIL_IN_DOMAIN     the inbound domain the two addresses live at (for example in.<the business's domain>)
//   SUPABASE_SERVICE_ROLE_KEY already there for the other server functions
// and the Supabase URL and anon key the app already has. Outside Vercel: the
// inbound domain's MX records point at the inbound-email service, and its
// webhook points at <the portal's address>/api/coach-email-in.
import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'node:crypto';
import { maySend } from './_guestEmails.js';
import { asCallerClient, isMissingFunction, supabaseOf } from './_coachEmails.js';
import { directionOf, readInbound } from '../src/lib/coach/connect/copyInEmail.js';

export const config = { maxDuration: 15 };

const PAYLOAD_MAX = 256 * 1024;
const DOMAIN = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;
const reply = (res, status, body) => { res.status(status).setHeader('Cache-Control', 'no-store'); res.json(body); };

/** The inbound domain from the environment, lower-cased, or '' when it isn't a domain. */
export const inboundDomain = (env) => { const d = String(env.COACH_EMAIL_IN_DOMAIN || '').trim().toLowerCase().replace(/^@/, ''); return DOMAIN.test(d) ? d : ''; };

/** Whether the copy-in address can work at all: the secret, the domain and the server's key are all set. No key is ever returned. */
export function keysSet(env) {
  return { copy_in: Boolean(String(env.COACH_EMAIL_IN_SECRET || '').length >= 16 && inboundDomain(env) && env.SUPABASE_SERVICE_ROLE_KEY), gmail: false };
}

const same = (given, wanted) => { const a = Buffer.from(String(given)); const b = Buffer.from(String(wanted)); return a.length === b.length && timingSafeEqual(a, b); };

/**
 * Whether a request carries the webhook's secret, in any of the three ways
 * an inbound-email service can send one. Compared without leaking where
 * it differs.
 */
export function hasSecret(headers, secret) {
  if (typeof secret !== 'string' || secret.length < 16) return false;
  const h = headers || {};
  const auth = String(h.authorization || h.Authorization || '');
  if (same(auth, `Bearer ${secret}`)) return true;
  if (/^Basic\s+/i.test(auth)) {
    let decoded = '';
    try { decoded = Buffer.from(auth.replace(/^Basic\s+/i, ''), 'base64').toString('utf8'); } catch { decoded = ''; }
    const at = decoded.indexOf(':');
    if (at >= 0 && same(decoded.slice(at + 1), secret)) return true;
  }
  const own = h['x-webhook-secret'] ?? h['X-Webhook-Secret'];
  return typeof own === 'string' && same(own, secret);
}

/** What the owner's portal asked for, or null when the body is something else (the webhook). */
export function askedFor(body) {
  const b = body && typeof body === 'object' && !Array.isArray(body) ? body : null;
  if (!b) return null;
  if (b.kind === 'status' && b.service == null && Object.keys(b).length === 1) return { kind: 'status' };
  if (b.service === 'gmail' && b.kind === 'list' && (b.cursor == null || (typeof b.cursor === 'string' && b.cursor.length <= 2000))) return { service: 'gmail', kind: 'list', cursor: b.cursor ?? null };
  return null;
}

/** The owner's own address for a key, read with the server's key. Nothing found (or 052 not there yet) reads as none, and the email then counts as sent. */
async function ownAddresses(admin, key) {
  try {
    const { data: address } = await admin.from('coach_email_addresses').select('coach_id').eq('key', key).maybeSingle();
    if (!address?.coach_id) return [];
    const { data: coach } = await admin.from('coaches').select('email').eq('id', address.coach_id).maybeSingle();
    return coach?.email ? [String(coach.email).toLowerCase()] : [];
  } catch {
    return [];
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return reply(res, 405, { ok: false });
  const env = process.env;
  const asked = askedFor(req.body);
  const keys = keysSet(env);

  // The first line of defence: only the live site ever logs an email.
  if (!maySend(env)) return reply(res, 200, asked?.kind === 'status' ? { ok: true, copy_in: false, gmail: false, domain: null, reason: 'preview' } : { ok: false, reason: 'preview' });

  // ---- the owner's own portal
  if (asked && !hasSecret(req.headers, env.COACH_EMAIL_IN_SECRET)) {
    const { url, anon } = supabaseOf(env);
    const token = String(req.headers?.authorization || '').replace(/^Bearer\s+/i, '');
    if (!url || !anon || !token) return reply(res, 401, { ok: false, message: 'Sign in again to carry on.' });
    // Asked as the caller: only the owner hears where the addresses live.
    const asCaller = asCallerClient(env, token);
    const { data: who, error: whoError } = await asCaller.auth.getUser(token);
    if (whoError || !who?.user?.id) return reply(res, 401, { ok: false, message: 'Sign in again to carry on.' });
    const { data: coachRows, error: coachError } = await asCaller.from('coaches').select('id,active,role').eq('user_id', who.user.id).limit(1);
    const coach = coachRows?.[0];
    if (coachError || !coach || coach.active === false || coach.role !== 'owner') return reply(res, 404, { ok: false, message: 'That isn’t yours to use.' });
    if (asked.kind === 'status') return reply(res, 200, { ok: true, copy_in: keys.copy_in, gmail: false, domain: keys.copy_in ? inboundDomain(env) : null });
    return reply(res, 200, { ok: false, reason: 'not_connected' });
  }

  // ---- the inbound-email service
  if (!keys.copy_in) return reply(res, 200, { ok: false, reason: 'setup' });
  if (!hasSecret(req.headers, env.COACH_EMAIL_IN_SECRET)) return reply(res, 401, { ok: false });
  let size = 0;
  try { size = JSON.stringify(req.body ?? null).length; } catch { size = PAYLOAD_MAX + 1; }
  if (size > PAYLOAD_MAX) return reply(res, 200, { ok: true, status: 'unreadable' });
  const read = readInbound(req.body, { domain: inboundDomain(env) });
  // Answered 200 so the service doesn't send the same email again and again: there is nothing to try again.
  if (read.problem) return reply(res, 200, { ok: true, status: read.problem === 'no_address' ? 'unknown' : 'unreadable' });

  const { url } = supabaseOf(env);
  if (!url) return reply(res, 200, { ok: false, reason: 'setup' });
  const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  // Which way it went: from the owner's own address it was sent ('out'); from anyone else it came in (a reply-all that kept the address copied in).
  const direction = directionOf(read.email, await ownAddresses(admin, read.key));
  const { data, error } = await admin.rpc('email_in', { p_key: read.key, p_email: { ...read.email, direction } });
  if (error) return isMissingFunction(error) ? reply(res, 200, { ok: false, reason: 'not_ready' }) : reply(res, 502, { ok: false });
  const status = ['logged', 'todo', 'unknown', 'unreadable'].includes(data?.status) ? data.status : 'unknown';
  return reply(res, 200, { ok: true, status });
}
