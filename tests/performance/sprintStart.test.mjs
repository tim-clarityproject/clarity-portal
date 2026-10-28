// Start a sprint's pure helpers (src/lib/performance/sprintStart.js): the
// next number, where a running sprint stands, the day it finishes on when
// the next one starts, the habits copied from the plan, and the one start
// record a double tap or a refresh sends again. Run with npm run test:performance.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyHabit,
  finishDay,
  habitCountWords,
  habitFromPlanRow,
  nextSprintNumber,
  pendingAction,
  pendingStart,
  runningSprint,
  shiftDay,
  sprintAnswersFrom,
  sprintHabitsFrom,
  sprintLabel,
  sprintStanding,
} from '../../src/lib/performance/index.js';

const sprint = (over = {}) => ({ id: 's1', number: 1, status: 'running', start_on: '2026-10-05', length_weeks: 4, ...over });
const planHabit = (over = {}) => ({
  id: 'h1', strategy_id: 'st1', name: 'Training sessions', measure: 'count', unit: null, target: 4, target_per: 'week',
  limit_value: null, limit_per: null, direction: null, top_number: null, impact: 3, ...over,
});

test('shiftDay is a pure date sum across months and years', () => {
  assert.equal(shiftDay('2026-10-31', 1), '2026-11-01');
  assert.equal(shiftDay('2027-01-01', -1), '2026-12-31');
  assert.equal(shiftDay('2026-03-29', 0), '2026-03-29');
});

test('the next sprint number follows the highest so far', () => {
  assert.equal(nextSprintNumber([]), 1);
  assert.equal(nextSprintNumber([{ number: 1 }, { number: 3 }, { number: 2 }]), 4);
});

test('the running sprint is the one with status running', () => {
  assert.equal(runningSprint([sprint({ status: 'finished' })]), null);
  assert.equal(runningSprint([sprint({ id: 'a', status: 'finished' }), sprint({ id: 'b', number: 2 })]).id, 'b');
});

test('a sprint is over once its last day has passed, and Recovery moves the end later', () => {
  // 4 weeks from Mon 5 Oct: planned end Sun 1 Nov
  assert.deepEqual(sprintStanding(sprint(), [], '2026-10-28'), { started: true, over: false, endOn: '2026-11-01' });
  assert.equal(sprintStanding(sprint(), [], '2026-11-01').over, false);
  assert.equal(sprintStanding(sprint(), [], '2026-11-02').over, true);
  // 3 days of Recovery (Mon 12 to Thu 15 Oct, back on the 15th): ends Wed 4 Nov
  const rec = [{ start_on: '2026-10-12', ended_at: '2026-10-15T08:00:00', end_on: '2026-10-15' }];
  assert.equal(sprintStanding(sprint(), rec, '2026-11-03').endOn, '2026-11-04');
  assert.equal(sprintStanding(sprint(), rec, '2026-11-03').over, false);
  // a sprint that starts later has not started
  assert.equal(sprintStanding(sprint({ start_on: '2026-11-02' }), [], '2026-10-28').started, false);
});

test('finishing a running sprint never overlaps the new one', () => {
  // mid-sprint, the new one starts next Monday: finishes today
  assert.equal(finishDay(sprint(), [], '2026-10-28', '2026-11-02'), '2026-10-28');
  // the new one starts today: finishes yesterday
  assert.equal(finishDay(sprint(), [], '2026-10-28', '2026-10-28'), '2026-10-27');
  // already over (review skipped): keeps its own end
  assert.equal(finishDay(sprint(), [], '2026-11-10', '2026-11-16'), '2026-11-01');
  // never started: the day before its start (it held no days)
  assert.equal(finishDay(sprint({ start_on: '2026-11-02' }), [], '2026-10-28', '2026-10-28'), '2026-11-01');
});

