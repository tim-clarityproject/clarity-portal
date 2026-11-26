// Leads and the CRM's rules (src/lib/coach/crm.js; Phase 6a run 4, M11 seq
// 77, migration 052): stages and their weighted values, Quiet, how ready a
// lead is in words, Won, Cold leads, import, merge with what Undo restores,
// export, the timeline, Referred by, automations (to-dos and stage moves
// only, and the loop guard), boards, whose timeline an email belongs on,
// past clients' check-ins and the account map. M11's own day is Tue 17 Nov
// 2026 for Leads.
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
  { id: 's-call', coach_id: ME, name: 'Call booked', likelihood: 25, position: 1, is_won: false },
  { id: 's-prop', coach_id: ME, name: 'Proposal sent', likelihood: 50, position: 2, is_won: false },
  { id: 's-dec', coach_id: ME, name: 'Deciding', likelihood: 70, position: 3, is_won: false },
  { id: 's-won', coach_id: ME, name: 'Won', likelihood: 100, position: crm.WON_POSITION, is_won: true },
];
const lead = (id, name, stageId, extra = {}) => ({ id, coach_id: ME, name, email: null, source: 'manual', stage_id: stageId, organisation: null, organisation_id: null, job_title: null, phone: null, value: null, currency: 'GBP',
  next_step: null, next_step_on: null, next_step_time: null, referred_by: null, referred_by_person: null, network_person_id: null, last_contact_on: null, want_outcome: null, want_pain: null, who_decides: null,
  who_funds: null, decide_when: null, won_at: null, won_profile_id: null, cold_at: null, cold_reason: null, cold_check_on: null, merged_into: null, notes: null, created_at: '2026-10-20T09:00:00.000Z', ...extra });
const AMY = lead('amy', 'Amy Cole', 's-prop', { email: 'amy@example.invalid', organisation: 'Northfield Logistics', organisation_id: 'org-n', value: 13500, next_step: 'Follow up on the proposal', next_step_on: '2026-11-19',
  last_contact_on: TODAY, referred_by: 'Hannah Wells', referred_by_person: 'np-hannah', source: 'referral', want_outcome: 'A team that owns its decisions.', want_pain: 'Every decision comes back to Amy.',
  who_decides: 'Amy, with the CEO.', who_funds: 'Northfield.' });
const CHRIS = lead('chris', 'Chris Lowe', 's-prop', { organisation: 'Kestrel Group', value: 18000, next_step: 'Send workshop dates', next_step_on: '2026-11-23', last_contact_on: '2026-11-11' });
const TOM = lead('tom', 'Tom Hale', 's-dec', { organisation: 'Brightwater Capital', value: 7500, next_step: 'Check in on the decision', next_step_on: '2026-11-13', last_contact_on: '2026-10-29',
  want_outcome: 'x', want_pain: 'x', who_decides: 'x', who_funds: 'x', decide_when: 'January.' });
const ELENA = lead('elena', 'Elena Ruiz', 's-new', { job_title: 'Founder', next_step: 'Reply to Elena’s email', next_step_on: TODAY, last_contact_on: '2026-11-16' });
const RUTH = lead('ruth', 'Ruth Adeyemi', 's-call', { email: 'ruth@example.invalid', organisation: 'Harbour City FC', next_step: 'Discovery call', next_step_on: '2026-11-18', next_step_time: '13:00:00', last_contact_on: '2026-11-15' });
const LEO = lead('leo', 'Leo Grant', 's-won', { organisation: 'Northfield Logistics', value: 13500, won_at: '2026-11-13T12:00:00.000Z', won_profile_id: 'p-leo', last_contact_on: '2026-11-13' });
const COLD = lead('cold', 'Priya Menon', 's-prop', { value: 9000, cold_at: '2026-10-18T09:00:00.000Z', cold_reason: 'No budget this year.', cold_check_on: '2027-01-16' });
const LEADS = [AMY, CHRIS, TOM, ELENA, RUTH, LEO, COLD];
const ctx = { stages: STAGES, todayKey: TODAY };

// ---------------------------------------------------------------- money

test('money is written the portal’s way, with rates closed up', () => {
  assert.equal(crm.moneyWords(13500), '£13,500');
  assert.equal(crm.moneyWords(12.5), '£12.50');
  assert.equal(crm.moneyWords(0), '£0');
  assert.equal(crm.moneyWords(null), '');
  assert.equal(crm.moneyWords(900, 'USD'), '$900');
  assert.equal(crm.rateWords(640, 'month'), '£640/month');
  assert.equal(crm.rateWords(750, 'hour'), '£750/hr');
  assert.equal(crm.rateSpoken(750, 'hour'), '£750 per hour');
  assert.equal(crm.rateWords(13460, 'once'), '£13,460');
  assert.deepEqual([crm.moneyFromTyped('£13,500'), crm.moneyFromTyped('13.5k'), crm.moneyFromTyped(''), crm.moneyFromTyped('lots')], [13500, 13500, null, undefined]);
});

// ---------------------------------------------------------------- stages

test('the starting stages are the database’s five, Won last at 100%', () => {
  const made = crm.startStages(ME, newId);
  assert.deepEqual(made.map((s) => [s.name, s.likelihood, s.is_won]), [['New', 10, false], ['Call booked', 25, false], ['Proposal sent', 50, false], ['Deciding', 70, false], ['Won', 100, true]]);
  assert.equal(made[4].position, crm.WON_POSITION);
  assert.deepEqual(crm.stagesInOrder([...STAGES].reverse()).map((s) => s.name), ['New', 'Call booked', 'Proposal sent', 'Deciding', 'Won']);
  assert.equal(crm.firstStage(STAGES).id, 's-new');
});

test('a stage is added last before Won, renamed, and given a likelihood from 0 to 100', () => {
  const added = crm.addStage(STAGES, { id: 's-x', coachId: ME, name: '  Verbal yes ', likelihood: '85%' });
  assert.deepEqual([added.name, added.likelihood, added.position, added.is_won], ['Verbal yes', 85, 4, false]);
  assert.deepEqual(crm.stagesInOrder([...STAGES, added]).map((s) => s.name).slice(-2), ['Verbal yes', 'Won']);
  assert.equal(crm.stageProblem({ name: '', likelihood: 50 }, STAGES), 'Type the stage’s name to carry on.');
  assert.equal(crm.stageProblem({ name: 'deciding', likelihood: 50 }, STAGES), 'There’s already a stage called Deciding. Choose another name.');
  assert.equal(crm.stageProblem({ id: 's-dec', name: 'Deciding', likelihood: 50 }, STAGES), '');
  assert.equal(crm.stageProblem({ name: 'Fresh', likelihood: '101' }, STAGES), 'Type a number from 0 to 100.');
  assert.deepEqual([crm.likelihoodFromTyped('0'), crm.likelihoodFromTyped('100%'), crm.likelihoodFromTyped('-1'), crm.likelihoodFromTyped('7.5')], [0, 100, null, null]);
  assert.equal(crm.editStage(STAGES[2], { name: 'Proposal out', likelihood: 55 }).likelihood, 55);
  // Won can be renamed but stays at 100%.
  assert.deepEqual([crm.editStage(STAGES[4], { name: 'Signed', likelihood: 5 }).name, crm.editStage(STAGES[4], { name: 'Signed', likelihood: 5 }).likelihood], ['Signed', 100]);
});

test('reordering moves a stage among the stages before Won, and Won never moves', () => {
  const changed = crm.reorderStages(STAGES, 's-dec', 0);
  assert.deepEqual(changed.map((s) => [s.name, s.position]), [['Deciding', 0], ['New', 1], ['Call booked', 2], ['Proposal sent', 3]]);
  // Past the end stops before Won.
  assert.deepEqual(crm.reorderStages(STAGES, 's-new', 99).map((s) => [s.name, s.position]), [['Call booked', 0], ['Proposal sent', 1], ['Deciding', 2], ['New', 3]]);
  assert.deepEqual(crm.reorderStages(STAGES, 's-won', 0), []);
  assert.deepEqual(crm.reorderStages(STAGES, 's-new', 0), []);
  assert.deepEqual([crm.stageStep(STAGES, 's-new', -1), crm.stageStep(STAGES, 's-dec', 1), crm.stageStep(STAGES, 's-call', 1)], [0, 3, 2]);
});

test('deleting a stage moves its leads on first, cold ones too, and takes its automations with it', () => {
  const automations = [{ id: 'a1', trigger_stage_id: 's-prop', to_stage_id: null }, { id: 'a2', trigger_stage_id: 's-new', to_stage_id: 's-prop' }, { id: 'a3', trigger_stage_id: 's-new', to_stage_id: null }];
  const plan = crm.deleteStagePlan(STAGES, LEADS, 's-prop', { automations });
  assert.equal(plan.ok, true);
  assert.equal(plan.to.id, 's-call');
  assert.deepEqual(plan.leads.map((l) => [l.id, l.stage_id]), [['amy', 's-call'], ['chris', 's-call'], ['cold', 's-call']]);
  assert.equal(plan.line, 'Proposal sent removed. 2 leads moved to Call booked.');
  assert.deepEqual(plan.automations.map((a) => a.id), ['a1', 'a2']);
  // Undo has the rows exactly as they were.
  assert.deepEqual(plan.undo.leads.map((l) => l.stage_id), ['s-prop', 's-prop', 's-prop']);
  assert.equal(crm.deleteStagePlan(STAGES, LEADS, 's-prop', { toId: 's-dec' }).to.id, 's-dec');
  assert.equal(crm.deleteStagePlan(STAGES, LEADS, 's-new').to.id, 's-call');
  assert.equal(crm.deleteStagePlan(STAGES, [], 's-call').line, 'Call booked removed.');
  assert.equal(crm.deleteStagePlan(STAGES, LEADS, 's-won').ok, false);
  assert.equal(crm.deleteStagePlan([STAGES[0], STAGES[4]], [], 's-new').line, 'A pipeline needs at least one stage before Won.');
  assert.equal(crm.moveLeadsQuestion(STAGES[2], 2), '2 leads are in Proposal sent. Where should they go?');
});

// ---------------------------------------------------------------- weighted values

test('a stage’s value is the sum of its leads’ values, and likely is that times its likelihood (M11’s board)', () => {
  const totals = crm.stageTotals(STAGES, LEADS);
  assert.deepEqual(totals.map((t) => [t.stage.name, t.count, t.valueWords, t.likelyWords]), [
    ['New', 1, 'No value yet', ''], ['Call booked', 1, 'No value yet', ''], ['Proposal sent', 2, '£31,500', '£15,750 likely'], ['Deciding', 1, '£7,500', '£5,250 likely'], ['Won', 1, '£13,500', ''],
  ]);
  // The cold lead's £9,000 is in no stage's total.
  assert.equal(totals[2].value, 31500);
  assert.deepEqual(crm.pipelineTotals(STAGES, LEADS), { count: 5, value: 39000, likely: 21000 });
  assert.equal(crm.likelyValue(999, 33), 330);
  assert.equal(crm.likelyValue(13500, 0), 0);
});

// ---------------------------------------------------------------- quiet, next step, last contact

test('Quiet shows from 14 days with no contact, never on a won or cold lead', () => {
  assert.equal(crm.quietWords(TOM, TODAY, STAGES), 'Quiet for 19 days');
  assert.equal(crm.quietWords({ ...TOM, last_contact_on: '2026-11-03' }, TODAY, STAGES), 'Quiet for 14 days');
  assert.equal(crm.quietWords({ ...TOM, last_contact_on: '2026-11-04' }, TODAY, STAGES), '');
  assert.equal(crm.quietWords({ ...LEO, last_contact_on: '2026-09-01' }, TODAY, STAGES), '');
  assert.equal(crm.quietWords({ ...COLD, last_contact_on: '2026-09-01' }, TODAY, STAGES), '');
  // Never contacted: counted from the day the lead was added.
  assert.equal(crm.quietDays(lead('x', 'X', 's-new', { created_at: '2026-10-27T12:00:00.000Z' }), TODAY, STAGES), 21);
});

test('the next step says when: Today, the day, the day and time, or Overdue since', () => {
  assert.deepEqual(crm.nextStepWords(ELENA, TODAY), { step: 'Reply to Elena’s email', when: 'Today', overdue: false, line: 'Reply to Elena’s email, Today' });
  assert.equal(crm.nextStepWords(RUTH, TODAY).line, 'Discovery call, Wed 18 Nov, 13:00');
  assert.equal(crm.nextStepWords(AMY, TODAY).when, 'Thu 19 Nov');
  assert.deepEqual([crm.nextStepWords(TOM, TODAY).when, crm.nextStepWords(TOM, TODAY).overdue], ['Overdue since Fri 13 Nov', true]);
  assert.equal(crm.nextStepWords(LEO, TODAY).line, '');
  assert.deepEqual([crm.lastContactWords(AMY, TODAY), crm.lastContactWords(ELENA, TODAY), crm.lastContactWords(CHRIS, TODAY), crm.lastContactWords(TOM, TODAY)], ['Today', 'Yesterday', '6 days ago', 'Thu 29 Oct']);
  assert.deepEqual(crm.followUpDays(TODAY).map((d) => d.label), ['Tomorrow, Wed 18 Nov', 'In 3 days, Fri 20 Nov', 'Next week, Tue 24 Nov', 'Choose a date']);
});

// ---------------------------------------------------------------- how ready, in words

