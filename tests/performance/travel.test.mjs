// The Travel plan's engine (Phase 8b Part B step 1; M21 version 7.2).
// The worked example is M21's own hand-written London to New York table
// (Thu 5 to Mon 16 Nov 2026), compared day by day and step by step within
// 30 minutes; docs/travel-plan-method.md lists every difference and why.
// Run with npm run test:performance.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeTravelPlan, replanFrom, shortTrip, RULES } from '../../src/lib/travel/index.js';
import { clockChanges } from '../../src/lib/time/index.js';

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
const CLOCK_CHANGE = {
  flightOut: f('2026-10-22', '11:00', 'London', L, '2026-10-22', '13:30', 'New York', NY),
  flightHome: f('2026-10-28', '19:00', 'New York', NY, '2026-10-29', '07:00', 'London', L),
};

test('a trip over a clock change: the UK goes back on 25 Oct, so New York is 4 hours behind until 1 Nov', () => {
  const plan = makeTravelPlan(CLOCK_CHANGE);
  // The changes come from src/lib/time's clockChanges, for every zone of the trip.
  const uk = clockChanges(L, new Date('2026-10-19T00:00:00Z'), 14)[0];
  assert.deepEqual(plan.clockChanges.map((c) => [c.city, c.date, c.direction]), [['London', '2026-10-25', 'back']]);
  assert.equal(plan.clockChanges[0].at, uk.at.toISOString());
  const before = plan.days.find((d) => d.date === '2026-10-24');
  const after = plan.days.find((d) => d.date === '2026-10-26');
  assert.equal(before.difference, -5);
  assert.equal(after.difference, -4);
  // Same usual bedtime on New York's clock either side of the change.
  assert.equal(before.steps.find((s) => s.kind === 'sleep').time, '23:00');
  assert.equal(after.steps.find((s) => s.kind === 'sleep').time, '23:00');
  // The body clock aims at the new difference: it never goes past New York time.
  assert.ok(after.clock >= -4.5);
  assert.equal(after.readout, 'Body clock on New York time');
  // The day the UK clocks change, London's evening steps are still on London's clock.
  assert.equal(plan.days.find((d) => d.date === '2026-10-30').steps.find((s) => s.kind === 'sleep').time, '23:00');
  assert.equal(plan.days.at(-1).readout, 'Body clock back on London time');
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
