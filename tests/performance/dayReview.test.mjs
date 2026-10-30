// Review my day's view (src/lib/performance/dayReview.js): which day a
// review just after midnight is for, today's to-dos from the morning's
// plan, this week's list, the numbers screen and its weekly sentence,
// ticking a habit, the wins, the saves for the Strategies that moved and
// the summary's words. The week's score is the sprint page's own
// (sprintPageView, M5 "so far"), checked here to be the same figure.
// Run with npm run test:performance.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dayReviewStrategyOps,
  dayReviewView,
  entryKind,
  habitTickValue,
  howYouWere,
  isDailyHabit,
  movedLines,
  movedQuestion,
  reminderLine,
  reviewAnswersFromRow,
  reviewAnswersToRow,
  reviewDayFor,
  sprintPageView,
  tomorrowToRow,
  wayQuestion,
  weeklySentence,
} from '../../src/lib/performance/index.js';

// A running 8-week sprint from Mon 5 Oct 2026, reviewed on Wed 21 Oct (week 3).
function rows(over = {}) {
  const setting = (id, sh, m) => ({ id, sprint_habit_id: sh, from_week: 1, unit: null, target: null, target_per: null, limit_value: null, limit_per: null, direction: null, top_number: null, impact: 2, ...m });
  const log = (sh, date, value) => ({ id: `${sh}-${date}`, sprint_habit_id: sh, local_date: date, value, to_confirm: false });
  const todo = (id, text, week, extra = {}) => ({ id, strategy_id: 'grow', text, impact: 2, sprint_id: 'sp', planned_week: week, created_on: '2026-10-05', done_on: null, source: 'manual', source_id: null, deleted_at: null, ...extra });
  return {
    plan: { id: 'p' },
    sprint: { id: 'sp', plan_id: 'p', number: 1, status: 'running', start_on: '2026-10-05', length_weeks: 8, standard: 85, label: null },
    objectives: [{ id: 'o1' }],
    strategies: [{ id: 'grow', name: 'Grow through referrals' }, { id: 'craft', name: 'Deepen my coaching craft' }],
    links: [{ strategy_id: 'grow', objective_id: 'o1' }, { strategy_id: 'craft', objective_id: 'o1' }],
    workingPatterns: [],
    recoveries: [],
    personSettings: { units: 'metric' },
    weekScores: [],
    debriefs: [],
    sprintHabits: [
      { id: 'steps', strategy_id: 'grow', name: 'Steps' },
      { id: 'train', strategy_id: 'grow', name: 'Training sessions' },
      { id: 'block', strategy_id: 'craft', name: 'Weekly strategic block' },
      { id: 'notes', strategy_id: 'craft', name: 'Reflective notes' },
      { id: 'late', strategy_id: 'grow', name: 'Late finishes' },
      { id: 'focus', strategy_id: 'craft', name: 'Focus' },
      { id: 'read', strategy_id: 'craft', name: 'Reading' },
    ],
    sprintSettings: [
      setting('s1', 'steps', { measure: 'amount', unit: 'steps', target: 10000, target_per: 'day' }),
      setting('s2', 'train', { measure: 'count', unit: 'sessions', target: 4, target_per: 'week' }),
      setting('s3', 'block', { measure: 'yes_no_weekly' }),
      setting('s4', 'notes', { measure: 'count', unit: 'notes', target: 2, target_per: 'week' }),
      setting('s5', 'late', { measure: 'yes_no_days_limit', limit_value: 2 }),
      setting('s6', 'focus', { measure: 'rating', target: 4, direction: 'higher' }),
      setting('s7', 'read', { measure: 'amount', unit: 'hours', target: 3, target_per: 'week' }),
    ],
    logs: [log('steps', '2026-10-21', 9800), log('train', '2026-10-19', 1), log('notes', '2026-10-19', 1), log('notes', '2026-10-20', 1)],
    todos: [
      todo('t1', 'Send the Harbour proposal', 3),
      todo('t2', 'Book a physio assessment', 2),
      todo('t3', 'Update my LinkedIn profile', 4),
      todo('t4', 'Renew supervision', 3, { done_on: '2026-10-19' }),
      todo('t5', 'Call Evan', 3, { done_on: '2026-10-21' }),
    ],
    todoMoves: [],
    wins: [
      { id: 'w1', what: 'A referral came in', local_date: '2026-10-21', impact: 3, deleted_at: null },
      { id: 'w2', what: 'Monday’s win', local_date: '2026-10-19', impact: 2, deleted_at: null },
    ],
    winLinks: [{ win_id: 'w1', strategy_id: 'grow' }, { win_id: 'w2', strategy_id: 'craft' }],
    dayPlan: { id: 'dp', local_date: '2026-10-21', way_of_being: 'Calm under pressure', status: 'finished' },
    dayTodos: [{ todo_id: 't1', is_top: false }, { todo_id: 't5', is_top: true }],
    dayStrategies: [{ strategy_id: 'grow' }, { strategy_id: 'craft' }],
    earlierWays: [],
    lastReview: null,
    dayReview: null,
    reviewStrategies: [],
    firstName: 'Sam',
    ...over,
  };
}
const DATE = '2026-10-21';

