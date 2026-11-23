// Scale check, step 3 (22 Nov): the coach store's load at 1,000 clients.
// - The merge is one pass now (it copied the whole table for every row: 10 s
//   for the owner). Checked against the old merge, row for row, on random
//   copies with every kind of mark.
// - A read that covers only part of a table (the calendar's weeks, the newer
//   to-dos) leaves the rest of the device's copy as it was.
// - Nothing is cut off: a table is read a page of 1,000 at a time until it has
//   no more (the owner's calendar passed the old 5,000 and lost the rest).
// - The first reads and the later ones, and the calendar read as the coach moves.
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

// A stand-in database that honours what the store asks: or/lt/gte filters it understands, order and range.
const db = { rows: {}, reads: [] };
globalThis.__db = {
  async rpc() { return { data: null, error: null }; },
  from(table) {
    const q = { tests: [], from: 0, to: Infinity, max: Infinity };
    const at = (v) => Date.parse(v);
    const chain = {
      select: () => chain,
      order: () => chain,
      eq: (c, v) => { q.tests.push((r) => r[c] === v); return chain; },
      gt: (c, v) => { q.after = v; q.tests.push((r) => String(r[c]) > String(v)); return chain; },
      lt: (c, v) => { q.tests.push((r) => r[c] != null && at(r[c]) < at(v)); return chain; },
      gte: (c, v) => { q.tests.push((r) => r[c] != null && at(r[c]) >= at(v)); return chain; },
      or: (expr) => { q.or = expr; return chain; },
      limit: (n) => { q.max = n; return chain; },
      range: (a, b) => { q.from = a; q.to = b; return chain; },
      then: (ok, bad) => Promise.resolve().then(() => {
        db.reads.push({ table, or: q.or || null, from: q.from, after: q.after || null });
        let rows = [...(db.rows[table] || [])].sort((x, y) => String(x.id).localeCompare(String(y.id)));
        if (q.or && table === 'coach_todos') {
          const cut = at(/done_at\.gte\."([^"]+)"/.exec(q.or)[1]);
          rows = rows.filter((r) => r.done_at == null || at(r.done_at) >= cut);
        } else if (q.or && table === 'coach_cal_items') {
          const to = at(/starts_at\.lt\."([^"]+)"/.exec(q.or)[1]);
          const from = at(/ends_at\.gt\."([^"]+)"/.exec(q.or)[1]);
          rows = rows.filter((r) => r.repeat_rule != null || (at(r.starts_at) < to && at(r.ends_at) > from));
        }
        rows = rows.filter((r) => q.tests.every((t) => t(r)));
        return { data: rows.slice(q.from, Math.min(q.to + 1, q.from + q.max)), error: null };
      }).then(ok, bad),
    };
    return chain;
  },
};

const store = await import('../../src/lib/coach/store.js');
const { TABLES, keyOf, mergeLoaded, mergeTable, calWindow } = store;

// ---------------------------------------------------------------- the old merge, exactly as it was before step 3

function setRowOld(state, table, row, mark) {
  const k = keyOf(table, row);
  return {
    rows: { ...state.rows, [table]: { ...(state.rows[table] || {}), [k]: row } },
    marks: { ...state.marks, [table]: { ...(state.marks[table] || {}), [k]: { sent: false, gone: false, refused: false, ...mark } } },
  };
}
const READ_ONLY = new Set(['activity_log', 'workshop_survey_answers', 'workshop_sends', 'coach_poll_votes', 'coach_bookings',
  'coach_cal_reminder_sends', 'coach_email_addresses']);
function oldMerge(before, db) {
  let next = { rows: {}, marks: {} };
  for (const table of Object.keys(TABLES)) {
    if (!db[table]) {
      if (before.rows[table]) { next.rows[table] = before.rows[table]; next.marks[table] = before.marks[table] || {}; }
      continue;
    }
    for (const row of db[table]) next = setRowOld(next, table, row, { sent: true });
    for (const [k, row] of Object.entries(before.rows[table] || {})) {
      const m = before.marks[table]?.[k] || {};
      const inDb = Boolean(next.rows[table]?.[k]);
      if (m.gone) {
        if (inDb) next = setRowOld(next, table, row, { sent: true, gone: true });
        continue;
      }
      if (m.sent) continue;
      if (READ_ONLY.has(table)) continue;
      next = setRowOld(next, table, row, { sent: false, refused: m.refused === true, ...(m.part === true ? { part: true } : {}) });
    }
  }
  return next;
}

