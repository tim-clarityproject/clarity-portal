// M0. Shared rules (docs/scoring-methods.md, M0.1 to M0.6).
//
// Every score in the library is a number from 0 to 100, kept in full
// precision; only what people see is rounded (M0.1). Days are date keys
// ('YYYY-MM-DD') in the person's own local time (M0.2).

import { addDays, dayNumber, fromDayNumber, weekday } from './dates.js';

// ---------------------------------------------------------------- M0.1
// Floating point can leave 84.5 as 84.49999999999999; the tiny nudge keeps
// a true half rounding up. The database copy uses the same nudge.
const NUDGE = 1e-9;

/** M0.1: a whole number for display, halves rounded up (84.5 shows as 85). */
export function m0Round(x) {
  if (x == null || Number.isNaN(x)) return null;
  return Math.floor(x + 0.5 + NUDGE);
}

/** M0.1: hours to one decimal place ("7.1 hours"), halves up. */
export function m0RoundHours(x) {
  if (x == null) return null;
  return Math.floor(x * 10 + 0.5 + NUDGE) / 10;
}

/** M0.1 and M7: at or above the standard, judged on the shown (rounded) figure. */
export function m0AtStandard(score, standard) {
  if (score == null) return false;
  return m0Round(score) >= standard;
}

/** M0.1: a change people see ("+5", "−3"): the difference of the two rounded figures. */
export function m0Change(now, before) {
  if (now == null || before == null) return null;
  return m0Round(now) - m0Round(before);
}

// ---------------------------------------------------------------- M0.3
/** The default working pattern: Monday to Friday (Monday 0 … Sunday 6). */
export const DEFAULT_WORKING_DAYS = Object.freeze([0, 1, 2, 3, 4]);

/**
 * M0.3: the working pattern in force on a day. `history` is a list of
 * { from: date key, days: [0..6] }; the latest one starting on or before
 * the day wins. No history means Monday to Friday.
 */
export function m0WorkingPatternOn(history, day) {
  let best = null;
  for (const p of history || []) {
    if (p.from <= day && (!best || p.from >= best.from)) best = p;
  }
  return best ? [...best.days] : [...DEFAULT_WORKING_DAYS];
}

/**
 * M0.3: the working days of one sprint week. A change to the pattern applies
 * from the next sprint week (Claude), so the pattern is the one in force on
 * the week's first day, applied to all its days.
 * @param {string[]} weekDays the week's 7 sprint days
 */
export function m0WorkingDaysOfWeek(history, weekDays) {
  const pattern = new Set(m0WorkingPatternOn(history, weekDays[0]));
  return weekDays.filter((d) => pattern.has(weekday(d)));
}

// ---------------------------------------------------------------- M0.4
/**
 * M0.4: a sprint's weeks in sprint time. Recovery pauses sprint time: every
 * day from a Recovery's start day up to the day before "I'm ready to go
 * again" is skipped (Claude: the day someone says they're ready counts
 * again). An unfinished Recovery pauses every day from its start.
 *
 * @param {{ start: string, lengthWeeks: number, recoveries?: {start: string, end?: string|null}[] }} sprint
 * @param {string} today the person's local today
 * @returns {{ weeks: {number: number, days: string[], start: string, end: string,
 *   recoveryDaysInside: number, finished: boolean}[], plannedEnd: string, actualEnd: string|null,
 *   recoveryDays: Set<string> }}
 *   actualEnd is null while a Recovery is still running (the end isn't known).
 */
export function m0SprintCalendar(sprint, today) {
  const recoveryDays = new Set();
  const total = sprint.lengthWeeks * 7;
  const startN = dayNumber(sprint.start);
  // While a Recovery is still running, sprint time stops at its start: the
  // days after it aren't known yet.
  let horizon = Infinity;
  for (const r of sprint.recoveries || []) {
    const from = dayNumber(r.start);
    if (!r.end) {
      horizon = Math.min(horizon, from - 1);
      for (let n = from; n <= Math.max(from, dayNumber(today)); n += 1) recoveryDays.add(fromDayNumber(n));
      continue;
    }
    for (let n = from; n <= dayNumber(r.end) - 1; n += 1) recoveryDays.add(fromDayNumber(n));
  }
  const open = horizon !== Infinity;
  const sprintDays = [];
  for (let n = startN; sprintDays.length < total && n <= horizon; n += 1) {
    const key = fromDayNumber(n);
    if (!recoveryDays.has(key)) sprintDays.push(key);
  }
  const weeks = [];
  for (let w = 0; w * 7 < sprintDays.length; w += 1) {
    const days = sprintDays.slice(w * 7, w * 7 + 7);
    const start = days[0];
    const end = days[days.length - 1];
    let inside = 0;
    for (let n = dayNumber(start); n <= dayNumber(end); n += 1) {
      if (recoveryDays.has(fromDayNumber(n))) inside += 1;
    }
    weeks.push({ number: w + 1, days, start, end, recoveryDaysInside: inside, finished: days.length === 7 && end < today });
  }
  const plannedEnd = addDays(sprint.start, total - 1);
  const complete = sprintDays.length === total;
  return { weeks, plannedEnd, actualEnd: open || !complete ? null : sprintDays[total - 1], recoveryDays };
}

/**
 * The sprint week a day belongs to: the first week whose last day is on or
 * after it (so a Recovery day inside or just before a week belongs to that
 * week). Null for a day before the sprint or after its last week.
 */
export function m0WeekOfDay(weeks, day) {
  if (!weeks.length || day < weeks[0].start) return null;
  const w = weeks.find((wk) => wk.end >= day);
  return w ? w.number : null;
}

/**
 * M0.4: a finished week's score is final once the debrief is done or the
 * debrief window closes, 3 days after the week ends.
 */
export function m0WeekIsFinal(week, today, debriefDone) {
  if (!week.finished) return false;
  return Boolean(debriefDone) || today > addDays(week.end, 3);
}

// ---------------------------------------------------------------- M0.5
/** A week is "mostly in Recovery" when Recovery covers 4 or more days inside it (Claude). */
export const MOSTLY_RECOVERY_DAYS = 4;

/**
 * M0.5: whether a finished week counts for the usual range and patterns.
 * Thin: fewer than 4 days logged, or for someone who works fewer than 4
 * days, fewer than all their working days. Any logged day counts, days off
 * included.
 * @param {{ finished: boolean, recoveryDaysInside?: number, travel?: boolean,
 *   unusual?: boolean, loggedDays: number, workingDays: number }} w
 */
export function m0WeekIsEligible(w) {
  if (!w.finished) return false;
  if ((w.recoveryDaysInside || 0) >= MOSTLY_RECOVERY_DAYS) return false;
  if (w.travel || w.unusual) return false;
  return w.loggedDays >= Math.min(4, w.workingDays);
}
