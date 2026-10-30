// The Weekly performance debrief's view (src/lib/performance/debrief.js):
// the week the window opens (M0.4), the score through the sprint's own
// rows (M5-1), the habit % colours, the objectives' "last week" figure and
// change (M9), the debrief streak (M11), next week's to-dos and the words.
// Run with npm run test:performance.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STRESS_OPTIONS,
  debriefAnswersFromRow,
  debriefAnswersToRow,
  debriefHeading,
  debriefStreakWeeks,
  debriefView,
  figureChange,
  figureDay,
  finishToast,
  habitTotal,
  nextDebriefOpens,
  pickDebriefWeek,
  shareLine,
  streakLine,
  yourDaysLine,
} from '../../src/lib/performance/index.js';
import { m11DebriefStreak } from '../../src/lib/scores/index.js';

// M5-1 (as tests/performance/sprintPage.test.mjs): Sam works Monday to
// Friday, standard 85. A 2-week sprint from Mon 5 Oct 2026; week 1 ends Sun 11 Oct.
function m51(over = {}) {
  const S = { G: 'grow', E: 'energy', D: 'craft' };
  const setting = (id, sh, m) => ({ id, sprint_habit_id: sh, from_week: 1, unit: null, target: null, target_per: null, limit_value: null, limit_per: null, direction: null, top_number: null, ...m });
  const log = (sh, date, value) => ({ id: `${sh}-${date}`, sprint_habit_id: sh, local_date: date, value, to_confirm: false });
  const sprint = { id: 'sp', number: 1, status: 'running', start_on: '2026-10-05', length_weeks: 2, standard: 85, label: null, plan_id: 'p' };
  return {
    plan: { id: 'p' },
    sprint,
    week: 1,
    sprints: [sprint],
    objectives: [
      { id: 'o1', name: 'Coaching clients', kind: 'number', unit: null, direction: 'up', start_value: 20, start_set_on: '2026-01-01', target_value: 38, by_when: '2027-06-30' },
      { id: 'o2', name: 'How world-class is my coaching?', kind: 'rating', unit: null, direction: 'up', start_value: 6, start_set_on: '2026-01-01', target_value: 9, by_when: '2027-06-30' },
      { id: 'o3', name: 'Publish my coaching book', kind: 'milestone', due_on: '2027-06-30', reached_on: null },
    ],
    figures: [
      { id: 'f1', objective_id: 'o1', value: 31, recorded_on: '2026-10-01', sprint_id: null, sprint_week: null, created_at: '2026-10-01T09:00:00Z' },
    ],
    strategies: [{ id: S.G, name: 'Grow through referrals' }, { id: S.E, name: 'Sustain my energy' }, { id: S.D, name: 'Deepen my coaching craft' }],
    links: [{ strategy_id: S.G, objective_id: 'o1' }, { strategy_id: S.G, objective_id: 'o2' }, { strategy_id: S.E, objective_id: 'o3' }, { strategy_id: S.D, objective_id: 'o2' }],
    workingPatterns: [],
    recoveries: [],
    personSettings: { units: 'metric' },
    weekScores: [],
    allDebriefs: [],
    debrief: null,
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
      { id: 't3', strategy_id: S.G, text: 'Ask Evan for an introduction', impact: 2, sprint_id: 'sp', planned_week: 2, created_on: '2026-10-05', done_on: null },
    ],
    todoMoves: [],
    wins: [{ id: 'w1', what: 'A referral came in', local_date: '2026-10-08', impact: 1 }],
    winLinks: [{ win_id: 'w1', strategy_id: S.G }],
    dayReviews: [
      { id: 'r1', local_date: '2026-10-06', went_well: 'The Harbour call landed.', differently: 'Leave ten minutes between calls.', status: 'finished' },
      { id: 'r2', local_date: '2026-10-07', went_well: '', differently: '', status: 'draft' },
      { id: 'r3', local_date: '2026-10-13', went_well: 'Next week, not this one.', differently: '', status: 'finished' },
    ],
    reviewStrategies: [{ day_review_id: 'r1', strategy_id: S.G, level: 3 }],
    firstName: 'Sam',
    coach: { firstName: 'Alex' },
    ...over,
  };
}

