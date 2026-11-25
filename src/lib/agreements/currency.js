// The currencies an agreement may be in, and money written as words (Phase 6b run 3; M28 version 4; brief items 5 and
// 42). Plain rules with no database or Stripe, shared by the builders, the client's pages, the server and the PDFs.
// Checked by tests/performance/agreements-currency.test.mjs.
//
// - Amounts are whole minor units everywhere (pence, cents; whole yen, which has no minor unit: Stripe's zero-decimal
//   list). Only these functions turn them into words.
// - The 15 currencies are M28's: the European Central Bank's daily list, and the UAE dirham from its fixed dollar peg
//   (risk 8). The database's currency_ok() (065) holds the same list: change both together.
// - Rates read "£750/hr" and "£3,000/month", with no spaces (Tim's money rules).

export const CURRENCY_LIST = Object.freeze(['GBP', 'EUR', 'USD', 'CAD', 'AUD', 'NZD', 'CHF', 'AED', 'SGD', 'HKD', 'SEK', 'NOK', 'DKK', 'ZAR', 'JPY']);

/** Each currency: its symbol as M28 writes it, its name in words, and its minor-unit exponent (Stripe's zero-decimal list). */
export const CURRENCY = Object.freeze({
  GBP: { symbol: '£', name: 'pounds', exponent: 2 },
  EUR: { symbol: '€', name: 'euros', exponent: 2 },
  USD: { symbol: 'US$', name: 'US dollars', exponent: 2 },
  CAD: { symbol: 'C$', name: 'Canadian dollars', exponent: 2 },
  AUD: { symbol: 'A$', name: 'Australian dollars', exponent: 2 },
  NZD: { symbol: 'NZ$', name: 'New Zealand dollars', exponent: 2 },
  CHF: { symbol: 'CHF ', name: 'Swiss francs', exponent: 2 },
  AED: { symbol: 'AED ', name: 'UAE dirhams', exponent: 2 },
  SGD: { symbol: 'S$', name: 'Singapore dollars', exponent: 2 },
  HKD: { symbol: 'HK$', name: 'Hong Kong dollars', exponent: 2 },
  SEK: { symbol: 'SEK ', name: 'Swedish kronor', exponent: 2 },
  NOK: { symbol: 'NOK ', name: 'Norwegian kroner', exponent: 2 },
  DKK: { symbol: 'DKK ', name: 'Danish kroner', exponent: 2 },
  ZAR: { symbol: 'R', name: 'South African rand', exponent: 2 },
  JPY: { symbol: '¥', name: 'Japanese yen', exponent: 0 },
});

export const isCurrency = (c) => Object.prototype.hasOwnProperty.call(CURRENCY, c);
const mustBe = (c) => {
  if (!isCurrency(c)) throw new Error(`The currency is one of ${CURRENCY_LIST.join(', ')}.`);
  return c;
};

/** Minor units in one unit of the currency: 100, or 1 for yen. */
export const exponent = (c) => CURRENCY[mustBe(c)].exponent;
export const unitMinor = (c) => 10 ** exponent(c);

/** Whole units to minor units: 750 pounds → 75000. */
export const toMinor = (major, c = 'GBP') => Math.round(Number(major) * unitMinor(c));
/** Minor units to units (a number, possibly with a fraction). */
export const toMajor = (minor, c = 'GBP') => Number(minor) / unitMinor(c);

/**
 * "£18,000", "£956.25", "€21,900", "US$1,250", "¥3,000,000", "CHF 1,500". Whole amounts have no pence; others two
 * places. Negative as "−£2,700" (a minus sign, as a discount line shows it).
 */
export function moneyText(minor, c = 'GBP') {
  const cur = mustBe(c);
  if (!Number.isFinite(Number(minor))) throw new Error('An amount is a whole number of minor units.');
  const n = Math.round(Number(minor));
  const abs = Math.abs(n);
  const per = unitMinor(cur);
  const whole = Math.floor(abs / per);
  const rest = abs % per;
  const text = `${CURRENCY[cur].symbol}${whole.toLocaleString('en-GB')}${rest ? `.${String(rest).padStart(exponent(cur), '0')}` : ''}`;
  return n < 0 ? `−${text}` : text;
}

/** A rate as Tim writes it: "£750/hr", "£3,000/month", "£250/day", with no spaces. */
export function rateText(minor, per, c = 'GBP') {
  const unit = { hour: 'hr', month: 'month', session: 'session', day: 'day', year: 'year' }[per];
  if (!unit) throw new Error('A rate is per hour, month, session, day or year.');
  return `${moneyText(minor, c)}/${unit}`;
}

/** Rounds to the nearest `units` whole units of the currency (in minor units): nearest £100 is roundUnits(x, 100, 'GBP'). */
export function roundUnits(minor, units, c = 'GBP') {
  const step = units * unitMinor(c);
  return Math.round(Number(minor) / step) * step;
}

/**
 * The step a deposit is rounded to (brief item 4: "rounded to the nearest £100"; risk 26): 100 units of the agreement's
 * currency, and ¥10,000 for yen, so it is about the same size whatever the currency.
 */
export const depositStep = (c = 'GBP') => (exponent(c) === 0 ? 10000 : 100 * unitMinor(c));
export const roundDeposit = (minor, c = 'GBP') => Math.round(Number(minor) / depositStep(c)) * depositStep(c);

/** "16 hours 30 minutes", "1 hour", "30 minutes", "0 minutes" (M28's hm). */
export function hoursWords(minutes) {
  const m = Math.max(0, Math.round(Number(minutes) || 0));
  const h = Math.floor(m / 60);
  const r = m % 60;
  const parts = [];
  if (h) parts.push(`${h} ${h === 1 ? 'hour' : 'hours'}`);
  if (r) parts.push(`${r} ${r === 1 ? 'minute' : 'minutes'}`);
  return parts.join(' ') || '0 minutes';
}

/** "5 hours", "1.5 hours", "1 hour" (an invoice's hours, M28's hrs). */
export function hoursFigure(minutes) {
  const h = Math.round((Number(minutes) / 60) * 100) / 100;
  return `${h} ${h === 1 ? 'hour' : 'hours'}`;
}

/** "a, b and c" (M28's andList). */
export const andList = (items) => {
  const a = (items || []).filter(Boolean);
  return a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`;
};
/** First letter lower case (M28's lc), for a label read inside a sentence. */
export const lowerFirst = (s) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : '');
/** First letter capital. */
export const upperFirst = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