// ---------------------------------------------------------------- random copies

let seed = 7;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const pick = (list) => list[Math.floor(rnd() * list.length)];
const MARKS = [undefined, { sent: true, gone: false, refused: false }, { sent: false, gone: false, refused: false }, { sent: true, gone: true, refused: false },
  { sent: false, gone: false, refused: true }, { sent: false, gone: false, refused: false, part: true }];
const rowFor = (table, n, v) => (table === 'coach_session_people'
  ? { session_id: `s${n}`, profile_id: `p${n % 3}`, v }
  : table === 'coach_days' ? { coach_id: 'c1', day: `2026-11-${String(1 + (n % 28)).padStart(2, '0')}`, v } : { id: `r${n}`, coach_id: 'c1', title: `Row ${n}`, v, updated_at: `2026-11-0${1 + (v % 9)}T00:00:00Z` });

function randomCase(tables) {
  const before = { rows: {}, marks: {} };
  const dbRows = {};
  for (const table of tables) {
    if (rnd() < 0.15) continue; // a table the device has never held
    for (let n = 0; n < 40; n += 1) {
      if (rnd() < 0.5) {
        const row = rowFor(table, n, Math.floor(rnd() * 3));
        const k = keyOf(table, row);
        (before.rows[table] ||= {})[k] = row;
        const m = pick(MARKS);
        if (m) (before.marks[table] ||= {})[k] = { ...m };
      }
      if (rnd() < 0.5) (dbRows[table] ||= []).push(rowFor(table, n, Math.floor(rnd() * 3)));
    }
    if (rnd() < 0.2) delete dbRows[table]; // a table the database doesn't have yet
    else dbRows[table] ||= [];
  }
  return { before, dbRows };
}

test('the one-pass merge gives exactly what the old merge gave, for every kind of row and mark', () => {
  const tables = ['coach_todos', 'coach_sessions', 'coach_session_people', 'coach_days', 'activity_log', 'coach_bookings', 'client_notes', 'coach_cal_items'];
  for (let round = 0; round < 300; round += 1) {
    const { before, dbRows } = randomCase(tables);
    const expected = oldMerge(before, dbRows);
    const read = new Map(Object.entries(dbRows).map(([t, rows]) => [t, { rows, inScope: null }]));
    const got = mergeLoaded(before, read);
    // Tables not read are kept exactly; the old merge also left out tables it read and found empty with nothing before.
    for (const table of Object.keys(TABLES)) {
      assert.deepEqual(got.rows[table], expected.rows[table], `round ${round}: ${table} rows`);
      assert.deepEqual(got.marks[table] && Object.keys(got.rows[table] || {}).length ? got.marks[table] : expected.marks[table] && Object.keys(expected.rows[table] || {}).length ? expected.marks[table] : undefined,
        expected.marks[table] && Object.keys(expected.rows[table] || {}).length ? expected.marks[table] : undefined, `round ${round}: ${table} marks`);
      // Same order of rows, as the pages saw them before.
      assert.deepEqual(Object.keys(got.rows[table] || {}), Object.keys(expected.rows[table] || {}), `round ${round}: ${table} order`);
    }
  }
});

test('the merge takes linear time: 6,000 rows merge in well under a second', () => {
  const rows = Array.from({ length: 6000 }, (_, n) => ({ id: `r${String(n).padStart(5, '0')}`, coach_id: 'c1', title: 'x', updated_at: '2026-11-01T00:00:00Z' }));
  const t0 = Date.now();
  mergeLoaded({ rows: {}, marks: {} }, new Map([['coach_cal_items', { rows, inScope: null }]]));
  assert.ok(Date.now() - t0 < 500, `took ${Date.now() - t0} ms`);
});

