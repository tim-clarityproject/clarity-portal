// Home as Today (mock-up M2, approved by Tim on 23 Oct; Phase 4 step 2),
// worked out in one place. Pure code: no database, no React, no device
// clock (the day, hour and minute are passed in), tested in
// tests/performance/home.test.mjs.
//
// Home shows today: one suggestion that changes through the day, today's
// to-dos and habits logged right there, one line for the week, and help
// behind one button. The moments come from the decisions ("Home's moments
// of the day"): morning until 12:00 (Plan my day stays the suggestion
// until it is done or noon), afternoon until 17:00, evening from 17:00
// (Review my day); on debrief days the debrief takes over from 12:00
// (mornings stay Plan my day, experience rule 17). Sleep wind down is
// offered from 21:00 on the person's own clock until 03:00, or until it is
// used or dismissed (M19). Every figure comes from src/lib/scores through
// the sprint page's own view (sprintPageView), never from here.

import { daysBetween } from '../scores/dates.js';
import { m0DebriefWindow } from '../scores/index.js';
import { addDayKey } from './dayPlan';
import { REVIEW_EARLY_HOURS, isDailyHabit } from './dayReview';
import { recoveryEndOn, settingForWeek, toMeasure } from './rows';
import { dayName } from './sprintPage';

/**
 * A gap (decided for Phase 4): 7 days in a row with nothing logged,
 * planned or reviewed. The first visit after one says "Good to see you."
 * (experience rule 18), with no catching up on missed days.
 */
export const GAP_DAYS = 7;

export const AFTERNOON_FROM = 12;
export const EVENING_FROM = 17;
/** Sleep wind down: offered from this time on the person's own clock (M19), until 03:00. */
export const WIND_DOWN_FROM = '21:00';
export const WIND_DOWN_UNTIL_HOUR = 3;
/** Where Sleep wind down opens. Its page is built in Phase 4 step 6. */
export const WIND_DOWN_ROUTE = '/sleep-wind-down';

// How long each takes (rule 27: "~4 minutes"), as M2 and M19 give them.
export const TIMES = {
  planMyDay: '~4 minutes',
  reviewMyDay: '~5 minutes',
  debrief: '~5 minutes',
  windDown: '~6 minutes',
};

/** "Good morning", "Good afternoon" or "Good evening" (M2: evening from 17:00; still the evening after midnight). */
export function homeGreeting(hour) {
  if (hour < REVIEW_EARLY_HOURS) return 'Good evening';
  if (hour < AFTERNOON_FROM) return 'Good morning';
  if (hour < EVENING_FROM) return 'Good afternoon';
  return 'Good evening';
}

const minutesOf = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/**
 * The evening Sleep wind down is offered for, or null: from `from` (21:00
 * unless the person changes it; null or 'off' turns it off) until 03:00 the
 * next morning, on the person's own clock. After midnight it is still the
 * evening before.
 */
export function windDownEvening({ today, hour, minute = 0, from = WIND_DOWN_FROM }) {
  const start = from === 'off' ? null : minutesOf(from);
  if (start == null) return null;
  if (hour < WIND_DOWN_UNTIL_HOUR) return addDayKey(today, -1);
  return hour * 60 + minute >= start ? today : null;
}

/** The latest day before today with anything logged, planned or reviewed, or null. */
export function lastActiveBefore(dates = [], today) {
  return dates.filter((d) => d && d < today).sort().at(-1) || null;
}

/** Whether today is the first day back after a gap (GAP_DAYS empty days before today). */
export function isComingBack(lastBefore, today) {
  return Boolean(lastBefore) && daysBetween(lastBefore, today) > GAP_DAYS;
}

/**
 * The plan's four steps for someone new (M2 planSteps): My Mission,
 * Outcome Objectives, Strategies and Performance Sprint 1, each done,
 * next (the first not done) or not yet.
 */
export function planSteps({ mission = false, objectives = 0, strategies = 0, sprint = false }) {
  const steps = [
    { key: 'mission', name: 'My Mission', done: Boolean(mission) },
    { key: 'objectives', name: 'Outcome Objectives', done: objectives > 0 },
    { key: 'strategies', name: 'Strategies', done: strategies > 0 },
    { key: 'sprint', name: 'Performance Sprint 1', done: Boolean(sprint) },
  ];
  const next = steps.findIndex((s) => !s.done);
  return steps.map((s, i) => ({ ...s, state: s.done ? 'done' : i === next ? 'next' : 'later' }));
}

/**
 * Who Home is for today:
 *   'new'       no plan yet, or one still being built, and no sprint ever
 *   'planned'   a plan with no sprint running (none started yet, or between sprints)
 *   'sprint'    a sprint running (or starting later, or over and not reviewed)
 *   'recovery'  a Recovery open (M15: Home shrinks to the basics)
 */
