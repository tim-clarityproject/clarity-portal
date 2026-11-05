// The Individual Performance Dashboard (mock-up M4 v47, approved by Tim on
// 26 Oct; Phase 5 step 2), worked out in one place. Pure code: no database,
// no React, no device clock (today is passed in), tested in
// tests/performance/dashboard.test.mjs.
//
// The dashboard is the mirror: what's improving and what's holding someone
// back, with one tap to act on each, then the work behind it. Every figure
// comes from src/lib/scores (docs/scoring-methods.md): M0 for the calendar
// and rounding, M5 for each week (through the sprint page's own
// sprintWeekResult), M6 for the sprint, M7 for a week's colour, M8 for the
// usual range, M9 for each Outcome Objective, M10 for the two lists, M11 for
// streaks and logging, M12 for sleep, stress, the way of being and
// emotional control, M13 for the check-in (checkin.js) and M20.2 for the
// life balance review (wheelOfLife.js). What the methods don't define is
// left as an empty frame and listed in the step's report, never invented:
// "Best week this year" and "the same week last sprint" (M6), an
// objective's change over 3 months, a year or all time (M9.1), Breathe as
// an average a week (M11), and the patterns (M14: Phase 5 step 3 fills
// their slot).
//
// Choices made here because Tim wasn't there (listed in the report):
// - What's behind your performance is always about the current sprint, as
//   What's improving is (M10), and the time switch sits inside Objectives
//   and Strategies and changes only that section (the phase prompt:
//   filters sit with what they change).
// - The spans: Current sprint is the running sprint's weeks; 3 months the
//   last 13 sprint weeks; Year the sprint weeks ending this calendar year;
//   All time every sprint week.
// - Sleep uses Recovery's chart and target range (part 4, 3 Nov): a night
//   inside or above the range is green, and the usual quality is the most
//   common word with ties going to the better one (sleepChart.js).

import { addDays, daysBetween } from '../scores/dates.js';
import {
  SLEEP_QUALITY,
  WEEKLY_STRESS,
  m0AtStandard,
  m0DebriefWindow,
  m0Round,
  m0RoundHours,
  m0SprintCalendar,
  m0WeekIsEligible,
  m0WeekOfDay,
  m6SprintFigures,
  m6StrategySprintAverage,
  m7WeekColour,
  m8UsualRange,
  m9EffortOnTrack,
  m9FigureOn,
  m9Objective,
  m9PaceSentence,
  m9TimeLeft,
  m10ImprovingAndHoldingBack,
  m11BreathingSessions,
  m11DebriefStreak,
  m11HabitKeptUp,
  m11LoggedWorkingDays,
  m12EmotionalControl,
  m12SleepHours,
  m12StressGreen,
  m12WayOfBeing,
  USUAL_RANGE_MIN_WEEKS,
} from '../scores/index.js';
import { getLocalDateKey, parseDbTimestamp } from '../dateFormatter.js';
import { computeStats, formatCheckinDate, presetRange, inRange } from '../wheelOfLife.js';
import { checkinPoints } from './checkin';
import { STRESS_OPTIONS, debriefStreakWeeks } from './debrief';
import { heldWeeks } from './year';
import { openRecovery, sprintWeekResult, toObjective, toRecoveries } from './rows';
import { dayName } from './sprintPage';
import { hoursFigure, nightDate, nightState, qualityWords, sleepAction, usualQuality } from './sleepChart';
import { objectiveFigure, objectiveTarget, plainNumber, shortDate } from './words';

export const DASHBOARD_CACHE = 'performance-dashboard';
export const DASHBOARD_ROUTE = '/dashboard';
export const DASHBOARD_TITLE = 'Individual Performance Dashboard';

// ---------------------------------------------------------------- the person's choices

/** The page settings key (person_settings.page_preferences.dashboard). */
export const DASHBOARD_KEY = 'dashboard';

/** The two sections that move (M4 SECT), in their starting order. */
export const MOVABLE = Object.freeze(['chain', 'more']);
export const SECTION_NAMES = Object.freeze({
  hero: 'Performance score chart',
  sum: 'Current sprint',
  chain: 'Objectives and Strategies',
  more: 'What’s behind your performance',
});
/** What opens and closes from its heading, and is remembered (M4 st.col). */
export const FOLDS = Object.freeze(['sum', 'chain', 'obj', 'strat', 'more']);

/**
 * The person's dashboard settings, cleaned: the order of the two movable
 * sections, which parts are switched off, and which sections they left
 * closed. Anything unknown is dropped, so an old or odd value never breaks
 * the page.
 */
export function readDashboardPrefs(prefs) {
  const raw = prefs && typeof prefs === 'object' ? prefs[DASHBOARD_KEY] : null;
  const order = Array.isArray(raw?.order) ? raw.order.filter((k) => MOVABLE.includes(k)) : [];
  const full = [...new Set([...order, ...MOVABLE])];
  const hidden = {};
  for (const k of Object.keys(SECTION_NAMES)) hidden[k] = Boolean(raw?.hidden?.[k]);
  const closed = {};
  for (const k of FOLDS) closed[k] = Boolean(raw?.closed?.[k]);
  return { order: full, hidden, closed };
}

/** The settings after moving one section up (-1) or down (+1). */
export function moveSection(settings, key, by) {
  const order = [...settings.order];
  const i = order.indexOf(key);
  const j = i + by;
  if (i < 0 || j < 0 || j >= order.length) return settings;
  [order[i], order[j]] = [order[j], order[i]];
  return { ...settings, order };
}

/** The settings after opening or closing one section (closing Objectives and Strategies opens its two groups again next time, as M4). */
export function toggleFold(settings, key) {
  const closed = { ...settings.closed, [key]: !settings.closed[key] };
  if (key === 'chain' && !closed.chain) {
    closed.obj = false;
    closed.strat = false;
  }
  return { ...settings, closed };
}

/** The settings after switching one part on or off. */
export function toggleHidden(settings, key) {
  return { ...settings, hidden: { ...settings.hidden, [key]: !settings.hidden[key] } };
}

/** What is stored: only what differs from the start, so the object stays small. */
export function storedPrefs(settings) {
  const hidden = Object.fromEntries(Object.entries(settings.hidden).filter(([, v]) => v));
  const closed = Object.fromEntries(Object.entries(settings.closed).filter(([, v]) => v));
  return { order: settings.order, hidden, closed };
}

