// The Performance Sprint page's view (src/lib/performance/sprintPage.js):
// every figure checked against the methods' worked examples (M5-1, M8-1)
// through the same rows the page loads, plus the screen choices the
// methods leave open (which to-dos show this week, the habit lines).
// Run with npm run test:performance.
import test from 'node:test';
import assert from 'node:assert/strict';
import { logRow, moveOptions, sprintPageView, sprintTodos } from '../../src/lib/performance/index.js';
import { m0SprintCalendar } from '../../src/lib/scores/index.js';
import { shownUnit, toShown, toStored } from '../../src/lib/units.js';

// M5-1: Sam works Monday to Friday, standard 85. Week 1 of a sprint from
// Mon 5 Oct 2026, seen on Wed 14 Oct (week 1 finished on Sun 11 Oct).
function m51(over = {}) {
  const S = { G: 'grow', E: 'energy', D: 'craft' };
  const setting = (id, sh, m) => ({ id, sprint_habit_id: sh, from_week: 1, unit: null, target: null, target_per: null, limit_value: null, limit_per: null, direction: null, top_number: null, ...m });
  const log = (sh, date, value) => ({ id: `${sh}-${date}`, sprint_habit_id: sh, local_date: date, value, to_confirm: false });
  return {
    plan: { id: 'p' },
    sprint: { id: 'sp', number: 1, status: 'running', start_on: '2026-10-05', length_weeks: 2, standard: 85, label: null },
    objectives: [{ id: 'o1' }, { id: 'o2' }, { id: 'o3' }],
    strategies: [{ id: S.G, name: 'Grow through referrals' }, { id: S.E, name: 'Sustain my energy' }, { id: S.D, name: 'Deepen my coaching craft' }],
    links: [{ strategy_id: S.G, objective_id: 'o1' }, { strategy_id: S.G, objective_id: 'o2' }, { strategy_id: S.E, objective_id: 'o3' }, { strategy_id: S.D, objective_id: 'o2' }],
    workingPatterns: [],
    recoveries: [],
    personSettings: { units: 'metric' },
    weekScores: [],
    debriefs: [],
    sprintHabits: [
      { id: 'ref', strategy_id: S.G, name: 'Referral conversations' },
      { id: 'train', strategy_id: S.E, name: 'Training sessions' },
      { id: 'late', strategy_id: S.E, name: 'Late finishes' },
      { id: 'read', strategy_id: S.D, name: 'Reading' },
    ],
    sprintSettings: [
      setting('a', 'ref', { measure: 'count', target: 3, target_per: 'week', impact: 3 }),
      setting('b', 'train', { measure: 'count', target: 3, target_per: 'week', impact: 3 }),
      setting('c', 'late', { measure: 'yes_no_days_limit', limit_value: 2, impact: 2 }),
      setting('d', 'read', { measure: 'amount', unit: 'minutes', target: 100, target_per: 'week', impact: 1 }),
    ],
    logs: [
      log('ref', '2026-10-05', 1), log('ref', '2026-10-07', 1),
      log('train', '2026-10-05', 1), log('train', '2026-10-07', 1), log('train', '2026-10-09', 1),
      log('late', '2026-10-05', 1), log('late', '2026-10-06', 1), log('late', '2026-10-07', 1),
      log('read', '2026-10-06', 60), log('read', '2026-10-08', 60),
    ],
    todos: [
      { id: 't1', strategy_id: S.G, text: 'Email three past clients', impact: 2, sprint_id: 'sp', planned_week: 1, created_on: '2026-10-05', done_on: '2026-10-06' },
      { id: 't2', strategy_id: S.D, text: 'Record a session review', impact: 3, sprint_id: 'sp', planned_week: 1, created_on: '2026-10-05', done_on: null },
    ],
    todoMoves: [],
    wins: [{ id: 'w1', what: 'A referral came in', local_date: '2026-10-08', impact: 1 }],
    winLinks: [{ win_id: 'w1', strategy_id: S.G }],
    ...over,
  };
}

test('M5-1: the finished week scores 67.9%, shown as 68%, a grey week', () => {
  const v = sprintPageView(m51(), { today: '2026-10-14' });
  assert.equal(v.state, 'running');
  assert.equal(v.current, 2);
  assert.ok(Math.abs(v.weeks[0].raw - 67.9167) < 0.001, `${v.weeks[0].raw}`);
  assert.equal(v.weeks[0].score, 68);
  assert.equal(v.weeks[0].state, 'below');
  assert.equal(v.weeks[0].tip.value, 'Performance score 68%');
  assert.deepEqual(v.weeks[0].tip.extra, ['Below your standard']);
  assert.equal(v.average.value, '68%');
  assert.equal(v.average.note, 'Week 1.');
  assert.deepEqual(v.toFreeze, [1]);
});

test('a week already frozen as final is not frozen again', () => {
  const v = sprintPageView(m51({ weekScores: [{ sprint_id: 'sp', sprint_week: 1, final: true, eligible: true, score: 68, week_end: '2026-10-11' }] }), { today: '2026-10-14' });
  assert.deepEqual(v.toFreeze, []);
});

