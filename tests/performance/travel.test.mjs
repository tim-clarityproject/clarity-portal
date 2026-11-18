// The Travel plan's engine (Phase 8b Part B step 1; M21 version 7.2).
// The worked example is M21's own hand-written London to New York table
// (Thu 5 to Mon 16 Nov 2026), compared day by day and step by step within
// 30 minutes; docs/travel-plan-method.md lists every difference and why.
// Run with npm run test:performance.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeTravelPlan, replanFrom, shortTrip, RULES } from '../../src/lib/travel/index.js';
import { addDays, clockChanges, daysBetween, instantAt, wallClock } from '../../src/lib/time/index.js';

const L = 'Europe/London';
const NY = 'America/New_York';
const DXB = 'Asia/Dubai';
const f = (departsOn, departsAt, fromCity, fromZone, arrivesOn, arrivesAt, toCity, toZone) => ({ departsOn, departsAt, fromCity, fromZone, arrivesOn, arrivesAt, toCity, toZone });
const HOUR = 3600000;

// ------------------------------------------------------------ M21's trip
const M21_MOMENTS = [
  { id: 'dinner', name: 'Your investor dinner', startsOn: '2026-11-09', at: '19:30', city: 'New York', zone: NY },
  { id: 'board', name: 'Your Harbour board meeting', startsOn: '2026-11-10', at: '09:00', city: 'New York', zone: NY },
  { id: 'lunch', name: 'Your lunch with Meridian Capital', startsOn: '2026-11-11', at: '12:30', city: 'New York', zone: NY },
];
// M21's example person's check-in: 22:30 to 06:30 (the Check screen, the
// sleep panel and the notes; the brief's "22:30 to 07:00" doesn't fit the
// mock-up's own "get up at 07:00" after going to bed 30 minutes late).
const M21 = {
  flightOut: f('2026-11-08', '12:00', 'London', L, '2026-11-08', '15:00', 'New York', NY),
  flightHome: f('2026-11-12', '19:00', 'New York', NY, '2026-11-13', '07:00', 'London', L),
  usualSleep: { start: '22:30', end: '06:30' },
  keyMoments: M21_MOMENTS,
};

// M21's DAYS and steps (M21-spec 6.1 and 6.2), verbatim times. `zone` is
// the per-row label M21 draws on the two travel days.
const MOCK = [
  { date: '2026-11-05', clock: -0.4, readout: 'Body clock ~10% adjusted to New York time', light: '19:00', caffeine: '14:00', sleep: '23:00', wake: '07:00' },
  { date: '2026-11-06', clock: -1.0, readout: 'Body clock ~20% adjusted to New York time', light: '19:00', caffeine: '14:30', sleep: '23:30', wake: '07:30' },
  { date: '2026-11-07', clock: -1.8, readout: 'Body clock ~35% adjusted to New York time', light: '19:00', caffeine: '15:30', sleep: '00:30' },
  { date: '2026-11-08', clock: -2.7, readout: 'Body clock ~55% adjusted to New York time', light: '15:30', lightZone: 'New York', caffeine: '12:30', caffeineZone: 'London', sleep: '21:30', sleepZone: 'New York' },
  { date: '2026-11-09', clock: -3.5, readout: 'Body clock ~70% adjusted to New York time', light: '14:00', caffeine: '13:00', sleep: '22:30' },
  { date: '2026-11-10', clock: -4.2, readout: 'Body clock ~85% adjusted to New York time', light: '07:00', caffeine: '13:30', sleep: '22:30' },
  { date: '2026-11-11', clock: -3.9, readout: 'Body clock ~80% adjusted to New York time', light: '06:45', caffeine: '12:30', sleep: '21:30' },
  { date: '2026-11-12', clock: -3.0, readout: 'Body clock ~40% back on London time', light: '05:30', lightZone: 'New York', caffeine: '11:00', caffeineZone: 'New York', sleep: 'On board' },
  { date: '2026-11-13', clock: -2.1, readout: 'Body clock ~60% back on London time', light: '10:00', caffeine: '14:00', sleep: '23:00' },
  { date: '2026-11-14', clock: -1.2, readout: 'Body clock ~75% back on London time', light: '09:00', caffeine: '13:30', sleep: '22:30' },
  { date: '2026-11-15', clock: -0.5, readout: 'Body clock ~90% back on London time', light: '08:00', caffeine: '13:30', sleep: '22:30' },
  { date: '2026-11-16', clock: 0, readout: 'Body clock back on London time', light: '07:30', caffeine: '13:30', sleep: '22:30' },
];

// Where the engine and M21 differ by design (docs/travel-plan-method.md):
// on Sun 8 M21 labels the last caffeine "12:30 London", but 9 hours before a
// 21:30 New York bedtime is 12:30 New York time (on the plane, with the watch
// already on New York time). The clock reading is the same; the label isn't.
const KNOWN_ZONE_DIFFERENCES = new Set(['2026-11-08 caffeine']);

const minutesOf = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
function apart(a, b) {
  const d = Math.abs(minutesOf(a) - minutesOf(b)) % 1440;
  return Math.min(d, 1440 - d);
}

test('M21: the worked example runs Thu 5 to Mon 16 Nov, 12 days', () => {
  const plan = makeTravelPlan(M21);
  assert.equal(plan.short, false);
  assert.equal(plan.from, '2026-11-05');
  assert.equal(plan.to, '2026-11-16');
  assert.equal(plan.days.length, 12);
  assert.deepEqual(plan.days.map((d) => d.label), ['Thu 5', 'Fri 6', 'Sat 7', 'Sun 8', 'Mon 9', 'Tue 10', 'Wed 11', 'Thu 12', 'Fri 13', 'Sat 14', 'Sun 15', 'Mon 16']);
  assert.equal(plan.home.city, 'London');
  assert.equal(plan.away.city, 'New York');
  assert.equal(plan.direction, 'west');
  assert.equal(plan.difference, -5);
});

