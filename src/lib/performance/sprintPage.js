// What the Performance Sprint page shows (mock-up M1, R.sprint), worked
// out from the rows in one place. Pure code: no database, no React, no
// device clock (today is passed in), tested in tests/performance.
//
// Every score comes from src/lib/scores: M0 for the calendar, working
// days, rounding and the standard, M1 for each habit, M2 for to-dos, M5
// for the week ("This week so far" while it runs), M6 for the sprint
// average, M7 for a week's colour, M8 for the usual range and M9 for the
// time left. What the methods don't define (which to-dos show this week
// and their tags, the line beside each habit, the wording before the
// first week) is a screen choice made here, never a score, and is listed
// in progress.md as UNDEFINED.

import { daysBetween, weekday } from '../scores/dates.js';
import {
  m0AtStandard,
  m0DebriefWindow,
  m0Round,
  m0SprintCalendar,
  m0WeekIsEligible,
  m0WeekOfDay,
  m1TopNumber,
  m2PlannedWeekAt,
  m6SprintFigures,
  m7WeekColour,
  m8UsualRange,
  m9TimeLeft,
  USUAL_RANGE_MIN_WEEKS,
} from '../scores/index.js';
import { shownUnit, toShown } from '../units.js';
import { backToday, openRecovery, recoveryEndOn, settingForWeek, sprintPause, sprintWeekResult, toMeasure, toRecoveries, toTodo } from './rows';
import { habitMeasureLine, plainNumber } from './words';

const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Mon 26 Oct", with the year when it isn't today's year (writing rule 28). */
export function dayName(key, today) {
  const [y, m, d] = key.split('-').map(Number);
  const base = `${DAY_SHORT[weekday(key)]} ${d} ${MONTHS[m - 1]}`;
  return today && key.slice(0, 4) !== today.slice(0, 4) ? `${base} ${y}` : base;
}

/** "Monday 26 October"-style words for screen readers: "Monday 26 Oct". */
export function dayNameFull(key) {
  const [, m, d] = key.split('-').map(Number);
  return `${DAY_FULL[weekday(key)]} ${d} ${MONTHS[m - 1]}`;
}

/** The short day for a day box: "Mo", "Tu" (M1 .wkd). */
export function dayBox(key) {
  return DAY_SHORT[weekday(key)].slice(0, 2);
}

/** "Mon 26 Oct to Sun 1 Nov". */
export function weekRange(week, today) {
  return `${dayName(week.start, today)} to ${dayName(week.end, today)}`;
}

const n = (v) => plainNumber(v);
const sum = (values) => values.reduce((s, v) => s + v, 0);

/**
 * One habit's row on Log today (M1 hrow): the setting in force this week,
 * its logs, and the words beside it. `line` is what was logged against
 * the target (UNDEFINED 4: a label, not a score); `bar` is the habit's M1
 * score so far, 0 to 1.
 */
