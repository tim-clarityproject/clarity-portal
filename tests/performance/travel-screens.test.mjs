// The Travel plan's screens (Phase 8b Part B steps 2 and 3; M21 version 7.2):
// what a saved plan becomes on screen (src/lib/travel/model.js), the words
// each screen shows, the airport search, Home's offer and card, and the
// Daily plan's view. Run with npm run test:performance.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  awayOf, chartDayLabels, dayLine, extrasProblem, planKey, stepTime, flightLine, flightProblem, homeProblem, inputFor, keyMomentsFor, momentsInTrip, pastAfterEdit, planFor,
  readoutLines, seenOf, shortSpan, spanWords, stepsShown, tickKey, tidyPlan, travelOffer, travelToday, whyFor, whyShort, zoneNote,
} from '../../src/lib/travel/model.js';
import { searchPlaces } from '../../src/lib/travel/airports.js';
import { tidyState } from '../../src/lib/travel/model.js';

const L = 'Europe/London';
const NY = 'America/New_York';
const place = (city, zone, name = city) => ({ key: zone, code: null, name, city, zone });
const LHR = place('London', L, 'London Heathrow, LHR');
const JFK = place('New York', NY, 'New York JFK');
const DXB = place('Dubai', 'Asia/Dubai', 'Dubai, DXB');

const moment = (id, name, startsOn, more = {}) => ({ id, name, area: 'work', kind: 'perform', startsOn, endsOn: startsOn, placeCity: 'New York', placeZone: NY, repeat: null, lesson: '', shared: false, ...more });
const MOMENTS = [moment('board', 'Harbour board meeting', '2026-11-10'), moment('dinner', 'Investor dinner', '2026-11-09')];
const M21 = tidyPlan({
  id: 'trip',
  flightOut: { id: 'f1', from: LHR, to: JFK, leaves: '2026-11-08T12:00', lands: '2026-11-08T15:00' },
  flightHome: { id: 'f2', from: JFK, to: LHR, leaves: '2026-11-12T19:00', lands: '2026-11-13T07:00' },
  momentIds: ['board'],
  momentTimes: { board: '09:00' },
  usualSleep: { start: '22:30', end: '06:30' },
});

test('M21: a saved plan becomes the 12 days from Thu 5 to Mon 16 Nov, its key moment in New York time', () => {
  const view = planFor(M21, MOMENTS);
  assert.equal(view.days.length, 12);
  assert.equal(spanWords(view.from, view.to), 'Thu 5 to Mon 16 Nov');
  assert.equal(shortSpan(view.from, view.to), '5 to 16 Nov');
  assert.deepEqual(keyMomentsFor(M21, MOMENTS), [{ id: 'board', name: 'Harbour board meeting', startsOn: '2026-11-10', endsOn: '2026-11-10', at: '09:00', city: 'New York', zone: NY }]);
  assert.equal(view.chart.markers.length, 1);
  assert.equal(view.chart.home.label, 'London time, GMT');
  assert.equal(view.chart.away.label, 'New York time, GMT −5');
});

test('M21: each day’s line, the key moment’s on its day', () => {
  const view = planFor(M21, MOMENTS);
  const lines = view.days.map((d) => dayLine(d, view, view.moments));
  assert.deepEqual(lines.slice(0, 4), ['You fly in 3 days.', 'You fly in 2 days.', 'You fly tomorrow.', 'You fly to New York today.']);
  assert.equal(lines[4], 'You’re in New York.');
  assert.equal(lines[5], 'Harbour board meeting is today.');
  assert.equal(lines[6], 'You start moving back to London time.');
  assert.equal(lines[7], 'You fly home today.');
  assert.equal(lines[8], 'You’re back in London.');
  assert.equal(lines[11], 'You’re back to your usual times.');
});

