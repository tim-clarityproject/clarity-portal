// The coach authenticator (Phase 6a run 5): the rules and words
// (src/lib/signIn/coachAuth.js), the data calls with Supabase stood in
// (coachAuthData.js), and the server's reset (api/coach-auth-reset.js) with
// Supabase stood in. The database's own rules (a code used once, the
// hashing, who may reset whom) are proved by supabase/053_coach_authenticator_test.sql.
// Nothing here reaches a network, and nothing is sent.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTHENTICATOR_APPS, CODE_ALPHABET, CODE_DIDNT_WORK, COACH_AUTH_WORDS, RECOVERY_DIDNT_WORK, NO_WRONG_TRIES,
  afterWrongCode, codesFileName, codesFileText, codesForCopy, codesInColumns, codesLeftSummary, coachAuthStop, coachStopPath,
  keyInGroups, lostCodesLine, lowCodesLine, makeNewCodesLine, onSinceLine, plainKey, readRecoveryCode, resetWords,
  shouldTellLowCodes, showRecoveryCode, usedCodeLine, waitSecondsLeft, waitWords, youHaveLeft,
} from '../../src/lib/signIn/coachAuth.js';
import {
  coachSignInStop, forgetCoachAuthReady, loadCoachAuth, makeRecoveryCodes, markCodesSaved, noteAuthenticatorOn,
  resetCoachAuthenticator, spendRecoveryCode,
} from '../../src/lib/signIn/coachAuthData.js';
import { makeHandler, RECOVERED_FOR_MS, RESET_WORDS } from '../../api/coach-auth-reset.js';

const CODES = ['k7q2-9fmd', 'x3vp-r8tn', 'b6wh-2jcq', 'm9ze-t4ra', 'p2nd-7wkf', 'c8yt-3hsm', 'r5gq-6vbe', 'h4mj-9xpd', 'w7tc-2nzk', 'f3rb-8qyh'];

// ---------------------------------------------------------------- counts and lines

test('the count line reads right at 10, 2, 1 and 0', () => {
  assert.equal(usedCodeLine(9), 'That recovery code is now used. You have 9 left.');
  assert.equal(usedCodeLine(10), 'That recovery code is now used. You have 10 left.');
  assert.equal(usedCodeLine(2), 'That recovery code is now used. You have 2 left.');
  assert.equal(usedCodeLine(1), 'That recovery code is now used. You have 1 left.');
  assert.equal(usedCodeLine(0), 'That recovery code is now used. You have none left.');
  assert.equal(youHaveLeft(-3), 'You have none left.');
  assert.equal(makeNewCodesLine(9), null);
  assert.equal(makeNewCodesLine(2), 'Then make new codes in My Account, under Sign-in security.');
  assert.equal(makeNewCodesLine(0), 'Then make new codes in My Account, under Sign-in security.');
});

test('the 2-or-fewer line after a sign-in, and My Account’s count', () => {
  assert.equal(lowCodesLine(10), null);
  assert.equal(lowCodesLine(3), null);
  assert.equal(lowCodesLine(2), 'You have 2 recovery codes left. Make new codes in My Account, under Sign-in security.');
  assert.equal(lowCodesLine(1), 'You have 1 recovery code left. Make new codes in My Account, under Sign-in security.');
  assert.equal(lowCodesLine(0), 'You have no recovery codes left. Make new codes in My Account, under Sign-in security.');
  assert.deepEqual([10, 9, 2, 1, 0].map((n) => codesLeftSummary(n)), ['10 of 10 left', '9 of 10 left', '2 of 10 left', '1 of 10 left', 'None left']);
});

test('the 2-or-fewer line shows once after each sign-in, only with 053 and a set of codes', () => {
  const base = { ready: true, made: true, left: 2, sessionKey: 's-1', toldFor: null };
  assert.equal(shouldTellLowCodes(base), true);
  assert.equal(shouldTellLowCodes({ ...base, toldFor: 's-1' }), false, 'once for this sign-in');
  assert.equal(shouldTellLowCodes({ ...base, toldFor: 's-0' }), true, 'again after the next sign-in');
  assert.equal(shouldTellLowCodes({ ...base, left: 3 }), false);
  assert.equal(shouldTellLowCodes({ ...base, left: 0 }), true);
  assert.equal(shouldTellLowCodes({ ...base, ready: false }), false, 'before 053 there are no codes');
  assert.equal(shouldTellLowCodes({ ...base, made: false }), false, 'none made yet');
  assert.equal(shouldTellLowCodes({ ...base, sessionKey: '' }), false);
});