test('how ready a lead is comes from the discovery notes, in words and never a number', () => {
  assert.deepEqual(crm.readiness(AMY), { line: 'Nearly there. Still to find out: when.', short: 'Still to find out: when', ready: false, missing: ['decide_when'] });
  assert.equal(crm.readiness(RUTH).line, 'Early days. Still to find out: the outcome, what’s in the way, who decides, who funds it and when.');
  assert.equal(crm.readiness(RUTH).short, 'Early days');
  assert.deepEqual([crm.readiness(TOM).line, crm.readiness(TOM).short, crm.readiness(TOM).ready], ['Ready to decide.', 'Ready to decide', true]);
  assert.equal(crm.readiness({ ...AMY, who_funds: ' ' }).short, 'Still to find out: who funds it and 1 more');
  assert.equal(crm.readiness({ ...AMY, who_funds: null, who_decides: null }).short, 'Early days');
  for (const l of LEADS) for (const words of [crm.readiness(l).line, crm.readiness(l).short]) assert.doesNotMatch(words, /\d|%|score/i);
  assert.equal(crm.whereTitle(AMY), 'Where Amy is');
  assert.deepEqual(crm.discoveryRows(AMY).map((r) => [r.label, r.words]).slice(-2), [['Who funds it', 'Northfield.'], ['When', 'Not known yet']]);
  assert.deepEqual(crm.discoveryPatch({ decide_when: ' January. ', want_pain: '', nonsense: 'x' }), { want_pain: null, decide_when: 'January.' });
});

// ---------------------------------------------------------------- board, list, table

test('a card says the value, how often the proposal was opened, the next step, Quiet and how ready', () => {
  const events = [1, 2, 3].map((i) => ({ id: `o${i}`, lead_id: 'amy', kind: 'proposal_opened', data: { name: 'Leadership Accelerator' } })).concat({ id: 'o4', lead_id: 'tom', kind: 'proposal_opened', data: {} });
  const amy = crm.leadCard(AMY, { ...ctx, events });
  assert.deepEqual([amy.sub, amy.valueWords, amy.opened, amy.next.line, amy.quiet, amy.ready], ['Northfield Logistics', '£13,500', 'Opened 3 times', 'Follow up on the proposal, Thu 19 Nov', '', 'Still to find out: when']);
  const tom = crm.leadCard(TOM, { ...ctx, events });
  assert.deepEqual([tom.opened, tom.quiet, tom.ready, tom.isReady, tom.next.overdue], ['Opened once', 'Quiet for 19 days', 'Ready to decide', true, true]);
  // No discovery note yet: the card says nothing about readiness. Won: no next step, no readiness.
  assert.equal(crm.leadCard(ELENA, ctx).ready, '');
  assert.deepEqual([crm.leadCard(ELENA, ctx).sub, crm.leadCard(LEO, ctx).ready, crm.leadCard(LEO, ctx).wonOn], ['Founder', '', 'Fri 13 Nov']);
});

test('the board has a column a stage with its totals, soonest next step first, and no cold lead', () => {
  const board = crm.leadBoard(STAGES, LEADS, ctx);
  assert.deepEqual(board.map((c) => [c.stage.name, c.cards.map((x) => x.name)]), [['New', ['Elena Ruiz']], ['Call booked', ['Ruth Adeyemi']], ['Proposal sent', ['Amy Cole', 'Chris Lowe']], ['Deciding', ['Tom Hale']], ['Won', ['Leo Grant']]]);
  assert.equal(crm.stageBesideLead(STAGES, AMY, 1).id, 's-dec');
  assert.equal(crm.stageBesideLead(STAGES, LEO, 1), null);
  const moved = crm.stageMove(AMY, STAGES[3], { id: 'm1', nowIso: NOW, todayKey: TODAY, stages: STAGES });
  assert.deepEqual([moved.lead.stage_id, moved.event.kind, moved.event.title, moved.toast, moved.event.data.from, moved.event.data.to], ['s-dec', 'stage', 'Moved to Deciding', 'Moved to Deciding.', 's-prop', 's-dec']);
  assert.equal(crm.stageMove(AMY, STAGES[2], { id: 'm2', nowIso: NOW, todayKey: TODAY }), null);
});

test('the table sorts as its headings say, blanks last both ways, and Show only narrows it', () => {
  const open = crm.openLeads(LEADS);
  assert.deepEqual(crm.sortLeads(open, 'value_desc', ctx).map((l) => l.name), ['Chris Lowe', 'Amy Cole', 'Leo Grant', 'Tom Hale', 'Elena Ruiz', 'Ruth Adeyemi']);
  assert.deepEqual(crm.sortLeads(open, 'value', ctx).map((l) => l.name).slice(0, 1).concat(crm.sortLeads(open, 'value', ctx).map((l) => l.name).slice(-2)), ['Tom Hale', 'Elena Ruiz', 'Ruth Adeyemi']);
  assert.deepEqual(crm.sortLeads(open, 'stage', ctx).map((l) => l.id), ['elena', 'ruth', 'amy', 'chris', 'tom', 'leo']);
  assert.deepEqual(crm.sortLeads(open, 'last_desc', ctx).map((l) => l.id)[0], 'tom');
  assert.deepEqual(crm.sortLeads(open, 'next', ctx).map((l) => l.id), ['tom', 'elena', 'ruth', 'amy', 'chris', 'leo']);
  assert.deepEqual(crm.sortLeads(open, 'field:sector', { fieldValue: (l) => ({ amy: 'Logistics', tom: 'Finance' })[l.id] ?? null }).map((l) => l.id).slice(0, 2), ['tom', 'amy']);
  assert.deepEqual(crm.filterLeads(open, { last: ['quiet'] }, ctx).map((l) => l.id), ['tom']);
  assert.deepEqual(crm.filterLeads(open, { value: ['hi'] }, ctx).map((l) => l.id), ['amy', 'chris', 'leo']);
  assert.deepEqual(crm.filterLeads(open, { value: ['lo', 'none'] }, ctx).map((l) => l.id), ['tom', 'elena', 'ruth']);
  assert.deepEqual(crm.filterLeads(open, { stage: ['s-prop'], q: 'kestrel' }, ctx).map((l) => l.id), ['chris']);
  assert.deepEqual(crm.filterLeads(open, { next: ['none'] }, ctx).map((l) => l.id), ['leo']);
  assert.equal(crm.headingWords('Stage', 2), 'Stage, 2');
  assert.deepEqual([crm.leadCountWords(8, 8), crm.leadCountWords(3, 8), crm.leadCountWords(1, 1)], ['8 leads', '3 of 8 leads', '1 lead']);
  // "Edit stage", never "Change stage".
  assert.deepEqual(crm.LEAD_ROW_MENU.map(([, label]) => label), ['Edit details', 'Edit stage', 'Log a call', 'Select', 'Mark as cold']);
  assert.deepEqual([crm.withNextStep(AMY, ' Call the CEO ').next_step, crm.withNextStep(AMY, '').next_step_on], ['Call the CEO', null]);
});

// ---------------------------------------------------------------- adding, Referred by

test('a new lead starts in the first stage; an email that isn’t one is refused calmly', () => {
  const made = crm.newLead({ id: 'n1', coachId: ME, stages: STAGES, name: ' Sarah  Kent ', email: 'Sarah.Kent@Example.invalid', organisation: 'Arden Vale', source: 'referral', referredBy: 'Dan Reid', referredByPerson: 'np-dan' });
  assert.deepEqual([made.lead.name, made.lead.email, made.lead.stage_id, made.lead.referred_by, made.lead.referred_by_person, made.lead.source], ['Sarah Kent', 'sarah.kent@example.invalid', 's-new', 'Dan Reid', 'np-dan', 'referral']);
  assert.equal(crm.newLead({ id: 'n2', coachId: ME, stages: STAGES, name: ' ' }).error, 'Type their name to carry on.');
  assert.equal(crm.newLead({ id: 'n3', coachId: ME, stages: STAGES, name: 'A', email: 'not an email' }).error, 'That email doesn’t look right. Check it and try again.');
  assert.equal(crm.LEAD_ADDED(STAGES[0]), 'Added to New.');
  assert.deepEqual(crm.cameFromRow(AMY), { label: 'Referred by', value: 'Hannah Wells', personId: 'np-hannah' });
  assert.deepEqual(crm.cameFromRow({ source: 'chemistry_page' }), { label: 'Where they came from', value: 'Discovery call page', personId: null });
});

test('Referred by: each referrer’s introductions, how many were won and their value', () => {
  const leads = [
    lead('r1', 'A', 's-won', { referred_by: 'Dana Whitfield', value: 14000, won_at: NOW }), lead('r2', 'B', 's-won', { referred_by: 'dana whitfield', value: 10200, won_at: NOW }), lead('r3', 'C', 's-new', { referred_by: 'Dana Whitfield' }),
    lead('r4', 'D', 's-new', { referred_by: 'David Stark' }), lead('r5', 'E', 's-won', { referred_by: 'Ruth Adeyemi', value: 10480, won_at: NOW }), lead('r6', 'F', 's-new', { referred_by: 'Gone', merged_into: 'r1' }),
  ];
  assert.deepEqual(crm.referrers(leads, STAGES).map((r) => [r.name, r.line, r.valueWords]), [['Dana Whitfield', '3 introductions, 2 won', '£24,200'], ['Ruth Adeyemi', '1 introduction, won', '£10,480'], ['David Stark', '1 introduction', '']]);
});

test('Move to Leads makes a lead that points at the Network person, who stays in Network', () => {
  const person = { id: 'np-david', name: 'David Stark', organisation: 'Citadel', email: 'david@example.invalid', phone: '+1 212 555 0147', last_spoke_on: '2026-11-15' };
  const out = crm.leadFromNetwork(person, { id: 'l-david', eventId: 'e-david', coachId: ME, stages: STAGES, nowIso: NOW, todayKey: TODAY });
  assert.deepEqual([out.lead.network_person_id, out.lead.source, out.lead.stage_id, out.lead.phone, out.lead.last_contact_on, out.event.kind], ['np-david', 'network', 's-new', '+1 212 555 0147', '2026-11-15', 'network']);
  assert.equal(out.toast, 'David is in Leads now, and still in your Network.');
  assert.equal(crm.leadOfPerson([out.lead], 'np-david').id, 'l-david');
  assert.equal(crm.leadOfPerson([{ ...out.lead, cold_at: NOW }], 'np-david'), null);
});

// ---------------------------------------------------------------- the timeline

const ev = (id, kind, at, title, detail = null, data = {}, leadId = 'amy') => ({ id, coach_id: ME, lead_id: leadId, kind, happened_at: at, happened_on: at.slice(0, 10), title, detail, data });
const local = (day, time) => new Date(`${day}T${time}:00`).toISOString();

test('the timeline is newest first, with one line for a proposal opened several times and Email tagged', () => {
  const emails = [{ id: 'e4', direction: 'in', from_name: 'Amy Cole', subject: 'Re: Leadership Accelerator proposal', hidden: false }, { id: 'e3', direction: 'out', subject: 'Leadership Accelerator proposal', hidden: false }, { id: 'e9', direction: 'in', subject: 'Hidden', hidden: true }];
  const events = [
    ev('1', 'referred', local('2026-11-06', '09:00'), 'Referred by Hannah Wells', 'Hannah introduced you by email.'),
    ev('3', 'call', local('2026-11-10', '09:00'), 'Discovery call, 30 minutes', 'Wants the team pulling the same way.\nDecides with the CEO.'),
    ev('4', 'proposal', local('2026-11-12', '09:00'), 'Proposal sent', 'Leadership Accelerator, £13,500 + VAT.'),
    ev('5', 'email', local('2026-11-12', '09:40'), 'Leadership Accelerator proposal', null, { email_id: 'e3' }),
    ev('6', 'proposal_opened', local('2026-11-13', '09:00'), 'Opened your proposal', null, { name: 'Leadership Accelerator' }),
    ev('7', 'proposal_opened', local('2026-11-15', '09:00'), 'Opened your proposal', null, { name: 'Leadership Accelerator' }),
    ev('8', 'email', local(TODAY, '07:55'), 'Re: Leadership Accelerator proposal', null, { email_id: 'e4' }),
    ev('9', 'proposal_opened', local(TODAY, '09:12'), 'Opened your proposal', null, { name: 'Leadership Accelerator' }),
    ev('10', 'email', local(TODAY, '09:30'), 'Hidden', null, { email_id: 'e9' }),
  ];
  const rows = crm.leadTimeline(events, { emails, lead: AMY, todayKey: TODAY });
  assert.deepEqual(rows.map((r) => [r.when, r.title, r.tag]), [
    ['Today, 09:12', 'Opened your proposal', ''], ['Today, 07:55', 'Amy replied: Leadership Accelerator proposal', 'Email'], ['Thu 12 Nov', 'You emailed: Leadership Accelerator proposal', 'Email'],
    ['Thu 12 Nov', 'Proposal sent', ''], ['Tue 10 Nov', 'Discovery call, 30 minutes', ''], ['Fri 6 Nov', 'Referred by Hannah Wells', ''],
  ]);
  assert.deepEqual(rows[0].lines, ['Leadership Accelerator. Opened 3 times.']);
  assert.deepEqual(rows[4].lines, ['Wants the team pulling the same way.', 'Decides with the CEO.']);
  assert.equal(rows[1].emailId, 'e4');
  // A line the coach's own words are on keeps them.
  assert.equal(crm.leadTimeline([ev('x', 'email', local(TODAY, '08:00'), 'Amy replied: Our CEO is in on Thursday', null, { email_id: 'e4' })], { emails, lead: AMY, todayKey: TODAY })[0].title, 'Amy replied: Our CEO is in on Thursday');
  assert.equal(crm.callTitle('', 45), 'Call, 45 minutes');
  assert.equal(crm.proposalDetail('Leadership Accelerator', 13500), 'Leadership Accelerator, £13,500 + VAT.');
  assert.deepEqual(crm.BOOKING_LINES('Discovery call').booked, { title: 'Booked a Discovery call', detail: 'From your Discovery call page.' });
});

