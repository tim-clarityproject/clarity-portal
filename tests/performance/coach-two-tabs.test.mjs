// Run 6 (builder B6): two tabs never undo each other, and the small faults
// of runs 2 to 4 (items 3, 5, 6, 7, 8 and 10). The session's saves and
// Send are walked through the real store and sync queue with a stand-in
// database client (tests/coach/supabase-stub.mjs) that keeps updated_at as
// the database does; the rest are the rules themselves. Nothing here
// reaches a real database. (Item 9, Network offline after a reload, is in
// coach-network-data.test.mjs.)
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

// ---------------------------------------------------------------- a stand-in database: rows by id, updated_at kept by "the server"
const db = { there: true, rows: {}, calls: [], rpc: {}, tick: 0 };
const serverNow = () => new Date(Date.UTC(2026, 10, 21, 9, 0, 0, 0) + (db.tick += 1000)).toISOString();
globalThis.__db = {
  async rpc(name, args = {}) {
    db.calls.push({ rpc: name, args });
    const fn = db.rpc[name];
    if (!fn) return { data: null, error: { code: 'PGRST202', message: `Could not find the function public.${name}` }, status: 404 };
    return fn(args);
  },
  from(table) {
    const q = { filters: [], op: 'select', values: null, max: null };
    const run = () => {
      if (!db.there) return { data: null, error: { code: 'PGRST205', message: `Could not find the table 'public.${table}' in the schema cache` }, status: 404 };
      const rows = (db.rows[table] ||= []);
      const hit = () => rows.filter((r) => q.filters.every(([c, v]) => (c === 'updated_at' ? Date.parse(r[c]) === Date.parse(v) : r[c] === v)));
      if (q.op === 'select') { const h = hit(); return { data: q.max ? h.slice(0, q.max) : h, error: null }; }
      if (q.op === 'upsert') {
        const out = [];
        for (const v of Array.isArray(q.values) ? q.values : [q.values]) {
          const old = rows.find((r) => r.id === v.id);
          if (old) Object.assign(old, v, { updated_at: serverNow() }); else rows.push({ ...v, created_at: serverNow(), updated_at: serverNow() });
          out.push({ ...(old || rows[rows.length - 1]) });
        }
        return { data: out, error: null };
      }
      if (q.op === 'update') return { data: hit().map((r) => Object.assign(r, q.values, { updated_at: serverNow() })).map((r) => ({ ...r })), error: null };
      return { data: [], error: null };
    };
    const chain = {
      select: () => chain, order: () => chain,
      limit: (n) => { q.max = n; return chain; },
      eq: (c, v) => { q.filters.push([c, v]); return chain; },
      upsert: (values) => { q.op = 'upsert'; q.values = values; return chain; },
      update: (values) => { q.op = 'update'; q.values = values; return chain; },
      then: (ok, bad) => Promise.resolve().then(run).then(ok, bad),
    };
    return chain;
  },
};

const store = await import('../../src/lib/coach/store.js');
const actions = await import('../../src/lib/coach/sessionActions.js');
const day = await import('../../src/lib/coach/day.js');
const cal = await import('../../src/lib/coach/calendar.js');
const crm = await import('../../src/lib/coach/crm.js');
const crmData = await import('../../src/lib/coach/crmData.js');
const network = await import('../../src/lib/coach/network.js');
const { CHANGED_ELSEWHERE_CODE, IMPORT_FILE_MAX } = await import('../../src/lib/coach/model.js');

const USER = 'account-b6';
const COACH = 'coach-b6';
const settle = () => new Promise((r) => { setTimeout(r, 30); });
function reload({ there = true } = {}) {
  db.there = there;
  store.resetCoachStoreForTests();
  for (const k of local.keys()) if (/not-yet$/.test(k)) local.removeItem(k);
}
const session = (over = {}) => ({ id: 'ses-1', coach_id: COACH, profile_id: 'p-1', starts_at: '2026-11-20T10:00:00.000Z', minutes: 60, outcome: 'held', recap: 'Line saved in the first tab.', recap_sent_at: null, ...over });

