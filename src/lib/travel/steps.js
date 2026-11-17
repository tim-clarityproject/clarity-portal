// A day's steps: Light, Caffeine and Sleep, with any key moments, in time
// order (docs/travel-plan-method.md, "The three steps"). Times are worked
// out as instants and written on the clock of wherever the person is at
// that moment; on a day with two time zones every time says which.
import { instantAt, offsetMinutes, wallClock } from '../time/index.js';
import { RULES, HOUR } from './rules.js';
import { usualBedAt, usualWakeAt } from './clock.js';
import { whereOn } from './trip.js';

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

/**
 * The bedtime instant a day's sleep plan means, rounded on the clock of the
 * place the person sleeps; or the time asleep on board.
 */
export function bedOf(trip, day) {
  if (day.onBoard) return later(day.onBoard.departs, RULES.sleepAfterTakeOff);
  const where = whereOn(trip, day.date);
  return roundIn(new Date(usualBedAt(trip, day.date).getTime() - day.sleepShift * HOUR), where.end.zone);
}

/** The body's own wake time on a day, as an instant. */
export const bodyWakeOf = (trip, day) => new Date(usualWakeAt(trip, day.date).getTime() - day.clock * HOUR);

/**
 * The steps for one day.
 * @param {object} trip     readTrip's result
 * @param {object} day      bodyClockDays' day
 * @param {object} o
 * @param {object|null} o.before  the day before (its bed decides when this day starts)
 * @param {object|null} o.next    the day after (where the clock goes next decides the light)
 */