test('"On since Wed 2 Dec" through the portal’s date words, the year only when it isn’t this year', () => {
  const today = new Date(2026, 11, 20, 12);
  assert.equal(onSinceLine(new Date(2026, 11, 2, 9, 30), today), 'On since Wed 2 Dec');
  assert.equal(onSinceLine('2026-12-02', today), 'On since Wed 2 Dec');
  assert.equal(onSinceLine(new Date(2025, 9, 2, 9), today), 'On since Thu 2 Oct 2025');
  assert.equal(onSinceLine(null, today), '');
  assert.equal(onSinceLine('not a date', today), '');
});

// ---------------------------------------------------------------- the key and the codes

test('the set-up key in groups of four, and plain for an app', () => {
  assert.equal(keyInGroups('jbswy3dpehpk3pxp'), 'JBSW Y3DP EHPK 3PXP');
  assert.equal(keyInGroups('JBSW Y3DP EHPK 3PXP'), 'JBSW Y3DP EHPK 3PXP');
  assert.equal(keyInGroups('ABCDEFGHIJKLMNOPQRSTUVWXYZ234567AB'), 'ABCD EFGH IJKL MNOP QRST UVWX YZ23 4567 AB');
  assert.equal(plainKey(' jbsw y3dp-ehpk 3pxp '), 'JBSWY3DPEHPK3PXP');
  assert.equal(keyInGroups(''), '');
});

test('a recovery code is shown as k7q2-9fmd and read however it is typed', () => {
  assert.equal(CODE_ALPHABET.length, 32);
  assert.ok(!/[ilo1]/.test(CODE_ALPHABET), 'no i, l, o or 1');
  assert.equal(showRecoveryCode('K7Q29FMD'), 'k7q2-9fmd');
  for (const typed of ['k7q2-9fmd', 'K7Q2-9FMD', 'k7q2 9fmd', ' k7q29fmd ', 'k7q2–9fmd', 'k7q2—9fmd', 'ｋ７ｑ２９ｆｍｄ', 'k7q2\t9fmd']) {
    assert.equal(readRecoveryCode(typed), 'k7q29fmd', typed);
  }
  assert.equal(readRecoveryCode('x30p-r8tn'), 'x30pr8tn');
  assert.equal(readRecoveryCode('x3Op-r8tn'), 'x30pr8tn', 'an O is read as the zero it must be');
  assert.equal(readRecoveryCode('k7q2-9fm'), '', 'too short');
  assert.equal(readRecoveryCode('k7q2-9fmdd'), '', 'too long');
  assert.equal(readRecoveryCode('k7q2-9fm1'), '', 'a 1 is never in a code');
  assert.equal(readRecoveryCode(''), '');
  assert.equal(readRecoveryCode(null), '');
});

test('the ten codes in two columns, copied one a line', () => {
  const [left, right] = codesInColumns(CODES);
  assert.deepEqual(left, CODES.slice(0, 5));
  assert.deepEqual(right, CODES.slice(5));
  assert.equal(codesForCopy(CODES).split('\n').length, 10);
});

test('the downloaded file is named in words and says what it holds in full sentences', () => {
  const made = new Date(2026, 11, 2, 9, 30);
  assert.equal(codesFileName(made), 'The Clarity Portal recovery codes, 2 Dec 2026.txt');
  const text = codesFileText(CODES, made);
  assert.match(text, /^The Clarity Portal: your recovery codes\n/);
  assert.match(text, /These were made on Wed 2 Dec 2026 at 09:30\./);
  assert.match(text, / 1\. k7q2-9fmd\n/);
  assert.match(text, /10\. f3rb-8qyh\n/);
  assert.doesNotMatch(text, /@/, 'no email address');
});

// ---------------------------------------------------------------- wrong codes

