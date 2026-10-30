// What the Weekly performance debrief shows (mock-up M1, R.debrief),
// worked out from the rows in one place. Pure code: no database, no React,
// no device clock (today is passed in), tested in tests/performance.
//
// Every figure comes from src/lib/scores: M0.4 for the sprint weeks and
// the debrief window (m0DebriefWindow), M1 and M5 for the habits and the
// week's score (through rows.js sprintWeekResult, as the sprint page),
// M0.5 and M8 for the usual range, M9 for the objectives' figures and M11
// for the debrief streak. What the methods don't define is a screen
// choice made here and listed in progress.md (CHOICE or UNDEFINED).

import { weekday } from '../scores/dates.js';
import {
  m0AtStandard,
  m0DebriefWindow,
  m0Round,
  m0SprintCalendar,
  m0WeekIsEligible,
  m0WeekOfDay,
  m8UsualRange,
  m9FigureOn,
  m11DebriefStreak,
  USUAL_RANGE_MIN_WEEKS,
} from '../scores/index.js';
import { settingForWeek, sprintWeekResult, toObjective, toRecoveries } from './rows';
import { dayBox, dayName, dayNameFull, logRow, sprintTodos, weekOptions, weekRange } from './sprintPage';
import { MOVED_LEVELS } from './dayReview';
import { objectiveFigure, plainNumber, shortDate } from './words';

export const DEBRIEF_TEXT_MAX = 4000; // went_well, got_in_way, adjust

/** M1's stress answers, as weekly_debriefs.stress stores them (M12). */
export const STRESS_OPTIONS = Object.freeze([
  { value: 'not_at_all', label: 'Not at all' },
  { value: 'a_little', label: 'A little' },
  { value: 'moderately', label: 'Moderately' },
  { value: 'quite_a_lot', label: 'Quite a lot' },
  { value: 'very_much', label: 'Very much' },
]);
export const STRESS_QUESTION = 'This past week, how much did you feel tense, restless, nervous or anxious?';

const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ---------------------------------------------------------------- which week

/**
 * Every sprint's weeks in sprint time (M0.4), with each week's debrief
 * window. A finished sprint stops at its last day; a sprint that hasn't
 * started has none.
 * @param {object[]} sprints sprints rows
 * @param {object[]} recoveries recovery_periods rows
 */
export function sprintWeeksWithWindows(sprints = [], recoveries = [], today) {
  const out = [];
  const ordered = [...sprints].sort((a, b) => a.number - b.number);
  for (const s of ordered) {
    if (today < s.start_on) continue;
    const calendar = m0SprintCalendar({ start: s.start_on, lengthWeeks: s.length_weeks, recoveries: toRecoveries(recoveries) }, today);
    for (const wk of calendar.weeks) {
      if (s.status === 'finished' && s.actual_end_on && wk.start > s.actual_end_on) continue;
      out.push({ sprint: s, sprintId: s.id, number: wk.number, week: wk, window: m0DebriefWindow(wk, today) });
    }
  }
  return out;
}

/**
 * The week whose debrief window is open today, if any (windows never
 * overlap: one closes 3 days after a week ends, the next opens 2 days
 * before the next week ends). Null when none is open.
 */
export function pickDebriefWeek(sprints, recoveries, today) {
  const open = sprintWeeksWithWindows(sprints, recoveries, today).filter((w) => w.window?.open);
  if (!open.length) return null;
  const w = open[open.length - 1];
  return { sprintId: w.sprintId, week: w.number };
}

/** When the next debrief opens (a running sprint's next week to come), or null. */
export function nextDebriefOpens(sprints, recoveries, today) {
  const next = sprintWeeksWithWindows(sprints, recoveries, today)
    .find((w) => w.sprint.status === 'running' && w.window?.state === 'before');
  return next ? { sprintId: next.sprintId, week: next.number, opensOn: next.window.opensOn } : null;
}

/**
 * Another week whose debrief is open today, for a page showing a week
 * that isn't open (an old week's link): { sprintId, week } or null.
 */
function openElsewhere(d, today, week) {
  const open = pickDebriefWeek(d.sprints || [d.sprint], d.recoveries || [], today);
  return open && !(open.sprintId === d.sprint.id && open.week === week) ? open : null;
}

/**
 * M11's input: finished sprint weeks across sprints, oldest first, each
 * with whether its debrief is done and whether its window is still open.
 * `thisOne` ({ sprintId, week }) counts as done (M1 "including this one"),
 * and is added when its week hasn't finished yet (a debrief started in the
 * week's last 3 days).
 */
