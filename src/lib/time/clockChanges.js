// Clock changes (time-zone-safeguards.md, rule 1). The UK and Europe
// change on the last Sunday of March and October; the US and Canada on the
// second Sunday of March and the first of November; the southern
// hemisphere the other way round; many places never. Nothing here knows
// those dates: it asks the device's time zone data, zone by zone.
//
// For Phase 6a's quiet line in the coach portal: "US clocks go back on
// Sunday 1 Nov. Your calls with US clients stay at their usual time for
// them; for you, Tyson's Monday call moves from 12:30 to 13:30 UK time
// this week."
import { offsetMinutes, wallClock } from './instants.js';
import { nextCall, seriesCalls } from './series.js';
import { clockWords, dayKeyWords } from './words.js';
import { countryWords, zoneCountry, zoneLabel, zonePlace } from './zones.js';

const HOUR = 3600000;
const DAY = 24 * HOUR;

/**
 * The clock changes in a zone from an instant, for some days ahead.
 * @returns {{ at: Date, date: string, direction: 'forward'|'back', minutes: number }[]}
 *   `date` is the local day of the change; `minutes` how far the clock moves.
 */
export function clockChanges(zone, from = new Date(), days = 7) {
  const start = from instanceof Date ? from.getTime() : new Date(from).getTime();
  const end = start + days * DAY;
  const out = [];
  let before = offsetMinutes(start, zone);
  for (let t = start + HOUR; t <= end; t += HOUR) {
    const now = offsetMinutes(t, zone);
    if (now !== before) {
      // Narrow the hour down to the minute the clocks change.
      let lo = t - HOUR;
      let hi = t;
      while (hi - lo > 60000) {
        const mid = Math.floor((lo + hi) / 2 / 60000) * 60000;
        if (offsetMinutes(mid, zone) === before) lo = mid; else hi = mid;
      }
      // The local day it happens on, read just before the change.
      out.push({ at: new Date(hi), date: wallClock(hi - 1000, zone).date, direction: now > before ? 'forward' : 'back', minutes: Math.abs(now - before) });
      before = now;
    }
  }
  return out;
}

/**
 * The repeating calls whose time moves FOR THE COACH because of a clock
 * change, in the client's zone or the coach's own, in the days ahead. Each
 * call stays at its usual time for the client (its series is a rule in the
 * client's zone); what is compared is the coach's own clock for the call
 * before the change and the first call after it.
 * @param {object} o
 * @param {string} o.coachZone
 * @param {{ name: string, rule: object }[]} o.series  each client's first name and series rule
 * @param {Date} [o.from]
 * @param {number} [o.days]
 * @returns {{ name, zone, change: {at,date,direction,minutes,zone}, call: {at,date}, was: 'HH:MM', now: 'HH:MM' }[]}
 */
export function callsThatMove({ coachZone, series, from = new Date(), days = 7 }) {
  const start = from instanceof Date ? from : new Date(from);
  const end = new Date(start.getTime() + days * DAY);
  const moved = [];
  for (const s of series) {
    const zone = s.rule.zone;
    const changes = [
      ...clockChanges(zone, start, days).map((c) => ({ ...c, zone })),
      ...(coachZone === zone ? [] : clockChanges(coachZone, start, days).map((c) => ({ ...c, zone: coachZone }))),
    ].sort((a, b) => a.at - b.at);
    for (const change of changes) {
      // The first call after the change, and the last one before it.
      const after = nextCall(s.rule, change.at);
      if (!after || after.at.getTime() > end.getTime() + 7 * DAY * (s.rule.every || 1)) continue;
      const earlier = seriesCalls(s.rule, { from: new Date(change.at.getTime() - (s.rule.every || 1) * 7 * DAY - DAY), to: change.at });
      const before = earlier[earlier.length - 1];
      if (!before) continue;
      const was = wallClock(before.at, coachZone).time;
      const now = wallClock(after.at, coachZone).time;
      if (was !== now) moved.push({ name: s.name, zone, change, call: after, was, now });
    }
  }
  return moved;
}

const WEEKDAY_WORDS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/**
 * The quiet line for one clock change (rule 1), in the coach's own words
 * and clock. `moves` are callsThatMove's rows for that change.
 */
export function clockChangeLine({ coachZone, change, moves }) {
  const country = zoneCountry(change.zone);
  const whose = country ? `${countryWords(country).replace(/^the /, '')} clocks` : `${zonePlace(change.zone)} clocks`;
  const first = `${whose.charAt(0).toUpperCase()}${whose.slice(1)} go ${change.direction === 'back' ? 'back' : 'forward'} on ${dayKeyWords(change.date, { long: true })}.`;
  if (!moves.length) return first;
  const own = change.zone === coachZone;
  const each = moves.map((m) => `${m.name}’s ${WEEKDAY_WORDS[wallClock(m.call.at, coachZone).weekday - 1]} call moves from ${clockWords(seriesInstantAt(m, 'was', coachZone), coachZone)} to ${clockWords(m.call.at, coachZone)} ${zoneLabel(coachZone)} this week`);
  const who = country && !own ? `${countryWords(country).replace(/^the /, '')} clients` : 'those clients';
  return `${first} Your calls with ${who} stay at their usual time for them; for you, ${each.join(', and ')}.`;
}

// The instant on the call's own day that reads `was` on the coach's clock:
// only used to write the earlier time in the coach's 12 or 24 hour style.
function seriesInstantAt(move, key, coachZone) {
  const [h, m] = move[key].split(':').map(Number);
  const now = wallClock(move.call.at, coachZone);
  return new Date(move.call.at.getTime() + ((h * 60 + m) - (now.hour * 60 + now.minute)) * 60000);
}