test('M21: every step is within 30 minutes of the mock-up', () => {
  const plan = makeTravelPlan(M21);
  const worst = { light: 0, caffeine: 0, sleep: 0, wake: 0 };
  plan.days.forEach((day, i) => {
    const mock = MOCK[i];
    assert.equal(day.date, mock.date);
    const of = (kind) => day.steps.find((s) => s.kind === kind);
    for (const kind of ['light', 'caffeine']) {
      const s = of(kind);
      const d = apart(s.time, mock[kind]);
      worst[kind] = Math.max(worst[kind], d);
      assert.ok(d <= 30, `${day.title} ${kind}: ${s.time} against M21's ${mock[kind]}`);
      const label = mock[`${kind}Zone`] || null;
      if (!KNOWN_ZONE_DIFFERENCES.has(`${day.date} ${kind}`)) assert.equal(s.showZone ? s.city : null, label, `${day.title} ${kind} zone label`);
    }
    const sleep = of('sleep');
    if (mock.sleep === 'On board') {
      assert.equal(sleep.label, 'On board');
      assert.equal(sleep.time, null);
      assert.equal(sleep.showZone, false);
    } else {
      const d = apart(sleep.time, mock.sleep);
      worst.sleep = Math.max(worst.sleep, d);
      assert.ok(d <= 30, `${day.title} sleep: ${sleep.time} against M21's ${mock.sleep}`);
      assert.equal(sleep.showZone ? sleep.city : null, mock.sleepZone || null, `${day.title} sleep zone label`);
    }
    if (mock.wake) {
      const d = apart(sleep.wake, mock.wake);
      worst.wake = Math.max(worst.wake, d);
      assert.ok(d <= 30, `${day.title} wake: ${sleep.wake} against M21's ${mock.wake}`);
    }
  });
  // The worst differences, as docs/travel-plan-method.md reports them.
  assert.deepEqual(worst, { light: 30, caffeine: 30, sleep: 30, wake: 30 });
});

test('M21: the steps match exactly where the rules and the mock-up agree', () => {
  const plan = makeTravelPlan(M21);
  const at = (date, kind) => plan.days.find((d) => d.date === date).steps.find((s) => s.kind === kind);
  assert.equal(at('2026-11-05', 'light').words, 'Keep the lights bright until bedtime.');
  assert.equal(at('2026-11-05', 'sleep').words, 'Go to bed 30 minutes later than usual, and get up at 07:00.');
  assert.equal(at('2026-11-05', 'caffeine').words, 'Have your last caffeine by 14:00.');
  assert.equal(at('2026-11-08', 'light').time, '15:30');
  assert.equal(at('2026-11-08', 'light').words, 'Get daylight from landing until dark.');
  assert.match(at('2026-11-08', 'sleep').words, /^Stay awake on the flight, and go to bed at /);
  assert.match(at('2026-11-09', 'light').words, /^Keep the light low until 09:00, then get daylight from /);
  assert.equal(at('2026-11-09', 'sleep').words, 'Go to bed at 22:30, and rest in the dark if you wake early.');
  assert.equal(at('2026-11-10', 'light').words, 'Get daylight as soon as it’s light.');
  assert.equal(at('2026-11-11', 'sleep').words, 'Go to bed an hour earlier than usual.');
  assert.match(at('2026-11-11', 'light').words, /dim the lights from 19:00\.$/);
  assert.equal(at('2026-11-12', 'caffeine').time, '11:00');
  assert.equal(at('2026-11-12', 'sleep').words, 'Sleep as soon as you can after take-off.');
  assert.equal(at('2026-11-13', 'light').words, 'Wear sunglasses until 10:00, then get daylight until 14:00.');
  assert.equal(at('2026-11-14', 'light').words, 'Keep the light low until 09:00, then get daylight until 13:00.');
  assert.equal(at('2026-11-14', 'sleep').words, 'Go to bed at your usual 22:30.');
  assert.equal(at('2026-11-16', 'light').time, '07:30');
  assert.equal(at('2026-11-16', 'light').words, 'Get daylight as soon as it’s light.');
});

test('M21: the body clock and its % read-out stay within 10 points of the mock-up', () => {
  const plan = makeTravelPlan(M21);
  plan.days.forEach((day, i) => {
    const mock = MOCK[i];
    const share = (c) => Math.round((-c / 5) * 100);
    assert.ok(Math.abs(share(day.clock) - share(mock.clock)) <= 12, `${day.title}: ${day.clock} against ${mock.clock}`);
    const num = (s) => (/~(\d+)%/.exec(s) || [0, /back on|on New York/.test(s) ? 100 : 0])[1] * 1;
    assert.ok(Math.abs(num(day.readout) - num(mock.readout)) <= 10, `${day.title}: "${day.readout}" against "${mock.readout}"`);
    assert.match(day.readout, /^Body clock (~\d+% adjusted to New York time|~\d+% back on London time|on New York time|back on London time)$/);
    assert.equal(day.percent % 5, 0);
  });
  assert.equal(plan.days[11].readout, 'Body clock back on London time');
  // Partial: a short stay never quite reaches New York time.
  assert.ok(Math.max(...plan.days.map((d) => d.percent)) < 100);
});

test('M21: steps are in time order, key moments in their own city’s time, before a step at the same time', () => {
  const plan = makeTravelPlan(M21);
  const kinds = (date) => plan.days.find((d) => d.date === date).steps.map((s) => `${s.time || s.label} ${s.kind}`);
  assert.deepEqual(kinds('2026-11-11').slice(1), ['12:30 moment', '12:30 caffeine', '21:30 sleep']);
  assert.deepEqual(kinds('2026-11-10').slice(1), ['09:00 moment', '13:30 caffeine', '22:30 sleep']);
  assert.ok(kinds('2026-11-10')[0].endsWith('light'));
  assert.deepEqual(kinds('2026-11-12').map((k) => k.split(' ').pop()), ['light', 'caffeine', 'sleep']);
  assert.equal(kinds('2026-11-12')[2], 'On board sleep');
  assert.deepEqual(kinds('2026-11-07').map((k) => k.split(' ').pop()), ['caffeine', 'light', 'sleep']); // 00:30 sleep sorts after 19:00
  for (const day of plan.days) {
    const counts = day.steps.reduce((n, s) => ({ ...n, [s.kind]: (n[s.kind] || 0) + 1 }), {});
    assert.equal(counts.light, 1, day.title);
    assert.equal(counts.caffeine, 1, day.title);
    assert.equal(counts.sleep, 1, day.title);
  }
  const board = plan.days.find((d) => d.date === '2026-11-10').steps.find((s) => s.kind === 'moment');
  assert.equal(board.words, 'Your Harbour board meeting starts.');
  assert.equal(board.zone, NY);
  assert.equal(board.number, 2);
});

test('M21: two-zone days label every time, other days none', () => {
  const plan = makeTravelPlan(M21);
  for (const day of plan.days) {
    const travel = day.date === '2026-11-08' || day.date === '2026-11-12';
    assert.equal(day.twoZones, travel, day.title);
    for (const s of day.steps) if (!s.onBoard) assert.equal(s.showZone, travel, `${day.title} ${s.kind}`);
  }
  assert.deepEqual(plan.days[3].places.map((p) => p.city), ['London', 'New York']);
  assert.equal(plan.days[4].city, 'New York');
});

