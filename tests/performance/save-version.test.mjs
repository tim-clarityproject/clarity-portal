// The save-version guard (Tim, 29 Oct): each change carries the updated_at
// of the row it was based on, so an older save from a second window never
// replaces a newer one, and a refused save is never dropped silently.
// src/lib/syncQueue.js against an in-memory stand-in for the database
// (fakes/supabase.mjs). The real two-window check runs in the app on the
// test database (tests/phase2/break-it.mjs, ONLY=versions).
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./fakes/swap-supabase.mjs', import.meta.url);

// The browser parts the queue touches: storage and the online events.
const store = new Map();
const events = {};
globalThis.window = {
  localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  },
  addEventListener: (name, fn) => { events[name] = fn; },
  setInterval,
  clearInterval,
};

const fake = await import('./fakes/supabase.mjs');
const q = await import('../../src/lib/syncQueue.js');
// The browser's online and offline events, as the connection module hears them.
const setOnline = (on) => events[on ? 'online' : 'offline']?.();

const ME = 'me';
let heard = [];
q.onSuperseded((e) => heard.push(e));

beforeEach(() => {
  fake.reset();
  store.clear();
  heard = [];
  setOnline(true);
});

const row = (table, id) => fake.db.tables[table].find((r) => r.id === id);

test('a change based on the version this window read lands, and moves the version on', async () => {
  const todo = fake.put('todos', { id: 't1', user_id: ME, done_on: null });
  q.noteVersions('todos', [todo]);
  const r1 = await q.saveOrQueue(ME, { table: 'todos', kind: 'update', match: { id: 't1', user_id: ME }, values: { done_on: '2026-10-21' } });
  assert.equal(r1.status, 'saved');
  assert.ok(fake.db.calls.some((c) => c.kind === 'update' && c.filters.some(([k, v]) => k === 'updated_at' && v === todo.updated_at)), 'sent only if still at the version read');
  // The next change in this window is based on the version that save made.
  const r2 = await q.saveOrQueue(ME, { table: 'todos', kind: 'update', match: { id: 't1', user_id: ME }, values: { done_on: null } });
  assert.equal(r2.status, 'saved');
  assert.equal(row('todos', 't1').done_on, null);
  assert.equal(heard.length, 0);
});

test('an older save from a second window never replaces a newer one, and says so', async () => {
  const todo = fake.put('todos', { id: 't2', user_id: ME, text: 'Draft the case study', done_on: null });
  q.noteVersions('todos', [todo]); // this window read it
  fake.changeElsewhere('todos', { id: 't2' }, { done_on: '2026-10-22' }); // the other window ticked it
  const r = await q.saveOrQueue(ME, { table: 'todos', kind: 'update', match: { id: 't2', user_id: ME }, values: { done_on: '2026-10-21' } });
  assert.equal(r.status, 'superseded');
  assert.equal(row('todos', 't2').done_on, '2026-10-22', 'the newer save is kept');
  assert.equal(heard.length, 1, 'announced, never silent');
  assert.equal(heard[0].table, 'todos');
  assert.equal(heard[0].code, 'SUPERSEDED');
});

test('the friendly message is a full sentence, through friendlyError', async () => {
  const { friendlyError, SUPERSEDED_MESSAGE } = await import('../../src/lib/friendlyError.js');
  assert.equal(friendlyError(new q.SupersededError('todos', null), 'fallback'), 'This was changed in another window. Showing the latest.');
  assert.equal(SUPERSEDED_MESSAGE, 'This was changed in another window. Showing the latest.');
});

test('a save resent after a refresh, already on the server, counts as saved', async () => {
  const todo = fake.put('todos', { id: 't3', user_id: ME, done_on: null });
  q.noteVersions('todos', [todo]);
  const op = { table: 'todos', kind: 'update', match: { id: 't3', user_id: ME }, values: { done_on: '2026-10-21' }, basedOn: todo.updated_at };
  await q.saveOrQueue(ME, op);
  const again = await q.saveOrQueue(ME, op); // the same change, from the old version
  assert.equal(again.status, 'saved');
  assert.equal(heard.length, 0);
});

