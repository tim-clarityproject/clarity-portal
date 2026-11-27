// What Daily plan shows (mock-up M5, approved 23 Oct), worked out from
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
import { openRecovery, settingForWeek, toMeasure } from './rows';
import { sprintPageView } from './sprintPage';
import { carriedOver, carriedSource, thingKey } from './windDown';
import { sleepQualityWord } from './words';

export const MAX_DAY_STRATEGIES = 2;  // one recommended, two at most
export const WAY_MAX = 60;            // M5's box (the table allows 120)
export const DAY_TEXT_MAX = 300;      // grateful_for, biggest_risk, risk_response
export const SLEEP_MAX_HOURS = 14;    // M5's stepper stops here

export const SLEEP_QUALITY_OPTIONS = Object.freeze(
  // The five words (Tim, 10 Nov, 23:22): the saved keys stay as they are and read straight across, in order.
  SLEEP_QUALITY.map((value) => ({ value, label: sleepQualityWord(value) })),
);

// UNDEFINED (decisions 23 Oct, 13:16): the suggestions are to be drafted in
// three role versions for Tim's approval. CHOICE: M5's three for everyone.
export const WAY_SUGGESTIONS = Object.freeze(['Curious, not defensive', 'Decisive', 'Patient']);
// "See an example": two or three different ones (Stage D, question rule 10).
export const GRATITUDE_EXAMPLE = [
  'The team stepping up while I was away last week.',
  'A sharp training session from the players in the rain yesterday.',
  'Breakfast with my kids before school.',
];

const DAY_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/**
 * A real calendar day written "YYYY-MM-DD", in the years the portal works
 * in. An address can carry anything ("2026-13-45", "9999-12-31"): those
 * are not days, so the daily tools open on today instead.
 */
export function isDayKey(value) {
  const m = typeof value === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 2000 || y > 2199) return false;
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}

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

/** The sources of a to-do made from a wind-down thought (039 adds the first). */
export const WIND_DOWN_SOURCES = ['sleep_wind_down', 'other_tool'];

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
 * chosen for the day, with their order and a habit at the top
 * (dayPlanHabits.js: the device, and day_plan_habits once 039 has run).
 */
export function dayPicks(dayTodos = [], local = {}, liveKeys = null) {
  const fromDb = dayTodos.map((t) => `todo:${t.todo_id}`);
  // To-dos the database couldn't hold yet (before 047), kept on the device.
  const extra = (local.extra || []).map((id) => `todo:${id}`);
  const habits = (local.habits || []).map((id) => `habit:${id}`);
  const all = new Set([...fromDb, ...extra, ...habits]);
  const order = [...(local.order || []).filter((k) => all.has(k)), ...[...all].filter((k) => !(local.order || []).includes(k))];
  const picks = liveKeys ? order.filter((k) => liveKeys.has(k)) : order;
  const dbTop = dayTodos.find((t) => t.is_top);
  let top = dbTop ? `todo:${dbTop.todo_id}` : (local.top && local.top.startsWith('habit:') ? local.top : null);
  if (!picks.includes(top)) top = picks[0] || null;
  // As many as the person chose (Tim, 16 Nov, 19:03: no limit of three).
  return { picks, top };
}

/** The picks with the highest priority first (M5 order()). */
export function topFirst(picks, top) {
  return [...picks].sort((a, b) => (b === top) - (a === top));
}

/**
 * The saves that take the day's to-dos from `before` to `after` (each
 * { todos: [todo ids], top: todo id or null }), in an order the database
 * accepts: removals first (so the guard on how many a day holds is never met mid-way), the old top cleared
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
 * @param {{ date: string, local: object, windDown: string[] }} opts the day,
 *   what the device keeps ({ habits, order, top }, the habits chosen for
 *   it), and last night's wind-down thoughts (windDown.js)
 */