test('M21: the chart has both zones’ levels, every day’s clock and numbered markers', () => {
  const { chart, days } = makeTravelPlan(M21);
  assert.equal(chart.home.label, 'London time, GMT');
  assert.equal(chart.away.label, 'New York time, GMT −5');
  assert.equal(chart.home.level, 0);
  assert.equal(chart.away.level, -5);
  assert.equal(chart.points.length, 12);
  assert.deepEqual(chart.points.map((p) => p.clock), days.map((d) => d.clock));
  assert.deepEqual(chart.markers.map((m) => [m.number, m.name, m.dayIndex, m.time]), [
    [1, 'Your investor dinner', 4, '19:30'], [2, 'Your Harbour board meeting', 5, '09:00'], [3, 'Your lunch with Meridian Capital', 6, '12:30'],
  ]);
  assert.deepEqual(chart.points.filter((p) => p.moment).map((p) => p.label), ['Mon 9', 'Tue 10', 'Wed 11']);
});

test('never a "sharpest hours" band, and never bright light in the 3 hours before the body’s wake time', () => {
  const plans = [makeTravelPlan(M21), makeTravelPlan(DUBAI), makeTravelPlan(STOPS), makeTravelPlan(CLOCK_CHANGE), makeTravelPlan(TOKYO)];
  for (const plan of plans) {
    assert.doesNotMatch(JSON.stringify(plan), /sharp/i);
    for (const day of plan.days) {
      const light = day.steps.find((s) => s.kind === 'light');
      if (!light.bright) continue;
      const from = Date.parse(light.bright.from);
      const to = Date.parse(light.bright.to);
      assert.ok(to >= from, `${plan.away.city} ${day.title}`);
      for (const k of [-1, 0, 1]) {
        const wake = Date.parse(light.bodyWake) + k * 24 * HOUR;
        const banned = [wake - RULES.noLightBeforeWake * HOUR, wake];
        assert.ok(to <= banned[0] || from >= banned[1], `${plan.away.city} ${day.title}: bright light ${light.bright.from} to ${light.bright.to} is in the 3 hours before the body's wake time`);
      }
    }
  }
});

// ------------------------------------------------------------ a trip east
const DUBAI = {
  flightOut: f('2026-11-15', '09:00', 'London', L, '2026-11-15', '19:00', 'Dubai', DXB),
  flightHome: f('2026-11-20', '08:00', 'Dubai', DXB, '2026-11-20', '12:00', 'London', L),
  keyMoments: [{ id: 'k', name: 'Your keynote', startsOn: '2026-11-17', at: '14:00', city: 'Dubai', zone: DXB }],
};

test('a trip east: London to Dubai, 5 nights, keynote on day 3', () => {
  const plan = makeTravelPlan(DUBAI);
  assert.equal(plan.short, false);
  assert.equal(plan.direction, 'east');
  assert.equal(plan.difference, 4);
  assert.equal(plan.nights, 5);
  assert.equal(plan.from, '2026-11-12');
  // Before the flight the sleep moves earlier, about an hour a day.
  const beds = plan.days.slice(0, 3).map((d) => d.steps.find((s) => s.kind === 'sleep').time);
  assert.deepEqual(beds, ['22:30', '21:30', '20:30']); // usual 23:00 (no check-in)
  assert.match(plan.days[0].steps.find((s) => s.kind === 'sleep').words, /earlier than usual/);
  // East: at most 1 hour a day.
  for (let i = 1; i < plan.days.length; i += 1) assert.ok(Math.abs(plan.days[i].engine.clock - plan.days[i - 1].engine.clock) <= RULES.eastRate + 1e-9 || plan.days[i].engine.clock < plan.days[i - 1].engine.clock);
  // The evening landing keeps the light low (evening light would pull the clock back).
  assert.equal(plan.days[3].steps.find((s) => s.kind === 'light').words, 'Keep the light low from landing until bedtime.');
  // The keynote: Tue 17, 14:00 Dubai time, numbered 1.
  const day = plan.days.find((d) => d.date === '2026-11-17');
  const keynote = day.steps.find((s) => s.kind === 'moment');
  assert.equal(keynote.time, '14:00');
  assert.equal(keynote.zone, DXB);
  assert.equal(plan.chart.markers[0].dayIndex, plan.days.indexOf(day));
  assert.ok(day.percent >= 80, `Tue 17 is ${day.percent}%`);
  // Back on London time at the end, never past it.
  assert.equal(plan.days.at(-1).readout, 'Body clock back on London time');
  assert.ok(plan.days.every((d) => d.clock >= 0 && d.clock <= 4));
  assert.equal(plan.chart.away.label, 'Dubai time, GMT +4');
});

// ------------------------------------------------------------ short trips
const SHORT = {
  flightOut: f('2026-11-17', '08:00', 'London', L, '2026-11-17', '18:00', 'Dubai', DXB),
  flightHome: f('2026-11-19', '09:00', 'Dubai', DXB, '2026-11-19', '13:00', 'London', L),
  usualSleep: { start: '22:00', end: '06:00' },
  keyMoments: [{ id: 'k', name: 'Your keynote', startsOn: '2026-11-18', at: '14:00', city: 'Dubai', zone: DXB }],
};

test('a short trip (2 nights): M21’s Dubai keynote page, word for word', () => {
  const plan = makeTravelPlan(SHORT);
  assert.equal(plan.short, true);
  assert.equal(plan.reason, 'nights');
  assert.equal(plan.headline, 'It’s a short trip, so stay on London time.');
  assert.deepEqual(plan.days, []);
  assert.equal(plan.chart, null);
  assert.equal(plan.keyDay.title, 'Wed 18 Nov');
  assert.equal(plan.keyDay.city, 'Dubai');
  assert.deepEqual(plan.keyDay.steps.map((s) => [s.time, s.words, s.kind]), [
    ['02:00', 'Turn the lights out, which is 22:00 in London.', 'sleep'],
    ['10:00', 'Get up, which is 06:00 in London.', 'sleep'],
    ['12:00', 'Get daylight from now, not first thing.', 'light'],
    ['14:00', 'Your keynote starts, which is 10:00 in London.', 'moment'],
    ['17:00', 'Have your last caffeine by 17:00.', 'caffeine'],
  ]);
  assert.doesNotMatch(JSON.stringify(plan), /sharp/i);
});