test('habits are copied from the plan, kept, changed for this sprint or removed', () => {
  const rows = [planHabit(), planHabit({ id: 'h2', name: 'Water', measure: 'amount', unit: 'litres', target: 2, target_per: 'day', impact: 1 })];
  const kept = sprintHabitsFrom(rows, {}, []);
  assert.equal(kept.habits.length, 2);
  assert.deepEqual(kept.habits[0], habitFromPlanRow(rows[0]));
  assert.equal(kept.habits[0].habitId, 'h1');
  assert.equal(kept.habits[1].unit, 'litres');

  const edit = { id: 'h1', strategyId: 'st1', name: 'Training sessions', measure: 'count', target: '3', unit: '', per: 'week', direction: 'higher', impact: 2 };
  const changed = sprintHabitsFrom(rows, { h1: { choice: 'change', edit }, h2: { choice: 'remove' } }, []);
  assert.equal(changed.habits.length, 1);
  assert.equal(changed.habits[0].habitId, 'h1');
  assert.equal(changed.habits[0].target, 3);
  assert.equal(changed.habits[0].impact, 2);

  // an unfinished change keeps the plan's settings
  const half = sprintHabitsFrom(rows, { h1: { choice: 'change', edit: { ...edit, target: '' } } }, []);
  assert.equal(half.unfinishedChanges, 1);
  assert.equal(half.habits[0].target, 4);
});

test('a habit added for this sprint only has no plan habit, and waits until complete', () => {
  const blank = emptyHabit('n1', 'st1');
  const typed = { ...emptyHabit('n2', 'st1'), name: 'Reflective notes', target: '5' };
  const r = sprintHabitsFrom([], {}, [blank, { ...typed, target: '' }, typed]);
  assert.equal(r.habits.length, 1);
  assert.equal(r.habits[0].habitId, null);
  assert.equal(r.habits[0].strategyId, 'st1');
  assert.equal(r.unfinishedAdded, 1); // the blank one isn't counted
});

test('the words for the habit count and the label', () => {
  assert.equal(habitCountWords(0), 'None');
  assert.equal(habitCountWords(1), '1 habit');
  assert.equal(habitCountWords(8), '8 habits');
  assert.equal(sprintLabel('  Q1  '), 'Q1');
  assert.equal(sprintLabel('', true), 'First 90 days in a new role');
  assert.equal(sprintLabel(''), null);
  assert.equal(sprintLabel('x'.repeat(70)).length, 60);
});

test('a first sprint whose start has passed comes back as answers from next Monday', () => {
  assert.deepEqual(
    [sprintAnswersFrom({ lengthWeeks: 8, standard: 80 }, '2026-11-02')].map((a) => [a.len, a.std, a.start, a.other, a.stdOther]),
    [[8, 80, '2026-11-02', false, false]],
  );
  const odd = sprintAnswersFrom({ lengthWeeks: 10, standard: 77 }, '2026-11-02');
  assert.equal(odd.other, true);
  assert.equal(odd.otherLen, '10');
  assert.equal(odd.stdOther, true);
  assert.equal(odd.otherStd, '77');
  assert.equal(sprintAnswersFrom({ lengthWeeks: 13, standard: 85, template: true }, '2026-11-02').tpl, true);
});

test('one start record holds every id, so a resend writes the same rows', () => {
  let n = 0;
  const makeId = () => `id-${(n += 1)}`;
  const p = pendingStart({
    planId: 'p1', number: 2, startOn: '2026-11-02', lengthWeeks: 12, standard: 85, label: null,
    habits: [habitFromPlanRow(planHabit())], finish: { sprintId: 's1', number: 1, endOn: '2026-10-28' },
  }, makeId);
  assert.equal(p.sprintId, 'id-1');
  assert.equal(p.habits[0].sprintHabitId, 'id-2');
  assert.equal(p.habits[0].settingId, 'id-3');
  assert.equal(p.finish.endOn, '2026-10-28');
  // the same record, sent again, keeps its ids
  assert.deepEqual(JSON.parse(JSON.stringify(p)).habits[0].sprintHabitId, 'id-2');
  assert.equal(pendingAction(p, [sprint()]), 'resend');
  assert.equal(pendingAction(p, [sprint(), { id: p.sprintId, number: 2 }]), 'resend');
  assert.equal(pendingAction(p, [sprint(), { id: 'other', number: 2 }]), 'drop');
  assert.equal(pendingAction(null, []), 'drop');
  // over a day old: dropped
  assert.equal(pendingAction(p, [sprint()], p.at + 25 * 60 * 60 * 1000), 'drop');
  assert.equal(pendingAction(p, [sprint()], p.at + 60 * 1000), 'resend');
});
