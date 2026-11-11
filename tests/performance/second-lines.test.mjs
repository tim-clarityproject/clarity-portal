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

const SMALL = new Set(['i', 'i’ll', "i'll", 'i’m', "i'm", 'it', 'its', 'it’s', 'the', 'a', 'an', 'my', 'me', 'to', 'is', 'are', 'be', 'of', 'and', 'or', 'for', 'in', 'on', 'at', 'this', 'that', 'need', 'want', 'will', 'do', 'eg', 'e.g', 'each', 'with', 'your', 'you']);
const wordsOf = (t) => [...new Set(t.toLowerCase().replace(/[“”"().,:;!?]/g, ' ').split(/\s+/).map((w) => w.replace(/(ing|ed|s)$/, '')).filter((w) => w && !SMALL.has(w)))];
/** Whether a second line only says again what its answer says (the same rule as the browser check). */
export function repeatsItsAnswer(first, second) {
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
