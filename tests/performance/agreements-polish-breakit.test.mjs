// Polish 1, Stage C: the break-it tester's agreement findings, fixed by FX6. The fee question refuses what one agreement
// can't hold (061: total_minor at most 100,000,000) and figures that aren't figures (F2, P1); a stale tab's or device's
// draft never goes over a newer one (F3: the builder's draft print and decision, and the coach store with the sync
// queue's guarded rows on a stand-in database that moves updated_at as 065's p1_touch does); one pause per agreement,
// from today, and an early end before the current end, on the device and in the route handler (F6); End early and Pause
// offered only where they'd be taken; an overdrawn block of hours says so (P5); an untouched next version is known (Q5);
// the practice seed's instalments follow the app's split; this year's dates drop their year, other years' keep it.
// Nothing here reaches a real database.
import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolve as resolvePath } from 'node:path';
import { readFileSync } from 'node:fs';

const stub = pathToFileURL(resolvePath('tests/coach/supabase-stub.mjs')).href;
register(`data:text/javascript,${encodeURIComponent(`export async function resolve(s, c, n) { if (/(^|\\/)supabase(\\.js)?$/.test(s) && String(c.parentURL || '').includes('/src/lib/')) return { url: ${JSON.stringify(stub)}, shortCircuit: true }; return n(s, c); }`)}`);

const { MAX_MINOR, parseMoney } = await import('../../src/lib/agreements/currency.js');
const q = await import('../../src/lib/agreements/questions.js');
const { blankTerms } = await import('../../src/lib/agreements/terms.js');
const { draftCopy, draftPrint, draftTracker, isUntouchedNext, nextVersionDraft, stableText } = await import('../../src/lib/coach/agreementBuilder.js');
const { endEarlyProblem, pauseProblem } = await import('../../src/lib/agreements/endDate.js');
const { endEarlyOptions, logDays, pauseFromOptions, sentRows } = await import('../../src/lib/agreements/duringAgreement.js');
const { balanceNote } = await import('../../src/lib/agreements/hours.js');
const { whenWords } = await import('../../src/lib/agreements/needsYou.js');
const { splitEqual, agreementTotal } = await import('../../src/lib/agreements/settling.js');

const monthly = (months, extra = {}) => q.asQuestionnaire({ ...blankTerms('sessions'), priceMode: 'monthly', months, startsOn: '2027-01-04', settle: 'equal', ...extra });

// ---------------------------------------------------------------- F2, P1: the fee box

test('P1: a typed fee is read as a figure, or refused in calm words, never turned into another figure', () => {
  assert.deepEqual(parseMoney(''), { empty: true });
  assert.deepEqual(parseMoney('2500'), { minor: 250000 });
  assert.deepEqual(parseMoney('£2,500.50'), { minor: 250050 });
  assert.deepEqual(parseMoney(' GBP 2 500 '), { minor: 250000 });
  assert.deepEqual(parseMoney('٢٥٠٠'), { minor: 250000 }, 'Arabic-Indic digits read as the same figures');
  assert.deepEqual(parseMoney('۲۵۰۰٫۵'), { minor: 250050 }, 'Extended Arabic-Indic, with the Arabic point');
  for (const bad of ['1e5', '-500', '−500', '2,50', '12.345', '😀', 'abc', '1.2.3', '0x10']) {
    const r = parseMoney(bad);
    assert.ok(r.problem && !('minor' in r), `${bad} is refused`);
    assert.match(r.problem, /\.$/, 'a sentence');
    assert.doesNotMatch(r.problem, /connection/i);
  }
  assert.match(parseMoney('-500').problem, /less than nothing/);
  assert.match(parseMoney('1e5').problem, /isn’t an amount\. Type it in pounds, like 2,500 or 2,500\.50\./);
  assert.deepEqual(parseMoney('250000', 'JPY', 'Japanese yen'), { minor: 250000 });
  assert.match(parseMoney('3000.5', 'JPY', 'Japanese yen').problem, /Japanese yen have no smaller units/);
});

