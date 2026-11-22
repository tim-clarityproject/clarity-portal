// Network's data module (src/lib/coach/networkData.js) answers the same
// questions in the same shapes whichever way it is answered: device first
// before Tim has run 052, by the database after. This loads the real module
// with a stand-in database client (tests/coach/supabase-stub.mjs) backed by
// the SQL's twin (tests/coach/crm-standin.mjs), and walks both, and the
// move across between them. Nothing here reaches a real database.
import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolve as resolvePath } from 'node:path';

const stub = pathToFileURL(resolvePath('tests/coach/supabase-stub.mjs')).href;
register(`data:text/javascript,${encodeURIComponent(`export async function resolve(s, c, n) { if (/(^|\\/)supabase(\\.js)?$/.test(s) && String(c.parentURL || '').includes('/src/lib/')) return { url: ${JSON.stringify(stub)}, shortCircuit: true }; return n(s, c); }`)}`);

// A device: its storage, and nothing else a page has.
function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); }, key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; }, keys: () => [...m.keys()] };
}
const local = fakeStorage();
globalThis.window = { localStorage: local, sessionStorage: fakeStorage(), addEventListener() {}, removeEventListener() {}, setInterval, clearInterval, setTimeout, clearTimeout };

const { CRM_TABLES, crmStandIn } = await import('../coach/crm-standin.mjs');
const { ME, OTHER } = await import('../coach/shared.mjs');
const data = await import('../../src/lib/coach/networkData.js');
const { resetCoachStoreForTests } = await import('../../src/lib/coach/store.js');
const { dueOn } = await import('../../src/lib/coach/network.js');

const USER = 'account-1';
const TODAY = '2026-11-19';
class Refusal extends Error { constructor(code, message) { super(message); this.code = code; } }
const no = (code, message) => { throw new Refusal(code, message); };

/** The stand-in database: 052 there or not, reachable or not, with every call listed. */
const db = { there: false, down: false, calls: [], rows: null, sim: null };
function freshDb() {
  db.rows = Object.fromEntries([...CRM_TABLES, 'coach_leads', 'coach_todos', 'client_profiles', 'coach_cal_items', 'organisation_contacts'].map((t) => [t, []]));
  const me = { id: ME, role: 'owner', display_first_name: 'Tess', active: true };
  db.sim = crmStandIn({ store: { rows: db.rows, coaches: [me, { id: OTHER, role: 'coach', active: true }], fn: {} }, ME, me, clock: () => new Date('2026-11-19T10:00:00Z'), no });
  db.calls = [];
}
const offline = { message: 'TypeError: Failed to fetch' };
const answer = (fn) => { try { return { data: fn(), error: null }; } catch (e) { if (e instanceof Refusal) return { data: null, error: { code: e.code, message: e.message } }; throw e; } };
globalThis.__db = {
  async rpc(name, args = {}) {
    db.calls.push(`rpc ${name}`);
    if (db.down) return { data: null, error: offline };
    if (!db.there) return { data: null, error: { code: 'PGRST202', message: `Could not find the function public.${name}` } };
    const f = db.sim.fn;
    const run = { network_page: () => f.network_page(args), network_map: () => f.network_map(args), network_counts: () => f.network_counts(args),
      network_archive: () => f.network_archive(args.p_ids, args.p_keep), network_restore: () => f.network_restore(args.p_ids, args.p_unkeep),
      network_duplicates: () => f.network_duplicates(args.p_rows), network_import: () => f.network_import(args.p_rows),
      network_merge: () => f.network_merge(args.p_keep, args.p_drop, args.p_values), network_unmerge: () => f.network_unmerge(args.p_merge) }[name];
    return answer(run);
  },
  from(table) {
    const q = { filters: [], op: 'select', values: null };
    const key = (r) => (table === 'network_ratings' ? `${r.person_id}|${r.rating}|${r.rated_on}` : r.id);
    const run = () => {
      db.calls.push(`${q.op} ${table}`);
      if (db.down) return { data: null, error: offline };
      if (CRM_TABLES.includes(table) && !db.there) return { data: null, error: { code: 'PGRST205', message: `Could not find the table 'public.${table}' in the schema cache` } };
      const rows = db.rows[table] || [];
      const hit = () => rows.filter((r) => q.filters.every(([c, set]) => set.includes(r[c])) && (!CRM_TABLES.includes(table) || db.sim.readable(table, r)));
      return answer(() => {
        if (q.op === 'select') return q.single ? hit()[0] ?? null : hit();
        if (q.op === 'upsert') {
          const out = [];
          for (const v of Array.isArray(q.values) ? q.values : [q.values]) {
            const old = rows.find((r) => key(r) === key(v)) || null;
            const kept = db.sim.before(table, old, old ? { ...old, ...v } : { created_at: '2026-11-19T10:00:00.000Z', ...v });
            const was = old ? { ...old } : null;
            if (old) Object.assign(old, kept); else rows.push(kept);
            db.sim.after(table, was, old || kept);
            out.push(old || kept);
          }
          return out;
        }
        if (q.op === 'update') return hit().map((old) => { const was = { ...old }; Object.assign(old, db.sim.before(table, old, { ...old, ...q.values })); db.sim.after(table, was, old); return old; });
        if (q.op === 'delete') return db.sim.remove(table, hit());
        return [];
      });
    };
    const chain = {
      select: () => chain, limit: () => chain, order: () => chain,
      eq: (c, v) => { q.filters.push([c, [v]]); return chain; },
      in: (c, list) => { q.filters.push([c, list]); return chain; },
      maybeSingle: () => { q.single = true; return chain; },
      upsert: (values) => { q.op = 'upsert'; q.values = values; return chain; },
      update: (values) => { q.op = 'update'; q.values = values; return chain; },
      delete: () => { q.op = 'delete'; return chain; },
      then: (ok, bad) => Promise.resolve().then(run).then(ok, bad),
    };
    return chain;
  },
};

