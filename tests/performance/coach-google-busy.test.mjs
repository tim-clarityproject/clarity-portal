// Your Personal and Family calendars from Google (Phase 6a run 8, item 2):
// the list with its switches, the busy times read from the calendars
// switched on, how they block booking pages, Offer times and polls, who can
// see them, and that the portal only ever reads those calendars. No key, no
// network: the Google stand-in (connect/standIn.js) and the server's own
// shapes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as cal from '../../src/lib/coach/calendar.js';
import {
  activeBusy, BUSY_WORDS, busyDiff, busyOnce, busyRowsFrom, calendarRowsFrom, eventIsBusy, eventSpan, stableId, TG,
} from '../../src/lib/coach/googleBusy.js';
import { googleCalendarAdapter } from '../../src/lib/coach/connect/googleCalendar.js';
import { googleStandIn, STAND_IN_CALENDARS } from '../../src/lib/coach/connect/index.js';
import { askedFor, busyEventOut } from '../../api/coach-calendar.js';
import { instantAt } from '../../src/lib/time/index.js';

const LON = 'Europe/London';
const ME = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const at = (day, time, zone = LON) => instantAt(day, time, zone);
const iso = (day, time, zone = LON) => at(day, time, zone).toISOString();
const PERSONAL = STAND_IN_CALENDARS[1].id;
const FAMILY = STAND_IN_CALENDARS[2].id;
// Tue 24 Nov 2026: the coach's week. Now is the Monday morning before.
const NOW = at('2026-11-23', '08:00');
const SETTINGS = { time_zone: LON, working_hours: { mon: { from: '09:00', to: '17:00' }, tue: { from: '09:00', to: '17:00' }, wed: { from: '09:00', to: '17:00' }, thu: { from: '09:00', to: '17:00' }, fri: { from: '09:00', to: '17:00' } } };

/** A stand-in account with the School play on Family and Physio on Personal, Tuesday. */
function account() {
  const google = googleStandIn({ now: () => NOW });
  google.inGoogle.addTo(FAMILY, { summary: 'School play', location: '12 Mill Lane', description: 'Esme is a tree', attendees: [{ email: 'gran@example.invalid' }], start: { dateTime: iso('2026-11-24', '10:30') }, end: { dateTime: iso('2026-11-24', '11:30') } });
  google.inGoogle.addTo(PERSONAL, { summary: 'Physio', start: { dateTime: iso('2026-11-24', '14:00') }, end: { dateTime: iso('2026-11-24', '15:00') } });
  return google;
}
/** A round, then the rows as the device would hold them after it. */
async function round(google, held) {
  const res = await busyOnce({ google, calendars: held.calendars, busyTimes: held.busy, coachId: ME, coachZone: LON, now: NOW });
  const apply = (rows, table) => {
    const map = new Map(rows.map((r) => [r.id, r]));
    for (const [t, id] of res.remove) if (t === table) map.delete(id);
    for (const [t, r] of res.save) if (t === table) map.set(r.id, r);
    return [...map.values()];
  };
  return { res, calendars: apply(held.calendars, TG.calendars), busy: apply(held.busy, TG.busy) };
}
const switchOn = (held, googleId, on = true) => ({ ...held, calendars: held.calendars.map((c) => (c.google_id === googleId ? { ...c, busy_on: on } : c)) });

// ---------------------------------------------------------------- the list and its switches