test('F2: the fee question refuses nothing, and more than one agreement can hold, with the most for the term chosen', () => {
  const t3 = monthly(3);
  assert.equal(q.stepProblem('fee', q.answer(t3, 'fee', 0)), 'Type your fee each month, in pounds, to carry on.');
  assert.equal(q.stepProblem('fee', q.answer(t3, 'fee', 250000)), null);
  for (const [months, most] of [[3, '£333,333'], [6, '£166,666'], [12, '£83,333']]) {
    const t = monthly(months);
    const max = q.maxFee(t);
    assert.ok(q.totalFits(q.answer(t, 'fee', max)), `${months} months: the most fits`);
    assert.ok(!q.totalFits(q.answer(t, 'fee', max + 100)), `${months} months: a pound more doesn't`);
    assert.ok(agreementTotal(q.answer(t, 'fee', max), 'plan') <= MAX_MINOR);
    assert.equal(q.stepProblem('fee', q.answer(t, 'fee', 100000000)), `That’s more than one agreement can hold. Over ${months} months the most is ${most} a month, so type that or less.`);
  }
  // The tester's £400,000 a month for 3 months (F2) and £1,000,000.
  assert.ok(q.stepProblem('fee', q.answer(t3, 'fee', 40000000)));
  // A longer term over the limit is refused at the term, with the fee that would fit.
  const big = q.answer(monthly(3), 'fee', 20000000);
  assert.equal(q.stepProblem('term', q.answer(big, 'term', 12)), 'That’s more than one agreement can hold over 12 months. Choose a shorter term, or make the fee £83,333 a month or less.');
  // A total for a one-off: £1,000,000 at most.
  const one = q.asQuestionnaire({ ...blankTerms('oneoff'), work: 'A review' });
  assert.equal(q.stepProblem('fee', q.answer(one, 'fee', MAX_MINOR)), null);
  assert.match(q.stepProblem('fee', q.answer(one, 'fee', MAX_MINOR + 100)), /The most is £1,000,000, so type that or less\./);
  // The client's own figure in yen: ¥100,000,000 is the most a version holds in yen.
  const yen = q.answer(q.answer(monthly(12), 'fee', 400000), 'cur', 'JPY', { rate: 190 });
  const own = q.answer(yen, 'local', { mode: 'own', minor: 8000000 }, { rate: 190 });
  assert.equal(q.stepProblem('local', own, { rate: 190, first: 'Sam' }), null);
  assert.match(q.stepProblem('local', q.answer(yen, 'local', { mode: 'own', minor: 50000000 }, { rate: 190 }), { rate: 190 }), /more than one agreement can hold.*¥8,333,333 a month/);
  assert.equal(q.stepProblem('local', q.answer(yen, 'local', { mode: 'own', minor: 0 }, { rate: 190 }), { rate: 190, first: 'Sam' }), 'Type the figure Sam sees to carry on.');
  // Sign and send's own check.
  assert.match(q.stepProblem('check', q.answer(monthly(12), 'fee', 20000000)), /more than one agreement can hold/);
});

// ---------------------------------------------------------------- F3: two tabs, two devices