/** A new page load: the modules forget what they remember; the device and the database stay as they are. */
function reload() {
  resetCoachStoreForTests();
  data.resetNetworkDataForTests();
  for (const k of local.keys()) if (/not-yet$/.test(k)) local.removeItem(k);
}
const person = (id, name, extra = {}) => ({ id, coach_id: ME, name, ...extra });
const kept = () => JSON.parse(local.getItem(`clarity-coach-network-local:${USER}`) || 'null');
const page = (query = {}) => data.networkPageOf(USER, { today: TODAY, ...query });

test('before 052: Network is kept on the device, and answers in the database’s own shapes', async () => {
  freshDb();
  reload();
  assert.equal(await data.networkReady(), false);
  assert.equal(await data.saveNetworkPerson(USER, person('dan', 'Dan Reid', { organisation: 'Harbour Lane', role: 'Referrer', email: 'dan@example.invalid', influence: 6, trust: 9, value_delivery: 7, what_you_get: 8, rhythm_months: 3, last_spoke_on: '2026-08-17' })), 'device');
  await data.saveNetworkPerson(USER, person('sofia', 'Sofia Marsh', { organisation: 'Citadel', influence: 7, trust: 4, value_delivery: 5, what_you_get: 6, rhythm_months: 3, last_spoke_on: '2026-08-10' }));
  await data.saveNetworkPerson(USER, person('old', 'Zara Nash', { organisation: 'Orbital Health', last_spoke_on: '2025-05-12', added_on: '2025-01-01' }));
  await data.saveNetworkPerson(USER, person('old2', 'Bea Reeves', { organisation: 'Harbour City FC', added_on: '2025-03-07' }));
  const first = await page();
  assert.deepEqual([first.total, first.all, first.rows.map((p) => p.name).join(',')], [4, 4, 'Bea Reeves,Dan Reid,Sofia Marsh,Zara Nash']);
  assert.deepEqual(first.rows.find((p) => p.id === 'dan') && [first.rows[1].focus, first.rows[1].due_on, first.rows[1].given_count], ['keep_close', '2026-11-17', 0]);
  assert.deepEqual((await page({ sort: 'due', only: { due: 'now' } })).rows.map((p) => p.name), ['Sofia Marsh', 'Dan Reid']);
  assert.deepEqual(await data.networkCountsOf(USER, TODAY), { active: 4, archived: 0, due: 2, ready: 2 });
  assert.deepEqual((await data.networkMapOf(USER)).rows.map((p) => p.name), ['Dan Reid', 'Sofia Marsh']);

  // A change carries only what changed; each rating that changes writes its own dated line, one a day.
  await data.saveNetworkPerson(USER, { id: 'dan', trust: 8 });
  await data.saveNetworkPerson(USER, { id: 'dan', trust: 10, role: 'Sponsor' });
  await data.saveNetworkGive(USER, { id: 'g1', person_id: 'dan', coach_id: ME, direction: 'gave', kind: 'idea', note: 'A different approach.', happened_on: TODAY });
  await data.saveNetworkGive(USER, { id: 'g2', person_id: 'dan', coach_id: ME, direction: 'asked', kind: 'referral', happened_on: '2026-11-01' });
  const dan = await data.networkPerson(USER, 'dan');
  assert.deepEqual([dan.person.name, dan.person.trust, dan.person.role, dan.person.organisation, dan.person.given_count, dan.person.asked_count], ['Dan Reid', 10, 'Sponsor', 'Harbour Lane', 1, 1]);
  assert.deepEqual([dan.gives.map((g) => g.id).join(','), dan.ratings.length, dan.ratings.find((r) => r.rating === 'trust').value], ['g1,g2', 4, 10]);
  assert.equal(await data.networkPerson(USER, 'nobody'), null);
  await data.removeNetworkGive(USER, 'g2');
  assert.equal((await data.networkPerson(USER, 'dan')).person.asked_count, 0);

  // Archive with someone kept, and its Undo.
  assert.equal(await data.archiveNetwork(USER, ['old2'], ['old']), 1);
  assert.deepEqual(await data.networkCountsOf(USER, TODAY), { active: 3, archived: 1, due: 2, ready: 0 });
  assert.equal((await page({ archived: true })).rows[0].name, 'Bea Reeves');
  assert.equal(await data.restoreNetwork(USER, ['old2'], ['old']), 1);
  assert.equal((await data.networkCountsOf(USER, TODAY)).ready, 2);

  // Import: duplicates first, then everyone, and its Undo.
  assert.deepEqual((await data.networkDuplicatesOf(USER, [{ name: 'Brand New' }, { name: 'dan reid' }, { name: 'x', email: 'DAN@example.invalid' }])).map((d) => `${d.index} ${d.by}`), ['1 name', '2 email']);
  const added = await data.importNetwork(USER, ME, [{ name: ' Brand New ', email: 'Brand.New@Example.invalid', trust: 8 }, { name: 'Daniel Reid', organisation: 'Harbour Lane Partners', phone: '07700 900141' }, { name: ' ' }]);
  assert.equal(added.added, 2);
  assert.equal((await page()).total, 6);

  // Merge with Undo.
  const dupId = added.ids[1];
  await data.saveNetworkGive(USER, { id: 'g3', person_id: dupId, coach_id: ME, direction: 'asked', kind: 'advice' });
  const merge = await data.mergeNetwork(USER, 'dan', dupId, { organisation: true });
  const merged = (await data.networkPerson(USER, 'dan')).person;
  assert.deepEqual([merged.organisation, merged.phone, merged.given_count, merged.asked_count, (await page()).total], ['Harbour Lane Partners', '07700 900141', 1, 1, 5]);
  await data.unmergeNetwork(USER, merge);
  const back = (await data.networkPerson(USER, 'dan')).person;
  assert.deepEqual([back.organisation, back.phone ?? null, back.asked_count, (await page()).total], ['Harbour Lane', null, 0, 6]);
  await assert.rejects(() => data.unmergeNetwork(USER, merge), { code: '22023' });
  assert.equal(await data.removeNetworkPeople(USER, [added.ids[0]]), 1);

  // An email's body is read one at a time: before 052 the device keeps it.
  assert.equal(await data.saveEmailBody(USER, ME, 'e1', 'Thanks for the details. Can we start in January?'), 'device');
  assert.equal(await data.emailBody(USER, 'e1'), 'Thanks for the details. Can we start in January?');
  assert.equal(await data.emailBody(USER, 'e2'), null);

  // All of it is on the device, under a key a Sign out never clears; the database was only ever asked whether 052 is there.
  assert.equal(Object.keys(kept().people).length, 5);
  assert.equal(data.networkWaiting(USER), true);
  assert.deepEqual([...new Set(db.calls)], ['select client_profiles', 'select coach_todos', 'select coach_cal_items', 'select coach_lead_stages']);
  assert.equal(Object.values(db.rows).flat().length, 0);
});

