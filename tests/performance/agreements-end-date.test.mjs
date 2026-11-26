// src/lib/agreements/endDate.js: the end date worked out (brief item 6; M28's builder, s-extend, s-pause).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as e from '../../src/lib/agreements/endDate.js';

test('the Friday of the last coaching session’s week, for each How often', () => {
  const mixed = [{ n: 1, minutes: 90 }, { n: 15, minutes: 60 }];
  assert.equal(e.lastSessionWeek('2027-01-04', 16, 'Weekly for 6 weeks, then every 2 weeks'), '2027-06-28');
  assert.equal(e.suggestEnd('2027-01-04', mixed, 'Weekly for 6 weeks, then every 2 weeks'), '2027-07-02', '16 sessions → Fri 2 Jul 2027');
  assert.equal(e.suggestEnd('2027-02-01', 12, 'Every 2 weeks'), '2027-07-09', '12 every 2 weeks → Fri 9 Jul 2027');
  assert.equal(e.suggestEnd('2027-01-04', 16, 'Weekly'), '2027-04-23');
  assert.equal(e.suggestEnd('2027-01-04', 6, 'Monthly'), '2027-05-28');
  assert.equal(e.suggestEnd('2027-02-01', 12, 'As we agree'), e.suggestEnd('2027-02-01', 12, 'Every 2 weeks'), '“As we agree” counts as every 2 weeks');
});

test('a last session on a Saturday ends the following Friday, never before it (risk 30)', () => {
  assert.equal(e.suggestEnd('2027-01-02', 1, 'Weekly'), '2027-01-08');
  assert.equal(e.fridayOnOrAfter('2027-07-02'), '2027-07-02');
});

test('the builder’s choices and its line', () => {
  const o = e.endOptions('2027-07-02');
  assert.deepEqual(o.map((x) => x.label), ['Fri 2 Jul 2027, suggested', 'Fri 16 Jul 2027, 2 weeks spare', 'Fri 30 Jul 2027, 4 weeks spare', 'Fri 27 Aug 2027, 8 weeks spare']);
  assert.equal(e.endHint({ start: '2027-01-04', count: 16, rhythm: 'Weekly for 6 weeks, then every 2 weeks', end: '2027-07-02', picked: false }),
    'Worked out: the last coaching session is in the week of Mon 28 Jun 2027.');
  assert.equal(e.endHint({ start: '2027-01-04', count: 16, rhythm: 'Weekly for 6 weeks, then every 2 weeks', end: '2027-07-30', picked: true }),
    'You chose this. Suggested: Fri 2 Jul 2027.');
  assert.deepEqual(e.extendOptions('2027-07-02').map((x) => x.value), ['2027-07-16', '2027-07-30', '2027-08-27', '2027-09-24']);
  assert.deepEqual(e.extendOptions('2027-07-02').map((x) => x.label), ['Fri 16 Jul 2027', 'Fri 30 Jul 2027', 'Fri 27 Aug 2027', 'Fri 24 Sep 2027']);
  // On screen, this year's dates leave their year out (writing rule 28).
  assert.deepEqual(e.extendOptions('2026-11-20', '2026-11-26').map((x) => x.label), ['Fri 4 Dec', 'Fri 18 Dec', 'Fri 15 Jan 2027', 'Fri 12 Feb 2027']);
});

test('pausing Mon 1 Mar to Fri 26 Mar moves the end by 4 weeks, to Fri 30 Jul 2027', () => {
  const p = e.pauseMove('2027-07-02', '2027-03-01', '2027-03-26');
  assert.equal(p.end, '2027-07-30');
  assert.equal(p.line, 'Coaching pauses for 4 weeks, so the end date moves to Fri 30 Jul 2027.');
  assert.equal(e.pauseMove('2027-07-02', '2027-03-26', '2027-03-01').line, 'Choose an Until date after From.');
  assert.equal(e.pauseMove('2027-07-02', '2027-03-01', '2027-03-26', '2027-02-24').line, 'Coaching pauses for 4 weeks, so the end date moves to Fri 30 Jul.');
});
