// Start a sprint (mock-up M6, "Start a sprint"): which sprint comes next,
// whether one is still running, the day a running one finishes on when the
// next is started, the habits the new sprint takes from the plan, and the
// one record of everything the start writes. Pure code, no database and no
// React (tested in tests/performance/sprintStart.test.mjs).
//
// One running sprint per person (audit risk R4): starting a sprint
// finishes the one before it first, even when its review was skipped.
// A sprint that starts in the future is running from the moment it is made.
//
// Double taps and a refresh mid-save: every id the start writes is made
// once, kept on the device with the rest of the start (sprintSetup.js
// keepPendingStart), and sent again unchanged if the save is interrupted,
// so sending it twice can never make a second sprint.

import { STANDARD_CHOICES, m0SprintCalendar } from '../scores/index.js';
import { SPRINT_LENGTHS, habitRow, habitComplete, startingSprint, TEMPLATE_LABEL } from './builder';
import { toMeasure, toRecoveries } from './rows';

export const LABEL_MAX = 60; // sprints.label

/** A pure date sum on "YYYY-MM-DD" keys (never "today"). */
export function shiftDay(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}

const earliest = (...keys) => keys.filter(Boolean).sort()[0];
const latest = (...keys) => keys.filter(Boolean).sort().at(-1);

/** The next sprint's number: one after the highest so far, or 1. */
export function nextSprintNumber(sprints = []) {
  return sprints.reduce((n, s) => Math.max(n, s.number || 0), 0) + 1;
}

/** The running sprint, if any (one per person). */
export function runningSprint(sprints = []) {
  return sprints.find((s) => s.status === 'running') || null;
}

/**
 * Where a running sprint stands today (methods M0.4: Recovery moves its
 * end later). `over` once its last day has passed; `endOn` is its end as
 * it stands (the planned end while a Recovery is still open).
 */
export function sprintStanding(sprint, recoveries = [], today) {
  const cal = m0SprintCalendar(
    { start: sprint.start_on, lengthWeeks: sprint.length_weeks, recoveries: toRecoveries(recoveries) },
    today,
  );
  const endOn = cal.actualEnd || cal.plannedEnd;
  return {
    started: sprint.start_on <= today,
    over: Boolean(cal.actualEnd) && cal.actualEnd < today,
    endOn,
  };
}

/**
 * The last day of a running sprint finished because the next one starts
 * (Claude's call): its own end when that has passed; otherwise today, or
 * the day before the new sprint when that starts today or earlier, so the
 * two never share a day. A sprint that never started ends the day before
 * its start (it held no days).
 */
export function finishDay(sprint, recoveries = [], today, newStart) {
  const { endOn } = sprintStanding(sprint, recoveries, today);
  const end = earliest(endOn, today, newStart ? shiftDay(newStart, -1) : null);
  return latest(end, shiftDay(sprint.start_on, -1));
}

// ---------------------------------------------------------------- habits

/**
 * One habit as a sprint copies it (api.startSprint's shape). `habitId`
 * is the plan's habit, or null for a habit added for this sprint only.
 */
function sprintHabit({ habitId, strategyId, name, measure, unit, target, targetPer, limit, limitPer, direction, topNumber, impact }) {
  return {
    habitId: habitId || null,
    strategyId,
    name,
    measure,
    unit: unit ?? null,
    target: target ?? null,
    targetPer: targetPer ?? null,
    limit: limit ?? null,
    limitPer: limitPer ?? null,
    direction: direction ?? null,
    topNumber: topNumber ?? null,
    impact: [1, 2, 3].includes(impact) ? impact : 2,
  };
}

/** A plan habit's row (habits table) as the sprint copies it, unchanged. */
export function habitFromPlanRow(row) {
  return sprintHabit({ habitId: row.id, strategyId: row.strategy_id, name: row.name, ...toMeasure(row) });
}

/**
 * The habits the new sprint takes (M6 "Which habits are you bringing
 * across?"): each of the plan's habits kept as it is, changed for this
 * sprint (a change that isn't finished keeps the plan's settings), or
 * removed; then the habits added for this sprint only, once complete.
 * The plan itself never changes here.
 *
 * @param {object[]} planHabits the plan's live habits rows, in order
 * @param {Record<string, {choice: 'keep'|'change'|'remove', edit?: object}>} carry
 * @param {object[]} added habits in the builder's draft shape (emptyHabit)
 * @returns {{ habits: object[], unfinishedChanges: number, unfinishedAdded: number }}
 */