test('ids are worked out from what a row is: the same on every device, and a real UUID shape', () => {
  assert.equal(stableId('gcal|a|b'), stableId('gcal|a|b'));
  assert.notEqual(stableId('gcal|a|b'), stableId('gcal|a|c'));
  assert.match(stableId('x'), /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('every calendar on the account is listed, the main one first; Personal and Family start switched off', () => {
  const { rows, save, remove } = calendarRowsFrom([{ id: FAMILY, summary: 'Family' }, { id: 'primary', summary: 'Work', primary: true }, { id: PERSONAL, summary: 'Personal', summaryOverride: 'Me time' }], [], ME);
  assert.deepEqual(rows.map((r) => [r.name, r.is_main, r.busy_on, r.position]), [['Work', true, false, 0], ['Family', false, false, 1], ['Me time', false, false, 2]]);
  assert.equal(save.length, 3);
  assert.equal(remove.length, 0);
});

test('a switch the coach set is kept, the main calendar never takes it, and a calendar gone from Google goes', () => {
  const first = calendarRowsFrom(STAND_IN_CALENDARS, [], ME).rows;
  const held = first.map((r) => ({ ...r, busy_on: true })); // even a main one switched on somewhere is put right
  const next = calendarRowsFrom(STAND_IN_CALENDARS.filter((c) => c.id !== PERSONAL), held, ME);
  assert.deepEqual(next.rows.map((r) => [r.google_id, r.busy_on]), [['primary', false], [FAMILY, true]]);
  assert.deepEqual(next.remove.map((r) => r.google_id), [PERSONAL]);
  assert.deepEqual(next.save.map((r) => r.google_id), ['primary', FAMILY], 'only what changed is saved (the main one and Family moved up a place)');
  assert.equal(calendarRowsFrom(STAND_IN_CALENDARS, next.rows.concat([{ ...first[1], busy_on: false }]), ME).rows.find((r) => r.google_id === PERSONAL).busy_on, false);
});

test('odd lists: no id, a repeated id, another coach’s rows, more than 100', () => {
  const many = Array.from({ length: 130 }, (_, i) => ({ id: `c${i}@group.calendar.example`, summary: `Calendar ${i}` }));
  const out = calendarRowsFrom([{ summary: 'No id' }, { id: '' }, { id: FAMILY, summary: 'Family' }, { id: FAMILY, summary: 'Again' }, ...many], [{ id: 'x', coach_id: OTHER, google_id: FAMILY, busy_on: true }], ME);
  assert.equal(out.rows.length, 100);
  assert.equal(out.rows[0].name, 'Family');
  assert.equal(out.rows[0].busy_on, false, 'another coach’s switch is never read as this coach’s');
  assert.equal(out.remove.length, 0, 'another coach’s rows are never removed here');
  assert.equal(calendarRowsFrom(null, [], ME).rows.length, 0);
});

// ---------------------------------------------------------------- events into busy times

test('an event is busy unless cancelled, marked free, or declined by the coach', () => {
  assert.equal(eventIsBusy({ status: 'confirmed' }), true);
  assert.equal(eventIsBusy({ status: 'cancelled' }), false);
  assert.equal(eventIsBusy({ transparency: 'transparent' }), false);
  assert.equal(eventIsBusy({ attendees: [{ self: true, responseStatus: 'declined' }] }), false);
  assert.equal(eventIsBusy({ attendees: [{ self: true, responseStatus: 'tentative' }, { responseStatus: 'declined' }] }), true);
  assert.equal(eventIsBusy(null), false);
});

test('a busy time keeps the title and the times only, never the place, notes or guests', () => {
  const calendar = { id: 'cal-row' };
  const [row] = busyRowsFrom([{ id: 'e1', summary: '  School   play ', location: '12 Mill Lane', description: 'Esme', attendees: [{ email: 'gran@example.invalid' }], start: { dateTime: iso('2026-11-24', '10:30') }, end: { dateTime: iso('2026-11-24', '11:30') } }], calendar, { coachId: ME, coachZone: LON });
  assert.deepEqual(Object.keys(row).sort(), ['all_day', 'calendar_id', 'coach_id', 'ends_at', 'event_id', 'id', 'starts_at', 'title']);
  assert.equal(row.title, 'School play');
  assert.equal(row.starts_at, iso('2026-11-24', '10:30'));
  assert.equal(JSON.stringify(row).includes('Mill'), false);
});

test('an all-day event runs midnight to midnight on the coach’s clock; an untitled one reads Busy; odd times are left out', () => {
  const span = eventSpan({ start: { date: '2026-11-24' }, end: { date: '2026-11-26' } }, 'America/New_York');
  assert.deepEqual([span.start.toISOString(), span.end.toISOString(), span.allDay], [iso('2026-11-24', '00:00', 'America/New_York'), iso('2026-11-26', '00:00', 'America/New_York'), true]);
  const rows = busyRowsFrom([
    { id: 'a', start: { date: '2026-11-24' }, end: { date: '2026-11-25' } },
    { id: 'b', summary: 'Backwards', start: { dateTime: iso('2026-11-24', '12:00') }, end: { dateTime: iso('2026-11-24', '11:00') } },
    { id: 'c', summary: 'Too long', start: { date: '2026-11-01' }, end: { date: '2027-01-01' } },
    { id: 'd', summary: 'No times' },
    { id: 'a', summary: 'Same id again', start: { date: '2026-11-25' }, end: { date: '2026-11-26' } },
    { summary: 'No id', start: { date: '2026-11-24' }, end: { date: '2026-11-25' } },
  ], { id: 'cal' }, { coachId: ME, coachZone: LON });
  assert.deepEqual(rows.map((r) => [r.event_id, r.title, r.all_day]), [['a', 'Busy', true]]);
});

test('what changed: new and moved busy times are saved, ones gone are removed, the same ones are left alone', () => {
  const a = { id: '1', title: 'A', starts_at: iso('2026-11-24', '10:00'), ends_at: iso('2026-11-24', '11:00'), all_day: false };
  const b = { ...a, id: '2', title: 'B' };
  const d = busyDiff([a, b], [a, { ...b, ends_at: iso('2026-11-24', '12:00') }, { ...a, id: '3' }]);
  assert.deepEqual(d.save.map((r) => r.id), ['2', '3']);
  assert.deepEqual(busyDiff([a, b], [a]).remove.map((r) => r.id), ['2']);
  assert.deepEqual(busyDiff([a], [a]), { save: [], remove: [] });
});

// ---------------------------------------------------------------- a round with the stand-in: read only

test('the first round lists the calendars, all switched off, and reads no events', async () => {
  const google = account();
  const r = await round(google, { calendars: [], busy: [] });
  assert.deepEqual(r.calendars.map((c) => [c.name, c.busy_on]), [['Work', false], ['Personal', false], ['Family', false]]);
  assert.equal(r.busy.length, 0);
  assert.deepEqual(google.asked().map((a) => a.what), ['calendars'], 'nothing read from a calendar that is off');
});

test('Family switched on: its events become busy times; Personal, still off, is never read', async () => {
  const google = account();
  let held = await round(google, { calendars: [], busy: [] });
  held = await round(google, switchOn(held, FAMILY));
  assert.deepEqual(held.busy.map((b) => [b.title, b.starts_at]), [['School play', iso('2026-11-24', '10:30')]]);
  assert.deepEqual(google.asked().filter((a) => a.what === 'busy').map((a) => a.calendarId), [FAMILY]);
  // An event moved, one deleted and one added in Google: the next round follows.
  const [play] = await google.listBusy({ calendarId: FAMILY, timeMin: iso('2026-11-23', '00:00'), timeMax: iso('2026-12-31', '00:00') });
  google.inGoogle.editIn(FAMILY, play.id, null);
  google.inGoogle.addTo(FAMILY, { summary: 'Parents’ evening', start: { dateTime: iso('2026-11-25', '16:00') }, end: { dateTime: iso('2026-11-25', '17:00') } });
  held = await round(google, held);
  assert.deepEqual(held.busy.map((b) => b.title), ['Parents’ evening']);
  // Switched off again: its busy times go.
  held = await round(google, switchOn(held, FAMILY, false));
  assert.equal(held.busy.length, 0);
});

test('a calendar taken off the account takes its busy times with it', async () => {
  const google = account();
  let held = await round(google, { calendars: [], busy: [] });
  held = await round(google, switchOn(switchOn(held, FAMILY), PERSONAL));
  assert.equal(held.busy.length, 2);
  google.inGoogle.removeCalendar(PERSONAL);
  held = await round(google, held);
  assert.deepEqual(held.busy.map((b) => b.title), ['School play']);
  assert.equal(held.calendars.some((c) => c.google_id === PERSONAL), false);
  assert.ok(held.res.remove.findIndex(([t]) => t === TG.busy) < held.res.remove.findIndex(([t]) => t === TG.calendars), 'busy times go before their calendar');
});

test('read only: a round never asks Google to write, and nothing is ever written to any calendar but the main one', async () => {
  const google = account();
  let held = await round(google, { calendars: [], busy: [] });
  held = await round(google, switchOn(switchOn(held, FAMILY), PERSONAL));
  await round(google, held);
  const asked = google.asked();
  assert.ok(asked.length > 0);
  assert.deepEqual([...new Set(asked.map((a) => a.what))].sort(), ['busy', 'calendars']);
  // The portal's own writes (run 3's sync) still go to the main calendar only.
  await google.createEvent({ summary: 'A call', start: { dateTime: iso('2026-11-26', '10:00') }, end: { dateTime: iso('2026-11-26', '11:00') } });
  assert.deepEqual(google.asked().filter((a) => ['create', 'update', 'delete'].includes(a.what)).map((a) => a.calendarId), ['primary']);
  // And the stand-in's other calendars are exactly as Google had them.
  const after = await google.listBusy({ calendarId: FAMILY, timeMin: iso('2026-11-01', '00:00'), timeMax: iso('2027-01-01', '00:00') });
  assert.deepEqual(after.map((e) => e.summary), ['School play']);
});

test('the real adapter only ever asks the server to read the other calendars', async () => {
  const sent = [];
  const google = googleCalendarAdapter(async (body) => { sent.push(body); return body.kind === 'calendars' ? { ok: true, calendars: [{ id: 'primary', primary: true }] } : { ok: true, events: [] }; });
  await google.listCalendars();
  await google.listBusy({ calendarId: FAMILY, timeMin: iso('2026-11-23', '00:00'), timeMax: iso('2026-12-23', '00:00') });
  assert.deepEqual(sent.map((b) => [b.service, b.kind]), [['google_calendar', 'calendars'], ['google_calendar', 'busy']]);
});

test('Google not answering: what was there is kept and the coach is told calmly', async () => {
  const google = account();
  let held = await round(google, { calendars: [], busy: [] });
  held = await round(google, switchOn(held, FAMILY));
  google.listBusy = async () => { throw new Error('no answer'); };
  const r = await round(google, held);
  assert.equal(r.res.problem, BUSY_WORDS.problem);
  assert.equal(r.busy.length, 1, 'the busy times already kept still block');
  assert.equal(await busyOnce({ google: { real: false }, coachId: ME, now: NOW }).then((x) => x.save.length), 0, 'an adapter without the calls does nothing');
});

// ---------------------------------------------------------------- what counts, what shows, what blocks

const calRows = [
  { id: 'c-main', coach_id: ME, google_id: 'primary', name: 'Work', is_main: true, busy_on: false },
  { id: 'c-fam', coach_id: ME, google_id: FAMILY, name: 'Family', is_main: false, busy_on: true },
  { id: 'c-pers', coach_id: ME, google_id: PERSONAL, name: 'Personal', is_main: false, busy_on: false },
];
const busyRows = [
  { id: 'b-play', coach_id: ME, calendar_id: 'c-fam', event_id: 'e1', title: 'School play', starts_at: iso('2026-11-24', '10:30'), ends_at: iso('2026-11-24', '11:30'), all_day: false },
  { id: 'b-physio', coach_id: ME, calendar_id: 'c-pers', event_id: 'e2', title: 'Physio', starts_at: iso('2026-11-24', '14:00'), ends_at: iso('2026-11-24', '15:00'), all_day: false },
  { id: 'b-theirs', coach_id: OTHER, calendar_id: 'c-fam', event_id: 'e3', title: 'Not mine', starts_at: iso('2026-11-24', '09:00'), ends_at: iso('2026-11-24', '10:00'), all_day: false },
];

test('only the calendars switched on count, never the main one, never another coach’s', () => {
  assert.deepEqual(activeBusy(busyRows, calRows, ME).map((b) => [b.title, b.calendar_name]), [['School play', 'Family']]);
  assert.deepEqual(activeBusy(busyRows, calRows.map((c) => ({ ...c, busy_on: true })), ME).map((b) => b.title).sort(), ['Physio', 'School play']);
  assert.deepEqual(activeBusy([{ ...busyRows[0], calendar_id: 'c-main' }], [{ ...calRows[0], busy_on: true }], ME), []);
  assert.deepEqual(activeBusy(busyRows, [], ME), []);
});

test('on the coach’s calendar: a soft filled tile with the title and its calendar’s name, that can’t be moved', () => {
  const busy = activeBusy(busyRows, calRows, ME);
  const entries = cal.calendarEntries({ busy }, { fromDay: '2026-11-24', toDay: '2026-11-24', coachZone: LON, settings: SETTINGS });
  const tile = entries.find((e) => e.type === 'busy');
  assert.deepEqual([tile.title, tile.sub, tile.colour, tile.colourClass, tile.dashed, tile.fixed, tile.busy], ['School play', 'Family', 'busy', 'cc-cal-tile--busy', false, true, true]);
  assert.equal(entries.filter((e) => e.type === 'busy').length, 1, 'Physio (Personal, off) isn’t drawn');
  assert.deepEqual(cal.entryLines(tile, { coachZone: LON }), { title: 'School play', line: 'Family', time: '10:30', oneLine: false });
  assert.deepEqual(cal.busyLines(tile, LON), ['Tue 24 Nov, 10:30 to 11:30', 'From your Family calendar in Google', cal.BUSY_READ_ONLY]);
  const day = cal.busyEntries([{ ...busyRows[0], id: 'all', all_day: true, starts_at: iso('2026-11-25', '00:00'), ends_at: iso('2026-11-27', '00:00'), calendar_name: 'Family' }], { fromDay: '2026-11-23', toDay: '2026-11-29', coachZone: LON });
  assert.deepEqual([day[0].allDay, day[0].fromDay, day[0].toDay], [true, '2026-11-25', '2026-11-26']);
  assert.deepEqual(cal.busyEntries(busyRows, { fromDay: '2026-11-30', toDay: '2026-11-30', coachZone: LON }), [], 'another week shows none');
});

test('booking: a calendar switched on blocks the free times; one switched off doesn’t', () => {
  const hm = (d) => new Intl.DateTimeFormat('en-GB', { timeZone: LON, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
  const free = (busy) => cal.freeTimes({ source: 'hours', minutes: 60, from: at('2026-11-24', '00:00'), to: at('2026-11-25', '00:00'), now: NOW, coachZone: LON, settings: SETTINGS, busy, earlyAndLate: true }).map(hm);
  const none = free([]);
  const withFamily = free(activeBusy(busyRows, calRows, ME));
  assert.deepEqual(none.filter((s) => !withFamily.includes(s)), ['09:45', '10:00', '10:15', '10:30', '10:45', '11:00', '11:15']);
  assert.ok(withFamily.includes('14:00'), 'Physio (off) doesn’t block');
  const both = free(activeBusy(busyRows, calRows.map((c) => ({ ...c, busy_on: !c.is_main })), ME));
  assert.equal(both.includes('14:00'), false, 'switched on, Physio blocks');
  assert.ok(both.includes('11:30'), 'a busy time is never a call: no gap after it');
});

test('Book a call, Offer times and polls: a busy time is refused by its own title, for the coach alone', () => {
  const busy = activeBusy(busyRows, calRows, ME);
  assert.equal(cal.callProblem({ start: at('2026-11-24', '10:45'), minutes: 30, clientZone: LON, coachZone: LON, settings: SETTINGS, busy }), 'That overlaps School play. Choose another time.');
  assert.equal(cal.callProblem({ start: at('2026-11-24', '11:30'), minutes: 30, clientZone: LON, coachZone: LON, settings: SETTINGS, busy }), null, 'no gap needed after a busy time');
  const pick = (busyList) => cal.pickTime([], { day: '2026-11-24', startMin: 10 * 60 + 30, minutes: 60, coachZone: LON, data: { busy: busyList }, now: NOW, max: cal.OFFER_MAX });
  assert.equal(pick(busy).problem, 'That overlaps School play. Pick a free time.');
  assert.equal(pick([]).problem, null);
  assert.equal(cal.seriesClashes([at('2026-11-24', '11:00')], 60, { busy, coachZone: LON })[0]?.with, 'School play');
  assert.equal(cal.bookSuggestions({ minutes: 60, zone: LON, coachZone: LON, settings: SETTINGS, data: { busy }, now: NOW, days: 2 }).some((s) => s.getTime() === at('2026-11-24', '10:30').getTime()), false);
  const open = cal.placeOpen({ starts_at: iso('2026-11-24', '10:00'), ends_at: iso('2026-11-24', '12:00') }, { data: { busy, openBlocks: [] }, coachZone: LON, coachId: ME, newId: () => 'n1', now: NOW });
  assert.equal(open.problem, 'That overlaps School play.');
});

test('who sees what: a booking page or a client gets free starts only, and the owner’s view of associates never holds a busy time', () => {
  const busy = activeBusy(busyRows, calRows, ME);
  const starts = cal.freeTimes({ source: 'hours', minutes: 30, from: at('2026-11-24', '00:00'), to: at('2026-11-25', '00:00'), now: NOW, coachZone: LON, settings: SETTINGS, busy });
  assert.ok(starts.every((s) => s instanceof Date), 'only instants: never a title or a calendar');
  // 058's rows are coaching sessions; a busy time has no place in them, whatever is passed.
  assert.deepEqual(cal.associateEntries([], { fromDay: '2026-11-24', toDay: '2026-11-24', coachZone: LON }), []);
  // The server hands the browser only what a busy time needs, for the coach's own sign-in.
  const out = busyEventOut({ id: 'e1', summary: 'School play', location: '12 Mill Lane', description: 'Esme', hangoutLink: 'https://meet.example/x', attendees: [{ email: 'gran@example.invalid' }, { self: true, email: 'me@example.invalid', responseStatus: 'accepted' }], start: { dateTime: '2026-11-24T10:30:00Z', timeZone: LON }, end: { dateTime: '2026-11-24T11:30:00Z' } });
  assert.deepEqual(out, { id: 'e1', status: 'confirmed', summary: 'School play', start: { dateTime: '2026-11-24T10:30:00Z' }, end: { dateTime: '2026-11-24T11:30:00Z' }, attendees: [{ self: true, responseStatus: 'accepted' }] });
});

test('the server: the two read kinds are shaped strictly, and only ever read', () => {
  assert.deepEqual(askedFor({ service: 'google_calendar', kind: 'calendars' }), { service: 'google_calendar', kind: 'calendars' });
  const ok = askedFor({ service: 'google_calendar', kind: 'busy', calendarId: FAMILY, timeMin: '2026-11-23T00:00:00Z', timeMax: '2027-02-22T00:00:00Z' });
  assert.deepEqual(ok, { service: 'google_calendar', kind: 'busy', calendarId: FAMILY, timeMin: '2026-11-23T00:00:00.000Z', timeMax: '2027-02-22T00:00:00.000Z' });
  for (const bad of [
    { calendarId: '', timeMin: '2026-11-23T00:00:00Z', timeMax: '2026-11-24T00:00:00Z' },
    { calendarId: 'a/b', timeMin: '2026-11-23T00:00:00Z', timeMax: '2026-11-24T00:00:00Z' },
    { calendarId: 'a b', timeMin: '2026-11-23T00:00:00Z', timeMax: '2026-11-24T00:00:00Z' },
    { calendarId: FAMILY, timeMin: 'soon', timeMax: '2026-11-24T00:00:00Z' },
    { calendarId: FAMILY, timeMin: '2026-11-24T00:00:00Z', timeMax: '2026-11-23T00:00:00Z' },
    { calendarId: FAMILY, timeMin: '2026-01-01T00:00:00Z', timeMax: '2026-12-31T00:00:00Z' },
    { calendarId: 'x'.repeat(1025), timeMin: '2026-11-23T00:00:00Z', timeMax: '2026-11-24T00:00:00Z' },
  ]) assert.equal(askedFor({ service: 'google_calendar', kind: 'busy', ...bad }), null, JSON.stringify(bad).slice(0, 80));
  // Read only, by its own code: every request for the calendar list or another calendar's events is a GET, and every
  // write goes to the main calendar ('primary') only.
  const source = readFileSync(new URL('../../api/coach-calendar.js', import.meta.url), 'utf8');
  const reads = [...source.matchAll(/fetch\(`https:\/\/www\.googleapis\.com\/calendar\/v3\/(users\/me\/calendarList|calendars\/\$\{encodeURIComponent\(asked\.calendarId\)\}\/events)[^;]*/g)].map((m) => m[0]);
  assert.equal(reads.length, 2);
  for (const r of reads) assert.match(r, /method: 'GET'/);
  assert.match(source, /const base = 'https:\/\/www\.googleapis\.com\/calendar\/v3\/calendars\/primary\/events';/);
  assert.equal([...source.matchAll(/method: '(POST|PATCH|PUT|DELETE)'[^;]*asked\.calendarId/g)].length, 0);
});
