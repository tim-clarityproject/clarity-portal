// The to-do Backlog (Tim, 13 Nov, 10:42): to-dos with no week yet, which
// wait until they're planned into a week. The lists the sprint page shows
// (this week, later, Backlog), planning one in, moving one out, the
// choices a tool offers (This week, Backlog, Don’t add it) and the shape
// of the saves, online and waiting in the offline queue.
// Run with npm run test:performance.
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./fakes/swap-supabase.mjs', import.meta.url);

const store = new Map();
const events = {};
globalThis.window = {
  localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  },
  addEventListener: (name, fn) => { (events[name] = events[name] || []).push(fn); },
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
};

const fake = await import('./fakes/supabase.mjs');
const q = await import('../../src/lib/syncQueue.js');
const api = await import('../../src/lib/performance/api.js');
const {
  BACKLOG_LINE, BACKLOG_VALUE, TODO_WHERE, backlogTodos, moveOptions, newTodoRow, sprintPageView, sprintTodos, sprintWeekResult,
  todoWhereOptions, todoWhereToast, withTodoMoved,
} = await import('../../src/lib/performance/index.js');
const { m0SprintCalendar } = await import('../../src/lib/scores/index.js');

const setOnline = (on) => (events[on ? 'online' : 'offline'] || []).forEach((fn) => fn());
const ME = 'me';

beforeEach(() => {
  fake.reset();
  store.clear();
  setOnline(true);
});

// A four-week sprint from Mon 5 Oct 2026, seen on Wed 14 Oct (week 2).
const TODAY = '2026-10-14';
const cal = () => m0SprintCalendar({ start: '2026-10-05', lengthWeeks: 4, recoveries: [] }, TODAY);
const todo = (id, over = {}) => ({ id, strategy_id: 'grow', text: id, impact: 2, sprint_id: 'sp', planned_week: 2, created_on: '2026-10-05', done_on: null, deleted_at: null, ...over });
const waiting = (id, over = {}) => todo(id, { sprint_id: null, planned_week: null, ...over });
function rows(over = {}) {
  return {
    plan: { id: 'p' },
    sprint: { id: 'sp', number: 1, status: 'running', start_on: '2026-10-05', length_weeks: 4, standard: 85, label: null },
    objectives: [{ id: 'o1' }],
    strategies: [{ id: 'grow', name: 'Grow through referrals' }, { id: 'craft', name: 'Deepen my coaching craft' }],
    planStrategies: [],
    links: [{ strategy_id: 'grow', objective_id: 'o1' }, { strategy_id: 'craft', objective_id: 'o1' }],
    workingPatterns: [],
    recoveries: [],
    personSettings: { units: 'metric' },
    weekScores: [],
    debriefs: [],
    sprintHabits: [],
    sprintSettings: [],
    logs: [],
    todos: [],
    backlogTodos: [],
    todoMoves: [],
    wins: [],
    winLinks: [],
    ...over,
  };
}

test('the three lists: this week, later in this sprint and the Backlog', () => {
  const d = rows({
    todos: [todo('now'), todo('later', { planned_week: 3 })],
    backlogTodos: [
      waiting('newer', { created_on: '2026-10-13', strategy_id: 'craft' }),
      waiting('older', { created_on: '2026-10-06' }),
      waiting('done', { done_on: '2026-10-12' }),
      waiting('gone', { deleted_at: '2026-10-12T09:00:00' }),
    ],
  });
  const t = sprintTodos(d, cal(), 2, TODAY);
  assert.deepEqual(t.thisWeek.map((x) => x.id), ['now']);
  assert.deepEqual(t.later.map((x) => x.id), ['later']);
  assert.deepEqual(t.backlog.map((x) => x.id), ['older', 'newer'], 'open ones only, oldest first');
  assert.equal(t.backlog[1].strategyName, 'Deepen my coaching craft');
  assert.equal(t.backlog[0].backlog, true);
  assert.equal(t.backlog[0].plannedWeek, null);
  assert.equal(t.total, 1, 'the Backlog never counts in this week');
  // The page's view carries the same list, and offers the Backlog as the last place to add to.
  const v = sprintPageView(d, { today: TODAY });
  assert.deepEqual(v.todos.backlog.map((x) => x.id), ['older', 'newer']);
  assert.deepEqual(v.weekOptions.map((o) => o.value), [2, 3, 4, BACKLOG_VALUE]);
  assert.equal(v.weekOptions.at(-1).label, 'Backlog');
});

