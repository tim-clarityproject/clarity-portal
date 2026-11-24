import { addDays } from '../time/index.js';
import { addMonths, monthDays, monthKey } from './year.js';
import { poundsWords } from './words.js';

// VAT (Phase 6b run 2, step 2: Other; M11 C9). UK taxable income over the last 12 months against the £90,000
// threshold: work for clients outside the UK doesn't count unless it's done in person here. A client whose country
// isn't known counts (the careful side). Checked by tests/performance/finance-vat.test.mjs.

export const VAT_THRESHOLD_MINOR = 9000000;

/**
 * @param {{ lines: object[], today: string, countryOf?: (line) => string|null, inPersonOf?: (line) => boolean }} a
 *   countryOf returns an ISO country ('GB', 'US', …) for a line's client; inPersonOf whether the work was done in person in the UK
 * @returns {{ from: string, to: string, minor: number, figure: string, of: string, over: boolean, outsideUk: number }}
 *   the window is the 12 months up to and including today (from the same day a year ago, plus one)
 */
export function ukTaxableIncome({ lines, today, countryOf = (l) => l.country ?? null, inPersonOf = (l) => Boolean(l.in_person) }) {
  const back = addMonths(monthKey(today), -12);
  const day = Math.min(Number(today.slice(8, 10)), monthDays(back).length);
  const from = addDays(`${back}-${String(day).padStart(2, '0')}`, 1);
  let minor = 0;
  let outsideUk = 0;
  for (const l of lines || []) {
    if (l.pounds == null || l.day < from || l.day > today) continue;
    const c = countryOf(l);
    if (c && c !== 'GB' && !inPersonOf(l)) { outsideUk += l.pounds; continue; }
    minor += l.pounds;
  }
  return { from, to: today, minor, figure: poundsWords(minor), of: `of ${poundsWords(VAT_THRESHOLD_MINOR)}`, over: minor > VAT_THRESHOLD_MINOR, outsideUk };
}
