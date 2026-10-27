// npm run test:scores: every worked example in docs/scoring-methods.md, and
// the edge cases for each rule, against src/lib/scores/. The shared cases in
// cases.mjs are also run against the database copies (migration 032).

import test from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../../src/lib/scores/index.js';
import { quadrant } from '../../src/pages/alignment/chartLayout.js';
import fs from 'node:fs';
import { M5_CASES, CALENDAR_CASES, M6_CASES, M9_CASES, M18_CASES, M18_SHOWN_CASES, M19_CASES } from './cases.mjs';

const near = (actual, expected, msg) => {
  if (expected == null) return assert.equal(actual, expected, msg);
  assert.ok(actual != null && Math.abs(actual - expected) < 1e-5, `${msg}: expected ${expected}, got ${actual}`);
};

// ---------------------------------------------------------------- M0
test('M0.1: rounding, halves up; changes from rounded figures; the standard on the shown figure', () => {
  assert.equal(S.m0Round(84.5), 85);
  assert.equal(S.m0Round(84.49), 84);
  assert.equal(S.m0Round(67.9166), 68);
  assert.equal(S.m0Round((0.1 + 0.2) * 100 + 54.5), 85); // floating point lands just under a half
  assert.equal(S.m0RoundHours(7.15), 7.2);
  assert.equal(S.m0Change(83.4, 79.6), 3); // 83 − 80
  assert.equal(S.m0AtStandard(84.5, 85), true);
  assert.equal(S.m0AtStandard(84.4999, 85), false);
});

test('M0.3: working patterns, and a change applies from the next sprint week', () => {
  const week = ['2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27']; // Wed to Tue
  assert.deepEqual(S.m0WorkingDaysOfWeek([], week), ['2026-10-21', '2026-10-22', '2026-10-23', '2026-10-26', '2026-10-27']);
  // Changed on Thursday to Mon, Tue, Wed only: this week keeps Mon to Fri.
  const history = [{ from: '2026-10-22', days: [0, 1, 2] }];
  assert.equal(S.m0WorkingDaysOfWeek(history, week).length, 5);
  const next = week.map((d, i) => ['2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03'][i]);
  assert.deepEqual(S.m0WorkingDaysOfWeek(history, next), ['2026-10-28', '2026-11-02', '2026-11-03']);
  // Any number of days, any days: a Saturday-only pattern.
  assert.deepEqual(S.m0WorkingDaysOfWeek([{ from: '2026-01-01', days: [5] }], next), ['2026-10-31']);
});

for (const c of CALENDAR_CASES) {
  test(`${c.id}: ${c.note}`, () => {
    const r = S.m0SprintCalendar(c.input.sprint, c.input.today);
    assert.deepEqual(r.weeks.map(({ days: _days, ...w }) => w), c.expect.weeks);
    assert.equal(r.plannedEnd, c.expect.plannedEnd);
    assert.equal(r.actualEnd, c.expect.actualEnd);
    for (const w of r.weeks.filter((x) => x.days.length === 7)) {
      for (const d of w.days) assert.ok(!r.recoveryDays.has(d), 'no Recovery day is a sprint day');
    }
  });
}

test('M0.4: a Thursday sprint has Thursday to Wednesday weeks; finished and final', () => {
  const r = S.m0SprintCalendar({ start: '2026-10-01', lengthWeeks: 12 }, '2026-10-15');
  assert.equal(r.weeks.length, 12);
  assert.equal(r.weeks[0].end, '2026-10-07');
  assert.equal(r.weeks[1].finished, true);
  assert.equal(r.weeks[2].finished, false);
  assert.equal(S.m0WeekIsFinal(r.weeks[1], '2026-10-15', false), false); // window closes 17 Oct
  assert.equal(S.m0WeekIsFinal(r.weeks[1], '2026-10-18', false), true);
  assert.equal(S.m0WeekIsFinal(r.weeks[1], '2026-10-15', true), true);
  assert.equal(S.m0WeekOfDay(r.weeks, '2026-10-08'), 2);
});

test('M0.5: eligible weeks', () => {
  const ok = { finished: true, loggedDays: 4, workingDays: 5 };
  assert.equal(S.m0WeekIsEligible(ok), true);
  assert.equal(S.m0WeekIsEligible({ ...ok, loggedDays: 3 }), false, 'thin');
  assert.equal(S.m0WeekIsEligible({ ...ok, workingDays: 3, loggedDays: 3 }), true, 'a 3-day week fully logged');
  assert.equal(S.m0WeekIsEligible({ ...ok, workingDays: 3, loggedDays: 2 }), false);
  assert.equal(S.m0WeekIsEligible({ ...ok, unusual: true }), false);
  assert.equal(S.m0WeekIsEligible({ ...ok, travel: true }), false);
  assert.equal(S.m0WeekIsEligible({ ...ok, recoveryDaysInside: 4 }), false, 'mostly in Recovery');
  assert.equal(S.m0WeekIsEligible({ ...ok, recoveryDaysInside: 3 }), true);
  assert.equal(S.m0WeekIsEligible({ ...ok, finished: false }), false);
});

