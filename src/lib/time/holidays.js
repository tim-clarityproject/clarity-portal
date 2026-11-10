// Public holidays in the client's country (time-zone-safeguards.md, rule
// 13): Thanksgiving, 4 July, Canada Day and UK bank holidays fall on
// different days, so a booking on one is flagged before it's confirmed:
// "That’s Thanksgiving in the US".
//
// The dates come from the date-holidays package (pinned in package.json),
// loaded only when a booking is checked, so it is never part of the
// portal's first load.
import { wallClock } from './instants.js';
import { countryWords, zoneCountry } from './zones.js';

let load = null;
const library = () => {
  if (!load) load = import('date-holidays').then((m) => m.default || m);
  return load;
};

/**
 * The public holiday on a day in a country, or null.
 * @param {string} day      'YYYY-MM-DD', the day in the client's own zone
 * @param {string} country  'US', 'CA', 'GB'… (the client's country)
 * @param {string} [region] a state, province or nation ('NY', 'ON', 'SCT'), when known
 * @returns {Promise<{ name: string, country: string } | null>}
 */
export async function publicHolidayOn(day, country, region) {
  if (!country) return null;
  const Holidays = await library();
  const hd = region ? new Holidays(country, region, { languages: ['en'] }) : new Holidays(country, { languages: ['en'] });
  const [y, m, d] = String(day).split('-').map(Number);
  // Noon on the day, read as the country's own calendar day.
  const found = hd.isHoliday(new Date(y, m - 1, d, 12));
  const list = Array.isArray(found) ? found : [];
  const holiday = list.find((h) => h.type === 'public') || null;
  return holiday ? { name: holiday.name, country } : null;
}

/** The public holiday a call falls on for the client, from its instant and their zone. */
export async function publicHolidayFor(instant, clientZone, { country = zoneCountry(clientZone), region } = {}) {
  return publicHolidayOn(wallClock(instant, clientZone).date, country, region);
}

/** "That’s Thanksgiving in the US": shown before a booking on a holiday is confirmed. */
export const holidayLine = (holiday) => (holiday ? `That’s ${holiday.name === 'Thanksgiving Day' ? 'Thanksgiving' : holiday.name} in ${countryWords(holiday.country)}.` : null);