export function logRow(sh, setting, { week, workingDays, today, logs, score, notLogged, strategyName, units }) {
  const m = toMeasure(setting);
  const values = {};
  for (const l of logs) {
    if (l.sprint_habit_id === sh.id && week.days.includes(l.local_date)) values[l.local_date] = Number(l.value);
  }
  const unit = shownUnit(m.unit, units);
  const show = (v) => (v == null ? null : toShown(v, m.unit, units));
  const upTo = Object.entries(values).filter(([d]) => d <= today).map(([, v]) => v);
  const total = sum(upTo);
  const yesDays = upTo.filter((v) => v > 0).length;
  const todayValue = values[today] ?? null;
  const daily = (m.measure === 'count' || m.measure === 'amount') ? m.targetPer === 'day' : m.limitPer === 'day';
  const u = unit ? ` ${unit}` : '';
  let line;
  let weekLine;
  switch (m.measure) {
    case 'amount':
      weekLine = `${n(show(total))} of ${n(show(m.target * (daily ? workingDays.length : 1)))}${u} this week`;
      line = daily ? `${n(show(todayValue || 0))} of ${n(show(m.target))}${u} today` : weekLine;
      break;
    case 'count':
      weekLine = `${n(total)} of ${n(m.target * (daily ? workingDays.length : 1))} this week`;
      line = daily ? `${n(todayValue || 0)} of ${n(m.target)} today` : weekLine;
      break;
    case 'count_limit':
      weekLine = daily ? `${n(total)} this week, no more than ${n(m.limit)} a day` : `${n(total)} this week, no more than ${n(m.limit)}`;
      line = daily ? `${n(todayValue || 0)} today, no more than ${n(m.limit)}` : weekLine;
      break;
    case 'yes_no_days_limit':
      weekLine = `${yesDays} this week, no more than ${n(m.limit)}`;
      line = weekLine;
      break;
    case 'yes_no_days_target': {
      const target = m.target != null ? m.target : workingDays.length;
      weekLine = `${yesDays} of ${n(target)} days this week`;
      line = weekLine;
      break;
    }
    case 'rating': {
      const aim = m.direction === 'lower' ? `aim for ${n(m.target)} or lower` : `aim for ${n(m.target)}`;
      line = `Rated 1 to 5 today, ${aim}`;
      weekLine = upTo.length
        ? `Average ${n(Math.round((total / upTo.length) * 10) / 10)} this week, ${aim}`
        : `No rating yet this week, ${aim}`;
      break;
    }
    case 'yes_no_weekly':
      line = yesDays ? 'Done this week' : 'Once this week';
      weekLine = yesDays ? 'Done this week' : 'Not yet this week';
      break;
    default:
      line = '';
      weekLine = '';
  }
  return {
    id: sh.id,
    name: sh.name,
    strategyId: sh.strategy_id,
    strategyName,
    measure: m.measure,
    unit,
    storedUnit: m.unit,
    decimals: m.measure === 'amount',
    target: m.target,
    limit: m.limit,
    direction: m.direction,
    impact: m.impact,
    settingId: setting.id,
    fromWeek: setting.from_week,
    // A count's sensible top number for one day (M1, experience rule 49).
    top: (m.measure === 'count' || m.measure === 'count_limit') ? m1TopNumber({ ...m, target: m.measure === 'count' ? m.target : m.limit, targetPer: m.measure === 'count' ? m.targetPer : m.limitPer }) : null,
    values,
    shown: Object.fromEntries(Object.entries(values).map(([d, v]) => [d, show(v)])),
    today: todayValue,
    todayShown: show(todayValue),
    line,
    weekLine,
    measureLine: habitMeasureLine({ ...m, unit, target: m.measure === 'amount' ? show(m.target) : m.target }),
    bar: score == null ? 0 : score / 100,
    notLogged: Boolean(notLogged),
  };
}

/**
 * The to-dos for this week and later in the sprint (M1 tdsIn, "Later in
 * this sprint"). UNDEFINED 2 (the methods score to-dos, M2, but don't
 * say which show): this week lists
 *   - open to-dos planned for this week or an earlier one (rolled over,
 *     tagged with the week they were planned for),
 *   - open to-dos moved out after this week started (tagged with where
 *     they went; their tick is off: M2 counts them as not done here),
 *   - to-dos done this week, whichever week they were planned for (M2:
 *     done early counts in the week it was done).
 * Later lists open to-dos planned for a later week of this sprint.
 */
export function sprintTodos(d, calendar, number, today) {
  const week = calendar.weeks[number - 1];
  const strategyName = new Map((d.strategies || []).map((s) => [s.id, s.name]));
  const thisWeek = [];
  const later = [];
  const rows = (d.todos || []).filter((t) => !t.deleted_at);
  for (const row of rows) {
    const t = toTodo(row, d.todoMoves || [], d.sprint.id);
    const base = { id: t.id, text: t.text, strategyName: strategyName.get(t.strategyId) || '', kind: 'todo', plannedWeek: t.currentWeek, impact: t.impact };
    if (t.doneOn) {
      if (m0WeekOfDay(calendar.weeks, t.doneOn) === number) thisWeek.push({ ...base, done: true });
      continue;
    }
    const planned = t.currentWeek;
    const atStart = t.createdOn && t.createdOn > week.start ? planned : m2PlannedWeekAt(t, week.start);
    if (planned != null && planned <= number) {
      thisWeek.push({ ...base, done: false, rolledFrom: planned < number ? planned : null });
    } else if (atStart != null && atStart <= number) {
      thisWeek.push({ ...base, done: false, movedTo: planned, movedOut: true });
    }
    if (planned != null && planned > number) {
      const w = calendar.weeks[planned - 1];
      later.push({ ...base, done: false, when: w ? `Week ${planned}, ${weekRange(w, today)}` : `Week ${planned}` });
    }
  }
  const order = (a, b) => (a.plannedWeek ?? 99) - (b.plannedWeek ?? 99);
  thisWeek.sort(order);
  later.sort(order);
  const counted = thisWeek.filter((t) => !t.movedOut);
  const wins = (d.wins || [])
    .filter((w) => !w.deleted_at && week.days.includes(w.local_date))
    .sort((a, b) => (a.local_date < b.local_date ? -1 : 1))
    .map((w) => {
      const names = (d.winLinks || []).filter((l) => l.win_id === w.id).map((l) => strategyName.get(l.strategy_id)).filter(Boolean);
      return { id: w.id, text: w.what, strategyName: names.join(', '), kind: 'win', day: DAY_SHORT[weekday(w.local_date)], done: true };
    });
  return { thisWeek, wins, later, done: counted.filter((t) => t.done).length, total: counted.length };
}

