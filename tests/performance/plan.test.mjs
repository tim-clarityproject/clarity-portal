// The Individual Performance Plan's pure helpers (src/lib/performance):
// the version rules, the alignment check, the plan's words and the page's
// view. Run with npm run test:performance.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  alignmentCheck,
  alignmentLines,
  habitMeasureLine,
  nextVersion,
  objectiveStripFigure,
  objectiveTarget,
  parseVersion,
  planChangeKind,
  planSnapshot,
  planView,
  servesLine,
  versionView,
} from '../../src/lib/performance/index.js';
import { m5WeekFromRaw } from '../../src/lib/scores/index.js';

const base = () => planSnapshot({
  mission: 'Be a world-class high-performance coach',
  objectives: [
    { id: 'o1', name: 'Coaching clients', kind: 'number', start_value: 20, target_value: 40, by_when: '2027-12-31', sort_order: 0 },
    { id: 'o2', name: 'Publish my coaching book', kind: 'milestone', due_on: '2027-06-30', sort_order: 1 },
  ],
  strategies: [
    { id: 's1', name: 'Grow through referrals', sort_order: 0 },
    { id: 's2', name: 'Deepen my coaching craft', sort_order: 1 },
  ],
  links: [
    { strategy_id: 's1', objective_id: 'o1' },
    { strategy_id: 's2', objective_id: 'o2' },
  ],
  habits: [
    { id: 'h1', strategy_id: 's1', name: 'Check-in messages', measure: 'count', target: 5, target_per: 'week', impact: 3 },
  ],
});

test('versions: the same plan makes no version', () => {
  assert.equal(planChangeKind(base(), base()), null);
});

test('versions: mission changed is major', () => {
  const after = { ...base(), mission: 'Coach the coaches' };
  assert.equal(planChangeKind(base(), after), 'major');
});

test('versions: an objective added or removed is major', () => {
  const b = base();
  assert.equal(planChangeKind(b, { ...b, objectives: b.objectives.slice(0, 1) }), 'major');
  assert.equal(planChangeKind(b, { ...b, objectives: [...b.objectives, { id: 'o3', name: 'Revenue', kind: 'number' }] }), 'major');
});

test('versions: a Strategy added, removed or re-tagged is major', () => {
  const b = base();
  assert.equal(planChangeKind(b, { ...b, strategies: b.strategies.slice(1) }), 'major');
  const retagged = { ...b, strategies: b.strategies.map((s) => (s.id === 's1' ? { ...s, objectiveIds: ['o1', 'o2'] } : s)) };
  assert.equal(planChangeKind(b, retagged), 'major');
});

test('versions: habits, names, targets and impact are minor', () => {
  const b = base();
  assert.equal(planChangeKind(b, { ...b, habits: [] }), 'minor');
  assert.equal(planChangeKind(b, { ...b, habits: b.habits.map((h) => ({ ...h, impact: 2 })) }), 'minor');
  assert.equal(planChangeKind(b, { ...b, strategies: b.strategies.map((s) => ({ ...s, name: `${s.name}s` })) }), 'minor');
  assert.equal(planChangeKind(b, { ...b, objectives: b.objectives.map((o) => ({ ...o, target: 50 })) }), 'minor');
});

test('versions: archived rows are left out of a snapshot', () => {
  const s = planSnapshot({ mission: 'x', objectives: [{ id: 'o1', name: 'A', kind: 'rating', archived_at: '2026-10-01' }], strategies: [], links: [], habits: [] });
  assert.deepEqual(s.objectives, []);
});

test('versions: the next number', () => {
  assert.deepEqual(nextVersion({ major: 3, minor: 2 }, 'major'), { major: 4, minor: 0 });
  assert.deepEqual(nextVersion({ major: 3, minor: 2 }, 'minor'), { major: 3, minor: 3 });
  assert.deepEqual(parseVersion('3.2'), { major: 3, minor: 2 });
  assert.equal(parseVersion('3'), null);
});

