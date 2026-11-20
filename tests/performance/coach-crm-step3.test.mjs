// Step 3's own rules in src/lib/coach/crm.js (Phase 6a run 4): an
// automation that would loop is refused when it is saved or switched on;
// the events asked about when the portal opens; Edit this board saved in
// one go; a card saved from its panel; an email logged on the device as
// the database logs it; a to-do from a forwarded email; emails on a
// client's or a contact's timeline; the check-ins still to suggest; an
// agreement or proposal as typed; Room to grow in one list.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as crm from '../../src/lib/coach/crm.js';

const TODAY = '2026-11-17';
const NOW = '2026-11-17T10:00:00.000Z';
const ME = 'coach-1';
let n = 0;
const newId = () => { n += 1; return `id-${n}`; };
const STAGES = [
  { id: 's-new', coach_id: ME, name: 'New', likelihood: 10, position: 0, is_won: false },
  { id: 's-prop', coach_id: ME, name: 'Proposal sent', likelihood: 50, position: 2, is_won: false },
  { id: 's-dec', coach_id: ME, name: 'Deciding', likelihood: 70, position: 3, is_won: false },
  { id: 's-won', coach_id: ME, name: 'Won', likelihood: 100, position: crm.WON_POSITION, is_won: true },
];
const auto = (id, extra) => ({ id, coach_id: ME, trigger: 'lead_stage', trigger_stage_id: 's-prop', trigger_count: null, call_type_key: null, action: 'todo', todo_title: 'Follow up', todo_days: 3, to_stage_id: null, active: true, position: 0, ...extra });
const lead = (id, name, extra = {}) => ({ id, coach_id: ME, name, email: null, stage_id: 's-new', last_contact_on: null, booking_id: null, call_type_key: null, next_step_on: null, cold_at: null, won_at: null, merged_into: null, created_at: '2026-10-01T09:00:00.000Z', ...extra });

test('an automation that would send a lead round in a circle is refused when saved and when switched on; nothing else is', () => {
  const toDeciding = auto('a', { action: 'stage', to_stage_id: 's-dec', todo_title: null, todo_days: null });
  const back = auto('b', { trigger_stage_id: 's-dec', action: 'stage', to_stage_id: 's-prop', todo_title: null, todo_days: null });
  assert.equal(crm.automationLoop(back, [toDeciding], STAGES), 'That would send a lead round in a circle: another automation moves it back to Deciding. Choose another stage.');
  assert.deepEqual(crm.automationSavePlan(back, { automations: [toDeciding], stages: STAGES }), { error: 'That would send a lead round in a circle: another automation moves it back to Deciding. Choose another stage.' });
  // A longer circle: New to Proposal sent, Proposal sent to Deciding, Deciding to New.
  const a1 = auto('1', { trigger_stage_id: 's-new', action: 'stage', to_stage_id: 's-prop' });
  const a3 = auto('3', { trigger_stage_id: 's-dec', action: 'stage', to_stage_id: 's-new' });
  assert.match(crm.automationLoop(a3, [a1, toDeciding], STAGES), /round in a circle/);
  // The other one switched off: no circle now, so it saves; switching the other back on is then refused.
  const off = { ...toDeciding, active: false };
  assert.equal(crm.automationSavePlan(back, { automations: [off], stages: STAGES }).toast, 'Added');
  assert.match(crm.automationSwitch(off, true, { automations: [back], stages: STAGES }).error, /round in a circle/);
  assert.deepEqual(crm.automationSwitch(toDeciding, false, { automations: [back], stages: STAGES }).toast, 'Switched off');
  // A to-do never loops; an edit keeps its place; a new one goes last.
  assert.equal(crm.automationLoop(auto('t'), [toDeciding, back], STAGES), '');
  assert.equal(crm.automationSavePlan(auto('t', { todo_title: '  ' }), { automations: [], stages: STAGES }).error, 'Type the to-do to carry on.');
  const made = crm.automationSavePlan(auto('new', { position: 0 }), { automations: [auto('x', { position: 4 })], stages: STAGES });
  assert.deepEqual([made.automation.position, made.toast], [5, 'Added']);
  assert.equal(crm.automationSavePlan(auto('x', { position: 4, todo_title: 'Call' }), { automations: [auto('x', { position: 4 })], stages: STAGES }).toast, 'Saved');
  assert.deepEqual(crm.countChoices('proposal_opened').map((c) => c.label), ['Once', '2 times', '3 times', '5 times']);
  assert.deepEqual(crm.countChoices('lead_quiet').map((c) => c.label), ['7 days', '14 days', '21 days', '30 days']);
  assert.deepEqual(crm.countChoices('lead_won'), []);
});

