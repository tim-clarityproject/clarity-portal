// The Travel plan (M21 version 7.2; Phase 8b Part B). Pure: no React, no
// database. The screens hand over the trip and get back the whole plan;
// docs/travel-plan-method.md explains every rule.
import { addDays, clockChanges, dayKeyWords, instantAt, offsetMinutes, wallClock } from '../time/index.js';
import { RULES, HOUR, nearestFive } from './rules.js';
import { readTrip, differenceAt, differenceOn, whereOn, zoneOfAt } from './trip.js';
import { bodyClockDays, inTheAir, usualBedAt, usualWakeAt } from './clock.js';
import { stepsFor, roundIn, caffeineWords, onAPlane } from './steps.js';

const round1 = (x) => Math.round(x * 10) / 10 || 0;

/** "London time, GMT", "New York time, GMT −5", "Mumbai time, GMT +5:30" (true minus sign). */
export function levelLabel(city, zone, at) {
  const off = offsetMinutes(at, zone);
  if (off === 0) return `${city} time, GMT`;
  const h = Math.floor(Math.abs(off) / 60);
  const m = Math.abs(off) % 60;
  return `${city} time, GMT ${off < 0 ? '−' : '+'}${h}${m ? `:${String(m).padStart(2, '0')}` : ''}`;
}

/**
 * Whether a trip is short: 2 nights away or fewer, or 2 hours' difference
 * or less. A short trip stays on home time, with no day-by-day plan.
 * @returns {{ short: boolean, reason: 'nights'|'difference'|null, nights: number, difference: number }}
 */
export function shortTrip(input) {
  const trip = input && input.legs && input.base ? input : readTrip(input);
  const difference = differenceAt(trip.flightOut.arrives, trip.base.zone, trip.away.zone);
  if (trip.nights <= RULES.shortNights) return { short: true, reason: 'nights', nights: trip.nights, difference };
  if (Math.abs(difference) <= RULES.shortHours) return { short: true, reason: 'difference', nights: trip.nights, difference };
  return { short: false, reason: null, nights: trip.nights, difference };
}

/** The % read-out's words for a day (M21's adjWords). */
export function readoutFor({ clock, difference, comingBack }, { home, away }) {
  const share = difference ? clock / difference : 0;
  const p = nearestFive(share);
  if (!comingBack) {
    if (p >= 100) return { percent: 100, back: null, words: `Body clock on ${away} time` };
    if (p <= 0) return { percent: 0, back: null, words: `Body clock on ${home} time` };
    return { percent: p, back: null, words: `Body clock ~${p}% adjusted to ${away} time` };
  }
  const b = 100 - p;
  if (b >= 100) return { percent: p, back: 100, words: `Body clock back on ${home} time` };
  return { percent: p, back: b, words: `Body clock ~${b}% back on ${home} time` };
}

function shapeDays(trip, clockDays, startIndex = 0) {
  const home = trip.base.city;
  const away = trip.away.city;
  return clockDays.map((day, i) => {
    const { steps, twoZones, where } = stepsFor(trip, day, { before: clockDays[i - 1] || null, next: clockDays[i + 1] || null });
    const comingBack = day.phase === 'flyHome' || day.phase === 'back';
    const readout = readoutFor({ clock: day.clock, difference: day.difference || differenceOn(trip.flightOut.arrivesOn, trip.base.zone, trip.away.zone), comingBack }, { home, away });
    const [, , d] = day.date.split('-').map(Number);
    return {
      index: startIndex + i,
      date: day.date,
      label: `${dayKeyWords(day.date).split(' ')[0]} ${d}`,
      title: dayKeyWords(day.date),
      phase: day.phase,
      places: where.places.filter((p, j, all) => all.findIndex((q) => q.zone === p.zone) === j),
      twoZones,
      zone: twoZones ? null : where.end.zone,
      city: twoZones ? null : where.end.city,
      clock: round1(day.clock),
      difference: day.difference,
      percent: readout.percent,
      back: readout.back,
      readout: readout.words,
      moments: steps.filter((s) => s.kind === 'moment').map((s) => s.momentId),
      steps,
      // Kept so a replan can carry on from exactly where the clock is.
      engine: { clock: day.clock, target: day.target, sleepShift: day.sleepShift, onBoard: day.onBoard ? day.onBoard.departs.toISOString() : null, boardSleep: day.boardSleep ? day.boardSleep.toISOString() : null },
    };
  });
}

