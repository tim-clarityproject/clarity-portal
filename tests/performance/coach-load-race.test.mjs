// Scale check, step 4 (break-it tester, 23 Nov): a load that began before a
// save never puts the older rows back over it. At Tim's scale a load takes
// 1 to 4 seconds (the first tier on a phone, the later tier, a calendar
// window), and a coach adds, ticks and deletes while it is on its way: a
// to-do added then vanished, a deleted one came back, an edited note went
// back to its old words, until the next load. Walked through the real store
// and sync queue with a stand-in database whose reads can be held back.
// Nothing here reaches a real database (tests/coach/supabase-stub.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolve as resolvePath } from 'node:path';

const stub = pathToFileURL(resolvePath('tests/coach/supabase-stub.mjs')).href;
register(`data:text/javascript,${encodeURIComponent(`export async function resolve(s, c, n) { if (/(^|\\/)supabase(\\.js)?$/.test(s) && String(c.parentURL || '').includes('/src/lib/')) return { url: ${JSON.stringify(stub)}, shortCircuit: true }; return n(s, c); }`)}`);

function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); }, key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; }, keys: () => [...m.keys()] };
}
const local = fakeStorage();
globalThis.window = { localStorage: local, sessionStorage: fakeStorage(), addEventListener() {}, removeEventListener() {}, setInterval, clearInterval, setTimeout, clearTimeout };

// A stand-in database: a read takes its rows when it is ASKED (as the real one does), and its answer can be held
// back until the test lets it go, so a save can land in between.
const db = { rows: {}, hold: null, held: [], reads: [] };
const at = (v) => Date.parse(v);
let tick = 0;
const serverNow = () => new Date(Date.UTC(2026, 10, 23, 9, 0, 0) + (tick += 1000)).toISOString();
globalThis.__db = {
  async rpc() { return { data: null, error: null }; },
  from(table) {
    const q = { tests: [], op: 'select', values: null, max: Infinity, from: 0, to: Infinity, after: null };
    const run = () => {
      const rows = (db.rows[table] ||= []);
      if (q.op === 'upsert') {
        const out = [];
        for (const v of Array.isArray(q.values) ? q.values : [q.values]) {
          const old = rows.find((r) => r.id === v.id);
          // 050's coach_sessions_guard: once sent, the recap stays as it was sent, and the save is quietly kept back.
          const guarded = table === 'coach_sessions' && old?.recap_sent_at ? { ...v, recap: old.recap, recap_sent_at: old.recap_sent_at } : v;
          if (old) Object.assign(old, guarded, { updated_at: serverNow() }); else rows.push({ ...v, recap_sent_at: null, updated_at: serverNow() });
          out.push({ ...(old || rows[rows.length - 1]) });
        }
        return { data: out, error: null };
      }
      if (q.op === 'delete') {
        const gone = rows.filter((r) => q.tests.every((t) => t(r)));
        db.rows[table] = rows.filter((r) => !gone.includes(r));
        return { data: gone, error: null };
      }
      db.reads.push({ table, from: q.from, after: q.after });
      let out = rows.filter((r) => q.tests.every((t) => t(r))).map((r) => ({ ...r }));
      out.sort((x, y) => String(x.id).localeCompare(String(y.id)));
      return { data: out.slice(q.from, Math.min(q.to + 1, q.from + q.max)), error: null };
    };
    const chain = {
      select: () => chain, order: () => chain, or: () => chain,
      eq: (c, v) => { q.tests.push((r) => r[c] === v); return chain; },
      gt: (c, v) => { q.after = v; q.tests.push((r) => String(r[c]) > String(v)); return chain; },
      lt: (c, v) => { q.tests.push((r) => r[c] != null && at(r[c]) < at(v)); return chain; },
      gte: (c, v) => { q.tests.push((r) => r[c] != null && at(r[c]) >= at(v)); return chain; },
      limit: (n) => { q.max = n; return chain; },
      range: (a, b) => { q.from = a; q.to = b; return chain; },
      upsert: (values) => { q.op = 'upsert'; q.values = values; return chain; },
      delete: () => { q.op = 'delete'; return chain; },
      then: (ok, bad) => {
        const answer = run();
        const held = q.op === 'select' && db.hold && db.hold(table);
        const p = held ? new Promise((r) => { db.held.push(() => r(answer)); }) : Promise.resolve(answer);
        return p.then(ok, bad);
      },
    };
    return chain;
  },
};

