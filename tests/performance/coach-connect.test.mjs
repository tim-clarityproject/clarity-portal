// Google Calendar and Zoom behind their adapters (Phase 6a run 3, step 3):
// the stand-ins behave like the services, the one chooser gives the real
// adapter only when the server says its key is set, and a whole sync, both
// ways, ends with the portal and "Google" the same. No key, no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseAdapters, deviceStandIns, googleStandIn, loadAdapters, resetStandInsForTests, serverStatus, syncOnce, zoomStandIn } from '../../src/lib/coach/connect/index.js';
import * as cal from '../../src/lib/coach/calendar.js';
import handler, { askedFor, keysSet, zoomMeetingBody } from '../../api/_routes/coach-calendar.js';
import { instantAt, wallClock } from '../../src/lib/time/index.js';

const LON = 'Europe/London';
const CHICAGO = 'America/Chicago';
const ME = 'coach-1';
const at = (day, time, zone = LON) => instantAt(day, time, zone).toISOString();
const uk = (t) => wallClock(t, LON).time;
let n = 0;
const newId = () => { n += 1; return `id-${n}`; };
const item = (id, title, day, from, to, extra = {}) => cal.newItem({ id, coachId: ME, title, starts_at: at(day, from), ends_at: at(day, to), time_zone: LON, updated_at: at('2026-11-16', '08:00'), ...extra });

/** A tiny device: the rows a page would hold, with a sync's answer applied to them as the store would. */
function device(items, extra = {}) {
  const d = { items, guests: [], sessions: [], syncToken: null, ...extra };
  d.apply = (out, stampedAt) => {
    for (const [table, row] of out.save) {
      const key = table === cal.T.items ? 'items' : table === cal.T.guests ? 'guests' : 'sessions';
      // The store restamps updated_at on every save, a sync's own included.
      d[key] = [...d[key].filter((r) => r.id !== row.id), { ...row, updated_at: stampedAt }];
    }
    for (const [table, id] of out.remove) { const key = table === cal.T.items ? 'items' : table === cal.T.guests ? 'guests' : 'sessions'; d[key] = d[key].filter((r) => r.id !== id); }
    d.syncToken = out.syncToken;
    return out;
  };
  return d;
}

// ---------------------------------------------------------------- the stand-ins

