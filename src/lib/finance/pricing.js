import { moneyWords } from '../billing/money.js';

// Pricing (Phase 6b run 2, step 2; M11 C8). Checked by tests/performance/finance-pricing.test.mjs.
//
// - "About £750/hr": a package's price over its hours, to the nearest £5 from £500/hr up and to the whole pound
//   below (so £7,460 over 9 hours is about £830/hr, and £5,860 over 20 hours about £293/hr). A price paid personally
//   includes VAT once Tim is registered, so its hourly figure is taken before VAT.
// - Update all prices, word for word from M11: "Prices round to an ending of 20, 30, 40, 60, 70 or 80, and never go
//   below £200/hr." Each price is raised by the percentage, then moved to the nearest whole pounds whose last two
//   digits are 20, 30, 40, 60, 70 or 80 (a tie goes up); a package with hours never goes below £200/hr (it rises to the
//   first allowed price at or over that). A price under £100 (a portal seat) rounds to the whole pound only.
//   +3%: £13,460 → £13,860, £7,460 → £7,680, £940 → £970.
// - A discount is a named percentage or fixed amount on all packages or chosen ones, and is never called "charity".

export const ENDINGS = Object.freeze([20, 30, 40, 60, 70, 80]);
export const FLOOR_PER_HOUR_MINOR = 20000;
export const VAT_RATE_PERCENT = 20;
export const ROUNDING_RULE = 'Prices round to an ending of 20, 30, 40, 60, 70 or 80, and never go below £200/hr.';

/** "About £750/hr" for a price (pence) over its hours; '' without hours. */
export function perHourWords(priceMinor, hours, { includesVat = false } = {}) {
  const h = Number(hours);
  if (!(h > 0) || !(Number(priceMinor) > 0)) return '';
  const net = includesVat ? Number(priceMinor) / (1 + VAT_RATE_PERCENT / 100) : Number(priceMinor);
  const pounds = net / 100 / h;
  const rounded = pounds >= 500 ? Math.round(pounds / 5) * 5 : Math.round(pounds);
  return `About ${moneyWords(rounded * 100)}/hr`;
}

const allowed = (pounds) => ENDINGS.includes(((pounds % 100) + 100) % 100);

/** A price in whole pounds moved to the nearest allowed ending (a tie goes up); under £100, the whole pound. */
export function roundPrice(pounds) {
  const p = Number(pounds);
  if (!Number.isFinite(p) || p < 0) throw new Error('A price is an amount of £0 or more.');
  if (p < 100) return Math.round(p);
  let best = null;
  const base = Math.floor(p / 100) * 100;
  for (let n = base - 100; n <= base + 200; n += 10) {
    if (n < 100 || !allowed(n)) continue;
    const d = Math.abs(n - p);
    if (best == null || d < best.d || (d === best.d && n > best.n)) best = { n, d };
  }
  return best.n;
}

/** The first allowed price at or above `pounds`. */
function allowedAtLeast(pounds) {
  let n = Math.ceil(pounds / 10) * 10;
  while (!allowed(n)) n += 10;
  return n;
}

/**
 * One price after a change of `percent`: rounded by the rule, never below £200/hr when it has hours.
 * @returns {number} pence
 */
export function newPrice(priceMinor, percent, hours = null) {
  const p = Number(percent);
  if (!Number.isFinite(p) || p <= -50 || p > 100) throw new Error('Change prices by more than −50% and at most 100%.');
  let pounds = roundPrice((Number(priceMinor) / 100) * (1 + p / 100));
  const h = Number(hours);
  if (h > 0 && pounds >= 100 && pounds < (FLOOR_PER_HOUR_MINOR / 100) * h) pounds = allowedAtLeast((FLOOR_PER_HOUR_MINOR / 100) * h);
  return pounds * 100;
}

