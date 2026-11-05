// Patterns in your numbers on the device (src/lib/performance/patterns.js;
// methods M14; the 23 pattern rules, START-HERE 5d; Phase 5 step 3): the
// day score (M14.2) as worked examples, the person built from their own
// rows, the weekly check and the night-after-an-edit recheck, the debrief
// introducing at most one card a week, "No clear link yet", the logging
// gap explained once, and the card words. The engine's own cases are in
// tests/patterns; its proof is npm run sim:patterns.
// Run with npm run test:performance.
import test from 'node:test';
import assert from 'node:assert/strict';
import { addDays } from '../../src/lib/scores/dates.js';
import { m14DayScore, m14Rng } from '../../src/lib/scores/index.js';
import {
  buildPatternPerson, chanceWords, debriefPattern, fingerprint, hidePattern, isSleepHabit, markDebriefPattern,
  nextPatternState, patternCardWords, patternCheckDue, patternSeed, patternsRow, readPatternState, shownCards,
  storedPatternState, PATTERNS_KEY,
} from '../../src/lib/performance/patterns.js';

// ---------------------------------------------------------------- M14.2 the day score

test('M14.2 worked example: the impact-weighted share of the day\'s planned items done', () => {
  const score = m14DayScore({
    habits: [
      { measure: 'count', target: 20, targetPer: 'day', impact: 2, value: 10 },         // half: 2 × 0.5
      { measure: 'yes_no_days_target', target: 4, impact: 1, value: 1 },                // done: 1 × 1
      { measure: 'count', target: 8, targetPer: 'day', impact: 3, sleep: true, value: 8 }, // a sleep habit: left out
      { measure: 'rating', target: 4, impact: 3, value: 2 },                             // no daily target: left out
      { measure: 'count', target: 3, targetPer: 'week', impact: 3, value: 1 },           // a weekly target: left out
    ],
    todos: [{ impact: 3, done: true }, { impact: 1, done: false }],
  });
  // (2 × 0.5 + 1 × 1 + 3 × 1 + 1 × 0) ÷ (2 + 1 + 3 + 1) = 5 ÷ 7
  assert.ok(Math.abs(score - (500 / 7)) < 1e-9, String(score));
  assert.equal(m14DayScore({ habits: [{ measure: 'count', target: 5, targetPer: 'day', value: 40 }] }), 100, 'never above all of it');
  assert.equal(m14DayScore({ habits: [{ measure: 'count', target: 5, targetPer: 'day', value: null }] }), 0, 'nothing logged is nothing done');
  assert.equal(m14DayScore({ habits: [{ measure: 'yes_no_weekly', impact: 2, value: 1 }], todos: [] }), null, 'no daily item: no day score');
});

test('A sleep habit is known by its name', () => {
  assert.ok(isSleepHabit('Sleep 7 hours'));
  assert.ok(isSleepHabit('In bed by 22:30'));
  assert.ok(isSleepHabit('Wind down before bed'));
  assert.equal(isSleepHabit('Weekly strategic block'), false);
  assert.equal(isSleepHabit('Bedrock reading'), false);
});

// ---------------------------------------------------------------- invented rows

// Two sprints across the last 26 weeks: Sprint 1 (10 weeks, finished) and
// Sprint 2 (16 weeks, running), both Monday to Sunday. Two habits serve
// "Grow through referrals": the weekly strategic block (yes or no, once a
// week) and client calls (a count, 5 a week, logged Monday to Thursday).
// With `planted`, client calls run higher in the weeks the block was kept,
// so the block's link with its Strategy, worked out without it, is real.
const S1 = { id: 'sp1', plan_id: 'p1', number: 1, label: null, start_on: '2026-02-09', length_weeks: 10, standard: 85, status: 'finished', planned_end_on: '2026-04-19', actual_end_on: '2026-04-19' };
const S2 = { id: 'sp2', plan_id: 'p1', number: 2, label: null, start_on: '2026-04-20', length_weeks: 16, standard: 85, status: 'running', planned_end_on: '2026-08-09', actual_end_on: null };
const TODAY = '2026-08-05'; // Wednesday of Sprint 2's week 16: 25 finished weeks

