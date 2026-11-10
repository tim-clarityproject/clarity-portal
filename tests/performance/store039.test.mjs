// Migration 039 (Phase 4 step 7): the habits chosen in Daily plan
// (dayPlanHabits.js) and the sleep wind down's thoughts (windDownStore.js),
// device first. Without 039 they stay on the device with no error; once the
// tables are there, what waits on the device is moved across once (never
// losing what another device saved), saves go through the offline queue
// with the version check, another device's change is read back, and the
// device copy stays as the offline cache. Against the in-memory stand-in
// for the database (fakes/supabase.mjs): 'without 039' is the table
// missing, as PostgREST answers. The app itself is checked in
// tests/phase4/store-039.mjs.
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
    key: (i) => [...store.keys()][i] ?? null,
    get length() { return store.size; },
  },
  addEventListener() {},
  setInterval,
  clearInterval,
};
// Object.keys(localStorage) lists the keys, as in a browser.
globalThis.window.localStorage = new Proxy(globalThis.window.localStorage, {
  ownKeys: () => [...store.keys()],
  getOwnPropertyDescriptor: (t, k) => (store.has(k) ? { enumerable: true, configurable: true, value: store.get(k) } : Reflect.getOwnPropertyDescriptor(t, k)),
});

const fake = await import('./fakes/supabase.mjs');
const habits = await import('../../src/lib/performance/dayPlanHabits.js');
const nights = await import('../../src/lib/performance/windDownStore.js');

const ME = 'me';
const H1 = '11111111-1111-4111-8111-111111111111';
const H2 = '22222222-2222-4222-8222-222222222222';
const T1 = '33333333-3333-4333-8333-333333333333';
const planKey = (date) => `clarity-day-plan-local:${ME}:${date}`;
const nightsKey = `clarity-cache:${ME}:wind-down-nights`;
const rows = (table) => fake.db.tables[table] || [];

beforeEach(() => {
  fake.reset();
  store.clear();
});

// ---------------------------------------------------------------- without 039
test('without 039: the day\'s habits stay on the device, with no error', async () => {
  fake.db.missing.add('day_plan_habits');
  const r = await habits.saveDayChoices(ME, '2026-10-21', { habits: [H1], order: [`todo:${T1}`, `habit:${H1}`], top: `habit:${H1}` });
  assert.equal(r.status, 'device');
  assert.deepEqual(habits.readDayChoices(ME, '2026-10-21'), { habits: [H1], order: [`todo:${T1}`, `habit:${H1}`], top: `habit:${H1}` });
  assert.equal(JSON.parse(store.get(planKey('2026-10-21'))).sent, false, 'still to be sent');
  assert.equal(await habits.refreshDayChoices(ME, '2026-10-21'), false);
  assert.equal(rows('day_plan_habits').length, 0);
});

test('without 039: the thoughts stay on the device, with no error, and a to-do from one is from another tool', async () => {
  fake.db.missing.add('wind_down_nights');
  const r = await nights.saveWindDownThoughts(ME, '2026-10-21', ['  Call Evan  ', '', 'Book a day off']);
  assert.equal(r.status, 'device');
  assert.deepEqual(nights.readWindDown(ME, '2026-10-21').thoughts, ['Call Evan', 'Book a day off']);
  assert.deepEqual(nights.lastNightThoughts(ME, '2026-10-22'), ['Call Evan', 'Book a day off']);
  assert.equal(await nights.refreshWindDown(ME, { night: '2026-10-21' }), false);
  assert.equal(await nights.windDownTodoSource(), 'other_tool');
  assert.equal(rows('wind_down_nights').length, 0);
});

// ---------------------------------------------------------------- once 039 is there
test('039 appears: the days waiting on the device move across once, then stay on the device as the cache', async () => {
  // Kept by the older app (no sent mark), and one empty day (nothing to move).
  store.set(planKey('2026-10-20'), JSON.stringify({ habits: [H1], order: [`habit:${H1}`], top: `habit:${H1}` }));
  store.set(planKey('2026-10-19'), JSON.stringify({ habits: [], order: [], top: null }));
  store.set(nightsKey, JSON.stringify({ '2026-10-19': { thoughts: ['Reply to Max'], finishedAt: '2026-10-19T21:40:00.000Z', sound: 'off' } }));
  await habits.refreshDayChoices(ME, '2026-10-20');
  await nights.refreshWindDown(ME, { since: '2026-10-01' });
  assert.equal(rows('day_plan_habits').length, 1, 'one day moved, the empty one left');
  assert.deepEqual(rows('day_plan_habits')[0].habit_ids, [H1]);
  assert.equal(rows('day_plan_habits')[0].top_pick, `habit:${H1}`);
  assert.deepEqual(rows('wind_down_nights')[0].thoughts, ['Reply to Max']);
  assert.equal(rows('wind_down_nights')[0].finished_at, '2026-10-19T21:40:00.000Z');
  assert.equal(JSON.parse(store.get(planKey('2026-10-20'))).sent, true);
  assert.equal(JSON.parse(store.get(nightsKey))['2026-10-19'].sent, true);
  // A second look moves nothing again.
  const writes = fake.db.calls.filter((c) => c.kind === 'upsert').length;
  await habits.refreshDayChoices(ME, '2026-10-20');
  await nights.refreshWindDown(ME, { since: '2026-10-01' });
  assert.equal(fake.db.calls.filter((c) => c.kind === 'upsert').length, writes);
  assert.equal(await nights.windDownTodoSource(), 'sleep_wind_down');
});

