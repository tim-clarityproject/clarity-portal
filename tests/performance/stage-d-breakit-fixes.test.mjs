// The Stage D break-it tester's findings (28 Nov 2026), fixed: a team agreement's pause lists only its own people's
// coaching sessions; a later reminder retires an earlier draft, and the device counts days overdue on the payer's clock
// as the server does; no pause once an agreement is ending early, none longer than the screens offer, and a second
// pause arriving while one is set writes nothing; the end a running agreement has now reaches the client's Coaching
// card, Read and See it as [name] sees it; a Daily plan finished last keeps its to-dos everywhere; an organisation's
// change names it in full.
import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolve as resolvePath } from 'node:path';

const stub = pathToFileURL(resolvePath('tests/coach/supabase-stub.mjs')).href;
register(`data:text/javascript,${encodeURIComponent(`export async function resolve(s, c, n) { if (/(^|\\/)supabase(\\.js)?$/.test(s) && String(c.parentURL || '').includes('/src/lib/')) return { url: ${JSON.stringify(stub)}, shortCircuit: true }; return n(s, c); }`)}`);

const e = await import('../../src/lib/agreements/endDate.js');
const d = await import('../../src/lib/agreements/duringAgreement.js');
const { currentReminders, payerToday, reminderDue } = await import('../../src/lib/billing/money.js');
const { reminderLines, needsYouRows } = await import('../../src/lib/coach/financeData.js');
const { blankTerms } = await import('../../src/lib/agreements/terms.js');
const { coachingCard } = await import('../../src/lib/coaching/coachingCard.js');
const { tidyVersion } = await import('../../src/lib/coaching/agreementRules.js');
const { finishTodoOps } = await import('../../src/lib/performance/dayPlan.js');
const { agreementsApi } = await import('../../api/_routes/coach-agreements.js');
const { billing } = await import('../../api/_routes/coach-billing.js');
const { fakeDb065 } = await import('./_fakeDb065.mjs');
const { fakeDb } = await import('./_fakeDb.mjs');

const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ids = (list) => list.map((s) => s.id);

// ---------------------------------------------------------------- 1. a team's pause: its own people's sessions only

const SESSIONS = [
  { id: 'ann-in', profile_id: 'ann', kind: 'coaching', starts_at: '2027-03-08T10:00:00Z' },
  { id: 'ben-in', profile_id: 'ben', kind: 'coaching', starts_at: '2027-03-09T10:00:00Z' },
  { id: 'sam-in', profile_id: 'sam', kind: 'coaching', starts_at: '2027-03-10T10:00:00Z' },
];
const NOW = Date.parse('2027-02-01T00:00:00Z');

test('item 1: a team agreement’s pause lists its own people’s sessions, never every client’s; nobody to match, none', () => {
  const team = { id: 'a', profile_id: null };
  const terms = { kind: 'team', team: { people: [{ name: 'Ann', profileId: 'ann' }, { name: 'Ben', profileId: 'ben' }, { name: 'New', profileId: null }] } };
  assert.deepEqual(e.pausePeople(team, terms), ['ann', 'ben']);
  assert.deepEqual(e.pausePeople({ profile_id: 'sam' }, terms), ['sam'], 'an individual: their own');
  assert.deepEqual(ids(e.sessionsInPause(SESSIONS, { from: '2027-03-01', to: '2027-03-26', people: e.pausePeople(team, terms), now: NOW })), ['ann-in', 'ben-in']);
  assert.deepEqual(e.sessionsInPause(SESSIONS, { from: '2027-03-01', to: '2027-03-26', people: [], now: NOW }), [], 'nobody: none (it listed all three)');
  assert.deepEqual(e.sessionsInPause(SESSIONS, { from: '2027-03-01', to: '2027-03-26', profileId: null, now: NOW }), []);
  assert.deepEqual(ids(e.sessionsInPause(SESSIONS, { from: '2027-03-01', to: '2027-03-26', profileId: 'sam', now: NOW })), ['sam-in']);
});

