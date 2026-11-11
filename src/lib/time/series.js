// A repeating series is saved as a rule in its anchor zone, never as a
// list of fixed instants (time-zone-safeguards.md, rule 14): "every other
// Monday, 07:30 New York time". Each call's instant is worked out from the
// rule, so it stays 07:30 for the client whenever either country's clocks
// change, and the coach's time is what moves.
//
// The rule:
//   { every: 1 | 2 | …   weeks between calls (2 = every other week)
//     weekday: 1..7       Monday 1 to Sunday 7, in the anchor zone
//     time: 'HH:MM'       the wall-clock time, in the anchor zone
//     zone: 'America/New_York'   the anchor zone, by place name
//     from: 'YYYY-MM-DD'  the first call's day, in the anchor zone
//     until?: 'YYYY-MM-DD' the last day a call can fall on (optional) }
import { addDays, daysBetween, instantAt, mustBeDay, toDate, wallClock, weekdayOf } from './instants.js';
import { mustBeZone } from './zones.js';

/** Checks a rule and returns it tidy; anything that could drift is refused. */
export function seriesRule({ every = 1, weekday, time, zone, from, until = null }) {
  mustBeZone(zone);
  if (!Number.isInteger(every) || every < 1 || every > 52) throw new Error('A series repeats every 1 to 52 weeks.');
  if (typeof from !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(from)) throw new Error('A series starts on a day.');
  mustBeDay(from);
  if (typeof time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('A series has a time, as HH:MM.');
  const day = weekday ?? weekdayOf(from);
  if (!Number.isInteger(day) || day < 1 || day > 7) throw new Error('A series falls on a weekday, Monday 1 to Sunday 7.');
  if (until != null && (typeof until !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(until))) throw new Error('A series ends on a day.');
  if (until != null) mustBeDay(until);
  // The first call is the first such weekday on or after `from`.
  const first = addDays(from, (day - weekdayOf(from) + 7) % 7);
  return { every, weekday: day, time, zone, from: first, until };
}

/**
 * The calls of a series between two instants (inclusive start, exclusive
 * end), each worked out from the rule in its anchor zone.
 * @returns {{ date: string, at: Date, zone: string }[]}
 */
export function seriesCalls(rule, { from, to, limit = 500 }) {
  const r = seriesRule(rule);
  // A window with no start or no end is refused: with no end the calls would run on to the limit.
  const start = toDate(from);
  const end = toDate(to);
  const out = [];
  // Start a little before the window, in whole steps from the first call.
  const firstDay = wallClock(new Date(start.getTime() - 2 * 86400000), r.zone).date;
  const step = r.every * 7;
  const daysFromFirst = daysBetween(r.from, firstDay);
  let n = Math.max(0, Math.floor(daysFromFirst / step));
  for (; out.length < limit; n += 1) {
    const date = addDays(r.from, n * step);
    if (r.until && date > r.until) break;
    const at = instantAt(date, r.time, r.zone);
    if (at >= end) break;
    if (at >= start) out.push({ date, at, zone: r.zone });
  }
  return out;
}

/** The next call of a series at or after an instant, or null when it has ended. */
export function nextCall(rule, now = new Date()) {
  const start = toDate(now);
  const r = seriesRule(rule);
  // A series that hasn't started yet has its first call next, however far off.
  const first = instantAt(r.from, r.time, r.zone);
  const calls = seriesCalls(r, { from: start, to: new Date(Math.max(start.getTime(), first.getTime()) + (r.every * 7 + 8) * 86400000), limit: 1 });
  return calls[0] || null;
}