test('a 2-hour trip is short too, however long it is', () => {
  const input = {
    flightOut: f('2026-11-10', '08:00', 'London', L, '2026-11-10', '13:30', 'Athens', 'Europe/Athens'),
    flightHome: f('2026-11-20', '15:00', 'Athens', 'Europe/Athens', '2026-11-20', '17:00', 'London', L),
  };
  assert.deepEqual(shortTrip(input), { short: true, reason: 'difference', nights: 10, difference: 2 });
  const plan = makeTravelPlan(input);
  assert.equal(plan.short, true);
  assert.equal(plan.keyDay.date, '2026-11-11'); // no key moment: the first full day away
  const bed = plan.keyDay.steps.find((s) => s.kind === 'sleep');
  assert.equal(bed.words, 'Turn the lights out, which is 23:00 in London.');
  assert.equal(bed.time, '01:00');
  // 3 hours is not short.
  assert.equal(shortTrip({ ...input, flightOut: f('2026-11-10', '08:00', 'London', L, '2026-11-10', '14:00', 'Moscow', 'Europe/Moscow'), flightHome: f('2026-11-20', '15:00', 'Moscow', 'Europe/Moscow', '2026-11-20', '17:00', 'London', L) }).short, false);
});

// ------------------------------------------------------------ several stops
const STOPS = {
  flightOut: f('2027-01-17', '11:00', 'London', L, '2027-01-17', '14:05', 'New York', NY),
  legs: [
    f('2027-01-19', '10:00', 'New York', NY, '2027-01-19', '12:05', 'St Louis', 'America/Chicago'),
    f('2027-01-22', '08:30', 'St Louis', 'America/Chicago', '2027-01-22', '11:40', 'Pittsburgh', NY),
    f('2027-01-26', '13:15', 'Pittsburgh', NY, '2027-01-26', '14:55', 'Charlotte', NY),
  ],
  flightHome: f('2027-01-29', '18:30', 'Charlotte', NY, '2027-01-30', '07:10', 'London', L),
  keyMoments: [{ id: 'stl', name: 'Your St Louis review', startsOn: '2027-01-20', at: '09:00', city: 'St Louis', zone: 'America/Chicago' }],
};

test('a trip with several stops follows the place with most nights; each moment in its own city’s time', () => {
  const plan = makeTravelPlan(STOPS);
  assert.deepEqual(plan.stops.map((s) => [s.city, s.nights]), [['New York', 2], ['St Louis', 3], ['Pittsburgh', 4], ['Charlotte', 3]]);
  assert.equal(plan.away.city, 'Pittsburgh');
  assert.equal(plan.nights, 12);
  assert.equal(plan.chart.away.label, 'Pittsburgh time, GMT −5');
  // The New York to St Louis day has both zones, labelled.
  const hop = plan.days.find((d) => d.date === '2027-01-19');
  assert.equal(hop.twoZones, true);
  assert.deepEqual(hop.places.map((p) => p.city), ['New York', 'St Louis']);
  // A day in St Louis is on St Louis's clock, and the moment there too.
  const stl = plan.days.find((d) => d.date === '2027-01-20');
  assert.equal(stl.zone, 'America/Chicago');
  const review = stl.steps.find((s) => s.kind === 'moment');
  assert.equal(review.time, '09:00');
  assert.equal(review.zone, 'America/Chicago');
  // Pittsburgh to Charlotte is the same zone: not a two-zone day.
  assert.equal(plan.days.find((d) => d.date === '2027-01-26').twoZones, false);
  // Flies home from the last stop, overnight, and ends back on London time.
  assert.equal(plan.days.find((d) => d.date === '2027-01-29').steps.find((s) => s.kind === 'sleep').label, 'On board');
  assert.equal(plan.days.at(-1).readout, 'Body clock back on London time');
});

// ------------------------------------------------------------ clock changes
// The brief's trip: the UK clocks go back on Sun 25 Oct 2026, the US clocks on Sun 1 Nov.
const CLOCK_CHANGE = {
  flightOut: f('2026-10-24', '12:00', 'London', L, '2026-10-24', '15:00', 'New York', NY),
  flightHome: f('2026-10-29', '19:00', 'New York', NY, '2026-10-30', '07:00', 'London', L),
};
const dayOf = (plan, date) => plan.days.find((d) => d.date === date);
const sleepOf = (day) => day.steps.find((s) => s.kind === 'sleep');

test('a trip over a clock change: the UK goes back on 25 Oct, so New York is 4 hours behind until 1 Nov', () => {
  const plan = makeTravelPlan(CLOCK_CHANGE);
  // The changes come from src/lib/time's clockChanges, for every zone of the trip.
  const uk = clockChanges(L, new Date('2026-10-19T00:00:00Z'), 14)[0];
  assert.deepEqual(plan.clockChanges.map((c) => [c.city, c.date, c.direction]), [['London', '2026-10-25', 'back'], ['New York', '2026-11-01', 'back']]);
  assert.equal(plan.clockChanges[0].at, uk.at.toISOString());
  const sat = dayOf(plan, '2026-10-24');
  const sun = dayOf(plan, '2026-10-25');
  assert.equal(sat.difference, -5);
  assert.equal(sun.difference, -4);
  // The body keeps true time: London's clocks going back an hour leaves the
  // body an hour nearer London's new time, and from there it closes half the
  // gap to New York (it isn't left an hour past where it really is).
  const rebased = sat.engine.clock + 1;
  assert.ok(Math.abs(sun.engine.clock - (rebased + RULES.follow * (sun.difference - rebased))) < 1e-9, `Sun 25's body clock is ${sun.engine.clock}`);
  assert.equal(sun.readout, 'Body clock ~75% adjusted to New York time');
  // Same usual bedtime on New York's clock either side of the change.
  assert.equal(sleepOf(sun).time, '23:00');
  assert.equal(sleepOf(dayOf(plan, '2026-10-26')).time, '23:00');
  // Sat 24 goes later (west): evening daylight from landing, not low light.
  assert.equal(sat.steps.find((s) => s.kind === 'light').words, 'Get daylight from landing until dark.');
  // Back in London, its evening steps are on London's clock, and the plan ends back on London time.
  assert.equal(sleepOf(dayOf(plan, '2026-10-31')).time, '23:00');
  assert.equal(plan.days.at(-1).readout, 'Body clock back on London time');
});

// A body clock fully on the away time stays there when either side's clocks change.
const LONG_NY = {
  flightOut: f('2026-10-10', '12:00', 'London', L, '2026-10-10', '15:00', 'New York', NY),
  flightHome: f('2026-11-05', '19:00', 'New York', NY, '2026-11-06', '07:00', 'London', L),
};

