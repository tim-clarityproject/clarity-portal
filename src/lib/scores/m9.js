// M9. Outcome Objectives: progress, pace and status (docs/scoring-methods.md, M9).
//
// An objective is tracked as a number (direction up or down), a rating out
// of 10 (higher is better) or a milestone. The database has a copy
// (public.score_m9_objective, migration 032), tested on the same cases.
//
// An objective: { kind: 'number'|'rating'|'milestone', direction: 'up'|'down',
//   start, startOn (the day it was set), target, byWhen, unit,
//   figures: [{ on, value }], dueOn, reachedOn }

import { m0Round } from './m0.js';
import { addDays, daysBetween, monthsBetween } from './dates.js';

/** Pace shows only after 3 finished weeks since the objective was set (Claude, 26 Oct). */
export const PACE_AFTER_WEEKS = 3;
/** Not moving: no change for 3 finished weeks (Tim, 26 Oct, 11:50). */
export const NOT_MOVING_WEEKS = 3;
/** Effort on track: within 3 points of the standard, or above it (M9.3). */
export const EFFORT_MARGIN = 3;

/** Whole weeks between two days: the finished weeks since a day (Claude: calendar weeks). */
export function m9FinishedWeeksSince(day, asOf) {
  return Math.floor(daysBetween(day, asOf) / 7);
}

/** The figure in force on a day: the last one entered on or before it, else the start figure. */
export function m9FigureOn(objective, day) {
  let value = objective.start;
  let best = null;
  (objective.figures || []).forEach((f, i) => {
    if (f.on <= day && (!best || f.on > best.on || (f.on === best.on && i > best.i))) best = { on: f.on, i, value: f.value };
  });
  return best ? best.value : value;
}

/** The day the figure last changed (its set day if it never has). */
function lastChangeDay(objective, asOf) {
  const list = (objective.figures || [])
    .map((f, i) => ({ ...f, i }))
    .filter((f) => f.on <= asOf)
    .sort((a, b) => (a.on < b.on ? -1 : a.on > b.on ? 1 : a.i - b.i));
  let value = objective.start;
  let changed = objective.startOn;
  for (const f of list) {
    if (f.value !== value) { changed = f.on; value = f.value; }
  }
  return changed;
}

/**
 * M9.2: time left to a milestone, in the unit that fits (Tim, 26 Oct, 10:47):
 * days under 2 weeks, weeks under 3 months, then months; "due today" and
 * "3 days overdue" at the ends. Calendar time.
 */
export function m9TimeLeft(asOf, dueOn) {
  const days = daysBetween(asOf, dueOn);
  if (days === 0) return { days, unit: 'day', count: 0, text: 'due today' };
  const n = Math.abs(days);
  const [later, earlier] = days > 0 ? [dueOn, asOf] : [asOf, dueOn];
  let months = 0;
  while (addMonths(earlier, months + 1) <= later) months += 1;
  let count;
  let unit;
  if (n < 14) { count = n; unit = 'day'; } else if (months < 3) { count = Math.floor(n / 7); unit = 'week'; } else { count = months; unit = 'month'; }
  const words = `${count} ${unit}${count === 1 ? '' : 's'}`;
  return { days, unit, count, text: days > 0 ? `${words} left` : `${words} overdue` };
}