function rowsFor({ planted = true, weeks = 26, seed = 3, oddSleep = false } = {}) {
  const rng = m14Rng(seed);
  const sprints = [S1, S2];
  const bySprint = {};
  const dayPlans = [];
  let n = 0;
  for (const s of sprints) {
    const a = { id: `${s.id}-a`, sprint_id: s.id, habit_id: 'hA', strategy_id: 's1', name: 'Weekly strategic block', sort_order: 0 };
    const b = { id: `${s.id}-b`, sprint_id: s.id, habit_id: 'hB', strategy_id: 's1', name: 'Client calls', sort_order: 1 };
    const settings = [
      { sprint_habit_id: a.id, from_week: 1, measure: 'yes_no_weekly', impact: 2 },
      { sprint_habit_id: b.id, from_week: 1, measure: 'count', target: 5, target_per: 'week', impact: 2 },
    ];
    const logs = [];
    for (let w = 1; w <= s.length_weeks; w += 1) {
      n += 1;
      if (n > weeks) break;
      const mon = addDays(s.start_on, (w - 1) * 7);
      const kept = rng() < 0.5;
      if (kept) logs.push({ id: `${a.id}-${w}`, sprint_habit_id: a.id, local_date: mon, value: 1, to_confirm: false });
      const total = planted ? (kept ? 5 : 2 + Math.floor(rng() * 2)) : 2 + Math.floor(rng() * 4);
      const perDay = [1, 1, 1, 1];
      for (let k = 4; k < total; k += 1) perDay[k % 4] += 1;
      if (total < 4) perDay[3] = 0;
      if (total < 3) perDay[2] = 0;
      perDay.forEach((v, i) => logs.push({ id: `${b.id}-${w}-${i}`, sprint_habit_id: b.id, local_date: addDays(mon, i), value: v, to_confirm: false }));
      for (let i = 0; i < 5; i += 1) {
        const day = addDays(mon, i);
        dayPlans.push({ id: `dp-${day}`, local_date: day, sleep_hours: oddSleep && i === 0 ? 20 : 7, sleep_quality: 'good', sleep_to_confirm: oddSleep && i === 0 });
      }
    }
    bySprint[s.id] = { sprintHabits: [a, b], sprintSettings: settings, logs, todos: [], todoMoves: [] };
  }
  return {
    sprints, recoveries: [], workingPatterns: [], debriefs: [],
    strategies: [{ id: 's1', plan_id: 'p1', name: 'Grow through referrals', sort_order: 0, archived_at: null }],
    links: [], objectives: [], figures: [], wins: [], winLinks: [],
    dayPlans, dayPlanTodos: [], dayReviews: [], allTodos: [], bySprint,
  };
}

const empty = () => readPatternState({});
const seedOf = (built) => patternSeed('person-1', built.check.key);

// ---------------------------------------------------------------- the person from their rows

test('The person is built from their own rows: the last 26 weeks, scored as the sprint page scores them', () => {
  const built = buildPatternPerson(rowsFor(), TODAY);
  assert.equal(built.person.weeks.length, 25, 'every finished week of the last 26 weeks');
  assert.deepEqual(built.check, { key: 'sp2:15', end: '2026-08-02' }, 'the latest finished week');
  const w = built.person.weeks[0];
  assert.equal(w.eligible, true, '4 days logged, nothing unusual');
  assert.equal(typeof w.habits.hA.kept, 'boolean');
  assert.equal(w.habits.hA.strategyId, 's1');
  // L3's result: the Strategy's score worked out without the habit (M14.1)
  // is client calls' own score here, its only other item.
  const calls = built.person.weeks.map((x) => x.strategies.s1.without.hA);
  assert.ok(calls.every((v) => v >= 40 && v <= 100), calls.join());
  assert.equal(built.names.habits.hA, 'Weekly strategic block');
  assert.equal(built.names.strategies.s1, 'Grow through referrals');
  assert.equal(built.names.sprintHabitOf.hA, 'sp2-a', 'the action opens the running sprint\'s own habit');
  assert.equal(built.person.days.length, 26 * 7 - 1, 'every day of the last 26 weeks up to yesterday');
  assert.equal(built.fp, fingerprint(built.person));
});