// ---------------------------------------------------------------- M1
const WEEK = { days: ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25'], workingDays: ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23'] };
const L = (vals) => vals.map((v, i) => (v == null ? null : { date: WEEK.days[i], value: v })).filter(Boolean);

test('M1: the limit rule, as written (a limit of 2: 3 scores 50%, 4 scores 0%; a limit of 0: one over is 0%)', () => {
  assert.equal(S.m1LimitScore(2, 2), 100);
  assert.equal(S.m1LimitScore(3, 2), 50);
  assert.equal(S.m1LimitScore(4, 2), 0);
  assert.equal(S.m1LimitScore(9, 2), 0);
  assert.equal(S.m1LimitScore(0, 0), 100);
  assert.equal(S.m1LimitScore(1, 0), 0);
});

test('M1: the rating rule, as written (target 4, average 3: 67%; lower is better, target 2, average 3: 67%)', () => {
  assert.equal(S.m0Round(S.m1RatingScore(3, 4, 'higher')), 67);
  assert.equal(S.m0Round(S.m1RatingScore(3, 2, 'lower')), 67);
  assert.equal(S.m1RatingScore(1, 4, 'higher'), 0, 'the lowest rating scores 0, not 20');
  assert.equal(S.m1RatingScore(5, 4, 'higher'), 100, 'capped');
  assert.throws(() => S.m1RatingScore(3, 1, 'higher'));
  assert.throws(() => S.m1RatingScore(3, 5, 'lower'));
});

test('M1: each measure type', () => {
  const h = (m) => S.m1HabitScore(m.habit, m.logs, WEEK).score;
  near(h({ habit: { measure: 'count', target: 3, targetPer: 'week' }, logs: L([1, 1]) }), 66.666667, 'count');
  assert.equal(h({ habit: { measure: 'amount', target: 20, targetPer: 'day' }, logs: L([30, 30, 30, 30]) }), 100, 'capped (120 of 100)');
  assert.equal(h({ habit: { measure: 'yes_no_weekly' }, logs: L([0, 0, 1]) }), 100);
  assert.equal(h({ habit: { measure: 'yes_no_weekly' }, logs: L([0, 0, 0]) }), 0);
  assert.equal(h({ habit: { measure: 'yes_no_days_target', target: 4 }, logs: L([1, 1, 1, 0, 0]) }), 75);
  assert.equal(h({ habit: { measure: 'yes_no_days_target' }, logs: L([1, 1, 1, 1, 0]) }), 80, 'no target: every working day');
  assert.equal(h({ habit: { measure: 'yes_no_days_limit', limit: 2 }, logs: L([1, 1, 1, 0, 0]) }), 50);
  assert.equal(h({ habit: { measure: 'count_limit', limit: 2, limitPer: 'day' }, logs: L([2, 3, 2, 2, 2]) }), 90, '11 against 10');
  assert.equal(h({ habit: { measure: 'count_limit', limit: 4, limitPer: 'week' }, logs: L([1, 1, 1, 1, 2]) }), 50);
  near(h({ habit: { measure: 'rating', target: 4, direction: 'higher' }, logs: L([3, 3, 3]) }), 66.666667, 'rating');
});

test('M1: days not logged', () => {
  // Counts: an unlogged day adds nothing.
  assert.equal(S.m1HabitScore({ measure: 'count', target: 5, targetPer: 'week' }, L([1, null, 1]), WEEK).score, 40);
  // Limits and ratings need half the working days: 2 of 5 isn't enough.
  const limit = S.m1HabitScore({ measure: 'yes_no_days_limit', limit: 2 }, L([0, 0]), WEEK);
  assert.deepEqual(limit, { score: 0, notLogged: true });
  const rating = S.m1HabitScore({ measure: 'rating', target: 4, direction: 'higher' }, L([4, 4]), WEEK);
  assert.deepEqual(rating, { score: 0, notLogged: true });
  // 3 of 5 is enough (half or more).
  assert.equal(S.m1HabitScore({ measure: 'yes_no_days_limit', limit: 2 }, L([0, 0, 0]), WEEK).score, 100);
  // A day off logged doesn't count towards the half.
  assert.equal(S.m1HabitScore({ measure: 'rating', target: 4 }, L([4, 4, null, null, null, 4, 4]), WEEK).notLogged, true);
  // An entry still to confirm is left out.
  assert.equal(S.m1HabitScore({ measure: 'count', target: 2, targetPer: 'week' }, [{ date: '2026-10-19', value: 2, toConfirm: true }], WEEK).score, 0);
});

test('M1: no working days means nothing expected (left out), not 0', () => {
  const none = { ...WEEK, workingDays: [] };
  assert.equal(S.m1HabitScore({ measure: 'count', target: 1, targetPer: 'day' }, [], none).score, null);
  assert.equal(S.m1HabitScore({ measure: 'yes_no_days_limit', limit: 1 }, [], none).score, null);
});

