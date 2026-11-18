// Peak moments (M18, version 28; Phase 8b part A): the rules, with no screen.
//   node --import ./tests/scores/register.mjs --test tests/performance/peak-moments.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EXPLAIN, KINDS, AREAS, LEAD_UP_SUGGESTIONS,
  cleanMomentName, comesRoundOn, countdownLine, countdownWords, dayWords, ownEntry, repeatProblem, emptyMoment, firstUnanswered, homeCard, isComplete, leadUpFor, leadUpLines,
  leadUpQuestion, listView, metaItems, nearestRing, nextOccurrence, occurrences, onBreak, repeatOptions, repeatWords,
  reviewAnswers, reviewDay, reviewDue, reviewLine, reviewQuestion, ringLabel, ringNote, sprintMoments, summaryRows,
  tidyMoment, weekOfMonth, weekRings, whenProblem, whenWords, withArea, withRepeat, withSpan, withStart, withUntil, yearMonths,
} from '../../src/lib/peakMoments/model.js';
import { searchCities } from '../../src/lib/peakMoments/places.js';
import { homeSuggestion } from '../../src/lib/performance/home.js';
import { tabTitle, areaOf } from '../../src/lib/navigation.js';
import { repeatsItsAnswer } from './second-lines.test.mjs';

const TODAY = '2026-10-28'; // M18's own day, a Wednesday
const m = (id, name, startsOn, more = {}) => tidyMoment({ id, name, kind: 'perform', area: 'work', startsOn, endsOn: more.endsOn || startsOn, ...more });

test('words: dates, ranges and the year only outside this year (M18)', () => {
  assert.equal(dayWords('2026-10-31', TODAY), 'Sat 31 Oct');
  assert.equal(dayWords('2027-04-25', TODAY), 'Sun 25 Apr 2027');
  assert.equal(whenWords('2026-11-12', '2026-11-13', TODAY), 'Thu 12 to Fri 13 Nov');
  assert.equal(whenWords('2026-12-19', '2026-12-26', TODAY), 'Sat 19 to Sat 26 Dec');
  assert.equal(whenWords('2026-11-30', '2026-12-02', TODAY), 'Mon 30 Nov to Wed 2 Dec');
  assert.equal(whenWords('2026-12-31', '2027-01-02', TODAY), 'Thu 31 Dec 2026 to Sat 2 Jan 2027');
});

test('countdowns read "3 days to go", never "left" (5e 29an)', () => {
  assert.equal(countdownWords('2026-10-31', TODAY), '3 days to go');
  assert.equal(countdownWords('2026-10-29', TODAY), '1 day to go');
  assert.equal(countdownWords('2026-10-28', TODAY), 'today');
  assert.equal(countdownWords('2026-10-27', TODAY), null);
  assert.equal(countdownLine('Cup final', '2026-10-31', TODAY), 'Cup final, 3 days to go');
  assert.equal(countdownLine('Cup final', '2026-10-28', TODAY), 'Cup final is today');
  assert.equal(countdownLine('Cup final', '2026-10-27', TODAY), 'Cup final was yesterday');
  for (const d of ['2026-10-29', '2026-10-30', '2026-10-31', '2026-11-20']) assert.doesNotMatch(countdownLine('X', d, TODAY), /left/);
});

