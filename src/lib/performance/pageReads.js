import { supabase } from '../supabase';
import { getLocalDateKey } from '../dateFormatter';
import { ownProfileQuery, ownSettingsQuery } from '../sharedReads';

// The reads the client pages open with, written once (the scale check,
// fixer C; 22 Nov 2026). The loaders in api.js make them from here, and so
// does startOpeningReads, which sends a page's reads as the app starts,
// before the page's own code has arrived: the same addresses, so the
// page's loaders get those answers (readShare.js) instead of asking again
// a moment later. Each function returns the query unsent; nothing here
// writes, notes a version or changes anything on the device.
//
// This file is small and part of the app's opening code (main.jsx imports
// it), so it imports nothing but the client, the date key and the shared
// selects.

export const PLAN_COLS = 'id, mission, status, major, minor, created_at, updated_at';
export const OBJECTIVE_COLS = 'id, plan_id, name, kind, unit, direction, start_value, start_set_on, target_value, by_when, due_on, reached_on, source, sort_order, archived_at, created_at, updated_at';
export const STRATEGY_COLS = 'id, plan_id, name, description, sort_order, archived_at';
export const SPRINT_COLS = 'id, plan_id, number, label, start_on, length_weeks, standard, status, planned_end_on, actual_end_on, finished_at, updated_at';
export const RECOVERY_COLS = 'id, sprint_id, start_on, chosen_days, extended_days, ended_at, end_on, let_coach_know, updated_at';
export const TODO_COLS = 'id, strategy_id, text, impact, sprint_id, planned_week, created_on, done_on, source, source_id, move_on, deleted_at, updated_at';
export const SPRINT_HABIT_COLS = 'id, sprint_id, habit_id, strategy_id, name, sort_order';
export const LOG_COLS = 'id, sprint_habit_id, local_date, value, to_confirm, updated_at';
export const WIN_COLS = 'id, what, local_date, impact, deleted_at, updated_at';
export const DAY_PLAN_COLS = 'id, user_id, local_date, sleep_hours, sleep_quality, sleep_to_confirm, grateful_for, way_of_being, biggest_risk, risk_response, status, finished_at, updated_at';

// A sprint's habits with their settings and logs inside (one read instead
// of three), its wins with the Strategies each served (one instead of two)
// and a day's plan with its to-dos and Strategies (one instead of three).
// api.js takes what comes inside out again.
export const HABITS_WITH = `${SPRINT_HABIT_COLS}, sprint_habit_settings(*), habit_logs(${LOG_COLS})`;
export const WINS_WITH = `${WIN_COLS}, win_strategies(win_id, strategy_id)`;
export const DAY_PLAN_WITH = `${DAY_PLAN_COLS}, day_plan_todos(todo_id, is_top), day_plan_strategies(strategy_id)`;
const HOME_REVIEW_COLS = 'id, local_date, status, tomorrow, updated_at';

// How far back the running sprint's wins are read before its start is
// known: a sprint is at most 16 weeks and Recovery adds days, so 26 weeks
// holds nearly every running sprint; an older start reads its wins again
// from its start (api.js sprintWins).
export const WINS_WINDOW_DAYS = 26 * 7;

/** A date key n days before another (a pure date sum, never "today"). */
export function dayBefore(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d - n)).toISOString().slice(0, 10);
}

/** Where the running sprint's wins are read from, before its start is known. */
export const runningWinsFrom = () => dayBefore(getLocalDateKey(), WINS_WINDOW_DAYS);

const from = (table) => supabase.from(table);

// ---------------------------------------------------------------- the sprint page

export const activePlanRead = (u) => from('performance_plans').select(PLAN_COLS).eq('user_id', u).eq('status', 'active').limit(1);
export const allSprintsRead = (u) => from('sprints').select(SPRINT_COLS).eq('user_id', u).order('number');
export const recoveriesRead = (u) => from('recovery_periods').select(RECOVERY_COLS).eq('user_id', u).order('start_on');
export const workingPatternsRead = (u) => from('working_patterns').select('starts_on, days').eq('user_id', u).order('starts_on');
export const weekScoresRead = (u) => from('week_scores').select('sprint_id, sprint_week, week_end, score, eligible, final').eq('user_id', u).order('week_end');
export const backlogRead = (u) => from('todos').select(TODO_COLS).eq('user_id', u).is('sprint_id', null).is('done_on', null).is('deleted_at', null).order('created_at');
export const liveObjectivesRead = (u) => from('outcome_objectives').select(OBJECTIVE_COLS).eq('user_id', u).is('archived_at', null).order('sort_order');
export const liveStrategiesRead = (u) => from('plan_strategies').select(STRATEGY_COLS).eq('user_id', u).is('archived_at', null).order('sort_order');
export const strategyLinksRead = (u) => from('strategy_objectives').select('strategy_id, objective_id').eq('user_id', u);
export const allDebriefsRead = (u) => from('weekly_debriefs').select('sprint_id, sprint_week, stress, unusual, status').eq('user_id', u);
export const todoMovesRead = (u) => from('todo_moves').select('todo_id, moved_on, from_sprint_id, from_week, to_sprint_id, to_week, created_at').eq('user_id', u);
export const winsFromRead = (u, day) => from('wins').select(WINS_WITH).eq('user_id', u).gte('local_date', day).is('deleted_at', null);
// Through the person's running sprint (an embedded filter on sprints: one
// running sprint per person, sprints_one_running), so they go out beside
// the read that finds it.
const running = (q, u) => q.eq('sprints.user_id', u).eq('sprints.status', 'running');
export const runningHabitsRead = (u) => running(from('sprint_habits').select(`${HABITS_WITH}, sprints!inner()`).eq('user_id', u), u).order('sort_order');
export const runningTodosRead = (u) => running(from('todos').select(`${TODO_COLS}, sprints!inner()`).eq('user_id', u), u).is('deleted_at', null);