test('the Google stand-in keeps events, hands back changes since a sync token, and notes the invites it would send', async () => {
  let clock = new Date('2026-11-16T09:00:00Z');
  const google = googleStandIn({ now: () => clock });
  assert.deepEqual([google.service, google.real], ['google_calendar', false]);
  const first = await google.listChanges();
  assert.deepEqual(first, { events: [], syncToken: '0' });
  const made = await google.createEvent({ summary: 'Sam Okafor', location: 'https://zoom.example/j/1', start: { dateTime: '2026-11-17T12:30:00', timeZone: LON }, end: { dateTime: '2026-11-17T13:30:00', timeZone: LON }, attendees: [{ email: 'Sam@example.invalid' }] });
  assert.ok(made.id && made.etag && made.updated);
  assert.equal(made.attendees[0].responseStatus, 'needsAction');
  // Its guest is "invited", with the Zoom link: noted, never sent.
  assert.deepEqual(google.sent().map((s) => [s.kind, s.to, s.link]), [['invite', ['sam@example.invalid'], 'https://zoom.example/j/1']]);
  const second = await google.listChanges({ syncToken: first.syncToken });
  assert.deepEqual(second.events.map((e) => e.id), [made.id]);
  assert.deepEqual((await google.listChanges({ syncToken: second.syncToken })).events, [], 'nothing since');
  // An update changes the tag and tells the guest; with invite off nobody is told.
  clock = new Date('2026-11-16T09:05:00Z');
  const changed = await google.updateEvent(made.id, { summary: 'Sam Okafor (review)' });
  assert.notEqual(changed.etag, made.etag);
  assert.equal(changed.start.dateTime, '2026-11-17T12:30:00', 'what wasn’t given stays');
  await google.updateEvent(made.id, { summary: 'Sam Okafor' }, { invite: false });
  assert.deepEqual(google.sent().map((s) => s.kind), ['invite', 'update']);
  // A reply is kept through an edit, and asked for again when the time moves.
  google.inGoogle.reply(made.id, 'sam@example.invalid', 'accepted');
  assert.equal((await google.updateEvent(made.id, { summary: 'Sam' }, { invite: false })).attendees[0].responseStatus, 'accepted');
  assert.equal((await google.updateEvent(made.id, { start: { dateTime: '2026-11-17T14:00:00', timeZone: LON } }, { invite: false })).attendees[0].responseStatus, 'needsAction');
  // Changes made "in Google" come back on the next sync: a move, a new event, a delete.
  const token = (await google.listChanges()).syncToken;
  google.inGoogle.move(made.id, '2026-11-17T15:00:00Z', '2026-11-17T16:00:00Z');
  const added = google.inGoogle.add({ summary: 'Dentist', start: { dateTime: '2026-11-19T10:00:00Z' }, end: { dateTime: '2026-11-19T11:00:00Z' } });
  let back = await google.listChanges({ syncToken: token });
  assert.deepEqual(back.events.map((e) => [e.id, e.status]), [[made.id, 'confirmed'], [added.id, 'confirmed']]);
  assert.equal(back.events[0].start.dateTime, '2026-11-17T15:00:00.000Z');
  google.inGoogle.remove(added.id);
  back = await google.listChanges({ syncToken: back.syncToken });
  assert.deepEqual(back.events.map((e) => [e.id, e.status]), [[added.id, 'cancelled']]);
  // A deleted event tells its guests, and is gone; deleting it twice is no error; a full list never holds it.
  await google.deleteEvent(made.id);
  await google.deleteEvent(made.id);
  assert.equal(google.sent().at(-1).kind, 'cancel');
  assert.deepEqual((await google.listChanges()).events, []);
  assert.deepEqual(google.events(), []);
  await assert.rejects(google.updateEvent(made.id, { summary: 'x' }), { code: 'not_found' });
  // A token that isn't one of ours gets everything, as Google does for one it no longer honours.
  const again = await google.createEvent({ summary: 'Admin', start: { dateTime: '2026-11-18T14:00:00Z' }, end: { dateTime: '2026-11-18T16:00:00Z' } });
  assert.deepEqual((await google.listChanges({ syncToken: 'from-somewhere-else' })).events.map((e) => e.id), [again.id]);
});

test('the Google stand-in can be kept between page loads', async () => {
  let kept = null;
  const keep = { read: () => kept, write: (s) => { kept = JSON.parse(JSON.stringify(s)); } };
  const one = googleStandIn({ keep });
  const made = await one.createEvent({ summary: 'Writing', start: { dateTime: '2026-11-18T09:00:00Z' }, end: { dateTime: '2026-11-18T12:00:00Z' } });
  const two = googleStandIn({ keep });
  assert.deepEqual(two.events().map((e) => e.id), [made.id]);
  assert.notEqual((await two.createEvent({ summary: 'Admin', start: {}, end: {} })).id, made.id);
});