test('repeats are a rule: each time it comes round, in date order', () => {
  const board = m('b', 'Monthly board meeting', '2026-10-06', { repeat: { every: 'month_weekday' } });
  assert.equal(repeatWords(board, TODAY), 'First Tuesday of every month');
  assert.deepEqual(occurrences(board, '2026-10-01', '2027-01-31').map((o) => o.on), ['2026-10-06', '2026-11-03', '2026-12-01', '2027-01-05']);
  // The 31st comes round only in months that have one: never rolled on.
  const end = m('e', 'Month end', '2026-01-31', { repeat: { every: 'month_date' } });
  assert.deepEqual(occurrences(end, '2026-01-01', '2026-06-30').map((o) => o.on), ['2026-01-31', '2026-03-31', '2026-05-31']);
  assert.equal(repeatWords(end, TODAY), 'The 31st of every month');
  // Weekly, with an end date (the last time it comes round).
  const weekly = m('w', 'Squad session', '2026-11-03', { repeat: { every: 'week', until: '2026-11-24' } });
  assert.deepEqual(occurrences(weekly, '2026-10-01', '2027-01-01').map((o) => o.on), ['2026-11-03', '2026-11-10', '2026-11-17', '2026-11-24']);
  assert.equal(repeatWords(weekly, TODAY), 'Every Tuesday, until Tue 24 Nov');
  // Yearly: 29 Feb only in a leap year.
  const leap = m('l', 'Leap day', '2028-02-29', { repeat: { every: 'year' } });
  assert.deepEqual(occurrences(leap, '2028-01-01', '2036-12-31').map((o) => o.on), ['2028-02-29', '2032-02-29', '2036-02-29']);
  // A multi-day moment keeps its length each time.
  const camp = m('c', 'Training camp', '2026-11-12', { endsOn: '2026-11-13', repeat: { every: 'month_date' } });
  assert.deepEqual(occurrences(camp, '2026-12-01', '2026-12-31').map((o) => [o.on, o.endsOn]), [['2026-12-12', '2026-12-13']]);
  // The last weekday of a month (a 5th Friday) stays the last one.
  assert.equal(weekOfMonth('2026-10-30'), 5);
  const last = m('f', 'Month close', '2026-10-30', { repeat: { every: 'month_weekday' } });
  assert.equal(repeatWords(last, TODAY), 'Last Friday of every month');
  assert.deepEqual(occurrences(last, '2026-11-01', '2026-12-31').map((o) => o.on), ['2026-11-27', '2026-12-25']);
  // A long search never runs away.
  assert.ok(occurrences(m('d', 'Daily', '2020-01-06', { repeat: { every: 'week' } }), '2020-01-01', '2099-12-31').length <= 400);
});

test('adding one: answers, checks and never a greyed-out button', () => {
  let x = emptyMoment('n1', TODAY);
  assert.equal(firstUnanswered(x), 'name');
  assert.equal(isComplete(x), false);
  x = { ...x, name: 'Cup final' };
  x = withArea(x, 'personal', true);
  assert.equal(x.shared, false, 'a personal moment is never shared');
  x = withArea(x, 'work', true);
  assert.equal(x.shared, true);
  x = { ...x, kind: 'perform' };
  assert.equal(whenProblem(x), 'Choose its day to carry on.');
  x = withStart(x, '2026-10-31');
  assert.equal(whenProblem(x), null);
  assert.equal(x.endsOn, '2026-10-31');
  x = withSpan(x, 'days');
  assert.equal(whenProblem(x), 'Choose the day it ends to carry on.');
  x = { ...x, endsOn: '2026-11-01' };
  assert.equal(whenProblem(x), null);
  x = withRepeat(x, 'year');
  x = withUntil(x, '2028-10-31');
  assert.deepEqual(x.repeat, { every: 'year', until: '2028-10-31' });
  x = withRepeat(x, 'none');
  assert.equal(x.repeat, null);
  assert.equal(isComplete(x), true);
  assert.equal(firstUnanswered(x), 'sum');
});

test('answers are full sentences in the person’s voice, with no second line repeating them (29aa, 29ap)', () => {
  assert.deepEqual(KINDS.map((k) => k.label), ['I need to perform at my best', 'I want to be fully present', 'I want to arrive at a break rested']);
  assert.deepEqual(AREAS.map((a) => a.label), ['It’s for work', 'It’s for my personal life']);
  for (const o of repeatOptions('2026-11-12')) if (o.hint) assert.equal(repeatsItsAnswer(o.label, o.hint), false, `${o.label} / ${o.hint}`);
  assert.deepEqual(repeatOptions('2026-11-12').map((o) => o.hint || null), [null, 'On Thursdays', 'On the 12th', 'On the second Thursday', 'On 12 Nov']);
});

