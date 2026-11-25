import { addDays, daysBetween, weekdayOf, dayKeyWords } from '../time/index.js';

// An agreement's end date (brief item 6; M28's builder and s-extend, s-pause). Day keys only ("2027-07-02"), through
// src/lib/time: no clock is read. Checked by tests/performance/agreements-end-date.test.mjs.
//
// The end date is worked out: the Friday of the week the last coaching session falls in, from the start date, the
// number of coaching sessions and How often. "Weekly" is 1 week apart, "Every 2 weeks" 2, "Monthly" 4, "Weekly for 6
// weeks, then every 2 weeks" as it says, and "As we agree" counts as every 2 weeks. A date the coach picks wins;
// extending or pausing sets a picked date. A last session on a Saturday or Sunday ends on the following Friday, never
// before it (risk 30).

export const RHYTHMS = Object.freeze(['Weekly', 'Every 2 weeks', 'Monthly', 'Weekly for 6 weeks, then every 2 weeks', 'As we agree']);
export const DEFAULT_RHYTHM = 'Weekly for 6 weeks, then every 2 weeks';
const FRIDAY = 5;

/** Weeks between coaching session i - 1 and i (i counts from 1). */
export function gapWeeks(i, rhythm) {
  if (rhythm === 'Weekly') return 1;
  if (rhythm === 'Monthly') return 4;
  if (rhythm === 'Weekly for 6 weeks, then every 2 weeks') return i <= 6 ? 1 : 2;
  return 2; // Every 2 weeks, As we agree, and anything else
}

/** Weeks from the first coaching session to the last of n. */
export function weeksToLast(n, rhythm) {
  let w = 0;
  for (let i = 2; i <= Math.max(1, Math.floor(Number(n) || 1)); i += 1) w += gapWeeks(i, rhythm);
  return w;
}

/** The day the last of n coaching sessions falls, counted in whole weeks from the start. */
export const lastSessionWeek = (start, n, rhythm) => addDays(start, weeksToLast(n, rhythm) * 7);

/** The Friday on or after a day. */
export function fridayOnOrAfter(day) {
  return addDays(day, (FRIDAY - weekdayOf(day) + 7) % 7);
}

/** How many coaching sessions blocks add up to: [{ n: 1, minutes: 90 }, { n: 15, minutes: 60 }] → 16. */
export const sessionCount = (blocks) => (blocks || []).reduce((a, b) => a + Math.max(0, Math.floor(Number(b?.n) || 0)), 0);

/** The suggested end date: the Friday of the last coaching session's week. `count` is a number or the blocks. */
export function suggestEnd(start, count, rhythm) {
  const n = Array.isArray(count) ? sessionCount(count) : Number(count);
  return fridayOnOrAfter(lastSessionWeek(start, n || 1, rhythm));
}

/** The builder's end-date choices: the suggested one, then 2, 4 and 8 weeks spare (M28's endOptsFrom). */
export function endOptions(suggested) {
  return [
    { value: suggested, label: `${dayKeyWords(suggested, { year: true })}, suggested` },
    ...[2, 4, 8].map((w) => {
      const v = addDays(suggested, w * 7);
      return { value: v, label: `${dayKeyWords(v, { year: true })}, ${w} weeks spare` };
    }),
  ];
}

/** The line under the end date: worked out, or the coach's own choice with the suggestion (M28's endHint). */
export function endHint({ start, count, rhythm, end, picked }) {
  const suggested = suggestEnd(start, count, rhythm);
  if (!picked || end === suggested) {
    const n = Array.isArray(count) ? sessionCount(count) : Number(count);
    return `Worked out: the last coaching session is in the week of ${dayKeyWords(lastSessionWeek(start, n || 1, rhythm), { year: true })}.`;
  }
  return `You chose this. Suggested: ${dayKeyWords(suggested, { year: true })}.`;
}

/** Extend the end date: the Friday after 2, 4, 8 or 12 more weeks (M28's extOpts). */
export function extendOptions(end) {
  return [2, 4, 8, 12].map((w) => {
    const v = fridayOnOrAfter(addDays(end, w * 7));
    return { value: v, label: dayKeyWords(v, { year: true }) };
  });
}

/**
 * Pausing from one day to another moves the end date on by the days paused plus 3 (a Monday to a Friday is 4 whole
 * weeks), to the Friday on or after it (M28's pause). Returns { ok, days, weeks, end, line } or { ok: false, line }.
 */
export function pauseMove(end, from, to) {
  if (!from || !to || to <= from) return { ok: false, line: 'Choose an Until date after From.' };
  const days = daysBetween(from, to) + 3;
  const weeks = Math.round(days / 7);
  const newEnd = fridayOnOrAfter(addDays(end, days));
  return {
    ok: true, days, weeks, end: newEnd,
    line: `Coaching pauses for ${weeks} ${weeks === 1 ? 'week' : 'weeks'}, so the end date moves to ${dayKeyWords(newEnd, { year: true })}.`,
  };
}