test('the window: the week whose last 3 days or following 3 days hold today (M0.4)', () => {
  const d = m51();
  assert.equal(pickDebriefWeek(d.sprints, [], '2026-10-08'), null, 'Thursday of week 1: not yet');
  for (const day of ['2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12', '2026-10-14']) {
    assert.deepEqual(pickDebriefWeek(d.sprints, [], day), { sprintId: 'sp', week: 1 }, day);
  }
  assert.equal(pickDebriefWeek(d.sprints, [], '2026-10-15'), null, 'closed the day after, and week 2 not yet open');
  assert.deepEqual(pickDebriefWeek(d.sprints, [], '2026-10-16'), { sprintId: 'sp', week: 2 });
  assert.deepEqual(nextDebriefOpens(d.sprints, [], '2026-10-15'), { sprintId: 'sp', week: 2, opensOn: '2026-10-16' });
  // A finished sprint's last week stays open for its 3 days after.
  const done = [{ ...d.sprint, status: 'finished', actual_end_on: '2026-10-18' }];
  assert.deepEqual(pickDebriefWeek(done, [], '2026-10-20'), { sprintId: 'sp', week: 2 });
  assert.equal(nextDebriefOpens(done, [], '2026-10-22'), null);
});

test('the view: closed before and after its window; open from the last 3 days', () => {
  assert.equal(debriefView(m51(), { today: '2026-10-08' }).state, 'before');
  const closed = debriefView(m51(), { today: '2026-10-15' });
  assert.equal(closed.state, 'closed');
  assert.equal(closed.closedOn, 'Wed 14 Oct');
  assert.deepEqual(closed.score, { value: 68, good: false });
  // A finished debrief stays open to change, even after its window.
  assert.equal(debriefView(m51({ debrief: { status: 'finished' } }), { today: '2026-10-20' }).state, 'open');
  const early = debriefView(m51(), { today: '2026-10-09' });
  assert.equal(early.state, 'open');
  assert.equal(early.weekDone, false);
  assert.equal(early.scoreLabel, 'Week 1 performance score so far');
  assert.deepEqual(early.days.filter((x) => x.later).map((x) => x.key), ['2026-10-10', '2026-10-11']);
  assert.equal(debriefView({ sprints: [], recoveries: [] }, { today: '2026-10-09' }).state, 'none');
  // An old week's page while another week's debrief is open says so.
  const old = debriefView(m51(), { today: '2026-10-16' });
  assert.equal(old.state, 'closed');
  assert.deepEqual(old.openNow, { sprintId: 'sp', week: 2 });
  assert.equal(closed.openNow, null, 'nothing else open the day after');
});

