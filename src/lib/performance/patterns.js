// Patterns in your numbers (methods M14; START-HERE 5d, the 23 pattern
// rules; mock-up M4 v47's pattern cards; Phase 5 step 3). Pure code: no
// database, no React, no device clock (today is passed in), tested in
// tests/performance/patterns.test.mjs.
//
// The engine (src/lib/scores/m14.js) is the one the simulation proves
// (npm run sim:patterns). This file does three things around it:
//   1. builds the engine's person from the person's own rows (their sprint
//      weeks of the last 26 weeks, scored as the sprint page scores them,
//      and their days), never anyone else's (rules 1, 19, 20);
//   2. keeps the cards steady from week to week in a small state saved in
//      person_settings.page_preferences.patterns through the offline queue
//      (rules 6, 17, 19, 23): a weekly check when a new sprint week has
//      finished, and a recheck the night after an edit (the first visit on
//      a later day, starting again from the cards before this week's check,
//      so a recheck never adds a second new card in one week);
//   3. turns a card into the words M4 shows (rules 7, 8, 15, 16).
//
// The check runs on the device and is deterministic: the shuffle test is
// seeded from the person and the week, so the same data always gives the
// same cards (rule 1). Coach-only links (rule 18) and the coach seeing or
// hiding cards (rule 9) wait for Phase 6a's server job; the device works
// out and keeps the person's own cards only.
//
// Choices made here because Tim wasn't there (listed in the report):
// - L1 and L2 compare a night's sleep (as Daily plan records it the next
//   morning) with that day's day score (M14.2), which is never shown as a
//   number (M14.2 over M4's "9 points higher" and "Average score 86%
//   against 77%"): the card says the plan got more done, and How was this
//   worked out? gives the gap against the usual swing in words.
// - "Personal best" is a record, not a link on the fixed list (M14.1), so
//   it is not among the cards (M4 drew it as a fourth card).
// - A sleep habit, for the day score, is one whose name speaks of sleep or
//   bed (there is no sleep flag on a habit).
// - A day has a day score only when something was logged or planned that
//   day, so a day nobody opened the portal isn't counted as nothing done.
// - A new card shows on the dashboard once the weekly debrief has
//   introduced it, or once that week's debrief window has closed (3 days
//   after the week ends), so someone who skips a debrief still sees it.

import { addDays, daysBetween, weekday } from '../scores/dates.js';
import {
  m0AtStandard,
  m0Round,
  m0SprintCalendar,
  m0WeekIsEligible,
  m11HabitKeptUp,
  m12WayOfBeing,
  m14DayScore,
  m14Rng,
  m14WeeklyCheck,
  m9FigureOn,
} from '../scores/index.js';
import { settingForWeek, sprintWeekResult, toMeasure, toObjective, toRecoveries } from './rows';
import { plainNumber } from './words';

/** The page settings key (person_settings.page_preferences.patterns). */
export const PATTERNS_KEY = 'patterns';
export const PATTERNS_CACHE = 'performance-patterns';
const WEEKS = 26;
const DEBRIEF_CLOSES_AFTER = 3;
const EPOCH = '2024-01-01';

// ---------------------------------------------------------------- small helpers