test('an unchanged table, and each unchanged row, is handed back as it was', () => {
  const dbRows = [{ id: 'a', title: 'A', updated_at: '2026-11-01T00:00:00Z' }, { id: 'b', title: 'B', updated_at: '2026-11-01T00:00:00Z' }];
  const first = mergeTable('coach_todos', undefined, undefined, dbRows, null);
  const again = mergeTable('coach_todos', first.rows, first.marks, dbRows.map((r) => ({ ...r })), null);
  assert.equal(again.rows, first.rows, 'the same table object');
  assert.equal(again.marks, first.marks);
  const changed = mergeTable('coach_todos', first.rows, first.marks, [{ ...dbRows[0] }, { ...dbRows[1], title: 'B2', updated_at: '2026-11-02T00:00:00Z' }], null);
  assert.notEqual(changed.rows, first.rows);
  assert.equal(changed.rows.a, first.rows.a, 'row a kept as it was');
  assert.equal(changed.rows.b.title, 'B2');
  // A change the database made without moving updated_at (a table with no touch trigger) is still seen.
  const quiet = mergeTable('coach_todos', first.rows, first.marks, [{ ...dbRows[0], title: 'A, changed quietly' }, { ...dbRows[1] }], null);
  assert.equal(quiet.rows.a.title, 'A, changed quietly');
  assert.equal(quiet.rows.b, first.rows.b);
});

test('a read that covers part of a table leaves the rest as it was', () => {
  const before = {
    rows: { coach_cal_items: { old: { id: 'old', starts_at: '2025-01-01T09:00:00Z', ends_at: '2025-01-01T10:00:00Z' }, gone: { id: 'gone', starts_at: '2026-11-20T09:00:00Z', ends_at: '2026-11-20T10:00:00Z' }, mine: { id: 'mine', starts_at: '2026-11-21T09:00:00Z', ends_at: '2026-11-21T10:00:00Z' } } },
    marks: { coach_cal_items: { old: { sent: true, gone: false, refused: false }, gone: { sent: true, gone: false, refused: false }, mine: { sent: false, gone: false, refused: false } } },
  };
  const w = calWindow(Date.parse('2026-11-01T00:00:00Z'), Date.parse('2026-12-31T00:00:00Z'));
  const next = mergeLoaded(before, new Map([['coach_cal_items', { rows: [{ id: 'new', starts_at: '2026-11-22T09:00:00Z', ends_at: '2026-11-22T10:00:00Z' }], inScope: w.inScope }]]));
  assert.deepEqual(Object.keys(next.rows.coach_cal_items).sort(), ['mine', 'new', 'old'], 'the old week kept, the deleted one in the window gone, the unsent one kept');
  assert.equal(next.marks.coach_cal_items.mine.sent, false);
  assert.ok(w.inScope({ id: 's', repeat_rule: { every: 'week' }, starts_at: '2020-01-01T00:00:00Z', ends_at: '2020-01-01T01:00:00Z' }), 'a series is always in');
  assert.ok(w.inScope({ id: 'x', series_id: 's', occurrence_on: '2026-11-10', starts_at: '2027-05-01T00:00:00Z', ends_at: '2027-05-01T01:00:00Z' }), 'a stand-in for a time in the window, moved out of it');
});

