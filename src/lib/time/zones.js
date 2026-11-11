// Time zones by place name (time-zone-safeguards.md, Tim, 10 Nov): the one
// place that knows what a zone is called, which country it is in and which
// clock its readers use. Part of src/lib/time, the portal's one time
// library; nothing else names a zone, guesses an offset or formats a time
// in someone else's zone.
//
// A zone is always an IANA place name ("America/New_York"), never a fixed
// offset ("-05:00") and never letters ("EST", which is used all year even
// in summer, and "IST", which is India, Ireland or Israel).

/** Zones whose plain name isn't their city: a country with one clock, or a name with punctuation. */
const PLACE_NAMES = {
  'Europe/London': 'UK',
  'Europe/Belfast': 'UK',
  'Europe/Jersey': 'UK',
  'Europe/Guernsey': 'UK',
  'Europe/Isle_of_Man': 'UK',
  'Europe/Dublin': 'Ireland',
  'Asia/Kolkata': 'India',
  'Asia/Calcutta': 'India',
  'America/St_Johns': 'St John’s',
  'Asia/Ho_Chi_Minh': 'Ho Chi Minh City',
  'Asia/Kathmandu': 'Nepal',
  'Asia/Katmandu': 'Nepal',
  'Asia/Singapore': 'Singapore',
  'Asia/Hong_Kong': 'Hong Kong',
  'Pacific/Honolulu': 'Hawaii',
  UTC: 'UTC',
  'Etc/UTC': 'UTC',
};

// The United States and Canada, by zone (the tz database's zone1970.tab
// and its older names): these readers see 12-hour times (rule 8).
const US_ZONES = new Set([
  'America/New_York', 'America/Detroit', 'America/Kentucky/Louisville', 'America/Kentucky/Monticello',
  'America/Indiana/Indianapolis', 'America/Indiana/Vincennes', 'America/Indiana/Winamac', 'America/Indiana/Marengo',
  'America/Indiana/Petersburg', 'America/Indiana/Vevay', 'America/Indiana/Tell_City', 'America/Indiana/Knox',
  'America/Chicago', 'America/Menominee', 'America/North_Dakota/Center', 'America/North_Dakota/New_Salem',
  'America/North_Dakota/Beulah', 'America/Denver', 'America/Boise', 'America/Phoenix', 'America/Los_Angeles',
  'America/Anchorage', 'America/Juneau', 'America/Sitka', 'America/Metlakatla', 'America/Yakutat', 'America/Nome',
  'America/Adak', 'Pacific/Honolulu',
  // older names still found on devices
  'America/Indianapolis', 'America/Louisville', 'America/Fort_Wayne', 'US/Eastern', 'US/Central', 'US/Mountain',
  'US/Pacific', 'US/Arizona', 'US/Alaska', 'US/Hawaii', 'US/Michigan', 'US/East-Indiana', 'US/Indiana-Starke',
  'US/Aleutian', 'America/Atka', 'America/Knox_IN', 'America/Shiprock', 'Pacific/Johnston',
]);
const CANADA_ZONES = new Set([
  'America/St_Johns', 'America/Halifax', 'America/Glace_Bay', 'America/Moncton', 'America/Goose_Bay',
  'America/Blanc-Sablon', 'America/Toronto', 'America/Iqaluit', 'America/Atikokan', 'America/Winnipeg',
  'America/Resolute', 'America/Rankin_Inlet', 'America/Regina', 'America/Swift_Current', 'America/Edmonton',
  'America/Cambridge_Bay', 'America/Inuvik', 'America/Creston', 'America/Dawson_Creek', 'America/Fort_Nelson',
  'America/Whitehorse', 'America/Dawson', 'America/Vancouver',
  // older names still found on devices
  'America/Montreal', 'America/Nipigon', 'America/Thunder_Bay', 'America/Rainy_River', 'America/Pangnirtung',
  'America/Yellowknife', 'America/Coral_Harbour', 'Canada/Atlantic', 'Canada/Central', 'Canada/Eastern', 'Canada/Mountain',
  'Canada/Newfoundland', 'Canada/Pacific', 'Canada/Saskatchewan', 'Canada/Yukon',
]);

