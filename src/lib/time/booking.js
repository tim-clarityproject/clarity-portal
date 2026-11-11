// Booking helpers, for Phase 6a to use (decisions part 5, 10 Nov, 11:40
// and 18:26; time-zone-safeguards.md rules 4, 9 and 13). No screens here.
//
//   - a call starts only on a quarter hour (:00, :15, :30, :45) in the
//     CLIENT's time, so half-hour and 45-minute zones (India, Newfoundland,
//     Nepal) still get tidy starts;
//   - there are always at least 15 clear minutes between any two calls;
//   - only calls that start at 07:00 or later and END by 20:00 in the
//     BOOKER's own time (the client's, when the client books) are offered,
//     unless they choose "Show early and late times" (Claude's reading of
//     Tim's "07:00 to 20:00", 11 Nov, 08:25): a 60-minute call's last start
//     is 19:00, a 30-minute call's 19:30.
import { addDays, instantAt, toDate, wallClock } from './instants.js';

export const GAP_MINUTES = 15;
export const QUARTER_MINUTES = 15;
export const SOCIABLE_FROM = '07:00';
export const SOCIABLE_TO = '20:00';
export const EARLY_AND_LATE_LABEL = 'Show early and late times';

const MIN = 60000;
const ms = (t) => toDate(t).getTime();
// A call's length: a real number of minutes above zero, or nothing can be checked against it.
const length = (minutes) => {
  if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes <= 0) throw new Error('A call has a length in minutes, above zero.');
  return minutes;
};
const minutesOf = (time) => { const [h, m] = String(time).split(':').map(Number); return h * 60 + m; };

/** Whether an instant is on a quarter hour in the client's own time. */
export function onQuarterHour(instant, clientZone) {
  const w = wallClock(instant, clientZone);
  return w.minute % QUARTER_MINUTES === 0 && w.second === 0 && ms(instant) % 1000 === 0;
}

/** The first quarter hour, in the client's time, at or after an instant. */
export function nextQuarterHour(instant, clientZone) {
  let t = Math.ceil(ms(instant) / MIN) * MIN;
  for (let i = 0; i < 60 && !onQuarterHour(t, clientZone); i += 1) t += MIN;
  return new Date(t);
}

/**
 * Whether a call from `start` for `minutes` leaves 15 clear minutes before
 * and after every other booking ({ start, end } instants, any coach's
 * calendar entry that blocks time).
 */
export function clearOfOthers(start, minutes, bookings = [], gap = GAP_MINUTES) {
  const s = ms(start);
  const e = s + length(minutes) * MIN;
  return bookings.every((b) => {
    // A booking that can't be read is refused, never quietly treated as free time.
    if (!b || ms(b.end) < ms(b.start)) throw new Error('A booking has a start and an end, in that order.');
    return e + gap * MIN <= ms(b.start) || s >= ms(b.end) + gap * MIN;
  });
}

/**
 * Whether a call from `instant` for `minutes` sits inside 07:00 to 20:00 in
 * a zone (the booker's own time): it starts at 07:00 or later and has ended
 * by 20:00 the same day. With no length given, it is the moment itself that
 * must fall from 07:00 up to 20:00.
 */
export function sociable(instant, zone, { minutes = 0, from = SOCIABLE_FROM, to = SOCIABLE_TO } = {}) {
  if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes < 0) throw new Error('A call has a length in minutes, above zero.');
  const start = wallClock(instant, zone);
  const end = wallClock(ms(instant) + minutes * MIN, zone);
  if (end.date !== start.date) return false; // it would run past midnight
  return start.hour * 60 + start.minute >= minutesOf(from) && end.hour * 60 + end.minute <= minutesOf(to);
}

/**
 * Why a start can't be booked, or null when it can:
 *   'quarter'   not on a quarter hour in the client's time
 *   'gap'       within 15 minutes of another booking
 *   'early-late' it starts before 07:00 or ends after 20:00 for the booker
 *               (only when they haven't chosen "Show early and late times")
 */
export function bookingProblem({ start, minutes, clientZone, bookerZone = clientZone, bookings = [], earlyAndLate = false }) {
  if (!onQuarterHour(start, clientZone)) return 'quarter';
  if (!clearOfOthers(start, minutes, bookings)) return 'gap';
  if (!earlyAndLate && !sociable(start, bookerZone, { minutes: length(minutes) })) return 'early-late';
  return null;
}

/**
 * The starts that can be offered on one day of the booker's own calendar.
 * @param {object} o
 * @param {string} o.day          'YYYY-MM-DD', a day in the booker's zone
 * @param {number} o.minutes      the call's length
 * @param {string} o.clientZone   the anchor zone: starts are on its quarter hours
 * @param {string} [o.bookerZone] whoever is choosing the time (default: the client)
 * @param {{start, end}[]} [o.bookings] what is already in the coach's calendar
 * @param {{start, end}[]} [o.open]  when the coach is free to be booked (instants); left out, the whole day
 * @param {boolean} [o.earlyAndLate] "Show early and late times" was chosen
 * @param {Date} [o.notBefore]    nothing before this instant (for example 24 hours ahead)
 * @returns {Date[]} instants, earliest first
 */
export function offeredStarts({ day, minutes, clientZone, bookerZone = clientZone, bookings = [], open = null, earlyAndLate = false, notBefore = null }) {
  length(minutes);
  const notBeforeMs = notBefore == null ? null : ms(notBefore);
  const dayStart = instantAt(day, '00:00', bookerZone);
  const dayEnd = instantAt(addDays(day, 1), '00:00', bookerZone);
  const out = [];
  for (let t = nextQuarterHour(dayStart, clientZone).getTime(); t < dayEnd.getTime(); t += QUARTER_MINUTES * MIN) {
    const start = new Date(t);
    // A clock change inside the day can leave a start off the quarter hour.
    if (!onQuarterHour(start, clientZone)) continue;
    if (wallClock(start, bookerZone).date !== day) continue;
    if (notBeforeMs != null && t < notBeforeMs) continue;
    if (open && !open.some((o) => t >= ms(o.start) && t + minutes * MIN <= ms(o.end))) continue;
    if (bookingProblem({ start, minutes, clientZone, bookerZone, bookings, earlyAndLate })) continue;
    out.push(start);
  }
  return out;
}