const COACH = { id: U(1), role: 'owner', active: true, user_id: U(2) };
function agreementWorld({ agreement = {}, terms = {}, sessions = [], now = '2026-11-26T12:00:00Z' } = {}) {
  const t = { ...blankTerms('sessions'), coachName: 'Dr. Tim Dutton', startsOn: '2026-11-02', endsOn: '2027-07-02', totalMinor: 1800000, settle: 'equal', ...terms };
  const db = fakeDb065({
    coaches: [{ id: COACH.id, user_id: COACH.user_id, role: 'owner', display_first_name: 'Tim', email: 'tim@example.invalid', active: true }],
    client_profiles: ['ann', 'ben', 'sam'].map((p, i) => ({ id: U(10 + i), coach_id: COACH.id, name: p, email: `${p}@example.invalid`, time_zone: 'Europe/London', user_id: U(20 + i) })),
    agreements: [{ id: U(30), coach_id: COACH.id, kind: 'coaching', profile_id: U(12), status: 'signed', current_version: 1, agreement_kind: 'sessions', ...agreement }],
    agreement_versions: [{ id: U(31), agreement_id: U(30), coach_id: COACH.id, version: 1, status: 'signed', terms: t, clauses: [], currency: 'GBP', client_signed_at: '2026-11-01T10:00:00Z' }],
    coach_sessions: sessions,
  });
  return { db, api: agreementsApi({ db, server: db, coach: COACH, env: {}, send: async () => 'sent', now: () => new Date(now) }) };
}

test('item 1: the server’s pause of a team agreement answers its own people’s sessions only, as the device does', async () => {
  const sessions = [
    { id: U(60), coach_id: COACH.id, profile_id: U(10), kind: 'coaching', starts_at: '2026-12-07T10:00:00Z' },
    { id: U(61), coach_id: COACH.id, profile_id: U(11), kind: 'coaching', starts_at: '2026-12-08T10:00:00Z' },
    { id: U(62), coach_id: COACH.id, profile_id: U(12), kind: 'coaching', starts_at: '2026-12-09T10:00:00Z' },
  ];
  const { api } = agreementWorld({
    agreement: { profile_id: null, organisation_id: U(40), agreement_kind: 'team' },
    terms: { kind: 'team', team: { people: [{ name: 'ann', profileId: U(10) }, { name: 'ben', profileId: U(11) }], sessions: '12 of 60 minutes each', totalMinor: 0 } },
    sessions,
  });
  const p = await api.pause({ agreementId: U(30), from: '2026-11-30', to: '2026-12-25' });
  assert.deepEqual(p.inside, [U(60), U(61)], 'Sam isn’t on this team');
});

// ---------------------------------------------------------------- 4 and 12. pauses refused on server and device alike

test('item 4: no pause once the agreement is ending early (server, device and stand-in ask pauseProblem)', async () => {
  assert.match(e.pauseProblem({ from: '2026-11-30', to: '2026-12-25', today: '2026-11-26', end: '2027-07-02', earlyEnd: '2027-01-29' }), /ends early on Fri 29 Jan 2027, so it can’t be paused now/);
  const { db, api } = agreementWorld({ agreement: { ending_on: '2027-01-29', ending_by: 'client' } });
  await assert.rejects(api.pause({ agreementId: U(30), from: '2026-11-30', to: '2026-12-25' }), /ends early/);
  assert.equal(db.tables.agreements[0].paused_from ?? null, null, 'nothing written');
});

test('item 12: a pause runs no longer than the screens offer; a second pause arriving while one is set writes nothing', async () => {
  const longest = e.longestPauseTo('2026-11-30');
  assert.equal(longest, '2027-01-29', 'the last of pauseToOptions: 9 weeks on, a Friday');
  assert.equal(e.pauseProblem({ from: '2026-11-30', to: longest, today: '2026-11-26', end: '2027-07-02' }), null);
  assert.match(e.pauseProblem({ from: '2026-11-30', to: '2027-12-31', today: '2026-11-26', end: '2027-07-02' }), /runs to Fri 29 Jan 2027 at the latest/);
  const { db, api } = agreementWorld();
  await assert.rejects(api.pause({ agreementId: U(30), from: '2026-11-30', to: '2027-12-31' }), /at the latest/);
  const both = await Promise.allSettled([
    api.pause({ agreementId: U(30), from: '2026-11-30', to: '2026-12-25' }),
    api.pause({ agreementId: U(30), from: '2026-12-07', to: '2027-01-08' }),
  ]);
  assert.deepEqual(both.map((x) => x.status).sort(), ['fulfilled', 'rejected']);
  assert.equal(both.find((x) => x.status === 'rejected').reason.message, e.PAUSED_ALREADY);
  const [a] = db.tables.agreements;
  assert.deepEqual([a.paused_from, a.paused_to, a.ends_on], ['2026-11-30', '2026-12-25', '2027-07-30'], 'the first kept, the end moved once');
});

// ---------------------------------------------------------------- 2 and 3. reminders

const INV = { id: 'i1', coach_id: COACH.id, profile_id: 'p1', status: 'sent', number: 9703, total_minor: 90000, paid_minor: 0, currency: 'GBP',
  due_on: '2026-11-18', payer_zone: 'Europe/London', payer_name: 'Nadia Kerr', payer_email: 'nadia@example.invalid', hosted_url: 'https://invoice.stripe.example/x', settles_to: 'client' };