test('Rule 14: an odd night (20 hours) is left out until it is confirmed', () => {
  const built = buildPatternPerson(rowsFor({ oddSleep: true }), TODAY);
  const odd = built.person.days.filter((d) => d.sleepHours === 20);
  assert.ok(odd.length > 0 && odd.every((d) => d.sleepToConfirm));
});

test('Rule 12: a week marked unusual in the debrief, or in Recovery, is left out', () => {
  const rows = rowsFor();
  rows.debriefs = [{ sprint_id: 'sp2', sprint_week: 3, unusual: true, status: 'finished', stress: 'a_little' }];
  const built = buildPatternPerson(rows, TODAY);
  const w = built.weeks.find((x) => x.key === 'sp2:3');
  assert.equal(w.eligible, false);
  assert.equal(w.stress, 'a_little');
});

test('Rule 20: only the last 6 months; older weeks fade out', () => {
  const built = buildPatternPerson(rowsFor(), addDays(TODAY, 70));
  assert.ok(built.person.weeks.length <= 26);
  assert.ok(built.weeks.every((w) => w.end >= addDays(addDays(TODAY, 70), -182)));
});

// ---------------------------------------------------------------- the check, steady

test('A planted link becomes a card at the weekly check, the same every time (rule 1)', () => {
  const built = buildPatternPerson(rowsFor(), TODAY);
  assert.equal(patternCheckDue(empty(), built, TODAY), true);
  const a = nextPatternState(empty(), built, { today: TODAY, seed: seedOf(built) });
  const b = nextPatternState(empty(), built, { today: TODAY, seed: seedOf(built) });
  assert.equal(a.changed, true);
  assert.deepEqual(a.state, b.state, 'deterministic');
  assert.equal(a.state.cards.length, 1, 'at most one new card a week');
  const card = a.state.cards[0];
  assert.equal(card.id, 'L3');
  assert.ok(['strong', 'clear'].includes(card.strength));
  assert.ok(card.q < 0.026 && card.holds);
  assert.ok(a.state.evaluated >= 2);
  assert.equal(patternCheckDue(a.state, built, TODAY), false, 'nothing due again this week');
});

test('Rule 23: an edit is rechecked the night after, from the cards before this week\'s check', () => {
  const built = buildPatternPerson(rowsFor(), TODAY);
  const first = nextPatternState(empty(), built, { today: TODAY, seed: seedOf(built) }).state;
  // The person's numbers change the same day: no recheck until a later day.
  const edited = buildPatternPerson(rowsFor({ planted: false }), TODAY);
  assert.equal(patternCheckDue(first, edited, TODAY), false);
  const tomorrow = addDays(TODAY, 1);
  assert.equal(patternCheckDue(first, edited, tomorrow), true);
  const again = nextPatternState(first, edited, { today: tomorrow, seed: seedOf(edited) }).state;
  // With no real link left, the card was quietly removed (it was found this
  // week, so the 4-week rule doesn't hold it: it starts again from before).
  assert.equal(again.cards.length, 0);
  assert.deepEqual(again.before, first.before);
});

test('No real link: no card, and "No clear link yet" once there is enough data (rule 21)', () => {
  const built = buildPatternPerson(rowsFor({ planted: false, seed: 11 }), TODAY);
  const s = nextPatternState(empty(), built, { today: TODAY, seed: seedOf(built) }).state;
  assert.equal(s.cards.length, 0);
  assert.ok(s.evaluated > 0);
  const row = patternsRow(s, TODAY, built.names);
  assert.equal(row.line, 'No clear link yet.');
  assert.deepEqual(row.empty, [
    'No clear link yet.',
    'A card only shows when a link is strong enough that it’s very unlikely to be chance.',
    'Your numbers are checked again every week.',
  ]);
  assert.equal(row.figure, null);
});

test('Too little data: no row, and the debrief explains the gap once (rule 22)', () => {
  const built = buildPatternPerson(rowsFor({ weeks: 4 }), '2026-03-12');
  const s = nextPatternState(empty(), built, { today: '2026-03-12', seed: seedOf(built) }).state;
  assert.equal(s.evaluated, 0);
  assert.equal(patternsRow(s, '2026-03-12', built.names), null);
  const shown = debriefPattern(s, 'sp1:4', built);
  assert.equal(shown.kind, 'gap');
  assert.deepEqual(shown.lines, [
    'Patterns in your numbers appear once there’s enough data, usually after 8 to 12 weeks.',
    'Weeks with fewer than 4 days logged are left out, so logging most days helps.',
  ]);
  const after = markDebriefPattern(s, 'sp1:4', shown, '2026-03-12');
  assert.equal(debriefPattern(after, 'sp1:5', built), null, 'only once');
});