test('contact moves a lead’s last contact forward and never back; a note or a stage move doesn’t', () => {
  assert.equal(crm.withContact(TOM, { kind: 'call', happened_on: TODAY }).last_contact_on, TODAY);
  assert.equal(crm.withContact(AMY, { kind: 'email', happened_on: '2026-11-01' }).last_contact_on, TODAY);
  assert.equal(crm.withContact(TOM, { kind: 'note', happened_on: TODAY }).last_contact_on, '2026-10-29');
  assert.equal(crm.withContact(TOM, { kind: 'stage', happened_on: TODAY }).last_contact_on, '2026-10-29');
});

test('Log a call writes the line, what was learned, the next step and its to-do, and the stage', () => {
  const out = crm.logCall(RUTH, { how: 'Keen to start in January.', next: 'Call with the CEO', nextOn: '2026-11-20', stageId: 's-prop', learned: { want_outcome: 'A calmer season.', decide_when: 'January.' }, callName: 'Discovery call', minutes: 30 },
    { id: 'c1', todoId: 't1', moveId: 'm1', nowIso: NOW, todayKey: TODAY, stages: STAGES });
  assert.deepEqual([out.lead.last_contact_on, out.lead.next_step, out.lead.next_step_on, out.lead.stage_id, out.lead.want_outcome, out.lead.decide_when], [TODAY, 'Call with the CEO', '2026-11-20', 's-prop', 'A calmer season.', 'January.']);
  assert.deepEqual(out.events.map((e) => [e.kind, e.title]), [['call', 'Discovery call, 30 minutes'], ['stage', 'Moved to Proposal sent']]);
  assert.deepEqual([out.todo.title, out.todo.planned_on, out.todo.lead_id, out.todo.someday], ['Call with the CEO', '2026-11-20', 'ruth', false]);
  assert.equal(out.toast, 'Logged. The follow-up is on your to-dos for Fri 20 Nov.');
  assert.equal(crm.logCall(RUTH, { how: ' ' }, { id: 'c2', todoId: 't2', moveId: 'm2', nowIso: NOW, todayKey: TODAY }).error, 'Type how it went, or what happens next, to carry on.');
  // Log a call never makes a client: Won is the coach's own button.
  assert.equal(crm.logCall(RUTH, { how: 'Yes!', stageId: 's-won' }, { id: 'c3', todoId: 't3', moveId: 'm3', nowIso: NOW, todayKey: TODAY, stages: STAGES }).lead.stage_id, 's-call');
  assert.equal(crm.leadNote(AMY, ' ', { id: 'x', nowIso: NOW, todayKey: TODAY }).error, 'Type your note to carry on.');
});

// ---------------------------------------------------------------- Won, Cold

test('Won makes a client, carries the timeline over without copying, and leaves an agreement draft for 6b', () => {
  const out = crm.wonPlan(AMY, { stages: STAGES, profileId: 'p-amy', eventId: 'e-won', dealId: 'd-amy', nowIso: NOW, todayKey: TODAY });
  assert.deepEqual([out.lead.stage_id, out.lead.won_at, out.lead.won_profile_id, out.lead.next_step], ['s-won', NOW, 'p-amy', null]);
  assert.deepEqual([out.profile.name, out.profile.email, out.profile.organisation_id, out.profile.status, out.profile.stage, out.profile.referred_by], ['Amy Cole', 'amy@example.invalid', 'org-n', 'active', 'starting', 'Hannah Wells']);
  assert.deepEqual(out.agreementDraft, { lead_id: 'amy', profile_id: 'p-amy', organisation_id: 'org-n', name: 'Coaching for Amy', value: 13500, currency: 'GBP', status: 'draft' });
  assert.deepEqual([out.deal.kind, out.deal.status, out.deal.lead_id, out.deal.organisation_id], ['agreement', 'draft', 'amy', 'org-n']);
  assert.deepEqual([out.event.kind, out.event.title, out.event.data.profile_id], ['won', 'Won', 'p-amy']);
  assert.equal(out.toast, 'Won. Amy is now a client, with an agreement ready to fill in.');
  assert.deepEqual(out.undo, { lead: AMY, removeProfile: 'p-amy', removeEvent: 'e-won', removeDeal: 'd-amy' });
  // The client's page reads the lead's own events: nothing is copied.
  const events = [ev('1', 'call', NOW, 'Call'), ev('2', 'call', NOW, 'Call', null, {}, 'tom'), out.event];
  assert.deepEqual(crm.carriedTimeline(events, [out.lead, TOM], 'p-amy').map((e) => e.id), ['1', 'e-won']);
  // No organisation: the draft is still left, with no organisation's deal row. Someone already a client is joined, not made twice.
  assert.equal(crm.wonPlan(ELENA, { stages: STAGES, profileId: 'p-e', eventId: 'e', dealId: 'd', nowIso: NOW, todayKey: TODAY }).deal, null);
  const joined = crm.wonPlan(ELENA, { stages: STAGES, profileId: 'p-new', eventId: 'e', nowIso: NOW, todayKey: TODAY, existingProfile: { id: 'p-there' } });
  assert.deepEqual([joined.profile, joined.lead.won_profile_id, joined.undo.removeProfile], [null, 'p-there', null]);
  assert.equal(crm.wonPlan(LEO, { stages: STAGES, profileId: 'p', eventId: 'e', nowIso: NOW, todayKey: TODAY }).error, 'Leo is already a client.');
});

test('Cold leads keep what happened and when to check in again, with a to-do on that day', () => {
  const out = crm.coldPlan(TOM, { reason: 'budget', check: '3m' }, { eventId: 'e-cold', todoId: 't-cold', nowIso: NOW, todayKey: TODAY });
  assert.deepEqual([out.lead.cold_at, out.lead.cold_reason, out.lead.cold_check_on, out.lead.stage_id, out.lead.next_step], [NOW, 'No budget this year.', '2027-02-17', 's-dec', null]);
  assert.deepEqual([out.event.kind, out.event.title, out.event.detail], ['cold', 'Marked as cold', 'No budget this year.']);
  assert.deepEqual([out.todo.title, out.todo.planned_on, out.todo.lead_id], ['Check in with Tom Hale', '2027-02-17', 'tom']);
  assert.equal(out.toast, 'Tom is in Cold leads. A reminder to check in is on your to-dos.');
  const never = crm.coldPlan(TOM, { reason: 'else', text: 'Moved abroad', check: 'never' }, { eventId: 'e', todoId: 't', nowIso: NOW, todayKey: TODAY });
  assert.deepEqual([never.lead.cold_reason, never.lead.cold_check_on, never.todo, never.toast], ['Moved abroad.', null, null, 'Tom is in Cold leads.']);
  assert.equal(crm.coldPlan(TOM, { reason: 'else', check: '3m' }, { eventId: 'e', todoId: 't', nowIso: NOW, todayKey: TODAY }).error, 'Type what happened to carry on.');
  assert.equal(crm.coldPlan(TOM, { check: '3m' }, { eventId: 'e', todoId: 't', nowIso: NOW, todayKey: TODAY }).error, 'Choose what happened to carry on.');
  // The list, and coming back.
  const due = { ...out.lead, id: 'due', name: 'Due Now', cold_check_on: TODAY };
  const rows = crm.coldRows([...LEADS, out.lead, due, { ...never.lead, id: 'nv', name: 'Never' }], TODAY);
  assert.deepEqual(rows.map((r) => [r.name, r.check, r.due]), [['Due Now', 'Time to check in', true], ['Priya Menon', 'Check in again on Sat 16 Jan 2027', false], ['Tom Hale', 'Check in again on Wed 17 Feb 2027', false], ['Never', 'No check-in planned', false]]);
  assert.equal(rows[1].happened, 'No budget this year.');
  const warm = crm.warmPlan(out.lead, { eventId: 'e-warm', nowIso: NOW, todayKey: TODAY, stages: STAGES });
  assert.deepEqual([warm.lead.cold_at, warm.lead.stage_id, warm.event.kind, warm.toast], [null, 's-dec', 'warm', 'Tom is back in Deciding.']);
  assert.deepEqual(crm.COLD_CHECKS.map(([, l]) => l), ['In 3 months', 'In 6 months', 'No need']);
});

// ---------------------------------------------------------------- import

test('a CSV keeps quoted commas and line breaks, reads semicolons and tabs, and drops empty rows', () => {
  assert.deepEqual(crm.csvTable('﻿Name,Company,Notes\r\n"Cole, Amy",Northfield,"Line one\nline two"\r\n\r\n,,\r\nTom Hale,"Bright ""water""",'), [['Name', 'Company', 'Notes'], ['Cole, Amy', 'Northfield', 'Line one line two'], ['Tom Hale', 'Bright "water"', '']]);
  assert.deepEqual(crm.csvTable('Name;Email\nAmy;amy@example.invalid'), [['Name', 'Email'], ['Amy', 'amy@example.invalid']]);
  assert.deepEqual(crm.csvTable('Name\tEmail\nAmy, the COO\tamy@example.invalid'), [['Name', 'Email'], ['Amy, the COO', 'amy@example.invalid']]);
});

test('columns are matched by their headings, odd ones are left to choose, and nothing is matched twice', () => {
  const m = crm.matchColumns(['Full Name', 'E-mail address', 'company_name', 'Lead Source', 'Deal size', 'Shoe size', 'Name', '']);
  assert.deepEqual(m.columns.map((c) => c.field), ['name', 'email', 'organisation', 'source', 'value', null, null, null]);
  assert.deepEqual(m.missing, []);
  assert.deepEqual(crm.matchColumns(['Shoe size', 'Email']).missing, ['name']);
  assert.deepEqual(crm.matchColumns(['First name', 'Surname', 'Mobile number']).columns.map((c) => c.field), ['first', 'last', 'phone']);
  assert.deepEqual(crm.matchColumns(['First name', 'Surname']).missing, []);
  assert.equal(crm.hasHeadingRow(['Name', 'Email']), true);
  assert.equal(crm.hasHeadingRow(['Amy Cole', 'amy@example.invalid']), false);
  const { rows, skipped } = crm.sheetRows([['Amy', 'Cole', 'amy@example.invalid'], ['', '', 'nobody@example.invalid'], ['Tom', '', '']], [{ index: 0, field: 'first' }, { index: 1, field: 'last' }, { index: 2, field: 'email' }]);
  assert.deepEqual([rows, skipped], [[{ email: 'amy@example.invalid', name: 'Amy Cole' }, { name: 'Tom' }], 1]);
});

test('import shows duplicates first: the same email, the same name, or twice in the file', () => {
  const rows = [{ name: 'New Person', email: 'new@example.invalid' }, { name: 'Someone Else', email: 'AMY@example.invalid' }, { name: 'tom hale' }, { name: 'New Person Again', email: 'new@example.invalid' }, { name: 'Fresh One' }, { name: 'Fresh One' }];
  const plan = crm.leadImportPlan(rows, LEADS);
  assert.deepEqual(plan.duplicates.map((d) => [d.index, d.by, d.match?.id ?? null]), [[1, 'email', 'amy'], [2, 'name', 'tom'], [3, 'file', null], [5, 'file', null]]);
  assert.deepEqual(plan.fresh.map((f) => f.index), [0, 4]);
  assert.deepEqual([crm.duplicateWords(plan.duplicates[0]), crm.duplicateWords(plan.duplicates[2])], ['Amy Cole is already a lead, with the same email.', 'New Person Again is in this file twice.']);
  assert.deepEqual([crm.importButton(2), crm.importedWords(1)], ['Add 2 leads', '1 lead added.']);
  const made = crm.leadFromImport({ name: 'Sarah Kent', email: 'bad address', organisation: 'Arden Vale', source: 'Word of mouth', value: '£4,500', phone: '07700 900111' }, { id: 'i1', coachId: ME, stages: STAGES });
  assert.deepEqual([made.name, made.email, made.source, made.value, made.stage_id, made.phone], ['Sarah Kent', null, 'referral', 4500, 's-new', '07700 900111']);
  assert.equal(crm.leadFromImport({ name: 'X', source: 'A conference' }, { id: 'i2', coachId: ME, stages: STAGES }).source, 'import');
});

// ---------------------------------------------------------------- merge and Undo

const DOYLE = lead('d1', 'Chris Doyle', 's-new', { email: 'chris@example.invalid', organisation: 'Doyle Capital', notes: 'Referrer, 3 people sent', last_contact_on: '2026-11-05' });
const DOYLE2 = lead('d2', 'Christopher Doyle', 's-new', { phone: '07700 900542', organisation: 'Doyle Capital Partners', notes: 'Added from the Discovery call page', last_contact_on: '2026-11-09', next_step: 'Call Chris', next_step_on: '2026-11-20', want_outcome: 'More referrals' });

test('likely duplicates are found by email, by name and by a first name that starts the other, until the coach says they differ', () => {
  const pairs = crm.leadDuplicates([...LEADS, DOYLE, DOYLE2]);
  assert.deepEqual(pairs.map((p) => [p.a.id, p.b.id, p.line]), [['d1', 'd2', 'Chris Doyle may be in here twice.']]);
  const said = crm.withNotSame({}, DOYLE2, DOYLE);
  assert.deepEqual(said.not_same, [['d1', 'd2']]);
  assert.deepEqual(crm.leadDuplicates([...LEADS, DOYLE, DOYLE2], said.not_same), []);
  // Chris Lowe and Chris Doyle share only a first name: not the same person.
  assert.equal(crm.leadDuplicates([CHRIS, DOYLE]).length, 0);
});

