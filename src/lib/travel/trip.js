// The trip itself: its flights, where home and away are, how many nights,
// and where the person is on each day. All time-zone work goes through the
// portal's one time library (src/lib/time): nothing here reads an offset
// any other way.
import { instantAt, offsetMinutes, mustBeZone, daysBetween } from '../time/index.js';
import { RULES, HOUR, hoursOf, wrapHours } from './rules.js';

function flightOf(f, name) {
  if (!f || typeof f !== 'object') throw new Error(`The ${name} is missing.`);
  mustBeZone(f.fromZone);
  mustBeZone(f.toZone);
  const departs = instantAt(f.departsOn, f.departsAt, f.fromZone);
  const arrives = instantAt(f.arrivesOn, f.arrivesAt, f.toZone);
  if (arrives.getTime() <= departs.getTime()) throw new Error(`The ${name} lands before it leaves.`);
  return {
    ...f,
    fromCity: String(f.fromCity || '').trim() || null,
    toCity: String(f.toCity || '').trim() || null,
    departs,
    arrives,
  };
}

/**
 * Checks and tidies what the screens hand over.
 * @param {object} input  { flightOut, flightHome, legs?, keyMoments?, usualSleep?, noCaffeine?, today? }
 */
export function readTrip(input) {
  if (!input || typeof input !== 'object') throw new Error('A trip needs its flights.');
  const out = flightOf(input.flightOut, 'flight out');
  const home = flightOf(input.flightHome, 'flight home');
  const between = (Array.isArray(input.legs) ? input.legs : []).map((l, i) => flightOf(l, `flight ${i + 2}`));
  const legs = [out, ...between, home].sort((a, b) => a.departs - b.departs);
  if (legs[0] !== out || legs[legs.length - 1] !== home) throw new Error('The flight out comes first and the flight home last.');
  for (let i = 1; i < legs.length; i += 1) {
    if (legs[i].departs < legs[i - 1].arrives) throw new Error('A flight leaves before the one before it lands.');
  }
  const sleep = input.usualSleep && input.usualSleep.start && input.usualSleep.end ? input.usualSleep : RULES.usualSleep;
  const bed = hoursOf(sleep.start);
  const wake = hoursOf(sleep.end);
  const sleepHours = ((wake - bed) % 24 + 24) % 24 || 8;
  const homeZone = out.fromZone;
  const homeCity = out.fromCity || home.toCity || cityOf(homeZone);

  // The stops, each with its nights; the plan follows the one with most.
  const stops = [];
  for (let i = 0; i < legs.length - 1; i += 1) {
    const nights = Math.max(0, daysBetween(legs[i].arrivesOn, legs[i + 1].departsOn));
    stops.push({ zone: legs[i].toZone, city: legs[i].toCity || cityOf(legs[i].toZone), nights, arrives: legs[i].arrives, leaves: legs[i + 1].departs });
  }
  const main = stops.reduce((best, s) => (s.nights > best.nights ? s : best), stops[0]);
  const nights = stops.reduce((n, s) => n + s.nights, 0);

  const moments = (Array.isArray(input.keyMoments) ? input.keyMoments : []).map((m, i) => {
    mustBeZone(m.zone);
    const startsOn = m.startsOn;
    const endsOn = m.endsOn || startsOn;
    const at = m.at ? instantAt(startsOn, m.at, m.zone) : null;
    return { id: m.id ?? `moment-${i + 1}`, name: String(m.name || '').trim() || 'Your event', startsOn, endsOn, time: m.at || null, at, city: m.city || cityOf(m.zone), zone: m.zone };
  });
  // Numbered in date, then time order (M21: the chart's markers and key).
  moments.sort((a, b) => (a.startsOn < b.startsOn ? -1 : a.startsOn > b.startsOn ? 1 : (a.at ? a.at.getTime() : -1) - (b.at ? b.at.getTime() : -1)));
  moments.forEach((m, i) => { m.number = i + 1; });

  return {
    legs,
    flightOut: out,
    flightHome: home,
    base: { zone: homeZone, city: homeCity },
    away: { zone: main.zone, city: main.city },
    stops,
    nights,
    moments,
    sleep: { start: sleep.start, end: sleep.end, bed, wake, hours: sleepHours },
    noCaffeine: Boolean(input.noCaffeine),
  };
}

/** "New York" from "America/New_York", only when the screens gave no city. */
export function cityOf(zone) {
  return String(zone).split('/').pop().replace(/_/g, ' ');
}

/** Away's clock minus home's, in hours, at an instant (New York from London in November: -5). */
export function differenceAt(instant, homeZone, awayZone) {
  return wrapHours((offsetMinutes(instant, awayZone) - offsetMinutes(instant, homeZone)) / 60);
}

/** The difference on a day, read at noon home time, so a clock change counts from its own day. */
export function differenceOn(date, homeZone, awayZone) {
  return differenceAt(instantAt(date, '12:00', homeZone), homeZone, awayZone);
}

/**
 * Where the person is on a day: the zone the day starts in, the flights
 * that leave that day, and the zone it ends in. A flight that lands after
 * midnight puts the next day in the place it lands.
 */
export function whereOn(trip, date) {
  let start = trip.base.zone;
  let startCity = trip.base.city;
  for (const leg of trip.legs) {
    if (leg.departsOn < date) { start = leg.toZone; startCity = leg.toCity || cityOf(leg.toZone); }
  }
  const flights = trip.legs.filter((l) => l.departsOn === date);
  const places = [{ zone: start, city: startCity }];
  for (const f of flights) places.push({ zone: f.toZone, city: f.toCity || cityOf(f.toZone) });
  const end = places[places.length - 1];
  return { start: places[0], end, places, flights };
}

/** The hours of a flight in the air. */
export const flightHours = (f) => (f.arrives - f.departs) / HOUR;

/** The zone the person is in at an instant, by the flights alone, or null on a plane. */
export function zoneOfAt(trip, t) {
  let zone = trip.base.zone;
  for (const f of trip.legs) {
    if (t > f.departs && t < f.arrives) return null;
    if (t >= f.arrives) zone = f.toZone;
  }
  return zone;
}