/** "Done. 3 of 4 this week." after a tick (M1). */
export function doneToast(todos) {
  return `Done. ${todos.done} of ${todos.total} this week.`;
}

/**
 * The weeks a to-do can be added to (M1 ddSpec 'wk'): this week (`number`)
 * to the last, or from a later week (`from`). Only `number` is "This week".
 */
export function weekOptions(calendar, number, lengthWeeks, today, from = number) {
  const out = [];
  for (let w = from; w <= lengthWeeks; w += 1) {
    const wk = calendar.weeks[w - 1];
    if (!wk) continue;
    out.push({ value: w, label: `${w === number ? 'This week' : `Week ${w}`}, ${weekRange(wk, today)}` });
  }
  return out;
}

/**
 * Where a to-do can move to (M1 'move'): a later week of this sprint.
 * One due this week (or rolled over) can go to any later week, and the
 * panel says it won't count as done this week (M2). One already planned
 * for a later week can come into this week or any other week, free.
 */
export function moveOptions(calendar, number, lengthWeeks, todo, today) {
  const dueNow = todo.plannedWeek != null && todo.plannedWeek <= number;
  const from = dueNow ? number + 1 : number;
  return weekOptions(calendar, number, lengthWeeks, today, from)
    .filter((o) => o.value !== todo.plannedWeek);
}

/**
 * The page's whole view.
 * @param {object} d rows from loadSprintPage
 * @param {{ today: string }} opts the person's local today
 */