test('the summary: one line per answer, each opening its own question', () => {
  const x = m('s', 'Board away-day', '2026-11-12', { endsOn: '2026-11-13', placeCity: 'New York', placeZone: 'America/New_York' });
  const rows = summaryRows(x, TODAY);
  assert.deepEqual(rows.map((r) => r.step), ['name', 'area', 'kind', 'when', 'where', 'repeat']);
  assert.deepEqual(rows.map((r) => r.lines.length), [1, 1, 1, 1, 1, 1]);
  assert.equal(rows[3].lines[0].text, 'Thu 12 to Fri 13 Nov');
  assert.equal(rows[4].lines[0].text, 'New York');
  assert.equal(summaryRows({ ...x, placeCity: null, placeZone: null }, TODAY)[4].lines[0].text, 'At home');
});

test('a damaged copy still reads, and a personal one is never shared', () => {
  assert.equal(tidyMoment(null), null);
  assert.equal(tidyMoment({ name: 'no id' }), null);
  const t = tidyMoment({ id: 'z', name: 'X'.repeat(200), area: 'personal', kind: 'nope', startsOn: '2026-13-01', shared: true, repeat: { every: 'daily' }, placeCity: 'Paris' });
  assert.equal(t.name.length, 80);
  assert.equal(t.kind, null);
  assert.equal(t.startsOn, null);
  assert.equal(t.repeat, null);
  assert.equal(t.shared, false);
  assert.equal(t.placeCity, null, 'a city with no zone is no place');
});

test('the list: Coming up in date order, then Past with its lesson (M18)', () => {
  const ms = [
    m('half', 'Half marathon', '2027-04-25', { area: 'personal' }),
    m('cup', 'Cup final', '2026-10-31'),
    m('board', 'Monthly board meeting', '2026-10-06', { repeat: { every: 'month_weekday' } }),
    m('ski', 'Ski holiday', '2026-12-19', { endsOn: '2026-12-26', kind: 'rested', area: 'personal' }),
    m('investor', 'Investor call', '2026-10-15', { lesson: 'A quiet evening before made the difference.' }),
  ];
  const reviews = { 'board:2026-10-06': { momentId: 'board', occursOn: '2026-10-06', answer: 'well', lesson: 'Preparing two days early took the pressure off.' } };
  const v = listView(ms, reviews, TODAY);
  assert.deepEqual(v.comingUp.map((o) => o.moment.name), ['Cup final', 'Monthly board meeting', 'Ski holiday', 'Half marathon']);
  assert.equal(v.comingUp[1].on, '2026-11-03');
  assert.deepEqual(v.past.map((o) => [o.moment.name, o.lesson]), [
    ['Investor call', 'A quiet evening before made the difference.'],
    ['Monthly board meeting', 'Preparing two days early took the pressure off.'],
  ]);
  assert.deepEqual(metaItems(ms[2], TODAY), ['Perform at my best', 'Work', 'First Tuesday of every month']);
  assert.deepEqual(metaItems(ms[3], TODAY), ['Taper before a break', 'Personal']);
  assert.equal(listView([], {}, TODAY).empty, true);
  // No limit: a thousand moments all list.
  const many = Array.from({ length: 1000 }, (_, i) => m(`k${i}`, `Moment ${i}`, '2026-11-02'));
  assert.equal(listView(many, {}, TODAY).comingUp.length, 1000);
});