// ---------------------------------------------------------------- item 3: two tabs on one recap

test('item 3: the recap is compared with what this tab last read or saved', () => {
  const { recapChangedSince } = actions;
  assert.equal(recapChangedSince(undefined, 'Theirs', 'Mine'), false, 'not checked without a base');
  assert.equal(recapChangedSince('Read', 'Read', 'Mine'), false, 'unchanged since read: this tab may save');
  assert.equal(recapChangedSince('Read', 'Theirs', 'Mine'), true, 'another tab saved since: refused');
  assert.equal(recapChangedSince('Read', 'Mine', 'Mine'), false, 'already what this tab would save');
  assert.equal(recapChangedSince(null, '  ', 'Mine'), false, 'blank is no recap');
  assert.equal(recapChangedSince('', null, 'Mine'), false);
});

test('item 3, before 049: a stale tab on the same device is refused, and Send sends nothing', async () => {
  reload({ there: false });
  assert.equal(await store.saveRow(USER, 'coach_sessions', session()), 'device');
  // Another tab on this device saved a newer recap (the device's copy is shared).
  await store.saveRow(USER, 'coach_sessions', session({ recap: 'Newer line from the other tab.' }));
  await assert.rejects(() => actions.saveSession(USER, session({ recap: 'Stale typing.' }), { base: 'Line saved in the first tab.' }), { code: 'changed', message: actions.CHANGED_ELSEWHERE });
  assert.equal(store.rowOf(store.coachState(USER), 'coach_sessions', 'ses-1').recap, 'Newer line from the other tab.', 'the other tab’s line stays');
  const refused = await actions.sendRecap(USER, { session: session({ recap: 'Stale typing.' }) }, { base: 'Line saved in the first tab.' });
  assert.deepEqual([refused.status, store.rowOf(store.coachState(USER), 'coach_sessions', 'ses-1').recap_sent_at], ['changed', null]);
  // The tab that read the newer line saves and sends it.
  assert.equal(await actions.saveSession(USER, session({ recap: 'Newer line, added to.' }), { base: 'Newer line from the other tab.' }), 'device');
  const sent = await actions.sendRecap(USER, { session: session({ recap: 'Newer line, added to.' }) }, { base: 'Newer line, added to.' });
  assert.equal(sent.status, 'sent');
  local.removeItem([...local.keys()].find((k) => k.startsWith('clarity-coach-local:')));
  store.resetCoachStoreForTests();
});

test('item 3, with 050: a save from a tab that read an older session is refused in the database, and the device takes the database’s copy', async () => {
  reload();
  db.rows.coach_sessions = [{ ...session(), updated_at: serverNow() }];
  db.rows.client_profiles = [];
  db.rows.coach_todos = [];
  await store.loadCoach(USER);
  const release = actions.holdSession(USER, session());
  await settle();
  // Another device saves a newer recap.
  Object.assign(db.rows.coach_sessions[0], { recap: 'Line from the other device.', updated_at: serverNow() });
  await assert.rejects(() => actions.saveSession(USER, session({ recap: 'Stale typing.' })), { code: 'changed' });
  assert.equal(db.rows.coach_sessions[0].recap, 'Line from the other device.', 'the database kept the other device’s line');
  assert.equal(store.rowOf(store.coachState(USER), 'coach_sessions', 'ses-1').recap, 'Line from the other device.', 'the device shows it again');
  const refused = await actions.sendRecap(USER, { session: session({ recap: 'Stale typing.' }) });
  assert.equal(refused.status, 'changed');
  assert.equal(db.calls.filter((c) => c.rpc === 'session_send_recap').length, 0, 'nothing was asked to send');
  release();
});