test('a review just after midnight is for the day before, when it was planned and not yet reviewed', () => {
  assert.equal(reviewDayFor({ today: '2026-10-22', hour: 0, yesterdayPlanned: true, yesterdayReviewed: false }), '2026-10-21');
  assert.equal(reviewDayFor({ today: '2026-10-22', hour: 3, yesterdayPlanned: true, yesterdayReviewed: false }), '2026-10-21');
  // From 04:00, or once reviewed, or never planned: today.
  assert.equal(reviewDayFor({ today: '2026-10-22', hour: 4, yesterdayPlanned: true, yesterdayReviewed: false }), '2026-10-22');
  assert.equal(reviewDayFor({ today: '2026-10-22', hour: 0, yesterdayPlanned: true, yesterdayReviewed: true }), '2026-10-22');
  assert.equal(reviewDayFor({ today: '2026-10-22', hour: 0, yesterdayPlanned: false }), '2026-10-22');
  // Across a month end.
  assert.equal(reviewDayFor({ today: '2026-11-01', hour: 0, yesterdayPlanned: true }), '2026-10-31');
});

test('today’s to-dos are the morning’s picks, the highest priority first, each ticked as done or not', () => {
  const v = dayReviewView(rows(), { date: DATE });
  assert.deepEqual(v.today.map((t) => [t.id, t.top, t.done]), [['t5', true, true], ['t1', false, false]]);
  assert.equal(v.today[0].strategyName, 'Grow through referrals');
  assert.equal(v.todoLine, '1 of 2 done');
  assert.equal(v.todoPlus, null);
});

test('this week’s list: the other open to-dos, then weekly habits not yet met; a thing ticked here stays', () => {
  const v = dayReviewView(rows(), { date: DATE });
  assert.deepEqual(v.weekList.map((t) => t.key), ['todo:t2', 'habit:train', 'habit:block']);
  assert.deepEqual(v.weekList.map((t) => t.tags[0]), ['Rolled over from week 2', 'Habit, 1 of 4 this week', 'Habit, not yet this week']);
  // Met (notes), daily (steps), an amount a week (reading), done another day (t4), later (t3): not on the list.
  assert.ok(!v.weekList.some((t) => ['habit:notes', 'habit:steps', 'habit:read', 'todo:t4', 'todo:t3'].includes(t.key)));
  // Ticked done on this day: it stays, and counts as one more.
  const d = rows();
  d.todos = d.todos.map((t) => (t.id === 't2' ? { ...t, done_on: DATE } : t));
  d.logs.push({ id: 'b', sprint_habit_id: 'block', local_date: DATE, value: 1 });
  const after = dayReviewView(d, { date: DATE, local: { extra: { 'habit:block': true } } });
  assert.deepEqual(after.weekList.filter((t) => t.done).map((t) => t.key), ['todo:t2', 'habit:block']);
  assert.equal(after.todoPlus, 'Plus 2 more from this week’s list.');
});

test('no plan for the day: the week’s list is the whole first screen, and the summary counts from it', () => {
  const d = rows({ dayPlan: null, dayTodos: [], dayStrategies: [] });
  d.todos = d.todos.map((t) => (t.id === 't1' ? { ...t, done_on: DATE } : t));
  const v = dayReviewView(d, { date: DATE });
  assert.deepEqual(v.today, []);
  assert.ok(v.weekList.some((t) => t.key === 'todo:t1' && t.done));
  assert.equal(v.todoLine, '2 done from this week’s list');
  assert.equal(v.todoPlus, null);
  assert.equal(v.reminder, 'Choose any that moved today.');
  assert.equal(v.way, '');
});

