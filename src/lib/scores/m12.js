// M12. Daily and weekly signals (docs/scoring-methods.md, M12).
//
// None of these is part of the Performance score. Odd entries are left out
// until the person confirms them (pattern rule 14).

import { m0Round, m0RoundHours } from './m0.js';

export const SLEEP_SENSIBLE = Object.freeze({ min: 2, max: 14 });
export const SLEEP_QUALITY = Object.freeze(['very_poor', 'poor', 'fair', 'good', 'very_good']);
export const WEEKLY_STRESS = Object.freeze(['not_at_all', 'a_little', 'moderately', 'quite_a_lot', 'very_much']);

/** M12: an odd entry, asked about once and left out until confirmed (sleep 2 to 14 hours; Claude). */
export function m12IsOdd(kind, value) {
  if (kind === 'sleep_hours') return value < SLEEP_SENSIBLE.min || value > SLEEP_SENSIBLE.max;
  return false;
}

const usable = (entries) => (entries || []).filter((e) => e.value != null && !e.toConfirm);

/** M12: sleep hours over a period: average a night (one decimal shown) and green nights (7 hours or more). */
export function m12SleepHours(entries) {
  const v = usable(entries).map((e) => e.value);
  if (!v.length) return null;
  const average = v.reduce((a, b) => a + b, 0) / v.length;
  return { average, shown: m0RoundHours(average), greenNights: v.filter((h) => h >= 7).length, nights: v.length };
}

/**
 * M12: sleep quality over a period: the most common answer; on a tie, the
 * middle one of those tied in scale order (the lower middle for an even
 * number; Claude). Green for Good or Very good.
 */
export function m12SleepQuality(entries) {
  const counts = new Map();
  for (const e of usable(entries)) counts.set(e.value, (counts.get(e.value) || 0) + 1);
  if (!counts.size) return null;
  const top = Math.max(...counts.values());
  const tied = SLEEP_QUALITY.filter((q) => counts.get(q) === top);
  const answer = tied[Math.floor((tied.length - 1) / 2)];
  return { answer, green: answer === 'good' || answer === 'very_good' };
}

/** M12: a week's stress answer is green at "Not at all" or "A little". */
export function m12StressGreen(answer) {
  return answer === 'not_at_all' || answer === 'a_little';
}

/** M12: the way of being (1 to 10): average, whole number, green at 7 or more (Claude). */
export function m12WayOfBeing(ratings) {
  const v = (ratings || []).filter((x) => x != null);
  if (!v.length) return null;
  const shown = m0Round(v.reduce((a, b) => a + b, 0) / v.length);
  return { shown, green: shown >= 7 };
}

/** M12: emotional control: share of a week's checks above the line, green at 70% or more. */
export function m12EmotionalControl(checks) {
  const v = (checks || []).filter((c) => c === 'above' || c === 'below');
  if (!v.length) return null;
  const share = (v.filter((c) => c === 'above').length / v.length) * 100;
  return { share, shown: m0Round(share), green: m0Round(share) >= 70, checks: v.length };
}

/** M12: breathing: sessions a week, green for any week with a session (Claude). */
export function m12Breathing(sessions) {
  return { sessions, green: sessions > 0 };
}
