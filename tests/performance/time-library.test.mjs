// The portal's one time library (src/lib/time; time-zone-safeguards.md,
// Tim, 10 Nov 2026). Every test the safeguards list asks for, plus Phoenix,
// Kolkata, St John's and Auckland across a full year of clock changes.
// Run with npm run test:performance.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isZone, mustBeZone, zoneLabel, zonePlace, zoneCountry, usesTwelveHour,
  wallClock, offsetMinutes, instantAt, dayIn, addDays, savedTime, savedTimeAt, readSavedTime,
  clockWords, timeWords, dayWords, whenWords, bothWords, sessionWhenWords,
  seriesRule, seriesCalls, nextCall,
  onQuarterHour, nextQuarterHour, clearOfOthers, sociable, bookingProblem, offeredStarts,
  clockChanges, callsThatMove, clockChangeLine,
  publicHolidayOn, publicHolidayFor, holidayLine,
  morningOf, inTheMorning, dayBeforeReminderAt, hourBeforeReminderAt, nextLeadingIdeasAt,
} from '../../src/lib/time/index.js';

const UK = 'Europe/London';
const NY = 'America/New_York';
const iso = (d) => d.toISOString();

// ---------------------------------------------------------------- zones
test('a zone is a place name: offsets and letters are never zones', () => {
  for (const z of [UK, NY, 'America/Phoenix', 'Asia/Kolkata', 'America/St_Johns', 'Pacific/Auckland', 'America/Indiana/Knox', 'UTC']) assert.equal(isZone(z), true, z);
  for (const z of ['EST', 'EDT', 'PST', 'BST', 'IST', 'CST', 'GMT', '-05:00', '+01:00', 'UTC+1', 'GMT-5', 'Etc/GMT+5', '', null, 5, 'New York', 'Nowhere/Place']) assert.equal(isZone(z), false, String(z));
  assert.throws(() => mustBeZone('EST'), /place-name/);
  assert.throws(() => savedTime(new Date(), '-05:00'), /place-name/);
});

test('zones are written as a city or country, never letters', () => {
  assert.equal(zoneLabel(NY), 'New York time');
  assert.equal(zoneLabel(UK), 'UK time');
  assert.equal(zoneLabel('America/Chicago'), 'Chicago time');
  assert.equal(zoneLabel('Australia/Sydney'), 'Sydney time');
  assert.equal(zoneLabel('America/Los_Angeles'), 'Los Angeles time');
  assert.equal(zoneLabel('Asia/Kolkata'), 'India time');
  assert.equal(zonePlace('America/St_Johns'), 'St John’s');
  assert.equal(zoneLabel('America/Phoenix'), 'Phoenix time');
  assert.equal(zoneLabel('America/Argentina/Buenos_Aires'), 'Buenos Aires time');
  for (const z of [NY, UK, 'Asia/Kolkata', 'Australia/Sydney']) assert.doesNotMatch(timeWords(new Date('2026-07-01T12:00:00Z'), z), /\b(EST|EDT|BST|GMT|IST|AEST|AEDT|UTC)\b/);
});

