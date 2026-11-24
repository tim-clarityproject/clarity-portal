// Booking's rules for its pages (Phase 6a run 3, step 4): the pages'
// addresses, the two starting call types, the number editors' bounds, a call
// type's questions, Book a call's suggested times (a quarter hour in the
// client's own time, sociable where they are, clear of other calls), times
// picked on the calendar, Open for calls as its page draws it, the visitor's
// zones, the .ics file, "Show my calendar", the client's own words, and the
// confirmation email with its server function's checks.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as cal from '../../src/lib/coach/calendar.js';
import { instantAt, onQuarterHour, wallClock } from '../../src/lib/time/index.js';
import { bookingConfirmedEmail } from '../../src/lib/email/emails.js';
import { renderEmail } from '../../src/lib/email/template.js';
import { claimMoment, emailFor, minutesOf, readRequest } from '../../api/_routes/booking-email.js';

const LON = 'Europe/London';
const NY = 'America/New_York';
const KOL = 'Asia/Kolkata';
const ME = 'coach-1';
const MIN = 60000;
let n = 0;
const newId = () => { n += 1; return `id-${n}`; };
const at = (day, time, zone = LON) => instantAt(day, time, zone);
const item = (id, title, day, from, to, extra = {}) => cal.newItem({ id, coachId: ME, title, starts_at: at(day, from).toISOString(), ends_at: at(day, to).toISOString(), time_zone: LON, ...extra });
const NOW = at('2026-11-17', '09:00'); // M11's Tuesday

test('each page outside the portal has its own address, built from the page’s own origin', () => {
  assert.equal(cal.BOOK_PATHS.page('k'), '/book/k');
  assert.equal(cal.BOOK_PATHS.link('k'), '/book/link/k');
  assert.equal(cal.BOOK_PATHS.mine('k'), '/book/mine/k');
  assert.equal(cal.BOOK_PATHS.poll('k'), '/poll/k');
  assert.equal(cal.publicLink('https://example.invalid/', '/book/k'), 'https://example.invalid/book/k');
});

test('a key is only ever a uuid, so the database is never asked about anything else', () => {
  assert.equal(cal.isBookingKey('3f1c0a52-7b1e-4c0a-9a57-2d0f6b1c8e11'), true);
  for (const bad of ['', 'chemistry', '../x', '3f1c0a52', null]) assert.equal(cal.isBookingKey(bad), false);
});

test('a coach starts with a Chemistry Call and a Connection Call, each with its own page, and never a second of either', () => {
  const made = cal.startingCallTypes({ coachId: ME, newId });
  assert.deepEqual(made.map((t) => [t.key, t.name, t.minutes, t.notice_hours, t.ahead_weeks]), [['chemistry', 'Chemistry Call', 30, 24, 4], ['connection', 'Connection Call', 30, 48, 2]]);
  assert.notEqual(made[0].page_key, made[1].page_key);
  assert.deepEqual(cal.startingCallTypes({ coachId: ME, newId, have: [made[0]] }).map((t) => t.key), ['connection']);
  assert.deepEqual(cal.startingCallTypes({ coachId: ME, newId, have: made }), []);
});

test('the limits are number editors: each keeps to its bounds, and what is saved is a number the rules read back', () => {
  const gap = cal.BOOKING_LIMIT_ROWS.find((r) => r.key === 'gap');
  assert.equal(cal.numberProblem(gap, '20'), null);
  assert.equal(cal.numberProblem(gap, '121'), 'Type a number from 0 to 120.');
  assert.equal(cal.numberProblem(gap, 'a few'), 'Type a number from 0 to 120.');
  const booking = cal.limitToSave({ remind_24: true, gap: '15 minutes' }, 'gap', '20');
  assert.deepEqual(booking, { remind_24: true, gap: 20 });
  assert.equal(cal.bookingLimits({ booking }).gap, 20);
  assert.equal(cal.bookingLimitWords({ booking }).gap, '20 minutes');
  // What run 2 saved as typed text still reads.
  assert.equal(cal.bookingLimits({ booking: { per_day: '4', notice: '48 hours', ahead: '2 weeks' } }).notice, 48);
});

