// Sleep wind down (M19): the night a wind-down belongs to, the thoughts as
// kept, and the next morning's Carried over list (src/lib/performance/windDown.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WIND_DOWN_THOUGHT_MAX,
  carriedOver,
  carriedSource,
  cleanThoughts,
  nightBefore,
  sameThing,
  windDownNight,
} from '../../src/lib/performance/windDown.js';

test('a wind-down before 04:00 counts for the night before, as Daily review', () => {
  assert.equal(windDownNight({ today: '2026-10-22', hour: 0 }), '2026-10-21');
  assert.equal(windDownNight({ today: '2026-10-22', hour: 3 }), '2026-10-21');
  assert.equal(windDownNight({ today: '2026-10-22', hour: 4 }), '2026-10-22');
  assert.equal(windDownNight({ today: '2026-10-21', hour: 22 }), '2026-10-21');
  assert.equal(windDownNight({ today: '2026-11-01', hour: 1 }), '2026-10-31');
  assert.equal(nightBefore('2026-11-01'), '2026-10-31');
});

test('thoughts are trimmed, the empty ones left out, each 300 characters at most', () => {
  assert.deepEqual(cleanThoughts(['  Call Evan ', '', '   ', 'x'.repeat(320), null]), ['Call Evan', 'x'.repeat(WIND_DOWN_THOUGHT_MAX)]);
  assert.equal(WIND_DOWN_THOUGHT_MAX, 300);
});

test('the same thing ignores case and punctuation, never letters in other languages', () => {
  assert.ok(sameThing('Finish the Harbour case study.', '  finish the harbour case study '));
  assert.ok(!sameThing('Café', 'Cafe'));
  assert.ok(!sameThing('会議', '準備'));
  assert.ok(!sameThing('Call Evan', 'Call Evan today'));
});

test('Carried over: review first, then the thoughts, duplicates merged into the first row', () => {
  const list = carriedOver({
    review: ['Call Evan before 09:00 about the referral', 'Finish the Harbour case study', 'Reply to Max about the workshop'],
    windDown: ['call evan before 09:00 about the referral', 'Finish the Harbour case study!', 'Book a day off for the half term'],
  });
  assert.deepEqual(list.map((c) => [c.text, c.review, c.windDown]), [
    ['Call Evan before 09:00 about the referral', true, true],
    ['Finish the Harbour case study', true, true],
    ['Reply to Max about the workshop', true, false],
    ['Book a day off for the half term', false, true],
  ]);
  // M19: 6 lines make 4 rows.
  assert.equal(list.length, 4);
  assert.deepEqual(carriedOver({ review: [], windDown: ['A', 'a', ''] }).map((c) => c.text), ['A']);
});

test('the source line says where each came from', () => {
  assert.equal(carriedSource({ review: true, windDown: false }, '2026-10-20', '2026-10-21'), 'From Daily review');
  assert.equal(carriedSource({ review: false, windDown: true }, null, '2026-10-21'), 'From last night’s sleep wind down');
  assert.equal(carriedSource({ review: true, windDown: true }, '2026-10-20', '2026-10-21'), 'From Daily review and last night’s sleep wind down');
  assert.equal(carriedSource({ review: true, windDown: false }, '2026-10-16', '2026-10-19'), 'From Daily review on Friday');
});
