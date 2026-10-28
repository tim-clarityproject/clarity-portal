// Build your plan's pure helpers (src/lib/performance/builder.js): what is
// complete enough to save, the saves that bring the database up to the
// draft, and the words on Ready. Run with npm run test:performance.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applySave,
  draftFromRows,
  draftMission,
  emptyHabit,
  emptyObjective,
  habitComplete,
  habitRow,
  habitTargetHint,
  objectiveComplete,
  objectiveRow,
  objectiveSummary,
  planChangeKind,
  planSaves,
  planSnapshot,
  removeStrategyFrom,
  rowsSnapshot,
  savableRows,
  sprintSetupFrom,
  sprintStandard,
  sprintWeeks,
  startingSprint,
  typedNumber,
  withMeasure,
  workingDaysWords,
} from '../../src/lib/performance/index.js';

const TODAY = '2026-10-28';

const blankDraft = () => ({
  planId: 'p1',
  mission: '',
  objectives: [],
  strategies: [],
  habits: [],
  workingDays: [0, 1, 2, 3, 4],
  sprint: startingSprint('2026-11-02'),
});

// Applies saves one by one, as the page does.
const sendAll = (saved, ops) => ops.reduce((s, op) => applySave(s, op), saved);

test('typed figures: commas, decimals and nonsense', () => {
  assert.equal(typedNumber('10,000'), 10000);
  assert.equal(typedNumber('1.5'), 1.5);
  assert.equal(typedNumber('1,5'), 1.5);
  assert.equal(typedNumber(''), null);
  assert.equal(typedNumber('abc'), null);
});

test('an objective is saved only once it is complete', () => {
  const o = { ...emptyObjective('o1'), name: 'Coaching clients' };
  assert.equal(objectiveComplete(o), false);
  assert.equal(objectiveComplete({ ...o, start: '31', target: '40' }), false); // no date yet
  assert.equal(objectiveComplete({ ...o, start: '31', target: '40', date: '2027-12-31' }), true);
  assert.equal(objectiveComplete({ ...o, kind: 'milestone', date: '2027-03-31' }), true);
  assert.equal(objectiveComplete({ ...o, kind: 'rating', start: '6', target: '11', date: '2027-06-30' }), false);
});

test('an objective row carries only its kind’s fields, and a number can go down', () => {
  const row = objectiveRow({ ...emptyObjective('o1'), name: ' Hours worked ', start: '60', target: '45', date: '2027-06-30' }, 0, TODAY);
  assert.deepEqual(row, {
    id: 'o1', name: 'Hours worked', kind: 'number', unit: null, direction: 'down', start: 60, target: 45,
    byWhen: '2027-06-30', dueOn: null, sortOrder: 0, startOn: TODAY,
  });
  const m = objectiveRow({ ...emptyObjective('o2'), name: 'Launch', kind: 'milestone', start: '3', date: '2027-03-31', saved: true }, 1, TODAY);
  assert.equal(m.start, null);
  assert.equal(m.dueOn, '2027-03-31');
  assert.equal(m.byWhen, null);
  assert.equal('startOn' in m, false);
});

test('habits: the seven ways to measure and their targets', () => {
  const h = { ...emptyHabit('h1', 's1'), name: 'Training sessions', target: '4' };
  assert.equal(habitComplete(h), true);
  assert.equal(habitComplete({ ...h, target: '0' }), false);
  const amount = withMeasure({ ...h, name: 'Steps', target: '10,000' }, 'amount');
  assert.equal(amount.per, 'day');
  assert.equal(habitComplete(amount), false); // an amount needs its unit
  assert.equal(habitComplete({ ...amount, unit: 'steps' }), true);
  assert.deepEqual(habitRow({ ...amount, unit: 'steps' }, 0), {
    id: 'h1', strategyId: 's1', name: 'Steps', measure: 'amount', unit: 'steps', target: 10000, targetPer: 'day',
    limit: null, limitPer: null, direction: null, topNumber: null, impact: 2, sortOrder: 0,
  });
  const late = withMeasure({ ...h, name: 'Late finishes', target: '2' }, 'yes_no_days_limit');
  assert.deepEqual([habitRow(late, 0).limit, habitRow(late, 0).target], [2, null]);
  assert.equal(habitComplete({ ...late, target: '8' }), false);
  assert.equal(habitTargetHint({ ...late, target: '8' }), 'Any figure from 0 to 7.');
  const focus = withMeasure({ ...h, name: 'Focus', target: '5' }, 'rating');
  assert.equal(habitComplete(focus), true);
  assert.equal(habitComplete({ ...focus, direction: 'lower' }), false); // lower is better: 1 to 4
  assert.equal(habitTargetHint({ ...focus, direction: 'lower' }), 'Any figure from 1 to 4.');
  const block = withMeasure({ ...h, name: 'Strategic block', target: '' }, 'yes_no_weekly');
  assert.equal(habitComplete(block), true);
  assert.equal(habitRow(block, 0).target, null);
});

