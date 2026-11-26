// src/lib/agreements/hours.js: a block of hours (brief item 24; M28's s-b-hours, s-h-log, s-h-client).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as h from '../../src/lib/agreements/hours.js';

test('£2,000 at £150/hr is 13 hours 20 minutes', () => {
  assert.equal(h.blockMinutes(200000, 15000), 800);
  assert.equal(h.blockLine({ blockMinor: 200000, rateMinor: 15000 }), 'That’s 13 hours 20 minutes, settled in full, up front.');
  assert.equal(h.blockShort({ blockMinor: 200000, rateMinor: 15000 }), '£2,000 at £150/hr');
});

test('120 + 190 + 240 + 90 = 640 minutes: the balance, and 80% means Needs you', () => {
  const entries = [{ minutes: 120 }, { minutes: 190 }, { minutes: 240 }, { minutes: 90 }];
  assert.equal(h.used(entries), 640);
  assert.equal(h.balanceLine(640, 800), '10 hours 40 minutes used of 13 hours 20 minutes, 2 hours 40 minutes left.');
  assert.equal(h.at80(640, 800), true);
  assert.equal(h.at80(639, 800), false);
  assert.equal(h.percentUsed(640, 800), 80);
  assert.equal(h.balanceLine(830, 800), '13 hours 50 minutes used, 30 minutes over the block.');
  assert.equal(h.entryLength(190), '3 hours 10 minutes');
  assert.equal(h.entryLength(240), '4 hours', 'never "h" (26 Oct rule 8)');
  assert.equal(h.used([{ started_at: '2026-11-23T09:00:00Z', ended_at: '2026-11-23T11:00:00Z' }]), 120, 'time_entries rows too');
});

test('a top-up is another block at the same rate', () => {
  const t = h.topUp({ hours: { work: 'The team Health Check', rateMinor: 15000, blockMinor: 200000 } });
  assert.equal(t.amount, 200000);
  assert.equal(t.kind, 'top_up');
  assert.equal(t.lines[0].description, 'The team Health Check: another block of 13 hours 20 minutes');
});