test('F3: the draft print reads the database’s copy (its own order of keys) as the same draft, and any change as another', () => {
  const v = { terms: { kind: 'sessions', months: 6, blocks: [{ n: 1, minutes: 60 }], gbpMinor: 250000 }, personal_note: 'Hi', send_as: 'agreement', overrides: {} };
  const fromDb = { send_as: 'agreement', overrides: {}, personal_note: 'Hi', terms: { gbpMinor: 250000, blocks: [{ minutes: 60, n: 1 }], months: 6, kind: 'sessions' }, updated_at: 'x' };
  assert.equal(draftPrint(v), draftPrint(fromDb));
  assert.notEqual(draftPrint(v), draftPrint({ ...fromDb, terms: { ...fromDb.terms, gbpMinor: 330000 } }));
  assert.equal(stableText({ b: 1, a: [2, { d: 1, c: undefined }] }), '{"a":[2,{"d":1}],"b":1}');
  const mine = new Set([draftPrint(v)]);
  assert.equal(draftCopy({ print: draftPrint(fromDb), mine, sent: true }), 'mine', 'the echo of its own save');
  const other = draftPrint({ ...fromDb, terms: { ...fromDb.terms, noticeHours: 48 } });
  assert.equal(draftCopy({ print: other, mine, sent: false }), 'wait', 'another tab’s copy not yet in the database');
  assert.equal(draftCopy({ print: other, mine, sent: true }), 'newer', 'the database has another tab’s or device’s copy: take it');
  assert.equal(draftCopy({ print: other, mine, pending: other, sent: true }), 'mine', 'what waits to go here');
  assert.equal(draftCopy({ print: other, mine: new Set(), sent: true }), 'mine', 'the first copy seen is the page’s own');
});

// The coach store with the sync queue, as the builder's draft hook uses them (guardRows, noteVersions, saveRow).
function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); }, key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; }, keys: () => [...m.keys()] };
}

