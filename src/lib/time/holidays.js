// Public holidays in the client's country (time-zone-safeguards.md, rule
// 13): Thanksgiving, 4 July, Canada Day and UK bank holidays fall on
// different days, so a booking on one is flagged before it's confirmed:
// "That’s Thanksgiving in the US".
//
// The dates come from the date-holidays package (pinned in package.json),
// loaded only when a booking is checked, so it is never part of the
// portal's first load. Its holiday data is under CC-BY-SA-4.0: the credit
// is in docs/credits.md, and goes in the help page's footer when that page
// is built (HOLIDAY_DATA_CREDIT below).
import { instantAt, mustBeDay, wallClock } from './instants.js';
import { countryWords, isZone, zoneCountry } from './zones.js';

let load = null;
const library = () => {
  if (!load) load = import('date-holidays').then((m) => m.default || m);
  return load;
};

/**
 * A holiday's name as the portal writes it: the day a holiday is moved to
 * when it falls on a weekend reads "(observed)", never the package's
 * "(substitute day)" (Claude's call, 11 Nov, 08:25).
 */
// (Spaces are made single first, so a very long name is read once through; said twice, it is written once.)
export const holidayName = (name) => String(name ?? '').replace(/\s+/g, ' ').replace(/ ?\((?:substitute day|substitute|observed)\)/gi, ' (observed)').replace(/(?: \(observed\))+/g, ' (observed)').replace(/ {2,}/g, ' ').trim();

/**
 * The public holiday on a day in a country, or null.
 * @param {string} day      'YYYY-MM-DD', the day in the client's own zone
 * @param {string} country  'US', 'CA', 'GB'… (the client's country)
 * @param {string} [region] a state, province or nation ('NY', 'ON', 'SCT'), when known
 * @returns {Promise<{ name: string, country: string } | null>}
 */
export async function publicHolidayOn(day, country, region) {
  if (typeof country !== 'string' || !country) return null;
  mustBeDay(day);
  // "us" is the US: the package takes either, and the words (countryWords) know only capitals.
  country = country.toUpperCase();
  const Holidays = await library();
  const hd = region ? new Holidays(country, region, { languages: ['en'] }) : new Holidays(country, { languages: ['en'] });
  // Noon on the day by the country's own clock, which is how the package
  // reads a day. Never the device's noon: from the UK that is already the
  // next day in New Zealand, and from Sydney still the day before in the US.
  const zone = hd.getTimezones()?.[0];
  const [y, m, d] = String(day).split('-').map(Number);
  const found = hd.isHoliday(isZone(zone) ? instantAt(day, '12:00', zone) : new Date(y, m - 1, d, 12));
  const list = Array.isArray(found) ? found : [];
  const holiday = list.find((h) => h.type === 'public') || null;
  return holiday ? { name: holidayName(holiday.name), country } : null;
}

/** The public holiday a call falls on for the client, from its instant and their zone. */
export async function publicHolidayFor(instant, clientZone, { country = zoneCountry(clientZone), region } = {}) {
  return publicHolidayOn(wallClock(instant, clientZone).date, country, region);
}

/** "That’s Thanksgiving in the US": shown before a booking on a holiday is confirmed. */
export const holidayLine = (holiday) => (holiday ? `That’s ${holiday.name === 'Thanksgiving Day' ? 'Thanksgiving' : holiday.name} in ${countryWords(holiday.country)}.` : null);

/**
 * The credit the holiday data's licence asks for (CC-BY-SA-4.0): shown in
 * docs/credits.md, and in the help page's footer once the help page exists.
 */
export const HOLIDAY_DATA_CREDIT = Object.freeze({
  text: 'Public holiday dates come from date-holidays by commenthol and its contributors, used under the Creative Commons Attribution-ShareAlike 4.0 licence.',
  source: 'https://github.com/commenthol/date-holidays',
  licence: 'https://creativecommons.org/licenses/by-sa/4.0/',
});