test('M1: top numbers', () => {
  assert.equal(S.m1TopNumber({ targetPer: 'day', target: 2 }), 6);
  assert.equal(S.m1TopNumber({ targetPer: 'week', target: 3 }), 20);
  assert.equal(S.m1TopNumber({ topNumber: 3 }), 3);
});

// ---------------------------------------------------------------- M2 to M5
const WEEKS = [
  { number: 1, start: '2026-10-19', end: '2026-10-25' },
  { number: 2, start: '2026-10-26', end: '2026-11-01' },
  { number: 3, start: '2026-11-02', end: '2026-11-08' },
];
const todo = (o) => ({ id: 't', strategyId: 's', impact: 2, createdOn: '2026-10-01', moves: [], doneOn: null, ...o });

test('M2: to-do rules across weeks', () => {
  const each = (t) => WEEKS.map((w) => S.m2TodoScore(t, w, WEEKS));
  assert.deepEqual(each(todo({ plannedWeek: 1, doneOn: '2026-10-21' })), [100, null, null], 'done in its week');
  assert.deepEqual(each(todo({ plannedWeek: 1, doneOn: '2026-11-04' })), [0, 0, 100], 'rolled over twice, then done');
  assert.deepEqual(each(todo({ plannedWeek: 1 })), [0, 0, 0], 'never done: rolls into every week');
  assert.deepEqual(each(todo({ plannedWeek: 3, doneOn: '2026-10-20' })), [100, null, null], 'done early counts where it was done');
  assert.deepEqual(each(todo({ plannedWeek: 1, moves: [{ on: '2026-10-18', toWeek: 3 }] })), [null, null, 0], 'moved before its week started: free');
  assert.deepEqual(each(todo({ plannedWeek: 1, moves: [{ on: '2026-10-19', toWeek: 3 }] })), [0, null, 0], 'moved on its first day: not done that week');
  assert.deepEqual(each(todo({ plannedWeek: 2, moves: [{ on: '2026-10-28', toWeek: null }] })), [null, 0, null], 'taken out of the plan mid-week');
  assert.deepEqual(each(todo({ plannedWeek: 2, createdOn: '2026-10-30', doneOn: null })), [null, 0, 0], 'added mid-week');
  assert.deepEqual(each(todo({ plannedWeek: 1, deleted: true })), [null, null, null], 'deleted');
  assert.equal(S.m2TodoScore(todo({ plannedWeek: 2 }), WEEKS[1], WEEKS, { soFar: true }), null, 'so far: open to-dos wait');
});

test('M3: a win counts in every Strategy picked, once each', () => {
  const items = S.m3WinItems([{ id: 'w', date: '2026-10-20', impact: 1, strategyIds: ['a', 'b', 'a'] }], WEEK.days);
  assert.deepEqual(items.map((i) => i.strategyId), ['a', 'b']);
  assert.ok(items.every((i) => i.score === 100 && i.impact === 1));
});

test('M4: weights, and a Strategy with nothing in it is left out', () => {
  assert.equal(S.m4StrategyScore([{ impact: 'high', score: 0 }, { impact: 'low', score: 100 }]), 25);
  assert.equal(S.m4StrategyScore([{ impact: undefined, score: 50 }]), 50, 'default Medium');
  assert.equal(S.m4StrategyScore([]), null);
  assert.equal(S.m4StrategyScore([{ impact: 3, score: null }]), null);
});

for (const c of M5_CASES) {
  test(`${c.id}: ${c.note}`, () => {
    const r = S.m5WeekFromRaw(c.input);
    near(r.score, c.expect.score, 'score');
    assert.equal(S.m0Round(r.score), c.expect.shown);
    for (const [id, v] of Object.entries(c.expect.strategies)) near(r.strategies.find((s) => s.id === id).score, v, id);
  });
}

test('M5-1 by the formula as written: (2 × 83.3 + 1 × 80.0 + 1 × 25.0) ÷ 4 = 67.9, shown 68, a grey week at 85', () => {
  const score = S.m5WeeklyPerformanceScore([{ score: 250 / 3, served: 2 }, { score: 80, served: 1 }, { score: 25, served: 1 }]);
  assert.equal(S.m0Round(score), 68);
  assert.equal(S.m7WeekColour(score, 85), 'below');
});

// ---------------------------------------------------------------- M6 to M8
for (const c of M6_CASES) {
  test(`${c.id}: ${c.note}`, () => {
    const r = S.m6SprintFigures(c.input.weeks, c.input.standard, c.input.previousAverage);
    near(r.average, c.expect.average, 'average');
    assert.equal(S.m0Round(r.average), c.expect.shown);
    assert.equal(r.finishedWeeks, c.expect.finishedWeeks);
    assert.equal(r.weeksAtStandard, c.expect.weeksAtStandard);
    assert.deepEqual(r.best, c.expect.best);
    assert.equal(r.change, c.expect.change);
  });
}

