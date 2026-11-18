// "Where are you flying?" (M21 version 7.2, Flight out): From and To search
// airports by city, name or 3-letter code, each with its place-name time
// zone (time zone rule 2: never an offset). M21's own list, as its search
// draws it, with every city the portal's one time library knows after it
// (src/lib/peakMoments/places.js), so a city with no airport here is still
// found. M21's note asks for "every airport with scheduled flights (about
// 4,000, from a free open list)": that list is a later step; the search
// below takes it unchanged.

import { searchCities } from '../peakMoments/places.js';

// [code, name, city, country, zone]
const LIST = [
  ['LHR', 'London Heathrow', 'London', 'United Kingdom', 'Europe/London'],
  ['LGW', 'London Gatwick', 'London', 'United Kingdom', 'Europe/London'],
  ['LCY', 'London City', 'London', 'United Kingdom', 'Europe/London'],
  ['STN', 'London Stansted', 'London', 'United Kingdom', 'Europe/London'],
  ['MAN', 'Manchester', 'Manchester', 'United Kingdom', 'Europe/London'],
  ['EDI', 'Edinburgh', 'Edinburgh', 'United Kingdom', 'Europe/London'],
  ['DUB', 'Dublin', 'Dublin', 'Ireland', 'Europe/Dublin'],
  ['JFK', 'New York JFK', 'New York', 'United States', 'America/New_York'],
  ['EWR', 'Newark', 'New York', 'United States', 'America/New_York'],
  ['LGA', 'New York LaGuardia', 'New York', 'United States', 'America/New_York'],
  ['NAS', 'Nassau', 'Nassau', 'Bahamas', 'America/Nassau'],
  ['BOS', 'Boston Logan', 'Boston', 'United States', 'America/New_York'],
  ['STL', 'St Louis Lambert', 'St Louis', 'United States', 'America/Chicago'],
  ['MCI', 'Kansas City', 'Kansas City', 'United States', 'America/Chicago'],
  ['PIT', 'Pittsburgh', 'Pittsburgh', 'United States', 'America/New_York'],
  ['CLT', 'Charlotte Douglas', 'Charlotte', 'United States', 'America/New_York'],
  ['RDU', 'Raleigh-Durham', 'Raleigh', 'United States', 'America/New_York'],
  ['ORD', 'Chicago O’Hare', 'Chicago', 'United States', 'America/Chicago'],
  ['LAX', 'Los Angeles', 'Los Angeles', 'United States', 'America/Los_Angeles'],
  ['SFO', 'San Francisco', 'San Francisco', 'United States', 'America/Los_Angeles'],
  ['DXB', 'Dubai', 'Dubai', 'United Arab Emirates', 'Asia/Dubai'],
  ['DOH', 'Doha', 'Doha', 'Qatar', 'Asia/Qatar'],
  ['SIN', 'Singapore Changi', 'Singapore', 'Singapore', 'Asia/Singapore'],
  ['HKG', 'Hong Kong', 'Hong Kong', 'China', 'Asia/Hong_Kong'],
  ['NRT', 'Tokyo Narita', 'Tokyo', 'Japan', 'Asia/Tokyo'],
  ['HND', 'Tokyo Haneda', 'Tokyo', 'Japan', 'Asia/Tokyo'],
  ['SYD', 'Sydney', 'Sydney', 'Australia', 'Australia/Sydney'],
  ['JNB', 'Johannesburg', 'Johannesburg', 'South Africa', 'Africa/Johannesburg'],
  ['CPT', 'Cape Town', 'Cape Town', 'South Africa', 'Africa/Johannesburg'],
  ['NBO', 'Nairobi', 'Nairobi', 'Kenya', 'Africa/Nairobi'],
  ['CDG', 'Paris Charles de Gaulle', 'Paris', 'France', 'Europe/Paris'],
  ['AMS', 'Amsterdam Schiphol', 'Amsterdam', 'Netherlands', 'Europe/Amsterdam'],
  ['FRA', 'Frankfurt', 'Frankfurt', 'Germany', 'Europe/Berlin'],
  ['MAD', 'Madrid', 'Madrid', 'Spain', 'Europe/Madrid'],
  ['GRU', 'São Paulo', 'São Paulo', 'Brazil', 'America/Sao_Paulo'],
  ['YYZ', 'Toronto Pearson', 'Toronto', 'Canada', 'America/Toronto'],
  ['DEL', 'Delhi', 'Delhi', 'India', 'Asia/Kolkata'],
  ['BOM', 'Mumbai', 'Mumbai', 'India', 'Asia/Kolkata'],
];

/** M21's display name: the airport's name, with ", CODE" when the name doesn't already hold it. */
export const airportName = (name, code) => (code && !String(name).includes(code) ? `${name}, ${code}` : name);

export const AIRPORTS = LIST.map(([code, name, city, country, zone]) => ({
  key: code, code, name: airportName(name, code), city, country, zone, line: `${city}, ${country}`,
}));

const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** A place by its key (an airport's code, or a city's zone). */
export function placeByKey(key) {
  return AIRPORTS.find((a) => a.key === key) || null;
}

/**
 * What the From and To boxes find (M21's aptFind): an airport whose code is
 * what was typed, or whose name holds it, or whose city or country starts
 * with it; then the cities the time library knows. At most `limit`.
 */
export function searchPlaces(query, limit = 6) {
  const q = fold(query);
  if (!q) return [];
  const found = AIRPORTS.filter((a) => fold(a.code) === q || fold(a.name).includes(q) || fold(a.city).startsWith(q) || fold(a.country).startsWith(q));
  const cities = new Set(found.map((a) => fold(a.city)));
  const more = q.length >= 2
    ? searchCities(query, limit).filter((c) => !cities.has(fold(c.city))).map((c) => ({ key: c.zone, code: null, name: c.city, city: c.city, country: null, zone: c.zone, line: c.line }))
    : [];
  return [...found, ...more].slice(0, limit);
}
