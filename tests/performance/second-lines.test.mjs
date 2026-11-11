// No repeated second line under an answer (Tim, 11 Nov, 12:51; decisions
// part 5, 13:05): an answer never has a grey second line that repeats or
// rewords it. A second line stays only where it adds something the answer
// can't say (an example, a meaning). The browser check in
// tests/phase5/calm-rules.mjs looks at what is on screen; this reads the
// lists of answers themselves. Run with npm run test:performance.
import test from 'node:test';
import assert from 'node:assert/strict';
import { HABIT_MEASURES } from '../../src/lib/performance/builder.js';
import { CON, PROG, RES } from '../../src/health-check/words.js';

const SMALL = new Set(['i', 'i’ll', "i'll", 'i’m', "i'm", 'it', 'its', 'it’s', 'the', 'a', 'an', 'my', 'me', 'to', 'is', 'are', 'be', 'of', 'and', 'or', 'for', 'in', 'on', 'at', 'this', 'that', 'need', 'want', 'will', 'do', 'eg', 'e', 'g', 'each', 'with', 'your', 'you']);
const NOT = new Set(['not', 'no', 'never', 'without', 'don’t', "don't", 'won’t', "won't", 'can’t', "can't"]);
const tokens = (t) => String(t ?? '').toLowerCase().replace(/[“”"().,:;!?/–—-]/g, ' ').split(/\s+/).filter(Boolean);
// One form for "run", "running" and "runs"; "rate" and "rated"; "plan" and "planning".
const stem = (w) => (w.length > 4 ? w.replace(/(ing|ed|es|s)$/, '') : w).replace(/e$/, '').replace(/([b-df-hj-np-tv-z])\1$/, '$1');
const wordsOf = (t) => [...new Set(tokens(t).filter((w) => !SMALL.has(w)).map(stem).filter((w) => w && !SMALL.has(w)))];
/** Whether a second line only says again what its answer says (the same rule as the browser check). */
export function repeatsItsAnswer(first, second) {
  // Word for word the same, small words and all ("It is" under "It is").
  if (tokens(first).length && tokens(first).join(' ') === tokens(second).join(' ')) return true;
  // One says not, the other doesn't: the opposite, not a repeat.
  if (tokens(first).some((w) => NOT.has(w)) !== tokens(second).some((w) => NOT.has(w))) return false;
  const a = wordsOf(first);
  const b = wordsOf(second);
  if (!a.length || !b.length) return false;
  const shared = b.filter((w) => a.includes(w)).length;
  return shared / b.length >= 0.75 || (a.filter((w) => b.includes(w)).length / a.length >= 0.75 && shared >= 2);
}

test('the rule itself: a reworded answer is caught, an example or a meaning is not', () => {
  // Tim's own example (M18): "I need to perform at my best" over "Perform at my best".
  assert.equal(repeatsItsAnswer('I need to perform at my best', 'Perform at my best'), true);
  assert.equal(repeatsItsAnswer('I’ll rate it each day, from Poor to Excellent', 'e.g. focus, rated each day'), false);
  assert.equal(repeatsItsAnswer('Stay calm under pressure', 'Staying calm under pressure'), true);
  assert.equal(repeatsItsAnswer('I’ll count it each week', 'e.g. training sessions'), false);
  assert.equal(repeatsItsAnswer('High', 'This CSF would be hard to achieve without it.'), false);
  assert.equal(repeatsItsAnswer('Monday 16 Nov', 'suggested'), false);
});

test('the rule itself, with awkward answers (break-it, 11 Nov)', () => {
  // The same words in another form, in capitals, or joined with hyphens.
  assert.equal(repeatsItsAnswer('Running', 'I run'), true);
  assert.equal(repeatsItsAnswer('Plan', 'Planning'), true);
  assert.equal(repeatsItsAnswer('Rate it each day', 'Rated each day'), true);
  assert.equal(repeatsItsAnswer('I NEED TO PERFORM AT MY BEST', 'Perform at my best'), true);
  assert.equal(repeatsItsAnswer('Perform-at-my-best', 'Perform at my best'), true);
  // Only "e.g." or small words added.
  assert.equal(repeatsItsAnswer('Count it', 'e.g. count it'), true);
  assert.equal(repeatsItsAnswer('Yes', 'Yes, I’ll do it'), true);
  // Word for word the same, even when every word is a small one.
  assert.equal(repeatsItsAnswer('It is', 'It is.'), true);
  assert.equal(repeatsItsAnswer('The', 'THE'), true);
  // "need" and "this" are small words whatever their endings look like.
  assert.equal(repeatsItsAnswer('I need this', 'Something else I need'), false);
  // A second line that adds something stays.
  assert.equal(repeatsItsAnswer('Yes', 'Yes, daily'), false);
  assert.equal(repeatsItsAnswer('Training sessions', 'Habit, 1 of 4 this week'), false);
  assert.equal(repeatsItsAnswer('Good', 'Very good'), false);
  assert.equal(repeatsItsAnswer('Monday', 'Monday 16 Nov'), false);
  // The opposite is not a repeat.
  assert.equal(repeatsItsAnswer('Don’t drink', 'Drink'), false);
  assert.equal(repeatsItsAnswer('Calm', 'Not calm'), false);
  // Nothing to compare, or not words at all: never an error.
  assert.equal(repeatsItsAnswer('', 'x'), false);
  assert.equal(repeatsItsAnswer(null, undefined), false);
  assert.equal(repeatsItsAnswer(7, 7), true);
});

test('how a habit is measured: each second line is an example, never the answer again', () => {
  for (const m of HABIT_MEASURES) {
    assert.ok(m.hint.startsWith('e.g. '), m.label);
    assert.equal(repeatsItsAnswer(m.label, m.hint), false, `${m.label} / ${m.hint}`);
  }
  // The rating's example no longer says "rated each day" again.
  assert.equal(HABIT_MEASURES.find((m) => m.value === 'rating').hint, 'e.g. focus');
});

test('the Health Check’s answers: each second line is the word’s meaning, never the word again', () => {
  const lists = [CON, PROG.filter(Boolean), RES.filter(Boolean)];
  for (const list of lists) for (const [word, meaning] of list) assert.equal(repeatsItsAnswer(word, meaning), false, `${word} / ${meaning}`);
});
