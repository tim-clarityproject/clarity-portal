// The break-it tester's Finances findings (Phase 6b run 2), item 3: Finances' settings and targets saved from a tab
// left open. Only the columns a panel changed are sent, put onto the row as the device holds it now; a panel opened
// before another tab or device changed the row is refused (the store's 'superseded', SUPERSEDED_MESSAGE on the page)
// and the device shows the newest row; nothing is ever silently written over. Walked through the real coach store and
// sync queue with a stand-in database that keeps updated_at as 062's p1_touch does, and keeps 062's unique keys
// (finance_settings by coach, finance_targets by coach and month). Nothing here reaches a real database.
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

// ---------------------------------------------------------------- a stand-in database with 062's keys and p1_touch
const KEYS = { finance_settings: ['coach_id'], finance_targets: ['coach_id', 'month'], associate_statements: ['associate_id', 'month'] };
const db = { rows: {}, tick: 0 };
const serverNow = () => new Date(Date.UTC(2026, 10, 25, 9, 0, 0, 0) + (db.tick += 1000)).toISOString();
globalThis.__db = {
  async rpc() { return { data: null, error: { code: 'PGRST202', message: 'Could not find the function' }, status: 404 }; },
  from(table) {
    const q = { filters: [], op: 'select', values: null, max: null, opts: {} };
    const run = () => {
      const rows = (db.rows[table] ||= []);
      const hit = () => rows.filter((r) => q.filters.every(([c, v]) => (c === 'updated_at' ? Date.parse(r[c]) === Date.parse(v) : r[c] === v)));
      if (q.op === 'select') { const h = hit().map((r) => ({ ...r })); return { data: q.max ? h.slice(0, q.max) : h, error: null }; }
      if (q.op === 'upsert') {
        const cols = String(q.opts.onConflict || 'id').split(',');
        const out = [];
        for (const v of [q.values].flat()) {
          const old = rows.find((r) => cols.every((c) => r[c] === v[c]));
          if (old && q.opts.ignoreDuplicates) continue;
          if (old) { Object.assign(old, v, { updated_at: serverNow() }); out.push({ ...old }); } else { const r = { ...v, created_at: serverNow(), updated_at: serverNow() }; rows.push(r); out.push({ ...r }); }
        }
        return { data: out, error: null };
      }
      if (q.op === 'update') return { data: hit().map((r) => Object.assign(r, q.values, { updated_at: serverNow() })).map((r) => ({ ...r })), error: null };
      return { data: [], error: null };
    };
    const chain = {
      select: () => chain, order: () => chain, range: () => chain, or: () => chain, lt: () => chain, gte: () => chain, in: () => chain, is: () => chain,
      limit: (n) => { q.max = n; return chain; },
      eq: (c, v) => { q.filters.push([c, v]); return chain; },
      upsert: (values, opts = {}) => { q.op = 'upsert'; q.values = values; q.opts = opts; return chain; },
      update: (values) => { q.op = 'update'; q.values = values; return chain; },
      then: (ok, bad) => Promise.resolve().then(run).then(ok, bad),
    };
    return chain;
  },
};

const store = await import('../../src/lib/coach/store.js');
const { undoOf } = await import('../../src/lib/coach/financeData.js');

const USER = 'account-fin';
const COACH = 'coach-tim';
function reload() {
  store.resetCoachStoreForTests();
  db.rows = {};
  for (const k of local.keys()) local.removeItem(k);
}
/** The row as another device's save leaves it in the database (p1_touch moves updated_at). */
const otherDevice = (table, where, change) => Object.assign(db.rows[table].find((r) => Object.entries(where).every(([c, v]) => r[c] === v)), change, { updated_at: serverNow() });
const kept = (table, key) => store.rowNow(USER, table, key);
const SETTINGS = { coach_id: COACH };

function seedSettings(over = {}) {
  const row = { id: 'fs-1', coach_id: COACH, minimum_minor: 200000, targets_mode: 'each', tax_share_percent: 25, keep_above_minor: null, cash_months: 6, bank_balance_minor: 400000, updated_at: serverNow(), ...over };
  db.rows.finance_settings = [{ ...row }];
  store.noteRows(USER, [['finance_settings', { ...row }]]); // the device holds the database's copy, as a load leaves it
  return row;
}

test('only the changed settings are sent, onto the row as it is now: another tab’s edit to the others is kept', async () => {
  reload();
  const row = seedSettings();
  // Tab A opens Cash flow settings; tab B (same device) saves how far ahead meanwhile, onto the same row.
  const baseA = kept('finance_settings', SETTINGS).updated_at;
  assert.equal(await store.saveChange(USER, 'finance_settings', SETTINGS, { cash_months: 12 }), 'saved');
  // Tab A's panel then saves its own change: refused, since the row moved on since it opened.
  assert.equal(await store.saveChange(USER, 'finance_settings', SETTINGS, { tax_share_percent: 30 }, { basedOn: baseA }), 'superseded');
  assert.deepEqual([db.rows.finance_settings[0].tax_share_percent, db.rows.finance_settings[0].cash_months], [25, 12], 'nothing written over');
  // Reopened (it now reads the newest row): only the share goes, and the other tab's 12 months stay.
  const baseA2 = kept('finance_settings', SETTINGS).updated_at;
  assert.equal(await store.saveChange(USER, 'finance_settings', SETTINGS, { tax_share_percent: 30 }, { basedOn: baseA2 }), 'saved');
  assert.deepEqual([db.rows.finance_settings[0].tax_share_percent, db.rows.finance_settings[0].cash_months, db.rows.finance_settings[0].minimum_minor], [30, 12, row.minimum_minor]);
  assert.equal(kept('finance_settings', SETTINGS).updated_at, db.rows.finance_settings[0].updated_at, 'the device holds the database’s own version');
});