test('F3: a stale tab’s save of the draft is refused and the device takes the newer copy; this tab’s own saves follow on', async () => {
  const local = fakeStorage();
  globalThis.window = { localStorage: local, sessionStorage: fakeStorage(), addEventListener() {}, removeEventListener() {}, setInterval, clearInterval, setTimeout, clearTimeout };
  const db = { rows: { agreement_versions: [] }, tick: 0 };
  const serverNow = () => new Date(Date.UTC(2026, 10, 26, 9, 0, 0, 0) + (db.tick += 1000)).toISOString();
  globalThis.__db = {
    async rpc() { return { data: null, error: { code: 'PGRST202', message: 'Could not find the function' }, status: 404 }; },
    from(table) {
      const qq = { filters: [], op: 'select', values: null, max: null, opts: {} };
      const run = () => {
        const rows = (db.rows[table] ||= []);
        const hit = () => rows.filter((r) => qq.filters.every(([c, v]) => (c === 'updated_at' ? Date.parse(r[c]) === Date.parse(v) : r[c] === v)));
        if (qq.op === 'select') { const h = hit().map((r) => ({ ...r })); return { data: qq.max ? h.slice(0, qq.max) : h, error: null }; }
        if (qq.op === 'upsert') {
          const out = [];
          for (const v of [qq.values].flat()) {
            const old = rows.find((r) => r.id === v.id);
            if (old && qq.opts.ignoreDuplicates) continue;
            if (old) { Object.assign(old, v, { updated_at: serverNow() }); out.push({ ...old }); } else { const r = { ...v, updated_at: serverNow() }; rows.push(r); out.push({ ...r }); }
          }
          return { data: out, error: null };
        }
        if (qq.op === 'update') return { data: hit().map((r) => Object.assign(r, qq.values, { updated_at: serverNow() })).map((r) => ({ ...r })), error: null };
        return { data: [], error: null };
      };
      const chain = {
        select: () => chain, order: () => chain, range: () => chain, or: () => chain, lt: () => chain, gte: () => chain, in: () => chain, is: () => chain, neq: () => chain,
        limit: (n) => { qq.max = n; return chain; },
        eq: (c, v) => { qq.filters.push([c, v]); return chain; },
        upsert: (values, opts = {}) => { qq.op = 'upsert'; qq.values = values; qq.opts = opts; return chain; },
        update: (values) => { qq.op = 'update'; qq.values = values; return chain; },
        then: (ok, bad) => Promise.resolve().then(run).then(ok, bad),
      };
      return chain;
    },
  };
  const store = await import('../../src/lib/coach/store.js');
  const queue = await import('../../src/lib/syncQueue.js');
  const USER = 'account-ab';
  await store.coach065Ready();
  const row = { id: 'v-2', agreement_id: 'a-1', coach_id: 'c-1', version: 2, status: 'draft', terms: { kind: 'sessions', gbpMinor: 250000, noticeHours: 24 }, personal_note: '', updated_at: serverNow() };
  db.rows.agreement_versions = [{ ...row }];
  store.noteRows(USER, [['agreement_versions', { ...row }]]); // the device holds the database's copy, as a load leaves it
  assert.equal(store.rowSent(USER, 'agreement_versions', { id: 'v-2' }), true);

  // The builder opens it: guarded, based on the version it saw.
  queue.guardRows('agreement_versions', [{ id: 'v-2' }]);
  queue.noteVersions('agreement_versions', [{ id: 'v-2', updated_at: row.updated_at }]);
  // This tab's own saves, one after another, each based on the one before (two answers in a row).
  assert.equal(await store.saveRow(USER, 'agreement_versions', { ...row, terms: { ...row.terms, gbpMinor: 270000 } }), 'saved');
  assert.equal(await store.saveRow(USER, 'agreement_versions', { ...store.rowNow(USER, 'agreement_versions', { id: 'v-2' }), terms: { ...row.terms, gbpMinor: 270000, noticeHours: 48 } }), 'saved');
  assert.equal(db.rows.agreement_versions[0].terms.noticeHours, 48);

  // Another device saves a newer fee; this tab, still on its older copy, saves another question.
  Object.assign(db.rows.agreement_versions[0], { terms: { ...db.rows.agreement_versions[0].terms, gbpMinor: 330000 }, updated_at: serverNow() });
  const stale = { ...store.rowNow(USER, 'agreement_versions', { id: 'v-2' }), terms: { kind: 'sessions', gbpMinor: 270000, noticeHours: 72 } };
  assert.equal(await store.saveRow(USER, 'agreement_versions', stale), 'superseded', 'refused, never written over the newer fee');
  assert.equal(db.rows.agreement_versions[0].terms.gbpMinor, 330000, 'the database keeps the newer fee');
  assert.equal(db.rows.agreement_versions[0].terms.noticeHours, 48);
  const now = store.rowNow(USER, 'agreement_versions', { id: 'v-2' });
  assert.equal(now.terms.gbpMinor, 330000, 'the device shows the database’s copy');
  assert.equal(store.rowSent(USER, 'agreement_versions', { id: 'v-2' }), true);
  // The page sees a copy it didn't make, in the database: it takes it.
  assert.equal(draftCopy({ print: draftPrint(now), mine: new Set([draftPrint(stale)]), sent: true }), 'newer');
  // Once it has (the version noted), its next save goes.
  queue.noteVersions('agreement_versions', [{ id: 'v-2', updated_at: now.updated_at }]);
  assert.equal(await store.saveRow(USER, 'agreement_versions', { ...now, terms: { ...now.terms, noticeHours: 72 } }), 'saved');
  assert.deepEqual([db.rows.agreement_versions[0].terms.gbpMinor, db.rows.agreement_versions[0].terms.noticeHours], [330000, 72]);
  queue.unguardRows('agreement_versions', [{ id: 'v-2' }]);
});

