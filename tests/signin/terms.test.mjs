// The terms rule (Tim, 11 Nov): one tick box, and the agreement is stored
// the same way for an email sign-up, a Google sign-up and an invite. A
// Google account the portal has never seen gets Before you start.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasAgreed, needsBeforeYouStart, recordAgreement, startedWithGoogle, termsRecord, tickCounts, TERMS_DOCUMENTS, TICK_LASTS_MS, TICK_THE_BOX } from '../../src/lib/signIn/terms.js';

const at = new Date('2026-11-13T09:30:00.000Z');

test('the record is the one migration 021 reads: accepted, when, and which documents', () => {
  assert.deepEqual(termsRecord(at), {
    terms_accepted: true,
    terms_accepted_at: '2026-11-13T09:30:00.000Z',
    terms_documents: ['Terms of Service', 'Privacy Policy', 'Data Storage Notice'],
  });
  assert.equal(TERMS_DOCUMENTS.length, 3);
  assert.throws(() => termsRecord('not a time'), /real time/);
});

test('the words beside the box', () => {
  assert.equal(TICK_THE_BOX, 'Tick the box to carry on.');
});

test('a Google account the portal has never seen gets Before you start', () => {
  const fresh = { id: 'u1', app_metadata: { provider: 'google', providers: ['google'] }, user_metadata: { name: 'Sam Carter' } };
  assert.equal(startedWithGoogle(fresh), true);
  assert.equal(hasAgreed(fresh), false);
  assert.equal(needsBeforeYouStart(fresh), true);
});

test('once the box is ticked it is never asked again', () => {
  const agreed = { id: 'u1', app_metadata: { provider: 'google' }, user_metadata: { name: 'Sam Carter', ...termsRecord(at) } };
  assert.equal(needsBeforeYouStart(agreed), false);
});

test('an email account that adds Google later is one account, and is not asked again', () => {
  const linked = { id: 'u2', app_metadata: { provider: 'email', providers: ['email', 'google'] }, user_metadata: {} };
  assert.equal(needsBeforeYouStart(linked), false);
  const older = { id: 'u3', app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {} };
  assert.equal(needsBeforeYouStart(older), false);
});

test('only a real true counts as agreed', () => {
  for (const v of ['true', 1, 'yes', null, undefined, {}]) {
    assert.equal(hasAgreed({ user_metadata: { terms_accepted: v } }), false, String(v));
  }
  assert.equal(needsBeforeYouStart(null), false);
});

test('a tick made just before Google counts, an old one does not', () => {
  const ticked = new Date(at.getTime() - 60 * 1000).toISOString();
  assert.equal(tickCounts(ticked, at), true);
  assert.equal(tickCounts(new Date(at.getTime() - TICK_LASTS_MS - 1000).toISOString(), at), false);
  assert.equal(tickCounts(new Date(at.getTime() + 60 * 1000).toISOString(), at), false);
  for (const bad of [null, '', 'yes', 'true']) assert.equal(tickCounts(bad, at), false);
});

test('recording saves the same record on the account, then the profile', async () => {
  const seen = [];
  const supabase = {
    auth: { updateUser: async (v) => { seen.push(['account', v]); return { data: { user: { id: 'u1', user_metadata: v.data } }, error: null }; } },
    from: (table) => ({ update: (v) => ({ eq: async (col, id) => { seen.push([table, v, col, id]); return { error: null }; } }) }),
  };
  const out = await recordAgreement(supabase, 'u1', at);
  assert.equal(out.error, null);
  assert.equal(hasAgreed(out.user), true);
  assert.deepEqual(seen, [
    ['account', { data: termsRecord(at) }],
    ['profiles', { terms_accepted: true }, 'id', 'u1'],
  ]);
});

test('if the account can’t be saved, nothing claims it was', async () => {
  const supabase = { auth: { updateUser: async () => ({ error: { message: 'no' } }) }, from: () => { throw new Error('not reached'); } };
  const out = await recordAgreement(supabase, 'u1', at);
  assert.deepEqual(out.error, { message: 'no' });
  assert.equal(out.user, null);
  const thrown = await recordAgreement({ auth: { updateUser: async () => { throw new Error('offline'); } } }, 'u1', at);
  assert.equal(thrown.error.message, 'offline');
});

// The functionality tester, 13 Nov.
test('a carried tick agrees only from a page that shows the box, and only for an account that hasn’t agreed', async () => {
  const { tickAgreesFor, invitedNotSetUp } = await import('../../src/lib/signIn/terms.js');
  const fresh = { id: 'u1', app_metadata: { provider: 'google' }, user_metadata: {} };
  assert.equal(tickAgreesFor(at, '/auth/sign-up', fresh), true);
  assert.equal(tickAgreesFor(at, '/auth/invite', fresh), true);
  // Ticked on Create my account, Google left with the browser's Back, then
  // someone signs in with Google from Sign in: the old tick agrees for nobody.
  assert.equal(tickAgreesFor(at, '/auth/login', fresh), false);
  assert.equal(tickAgreesFor(at, '/coach/sign-in', fresh), false);
  assert.equal(tickAgreesFor(null, '/auth/sign-up', fresh), false);
  assert.equal(tickAgreesFor(at, '/auth/sign-up', null), false);
  // An account a coach set up that uses Google on its invite: it began
  // with an email, and its tick is still saved.
  const invited = { id: 'u4', invited_at: '2026-11-10T09:00:00Z', app_metadata: { provider: 'email', providers: ['email', 'google'] }, user_metadata: { first_name: 'Sam' } };
  assert.equal(tickAgreesFor(at, '/auth/invite', invited), true);
  assert.equal(invitedNotSetUp(invited), true);
  // Already agreed: nothing is written again.
  const agreed = { ...invited, user_metadata: { ...termsRecord(at) } };
  assert.equal(tickAgreesFor(at, '/auth/invite', agreed), false);
  assert.equal(invitedNotSetUp(agreed), false);
  // Never invited: the invite's page is not theirs.
  assert.equal(invitedNotSetUp({ id: 'u5', user_metadata: {} }), false);
  assert.equal(invitedNotSetUp(null), false);
});