test('the Daily plan asks about one moment a day: the nearer one, 1 to 3 days away', () => {
  const ms = [
    m('a', 'Away day', '2026-10-31', { kind: 'present' }),
    m('b', 'Board meeting', '2026-10-31'),
    m('c', 'Cup final', '2026-10-30'),
    m('d', 'Derby', '2026-11-05'),
  ];
  assert.equal(leadUpFor(ms, TODAY).moment.name, 'Cup final', 'the nearer one');
  assert.equal(leadUpFor(ms.filter((x) => x.id !== 'c'), TODAY).moment.name, 'Board meeting', 'two on one day: perform first');
  assert.equal(leadUpFor([ms[3]], TODAY), null, 'more than 3 days away');
  assert.equal(leadUpFor([m('t', 'Today', TODAY)], TODAY), null, 'not on the day itself');
  // A monthly one's lead-up comes round each month.
  const monthly = m('mo', 'Monthly review', '2026-09-30', { repeat: { every: 'month_date' } });
  assert.equal(leadUpFor([monthly], TODAY).on, '2026-10-30');
  assert.equal(leadUpQuestion('perform', 'Cup final'), 'What will you do today to protect your energy for “Cup final”?');
  assert.equal(leadUpQuestion('present', 'Mum’s 70th'), 'What will you do today so you can be fully present at “Mum’s 70th”?');
  assert.equal(leadUpQuestion('rested', 'Ski holiday'), 'What will you do today so you arrive at “Ski holiday” rested?');
  for (const list of Object.values(LEAD_UP_SUGGESTIONS)) for (const s of list) assert.match(s, /^I’ll /);
  assert.ok(LEAD_UP_SUGGESTIONS.perform.includes('I’ll be in bed by 22:30'));
});

test('Home: the countdown in the 3 days before, the day itself, then the review after', () => {
  const cup = m('cup', 'Cup final', '2026-10-31');
  const card = homeCard([cup], {}, TODAY);
  assert.equal(card.label, 'Cup final, 3 days to go');
  assert.equal(card.question, 'How are you protecting your energy for “Cup final”?');
  assert.equal(card.action.label, 'Plan for it');
  assert.equal(card.action.to, '/pressure-plan');
  assert.equal(homeCard([cup], {}, '2026-10-27'), null, '4 days before: nothing yet');
  const day = homeCard([cup], {}, '2026-10-31');
  assert.equal(day.label, 'Cup final is today');
  assert.equal(day.onTheDay, true);
  assert.equal(homeCard([cup], {}, TODAY, [card.notNow]), null, 'Not now: gone for today');
  const after = homeCard([cup], {}, '2026-11-01');
  assert.equal(after.kind, 'review');
  assert.equal(after.label, 'Cup final was yesterday');
  assert.equal(after.question, 'How did “Cup final” go?');
  assert.equal(after.action.to, '/peak-moments/review/cup/2026-10-31');
  const reviewed = { 'cup:2026-10-31': { momentId: 'cup', occursOn: '2026-10-31', answer: 'well' } };
  assert.equal(homeCard([cup], reviewed, '2026-11-01'), null);
  assert.equal(homeCard([cup], {}, '2026-11-04'), null, 'offered for 3 days');
  // A break: the review after is the day after it starts.
  const ski = m('ski', 'Ski holiday', '2026-12-19', { endsOn: '2026-12-26', kind: 'rested', area: 'personal' });
  const first = occurrences(ski, '2026-12-01', '2026-12-31')[0];
  assert.equal(reviewDay(first), '2026-12-20');
  assert.equal(reviewLine(first, '2026-12-20'), 'Ski holiday started yesterday');
  assert.equal(reviewDue([ski], {}, '2026-12-20').length, 1);
  assert.equal(reviewQuestion('rested', 'Ski holiday'), 'Did you arrive rested?');
  assert.equal(reviewQuestion('present', 'Mum’s 70th'), 'Were you as present as you wanted to be?');
  assert.deepEqual(reviewAnswers('perform').map((a) => a.value), ['very_well', 'well', 'not_well']);
  for (const k of ['perform', 'present', 'rested']) for (const a of reviewAnswers(k)) assert.ok(['very_well', 'well', 'mixed', 'not_well', 'yes', 'partly', 'no'].includes(a.value), 'a value 048 allows');
  // On a break, from its second day: no work prompts.
  assert.ok(onBreak([ski], '2026-12-20'));
  assert.equal(onBreak([ski], '2026-12-19'), null);
  assert.equal(onBreak([ski], '2026-12-27'), null);
});

