// Words that change by role and country (Polish 1, Stage D item 3; Draft 6's
// table, approved by Tim on 27 Nov 2026; question rule 35). The question stays
// the same and only these nouns change, from the role chosen at sign-up
// (person_settings.describes_you: 'head_coach' is sport, every other role is
// business) and the account's region: the account's country first, then the
// time zone (rule 29y: US time zones are American, everywhere else British).
// One shared function, so every tool, PDF and email agrees.

const US_ZONES = new RegExp(`^(${[
  'US/.+', 'Pacific/Honolulu',
  'America/(New_York|Detroit|Chicago|Denver|Phoenix|Boise|Los_Angeles|Anchorage|Juneau|Sitka|Metlakatla|Yakutat|Nome|Adak|Menominee)',
  'America/(Indiana|Kentucky|North_Dakota)/.+',
].join('|')})$`);

/** The four columns of Draft 6's table, word for word. */
export const ROLE_WORDS = Object.freeze({
  business_uk: Object.freeze({ team: 'team', staff: 'staff', board: 'board', year: 'this year', work: 'work', organisation: 'organisation' }),
  business_us: Object.freeze({ team: 'team', staff: 'people', board: 'board', year: 'this year', work: 'work', organisation: 'organization' }),
  sport_uk: Object.freeze({ team: 'squad', staff: 'staff', board: 'board or owners', year: 'this season', work: 'the game', organisation: 'club' }),
  sport_us: Object.freeze({ team: 'team', staff: 'coaching staff', board: 'owners or front office', year: 'this season', work: 'the game', organisation: 'organization' }),
});

/** True when the person's words are American. */
export function isUsRegion({ country, timeZone } = {}) {
  if (country) return String(country).toUpperCase() === 'US';
  return US_ZONES.test(timeZone || '');
}

/** Which column of the table: 'business_uk', 'business_us', 'sport_uk' or 'sport_us'. */
export function roleWordsKey({ role, country, timeZone } = {}) {
  const field = role === 'head_coach' ? 'sport' : 'business';
  return `${field}_${isUsRegion({ country, timeZone }) ? 'us' : 'uk'}`;
}

/** The words for one person: { team, staff, board, year, work, organisation }. */
export function roleWords(person = {}) {
  return ROLE_WORDS[roleWordsKey(person)];
}

/**
 * Fills a question's [team], [staff], [board], [year], [work] and
 * [organisation] for one person. Any other [placeholder] is left for the
 * tool to fill (their own answer, a name). A word at the start of the
 * sentence takes a capital.
 */
export function withRoleWords(text, person = {}) {
  const words = roleWords(person);
  return String(text).replace(/\[(team|staff|board|year|work|organisation)\]/g, (m, key, at, all) => {
    const w = words[key];
    const start = at === 0 || /[.?!]\s+$/.test(all.slice(0, at));
    return start ? w.charAt(0).toUpperCase() + w.slice(1) : w;
  });
}
