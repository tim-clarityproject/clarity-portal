// The keep-in-touch automation (Phase 6a run 8's 3; src/lib/coach/crm.js):
// "When someone is due a catch-up, add a to-do." Network people by their
// catch-up day (network.js dueOn) and past clients by their 3, 6 and 12
// month check-ins; the to-do reads "Catch up with [first name]" and is due
// that day; once for each person and due day (two tabs, a reload); a chain
// still stops after 5 moves; it never moves a stage and never sends; off
// until the coach switches it on, and switched off stops it.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as crm from '../../src/lib/coach/crm.js';
import { dueOn } from '../../src/lib/coach/network.js';

const TODAY = '2026-11-23';
const NOW = '2026-11-23T09:00:00.000Z';
const ME = 'coach-1';
let n = 0;
const newId = () => { n += 1; return `id-${n}`; };

const person = (id, name, extra = {}) => ({ id, coach_id: ME, name, rhythm_months: 3, last_spoke_on: null, added_on: '2026-01-01', snoozed_until: null, archived_at: null, merged_into: null, ...extra });
const PRIYA = person('np-priya', 'Priya Shah', { last_spoke_on: '2026-08-23' }); // due today
const OLLIE = person('np-ollie', 'Ollie Grant', { last_spoke_on: '2026-08-24' }); // due tomorrow
const HANNAH = person('np-hannah', 'Hannah Wells', { last_spoke_on: '2026-07-01' }); // overdue (1 Oct)
const past = (id, name, endedOn) => ({ id, coach_id: ME, name, status: 'past', ended_on: endedOn, merged_into: null });
const BEN = past('p-ben', 'Ben Ortiz', '2026-08-23'); // 3-month check-in today
const keepOn = () => ({ ...crm.keepInTouchAutomation([], { id: 'a-keep', coachId: ME }), active: true });
const ctx = (automations) => ({ automations, leads: [], stages: [], coachId: ME, newId, nowIso: NOW, todayKey: TODAY });

/** A tiny database for runs: unique on automation and event key, as coach_automation_runs is. Shared by "tabs". */
function fakeDb() {
  const db = { runs: [], todos: [], moves: [] };
  db.io = () => ({
    claim: async (run) => { if (db.runs.some((r) => r.automation_id === run.automation_id && r.event_key === run.event_key)) return false; db.runs.push(run); return true; },
    addTodo: async (todo) => { db.todos.push(todo); },
    move: async (m) => { db.moves.push(m); },
  });
  return db;
}

test('due today, due tomorrow and overdue: only those due today or before are events', () => {
  assert.equal(dueOn(PRIYA), TODAY);
  assert.equal(dueOn(OLLIE), '2026-11-24');
  const events = crm.catchUpEvents({ network: [PRIYA, OLLIE, HANNAH], todayKey: TODAY });
  assert.deepEqual(events.map((e) => [e.key, e.dueOn]), [['catchup:network:np-hannah:2026-10-01', '2026-10-01'], ['catchup:network:np-priya:2026-11-23', TODAY]]);
  // Tomorrow it is Ollie's day too.
  assert.ok(crm.catchUpEvents({ network: [OLLIE], todayKey: '2026-11-24' }).some((e) => e.key === 'catchup:network:np-ollie:2026-11-24'));
  // No rhythm, archived or merged: no catch-up.
  assert.deepEqual(crm.catchUpEvents({ network: [person('x', 'No Rhythm', { rhythm_months: null }), { ...HANNAH, archived_at: NOW }, { ...PRIYA, merged_into: 'np-other' }], todayKey: TODAY }), []);
  // The database's own due_on (network_page's rows) is used as it is.
  assert.equal(crm.catchUpEvents({ network: [{ id: 'np-db', name: 'Dana Fox', due_on: '2026-11-20' }], todayKey: TODAY })[0].dueOn, '2026-11-20');
});