test('Home takes the peak card in turn: after the day is planned, never on a break’s work prompts', () => {
  const peak = { key: 'lead:x', kind: 'lead', label: 'Cup final, 3 days to go', question: 'Q?', lines: [], action: { label: 'Plan for it', to: '/pressure-plan' }, notNow: 'lead:x' };
  const base = { today: TODAY, minute: 0, person: 'sprint', sprintView: { state: 'running', current: 3, lengthWeeks: 8, name: 'Performance Sprint' }, reviewed: false, yesterday: {}, windDown: {} };
  // The countdown wins the one card in the 3 days before (Tim, 18 Nov).
  assert.equal(homeSuggestion({ ...base, hour: 9, dayPlanned: false, peak }).key, 'lead:x', 'the countdown wins over Daily plan');
  assert.equal(homeSuggestion({ ...base, hour: 10, dayPlanned: true, peak }).key, 'lead:x');
  assert.equal(homeSuggestion({ ...base, hour: 18, dayPlanned: true, peak }).key, 'lead:x', 'and over Daily review');
  assert.notEqual(homeSuggestion({ ...base, hour: 2, dayPlanned: false, peak })?.key, 'lead:x', 'never in the night');
  // The debrief's window is open: the countdown wins on every day but the debrief's own day.
  const days = Array.from({ length: 7 }, (_, i) => `2026-10-${19 + i}`);
  const debriefing = { ...base.sprintView, debrief: { week: 3 }, calendar: { weeks: [null, null, { number: 3, start: '2026-10-19', end: '2026-10-25', days }] } };
  assert.equal(homeSuggestion({ ...base, today: '2026-10-23', hour: 14, dayPlanned: true, sprintView: debriefing, peak }).key, 'lead:x', 'a day of the window that isn’t its own day');
  assert.equal(homeSuggestion({ ...base, today: '2026-10-27', hour: 14, dayPlanned: true, sprintView: debriefing, peak }).key, 'lead:x', 'after the week ends');
  assert.equal(homeSuggestion({ ...base, today: '2026-10-25', hour: 14, dayPlanned: true, sprintView: debriefing, peak }).key, 'debrief', 'the debrief’s own day: the debrief wins');
  // On the day itself, and the review after, still take their turn.
  const day = { ...peak, kind: 'day', key: 'lead:y' };
  assert.equal(homeSuggestion({ ...base, hour: 9, dayPlanned: false, peak: day }).key, 'plan', 'on the day: the morning stays Daily plan');
  assert.equal(homeSuggestion({ ...base, hour: 10, dayPlanned: true, peak: day }).key, 'lead:y');
  assert.equal(homeSuggestion({ ...base, hour: 10, dayPlanned: false, peak, onBreak: true }), null, 'a break: no work prompts');
  assert.equal(homeSuggestion({ ...base, hour: 10, dayPlanned: false, peak: { ...peak, kind: 'review', key: 'review:x' }, onBreak: true }).key, 'review:x');
  assert.equal(homeSuggestion({ ...base, person: 'recovery', hour: 10, dayPlanned: true, peak, sprintView: null }).key, 'next-sprint', 'never in Recovery');
});