/** A short, steady fingerprint of any value (FNV-1a, 32 bits), as 8 hex characters. */
export function fingerprint(value) {
  const s = typeof value === 'string' ? value : JSON.stringify(value);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** The seed of one person's check in one week, so the same data always gives the same cards. */
export function patternSeed(userId, weekKey) {
  return parseInt(fingerprint(`${userId}:${weekKey}`), 16);
}

/** A week's number for the steadiness rule (M14.6: a card stays at least 4 weeks). */
export function weekIndex(weekEnd) {
  return Math.floor(daysBetween(EPOCH, weekEnd) / 7);
}

const SLEEP_HABIT = /\b(sleep|slept|bed|bedtime|wind[- ]?down)\b/i;
/** Whether a habit is about sleep, so the day score leaves it out (M14.1). */
export function isSleepHabit(name) {
  return SLEEP_HABIT.test(name || '');
}

// ---------------------------------------------------------------- 1. the person, from their rows

/**
 * The engine's person (see the top of m14.js) from the person's own rows,
 * with what the cards need to name things.
 * @param {object} d rows from loadPatternRows: sprints, recoveries,
 *   workingPatterns, debriefs, strategies (every plan's, archived too),
 *   links, objectives, figures, wins, winLinks, dayPlans, dayPlanTodos,
 *   dayReviews, bySprint { [sprintId]: { sprintHabits, sprintSettings, logs, todos, todoMoves } }
 * @param {string} today the person's local today
 * @returns {{ person, weeks: object[], check: {key, end}|null, names: object }}
 */
export function buildPatternPerson(d, today) {
  const since = addDays(today, -WEEKS * 7);
  const recoveries = toRecoveries(d.recoveries || []);
  const debriefs = new Map((d.debriefs || []).map((x) => [`${x.sprint_id}:${x.sprint_week}`, x]));
  const reviews = new Map((d.dayReviews || []).map((r) => [r.local_date, r]));
  const sprints = [...(d.sprints || [])].filter((s) => s.start_on <= today).sort((a, b) => a.number - b.number);
  const names = { habits: {}, strategies: {}, strategyOfHabit: {}, objectives: {}, sprintHabitOf: {}, runningSprintId: null };
  for (const s of d.strategies || []) names.strategies[s.id] = s.name;
  const weeks = [];
  const dayInfo = new Map();

  for (const s of sprints) {
    if (s.status === 'running') names.runningSprintId = s.id;
    const sub = d.bySprint?.[s.id] || {};
    const sprintHabits = sub.sprintHabits || [];
    const dd = {
      sprint: s,
      sprintHabits,
      sprintSettings: sub.sprintSettings || [],
      logs: (sub.logs || []).filter((l) => !l.to_confirm),
      todos: sub.todos || [],
      todoMoves: sub.todoMoves || [],
      wins: d.wins || [],
      winLinks: d.winLinks || [],
      strategies: (d.strategies || []).filter((x) => x.plan_id === s.plan_id),
      links: d.links || [],
      objectives: (d.objectives || []).filter((o) => o.plan_id === s.plan_id),
      workingPatterns: d.workingPatterns || [],
    };
    const keyOf = new Map(sprintHabits.map((sh) => [sh.id, sh.habit_id || sh.id]));
    for (const sh of sprintHabits) {
      names.habits[keyOf.get(sh.id)] = sh.name;
      names.strategyOfHabit[keyOf.get(sh.id)] = sh.strategy_id;
      if (s.status === 'running') names.sprintHabitOf[keyOf.get(sh.id)] = sh.id;
    }
    const objectives = dd.objectives
      .filter((o) => o.kind !== 'milestone')
      .map((o) => toObjective(o, (d.figures || []).filter((f) => f.objective_id === o.id)));
    for (const o of objectives) names.objectives[o.id] = { name: o.name, unit: o.unit, kind: o.kind, direction: o.direction };

    const calendar = m0SprintCalendar({ start: s.start_on, lengthWeeks: s.length_weeks, recoveries }, today);
    for (const wk of calendar.weeks) {
      if (!wk.finished || wk.end < since) continue;
      if (s.status === 'finished' && s.actual_end_on && wk.start > s.actual_end_on) continue;
      const r = sprintWeekResult(dd, calendar, wk.number);
      const inWeek = new Set(wk.days);
      const loggedDays = new Set(dd.logs.filter((l) => inWeek.has(l.local_date)).map((l) => l.local_date)).size;
      const debrief = debriefs.get(`${s.id}:${wk.number}`);
      // Rule 12 (M0.5): Recovery, weeks marked unusual and thin weeks are
      // left out. A Travel and jet lag plan doesn't exist yet, so no week
      // is left out for travel (listed for the step's report).
      const eligible = r.result.score != null && m0WeekIsEligible({
        finished: true,
        recoveryDaysInside: wk.recoveryDaysInside,
        unusual: Boolean(debrief?.unusual),
        loggedDays,
        workingDays: r.workingDays.length,
      });
      const habits = {};
      for (const h of r.result.habits) {
        const sh = sprintHabits.find((x) => x.id === h.id);
        if (!sh || h.score == null) continue;
        habits[keyOf.get(sh.id)] = { strategyId: sh.strategy_id, kept: m11HabitKeptUp([h.score]).keptUp === 1, sleep: isSleepHabit(sh.name) };
      }
      const strategies = {};
      for (const x of r.result.strategies) {
        const without = {};
        // L3's result is the Strategy's score worked out without the habit
        // (M14.1: no link may contain its own cause), scored the same way.
        for (const sh of sprintHabits.filter((h) => h.strategy_id === x.id)) {
          if (!habits[keyOf.get(sh.id)]) continue;
          const alone = sprintWeekResult({ ...dd, sprintHabits: sprintHabits.filter((h) => h.id !== sh.id) }, calendar, wk.number);
          without[keyOf.get(sh.id)] = alone.result.strategies.find((y) => y.id === x.id)?.score ?? null;
        }
        strategies[x.id] = { score: x.score, without, atStandard: x.score == null ? null : m0AtStandard(x.score, s.standard) };
      }
      const objectivesOut = {};
      for (const o of objectives) {
        const figure = m9FigureOn(o, wk.end);
        objectivesOut[o.id] = {
          figure: figure == null ? null : Number(figure),
          direction: o.direction === 'down' ? 'down' : 'up',
          servedBy: dd.links.filter((l) => l.objective_id === o.id).map((l) => l.strategy_id),
        };
      }
      const way = m12WayOfBeing(wk.days.map((day) => reviews.get(day)?.way_of_being_rating).filter((v) => v != null).map(Number));
      const working = new Set(r.workingDays);
      const week = {
        key: `${s.id}:${wk.number}`,
        sprintId: s.id,
        sprintNumber: s.number,
        number: wk.number,
        end: wk.end,
        eligible,
        score: r.result.score,
        stress: debrief?.stress || null,
        wayOfBeing: way ? way.shown : null,
        habits,
        strategies,
        objectives: objectivesOut,
      };
      weeks.push(week);
      for (const day of wk.days) dayInfo.set(day, { week, dd, number: wk.number, working: working.has(day) });
    }
  }
  weeks.sort((a, b) => (a.end < b.end ? -1 : a.end > b.end ? 1 : 0));

  // Days: every calendar day of the last 26 weeks up to yesterday, in
  // order (the daily links compare a day with the same weekday nearby).
  const plans = new Map((d.dayPlans || []).map((p) => [p.local_date, p]));
  const chosen = new Map();
  for (const t of d.dayPlanTodos || []) {
    if (!chosen.has(t.day_plan_id)) chosen.set(t.day_plan_id, []);
    chosen.get(t.day_plan_id).push(t.todo_id);
  }
  const days = [];
  for (let day = addDays(since, 1); day < today; day = addDays(day, 1)) {
    const info = dayInfo.get(day);
    const plan = plans.get(day);
    const out = {
      date: day,
      weekday: weekday(day),
      eligible: Boolean(info?.week.eligible),
      working: Boolean(info?.working),
      sleepHours: plan?.sleep_hours == null ? null : Number(plan.sleep_hours),
      // Rule 14: an odd entry (20 hours of sleep) is asked about once in
      // Daily plan and left out until it is confirmed.
      sleepToConfirm: Boolean(plan?.sleep_to_confirm),
      sleepQuality: plan?.sleep_quality || null,
      dayScore: null,
    };
    if (info) {
      const { dd, number } = info;
      const todayLogs = dd.logs.filter((l) => l.local_date === day);
      const picked = plan ? chosen.get(plan.id) || [] : [];
      if (todayLogs.length || plan) {
        const habits = dd.sprintHabits.map((sh) => {
          const setting = settingForWeek(dd.sprintSettings, sh.id, number);
          if (!setting) return null;
          const logs = todayLogs.filter((l) => l.sprint_habit_id === sh.id);
          return { ...toMeasure(setting), sleep: isSleepHabit(sh.name), value: logs.length ? logs.reduce((a, l) => a + Number(l.value), 0) : null };
        }).filter(Boolean);
        const todos = picked
          .map((id) => (d.allTodos || dd.todos).find((t) => t.id === id))
          .filter(Boolean)
          .map((t) => ({ impact: t.impact ?? 2, done: Boolean(t.done_on && t.done_on <= day) }));
        out.dayScore = m14DayScore({ habits, todos });
      }
    }
    days.push(out);
  }

  const last = weeks[weeks.length - 1] || null;
  const person = {
    weeks: weeks.map(({ eligible, score, stress, wayOfBeing, habits, strategies, objectives }) => ({ eligible, score, stress, wayOfBeing, habits, strategies, objectives })),
    days: days.map(({ weekday: wd, eligible, working, sleepHours, sleepToConfirm, sleepQuality, dayScore }) => ({
      weekday: wd, eligible, working, sleepHours, sleepToConfirm, sleepQuality, dayScore,
    })),
    questions: [],
  };
  return { person, fp: fingerprint(person), weeks, check: last ? { key: last.key, end: last.end } : null, names, eligibleWeeks: weeks.filter((w) => w.eligible).length };
}

// ---------------------------------------------------------------- 2. staying steady

const EMPTY = Object.freeze({ v: 1, week: null, end: null, on: null, fp: null, before: [], cards: [], evaluated: 0, hidden: [], intro: {}, introWeek: null, introKey: null, gapNoted: false });

/** The person's pattern state, cleaned: anything odd is dropped, so an old value never breaks a page. */
export function readPatternState(prefs) {
  const raw = prefs && typeof prefs === 'object' ? prefs[PATTERNS_KEY] : null;
  if (!raw || typeof raw !== 'object') return { ...EMPTY };
  const cards = (list) => (Array.isArray(list) ? list.filter((c) => c && typeof c.key === 'string' && Number.isFinite(c.shownAt)) : []);
  return {
    ...EMPTY,
    week: typeof raw.week === 'string' ? raw.week : null,
    end: typeof raw.end === 'string' ? raw.end : null,
    on: typeof raw.on === 'string' ? raw.on : null,
    fp: typeof raw.fp === 'string' ? raw.fp : null,
    before: cards(raw.before),
    cards: cards(raw.cards),
    evaluated: Number.isFinite(raw.evaluated) ? raw.evaluated : 0,
    hidden: Array.isArray(raw.hidden) ? raw.hidden.filter((k) => typeof k === 'string') : [],
    intro: raw.intro && typeof raw.intro === 'object' ? raw.intro : {},
    introWeek: typeof raw.introWeek === 'string' ? raw.introWeek : null,
    introKey: typeof raw.introKey === 'string' ? raw.introKey : null,
    gapNoted: Boolean(raw.gapNoted),
  };
}

// What a card keeps of its result: just what its words need (the state
// stays small, under the 16 KB the settings may hold).
function compact(r) {
  const n = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 1000) / 1000);
  return {
    id: r.id,
    subject: r.subject ?? null,
    strength: r.strength,
    sizes: r.sizes,
    values: r.values ? r.values.map(n) : null,
    gap: n(r.gap),
    swing: n(r.swing),
    q: r.q,
    holds: Boolean(r.holds),
  };
}