export function debriefStreakWeeks(sprints, recoveries, debriefs, today, thisOne = null) {
  const done = new Set((debriefs || []).filter((x) => x.status === 'finished').map((x) => `${x.sprint_id}:${x.sprint_week}`));
  const isThis = (w) => thisOne && w.sprintId === thisOne.sprintId && w.number === thisOne.week;
  return sprintWeeksWithWindows(sprints, recoveries, today)
    .filter((w) => w.week.finished || isThis(w))
    .map((w) => ({
      debriefDone: isThis(w) || done.has(`${w.sprintId}:${w.number}`),
      windowOpen: Boolean(w.window?.open),
    }));
}

/** "You’ve debriefed 6 weeks in a row, including this one." (rule 48: a full sentence). */
export function streakLine(n) {
  if (n <= 1) return 'This week starts your streak.';
  return `You’ve debriefed ${n} weeks in a row, including this one.`;
}

// ---------------------------------------------------------------- answers

export function debriefAnswersFromRow(row) {
  return {
    stress: row?.stress || null,
    wentWell: row?.went_well || '',
    inTheWay: row?.got_in_way || '',
    adjust: row?.adjust || '',
  };
}

export function debriefAnswersToRow(a) {
  const text = (s) => {
    const t = (s || '').slice(0, DEBRIEF_TEXT_MAX);
    return t.trim() ? t : null;
  };
  return { stress: a.stress || null, went_well: text(a.wentWell), got_in_way: text(a.inTheWay), adjust: text(a.adjust) };
}

// ---------------------------------------------------------------- objectives

/**
 * The day a debrief's objective figure is recorded on: the week's last
 * day, or today when the week hasn't ended (CHOICE, audit D3), so "last
 * week" for the next debrief reads it.
 */
export function figureDay(week, today) {
  return today < week.end ? today : week.end;
}

/**
 * The change at a glance once a new figure is typed ("+9", "−3"): the
 * difference of the two figures as people see them, never rounded past
 * what was typed (M0.1). A move towards the target is good (mint);
 * anything else stays grey. Nothing for no change.
 */
export function figureChange(objective, now, before) {
  if (now == null || before == null) return null;
  const diff = Math.round((now - before) * 100) / 100;
  if (!diff) return null;
  const down = objective.kind === 'number' && objective.direction === 'down';
  const sign = diff > 0 ? '+' : '−';
  return { text: `${sign}${plainNumber(Math.abs(diff))}`, good: down ? diff < 0 : diff > 0 };
}

/**
 * Each live objective as the Objectives step shows it (M1 "oin").
 * UNDEFINED (audit D3, what "Last week" is). CHOICE: the figure in force
 * before this debrief's own, on the week's last day (M9's m9FigureOn,
 * leaving out this debrief's figure), so the box starts on it and the
 * change shows only once it moves. "Not set yet" when there is none.
 */
export function debriefObjectives(d, { sprintId, week, day }) {
  const own = new Map((d.figures || []).filter((f) => f.sprint_id === sprintId && f.sprint_week === week).map((f) => [f.objective_id, f]));
  return (d.objectives || []).map((row, i) => {
    const mine = own.get(row.id) || null;
    const objective = toObjective(row, (d.figures || []).filter((f) => f !== mine));
    if (row.kind === 'milestone') {
      const reached = Boolean(row.reached_on && row.reached_on <= day);
      return {
        id: row.id, number: i + 1, name: row.name, kind: 'milestone', reached,
        status: reached ? 'Reached' : `Not reached yet, due by ${shortDate(row.due_on)}`,
      };
    }
    const before = m9FigureOn(objective, day) ?? null;
    return {
      id: row.id,
      number: i + 1,
      name: row.name,
      kind: row.kind,
      objective,
      unit: row.kind === 'rating' ? '/10' : unitWord(row.unit),
      decimals: row.kind !== 'rating',
      before,
      lastLine: before == null ? 'Not set yet' : `Last week ${objectiveFigure(objective, before)}`,
      figureId: mine?.id || null,
      value: mine ? Number(mine.value) : before,
    };
  });
}

// The unit beside the box: the objective's own ("£k", "clients").
const unitWord = (unit) => (unit || '').trim() || undefined;

// ---------------------------------------------------------------- the view

/**
 * The debrief's whole view for one sprint week.
 * @param {object} d rows from loadDebrief
 * @param {{ today: string, local?: object }} opts
 */
