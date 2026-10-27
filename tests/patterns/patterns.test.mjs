// npm run test:patterns: the pattern engine (methods M14) on cases with
// known answers. The simulation (npm run sim:patterns) proves the rates.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  M14, m14Rng, m14WeeklyResiduals, m14DailyResiduals, m14ShuffleTest, m14BenjaminiHochberg,
  m14Links, m14Check, m14Steady, m14QuestionAllowed, m14HowWorkedOut,
} from '../../src/lib/scores/m14.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: expected ${b} ± ${tol}, got ${a}`);

// ---------------------------------------------------------------- the correction
test('Benjamini and Hochberg: a small worked case', () => {
  const q = m14BenjaminiHochberg([0.01, 0.04, 0.03, 0.005]);
  [0.02, 0.04, 0.04, 0.02].forEach((v, i) => near(q[i], v, 1e-12, `q${i}`));
});

test('Benjamini and Hochberg: the 1995 paper\'s 15 tests reject the first 4 at 5%', () => {
  const p = [0.0001, 0.0004, 0.0019, 0.0095, 0.0201, 0.0278, 0.0298, 0.0344, 0.0459, 0.3240, 0.4262, 0.5719, 0.6528, 0.7590, 1.0];
  const q = m14BenjaminiHochberg(p);
  assert.equal(q.filter((x) => x < 0.05).length, 4);
  assert.ok(q.every((x, i) => x >= p[i]));
});

// ---------------------------------------------------------------- the shuffle test
test('The shuffle test: two perfectly separate groups of 4 have an exact chance of 2 in 70', () => {
  const res = [1, 2, 3, 4, 11, 12, 13, 14];
  const groups = [false, false, false, false, true, true, true, true];
  const r = m14ShuffleTest(res, groups, res.map(() => 0), { rng: m14Rng(1) });
  near(r.p, 2 / 70, 0.008, 'p');
  assert.equal(r.shuffles, 10000);
});

test('The shuffle test respects its blocks: labels never move between blocks', () => {
  const res = [1, 2, 3, 4, 11, 12, 13, 14];
  const groups = [false, false, false, false, true, true, true, true];
  const r = m14ShuffleTest(res, groups, [0, 0, 0, 0, 1, 1, 1, 1], { rng: m14Rng(2), shuffles: 500 });
  assert.equal(r.p, 1);
});

test('The shuffle test: no difference, no small chance', () => {
  const rng = m14Rng(3);
  const res = Array.from({ length: 30 }, () => rng());
  const groups = res.map((_, i) => i % 2 === 0);
  assert.ok(m14ShuffleTest(res, groups, res.map(() => 0), { rng }).p > 0.05);
});

test('Early stopping stops only when the chance is clearly too big to matter', () => {
  const rng = m14Rng(4);
  const res = Array.from({ length: 30 }, () => rng());
  const groups = res.map((_, i) => i % 2 === 0);
  const early = m14ShuffleTest(res, groups, res.map(() => 0), { rng: m14Rng(5), stopAbove: 0.05 });
  assert.ok(early.early && early.shuffles < 10000);
  const sep = m14ShuffleTest([1, 2, 3, 4, 11, 12, 13, 14], [false, false, false, false, true, true, true, true], Array(8).fill(0), { rng: m14Rng(6), stopAbove: 0.05 });
  assert.equal(sep.early, false, 'a small chance always gets every shuffle');
});

