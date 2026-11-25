// The coach authenticator's stop, wired into the one place that decides
// what someone owes before the portal opens (Phase 6a run 5; builder B):
// src/lib/signIn/flow.js's signInStop with `coach`, stopPath and goToStop,
// and the small rules the screens use from coachAuth.js (isCoachPlace,
// sessionKeyOf, the wrong-codes count kept for the tab). Supabase is stood
// in; nothing reaches a network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { goToStop, signInStop, stopPath } from '../../src/lib/signIn/flow.js';
import { isCoachPlace, keepTries, NO_WRONG_TRIES, readTries, sessionKeyOf, afterWrongCode, SIGNED_OUT_BY_RESET, COACH_AUTH_PATHS } from '../../src/lib/signIn/coachAuth.js';
import { forgetCoachAuthReady } from '../../src/lib/signIn/coachAuthData.js';

const memory = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
globalThis.localStorage = memory();

function supabase({ coach = true, there = true, state = {}, factor = null, level = 'aal1', next = null } = {}) {
  const asked = [];
  return {
    asked,
    rpc: async (name) => {
      asked.push(name);
      if (!there) return { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } };
      return { data: coach ? { coach: true, owner: false, codes_left: 10, codes_total: 10, codes_saved: true, session_ok: true, ...state } : { coach: false }, error: null };
    },
    from: () => ({ select: () => ({ eq: () => ({ limit: async () => ({ data: coach ? [{ id: 'c1', role: 'coach', active: true }] : [], error: null }) }) }) }),
    auth: {
      mfa: {
        listFactors: async () => ({ data: { totp: factor ? [factor] : [] } }),
        getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: level, nextLevel: next || (factor ? 'aal2' : level) } }),
      },
      signOut: async () => { asked.push('signOut'); return {}; },
    },
  };
}
const verified = { id: 'f1', factor_type: 'totp', status: 'verified' };
const user = (factors = []) => ({ id: 'u1', factors, user_metadata: { terms_accepted: true }, app_metadata: { provider: 'email' } });

test('a coach heading into the coach portal owes set-up, the code, then the codes; then nothing', async () => {
  forgetCoachAuthReady();
  assert.equal(await signInStop(supabase(), user(), { coach: true }), 'setup');
  forgetCoachAuthReady();
  assert.equal(await signInStop(supabase({ factor: verified }), user([verified]), { coach: true }), 'code');
  forgetCoachAuthReady();
  assert.equal(await signInStop(supabase({ factor: verified, level: 'aal2', state: { codes_saved: false } }), user([verified]), { coach: true }), 'codes');
  forgetCoachAuthReady();
  assert.equal(await signInStop(supabase({ factor: verified, level: 'aal2' }), user([verified]), { coach: true }), null);
  forgetCoachAuthReady();
  assert.equal(await signInStop(supabase({ factor: verified, level: 'aal2', state: { session_ok: false } }), user([verified]), { coach: true }), 'signedOut');
});

test('before 053: set-up is still owed, the codes never are', async () => {
  forgetCoachAuthReady();
  assert.equal(await signInStop(supabase({ there: false }), user(), { coach: true }), 'setup');
  forgetCoachAuthReady();
  assert.equal(await signInStop(supabase({ there: false, factor: verified, level: 'aal2' }), user([verified]), { coach: true }), null);
});

test('clients are never asked about any of this', async () => {
  forgetCoachAuthReady();
  const sb = supabase({ coach: false });
  assert.equal(await signInStop(sb, user(), { coach: true }), null);
  forgetCoachAuthReady();
  const plain = supabase({ coach: false });
  assert.equal(await signInStop(plain, user()), null);
  assert.deepEqual(plain.asked, [], 'a client page asks nothing of 053');
});

test('without `coach`, the older rule stands (an authenticator still asks for its code)', async () => {
  forgetCoachAuthReady();
  const sb = supabase({ factor: verified, next: 'aal2' });
  assert.equal(await signInStop(sb, user([verified])), 'code');
  assert.deepEqual(sb.asked, []);
});

test('each stop has its address, and a reset sign-in is let go on Coach sign in', async () => {
  assert.equal(stopPath('setup'), COACH_AUTH_PATHS.setUp);
  assert.equal(stopPath('codes'), COACH_AUTH_PATHS.codes);
  assert.equal(stopPath('code'), '/coach/sign-in/code');
  assert.equal(stopPath('before'), '/auth/before-you-start');
  const went = [];
  await goToStop(supabase({ state: { session_ok: false, ended_by: 'reset' } }), (to, o) => went.push([to, o]), 'signedOut');
  assert.equal(went[0][0], '/coach/sign-in');
  assert.deepEqual(went[0][1].state, { message: SIGNED_OUT_BY_RESET, signOut: true });
  // A sign-in that is simply gone says only "Please sign in again." (follow-up 5, item 13).
  await goToStop(supabase({ state: { session_ok: false, ended_by: 'session' } }), (to, o) => went.push([to, o]), 'signedOut');
  assert.deepEqual(went[1][1].state, { message: ['Please sign in again.'], signOut: true });
});

test('the coach portal’s addresses, never its sign-in pages', () => {
  assert.equal(isCoachPlace('/coach'), true);
  assert.equal(isCoachPlace('/coach/settings/coaches'), true);
  assert.equal(isCoachPlace('/coach?x=1'), true);
  assert.equal(isCoachPlace('/coach/sign-in'), false);
  assert.equal(isCoachPlace('/coach/sign-in/set-up'), false);
  assert.equal(isCoachPlace('/coaching'), false);
  assert.equal(isCoachPlace('/welcome'), false);
  assert.equal(isCoachPlace(null), false);
});

test('the sign-in’s own session id, read from its token', () => {
  const part = Buffer.from(JSON.stringify({ sub: 'u1', session_id: 's-123' })).toString('base64url');
  assert.equal(sessionKeyOf(`h.${part}.sig`), 's-123');
  assert.equal(sessionKeyOf('not a token'), null);
  assert.equal(sessionKeyOf(null), null);
});

test('the wrong-codes count is kept for the tab, and cleared by a right code', () => {
  const tab = memory();
  assert.deepEqual(readTries(tab), NO_WRONG_TRIES);
  let s = NO_WRONG_TRIES;
  for (let i = 0; i < 4; i += 1) { s = afterWrongCode(s, 1000); keepTries(s, tab); }
  assert.equal(readTries(tab).tries, 4);
  s = afterWrongCode(readTries(tab), 1000);
  keepTries(s, tab);
  assert.equal(readTries(tab).waitUntil, 31000);
  keepTries(NO_WRONG_TRIES, tab);
  assert.deepEqual(readTries(tab), NO_WRONG_TRIES);
  tab.setItem('clarity-sign-in-code-tries', '{nonsense');
  assert.deepEqual(readTries(tab), NO_WRONG_TRIES);
});