test('Merge into one offers a choice only where the two differ, and merges as the database does', () => {
  const plan = crm.leadMergePlan(DOYLE, DOYLE2);
  assert.deepEqual(plan.map((r) => [r.label, r.choose, r.one]), [['Name', true, ''], ['Email', false, 'chris@example.invalid'], ['Mobile', false, '07700 900542'], ['Organisation', true, ''], ['Notes', true, '']]);
  const merged = crm.mergedLead(DOYLE, DOYLE2, { organisation: true });
  assert.deepEqual([merged.name, merged.email, merged.phone, merged.organisation, merged.notes, merged.next_step, merged.next_step_on, merged.want_outcome, merged.last_contact_on],
    ['Chris Doyle', 'chris@example.invalid', '07700 900542', 'Doyle Capital Partners', 'Referrer, 3 people sent', 'Call Chris', '2026-11-20', 'More referrals', '2026-11-09']);
});

test('a merge on the device moves everything to the kept lead, and Undo puts every row back as it was', () => {
  const rows = {
    events: [ev('e1', 'note', NOW, 'Note', null, {}, 'd2'), ev('e2', 'note', NOW, 'Note', null, {}, 'd1')],
    todos: [{ id: 't1', lead_id: 'd2' }, { id: 't2', lead_id: 'amy' }],
    bookings: [{ id: 'b1', lead_id: 'd2' }],
    emailLinks: [{ email_id: 'm1', person_kind: 'lead', person_id: 'd2' }, { email_id: 'm2', person_kind: 'lead', person_id: 'd2' }, { email_id: 'm2', person_kind: 'lead', person_id: 'd1' }],
    tagLinks: [{ tag_id: 'g1', item_kind: 'lead', item_id: 'd2' }, { tag_id: 'g1', item_kind: 'lead', item_id: 'd1' }, { tag_id: 'g2', item_kind: 'lead', item_id: 'd2' }],
    fieldValues: [{ field_id: 'f1', item_id: 'd2', value_text: 'Finance' }],
  };
  const out = crm.leadMergeDevice(DOYLE, DOYLE2, { name: true }, rows);
  assert.deepEqual(out.save.slice(0, 2).map(([t, r]) => [t, r.id, r.name, r.merged_into]), [['coach_leads', 'd1', 'Christopher Doyle', null], ['coach_leads', 'd2', 'Christopher Doyle', 'd1']]);
  assert.deepEqual(out.save.slice(2).map(([t, r]) => [t, r.id ?? r.email_id ?? r.tag_id ?? r.field_id, r.lead_id ?? r.person_id ?? r.item_id]),
    [['coach_lead_events', 'e1', 'd1'], ['coach_todos', 't1', 'd1'], ['coach_bookings', 'b1', 'd1'], ['coach_email_links', 'm1', 'd1'], ['coach_tag_links', 'g2', 'd1'], ['coach_field_values', 'f1', 'd1']]);
  assert.equal(out.toast, 'Merged. Both timelines are now on Christopher Doyle.');
  const back = crm.leadUnmergeDevice(out.undo);
  assert.deepEqual(back.slice(0, 2), [['coach_leads', DOYLE], ['coach_leads', DOYLE2]]);
  assert.deepEqual(back.slice(2).map(([t, r]) => [t, r.lead_id ?? r.person_id ?? r.item_id]), [['coach_lead_events', 'd2'], ['coach_todos', 'd2'], ['coach_bookings', 'd2'], ['coach_email_links', 'd2'], ['coach_tag_links', 'd2'], ['coach_field_values', 'd2']]);
  assert.equal(crm.leadMergeDevice(DOYLE, DOYLE), null);
  assert.equal(crm.leadMergeDevice(DOYLE, { ...DOYLE2, merged_into: 'x' }), null);
});

// ---------------------------------------------------------------- export

test('export has every field, the coach’s own included, with values as numbers and formula cells made safe', () => {
  const rows = crm.leadExportRows([AMY, { ...TOM, name: '=HYPERLINK("x")' }, COLD], { stages: STAGES, fields: [{ id: 'f1', name: 'Sector' }], fieldWords: (l) => (l.id === 'amy' ? 'Logistics' : ''), tagNames: (l) => (l.id === 'amy' ? ['Executive', 'Sport'] : []) }, TODAY);
  assert.deepEqual(rows[0].slice(0, 8), ['Name', 'Email', 'Phone', 'Organisation', 'Role', 'Stage', 'Value', 'Likely to win']);
  assert.equal(rows[0][rows[0].length - 1], 'Sector');
  assert.deepEqual([rows[1][0], rows[1][5], rows[1][6], rows[1][7], rows[1][8], rows[1][9], rows[1][12], rows[1][rows[1].length - 1]], ['Amy Cole', 'Proposal sent', 13500, '50%', 'Follow up on the proposal', 'Thu 19 Nov', 'Hannah Wells', 'Logistics']);
  assert.equal(rows[1][rows[0].indexOf('Tags')], 'Executive, Sport');
  assert.deepEqual([rows[3][5], rows[3][7]], ['Cold', '']);
  const csv = crm.leadsCsv([{ ...TOM, name: '=HYPERLINK("x")' }], { stages: STAGES }, TODAY);
  assert.match(csv.split('\r\n')[1], /^"'=HYPERLINK\(""x""\)",/);
  assert.match(csv, /,7500,70%,/);
  assert.deepEqual([crm.exportWhat(8), crm.exportWhat(1), crm.exportName('Leads', '2026-11-20')], ['This view, 8 leads', 'This view, 1 lead', 'Leads, 20 Nov 2026']);
});

// ---------------------------------------------------------------- automations

const auto = (id, trigger, extra = {}) => ({ id, coach_id: ME, trigger, trigger_stage_id: null, trigger_count: null, call_type_key: null, action: 'todo', todo_title: 'Do it', todo_days: 0, to_stage_id: null, active: true, position: 0, ...extra });
const A1 = auto('a1', 'lead_stage', { trigger_stage_id: 's-prop', todo_title: 'Follow up on the proposal', todo_days: 3 });
const A2 = auto('a2', 'proposal_opened', { trigger_count: 3, todo_title: 'Call while the proposal is fresh', position: 1 });
const A3 = auto('a3', 'lead_quiet', { trigger_count: 14, todo_title: 'Check in', position: 2 });
const A4 = auto('a4', 'call_booked', { call_type_key: 'chemistry', todo_title: 'Read their booking answers', todo_days: -1, position: 3 });
const A6 = auto('a6', 'coaching_ended', { todo_title: 'Ask for a testimonial', todo_days: 14, active: false, position: 5 });
const actx = (automations, leads = LEADS) => ({ automations, leads, stages: STAGES, coachId: ME, newId, nowIso: NOW, todayKey: TODAY });

test('an automation can only add a to-do or move a stage, and its help says so', () => {
  assert.deepEqual(crm.ACTIONS.map((a) => a.value), ['todo', 'stage']);
  assert.equal(crm.AUTOMATION_HELP, 'Automations add to-dos and move stages. They never send anything.');
  assert.doesNotMatch(JSON.stringify(crm.ACTIONS) + JSON.stringify(crm.TRIGGERS), /\b(send|email|tag|message)/i);
  // Anything else in a row is never run, whatever it says.
  assert.deepEqual(crm.automationSteps(crm.wonEvent(AMY), actx([auto('bad', 'lead_won', { action: 'email' })])), []);
});

test('each automation reads as one sentence, as M11 writes them', () => {
  const c = { stages: STAGES, callTypes: [{ key: 'chemistry', name: 'Discovery call' }] };
  assert.equal(crm.automationSentence(A1, c), 'When a lead moves to Proposal sent, add the to-do “Follow up on the proposal”, 3 days later.');
  assert.equal(crm.automationSentence(A2, c), 'When a proposal is opened 3 times, add the to-do “Call while the proposal is fresh”, the same day.');
  assert.equal(crm.automationSentence(A3, c), 'When a lead has been quiet for 14 days, add the to-do “Check in”, the same day.');
  assert.equal(crm.automationSentence(A4, c), 'When a Discovery call is booked, add the to-do “Read their booking answers”, the day before.');
  assert.equal(crm.automationSentence(A6, c), 'When coaching ends, add the to-do “Ask for a testimonial”, 2 weeks later.');
  assert.equal(crm.automationSentence(auto('m', 'lead_stage', { trigger_stage_id: 's-call', action: 'stage', to_stage_id: 's-prop' }), c), 'When a lead moves to Call booked, move the lead to Proposal sent.');
  assert.deepEqual([crm.daysLaterWords(1), crm.daysLaterWords(7), crm.daysLaterWords(-2), crm.daysLaterWords(10)], ['1 day later', '1 week later', '2 days before', '10 days later']);
  const runs = [1, 2, 3, 4].map((i) => ({ automation_id: 'a1', ran_at: `2026-11-0${i}T12:00:00.000Z` })).concat([{ automation_id: 'a1', ran_at: '2026-10-05T12:00:00.000Z' }, { automation_id: 'a2', ran_at: '2026-11-05T12:00:00.000Z' }]);
  assert.deepEqual([crm.ranWords(A1, runs, TODAY), crm.ranWords(A2, runs, TODAY), crm.ranWords(A3, runs, TODAY), crm.ranWords(A6, runs, TODAY)], ['Ran 4 times in November', 'Ran 1 time in November', 'Hasn’t run in November', 'Off']);
});

test('an automation that can’t work is refused with what to do', () => {
  const s = { stages: STAGES };
  assert.equal(crm.automationProblem({ ...A1, todo_title: ' ' }, s), 'Type the to-do to carry on.');
  assert.equal(crm.automationProblem({ ...A1, trigger_stage_id: null }, s), 'Choose a stage to carry on.');
  assert.equal(crm.automationProblem(auto('x', 'lead_stage', { trigger_stage_id: 's-call', action: 'stage', to_stage_id: 's-won' }), s), 'Won makes a client, so it’s yours to do. Choose another stage.');
  assert.equal(crm.automationProblem(auto('x', 'lead_stage', { trigger_stage_id: 's-call', action: 'stage', to_stage_id: 's-call' }), s), 'That’s the stage that starts it. Choose another stage.');
  assert.equal(crm.automationProblem(auto('x', 'coaching_ended', { action: 'stage', to_stage_id: 's-call' }), s), 'When coaching ends there’s no lead to move. Choose Add a to-do instead.');
  assert.equal(crm.automationProblem(auto('x', 'lead_stage', { action: 'send', trigger_stage_id: 's-call' }), s), 'Choose what it does to carry on.');
  assert.equal(crm.automationProblem(A1, s), '');
  const tidy = crm.tidyAutomation({ ...A1, trigger: 'lead_quiet', trigger_count: null, to_stage_id: 's-dec', call_type_key: 'chemistry' });
  assert.deepEqual([tidy.trigger_stage_id, tidy.trigger_count, tidy.to_stage_id, tidy.call_type_key], [null, 14, null, null]);
  assert.deepEqual(crm.todoDayChoices('lead_stage').map((d) => d.label).slice(0, 3), ['The same day', '1 day later', '2 days later']);
  assert.equal(crm.todoDayChoices('call_booked')[0].label, 'The day before');
});

test('a to-do automation adds its to-do on the right day, pointing at the lead and the automation', () => {
  const steps = crm.automationSteps(crm.stageEvent(AMY, 's-prop', 'move-1'), actx([A1, A2, A3]));
  assert.equal(steps.length, 1);
  const { run, todo, move, follow } = steps[0];
  assert.deepEqual([run.automation_id, run.event_key, run.lead_id, run.todo_id === todo.id], ['a1', 'stage:amy:s-prop', 'amy', true]);
  assert.deepEqual([todo.title, todo.planned_on, todo.lead_id, todo.automation_id, todo.coach_id], ['Follow up on the proposal', '2026-11-20', 'amy', 'a1', ME]);
  assert.deepEqual([move, follow], [null, null]);
  // The day before a booked call counts from the call's own day, and is never before today.
  const booked = crm.automationSteps(crm.bookedEvent(RUTH, { id: 'bk1', call_type_key: 'chemistry', day: '2026-11-18' }), actx([A4]));
  assert.deepEqual([booked[0].todo.planned_on, booked[0].run.event_key], [TODAY, 'booking:bk1']);
  assert.equal(crm.automationSteps(crm.bookedEvent(RUTH, { id: 'bk2', call_type_key: 'chemistry', day: TODAY }), actx([A4]))[0].todo.planned_on, TODAY);
  assert.deepEqual(crm.automationSteps(crm.bookedEvent(RUTH, { id: 'bk3', call_type_key: 'connection', day: TODAY }), actx([A4])), []);
  // Opened 3 times runs from the third opening, once a proposal; quiet runs once a quiet spell.
  assert.equal(crm.automationSteps(crm.openedEvent(AMY, 'Leadership Accelerator', 2), actx([A2])).length, 0);
  assert.equal(crm.automationSteps(crm.openedEvent(AMY, 'Leadership Accelerator', 3), actx([A2]))[0].run.event_key, 'opened:amy:leadership accelerator');
  assert.equal(crm.automationSteps(crm.openedEvent(AMY, 'Leadership Accelerator', 4), actx([A2]))[0].run.event_key, 'opened:amy:leadership accelerator');
  assert.deepEqual(crm.quietEvents(LEADS, STAGES, TODAY).filter((e) => crm.automationMatches(A3, e)).map((e) => e.key), ['quiet:tom:2026-10-29']);
  // Coaching ended has no lead: the to-do points at the client. Off means off.
  const ended = crm.automationSteps(crm.endedEvent({ id: 'p-ben', name: 'Ben Ortiz', ended_on: '2026-11-17' }), actx([{ ...A6, active: true }]));
  assert.deepEqual([ended[0].todo.lead_id, ended[0].todo.profile_id, ended[0].todo.planned_on, ended[0].run.profile_id], [null, 'p-ben', '2026-12-01', 'p-ben']);
  assert.deepEqual(crm.automationSteps(crm.endedEvent({ id: 'p-ben', ended_on: TODAY }), actx([A6])), []);
});