export function dayPlanView(d, { date, local = {}, windDown = [] }) {
  const sprint = sprintPageView(d, { today: date });
  const running = sprint?.state === 'running';
  const strategies = running || d.sprint ? (d.strategies || []) : (d.planStrategies || []);
  const strategyName = new Map(strategies.map((s) => [s.id, s.name]));
  const review = d.lastReview;
  const fromReview = (t) => review && t.source === 'review_my_day' && t.source_id === review.id;
  // A to-do made this morning from a wind-down thought: source
  // sleep_wind_down once 039 has run, other_tool before (CHOICE, step 6).
  const fromWindDown = (t) => WIND_DOWN_SOURCES.includes(t.source) && t.created_on === date;
  const todoRows = new Map([...(d.todos || []), ...(d.looseTodos || [])].filter((t) => !t.deleted_at).map((t) => [t.id, t]));
  const chosenTodos = new Set((d.dayTodos || []).map((t) => t.todo_id));

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
      // No sprint running: these are the Backlog's (Phase 8a follow-up,
      // step 4), offered in a quiet "From your Backlog" fold, never as the
      // day's list.
      open.push({ id: t.id, text: t.text, strategyName: strategyName.get(t.strategy_id) || '', rolledFrom: null, backlog: true });
    }
  }

  // Carried over (M19): Daily review's things for tomorrow first, then
  // last night's wind-down thoughts, a line in both once. A thing not yet
  // chosen is only on this list; once chosen it is a to-do on this week of
  // the sprint (decisions 23 Oct, 12:58) and stays here, chosen. A thing
  // made into a to-do and then done or moved on another day is left out.
  const carried = carriedOver({ review: review ? review.tomorrow || [] : [], windDown });
  const madeFrom = [...todoRows.values()].filter((t) => fromReview(t) || fromWindDown(t));
  const openIds = new Set(open.map((t) => t.id));
  const used = new Set();
  const options = [];
  carried.forEach((c, i) => {
    // Daily review's priorities keep their order as priority 1, 2 and 3 (Tim, 5 Nov, 10:38).
    const where = carriedSource(c, review?.local_date, date);
    const tags = c.review && c.reviewIndex != null ? [`Priority ${c.reviewIndex + 1}`, where] : [where];
    const made = madeFrom.find((t) => !used.has(t.id) && thingKey(t.text) === thingKey(c.text) && ((c.review && fromReview(t)) || (c.windDown && fromWindDown(t))));
    if (made) {
      used.add(made.id);
      if (!openIds.has(made.id)) return;
      const t = open.find((o) => o.id === made.id);
      // M19: a carried-over row shows only where it came from; the
      // Strategy stays on the option for Daily review.
      options.push({ value: `todo:${t.id}`, label: t.text, detail: t.strategyName, tags, kind: 'todo', id: t.id, group: 'carried', onlyTags: true });
      return;
    }
    options.push({ value: `night:${i}`, label: c.text, tags, kind: 'night', text: c.text, review: c.review, windDown: c.windDown, group: 'carried' });
  });

  const tagFor = (t) => {
    const row = todoRows.get(t.id);
    if (row?.source === 'plan_my_day' && row.created_on === date) return 'New to-do today';
    return t.rolledFrom ? `Rolled over from week ${t.rolledFrom}` : 'To-do this week';
  };
  const asOption = (t) => (t.backlog
    ? { value: `todo:${t.id}`, label: t.text, detail: t.strategyName, tags: ['In your backlog'], kind: 'todo', id: t.id, group: 'backlog' }
    : { value: `todo:${t.id}`, label: t.text, detail: t.strategyName, tags: [tagFor(t)], kind: 'todo', id: t.id, group: 'week' });
  const rest = open.filter((t) => !used.has(t.id));
  // Then this week's (M5): the to-dos, the habits, then rolled over.
  options.push(...rest.filter((t) => !t.rolledFrom).map(asOption));

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
      options.push({ value: `habit:${sh.id}`, label: sh.name, detail: strategyName.get(sh.strategy_id) || '', tags: [`Habit, ${lowerFirst(row.weekLine)}`], kind: 'habit', id: sh.id, group: 'week' });
    }
  }
  options.push(...rest.filter((t) => t.rolledFrom).map(asOption));

  const live = new Set(options.map((o) => o.value));
  const { picks, top } = dayPicks(d.dayTodos || [], local, live);
  const byKey = new Map(options.map((o) => [o.value, o]));
  const plan = d.dayPlan;
  const days = (d.dayStrategies || []).map((s) => s.strategy_id).filter((id) => strategyName.has(id));

  return {
    date,
    hasPlan: Boolean(d.plan),
    running,
    // A Recovery open on this day (M15): the daily tools are paused, so
    // the page says so calmly instead of "No sprint is running".
    inRecovery: inRecoveryOn(d.recoveries, date),
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

/**
 * Recovery's calm lines in Daily plan and Daily review (M15 "Plan,
 * review and logging reminders pause", "nothing counts against you";
 * Claude's wording, Phase 5 step 4), in place of "No sprint is running".
 */
export const RECOVERY_DAY_LINE = 'Your daily tools are paused while you recharge, so nothing here counts against you.';
export const RECOVERY_NUMBERS_LINE = 'You’re in recovery, so there are no numbers to log today.';

/** Whether a Recovery is open on this day: one not yet ended, begun on or before it. */
export function inRecoveryOn(recoveries = [], date) {
  const open = openRecovery(recoveries || []);
  return Boolean(open && open.start_on <= date);
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
/** The Daily plan's risk question (Stage D, Draft 11: one question where there were two). */
export const RISK_QUESTION = 'What’s most likely to knock today off course?';
/** The small grey word on the first of the day's to-dos (Draft 11; no stars). */
export const MOST_IMPORTANT = 'Most important';
/** Said under the commit box when Next is pressed with it empty: it can't be skipped. */
export const RESPONSE_NEEDED = 'Type what you’ll do to carry on.';

/**
 * The Daily plan's commit question, quoting their own answer (Draft 11):
 * "If “the 10:00 runs over” happens, what will you do?". Its end stop goes,
 * and a long answer ends in "…"; with nothing typed, "If it happens, …".
 */
export function responseQuestion(risk) {
  let t = String(risk || '').replace(/\s+/g, ' ').trim().replace(/[.!?…]+$/u, '').trim();
  if (!t) return 'If it happens, what will you do?';
  if (t.length > 80) t = `${t.slice(0, 79).trimEnd()}…`;
  return `If “${t}” happens, what will you do?`;
}

export function ifItHappens(response) {
  const t = (response || '').trim();
  return t ? `If it happens, ${lowerFirst(t)}` : '';
}

/**
 * The day a Daily plan's sleep answer belongs to (tidy pass, item 4). The
 * question is about last night, so an answer given after midnight on a plan
 * opened the day before belongs to the day it is saved on: the reverse of
 * the Daily review's 04:00 rule. The rest of the plan keeps its day. A past
 * day's plan opened on purpose (its address names that day) keeps its own
 * sleep. `changedOn` is the person's own day when the sleep answer last
 * changed (localToday), or none when it hasn't changed on this page.
 */
export function sleepSaveDay({ planDate, openedOn, changedOn }) {
  if (!changedOn || planDate !== openedOn) return planDate;
  return changedOn > planDate ? changedOn : planDate;
}

const SLEEP_COLUMNS = ['sleep_hours', 'sleep_quality', 'sleep_to_confirm'];

/**
 * A Daily plan save split by day: the plan's own columns for the plan's day,
 * and, when the sleep answer belongs to a later day (sleepSaveDay), its
 * columns for that day on their own. Blank sleep answers are left out of the
 * moved part, so they never wipe one already saved there.
 * Returns { plan, sleep } where sleep is null or { date, values }.
 */
export function splitPlanSave(values, planDate, sleepDay) {
  if (!sleepDay || sleepDay === planDate) return { plan: values, sleep: null };
  const plan = {};
  const moved = {};
  for (const [k, v] of Object.entries(values)) {
    if (SLEEP_COLUMNS.includes(k)) {
      if (v != null && v !== '') moved[k] = v;
    } else plan[k] = v;
  }
  return { plan, sleep: Object.keys(moved).length ? { date: sleepDay, values: moved } : null };
}

/**
 * What Recovery's Sleep panel sends (tidy pass, item 4). On the panel's own
 * day only what the person answered or changed is sent, so an answer shown
 * from before is never rewritten (or an older one above 14 cut to 14). When
 * the save moves to a later day (opened before midnight, saved after), the
 * whole answer shown moves with it, as the Daily plan's splitPlanSave moves
 * every sleep column: an hours answer shown but not changed is copied too,
 * at its saved value (`raw`), not the 14 it may show as.
 */
export function sleepPanelSend({ hours, quality, touched = {}, savedHas = {}, raw = {}, moving = false }) {
  if (moving) {
    return {
      hours: !touched.hours && savedHas.hours && raw.hours != null ? raw.hours : hours,
      quality: !touched.quality && savedHas.quality && raw.quality ? raw.quality : quality,
    };
  }
  return {
    hours: touched.hours || !savedHas.hours ? hours : null,
    quality: touched.quality || !savedHas.quality ? quality : null,
  };
}