function chartFor(trip, days) {
  const at = trip.flightOut.arrives;
  const D = differenceAt(at, trip.base.zone, trip.away.zone);
  const index = new Map(days.map((d, i) => [d.date, i]));
  return {
    home: { city: trip.base.city, zone: trip.base.zone, level: 0, label: levelLabel(trip.base.city, trip.base.zone, at) },
    away: { city: trip.away.city, zone: trip.away.zone, level: D, label: levelLabel(trip.away.city, trip.away.zone, at) },
    points: days.map((d, i) => ({ index: i, date: d.date, label: d.label, clock: d.clock, difference: d.difference, moment: d.moments.length > 0 })),
    markers: trip.moments.filter((m) => index.has(m.startsOn)).map((m) => ({ number: m.number, id: m.id, name: m.name, dayIndex: index.get(m.startsOn), date: m.startsOn, time: m.time, zone: m.zone, city: m.city })),
  };
}

function changesDuring(trip, from, to) {
  const start = instantAt(from, '00:00', trip.base.zone);
  const days = (instantAt(addDays(to, 1), '00:00', trip.base.zone) - start) / (24 * HOUR);
  const zones = [...new Map([trip.base, ...trip.stops.map((s) => ({ zone: s.zone, city: s.city }))].map((p) => [p.zone, p])).values()];
  return zones.flatMap((p) => clockChanges(p.zone, start, days).map((c) => ({ zone: p.zone, city: p.city, date: c.date, direction: c.direction, minutes: c.minutes, at: c.at.toISOString() })));
}

function base(trip, input) {
  return {
    home: { ...trip.base },
    away: { ...trip.away },
    stops: trip.stops.map((s) => ({ zone: s.zone, city: s.city, nights: s.nights })),
    nights: trip.nights,
    noCaffeine: trip.noCaffeine,
    usualSleep: { start: trip.sleep.start, end: trip.sleep.end },
    moments: trip.moments.map((m) => ({ number: m.number, id: m.id, name: m.name, startsOn: m.startsOn, endsOn: m.endsOn, time: m.time, zone: m.zone, city: m.city })),
    input: JSON.parse(JSON.stringify(input)),
  };
}

/**
 * A short trip: the key day's steps on local time, staying on home time,
 * with home time where it matters ("Turn the lights out, which is 22:00 in
 * London."). No chart and no day-by-day plan. The key day runs from
 * midnight to midnight where the person spends it: the usual home bedtime
 * and wake time that fall on it, in the order they come (going east, lights
 * out comes first, after midnight; going west, getting up comes first).
 */
