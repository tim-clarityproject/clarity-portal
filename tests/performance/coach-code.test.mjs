// The coach's 6-digit code on the server (Phase 6a run 6, migration 054):
// api/_coachCode.js, and every server function that acts for a coach on the
// coach's own sign-in asking it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { CODE_NEEDED, codeGiven, codeRefusal, tokenAal, tokenClaims } from '../../api/_coachCode.js';
import { RESET_WORDS } from '../../api/_routes/coach-auth-reset.js';

// Stand-in tokens in Supabase's shape (header.payload.signature); never signed.
const token = (claims) => `h.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.s`;

test('the claims are read from the token, with or without "Bearer"', () => {
  assert.equal(tokenAal(token({ sub: 'x', aal: 'aal2' })), 'aal2');
  assert.equal(tokenAal(`Bearer ${token({ sub: 'x', aal: 'aal1' })}`), 'aal1');
  assert.deepEqual(tokenClaims(token({ sub: 'x', aal: 'aal2', amr: [{ method: 'totp' }] })).amr, [{ method: 'totp' }]);
});

test('only aal2 counts as the code given', () => {
  assert.equal(codeGiven(token({ aal: 'aal2' })), true);
  for (const t of [token({ aal: 'aal1' }), token({}), token({ aal: 'AAL2' }), token({ aal: ['aal2'] }), token({ aal: true }), 'not-a-jwt', '', null, undefined, 'a.%%%.b', 'a.bnVsbA.b']) {
    assert.equal(codeGiven(t), false, String(t));
  }
});

test('a refusal is a calm 403 in the function\'s own shape', () => {
  assert.equal(codeRefusal(token({ aal: 'aal2' })), null);
  assert.deepEqual(codeRefusal(token({ aal: 'aal1' }), { sent: false }), {
    status: 403, body: { sent: false, reason: 'needs_code', needsCode: true, message: CODE_NEEDED },
  });
  // The same words the owner's reset already says.
  assert.equal(CODE_NEEDED, RESET_WORDS.needsCode);
  // What happened, then what to do; no "fail".
  assert.match(CODE_NEEDED, /first, then try again\.$/);
  assert.doesNotMatch(CODE_NEEDED, /fail/i);
});

test('every server function that acts on a coach\'s own sign-in asks for the code', () => {
  // The handlers live in api/_routes/ since the functions were joined (24 Nov); the stripe webhook stays in api/.
  const dir = new URL('../../api/_routes/', import.meta.url);
  // Functions with no coach sign-in: a guest's key, the schedulers' secret, the inbound-email secret, the Health Check.
  const noCoachSignIn = new Set(['alignment-email.js', 'booking-email.js', 'guest-copy.js', 'coach-reminders.js', 'workshop-emails.js', 'billing-nightly.js', 'stripe-webhook.js']);
  const asked = [];
  for (const name of readdirSync(dir).filter((n) => n.endsWith('.js') && !n.startsWith('_'))) {
    const src = readFileSync(new URL(name, dir), 'utf8');
    const readsCallerToken = /req\.headers\??\.authorization/.test(src) && /(auth\.getUser\(token\)|rpc\('is_owner'\))/.test(src);
    if (!readsCallerToken || noCoachSignIn.has(name)) continue;
    asked.push(name);
    assert.match(src, /from '\.\.\/_coachCode\.js'/, `${name} imports the code check`);
    assert.match(src, /\b(codeRefusal|codeGiven)\(token/, `${name} asks it about the caller's token`);
  }
  assert.deepEqual(asked.sort(), ['coach-agreements.js', 'coach-auth-reset.js', 'coach-billing.js', 'coach-calendar-connect.js', 'coach-calendar.js', 'coach-email-in.js', 'coach-invite.js', 'coach-send.js']);
});

test('the recovery route stays open before the code, and only it', () => {
  const src = readFileSync(new URL('../../api/_routes/coach-auth-reset.js', import.meta.url), 'utf8');
  const recovered = src.indexOf("if (kind === 'recovered')");
  const check = src.indexOf('if (!codeGiven(token))');
  assert.ok(recovered > 0 && check > recovered, 'the code is asked only after the recovered route');
});

test('item 57: a test coach with a real authenticator is given its real code (Supabase\'s own challenge and verify), never a raised copy', async () => {
  const { upgradeWithCode } = await import('../signin/aal2.mjs');
  const { totp } = await import('../signin/totp.mjs');
  const key = 'KRUGKIDROVUWG2ZAMJZG653OEBTG66BA'; // invented
  const asked = [];
  const fetchImpl = async (url, init) => {
    asked.push([new URL(url).pathname, JSON.parse(init.body || '{}')]);
    if (url.endsWith('/challenge')) return { ok: true, json: async () => ({ id: 'ch-1' }) };
    return { ok: true, json: async () => ({ access_token: 'real-aal2', refresh_token: 'r', user: {} }) };
  };
  const session = { access_token: 'real-aal1', user: { factors: [{ id: 'f1', factor_type: 'totp', status: 'verified' }] } };
  const up = await upgradeWithCode({ base: 'https://stand-in.invalid', apikey: 'anon', session, totpKey: key, fetchImpl });
  assert.equal(up.access_token, 'real-aal2');
  assert.deepEqual(asked.map(([p]) => p), ['/auth/v1/factors/f1/challenge', '/auth/v1/factors/f1/verify']);
  assert.equal(asked[1][1].challenge_id, 'ch-1');
  assert.equal(asked[1][1].code, totp(key));
  // No key, or no verified factor: nothing is asked, and nothing changes.
  assert.equal(await upgradeWithCode({ base: 'x', apikey: 'a', session, totpKey: null, fetchImpl }), null);
  assert.equal(await upgradeWithCode({ base: 'x', apikey: 'a', session: { ...session, user: { factors: [] } }, totpKey: key, fetchImpl }), null);
  assert.equal(asked.length, 2);
});
