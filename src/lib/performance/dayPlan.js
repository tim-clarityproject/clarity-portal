// What Plan my day shows (mock-up M5, approved 23 Oct), worked out from
// the rows in one place. Pure code: no database, no React, no device
// clock (the day is passed in), tested in tests/performance.
//
// The week's to-dos, habits and score come from the sprint page's own
// view (sprintPageView), so they are the same as the sprint shows: M2 for
// the to-dos, M1 for the habits, M5 "so far" for the score. What the
// methods don't define is a screen choice made here and listed in
// progress.md (CHOICE or UNDEFINED): which weekly habits can be chosen,
// "last night" after a gap, the Strategy of a to-do from last night's list.

import { weekday } from '../scores/dates.js';
import { m12IsOdd, SLEEP_QUALITY } from '../scores/index.js';
import { settingForWeek, toMeasure } from './rows';
import { sprintPageView } from './sprintPage';

export const MAX_DAY_TODOS = 3;       // day_plan_limits: up to three things to do
export const MAX_DAY_STRATEGIES = 2;  // one recommended, two at most
export const WAY_MAX = 60;            // M5's box (the table allows 120)
export const DAY_TEXT_MAX = 300;      // grateful_for, biggest_risk, risk_response
export const SLEEP_MAX_HOURS = 14;    // M5's stepper stops here

export const SLEEP_QUALITY_OPTIONS = Object.freeze(
  ['Very poor', 'Poor', 'Fair', 'Good', 'Very good'].map((label, i) => ({ value: SLEEP_QUALITY[i], label })),
);

// UNDEFINED (decisions 23 Oct, 13:16): the suggestions are to be drafted in
// three role versions for Tim's approval. CHOICE: M5's three for everyone.
export const WAY_SUGGESTIONS = Object.freeze(['Curious, not defensive', 'Decisive', 'Patient']);
export const GRATITUDE_EXAMPLE = 'The team stepping up while I was away last week.';

const DAY_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function addDayKey(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); // a pure date sum, never "today"
}

const lowerFirst = (t) => (t ? t.charAt(0).toLowerCase() + t.slice(1) : t);

/** "7.5 hours", "1 hour". */
export function hoursWords(hours) {
  return `${hours} hour${hours === 1 ? '' : 's'}`;
}

/** The two ways of being used most recently before this day, newest first, once each. */
export function recentWays(rows = [], date) {
  const seen = new Set();
  const out = [];
  for (const r of [...rows].sort((a, b) => (a.local_date < b.local_date ? 1 : -1))) {
    const w = (r.way_of_being || '').trim();
    if (!w || r.local_date >= date || seen.has(w.toLowerCase())) continue;
    seen.add(w.toLowerCase());
    out.push(w);
    if (out.length === 2) break;
  }
  return out;
}

/**
 * The tag on last night's things. CHOICE (UNDEFINED, audit 2.9): the
 * latest finished review of the 3 days before; "last night" only when it
 * was the day before, otherwise the day's name.
 */
export function lastListTag(reviewDate, date) {
  if (reviewDate === addDayKey(date, -1)) return 'On last night’s list';
  return `On your list from ${DAY_FULL[weekday(reviewDate)]}`;
}

export function lastNoteLabel(reviewDate, date) {
  if (reviewDate === addDayKey(date, -1)) return 'Last night you also wrote this note.';
  return `On ${DAY_FULL[weekday(reviewDate)]} you also wrote this note.`;
}

/**
 * The Strategy a to-do from last night's list goes on. UNDEFINED (a to-do
 * needs one, the list has none). CHOICE: that day's first Strategy of the
 * day, else the first Strategy that moved that day, else the first
 * Strategy of the plan. Medium impact; changeable on the sprint page.
 */
