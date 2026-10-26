// M8. Usual range (docs/scoring-methods.md, M8).
//
// The middle half (25th to 75th percentile) of the last 16 eligible
// finished weeks, across sprints, by linear interpolation, rounded to whole
// numbers. Shown once there are at least 6 eligible weeks.

import { m0Round } from './m0.js';

export const USUAL_RANGE_MIN_WEEKS = 6;
export const USUAL_RANGE_WEEKS = 16;

/** Percentile by linear interpolation between closest ranks (spreadsheets' PERCENTILE.INC). */
export function m8Percentile(values, p) {
  const s = [...values].sort((a, b) => a - b);
  if (!s.length) return null;
  const pos = p * (s.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

/**
 * M8: the usual range.
 * @param {number[]} eligibleScores eligible finished weeks' scores, oldest first
 * @returns {{ low: number, high: number, weeks: number }|null} null before 6 weeks
 */
export function m8UsualRange(eligibleScores) {
  const used = (eligibleScores || []).filter((s) => s != null).slice(-USUAL_RANGE_WEEKS);
  if (used.length < USUAL_RANGE_MIN_WEEKS) return null;
  return { low: m0Round(m8Percentile(used, 0.25)), high: m0Round(m8Percentile(used, 0.75)), weeks: used.length };
}
