// The coach authenticator's database rules (migration 053), read from the
// migration itself, so the unit run guards what the prompt's step 4 names:
// codes accepted only once, kept hashed, the wait after 5 wrong codes, the
// reset clearing codes and sessions, an associate unable to reset, and the
// owner unable to reset themself. The rules are proved by running the SQL
// on the local stand-in database: supabase/053_coach_authenticator_test.sql
// and supabase/053_coach_authenticator_story_test.sql (the functionality
// tester, 21 Nov). This file only fails if the migration's text loses one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CODE_ALPHABET, WAIT_SECONDS, WRONG_IN_A_ROW } from '../../src/lib/signIn/coachAuth.js';

const SQL = readFileSync(new URL('../../supabase/migrations/053_coach_authenticator.sql', import.meta.url), 'utf8');
const squash = (s) => s.replace(/\s+/g, ' ');
/** One function's body, from "create or replace function public.<name>(" to its closing "$$;". */
function body(name) {
  const at = SQL.indexOf(`create or replace function public.${name}(`);
  assert.ok(at >= 0, `053 has ${name}`);
  const start = SQL.indexOf('$$', at);
  const end = SQL.indexOf('$$;', start + 2);
  return squash(SQL.slice(start, end));
}

test('053: a recovery code is kept only as a bcrypt hash, from the same 32 letters and digits as the app', () => {
  const make = body('coach_recovery_codes_make');
  assert.match(make, /insert into public\.coach_recovery_codes \(user_id, set_id, position, code_hash\) values \(me, v_set, i, extensions\.crypt\(v_plain, extensions\.gen_salt\('bf', 10\)\)\)/);
  assert.ok(make.includes(`'${CODE_ALPHABET}'`), 'the same alphabet as coachAuth.js');
  const table = squash(SQL.slice(SQL.indexOf('create table if not exists public.coach_recovery_codes'), SQL.indexOf(');', SQL.indexOf('create table if not exists public.coach_recovery_codes'))));
  assert.doesNotMatch(table, /\b(code|plain|code_plain)\s+text/, 'no column keeps a plain code');
  const grant = /grant select \(([^)]*)\) on public\.coach_recovery_codes to authenticated/.exec(squash(SQL));
  assert.ok(grant && !grant[1].includes('code_hash'), 'the hash column is never readable');
  assert.doesNotMatch(squash(SQL), /grant select on public\.coach_recovery_codes/, 'never the whole table');
});

test('053: a code is accepted only once, one tab at a time', () => {
  const use = body('coach_recovery_code_use');
  assert.match(use, /a := public\._coach_auth_lock\(me\);/, 'the coach’s row is locked first');
  assert.match(body('_coach_auth_lock'), /for update/);
  assert.match(use, /where user_id = me and used_at is null/, 'only unused codes are compared');
  assert.match(use, /extensions\.crypt\(v_plain, r\.code_hash\) = r\.code_hash/);
  assert.match(use, /update public\.coach_recovery_codes set used_at = now\(\) where id = v_hit and used_at is null/);
  assert.match(use, /Wrong or already used: the same answer either way/);
});

test('053: 5 wrong codes in a row, then the same 30 seconds as the app says', () => {
  const use = body('coach_recovery_code_use');
  assert.ok(use.includes(`a.wrong_tries + 1 >= ${WRONG_IN_A_ROW}`));
  assert.ok(use.includes(`wait_until = now() + interval '${WAIT_SECONDS} seconds'`));
  assert.ok(use.includes(`'wait_seconds', ${WAIT_SECONDS}`));
  assert.match(use, /if a\.wait_until is not null and a\.wait_until > now\(\) then return jsonb_build_object\('status', 'wait'/, 'even a right code waits');
});

test('053: the reset is the owner’s only, never their own, and clears codes, factors and every session', () => {
  const reset = body('coach_authenticator_reset');
  assert.match(reset, /if me is null or not public\.is_owner\(\) then raise exception '[^']+' using errcode = '42501'/, 'an associate is refused');
  assert.match(reset, /if not public\._coach_auth_aal2\(\) then return jsonb_build_object\('status', 'needs_code'\)/);
  assert.match(reset, /if t\.user_id = me or t\.role = 'owner' then .* return jsonb_build_object\('status', 'self'\)/, 'the owner can’t reset their own');
  assert.match(reset, /delete from public\.coach_recovery_codes where user_id = t\.user_id/);
  assert.match(reset, /v_removed := public\._coach_auth_remove\(t\.user_id, true\)/, 'sessions too');
  assert.match(reset, /insert into public\.coach_authenticator_resets \(coach_user_id, reset_by,/);
  const remove = body('_coach_auth_remove');
  for (const t of ['auth.mfa_factors', 'auth.refresh_tokens', 'auth.sessions']) assert.ok(remove.includes(`delete from ${t} where user_id`), t);
});

test('053: a sign-in from before the reset is told by when it began (amr), so a refreshed token can’t carry on', () => {
  const ok = body('_coach_auth_session_ok');
  assert.ok(ok.indexOf("v_claims -> 'amr'") >= 0 && ok.indexOf("v_claims -> 'amr'") < ok.indexOf("v_claims ->> 'iat'"), 'amr first, iat only without it');
  assert.match(ok, /to_timestamp\(v_iat\) < p_reset then return false/);
});

test('053: the tick names its set, so a set another tab replaced is never marked saved (the break-it tester, 21 Nov)', () => {
  assert.match(body('coach_recovery_codes_make'), /'set_id', v_set/);
  const saved = body('coach_recovery_codes_saved');
  assert.match(saved, /a := public\._coach_auth_lock\(me\);.*if p_set is not null and not exists \(select 1 from public\.coach_recovery_codes where user_id = me and set_id = p_set\) then return jsonb_build_object\('status', 'replaced'\)/);
  assert.match(squash(SQL), /drop function if exists public\.coach_recovery_codes_saved\(\);/, 'the first version (no set) is replaced, never left beside it');
});

test('053: a sign-in from before the reset changes nothing: no new codes, no turning on, no tick, no code used (the break-it tester, 21 Nov)', () => {
  for (const name of ['coach_authenticator_on', 'coach_recovery_codes_make', 'coach_recovery_codes_saved', 'coach_recovery_code_use']) {
    assert.match(body(name), /a := public\._coach_auth_lock\(me\);.*if not public\._coach_auth_session_ok\(a\.last_reset_at\) then return jsonb_build_object\('status', 'signed_out'\)/, name);
  }
});