/** A tiny database for runs: unique on automation and event key, as coach_automation_runs is. */
function fakeIo(leads) {
  const io = { runs: [], todos: [], moves: [], leads: [...leads], refused: 0 };
  io.claim = async (run) => { if (io.runs.some((r) => r.automation_id === run.automation_id && r.event_key === run.event_key)) { io.refused += 1; return false; } io.runs.push(run); return true; };
  io.addTodo = async (todo) => { io.todos.push(todo); };
  io.move = async (m) => { io.moves.push(m); io.leads = io.leads.map((l) => (l.id === m.lead.id ? m.lead : l)); };
  return io;
}

test('a stage-move automation moves the lead, writes its line, and its move can set off the next automation once', async () => {
  const toDeciding = auto('m1', 'lead_stage', { trigger_stage_id: 's-prop', action: 'stage', to_stage_id: 's-dec' });
  const onDeciding = auto('m2', 'lead_stage', { trigger_stage_id: 's-dec', todo_title: 'Send the agreement', todo_days: 1, position: 1 });
  const io = fakeIo([{ ...RUTH, stage_id: 's-prop' }]);
  const done = await crm.runAutomations(crm.stageEvent(RUTH, 's-prop', 'mv-9'), { ...actx([toDeciding, onDeciding], io.leads), leadsNow: () => io.leads }, io);
  assert.deepEqual(done, { ran: 2, todos: 1, moves: 1 });
  assert.deepEqual([io.leads[0].stage_id, io.moves[0].event.title, io.moves[0].event.detail, io.moves[0].event.data.automation_id], ['s-dec', 'Moved to Deciding', 'By an automation.', 'm1']);
  assert.deepEqual(io.todos.map((t) => [t.title, t.planned_on]), [['Send the agreement', '2026-11-18']]);
  // Each run is claimed under its own lead and stage, the follow-on's too (tidy follow-up 3, run 6's 30).
  assert.deepEqual(io.runs.map((r) => [r.automation_id, r.event_key]), [['m1', 'stage:ruth:s-prop'], ['m2', 'stage:ruth:s-dec']]);
});

test('an automation runs once for each lead and stage: a lead that leaves a stage and comes back runs nothing again (run 6’s 30)', async () => {
  const note = auto('once', 'lead_stage', { trigger_stage_id: 's-prop', todo_title: 'Follow up on the proposal', todo_days: 1 });
  const io = fakeIo([{ ...RUTH, stage_id: 's-prop' }]);
  const first = await crm.runAutomations(crm.stageEvent(RUTH, 's-prop', 'mv-1'), { ...actx([note], io.leads), leadsNow: () => io.leads }, io);
  assert.deepEqual([first.ran, io.todos.length], [1, 1]);
  // Moved on to Deciding, then back to Proposal sent by hand: a new move, the same lead and stage, so nothing runs.
  const back = await crm.runAutomations(crm.stageEvent(RUTH, 's-prop', 'mv-2'), { ...actx([note], io.leads), leadsNow: () => io.leads }, io);
  assert.deepEqual([back.ran, io.todos.length, io.refused], [0, 1, 1]);
  // Another lead reaching the same stage is its own: it runs for them.
  const amy = await crm.runAutomations(crm.stageEvent(AMY, 's-prop', 'mv-3'), { ...actx([note], [AMY]), leadsNow: () => [AMY] }, io);
  assert.deepEqual([amy.ran, io.todos.length], [1, 2]);
  // Reached by another automation's move (a chain), it is the same lead and stage: still once.
  const mover = auto('mover', 'lead_stage', { trigger_stage_id: 's-dec', action: 'stage', to_stage_id: 's-prop' });
  const io2 = fakeIo([{ ...RUTH, stage_id: 's-prop' }]);
  await crm.runAutomations(crm.stageEvent(RUTH, 's-prop', 'mv-4'), { ...actx([note, mover], io2.leads), leadsNow: () => io2.leads }, io2);
  io2.leads = io2.leads.map((l) => ({ ...l, stage_id: 's-dec' }));
  await crm.runAutomations(crm.stageEvent(RUTH, 's-dec', 'mv-5'), { ...actx([note, mover], io2.leads), leadsNow: () => io2.leads }, io2);
  assert.deepEqual([io2.moves.length, io2.todos.length], [1, 1], 'moved back to Proposal sent by the automation, and the to-do is not added a second time');
});

test('THE LOOP GUARD: two automations that move a lead back and forth run once each and stop', async () => {
  const there = auto('loop-a', 'lead_stage', { trigger_stage_id: 's-prop', action: 'stage', to_stage_id: 's-dec' });
  const back = auto('loop-b', 'lead_stage', { trigger_stage_id: 's-dec', action: 'stage', to_stage_id: 's-prop', position: 1 });
  const note = auto('loop-c', 'lead_stage', { trigger_stage_id: 's-prop', todo_title: 'Follow up', position: 2 });
  const io = fakeIo([{ ...RUTH, stage_id: 's-prop' }]);
  const event = crm.stageEvent(RUTH, 's-prop', 'mv-1');
  const done = await crm.runAutomations(event, { ...actx([there, back, note], io.leads), leadsNow: () => io.leads }, io);
  // A moved it to Deciding, B moved it back, and nothing ran twice: the to-do was added once, not once a lap.
  assert.deepEqual(done, { ran: 3, todos: 1, moves: 2 });
  assert.deepEqual(io.moves.map((m) => m.lead.stage_id), ['s-dec', 's-prop']);
  assert.equal(io.leads[0].stage_id, 's-prop');
  assert.deepEqual(io.runs.map((r) => r.automation_id).sort(), ['loop-a', 'loop-b', 'loop-c']);
  // The same event again (another tab, a reload, a retry): every claim is refused, so nothing happens at all.
  const again = await crm.runAutomations(event, { ...actx([there, back, note], io.leads), leadsNow: () => io.leads }, io);
  assert.deepEqual([again, io.moves.length, io.todos.length], [{ ran: 0, todos: 0, moves: 0 }, 2, 1]);
  assert.ok(io.refused >= 1);
});

test('THE LOOP GUARD: an automation that moves a lead to where it already is claims nothing, and a chain stops at its limit', async () => {
  const stay = auto('stay', 'lead_stage', { trigger_stage_id: 's-prop', action: 'stage', to_stage_id: 's-prop' });
  assert.deepEqual(crm.automationSteps(crm.stageEvent(AMY, 's-prop', 'mv-2'), actx([stay])), []);
  // A long ladder of different automations: each runs once, and no more than CHAIN_MAX moves follow one event.
  const ids = ['s-new', 's-call', 's-prop', 's-dec'];
  const stages = [...STAGES.slice(0, 4), ...[5, 6, 7, 8, 9].map((i) => ({ id: `s-${i}`, coach_id: ME, name: `Stage ${i}`, likelihood: 50, position: i, is_won: false })), STAGES[4]];
  const order = [...ids, 's-5', 's-6', 's-7', 's-8', 's-9'];
  const ladder = order.slice(0, -1).map((from, i) => auto(`step-${i}`, 'lead_stage', { trigger_stage_id: from, action: 'stage', to_stage_id: order[i + 1], position: i }));
  const io = fakeIo([{ ...ELENA }]);
  const done = await crm.runAutomations(crm.stageEvent(ELENA, 's-new', 'mv-3'), { ...actx(ladder, io.leads), stages, leadsNow: () => io.leads }, io);
  assert.equal(done.moves, crm.CHAIN_MAX);
  assert.equal(new Set(io.runs.map((r) => r.automation_id)).size, io.runs.length);
  // A cold or won lead is never moved.
  assert.deepEqual(crm.automationSteps(crm.stageEvent(COLD, 's-prop', 'mv-4'), actx([auto('x', 'lead_stage', { trigger_stage_id: 's-prop', action: 'stage', to_stage_id: 's-dec' })])), []);
  assert.deepEqual([crm.claimed({ code: '23505' }), crm.claimed('saved'), crm.claimed('device')], [false, true, true]);
  const kept = [{ id: 'r1', automation_id: 'a1', event_key: 'stage:amy:s-prop:mv-1' }];
  assert.deepEqual([crm.alreadyRan(kept, { id: 'r2', automation_id: 'a1', event_key: 'stage:amy:s-prop:mv-1' }), crm.alreadyRan(kept, { id: 'r2', automation_id: 'a2', event_key: 'stage:amy:s-prop:mv-1' }), crm.alreadyRan(kept, kept[0])], [true, false, false]);
});

// ---------------------------------------------------------------- boards

test('a new board starts from a template with its stages and fields, and isn’t shared', () => {
  const { board, stages } = crm.newBoard({ id: 'b1', coachId: ME, name: ' Speaking ', template: 'speaking', newId, boards: [{ position: 2 }] });
  assert.deepEqual([board.name, board.shared, board.position, board.columns.map((c) => [c.name, c.kind])], ['Speaking', false, 3, [['Date', 'date'], ['Fee', 'money'], ['Audience', 'text']]]);
  assert.deepEqual(stages.map((s) => [s.name, s.position, s.board_id]), [['Ideas', 0, 'b1'], ['Pitched', 1, 'b1'], ['Confirmed', 2, 'b1'], ['Done', 3, 'b1']]);
  assert.deepEqual(crm.BOARD_TEMPLATES.map((t) => t.name), ['Blank', 'Speaking', 'Partners', 'Book', 'Podcast guests']);
  assert.deepEqual(crm.templateWords(crm.BOARD_TEMPLATES[1]), { stages: 'Ideas, Pitched, Confirmed, Done', fields: 'Date, Fee, Audience' });
  assert.equal(crm.templateWords(crm.BOARD_TEMPLATES[0]).fields, 'None yet');
  assert.equal(crm.boardProblem('', []), 'Type the board’s name to carry on.');
  assert.equal(crm.boardProblem('speaking', [board]), 'There’s already a board called Speaking. Choose another name.');
  assert.equal(crm.boardProblem('Speaking', [board], 'b1'), '');
});

const BOARD = { id: 'b1', coach_id: ME, name: 'Speaking', columns: [{ id: 'date', name: 'Date', kind: 'date' }, { id: 'fee', name: 'Fee', kind: 'money' }, { id: 'aud', name: 'Audience', kind: 'text' }], shared: false, position: 0, archived_at: null };
const BSTAGES = ['Ideas', 'Pitched', 'Confirmed', 'Done'].map((name, i) => ({ id: `bs${i}`, board_id: 'b1', coach_id: ME, name, position: i }));
const BITEMS = [
  { id: 'c1', board_id: 'b1', stage_id: 'bs1', title: 'CIPD Festival of Work', field_values: { date: '2027-06-10', fee: 4500, aud: '800 HR leaders' }, position: 0 },
  { id: 'c2', board_id: 'b1', stage_id: 'bs1', title: 'Henley Business School alumni', field_values: { date: '2027-03-16', fee: 3000, aud: '120 alumni' }, position: 1 },
  { id: 'c3', board_id: 'b1', stage_id: 'bs0', title: 'League Managers Association', field_values: { aud: 'Head coaches' }, position: 0 },
  { id: 'c4', board_id: 'b1', stage_id: 'bs3', title: 'Leaders in Sport podcast', field_values: { date: '2026-11-03', aud: 'Sport leaders' }, position: 0 },
  { id: 'cx', board_id: 'other', stage_id: 'zz', title: 'Another board’s card', field_values: {}, position: 0 },
];

test('a board shows as columns and as a table, each card with its fields in words', () => {
  const view = crm.boardView(BOARD, BSTAGES, BITEMS, TODAY);
  assert.deepEqual(view.map((c) => [c.stage.name, c.count]), [['Ideas', 1], ['Pitched', 2], ['Confirmed', 0], ['Done', 1]]);
  assert.deepEqual(view[1].cards[0], { id: 'c1', title: 'CIPD Festival of Work', line: 'Thu 10 Jun 2027, £4,500', more: '800 HR leaders' });
  assert.deepEqual(view[3].cards[0], { id: 'c4', title: 'Leaders in Sport podcast', line: 'Tue 3 Nov, Sport leaders', more: '' });
  assert.deepEqual(crm.boardLine(BOARD, BSTAGES, BITEMS), ['4 stages', '4 cards']);
  const table = crm.boardTable(BOARD, BSTAGES, BITEMS, TODAY);
  assert.deepEqual(table.head, ['Name', 'Stage', 'Date', 'Fee', 'Audience']);
  assert.deepEqual(table.rows.find((r) => r.id === 'c3').cells.map((c) => c.words), ['', '', 'Head coaches']);
  assert.equal(table.rows.find((r) => r.id === 'c1').cells[1].numeric, true);
});