// Countries for the places clients are most likely to be in, for public
// holidays (rule 13). A zone not listed has no country here: the caller
// passes the country from the person's account instead of guessing.
const COUNTRY_BY_ZONE = {
  'Europe/London': 'GB', 'Europe/Belfast': 'GB', 'Europe/Dublin': 'IE', 'Europe/Paris': 'FR', 'Europe/Berlin': 'DE',
  'Europe/Madrid': 'ES', 'Europe/Rome': 'IT', 'Europe/Amsterdam': 'NL', 'Europe/Brussels': 'BE', 'Europe/Zurich': 'CH',
  'Europe/Vienna': 'AT', 'Europe/Stockholm': 'SE', 'Europe/Oslo': 'NO', 'Europe/Copenhagen': 'DK', 'Europe/Helsinki': 'FI',
  'Europe/Lisbon': 'PT', 'Europe/Warsaw': 'PL', 'Europe/Prague': 'CZ', 'Europe/Athens': 'GR',
  'Asia/Kolkata': 'IN', 'Asia/Calcutta': 'IN', 'Asia/Singapore': 'SG', 'Asia/Hong_Kong': 'HK', 'Asia/Tokyo': 'JP',
  'Asia/Dubai': 'AE', 'Asia/Kathmandu': 'NP', 'Asia/Katmandu': 'NP',
  'Australia/Sydney': 'AU', 'Australia/Melbourne': 'AU', 'Australia/Brisbane': 'AU', 'Australia/Adelaide': 'AU',
  'Australia/Perth': 'AU', 'Australia/Hobart': 'AU', 'Australia/Darwin': 'AU',
  'Pacific/Auckland': 'NZ', 'Africa/Johannesburg': 'ZA',
};

const COUNTRY_WORDS = {
  US: 'the US', CA: 'Canada', GB: 'the UK', IE: 'Ireland', AU: 'Australia', NZ: 'New Zealand', IN: 'India',
  FR: 'France', DE: 'Germany', ES: 'Spain', IT: 'Italy', NL: 'the Netherlands', BE: 'Belgium', CH: 'Switzerland',
  AT: 'Austria', SE: 'Sweden', NO: 'Norway', DK: 'Denmark', FI: 'Finland', PT: 'Portugal', PL: 'Poland',
  CZ: 'the Czech Republic', GR: 'Greece', SG: 'Singapore', HK: 'Hong Kong', JP: 'Japan', AE: 'the UAE', NP: 'Nepal',
  ZA: 'South Africa',
};

/**
 * Whether this is a real place-name zone the device knows. Offsets
 * ("-05:00", "UTC+1", "GMT-5") and letters ("EST", "PST", "BST") are never
 * zones here, even where the device would accept them, because they don't
 * follow the place's clock changes.
 */
export function isZone(zone) {
  if (typeof zone !== 'string' || !zone) return false;
  if (zone !== 'UTC' && zone !== 'Etc/UTC' && !/^[A-Za-z_]+\/[A-Za-z0-9_+\-/]+$/.test(zone)) return false;
  if (/^Etc\/GMT/i.test(zone)) return false;
  // A place name is written as the tz database writes it ("America/New_York").
  // The device would take "america/new_york" too, but nothing here would know
  // it: it would be written "new york time", on a 24-hour clock.
  if (zone.split('/').some((part) => !/^[A-Z]/.test(part))) return false;
  try {
    const known = new Intl.DateTimeFormat('en-GB', { timeZone: zone }).resolvedOptions().timeZone;
    return known === zone || known.toLowerCase() !== zone.toLowerCase();
  } catch {
    return false;
  }
}

/** The zone, or an error saying why it can't be saved. */
export function mustBeZone(zone) {
  if (!isZone(zone)) throw new Error(`"${String(zone).slice(0, 60)}" is not a place-name time zone (for example America/New_York). Offsets and letters are never saved.`);
  return zone;
}

/** "New York", "UK", "Chicago", "Sydney": the place, for "10:00 Chicago time". */
export function zonePlace(zone) {
  if (PLACE_NAMES[zone]) return PLACE_NAMES[zone];
  const city = String(zone).split('/').pop() || String(zone);
  return city.replace(/_/g, ' ');
}

/** "New York time", "UK time": always a place, never letters (rule 6). */
export const zoneLabel = (zone) => `${zonePlace(zone)} time`;

/** 'US', 'CA', 'GB'… or null when the zone alone doesn't say. */
export function zoneCountry(zone) {
  if (US_ZONES.has(zone)) return 'US';
  if (CANADA_ZONES.has(zone)) return 'CA';
  return COUNTRY_BY_ZONE[zone] || null;
}

/** US and Canadian readers see 12-hour times; everyone else 24-hour (rule 8). */
export const usesTwelveHour = (zone) => US_ZONES.has(zone) || CANADA_ZONES.has(zone);

const COUNTRY_ADJECTIVES = { US: 'US', CA: 'Canadian', GB: 'UK', IE: 'Irish', AU: 'Australian', NZ: 'New Zealand', IN: 'Indian' };

/** "US", "Canadian", "UK": a country before a noun ("US clocks", "Canadian clients"), or null when there's no plain word for it. */
export const countryAdjective = (country) => COUNTRY_ADJECTIVES[country] || null;

/** "the US", "Canada", "the UK": a country inside a sentence. */
export const countryWords = (country) => COUNTRY_WORDS[country] || country;

/** The device's own zone, or null where the browser doesn't say. */
export function deviceZone() {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isZone(zone) ? zone : null;
  } catch {
    return null;
  }
}