test('with no sprint running the Backlog still shows, named by the plan’s Strategies', () => {
  const d = rows({ sprint: null, strategies: [], planStrategies: [{ id: 'grow', name: 'Grow through referrals' }], backlogTodos: [waiting('a')] });
  const v = sprintPageView(d, { today: TODAY });
  assert.equal(v.state, 'none');
  assert.deepEqual(v.backlog.map((x) => [x.id, x.strategyName]), [['a', 'Grow through referrals']]);
  assert.deepEqual(backlogTodos(rows({ sprint: null })), []);
});

// The functionality tester, 14 Nov: a tool says "Added to your backlog"
// whenever no week can take a to-do, so the sprint page must show the
// Backlog then too, not only with no sprint at all.
test('the Backlog shows on its own when the sprint’s weeks have all passed, or it hasn’t started yet', () => {
  const d = rows({ backlogTodos: [waiting('a'), waiting('done', { done_on: '2026-10-20' }), waiting('gone', { deleted_at: '2026-10-20T10:00:00Z' })] });
  const over = sprintPageView(d, { today: '2026-11-10' });
  assert.equal(over.state, 'over');
  assert.deepEqual(over.backlog.map((x) => [x.id, x.strategyName, x.backlog]), [['a', 'Grow through referrals', true]]);
  const future = sprintPageView(d, { today: '2026-10-01' });
  assert.equal(future.state, 'future');
  assert.deepEqual(future.backlog.map((x) => x.id), ['a']);
  // Nothing waiting: an empty list, so the page shows no Backlog heading.
  assert.deepEqual(sprintPageView(rows(), { today: '2026-11-10' }).backlog, []);
});

test('planning one in: from the Backlog into this week or a later one', () => {
  const d = rows({ backlogTodos: [waiting('a')] });
  const item = sprintTodos(d, cal(), 2, TODAY).backlog[0];
  const options = moveOptions(cal(), 2, 4, item, TODAY);
  assert.deepEqual(options.map((o) => o.value), [2, 3, 4]);
  assert.equal(options[0].label, 'This week, Mon 12 Oct to Sun 18 Oct');

  const planned = { ...d, ...withTodoMoved(d, 'a', { sprintId: 'sp', week: 2, on: TODAY, at: 'now' }) };
  assert.deepEqual(planned.backlogTodos, []);
  assert.deepEqual(planned.todos.map((t) => [t.id, t.sprint_id, t.planned_week, t.move_on]), [['a', 'sp', 2, TODAY]]);
  assert.deepEqual(planned.todoMoves, [{ todo_id: 'a', moved_on: TODAY, from_sprint_id: null, from_week: null, to_sprint_id: 'sp', to_week: 2, created_at: 'now' }]);
  const t = sprintTodos(planned, cal(), 2, TODAY);
  assert.deepEqual(t.thisWeek.map((x) => [x.id, x.done, Boolean(x.movedOut)]), [['a', false, false]]);
  assert.deepEqual(t.backlog, []);
  assert.equal(t.total, 1);

  const later = { ...d, ...withTodoMoved(d, 'a', { sprintId: 'sp', week: 4, on: TODAY }) };
  const tl = sprintTodos(later, cal(), 2, TODAY);
  assert.deepEqual(tl.later.map((x) => x.id), ['a']);
  assert.deepEqual(tl.thisWeek, []);
});

test('a to-do planned in counts in its week once the week ends, like any other (M2)', () => {
  const d = rows({ backlogTodos: [waiting('a')] });
  const planned = { ...d, ...withTodoMoved(d, 'a', { sprintId: 'sp', week: 2, on: TODAY }) };
  // Week 2 seen once it has finished: planned and not done scores 0.
  const after = m0SprintCalendar({ start: '2026-10-05', lengthWeeks: 4, recoveries: [] }, '2026-10-21');
  assert.equal(sprintWeekResult(planned, after, 2, null).result.score, 0);
  // Left in the Backlog it never counts anywhere.
  assert.equal(sprintWeekResult(d, after, 2, null).result.score, null);
});