test('the Zoom stand-in makes a meeting in a time zone and returns a made-up join link', async () => {
  const zoom = zoomStandIn();
  assert.deepEqual([zoom.service, zoom.real], ['zoom', false]);
  const m = await zoom.createMeeting({ topic: 'Jordan Reyes', startsAt: at('2026-11-17', '09:45', CHICAGO), minutes: 60, timeZone: CHICAGO });
  assert.match(m.joinUrl, /^https:\/\/zoom\.example\/j\/\d+$/);
  assert.deepEqual([m.timeZone, m.minutes, m.topic], [CHICAGO, 60, 'Jordan Reyes']);
  const other = await zoom.createMeeting({ topic: 'Sam', startsAt: at('2026-11-17', '12:30'), minutes: 60, timeZone: LON });
  assert.notEqual(other.joinUrl, m.joinUrl);
  // Moved: the link stays the same.
  const moved = await zoom.updateMeeting(m.id, { startsAt: at('2026-11-18', '09:00', CHICAGO) });
  assert.deepEqual([moved.joinUrl, moved.startsAt, moved.timeZone], [m.joinUrl, at('2026-11-18', '09:00', CHICAGO), CHICAGO]);
  await zoom.deleteMeeting(m.id);
  assert.deepEqual(zoom.meetings().map((x) => x.id), [other.id]);
  await assert.rejects(zoom.updateMeeting(m.id, { minutes: 30 }), { code: 'not_found' });
  // An offset or letters are never a time zone.
  await assert.rejects(zoom.createMeeting({ topic: 'x', startsAt: at('2026-11-17', '09:45'), timeZone: 'EST' }));
  await assert.rejects(zoom.createMeeting({ topic: 'x', startsAt: at('2026-11-17', '09:45'), timeZone: '-05:00' }));
  await assert.rejects(zoom.createMeeting({ topic: 'x', startsAt: 'never', timeZone: LON }));
});

// ---------------------------------------------------------------- choosing

test('one function chooses: the real adapter only when the server says the key is set, otherwise the stand-in', async () => {
  resetStandInsForTests();
  const asks = [];
  const server = (answer) => async (body) => { asks.push(body); return typeof answer === 'function' ? answer(body) : answer; };
  // No key: both stand-ins, and no invites are promised.
  let chosen = await loadAdapters({ ask: server({ ok: true, google_calendar: false, zoom: false }) });
  assert.deepEqual([chosen.google.real, chosen.zoom.real, chosen.invites], [false, false, false]);
  assert.deepEqual(asks, [{ kind: 'status' }]);
  // The device's stand-ins are made once and shared.
  assert.equal(chosen.google, deviceStandIns().google);
  assert.equal((await loadAdapters({ ask: server({ ok: true, google_calendar: false, zoom: false }) })).google, chosen.google);
  // Zoom's key only: the real Zoom, Google still the stand-in.
  chosen = await loadAdapters({ ask: server({ ok: true, google_calendar: false, zoom: true }) });
  assert.deepEqual([chosen.google.real, chosen.zoom.real, chosen.invites], [false, true, false]);
  // Both.
  chosen = await loadAdapters({ ask: server({ ok: true, google_calendar: true, zoom: true }) });
  assert.deepEqual([chosen.google.real, chosen.zoom.real, chosen.invites], [true, true, true]);
  // Anything that isn't that answer is "not connected": a preview, an error, no server, something truthy that isn't true.
  for (const answer of [{ ok: false, reason: 'preview' }, null, 'yes', { ok: true, google_calendar: 'true', zoom: 1 }, () => { throw new Error('offline'); }]) {
    const c = await loadAdapters({ ask: server(answer) });
    assert.deepEqual([c.google.real, c.zoom.real], [false, false]);
  }
  assert.deepEqual(await serverStatus(async () => ({ ok: true, google_calendar: true })), { google_calendar: true, zoom: false });
  assert.equal(chooseAdapters({ google_calendar: true, zoom: true }, {}).google.real, false, 'with no way to ask the server there is no real adapter');
  assert.equal((await loadAdapters()).google.real, false);
});