test('the week bars: one ring a week, two or more counted, and the nearer ring wins', () => {
  const weeks = Array.from({ length: 8 }, (_, i) => ({ number: i + 1, start: `2026-${String(9 + Math.floor((7 + 7 * i) / 30)).padStart(2, '0')}-01`, end: null }));
  // Sprint 4: 7 Sep to 1 Nov, built as the sprint page builds it.
  const start = Date.UTC(2026, 8, 7);
  const key = (n) => new Date(start + n * 86400000).toISOString().slice(0, 10);
  for (let i = 0; i < 8; i += 1) { weeks[i].start = key(7 * i); weeks[i].end = key(7 * i + 6); }
  const ms = [
    m('board', 'Monthly board meeting', '2026-10-06', { repeat: { every: 'month_weekday' } }),
    m('away', 'Board away-day', '2026-10-09'),
    m('investor', 'Investor call', '2026-10-15'),
    m('cup', 'Cup final', '2026-10-31'),
    m('later', 'After the sprint', '2026-11-20'),
  ];
  const rings = weekRings(ms, weeks);
  assert.deepEqual(rings.map((r) => [r.week, r.occurrences.length]), [[5, 2], [6, 1], [8, 1]]);
  assert.equal(ringLabel(rings[0], TODAY), '2 peak moments in week 5');
  assert.equal(ringLabel(rings[1], TODAY), 'Peak moment, Investor call, Thu 15 Oct');
  assert.equal(ringNote(rings[2].occurrences[0], {}, TODAY), '3 days to go.');
  // A past one with no review reads the lesson the moment keeps (the UI tester, 18 Nov).
  const gone = { moment: m('p', 'Pitch', '2026-10-01', { lesson: 'Sleep early the night before.' }), on: '2026-10-01', endsOn: '2026-10-01', key: 'p:2026-10-01' };
  assert.equal(ringNote(gone, {}, TODAY), 'Sleep early the night before.');
  assert.equal(ringNote(gone, { 'p:2026-10-01': { momentId: 'p', occursOn: '2026-10-01', lesson: 'Its own lesson.' } }, TODAY), 'Its own lesson.');
  assert.equal(sprintMoments(ms, { start: weeks[0].start, end: weeks[7].end }).length, 4);
  // M18's drawing: columns 28.25 units apart, tap areas of 25: they overlap.
  const placed = rings.map((r) => ({ ...r, x: (r.week - 1) * 28.25 + 14.125, y: 40 }));
  const w5 = placed[0];
  // 8 units right of week 5's centre, inside its own ring: M18 opened week 6 here.
  assert.equal(nearestRing(placed, { x: w5.x + 8, y: 40 }, 25).week, 5);
  assert.equal(nearestRing(placed, { x: w5.x + 20, y: 40 }, 25).week, 6);
  assert.equal(nearestRing(placed, { x: 5, y: 140 }, 25), null, 'nowhere near a ring');
});

test('View your year: a plain list by month, the sprint it falls in, and moments beyond the sprint waiting', () => {
  const ms = [
    m('investor', 'Investor call', '2026-10-15'),
    m('cup', 'Cup final', '2026-10-31'),
    m('away', 'Board away-day', '2026-11-12', { endsOn: '2026-11-13' }),
    m('ski', 'Ski holiday', '2026-12-19', { endsOn: '2026-12-26', kind: 'rested' }),
    m('half', 'Half marathon', '2027-04-25'),
  ];
  const months = yearMonths(ms, [{ number: 4, start: '2026-09-07', end: '2026-11-01', running: true }, { number: 5, start: '2026-11-02', end: '2026-12-27' }], TODAY);
  assert.deepEqual(months.map((x) => [x.month, x.sprint]), [
    ['October 2026', 'Sprint 4'], ['November 2026', 'Sprint 5'], ['December 2026', 'Sprint 5'],
    ['January 2027', 'No sprint planned yet'], ['February 2027', 'No sprint planned yet'], ['March 2027', 'No sprint planned yet'], ['April 2027', 'No sprint planned yet'],
  ]);
  assert.deepEqual(months[0].moments.map((x) => [x.day, x.name, x.waiting]), [['Thu 15', 'Investor call', false], ['Sat 31', 'Cup final', false]]);
  assert.deepEqual(months[1].moments.map((x) => [x.name, x.until, x.waiting]), [['Board away-day', 'until Fri 13', true]]);
  assert.equal(months[3].moments.length, 0);
});

