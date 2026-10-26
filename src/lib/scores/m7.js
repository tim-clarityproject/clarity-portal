// M7. Performance standard (docs/scoring-methods.md, M7).
//
// The weekly score counted as a good week, set per sprint. Default 85;
// choices 75, 80, 85, 90 or any whole number from 50 to 100 (Tim, 23 Oct).

import { m0AtStandard } from './m0.js';

export const DEFAULT_STANDARD = 85;
export const STANDARD_CHOICES = Object.freeze([75, 80, 85, 90]);

/** M7: is this a standard someone may choose? */
export function m7IsValidStandard(n) {
  return Number.isInteger(n) && n >= 50 && n <= 100;
}

/**
 * M7: how a week shows against the standard: 'good' (at or above, mint),
 * 'below' (grey) or 'none' (no score).
 */
export function m7WeekColour(score, standard) {
  if (score == null) return 'none';
  return m0AtStandard(score, standard) ? 'good' : 'below';
}