test('a call type’s page: its length is in quarter hours, every number inside 051’s bounds, and it needs a name', () => {
  const [type] = cal.startingCallTypes({ coachId: ME, newId });
  assert.equal(cal.callTypeProblem(type), null);
  assert.equal(cal.callTypeProblem({ ...type, name: ' ' }), 'Type a name to carry on.');
  assert.match(cal.callTypeProblem({ ...type, minutes: 40 }), /quarter hours/);
  assert.match(cal.callTypeProblem({ ...type, ahead_weeks: 13 }), /from 1 to 12/);
  assert.match(cal.callTypeProblem({ ...type, day_limit: 0 }), /from 1 to 20/);
});

test('a call type’s questions: blank rows go, at most 10 are kept, an old question keeps its id', () => {
  const rows = [{ id: 'q1', label: ' What would you like from the call? ', kind: 'long', required: true }, { label: '' }, { label: 'Anything else?' }];
  const saved = cal.questionsToSave(rows, newId);
  assert.equal(saved.length, 2);
  assert.deepEqual(saved[0], { id: 'q1', label: 'What would you like from the call?', kind: 'long', required: true });
  assert.equal(saved[1].required, false);
  assert.equal(cal.questionsToSave(Array.from({ length: 14 }, (_, i) => ({ label: `Q${i}` })), newId).length, 10);
  assert.equal(cal.questionLabel({ q: 'An older shape' }), 'An older shape');
});

test('Book a call offers every client, every group, then someone else, and never a past client', () => {
  const who = cal.bookWhoChoices({ clients: [{ id: 'b', name: 'Sam Okafor', status: 'active' }, { id: 'a', name: 'Jordan Reyes', status: 'active' }, { id: 'c', name: 'Old Client', status: 'past' }], groups: [{ id: 'g', name: 'Kestrel leadership team' }] });
  assert.deepEqual(who.map((w) => w.label), ['Jordan Reyes', 'Sam Okafor', 'Kestrel leadership team', 'Someone else']);
  assert.equal(who[3].value, cal.BOOK_WITH_SOMEONE_ELSE);
});

test('Book a call’s suggestions: a quarter hour in the client’s own time (India is 5½ hours ahead), 07:00 to 20:00 there, inside the working day, clear of other calls by the gap', () => {
  const data = { items: [item('i1', 'Sam Okafor', '2026-11-18', '10:00', '11:00', { kind: 'client_call' })], sessions: [] };
  const starts = cal.bookSuggestions({ minutes: 60, zone: KOL, coachZone: LON, data, now: NOW, days: 3 });
  assert.ok(starts.length > 0);
  for (const s of starts) {
    assert.ok(onQuarterHour(s, KOL), 'on a quarter hour in Kolkata');
    const theirs = wallClock(s, KOL);
    const ends = wallClock(new Date(s.getTime() + 60 * MIN), KOL);
    assert.ok(theirs.time >= '07:00' && ends.time <= '20:00' && ends.date === theirs.date, `sociable in Kolkata: ${theirs.time}`);
    const mine = wallClock(s, LON);
    assert.ok(mine.time >= '09:00' && mine.time <= '16:00', `inside the working day: ${mine.time}`);
    assert.ok(s.getTime() + 60 * MIN + 15 * MIN <= at('2026-11-18', '10:00').getTime() || s.getTime() >= at('2026-11-18', '11:15').getTime(), 'a 15-minute gap either side of Sam’s call');
  }
  // 14:30 in Kolkata is 09:00 in London: the first time of the working day that is still sociable there.
  assert.equal(wallClock(starts[0], LON).time >= '09:00', true);
});

