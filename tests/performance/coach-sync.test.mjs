// Keeping in step, the next-call bar and the reminders (Phase 6a run 3,
// steps 3 and 6): the loop's rules, Zoom on its own, the connections as
// Settings shows them, the bar from the coach's own calls, which reminders
// are due, and the two server functions' shapes. No key, no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as cal from '../../src/lib/coach/calendar.js';
import { callForBar, nextCallBar } from '../../src/lib/coach/model.js';
import { googleStandIn, syncOnce, zoomOnce, zoomStandIn } from '../../src/lib/coach/connect/index.js';
import reminders, { dueReminders, reminderEmail } from '../../api/_routes/coach-reminders.js';
import connect, { consentUrl, GOOGLE_SCOPE, makeState, readState, returnAddress } from '../../api/_routes/coach-calendar-connect.js';
import { emailFrom } from '../../api/_coachEmails.js';
import { callInOneHourEmail, callTomorrowEmail, sessionInOneHourEmail, sessionTomorrowEmail } from '../../src/lib/email/emails.js';
import { instantAt } from '../../src/lib/time/index.js';

const LON = 'Europe/London';
const NY = 'America/New_York';
const CHICAGO = 'America/Chicago';
const ME = 'coach-1';
const at = (day, time, zone = LON) => instantAt(day, time, zone).toISOString();
const item = (id, title, day, from, to, extra = {}) => cal.newItem({ id, coachId: ME, title, starts_at: at(day, from), ends_at: at(day, to), time_zone: LON, updated_at: at('2026-11-16', '08:00'), ...extra });
const call = (id, title, day, from, to, extra = {}) => item(id, title, day, from, to, { kind: 'client_call', place_kind: 'zoom', ...extra });
const UID = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

// ---------------------------------------------------------------- the loop

test('the loop waits a few minutes between rounds, and backs off like the offline queue when nothing answers', () => {
  assert.equal(cal.syncWait(0), cal.SYNC_EVERY_MS);
  assert.ok(cal.SYNC_EVERY_MS <= 5 * 60000, 'within a few minutes');
  const mid = () => 0.5;
  assert.deepEqual([1, 2, 3, 4].map((n) => cal.syncWait(n, mid)), [2000, 4000, 8000, 16000]);
  assert.equal(cal.syncWait(30, mid), 5 * 60000);
  assert.equal(cal.syncWait(1, () => 0), 1600);
  assert.equal(cal.syncWait(1, () => 1), 2400);
  assert.ok(cal.SYNC_AFTER_SAVE_MS > 10000, 'a change goes once its 10-second Undo has passed');
});

test('what a plan removes here is noted for Google and Zoom, and an Undo after it has gone starts the item again there', () => {
  const a = { ...call('a', 'Sam Okafor', '2026-11-17', '12:30', '13:30'), google_event_id: 'ev1', google_etag: '"1" abc', meeting_id: 'm1', meeting_link: 'https://zoom.example/j/m1' };
  const b = item('b', 'Admin', '2026-11-17', '09:00', '10:00'); // never sent: nothing to delete there
  const list = cal.removedForSync([[cal.T.items, 'a'], [cal.T.items, 'b'], [cal.T.guests, 'g1'], [cal.T.items, 'nowhere']], [a, b]);
  assert.deepEqual(list, [{ id: 'a', google_event_id: 'ev1', meeting_id: 'm1' }]);
  // Undone before a round: put back as it was.
  assert.deepEqual(cal.restoredForSync([[cal.T.items, a], [cal.T.guests, { id: 'g1' }]], []), [[cal.T.items, a], [cal.T.guests, { id: 'g1' }]]);
  // Undone after a round deleted it there: it is made anew, with a new meeting.
  const back = cal.restoredForSync([[cal.T.items, a]], list)[0][1];
  assert.deepEqual([back.google_event_id, back.google_etag, back.meeting_id, back.meeting_link, back.title], [null, null, null, null, 'Sam Okafor']);
  assert.equal(cal.changedHere(back), true);
});