export function sprintPageView(d, { today }) {
  if (!d) return null;
  const sprint = d.sprint || null;
  if (!sprint) {
    return { state: 'none', today, hasPlan: Boolean(d.plan), recovery: openRecovery(d.recoveries || []), welcomeBack: Boolean(backToday(d.recoveries || [], today)) };
  }
  const name = `Performance Sprint ${sprint.number}`;
  const standard = sprint.standard;
  const base = { today, name, label: sprint.label || null, sprintId: sprint.id, number: sprint.number, lengthWeeks: sprint.length_weeks, standard };
  const recovery = openRecovery(d.recoveries || []);
  const calendar = m0SprintCalendar(
    { start: sprint.start_on, lengthWeeks: sprint.length_weeks, recoveries: toRecoveries(d.recoveries || []) },
    today,
  );
  const lastDay = calendar.actualEnd || calendar.plannedEnd;
  const dates = { start: sprint.start_on, end: lastDay, text: `${dayName(sprint.start_on, today)} to ${dayName(lastDay, today)}` };
  if (today < sprint.start_on) {
    return { ...base, state: 'future', dates, startsOn: dayName(sprint.start_on, today) };
  }
  // Recovery (M15): the sprint is paused. Its finished weeks keep their
  // scores, which the page hides unless "Show my results" is tapped.
  if (recovery) return pausedView(d, { base, calendar, recovery, today });

  const current = m0WeekOfDay(calendar.weeks, today);
  const debriefs = new Map((d.debriefs || []).map((x) => [x.sprint_week, x]));
  const strategyName = new Map((d.strategies || []).map((s) => [s.id, s.name]));

  // Every week's score: finished weeks final (M5), this week so far.
  const weeks = calendar.weeks.map((wk) => {
    const isNow = wk.number === current;
    const finished = wk.finished;
    let score = null;
    let raw = null;
    let eligible = false;
    if (finished || isNow) {
      const r = sprintWeekResult(d, calendar, wk.number, isNow ? today : null);
      raw = r.result.score;
      score = raw == null ? null : m0Round(raw);
      if (finished) {
        const loggedDays = new Set((d.logs || []).filter((l) => wk.days.includes(l.local_date) && !l.to_confirm).map((l) => l.local_date)).size;
        eligible = raw != null && m0WeekIsEligible({
          finished: true,
          recoveryDaysInside: wk.recoveryDaysInside,
          unusual: Boolean(debriefs.get(wk.number)?.unusual),
          loggedDays,
          workingDays: r.workingDays.length,
        });
      }
    }
    const state = isNow ? 'now' : finished ? (m7WeekColour(raw, standard) === 'none' ? 'none' : m7WeekColour(raw, standard)) : 'next';
    const when = `Week ${wk.number}, ${weekRange(wk, today)}`;
    let tip;
    if (state === 'now') tip = { value: score == null ? 'Nothing scored yet' : `Performance score ${score}%`, when: `Week ${wk.number}, this week so far` };
    else if (state === 'next') tip = { value: 'To come', when };
    else if (state === 'none') tip = { value: 'Nothing planned this week', when };
    else tip = { value: `Performance score ${score}%`, when, extra: [state === 'good' ? 'At or above your standard' : 'Below your standard'] };
    return { number: wk.number, start: wk.start, end: wk.end, days: wk.days, finished, raw, score, state, eligible, tip };
  });

  // The weeks still to freeze for the coach (R3): finished, no final week_scores row.
  const frozen = new Map((d.weekScores || []).filter((w) => w.sprint_id === sprint.id).map((w) => [w.sprint_week, w]));
  const toFreeze = weeks.filter((w) => w.finished && !frozen.get(w.number)?.final).map((w) => w.number);

  // M8 across sprints: other sprints' frozen eligible weeks, then this one's.
  const earlier = (d.weekScores || [])
    .filter((w) => w.sprint_id !== sprint.id && w.eligible && w.score != null)
    .sort((a, b) => (a.week_end < b.week_end ? -1 : 1))
    .map((w) => Number(w.score));
  const usual = m8UsualRange([...earlier, ...weeks.filter((w) => w.eligible).map((w) => w.raw)]);
  const usualLine = usual
    ? { lead: 'Your usual range is ', figure: `${usual.low} to ${usual.high}%`, end: '.' }
    : { lead: `Your usual range appears after ${USUAL_RANGE_MIN_WEEKS} weeks.`, figure: '', end: '' };

  const figures = m6SprintFigures(weeks.map((w) => ({ number: w.number, score: w.raw, finished: w.finished })), standard);
  const finishedNumbers = weeks.filter((w) => w.finished && w.raw != null).map((w) => w.number);
  const average = figures.average == null
    ? { value: null, note: 'Your average appears after your first week.' }
    : {
      value: `${m0Round(figures.average)}%`,
      note: finishedNumbers.length === 1 ? `Week ${finishedNumbers[0]}.` : `Weeks ${finishedNumbers[0]} to ${finishedNumbers[finishedNumbers.length - 1]}.`,
    };
  const left = daysBetween(today, lastDay);
  const time = m9TimeLeft(today, lastDay);
  const endsIn = left <= 0 ? { label: 'Sprint ends', value: 'Today' } : { label: 'Sprint ends in', value: `${time.count} ${time.unit}${time.count === 1 ? '' : 's'}` };

  // The weekly debrief whose window is open today (M0.4: from the week's
  // last 3 days until 3 days after it ends), for "Start my debrief"; gone
  // once it is done (decisions, "Debrief reminder").
  const openWeek = calendar.weeks.find((wk) => m0DebriefWindow(wk, today)?.open);
  const debrief = openWeek && debriefs.get(openWeek.number)?.status !== 'finished' ? { week: openWeek.number } : null;

  const common = { ...base, dates, weeks, toFreeze, usualLine, average, endsIn, debrief };
  if (!current) {
    return { ...common, state: 'over', endedOn: dayName(lastDay, today) };
  }

  const week = calendar.weeks[current - 1];
  const nowWeek = weeks[current - 1];
  const r = sprintWeekResult(d, calendar, current, today);
  const habitScores = new Map(r.result.habits.map((h) => [h.id, h]));
  const units = d.personSettings?.units || 'metric';
  const habits = [];
  for (const sh of d.sprintHabits || []) {
    const setting = settingForWeek(d.sprintSettings || [], sh.id, current);
    if (!setting) continue;
    const hs = habitScores.get(sh.id);
    habits.push(logRow(sh, setting, {
      week, workingDays: r.workingDays, today, logs: d.logs || [], score: hs?.score ?? null, notLogged: hs?.notLogged,
      strategyName: strategyName.get(sh.strategy_id) || '', units,
    }));
  }
  // The week view shows the working days, plus any day off already logged (M0.3).
  const loggedDays = new Set((d.logs || []).filter((l) => week.days.includes(l.local_date)).map((l) => l.local_date));
  const working = new Set(r.workingDays);
  const shownDays = week.days
    .filter((day) => working.has(day) || loggedDays.has(day))
    .map((day) => ({ key: day, box: dayBox(day), full: dayNameFull(day), today: day === today, later: day > today, off: !working.has(day) }));

  const soFar = nowWeek.score;
  return {
    ...common,
    state: 'running',
    // The first day back from a Recovery (M15 "Welcome back. Let's start
    // with this week."): the top of the page changes for that day only.
    welcomeBack: Boolean(backToday(d.recoveries || [], today)),
    current,
    week: { number: current, start: week.start, end: week.end, days: week.days, range: weekRange(week, today) },
    dayInWeek: week.days.indexOf(today),
    todayText: dayName(today, today),
    todayIsWorking: working.has(today),
    soFar: soFar == null ? null : { value: soFar, good: m0AtStandard(nowWeek.raw, standard) },
    habits,
    shownDays,
    todos: sprintTodos(d, calendar, current, today),
    weekOptions: weekOptions(calendar, current, sprint.length_weeks, today),
    winDays: week.days.filter((day) => day <= today).map((day) => ({ value: day, label: DAY_SHORT[weekday(day)] })),
    calendar,
  };
}