test('a clock change at home moves the body clock against home time; one away moves only the target', () => {
  const plan = makeTravelPlan(LONG_NY);
  const sat = dayOf(plan, '2026-10-24');
  const sun = dayOf(plan, '2026-10-25');
  // Fully on New York time before the UK change, and still on it after (it was an hour past it without the rebase).
  assert.ok(Math.abs(sat.engine.clock - -5) < 0.05, `Sat 24: ${sat.engine.clock}`);
  assert.ok(Math.abs(sun.engine.clock - -4) < 0.05, `Sun 25: ${sun.engine.clock}`);
  assert.equal(sun.readout, 'Body clock on New York time');
  // The US change on 1 Nov is away: the body doesn't jump, it starts to follow New York's new time.
  const oct31 = dayOf(plan, '2026-10-31');
  const nov1 = dayOf(plan, '2026-11-01');
  assert.equal(nov1.difference, -5);
  assert.ok(Math.abs(nov1.engine.clock - (oct31.engine.clock + RULES.follow * (-5 - oct31.engine.clock))) < 1e-9);
  // Bed on New York's clock stays 23:00 either side of both changes.
  for (const date of ['2026-10-24', '2026-10-25', '2026-11-02']) assert.equal(sleepOf(dayOf(plan, date)).time, '23:00', date);
});

test('a clock change at home, the other way round: New York home, the US change on 1 Nov', () => {
  const plan = makeTravelPlan({
    flightOut: f('2026-10-12', '19:00', 'New York', NY, '2026-10-13', '07:00', 'London', L),
    flightHome: f('2026-11-08', '12:00', 'London', L, '2026-11-08', '15:00', 'New York', NY),
  });
  assert.equal(plan.direction, 'east');
  const oct24 = dayOf(plan, '2026-10-24');
  const oct25 = dayOf(plan, '2026-10-25');
  const oct31 = dayOf(plan, '2026-10-31');
  const nov1 = dayOf(plan, '2026-11-01');
  // The UK change is away: London goes from 5 to 4 hours ahead; the body (on London time) doesn't jump.
  assert.equal(oct24.difference, 5);
  assert.equal(oct25.difference, 4);
  assert.ok(Math.abs(oct25.engine.clock - oct24.engine.clock) <= RULES.westRate + 1e-9);
  // The US change is at home: New York's clocks go back, so the same body reads an hour more ahead of them.
  assert.equal(nov1.difference, 5);
  assert.ok(Math.abs(oct31.engine.clock - 4) < 0.05, `Oct 31: ${oct31.engine.clock}`);
  assert.ok(Math.abs(nov1.engine.clock - 5) < 0.05, `Nov 1: ${nov1.engine.clock}`);
  assert.equal(nov1.readout, 'Body clock on London time');
});

test('carrying on over a clock change rebases from yesterday’s clock', () => {
  const plan = makeTravelPlan(LONG_NY);
  const again = replanFrom(plan, '2026-10-25');
  assert.deepEqual(again.days.map((d) => [d.date, d.clock, d.readout]), plan.days.map((d) => [d.date, d.clock, d.readout]));
});

// ------------------------------------------------------------ editing
test('editing the flight home mid-trip reworks from today and keeps every past day as it was', () => {
  const plan = makeTravelPlan(M21);
  const today = '2026-11-10';
  const moved = replanFrom(plan, today, { flightHome: f('2026-11-14', '19:00', 'New York', NY, '2026-11-15', '07:00', 'London', L) });
  const past = plan.days.filter((d) => d.date < today);
  assert.deepEqual(moved.days.slice(0, past.length), past);
  assert.equal(moved.days[past.length].date, today);
  assert.equal(moved.todayIndex, past.length);
  // From where the clock is now: today carries on from Mon 9's clock.
  assert.ok(moved.days[past.length].clock <= past.at(-1).clock + 1e-9);
  // Home two days later, so the plan runs longer and the turn moves to Fri 13.
  assert.ok(moved.to > plan.to);
  assert.equal(moved.days.find((d) => d.date === '2026-11-13').phase, 'turn');
  assert.equal(moved.days.find((d) => d.date === '2026-11-14').steps.find((s) => s.kind === 'sleep').label, 'On board');
  assert.equal(moved.days.at(-1).readout, 'Body clock back on London time');
  // Nothing changed: the same plan from today on.
  const same = replanFrom(plan, today);
  assert.deepEqual(same.days, plan.days);
  // The chart follows the new days.
  assert.equal(moved.chart.points.length, moved.days.length);
});

test('editing before the trip starts makes a new plan', () => {
  const plan = makeTravelPlan(M21);
  const later = replanFrom(plan, '2026-11-01', { flightOut: f('2026-11-09', '12:00', 'London', L, '2026-11-09', '15:00', 'New York', NY) });
  assert.equal(later.from, '2026-11-06');
  assert.equal(later.days[0].steps.find((s) => s.kind === 'sleep').time, '23:00');
  // Made short by an edit, it becomes the short page.
  const short = replanFrom(plan, '2026-11-01', { flightHome: f('2026-11-10', '19:00', 'New York', NY, '2026-11-11', '07:00', 'London', L) });
  assert.equal(short.short, true);
});

// ------------------------------------------------------------ no caffeine
test('no caffeine: every caffeine step goes, and nothing else moves', () => {
  const plan = makeTravelPlan(M21);
  const none = makeTravelPlan({ ...M21, noCaffeine: true });
  assert.equal(none.noCaffeine, true);
  assert.ok(none.days.every((d) => d.steps.every((s) => s.kind !== 'caffeine')));
  none.days.forEach((d, i) => assert.deepEqual(d.steps, plan.days[i].steps.filter((s) => s.kind !== 'caffeine')));
  const short = makeTravelPlan({ ...SHORT, noCaffeine: true });
  assert.ok(short.keyDay.steps.every((s) => s.kind !== 'caffeine'));
  // And through an edit: past days keep theirs, today on has none.
  const edited = replanFrom(plan, '2026-11-10', { noCaffeine: true });
  assert.ok(edited.days.slice(0, 5).every((d) => d.steps.some((s) => s.kind === 'caffeine')));
  assert.ok(edited.days.slice(5).every((d) => d.steps.every((s) => s.kind !== 'caffeine')));
});

// ------------------------------------------------------------ input checks
const TOKYO = {
  flightOut: f('2026-11-03', '19:00', 'London', L, '2026-11-04', '15:00', 'Tokyo', 'Asia/Tokyo'),
  flightHome: f('2026-11-12', '11:00', 'Tokyo', 'Asia/Tokyo', '2026-11-12', '15:00', 'London', L),
};

