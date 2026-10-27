// npm run test:convert: what each kind of old tactic is proposed as.

import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeTactic, proposePlan, reportFor } from '../../scripts/convert-plans/propose.mjs';

const t = (action, type, extra = {}) => ({ id: action, action, type, ...extra });

test('Numbers done again and again become habits', () => {
  const a = proposeTactic(t('Referral conversations', 'measurable', { target_value: 3, unit: 'per week' }));
  assert.deepEqual([a.becomes, a.habit.measure, a.habit.targetPer, a.habit.target], ['habit', 'count', 'week', 3]);
  const b = proposeTactic(t('Reading', 'measurable', { target_value: 20, unit: 'minutes a day' }));
  assert.deepEqual([b.becomes, b.habit.targetPer], ['habit', 'day']);
  assert.equal(proposeTactic(t('Training sessions', 'measurable', { target_value: 3, unit: 'sessions' })).becomes, 'habit');
});

test('Results become objective measures', () => {
  const a = proposeTactic(t('Revenue from referrals', 'measurable', { target_value: 250000, unit: '£', current_value: 120000 }));
  assert.deepEqual([a.becomes, a.confidence, a.objective.start, a.objective.target], ['objective_measure', 'clear', 120000, 250000]);
  assert.equal(proposeTactic(t('Customer NPS', 'measurable', { target_value: 50, unit: 'NPS' })).becomes, 'objective_measure');
  const unsure = proposeTactic(t('Open roles filled', 'measurable', { target_value: 6 }));
  assert.deepEqual([unsure.becomes, unsure.confidence], ['objective_measure', 'check']);
});

test('Ticked tactics: recurring ones become habits, end points milestones, the rest to-dos', () => {
  assert.equal(proposeTactic(t('Daily stand-up with site leads', 'tickable')).habit.measure, 'yes_no_days_target');
  assert.equal(proposeTactic(t('Weekly one-to-one with each rep', 'tickable')).habit.measure, 'yes_no_weekly');
  assert.equal(proposeTactic(t('Launch the new booking site by March', 'tickable')).becomes, 'milestone');
  assert.equal(proposeTactic(t('Email three past clients', 'tickable')).becomes, 'todo');
  assert.equal(proposeTactic(t('Book a holiday', 'tickable', { is_done: true })).becomes, 'history');
});

test('Every proposal says why', () => {
  for (const x of [t('A', 'tickable'), t('B', 'measurable'), t('Steps', 'measurable', { target_value: 8000, unit: 'steps' })]) {
    assert.ok(proposeTactic(x).reason.length > 20);
  }
});

test('The plan: long names shortened at a word, gaps flagged, history kept', () => {
  const p = proposePlan({
    person: { id: 'x', name: 'Invented Person' },
    mission: { title: 'x '.repeat(80) },
    strategies: [{ id: 's', name: 'Empty one', tactics: [] }],
    versions: 3, reviews: 2, archivedMissions: 1,
  });
  assert.ok(p.mission.length <= 120);
  assert.ok(p.flags.some((f) => f.includes('longer than 120')));
  assert.ok(p.flags.some((f) => f.includes('no tactics')));
  assert.ok(p.flags.some((f) => f.includes('set with the coach')));
  assert.deepEqual(p.keptAsHistory, { versions: 3, reviews: 2, archivedMissions: 1 });
  const report = reportFor(p);
  assert.ok(report.startsWith('# Plan conversion proposal: Invented Person'));
  assert.ok(report.includes('A proposal only.'));
  assert.equal(proposePlan({ person: { id: 'y', name: 'No mission' }, mission: null, strategies: [] }).mission, null);
});
