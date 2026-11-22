// The page loaders' reads go out together (the scale check, fixer C; 22 Nov
// 2026): the sprint page, Home, the dashboard, Daily plan and Daily review
// each read in one round trip, and the debrief in two, with what they show
// unchanged. Reads several loaders make of one table use one select, so
// readShare.js sends each once per page.
// Run with npm run test:performance.
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./fakes/swap-supabase.mjs', import.meta.url);

const store = new Map();
globalThis.window = {
  localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  },
  addEventListener: () => {},
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
};

const fake = await import('./fakes/supabase.mjs');
const api = await import('../../src/lib/performance/api.js');
const { getLocalDateKey } = await import('../../src/lib/dateFormatter.js');

const ME = 'me';
const TODAY = getLocalDateKey();
const day = (n) => {
  const [y, m, d] = TODAY.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

beforeEach(() => {
  fake.reset();
  store.clear();
});

/**
 * Two plans (the old one archived), a finished sprint and a running one
 * that started three weeks ago, with rows of both and someone else's.
 */
function seed({ running = true, start = day(-21) } = {}) {
  fake.put('person_settings', { user_id: ME, time_zone: api.deviceTimeZone(), units: 'metric', describes_you: 'leader', page_preferences: {} });
  fake.put('profiles', { id: ME, email: 'me@example.com', first_name: 'Sam', last_name: 'Lee', terms_accepted: true, show_mission_in_header: true });
  fake.put('performance_plans', { id: 'old', user_id: ME, status: 'archived', mission: 'Before' });
  fake.put('performance_plans', { id: 'p', user_id: ME, status: 'active', mission: 'Lead well' });
  fake.put('sprints', { id: 'sp0', user_id: ME, plan_id: 'old', number: 1, status: 'finished', start_on: day(-120) });
  if (running) fake.put('sprints', { id: 'sp', user_id: ME, plan_id: 'p', number: 2, status: 'running', start_on: start, length_weeks: 6 });
  fake.put('outcome_objectives', { id: 'o-old', user_id: ME, plan_id: 'old', sort_order: 0, archived_at: null });
  fake.put('outcome_objectives', { id: 'o2', user_id: ME, plan_id: 'p', sort_order: 2, archived_at: null });
  fake.put('outcome_objectives', { id: 'o1', user_id: ME, plan_id: 'p', sort_order: 1, archived_at: null });
  fake.put('outcome_objectives', { id: 'o-gone', user_id: ME, plan_id: 'p', sort_order: 3, archived_at: '2026-01-01' });
  fake.put('plan_strategies', { id: 's-old', user_id: ME, plan_id: 'old', name: 'Old', sort_order: 0, archived_at: null });
  fake.put('plan_strategies', { id: 'grow', user_id: ME, plan_id: 'p', name: 'Grow', sort_order: 1, archived_at: null });
  fake.put('plan_strategies', { id: 'craft', user_id: ME, plan_id: 'p', name: 'Craft', sort_order: 2, archived_at: null });
  fake.put('strategy_objectives', { user_id: ME, strategy_id: 'grow', objective_id: 'o1' });
  fake.put('weekly_debriefs', { user_id: ME, sprint_id: 'sp0', sprint_week: 1, stress: 'a_little', unusual: true, status: 'finished' });
  fake.put('weekly_debriefs', { user_id: ME, sprint_id: 'sp', sprint_week: 2, stress: 'not_at_all', unusual: false, status: 'finished' });
  fake.put('sprint_habits', { id: 'h0', user_id: ME, sprint_id: 'sp0', name: 'Old habit', sort_order: 0 });
  fake.put('sprint_habits', { id: 'h1', user_id: ME, sprint_id: 'sp', name: 'Focus', sort_order: 1 });
  fake.put('sprint_habit_settings', { id: 'st0', user_id: ME, sprint_habit_id: 'h0', from_week: 1 });
  fake.put('sprint_habit_settings', { id: 'st1', user_id: ME, sprint_habit_id: 'h1', from_week: 1 });
  fake.put('habit_logs', { id: 'l0', user_id: ME, sprint_habit_id: 'h0', local_date: day(-100), value: 1 });
  fake.put('habit_logs', { id: 'l-early', user_id: ME, sprint_habit_id: 'h1', local_date: day(-30), value: 1 });
  fake.put('habit_logs', { id: 'l1', user_id: ME, sprint_habit_id: 'h1', local_date: day(-2), value: 1 });
  fake.put('todos', { id: 't0', user_id: ME, sprint_id: 'sp0', planned_week: 1, strategy_id: 's-old', deleted_at: null, done_on: null, created_at: '1' });
  fake.put('todos', { id: 't1', user_id: ME, sprint_id: 'sp', planned_week: 3, strategy_id: 'grow', deleted_at: null, done_on: null, created_at: '2' });
  fake.put('todos', { id: 'b1', user_id: ME, sprint_id: null, planned_week: null, strategy_id: 'grow', deleted_at: null, done_on: null, created_at: '3' });
  fake.put('todos', { id: 'theirs', user_id: 'someone', sprint_id: null, planned_week: null, strategy_id: 'x', deleted_at: null, done_on: null, created_at: '4' });
  fake.put('wins', { id: 'w-old', user_id: ME, local_date: day(-60), deleted_at: null });
  fake.put('wins', { id: 'w1', user_id: ME, local_date: day(-1), deleted_at: null });
  fake.put('win_strategies', { user_id: ME, win_id: 'w1', strategy_id: 'grow' });
  fake.put('win_strategies', { user_id: ME, win_id: 'w-old', strategy_id: 'craft' });
}

/** Runs a loader with every answer held until all reads that leave at once have left: how many rounds it took. */
async function rounds(load) {
  const seen = [];
  let release;
  const gate = new Promise((r) => { release = r; });
  fake.db.hold = () => gate;
  const done = load();
  for (let i = 0; i < 50; i += 1) await new Promise((r) => setImmediate(r));
  seen.push(fake.db.calls.length);
  release();
  const result = await done;
  return { result, first: seen[0], all: fake.db.calls.length };
}

const reads = (table) => fake.db.calls.filter((c) => c.table === table && c.kind === 'select');

test('the sprint page reads everything in one round and shows only the running sprint’s rows', async () => {
  seed();
  const { result: d, first, all } = await rounds(() => api.loadSprintPage(ME));
  assert.equal(first, all, 'no read waits for another');
  assert.equal(d.sprint.id, 'sp');
  assert.deepEqual(d.objectives, [{ id: 'o1' }, { id: 'o2' }], 'the sprint plan’s live objectives, ids only, in order');
  assert.deepEqual(d.strategies.map((x) => x.id), ['grow', 'craft']);
  assert.deepEqual(d.links, [{ user_id: ME, strategy_id: 'grow', objective_id: 'o1', updated_at: d.links[0].updated_at }]);
  assert.deepEqual(d.debriefs, [{ sprint_week: 2, unusual: false, status: 'finished' }]);
  assert.deepEqual(d.sprintHabits.map((h) => h.id), ['h1']);
  assert.deepEqual(d.sprintSettings.map((x) => x.id), ['st1']);
  assert.deepEqual(d.logs.map((x) => x.id), ['l1'], 'logs from the sprint’s start only');
  assert.deepEqual(d.todos.map((x) => x.id), ['t1']);
  assert.deepEqual(d.backlogTodos.map((x) => x.id), ['b1']);
  assert.deepEqual(d.wins.map((x) => x.id), ['w1']);
  assert.equal('win_strategies' in d.wins[0], false);
  assert.deepEqual(d.winLinks, [{ win_id: 'w1', strategy_id: 'grow' }], 'the links of the wins shown');
  assert.equal(d.sprintHabits.some((h) => 'habit_logs' in h || 'sprint_habit_settings' in h), false, 'what came inside is taken out');
  assert.deepEqual(d.planStrategies, []);
  assert.equal(d.firstName, 'Sam');
  assert.deepEqual(d.personSettings, { time_zone: api.deviceTimeZone(), units: 'metric' }, 'only the columns asked for');
  assert.equal(reads('todos').length, 2, 'the Backlog is read once, for the page and the week');
});

test('a sprint that started before the wins window reads its wins again from its start', async () => {
  seed({ start: day(-200) });
  const { result: d, first, all } = await rounds(() => api.loadSprintPage(ME));
  assert.equal(all, first + 1, 'one more read, only in that case');
  assert.deepEqual(d.wins.map((x) => x.id).sort(), ['w-old', 'w1']);
  assert.deepEqual(d.winLinks.map((l) => l.win_id).sort(), ['w-old', 'w1']);
  assert.deepEqual(d.logs.map((x) => x.id).sort(), ['l-early', 'l1']);
});

test('with no sprint running the page keeps its shape: the active plan’s Strategies, nothing of the sprint', async () => {
  seed({ running: false });
  const { result: d, first, all } = await rounds(() => api.loadSprintPage(ME));
  assert.equal(first, all);
  assert.equal(d.sprint, null);
  assert.deepEqual([d.objectives, d.strategies, d.links], [[], [], []]);
  assert.equal('debriefs' in d, false);
  assert.equal('sprintHabits' in d, false);
  assert.deepEqual(d.planStrategies.map((x) => x.id), ['grow', 'craft']);
  assert.deepEqual(d.backlogTodos.map((x) => x.id), ['b1']);
});

test('Home reads its day in one round: today, the day before and the latest active day from one read per table', async () => {
  seed();
  fake.put('day_plans', { id: 'dp-y', user_id: ME, local_date: day(-1), status: 'finished' });
  fake.put('day_plans', { id: 'dp', user_id: ME, local_date: TODAY, status: 'finished' });
  fake.put('day_plans', { id: 'dp-old', user_id: ME, local_date: day(-5), status: 'finished' });
  fake.put('day_plans', { id: 'dp-later', user_id: ME, local_date: day(1), status: null });
  fake.put('day_plan_todos', { user_id: ME, day_plan_id: 'dp', todo_id: 't1', is_top: true });
  fake.put('day_plan_todos', { user_id: ME, day_plan_id: 'dp-y', todo_id: 't0', is_top: false });
  fake.put('day_plan_strategies', { user_id: ME, day_plan_id: 'dp', strategy_id: 'grow' });
  fake.put('day_reviews', { id: 'dr-y', user_id: ME, local_date: day(-1), status: 'finished', tomorrow: ['Call Jo'] });
  const { result: h, first, all } = await rounds(() => api.loadHomeDay(ME, TODAY));
  assert.equal(first, all, 'no read waits for another');
  assert.equal(h.dayPlan.id, 'dp');
  assert.deepEqual(h.dayTodos, [{ todo_id: 't1', is_top: true }]);
  assert.deepEqual(h.dayStrategies, [{ strategy_id: 'grow' }]);
  assert.equal(h.dayReview, null);
  assert.deepEqual(h.yesterday, { planned: true, reviewed: true, tomorrow: ['Call Jo'] });
  assert.deepEqual(h.lastActive, [day(-2), day(-1), day(-1)], 'the last log, then the plan and review of the day before');
  assert.deepEqual(h.plan, { id: 'p', mission: 'Lead well' });
  assert.equal(h.objectives, 2);
  assert.deepEqual(h.strategies, [{ id: 'grow', name: 'Grow' }, { id: 'craft', name: 'Craft' }]);
  assert.equal('day_plan_todos' in h.dayPlan, false);
  assert.equal(reads('day_plans').length, 1);
  assert.equal(reads('day_reviews').length, 1);
});

test('Home: a review of the day before that isn’t finished, and a gap, read as before', async () => {
  seed();
  fake.put('day_plans', { id: 'dp-old', user_id: ME, local_date: day(-9), status: 'finished' });
  fake.put('day_reviews', { id: 'dr-y', user_id: ME, local_date: day(-1), status: 'started', tomorrow: ['x'] });
  fake.put('day_reviews', { id: 'dr', user_id: ME, local_date: TODAY, status: 'finished', tomorrow: [] });
  const h = await api.loadHomeDay(ME, TODAY);
  assert.equal(h.dayPlan, null);
  assert.deepEqual([h.dayTodos, h.dayStrategies], [[], []]);
  assert.equal(h.dayReview.id, 'dr');
  assert.deepEqual(h.yesterday, { planned: false, reviewed: false, tomorrow: [] });
  assert.deepEqual(h.lastActive, [day(-2), day(-9), day(-1)]);
});

test('Home with nothing yet: no plan, no objectives, no Strategies', async () => {
  fake.put('person_settings', { user_id: ME, time_zone: api.deviceTimeZone() });
  const h = await api.loadHomeDay(ME, TODAY);
  assert.deepEqual([h.plan, h.objectives, h.strategies, h.lastSprintNumber, h.lastActive], [null, 0, [], 0, []]);
});

test('the dashboard reads in one round, the plan’s objectives from the shared read', async () => {
  seed();
  const { result: d, first, all } = await rounds(() => api.loadDashboard(ME, TODAY));
  assert.equal(first, all);
  assert.deepEqual(d.planObjectives.map((o) => o.id), ['o1', 'o2']);
  assert.deepEqual(d.allDebriefs.map((x) => x.sprint_id).sort(), ['sp', 'sp0']);
  assert.equal(d.sprint.id, 'sp');
});

test('the shared reads are the same query wherever they are made, so one request serves the page', async () => {
  seed();
  await api.loadSprintPage(ME);
  const page = fake.db.calls.slice();
  fake.db.calls.length = 0;
  await api.loadHomeDay(ME, TODAY);
  const home = fake.db.calls.slice();
  const same = (table) => {
    const a = page.filter((c) => c.table === table).map((c) => JSON.stringify(c.filters));
    const b = home.filter((c) => c.table === table).map((c) => JSON.stringify(c.filters));
    return b.every((x) => a.includes(x));
  };
  for (const table of ['outcome_objectives', 'plan_strategies', 'performance_plans', 'sprints']) assert.ok(same(table), table);
});

test('Daily plan and Daily review read in one round, with the last review’s Strategies and its day’s', async () => {
  seed();
  fake.put('day_plans', { id: 'dp', user_id: ME, local_date: TODAY, status: 'started' });
  fake.put('day_plan_todos', { user_id: ME, day_plan_id: 'dp', todo_id: 't1', is_top: false });
  fake.put('day_plans', { id: 'dp-y', user_id: ME, local_date: day(-1), way_of_being: 'Calm' });
  fake.put('day_plan_strategies', { user_id: ME, day_plan_id: 'dp-y', strategy_id: 'craft' });
  fake.put('day_reviews', { id: 'dr-y', user_id: ME, local_date: day(-1), status: 'finished', tomorrow: ['x'], on_my_mind: null });
  fake.put('day_review_strategies', { user_id: ME, day_review_id: 'dr-y', strategy_id: 'grow', level: 2 });
  fake.put('day_reviews', { id: 'dr', user_id: ME, local_date: TODAY, status: 'started' });
  fake.put('day_review_strategies', { user_id: ME, day_review_id: 'dr', strategy_id: 'craft', level: 1 });
  const { result: r, first, all } = await rounds(() => api.loadDayReview(ME, TODAY));
  assert.equal(first, all, 'no read waits for another');
  assert.equal(r.dayPlan.id, 'dp');
  assert.equal('day_plan_todos' in r.dayPlan || 'day_plan_strategies' in r.dayPlan, false);
  assert.deepEqual(r.dayTodos, [{ todo_id: 't1', is_top: false }]);
  assert.equal(r.lastReview.id, 'dr-y');
  assert.equal('day_review_strategies' in r.lastReview, false);
  assert.deepEqual(r.lastReview.strategies, [{ strategy_id: 'grow', level: 2 }]);
  assert.deepEqual(r.lastReview.dayStrategies, [{ strategy_id: 'craft' }]);
  assert.equal(r.dayReview.id, 'dr');
  assert.equal('day_review_strategies' in r.dayReview, false);
  assert.deepEqual(r.reviewStrategies, [{ strategy_id: 'craft', level: 1 }]);
  assert.equal(r.describesYou, 'leader');
});

test('the debrief reads in two rounds, each review’s Strategies inside the reviews’ read', async () => {
  seed();
  fake.put('day_reviews', { id: 'dr1', user_id: ME, local_date: day(-3), status: 'finished' });
  fake.put('day_review_strategies', { user_id: ME, day_review_id: 'dr1', strategy_id: 'grow', level: 3 });
  fake.put('day_reviews', { id: 'dr0', user_id: ME, local_date: day(-90), status: 'finished' });
  fake.put('day_review_strategies', { user_id: ME, day_review_id: 'dr0', strategy_id: 'craft', level: 1 });
  let firstRound = 0;
  let release;
  const gate = new Promise((r) => { release = r; });
  fake.db.hold = () => gate;
  const done = api.loadDebrief(ME, { sprintId: 'sp', week: 2, today: TODAY });
  for (let i = 0; i < 50; i += 1) await new Promise((r) => setImmediate(r));
  firstRound = fake.db.calls.length;
  release();
  const d = await done;
  const second = fake.db.calls.slice(firstRound).map((c) => c.table);
  assert.ok(second.every((t) => ['weekly_debriefs', 'sprint_habits', 'sprint_habit_settings', 'habit_logs', 'todos', 'todo_moves', 'wins', 'win_strategies', 'day_reviews'].includes(t)), second.join());
  assert.deepEqual(d.objectives.map((o) => o.id), ['o1', 'o2']);
  assert.deepEqual(d.strategies.map((x) => x.id), ['grow', 'craft']);
  assert.deepEqual(d.dayReviews.map((x) => x.id), ['dr1']);
  assert.equal('day_review_strategies' in d.dayReviews[0], false);
  assert.deepEqual(d.reviewStrategies, [{ day_review_id: 'dr1', strategy_id: 'grow', level: 3 }]);
  assert.deepEqual(d.sprintHabits.map((h) => h.id), ['h1']);
  assert.deepEqual(d.logs.map((x) => x.id), ['l1']);
  assert.deepEqual(d.allDebriefs.find((x) => x.sprint_id === 'sp'), { sprint_id: 'sp', sprint_week: 2, unusual: false, status: 'finished' });
});

// The reads sent as the app opens (pageReads.js startOpeningReads) are the
// page loaders' own, column for column, filter for filter and in order, so
// readShare.js can hand the loaders those answers.
const { openingReadsFor } = await import('../../src/lib/performance/pageReads.js');
const shape = (c) => JSON.stringify([c.table, c.columns, c.filters, c.order, c.limit]);

async function opening(path) {
  fake.db.calls.length = 0;
  await Promise.all(openingReadsFor(path, ME, TODAY).map((q) => Promise.resolve(q)));
  return fake.db.calls.map(shape);
}

for (const [path, load] of [
  ['/welcome', () => Promise.all([api.loadSprintPage(ME), api.loadHomeDay(ME, TODAY), api.loadCheckins(ME)])],
  ['/dashboard', () => api.loadDashboard(ME, TODAY)],
  ['/performance-sprint', () => api.loadSprintPage(ME)],
  ['/daily-plan', () => api.loadDayPlan(ME, TODAY)],
  ['/daily-review', () => api.loadDayReview(ME, TODAY)],
]) {
  test(`every read sent as ${path} opens is one its page makes`, async () => {
    seed();
    const sent = await opening(path);
    fake.db.calls.length = 0;
    await load();
    const made = new Set(fake.db.calls.map(shape));
    const extra = sent.filter((x) => !made.has(x));
    assert.deepEqual(extra, [], 'sent but never made by the page');
    assert.ok(sent.length >= 16);
  });
}

test('no reads are sent on other pages, or with nobody signed in', () => {
  for (const path of ['/coach', '/my-account', '/health-check', '/sign-in', '/performance-sprint/debrief']) {
    assert.equal(openingReadsFor(path, ME, TODAY), null, path);
  }
  assert.equal(openingReadsFor('/welcome/', ME, TODAY).length > 0, true, 'a trailing slash is the same page');
});

test('the opening reads go out only for someone signed in on this device', async () => {
  const { startOpeningReads } = await import('../../src/lib/performance/pageReads.js');
  seed();
  assert.equal(startOpeningReads('/welcome'), 0, 'nobody signed in');
  store.set('clarity-portal-auth', JSON.stringify({ refresh_token: 'r', user: { id: ME } }));
  fake.db.calls.length = 0;
  const n = startOpeningReads('/welcome');
  assert.ok(n > 0);
  await new Promise((r) => setImmediate(r));
  assert.equal(fake.db.calls.length, n);
  assert.ok(fake.db.calls.every((c) => c.kind === 'select'), 'reads only');
  assert.equal(startOpeningReads('/coach'), 0);
});