test('when the portal opens: quiet leads, proposals opened, and calls booked that are still to come', () => {
  const leads = [
    lead('tom', 'Tom Hale', { stage_id: 's-dec', last_contact_on: '2026-10-29' }),
    lead('amy', 'Amy Cole', { stage_id: 's-prop', last_contact_on: TODAY }),
    lead('ruth', 'Ruth Adeyemi', { last_contact_on: '2026-11-15', booking_id: 'bk-1', call_type_key: 'chemistry' }),
    lead('old', 'Old Booking', { last_contact_on: '2026-11-16', booking_id: 'bk-2', call_type_key: 'chemistry' }),
    lead('gone', 'Cancelled', { last_contact_on: '2026-11-16', booking_id: 'bk-3' }),
    lead('cold', 'Cold One', { last_contact_on: '2026-09-01', cold_at: NOW }),
  ];
  const events = [1, 2, 3].map((i) => ({ id: `e${i}`, lead_id: 'amy', kind: 'proposal_opened', data: { name: 'Leadership Accelerator' } }));
  const bookings = [{ id: 'bk-1', status: 'booked', starts_at: '2026-11-19T13:00:00.000Z' }, { id: 'bk-2', status: 'booked', starts_at: '2026-11-10T13:00:00.000Z' }, { id: 'bk-3', status: 'cancelled', starts_at: '2026-11-20T13:00:00.000Z' }];
  const out = crm.openingEvents({ leads, stages: STAGES, events, bookings, todayKey: TODAY });
  assert.deepEqual(out.filter((e) => e.trigger === 'lead_quiet' && e.count >= 14).map((e) => [e.leadId, e.count]), [['tom', 19]]);
  assert.deepEqual(out.filter((e) => e.trigger === 'proposal_opened').map((e) => [e.leadId, e.count, e.key]), [['amy', 3, 'opened:amy:leadership accelerator']]);
  assert.deepEqual(out.filter((e) => e.trigger === 'call_booked').map((e) => [e.leadId, e.key, e.callTypeKey, e.day]), [['ruth', 'booking:bk-1', 'chemistry', '2026-11-19']]);
  assert.ok(!out.some((e) => e.leadId === 'cold'));
});

const BOARD = { id: 'b1', coach_id: ME, name: 'Speaking', shared: false, archived_at: null, position: 0, columns: [{ id: 'date', name: 'Date', kind: 'date' }, { id: 'fee', name: 'Fee', kind: 'money' }, { id: 'aud', name: 'Audience', kind: 'text' }] };
const BSTAGES = ['Ideas', 'Pitched', 'Confirmed', 'Done'].map((name, i) => ({ id: `st${i}`, board_id: 'b1', coach_id: ME, name, position: i }));
const CARDS = [
  { id: 'c1', board_id: 'b1', coach_id: ME, stage_id: 'st0', title: 'League Managers Association', field_values: { aud: 'Head coaches' }, notes: null, position: 0 },
  { id: 'c2', board_id: 'b1', coach_id: ME, stage_id: 'st1', title: 'CIPD Festival of Work', field_values: { date: '2027-06-10', fee: 4500, aud: '800 HR leaders' }, notes: null, position: 0 },
  { id: 'c3', board_id: 'b1', coach_id: ME, stage_id: 'st1', title: 'Henley alumni', field_values: { fee: 3000 }, notes: null, position: 1 },
];