// The final checker's fault at 56a962f2: one tab opening a new version and answering showed "changed in another window",
// because the database's answer to the save that made the draft arrived after the questions' first (reshaped) save.
test('F3: one tab opening a draft and answering never takes its own copies as another window’s; two tabs still do', () => {
  const a = { id: 'a-1', status: 'signed', coach_id: 'c-1' };
  const v1 = { id: 'v-1', agreement_id: 'a-1', version: 1, status: 'signed', terms: { kind: 'sessions', answered: true, months: 6, gbpMinor: 250000 } };
  const raw = { ...nextVersionDraft({ agreement: a, versions: [v1], versionId: 'v-2', coachId: 'c-1' }), updated_at: 'local-1' };
  const reshaped = { ...raw, terms: q.asQuestionnaire(raw.terms), personal_note: '' };
  const answered = { ...reshaped, terms: { ...reshaped.terms, answered: true, noticeHours: 48 } };
  // The database keeps jsonb in its own order of keys and stamps its own updated_at.
  const fromDb = (v, at) => ({ ...JSON.parse(JSON.stringify(v)), terms: Object.fromEntries(Object.entries(v.terms).reverse()), updated_at: at });
  const seen = [];
  const t = draftTracker();
  // The draft is made on this device (unsent) and drawn: the page registers it before its children's first save.
  t.first(raw);
  seen.push(t.see(raw, { sent: false }));
  // The questions' first draw keeps the terms in their new shape (waiting to go).
  t.sending(reshaped);
  seen.push(t.see(raw, { sent: false, pending: reshaped }));
  // The database answers the save that made the draft, while the reshaped one still waits.
  seen.push(t.see(fromDb(raw, 'db-1'), { sent: true, pending: reshaped }));
  // The reshaped save lands, then an answer, each answered by the database (its guard may tidy the terms).
  seen.push(t.see(reshaped, { sent: false }));
  const tidied = fromDb({ ...reshaped, terms: { ...reshaped.terms, fxRate: null } }, 'db-2');
  t.saved(tidied);
  seen.push(t.see(tidied, { sent: true }));
  t.sending(answered);
  seen.push(t.see(answered, { sent: false }));
  t.saved(fromDb(answered, 'db-3'));
  seen.push(t.see(fromDb(answered, 'db-3'), { sent: true }));
  // Reopened: a new page, the device holding the database's copy.
  const again = draftTracker();
  again.first(fromDb(answered, 'db-3'));
  seen.push(again.see(fromDb(answered, 'db-3'), { sent: true }));
  assert.ok(seen.every((x) => x === 'mine'), `one tab only ever sees its own copies: ${seen.join(', ')}`);
  // Another tab saves the fee: first unsent on this device, then the database's copy.
  const other = { ...answered, terms: { ...answered.terms, gbpMinor: 330000 } };
  assert.equal(t.see(other, { sent: false }), 'wait');
  assert.equal(t.see(fromDb(other, 'db-4'), { sent: true }), 'newer');
  assert.equal(t.see(fromDb(other, 'db-4'), { sent: true }), 'mine', 'taken once, then it is this page’s');
});

// ---------------------------------------------------------------- Q5: an untouched next version

test('Q5: a next version starts unanswered, and is known as untouched until an answer is given', () => {
  const a = { id: 'a-1', status: 'sent', coach_id: 'c-1' };
  const v1 = { id: 'v-1', agreement_id: 'a-1', version: 1, status: 'sent', terms: { kind: 'sessions', answered: true, gbpMinor: 250000 } };
  const v2 = nextVersionDraft({ agreement: a, versions: [v1], versionId: 'v-2', coachId: 'c-1' });
  assert.equal(v2.terms.answered, false);
  assert.equal(v2.terms.gbpMinor, 250000, 'the terms carried over');
  assert.equal(isUntouchedNext(a, [v1, v2]), true);
  assert.equal(isUntouchedNext(a, [v1, { ...v2, terms: { ...v2.terms, answered: true } }]), false, 'answered');
  assert.equal(isUntouchedNext(a, [v1, { ...v2, coach_signed_at: '2026-11-26T10:00:00Z' }]), false, 'signed by the coach');
  assert.equal(isUntouchedNext(a, [v1]), false, 'no next version');
  assert.equal(isUntouchedNext(a, [{ ...v1, status: 'draft', terms: { answered: false } }]), false, 'a first version is P4’s, not this');
});

// ---------------------------------------------------------------- F6: pauses and early ends

