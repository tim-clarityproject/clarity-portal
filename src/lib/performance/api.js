// The data layer for the Individual Performance Plan and the Performance
// Sprint (Phase 1 tables, migrations 026 to 033). Every page in Phase 2
// reads and writes through here, never through the tables directly.
//
// Reads come back as plain rows (cacheable, so pages show their last data
// at once through useCachedLoad); rows.js turns them into what the scoring
// library reads. Writes go through the offline queue (saveOrQueue), so a
// tick or a change made offline waits on the device and is sent when the
// connection is back. Each new row gets its id on the device (newId), so
// children can be written straight after their parent, in order.
//
// What can't be queued: database functions (my_coach, freeze_week,
// make_sprint_summary). Those run only online, and a page that needs one
// says so when it can't.

import { supabase } from '../supabase';
import { newId, saveOrQueue } from '../syncQueue';
import { nextVersion, planChangeKind } from './versions';

const PLAN_COLS = 'id, mission, status, major, minor, created_at, updated_at';
const OBJECTIVE_COLS = 'id, plan_id, name, kind, unit, direction, start_value, start_set_on, target_value, by_when, due_on, reached_on, source, sort_order, archived_at, created_at';
const STRATEGY_COLS = 'id, plan_id, name, description, sort_order, archived_at';
const HABIT_COLS = 'id, plan_id, strategy_id, name, measure, unit, target, target_per, limit_value, limit_per, direction, top_number, impact, sort_order, archived_at';
const SPRINT_COLS = 'id, plan_id, number, label, start_on, length_weeks, standard, status, planned_end_on, actual_end_on, finished_at';