test('after 039: a save goes to the table, and the device keeps its copy', async () => {
  const r = await habits.saveDayChoices(ME, '2026-10-22', { habits: [H2], order: [`habit:${H2}`], top: `habit:${H2}` });
  assert.equal(r.status, 'saved');
  assert.deepEqual(rows('day_plan_habits')[0].habit_ids, [H2]);
  assert.deepEqual(habits.readDayChoices(ME, '2026-10-22').habits, [H2]);
  const s = await nights.saveWindDownThoughts(ME, '2026-10-22', ['Call Evan']);
  assert.equal(s.status, 'saved');
  assert.deepEqual(rows('wind_down_nights')[0].thoughts, ['Call Evan']);
  nights.finishWindDown(ME, '2026-10-22');
  await new Promise((r2) => { setTimeout(r2, 10); });
  assert.ok(rows('wind_down_nights')[0].finished_at, 'finished, in the table');
  assert.deepEqual(nights.finishedNights(ME), ['2026-10-22']);
});

test('after 039: another device\'s choice shows here', async () => {
  await habits.saveDayChoices(ME, '2026-10-23', { habits: [H1], order: [`habit:${H1}`], top: `habit:${H1}` });
  fake.changeElsewhere('day_plan_habits', { local_date: '2026-10-23' }, { habit_ids: [H2], pick_order: [`habit:${H2}`], top_pick: `habit:${H2}` });
  assert.equal(await habits.refreshDayChoices(ME, '2026-10-23'), true);
  assert.deepEqual(habits.readDayChoices(ME, '2026-10-23'), { habits: [H2], order: [`habit:${H2}`], top: `habit:${H2}` });
  await nights.saveWindDownThoughts(ME, '2026-10-23', ['Call Evan']);
  fake.changeElsewhere('wind_down_nights', { night: '2026-10-23' }, { thoughts: ['Call Evan', 'From the phone'] });
  assert.equal(await nights.refreshWindDown(ME, { night: '2026-10-23' }), true);
  assert.deepEqual(nights.readWindDown(ME, '2026-10-23').thoughts, ['Call Evan', 'From the phone']);
  assert.equal(await nights.refreshWindDown(ME, { night: '2026-10-23' }), false, 'nothing new the second time');
});

test('after 039: a read that left before this device\'s own save never writes over it (quick-ticks, 9 Nov)', async () => {
  // A habit chosen while the page's quiet refresh was on its way: the
  // save lands first, then the older read arrives. It must not un-choose it.
  await habits.saveDayChoices(ME, '2026-10-19', { habits: [H1], order: [`habit:${H1}`], top: `habit:${H1}` });
  const saved = rows('day_plan_habits')[0];
  // What the read saw, from before the save: no habit, an older version.
  const stale = { ...saved, habit_ids: [], pick_order: [], top_pick: null, updated_at: '2026-10-30T08:00:00.000001+00:00' };
  fake.db.tables.day_plan_habits[0] = stale;
  assert.equal(await habits.refreshDayChoices(ME, '2026-10-19'), false, 'nothing changes here');
  assert.deepEqual(habits.readDayChoices(ME, '2026-10-19').habits, [H1], 'the habit stays chosen');
});

// A gate for the fake database's answers (db.hold): the server does the
// work at once, the answer waits until let go.
function gate() {
  let open;
  const p = new Promise((r) => { open = r; });
  return { p, open };
}
const until = async (fn) => { for (let i = 0; i < 200 && !fn(); i += 1) await new Promise((r) => { setTimeout(r, 1); }); };
const H3 = '44444444-4444-4444-8444-444444444444';

test('the newest choice wins: a save refused for another device\'s goes on top of the newest choice, not the one it started with (follow-up 2)', async () => {
  const day = '2026-10-18';
  await habits.saveDayChoices(ME, day, { habits: [H1], order: [`habit:${H1}`], top: `habit:${H1}` });
  fake.changeElsewhere('day_plan_habits', { local_date: day }, { habit_ids: [H2], pick_order: [`habit:${H2}`], top_pick: `habit:${H2}` });
  // The first choice's save is refused (the phone saved since); the read of
  // the phone's row answers late. Meanwhile a newer choice is made here.
  const g = gate();
  let selects = 0;
  fake.db.hold = (c) => (c.table === 'day_plan_habits' && c.kind === 'select' && ++selects === 2 ? g.p : null);
  const first = habits.saveDayChoices(ME, day, { habits: [H1, H3], order: [`habit:${H1}`, `habit:${H3}`], top: `habit:${H1}` });
  await until(() => selects >= 2);
  const newest = { habits: [H3], order: [`habit:${H3}`], top: `habit:${H3}` };
  await habits.saveDayChoices(ME, day, newest);
  g.open();
  await first;
  assert.deepEqual(habits.readDayChoices(ME, day), newest, 'the device keeps the newest choice');
  assert.deepEqual(rows('day_plan_habits')[0].habit_ids, [H3], 'and so does the table');
});

