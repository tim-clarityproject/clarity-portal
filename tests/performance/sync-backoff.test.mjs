// The offline sync's back-off (Tim, 5 Nov, 22:28): when the database
// doesn't answer, an open tab never floods it. Each retry waits longer
// than the last (about 2, 4, 8 seconds, up to about 5 minutes) with a
// little randomness; new saves wait in the queue meanwhile; a hidden tab
// never retries; showing it again, or the connection coming back, tries
// once at once. src/lib/syncQueue.js against the in-memory stand-in for
// the database (fakes/supabase.mjs), with the clock and the timers run by
// the test.
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./fakes/swap-supabase.mjs', import.meta.url);

// The clock, the timers, storage, the tab and the browser's events, all
// run by the test.
let now = Date.parse('2026-11-09T10:00:00Z');
Date.now = () => now;
let timers = [];
let nextTimer = 1;
const store = new Map();
const events = {};
const on = (target) => (name, fn) => { (target[name] = target[name] || []).push(fn); };
globalThis.window = {
  localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  },
  addEventListener: on(events),
  setTimeout: (fn, ms) => { const id = nextTimer; nextTimer += 1; timers.push({ id, fn, at: now + ms, ms }); return id; },
  clearTimeout: (id) => { timers = timers.filter((t) => t.id !== id); },
  setInterval,
  clearInterval,
};
const docEvents = {};
globalThis.document = { visibilityState: 'visible', addEventListener: on(docEvents) };
const fire = (list, name) => (list[name] || []).forEach((fn) => fn());

const fake = await import('./fakes/supabase.mjs');
const q = await import('../../src/lib/syncQueue.js');

const ME = 'me';
const settle = () => new Promise((r) => { setImmediate(r); });
async function idle() { for (let i = 0; i < 20; i += 1) await settle(); }
const requests = () => fake.db.calls.length;
// The next retry: the clock moves on to it, and it runs.
async function runNextRetry() {
  timers.sort((a, b) => a.at - b.at);
  const t = timers.shift();
  if (!t) return null;
  now = Math.max(now, t.at);
  t.fn();
  await idle();
  return t.ms;
}
// Each test its own ids: the queue remembers the versions it has seen.
let run = 0;
const save = (n) => q.saveOrQueue(ME, { table: 'todos', kind: 'upsert', values: { id: `r${run}-t${n}`, user_id: ME, text: `To-do ${n}` } });

beforeEach(async () => {
  run += 1;
  q.stopSyncQueue();
  fake.reset();
  store.clear();
  timers = [];
  document.visibilityState = 'visible';
  fire(events, 'online');
  q.startSyncQueue(ME);
  await idle();
});

test('each wait doubles from about 2 seconds to about 5 minutes, with a little randomness', () => {
  const mid = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => q.backoffDelay(n, () => 0.5));
  assert.deepEqual(mid, [2000, 4000, 8000, 16000, 32000, 64000, 128000, 256000, 300000, 300000, 300000]);
  for (let n = 0; n < 12; n += 1) {
    const base = Math.min(2000 * 2 ** n, 300000);
    const low = q.backoffDelay(n, () => 0);
    const high = q.backoffDelay(n, () => 0.999999);
    assert.ok(low >= base * 0.8 && high <= base * 1.2 && high > low, `wait ${n}: ${low} to ${high}`);
  }
  // Never more than about 6 minutes, however long it goes on.
  assert.ok(q.backoffDelay(50, () => 0.999999) <= 360000);
});

test('the database not answering: the save waits on the device, never set aside as refused', async () => {
  fake.db.down = { status: 503 };
  const r = await save(1);
  assert.equal(r.status, 'queued');
  assert.equal(q.queueState(ME).failed ?? 0, 0);
  assert.equal(q.waitingToSend(ME), true);
  for (const down of [{ status: 502 }, { status: 504, code: 'PGRST003' }, { status: 500, code: '57014' }, { status: 503, code: 'PGRST001' }]) {
    assert.equal(q.notAnswering(down), true, JSON.stringify(down));
  }
  assert.equal(q.notAnswering({ status: 400, code: '23514' }), false, 'a check the row breaks is a real refusal');
  assert.equal(q.notAnswering({ status: 403, code: '42501' }), false);
});