// ---------------------------------------------------------------- the time switch

export const SPANS = Object.freeze([
  { value: 'sprint', label: 'Current sprint' },
  { value: '3m', label: '3 months' },
  { value: 'year', label: 'Year' },
  { value: 'all', label: 'All time' },
]);
const SPAN_WORDS = { sprint: 'the current sprint', '3m': 'the last 3 months', year: 'this year', all: 'all time' };
const THREE_MONTHS_WEEKS = 13;

/** "This section shows the current sprint." */
export function spanLine(span) {
  return `This section shows ${SPAN_WORDS[span] || SPAN_WORDS.sprint}.`;
}

// ---------------------------------------------------------------- small words

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** "+5", "−3", "±0" (M6 glance figures, M0.1 changes). */
export function glance(d) {
  if (d == null) return null;
  if (d > 0) return `+${plainNumber(d)}`;
  if (d < 0) return `−${plainNumber(-d)}`;
  return '±0';
}

// ---------------------------------------------------------------- weeks across sprints

/**
 * Every sprint week, oldest first, each with its score: the running
 * sprint's weeks worked out from its rows (M5, "So far" for this week),
 * every other sprint's from its frozen week_scores (with each Strategy's
 * score, as freeze_week saved it).
 */
export function allSprintWeeks(d, today) {
  const out = [];
  const sprints = [...(d.sprints || [])].sort((a, b) => a.number - b.number);
  const running = d.sprint || null;
  if (running && !sprints.some((s) => s.id === running.id)) sprints.push(running);
  const frozen = new Map((d.weekScores || []).map((w) => [`${w.sprint_id}:${w.sprint_week}`, w]));
  const debriefs = new Map((d.debriefs || []).map((x) => [x.sprint_week, x]));
  for (const s of sprints) {
    if (today < s.start_on) continue;
    if (running && s.id === running.id) {
      const calendar = m0SprintCalendar({ start: s.start_on, lengthWeeks: s.length_weeks, recoveries: toRecoveries(d.recoveries || []) }, today);
      const current = openRecovery(d.recoveries || []) ? null : m0WeekOfDay(calendar.weeks, today);
      // A week the sprint hasn't reached yet (sprint time stops in
      // Recovery, so the calendar holds only the weeks begun) is to come.
      for (let n = 1; n <= s.length_weeks; n += 1) {
        const wk = calendar.weeks[n - 1];
        const base = { key: `${s.id}:${n}`, sprintId: s.id, sprintNumber: s.number, standard: s.standard, number: n, running: true };
        if (!wk) { out.push({ ...base, start: null, end: null, finished: false, now: false, future: true, raw: null, strategies: new Map(), habits: new Map() }); continue; }
        const now = wk.number === current;
        if (!wk.finished && !now) { out.push({ ...base, start: wk.start, end: wk.end, days: wk.days, finished: false, now: false, future: true, raw: null, strategies: new Map(), habits: new Map() }); continue; }
        const r = sprintWeekResult(d, calendar, wk.number, now ? today : null);
        const loggedDays = new Set((d.logs || []).filter((l) => wk.days.includes(l.local_date) && !l.to_confirm).map((l) => l.local_date)).size;
        const eligible = wk.finished && r.result.score != null && m0WeekIsEligible({
          finished: true,
          recoveryDaysInside: wk.recoveryDaysInside,
          unusual: Boolean(debriefs.get(wk.number)?.unusual),
          loggedDays,
          workingDays: r.workingDays.length,
        });
        out.push({
          ...base,
          start: wk.start,
          end: wk.end,
          days: wk.days,
          workingDays: r.workingDays,
          finished: wk.finished,
          now,
          future: false,
          raw: r.result.score,
          eligible,
          strategies: new Map(r.result.strategies.map((x) => [x.id, x.score])),
          habits: new Map(r.result.habits.map((x) => [x.id, x.score])),
        });
      }
      continue;
    }
    const { weeks } = heldWeeks(s, d.recoveries || [], today);
    for (const wk of weeks) {
      const row = frozen.get(`${s.id}:${wk.number}`);
      const raw = row && row.score != null ? Number(row.score) : null;
      const strategies = new Map((Array.isArray(row?.strategy_scores) ? row.strategy_scores : [])
        .filter((x) => x && x.id)
        .map((x) => [x.id, x.score == null ? null : Number(x.score)]));
      out.push({
        key: `${s.id}:${wk.number}`,
        sprintId: s.id,
        sprintNumber: s.number,
        standard: s.standard,
        number: wk.number,
        start: wk.start,
        end: wk.end,
        days: wk.days,
        finished: wk.finished,
        now: false,
        future: !wk.finished,
        raw: wk.finished ? raw : null,
        eligible: Boolean(row?.eligible) && raw != null,
        strategies,
        habits: new Map(),
      });
    }
  }
  return out;
}

const whenWords = (w) => `Sprint ${w.sprintNumber}, week ${w.number}`;
const weekState = (w) => {
  if (w.future) return 'next';
  if (w.now) return 'now';
  const c = m7WeekColour(w.raw, w.standard);
  return c === 'none' ? 'none' : c;
};

/** A week square's or bar's pop-up (ChartTips: the value first, then when). */
function weekTip(w, value, extra = []) {
  const when = `${whenWords(w)}${w.now ? ', so far' : ''}`;
  if (w.future) return { value: 'To come', when };
  if (value == null) return { value: w.now ? 'Nothing scored yet' : 'Nothing planned this week', when };
  return { value: `Performance score ${m0Round(value)}%`, when, extra };
}

// ---------------------------------------------------------------- the top: score this sprint

const HERO_WEEKS = 16;

function previousSprintAverage(weeks, sprint) {
  const before = weeks.filter((w) => w.sprintNumber < sprint.number);
  if (!before.length) return null;
  const last = Math.max(...before.map((w) => w.sprintNumber));
  const prev = before.filter((w) => w.sprintNumber === last);
  return m6SprintFigures(prev.map((w) => ({ number: w.number, score: w.raw, finished: w.finished })), prev[0].standard).average;
}

