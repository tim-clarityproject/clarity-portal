// The browser tests' stand-in for migration 052 (tests/coach/crm-standin.mjs)
// must answer as the SQL does, because Leads, boards, automations and
// Network are built and tested against it before Tim runs 052. Each check
// here has the same answer as its twin in supabase/052_coach_crm_test.sql
// (named beside it), so the two can't drift apart unnoticed. The seed the
// suites use is checked too: every row of it is one the database would take.
import test from 'node:test';
import assert from 'node:assert/strict';
import { boardColumnsOk, CRM_FUNCTIONS, CRM_HOOKED, CRM_TABLES, crmStandIn, peopleOk, START_STAGES } from '../coach/crm-standin.mjs';
import { CRM, crmSeed, manyLeads, manyNetwork, networkDeviceSeed, networkSeed, seedClock, seedWithCrm } from '../coach/seed.mjs';
import { ME, OTHER } from '../coach/shared.mjs';
import { focusOf, networkCounts } from '../../src/lib/coach/network.js';

const NOW = new Date('2026-11-19T10:00:00Z'); // a Thursday, M11's own today
const TODAY = '2026-11-19';
// The seed's days are counted from its own "today": pinned to M11's, so "9 days overdue" is the same every day this runs.
seedClock('2026-11-19T10:00:00');

class Refusal extends Error { constructor(code, message) { super(message); this.code = code; } }
const no = (code, message) => { throw new Refusal(code, message); };
const codeOf = (fn) => { try { fn(); return 'ok'; } catch (e) { if (e instanceof Refusal) return e.code; throw e; } };

/** A database with 049 to 052's tables, as one coach sees it. */
function world({ role = 'owner', rows: given = {} } = {}) {
  const tables = [...CRM_TABLES, 'coach_leads', 'coach_todos', 'coach_bookings', 'client_profiles', 'organisation_contacts', 'coach_tag_links', 'coach_field_values'];
  const rows = Object.fromEntries(tables.map((t) => [t, [...(given[t] || [])]]));
  const me = { id: ME, role: role === 'owner' ? 'owner' : 'coach', display_first_name: role === 'owner' ? 'Tess' : 'Maya', email: 'tess@example.invalid', active: true };
  const store = { rows, coaches: [me, { id: OTHER, role: role === 'owner' ? 'coach' : 'owner', display_first_name: 'Other', active: true }], fn: {} };
  const sim = crmStandIn({ store, ME, me, clock: () => NOW, no });
  /** A save as the API does it: the row security and checks, the row kept, then the triggers. */
  const save = (table, row) => {
    const key = (r) => (table === 'network_ratings' ? `${r.person_id}|${r.rating}|${r.rated_on}` : table === 'coach_email_links' ? `${r.email_id}|${r.person_kind}|${r.person_id}` : r.id);
    const at = rows[table].findIndex((x) => key(x) === key(row));
    const old = at >= 0 ? rows[table][at] : null;
    const kept = sim.before(table, old, old ? { ...old, ...row } : { created_at: NOW.toISOString(), ...row });
    const was = old ? { ...old } : null;
    if (old) Object.assign(old, kept); else rows[table].push(kept);
    sim.after(table, was, old || kept);
    return old || kept;
  };
  const tryTo = (table, row) => codeOf(() => save(table, row));
  return { rows, store, sim, save, tryTo, me };
}

test('the five stages to start, once; a lead with no stage takes the first (4b, 4c, 4g)', () => {
  const w = world();
  w.rows.coach_leads.push({ id: 'early', coach_id: ME, name: 'Booked before the stages', source: 'chemistry_page', stage_id: null });
  assert.equal(w.sim.fn.coach_lead_stages_start().map((s) => `${s.name} ${s.likelihood}`).join(', '), 'New 10, Call booked 25, Proposal sent 50, Deciding 70, Won 100');
  assert.equal(w.sim.fn.coach_lead_stages_start().length, 5);
  assert.deepEqual(START_STAGES.map((s) => s.name), ['New', 'Call booked', 'Proposal sent', 'Deciding', 'Won']);
  const first = w.rows.coach_lead_stages.find((s) => s.name === 'New').id;
  assert.equal(w.rows.coach_leads[0].stage_id, first);
  assert.equal(w.save('coach_leads', { id: 'amy', coach_id: ME, name: 'Amy Cole', source: 'manual' }).stage_id, first);
  assert.equal(codeOf(() => world({ role: 'associate' }).sim.fn.coach_lead_stages_start()), '42501');
});

