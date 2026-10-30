// Plan my day's view (src/lib/performance/dayPlan.js): which things can
// be chosen for the day, last night's list and note, the order of the
// saves for the day's to-dos and Strategies, and the summary's words.
// The week's score is the sprint page's own (sprintPageView, M5 "so far"),
// checked here to be the same figure. Run with npm run test:performance.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addDayKey,
  answersToRow,
  dayPicks,
  dayPlanView,
  dayStrategyOps,
  dayTodoOps,
  ifItHappens,
  lastListTag,
  nightTodoStrategy,
  recentWays,
  sleepToConfirm,
  sleepWords,
  sprintPageView,
  topFirst,
} from '../../src/lib/performance/index.js';

// A running 8-week sprint from Mon 5 Oct 2026, seen on Wed 21 Oct (week 3).
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
    ],
    sprintSettings: [
      setting('s1', 'steps', { measure: 'amount', unit: 'steps', target: 10000, target_per: 'day' }),
      setting('s2', 'train', { measure: 'count', unit: 'sessions', target: 4, target_per: 'week' }),
      setting('s3', 'block', { measure: 'yes_no_weekly' }),
      setting('s4', 'notes', { measure: 'count', unit: 'notes', target: 2, target_per: 'week' }),
    ],
    logs: [log('steps', '2026-10-19', 9000), log('train', '2026-10-19', 1), log('notes', '2026-10-19', 1), log('notes', '2026-10-20', 1)],
    todos: [
      todo('t1', 'Send the Harbour proposal', 3),
      todo('t2', 'Book a physio assessment', 2),
      todo('t3', 'Update my LinkedIn profile', 4),
      todo('t4', 'Renew supervision', 3, { done_on: '2026-10-19' }),
    ],
    todoMoves: [],
    wins: [],
    winLinks: [],
    dayTodos: [],
    dayStrategies: [],
    earlierWays: [],
    lastReview: null,
    firstName: 'Sam',
    ...over,
  };
}
const DATE = '2026-10-21';

test('the Do list: last night first, this week’s to-dos, weekly habits not yet met, then rolled over', () => {
  const v = dayPlanView(rows({ lastReview: { id: 'r1', local_date: '2026-10-20', tomorrow: ['Call Evan before 09:00', ''], on_my_mind: 'Idea: a workshop.', strategies: [], dayStrategies: [] } }), { date: DATE });
  assert.deepEqual(v.options.map((o) => o.value), ['night:0', 'todo:t1', 'habit:train', 'habit:block', 'todo:t2']);
  assert.deepEqual(v.options[0].tags, ['On last night’s list']);
  assert.deepEqual(v.options[1].tags, ['To-do this week']);
  assert.deepEqual(v.options[2].tags, ['Habit, 1 of 4 this week']);
  assert.deepEqual(v.options[3].tags, ['Habit, not yet this week']);
  assert.deepEqual(v.options[4].tags, ['Rolled over from week 2']);
  // Daily habits are logged on the numbers screen; met weekly habits, done and later to-dos aren't offered.
  assert.ok(!v.options.some((o) => ['habit:steps', 'habit:notes', 'todo:t3', 'todo:t4'].includes(o.value)));
  assert.deepEqual(v.note, { label: 'Last night you also wrote this note.', text: 'Idea: a workshop.' });
});

test('a thing from last night already made a to-do shows once, as that to-do', () => {
  const made = { id: 't9', strategy_id: 'grow', text: 'Call Evan before 09:00', impact: 2, sprint_id: 'sp', planned_week: 3, created_on: DATE, done_on: null, source: 'review_my_day', source_id: 'r1', deleted_at: null };
  const d = rows({ lastReview: { id: 'r1', local_date: '2026-10-20', tomorrow: ['Call Evan before 09:00'], strategies: [], dayStrategies: [] } });
  d.todos.push(made);
  const v = dayPlanView(d, { date: DATE });
  assert.equal(v.options[0].value, 'todo:t9');
  assert.deepEqual(v.options[0].tags, ['On last night’s list']);
  assert.ok(!v.options.some((o) => o.kind === 'night'));
});

test('last night after a gap keeps the day’s name; nothing older than 3 days is loaded', () => {
  assert.equal(lastListTag('2026-10-20', DATE), 'On last night’s list');
  assert.equal(lastListTag('2026-10-16', '2026-10-19'), 'On your list from Friday');
  assert.equal(addDayKey('2026-10-31', 1), '2026-11-01');
});

test('a to-do from last night goes on that day’s first Strategy of the day, then the first that moved, then the plan’s first', () => {
  const s = [{ id: 'grow' }, { id: 'craft' }];
  assert.equal(nightTodoStrategy({ dayStrategies: [{ strategy_id: 'craft' }], strategies: [{ strategy_id: 'grow' }] }, s), 'craft');
  assert.equal(nightTodoStrategy({ dayStrategies: [], strategies: [{ strategy_id: 'craft' }] }, s), 'craft');
  assert.equal(nightTodoStrategy({ dayStrategies: [{ strategy_id: 'gone' }], strategies: [] }, s), 'grow');
  assert.equal(nightTodoStrategy(null, []), null);
});

