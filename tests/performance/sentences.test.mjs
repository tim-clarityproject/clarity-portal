// Sentences built from figures, read aloud (Tim, 5 Nov, 10:37: "talk like a
// person"), with real, small, zero and odd figures: 0, 1, 0.5 and 12.
// Run with npm run test:performance.
import test from 'node:test';
import assert from 'node:assert/strict';
import { timeWords, weeklySentence, whereQuestion, wayQuestion } from '../../src/lib/performance/index.js';

const count = (name, got, of) => ({ name, measure: 'count', weekFigures: { got, of } });
const hours = (name, got, of) => ({ name, measure: 'amount', unit: 'hours', weekFigures: { got, of } });
const once = (name, done) => ({ name, measure: 'yes_no_weekly', weekDone: done });

test("Tim's model sentence", () => {
  assert.equal(
    weeklySentence([count('Training session', 1, 4), count('Reflective note', 3, 5), hours('Reading', 0.5, 3), count('Check-in message', 4, 5), once('Weekly strategic block', false)]),
    'So far this week you’ve completed 1 out of 4 training sessions, done 3 out of 5 reflective notes, read half an hour of your 3 hours of reading and sent 4 out of 5 check-in messages, and you’ve still got your weekly strategic block to do.',
  );
});

test('0, 1, 0.5 and 12 read naturally', () => {
  // Nothing yet is still to come, never missed.
  assert.equal(weeklySentence([count('Training session', 0, 4)]), 'So far this week you’ve still got 4 training sessions to do.');
  assert.equal(weeklySentence([count('Training session', 1, 1)]), 'So far this week you’ve completed 1 out of 1 training session.');
  assert.equal(weeklySentence([hours('Deep work', 0.5, 12)]), 'So far this week you’ve done half an hour of your 12 hours of deep work.');
  assert.equal(weeklySentence([hours('Deep work', 12, 12)]), 'So far this week you’ve done 12 hours of your 12 hours of deep work.');
  assert.equal(weeklySentence([hours('Reading', 0, 0.5)]), 'So far this week you’ve still got half an hour of reading to do.');
  assert.equal(weeklySentence([count('Strength session', 12, 12)]), 'So far this week you’ve completed 12 out of 12 strength sessions.');
  assert.equal(weeklySentence([{ name: 'Late finishes', measure: 'count_limit', weekFigures: { got: 1, limit: 2 } }]), 'So far this week you’ve had 1 late finish, with a limit of 2.');
  assert.equal(weeklySentence([once('Weekly strategic block', true), once('Call with the board', false)]), 'So far this week you’ve done your weekly strategic block, and you’ve still got your call with the board to do.');
  assert.equal(weeklySentence([]), '');
});

test('time as a person says it', () => {
  assert.deepEqual([0.5, 0.25, 0.75, 1, 1.5, 2, 12, 2.2].map((h) => timeWords(h)), ['half an hour', '15 minutes', '45 minutes', '1 hour', '1 and a half hours', '2 hours', '12 hours', '2.2 hours']);
  assert.equal(timeWords(30, 'minutes'), 'half an hour');
  assert.equal(timeWords(0), '0 hours');
});

test('the way of being is named in both questions (rule 64)', () => {
  assert.equal(wayQuestion('Calm under pressure'), 'On a scale of 1 to 10, how calm under pressure were you today?');
  assert.equal(whereQuestion('Calm under pressure'), 'Where did being calm under pressure show today?');
});
