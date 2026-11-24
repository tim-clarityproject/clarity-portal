// The confirmation a guest gets after booking a call on a booking page, or
// moving it (Phase 6a run 3; migration 051).
//   POST /api/booking-email  { guestKey, kind: 'booked' | 'moved' }
//        → { sent: boolean, reason? }
//
// The browser sends only the guest's own key. Everything in the email (who
// it goes to, the call, its time and zone, the coach's first name) is read
// here from the database with the server's key: nothing a visitor types is
// ever trusted as an address. As api/coach-send.js and api/guest-copy.js:
//   - it sends only from the live site (maySend): a preview or a developer's
//     machine answers { sent: false, reason: 'preview' } and asks nothing;
//   - the send is CLAIMED in the database before it goes (051's
//     cal_reminder_claim, once for each time booked: the moment the booking
//     was made, or the moment it was last moved), so nobody is emailed twice;
//   - the call's name, the coach's first name and the Zoom link come from
//     the guest's own checked function (booking_mine), nothing wider;
//   - its one link is built from the allow-list of the portal's own
//     addresses, never from the request's host.
// Before 051 has run it answers { sent: false, reason: 'not_ready' }.
//
// Environment variables (Vercel, Production): SUPABASE_SERVICE_ROLE_KEY,
// RESEND_API_KEY and COACH_EMAIL_FROM (or GUEST_EMAIL_FROM), as the other
// coach emails.
import { createClient } from '@supabase/supabase-js';
import { maySend, oneAddress } from './_guestEmails.js';
import { canSend, emailFrom, isMissingFunction, isMissingTable, sendWithResend, supabaseOf, UUID } from './_coachEmails.js';
import { portalOrigin } from './_portalOrigin.js';
import { bookingConfirmedEmail } from '../src/lib/email/emails.js';
import { isZone } from '../src/lib/time/index.js';

export const config = { maxDuration: 15 };

const KINDS = ['booked', 'moved'];
const reply = (res, status, body) => { res.status(status).setHeader('Cache-Control', 'no-store'); res.json(body); };

/** The request, tidied, or null when it is the wrong shape. */
export function readRequest(body) {
  const b = body && typeof body === 'object' ? body : {};
  if (!UUID.test(String(b.guestKey || '')) || !KINDS.includes(b.kind)) return null;
  return { guestKey: String(b.guestKey).toLowerCase(), kind: b.kind };
}

/** The moment a send is claimed for: when the booking was made, or when it was last moved. Null when there is nothing to send. */
export function claimMoment(booking, kind) {
  if (!booking || booking.status !== 'booked') return null;
  const at = kind === 'moved' ? booking.moved_at : booking.created_at;
  return at && !Number.isNaN(new Date(at).getTime()) ? new Date(at).toISOString() : null;
}

/** The call's length in whole minutes, or null when its end isn't known. */
export function minutesOf(startsAt, endsAt) {
  const m = Math.round((new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60000);
  return Number.isInteger(m) && m > 0 && m <= 24 * 60 ? m : null;
}

/** The email for a booking, from the database's own rows. */
export function emailFor({ booking, callName, coach, zoomLink, origin, kind, now = new Date() }) {
  return emailFrom(bookingConfirmedEmail({
    name: booking.name, callName, coach, at: booking.starts_at, zone: isZone(booking.time_zone) ? booking.time_zone : 'Europe/London', placeKind: booking.place_kind || 'zoom',
    minutes: minutesOf(booking.starts_at, booking.ends_at),
    zoomLink: /^https:\/\/[^\s<>"]+$/.test(String(zoomLink || '')) ? zoomLink : null, mineLink: `${origin}/book/mine/${booking.guest_key}`, moved: kind === 'moved', now,
  }));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return reply(res, 405, { sent: false });
  const env = process.env;
  // Only the live site ever sends; a preview never asks the database anything.
  if (!maySend(env)) return reply(res, 200, { sent: false, reason: 'preview' });
  const asked = readRequest(req.body);
  if (!asked) return reply(res, 400, { sent: false });
  const { url } = supabaseOf(env);
  if (!url || !env.SUPABASE_SERVICE_ROLE_KEY || !canSend(env)) return reply(res, 200, { sent: false, reason: 'setup' });

  const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const found = await admin.from('coach_bookings')
    .select('id, item_id, name, email, time_zone, starts_at, ends_at, status, source, guest_key, created_at, moved_at')
    .eq('guest_key', asked.guestKey).in('source', ['page', 'link']).maybeSingle();
  if (found.error) return isMissingTable(found.error) ? reply(res, 200, { sent: false, reason: 'not_ready' }) : reply(res, 502, { sent: false });
  const booking = found.data;
  const moment = claimMoment(booking, asked.kind);
  const to = oneAddress(booking?.email);
  if (!moment || !to || !booking.item_id || new Date(booking.starts_at) <= new Date()) return reply(res, 200, { sent: false, reason: 'nothing' });

  // Claimed first: false when this time's confirmation has already gone.
  const claim = await admin.rpc('cal_reminder_claim', { p_item: booking.item_id, p_kind: 'custom', p_occurrence: moment, p_people: 1 });
  if (claim.error) return isMissingFunction(claim.error) ? reply(res, 200, { sent: false, reason: 'not_ready' }) : reply(res, 502, { sent: false });
  if (claim.data !== true) return reply(res, 200, { sent: false, reason: 'already' });

  // The call's own words come from the guest's own function (051's booking_mine), asked as anyone holding the key would:
  // the server's key reads the booking and its item, never the call types or the links.
  const { anon } = supabaseOf(env);
  const open = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const mine = await open.rpc('booking_mine', { p_guest_key: asked.guestKey });
  if (mine.error || !mine.data) return reply(res, 200, { sent: false, reason: 'nothing' });
  try {
    await sendWithResend(env, {
      to,
      ...emailFor({
        booking: { ...booking, place_kind: mine.data.place_kind || 'zoom' }, callName: mine.data.call_name || 'Call', coach: mine.data.coach_first_name || null,
        zoomLink: mine.data.meeting_link || null, origin: portalOrigin(req.headers, env), kind: asked.kind,
      }),
    });
  } catch {
    return reply(res, 200, { sent: false, reason: 'send' });
  }
  return reply(res, 200, { sent: true });
}