test('Won is always last and 100%; nothing sits after it; a stage with leads in it stays (4d, 4e, 4f, 4h)', () => {
  const w = world();
  const [st0, st1, , , won] = w.sim.fn.coach_lead_stages_start();
  const extra = w.save('coach_lead_stages', { id: 'extra', coach_id: ME, name: 'Verbal yes', likelihood: 85, position: 4 });
  assert.equal(w.save('coach_lead_stages', { id: 'extra', position: 1000000 }).position, 999999);
  assert.deepEqual([w.save('coach_lead_stages', { id: won.id, position: 1, likelihood: 40 }).position, won.likelihood], [1000000, 100]);
  assert.equal(w.tryTo('coach_lead_stages', { id: won.id, is_won: false }), '23514');
  assert.equal(codeOf(() => w.sim.remove('coach_lead_stages', [won])), '23514');
  assert.equal(w.tryTo('coach_lead_stages', { id: 'won2', coach_id: ME, name: 'Won again', is_won: true }), '23505');
  assert.equal(w.tryTo('coach_lead_stages', { id: 'x', coach_id: ME, name: 'Sure thing', likelihood: 101 }), '23514');
  assert.equal(w.tryTo('coach_lead_stages', { id: 'y', coach_id: ME, name: ' new ' }), '23505');
  w.save('coach_leads', { id: 'ruth', coach_id: ME, name: 'Ruth Adeyemi', source: 'referral', stage_id: st1.id });
  assert.equal(codeOf(() => w.sim.remove('coach_lead_stages', [st1])), '23503');
  w.save('coach_leads', { id: 'ruth', stage_id: extra.id });
  assert.equal(w.sim.remove('coach_lead_stages', [st1]).length, 1);
  assert.equal(st0.name, 'New');
});

test('a lead: won and cold never together, a value from zero up, and only its own coach’s stage (4i, 4j)', () => {
  const w = world();
  const [st] = w.sim.fn.coach_lead_stages_start();
  w.save('coach_leads', { id: 'amy', coach_id: ME, name: 'Amy Cole', source: 'manual' });
  assert.equal(w.tryTo('coach_leads', { id: 'amy', won_at: NOW.toISOString(), cold_at: NOW.toISOString() }), '23514');
  assert.equal(w.tryTo('coach_leads', { id: 'amy', value: -1 }), '23514');
  assert.equal(w.tryTo('coach_leads', { id: 'amy', source: 'carrier pigeon' }), '23514');
  assert.equal(w.tryTo('coach_leads', { id: 'amy', cold_at: NOW.toISOString(), cold_reason: 'Budget frozen until spring', cold_check_on: '2027-02-17' }), 'ok');
  assert.equal(w.tryTo('coach_leads', { id: 'amy', network_person_id: 'nobody' }), '23514');
  // An associate's own lead (a booking on her page) has no stage, and can't take the owner's.
  const maya = world({ role: 'associate', rows: { coach_lead_stages: w.rows.coach_lead_stages.map((s) => ({ ...s, coach_id: OTHER })) } });
  assert.equal(maya.save('coach_leads', { id: 'jo', coach_id: ME, name: 'Jo Mensah', source: 'chemistry_page' }).stage_id, null);
  assert.equal(maya.tryTo('coach_leads', { id: 'jo', stage_id: st.id }), '23514');
});

test('a booking writes First contact and Booked a call by itself; a second booking one more line (4k)', () => {
  const rows = {};
  const w = (() => {
    const base = world();
    // 051's booking_make(), as the calendar stand-in has it: it makes or finds the lead.
    base.store.fn.booking_make = (name, email, bookingId) => {
      const found = base.rows.coach_leads.find((l) => l.email === email);
      if (found) found.booking_id = bookingId; else base.rows.coach_leads.push({ id: `lead-${email}`, coach_id: ME, name, email, source: 'chemistry_page', call_type_key: 'chemistry', booking_id: bookingId, stage_id: null });
      return { status: 'booked' };
    };
    const sim = crmStandIn({ store: base.store, ME, me: base.me, clock: () => NOW, no });
    return { ...base, sim };
  })();
  w.sim.fn.coach_lead_stages_start();
  assert.equal(w.store.fn.booking_make('Nadia Osei', 'nadia@example.invalid', 'b1').status, 'booked');
  w.store.fn.booking_make('Nadia Osei', 'nadia@example.invalid', 'b2');
  const lead = w.rows.coach_leads[0];
  assert.deepEqual(w.rows.coach_lead_events.filter((e) => e.lead_id === lead.id).sort((a, b) => a.happened_at.localeCompare(b.happened_at)).map((e) => e.kind), ['first_contact', 'booking', 'booking']);
  assert.equal(lead.stage_id, w.rows.coach_lead_stages.find((s) => s.name === 'New').id);
  assert.equal(lead.last_contact_on, TODAY);
  assert.deepEqual(rows, {});
});