const store = await import('../../src/lib/coach/store.js');
const actions = await import('../../src/lib/coach/sessionActions.js');
const USER = 'acct-race';
const pause = (ms = 30) => new Promise((r) => { setTimeout(r, ms); });
const release = () => { const h = db.held.splice(0); h.forEach((f) => f()); };
const ids = (table) => store.rowsOf(store.coachState(USER), table).map((r) => r.id).sort();

function fresh() {
  store.resetCoachStoreForTests();
  for (const k of local.keys()) local.removeItem(k);
  db.hold = null;
  db.held = [];
  db.rows = {
    client_profiles: [{ id: 'p1', coach_id: 'c1', name: 'Client one' }],
    coach_todos: [{ id: 't1', coach_id: 'c1', title: 'Ring Sam', done_at: null }, { id: 't2', coach_id: 'c1', title: 'Send the pack', done_at: null }],
    client_notes: [{ id: 'n1', coach_id: 'c1', profile_id: 'p1', body: 'First words' }],
  };
}

test('a to-do added while the first load is on its way stays', async () => {
  fresh();
  await store.loadCoach(USER);
  db.hold = (t) => t === 'coach_todos';
  const loading = store.loadCoach(USER, { again: true });
  await pause();
  assert.equal(await store.saveRow(USER, 'coach_todos', { id: 't3', coach_id: 'c1', title: 'Book the room', done_at: null }), 'saved');
  release();
  await loading;
  assert.deepEqual(ids('coach_todos'), ['t1', 't2', 't3'], 'the new to-do is still there');
});

test('a to-do deleted while a load is on its way stays deleted', async () => {
  fresh();
  await store.loadCoach(USER);
  db.hold = (t) => t === 'coach_todos';
  const loading = store.loadCoach(USER, { again: true });
  await pause();
  await store.removeRow(USER, 'coach_todos', 't2');
  assert.deepEqual(db.rows.coach_todos.map((r) => r.id), ['t1'], 'gone from the database');
  release();
  await loading;
  assert.deepEqual(ids('coach_todos'), ['t1'], 'it never comes back');
});

test('a to-do ticked while a load is on its way stays ticked', async () => {
  fresh();
  await store.loadCoach(USER);
  db.hold = (t) => t === 'coach_todos';
  const loading = store.loadCoach(USER, { again: true });
  await pause();
  const t1 = store.rowOf(store.coachState(USER), 'coach_todos', 't1');
  await store.saveRow(USER, 'coach_todos', { ...t1, done_at: '2026-11-23T09:30:00.000Z' });
  release();
  await loading;
  assert.equal(store.rowOf(store.coachState(USER), 'coach_todos', 't1').done_at, '2026-11-23T09:30:00.000Z');
});

test('the later tier arriving after the coach edited a note never puts the old words back', async () => {
  fresh();
  // The note is on the device from an earlier visit (the later tier reads notes).
  await store.loadCoach(USER);
  await pause(200);
  assert.deepEqual(ids('client_notes'), ['n1']);
  // A new visit: the later tier is held back while the coach edits the note.
  store.resetCoachStoreForTests();
  db.hold = (t) => t === 'client_notes';
  await store.loadCoach(USER);
  await pause(200);
  const n1 = store.rowOf(store.coachState(USER), 'client_notes', 'n1');
  await store.saveRow(USER, 'client_notes', { ...n1, body: 'Edited words' });
  release();
  await pause(50);
  assert.equal(store.rowOf(store.coachState(USER), 'client_notes', 'n1').body, 'Edited words');
});

