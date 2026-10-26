// Paper size for every PDF (PDF rule 3): US Letter for the US and Canada, A4
// for everyone else. The one place this is decided.
//
// Order: the person's country setting, once My Account has one (pass it in as
// `country`), then the device's region (en-US or fr-CA mean Letter), then the
// device's time zone (US and Canadian zones mean Letter). Anything else is A4.

export const PAPER = {
  A4: { name: 'A4', width: 595.28, height: 841.89 },
  LETTER: { name: 'US Letter', width: 612, height: 792 },
};

const LETTER_COUNTRIES = new Set(['US', 'CA']);

// IANA zones used in the US and Canada (including the old US/ and Canada/ names).
const LETTER_ZONES = new RegExp(`^(${[
  'US/.+', 'Canada/.+', 'Pacific/Honolulu',
  'America/(New_York|Detroit|Chicago|Denver|Phoenix|Boise|Los_Angeles|Anchorage|Juneau|Sitka|Metlakatla|Yakutat|Nome|Adak|Menominee)',
  'America/(Indiana|Kentucky|North_Dakota)/.+',
  'America/(Toronto|Montreal|Nipigon|Thunder_Bay|Iqaluit|Pangnirtung|Halifax|Glace_Bay|Moncton|Goose_Bay|St_Johns|Winnipeg|Rainy_River|Rankin_Inlet|Resolute|Regina|Swift_Current|Edmonton|Cambridge_Bay|Yellowknife|Inuvik|Creston|Dawson_Creek|Fort_Nelson|Vancouver|Whitehorse|Dawson|Atikokan|Blanc-Sablon|Coral_Harbour)',
].join('|')})$`);

/** The region a language tag names, such as "US" for en-US. Null when it names none. */
export function regionOf(tag) {
  if (!tag) return null;
  try {
    return new Intl.Locale(tag).region || null; // never guessed: "en" alone has no region
  } catch {
    const m = /^[a-z]{2,3}[-_]([A-Za-z]{2})\b/.exec(tag);
    return m ? m[1].toUpperCase() : null;
  }
}

/** The device's region setting, or null. */
function deviceRegion() {
  if (typeof navigator !== 'undefined') {
    const tags = navigator.languages?.length ? navigator.languages : [navigator.language];
    for (const tag of tags) {
      const region = regionOf(tag);
      if (region) return region;
    }
  }
  try {
    return regionOf(Intl.DateTimeFormat().resolvedOptions().locale);
  } catch {
    return null;
  }
}

function deviceTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    return '';
  }
}

/**
 * @param {Object} [options]
 * @param {string|null} [options.country] the person's country setting (two letters), when there is one
 * @param {string|null} [options.region] for tests: stands in for the device's region
 * @param {string|null} [options.timeZone] for tests: stands in for the device's time zone
 * @returns {{name: string, width: number, height: number}} in points
 */
export function paperFor({ country, region, timeZone } = {}) {
  if (country) return LETTER_COUNTRIES.has(country.toUpperCase()) ? PAPER.LETTER : PAPER.A4;
  const r = region !== undefined ? region : deviceRegion();
  if (r) return LETTER_COUNTRIES.has(r.toUpperCase()) ? PAPER.LETTER : PAPER.A4;
  const zone = timeZone !== undefined ? timeZone : deviceTimeZone();
  return LETTER_ZONES.test(zone || '') ? PAPER.LETTER : PAPER.A4;
}
