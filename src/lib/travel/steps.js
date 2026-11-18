// A day's steps: Light, Caffeine and Sleep, with any key moments, in time
// order (docs/travel-plan-method.md, "The three steps"). Times are worked
// out as instants and written on the clock of wherever the person is at
// that moment; on a day with two time zones every time says which.
import { instantAt, offsetMinutes, wallClock } from '../time/index.js';
import { RULES, HOUR } from './rules.js';
import { usualBedAt, usualWakeAt, ontoDay, bedOnFlight } from './clock.js';
import { whereOn, zoneOfAt } from './trip.js';

const MIN = 60000;

/** An instant rounded to the nearest (or next, with `up`) 30 minutes on a zone's own clock. */
export function roundIn(instant, zone, { up = false } = {}) {
  const step = RULES.roundMinutes * MIN;
  const off = offsetMinutes(instant, zone) * MIN;
  const local = instant.getTime() + off;
  const r = (up ? Math.ceil(local / step - 1e-9) : Math.round(local / step)) * step;
  return new Date(r - off);
}

const later = (t, hours) => new Date(t.getTime() + hours * HOUR);
const hhmm = (t, zone) => wallClock(t, zone).time;

/** "30 minutes", "an hour", "90 minutes", "2 hours". */
export function hoursWords(h) {
  const m = Math.round(Math.abs(h) * 60);
  const whole = Math.floor(m / 60);
  const rest = m % 60;
  if (m === 60) return 'an hour';
  if (m === 90) return 'an hour and a half';
  if (rest === 0) return `${whole} hours`;
  if (rest === 30 && whole > 1) return `${whole} and a half hours`;
  if (whole === 0) return `${m} minutes`;
  return `${whole === 1 ? 'an hour' : `${whole} hours`} and ${rest} minutes`;
}

/** The zone the person's watch is on at an instant: the departure zone until take-off, then the next place. */
function zoneAt(where, t) {
  let place = where.start;
  for (const f of where.flights) if (t >= f.departs) place = { zone: f.toZone, city: f.toCity || place.city };
  return place;
}

function step(kind, at, place, words, extra = {}) {
  return { kind, at: at ? at.toISOString() : null, time: at ? hhmm(at, place.zone) : null, zone: place.zone, city: place.city, words, ...extra };
}

const DAY = 24 * HOUR;

/** Whether an instant falls on a date's own day on a zone's clock, from `fromHour` that day to `fromHour` the next. */
const onDay = (t, zone, date, fromHour = 0) => ontoDay(t, zone, date, fromHour) === t;

/**
 * A day's frame: where the person sleeps and when, and when their body
 * wakes, each on the day's own date where they are (a difference of more
 * than 12 hours reads the home-anchored times a day out, so each is moved by
 * whole days onto the day it's listed under).
 *  - inAir: a flight is in the air all day (it left on an earlier date and lands on a later one).
 *  - noNight: the day's flight lands on a later date with no night on board: one long day.
 *  - sleepOnFlight: a night on a flight that lands the same date, with a bedtime after it.
 */
const frames = new WeakMap();
export function frameOf(trip, day) {
  const kept = frames.get(day);
  if (kept && kept.trip === trip) return kept.frame;
  const frame = frameFor(trip, day);
  frames.set(day, { trip, frame });
  return frame;
}

function frameFor(trip, day) {
  const where = whereOn(trip, day.date);
  const rawWake = new Date(usualWakeAt(trip, day.date).getTime() - day.clock * HOUR);
  const inAir = day.inAir || null;
  if (inAir) return { where, inAir, noNight: true, bed: null, sleepPlace: where.start, bodyWake: ontoDay(rawWake, where.start.zone, day.date, 0) };
  const sleepPlace = day.onBoard ? { zone: day.onBoard.toZone, city: day.onBoard.toCity || where.end.city } : where.end;
  // The flight that lands today, or leaves today (and lands later).
  const legsToday = trip.legs.filter((l) => l.departsOn === day.date || (l.departsOn < day.date && wallClock(l.arrives, l.toZone).date === day.date));
  const lastLeg = legsToday.length ? legsToday[legsToday.length - 1] : null;
  const landing = lastLeg ? lastLeg.arrives : null;
  let bed;
  let noNight = false;
  let sleepOnFlight = null;
  if (day.onBoard) bed = day.boardSleep ? roundIn(new Date(day.boardSleep), day.onBoard.fromZone, { up: true }) : later(day.onBoard.departs, RULES.sleepAfterTakeOff);
  else {
    bed = roundIn(ontoDay(new Date(usualBedAt(trip, day.date).getTime() - day.sleepShift * HOUR), sleepPlace.zone, day.date), sleepPlace.zone);
    const earliest = later(landing || bed, RULES.bedAfterLanding);
    if (landing && bed < earliest) {
      // Landing a little after bedtime moves bed later; landing long after it, the day has no night.
      if (earliest - bed <= RULES.lateBedHours * HOUR) bed = roundIn(earliest, sleepPlace.zone, { up: true });
      else noNight = true;
    }
    // Never in bed after leaving for tomorrow's flight.
    const nextFlight = trip.legs.find((l) => l.departsOn > day.date);
    if (nextFlight && !noNight && bed > later(nextFlight.departs, -RULES.boardWindow)) bed = roundIn(later(nextFlight.departs, -RULES.boardWindow), sleepPlace.zone);
    for (const f of where.flights) if (!noNight && bedOnFlight(trip, day.date, f, { target: day.target, clock: day.clock })) sleepOnFlight = f;
  }
  if (noNight) return { where, inAir: null, noNight, bed: null, sleepPlace, lastLeg, landing, bodyWake: ontoDay(rawWake, where.start.zone, day.date, 0) };
  // The body's wake time before that bed (within the 24 hours before it).
  const bodyWake = new Date(rawWake.getTime() + Math.floor((bed - rawWake) / DAY) * DAY);
  return { where, inAir: null, noNight, bed, sleepPlace, sleepOnFlight, lastLeg, landing, bodyWake };
}