export function homePerson({ sprintView, recovery, steps }) {
  if (recovery) return 'recovery';
  if (sprintView && sprintView.state !== 'none') return 'sprint';
  const stepsDone = steps.slice(0, 3).every((s) => s.done);
  return stepsDone ? 'planned' : 'new';
}

/**
 * The one suggestion for now (M2 sugCard, M19's wind-down card), or null
 * when there is nothing to suggest. A card: { key, label, question,
 * lines, time, action: { label, to | jump }, notTonight }.
 *
 * input:
 *   today, hour, minute    the person's own clock
 *   person                 homePerson()
 *   sprintView             sprintPageView() (or null)
 *   hasCoach               whether the person has a coach
 *   dayPlanned             today's Plan my day is finished
 *   reviewed               today's Review my day is finished
 *   yesterday              { planned, reviewed } (a review before 04:00 can be for the day before)
 *   windDown               { from, dismissed: [evening keys] }
 *   recovery               the open Recovery row, if any; recoveryNext: the next sprint's number
 */
export function homeSuggestion(input) {
  const { today, hour, minute = 0, person, sprintView: v, dayPlanned, reviewed, yesterday = {}, windDown = {}, recovery, nextSprint } = input;

  // Sleep wind down, from 21:00 until 03:00, even in Recovery (M19).
  const evening = windDownEvening({ today, hour, minute, from: windDown.from });
  if (evening && !(windDown.dismissed || []).includes(evening) && person !== 'new') {
    return {
      key: 'wind-down',
      label: 'Sleep wind down',
      question: 'Ready to wind down?',
      lines: ['Write down what’s on your mind for tomorrow, then breathe slowly.'],
      time: TIMES.windDown,
      action: { label: 'Start my wind down', to: WIND_DOWN_ROUTE },
      notTonight: evening,
    };
  }

  if (person === 'new') {
    return input.hasCoach
      // The coaching client's First check-in card needs Phase 6a's check-in; until then, no card.
      ? null
      : {
        key: 'build',
        question: 'Ready to build your plan?',
        lines: ['It goes one step at a time.', 'You can stop and carry on later.'],
        action: { label: 'Build my plan', to: '/performance-plan/build' },
      };
  }

  if (person === 'recovery') {
    if (recovery && recoveryEndOn(recovery) <= today) {
      return {
        key: 'recovery-end',
        question: 'How are you feeling?',
        lines: ['Your recovery time is up.'],
        action: { label: 'Start my check-in', to: '/recovery/check-in' },
      };
    }
    // Between sprints (M2 "Recovery week"): the next sprint, when ready.
    // Plan my day and Review my day aren't suggested in Recovery.
    if (!v || v.state === 'none') {
      const name = `Performance Sprint ${nextSprint || 1}`;
      return {
        key: 'next-sprint',
        question: `Ready for ${name}?`,
        lines: ['This is your Recovery week, so nothing is tracked.'],
        action: { label: `Plan ${name}`, to: '/performance-sprint/start' },
      };
    }
    return null;
  }

  if (person === 'planned') {
    return {
      key: 'start-sprint',
      question: 'Ready to start a Performance Sprint?',
      lines: [],
      action: { label: 'Start a sprint', to: '/performance-sprint/start' },
    };
  }

  // A sprint whose last week has passed, not reviewed yet (R5): what comes next.
  if (v?.state === 'over') {
    return {
      key: 'next',
      question: 'Ready for what comes next?',
      lines: [`${v.name} ended on ${v.endedOn}.`, 'Go straight into the next sprint, or take a Recovery week first.'],
      action: { label: 'Plan what’s next', to: '/performance-sprint/review' },
    };
  }

  const running = v?.state === 'running';
  // Before 04:00: yesterday's review, if yesterday was planned and not reviewed (dayReview.js reviewDayFor).
  if (hour < REVIEW_EARLY_HOURS) {
    if (yesterday.planned && !yesterday.reviewed) return reviewCard();
    return null;
  }

  if (hour < AFTERNOON_FROM) {
    if (!dayPlanned) {
      return { key: 'plan', question: 'Ready to plan your day?', lines: [], time: TIMES.planMyDay, action: { label: 'Plan my day', to: '/my-day/plan' } };
    }
    return running ? todaySoFar() : null;
  }

  // From 12:00 on debrief days, the debrief takes over until it is done.
  if (running && v.debrief) {
    const week = v.calendar?.weeks?.[v.debrief.week - 1];
    const window = week ? m0DebriefWindow(week, today) : null;
    return {
      key: 'debrief',
      question: 'How did this week go?',
      lines: window ? [`Your debrief is open until ${dayName(window.closesOn, today)}.`] : [],
      time: TIMES.debrief,
      action: { label: 'Start my debrief', to: '/performance-sprint/debrief' },
    };
  }
  // The last week of the sprint, from 12:00: what comes next.
  if (running && v.current === v.lengthWeeks) {
    return {
      key: 'next',
      question: 'Ready for what comes next?',
      lines: [`${v.name} ends on ${dayName(v.dates.end, today)}.`, 'Go straight into the next sprint, or take a Recovery week first.'],
      action: { label: 'Plan what’s next', to: '/performance-sprint/review' },
    };
  }

  if (hour < EVENING_FROM) return running ? todaySoFar() : null;
  if (!reviewed) return reviewCard();
  return null;

  function reviewCard() {
    return { key: 'review', question: 'Ready to review your day?', lines: [], time: TIMES.reviewMyDay, action: { label: 'Review my day', to: '/my-day/review' } };
  }
  // M2 afternoon. UNDEFINED: "2 of 3 to-dos done so far." is a count the
  // methods don't define, so the card leaves it out (the to-dos show their ticks).
  function todaySoFar() {
    return {
      key: 'today',
      question: 'How is today going?',
      lines: [`Your review is suggested from ${String(EVENING_FROM).padStart(2, '0')}:00.`],
      action: { label: 'Log today', jump: 'log-today' },
    };
  }
}