test('M21: zone labels only on the two flight days, and “Times are New York time.” only away', () => {
  const view = planFor(M21, MOMENTS);
  for (const d of view.days) {
    const labelled = d.steps.some((s) => s.showZone);
    assert.equal(labelled, d.date === '2026-11-08' || d.date === '2026-11-12', d.date);
    const note = zoneNote(d, view);
    if (['2026-11-09', '2026-11-10', '2026-11-11'].includes(d.date)) assert.equal(note, 'Times are New York time.');
    else assert.equal(note, null, d.date);
  }
});

test('M21: the read-out leads with the day’s key moments, then where the body clock is; no date', () => {
  const view = planFor(M21, MOMENTS);
  const r = readoutLines(view, 5);
  assert.deepEqual(r.moments, [{ number: 1, words: 'Harbour board meeting, 09:00' }]);
  assert.match(r.clock, /^Body clock ~\d+% adjusted to New York time$/);
  assert.match(readoutLines(view, 9).clock, /^Body clock ~\d+% back on London time$/);
  assert.equal(readoutLines(view, 11).clock, 'Body clock back on London time');
  assert.ok(!/Nov|Thu|Mon/.test(JSON.stringify(r)));
});

test('the flights: a calm line for what’s missing, never a greyed-out button', () => {
  assert.equal(flightProblem({ from: null, to: JFK, leaves: '', lands: '' }), 'Choose where you’re flying from to carry on.');
  assert.equal(flightProblem({ from: LHR, to: JFK, leaves: '', lands: '' }), 'Choose when it leaves to carry on.');
  assert.equal(flightProblem({ from: LHR, to: JFK, leaves: '2026-11-08T12:00', lands: '2026-11-08T06:00' }), 'It lands before it leaves. Check the times to carry on.');
  assert.equal(flightProblem(M21.flightOut), null);
  assert.equal(homeProblem(M21.flightOut, { ...M21.flightHome, leaves: '2026-11-08T13:00', lands: '2026-11-09T01:00' }), 'It leaves before your flight out lands. Check the days to carry on.');
  assert.equal(flightLine(M21.flightOut), 'London to New York, Sun 8 Nov, 12:00');
});

test('key moments: peak moments inside the trip and its city only, each once', () => {
  const inTrip = momentsInTrip([...MOMENTS, moment('later', 'Later', '2026-12-01'), moment('tokyo', 'Tokyo talk', '2026-11-10', { placeCity: 'Tokyo', placeZone: 'Asia/Tokyo' }), moment('weekly', 'Stand-up', '2026-10-05', { repeat: { every: 'week' } })], M21.flightOut, M21.flightHome);
  assert.deepEqual(inTrip.map((o) => `${o.moment.id} ${o.on}`), ['dinner 2026-11-09', 'weekly 2026-11-09', 'board 2026-11-10']);
});

test('key moments: never one kept at home, and zones by their current names (the functionality and break-it testers, 18 Nov)', () => {
  const home = moment('home', 'Call from the kitchen', '2026-11-10', { placeCity: null, placeZone: null });
  assert.deepEqual(momentsInTrip([...MOMENTS, home], M21.flightOut, M21.flightHome).map((o) => o.moment.id), ['dinner', 'board']);
  const DEL = place('Delhi', 'Asia/Kolkata', 'Delhi, DEL');
  const out = { id: 'o', from: LHR, to: DEL, leaves: '2026-11-08T09:00', lands: '2026-11-08T23:00' };
  const back = { id: 'h', from: DEL, to: LHR, leaves: '2026-11-14T03:00', lands: '2026-11-14T08:00' };
  const old = moment('old', 'Pitch', '2026-11-10', { placeCity: 'Calcutta', placeZone: 'Asia/Calcutta' });
  assert.deepEqual(momentsInTrip([old], out, back).map((o) => o.moment.id), ['old'], 'Asia/Calcutta is Asia/Kolkata');
});