test('this week so far: targets pro rata, open to-dos not counted yet (M5)', () => {
  // Wed 14 Oct, week 2: 3 of 5 working days gone. Training 2 of a pro rata 1.8: 100.
  const d = m51();
  d.logs.push({ id: 'x', sprint_habit_id: 'train', local_date: '2026-10-12', value: 2, to_confirm: false });
  const v = sprintPageView(d, { today: '2026-10-14' });
  assert.equal(v.weeks[1].state, 'now');
  // Only training is expected so far (counts pro rata; the limit isn't logged on half the days so far: 0, Not logged).
  const train = v.habits.find((h) => h.id === 'train');
  assert.equal(train.bar, 1);
  assert.equal(train.line, '2 of 3 this week');
  const late = v.habits.find((h) => h.id === 'late');
  assert.equal(late.notLogged, true);
  // Referrals 0 of 1.8 (grow 0), energy (3 × 100 + 2 × 0) ÷ 5 = 60, reading 0 of 60 (craft 0);
  // last week's to-dos aren't this week's: (2 × 0 + 1 × 60 + 1 × 0) ÷ 4 = 15.
  assert.equal(v.soFar.value, 15);
  assert.equal(v.soFar.good, false);
});

test('the usual range waits for 6 weeks, then reads as a sentence (M8-1)', () => {
  const none = sprintPageView(m51(), { today: '2026-10-14' });
  assert.equal(none.usualLine.lead, 'Your usual range appears after 6 weeks.');
  const scores = [78, 82, 85, 74, 88, 90, 81, 79].map((score, i) => ({ sprint_id: 'old', sprint_week: i + 1, eligible: true, final: true, score, week_end: `2026-0${(i % 8) + 1}-20` }));
  // The finished M5-1 week (67.9%, 5 days logged) is eligible too.
  const v = sprintPageView(m51({ weekScores: scores }), { today: '2026-10-14' });
  assert.equal(`${v.usualLine.lead}${v.usualLine.figure}${v.usualLine.end}`, 'Your usual range is 78 to 85%.');
  const only = sprintPageView(m51({ weekScores: scores, logs: [] }), { today: '2026-10-14' });
  assert.equal(`${only.usualLine.lead}${only.usualLine.figure}${only.usualLine.end}`, 'Your usual range is 79 to 86%.');
});

test('the dial weeks: finished, this week, to come, with their pop-ups', () => {
  const v = sprintPageView(m51(), { today: '2026-10-14' });
  assert.deepEqual(v.weeks.map((w) => w.state), ['below', 'now']);
  assert.equal(v.weeks[1].tip.when, 'Week 2, this week so far');
  assert.equal(v.dayInWeek, 2);
  assert.equal(v.endsIn.label, 'Sprint ends in');
  assert.equal(v.endsIn.value, '4 days');
});

test('states: future, over, paused, no sprint', () => {
  assert.equal(sprintPageView(m51(), { today: '2026-10-01' }).state, 'future');
  assert.equal(sprintPageView(m51(), { today: '2026-10-01' }).startsOn, 'Mon 5 Oct');
  const over = sprintPageView(m51(), { today: '2026-10-19' });
  assert.equal(over.state, 'over');
  assert.equal(over.endedOn, 'Sun 18 Oct');
  assert.equal(sprintPageView(m51({ recoveries: [{ start_on: '2026-10-13', ended_at: null }] }), { today: '2026-10-14' }).state, 'paused');
  assert.equal(sprintPageView(m51({ sprint: null }), { today: '2026-10-14' }).state, 'none');
});

test('to-dos this week: rolled over, moved out after the start, done early, later', () => {
  const d = m51({
    sprint: { id: 'sp', number: 1, status: 'running', start_on: '2026-10-05', length_weeks: 4, standard: 85 },
    todos: [
      { id: 'roll', strategy_id: 'grow', text: 'Rolled', impact: 2, sprint_id: 'sp', planned_week: 1, created_on: '2026-10-05', done_on: null },
      { id: 'out', strategy_id: 'grow', text: 'Moved out', impact: 2, sprint_id: 'sp', planned_week: 4, created_on: '2026-10-05', done_on: null },
      { id: 'early', strategy_id: 'craft', text: 'Done early', impact: 2, sprint_id: 'sp', planned_week: 3, created_on: '2026-10-05', done_on: '2026-10-13' },
      { id: 'later', strategy_id: 'craft', text: 'Later', impact: 2, sprint_id: 'sp', planned_week: 3, created_on: '2026-10-05', done_on: null },
      { id: 'old', strategy_id: 'craft', text: 'Done last week', impact: 2, sprint_id: 'sp', planned_week: 1, created_on: '2026-10-05', done_on: '2026-10-06' },
    ],
    todoMoves: [{ todo_id: 'out', moved_on: '2026-10-13', from_sprint_id: 'sp', from_week: 2, to_sprint_id: 'sp', to_week: 4 }],
  });
  const cal = m0SprintCalendar({ start: '2026-10-05', lengthWeeks: 4, recoveries: [] }, '2026-10-14');
  const t = sprintTodos(d, cal, 2, '2026-10-14');
  const by = Object.fromEntries(t.thisWeek.map((x) => [x.id, x]));
  assert.equal(by.roll.rolledFrom, 1);
  assert.equal(by.out.movedOut, true);
  assert.equal(by.out.movedTo, 4);
  assert.equal(by.early.done, true);
  assert.equal(by.old, undefined);
  assert.deepEqual(t.later.map((x) => x.id), ['later', 'out']);
  assert.equal(t.later[0].when, 'Week 3, Mon 19 Oct to Sun 25 Oct');
  assert.equal(t.done, 1);
  assert.equal(t.total, 2);
  assert.equal(t.wins.length, 0);
});