test('Edit this board is saved in one go: renamed, a stage added and one taken out with its cards moved, a field taken out, shared, with Undo', () => {
  const draft = crm.boardDraft(BOARD, BSTAGES);
  assert.deepEqual(crm.boardSavePlan(BOARD, BSTAGES, CARDS, draft, { coachId: ME, boards: [BOARD] }), { same: true });
  const next = { ...draft, name: 'Talks', shared: true,
    stages: [...draft.stages.map((s) => (s.id === 'st1' ? { ...s, removed: true } : s.id === 'st3' ? { ...s, name: 'Delivered' } : s)), { id: 'st-new', name: 'Paid', removed: false }],
    columns: draft.columns.map((c) => (c.id === 'aud' ? { ...c, removed: true } : c)) };
  const plan = crm.boardSavePlan(BOARD, BSTAGES, CARDS, next, { coachId: ME, boards: [BOARD] });
  assert.deepEqual([plan.board.name, plan.board.shared, plan.board.columns.map((c) => c.name)], ['Talks', true, ['Date', 'Fee']]);
  // The stages left are numbered again; only the ones that changed are saved.
  assert.deepEqual(plan.stages.map((s) => [s.id, s.name, s.position]), [['st2', 'Confirmed', 1], ['st3', 'Delivered', 2], ['st-new', 'Paid', 3]]);
  assert.deepEqual(plan.removeStages, ['st1']);
  // Pitched's two cards go to Ideas (the stage before it), after the card already there, in their order.
  assert.deepEqual(plan.items.map((c) => [c.id, c.stage_id, c.position]), [['c2', 'st0', 1], ['c3', 'st0', 2]]);
  // Undo: the board as it was, Pitched back, the cards where they were, the new stage gone.
  assert.deepEqual([plan.undo.board, plan.undo.stages.map((s) => [s.id, s.name, s.position]), plan.undo.items.map((c) => [c.id, c.stage_id]), plan.undo.removeStages],
    [BOARD, [['st1', 'Pitched', 1], ['st2', 'Confirmed', 2], ['st3', 'Done', 3]], [['c2', 'st1'], ['c3', 'st1']], ['st-new']]);
  // The first stage taken out hands its cards to the first stage kept.
  const first = crm.boardSavePlan(BOARD, BSTAGES, CARDS, { ...draft, stages: draft.stages.map((s) => (s.id === 'st0' ? { ...s, removed: true } : s)) }, { coachId: ME, boards: [BOARD] });
  assert.deepEqual(first.items.map((c) => [c.id, c.stage_id, c.position]), [['c1', 'st1', 2]]);
  // What stops it, calmly.
  const stop = (change) => crm.boardSavePlan(BOARD, BSTAGES, CARDS, { ...draft, ...change }, { coachId: ME, boards: [BOARD, { id: 'b2', name: 'Partners' }] }).error;
  assert.equal(stop({ name: ' ' }), 'Type the board’s name to carry on.');
  assert.equal(stop({ name: 'partners' }), 'There’s already a board called Partners. Choose another name.');
  assert.equal(stop({ stages: draft.stages.map((s) => ({ ...s, removed: true })) }), 'A board needs at least one stage.');
  assert.equal(stop({ stages: [...draft.stages, { id: 'x', name: '', removed: false }] }), 'Type each stage’s name to carry on.');
  assert.equal(stop({ stages: [...draft.stages, { id: 'x', name: 'ideas', removed: false }] }), 'There are two stages called Ideas. Rename one to carry on.');
  assert.equal(stop({ columns: [...draft.columns, { id: 'y', name: 'fee', kind: 'text', removed: false }] }), 'There are two fields called Fee. Rename one to carry on.');
  // Delete sets the board aside, so Undo brings it back whole.
  const gone = crm.boardDeletePlan(BOARD, NOW);
  assert.deepEqual([gone.board.archived_at, gone.undo, gone.toast], [NOW, BOARD, 'Deleted']);
  assert.deepEqual(crm.boardsFor([gone.board], { isOwner: true }), []);
});