export function nightTodoStrategy(lastReview, strategies = []) {
  const live = new Set(strategies.map((s) => s.id));
  const first = (list) => list.map((x) => x.strategy_id).find((id) => live.has(id));
  return first(lastReview?.dayStrategies || []) || first(lastReview?.strategies || []) || strategies[0]?.id || null;
}

/** Whether a weekly habit can be chosen for the day (CHOICE, audit 2.1). */
function weeklyMeasure(m) {
  return ((m.measure === 'count' || m.measure === 'amount') && m.targetPer === 'week') || m.measure === 'yes_no_weekly';
}

function weeklyMet(m, values) {
  const logged = Object.values(values || {});
  if (m.measure === 'yes_no_weekly') return logged.some((v) => v > 0);
  return m.target != null && logged.reduce((s, v) => s + v, 0) >= m.target;
}

/**
 * Which of the day's choices are picked, in their order, and which is the
 * highest priority. Picks: the day's to-dos (day_plan_todos) and the habits
 * kept on the device (no table holds a habit chosen for a day yet); the
 * device remembers their order and a habit at the top.
 */
export function dayPicks(dayTodos = [], local = {}, liveKeys = null) {
  const fromDb = dayTodos.map((t) => `todo:${t.todo_id}`);
  const habits = (local.habits || []).map((id) => `habit:${id}`);
  const all = new Set([...fromDb, ...habits]);
  const order = [...(local.order || []).filter((k) => all.has(k)), ...[...all].filter((k) => !(local.order || []).includes(k))];
  const picks = liveKeys ? order.filter((k) => liveKeys.has(k)) : order;
  const dbTop = dayTodos.find((t) => t.is_top);
  let top = dbTop ? `todo:${dbTop.todo_id}` : (local.top && local.top.startsWith('habit:') ? local.top : null);
  if (!picks.includes(top)) top = picks[0] || null;
  return { picks: picks.slice(0, MAX_DAY_TODOS), top };
}

/** The picks with the highest priority first (M5 order()). */
export function topFirst(picks, top) {
  return [...picks].sort((a, b) => (b === top) - (a === top));
}

/**
 * The saves that take the day's to-dos from `before` to `after` (each
 * { todos: [todo ids], top: todo id or null }), in an order the database
 * accepts: removals first (at most three at a time), the old top cleared
 * before the new one is set (one top per plan), then additions.
 */
export function dayTodoOps(userId, planId, before, after) {
  const ops = [];
  const had = new Set(before.todos);
  const want = new Set(after.todos);
  for (const id of before.todos) {
    if (!want.has(id)) ops.push({ table: 'day_plan_todos', kind: 'delete', match: { day_plan_id: planId, todo_id: id, user_id: userId } });
  }
  const topMoved = before.top !== after.top;
  if (topMoved && before.top && want.has(before.top)) {
    ops.push({ table: 'day_plan_todos', kind: 'update', match: { day_plan_id: planId, todo_id: before.top, user_id: userId }, values: { is_top: false } });
  }
  for (const id of after.todos) {
    if (!had.has(id)) {
      ops.push({
        table: 'day_plan_todos',
        kind: 'upsert',
        onConflict: 'day_plan_id,todo_id',
        values: { day_plan_id: planId, todo_id: id, user_id: userId, is_top: id === after.top },
      });
    }
  }
  if (topMoved && after.top && had.has(after.top)) {
    ops.push({ table: 'day_plan_todos', kind: 'update', match: { day_plan_id: planId, todo_id: after.top, user_id: userId }, values: { is_top: true } });
  }
  return ops;
}

/** The saves for the Strategies of the day: removals first (two at most). */
export function dayStrategyOps(userId, planId, before, after) {
  const ops = [];
  for (const id of before) {
    if (!after.includes(id)) ops.push({ table: 'day_plan_strategies', kind: 'delete', match: { day_plan_id: planId, strategy_id: id, user_id: userId } });
  }
  for (const id of after) {
    if (!before.includes(id)) {
      ops.push({ table: 'day_plan_strategies', kind: 'upsert', onConflict: 'day_plan_id,strategy_id', ignoreDuplicates: true, values: { day_plan_id: planId, strategy_id: id, user_id: userId } });
    }
  }
  return ops;
}