test('a row changed here while a round was away keeps the change, and takes only what the services said', () => {
  const before = { ...call('a', 'Sam Okafor', '2026-11-17', '12:30', '13:30'), updated_at: at('2026-11-17', '09:00') };
  const fromSync = { ...before, google_event_id: 'ev1', google_etag: '"1" print', google_synced_at: at('2026-11-17', '09:01'), meeting_link: 'https://zoom.example/j/1', meeting_id: '1' };
  // Untouched meanwhile: the round's row stands.
  assert.equal(cal.syncRowOver(before, fromSync, before), fromSync);
  // Moved by the coach meanwhile: their time is kept, with the event's id and the link.
  const moved = { ...before, starts_at: at('2026-11-17', '14:00'), ends_at: at('2026-11-17', '15:00'), updated_at: at('2026-11-17', '09:01') };
  const kept = cal.syncRowOver(moved, fromSync, before);
  assert.deepEqual([kept.starts_at, kept.google_event_id, kept.meeting_link, kept.meeting_id], [at('2026-11-17', '14:00'), 'ev1', 'https://zoom.example/j/1', '1']);
  assert.equal(cal.changedHere(kept), true, 'so the next round sends the newer time');
  // Deleted here meanwhile: it stays deleted. New from Google (never here before): it is saved.
  assert.equal(cal.syncRowOver(null, fromSync, before), null);
  assert.equal(cal.syncRowOver(null, fromSync, null), fromSync);
});

test('an event read from Google keeps its own calendar: Personal and Family stay theirs, everything else is Work', () => {
  assert.equal(cal.calendarOfEvent({ calendarId: 'family' }), 'family');
  assert.equal(cal.calendarOfEvent({ calendarId: 'personal' }), 'personal');
  assert.equal(cal.calendarOfEvent({ calendarId: 'primary' }), 'work');
  assert.equal(cal.calendarOfEvent({}), 'work');
  assert.equal(cal.calendarOfEvent({ calendarId: 'abc@group.calendar.example' }, { family: 'abc@group.calendar.example' }), 'family');
  assert.equal(cal.calendarOfEvent({ calendarId: 'abc@group.calendar.example' }, { nonsense: 'abc@group.calendar.example' }), 'work');
});

test('a personal item read from Google keeps its calendar, shows as a dashed life item, and counts as busy for booking', async () => {
  const google = googleStandIn({ now: () => new Date(at('2026-11-16', '09:00')) });
  google.inGoogle.add({ summary: 'School play', calendarId: 'family', start: { dateTime: '2026-11-18T14:00:00', timeZone: LON }, end: { dateTime: '2026-11-18T15:00:00', timeZone: LON } });
  let n = 0;
  const out = await syncOnce({ adapters: { google }, items: [], now: at('2026-11-16', '09:01'), coachZone: LON, coachId: ME, newId: () => `n${n += 1}`, calendarOf: (e) => cal.calendarOfEvent(e, { personal: 'personal', family: 'family' }) });
  const read = out.save.find(([t]) => t === cal.T.items)[1];
  assert.deepEqual([read.title, read.calendar, read.busy], ['School play', 'family', true]);
  const [e] = cal.calendarEntries({ items: [read] }, { fromDay: '2026-11-18', toDay: '2026-11-18', coachZone: LON, settings: { calendars: { family: true } } });
  assert.deepEqual([e.colour, e.dashed, e.sub], ['life', true, 'Family']);
  // Switched off in My calendars it isn't drawn, and it still blocks a booking.
  assert.equal(cal.calendarEntries({ items: [read] }, { fromDay: '2026-11-18', toDay: '2026-11-18', coachZone: LON, settings: { calendars: { family: false } } }).length, 0);
  const busy = cal.busySpans({ items: [read], from: new Date(at('2026-11-18', '00:00')), to: new Date(at('2026-11-19', '00:00')) });
  assert.equal(busy.length, 1);
  // It is never pushed back as a Work event: only its own change would go, to its own event.
  assert.equal(cal.toPush({ items: [read] }).length, 0);
});

// ---------------------------------------------------------------- Zoom