test('M6: the sponsor summary holds only organisation and development objectives and the Strategies serving them', () => {
  const r = S.m6SponsorSummary({
    methodsVersion: '1.1',
    objectives: [{ id: 'o1', source: 'organisation' }, { id: 'o2', source: 'own' }, { id: 'o3', source: 'development' }],
    strategies: [
      { id: 's1', serves: ['o1', 'o2'], weekScores: [{ score: 80, finished: true }, { score: 90, finished: true }, { score: 10, finished: false }] },
      { id: 's2', serves: ['o2'], weekScores: [{ score: 50, finished: true }] },
    ],
  });
  assert.deepEqual(r.objectives.map((o) => o.id), ['o1', 'o3']);
  assert.deepEqual(r.strategies.map((s) => [s.id, s.serves, s.average]), [['s1', ['o1'], 85]]);
  assert.equal(r.methodsVersion, '1.1');
});

test('M7: standards', () => {
  assert.equal(S.DEFAULT_STANDARD, 85);
  assert.ok(S.m7IsValidStandard(50) && S.m7IsValidStandard(100) && S.m7IsValidStandard(77));
  assert.ok(!S.m7IsValidStandard(49) && !S.m7IsValidStandard(101) && !S.m7IsValidStandard(85.5));
  assert.equal(S.m7WeekColour(84.5, 85), 'good');
  assert.equal(S.m7WeekColour(null, 85), 'none');
});

test('M8-1: weeks 78, 82, 85, 74, 88, 90, 81, 79 give a usual range of 79 to 86%', () => {
  assert.deepEqual(S.m8UsualRange([78, 82, 85, 74, 88, 90, 81, 79]), { low: 79, high: 86, weeks: 8 });
});

test('M8: needs 6 weeks, and uses only the last 16', () => {
  assert.equal(S.m8UsualRange([80, 81, 82, 83, 84]), null);
  assert.ok(S.m8UsualRange([80, 81, 82, 83, 84, 85]));
  const old = Array(10).fill(10);
  const recent = Array.from({ length: 16 }, (_, i) => 70 + i);
  assert.deepEqual(S.m8UsualRange([...old, ...recent]), { low: 74, high: 81, weeks: 16 });
});

// ---------------------------------------------------------------- M9
for (const c of M9_CASES) {
  test(`${c.id}: ${c.note}`, () => {
    const r = S.m9Objective(c.input.objective, c.input);
    for (const [k, v] of Object.entries(c.expect)) {
      if (typeof v === 'number') near(r[k], v, k);
      else assert.deepEqual(r[k], v, k);
    }
  });
}

test('M9-1 sentences', () => {
  const o = M9_CASES[0].input.objective;
  const r = S.m9Objective(o, M9_CASES[0].input);
  const fmt = (d) => ({ '2027-06-30': '30 Jun 2027' }[d]);
  assert.equal(S.m9PaceSentence(o, r, fmt), "You're on pace to reach 38 by 30 Jun 2027.");
  const rating = { kind: 'rating', start: 7, startOn: '2026-07-26', target: 9, byWhen: '2027-06-30', figures: [{ on: '2026-10-26', value: 7.3 }] };
  const rr = S.m9Objective(rating, { asOf: '2026-10-26' });
  assert.equal(S.m9PaceSentence(rating, rr, fmt), "Reaching 9/10 by 30 Jun 2027 needs 0.2 points a month, and you've averaged 0.1.");
});

test('M9: missing dates don\'t crash', () => {
  assert.equal(S.m9Objective({ kind: 'milestone', startOn: '2026-01-01' }, { asOf: '2026-10-26' }).status, 'too_early');
  assert.equal(S.m9Objective({ kind: 'number', start: 1, target: 2, byWhen: '2027-01-01' }, { asOf: '2026-10-26' }).status, 'too_early');
});

test('M9.2: time left in the unit that fits', () => {
  assert.equal(S.m9TimeLeft('2026-10-26', '2026-10-26').text, 'due today');
  assert.equal(S.m9TimeLeft('2026-10-26', '2026-10-23').text, '3 days overdue');
  assert.equal(S.m9TimeLeft('2026-10-26', '2026-10-27').text, '1 day left');
  assert.equal(S.m9TimeLeft('2026-10-26', '2026-11-08').text, '13 days left');
  assert.equal(S.m9TimeLeft('2026-10-26', '2026-11-09').text, '2 weeks left');
  assert.equal(S.m9TimeLeft('2026-10-26', '2027-01-25').text, '13 weeks left');
  assert.equal(S.m9TimeLeft('2026-10-26', '2027-01-26').text, '3 months left');
});

test('M9.3: effort on track within 3 points of the standard', () => {
  assert.equal(S.m9EffortOnTrack([80, 84], 85), true); // 82
  assert.equal(S.m9EffortOnTrack([80, 83], 85), true); // 81.5 shows as 82, which is standard − 3
  assert.equal(S.m9EffortOnTrack([80, 82.9], 85), false); // 81.45 → 81
  assert.equal(S.m9EffortOnTrack([null], 85), false);
});

