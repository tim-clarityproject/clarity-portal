// Clients' "Next session" (Polish 1, Stage B, B4): every client read "Not booked" because clientData.js never looked
// at the sessions. nextSessionStarts gives each client their soonest session still to come, from the coach's own
// sessions and the people in a group's; associateNextStarts the owner's view of an associate's client (058).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { associateNextStarts, nextSessionStarts } from '../../src/pages/coach/nextSessions.js';

const NOW = new Date('2026-11-25T10:00:00Z');
const at = (iso, extra = {}) => ({ id: `s-${iso}-${extra.profile_id || extra.id || ''}`, starts_at: iso, minutes: 60, outcome: null, ...extra });

test('the soonest session still to come is each client’s next', () => {
  const sessions = [
    at('2026-12-07T09:00:00Z', { profile_id: 'sam' }),
    at('2026-11-30T09:00:00Z', { profile_id: 'sam' }),
    at('2026-11-20T09:00:00Z', { profile_id: 'sam', outcome: 'held' }),
    at('2026-11-27T14:00:00Z', { profile_id: 'priya' }),
  ];
  const next = nextSessionStarts(sessions, [], NOW);
  assert.equal(next.get('sam'), '2026-11-30T09:00:00Z');
  assert.equal(next.get('priya'), '2026-11-27T14:00:00Z');
  assert.equal(next.has('nobody'), false, 'a client with nothing booked has no next session');
});

test('a session under way still counts; one that has ended, or was cancelled or moved, never does', () => {
  const sessions = [
    at('2026-11-25T09:30:00Z', { profile_id: 'sam' }), // 09:30 to 10:30: under way at 10:00
    at('2026-11-25T08:00:00Z', { profile_id: 'tom' }), // ended at 09:00, not yet written up
    at('2026-11-26T09:00:00Z', { profile_id: 'grace', outcome: 'late_cancel' }),
    at('2026-11-27T09:00:00Z', { profile_id: 'grace', outcome: 'moved' }),
    at('2026-11-28T09:00:00Z', { profile_id: 'grace' }),
  ];
  const next = nextSessionStarts(sessions, [], NOW);
  assert.equal(next.get('sam'), '2026-11-25T09:30:00Z');
  assert.equal(next.has('tom'), false);
  assert.equal(next.get('grace'), '2026-11-28T09:00:00Z');
});

test('a group’s call is the next session of each person in it', () => {
  const group = { id: 'g1', group_id: 'team', starts_at: '2026-11-26T13:00:00Z', minutes: 90, outcome: null };
  const own = at('2026-12-01T09:00:00Z', { profile_id: 'jordan' });
  const next = nextSessionStarts([own, group], [{ session_id: 'g1', profile_id: 'jordan' }, { session_id: 'g1', profile_id: 'tom' }], NOW);
  assert.equal(next.get('jordan'), '2026-11-26T13:00:00Z');
  assert.equal(next.get('tom'), '2026-11-26T13:00:00Z');
});

test('nothing given, nothing booked', () => {
  assert.equal(nextSessionStarts(undefined, undefined, NOW).size, 0);
  assert.equal(nextSessionStarts([{ starts_at: null, profile_id: 'x' }], null, NOW).size, 0);
});

test('an associate’s client: matched by their coach and their name', () => {
  const assoc = [
    { coach_id: 'maya', client_name: 'Alex Morgan', starts_at: '2026-12-02T10:00:00Z', minutes: 60 },
    { coach_id: 'maya', client_name: 'Alex Morgan', starts_at: '2026-11-28T10:00:00Z', minutes: 60 },
    { coach_id: 'maya', client_name: 'Alex Morgan', starts_at: '2026-11-20T10:00:00Z', minutes: 60 },
    { coach_id: 'kate', client_name: 'Alex Morgan', starts_at: '2026-11-26T10:00:00Z', minutes: 60 },
  ];
  const next = associateNextStarts(assoc, NOW);
  assert.equal(next.get('maya|Alex Morgan'), '2026-11-28T10:00:00Z');
  assert.equal(next.get('kate|Alex Morgan'), '2026-11-26T10:00:00Z');
});

test('the Clients list reads it: clientData.js no longer leaves every client "Not booked"', () => {
  const src = readFileSync(new URL('../../src/pages/coach/clientData.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /nextAt: null/, 'every row works out its next session');
  assert.match(src, /nextSessionStarts\(sessions, sessionPeople/);
});