test('a card is saved from its panel and from the table; the arrow keys know the stage beside; search finds boards', () => {
  const typed = crm.boardItemDraft(BOARD, CARDS[1], TODAY);
  assert.deepEqual(typed, { title: 'CIPD Festival of Work', stageId: 'st1', notes: '', fields: { date: '2027-06-10', fee: '£4,500', aud: '800 HR leaders' } });
  const saved = crm.boardItemFromTyped(BOARD, CARDS[1], { ...typed, title: ' CIPD Festival ', stageId: 'st2', notes: ' Ask Jo. ', fields: { date: '2027-06-11', fee: '5k', aud: '' } }, { todayKey: TODAY, stages: BSTAGES, items: CARDS });
  assert.deepEqual([saved.item.title, saved.item.stage_id, saved.item.position, saved.item.notes, saved.item.field_values], ['CIPD Festival', 'st2', 0, 'Ask Jo.', { date: '2027-06-11', fee: 5000 }]);
  assert.deepEqual(crm.boardItemFromTyped(BOARD, CARDS[1], { ...typed, title: '' }, { todayKey: TODAY, stages: BSTAGES, items: CARDS }), { error: 'Type the card’s name to carry on.', at: 'title' });
  assert.deepEqual(crm.boardItemFromTyped(BOARD, CARDS[1], { ...typed, fields: { ...typed.fields, fee: 'lots' } }, { todayKey: TODAY, stages: BSTAGES, items: CARDS }), { error: crm.NEEDS_AMOUNT, at: 'fee' });
  assert.equal(crm.boardItemFromTyped(BOARD, CARDS[1], { ...typed, fields: { ...typed.fields, date: '30 Feb' } }, { todayKey: TODAY, stages: BSTAGES, items: CARDS }).at, 'date');
  assert.deepEqual(crm.boardCellChange(BOARD, CARDS[0], 'fee', '£2,000', TODAY).item.field_values, { aud: 'Head coaches', fee: 2000 });
  assert.deepEqual(crm.boardCellChange(BOARD, CARDS[0], 'aud', '', TODAY).item.field_values, {});
  assert.equal(crm.boardCellChange(BOARD, CARDS[0], 'fee', 'soon', TODAY).error, crm.NEEDS_AMOUNT);
  assert.equal(crm.boardCellChange(BOARD, CARDS[0], 'gone', 'x', TODAY).error, 'That field isn’t on this board any more.');
  assert.deepEqual([crm.boardStageBeside(BSTAGES, 'b1', 'st0', -1), crm.boardStageBeside(BSTAGES, 'b1', 'st0', 1).id, crm.boardStageBeside(BSTAGES, 'b1', 'st3', 1)], [null, 'st1', null]);
  const boards = [BOARD, { ...BOARD, id: 'b2', name: 'Partners', shared: true, position: 1 }];
  assert.deepEqual(crm.boardSearchItems(boards, { isOwner: true }).map((i) => [i.title, i.kind, i.to]), [['Speaking', 'Board', '/coach/boards/b1'], ['Partners', 'Board', '/coach/boards/b2']]);
  assert.deepEqual(crm.boardSearchItems(boards, { isOwner: false }).map((i) => i.title), ['Partners']);
});

