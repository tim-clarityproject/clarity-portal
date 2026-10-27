// M1. Habit score: one measure, one week (docs/scoring-methods.md, M1).
//
// A habit's score is how close the week came to its own target, 0 to 100,
// never above 100. Seven ways to measure:
//
//   count               a number, target per day or per week
//   amount              a number with a unit, target per day or per week
//   yes_no_weekly       yes or no, once a week
//   yes_no_days_target  yes or no each day, against a target number of days a week
//                       (no target: every working day)
//   yes_no_days_limit   yes or no each day, no more than `limit` yes days a week
//   count_limit         keep a count under a limit, per day or per week
//   rating              1 to 5, higher or lower is better, against a target
//
// Logs: { date, value, toConfirm? }. Yes is 1 (or true), no is 0. An entry
// still "to confirm" (an odd entry, M12) is left out until confirmed.

export const MEASURES = Object.freeze([
  'count', 'amount', 'yes_no_weekly', 'yes_no_days_target', 'yes_no_days_limit', 'count_limit', 'rating',
]);
const LIMITS_AND_RATINGS = new Set(['yes_no_days_limit', 'count_limit', 'rating']);

const asNumber = (v) => (v === true ? 1 : v === false ? 0 : Number(v));
// A value that isn't a number of 0 or more can't be scored, so it is left out.
const usableValue = (v) => { const x = asNumber(v); return Number.isFinite(x) && x >= 0; };

/**
 * M1 limit rule: at or under the limit scores 100; each one over takes an
 * equal step off: 1 − (logged − limit) ÷ limit, never below 0. A limit of 0
 * is stepped as if it were 1, so one over scores 0 (Claude).
 */
export function m1LimitScore(logged, limit) {
  if (logged <= limit) return 100;
  return Math.max(0, 1 - (logged - limit) / Math.max(limit, 1)) * 100;
}

/**
 * M1 rating rule, on the part of the scale above the floor (Claude).
 * Higher is better: (average − 1) ÷ (target − 1). Lower is better:
 * (5 − average) ÷ (5 − target). Both capped at 100.
 */
export function m1RatingScore(average, target, direction = 'higher') {
  if (direction === 'lower') {
    if (target >= 5) throw new Error('A lower-is-better target must be 1 to 4.');
    return Math.min(1, Math.max(0, (5 - average) / (5 - target))) * 100;
  }
  if (target <= 1) throw new Error('A higher-is-better target must be 2 to 5.');
  return Math.min(1, Math.max(0, (average - 1) / (target - 1))) * 100;
}

/**
 * M1: a sensible top number for one day's count (experience rule 49): 3
 * times the daily target, or 20 with no daily target; some habits set their
 * own (training sessions 3, reflective notes 10).
 */
export function m1TopNumber(habit) {
  if (habit.topNumber != null) return habit.topNumber;
  if (habit.targetPer === 'day' && habit.target > 0) return habit.target * 3;
  return 20;
}

/**
 * M1: one habit's score for one week.
 *
 * @param {object} habit { measure, target, targetPer: 'day'|'week', limit,
 *   limitPer: 'day'|'week', direction: 'higher'|'lower' } (as in force that week)
 * @param {{date: string, value: number|boolean, toConfirm?: boolean}[]} logs the week's logs
 * @param {object} week
 *   days         the week's 7 sprint days
 *   workingDays  its working days (M0.3)
 *   soFarUntil   optional: score "so far" up to and including this day (M5)
 * @returns {{ score: number|null, notLogged: boolean, waiting?: boolean }}
 *   score null: nothing was expected of the habit this week (no working days,
 *   or a weekly yes or no not yet done "so far"), so it is left out (M4).
 */
export function m1HabitScore(habit, logs, week) {
  const until = week.soFarUntil || null;
  const inWeek = new Set(week.days);
  const used = (logs || []).filter((l) => inWeek.has(l.date) && !l.toConfirm && l.value != null && usableValue(l.value)
    && (!until || l.date <= until));
  const working = (week.workingDays || []).filter((d) => !until || d <= until);
  const allWorking = week.workingDays || [];
  // "So far": targets are pro rata to the working days gone (M5).
  const share = until ? (allWorking.length ? working.length / allWorking.length : 0) : 1;
  const sum = used.reduce((s, l) => s + asNumber(l.value), 0);
  const yesDays = new Set(used.filter((l) => asNumber(l.value) > 0).map((l) => l.date)).size;

  // Limits and ratings need half the working days logged, else "Not logged" (Claude).
  if (LIMITS_AND_RATINGS.has(habit.measure)) {
    const workingSet = new Set(working);
    const loggedWorking = new Set(used.filter((l) => workingSet.has(l.date)).map((l) => l.date)).size;
    if (working.length === 0 && used.length === 0) return { score: null, notLogged: false };
    if (loggedWorking * 2 < working.length) return { score: 0, notLogged: true };
    const loggedDays = new Set(used.map((l) => l.date)).size;
    if (habit.measure === 'rating') {
      if (!used.length) return { score: null, notLogged: false };
      return { score: m1RatingScore(sum / used.length, habit.target, habit.direction), notLogged: false };
    }
    if (habit.measure === 'yes_no_days_limit') {
      return { score: m1LimitScore(yesDays, habit.limit), notLogged: false };
    }
    // count_limit: a daily limit applies to each day logged (Claude).
    const limit = habit.limitPer === 'day' ? habit.limit * loggedDays : habit.limit;
    return { score: m1LimitScore(sum, limit), notLogged: false };
  }

  if (habit.measure === 'yes_no_weekly') {
    if (yesDays > 0) return { score: 100, notLogged: false };
    // So far, a weekly yes or no counts only once done (like an open to-do).
    return until ? { score: null, notLogged: false, waiting: true } : { score: 0, notLogged: false };
  }

  let target;
  let got;
  if (habit.measure === 'yes_no_days_target') {
    target = habit.target != null ? habit.target : allWorking.length;
    got = yesDays;
  } else if (habit.measure === 'count' || habit.measure === 'amount') {
    target = habit.targetPer === 'day' ? habit.target * allWorking.length : habit.target;
    got = sum;
  } else {
    throw new Error(`Unknown measure: ${habit.measure}`);
  }
  target *= share;
  if (!(target > 0)) return { score: null, notLogged: false };
  return { score: Math.min(1, got / target) * 100, notLogged: false };
}
