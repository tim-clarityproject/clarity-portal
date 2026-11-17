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
import { addDays, daysBetween, instantAt } from '../time/index.js';
import { RULES, HOUR, clamp } from './rules.js';
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

/** The flight that day that the night is spent on, or null. */
export function nightOnBoard(trip, date, plannedBed) {
  const { flights } = whereOn(trip, date);
  for (const f of flights) {
    if (f.arrivesOn > f.departsOn) return f;
    if (plannedBed >= f.departs && plannedBed < f.arrives) return f;
  }
  return null;
}

/**
 * The body clock and the sleep plan, from a day onwards, until the clock is
 * back on home time after the flight home.
 * @param {object} trip     readTrip's result
 * @param {object} o
 * @param {string} o.from   the first day ('YYYY-MM-DD')
 * @param {number} [o.clock] where the body clock is coming into that day (hours from home)
 * @returns {{ date, phase, k, difference, target, clock, sleepShift, onBoard }[]}
 */
export function bodyClockDays(trip, { from, clock = 0 }) {
  const days = [];
  let c = clock;
  const towards = Math.sign(differenceOn(trip.flightOut.arrivesOn, trip.base.zone, trip.away.zone)) || 1;
  for (let date = from, n = 0; n < RULES.maxDays; date = addDays(date, 1), n += 1) {
    const { phase, k } = phaseOf(trip, date);
    const D = differenceOn(date, trip.base.zone, trip.away.zone);
    let target;
    let onBoard = null;
    if (phase === 'wait') target = c;
    else if (phase === 'before') {
      target = towards * Math.min(RULES.preRate * (k - 0.5), Math.abs(D));
      if (towards * c > towards * target) target = c; // never pulled back before the flight
    } else if (phase === 'away') target = D;
    else if (phase === 'turn') target = D - towards * RULES.turnHours;
    else if (phase === 'back') target = 0;
    else target = phase === 'out' ? D : 0;

    // A night on board: asleep soon after take-off, wherever the body clock is.
    if (phase === 'out' || phase === 'flyHome' || whereOn(trip, date).flights.length) {
      const planned = new Date(usualBedAt(trip, date).getTime() - target * HOUR);
      onBoard = nightOnBoard(trip, date, planned);
      if (onBoard) target = shiftOfBed(trip, date, new Date(onBoard.departs.getTime() + RULES.sleepAfterTakeOff * HOUR));
    }

    const gap = target - c;
    const rate = phase === 'before' || phase === 'wait' ? RULES.preRate : gap > 0 ? RULES.eastRate : RULES.westRate;
    c += clamp(RULES.follow * gap, -rate, rate);
    // Back home, within half an hour of home time counts as back. (Away,
    // nothing is rounded: the % read-out reaches 100 by its own rounding.)
    if (phase === 'back' && Math.abs(c) <= RULES.there) c = 0;

    const sleepShift = onBoard ? target : clamp(target, c - RULES.sleepWindow, c + RULES.sleepWindow);
    days.push({ date, phase, k, difference: D, target, clock: c, sleepShift, onBoard });
    if (phase === 'back' && c === 0) break;
  }
  return days;
}