function addMonths(day, k) {
  const [y, m, d] = day.split('-').map(Number);
  const total = (m - 1) + k;
  const yy = y + Math.floor(total / 12);
  const mm = (total % 12) + 1;
  const last = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  return `${yy}-${String(mm).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}

/**
 * M9: one objective's progress, pace and status on a day.
 * @param {object} objective
 * @param {{ asOf: string, sprintStart?: string|null }} ctx
 * @returns {object} kind-specific fields plus `status`: 'reached', 'on_track',
 *   'off_track' or 'too_early' (M19.1)
 */
export function m9Objective(objective, { asOf, sprintStart = null }) {
  if (!objective.startOn) objective = { ...objective, startOn: asOf };
  if (objective.kind === 'milestone' && !objective.dueOn) {
    const reached = Boolean(objective.reachedOn && objective.reachedOn <= asOf);
    return { kind: 'milestone', reached, onTrack: true, timeLeft: null, tooEarly: true, status: reached ? 'reached' : 'too_early' };
  }
  const weeksSinceSet = m9FinishedWeeksSince(objective.startOn, asOf);
  const tooEarly = weeksSinceSet < PACE_AFTER_WEEKS;

  if (objective.kind === 'milestone') {
    const reached = Boolean(objective.reachedOn && objective.reachedOn <= asOf);
    const notYetDue = asOf <= objective.dueOn;
    const onTrack = reached || notYetDue;
    return {
      kind: 'milestone',
      reached,
      onTrack,
      timeLeft: reached ? null : m9TimeLeft(asOf, objective.dueOn),
      tooEarly,
      status: reached ? 'reached' : tooEarly ? 'too_early' : onTrack ? 'on_track' : 'off_track',
    };
  }

  const down = objective.kind === 'number' && objective.direction === 'down';
  const sign = down ? -1 : 1;
  const current = m9FigureOn(objective, asOf);
  const { start, target } = objective;
  const reached = down ? current <= target : current >= target;

  let progress;
  if (down) progress = start === target ? 100 : ((start - current) / (start - target)) * 100;
  else progress = target === 0 ? 100 : (current / target) * 100;
  progress = Math.min(100, Math.max(0, progress));

  const monthsSince = monthsBetween(objective.startOn, asOf);
  const monthsLeft = monthsBetween(asOf, objective.byWhen);
  const rateSoFar = monthsSince > 0 ? (sign * (current - start)) / monthsSince : null;
  const rateNeeded = monthsLeft > 0 ? (sign * (target - current)) / monthsLeft : null;
  let onPace;
  if (reached) onPace = true;
  else if (rateNeeded == null) onPace = false; // the date has passed
  else onPace = rateSoFar != null && rateSoFar >= rateNeeded;

  const atSprintStart = sprintStart ? m9FigureOn(objective, addDays(sprintStart, -1)) : null;
  const improving = sprintStart != null && (down ? current < atSprintStart : current > atSprintStart);
  const notMoving = !reached && m9FinishedWeeksSince(lastChangeDay(objective, asOf), asOf) >= NOT_MOVING_WEEKS;

  return {
    kind: objective.kind,
    direction: down ? 'down' : 'up',
    current,
    progress,
    reached,
    rateSoFar,
    rateNeeded,
    onPace,
    paceShown: !tooEarly,
    asOf,
    improving,
    notMoving,
    tooEarly,
    status: reached ? 'reached' : tooEarly ? 'too_early' : onPace ? 'on_track' : 'off_track',
  };
}

/**
 * M9.1: the pace sentence (Tim, 26 Oct, 14:36). Null when pace isn't shown.
 * @param {object} objective
 * @param {object} result from m9Objective
 * @param {(day: string) => string} formatDate e.g. "30 Jun 2027"
 */
export function m9PaceSentence(objective, result, formatDate) {
  if (objective.kind === 'milestone' || !result.paceShown || result.reached) return null;
  const rating = objective.kind === 'rating';
  const goal = rating ? `${objective.target}/10` : `${objective.target}`;
  const when = formatDate(objective.byWhen);
  if (result.onPace) return `You're on pace to reach ${goal} by ${when}.`;
  const one = (x) => (Math.floor(Math.max(0, x) * 10 + 0.5 + 1e-9) / 10).toString();
  const unit = rating ? ' points' : objective.unit ? ` ${objective.unit}` : '';
  if (result.rateNeeded == null) return objective.byWhen === undefined || objective.byWhen < result.asOf ? `${goal} was due by ${when}.` : `${goal} is due today.`;
  return `Reaching ${goal} by ${when} needs ${one(result.rateNeeded)}${unit} a month, and you've averaged ${one(result.rateSoFar ?? 0)}.`;
}

/**
 * M9.3: an objective's effort is on track when the Strategies serving it
 * averaged within 3 points of the standard, or above it, over the current
 * sprint's finished weeks. The average is the mean of each Strategy's
 * sprint average (Claude), judged on the shown figure.
 * @param {(number|null)[]} strategyAverages
 */
export function m9EffortOnTrack(strategyAverages, standard) {
  const v = (strategyAverages || []).filter((x) => x != null);
  if (!v.length) return false;
  return m0Round(v.reduce((s, x) => s + x, 0) / v.length) >= standard - EFFORT_MARGIN;
}
