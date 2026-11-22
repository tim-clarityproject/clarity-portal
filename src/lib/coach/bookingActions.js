import { supabase } from '../supabase';
import { forgetSharedReads } from '../readShare';
import { isBookingKey } from './calendar';

// Booking's questions to the database (Phase 6a run 3; migration 051). The
// pages outside the portal (a booking page, a single-use link, a guest's own
// booking, a poll) and a client's own sessions reach only 051's checked
// functions, never a table: free times are worked out in the database, so
// nobody outside ever sees the calendar. Each answers { there, data }:
// `there: false` means 051 hasn't run yet, and the page says one calm line.
// A client's questions remember "not yet" for an hour, so a database without
// 051 is asked once, not on every visit.

const HOUR_MS = 60 * 60 * 1000;
const NOT_YET_KEY = 'clarity-booking-not-yet'; // a time only, never anything personal
const isKey = isBookingKey;
const notThere = (error) => ['PGRST202', 'PGRST205', '42883', '42P01'].includes(error?.code);

async function ask(name, args) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) {
    if (notThere(error)) return { there: false, data: null };
    throw error;
  }
  return { there: true, data };
}
const iso = (t) => new Date(t).toISOString();
const starts = (answer) => ({ ...answer, data: (answer.data || []).map((r) => new Date(r.starts_at)).filter((d) => !Number.isNaN(d.getTime())) });

// ---------------------------------------------------------------- a booking page or a single-use link (signed out)
export const loadBookingPage = (key) => (isKey(key) ? ask('booking_page', { p_key: key }) : Promise.resolve({ there: true, data: null }));
export const loadFreeTimes = async (key, from, to) => starts(await ask('booking_free_times', { p_key: key, p_from: iso(from), p_to: iso(to) }));
export const makeBooking = (key, { start, name, email, zone, answers = {}, earlyAndLate = false }) => ask('booking_make', {
  p_key: key, p_start: iso(start), p_name: name, p_email: email, p_zone: zone, p_answers: answers, p_early_late: earlyAndLate,
});

// ---------------------------------------------------------------- a guest's own booking
export const loadMyBooking = (guestKey) => (isKey(guestKey) ? ask('booking_mine', { p_guest_key: guestKey }) : Promise.resolve({ there: true, data: null }));
export const loadMoveTimes = async (guestKey, from, to) => starts(await ask('booking_move_times', { p_guest_key: guestKey, p_from: iso(from), p_to: iso(to) }));
export const moveBooking = (guestKey, start, earlyAndLate = false) => ask('booking_move', { p_guest_key: guestKey, p_start: iso(start), p_early_late: earlyAndLate });
export const cancelBooking = (guestKey) => ask('booking_cancel', { p_guest_key: guestKey });

// ---------------------------------------------------------------- a poll, for one person asked
export const loadPollPage = (voteKey) => (isKey(voteKey) ? ask('poll_page', { p_key: voteKey }) : Promise.resolve({ there: true, data: null }));
export const sendPollVotes = (voteKey, votes) => ask('poll_vote', { p_key: voteKey, p_votes: votes });

// ---------------------------------------------------------------- a signed-in client's own sessions
const notYet = () => { try { const at = Number(window.localStorage.getItem(NOT_YET_KEY)); return Number.isFinite(at) && at > 0 && Date.now() - at < HOUR_MS && Date.now() >= at; } catch { return false; } };
const note = (there) => { try { if (there) window.localStorage.removeItem(NOT_YET_KEY); else window.localStorage.setItem(NOT_YET_KEY, String(Date.now())); } catch { /* asked again next time */ } };

/** The client's sessions still to come: { there, data: [] }. */
export async function loadMySessions() {
  if (notYet()) return { there: false, data: [] };
  const answer = await ask('my_sessions_coming', {});
  note(answer.there);
  return { there: answer.there, data: answer.data || [] };
}
export const loadMyTimes = async (from, to, minutes = null) => starts(await ask('my_booking_times', { p_from: iso(from), p_to: iso(to), p_minutes: minutes }));
export const bookMySession = (start, minutes = null) => ask('my_session_book', { p_start: iso(start), p_minutes: minutes });
export const moveMySession = (sessionId, start, lateOk = false) => ask('my_session_move', { p_session: sessionId, p_start: iso(start), p_late_ok: lateOk });
export const cancelMySession = (sessionId, lateOk = false) => ask('my_session_cancel', { p_session: sessionId, p_late_ok: lateOk });

// ---------------------------------------------------------------- the confirmation email (a template; nothing sends from a preview)
/**
 * Asks the server to email a guest their confirmation. The browser sends
 * only the guest's own key: the server reads the booking from the database,
 * claims the send first, and sends only from the live site. Never throws.
 */
export async function askBookingEmail(guestKey, kind = 'booked') {
  try {
    const res = await fetch('/api/booking-email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ guestKey, kind }) });
    // The server wrote to the database: reads shared a moment ago (readShare.js) are forgotten, so the next load sees it.
    forgetSharedReads();
    const answer = await res.json().catch(() => null);
    return { sent: answer?.sent === true };
  } catch {
    return { sent: false };
  }
}