test('F6: one pause per agreement, from today, starting before the end; an early end today or later and before the end', () => {
  const today = '2026-11-26';
  assert.equal(pauseProblem({ from: '2026-11-30', to: '2026-12-25', today, end: '2027-07-02' }), null);
  assert.match(pauseProblem({ from: '2020-01-06', to: '2020-02-07', today, end: '2027-07-02' }), /starts today or later/);
  assert.match(pauseProblem({ from: '2026-12-14', to: '2027-01-08', today, end: '2027-07-30', paused: { from: '2026-11-30', to: '2026-12-25' } }),
    /was paused from Mon 30 Nov to Fri 25 Dec, and it can be paused once\. To give more time, extend the end date instead\./);
  assert.match(pauseProblem({ from: '2026-12-14', to: '2027-01-08', today, end: '2027-07-30', paused: { from: '2026-09-21', to: null } }),
    /was paused from Mon 21 Sep, and it can be paused once/, 'a pause with no end set yet counts too');
  assert.match(pauseProblem({ from: '2027-08-02', to: '2027-08-27', today, end: '2027-07-02' }), /before the agreement ends on Fri 2 Jul 2027/);
  assert.equal(pauseProblem({ from: '2027-01-08', to: '2027-01-04', today }), 'Choose an Until date after From.');
  assert.equal(endEarlyProblem({ on: '2027-01-29', today, end: '2027-07-02' }), null);
  assert.match(endEarlyProblem({ on: '2030-01-01', today, end: '2027-07-02' }), /It already ends on Fri 2 Jul 2027\. Choose a last day before then\./);
  assert.match(endEarlyProblem({ on: '2027-07-02', today, end: '2027-07-02' }), /before then/, 'the end itself isn’t early');
  assert.match(endEarlyProblem({ on: '2027-03-05', today, end: '2027-07-02', earlyEnd: '2027-02-26' }), /already ends on Fri 26 Feb 2027/);
  assert.equal(endEarlyProblem({ on: '2026-11-20', today, end: '2027-07-02' }), 'Choose today or a later day.');
  // What the page offers is what the server takes.
  assert.ok(endEarlyOptions(today, '2027-07-02').every((o) => !endEarlyProblem({ on: o.value, today, end: '2027-07-02' })));
  assert.deepEqual(endEarlyOptions(today, '2026-12-15').map((o) => o.value), ['2026-12-04', '2026-12-11'], 'under 30 days left: the Fridays before the end');
  assert.deepEqual(endEarlyOptions(today, '2026-11-30'), [], 'nothing before the end: End early isn’t offered');
  assert.deepEqual(pauseFromOptions(today, '2026-12-10').map((o) => o.value), ['2026-11-30', '2026-12-07'], 'never a pause starting after the end');
});