test('the to-do reads "Catch up with [first name]", is due that day, and points at the person', () => {
  const [hannah, priya] = crm.catchUpEvents({ network: [PRIYA, HANNAH], todayKey: TODAY });
  const step = crm.automationSteps(priya, ctx([keepOn()]))[0];
  assert.deepEqual([step.todo.title, step.todo.planned_on, step.todo.due_on, step.todo.network_person_id, step.todo.lead_id, step.todo.automation_id], ['Catch up with Priya', TODAY, TODAY, 'np-priya', null, 'a-keep']);
  assert.equal(step.move, null);
  assert.equal(step.run.event_key, 'catchup:network:np-priya:2026-11-23');
  // Overdue: on today's list, still due on its own day.
  const late = crm.automationSteps(hannah, ctx([keepOn()]))[0].todo;
  assert.deepEqual([late.title, late.planned_on, late.due_on], ['Catch up with Hannah', TODAY, '2026-10-01']);
  // The first name comes from the person's own name; with none there is still a calm title.
  assert.equal(crm.catchUpTitle('  Marcus   de Vries '), 'Catch up with Marcus');
  assert.equal(crm.catchUpTitle(''), 'Catch up with someone you’re due to see');
});

test('past clients: the 3, 6 and 12 month check-ins, each its own due day, the soonest first', () => {
  const checkIns = crm.checkInsFor(BEN, { coachId: ME, newId });
  assert.deepEqual(checkIns.map((c) => [c.months, c.due_on]), [[3, '2026-11-23'], [6, '2027-02-23'], [12, '2027-08-23']]);
  const at = (day, rows = checkIns) => crm.catchUpEvents({ checkIns: rows, profiles: [BEN], todayKey: day });
  assert.deepEqual(at(TODAY).map((e) => e.key), ['catchup:client:p-ben:2026-11-23']);
  assert.deepEqual(at('2026-11-22'), []); // not yet
  const three = checkIns.find((c) => c.months === 3);
  const after3 = checkIns.map((c) => (c.id === three.id ? { ...c, done_at: NOW } : c));
  assert.deepEqual(at('2027-02-23', after3).map((e) => e.key), ['catchup:client:p-ben:2027-02-23']);
  const after6 = after3.map((c) => (c.months === 6 ? { ...c, skipped_at: NOW } : c));
  assert.deepEqual(at('2027-08-23', after6).map((e) => e.key), ['catchup:client:p-ben:2027-08-23']);
  // One event a client: the soonest not done.
  assert.equal(at('2027-08-23').length, 1);
  // Not a past client, merged away, or no profile: nothing.
  assert.deepEqual(crm.catchUpEvents({ checkIns, profiles: [{ ...BEN, status: 'active' }], todayKey: TODAY }), []);
  assert.deepEqual(crm.catchUpEvents({ checkIns, profiles: [{ ...BEN, merged_into: 'p-x' }], todayKey: TODAY }), []);
  const step = crm.automationSteps(at(TODAY)[0], ctx([keepOn()]))[0];
  assert.deepEqual([step.todo.title, step.todo.due_on, step.todo.profile_id, step.run.profile_id, step.todo.network_person_id], ['Catch up with Ben', TODAY, 'p-ben', 'p-ben', undefined]);
});

