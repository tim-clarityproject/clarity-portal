// Guests choose who sees their answers (Tim, 14 Nov, 09:52; migration 044):
// the lines under the choice, the choice kept on the device until the
// database has it, when the coach's email may be asked for, the claims after
// sign-in, and the one-off tip's words for a claimed Health Check's team.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SHARED_BY_DEFAULT, forgetChoice, functionMissing, keepChoice, keptChoice, mayTellCoach, openingChoice, saveChoice,
  sendKeptChoice, sharingLine,
} from '../../src/lib/guest/sharing.js';
import { claimOutsideWork } from '../../src/lib/guest/claimRules.js';
import { claimedTip, teamWords, teamsFrom } from '../../src/lib/healthCheck/inside.js';

function memory() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    keys: () => [...m.keys()],
  };
}
const MISSING = Object.assign(new Error('Could not find the function'), { code: 'PGRST202' });

test('the line under the choice, from one function (M7b, word for word)', () => {
  assert.equal(sharingLine('Tim', true), 'Tim sent you the link and will see your results.');
  assert.equal(sharingLine('Tim', false), 'Tim won’t see your answers, but you still get your PDF.');
  assert.equal(sharingLine('  Adie ', true), 'Adie sent you the link and will see your results.');
  assert.equal(sharingLine('', true), 'Your coach sent you the link and will see your results.');
  assert.equal(sharingLine(null, false), 'Your coach won’t see your answers, but you still get your PDF.');
});

test('You and the coach is the default', () => {
  assert.equal(SHARED_BY_DEFAULT, true);
  assert.equal(openingChoice(null, null), true);
});

test('the opening choice: a choice not yet sent wins, then the database, then the device', () => {
  assert.equal(openingChoice({ shared: false, sent: false }, true), false, 'Only you chosen before 044 ran, not sent yet');
  assert.equal(openingChoice({ shared: true, sent: true }, false), false, 'the database wins over a sent copy');
  assert.equal(openingChoice({ shared: false, sent: true }, null), false, 'before 044: the device');
  assert.equal(openingChoice(null, false), false);
});

test('a choice is kept for the visit, and marked sent once the database has it', async () => {
  const s = memory();
  const sent = [];
  const r = await saveChoice('hc:abc', false, async (v) => { sent.push(v); return { ok: true, notified: false }; }, s);
  assert.deepEqual(r, { shared: false, sent: true, missing: false, notified: false });
  assert.deepEqual(sent, [false]);
  assert.deepEqual(keptChoice('hc:abc', s), { shared: false, sent: true });
  assert.equal(await sendKeptChoice('hc:abc', async () => { throw new Error('never asked'); }, s), null, 'nothing waits');
});

test('before 044 runs: kept on the device, nothing thrown, sent once the function answers', async () => {
  const s = memory();
  const r = await saveChoice('guest:t', false, async () => { throw MISSING; }, s);
  assert.deepEqual(r, { shared: false, sent: false, missing: true, notified: undefined });
  assert.deepEqual(keptChoice('guest:t', s), { shared: false, sent: false });
  // the next open: still not there
  assert.equal((await sendKeptChoice('guest:t', async () => ({ ok: false, missing: true }), s)).sent, false);
  // ... then 044 has run
  const later = await sendKeptChoice('guest:t', async (v) => ({ ok: v === false }), s);
  assert.equal(later.sent, true);
  assert.deepEqual(keptChoice('guest:t', s), { shared: false, sent: true });
});

test('no connection: kept, not sent, and a refusal the page acts on is thrown back', async () => {
  const s = memory();
  const r = await saveChoice('guest:x', true, async () => { throw new TypeError('Failed to fetch'); }, s);
  assert.equal(r.sent, false);
  assert.equal(r.missing, false);
  await assert.rejects(() => saveChoice('guest:x', true, async () => { throw Object.assign(new Error('ended'), { refused: true }); }, s));
});

test('switching to Only you halfway, then back', async () => {
  const s = memory();
  const db = { shared: true };
  const send = async (v) => { db.shared = v; return { ok: true }; };
  await saveChoice('hc:half', false, send, s);
  assert.equal(db.shared, false);
  assert.equal(mayTellCoach(keptChoice('hc:half', s).shared), false, 'no coach email while it is Only you');
  await saveChoice('hc:half', true, send, s);
  assert.equal(db.shared, true);
  assert.equal(mayTellCoach(keptChoice('hc:half', s).shared), true);
});