test('a card’s fields are typed over: money, numbers and dates are read, and what isn’t one says so', () => {
  const [date, fee] = BOARD.columns;
  assert.deepEqual(crm.boardFieldFromTyped(fee, '£4,500', TODAY), { value: 4500 });
  assert.deepEqual(crm.boardFieldFromTyped(fee, 'a lot', TODAY), { error: 'Type an amount in numbers, such as 13,500.' });
  assert.deepEqual(crm.boardFieldFromTyped(date, '10 Jun 2027', TODAY), { value: '2027-06-10' });
  assert.deepEqual(crm.boardFieldFromTyped(date, '30 Feb', TODAY), { error: 'Type a date, such as 10 Jun or 10 Jun 2027.' });
  assert.deepEqual(crm.boardFieldFromTyped(date, '', TODAY), { value: null });
  assert.deepEqual(crm.boardFieldFromTyped({ kind: 'choice', options: ['Yes', 'No'] }, 'yes', TODAY), { value: 'Yes' });
  assert.deepEqual([crm.dayFromTyped('today', TODAY), crm.dayFromTyped('Wed 10 June', TODAY), crm.dayFromTyped('3/11/26', TODAY), crm.dayFromTyped('2026-02-30', TODAY), crm.dayFromTyped('soon', TODAY)], [TODAY, '2026-06-10', '2026-11-03', null, null]);
});

test('cards are added and moved, a stage’s cards move on when it is deleted, and fields come and go', () => {
  assert.equal(crm.newBoardItem({ id: 'n', coachId: ME, board: BOARD, stageId: 'bs1', title: ' ', items: BITEMS }).error, 'Type the card’s name to carry on.');
  assert.equal(crm.newBoardItem({ id: 'n', coachId: ME, board: BOARD, stageId: 'bs1', title: 'TEDx', items: BITEMS }).item.position, 2);
  assert.deepEqual([crm.moveBoardItem(BITEMS[2], 'bs1', BITEMS).stage_id, crm.moveBoardItem(BITEMS[2], 'bs1', BITEMS).position, crm.moveBoardItem(BITEMS[2], 'bs0', BITEMS)], ['bs1', 2, null]);
  const plan = crm.deleteBoardStagePlan(BOARD, BSTAGES, BITEMS, 'bs1');
  assert.deepEqual([plan.to.id, plan.items.map((i) => i.stage_id), plan.line], ['bs0', ['bs0', 'bs0'], 'Pitched removed. 2 cards moved to Ideas.']);
  assert.equal(crm.deleteBoardStagePlan(BOARD, [BSTAGES[0]], BITEMS, 'bs0').line, 'A board needs at least one stage.');
  assert.equal(crm.withBoardColumn(BOARD, { id: 'x', name: 'fee' }).error, 'There’s already a field called fee. Choose another name.');
  assert.equal(crm.withBoardColumn(BOARD, { id: 'x', name: 'City', kind: 'text' }).board.columns.length, 4);
  assert.deepEqual(crm.withoutBoardColumn(BOARD, 'fee').columns.map((c) => c.id), ['date', 'aud']);
  assert.deepEqual(crm.boardViews([{ id: 'v1', list: 'board', name: 'Big fees', filters: { board_id: 'b1' } }, { id: 'v2', list: 'board', name: 'Other', filters: { board_id: 'b2' } }, { id: 'v3', list: 'leads', name: 'Quiet', filters: {} }], 'b1').map((v) => v.id), ['v1']);
});

test('boards are the owner’s unless shared: an associate sees only shared boards and can’t edit one', () => {
  const boards = [BOARD, { ...BOARD, id: 'b2', name: 'Partners', shared: true, position: 1 }, { ...BOARD, id: 'b3', name: 'Old', shared: true, archived_at: NOW }];
  assert.deepEqual(crm.boardsFor(boards, { isOwner: true }).map((b) => b.id), ['b1', 'b2']);
  assert.deepEqual(crm.boardsFor(boards, { isOwner: false }).map((b) => b.id), ['b2']);
  assert.deepEqual([crm.canEditBoard(boards[1], { isOwner: true }), crm.canEditBoard(boards[1], { isOwner: false })], [true, false]);
  assert.deepEqual([crm.shareLabel([{ display_first_name: 'Maya' }]), crm.shareLabel([]), crm.shareLabel([{ name: 'A' }, { name: 'B' }])], ['Share with Maya', 'Share with your associates', 'Share with your associates']);
  assert.deepEqual([crm.sharedToast(true, [{ display_first_name: 'Maya' }]), crm.sharedToast(false)], ['Shared. Maya can see this board now.', 'Not shared any more.']);
  assert.equal(crm.sharedBy('Tim'), 'Tim’s board. You can see it and can’t edit it.');
});

// ---------------------------------------------------------------- emails

test('the copied-in address is found among the recipients, and only at the portal’s own inbound domain', () => {
  const to = ['Amy Cole <amy@example.invalid>', { email: 'LOG.Alex.7kx2m4qa@in.example.invalid' }];
  assert.deepEqual(crm.copyInKey(to, 'in.example.invalid'), { key: 'log.alex.7kx2m4qa', kind: 'log' });
  assert.deepEqual(crm.copyInKey(['todo.alex.9bd3w6tz@in.example.invalid']), { key: 'todo.alex.9bd3w6tz', kind: 'todo' });
  assert.equal(crm.copyInKey(to, 'elsewhere.invalid'), null);
  assert.equal(crm.copyInKey(['amy@example.invalid', 'logs@example.invalid']), null);
  assert.deepEqual([crm.copyInAddress('log.alex.7kx2m4qa', '@In.Example.invalid'), crm.copyInAddress('log.alex.7kx2m4qa', '')], ['log.alex.7kx2m4qa@in.example.invalid', '']);
  assert.deepEqual(crm.headerPeople('To: Amy Cole <amy@example.invalid>, ruth@example.invalid'), [{ name: 'Amy Cole', email: 'amy@example.invalid' }, { name: '', email: 'ruth@example.invalid' }]);
});

test('an email goes on the timeline of everyone it names who is in the portal, and a stranger on From or To waits on Leads', () => {
  const email = { direction: 'out', from: { name: 'Alex Morgan', email: 'alex@example.invalid' }, to: [{ name: 'Amy Cole', email: 'AMY@example.invalid' }, { name: 'Sarah Kent', email: 'sarah.kent@example.invalid' }, { email: 'log.alex.7kx2m4qa@in.example.invalid' }],
    cc: [{ name: 'Dana Whitfield', email: 'dana@example.invalid' }, { name: 'Copied Stranger', email: 'cc@example.invalid' }, { name: 'Jo', email: 'jo@example.invalid' }, { name: 'Bad', email: 'not-an-address' }] };
  const who = { leads: LEADS, clients: [{ id: 'p-dana', email: 'dana@example.invalid' }], network: [{ id: 'np-dana', email: 'Dana@example.invalid' }], contacts: [{ id: 'oc-jo', email: 'jo@example.invalid' }], own: ['Alex@example.invalid'], keys: ['log.alex.7kx2m4qa'] };
  const out = crm.emailBelongs(email, who);
  assert.deepEqual(out.links, [{ person_kind: 'lead', person_id: 'amy' }, { person_kind: 'client', person_id: 'p-dana' }, { person_kind: 'network', person_id: 'np-dana' }, { person_kind: 'contact', person_id: 'oc-jo' }]);
  // Sarah is on the To line and nowhere in the portal: she waits. The stranger who was only copied in doesn't; nor do the coach or the copy-in address.
  assert.deepEqual(out.waiting, [{ name: 'Sarah Kent', email: 'sarah.kent@example.invalid' }]);
  // "Not now" is remembered: one row an address, never asked again.
  assert.deepEqual(crm.emailBelongs(email, { ...who, waiting: [{ email: 'sarah.kent@example.invalid', status: 'dismissed' }] }).waiting, []);
  // A merged-away lead gets no link, and its address doesn't wait either.
  assert.deepEqual(crm.emailBelongs({ from: { email: 'gone@example.invalid' }, to: [] }, { leads: [lead('g', 'Gone', 's-new', { email: 'gone@example.invalid', merged_into: 'amy' })] }), { links: [], waiting: [] });
  // An email in: the sender is the one who waits.
  assert.deepEqual(crm.emailBelongs({ direction: 'in', from: { name: 'New Person', email: 'new@example.invalid' }, to: [{ email: 'alex@example.invalid' }] }, who).waiting, [{ name: 'New Person', email: 'new@example.invalid' }]);
});

test('someone waiting can be added as a lead, with the email on their timeline, or left out for good', () => {
  const waiting = { id: 'w1', coach_id: ME, email_id: 'e-s', name: 'Sarah Kent', email: 'sarah.kent@example.invalid', status: 'waiting', lead_id: null, decided_at: null, created_at: NOW };
  const email = { id: 'e-s', direction: 'out', subject: 'Good to meet you', sent_at: local('2026-11-16', '16:40') };
  assert.equal(crm.waitingLine(waiting, email), 'You emailed Sarah Kent, who isn’t in the portal yet.');
  assert.equal(crm.waitingLine({ email: 'x@example.invalid' }, { direction: 'in' }), 'x@example.invalid emailed you, and isn’t in the portal yet.');
  assert.deepEqual(crm.WAITING_BUTTONS, { add: 'Add as a lead', dismiss: 'Not now' });
  const out = crm.leadFromWaiting(waiting, email, { id: 'l-s', eventId: 'ev-s', coachId: ME, stages: STAGES, nowIso: NOW, todayKey: TODAY });
  assert.deepEqual([out.lead.name, out.lead.email, out.lead.source, out.lead.stage_id, out.lead.last_contact_on], ['Sarah Kent', 'sarah.kent@example.invalid', 'email', 's-new', '2026-11-16']);
  assert.deepEqual([out.waiting.status, out.waiting.lead_id, out.link, out.event.kind, out.event.happened_on, out.toast], ['added', 'l-s', { email_id: 'e-s', coach_id: ME, person_kind: 'lead', person_id: 'l-s' }, 'email', '2026-11-16', 'Added to New.']);
  assert.equal(crm.leadFromWaiting({ ...waiting, name: '', email: 'jo.mensah@example.invalid' }, email, { id: 'l', eventId: 'e', coachId: ME, stages: STAGES, nowIso: NOW, todayKey: TODAY }).lead.name, 'Jo Mensah');
  assert.deepEqual([crm.dismissWaiting(waiting, NOW).status, crm.dismissWaiting(waiting, NOW).decided_at], ['dismissed', NOW]);
  assert.deepEqual(crm.waitingRows([waiting, { ...waiting, id: 'w2', status: 'dismissed' }, { ...waiting, id: 'w3', status: 'added' }]).map((w) => w.id), ['w1']);
});

test('an email opens with who and when, a hidden thread leaves every timeline, and nothing offers to send', () => {
  const emails = [{ id: 'e1', direction: 'in', from_name: 'Ruth Adeyemi', subject: 'Re: Discovery call', sent_at: local(TODAY, '08:40'), snippet: 'Can we start in January?', thread_key: 't1', source: 'gmail', link: 'https://mail.example.invalid/1', hidden: false },
    { id: 'e2', direction: 'out', subject: 'Discovery call', to_people: [{ name: 'Ruth Adeyemi', email: 'r@example.invalid' }], sent_at: local('2026-11-16', '09:00'), thread_key: 't1', source: 'copy_in', link: 'javascript:alert(1)', hidden: false }, { id: 'e3', thread_key: 't2', hidden: false }];
  const panel = crm.emailPanel(emails[0], TODAY);
  assert.deepEqual([panel.title, panel.from, panel.when, panel.hide, panel.open], ['Re: Discovery call', 'Ruth Adeyemi', 'Today, 08:40', 'Hide this thread', { label: 'Open in Gmail', href: 'https://mail.example.invalid/1' }]);
  assert.deepEqual([crm.emailPanel(emails[1], TODAY).from, crm.emailPanel(emails[1], TODAY).to, crm.emailPanel(emails[1], TODAY).when, crm.emailPanel(emails[1], TODAY).open], ['You', 'Ruth Adeyemi', 'Mon 16 Nov, 09:00', null]);
  assert.doesNotMatch(JSON.stringify(panel), /reply|send/i);
  const hidden = crm.hideThread(emails, emails[0]);
  assert.deepEqual([hidden.save.map((e) => [e.id, e.hidden]), hidden.undo.map((e) => e.hidden)], [[['e1', true], ['e2', true]], [false, false]]);
  assert.deepEqual([crm.emailTitle({ direction: 'out', subject: 'RE: Fwd: Dates' }), crm.emailTitle({ direction: 'in', from_name: 'Jo Mensah', subject: '' })], ['You replied: Dates', 'Jo emailed: No subject']);
});

// ---------------------------------------------------------------- past clients

test('check-ins are suggested at 3, 6 and 12 months after coaching ends, once each', () => {
  const ben = { id: 'p-ben', name: 'Ben Ortiz', ended_on: '2026-08-20' };
  const rows = crm.checkInsFor(ben, { coachId: ME, newId, existing: [] });
  assert.deepEqual(rows.map((r) => [r.months, r.due_on]), [[3, '2026-11-20'], [6, '2027-02-20'], [12, '2027-08-20']]);
  assert.deepEqual(crm.checkInsFor(ben, { coachId: ME, newId, existing: [{ profile_id: 'p-ben', months: 3 }] }).map((r) => r.months), [6, 12]);
  // The end of a month never rolls on to the next: 30 Nov and 3 months is 28 Feb.
  assert.equal(crm.checkInsFor({ id: 'p', ended_on: '2026-11-30' }, { coachId: ME, newId })[0].due_on, '2027-02-28');
  assert.deepEqual(crm.checkInsFor({ id: 'p', ended_on: null }, { coachId: ME, newId }), []);
  assert.deepEqual([crm.checkInName(6), crm.CHECK_INS_SWITCH, crm.checkInsOn({ crm: { suggest_check_ins: false } }), crm.checkInsOn({})], ['6-month check-in', 'Suggest check-ins at 3, 6 and 12 months', false, true]);
});