test('before 052, a device with no room left: the save is refused with NO_ROOM, and nothing is shown as kept that isn’t (break-it, 21 Nov)', async () => {
  // The device as the test before left it is put back at the end: the next test carries on from it.
  const before = new Map(local.keys().map((k) => [k, local.getItem(k)]));
  const dbBefore = { rows: db.rows, sim: db.sim };
  freshDb();
  local.removeItem(`clarity-coach-network-local:${USER}`);
  reload();
  assert.equal(await data.networkReady(), false);
  await data.saveNetworkPerson(USER, person('dan', 'Dan Reid', { influence: 6, trust: 9, value_delivery: 7, what_you_get: 8 }));
  const setItem = local.setItem;
  local.setItem = (k, v) => { if (String(k).includes('network-local')) throw Object.assign(new Error('QuotaExceededError'), { name: 'QuotaExceededError' }); return setItem(k, v); };
  try {
    await assert.rejects(() => data.saveNetworkPerson(USER, person('nell', 'Nell Okoye')), (e) => e.code === 'NO_ROOM');
    await assert.rejects(() => data.saveNetworkPerson(USER, { id: 'dan', trust: 2 }), (e) => e.code === 'NO_ROOM');
    const now = await page();
    assert.deepEqual([now.total, now.rows.map((p) => `${p.name} ${p.trust}`).join(',')], [1, 'Dan Reid 9']);
  } finally {
    local.setItem = setItem;
    for (const k of local.keys()) local.removeItem(k);
    for (const [k, v] of before) local.setItem(k, v);
    Object.assign(db, dbBefore);
    reload();
  }
});