/**
 * Update all prices' preview.
 * @param {{ packages: { name: string, hours?: number|null, organisations_minor?: number|null, personally_minor?: number|null }[], percent: number }} a
 * @returns {{ packages: { name: string, organisations: { was: number, now: number }|null, personally: { was: number, now: number }|null }[],
 *   preview: { name: string, was: string, now: string }[], count: number, button: string, footnote: string }}
 *   preview is one row a package, its organisations' price ("Was £13,460", "£13,860"), else its personal one
 */
export function updateAllPrices({ packages = [], percent }) {
  const one = (was, hours) => (was == null ? null : { was: Number(was), now: newPrice(was, percent, hours) });
  const rows = (packages || []).map((p) => ({ name: p.name, organisations: one(p.organisations_minor, p.hours), personally: one(p.personally_minor, p.hours) }));
  const count = rows.reduce((a, r) => a + (r.organisations ? 1 : 0) + (r.personally ? 1 : 0), 0);
  const preview = rows.map((r) => { const x = r.organisations || r.personally; return x && { name: r.name, was: `Was ${moneyWords(x.was)}`, now: moneyWords(x.now) }; }).filter(Boolean);
  return { packages: rows, preview, count, button: count === 1 ? 'Update 1 price' : `Update ${count} prices`, footnote: `${ROUNDING_RULE} Clients keep their price until they renew.` };
}

// 062's public.finance_name_says_charity, exactly: lower case, look-alike letters and digits read as Latin
// (translate(..., 'асеорхуіıјѕνοτ401|!$@', 'aceopxyiijsvotaoliisa')), then letters only, then /ch?ar[il]t/.
const LOOK_ALIKES = Array.from('асеорхуіıјѕνοτ401|!$@');
const AS_LATIN = Array.from('aceopxyiijsvotaoliisa');
const READ_AS = new Map(LOOK_ALIKES.map((c, i) => [c, AS_LATIN[i]]));

/** Whether a name says charity however it is spelt (the same answer as the database's check on discounts). */
export function nameSaysCharity(name) {
  const latin = Array.from(String(name ?? '').toLowerCase()).map((c) => READ_AS.get(c) ?? c).join('');
  return /ch?ar[il]t/.test(latin.replace(/[^a-z]/g, ''));
}

/**
 * A discount, checked: a name (never "charity"), a percentage (more than 0, at most 100) or a fixed amount (pence above
 * 0), and all packages or chosen ones.
 * @returns {{ name: string, percent: number|null, amount_minor: number|null, packages: 'all'|string[], words: string }} words "15% off", "£500 off"
 */
export function checkDiscount({ name, percent = null, amount_minor = null, packages = 'all' }) {
  const n = String(name ?? '').replace(/\s+/g, ' ').trim();
  if (!n) throw new Error('Give the discount a name, such as Returning client.');
  if (n.length > 80) throw new Error('A discount’s name is at most 80 characters.');
  if (nameSaysCharity(n)) throw new Error('A discount is never called charity. Give it another name, such as Not-for-profit.');
  if ((percent == null) === (amount_minor == null)) throw new Error('A discount is a percentage or a fixed amount.');
  if (percent != null && !(Number(percent) > 0 && Number(percent) <= 100)) throw new Error('A percentage is more than 0% and at most 100%.');
  if (amount_minor != null && !(Number.isInteger(Number(amount_minor)) && Number(amount_minor) > 0)) throw new Error('A fixed amount is more than £0.');
  if (packages !== 'all' && !(Array.isArray(packages) && packages.length)) throw new Error('Choose the packages it’s for, or All packages.');
  return {
    name: n,
    percent: percent == null ? null : Number(percent),
    amount_minor: amount_minor == null ? null : Number(amount_minor),
    packages,
    words: percent != null ? `${Number(percent)}% off` : `${moneyWords(Number(amount_minor))} off`,
  };
}

/** Whether a discount applies to a package (by its id or name). */
export const discountFor = (discount, pkg) => discount.packages === 'all' || discount.packages.includes(pkg);