test('picks: the day’s to-dos and the habits on the device, three at most, the top first', () => {
  const p = dayPicks([{ todo_id: 't1', is_top: false }, { todo_id: 't2', is_top: true }], { habits: ['train'], order: ['habit:train', 'todo:t1'] });
  assert.deepEqual(p.picks, ['habit:train', 'todo:t1', 'todo:t2']);
  assert.equal(p.top, 'todo:t2');
  assert.deepEqual(topFirst(p.picks, p.top), ['todo:t2', 'habit:train', 'todo:t1']);
  // A habit at the top lives on the device; with nothing marked, the first is the top.
  assert.equal(dayPicks([{ todo_id: 't1', is_top: false }], { habits: ['train'], top: 'habit:train' }).top, 'habit:train');
  assert.equal(dayPicks([{ todo_id: 't1', is_top: false }], {}).top, 'todo:t1');
  // A pick that's no longer on the list (deleted elsewhere) drops out.
  assert.deepEqual(dayPicks([{ todo_id: 'gone', is_top: true }], {}, new Set(['todo:t1'])).picks, []);
});

test('the day’s to-do saves: removals first, the old top cleared before the new one is set', () => {
  const ops = dayTodoOps('u', 'dp', { todos: ['a', 'b', 'c'], top: 'a' }, { todos: ['b', 'c', 'd'], top: 'b' });
  assert.deepEqual(ops.map((o) => `${o.kind}:${o.match?.todo_id || o.values.todo_id}:${o.values?.is_top ?? ''}`), ['delete:a:', 'upsert:d:false', 'update:b:true']);
  const swap = dayTodoOps('u', 'dp', { todos: ['a', 'b'], top: 'a' }, { todos: ['a', 'b'], top: 'b' });
  assert.deepEqual(swap.map((o) => `${o.kind}:${o.match.todo_id}:${o.values.is_top}`), ['update:a:false', 'update:b:true']);
  const first = dayTodoOps('u', 'dp', { todos: [], top: null }, { todos: ['a'], top: 'a' });
  assert.equal(first[0].values.is_top, true);
  assert.equal(first[0].values.user_id, 'u');
  assert.deepEqual(dayTodoOps('u', 'dp', { todos: ['a'], top: 'a' }, { todos: ['a'], top: 'a' }), []);
});

test('the Strategies of the day: removals before additions, so two is never exceeded', () => {
  const ops = dayStrategyOps('u', 'dp', ['grow', 'craft'], ['craft', 'build']);
  assert.deepEqual(ops.map((o) => `${o.kind}:${o.match?.strategy_id || o.values.strategy_id}`), ['delete:grow', 'upsert:build']);
});

test('the score this week is the sprint page’s own figure (M5 so far)', () => {
  const d = rows();
  const v = dayPlanView(d, { date: DATE });
  const sprint = sprintPageView(d, { today: DATE });
  assert.equal(v.score.value, `${sprint.soFar.value}%`);
  assert.equal(v.score.good, sprint.soFar.good);
  assert.equal(v.week, 3);
});

test('recent ways of being: the last two, once each, before the day', () => {
  const r = recentWays([
    { local_date: '2026-10-20', way_of_being: 'Calm under pressure' },
    { local_date: '2026-10-19', way_of_being: 'calm under pressure' },
    { local_date: '2026-10-18', way_of_being: 'Present with my team' },
    { local_date: '2026-10-17', way_of_being: 'Decisive' },
    { local_date: '2026-10-21', way_of_being: 'Today’s own' },
  ], DATE);
  assert.deepEqual(r, ['Calm under pressure', 'Present with my team']);
});

test('the summary’s words and the saved row', () => {
  assert.equal(sleepWords({ hours: 7.5, quality: 'good' }), '7.5 hours, good');
  assert.equal(sleepWords({ hours: null, quality: 'very_poor' }), 'Very poor');
  assert.equal(sleepWords({ hours: 1, quality: null }), '1 hour');
  assert.equal(ifItHappens('Block 11:00 to 12:00.'), 'If it happens, block 11:00 to 12:00.');
  assert.deepEqual(answersToRow({ hours: 7, quality: 'fair', grateful: '  ', way: ' Patient ', risk: '', response: 'x' }),
    { sleep_hours: 7, sleep_quality: 'fair', grateful_for: null, way_of_being: 'Patient', biggest_risk: null, risk_response: 'x' });
});

test('an odd night is asked about until confirmed (M12, 2 to 14 hours)', () => {
  assert.equal(sleepToConfirm(1.5, true), true);
  assert.equal(sleepToConfirm(1.5, false), false);
  assert.equal(sleepToConfirm(7, true), false);
  assert.equal(sleepToConfirm(null, true), false);
});

test('no sprint: to-dos without a sprint, the plan’s Strategies, and no score', () => {
  const v = dayPlanView(rows({
    sprint: null,
    strategies: [],
    planStrategies: [{ id: 'grow', name: 'Grow through referrals' }],
    looseTodos: [{ id: 'l1', strategy_id: 'grow', text: 'Loose one', sprint_id: null, planned_week: null, done_on: null, deleted_at: null, source: 'plan_my_day', created_on: DATE }],
  }), { date: DATE });
  assert.equal(v.running, false);
  assert.equal(v.score, null);
  assert.deepEqual(v.options.map((o) => o.value), ['todo:l1']);
  assert.deepEqual(v.strategies, [{ value: 'grow', label: 'Grow through referrals' }]);
});