test('a habit chosen in the morning is ticked from its log, or from the review’s own tick', () => {
  const d = rows({ dayTodos: [{ todo_id: 't1', is_top: true }] });
  const planLocal = { habits: ['train'], order: ['todo:t1', 'habit:train'], top: 'todo:t1' };
  assert.equal(dayReviewView(d, { date: DATE, planLocal }).today[1].done, false);
  d.logs.push({ id: 'x', sprint_habit_id: 'train', local_date: DATE, value: 1 });
  assert.equal(dayReviewView(d, { date: DATE, planLocal }).today[1].done, true);
  assert.equal(dayReviewView(d, { date: DATE, planLocal, local: { habitTicks: { train: false } } }).today[1].done, false);
  assert.equal(dayReviewView(d, { date: DATE, planLocal }).today[1].measure, 'count');
});

test('ticking a habit: a count logs one more, a once-a-week habit logs yes, an amount logs nothing', () => {
  assert.equal(habitTickValue('count', null, true), 1);
  assert.equal(habitTickValue('count', 2, true), 3);
  assert.equal(habitTickValue('count', 2, false), 1);
  assert.equal(habitTickValue('count', 1, false), null);
  assert.equal(habitTickValue('yes_no_weekly', null, true), 1);
  assert.equal(habitTickValue('yes_no_weekly', 1, false), null);
  assert.equal(habitTickValue('amount', 2, true), undefined);
});

test('the numbers screen: the habits logged a day at a time, with the sprint’s own line; the weekly ones in one sentence', () => {
  const v = dayReviewView(rows(), { date: DATE });
  assert.deepEqual(v.numbers.map((h) => [h.id, h.kind]), [['steps', 'number'], ['late', 'yesno'], ['focus', 'rating']]);
  assert.equal(v.numbers[0].line, '9,800 of 10,000 steps today');
  assert.equal(v.weeklyLine, 'So far this week you have training sessions at 1 of 4, weekly strategic block still to do, reflective notes at 2 of 2 and reading at 0 of 3 hours.');
  // An amount a week chosen for the day gets its row here.
  const chosen = dayReviewView(rows(), { date: DATE, planLocal: { habits: ['read'], order: ['habit:read'] } });
  assert.ok(chosen.numbers.some((h) => h.id === 'read'));
});

test('the weekly sentence: no colon, a limit in words, nothing when there are none', () => {
  assert.equal(weeklySentence([{ name: 'Coffees', measure: 'count_limit', weekLine: '3 this week, no more than 5' }]), 'So far this week you have coffees at 3 with a limit of 5.');
  assert.equal(weeklySentence([{ name: 'Strategic block', measure: 'yes_no_weekly', weekLine: 'Done this week' }]), 'So far this week you have strategic block done.');
  assert.equal(weeklySentence([{ name: 'PR reviews', measure: 'count', weekLine: '1 of 2 this week' }]), 'So far this week you have PR reviews at 1 of 2.');
  assert.equal(weeklySentence([]), '');
  assert.ok(!/:/.test(weeklySentence([{ name: 'A', measure: 'count', weekLine: '1 of 2 this week' }])));
});

test('daily or weekly, and how each is entered (as the sprint’s Log today)', () => {
  assert.equal(isDailyHabit({ measure: 'amount', targetPer: 'day' }), true);
  assert.equal(isDailyHabit({ measure: 'count', targetPer: 'week' }), false);
  assert.equal(isDailyHabit({ measure: 'count_limit', limitPer: 'day' }), true);
  assert.equal(isDailyHabit({ measure: 'yes_no_weekly' }), false);
  assert.equal(isDailyHabit({ measure: 'rating' }), true);
  assert.deepEqual(['count', 'yes_no_days_target', 'rating', 'yes_no_weekly', 'amount'].map(entryKind), ['stepper', 'yesno', 'rating', 'tick', 'number']);
});

test('the wins: the day’s own and any added in this review, with their Strategies', () => {
  const v = dayReviewView(rows(), { date: DATE });
  assert.deepEqual(v.wins.map((w) => [w.text, w.strategyName, w.day]), [['A referral came in', 'Grow through referrals', 'Wed']]);
  assert.equal(v.winsLine, 'Plus 1 unplanned win.');
  const both = dayReviewView(rows(), { date: DATE, local: { wins: ['w2'] } });
  assert.equal(both.wins.length, 2);
  assert.equal(both.winsLine, 'Plus 2 unplanned wins.');
  assert.deepEqual(both.winDays.map((d) => d.label), ['Mon', 'Tue', 'Wed']);
});