test('an email is logged on the device as the database logs it: once, on the right timelines, with anyone new waiting', () => {
  const amy = lead('amy', 'Amy Cole', { email: 'amy@example.invalid', last_contact_on: '2026-11-10' });
  const sam = { id: 'p-sam', coach_id: ME, name: 'Sam Okafor', email: 'sam@example.invalid', last_contact_on: '2026-11-01', merged_into: null };
  const jo = { id: 'oc-jo', organisation_id: 'org-k', name: 'Jo Mensah', email: 'jo@example.invalid' };
  const email = { external_id: 'm-1', source: 'copy_in', direction: 'out', from: { name: 'Alex Morgan', email: 'Alex@Example.invalid' },
    to: [{ name: 'Amy Cole', email: 'AMY@example.invalid' }, { name: 'Sam Okafor', email: 'sam@example.invalid' }, { name: 'Sarah Kent', email: 'sarah@example.invalid' }, { email: 'log.alex.7kx2m4qa@in.example.invalid' }],
    cc: [{ name: 'Jo Mensah', email: 'jo@example.invalid' }, { name: 'Dan Reid', email: 'dan@example.invalid' }, { name: 'Copied Only', email: 'cc@example.invalid' }],
    subject: 'Dates for January', body: 'Here are the dates.\n\nAlex', sent_at: '2026-11-17T08:40:00.000Z', thread_key: 't-1', link: 'http://not-https.example' };
  const who = { coachId: ME, newId, nowIso: NOW, emails: [], leads: [amy], clients: [sam], network: [{ id: 'np-dan', email: 'dan@example.invalid' }], contacts: [jo], own: ['alex@example.invalid'], keys: ['log.alex.7kx2m4qa'], waiting: [] };
  const plan = crm.emailLogPlan(email, { id: 'em-1', ...who });
  assert.equal(plan.new, true);
  assert.deepEqual([plan.email.direction, plan.email.from_email, plan.email.subject, plan.email.snippet, plan.email.source, plan.email.external_id, plan.email.link, plan.email.hidden], ['out', 'alex@example.invalid', 'Dates for January', 'Here are the dates. Alex', 'copy_in', 'm-1', null, false]);
  assert.deepEqual(plan.links.map((l) => [l.person_kind, l.person_id, l.email_id]), [['lead', 'amy', 'em-1'], ['client', 'p-sam', 'em-1'], ['contact', 'oc-jo', 'em-1'], ['network', 'np-dan', 'em-1']]);
  // Only someone on the From or To line who is nobody yet waits; the coach's own address and the copy-in address are nobody.
  assert.deepEqual(plan.waiting.map((w) => [w.name, w.email, w.status, w.email_id]), [['Sarah Kent', 'sarah@example.invalid', 'waiting', 'em-1']]);
  // The lead gets its line and its last contact moved forward; the client's last contact moves too.
  assert.deepEqual(plan.events.map((e) => [e.lead_id, e.kind, e.title, e.happened_on, e.data]), [['amy', 'email', 'Dates for January', TODAY, { email_id: 'em-1', direction: 'out' }]]);
  assert.deepEqual([plan.leads.map((l) => [l.id, l.last_contact_on]), plan.clients.map((c) => [c.id, c.last_contact_on])], [[['amy', TODAY]], [['p-sam', TODAY]]]);
  assert.equal(plan.body, 'Here are the dates.\n\nAlex');
  // The same email again is kept once; "Not now" for an address is remembered.
  assert.deepEqual(crm.emailLogPlan(email, { id: 'em-2', ...who, emails: [plan.email] }), { new: false, emailId: 'em-1' });
  assert.deepEqual(crm.emailLogPlan({ ...email, external_id: 'm-2' }, { id: 'em-3', ...who, waiting: [{ email: 'sarah@example.invalid', status: 'dismissed' }] }).waiting, []);
});