test('a long trip east with a night flight out sleeps on board and reaches the new time zone', () => {
  const plan = makeTravelPlan(TOKYO);
  assert.equal(plan.difference, 9);
  assert.equal(plan.days.find((d) => d.date === '2026-11-03').steps.find((s) => s.kind === 'sleep').label, 'On board');
  assert.ok(plan.days.some((d) => d.readout === 'Body clock on Tokyo time' || d.percent >= 90));
  assert.ok(plan.days.length < RULES.maxDays);
  assert.equal(plan.days.at(-1).readout, 'Body clock back on London time');
});

test('usual sleep defaults to 23:00 to 07:00 when there’s no check-in', () => {
  const plan = makeTravelPlan({ flightOut: M21.flightOut, flightHome: M21.flightHome });
  assert.deepEqual(plan.usualSleep, { start: '23:00', end: '07:00' });
  assert.equal(plan.days[0].steps.find((s) => s.kind === 'sleep').time, '23:30');
});

test('the engine refuses what isn’t a trip', () => {
  assert.throws(() => makeTravelPlan({ ...M21, flightOut: { ...M21.flightOut, fromZone: 'GMT' } }), /place-name/);
  assert.throws(() => makeTravelPlan({ ...M21, flightOut: { ...M21.flightOut, arrivesOn: '2026-11-07' } }), /lands before it leaves/);
  assert.throws(() => makeTravelPlan({ flightOut: M21.flightOut }), /flight home is missing/);
  assert.throws(() => makeTravelPlan({ ...M21, usualSleep: { start: '25:00', end: '06:30' } }), /not a time of day/);
});

// ------------------------------------------------------------ every day's steps on its own day (break-it 1, 18 Nov)
// Differences over 12 hours (Los Angeles to Tokyo is 17 hours ahead, read as
// 7 behind), the date line, half-hour and 45-minute zones, early and late
// flights. Whichever way the body clock is moved, every step listed under a
// day falls on that day on the clock it's shown on (a bedtime may run past
// midnight, until noon), in time order, where the person is, and never while
// they're on a plane, other than the flight's own steps ("On board") and the
// last caffeine (on a flight, on the destination's clock: the method).
const LA = 'America/Los_Angeles';
const TYO = 'Asia/Tokyo';
const AKL = 'Pacific/Auckland';
const ROUTES = [
  [L, 'London', NY, 'New York', 8], [NY, 'New York', L, 'London', 7], [LA, 'Los Angeles', TYO, 'Tokyo', 11.5], [TYO, 'Tokyo', LA, 'Los Angeles', 10],
  [L, 'London', AKL, 'Auckland', 25], [AKL, 'Auckland', L, 'London', 26], [L, 'London', TYO, 'Tokyo', 14], [L, 'London', 'Asia/Kolkata', 'Mumbai', 9.5],
  [L, 'London', 'Asia/Kathmandu', 'Kathmandu', 11], ['Australia/Adelaide', 'Adelaide', L, 'London', 23], ['America/St_Johns', 'St John’s', L, 'London', 5.5],
  ['Pacific/Honolulu', 'Honolulu', 'Australia/Sydney', 'Sydney', 10.5], [DXB, 'Dubai', LA, 'Los Angeles', 16], [TYO, 'Tokyo', NY, 'New York', 13],
];
const DEPARTS = ['06:00', '12:00', '19:00', '23:30'];
const landing = (on, at, from, hours, to) => {
  const t = new Date(instantAt(on, at, from).getTime() + hours * HOUR);
  const w = wallClock(t, to);
  return [w.date, w.time];
};
function tripFor([home, homeCity, away, awayCity, hours], out, back, nights) {
  const outOn = addDays('2026-11-10', 0);
  const [arrOn, arrAt] = landing(outOn, out, home, hours, away);
  const backOn = addDays(arrOn, nights);
  const [homeOn, homeAt] = landing(backOn, back, away, hours, home);
  return {
    flightOut: f(outOn, out, homeCity, home, arrOn, arrAt, awayCity, away),
    flightHome: f(backOn, back, awayCity, away, homeOn, homeAt, homeCity, home),
    keyMoments: [{ id: 'k', name: 'Your talk', startsOn: addDays(arrOn, 1), at: '10:00', city: awayCity, zone: away }],
  };
}
const TRIPS = [];
// (Each plan takes about 30ms, most of it in the time library's zone check, so the set is kept to 112 trips.)
for (const r of ROUTES) for (const out of DEPARTS) for (const [back, nights] of [['06:00', 3], ['19:00', 6]]) TRIPS.push(tripFor(r, out, back, nights));

/** Where the person is at an instant: a zone, or null on a plane. */
function placeAt(plan, t) {
  const legs = [plan.input.flightOut, ...(plan.input.legs || []), plan.input.flightHome].map((l) => ({ ...l, departs: instantAt(l.departsOn, l.departsAt, l.fromZone), arrives: instantAt(l.arrivesOn, l.arrivesAt, l.toZone) }));
  let zone = legs[0].fromZone;
  for (const l of legs) {
    if (t > l.departs && t < l.arrives) return null;
    if (t >= l.arrives) zone = l.toZone;
  }
  return zone;
}

test('every step sits on its own day, in time order, where the person is, and nothing but the flight’s own steps on a plane', () => {
  let checked = 0;
  for (const input of TRIPS) {
    const plan = makeTravelPlan(input);
    const name = `${input.flightOut.fromCity} to ${input.flightOut.toCity}, ${input.flightOut.departsAt} out, ${input.flightHome.departsAt} back, ${plan.nights} nights`;
    if (plan.short) continue;
    for (const day of plan.days) {
      const at = `${name}, ${day.title}`;
      let last = -Infinity;
      const kinds = {};
      for (const s of day.steps) {
        kinds[s.kind] = (kinds[s.kind] || 0) + 1;
        if (s.kind === 'moment') continue;
        const t = new Date(s.at);
        if (s.onBoard) {
          assert.equal(s.time, null, at);
          assert.equal(s, day.steps.at(-1), `${at}: "On board" comes last`);
          continue;
        }
        checked += 1;
        const w = wallClock(t, s.zone);
        assert.equal(s.time, w.time, `${at} ${s.kind}`);
        if (s.kind === 'sleep') {
          const hours = daysBetween(day.date, w.date) * 24 + w.hour + w.minute / 60;
          assert.ok(hours >= 12 && hours < 36, `${at}: bed at ${w.date} ${w.time} ${s.city} time isn't that night`);
        } else assert.equal(w.date, day.date, `${at}: ${s.kind} "${s.words}" is on ${w.date} ${w.time} ${s.city} time`);
        const where = placeAt(plan, t);
        if (s.kind !== 'caffeine') {
          assert.notEqual(where, null, `${at}: ${s.kind} "${s.words}" at ${w.time} ${s.city} time is on the plane`);
          assert.equal(where, s.zone, `${at}: ${s.kind} at ${w.time} is shown on ${s.city}'s clock but the person is elsewhere`);
        }
        assert.ok(t.getTime() >= last, `${at}: ${s.kind} at ${w.time} is out of time order`);
        last = t.getTime();
      }
      for (const k of ['light', 'caffeine', 'sleep']) assert.ok((kinds[k] || 0) <= 1, `${at}: ${kinds[k]} ${k} steps`);
      assert.equal(kinds.sleep, 1, `${at}: one sleep step`);
    }
    assert.equal(plan.days.at(-1).readout.startsWith('Body clock back on'), true, name);
  }
  assert.ok(checked > 2500, `${checked} steps checked`);
});