test('moving one to the Backlog: free before its week starts, not done here after', () => {
  const d = rows({ todos: [todo('now'), todo('later', { planned_week: 3 })] });
  // The Backlog is the last place a to-do can move to.
  assert.deepEqual(moveOptions(cal(), 2, 4, { plannedWeek: 2 }, TODAY).map((o) => o.value), [3, 4, BACKLOG_VALUE]);
  assert.deepEqual(moveOptions(cal(), 4, 4, { plannedWeek: 4 }, '2026-11-01').map((o) => o.value), [BACKLOG_VALUE]);

  const moved = { ...d, ...withTodoMoved(d, 'later', { sprintId: 'sp', week: null, on: TODAY }) };
  let t = sprintTodos(moved, cal(), 2, TODAY);
  assert.deepEqual(t.later, []);
  assert.deepEqual(t.backlog.map((x) => x.id), ['later']);
  assert.deepEqual(t.thisWeek.map((x) => x.id), ['now'], 'a later week had not started, so it leaves no mark');

  const out = { ...d, ...withTodoMoved(d, 'now', { sprintId: 'sp', week: null, on: TODAY }) };
  t = sprintTodos(out, cal(), 2, TODAY);
  assert.deepEqual(t.backlog.map((x) => x.id), ['now']);
  const here = t.thisWeek.find((x) => x.id === 'now');
  assert.equal(here.movedOut, true);
  assert.equal(here.toBacklog, true);
  assert.equal(t.total, 0, 'moved out: not counted among this week’s to-dos');
  // The week's own score reads it as the database does: not done in week 2.
  const after = m0SprintCalendar({ start: '2026-10-05', lengthWeeks: 4, recoveries: [] }, '2026-10-21');
  assert.equal(sprintWeekResult(out, after, 2, null).result.score, 0);
  // Undo puts it back where it was.
  const back = { ...out, ...withTodoMoved(out, 'now', { sprintId: 'sp', week: 2, on: TODAY }) };
  t = sprintTodos(back, cal(), 2, TODAY);
  assert.deepEqual(t.thisWeek.map((x) => [x.id, Boolean(x.movedOut)]), [['now', false]]);
  assert.deepEqual(t.backlog, []);
});

test('what a tool offers: This week, Backlog or Don’t add it, and the toast for each', () => {
  assert.deepEqual(todoWhereOptions({ running: true }), [
    { value: 'week', label: 'This week' },
    { value: 'backlog', label: 'Backlog' },
    { value: 'none', label: 'Don’t add it' },
  ]);
  // With no sprint running there is no week to add it to.
  assert.deepEqual(todoWhereOptions({ running: false }).map((o) => o.label), ['Backlog', 'Don’t add it']);
  assert.equal(todoWhereToast(TODO_WHERE.week), 'Added to this week');
  assert.equal(todoWhereToast(TODO_WHERE.backlog), 'Added to your backlog');
  assert.equal(todoWhereToast(TODO_WHERE.none), null);
  assert.equal(BACKLOG_LINE, 'It waits there until you plan it into a week.');
});

test('a new to-do’s row: a week and its sprint together, or neither (the Backlog)', () => {
  const week = newTodoRow({ id: 'n1', text: '  Ask the chair  ', strategyId: 'grow', impact: 3, week: 2, sprintId: 'sp', today: TODAY, source: 'get_unstuck', sourceId: 'd1' });
  assert.deepEqual([week.text, week.sprint_id, week.planned_week, week.source, week.source_id, week.created_on], ['Ask the chair', 'sp', 2, 'get_unstuck', 'd1', TODAY]);
  const none = newTodoRow({ id: 'n2', text: 'Ask Tom', strategyId: 'grow', sprintId: 'sp', today: TODAY });
  assert.deepEqual([none.sprint_id, none.planned_week, none.source, none.impact], [null, null, 'manual', 2]);
  // No sprint running: a week alone is never saved (the table refuses one without the other).
  const loose = newTodoRow({ id: 'n3', text: 'x', strategyId: 'grow', week: 2, sprintId: null, today: TODAY });
  assert.deepEqual([loose.sprint_id, loose.planned_week], [null, null]);
});

test('saves: a Backlog to-do has no sprint and no week, and planning it in sets both', async () => {
  const r = await api.saveTodo(ME, { id: 'b1', strategyId: 'grow', text: 'Ask Tom', impact: 2, sprintId: 'sp', week: null, createdOn: TODAY, source: 'other_tool', sourceId: null });
  assert.equal(r.status, 'saved');
  const saved = fake.db.tables.todos.find((x) => x.id === 'b1');
  assert.deepEqual([saved.sprint_id, saved.planned_week, saved.source, saved.user_id], [null, null, 'other_tool', ME]);
  await api.moveTodo(ME, 'b1', { sprintId: 'sp', week: 2, on: TODAY });
  assert.deepEqual([saved.sprint_id, saved.planned_week, saved.move_on].join(), ['sp', 2, TODAY].join());
  await api.moveTodo(ME, 'b1', { sprintId: 'sp', week: null, on: TODAY });
  const again = fake.db.tables.todos.find((x) => x.id === 'b1');
  assert.deepEqual([again.sprint_id, again.planned_week], [null, null]);
});