test('a client with no working hour in common (Sydney in a UK winter): the nearest early or late time each working day, outside your hours (tidy follow-up 3, run 6’s 22)', () => {
  const SYD = 'Australia/Sydney';
  const data = { items: [], sessions: [] };
  assert.deepEqual(cal.bookSuggestions({ minutes: 60, zone: SYD, coachZone: LON, data, now: NOW, days: 7 }), [], 'nothing inside the working day');
  const near = cal.outsideHoursSuggestions({ minutes: 60, zone: SYD, coachZone: LON, data, now: NOW, days: 7 });
  assert.ok(near.length >= 4, `one a working day: ${near.length}`);
  const days = near.map((s) => wallClock(s, LON).date);
  assert.equal(new Set(days).size, days.length, 'at most one a day');
  for (const s of near) {
    const mine = wallClock(s, LON);
    assert.ok(mine.weekday <= 5, 'only on working days');
    // 08:00 to 09:00 UK is 19:00 to 20:00 in Sydney: the hour just before the working day starts. Today's 08:00 has
    // passed, so today's nearest is the late one: 20:00 UK, 07:00 the next morning in Sydney.
    assert.equal(mine.time, mine.date === '2026-11-17' ? '20:00' : '08:00', `the nearest early or late time: ${mine.date} ${mine.time}`);
    const theirs = wallClock(s, SYD);
    assert.ok(theirs.time >= '07:00' && wallClock(new Date(s.getTime() + 60 * MIN), SYD).time <= '20:00', `sociable in Sydney: ${theirs.time}`);
  }
  // A call at 08:00 on Wednesday moves that day's suggestion off it (the gap kept): the next nearest is earlier still.
  const busy = { items: [item('i9', 'Sam Okafor', '2026-11-18', '08:00', '09:00', { kind: 'client_call' })], sessions: [] };
  const wed = cal.outsideHoursSuggestions({ minutes: 60, zone: SYD, coachZone: LON, data: busy, now: NOW, days: 7 }).find((s) => wallClock(s, LON).date === '2026-11-18');
  assert.ok(!wed || wallClock(new Date(wed.getTime() + 75 * MIN), LON).time <= '08:00', `clear of Sam's call by the gap: ${wed && wallClock(wed, LON).time}`);
  assert.ok(!wed || wallClock(wed, LON).time >= '06:00', 'never before 06:00 on your own clock');
  assert.equal(cal.OUTSIDE_HOURS, 'Outside your hours');
  assert.equal(cal.noSharedHours({ minutes: 60, zone: SYD, coachZone: LON, now: NOW, days: 7 }), true, 'Sydney shares no hour');
});

test('a client who shares working hours is never offered times outside them, even when the coach is booked solid (tidy follow-up 3, run 6’s 22)', () => {
  const solid = [];
  for (let i = 0; i < 16; i += 1) {
    const day = new Date(Date.UTC(2026, 10, 17 + i)).toISOString().slice(0, 10);
    solid.push(item(`s${i}`, 'Busy', day, '07:00', '21:00'));
  }
  assert.deepEqual(cal.bookSuggestions({ minutes: 60, zone: NY, coachZone: LON, data: { items: solid, sessions: [] }, now: NOW }), [], 'nothing free this fortnight');
  assert.equal(cal.noSharedHours({ minutes: 60, zone: NY, coachZone: LON, now: NOW }), false, 'New York still shares the working afternoon');
});

test('a typed day and time is on the coach’s own clock, and both clocks are said with both days when they differ', () => {
  assert.equal(cal.typedStart({ day: '2026-11-19', time: '15:30', coachZone: LON }).start.toISOString(), '2026-11-19T15:30:00.000Z');
  assert.equal(cal.typedStart({ day: '', time: '15:30', coachZone: LON }).problem, 'Choose a day and a time to carry on.');
  assert.equal(cal.bookWhenWords(at('2026-11-19', '15:30'), LON, 'America/Chicago'), 'Thu 19 Nov, 15:30 UK time · 9:30 am Chicago time');
  assert.equal(cal.bookWhenWords(at('2026-11-15', '21:00'), LON, 'Australia/Sydney'), 'Sun 15 Nov, 21:00 UK time (Mon 16 Nov, 8:00 Sydney time)'.replace('8:00', '08:00'));
});

test('picking times on the calendar: a press picks a free time, a press on it takes it off, never over something busy, in the past, or past the most', () => {
  const data = { items: [item('i1', 'Training', '2026-11-18', '09:45', '12:00')], sessions: [] };
  const ctx = { minutes: 60, coachZone: LON, data, now: NOW };
  let r = cal.pickTime([], { day: '2026-11-18', startMin: 13 * 60, ...ctx });
  assert.equal(r.problem, null);
  assert.equal(r.starts.length, 1);
  r = cal.pickTime(r.starts, { day: '2026-11-18', startMin: 13 * 60 + 30, ...ctx }); // inside the picked hour: it comes off
  assert.deepEqual(r.starts, []);
  assert.equal(cal.pickTime([], { day: '2026-11-18', startMin: 11 * 60, ...ctx }).problem, 'That overlaps Training. Pick a free time.');
  assert.equal(cal.pickTime([], { day: '2026-11-16', startMin: 11 * 60, ...ctx }).problem, 'That time has passed. Pick a later one.');
  const five = [13, 14, 15, 16, 17].map((h) => at('2026-11-19', `${h}:00`));
  assert.equal(cal.pickTime(five, { day: '2026-11-20', startMin: 13 * 60, ...ctx }).problem, 'Up to 5 times in one poll.');
  assert.equal(cal.pickTime(five, { day: '2026-11-20', startMin: 13 * 60, ...ctx, max: cal.OFFER_MAX }).problem, null);
});