/** Whether a check is due on this visit (cheap: the engine runs only when it is). */
export function patternCheckDue(state, built, today) {
  if (!built?.check) return false;
  if (state.week !== built.check.key) return true;
  return state.fp !== (built.fp || fingerprint(built.person)) && (state.on || '') < today;
}

/**
 * The state after this visit's check (or the same state when no check is
 * due): a weekly check once a new sprint week has finished; a recheck the
 * night after an edit (rule 23: the person's data changed since the last
 * check, and the last check was on an earlier day), from the cards as they
 * were before this week's check.
 * @param {object} state readPatternState
 * @param {{ person, check: {key, end}|null }} built buildPatternPerson
 * @param {{ today: string, seed: number }} opts
 * @returns {{ state: object, changed: boolean }}
 */
export function nextPatternState(state, built, { today, seed }) {
  const { person, check } = built;
  if (!check) return { state, changed: false };
  const fp = built.fp || fingerprint(person);
  const weekly = state.week !== check.key;
  const edited = !weekly && state.fp !== fp && (state.on || '') < today;
  if (!weekly && !edited) return { state, changed: false };
  const base = weekly ? state.cards : state.before;
  const wi = weekIndex(check.end);
  const r = m14WeeklyCheck(person, { cards: base.map((c) => ({ key: c.key, id: c.id, positive: true, shownAt: c.shownAt })) }, wi, { rng: m14Rng(seed) });
  const was = new Map(base.map((c) => [c.key, c]));
  const cards = r.cards.map((c) => ({
    key: c.key,
    shownAt: c.shownAt,
    end: was.get(c.key)?.end || check.end,
    ...compact(c.result),
  }));
  return {
    state: { ...state, week: check.key, end: check.end, on: today, fp, before: base, cards, evaluated: r.evaluated },
    changed: true,
  };
}