/** "Is 1.5 hours right?" once per entry, for an odd night (M12, 2 to 14 hours). */
export function sleepToConfirm(hours, toConfirm) {
  return hours != null && Boolean(toConfirm) && m12IsOdd('sleep_hours', hours);
}

/**
 * The page's whole view for one day.
 * @param {object} d rows from loadDayPlan
 * @param {{ date: string, local: object }} opts the day, and what the device keeps
 *   ({ habits, order, top }, the habits chosen for it)
 */
export function dayPlanView(d, { date, local = {} }) {
  const sprint = sprintPageView(d, { today: date });
  const running = sprint?.state === 'running';
  const strategies = running || d.sprint ? (d.strategies || []) : (d.planStrategies || []);
  const strategyName = new Map(strategies.map((s) => [s.id, s.name]));
  const review = d.lastReview;
  const reviewTag = review ? lastListTag(review.local_date, date) : null;
  const fromReview = (t) => review && t.source === 'review_my_day' && t.source_id === review.id;
  const todoRows = new Map([...(d.todos || []), ...(d.looseTodos || [])].filter((t) => !t.deleted_at).map((t) => [t.id, t]));
  const chosenTodos = new Set((d.dayTodos || []).map((t) => t.todo_id));

  // Last night's things not yet made into a to-do (they join the sprint
  // only when chosen; decisions 23 Oct, 12:58).
  const made = new Set([...todoRows.values()].filter(fromReview).map((t) => t.text.trim().toLowerCase()));
  const night = review
    ? (review.tomorrow || []).map((t) => (t || '').trim()).filter(Boolean)
      .map((text, i) => ({ key: `night:${i}`, text }))
      .filter((n) => !made.has(n.text.toLowerCase()))
    : [];

  const options = [];
  for (const n of night) options.push({ value: n.key, label: n.text, tags: [reviewTag], kind: 'night', text: n.text });

  // This week's open to-dos (as the sprint lists them), and today's own.
  const open = [];
  if (running) {
    for (const t of sprint.todos.thisWeek) {
      if (t.movedOut) continue;
      if (t.done && !chosenTodos.has(t.id)) continue;
      open.push({ id: t.id, text: t.text, strategyName: t.strategyName, rolledFrom: t.rolledFrom });
    }
  } else {
    for (const t of d.looseTodos || []) {
      if (t.deleted_at || (t.done_on && !chosenTodos.has(t.id))) continue;
      open.push({ id: t.id, text: t.text, strategyName: strategyName.get(t.strategy_id) || '', rolledFrom: null });
    }
  }
  const tagFor = (t) => {
    const row = todoRows.get(t.id);
    if (row && fromReview(row)) return reviewTag;
    if (row?.source === 'plan_my_day' && row.created_on === date) return 'New to-do today';
    return t.rolledFrom ? `Rolled over from week ${t.rolledFrom}` : 'To-do this week';
  };
  const asOption = (t) => ({ value: `todo:${t.id}`, label: t.text, detail: t.strategyName, tags: [tagFor(t)], kind: 'todo', id: t.id });
  const fresh = open.filter((t) => !t.rolledFrom);
  const rolled = open.filter((t) => t.rolledFrom);
  // Last night's to-dos first (M5), then this week's, the habits, then rolled over.
  options.push(...fresh.filter((t) => fromReview(todoRows.get(t.id) || {})).map(asOption));
  options.push(...fresh.filter((t) => !fromReview(todoRows.get(t.id) || {})).map(asOption));

  // Weekly habits not yet met this week (daily ones are logged on the
  // numbers screen, decisions 23 Oct, 13:06). CHOICE (UNDEFINED, "weekly
  // habits that need time in the day"): a count or amount a week, or yes
  // or no once a week, not yet met.
  if (running) {
    const rowsById = new Map(sprint.habits.map((h) => [h.id, h]));
    for (const sh of d.sprintHabits || []) {
      const setting = settingForWeek(d.sprintSettings || [], sh.id, sprint.current);
      const row = rowsById.get(sh.id);
      if (!setting || !row) continue;
      const m = toMeasure(setting);
      const chosen = (local.habits || []).includes(sh.id);
      if (!weeklyMeasure(m) || (weeklyMet(m, row.values) && !chosen)) continue;
      options.push({ value: `habit:${sh.id}`, label: sh.name, detail: strategyName.get(sh.strategy_id) || '', tags: [`Habit, ${lowerFirst(row.weekLine)}`], kind: 'habit', id: sh.id });
    }
  }
  options.push(...rolled.map(asOption));

  const live = new Set(options.map((o) => o.value));
  const { picks, top } = dayPicks(d.dayTodos || [], local, live);
  const byKey = new Map(options.map((o) => [o.value, o]));
  const plan = d.dayPlan;
  const days = (d.dayStrategies || []).map((s) => s.strategy_id).filter((id) => strategyName.has(id));

  return {
    date,
    hasPlan: Boolean(d.plan),
    running,
    sprintId: running ? sprint.sprintId : null,
    week: running ? sprint.current : null,
    firstName: d.firstName || '',
    strategies: strategies.map((s) => ({ value: s.id, label: s.name })),
    options,
    picks,
    top,
    ordered: topFirst(picks, top).map((k) => byKey.get(k)).filter(Boolean),
    pickedTodoIds: picks.filter((k) => k.startsWith('todo:')).map((k) => k.slice(5)),
    topTodoId: top && top.startsWith('todo:') ? top.slice(5) : null,
    note: review?.on_my_mind?.trim() ? { label: lastNoteLabel(review.local_date, date), text: review.on_my_mind.trim() } : null,
    review: review ? { id: review.id, date: review.local_date } : null,
    nightStrategyId: nightTodoStrategy(review, strategies),
    dayStrategies: days,
    recent: recentWays(d.earlierWays || [], date),
    finished: plan?.status === 'finished',
    // The score this week so far (M5), as the sprint shows it: mint at or above the standard.
    score: running && sprint.soFar ? { value: `${sprint.soFar.value}%`, good: sprint.soFar.good } : null,
  };
}

