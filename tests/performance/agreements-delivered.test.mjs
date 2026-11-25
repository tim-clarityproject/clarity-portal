// src/lib/agreements/delivered.js: invoicing as delivered (brief item 4; M28's s-n-delivered).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as d from '../../src/lib/agreements/delivered.js';

const jo = 'p-jo';
const now = Date.parse('2026-11-25T12:00:00Z');
const sessions = [
  { id: 's1', profile_id: jo, starts_at: '2026-11-03T10:00:00Z', minutes: 60, outcome: 'held' },
  { id: 's2', profile_id: jo, starts_at: '2026-11-19T10:00:00Z', minutes: 60, outcome: 'held' },
  { id: 's3', profile_id: jo, starts_at: '2026-11-20T10:00:00Z', minutes: 60, outcome: 'moved' },
  { id: 's4', profile_id: jo, starts_at: '2026-11-24T10:00:00Z', minutes: 60, outcome: null },
  { id: 's5', profile_id: jo, starts_at: '2026-12-01T10:00:00Z', minutes: 60, outcome: null },
  { id: 's6', profile_id: 'p-other', starts_at: '2026-11-10T10:00:00Z', minutes: 60, outcome: 'held' },
];

test('Jo: Tue 3 Nov and Thu 19 Nov held → 2 lines; never moved, unsure, future or another client’s', () => {
  const due = d.sessionsToInvoice({ sessions, profileId: jo, now });
  assert.deepEqual(due.map((s) => s.id), ['s1', 's2']);
  assert.deepEqual(d.lines(due, 75000).map((l) => l.description), ['Coaching session, Tue 3 Nov', 'Coaching session, Thu 19 Nov']);
  assert.equal(d.invoiceLine(2, 75000), '2 coaching sessions at £750, so £1,500.');
  assert.equal(d.sendLabel(1, 75000), 'Send invoice for £750');
});

test('a session already on an invoice never comes back, unless that invoice was voided', () => {
  assert.deepEqual(d.sessionsToInvoice({ sessions, sources: [{ session_id: 's1' }], profileId: jo, now }).map((s) => s.id), ['s2']);
  assert.deepEqual(d.sessionsToInvoice({ sessions, sources: [{ session_id: 's1', released_at: '2026-11-24T00:00:00Z' }], profileId: jo, now }).map((s) => s.id), ['s1', 's2']);
  assert.deepEqual(d.sessionsToInvoice({ sessions, profileId: jo, startsOn: '2026-11-10', now }).map((s) => s.id), ['s2'], 'from the agreement’s start');
});