test('the date line: Los Angeles to Tokyo has no night on the day out, and every Tokyo day’s steps are on Tokyo’s date', () => {
  const plan = makeTravelPlan(tripFor(ROUTES[2], '11:00', '17:00', 6));
  assert.equal(plan.difference, -7); // 17 hours ahead, read as 7 behind
  const out = plan.days.find((d) => d.phase === 'out');
  assert.deepEqual(out.steps.filter((s) => s.kind === 'sleep').map((s) => [s.label, s.words]), [['On board', 'Stay awake on the flight.']]);
  const landingDay = plan.days[plan.days.indexOf(out) + 1];
  assert.equal(landingDay.date, '2026-11-11');
  assert.equal(landingDay.steps.find((s) => s.kind === 'light').words, 'Get daylight from landing until dark.');
  for (const d of plan.days.filter((x) => x.phase === 'away')) {
    const bed = d.steps.find((s) => s.kind === 'sleep');
    assert.equal(wallClock(new Date(bed.at), TYO).date, d.date, d.title);
  }
});

test('an early flight east: the last caffeine is that morning, never the evening before', () => {
  const plan = makeTravelPlan({
    flightOut: f('2026-11-20', '06:00', 'London', L, '2026-11-21', '03:00', 'Tokyo', TYO),
    flightHome: f('2026-11-28', '11:00', 'Tokyo', TYO, '2026-11-28', '15:00', 'London', L),
  });
  const fri = dayOf(plan, '2026-11-20');
  const caffeine = fri.steps.find((s) => s.kind === 'caffeine');
  assert.equal(wallClock(new Date(caffeine.at), L).date, '2026-11-20');
  assert.ok(Date.parse(caffeine.at) <= instantAt('2026-11-20', '06:00', L).getTime(), `caffeine at ${caffeine.time}`);
  // The night is on board, at Tokyo's night, not an hour after an early-morning take-off.
  assert.equal(sleepOf(fri).label, 'On board');
  const thu = dayOf(plan, '2026-11-19');
  assert.ok(Date.parse(caffeine.at) > Date.parse(sleepOf(thu).at), 'after Thu 19’s own bedtime');
});

test('a 24-hour flight: the day spent in the air has one step, and the plan carries on from landing', () => {
  const plan = makeTravelPlan(tripFor(ROUTES[4], '21:00', '10:00', 6));
  const air = plan.days.find((d) => d.date === '2026-11-11');
  assert.deepEqual(air.steps.map((s) => [s.label, s.words]), [['On board', 'Rest on the flight, and sleep when you can.']]);
  const next = plan.days[plan.days.indexOf(air) + 1];
  assert.match(next.steps.find((s) => s.kind === 'light').words, /landing/);
});

// ------------------------------------------------------------ short trips, the break-it tester's cases (18 Nov)
test('a short trip west with the key moment on the day home: New York’s clock all day, getting up first, the night on the flight', () => {
  const plan = makeTravelPlan({
    flightOut: f('2026-11-24', '09:00', 'London', L, '2026-11-24', '12:00', 'New York', NY),
    flightHome: f('2026-11-26', '19:00', 'New York', NY, '2026-11-27', '07:00', 'London', L),
    keyMoments: [{ id: 'k', name: 'Your pitch', startsOn: '2026-11-26', at: '10:00', city: 'New York', zone: NY }],
  });
  assert.equal(plan.short, true);
  assert.equal(plan.keyDay.date, '2026-11-26');
  assert.equal(plan.keyDay.zone, NY);
  // Up at 05:00, not 02:00: sleep moves 3 hours later (Tim, 18 Nov).
  assert.deepEqual(plan.keyDay.steps.map((s) => [s.time || s.label, s.words]), [
    ['05:00', 'Get up, which is 10:00 in London.'],
    ['07:00', 'Get daylight once it’s light, and keep the light low from 17:00.'],
    ['10:00', 'Your pitch starts, which is 15:00 in London.'],
    ['12:00', 'Have your last caffeine by 12:00.'],
    ['On board', 'Sleep on the flight home.'],
  ]);
});

test('a short trip west: never daylight in the local night, and lights out comes last', () => {
  const plan = makeTravelPlan({
    flightOut: f('2026-11-24', '09:00', 'London', L, '2026-11-24', '12:00', 'New York', NY),
    flightHome: f('2026-11-26', '19:00', 'New York', NY, '2026-11-27', '07:00', 'London', L),
  });
  assert.equal(plan.keyDay.date, '2026-11-25');
  assert.deepEqual(plan.keyDay.steps.map((s) => [s.time, s.words]), [
    ['05:00', 'Get up, which is 10:00 in London.'],
    ['07:00', 'Get daylight once it’s light, and keep the light low from 17:00.'],
    ['12:00', 'Have your last caffeine by 12:00.'],
    ['21:00', 'Turn the lights out, which is 02:00 in London.'],
  ]);
});

// ------------------------------------------------------------ short trips far west (Tim, 18 Nov, 09:00)
// Stay on home time unless that means getting up before 05:00 or going to bed
// after 01:00 local time; then sleep moves just enough, with one line saying so.
test('a short trip far west: London to Los Angeles, 2 nights: up at 05:00, not 23:00', () => {
  const LA = 'America/Los_Angeles';
  const plan = makeTravelPlan({
    flightOut: f('2026-11-24', '10:00', 'London', L, '2026-11-24', '13:00', 'Los Angeles', LA),
    flightHome: f('2026-11-26', '17:00', 'Los Angeles', LA, '2026-11-27', '11:00', 'London', L),
  });
  assert.equal(plan.short, true);
  assert.equal(plan.reason, 'nights');
  assert.equal(plan.headline, 'It’s a short trip, so stay on London time.');
  assert.equal(plan.sleepNote, 'Your sleep moves a little so you’re not up at 23:00.');
  assert.equal(plan.sleepMoved, 6);
  assert.deepEqual(plan.keyDay.steps.map((s) => [s.time, s.words]), [
    ['05:00', 'Get up, which is 13:00 in London.'],
    ['07:00', 'Get daylight once it’s light, and keep the light low from 17:00.'],
    ['12:00', 'Have your last caffeine by 12:00.'],
    ['21:00', 'Turn the lights out, which is 05:00 in London.'],
  ]);
});