test('after 5 wrong codes in a row, 30 seconds, said calmly', () => {
  let s = NO_WRONG_TRIES;
  const t0 = 1_000_000;
  for (let i = 1; i <= 4; i += 1) {
    s = afterWrongCode(s, t0);
    assert.equal(s.tries, i);
    assert.equal(waitSecondsLeft(s, t0), 0);
  }
  s = afterWrongCode(s, t0);
  assert.deepEqual([s.tries, waitSecondsLeft(s, t0)], [0, 30]);
  assert.equal(waitSecondsLeft(s, t0 + 29_001), 1);
  assert.equal(waitSecondsLeft(s, t0 + 30_000), 0);
  assert.deepEqual(waitWords(30, { justNow: true }), ['That was 5 wrong codes in a row.', 'Wait 30 seconds, then try again.']);
  assert.deepEqual(waitWords(1), ['Wait 1 second, then try again.']);
  assert.deepEqual(CODE_DIDNT_WORK, ['That code didn’t work.', 'Check the time on your phone and try again.']);
  // One answer for a wrong code and a used one: nothing a guesser can use.
  assert.ok(!RECOVERY_DIDNT_WORK.join(' ').match(/used|expired|already/i));
});

// ---------------------------------------------------------------- words

test('M26’s words, the owner named from the data, and they and them', () => {
  assert.equal(COACH_AUTH_WORDS.code.lines[1], 'You’re only asked on a new phone or computer.');
  assert.equal(COACH_AUTH_WORDS.setUp.cantScan, 'Can’t scan it? Type this key instead:');
  assert.equal(COACH_AUTH_WORDS.codes.tick, 'I’ve saved them somewhere safe.');
  assert.equal(COACH_AUTH_WORDS.security.makeNewNote, 'Making new codes stops the old ones working.');
  assert.deepEqual(AUTHENTICATOR_APPS.map((a) => a.name), ['Google Authenticator', 'Microsoft Authenticator', '1Password']);
  assert.ok(AUTHENTICATOR_APPS.every((a) => a.href.startsWith('https://')));
  assert.equal(lostCodesLine({ ownerFirstName: 'Tim' }), 'Lost your codes too? Ask Tim to reset your authenticator. Tim checks it’s you on a video call first.');
  assert.equal(lostCodesLine({ ownerFirstName: 'Tess' }), 'Lost your codes too? Ask Tess to reset your authenticator. Tess checks it’s you on a video call first.');
  assert.doesNotMatch(lostCodesLine({}), /Tim/);
  assert.doesNotMatch(lostCodesLine({ isOwner: true, ownerFirstName: 'Tim' }), /Ask/);
  const maya = resetWords('Maya');
  assert.equal(maya.title, 'Reset Maya’s authenticator?');
  assert.deepEqual(maya.lines, ['Only do this after a video call with Maya, to check it’s them.', 'Their next sign-in asks them to set it up again, and their old recovery codes stop working.']);
  assert.deepEqual([maya.button, maya.keep], ['Reset it', 'Keep it']);
  const everything = JSON.stringify(COACH_AUTH_WORDS) + Object.values(maya).join(' ') + lostCodesLine({}) + lowCodesLine(1) + usedCodeLine(1);
  assert.doesNotMatch(everything, /\b(she|he|her|his|him)\b/i);
  assert.doesNotMatch(everything, /\bChange\b|\bfail/i);
});

// ---------------------------------------------------------------- the stop

test('where a coach must stop before the coach portal', () => {
  const coach = { isCoach: true, hasFactor: true, level: 'aal2', ready: true, codesSaved: true, sessionOk: true };
  assert.equal(coachAuthStop(coach), null);
  assert.equal(coachAuthStop({ ...coach, isCoach: false, hasFactor: false }), null, 'a client is never stopped here');
  assert.equal(coachAuthStop({ ...coach, isCoach: null, hasFactor: false }), null, 'can’t be told: the older rule decides');
  assert.equal(coachAuthStop({ ...coach, level: 'aal1' }), 'code');
  assert.equal(coachAuthStop({ ...coach, hasFactor: false, level: 'aal1' }), 'setup', 'no authenticator: set it up, never straight in');
  assert.equal(coachAuthStop({ ...coach, codesSaved: false }), 'codes', 'typing the address doesn’t skip the codes');
  assert.equal(coachAuthStop({ ...coach, ready: false, codesSaved: false }), null, 'before 053 there are no codes to save');
  assert.equal(coachAuthStop({ ...coach, ready: false, hasFactor: false }), 'setup', 'set-up is still needed before 053');
  assert.equal(coachAuthStop({ ...coach, sessionOk: false }), 'signedOut');
  assert.equal(coachStopPath('setup'), '/coach/sign-in/set-up');
  assert.equal(coachStopPath(null), null);
});