test('alignment: gaps both ways, in words', () => {
  const objectives = [{ id: 'o1', name: 'Coaching clients' }, { id: 'o2', name: 'Annual revenue' }];
  const strategies = [{ id: 's1', name: 'Grow through referrals' }, { id: 's2', name: 'Build The Clarity Portal' }];
  const check = alignmentCheck(objectives, strategies, [{ strategyId: 's1', objectiveId: 'o1' }]);
  assert.equal(check.ok, false);
  assert.deepEqual(alignmentLines(check).map((l) => l.text), [
    'Annual revenue has no Strategy working on it',
    'Build The Clarity Portal serves no objective yet',
  ]);
  const ok = alignmentCheck(objectives, strategies, [{ strategyId: 's1', objectiveId: 'o1' }, { strategyId: 's2', objectiveId: 'o2' }]);
  assert.equal(ok.ok, true);
  assert.equal(alignmentLines(ok)[0].text, 'Every objective has a Strategy');
});

test('words: figures, targets and measure lines', () => {
  assert.equal(objectiveTarget({ kind: 'number', unit: '£k', target: 250 }), 'of £250k');
  assert.equal(objectiveTarget({ kind: 'rating', target: 9 }), 'target 9/10');
  assert.equal(objectiveStripFigure({ kind: 'number', unit: null, target: 40 }, 31, false), '31 of 40');
  assert.equal(objectiveStripFigure({ kind: 'rating', target: 9 }, 7, false), '7/10 of 9/10');
  assert.equal(objectiveStripFigure({ kind: 'milestone', dueOn: '2027-06-30' }, null, false), 'Not yet, by 30 Jun 2027');
  assert.equal(habitMeasureLine({ measure: 'amount', unit: 'steps', target: 10000, targetPer: 'day' }), '10,000 steps a day');
  assert.equal(habitMeasureLine({ measure: 'count', unit: 'sessions', target: 4, targetPer: 'week' }), '4 sessions a week');
  assert.equal(habitMeasureLine({ measure: 'yes_no_days_limit', limit: 2 }), 'Yes or no each day, no more than 2 days a week');
  assert.equal(habitMeasureLine({ measure: 'rating', target: 4, direction: 'higher' }), 'Rated 1 to 5 each day, aim for 4');
  assert.equal(habitMeasureLine({ measure: 'yes_no_weekly' }), 'Once a week');
  assert.equal(servesLine([1, 2, 4]), 'Serves objectives 1, 2 and 4');
});

// A plan with a running sprint, in week 2 on a Wednesday.
function pageRows() {
  return {
    plan: { id: 'p1', mission: 'Be a world-class high-performance coach', major: 3, minor: 2, created_at: '2026-01-05T09:00:00Z', updated_at: '2026-10-02T09:00:00Z' },
    latestVersion: { major: 3, minor: 2, kind: 'minor', created_at: '2026-10-02T09:30:00Z' },
    objectives: [
      { id: 'o1', name: 'Coaching clients', kind: 'number', direction: 'up', start_value: 20, start_set_on: '2026-01-05', target_value: 40, by_when: '2027-12-31', sort_order: 0 },
      { id: 'o2', name: 'Publish my coaching book', kind: 'milestone', direction: 'up', start_set_on: '2026-01-05', due_on: '2027-06-30', reached_on: null, sort_order: 1 },
      { id: 'o3', name: 'Annual revenue', kind: 'number', direction: 'up', unit: '£k', start_value: 120, start_set_on: '2026-01-05', target_value: 250, by_when: '2027-12-31', sort_order: 2 },
    ],
    figures: [{ objective_id: 'o1', value: 31, recorded_on: '2026-10-01', created_at: '2026-10-01T10:00:00Z' }],
    strategies: [{ id: 's1', name: 'Grow through referrals', sort_order: 0 }, { id: 's2', name: 'Deepen my coaching craft', sort_order: 1 }],
    links: [{ strategy_id: 's1', objective_id: 'o1' }, { strategy_id: 's2', objective_id: 'o2' }, { strategy_id: 's2', objective_id: 'o1' }],
    habits: [{ id: 'h1', strategy_id: 's1', name: 'Check-in messages', measure: 'count', unit: 'messages', target: 5, target_per: 'week', impact: 3 }],
    switches: [],
    personSettings: { time_zone: 'Europe/London' },
    recoveries: [],
    sprint: { id: 'sp1', number: 4, start_on: '2026-10-19', length_weeks: 8, standard: 85, status: 'running' },
    workingPatterns: [],
    coach: { firstName: 'Tim' },
    sprintHabits: [{ id: 'sh1', strategy_id: 's1', habit_id: 'h1', name: 'Check-in messages' }],
    sprintSettings: [{ sprint_habit_id: 'sh1', from_week: 1, measure: 'count', unit: 'messages', target: 5, target_per: 'week', impact: 3 }],
    logs: [{ sprint_habit_id: 'sh1', local_date: '2026-10-26', value: 2 }, { sprint_habit_id: 'sh1', local_date: '2026-10-27', value: 1 }],
    todos: [
      { id: 't1', strategy_id: 's2', text: 'Book a supervision session', impact: 2, sprint_id: 'sp1', planned_week: 2, created_on: '2026-10-20', done_on: '2026-10-27' },
      { id: 't2', strategy_id: 's2', text: 'Renew supervision contract', impact: 2, sprint_id: 'sp1', planned_week: 4, created_on: '2026-10-20', done_on: null },
    ],
    todoMoves: [],
    wins: [],
    winLinks: [],
  };
}

