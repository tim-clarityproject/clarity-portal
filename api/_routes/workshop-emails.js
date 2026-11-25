// Clarity Coach: a workshop's two reminders, sent when they are due
// (Phase 6a run 2). Asked every 15 minutes by the database's own scheduler
// (migration 058: pg_cron's job clarity-reminders, through pg_net, with the
// secret and the live address from Supabase Vault; never a Vercel cron),
// never by a page:
//   GET /api/workshop-emails   Authorization: Bearer <CRON_SECRET>
//
// Only the live site sends (maySend), and only when called with the
// scheduler's own secret (058's job sends CRON_SECRET, kept in Vault as
// clarity_cron_secret, as the Authorization header; without one set,
// nothing runs). It then asks the database, with
// the server's key, which reminders are due and haven't gone (migration
// 050's workshop_emails_due: the day-before reminder from 07:00 the day
// before in the workshop's own time zone, when its switch is on; the 1-hour
// reminder from 75 to 45 minutes before, when its switch is on), one row a
// registered person.
//
// Each workshop's reminder is claimed FIRST (workshop_send_claim, which
// records the send and answers false when it had already gone), so two runs
// never both send it; only then is anyone emailed. The emails are run 1's
// templates from the one shared email template. Times in them are in the
// workshop's own place, with its city or country name (src/lib/time); the
// 1-hour reminder never gives a clock time.
//
// Answers (nothing is logged, and no address or name is sent back):
//   200 { sent: 3, people: 41 }             three reminders went, to 41 people in all
//   200 { sent: 0, reason: 'preview' }      this deployment never sends
//   200 { sent: 0, reason }                 'setup' (no email provider or server key yet),
//                                           'not_ready' (migration 050 isn't there yet)
//   401 not the scheduler                   502 the database didn't answer
//
// Environment variables (Vercel): CRON_SECRET, SUPABASE_SERVICE_ROLE_KEY,
// RESEND_API_KEY, COACH_EMAIL_FROM (or GUEST_EMAIL_FROM, or
// ALIGNMENT_EMAIL_FROM), and the Supabase URL the app already has.
import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'node:crypto';
import { maySend } from '../_guestEmails.js';
import { UUID, canSend, emailFrom, isMissingFunction, onePerAddress, sendEach, supabaseOf } from '../_coachEmails.js';
import { workshopInOneHourEmail, workshopTomorrowEmail } from '../../src/lib/email/emails.js';
import { isZone } from '../../src/lib/time/index.js';

export const config = { maxDuration: 60 };

const PEOPLE_MAX = 2000;
const KINDS = ['day_before', 'hour_before'];
const HOME_ZONE = 'Europe/London'; // as workshop_emails_due reads a workshop with no zone

const reply = (res, status, body) => { res.status(status).setHeader('Cache-Control', 'no-store'); res.json(body); };

/** Whether the caller is the scheduler (058's pg_cron job): its secret, compared without leaking where it differs. */
export function isScheduler(header, secret) {
  // A secret pasted into Vercel with a new line or a space at an end is the same secret (058 refuses one with spaces
  // in Vault, so the scheduler never sends them); without this every run was answered 401 without a word.
  const kept = typeof secret === 'string' ? secret.trim() : '';
  if (kept.length < 16 || typeof header !== 'string') return false;
  const given = Buffer.from(header);
  const wanted = Buffer.from(`Bearer ${kept}`);
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}

/**
 * The due rows, one a person, as one send each: a workshop's reminder of
 * one kind, with the people it goes to (one address each, nobody twice).
 */
export function dueSends(rows) {
  const sends = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || !UUID.test(String(row.workshop_id || '')) || !KINDS.includes(row.kind)) continue;
    const key = `${row.workshop_id}|${row.kind}`;
    if (!sends.has(key)) sends.set(key, { workshopId: row.workshop_id, kind: row.kind, title: row.title || '', startsAt: row.starts_at, zone: isZone(row.time_zone) ? row.time_zone : HOME_ZONE, place: row.place || null, people: [] });
    sends.get(key).people.push({ email: row.attendee_email });
  }
  return [...sends.values()].map((s) => ({ ...s, people: onePerAddress(s.people, PEOPLE_MAX) })).filter((s) => s.people.length > 0);
}

/** The email one send carries: the same for everyone registered. */
export function reminderEmail(send, now = new Date()) {
  return emailFrom(send.kind === 'hour_before'
    ? workshopInOneHourEmail({ title: send.title, place: send.place })
    : workshopTomorrowEmail({ title: send.title, at: send.startsAt, zone: send.zone, place: send.place, now }));
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return reply(res, 405, { sent: 0 });
  const env = process.env;
  // Only the live site ever sends; a preview never asks the database anything.
  // The scheduler's secret first, on every deployment (follow-up 5); then only the live site sends.
  if (!isScheduler(req.headers.authorization, env.CRON_SECRET)) return reply(res, 401, { sent: 0 });
  if (!maySend(env)) return reply(res, 200, { sent: 0, reason: 'preview' });
  const { url } = supabaseOf(env);
  if (!url || !env.SUPABASE_SERVICE_ROLE_KEY || !canSend(env)) return reply(res, 200, { sent: 0, reason: 'setup' });

  const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const now = new Date();
  const { data: due, error } = await admin.rpc('workshop_emails_due', { p_now: now.toISOString() });
  if (error) return isMissingFunction(error) ? reply(res, 200, { sent: 0, reason: 'not_ready' }) : reply(res, 502, { sent: 0 });

  let sent = 0;
  let people = 0;
  for (const send of dueSends(due)) {
    // Claimed first: false when another run has it, so nobody is emailed twice.
    const { data: mine, error: claimError } = await admin.rpc('workshop_send_claim', { p_workshop: send.workshopId, p_kind: send.kind, p_people: send.people.length });
    if (claimError || mine !== true) continue;
    const email = reminderEmail(send, now);
    const went = await sendEach(env, send.people, () => email);
    if (went) { sent += 1; people += went; }
  }
  return reply(res, 200, { sent, people });
}