test('the timeline: a call moves last contact forward, a note doesn’t, an older call doesn’t move it back (4l, 4m)', () => {
  const w = world();
  w.save('coach_leads', { id: 'amy', coach_id: ME, name: 'Amy Cole', source: 'manual' });
  w.rows.coach_leads.push({ id: 'theirs', coach_id: OTHER, name: 'Someone else’s', source: 'manual' });
  w.save('coach_lead_events', { id: 'e1', coach_id: ME, lead_id: 'amy', kind: 'call', happened_on: '2026-11-10', title: 'Chemistry Call, 30 minutes', data: { minutes: 30 } });
  assert.equal(w.rows.coach_leads[0].last_contact_on, '2026-11-10');
  w.save('coach_lead_events', { id: 'e2', coach_id: ME, lead_id: 'amy', kind: 'note', happened_on: TODAY, title: 'A thought' });
  w.save('coach_lead_events', { id: 'e3', coach_id: ME, lead_id: 'amy', kind: 'call', happened_on: '2026-10-20', title: 'An earlier call' });
  assert.equal(w.rows.coach_leads[0].last_contact_on, '2026-11-10');
  assert.equal(w.tryTo('coach_lead_events', { id: 'e4', coach_id: ME, lead_id: 'amy', kind: 'sms' }), '23514');
  assert.equal(w.tryTo('coach_lead_events', { id: 'e5', coach_id: ME, lead_id: 'theirs', kind: 'note' }), '42501');
});

test('two leads merge into one, and Undo puts both back as they were, once (5a to 5d)', () => {
  const w = world();
  w.sim.fn.coach_lead_stages_start();
  w.save('coach_leads', { id: 'ruth', coach_id: ME, name: 'Ruth Adeyemi', source: 'referral', phone: '07700 900213', notes: 'From the Chemistry Call page' });
  w.save('coach_leads', { id: 'dup', coach_id: ME, name: 'Ruth A. Adeyemi', source: 'import', organisation: 'Harbour City FC' });
  w.rows.coach_leads.push({ id: 'theirs', coach_id: OTHER, name: 'Someone else’s', source: 'manual' });
  w.save('coach_lead_events', { id: 'n1', coach_id: ME, lead_id: 'dup', kind: 'note', happened_on: '2026-11-17', title: 'Met at the conference' });
  w.rows.coach_todos.push({ id: 't1', coach_id: ME, title: 'Send Ruth the workshop dates', lead_id: 'dup' });
  const merge = w.sim.fn.lead_merge('ruth', 'dup', { organisation: true });
  const ruth = w.rows.coach_leads.find((l) => l.id === 'ruth');
  assert.deepEqual([ruth.name, ruth.organisation, ruth.phone, w.rows.coach_leads.find((l) => l.id === 'dup').merged_into, w.rows.coach_lead_events[0].lead_id, w.rows.coach_todos[0].lead_id],
    ['Ruth Adeyemi', 'Harbour City FC', '07700 900213', 'ruth', 'ruth', 'ruth']);
  assert.deepEqual([codeOf(() => w.sim.fn.lead_merge('ruth', 'dup')), codeOf(() => w.sim.fn.lead_merge('ruth', 'ruth')), codeOf(() => w.sim.fn.lead_merge('ruth', 'theirs'))], ['22023', '22023', '42501']);
  w.sim.fn.lead_unmerge(merge);
  const back = w.rows.coach_leads.find((l) => l.id === 'ruth');
  assert.deepEqual([back.name, back.organisation ?? null, w.rows.coach_leads.find((l) => l.id === 'dup').merged_into, w.rows.coach_lead_events[0].lead_id, w.rows.coach_todos[0].lead_id], ['Ruth Adeyemi', null, null, 'dup', 'dup']);
  assert.equal(codeOf(() => w.sim.fn.lead_unmerge(merge)), '22023');
});