test('Too little data, 0 to 2 weeks (break-it tester): no card, no row, no figure, and a broken saved state is read as empty', () => {
  for (const [weeks, today] of [[0, '2026-02-11'], [1, '2026-02-18'], [2, '2026-02-25']]) {
    const built = buildPatternPerson(rowsFor({ weeks }), today);
    // The page runs the check only when one is due (patternCheckDue: never with no finished week).
    if (!built.check) assert.equal(patternCheckDue(empty(), built, today), false, `${weeks} weeks: no check due`);
    const s = built.check ? nextPatternState(empty(), built, { today, seed: seedOf(built) }).state : empty();
    assert.equal(s.cards.length, 0, `${weeks} weeks: no card`);
    assert.equal(shownCards(s, today).length, 0, `${weeks} weeks: nothing shown`);
    assert.equal(patternsRow(s, today, built.names), null, `${weeks} weeks: no dashboard row`);
  }
  for (const garbage of ['not an object', [1, 2, 3], { cards: 'x', week: 5, shown: { a: null } }, null, 42]) {
    const s = readPatternState({ patterns: garbage });
    assert.equal(shownCards(s, '2026-02-25').length, 0);
    assert.equal(patternsRow(s, '2026-02-25', {}), null);
  }
});

test('Rule 17: a new card arrives in the weekly debrief, at most one a week, then shows on the dashboard', () => {
  const built = buildPatternPerson(rowsFor(), TODAY);
  const s = nextPatternState(empty(), built, { today: TODAY, seed: seedOf(built) }).state;
  assert.equal(shownCards(s, TODAY).length, 0, 'not on the dashboard before the debrief');
  assert.equal(patternsRow(s, TODAY, built.names), null, 'found but not yet introduced: no row, and never a "No clear link yet" that isn\'t true');
  const shown = debriefPattern(s, 'sp2:16', built);
  assert.equal(shown.kind, 'card');
  assert.equal(shown.card.key, s.cards[0].key);
  const after = markDebriefPattern(s, 'sp2:16', shown, TODAY);
  assert.equal(shownCards(after, TODAY).length, 1);
  // The same debrief opened again shows the same card; it isn't introduced twice.
  const again = debriefPattern(after, 'sp2:16', built);
  assert.equal(again.card.key, shown.card.key);
  assert.equal(again.mark, false);
  // Next week's debrief has nothing new to introduce.
  assert.equal(debriefPattern(after, 'sp3:1', built), null);
  // Someone who skips the debrief sees it once that week's window has closed.
  assert.equal(shownCards(s, addDays(s.cards[0].end, 4)).length, 1);
  const row = patternsRow(after, TODAY, built.names);
  assert.equal(row.line, '1 pattern has been found in your own numbers.');
  assert.equal(row.figure.text, '1');
});

test('Not useful hides a card for this person', () => {
  const built = buildPatternPerson(rowsFor(), TODAY);
  let s = nextPatternState(empty(), built, { today: TODAY, seed: seedOf(built) }).state;
  s = markDebriefPattern(s, 'sp2:16', debriefPattern(s, 'sp2:16', built), TODAY);
  s = hidePattern(s, s.cards[0].key);
  assert.equal(shownCards(s, TODAY).length, 0);
});

test('The state is cleaned when read and stays small when stored', () => {
  assert.deepEqual(readPatternState({ [PATTERNS_KEY]: { cards: [{ key: 1 }, { key: 'L3:x', shownAt: 3 }], hidden: [5, 'a'], week: 4 } }).cards, [{ key: 'L3:x', shownAt: 3 }]);
  assert.equal(readPatternState({ [PATTERNS_KEY]: 'odd' }).week, null);
  const built = buildPatternPerson(rowsFor(), TODAY);
  const s = nextPatternState(empty(), built, { today: TODAY, seed: seedOf(built) }).state;
  const big = { ...s, cards: [0, 1, 2, 3].map((i) => ({ ...s.cards[0], key: `L3:h${i}` })) };
  assert.ok(JSON.stringify(storedPatternState(big)).length < 4000, 'well under the 16 KB the settings hold');
});