/** The cards the dashboard shows (rule 17: a new one after the debrief has introduced it, or its window has closed), at most 4. */
export function shownCards(state, today) {
  return state.cards
    .filter((c) => !state.hidden.includes(c.key))
    .filter((c) => state.intro[c.key] || today > addDays(c.end, DEBRIEF_CLOSES_AFTER))
    .slice(0, 4);
}

/** The state after the person taps Not useful on a card. */
export function hidePattern(state, key) {
  return { ...state, hidden: [...new Set([...state.hidden, key])] };
}

/**
 * What the weekly debrief shows (rule 17: new patterns arrive in the
 * debrief, at most one a week; rule 22: a logging gap is explained once).
 * @param {object} state
 * @param {string} debriefKey `${sprintId}:${week}`
 * @param {{ eligibleWeeks?: number }} built
 * @returns {{ kind: 'card', card, mark: boolean } | { kind: 'gap', lines: string[] } | null}
 */
export function debriefPattern(state, debriefKey, built = {}) {
  if (state.introWeek === debriefKey) {
    const card = state.cards.find((c) => c.key === state.introKey && !state.hidden.includes(c.key));
    return card ? { kind: 'card', card, mark: false } : null;
  }
  const fresh = state.cards
    .filter((c) => !state.intro[c.key] && !state.hidden.includes(c.key))
    .sort((a, b) => b.shownAt - a.shownAt)[0];
  if (fresh) return { kind: 'card', card: fresh, mark: true };
  if (!state.gapNoted && state.week && state.evaluated === 0) {
    const lines = ['Patterns in your numbers appear once there’s enough data, usually after 8 to 12 weeks.'];
    if ((built.eligibleWeeks ?? 0) < 12) lines.push('Weeks with fewer than 4 days logged are left out, so logging most days helps.');
    return { kind: 'gap', lines };
  }
  return null;
}

