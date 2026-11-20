// The calendar's and booking's rules (Phase 6a run 3, step 7): every time
// zone test in time-zone-safeguards.md, repeats across clock changes, the
// 5-a-day limit and 15-minute gaps, quarter-hour starts in the client's own
// time, Open for calls blocks joining and never overlapping busy times, the
// pasted guest parser, the natural-language quick add, sync conflicts, a
// drag across midnight and "this and following".
import test from 'node:test';
import assert from 'node:assert/strict';
import * as cal from '../../src/lib/coach/calendar.js';
import { callForBar, nextCallBar } from '../../src/lib/coach/model.js';
import { dayLoad, workingDay } from '../../src/lib/coach/day.js';
import { addDays, clockChanges, inTheMorning, instantAt, onQuarterHour, wallClock, weekdayOf } from '../../src/lib/time/index.js';
import { occurrences as sqlOccurrences, ruleDays as sqlRuleDays, repeatOk as sqlRepeatOk } from '../coach/cal-standin.mjs';

const LON = 'Europe/London';
const NY = 'America/New_York';
const ME = 'coach-1';
const MIN = 60000;
let n = 0;
const newId = () => { n += 1; return `id-${n}`; };
const at = (day, time, zone = LON) => instantAt(day, time, zone).toISOString();
const uk = (t) => wallClock(t, LON).time;
const item = (id, title, day, from, to, extra = {}) => cal.newItem({ id, coachId: ME, title, starts_at: at(day, from, extra.time_zone || LON), ends_at: at(day, to, extra.time_zone || LON), time_zone: LON, kind: 'other', ...extra });
const call = (id, title, day, from, to, extra = {}) => item(id, title, day, from, to, { kind: 'client_call', place_kind: 'zoom', ...extra });
const view = (data, fromDay, toDay, extra = {}) => cal.calendarEntries(data, { fromDay, toDay, coachZone: LON, ...extra });
const ctx = (data, extra = {}) => ({ coachZone: LON, data, newId, ...extra });

// ---------------------------------------------------------------- time-zone-safeguards.md: the tests it asks for

test('a call’s row gives a US client’s own time 12-hour with the city, the day too when it differs, and the place for a client at home', () => {
  const session = (day, time, zone, place = null) => ({ starts_at: at(day, time, zone), place });
  assert.equal(cal.callPlaceWords(session('2026-11-17', '09:45', 'America/Chicago'), 'America/Chicago', LON), '9:45 am Chicago');
  assert.equal(cal.callPlaceWords(session('2026-11-17', '13:00', 'America/Toronto'), 'America/Toronto', LON), '1:00 pm Toronto');
  assert.equal(cal.callPlaceWords(session('2026-11-17', '18:15', 'Asia/Kolkata'), 'Asia/Kolkata', LON), '18:15 India');
  assert.equal(cal.callPlaceWords(session('2026-11-16', '08:00', 'Australia/Sydney'), 'Australia/Sydney', LON), 'Mon 16 Nov, 08:00 Sydney');
  assert.equal(cal.callPlaceWords(session('2026-11-17', '12:30', LON), LON, LON), 'Zoom');
  assert.equal(cal.callPlaceWords(session('2026-11-17', '12:30', LON, 'Northfield Logistics, Leeds'), null, LON), 'Northfield Logistics, Leeds');
  assert.equal(cal.callPlaceWords(session('2026-11-17', '12:30', LON), 'EST', LON), 'Zoom');
});

test('a New York client’s Monday 07:30 series keeps 07:30 there through 25 Oct and 1 Nov 2026, while Tim’s time moves 12:30, 11:30, 12:30', () => {
  const series = call('tyson', 'Tyson Reed', '2026-10-19', '07:30', '08:30', { time_zone: NY, repeat_rule: { every: 'week' } });
  const calls = cal.occurrences([series], at('2026-10-19', '00:00'), at('2026-11-03', '00:00'));
  assert.deepEqual(calls.map((c) => wallClock(c.startsAt, NY).time), ['07:30', '07:30', '07:30']);
  assert.deepEqual(calls.map((c) => wallClock(c.startsAt, NY).date), ['2026-10-19', '2026-10-26', '2026-11-02']);
  assert.deepEqual(calls.map((c) => uk(c.startsAt)), ['12:30', '11:30', '12:30']);
  // Booked as a series, each call's instant comes from the same rule in the client's zone.
  const booked = cal.seriesStarts({ first: at('2026-10-19', '07:30', NY), clientZone: NY, every: 1, count: 3 });
  assert.deepEqual(booked.starts.map(uk), ['12:30', '11:30', '12:30']);
  assert.equal(booked.rule.zone, NY);
  assert.equal(booked.rule.time, '07:30');
  // And inside its block the client's own time is shown, 12-hour for the US.
  const [first] = view({ items: [series] }, '2026-10-26', '2026-10-26');
  assert.equal(first.clientWords, '7:30 am New York');
  assert.deepEqual(cal.entryLines(first, { coachZone: LON }), { title: 'Tyson Reed', line: '11:30, 7:30 am New York', time: '11:30', oneLine: false });
});

test('Phoenix, Sydney, Kolkata and St John’s clients show the right UK time on both sides of every clock change in a year', () => {
  // Worked out here from the offsets themselves, never from the library: minutes ahead of UTC in 2026.
  const offsets = {
    [LON]: (d) => (d >= '2026-03-29' && d < '2026-10-25' ? 60 : 0),
    'America/Phoenix': () => -420, // never changes
    'Asia/Kolkata': () => 330, // never changes, a half-hour zone
    'Australia/Sydney': (d) => (d < '2026-04-05' || d >= '2026-10-04' ? 660 : 600), // the other way round
    'America/St_Johns': (d) => (d >= '2026-03-08' && d < '2026-11-01' ? -150 : -210), // a half-hour zone that changes
  };
  const hhmm = (m) => `${String(Math.floor(((m % 1440) + 1440) % 1440 / 60)).padStart(2, '0')}:${String(((m % 60) + 60) % 60).padStart(2, '0')}`;
  for (const [zone, time] of [['America/Phoenix', '08:15'], ['Australia/Sydney', '08:00'], ['Asia/Kolkata', '16:45'], ['America/St_Johns', '10:30']]) {
    const series = call(zone, 'A client', '2026-01-05', time, hhmm(Number(time.slice(0, 2)) * 60 + Number(time.slice(3)) + 60), { time_zone: zone, repeat_rule: { every: 'week' } });
    // Every clock change in the year, in the client's zone or the UK.
    const changes = [...clockChanges(zone, at('2026-01-01', '00:00'), 365), ...clockChanges(LON, at('2026-01-01', '00:00'), 365)];
    assert.ok(changes.length >= 2, `${zone}: the UK's own two changes are there`);
    for (const change of changes) {
      const around = cal.occurrences([series], new Date(change.at.getTime() - 8 * 86400000), new Date(change.at.getTime() + 8 * 86400000));
      assert.ok(around.some((o) => o.startsAt < change.at) && around.some((o) => o.startsAt > change.at), `${zone}: a call either side of ${change.date}`);
      for (const o of around) {
        const there = wallClock(o.startsAt, zone);
        assert.equal(there.time, time, `${zone}: still ${time} for the client on ${there.date}`);
        const [h, m] = time.split(':').map(Number);
        const expected = hhmm(h * 60 + m - offsets[zone](there.date) + offsets[LON](wallClock(o.startsAt, LON).date));
        assert.equal(uk(o.startsAt), expected, `${zone} on ${there.date}: UK time`);
      }
    }
  }
});

test('no two bookings sit within 15 minutes of each other, and every start falls on a quarter hour in the client’s time', () => {
  const settings = { working_hours: { mon: { from: '09:00', to: '17:00' } } };
  const now = at('2026-11-12', '09:00');
  for (const clientZone of ['Asia/Kolkata', 'America/St_Johns', 'Asia/Kathmandu', NY, LON]) {
    const items = [];
    // Book the first free time again and again until the day is full or the limit is reached.
    for (let i = 0; i < 12; i += 1) {
      const free = cal.freeTimes({ source: 'hours', minutes: 60, from: at('2026-11-16', '00:00'), to: at('2026-11-17', '00:00'), now, coachZone: LON, clientZone, settings, items, earlyAndLate: true });
      for (const s of free) assert.ok(onQuarterHour(s, clientZone), `${clientZone}: ${s.toISOString()} is on a quarter hour there`);
      if (!free.length) break;
      items.push({ ...call(`b${clientZone}${i}`, `Call ${i}`, '2026-11-16', uk(free[0]), uk(new Date(free[0].getTime() + 60 * MIN))), time_zone: clientZone });
    }
    assert.equal(items.length, 5, `${clientZone}: at most 5 calls a day`);
    const sorted = items.map((i) => [new Date(i.starts_at).getTime(), new Date(i.ends_at).getTime()]).sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < sorted.length; i += 1) assert.ok(sorted[i][0] - sorted[i - 1][1] >= 15 * MIN, `${clientZone}: 15 clear minutes between calls`);
  }
  // Nepal is 5 hours 45 minutes ahead: a quarter hour there is a quarter hour here, never rounded to the hour.
  const nepal = cal.freeTimes({ source: 'hours', minutes: 30, from: at('2026-11-16', '00:00'), to: at('2026-11-17', '00:00'), now, coachZone: LON, clientZone: 'Asia/Kathmandu', settings, earlyAndLate: true });
  assert.equal(wallClock(nepal[0], 'Asia/Kathmandu').time, '14:45');
  assert.equal(cal.callProblem({ start: at('2026-11-16', '10:05'), minutes: 60, clientZone: 'Asia/Kolkata', coachZone: LON }), 'Calls start on a quarter hour in India time. Choose the nearest one.');
});

test('a Sydney Monday-morning call shows both days', () => {
  const sydney = 'Australia/Sydney';
  const mia = call('s1', 'Mia Chen', '2026-11-16', '08:00', '09:00', { time_zone: sydney });
  const [e] = view({ items: [mia] }, '2026-11-15', '2026-11-15');
  assert.equal(uk(e.startsAt), '21:00');
  assert.equal(e.fromDay, '2026-11-15');
  assert.equal(e.clientWords, 'Mon 16 Nov, 08:00 Sydney');
  assert.equal(cal.entryLines(e, { coachZone: LON }).line, '21:00, Mon 16 Nov, 08:00 Sydney');
  assert.equal(cal.bothTimes(e.startsAt, sydney, LON), 'Mon 16 Nov, 08:00 Sydney time (Sun 15 Nov, 21:00 UK time)');
  assert.deepEqual(cal.suggestionWords(e.startsAt, { coachZone: LON, clientZone: sydney, name: 'Mia Chen' }), { when: 'Sun 15 Nov, 21:00', theirs: 'Mon 16 Nov, 08:00 for Mia in Sydney' });
  assert.equal(cal.movedNote({ e, starts_at: at('2026-11-17', '08:00', sydney), coachFirstName: 'Tim', coachZone: LON }).body,
    'Hi Mia,\n\nI’ve moved our call to Tue 17 Nov at 08:00 Sydney time. It was Mon 16 Nov at 08:00 Sydney time.\n\nTim');
});

test('reminders for a client in Los Angeles: the day before at 18:00 their time, 1 hour before with no clock time, and morning sends between 07:00 and 09:00 their time', () => {
  const la = 'America/Los_Angeles';
  // Both sides of the US clock changes (8 Mar and 1 Nov 2026) and of the UK's.
  for (const day of ['2026-01-14', '2026-03-09', '2026-03-30', '2026-07-01', '2026-10-26', '2026-11-02']) {
    const start = at(day, '09:00', la);
    const [dayBefore, hourBefore] = cal.reminderTimes(start, la);
    assert.equal(wallClock(dayBefore.at, la).time, '18:00');
    assert.equal(wallClock(dayBefore.at, la).date, addDays(day, -1));
    assert.equal(hourBefore.at.getTime(), new Date(start).getTime() - 3600000);
    assert.equal(hourBefore.givesClockTime, false);
    // An automatic email decided at any hour of the UK day lands in the reader's own morning.
    for (let h = 0; h < 24; h += 1) {
      const goes = cal.morningSendAt(at(day, `${String(h).padStart(2, '0')}:20`), la);
      assert.ok(inTheMorning(goes, la), `${day} ${h}:20 UK goes at ${wallClock(goes, la).time} Los Angeles time`);
      const w = wallClock(goes, la);
      assert.ok(w.hour >= 7 && w.hour * 60 + w.minute <= 9 * 60);
    }
  }
  assert.equal(cal.reminderDue('day_before', at('2026-11-17', '09:00', la), la, at('2026-11-16', '17:59', la)), false);
  assert.equal(cal.reminderDue('day_before', at('2026-11-17', '09:00', la), la, at('2026-11-16', '18:00', la)), true);
  assert.equal(cal.reminderDue('hour_before', at('2026-11-17', '09:00', la), la, at('2026-11-17', '09:00', la)), false);
  assert.equal(cal.dayBeforeWords(at('2026-11-17', '09:00', la), la, 'Tim'), 'Your call with Tim is tomorrow at 9:00 am Los Angeles time.');
  assert.ok(!/\d/.test(cal.hourBeforeWords('Tim').replace('1 hour', '')), 'the 1-hour reminder never gives a clock time');
});

// ---------------------------------------------------------------- repeats