/** The plan's own answers from its row, as the page keeps them. */
export function answersFromRow(row) {
  return {
    hours: row?.sleep_hours == null ? null : Number(row.sleep_hours),
    quality: row?.sleep_quality || null,
    grateful: row?.grateful_for || '',
    way: row?.way_of_being || '',
    risk: row?.biggest_risk || '',
    response: row?.risk_response || '',
  };
}

/** The page's answers as the day_plans columns (empty text saved as none). */
export function answersToRow(a) {
  const text = (v) => (v && v.trim() ? v.trim() : null);
  return {
    sleep_hours: a.hours,
    sleep_quality: a.quality,
    grateful_for: text(a.grateful),
    way_of_being: text(a.way),
    biggest_risk: text(a.risk),
    risk_response: text(a.response),
  };
}

/** "7.5 hours, good" for the summary (labels before numbers; no dots). */
export function sleepWords(a) {
  const q = SLEEP_QUALITY_OPTIONS.find((o) => o.value === a.quality)?.label;
  const parts = [];
  if (a.hours != null) parts.push(hoursWords(a.hours));
  if (q) parts.push(parts.length ? lowerFirst(q) : q);
  return parts.join(', ');
}

/** The risk's follow-up line in the summary: "If it happens, block 11:00 …" (no colon, writing rules). */
export function ifItHappens(response) {
  const t = (response || '').trim();
  return t ? `If it happens, ${lowerFirst(t)}` : '';
}
