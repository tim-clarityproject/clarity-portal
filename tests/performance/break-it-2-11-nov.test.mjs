// The second break-it pass of 11 Nov: the logic faults found with hostile
// input, each kept fixed by a test. Run with npm run test:performance.
import test from 'node:test';
import assert from 'node:assert/strict';
import { m9TimeLeft } from '../../src/lib/scores/m9.js';
import { daysLeftWords } from '../../src/lib/performance/recovery.js';
import { inSentence } from '../../src/lib/performance/words.js';

test('countdowns: a date that can’t be read gives no words, never "NaN weeks" or an error', () => {
  for (const bad of [null, undefined, '', 'not a date', '2026-11-11T10:00:00Z', 20261212, '2026-8-1', '10000-01-01']) {
    assert.deepEqual(m9TimeLeft('2026-11-11', bad), { days: null, unit: null, count: null, text: '' }, String(bad));
    assert.equal(m9TimeLeft(bad, '2026-11-11').text, '', String(bad));
  }
});

test('countdowns: far dates are worked out at once, and month ends and leap days count whole months', () => {
  const started = Date.now();
  assert.equal(m9TimeLeft('2026-11-11', '9999-12-31').text, '95677 months to go');
  assert.equal(m9TimeLeft('9999-12-31', '2026-11-11').text, '95677 months overdue');
  assert.ok(Date.now() - started < 200, 'no month-by-month counting');
  assert.equal(m9TimeLeft('2028-02-29', '2029-02-28').text, '12 months to go');
  assert.equal(m9TimeLeft('2028-02-29', '2029-02-27').text, '11 months to go');
  assert.equal(m9TimeLeft('2026-11-30', '2027-02-28').text, '3 months to go');
  assert.equal(m9TimeLeft('2026-11-30', '2027-02-27').text, '12 weeks to go');
  assert.equal(m9TimeLeft('2027-01-31', '2027-02-28').text, '4 weeks to go');
  assert.equal(m9TimeLeft('2026-11-11', '2026-11-10').text, '1 day overdue');
  assert.equal(m9TimeLeft('2026-11-11', '2026-11-18').text, '7 days to go');
  // Never "0 days", "-3 days" or "1 days".
  for (let d = -40; d <= 40; d += 1) {
    const due = new Date(Date.UTC(2026, 10, 11 + d)).toISOString().slice(0, 10);
    const { text } = m9TimeLeft('2026-11-11', due);
    assert.doesNotMatch(text, /(^|\D)0 |-\d|NaN|\b1 (days|weeks|months)\b/, `${due}: ${text}`);
  }
});

test('Recovery’s banner: only a whole number of days still to come has words', () => {
  assert.equal(daysLeftWords(1), '1 day to go.');
  assert.equal(daysLeftWords('1'), '1 day to go.');
  assert.equal(daysLeftWords(3), '3 days to go.');
  for (const bad of [0, -3, 1.5, NaN, Infinity, null, undefined, '', 'soon']) assert.equal(daysLeftWords(bad), '', String(bad));
});

test('"Edit how it went": a summary label inside a sentence never reads "undefined" and names keep their capital', () => {
  assert.equal(inSentence('How it went'), 'how it went');
  assert.equal(inSentence('  How it went '), 'how it went');
  assert.equal(inSentence('Who I want to be'), 'who I want to be');
  for (const kept of ['I', 'I’m ready', 'IT', 'iPhone', 'UK time', '3 things', '“Quoted”', '🎯 Goal', 'A', 'Strategies of the day', 'Outcome Objectives', 'Mission', 'Sam’s plan', "Sam's plan", 'Monday', 'November review', 'Monthly review', 'HOW IT WENT']) assert.equal(inSentence(kept), kept);
  assert.equal(inSentence('May I ask'), 'May I ask'); // a month's name wins: harmless
  assert.equal(inSentence('Today’s plan'), 'Today’s plan');
  assert.equal(inSentence(''), '');
  assert.equal(inSentence(42), '42');
  for (const bad of [null, undefined, NaN, {}, ['x'], () => 'x', true]) assert.equal(inSentence(bad), '', String(bad));
});
