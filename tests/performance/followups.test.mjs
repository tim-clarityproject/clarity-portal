// Phase 5 step 4, the Phase 4 follow-ups (logic only; the browser side is
// tests/phase5/followups.mjs): Daily plan and Daily review know a
// Recovery is open on their day, so they say Recovery's calm line instead
// of "No sprint is running"; and the search in My Plans and My Reviews
// (src/lib/savedItems.js searchRows), on the rows already on the device.
// Run with npm run test:performance.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RECOVERY_DAY_LINE,
  RECOVERY_NUMBERS_LINE,
  dayPlanView,
  dayReviewView,
  inRecoveryOn,
} from '../../src/lib/performance/index.js';
import { listFilters, noMatchLine, planRows, reviewRows, searchRows } from '../../src/lib/savedItems.js';

const TODAY = '2026-10-21'; // a Wednesday

function day(over = {}) {
  return {
    plan: { id: 'p' },
    sprint: { id: 'sp', plan_id: 'p', number: 1, status: 'running', start_on: '2026-10-05', length_weeks: 8, standard: 85, label: null },
    objectives: [{ id: 'o1' }],
    strategies: [{ id: 'grow', name: 'Grow through referrals' }],
    links: [{ strategy_id: 'grow', objective_id: 'o1' }],
    workingPatterns: [],
    recoveries: [],
    personSettings: { units: 'metric' },
    weekScores: [],
    debriefs: [],
    sprintHabits: [],
    sprintSettings: [],
    logs: [],
    todos: [],
    todoMoves: [],
    wins: [],
    winLinks: [],
    dayPlan: null,
    dayTodos: [],
    dayStrategies: [],
    earlierWays: [],
    lastReview: null,
    dayReview: null,
    reviewStrategies: [],
    firstName: 'Sam',
    ...over,
  };
}
const recovery = (over = {}) => ({ id: 'r1', sprint_id: 'sp', start_on: '2026-10-19', chosen_days: 7, extended_days: 0, ended_at: null, end_on: null, let_coach_know: false, ...over });

test('a Recovery open on the day: both daily tools know it, and the sprint is not running', () => {
  const d = day({ recoveries: [recovery()] });
  const plan = dayPlanView(d, { date: TODAY });
  const review = dayReviewView(d, { date: TODAY });
  assert.equal(plan.inRecovery, true);
  assert.equal(plan.running, false);
  assert.equal(review.inRecovery, true);
  assert.equal(review.running, false);
});

test('no Recovery, an ended one, or one that starts later: not in Recovery', () => {
  assert.equal(dayReviewView(day(), { date: TODAY }).inRecovery, false);
  assert.equal(dayReviewView(day({ recoveries: [recovery({ ended_at: '2026-10-20T08:00:00', end_on: '2026-10-20' })] }), { date: TODAY }).inRecovery, false);
  // A past day's review, from before the Recovery began.
  assert.equal(dayReviewView(day({ recoveries: [recovery()] }), { date: '2026-10-16' }).inRecovery, false);
  assert.equal(inRecoveryOn([recovery()], '2026-10-19'), true);
  assert.equal(inRecoveryOn(undefined, TODAY), false);
});

test('with no sprint at all, a Recovery still says so (and no sprint is running)', () => {
  const d = day({ sprint: null, recoveries: [recovery({ sprint_id: null })] });
  const review = dayReviewView(d, { date: TODAY });
  assert.equal(review.running, false);
  assert.equal(review.inRecovery, true);
});

test('Recovery’s lines are full sentences, calm, with no “No sprint is running”', () => {
  for (const line of [RECOVERY_DAY_LINE, RECOVERY_NUMBERS_LINE]) {
    assert.match(line, /^[A-Z].*\.$/);
    assert.doesNotMatch(line, /No sprint is running/);
    assert.doesNotMatch(line, /[;:()–—]/);
  }
});

// ------------------------------------------------------------ search