async function rows(query) {
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function one(query) {
  const { data, error } = await query;
  if (error) throw error;
  return data?.[0] || null;
}

/** The person's own coach (my_coach), or null. Online only. */
export async function loadMyCoach() {
  const { data, error } = await supabase.rpc('my_coach');
  if (error) throw error;
  const c = Array.isArray(data) ? data[0] : data;
  return c ? { id: c.coach_id, firstName: c.first_name, awayUntil: c.away_until } : null;
}

/** The active plan's row only: enough for the header's My Mission pill. */
export async function loadActivePlan(userId) {
  return one(supabase.from('performance_plans').select(PLAN_COLS)
    .eq('user_id', userId).eq('status', 'active').limit(1));
}

/**
 * Everything the Individual Performance Plan page and the My Mission panel
 * show, as rows. { plan: null } when the person has no plan yet.
 */
export async function loadPlanPage(userId) {
  const plan = await loadActivePlan(userId);
  if (!plan) return { plan: null };
  const [latestVersion, objectives, figures, strategies, links, habits, switches, personSettings, recoveries, sprint, workingPatterns, coach] = await Promise.all([
    one(supabase.from('plan_versions').select('major, minor, kind, created_at')
      .eq('plan_id', plan.id).order('created_at', { ascending: false }).limit(1)),
    rows(supabase.from('outcome_objectives').select(OBJECTIVE_COLS)
      .eq('plan_id', plan.id).is('archived_at', null).order('sort_order')),
    rows(supabase.from('objective_figures').select('id, objective_id, value, recorded_on, created_at')
      .eq('user_id', userId).order('recorded_on')),
    rows(supabase.from('plan_strategies').select(STRATEGY_COLS)
      .eq('plan_id', plan.id).is('archived_at', null).order('sort_order')),
    rows(supabase.from('strategy_objectives').select('strategy_id, objective_id').eq('user_id', userId)),
    rows(supabase.from('habits').select(HABIT_COLS)
      .eq('plan_id', plan.id).is('archived_at', null).order('sort_order')),
    rows(supabase.from('sharing_switches').select('part, is_on').eq('user_id', userId)),
    one(supabase.from('person_settings').select('time_zone, units').eq('user_id', userId).limit(1)),
    rows(supabase.from('recovery_periods').select('id, sprint_id, start_on, chosen_days, extended_days, ended_at, end_on, let_coach_know')
      .eq('user_id', userId).order('start_on')),
    one(supabase.from('sprints').select(SPRINT_COLS)
      .eq('user_id', userId).eq('status', 'running').limit(1)),
    rows(supabase.from('working_patterns').select('starts_on, days').eq('user_id', userId).order('starts_on')),
    // The coach is only for the who-sees words: a page still shows without it.
    loadMyCoach().catch(() => null),
  ]);
  const week = sprint ? await loadSprintWeekRows(userId, sprint) : {};
  return {
    plan,
    latestVersion,
    objectives,
    figures,
    strategies,
    links,
    habits,
    switches,
    personSettings,
    recoveries,
    sprint,
    workingPatterns,
    coach,
    ...week,
  };
}

/** The running sprint's habits, settings, logs, to-dos and wins. */
export async function loadSprintWeekRows(userId, sprint) {
  const sprintHabits = await rows(supabase.from('sprint_habits')
    .select('id, sprint_id, habit_id, strategy_id, name, sort_order').eq('sprint_id', sprint.id).order('sort_order'));
  const ids = sprintHabits.map((h) => h.id);
  // Logs and wins from the sprint's start: a sprint stretched by Recovery
  // can run past its planned end, so no end is set.
  const [settings, logs, todos, todoMoves, wins, winLinks] = await Promise.all([
    ids.length ? rows(supabase.from('sprint_habit_settings').select('*').in('sprint_habit_id', ids)) : [],
    ids.length ? rows(supabase.from('habit_logs').select('id, sprint_habit_id, local_date, value, to_confirm')
      .in('sprint_habit_id', ids).gte('local_date', sprint.start_on)) : [],
    rows(supabase.from('todos').select('id, strategy_id, text, impact, sprint_id, planned_week, created_on, done_on, source, move_on, deleted_at')
      .eq('user_id', userId).eq('sprint_id', sprint.id).is('deleted_at', null)),
    rows(supabase.from('todo_moves').select('todo_id, moved_on, from_sprint_id, from_week, to_sprint_id, to_week').eq('user_id', userId)),
    rows(supabase.from('wins').select('id, what, local_date, impact, deleted_at')
      .eq('user_id', userId).gte('local_date', sprint.start_on).is('deleted_at', null)),
    rows(supabase.from('win_strategies').select('win_id, strategy_id').eq('user_id', userId)),
  ]);
  return { sprintHabits, sprintSettings: settings, logs, todos, todoMoves, wins, winLinks };
}

/**
 * Everything Build your plan and editing the plan need, as rows: the active
 * plan (or none yet), its live objectives, Strategies, links and habits,
 * the last version's snapshot (what a change is compared with), the
 * working days, the role (for the examples), the coach and the sharing
 * switches (for the eyes) and an organisation seat's fixed standard.
 */
export async function loadPlanEditor(userId) {
  const [plan, personSettings, workingPatterns, switches, coach, fixedStandard] = await Promise.all([
    loadActivePlan(userId),
    one(supabase.from('person_settings').select('time_zone, describes_you').eq('user_id', userId).limit(1)),
    rows(supabase.from('working_patterns').select('starts_on, days').eq('user_id', userId).order('starts_on')),
    rows(supabase.from('sharing_switches').select('part, is_on').eq('user_id', userId)),
    loadMyCoach().catch(() => null),
    loadFixedStandard().catch(() => null),
  ]);
  const base = { personSettings, workingPatterns, switches, coach, fixedStandard };
  if (!plan) return { plan: null, objectives: [], strategies: [], links: [], habits: [], latestVersion: null, ...base };
  const [objectives, strategies, links, habits, latestVersion] = await Promise.all([
    rows(supabase.from('outcome_objectives').select(OBJECTIVE_COLS)
      .eq('plan_id', plan.id).is('archived_at', null).order('sort_order')),
    rows(supabase.from('plan_strategies').select(STRATEGY_COLS)
      .eq('plan_id', plan.id).is('archived_at', null).order('sort_order')),
    rows(supabase.from('strategy_objectives').select('strategy_id, objective_id').eq('user_id', userId)),
    rows(supabase.from('habits').select(HABIT_COLS)
      .eq('plan_id', plan.id).is('archived_at', null).order('sort_order')),
    one(supabase.from('plan_versions').select('major, minor, kind, snapshot, created_at')
      .eq('plan_id', plan.id).order('major', { ascending: false }).order('minor', { ascending: false }).limit(1)),
  ]);
  return { plan, objectives, strategies, links, habits, latestVersion, ...base };
}

/** An organisation seat's fixed standard (85), or null to choose one. Online only. */
export async function loadFixedStandard() {
  const { data, error } = await supabase.rpc('my_fixed_standard');
  if (error) throw error;
  return data ?? null;
}

/** Every version of the active plan, newest first. */
export async function loadPlanVersions(userId) {
  const plan = await loadActivePlan(userId);
  if (!plan) return { plan: null, versions: [] };
  const versions = await rows(supabase.from('plan_versions')
    .select('id, major, minor, kind, change_note, snapshot, created_at')
    .eq('plan_id', plan.id).order('major', { ascending: false }).order('minor', { ascending: false }));
  return { plan, versions };
}

// ---------------------------------------------------------------- writes

/**
 * A whole-part sharing switch ("What your coach sees": mission, progress).
 * Saves at once, or waits on the device when offline.
 */
export function saveSharing(userId, part, isOn) {
  return saveOrQueue(userId, {
    table: 'sharing_switches',
    kind: 'upsert',
    onConflict: 'user_id,part',
    values: { user_id: userId, part, is_on: isOn },
  });
}

/** A milestone reached (the person's local day) or not reached (null). Never a new version. */
export function saveMilestoneReached(userId, objectiveId, reachedOn) {
  return saveOrQueue(userId, {
    table: 'outcome_objectives',
    kind: 'update',
    match: { id: objectiveId, user_id: userId },
    values: { reached_on: reachedOn },
  });
}

/** A new figure for a number or rating objective. Never a new version. */
export function saveObjectiveFigure(userId, { objectiveId, value, recordedOn, sprintId = null, sprintWeek = null }) {
  return saveOrQueue(userId, {
    table: 'objective_figures',
    kind: 'upsert',
    values: { id: newId(), user_id: userId, objective_id: objectiveId, value, recorded_on: recordedOn, sprint_id: sprintId, sprint_week: sprintWeek },
  });
}

/** The plan row: a new plan (no id yet) or a change to the mission. */
export function savePlan(userId, { id = newId(), mission }) {
  return {
    id,
    save: saveOrQueue(userId, {
      table: 'performance_plans',
      kind: 'upsert',
      values: { id, user_id: userId, mission: mission ?? null },
    }),
  };
}

/** An objective, complete (the table refuses half-filled ones: keep those on the device). */
export function saveObjective(userId, planId, o) {
  const id = o.id || newId();
  return {
    id,
    save: saveOrQueue(userId, {
      table: 'outcome_objectives',
      kind: 'upsert',
      values: {
        id,
        user_id: userId,
        plan_id: planId,
        name: o.name,
        kind: o.kind,
        unit: o.kind === 'number' ? (o.unit || null) : null,
        direction: o.kind === 'number' ? (o.direction || 'up') : 'up',
        start_value: o.kind === 'milestone' ? null : o.start,
        target_value: o.kind === 'milestone' ? null : o.target,
        by_when: o.kind === 'milestone' ? null : o.byWhen,
        due_on: o.kind === 'milestone' ? o.dueOn : null,
        sort_order: o.sortOrder ?? 0,
        ...(o.startOn ? { start_set_on: o.startOn } : {}),
      },
    }),
  };
}

/** Archive a row of the plan (objective, Strategy or habit): kept for history, gone from the plan. */
export function archivePlanRow(userId, table, id) {
  if (!['outcome_objectives', 'plan_strategies', 'habits'].includes(table)) throw new Error(`Not a plan table: ${table}`);
  return saveOrQueue(userId, {
    table,
    kind: 'update',
    match: { id, user_id: userId },
    values: { archived_at: new Date().toISOString() },
  });
}

/** Delete a row of the plan that no version holds (it was added and removed while building). */
export function deletePlanRow(userId, table, id) {
  if (!['outcome_objectives', 'plan_strategies', 'habits'].includes(table)) throw new Error(`Not a plan table: ${table}`);
  return saveOrQueue(userId, {
    table,
    kind: 'delete',
    match: { id, user_id: userId },
  });
}

/**
 * The working days (methods M0.3), from a day on: a change saved on a
 * week's first day applies to that week. One row per day it changed.
 */
export function saveWorkingDays(userId, startsOn, days) {
  return saveOrQueue(userId, {
    table: 'working_patterns',
    kind: 'upsert',
    onConflict: 'user_id,starts_on',
    values: { user_id: userId, starts_on: startsOn, days },
  });
}

/** A Strategy. */
export function saveStrategy(userId, planId, s) {
  const id = s.id || newId();
  return {
    id,
    save: saveOrQueue(userId, {
      table: 'plan_strategies',
      kind: 'upsert',
      values: { id, user_id: userId, plan_id: planId, name: s.name, description: s.description ?? null, sort_order: s.sortOrder ?? 0 },
    }),
  };
}

/** A Strategy serves an objective, or no longer does. */
export function saveStrategyLink(userId, strategyId, objectiveId, serves) {
  return serves
    ? saveOrQueue(userId, {
      table: 'strategy_objectives',
      kind: 'upsert',
      onConflict: 'strategy_id,objective_id',
      ignoreDuplicates: true,
      values: { strategy_id: strategyId, objective_id: objectiveId, user_id: userId },
    })
    : saveOrQueue(userId, {
      table: 'strategy_objectives',
      kind: 'delete',
      match: { strategy_id: strategyId, objective_id: objectiveId, user_id: userId },
    });
}

/** A habit with its default measure and impact (methods M1). */
export function saveHabit(userId, planId, h) {
  const id = h.id || newId();
  return {
    id,
    save: saveOrQueue(userId, {
      table: 'habits',
      kind: 'upsert',
      values: {
        id,
        user_id: userId,
        plan_id: planId,
        strategy_id: h.strategyId,
        name: h.name,
        measure: h.measure,
        unit: h.unit ?? null,
        target: h.target ?? null,
        target_per: h.targetPer ?? null,
        limit_value: h.limit ?? null,
        limit_per: h.limitPer ?? null,
        direction: h.direction ?? null,
        top_number: h.topNumber ?? null,
        impact: h.impact ?? 2,
        sort_order: h.sortOrder ?? 0,
      },
    }),
  };
}

/**
 * Keep a version when the plan changed (major or minor; see versions.js),
 * and move the plan's version number on. Nothing happens when nothing the
 * plan says changed. `first` records version 1.0 for a new plan.
 * @returns {Promise<{ kind: string|null, major: number, minor: number }>}
 */
export async function recordPlanVersion(userId, plan, { before, after, note = null, first = false }) {
  const kind = first ? 'start' : planChangeKind(before, after);
  if (!kind) return { kind: null, major: plan.major, minor: plan.minor };
  const v = first ? { major: 1, minor: 0 } : nextVersion(plan, kind);
  await saveOrQueue(userId, {
    table: 'plan_versions',
    kind: 'upsert',
    onConflict: 'plan_id,major,minor',
    ignoreDuplicates: true,
    values: { id: newId(), plan_id: plan.id, user_id: userId, major: v.major, minor: v.minor, kind, change_note: note ? note.slice(0, 500) : null, snapshot: after },
  });
  if (!first) {
    await saveOrQueue(userId, {
      table: 'performance_plans',
      kind: 'update',
      match: { id: plan.id, user_id: userId },
      values: { major: v.major, minor: v.minor },
    });
  }
  return { kind, ...v };
}

/**
 * Everything Start a sprint needs, as rows: the active plan (or none), its
 * live Strategies and habits (the sprint copies the habits), every sprint
 * so far (the next number, and the one still running), Recovery (which
 * moves a running sprint's end), the role (for the label's example), the
 * coach (for the eyes) and an organisation seat's fixed standard.
 */
export async function loadSprintStart(userId) {
  const [plan, sprints, recoveries, personSettings, coach, fixedStandard] = await Promise.all([
    loadActivePlan(userId),
    rows(supabase.from('sprints').select(SPRINT_COLS).eq('user_id', userId).order('number')),
    rows(supabase.from('recovery_periods').select('id, sprint_id, start_on, chosen_days, extended_days, ended_at, end_on, let_coach_know')
      .eq('user_id', userId).order('start_on')),
    one(supabase.from('person_settings').select('time_zone, describes_you').eq('user_id', userId).limit(1)),
    loadMyCoach().catch(() => null),
    loadFixedStandard().catch(() => null),
  ]);
  const base = { plan, sprints, recoveries, personSettings, coach, fixedStandard };
  if (!plan) return { ...base, strategies: [], habits: [] };
  const [strategies, habits] = await Promise.all([
    rows(supabase.from('plan_strategies').select(STRATEGY_COLS)
      .eq('plan_id', plan.id).is('archived_at', null).order('sort_order')),
    rows(supabase.from('habits').select(HABIT_COLS)
      .eq('plan_id', plan.id).is('archived_at', null).order('sort_order')),
  ]);
  return { ...base, strategies, habits };
}

/**
 * Start a sprint from its pending record (sprintStart.js pendingStart):
 * the running sprint finished first (one running sprint per person), then
 * the sprint row, then each habit copied in as a sprint habit with its
 * settings from week 1 (spec section 3: the plan's habits are copied when
 * a sprint starts). Every id comes from the record, so sending it again
 * after a refresh or a second tap writes the same rows, never new ones.
 * @returns {Promise<{ queued: boolean }>}
 */
export async function startSprint(userId, p) {
  let queued = false;
  const send = async (op) => {
    const r = await saveOrQueue(userId, op);
    if (r?.status === 'queued') queued = true;
  };
  if (p.finish) await send(finishSprintOp(userId, p.finish.sprintId, p.finish.endOn));
  await send({
    table: 'sprints',
    kind: 'upsert',
    values: {
      id: p.sprintId,
      user_id: userId,
      plan_id: p.planId,
      number: p.number,
      start_on: p.startOn,
      length_weeks: p.lengthWeeks,
      standard: p.standard,
      label: p.label || null,
    },
  });
  for (const h of p.habits) {
    await send({
      table: 'sprint_habits',
      kind: 'upsert',
      values: { id: h.sprintHabitId, sprint_id: p.sprintId, user_id: userId, habit_id: h.habitId || null, strategy_id: h.strategyId, name: h.name, sort_order: h.sortOrder },
    });
    await send({
      table: 'sprint_habit_settings',
      kind: 'upsert',
      values: {
        id: h.settingId,
        sprint_habit_id: h.sprintHabitId,
        user_id: userId,
        from_week: 1,
        measure: h.measure,
        unit: h.unit ?? null,
        target: h.target ?? null,
        target_per: h.targetPer ?? null,
        limit_value: h.limit ?? null,
        limit_per: h.limitPer ?? null,
        direction: h.direction ?? null,
        top_number: h.topNumber ?? null,
        impact: h.impact ?? 2,
      },
    });
  }
  return { queued };
}

/**
 * The frozen end-of-sprint summary for an organisation seat (M6; does
 * nothing for someone without one). Online only, best effort: a finished
 * sprint without one can have it made later.
 */
export async function makeSprintSummary(sprintId) {
  const { error } = await supabase.rpc('make_sprint_summary', { p_sprint: sprintId });
  if (error) throw error;
}

function finishSprintOp(userId, sprintId, actualEndOn) {
  return {
    table: 'sprints',
    kind: 'update',
    match: { id: sprintId, user_id: userId },
    values: { status: 'finished', actual_end_on: actualEndOn, finished_at: new Date().toISOString() },
  };
}

/** Finish a sprint (its review, or starting the next one). */
export function finishSprint(userId, sprintId, actualEndOn) {
  return saveOrQueue(userId, finishSprintOp(userId, sprintId, actualEndOn));
}

/** One day's log for a sprint habit; null clears it (a log can't be empty). */
export function saveHabitLog(userId, sprintHabitId, localDate, value) {
  if (value == null) {
    return saveOrQueue(userId, {
      table: 'habit_logs',
      kind: 'delete',
      match: { sprint_habit_id: sprintHabitId, local_date: localDate, user_id: userId },
    });
  }
  // No id is sent: the row is found by its habit and day, so a second
  // device or a resend never fights over which id it has.
  return saveOrQueue(userId, {
    table: 'habit_logs',
    kind: 'upsert',
    onConflict: 'sprint_habit_id,local_date',
    values: { user_id: userId, sprint_habit_id: sprintHabitId, local_date: localDate, value },
  });
}

/** A to-do ticked done on a day, or not done (null). */
export function saveTodoDone(userId, todoId, doneOn) {
  return saveOrQueue(userId, {
    table: 'todos',
    kind: 'update',
    match: { id: todoId, user_id: userId },
    values: { done_on: doneOn },
  });
}
