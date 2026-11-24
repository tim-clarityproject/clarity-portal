import { moneyWords } from '../billing/money.js';

// Finances' figures in words (Phase 6b run 2). Built on run 1's moneyWords, never a second money formatter.
// Finances shows whole pounds ("£2,300"); a figure is rounded to the pound only here, for the screen, and every sum
// underneath stays in exact pence.

/** "£2,300", "−£450": whole pounds, rounded half up (away from zero for a minus). */
export function poundsWords(minor) {
  const n = Number(minor);
  if (!Number.isFinite(n)) throw new Error('An amount needs whole minor units.');
  const whole = Math.sign(n) * Math.round(Math.abs(n) / 100) * 100;
  return moneyWords(whole === 0 ? 0 : whole, 'GBP');
}

/** Pence rounded to the nearest £100 (half up), the rule for "At this rate, the year ends around £36,500." */
export const toNearestHundredPounds = (minor) => Math.sign(minor) * Math.round(Math.abs(minor) / 10000) * 10000;

/**
 * A whole percent of a target: rounded, but never 100% until the target is reached, and never 0% once something has
 * come in (so "100%" always means reached). 2,300 of 5,000 → 46; 23,100 of 60,000 → 39; 5,900 of 5,000 → 118.
 * @returns {number|null} null when there is no target
 */
export function percentOf(part, whole) {
  if (!(whole > 0)) return null;
  const p = Math.round((part * 100) / whole);
  if (part < whole && p >= 100) return 99;
  if (part > 0 && p <= 0) return 1;
  return Math.max(0, p);
}

/** "22 hours", "1 hour", "22.5 hours", "45 minutes" (units in full words, 26 Oct design rule 8). */
export function hoursWords(minutes) {
  const m = Math.max(0, Math.round(Number(minutes) || 0));
  if (m > 0 && m < 60) return m === 1 ? '1 minute' : `${m} minutes`;
  const h = Math.round((m / 60) * 100) / 100;
  return h === 1 ? '1 hour' : `${h.toLocaleString('en-GB', { maximumFractionDigits: 2 })} hours`;
}
