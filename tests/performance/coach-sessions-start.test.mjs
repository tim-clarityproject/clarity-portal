// Tidy pass follow-up 2 (23 Nov): a coach's first load reads only the sessions the first screens show, and the
// database counts the rest (migration 057's coach_sessions_start). Walked through the real store with a stand-in
// database that answers coach_sessions_start as the SQL does, checking that every count of sessions held, the recap
// nudge and Today's attention list are exactly what the whole set of sessions gives, from the first load on, after
// changes made meanwhile, once the later tier brings the rest, and that an engagement saved meanwhile carries the
// whole count. Nothing here reaches a real database (tests/coach/supabase-stub.mjs).
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

const DAY = 864e5;
const NOW = Date.now();
const at = (days) => new Date(NOW + days * DAY).toISOString();
const counts = (s) => Boolean(s) && (s.outcome === 'held' || s.outcome === 'no_show' || (s.outcome === 'late_cancel' && !s.waived));

// coach_sessions_start, as migration 057 answers it (ties kept).
function sessionsStart(rows, people, since, profiles = []) {
  const t = (v) => Date.parse(v);
  const older = rows.filter((s) => t(s.starts_at) < t(since));
  const key = (s) => `${s.profile_id}|${s.group_id}`;
  const firstOf = (list, pick) => {
    const best = new Map();
    for (const s of list) { const k = key(s); const b = best.get(k); if (b === undefined || pick(t(s.starts_at), b)) best.set(k, t(s.starts_at)); }
    return list.filter((s) => best.get(key(s)) === t(s.starts_at));
  };
  const worded = (s) => /[^\s]/.test(String(s.recap ?? '').replace(new RegExp('[\\u00A0\\u00AD\\u180E\\u200B-\\u200F\\u2028-\\u202E\\u2060-\\u2064\\uFEFF]', 'g'), ''));
  const picked = new Set([
    ...rows.filter((s) => t(s.starts_at) >= t(since)),
    ...older.filter((s) => profiles.includes(s.profile_id) || people.some((p) => p.session_id === s.id && profiles.includes(p.profile_id))),
    ...firstOf(older.filter((s) => s.outcome == null), (a, b) => a < b),
    ...firstOf(older.filter((s) => s.outcome === 'held' && !s.recap_sent_at), (a, b) => a < b),
    ...firstOf(older.filter((s) => s.outcome === 'held' && !s.recap_sent_at && worded(s)), (a, b) => a < b),
    ...firstOf(older.filter((s) => s.outcome === 'held'), (a, b) => a > b),
  ].map((s) => s.id));
  const rest = older.filter((s) => !picked.has(s.id));
  const held = {};
  for (const s of rest) if (s.engagement_id && counts(s)) held[s.engagement_id] = (held[s.engagement_id] || 0) + 1;
  for (const p of people) {
    const s = rest.find((x) => x.id === p.session_id);
    if (s && p.engagement_id && counts(s)) held[p.engagement_id] = (held[p.engagement_id] || 0) + 1;
  }
  return {
    since,
    sessions: rows.filter((s) => picked.has(s.id)).map((s) => ({ ...s })),
    people: people.filter((p) => picked.has(p.session_id)).map((p) => ({ ...p })),
    held,
    nudges: rest.filter((s) => s.outcome === 'held' && !s.recap_sent_at).length,
  };
}

