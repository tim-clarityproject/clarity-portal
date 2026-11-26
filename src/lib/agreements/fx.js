import { dayKeyWords } from '../time/index.js';
import { exponent, moneyText, unitMinor } from './currency.js';

// Agreements in another currency (brief items 42 and 43; M28's fxLine, fxWarn, Match my £ price). The £ value at
// today's reference rate beside the price, and roughly what lands after Stripe converts it (2%); when what lands is under
// the package's £ price, a calm warning says by how much (risk 9: warned on what lands, so Match always clears it), with
// "Match my £ price" (rounds up to the nearest 50 after conversion). Daily reference rates (065's fx_reference_rates,
// the ECB's daily list) with their day shown on hover; nothing here ever blocks sending.
//
// A RATE HERE IS £ PER ONE UNIT of the currency (M28's "1 EUR = £0.84"). The database keeps units per £1 (061's
// fx_rate, 065's units_per_gbp): perUnit() turns one into the other. Checked by tests/performance/agreements-fx.test.mjs.

export const STRIPE_FX_FEE = 0.02;
export const MOVED_DOWN = 0.05;
export const MATCH_STEP = 50;

/** £ per unit from units per £1 (the database's way round): 1.19047619 EUR to the pound → £0.84 per euro. */
export const perUnit = (unitsPerGbp) => (Number(unitsPerGbp) > 0 ? 1 / Number(unitsPerGbp) : null);
/** Units per £1 from £ per unit. */
export const unitsPerGbp = (gbpPerUnit) => (Number(gbpPerUnit) > 0 ? 1 / Number(gbpPerUnit) : null);

/** The amount in pence at £ per unit: €20,000 (2,000,000 cents) at 0.84 → £16,800 (1,680,000 pence). */
export function gbpOf(minor, c, rate) {
  if (c === 'GBP') return Math.round(Number(minor));
  return Math.round((Number(minor) / unitMinor(c)) * Number(rate) * 100);
}
/** Roughly what lands after Stripe converts it (2% off). */
export const landed = (gbpMinor) => Math.round(gbpMinor * (1 - STRIPE_FX_FEE));

const pounds = (minor) => `£${Math.round(minor / 100).toLocaleString('en-GB')}`;
/** "1 EUR = £0.84". */
export const rateWords = (c, rate) => `1 ${c} = £${Number(rate).toLocaleString('en-GB', { maximumFractionDigits: 4 })}`;
/** The rate's day, for the pop-up over it: "Reference rate from Wed 25 Nov 2026". */
export const rateDayLine = (day) => (day ? `Reference rate from ${dayKeyWords(day, { year: true })}` : '');

/** "About £16,800 at today's rate (1 EUR = £0.84), about £16,464 after Stripe converts it." */
export function fxLine(minor, c, rate) {
  const g = gbpOf(minor, c, rate);
  return `About ${pounds(g)} at today’s rate (${rateWords(c, rate)}), about ${pounds(landed(g))} after Stripe converts it.`;
}
/** A monthly fee's line: "About £2,520/month at today's rate (1 EUR = £0.84)." */
export const fxLineMonthly = (minor, c, rate) => `About ${pounds(gbpOf(minor, c, rate))}/month at today’s rate (${rateWords(c, rate)}).`;

/** How far what lands is under the package's £ price, in pence (0 when it isn't). */
export function underBy(minor, c, rate, packageGbpMinor) {
  if (c === 'GBP' || !(Number(rate) > 0) || !(Number(packageGbpMinor) > 0)) return 0;
  return Math.max(0, Math.round(Number(packageGbpMinor) - landed(gbpOf(minor, c, rate))));
}
/** "That's £1,536 under your £18,000 price for this package." */
export const underLine = (under, packageGbpMinor) => `That’s ${pounds(under)} under your ${pounds(packageGbpMinor)} price for this package.`;

/** The price in the currency that lands at least the package's £ price, up to the next 50: £18,000 at 0.84 → €21,900. */
export function matchMyPrice(packageGbpMinor, c, rate) {
  const major = Number(packageGbpMinor) / 100 / Number(rate) / (1 - STRIPE_FX_FEE);
  return Math.ceil(major / MATCH_STEP) * MATCH_STEP * unitMinor(c);
}
export const matchLine = (minor, c, packageGbpMinor) => `Set to ${moneyText(minor, c)}, matching ${pounds(packageGbpMinor)} after conversion.`;