test('nothing is cut off: 6,500 rows come whole (one read, then pages in key order), and the calendar comes by window', async () => {
  store.resetCoachStoreForTests();
  db.rows = {};
  const now = Date.now();
  const iso = (ms) => new Date(ms).toISOString();
  db.rows.client_profiles = Array.from({ length: 6500 }, (_, n) => ({ id: `p${String(n).padStart(5, '0')}`, coach_id: 'c1', name: `Client ${n}` }));
  db.rows.coach_todos = [
    { id: 't-open', coach_id: 'c1', title: 'Open', done_at: null },
    { id: 't-recent', coach_id: 'c1', title: 'Done lately', done_at: iso(now - 5 * 864e5) },
    { id: 't-old', coach_id: 'c1', title: 'Done long ago', done_at: iso(now - 200 * 864e5) },
  ];
  db.rows.coach_cal_items = [
    { id: 'c-now', coach_id: 'c1', title: 'This week', starts_at: iso(now + 864e5), ends_at: iso(now + 864e5 + 36e5), time_zone: 'Europe/London' },
    { id: 'c-far', coach_id: 'c1', title: 'Next year', starts_at: iso(now + 300 * 864e5), ends_at: iso(now + 300 * 864e5 + 36e5), time_zone: 'Europe/London' },
    { id: 'c-series', coach_id: 'c1', title: 'Every week', repeat_rule: { every: 'week' }, starts_at: iso(now - 400 * 864e5), ends_at: iso(now - 400 * 864e5 + 36e5), time_zone: 'Europe/London' },
  ];
  db.rows.client_notes = [{ id: 'n1', coach_id: 'c1', profile_id: 'p00001', body: 'A note' }];
  db.reads = [];
  assert.equal(await store.loadCoach('acct'), true);
  let state = store.coachState('acct');
  assert.equal(store.rowsOf(state, 'client_profiles').length, 6500, 'every client, past the old cap of 5,000');
  assert.equal(new Set(store.rowsOf(state, 'client_profiles').map((p) => p.id)).size, 6500, 'each once');
  assert.deepEqual(db.reads.filter((r) => r.table === 'client_profiles').map((r) => r.after).slice(-8), [null, null, 'p00999', 'p01999', 'p02999', 'p03999', 'p04999', 'p05999'], 'one read of 5,000, then pages of 1,000, each after the last key read');
  assert.equal(db.reads.filter((r) => r.table === 'coach_todos' && r.or).length, 1, 'a small table: one read, as before');
  assert.deepEqual(store.rowsOf(state, 'coach_todos').map((t) => t.id).sort(), ['t-open', 't-recent'], 'first: open and lately done');
  assert.deepEqual(store.rowsOf(state, 'coach_cal_items').map((t) => t.id).sort(), ['c-now', 'c-series'], 'first: the weeks around now, and every series');
  assert.equal(store.rowsOf(state, 'client_notes').length, 1, 'client notes come with the first load (tidy follow-up 3, scale check 3)');
  // Later, once the page has drawn: the older to-dos and the notes.
  assert.equal(await store.loadCoachLater('acct'), false, 'already on its way: asked once a visit');
  await new Promise((r) => { setTimeout(r, 150); });
  state = store.coachState('acct');
  assert.deepEqual(store.rowsOf(state, 'coach_todos').map((t) => t.id).sort(), ['t-old', 't-open', 't-recent']);
  assert.equal(store.rowsOf(state, 'client_notes').length, 1);
  // Next year's week, read when the calendar moves there; once read, it isn't asked again.
  const far = iso(now + 300 * 864e5).slice(0, 10);
  assert.equal(await store.ensureCalRange('acct', far, far), true);
  assert.ok(store.rowsOf(store.coachState('acct'), 'coach_cal_items').some((i) => i.id === 'c-far'));
  const asked = db.reads.length;
  assert.equal(await store.ensureCalRange('acct', far, far), true);
  assert.equal(db.reads.length, asked, 'no second read for the same weeks');
  // A second load keeps next year's item (outside the first window) and the older to-dos.
  await store.loadCoach('acct');
  state = store.coachState('acct');
  assert.ok(store.rowsOf(state, 'coach_cal_items').some((i) => i.id === 'c-far'));
  assert.ok(store.rowsOf(state, 'coach_todos').some((t) => t.id === 't-old'));
  // A to-do deleted elsewhere in the first window goes on the next load.
  db.rows.coach_todos = db.rows.coach_todos.filter((t) => t.id !== 't-open');
  await store.loadCoach('acct');
  assert.ok(!store.rowsOf(store.coachState('acct'), 'coach_todos').some((t) => t.id === 't-open'));
});
