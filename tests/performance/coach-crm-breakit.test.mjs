// The break-it tester's rules for Leads (Phase 6a run 4, 21 Nov): what a
// person is told when a save is refused, and which lead a merge keeps.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BOTH_WON, CRM_SAVE_PROBLEM, crmProblem, isRefusal, leadDuplicates, mergePair } from '../../src/lib/coach/crm.js';

test('a refused save is said calmly, never in the database’s own technical words', () => {
  const calm = 'That couldn’t be kept as it is. It may have just changed in another tab, so check it and try again.';
  assert.equal(crmProblem({ code: '23514', message: 'new row for relation "coach_leads" violates check constraint "coach_leads_crm_lengths"' }), calm);
  assert.equal(crmProblem({ code: '23505', message: 'duplicate key value violates unique constraint "coach_lead_stages_one_name"' }), calm);
  assert.equal(crmProblem({ code: '23503', message: 'insert or update on table "coach_leads" violates foreign key constraint "coach_leads_stage_id_fkey"' }), calm);
  assert.equal(crmProblem({ code: '22P02', message: 'invalid input syntax for type uuid: "x"' }), calm);
  assert.equal(crmProblem({ code: '42501', message: 'new row violates row-level security policy for table "coach_boards"' }), 'That didn’t save, because it is the owner’s to change.');
  // A sentence the database or the app wrote for people stays as it is.
  assert.equal(crmProblem({ code: '22023', message: 'One of these has already been merged.' }), 'One of these has already been merged.');
  assert.equal(crmProblem(new Error('Type their name to carry on.')), 'Type their name to carry on.');
  // No connection.
  assert.equal(crmProblem({ message: 'TypeError: Failed to fetch' }), CRM_SAVE_PROBLEM);
  assert.equal(crmProblem(null), CRM_SAVE_PROBLEM);
  assert.equal(crmProblem({ code: 'PGRST301', message: 'JWT expired' }), CRM_SAVE_PROBLEM);
  assert.deepEqual(['23514', '42501', '22023', 'PGRST204', '08006', undefined].map((code) => isRefusal({ code })), [true, true, true, true, false, false]);
});

test('Merge into one keeps a won lead (its client carries its timeline); two clients stay as two', () => {
  const won = { id: 'w', name: 'Leo Grant', won_at: '2026-11-13T10:00:00Z', won_profile_id: 'p' };
  const open = { id: 'o', name: 'Leo G.' };
  assert.deepEqual(mergePair(open, won), { a: won, b: open });
  assert.deepEqual(mergePair(won, open), { a: won, b: open });
  assert.deepEqual(mergePair(open, { id: 'x', name: 'Other' }), { a: open, b: { id: 'x', name: 'Other' } });
  assert.deepEqual(mergePair(won, { ...won, id: 'w2' }), { error: BOTH_WON });
  assert.equal(mergePair(open, open), null);
  // Two won leads of one name are never suggested as one person.
  assert.equal(leadDuplicates([won, { ...won, id: 'w2' }]).length, 0);
  assert.equal(leadDuplicates([won, { ...open, name: 'Leo Grant' }]).length, 1);
});

test('a forwarded email with 60 people on it keeps 50 of each list, the most the database takes (break-it, 21 Nov)', async () => {
  const { readInbound } = await import('../../src/lib/coach/connect/copyInEmail.js');
  const { peopleOk } = await import('../coach/crm-standin.mjs');
  const sixty = Array.from({ length: 60 }, (_, i) => `Person ${i} <p${i}@example.invalid>`).join(', ');
  const read = readInbound({ from: 'Alex Morgan <alex@example.invalid>', to: sixty, cc: sixty, bcc: ['log.alex.7kx2m4qa@in.example.invalid'], subject: 'Sixty people', text: 'Hello all.', message_id: '<sixty@mail.example.invalid>' }, { domain: 'in.example.invalid' });
  assert.equal(read.kind, 'log');
  assert.deepEqual([read.email.to.length, read.email.cc.length], [50, 50]);
  assert.ok(peopleOk(read.email.to) && peopleOk(read.email.cc));
});

test('Add as a lead pressed in two tabs makes the same lead and line: their ids come from the waiting row (break-it, 21 Nov)', async () => {
  const { leadFromWaiting, sameId } = await import('../../src/lib/coach/crm.js');
  const waiting = { id: '00000000-0000-4000-8000-000000009066', coach_id: 'c', email_id: '00000000-0000-4000-8000-000000009065', name: 'Sarah Kent', email: 'sarah@example.invalid', status: 'waiting' };
  const stages = [{ id: 's', name: 'New', likelihood: 10, position: 0 }];
  const one = leadFromWaiting(waiting, null, { coachId: 'c', stages, nowIso: '2026-11-17T09:00:00.000Z', todayKey: '2026-11-17' });
  const two = leadFromWaiting(waiting, null, { coachId: 'c', stages, nowIso: '2026-11-17T09:00:01.000Z', todayKey: '2026-11-17' });
  assert.deepEqual([one.lead.id, one.event.id], [two.lead.id, two.event.id]);
  assert.equal(one.lead.id, waiting.id);
  assert.notEqual(one.event.id, waiting.id);
  assert.match(one.event.id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  assert.equal(sameId(waiting.id, 1), sameId(waiting.id, 1));
  assert.notEqual(sameId(waiting.id, 1), sameId(waiting.id, 2));
  assert.equal(sameId('not an id'), null);
});

test('an amount over 100,000,000 (the database’s most) is said before it is saved, never refused by the database (break-it, 21 Nov)', async () => {
  const { moneyFromTyped } = await import('../../src/lib/coach/crm.js');
  assert.deepEqual(['100000000', '100,000,001', '999999999', '1e12', '-1', 'ten', '£13,500', '13.5k'].map(moneyFromTyped), [100000000, undefined, undefined, undefined, undefined, undefined, 13500, 13500]);
});