const db = { rows: {}, rpc: 'there', calls: [], reads: [] };
globalThis.__db = {
  async rpc(name, args) {
    db.calls.push({ name, args });
    if (name !== 'coach_sessions_start') return { data: null, error: null };
    if (db.rpc === 'missing') return { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.coach_sessions_start in the schema cache' } };
    if (db.rpc === 'null') return { data: null, error: null };
    return { data: JSON.parse(JSON.stringify(sessionsStart(db.rows.coach_sessions || [], db.rows.coach_session_people || [], args.p_since, args.p_profiles || []))), error: null };
  },
  from(table) {
    const q = { tests: [], op: 'select', values: null, max: Infinity, from: 0, to: Infinity };
    const run = () => {
      const rows = (db.rows[table] ||= []);
      const keyCols = table === 'coach_session_people' ? ['session_id', 'profile_id'] : ['id'];
      const same = (a, b) => keyCols.every((c) => a[c] === b[c]);
      if (q.op === 'upsert') {
        const out = [];
        for (const v of Array.isArray(q.values) ? q.values : [q.values]) {
          const old = rows.find((r) => same(r, v));
          if (old) Object.assign(old, v); else rows.push({ ...v });
          out.push({ ...(old || rows[rows.length - 1]) });
        }
        // 050's triggers: sessions_held is the base plus every recorded session that counts.
        for (const e of db.rows.engagements || []) e.sessions_held = Math.max(0, e.sessions_held_base + truth(e.id));
        return { data: out, error: null };
      }
      if (q.op === 'delete') {
        const gone = rows.filter((r) => q.tests.every((f) => f(r)));
        db.rows[table] = rows.filter((r) => !gone.includes(r));
        return { data: gone, error: null };
      }
      db.reads.push(table);
      const out = rows.filter((r) => q.tests.every((f) => f(r))).map((r) => ({ ...r }));
      return { data: out.slice(q.from, Math.min(q.to + 1, q.from + q.max)), error: null };
    };
    const chain = {
      select: () => chain, order: () => chain, or: () => chain,
      eq: (c, v) => { q.tests.push((r) => r[c] === v); return chain; },
      gt: (c, v) => { q.tests.push((r) => String(r[c]) > String(v)); return chain; },
      lt: (c, v) => { q.tests.push((r) => r[c] != null && Date.parse(r[c]) < Date.parse(v)); return chain; },
      gte: (c, v) => { q.tests.push((r) => r[c] != null && Date.parse(r[c]) >= Date.parse(v)); return chain; },
      limit: (n) => { q.max = n; return chain; },
      range: (a, b) => { q.from = a; q.to = b; return chain; },
      upsert: (values) => { q.op = 'upsert'; q.values = values; return chain; },
      delete: () => { q.op = 'delete'; return chain; },
      match: (m) => { for (const [c, v] of Object.entries(m)) q.tests.push((r) => r[c] === v); return chain; },
      then: (ok, bad) => Promise.resolve(run()).then(ok, bad),
    };
    return chain;
  },
};
// The truth: every recorded session that counts, straight from the database's rows.
function truth(engagementId) {
  const s = db.rows.coach_sessions || [];
  return s.filter((x) => x.engagement_id === engagementId && counts(x)).length
    + (db.rows.coach_session_people || []).filter((p) => p.engagement_id === engagementId && counts(s.find((x) => x.id === p.session_id))).length;
}

const store = await import('../../src/lib/coach/store.js');
const day = await import('../../src/lib/coach/day.js');
const USER = 'acct-start';
const COACH = 'c1';
const pause = (ms = 120) => new Promise((r) => { setTimeout(r, ms); });

// Three clients and a group, two years of sessions every 4 weeks, recaps sent for some, a few never written up, and a
// group session whose members count against their own engagements.
function fresh({ rpc = 'there' } = {}) {
  store.resetCoachStoreForTests();
  for (const k of local.keys()) local.removeItem(k);
  db.rpc = rpc;
  db.calls = [];
  db.reads = [];
  const sessions = [];
  const people = [];
  const clients = ['p1', 'p2', 'p3'];
  clients.forEach((p, i) => {
    for (let n = -20; n <= 3; n += 1) {
      const d = n * 28 + i;
      const past = d < 0;
      const outcome = !past ? null : (n === -15 && i === 1) ? null : (n % 7 === 0 ? 'no_show' : (n % 5 === 0 ? 'late_cancel' : 'held'));
      sessions.push({ id: `s-${p}-${n + 20}`, coach_id: COACH, profile_id: p, group_id: null, engagement_id: `e-${p}`, kind: 'coaching', starts_at: at(d), minutes: 60,
        outcome, waived: outcome === 'late_cancel' && n % 10 === 0, recap: outcome === 'held' ? 'We agreed two small steps.' : null,
        recap_sent_at: outcome === 'held' && n < -10 && i !== 2 ? at(d + 1) : null, moved_to: null });
    }
  });
  for (const n of [-12, -6, -1]) {
    const id = `g-${n}`;
    sessions.push({ id, coach_id: COACH, profile_id: null, group_id: 'g1', engagement_id: 'e-g1', kind: 'group', starts_at: at(n * 28 + 3), minutes: 90, outcome: 'held', waived: false, recap: 'The team.', recap_sent_at: null, moved_to: null });
    people.push({ session_id: id, profile_id: 'p1', engagement_id: 'e-p1' }, { session_id: id, profile_id: 'p3', engagement_id: null });
  }
  db.rows = {
    client_profiles: clients.map((id) => ({ id, coach_id: COACH, name: `Client ${id}`, status: 'active' })),
    coach_groups: [{ id: 'g1', coach_id: COACH, name: 'Leadership team' }],
    engagements: [...clients.map((p) => ({ id: `e-${p}`, coach_id: COACH, profile_id: p, kind: 'sessions', sessions_total: 40, sessions_held_base: 2, status: 'active', created_at: at(-800) })),
      { id: 'e-g1', coach_id: COACH, group_id: 'g1', kind: 'sessions', sessions_total: 10, sessions_held_base: 0, status: 'active', created_at: at(-800) }],
    coach_sessions: sessions,
    coach_session_people: people,
  };
  for (const e of db.rows.engagements) e.sessions_held = e.sessions_held_base + truth(e.id);
}

const state = () => store.coachState(USER);
const rows = (table) => store.rowsOf(state(), table);
const older = () => store.sessionsOlder(state());
// What a page shows, worked out from the device as the pages do it.
function shown() {
  const st = state();
  const engagements = store.rowsOf(st, 'engagements');
  const sessions = store.rowsOf(st, 'coach_sessions');
  const people = store.rowsOf(st, 'coach_session_people');
  const o = store.sessionsOlder(st);
  return {
    held: Object.fromEntries(engagements.map((e) => [e.id, day.withSessions(e, sessions, people, o).sessions_held])),
    saved: Object.fromEntries(engagements.map((e) => [e.id, day.engagementToSave(e, sessions, people, o).sessions_held])),
    nudge: day.recapNudgeLine({ sessions, clients: store.rowsOf(st, 'client_profiles'), groups: store.rowsOf(st, 'coach_groups'), older: o, now: NOW, todayKey: at(0).slice(0, 10) })?.line ?? null,
    attention: day.attentionRows({ clients: store.rowsOf(st, 'client_profiles'), engagements, sessions, people, older: o, now: NOW, todayKey: at(0).slice(0, 10) }).map((r) => `${r.key} ${r.line}`),
  };
}
// The same, worked out from every session in the database (what the pages showed before 057).
function shownWhole() {
  const sessions = db.rows.coach_sessions;
  const people = db.rows.coach_session_people;
  const engagements = db.rows.engagements.map((e) => ({ ...e }));
  return {
    held: Object.fromEntries(engagements.map((e) => [e.id, day.withSessions(e, sessions, people).sessions_held])),
    saved: Object.fromEntries(engagements.map((e) => [e.id, day.engagementToSave(e, sessions, people).sessions_held])),
    nudge: day.recapNudgeLine({ sessions, clients: db.rows.client_profiles, groups: db.rows.coach_groups, now: NOW, todayKey: at(0).slice(0, 10) })?.line ?? null,
    attention: day.attentionRows({ clients: db.rows.client_profiles, engagements, sessions, people, now: NOW, todayKey: at(0).slice(0, 10) }).map((r) => `${r.key} ${r.line}`),
  };
}
const truthAll = () => Object.fromEntries(db.rows.engagements.map((e) => [e.id, e.sessions_held_base + truth(e.id)]));

test('a first load reads only the window and the few older sessions, and every count is the whole one', async () => {
  fresh();
  assert.equal(await store.loadCoach(USER), true);
  const here = rows('coach_sessions').length;
  assert.ok(here < db.rows.coach_sessions.length / 2, `only some sessions on the device (${here} of ${db.rows.coach_sessions.length})`);
  assert.ok(!db.reads.includes('coach_sessions') && !db.reads.includes('coach_session_people'), 'the first tier never reads the two tables whole');
  assert.ok(older(), 'the database\'s counts are kept while the older sessions aren\'t here');
  assert.deepEqual(shown(), shownWhole(), 'counts, the recap nudge and the attention list are exactly the whole ones');
  assert.deepEqual(shown().held, truthAll(), 'and they match the sessions');
});

test('the later tier brings every session, and the counts are worked out from them alone again', async () => {
  fresh();
  await store.loadCoach(USER);
  await pause();
  assert.equal(rows('coach_sessions').length, db.rows.coach_sessions.length);
  assert.equal(rows('coach_session_people').length, db.rows.coach_session_people.length);
  assert.equal(older(), null);
  assert.deepEqual(shown(), shownWhole());
});

test('changes made before the older sessions arrive keep every count right', async () => {
  fresh();
  // The later tier is kept back: the store waits for an idle moment, which this test never gives it.
  const realRIC = globalThis.window.requestIdleCallback;
  globalThis.window.requestIdleCallback = () => {};
  try {
    await store.loadCoach(USER);
    assert.ok(older());
    const one = (id) => store.rowOf(state(), 'coach_sessions', id);
    // An older one the first screens show (p2's session never written up) is written up as held.
    const old = rows('coach_sessions').find((s) => s.profile_id === 'p2' && s.outcome == null && Date.parse(s.starts_at) < NOW - 60 * DAY);
    assert.ok(old, 'the oldest session to write up came in the first load');
    await store.saveRow(USER, 'coach_sessions', { ...old, outcome: 'held' });
    // A recent one is waived, one is moved to another engagement, and a new one is added.
    const recentLate = rows('coach_sessions').find((s) => s.outcome === 'held' && Date.parse(s.starts_at) > NOW - 40 * DAY && s.profile_id === 'p1');
    await store.saveRow(USER, 'coach_sessions', { ...recentLate, outcome: 'late_cancel', waived: true });
    const recent = rows('coach_sessions').find((s) => s.outcome === 'held' && Date.parse(s.starts_at) > NOW - 40 * DAY && s.profile_id === 'p3');
    await store.saveRow(USER, 'coach_sessions', { ...recent, engagement_id: 'e-p2' });
    await store.saveRow(USER, 'coach_sessions', { id: 's-new', coach_id: COACH, profile_id: 'p1', group_id: null, engagement_id: 'e-p1', kind: 'coaching', starts_at: at(-2), minutes: 60, outcome: 'no_show', waived: false, recap: null, recap_sent_at: null, moved_to: null });
    // A group member taken off the newest group session.
    await store.removeRow(USER, 'coach_session_people', 'g--1|p1');
    // A session deleted.
    await store.removeRow(USER, 'coach_sessions', one('s-p1-21') ? 's-p1-21' : 's-p1-22');
    assert.deepEqual(shown().held, truthAll(), 'every count matches the sessions as they now are');
    assert.deepEqual(shown(), shownWhole(), 'and what the pages show is the whole picture');
    assert.ok(older(), 'still before the older sessions came');
  } finally {
    globalThis.window.requestIdleCallback = realRIC;
  }
});

test('an engagement saved before the older sessions arrive carries the whole count, so its base never moves', async () => {
  fresh();
  const realRIC = globalThis.window.requestIdleCallback;
  globalThis.window.requestIdleCallback = () => {};
  try {
    await store.loadCoach(USER);
    const st = state();
    const e = store.rowOf(st, 'engagements', 'e-p1');
    const kept = day.engagementToSave({ ...e, name: 'Renamed' }, store.rowsOf(st, 'coach_sessions'), store.rowsOf(st, 'coach_session_people'), store.sessionsOlder(st));
    assert.equal(kept.sessions_held, e.sessions_held_base + truth('e-p1'), 'the count it carries is the database\'s');
    // Without the database's counts it would have carried far fewer (what 050 would read as a typed count).
    const partial = day.engagementToSave({ ...e }, store.rowsOf(st, 'coach_sessions'), store.rowsOf(st, 'coach_session_people'));
    assert.ok(partial.sessions_held < kept.sessions_held);
  } finally {
    globalThis.window.requestIdleCallback = realRIC;
  }
});

test('a client\'s page brings all that client\'s sessions at once, and the counts stay whole', async () => {
  fresh();
  const realRIC = globalThis.window.requestIdleCallback;
  globalThis.window.requestIdleCallback = () => {};
  try {
    await store.loadCoach(USER);
    const before = rows('coach_sessions').filter((s) => s.profile_id === 'p2').length;
    assert.equal(await store.ensureClientSessions(USER, 'p2'), true);
    assert.equal(rows('coach_sessions').filter((s) => s.profile_id === 'p2').length, db.rows.coach_sessions.filter((s) => s.profile_id === 'p2').length);
    assert.ok(before < db.rows.coach_sessions.filter((s) => s.profile_id === 'p2').length);
    assert.deepEqual(shown(), shownWhole());
    // The next load names the client too.
    await store.loadCoach(USER, { again: true });
    assert.deepEqual(db.calls.at(-1).args.p_profiles, ['p2']);
    assert.equal(rows('coach_sessions').filter((s) => s.profile_id === 'p2').length, db.rows.coach_sessions.filter((s) => s.profile_id === 'p2').length);
    assert.deepEqual(shown(), shownWhole());
  } finally {
    globalThis.window.requestIdleCallback = realRIC;
  }
});

test('once every session is here, a later first load keeps the older ones and stores no counts', async () => {
  fresh();
  await store.loadCoach(USER);
  await pause();
  assert.equal(older(), null);
  // A new visit (the device's copy kept): the window is read again, the older sessions stay.
  db.reads = [];
  await store.loadCoach(USER, { again: true });
  assert.equal(rows('coach_sessions').length, db.rows.coach_sessions.length);
  assert.equal(older(), null);
  // Another device deletes a session in the window: it goes here too.
  const gone = db.rows.coach_sessions.find((s) => Date.parse(s.starts_at) > NOW);
  db.rows.coach_sessions = db.rows.coach_sessions.filter((s) => s !== gone);
  db.rows.coach_session_people = db.rows.coach_session_people.filter((p) => p.session_id !== gone.id);
  await store.loadCoach(USER, { again: true });
  assert.equal(store.rowOf(state(), 'coach_sessions', gone.id), null);
  assert.deepEqual(shown(), shownWhole());
});

test('before Tim runs 057: sessions are read whole as before, and the function isn\'t asked again for an hour', async () => {
  fresh({ rpc: 'missing' });
  await store.loadCoach(USER);
  assert.equal(rows('coach_sessions').length, db.rows.coach_sessions.length);
  assert.equal(older(), null);
  assert.deepEqual(shown(), shownWhole());
  const asked = db.calls.filter((c) => c.name === 'coach_sessions_start').length;
  await store.loadCoach(USER, { again: true });
  assert.equal(db.calls.filter((c) => c.name === 'coach_sessions_start').length, asked);
  assert.ok(local.getItem('clarity-coach-start-not-yet'));
});

test('a database that answers it with nothing (a stand-in): sessions are read whole', async () => {
  fresh({ rpc: 'null' });
  await store.loadCoach(USER);
  assert.equal(rows('coach_sessions').length, db.rows.coach_sessions.length);
  assert.equal(older(), null);
  assert.deepEqual(shown(), shownWhole());
});

test('a device copy from before (whole, with no counts row) is never counted twice', async () => {
  fresh({ rpc: 'missing' });
  await store.loadCoach(USER);
  await pause();
  // The copy is whole, but this device had the old version: no row says so.
  const st = state();
  const bare = { rows: { ...st.rows }, marks: { ...st.marks } };
  delete bare.rows.coach_sessions_older;
  delete bare.marks.coach_sessions_older;
  const merged = store.mergeStart(bare, db.rpc === 'missing'
    ? (db.rpc = 'there', await globalThis.__db.rpc('coach_sessions_start', { p_since: new Date(NOW - 42 * DAY).toISOString(), p_profiles: [] })).data
    : null, NOW - 42 * DAY);
  const o = store.sessionsOlder(merged);
  assert.ok(o, 'treated as not yet whole');
  const sessions = store.rowsOf(merged, 'coach_sessions');
  const people = store.rowsOf(merged, 'coach_session_people');
  for (const e of db.rows.engagements) assert.equal(day.withSessions(e, sessions, people, o).sessions_held, e.sessions_held_base + truth(e.id));
});