// ---------------------------------------------------------------- allowing for getting better
test('Weekly trend removal: the median of 9 weeks centred on each, at least 5 at the ends', () => {
  const r = m14WeeklyResiduals([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(r, [-2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2]);
  // a steady climb leaves nothing in the middle weeks
  const climb = m14WeeklyResiduals(Array.from({ length: 20 }, (_, i) => 50 + 2 * i));
  assert.ok(climb.slice(4, 16).every((x) => x === 0));
  // a one-off good week stands out
  const spike = m14WeeklyResiduals([70, 70, 70, 70, 90, 70, 70, 70, 70]);
  assert.equal(spike[4], 20);
});

test('Daily trend removal: against the same weekday in the 4 weeks either side', () => {
  const days = Array.from({ length: 63 }, (_, i) => ({ index: i, weekday: i % 7, value: i % 7 === 0 ? 10 : 50 }));
  days[28].value = 20; // one Monday 10 points up on the other Mondays
  const r = m14DailyResiduals(days);
  assert.equal(r[28], 10);
  assert.equal(r[29], 0, 'Tuesdays only against Tuesdays');
});

// ---------------------------------------------------------------- the links
function person({ weeks = 26, kept, without, score, habitScore } = {}) {
  return {
    weeks: Array.from({ length: weeks }, (_, t) => ({
      eligible: true,
      score: score ? score(t) : 70,
      stress: null,
      wayOfBeing: null,
      habits: { h1: { strategyId: 's1', kept: kept(t) } },
      strategies: { s1: { score: habitScore ? habitScore(t) : 70, without: { h1: without(t) }, atStandard: false } },
      objectives: {},
    })),
    days: [],
  };
}

test('No link contains its own cause: L3 uses the Strategy\'s score without the habit', () => {
  // The Strategy's score with the habit tracks it exactly; without it, it's flat.
  const p = person({ kept: (t) => t % 2 === 0, habitScore: (t) => (t % 2 === 0 ? 100 : 40), without: () => 70 });
  const l3 = m14Links(p).find((l) => l.id === 'L3');
  assert.ok(l3.units.every((u) => u.residual === 0), 'the result is the score without the habit');
  const results = m14Check(p, { rng: m14Rng(7) });
  assert.equal(results.filter((r) => r.passes).length, 0, 'no card from arithmetic alone');
});

test('A planted link the size of the usual swing, in 13 weeks of each, is found', () => {
  const rng = m14Rng(8);
  const kept = Array.from({ length: 26 }, (_, t) => [1, 0, 0, 1, 1, 0, 1, 0, 1, 0, 0, 1, 1, 0, 1, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0][t] === 1);
  const noise = Array.from({ length: 26 }, () => (rng() - 0.5) * 12);
  const p = person({ kept: (t) => kept[t], without: (t) => 70 + noise[t] + (kept[t] ? 14 : 0) });
  const r = m14Check(p, { rng: m14Rng(9) }).find((x) => x.id === 'L3');
  assert.ok(r.passes, `found (q ${r.q})`);
  assert.equal(r.positive, true);
  assert.deepEqual(r.sizes, [13, 13]);
  const how = m14HowWorkedOut(r);
  assert.ok(how.heldInBothHalves && /^about 1 in \d+$/.test(how.chance));
});

test('At least 6 weeks in each group', () => {
  const p = person({ kept: (t) => t < 5, without: (t) => (t < 5 ? 95 : 50) });
  assert.equal(m14Check(p, { rng: m14Rng(10) }).length, 0, 'not even checked');
});

test('It must hold in both halves', () => {
  const kept = (t) => t % 2 === 0;
  // a big gap in the first half only
  const p = person({ kept, without: (t) => (t < 13 && kept(t) ? 95 : 60) + (t % 3) });
  const r = m14Check(p, { rng: m14Rng(11) }).find((x) => x.id === 'L3');
  assert.equal(r.holds, false);
  assert.equal(r.passes, false);
});

test('Big enough to matter: a tiny steady gap is not a card, however unlikely by chance', () => {
  const kept = (t) => t % 2 === 0;
  const p = person({ kept, without: (t) => 70 + (kept(t) ? 2 : 0) + 0.01 * (t % 5) });
  const r = m14Check(p, { rng: m14Rng(12) }).find((x) => x.id === 'L3');
  assert.equal(r.bigEnough, false, 'under 3 points of a score');
  assert.equal(r.passes, false);
});

test('Same-week links (L4, L5) must reach Strong', () => {
  const rng = m14Rng(13);
  const calm = Array.from({ length: 26 }, (_, t) => t % 2 === 0);
  const base = person({ kept: () => null, without: () => null });
  const mk = (effect) => ({
    ...base,
    weeks: base.weeks.map((w, t) => ({ ...w, habits: {}, strategies: {}, stress: calm[t] ? 'a_little' : 'quite_a_lot', score: 70 + (calm[t] ? effect : 0) + (rng() - 0.5) * 10 })),
  });
  const weak = m14Check(mk(5), { rng: m14Rng(14) }).find((x) => x.id === 'L4');
  assert.equal(weak.sameWeek, true);
  if (weak.q < M14.alpha && weak.bigEnough && weak.holds) assert.equal(weak.passes, weak.strength === 'strong');
  const strong = m14Check(mk(20), { rng: m14Rng(15) }).find((x) => x.id === 'L4');
  assert.equal(strong.passes, true);
  assert.equal(strong.strength, 'strong');
});

test('A link the other way is coach-only', () => {
  const kept = (t) => t % 2 === 0;
  const rng = m14Rng(16);
  const p = person({ kept, without: (t) => 70 - (kept(t) ? 15 : 0) + (rng() - 0.5) * 6 });
  const r = m14Check(p, { rng: m14Rng(17) }).find((x) => x.id === 'L3');
  assert.equal(r.passes, true);
  assert.equal(r.positive, false);
  const s = m14Steady([r], { cards: [] }, 1);
  assert.equal(s.added, null, 'nothing new for the person');
  assert.equal(s.cards.length, 1, 'one card for the coach');
  assert.equal(s.cards[0].positive, false);
});

test('A question whose result contains its cause is refused', () => {
  const weeks = [{ habits: { h1: { strategyId: 's1' } } }];
  assert.equal(m14QuestionAllowed({ cause: { kind: 'habit', id: 'h1' }, result: { kind: 'weekly_score' } }, weeks).allowed, false);
  assert.equal(m14QuestionAllowed({ cause: { kind: 'habit', id: 'h1' }, result: { kind: 'strategy', id: 's1' } }, weeks).message, "That one would always look linked, so it can't be checked.");
  assert.equal(m14QuestionAllowed({ cause: { kind: 'habit', id: 'h1' }, result: { kind: 'strategy', id: 's2' } }, weeks).allowed, true);
  assert.equal(m14QuestionAllowed({ cause: { kind: 'stress' }, result: { kind: 'weekly_score' } }, weeks).allowed, true);
});

// ---------------------------------------------------------------- staying steady
const res = (key, q, gap, passes = q < 0.05) => ({ key, id: key.slice(0, 2), q, gap, positive: gap > 0, passes });

test('A card stays at least 4 weeks unless it clearly fails', () => {
  let state = m14Steady([res('L3:a', 0.01, 5)], { cards: [] }, 10);
  assert.equal(state.added.key, 'L3:a');
  assert.equal(m14Steady([res('L3:a', 0.15, 5, false)], state, 11).cards.length, 1, 'weaker, but not clearly failing: kept');
  assert.equal(m14Steady([res('L3:a', 0.3, 5, false)], state, 11).cards.length, 0, 'chance over 1 in 5: removed');
  assert.equal(m14Steady([res('L3:a', 0.01, -5)], state, 11).cards.filter((c) => c.positive).length, 0, 'the gap reversed: removed');
  assert.equal(m14Steady([res('L3:a', 0.15, 5, false)], state, 14).cards.length, 0, 'after 4 weeks it must pass again');
  state = m14Steady([res('L3:a', 0.15, 5, false)], state, 13);
  assert.equal(state.cards.length, 1);
});

test('At most one new card a week, and at most 4', () => {
  const all = ['L3:a', 'L3:b', 'L3:c', 'L3:d', 'L3:e'].map((k, i) => res(k, 0.001 * (i + 1), 5));
  let state = { cards: [] };
  for (let w = 1; w <= 6; w += 1) {
    const next = m14Steady(all, state, w);
    assert.ok(next.cards.filter((c) => c.positive).length <= 4);
    assert.ok(next.cards.length - state.cards.length <= 1);
    state = next;
  }
  assert.deepEqual(state.cards.map((c) => c.key), ['L3:a', 'L3:b', 'L3:c', 'L3:d'], 'the clearest first');
});

test('The settings are the methods document\'s (alpha as set by the simulation, M22)', () => {
  assert.equal(M14.minWeeksPerGroup, 6);
  assert.equal(M14.minDaysPerGroup, 20);
  assert.equal(M14.trendWindow, 9);
  assert.equal(M14.blockWeeks, 8);
  assert.equal(M14.shuffles, 10000);
  assert.ok(M14.alpha <= 0.05);
});
