// Clarity Coach: a call's two reminders to the client, sent when they are
// due (Phase 6a run 3, step 6; migration 051). Asked every 15 minutes by
// the database's own scheduler (migration 058: pg_cron's job
// clarity-reminders, through pg_net, with the secret and the live address
// from Supabase Vault; never a Vercel cron), never by a page:
//   GET /api/coach-reminders   Authorization: Bearer <CRON_SECRET>
//
// Only the live site sends (maySend), and only when called with the
// scheduler's own secret. It then asks the database, with the server's key,
// which calls are coming up in the next 36 hours for which a reminder may
// still go (051's cal_reminders_coming: only calls with someone to email,
// only the kinds the coach has switched on in Settings, Booking, never
// while the coach is away, never one already sent), and decides the moment
// here with the calendar's own rule (calendar.js's remindersToSend):
//   - the day before, from 18:00 to 21:00 in the READER's own time;
//   - 1 hour before (60 to 30 minutes before), which never gives a clock time.
//
// Each reminder is claimed FIRST (cal_reminder_claim: one insert against a
// unique key, "on conflict do nothing", which answers false when it had
// already gone), so two runs that overlap never both send it;
// only then is anyone emailed. A client gets the session reminder; someone
// who booked on a booking page gets the booked-call reminder with their own
// link to move or cancel. Both are the one shared email template. Times are
// in the reader's own zone with its city's name.
//
// Answers (nothing is logged, and no address or name is sent back):
//   200 { sent: 2 }                         two reminders went
//   200 { sent: 0, reason: 'preview' }      this deployment never sends
//   200 { sent: 0, reason }                 'setup' (no email provider or server key yet),
//                                           'not_ready' (migration 051 isn't there yet)
//   401 not the scheduler                   502 the database didn't answer
//
// Environment variables (Vercel, Production): CRON_SECRET,
// SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, COACH_EMAIL_FROM (or
// GUEST_EMAIL_FROM), and the Supabase URL and anon key the app already has.
import { createClient } from '@supabase/supabase-js';
import { maySend, oneAddress } from './_guestEmails.js';
import { UUID, canSend, emailFrom, isMissingFunction, sendWithResend, supabaseOf } from './_coachEmails.js';
import { portalOrigin } from './_portalOrigin.js';
import { isScheduler } from './workshop-emails.js';
import { callInOneHourEmail, callTomorrowEmail, sessionInOneHourEmail, sessionTomorrowEmail } from '../src/lib/email/emails.js';
import { remindersToSend } from '../src/lib/coach/calendar.js';

export const config = { maxDuration: 60 };