test('once per person per due date: asked again, in two tabs, and after a reload', async () => {
  const db = fakeDb();
  const events = () => crm.catchUpEvents({ network: [PRIYA, HANNAH], checkIns: crm.checkInsFor(BEN, { coachId: ME, newId }), profiles: [BEN], todayKey: TODAY });
  const tabA = db.io();
  const tabB = db.io();
  // Two tabs at once.
  await Promise.all(events().map(async (e) => { await crm.runAutomations(e, ctx([keepOn()]), tabA); await crm.runAutomations(e, ctx([keepOn()]), tabB); }));
  assert.equal(db.todos.length, 3);
  // A reload (a fresh io and fresh event ids) and asking again add nothing.
  for (const e of events()) assert.deepEqual(await crm.runAutomations(e, ctx([keepOn()]), db.io()), { ran: 0, todos: 0, moves: 0 });
  assert.deepEqual(db.todos.map((t) => t.title).sort(), ['Catch up with Ben', 'Catch up with Hannah', 'Catch up with Priya']);
  // The next catch-up (spoken to today, so due again in 3 months) is a new due day: one more to-do then.
  const next = crm.catchUpEvents({ network: [{ ...PRIYA, last_spoke_on: TODAY }], todayKey: '2027-02-23' });
  assert.equal(next[0].key, 'catchup:network:np-priya:2027-02-23');
  assert.equal((await crm.runAutomations(next[0], { ...ctx([keepOn()]), todayKey: '2027-02-23' }, db.io())).todos, 1);
  // "Not now" on a check-in moves its day: that new day is one more, once.
  assert.equal(crm.alreadyRan(db.runs, { automation_id: 'a-keep', event_key: 'catchup:network:np-priya:2026-11-23', id: 'other' }), true);
});

test('a chain still stops after 5 moves, and a catch-up never moves a stage or sends', async () => {
  // Saved as a stage move, it is tidied back to its one to-do; the panel says why if asked to move.
  const asStage = crm.tidyAutomation({ ...keepOn(), action: 'stage', to_stage_id: 's-dec', todo_title: 'Something else', todo_days: 7 });
  assert.deepEqual([asStage.action, asStage.to_stage_id, asStage.todo_title, asStage.todo_days], ['todo', null, crm.CATCH_UP_TITLE, 0]);
  assert.equal(crm.automationProblem({ ...keepOn(), action: 'stage', to_stage_id: 's-dec' }, { stages: [] }), 'A catch-up adds a to-do. Choose Add a to-do instead.');
  // With stage automations around it, a catch-up event moves nothing.
  const stages = ['s0', 's1', 's2', 's3', 's4', 's5', 's6', 's7'].map((id, i) => ({ id, coach_id: ME, name: `Stage ${i}`, position: i, is_won: false, likelihood: 10 }));
  const movers = stages.slice(0, 7).map((s, i) => ({ id: `mv${i}`, coach_id: ME, trigger: 'lead_stage', trigger_stage_id: s.id, action: 'stage', to_stage_id: stages[i + 1].id, active: true, position: i + 1 }));
  const db = fakeDb();
  const done = await crm.runAutomations(crm.catchUpEvents({ network: [PRIYA], todayKey: TODAY })[0], { ...ctx([keepOn(), ...movers]), stages }, db.io());
  assert.deepEqual(done, { ran: 1, todos: 1, moves: 0 });
  // Run 4's chain guard is unchanged: a lead pushed down 7 stage moves stops after 5.
  const lead = { id: 'l1', coach_id: ME, name: 'Leo Park', stage_id: 's0', cold_at: null, won_at: null, merged_into: null };
  let leads = [lead];
  const io = { ...db.io(), move: async (m) => { leads = leads.map((l) => (l.id === m.lead.id ? m.lead : l)); } };
  const chain = await crm.runAutomations(crm.stageEvent(lead, 's0', 'm0'), { ...ctx(movers), stages, leads, leadsNow: () => leads }, io);
  assert.equal(crm.CHAIN_MAX, 5);
  assert.deepEqual([chain.moves, leads[0].stage_id], [5, 's5']);
  // Only a to-do or a stage move exists, and nothing in a step can send.
  assert.deepEqual(crm.ACTIONS.map((a) => a.value), ['todo', 'stage']);
  assert.ok(!/send|email|message/i.test(JSON.stringify(crm.automationSteps(crm.catchUpEvents({ network: [PRIYA], todayKey: TODAY })[0], ctx([keepOn()]))[0].todo).replace(/from_email_\w+/g, '')));
});