// ---------------------------------------------------------------- the data calls, Supabase stood in

const memory = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };

function standIn({ there = true, state = {}, factor = null, level = 'aal1', coachRow = null, answers = {} } = {}) {
  const calls = [];
  return {
    calls,
    rpc: async (name, args) => {
      calls.push([name, args]);
      if (!there) return { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } };
      if (name === 'coach_auth_state') return { data: { coach: true, owner: false, codes_left: 0, codes_total: 0, codes_saved: false, session_ok: true, ...state }, error: null };
      return { data: answers[name] ?? null, error: null };
    },
    from: () => ({ select: () => ({ eq: () => ({ limit: async () => ({ data: coachRow ? [coachRow] : [], error: null }) }) }) }),
    auth: { mfa: {
      listFactors: async () => ({ data: { totp: factor ? [factor] : [] } }),
      getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: level } }),
    } },
  };
}

test('with 053: the state, the stop, the codes made once and a code used', async () => {
  const storage = memory();
  forgetCoachAuthReady(storage);
  const sb = standIn({ state: { codes_left: 9, codes_total: 10, codes_saved: true, owner_first_name: 'Tess', turned_on_at: '2026-12-02T09:30:00Z' }, factor: { id: 'f1', status: 'verified' }, level: 'aal2',
    answers: {
      coach_recovery_codes_make: { status: 'made', codes: CODES, made_at: '2026-12-02T09:31:00Z' },
      coach_recovery_code_use: { status: 'used', codes_left: 8, factors_removed: 1 },
      coach_authenticator_on: { status: 'on', turned_on_at: '2026-12-02T09:30:00Z' },
      coach_recovery_codes_saved: { status: 'saved' },
    } });
  const auth = await loadCoachAuth(sb, { id: 'u1' }, { storage });
  assert.deepEqual([auth.isCoach, auth.ready, auth.codesLeft, auth.ownerFirstName, auth.sessionOk], [true, true, 9, 'Tess', true]);
  assert.equal(await coachSignInStop(sb, { id: 'u1' }, { storage }), null);
  assert.deepEqual(await makeRecoveryCodes(sb, { storage }), { status: 'made', codes: CODES, madeAt: '2026-12-02T09:31:00Z' });
  assert.deepEqual(await spendRecoveryCode(sb, ' K7Q2 9FMD ', { storage }), { status: 'used', left: 8, factorsRemoved: 1 });
  assert.deepEqual(sb.calls.find(([n]) => n === 'coach_recovery_code_use')[1], { p_code: 'k7q29fmd' }, 'sent as 053 keeps it');
  assert.deepEqual(await spendRecoveryCode(sb, 'nope', { storage }), { status: 'type_it' }, 'nothing that could be a code is never sent');
  assert.equal((await noteAuthenticatorOn(sb, 'f1', { storage })).status, 'on');
  assert.equal((await markCodesSaved(sb, { storage })).status, 'saved');
});

test('a wrong code, the wait and a code asked for first come back as plain statuses', async () => {
  const storage = memory();
  forgetCoachAuthReady(storage);
  const wrong = standIn({ answers: { coach_recovery_code_use: { status: 'no_match', tries_left: 3 }, coach_recovery_codes_make: { status: 'needs_code' } } });
  assert.deepEqual(await spendRecoveryCode(wrong, 'zzzz-zzzz', { storage }), { status: 'no_match' });
  assert.deepEqual(await makeRecoveryCodes(wrong, { storage }), { status: 'needs_code' });
  const waiting = standIn({ answers: { coach_recovery_code_use: { status: 'wait', wait_seconds: 21 } } });
  assert.deepEqual(await spendRecoveryCode(waiting, 'zzzz-zzzz', { storage }), { status: 'wait', seconds: 21 });
});