test('a call booked on Zoom gets a meeting made in the client’s time zone, and its link is saved on the item', async () => {
  const google = googleStandIn({ now: () => new Date(at('2026-11-16', '09:00')) });
  const zoom = zoomStandIn();
  const jordan = call('j', 'Jordan Reyes', '2026-11-17', '15:45', '16:45', { time_zone: CHICAGO });
  const inPerson = call('p', 'Priya Nair', '2026-11-17', '17:00', '18:00', { place_kind: 'in_person', location: 'Leeds' });
  let n = 0;
  const out = await syncOnce({ adapters: { google, zoom }, items: [jordan, inPerson], guests: [{ id: 'g', item_id: 'j', email: 'jordan@example.com', name: 'Jordan Reyes' }], now: at('2026-11-16', '09:01'), coachZone: LON, coachId: ME, newId: () => `n${n += 1}` });
  const saved = Object.fromEntries(out.save.filter(([t]) => t === cal.T.items).map(([, r]) => [r.id, r]));
  assert.match(saved.j.meeting_link, /^https:\/\/zoom\.example\/j\/\d+$/);
  assert.deepEqual(zoom.meetings().map((m) => [m.timeZone, m.minutes, m.topic]), [[CHICAGO, 60, 'Jordan Reyes']]);
  assert.equal(saved.p.meeting_link, null, 'an in-person call has no Zoom meeting');
  // The invite "goes out through Google" with the link (the stand-in only notes it).
  assert.deepEqual(google.sent().map((s) => [s.kind, s.to, s.link]), [['invite', ['jordan@example.com'], saved.j.meeting_link]]);
  assert.equal(cal.joinLink(saved.j), saved.j.meeting_link);
});