test('off until the coach switches it on; switched off stops it; one a coach', () => {
  // Listed, not saved, and off.
  const listed = crm.keepInTouchAutomation([], { id: 'a-new', coachId: ME });
  assert.deepEqual([listed.id, listed.active, listed.trigger, listed.action, listed.todo_title], ['a-new', false, 'catch_up_due', 'todo', 'Catch up with [first name]']);
  assert.equal(crm.ranWords(listed, [], TODAY), 'Off');
  assert.equal(crm.automationSentence(listed), 'When someone is due a catch-up, add the to-do “Catch up with [first name]”, due that day.');
  const ev = crm.catchUpEvents({ network: [PRIYA], todayKey: TODAY })[0];
  assert.deepEqual(crm.automationSteps(ev, ctx([listed])), []);
  // Saving it from its panel keeps it off; switching it on is what turns it on.
  assert.equal(crm.automationSavePlan(listed, { automations: [] }).automation.active, false);
  const on = crm.automationSwitch(listed, true, { automations: [] });
  assert.deepEqual([on.automation.active, on.toast], [true, 'Switched on']);
  assert.equal(crm.automationSteps(ev, ctx([on.automation])).length, 1);
  // Switched off: nothing runs.
  const off = crm.automationSwitch(on.automation, false, { automations: [on.automation] });
  assert.deepEqual(crm.automationSteps(ev, ctx([off.automation])), []);
  // The saved one is the one listed; a second can't be saved.
  assert.equal(crm.keepInTouchAutomation([on.automation], { id: 'other', coachId: ME }).id, 'a-new');
  assert.deepEqual(crm.automationSavePlan({ ...listed, id: 'second' }, { automations: [on.automation] }), { error: 'You have this automation already. Switch it on in the list.' });
  // It never answers another kind's event, and other automations never answer it.
  assert.equal(crm.automationMatches(on.automation, crm.wonEvent({ id: 'l1' })), false);
  assert.equal(crm.automationMatches({ id: 'w', trigger: 'lead_won', action: 'todo', active: true }, ev), false);
});

// ---------------------------------------------------------------- the run 8 break-it tester
test('deleted and made again, or made twice in two tabs: still one catch-up to-do for each person and due day', async () => {
  const db = fakeDb();
  const events = crm.catchUpEvents({ network: [PRIYA, HANNAH], todayKey: TODAY });
  const first = keepOn();
  for (const e of events) await crm.runAutomations(e, ctx([first]), db.io());
  assert.equal(db.todos.length, 2);
  // Deleted (its runs go with it, as the database's cascade does), then switched on again as a new row.
  db.runs.length = 0;
  const again = { ...keepOn(), id: 'a-keep-2' };
  const left = events.filter((e) => !crm.catchUpAdded(db.todos, e));
  assert.equal(left.length, 0, 'the to-dos already there stop it');
  for (const e of left) await crm.runAutomations(e, ctx([again]), db.io());
  // Two keep-in-touch automations switched on at once (two tabs): one to-do for an event, not two.
  const db2 = fakeDb();
  for (const e of events) await crm.runAutomations(e, ctx([first, { ...again, position: 9 }]), db2.io());
  assert.equal(db2.todos.length, 2);
  // A new due day is a new catch-up.
  assert.equal(crm.catchUpAdded(db.todos, { ...events[0], dueOn: '2027-02-23' }), false);
  // Every tab makes the same id for it.
  assert.equal(crm.keepInTouchId(ME), crm.keepInTouchId(ME));
  assert.notEqual(crm.keepInTouchId(ME), crm.keepInTouchId('coach-2'));
});