export function debriefView(d, { today }) {
  if (!d?.sprint) return { state: 'none', today, next: nextDebriefOpens(d?.sprints || [], d?.recoveries || [], today), hasPlan: Boolean(d?.plan) };
  const sprint = d.sprint;
  const number = d.week;
  const calendar = m0SprintCalendar({ start: sprint.start_on, lengthWeeks: sprint.length_weeks, recoveries: toRecoveries(d.recoveries || []) }, today);
  const wk = calendar.weeks[number - 1];
  const window = wk ? m0DebriefWindow(wk, today) : null;
  const finished = d.debrief?.status === 'finished';
  const base = { today, sprintId: sprint.id, week: number, standard: sprint.standard, sprintName: `Performance Sprint ${sprint.number}`, lengthWeeks: sprint.length_weeks, finished };
  // Before its last 3 days, or closed with no debrief done: nothing to fill in.
  if (!wk || !window || window.state === 'before') {
    return { ...base, state: 'before', opensOn: window ? dayName(window.opensOn, today) : null, next: nextDebriefOpens(d.sprints || [], d.recoveries || [], today), openNow: openElsewhere(d, today, number) };
  }
  if (window.state === 'after' && !finished) {
    const r = sprintWeekResult(d, calendar, number, null);
    const raw = r.result.score;
    return {
      ...base,
      state: 'closed',
      closedOn: dayName(window.closesOn, today),
      score: raw == null ? null : { value: m0Round(raw), good: m0AtStandard(raw, sprint.standard) },
      next: nextDebriefOpens(d.sprints || [], d.recoveries || [], today),
      openNow: openElsewhere(d, today, number),
    };
  }

  const weekDone = wk.finished;
  const upTo = weekDone ? wk.end : today;
  const r = sprintWeekResult(d, calendar, number, weekDone ? null : today);
  const raw = r.result.score;
  const habitScores = new Map(r.result.habits.map((h) => [h.id, h]));
  const strategyName = new Map((d.strategies || []).map((s) => [s.id, s.name]));
  const units = d.personSettings?.units || 'metric';

  // Numbers (M1 step 1): grouped by Strategy, every day of the week.
  const days = wk.days.map((day) => ({ key: day, box: dayBox(day), full: dayNameFull(day), today: day === today, later: day > today }));
  const habits = [];
  for (const sh of d.sprintHabits || []) {
    const setting = settingForWeek(d.sprintSettings || [], sh.id, number);
    if (!setting) continue;
    const hs = habitScores.get(sh.id);
    const row = logRow(sh, setting, {
      week: wk, workingDays: r.workingDays, today: upTo, logs: d.logs || [], score: hs?.score ?? null, notLogged: hs?.notLogged,
      strategyName: strategyName.get(sh.strategy_id) || '', units,
    });
    habits.push({ ...row, total: habitTotal(row, hs, sprint.standard) });
  }
  const groups = (d.strategies || [])
    .map((s) => ({ id: s.id, name: s.name, habits: habits.filter((h) => h.strategyId === s.id) }))
    .filter((g) => g.habits.length);

  const todos = sprintTodos(d, calendar, number, today);

  // Your days (M1 "Your days"): the week's Review my day entries.
  const reviewLevel = new Map();
  for (const x of d.reviewStrategies || []) {
    if (!reviewLevel.has(x.day_review_id)) reviewLevel.set(x.day_review_id, []);
    reviewLevel.get(x.day_review_id).push(x);
  }
  const yourDays = (d.dayReviews || [])
    .filter((x) => wk.days.includes(x.local_date) && ((x.went_well || '').trim() || (x.differently || '').trim()))
    .sort((a, b) => (a.local_date < b.local_date ? -1 : 1))
    .map((x) => ({
      key: x.local_date,
      title: dayName(x.local_date, today),
      wentWell: (x.went_well || '').trim(),
      differently: (x.differently || '').trim(),
      moved: (reviewLevel.get(x.id) || []).filter((m) => strategyName.has(m.strategy_id))
        .map((m) => `${strategyName.get(m.strategy_id)}, ${MOVED_LEVELS[m.level]}`),
    }));

  // Next week (M1 step 7): open to-dos that roll over and next week's.
  const last = number >= sprint.length_weeks;
  const nextWk = last ? null : calendar.weeks[number];
  let nextWeek = null;
  if (nextWk) {
    const n = sprintTodos(d, calendar, number + 1, today);
    const current = m0WeekOfDay(calendar.weeks, today) || number;
    nextWeek = {
      number: number + 1,
      range: weekRange(nextWk, today),
      todos: n.thisWeek.filter((t) => !t.movedOut).map((t) => ({
        id: t.id, text: t.text, strategyName: t.strategyName, done: t.done,
        tags: t.rolledFrom != null && t.rolledFrom <= number ? [`Rolls over from week ${t.rolledFrom}`] : [],
      })),
      weekOptions: weekOptions(calendar, current, sprint.length_weeks, today, number + 1),
    };
  }

  // The summary (M1 step 8): the score, the usual range, the streak.
  const thisOne = { sprintId: sprint.id, week: number };
  const streak = m11DebriefStreak(debriefStreakWeeks(d.sprints || [sprint], d.recoveries || [], d.allDebriefs || [], today, thisOne));
  const usual = usualRangeFor(d, calendar, number, sprint);
  const score = raw == null ? null : { value: m0Round(raw), good: m0AtStandard(raw, sprint.standard) };

  return {
    ...base,
    state: 'open',
    window: { ...window, closesOnText: dayName(window.closesOn, today) },
    weekDone,
    range: weekRange(wk, today),
    days,
    groups,
    wins: todos.wins,
    winDays: wk.days.filter((day) => day <= today).map((day) => ({ value: day, label: DAY_SHORT[weekday(day)] })),
    strategies: (d.strategies || []).map((s) => ({ value: s.id, label: s.name })),
    objectives: debriefObjectives(d, { sprintId: sprint.id, week: number, day: figureDay(wk, today) }),
    figureDay: figureDay(wk, today),
    yourDays,
    nextWeek,
    last,
    score,
    scoreLabel: weekDone ? `Week ${number} performance score` : `Week ${number} performance score so far`,
    usualLine: usual ? `Your usual range is ${usual.low} to ${usual.high}%.` : `Your usual range appears after ${USUAL_RANGE_MIN_WEEKS} weeks.`,
    streak,
    streakLine: streakLine(streak),
    firstName: d.firstName || '',
    coach: d.coach?.firstName || null,
    shared: Boolean(d.debrief?.shared_with_coach),
  };
}

