// M7. Performance standard (docs/scoring-methods.md, M7).
//
// The weekly score counted as a good week, set per sprint. Default 85;
// choices 75, 80, 85, 90 or any whole number from 50 to 100 (Tim, 23 Oct).
// Organisation seats have a fixed 85 (Tim, 26 Oct, 23:49); the database
// enforces it on every sprint (public.fixed_standard_for, migration 033).

import { m0AtStandard } from './m0.js';

export const DEFAULT_STANDARD = 85;
export const STANDARD_CHOICES = Object.freeze([75, 80, 85, 90]);
export const ORG_SEAT_STANDARD = 85;

/** M7: may this person choose their own standard? Not in an organisation seat. */
export function m7MayChooseStandard({ orgSeat = false } = {}) {
  return !orgSeat;
}

/**
 * M7: the standard a sprint's weeks are judged against: always 85 for an
 * organisation seat, otherwise the person's own choice (the default when
 * the choice isn't a valid one).
 */
export function m7StandardFor({ orgSeat = false, chosen = DEFAULT_STANDARD } = {}) {
  if (orgSeat) return ORG_SEAT_STANDARD;
  return m7IsValidStandard(chosen) ? chosen : DEFAULT_STANDARD;
}

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
