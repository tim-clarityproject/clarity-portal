// M0.8 bands for a list of scores (Tim, 5 Nov 2026): the worked examples
// in docs/scoring-methods.md. Run with npm run test:scores.
import test from 'node:test';
import assert from 'node:assert/strict';
import { m0Bands } from '../../src/lib/scores/index.js';

test('M0-8a: good from 67, mid 50 to 66, low below 50, the single lowest coral', () => {
  assert.deepEqual(m0Bands([83, 66, 50, 49, 40, 67]), ['good', 'mid', 'mid', 'low', 'lowest', 'good']);
});

test('M0-8b: bands from the rounded figures people see, ties to the first', () => {
  assert.deepEqual(m0Bands([75, 66.5, 49.6, 49.6]), ['good', 'good', 'lowest', 'mid']);
});

test('M0-8c: a tie for lowest goes to the first; a list of one has no lowest; missing scores have no band', () => {
  assert.deepEqual(m0Bands([75, 75, 75]), ['lowest', 'good', 'good']);
  assert.deepEqual(m0Bands([40]), ['low']);
  assert.deepEqual(m0Bands([null, 40, 80]), [null, 'lowest', 'good']);
  assert.deepEqual(m0Bands([]), []);
});