test('item 3, with 054: Send carries the recap the tab shows; the database refuses another (changed), sends it once otherwise', async () => {
  reload();
  db.rows.coach_sessions = [{ ...session(), updated_at: serverNow() }];
  await store.loadCoach(USER);
  const release = actions.holdSession(USER, session());
  await settle();
  let sentAt = null;
  db.rpc.session_send_recap = ({ p_session: id, p_recap: recap }) => {
    const row = db.rows.coach_sessions.find((r) => r.id === id);
    if (row.recap_sent_at) return { data: 'already_sent', error: null };
    if (recap === undefined) return { data: null, error: { code: '22023', message: 'one-argument send' } };
    if (row.recap !== recap) return { data: 'changed', error: null };
    row.recap_sent_at = sentAt = serverNow();
    return { data: 'sent', error: null };
  };
  // Between this tab's save and its Send, the other tab saves again: the database sends nothing.
  const real = db.rpc.session_send_recap;
  db.rpc.session_send_recap = (args) => { Object.assign(db.rows.coach_sessions[0], { recap: 'Slipped in between.', updated_at: serverNow() }); db.rpc.session_send_recap = real; return real(args); };
  const between = await actions.sendRecap(USER, { session: session({ recap: 'Mine to send.' }) }, { base: 'Line saved in the first tab.' });
  assert.deepEqual([between.status, sentAt], ['changed', null]);
  assert.equal(db.calls.at(-1).args.p_recap, 'Mine to send.', 'the recap this tab shows went with Send');
  release();
  // A tab that has read the newest sends it.
  reload();
  await store.loadCoach(USER);
  const again = actions.holdSession(USER, store.rowOf(store.coachState(USER), 'coach_sessions', 'ses-1'));
  await settle();
  const sent = await actions.sendRecap(USER, { session: session({ recap: 'Slipped in between.' }) }, { base: 'Slipped in between.' });
  assert.equal(sent.status, 'sent');
  assert.ok(sentAt);
  again();
});

test('item 3, before 054: the one-argument send is asked when the two-argument one isn’t there', async () => {
  reload();
  db.rows.coach_sessions = [{ ...session({ id: 'ses-2', recap: 'Old database.' }), updated_at: serverNow() }];
  await store.loadCoach(USER);
  db.rpc.session_send_recap = ({ p_session: id, p_recap: recap }) => {
    if (recap !== undefined) return { data: null, error: { code: 'PGRST202', message: 'Could not find the function' }, status: 404 };
    db.rows.coach_sessions.find((r) => r.id === id).recap_sent_at = serverNow();
    return { data: 'sent', error: null };
  };
  const sent = await actions.sendRecap(USER, { session: session({ id: 'ses-2', recap: 'Old database.' }) }, { base: 'Old database.' });
  assert.equal(sent.status, 'sent');
  assert.deepEqual(db.calls.filter((c) => c.rpc === 'session_send_recap').slice(-2).map((c) => 'p_recap' in c.args), [true, false]);
});

test('item 3: a guarded save that lands takes the database’s own copy (its updated_at) onto the device', async () => {
  reload();
  db.rows.coach_sessions = [{ ...session({ id: 'ses-3', recap: 'First.' }), updated_at: serverNow() }];
  await store.loadCoach(USER);
  const release = actions.holdSession(USER, session({ id: 'ses-3', recap: 'First.' }));
  await settle();
  assert.equal(await actions.saveSession(USER, session({ id: 'ses-3', recap: 'Second.' }), { base: 'First.' }), 'saved');
  const kept = store.rowOf(store.coachState(USER), 'coach_sessions', 'ses-3');
  assert.equal(kept.updated_at, db.rows.coach_sessions.find((r) => r.id === 'ses-3').updated_at);
  // This tab's own next save follows on from its own: never refused as another tab's.
  assert.equal(await actions.saveSession(USER, session({ id: 'ses-3', recap: 'Third.' }), { base: 'Second.' }), 'saved');
  release();
});