test('M5-1: the debrief scores the week as the sprint does, 68%, below the standard', () => {
  const v = debriefView(m51(), { today: '2026-10-12' });
  assert.equal(v.state, 'open');
  assert.equal(v.weekDone, true);
  assert.deepEqual(v.score, { value: 68, good: false });
  assert.equal(v.scoreLabel, 'Week 1 performance score');
  assert.equal(debriefHeading(v), 'Here’s your week, Sam.');
  assert.equal(finishToast(v, false), 'Week 1 debriefed at 68%.');
  assert.equal(finishToast(v, true), 'Week 1 debriefed at 68%. Shared with Alex.');
  assert.equal(v.usualLine, 'Your usual range appears after 6 weeks.');
  // Grouped by Strategy, in the plan's order.
  assert.deepEqual(v.groups.map((g) => [g.name, g.habits.map((h) => h.name)]), [
    ['Grow through referrals', ['Referral conversations']],
    ['Sustain my energy', ['Training sessions', 'Late finishes']],
    ['Deepen my coaching craft', ['Reading']],
  ]);
  // Each habit's % (M1): mint at or above the standard, grey below, never coral.
  const total = (name) => v.groups.flatMap((g) => g.habits).find((h) => h.name === name).total;
  assert.deepEqual(total('Referral conversations'), { label: '2 of 3', value: '67%', good: false });
  assert.deepEqual(total('Training sessions'), { label: '3 of 3', value: '100%', good: true });
  assert.deepEqual(total('Late finishes'), { label: '3, no more than 2', value: '50%', good: false });
  assert.deepEqual(total('Reading'), { label: '120 of 100 minutes', value: '100%', good: true });
  assert.equal(v.days.length, 7);
  assert.ok(v.days.every((x) => !x.later), 'a finished week has every day open');
  assert.deepEqual(v.wins.map((w) => w.text), ['A referral came in']);
  assert.deepEqual(v.winDays.map((x) => x.label), ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
});

test('at or above the standard: the celebration heading', () => {
  const d = m51();
  d.todos[1].done_on = '2026-10-08';
  d.logs.push({ id: 'x', sprint_habit_id: 'ref', local_date: '2026-10-09', value: 1, to_confirm: false });
  d.sprintSettings[2] = { ...d.sprintSettings[2], limit_value: 3 };
  const v = debriefView(d, { today: '2026-10-12' });
  assert.equal(v.score.good, true, `${v.score.value}`);
  assert.equal(debriefHeading(v), 'Great week, Sam! You smashed your standard.');
  assert.equal(debriefHeading({ ...v, firstName: '' }), 'Great week! You smashed your standard.');
});

test('a habit not logged says so, with no colour', () => {
  assert.deepEqual(habitTotal({ weekLine: '0 of 3 this week' }, { score: null, notLogged: true }, 85), { label: '0 of 3', value: 'Not logged', good: null });
  assert.deepEqual(habitTotal({ weekLine: '3 of 3 this week' }, { score: 84.5, notLogged: false }, 85), { label: '3 of 3', value: '85%', good: true }, 'the shown figure decides (M0.1)');
});

test('objectives: "last week" is the figure before this debrief\'s own (M9, CHOICE D3)', () => {
  const v = debriefView(m51(), { today: '2026-10-12' });
  const [clients, rating, book] = v.objectives;
  assert.equal(clients.lastLine, 'Last week 31');
  assert.equal(clients.value, 31, 'the box starts on it');
  assert.equal(clients.figureId, null);
  assert.equal(rating.lastLine, 'Last week 6/10');
  assert.equal(rating.unit, '/10');
  assert.equal(book.kind, 'milestone');
  assert.equal(book.status, 'Not reached yet, due by 30 Jun 2027');
  // With this debrief's own figure: the box holds it, "last week" stays.
  const own = { id: 'f2', objective_id: 'o1', value: 40, recorded_on: '2026-10-11', sprint_id: 'sp', sprint_week: 1, created_at: '2026-10-12T09:00:00Z' };
  const w = debriefView(m51({ figures: [...m51().figures, own] }), { today: '2026-10-12' });
  assert.equal(w.objectives[0].value, 40);
  assert.equal(w.objectives[0].lastLine, 'Last week 31');
  assert.equal(w.objectives[0].figureId, 'f2');
  assert.deepEqual(figureChange(w.objectives[0].objective, 40, 31), { text: '+9', good: true });
  assert.deepEqual(figureChange({ kind: 'number', direction: 'down' }, 3, 5), { text: '−2', good: true }, 'lower is better');
  assert.deepEqual(figureChange({ kind: 'number', direction: 'up' }, 29.5, 31), { text: '−1.5', good: false });
  assert.equal(figureChange({ kind: 'number' }, 31, 31), null);
  // Figures are recorded on the week's last day, or today before it ends.
  assert.equal(figureDay({ end: '2026-10-11' }, '2026-10-13'), '2026-10-11');
  assert.equal(figureDay({ end: '2026-10-11' }, '2026-10-10'), '2026-10-10');
  assert.equal(v.figureDay, '2026-10-11');
});

test('your days: the week\'s Review my day entries with something written', () => {
  const v = debriefView(m51(), { today: '2026-10-12' });
  assert.deepEqual(v.yourDays, [{ key: '2026-10-06', title: 'Tue 6 Oct', wentWell: 'The Harbour call landed.', differently: 'Leave ten minutes between calls.', moved: ['Grow through referrals, High'] }]);
  assert.equal(yourDaysLine(1), '1 Review my day entry this week');
  assert.equal(yourDaysLine(7), '7 Review my day entries this week');
});

test('next week: open to-dos roll over, next week\'s are listed; none in the last week', () => {
  const v = debriefView(m51(), { today: '2026-10-12' });
  assert.equal(v.nextWeek.number, 2);
  assert.deepEqual(v.nextWeek.todos.map((t) => [t.text, t.tags]), [
    ['Record a session review', ['Rolls over from week 1']],
    ['Ask Evan for an introduction', []],
  ]);
  assert.deepEqual(v.nextWeek.weekOptions.map((o) => o.label), ['This week, Mon 12 Oct to Sun 18 Oct'], 'debriefed in week 2, week 2 is this week');
  const last = debriefView(m51({ week: 2 }), { today: '2026-10-17' });
  assert.equal(last.last, true);
  assert.equal(last.nextWeek, null);
});

test('M11: the streak counts this one; a missed week resets it quietly', () => {
  const s = m51().sprint;
  const sprints = [{ ...s, length_weeks: 6 }];
  const done = (w) => ({ sprint_id: 'sp', sprint_week: w, status: 'finished' });
  // Week 4 debriefed on Tue 3 Nov (its window): weeks 1 to 3 done, 4 this one.
  const all = debriefStreakWeeks(sprints, [], [done(1), done(2), done(3)], '2026-11-03', { sprintId: 'sp', week: 4 });
  assert.equal(m11DebriefStreak(all), 4);
  // Week 2 missed: the streak starts again after it.
  const missed = debriefStreakWeeks(sprints, [], [done(1), done(3)], '2026-11-03', { sprintId: 'sp', week: 4 });
  assert.equal(m11DebriefStreak(missed), 2);
  // Started in the week's last 3 days: the week isn't finished, and still counts.
  const early = debriefStreakWeeks(sprints, [], [done(1), done(2), done(3)], '2026-10-31', { sprintId: 'sp', week: 4 });
  assert.equal(m11DebriefStreak(early), 4);
  // Across sprints, oldest first.
  const two = [{ ...s, length_weeks: 2, status: 'finished', actual_end_on: '2026-10-18' }, { ...s, id: 'sp2', number: 2, start_on: '2026-10-19', length_weeks: 4 }];
  const across = debriefStreakWeeks(two, [], [done(1), done(2), { sprint_id: 'sp2', sprint_week: 1, status: 'finished' }], '2026-11-03', { sprintId: 'sp2', week: 2 });
  assert.equal(m11DebriefStreak(across), 4);
  assert.equal(streakLine(4), 'You’ve debriefed 4 weeks in a row, including this one.');
  assert.equal(streakLine(1), 'This week starts your streak.');
  const v = debriefView(m51({ allDebriefs: [] }), { today: '2026-10-12' });
  assert.equal(v.streak, 1);
});

test('answers: stress as stored, blanks as nothing; the share words', () => {
  assert.deepEqual(STRESS_OPTIONS.map((o) => o.label), ['Not at all', 'A little', 'Moderately', 'Quite a lot', 'Very much']);
  assert.deepEqual(debriefAnswersToRow({ stress: 'a_little', wentWell: 'Calls landed.', inTheWay: '  ', adjust: '' }), { stress: 'a_little', went_well: 'Calls landed.', got_in_way: null, adjust: null });
  assert.deepEqual(debriefAnswersFromRow({ stress: 'very_much', went_well: 'x', got_in_way: null, adjust: 'y' }), { stress: 'very_much', wentWell: 'x', inTheWay: '', adjust: 'y' });
  assert.equal(debriefAnswersToRow({ wentWell: 'a'.repeat(5000) }).went_well.length, 4000);
  assert.equal(shareLine('Alex', true), 'Alex will see this week’s scores, your objective figures and your three answers.');
  assert.equal(shareLine('Alex', false), 'Only you can see this debrief.');
});