export function sprintHabitsFrom(planHabits = [], carry = {}, added = []) {
  const habits = [];
  let unfinishedChanges = 0;
  let unfinishedAdded = 0;
  for (const row of planHabits) {
    const c = carry[row.id];
    if (c?.choice === 'remove') continue;
    if (c?.choice === 'change' && c.edit) {
      if (habitComplete(c.edit)) {
        const r = habitRow(c.edit, 0);
        habits.push(sprintHabit({ ...r, habitId: row.id, strategyId: row.strategy_id }));
        continue;
      }
      unfinishedChanges += 1;
    }
    habits.push(habitFromPlanRow(row));
  }
  for (const h of added) {
    if (!habitComplete(h)) {
      if ((h.name || '').trim() || String(h.target || '').trim()) unfinishedAdded += 1;
      continue;
    }
    habits.push(sprintHabit({ ...habitRow(h, 0), habitId: null }));
  }
  return { habits, unfinishedChanges, unfinishedAdded };
}

/** "8 habits", "1 habit", "None". */
export function habitCountWords(n) {
  if (!n) return 'None';
  return n === 1 ? '1 habit' : `${n} habits`;
}

// ---------------------------------------------------------------- the start

/** The label saved with the sprint: what was typed, else the template's, else none. */
export function sprintLabel(typed, template = false) {
  const t = (typed || '').trim().slice(0, LABEL_MAX);
  return t || (template ? TEMPLATE_LABEL : null);
}

/**
 * The answers for the steps from a first sprint chosen in Build your plan
 * (sprintSetup.js), when that sprint wasn't made (its start day passed):
 * the same length, label and standard, starting next Monday.
 */
export function sprintAnswersFrom(setup, nextMonday) {
  const a = startingSprint(nextMonday);
  if (setup?.template) a.tpl = true;
  else if (SPRINT_LENGTHS.includes(setup?.lengthWeeks)) a.len = setup.lengthWeeks;
  else if (setup?.lengthWeeks) Object.assign(a, { other: true, otherLen: String(setup.lengthWeeks) });
  if (STANDARD_CHOICES.includes(setup?.standard)) a.std = setup.standard;
  else if (setup?.standard) Object.assign(a, { stdOther: true, otherStd: String(setup.standard) });
  return a;
}

/**
 * Everything a start writes, with every id made now, so a resend writes
 * the same rows: the running sprint finished first (if there is one),
 * then the new sprint and each habit with its settings from week 1.
 *
 * @param {() => string} makeId newId on the device
 */
export function pendingStart({ planId, number, startOn, lengthWeeks, standard, label = null, habits = [], finish = null }, makeId) {
  return {
    sprintId: makeId(),
    planId,
    number,
    startOn,
    lengthWeeks,
    standard,
    label: label || null,
    finish: finish ? { sprintId: finish.sprintId, number: finish.number, endOn: finish.endOn } : null,
    habits: habits.map((h, i) => ({ ...h, sprintHabitId: makeId(), settingId: makeId(), sortOrder: i })),
    at: Date.now(),
  };
}

/** How long a start kept on the device is sent again (Claude's call). */
export const PENDING_KEEP_MS = 24 * 60 * 60 * 1000;

/**
 * What to do with a start kept on the device when the page opens:
 * 'resend' (it may not all have arrived: a save cut off by a refresh, or
 * waiting in the offline queue), or 'drop' when it is over a day old or a
 * different sprint already has its number (made elsewhere, e.g. another
 * device). Sending it again writes the same rows, so it is always safe.
 */
export function pendingAction(pending, sprints = [], now = Date.now()) {
  if (!pending?.sprintId) return 'drop';
  if (pending.at && now - pending.at > PENDING_KEEP_MS) return 'drop';
  const sameNumber = sprints.find((s) => s.number === pending.number);
  if (sameNumber && sameNumber.id !== pending.sprintId) return 'drop';
  return 'resend';
}