test('a key moment added in set-up keeps a day inside the trip, or is asked again (the break-it tester, 18 Nov)', () => {
  const days = ['2026-11-08', '2026-11-09', '2026-11-10'];
  assert.equal(extrasProblem([{ id: 'x', name: 'Keynote', on: '2026-11-09' }], days), null);
  assert.equal(extrasProblem([{ id: 'x', name: '  ', on: '2026-11-09' }], days), 'Type the key moment’s name to carry on.');
  assert.equal(extrasProblem([{ id: 'x', name: '\u200b\u202e', on: '2026-11-09' }], days), 'Type the key moment’s name to carry on.', 'only unseen characters is no name');
  assert.equal(extrasProblem([{ id: 'x', name: 'Keynote', on: '2026-11-20' }], days), 'Choose a day in your trip for “Keynote” to carry on.');
  assert.equal(extrasProblem([{ id: 'x', name: 'Keynote', on: null }], days), 'Choose a day in your trip for “Keynote” to carry on.');
});

test('a step’s time: an untimed key moment reads “All day”, never a city alone (the functionality tester, 18 Nov)', () => {
  assert.deepEqual(stepTime({ kind: 'moment', time: null, showZone: true, city: 'New York' }), { time: 'All day', zone: null });
  assert.deepEqual(stepTime({ kind: 'light', time: '08:00', showZone: true, city: 'New York' }), { time: '08:00', zone: 'New York' });
  assert.deepEqual(stepTime({ kind: 'sleep', time: '23:00', showZone: false, city: 'London' }), { time: '23:00', zone: null });
  const view = planFor(M21, MOMENTS);
  for (const d of view.days) for (const s of d.steps) assert.ok(stepTime(s).time || s.kind !== 'moment', `${d.date} ${s.kind}`);
});

test('the chart’s day labels never touch, the lit one’s neighbours stepping back (the UI tester, 18 Nov)', () => {
  const labels = ['Thu 5', 'Fri 6', 'Sat 7', 'Sun 8', 'Mon 9', 'Tue 10', 'Wed 11', 'Thu 12', 'Fri 13', 'Sat 14', 'Sun 15', 'Mon 16'];
  const phone = 340 - 10 - 14;
  const desk = 680 - 10 - 18;
  const touching = (shown, width) => {
    const at = shown.map((on, i) => (on ? i : null)).filter((i) => i != null);
    const spacing = width / (labels.length - 1);
    return at.some((i, k) => k > 0 && (i - at[k - 1]) * spacing < (labels[i].length + labels[at[k - 1]].length) / 2 * 7);
  };
  for (const lit of [null, ...labels.keys()]) {
    const p = chartDayLabels(labels, lit, phone);
    assert.equal(touching(p, phone), false, `phone, lit ${lit}`);
    if (lit != null) assert.equal(p[lit], true);
    assert.equal(touching(chartDayLabels(labels, lit, desk), desk), false, `desktop, lit ${lit}`);
  }
  assert.deepEqual(chartDayLabels(labels, null, desk), labels.map(() => true), 'every day on a laptop');
  assert.deepEqual(chartDayLabels(labels, 1, phone).slice(0, 5), [false, true, false, false, true], 'Fri 6 lit: Thu 5 and Sat 7 step back');
});

test('a plan’s key: the same plan read back from the tables is known as sent (the break-it tester, 18 Nov)', () => {
  const back = tidyPlan({ ...M21, flightOut: { ...M21.flightOut, from: { ...LHR, code: null, name: 'London' } }, momentTimes: { ...M21.momentTimes } });
  assert.equal(planKey(back), planKey(M21));
  assert.notEqual(planKey({ ...M21, noCaffeine: true }), planKey(M21));
  assert.notEqual(planKey({ ...M21, momentTimes: { board: '10:00' } }), planKey(M21));
});