test('before 053: not yet, remembered; TOTP still asked; set-up still needed; no codes', async () => {
  const storage = memory();
  forgetCoachAuthReady(storage);
  const sb = standIn({ there: false, coachRow: { id: 'c1', role: 'coach', active: true }, factor: null });
  const auth = await loadCoachAuth(sb, { id: 'u1' }, { storage });
  assert.deepEqual([auth.isCoach, auth.ready, auth.ownerFirstName], [true, false, null]);
  assert.equal(await coachSignInStop(sb, { id: 'u1' }, { storage }), 'setup');
  const asked = sb.calls.length;
  assert.deepEqual(await makeRecoveryCodes(sb, { storage }), { status: 'not_yet' });
  assert.deepEqual(await spendRecoveryCode(sb, 'k7q2-9fmd', { storage }), { status: 'not_yet' });
  assert.equal(sb.calls.length, asked, '"not yet" is remembered, not asked again');
  const withFactor = standIn({ there: false, coachRow: { id: 'c1', role: 'coach', active: true }, factor: { id: 'f', status: 'verified' }, level: 'aal1' });
  assert.equal(await coachSignInStop(withFactor, { id: 'u1' }, { storage }), 'code');
  // A client, before or after 053: never stopped here.
  forgetCoachAuthReady(storage);
  assert.equal(await coachSignInStop(standIn({ there: false, coachRow: null }), { id: 'u2' }, { storage }), null);
  forgetCoachAuthReady(storage);
  assert.equal(await coachSignInStop(standIn({ state: { coach: false } }), { id: 'u2' }, { storage }), null);
  forgetCoachAuthReady(storage);
});

test('the owner’s reset goes through the server, and the answer is read calmly', async () => {
  let sent;
  const ok = async (url, init) => { sent = [url, init]; return { ok: true, json: async () => ({ ok: true, ran: true, codesRemoved: 10 }) }; };
  const done = await resetCoachAuthenticator({ coachId: 'c-maya', token: 'owner-token', fetchImpl: ok });
  assert.equal(done.status, 'done');
  assert.equal(sent[0], '/api/coach-auth-reset');
  assert.deepEqual(JSON.parse(sent[1].body), { kind: 'reset', coachId: 'c-maya' });
  const preview = async () => ({ ok: true, json: async () => ({ ok: true, ran: false, message: RESET_WORDS.notLive }) });
  assert.deepEqual(await resetCoachAuthenticator({ coachId: 'c', token: 't', fetchImpl: preview }), { status: 'not_live', message: RESET_WORDS.notLive, ok: true, ran: false });
  const refused = async () => ({ ok: false, status: 403, json: async () => ({ message: RESET_WORDS.notOwner }) });
  assert.equal((await resetCoachAuthenticator({ coachId: 'c', token: 't', fetchImpl: refused })).status, 'refused');
  const offline = async () => { throw new TypeError('Failed to fetch'); };
  assert.equal((await resetCoachAuthenticator({ coachId: 'c', token: 't', fetchImpl: offline })).status, 'offline');
});

// ---------------------------------------------------------------- the server, Supabase stood in

const OWNER = '11111111-1111-4111-8111-111111111111';
const MAYA_U = '22222222-2222-4222-8222-222222222222';
const MAYA_C = '33333333-3333-4333-8333-333333333333';
const OWN_C = '44444444-4444-4444-8444-444444444444';

function server({ caller = OWNER, owner = true, coaches = [], resetAnswer = { status: 'reset', codes_removed: 10, factors_removed: null, sessions_removed: 2 }, resetError = null, state = null, factors = [] } = {}) {
  const log = { made: [], rpc: [], deleted: [] };
  const createClient = (url, key) => {
    log.made.push(key);
    return {
      auth: {
        getUser: async () => (caller ? { data: { user: { id: caller } }, error: null } : { data: null, error: { message: 'bad' } }),
        admin: { mfa: {
          listFactors: async ({ userId }) => ({ data: { factors: factors.filter((f) => f.user === userId) }, error: null }),
          deleteFactor: async ({ id }) => { log.deleted.push(id); return { data: {}, error: null }; },
        } },
      },
      rpc: async (name, args) => {
        log.rpc.push([name, args]);
        if (name === 'is_owner') return { data: owner, error: null };
        if (name === 'coach_auth_state') return { data: state, error: null };
        if (name === 'coach_authenticator_reset') return resetError ? { data: null, error: resetError } : { data: resetAnswer, error: null };
        return { data: null, error: { code: 'PGRST202' } };
      },
      from: () => ({ select: () => ({ eq: (col, id) => ({ limit: async () => ({ data: coaches.filter((c) => c.id === id), error: null }) }) }) }),
    };
  };
  return { log, handler: makeHandler({ createClient, now: () => Date.parse('2026-12-02T10:00:00Z') }) };
}