// ---------------------------------------------------------------- M10 to M12
test('M10: improving and holding back, in order, at most 3 each', () => {
  const obj = (id, result, effortOnTrack = false) => ({ id, name: id, result, effortOnTrack });
  const r = S.m10ImprovingAndHoldingBack({
    standard: 85,
    objectives: [
      obj('a', { reached: false, improving: true, notMoving: false }),
      obj('b', { reached: true, improving: true, notMoving: false }),
      obj('c', { reached: false, improving: false, notMoving: true }, true),
    ],
    strategies: [
      { id: 'good', name: 'good', weeks: [{ score: 90 }, { score: 86 }, { score: 84.5 }] },
      { id: 'low', name: 'low', weeks: [{ score: 90 }, { score: 70 }, { score: 84.4 }] },
    ],
    habits: [{ id: 'h', name: 'h', weeks: [{ score: 100 }, { score: 100 }, { score: 100 }, { score: 100 }] }, { id: 'weak', name: 'weak', weeks: [{ score: 40 }, { score: 49 }] }],
    sleep: { hoursNow: 6.4, hoursBefore: 7.0 },
    stress: ['a_little', 'quite_a_lot', 'very_much'],
  });
  assert.deepEqual(r.improving.map((x) => x.kind), ['objective_reached', 'objective_improving', 'strategy_at_standard']);
  assert.deepEqual(r.holdingBack.map((x) => x.kind), ['strategy_below', 'objective_not_moving', 'habit_low']);
  const empty = S.m10ImprovingAndHoldingBack({ standard: 85 });
  assert.deepEqual(empty, { improving: [], holdingBack: [] });
  const recovery = S.m10ImprovingAndHoldingBack({ standard: 85, sleep: { hoursNow: 6.5, hoursBefore: 7 }, stress: [] });
  assert.deepEqual(recovery.holdingBack.map((x) => [x.kind, x.sleepDown, x.stressHigh]), [['recovery_signals', true, false]]);
});