export function stepsFor(trip, day, { before = null, next = null } = {}) {
  const where = whereOn(trip, day.date);
  const twoZones = where.places.length > 1 && where.places.some((p) => p.zone !== where.start.zone);
  const steps = [];
  const bed = bedOf(trip, day);
  const bodyWake = bodyWakeOf(trip, day);
  const homeZone = trip.base.zone;
  const sleepPlace = day.onBoard ? { zone: day.onBoard.toZone, city: day.onBoard.toCity || where.end.city } : where.end;

  // When the day starts: the planned wake time after last night's sleep, or landing after a night on board.
  let wake;
  let afterNightOnBoard = null;
  if (before && before.onBoard) { afterNightOnBoard = before.onBoard; wake = before.onBoard.arrives; } else if (before) wake = later(bedOf(trip, before), trip.sleep.hours);
  else wake = usualWakeAt(trip, day.date);

  // ---- Light
  const move = next ? next.clock - day.clock : 0;
  const goingLater = move < -0.05;
  const lightPlace = where.end;
  const landing = where.flights.length ? where.flights[where.flights.length - 1].arrives : null;
  const landsToday = landing && !day.onBoard && wallClock(landing, lightPlace.zone).date === day.date;
  const allowed = roundIn(later(bodyWake, RULES.lightAfterBodyWake), lightPlace.zone, { up: true });
  let light;
  if (landsToday) {
    const out = roundIn(later(landing, RULES.afterLanding), lightPlace.zone, { up: true });
    const morningEnds = later(allowed, RULES.lightHours);
    const z = lightPlace.zone;
    if (goingLater) light = step('light', out, lightPlace, 'Get daylight from landing until dark.', { bright: span(out, bed) });
    else if (Math.abs(move) <= 0.05 && out >= allowed) light = step('light', out, lightPlace, 'Get daylight from landing.', { bright: span(out, later(out, RULES.lightHours)) });
    else if (out >= morningEnds) light = step('light', out, lightPlace, 'Keep the light low from landing until bedtime.', { low: span(out, bed) });
    else if (out >= allowed) light = step('light', out, lightPlace, `Get daylight from landing until ${hhmm(morningEnds, z)}.`, { bright: span(out, morningEnds) });
    else light = step('light', allowed, lightPlace, `Wear sunglasses until ${hhmm(allowed, z)}, then get daylight until ${hhmm(morningEnds, z)}.`, { bright: span(allowed, morningEnds), low: span(out, allowed) });
  } else if (goingLater) {
    const place = zoneAt(where, later(bed, -1));
    if (place.zone === homeZone) {
      // The evening: from 3.5 hours before the usual bedtime, or before tonight's if that's earlier.
      const usualEvening = roundIn(instantAt(day.date, timeOfHours(trip.sleep.bed - RULES.eveningBeforeUsualBed), place.zone), place.zone);
      const tonight = roundIn(later(bed, -RULES.eveningBeforeUsualBed), place.zone);
      const from = tonight < usualEvening ? tonight : usualEvening;
      light = step('light', from, place, 'Keep the lights bright until bedtime.', { bright: span(from, bed) });
    } else {
      const lowUntil = roundIn(later(bodyWake, RULES.lowAfterBodyWake), place.zone);
      const from = roundIn(later(bodyWake, RULES.daylightAfterBodyWake), place.zone);
      const words = lowUntil > wake ? `Keep the light low until ${hhmm(lowUntil, place.zone)}, then get daylight from ${hhmm(from, place.zone)}.` : `Get daylight from ${hhmm(from, place.zone)}.`;
      light = step('light', from, place, words, { bright: span(from, bed), low: span(wake, lowUntil) });
    }
  } else {
    const place = zoneAt(where, wake);
    const until = later(allowed, RULES.lightHours);
    const dim = day.phase === 'turn' ? `, and dim the lights from ${hhmm(roundIn(later(bed, -RULES.dimBeforeBed), place.zone), place.zone)}` : '';
    if (allowed <= wake) light = step('light', wake, place, `${afterNightOnBoard ? 'Get daylight from landing' : 'Get bright light as soon as you’re up'}${dim}.`, { bright: span(wake, later(wake, RULES.lightHours)) });
    else if (afterNightOnBoard) light = step('light', allowed, place, `Wear sunglasses until ${hhmm(allowed, place.zone)}, then get daylight until ${hhmm(until, place.zone)}${dim}.`, { bright: span(allowed, until), low: span(wake, allowed) });
    else if (allowed - wake <= HOUR) light = step('light', allowed, place, `Get daylight as soon as it’s light${dim}.`, { bright: span(allowed, until) });
    else light = step('light', allowed, place, `Keep the light low until ${hhmm(allowed, place.zone)}, then get daylight until ${hhmm(until, place.zone)}${dim}.`, { bright: span(allowed, until), low: span(wake, allowed) });
  }
  light.bodyWake = bodyWake.toISOString();
  steps.push(light);

  // ---- Caffeine: 9 hours before that night's bedtime.
  if (!trip.noCaffeine) {
    const by = later(bed, -RULES.caffeineHours);
    const place = zoneAt(where, by);
    steps.push(step('caffeine', by, place, `Have your last caffeine by ${hhmm(by, place.zone)}.`));
  }

  // ---- Sleep
  const getUp = later(bed, trip.sleep.hours);
  if (day.onBoard) {
    steps.push({ ...step('sleep', bed, sleepPlace, 'Sleep as soon as you can after take-off.'), time: null, label: 'On board', onBoard: true, wake: null });
  } else {
    const t = hhmm(bed, sleepPlace.zone);
    const usual = trip.sleep.start;
    const diff = minutesBetween(t, usual) / 60; // + later than usual
    const flewToday = where.flights.length > 0;
    const nightBeforeFlight = Boolean(next && next.phase === 'out');
    const shifting = day.phase === 'before' || day.phase === 'turn';
    // Away and still behind, the body wakes early: it's fine to rest in the dark.
    const wakesEarly = day.phase === 'away' && later(bodyWake, 24) < later(getUp, -0.75);
    let words;
    if (flewToday) words = `Stay awake on the flight, and go to bed at ${t}`;
    else if (diff === 0 && !wakesEarly) words = `Go to bed at your usual ${usual}`;
    else if (shifting) words = `Go to bed ${hoursWords(diff)} ${diff > 0 ? 'later' : 'earlier'} than usual${nightBeforeFlight || day.phase === 'turn' ? '' : `, and get up at ${hhmm(getUp, sleepPlace.zone)}`}`;
    else words = `Go to bed at ${t}`;
    if (wakesEarly && !flewToday) words += ', and rest in the dark if you wake early';
    words += '.';
    steps.push({ ...step('sleep', bed, sleepPlace, words), wake: hhmm(getUp, sleepPlace.zone) });
  }

  // ---- Key moments, in their own city's time
  for (const m of trip.moments) {
    if (day.date < m.startsOn || day.date > m.endsOn) continue;
    const place = { zone: m.zone, city: m.city };
    const first = day.date === m.startsOn;
    const at = first ? m.at : null;
    steps.push({
      ...step('moment', at, place, first ? (at ? `${m.name} starts.` : `${m.name} is today.`) : `${m.name} carries on today.`),
      momentId: m.id,
      number: m.number,
      name: m.name,
    });
  }

  steps.sort(byTime);
  for (const s of steps) s.showZone = twoZones && !s.onBoard;
  return { steps, twoZones, where, bed, wake };
}

const span = (from, to) => ({ from: from.toISOString(), to: to.toISOString() });

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
