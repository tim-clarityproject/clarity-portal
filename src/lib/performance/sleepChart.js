// Recovery's sleep chart (approved by Tim, Tue 3 Nov 2026, 14:26): one
// bar per night of the Recovery, the person's target range as a band, and
// one action under it, so the daily sleep answer always leads somewhere.
// Worked out here once, so the page, the table and the tests say the same.
//
// The nights come from day_plans: each day's row holds the sleep of the
// night before it ("How did you sleep last night?", Recovery's Sleep tile
// and Daily plan's first screen write the same row). So Day 1 of a
// Recovery holds the night before it started, and today's row is "Last
// night".
//
// Quality stays the portal's five words (Tim, 3 Nov, 15:02: one quality
// question everywhere, no database change). "Average quality" is the most
// common word across the Recovery's nights, ties going to the better word
// (Tim, 3 Nov).
//
// The target range is the person's own, kept in the account with their
// other page settings (person_settings.page_preferences.sleep_target,
// { from, to }; no new column), so the dashboard can use it in Phase 5.
// Until it is changed it is 7 to 9 hours, the range for adults aged 18 to
// 64 (National Sleep Foundation, Hirshkowitz et al., 2015; AASM and SRS,
// Watson et al., 2015; docs/claims-register.md).

import { addDays, daysBetween } from '../scores/dates.js';
import { SLEEP_QUALITY } from '../scores/index.js';
import { recoveryEndOn } from './rows';

export const SLEEP_TARGET_DEFAULT = Object.freeze({ from: 7, to: 9 });
export const SLEEP_TARGET_MIN = 4;    // hours, the lowest start
export const SLEEP_TARGET_MAX = 12;   // hours, the highest end
export const SLEEP_TARGET_STEP = 0.5; // half hours
export const SLEEP_TARGET_KEY = 'sleep_target';
export const SLEEP_SUGGESTED_LINE = 'Suggested for adults aged 18 to 64.';
export const SLEEP_OWN_LINE = 'This is your own target range.';
export const SLEEP_CHART_STARTS = 'Your chart starts after your second night.';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const QUALITY_WORDS = { very_poor: 'Very poor', poor: 'Poor', fair: 'Fair', good: 'Good', very_good: 'Very good' };

const half = (n) => Math.round(n * 2) / 2;
const onScale = (n) => Number.isFinite(n) && n >= SLEEP_TARGET_MIN && n <= SLEEP_TARGET_MAX && half(n) === n;

/**
 * The person's target range from their page settings: { from, to, own }.
 * Anything not a half hour from 4 to 12 with the start below the end is
 * the suggested 7 to 9 (own: false).
 */
export function readSleepTarget(prefs) {
  const t = prefs && typeof prefs === 'object' ? prefs[SLEEP_TARGET_KEY] : null;
  const from = Number(t?.from);
  const to = Number(t?.to);
  if (t && onScale(from) && onScale(to) && from < to) return { from, to, own: true };
  return { ...SLEEP_TARGET_DEFAULT, own: false };
}

/** A new target range after one stepper press, the start always below the end. */
export function stepSleepTarget(target, which, value) {
  const v = half(Math.min(SLEEP_TARGET_MAX, Math.max(SLEEP_TARGET_MIN, Number(value))));
  if (which === 'from') return { from: Math.min(v, target.to - SLEEP_TARGET_STEP), to: target.to };
  return { from: target.from, to: Math.max(v, target.from + SLEEP_TARGET_STEP) };
}

/** "7 to 9 hours", "6.5 to 8 hours". */
export function rangeWords(target) {
  return `${target.from} to ${target.to} hours`;
}