test('item 2: a draft below a later stage drafted or sent is retired; never two drafts, never the 7-day after the 14-day', () => {
  const r3 = { id: 'r3', invoice_id: 'i1', stage: 3, drafted_at: '2026-11-21T03:00:00Z' };
  const r7 = { id: 'r7', invoice_id: 'i1', stage: 7, drafted_at: '2026-11-25T03:00:00Z' };
  const r14sent = { id: 'r14', invoice_id: 'i1', stage: 14, sent_at: '2026-12-02T09:00:00Z' };
  assert.deepEqual(ids(currentReminders([r3, r7])), ['r7']);
  assert.deepEqual(ids(currentReminders([{ ...r3, sent_at: '2026-11-21T09:00:00Z' }, r7])), ['r3', 'r7'], 'sent ones stay as history');
  assert.equal(d.waitingReminder(INV, [r3, r7]).id, 'r7');
  assert.equal(d.waitingReminder(INV, [r7, r14sent]), null, 'the 7-day draft isn’t offered after the 14-day one went');
  assert.equal(d.reminderToOffer(INV, [r7, r14sent], '2026-12-05'), null);
  const lines = reminderLines({ invoice: INV, reminders: [r7, r14sent], today: '2026-12-05' });
  assert.deepEqual([lines.waiting, lines.owed], [null, null]);
});

test('item 2: drafting a later stage removes an earlier draft not sent, on the nightly round and on Send', async () => {
  const db = fakeDb({ invoices: [{ ...INV }], invoice_reminders: [{ id: 'r3', invoice_id: 'i1', coach_id: COACH.id, stage: 3, sent_at: null, sending_at: null }], invoice_reminder_pauses: [], coaches: [COACH] });
  const now = { value: new Date('2026-11-25T10:00:00Z') }; // 7 days overdue
  const b = billing({ server: db, stripe: null, coach: COACH, now: () => now.value });
  assert.deepEqual(await b.draftReminders(), { drafted: 1 });
  assert.deepEqual(db.tables.invoice_reminders.map((r) => r.stage), [7], 'the 3-day draft retired');
  // On Send, 14 days on: the 7-day one went; a stray 3-day draft (left by a race) is never offered, and drafting the
  // 14-day one retires it.
  now.value = new Date('2026-12-02T10:00:00Z');
  db.tables.invoice_reminders[0].sent_at = '2026-11-25T09:00:00Z';
  db.tables.invoice_reminders.push({ id: 'r3x', invoice_id: 'i1', coach_id: COACH.id, stage: 3, sent_at: null, sending_at: null });
  const r14 = await b.draftOwedReminder('i1');
  assert.equal(db.tables.invoice_reminders.find((x) => x.id === r14.reminderId)?.stage, 14, 'the 14-day one, never the stray 3-day draft');
  assert.deepEqual(db.tables.invoice_reminders.map((x) => x.stage).sort((x, y) => x - y), [7, 14], 'the stray draft retired; the sent one stays as history');
});

test('item 3: Needs you and Finances count days overdue on the payer’s clock, as the nightly round does', () => {
  // Due Sat 21 Nov; at 11:30 London time on Fri 27 Nov it is already Sat 28 Nov in Auckland: 7 days there, 6 here.
  const inv = { ...INV, due_on: '2026-11-21', payer_zone: 'Pacific/Auckland' };
  const now = Date.parse('2026-11-27T11:30:00Z');
  const today = '2026-11-27';
  assert.equal(payerToday(inv, today, now), '2026-11-28');
  assert.equal(payerToday(inv, today), today, 'with no time given, the day as given');
  assert.equal(reminderDue({ dueKey: inv.due_on, now, zone: inv.payer_zone, drafted: [] }), 7, 'the server: the 7-day one');
  assert.equal(d.owedReminder(inv, [], today, now).stage, 7, 'the device agrees');
  assert.equal(reminderLines({ invoice: inv, reminders: [], today, now }).owed, 7);
  const items = d.needsYouItems({ coachId: COACH.id, today, now, invoices: [inv], invoiceReminders: [], clients: [{ id: 'p1', name: 'Nadia Kerr' }] }).filter((i) => i.kind === 'overdue');
  assert.equal(items[0].data.stage, 7);
  assert.match(items[0].line, /7 days overdue/);
  const fin = needsYouRows({ invoices: [inv], today, names: {}, now }).find((x) => x.invoiceId === 'i1');
  assert.match(fin.title, /is 7 days overdue\.$/);
  // Due on the coach's today, a day overdue on the payer's: not yet owed a reminder.
  assert.equal(d.overdueInNeedsYou({ ...inv, due_on: '2026-11-27' }, { coachId: COACH.id, today, now }), false, 'one day overdue owes nothing yet');
});

