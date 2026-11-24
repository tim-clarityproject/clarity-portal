// Claude's call on run 8's point 6 (24 Nov 2026): a session added from a client's or a group's page gets its own call
// on the calendar, as Book a call makes one, so its reminders go (they go from the calendar's calls). The calendar still
// shows it once, and adding it sends nothing (no guests).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as cal from '../../src/lib/coach/calendar.js';
import { newSession } from '../../src/lib/coach/day.js';

const ME = '11111111-1111-4111-8111-111111111111';
const AVA = { id: '22222222-2222-4222-8222-222222222222', coach_id: ME, name: 'Ava Stone', time_zone: 'America/New_York', status: 'active' };
const TEAM = { id: '33333333-3333-4333-8333-333333333333', coach_id: ME, name: 'Harbour team' };
const LON = 'Europe/London';

test('a client\'s session: a call anchored to the client\'s own zone, with the client and the session named, and no guests', () => {
  const s = newSession({ id: 's1', coachId: ME, profileId: AVA.id, kind: 'coaching', startsAt: '2026-11-26T15:00:00.000Z', minutes: 90 });
  const item = cal.sessionCallItem(s, { id: 'i1', title: AVA.name, zone: AVA.time_zone });
  assert.equal(item.kind, 'client_call');
  assert.deepEqual([item.starts_at, item.ends_at, item.time_zone], ['2026-11-26T15:00:00.000Z', '2026-11-26T16:30:00.000Z', 'America/New_York']);
  assert.deepEqual([item.profile_id, item.group_id, item.session_id, item.coach_id, item.title], [AVA.id, null, 's1', ME, 'Ava Stone']);
  assert.deepEqual([item.place_kind, item.location, item.repeat_rule], ['zoom', null, null]);
});

test('a group\'s session: the group\'s call (its reminders go to each member), anchored to the coach\'s zone; in person keeps its place', () => {
  const s = newSession({ id: 's2', coachId: ME, groupId: TEAM.id, kind: 'group', startsAt: '2026-11-27T09:00:00.000Z', minutes: 60, place: 'Harbour office' });
  const item = cal.sessionCallItem(s, { id: 'i2', title: TEAM.name, zone: LON });
  assert.deepEqual([item.profile_id, item.group_id, item.session_id, item.time_zone], [null, TEAM.id, 's2', LON]);
  assert.deepEqual([item.place_kind, item.location], ['in_person', 'Harbour office']);
});

test('no zone, no session or no time: no call made', () => {
  const s = newSession({ id: 's3', coachId: ME, profileId: AVA.id, startsAt: '2026-11-26T15:00:00.000Z', minutes: 60 });
  assert.equal(cal.sessionCallItem(s, { id: 'i3', zone: 'EST' }), null);
  assert.equal(cal.sessionCallItem(null, { id: 'i3', zone: LON }), null);
  assert.equal(cal.sessionCallItem({ ...s, starts_at: 'soon' }, { id: 'i3', zone: LON }), null);
});

test('the calendar shows the session and its call once, as the call', () => {
  const s = newSession({ id: 's4', coachId: ME, profileId: AVA.id, kind: 'coaching', startsAt: '2026-11-26T15:00:00.000Z', minutes: 60 });
  const item = cal.sessionCallItem(s, { id: 'i4', title: AVA.name, zone: AVA.time_zone });
  const range = { fromDay: '2026-11-23', toDay: '2026-11-29', coachZone: LON };
  const before = cal.calendarEntries({ sessions: [s], clients: [AVA] }, range).filter((e) => e.startsAt.toISOString() === s.starts_at);
  const after = cal.calendarEntries({ items: [item], sessions: [s], clients: [AVA] }, range).filter((e) => e.startsAt.toISOString() === s.starts_at);
  assert.equal(before.length, 1);
  assert.equal(after.length, 1);
  assert.equal(after[0].item?.id, 'i4');
});