test('picked times are dashed tiles that can’t be dragged, and say the READER’s time when one is chosen', () => {
  const [mine] = cal.pickedEntries([at('2026-11-18', '16:00')], 60, { coachZone: LON });
  assert.equal(mine.title, '16:00');
  assert.equal(mine.fixed, true);
  assert.equal(mine.dashed, true);
  const [theirs] = cal.pickedEntries([at('2026-11-18', '16:00')], 60, { coachZone: LON, zone: NY });
  assert.equal(theirs.title, '11:00 am New York');
  assert.equal(cal.offerPickWords(0), 'Pick free times');
  assert.equal(cal.offerPickWords(2), '2 picked');
  const note = cal.offerNote({ starts: [at('2026-11-18', '16:00')], minutes: 60, zone: NY, coachFirstName: 'Tim' });
  assert.match(note.body, /Wed 18 Nov, 11:00 am/);
  assert.match(note.body, /New York time/);
});

test('Open for calls draws everything busy as a fixed dashed outline (a switched-off calendar too) and the open blocks as tiles that move', () => {
  const data = {
    items: [item('i1', 'Training', '2026-11-23', '09:45', '12:00'), item('i2', 'Dentist', '2026-11-24', '08:00', '09:00', { calendar: 'personal', private: true }), item('i3', 'Lunch', '2026-11-24', '12:00', '13:00', { busy: false })],
    openBlocks: [{ id: 'o1', coach_id: ME, starts_at: at('2026-11-23', '14:00').toISOString(), ends_at: at('2026-11-23', '16:00').toISOString(), time_zone: LON, call_type_id: null }],
    todos: [{ id: 't1', title: 'A to-do', planned_on: '2026-11-23', planned_time: '13:00', minutes: 30 }],
  };
  const entries = cal.openPageEntries(data, { fromDay: '2026-11-23', toDay: '2026-11-27', coachZone: LON });
  assert.deepEqual(entries.map((e) => e.title).sort(), ['Dentist', 'Open', 'Training']);
  const open = entries.find((e) => e.isOpen);
  assert.equal(open.type, 'item');
  assert.equal(open.fixed, undefined);
  assert.equal(open.colourClass, 'cc-cal-tile--open');
  for (const e of entries.filter((x) => !x.isOpen)) { assert.equal(e.fixed, true); assert.equal(e.dashed, true); }
  assert.deepEqual(cal.openWeeks('2026-11-17'), ['2026-11-16', '2026-11-23', '2026-11-30', '2026-12-07', '2026-12-14']);
  assert.equal(cal.removeOpenPlan(data.openBlocks[0], { data }).remove[0][1], 'o1');
});

test('an open time can be typed: quarter hours, the end after the start', () => {
  assert.deepEqual(cal.openTyped({ day: '2026-11-23', from: '14:00', to: '16:00', coachZone: LON }), { starts_at: '2026-11-23T14:00:00.000Z', ends_at: '2026-11-23T16:00:00.000Z', problem: null });
  assert.equal(cal.openTyped({ day: '2026-11-23', from: '14:10', to: '16:00', coachZone: LON }).problem, 'Open times start and end on a quarter hour.');
  assert.equal(cal.openTyped({ day: '2026-11-23', from: '16:00', to: '14:00', coachZone: LON }).problem, 'Choose an end after the start.');
});