// ---------------------------------------------------------------- 5. the end it has now, as the client reads it

test('item 5: agreementNow, the client’s Coaching card and the client’s copy carry the moved end and the pause', () => {
  const t = { ...blankTerms('sessions'), coaching: '6-month coaching', startsOn: '2026-11-02', endsOn: '2027-07-02', months: 8, blocks: [{ n: 12, minutes: 60 }] };
  assert.deepEqual(d.agreementNow({ paused_from: '2026-11-30', paused_to: '2026-12-25', ends_on: '2027-07-30' }, t), { end: '2027-07-30', paused: { from: '2026-11-30', to: '2026-12-25' }, endingOn: null });
  assert.equal(d.agreementNow({ paused_from: '2026-11-30', paused_to: '2026-12-25' }, t).end, '2027-07-30', 'no ends_on yet: moved on by the pause');
  assert.equal(d.agreementNow({ ending_on: '2027-04-30', ending_by: 'client' }, t).endingOn, '2027-04-30');
  const raw = { id: U(31), agreement_id: U(30), version: 1, status: 'signed', client_signed_at: '2026-11-01T10:00:00Z', terms: t, clauses: [],
    ends_on: '2027-07-30', paused_from: '2026-11-30', paused_to: '2026-12-25', ending_on: 'nonsense' };
  const v = tidyVersion(raw);
  assert.deepEqual(v.now, { ends_on: '2027-07-30', ending_on: null, ending_by: null, paused_from: '2026-11-30', paused_to: '2026-12-25' });
  const card = coachingCard(v, 2026, '2026-11-28');
  assert.equal(card.rows.find((r) => r.key === 'dates').name, 'Mon 2 Nov to Fri 30 Jul 2027');
  assert.equal(card.rows.find((r) => r.key === 'paused').name, 'Paused from Mon 30 Nov to Fri 25 Dec');
  assert.equal(coachingCard(v, 2026, '2027-01-04').rows.find((r) => r.key === 'paused'), undefined, 'once the pause is over, no Paused line');
  // Before my_agreements carries them (065's view, for Tim): as signed.
  const plain = coachingCard(tidyVersion({ ...raw, ends_on: undefined, paused_from: undefined, paused_to: undefined }), 2026, '2026-11-28');
  assert.equal(plain.rows.find((r) => r.key === 'dates').name, 'Mon 2 Nov to Fri 2 Jul 2027');
  // An early end is the last day shown.
  const early = coachingCard(tidyVersion({ ...raw, ending_on: '2027-04-30', ending_by: 'client' }), 2026, '2026-11-28');
  assert.equal(early.rows.find((r) => r.key === 'dates').name, 'Mon 2 Nov to Fri 30 Apr 2027');
});

// ---------------------------------------------------------------- 6. the Daily plan finished last keeps its to-dos

test('item 6: Finish sends the whole choice: another device’s to-dos go, this one’s are written with its Most important', () => {
  const ops = finishTodoOps('u', 'plan', { todos: ['b1', 'a2'], top: 'b1' }, { todos: ['a1', 'a2'], top: 'a1' });
  assert.deepEqual(ops.map((o) => [o.kind, o.match?.todo_id || o.values.todo_id, o.values?.is_top]), [
    ['delete', 'b1', undefined],
    ['upsert', 'a1', true],
  ], 'a2 is there already and keeps is_top false');
  const moved = finishTodoOps('u', 'plan', { todos: ['a1', 'a2'], top: 'a2' }, { todos: ['a1', 'a2'], top: 'a1' });
  assert.deepEqual(moved.map((o) => [o.values.todo_id, o.values.is_top]), [['a1', true], ['a2', false]], 'the top moved back');
  assert.deepEqual(finishTodoOps('u', 'plan', { todos: ['a1'], top: 'a1' }, { todos: ['a1'], top: 'a1' }), [], 'nothing to change');
});

// ---------------------------------------------------------------- 9. an organisation named in full

test('item 9: a change names a client by their first name and an organisation in full', () => {
  assert.equal(d.whoOf({ profile_id: 'p' }, 'Sam Carter'), 'Sam');
  assert.equal(d.whoOf({ profile_id: null, organisation_id: 'o' }, 'Harbour Rowing'), 'Harbour Rowing');
});
