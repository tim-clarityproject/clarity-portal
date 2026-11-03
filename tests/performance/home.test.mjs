// Home as Today (src/lib/performance/home.js, mock-up M2): the one
// suggestion through the day, Sleep wind down from 21:00 until 03:00, a gap
// of 7 days, the plan's steps for someone new, who Home is for, the quiet
// lines and today's to-dos. Run with npm run test:performance.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GAP_DAYS,
  dayStrategyNames,
  homeGreeting,
  homePerson,
  homeSuggestion,
  isComingBack,
  lastActiveBefore,
  planSteps,
  quietLines,
  todayItems,
  weeklyFoldLine,
  windDownEvening,
} from '../../src/lib/performance/index.js';

const TODAY = '2026-10-21'; // a Wednesday, week 3 of a sprint from Mon 5 Oct
const running = (over = {}) => ({
  state: 'running',
  name: 'Performance Sprint 1',
  current: 3,
  lengthWeeks: 8,
  debrief: null,
  dates: { start: '2026-10-05', end: '2026-11-29' },
  calendar: { weeks: [] },
  habits: [],
  ...over,
});
const base = (over = {}) => ({ today: TODAY, hour: 9, person: 'sprint', sprintView: running(), dayPlanned: false, reviewed: false, ...over });

test('the greeting follows the time of day, evening from 17:00 and still after midnight', () => {
  assert.equal(homeGreeting(1), 'Good evening');
  assert.equal(homeGreeting(4), 'Good morning');
  assert.equal(homeGreeting(11), 'Good morning');
  assert.equal(homeGreeting(12), 'Good afternoon');
  assert.equal(homeGreeting(16), 'Good afternoon');
  assert.equal(homeGreeting(17), 'Good evening');
});

test('morning: Plan my day until it is done or noon', () => {
  const c = homeSuggestion(base());
  assert.equal(c.key, 'plan');
  assert.equal(c.question, 'Ready to plan your day?');
  assert.equal(c.time, '~4 minutes');
  assert.equal(c.action.to, '/my-day/plan');
  assert.equal(homeSuggestion(base({ dayPlanned: true })).key, 'today');
});

test('afternoon: how today is going, with no to-do count (UNDEFINED)', () => {
  const c = homeSuggestion(base({ hour: 13, dayPlanned: true }));
  assert.equal(c.question, 'How is today going?');
  assert.deepEqual(c.lines, ['Your review is suggested from 17:00.']);
  assert.equal(c.action.jump, 'log-today');
  assert.equal(homeSuggestion(base({ hour: 16, minute: 59 })).key, 'today');
});

test('evening: Review my day from 17:00, nothing once it is done', () => {
  const c = homeSuggestion(base({ hour: 17 }));
  assert.equal(c.key, 'review');
  assert.equal(c.time, '~5 minutes');
  assert.equal(homeSuggestion(base({ hour: 20, reviewed: true })), null);
});

test('Sleep wind down from 21:00 until 03:00, and Not tonight', () => {
  const c = homeSuggestion(base({ hour: 21 }));
  assert.equal(c.key, 'wind-down');
  assert.equal(c.label, 'Sleep wind down');
  assert.equal(c.notTonight, TODAY);
  assert.equal(c.time, '~6 minutes');
  assert.equal(homeSuggestion(base({ hour: 20, minute: 59 })).key, 'review');
  // After midnight it is still the evening before.
  assert.equal(homeSuggestion(base({ hour: 2, minute: 30 })).notTonight, '2026-10-20');
  assert.equal(homeSuggestion(base({ hour: 3, yesterday: { planned: true, reviewed: false } })).key, 'review');
  assert.equal(homeSuggestion(base({ hour: 3 })), null);
  // Dismissed tonight: the review instead.
  assert.equal(homeSuggestion(base({ hour: 22, windDown: { dismissed: [TODAY] } })).key, 'review');
  // Offered in Recovery too, never to someone new.
  assert.equal(homeSuggestion(base({ hour: 22, person: 'recovery', sprintView: { state: 'paused' } })).key, 'wind-down');
  assert.equal(homeSuggestion(base({ hour: 22, person: 'new', sprintView: { state: 'none' } }))?.key, 'build');
  assert.equal(windDownEvening({ today: TODAY, hour: 22, from: 'off' }), null);
  assert.equal(windDownEvening({ today: TODAY, hour: 21, minute: 30, from: '21:45' }), null);
});

