import { clockWords, isZone, offsetMinutes, zonePlace } from '../time/index.js';
import { CURRENCY, CURRENCY_LIST } from './currency.js';

// Where the client is based and the currency they settle in, typed as words (Polish 1, Stage C; M28 version 6's "Where
// is Sam based?" and "Which currency will Sam settle in?"). A city or country gives a place-name time zone and the time
// there now, through src/lib/time (nothing here works out an offset or a clock for itself); a currency or a country
// gives one of the 15 currencies an agreement can be in (currency.js; 065's currency_ok()). Plain rules with no window,
// checked by tests/performance/agreements-questions.test.mjs.

/** The places M28 lists, then the zone each is in: [label, zone]. Any other zone the device knows is found by its city. */
export const PLACES = Object.freeze([
  ['London, UK', 'Europe/London'], ['Manchester, UK', 'Europe/London'], ['Birmingham, UK', 'Europe/London'], ['Edinburgh, UK', 'Europe/London'],
  ['Glasgow, UK', 'Europe/London'], ['Cardiff, UK', 'Europe/London'], ['Belfast, UK', 'Europe/London'], ['Bristol, UK', 'Europe/London'],
  ['Leeds, UK', 'Europe/London'], ['Dublin, Ireland', 'Europe/Dublin'], ['Paris, France', 'Europe/Paris'], ['Amsterdam, Netherlands', 'Europe/Amsterdam'],
  ['Brussels, Belgium', 'Europe/Brussels'], ['Berlin, Germany', 'Europe/Berlin'], ['Munich, Germany', 'Europe/Berlin'], ['Madrid, Spain', 'Europe/Madrid'],
  ['Barcelona, Spain', 'Europe/Madrid'], ['Lisbon, Portugal', 'Europe/Lisbon'], ['Rome, Italy', 'Europe/Rome'], ['Milan, Italy', 'Europe/Rome'],
  ['Zurich, Switzerland', 'Europe/Zurich'], ['Geneva, Switzerland', 'Europe/Zurich'], ['Vienna, Austria', 'Europe/Vienna'], ['Stockholm, Sweden', 'Europe/Stockholm'],
  ['Oslo, Norway', 'Europe/Oslo'], ['Copenhagen, Denmark', 'Europe/Copenhagen'], ['Helsinki, Finland', 'Europe/Helsinki'], ['Warsaw, Poland', 'Europe/Warsaw'],
  ['Athens, Greece', 'Europe/Athens'], ['Istanbul, Turkey', 'Europe/Istanbul'], ['Dubai, United Arab Emirates', 'Asia/Dubai'], ['Abu Dhabi, United Arab Emirates', 'Asia/Dubai'],
  ['Doha, Qatar', 'Asia/Qatar'], ['Riyadh, Saudi Arabia', 'Asia/Riyadh'], ['Mumbai, India', 'Asia/Kolkata'], ['Delhi, India', 'Asia/Kolkata'],
  ['Bangalore, India', 'Asia/Kolkata'], ['Singapore', 'Asia/Singapore'], ['Hong Kong', 'Asia/Hong_Kong'], ['Shanghai, China', 'Asia/Shanghai'],
  ['Tokyo, Japan', 'Asia/Tokyo'], ['Seoul, South Korea', 'Asia/Seoul'], ['Sydney, Australia', 'Australia/Sydney'], ['Melbourne, Australia', 'Australia/Melbourne'],
  ['Brisbane, Australia', 'Australia/Brisbane'], ['Perth, Australia', 'Australia/Perth'], ['Auckland, New Zealand', 'Pacific/Auckland'], ['Wellington, New Zealand', 'Pacific/Auckland'],
  ['Johannesburg, South Africa', 'Africa/Johannesburg'], ['Cape Town, South Africa', 'Africa/Johannesburg'], ['Lagos, Nigeria', 'Africa/Lagos'], ['Nairobi, Kenya', 'Africa/Nairobi'],
  ['Cairo, Egypt', 'Africa/Cairo'], ['New York, USA', 'America/New_York'], ['Boston, USA', 'America/New_York'], ['Washington, USA', 'America/New_York'],
  ['Miami, USA', 'America/New_York'], ['Chicago, USA', 'America/Chicago'], ['Dallas, USA', 'America/Chicago'], ['Denver, USA', 'America/Denver'],
  ['Los Angeles, USA', 'America/Los_Angeles'], ['San Francisco, USA', 'America/Los_Angeles'], ['Seattle, USA', 'America/Los_Angeles'], ['Toronto, Canada', 'America/Toronto'],
  ['Montreal, Canada', 'America/Toronto'], ['Vancouver, Canada', 'America/Vancouver'], ['Calgary, Canada', 'America/Edmonton'], ['Mexico City, Mexico', 'America/Mexico_City'],
  ['São Paulo, Brazil', 'America/Sao_Paulo'], ['Buenos Aires, Argentina', 'America/Argentina/Buenos_Aires'],
]);

