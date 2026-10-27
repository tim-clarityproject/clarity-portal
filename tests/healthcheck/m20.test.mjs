// Methods M20.1 (version 1.3): every worked example as a test, plus the four
// chart states. Run with npm run test:healthcheck.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  strategicImportance, roundPct, attentionScore, progressGap, rankProjects,
  healthCheckState, importanceText,
} from '../../src/lib/alignmentScore.js';
import { quadrant } from '../../src/pages/alignment/chartLayout.js';

// Equal as shown, to two decimal places (15.625 shows as 15.63).
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) <= 0.005 + 1e-9, `${actual} is not ${expected}`);
const F = ['a', 'b', 'c', 'd'];
const factors = F.map((id) => ({ id, text: id }));

test('M20-1: Data platform scores 7 of 12, 58.33%, shown as 58%', () => {
  const pct = strategicImportance({ a: 0, b: 2, c: 2, d: 3 }, F);
  near(pct, 58.33);
  assert.equal(roundPct(pct), 58);
});

test('M20-1: a score for a deleted factor never counts', () => {
  near(strategicImportance({ a: 0, b: 2, c: 2, d: 3, gone: 3 }, F), 58.33);
});

test('progress gap: 2.5 for Embryonic, 5 minus progress otherwise', () => {
  assert.deepEqual([1, 2, 3, 4, 5].map(progressGap), [2.5, 3, 2, 1, 0]);
});

test('M20-2: Data platform (Embryonic, Very high) is 36.46, was 58.33', () => {
  near(attentionScore(700 / 12, 1, 5), 36.46);
});

test('M20-2: Leadership programme (Bad, High) stays 27.34', () => {
  near(attentionScore(500 / 12, 2, 4), 27.34);
});

test('M20-2: two Fair projects at 50% stay 25.00 (Very high) and 15.63 (Low)', () => {
  near(attentionScore(50, 3, 5), 25);
  near(attentionScore(50, 3, 2), 15.63);
});

test('a project with no progress rating scores -1 and sorts last', () => {
  assert.equal(attentionScore(90, null, 5), -1);
});

test('M20-2: the ranking order and tie-break', () => {
  const projects = [
    { id: 'low', text: 'Fair, Low' },
    { id: 'none', text: 'No progress' },
    { id: 'lead', text: 'Leadership programme' },
    { id: 'data', text: 'Data platform' },
    { id: 'high', text: 'Fair, Very high' },
  ];
  const owner = {
    data: { contrib: { a: 0, b: 2, c: 2, d: 3 }, progress: 1, resource: 5 },
    lead: { contrib: { a: 1, b: 1, c: 1, d: 2 }, progress: 2, resource: 4 },
    high: { contrib: { a: 2, b: 2, c: 1, d: 1 }, progress: 3, resource: 5 },
    low: { contrib: { a: 2, b: 2, c: 1, d: 1 }, progress: 3, resource: 2 },
    none: { contrib: { a: 3, b: 3, c: 3, d: 3 } },
  };
  const ranked = rankProjects(projects, factors, owner);
  assert.deepEqual(ranked.map((r) => r.project.id), ['data', 'lead', 'high', 'low', 'none']);
  near(ranked[0].attention, 36.46);
  near(ranked[1].attention, 27.34);
});

test('tie-break: the higher importance, then the higher resource, a blank counting as Moderate', () => {
  // Same attention score (0, Excellent), so importance decides, then resource.
  const projects = [{ id: 'x', text: 'x' }, { id: 'y', text: 'y' }, { id: 'z', text: 'z' }];
  const owner = {
    x: { contrib: { a: 1, b: 1, c: 1, d: 1 }, progress: 5, resource: 2 },
    y: { contrib: { a: 1, b: 1, c: 1, d: 1 }, progress: 5 },
    z: { contrib: { a: 3, b: 3, c: 3, d: 3 }, progress: 5, resource: 1 },
  };
  assert.deepEqual(rankProjects(projects, factors, owner).map((r) => r.project.id), ['z', 'y', 'x']);
});

test('an unrated project reads "Not rated", never 0%', () => {
  const [row] = rankProjects([{ id: 'p', text: 'p' }], factors, { p: { progress: 2 } });
  assert.equal(row.rated, false);
  assert.equal(importanceText(row), 'Not rated');
  const [zero] = rankProjects([{ id: 'p', text: 'p' }], factors, { p: { contrib: { a: 0 }, progress: 2 } });
  assert.equal(importanceText(zero), '0%');
});

test('the four states', () => {
  assert.equal(healthCheckState(4, 51), 'moving_well');
  assert.equal(healthCheckState(5, 100), 'moving_well');
  assert.equal(healthCheckState(3, 75), 'needs_managing');
  assert.equal(healthCheckState(2, 75), 'needs_attention');
  assert.equal(healthCheckState(2, 50.01), 'needs_attention');
  [1, 2, 3, 4, 5].forEach((p) => assert.equal(healthCheckState(p, 30), 'less_important'));
});

test('exactly 50% is not above the line', () => {
  [2, 3, 4, 5].forEach((p) => assert.equal(healthCheckState(p, 50), 'less_important'));
});

test('Embryonic at 90% is less important (too early to tell)', () => {
  assert.equal(healthCheckState(1, 90), 'less_important');
});

test('no progress rating is null (not drawn)', () => {
  assert.equal(healthCheckState(null, 90), null);
  assert.equal(healthCheckState(undefined, 10), null);
});

test("today's chart areas come from the four states", () => {
  assert.equal(quadrant(4, 80), 'mi');
  assert.equal(quadrant(2, 80), 'co');
  assert.equal(quadrant(3, 80), 'n');
  assert.equal(quadrant(1, 80), 'n'); // an important Embryonic project draws as neutral now (Tim's decision)
  assert.equal(quadrant(5, 50), 'n');
  assert.equal(quadrant(null, 80), 'n');
});