test('a visitor’s zones are place names, their own device’s among them, each once, A to Z', () => {
  const zones = cal.visitorZones('America/Phoenix');
  assert.ok(zones.some((z) => z.value === 'America/Phoenix' && z.label === 'Phoenix'));
  assert.ok(zones.some((z) => z.label === 'New York'));
  assert.deepEqual(zones.map((z) => z.label), [...zones.map((z) => z.label)].sort((a, b) => a.localeCompare(b)));
  assert.equal(new Set(zones.map((z) => z.label)).size, zones.length);
  assert.ok(cal.visitorZones('EST').every((z) => z.value.includes('/')), 'letters are never a zone');
});

test('a booked call’s words, and the taken line, are the brief’s', () => {
  assert.equal(cal.bookedWhenWords(at('2026-11-18', '11:30', NY), NY), 'Wed 18 Nov, 11:30 am New York time');
  assert.equal(cal.bookButtonWords(at('2026-11-18', '11:30', NY), NY), 'Book Wed 18 Nov, 11:30 am');
  assert.equal(cal.bookingWords('taken'), 'That time has just been taken. Choose another.');
  assert.equal(cal.guestLateLine(at('2026-11-17', '15:00'), NOW), 'This call is in under 24 hours.');
  assert.equal(cal.guestLateLine(at('2026-11-19', '15:00'), NOW), null);
});

test('Add to calendar is an .ics file with UTC instants, escaped words and lines folded at 75', () => {
  const ics = cal.icsFile({ uid: '3f1c0a52-7b1e', title: 'Chemistry Call, with Tim; and a very long title that goes on past the seventy-five characters a line may hold', startsAt: '2026-11-18T16:30:00Z', endsAt: '2026-11-18T17:00:00Z', location: 'Zoom', now: NOW });
  const lines = ics.split('\r\n');
  assert.equal(lines[0], 'BEGIN:VCALENDAR');
  assert.ok(lines.includes('DTSTART:20261118T163000Z'));
  assert.ok(lines.includes('DTEND:20261118T170000Z'));
  assert.ok(lines.includes('UID:3f1c0a52-7b1e@theclarityportal'));
  assert.ok(ics.includes('SUMMARY:Chemistry Call\\, with Tim\\; and'));
  assert.ok(lines.every((l) => l.length <= 75));
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  assert.equal(cal.icsName('Chemistry Call with Tim'), 'Chemistry Call with Tim.ics');
  assert.equal(cal.icsName('A/B: call?'), 'A B call.ics');
});

test('“Show my calendar” lays the free times beside the visitor’s own day on their clock, a quarter hour each', () => {
  const day = cal.visitorDay({
    starts: [at('2026-11-23', '09:00', NY), at('2026-11-23', '09:15', NY)], minutes: 30, zone: NY,
    events: [{ title: 'Team standup', startsAt: at('2026-11-23', '09:00', NY), endsAt: at('2026-11-23', '09:30', NY) }, { title: 'Budget review', startsAt: at('2026-11-23', '11:00', NY), endsAt: at('2026-11-23', '12:00', NY) }],
  });
  assert.deepEqual([day.fromMin, day.toMin], [540, 720]);
  assert.deepEqual(day.hours, ['09:00', '10:00', '11:00']);
  assert.deepEqual(day.free.map((f) => [f.fromMin, f.toMin]), [[540, 555], [555, 570]]);
  assert.deepEqual(day.busy.map((b) => [b.title, b.fromMin, b.toMin]), [['Team standup', 540, 570], ['Budget review', 660, 720]]);
});

test('a client’s own session is said in their own time, and moving one inside 24 hours says it uses a session first', () => {
  assert.equal(cal.mySessionWords({ starts_at: at('2026-11-24', '10:00', 'America/Chicago').toISOString(), minutes: 60 }, 'America/Chicago'), 'Tue 24 Nov, 10:00 am Chicago time, 1 hour');
  const late = cal.lateLine(at('2026-11-17', '15:00'), NOW, 'move');
  assert.equal(late.line, 'This session is in under 24 hours, so moving it uses one of your sessions.');
  assert.equal(late.go, 'Move it anyway');
  assert.equal(cal.lateLine(at('2026-11-19', '15:00'), NOW, 'move'), null);
});