test('the retries slow down, and new saves meanwhile send nothing', async () => {
  fake.db.down = { status: 503 };
  await save(1);
  const waits = [];
  const triesAt = [];
  for (let i = 0; i < 12; i += 1) {
    // While a retry waits, more saves and the connection being noticed
    // again send nothing at all.
    const before = requests();
    for (let n = 0; n < 5; n += 1) await save(100 + i * 5 + n);
    await q.flush(ME);
    await idle();
    assert.equal(requests(), before, `no request while retry ${i + 1} waits`);
    const ms = await runNextRetry();
    assert.ok(ms, `retry ${i + 1} was scheduled`);
    waits.push(ms);
    triesAt.push(requests());
  }
  // Each retry is one request, and each wait is longer than the one before
  // until the cap (allowing for the randomness): 2s, 4s, 8s ... about 5 minutes.
  for (let i = 1; i < triesAt.length; i += 1) assert.equal(triesAt[i] - triesAt[i - 1], 1, `retry ${i + 1} is one request`);
  for (let i = 1; i < 8; i += 1) assert.ok(waits[i] > waits[i - 1] * 1.3, `wait ${i + 1} (${waits[i]}) longer than wait ${i} (${waits[i - 1]})`);
  assert.ok(waits[0] >= 1600 && waits[0] <= 2400, `the first wait is about 2 seconds: ${waits[0]}`);
  for (const ms of waits.slice(8)) assert.ok(ms >= 240000 && ms <= 360000, `capped at about 5 minutes: ${ms}`);
  // An hour of the database down costs about 20 requests, not thousands.
  const start = now;
  const startCount = requests();
  while (now - start < 3600000) await runNextRetry();
  assert.ok(requests() - startCount <= 20, `${requests() - startCount} requests in an hour`);
  assert.equal(q.queueState(ME).failed ?? 0, 0, 'nothing set aside');

  // The database answers again: everything waiting goes, oldest first, and the waits start again from 2 seconds.
  fake.db.down = null;
  await runNextRetry();
  assert.equal(q.waitingToSend(ME), false);
  assert.equal(fake.db.tables.todos.length, 1 + 12 * 5);
  assert.equal(q.backoffState().tries, 0);
  fake.db.down = { status: 503 };
  await save(999);
  await q.flush(ME);
  await idle();
  timers.sort((a, b) => a.at - b.at);
  assert.ok(timers[0].ms <= 2400, `back to about 2 seconds: ${timers[0].ms}`);
});

test('a hidden tab never retries; showing it again tries once', async () => {
  fake.db.down = { status: 503 };
  await save(1);
  await runNextRetry();
  await runNextRetry();
  const triesBefore = q.backoffState().tries;
  document.visibilityState = 'hidden';
  fire(docEvents, 'visibilitychange');
  const before = requests();
  // The retry's time comes while hidden: nothing is sent, and nothing more is scheduled.
  await runNextRetry();
  assert.equal(requests(), before, 'no request from a hidden tab');
  assert.equal(timers.length, 0);
  // Even the connection being noticed again sends nothing while hidden.
  await q.flush(ME);
  await idle();
  assert.equal(requests(), before);
  // Shown again: one try at once, then the waits carry on, longer.
  document.visibilityState = 'visible';
  fire(docEvents, 'visibilitychange');
  await idle();
  assert.equal(requests(), before + 1, 'one try when shown again');
  assert.equal(q.backoffState().tries, triesBefore + 1, 'the waits carry on from where they were');
});

test('the connection coming back tries once at once, and the queue empties', async () => {
  fake.db.down = { status: 503 };
  await save(1);
  await runNextRetry();
  await runNextRetry();
  await runNextRetry();
  // Several minutes' wait ahead, but the browser says the connection is back.
  fake.db.down = null;
  fire(events, 'offline');
  fire(events, 'online');
  await idle();
  assert.equal(q.waitingToSend(ME), false);
  assert.equal(q.backoffState().tries, 0);
  assert.equal(fake.db.tables.todos.length, 1);
});
