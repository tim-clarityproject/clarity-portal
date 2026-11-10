// Ratings are five words, never numbers (5e rule 29i; Claude's call of 10
// Nov): Poor, Fair, Good, Very good, Excellent, scoring 0, 25, 50, 75 and
// 100. Saved values keep their shape, and nothing scores differently
// (docs/scoring-methods.md, M1's rating rule and M9.1; worked examples
// M1-R1 and M9-R1). Run with npm run test:performance.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HABIT_RATING_OPTIONS,
  OBJECTIVE_RATING_OPTIONS,
  RATING_WORDS,
  habitMeasureLine,
  habitRatingWord,
  objectiveFigure,
  objectiveTarget,
  ratingOption,
  ratingScore,
  ratingStep,
  ratingValue,
  ratingWord,
} from '../../src/lib/performance/words.js';
import { m1RatingScore } from '../../src/lib/scores/m1.js';

test('the five words, and their scores of 0, 25, 50, 75 and 100', () => {
  assert.deepEqual([...RATING_WORDS], ['Poor', 'Fair', 'Good', 'Very good', 'Excellent']);
  assert.deepEqual([0, 1, 2, 3, 4].map((step) => ratingScore(ratingValue(step))), [0, 25, 50, 75, 100]);
});

test('an objective’s out-of-10 figure converts for display: 0 to 2 Poor, 3 to 4 Fair, 5 to 6 Good, 7 to 8 Very good, 9 to 10 Excellent', () => {
  const words = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(ratingWord);
  assert.deepEqual(words, ['Poor', 'Poor', 'Poor', 'Fair', 'Fair', 'Good', 'Good', 'Very good', 'Very good', 'Excellent', 'Excellent']);
  // Nothing saved yet reads as nothing, never as Poor.
  assert.equal(ratingWord(null), '');
  assert.equal(ratingStep(''), null);
  assert.equal(ratingOption(undefined), null);
});

test('a word saves 0, 2.5, 5, 7.5 or 10 on the same 0 to 10 scale, and reads back as itself', () => {
  assert.deepEqual(OBJECTIVE_RATING_OPTIONS.map((o) => o.value), ['0', '2.5', '5', '7.5', '10']);
  for (const o of OBJECTIVE_RATING_OPTIONS) assert.equal(ratingWord(Number(o.value)), o.label);
  // An older whole number shows as its word's answer.
  assert.equal(ratingOption(7), '7.5');
  assert.equal(ratingOption('6'), '5');
});

test('worked example M9-R1: figures and targets in words, never numbers', () => {
  const o = { kind: 'rating', target: 9 };
  assert.equal(objectiveFigure(o, 7), 'Very good');
  assert.equal(objectiveTarget(o), 'target Excellent');
  assert.equal(objectiveFigure({ kind: 'rating', target: 8 }, 6), 'Good');
  assert.doesNotMatch(`${objectiveFigure(o, 7)} ${objectiveTarget(o)}`, /\d/);
});

test('a habit’s daily rating keeps 1 to 5, shown as the five words', () => {
  assert.deepEqual(HABIT_RATING_OPTIONS.map((o) => [o.value, o.label]), [[1, 'Poor'], [2, 'Fair'], [3, 'Good'], [4, 'Very good'], [5, 'Excellent']]);
  assert.equal(habitRatingWord(4), 'Very good');
  assert.equal(habitRatingWord(3.5), 'Very good'); // a half rounds up
  assert.equal(habitMeasureLine({ measure: 'rating', target: 4, direction: 'higher' }), 'Rated each day, aim for Very good');
  assert.equal(habitMeasureLine({ measure: 'rating', target: 2, direction: 'lower' }), 'Rated each day, aim for Fair or lower');
});

test('worked example M1-R1: the words’ scores give the same habit score as the saved 1 to 5', () => {
  const week = ['Good', 'Very good', 'Good', 'Excellent', 'Good'];
  const saved = week.map((w) => RATING_WORDS.indexOf(w) + 1);           // 3, 4, 3, 5, 3
  const scores = week.map((w) => RATING_WORDS.indexOf(w) * 25);         // 50, 75, 50, 100, 50
  const average = saved.reduce((a, b) => a + b, 0) / saved.length;       // 3.6
  const wordAverage = scores.reduce((a, b) => a + b, 0) / scores.length; // 65
  assert.equal(wordAverage, 65);
  const fromWords = (wordAverage / 75) * 100;                             // target Very good is 75
  assert.equal(Math.round(m1RatingScore(average, 4, 'higher')), 87);
  assert.ok(Math.abs(m1RatingScore(average, 4, 'higher') - fromWords) < 1e-9);
  // Lower is better, the same way round: target Fair (25), average Good (50).
  assert.ok(Math.abs(m1RatingScore(3, 2, 'lower') - ((100 - 50) / (100 - 25)) * 100) < 1e-9);
});

test('odd saved figures read as a word or as nothing, never as text that isn’t a word (the break-it tester, 10 Nov)', () => {
  // An objective's figure outside 0 to 10 reads as the nearest end; in between, by its band.
  assert.deepEqual([-1, 11, 3.3, 7.49, 7.5, '7'].map(ratingWord), ['Poor', 'Excellent', 'Fair', 'Very good', 'Very good', 'Very good']);
  // No figure: no word. A blank box is never "Poor".
  for (const none of [null, undefined, '', '  ', 'abc', '7,5', NaN, Infinity, true, false, [], {}]) {
    assert.equal(ratingStep(none), null, String(none));
    assert.equal(ratingWord(none), '');
    assert.equal(ratingOption(none), null);
    assert.equal(ratingScore(none), null);
    assert.equal(habitRatingWord(none), '');
  }
  // A habit's day outside 1 to 5 reads as the nearest end, a half as the word above.
  assert.deepEqual([0, 6, 9, 2.5].map(habitRatingWord), ['Poor', 'Excellent', 'Excellent', 'Good']);
  // A rating with no target saved says nothing about one, never "target" alone.
  assert.equal(objectiveTarget({ kind: 'rating', target: null }), '');
  assert.equal(objectiveTarget({ kind: 'rating', target: 7 }), 'target Very good');
  // The editor shows an older 7 as Very good without changing it: the answer shown is 7.5, the saved 7 stays until a word is tapped.
  assert.equal(ratingOption(7), '7.5');
});
