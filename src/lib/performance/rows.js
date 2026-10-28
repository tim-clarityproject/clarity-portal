// From the Phase 1 tables to the shapes the scoring library reads
// (src/lib/scores), in one place. Pure code: no database, no React. The
// page loads the rows (api.js) and these turn them into objectives for M9
// and a sprint week for M5, so no screen works out a score itself.

import { getLocalDateKey } from '../dateFormatter';
import {
  m0SprintCalendar,
  m0WeekOfDay,
  m0WorkingDaysOfWeek,
  m5WeekFromRaw,
  m9Objective,
} from '../scores/index.js';

/** Today in the person's own time zone (M0.2), else the device's day. */
export function localToday(timeZone, now = new Date()) {
  if (timeZone) {
    try {
      const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
      const get = (t) => parts.find((p) => p.type === t)?.value;
      if (get('year') && get('month') && get('day')) return `${get('year')}-${get('month')}-${get('day')}`;
    } catch {
      // An unknown time zone: the device's own day.
    }
  }
  return getLocalDateKey(now);
}

/** An outcome_objectives row and its figures, as M9 reads it. */
export function toObjective(row, figures = []) {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    unit: row.unit,
    direction: row.direction || 'up',
    start: row.start_value == null ? null : Number(row.start_value),
    startOn: row.start_set_on,
    target: row.target_value == null ? null : Number(row.target_value),
    byWhen: row.by_when,
    dueOn: row.due_on,
    reachedOn: row.reached_on,
    sortOrder: row.sort_order ?? 0,
    figures: figures
      .filter((f) => f.objective_id === row.id)
      .sort((a, b) => (a.recorded_on < b.recorded_on ? -1 : a.recorded_on > b.recorded_on ? 1 : (a.created_at < b.created_at ? -1 : 1)))
      .map((f) => ({ on: f.recorded_on, value: Number(f.value) })),
  };
}

/** A habits or sprint_habit_settings row's measure, as M1 reads it. */
export function toMeasure(row) {
  return {
    measure: row.measure,
    unit: row.unit,
    target: row.target == null ? null : Number(row.target),
    targetPer: row.target_per,
    limit: row.limit_value == null ? null : Number(row.limit_value),
    limitPer: row.limit_per,
    direction: row.direction,
    topNumber: row.top_number == null ? null : Number(row.top_number),
    impact: row.impact ?? 2,
  };
}

/** The setting in force in a sprint week: the latest from_week on or before it. */
export function settingForWeek(settings, sprintHabitId, weekNumber) {
  let best = null;
  for (const s of settings) {
    if (s.sprint_habit_id !== sprintHabitId || s.from_week > weekNumber) continue;
    if (!best || s.from_week > best.from_week) best = s;
  }
  return best;
}

/**
 * A todos row and its moves, as M2 reads it. M2 starts from the week the
 * to-do was first planned for and applies each move in turn, so with
 * moves the planned week is the first move's starting week (the row
 * itself holds where the last move left it). A week in another sprint
 * has no week here.
 */
export function toTodo(row, moves = [], sprintId = row.sprint_id) {
  const own = moves
    .filter((m) => m.todo_id === row.id)
    .sort((a, b) => (a.moved_on < b.moved_on ? -1 : a.moved_on > b.moved_on ? 1 : (a.created_at || '') < (b.created_at || '') ? -1 : 1));
  const first = own[0];
  const plannedWeek = first
    ? (first.from_sprint_id === sprintId ? first.from_week : null)
    : (row.sprint_id === sprintId ? row.planned_week : null);
  return {
    id: row.id,
    strategyId: row.strategy_id,
    impact: row.impact ?? 2,
    text: row.text,
    createdOn: row.created_on,
    plannedWeek: plannedWeek ?? null,
    // Where it is planned now (after every move).
    currentWeek: row.sprint_id === sprintId ? row.planned_week : null,
    doneOn: row.done_on,
    deleted: Boolean(row.deleted_at),
    moves: own.map((m) => ({ on: m.moved_on, toWeek: m.to_sprint_id === sprintId ? m.to_week : null })),
  };
}