test('with no sprint the win days run Monday to the day', () => {
  const v = dayReviewView(rows({ sprint: null, strategies: [], planStrategies: [{ id: 'grow', name: 'Grow through referrals' }], looseTodos: [] }), { date: '2026-10-22' });
  assert.deepEqual(v.winDays.map((d) => d.value), ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22']);
  assert.equal(v.score, null);
  assert.deepEqual(v.numbers, []);
  assert.equal(v.weeklyLine, '');
});

test('the morning’s reminder names both Strategies of the day; the follow-up names its Strategy (rule 64)', () => {
  const v = dayReviewView(rows(), { date: DATE });
  assert.equal(v.reminder, 'This morning you said today would serve Grow through referrals and Deepen my coaching craft most.');
  assert.equal(reminderLine(['Grow through referrals']), 'This morning you said today would serve Grow through referrals most.');
  assert.equal(movedQuestion('Grow through referrals'), 'How much did “Grow through referrals” move?');
});

test('the way of being question, and the summary’s words', () => {
  assert.equal(wayQuestion('Calm under pressure'), 'On a scale of 1 to 10, how calm under pressure were you today?');
  assert.equal(wayQuestion('  '), 'On a scale of 1 to 10, how was today?');
  assert.equal(wayQuestion('CEO-level calm.'), 'On a scale of 1 to 10, how CEO-level calm were you today?');
  assert.equal(howYouWere('Calm under pressure', 7), 'Calm under pressure, 7/10');
  assert.equal(howYouWere('', 6), 'Today, 6/10');
  assert.equal(howYouWere('Calm', null), '');
  const strategies = [{ value: 'grow', label: 'Grow through referrals' }, { value: 'craft', label: 'Deepen my coaching craft' }];
  assert.deepEqual(movedLines({ craft: 3, grow: 1 }, strategies), ['Grow through referrals, Low', 'Deepen my coaching craft, High']);
});

test('the saved row: typed things for tomorrow only, three at most, each within 300 characters', () => {
  assert.deepEqual(tomorrowToRow([' Call Evan ', '', 'x'.repeat(320), 'Fourth', 'Fifth']), ['Call Evan', 'x'.repeat(300), 'Fourth']);
  const a = { rating: 7, where: ' In the Harbour call ', wentWell: '', differently: 'Leave gaps', tomorrow: ['Call Evan', ' '], onMind: '  ' };
  assert.deepEqual(reviewAnswersToRow(a), { way_of_being_rating: 7, where_it_showed: 'In the Harbour call', went_well: null, differently: 'Leave gaps', tomorrow: ['Call Evan'], on_my_mind: null });
  const back = reviewAnswersFromRow({ way_of_being_rating: 7, where_it_showed: 'x', tomorrow: [], went_well: null });
  assert.deepEqual(back.tomorrow, ['']);
  assert.equal(back.rating, 7);
  assert.equal(reviewAnswersFromRow(null).rating, null);
});

test('the Strategies that moved: removals first, then new or changed levels', () => {
  const ops = dayReviewStrategyOps('u', 'dr', { grow: 2, craft: 1 }, { craft: 3, build: 2 });
  assert.deepEqual(ops.map((o) => `${o.kind}:${o.match?.strategy_id || o.values.strategy_id}:${o.values?.level ?? ''}`), ['delete:grow:', 'upsert:craft:3', 'upsert:build:2']);
  assert.equal(ops[1].onConflict, 'day_review_id,strategy_id');
  assert.deepEqual(dayReviewStrategyOps('u', 'dr', { grow: 2 }, { grow: 2 }), []);
});

test('the score this week is the sprint page’s own figure for the review’s day (M5 so far)', () => {
  const d = rows();
  const v = dayReviewView(d, { date: DATE });
  const sprint = sprintPageView(d, { today: DATE });
  assert.equal(v.score.value, `${sprint.soFar.value}%`);
  assert.equal(v.score.good, sprint.soFar.good);
  // A tick moves it the same way the sprint page's own figure moves.
  const ticked = rows();
  ticked.todos = ticked.todos.map((t) => (t.id === 't1' ? { ...t, done_on: DATE } : t));
  assert.equal(dayReviewView(ticked, { date: DATE }).score.value, `${sprintPageView(ticked, { today: DATE }).soFar.value}%`);
});

test('the morning’s Strategies and the moved levels come from the rows, and a finished review says so', () => {
  const v = dayReviewView(rows({ reviewStrategies: [{ strategy_id: 'grow', level: 3 }, { strategy_id: 'gone', level: 1 }], dayReview: { id: 'dr', status: 'finished' } }), { date: DATE });
  assert.deepEqual(v.moved, { grow: 3 });
  assert.equal(v.finished, true);
});