test('automations: add a to-do or move a stage and nothing else; one run for each automation and event (6a, 6b, 6c)', () => {
  const w = world();
  const [stNew, , stProp] = w.sim.fn.coach_lead_stages_start();
  const auto = (extra) => ({ id: `a-${Math.random()}`, coach_id: ME, ...extra });
  assert.equal(w.tryTo('coach_automations', auto({ trigger: 'proposal_opened', trigger_count: 3, action: 'stage', to_stage_id: stProp.id })), 'ok');
  for (const action of ['email', 'tag', 'keep_in_touch', 'message', 'send']) assert.equal(w.tryTo('coach_automations', auto({ trigger: 'lead_won', action, todo_title: 'x' })), '23514', action);
  assert.equal(w.tryTo('coach_automations', auto({ trigger: 'lead_won', action: 'todo' })), '23514');
  assert.equal(w.tryTo('coach_automations', auto({ trigger: 'lead_won', action: 'todo', todo_title: 'x', to_stage_id: stNew.id })), '23514');
  assert.equal(w.tryTo('coach_automations', auto({ trigger: 'lead_won', action: 'stage' })), '23514');
  assert.equal(w.tryTo('coach_automations', auto({ trigger: 'birthday', action: 'todo', todo_title: 'x' })), '23514');
  assert.equal(w.tryTo('coach_automations', auto({ trigger: 'call_booked', action: 'todo', todo_title: 'Read their booking answers', todo_days: -1 })), 'ok');
  assert.equal(w.tryTo('coach_automations', auto({ trigger: 'lead_stage', trigger_stage_id: stProp.id, action: 'stage', to_stage_id: stProp.id })), '23514');
  assert.equal(w.tryTo('coach_automations', auto({ trigger: 'lead_stage', action: 'todo', todo_title: 'x' })), '23514');
  const a = w.save('coach_automations', { id: 'a1', coach_id: ME, trigger: 'lead_stage', trigger_stage_id: stProp.id, action: 'todo', todo_title: 'Follow up on the proposal', todo_days: 3 });
  w.save('coach_leads', { id: 'amy', coach_id: ME, name: 'Amy Cole', source: 'manual' });
  assert.equal(w.tryTo('coach_automation_runs', { id: 'r1', automation_id: a.id, coach_id: ME, event_key: 'stage:amy:prop:1', lead_id: 'amy' }), 'ok');
  assert.equal(w.tryTo('coach_automation_runs', { id: 'r2', automation_id: a.id, coach_id: ME, event_key: 'stage:amy:prop:1', lead_id: 'amy' }), '23505');
  assert.equal(w.tryTo('coach_automation_runs', { id: 'r3', automation_id: a.id, coach_id: ME, event_key: 'stage:amy:prop:2', lead_id: 'amy' }), 'ok');
  assert.equal(w.tryTo('coach_automation_runs', { id: 'r1', event_key: 'again' }), '42501');
});

test('each role: the owner reads all of it; an associate none, except a shared board, which stays read only (3b to 3g)', () => {
  const seed = seedWithCrm();
  const owner = world({ rows: seed });
  for (const t of CRM_TABLES.filter((x) => !['coach_lead_merges', 'network_merges'].includes(x))) {
    assert.ok(owner.rows[t].every((r) => owner.sim.readable(t, r)), `the owner reads ${t}`);
  }
  const theirs = Object.fromEntries(Object.entries(seed).map(([t, list]) => [t, list.map((r) => (r.coach_id === ME ? { ...r, coach_id: OTHER } : r))]));
  const maya = world({ role: 'associate', rows: theirs });
  for (const t of CRM_TABLES) assert.equal(maya.rows[t].filter((r) => maya.sim.readable(t, r)).length, 0, `an associate reads nothing of ${t}`);
  for (const fn of ['network_page', 'network_map', 'network_counts', 'coach_lead_stages_start', 'coach_email_addresses_start']) assert.equal(codeOf(() => maya.sim.fn[fn]({})), '42501', fn);
  assert.equal(codeOf(() => maya.sim.fn.network_archive([CRM.dan])), '42501');
  assert.equal(codeOf(() => maya.sim.fn.network_import([{ name: 'Someone New' }])), '42501');
  assert.equal(codeOf(() => maya.sim.fn.coach_email_add({ subject: 'x' })), '42501');
  assert.equal(maya.tryTo('network_people', { id: 'mine', coach_id: ME, name: 'Mine now' }), '42501');
  assert.equal(maya.tryTo('coach_lead_stages', { id: 'mine', coach_id: ME, name: 'Mine' }), '42501');
  assert.equal(maya.tryTo('coach_boards', { id: 'mine', coach_id: ME, name: 'Mine' }), '42501');
  // Shared (off by default): she reads that board, its stages and its cards, and only that board.
  assert.ok(seed.coach_boards.every((b) => b.shared === false));
  maya.rows.coach_boards.find((b) => b.id === CRM.speaking).shared = true;
  assert.deepEqual(maya.rows.coach_boards.filter((r) => maya.sim.readable('coach_boards', r)).map((b) => b.name), ['Speaking']);
  assert.equal(maya.rows.coach_board_stages.filter((r) => maya.sim.readable('coach_board_stages', r)).length, 4);
  assert.equal(maya.rows.coach_board_items.filter((r) => maya.sim.readable('coach_board_items', r)).length, 5);
  assert.ok([...maya.rows.coach_boards, ...maya.rows.coach_board_items].every((r) => !maya.sim.writable(r.board_id ? 'coach_board_items' : 'coach_boards', r)));
  assert.equal(maya.tryTo('coach_board_items', { id: 'mine', board_id: CRM.speaking, coach_id: ME, stage_id: CRM.spIdeas, title: 'Mine' }), '42501');
  assert.equal(maya.sim.remove('coach_board_stages', [maya.rows.coach_board_stages[0]]).length, 0);
  // Her own past client's check-ins are hers.
  maya.rows.client_profiles.push({ id: 'nina', coach_id: ME, name: 'Nina Shah' });
  assert.equal(maya.tryTo('client_check_ins', { id: 'ci', coach_id: ME, profile_id: 'nina', months: 3, due_on: '2027-02-17' }), 'ok');
  assert.equal(maya.tryTo('client_check_ins', { id: 'ci2', coach_id: ME, profile_id: CRM.ben, months: 3, due_on: '2027-02-17' }), '42501');
  assert.equal(maya.tryTo('client_check_ins', { id: 'ci3', coach_id: ME, profile_id: 'nina', months: 4, due_on: '2027-02-17' }), '23514');
});