/** The bedtime instant a day's sleep plan means, rounded on the clock of the place the person sleeps; the time asleep on board; or null with no night. */
export const bedOf = (trip, day) => frameOf(trip, day).bed;

/** The body's own wake time on a day, as an instant. */
export const bodyWakeOf = (trip, day) => frameOf(trip, day).bodyWake;

/**
 * The steps for one day.
 * @param {object} trip     readTrip's result
 * @param {object} day      bodyClockDays' day
 * @param {object} o
 * @param {object|null} o.before  the day before (its bed decides when this day starts)
 * @param {object|null} o.next    the day after (where the clock goes next decides the light)
 */
export function stepsFor(trip, day, { before = null, next = null } = {}) {
  const frame = frameOf(trip, day);
  const { where } = frame;
  const twoZones = where.places.length > 1 && where.places.some((p) => p.zone !== where.start.zone);
  const moments = momentSteps(trip, day);

  // A day in the air: rest on the flight, and nothing else to do.
  if (frame.inAir) {
    const f = frame.inAir;
    const steps = [{ ...step('sleep', later(f.departs, RULES.sleepAfterTakeOff), { zone: f.toZone, city: f.toCity || where.end.city }, 'Rest on the flight, and sleep when you can.'), time: null, label: 'On board', onBoard: true, wake: null }, ...moments];
    steps.sort(byTime);
    for (const s of steps) s.showZone = false;
    return { steps, twoZones: false, where, bed: null, wake: null };
  }

  const steps = [];
  const { bed, bodyWake, sleepPlace } = frame;
  const homeZone = trip.base.zone;
  const prev = before ? frameOf(trip, before) : null;
  // A flight that left on an earlier date and lands today.
  const arriving = trip.legs.find((l) => l.departsOn < day.date && wallClock(l.arrives, l.toZone).date === day.date) || null;

  // When the day starts: the planned wake time after last night's sleep, or landing after a night on board or a long day.
  let wake;
  let afterNightOnBoard = null;
  if (before && before.onBoard) { afterNightOnBoard = before.onBoard; wake = before.onBoard.arrives; } else if (prev && prev.inAir && arriving) { afterNightOnBoard = arriving; wake = arriving.arrives; } else if (prev && prev.noNight && arriving) wake = arriving.arrives;
  else if (prev && prev.bed) wake = later(prev.bed, trip.sleep.hours);
  else wake = usualWakeAt(trip, day.date);
  // Tonight's bed for the day's light and caffeine; on a long day with no night, the next one.
  const bedRef = bed || later(wake, 24 - trip.sleep.hours);

  // ---- Light
  // How far the body clock moves by tomorrow, in true time (a change of the home clocks overnight isn't a move).
  const move = next ? next.clock + (next.homeOffset ?? 0) - day.clock - (day.homeOffset ?? next.homeOffset ?? 0) : 0;
  const goingLater = move < -0.05;
  const lightPlace = where.end;
  const { landing } = frame;
  const landsToday = landing && !day.onBoard && !frame.noNight && !afterNightOnBoard && wallClock(landing, lightPlace.zone).date === day.date;
  const allowed = roundIn(later(bodyWake, RULES.lightAfterBodyWake), lightPlace.zone, { up: true });
  let light;
  if (landsToday) {
    const out = roundIn(later(landing, RULES.afterLanding), lightPlace.zone, { up: true });
    const morningEnds = later(allowed, RULES.lightHours);
    const z = lightPlace.zone;
    if (goingLater) light = step('light', out, lightPlace, 'Get daylight from landing until dark.', { bright: span(out, bedRef) });
    else if (Math.abs(move) <= 0.05 && out >= allowed) light = step('light', out, lightPlace, 'Get daylight from landing.', { bright: span(out, later(out, RULES.lightHours)) });
    else if (out >= morningEnds) light = step('light', out, lightPlace, 'Keep the light low from landing until bedtime.', { low: span(out, bedRef) });
    else if (out >= allowed) light = step('light', out, lightPlace, `Get daylight from landing until ${hhmm(morningEnds, z)}.`, { bright: span(out, morningEnds) });
    else light = step('light', allowed, lightPlace, `Wear sunglasses until ${hhmm(allowed, z)}, then get daylight until ${hhmm(morningEnds, z)}.`, { bright: span(allowed, morningEnds), low: span(out, allowed) });
  } else if (goingLater) {
    const place = day.onBoard ? where.start : zoneAt(where, later(bedRef, -1));
    if (place.zone === homeZone) {
      // The evening: from 3.5 hours before the usual bedtime, or before tonight's if that's earlier.
      const usualEvening = roundIn(instantAt(day.date, timeOfHours(trip.sleep.bed - RULES.eveningBeforeUsualBed), place.zone), place.zone);
      const tonight = roundIn(later(bedRef, -RULES.eveningBeforeUsualBed), place.zone);
      const from = tonight < usualEvening ? tonight : usualEvening;
      light = step('light', from, place, 'Keep the lights bright until bedtime.', { bright: span(from, bedRef) });
    } else {
      const lowUntil = roundIn(later(bodyWake, RULES.lowAfterBodyWake), place.zone);
      const from = roundIn(later(bodyWake, RULES.daylightAfterBodyWake), place.zone);
      const words = lowUntil > wake ? `Keep the light low until ${hhmm(lowUntil, place.zone)}, then get daylight from ${hhmm(from, place.zone)}.` : `Get daylight from ${hhmm(from, place.zone)}.`;
      light = step('light', from, place, words, { bright: span(from, bedRef), low: span(wake, lowUntil) });
    }
  } else {
    const place = zoneAt(where, wake);
    const until = later(allowed, RULES.lightHours);
    const dim = day.phase === 'turn' && bed ? `, and dim the lights from ${hhmm(roundIn(later(bed, -RULES.dimBeforeBed), place.zone), place.zone)}` : '';
    if (allowed <= wake) light = step('light', wake, place, `${afterNightOnBoard ? 'Get daylight from landing' : 'Get bright light as soon as you’re up'}${dim}.`, { bright: span(wake, later(wake, RULES.lightHours)) });
    else if (afterNightOnBoard) light = step('light', allowed, place, `Wear sunglasses until ${hhmm(allowed, place.zone)}, then get daylight until ${hhmm(until, place.zone)}${dim}.`, { bright: span(allowed, until), low: span(wake, allowed) });
    else if (allowed - wake <= HOUR) light = step('light', allowed, place, `Get daylight as soon as it’s light${dim}.`, { bright: span(allowed, until) });
    else light = step('light', allowed, place, `Keep the light low until ${hhmm(allowed, place.zone)}, then get daylight until ${hhmm(until, place.zone)}${dim}.`, { bright: span(allowed, until), low: span(wake, allowed) });
  }
  light = clearOfFlights(trip, day, light, { landing: frame.noNight ? null : landing, place: lightPlace, goingLater, bed: bedRef });
  if (light) {
    light.bodyWake = bodyWake.toISOString();
    steps.push(light);
  }

  // ---- Caffeine: 9 hours before that night's bedtime (none on a long day with no night: the next day has it).
  if (!trip.noCaffeine && bed) {
    const by = later(bed, -RULES.caffeineHours);
    // On the clock of wherever the person is then (on a flight, the destination's); when that reads another date, the day's own first clock.
    let place = zoneAt(where, by);
    if (!onDay(by, place.zone, day.date)) place = where.start;
    if (onDay(by, place.zone, day.date)) steps.push(step('caffeine', by, place, caffeineWords(trip, by, hhmm(by, place.zone)), { onPlane: onAPlane(trip, by) }));
  }

  // ---- Sleep
  if (frame.noNight) {
    const f = frame.lastLeg;
    steps.push({ ...step('sleep', f.departs, { zone: f.fromZone, city: f.fromCity || where.start.city }, 'Stay awake on the flight.'), time: null, label: 'On board', onBoard: true, wake: null });
  } else if (day.onBoard) {
    steps.push({ ...step('sleep', bed, sleepPlace, 'Sleep as soon as you can after take-off.'), time: null, label: 'On board', onBoard: true, wake: null });
  } else {
    const getUp = later(bed, trip.sleep.hours);
    const t = hhmm(bed, sleepPlace.zone);
    const usual = trip.sleep.start;
    const diff = minutesBetween(t, usual) / 60; // + later than usual
    const flewToday = where.flights.length > 0;
    const nightBeforeFlight = Boolean(next && next.phase === 'out');
    const shifting = day.phase === 'before' || day.phase === 'turn';
    // Away and still behind, the body wakes early: it's fine to rest in the dark.
    const wakesEarly = day.phase === 'away' && later(bodyWake, 24) < later(getUp, -0.75);
    let words;
    if (frame.sleepOnFlight) words = `Sleep on the flight, and go to bed at ${t}`;
    else if (flewToday) words = `Stay awake on the flight, and go to bed at ${t}`;
    else if (diff === 0 && !wakesEarly) words = `Go to bed at your usual ${usual}`;
    else if (shifting) words = `Go to bed ${hoursWords(diff)} ${diff > 0 ? 'later' : 'earlier'} than usual${nightBeforeFlight || day.phase === 'turn' ? '' : `, and get up at ${hhmm(getUp, sleepPlace.zone)}`}`;
    else words = `Go to bed at ${t}`;
    if (wakesEarly && !flewToday) words += ', and rest in the dark if you wake early';
    words += '.';
    steps.push({ ...step('sleep', bed, sleepPlace, words), wake: hhmm(getUp, sleepPlace.zone) });
  }

  steps.push(...moments);
  steps.sort(byTime);
  for (const s of steps) s.showZone = twoZones && !s.onBoard;
  return { steps, twoZones, where, bed, wake };
}