/** "2 Nov" from a "YYYY-MM-DD" key. */
export function nightDate(key) {
  const [, m, d] = key.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

/** "Good", from the stored word. */
export function qualityWords(q) {
  return QUALITY_WORDS[q] || null;
}

/**
 * The most common quality across the nights, ties going to the better
 * word (Tim, 3 Nov). Null with none answered.
 */
export function usualQuality(qualities) {
  const counts = new Map();
  for (const q of qualities) if (SLEEP_QUALITY.includes(q)) counts.set(q, (counts.get(q) || 0) + 1);
  if (!counts.size) return null;
  const top = Math.max(...counts.values());
  const best = [...SLEEP_QUALITY].reverse().find((q) => counts.get(q) === top);
  return best;
}

/** Hours as people write them: "7", "6.5". */
export function hoursFigure(h) {
  return `${Number(h)}`;
}

/** A night's place against the range: 'good' (inside or above) or 'below'. */
export function nightState(hours, target) {
  return hours >= target.from ? 'good' : 'below';
}

/**
 * The chart for an open Recovery.
 *   recovery: its recovery_periods row
 *   nights:   day_plans rows ({ local_date, sleep_hours, sleep_quality })
 *   today:    the person's local day
 *   target:   readSleepTarget()
 * Returns { slots, last, enough, average, action }:
 *   slots:  one per day of the Recovery, in order: { date, day ('Day 3'),
 *           axis (what's written under it: 'Day 3' or 'Last night'),
 *           night ('Night of 2 Nov'), hours, quality, state: 'good' |
 *           'below' | 'none' (not answered) | 'next' (to come), last }
 *   last:   last night's slot (today's), or null when the Recovery hasn't
 *           reached today
 *   enough: two nights or more hold hours, so the chart shows its bars
 *   average: the usual quality in words, or null
 *   action: { lines, windDown } for last night once its hours are in
 */
export function recoverySleepView({ recovery, nights = [], today, target = SLEEP_TARGET_DEFAULT }) {
  if (!recovery) return null;
  const start = recovery.start_on;
  const end = recoveryEndOn(recovery);
  // Every day of the Recovery, today included even after its chosen end
  // (the end check-in shows then).
  const count = Math.max(daysBetween(start, end), daysBetween(start, today) + 1, 1);
  const byDay = new Map();
  for (const n of nights) if (n?.local_date) byDay.set(n.local_date, n);
  const slots = [];
  for (let i = 0; i < count; i += 1) {
    const date = addDays(start, i);
    const row = byDay.get(date);
    const raw = row?.sleep_hours;
    const hours = raw == null || raw === '' || !Number.isFinite(Number(raw)) ? null : Number(raw);
    const quality = SLEEP_QUALITY.includes(row?.sleep_quality) ? row.sleep_quality : null;
    const future = date > today;
    let state = 'next';
    if (!future) state = hours == null ? 'none' : nightState(hours, target);
    const isLast = date === today;
    slots.push({
      date,
      day: `Day ${i + 1}`,
      axis: isLast ? 'Last night' : `Day ${i + 1}`,
      night: `Night of ${nightDate(addDays(date, -1))}`,
      hours: future ? null : hours,
      quality: future ? null : quality,
      state,
      last: isLast,
    });
  }
  const past = slots.filter((s) => s.date <= today);
  const last = slots.find((s) => s.last) || null;
  const answered = past.filter((s) => s.hours != null);
  const average = qualityWords(usualQuality(past.map((s) => s.quality)));

  // One sentence per line, never repeating a figure or label the chart
  // already shows (Tim, 3 Nov, 15:06): the hours are the big figure and
  // the range is labelled on its band.
  const action = last?.hours != null ? sleepAction(last.hours, target) : null;
  return { slots, last, enough: answered.length >= 2, average, action };
}

/**
 * The one action under a sleep chart (Recovery's and the dashboard's):
 * after a night under the target range, Sleep wind down; inside or above
 * it, "Keep doing what's working." with nothing to do. `night` names the
 * night ("Last night", or "Your latest night" when last night isn't
 * answered yet).
 */
export function sleepAction(hours, target, night = 'Last night') {
  if (hours < target.from) return { state: 'below', lines: [`${night} was under your target range.`, 'Tonight, Sleep wind down could help.'], windDown: true };
  if (hours > target.to) return { state: 'above', lines: [`${night} was above your target range.`, 'Keep doing what’s working.'], windDown: false };
  return { state: 'inside', lines: [`${night} was inside your target range.`, 'Keep doing what’s working.'], windDown: false };
}

/** The top of the chart's scale: room above the tallest bar and the range, in whole hours. */
export function sleepScaleTop(slots, target) {
  const tallest = Math.max(0, ...slots.map((s) => s.hours ?? 0));
  return Math.max(10, Math.ceil(Math.max(tallest, target.to) + 1.5));
}