test('F6: the route handler refuses a second pause, a pause in the past and an end early after the end, and writes nothing', async () => {
  const { agreementsApi } = await import('../../api/_routes/coach-agreements.js');
  const { fakeDb065 } = await import('./_fakeDb065.mjs');
  const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const COACH = { id: U(1), role: 'owner', active: true, user_id: U(2) };
  const terms = { ...blankTerms('sessions'), coachName: 'Dr. Tim Dutton', startsOn: '2026-11-02', endsOn: '2027-07-02', totalMinor: 1800000, settle: 'equal' };
  const db = fakeDb065({
    coaches: [{ id: COACH.id, user_id: COACH.user_id, role: 'owner', display_first_name: 'Tim', email: 'tim@example.invalid', active: true }],
    client_profiles: [{ id: U(10), coach_id: COACH.id, name: 'Sam Reid', email: 'sam@example.invalid', time_zone: 'Europe/London', user_id: U(11) }],
    agreements: [{ id: U(30), coach_id: COACH.id, kind: 'coaching', profile_id: U(10), status: 'signed', current_version: 1, agreement_kind: 'sessions' }],
    agreement_versions: [{ id: U(31), agreement_id: U(30), coach_id: COACH.id, version: 1, status: 'signed', terms, clauses: [], currency: 'GBP', client_signed_at: '2026-11-01T10:00:00Z' }],
  });
  const api = agreementsApi({ db, server: db, coach: COACH, env: {}, send: async () => 'sent', now: () => new Date('2026-11-26T12:00:00Z') });
  const [a] = db.tables.agreements;
  await assert.rejects(api.pause({ agreementId: U(30), from: '2020-01-06', to: '2020-02-07' }), /starts today or later/);
  assert.equal(a.paused_from ?? null, null, 'nothing written');
  const first = await api.pause({ agreementId: U(30), from: '2026-11-30', to: '2026-12-25' });
  assert.equal(first.endsOn, '2027-07-30');
  await assert.rejects(api.pause({ agreementId: U(30), from: '2026-12-14', to: '2027-01-08' }), /can be paused once/);
  assert.deepEqual([a.paused_from, a.paused_to, a.ends_on], ['2026-11-30', '2026-12-25', '2027-07-30'], 'the first pause and its end kept');
  await assert.rejects(api.endEarly({ agreementId: U(30), endsOn: '2030-01-01', by: 'coach' }), /already ends on Fri 30 Jul 2027/);
  await assert.rejects(api.endEarly({ agreementId: U(30), endsOn: '2027-07-30', by: 'coach' }), /before then/);
  assert.equal(a.ending_by ?? null, null);
  const e = await api.endEarly({ agreementId: U(30), endsOn: '2027-04-30', by: 'client' });
  assert.equal(e.endingOn, '2027-04-30');
  await assert.rejects(api.endEarly({ agreementId: U(30), endsOn: '2027-05-28', by: 'client' }), /already ends on Fri 30 Apr 2027/, 'an early end already set counts');
});

// ---------------------------------------------------------------- P5, the seed, and the year

test('P5: an overdrawn block of hours says by how much and what happens next', () => {
  assert.equal(balanceNote(1710, 800, 'Adie'), '15 hours 10 minutes over the block. The top-up invoice in Needs you adds another block, and the time over comes out of it. Nothing goes to Adie by itself.');
  assert.match(balanceNote(700, 800, 'Adie'), /^1 hour 40 minutes left\. At 80% a top-up invoice was drafted/);
  assert.match(balanceNote(100, 800), /^11 hours 40 minutes left\. At 80% a top-up invoice is drafted/);
});

test('the practice seed’s instalments follow the app’s split: the first carries the pennies', () => {
  assert.deepEqual(splitEqual(1748000, 12).slice(0, 2), [145674, 145666]);
  const sql = readFileSync('tests/scale/seed/06-polish-practice.sql', 'utf8');
  assert.ok(sql.includes('145674') && sql.includes('145666'));
  assert.ok(!sql.includes(', 145667,'), 'no instalment of £1,456.67');
});

test('dates drop their year only in the current year: last year’s and next year’s keep it', () => {
  const today = '2026-11-26';
  assert.equal(whenWords('2025-12-10', today), 'Wed 10 Dec 2025');
  assert.equal(whenWords('2026-11-10', today), 'Tue 10 Nov');
  const rows = sentRows({ invoice: { number: 1201, due_on: '2027-01-08', status: 'paid', paid_at: '2025-12-10T10:00:00Z', payer_email: 'x@example.invalid' }, profile: null, today });
  assert.equal(rows.find((r) => r.label === 'Due').value, 'Fri 8 Jan 2027, by bank transfer');
  assert.equal(rows.find((r) => r.label === 'Settled').value, 'Wed 10 Dec 2025, by bank transfer');
  assert.deepEqual(logDays('2027-01-04').map((o) => o.label), ['Mon 4 Jan', 'Fri 1 Jan', 'Thu 31 Dec 2026', 'Wed 30 Dec 2026']);
});
