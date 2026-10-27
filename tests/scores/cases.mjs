// The shared cases for the scores coaches, sponsors and leaders see (methods
// M5, M6, M9, M18, M19, and M0.4's sprint calendar that M5 rests on). The
// JavaScript library is tested on them (scores.test.mjs), and the database
// copies are tested on exactly the same inputs and answers
// (tests/scores/make-db-test.mjs writes supabase/032_scores_in_database_test.sql
// from this file). Change a case here and both sides are checked again.
//
// `expect` holds exact figures (to 6 decimal places) and the shown ones.

const W1 = ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25'];
const MON_FRI = W1.slice(0, 5);
const WEEKS = [
  { number: 1, start: '2026-10-19', end: '2026-10-25' },
  { number: 2, start: '2026-10-26', end: '2026-11-01' },
  { number: 3, start: '2026-11-02', end: '2026-11-08' },
];
const week1 = { number: 1, start: '2026-10-19', end: '2026-10-25', days: W1 };
const base = { week: week1, weeks: WEEKS, workingDays: MON_FRI, soFarUntil: null, strategies: [], habits: [], logs: [], todos: [], wins: [] };
const logs = (habitId, values) => Object.entries(values).map(([date, value]) => ({ habitId, date, value }));

// ------------------------------------------------------------------ M5
export const M5_CASES = [
  {
    id: 'M5-1',
    note: 'The worked example: Sam, Monday to Friday, standard 85.',
    input: {
      ...base,
      strategies: [{ id: 'grow', served: 2 }, { id: 'energy', served: 1 }, { id: 'craft', served: 1 }],
      habits: [
        { id: 'referrals', strategyId: 'grow', impact: 3, measure: 'count', target: 3, targetPer: 'week' },
        { id: 'training', strategyId: 'energy', impact: 3, measure: 'count', target: 3, targetPer: 'week' },
        { id: 'late', strategyId: 'energy', impact: 2, measure: 'yes_no_days_limit', limit: 2 },
        { id: 'reading', strategyId: 'craft', impact: 1, measure: 'amount', target: 20, targetPer: 'day' },
      ],
      logs: [
        ...logs('referrals', { '2026-10-19': 1, '2026-10-21': 1 }),
        ...logs('training', { '2026-10-19': 1, '2026-10-21': 1, '2026-10-23': 1 }),
        ...logs('late', { '2026-10-19': 1, '2026-10-20': 1, '2026-10-21': 1, '2026-10-22': 0, '2026-10-23': 0 }),
        ...logs('reading', { '2026-10-19': 30, '2026-10-20': 30, '2026-10-21': 30, '2026-10-22': 30 }),
      ],
      todos: [
        { id: 'email', strategyId: 'grow', impact: 2, createdOn: '2026-10-18', plannedWeek: 1, moves: [], doneOn: '2026-10-20' },
        { id: 'record', strategyId: 'craft', impact: 3, createdOn: '2026-10-18', plannedWeek: 1, moves: [], doneOn: null },
      ],
      wins: [{ id: 'win1', date: '2026-10-22', impact: 1, strategyIds: ['grow'] }],
    },
    expect: { score: 67.916667, shown: 68, strategies: { grow: 83.333333, energy: 80, craft: 25 } },
  },
  {
    id: 'M5-empty',
    note: 'Nothing planned at all: no score ("Nothing planned this week").',
    input: { ...base, strategies: [{ id: 'grow', served: 1 }] },
    expect: { score: null, shown: null, strategies: { grow: null } },
  },
  {
    id: 'M5-serves-none',
    note: 'A Strategy serving no objective yet still counts once.',
    input: {
      ...base,
      strategies: [{ id: 'a', served: 0 }, { id: 'b', served: 3 }],
      todos: [
        { id: 't1', strategyId: 'a', impact: 2, createdOn: '2026-10-18', plannedWeek: 1, moves: [], doneOn: '2026-10-19' },
        { id: 't2', strategyId: 'b', impact: 2, createdOn: '2026-10-18', plannedWeek: 1, moves: [], doneOn: null },
      ],
    },
    expect: { score: 25, shown: 25, strategies: { a: 100, b: 0 } },
  },
  {
    id: 'M5-so-far',
    note: 'So far on Tuesday: a 5-a-week count is pro rata (2 of 5 working days gone), and an open to-do is not counted yet.',
    input: {
      ...base,
      soFarUntil: '2026-10-20',
      strategies: [{ id: 's', served: 1 }],
      habits: [{ id: 'h', strategyId: 's', impact: 2, measure: 'count', target: 5, targetPer: 'week' }],
      logs: logs('h', { '2026-10-19': 1, '2026-10-20': 1, '2026-10-22': 1 }),
      todos: [{ id: 'open', strategyId: 's', impact: 3, createdOn: '2026-10-18', plannedWeek: 1, moves: [], doneOn: null }],
    },
    expect: { score: 100, shown: 100, strategies: { s: 100 } },
  },
  {
    id: 'M5-so-far-later-todo',
    note: 'So far on Tuesday: a to-do done on Thursday isn\'t done yet, as habits and wins after the day aren\'t counted.',
    input: {
      ...base,
      soFarUntil: '2026-10-20',
      strategies: [{ id: 's', served: 1 }],
      habits: [{ id: 'h', strategyId: 's', impact: 2, measure: 'count', target: 5, targetPer: 'week' }],
      logs: logs('h', { '2026-10-22': 3 }),
      todos: [{ id: 'later', strategyId: 's', impact: 3, createdOn: '2026-10-18', plannedWeek: 1, moves: [], doneOn: '2026-10-22' }],
    },
    expect: { score: 0, shown: 0, strategies: { s: 0 } },
  },
  {
    id: 'M5-unusable-values',
    note: 'A value that isn\'t a number of 0 or more is left out, so no score goes outside 0 to 100.',
    input: {
      ...base,
      strategies: [{ id: 's', served: 1 }],
      habits: [{ id: 'h', strategyId: 's', impact: 2, measure: 'count', target: 3, targetPer: 'week' }],
      logs: [...logs('h', { '2026-10-19': 1, '2026-10-20': -5 }), { habitId: 'h', date: '2026-10-21', value: 'abc' }],
    },
    expect: { score: 33.333333, shown: 33, strategies: { s: 33.333333 } },
  },
  {
    id: 'M5-so-far-weekly-yes-no',
    note: 'So far, a weekly yes or no not done yet is left out; done, it counts 100.',
    input: {
      ...base,
      soFarUntil: '2026-10-21',
      strategies: [{ id: 's', served: 1 }],
      habits: [
        { id: 'block', strategyId: 's', impact: 2, measure: 'yes_no_weekly' },
        { id: 'walk', strategyId: 's', impact: 2, measure: 'yes_no_days_target', target: 4 },
      ],
      logs: logs('walk', { '2026-10-19': 1, '2026-10-20': 0, '2026-10-21': 1 }),
    },
    // walk: 2 yes days against 4 × 3/5 = 2.4 → 83.33
    expect: { score: 83.333333, shown: 83, strategies: { s: 83.333333 } },
  },
  {
    id: 'M5-days-off',
    note: 'Mon to Thu worker: a log on Saturday counts towards the week\'s total; the daily target uses 4 working days.',
    input: {
      ...base,
      workingDays: W1.slice(0, 4),
      strategies: [{ id: 's', served: 1 }],
      habits: [{ id: 'h', strategyId: 's', impact: 2, measure: 'amount', target: 10, targetPer: 'day' }],
      logs: logs('h', { '2026-10-19': 10, '2026-10-20': 10, '2026-10-24': 10 }),
    },
    expect: { score: 75, shown: 75, strategies: { s: 75 } },
  },
  {
    id: 'M5-not-logged',
    note: 'A limit with only 2 of 5 working days logged scores 0 ("Not logged"); a rating with 3 of 5 is scored.',
    input: {
      ...base,
      strategies: [{ id: 's', served: 1 }],
      habits: [
        { id: 'coffee', strategyId: 's', impact: 2, measure: 'count_limit', limit: 2, limitPer: 'day' },
        { id: 'focus', strategyId: 's', impact: 2, measure: 'rating', target: 4, direction: 'higher' },
      ],
      logs: [
        ...logs('coffee', { '2026-10-19': 1, '2026-10-20': 1 }),
        ...logs('focus', { '2026-10-19': 3, '2026-10-20': 3, '2026-10-21': 3 }),
      ],
    },
    // coffee 0 (not logged); focus (3 − 1) ÷ (4 − 1) = 66.67
    expect: { score: 33.333333, shown: 33, strategies: { s: 33.333333 } },
  },
  {
    id: 'M5-limit-zero',
    note: 'A limit of 0: none is 100, one over is 0.',
    input: {
      ...base,
      strategies: [{ id: 'a', served: 1 }, { id: 'b', served: 1 }],
      habits: [
        { id: 'none', strategyId: 'a', impact: 2, measure: 'yes_no_days_limit', limit: 0 },
        { id: 'one', strategyId: 'b', impact: 2, measure: 'yes_no_days_limit', limit: 0 },
      ],
      logs: [
        ...logs('none', { '2026-10-19': 0, '2026-10-20': 0, '2026-10-21': 0 }),
        ...logs('one', { '2026-10-19': 1, '2026-10-20': 0, '2026-10-21': 0 }),
      ],
    },
    expect: { score: 50, shown: 50, strategies: { a: 100, b: 0 } },
  },
  {
    id: 'M5-rating-lower',
    note: 'Lower is better (pressure): target 2, average 3 scores 66.67; an entry still to confirm is left out.',
    input: {
      ...base,
      strategies: [{ id: 's', served: 1 }],
      habits: [{ id: 'p', strategyId: 's', impact: 2, measure: 'rating', target: 2, direction: 'lower' }],
      logs: [
        ...logs('p', { '2026-10-19': 3, '2026-10-20': 3, '2026-10-21': 3 }),
        { habitId: 'p', date: '2026-10-22', value: 5, toConfirm: true },
      ],
    },
    expect: { score: 66.666667, shown: 67, strategies: { s: 66.666667 } },
  },
  {
    id: 'M5-todo-rules',
    note: 'Week 2: moved in before it started (counts), moved out after it started (0), rolled over from week 1 (0), done early from week 3 (100), done in week 1 (not counted), moved out before it started (not counted).',
    input: {
      ...base,
      week: { number: 2, start: '2026-10-26', end: '2026-11-01', days: ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01'] },
      workingDays: ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30'],
      strategies: [{ id: 's', served: 1 }],
      todos: [
        { id: 'in-before', strategyId: 's', impact: 1, createdOn: '2026-10-19', plannedWeek: 3, moves: [{ on: '2026-10-25', toWeek: 2 }], doneOn: '2026-10-27' },
        { id: 'out-after', strategyId: 's', impact: 1, createdOn: '2026-10-19', plannedWeek: 2, moves: [{ on: '2026-10-26', toWeek: 3 }], doneOn: null },
        { id: 'rolled', strategyId: 's', impact: 1, createdOn: '2026-10-19', plannedWeek: 1, moves: [], doneOn: null },
        { id: 'early', strategyId: 's', impact: 1, createdOn: '2026-10-19', plannedWeek: 3, moves: [], doneOn: '2026-10-28' },
        { id: 'done-w1', strategyId: 's', impact: 1, createdOn: '2026-10-19', plannedWeek: 2, moves: [], doneOn: '2026-10-21' },
        { id: 'out-before', strategyId: 's', impact: 1, createdOn: '2026-10-19', plannedWeek: 2, moves: [{ on: '2026-10-24', toWeek: 3 }], doneOn: null },
      ],
    },
    // in-before 100, out-after 0, rolled 0, early 100 → 50
    expect: { score: 50, shown: 50, strategies: { s: 50 } },
  },
  {
    id: 'M5-wins-several',
    note: 'A win counts as done in each Strategy picked, and never lifts one above 100.',
    input: {
      ...base,
      strategies: [{ id: 'a', served: 1 }, { id: 'b', served: 1 }],
      todos: [
        { id: 't', strategyId: 'a', impact: 3, createdOn: '2026-10-18', plannedWeek: 1, moves: [], doneOn: null },
        { id: 'u', strategyId: 'b', impact: 2, createdOn: '2026-10-18', plannedWeek: 1, moves: [], doneOn: '2026-10-20' },
      ],
      wins: [{ id: 'w', date: '2026-10-21', impact: 3, strategyIds: ['a', 'b', 'a'] }],
    },
    // a: (3×0 + 3×100) ÷ 6 = 50; b: (2×100 + 3×100) ÷ 5 = 100
    expect: { score: 75, shown: 75, strategies: { a: 50, b: 100 } },
  },
  {
    id: 'M5-half-rounds-up',
    note: 'An exact half shows rounded up (M0.1): 84.5 shows as 85.',
    input: {
      ...base,
      strategies: [{ id: 's', served: 1 }],
      habits: [{ id: 'h', strategyId: 's', impact: 2, measure: 'amount', target: 200, targetPer: 'week' }],
      logs: logs('h', { '2026-10-19': 169 }),
    },
    expect: { score: 84.5, shown: 85, strategies: { s: 84.5 } },
  },
];

// ------------------------------------------------------------------ M0.4 calendar
export const CALENDAR_CASES = [
  {
    id: 'M0.4-recovery',
    note: 'A 2-week sprint from Thursday 1 Oct 2026, with Recovery from Tue 6 Oct until "ready" on Fri 9 Oct: week 1 carries on afterwards, and the end moves 3 days later.',
    input: { sprint: { start: '2026-10-01', lengthWeeks: 2, recoveries: [{ start: '2026-10-06', end: '2026-10-09' }] }, today: '2026-10-30' },
    expect: {
      weeks: [
        { number: 1, start: '2026-10-01', end: '2026-10-10', recoveryDaysInside: 3, finished: true },
        { number: 2, start: '2026-10-11', end: '2026-10-17', recoveryDaysInside: 0, finished: true },
      ],
      plannedEnd: '2026-10-14',
      actualEnd: '2026-10-17',
    },
  },
  {
    id: 'M0.4-open-recovery',
    note: 'A Recovery still running: weeks after it are not known yet, and nor is the end.',
    input: { sprint: { start: '2026-10-01', lengthWeeks: 2, recoveries: [{ start: '2026-10-05', end: null }] }, today: '2026-10-12' },
    expect: {
      weeks: [{ number: 1, start: '2026-10-01', end: '2026-10-04', recoveryDaysInside: 0, finished: false }],
      plannedEnd: '2026-10-14',
      actualEnd: null,
    },
  },
];

// ------------------------------------------------------------------ M6
export const M6_CASES = [
  {
    id: 'M6-basic',
    note: 'Average of finished weeks, weeks at the standard judged on the shown figure (84.5 shows 85), best week tie goes to the most recent, change from rounded figures.',
    input: {
      weeks: [
        { number: 1, score: 70, finished: true },
        { number: 2, score: 84.5, finished: true },
        { number: 3, score: 90.2, finished: true },
        { number: 4, score: 89.6, finished: true },
        { number: 5, score: null, finished: true },
        { number: 6, score: 99, finished: false },
      ],
      standard: 85,
      previousAverage: 80.4,
    },
    expect: { average: 83.575, shown: 84, finishedWeeks: 4, weeksAtStandard: 3, best: { number: 4, score: 89.6 }, change: 4 },
  },
  {
    id: 'M6-none',
    note: 'No finished weeks yet.',
    input: { weeks: [{ number: 1, score: 50, finished: false }], standard: 85, previousAverage: null },
    expect: { average: null, shown: null, finishedWeeks: 0, weeksAtStandard: 0, best: null, change: null },
  },
];

// ------------------------------------------------------------------ M9
const fig = (on, value) => ({ on, value });
export const M9_CASES = [
  {
    id: 'M9-1',
    note: 'The worked example: start 20 on 1 Jan 2026, target 38 by 30 Jun 2027, current 31 on 26 Oct 2026. On pace.',
    input: {
      objective: { kind: 'number', direction: 'up', start: 20, startOn: '2026-01-01', target: 38, byWhen: '2027-06-30', figures: [fig('2026-10-26', 31)] },
      asOf: '2026-10-26',
      sprintStart: '2026-10-01',
    },
    expect: { status: 'on_track', onPace: true, rateSoFar: 1.123624, rateNeeded: 0.862672, progress: 81.578947, reached: false, improving: true, notMoving: false },
  },
  {
    id: 'M9-down',
    note: 'Should go down (incidents): start 20, target 5; 18 after 3 months, 9 months left. Off pace; the bar shows progress from the start towards the target.',
    input: {
      objective: { kind: 'number', direction: 'down', start: 20, startOn: '2026-01-01', target: 5, byWhen: '2026-12-31', figures: [fig('2026-02-01', 19), fig('2026-04-01', 18)] },
      asOf: '2026-04-01',
      sprintStart: '2026-03-15',
    },
    expect: { status: 'off_track', onPace: false, rateSoFar: 0.676444, rateNeeded: 1.444234, progress: 13.333333, reached: false, improving: true, notMoving: false },
  },
  {
    id: 'M9-down-on-pace',
    note: 'Should go down and is falling fast enough.',
    input: {
      objective: { kind: 'number', direction: 'down', start: 20, startOn: '2026-01-01', target: 5, byWhen: '2026-12-31', figures: [fig('2026-04-01', 8)] },
      asOf: '2026-04-01',
      sprintStart: '2026-03-15',
    },
    expect: { status: 'on_track', onPace: true, rateSoFar: 4.058667, rateNeeded: 0.333285, progress: 80, reached: false, improving: true, notMoving: false },
  },
  {
    id: 'M9-too-early',
    note: 'Set less than 3 finished weeks ago: too early to tell, and pace isn\'t shown.',
    input: {
      objective: { kind: 'rating', start: 5, startOn: '2026-10-12', target: 9, byWhen: '2027-06-30', figures: [] },
      asOf: '2026-10-26',
      sprintStart: '2026-10-12',
    },
    expect: { status: 'too_early', onPace: false, rateSoFar: 0, rateNeeded: 0.492955, progress: 55.555556, reached: false, improving: false, notMoving: false },
  },
  {
    id: 'M9-reached',
    note: 'At or past the target: reached.',
    input: {
      objective: { kind: 'rating', start: 5, startOn: '2026-01-01', target: 8, byWhen: '2027-06-30', figures: [fig('2026-09-01', 8)] },
      asOf: '2026-10-26',
      sprintStart: '2026-10-01',
    },
    expect: { status: 'reached', onPace: true, rateSoFar: 0.306443, rateNeeded: 0, progress: 100, reached: true, improving: false, notMoving: false },
  },
  {
    id: 'M9-not-moving',
    note: 'No change for 3 finished weeks: not moving (and off pace).',
    input: {
      objective: { kind: 'number', direction: 'up', start: 10, startOn: '2026-06-01', target: 20, byWhen: '2027-06-01', figures: [fig('2026-07-01', 12), fig('2026-09-20', 12), fig('2026-10-05', 12)] },
      asOf: '2026-10-26',
      sprintStart: '2026-10-01',
    },
    expect: { status: 'off_track', onPace: false, rateSoFar: 0.41415, rateNeeded: 1.117064, progress: 60, reached: false, improving: false, notMoving: true },
  },
  {
    id: 'M9-overdue',
    note: 'Past its date and not reached: off track.',
    input: {
      objective: { kind: 'number', direction: 'up', start: 10, startOn: '2026-01-01', target: 20, byWhen: '2026-09-30', figures: [fig('2026-09-01', 15)] },
      asOf: '2026-10-26',
      sprintStart: '2026-10-01',
    },
    expect: { status: 'off_track', onPace: false, rateSoFar: 0.510738, rateNeeded: null, progress: 75, reached: false, improving: false, notMoving: true },
  },
  {
    id: 'M9-milestone-due',
    note: 'A milestone not yet due is on track; once past due and not reached, off track.',
    input: { objective: { kind: 'milestone', startOn: '2026-01-01', dueOn: '2026-12-01', reachedOn: null }, asOf: '2026-10-26' },
    expect: { status: 'on_track', onTrack: true, reached: false },
  },
  {
    id: 'M9-milestone-overdue',
    note: 'A milestone past due and not reached.',
    input: { objective: { kind: 'milestone', startOn: '2026-01-01', dueOn: '2026-10-23', reachedOn: null }, asOf: '2026-10-26' },
    expect: { status: 'off_track', onTrack: false, reached: false },
  },
  {
    id: 'M9-milestone-reached',
    note: 'A milestone reached.',
    input: { objective: { kind: 'milestone', startOn: '2026-01-01', dueOn: '2026-10-23', reachedOn: '2026-10-20' }, asOf: '2026-10-26' },
    expect: { status: 'reached', onTrack: true, reached: true },
  },
];

// ------------------------------------------------------------------ M18
export const M18_CASES = [
  {
    id: 'M18-1',
    note: 'Four answers from six: each measure is the average of its answers; change from the rounded figures; one named answer.',
    input: {
      wentTo: 6,
      previous: { energy: 50, sleep: 60.4, stress: 50, workload: 40, support: 80 },
      answers: [
        { energy: 'high', sleep: 'good', stress: 'sometimes', workload: 'often', support: 'always', comment: 'More focus time.' },
        { energy: 'ok', sleep: 'ok', stress: 'often', workload: 'sometimes', support: 'often', comment: '' },
        { energy: 'very_high', sleep: 'very_good', stress: 'rarely', workload: 'often', support: 'always', name: 'Ola' },
        { energy: 'low', sleep: 'poor', stress: 'always', workload: 'rarely', support: 'sometimes', comment: 'Fewer meetings.' },
      ],
    },
    expect: {
      answers: 4,
      measures: {
        energy: { figure: 62.5, answers: 4, change: 13 },
        sleep: { figure: 62.5, answers: 4, change: 3 },
        stress: { figure: 37.5, answers: 4, change: -12 },
        workload: { figure: 56.25, answers: 4, change: 16 },
        support: { figure: 81.25, answers: 4, change: 1 },
      },
      lowest: 'stress',
      named: 1,
      comments: 2,
    },
  },
  {
    id: 'M18-one',
    note: 'Totals show at any number of answers, even one.',
    input: { wentTo: 2, previous: null, answers: [{ energy: 'ok', sleep: 'ok', stress: 'never', workload: 'always', support: 'never' }] },
    expect: {
      answers: 1,
      measures: {
        energy: { figure: 50, answers: 1, change: null },
        sleep: { figure: 50, answers: 1, change: null },
        stress: { figure: 100, answers: 1, change: null },
        workload: { figure: 100, answers: 1, change: null },
        support: { figure: 0, answers: 1, change: null },
      },
      lowest: 'support',
      named: 0,
      comments: 0,
    },
  },
];

// ------------------------------------------------------------------ M19
const seat = (current, statuses, extra = {}) => ({
  current,
  hasPlan: true,
  sprintRunning: true,
  finishedSeatWeeks: 4,
  debriefsDone: 3,
  summary: { objectives: statuses.map((status) => ({ status })), strategies: [{ average: 80 }, { average: 90 }], averageScore: 86, standard: 85 },
  ...extra,
});
const many = (n, status) => Array.from({ length: n }, () => status);
export const M19_CASES = [
  {
    id: 'M19-1',
    note: 'The worked example: 40 objectives; 6 too early; of the other 34, 21 on track and 5 reached. Headline 26 ÷ 34 = 76%.',
    input: {
      seats: [
        seat(true, [...many(10, 'on_track'), ...many(2, 'reached'), ...many(2, 'too_early')]),
        seat(true, [...many(6, 'on_track'), ...many(2, 'reached'), ...many(3, 'off_track'), ...many(2, 'too_early')]),
        seat(true, [...many(5, 'on_track'), ...many(1, 'reached'), ...many(5, 'off_track'), ...many(2, 'too_early')]),
      ],
    },
    expect: { headline: 76.470588, shown: 76, counted: 34, tooEarly: 6, seats: 3, use: { plansInPlace: 100, sprintsRunning: 100, debriefsDone: 75 }, atOwnStandard: 100, averageStrategyScore: 85 },
  },
  {
    id: 'M19-two-seats',
    note: 'A group of 2 seats: objective and Strategy figures show; use figures and the share at their own standard don\'t.',
    input: { seats: [seat(true, ['on_track', 'off_track']), seat(true, ['reached'], { summary: { objectives: [{ status: 'reached' }], strategies: [{ average: 60 }], averageScore: 70, standard: 85 } })] },
    expect: { headline: 66.666667, shown: 67, counted: 3, tooEarly: 0, seats: 2, use: null, atOwnStandard: null, averageStrategyScore: 76.666667 },
  },
  {
    id: 'M19-leaver',
    note: 'Someone who has left still counts in the totals, anonymised, but not as a seat: 3 seats minus 1 leaver is a group of 2, so no use figures.',
    input: { seats: [seat(true, ['on_track']), seat(true, ['on_track']), seat(false, ['off_track'])] },
    expect: { headline: 66.666667, shown: 67, counted: 3, tooEarly: 0, seats: 2, use: null, atOwnStandard: null, averageStrategyScore: 85 },
  },
];
