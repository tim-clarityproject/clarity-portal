// Recovery's sleep chart (Tim, 3 Nov 2026): the nights, their colours, the
// usual quality, the action under the chart and the target range.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readSleepTarget,
  recoverySleepView,
  rangeWords,
  stepSleepTarget,
  usualQuality,
} from '../../src/lib/performance/sleepChart.js';

const recovery = { start_on: '2026-10-30', chosen_days: 7, extended_days: 0, ended_at: null, end_on: null };
const night = (local_date, sleep_hours, sleep_quality) => ({ local_date, sleep_hours, sleep_quality });
const target = { from: 7, to: 9, own: false };

test('one slot per day of the Recovery, Day 1 holding the night before it started', () => {
  const v = recoverySleepView({ recovery, nights: [night('2026-10-30', 7.5, 'good'), night('2026-11-03', '6.5', 'fair')], today: '2026-11-03', target });
  assert.equal(v.slots.length, 7);
  assert.deepEqual(v.slots.map((s) => s.axis), ['Day 1', 'Day 2', 'Day 3', 'Day 4', 'Last night', 'Day 6', 'Day 7']);
  assert.equal(v.slots[0].night, 'Night of 29 Oct');
  assert.equal(v.slots[4].night, 'Night of 2 Nov');
  assert.deepEqual(v.slots.map((s) => s.state), ['good', 'none', 'none', 'none', 'below', 'next', 'next']);
  assert.equal(v.last.hours, 6.5);
  assert.equal(v.enough, true);
});

test('inside or above the range is mint, below it grey; 7 counts as inside', () => {
  const v = recoverySleepView({ recovery, nights: [night('2026-10-30', 7, 'good'), night('2026-10-31', 6.5, 'good'), night('2026-11-01', 11, 'good')], today: '2026-11-01', target });
  assert.deepEqual(v.slots.slice(0, 3).map((s) => s.state), ['good', 'below', 'good']);
});

test('the empty frame until two nights hold hours', () => {
  assert.equal(recoverySleepView({ recovery, nights: [night('2026-11-03', 7, 'good')], today: '2026-11-03', target }).enough, false);
  assert.equal(recoverySleepView({ recovery, nights: [night('2026-11-02', null, 'good'), night('2026-11-03', 7, null)], today: '2026-11-03', target }).enough, false);
});

test('Usual quality: the most common word, ties going to the better word', () => {
  assert.equal(usualQuality(['fair', 'good', 'fair', 'good', 'poor']), 'good');
  assert.equal(usualQuality(['very_poor', 'very_poor', 'very_good']), 'very_poor');
  assert.equal(usualQuality([null, 'nonsense']), null);
});

test('the action: below, inside and above, never repeating the figures', () => {
  const act = (h) => recoverySleepView({ recovery, nights: [night('2026-11-03', h, 'good')], today: '2026-11-03', target }).action;
  assert.deepEqual(act(6.5).lines, ['Last night was under your target range.', 'Tonight, Sleep wind down could help.']);
  assert.equal(act(6.5).windDown, true);
  assert.deepEqual(act(9).lines, ['Last night was inside your target range.', 'Keep doing what’s working.']);
  assert.deepEqual(act(10).lines, ['Last night was above your target range.', 'Keep doing what’s working.']);
  assert.equal(act(10).windDown, false);
  for (const h of [6.5, 9, 10]) assert.ok(act(h).lines.every((l) => !/\d/.test(l)));
  assert.equal(recoverySleepView({ recovery, nights: [], today: '2026-11-03', target }).action, null);
});

test('the target range: 7 to 9 until changed, half hours from 4 to 12, start below end', () => {
  assert.deepEqual(readSleepTarget({}), { from: 7, to: 9, own: false });
  assert.deepEqual(readSleepTarget({ sleep_target: { from: 6.5, to: 8 } }), { from: 6.5, to: 8, own: true });
  for (const bad of [{ from: 9, to: 7 }, { from: 3, to: 8 }, { from: 7, to: 13 }, { from: 7.2, to: 9 }, { from: 8, to: 8 }, 'x']) {
    assert.equal(readSleepTarget({ sleep_target: bad }).own, false);
  }
  assert.deepEqual(stepSleepTarget({ from: 7, to: 9 }, 'from', 9.5), { from: 8.5, to: 9 });
  assert.deepEqual(stepSleepTarget({ from: 7, to: 9 }, 'to', 6), { from: 7, to: 7.5 });
  assert.deepEqual(stepSleepTarget({ from: 7, to: 9 }, 'from', 2), { from: 4, to: 9 });
  assert.deepEqual(stepSleepTarget({ from: 7, to: 9 }, 'to', 20), { from: 7, to: 12 });
  assert.equal(rangeWords({ from: 6.5, to: 8 }), '6.5 to 8 hours');
});

test('a Recovery past its chosen end still shows today', () => {
  const v = recoverySleepView({ recovery: { ...recovery, chosen_days: 2 }, nights: [], today: '2026-11-03', target });
  assert.equal(v.slots.length, 5);
  assert.equal(v.slots[4].axis, 'Last night');
});
