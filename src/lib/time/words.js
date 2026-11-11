// How a time in a zone is written (time-zone-safeguards.md, rules 5 to 8):
//   - with a city or country name, never letters: "10:00 Chicago time";
//   - 12-hour for readers in the US and Canada ("7:30 am New York time"),
//     24-hour for everyone else ("15:00 UK time");
//   - dates in words, never numbers: "Tue 3 Nov" (3/11 is 11 March to an
//     American);
//   - both days when they differ: "Mon 16 Nov, 08:00 Sydney time (Sun 15
//     Nov, 21:00 UK time)".
// The words follow the READER's zone: whoever the time is shown to.
import { wallClock, dayIn, addDays, mustBeDay } from './instants.js';
import { usesTwelveHour, zoneLabel } from './zones.js';

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const LONG_DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n) => String(n).padStart(2, '0');

/** "7:30 am" for a US or Canadian zone, "07:30" for any other. */
export function clockWords(instant, zone) {
  const w = wallClock(instant, zone);
  if (!usesTwelveHour(zone)) return `${pad(w.hour)}:${pad(w.minute)}`;
  const hour = w.hour % 12 === 0 ? 12 : w.hour % 12;
  return `${hour}:${pad(w.minute)} ${w.hour < 12 ? 'am' : 'pm'}`;
}

/** "7:30 am New York time", "15:00 UK time". */
export const timeWords = (instant, zone) => `${clockWords(instant, zone)} ${zoneLabel(zone)}`;

/** "Mon 16 Nov"; with { year: true }, "Mon 16 Nov 2026"; with { long: true }, "Monday 16 Nov". */
export function dayWords(instant, zone, { year = false, long = false } = {}) {
  const w = wallClock(instant, zone);
  const name = (long ? LONG_DAY_NAMES : DAY_NAMES)[w.weekday - 1];
  return `${name} ${w.day} ${MONTHS[w.month - 1]}${year ? ` ${w.year}` : ''}`;
}

/** A day key in words: "Sun 1 Nov". No clock is read. */
export function dayKeyWords(date, { year = false, long = false } = {}) {
  const [y, m, d] = mustBeDay(date).split('-').map(Number);
  const weekday = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
  return `${(long ? LONG_DAY_NAMES : DAY_NAMES)[weekday]} ${d} ${MONTHS[m - 1]}${year ? ` ${y}` : ''}`;
}

/** "Mon 16 Nov, 08:00 Sydney time". */
export const whenWords = (instant, zone, options) => `${dayWords(instant, zone, options)}, ${timeWords(instant, zone)}`;

/**
 * A time for someone, with a second person's time beside it (the client's
 * beside the coach's, or the booker's beside the client's):
 *   same day:    "12:30 UK time · 7:30 am New York time"
 *   other day:   "Mon 16 Nov, 08:00 Sydney time (Sun 15 Nov, 21:00 UK time)"
 * `withDay` puts the day first on the same-day form too.
 */
export function bothWords(instant, zone, otherZone, { withDay = false } = {}) {
  if (!otherZone || otherZone === zone) return withDay ? whenWords(instant, zone) : timeWords(instant, zone);
  const differ = wallClock(instant, zone).date !== wallClock(instant, otherZone).date;
  if (differ) return `${whenWords(instant, zone)} (${whenWords(instant, otherZone)})`;
  const pair = `${timeWords(instant, zone)} · ${timeWords(instant, otherZone)}`;
  return withDay ? `${dayWords(instant, zone)}, ${pair}` : pair;
}

/**
 * The day as the reader would say it today: "today", "tomorrow", or the
 * day in words ("Wed 11 Nov"). Worked out on the reader's own midnight.
 */
export function relativeDayWords(instant, zone, now = new Date()) {
  const today = dayIn(zone, now);
  const day = wallClock(instant, zone).date;
  if (day === today) return 'today';
  if (day === addDays(today, 1)) return 'tomorrow';
  return dayWords(instant, zone);
}

/**
 * A session's time in a sentence, for the reader: "tomorrow, Wed 11 Nov, at
 * 10:00 Chicago time", "today at 15:00 UK time", "on Mon 16 Nov at 08:00
 * Sydney time".
 */
export function sessionWhenWords(instant, zone, now = new Date()) {
  const rel = relativeDayWords(instant, zone, now);
  const time = timeWords(instant, zone);
  if (rel === 'today') return `today at ${time}`;
  if (rel === 'tomorrow') return `tomorrow, ${dayWords(instant, zone)}, at ${time}`;
  return `on ${rel} at ${time}`;
}