test('M11: streaks, kept up, logging', () => {
  assert.equal(S.m11DebriefStreak([{ debriefDone: true }, { debriefDone: false }, { debriefDone: true }, { debriefDone: true, recovery: false }, { debriefDone: false, windowOpen: true }]), 2);
  assert.equal(S.m11DebriefStreak([{ debriefDone: true }, { debriefDone: false, recovery: true }, { debriefDone: true }]), 2, 'Recovery does not break it');
  assert.deepEqual(S.m11HabitKeptUp([100, 100, 60, null, 100]), { keptUp: 3, of: 4 });
  assert.deepEqual(S.m11LoggedWorkingDays(WEEK.workingDays, ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-24']), { logged: 4, of: 5 });
  assert.equal(S.m11BreathingSessions(['2026-10-19', '2026-10-19', '2026-10-30'], WEEK.days), 2);
});

test('M12: signals', () => {
  assert.ok(S.m12IsOdd('sleep_hours', 20) && S.m12IsOdd('sleep_hours', 1.5) && !S.m12IsOdd('sleep_hours', 2));
  const sleep = S.m12SleepHours([{ value: 7 }, { value: 6.5 }, { value: 7.5 }, { value: 20, toConfirm: true }]);
  assert.deepEqual(sleep, { average: 7, shown: 7, greenNights: 2, nights: 3 });
  assert.equal(S.m12SleepQuality([{ value: 'poor' }, { value: 'good' }, { value: 'fair' }]).answer, 'fair', 'three tied: the middle');
  assert.equal(S.m12SleepQuality([{ value: 'poor' }, { value: 'good' }]).answer, 'poor', 'two tied: the lower middle');
  assert.equal(S.m12SleepQuality([{ value: 'good' }, { value: 'good' }, { value: 'poor' }]).green, true);
  assert.equal(S.m12StressGreen('a_little'), true);
  assert.deepEqual(S.m12WayOfBeing([6, 7, 7]), { shown: 7, green: true });
  const ec = S.m12EmotionalControl(['above', 'above', 'below']);
  near(ec.share, 66.666667, 'share');
  assert.deepEqual([ec.shown, ec.green, ec.checks], [67, false, 3]);
  assert.equal(S.m12Breathing(0).green, false);
});

// ---------------------------------------------------------------- M13
const M13_1 = { H1: 'h7_8', H2: 'good', H3: 'sometimes', H4: 'h1_2_5', H5: 'd1', H6: 'h8_10', H7: 'good', H8: 'u8_14', H9: 'never', H10: 'ok', H11: 'high', H12: 'good', H13: 'a_little' };

test('M13-1: Hardware score 67.5, shown as 68/100', () => {
  const s = S.m13CheckinScores(M13_1);
  assert.deepEqual(s.hardwareAreas, { sleep: 87.5, movement: 45, fuel: 85, stress: 50, mood_energy: 62.5, health: 75 });
  assert.equal(s.hardware, 67.5);
  assert.equal(S.m0Round(s.hardware), 68);
  assert.equal(s.software, null, 'no Software answers in the example');
});

test('M13: Software, results and the coach flags', () => {
  const answers = { ...M13_1, S1: 'often', S2: 'sometimes', S3: 'always', S4: 'often', S5: 'rarely', S6: 'never' };
  const now = S.m13CheckinScores(answers);
  near(now.software, 54.166667, 'software'); // (75 + 50 + 100 + 75 + 25 + 0) ÷ 6
  const before = S.m13CheckinScores({ ...answers, H1: 'h6_7', S3: 'sometimes', H4: 'none' });
  const r = S.m13Results(now, before);
  assert.deepEqual(r.improved.map((x) => [x.key, x.change]), [['focus', 50], ['movement', 20], ['sleep', 13]]);
  assert.equal(r.workOn.key, 'movement');
  assert.deepEqual(S.m13Results(now, before, { focus: 60, movement: 20 }).improved.map((x) => x.key), ['sleep'], 'only rises bigger than the typical swing');
  assert.equal(S.m13Results(now, null).hardwareChange, null);
  // Tie order for one thing to work on: Sleep before Movement.
  const tie = S.m13CheckinScores({ ...M13_1, H1: 'h5_6', H2: 'poor', H4: 'h1_2_5', H5: 'd0', H6: 'h4_6' });
  assert.equal(tie.hardwareAreas.sleep, 32.5);
  assert.equal(S.m13Results(tie, null).workOn.key, 'sleep');
  // Flags.
  assert.deepEqual(S.m13Flags(M13_1), []);
  const bad = { ...M13_1, H10: 'very_low', H8: 'over_35', H9: 'weekly', H3: 'always', H13: 'very_much', H1: 'under_5' };
  assert.deepEqual(S.m13Flags(bad).map((f) => f.reason), ['mood_very_low', 'units_over_35', 'heavy_sessions_weekly', 'stress_always', 'pain']);
  assert.deepEqual(S.m13Flags(bad, { H2: 'very_poor' }).map((f) => f.reason).includes('poor_sleep_two_months'), true);
  assert.throws(() => S.m13Points('H1', 'twelve'));
});

// ---------------------------------------------------------------- M15 to M19
test('M15: the goal check readings', () => {
  assert.equal(S.m15GoalCheck({ enjoy: 5, matters: 5, guilty: 2, someoneElse: 2 }).reading, 'own_reasons');
  assert.equal(S.m15GoalCheck({ enjoy: 1, matters: 2, guilty: 4, someoneElse: 5 }).reading, 'pressure');
  assert.equal(S.m15GoalCheck({ enjoy: 3, matters: 4, guilty: 3, someoneElse: 2 }).reading, 'mixed');
  assert.equal(S.m15GoalCheck({ enjoy: 2, matters: 2, guilty: 2, someoneElse: 1 }).sentence, "doesn't have a strong reason behind it yet");
  const edge = S.m15GoalCheck({ enjoy: 4, matters: 3, guilty: 2, someoneElse: 2 }); // balance exactly +1.5
  assert.equal(edge.reading, 'own_reasons');
  assert.equal(S.m15FlagsCoach('organisation', S.m15GoalCheck({ enjoy: 1, matters: 1, guilty: 5, someoneElse: 5 })), true);
  assert.equal(S.m15FlagsCoach('own', S.m15GoalCheck({ enjoy: 1, matters: 1, guilty: 5, someoneElse: 5 })), false);
  assert.throws(() => S.m15GoalCheck({ enjoy: 0, matters: 1, guilty: 1, someoneElse: 1 }));
});

test('M16: link ratings and hidden names', () => {
  const r = S.m16RatingSummary([{ ratings: { a: 6, b: 8 } }, { ratings: { a: 8 } }], ['a', 'b', 'c']);
  assert.deepEqual(r, { a: { average: 7, answers: 2 }, b: { average: 8, answers: 1 }, c: { average: null, answers: 0 } });
  assert.equal(S.m16NamesHidden(2, true), false);
  assert.equal(S.m16NamesHidden(3, true), true);
  assert.equal(S.m16NamesHidden(9, false), false);
});

test('M17: before and after impact', () => {
  const r = (raterId, phase, answer, behaviourId = 'b1') => ({ raterId, phase, answer, behaviourId });
  const one = S.m17BeforeAndAfter([r('x', 'start', 'sometimes'), r('x', 'end', 'often')]);
  assert.equal(one.enough, false, 'needs 2 raters at both');
  const res = S.m17BeforeAndAfter([
    r('x', 'start', 'sometimes'), r('x', 'end', 'often'), r('x', 'looking_back', 'rarely'),
    r('y', 'start', 'rarely'), r('y', 'end', 'sometimes'), r('y', 'looking_back', 'rarely'),
    r('z', 'start', 'never'), // only at the start: not counted
  ]);
  assert.equal(res.enough, true);
  assert.equal(res.raters, 2);
  assert.equal(res.change, 25);
  assert.equal(res.lookingBackChange, 37.5);
  assert.equal(res.improved, true);
  const small = S.m17BeforeAndAfter([r('x', 'start', 'often'), r('x', 'end', 'often'), r('y', 'start', 'often'), r('y', 'end', 'always'), r('y', 'start', 'often', 'b2'), r('y', 'end', 'often', 'b2'), r('x', 'start', 'often', 'b2'), r('x', 'end', 'often', 'b2')]);
  assert.equal(small.change, 6.25);
  assert.equal(small.improved, false);
  // an answer that can't be scored is no change; start and end cover the same behaviours
  const bad = S.m17BeforeAndAfter([r('a', 'start', 'dont_know'), r('a', 'end', 'often'), r('b', 'start', 'dont_know'), r('b', 'end', 'often')]);
  assert.equal(bad.enough, false);
  const sameBeh = S.m17BeforeAndAfter([r('a', 'start', 'never', 'x'), r('a', 'start', 'always', 'y'), r('a', 'end', 'sometimes', 'x'),
    r('b', 'start', 'never', 'x'), r('b', 'start', 'always', 'y'), r('b', 'end', 'sometimes', 'x')]);
  assert.equal(sameBeh.change, 50);
});

for (const c of M18_CASES) {
  test(`${c.id}: ${c.note}`, () => {
    const r = S.m18PulseResults({ ...c.input, seed: 7 });
    assert.equal(r.answers, c.expect.answers);
    for (const [k, v] of Object.entries(c.expect.measures)) {
      near(r.measures[k].figure, v.figure, k);
      assert.equal(r.measures[k].answers, v.answers);
      assert.equal(r.measures[k].change, v.change, `${k} change`);
    }
    assert.equal(r.nextStep, S.PULSE_MEASURES.find((m) => m.key === c.expect.lowest).step);
    assert.equal(r.named.length, c.expect.named);
    assert.equal(r.comments.length, c.expect.comments);
  });
}

for (const c of M18_SHOWN_CASES) {
  test(`${c.id}: results ${c.expect.shown ? 'show' : `stay private (${c.expect.reason})`}`, () => {
    const r = S.m18ResultsShown(c.input);
    assert.equal(r.shown, c.expect.shown);
    assert.equal(r.reason, c.expect.reason);
    assert.equal(r.answers, c.expect.answers);
  });
}

test('M18: the boss\'s words, and the database runs the same cases (033 test)', () => {
  assert.equal(S.m18ResultsShown({ closed: true, answers: 2 }).message, '2 people answered, so the results stay private.');
  assert.equal(S.m18ResultsShown({ closed: true, answers: 1 }).message, '1 person answered, so the results stay private.');
  assert.equal(S.m18ResultsShown({ closed: false, answers: 2 }).message, 'Results show once the pulse closes.');
  assert.equal(S.PULSE_MEASURES.find((m) => m.key === 'stress').name, 'Calm');
  assert.equal(S.PULSE_OPEN_DAYS, 7);
  const sql = fs.readFileSync(new URL('../../supabase/033_pulse_wellbeing_seat_standard_test.sql', import.meta.url), 'utf8');
  for (const c of M18_SHOWN_CASES) {
    const call = `public.score_m18_shown(${c.input.closed}, ${c.input.answers}, ${c.input.named})`;
    assert.ok(sql.includes(call), `the 033 test runs ${c.id} (${call})`);
  }
});

test('M18: own questions, comment order, small teams', () => {
  const r = S.m18PulseResults({
    wentTo: 3,
    ownQuestions: [{ id: 'q1', kind: 'rating' }, { id: 'q2', kind: 'text' }],
    answers: [{ own: { q1: 6, q2: 'More time' } }, { own: { q1: 9 } }],
    seed: 1,
  });
  assert.deepEqual(r.own.q1, { average: 7.5, answers: 2 });
  assert.deepEqual(r.own.q2.texts, ['More time']);
  assert.equal(r.nextStep, null);
  const comments = ['a', 'b', 'c', 'd', 'e'];
  assert.deepEqual([...S.m18Shuffle(comments, 3)].sort(), comments);
  assert.equal(S.m18SmallTeam(4), true);
  assert.equal(S.m18SmallTeam(5), false);
});

for (const c of M19_CASES) {
  test(`${c.id}: ${c.note}`, () => {
    const r = S.m19GroupFigures(c.input);
    near(r.headline.percent, c.expect.headline, 'headline');
    assert.equal(r.headline.shown, c.expect.shown);
    assert.equal(r.headline.counted, c.expect.counted);
    assert.equal(r.headline.tooEarly, c.expect.tooEarly);
    assert.equal(r.seats, c.expect.seats);
    assert.deepEqual(r.use, c.expect.use);
    near(r.behaviour.atOwnStandard, c.expect.atOwnStandard, 'at own standard');
    near(r.behaviour.averageStrategyScore, c.expect.averageStrategyScore, 'average Strategy score');
  });
}

test('M19: the headline counts, with nothing yet', () => {
  assert.deepEqual(S.m19Headline([]), { percent: null, shown: null, counted: 0, onTrack: 0, reached: 0, tooEarly: 0 });
  assert.equal(S.m19Headline(['too_early', 'too_early']).percent, null);
  assert.equal(S.m19GroupFigures({ seats: [] }).use, null);
});

// ---------------------------------------------------------------- M20
// Methods 1.2 counts Embryonic as 2.5 (Data platform 36.46). The code keeps 4 until the
// Health Check build changes both together (decisions part 2, 27 Oct, 14:45).
test('M20-1 and M20-2: the Health Check, as the code works it out today (importance 58%; attention 58.33 and 27.34; the tie-break)', () => {
  const ids = ['a', 'b', 'c', 'd'];
  assert.equal(S.m0Round(S.m20StrategicImportance({ a: 0, b: 2, c: 2, d: 3 }, ids)), 58);
  assert.equal(S.m20StrategicImportance({ a: 3, gone: 3 }, ['a', 'b']), 50, 'a deleted factor is ignored');
  assert.equal(S.m20IsRated({ gone: 2 }, ids), false);
  near(S.m20AttentionScore(700 / 12, 1, 5), 58.333333, 'Data platform');
  near(S.m20AttentionScore(500 / 12, 2, 4), 27.34375, 'Leadership programme');
  near(S.m20AttentionScore(50, 3, null), 18.75, 'a blank resource counts as Moderate');
  assert.equal(S.m20AttentionScore(50, null, 3), -1, 'no progress yet sorts last');
  const ranked = S.m20RankProjects(
    [{ id: 'p1', text: 'One' }, { id: 'p2', text: 'Two' }, { id: 'p3', text: 'Three' }, { id: 'p4', text: 'Four' }],
    [{ id: 'f1' }, { id: 'f2' }],
    {
      p1: { contrib: { f1: 3, f2: 3 }, progress: 3, resource: 5 }, // 100 × 2/4 × 1 = 50
      p2: { contrib: { f1: 3, f2: 3 }, progress: 3, resource: 2 }, // 100 × 2/4 × 5/8 = 31.25
      p3: { contrib: { f1: 3, f2: 0 }, progress: 1, resource: 2 }, // 50 × 1 × 5/8 = 31.25, lower importance
      p4: { contrib: {}, progress: null },
    },
  );
  assert.deepEqual(ranked.map((r) => r.project.id), ['p1', 'p2', 'p3', 'p4'], 'ties go to higher importance, then higher resource');
  assert.equal(ranked[3].rated, false);
  assert.equal(S.m20AverageImportance(ranked), 83);
  assert.equal(S.m20AverageImportance([]), 0);
  near(S.m20Alignment([{ rated: true, progress: 4, importance: 60 }, { rated: true, progress: 3, importance: 90 }, { rated: false, progress: 5, importance: 0 }]), 50, 'alignment');
});

test('M20.1: m20Area agrees with the chart\'s quadrant on every input', () => {
  const map = { mi: 'good', co: 'behind', n: 'neutral' };
  for (const progress of [null, 1, 2, 3, 4, 5]) {
    for (let imp = 0; imp <= 100; imp += 0.5) assert.equal(S.m20Area(progress, imp), map[quadrant(progress, imp)]);
  }
  assert.equal(S.m20Area(4, 50), 'neutral', 'exactly 50% is not above the line');
  assert.equal(S.m20Area(3, 99), 'neutral', 'Fair sits on the line');
});

test('M20-3: the Life balance review, from the code (0 to 10 per area; the mock-up\'s example)', () => {
  const areas = ['career', 'financial', 'health', 'relationships', 'romance', 'growth', 'fun', 'home', 'contribution', 'meaning'];
  const ck = (date, scores) => ({ date, scores: Object.fromEntries(areas.map((k, i) => [k, scores[i]])) });
  const range = [ck('2026-05-08', [7, 5, 6, 6, 4, 6, 5, 7, 5, 6]), ck('2026-07-02', [7, 6, 6, 7, 4, 7, 5, 7, 5, 6]), ck('2026-09-10', [8, 6, 7, 7, 4, 7, 4, 7, 6, 7]), ck('2026-10-15', [8, 6, 7, 8, 5, 7, 4, 8, 6, 7])];
  const targets = [8, 7, 8, 8, 7, 7, 5, 7, 6, 7];
  const active = areas.map((key, i) => ({ key, kind: 'standard', target: targets[i] }));
  const st = S.m20LifeBalanceStats(range, active);
  assert.equal(st.average.toFixed(1), '6.6');
  assert.equal(st.averageFrom.toFixed(1), '5.7');
  assert.deepEqual([st.biggestRise.change, st.biggestRise.area.key], [2, 'relationships']);
  assert.deepEqual([st.biggestDrop.change, st.biggestDrop.area.key], [-1, 'fun']);
  assert.deepEqual([st.targets.gap, st.targets.area.key, st.targets.onTarget, st.targets.withTarget], [2, 'romance', 6, 10]);
  const one = S.m20LifeBalanceStats([range[3]], areas.map((key) => ({ key, kind: 'standard', target: null })));
  assert.deepEqual([one.highest.score, one.highest.area.key, one.lowest.score, one.lowest.area.key, one.atSevenPlus.count], [8, 'career', 4, 'fun', 6]);
  assert.equal(S.m20LifeBalanceAverage([8, null, 6]), 7);
});