test('the kept choice reads only what the page wrote', () => {
  const s = memory();
  s.setItem('clarity-share:bad', '{"shared":"yes"}');
  assert.equal(keptChoice('bad', s), null);
  s.setItem('clarity-share:worse', 'not json');
  assert.equal(keptChoice('worse', s), null);
  keepChoice('ok', true, false, s);
  forgetChoice('ok', s);
  assert.equal(keptChoice('ok', s), null);
  assert.equal(keptChoice('any', { getItem() { throw new Error('blocked'); } }), null, 'storage blocked');
});

test('a missing function is recognised the ways PostgREST and Postgres say it', () => {
  assert.equal(functionMissing({ code: 'PGRST202' }), true);
  assert.equal(functionMissing({ code: '42883' }), true);
  assert.equal(functionMissing({ status: 404 }), true);
  assert.equal(functionMissing({ code: '42501' }), false);
  assert.equal(functionMissing(null), false);
});

test('the claims after sign-in: both asked once, a missing one asked again next time', async () => {
  const s = memory();
  const asked = [];
  let has044 = false;
  const rpc = async (name) => {
    asked.push(name);
    if (name === 'alignment_claim' && !has044) return { data: null, error: { code: 'PGRST202' } };
    return { data: name === 'guest_claim' ? 2 : 1, error: null };
  };
  assert.deepEqual(await claimOutsideWork('u1', { rpc, storage: s }), { guest: 2, healthChecks: 0 });
  assert.deepEqual(asked, ['guest_claim', 'alignment_claim']);
  // 044 runs; the next sign-in in this tab asks only the one still to ask
  has044 = true;
  asked.length = 0;
  assert.deepEqual(await claimOutsideWork('u1', { rpc, storage: s }), { guest: 0, healthChecks: 1 });
  assert.deepEqual(asked, ['alignment_claim']);
  asked.length = 0;
  assert.deepEqual(await claimOutsideWork('u1', { rpc, storage: s }), { guest: 0, healthChecks: 0 });
  assert.deepEqual(asked, []);
  // another account asks for itself
  assert.deepEqual(await claimOutsideWork('u2', { rpc, storage: s }), { guest: 2, healthChecks: 1 });
  // nobody signed in asks nothing
  asked.length = 0;
  assert.deepEqual(await claimOutsideWork(null, { rpc, storage: s }), { guest: 0, healthChecks: 0 });
  assert.deepEqual(asked, []);
});

test('the claims: the earlier mark ("1", guest work only) still counts, and a thrown call is calm', async () => {
  const s = memory();
  s.setItem('clarity-guest-claim:u3', '1');
  const asked = [];
  const rpc = async (name) => { asked.push(name); throw new Error('offline'); };
  assert.deepEqual(await claimOutsideWork('u3', { rpc, storage: s }), { guest: 0, healthChecks: 0 });
  assert.deepEqual(asked, ['alignment_claim']);
});

test('the one-off tip names a claimed Health Check\'s team so it reads well', () => {
  assert.equal(teamWords('Leadership team'), 'the Leadership team');
  assert.equal(teamWords('Northfield Logistics'), 'Northfield Logistics');
  assert.equal(teamWords('My team'), 'My team');
  assert.equal(teamWords('The sales team'), 'The sales team');
  const row = {
    id: 'claimed1', tool_type: 'strategic-alignment', title: 'Northfield Logistics', status: 'completed', created_at: '2026-04-03 09:00:00',
    form_data: {
      shape: 2, team: { id: 't-n', name: 'Northfield Logistics' }, date: '2026-04-03', made: 'team', from: null,
      data: { objective: 'Grow', csfs: [{ id: 'f1', text: 'Win clients' }], projects: [{ id: 'p1', text: 'CRM' }] },
      step: null, shared_with_coach: false, from_outside: { at: '2026-04-03T09:00:00.000Z', organisation: 'Northfield Logistics' },
    },
  };
  const teams = teamsFrom([row]);
  assert.equal(claimedTip(teams).text, 'Your April Health Check, done outside the portal, is now with Northfield Logistics.');
  assert.equal(teams[0].versions[0].shared, false, 'the guest’s Only you came with it');
});