function heroView(d, weeks, sprint, today) {
  const label = 'Performance score this sprint';
  if (!sprint) {
    return { label, value: 'Not yet', good: false, change: null, lines: ['Your score starts with your first Performance Sprint.'], usualLine: null, chart: null };
  }
  if (today < sprint.start_on) {
    return { label, value: 'Not yet', good: false, change: null, lines: [`Your sprint starts on ${dayName(sprint.start_on, today)}.`], usualLine: null, chart: null };
  }
  const standard = sprint.standard;
  const mine = weeks.filter((w) => w.sprintId === sprint.id);
  const figures = m6SprintFigures(mine.map((w) => ({ number: w.number, score: w.raw, finished: w.finished })), standard, previousSprintAverage(weeks, sprint));
  const avg = figures.average;
  const shown = avg == null ? null : m0Round(avg);
  let line;
  if (avg == null) line = 'Your first week isn’t finished yet.';
  else if (shown > standard) line = `You’re above your standard of ${standard}%.`;
  else if (shown === standard) line = `You’re right on your standard of ${standard}%.`;
  else line = `You’re below your standard of ${standard}%.`;
  const d0 = figures.change;
  const change = d0 == null ? null : {
    text: glance(d0),
    up: d0 > 0,
    words: `${d0 > 0 ? `Up ${d0}` : d0 < 0 ? `Down ${-d0}` : 'No change'}${Math.abs(d0) === 1 ? ' point' : d0 ? ' points' : ''}`,
  };
  // M8 across sprints: the last 16 eligible finished weeks.
  const usual = m8UsualRange(weeks.filter((w) => w.finished && w.eligible && w.raw != null).map((w) => w.raw));
  // The chart: the last 16 weeks to the end of this sprint (M4 hero).
  const lastIdx = weeks.map((w) => w.sprintId).lastIndexOf(sprint.id);
  const nowIdx = weeks.findIndex((w) => w.sprintId === sprint.id && (w.now || w.future));
  const upTo = nowIdx >= 0 ? nowIdx : lastIdx;
  const from = Math.max(0, upTo - (HERO_WEEKS - 1));
  const shownWeeks = weeks.slice(from, lastIdx + 1);
  const best = figures.best ? `${sprint.id}:${figures.best.number}` : null;
  const firstOfSprint = new Set();
  const bars = shownWeeks.map((w, i) => {
    const state = weekState(w);
    const isBest = best === w.key && figures.finishedWeeks > 1;
    const extra = [];
    if (state === 'good') extra.push('At or above your standard');
    if (state === 'below') extra.push('Below your standard');
    if (isBest) extra.push('Best week this sprint');
    const sprintStart = i === 0 ? w.number === 1 : shownWeeks[i - 1].sprintId !== w.sprintId;
    if (sprintStart) firstOfSprint.add(w.key);
    return {
      key: w.key,
      value: w.raw == null ? null : m0Round(w.raw),
      state,
      best: isBest,
      sprintLabel: sprintStart && w.number === 1 ? `Sprint ${w.sprintNumber}` : null,
      tip: weekTip(w, w.raw, extra),
    };
  });
  const enough = bars.some((b) => b.value != null);
  return {
    label,
    value: shown == null ? 'Not yet' : `${shown}%`,
    good: avg != null && m0AtStandard(avg, standard),
    change,
    lines: [line],
    // Shown only before there is a range: once there is one, the band on
    // the chart and its pop-up say it (M4 hero; no repeated text).
    usualLine: usual ? null : `Your usual range appears after ${USUAL_RANGE_MIN_WEEKS} weeks.`,
    chart: {
      standard,
      band: usual ? { low: usual.low, high: usual.high, tip: { value: `${usual.low} to ${usual.high}%`, when: 'Your usual range', extra: [`Your usual range is ${usual.low} to ${usual.high}%.`] } } : null,
      bars,
      enough,
      empty: 'Your chart starts after your first week.',
      table: bars.filter((b) => b.state !== 'next').map((b) => ({ key: b.key, cells: { week: b.tip.when, score: b.value == null ? b.tip.value : `${b.value}%` } })),
    },
  };
}

// ---------------------------------------------------------------- logging this week, and the debrief

function loggingLine(d, week, today) {
  if (!week?.now || !week.workingDays) return null;
  const soFar = week.workingDays.filter((x) => x <= today);
  if (!soFar.length) return null;
  const logged = (d.logs || []).filter((l) => week.days.includes(l.local_date)).map((l) => l.local_date);
  const r = m11LoggedWorkingDays(soFar, logged);
  if (r.logged === r.of) return 'You’ve logged every working day so far this week.';
  return `You logged on ${r.logged} of your ${plural(r.of, 'working day')} so far this week.`;
}

// ---------------------------------------------------------------- objectives

function deltaWords(objective, delta) {
  const n = Math.abs(delta);
  if (objective.kind === 'rating') return plural(n, 'point');
  return objectiveFigure(objective, n);
}