test('a short trip far west: London to New York, 2 nights: up at 05:00, not 02:00', () => {
  const plan = makeTravelPlan({
    flightOut: f('2026-11-24', '09:00', 'London', L, '2026-11-24', '12:00', 'New York', NY),
    flightHome: f('2026-11-26', '19:00', 'New York', NY, '2026-11-27', '07:00', 'London', L),
  });
  assert.equal(plan.headline, 'It’s a short trip, so stay on London time.');
  assert.equal(plan.sleepNote, 'Your sleep moves a little so you’re not up at 02:00.');
  assert.equal(plan.sleepMoved, 3);
  const up = plan.keyDay.steps.find((s) => s.wake);
  const bed = plan.keyDay.steps.find((s) => s.kind === 'sleep' && !s.wake);
  assert.equal(up.time, '05:00');
  assert.equal(bed.time, '21:00');
});

test('a short trip east is unchanged: London to Dubai keeps London’s times, with no line', () => {
  const plan = makeTravelPlan(SHORT);
  assert.equal(plan.sleepNote, null);
  assert.equal(plan.sleepMoved, 0);
  assert.equal(plan.keyDay.steps.find((s) => s.kind === 'sleep').time, '02:00');
  assert.equal(plan.keyDay.steps.find((s) => s.wake).time, '10:00');
});

test('every short trip west: never up before 05:00 or in bed after 01:00 local time; east never moves', () => {
  let checked = 0;
  for (const [home, homeCity, away, awayCity, hours] of ROUTES) {
    for (const out of DEPARTS) {
      for (const nights of [1, 2]) {
        const plan = makeTravelPlan(tripFor([home, homeCity, away, awayCity, hours], out, '19:00', nights));
        const name = `${homeCity} to ${awayCity}, ${out} out, ${nights} nights`;
        if (plan.difference >= 0) { assert.equal(plan.sleepMoved, 0, name); continue; }
        const up = plan.keyDay.steps.find((s) => s.wake);
        if (up) assert.ok(up.time >= RULES.shortWakeFrom, `${name}: up at ${up.time}`);
        const bed = plan.keyDay.steps.find((s) => s.kind === 'sleep' && !s.wake && !s.onBoard);
        if (bed) assert.ok(bed.time <= RULES.shortBedBy || bed.time >= '12:00', `${name}: bed at ${bed.time}`);
        checked += 1;
      }
    }
  }
  assert.ok(checked > 0);
});

// ------------------------------------------------------------ caffeine in the air (Tim, 18 Nov, 09:00)
test('a last caffeine during a flight says it’s on the plane', () => {
  const plan = makeTravelPlan(M21);
  const fly = plan.days.find((d) => d.date === '2026-11-08').steps.find((s) => s.kind === 'caffeine');
  assert.equal(fly.onPlane, true);
  assert.match(fly.words, /^Have your last caffeine by \d\d:\d\d, on the plane\.$/);
  // Every other caffeine step on the ground says nothing of a plane.
  for (const d of plan.days) for (const s of d.steps) if (s.kind === 'caffeine' && !s.onPlane) assert.doesNotMatch(s.words, /plane/, d.date);
});

test('no time difference (London to Lisbon in November): says so, with no home-time phrase', () => {
  const input = {
    flightOut: f('2026-11-10', '09:00', 'London', L, '2026-11-10', '11:45', 'Lisbon', 'Europe/Lisbon'),
    flightHome: f('2026-11-15', '19:00', 'Lisbon', 'Europe/Lisbon', '2026-11-15', '21:45', 'London', L),
    keyMoments: [{ id: 'k', name: 'Your workshop', startsOn: '2026-11-12', at: '09:30', city: 'Lisbon', zone: 'Europe/Lisbon' }],
  };
  assert.deepEqual(shortTrip(input), { short: true, reason: 'difference', nights: 5, difference: 0 });
  const plan = makeTravelPlan(input);
  assert.equal(plan.sameTime, true);
  assert.equal(plan.headline, 'There’s no time difference, so keep your usual times.');
  assert.deepEqual(plan.keyDay.steps.map((s) => [s.time, s.words]), [
    ['07:00', 'Get up.'],
    ['07:00', 'Get daylight early in your day, and keep the light low from 19:00.'],
    ['09:30', 'Your workshop starts.'],
    ['14:00', 'Have your last caffeine by 14:00.'],
    ['23:00', 'Turn the lights out.'],
  ]);
  assert.doesNotMatch(JSON.stringify(plan.keyDay), /which is|in London|0 hours/);
  assert.ok(plan.keyDay.steps.every((s) => !s.homeTime));
  // A short trip with a difference keeps its home-time phrase.
  assert.equal(makeTravelPlan(SHORT).sameTime, false);
});

test('every short trip’s key day: on that day, in time order, where the person is', () => {
  let checked = 0;
  for (const [home, homeCity, away, awayCity, hours] of ROUTES) {
    for (const out of DEPARTS) {
      for (const nights of [1, 2]) {
        const t = tripFor([home, homeCity, away, awayCity, hours], out, '19:00', nights);
        t.keyMoments[0].startsOn = addDays(t.flightOut.arrivesOn, nights);
        const plan = makeTravelPlan(t);
        assert.equal(plan.short, true);
        const name = `${homeCity} to ${awayCity}, ${out} out, ${nights} nights`;
        let last = -Infinity;
        for (const s of plan.keyDay.steps) {
          if (s.onBoard) { assert.equal(s, plan.keyDay.steps.at(-1), name); continue; }
          if (!s.at) continue;
          const at = new Date(s.at);
          assert.equal(wallClock(at, plan.keyDay.zone).date, plan.keyDay.date, `${name}: "${s.words}"`);
          assert.ok(at.getTime() >= last, `${name}: "${s.words}" out of order`);
          last = at.getTime();
          if (s.kind !== 'caffeine') assert.equal(placeAt(plan, at), plan.keyDay.zone, `${name}: "${s.words}" at ${s.time}`);
          checked += 1;
        }
        const light = plan.keyDay.steps.find((s) => s.kind === 'light');
        if (light && plan.difference <= 0) assert.ok(light.time >= RULES.shortFirstLight, `${name}: daylight at ${light.time}`);
      }
    }
  }
  assert.ok(checked > 300, `${checked} steps checked`);
});