test('Zoom on its own (no Google Calendar): links are made, a moved call takes its meeting with it, a deleted one goes', async () => {
  const zoom = zoomStandIn();
  const sam = call('s', 'Sam Okafor', '2026-11-17', '12:30', '13:30');
  const writing = item('w', 'Writing', '2026-11-17', '09:00', '10:00', { kind: 'writing' });
  let out = await zoomOnce({ zoom, items: [sam, writing] });
  assert.deepEqual([out.pushed, out.problem, out.save.length], [1, null, 1]);
  const linked = out.save[0][1];
  assert.match(linked.meeting_link, /^https:\/\/zoom\.example\/j\//);
  // Nothing changed: nothing is asked of Zoom again.
  let next = await zoomOnce({ zoom, items: [linked, writing], sent: out.sent });
  assert.deepEqual([next.pushed, next.save.length], [0, 0]);
  // Moved here: the same meeting moves, the link stays.
  const moved = { ...linked, starts_at: at('2026-11-18', '10:00'), ends_at: at('2026-11-18', '11:00') };
  next = await zoomOnce({ zoom, items: [moved, writing], sent: out.sent });
  assert.equal(next.pushed, 1);
  assert.deepEqual(zoom.meetings().map((m) => [m.id, m.startsAt]), [[linked.meeting_id, at('2026-11-18', '10:00')]]);
  // Deleted here.
  const last = await zoomOnce({ zoom, items: [writing], removed: [{ id: 's', meeting_id: linked.meeting_id }], sent: next.sent });
  assert.deepEqual([zoom.meetings().length, Object.keys(last.sent).length], [0, 0]);
  // Zoom not answering: a calm line, nothing lost.
  const down = await zoomOnce({ zoom: { createMeeting: async () => { throw new Error('x'); } }, items: [sam] });
  assert.deepEqual([down.problem, down.save.length], [cal.SYNC_WORDS.zoomProblem, 0]);
});

// ---------------------------------------------------------------- Settings, My calendars

test('the connections as Settings shows them: calm with no key, a stand-in on a build that isn’t live, Connect when the keys are set', () => {
  const none = cal.connectionRows({ live: true, status: {} });
  assert.deepEqual(none.map((r) => [r.label, r.value, r.action, r.does]), [['Google Calendar', 'Not connected', 'Connect Google Calendar', 'explain'], ['Zoom', 'Not connected', 'Connect Zoom', 'explain']]);
  assert.deepEqual(none.map((r) => r.line), [cal.CONNECT_WORDS.google, cal.CONNECT_WORDS.zoom]);
  const ready = cal.connectionRows({ live: true, status: { google_ready: true, zoom: true } });
  assert.deepEqual(ready.map((r) => [r.value, r.does]), [['Not connected', 'connect'], ['Connected', null]]);
  const on = cal.connectionRows({ live: true, status: { google_calendar: true, google_ready: true, zoom: true } });
  assert.deepEqual([on[0].value, on[0].action, on[0].does, on[0].line], ['Connected', 'Disconnect Google Calendar', 'disconnect', cal.SYNC_WORDS.connected]);
  const preview = cal.connectionRows({ live: false, status: { google_ready: true }, standIns: { google: true } });
  assert.deepEqual(preview.map((r) => [r.value, r.action, r.does]), [['Stand-in', null, null], ['Not connected', 'Connect Zoom', 'explain']]);
  // The live site never shows a stand-in, whatever a device kept.
  assert.equal(cal.connectionRows({ live: true, status: {}, standIns: { google: true, zoom: true } }).every((r) => r.value === 'Not connected'), true);
  for (const words of Object.values(cal.CONNECT_WORDS)) assert.doesNotMatch(words, /fail/i);
});

test('a change from Google waits while its item is being edited, and the panel says so', () => {
  const conflicts = [{ id: 'a', reason: 'editing', words: 'This changed in Google Calendar. Save to keep your version, or close to take the new one.' }];
  assert.equal(cal.conflictWords(conflicts, 'a'), conflicts[0].words);
  assert.equal(cal.conflictWords(conflicts, 'b'), null);
  assert.equal(cal.conflictWords(null, 'a'), null);
});

test('a call moved in Google says so on its tile, in the Schedule and to a screen reader', () => {
  const sam = { ...call('s', 'Sam Okafor', '2026-11-17', '12:30', '13:30'), moved_in_google_at: at('2026-11-16', '10:00') };
  const [e] = cal.calendarEntries({ items: [sam] }, { fromDay: '2026-11-17', toDay: '2026-11-17', coachZone: LON });
  assert.equal(cal.entryLines(e, { coachZone: LON }).moved, 'Moved in Google Calendar');
  assert.match(cal.entryLabel(e, LON), /Moved in Google Calendar$/);
  assert.ok(cal.scheduleDays([e], { days: ['2026-11-17'], coachZone: LON, todayKey: '2026-11-17' })[0].rows[0].lines.includes('Moved in Google Calendar'));
  const [plain] = cal.calendarEntries({ items: [cal.seenMoved(sam)] }, { fromDay: '2026-11-17', toDay: '2026-11-17', coachZone: LON });
  assert.equal(cal.entryLines(plain, { coachZone: LON }).moved, undefined);
});

// ---------------------------------------------------------------- the next-call bar

test('the next-call bar from the coach’s own calls: 8 minutes before, coral from 5, starting now, gone 11 minutes in', () => {
  const session = { id: 'ses-1', coach_id: ME, profile_id: 'p1', starts_at: at('2026-11-17', '12:30'), minutes: 60, place: null, outcome: null };
  const sam = { ...call('s', 'Sam Okafor', '2026-11-17', '12:30', '13:30'), profile_id: 'p1', session_id: 'ses-1', meeting_link: 'https://zoom.example/j/41' };
  const chem = { ...call('c', 'Grace Liu', '2026-11-17', '15:00', '15:30'), kind: 'chemistry' };
  const admin = item('a', 'Admin', '2026-11-17', '12:25', '12:55', { kind: 'admin' });
  const data = { items: [sam, chem, admin], sessions: [session], clients: [{ id: 'p1', name: 'Sam Okafor' }], groups: [], coachZone: LON };
  const barAt = (time) => { const now = new Date(at('2026-11-17', time)); return nextCallBar(callForBar(cal.barCalls({ ...data, now }), now), now); };
  assert.equal(barAt('12:19'), null, '11 minutes before: nothing yet');
  assert.deepEqual(barAt('12:22'), { name: 'Sam Okafor', words: 'in 8 minutes', coral: false, zoom: 'https://zoom.example/j/41', briefTo: '/coach/sessions/ses-1', sessionId: 'ses-1' });
  assert.deepEqual([barAt('12:26').words, barAt('12:26').coral], ['in 4 minutes', true]);
  assert.deepEqual([barAt('12:30').words, barAt('12:30').coral], ['is starting now', true]);
  assert.equal(barAt('12:39').words, 'started 9 minutes ago');
  assert.equal(barAt('12:41'), null, '11 minutes in: gone');
  // Only calls: the Admin block at 12:25 never shows. A Chemistry Call has no session and no brief.
  const chemBar = barAt('14:55');
  assert.deepEqual([chemBar.name, chemBar.sessionId, chemBar.zoom], ['Grace Liu', null, null]);
  // A session with no calendar item (added from a client's page) shows too, with its own link.
  const now = new Date(at('2026-11-17', '09:55'));
  const run2 = cal.barCalls({ items: [], sessions: [{ ...session, id: 'ses-2', starts_at: at('2026-11-17', '10:00'), place: 'https://zoom.example/j/77' }], clients: data.clients, groups: [], now, coachZone: LON });
  assert.deepEqual(run2.map((c) => [c.name, c.zoom, c.sessionId]), [['Sam Okafor', 'https://zoom.example/j/77', 'ses-2']]);
});

// ---------------------------------------------------------------- reminders

const coming = (extra = {}) => ({ item_id: UID(1), coach_id: UID(9), kind: 'day_before', occurrence_at: at('2026-11-18', '09:00', NY), ends_at: at('2026-11-18', '10:00', NY), time_zone: NY, title: 'Jordan Reyes', place_kind: 'zoom', meeting_link: 'https://zoom.example/j/5', location: null, coach_first_name: 'Tim', person_name: 'Jordan Reyes', person_email: 'jordan@example.com', person_zone: NY, frequent_traveller: false, guest_key: null, ...extra });

test('the day-before reminder goes from 18:00 to 21:00 the client’s own time, the 1-hour one from 60 to 30 minutes before', () => {
  const day = coming();
  const hour = coming({ kind: 'hour_before' });
  const due = (row, now) => cal.remindersToSend([row], now).length === 1;
  assert.equal(due(day, at('2026-11-17', '17:59', NY)), false);
  assert.equal(due(day, at('2026-11-17', '18:00', NY)), true);
  assert.equal(due(day, at('2026-11-17', '20:59', NY)), true);
  assert.equal(due(day, at('2026-11-17', '21:00', NY)), false, 'never late in their evening');
  assert.equal(due(day, at('2026-11-17', '18:00', LON)), false, '18:00 UK time is lunchtime in New York');
  assert.equal(due(day, at('2026-11-18', '08:30', NY)), false, 'a call booked too late for it gets none');
  assert.equal(due(hour, at('2026-11-18', '07:59', NY)), false);
  assert.equal(due(hour, at('2026-11-18', '08:00', NY)), true);
  assert.equal(due(hour, at('2026-11-18', '08:29', NY)), true);
  assert.equal(due(hour, at('2026-11-18', '08:30', NY)), false, '"in 1 hour" would be wrong by then');
  // The reader's own day: a 00:30 call in Sydney is reminded on the evening before THERE.
  const sydney = coming({ occurrence_at: at('2026-11-19', '00:30', 'Australia/Sydney'), person_zone: 'Australia/Sydney', time_zone: 'Australia/Sydney' });
  assert.equal(due(sydney, at('2026-11-18', '18:30', 'Australia/Sydney')), true);
  // A row with nobody to email, no start or no real zone is left out; an offset is never a zone.
  assert.equal(cal.remindersToSend([coming({ person_email: null }), coming({ occurrence_at: 'x' }), coming({ person_zone: '-05:00', time_zone: 'EST5' }), null], at('2026-11-17', '18:30', NY)).length, 0);
  assert.equal(cal.remindersToSend([coming({ person_zone: null })], at('2026-11-17', '18:30', NY))[0].readerZone, NY, 'falls back to the call’s own anchor zone');
  assert.deepEqual(cal.remindersToSend('nonsense', new Date()), []);
});

test('the reminders server function: one send a call and a kind, the right email, the 1-hour one with its clock time in the reader’s zone (draft-2)', () => {
  const now = at('2026-11-17', '18:30', NY);
  const rows = [coming(), coming(), coming({ item_id: UID(2), person_email: 'Grace Liu <grace@example.com>, x@example.com' }), coming({ item_id: 'not-an-id' })];
  const due = dueReminders(rows, now);
  assert.deepEqual(due.map((r) => [r.item_id, r.to]), [[UID(1), 'jordan@example.com']], 'nobody twice, and never a list of addresses');

  const origin = 'https://portal.theclarityproject.co.uk';
  const client = reminderEmail(due[0], { origin, hasAccount: true, now: new Date(now) });
  assert.match(client.subject, /^Your coaching session with Tim is tomorrow at 9:00 am New York time$/);
  assert.match(client.text, /Start my 2-minute prep/);
  assert.match(client.text, /What would make it really useful for you\?/);
  assert.match(client.text, /https:\/\/portal\.theclarityproject\.co\.uk\/coaching/);
  assert.match(client.text, /Join on Zoom/);
  assert.doesNotMatch(client.text, /Choose which emails to get/, 'its page doesn’t exist yet');
  // Someone without an account has nothing to prepare in; an in-person call has no Zoom link.
  const noAccount = reminderEmail({ ...due[0], place_kind: 'in_person', meeting_link: null }, { origin, hasAccount: false, now: new Date(now) });
  assert.doesNotMatch(noAccount.text, /Start my 2-minute prep|Join on Zoom/);
  // A UK reader: 24-hour, "UK time".
  const uk = reminderEmail(cal.remindersToSend([coming({ occurrence_at: at('2026-11-18', '15:00'), person_zone: LON, time_zone: LON })], at('2026-11-17', '18:30'))[0], { origin, hasAccount: true, now: new Date(at('2026-11-17', '18:30')) });
  assert.match(uk.subject, /tomorrow at 15:00 UK time$/);

  const hour = reminderEmail({ ...due[0], kind: 'hour_before' }, { origin });
  assert.equal(hour.subject, 'Your coaching session with Tim starts at 9:00 am New York time');
  assert.ok(hour.text.includes('Your coaching session with Tim starts at 9:00 am New York time.'));

  // Someone who booked on a booking page: their own words, and their own link to move or cancel.
  const key = UID(77);
  const guest = cal.remindersToSend([coming({ guest_key: key, person_name: 'Grace Liu' })], now)[0];
  const booked = reminderEmail(guest, { origin, callName: 'Chemistry Call', now: new Date(now) });
  assert.match(booked.subject, /^Your Chemistry Call with Tim is tomorrow at 9:00 am New York time$/);
  assert.match(booked.text, new RegExp(`${origin}/book/mine/${key}`));
  assert.doesNotMatch(booked.text, /coaching session|prep/);
  const bookedHour = reminderEmail({ ...guest, kind: 'hour_before' }, { origin });
  assert.equal(bookedHour.subject, 'Your call with Tim starts at 9:00 am New York time');
});

test('the reminder templates stand with their links left out, and still refuse a link that isn’t https', () => {
  for (const doc of [
    sessionTomorrowEmail({ coach: 'Tim', at: at('2026-11-18', '15:00'), zone: LON, now: new Date(at('2026-11-17', '18:00')) }),
    sessionInOneHourEmail({ coach: 'Tim' }),
    callTomorrowEmail({ callName: null, at: at('2026-11-18', '15:00'), zone: LON, now: new Date(at('2026-11-17', '18:00')) }),
    callInOneHourEmail({ callName: null }),
  ]) {
    const made = emailFrom(doc);
    assert.ok(made.subject && made.html && made.text);
    assert.doesNotMatch(made.text, /undefined|null/);
  }
  assert.throws(() => emailFrom(sessionInOneHourEmail({ coach: 'Tim', zoomLink: 'http://zoom.example/j/1' })));
});

const ask = async (handler, { body = null, method = 'POST', env = {}, headers = {}, query = {} } = {}) => {
  const saved = { ...process.env };
  for (const k of ['VERCEL_ENV', 'CRON_SECRET', 'RESEND_API_KEY', 'COACH_EMAIL_FROM', 'GUEST_EMAIL_FROM', 'ALIGNMENT_EMAIL_FROM', 'GOOGLE_CALENDAR_CLIENT_ID', 'GOOGLE_CALENDAR_CLIENT_SECRET', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']) delete process.env[k];
  Object.assign(process.env, env);
  const res = { code: 0, body: null, headers: {}, ended: false, status(c) { this.code = c; return this; }, setHeader(k, v) { this.headers[k] = v; return this; }, json(b) { this.body = b; }, end() { this.ended = true; } };
  try { await handler({ method, body, headers, query }, res); } finally { for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k]; Object.assign(process.env, saved); }
  return res;
};

test('the reminders job never runs from a preview, and only for the scheduler', async () => {
  let res = await ask(reminders, { method: 'GET' });
  assert.deepEqual([res.code, res.body], [200, { sent: 0, reason: 'preview' }]);
  const live = { VERCEL_ENV: 'production', CRON_SECRET: 'a-long-enough-secret-for-the-test' };
  assert.equal((await ask(reminders, { method: 'GET', env: live })).code, 401);
  assert.equal((await ask(reminders, { method: 'GET', env: live, headers: { authorization: 'Bearer wrong' } })).code, 401);
  res = await ask(reminders, { method: 'GET', env: live, headers: { authorization: `Bearer ${live.CRON_SECRET}` } });
  assert.deepEqual([res.code, res.body], [200, { sent: 0, reason: 'setup' }], 'with no email provider or server key it says so and asks nothing');
  assert.equal((await ask(reminders, { method: 'DELETE' })).code, 405);
});

// ---------------------------------------------------------------- connecting Google

test('connecting Google: the state names the coach, runs out after 10 minutes and can’t be changed', () => {
  const secret = 'not-a-real-secret';
  const t0 = Date.UTC(2026, 10, 20, 9, 0);
  const state = makeState(UID(5), secret, t0);
  assert.equal(readState(state, secret, t0 + 60000), UID(5));
  assert.equal(readState(state, secret, t0 + 10 * 60000 + 1), null, 'too late');
  assert.equal(readState(state, 'another-secret', t0), null);
  const [body, mark] = state.split('.');
  const other = Buffer.from(JSON.stringify({ c: UID(6), e: t0 + 9e9 })).toString('base64url');
  assert.equal(readState(`${other}.${mark}`, secret, t0), null, 'changed on the way');
  assert.equal(readState(`${body}.${mark}.x`, secret, t0), null);
  for (const bad of [null, '', 'x', 'a.b', `${body}.`]) assert.equal(readState(bad, secret, t0), null);
  assert.equal(readState(state, '', t0), null);
});

test('connecting Google: the consent page asks for calendar events and (run 8) the calendar list, read only, and comes back to the portal’s own address', () => {
  const origin = 'https://portal.theclarityproject.co.uk';
  assert.equal(returnAddress(origin), 'https://portal.theclarityproject.co.uk/api/coach-calendar-connect');
  const url = new URL(consentUrl({ clientId: 'an-id', origin, state: 's.t' }));
  assert.equal(`${url.origin}${url.pathname}`, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.deepEqual([url.searchParams.get('redirect_uri'), url.searchParams.get('scope'), url.searchParams.get('access_type'), url.searchParams.get('response_type'), url.searchParams.get('state')],
    [returnAddress(origin), GOOGLE_SCOPE, 'offline', 'code', 's.t']);
  // Run 8: the list of the coach's calendars, read only, so My calendars can offer each one's switch.
  assert.equal(GOOGLE_SCOPE, 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.calendarlist.readonly');
});

test('connecting Google never runs from a preview, needs the keys, and needs a sign-in', async () => {
  let res = await ask(connect, { body: { kind: 'start' } });
  assert.deepEqual([res.code, res.body], [200, { ok: false, reason: 'preview' }]);
  res = await ask(connect, { body: { kind: 'start' }, env: { VERCEL_ENV: 'production' } });
  assert.deepEqual([res.code, res.body], [200, { ok: false, reason: 'not_connected' }], 'no key: calm');
  const keys = { VERCEL_ENV: 'production', GOOGLE_CALENDAR_CLIENT_ID: 'an-id', GOOGLE_CALENDAR_CLIENT_SECRET: 'not-a-real-secret', SUPABASE_SERVICE_ROLE_KEY: 'not-a-real-key', SUPABASE_URL: 'https://db.example.invalid', SUPABASE_ANON_KEY: 'anon' };
  assert.equal((await ask(connect, { body: { kind: 'start' }, env: keys })).code, 401);
  assert.equal((await ask(connect, { body: { kind: 'anything' }, env: keys })).code, 400);
  assert.equal((await ask(connect, { method: 'PUT', env: keys })).code, 405);
  // Google's return with a state that isn't ours, or none: back to Settings with a calm word, and nothing is asked of Google.
  for (const query of [{}, { code: 'c', state: 'x.y' }, { state: makeState(UID(5), 'not-a-real-secret') }]) {
    res = await ask(connect, { method: 'GET', env: keys, query });
    assert.deepEqual([res.code, res.headers.Location, res.ended], [302, 'https://portal.theclarityproject.co.uk/coach/settings/calendars?google=problem', true]);
  }
  // A preview's return goes back to the live site's Settings, connected to nothing.
  res = await ask(connect, { method: 'GET', query: { code: 'c', state: 's' } });
  assert.deepEqual([res.code, res.headers.Location], [302, 'https://portal.theclarityproject.co.uk/coach/settings/calendars?google=problem']);
});