/** Key moments on a day, in their own city's time. */
function momentSteps(trip, day) {
  const out = [];
  for (const m of trip.moments) {
    if (day.date < m.startsOn || day.date > m.endsOn) continue;
    const place = { zone: m.zone, city: m.city };
    const first = day.date === m.startsOn;
    const at = first ? m.at : null;
    out.push({
      ...step('moment', at, place, first ? (at ? `${m.name} starts.` : `${m.name} is today.`) : `${m.name} carries on today.`),
      momentId: m.id,
      number: m.number,
      name: m.name,
    });
  }
  return out;
}

/**
 * A light step never starts on a flight: it moves to landing when the
 * flight lands later that day, and otherwise goes (the day after has its own).
 */
function clearOfFlights(trip, day, light, { landing, place, goingLater, bed }) {
  // Only where the person is at the time, on the day's own date, and never in the air.
  const at = new Date(light.at);
  // Nothing to do in the last hour before bed.
  const tooLate = (t) => bed && t >= later(bed, -1);
  if (zoneOfAt(trip, at) === light.zone && onDay(at, light.zone, day.date)) return tooLate(at) ? null : light;
  const z = place.zone;
  if (!landing || landing < at) return null;
  const out = roundIn(later(landing, RULES.afterLanding), z, { up: true });
  if (!onDay(out, z, day.date) || tooLate(out)) return null;
  const brightTo = light.bright ? new Date(light.bright.to) : null;
  if (goingLater) return step('light', out, place, 'Get daylight from landing until dark.', { bright: span(out, bed) });
  if (brightTo && brightTo > out) return step('light', out, place, `Get daylight from landing until ${hhmm(brightTo, z)}.`, { bright: span(out, brightTo) });
  return step('light', out, place, 'Keep the light low from landing until bedtime.', { low: span(out, bed) });
}

