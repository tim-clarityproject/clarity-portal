// "Where is it?" (Phase 8b, Claude's call): a city and its IANA time zone,
// so the Travel plan can be offered for a moment in another time zone.
// Built on the portal's one time library (src/lib/time): the cities are the
// place names of the time zones the device knows, each read the way
// zones.js reads it, so no second list of zones is kept here. A zone that is
// a state's sub-area or a region (America/Indiana/Knox) is read as its main
// city's. A device's older names are read by their current ones (Calcutta as
// Kolkata, Kiev as Kyiv, Saigon as Ho Chi Minh City: currentZone), and a few
// big cities with no zone of their own are added by hand (Delhi and Mumbai,
// on India's one clock). Others with no zone of their own (Manchester,
// Boston) aren't found yet; the Travel plan's fuller city list can join here.

import { currentZone, isZone, mainCityZone, zoneLabel, zonePlace } from '../time/index.js';

/** A city's own name where the zone's last part isn't how it is written. */
const CITY_NAMES = {
  'America/St_Johns': 'St John’s',
  'Asia/Ho_Chi_Minh': 'Ho Chi Minh City',
};

/** Big cities with no zone named after them, on another city's clock. */
const MORE_CITIES = [
  { city: 'Delhi', zone: 'Asia/Kolkata' },
  { city: 'Mumbai', zone: 'Asia/Kolkata' },
];

let all = null;

/** One city: its time's name as a second line only when it says something the city doesn't ("India time" under Kolkata, nothing under New York: 29ap). */
function entry(city, zone) {
  const line = zoneLabel(zone);
  return { city, zone, line, hint: zonePlace(zone) === city ? null : line };
}

/** Every city the search can find: [{ city, zone, line, hint }], A to Z. */
export function cities() {
  if (all) return all;
  let zones = [];
  try {
    zones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  } catch {
    zones = [];
  }
  const seen = new Set();
  const found = [...new Set(zones.map((z) => currentZone(mainCityZone(z))))]
    .filter((z) => isZone(z) && z.includes('/') && !z.startsWith('Etc/'))
    .map((zone) => entry(CITY_NAMES[zone] || zone.split('/').pop().replace(/_/g, ' '), zone));
  const more = MORE_CITIES.filter((c) => isZone(c.zone)).map((c) => entry(c.city, c.zone));
  all = [...found, ...more]
    .filter((c) => (seen.has(c.city) ? false : seen.add(c.city)))
    .sort((a, b) => a.city.localeCompare(b.city));
  return all;
}

const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, '').toLowerCase().trim();

/**
 * The cities whose name (or its time's name) starts with what was typed,
 * then those that contain it: at most `limit`. Nothing for fewer than 2 letters.
 */
export function searchCities(query, limit = 6) {
  const q = fold(query);
  if (q.length < 2) return [];
  const list = cities();
  const starts = [];
  const has = [];
  for (const c of list) {
    const name = fold(c.city);
    const time = fold(c.line);
    if (name.startsWith(q) || time.startsWith(q)) starts.push(c);
    else if (name.includes(q)) has.push(c);
  }
  return [...starts, ...has].slice(0, limit);
}
