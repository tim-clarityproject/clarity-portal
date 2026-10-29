// What the Individual Performance Plan page and the My Mission panel show,
// worked out from the rows in one place (pure code, tested in
// tests/performance). Every figure comes from src/lib/scores: M9 for the
// objectives, M5 (so far) for this week, M0 for rounding and the standard.

import { m0AtStandard, m0Round, m9TimeLeft } from '../scores/index.js';
import { alignmentCheck, alignmentLines } from './alignment';
import { localToday, objectiveResults, openRecovery, sprintWeekSoFar } from './rows';
import {
  habitMeasureLine,
  objectiveDate,
  objectiveFigure,
  objectiveKindLabel,
  objectiveStripFigure,
  objectiveTarget,
  servesLine,
  shortDate,
} from './words';

/** Is a whole-part switch on? No row means the part's default (mission on, progress off). */
export function switchIsOn(switches = [], part) {
  const row = switches.find((s) => s.part === part);
  if (row) return Boolean(row.is_on);
  return part === 'mission';
}

const capital = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/**
 * @param {object} data rows from loadPlanPage
 * @param {{ today?: string, showResults?: boolean }} [opts]
 */
export function planView(data, opts = {}) {
  if (!data?.plan) return null;
  const today = opts.today || localToday();
  const objectivesRows = data.objectives || [];
  const strategiesRows = data.strategies || [];
  const links = (data.links || []).map((l) => ({ strategyId: l.strategy_id, objectiveId: l.objective_id }));
  const check = alignmentCheck(objectivesRows, strategiesRows, links);
  const numberOf = new Map(objectivesRows.map((o, i) => [o.id, i + 1]));
  const recovery = openRecovery(data.recoveries || []);
  // In Recovery the scores are hidden unless "Show my results" was tapped
  // on this visit (M15): then the week the sprint paused in.
  const week = recovery && !opts.showResults ? null : sprintWeekSoFar({
    sprint: data.sprint,
    recoveries: data.recoveries,
    workingPatterns: data.workingPatterns,
    strategies: strategiesRows,
    links: data.links,
    objectives: objectivesRows,
    sprintHabits: data.sprintHabits,
    sprintSettings: data.sprintSettings,
    logs: data.logs,
    todos: data.todos,
    todoMoves: data.todoMoves,
    wins: data.wins,
    winLinks: data.winLinks,
  }, today, { paused: Boolean(recovery) });
  const standard = data.sprint?.standard ?? null;
  const scoreOf = (raw) => {
    if (raw == null) return null;
    const value = m0Round(raw);
    return { value, good: m0AtStandard(value, standard) };
  };

  const results = objectiveResults(objectivesRows, data.figures || [], today, data.sprint?.start_on ?? null);
  const objectives = results.map(({ objective, result }) => {
    const date = objectiveDate(objective);
    const reached = Boolean(result.reached);
    const servedBy = check.strategiesFor.get(objective.id) || [];
    const timeLeft = date && !reached ? capital(m9TimeLeft(today, date).text) : null;
    return {
      id: objective.id,
      number: numberOf.get(objective.id),
      name: objective.name,
      kind: objective.kind,
      kindLabel: objectiveKindLabel(objective),
      dateText: date ? `By ${shortDate(date)}` : null,
      timeLeft,
      figure: objective.kind === 'milestone' ? null : objectiveFigure(objective, result.current),
      target: objective.kind === 'milestone' ? null : objectiveTarget(objective),
      progress: objective.kind === 'milestone' ? (reached ? 1 : 0) : result.progress / 100,
      reached,
      reachedOn: objective.reachedOn,
      strategyCount: servedBy.length,
      flagged: servedBy.length === 0,
      stripFigure: objectiveStripFigure(objective, result.current, reached),
    };
  });

  const weekByStrategy = new Map((week?.result.strategies || []).map((s) => [s.id, s.score]));
  const todosRows = data.todos || [];
  const strategies = strategiesRows.map((s) => {
    const serves = (check.objectivesFor.get(s.id) || []).map((oid) => numberOf.get(oid)).sort((a, b) => a - b);
    const habits = (data.habits || []).filter((h) => h.strategy_id === s.id).map((h) => ({
      id: h.id,
      name: h.name,
      line: habitMeasureLine({
        measure: h.measure, unit: h.unit, target: h.target, targetPer: h.target_per,
        limit: h.limit_value, limitPer: h.limit_per, direction: h.direction,
      }),
    }));
    const todos = week && !week.paused
      ? todosRows
        // This week's and later ones, and open ones rolled over from an
        // earlier week (they show this week on the sprint page too).
        .filter((t) => t.strategy_id === s.id && t.planned_week != null
          && (t.planned_week >= week.number || !t.done_on))
        .sort((a, b) => a.planned_week - b.planned_week)
        .map((t) => ({
          id: t.id,
          text: t.text,
          when: t.done_on ? 'Done' : t.planned_week <= week.number ? 'This week' : `Week ${t.planned_week}`,
        }))
      : [];
    return {
      id: s.id,
      name: s.name,
      description: s.description,
      serves,
      servesLine: servesLine(serves),
      objectiveNames: serves.map((n) => objectives[n - 1]?.name),
      flagged: serves.length === 0,
      score: week ? scoreOf(weekByStrategy.get(s.id)) : null,
      habits,
      todos,
    };
  });

  const coachName = data.coach?.firstName || null;
  return {
    today,
    planId: data.plan.id,
    mission: data.plan.mission || '',
    version: { major: data.plan.major, minor: data.plan.minor },
    changedAt: data.latestVersion?.created_at || data.plan.updated_at || data.plan.created_at,
    objectives,
    strategies,
    alignment: alignmentLines(check),
    alignmentOk: check.ok,
    inRecovery: Boolean(recovery),
    recovery,
    pausedWeek: week?.paused ? week.number : null,
    sprintRunning: Boolean(week) && !week.paused,
    weekScore: week ? scoreOf(week.result.score) : null,
    standard,
    coachName,
    missionShared: Boolean(coachName) && switchIsOn(data.switches, 'mission'),
    progressShared: Boolean(coachName) && switchIsOn(data.switches, 'progress'),
  };
}

/**
 * One saved version, read only: what the plan said then (planSnapshot in
 * versions.js). No figures or scores: a version keeps only the plan.
 */
export function versionView(snapshot) {
  const s = snapshot || {};
  const objectives = (s.objectives || []).map((o, i) => {
    const date = o.kind === 'milestone' ? o.dueOn : o.byWhen;
    return {
      id: o.id,
      number: i + 1,
      name: o.name,
      kindLabel: objectiveKindLabel(o),
      target: o.kind === 'milestone' ? null : objectiveTarget(o).replace(/^(of|target) /, 'Target '),
      dateText: date ? `By ${shortDate(date)}` : null,
    };
  });
  const numberOf = new Map(objectives.map((o) => [o.id, o.number]));
  const strategies = (s.strategies || []).map((st) => {
    const serves = (st.objectiveIds || []).map((id) => numberOf.get(id)).filter(Boolean).sort((a, b) => a - b);
    return {
      id: st.id,
      name: st.name,
      description: st.description,
      serves,
      servesLine: servesLine(serves),
      habits: (s.habits || []).filter((h) => h.strategyId === st.id).map((h) => ({ id: h.id, name: h.name, line: habitMeasureLine(h) })),
    };
  });
  return { mission: s.mission || '', objectives, strategies };
}