test('a card’s stage is one of its own board’s; a board’s columns have an id, a name and a kind (3j, 2b)', () => {
  const w = world({ rows: crmSeed() });
  assert.equal(w.tryTo('coach_board_items', { id: w.rows.coach_board_items[0].id, stage_id: CRM.ptTalking }), '23514');
  assert.deepEqual([[], [{ id: 'date', name: 'Date', kind: 'date' }, { id: 'fee', name: 'Fee', kind: 'money' }], [{ id: 'x', name: 'X', kind: 'formula' }], [{ name: 'No id', kind: 'text' }], { id: 'x' }].map(boardColumnsOk), [true, true, false, false, false]);
  assert.deepEqual([[], [{ name: 'Amy Cole', email: 'amy@example.invalid' }], [{ name: 'Amy Cole' }], [{ email: 'Amy@Example.invalid' }], { email: 'amy@example.invalid' }, ['amy@example.invalid']].map(peopleOk), [true, true, false, false, false, false]);
});

test('emails log themselves: once, on the right timelines by address; someone not in the portal waits, once (7a to 7h)', () => {
  const w = world();
  w.store.accountEmail = 'tess.account@example.invalid';
  w.save('coach_leads', { id: 'amy', coach_id: ME, name: 'Amy Cole', email: 'amy@example.invalid', source: 'manual' });
  w.rows.client_profiles.push({ id: 'sam', coach_id: ME, name: 'Sam Okafor', email: 'sam@example.invalid' });
  w.save('network_people', { id: 'dan', coach_id: ME, name: 'Dan Reid', email: 'dan@example.invalid' });
  const keys = w.sim.fn.coach_email_addresses_start();
  assert.deepEqual([keys.length, w.sim.fn.coach_email_addresses_start().length, keys.map((k) => k.kind).join(','), keys.every((k) => new RegExp(`^${k.kind}\\.tess\\.[a-z0-9]{8}$`).test(k.key))], [2, 2, 'log,todo', true]);
  assert.equal(w.tryTo('coach_email_addresses', { id: 'x', coach_id: ME, kind: 'log', key: 'log.mine.12345678' }), '42501');
  const [log, todo] = keys;
  const j = w.sim.fn.email_in(log.key, { external_id: 'msg-1', direction: 'out', from: { name: 'Tess Owner', email: 'tess@example.invalid' },
    to: [{ name: 'Amy Cole', email: 'Amy@Example.invalid' }, { name: 'Sarah Kent', email: 'sarah@example.invalid' }],
    cc: [{ email: `${log.key}@in.example.invalid` }, { name: 'Dan Reid', email: 'dan@example.invalid' }, { name: 'Sam Okafor', email: 'sam@example.invalid' }, { name: 'Someone Copied', email: 'copied@example.invalid' }],
    subject: 'Leadership Accelerator proposal', body: 'Hello Amy,\n\nThe proposal is attached.\n\nTess', sent_at: '2026-11-12T10:00:00Z', link: 'https://mail.example.invalid/msg-1' });
  assert.deepEqual([j.status, j.new, j.links, j.waiting], ['logged', true, 3, 1]);
  assert.deepEqual([w.sim.fn.email_in(log.key, { external_id: 'msg-1', subject: 'Again' }).new, w.rows.coach_emails.length], [false, 1]);
  assert.deepEqual([w.sim.fn.email_in('log.nobody.00000000', { subject: 'x' }).status, w.sim.fn.email_in(log.key, []).status], ['unknown', 'unreadable']);
  const email = w.rows.coach_emails[0];
  assert.deepEqual([email.direction, email.subject, email.source, email.hidden, w.rows.coach_email_bodies.length], ['out', 'Leadership Accelerator proposal', 'copy_in', false, 1]);
  assert.equal(w.rows.coach_email_links.map((l) => l.person_kind).sort().join(','), 'client,lead,network');
  assert.equal(w.rows.coach_email_waiting.map((x) => `${x.name} ${x.email} ${x.status}`).join(','), 'Sarah Kent sarah@example.invalid waiting');
  assert.equal(w.rows.coach_lead_events.filter((e) => e.kind === 'email' && e.data.email_id === email.id).length, 1);
  assert.deepEqual([w.rows.coach_leads[0].last_contact_on, w.rows.client_profiles[0].last_contact_on], ['2026-11-12', '2026-11-12']);
  // The to-do address makes one to-do an email, saying where it came from.
  const t = w.sim.fn.email_in(todo.key, { external_id: 'fwd-1', from: { name: 'Elena Ruiz', email: 'elena@example.invalid' }, subject: 'Fwd: Speaking at the spring summit', snippet: 'Would you speak in April?', sent_at: '2026-11-18T08:00:00Z' });
  assert.deepEqual([t.status, t.new, w.sim.fn.email_in(todo.key, { external_id: 'fwd-1', subject: 'Fwd: Speaking at the spring summit' }).new], ['todo', true, false]);
  assert.deepEqual(w.rows.coach_todos.map((x) => `${x.title} | ${x.from_email_sender} | ${x.from_email_subject}`), ['Speaking at the spring summit | Elena Ruiz | Fwd: Speaking at the spring summit']);
  // Not now is remembered: the same address isn't asked about again.
  w.save('coach_email_waiting', { id: w.rows.coach_email_waiting[0].id, status: 'dismissed', decided_at: NOW.toISOString() });
  assert.equal(w.sim.fn.coach_email_add({ external_id: 'g-2', source: 'gmail', direction: 'in', from: { name: 'Sarah Kent', email: 'sarah@example.invalid' }, to: [], subject: 'Re: hello' }).waiting, 0);
  assert.deepEqual([w.rows.coach_email_waiting.length, w.rows.coach_emails.filter((e) => e.source === 'gmail').length], [1, 1]);
});