test('no caffeine: every caffeine step goes from the days, Home and the Why panel', () => {
  const view = planFor(M21, MOMENTS);
  const day = view.days[5];
  assert.ok(day.steps.some((s) => s.kind === 'caffeine'));
  assert.ok(!stepsShown(day.steps, true).some((s) => s.kind === 'caffeine'));
  assert.deepEqual(whyFor(day.steps, false).terms.map((t) => t.term), ['Light', 'Key moment', 'Caffeine', 'Sleep']);
  assert.deepEqual(whyFor(day.steps, true).terms.map((t) => t.term), ['Light', 'Key moment', 'Sleep']);
  const home = travelToday([{ ...M21, noCaffeine: true }], MOMENTS, '2026-11-10');
  assert.ok(!home.steps.some((s) => s.kind === 'caffeine'));
});

test('Home and the Daily plan: today’s steps in time order, never the key moment, during the trip only', () => {
  assert.equal(travelToday([M21], MOMENTS, '2026-11-04'), null);
  assert.equal(travelToday([M21], MOMENTS, '2026-11-17'), null);
  const t = travelToday([M21], MOMENTS, '2026-11-08');
  assert.equal(t.day.line, 'You fly to New York today.');
  assert.deepEqual(t.steps.map((s) => s.kind), ['caffeine', 'light', 'sleep']);
  assert.ok(t.steps.every((s) => s.showZone));
  assert.deepEqual(t.steps.map(tickKey), ['caffeine', 'light', 'sleep']);
  assert.ok(!travelToday([M21], MOMENTS, '2026-11-10').steps.some((s) => s.kind === 'moment'));
});

test('Home’s offer: a week before a peak moment in another time zone, once there’s no plan for it', () => {
  const m = [moment('board', 'Harbour board meeting', '2026-11-10')];
  assert.equal(travelOffer(m, [], '2026-11-02', L), null, 'eight days before');
  const o = travelOffer(m, [], '2026-11-03', L);
  assert.equal(o.action, 'Plan my New York trip');
  assert.equal(o.key, 'travel-offer:board:2026-11-10');
  assert.equal(travelOffer(m, [], '2026-11-03', NY), null, 'the same time zone');
  assert.equal(travelOffer(m, [M21], '2026-11-03', L), null, 'already planned');
  assert.equal(travelOffer([{ ...m[0], placeCity: null, placeZone: null }], [], '2026-11-03', L), null, 'at home');
});

test('editing under way keeps every past day exactly as it was', () => {
  const before = planFor(M21, MOMENTS);
  const past = pastAfterEdit(before, '2026-11-10');
  assert.deepEqual(past.days.map((d) => d.date), ['2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09']);
  const moved = planFor({ ...M21, flightHome: { ...M21.flightHome, leaves: '2026-11-14T19:00', lands: '2026-11-15T07:00' }, past }, MOMENTS);
  for (const d of past.days) assert.deepEqual(moved.days.find((x) => x.date === d.date).steps, d.steps);
  assert.ok(moved.days.length > before.days.length);
  assert.equal(pastAfterEdit(before, '2026-11-01'), null, 'not started yet: made again');
  assert.notEqual(seenOf(inputFor(M21, MOMENTS)), seenOf(inputFor(M21, [moment('board', 'Harbour board meeting', '2026-11-11')])));
});

test('a short trip: its page and its Why panel, “Staying on London time” first', () => {
  const dubai = tidyPlan({
    id: 'dxb',
    flightOut: { id: 'a', from: LHR, to: DXB, leaves: '2026-11-16T21:00', lands: '2026-11-17T07:00' },
    flightHome: { id: 'b', from: DXB, to: LHR, leaves: '2026-11-19T09:00', lands: '2026-11-19T13:00' },
    momentIds: ['key'],
    momentTimes: { key: '14:00' },
    usualSleep: { start: '22:00', end: '06:00' },
  });
  const view = planFor(dubai, [moment('key', 'Keynote', '2026-11-18', { placeCity: 'Dubai', placeZone: 'Asia/Dubai' })]);
  assert.equal(view.short, true);
  assert.equal(view.headline, 'It’s a short trip, so stay on London time.');
  assert.deepEqual(whyShort(view, false).terms.map((t) => t.term), ['Staying on London time', 'Sleep', 'Light', 'Caffeine']);
  assert.equal(whyShort(view, false).terms[0].meaning[1], 'Dubai is 4 hours ahead, so catching up would take most of your trip.');
  assert.ok(view.keyDay.steps.some((s) => s.words === 'Turn the lights out, which is 22:00 in London.'));
  assert.equal(travelToday([dubai], [moment('key', 'Keynote', '2026-11-18', { placeCity: 'Dubai', placeZone: 'Asia/Dubai' })], '2026-11-18').steps.length, 4);
});