function shortPlan(trip, input, check) {
  const firstAway = trip.flightOut.arrivesOn;
  const lastAway = trip.flightHome.departsOn;
  const inTrip = trip.moments.find((m) => m.startsOn >= firstAway && m.startsOn <= lastAway);
  const date = inTrip ? inTrip.startsOn : (addDays(firstAway, 1) <= lastAway ? addDays(firstAway, 1) : firstAway);
  const where = whereOn(trip, date);
  // Where the day is spent: the key moment's city, or before the flight home on the day it leaves.
  const momentPlace = inTrip && inTrip.startsOn === date && where.places.find((p) => p.zone === inTrip.zone);
  const place = momentPlace || (date === lastAway ? where.start : where.end);
  const home = trip.base.city;
  const homeZone = trip.base.zone;
  const sameTime = trip.legs.every((l) => offsetMinutes(l.departs, homeZone) === offsetMinutes(l.departs, l.toZone) && offsetMinutes(l.arrives, homeZone) === offsetMinutes(l.arrives, l.toZone));
  const inHome = (t) => wallClock(t, homeZone).time;
  const local = (t) => wallClock(t, place.zone).time;
  const onTheDay = (t) => wallClock(t, place.zone).date === date;
  const said = (words, t) => (sameTime ? `${words}.` : `${words}, which is ${inHome(t)} in ${home}.`);
  // The usual home bedtime and wake time that fall on the day where they are.
  // Going west, sleep moves later just enough that getting up is never
  // before 05:00 local time and lights out never after 01:00 (Tim, 18 Nov, 09:00).
  const moved = sleepMove(trip, date, place.zone, check.difference);
  const near = [-1, 0, 1].map((j) => addDays(date, j));
  const shifted = (t) => new Date(t.getTime() + moved.hours * HOUR);
  const bed = near.map((d) => shifted(usualBedAt(trip, d))).find(onTheDay) || shifted(usualBedAt(trip, date));
  const getUp = near.map((d) => shifted(usualWakeAt(trip, d))).find(onTheDay) || new Date(bed.getTime() + trip.sleep.hours * HOUR);
  // The night after getting up: caffeine and evening light are aimed at it.
  const nextBed = bed > getUp ? bed : new Date(bed.getTime() + 24 * HOUR);
  // Leaving after getting up: a night flight takes the night (asleep on board); after a day flight the night is at home, on the usual time.
  const leaving = where.flights.find((f) => f.departs > getUp && f.departs.getTime() - RULES.boardWindow * HOUR <= nextBed.getTime());
  const nightOnFlight = leaving && nextBed.getTime() <= leaving.arrives.getTime() - RULES.boardWindow * HOUR;
  const easterly = check.difference > 0;
  const steps = [];
  const mk = (kind, at, words, extra = {}) => ({ kind, at: at.toISOString(), time: local(at), zone: place.zone, city: place.city, showZone: false, words, ...extra });
  const homeTime = (t) => (sameTime ? {} : { homeTime: inHome(t) });
  if (!leaving || bed < getUp) steps.push(mk('sleep', bed, said('Turn the lights out', bed), homeTime(bed)));
  else if (nightOnFlight) steps.push({ ...mk('sleep', new Date(Math.max(leaving.departs.getTime() + RULES.sleepAfterTakeOff * HOUR, nextBed.getTime())), 'Sleep on the flight home.'), time: null, label: 'On board', onBoard: true });
  steps.push(mk('sleep', getUp, said('Get up', getUp), { ...homeTime(getUp), wake: true }));
  const lowFrom = roundIn(new Date(nextBed.getTime() - RULES.shortLowBeforeBed * HOUR), place.zone);
  if (easterly) {
    const from = roundIn(new Date(getUp.getTime() + RULES.shortDaylightAfterWake * HOUR), place.zone, { up: true });
    steps.push(mk('light', from, 'Get daylight from now, not first thing.', { bright: { from: from.toISOString(), to: lowFrom.toISOString() } }));
  } else {
    // Going west (or with no difference): daylight early in the day, but never in the local night.
    const firstLight = instantAt(date, RULES.shortFirstLight, place.zone);
    const from = getUp > firstLight ? getUp : firstLight;
    const words = from > getUp ? `Get daylight once it’s light, and keep the light low from ${local(lowFrom)}.` : `Get daylight early in your day, and keep the light low from ${local(lowFrom)}.`;
    steps.push(mk('light', from, words, { bright: { from: from.toISOString(), to: lowFrom.toISOString() } }));
  }
  if (!trip.noCaffeine) {
    const by = new Date(nextBed.getTime() - RULES.caffeineHours * HOUR);
    steps.push(mk('caffeine', by, caffeineWords(trip, by, local(by)), { onPlane: onAPlane(trip, by) }));
  }
  for (const m of trip.moments.filter((x) => x.startsOn === date)) {
    const words = m.at ? said(`${m.name} starts`, m.at) : `${m.name} is today.`;
    steps.push({ ...(m.at ? mk('moment', m.at, words) : { kind: 'moment', at: null, time: null, zone: m.zone, city: m.city, showZone: false, words }), momentId: m.id, number: m.number, name: m.name, homeTime: m.at && !sameTime ? inHome(m.at) : null, time: m.at ? wallClock(m.at, m.zone).time : null });
  }
  // Only what falls on the day, where the person is (the last caffeine may be on a flight): nothing before landing or after leaving.
  const kept = steps.filter((x) => x.kind === 'moment' || x.onBoard || (onTheDay(new Date(x.at)) && (x.kind === 'caffeine' || zoneOfAt(trip, new Date(x.at)) === place.zone)));
  steps.length = 0;
  steps.push(...kept);
  const rank = (x) => (x.onBoard ? Number.MAX_SAFE_INTEGER : x.at ? Date.parse(x.at) : -Infinity);
  steps.sort((a, b) => rank(a) - rank(b) || (a.kind === 'moment' ? -1 : b.kind === 'moment' ? 1 : 0));
  return {
    short: true,
    reason: check.reason,
    difference: check.difference,
    sameTime,
    ...base(trip, input),
    from: trip.flightOut.departsOn,
    to: trip.flightHome.arrivesOn,
    headline: sameTime ? 'There’s no time difference, so keep your usual times.' : `It’s a short trip, so stay on ${home} time.`,
    // The one line under the headline when sleep moves (null when it doesn't).
    sleepNote: moved.hours ? moved.note : null,
    sleepMoved: moved.hours,
    keyDay: { date, title: dayKeyWords(date), zone: place.zone, city: place.city, steps },
    days: [],
    chart: null,
    clockChanges: changesDuring(trip, trip.flightOut.departsOn, trip.flightHome.arrivesOn),
  };
}

/**
 * A short trip west: how far sleep moves later so that, on the key day's own
 * clock, getting up is no earlier than 05:00 and lights out no later than
 * 01:00 (RULES.shortWakeFrom, RULES.shortBedBy), and the line that says so,
 * with the real time it would have been ("Your sleep moves a little so
 * you’re not up at 02:00."). Going east, or with no difference, nothing moves.
 * @returns {{ hours: number, note: string|null }}
 */