test('the account map: Who’s who takes buyer, HR and participant; a deal’s kind, status and value are checked (8a, 8b)', () => {
  const w = world();
  assert.equal(w.tryTo('organisation_contacts', { id: 'jo', organisation_id: 'org', name: 'Jo Mensah', roles: ['hr', 'buyer'] }), 'ok');
  assert.equal(w.tryTo('organisation_contacts', { id: 'x', organisation_id: 'org', name: 'Someone', roles: ['boss'] }), '23514');
  assert.equal(w.tryTo('organisation_deals', { id: 'd1', organisation_id: 'org', name: 'Team workshops', kind: 'proposal', status: 'sent', value: 5640, per: 'once', opens: 2 }), 'ok');
  assert.equal(w.tryTo('organisation_deals', { id: 'd2', organisation_id: 'org', name: 'x', status: 'maybe' }), '23514');
  assert.equal(w.tryTo('organisation_deals', { id: 'd3', organisation_id: 'org', name: 'x', per: 'week' }), '23514');
  assert.equal(world({ role: 'associate' }).tryTo('organisation_deals', { id: 'd4', organisation_id: 'org', name: 'Mine' }), '42501');
});

test('Network: the worked-out columns, a rating’s dated history, and the counts the table sorts by (9e, 9f, 9h, 9j, 9k)', () => {
  const w = world();
  const dan = w.save('network_people', { id: 'dan', coach_id: ME, name: 'Dan Reid', influence: 6, trust: 9, value_delivery: 7, what_you_get: 8, rhythm_months: 3, last_spoke_on: '2026-08-17', given_count: 99 });
  assert.deepEqual([dan.focus, dan.due_on, dan.given_count, w.rows.network_ratings.length], ['keep_close', '2026-11-17', 0, 4]);
  w.save('network_people', { id: 'dan', trust: 8 });
  w.save('network_people', { id: 'dan', trust: 10, role: 'Sponsor' });
  assert.deepEqual([w.rows.network_ratings.length, w.rows.network_ratings.find((r) => r.rating === 'trust').value], [4, 10]);
  assert.equal(w.tryTo('network_people', { id: 'x', coach_id: ME, name: 'x', trust: 11 }), '23514');
  assert.equal(w.tryTo('network_people', { id: 'dan', rhythm_months: 25 }), '23514');
  for (const [i, direction, kind] of [[1, 'gave', 'idea'], [2, 'gave', 'introduction'], [3, 'asked', 'referral']]) w.save('network_gives', { id: `g${i}`, person_id: 'dan', coach_id: ME, direction, kind });
  assert.deepEqual([dan.given_count, dan.asked_count], [2, 1]);
  assert.equal(w.tryTo('network_gives', { id: 'g4', person_id: 'dan', coach_id: ME, direction: 'gave', kind: 'referral' }), '23514');
  assert.equal(w.tryTo('network_gives', { id: 'g5', person_id: 'dan', coach_id: ME, direction: 'asked', kind: 'idea' }), '23514');
  assert.equal(w.save('network_people', { id: 'dan', given_count: 99, asked_count: 99 }).given_count, 2);
  w.sim.remove('network_gives', [w.rows.network_gives.find((g) => g.id === 'g2')]);
  assert.deepEqual([dan.given_count, dan.asked_count], [1, 1]);
  w.save('network_columns', { id: 'col', coach_id: ME, name: 'Sector' });
  assert.equal(w.tryTo('network_columns', { id: 'col2', coach_id: ME, name: ' sector ' }), '23505');
});

