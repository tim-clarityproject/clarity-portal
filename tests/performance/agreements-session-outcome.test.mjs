// src/lib/agreements/sessionOutcome.js: "What happened?" and the count of sessions used (brief items 44 to 46).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as so from '../../src/lib/agreements/sessionOutcome.js';

const now = Date.parse('2027-02-03T12:00:00Z');
const at = (d) => `${d}T09:00:00Z`;
const six = [
  { starts_at: at('2027-01-04'), minutes: 60, outcome: 'held', outcome_source: 'fathom' },
  { starts_at: at('2027-01-11'), minutes: 60, outcome: 'held', outcome_source: 'fathom' },
  { starts_at: at('2027-01-18'), minutes: 60, outcome: 'late_cancel' },
  { starts_at: at('2027-01-25'), minutes: 60, outcome: null },
  { starts_at: at('2027-02-01'), minutes: 60, outcome: 'moved' },
  { starts_at: at('2027-02-08'), minutes: 60, outcome: null },
];

test('Fathom, Fathom, late, open, rearranged, coming: 3 of 16 used, one to confirm', () => {
  assert.equal(so.usedLine(six, 16), '3 of 16 coaching sessions used.');
  assert.equal(so.toConfirm(six, now).length, 1);
  assert.deepEqual(six.map((s) => so.outcomeLabel(s, now)), ['Happened, marked by its Fathom summary', 'Happened, marked by its Fathom summary',
    'Cancelled late, counts as used', 'Did it happen? Tick it off', 'Rearranged, not counted', 'Coming up']);
  assert.deepEqual(six.map((s) => so.rowAction(s, now)), ['Open', 'Open', 'Open', 'To confirm', 'Open', '']);
});

test('the four answers, and a choice the coach makes', () => {
  assert.deepEqual(so.WHAT_HAPPENED.map((o) => o.label), ['It happened', 'Cancelled late, counts as used', 'Rearranged', 'Not sure yet']);
  assert.equal(so.outcomeLabel({ outcome: 'held', outcome_source: 'coach' }), 'Happened, ticked off by you');
  assert.equal(so.withOutcome(six[3], 'held').outcome, 'held');
  assert.equal(so.withOutcome(six[0], null).outcome, null);
  assert.equal(so.withOutcome(six[0], 'nonsense').outcome, null);
  assert.equal(so.counts({ outcome: 'late_cancel', waived: true }), false);
});