test('odd names: none, emoji first, very long; the to-do stays within 300 characters', async () => {
  const long = 'A'.repeat(400);
  const names = [['', 'Catch up with someone you’re due to see'], ['   ', 'Catch up with someone you’re due to see'], ['🦊 Sam', 'Catch up with 🦊'], ['Zoë-Ann  O’Neil', 'Catch up with Zoë-Ann']];
  for (const [name, want] of names) assert.equal(crm.catchUpTitle(name), want);
  const db = fakeDb();
  await crm.runAutomations(crm.catchUpEvents({ network: [person('np-long', `${'😀'.repeat(200)}${long}`, { last_spoke_on: '2026-08-23' })], todayKey: TODAY })[0], ctx([keepOn()]), db.io());
  assert.equal(db.todos.length, 1);
  assert.ok([...db.todos[0].title].length <= 300 && !/[\uD800-\uDBFF]$/.test(db.todos[0].title), 'within 300 and never half an emoji');
});

// Claude's calls on run 8's points 3 and 4 (24 Nov 2026).
test('switched on today: only catch-ups that fall due from today count, never everyone already overdue', () => {
  const checkIns = crm.checkInsFor(BEN, { coachId: ME, newId });
  const all = crm.catchUpEvents({ network: [PRIYA, HANNAH], checkIns, profiles: [BEN], todayKey: TODAY });
  assert.deepEqual(all.map((e) => e.name).sort(), ['Ben Ortiz', 'Hannah Wells', 'Priya Shah']);
  const fromToday = crm.catchUpEvents({ network: [PRIYA, HANNAH], checkIns, profiles: [BEN], todayKey: TODAY, since: TODAY });
  assert.deepEqual(fromToday.map((e) => e.name).sort(), ['Ben Ortiz', 'Priya Shah']); // Hannah was overdue since 1 Oct
  // Ollie falls due tomorrow, after the switch: he counts then.
  assert.deepEqual(crm.catchUpEvents({ network: [OLLIE, HANNAH], todayKey: '2026-11-24', since: TODAY }).map((e) => e.name), ['Ollie Grant']);
});

test('"Suggest check-ins at 3, 6 and 12 months" switched off stops past clients\' catch-ups too, never Network\'s', () => {
  const checkIns = crm.checkInsFor(BEN, { coachId: ME, newId });
  const off = crm.catchUpEvents({ network: [PRIYA], checkIns, profiles: [BEN], todayKey: TODAY, clientCheckIns: false });
  assert.deepEqual(off.map((e) => e.name), ['Priya Shah']);
  assert.equal(crm.checkInsOn({ crm: { suggest_check_ins: false } }), false);
  assert.equal(crm.checkInsOn({}), true);
});

test('the day it was switched on: the latest switch-on kept among its runs, else the day it was made; never counted as a run', () => {
  const keep = { ...keepOn(), created_at: '2026-11-02T10:00:00Z' };
  const runs = [
    { automation_id: keep.id, event_key: crm.keepInTouchOnKey('2026-11-10'), ran_at: '2026-11-10T09:00:00Z' },
    { automation_id: keep.id, event_key: crm.keepInTouchOnKey('2026-11-20'), ran_at: '2026-11-20T09:00:00Z' },
    { automation_id: keep.id, event_key: 'catchup:network:np-priya:2026-11-23', ran_at: '2026-11-23T09:00:00Z' },
    { automation_id: 'someone-else', event_key: crm.keepInTouchOnKey('2026-11-22'), ran_at: '2026-11-22T09:00:00Z' },
  ];
  assert.equal(crm.keepInTouchSince(keep, runs), '2026-11-20');
  assert.equal(crm.keepInTouchSince(keep, []), '2026-11-02');
  assert.equal(crm.keepInTouchSince(null, runs), null);
  assert.equal(crm.ranWords(keep, runs, TODAY), 'Ran 1 time in November');
});

test('a keep-in-touch automation whose switch-on day isn\'t here yet counts from today, never from the start', () => {
  const keep = { ...keepOn(), created_at: undefined };
  assert.equal(crm.keepInTouchSince(keep, [], TODAY), TODAY);
});