async function ask(handler, { body, auth = 'Bearer caller-token', method = 'POST' } = {}) {
  const out = { status: 0, body: null, headers: {} };
  const res = { status(n) { out.status = n; return this; }, setHeader(k, v) { out.headers[k] = v; return this; }, json(b) { out.body = b; return this; } };
  await handler({ method, headers: { authorization: auth }, body }, res);
  return out;
}

const ENV_KEYS = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'VERCEL_ENV', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'];
function withEnv(env, fn) {
  return async () => {
    const kept = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
    for (const k of ENV_KEYS) delete process.env[k];
    Object.assign(process.env, { SUPABASE_URL: 'https://stand-in.invalid', SUPABASE_ANON_KEY: 'anon-stand-in' }, env);
    try { await fn(); } finally {
      for (const k of ENV_KEYS) { if (kept[k] === undefined) delete process.env[k]; else process.env[k] = kept[k]; }
    }
  };
}
const LIVE = { VERCEL_ENV: 'production', SUPABASE_SERVICE_ROLE_KEY: 'service-stand-in' };
const COACHES = [{ id: MAYA_C, user_id: MAYA_U, role: 'coach', active: true }, { id: OWN_C, user_id: OWNER, role: 'owner', active: true }];

test('the reset: only POST, only signed in, only a known kind', withEnv(LIVE, async () => {
  const { handler } = server({ coaches: COACHES });
  assert.equal((await ask(handler, { method: 'GET', body: {} })).status, 405);
  assert.equal((await ask(handler, { auth: '', body: { kind: 'reset', coachId: MAYA_C } })).status, 401);
  assert.equal((await ask(handler, { body: { kind: 'wipe', coachId: MAYA_C } })).status, 400);
  assert.equal((await ask(server({ caller: null }).handler, { body: { kind: 'reset', coachId: MAYA_C } })).status, 401);
}));

test('the reset: an associate can’t reset anyone, and the service key is never used for them', withEnv(LIVE, async () => {
  const { handler, log } = server({ owner: false, caller: MAYA_U, coaches: COACHES });
  const out = await ask(handler, { body: { kind: 'reset', coachId: MAYA_C } });
  assert.deepEqual([out.status, out.body.message], [403, RESET_WORDS.notOwner]);
  assert.ok(!log.made.includes('service-stand-in'));
  assert.ok(!log.rpc.some(([n]) => n === 'coach_authenticator_reset'));
}));

test('the reset: the owner can’t reset their own, nor a coach who isn’t there', withEnv(LIVE, async () => {
  const { handler, log } = server({ coaches: COACHES });
  const self = await ask(handler, { body: { kind: 'reset', coachId: OWN_C } });
  assert.deepEqual([self.status, self.body.message], [400, RESET_WORDS.self]);
  assert.equal((await ask(handler, { body: { kind: 'reset', coachId: '55555555-5555-4555-8555-555555555555' } })).status, 404);
  assert.equal((await ask(handler, { body: { kind: 'reset', coachId: 'not-an-id' } })).status, 400);
  const off = server({ coaches: [{ ...COACHES[0], active: false }] });
  assert.equal((await ask(off.handler, { body: { kind: 'reset', coachId: MAYA_C } })).status, 404);
  assert.ok(!log.made.includes('service-stand-in'));
}));

test('the reset: on a preview or a developer’s machine nothing changes, after the same checks', withEnv({ VERCEL_ENV: 'preview', SUPABASE_SERVICE_ROLE_KEY: 'service-stand-in' }, async () => {
  const { handler, log } = server({ coaches: COACHES, factors: [{ id: 'f1', user: MAYA_U, factor_type: 'totp', status: 'verified' }] });
  const out = await ask(handler, { body: { kind: 'reset', coachId: MAYA_C } });
  assert.deepEqual([out.status, out.body.ran, out.body.message], [200, false, RESET_WORDS.notLive]);
  assert.ok(!log.rpc.some(([n]) => n === 'coach_authenticator_reset'), 'the database isn’t asked to change anything');
  assert.deepEqual(log.deleted, []);
  assert.ok(!log.made.includes('service-stand-in'));
  assert.equal(out.headers['Cache-Control'], 'no-store');
}));

