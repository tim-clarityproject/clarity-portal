// Tidy pass, item 4: a Daily plan's sleep answer saved just after midnight
// belongs to the day it is saved on, because the question is about last
// night (the reverse of the Daily review's 04:00 rule). The rest of the
// plan keeps its day. Run with npm run test:performance.
import test from 'node:test';
import assert from 'node:assert/strict';
import { answersToRow, sleepSaveDay, splitPlanSave } from '../../src/lib/performance/index.js';

const answers = { hours: 7.5, quality: 'good', grateful: 'Coffee', way: 'Calm', risk: '', response: '' };

test('a sleep answer given before midnight stays on the plan’s day', () => {
  assert.equal(sleepSaveDay({ planDate: '2026-11-21', openedOn: '2026-11-21', changedOn: '2026-11-21' }), '2026-11-21');
});

test('a sleep answer given after midnight on a plan opened the day before goes to the day it is saved on', () => {
  assert.equal(sleepSaveDay({ planDate: '2026-11-21', openedOn: '2026-11-21', changedOn: '2026-11-22' }), '2026-11-22');
  // Across a month and a year end too.
  assert.equal(sleepSaveDay({ planDate: '2026-12-31', openedOn: '2026-12-31', changedOn: '2027-01-01' }), '2027-01-01');
});

test('a sleep answer not changed on the page stays where it is', () => {
  assert.equal(sleepSaveDay({ planDate: '2026-11-21', openedOn: '2026-11-21', changedOn: null }), '2026-11-21');
});

test('a past day’s plan opened on purpose keeps its own sleep', () => {
  assert.equal(sleepSaveDay({ planDate: '2026-11-19', openedOn: '2026-11-21', changedOn: '2026-11-22' }), '2026-11-19');
});

test('the save splits: the plan keeps its day, the sleep goes on its own to the later day', () => {
  const row = answersToRow(answers);
  const { plan, sleep } = splitPlanSave({ ...row, status: 'finished' }, '2026-11-21', '2026-11-22');
  assert.equal('sleep_hours' in plan, false);
  assert.equal('sleep_quality' in plan, false);
  assert.equal(plan.grateful_for, 'Coffee');
  assert.equal(plan.status, 'finished');
  assert.deepEqual(sleep, { date: '2026-11-22', values: { sleep_hours: 7.5, sleep_quality: 'good' } });
});

test('a confirmed odd night’s flag moves with its sleep', () => {
  const { plan, sleep } = splitPlanSave({ ...answersToRow({ ...answers, hours: 15 }), sleep_to_confirm: false }, '2026-11-21', '2026-11-22');
  assert.equal('sleep_to_confirm' in plan, false);
  assert.deepEqual(sleep.values, { sleep_hours: 15, sleep_quality: 'good', sleep_to_confirm: false });
});

test('a blank sleep answer is never sent to the later day, so it never wipes one saved there', () => {
  const { sleep } = splitPlanSave(answersToRow({ ...answers, hours: null }), '2026-11-21', '2026-11-22');
  assert.deepEqual(sleep.values, { sleep_quality: 'good' });
  const none = splitPlanSave(answersToRow({ ...answers, hours: null, quality: null }), '2026-11-21', '2026-11-22');
  assert.equal(none.sleep, null);
});

test('with the sleep on the plan’s day the save is unchanged', () => {
  const row = answersToRow(answers);
  const { plan, sleep } = splitPlanSave(row, '2026-11-21', '2026-11-21');
  assert.deepEqual(plan, row);
  assert.equal(sleep, null);
});