// ---------------------------------------------------------------- item 5: the brief's bar against the client's own standard

test('item 5: the brief’s bar uses the client’s own standard, 85 only when there is none', () => {
  const TODAY = '2026-11-21';
  const weeks = [
    { week_end: '2026-11-15', score: 78, standard: 75 },
    { week_end: '2026-11-08', score: 82, standard: 75 },
    { week_end: '2026-10-04', score: 90, standard: 90 },
  ];
  assert.equal(day.standardSince(weeks, '2026-11-01T10:00:00Z', TODAY), 75);
  assert.equal(day.standardSince([{ week_end: '2026-11-15', score: 80, standard: null }], null, TODAY), 85);
  assert.equal(day.standardSince([], null, TODAY), 85);
  // No week counted since the last session: the newest standard shared still holds.
  assert.equal(day.standardSince([{ week_end: '2026-10-04', score: 90, standard: 90 }], '2026-11-01T10:00:00Z', TODAY), 90);
  assert.equal(day.standardSince([{ week_end: '2026-11-15', score: 80, standard: 120 }], null, TODAY), 85, 'a standard no one may choose is no standard');
  assert.equal(day.belowStandard('80%', 75), false, '80% is at or above a standard of 75');
  assert.equal(day.belowStandard('80%', 85), true);
  assert.equal(day.belowStandard('85%'), false);
  assert.equal(day.belowStandard(null, 85), false);
});

// ---------------------------------------------------------------- item 6: a poll settled once

test('item 6: Confirm saves the poll first, so a poll another tab has settled refuses it before a held time is taken', () => {
  const poll = { id: 'poll-1', coach_id: COACH, title: 'Three-way', time_zone: 'Europe/London', status: 'open', minutes: 60 };
  const options = [{ id: 'o1', poll_id: 'poll-1', starts_at: '2026-11-25T10:00:00Z', ends_at: '2026-11-25T11:00:00Z' }, { id: 'o2', poll_id: 'poll-1', starts_at: '2026-11-26T10:00:00Z', ends_at: '2026-11-26T11:00:00Z' }];
  const holds = options.map((o, i) => ({ id: `h${i}`, kind: 'hold', poll_option_id: o.id, starts_at: o.starts_at, ends_at: o.ends_at, time_zone: 'Europe/London', title: 'Held' }));
  let n = 0;
  const done = cal.confirmPollPlan({ poll, option: options[1], people: [] }, { data: { items: holds, pollOptions: options, polls: [poll] }, newId: () => `new-${n += 1}` });
  assert.equal(done.save[0][0], 'coach_polls');
  assert.equal(done.save[0][1].status, 'confirmed');
  assert.equal(CHANGED_ELSEWHERE_CODE, 'CC409');
});

// ---------------------------------------------------------------- item 7: an automation switched off in another tab

test('item 7: a claim refused because the automation was switched off is not a claim, and nothing runs', async () => {
  assert.equal(crm.claimed({ code: CHANGED_ELSEWHERE_CODE }), false);
  assert.equal(crm.claimed({ code: '23505' }), false);
  assert.equal(crm.claimed({ code: '42501' }), true, 'any other refusal is still thrown');
  const ran = [];
  const automation = { id: 'a1', coach_id: COACH, trigger: 'lead_won', action: 'todo', todo_title: 'Send the welcome pack', todo_days: 0, active: true };
  const lead = { id: 'l1', coach_id: COACH, name: 'Invented Lead', stage_id: 's-won' };
  const done = await crm.runAutomations({ kind: 'lead_won', lead, key: 'won:l1' }, { automations: [automation], leads: [lead], stages: [{ id: 's-won', is_won: true }], coachId: COACH, newId: () => 'x', nowIso: '2026-11-21T09:00:00Z', todayKey: '2026-11-21' }, {
    claim: async () => { try { throw Object.assign(new Error('That automation is switched off.'), { code: CHANGED_ELSEWHERE_CODE }); } catch (e) { if (crm.claimed(e)) throw e; return false; } },
    addTodo: async (todo) => { ran.push(todo); },
    move: async () => { ran.push('move'); },
  });
  assert.deepEqual([done.ran, ran.length], [0, 0]);
});

