// The end-of-sprint review (mock-up M6, "End-of-sprint review"): what it
// shows about the sprint, and what finishing it changes in the plan.
// Pure code: no database, no React, no device clock (today is passed in),
// tested in tests/performance/sprintReview.test.mjs.
//
// Every figure comes from src/lib/scores: the sprint's weeks as the sprint
// page shows them (sprintPageView: M0, M5, M7), M6 for the average, the
// weeks at the standard, the best week and "Since you started", M9 for
// each objective, M1 and M11 for the habits kept up.
//
// UNDEFINED in the methods (audit section 4, items 8 and 9), the safe
// choices made here and listed in progress.md:
// - "Great sprint, [first name]! You averaged 86%." when the average is
//   at or above the standard (m0AtStandard, judged on the shown figure);
//   "Not your strongest sprint. What still went well?" below it (M6 note).
// - A habit "has stuck" when it was kept up (M11: scored 100) in at least
//   75% of its scored finished weeks (6 of 8), and at least one week
//   counted.

import { addDays } from '../scores/dates.js';
import {
  m0AtStandard,
  m0Change,
  m0Round,
  m0SprintCalendar,
  m6SinceStarted,
  m6SprintFigures,
  m9FigureOn,
  m9Objective,
  m11HabitKeptUp,
} from '../scores/index.js';
import { draftFromRows, objectiveComplete, objectiveRow } from './builder';
import { openRecovery, settingForWeek, sprintWeekResult, toMeasure, toObjective, toRecoveries } from './rows';
import { dayName, sprintPageView, weekRange } from './sprintPage';
import { finishDay, nextSprintNumber, sprintStanding } from './sprintStart';
import { planSnapshot } from './versions';
import { habitMeasureLine, objectiveFigure, plainNumber, shortDate } from './words';
import { frozenWeeks } from './year';

/** Kept up in at least this share of the scored finished weeks (Claude's call, 6 of 8). */
export const STUCK_SHARE = 0.75;

/** The opening line (UNDEFINED 8: the standard decides which). */
export function reviewOpening(average, standard, firstName) {
  if (average == null) return { great: false, question: 'Let’s look back on this sprint.' };
  if (m0AtStandard(average, standard)) {
    return { great: true, question: `Great sprint${firstName ? `, ${firstName}` : ''}! You averaged ${m0Round(average)}%.` };
  }
  return { great: false, question: 'Not your strongest sprint. What still went well?' };
}

const change = (n) => (n > 0 ? `up ${plainNumber(n)}` : n < 0 ? `down ${plainNumber(-n)}` : 'the same');

/** "Since you started: average up 5, Hardware score up 12, 1 objective reached." Only the parts with data. */
export function sinceStartedLine(since) {
  if (!since) return null;
  const parts = [];
  if (since.averageChange != null) parts.push(`average ${change(since.averageChange)}`);
  if (since.hardwareChange != null) parts.push(`Hardware score ${change(since.hardwareChange)}`);
  if (since.objectivesReached) parts.push(`${since.objectivesReached} ${since.objectivesReached === 1 ? 'objective' : 'objectives'} reached`);
  return parts.length ? `Since you started: ${parts.join(', ')}.` : null;
}

/** An objective's grey lines on its Keep, Change or Retire row (M6). */
export function objectiveLines(o, result, startFigure) {
  if (o.kind === 'milestone') {
    return ['Milestone', result.reached ? 'Done' : 'Not yet', `By ${shortDate(o.dueOn)}`];
  }
  const now = result.current;
  const figure = o.kind === 'rating' ? objectiveFigure(o, now) : `${objectiveFigure(o, now)} of ${objectiveFigure(o, o.target)}`;
  const moved = startFigure == null ? null : m0Change(now, startFigure);
  const lines = [figure];
  if (moved) lines.push(`${moved > 0 ? 'Up' : 'Down'} ${plainNumber(Math.abs(moved))} this sprint`);
  lines.push(`By ${shortDate(o.byWhen)}`);
  return lines;
}

/**
 * The review's whole view.
 * @param {object} d rows from loadSprintReview: the running sprint's rows
 *   as loadSprintPage, plus every sprint, the plan's live objectives (full
 *   rows) and figures, its habits, the finished check-ins and the first name
 * @param {{ today: string }} opts the person's local today
 */