export function sleepMove(trip, date, zone, difference) {
  if (!(difference < 0)) return { hours: 0, note: null };
  const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  // Minutes from b to a on the clock, -12 to +12 hours.
  const apart = (a, b) => { let d = toMin(a) - toMin(b); if (d > 720) d -= 1440; if (d <= -720) d += 1440; return d; };
  const wakeAt = wallClock(usualWakeAt(trip, date), zone).time;
  const bedAt = wallClock(usualBedAt(trip, date), zone).time;
  const early = apart(wakeAt, RULES.shortWakeFrom); // < 0: up too early
  if (early < 0) return { hours: -early / 60, note: `Your sleep moves a little so you’re not up at ${wakeAt}.` };
  const late = apart(bedAt, RULES.shortBedBy); // > 0: to bed too late
  if (late > 0) return { hours: -late / 60, note: `Your sleep moves a little so you’re not going to bed at ${bedAt}.` };
  return { hours: 0, note: null };
}

/**
 * Makes the whole plan.
 * @param {object} input
 *   flightOut, flightHome: { departsOn 'YYYY-MM-DD', departsAt 'HH:MM', fromCity, fromZone, arrivesOn, arrivesAt, toCity, toZone }
 *   legs?: more flights between them, same shape (a trip with several stops)
 *   keyMoments?: [{ id, name, startsOn, endsOn?, at?: 'HH:MM', city, zone }]
 *   usualSleep?: { start: 'HH:MM', end: 'HH:MM' } (23:00 to 07:00 when there's no check-in)
 *   noCaffeine?: boolean
 *   today?: 'YYYY-MM-DD' (marks today's day; nothing else changes)
 */
export function makeTravelPlan(input) {
  const trip = readTrip(input);
  const check = shortTrip(trip);
  if (check.short) return shortPlan(trip, input, check);
  const from = addDays(trip.flightOut.departsOn, -RULES.preDays);
  return finish(trip, input, check, shapeDays(trip, bodyClockDays(trip, { from, clock: 0 })));
}

function finish(trip, input, check, days) {
  const today = input.today || null;
  return {
    short: false,
    reason: null,
    difference: check.difference,
    direction: check.difference < 0 ? 'west' : 'east',
    ...base(trip, input),
    from: days[0].date,
    to: days[days.length - 1].date,
    today,
    todayIndex: today ? days.findIndex((d) => d.date === today) : -1,
    days,
    chart: chartFor(trip, days),
    clockChanges: changesDuring(trip, days[0].date, days[days.length - 1].date),
  };
}

/**
 * Reworks a plan from today onwards, from where the body clock is now, after
 * an edit (a flight moved, a key moment added or moved, no caffeine). Days
 * before today stay exactly as they were.
 * @param {object} plan   a plan from makeTravelPlan (or replanFrom)
 * @param {string} today  'YYYY-MM-DD' in the person's own zone
 * @param {object} [edits] any of the input's fields, replacing the plan's own
 */
export function replanFrom(plan, today, edits = {}) {
  const input = { ...plan.input, ...edits, today };
  const trip = readTrip(input);
  const check = shortTrip(trip);
  const kept = plan.short ? [] : plan.days.filter((d) => d.date < today);
  if (!kept.length) {
    // Not started yet: a new plan, from today at the earliest.
    if (check.short) return shortPlan(trip, input, check);
    const from = addDays(trip.flightOut.departsOn, -RULES.preDays);
    const start = today > from ? today : from;
    return finish(trip, input, check, shapeDays(trip, bodyClockDays(trip, { from: start, clock: 0 })));
  }
  // Under way: carry on from where the body clock is (a trip that has
  // become short keeps its day-by-day plan, since the clock has already moved).
  const last = kept[kept.length - 1];
  const before = {
    date: last.date,
    phase: last.phase,
    clock: last.engine.clock,
    target: last.engine.target,
    sleepShift: last.engine.sleepShift,
    onBoard: last.engine.onBoard ? trip.legs.find((f) => f.departs.toISOString() === last.engine.onBoard) || null : null,
    boardSleep: last.engine.boardSleep ? new Date(last.engine.boardSleep) : null,
    inAir: inTheAir(trip, last.date),
  };
  const fresh = bodyClockDays(trip, { from: today, clock: last.engine.clock, since: last.date });
  const shaped = shapeDays(trip, [before, ...fresh], kept.length - 1).slice(1);
  return finish(trip, input, check, [...kept, ...shaped]);
}