test('Network, a page at a time, with M11’s people: Due now most overdue first, and the counts (9l, 9q, network_counts)', () => {
  const w = world({ rows: networkSeed() });
  const today = w.sim.fn.network_counts({});
  assert.deepEqual([today.active, today.archived], [18, 2]);
  const page = w.sim.fn.network_page({ p_sort: 'due', p_only: { due: 'now' }, p_today: TODAY });
  assert.deepEqual(page.rows.map((p) => `${p.name} ${p.due_on}`).slice(0, 4), ['Sofia Marsh 2026-11-10', 'Dana Whitfield 2026-11-12', 'Hannah Wells 2026-11-14', 'Erin Banks 2026-11-16']);
  assert.deepEqual([page.total, today.due, today.ready], [9, 9, 3]);
  assert.equal(w.sim.fn.network_page({ p_search: 'northfield' }).total, 3);
  assert.equal(w.sim.fn.network_page({ p_archived: true }).total, 2);
  assert.deepEqual(networkCounts(w.rows.network_people, TODAY), { active: 18, archived: 2, due: 9, ready: 3 });
  assert.equal(w.rows.network_people.find((p) => p.id === CRM.dan).given_count, 1);
  assert.equal(w.rows.network_people.find((p) => p.id === CRM.david).focus, 'invest');
});

test('"Archive 2" keeps the unticked one for good; Undo and Restore put them back (9s, 9t)', () => {
  const w = world({ rows: networkSeed() });
  const ready = w.sim.fn.network_page({ p_only: { ready: true }, p_today: TODAY }).rows;
  assert.equal(ready.map((p) => p.name).join(','), 'Bea Reeves,Daniel Vance,Zara Nash');
  assert.equal(w.sim.fn.network_archive([CRM.beaR, CRM.danielV], [CRM.zaraN]), 2);
  assert.deepEqual(w.sim.fn.network_counts({ p_today: TODAY }), { active: 16, archived: 4, due: 9, ready: 0 });
  assert.equal(w.sim.fn.network_restore([CRM.beaR]), 1);
  assert.equal(w.sim.fn.network_counts({ p_today: TODAY }).ready, 1);
  assert.equal(w.sim.fn.network_restore([CRM.danielV], [CRM.zaraN]), 1);
  assert.deepEqual(w.sim.fn.network_counts({ p_today: TODAY }), { active: 18, archived: 2, due: 9, ready: 3 });
  assert.equal(w.sim.fn.network_restore([CRM.beaR]), 0);
});

test('two people merge into one, and Undo puts both back exactly, once (9v, 9w)', () => {
  const w = world({ rows: networkSeed() });
  w.save('network_people', { id: 'dup', coach_id: ME, name: 'Daniel Reid', organisation: 'Harbour Lane Partners', email: 'dan.reid@example.invalid', phone: '07700 900999', influence: 5 });
  w.save('network_gives', { id: 'ask', person_id: 'dup', coach_id: ME, direction: 'asked', kind: 'advice' });
  w.save('coach_leads', { id: 'amy', coach_id: ME, name: 'Amy Cole', source: 'referral', referred_by_person: 'dup', network_person_id: 'dup' });
  const dan = w.rows.network_people.find((p) => p.id === CRM.dan);
  const merge = w.sim.fn.network_merge(CRM.dan, 'dup', { organisation: true });
  assert.deepEqual([dan.name, dan.organisation, dan.phone, dan.influence, dan.given_count, dan.asked_count], ['Dan Reid', 'Harbour Lane Partners', '07700 900141', 6, 1, 2]);
  assert.deepEqual([w.rows.network_people.find((p) => p.id === 'dup').merged_into, w.rows.coach_leads[0].referred_by_person, w.rows.coach_leads[0].network_person_id], [CRM.dan, CRM.dan, CRM.dan]);
  assert.equal(w.sim.fn.network_page({ p_search: 'reid' }).total, 1);
  assert.equal(codeOf(() => w.sim.fn.network_merge(CRM.sofia, 'dup')), '22023');
  w.sim.fn.network_unmerge(merge);
  const back = w.rows.network_people.find((p) => p.id === CRM.dan);
  const dup = w.rows.network_people.find((p) => p.id === 'dup');
  assert.deepEqual([back.organisation, back.given_count, back.asked_count, dup.merged_into, dup.asked_count, w.rows.coach_leads[0].referred_by_person], ['Harbour Lane', 1, 1, null, 1, 'dup']);
  assert.equal(codeOf(() => w.sim.fn.network_unmerge(merge)), '22023');
});