// ---------------------------------------------------------------- item 8: Won and Cold undone only on purpose

test('item 8: Undo of Won or Cold asks the database first, and is refused calmly when the lead changed in another tab', async () => {
  reload();
  const lead = { id: 'lead-1', coach_id: COACH, name: 'Invented Lead', won_at: '2026-11-21T08:59:00.123Z', cold_at: null };
  // 052 and 054 there: the database answers.
  db.rpc.lead_unsettle = ({ p_lead: id, p_kind: kind, p_at: at }) => ({ data: id === 'lead-1' && kind === 'won' && at === lead.won_at ? 'undone' : 'changed', error: null });
  assert.equal(await crmData.leadUnsettle(USER, lead, 'won'), 'undone');
  await assert.rejects(() => crmData.leadUnsettle(USER, { ...lead, won_at: '2026-11-21T08:00:00.000Z' }, 'won'), (e) => e.code === CHANGED_ELSEWHERE_CODE);
  assert.equal(crm.crmProblem({ code: CHANGED_ELSEWHERE_CODE, message: '' }), 'That couldn’t be kept as it is. It may have just changed in another tab, so check it and try again.');
  assert.equal(crm.isRefusal({ code: CHANGED_ELSEWHERE_CODE }), true);
  assert.equal(await crmData.leadUnsettle(USER, { ...lead, won_at: null }, 'won'), 'undone', 'nothing to undo there: nothing asked');
  // Before 054: nothing guards it, and the page saves as it always has.
  delete db.rpc.lead_unsettle;
  assert.equal(await crmData.leadUnsettle(USER, lead, 'won'), 'older');
  // (Before 052 it resolves 'device' without asking: the store's readiness, walked in coach-network-data.test.mjs.)
});

// ---------------------------------------------------------------- item 10: imports

test('item 10: Leads and Network share one file limit, and read month names in either order', () => {
  assert.equal(IMPORT_FILE_MAX, 8 * 1024 * 1024);
  const six = 6 * 1024 * 1024;
  assert.equal(crm.importFileProblem('leads.csv', six), '', 'Leads now takes what Network takes');
  assert.equal(crm.importFileProblem('leads.xlsx', IMPORT_FILE_MAX + 1), 'That file is too big. Split it, or paste the rows instead.');
  assert.deepEqual(network.importFileKind('network.csv', six), { kind: 'text' });
  assert.equal(network.importFileKind('network.xlsx', IMPORT_FILE_MAX + 1).problem, 'That file is too big. Split it, or paste the rows instead.');
  const T = '2026-11-21';
  for (const typed of ['Oct 12 2025', 'October 12, 2025', 'Oct 12th 2025', '12 Oct 2025', '12 October 2025', '2025-10-12', 'Mon Oct 12 2025']) {
    assert.equal(network.typedDay(typed, T), '2025-10-12', typed);
  }
  assert.equal(network.typedDay('Oct 12', T), '2026-10-12');
  assert.equal(network.typedDay('Feb 30 2025', T), null, 'a day that doesn’t exist is no day');
  assert.equal(network.typedDay('Smarch 3 2025', T), null);
  // An all-number date is never read the US way: day first, and a US-only one is no day.
  assert.equal(network.typedDay('10/12/2025', T), '2025-12-10');
  assert.equal(network.typedDay('10/13/2025', T), null);
  // An imported "Last spoke" in US words is read now (it was left blank).
  const [row] = network.importRows([{ name: 'Invented Person', last_spoke_on: 'Oct 12 2025' }], { today: T });
  assert.equal(row.last_spoke_on, '2025-10-12');
});
