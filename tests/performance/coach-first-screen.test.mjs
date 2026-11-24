// The coach first screen run (24 Nov 2026): what a first visit asks for its first screen, worked out in the app's
// opening code (src/lib/coach/earlyScreen.js) without the calendar's own code, must be what the calendar shows; and
// the time library's zone check, now remembered once a visit, must answer exactly as before.
import test from 'node:test';
import assert from 'node:assert/strict';
import { viewRange } from '../../src/lib/coach/calendar.js';
import { DAY_MS, profilesOf, screenKindOf, screenWindow, viewDays } from '../../src/lib/coach/screenPlan.js';
import { isZone } from '../../src/lib/time/index.js';

const keyOf = (ms) => new Date(ms).toISOString().slice(0, 10);

test('every view\'s days, for two years of days, are calendar.js\'s own (weekends shown)', () => {
  const start = Date.parse('2026-01-01T00:00:00Z');
  for (let i = 0; i < 2 * 366; i += 1) {
    const day = keyOf(start + i * DAY_MS);
    for (const view of ['day', 'week', 'month', 'schedule']) {
      const r = viewRange(view, day, { weekends: true });
      assert.deepEqual(viewDays(view, day), [r.fromDay, r.toDay], `${view} ${day}`);
    }
  }
});

test('with weekends hidden the calendar shows no day outside the window read', () => {
  for (const day of ['2026-11-24', '2026-03-29', '2026-10-25', '2027-02-28', '2028-02-29']) {
    for (const view of ['day', 'week', 'month', 'schedule']) {
      const [from, to] = viewDays(view, day);
      const r = viewRange(view, day, { weekends: false });
      assert.ok(r.fromDay >= from && r.toDay <= to, `${view} ${day}`);
    }
  }
});

test('the page an address opens on', () => {
  const id = '0b9f2c1e-1d3a-4c55-9a7e-2f5b8e6d4c3a';
  assert.equal(screenKindOf('/coach'), 'today');
  assert.equal(screenKindOf('/coach/'), 'today');
  assert.equal(screenKindOf('/coach/clients'), 'clients');
  assert.equal(screenKindOf(`/coach/clients/${id}`), 'client');
  assert.equal(screenKindOf('/coach/calendar'), 'calendar');
  for (const other of ['/coach/clients/past', `/coach/clients/${id}/close`, '/coach/todos', '/coach/leads', '/coach/calendar/book', '/coach/settings', '/welcome', '/coach/sign-in']) {
    assert.equal(screenKindOf(other), null, other);
  }
  assert.deepEqual(profilesOf(`/coach/clients/${id.toUpperCase()}`), [id]);
  assert.deepEqual(profilesOf('/coach/clients'), []);
});

test('a first screen\'s window: the next-call bar\'s days always, and the calendar\'s weeks with two days before and three after', () => {
  const now = Date.parse('2026-11-24T09:30:00Z');
  assert.deepEqual(screenWindow('today', now, ''), [now - DAY_MS, now + 8 * DAY_MS]);
  assert.deepEqual(screenWindow('client', now, ''), [now - DAY_MS, now + 8 * DAY_MS]);
  // The week of 23 to 29 Nov and the Schedule from today (28 days): 21 Nov to 24 Dec, with the bar's days inside.
  const [from, to] = screenWindow('calendar', now, '', '2026-11-24');
  assert.equal(keyOf(from), '2026-11-21');
  assert.equal(keyOf(to), '2026-12-24');
  // A month far ahead still holds the bar's own days.
  const [f2, t2] = screenWindow('calendar', now, '?view=month&day=2027-03-10', '2026-11-24');
  assert.ok(f2 <= now - DAY_MS && t2 >= Date.parse('2027-04-04T00:00:00Z'));
  // A day that doesn't exist opens today, as the calendar does.
  assert.deepEqual(screenWindow('calendar', now, '?view=day&day=2026-02-31', '2026-11-24'), screenWindow('calendar', now, '?view=day', '2026-11-24'));
});

test('the zone check answers the same, asked once or many times', () => {
  const names = ['Europe/London', 'America/New_York', 'UTC', 'Etc/UTC', 'Etc/GMT+5', 'EST', 'america/new_york', 'Mars/Olympus', '', null, 'Asia/Kolkata', 'Australia/Lord_Howe'];
  const first = names.map((n) => isZone(n));
  for (let i = 0; i < 3; i += 1) assert.deepEqual(names.map((n) => isZone(n)), first);
  assert.deepEqual(first, [true, true, true, true, false, false, false, false, false, false, true, true]);
});