test('view: a to-do rolled over from an earlier week stays in its tile, as this week', () => {
  const rows = pageRows();
  rows.todos.push({ id: 't3', strategy_id: 's2', text: 'Draft the supervision notes', impact: 2, sprint_id: 'sp1', planned_week: 1, created_on: '2026-10-20', done_on: null });
  const v = planView(rows, { today: '2026-10-28' });
  assert.equal(v.strategies[1].todos.map((t) => `${t.text}: ${t.when}`).join(', '),
    'Draft the supervision notes: This week, Book a supervision session: Done, Renew supervision contract: Week 4');
});

test('view: objectives, alignment gap, Strategy scores from M5 so far', () => {
  const v = planView(pageRows(), { today: '2026-10-28' });
  assert.equal(v.mission, 'Be a world-class high-performance coach');
  assert.deepEqual(v.objectives.map((o) => o.number), [1, 2, 3]);
  assert.equal(v.objectives[0].figure, '31');
  assert.equal(v.objectives[0].target, 'of 40');
  assert.equal(v.objectives[0].strategyCount, 2);
  assert.equal(v.objectives[2].flagged, true);
  assert.equal(v.objectives[2].figure, '£120k');
  assert.equal(v.objectives[1].timeLeft, '8 months left');
  assert.equal(v.alignmentOk, false);
  assert.equal(v.alignment[0].text, 'Annual revenue has no Strategy working on it');
  assert.deepEqual(v.strategies[1].serves, [1, 2]);
  assert.equal(v.strategies[1].todos.map((t) => t.when).join(','), 'Done,Week 4');
  assert.equal(v.missionShared, true);
  assert.equal(v.progressShared, false);
  // The same week straight through M5, so the page never scores on its own.
  const direct = m5WeekFromRaw({
    week: { number: 2, days: ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01'], start: '2026-10-26', end: '2026-11-01' },
    weeks: [{ number: 1, start: '2026-10-19', end: '2026-10-25' }, { number: 2, start: '2026-10-26', end: '2026-11-01' }],
    workingDays: ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30'],
    soFarUntil: '2026-10-28',
    strategies: [{ id: 's1', served: 1 }, { id: 's2', served: 2 }],
    habits: [{ id: 'sh1', strategyId: 's1', measure: 'count', target: 5, targetPer: 'week', impact: 3 }],
    logs: [{ habitId: 'sh1', date: '2026-10-26', value: 2 }, { habitId: 'sh1', date: '2026-10-27', value: 1 }],
    todos: [{ id: 't1', strategyId: 's2', impact: 2, createdOn: '2026-10-20', plannedWeek: 2, doneOn: '2026-10-27', moves: [] }],
    wins: [],
  });
  assert.equal(v.weekScore.value, Math.round(direct.score));
  assert.equal(v.strategies[0].score.value, Math.round(direct.strategies[0].score));
});

test('view: in Recovery the scores are hidden', () => {
  const rows = pageRows();
  rows.recoveries = [{ id: 'r1', start_on: '2026-10-27', ended_at: null, end_on: null }];
  const v = planView(rows, { today: '2026-10-28' });
  assert.equal(v.inRecovery, true);
  assert.equal(v.weekScore, null);
  assert.equal(v.strategies[0].score, null);
});

test('view: no coach means nothing is shared', () => {
  const rows = pageRows();
  rows.coach = null;
  const v = planView(rows, { today: '2026-10-28' });
  assert.equal(v.missionShared, false);
});

test('version view: the plan as it was', () => {
  const v = versionView(base());
  assert.equal(v.objectives[0].target, 'Target 40');
  assert.equal(v.strategies[0].servesLine, 'Serves objective 1');
  assert.equal(v.strategies[0].habits[0].line, '5 times a week');
});