test('the newest choice wins: a read that left before a choice never undoes it, wherever its answer lands (20 orders)', async () => {
  for (let i = 0; i < 20; i += 1) {
    fake.reset();
    store.clear();
    // A day of its own each time (the queue's book of versions outlives the reset).
    const day = `2026-09-${String(i + 1).padStart(2, '0')}`;
    await habits.saveDayChoices(ME, day, { habits: [H1], order: [`habit:${H1}`], top: `habit:${H1}` });
    // Sometimes another device saved first, sometimes not.
    if (i % 2) fake.changeElsewhere('day_plan_habits', { local_date: day }, { habit_ids: [H2], pick_order: [`habit:${H2}`], top_pick: `habit:${H2}` });
    const g = gate();
    let held = false;
    fake.db.hold = (c) => (!held && c.table === 'day_plan_habits' && c.kind === 'select' ? (held = true, g.p) : null);
    const read = habits.refreshDayChoices(ME, day);
    await until(() => held);
    const newest = { habits: [H3, H1].slice(0, 1 + (i % 3 === 0)), order: [`habit:${H3}`], top: `habit:${H3}` };
    const save = habits.saveDayChoices(ME, day, newest);
    // The read's answer lands before, while, or after the choice is saved.
    if (i % 4 === 0) g.open();
    if (i % 4 === 1) await new Promise((r) => { setImmediate(r); g.open(); });
    await save;
    g.open();
    await read;
    assert.deepEqual(habits.readDayChoices(ME, day).habits, newest.habits, `order ${i}: the device keeps the newest choice`);
    assert.deepEqual(rows('day_plan_habits')[0].habit_ids, newest.habits, `order ${i}: the table holds the newest choice`);
    // And a read made afterwards changes nothing.
    assert.equal(await habits.refreshDayChoices(ME, day), false, `order ${i}: nothing older comes back`);
  }
});

test('after 039: a save based on an older version is never written over another device\'s, and no thought is lost', async () => {
  await nights.saveWindDownThoughts(ME, '2026-10-24', ['Call Evan']);
  fake.changeElsewhere('wind_down_nights', { night: '2026-10-24' }, { thoughts: ['Call Evan', 'From the phone'] });
  const r = await nights.saveWindDownThoughts(ME, '2026-10-24', ['Call Evan', 'From the laptop']);
  assert.equal(r.status, 'saved');
  assert.ok(fake.db.calls.some((c) => c.table === 'wind_down_nights' && c.kind === 'update' && c.filters.some(([k]) => k === 'updated_at')), 'sent only if still at the version read');
  assert.deepEqual(rows('wind_down_nights')[0].thoughts, ['Call Evan', 'From the laptop', 'From the phone']);
  // The habits: this device's choice goes on top of the newer row.
  await habits.saveDayChoices(ME, '2026-10-24', { habits: [H1], order: [`habit:${H1}`], top: `habit:${H1}` });
  fake.changeElsewhere('day_plan_habits', { local_date: '2026-10-24' }, { habit_ids: [H2] });
  const h = await habits.saveDayChoices(ME, '2026-10-24', { habits: [H1, H2], order: [`habit:${H1}`, `habit:${H2}`], top: `habit:${H1}` });
  assert.equal(h.status, 'saved');
  assert.deepEqual(rows('day_plan_habits')[0].habit_ids, [H1, H2]);
});

test('moving across: a night another device already saved keeps its thoughts too', async () => {
  fake.put('wind_down_nights', { id: 'n1', user_id: ME, night: '2026-10-25', thoughts: ['From the phone'], sound: 'off', finished_at: null });
  store.set(nightsKey, JSON.stringify({ '2026-10-25': { thoughts: ['From this laptop', 'from the phone!'] } }));
  await nights.refreshWindDown(ME, { night: '2026-10-25' });
  assert.deepEqual(rows('wind_down_nights')[0].thoughts, ['From this laptop', 'from the phone!'], 'the same thing kept once');
  assert.equal(rows('wind_down_nights').length, 1);
});

test('the table\'s checks are kept by the app: at most three habits, only real choices', () => {
  const row = habits.dayChoicesToRow({ habits: [H1, H2, H1, 'not-an-id', T1, H2], order: ['todo:x', `todo:${T1}`, `habit:${H1}`], top: 'anything' });
  assert.deepEqual(row.habit_ids, [H1, H2, T1]);
  assert.deepEqual(row.pick_order, [`todo:${T1}`, `habit:${H1}`]);
  assert.equal(row.top_pick, null);
});