test('an email forwarded to the to-do address makes one to-do; its line under Attachments says where it came from', () => {
  const email = { external_id: 'f-1', from: { name: 'Ruth Adams', email: 'ruth@example.invalid' }, subject: 'Fwd: FW: Reply to Ruth about the January start', snippet: 'Can we start in January?', sent_at: '2026-11-17T07:10:00.000Z' };
  const made = crm.todoFromEmail(email, { id: 't-1', coachId: ME, todos: [], nowIso: NOW });
  assert.deepEqual([made.todo.title, made.todo.notes, made.todo.from_email_ref, made.todo.from_email_sender, made.todo.from_email_subject, made.todo.from_email_at, made.todo.lead_id, made.todo.someday, made.todo.coach_id],
    ['Reply to Ruth about the January start', 'Can we start in January?', 'f-1', 'Ruth Adams', 'Fwd: FW: Reply to Ruth about the January start', '2026-11-17T07:10:00.000Z', null, true, ME]);
  assert.deepEqual(crm.todoFromEmail(email, { id: 't-2', coachId: ME, todos: [made.todo], nowIso: NOW }), { existing: made.todo });
  assert.equal(crm.todoFromEmail({ from: { name: 'Ruth Adams' } }, { id: 't-3', coachId: ME, nowIso: NOW }).todo.title, 'An email from Ruth Adams');
  assert.deepEqual(crm.todoEmailLine(made.todo, []), { title: 'Email from Ruth Adams', small: 'Forwarded by email', email: null });
  const kept = { id: 'em-9', external_id: 'f-1', source: 'gmail' };
  assert.deepEqual(crm.todoEmailLine(made.todo, [kept]), { title: 'Email from Ruth Adams', small: 'Forwarded from Gmail', email: kept });
  assert.equal(crm.todoEmailLine({ title: 'Plain' }, []), null);
});

test('emails on a client’s or a contact’s timeline, newest first, with a hidden thread left out; a contact’s last touch counts them', () => {
  const emails = [
    { id: 'e1', direction: 'in', from_name: 'Sam Okafor', subject: 'Re: Board pack', sent_at: '2026-11-17T08:40:00', hidden: false },
    { id: 'e2', direction: 'out', subject: 'Board pack', sent_at: '2026-11-12T09:00:00', hidden: false },
    { id: 'e3', direction: 'out', subject: 'Hidden', sent_at: '2026-11-13T09:00:00', hidden: true },
    { id: 'e4', direction: 'out', subject: 'Invoice', sent_at: '2026-11-06T09:00:00', hidden: false },
  ];
  const links = [['e1', 'client', 'p-sam'], ['e2', 'client', 'p-sam'], ['e3', 'client', 'p-sam'], ['e4', 'contact', 'oc-lee'], ['e2', 'lead', 'amy']].map(([email_id, person_kind, person_id]) => ({ email_id, person_kind, person_id }));
  assert.deepEqual(crm.emailsOn(emails, links, 'client', 'p-sam', TODAY, { name: 'Sam Okafor' }).map((r) => [r.when, r.title, r.tag, r.emailId]),
    [['Today, 08:40', 'Sam replied: Board pack', 'Email', 'e1'], ['Thu 12 Nov', 'You emailed: Board pack', 'Email', 'e2']]);
  assert.deepEqual(crm.emailsOn(emails, links, 'contact', 'nobody', TODAY), []);
  const lee = { id: 'oc-lee', last_contact_on: '2026-10-12', last_contact_how: 'spoke' };
  assert.equal(crm.contactLast(lee, emails, links, TODAY), 'Emailed Fri 6 Nov');
  assert.equal(crm.contactLast({ ...lee, last_contact_on: '2026-11-10' }, emails, links, TODAY), 'Spoke Tue 10 Nov');
  assert.equal(crm.contactLast({ id: 'oc-new' }, emails, links, TODAY), '');
});