test('check-ins due are the next one a past client, within 30 days or overdue, soonest first (Today’s lines and Past clients)', () => {
  const profiles = [{ id: 'p-grace', name: 'Grace Liu', organisation_id: 'org-f' }, { id: 'p-ben', name: 'Ben Ortiz', organisation_id: null }, { id: 'p-leah', name: 'Leah Moran', organisation_id: 'org-h' }, { id: 'p-omar', name: 'Omar Haddad' }];
  const ci = (id, profileId, months, dueOn, extra = {}) => ({ id, profile_id: profileId, months, due_on: dueOn, done_at: null, skipped_at: null, ...extra });
  const checkIns = [ci('1', 'p-grace', 6, '2026-12-12'), ci('2', 'p-ben', 3, '2026-11-20'), ci('2b', 'p-ben', 6, '2026-12-01'), ci('3', 'p-leah', 12, '2026-11-10'), ci('4', 'p-omar', 3, '2027-01-30'), ci('5', 'p-omar', 3, '2026-11-18', { done_at: NOW }), ci('6', 'p-gone', 3, TODAY)];
  const due = crm.checkInsDue(checkIns, profiles, { todayKey: TODAY, organisations: [{ id: 'org-f', name: 'Fenwick Partners' }, { id: 'org-h', name: 'Harbour City FC' }] });
  assert.deepEqual(due.map((r) => [r.name, r.what, r.sub, r.when, r.overdue]), [
    ['Leah Moran', '12-month check-in', 'Harbour City FC', 'Due Tue 10 Nov', true], ['Ben Ortiz', '3-month check-in', 'Self-funded', 'Due Fri 20 Nov', false], ['Grace Liu', '6-month check-in', 'Fenwick Partners', 'Due Sat 12 Dec', false]]);
  assert.equal(crm.checkInsDue([ci('t', 'p-ben', 3, TODAY)], profiles, { todayKey: TODAY })[0].when, 'Due today');
});

test('a check-in note opens in the coach’s own email with the ask they chose, and nothing is sent', () => {
  const grace = { id: 'p-grace', name: 'Grace Liu', email: 'grace@example.invalid', ended_on: '2026-06-12' };
  const checkIn = { id: '1', profile_id: 'p-grace', months: 6, due_on: '2026-12-12', ask: 'referral' };
  assert.deepEqual([crm.suggestedAsk(3), crm.suggestedAsk(6), crm.suggestedAsk(12)], ['testimonial', 'referral', 'referral']);
  assert.deepEqual([crm.ASK_BUTTONS.referral.add, crm.ASK_BUTTONS.testimonial.add, crm.ASK_BUTTONS.referral.remove], ['Add referral ask', 'Add testimonial ask', 'Take out the referral ask']);
  const note = crm.checkInNote(grace, checkIn, { coachFirstName: 'Tim' });
  assert.match(note.body, /^Hi Grace,\n\nIt’s been 6 months since we finished working together/);
  assert.match(note.body, /I’d be glad to be introduced\.\n\nTim$/);
  assert.doesNotMatch(crm.checkInNote(grace, { months: 12, ask: null }).body, /introduced|few words/);
  assert.match(crm.checkInNote(grace, { months: 12 }).body, /It’s been a year since/);
  const sent = crm.checkInSend(grace, checkIn, note, NOW);
  assert.match(sent.href, /^mailto:grace@example\.invalid\?subject=How%20are%20things%3F&body=Hi%20Grace/);
  assert.deepEqual([sent.checkIn.done_at, sent.toast], [NOW, 'Your email opens with this note to Grace. Nothing is sent until you send it.']);
  assert.equal(crm.checkInSend({ name: 'Grace Liu' }, checkIn, note, NOW).href, null);
  const later = crm.checkInLater(checkIn, TODAY);
  assert.deepEqual([later.checkIn.due_on, later.toast, later.undo], ['2026-12-01', 'Moved to Tue 1 Dec.', checkIn]);
  assert.deepEqual(crm.checkInMeta(grace, checkIn, TODAY), ['6-month check-in, due Sat 12 Dec', 'Ended Fri 12 Jun']);
});

// ---------------------------------------------------------------- the account map

test('the account map has three parts: Who’s who, Agreements and proposals, and Room to grow', () => {
  assert.deepEqual(crm.ACCOUNT_MAP_PARTS, ['Who’s who', 'Agreements and proposals', 'Room to grow']);
  const org = { id: 'org-k', name: 'Kestrel Group' };
  const map = crm.accountMap({
    organisation: org, todayKey: TODAY,
    contacts: [
      { id: 'c1', organisation_id: 'org-k', name: 'Dana Whitfield', roles: ['sponsor'], note: 'Decides on renewals', last_contact_on: '2026-10-12', last_contact_how: 'spoke' },
      { id: 'c2', organisation_id: 'org-k', name: 'Jo Mensah', job_title: 'HR director', roles: ['hr'], note: 'Asked about team workshops', last_contact_on: '2026-11-03', last_contact_how: 'spoke' },
      { id: 'c3', organisation_id: 'org-k', name: 'Lee Hart', roles: ['invoices'], note: 'Invoices go to Lee', last_contact_on: '2026-11-06', last_contact_how: 'emailed' },
      { id: 'c4', organisation_id: 'other', name: 'Someone Else', roles: ['buyer'] },
    ],
    clients: [{ id: 'p-sam', organisation_id: 'org-k', name: 'Sam Okafor', job_title: 'Chief financial officer', status: 'active' }, { id: 'p-old', organisation_id: 'org-k', name: 'Old Client', status: 'past' }],
    adminClients: [{ name: 'Owen Price', coach_first_name: 'Maya', organisation_id: 'org-k' }],
    groups: [{ id: 'g1', organisation_id: 'org-k', name: 'Kestrel leadership team', size: 6 }],
    deals: [
      { id: 'd3', organisation_id: 'org-k', name: 'Team workshops for the leadership team', kind: 'proposal', status: 'sent', value: 5640, per: 'once', opens: 2, lead_id: 'chris' },
      { id: 'd1', organisation_id: 'org-k', name: 'Leadership Accelerator for Sam', kind: 'agreement', status: 'active', value: 13460, per: 'once', renews_on: '2027-03-08', opens: 0 },
      { id: 'd2', organisation_id: 'org-k', name: 'Portal seats', kind: 'agreement', status: 'active', value: 640, per: 'month', detail: '20 seats', renews_on: '2027-03-08', opens: 0 },
    ],
    growth: [
      { id: 'g-1', organisation_id: 'org-k', kind: 'seats', title: '6 of 20 seats are free.', note: 'The leadership team could use them for their own sprints.', status: 'open' },
      { id: 'g-2', organisation_id: 'org-k', kind: 'renewal', title: 'Owen’s coaching ends soon.', note: 'Maya is Owen’s coach.', status: 'open' },
      { id: 'g-3', organisation_id: 'org-k', kind: 'workshop', title: 'No workshop is booked for next quarter.', status: 'raised', lead_id: 'l-9' },
      { id: 'g-4', organisation_id: 'org-k', kind: 'other', title: 'Dropped.', status: 'dropped' },
    ],
  });
  assert.deepEqual(map.whosWho.map((r) => [r.name, r.role, r.note, r.last]), [
    ['Dana Whitfield', 'Sponsor', 'Decides on renewals', 'Spoke Mon 12 Oct'], ['Jo Mensah', 'HR', 'Asked about team workshops', 'Spoke Tue 3 Nov'], ['Lee Hart', 'Invoices', 'Invoices go to Lee', 'Emailed Fri 6 Nov'],
    ['Sam Okafor', 'Client', 'Chief financial officer', ''], ['Owen Price', 'Maya’s client', '', ''], ['Kestrel leadership team', 'Group of 6', '', '']]);
  // An associate's client shows by name only and never opens.
  assert.equal(map.whosWho[4].id, null);
  assert.deepEqual(map.deals.map((d) => [d.name, d.status, d.value, d.renews, d.opened, d.detail]), [
    ['Leadership Accelerator for Sam', 'Active', '£13,460', 'Renews Mon 8 Mar 2027', '', ''], ['Portal seats', 'Active', '£640/month', 'Renews Mon 8 Mar 2027', '', '20 seats'],
    ['Team workshops for the leadership team', 'Proposal sent', '£5,640', '', 'Opened 2 times', '']]);
  assert.equal(map.deals[1].valueSpoken, '£640 per month');
  assert.deepEqual(map.growth.map((g) => [g.title, g.action]), [['6 of 20 seats are free.', 'Offer the seats'], ['Owen’s coaching ends soon.', 'Plan a renewal'], ['No workshop is booked for next quarter.', 'Open the lead']]);
  assert.equal(map.nextRenewal, 'Mon 8 Mar 2027');
  const raised = crm.growthToLead({ id: 'g-1', kind: 'seats', title: '6 of 20 seats are free.', status: 'open' }, org, { id: 'l-g', coachId: ME, stages: STAGES, contacts: [{ organisation_id: 'org-k', name: 'Dana Whitfield', email: 'dana@example.invalid', roles: ['sponsor'] }] });
  assert.deepEqual([raised.lead.name, raised.lead.organisation, raised.lead.organisation_id, raised.lead.next_step, raised.growth.status, raised.growth.lead_id], ['Dana Whitfield', 'Kestrel Group', 'org-k', '6 of 20 seats are free', 'raised', 'l-g']);
});

// ---------------------------------------------------------------- the Leads pages' own rules
test('a won lead’s client keeps a mobile only in the form the client’s row takes', () => {
  const uk = crm.wonPlan({ ...AMY, phone: '07700 900461' }, { stages: STAGES, profileId: 'p', eventId: 'e', nowIso: NOW, todayKey: TODAY });
  assert.equal(uk.profile.mobile, '+447700900461');
  assert.equal(crm.wonPlan({ ...AMY, phone: 'ask the PA' }, { stages: STAGES, profileId: 'p', eventId: 'e', nowIso: NOW, todayKey: TODAY }).profile.mobile, null);
});

test('Leads narrowed by tags and by the coach’s own fields', () => {
  const tags = { amy: ['t-exec'], ruth: ['t-sport'] };
  const sector = { amy: 'Logistics', ruth: 'Sport', tom: 'Finance' };
  const c = { ...ctx, tagIds: (l) => tags[l.id] || [], fieldValue: (l, id) => (id === 'f-sector' ? sector[l.id] ?? null : null) };
  const open = crm.openLeads(LEADS);
  assert.deepEqual(crm.filterLeads(open, { tag: ['t-exec'] }, c).map((l) => l.id), ['amy']);
  assert.deepEqual(crm.filterLeads(open, { fields: { 'f-sector': ['Sport', 'Finance'] } }, c).map((l) => l.id).sort(), ['ruth', 'tom']);
  assert.deepEqual(crm.filterLeads(open, { fields: { 'f-sector': ['none'] } }, c).map((l) => l.id).sort(), ['chris', 'elena', 'leo']);
  assert.equal(crm.filterLeads(open, { tag: [], fields: { 'f-sector': [] } }, c).length, open.length);
  assert.equal(crm.leadFilterCount({ ...crm.EMPTY_LEAD_FILTERS, tag: ['t'], last: ['quiet'], fields: { a: ['x'], b: [] } }), 3);
  assert.equal(crm.leadFilterCount(crm.EMPTY_LEAD_FILTERS), 0);
});

test('a saved view of Leads puts the list back as it was, without the search', () => {
  const view = crm.leadViewFromList('  Quiet leads ', { filters: { ...crm.EMPTY_LEAD_FILTERS, last: ['quiet'], q: 'tom' }, sort: 'last_desc', hidden: ['value'], layout: 'table' });
  assert.deepEqual([view.name, view.sort, view.columns, view.layout, view.filters.q], ['Quiet leads', 'last_desc', ['value'], 'table', undefined]);
  assert.deepEqual(crm.leadListFromView(view), { filters: { ...crm.EMPTY_LEAD_FILTERS, last: ['quiet'] }, sort: 'last_desc', hidden: ['value'], layout: 'table' });
  assert.deepEqual(crm.leadListFromView({ filters: 'x', layout: 'grid' }), { filters: crm.EMPTY_LEAD_FILTERS, sort: 'next', hidden: [], layout: 'board' });
});

test('the table has one Value column: the lead’s own, where a field of that name would sit', () => {
  const fields = [{ id: 'f1', name: 'Sector', kind: 'choice' }, { id: 'f2', name: 'Value', kind: 'number' }, { id: 'f3', name: 'Renewal date', kind: 'date' }];
  assert.deepEqual(crm.leadTableColumns(fields).map((c) => c.label), ['Stage', 'Next step', 'Last contact', 'Sector', 'Value', 'Renewal date']);
  assert.deepEqual(crm.leadTableColumns(fields).map((c) => c.key), ['stage', 'next', 'last', 'field:f1', 'value', 'field:f3']);
  assert.deepEqual(crm.leadTableColumns([{ id: 'f9', name: 'Budget', kind: 'number' }]).map((c) => c.key), ['stage', 'next', 'last', 'value', 'field:f9']);
  assert.deepEqual(crm.leadTableColumns([{ id: 'f9', name: 'Budget', kind: 'number' }])[4].sorts, [['field:f9', 'Lowest first'], ['field:f9:desc', 'Highest first']]);
  assert.deepEqual(crm.leadOwnFields(fields).map((f) => f.id), ['f1', 'f3']);
});