test('a repeat’s days are the same as migration 051 works them out (the stand-in’s twin of the SQL)', () => {
  const rules = [
    [{ every: 'day' }, '2026-10-20'], [{ every: 'day', interval: 3 }, '2026-10-20'], [{ every: 'weekday' }, '2026-10-24'], [{ every: 'week' }, '2026-10-19'],
    [{ every: 'week', interval: 2, weekdays: [1, 2] }, '2026-10-19'], [{ every: 'week', weekdays: [0, 6] }, '2026-10-21'], [{ every: 'month' }, '2026-01-31'],
    [{ every: 'month', by: 'date', interval: 2 }, '2026-08-30'], [{ every: 'month', by: 'weekday' }, '2026-09-15'], [{ every: 'month', by: 'weekday' }, '2026-09-29'],
    [{ every: 'year' }, '2024-02-29'], [{ every: 'week', until: '2026-11-30' }, '2026-10-19'], [{ every: 'week', count: 6 }, '2026-10-19'], [{ every: 'day', count: 4 }, '2026-12-30'],
  ];
  for (const [rule, d0] of rules) {
    assert.ok(cal.repeatOk(rule) && sqlRepeatOk(rule));
    assert.deepEqual(cal.ruleDays(rule, d0, '2026-10-01', '2027-03-31'), sqlRuleDays(rule, d0, '2026-10-01', '2027-03-31'), JSON.stringify(rule));
  }
  // A monthly repeat on the 31st falls on a shorter month's last day; a fifth weekday means the last one.
  assert.deepEqual(cal.ruleDays({ every: 'month' }, '2026-01-31', '2026-01-01', '2026-05-31'), ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31']);
  assert.deepEqual(cal.ruleDays({ every: 'month', by: 'weekday' }, '2026-09-29', '2026-09-01', '2026-12-31'), ['2026-09-29', '2026-10-27', '2026-11-24', '2026-12-29']);
  assert.equal(cal.repeatOk({ every: 'fortnight' }), false);
  assert.equal(cal.repeatOk({ every: 'week', by: 'date' }), false);
  // And every time items fall, across both clock changes, with one time edited and one deleted.
  const items = [
    { ...call('a', 'Training', '2026-10-05', '09:45', '12:00', { repeat_rule: { every: 'week', weekdays: [1, 2] } }), coach_id: ME },
    { ...call('b', 'Tyson', '2026-10-05', '07:30', '08:30', { time_zone: NY, repeat_rule: { every: 'week', interval: 2 } }), coach_id: ME },
    { ...item('c', 'Writing', '2026-10-31', '09:00', '12:00', { repeat_rule: { every: 'month' } }), coach_id: ME },
    { ...item('a1', 'Training', '2026-10-27', '13:00', '14:00', { series_id: 'a', occurrence_on: '2026-10-27' }), coach_id: ME },
    { ...item('a2', 'Training', '2026-11-03', '09:45', '12:00', { series_id: 'a', occurrence_on: '2026-11-03', removed: true }), coach_id: ME },
  ];
  const mine = cal.occurrences(items, at('2026-10-12', '00:00'), at('2026-12-07', '00:00'));
  const theirs = sqlOccurrences(items, ME, at('2026-10-12', '00:00'), at('2026-12-07', '00:00'));
  assert.deepEqual(mine.map((o) => [o.item.id, o.startsAt.getTime(), o.endsAt.getTime(), o.on]), theirs.map((o) => [o.item.id, o.starts, o.ends, o.on]));
  assert.ok(mine.some((o) => o.item.id === 'a1') && !mine.some((o) => o.item.id === 'a2') && !mine.some((o) => o.key === 'a:2026-10-27') && !mine.some((o) => o.key === 'a:2026-11-03'));
});

test('repeats keep their clock time across clock changes, in their own anchor zone', () => {
  // Training at 09:45 UK time stays 09:45 through 25 Oct; a daily New York call stays 07:30 there through 1 Nov.
  const training = item('t', 'Training', '2026-10-19', '09:45', '12:00', { repeat_rule: { every: 'week', weekdays: [1, 2] } });
  assert.deepEqual([...new Set(cal.occurrences([training], at('2026-10-19', '00:00'), at('2026-11-10', '00:00')).map((o) => uk(o.startsAt)))], ['09:45']);
  const daily = call('d', 'Dana', '2026-10-30', '07:30', '08:00', { time_zone: NY, repeat_rule: { every: 'day', count: 5 } });
  const days = cal.occurrences([daily], at('2026-10-29', '00:00'), at('2026-11-10', '00:00'));
  assert.equal(days.length, 5);
  assert.deepEqual(days.map((o) => wallClock(o.startsAt, NY).time), ['07:30', '07:30', '07:30', '07:30', '07:30']);
  assert.deepEqual(days.map((o) => uk(o.startsAt)), ['11:30', '11:30', '12:30', '12:30', '12:30']);
  assert.equal(cal.calRepeatWords({ every: 'week', weekdays: [1, 2] }, '2026-10-19'), 'Every Monday and Tuesday');
  assert.equal(cal.calRepeatWords({ every: 'month', by: 'weekday' }, '2026-09-15'), 'Every month on the third Tuesday');
  assert.equal(cal.calRepeatWords({ every: 'week', interval: 2, count: 6 }, '2026-10-19'), 'Every 2 weeks on Monday, 6 times');
  assert.equal(cal.calRepeatValue({ every: 'week', interval: 2 }), 'week2');
  assert.equal(cal.calRepeatValue({ every: 'week', weekdays: [1, 3] }), 'custom');
  assert.equal(cal.calRepeatValue(null), 'never');
});

test('a repeat edited "this one", "this and following" and "all"', () => {
  const series = item('s', 'Training', '2026-11-02', '09:45', '12:00', { repeat_rule: { every: 'week', count: 6 } });
  const range = [at('2026-11-01', '00:00'), at('2027-01-01', '00:00')];
  const days = (rows) => cal.occurrences(rows, ...range).map((o) => `${wallClock(o.startsAt, LON).date} ${uk(o.startsAt)}`);
  const apply = (rows, made) => [...rows.filter((r) => !made.save.some(([, s]) => s.id === r.id) && !made.remove.some(([, id]) => id === r.id)), ...made.save.map(([, r]) => r)];
  const moved = { starts_at: at('2026-11-17', '14:00'), ends_at: at('2026-11-17', '16:15') };

  // This one: a row stands in for that one time; every other time stays.
  const one = cal.editRepeat({ series, on: '2026-11-16', scope: 'one', times: moved, items: [series], newId });
  assert.equal(one.save.length, 1);
  assert.equal(one.save[0][1].series_id, 's');
  assert.equal(one.save[0][1].occurrence_on, '2026-11-16');
  assert.equal(one.save[0][1].repeat_rule, null);
  assert.deepEqual(days(apply([series], one)), ['2026-11-02 09:45', '2026-11-09 09:45', '2026-11-17 14:00', '2026-11-23 09:45', '2026-11-30 09:45', '2026-12-07 09:45']);

  // This and following: the old series ends the day before, a new one starts here and keeps what is left of the count;
  // a later time that was edited on its own is let go.
  const lateStandIn = item('s9', 'Training', '2026-11-30', '11:00', '12:00', { series_id: 's', occurrence_on: '2026-11-30' });
  const following = cal.editRepeat({ series, on: '2026-11-16', scope: 'following', times: moved, items: [series, lateStandIn], newId });
  const [old, next] = following.save.map(([, r]) => r);
  assert.equal(old.id, 's');
  assert.equal(old.repeat_rule.until, '2026-11-15');
  assert.equal(next.split_from, 's');
  assert.equal(next.repeat_rule.count, 4);
  assert.equal(next.repeat_rule.until, undefined);
  assert.deepEqual(following.remove, [['coach_cal_items', 's9']]);
  assert.deepEqual(days(apply([series, lateStandIn], following)), ['2026-11-02 09:45', '2026-11-09 09:45', '2026-11-17 14:00', '2026-11-24 14:00', '2026-12-01 14:00', '2026-12-08 14:00']);
  // On the series' own first time, "this and following" is all of them.
  assert.equal(cal.editRepeat({ series, on: '2026-11-02', scope: 'following', times: { starts_at: at('2026-11-02', '10:00'), ends_at: at('2026-11-02', '12:15') }, items: [series], newId }).save.length, 1);

  // All: every time moves to the same clock time, by the same days.
  const all = cal.editRepeat({ series, on: '2026-11-16', scope: 'all', times: moved, items: [series], newId });
  assert.deepEqual(days(apply([series], all)), ['2026-11-03 14:00', '2026-11-10 14:00', '2026-11-17 14:00', '2026-11-24 14:00', '2026-12-01 14:00', '2026-12-08 14:00']);
  // A weekly rule on named weekdays moves its weekdays with it.
  const twice = item('w', 'Training', '2026-11-02', '09:45', '12:00', { repeat_rule: { every: 'week', weekdays: [1, 2] } });
  assert.deepEqual(cal.editRepeat({ series: twice, on: '2026-11-03', scope: 'all', times: { starts_at: at('2026-11-04', '09:45'), ends_at: at('2026-11-04', '12:00') }, items: [twice], newId }).save[0][1].repeat_rule.weekdays, [2, 3]);

  // Deleting: one time leaves a row that says so; following ends the series; all removes it.
  const gone = cal.deleteRepeat({ series, on: '2026-11-16', scope: 'one', items: [series], newId });
  assert.equal(gone.save[0][1].removed, true);
  assert.equal(days(apply([series], gone)).length, 5);
  assert.equal(days(apply([series], cal.deleteRepeat({ series, on: '2026-11-16', scope: 'following', items: [series], newId }))).length, 2);
  assert.deepEqual(cal.deleteRepeat({ series, on: '2026-11-16', scope: 'all', items: [series, lateStandIn], newId }).remove, [['coach_cal_items', 's9'], ['coach_cal_items', 's']]);

  // Through the entry itself, with Undo putting everything back.
  const data = { items: [series, lateStandIn] };
  const e = view(data, '2026-11-16', '2026-11-16')[0];
  const planned = cal.moveEntry(e, { day: '2026-11-17', startMin: 14 * 60 }, ctx(data, { scope: 'following' }));
  assert.equal(planned.words, 'Moved to Tue 14:00.');
  assert.deepEqual(planned.undo.save.map(([, r]) => r.id).sort(), ['s', 's9']);
  assert.equal(planned.undo.remove.length, 1);
  assert.deepEqual(days(apply(apply(data.items, planned), planned.undo)), days(data.items));
});

// ---------------------------------------------------------------- what to draw

const WEEK = () => ({
  items: [
    item('training', 'Training', '2026-10-19', '09:45', '12:00', { kind: 'own_time', repeat_rule: { every: 'week', weekdays: [1, 2] } }),
    call('sam', 'Sam Okafor', '2026-11-17', '12:30', '13:30', { profile_id: 'p-sam', session_id: 'ses-sam', meeting_link: 'https://zoom.example/j/1' }),
    call('kestrel', 'Kestrel leadership team', '2026-11-17', '14:00', '15:30', { group_id: 'g1' }),
    call('jordan', 'Jordan Reyes', '2026-11-17', '09:45', '10:45', { time_zone: 'America/Chicago', profile_id: 'p-jordan' }),
    item('parents', 'Parents’ evening', '2026-11-17', '19:00', '20:30', { calendar: 'family', private: true }),
    item('hold', 'Mia and Paul', '2026-11-16', '17:00', '18:00', { kind: 'hold', poll_option_id: 'o1' }),
    item('coffee', 'Coffee with Dan Reid', '2026-11-18', '12:30', '13:00', { kind: 'connection', place_kind: 'in_person' }),
    item('ruth', 'Ruth Adeyemi', '2026-11-18', '13:00', '13:30', { kind: 'chemistry', place_kind: 'zoom' }),
    item('writing', 'Writing', '2026-11-18', '09:00', '12:00', { kind: 'writing' }),
    item('admin', 'Admin', '2026-11-18', '14:00', '16:00', { kind: 'admin' }),
    cal.allDayItem({ id: 'conf', coachId: ME, title: 'Coaching conference', kind: 'event', firstDay: '2026-11-19', lastDay: '2026-11-20', zone: LON }),
  ],
  sessions: [{ id: 'ses-sam', coach_id: ME, profile_id: 'p-sam', starts_at: at('2026-11-17', '12:30'), minutes: 60 }, { id: 'ses-priya', coach_id: ME, profile_id: 'p-priya', starts_at: at('2026-11-17', '17:00'), minutes: 60, place: null }],
  todos: [{ id: 't1', coach_id: ME, title: 'Send the Kestrel proposal', planned_on: '2026-11-20', planned_time: '09:15:00', minutes: 30 }, { id: 't2', title: 'No time yet', planned_on: '2026-11-20', planned_time: null }],
  clients: [{ id: 'p-sam', name: 'Sam Okafor', time_zone: LON }, { id: 'p-priya', name: 'Priya Nair', time_zone: LON }, { id: 'p-jordan', name: 'Jordan Reyes', time_zone: 'America/Chicago' }],
  bookings: [{ id: 'b1', item_id: 'ruth', call_type_id: 'ct1', status: 'booked' }],
  callTypes: [{ id: 'ct1', name: 'Chemistry Call' }],
  openBlocks: [{ id: 'ob1', coach_id: ME, starts_at: at('2026-11-23', '14:00'), ends_at: at('2026-11-23', '16:00'), time_zone: LON, call_type_id: null }],
});

test('what to draw for a week: each kind, its colour, the client’s own time, and one line under 45 minutes', () => {
  const entries = view(WEEK(), '2026-11-16', '2026-11-20');
  const by = Object.fromEntries(entries.map((e) => [e.key, e]));
  assert.deepEqual([by.sam.colour, by.ruth.colour, by.coffee.colour, by.admin.colour, by.writing.colour, by['training:2026-11-16'].colour, by.parents.colour, by.hold.colour], ['client', 'chemistry', 'connection', 'admin', 'writing', 'other', 'life', 'hold']);
  assert.equal(by.sam.colourClass, 'cc-cal-tile--client');
  assert.ok(by.parents.dashed && by.hold.dashed && !by.sam.dashed, 'life and held items are a dashed outline');
  assert.equal(by['training:2026-11-17'].repeats, true);
  // The client's own time inside the block, 12-hour for the US; a client in the coach's own zone has none.
  assert.equal(by.jordan.clientWords, '9:45 am Chicago');
  assert.deepEqual(cal.entryLines(by.jordan, { coachZone: LON }), { title: 'Jordan Reyes', line: '15:45, 9:45 am Chicago', time: '15:45', oneLine: false });
  assert.equal(cal.entryLines(by.jordan, { coachZone: LON, narrow: true }).line, '9:45 am Chicago');
  assert.equal(cal.entryLines(by.sam, { coachZone: LON }).line, 'Zoom, 12:30 to 13:30');
  assert.equal(cal.entryLines(by.kestrel, { coachZone: LON }).line, 'Group, 14:00 to 15:30');
  assert.equal(cal.entryLines(by['training:2026-11-16'], { coachZone: LON }).line, '09:45 to 12:00');
  assert.equal(cal.entryLines(by.parents, { coachZone: LON }).line, 'Family');
  assert.equal(cal.entryLines(by.hold, { coachZone: LON }).line, 'Held for a poll');
  assert.equal(by.ruth.sub, 'Chemistry Call');
  // Under 45 minutes: one line, the title then the start time.
  assert.ok(by.coffee.oneLine && by.ruth.oneLine && by['todo:t1'].oneLine && !by.sam.oneLine);
  assert.deepEqual(cal.entryLines(by.coffee, { coachZone: LON }), { title: 'Coffee with Dan Reid', line: '', time: '12:30', oneLine: true });
  assert.deepEqual(cal.oneLineParts(by['todo:t1'], { coachZone: LON }), { tick: true, title: 'Send the Kestrel proposal', time: '09:15' });
  assert.equal(cal.oneLineParts(by.coffee, { coachZone: LON, fits: false }).time, '');
  // A session with no calendar item yet shows as the call it is; one with an item shows once.
  assert.equal(by['session:ses-priya'].title, 'Priya Nair');
  assert.equal(by['session:ses-priya'].colour, 'client');
  assert.equal(entries.filter((e) => e.title === 'Sam Okafor').length, 1);
  assert.equal(by.sam.session.id, 'ses-sam');
  // A to-do with a time is on the calendar; one without stays on To-dos only.
  assert.ok(by['todo:t1'] && !by['todo:t2']);
  assert.equal(view(WEEK(), '2026-11-16', '2026-11-20', { showTodos: false }).some((e) => e.type === 'todo'), false);
  // My calendars: Family switched off hides it here.
  assert.equal(view(WEEK(), '2026-11-16', '2026-11-20', { settings: { calendars: { family: false } } }).some((e) => e.key === 'parents'), false);
  assert.equal(cal.entryLabel(by.sam, LON), 'Sam Okafor, Tue 17 Nov, 12:30 to 13:30, Zoom');
  assert.equal(cal.removeLabel(by['todo:t1']), 'Remove from calendar');
  assert.equal(cal.removeLabel(by.sam), 'Delete');
});

test('a day’s column: overlaps side by side, all-day and several-day items in their own row, and the now line', () => {
  const data = WEEK();
  data.items.push(item('clash', 'Call with the bank', '2026-11-17', '12:45', '13:15'), item('clash2', 'Lunch', '2026-11-17', '13:00', '14:00'));
  const entries = view(data, '2026-11-16', '2026-11-20');
  const tue = cal.layoutDay(entries, '2026-11-17', LON);
  const tile = (key) => tue.tiles.find((t) => t.entry.key === key);
  assert.deepEqual([tile('sam').startMin, tile('sam').endMin], [750, 810]);
  // Sam 12:30 to 13:30, the bank 12:45 to 13:15 and Lunch 13:00 to 14:00 overlap: three columns between them.
  assert.deepEqual([tile('sam').column, tile('clash').column, tile('clash2').column].sort(), [0, 1, 2]);
  assert.ok([tile('sam'), tile('clash'), tile('clash2')].every((t) => t.columns === 3));
  // Training earlier that day stands alone, full width.
  assert.deepEqual([tile('training:2026-11-17').column, tile('training:2026-11-17').columns], [0, 1]);
  // No two tiles in one column overlap.
  for (const a of tue.tiles) for (const b of tue.tiles) if (a !== b && a.column === b.column) assert.ok(a.endMin <= b.startMin || b.endMin <= a.startMin);
  // The conference is a banner on Thursday and Friday, one bar across both.
  assert.equal(cal.layoutDay(entries, '2026-11-19', LON).banners[0].title, 'Coaching conference');
  const week = cal.viewRange('week', '2026-11-17');
  assert.deepEqual(cal.bannerRows(entries, week.days).map((b) => [b.entry.key, b.from, b.span, b.lane]), [['conf', 3, 2, 0]]);
  assert.deepEqual(cal.nowLine(at('2026-11-17', '12:22'), LON, week.days), { day: '2026-11-17', index: 1, minutes: 742, time: '12:22' });
  assert.equal(cal.nowLine(at('2026-11-21', '12:22'), LON, week.days), null);
  // Open for calls blocks sit under the tiles, never in a column.
  const open = cal.layoutDay(view(data, '2026-11-23', '2026-11-23', { showOpen: true }), '2026-11-23', LON);
  assert.deepEqual(open.open.map((o) => [o.startMin, o.endMin]), [[840, 960]]);
});

test('the views: day, week with or without weekends, month and the Schedule', () => {
  assert.deepEqual(cal.viewRange('week', '2026-11-17'), { fromDay: '2026-11-16', toDay: '2026-11-20', days: ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20'], title: '16 to 20 Nov' });
  assert.equal(cal.viewRange('week', '2026-11-17', { weekends: true }).title, '16 to 22 Nov');
  assert.equal(cal.viewRange('day', '2026-11-17').title, 'Tue 17 Nov');
  assert.equal(cal.daysTitle('2026-11-30', '2026-12-04'), '30 Nov to 4 Dec');
  assert.equal(cal.daysTitle('2026-12-28', '2027-01-01'), '28 Dec 2026 to 1 Jan 2027');
  const month = cal.viewRange('month', '2026-11-17', { weekends: true });
  assert.equal(month.title, 'November 2026');
  assert.deepEqual([month.fromDay, month.toDay, month.days.length], ['2026-10-26', '2026-12-06', 42]);
  assert.equal(cal.monthGrid('2026-11-17', { weekends: false })[0].length, 5);
  assert.equal(cal.monthGrid('2026-11-17')[0][0].inMonth, false);
  assert.equal(cal.stepView('week', '2026-11-17', 1), '2026-11-24');
  assert.equal(cal.stepView('day', '2026-11-20', 1), '2026-11-23');
  assert.equal(cal.stepView('day', '2026-11-20', 1, { weekends: true }), '2026-11-21');
  assert.equal(cal.stepView('month', '2026-01-31', 1), '2026-02-28');
  assert.equal(cal.stepView('month', '2026-01-15', -1), '2025-12-15');
  assert.equal(cal.startingView(true), 'schedule');
  assert.equal(cal.startingView(false), 'week');
  const mini = cal.miniMonth('2026-11-17', { todayKey: '2026-11-17', chosen: '2026-11-19' });
  assert.equal(mini.title, 'November 2026');
  assert.equal(mini.weeks.flat().find((c) => c.today).day, '2026-11-17');
  const entries = view(WEEK(), '2026-11-16', '2026-11-22');
  assert.equal(cal.monthCell(entries, '2026-11-17', 3).moreWords, '3 more');
  assert.equal(cal.monthCell(entries, '2026-11-19').shown[0].title, 'Coaching conference');
  // The Schedule: a day at a time, empty days left out (today kept), each row with its square.
  const sched = cal.scheduleDays(entries, { days: cal.viewRange('week', '2026-11-17', { weekends: true }).days, coachZone: LON, todayKey: '2026-11-17' });
  assert.deepEqual(sched.map((d) => d.title), ['Mon 16 Nov', 'Today, Tue 17 Nov', 'Wed 18 Nov', 'Thu 19 Nov', 'Fri 20 Nov']);
  const tue = sched[1].rows;
  assert.deepEqual(tue.find((r) => r.title === 'Jordan Reyes'), { entry: tue.find((r) => r.title === 'Jordan Reyes').entry, time: '15:45', title: 'Jordan Reyes', lines: ['9:45 am Chicago', 'Zoom'], length: '1 hour', square: { className: 'cc-cal-tile--client', dashed: false, edged: false } });
  assert.equal(tue.find((r) => r.title === 'Parents’ evening').square.dashed, true);
  assert.equal(sched[3].rows[0].time, 'All day');
  assert.equal(cal.scheduleDays([], { days: ['2026-11-17'], coachZone: LON, todayKey: '2026-11-17' })[0].empty, 'Nothing is planned today.');
});

// ---------------------------------------------------------------- two time columns

test('two time columns: the choices, the zone it starts on, and the hour labels across a clock-change day', () => {
  const choices = cal.secondZoneChoices({ time_zones: ['Asia/Kolkata', 'America/New_York', 'Europe/London', 'Not/AZone'] }, LON);
  assert.deepEqual(choices.map((c) => c.label), ['New York', 'Chicago', 'Los Angeles', 'Denver', 'Toronto', 'Dubai', 'Singapore', 'India']);
  // It starts on the zone of the next client call outside the UK.
  const data = WEEK();
  assert.equal(cal.startingSecondZone({ ...data, now: at('2026-11-17', '08:00'), coachZone: LON }), 'America/Chicago');
  assert.equal(cal.startingSecondZone({ ...data, now: at('2026-11-18', '08:00'), coachZone: LON, settings: { second_time_zone: 'Asia/Dubai' } }), 'Asia/Dubai');
  assert.equal(cal.startingSecondZone({ items: [], now: at('2026-11-18', '08:00'), coachZone: LON }), NY);
  assert.equal(cal.zoneColumnLabel('America/Chicago'), 'Chicago');
  assert.equal(cal.zoneColumnLabel(LON), 'UK');
  // An ordinary day: 08:00 UK is 02:00 in Chicago.
  const plain = cal.hourLabels('2026-11-17', LON, 'America/Chicago', { fromHour: 8, toHour: 21 });
  assert.deepEqual([plain[0].coach, plain[0].other, plain.length, plain.some((r) => r.jump)], ['08:00', '02:00', 13, false]);
  // Sun 1 Nov 2026: US clocks go back, so 01:00 comes twice in the New York column while the UK column runs on.
  const usBack = cal.hourLabels('2026-11-01', LON, NY);
  assert.deepEqual(usBack.slice(4, 8).map((r) => [r.coach, r.other, r.jump]), [['04:00', '00:00', false], ['05:00', '01:00', false], ['06:00', '01:00', true], ['07:00', '02:00', false]]);
  assert.equal(usBack[0].otherDay, -1);
  // Sun 25 Oct 2026: UK clocks go back, so an hour passes in New York between two UK rows that read 01:00 and 02:00.
  const ukBack = cal.hourLabels('2026-10-25', LON, NY);
  assert.deepEqual(ukBack.slice(0, 4).map((r) => [r.coach, r.other, r.jump]), [['00:00', '19:00', false], ['01:00', '20:00', false], ['02:00', '22:00', true], ['03:00', '23:00', false]]);
  // Sun 29 Mar 2026: 01:00 doesn't exist in the UK.
  assert.equal(cal.hourLabels('2026-03-29', LON, NY)[1].skipped, true);
  assert.equal(cal.hourLabels('2026-11-17', LON, null)[3].other, '');
});

// ---------------------------------------------------------------- working hours

test('working hours: per-day start and finish, the handles’ moves, the hatched spans, and the same hours for Today and booking', () => {
  const settings = { working_hours: { mon: { from: '09:00', to: '18:30' }, tue: { from: '09:00', to: '18:30' }, wed: { from: '09:00', to: '17:00' } } };
  const hours = cal.workingHours(settings);
  assert.deepEqual(hours.mon, { from: '09:00', to: '18:30' });
  assert.equal(hours.thu, null);
  assert.deepEqual(cal.workingHours(null).fri, { from: '09:00', to: '17:00' });
  assert.equal(cal.workingHours(null).sat, null);
  // A handle moves in 15-minute steps and never crosses the other one.
  assert.deepEqual(cal.moveHours(hours, 'mon', 'to', 20 * 60 + 52).mon, { from: '09:00', to: '20:45' });
  assert.deepEqual(cal.moveHours(hours, 'mon', 'from', 19 * 60).mon, { from: '18:15', to: '18:30' });
  assert.deepEqual(cal.moveHours(hours, 'mon', 'to', 30 * 60).mon.to, '23:45');
  assert.deepEqual(cal.nudgeHours(hours, 'wed', 'from', -1).wed, { from: '08:45', to: '17:00' });
  assert.deepEqual(cal.nudgeHours(hours, 'wed', 'to', 1).wed, { from: '09:00', to: '17:15' });
  assert.deepEqual(cal.moveHours(hours, 'thu', 'to', 15 * 60).thu, { from: '09:00', to: '15:00' });
  assert.equal(cal.hoursHandleWords('from', '09:00'), 'Start 09:00');
  assert.equal(cal.hoursHandleWords('to', '18:30'), 'Finish 18:30');
  assert.deepEqual(cal.outOfHours(settings, '2026-11-16'), [{ fromMin: 0, toMin: 540 }, { fromMin: 1110, toMin: 1440 }]);
  assert.deepEqual(cal.outOfHours(settings, '2026-11-19'), [{ fromMin: 0, toMin: 1440 }]);
  // What Done saves is what day.js's working day and booking then read.
  const saved = { ...settings, ...cal.hoursToSave(cal.moveHours(hours, 'mon', 'to', 15 * 60)) };
  assert.deepEqual(workingDay(saved, '2026-11-16'), { from: '09:00', to: '15:00', minutes: 360 });
  assert.equal(dayLoad({ settings: saved, dayKey: '2026-11-16', todos: [{ id: 't', title: 't', planned_on: '2026-11-16', minutes: 480 }] }).over, 120);
  assert.deepEqual(cal.bookingHoursOn(saved, '2026-11-16'), { from: '09:00', to: '15:00' });
  const free = cal.freeTimes({ source: 'hours', minutes: 60, from: at('2026-11-16', '00:00'), to: at('2026-11-17', '00:00'), now: at('2026-11-10', '09:00'), coachZone: LON, settings: saved });
  assert.deepEqual([uk(free[0]), uk(free.at(-1))], ['09:00', '14:00']);
  // "Open for bookings" in Settings, when filled in, is what clients book inside (as 051 reads it).
  assert.deepEqual(cal.bookingHoursOn({ ...saved, booking_hours: { mon: { from: '10:00', to: '12:00' } } }, '2026-11-16'), { from: '10:00', to: '12:00' });
  assert.equal(cal.bookingHoursOn({ ...saved, booking_hours: { mon: { from: '10:00', to: '12:00' } } }, '2026-11-17'), null);
});

// ---------------------------------------------------------------- making, moving and resizing

test('drag to create, move and resize in 15-minute steps; typed times in 5-minute steps', () => {
  assert.deepEqual(cal.dragTimes({ day: '2026-11-17', fromMin: 9 * 60 + 7, toMin: 10 * 60 + 52, coachZone: LON }), { starts_at: at('2026-11-17', '09:00'), ends_at: at('2026-11-17', '10:45') });
  // Dragged upwards it is the same span; a click is an hour; the smallest is 15 minutes.
  assert.deepEqual(cal.dragTimes({ day: '2026-11-17', fromMin: 10 * 60 + 52, toMin: 9 * 60 + 7, coachZone: LON }), { starts_at: at('2026-11-17', '09:00'), ends_at: at('2026-11-17', '10:45') });
  assert.deepEqual(cal.dragTimes({ day: '2026-11-17', fromMin: 14 * 60 + 4, coachZone: LON }), { starts_at: at('2026-11-17', '14:00'), ends_at: at('2026-11-17', '15:00') });
  assert.deepEqual(cal.dragTimes({ day: '2026-11-17', fromMin: 600, toMin: 603, coachZone: LON }), { starts_at: at('2026-11-17', '10:00'), ends_at: at('2026-11-17', '10:15') });
  assert.equal(cal.snapMinutes(593), 600);
  assert.equal(cal.snapMinutes(593, cal.TYPE_STEP), 595);
  // Typed: 5-minute steps, with the length line under them.
  const typed = cal.typedTimes({ day: '2026-11-16', from: '09:45', to: '12:00', coachZone: LON });
  assert.equal(typed.line, '2 hours 15 minutes, in 5-minute steps.');
  assert.equal(typed.minutes, 135);
  assert.equal(cal.typedTimes({ day: '2026-11-16', from: '09:47', to: '12:00', coachZone: LON }).problem, 'Times go in 5-minute steps. Choose the nearest one.');
  assert.equal(cal.typedTimes({ day: '2026-11-16', from: '', to: '12:00', coachZone: LON }).problem, 'Type a start and an end to carry on.');
  assert.deepEqual(cal.timeChoices(585, 600), ['09:45', '09:50', '09:55', '10:00']);
  // Moving a one-off: the toast, and Undo.
  const data = WEEK();
  const entries = view(data, '2026-11-16', '2026-11-20');
  const writing = entries.find((e) => e.key === 'writing');
  const moved = cal.moveEntry(writing, { day: '2026-11-19', startMin: 13 * 60 }, ctx(data));
  assert.equal(moved.words, 'Moved to Thu 13:00.');
  assert.deepEqual([moved.save[0][1].starts_at, moved.save[0][1].ends_at], [at('2026-11-19', '13:00'), at('2026-11-19', '16:00')]);
  assert.deepEqual(moved.undo, { save: [['coach_cal_items', data.items.find((i) => i.id === 'writing')]], remove: [] });
  const longer = cal.resizeEntry(writing, { endDay: '2026-11-18', endMin: 12 * 60 + 40 }, ctx(data));
  assert.equal(longer.words, 'Now 09:00 to 12:45.');
  assert.equal(cal.resizeEntry(writing, { endDay: '2026-11-18', endMin: 9 * 60 }, ctx(data)).save[0][1].ends_at, at('2026-11-18', '09:15'));
  assert.equal(cal.nudgeEntry(writing, { minutes: -15 }, ctx(data)).save[0][1].starts_at, at('2026-11-18', '08:45'));
  assert.equal(cal.nudgeEntry(writing, { days: 1 }, ctx(data)).save[0][1].starts_at, at('2026-11-19', '09:00'));
});

test('moving a client call takes its session with it and tells the client, with a drafted note that is never sent', () => {
  const data = WEEK();
  const sam = view(data, '2026-11-17', '2026-11-17').find((e) => e.key === 'sam');
  const moved = cal.moveEntry(sam, { day: '2026-11-18', startMin: 16 * 60 + 15 }, ctx(data, { coachFirstName: 'Tim' }));
  assert.deepEqual(moved.save.map(([t, r]) => [t, r.id, r.starts_at]), [['coach_cal_items', 'sam', at('2026-11-18', '16:15')], ['coach_sessions', 'ses-sam', at('2026-11-18', '16:15')]]);
  // Nothing sends by itself: without Google the coach is told to tell Sam, and the note is drafted.
  assert.equal(moved.words, 'Moved to Wed 16:15. Tell Sam the new time.');
  assert.deepEqual(moved.tell, { name: 'Sam Okafor', subject: 'Our call has moved', body: 'Hi Sam,\n\nI’ve moved our call to Wed 18 Nov at 16:15 UK time. It was Tue 17 Nov at 12:30 UK time.\n\nThe Zoom link stays the same: https://zoom.example/j/1\n\nTim' });
  // With invites going out through Google, M11's words.
  assert.equal(cal.moveEntry(sam, { day: '2026-11-18', startMin: 16 * 60 + 15 }, ctx(data, { invites: true })).words, 'Moved to Wed 16:15. Sam gets the new time.');
  assert.equal(cal.resizeEntry(sam, { endDay: '2026-11-17', endMin: 14 * 60 }, ctx(data, { invites: true })).words, 'Now 12:30 to 14:00. Sam gets the new time.');
  assert.equal(cal.resizeEntry(sam, { endDay: '2026-11-17', endMin: 14 * 60 }, ctx(data)).save[1][1].minutes, 90);
  const group = view(data, '2026-11-17', '2026-11-17').find((e) => e.key === 'kestrel');
  assert.equal(cal.moveEntry(group, { day: '2026-11-17', startMin: 15 * 60 }, ctx(data, { invites: true })).words, 'Moved to Tue 15:00. Everyone invited gets the new time.');
  // The client's note is in the client's own time, 12-hour for the US.
  const jordan = view(data, '2026-11-17', '2026-11-17').find((e) => e.key === 'jordan');
  assert.match(cal.moveEntry(jordan, { day: '2026-11-18', startMin: 15 * 60 }, ctx(data)).tell.body, /to Wed 18 Nov at 9:00 am Chicago time\. It was Tue 17 Nov at 9:45 am Chicago time\./);
  // The anchor zone never changes when the coach drags.
  assert.equal(cal.moveEntry(jordan, { day: '2026-11-18', startMin: 15 * 60 }, ctx(data)).save[0][1].time_zone, 'America/Chicago');
  // A session whose recap has gone stays as it is.
  data.sessions[0].recap_sent_at = at('2026-11-17', '14:00');
  const locked = view(data, '2026-11-17', '2026-11-17').find((e) => e.key === 'sam');
  assert.equal(cal.moveEntry(locked, { day: '2026-11-18', startMin: 600 }, ctx(data)).problem, 'The recap has been sent, so this session stays as it is.');
  // A session with no calendar item moves as its own row.
  const priya = view(data, '2026-11-17', '2026-11-17').find((e) => e.key === 'session:ses-priya');
  assert.deepEqual(cal.moveEntry(priya, { day: '2026-11-17', startMin: 16 * 60 }, ctx(data)).save.map(([t, r]) => [t, r.starts_at]), [['coach_sessions', at('2026-11-17', '16:00')]]);
});

test('a call dragged across midnight keeps its length and shows in both days', () => {
  const data = { items: [{ ...call('late', 'Nora Ellis', '2026-11-17', '21:00', '22:00'), time_zone: 'America/Los_Angeles' }], sessions: [] };
  const e = view(data, '2026-11-17', '2026-11-17')[0];
  const moved = cal.moveEntry(e, { day: '2026-11-17', startMin: 23 * 60 + 30 }, ctx(data));
  assert.deepEqual([moved.save[0][1].starts_at, moved.save[0][1].ends_at], [at('2026-11-17', '23:30'), at('2026-11-18', '00:30')]);
  assert.equal(moved.words, 'Moved to Tue 23:30. Tell Nora the new time.');
  const after = view({ items: [moved.save[0][1]] }, '2026-11-17', '2026-11-18');
  assert.deepEqual([after[0].fromDay, after[0].toDay, after[0].minutes], ['2026-11-17', '2026-11-18', 60]);
  const tue = cal.layoutDay(after, '2026-11-17', LON).tiles[0];
  const wed = cal.layoutDay(after, '2026-11-18', LON).tiles[0];
  assert.deepEqual([tue.startMin, tue.endMin, tue.endsAfter], [1410, 1440, true]);
  assert.deepEqual([wed.startMin, wed.endMin, wed.startsBefore], [0, 30, true]);
  // Dragged past the day's end the start itself rolls into the next day.
  assert.deepEqual(cal.timesAt({ day: '2026-11-17', startMin: 1470, minutes: 60, coachZone: LON }), { starts_at: at('2026-11-18', '00:30'), ends_at: at('2026-11-18', '01:30') });
  // Typed, an end before the start is the next day.
  assert.equal(cal.typedTimes({ day: '2026-11-17', from: '23:30', to: '00:30', coachZone: LON }).ends_at, at('2026-11-18', '00:30'));
  // Across the night the clocks go back (25 Oct), an hour's call is still an hour.
  const night = cal.timesAt({ day: '2026-10-25', startMin: 30, minutes: 60, coachZone: LON });
  assert.equal(new Date(night.ends_at) - new Date(night.starts_at), 3600000);
});

test('Duplicate and Delete, each with what Undo restores; travel time and guests go with their call', () => {
  const data = WEEK();
  data.items.push(...cal.travelItems(data.items.find((i) => i.id === 'sam'), 30, () => `travel-${newId()}`));
  data.guests = [{ id: 'g1', item_id: 'sam', email: 'sam@example.invalid', reply: 'none' }];
  const week = cal.viewRange('week', '2026-11-17').days;
  const entries = view(data, week[0], week[4]);
  const sam = entries.find((e) => e.key === 'sam');
  const dup = cal.duplicateEntry(sam, ctx(data, { days: week }));
  assert.equal(dup.words, 'Duplicated to Wed.');
  const copy = dup.save[0][1];
  assert.deepEqual([copy.starts_at, copy.session_id, copy.meeting_link, copy.google_event_id, copy.title], [at('2026-11-18', '12:30'), null, null, null, 'Sam Okafor']);
  assert.deepEqual(dup.undo, { save: [], remove: [['coach_cal_items', copy.id]] });
  // On the last day showing it stays on that day; a to-do is never duplicated.
  const admin = cal.duplicateEntry(view({ items: [item('f', 'Admin', '2026-11-20', '14:00', '16:00')] }, week[0], week[4])[0], ctx({}, { days: week }));
  assert.equal(admin.words, 'Duplicated to Fri.');
  assert.equal(cal.duplicateEntry(entries.find((e) => e.type === 'todo'), ctx(data, { days: week })).save.length, 0);
  // Moving the call moves its travel either side.
  const moved = cal.moveEntry(sam, { day: '2026-11-17', startMin: 14 * 60 }, ctx(data));
  assert.deepEqual(moved.save.filter(([, r]) => r.kind === 'travel').map(([, r]) => [uk(r.starts_at), uk(r.ends_at)]), [['13:30', '14:00'], ['15:00', '15:30']]);
  // Deleting it takes its guests, its travel and its session (nothing was written up), and Undo brings all of them back.
  const gone = cal.deleteEntry(sam, ctx(data, { coachFirstName: 'Tim' }));
  assert.equal(gone.words, 'Deleted');
  assert.deepEqual(gone.remove.map(([t]) => t), ['coach_cal_guests', 'coach_cal_items', 'coach_cal_items', 'coach_cal_items', 'coach_sessions']);
  assert.equal(gone.undo.save.length, 5);
  assert.equal(gone.undo.save[0][1].id, 'sam', 'the call goes back before its travel time');
  assert.equal(gone.tell.subject, 'Our call is cancelled');
  // A session that was written up is never removed with its item.
  data.sessions[0].outcome = 'held';
  assert.equal(cal.deleteEntry(view(data, week[0], week[4]).find((e) => e.key === 'sam'), ctx(data)).remove.some(([t]) => t === 'coach_sessions'), false);
});

// ---------------------------------------------------------------- to-dos on the calendar

test('to-dos on the calendar: place, move, resize, and Remove from calendar puts it back on the to-do list', () => {
  const todo = { id: 't9', coach_id: ME, title: 'Reply to Elena Ruiz', planned_on: null, planned_time: null, minutes: 15, someday: true };
  const placed = cal.placeTodo(todo, { day: '2026-11-18', startMin: 10 * 60 + 8 }, { data: { todos: [todo] } });
  assert.deepEqual([placed.save[0][0], placed.save[0][1].planned_on, placed.save[0][1].planned_time, placed.save[0][1].minutes, placed.save[0][1].someday], ['coach_todos', '2026-11-18', '10:15', 15, false]);
  assert.deepEqual(placed.undo.save, [['coach_todos', todo]]);
  // With no estimate it takes 30 minutes.
  assert.equal(cal.placeTodo({ ...todo, minutes: null }, { day: '2026-11-18', startMin: 600 }).save[0][1].minutes, 30);
  const data = { todos: [placed.save[0][1]] };
  const e = view(data, '2026-11-18', '2026-11-18')[0];
  assert.deepEqual([e.type, e.sub, e.oneLine, uk(e.startsAt)], ['todo', 'To-do', true, '10:15']);
  const moved = cal.moveEntry(e, { day: '2026-11-19', startMin: 14 * 60 }, ctx(data));
  assert.deepEqual([moved.save[0][1].planned_on, moved.save[0][1].planned_time, moved.words], ['2026-11-19', '14:00', 'Moved to Thu 14:00.']);
  const longer = cal.resizeEntry(e, { endDay: '2026-11-18', endMin: 11 * 60 + 15 }, ctx(data));
  assert.deepEqual([longer.save[0][1].minutes, longer.save[0][1].planned_time, longer.words], [60, '10:15', 'Now 10:15 to 11:15.']);
  // Remove from calendar: it keeps its day and loses only its time; Delete is for calendar items only.
  const back = cal.deleteEntry(e, ctx(data));
  assert.equal(back.words, 'Back on your to-do list.');
  assert.deepEqual([back.save[0][1].planned_on, back.save[0][1].planned_time, back.remove.length], ['2026-11-18', null, 0]);
  assert.equal(view({ todos: [back.save[0][1]] }, '2026-11-18', '2026-11-18').length, 0);
  // A ticked one still shows, ticked.
  assert.equal(view({ todos: [{ ...data.todos[0], done_at: at('2026-11-18', '11:00') }] }, '2026-11-18', '2026-11-18')[0].done, true);
  assert.deepEqual(cal.todosToPlace([{ id: 'a', title: 'a', planned_on: '2026-11-17' }, { id: 'b', title: 'b', planned_on: '2026-11-17', planned_time: '10:00' }, { id: 'c', title: 'c', done_at: 'x' }, { id: 'd', title: 'd', important: true }], '2026-11-17').map((t) => t.id), ['d', 'a']);
});

// ---------------------------------------------------------------- the quick add

test('natural-language quick add', () => {
  const read = (text) => cal.parseCalQuickAdd(text, { todayKey: '2026-11-17' }); // a Tuesday
  assert.deepEqual(read('Coffee with Dan Thu 10:00'), { title: 'Coffee with Dan', day: '2026-11-19', from: '10:00', to: '11:00', minutes: 60, allDay: false, kind: 'connection', repeat_rule: null });
  assert.deepEqual(read('Writing tomorrow 9-11'), { title: 'Writing', day: '2026-11-18', from: '09:00', to: '11:00', minutes: 120, allDay: false, kind: 'writing', repeat_rule: null });
  assert.deepEqual(read('Lunch Fri 12:30 for 45m'), { title: 'Lunch', day: '2026-11-20', from: '12:30', to: '13:15', minutes: 45, allDay: false, kind: 'own_time', repeat_rule: null });
  assert.deepEqual([read('Dentist 3pm').from, read('Dentist 3pm').day], ['15:00', '2026-11-17']);
  assert.deepEqual([read('Run 7.30am for 50 min').from, read('Run 7.30am for 50 min').to], ['07:30', '08:20']);
  assert.deepEqual([read('Board prep 2pm-3.30pm').from, read('Board prep 2pm-3.30pm').to], ['14:00', '15:30']);
  assert.deepEqual([read('Walk 11-1pm').from, read('Walk 11-1pm').to], ['11:00', '13:00']);
  assert.deepEqual([read('Admin Monday 14:00 for 2 hours').day, read('Admin Monday 14:00 for 2 hours').to, read('Admin Monday 14:00 for 2 hours').kind], ['2026-11-23', '16:00', 'admin']);
  // No time: an all-day item on the day read.
  assert.deepEqual([read('Conference Friday').allDay, read('Conference Friday').day, read('Conference Friday').title], [true, '2026-11-20', 'Conference']);
  assert.deepEqual(read('Training every Monday 09:45-12:00').repeat_rule, { every: 'week' });
  assert.equal(cal.parseCalQuickAdd('Call Dana 10:00', { todayKey: '2026-11-17', defaultDay: '2026-11-19' }).day, '2026-11-19');
  assert.deepEqual(cal.calQuickAddChips(read('Writing tomorrow 9-11')), ['Wed 18 Nov', '09:00 to 11:00']);
  assert.deepEqual(cal.calQuickAddChips(read('')), []);
  // What it saves: the kinds.
  assert.deepEqual(cal.QUICK_KINDS.map((k) => k.label), ['Your own time', 'Networking call', 'Event', 'To-do', 'Client call']);
  const times = { starts_at: at('2026-11-19', '10:00'), ends_at: at('2026-11-19', '11:00') };
  const own = cal.quickAddPlan({ title: ' Training ', kind: 'own', ...times }, ctx({}, { coachId: ME }));
  assert.deepEqual([own.save[0][0], own.save[0][1].kind, own.save[0][1].title, own.save[0][1].time_zone, own.words], ['coach_cal_items', 'own_time', 'Training', LON, 'Added']);
  const net = cal.quickAddPlan({ title: 'Coffee with Dan', kind: 'net', ...times, people: [{ name: 'Dan Reid', email: 'dan@example.invalid' }] }, ctx({}, { coachId: ME, invites: true }));
  assert.deepEqual([net.save.map(([t]) => t), net.words], [['coach_cal_items', 'coach_cal_guests'], 'Added. 1 person gets an invite.']);
  assert.equal(cal.quickAddPlan({ title: 'Coffee with Dan', kind: 'net', ...times, people: [{ name: 'Dan Reid', email: 'dan@example.invalid' }] }, ctx({}, { coachId: ME })).words, 'Added');
  // A to-do goes on To-dos too: it is a coach_todos row with the day, the time and the length.
  const todo = cal.quickAddPlan({ title: 'Send the Kestrel proposal', kind: 'todo', starts_at: at('2026-11-20', '09:15'), ends_at: at('2026-11-20', '09:45') }, ctx({}, { coachId: ME, todo: { checklist: [], position: 3 } }));
  assert.deepEqual([todo.save[0][0], todo.save[0][1].planned_on, todo.save[0][1].planned_time, todo.save[0][1].minutes, todo.words], ['coach_todos', '2026-11-20', '09:15', 30, 'Added. It’s on your to-do list too.']);
  assert.equal(cal.quickAddPlan({ title: '  ', kind: 'own', ...times }, ctx({}, { coachId: ME })).problem, 'Type a title to carry on.');
  // A client call isn't made here: it goes on to Book a call.
  assert.equal(cal.quickAddPlan({ title: 'Sam', kind: 'call', ...times }, ctx({}, { coachId: ME })).save.length, 0);
  assert.equal(cal.quickSaveLabel('call'), 'Book the call');
  const allDay = cal.quickAddPlan({ title: 'Conference', kind: 'event', allDay: { firstDay: '2026-11-23', lastDay: '2026-11-24' } }, ctx({}, { coachId: ME }));
  assert.deepEqual([allDay.save[0][1].all_day, allDay.save[0][1].starts_on, allDay.save[0][1].ends_on], [true, '2026-11-23', '2026-11-24']);
});

// ---------------------------------------------------------------- Who's invited?

test('Who’s invited?: a pasted list, with the count, addresses to check and names without an email', () => {
  const read = cal.invited('Dan Reid <dan@brightwater.example>, priya@example.invalid; "Okafor, Sam" <SAM@example.invalid>\nMaya Ellis\tmaya@example.invalid\nDan Reid <DAN@brightwater.example>\nleo@broken\nNora Ellis');
  assert.deepEqual(read.people.map((p) => p.email), ['dan@brightwater.example', 'priya@example.invalid', 'sam@example.invalid', 'maya@example.invalid']);
  assert.equal(read.count, 4);
  assert.equal(read.countWords, '4 people');
  assert.equal(read.duplicates, 1);
  assert.deepEqual(read.toCheck, ['leo@broken']);
  assert.ok(read.noEmail.includes('Nora Ellis'));
  assert.ok(read.lines.includes('Check this address: leo@broken.'));
  assert.ok(read.lines.includes('1 duplicate was taken out.'));
  assert.equal(cal.invited('dan@example.invalid').countWords, '1 person');
  assert.deepEqual(cal.invited('').people, []);
  // Picking people already in the portal, and the rows that are saved.
  const picked = cal.pickPeople('sa', { clients: [{ id: 'p1', name: 'Sam Okafor', email: 'sam@example.invalid' }, { id: 'p2', name: 'Priya Nair' }], contacts: [{ id: 'c1', name: 'Dana Whitfield', email: 'dana@sable.example' }] });
  assert.deepEqual(picked.map((p) => p.name), ['Sam Okafor', 'Dana Whitfield']);
  const rows = cal.guestRows([...read.people.slice(0, 1), picked[0]], { itemId: 'i1', coachId: ME, newId, clients: [{ id: 'p1', email: 'Sam@example.invalid' }] });
  assert.deepEqual(rows.map((r) => [r.email, r.profile_id, r.reply, r.position]), [['dan@brightwater.example', null, 'none', 0], ['sam@example.invalid', 'p1', 'none', 1]]);
  assert.equal(cal.replyWords([{ reply: 'yes' }, { reply: 'yes' }, { reply: 'maybe' }, {}]), '2 yes, 1 maybe, 1 no reply yet');
});

// ---------------------------------------------------------------- booking

const HOURS = { working_hours: { mon: { from: '09:00', to: '17:00' }, tue: { from: '09:00', to: '17:00' }, wed: { from: '09:00', to: '17:00' }, thu: { from: '09:00', to: '17:00' }, fri: { from: '09:00', to: '17:00' } } };
const free = (extra) => cal.freeTimes({ source: 'hours', minutes: 30, from: at('2026-11-17', '00:00'), to: at('2026-11-18', '00:00'), now: at('2026-11-10', '09:00'), coachZone: LON, settings: HOURS, ...extra });

test('free times: working hours, busy items, gaps either side of a call, notice, and how far ahead', () => {
  const data = WEEK();
  const times = free({ items: data.items, sessions: data.sessions, minutes: 60 }).map(uk);
  // Tue 17 Nov: Training 09:45 to 12:00 (not a call: no gap), Sam 12:30 to 13:30, Kestrel 14:00 to 15:30, Jordan 15:45 to 16:45, Priya's session 17:00.
  assert.deepEqual(times, []);
  const half = free({ items: data.items, sessions: data.sessions }).map(uk);
  assert.deepEqual(half, ['09:00', '09:15'], 'only before Training: every other gap is within 15 minutes of a call');
  // Personal and family items block as busy only; a free item never blocks.
  const life = [item('dentist', 'Dentist', '2026-11-17', '10:00', '11:00', { calendar: 'personal', private: true }), item('fyi', 'Sale ends', '2026-11-17', '13:00', '14:00', { busy: false })];
  const around = free({ items: life }).map(uk);
  assert.ok(!around.includes('10:00') && !around.includes('10:45') && around.includes('09:30') && around.includes('11:00') && around.includes('13:00'));
  assert.deepEqual(cal.busySpans({ items: life, from: at('2026-11-17', '00:00'), to: at('2026-11-18', '00:00') }).map((b) => b.title), ['Dentist']);
  // Notice: nothing inside the next 24 hours; ahead: nothing past 4 weeks.
  assert.equal(uk(free({ now: at('2026-11-16', '11:20') })[0]), '11:30');
  assert.deepEqual(free({ now: at('2026-11-17', '08:00') }), []);
  assert.deepEqual(free({ now: at('2026-10-10', '08:00') }), []);
  assert.equal(free({ now: at('2026-11-17', '08:00'), noticeHours: 0 }).length > 0, true);
  // A call type's own longer gaps, notice and limit are kept.
  const type = { id: 'ct', gap_before: 30, gap_after: 45, notice_hours: 48, ahead_weeks: 2, day_limit: 1 };
  const one = [call('x', 'Hannah Wells', '2026-11-17', '12:00', '13:00')];
  const typed = free({ items: one, callType: type, now: at('2026-11-12', '09:00') }).map(uk);
  assert.deepEqual(typed, [], 'its limit of 1 call a day is reached');
  const gaps = free({ items: one, callType: { ...type, day_limit: 5 }, now: at('2026-11-12', '09:00') }).map(uk);
  assert.ok(gaps.includes('10:45') && !gaps.includes('11:00') && !gaps.includes('13:15') && gaps.includes('13:30'), '45 minutes after it before the call there, 30 before it after');
  assert.deepEqual(free({ callType: type, now: at('2026-11-16', '09:00') }), [], '48 hours of notice');
  // Away: nothing on those days.
  assert.deepEqual(free({ away: [{ starts_on: '2026-11-16', ends_on: '2026-11-18' }] }), []);
  // Settings' limits, read as their leading whole number and kept inside their bounds.
  assert.deepEqual(cal.bookingLimits({ booking: { gap: '30 minutes', per_day: '3', notice: '48 hours', ahead: '99 weeks' } }), { gap: 30, perDay: 3, notice: 48, ahead: 12 });
  assert.deepEqual(cal.bookingLimits(null), { gap: 15, perDay: 5, notice: 24, ahead: 4 });
  assert.deepEqual(cal.bookingLimitWords({ booking: { notice: 1 } }), { gap: '15 minutes', per_day: '5', notice: '1 hour', ahead: '4 weeks' });
  assert.equal(cal.callTypeLine({ minutes: 30, notice_hours: 24, ahead_weeks: 4 }), '30 minutes, 24 hours’ notice, 4 weeks ahead');
  assert.equal(cal.bookingFootLine(24, 4), 'Times from 24 hours ahead, up to 4 weeks.');
  assert.equal(cal.callPlaceLine(30, 'zoom'), '30 minutes, Zoom');
});

test('at most 5 calls a day, with 15 minutes between them', () => {
  const day = '2026-11-17';
  const five = ['09:00', '10:15', '11:30', '13:00', '14:15'].map((t, i) => call(`c${i}`, `Client ${i}`, day, t, `${String(Number(t.slice(0, 2)) + 1).padStart(2, '0')}:${t.slice(3)}`));
  assert.ok(free({ items: five.slice(0, 4) }).length > 0);
  assert.deepEqual(free({ items: five }), [], 'the sixth is never offered, though 15:30 to 17:00 is empty');
  assert.ok(free({ items: five, from: at('2026-11-18', '00:00'), to: at('2026-11-19', '00:00') }).length > 0, 'the next day is open');
  // Own time and events don't count towards the 5; a session with no item does.
  const own = five.slice(0, 4).concat(item('o', 'Training', day, '15:30', '16:00', { kind: 'own_time' }));
  assert.ok(free({ items: own }).length > 0);
  assert.deepEqual(free({ items: five.slice(0, 4), sessions: [{ id: 's', starts_at: at(day, '14:15'), minutes: 60 }] }), []);
  // The gap: with a call 12:00 to 13:00, nothing ends after 11:45 or starts before 13:15.
  const starts = free({ items: [call('x', 'Hannah Wells', day, '12:00', '13:00')] }).map(uk);
  assert.ok(starts.includes('11:15') && !starts.includes('11:30') && !starts.includes('13:00') && starts.includes('13:15'));
  // Placing one by hand says why not.
  assert.equal(cal.callProblem({ start: at(day, '13:00'), minutes: 60, clientZone: LON, coachZone: LON, items: [call('x', 'Hannah Wells', day, '12:00', '13:00')] }), 'That’s within 15 minutes of Hannah Wells. Choose a time with a gap either side.');
  assert.equal(cal.callProblem({ start: at(day, '12:30'), minutes: 60, clientZone: LON, coachZone: LON, items: [call('x', 'Hannah Wells', day, '12:00', '13:00')] }), 'That overlaps Hannah Wells. Choose another time.');
  assert.equal(cal.callProblem({ start: at(day, '16:00'), minutes: 60, clientZone: LON, coachZone: LON, items: five }), 'That day already has 5 calls. Choose another day.');
  assert.equal(cal.callProblem({ start: at(day, '16:00'), minutes: 60, clientZone: LON, coachZone: LON, items: five.slice(0, 3) }), null);
});

test('a booking at 02:00 the guest’s time is hidden unless "Show early and late times" is on', () => {
  // Open for calls 07:00 to 16:00 UK on Tue 17 Nov; the guest is in New York (5 hours behind) and Sydney (11 ahead).
  const openBlocks = [{ id: 'o', starts_at: at('2026-11-17', '07:00'), ends_at: at('2026-11-17', '16:00'), time_zone: LON, call_type_id: null }];
  const ask = (zone, earlyAndLate) => cal.freeTimes({ source: 'open', minutes: 30, from: at('2026-11-17', '00:00'), to: at('2026-11-18', '00:00'), now: at('2026-11-10', '09:00'), coachZone: LON, clientZone: zone, openBlocks, earlyAndLate });
  const ny = ask(NY, false);
  assert.equal(wallClock(ny[0], NY).time, '07:00', 'the first time offered is 07:00 in New York, 12:00 in the UK');
  assert.ok(ny.every((s) => wallClock(s, NY).time >= '07:00'));
  const all = ask(NY, true);
  assert.equal(wallClock(all[0], NY).time, '02:00');
  assert.ok(all.some((s) => wallClock(s, NY).time === '02:00') && !ny.some((s) => wallClock(s, NY).time === '02:00'));
  // The page can hold them back itself and say how many.
  assert.deepEqual([cal.sociableStarts(all, NY, 30).shown.length, cal.sociableStarts(all, NY, 30).hidden], [ny.length, all.length - ny.length]);
  assert.equal(cal.sociableStarts(all, NY, 30, true).hidden, 0);
  assert.equal(cal.EARLY_AND_LATE_LABEL, 'Show early and late times');
  // A call must END by 20:00 the visitor's time: in Sydney 07:00 to 09:00 UK is 18:00 to 20:00 there.
  const sydney = ask('Australia/Sydney', false).map((s) => wallClock(s, 'Australia/Sydney').time);
  assert.deepEqual([sydney[0], sydney.at(-1)], ['18:00', '19:30']);
  // Booking pages offer only Open for calls blocks, never the weekly hours.
  assert.deepEqual(cal.freeTimes({ source: 'open', minutes: 30, from: at('2026-11-18', '00:00'), to: at('2026-11-19', '00:00'), now: at('2026-11-10', '09:00'), coachZone: LON, openBlocks, settings: HOURS }), []);
  assert.deepEqual(cal.freeDays(ny, NY).map((d) => [d.day, d.label, d.title]), [['2026-11-17', 'Tue 17', 'Tue 17 Nov']]);
  assert.equal(cal.bookButtonWords(ny[0], NY), 'Book Tue 17 Nov, 7:00 am');
  assert.equal(cal.bookingWords('hours'), 'That time is early or late where you are. Choose “Show early and late times” to book it.');
  assert.equal(cal.bookingWords('taken'), 'That time has just been taken. Choose another.');
  assert.equal(cal.bookingWords('something_new'), 'That didn’t work. Try again in a moment.');
  for (const words of Object.values(cal.BOOKING_WORDS)) assert.ok(!/fail/i.test(words) && /[.]$/.test(words));
});

test('free times are the ones migration 051 would give (the stand-in’s twin of the SQL)', async () => {
  const { calStandIn } = await import('../coach/cal-standin.mjs');
  const data = WEEK();
  const items = data.items.map((i) => ({ ...i, coach_id: ME }));
  const openBlocks = [{ id: 'o1', coach_id: ME, starts_at: at('2026-11-17', '08:00'), ends_at: at('2026-11-17', '18:00'), time_zone: LON, call_type_id: null }, { id: 'o2', coach_id: ME, starts_at: at('2026-11-18', '09:00'), ends_at: at('2026-11-18', '17:00'), time_zone: LON, call_type_id: null }];
  const type = { id: 'ct1', coach_id: ME, key: 'chemistry', name: 'Chemistry Call', minutes: 30, gap_before: 15, gap_after: 15, notice_hours: 24, ahead_weeks: 4, day_limit: 5, page_key: 'page-1', active: true, questions: [], place_kind: 'zoom' };
  const store = { rows: { coach_cal_items: items, coach_open_blocks: openBlocks, coach_call_types: [type], coach_booking_links: [], coach_settings: [{ coach_id: ME, time_zone: LON }], coach_away: [], coach_bookings: [], coach_sessions: [], coach_notifications: [] }, coaches: [{ id: ME, display_first_name: 'Tim', active: true }] };
  const now = new Date(at('2026-11-12', '09:00'));
  const sql = calStandIn({ store, ME, me: {}, clock: () => now, no: () => { throw new Error('refused'); } });
  const theirs = sql.fn.booking_free_times(null, 'page-1', at('2026-11-16', '00:00'), at('2026-11-20', '00:00')).map((r) => r.starts_at);
  const mine = cal.freeTimes({ source: 'open', minutes: 30, callType: type, from: at('2026-11-16', '00:00'), to: at('2026-11-20', '00:00'), now, coachZone: LON, items, openBlocks, earlyAndLate: true }).map((d) => d.toISOString());
  assert.ok(theirs.length > 5);
  assert.deepEqual(mine, theirs);
});

test('a public holiday in the client’s country is flagged before a booking is confirmed', async () => {
  assert.equal(await cal.holidayLineFor(at('2026-11-26', '10:00', NY), NY), 'That’s Thanksgiving in the US.');
  assert.equal(await cal.holidayLineFor(at('2026-11-25', '10:00', NY), NY), null);
  // The day is read on the client's own calendar: 23:30 on 25 Nov in the UK is still the day before Thanksgiving in New York.
  assert.equal(await cal.holidayLineFor(at('2026-11-25', '23:30'), NY), null);
  assert.equal(await cal.holidayLineFor(at('2026-11-27', '02:00'), NY), 'That’s Thanksgiving in the US.');
});

test('single-use links, a client moving a session late, and series booking with clashes', () => {
  const link = cal.newLink({ id: 'l1', key: 'k1', coachId: ME, purpose: 'Sponsor call', forName: 'Dana Whitfield', expiresOn: '2026-11-20' });
  assert.equal(cal.linkState(link, '2026-11-20'), 'open');
  assert.equal(cal.linkState(link, '2026-11-21'), 'expired');
  assert.equal(cal.linkState({ ...link, used_at: 'x' }, '2026-11-18'), 'used');
  assert.equal(cal.linkState({ ...link, revoked_at: 'x', used_at: 'x' }, '2026-11-18'), 'closed');
  assert.equal(cal.linkState({ ...link, expires_on: null }, '2030-01-01'), 'open');
  assert.equal(cal.linkCopiedWords('Dana Whitfield'), 'Link copied. It works once, for Dana.');
  assert.equal(cal.openLinksLine([link, { ...link, for_name: 'Paul Garner' }, { ...link, used_at: 'x' }], '2026-11-18'), '2 open, for Dana Whitfield and Paul Garner');
  assert.equal(cal.openLinksLine([], '2026-11-18'), 'None open');
  // Under 24 hours a client is told first that going on uses the session.
  assert.equal(cal.lateLine(at('2026-11-18', '10:00'), at('2026-11-17', '09:59')), null);
  assert.deepEqual(cal.lateLine(at('2026-11-18', '10:00'), at('2026-11-17', '10:01')), { line: 'This session is in under 24 hours, so moving it uses one of your sessions.', go: 'Move it anyway', stay: 'Keep my session' });
  assert.equal(cal.lateLine(at('2026-11-18', '10:00'), at('2026-11-18', '08:00'), 'cancel').line, 'This session is in under 24 hours, so cancelling it uses one of your sessions.');
  // A series every 2 weeks from Thu 19 Nov 15:30 UK for Jordan in Chicago: a rule in his zone, 6 calls.
  const chicago = 'America/Chicago';
  const series = cal.seriesStarts({ first: at('2026-11-19', '09:30', chicago), clientZone: chicago, every: 2, count: 6 });
  assert.equal(series.starts.length, 6);
  assert.deepEqual([...new Set(series.starts.map((s) => wallClock(s, chicago).time))], ['09:30']);
  assert.deepEqual(series.starts.map((s) => wallClock(s, LON).date), ['2026-11-19', '2026-12-03', '2026-12-17', '2026-12-31', '2027-01-14', '2027-01-28']);
  assert.deepEqual(cal.seriesStarts({ first: at('2026-11-19', '09:30', chicago), clientZone: chicago }).starts.length, 1);
  const busy = [item('sup', 'Supervision with Maya', '2026-12-17', '16:00', '17:00')];
  assert.deepEqual(cal.seriesClashes(series.starts, 60, { items: busy, coachZone: LON }).map((c) => c.words), ['Thu 17 Dec at 15:30 clashes with Supervision with Maya.']);
  assert.equal(cal.bookCallLabel(6), 'Book 6 calls');
  assert.equal(cal.bookCallLabel(1), 'Book the call');
  assert.deepEqual(cal.suggestionWords(series.starts[0], { coachZone: LON, clientZone: chicago, name: 'Jordan Reyes' }), { when: 'Thu 19 Nov, 15:30', theirs: '9:30 am for Jordan in Chicago' });
  assert.equal(cal.suggestedLengthLine(60, 'Jordan Reyes'), '60 minutes is suggested, from Jordan’s agreement.');
  assert.deepEqual(cal.suggestTimes([0, 15, 30, 60, 75, 600].map((m) => new Date(Date.UTC(2026, 10, 19, 15, m)))).map((d) => d.getUTCHours() * 60 + d.getUTCMinutes()), [900, 960, 1500 - 0].map((x) => x % 1440));
});

test('Book a call: single, series, three-way and group anchoring, and in person with travel time either side', () => {
  const chicago = 'America/Chicago';
  const jordan = { id: 'p-jordan', name: 'Jordan Reyes', time_zone: chicago };
  // A client call is anchored to the client's zone; a three-way or a group to the booker's, or the organisation's main office.
  assert.equal(cal.anchorZone({ client: jordan, coachZone: LON }), chicago);
  assert.equal(cal.anchorZone({ booker: { time_zone: NY }, organisation: { time_zone: 'Europe/Paris' }, coachZone: LON }), NY);
  assert.equal(cal.anchorZone({ organisation: { time_zone: 'Europe/Paris' }, coachZone: LON }), 'Europe/Paris');
  assert.equal(cal.anchorZone({ client: { time_zone: 'EST' }, coachZone: LON }), LON, 'letters are never a zone');
  const { starts } = cal.seriesStarts({ first: at('2026-11-19', '09:30', chicago), clientZone: chicago, every: 2, count: 3 });
  const booked = cal.bookCallPlan({ starts, minutes: 60, zone: chicago, client: jordan, engagementId: 'e1' }, ctx({}, { coachId: ME, invites: true }));
  assert.equal(booked.words, 'Booked. Each call has its own Zoom link and invite.');
  assert.deepEqual(booked.save.map(([t]) => t), ['coach_sessions', 'coach_cal_items', 'coach_sessions', 'coach_cal_items', 'coach_sessions', 'coach_cal_items']);
  const items = booked.save.filter(([t]) => t === 'coach_cal_items').map(([, r]) => r);
  assert.ok(items.every((i) => i.time_zone === chicago && i.kind === 'client_call' && i.profile_id === 'p-jordan' && wallClock(i.starts_at, chicago).time === '09:30'));
  assert.deepEqual(items.map((i) => i.session_id), booked.save.filter(([t]) => t === 'coach_sessions').map(([, r]) => r.id));
  assert.equal(booked.save[0][1].engagement_id, 'e1');
  assert.equal(booked.undo.remove.length, 6);
  // Without Google nothing is promised.
  assert.equal(cal.bookCallPlan({ starts: starts.slice(0, 1), minutes: 60, zone: chicago, client: jordan }, ctx({}, { coachId: ME })).words, 'Booked.');
  // In person, with 30 minutes of travel each way blocked either side.
  const leo = cal.bookCallPlan({ starts: [new Date(at('2026-11-19', '12:00'))], minutes: 60, zone: LON, client: { id: 'p-leo', name: 'Leo Grant' }, placeKind: 'in_person', location: 'Harbour City FC training ground', travelMinutes: 30 }, ctx({}, { coachId: ME }));
  const rows = leo.save.filter(([t]) => t === 'coach_cal_items').map(([, r]) => r);
  assert.deepEqual(rows.map((r) => [r.kind, uk(r.starts_at), uk(r.ends_at)]), [['client_call', '12:00', '13:00'], ['travel', '11:30', '12:00'], ['travel', '13:00', '13:30']]);
  assert.ok(rows.slice(1).every((r) => r.travel_for === rows[0].id));
  assert.equal(leo.save[0][1].place, 'Harbour City FC training ground');
  // A three-way meeting with pasted guests: one item, anchored to the booker's zone, with its guests and no session of its own.
  const three = cal.bookCallPlan({ starts: [new Date(at('2026-11-19', '17:00'))], minutes: 60, zone: NY, title: 'Three-way meeting', kind: 'other', people: cal.invited('Mia Torres <mia@example.invalid>, paul@example.invalid').people }, ctx({}, { coachId: ME }));
  assert.deepEqual(three.save.map(([t]) => t), ['coach_cal_items', 'coach_cal_guests', 'coach_cal_guests']);
  assert.equal(three.save[0][1].time_zone, NY);
  // A group's call has one session for the group.
  const group = cal.bookCallPlan({ starts: [new Date(at('2026-11-20', '16:15'))], minutes: 90, zone: LON, group: { id: 'g1', name: 'Kestrel leadership team' } }, ctx({}, { coachId: ME }));
  assert.deepEqual([group.save[0][1].group_id, group.save[0][1].kind, group.save[1][1].title, group.save[1][1].profile_id], ['g1', 'group', 'Kestrel leadership team', null]);
  assert.equal(cal.bookCallPlan({ starts: [], minutes: 60, zone: LON }, ctx({}, { coachId: ME })).problem, 'Choose a time to carry on.');
});

// ---------------------------------------------------------------- Open for calls

test('Open for calls: blocks made by dragging join when they touch, and never overlap something busy', () => {
  const now = at('2026-11-17', '09:00');
  const data = { openBlocks: [], items: [item('training', 'Training', '2026-11-23', '09:45', '12:00', { kind: 'own_time' }), item('fyi', 'Sale ends', '2026-11-23', '15:00', '15:30', { busy: false })], sessions: [] };
  const c = () => ctx(data, { coachId: ME, now });
  const first = cal.dragOpen({ day: '2026-11-23', fromMin: 14 * 60, toMin: 15 * 60 }, c());
  assert.equal(first.problem, null);
  assert.equal(first.words, 'Open Mon 23 Nov, 14:00 to 15:00.');
  data.openBlocks = [first.save[0][1]];
  // One that touches it joins up: one row, 14:00 to 16:00.
  const second = cal.dragOpen({ day: '2026-11-23', fromMin: 15 * 60, toMin: 16 * 60 }, c());
  assert.deepEqual(second.save.map(([, r]) => [r.id, uk(r.starts_at), uk(r.ends_at)]), [[first.save[0][1].id, '14:00', '16:00']]);
  assert.deepEqual(second.remove, []);
  data.openBlocks = [second.save[0][1]];
  // A third that bridges two blocks joins all three, and the block it swallowed goes.
  const far = cal.dragOpen({ day: '2026-11-23', fromMin: 16 * 60 + 30, toMin: 17 * 60 }, c());
  data.openBlocks.push(far.save[0][1]);
  assert.equal(data.openBlocks.length, 2);
  const bridge = cal.dragOpen({ day: '2026-11-23', fromMin: 15 * 60 + 45, toMin: 16 * 60 + 30 }, c());
  assert.deepEqual([uk(bridge.save[0][1].starts_at), uk(bridge.save[0][1].ends_at), bridge.remove.length], ['14:00', '17:00', 1]);
  assert.equal(bridge.undo.save.length, 2, 'Undo puts both blocks back as they were');
  // It can't overlap something busy; a free item is no obstacle.
  assert.equal(cal.dragOpen({ day: '2026-11-23', fromMin: 11 * 60, toMin: 13 * 60 }, c()).problem, 'That overlaps Training.');
  assert.equal(cal.dragOpen({ day: '2026-11-23', fromMin: 12 * 60, toMin: 13 * 60 }, c()).problem, null);
  // Moving a block onto something busy is refused the same way; moving it clear is saved on its own row.
  const block = data.openBlocks[0];
  const e = view(data, '2026-11-23', '2026-11-23', { showOpen: true }).find((x) => x.type === 'open' && x.block.id === block.id);
  assert.equal(cal.moveEntry(e, { day: '2026-11-23', startMin: 10 * 60 }, c()).problem, 'That overlaps Training.');
  assert.equal(cal.moveEntry(e, { day: '2026-11-24', startMin: 10 * 60 }, c()).save[0][1].id, block.id);
  // Up to 4 weeks ahead (this week and the four after it), and never in the past.
  assert.equal(cal.dragOpen({ day: '2026-12-18', fromMin: 600, toMin: 660 }, c()).problem, null);
  assert.equal(cal.dragOpen({ day: '2026-12-21', fromMin: 600, toMin: 660 }, c()).problem, 'Open times go up to 4 weeks ahead. Choose a nearer week.');
  assert.equal(cal.dragOpen({ day: '2026-11-16', fromMin: 600, toMin: 660 }, c()).problem, 'That time has passed. Choose a later one.');
  // Blocks for different call types don't join.
  const typed = cal.placeOpen({ starts_at: at('2026-11-25', '10:00'), ends_at: at('2026-11-25', '11:00'), call_type_id: 'ct1' }, c());
  data.openBlocks.push(typed.save[0][1]);
  assert.equal(cal.placeOpen({ starts_at: at('2026-11-25', '11:00'), ends_at: at('2026-11-25', '12:00') }, c()).remove.length, 0);
  assert.equal(cal.deleteEntry(e, c()).words, 'Removed');
  assert.equal(cal.openLine(30, 24), 'People book 30-minute calls inside these times, with 24 hours’ notice.');
});

test('Copy last week: the same clock times this week, leaving out what something busy is in the way of', () => {
  const now = at('2026-10-20', '09:00');
  // Last week (19 to 23 Oct, before the UK clocks go back) has two blocks; this week starts Mon 26 Oct, after the change.
  const last = [
    { id: 'a', coach_id: ME, starts_at: at('2026-10-19', '14:00'), ends_at: at('2026-10-19', '16:00'), time_zone: LON, call_type_id: null },
    { id: 'b', coach_id: ME, starts_at: at('2026-10-22', '13:30'), ends_at: at('2026-10-22', '15:00'), time_zone: LON, call_type_id: null },
  ];
  const data = { openBlocks: last, items: [], sessions: [] };
  const copied = cal.copyLastWeek({ monday: '2026-10-26', data, coachZone: LON, coachId: ME, newId, now });
  assert.equal(copied.words, 'Copied from last week.');
  assert.deepEqual(copied.save.map(([, r]) => [wallClock(r.starts_at, LON).date, uk(r.starts_at), uk(r.ends_at)]), [['2026-10-26', '14:00', '16:00'], ['2026-10-29', '13:30', '15:00']]);
  assert.equal(copied.undo.remove.length, 2);
  // Something busy in the way of one: it is left out, and said.
  const busy = { ...data, items: [item('dentist', 'Dentist', '2026-10-26', '15:00', '16:00', { calendar: 'personal' })] };
  const part = cal.copyLastWeek({ monday: '2026-10-26', data: busy, coachZone: LON, coachId: ME, newId, now });
  assert.equal(part.save.length, 1);
  assert.equal(part.words, 'Copied from last week. 1 time was left out, because something is in the way.');
  assert.equal(cal.copyLastWeek({ monday: '2026-11-09', data, coachZone: LON, coachId: ME, newId, now }).problem, 'Last week had no open times to copy.');
});

// ---------------------------------------------------------------- polls and Offer times by email

test('a poll: held times, votes, and choosing the winner releases the rest', () => {
  const starts = [at('2026-11-16', '17:00'), at('2026-11-19', '17:00'), at('2026-11-20', '15:00')].map((t) => new Date(t));
  assert.equal(cal.pollProblem([starts[0]]), 'Pick at least 2 times.');
  assert.equal(cal.pollProblem(new Array(5).fill(0), { adding: true }), 'Up to 5 times in one poll.');
  assert.equal(cal.pollPickWords(0), 'Pick 2 to 5 times');
  assert.equal(cal.pollPickWords(2), '2 picked');
  const people = [{ name: 'Mia Torres', email: 'Mia@example.invalid', profile_id: 'p-mia', time_zone: NY }, { name: 'Paul Garner', email: 'paul@example.invalid' }];
  const made = cal.newPollPlan({ title: 'Three-way meeting', minutes: 60, zone: LON, people, starts }, ctx({}, { coachId: ME }));
  const rows = (table) => made.save.filter(([t]) => t === table).map(([, r]) => r);
  const [poll] = rows('coach_polls');
  const holds = rows('coach_cal_items');
  assert.deepEqual([rows('coach_poll_people').length, rows('coach_poll_options').length, holds.length], [2, 3, 3]);
  assert.ok(holds.every((h) => h.kind === 'hold' && h.title === 'Mia and Paul' && h.busy === true && h.poll_option_id));
  assert.deepEqual(rows('coach_poll_people').map((p) => p.time_zone), [NY, LON]);
  assert.notEqual(rows('coach_poll_people')[0].vote_key, rows('coach_poll_people')[1].vote_key);
  assert.equal(made.words, 'The poll is ready for Mia and Paul. The times stay held.');
  // Held times are dashed on the calendar and count as busy for booking.
  assert.ok(view({ items: holds }, '2026-11-16', '2026-11-20').every((e) => e.colour === 'hold' && e.dashed));
  assert.equal(cal.busySpans({ items: holds, from: at('2026-11-16', '00:00'), to: at('2026-11-21', '00:00') }).length, 3);
  // Votes.
  const [mia, paul] = rows('coach_poll_people');
  const options = rows('coach_poll_options');
  const votes = [[0, mia, true], [0, paul, false], [1, mia, true], [1, paul, true], [2, mia, false], [2, paul, true]].map(([o, p, can]) => ({ option_id: options[o].id, person_id: p.id, can }));
  const table = cal.pollRows({ options, people: [mia, paul], votes, zone: LON });
  assert.deepEqual(table.map((r) => [r.when, r.votes, r.everyone]), [
    ['Mon 16 Nov, 17:00 UK time', 'Mia can, Paul can’t', false], ['Thu 19 Nov, 17:00 UK time', 'Mia can, Paul can. Everyone can', true], ['Fri 20 Nov, 15:00 UK time', 'Mia can’t, Paul can', false],
  ]);
  // "As Mia sees it": her own zone, 12-hour.
  assert.deepEqual(cal.pollTabs([mia, paul], LON).map((t) => t.label), ['Your times', 'As Mia sees it', 'As Paul sees it']);
  assert.equal(cal.pollRows({ options, people: [mia, paul], votes, zone: NY })[0].when, 'Mon 16 Nov, 12:00 pm New York time');
  assert.equal(cal.pollRows({ options, people: [mia, paul], votes: [], zone: LON })[0].votes, 'No answers yet');
  // Confirm Thursday: its held item becomes the call, with both as guests, and the other two held times are released.
  const data = { items: holds, pollOptions: options, polls: [poll], clients: [] };
  const done = cal.confirmPollPlan({ poll, option: options[1], people: [mia, paul] }, ctx(data));
  const item = done.save.find(([t]) => t === 'coach_cal_items')[1];
  assert.deepEqual([item.id, item.kind, item.title, item.poll_option_id], [holds[1].id, 'client_call', 'Three-way meeting', null]);
  assert.deepEqual(done.remove.map(([, id]) => id).sort(), [holds[0].id, holds[2].id].sort());
  assert.deepEqual([done.save.find(([t]) => t === 'coach_polls')[1].status, done.save.filter(([t]) => t === 'coach_cal_guests').length], ['confirmed', 2]);
  assert.equal(done.words, 'Confirmed for Thu 19 Nov. The other times are free again.');
  assert.equal(done.undo.save.filter(([t]) => t === 'coach_cal_items').length, 3, 'Undo holds all three again');
  assert.equal(cal.cancelPollPlan({ poll }, ctx(data)).remove.length, 3);
  // The note asking Mia is drafted in her own zone, with her own link, and never sent.
  const note = cal.pollNote({ person: mia, poll, options, link: 'https://portal.example/poll/abc', coachFirstName: 'Tim' });
  assert.deepEqual([note.email, note.subject], ['mia@example.invalid', 'Times for Three-way meeting']);
  assert.match(note.body, /They are in New York time\.\n\nMon 16 Nov, 12:00 pm\nThu 19 Nov, 12:00 pm\nFri 20 Nov, 10:00 am\n\nTick the ones you can make here: https:\/\/portal\.example\/poll\/abc/);
});

test('Offer times by email: the picked times in the reader’s own zone, copied and never sent', () => {
  const starts = [at('2026-11-18', '16:00'), at('2026-11-16', '12:00'), at('2026-11-17', '01:00')].map((t) => new Date(t));
  const offer = cal.offerTimesText({ starts, minutes: 60, zone: NY });
  assert.equal(offer.text, 'Would any of these work for a 60-minute call? They are in New York time.\nMon 16 Nov, 7:00 am\nMon 16 Nov, 8:00 pm\nWed 18 Nov, 11:00 am');
  assert.equal(offer.words, 'Copied 3 times in New York time.');
  assert.equal(cal.offerTimesText({ starts: starts.slice(0, 1), zone: LON }).words, 'Copied 1 time in UK time.');
  assert.equal(cal.offerTimesText({ starts: [], zone: NY }).problem, 'Pick a free time first.');
  assert.equal(cal.offerCellWords(starts[1], NY), '7:00 am New York');
});

// ---------------------------------------------------------------- Google Calendar

const synced = (row, extra = {}) => { const r = { ...row, google_event_id: `g-${row.id}`, google_synced_at: at('2026-11-16', '09:00'), updated_at: at('2026-11-16', '09:00'), ...extra }; return { ...r, google_etag: cal.syncMark('e1', r) }; };
const event = (row, extra = {}) => ({ ...cal.googleEventFrom(row), id: row.google_event_id, etag: 'e2', updated: at('2026-11-16', '10:00'), ...extra });
const merge = (a) => cal.mergeFromGoogle({ now: at('2026-11-16', '10:05'), coachZone: LON, coachId: ME, newId, ...a });

test('sync: a call moved in Google gets "Moved in Google Calendar", and its session moves with it', () => {
  const jordan = synced(call('jordan', 'Jordan Reyes', '2026-11-17', '09:45', '10:45', { time_zone: 'America/Chicago', session_id: 's1' }));
  const sessions = [{ id: 's1', starts_at: jordan.starts_at, minutes: 60 }];
  // Tim moves it in Google to 16:30 UK time (Google hands times back with an offset, or in the event's own zone).
  const movedEvent = event(jordan, { start: { dateTime: '2026-11-17T16:30:00Z' }, end: { dateTime: '2026-11-17T17:30:00Z' } });
  const out = merge({ items: [jordan], sessions, events: [movedEvent] });
  const next = out.save.find(([t]) => t === 'coach_cal_items')[1];
  assert.deepEqual([next.starts_at, next.ends_at, next.moved_in_google_at, cal.etagOf(next)], [at('2026-11-17', '16:30'), at('2026-11-17', '17:30'), at('2026-11-16', '10:05'), 'e2']);
  assert.equal(cal.changedHere(next), false, 'what Google gave is in step: it is not pushed back');
  assert.equal(next.time_zone, 'America/Chicago', 'the anchor zone is never changed by a sync');
  assert.deepEqual(out.save.find(([t]) => t === 'coach_sessions')[1].starts_at, at('2026-11-17', '16:30'));
  assert.deepEqual(out.moved.map((i) => i.id), ['jordan']);
  const [e] = view({ items: [next], sessions }, '2026-11-17', '2026-11-17');
  assert.equal(e.movedInGoogle, true);
  assert.equal(cal.MOVED_IN_GOOGLE, 'Moved in Google Calendar');
  assert.match(cal.entryLabel(e, LON), /Moved in Google Calendar$/);
  assert.equal(cal.seenMoved(next).moved_in_google_at, null);
  // Read back in the event's own zone and wall clock: the same instant.
  const inZone = merge({ items: [jordan], sessions, events: [event(jordan, { start: { dateTime: '2026-11-17T10:30:00', timeZone: 'America/Chicago' }, end: { dateTime: '2026-11-17T11:30:00', timeZone: 'America/Chicago' } })] });
  assert.equal(inZone.save[0][1].starts_at, at('2026-11-17', '16:30'));
  // Nothing changed (the same tag): nothing to save. Own time moved in Google isn't marked: only calls are.
  assert.deepEqual(merge({ items: [jordan], events: [event(jordan, { etag: 'e1' })] }).save, []);
  const writing = synced(item('writing', 'Writing', '2026-11-18', '09:00', '12:00', { kind: 'writing' }));
  const w = merge({ items: [writing], events: [event(writing, { summary: 'Writing: chapter 4', start: { dateTime: '2026-11-18T10:00:00Z' }, end: { dateTime: '2026-11-18T13:00:00Z' } })] }).save[0][1];
  assert.deepEqual([w.title, w.starts_at, w.moved_in_google_at], ['Writing: chapter 4', at('2026-11-18', '10:00'), null]);
});

test('sync conflicts: Google wins unless the portal’s change is the newer, and nothing changes under an item being edited', () => {
  const base = synced(call('sam', 'Sam Okafor', '2026-11-17', '12:30', '13:30'));
  const inGoogle = (updated) => event(base, { updated, start: { dateTime: '2026-11-17T15:00:00Z' }, end: { dateTime: '2026-11-17T16:00:00Z' } });
  // 1. Only Google changed: Google wins.
  assert.equal(merge({ items: [base], events: [inGoogle(at('2026-11-16', '10:00'))] }).save[0][1].starts_at, at('2026-11-17', '15:00'));
  // 2. Both changed, the portal's later: the portal's stands, nothing is overwritten, and it is what gets pushed.
  const mineLater = { ...base, starts_at: at('2026-11-17', '14:00'), ends_at: at('2026-11-17', '15:00'), updated_at: at('2026-11-16', '10:02') };
  const kept = merge({ items: [mineLater], events: [inGoogle(at('2026-11-16', '10:00'))] });
  assert.deepEqual([kept.save, kept.kept], [[], ['sam']]);
  assert.deepEqual(cal.toPush({ items: [mineLater] }).map((p) => [p.op, p.item.id, p.event.start.dateTime]), [['update', 'sam', '2026-11-17T14:00:00']]);
  // 3. Both changed, Google's later (or a tie): Google wins.
  const mineEarlier = { ...mineLater, updated_at: at('2026-11-16', '09:30') };
  assert.equal(merge({ items: [mineEarlier], events: [inGoogle(at('2026-11-16', '10:00'))] }).save[0][1].starts_at, at('2026-11-17', '15:00'));
  assert.equal(merge({ items: [{ ...mineLater, updated_at: at('2026-11-16', '10:00') }], events: [inGoogle(at('2026-11-16', '10:00'))] }).save[0][1].starts_at, at('2026-11-17', '15:00'));
  // 4. A Google change arriving while the call is being edited: nothing is saved, the page is told, and nothing is pushed.
  const editing = merge({ items: [base], events: [inGoogle(at('2026-11-16', '10:00'))], editingId: 'sam' });
  assert.deepEqual([editing.save, editing.remove], [[], []]);
  assert.deepEqual(editing.conflicts.map((c) => [c.id, c.reason, c.words]), [['sam', 'editing', 'This changed in Google Calendar. Save to keep your version, or close to take the new one.']]);
  assert.deepEqual(cal.toPush({ items: [mineLater], editingId: 'sam' }), []);
  // …once the edit is saved the portal's is the newer, so it stands; left alone, Google's comes in on the next sync.
  assert.deepEqual(merge({ items: [{ ...base, title: 'Sam Okafor (review)', updated_at: at('2026-11-16', '10:06') }], events: [inGoogle(at('2026-11-16', '10:00'))] }).kept, ['sam']);
  assert.equal(merge({ items: [base], events: [inGoogle(at('2026-11-16', '10:00'))] }).save.length, 1);
});

test('sync: a deleted event, a new one made in Google, a repeat, one time of a repeat, and replies', () => {
  const sam = synced(call('sam', 'Sam Okafor', '2026-11-17', '12:30', '13:30', { session_id: 's1' }));
  const travel = cal.travelItems(sam, 30, newId);
  const guests = [{ id: 'g1', item_id: 'sam', email: 'sam@example.invalid', reply: 'none' }];
  const sessions = [{ id: 's1', starts_at: sam.starts_at, minutes: 60 }];
  // Deleted in Google: the item goes with its guests, its travel time and its unwritten session.
  const gone = merge({ items: [sam, ...travel], guests, sessions, events: [{ id: sam.google_event_id, status: 'cancelled', updated: at('2026-11-16', '10:00') }] });
  assert.deepEqual(gone.remove.map(([t]) => t), ['coach_cal_guests', 'coach_cal_items', 'coach_cal_items', 'coach_cal_items', 'coach_sessions']);
  // …unless it was changed here later: then it stays, and is pushed back.
  assert.deepEqual(merge({ items: [{ ...sam, title: 'Sam Okafor (review)', updated_at: at('2026-11-16', '10:03') }], events: [{ id: sam.google_event_id, status: 'cancelled', updated: at('2026-11-16', '10:00') }] }).kept, ['sam']);
  // (a save that changed nothing Google holds doesn't count as a change here)
  assert.equal(merge({ items: [{ ...sam, updated_at: at('2026-11-16', '10:03') }], events: [{ id: sam.google_event_id, status: 'cancelled', updated: at('2026-11-16', '10:00') }] }).remove.length, 1);
  // …and deleted while being edited: the page is told.
  assert.equal(merge({ items: [sam], editingId: 'sam', events: [{ id: sam.google_event_id, status: 'cancelled' }] }).conflicts[0].words, 'This was deleted in Google Calendar. Save to keep it, or close to let it go.');
  // A written-up session is never removed by a sync.
  assert.equal(merge({ items: [sam], sessions: [{ ...sessions[0], outcome: 'held' }], events: [{ id: sam.google_event_id, status: 'cancelled' }] }).remove.some(([t]) => t === 'coach_sessions'), false);
  // A cancelled event the portal never had is nothing.
  assert.deepEqual(merge({ items: [], events: [{ id: 'unknown', status: 'cancelled' }] }).remove, []);
  // Made in Google: it arrives as an item in its own zone, a weekly repeat as a rule; an all-day one as its days.
  const made = merge({ items: [], calendarOf: (e) => (e.calendarId === 'family' ? 'family' : 'work'), events: [
    { id: 'n1', etag: 'a', summary: 'Board call', start: { dateTime: '2026-11-19T09:00:00', timeZone: NY }, end: { dateTime: '2026-11-19T10:00:00', timeZone: NY }, recurrence: ['RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=TH;COUNT=4'] },
    { id: 'n2', etag: 'a', summary: 'Half term', calendarId: 'family', start: { date: '2026-10-26' }, end: { date: '2026-10-31' }, transparency: 'transparent' },
  ] }).save.map(([, r]) => r);
  assert.deepEqual([made[0].title, made[0].time_zone, made[0].starts_at, made[0].repeat_rule, made[0].google_event_id, made[0].kind, made[0].calendar], ['Board call', NY, at('2026-11-19', '09:00', NY), { every: 'week', interval: 2, weekdays: [4], count: 4 }, 'n1', 'other', 'work']);
  assert.deepEqual([made[1].all_day, made[1].starts_on, made[1].ends_on, made[1].busy, made[1].calendar], [true, '2026-10-26', '2026-10-30', false, 'family']);
  // One time of a repeat moved in Google stands in for that time ("this one").
  const training = synced(item('training', 'Training', '2026-11-02', '09:45', '12:00', { repeat_rule: { every: 'week' } }));
  const one = merge({ items: [training], events: [{ id: 'g-training_20261116', etag: 'x', recurringEventId: 'g-training', originalStartTime: { dateTime: '2026-11-16T09:45:00Z' }, summary: 'Training', start: { dateTime: '2026-11-16T13:00:00Z' }, end: { dateTime: '2026-11-16T15:15:00Z' } }] }).save[0][1];
  assert.deepEqual([one.series_id, one.occurrence_on, one.repeat_rule, uk(one.starts_at)], ['training', '2026-11-16', null, '13:00']);
  assert.deepEqual(cal.occurrences([training, one], at('2026-11-16', '00:00'), at('2026-11-17', '00:00')).map((o) => uk(o.startsAt)), ['13:00']);
  // Replies (yes, no, maybe) show on the item.
  const replied = merge({ items: [sam], guests, events: [event(sam, { attendees: [{ email: 'Sam@example.invalid', responseStatus: 'accepted' }] })] });
  assert.equal(replied.save.find(([t]) => t === 'coach_cal_guests')[1].reply, 'yes');
});

test('what is pushed to Google: in the client’s own time zone, with the guests and the Zoom link', () => {
  const jordan = call('jordan', 'Jordan Reyes', '2026-11-17', '09:45', '10:45', { time_zone: 'America/Chicago', meeting_link: 'https://zoom.example/j/77', notes: 'Bring the plan.', updated_at: at('2026-11-16', '09:00') });
  const guests = [{ id: 'g1', item_id: 'jordan', name: 'Jordan Reyes', email: 'jordan@example.invalid' }, { id: 'g2', item_id: 'other', email: 'x@example.invalid' }];
  const event1 = cal.googleEventFrom(jordan, { guests });
  // The invite is made in the client's zone, so their calendar shows the time they agreed to.
  assert.deepEqual(event1.start, { dateTime: '2026-11-17T09:45:00', timeZone: 'America/Chicago' });
  assert.deepEqual(event1.end, { dateTime: '2026-11-17T10:45:00', timeZone: 'America/Chicago' });
  assert.deepEqual(event1.attendees, [{ email: 'jordan@example.invalid', displayName: 'Jordan Reyes' }]);
  assert.equal(event1.location, 'https://zoom.example/j/77');
  assert.match(event1.description, /Join on Zoom: https:\/\/zoom\.example\/j\/77/);
  assert.equal(event1.extendedProperties.private.clarityId, 'jordan');
  // Repeats go as a rule, and read back as the same rule.
  for (const [rule, day] of [[{ every: 'week', interval: 2, weekdays: [1, 2] }, '2026-11-16'], [{ every: 'weekday' }, '2026-11-16'], [{ every: 'month', by: 'weekday' }, '2026-11-17'], [{ every: 'day', count: 5 }, '2026-11-16'], [{ every: 'year', until: '2030-11-16' }, '2026-11-16'], [{ every: 'month', interval: 3 }, '2026-11-16']]) {
    assert.deepEqual(cal.ruleFromRRule([cal.rruleFrom(rule, day)]), rule.by === undefined && rule.every === 'month' ? rule : rule, JSON.stringify(rule));
  }
  assert.equal(cal.rruleFrom({ every: 'week', interval: 2, weekdays: [1, 2] }, '2026-11-16'), 'RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TU');
  assert.equal(cal.rruleFrom({ every: 'month', by: 'weekday' }, '2026-11-17'), 'RRULE:FREQ=MONTHLY;BYDAY=3TU');
  assert.equal(cal.rruleFrom({ every: 'month', by: 'weekday' }, '2026-11-30'), 'RRULE:FREQ=MONTHLY;BYDAY=-1MO');
  assert.equal(cal.ruleFromRRule(['RRULE:FREQ=MONTHLY;BYDAY=1MO,3MO']), null, 'one the portal can’t keep shows once and stays whole in Google');
  assert.equal(cal.ruleFromRRule(['EXDATE:20261116']), null);
  // What to push: new work items are created, changed ones updated, ones in step left alone, personal ones never created from here.
  const inStep = synced(item('a', 'Admin', '2026-11-18', '14:00', '16:00'));
  const changed = { ...synced(item('b', 'Writing', '2026-11-18', '09:00', '12:00')), title: 'Writing: chapter 4', updated_at: at('2026-11-16', '09:30') };
  // A save that changes nothing Google holds (the store restamps updated_at on every save) is never pushed.
  const restamped = { ...synced(item('r', 'Admin', '2026-11-19', '09:00', '10:00')), updated_at: at('2026-11-16', '11:00'), moved_in_google_at: null };
  const personal = item('c', 'Dentist', '2026-11-19', '10:00', '11:00', { calendar: 'personal', updated_at: at('2026-11-16', '09:30') });
  const hold = item('h', 'Mia and Paul', '2026-11-19', '17:00', '18:00', { kind: 'hold', updated_at: at('2026-11-16', '09:30') });
  const push = cal.toPush({ items: [jordan, inStep, changed, restamped, personal, hold], guests });
  assert.deepEqual(push.map((p) => [p.op, p.item.id]), [['create', 'jordan'], ['update', 'b'], ['create', 'h']]);
  assert.equal(push[2].event.status, 'tentative');
  const after = cal.afterPush(jordan, { id: 'g9', etag: 'z' }, at('2026-11-16', '10:00'));
  assert.deepEqual([after.google_event_id, cal.etagOf(after), after.google_synced_at], ['g9', 'z', at('2026-11-16', '10:00')]);
  assert.deepEqual(cal.toPush({ items: [{ ...after, updated_at: at('2026-11-16', '10:01') }] }), []);
  // A guest added afterwards is a change Google needs.
  assert.equal(cal.toPush({ items: [after], guests: [{ id: 'g3', item_id: 'jordan', email: 'new@example.invalid' }] }).length, 1);
  const allDay = cal.googleEventFrom(cal.allDayItem({ id: 'conf', coachId: ME, title: 'Conference', firstDay: '2026-11-23', lastDay: '2026-11-24', zone: LON }));
  assert.deepEqual([allDay.start, allDay.end], [{ date: '2026-11-23' }, { date: '2026-11-25' }]);
});

// ---------------------------------------------------------------- the next-call bar, clock changes

test('the next-call bar and Join on Zoom from real data: from 10 minutes before until 10 minutes in, coral from 5 minutes before', () => {
  const data = WEEK();
  const bar = (now) => { const calls = cal.barCalls({ ...data, groups: [{ id: 'g1', name: 'Kestrel leadership team' }], now, coachZone: LON }); return nextCallBar(callForBar(calls, new Date(now)), new Date(now)); };
  assert.equal(bar(at('2026-11-17', '12:19')), null);
  assert.deepEqual(bar(at('2026-11-17', '12:22')), { name: 'Sam Okafor', words: 'in 8 minutes', coral: false, zoom: 'https://zoom.example/j/1', briefTo: '/coach/sessions/ses-sam', sessionId: 'ses-sam' });
  assert.equal(bar(at('2026-11-17', '12:25')).coral, true);
  assert.equal(bar(at('2026-11-17', '12:30')).words, 'is starting now');
  assert.equal(bar(at('2026-11-17', '12:39')).words, 'started 9 minutes ago');
  assert.equal(bar(at('2026-11-17', '12:41')), null);
  // A session with no calendar item is told too; own time, family items and to-dos never are.
  assert.equal(bar(at('2026-11-17', '16:55')).name, 'Priya Nair');
  assert.equal(bar(at('2026-11-17', '09:40')), null, 'Training is not a call');
  assert.equal(bar(at('2026-11-17', '18:55')), null, 'Parents’ evening is not a call');
  // Only an https address is ever a join link.
  assert.equal(cal.joinLink({ meeting_link: 'javascript:alert(1)' }, { place: 'The Lighthouse café' }), null);
  assert.equal(cal.joinLink({ meeting_link: null }, { place: 'https://zoom.example/j/5' }), 'https://zoom.example/j/5');
});

test('the clock-change week line on Today', () => {
  const tyson = call('tyson', 'Tyson Reed', '2026-10-05', '07:30', '08:30', { time_zone: NY, repeat_rule: { every: 'week' } });
  const local = call('sam', 'Sam Okafor', '2026-10-05', '14:00', '15:00', { repeat_rule: { every: 'week' } });
  const lines = (day) => cal.clockChangeLines({ items: [tyson, local], now: at(day, '08:00'), coachZone: LON });
  // The week before the US clocks go back (the Monday before Sun 1 Nov 2026).
  assert.deepEqual(lines('2026-10-26'), ['US clocks go back on Sunday 1 Nov. Your calls with US clients stay at their usual time for them; for you, Tyson’s Monday call moves from 11:30 to 12:30 UK time from Mon 2 Nov.']);
  assert.equal(lines('2026-10-30').length, 1);
  // The week the UK's own clocks go back: calls with clients elsewhere move for the coach.
  assert.deepEqual(lines('2026-10-19'), ['UK clocks go back on Sunday 25 Oct. Your calls with clients in other time zones stay at their usual time for them; for you, Tyson’s Monday call moves from 12:30 to 11:30 UK time from Mon 26 Oct.']);
  // Clients in two US time zones: the country's clocks change on one day, so it is said once, with both calls (the UI tester, 20 Nov).
  const jordan = call('jordan', 'Jordan Reyes', '2026-10-06', '09:45', '10:45', { time_zone: 'America/Chicago', repeat_rule: { every: 'week' } });
  assert.deepEqual(cal.clockChangeLines({ items: [tyson, jordan, local], now: at('2026-10-27', '08:00'), coachZone: LON }),
    ['US clocks go back on Sunday 1 Nov. Your calls with US clients stay at their usual time for them; for you, Tyson’s Monday call moves from 11:30 to 12:30 UK time from Mon 2 Nov, and Jordan’s Tuesday call moves from 14:45 to 15:45 UK time from Tue 3 Nov.']);
  // No change coming, or no call it moves: nothing is said.
  assert.deepEqual(lines('2026-11-09'), []);
  assert.deepEqual(cal.clockChangeLines({ items: [local], now: at('2026-10-26', '08:00'), coachZone: LON }), []);
});

test('the grid shows 08:00 to 21:00, opened out for what is on it', () => {
  const none = cal.hoursWindow([], { days: ['2026-11-16'], coachZone: LON });
  assert.deepEqual(none, { fromHour: 8, toHour: 21, fromMin: 480, toMin: 1260 });
  const early = cal.calendarEntries({ items: [call('a', 'Early', '2026-11-16', '06:30', '07:15'), call('b', 'Late', '2026-11-17', '21:30', '22:40')] }, { fromDay: '2026-11-16', toDay: '2026-11-17', coachZone: LON });
  assert.deepEqual(cal.hoursWindow(early, { days: ['2026-11-16', '2026-11-17'], coachZone: LON }), { fromHour: 6, toHour: 23, fromMin: 360, toMin: 1380 });
  // A day that isn't showing doesn't open it out; the whole day is midnight to midnight.
  assert.equal(cal.hoursWindow(early, { days: ['2026-11-16'], coachZone: LON }).toHour, 21);
  assert.deepEqual(cal.hoursWindow(early, { days: ['2026-11-16'], coachZone: LON, whole: true }), { fromHour: 0, toHour: 24, fromMin: 0, toMin: 1440 });
  // While the working hours are edited, each handle has an hour of room.
  const hours = { mon: { from: '07:00', to: '21:30' }, tue: null };
  assert.deepEqual(cal.hoursWindow([], { days: ['2026-11-16', '2026-11-17'], coachZone: LON, hours }), { fromHour: 6, toHour: 23, fromMin: 360, toMin: 1380 });
});

test('search finds calendar items by title, person or note, and opens their day', () => {
  const items = [
    { ...call('a', 'Coffee with Dan Reid', '2026-11-18', '12:30', '13:00'), notes: 'Ask about the Brightwater offsite', location: 'The Lighthouse' },
    { ...call('b', 'Training', '2026-10-19', '09:45', '12:00'), repeat_rule: { every: 'week', weekdays: [1, 2] } },
    { ...call('c', 'Mia and Paul', '2026-11-16', '17:00', '18:00'), kind: 'hold' },
    { ...call('d', 'Gone', '2026-11-16', '10:00', '11:00'), removed: true },
  ];
  const found = cal.searchItems({ items, guests: [{ item_id: 'a', name: 'Dana Whitfield', email: 'dana@example.invalid' }], coachZone: LON, todayKey: '2026-11-17' });
  assert.deepEqual(found.map((f) => f.title), ['Coffee with Dan Reid', 'Training']);
  assert.equal(found[0].to, '/coach/calendar?view=day&day=2026-11-18');
  assert.equal(found[0].kind, 'Wed 18 Nov, 12:30');
  assert.match(found[0].also, /Dana Whitfield/);
  assert.match(found[0].also, /Brightwater/);
  // A repeat opens its next time from today.
  assert.equal(found[1].to, '/coach/calendar?view=day&day=2026-11-17');
});

test('every word here follows the writing rules', () => {
  const words = Object.values(cal).flatMap((v) => (typeof v === 'string' ? [v] : v && typeof v === 'object' && !Array.isArray(v) ? Object.values(v).filter((x) => typeof x === 'string') : Array.isArray(v) ? v.map((x) => x?.label).filter((x) => typeof x === 'string') : []));
  assert.ok(words.length > 60);
  for (const w of words) {
    assert.ok(!/\bfail/i.test(w), w);
    assert.ok(!/\bChange\b/.test(w), `"Edit", never "Change": ${w}`);
    assert.ok(!/^Add an? /.test(w), `no "a" or "an" in an Add: ${w}`);
    assert.ok(!/'/.test(w), `the portal’s own apostrophe: ${w}`);
    assert.ok(!/[–—]/.test(w), `no dashes: ${w}`);
    assert.ok(!/\b(color|organiz|canceled)\b/i.test(w), `UK spelling: ${w}`);
  }
  assert.equal(weekdayOf('2026-11-17'), 2);
});