function objectiveRows(d, today, sprint, weeks) {
  const rows = (d.planObjectives || []).filter((o) => !o.archived_at);
  const numberOf = new Map(rows.map((o, i) => [o.id, i + 1]));
  const links = d.links || [];
  const finishedHere = weeks.filter((w) => sprint && w.sprintId === sprint.id && w.finished);
  const strategyAverage = (sid) => m6StrategySprintAverage(finishedHere.map((w) => ({ score: w.strategies.get(sid) ?? null, finished: true })));
  return rows.map((row) => {
    const objective = toObjective(row, d.figures || []);
    const result = m9Objective(objective, { asOf: today, sprintStart: sprint?.start_on ?? null });
    const serving = links.filter((l) => l.objective_id === row.id).map((l) => l.strategy_id);
    const effortOnTrack = finishedHere.length && sprint ? m9EffortOnTrack(serving.map(strategyAverage), sprint.standard) : null;
    const number = numberOf.get(row.id);
    const base = { id: row.id, number, name: objective.name, kind: objective.kind, objective, result, effortOnTrack };
    const effortLine = effortOnTrack == null || !serving.length ? null
      : effortOnTrack ? 'The work behind it is on track.' : 'The work behind it is below your standard.';
    if (objective.kind === 'milestone') {
      const reached = result.reached;
      const set = objective.startOn || row.created_at?.slice(0, 10) || today;
      const due = objective.dueOn;
      const span = due ? Math.max(1, daysBetween(set, due)) : 1;
      const gone = due ? Math.max(0, Math.min(1, daysBetween(set, today) / span)) : 0;
      const left = due && !reached ? m9TimeLeft(today, due) : null;
      return {
        ...base,
        line: reached ? 'You’ve reached this milestone.' : 'You haven’t reached this milestone yet.',
        effortLine,
        bar: { kind: 'timeline', gone, reached, dueText: due ? shortDate(due) : null },
        value: reached ? 'Done' : left ? (left.count === 0 ? 'Today' : plural(left.count, left.unit)) : '',
        of: reached || !left ? '' : left.days < 0 ? 'overdue' : left.count === 0 ? '' : 'left',
        label: due ? `Due ${shortDate(due)}` : '',
        improving: false,
        notMoving: false,
      };
    }
    const reached = result.reached;
    const before = sprint ? m9FigureOn(objective, addDays(sprint.start_on, -1)) : null;
    const delta = before == null || result.current == null ? 0 : result.current - before;
    const better = objective.direction === 'down' ? delta < 0 : delta > 0;
    const pace = m9PaceSentence(objective, result, shortDate)?.replace(/'/g, '’') ?? null;
    let label = '';
    if (reached) label = 'Target reached';
    else if (sprint && result.improving && better) label = `${objective.direction === 'down' ? 'Down' : 'Up'} ${deltaWords(objective, delta)} this sprint`;
    else if (sprint) label = 'Steady this sprint';
    return {
      ...base,
      line: reached ? 'Well done, you’ve reached your target!' : pace,
      effortLine: reached ? null : effortLine,
      bar: { kind: 'progress', value: (result.progress ?? 0) / 100, good: reached || Boolean(result.onPace && result.paceShown) },
      value: objectiveFigure(objective, result.current),
      of: objective.kind === 'rating' ? `Target ${plainNumber(objective.target)}/10` : objectiveTarget(objective),
      label,
      reached,
      improving: Boolean(result.improving && better),
      change: better ? delta : 0,
      notMoving: Boolean(result.notMoving),
      stillWords: objective.kind === 'rating'
        ? `Your rating is still ${objectiveFigure(objective, result.current)} this sprint, while the work behind it is on track.`
        : `The number is still ${objectiveFigure(objective, result.current)} this sprint, while the work behind it is on track.`,
    };
  });
}

// ---------------------------------------------------------------- the span's weeks

function spanWeeks(weeks, sprint, span, today) {
  if (span === 'sprint' || !span) return sprint ? weeks.filter((w) => w.sprintId === sprint.id) : [];
  const begun = weeks.filter((w) => !w.future);
  if (span === '3m') return begun.slice(-THREE_MONTHS_WEEKS);
  if (span === 'year') return begun.filter((w) => w.end && w.end >= `${today.slice(0, 4)}-01-01`);
  return begun;
}

function strip(weeks, scoreOf) {
  return weeks.map((w) => {
    const v = scoreOf(w);
    let state = weekState(w);
    if (!w.future && !w.now) {
      const c = m7WeekColour(v, w.standard);
      state = c === 'none' ? 'none' : c;
    }
    if (w.now && v == null) state = 'now';
    return { key: w.key, state, tip: weekTip(w, v) };
  });
}

function strategyRows(d, weeks, sprint, span, today) {
  const objectives = (d.planObjectives || []).filter((o) => !o.archived_at);
  const numberOf = new Map(objectives.map((o, i) => [o.id, { number: i + 1, name: o.name }]));
  const inSpan = spanWeeks(weeks, sprint, span, today);
  return (d.strategies || []).map((s) => {
    const serves = (d.links || []).filter((l) => l.strategy_id === s.id && numberOf.has(l.objective_id))
      .map((l) => numberOf.get(l.objective_id)).sort((a, b) => a.number - b.number);
    const begun = inSpan.filter((w) => !w.future);
    let latest = null;
    for (let i = begun.length - 1; i >= 0; i -= 1) {
      const v = begun[i].strategies.get(s.id);
      if (v != null) { latest = { value: m0Round(v), now: begun[i].now }; break; }
    }
    const finished = begun.filter((w) => w.finished && w.strategies.get(s.id) != null);
    const atStandard = finished.filter((w) => m0AtStandard(w.strategies.get(s.id), w.standard)).length;
    return {
      id: s.id,
      name: s.name,
      serves,
      strip: strip(inSpan, (w) => w.strategies.get(s.id) ?? null),
      latest,
      latestLabel: latest?.now ? 'This week so far' : 'Latest',
      atStandard: finished.length ? `${atStandard} of ${finished.length}` : null,
    };
  });
}

// ---------------------------------------------------------------- M10: improving and holding back

function improvingAndHoldingBack(d, weeks, sprint, objectives, signals) {
  const finished = weeks.filter((w) => w.sprintId === sprint.id && w.finished);
  const here = weeks.filter((w) => w.sprintId === sprint.id);
  const strategies = (d.strategies || []).map((s) => ({ id: s.id, name: s.name, weeks: finished.map((w) => ({ score: w.strategies.get(s.id) ?? null })).filter((x) => x.score != null) }));
  const habitNames = new Map((d.sprintHabits || []).map((h) => [h.id, h.name]));
  const habits = (d.sprintHabits || []).map((h) => ({ id: h.id, name: h.name, weeks: finished.map((w) => ({ score: w.habits.get(h.id) ?? null })).filter((x) => x.score != null) }));
  const lists = m10ImprovingAndHoldingBack({
    standard: sprint.standard,
    objectives: objectives.filter((o) => o.kind !== 'milestone').map((o) => ({ id: o.id, name: o.name, result: { reached: o.reached, improving: o.improving, notMoving: o.notMoving }, effortOnTrack: Boolean(o.effortOnTrack) })),
    strategies,
    habits,
    sleep: signals.sleep,
    stress: signals.stress,
  });
  const byId = new Map(objectives.map((o) => [o.id, o]));
  const strategyStrip = (id) => strip(here, (w) => w.strategies.get(id) ?? null);
  const improving = lists.improving.map((x) => {
    switch (x.kind) {
      case 'objective_reached':
      case 'objective_improving': {
        const o = byId.get(x.id);
        return { key: `o:${x.id}`, kind: x.kind, title: x.name, line: x.kind === 'objective_reached' ? 'You’ve reached its target.' : null, big: { text: o.reached && !o.change ? 'Reached' : `${o.change < 0 ? '−' : '+'}${deltaWords(o.objective, o.change).replace(/ points?$/, '')}`, unit: o.kind === 'rating' ? (Math.abs(o.change) === 1 ? 'point' : 'points') : null, good: true } };
      }
      case 'strategy_at_standard':
        return { key: `s:${x.id}`, kind: x.kind, title: x.name, line: 'It’s been at or above your standard for the last 3 weeks.', repeats: true, strip: strategyStrip(x.id) };
      case 'habit_kept_up':
        return { key: `h:${x.id}`, kind: x.kind, title: habitNames.get(x.id) || x.name, line: 'You’ve kept it up for the last 4 weeks.', repeats: true, mini: habitMini(finished, x.id) };
      case 'sleep_up': {
        const s = signals.sleep;
        const up = m0RoundHours(s.hoursNow) > m0RoundHours(s.hoursBefore);
        return up
          ? { key: 'sleep', kind: x.kind, title: 'Sleep', line: `You slept ${hoursFigure(m0RoundHours(s.hoursNow))} hours a night over the last 4 weeks, up from ${hoursFigure(m0RoundHours(s.hoursBefore))}.`, repeats: true, big: { text: glance(m0RoundHours(s.hoursNow - s.hoursBefore)), unit: 'hours', good: true } }
          : { key: 'sleep', kind: x.kind, title: 'Sleep', line: 'Your sleep quality over the last 4 weeks is up on the 4 before.' };
      }
      default:
        return null;
    }
  }).filter(Boolean);
  const holdingBack = lists.holdingBack.map((x) => {
    switch (x.kind) {
      case 'strategy_below':
        return { key: `s:${x.id}`, kind: x.kind, title: x.name, line: 'It’s been below your standard for the last 2 weeks.', repeats: true, strip: strategyStrip(x.id), fix: { label: 'Plan it into this week', to: '/performance-sprint', state: { addTodoFor: x.id } } };
      case 'objective_not_moving': {
        const o = byId.get(x.id);
        return { key: `o:${x.id}`, kind: x.kind, title: x.name, line: o.stillWords, big: { text: '±0' }, fix: { label: 'Review its Strategies', to: '/performance-plan', hash: '#strategies' } };
      }
      case 'habit_low':
        return { key: `h:${x.id}`, kind: x.kind, title: habitNames.get(x.id) || x.name, line: `It’s averaged ${m0Round(x.average)}% this sprint.`, repeats: true, mini: habitMini(finished, x.id), fix: { label: 'Make it easier this week', to: '/performance-sprint', state: { openHabit: x.id } } };
      case 'recovery_signals': {
        const s = signals.sleep;
        if (x.sleepDown) {
          return {
            key: 'recovery',
            kind: x.kind,
            title: 'Sleep',
            line: `You slept ${hoursFigure(m0RoundHours(s.hoursNow))} hours a night over the last 4 weeks, down from ${hoursFigure(m0RoundHours(s.hoursBefore))}.`,
            repeats: true,
            big: { text: glance(m0RoundHours(s.hoursNow - s.hoursBefore)), unit: 'hours' },
            fix: { label: 'Plan my sleep', to: '/sleep-wind-down' },
          };
        }
        return { key: 'recovery', kind: x.kind, title: 'Stress', line: 'Your stress was “Quite a lot” or more in the last 2 weekly debriefs.', fix: { label: 'Plan some recovery', to: '/personal/reset' } };
      }
      default:
        return null;
    }
  }).filter(Boolean);
  return { improving, holdingBack };
}

function habitMini(finished, id) {
  return finished.slice(-8).map((w) => {
    const v = w.habits.get(id);
    return { key: w.key, value: v == null ? null : m0Round(v), good: v != null && v >= 100 - 1e-9, max: 100 };
  });
}

// ---------------------------------------------------------------- the signals: sleep and stress

function nightsIn(dayPlans, from, to) {
  return (dayPlans || []).filter((n) => n.local_date >= from && n.local_date <= to);
}

function sleepSignals(dayPlans, today) {
  // M10: the last 4 weeks against the 4 before (M12 averages).
  const usable = (rows) => rows.map((r) => ({ value: r.sleep_hours == null ? null : Number(r.sleep_hours), toConfirm: Boolean(r.sleep_to_confirm) }));
  const now = m12SleepHours(usable(nightsIn(dayPlans, addDays(today, -27), today)));
  const before = m12SleepHours(usable(nightsIn(dayPlans, addDays(today, -55), addDays(today, -28))));
  const q = (rows) => {
    const word = usualQuality(rows.map((r) => r.sleep_quality));
    return word ? SLEEP_QUALITY.indexOf(word) : null;
  };
  return {
    hoursNow: now?.average ?? null,
    hoursBefore: before?.average ?? null,
    qualityNow: q(nightsIn(dayPlans, addDays(today, -27), today)),
    qualityBefore: q(nightsIn(dayPlans, addDays(today, -55), addDays(today, -28))),
  };
}

// ---------------------------------------------------------------- what's behind your performance

function weeklyMini(weeks, valueOf, goodOf, max) {
  return weeks.filter((w) => !w.future).slice(-8).map((w) => {
    const v = valueOf(w);
    return { key: w.key, value: v, good: v != null && goodOf(v), max };
  });
}

function winsRow(d, sprint, here) {
  const strategyName = new Map((d.strategies || []).map((s) => [s.id, s.name]));
  const wins = sprint ? (d.wins || []).filter((w) => !w.deleted_at && w.local_date >= sprint.start_on).sort((a, b) => (a.local_date < b.local_date ? 1 : -1)) : [];
  const served = (id) => (d.winLinks || []).filter((l) => l.win_id === id).map((l) => strategyName.get(l.strategy_id)).filter(Boolean);
  const n = wins.length;
  return {
    key: 'wins',
    title: 'Unplanned wins',
    line: n
      ? `You added ${plural(n, 'unplanned win')} this sprint, the latest “${wins[0].what}”.`
      : 'You haven’t added an unplanned win this sprint.',
    figure: n ? { text: String(n) } : null,
    mini: weeklyMini(here, (w) => wins.filter((x) => w.days?.includes(x.local_date)).length, (v) => v >= 1, 3),
    items: wins.map((w) => ({ key: w.id, text: w.what, served: served(w.id), date: w.local_date })),
  };
}

function rhythmRow(d, sprint, here, today) {
  const streak = m11DebriefStreak(debriefStreakWeeks(d.sprints || (sprint ? [sprint] : []), d.recoveries || [], d.allDebriefs || [], today));
  const thisWeek = here.find((w) => w.now);
  const days = (d.breathingDays || []).map((t) => {
    const at = parseDbTimestamp(t);
    return at && !Number.isNaN(at.getTime()) ? getLocalDateKey(at) : null;
  }).filter(Boolean);
  const breaths = thisWeek ? m11BreathingSessions(days, thisWeek.days) : null;
  const finished = here.filter((w) => w.finished);
  const habits = (d.sprintHabits || []).map((h) => {
    const r = m11HabitKeptUp(finished.map((w) => w.habits.get(h.id) ?? null));
    return { key: h.id, title: h.name, value: r.of ? `Kept up in ${r.keptUp} of ${plural(r.of, 'week')}` : 'No finished week yet' };
  });
  const parts = [];
  if (streak > 0) parts.push(`You’ve done your debrief ${plural(streak, 'week')} in a row`);
  if (breaths) parts.push(`${parts.length ? 'used' : 'You’ve used'} Breathe ${breaths === 1 ? 'once' : `${breaths} times`} this week`);
  let line;
  if (parts.length) line = `${parts.join(', and ')}.`;
  else line = sprint ? 'Your streak starts with your next weekly debrief.' : 'Your streaks start with your first Performance Sprint.';
  return {
    key: 'rhythm',
    title: 'Streaks and habits',
    line,
    figure: streak ? { text: String(streak), unit: streak === 1 ? 'week' : 'weeks' } : null,
    items: [
      { key: 'debriefs', title: 'Weekly debriefs in a row', value: plural(streak, 'week') },
      ...(thisWeek ? [{ key: 'breathe', title: 'Breathing sessions this week', value: String(breaths) }] : []),
      ...habits,
    ],
  };
}

function checkRow(d) {
  const points = checkinPoints(d.checkins || []);
  const last = points[points.length - 1] || null;
  const prev = points[points.length - 2] || null;
  const move = (a, b) => {
    if (b == null || a == null) return '';
    const x = a - b;
    return x > 0 ? `, up ${x}` : x < 0 ? `, down ${-x}` : ', the same as last time';
  };
  let line;
  if (!last) line = 'You haven’t done a check-in yet.';
  else if (!prev) line = `Your first check-in scored Hardware ${last.hardware}/100 and Software ${last.software}/100.`;
  else line = `Your Hardware score is ${last.hardware}/100${move(last.hardware, prev.hardware)}, and Software ${last.software}/100${move(last.software, prev.software)}.`;
  return {
    key: 'check',
    title: 'Hardware and Software check-in',
    line,
    figure: last ? { text: `${last.hardware}/${last.software}` } : null,
    points,
    started: Boolean(last),
  };
}

function lifeRow(d) {
  // As wheelOfLifeApi reads a check-in (its listCheckins shape).
  const all = (d.lifeChecks || []).filter((r) => r.checkin_date).map((r) => ({
    id: r.id,
    checkinAt: parseDbTimestamp(r.checkin_at),
    date: r.checkin_date,
    scores: r.scores || {},
    areas: Array.isArray(r.areas) ? r.areas : [],
  }));
  if (!all.length) return { key: 'lbr', title: 'Life balance review', line: 'You haven’t done a life balance review yet.', figure: null, stats: null };
  const range = presetRange('6m', all);
  const inPeriod = inRange(all, range.from, range.to);
  const latest = inPeriod[inPeriod.length - 1];
  const areas = (latest.areas || []).map((a) => ({ key: a.key, label: a.label ?? null, target: null }));
  const stats = computeStats(inPeriod, areas);
  if (!stats) return { key: 'lbr', title: 'Life balance review', line: 'You haven’t done a life balance review yet.', figure: null, stats: null };
  const avg = (Math.round(stats.average * 10) / 10).toFixed(1);
  let line;
  if (stats.one) line = `Your first life balance review averaged ${avg}.`;
  else {
    const since = formatCheckinDate(inPeriod[0].date, false);
    const moved = Math.round(stats.averageMove * 10) / 10;
    line = moved === 0
      ? `Your life balance average is ${avg}, the same as on ${since}.`
      : `Your life balance average is ${avg}, ${stats.averageUp ? 'up' : 'down'} ${moved.toFixed(1)} since ${since}.`;
  }
  return { key: 'lbr', title: 'Life balance review', line, figure: { text: avg }, stats, latestDate: latest.date };
}

function wayRow(d, sprint, here) {
  const reviews = sprint ? (d.dayReviews || []).filter((r) => r.local_date >= sprint.start_on && r.way_of_being_rating != null) : [];
  const overall = m12WayOfBeing(reviews.map((r) => Number(r.way_of_being_rating)));
  const weekAvg = (w) => {
    const v = reviews.filter((r) => w.days?.includes(r.local_date)).map((r) => Number(r.way_of_being_rating));
    const x = m12WayOfBeing(v);
    return x ? x.shown : null;
  };
  const latestWay = sprint ? [...(d.dayPlans || [])].filter((p) => p.local_date >= sprint.start_on && p.way_of_being).sort((a, b) => (a.local_date < b.local_date ? 1 : -1))[0]?.way_of_being : null;
  const bars = here.map((w) => {
    const v = w.future ? null : weekAvg(w);
    return { key: w.key, value: v, state: w.future ? 'next' : v == null ? 'none' : v >= 7 ? 'good' : 'below', tip: w.future ? { value: 'To come', when: whenWords(w) } : { value: v == null ? 'Not rated' : `${v}/10 on average`, when: `${whenWords(w)}${w.now ? ', so far' : ''}` }, label: String(w.number) };
  });
  return {
    key: 'be',
    title: 'How you want to be',
    line: overall ? `You rated it ${overall.shown}/10 on average this sprint.` : 'You haven’t rated it yet.',
    figure: overall ? { text: String(overall.shown), unit: '/10', good: overall.green } : null,
    mini: weeklyMini(here, weekAvg, (v) => v >= 7, 10),
    latestWay: latestWay ? latestWay.trim() : null,
    bars,
    enough: bars.some((b) => b.value != null),
  };
}

function controlRow(d, sprint, here) {
  const checks = sprint ? (d.controlChecks || []).filter((c) => c.local_date >= sprint.start_on) : [];
  if (!checks.length) return null; // no tool writes these yet: the row waits for the first one
  const all = m12EmotionalControl(checks.map((c) => c.line));
  const weekShare = (w) => {
    const x = m12EmotionalControl(checks.filter((c) => w.days?.includes(c.local_date)).map((c) => c.line));
    return x ? x.shown : null;
  };
  const bars = here.map((w) => {
    const v = w.future ? null : weekShare(w);
    return { key: w.key, value: v, state: w.future ? 'next' : v == null ? 'none' : v >= 70 ? 'good' : 'below', tip: w.future ? { value: 'To come', when: whenWords(w) } : { value: v == null ? 'No reviews' : `${v}% of reviews above the line`, when: whenWords(w) }, label: String(w.number) };
  });
  const above = checks.filter((c) => c.line === 'above').length;
  return {
    key: 'line',
    title: 'Emotional control',
    line: `You were above the line in ${above} of ${plural(all.checks, 'review')} this sprint.`,
    figure: { text: `${all.shown}%`, good: all.green },
    mini: weeklyMini(here, weekShare, (v) => v >= 70, 100),
    bars,
    enough: true,
  };
}

function sleepRow(d, sprint, today, target) {
  if (!sprint) return { key: 'sleep', title: 'Sleep', line: 'You haven’t logged sleep yet.', figure: null, slots: [], enough: false };
  const end = addDays(sprint.start_on, sprint.length_weeks * 7 - 1);
  const last = today > end ? today : end;
  const byDay = new Map((d.dayPlans || []).map((n) => [n.local_date, n]));
  const slots = [];
  const count = Math.max(1, daysBetween(sprint.start_on, last) + 1);
  for (let i = 0; i < count; i += 1) {
    const date = addDays(sprint.start_on, i);
    if (date > today && date > end) break;
    const row = byDay.get(date);
    const raw = row?.sleep_hours;
    const hours = raw == null || raw === '' || !Number.isFinite(Number(raw)) ? null : Number(raw);
    const quality = SLEEP_QUALITY.includes(row?.sleep_quality) ? row.sleep_quality : null;
    const future = date > today;
    const odd = Boolean(row?.sleep_to_confirm);
    let state = 'next';
    if (!future) state = hours == null || odd ? 'none' : nightState(hours, target);
    const isLast = date === today;
    slots.push({
      date,
      day: dayName(date, today),
      axis: isLast ? 'Last night' : nightDate(date),
      night: `Night of ${nightDate(addDays(date, -1))}`,
      hours: future || odd ? null : hours,
      quality: future ? null : quality,
      state,
      last: isLast,
    });
  }
  const past = slots.filter((s) => s.date <= today);
  const answered = past.filter((s) => s.hours != null);
  const avg = m12SleepHours(answered.map((s) => ({ value: s.hours })));
  const usual = qualityWords(usualQuality(past.map((s) => s.quality)));
  const latest = [...answered].reverse()[0] || null;
  const action = latest ? sleepAction(latest.hours, target, latest.last ? 'Last night' : 'Your latest night') : null;
  const weekAvg = (from) => {
    const v = answered.filter((s) => s.date >= from && s.date <= addDays(from, 6)).map((s) => ({ value: s.hours }));
    const x = m12SleepHours(v);
    return x ? x.shown : null;
  };
  const weeks = [];
  for (let w = 0; w * 7 < count; w += 1) {
    const from = addDays(sprint.start_on, w * 7);
    if (from > today) break;
    weeks.push({ key: from, value: weekAvg(from) });
  }
  let line;
  if (!avg) line = 'You haven’t logged sleep yet.';
  else if (usual) line = `You slept ${hoursFigure(avg.shown)} hours a night on average this sprint, mostly rated “${usual}”.`;
  else line = `You slept ${hoursFigure(avg.shown)} hours a night on average this sprint.`;
  return {
    key: 'sleep',
    title: 'Sleep',
    line,
    figure: avg ? { text: hoursFigure(avg.shown), unit: 'hours', good: avg.shown >= target.from } : null,
    mini: weeks.slice(-8).map((w) => ({ key: w.key, value: w.value, good: w.value != null && w.value >= target.from, max: 10 })),
    slots,
    enough: answered.length >= 2,
    usual,
    action,
    table: answered.map((s) => ({ key: s.date, cells: { night: s.night.replace(/^Night of /, ''), hours: `${hoursFigure(s.hours)} hours`, quality: qualityWords(s.quality) || 'Not answered' } })),
  };
}

const STRESS_WORDS = Object.fromEntries(STRESS_OPTIONS.map((o) => [o.value, o.label]));

function stressRow(d, sprint, here) {
  const byWeek = new Map((sprint ? (d.allDebriefs || []).filter((x) => x.sprint_id === sprint.id && x.stress && x.status === 'finished') : []).map((x) => [x.sprint_week, x.stress]));
  const answered = here.filter((w) => byWeek.has(w.number));
  const green = answered.filter((w) => m12StressGreen(byWeek.get(w.number))).length;
  const dots = here.map((w) => {
    const a = byWeek.get(w.number) || null;
    return {
      key: w.key,
      label: String(w.number),
      answer: a,
      level: a ? WEEKLY_STRESS.indexOf(a) : null,
      good: a ? m12StressGreen(a) : false,
      tip: a ? { value: STRESS_WORDS[a], when: whenWords(w) } : null,
    };
  });
  return {
    key: 'stress',
    title: 'Stress',
    line: answered.length
      ? `You answered “Not at all” or “A little” in ${green} of ${plural(answered.length, 'week')} this sprint.`
      : 'This starts after your first weekly debrief.',
    figure: answered.length ? { text: `${green} of ${answered.length}` } : null,
    mini: answered.slice(-8).map((w) => {
      const lvl = WEEKLY_STRESS.indexOf(byWeek.get(w.number));
      return { key: w.key, value: 5 - lvl, good: m12StressGreen(byWeek.get(w.number)), max: 5 };
    }),
    dots,
    levels: WEEKLY_STRESS.map((k) => STRESS_WORDS[k]),
    enough: answered.length > 0,
    table: answered.map((w) => ({ key: w.key, cells: { week: whenWords(w), answer: STRESS_WORDS[byWeek.get(w.number)] } })),
  };
}

// ---------------------------------------------------------------- the whole page

/**
 * The dashboard's whole view.
 * @param {object} d rows from loadDashboard
 * @param {{ today: string, span?: string, target: {from, to, own}, patterns?: object[]|null, showResults?: boolean }} opts
 */
export function dashboardView(d, { today, span = 'sprint', target, patterns = null, showResults = false }) {
  if (!d) return null;
  const sprint = d.sprint || null;
  const recovery = openRecovery(d.recoveries || []);
  const weeks = allSprintWeeks(d, today);
  const here = sprint ? weeks.filter((w) => w.sprintId === sprint.id) : [];
  const thisWeek = here.find((w) => w.now) || null;
  const hidden = Boolean(recovery) && !showResults;
  const started = Boolean(sprint) && today >= sprint.start_on;

  const hero = heroView(d, weeks, sprint, today);
  const objectives = objectiveRows(d, today, sprint, weeks);
  const strategies = strategyRows(d, weeks, sprint, span, today);
  const sleepSig = sleepSignals(d.dayPlans || [], today);
  const finishedStress = sprint
    ? here.filter((w) => w.finished).map((w) => (d.allDebriefs || []).find((x) => x.sprint_id === sprint.id && x.sprint_week === w.number)?.stress).filter(Boolean)
    : [];

  // Current sprint: what's improving and what's holding you back (M10).
  let current = null;
  if (started) {
    const lists = improvingAndHoldingBack(d, weeks, sprint, objectives, { sleep: sleepSig, stress: finishedStress });
    const n = thisWeek?.number ?? here.filter((w) => !w.future).length;
    const over = !thisWeek && here.every((w) => !w.future);
    current = {
      lead: over
        ? `All ${sprint.length_weeks} weeks of Sprint ${sprint.number} are finished.`
        : `This is week ${n} of ${sprint.length_weeks} of Sprint ${sprint.number}.`,
      closedLine: `${plural(lists.improving.length, 'thing is', 'things are')} improving and ${lists.holdingBack.length} ${lists.holdingBack.length === 1 ? 'is' : 'are'} holding you back.`,
      improving: lists.improving,
      holdingBack: lists.holdingBack,
      improvingEmpty: 'Nothing has improved yet. Results often lag effort by a few weeks.',
      holdingBackEmpty: 'Nothing is holding you back this sprint.',
    };
  }

  // Objectives and Strategies.
  const numbers = objectives.filter((o) => o.kind !== 'milestone');
  const milestones = objectives.filter((o) => o.kind === 'milestone' && !o.result.reached && o.objective.dueOn);
  const improvingCount = numbers.filter((o) => o.improving || o.reached).length;
  const ms = milestones[0];
  const msWords = ms ? `, and the milestone is due by ${shortDate(ms.objective.dueOn)}, ${m9TimeLeft(today, ms.objective.dueOn).text}` : '';
  const objSummary = numbers.length
    ? `${improvingCount} of ${numbers.length} ${numbers.length === 1 ? 'is' : 'are'} improving this sprint${msWords}.`
    : ms ? `The milestone is due by ${shortDate(ms.objective.dueOn)}, ${m9TimeLeft(today, ms.objective.dueOn).text}.` : 'You haven’t set an Outcome Objective yet.';
  const lastWeek = [...here].reverse().find((w) => w.finished) || null;
  const lastWeekScores = lastWeek ? (d.strategies || []).map((s) => lastWeek.strategies.get(s.id)).filter((v) => v != null) : [];
  const atStd = lastWeekScores.filter((v) => m0AtStandard(v, sprint.standard)).length;
  const strSummary = lastWeekScores.length
    ? `${atStd} of ${lastWeekScores.length} ${lastWeekScores.length === 1 ? 'was' : 'were'} at your standard last week.`
    : 'Your first week isn’t finished yet.';
  const chain = {
    lead: ['Your Outcome Objectives are the results that show your Mission is moving.', 'Your Strategies are the work that drives them.'],
    closedLine: `${improvingCount} of ${numbers.length} Outcome ${numbers.length === 1 ? 'Objective is' : 'Objectives are'} improving this sprint.${lastWeekScores.length ? ` ${atStd} of ${lastWeekScores.length} Strategies ${lastWeekScores.length === 1 ? 'was' : 'were'} at your standard last week.` : ''}`,
    objectives: { summary: objSummary, rows: objectives },
    strategies: { summary: strSummary, rows: strategies, heading: 'Weekly performance score' },
    spanLine: spanLine(span),
  };

  // What's behind your performance, always the current sprint.
  const rows = [
    winsRow(d, sprint, here),
    rhythmRow(d, sprint, here, today),
    patterns && patterns.length ? { key: 'pat', title: 'Patterns in your numbers', line: `${plural(patterns.length, 'pattern has', 'patterns have')} been found in your own numbers.`, figure: { text: String(patterns.length) }, patterns } : null,
    checkRow(d),
    lifeRow(d),
    wayRow(d, sprint, here),
    controlRow(d, sprint, here),
    sleepRow(d, sprint, today, target),
    stressRow(d, sprint, here),
  ].filter(Boolean);
  const behind = {
    lead: 'This section shows the current sprint.',
    closedLine: patterns && patterns.length
      ? `Your wins, streaks, ${plural(patterns.length, 'pattern')} and more.`
      : 'Your wins, streaks, check-in and more.',
    rows,
  };

  // The weekly debrief whose window is open, until it is done (as the sprint page).
  const done = new Set((d.allDebriefs || []).filter((x) => sprint && x.sprint_id === sprint.id && x.status === 'finished').map((x) => x.sprint_week));
  const openWeek = hidden ? null : here.find((w) => !w.future && w.days && m0DebriefWindow(w, today)?.open && !done.has(w.number));

  return {
    today,
    debrief: openWeek ? { week: openWeek.number } : null,
    state: !sprint ? 'none' : !started ? 'future' : recovery ? 'paused' : thisWeek ? 'running' : 'over',
    hidden,
    sprint: sprint ? { id: sprint.id, number: sprint.number, standard: sprint.standard, lengthWeeks: sprint.length_weeks } : null,
    hero,
    logging: hidden ? null : loggingLine(d, thisWeek, today),
    current,
    chain,
    behind,
    span,
  };
}

/** The page's one-line summary of a fold, for "Show as a table" captions and screen readers. */
export function foldCaption(row) {
  return `${row.title}, this sprint`;
}

/** The sleep chart's words for the dashboard (the same chart as Recovery's, over the sprint). */
export const SLEEP_LABEL = 'Sleep each night of this sprint';
export const SLEEP_EMPTY = 'Your chart starts after your second night.';