test('the reset on the live site: the database records it, and the admin calls remove the factors', withEnv(LIVE, async () => {
  const { handler, log } = server({ coaches: COACHES, factors: [{ id: 'f1', user: MAYA_U, factor_type: 'totp', status: 'verified' }, { id: 'f-own', user: OWNER, factor_type: 'totp', status: 'verified' }] });
  const out = await ask(handler, { body: { kind: 'reset', coachId: MAYA_C } });
  assert.equal(out.status, 200);
  assert.deepEqual([out.body.ran, out.body.codesRemoved, out.body.factorsRemoved, out.body.signedOutEverywhere], [true, 10, 1, true]);
  assert.deepEqual(log.rpc.find(([n]) => n === 'coach_authenticator_reset')[1], { p_coach: MAYA_C });
  assert.deepEqual(log.deleted, ['f1'], 'only Maya’s factor');
  assert.ok(!JSON.stringify(out.body).includes('service-stand-in'), 'the key never goes back');
}));

test('the reset on the live site: the database’s own refusals are passed on calmly', withEnv(LIVE, async () => {
  const needs = await ask(server({ coaches: COACHES, resetAnswer: { status: 'needs_code' } }).handler, { body: { kind: 'reset', coachId: MAYA_C } });
  assert.deepEqual([needs.status, needs.body.needsCode], [403, true]);
  const notYet = await ask(server({ coaches: COACHES, resetError: { code: 'PGRST202', message: 'Could not find the function' } }).handler, { body: { kind: 'reset', coachId: MAYA_C } });
  assert.deepEqual([notYet.status, notYet.body.notYet], [503, true]);
  const refused = await ask(server({ coaches: COACHES, resetError: { code: '42501' } }).handler, { body: { kind: 'reset', coachId: MAYA_C } });
  assert.equal(refused.status, 403);
  const noSessions = await ask(server({ coaches: COACHES, resetAnswer: { status: 'reset', codes_removed: 10, factors_removed: null, sessions_removed: null } }).handler, { body: { kind: 'reset', coachId: MAYA_C } });
  assert.equal(noSessions.body.signedOutEverywhere, false);
  for (const out of [needs, notYet, refused]) assert.doesNotMatch(out.body.message, /\b(fail|error)\b/i);
}));

test('the reset with no service key set says so, and changes nothing', withEnv({ VERCEL_ENV: 'production' }, async () => {
  const { handler, log } = server({ coaches: COACHES });
  const out = await ask(handler, { body: { kind: 'reset', coachId: MAYA_C } });
  assert.deepEqual([out.status, out.body.message], [500, RESET_WORDS.notSetUp]);
  assert.ok(!log.rpc.some(([n]) => n === 'coach_authenticator_reset'));
}));

test('after a recovery code: only the caller’s lost factors, only within 15 minutes', withEnv(LIVE, async () => {
  const used = '2026-12-02T09:55:00Z';
  const factors = [
    { id: 'lost', user: MAYA_U, factor_type: 'totp', status: 'verified', created_at: '2026-10-01T09:00:00Z' },
    { id: 'new', user: MAYA_U, factor_type: 'totp', status: 'unverified', created_at: '2026-12-02T09:58:00Z' },
    { id: 'other', user: OWNER, factor_type: 'totp', status: 'verified', created_at: '2026-10-01T09:00:00Z' },
  ];
  const fine = server({ caller: MAYA_U, state: { coach: true, recovered_at: used }, factors });
  const out = await ask(fine.handler, { body: { kind: 'recovered' } });
  assert.deepEqual([out.status, out.body.factorsRemoved], [200, 1]);
  assert.deepEqual(fine.log.deleted, ['lost']);
  const late = server({ caller: MAYA_U, state: { coach: true, recovered_at: new Date(Date.parse('2026-12-02T10:00:00Z') - RECOVERED_FOR_MS - 1000).toISOString() }, factors });
  assert.equal((await ask(late.handler, { body: { kind: 'recovered' } })).status, 403);
  const never = server({ caller: MAYA_U, state: { coach: true, recovered_at: null }, factors });
  assert.equal((await ask(never.handler, { body: { kind: 'recovered' } })).status, 403);
  const client = server({ caller: MAYA_U, state: { coach: false }, factors });
  assert.equal((await ask(client.handler, { body: { kind: 'recovered' } })).status, 403);
  assert.deepEqual([...late.log.deleted, ...never.log.deleted, ...client.log.deleted], []);
}));