/** A wins row and the Strategies it helped, as M3 reads it. */
export function toWin(row, links = []) {
  return {
    id: row.id,
    date: row.local_date,
    impact: row.impact ?? 2,
    deleted: Boolean(row.deleted_at),
    strategyIds: links.filter((l) => l.win_id === row.id).map((l) => l.strategy_id),
  };
}

/** working_patterns rows as the M0.3 history. */
export function toWorkingHistory(rows = []) {
  return rows.map((r) => ({ from: r.starts_on, days: (r.days || []).map(Number) }));
}

/** recovery_periods rows as the sprint's Recoveries (M0.4): an open one has no end. */
export function toRecoveries(rows = []) {
  return rows.map((r) => ({ start: r.start_on, end: r.ended_at ? r.end_on : null }));
}

/** The Recovery running now, if any. */
export function openRecovery(rows = []) {
  return rows.find((r) => !r.ended_at) || null;
}

/**
 * How many objectives each Strategy serves (for M5's weighting), from the
 * plan's links and its live objectives.
 */
export function servedCounts(strategies, links, objectives) {
  const live = new Set(objectives.map((o) => o.id));
  return strategies.map((s) => ({
    id: s.id,
    served: links.filter((l) => l.strategy_id === s.id && live.has(l.objective_id)).length,
  }));
}

/**
 * The running sprint's week for today, scored so far (M5 "This week so
 * far"). Returns null when there's no sprint, it hasn't started, its weeks
 * are over, or a Recovery is running (scores are hidden then).
 *
 * @param {object} d rows: sprint, recoveries, workingPatterns, strategies,
 *   links, objectives, sprintHabits, sprintSettings, logs, todos, todoMoves, wins, winLinks
 * @param {string} today the person's local today
 */
export function sprintWeekSoFar(d, today) {
  const { sprint } = d;
  if (!sprint || sprint.status !== 'running' || today < sprint.start_on) return null;
  const recoveries = d.recoveries || [];
  if (openRecovery(recoveries)) return null;
  const calendar = m0SprintCalendar(
    { start: sprint.start_on, lengthWeeks: sprint.length_weeks, recoveries: toRecoveries(recoveries) },
    today,
  );
  const number = m0WeekOfDay(calendar.weeks, today);
  if (!number) return null;
  const { week, result } = sprintWeekResult(d, calendar, number, today);
  return { calendar, number, week, result, standard: sprint.standard };
}

/**
 * One sprint week scored by M5: final once it has finished, or "so far"
 * up to and including `soFarUntil` (M5 "This week so far"). The habits
 * use the settings in force that week (M1 "Changes mid-sprint").
 * @returns {{ week: object, workingDays: string[], result: object }}
 */
export function sprintWeekResult(d, calendar, number, soFarUntil = null) {
  const { sprint } = d;
  const week = calendar.weeks[number - 1];
  const workingDays = m0WorkingDaysOfWeek(toWorkingHistory(d.workingPatterns), week.days);
  const habits = [];
  for (const sh of d.sprintHabits || []) {
    const setting = settingForWeek(d.sprintSettings || [], sh.id, number);
    if (!setting) continue;
    habits.push({ id: sh.id, strategyId: sh.strategy_id, ...toMeasure(setting) });
  }
  const inWeek = new Set(week.days);
  const logs = (d.logs || [])
    .filter((l) => inWeek.has(l.local_date))
    .map((l) => ({ habitId: l.sprint_habit_id, date: l.local_date, value: Number(l.value), toConfirm: l.to_confirm }));
  const result = m5WeekFromRaw({
    week,
    weeks: calendar.weeks,
    workingDays,
    soFarUntil: soFarUntil || undefined,
    strategies: servedCounts(d.strategies || [], d.links || [], d.objectives || []),
    habits,
    logs,
    todos: (d.todos || []).map((t) => toTodo(t, d.todoMoves || [], sprint.id)),
    wins: (d.wins || []).map((w) => toWin(w, d.winLinks || [])),
  });
  return { week, workingDays, result };
}

/** Each objective's M9 result today. */
export function objectiveResults(objectives, figures, today, sprintStart = null) {
  return objectives.map((row) => {
    const objective = toObjective(row, figures);
    return { objective, result: m9Objective(objective, { asOf: today, sprintStart }) };
  });
}