/** How much the £ value has fallen since signing, as a share (0.0595 for 0.84 → 0.79); 0 when it hasn't fallen. */
export const fallSince = (rateAtSigning, rateToday) => (Number(rateAtSigning) > 0 ? Math.max(0, (Number(rateAtSigning) - Number(rateToday)) / Number(rateAtSigning)) : 0);
/** Whether it has fallen by more than 5% (a Needs you line before an instalment or renewal in another currency). */
export const movedDown = (rateAtSigning, rateToday) => fallSince(rateAtSigning, rateToday) > MOVED_DOWN;

export { exponent };

// ---------------------------------------------------------------- the figure the client sees (M28 version 6)

/**
 * The step a clean figure rounds to, in whole units of the currency (M28 version 6's nice()): 100 from 5,000, 50 from
 * 1,000, 10 from 200, else 5.
 */
export const cleanStep = (units) => (units >= 5000 ? 100 : units >= 1000 ? 50 : units >= 200 ? 10 : 5);

/** Under the £ price by at least a whole pound (a penny's rounding is never a warning). */
const wholeUnder = (g, price) => Math.round(g / 100) < Math.round(price / 100);

/** The client's figure for a £ figure at today's rate, in minor units of `c` (the exact one, unrounded to the unit). */
export function exactLocal(gbpMinor, c, unitsPerGbp) {
  if (c === 'GBP') return Math.round(Number(gbpMinor) || 0);
  if (!(Number(unitsPerGbp) > 0)) return 0;
  const units = ((Number(gbpMinor) || 0) / 100) * Number(unitsPerGbp);
  return Math.round(units * unitMinor(c));
}

/**
 * The figure the client sees, from the coach's £ figure (Tim, 25 Nov 18:10; M28 version 6's "What should Sam see?"):
 * rounded up, rounded down, exactly today's rate, each with its £ value and whether it falls under the £ price.
 * `unitsPerGbp` is the database's way round (065). [{ mode, minor, gbpMinor, under }] — empty while the rate is unknown.
 */
export function localFigures(gbpMinor, c, unitsPerGbp) {
  const g = Math.round(Number(gbpMinor) || 0);
  if (c === 'GBP' || !(Number(unitsPerGbp) > 0) || !(g > 0)) return [];
  // Exactly today's rate, to the whole unit (M28 version 6: "CA$1,316").
  const exact = Math.round(exactLocal(g, c, unitsPerGbp) / unitMinor(c)) * unitMinor(c);
  const units = exact / unitMinor(c);
  const step = cleanStep(units);
  const up = Math.ceil(units / step) * step * unitMinor(c);
  const down = Math.max(step, Math.floor(units / step) * step) * unitMinor(c);
  const back = (minor) => Math.round(((minor / unitMinor(c)) / Number(unitsPerGbp)) * 100);
  return [
    { mode: 'up', minor: up, gbpMinor: back(up) },
    { mode: 'down', minor: down, gbpMinor: back(down) },
    { mode: 'exact', minor: exact, gbpMinor: g },
  ].map((o) => ({ ...o, under: wholeUnder(o.gbpMinor, g) }));
}

/** The client's figure for a way of choosing it ('up', 'down', 'exact'); `own` keeps the coach's own figure. */
export function localFor(mode, gbpMinor, c, unitsPerGbp, own = null) {
  if (c === 'GBP') return Math.round(Number(gbpMinor) || 0);
  if (mode === 'own') return Math.round(Number(own) || 0);
  const o = localFigures(gbpMinor, c, unitsPerGbp).find((x) => x.mode === mode);
  return o ? o.minor : Math.round(Number(own) || 0);
}

/** The £ value of a client's figure at today's rate (units per £1), rounded to the penny. */
export const gbpValue = (minor, c, unitsPerGbp) => (c === 'GBP' ? Math.round(Number(minor) || 0)
  : Number(unitsPerGbp) > 0 ? Math.round(((Number(minor) || 0) / unitMinor(c) / Number(unitsPerGbp)) * 100) : null);

/** The calm warning under the figures (M28 version 6): "That's about £731, under your £750." — or '' when it isn't under. */
export function underWarning(minor, c, unitsPerGbp, gbpMinor) {
  const g = gbpValue(minor, c, unitsPerGbp);
  if (g == null || !(Number(gbpMinor) > 0) || !wholeUnder(g, Number(gbpMinor))) return '';
  return `That’s about ${pounds(g)}, under your ${pounds(Number(gbpMinor))}.`;
}