// ---------------------------------------------------------------- the words

test('The card in words: in weeks you…, an open question, one action, How was this worked out?', () => {
  const built = buildPatternPerson(rowsFor(), TODAY);
  const s = nextPatternState(empty(), built, { today: TODAY, seed: seedOf(built) }).state;
  const c = s.cards[0];
  const w = patternCardWords(c, built.names);
  const habit = built.names.habits[c.subject];
  assert.equal(w.kind, 'A habit and its Strategy');
  assert.ok(['Strong link', 'Clear link'].includes(w.strength));
  assert.match(w.line, new RegExp(`^In weeks you kept “${habit}”, “Grow through referrals” scored \\d+ points? higher\\.$`));
  assert.ok(!/because/i.test([w.line, w.question, ...w.how].join(' ')), 'never because');
  assert.match(w.question, /\?$/);
  assert.equal(w.action.label, 'Plan it into this week');
  assert.equal(w.action.to, '/performance-sprint');
  assert.equal(w.how[0], `Compared ${c.sizes[0]} weeks with “${habit}” kept with ${c.sizes[1]} weeks without.`);
  assert.ok(w.how.some((l) => /^Average \d+% against \d+%\.$/.test(l)));
  assert.ok(w.how.some((l) => l.startsWith('A gap this big would happen by chance')));
  assert.equal(w.how[w.how.length - 1], 'It held in both halves of your data, and it’s rechecked every week.');
  for (const l of [w.line, w.question, ...w.how]) assert.ok(!/[:()]/.test(l), `no colons or brackets: ${l}`);
});

test('Sleep cards never show the day score as a number (M14.2)', () => {
  const w = patternCardWords({ key: 'L1', id: 'L1', strength: 'strong', sizes: [64, 41], values: [86, 77], gap: 9, swing: 11, q: 0.004, holds: true }, {});
  assert.equal(w.line, 'After nights of 7 hours or more, you got more of your day’s plan done.');
  assert.equal(w.strength, 'Strong link');
  assert.equal(w.action.label, 'Plan my sleep');
  assert.ok(![w.line, ...w.how].some((l) => /86|77|%/.test(l)), 'no day score figures');
  assert.ok(w.how.includes('The gap was 0.8 times your usual swing from day to day.'));
});

test('Chance in words (M14.8)', () => {
  assert.equal(chanceWords(0.0033), 'A gap this big would happen by chance about 1 time in 300, allowing for every link checked.');
  assert.equal(chanceWords(0.02), 'A gap this big would happen by chance about 1 time in 50, allowing for every link checked.');
  assert.equal(chanceWords(0.0001), 'A gap this big would happen by chance less than 1 time in 1,000, allowing for every link checked.');
});

test('The other links in words: stress, the way of being, and effort then results', () => {
  const base = { strength: 'clear', sizes: [12, 10], values: [88, 76], gap: 7.6, swing: 6, q: 0.01, holds: true };
  assert.equal(patternCardWords({ ...base, key: 'L4', id: 'L4' }).line, 'In weeks your stress was “Not at all” or “A little”, your performance score was 8 points higher.');
  assert.equal(patternCardWords({ ...base, key: 'L5', id: 'L5' }).line, 'In weeks you rated how you wanted to be 7 or more on average, your performance score was 8 points higher.');
  const names = { strategies: { s1: 'Grow through referrals' }, objectives: { o1: { name: 'Coaching clients', unit: 'clients', direction: 'up' } } };
  const l6 = patternCardWords({ ...base, key: 'L6:s1:o1', id: 'L6', subject: 's1:o1', values: [1.5, 0.4], gap: 1.1 }, names);
  assert.equal(l6.line, 'In the weeks after “Grow through referrals” was at your standard, “Coaching clients” rose by 1.1 clients more, 2 to 4 weeks later.');
  assert.equal(l6.action.label, 'Plan “Grow through referrals” into this week');
  assert.ok(l6.how.includes('It rose by 1.5 on average, against 0.4 after other weeks.'));
});