test('the review after: what was done in the lead-up, each answer once', () => {
  assert.deepEqual(leadUpLines([
    { day: '2026-10-28', text: 'I’ll be in bed by 22:30', did: true },
    { day: '2026-10-29', text: 'I’ll be in bed by 22:30', did: true },
    { day: '2026-10-30', text: 'I’ll be in bed by 22:30', did: true },
  ]), [{ text: 'I’ll be in bed by 22:30', sub: 'Done on 3 of 3 days', good: true }]);
  assert.deepEqual(leadUpLines([{ text: 'I’ll take a lighter training day', did: null }]), [{ text: 'I’ll take a lighter training day', sub: 'Not ticked', good: false }]);
  assert.deepEqual(leadUpLines([{ text: '  ' }]), []);
});

test('places: a city and its IANA zone, from the one time library', () => {
  assert.deepEqual(searchCities('new y')[0], { city: 'New York', zone: 'America/New_York', line: 'New York time', hint: null });
  assert.equal(searchCities('lond')[0].zone, 'Europe/London');
  assert.equal(searchCities('lond')[0].line, 'UK time');
  assert.deepEqual(searchCities('n'), [], 'two letters first');
  for (const c of searchCities('an', 50)) assert.match(c.zone, /^[A-Za-z]+(\/[A-Za-z0-9_+-]+){1,2}$/, 'a zone 048 accepts');
});

test('places: no second line repeating the city, current names, Delhi and Mumbai (the UI and break-it testers, 18 Nov)', () => {
  for (const c of searchCities('an', 50)) if (c.hint) assert.equal(repeatsItsAnswer(c.city, c.hint), false, `${c.city} / ${c.hint}`);
  assert.equal(searchCities('new york')[0].hint, null, 'never “New York” over “New York time”');
  assert.equal(searchCities('kolk')[0].hint, 'India time', 'the country where it says something');
  const named = (q) => searchCities(q, 10).map((c) => `${c.city} ${c.zone}`);
  assert.ok(named('kolkata').includes('Kolkata Asia/Kolkata'));
  assert.ok(named('delhi').includes('Delhi Asia/Kolkata'));
  assert.ok(named('mumbai').includes('Mumbai Asia/Kolkata'));
  assert.ok(named('kyiv').includes('Kyiv Europe/Kyiv'));
  assert.ok(named('kathm').includes('Kathmandu Asia/Kathmandu'));
  assert.ok(named('yangon').includes('Yangon Asia/Yangon'));
  assert.ok(named('ho chi').includes('Ho Chi Minh City Asia/Ho_Chi_Minh'));
  assert.ok(named('st john').includes('St John’s America/St_Johns'));
  assert.ok(named('buenos').includes('Buenos Aires America/Argentina/Buenos_Aires'));
  for (const old of ['calcutta', 'kiev', 'saigon', 'rangoon', 'katmandu']) assert.deepEqual(named(old), [], old);
  assert.ok(!searchCities('st j', 10).some((c) => c.city === 'St Johns'));
});

test('names: characters nobody can see are taken out, so a name of only those is no name (the break-it tester, 18 Nov)', () => {
  assert.equal(cleanMomentName('\u200b\u202e\u2060 '), '');
  assert.equal(cleanMomentName(' Cup\u202e final\u200b '), 'Cup final');
  assert.equal(cleanMomentName('Cup final 👩‍👩‍👧'), 'Cup final 👩‍👩‍👧', 'an emoji keeps its joiners');
  const x = m('u', '\u200b\u202e', '2026-11-12');
  assert.equal(x.name, '');
  assert.equal(isComplete({ ...x, area: 'work', kind: 'perform' }), false);
  assert.equal(firstUnanswered(x), 'name');
});