test('a lead a booking made before 052 still shows its booking on the timeline, and never twice', () => {
  const booked = lead('b1', 'Ruth Adeyemi', null, { booking_id: 'bk-1', call_type_key: 'chemistry', created_at: '2026-11-15T10:00:00.000Z' });
  const lines = crm.bookingLines(booked, { events: [], booking: { id: 'bk-1', created_at: '2026-11-15T10:00:00.000Z' }, callName: 'Discovery call' });
  assert.deepEqual(lines.map((e) => [e.kind, e.title, e.detail]), [['first_contact', 'First contact', 'From the Discovery call page.'], ['booking', 'Booked a Discovery call', 'From your Discovery call page.']]);
  assert.deepEqual(crm.leadTimeline(lines, { todayKey: TODAY }).map((r) => r.title), ['Booked a Discovery call', 'First contact']);
  assert.deepEqual(crm.bookingLines(booked, { events: [{ lead_id: 'b1', kind: 'booking' }] }), []);
  assert.deepEqual(crm.bookingLines(AMY, { events: [] }), []);
});

test('a referrer typed by name is joined to the one Network person with that name, and only then', () => {
  const people = [{ id: 'p1', name: 'Dan Reid' }, { id: 'p2', name: 'Sam Lee' }, { id: 'p3', name: 'Sam Lee' }, { id: 'p4', name: 'Ann Bell', archived_at: '2026-01-01T00:00:00Z' }, { id: 'p5', name: 'Kit Low', merged_into: 'p1' }];
  assert.equal(crm.referrerOf(people, 'Dan Reid'), 'p1');
  assert.equal(crm.referrerOf(people, '  dan reid '), 'p1');
  assert.equal(crm.referrerOf(people, 'Dan'), null);
  assert.equal(crm.referrerOf(people, 'Sam Lee'), null);
  assert.equal(crm.referrerOf(people, 'Ann Bell'), null);
  assert.equal(crm.referrerOf(people, 'Kit Low'), null);
  assert.equal(crm.referrerOf(people, ''), null);
  assert.equal(crm.referrerOf(null, 'Dan Reid'), null);
  assert.deepEqual(crm.cameFromRow({ referred_by: 'Dan Reid', referred_by_person: 'p1' }), { label: 'Referred by', value: 'Dan Reid', personId: 'p1' });
});

test('the two lines the database writes for a booking (052, no title of their own) read as words, never blank', () => {
  const booked = lead('b2', 'Nell Okoye', null, { booking_id: 'bk-2', call_type_key: 'chemistry' });
  const db = [
    { id: 'x1', lead_id: 'b2', kind: 'first_contact', happened_at: '2026-11-17T08:59:59.000Z', happened_on: TODAY, title: null, detail: null, data: { source: 'chemistry_page' } },
    { id: 'x2', lead_id: 'b2', kind: 'booking', happened_at: '2026-11-17T09:00:00.000Z', happened_on: TODAY, title: null, detail: null, data: { booking_id: 'bk-2', call_type_key: 'chemistry' } },
  ];
  const rows = crm.leadTimeline(db, { lead: booked, todayKey: TODAY, callNames: { chemistry: 'Discovery call' } });
  assert.deepEqual(rows.map((r) => [r.title, r.lines]), [['Booked a Discovery call', ['From your Discovery call page.']], ['First contact', ['From the Discovery call page.']]]);
  // A client's page (no lead handed in) still words them, from the booking line's own call type.
  assert.deepEqual(crm.leadTimeline(db, { todayKey: TODAY, callNames: { chemistry: 'Discovery call' } }).map((r) => r.title), ['Booked a Discovery call', 'First contact']);
  assert.ok(crm.leadTimeline(db, { todayKey: TODAY }).every((r) => r.title));
  // What they answered when they booked shows under the newest booking line only.
  const answered = { ...booked, answers: { 'What would you like from the call?': 'To think through a new role.', 'Anything else?': '  ' } };
  const withAnswers = crm.leadTimeline([...db, { ...db[1], id: 'x0', happened_at: '2026-11-10T09:00:00.000Z', happened_on: '2026-11-10' }], { lead: answered, todayKey: TODAY, callNames: { chemistry: 'Discovery call' } });
  assert.deepEqual(withAnswers[0].lines, ['From your Discovery call page.', 'What would you like from the call? To think through a new role.']);
  assert.deepEqual(withAnswers[2].lines, ['From your Discovery call page.']);
  assert.deepEqual(crm.bookingAnswers({ answers: null }), []);
  assert.deepEqual(crm.bookingAnswers({ answers: ['x'] }), []);
  // A line with its own title keeps it.
  assert.equal(crm.leadTimeline([{ ...db[1], title: 'Booked a call' }], { todayKey: TODAY })[0].title, 'Booked a call');
});

test('Edit stages saved: renamed, added, moved and removed, with its leads moved first', () => {
  const draft = crm.stagesDraft(STAGES);
  assert.deepEqual(draft.map((d) => [d.name, d.likelihood, d.is_won]), [['New', '10', false], ['Call booked', '25', false], ['Proposal sent', '50', false], ['Deciding', '70', false], ['Won', '100', true]]);
  assert.deepEqual(crm.stagesSavePlan(STAGES, LEADS, draft, { coachId: ME }), { same: true });
  // Renamed, a new likelihood, one added before Won, two swapped.
  const edited = [{ ...draft[1] }, { ...draft[0], name: 'Enquiry', likelihood: '15%' }, draft[2], draft[3], { id: 's-x', name: 'Contract out', likelihood: '90', is_won: false, removed: false, toId: null }, draft[4]];
  const plan = crm.stagesSavePlan(STAGES, LEADS, edited, { coachId: ME });
  assert.deepEqual(plan.save.map(([t, r]) => [t, r.id, r.name, r.likelihood, r.position]), [['coach_lead_stages', 's-call', 'Call booked', 25, 0], ['coach_lead_stages', 's-new', 'Enquiry', 15, 1], ['coach_lead_stages', 's-x', 'Contract out', 90, 4]]);
  assert.deepEqual([plan.remove, plan.undo.remove, plan.undo.save.map(([, r]) => r.name), plan.toast], [[], [['coach_lead_stages', 's-x']], ['Call booked', 'New'], 'Stages saved.']);
  // Removed: Proposal sent's leads (the cold one too) go to the stage before it, and an automation naming it goes with it.
  const autos = [{ id: 'a1', trigger_stage_id: 's-prop', to_stage_id: null }, { id: 'a2', trigger_stage_id: null, to_stage_id: 's-dec' }];
  const cut = crm.stagesSavePlan(STAGES, LEADS, draft.map((d) => (d.id === 's-prop' ? { ...d, removed: true } : d)), { coachId: ME, automations: autos });
  assert.deepEqual(cut.save.filter(([t]) => t === 'coach_leads').map(([, l]) => [l.id, l.stage_id]), [['amy', 's-call'], ['chris', 's-call'], ['cold', 's-call']]);
  assert.deepEqual([cut.remove, cut.moved], [[['coach_automations', 'a1'], ['coach_lead_stages', 's-prop']], 2]);
  assert.deepEqual(cut.save.filter(([t]) => t === 'coach_lead_stages').map(([, s]) => [s.id, s.position]), [['s-dec', 2]]);
  assert.deepEqual(cut.undo.save.map(([t, r]) => `${t}:${r.id}`), ['coach_lead_stages:s-dec', 'coach_lead_stages:s-prop', 'coach_leads:amy', 'coach_leads:chris', 'coach_leads:cold', 'coach_automations:a1']);
  // Where they go can be chosen; a stage that is going too is never chosen.
  const chosen = crm.stagesSavePlan(STAGES, LEADS, draft.map((d) => (d.id === 's-prop' ? { ...d, removed: true, toId: 's-dec' } : d)), { coachId: ME });
  assert.deepEqual(chosen.save.filter(([t]) => t === 'coach_leads').map(([, l]) => l.stage_id), ['s-dec', 's-dec', 's-dec']);
  const both = crm.stagesSavePlan(STAGES, LEADS, draft.map((d) => (d.id === 's-prop' ? { ...d, removed: true, toId: 's-call' } : d.id === 's-call' ? { ...d, removed: true } : d)), { coachId: ME });
  assert.deepEqual(both.save.filter(([t]) => t === 'coach_leads').map(([, l]) => [l.id, l.stage_id]), [['ruth', 's-new'], ['amy', 's-new'], ['chris', 's-new'], ['cold', 's-new']]);
  // What can't be saved says why.
  assert.equal(crm.stagesSavePlan(STAGES, LEADS, draft.map((d) => (d.is_won ? d : { ...d, removed: true })), { coachId: ME }).error, 'A pipeline needs at least one stage before Won.');
  assert.deepEqual(crm.stagesSavePlan(STAGES, LEADS, draft.map((d) => (d.id === 's-dec' ? { ...d, name: ' new ' } : d)), { coachId: ME }), { error: 'There’s already a stage called New. Choose another name.', at: 's-dec' });
  assert.equal(crm.stagesSavePlan(STAGES, LEADS, draft.map((d) => (d.id === 's-dec' ? { ...d, likelihood: '140' } : d)), { coachId: ME }).error, 'Type a number from 0 to 100.');
  // Won keeps 100% and its place; its name can change.
  const renamed = crm.stagesSavePlan(STAGES, LEADS, draft.map((d) => (d.is_won ? { ...d, name: 'Signed', likelihood: '20' } : d)), { coachId: ME });
  assert.deepEqual(renamed.save.map(([, s]) => [s.id, s.name, s.likelihood, s.position]), [['s-won', 'Signed', 100, crm.WON_POSITION]]);
});

test('Edit details saved: what was typed, checked, with the stage left for its own move', () => {
  const orgs = [{ id: 'org-k', name: 'Kestrel Group' }];
  const out = crm.leadDetailsPatch(ELENA, { name: ' Elena Ruiz ', organisation: 'kestrel group', job_title: 'Founder', email: 'Elena@Example.invalid', phone: '07700 900100', stageId: 's-call', next_step: 'Send the outline', next_step_on: '2026-11-20', value: '£8,000', source: 'referral', referred_by: 'Dan Reid' }, { organisations: orgs });
  assert.deepEqual([out.lead.name, out.lead.organisation, out.lead.organisation_id, out.lead.email, out.lead.phone, out.lead.value, out.lead.source, out.lead.referred_by, out.lead.next_step, out.lead.next_step_on, out.lead.stage_id, out.toStageId],
    ['Elena Ruiz', 'kestrel group', 'org-k', 'elena@example.invalid', '07700 900100', 8000, 'referral', 'Dan Reid', 'Send the outline', '2026-11-20', 's-new', 's-call']);
  assert.deepEqual(crm.leadDetailsPatch(ELENA, { name: ' ' }), { error: 'Type their name to carry on.', at: 'name' });
  assert.deepEqual(crm.leadDetailsPatch(ELENA, { name: 'E', email: 'nope' }), { error: 'That email doesn’t look right. Check it and try again.', at: 'email' });
  assert.deepEqual(crm.leadDetailsPatch(ELENA, { name: 'E', value: 'lots' }), { error: 'Type an amount in numbers, such as 13,500.', at: 'value' });
  // A next step taken out takes its day with it; who referred them is kept only for a referral; the same stage is no move.
  const cleared = crm.leadDetailsPatch(AMY, { name: 'Amy Cole', email: 'amy@example.invalid', organisation: 'Northfield Logistics', next_step: '', next_step_on: '2026-11-19', value: '13500', source: 'other', referred_by: 'Hannah Wells', stageId: 's-prop' });
  assert.deepEqual([cleared.lead.next_step, cleared.lead.next_step_on, cleared.lead.referred_by, cleared.lead.referred_by_person, cleared.lead.organisation_id, cleared.toStageId], [null, null, null, null, 'org-n', null]);
  assert.equal(crm.leadDetailsPatch(AMY, { name: 'Amy Cole', source: 'referral', referred_by: 'Hannah Wells', value: '' }).lead.referred_by_person, 'np-hannah');
});

test('a spreadsheet that can’t be read here says so calmly; search finds open and cold leads; automations say what they did', () => {
  // An Excel workbook is read (xlsx.js's xlsxTable); an older or other spreadsheet kind says what to do instead.
  assert.equal(crm.importFileProblem('Leads 2026.xlsx'), '');
  assert.equal(crm.isXlsxFile('Leads 2026.XLSX'), true);
  assert.equal(crm.isXlsxFile('leads.csv'), false);
  assert.equal(crm.importFileProblem('Leads 2003.xls'), 'That kind of spreadsheet can’t be read here. Save it as Excel (.xlsx) or CSV, or copy the rows and paste them.');
  assert.equal(crm.importFileProblem('leads.pdf'), 'That file can’t be read here. Save it as Excel or CSV, or copy the rows and paste them.');
  assert.equal(crm.importFileProblem('leads.xlsx', 9 * 1024 * 1024), 'That file is too big. Split it, or paste the rows instead.');
  assert.equal(crm.importFileProblem('leads.CSV', 2000), '');
  assert.equal(crm.importFileProblem('leads.csv', 9 * 1024 * 1024), 'That file is too big. Split it, or paste the rows instead.');
  const found = crm.leadSearchItems([...LEADS, { ...ELENA, id: 'gone', merged_into: 'elena' }], STAGES);
  assert.deepEqual(found.map((i) => [i.title, i.kind]), [['Amy Cole', 'Lead'], ['Chris Lowe', 'Lead'], ['Tom Hale', 'Lead'], ['Elena Ruiz', 'Lead'], ['Ruth Adeyemi', 'Lead'], ['Priya Menon', 'Cold lead']]);
  assert.equal(found[0].to, '/coach/leads/amy');
  assert.equal(crm.automationsSaid({ ran: 0, todos: 0, moves: 0 }), '');
  assert.equal(crm.automationsSaid({ todos: 1, moves: 0 }), 'An automation added a to-do.');
  assert.equal(crm.automationsSaid({ todos: 2, moves: 1 }), 'Automations added 2 to-dos. An automation moved the lead on.');
});