test('a calendar week read on its way while an item is added keeps the item', async () => {
  fresh();
  const now = Date.now();
  const iso = (ms) => new Date(ms).toISOString();
  db.rows.coach_cal_items = [{ id: 'c1', coach_id: 'c1', title: 'Far call', starts_at: iso(now + 200 * 864e5), ends_at: iso(now + 200 * 864e5 + 36e5), time_zone: 'Europe/London' }];
  await store.loadCoach(USER);
  db.hold = (t) => t === 'coach_cal_items';
  const day = iso(now + 200 * 864e5).slice(0, 10);
  const reading = store.ensureCalRange(USER, day, day);
  await pause();
  await store.saveRow(USER, 'coach_cal_items', { id: 'c2', coach_id: 'c1', title: 'New far call', starts_at: iso(now + 201 * 864e5), ends_at: iso(now + 201 * 864e5 + 36e5), time_zone: 'Europe/London' });
  release();
  assert.equal(await reading, true);
  assert.deepEqual(ids('coach_cal_items'), ['c1', 'c2']);
});

test('the next load after the race brings the database’s copy as before', async () => {
  fresh();
  await store.loadCoach(USER);
  db.hold = (t) => t === 'coach_todos';
  const loading = store.loadCoach(USER, { again: true });
  await pause();
  await store.saveRow(USER, 'coach_todos', { id: 't3', coach_id: 'c1', title: 'Book the room', done_at: null });
  release();
  await loading;
  db.hold = null;
  // Another device deletes the new to-do: the next load shows that.
  db.rows.coach_todos = db.rows.coach_todos.filter((r) => r.id !== 't3');
  await store.loadCoach(USER);
  assert.deepEqual(ids('coach_todos'), ['t1', 't2']);
});

test('a table past 5,000 rows read while another device deletes rows loses none of the rest', async () => {
  fresh();
  db.rows.client_profiles = Array.from({ length: 7000 }, (_, n) => ({ id: `p${String(n).padStart(5, '0')}`, coach_id: 'c1', name: `Client ${n}` }));
  // Each page read, another device deletes one of the rows already read.
  let deleted = 0;
  const realFrom = globalThis.__db.from;
  globalThis.__db.from = (table) => {
    const c = realFrom(table);
    const then = c.then;
    c.then = (ok, bad) => {
      if (table === 'client_profiles' && db.reads.filter((r) => r.table === 'client_profiles').length >= 2) {
        db.rows.client_profiles.splice(deleted * 10, 1);
        deleted += 1;
      }
      return then(ok, bad);
    };
    return c;
  };
  try {
    await store.loadCoach(USER);
  } finally {
    globalThis.__db.from = realFrom;
  }
  const want = db.rows.client_profiles.map((r) => r.id).sort();
  const have = ids('client_profiles');
  const missing = want.filter((id) => !have.includes(id));
  assert.deepEqual(missing, [], 'every row still in the database is on the device');
});

test('a recap typed on a second device after it was sent there says so, never losing the words quietly', async () => {
  fresh();
  db.rows.coach_sessions = [{ id: 's1', coach_id: 'c1', profile_id: 'p1', starts_at: '2026-11-20T10:00:00.000Z', minutes: 60, outcome: 'held', recap: 'Sent words', recap_sent_at: null }];
  await store.loadCoach(USER);
  // The first device sends the recap.
  Object.assign(db.rows.coach_sessions[0], { recap_sent_at: '2026-11-23T09:00:00.000Z', updated_at: serverNow() });
  // This device still shows it unsent, and the coach types on.
  const here = store.rowOf(store.coachState(USER), 'coach_sessions', 's1');
  assert.equal(here.recap_sent_at, null);
  await assert.rejects(() => actions.saveSession(USER, { ...here, recap: 'Sent words, and more typed here' }), { code: 'already_sent', message: 'This recap has already been sent.' });
  const after = store.rowOf(store.coachState(USER), 'coach_sessions', 's1');
  assert.equal(after.recap, 'Sent words', 'the page shows the recap as it was sent');
  assert.ok(after.recap_sent_at);
  // A save that changes nothing of the recap (the minutes, say) on a session already shown as sent is refused as before.
  await assert.rejects(() => actions.saveSession(USER, { ...after, recap: 'Other words' }), { code: 'locked' });
});