const at = (d, time = '09:00:00') => `${d}T${time}`;
const PLANS = {
  decisions: [
    { id: 'd1', tool_type: 'daily_plan', title: 'Friday 2nd Oct, 2026', created_at: at('2026-10-21') },
    { id: 'd2', tool_type: 'plan_meeting', title: 'Harbour introduction call', created_at: at('2026-10-14') },
    { id: 'd3', tool_type: 'grow', title: 'Referral pipeline', created_at: at('2026-10-19'), status: 'draft' },
    { id: 'd4', tool_type: 'inversion', title: 'Harbour proposal', created_at: at('2026-10-15') },
    { id: 'd5', tool_type: 'strategic-alignment', title: 'Leadership team', created_at: at('2026-09-01') },
    { id: 'd6', tool_type: 'strategic-alignment', title: 'Café team', created_at: at('2026-10-12') },
  ],
  planReviews: [],
  plans: [],
  sprints: [],
  dayPlans: [],
  missions: [],
};
const ids = (rows) => rows.map((r) => r.id.replace(/^decision:/, '')).sort();

test('search: nothing typed keeps every row', () => {
  const rows = planRows(PLANS, TODAY);
  assert.equal(searchRows(rows, '').length, rows.length);
  assert.equal(searchRows(rows, '   ').length, rows.length);
});

test('search: by name, any case, every word typed, in any order', () => {
  const rows = planRows(PLANS, TODAY);
  assert.deepEqual(ids(searchRows(rows, 'harbour')), ['d2', 'd4']);
  assert.deepEqual(ids(searchRows(rows, 'PROPOSAL harbour')), ['d4']);
  assert.deepEqual(ids(searchRows(rows, 'harbour pipeline')), []);
});

test('search: by the tool, as the row shows it', () => {
  const rows = planRows(PLANS, TODAY);
  const getUnstuck = rows.find((r) => r.id === 'decision:d3').typeLabel;
  assert.equal(getUnstuck, 'Get unstuck');
  assert.ok(searchRows(rows, 'get unstuck').some((r) => r.id === 'decision:d3'));
  assert.deepEqual(ids(searchRows(rows, 'health check')), ['d5', 'd6']);
});

test('search: the day plan’s name in words, curly or straight apostrophe, and accents made plain', () => {
  const rows = planRows(PLANS, TODAY);
  assert.deepEqual(ids(searchRows(rows, 'today’s plan')), ['d1']);
  assert.deepEqual(ids(searchRows(rows, "today's plan")), ['d1']);
  assert.deepEqual(ids(searchRows(rows, 'todays')), ['d1']);
  assert.deepEqual(ids(searchRows(rows, 'cafe')), ['d6']);
  assert.deepEqual(ids(searchRows(rows, 'Café')), ['d6']);
});

test('search works with the area filter: both apply together', () => {
  const rows = planRows(PLANS, TODAY);
  const { filters } = listFilters(rows);
  const strategic = filters.find((f) => f.id === 'strategic');
  const both = searchRows(rows.filter(strategic.match), 'team');
  assert.deepEqual(ids(both), ['d5', 'd6']);
  assert.deepEqual(ids(searchRows(rows.filter(strategic.match), 'harbour')), []);
});

test('search: My Reviews too, by name and by tool', () => {
  const rows = reviewRows({
    entries: [
      { id: 'e2', review_type: 'plan-review', title: 'Harbour introduction call', content: JSON.stringify({ planKind: 'plan_meeting', planId: 'd2' }), created_at: at('2026-10-15') },
      { id: 'e4', review_type: 'after-action', title: 'Harbour discovery call', status: 'final', created_at: at('2026-10-15') },
    ],
    dayReviews: [{ id: 'dr1', local_date: TODAY, status: 'finished' }],
    debriefs: [{ id: 'db1', sprint_id: 's1', sprint_week: 3, status: 'finished' }],
    sprints: [{ id: 's1', number: 1, start_on: '2026-09-28', planned_end_on: '2026-11-22' }],
  }, TODAY);
  assert.deepEqual(ids(searchRows(rows, 'harbour')), ['entry:e2', 'entry:e4']);
  assert.deepEqual(ids(searchRows(rows, 'meeting review')), ['entry:e2']);
  assert.deepEqual(ids(searchRows(rows, 'daily review')), ['day-review:dr1']);
  assert.deepEqual(ids(searchRows(rows, 'sprint 1, week 3')), ['debrief:db1']);
  assert.equal(searchRows(rows, 'zzzz nothing').length, 0);
});

test('the line when nothing matches is one full sentence with the words in curly quotes', () => {
  assert.equal(noMatchLine('xyz'), 'Nothing matches “xyz”.');
  assert.equal(noMatchLine('  sales  '), 'Nothing matches “sales”.');
});