/** The state once the debrief has shown its pattern (or its one logging-gap line). */
export function markDebriefPattern(state, debriefKey, shown, today) {
  if (!shown) return state;
  if (shown.kind === 'gap') return { ...state, gapNoted: true };
  if (!shown.mark) return state;
  return { ...state, intro: { ...state.intro, [shown.card.key]: today }, introWeek: debriefKey, introKey: shown.card.key };
}

/** What is stored: the state without anything a page can work out again. */
export function storedPatternState(state) {
  // Introductions only for cards still kept, so the object stays small.
  const keys = new Set([...state.cards, ...state.before].map((c) => c.key));
  const intro = Object.fromEntries(Object.entries(state.intro).filter(([k]) => keys.has(k)));
  return { ...state, intro, hidden: state.hidden.slice(-20) };
}

// ---------------------------------------------------------------- 3. the words

const KIND = {
  L1: 'Sleep and your day',
  L2: 'Sleep and your day',
  L3: 'A habit and its Strategy',
  L4: 'Stress and your score',
  L5: 'How you want to be and your score',
  L6: 'Effort, then results',
};

const points = (x) => {
  const n = Math.max(1, m0Round(Math.abs(x)));
  return `${n} ${n === 1 ? 'point' : 'points'}`;
};
const pct = (x) => `${m0Round(x)}%`;
const times = (n, one, many) => `${n} ${n === 1 ? one : many}`;
/** "about 1 time in 300" from the corrected chance (M14.8). */
export function chanceWords(q) {
  const oneIn = Math.max(1, Math.round(1 / Math.max(q, 1e-6)));
  const shown = oneIn >= 1000 ? 1000 : oneIn >= 100 ? Math.round(oneIn / 10) * 10 : oneIn;
  return oneIn >= 1000
    ? 'A gap this big would happen by chance less than 1 time in 1,000, allowing for every link checked.'
    : `A gap this big would happen by chance about 1 time in ${plainNumber(shown)}, allowing for every link checked.`;
}
function swingWords(gap, swing, unitWords, weekly) {
  const per = weekly ? 'from week to week' : 'from day to day';
  if (!swing) return null;
  return `Your ${unitWords} usually swings about ${points(swing)} ${per}, so ${points(gap)} is a real difference for you.`;
}