test('another device changed the settings since this tab read them: the database refuses it, and the device shows the newest', async () => {
  reload();
  seedSettings();
  const base = kept('finance_settings', SETTINGS).updated_at;
  otherDevice('finance_settings', SETTINGS, { minimum_minor: 350000 });
  assert.equal(await store.saveChange(USER, 'finance_settings', SETTINGS, { bank_balance_minor: 999900 }, { basedOn: base }), 'superseded');
  assert.deepEqual([db.rows.finance_settings[0].minimum_minor, db.rows.finance_settings[0].bank_balance_minor], [350000, 400000], 'the other device’s row is untouched');
  assert.equal(kept('finance_settings', SETTINGS).minimum_minor, 350000, 'the device shows the newest row');
  // Even with no panel base (the months switch), the device's version is checked in the database.
  otherDevice('finance_settings', SETTINGS, { tax_share_percent: 40 });
  assert.equal(await store.saveChange(USER, 'finance_settings', SETTINGS, { cash_months: 3 }), 'superseded');
  assert.deepEqual([db.rows.finance_settings[0].cash_months, kept('finance_settings', SETTINGS).tax_share_percent], [6, 40]);
});

test('Edit targets from a stale panel: no month is written when one moved on, a month another device added first is never overwritten', async () => {
  reload();
  seedSettings();
  const nov = { id: 't-nov', coach_id: COACH, month: '2026-11-01', target_minor: 500000, updated_at: serverNow() };
  db.rows.finance_targets = [{ ...nov }];
  store.noteRows(USER, [['finance_targets', { ...nov }]]);
  const bases = { nov: kept('finance_targets', { coach_id: COACH, month: '2026-11-01' }).updated_at, dec: null };
  // Another tab on this device saves November meanwhile.
  assert.equal(await store.saveChange(USER, 'finance_targets', { coach_id: COACH, month: '2026-11-01' }, { target_minor: 550000 }), 'saved');
  const steps = [
    { table: 'finance_targets', key: { coach_id: COACH, month: '2026-12-01' }, change: { target_minor: 600000 }, basedOn: bases.dec },
    { table: 'finance_targets', key: { coach_id: COACH, month: '2026-11-01' }, change: { target_minor: 520000 }, basedOn: bases.nov },
  ];
  assert.equal(await store.saveChanges(USER, steps), 'superseded');
  assert.deepEqual(db.rows.finance_targets.map((r) => [r.month, r.target_minor]), [['2026-11-01', 550000]], 'neither month written');
  // December added on another device; this tab's panel opened with no December: refused, and it shows theirs.
  db.rows.finance_targets.push({ id: 't-dec-other', coach_id: COACH, month: '2026-12-01', target_minor: 610000, updated_at: serverNow() });
  assert.equal(await store.saveChange(USER, 'finance_targets', { coach_id: COACH, month: '2026-12-01' }, { target_minor: 600000 }, { basedOn: null }), 'superseded');
  assert.equal(db.rows.finance_targets.find((r) => r.month === '2026-12-01').target_minor, 610000);
  assert.equal(kept('finance_targets', { coach_id: COACH, month: '2026-12-01' }).target_minor, 610000);
  // A month nobody has yet is added.
  assert.equal(await store.saveChange(USER, 'finance_targets', { coach_id: COACH, month: '2027-01-01' }, { target_minor: 700000 }, { basedOn: null }), 'saved');
  assert.equal(db.rows.finance_targets.find((r) => r.month === '2027-01-01').target_minor, 700000);
});

test('Undo puts back only the columns it changed', async () => {
  reload();
  seedSettings();
  const change = { minimum_minor: 300000, targets_mode: 'same' };
  const was = { ...kept('finance_settings', SETTINGS) };
  assert.equal(await store.saveChange(USER, 'finance_settings', SETTINGS, change, { basedOn: was.updated_at }), 'saved');
  assert.equal(await store.saveChange(USER, 'finance_settings', SETTINGS, { cash_months: 12 }), 'saved'); // another tab, meanwhile
  assert.deepEqual(undoOf(change, was), { minimum_minor: 200000, targets_mode: 'each' });
  assert.equal(await store.saveChange(USER, 'finance_settings', SETTINGS, undoOf(change, was)), 'saved');
  const r = db.rows.finance_settings[0];
  assert.deepEqual([r.minimum_minor, r.targets_mode, r.cash_months], [200000, 'each', 12], 'the other tab’s 12 months stay');
});

test('item 5: associate statements are one row an associate and month on the device, so two devices write the same row', () => {
  assert.equal(store.keyOf('associate_statements', { id: 'a', associate_id: 'c-maya', month: '2026-11-01' }), store.keyOf('associate_statements', { id: 'b', associate_id: 'c-maya', month: '2026-11-01' }));
});