test('US and Canadian readers get 12-hour times; everyone else 24-hour', () => {
  for (const z of [NY, 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Phoenix', 'Pacific/Honolulu', 'America/Anchorage', 'America/Toronto', 'America/Vancouver', 'America/St_Johns', 'America/Regina', 'America/Halifax']) assert.equal(usesTwelveHour(z), true, z);
  for (const z of [UK, 'Europe/Paris', 'Asia/Kolkata', 'Australia/Sydney', 'Pacific/Auckland', 'America/Mexico_City', 'America/Sao_Paulo']) assert.equal(usesTwelveHour(z), false, z);
  const at = instantAt('2026-11-09', '07:30', NY);
  assert.equal(timeWords(at, NY), '7:30 am New York time');
  assert.equal(timeWords(at, UK), '12:30 UK time');
  assert.equal(clockWords(instantAt('2026-11-09', '12:05', NY), NY), '12:05 pm');
  assert.equal(clockWords(instantAt('2026-11-09', '00:15', NY), NY), '12:15 am');
  assert.equal(clockWords(instantAt('2026-11-09', '15:00', 'America/Toronto'), 'America/Toronto'), '3:00 pm');
  assert.equal(clockWords(instantAt('2026-11-09', '00:15', UK), UK), '00:15');
  assert.equal(zoneCountry(NY), 'US');
  assert.equal(zoneCountry('America/Toronto'), 'CA');
  assert.equal(zoneCountry(UK), 'GB');
  assert.equal(zoneCountry('America/Mexico_City'), null);
});

// ---------------------------------------------------------------- saving
test('a time is saved as a UTC instant with its anchor zone’s place name, never an offset', () => {
  const saved = savedTimeAt('2026-10-26', '07:30', NY);
  assert.deepEqual(saved, { at: '2026-10-26T11:30:00.000Z', zone: NY });
  assert.doesNotMatch(JSON.stringify(saved), /[+-]\d\d:\d\d/);
  const back = readSavedTime(saved);
  assert.equal(wallClock(back.at, back.zone).time, '07:30');
  assert.throws(() => readSavedTime({ at: '2026-10-26T07:30:00-04:00', zone: NY }), /UTC instant/);
  assert.throws(() => readSavedTime({ at: '2026-10-26T11:30:00.000Z', zone: 'EDT' }), /place-name/);
  assert.throws(() => readSavedTime({ at: '2026-10-26T11:30:00.000Z', zone: '-04:00' }), /place-name/);
});

test('times are never rounded to the hour: half-hour and 45-minute zones', () => {
  assert.equal(offsetMinutes(new Date('2026-06-01T00:00:00Z'), 'Asia/Kolkata'), 330);
  assert.equal(offsetMinutes(new Date('2026-01-15T00:00:00Z'), 'America/St_Johns'), -210);
  assert.equal(offsetMinutes(new Date('2026-07-15T00:00:00Z'), 'America/St_Johns'), -150);
  assert.equal(offsetMinutes(new Date('2026-06-01T00:00:00Z'), 'Asia/Kathmandu'), 345);
  assert.equal(offsetMinutes(new Date('2026-06-01T00:00:00Z'), 'Australia/Adelaide'), 570);
  assert.equal(offsetMinutes(new Date('2026-01-01T00:00:00Z'), 'Australia/Adelaide'), 630);
  const kolkata = instantAt('2026-11-09', '09:15', 'Asia/Kolkata');
  assert.equal(iso(kolkata), '2026-11-09T03:45:00.000Z');
  assert.equal(timeWords(kolkata, UK), '03:45 UK time');
  assert.equal(timeWords(instantAt('2026-11-09', '09:15', 'Asia/Kathmandu'), UK), '03:30 UK time');
});

test('a wall-clock time the clocks skip or repeat still has one instant', () => {
  // New York, 8 Mar 2026: 02:30 doesn't exist; it is the same moment as 03:30.
  assert.equal(iso(instantAt('2026-03-08', '02:30', NY)), '2026-03-08T07:30:00.000Z');
  assert.equal(wallClock(instantAt('2026-03-08', '02:30', NY), NY).time, '03:30');
  // New York, 1 Nov 2026: 01:30 happens twice; the first one is used.
  assert.equal(iso(instantAt('2026-11-01', '01:30', NY)), '2026-11-01T05:30:00.000Z');
  // The UK, 25 Oct 2026: 01:30 happens twice.
  assert.equal(iso(instantAt('2026-10-25', '01:30', UK)), '2026-10-25T00:30:00.000Z');
  // The UK, 29 Mar 2026: 01:30 doesn't exist.
  assert.equal(wallClock(instantAt('2026-03-29', '01:30', UK), UK).time, '02:30');
});

// ---------------------------------------------------------------- Tim's tests
test('a New York client’s recurring Monday 07:30 call keeps 07:30 New York time through 25 Oct and 1 Nov 2026, while Tim’s time moves 12:30, 11:30, 12:30', () => {
  const rule = seriesRule({ every: 1, weekday: 1, time: '07:30', zone: NY, from: '2026-10-19' });
  const calls = seriesCalls(rule, { from: new Date('2026-10-18T00:00:00Z'), to: new Date('2026-11-04T00:00:00Z') });
  assert.deepEqual(calls.map((c) => c.date), ['2026-10-19', '2026-10-26', '2026-11-02']);
  assert.deepEqual(calls.map((c) => wallClock(c.at, NY).time), ['07:30', '07:30', '07:30']);
  assert.deepEqual(calls.map((c) => wallClock(c.at, UK).time), ['12:30', '11:30', '12:30']);
  assert.deepEqual(calls.map((c) => bothWords(c.at, UK, NY)), [
    '12:30 UK time · 7:30 am New York time',
    '11:30 UK time · 7:30 am New York time',
    '12:30 UK time · 7:30 am New York time',
  ]);
  // The same series through the March changes: 3 weeks at 11:30.
  const march = seriesCalls(rule, { from: new Date('2027-03-01T00:00:00Z'), to: new Date('2027-04-06T00:00:00Z') });
  assert.deepEqual(march.map((c) => `${c.date} ${wallClock(c.at, UK).time} ${wallClock(c.at, NY).time}`), [
    '2027-03-01 12:30 07:30', '2027-03-08 12:30 07:30', '2027-03-15 11:30 07:30', '2027-03-22 11:30 07:30', '2027-03-29 12:30 07:30', '2027-04-05 12:30 07:30',
  ]);
});

test('an every-other-week series is a rule in the anchor zone, not a list of instants', () => {
  const rule = seriesRule({ every: 2, time: '07:30', zone: NY, from: '2026-10-19' });
  assert.equal(rule.weekday, 1);
  assert.equal('at' in rule, false);
  const calls = seriesCalls(rule, { from: new Date('2026-10-01T00:00:00Z'), to: new Date('2026-12-01T00:00:00Z') });
  assert.deepEqual(calls.map((c) => c.date), ['2026-10-19', '2026-11-02', '2026-11-16', '2026-11-30']);
  assert.ok(calls.every((c) => wallClock(c.at, NY).time === '07:30'));
  assert.equal(nextCall(rule, new Date('2026-11-03T00:00:00Z')).date, '2026-11-16');
  assert.throws(() => seriesRule({ time: '07:30', zone: 'EST', from: '2026-10-19' }), /place-name/);
  assert.equal(seriesCalls({ ...rule, until: '2026-11-02' }, { from: new Date('2026-10-01T00:00:00Z'), to: new Date('2026-12-01T00:00:00Z') }).length, 2);
});

// Each client keeps their own 09:00 every week of a year; the UK time is
// checked on both sides of every clock change that year, theirs and the UK's.
const YEAR = { from: new Date('2026-01-01T00:00:00Z'), to: new Date('2027-01-01T00:00:00Z') };
const ukTimesThroughTheYear = (zone, time = '09:00') => {
  const rule = seriesRule({ every: 1, time, zone, from: '2026-01-05' });
  const calls = seriesCalls(rule, YEAR);
  assert.ok(calls.length >= 51, `${zone}: ${calls.length} calls`);
  assert.ok(calls.every((c) => wallClock(c.at, zone).time === time), `${zone}: the client's time never moves`);
  const runs = [];
  for (const c of calls) {
    const uk = wallClock(c.at, UK).time;
    if (!runs.length || runs[runs.length - 1].uk !== uk) runs.push({ uk, from: c.date });
  }
  return runs.map((r) => `${r.from} ${r.uk}`);
};

test('Phoenix (never changes): the UK time moves only when the UK’s clocks do', () => {
  assert.equal(clockChanges('America/Phoenix', YEAR.from, 366).length, 0);
  // 09:00 Phoenix is 16:00 UK in winter and 17:00 in UK summer time.
  assert.deepEqual(ukTimesThroughTheYear('America/Phoenix'), ['2026-01-05 16:00', '2026-03-30 17:00', '2026-10-26 16:00']);
});

test('Sydney (southern hemisphere): the gap to the UK swings 2 hours across the year', () => {
  // 09:00 Sydney: 22:00 UK the day before in the UK winter (11 hours), 23:00
  // in the weeks only one has changed (10), 00:00 the same day in UK summer (9).
  assert.deepEqual(ukTimesThroughTheYear('Australia/Sydney'), ['2026-01-05 22:00', '2026-03-30 23:00', '2026-04-06 00:00', '2026-10-05 23:00', '2026-10-26 22:00']);
  assert.deepEqual(clockChanges('Australia/Sydney', YEAR.from, 366).map((c) => `${c.date} ${c.direction}`), ['2026-04-05 back', '2026-10-04 forward']);
});

test('Kolkata (5½ hours, never changes): the UK time is on the half hour, and moves with the UK', () => {
  assert.equal(clockChanges('Asia/Kolkata', YEAR.from, 366).length, 0);
  assert.deepEqual(ukTimesThroughTheYear('Asia/Kolkata'), ['2026-01-05 03:30', '2026-03-30 04:30', '2026-10-26 03:30']);
});

test('St John’s (3½ hours, changes on the North American dates): right on both sides of every change', () => {
  // 09:00 St John's is 12:30 UK, except while only one country has changed: 11:30.
  assert.deepEqual(ukTimesThroughTheYear('America/St_Johns'), ['2026-01-05 12:30', '2026-03-09 11:30', '2026-03-30 12:30', '2026-10-26 11:30', '2026-11-02 12:30']);
  assert.deepEqual(clockChanges('America/St_Johns', YEAR.from, 366).map((c) => `${c.date} ${c.direction}`), ['2026-03-08 forward', '2026-11-01 back']);
});

test('Auckland (southern hemisphere, its own dates): right on both sides of every change', () => {
  // 09:00 Auckland: 20:00 UK the day before (13 hours ahead) in the UK winter,
  // 21:00 while only the UK has changed (12), 22:00 in UK summer (11).
  assert.deepEqual(ukTimesThroughTheYear('Pacific/Auckland'), ['2026-01-05 20:00', '2026-03-30 21:00', '2026-04-06 22:00', '2026-09-28 21:00', '2026-10-26 20:00']);
  assert.deepEqual(clockChanges('Pacific/Auckland', YEAR.from, 366).map((c) => `${c.date} ${c.direction}`), ['2026-04-05 back', '2026-09-27 forward']);
});

test('New York and the UK: the clocks don’t change together', () => {
  assert.deepEqual(clockChanges(UK, YEAR.from, 366).map((c) => `${c.date} ${c.direction}`), ['2026-03-29 forward', '2026-10-25 back']);
  assert.deepEqual(clockChanges(NY, YEAR.from, 366).map((c) => `${c.date} ${c.direction}`), ['2026-03-08 forward', '2026-11-01 back']);
  assert.deepEqual(ukTimesThroughTheYear(NY, '07:30'), ['2026-01-05 12:30', '2026-03-09 11:30', '2026-03-30 12:30', '2026-10-26 11:30', '2026-11-02 12:30']);
});

test('a Sydney Monday-morning call shows both days', () => {
  const at = instantAt('2026-11-16', '08:00', 'Australia/Sydney');
  assert.equal(bothWords(at, 'Australia/Sydney', UK), 'Mon 16 Nov, 08:00 Sydney time (Sun 15 Nov, 21:00 UK time)');
  assert.equal(bothWords(at, UK, 'Australia/Sydney'), 'Sun 15 Nov, 21:00 UK time (Mon 16 Nov, 08:00 Sydney time)');
  // The same day for both: one day at most, both clocks.
  const ny = instantAt('2026-11-09', '07:30', NY);
  assert.equal(bothWords(ny, UK, NY), '12:30 UK time · 7:30 am New York time');
  assert.equal(bothWords(ny, UK, NY, { withDay: true }), 'Mon 9 Nov, 12:30 UK time · 7:30 am New York time');
  assert.equal(bothWords(ny, UK, UK), '12:30 UK time');
});

test('dates are written in words, never numbers', () => {
  const at = instantAt('2026-11-03', '10:00', UK);
  assert.equal(dayWords(at, UK), 'Tue 3 Nov');
  assert.equal(dayWords(at, UK, { year: true }), 'Tue 3 Nov 2026');
  assert.equal(whenWords(at, NY), 'Tue 3 Nov, 5:00 am New York time');
  assert.doesNotMatch(whenWords(at, UK), /\d+\/\d+/);
  const now = new Date('2026-11-10T15:00:00Z');
  assert.equal(sessionWhenWords(instantAt('2026-11-11', '10:00', 'America/Chicago'), 'America/Chicago', now), 'tomorrow, Wed 11 Nov, at 10:00 am Chicago time');
  assert.equal(sessionWhenWords(instantAt('2026-11-10', '15:30', UK), UK, now), 'today at 15:30 UK time');
  assert.equal(sessionWhenWords(instantAt('2026-11-16', '08:00', 'Australia/Sydney'), 'Australia/Sydney', now), 'on Mon 16 Nov at 08:00 Sydney time');
});

// ---------------------------------------------------------------- booking
test('every start falls on a quarter hour in the client’s time, and no two bookings sit within 15 minutes of each other', () => {
  // A 20-minute call at 09:00 ends at 09:20: the next can start at 09:45 at the earliest.
  const at = (time) => instantAt('2026-11-12', time, UK);
  const twenty = [{ start: at('09:00'), end: at('09:20') }];
  assert.equal(clearOfOthers(at('09:30'), 20, twenty), false);
  assert.equal(clearOfOthers(at('09:35'), 20, twenty), true);
  assert.equal(bookingProblem({ start: at('09:35'), minutes: 20, clientZone: UK, bookings: twenty }), 'quarter');
  assert.equal(bookingProblem({ start: at('09:30'), minutes: 20, clientZone: UK, bookings: twenty }), 'gap');
  assert.equal(bookingProblem({ start: at('09:45'), minutes: 20, clientZone: UK, bookings: twenty }), null);
  // A 60-minute session at 10:00: the next call can start at 11:15 at the earliest.
  const sixty = [{ start: at('10:00'), end: at('11:00') }];
  assert.equal(bookingProblem({ start: at('11:00'), minutes: 40, clientZone: UK, bookings: sixty }), 'gap');
  assert.equal(bookingProblem({ start: at('11:15'), minutes: 40, clientZone: UK, bookings: sixty }), null);
  // And before it: a 40-minute call must end by 09:45.
  assert.equal(bookingProblem({ start: at('09:15'), minutes: 40, clientZone: UK, bookings: sixty }), 'gap');
  assert.equal(bookingProblem({ start: at('09:00'), minutes: 40, clientZone: UK, bookings: sixty }), null);

  // Every start offered on a busy day keeps both rules.
  const bookings = [{ start: at('09:00'), end: at('09:20') }, { start: at('10:00'), end: at('11:00') }, { start: at('14:30'), end: at('15:10') }];
  const starts = offeredStarts({ day: '2026-11-12', minutes: 40, clientZone: UK, bookings });
  assert.ok(starts.length > 10);
  for (const s of starts) {
    assert.equal(wallClock(s, UK).minute % 15, 0, iso(s));
    const end = s.getTime() + 40 * 60000;
    for (const b of bookings) assert.ok(end + 15 * 60000 <= b.start.getTime() || s.getTime() >= b.end.getTime() + 15 * 60000, `${iso(s)} is within 15 minutes of ${iso(b.start)}`);
  }
  assert.ok(!starts.some((s) => ['09:30', '11:00', '14:00', '15:15'].includes(wallClock(s, UK).time)));
  assert.ok(starts.some((s) => wallClock(s, UK).time === '11:15'));
  assert.ok(starts.some((s) => wallClock(s, UK).time === '15:30'));
});

test('quarter hours are the client’s own: a half-hour or 45-minute zone still gets :00, :15, :30, :45', () => {
  const kolkata = offeredStarts({ day: '2026-11-12', minutes: 40, clientZone: 'Asia/Kolkata', earlyAndLate: true });
  assert.equal(kolkata.length, 96);
  assert.ok(kolkata.every((s) => wallClock(s, 'Asia/Kolkata').minute % 15 === 0));
  // 09:15 India time is 03:45 UK time: on the client's quarter hour, and on the UK's too.
  assert.equal(onQuarterHour(instantAt('2026-11-12', '09:15', 'Asia/Kolkata'), 'Asia/Kolkata'), true);
  // Nepal is 5¾ hours ahead: a UK quarter hour is not always Nepal's.
  const ukTen = instantAt('2026-11-12', '10:00', UK);
  assert.equal(wallClock(ukTen, 'Asia/Kathmandu').time, '15:45');
  assert.equal(onQuarterHour(instantAt('2026-11-12', '10:05', UK), 'Asia/Kathmandu'), false);
  assert.equal(onQuarterHour(new Date(ukTen.getTime() + 1000), UK), false);
  assert.equal(wallClock(nextQuarterHour(instantAt('2026-11-12', '09:21', UK), UK), UK).time, '09:30');
  assert.equal(wallClock(nextQuarterHour(instantAt('2026-11-12', '09:30', UK), UK), UK).time, '09:30');
});

test('only 07:00 to 20:00 in the booker’s own time is offered, unless they choose "Show early and late times"', () => {
  // Tim's free 09:00 UK slot is 04:00 in New York: not offered to a New York booker.
  const nine = instantAt('2026-11-12', '09:00', UK);
  assert.equal(wallClock(nine, NY).time, '04:00');
  assert.equal(sociable(nine, NY), false);
  assert.equal(bookingProblem({ start: nine, minutes: 20, clientZone: NY, bookerZone: NY }), 'early-late');
  assert.equal(bookingProblem({ start: nine, minutes: 20, clientZone: NY, bookerZone: NY, earlyAndLate: true }), null);
  const open = [{ start: instantAt('2026-11-12', '09:00', UK), end: instantAt('2026-11-12', '17:00', UK) }];
  const forNy = offeredStarts({ day: '2026-11-12', minutes: 20, clientZone: NY, bookerZone: NY, open });
  assert.ok(forNy.length > 0);
  assert.ok(forNy.every((s) => wallClock(s, NY).time >= '07:00' && wallClock(s, NY).time <= '20:00'));
  assert.equal(wallClock(forNy[0], NY).time, '07:00');
  const all = offeredStarts({ day: '2026-11-12', minutes: 20, clientZone: NY, bookerZone: NY, open, earlyAndLate: true });
  assert.equal(wallClock(all[0], NY).time, '04:00');
  assert.ok(all.length > forNy.length);
  // 20:00 itself is offered; 20:15 is not.
  assert.equal(sociable(instantAt('2026-11-12', '20:00', NY), NY), true);
  assert.equal(sociable(instantAt('2026-11-12', '20:15', NY), NY), false);
  assert.equal(sociable(instantAt('2026-11-12', '06:45', NY), NY), false);
});

test('offered starts respect a day with a clock change and "not before"', () => {
  const day = offeredStarts({ day: '2026-10-25', minutes: 20, clientZone: UK, earlyAndLate: true });
  assert.equal(day.length, 100); // a 25-hour day
  assert.equal(new Set(day.map(iso)).size, 100);
  const spring = offeredStarts({ day: '2026-03-29', minutes: 20, clientZone: UK, earlyAndLate: true });
  assert.equal(spring.length, 92); // a 23-hour day
  const later = offeredStarts({ day: '2026-11-12', minutes: 20, clientZone: UK, notBefore: instantAt('2026-11-12', '13:05', UK) });
  assert.equal(wallClock(later[0], UK).time, '13:15');
});

// ---------------------------------------------------------------- clock changes
test('the clock changes coming up in the next 7 days, and which calls move for Tim', () => {
  const series = [
    { name: 'Tyson', rule: { every: 1, weekday: 1, time: '07:30', zone: NY, from: '2026-09-07' } },
    { name: 'Priya', rule: { every: 1, weekday: 3, time: '14:00', zone: 'Asia/Kolkata', from: '2026-09-09' } },
    { name: 'Dana', rule: { every: 1, weekday: 2, time: '10:00', zone: UK, from: '2026-09-08' } },
  ];
  // The Monday before the US change (Sun 1 Nov): the UK changed the day before, on Sun 25 Oct.
  const monday = instantAt('2026-10-26', '08:00', UK);
  assert.deepEqual(clockChanges(NY, monday, 7).map((c) => [c.date, c.direction, c.minutes]), [['2026-11-01', 'back', 60]]);
  assert.deepEqual(clockChanges(UK, monday, 7), []);
  assert.deepEqual(clockChanges('Asia/Kolkata', monday, 7), []);
  const moves = callsThatMove({ coachZone: UK, series, from: monday, days: 7 });
  assert.deepEqual(moves.map((m) => [m.name, m.was, m.now]), [['Tyson', '11:30', '12:30']]);
  assert.equal(clockChangeLine({ coachZone: UK, change: moves[0].change, moves }), 'US clocks go back on Sunday 1 Nov. Your calls with US clients stay at their usual time for them; for you, Tyson’s Monday call moves from 11:30 to 12:30 UK time this week.');

  // The Monday before the UK change (Sun 25 Oct): calls anchored outside the UK move for Tim, UK ones don't.
  const before = instantAt('2026-10-19', '08:00', UK);
  const ukMoves = callsThatMove({ coachZone: UK, series, from: before, days: 7 });
  assert.deepEqual(ukMoves.map((m) => [m.name, m.was, m.now]).sort(), [['Priya', '09:30', '08:30'], ['Tyson', '12:30', '11:30']]);
  assert.ok(!ukMoves.some((m) => m.name === 'Dana'));
  // A quiet week: nothing.
  assert.deepEqual(callsThatMove({ coachZone: UK, series, from: instantAt('2026-11-09', '08:00', UK), days: 7 }), []);
});

// ---------------------------------------------------------------- holidays
test('a public holiday in the client’s country is found before a booking is confirmed', async () => {
  const thanksgiving = await publicHolidayOn('2026-11-26', 'US');
  assert.equal(thanksgiving?.name, 'Thanksgiving Day');
  assert.equal(holidayLine(thanksgiving), 'That’s Thanksgiving in the US.');
  assert.equal((await publicHolidayOn('2026-07-03', 'US'))?.name.startsWith('Independence Day'), true); // observed, 4 July is a Saturday
  assert.equal((await publicHolidayOn('2026-07-01', 'CA'))?.name, 'Canada Day');
  assert.equal(holidayLine(await publicHolidayOn('2026-07-01', 'CA')), 'That’s Canada Day in Canada.');
  assert.ok(await publicHolidayOn('2026-12-25', 'GB'));
  // UK bank holidays differ by nation, so some need the nation: England's summer bank holiday isn't Scotland's.
  assert.equal((await publicHolidayOn('2026-08-31', 'GB', 'ENG'))?.name, 'Summer bank holiday');
  assert.equal(await publicHolidayOn('2026-08-31', 'GB', 'SCT'), null);
  assert.equal(await publicHolidayOn('2026-11-26', 'GB'), null);
  assert.equal(await publicHolidayOn('2026-11-12', 'US'), null);
  assert.equal(await publicHolidayOn('2026-11-26', null), null);
  // From a call's instant and the client's zone: 08:00 in New York on Thanksgiving.
  assert.equal((await publicHolidayFor(instantAt('2026-11-26', '08:00', NY), NY))?.name, 'Thanksgiving Day');
  // Late on Wednesday in Los Angeles is already Thursday in the UK: it is the client's day that counts.
  assert.equal(await publicHolidayFor(instantAt('2026-11-25', '18:00', 'America/Los_Angeles'), 'America/Los_Angeles'), null);
});

// ---------------------------------------------------------------- reminders
test('reminders for a client in Los Angeles arrive between 07:00 and 09:00 Los Angeles time', () => {
  const LA = 'America/Los_Angeles';
  // A session a week, at 10:00 Los Angeles time, for a whole year.
  const calls = seriesCalls({ every: 1, time: '10:00', zone: LA, from: '2026-01-05' }, YEAR);
  assert.ok(calls.length >= 51);
  for (const c of calls) {
    const at = dayBeforeReminderAt(c.at, LA);
    const w = wallClock(at, LA);
    assert.ok(w.time >= '07:00' && w.time <= '09:00', `${c.date}: ${w.time}`);
    assert.equal(inTheMorning(at, LA), true);
    assert.equal(w.date, addDays(c.date, -1));
  }
  // By UK clocks that is 15:00 (14:00 or 16:00 while only one country has changed), never the UK morning.
  assert.equal(wallClock(dayBeforeReminderAt(calls[0].at, LA), UK).time, '15:00');
  // The session's day is the reader's own: a Sydney Monday 08:00 call is reminded on Sunday morning, Sydney time.
  const syd = instantAt('2026-11-16', '08:00', 'Australia/Sydney');
  assert.equal(whenWords(dayBeforeReminderAt(syd, 'Australia/Sydney'), 'Australia/Sydney'), 'Sun 15 Nov, 07:00 Sydney time');
  assert.equal(inTheMorning(morningOf('2026-11-15', 'Australia/Sydney'), UK), false);
  assert.equal(hourBeforeReminderAt(syd).getTime(), syd.getTime() - 3600000);
});

test('Leading Ideas goes at 07:00 on Thursday in each client’s own time', () => {
  const now = new Date('2026-11-10T12:00:00Z'); // a Tuesday
  for (const zone of [UK, NY, 'America/Los_Angeles', 'Australia/Sydney', 'Asia/Kolkata']) {
    const at = nextLeadingIdeasAt(zone, now);
    const w = wallClock(at, zone);
    assert.equal(`${w.date} ${w.time} ${w.weekday}`, '2026-11-12 07:00 4', zone);
  }
  // Already past 07:00 on Thursday there: the next Thursday.
  assert.equal(wallClock(nextLeadingIdeasAt('Australia/Sydney', new Date('2026-11-11T21:00:00Z')), 'Australia/Sydney').date, '2026-11-19');
});

// ---------------------------------------------------------------- today
test('"today" for a client is their own day: Los Angeles and Sydney at the same instant', () => {
  const now = new Date('2026-11-11T07:30:00Z');
  assert.equal(dayIn('America/Los_Angeles', now), '2026-11-10'); // 23:30 on Tuesday
  assert.equal(dayIn(UK, now), '2026-11-11');
  assert.equal(dayIn('Australia/Sydney', now), '2026-11-11'); // 18:30 on Wednesday
  // Just after midnight in Sydney it is still the day before in the UK and Los Angeles.
  const sydneyMidnight = instantAt('2026-11-12', '00:05', 'Australia/Sydney');
  assert.equal(dayIn('Australia/Sydney', sydneyMidnight), '2026-11-12');
  assert.equal(dayIn(UK, sydneyMidnight), '2026-11-11');
  assert.equal(dayIn('America/Los_Angeles', sydneyMidnight), '2026-11-11');
  // The roll-over is at the client's own midnight, to the minute.
  assert.equal(dayIn('America/Los_Angeles', instantAt('2026-11-10', '23:59', 'America/Los_Angeles')), '2026-11-10');
  assert.equal(dayIn('America/Los_Angeles', new Date(instantAt('2026-11-10', '23:59', 'America/Los_Angeles').getTime() + 60000)), '2026-11-11');
});