const SENDS_MAX = 200; // one run never sends more: the rest go on the next
const reply = (res, status, body) => { res.status(status).setHeader('Cache-Control', 'no-store'); res.json(body); };
const linkOr = (v) => (/^https:\/\/[^\s<>"]+$/.test(String(v || '')) ? v : null);

/**
 * The reminders to send this moment: the due rows (calendar.js's rule), one
 * a call, a kind and an address, each with one clean address.
 */
export function dueReminders(rows, now) {
  const seen = new Set();
  const out = [];
  for (const row of remindersToSend(rows, now)) {
    const to = oneAddress(row.person_email);
    const at = new Date(row.occurrence_at).toISOString();
    const key = `${row.item_id}|${row.kind}|${at}`;
    if (!to || !UUID.test(String(row.item_id)) || seen.has(key)) continue;
    seen.add(key);
    out.push({ ...row, to, occurrence_at: at });
    if (out.length >= SENDS_MAX) break;
  }
  return out;
}

/**
 * The email one reminder carries.
 * @param {object} r a due row   @param {{ origin: string, hasAccount?: boolean, callName?: string|null, now?: Date }} with
 */
export function reminderEmail(r, { origin, hasAccount = false, callName = null, now = new Date() }) {
  const coach = r.coach_first_name || 'your coach';
  const zoomLink = (r.place_kind || 'zoom') === 'zoom' ? linkOr(r.meeting_link) : null;
  if (r.guest_key) {
    const mineLink = UUID.test(String(r.guest_key)) ? `${origin}/book/mine/${r.guest_key}` : null;
    return emailFrom(r.kind === 'hour_before'
      ? callInOneHourEmail({ callName, coach: r.coach_first_name || null, zoomLink, mineLink })
      : callTomorrowEmail({ name: r.person_name || '', callName, coach: r.coach_first_name || null, at: r.occurrence_at, zone: r.readerZone, placeKind: r.place_kind || 'zoom', zoomLink, mineLink, now }));
  }
  return emailFrom(r.kind === 'hour_before'
    ? sessionInOneHourEmail({ coach, zoomLink, preferencesLink: null })
    // "Start my prep" opens the client's own Coaching page, so it is only offered to someone with an account.
    : sessionTomorrowEmail({ coach, at: r.occurrence_at, zone: r.readerZone, frequentTraveller: r.frequent_traveller === true, prepLink: hasAccount ? `${origin}/coaching` : null, zoomLink, preferencesLink: null, now }));
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return reply(res, 405, { sent: 0 });
  const env = process.env;
  // Only the live site ever sends; a preview never asks the database anything.
  if (!maySend(env)) return reply(res, 200, { sent: 0, reason: 'preview' });
  if (!isScheduler(req.headers.authorization, env.CRON_SECRET)) return reply(res, 401, { sent: 0 });
  const { url, anon } = supabaseOf(env);
  if (!url || !env.SUPABASE_SERVICE_ROLE_KEY || !canSend(env)) return reply(res, 200, { sent: 0, reason: 'setup' });

  const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const now = new Date();
  const { data: coming, error } = await admin.rpc('cal_reminders_coming', { p_now: now.toISOString() });
  if (error) return isMissingFunction(error) ? reply(res, 200, { sent: 0, reason: 'not_ready' }) : reply(res, 502, { sent: 0 });
  const due = dueReminders(coming, now);
  if (!due.length) return reply(res, 200, { sent: 0 });

  // Who has an account (so "Start my prep" has somewhere to open): read with the server's key, for these calls only.
  const withAccount = new Set();
  const clientItems = [...new Set(due.filter((r) => !r.guest_key).map((r) => r.item_id))];
  if (clientItems.length) {
    const { data: items } = await admin.from('coach_cal_items').select('id, profile_id').in('id', clientItems);
    const profiles = [...new Set((items || []).map((i) => i.profile_id).filter(Boolean))];
    const { data: people } = profiles.length ? await admin.from('client_profiles').select('id, user_id').in('id', profiles) : { data: [] };
    const signedUp = new Set((people || []).filter((p) => p.user_id).map((p) => p.id));
    for (const i of items || []) if (signedUp.has(i.profile_id)) withAccount.add(i.id);
  }
  const open = anon ? createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
  const origin = portalOrigin(req.headers, env);

  let sent = 0;
  for (const r of due) {
    // Claimed first: false when another run has it, so nobody is emailed twice.
    const { data: mine, error: claimError } = await admin.rpc('cal_reminder_claim', { p_item: r.item_id, p_kind: r.kind, p_occurrence: r.occurrence_at, p_people: 1 });
    if (claimError || mine !== true) continue;
    // A booked call's own name comes from the guest's own function (051's booking_mine), nothing wider.
    let callName = null;
    if (r.guest_key && open) {
      const { data: booked } = await open.rpc('booking_mine', { p_guest_key: r.guest_key });
      callName = booked?.call_name || null;
    }
    try {
      await sendWithResend(env, { to: r.to, ...reminderEmail(r, { origin, hasAccount: withAccount.has(r.item_id), callName, now }) });
      sent += 1;
    } catch { /* the others still go */ }
  }
  return reply(res, 200, { sent });
}
