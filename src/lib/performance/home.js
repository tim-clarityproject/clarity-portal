// Home as Today (mock-up M2, approved by Tim on 23 Oct; Phase 4 step 2),
// worked out in one place. Pure code: no database, no React, no device
// clock (the day, hour and minute are passed in), tested in
// tests/performance/home.test.mjs.
//
// Home shows today: one suggestion that changes through the day, today's
// to-dos and habits logged right there, one line for the week, and help
// behind one button. The moments come from the decisions ("Home's moments
// of the day"): morning until 12:00 (Daily plan stays the suggestion
// until it is done or noon), afternoon until 17:00, evening from 17:00
// (Daily review); on debrief days the debrief takes over from 12:00
// (mornings stay Daily plan, experience rule 17). Sleep wind down is
// offered from 21:00 on the person's own clock until 03:00, or until it is
// used or dismissed (M19). Every figure comes from src/lib/scores through
// the sprint page's own view (sprintPageView), never from here.

import { daysBetween } from '../scores/dates.js';
import { m0DebriefWindow } from '../scores/index.js';
import { addDayKey } from './dayPlan';
import { REVIEW_EARLY_HOURS, isDailyHabit } from './dayReview';
import { recoveryEndOn, settingForWeek, toMeasure } from './rows';
import { dayName } from './sprintPage';
import { TOOLS } from '../navigation';

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
// The same times as the tools' tiles (navigation.js), so Home's card and
// a tile never disagree (Tim, 10 Nov).
export const TIMES = {
  planMyDay: TOOLS.pmd.time,
  reviewMyDay: TOOLS.rmd.time,
  debrief: TOOLS.debrief.time,
  windDown: TOOLS.wind.time,
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

/**
 * "Not tonight" on Home's wind-down card hides it on every device for
 * that night (Tim, 9 and 10 Nov): the evenings are kept in the account,
 * in person_settings.page_preferences under this name (beside the menu's
 * pins; menuPins.js), as well as on the device that was tapped, so the
 * card goes at once, offline too.
 */
export const NOT_TONIGHT_PREF = 'wind_down_not_tonight';
const NOT_TONIGHT_KEPT = 14;
const isNight = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** The evenings saved as "Not tonight", cleaned (anything else saved there is ignored). */
export function notTonightNights(saved) {
  return Array.isArray(saved) ? [...new Set(saved.filter(isNight))].sort().slice(-NOT_TONIGHT_KEPT) : [];
}

/** The saved evenings with one more: the last two weeks only, each once. */
export function withNotTonight(saved, night) {
  // This evening always stays, whatever is saved: later dates (a device
  // with the wrong clock, or anything else written there) never push it out.
  const others = notTonightNights(saved).filter((n) => n !== night).slice(-(NOT_TONIGHT_KEPT - 1));
  return notTonightNights([...others, night]);
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
 * Home's three day states (Tim, 5 Nov: "Home follows what's been done, not
 * only the clock"):
 *   'not-planned'  Daily plan isn't done yet
 *   'planned'      today is planned and not yet reviewed
 *   'reviewed'     Daily review is finished (Close my day): "Your day's
 *                  done", at any time of day
 * From 04:00 (the review rule, REVIEW_EARLY_HOURS) a new day starts at
 * 'not-planned'; before 04:00 the day before's finished review still counts.
 */
export function dayState({ hour, dayPlanned, reviewed, yesterday = {} }) {
  if (reviewed || (hour < REVIEW_EARLY_HOURS && yesterday.reviewed)) return 'reviewed';
  return dayPlanned ? 'planned' : 'not-planned';
}

/** Tomorrow's priorities from a review's tomorrow list: typed ones only, three at most. */
export function tomorrowPriorities(list) {
  return (Array.isArray(list) ? list : []).map((t) => String(t || '').trim()).filter(Boolean).slice(0, 3);
}

/**
 * The one suggestion for now, taking turns (Tim, 5 Nov): Daily plan in the
 * morning, then anything timed that is due (the monthly check-in), then
 * Daily review in the evening. Anything timed queues for this one card and
 * is never a loose line under it; when it isn't its turn, Home doesn't
 * mention it. `checkin`: checkinPrompt() while one is due.
 */
export function homeSuggestion(input) {
  const card = suggestionInTurn(input);
  const c = input.checkin;
  // The check-in's turn: once the day is planned (or Daily plan's morning
  // has gone), in place of "How is today going?", or when nothing else is
  // suggested. A new coaching client's First review is already the card.
  // Never in the night: the check-in waits for the day to start at 04:00 (REVIEW_EARLY_HOURS).
  if (c && input.hour >= REVIEW_EARLY_HOURS && card?.key !== 'first-checkin' && (!card || card.key === 'today')) {
    return { key: c.key, question: c.question, lines: c.lines || [], time: c.time, action: c.action };
  }
  return card;
}

/**
 * The suggestion before anything timed takes its turn (M2 sugCard, M19's wind-down card), or null
 * when there is nothing to suggest. A card: { key, label, question,
 * lines, time, action: { label, to | jump }, notTonight }.
 *
 * input:
 *   today, hour, minute    the person's own clock
 *   person                 homePerson()
 *   sprintView             sprintPageView() (or null)
 *   hasCoach               whether the person has a coach
 *   dayPlanned             today's Daily plan is finished
 *   reviewed               today's Daily review is finished
 *   yesterday              { planned, reviewed } (a review before 04:00 can be for the day before)
 *   windDown               { from, dismissed: [evening keys] }
 *   recovery               the open Recovery row, if any; recoveryNext: the next sprint's number
 *   firstCheckin           checkinPrompt() when it's the First review (Phase 5), else null
 */
function suggestionInTurn(input) {
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
    if (input.hasCoach) {
      // A new coaching client: the First review first (M2 sugCard newc),
      // until it's finished (checkinPrompt in checkin.js).
      const c = input.firstCheckin;
      return c ? { key: 'first-checkin', question: c.question, lines: c.lines, time: c.time, action: c.action } : null;
    }
    return {
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
    // Daily plan and Daily review aren't suggested in Recovery.
    if (!v || v.state === 'none') {
      const name = 'your next Performance Sprint';
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
      lines: [`Your ${v.name} ended on ${v.endedOn}.`, 'Go straight into the next sprint, or take a Recovery week first.'],
      action: { label: 'Plan what’s next', to: '/performance-sprint/review' },
    };
  }

  const running = v?.state === 'running';
  // The day is reviewed or closed: "Your day's done", with tomorrow's
  // priorities from the review, waiting in tomorrow's Daily plan.
  if (dayState({ hour, dayPlanned, reviewed, yesterday }) === 'reviewed') {
    const priorities = tomorrowPriorities(input.tomorrow);
    return {
      key: 'done',
      label: 'Priorities for tomorrow',
      question: null,
      list: priorities,
      lines: priorities.length ? ['They’re waiting in tomorrow’s Daily plan.'] : ['Nothing is set for tomorrow yet.'],
      action: null,
      link: { label: 'Edit my review', to: input.reviewTo || '/daily-review' },
    };
  }
  // Before 04:00: yesterday's review, if yesterday was planned and not reviewed (dayReview.js reviewDayFor).
  if (hour < REVIEW_EARLY_HOURS) {
    if (yesterday.planned && !yesterday.reviewed) return reviewCard();
    return null;
  }

  if (hour < AFTERNOON_FROM) {
    if (!dayPlanned) {
      return { key: 'plan', question: 'Ready to plan your day?', lines: [], time: TIMES.planMyDay, action: { label: 'Start my daily plan', to: '/daily-plan' } };
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
      lines: [`Your ${v.name} ends on ${dayName(v.dates.end, today)}.`, 'Go straight into the next sprint, or take a Recovery week first.'],
      action: { label: 'Plan what’s next', to: '/performance-sprint/review' },
    };
  }

  if (hour < EVENING_FROM) return running ? todaySoFar() : null;
  if (!reviewed) return reviewCard();
  return null;

  function reviewCard() {
    return { key: 'review', question: 'Ready to review your day?', lines: [], time: TIMES.reviewMyDay, action: { label: 'Start my daily review', to: '/daily-review' } };
  }
  // M2 afternoon. UNDEFINED: "2 of 3 to-dos done so far." is a count the
  // methods don't define, so the card leaves it out (the to-dos show their ticks).
  function todaySoFar() {
    return {
      key: 'today',
      // The heading names what the one button does, with no line about a
      // time (5e rules 1 and 13; Tim's check of 10 Nov).
      question: 'Ready to log today?',
      lines: [],
      action: { label: 'Log today', jump: 'log-today' },
    };
  }
}

/**
 * The quiet lines under the card (M2 qlines): at most two: a note from the
 * coach, the coaching session tomorrow and the agreement to sign (Phase
 * 6a). Timed things (the check-ins) queue for the card instead
 * (homeSuggestion; Tim, 5 Nov).
 * "Ready to add your mission?" shows once, two weeks after someone
 * without a coach joined, until Not now.
 */
export function quietLines({ person, hasCoach, mission, joinedDaysAgo = 0, dismissed = [], checkin = null }) {
  const out = [];
  // The check-in is timed, so it waits for the one card (homeSuggestion),
  // never a quiet line (Tim, 5 Nov). `checkin` is kept for older callers.
  void checkin;
  if (person === 'new' && !hasCoach && !mission && joinedDaysAgo >= 14) {
    out.push({ key: 'mission', lines: ['Ready to add your Mission?'], action: { label: 'Add my Mission', to: '/performance-plan/build' }, dismissable: true });
  }
  return out.filter((q) => !dismissed.includes(q.key)).slice(0, 2);
}

/**
 * Today's to-dos (M2 Today): the day's picks from Daily plan, the
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