/**
 * One card in words (M4 PATS, to the methods and writing rules): the kind,
 * Strong link or Clear link, the sentence ("in weeks you…", never
 * "because"), an open question, one action worded as the action, and How
 * was this worked out? (M14.8).
 * @param {object} card from the state
 * @param {object} names from buildPatternPerson
 */
export function patternCardWords(card, names = {}) {
  const strength = card.strength === 'strong' ? 'Strong link' : 'Clear link';
  const [inGroup, outGroup] = card.sizes || [0, 0];
  const held = 'It held in both halves of your data, and it’s rechecked every week.';
  const chance = chanceWords(card.q);
  const base = { key: card.key, kind: KIND[card.id] || 'A pattern', strength };
  const trend = (gap) => `After allowing for your general trend, the gap was ${points(gap)}.`;

  if (card.id === 'L1' || card.id === 'L2') {
    const after = card.id === 'L1' ? 'nights of 7 hours or more' : 'nights you rated Good or Very good';
    const rest = card.id === 'L1' ? 'after less' : 'after other nights';
    const ratio = card.swing ? Math.round((Math.abs(card.gap) / card.swing) * 10) / 10 : null;
    return {
      ...base,
      line: `After ${after}, you got more of your day’s plan done.`,
      question: card.id === 'L1' ? 'What helps you get to bed on time?' : 'What helps you sleep well?',
      action: { label: 'Plan my sleep', to: '/sleep-wind-down' },
      how: [
        `Compared ${times(inGroup, 'day', 'days')} after ${after} with ${times(outGroup, 'day', 'days')} ${rest}, each against the same day of the week nearby.`,
        'Each working day was scored by how much of that morning’s plan got done, weighted by impact, leaving out any sleep habit.',
        ratio ? `The gap was ${plainNumber(ratio)} times your usual swing from day to day.` : null,
        chance,
        held,
      ].filter(Boolean),
    };
  }
  if (card.id === 'L3') {
    const [hid] = String(card.subject || '').split(':');
    const habit = names.habits?.[hid] || 'this habit';
    const sid = names.strategyOfHabit?.[hid];
    const strategy = names.strategies?.[sid] || 'its Strategy';
    const running = names.sprintHabitOf?.[hid];
    return {
      ...base,
      line: `In weeks you kept “${habit}”, “${strategy}” scored ${points(card.gap)} higher.`,
      question: `What does “${habit}” give you that shows up in “${strategy}”?`,
      action: running ? { label: 'Plan it into this week', to: '/performance-sprint', state: { openHabit: running } } : { label: 'Plan it into this week', to: '/performance-sprint' },
      how: [
        `Compared ${times(inGroup, 'week', 'weeks')} with “${habit}” kept with ${times(outGroup, 'week', 'weeks')} without.`,
        `“${strategy}” was worked out without “${habit}”, so the habit’s own score isn’t counted.`,
        card.values ? `Average ${pct(card.values[0])} against ${pct(card.values[1])}.` : null,
        trend(card.gap),
        swingWords(card.gap, card.swing, 'Strategy score', true),
        chance,
        held,
      ].filter(Boolean),
    };
  }
  if (card.id === 'L4' || card.id === 'L5') {
    const when = card.id === 'L4'
      ? 'In weeks your stress was “Not at all” or “A little”'
      : 'In weeks you rated how you wanted to be 7 or more on average';
    return {
      ...base,
      line: `${when}, your performance score was ${points(card.gap)} higher.`,
      question: card.id === 'L4' ? 'What keeps your stress low in those weeks?' : 'What helps you be that way?',
      action: card.id === 'L4' ? { label: 'Plan some recovery', to: '/personal/reset' } : { label: 'Start my daily plan', to: '/daily-plan' },
      how: [
        card.id === 'L4'
          ? `Compared ${times(inGroup, 'week', 'weeks')} when your stress was “Not at all” or “A little” with ${times(outGroup, 'week', 'weeks')} when it was more.`
          : `Compared ${times(inGroup, 'week', 'weeks')} when you averaged 7 or more with ${times(outGroup, 'week', 'weeks')} when you averaged less.`,
        card.values ? `Average ${pct(card.values[0])} against ${pct(card.values[1])}.` : null,
        trend(card.gap),
        swingWords(card.gap, card.swing, 'performance score', true),
        'Both are from the same weeks, so this one had to reach a Strong link to show.',
        chance,
        held,
      ].filter(Boolean),
    };
  }
  if (card.id === 'L6') {
    const [sid, oid] = String(card.subject || '').split(':');
    const strategy = names.strategies?.[sid] || 'this Strategy';
    const o = names.objectives?.[oid] || { name: 'its Outcome Objective' };
    const fall = o.direction === 'down';
    const amount = plainNumber(Math.round(Math.abs(card.gap) * 10) / 10);
    const unit = o.unit && !/^[£$€%]/.test(o.unit) ? ` ${o.unit}` : '';
    const moved = (v) => plainNumber(Math.round(v * 10) / 10);
    return {
      ...base,
      line: `In the weeks after “${strategy}” was at your standard, “${o.name}” ${fall ? 'fell' : 'rose'} by ${amount}${unit} more, 2 to 4 weeks later.`,
      question: `What happens in the weeks you keep “${strategy}” up?`,
      action: { label: `Plan “${strategy}” into this week`, to: '/performance-sprint', state: { addTodoFor: sid } },
      how: [
        `Compared ${times(inGroup, 'week', 'weeks')} when “${strategy}” was at your standard with ${times(outGroup, 'week', 'weeks')} when it was below.`,
        `For each, the change in “${o.name}” from 2 to 4 weeks later was measured.`,
        card.values ? `It ${fall ? 'fell' : 'rose'} by ${moved(Math.abs(card.values[0]))} on average, against ${moved(Math.abs(card.values[1]))} after other weeks.` : null,
        chance,
        held,
      ].filter(Boolean),
    };
  }
  return { ...base, line: '', question: '', action: null, how: [chance, held] };
}

