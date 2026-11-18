// The body clock, day by day (docs/travel-plan-method.md, "The body clock").
//
// Every value is in hours from home time, east positive: New York from
// London is -5, so a body clock of -4.2 is 4.2 hours later than London
// (about 85% of the way to New York time).
//
// Each day has a target: where the plan's sleep and light try to put the
// clock that day. The body clock closes half the gap to it each day, never
// more than 1 hour a day going earlier (east) or 1.5 hours going later
// (west), and 1 hour a day before the flight out. The night's bedtime is
// the target, kept within 1.5 hours of where the body clock is.
import { addDays, daysBetween, instantAt, offsetMinutes, wallClock } from '../time/index.js';
import { RULES, HOUR, clamp, wrapHours } from './rules.js';
import { differenceOn, whereOn } from './trip.js';

/** The phase of a day: 'wait', 'before', 'out', 'away', 'turn', 'flyHome' or 'back'. */
export function phaseOf(trip, date) {
  const outOn = trip.flightOut.departsOn;
  const homeOn = trip.flightHome.departsOn;
  if (date < outOn) {
    const k = RULES.preDays - daysBetween(date, outOn) + 1;
    return k >= 1 ? { phase: 'before', k } : { phase: 'wait', k: 0 };
  }
  if (date === outOn) return { phase: 'out', k: 0 };
  if (date < homeOn) return { phase: date === addDays(homeOn, -1) && trip.nights >= 3 ? 'turn' : 'away', k: 0 };
  if (date === homeOn) return { phase: 'flyHome', k: 0 };
  return { phase: 'back', k: 0 };
}

/** The home-time instant of the usual bedtime on a day's night (a bedtime after midnight is on the next date). */
export function usualBedAt(trip, date) {
  const { start, bed } = trip.sleep;
  return instantAt(bed < 12 ? addDays(date, 1) : date, start, trip.base.zone);
}

/** The home-time instant of the body's usual wake time on a day, before any shift. */
export const usualWakeAt = (trip, date) => instantAt(date, trip.sleep.end, trip.base.zone);

/** The sleep shift (hours from home, east positive) that a bedtime instant means. */
export const shiftOfBed = (trip, date, bedAt) => (usualBedAt(trip, date) - bedAt) / HOUR;

/** A home-anchored instant moved by whole days, so that on a zone's clock it falls from `fromHour` on a date to `fromHour` the next. */
export function ontoDay(instant, zone, date, fromHour = 12) {
  const w = wallClock(instant, zone);
  const k = Math.floor(daysBetween(date, w.date) + (w.hour + w.minute / 60 - fromHour) / 24);
  return k ? new Date(instant.getTime() - k * 24 * HOUR) : instant;
}

/** The hours the home zone's clocks are ahead of UTC on a day, read at noon home time. */
const homeOffsetOn = (trip, date) => offsetMinutes(instantAt(date, '12:00', trip.base.zone), trip.base.zone) / 60;

/**
 * The night of a day spent on board, or null: a flight that leaves that day
 * and lands on a later date, with the plan's bedtime or the body's own
 * bedtime inside it (from 3 hours before take-off until 3 hours before
 * landing). Asleep at that bedtime, and never sooner than an hour after
 * take-off.
 * @returns {{ flight: object, sleepAt: Date }|null}
 */
export function nightOnBoard(trip, date, { target, clock }) {
  for (const f of whereOn(trip, date).flights) {
    if (f.arrivesOn <= f.departsOn) continue;
    const sleepAt = bedOnFlight(trip, date, f, { target, clock });
    if (sleepAt) return { flight: f, sleepAt };
  }
  return null;
}

/** When the person is asleep on a flight that leaves on a day, or null when neither bedtime falls inside it. */
export function bedOnFlight(trip, date, f, { target, clock }) {
  const usual = usualBedAt(trip, date).getTime();
  const lo = f.departs.getTime() - RULES.boardWindow * HOUR;
  const hi = f.arrives.getTime() - RULES.boardWindow * HOUR;
  // The day's bedtimes, read as that night's on the departure's clock (from noon that day to noon the next).
  const inside = [target, clock]
    .map((x) => ontoDay(new Date(usual - x * HOUR), f.fromZone, date).getTime())
    .filter((b) => b >= lo && b <= hi);
  return inside.length ? new Date(Math.max(Math.min(...inside), f.departs.getTime() + RULES.sleepAfterTakeOff * HOUR)) : null;
}

/** A flight in the air for the whole of a day: it left on an earlier date and lands on a later one. */
export const inTheAir = (trip, date) => trip.legs.find((l) => l.departsOn < date && l.arrivesOn > date) || null;

/**
 * The body clock and the sleep plan, from a day onwards, until the clock is
 * back on home time after the flight home.
 * @param {object} trip     readTrip's result
 * @param {object} o
 * @param {string} o.from   the first day ('YYYY-MM-DD')
 * @param {number} [o.clock] where the body clock is coming into that day (hours from home)
 * @param {string} [o.since] the day that clock was read on (the day before `from` when carrying on); a change of the home clocks since then moves it
 * @returns {{ date, phase, k, difference, target, clock, sleepShift, onBoard, boardSleep, inAir, homeOffset }[]}
 */
export function bodyClockDays(trip, { from, clock = 0, since = from }) {
  const days = [];
  let c = clock;
  let homeOffset = homeOffsetOn(trip, since);
  const towards = Math.sign(differenceOn(trip.flightOut.arrivesOn, trip.base.zone, trip.away.zone)) || 1;
  for (let date = from, n = 0; n < RULES.maxDays; date = addDays(date, 1), n += 1) {
    // The body keeps true time: when the home clocks change, the same body
    // clock reads an hour more or less against them.
    const offset = homeOffsetOn(trip, date);
    c += homeOffset - offset;
    homeOffset = offset;
    const { phase, k } = phaseOf(trip, date);
    const D = differenceOn(date, trip.base.zone, trip.away.zone);
    let target;
    let onBoard = null;
    let boardSleep = null;
    if (phase === 'wait') target = c;
    else if (phase === 'before') {
      target = towards * Math.min(RULES.preRate * (k - 0.5), Math.abs(D));
      if (towards * c > towards * target) target = c; // never pulled back before the flight
    } else if (phase === 'away') target = D;
    else if (phase === 'turn') target = D - towards * RULES.turnHours;
    else if (phase === 'back') target = 0;
    else target = phase === 'out' ? D : 0;

    // A night on board: asleep soon after take-off, wherever the body clock is.
    const inAir = inTheAir(trip, date);
    const night = inAir ? null : nightOnBoard(trip, date, { target, clock: c });
    if (night) {
      onBoard = night.flight;
      boardSleep = night.sleepAt;
      // The bedtime that sleep means, read as the nearest one to the body clock.
      target = c + wrapHours(shiftOfBed(trip, date, boardSleep) - c);
    }

    const gap = target - c;
    const rate = phase === 'before' || phase === 'wait' ? RULES.preRate : gap > 0 ? RULES.eastRate : RULES.westRate;
    c += clamp(RULES.follow * gap, -rate, rate);
    // Back home, within half an hour of home time counts as back. (Away,
    // nothing is rounded: the % read-out reaches 100 by its own rounding.)
    if (phase === 'back' && Math.abs(c) <= RULES.there) c = 0;

    const sleepShift = onBoard ? target : clamp(target, c - RULES.sleepWindow, c + RULES.sleepWindow);
    days.push({ date, phase, k, difference: D, target, clock: c, sleepShift, onBoard, boardSleep, inAir, homeOffset: offset });
    if (phase === 'back' && c === 0) break;
  }
  return days;
}