// ---------------------------------------------------------------- Home

/** A day's row and the newest one before it (the two newest up to that day). */
export const newestTwoRead = (u, table, date) => from(table).select(table === 'day_plans' ? DAY_PLAN_WITH : HOME_REVIEW_COLS)
  .eq('user_id', u).lte('local_date', date).order('local_date', { ascending: false }).limit(2);
export const lastLogRead = (u, date) => from('habit_logs').select('local_date').eq('user_id', u)
  .lt('local_date', date).order('local_date', { ascending: false }).limit(1);
export const checkinsRead = (u) => from('checkins').select('id, kind, month, status, answers, finished_at, updated_at').eq('user_id', u).order('month', { ascending: false });

// ---------------------------------------------------------------- the dashboard

export const dashboardReads = (u, today) => {
  const since = dayBefore(today, 16 * 7);
  return {
    weekScores: from('week_scores').select('sprint_id, sprint_week, week_end, score, strategy_scores, eligible, final').eq('user_id', u).order('week_end'),
    figures: from('objective_figures').select('id, objective_id, value, recorded_on, created_at').eq('user_id', u).order('recorded_on'),
    dayPlans: from('day_plans').select('local_date, sleep_hours, sleep_quality, sleep_to_confirm, way_of_being')
      .eq('user_id', u).gte('local_date', since).order('local_date').limit(400),
    dayReviews: from('day_reviews').select('local_date, way_of_being_rating, status')
      .eq('user_id', u).gte('local_date', since).order('local_date').limit(400),
    checkins: from('checkins').select('id, kind, month, status, answers, hardware_score, software_score, area_scores, finished_at')
      .eq('user_id', u).eq('status', 'finished').order('month'),
    breathing: from('breathing_sessions').select('date').eq('user_id', u).gte('date', `${since}T00:00:00Z`).limit(1000),
    controlChecks: from('emotional_control_checks').select('local_date, line').eq('user_id', u).gte('local_date', since).limit(1000),
    lifeChecks: from('wheel_of_life_checkins').select('id, checkin_at, checkin_date, scores, areas').eq('user_id', u).order('checkin_at'),
    sharing: from('sharing_switches').select('part, is_on').eq('user_id', u).eq('part', 'checkin'),
  };
};

// ---------------------------------------------------------------- as the app opens

function sprintPageReads(u) {
  return [
    activePlanRead(u), allSprintsRead(u), recoveriesRead(u), workingPatternsRead(u), ownSettingsQuery(u),
    weekScoresRead(u), ownProfileQuery(u), backlogRead(u), liveObjectivesRead(u), liveStrategiesRead(u),
    strategyLinksRead(u), allDebriefsRead(u), runningHabitsRead(u), runningTodosRead(u), todoMovesRead(u),
    winsFromRead(u, runningWinsFrom()),
  ];
}

// The signed-in person kept on this device (the client's own key), or null.
function storedUserId() {
  try {
    const raw = window.localStorage.getItem('clarity-portal-auth');
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed?.refresh_token && typeof parsed?.user?.id === 'string' ? parsed.user.id : null;
  } catch {
    return null;
  }
}

/** The reads a client page opens with, by its address: null for any other page. */
export function openingReadsFor(pathname, userId, today = getLocalDateKey()) {
  const path = String(pathname || '').replace(/\/+$/, '') || '/';
  if (path === '/welcome') {
    return [...sprintPageReads(userId), newestTwoRead(userId, 'day_plans', today), newestTwoRead(userId, 'day_reviews', today), lastLogRead(userId, today), checkinsRead(userId)];
  }
  if (path === '/dashboard') return [...sprintPageReads(userId), ...Object.values(dashboardReads(userId, today))];
  if (path === '/performance-sprint' || path === '/daily-plan' || path === '/daily-review') return sprintPageReads(userId);
  return null;
}

/**
 * Sends the opening page's reads now, as the app starts (main.jsx), for a
 * person signed in on this device and only on the client pages above. The
 * answers are kept for a moment by readShare.js for the page's own loaders,
 * which make exactly these reads; nothing waits for them, and a read that
 * goes wrong is simply made again by the page. Never on any other page
 * (the coach portal, sign-in, the outside Health Check).
 */
export function startOpeningReads(pathname = window.location.pathname) {
  try {
    const userId = storedUserId();
    if (!userId) return 0;
    const reads = openingReadsFor(pathname, userId);
    for (const q of reads || []) q.then(() => {}, () => {});
    return reads ? reads.length : 0;
  } catch {
    return 0;
  }
}