test('import: duplicates first, then everyone in one go; a rating outside 0 to 10 refuses the import (9y, 9z)', () => {
  const w = world({ rows: networkSeed() });
  assert.deepEqual(w.sim.fn.network_duplicates([{ name: 'Brand New' }, { name: 'dan reid' }, { name: 'x', email: 'SOFIA.MARSH@example.invalid' }]).map((d) => `${d.index} ${d.name} ${d.by}`), ['1 Dan Reid name', '2 Sofia Marsh email']);
  assert.equal(w.sim.fn.network_import([{ name: ' Brand New ', email: 'Brand.New@Example.invalid', trust: 8, rhythm_months: 3, last_spoke_on: '2026-10-01' }, { name: 'Rated Fully', influence: 9, trust: 9, value_delivery: 9, what_you_get: 2 }, { name: '  ' }]).added, 2);
  const added = w.rows.network_people.find((p) => p.name === 'Brand New');
  assert.deepEqual([added.email, added.focus, added.due_on, w.rows.network_people.find((p) => p.name === 'Rated Fully').focus], ['brand.new@example.invalid', null, '2027-01-01', 'maintain']);
  assert.equal(codeOf(() => w.sim.fn.network_import([{ name: 'Too keen', trust: 12 }])), '23514');
  assert.equal(codeOf(() => w.sim.fn.network_import({ name: 'Not a list' })), '22023');
});

test('the seed is one the database would take: every row passes 052’s checks, and the generators are steady', () => {
  const seed = seedWithCrm();
  const w = world();
  // Parents first, as the database needs them.
  w.rows.client_profiles.push(...seed.client_profiles);
  w.rows.organisation_contacts.push(...(seed.organisation_contacts || []));
  const order = ['coach_lead_stages', 'network_people', 'network_gives', 'network_columns', 'coach_leads', 'coach_lead_events', 'coach_automations', 'coach_automation_runs', 'coach_boards',
    'coach_board_stages', 'coach_board_items', 'coach_emails', 'coach_email_links', 'coach_email_waiting', 'client_check_ins', 'organisation_deals', 'organisation_growth', 'organisation_contacts'];
  for (const table of order) for (const row of seed[table] || []) assert.equal(w.tryTo(table, table === 'organisation_contacts' ? { ...row, id: `${row.id}-again` } : row), 'ok', `${table}: ${row.name || row.title || row.id}`);
  assert.equal(w.rows.coach_leads.length, 11);
  // M11's board: the stages' leads and the two with a value in Proposal sent (£31,500).
  const inStage = (id) => w.rows.coach_leads.filter((l) => l.stage_id === id && !l.cold_at && !l.merged_into);
  assert.equal(inStage(CRM.stProp).reduce((sum, l) => sum + (l.value || 0), 0), 31500);
  assert.deepEqual([inStage(CRM.stCall).length, inStage(CRM.stDeciding).length, inStage(CRM.stWon).length], [2, 1, 1]);
  for (const table of ['network_people', 'coach_leads']) for (const row of table === 'network_people' ? manyNetwork(1200) : manyLeads(300)) assert.equal(w.tryTo(table, row), 'ok', `${table}: ${row.name}`);
  const many = manyNetwork(1200);
  assert.deepEqual([many.length, new Set(many.map((p) => p.id)).size, new Set(many.map((p) => p.email)).size], [1200, 1200, 1200]);
  assert.deepEqual(networkCounts(many, TODAY), { active: 1164, archived: 36, due: 30, ready: 36 });
  assert.deepEqual(networkCounts(manyNetwork(5000), TODAY), { active: 4850, archived: 150, due: 125, ready: 150 });
  assert.deepEqual(manyNetwork(1200)[77], many[77]);
  assert.ok(many.filter((p) => !p.archived_at).some((p) => focusOf(p) === 'keep_close') && many.some((p) => focusOf(p) === 'rebalance'));
  assert.equal(manyLeads(300).filter((l) => l.cold_at).length, 30);
  assert.equal(networkDeviceSeed().people.length, 20);
  assert.ok(CRM_FUNCTIONS.includes('network_page') && CRM_HOOKED.includes('coach_leads'));
});