test('a stop day before the start is never kept, on any path (the break-it tester, 18 Nov)', () => {
  const weekly = m('w', 'Stand-up', '2026-11-02', { repeat: { every: 'week', until: '2026-11-30' } });
  assert.equal(repeatProblem({ ...weekly, startsOn: '2026-12-07' }), 'It can’t stop before it starts. Choose a later day, or none.');
  assert.equal(isComplete({ ...weekly, startsOn: '2026-12-07', endsOn: '2026-12-07' }), false, 'onEdited and Finish both ask isComplete');
  assert.equal(firstUnanswered({ ...weekly, startsOn: '2026-12-07', endsOn: '2026-12-07' }), 'repeat');
  // Moving "When is it?" past the stop day lets the stop day go, so the summary says it keeps going.
  const moved = withStart(weekly, '2026-12-07');
  assert.deepEqual(moved.repeat, { every: 'week' });
  assert.equal(isComplete(moved), true);
  assert.deepEqual(withStart(weekly, '2026-11-09').repeat, { every: 'week', until: '2026-11-30' });
  // An older copy kept with one is read without it.
  assert.deepEqual(tidyMoment({ ...weekly, repeat: { every: 'week', until: '2026-10-01' } }).repeat, { every: 'week' });
});

test('every moment the device holds shows somewhere: a stopped repeat in Past, by its last time (the break-it tester, 18 Nov)', () => {
  const stopped = m('st', 'Old stand-up', '2026-09-07', { repeat: { every: 'week', until: '2026-09-21' } });
  const v = listView([stopped], {}, TODAY);
  assert.equal(v.comingUp.length, 0);
  assert.deepEqual(v.past.map((o) => [o.moment.id, o.on, Boolean(o.stray)]), [['st', '2026-09-21', false]]);
  // One with no day it comes round on at all still shows, and can be opened.
  const odd = { ...stopped, id: 'odd', repeat: { every: 'week', until: '2026-01-01' } };
  const w = listView([odd], {}, TODAY);
  assert.equal(w.past.length, 1);
  assert.equal(w.past[0].stray, true);
});

test('29 Feb comes round in leap years, however far ahead (the break-it tester, 18 Nov)', () => {
  const leap = m('leap', 'Leap day run', '2024-02-29', { repeat: { every: 'year' } });
  assert.equal(nextOccurrence(leap, '2026-03-01').on, '2028-02-29');
  assert.equal(nextOccurrence(leap, '2096-03-01').on, '2104-02-29', 'past 2100, which isn’t a leap year');
  const thirty = m('31', 'Month end', '2026-01-31', { repeat: { every: 'month_date' } });
  assert.equal(nextOccurrence(thirty, '2026-02-01').on, '2026-03-31');
  assert.deepEqual(occurrences(leap, '2025-01-01', '2033-01-01').map((o) => o.on), ['2028-02-29', '2032-02-29']);
});

test('a review’s address must be a day the moment comes round on (the break-it tester, 18 Nov)', () => {
  const weekly = m('w', 'Stand-up', '2026-11-02', { repeat: { every: 'week' } });
  assert.equal(comesRoundOn(weekly, '2026-11-16'), true);
  assert.equal(comesRoundOn(weekly, '2026-11-17'), false);
  assert.equal(comesRoundOn(weekly, '2026-10-26'), false, 'before it began');
  assert.equal(comesRoundOn(m('one', 'Cup final', '2026-10-31'), '2026-10-31'), true);
  assert.equal(comesRoundOn(m('one', 'Cup final', '2026-10-31'), '2026-11-01'), false);
});

test('ids are looked up as the list’s own, never something every object carries (the break-it tester, 18 Nov)', () => {
  const list = { a: 1 };
  for (const k of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) assert.equal(ownEntry(list, k), undefined, k);
  assert.equal(ownEntry(list, 'a'), 1);
  assert.equal(ownEntry(null, 'a'), undefined);
});

test('the page: its explanation, its tab and its menu place', () => {
  assert.deepEqual(EXPLAIN, { title: 'What’s a peak moment?', terms: [{ term: 'Peak moment', meaning: 'A moment that needs more of your energy, attention and focus, because of its cognitive, physical or social demands.' }] });
  assert.equal(tabTitle('/peak-moments'), 'Peak moments, The Clarity Portal');
  assert.equal(tabTitle('/peak-moments/add'), 'Add peak moment, The Clarity Portal');
  assert.equal(areaOf('/peak-moments'), 'personal');
});