test('saves come in order: the plan, then parents, then children; nothing half-filled', () => {
  const d = blankDraft();
  d.mission = 'Lead a team that delivers under pressure';
  d.objectives = [
    { ...emptyObjective('o1'), name: 'Coaching clients', start: '31', target: '40', date: '2027-12-31' },
    { ...emptyObjective('o2'), name: 'Half written' },
  ];
  d.strategies = [{ id: 's1', name: 'Grow through referrals', description: null, objectiveIds: ['o1', 'o2'] }, { id: 's2', name: '', objectiveIds: ['o1'] }];
  d.habits = [{ ...emptyHabit('h1', 's1'), name: 'Check-in messages', target: '5' }, { ...emptyHabit('h2', 's2'), name: 'Orphan', target: '3' }];
  const ops = planSaves(savableRows(blankDraft(), TODAY), savableRows(d, TODAY), { planExists: false });
  assert.deepEqual(ops.map((o) => o.kind), ['plan', 'objective', 'strategy', 'link', 'habit']);
  assert.deepEqual(ops.find((o) => o.kind === 'link').link, { strategyId: 's1', objectiveId: 'o1' });
  // Nothing to send twice.
  const saved = sendAll(savableRows(blankDraft(), TODAY), ops);
  assert.deepEqual(planSaves(saved, savableRows(d, TODAY), { planExists: true }), []);
});

test('an empty new plan writes nothing, but the working days still save', () => {
  const d = blankDraft();
  assert.deepEqual(planSaves(savableRows(d, TODAY), savableRows(d, TODAY), { planExists: false }), []);
  const ops = planSaves(savableRows(d, TODAY), savableRows({ ...d, workingDays: [0, 1, 2, 3] }, TODAY), { planExists: false });
  assert.deepEqual(ops, [{ kind: 'days', days: [0, 1, 2, 3] }]);
});

test('removing: archived when a version holds it, deleted when not; children first', () => {
  const d = blankDraft();
  d.objectives = [{ ...emptyObjective('o1'), name: 'Clients', start: '1', target: '2', date: '2027-01-01', saved: true }];
  d.strategies = [{ id: 's1', name: 'Referrals', description: null, objectiveIds: ['o1'] }, { id: 's2', name: 'New one', description: null, objectiveIds: ['o1'] }];
  d.habits = [{ ...emptyHabit('h1', 's1'), name: 'Messages', target: '5' }];
  const saved = savableRows(d, TODAY);
  const next = removeStrategyFrom(removeStrategyFrom(d, 's1', 'o1'), 's2', 'o1');
  const ops = planSaves(saved, savableRows(next, TODAY), { planExists: true, inVersion: new Set(['o1', 's1', 'h1']) });
  assert.deepEqual(ops.map((o) => [o.kind, o.table || '', o.id || '']), [
    ['link', '', ''], ['link', '', ''],
    ['archive', 'habits', 'h1'], ['archive', 'plan_strategies', 's1'], ['delete', 'plan_strategies', 's2'],
  ]);
});

test('a Strategy taken off one objective stays while it serves another', () => {
  const d = { ...blankDraft(), strategies: [{ id: 's1', name: 'Referrals', objectiveIds: ['o1', 'o2'] }], habits: [{ ...emptyHabit('h1', 's1') }] };
  const off = removeStrategyFrom(d, 's1', 'o1');
  assert.deepEqual(off.strategies[0].objectiveIds, ['o2']);
  assert.equal(off.habits.length, 1);
  const gone = removeStrategyFrom(off, 's1', 'o2');
  assert.equal(gone.strategies.length, 0);
  assert.equal(gone.habits.length, 0);
});