test('a natural-key log (one per habit and day) is guarded the same way', async () => {
  const log = fake.put('habit_logs', { id: 'l1', user_id: ME, sprint_habit_id: 'h1', local_date: '2026-10-21', value: 9000 });
  q.noteVersions('habit_logs', [log]);
  fake.changeElsewhere('habit_logs', { id: 'l1' }, { value: 9500 });
  const r = await q.saveOrQueue(ME, { table: 'habit_logs', kind: 'upsert', onConflict: 'sprint_habit_id,local_date', values: { user_id: ME, sprint_habit_id: 'h1', local_date: '2026-10-21', value: 8000 } });
  assert.equal(r.status, 'superseded');
  assert.equal(row('habit_logs', 'l1').value, 9500);
});

test('offline changes to one row chain: each waits on the device and all land in order', async () => {
  const todo = fake.put('todos', { id: 't4', user_id: ME, planned_week: 4 });
  q.noteVersions('todos', [todo]);
  setOnline(false);
  const a = await q.saveOrQueue(ME, { table: 'todos', kind: 'update', match: { id: 't4', user_id: ME }, values: { planned_week: 5 } });
  const b = await q.saveOrQueue(ME, { table: 'todos', kind: 'update', match: { id: 't4', user_id: ME }, values: { planned_week: 6 } });
  assert.equal(a.status, 'queued');
  assert.equal(b.status, 'queued');
  setOnline(true);
  await q.flush(ME);
  assert.equal(row('todos', 't4').planned_week, 6);
  assert.deepEqual(q.queueState(ME), { waiting: 0, failed: 0 });
  assert.equal(heard.length, 0);
});

test('a queued save whose row moved on meanwhile is taken off the device and announced', async () => {
  const todo = fake.put('todos', { id: 't5', user_id: ME, planned_week: 4 });
  q.noteVersions('todos', [todo]);
  setOnline(false);
  await q.saveOrQueue(ME, { table: 'todos', kind: 'update', match: { id: 't5', user_id: ME }, values: { planned_week: 5 } });
  fake.changeElsewhere('todos', { id: 't5' }, { planned_week: 7 });
  setOnline(true);
  await q.flush(ME);
  assert.equal(row('todos', 't5').planned_week, 7);
  assert.deepEqual(q.queueState(ME), { waiting: 0, failed: 0 }, 'not kept to replace the newer one, not set aside as refused');
  assert.equal(heard.length, 1);
});

test('older tools sharing the queue save as before (no version known, no guard)', async () => {
  const r = await q.saveOrQueue(ME, { table: 'decisions', kind: 'upsert', values: { id: 'd1', user_id: ME, tool_type: 'grow' } });
  assert.equal(r.status, 'saved');
  const u = await q.saveOrQueue(ME, { table: 'decisions', kind: 'update', match: { id: 'd1' }, values: { tool_type: 'inversion' } });
  assert.equal(u.status, 'saved');
  assert.ok(!fake.db.calls.some((c) => c.table === 'decisions' && c.filters.some(([k]) => k === 'updated_at')));
  setOnline(false);
  const off = await q.saveOrQueue(ME, { table: 'journal_entries', kind: 'upsert', values: { id: 'j1', user_id: ME } });
  assert.equal(off.status, 'queued');
  setOnline(true);
  await q.flush(ME);
  assert.ok(fake.db.tables.journal_entries.some((x) => x.id === 'j1'), 'an offline save still syncs');
});

test('a row taken away clears its version, so adding it again is a plain save', async () => {
  const log = fake.put('habit_logs', { id: 'l2', user_id: ME, sprint_habit_id: 'h2', local_date: '2026-10-21', value: 1 });
  q.noteVersions('habit_logs', [log]);
  await q.saveOrQueue(ME, { table: 'habit_logs', kind: 'delete', match: { sprint_habit_id: 'h2', local_date: '2026-10-21', user_id: ME } });
  const r = await q.saveOrQueue(ME, { table: 'habit_logs', kind: 'upsert', onConflict: 'sprint_habit_id,local_date', values: { user_id: ME, sprint_habit_id: 'h2', local_date: '2026-10-21', value: 1 } });
  assert.equal(r.status, 'saved');
  assert.equal(heard.length, 0);
});