/** The dashboard's patterns row (What's behind your performance), or null when it shouldn't show. */
export function patternsRow(state, today, names) {
  const cards = shownCards(state, today).map((c) => patternCardWords(c, names));
  if (cards.length) {
    return {
      key: 'pat',
      title: 'Patterns in your numbers',
      line: `${cards.length === 1 ? '1 pattern has' : `${cards.length} patterns have`} been found in your own numbers.`,
      figure: { text: String(cards.length) },
      cards,
      lead: 'Patterns in your own numbers show what happened together, and you work out why.',
    };
  }
  // A card found but not yet introduced by the debrief (rule 17): nothing
  // shows until then, rather than a "No clear link yet" that isn't true.
  if (state.cards.some((c) => !state.hidden.includes(c.key))) return null;
  // Rule 21: once there is enough data to check, "No clear link yet" is an honest answer.
  if (state.week && state.evaluated > 0) {
    return {
      key: 'pat',
      title: 'Patterns in your numbers',
      line: 'No clear link yet.',
      figure: null,
      cards: [],
      lead: 'Patterns in your own numbers show what happened together, and you work out why.',
      empty: [
        'No clear link yet.',
        'A card only shows when a link is strong enough that it’s very unlikely to be chance.',
        'Your numbers are checked again every week.',
      ],
    };
  }
  return null;
}