test('the saved plan reads back as the same draft, and its snapshot matches the version rules', () => {
  const rows = {
    plan: { id: 'p1', mission: 'Be a world-class high-performance coach', major: 3, minor: 2 },
    objectives: [
      { id: 'o1', name: 'Annual revenue', kind: 'number', unit: '£k', direction: 'up', start_value: 140, target_value: 250, by_when: '2027-12-31', due_on: null, sort_order: 0 },
      { id: 'o2', name: 'Publish my coaching book', kind: 'milestone', unit: null, direction: 'up', start_value: null, target_value: null, by_when: null, due_on: '2027-06-30', sort_order: 1 },
    ],
    strategies: [{ id: 's1', name: 'Grow through referrals', description: null, sort_order: 0 }],
    links: [{ strategy_id: 's1', objective_id: 'o1' }],
    habits: [
      { id: 'h1', strategy_id: 's1', name: 'Reading', measure: 'amount', unit: 'hours', target: 3, target_per: 'week', limit_value: null, limit_per: null, direction: null, top_number: null, impact: 1, sort_order: 0 },
      { id: 'h2', strategy_id: 's1', name: 'Late finishes', measure: 'yes_no_days_limit', unit: null, target: null, target_per: null, limit_value: 2, limit_per: null, direction: null, top_number: null, impact: 2, sort_order: 1 },
    ],
    workingPatterns: [],
  };
  const draft = draftFromRows(rows);
  assert.equal(draft.habits[0].per, 'week'); // a habit keeps its own per
  const saved = savableRows(draft, TODAY);
  const stored = planSnapshot({ ...rows, mission: rows.plan.mission });
  assert.equal(planChangeKind(stored, rowsSnapshot(saved)), null);
  // A new target is minor; a new objective is major.
  const target = { ...draft, objectives: draft.objectives.map((o) => (o.id === 'o1' ? { ...o, target: '260' } : o)) };
  assert.equal(planChangeKind(stored, rowsSnapshot(savableRows(target, TODAY))), 'minor');
  const added = { ...draft, objectives: [...draft.objectives, { ...emptyObjective('o3'), kind: 'milestone', name: 'Speak at a conference', date: '2027-09-30' }] };
  assert.equal(planChangeKind(stored, rowsSnapshot(savableRows(added, TODAY))), 'major');
});

test('the first sprint: length, standard and what Start a sprint is given', () => {
  const s = startingSprint('2026-11-02');
  assert.equal(sprintWeeks(s), 12);
  assert.equal(sprintWeeks({ ...s, tpl: true }), 13);
  assert.equal(sprintWeeks({ ...s, other: true, otherLen: '17' }), null);
  assert.equal(sprintWeeks({ ...s, other: true, otherLen: '2' }), 2);
  assert.equal(sprintStandard({ ...s, stdOther: true, otherStd: '49' }), null);
  assert.equal(sprintStandard({ ...s, stdOther: true, otherStd: '95' }), 95);
  assert.equal(sprintStandard({ ...s, std: 75 }, 85), 85); // an organisation seat
  assert.deepEqual(sprintSetupFrom({ ...s, tpl: true }), { lengthWeeks: 13, startOn: '2026-11-02', standard: 85, label: 'First 90 days in a new role', template: true });
});

test('Ready’s words', () => {
  assert.equal(workingDaysWords([0, 1, 2, 3, 4]), 'Monday to Friday');
  assert.equal(workingDaysWords([0, 2, 4]), 'Monday, Wednesday and Friday');
  assert.equal(workingDaysWords([0, 1, 2, 3, 4, 5, 6]), 'Every day');
  assert.equal(objectiveSummary({ kind: 'number', start: '31', target: '40', date: '2027-12-31' }), '31 now, target 40, by 31 Dec 2027');
  assert.equal(objectiveSummary({ kind: 'rating', start: '6', target: '8', date: '2027-06-30' }), '6/10 now, target 8/10, by 30 Jun 2027');
  assert.equal(objectiveSummary({ kind: 'milestone', date: '2027-03-31' }), 'Milestone, by 31 Mar 2027');
  const long = draftMission({ known: 'calm leadership through every merger, restructure and difficult board meeting', serve: 'my executive team and the wider business', great: 'we are trusted' });
  assert.ok(long.length <= 120 && long.endsWith('.'));
});