/** A finished week's score, colour and pop-up, as the running page shows it. */
function finishedWeek(d, calendar, wk, standard, today) {
  const r = sprintWeekResult(d, calendar, wk.number, null);
  const raw = r.result.score;
  const score = raw == null ? null : m0Round(raw);
  const colour = m7WeekColour(raw, standard);
  const state = colour === 'none' ? 'none' : colour;
  const when = `Week ${wk.number}, ${weekRange(wk, today)}`;
  const tip = state === 'none'
    ? { value: 'Nothing planned this week', when }
    : { value: `Performance score ${score}%`, when, extra: [state === 'good' ? 'At or above your standard' : 'Below your standard'] };
  return { number: wk.number, start: wk.start, end: wk.end, days: wk.days, finished: true, raw, score, state, tip };
}

/**
 * The page while a Recovery is open (M15 "Sprint, paused"): the week it
 * is paused at, when it picks up, its end now and before this Recovery
 * (rows.js sprintPause), and every week for the dial. `weeks` carries the
 * finished weeks' scores for "Show my results"; `hiddenWeeks` is the same
 * dial with the scores hidden (no mint, no grey: M15 rdial(true)).
 */
function pausedView(d, { base, calendar, recovery, today }) {
  const sprint = d.sprint;
  const pause = sprintPause(sprint, d.recoveries || [], today);
  const dates = { start: sprint.start_on, end: pause.endOn, text: `${dayName(sprint.start_on, today)} to ${dayName(pause.endOn, today)}` };
  const weeks = Array.from({ length: sprint.length_weeks }, (_, i) => {
    const wk = calendar.weeks[i];
    const number = i + 1;
    if (wk?.finished) return finishedWeek(d, calendar, wk, sprint.standard, today);
    if (number === pause.week && !pause.complete) {
      return { number, finished: false, raw: null, score: null, state: 'paused', tip: { value: 'Paused for your recovery', when: `Week ${number}`, extra: [`It picks up on ${dayName(pause.picksUpOn, today)}.`] } };
    }
    return { number, finished: false, raw: null, score: null, state: 'next', tip: { value: 'To come', when: `Week ${number}` } };
  });
  const hiddenWeeks = weeks.map((w) => (w.finished
    ? { ...w, state: 'done', tip: { value: 'Finished', when: w.tip.when, extra: ['Your scores are hidden while you’re in recovery.'] } }
    : w));
  const figures = m6SprintFigures(weeks.map((w) => ({ number: w.number, score: w.raw, finished: w.finished })), sprint.standard);
  const frozen = new Map((d.weekScores || []).filter((w) => w.sprint_id === sprint.id).map((w) => [w.sprint_week, w]));
  return {
    ...base,
    state: 'paused',
    dates,
    recovery,
    pause: {
      week: pause.week,
      complete: pause.complete,
      endedOn: pause.endedOn ? dayName(pause.endedOn, today) : null,
      picksUpOn: dayName(pause.picksUpOn, today),
      endOn: dayName(pause.endOn, today),
      endBefore: dayName(pause.endBefore, today),
      moved: pause.endOn !== pause.endBefore,
      // The chosen end has come with no answer yet (UNDEFINED, audit 4.7):
      // the sprint stays paused and the end check-in shows.
      due: recoveryEndOn(recovery) <= today,
    },
    weeks,
    hiddenWeeks,
    average: figures.average == null ? null : `${m0Round(figures.average)}%`,
    toFreeze: weeks.filter((w) => w.finished && !frozen.get(w.number)?.final).map((w) => w.number),
  };
}