test('the away flag a coach may read: where, when and the hours apart, never the steps', () => {
  const a = awayOf(M21, planFor(M21, MOMENTS));
  assert.deepEqual(a, { city: 'New York', zone: NY, startsOn: '2026-11-08', endsOn: '2026-11-12', hoursApart: -5 });
});

test('the airport search: by code, name, city or country; then the cities the time library knows', () => {
  assert.equal(searchPlaces('jfk')[0].name, 'New York JFK');
  assert.deepEqual(searchPlaces('new').slice(0, 3).map((p) => p.code), ['JFK', 'EWR', 'LGA']);
  assert.equal(searchPlaces('lhr')[0].name, 'London Heathrow, LHR');
  assert.ok(searchPlaces('zzz').length === 0);
  assert.ok(searchPlaces('Lisbon').some((p) => p.zone === 'Europe/Lisbon'));
});

test('what the device kept is read so it never stops a page', () => {
  assert.deepEqual(tidyState(null), { plans: {}, ticks: {} });
  const s = tidyState({ plans: { trip: M21, bad: { id: 'other' }, x: 5 }, ticks: { trip: { '2026-11-08': { light: true, 'DROP TABLE': true } } } });
  assert.deepEqual(Object.keys(s.plans), ['trip']);
  assert.deepEqual(s.ticks.trip['2026-11-08'], { light: true });
  assert.equal(tidyPlan({ id: 'p', flightOut: 'nonsense' }).flightOut.from, null);
});

test('a plan or tick kept under a name every object carries is never read as one (the break-it tester, 18 Nov)', () => {
  const raw = JSON.parse('{"plans":{"__proto__":{"id":"__proto__"},"trip":' + JSON.stringify(M21) + '},"ticks":{"__proto__":{"2026-11-08":{"light":true}}}}');
  const s = tidyState(raw);
  assert.deepEqual(Object.keys(s.plans), ['trip']);
  assert.equal(Object.getPrototypeOf(s.plans), Object.prototype);
  assert.equal(Object.hasOwn(s.ticks, '__proto__'), false);
  assert.equal(Object.hasOwn(s.plans.trip, 'refused'), true);
});

test('a trip with no time difference explains itself without "0 hours" (break-it tester, 18 Nov)', async () => {
  const { makeTravelPlan } = await import('../../src/lib/travel/index.js');
  const fl = (departsOn, departsAt, fromCity, fromZone, arrivesOn, arrivesAt, toCity, toZone) => ({ departsOn, departsAt, fromCity, fromZone, arrivesOn, arrivesAt, toCity, toZone });
  const plan = makeTravelPlan({
    flightOut: fl('2026-11-10', '09:00', 'London', L, '2026-11-10', '11:45', 'Lisbon', 'Europe/Lisbon'),
    flightHome: fl('2026-11-15', '19:00', 'Lisbon', 'Europe/Lisbon', '2026-11-15', '21:45', 'London', L),
    keyMoments: [],
  });
  assert.equal(plan.sameTime, true);
  const why = JSON.stringify(whyShort(plan, false));
  assert.doesNotMatch(why, /0 hours|Staying on/);
  assert.match(why, /No time difference/);
});
