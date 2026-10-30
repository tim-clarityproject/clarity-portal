// What Review my day shows (mock-up M5, approved 23 Oct), worked out from
// the rows in one place. Pure code: no database, no React, no device
// clock (the day and the hour are passed in), tested in tests/performance.
//
// The day's to-dos are Plan my day's own (dayPlanView, the same picks in
// the same order), and the week's to-dos, habits and score come from the
// sprint page's view (sprintPageView), so they are the same as the sprint
// shows: M2 for the to-dos, M1 for the habits, M5 "so far" for the score.
// What the methods don't define is a screen choice made here and listed
// in progress.md (CHOICE or UNDEFINED): which day a review after midnight
// is for, a day with no plan, ticking a habit on the week's list.

import { weekday } from '../scores/dates.js';
import { addDayKey, dayPlanView } from './dayPlan';
import { settingForWeek, toMeasure } from './rows';
import { sprintPageView } from './sprintPage';

export const REVIEW_TEXT_MAX = 4000;   // went_well, differently, on_my_mind
export const WHERE_MAX = 1000;         // where_it_showed
export const MAX_TOMORROW = 3;         // day_reviews.tomorrow holds up to three
export const TOMORROW_ITEM_MAX = 300;  // CHOICE (audit R7): the to-do limit, as the database has none per item
export const REVIEW_EARLY_HOURS = 4;   // a review started before 04:00 can be for the day before

export const DIFFERENTLY_EXAMPLE = 'Leave ten minutes between calls, so I start each one ready.';
export const TOMORROW_EXAMPLE = 'Call Evan before 09:00 about the referral.';
export const MOVED_LEVELS = Object.freeze({ 1: 'Low', 2: 'Medium', 3: 'High' });

const lowerFirst = (t) => (t && !/^.[A-Z]/.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t);

/**
 * Which day a review is for. UNDEFINED (audit R0, a review done after
 * midnight). CHOICE: before 04:00, if the day before has a plan and no
 * finished review, the review is for the day before (its date shows in
 * the top bar); otherwise it is for today.
 */
export function reviewDayFor({ today, hour, yesterdayPlanned = false, yesterdayReviewed = false }) {
  if (hour < REVIEW_EARLY_HOURS && yesterdayPlanned && !yesterdayReviewed) return addDayKey(today, -1);
  return today;
}

/** "On a scale of 1 to 10, how calm under pressure were you today?" (M5). */
export function wayQuestion(way) {
  const w = (way || '').trim().replace(/[.!?]+$/, '');
  return w ? `On a scale of 1 to 10, how ${lowerFirst(w)} were you today?` : 'On a scale of 1 to 10, how was today?';
}

/** The morning's reminder (M5): both Strategies of the day, by name. */
export function reminderLine(names = []) {
  if (!names.length) return 'Choose any that moved today.';
  return `This morning you said today would serve ${names.join(' and ')} most.`;
}

/** Writing rule 64: a question about one thing names it. */
export function movedQuestion(name) {
  return `How much did “${name}” move?`;
}