// The functionality tester, 14 Nov: the weekly debrief loaded a sprint's
// rows without the Backlog, so a to-do moved there after its week started
// was missing from the debrief's score for that week (it read higher than
// the sprint page's and the database's).
test('every loader of a week’s rows brings the Backlog with it, so every page scores a moved-out to-do the same', async () => {
  fake.put('todos', { id: 'in', user_id: ME, strategy_id: 'grow', text: 'in', impact: 2, sprint_id: 'sp', planned_week: 2, created_on: '2026-10-05', done_on: null, deleted_at: null });
  fake.put('todos', { id: 'out', user_id: ME, strategy_id: 'grow', text: 'out', impact: 2, sprint_id: null, planned_week: null, created_on: '2026-10-05', done_on: null, deleted_at: null });
  fake.put('todos', { id: 'theirs', user_id: 'someone-else', strategy_id: 'grow', text: 'x', impact: 2, sprint_id: null, planned_week: null, created_on: '2026-10-05', done_on: null, deleted_at: null });
  fake.put('todo_moves', { todo_id: 'out', user_id: ME, moved_on: TODAY, from_sprint_id: 'sp', from_week: 2, to_sprint_id: null, to_week: null, created_at: '2026-10-14T10:00:00Z' });
  const week = await api.loadSprintWeekRows(ME, { id: 'sp', start_on: '2026-10-05' });
  assert.deepEqual(week.todos.map((t) => t.id), ['in']);
  assert.deepEqual(week.backlogTodos.map((t) => t.id), ['out']);
  // A caller that has read the Backlog already hands it over (no second read).
  const reads = () => fake.db.calls.filter((c) => c.table === 'todos' && c.kind === 'select').length;
  const before = reads();
  const given = await api.loadSprintWeekRows(ME, { id: 'sp', start_on: '2026-10-05' }, { backlogTodos: week.backlogTodos });
  assert.equal(given.backlogTodos, week.backlogTodos);
  assert.equal(reads() - before, 1, 'only the sprint’s own to-dos are read');
  // The week's score with those rows: the moved-out one is not done in week 2.
  const d = rows({ ...week });
  const after = m0SprintCalendar({ start: '2026-10-05', lengthWeeks: 4, recoveries: [] }, '2026-10-21');
  assert.equal(sprintWeekResult(d, after, 2, null).result.score, 0);
  assert.equal(sprintWeekResult({ ...d, backlogTodos: [] }, after, 2, null).result.score, 0, 'the one still in the week is not done either');
  // Tick the one still in the week: half done with the Backlog's, all done without it (the fault).
  const ticked = { ...d, todos: d.todos.map((t) => ({ ...t, done_on: '2026-10-15' })) };
  assert.equal(sprintWeekResult(ticked, after, 2, null).result.score, 50);
  assert.equal(sprintWeekResult({ ...ticked, backlogTodos: [] }, after, 2, null).result.score, 100);
});

test('offline: the add and the plan-in wait on the device in order, then both land', async () => {
  setOnline(false);
  const a = await api.saveTodo(ME, { id: 'b2', strategyId: 'grow', text: 'Ask Tom', impact: 2, sprintId: null, week: null, createdOn: TODAY, source: 'get_unstuck', sourceId: 'd1' });
  const b = await api.moveTodo(ME, 'b2', { sprintId: 'sp', week: 3, on: TODAY });
  assert.equal(a.status, 'queued');
  assert.equal(b.status, 'queued');
  assert.equal(q.queueState(ME).waiting, 2);
  const kept = JSON.parse([...store.entries()].find(([k]) => k.includes('queue'))[1]);
  assert.deepEqual(kept.map((o) => [o.table, o.kind]), [['todos', 'upsert'], ['todos', 'update']]);
  assert.deepEqual([kept[0].values.sprint_id, kept[0].values.planned_week, kept[0].values.source, kept[0].values.source_id], [null, null, 'get_unstuck', 'd1']);
  assert.deepEqual(kept[1].values, { sprint_id: 'sp', planned_week: 3, move_on: TODAY });
  assert.deepEqual(kept[1].match, { id: 'b2', user_id: ME });
  setOnline(true);
  await q.flush(ME);
  const row = fake.db.tables.todos.find((x) => x.id === 'b2');
  assert.deepEqual([row.sprint_id, row.planned_week], ['sp', 3]);
  assert.deepEqual(q.queueState(ME), { waiting: 0, failed: 0 });
});