test('move options: later weeks for one due now, any other week for a later one', () => {
  const cal = m0SprintCalendar({ start: '2026-10-05', lengthWeeks: 4, recoveries: [] }, '2026-10-14');
  assert.deepEqual(moveOptions(cal, 2, 4, { plannedWeek: 2 }, '2026-10-14').map((o) => o.value), [3, 4]);
  assert.deepEqual(moveOptions(cal, 2, 4, { plannedWeek: 3 }, '2026-10-14').map((o) => o.value), [2, 4]);
  assert.equal(moveOptions(cal, 2, 4, { plannedWeek: 3 }, '2026-10-14')[0].label, 'This week, Mon 12 Oct to Sun 18 Oct');
  assert.deepEqual(moveOptions(cal, 4, 4, { plannedWeek: 4 }, '2026-11-01'), []);
  // A to-do due this week moves to a later week: none of those is "This week".
  assert.equal(moveOptions(cal, 2, 4, { plannedWeek: 2 }, '2026-10-14')[0].label, 'Week 3, Mon 19 Oct to Sun 25 Oct');
});

test('habit lines for every way to measure, and US units for water', () => {
  const week = { days: ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18'] };
  const ctx = (logs, extra = {}) => ({ week, workingDays: week.days.slice(0, 5), today: '2026-10-13', logs, score: 50, strategyName: 'S', units: 'metric', ...extra });
  const L = (v, date = '2026-10-13') => ({ sprint_habit_id: 'h', local_date: date, value: v });
  const sh = { id: 'h', name: 'H', strategy_id: 's' };
  const st = (m) => ({ id: 'x', from_week: 1, unit: null, target: null, target_per: null, limit_value: null, limit_per: null, direction: null, top_number: null, impact: 2, ...m });
  assert.equal(logRow(sh, st({ measure: 'amount', unit: 'steps', target: 10000, target_per: 'day' }), ctx([L(8400)])).line, '8,400 of 10,000 steps today');
  assert.equal(logRow(sh, st({ measure: 'count', unit: 'sessions', target: 4, target_per: 'week' }), ctx([L(1, '2026-10-12')])).line, '1 of 4 this week');
  assert.equal(logRow(sh, st({ measure: 'count', target: 4, target_per: 'week', top_number: 3 }), ctx([])).top, 3);
  assert.equal(logRow(sh, st({ measure: 'yes_no_days_limit', limit_value: 2 }), ctx([L(1), L(0, '2026-10-12')])).line, '1 this week, no more than 2');
  assert.equal(logRow(sh, st({ measure: 'yes_no_days_target', target: 4 }), ctx([L(1)])).line, '1 of 4 days this week');
  assert.equal(logRow(sh, st({ measure: 'count_limit', limit_value: 2, limit_per: 'day' }), ctx([L(3)])).line, '3 today, no more than 2');
  assert.equal(logRow(sh, st({ measure: 'rating', target: 4, direction: 'higher' }), ctx([L(3)])).line, 'Rated 1 to 5 today, aim for 4');
  assert.equal(logRow(sh, st({ measure: 'rating', target: 4, direction: 'higher' }), ctx([L(3), L(4, '2026-10-12')])).weekLine, 'Average 3.5 this week, aim for 4');
  assert.equal(logRow(sh, st({ measure: 'yes_no_weekly' }), ctx([])).line, 'Once this week');
  assert.equal(logRow(sh, st({ measure: 'yes_no_weekly' }), ctx([L(1)])).line, 'Done this week');
  const water = logRow(sh, st({ measure: 'amount', unit: 'litres', target: 2, target_per: 'day' }), ctx([L(1.5)], { units: 'imperial' }));
  assert.equal(water.unit, 'fl oz');
  assert.equal(water.line, '51 of 68 fl oz today');
  assert.equal(water.todayShown, 51);
});

test('units: litres show as US fluid ounces and come back as litres', () => {
  assert.equal(shownUnit('litres', 'imperial'), 'fl oz');
  assert.equal(shownUnit('litres', 'metric'), 'litres');
  assert.equal(shownUnit('steps', 'imperial'), 'steps');
  assert.equal(toShown(2, 'litres', 'imperial'), 68);
  assert.equal(toShown(toStored(68, 'litres', 'imperial'), 'litres', 'imperial'), 68);
  assert.equal(toStored('', 'litres', 'imperial'), null);
  assert.equal(toStored(5, 'steps', 'imperial'), 5);
});