test('when 052 arrives, what waited is moved across once, and the same questions are answered by the database', async () => {
  const before = { page: await page(), due: await page({ sort: 'due', only: { due: 'now' } }), counts: await data.networkCountsOf(USER, TODAY), dan: await data.networkPerson(USER, 'dan') };
  db.there = true;
  db.calls = [];
  reload();
  const after = await page();
  assert.equal(db.rows.network_people.length, 5);
  assert.equal(kept(), null);
  assert.equal(data.networkWaiting(USER), false);
  assert.ok(db.calls.includes('upsert network_people') && db.calls.includes('upsert network_gives') && db.calls.includes('upsert network_ratings') && db.calls.at(-1) === 'rpc network_page');
  const names = (p) => p.rows.map((r) => `${r.name} ${r.focus} ${r.due_on} ${r.given_count}/${r.asked_count}`);
  assert.deepEqual([after.total, after.all, names(after)], [before.page.total, before.page.all, names(before.page)]);
  assert.deepEqual(names(await page({ sort: 'due', only: { due: 'now' } })), names(before.due));
  assert.deepEqual(await data.networkCountsOf(USER, TODAY), before.counts);
  const dan = await data.networkPerson(USER, 'dan');
  assert.deepEqual([dan.person.trust, dan.person.role, dan.gives.length, dan.ratings.find((r) => r.rating === 'trust').value], [before.dan.person.trust, before.dan.person.role, before.dan.gives.length, 10]);
  // Loaded again, nothing is sent twice.
  db.calls = [];
  reload();
  await page();
  assert.deepEqual(db.calls.filter((c) => c.startsWith('upsert')), []);
});