/**
 * The quiet lines under the card (M2 qlines): at most two, in M2's order.
 * Only those with data today show: a note from the coach, the coaching
 * session tomorrow, the First check-in, the agreement and the monthly
 * check-in wait for Phase 6a. "Ready to add your mission?" shows once,
 * two weeks after someone without a coach joined, until Not now.
 */
export function quietLines({ person, hasCoach, mission, joinedDaysAgo = 0, dismissed = [] }) {
  const out = [];
  if (person === 'new' && !hasCoach && !mission && joinedDaysAgo >= 14) {
    out.push({ key: 'mission', lines: ['Ready to add your mission?'], action: { label: 'Add my mission', to: '/performance-plan/build' }, dismissable: true });
  }
  return out.filter((q) => !dismissed.includes(q.key)).slice(0, 2);
}

/**
 * Today's to-dos (M2 Today): the day's picks from Plan my day, the
 * highest priority first, each with its tick from the sprint's own rows.
 * picks: dayPicks().picks in order; top: the highest priority's key.
 */
export function todayItems({ picks = [], top = null, sprintView, todos = [], strategies = [] }) {
  const byTodo = new Map(todos.filter((t) => !t.deleted_at).map((t) => [t.id, t]));
  const names = new Map(strategies.map((s) => [s.id, s.name]));
  const habits = new Map((sprintView?.habits || []).map((h) => [h.id, h]));
  const ordered = [...picks].sort((a, b) => (b === top) - (a === top));
  const out = [];
  for (const key of ordered) {
    const [kind, id] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
    if (kind === 'todo') {
      const t = byTodo.get(id);
      if (!t) continue;
      out.push({ key, kind, id, text: t.text, strategyName: names.get(t.strategy_id) || '', done: Boolean(t.done_on), top: key === top, row: t });
    } else if (kind === 'habit') {
      const h = habits.get(id);
      if (!h) continue;
      const met = h.bar >= 1;
      out.push({ key, kind, id, text: h.name, strategyName: h.strategyName, done: met, top: key === top, habit: h, line: h.weekLine });
    }
  }
  return out;
}

/** The day plan's Strategies by name (M2 "Today's Strategy"). */
export function dayStrategyNames(dayStrategies = [], strategies = []) {
  const names = new Map(strategies.map((s) => [s.id, s.name]));
  return dayStrategies.map((s) => names.get(s.strategy_id)).filter(Boolean);
}

/**
 * Log today's rows (M2): the daily habits on Home, the weekly ones folded
 * into one This week line. `d` is the sprint page's rows.
 */
export function splitHabits(d, sprintView) {
  const daily = [];
  const weekly = [];
  if (sprintView?.state !== 'running') return { daily, weekly };
  for (const h of sprintView.habits) {
    const setting = settingForWeek(d.sprintSettings || [], h.id, sprintView.current);
    (setting && isDailyHabit(toMeasure(setting)) ? daily : weekly).push(h);
  }
  return { daily, weekly };
}

/** "5 weekly habits, 1 done" (M2's folded This week line); done is a habit at its full M1 score. */
export function weeklyFoldLine(weekly = []) {
  const done = weekly.filter((h) => h.bar >= 1).length;
  return `${weekly.length} weekly habit${weekly.length === 1 ? '' : 's'}, ${done} done`;
}