const span = (from, to) => ({ from: from.toISOString(), to: to.toISOString() });

/** Whether an instant falls between a flight's take-off and its landing. */
export const onAPlane = (trip, t) => trip.legs.some((l) => t > l.departs && t < l.arrives);

/** The last caffeine's words; during a flight it says so (Tim, 18 Nov, 09:00: caffeine in the air is allowed). */
export const caffeineWords = (trip, by, time) => `Have your last caffeine by ${time}${onAPlane(trip, by) ? ', on the plane' : ''}.`;

function timeOfHours(h) {
  const m = ((Math.round(h * 60) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Minutes from `b` to `a` on the clock, -12 to +12 hours (00:30 is 120 after 22:30). */
function minutesBetween(a, b) {
  const [ah, am] = a.split(':').map(Number);
  const [bh, bm] = b.split(':').map(Number);
  let d = (ah * 60 + am) - (bh * 60 + bm);
  if (d > 720) d -= 1440;
  if (d <= -720) d += 1440;
  return d;
}

/**
 * Time order: an untimed key moment first, then by instant, a key moment
 * before a step at the same time, and "On board" last.
 */
const rank = (s) => (s.kind === 'moment' && !s.at ? -Infinity : s.onBoard ? Number.MAX_SAFE_INTEGER : Date.parse(s.at));
function byTime(a, b) {
  return rank(a) - rank(b) || (a.kind === 'moment' ? -1 : b.kind === 'moment' ? 1 : 0);
}