test('the confirmation email gives the time in the reader’s own zone (12-hour for the US, 24-hour elsewhere), in draft-2’s words, with their own link to rearrange or cancel', () => {
  const us = renderEmail(bookingConfirmedEmail({ name: 'Grace Liu', callName: 'Chemistry Call', coach: 'Tim', at: at('2026-11-18', '11:30', NY), zone: NY, minutes: 30, mineLink: 'https://portal.theclarityproject.co.uk/book/mine/k', now: NOW }));
  assert.equal(us.subject, 'Your Chemistry Call with Tim is booked for Wed 18 Nov');
  assert.ok(us.text.includes('Your Chemistry Call with Tim is booked for Wed 18 Nov at 11:30 am New York time, for 30 minutes on Zoom.'));
  assert.ok(us.text.includes('Rearrange:') && us.text.includes('Cancel:'));
  assert.doesNotMatch(us.text, /prep/, 'no prep is offered to someone who booked on a booking page');
  const coaching = renderEmail(bookingConfirmedEmail({ callName: 'Coaching session', coach: 'Tim', at: at('2026-11-26', '15:00'), zone: LON, minutes: 60, zoomLink: 'https://zoom.us/j/1', mineLink: 'https://portal.theclarityproject.co.uk/book/mine/k' }));
  assert.equal(coaching.subject, 'Your coaching session with Tim is booked for Thu 26 Nov');
  assert.ok(coaching.text.includes('Your coaching session with Tim is booked for Thu 26 Nov at 15:00 UK time, for 60 minutes on Zoom.'));
  assert.match(us.text, /https:\/\/portal\.theclarityproject\.co\.uk\/book\/mine\/k/);
  const uk = renderEmail(bookingConfirmedEmail({ name: 'Nadia Osei', callName: 'Connection Call', coach: 'Tim', at: at('2026-11-24', '14:15'), zone: LON, mineLink: 'https://portal.theclarityproject.co.uk/book/mine/k', moved: true, now: NOW }));
  assert.equal(uk.subject, 'Your Connection Call has moved to Tue 24 Nov at 14:15 UK time');
  assert.ok(uk.text.includes('Your Connection Call with Tim is now on Tue 24 Nov at 14:15 UK time.'));
  assert.doesNotMatch(uk.text, /\bEST\b|\bGMT\b|\bBST\b/);
});

test('the email server takes only a guest’s own key, claims one send for each time booked, and sends nothing for a cancelled call', () => {
  assert.equal(readRequest({ guestKey: 'not-a-key', kind: 'booked' }), null);
  assert.equal(readRequest({ guestKey: '3f1c0a52-7b1e-4c0a-9a57-2d0f6b1c8e11', kind: 'reminder' }), null);
  assert.deepEqual(readRequest({ guestKey: '3F1C0A52-7b1e-4c0a-9a57-2d0f6b1c8e11', kind: 'moved', email: 'someone@else.invalid' }), { guestKey: '3f1c0a52-7b1e-4c0a-9a57-2d0f6b1c8e11', kind: 'moved' });
  const booking = { status: 'booked', created_at: '2026-11-17T09:00:00Z', moved_at: '2026-11-17T10:00:00Z', name: 'Grace Liu', starts_at: '2026-11-23T14:15:00Z', time_zone: NY, guest_key: 'k' };
  assert.equal(claimMoment(booking, 'booked'), '2026-11-17T09:00:00.000Z');
  assert.equal(claimMoment(booking, 'moved'), '2026-11-17T10:00:00.000Z');
  assert.equal(claimMoment({ ...booking, moved_at: null }, 'moved'), null);
  assert.equal(claimMoment({ ...booking, status: 'cancelled' }, 'booked'), null);
  const email = emailFor({ booking, callName: 'Chemistry Call', coach: 'Tim', zoomLink: 'javascript:alert(1)', origin: 'https://portal.theclarityproject.co.uk', kind: 'booked', now: NOW });
  assert.match(email.text, /9:15 am New York time/);
  assert.equal(minutesOf('2026-11-23T14:15:00Z', '2026-11-23T15:15:00Z'), 60);
  assert.equal(minutesOf('2026-11-23T14:15:00Z', null), null);
  assert.match(emailFor({ booking: { ...booking, ends_at: '2026-11-23T14:45:00Z' }, callName: 'Chemistry Call', coach: 'Tim', origin: 'https://portal.theclarityproject.co.uk', kind: 'booked', now: NOW }).text, /for 30 minutes on Zoom\./);
  assert.doesNotMatch(email.html, /javascript:/);
});