export function reviewView(d, { today }) {
  if (!d) return null;
  const sprint = d.sprint || null;
  if (!sprint) return { state: 'none', today };
  const name = `Performance Sprint ${sprint.number}`;
  const standing = sprintStanding(sprint, d.recoveries || [], today);
  const base = { today, sprintId: sprint.id, number: sprint.number, name, standard: sprint.standard, nextNumber: nextSprintNumber(d.sprints || [sprint]) };
  if (!standing.started) return { ...base, state: 'future', startsOn: dayName(sprint.start_on, today) };

  // In Recovery the sprint is paused and its scores are hidden (M15), so
  // its review waits until the person is back (Claude's call).
  if (openRecovery(d.recoveries || [])) return { ...base, state: 'paused' };

  // The sprint's weeks as its page shows them.
  const page = sprintPageView(d, { today });
  const weeks = page.weeks || [];
  const figures = m6SprintFigures(weeks.map((w) => ({ number: w.number, score: w.raw, finished: w.finished })), sprint.standard);
  const opening = reviewOpening(figures.average, sprint.standard, (d.firstName || '').trim() || null);
  const best = figures.best ? weeks[figures.best.number - 1] : null;

  // The sprint before (M6 "Up from 4 of 8 last sprint.": in a pop-up only).
  const sprints = [...(d.sprints || [])].sort((a, b) => a.number - b.number);
  const previous = sprints.filter((s) => s.number < sprint.number && s.status === 'finished').at(-1) || null;
  const averageOf = (s) => {
    const ws = frozenWeeks(s, d.recoveries || [], d.weekScores || [], today);
    return m6SprintFigures(ws.map((w) => ({ number: w.number, score: w.raw, finished: w.finished })), s.standard);
  };
  const prev = previous ? averageOf(previous) : null;
  const lastSprintLine = prev && prev.finishedWeeks
    ? `Last sprint, ${prev.weeksAtStandard} of ${prev.finishedWeeks} weeks were at your standard.`
    : null;

  // Since you started (M6): from the first sprint, the first and latest
  // check-in, and the objectives reached.
  const first = sprints[0] && sprints[0].id !== sprint.id ? sprints[0] : null;
  const checkins = (d.checkins || []).filter((c) => c.hardware_score != null).sort((a, b) => (a.month < b.month ? -1 : 1));
  const objectives = (d.planObjectives || []).map((row) => {
    const objective = toObjective(row, d.figures || []);
    const result = m9Objective(objective, { asOf: today, sprintStart: sprint.start_on });
    const startFigure = objective.kind === 'milestone' ? null : m9FigureOn(objective, addDays(sprint.start_on, -1));
    return { id: row.id, name: row.name, row, objective, result, lines: objectiveLines(objective, result, startFigure) };
  });
  const since = m6SinceStarted({
    firstAverage: first ? averageOf(first).average : null,
    currentAverage: first ? figures.average : null,
    firstHardware: checkins.length > 1 ? Number(checkins[0].hardware_score) : null,
    latestHardware: checkins.length > 1 ? Number(checkins.at(-1).hardware_score) : null,
    objectivesReached: objectives.filter((o) => o.result.reached).length,
  });

  // The habits that stuck: each sprint habit's M1 score in every finished
  // week (M11 kept up when it scored 100).
  const calendar = m0SprintCalendar(
    { start: sprint.start_on, lengthWeeks: sprint.length_weeks, recoveries: toRecoveries(d.recoveries || []) },
    today,
  );
  const finishedNumbers = weeks.filter((w) => w.finished).map((w) => w.number);
  const scoresBy = new Map();
  for (const n of finishedNumbers) {
    const r = sprintWeekResult(d, calendar, n);
    for (const h of r.result.habits) {
      if (!scoresBy.has(h.id)) scoresBy.set(h.id, []);
      scoresBy.get(h.id).push(h.score ?? null);
    }
  }
  const planHabitIds = new Set((d.planHabits || []).map((h) => h.id));
  const stuck = [];
  for (const sh of d.sprintHabits || []) {
    const kept = m11HabitKeptUp(scoresBy.get(sh.id) || []);
    if (!kept.of || kept.keptUp / kept.of < STUCK_SHARE) continue;
    const setting = settingForWeek(d.sprintSettings || [], sh.id, finishedNumbers.at(-1) || 1);
    stuck.push({
      id: sh.id,
      name: sh.name,
      strategyId: sh.strategy_id,
      setting,
      measureLine: setting ? habitMeasureLine(toMeasure(setting)) : '',
      keptLine: `Kept up in ${kept.keptUp} of ${kept.of} weeks`,
      inPlan: Boolean(sh.habit_id && planHabitIds.has(sh.habit_id)),
    });
  }

  return {
    ...base,
    state: standing.over ? 'over' : 'running',
    endsOn: dayName(standing.endOn, today),
    finishOn: finishDay(sprint, d.recoveries || [], today, null),
    weeks,
    toFreeze: page.toFreeze || [],
    dates: page.dates,
    opening,
    average: figures.average == null ? null : `${m0Round(figures.average)}%`,
    averageGood: m0AtStandard(figures.average, sprint.standard),
    atStandard: figures.finishedWeeks ? { value: String(figures.weeksAtStandard), of: `of ${figures.finishedWeeks}` } : null,
    best: best ? { value: `Week ${best.number}, ${best.score}%`, range: weekRange(best, today), good: best.state === 'good' } : null,
    lastSprintLine,
    sinceLine: sinceStartedLine(since),
    objectives,
    stuck,
  };
}

// ---------------------------------------------------------------- finishing

/** An objective in the editor's shape, from its row. */
export function objectiveDraft(row) {
  return draftFromRows({ objectives: [row] }).objectives[0];
}

