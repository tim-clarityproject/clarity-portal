// "Where is it?" (Phase 8b, Claude's call): a city and its IANA time zone,
// so the Travel plan can be offered for a moment in another time zone.
// Built on the portal's one time library (src/lib/time): the cities are the
// place names of the time zones the device knows, each read the way
// zones.js reads it, so no second list of zones is kept here. A zone that is
// a state's sub-area or a region (America/Indiana/Knox) is left out: its
// main city is in the list. A city with no zone of its own (Manchester,
// Boston) isn't found yet; the Travel plan's fuller city list can join here.

import { isZone, mainCityZone, zoneLabel } from '../time/index.js';

let all = null;

/** Every city the search can find: [{ city, zone, line }], A to Z. */
export function cities() {
  if (all) return all;
  let zones = [];
  try {
    zones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  } catch {
    zones = [];
  }
  const seen = new Set();
  all = zones
    .filter((z) => isZone(z) && z.includes('/') && !z.startsWith('Etc/') && mainCityZone(z) === z && z.split('/').length === 2)
    .map((zone) => ({ city: zone.split('/').pop().replace(/_/g, ' '), zone, line: zoneLabel(zone) }))
    .filter((c) => (seen.has(c.city) ? false : seen.add(c.city)))
    .sort((a, b) => a.city.localeCompare(b.city));
  return all;
}

const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

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