test('with 052: a change goes to the database, which works out the rest; the pages are told to ask again', async () => {
  assert.equal(await data.saveNetworkPerson(USER, { id: 'sofia', trust: 9, what_you_get: 9 }), 'saved');
  assert.deepEqual([db.rows.network_people.find((p) => p.id === 'sofia').focus, db.calls.includes('update network_people')], ['keep_close', true]);
  assert.equal(await data.saveNetworkPerson(USER, person('new', 'Amara Joyce', { rhythm_months: 1, last_spoke_on: '2026-11-01' })), 'saved');
  assert.equal(dueOn(db.rows.network_people.find((p) => p.id === 'new')), '2026-12-01');
  await data.saveNetworkGive(USER, { id: 'g9', person_id: 'new', coach_id: ME, direction: 'gave', kind: 'favour', happened_on: TODAY });
  assert.equal((await data.networkPerson(USER, 'new')).person.given_count, 1);
  assert.equal(await data.archiveNetwork(USER, ['old2'], ['old']), 1);
  assert.deepEqual(await data.networkCountsOf(USER, TODAY), { active: 5, archived: 1, due: 2, ready: 0 });
  assert.equal(await data.restoreNetwork(USER, ['old2'], ['old']), 1);
  const added = await data.importNetwork(USER, ME, [{ name: 'Imported One', trust: 7 }, { name: 'Imported Two' }]);
  assert.deepEqual([added.added, added.ids.length, (await page()).total], [2, 2, 8]);
  assert.equal(await data.removeNetworkPeople(USER, added.ids), 2);
  const merge = await data.mergeNetwork(USER, 'dan', 'new');
  assert.equal((await page({ search: 'amara' })).total, 0);
  await data.unmergeNetwork(USER, merge);
  assert.equal((await page({ search: 'amara' })).total, 1);
  assert.equal((await data.removeNetworkPerson(USER, 'new')).name, 'Amara Joyce');
  assert.deepEqual((await data.networkPeopleByIds(USER, ['dan', 'sofia', 'gone'])).map((p) => p.name).sort(), ['Dan Reid', 'Sofia Marsh']);
  await assert.rejects(() => data.saveNetworkPerson(USER, { id: 'dan', trust: 11 }), { code: '23514' });
  assert.equal(kept(), null);
  // An email's body, in the database now (and what the device kept before is still read).
  db.rows.coach_emails.push({ id: 'e3', coach_id: ME, direction: 'in', source: 'gmail', to_people: [], cc_people: [] });
  assert.equal(await data.saveEmailBody(USER, ME, 'e3', 'The whole email.'), 'saved');
  assert.equal(await data.emailBody(USER, 'e3'), 'The whole email.');
  assert.equal(await data.emailBody(USER, 'e1'), 'Thanks for the details. Can we start in January?');
});

test('no connection: the last answer to the same question is shown; a device that has seen 052 and holds nobody is never shown an empty Network', async () => {
  const live = await page();
  db.down = true;
  const stale = await page();
  assert.deepEqual([stale.stale, stale.total, stale.rows.length], [true, live.total, live.rows.length]);
  await assert.rejects(() => page({ search: 'a question never asked before' }), { code: 'OFFLINE' });
  // A cold start (a reload) with no connection, on a device that has opened Network before (run 6, item 9): the
  // device's own copy is shown, marked stale, never "needs a connection the first time".
  reload();
  const cold = await page();
  assert.deepEqual([cold.stale, cold.total, cold.rows.map((r) => r.id)], [true, live.total, live.rows.map((r) => r.id)]);
  // ... the next day too (yesterday's answer beats none)
  assert.equal((await data.networkPageOf(USER, { today: '2026-11-20' })).total, live.total);
  // ... the counts too, when this device has had them answered; a question it never had answered still says so.
  assert.equal((await data.networkCountsOf(USER, TODAY)).stale, true);
  await assert.rejects(() => page({ search: 'still never asked' }), { code: 'OFFLINE' });
  // A device with no copy at all (another device, or after a Sign out) says it needs a connection.
  for (const k of local.keys()) if (k.endsWith(':coach-network')) local.removeItem(k);
  reload();
  await assert.rejects(() => page(), { code: 'OFFLINE' });
  db.down = false;
  reload();
  assert.equal((await page()).total, live.total);
});

test('the device keeps at most ANSWERS_KEPT of Network\'s answers, the newest first', async () => {
  for (let i = 0; i < data.ANSWERS_KEPT + 5; i += 1) await page({ search: `kept ${i}` });
  const key = local.keys().find((k) => k.endsWith(':coach-network'));
  const kept = JSON.parse(local.getItem(key)).v;
  assert.equal(kept.length, data.ANSWERS_KEPT);
  assert.match(kept[0][0], /kept 28/);
  assert.ok(!kept.some(([k]) => /p_today/.test(k)), 'kept without their day');
});