/**
 * What finishing the review changes in the plan, worked out from the
 * draft: each objective kept, changed (only when the change is complete;
 * otherwise it stays as it was) or retired; the objectives added (when
 * complete); the habits added to the plan from this sprint, each linked
 * back to its sprint habit. Then the plan before and after as versions
 * see it, so the change makes a major or minor version (versions.js).
 *
 * @param {object} d rows from loadSprintReview
 * @param {{ objectives: Record<string, {choice, edit}>, added: object[], stick: Record<string, string> }} draft
 *   stick: sprint habit id to the new plan habit's id (made on the device)
 * @returns {{ saves: object[], archive: string[], habits: object[], before: object, after: object,
 *   unfinishedChanges: number, unfinishedAdded: number }}
 */
export function reviewPlanChanges(d, draft, today) {
  const rows = d.planObjectives || [];
  const saves = [];
  const archive = [];
  let unfinishedChanges = 0;
  let unfinishedAdded = 0;
  const afterObjectives = [];
  rows.forEach((row, i) => {
    const c = draft.objectives?.[row.id];
    if (c?.choice === 'retire') {
      archive.push(row.id);
      return;
    }
    if (c?.choice === 'change' && c.edit) {
      if (objectiveComplete(c.edit)) {
        const r = objectiveRow({ ...c.edit, id: row.id, saved: true }, row.sort_order ?? i, today);
        saves.push(r);
        afterObjectives.push({ ...row, name: r.name, kind: r.kind, unit: r.unit, direction: r.direction, start_value: r.start, target_value: r.target, by_when: r.byWhen, due_on: r.dueOn });
        return;
      }
      unfinishedChanges += 1;
    }
    afterObjectives.push(row);
  });
  const nextSort = rows.reduce((n, r) => Math.max(n, (r.sort_order ?? 0) + 1), 0);
  (draft.added || []).forEach((o, i) => {
    if (!objectiveComplete(o)) {
      if ((o.name || '').trim()) unfinishedAdded += 1;
      return;
    }
    const r = objectiveRow({ ...o, saved: false }, nextSort + i, today);
    saves.push(r);
    afterObjectives.push({ id: r.id, name: r.name, kind: r.kind, unit: r.unit, direction: r.direction, start_value: r.start, target_value: r.target, by_when: r.byWhen, due_on: r.dueOn, sort_order: r.sortOrder });
  });

  const habits = [];
  const planHabits = d.planHabits || [];
  const habitSort = planHabits.reduce((n, h) => Math.max(n, (h.sort_order ?? 0) + 1), 0);
  for (const [sprintHabitId, habitId] of Object.entries(draft.stick || {})) {
    const sh = (d.sprintHabits || []).find((x) => x.id === sprintHabitId);
    if (!sh || sh.habit_id) continue;
    const setting = [...(d.sprintSettings || [])].filter((s) => s.sprint_habit_id === sh.id).sort((a, b) => b.from_week - a.from_week)[0];
    if (!setting) continue;
    const m = toMeasure(setting);
    habits.push({
      sprintHabitId,
      row: {
        id: habitId,
        strategyId: sh.strategy_id,
        name: sh.name,
        measure: m.measure,
        unit: m.unit,
        target: m.target,
        targetPer: m.targetPer,
        limit: m.limit,
        limitPer: m.limitPer,
        direction: m.direction,
        topNumber: m.topNumber,
        impact: m.impact,
        sortOrder: habitSort + habits.length,
      },
    });
  }
  const afterHabits = [
    ...planHabits,
    ...habits.map(({ row }) => ({
      id: row.id, strategy_id: row.strategyId, name: row.name, measure: row.measure, unit: row.unit, target: row.target,
      target_per: row.targetPer, limit_value: row.limit, limit_per: row.limitPer, direction: row.direction, top_number: row.topNumber, impact: row.impact, sort_order: row.sortOrder,
    })),
  ];
  const current = { mission: d.plan?.mission, objectives: rows, strategies: d.strategies || [], links: d.links || [], habits: planHabits };
  const before = d.latestVersion?.snapshot || planSnapshot(current);
  const after = planSnapshot({ ...current, objectives: afterObjectives, habits: afterHabits });
  return { saves, archive, habits, before, after, unfinishedChanges, unfinishedAdded };
}

/** The lines on "What's next?" about changes that aren't finished, so they aren't made. */
export function unfinishedNotes({ unfinishedChanges, unfinishedAdded }) {
  const notes = [];
  if (unfinishedChanges) {
    notes.push(unfinishedChanges === 1
      ? 'One change to an objective isn’t finished, so that objective stays as your plan has it.'
      : `${unfinishedChanges} changes to objectives aren’t finished, so those objectives stay as your plan has them.`);
  }
  if (unfinishedAdded) {
    notes.push(unfinishedAdded === 1
      ? 'One new objective isn’t finished, so it isn’t added.'
      : `${unfinishedAdded} new objectives aren’t finished, so they aren’t added.`);
  }
  return notes;
}