const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Every zone the device knows, once a visit (a test or an older device without the list gets M28's places only). */
let deviceZones = null;
const allZones = () => {
  if (deviceZones) return deviceZones;
  try { deviceZones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone').filter((z) => isZone(z)) : []; } catch { deviceZones = []; }
  return deviceZones;
};

/**
 * The places that match what's typed, best first, at most `limit`: [{ label, zone }]. A country gives its cities from
 * M28's list ("Canada": Toronto, Montreal, Vancouver, Calgary); a city not on it, any zone the device knows by its city
 * ("Lima" gives America/Lima as "Lima"). Nothing when nothing is typed.
 */
export function findPlaces(query, limit = 6) {
  const q = fold(query);
  if (!q) return [];
  const listed = PLACES.filter(([label]) => fold(label).split(/,\s*/).some((part) => part.startsWith(q)) || fold(label).includes(q))
    .sort((a, b) => Number(!fold(a[0]).startsWith(q)) - Number(!fold(b[0]).startsWith(q)));
  const out = listed.map(([label, zone]) => ({ label, zone }));
  if (out.length < limit) {
    const known = new Set(out.map((p) => p.zone));
    for (const zone of allZones()) {
      if (out.length >= limit) break;
      const city = zonePlace(zone);
      // A zone read as another's city (America/Iqaluit as Toronto) is left out where that city is listed already.
      if (known.has(zone) || !fold(city).startsWith(q) || out.some((p) => fold(p.label).split(',')[0] === fold(city))) continue;
      out.push({ label: city, zone });
      known.add(zone);
    }
  }
  return out.slice(0, limit);
}

/** "GMT+5:30" for an offset in minutes; "GMT" for none (the time zone's offset as M28 writes it). */
export function offsetWords(minutes) {
  const m = Math.round(Number(minutes) || 0);
  if (!m) return 'GMT';
  const sign = m > 0 ? '+' : '−';
  const h = Math.floor(Math.abs(m) / 60);
  const r = Math.abs(m) % 60;
  return `GMT${sign}${h}${r ? `:${String(r).padStart(2, '0')}` : ''}`;
}

/** "GMT−5, 09:32 there now" (M28's tzInfo), through src/lib/time. '' for a zone that isn't one. */
export function placeLine(zone, now = new Date()) {
  if (!isZone(zone)) return '';
  return `${offsetWords(offsetMinutes(now, zone))}, ${clockWords(now, zone)} there now`;
}

/** The label a saved zone reads as when no place was typed for it ("London, UK" for Europe/London). */
export function placeLabel(zone) {
  const listed = PLACES.find(([, z]) => z === zone);
  return listed ? listed[0] : isZone(zone) ? zonePlace(zone) : '';
}

// ---------------------------------------------------------------- currencies

/** Countries (and a few other words people type) to their currency, for the 15 an agreement can be in (M28's CTRY). */
const COUNTRY_CURRENCY = Object.freeze({
  'united kingdom': 'GBP', uk: 'GBP', britain: 'GBP', england: 'GBP', scotland: 'GBP', wales: 'GBP', 'northern ireland': 'GBP', sterling: 'GBP',
  ireland: 'EUR', france: 'EUR', germany: 'EUR', spain: 'EUR', italy: 'EUR', netherlands: 'EUR', portugal: 'EUR', belgium: 'EUR', austria: 'EUR',
  finland: 'EUR', greece: 'EUR', luxembourg: 'EUR', europe: 'EUR',
  'united states': 'USD', usa: 'USD', us: 'USD', america: 'USD', canada: 'CAD', australia: 'AUD', 'new zealand': 'NZD', switzerland: 'CHF',
  'united arab emirates': 'AED', uae: 'AED', dubai: 'AED', 'abu dhabi': 'AED', singapore: 'SGD', 'hong kong': 'HKD', sweden: 'SEK', norway: 'NOK',
  denmark: 'DKK', 'south africa': 'ZAR', japan: 'JPY',
});

/** A currency's name as a list shows it: "Canadian dollars, CAD". */
export const currencyName = (c) => (CURRENCY[c] ? `${CURRENCY[c].name.charAt(0).toUpperCase()}${CURRENCY[c].name.slice(1)}, ${c}` : c);

/**
 * The currencies that match what's typed (a name, a code, a symbol or a country), pounds first when it fits:
 * [{ code, label, symbol }], at most `limit`. Only the 15 an agreement can be in (currency.js).
 */
export function findCurrencies(query, limit = 6) {
  const q = fold(query);
  if (!q) return [];
  const hits = new Set();
  for (const [country, code] of Object.entries(COUNTRY_CURRENCY)) if (country.startsWith(q) || (q.length > 3 && country.includes(q))) hits.add(code);
  for (const code of CURRENCY_LIST) {
    const name = fold(CURRENCY[code].name);
    const words = name.split(/\s+/);
    if (code.toLowerCase().startsWith(q) || name.startsWith(q) || words.some((w) => w.startsWith(q)) || (q.length > 1 && fold(CURRENCY[code].symbol).trim() === q)) hits.add(code);
    if (/^pound|^sterling|^gbp|^british/.test(q) && code === 'GBP') hits.add(code);
    if (/^dollar/.test(q) && ['USD', 'CAD', 'AUD', 'NZD', 'SGD', 'HKD'].includes(code)) hits.add(code);
  }
  return CURRENCY_LIST.filter((c) => hits.has(c)).slice(0, limit).map((code) => ({ code, label: currencyName(code), symbol: CURRENCY[code].symbol.trim() }));
}