test('debrief days: the debrief from 12:00, mornings stay Plan my day', () => {
  const v = running({ debrief: { week: 3 }, calendar: { weeks: [null, null, { number: 3, start: '2026-10-19', end: '2026-10-25', days: ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25'] }] } });
  assert.equal(homeSuggestion(base({ sprintView: v })).key, 'plan');
  const c = homeSuggestion(base({ sprintView: v, hour: 14 }));
  assert.equal(c.key, 'debrief');
  assert.deepEqual(c.lines, ['Your debrief is open until Wed 28 Oct.']);
  assert.equal(c.action.to, '/performance-sprint/debrief');
});

test('the last week of the sprint and a sprint that has ended', () => {
  const c = homeSuggestion(base({ hour: 13, sprintView: running({ current: 8 }) }));
  assert.equal(c.question, 'Ready for what comes next?');
  assert.deepEqual(c.lines, ['Performance Sprint 1 ends on Sun 29 Nov.', 'Go straight into the next sprint, or take a Recovery week first.']);
  const over = homeSuggestion(base({ sprintView: { state: 'over', name: 'Performance Sprint 1', endedOn: 'Sun 18 Oct' } }));
  assert.equal(over.action.to, '/performance-sprint/review');
});

test('new people, a plan with no sprint, and Recovery', () => {
  const none = { state: 'none' };
  assert.equal(homeSuggestion(base({ person: 'new', sprintView: none })).action.to, '/performance-plan/build');
  assert.equal(homeSuggestion(base({ person: 'new', sprintView: none, hasCoach: true })), null);
  assert.equal(homeSuggestion(base({ person: 'planned', sprintView: none })).key, 'start-sprint');
  const rec = { start_on: '2026-10-19', chosen_days: 7, extended_days: 0, ended_at: null, end_on: null };
  assert.equal(homeSuggestion(base({ person: 'recovery', sprintView: none, recovery: rec, nextSprint: 3 })).question, 'Ready for Performance Sprint 3?');
  assert.equal(homeSuggestion(base({ person: 'recovery', sprintView: { state: 'paused' }, recovery: rec })), null);
  assert.equal(homeSuggestion(base({ person: 'recovery', sprintView: { state: 'paused' }, recovery: { ...rec, start_on: '2026-10-10' } })).key, 'recovery-end');
});

test('who Home is for', () => {
  const steps = planSteps({ mission: 'A mission', objectives: 2, strategies: 3 });
  assert.equal(homePerson({ sprintView: { state: 'none' }, recovery: null, steps }), 'planned');
  assert.equal(homePerson({ sprintView: { state: 'none' }, recovery: null, steps: planSteps({}) }), 'new');
  assert.equal(homePerson({ sprintView: running(), recovery: null, steps }), 'sprint');
  assert.equal(homePerson({ sprintView: running(), recovery: {}, steps }), 'recovery');
});

test('the plan steps: done, next, not yet', () => {
  assert.deepEqual(planSteps({ mission: 'x' }).map((s) => s.state), ['done', 'next', 'later', 'later']);
  assert.deepEqual(planSteps({}).map((s) => s.state), ['next', 'later', 'later', 'later']);
});

test('a gap is 7 days in a row with nothing logged, planned or reviewed', () => {
  assert.equal(GAP_DAYS, 7);
  assert.equal(lastActiveBefore(['2026-10-10', '2026-10-13', '2026-10-21'], TODAY), '2026-10-13');
  assert.equal(isComingBack('2026-10-13', TODAY), true);   // 14 to 20 Oct empty
  assert.equal(isComingBack('2026-10-14', TODAY), false);  // only 6 days
  assert.equal(isComingBack(null, TODAY), false);          // never active: someone new
});

test('quiet lines: the mission once, two weeks in, until Not now', () => {
  assert.equal(quietLines({ person: 'new', hasCoach: false, mission: null, joinedDaysAgo: 20 }).length, 1);
  assert.equal(quietLines({ person: 'new', hasCoach: false, mission: null, joinedDaysAgo: 3 }).length, 0);
  assert.equal(quietLines({ person: 'new', hasCoach: false, mission: null, joinedDaysAgo: 20, dismissed: ['mission'] }).length, 0);
  assert.equal(quietLines({ person: 'new', hasCoach: true, mission: null, joinedDaysAgo: 20 }).length, 0);
});

test("today's to-dos: the picks with the highest priority first, ticks from the sprint's rows", () => {
  const todos = [
    { id: 'a', text: 'Call Evan', strategy_id: 's1', done_on: '2026-10-21' },
    { id: 'b', text: 'Send the proposal', strategy_id: 's1', done_on: null },
  ];
  const habits = [{ id: 'h', name: 'Training session', strategyName: 'Fit', bar: 0.5, weekLine: '1 of 4 this week', measure: 'count' }];
  const items = todayItems({ picks: ['todo:a', 'todo:b', 'habit:h'], top: 'todo:b', sprintView: { habits }, todos, strategies: [{ id: 's1', name: 'Grow' }] });
  assert.deepEqual(items.map((x) => x.text), ['Send the proposal', 'Call Evan', 'Training session']);
  assert.equal(items[0].top, true);
  assert.equal(items[1].done, true);
  assert.equal(items[2].done, false);
  assert.deepEqual(dayStrategyNames([{ strategy_id: 's1' }, { strategy_id: 'gone' }], [{ id: 's1', name: 'Grow' }]), ['Grow']);
  assert.equal(weeklyFoldLine([{ bar: 1 }, { bar: 0.2 }, { bar: 0 }]), '3 weekly habits, 1 done');
});