test('the real adapters only ever ask the portal’s own server, and say so calmly when it doesn’t answer', async () => {
  const asks = [];
  const ask = async (body) => {
    asks.push(body);
    if (body.service === 'zoom') return body.kind === 'delete' ? { ok: true } : { ok: true, meeting: { id: 99, joinUrl: 'https://zoom.us/j/99' } };
    if (body.kind === 'list') return { ok: true, events: [{ id: 'e1' }], syncToken: 't2' };
    if (body.kind === 'delete') return { ok: true };
    return { ok: true, event: { id: 'e1', etag: 'x', ...body.event } };
  };
  const { google, zoom } = chooseAdapters({ google_calendar: true, zoom: true }, { ask });
  assert.deepEqual(await google.listChanges({ syncToken: 't1' }), { events: [{ id: 'e1' }], syncToken: 't2' });
  assert.equal((await google.createEvent({ summary: 'Sam' })).id, 'e1');
  await google.updateEvent('e1', { summary: 'Sam' }, { invite: false });
  await google.deleteEvent('e1');
  assert.deepEqual(await zoom.createMeeting({ topic: 'Sam', startsAt: at('2026-11-17', '12:30'), minutes: 60, timeZone: LON }), { id: '99', joinUrl: 'https://zoom.us/j/99' });
  await zoom.deleteMeeting('99');
  assert.deepEqual(asks.map((a) => [a.service, a.kind, a.invite]), [['google_calendar', 'list', undefined], ['google_calendar', 'create', true], ['google_calendar', 'update', false], ['google_calendar', 'delete', true], ['zoom', 'create', undefined], ['zoom', 'delete', undefined]]);
  const down = chooseAdapters({ google_calendar: true, zoom: true }, { ask: async () => ({ ok: false, reason: 'not_connected' }) });
  await assert.rejects(down.google.listChanges(), { code: 'not_connected' });
  await assert.rejects(down.zoom.createMeeting({}), { code: 'not_connected' });
  // A join link that isn't https is never passed on.
  const odd = chooseAdapters({ zoom: true }, { ask: async () => ({ ok: true, meeting: { id: 1, joinUrl: 'javascript:alert(1)' } }) });
  assert.equal((await odd.zoom.createMeeting({})).joinUrl, null);
});

// ---------------------------------------------------------------- a whole sync, both ways

