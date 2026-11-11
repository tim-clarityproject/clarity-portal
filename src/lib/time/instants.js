// Instants and wall clocks (time-zone-safeguards.md, rule 14). A time is
// always saved as a UTC instant together with the place name of its anchor
// zone: { at: '2026-10-26T11:30:00.000Z', zone: 'America/New_York' }. The
// wall-clock time people agreed to ("07:30 New York time") is worked out
// from the two each time it is shown, so it never drifts when either
// country's clocks change. Offsets are never saved.
//
// Everything here uses the device's own time zone data (Intl), so places
// that never change their clocks, the southern hemisphere and half-hour
// zones need no special handling: they are just place names.
import { mustBeZone } from './zones.js';

const DAY_MS = 86400000;
const pad = (n) => String(n).padStart(2, '0');

const partsFormat = new Map();
function formatFor(zone) {
  if (!partsFormat.has(zone)) {
    partsFormat.set(zone, new Intl.DateTimeFormat('en-GB', {
      timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short',
    }));
  }
  return partsFormat.get(zone);
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * An instant as a Date, or a clear error. Nothing (null, true) is never a
 * time: new Date(null) is 1 Jan 1970, which would be shown as a real day.
 */
export const toDate = (instant) => {
  const d = instant instanceof Date ? instant : new Date(typeof instant === 'number' || typeof instant === 'string' ? instant : NaN);
  if (Number.isNaN(d.getTime())) throw new Error('Not a time.');
  return d;
};

/**
 * A day key, 'YYYY-MM-DD', that is a real day, as [year, month, day]; or a
 * clear error. A day that doesn't exist (30 Feb, month 13) is refused, never
 * quietly rolled on to another day.
 */
function dayParts(date) {
  const m = typeof date === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(date) : null;
  const [y, mo, d] = m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [];
  const t = m ? new Date(Date.UTC(y, mo - 1, d)) : null;
  if (t) t.setUTCFullYear(y); // years 0 to 99 are not 1900 to 1999
  if (!t || t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) throw new Error(`"${String(date).slice(0, 40)}" is not a day (for example 2026-11-10).`);
  return [y, mo, d];
}

/** The day key, or an error saying it is not a real day. */
export const mustBeDay = (date) => { dayParts(date); return date; };

/** A wall-clock time, 'HH:MM' from 00:00 to 23:59, as [hour, minute]; or a clear error. */
function timeParts(time) {
  const m = typeof time === 'string' ? /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time) : null;
  if (!m) throw new Error(`"${String(time).slice(0, 40)}" is not a time of day (for example 07:30).`);
  return [Number(m[1]), Number(m[2])];
}

/**
 * The wall clock in a zone at an instant.
 * @returns {{ date: 'YYYY-MM-DD', time: 'HH:MM', year, month, day, hour, minute, weekday: 1..7 (Monday 1) }}
 */
export function wallClock(instant, zone) {
  const parts = {};
  for (const p of formatFor(mustBeZone(zone)).formatToParts(toDate(instant))) parts[p.type] = p.value;
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  const hour = Number(parts.hour) % 24;
  const minute = Number(parts.minute);
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${pad(hour)}:${parts.minute}`,
    year, month, day, hour, minute,
    second: Number(parts.second),
    weekday: WEEKDAYS.indexOf(parts.weekday) + 1,
  };
}

/** How far the zone's clock is ahead of UTC at an instant, in minutes (-300 for New York in winter). */
export function offsetMinutes(instant, zone) {
  const d = toDate(instant);
  const w = wallClock(d, zone);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return Math.round((asUtc - Math.floor(d.getTime() / 1000) * 1000) / 60000);
}

/**
 * The instant of a wall-clock time in a zone ("2026-10-26", "07:30",
 * "America/New_York"). A time the clocks skip (spring forward) is the same
 * moment an hour on, as a phone's calendar shows it; a time that happens
 * twice (autumn) is its first.
 * @returns {Date}
 */
export function instantAt(date, time, zone) {
  mustBeZone(zone);
  const [y, mo, d] = dayParts(date);
  const [h, mi] = timeParts(time);
  const wanted = Date.UTC(y, mo - 1, d, h, mi);
  // The offset either side of the time decides: usually one answer, none
  // in a skipped hour, two in a repeated one.
  const candidates = [...new Set([offsetMinutes(wanted - DAY_MS, zone), offsetMinutes(wanted + DAY_MS, zone)])]
    .map((off) => wanted - off * 60000)
    .filter((t) => offsetMinutes(t, zone) === Math.round((wanted - t) / 60000))
    .sort((a, b) => a - b);
  if (candidates.length) return new Date(candidates[0]);
  // Skipped: the clock went from the earlier offset to the later one.
  const before = offsetMinutes(wanted - DAY_MS, zone);
  return new Date(wanted - before * 60000);
}

/** The day in a zone at an instant: "2026-11-10". Anything a client sees as "today" runs on this, in their own zone (rule 12). */
export const dayIn = (zone, now = new Date()) => wallClock(now, zone).date;

/** A day key some days on. Plain calendar sums: no clock is read. */
export function addDays(date, days) {
  const [y, m, d] = dayParts(date);
  if (!Number.isInteger(days)) throw new Error('Days are added in whole numbers.');
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** Whole days between two day keys (b after a is positive). */
export function daysBetween(a, b) {
  const n = (date) => { const [y, m, d] = dayParts(date); return Date.UTC(y, m - 1, d); };
  return Math.round((n(b) - n(a)) / DAY_MS);
}

/** Monday 1 to Sunday 7 for a day key. */
export function weekdayOf(date) {
  const [y, m, d] = dayParts(date);
  return ((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7) + 1;
}

/**
 * A time ready to save: the UTC instant and its anchor zone's place name.
 * Refuses an offset or letters as the zone.
 * @returns {{ at: string, zone: string }}
 */
export function savedTime(instant, zone) {
  return { at: toDate(instant).toISOString(), zone: mustBeZone(zone) };
}

/** A wall-clock time in its anchor zone, ready to save. */
export const savedTimeAt = (date, time, zone) => savedTime(instantAt(date, time, zone), zone);

/** Reads a saved time back; anything without a real instant and a place-name zone is refused. */
export function readSavedTime(saved) {
  if (!saved || typeof saved !== 'object') throw new Error('Not a saved time.');
  if (typeof saved.at !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?Z$/.test(saved.at)) throw new Error('A saved time is a UTC instant ending in Z.');
  return { at: toDate(saved.at), zone: mustBeZone(saved.zone) };
}