function listWords(items) {
  if (items.length < 2) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/**
 * The one sentence for the weekly habits on the numbers screen (M5 "So far
 * this week: training 1 of 4, …"), as a full sentence with no colon
 * (writing rules): "So far this week you have training sessions at 1 of 4
 * and weekly strategic block still to do." The figures are the sprint's
 * own week lines (logRow), never worked out here.
 */
export function weeklySentence(habits = []) {
  const parts = habits.map((h) => {
    const name = lowerFirst(h.name);
    if (h.measure === 'yes_no_weekly') return /^Done/.test(h.weekLine) ? `${name} done` : `${name} still to do`;
    const limit = /^(.*) this week, no more than (.*)$/.exec(h.weekLine || '');
    if (limit) return `${name} at ${limit[1]} with a limit of ${limit[2]}`;
    return `${name} at ${(h.weekLine || '').replace(/ this week$/, '')}`;
  });
  return parts.length ? `So far this week you have ${listWords(parts)}.` : '';
}

/**
 * A habit ticked as done on the review's list. UNDEFINED (audit R1).
 * CHOICE: a count logs one more that day (one fewer when unticked, down to
 * not logged); a once-a-week yes or no logs yes that day (cleared when
 * unticked). Anything else (an amount) logs nothing here: its row is on
 * the numbers screen. Returns the day's new value, null to clear it, or
 * undefined for "no log".
 */
export function habitTickValue(measure, current, ticked) {
  const now = current == null ? 0 : Number(current);
  if (measure === 'count' || measure === 'count_limit') {
    if (ticked) return now + 1;
    return now > 1 ? now - 1 : null;
  }
  if (measure === 'yes_no_weekly') return ticked ? 1 : null;
  return undefined;
}

/** Whether a habit is logged a day at a time (the numbers screen) or across the week. */
export function isDailyHabit(m) {
  if (m.measure === 'count' || m.measure === 'amount') return m.targetPer === 'day';
  if (m.measure === 'count_limit') return m.limitPer === 'day';
  return m.measure === 'yes_no_days_limit' || m.measure === 'yes_no_days_target' || m.measure === 'rating';
}

/** How a habit is entered on the numbers screen (as the sprint's Log today). */
export function entryKind(measure) {
  if (measure === 'count' || measure === 'count_limit') return 'stepper';
  if (measure === 'yes_no_days_limit' || measure === 'yes_no_days_target') return 'yesno';
  if (measure === 'rating') return 'rating';
  if (measure === 'yes_no_weekly') return 'tick';
  return 'number';
}

/** The things for tomorrow as day_reviews.tomorrow: typed rows only, three at most, each within the limit. */
export function tomorrowToRow(rows = []) {
  return rows.map((t) => (t || '').trim()).filter(Boolean).slice(0, MAX_TOMORROW).map((t) => t.slice(0, TOMORROW_ITEM_MAX));
}

/** The review's own answers from its row, as the page keeps them. */
export function reviewAnswersFromRow(row) {
  const tomorrow = (row?.tomorrow || []).filter((t) => (t || '').trim());
  return {
    rating: row?.way_of_being_rating ?? null,
    where: row?.where_it_showed || '',
    wentWell: row?.went_well || '',
    differently: row?.differently || '',
    tomorrow: tomorrow.length ? tomorrow : [''],
    onMind: row?.on_my_mind || '',
  };
}

/** The page's answers as the day_reviews columns (empty text saved as none). */
export function reviewAnswersToRow(a) {
  const text = (v) => (v && v.trim() ? v.trim() : null);
  return {
    way_of_being_rating: a.rating ?? null,
    where_it_showed: text(a.where),
    went_well: text(a.wentWell),
    differently: text(a.differently),
    tomorrow: tomorrowToRow(a.tomorrow),
    on_my_mind: text(a.onMind),
  };
}

/**
 * The saves for "Which Strategies moved today?" from `before` to `after`
 * (each { [strategy id]: level 1 to 3 }): removals first, then each new
 * or changed level (found by the review and the Strategy, so a resend
 * writes the same row).
 */
export function dayReviewStrategyOps(userId, reviewId, before = {}, after = {}) {
  const ops = [];
  for (const id of Object.keys(before)) {
    if (after[id] == null) ops.push({ table: 'day_review_strategies', kind: 'delete', match: { day_review_id: reviewId, strategy_id: id, user_id: userId } });
  }
  for (const [id, level] of Object.entries(after)) {
    if (before[id] !== level) {
      ops.push({ table: 'day_review_strategies', kind: 'upsert', onConflict: 'day_review_id,strategy_id', values: { day_review_id: reviewId, strategy_id: id, user_id: userId, level } });
    }
  }
  return ops;
}

/** The days a win can be added to: this sprint week up to the review's day, or Monday to that day with no sprint. */
function winDaysFor(sprint, date) {
  if (sprint?.state === 'running') return sprint.winDays;
  const short = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const out = [];
  for (let k = addDayKey(date, -weekday(date)); k <= date; k = addDayKey(k, 1)) out.push({ value: k, label: short[weekday(k)] });
  return out;
}

/**
 * The page's whole view for one day.
 * @param {object} d rows from loadDayReview (loadDayPlan's, plus the review)
 * @param {{ date: string, planLocal: object, local: object }} opts the day;
 *   what the device keeps for that day's plan ({ habits, order, top });
 *   and for this review ({ habitTicks, extra, wins }): the habits ticked,
 *   the things ticked on this week's list, and the wins added here.
 */
export function dayReviewView(d, { date, planLocal = {}, local = {} }) {
  const plan = dayPlanView(d, { date, local: planLocal });
  const sprint = sprintPageView(d, { today: date });
  const running = plan.running;
  const todoRows = new Map([...(d.todos || []), ...(d.looseTodos || [])].filter((t) => !t.deleted_at).map((t) => [t.id, t]));
  const habitRows = new Map((running ? sprint.habits : []).map((h) => [h.id, h]));
  const measureOf = (id) => {
    const setting = running ? settingForWeek(d.sprintSettings || [], id, sprint.current) : null;
    return setting ? toMeasure(setting) : null;
  };
  const habitTicks = local.habitTicks || {};
  const extra = local.extra || {};

  // Today's to-dos: the plan's picks, the highest priority first.
  const today = plan.ordered.map((o, i) => {
    const done = o.kind === 'habit'
      ? (habitTicks[o.id] ?? Boolean(habitRows.get(o.id)?.values?.[date] > 0))
      : Boolean(todoRows.get(o.id)?.done_on);
    return { key: o.value, kind: o.kind, id: o.id, text: o.label, strategyName: o.detail || '', top: i === 0, done, measure: o.kind === 'habit' ? measureOf(o.id)?.measure : null };
  });
  const picked = new Set(plan.picks);

  // This week's list (M5 "Show this week's list"): the rest of the week's
  // open to-dos (and any ticked done on this day), then the weekly habits
  // not yet met (or ticked here), each with its tag.
  const week = [];
  if (running) {
    for (const t of sprint.todos.thisWeek) {
      const row = todoRows.get(t.id);
      if (t.movedOut || picked.has(`todo:${t.id}`) || !row) continue;
      if (row.done_on && row.done_on !== date) continue;
      week.push({ key: `todo:${t.id}`, kind: 'todo', id: t.id, text: t.text, strategyName: t.strategyName, tags: [t.rolledFrom ? `Rolled over from week ${t.rolledFrom}` : 'To-do this week'], done: Boolean(row.done_on) });
    }
    for (const h of sprint.habits) {
      const m = measureOf(h.id);
      if (!m || picked.has(`habit:${h.id}`)) continue;
      const weeklyCount = (m.measure === 'count' && m.targetPer === 'week') || m.measure === 'yes_no_weekly';
      if (!weeklyCount) continue;
      const logged = Object.values(h.values || {});
      const met = m.measure === 'yes_no_weekly' ? logged.some((v) => v > 0) : m.target != null && logged.reduce((s, v) => s + v, 0) >= m.target;
      if (met && extra[`habit:${h.id}`] == null) continue;
      week.push({ key: `habit:${h.id}`, kind: 'habit', id: h.id, text: h.name, strategyName: h.strategyName, tags: [`Habit, ${lowerFirst(h.weekLine)}`], done: Boolean(extra[`habit:${h.id}`]), measure: m.measure });
    }
  } else {
    for (const row of d.looseTodos || []) {
      if (row.deleted_at || picked.has(`todo:${row.id}`) || (row.done_on && row.done_on !== date)) continue;
      const name = plan.strategies.find((s) => s.value === row.strategy_id)?.label || '';
      week.push({ key: `todo:${row.id}`, kind: 'todo', id: row.id, text: row.text, strategyName: name, tags: ['To-do'], done: Boolean(row.done_on) });
    }
  }

  // Today's numbers: the habits logged a day at a time, plus an amount a
  // week chosen for today (its tick logs nothing; the amount goes in here).
  const numbers = [];
  const weekly = [];
  if (running) {
    for (const h of sprint.habits) {
      const m = measureOf(h.id);
      if (!m) continue;
      const chosenAmount = m.measure === 'amount' && picked.has(`habit:${h.id}`);
      if (isDailyHabit(m) || chosenAmount) numbers.push({ ...h, kind: entryKind(m.measure) });
      else weekly.push(h);
    }
  }

  const strategyName = new Map(plan.strategies.map((s) => [s.value, s.label]));
  const wins = (d.wins || [])
    .filter((w) => !w.deleted_at && (w.local_date === date || (local.wins || []).includes(w.id)))
    .map((w) => ({
      id: w.id,
      text: w.what,
      strategyName: (d.winLinks || []).filter((l) => l.win_id === w.id).map((l) => strategyName.get(l.strategy_id)).filter(Boolean).join(', '),
      day: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][weekday(w.local_date)],
    }));

  const doneToday = today.filter((t) => t.done).length;
  const doneFromWeek = week.filter((t) => t.done).length;
  const review = d.dayReview;
  return {
    date,
    hasPlan: plan.hasPlan,
    running,
    sprintId: plan.sprintId,
    week: plan.week,
    firstName: plan.firstName,
    strategies: plan.strategies,
    way: (d.dayPlan?.way_of_being || '').trim(),
    today,
    weekList: week,
    numbers,
    weeklyLine: weeklySentence(weekly),
    wins,
    winDays: winDaysFor(sprint, date),
    // In the plan's order (the database keeps no order for the day's two).
    reminder: reminderLine(plan.strategies.filter((s) => plan.dayStrategies.includes(s.value)).map((s) => s.label)),
    moved: Object.fromEntries((d.reviewStrategies || []).filter((s) => strategyName.has(s.strategy_id)).map((s) => [s.strategy_id, s.level])),
    doneToday,
    doneFromWeek,
    // The summary's to-do line (M5 "2 of 3 done", "Plus 1 more from this week’s list.").
    todoLine: today.length ? `${doneToday} of ${today.length} done` : (doneFromWeek ? `${doneFromWeek} done from this week’s list` : ''),
    todoPlus: today.length && doneFromWeek ? `Plus ${doneFromWeek} more from this week’s list.` : null,
    winsLine: wins.length ? `Plus ${wins.length} unplanned win${wins.length === 1 ? '' : 's'}.` : null,
    finished: review?.status === 'finished',
    score: plan.score,
  };
}

/** "Grow through referrals, High" for the summary (labels before levels; no dots). */
export function movedLines(moved = {}, strategies = []) {
  return strategies.filter((s) => moved[s.value] != null).map((s) => `${s.label}, ${MOVED_LEVELS[moved[s.value]]}`);
}

/** "Calm under pressure, 7/10" for the summary. */
export function howYouWere(way, rating) {
  if (rating == null) return '';
  return `${(way || '').trim() || 'Today'}, ${rating}/10`;
}