test('check-ins still to suggest: only for past clients, only the ones not there and not passed; an ask goes in and comes out of the note', () => {
  const ben = { id: 'ben', name: 'Ben Ortiz', status: 'past', ended_on: '2026-08-18' };
  const leah = { id: 'leah', name: 'Leah Moran', status: 'past', ended_on: '2025-11-23' };
  const sam = { id: 'sam', name: 'Sam Okafor', status: 'active', ended_on: null };
  const out = crm.checkInsToSuggest([ben, leah, sam], { coachId: ME, newId, existing: [{ profile_id: 'ben', months: 6 }], todayKey: TODAY });
  // Ben: 3 months (18 Nov) and 12 months; his 6-month one is there already. Leah: only her 12-month one is still to come.
  assert.deepEqual(out.map((c) => [c.profile_id, c.months, c.due_on]), [['ben', 3, '2026-11-18'], ['ben', 12, '2027-08-18'], ['leah', 12, '2026-11-23']]);
  const note = crm.checkInNote(ben, { months: 3, ask: null }, { coachFirstName: 'Alex' });
  const asked = crm.checkInAsk(note, 'testimonial', true);
  assert.ok(asked.body.includes('If you’d be happy to say a few words about our work together, I’d be grateful.'));
  assert.ok(asked.body.endsWith('\n\nAlex'));
  assert.equal(crm.checkInAsk(asked, 'testimonial', true).body, asked.body);
  assert.equal(crm.checkInAsk(asked, 'testimonial', false).body, note.body);
  assert.equal(crm.checkInAsk({ body: 'Hi Ben, how are you getting on these days? It has been a while.' }, 'referral', true).body, 'Hi Ben, how are you getting on these days? It has been a while.\n\nIf anyone you know is facing something similar, I’d be glad to be introduced.');
});

test('an agreement or proposal as typed; Room to grow in one list', () => {
  const made = crm.dealFromTyped({ name: ' Portal seats ', kind: 'agreement', status: 'active', value: '£640', per: 'month', renews: '2027-03-08', detail: '20 seats' }, { id: 'd1', organisationId: 'org-k', todayKey: TODAY });
  assert.deepEqual(made.deal, { opens: 0, lead_id: null, starts_on: null, currency: 'GBP', id: 'd1', organisation_id: 'org-k', name: 'Portal seats', kind: 'agreement', status: 'active', value: 640, per: 'month', detail: '20 seats', renews_on: '2027-03-08' });
  assert.deepEqual(crm.dealFromTyped({ name: '' }, { id: 'd', organisationId: 'o', todayKey: TODAY }), { error: 'Type its name to carry on.', at: 'name' });
  assert.deepEqual(crm.dealFromTyped({ name: 'x', value: 'lots' }, { id: 'd', organisationId: 'o', todayKey: TODAY }), { error: crm.NEEDS_AMOUNT, at: 'value' });
  assert.equal(crm.dealFromTyped({ name: 'x', renews: '30 Feb' }, { id: 'd', organisationId: 'o', todayKey: TODAY }).at, 'renews');
  // An edit keeps what the panel doesn't show (how often it was opened, its lead); a proposal with no status chosen is one that was sent.
  const edited = crm.dealFromTyped({ name: 'Team workshops', kind: 'proposal', status: 'nonsense', value: '' }, { id: 'd2', organisationId: 'org-k', before: { opens: 2, lead_id: 'l-1', created_by: 'u' }, todayKey: TODAY });
  assert.deepEqual([edited.deal.opens, edited.deal.lead_id, edited.deal.status, edited.deal.value, edited.deal.per], [2, 'l-1', 'sent', null, 'once']);
  const noted = [{ id: 'g1', kind: 'seats', title: '6 of 20 seats are free.' }];
  const worked = [{ key: 'seats', kind: 'seats', title: '5 of 20 seats are free.' }, { key: 'workshop', kind: 'workshop', title: 'No workshop is booked here.' }];
  assert.deepEqual(crm.growthLines(noted, worked).map((g) => g.title), ['6 of 20 seats are free.', 'No workshop is booked here.']);
  assert.deepEqual([crm.growthAction('seats'), crm.growthAction('renewal'), crm.growthAction('workshop'), crm.growthAction('anything')], ['Offer the seats', 'Plan a renewal', 'Add to the pipeline', 'Add to the pipeline']);
});