test('a sync end to end: what is made here reaches Google with a Zoom link in the client’s time zone, and what changes there comes back', async () => {
  const google = googleStandIn({ now: () => new Date('2026-11-16T09:00:00Z') });
  const zoom = zoomStandIn();
  const adapters = { google, zoom };
  const d = device([
    item('jordan', 'Jordan Reyes', '2026-11-17', '15:45', '16:45', { kind: 'client_call', place_kind: 'zoom', time_zone: CHICAGO, session_id: 's1' }),
    item('writing', 'Writing', '2026-11-18', '09:00', '12:00', { kind: 'writing' }),
    item('dentist', 'Dentist', '2026-11-19', '10:00', '11:00', { calendar: 'personal' }),
  ], { guests: [{ id: 'g1', item_id: 'jordan', name: 'Jordan Reyes', email: 'jordan@example.invalid', reply: 'none' }], sessions: [{ id: 's1', starts_at: at('2026-11-17', '15:45'), minutes: 60 }] });
  const round = (now, extra = {}) => syncOnce({ adapters, items: d.items, guests: d.guests, sessions: d.sessions, syncToken: d.syncToken, now, coachZone: LON, coachId: ME, newId, ...extra });

  // Round 1: the two work items go to Google; the client call gets its Zoom meeting first, made in Chicago time.
  let out = d.apply(await round(at('2026-11-16', '09:00')), at('2026-11-16', '09:00'));
  assert.deepEqual([out.pushed, out.problem, out.conflicts.length], [2, null, 0]);
  const jordan = () => d.items.find((i) => i.id === 'jordan');
  assert.match(jordan().meeting_link, /^https:\/\/zoom\.example\/j\//);
  assert.deepEqual(zoom.meetings().map((m) => [m.topic, m.timeZone, m.startsAt]), [['Jordan Reyes', CHICAGO, at('2026-11-17', '15:45')]]);
  const events = google.events();
  assert.deepEqual(events.map((e) => e.summary).sort(), ['Jordan Reyes', 'Writing'], 'a personal item is never made in Google from here');
  const event = events.find((e) => e.summary === 'Jordan Reyes');
  assert.deepEqual(event.start, { dateTime: '2026-11-17T09:45:00', timeZone: CHICAGO }, 'the invite is in the client’s own time zone');
  assert.equal(event.location, jordan().meeting_link);
  assert.deepEqual(google.sent().map((s) => [s.kind, s.to, s.link]), [['invite', ['jordan@example.invalid'], jordan().meeting_link]], 'the invite carries the Zoom link');
  assert.equal(jordan().google_event_id, event.id);

  // Round 2: nothing changed on either side, though the store restamped every row it saved: nothing is pushed again.
  out = d.apply(await round(at('2026-11-16', '09:03')), at('2026-11-16', '09:03'));
  assert.deepEqual([out.pushed, out.save.length, out.remove.length], [0, 0, 0]);
  assert.equal(google.sent().length, 1, 'no second invite');

  // Tim moves the call in Google, and Jordan says yes there.
  google.inGoogle.move(event.id, '2026-11-17T17:00:00Z', '2026-11-17T18:00:00Z');
  google.inGoogle.reply(event.id, 'jordan@example.invalid', 'accepted');
  out = d.apply(await round(at('2026-11-16', '09:06')), at('2026-11-16', '09:06'));
  assert.deepEqual([uk(jordan().starts_at), jordan().time_zone, Boolean(jordan().moved_in_google_at)], ['17:00', CHICAGO, true]);
  assert.equal(d.sessions[0].starts_at, at('2026-11-17', '17:00'), 'its session moved with it');
  assert.equal(d.guests[0].reply, 'yes');
  assert.deepEqual(out.moved.map((i) => i.id), ['jordan']);
  assert.equal(out.pushed, 0, 'what came from Google is not pushed back');
  const [shown] = cal.calendarEntries({ items: d.items, sessions: d.sessions }, { fromDay: '2026-11-17', toDay: '2026-11-17', coachZone: LON });
  assert.equal(shown.movedInGoogle, true);
  assert.equal(shown.clientWords, '11:00 am Chicago');

  // Tim moves Writing here: it reaches Google on the next round, and the Zoom meeting of a moved call follows it.
  const moved = cal.moveEntry(cal.calendarEntries({ items: d.items }, { fromDay: '2026-11-18', toDay: '2026-11-18', coachZone: LON })[0], { day: '2026-11-18', startMin: 10 * 60 }, { coachZone: LON, data: d, newId });
  d.apply({ save: moved.save, remove: moved.remove, syncToken: d.syncToken }, at('2026-11-16', '09:10'));
  const call = cal.moveEntry(cal.calendarEntries({ items: d.items, sessions: d.sessions }, { fromDay: '2026-11-17', toDay: '2026-11-17', coachZone: LON })[0], { day: '2026-11-17', startMin: 16 * 60 }, { coachZone: LON, data: d, newId });
  d.apply({ save: call.save, remove: call.remove, syncToken: d.syncToken }, at('2026-11-16', '09:10'));
  out = d.apply(await round(at('2026-11-16', '09:12')), at('2026-11-16', '09:12'));
  assert.equal(out.pushed, 2);
  assert.equal(google.events().find((e) => e.summary === 'Writing').start.dateTime, '2026-11-18T10:00:00');
  assert.equal(google.events().find((e) => e.summary === 'Jordan Reyes').start.dateTime, '2026-11-17T10:00:00');
  assert.equal(zoom.meetings()[0].startsAt, at('2026-11-17', '16:00'));
  assert.equal(zoom.meetings().length, 1, 'the same meeting, moved: never a second one');
  assert.deepEqual(google.sent().map((s) => s.kind), ['invite', 'update'], 'Jordan gets the new time through Google');

  // An event made in Google arrives; one deleted there goes, with its session.
  google.inGoogle.add({ summary: 'Board call', start: { dateTime: '2026-11-19T14:00:00Z' }, end: { dateTime: '2026-11-19T15:00:00Z' } });
  google.inGoogle.remove(event.id);
  out = d.apply(await round(at('2026-11-16', '09:15')), at('2026-11-16', '09:15'));
  assert.deepEqual(d.items.map((i) => i.title).sort(), ['Board call', 'Dentist', 'Writing']);
  assert.deepEqual([d.sessions.length, d.guests.length], [0, 0]);
  assert.deepEqual(zoom.meetings(), [], 'a call deleted in Google has no use for its Zoom meeting');
  // Deleted here: it goes from Google and from Zoom.
  const writing = d.items.find((i) => i.id === 'writing');
  d.items = d.items.filter((i) => i.id !== 'writing');
  out = d.apply(await round(at('2026-11-16', '09:18'), { removed: [{ google_event_id: writing.google_event_id, meeting_id: null }] }), at('2026-11-16', '09:18'));
  assert.deepEqual(google.events().map((e) => e.summary), ['Board call']);
  assert.deepEqual(zoom.meetings(), []);
  assert.deepEqual(d.items.map((i) => i.title).sort(), ['Board call', 'Dentist'], 'and the delete read back from Google changes nothing here');
});

test('a sync with a Google change arriving while the call is being edited, then the newest choice winning', async () => {
  const google = googleStandIn({ now: () => new Date('2026-11-16T10:00:00Z') });
  const adapters = { google, zoom: zoomStandIn() };
  const d = device([item('sam', 'Sam Okafor', '2026-11-17', '12:30', '13:30', { kind: 'client_call', place_kind: 'zoom' })]);
  const round = (now, extra = {}) => syncOnce({ adapters, items: d.items, guests: d.guests, sessions: d.sessions, syncToken: d.syncToken, now, coachZone: LON, coachId: ME, newId, ...extra });
  d.apply(await round(at('2026-11-16', '09:00')), at('2026-11-16', '09:00'));
  const sam = () => d.items.find((i) => i.id === 'sam');
  // It is moved in Google at 10:00 while Tim has it open in the edit panel.
  google.inGoogle.move(sam().google_event_id, '2026-11-17T15:00:00Z', '2026-11-17T16:00:00Z');
  let out = d.apply(await round(at('2026-11-16', '10:01'), { editingId: 'sam' }), at('2026-11-16', '10:01'));
  assert.deepEqual([out.save.length, out.pushed, out.conflicts.map((c) => c.id)], [0, 0, ['sam']]);
  assert.equal(uk(sam().starts_at), '12:30', 'nothing changed under the edit');
  // He saves his own change at 10:04: his is the newer, so it stands and is pushed, and both end the same.
  d.items = [{ ...sam(), starts_at: at('2026-11-17', '14:00'), ends_at: at('2026-11-17', '15:00'), updated_at: at('2026-11-16', '10:04') }];
  out = d.apply(await round(at('2026-11-16', '10:05')), at('2026-11-16', '10:05'));
  assert.deepEqual([out.pushed, out.conflicts.length], [1, 0]);
  assert.equal(google.events()[0].start.dateTime, '2026-11-17T14:00:00');
  assert.equal(uk(sam().starts_at), '14:00');
  assert.equal(sam().moved_in_google_at, null);
  // Left alone instead (closed without saving), Google's time comes in on the next round.
  const d2 = device([item('sam', 'Sam Okafor', '2026-11-17', '12:30', '13:30', { kind: 'client_call', place_kind: 'zoom' })]);
  const g2 = googleStandIn({ now: () => new Date('2026-11-16T10:00:00Z') });
  const round2 = (now, extra = {}) => syncOnce({ adapters: { google: g2, zoom: zoomStandIn() }, items: d2.items, guests: [], sessions: [], syncToken: d2.syncToken, now, coachZone: LON, coachId: ME, newId, ...extra });
  d2.apply(await round2(at('2026-11-16', '09:00')), at('2026-11-16', '09:00'));
  g2.inGoogle.move(d2.items[0].google_event_id, '2026-11-17T15:00:00Z', '2026-11-17T16:00:00Z');
  d2.apply(await round2(at('2026-11-16', '10:01'), { editingId: 'sam' }), at('2026-11-16', '10:01'));
  // The conflict was held back, so the same change is asked for again: the token mustn't hide it.
  out = d2.apply(await round2(at('2026-11-16', '10:06')), at('2026-11-16', '10:06'));
  assert.equal(uk(d2.items[0].starts_at), '15:00');
  assert.ok(d2.items[0].moved_in_google_at);
});

test('a service that stops answering part-way: what was done is kept, a calm line is given, and the rest goes next time', async () => {
  const google = googleStandIn();
  let fail = true;
  const flaky = { ...google, createEvent: async (...a) => { if (fail) throw new Error('down'); return google.createEvent(...a); } };
  const d = device([item('a', 'Admin', '2026-11-18', '14:00', '16:00', { kind: 'admin' })]);
  const round = () => syncOnce({ adapters: { google: flaky, zoom: zoomStandIn() }, items: d.items, syncToken: d.syncToken, now: at('2026-11-16', '09:00'), coachZone: LON, coachId: ME, newId });
  let out = d.apply(await round(), at('2026-11-16', '09:00'));
  assert.deepEqual([out.pushed, out.problem], [0, 'Google Calendar didn’t answer. Your changes are safe here and will be sent again.']);
  assert.equal(d.items[0].google_event_id, null);
  fail = false;
  out = d.apply(await round(), at('2026-11-16', '09:03'));
  assert.deepEqual([out.pushed, out.problem, google.events().length], [1, null, 1]);
});

// ---------------------------------------------------------------- the server function's shape

const call = async (body, { env = {}, headers = {}, method = 'POST' } = {}) => {
  const saved = { ...process.env };
  for (const k of ['VERCEL_ENV', 'GOOGLE_CALENDAR_CLIENT_ID', 'GOOGLE_CALENDAR_CLIENT_SECRET', 'ZOOM_ACCOUNT_ID', 'ZOOM_CLIENT_ID', 'ZOOM_CLIENT_SECRET', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']) delete process.env[k];
  Object.assign(process.env, env);
  const res = { code: 0, body: null, headers: {}, status(c) { this.code = c; return this; }, setHeader(k, v) { this.headers[k] = v; return this; }, json(b) { this.body = b; } };
  try { await handler({ method, body, headers }, res); } finally { for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k]; Object.assign(process.env, saved); }
  return res;
};

test('the server function: with no key it answers "not connected" calmly, and only the live site ever reaches a service', async () => {
  // A preview or a developer's machine: nothing is asked of anyone.
  let res = await call({ kind: 'status' });
  assert.deepEqual([res.code, res.body], [200, { ok: true, google_calendar: false, zoom: false, reason: 'preview' }]);
  res = await call({ service: 'zoom', kind: 'create', meeting: { topic: 'x' } }, { env: { ZOOM_ACCOUNT_ID: 'a', ZOOM_CLIENT_ID: 'b', ZOOM_CLIENT_SECRET: 'c' } });
  assert.deepEqual([res.code, res.body], [200, { ok: false, reason: 'preview' }]);
  // The live site with no key: not connected, before the database is asked anything.
  const live = { VERCEL_ENV: 'production', SUPABASE_URL: 'https://db.example.invalid', SUPABASE_ANON_KEY: 'anon' };
  res = await call({ kind: 'status' }, { env: live, headers: { authorization: 'Bearer t' } });
  assert.deepEqual([res.code, res.body], [200, { ok: true, google_calendar: false, zoom: false }]);
  res = await call({ service: 'google_calendar', kind: 'list' }, { env: live, headers: { authorization: 'Bearer t' } });
  assert.deepEqual([res.code, res.body], [200, { ok: false, reason: 'not_connected' }]);
  assert.equal(res.headers['Cache-Control'], 'no-store');
  // Not signed in, the wrong method, the wrong shape.
  assert.equal((await call({ kind: 'status' }, { env: live })).code, 401);
  assert.equal((await call({ kind: 'status' }, { method: 'GET' })).code, 405);
  for (const body of [null, {}, { kind: 'status', service: 'zoom' }, { service: 'zoom', kind: 'list' }, { service: 'google_calendar', kind: 'update', event: {} }, { service: 'google_calendar', kind: 'delete', id: '../x' }, { service: 'zoom', kind: 'create', meeting: 'x' }, { service: 'google_calendar', kind: 'create', event: { summary: 'x'.repeat(30000) } }, { service: 'drive', kind: 'list' }]) {
    assert.equal(askedFor(body), null, JSON.stringify(body)?.slice(0, 60));
    assert.equal((await call(body, { env: live, headers: { authorization: 'Bearer t' } })).code, 400);
  }
  assert.deepEqual(askedFor({ service: 'google_calendar', kind: 'create', event: { summary: 'Sam' } }), { service: 'google_calendar', kind: 'create', id: null, event: { summary: 'Sam' }, invite: true });
  assert.deepEqual(askedFor({ service: 'google_calendar', kind: 'delete', id: 'abc_123', invite: false }), { service: 'google_calendar', kind: 'delete', id: 'abc_123', event: null, invite: false });
  // Which keys are set is only ever a yes or a no; Google also needs the server's own key for the coach's token.
  assert.deepEqual(keysSet({}), { google_calendar: false, zoom: false });
  assert.deepEqual(keysSet({ GOOGLE_CALENDAR_CLIENT_ID: 'a', GOOGLE_CALENDAR_CLIENT_SECRET: 'b' }), { google_calendar: false, zoom: false });
  assert.deepEqual(keysSet({ GOOGLE_CALENDAR_CLIENT_ID: 'a', GOOGLE_CALENDAR_CLIENT_SECRET: 'b', SUPABASE_SERVICE_ROLE_KEY: 'c', ZOOM_ACCOUNT_ID: 'd', ZOOM_CLIENT_ID: 'e' }), { google_calendar: true, zoom: false });
  assert.deepEqual(keysSet({ ZOOM_ACCOUNT_ID: 'd', ZOOM_CLIENT_ID: 'e', ZOOM_CLIENT_SECRET: 'f' }), { google_calendar: false, zoom: true });
});

test('a Zoom meeting is made in the client’s own time zone, on that zone’s own clock', () => {
  // 15:45 UK on 17 Nov is 09:45 in Chicago; on 28 Oct (UK back, US not yet) 15:45 UK is 10:45 there.
  assert.deepEqual(zoomMeetingBody({ topic: 'Jordan Reyes', startsAt: at('2026-11-17', '15:45'), minutes: 60, timeZone: CHICAGO }), { topic: 'Jordan Reyes', type: 2, timezone: CHICAGO, start_time: '2026-11-17T09:45:00', duration: 60, settings: { join_before_host: true, waiting_room: false } });
  assert.equal(zoomMeetingBody({ topic: 'Jordan Reyes', startsAt: at('2026-10-28', '15:45'), minutes: 60, timeZone: CHICAGO }).start_time, '2026-10-28T10:45:00');
  assert.equal(zoomMeetingBody({ topic: 'Mia', startsAt: at('2026-11-15', '21:00'), minutes: 30, timeZone: 'Australia/Sydney' }).start_time, '2026-11-16T08:00:00');
  assert.equal(zoomMeetingBody({ topic: 'x', startsAt: at('2026-11-17', '15:45'), minutes: 60, timeZone: 'CST' }), null);
  assert.equal(zoomMeetingBody({ topic: 'x', startsAt: 'never', minutes: 60, timeZone: CHICAGO }), null);
});