/**
 * The habit's total and score column (M1 .tot): what was logged against
 * the target, then the habit's M1 score. Mint at or above the standard,
 * grey below, never coral (Tim, 30 Oct; 26 Oct rule 1). "Not logged"
 * when nothing was logged.
 */
export function habitTotal(row, scored, standard) {
  const label = (row.weekLine || '').replace(/ this week/, '');
  if (!scored || scored.score == null || scored.notLogged) return { label, value: 'Not logged', good: null };
  return { label, value: `${m0Round(scored.score)}%`, good: m0AtStandard(scored.score, standard) };
}

/**
 * M8 for the debriefed week: other sprints' frozen eligible weeks that
 * ended before this sprint, then this sprint's finished weeks up to this
 * one, eligibility by M0.5 (as the sprint page).
 */
function usualRangeFor(d, calendar, number, sprint) {
  const unusual = new Map((d.allDebriefs || []).filter((x) => x.sprint_id === sprint.id).map((x) => [x.sprint_week, x.unusual]));
  const earlier = (d.weekScores || [])
    .filter((w) => w.sprint_id !== sprint.id && w.eligible && w.score != null && w.week_end < sprint.start_on)
    .sort((a, b) => (a.week_end < b.week_end ? -1 : 1))
    .map((w) => Number(w.score));
  const own = [];
  for (const wk of calendar.weeks.slice(0, number)) {
    if (!wk.finished) continue;
    const r = sprintWeekResult(d, calendar, wk.number, null);
    const raw = r.result.score;
    const loggedDays = new Set((d.logs || []).filter((l) => wk.days.includes(l.local_date) && !l.to_confirm).map((l) => l.local_date)).size;
    if (raw != null && m0WeekIsEligible({ finished: true, recoveryDaysInside: wk.recoveryDaysInside, unusual: Boolean(unusual.get(wk.number)), loggedDays, workingDays: r.workingDays.length })) own.push(raw);
  }
  return m8UsualRange([...earlier, ...own]);
}

/** The summary's heading (M1): a celebration at or above the standard, calm below. */
export function debriefHeading(view) {
  const name = view.firstName ? `, ${view.firstName}` : '';
  if (view.score?.good) return `Great week${name}! You smashed your standard.`;
  return `Here’s your week${name}.`;
}

/** "Week 3 debriefed at 82%." (+ " Shared with Tim.") after Finish my debrief (M1). */
export function finishToast(view, shared) {
  const head = view.score ? `Week ${view.week} debriefed at ${view.score.value}%.` : `Week ${view.week} debriefed.`;
  return shared && view.coach ? `${head} Shared with ${view.coach}.` : head;
}

/** The share switch's line (M1): what the coach will see, or that only you can. */
export function shareLine(coach, shared) {
  return shared
    ? `${coach} will see this week’s scores, your objective figures and your three answers.`
    : 'Only you can see this debrief.';
}

/** "7 Review my day entries this week" (a label: no full stop). */
export function yourDaysLine(n) {
  return `${n} Review my day ${n === 1 ? 'entry' : 'entries'} this week`;
}
