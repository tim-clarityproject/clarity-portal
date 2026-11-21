-- =============================================================================
-- 053_coach_authenticator_breakit_test.sql
-- The break-it tester's probes of 053 (Phase 6a run 5, 21 Nov). RUN ORDER:
-- 026, 049, 053, then this (after 053's own test and the story test, or
-- instead of them). Local stand-in only, never anything hosted.
--
-- WHAT IT TRIES
--   1. Every role against every function, helper and table: someone signed
--      out, a client, a coach who is switched off, an associate before and
--      after their 6-digit code (aal1, aal2), the owner before and after.
--   2. The hash column, every way a signed-in person might read it: by
--      name, select *, the whole row, row_to_json, a filter on it, and the
--      planner's statistics (pg_stats).
--   3. Two transactions using one code, one after the other (the stand-in
--      is one connection, so the second can't start while the first is
--      open: the lock that serialises them on a real database is checked by
--      tests/performance/coach-auth-sql.test.mjs); and the tick for a set
--      that another tab has replaced since.
--   4. The wait counters: the tries left at each wrong code, the 5th, a
--      wrong and a right code during the wait (neither spent nor counted,
--      the wait not stretched), the count after the wait and after a right
--      code, and one coach's wait never holding another.
--   5. The reset of someone who isn't a coach, of a coach who is switched
--      off, of the owner, of nobody (null), and of an associate twice.
--   6. Odd inputs: null, empty, 10,000 characters, a code hidden in 10,000
--      characters of punctuation, full-width letters; odd sign-in claims.
--   7. A sign-in from before the reset (a refreshed token, at aal2) trying
--      to make codes, turn an authenticator on, tick or use a code.
--   NOTES (said, not failed): what 053 can't do, for the lead and Tim.
--
-- Parts 1, 2 and 4 to 6 run in one block that is undone at the end; part 3
-- commits on purpose (two transactions) and is cleaned up after. Ends with
-- the notice 053 BREAK-IT CHECKS PASSED, or stops with FAILED and a list.
-- =============================================================================
create or replace function pg_temp.b_as(p uuid, p_aal text default 'aal1', p_iat timestamptz default now(),
  p_session uuid default null, p_amr jsonb default null) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', (jsonb_build_object('sub', p, 'role', 'authenticated', 'aal', p_aal,
    'iat', floor(extract(epoch from p_iat))::bigint, 'session_id', p_session)
    || case when p_amr is null then '{}'::jsonb else jsonb_build_object('amr', p_amr) end)::text, true);
  perform set_config('role', 'authenticated', true);
end $f$;
create or replace function pg_temp.b_claims(p jsonb) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', p::text, true);
  perform set_config('role', 'authenticated', true);
end $f$;
create or replace function pg_temp.b_anon() returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('role', 'anon', true);
end $f$;
create or replace function pg_temp.b_admin() returns void language plpgsql as $f$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
end $f$;
create or replace function pg_temp.b_user(p_label text) returns uuid language plpgsql as $f$
declare u uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, aud, role, email_confirmed_at)
  values (u, 'p6a-breakit-' || p_label || '-' || u || '@example.invalid', 'authenticated', 'authenticated', now());
  return u;
end $f$;
-- One answer as text: the function's status (or its whole answer), or "error <sqlstate>".
create or replace function pg_temp.b_n(p_sql text) returns text language plpgsql as $f$
declare v text;
begin
  execute p_sql into v;
  return coalesce(v, 'null');
exception when others then
  return 'error ' || sqlstate;
end $f$;
create or replace function pg_temp.b_rows(p_sql text) returns text language plpgsql as $f$
declare n bigint;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n::text;
exception when others then
  return 'error ' || sqlstate;
end $f$;
create or replace function pg_temp.b_eq(p_name text, p_got text, p_want text) returns text[] language sql as $f$
  select case when p_got is distinct from p_want
              then array[format('%s: expected %s, got %s', p_name, p_want, coalesce(p_got, 'nothing'))]
              else '{}'::text[] end;
$f$;

-- What part 3 needs across its transactions, and every failure, kept here.
create temp table b_kept (k text primary key, v text);
create temp table b_failed (msg text);

-- ---------------------------------------------------------------------------- 1, 2, 4, 5, 6 (undone)
do $t$
declare
  f text[] := '{}';
  made_auth text[] := '{}';
  own_u uuid; maya_u uuid; nina_u uuid; sam_u uuid; old_u uuid;
  own_c uuid; maya_c uuid; nina_c uuid; old_c uuid; sam_profile uuid;
  j jsonb;
  codes text[];
  nina text[];
  r record;
  fn text;
  want text;
  tbl text;
  role_name text;
  before_wait timestamptz;
  t0 timestamptz;
  big text;
begin
  begin
    -- Supabase's own tables, in their shape, on the stand-in only (as 053's test).
    if to_regclass('auth.mfa_factors') is null then
      create table auth.mfa_factors (id uuid primary key, user_id uuid not null references auth.users (id) on delete cascade, friendly_name text,
        factor_type text not null, status text not null, created_at timestamptz not null, updated_at timestamptz not null, secret text);
    end if;
    if to_regclass('auth.sessions') is null then
      create table auth.sessions (id uuid primary key, user_id uuid not null references auth.users (id) on delete cascade,
        created_at timestamptz, updated_at timestamptz, factor_id uuid, aal text);
    end if;
    if to_regclass('auth.refresh_tokens') is null then
      create table auth.refresh_tokens (id bigserial primary key, token varchar(255), user_id varchar(255), revoked boolean,
        created_at timestamptz, updated_at timestamptz, parent varchar(255), session_id uuid references auth.sessions (id) on delete cascade);
    end if;

    perform pg_temp.b_admin();
    own_u := pg_temp.b_user('owner'); maya_u := pg_temp.b_user('maya'); nina_u := pg_temp.b_user('nina');
    sam_u := pg_temp.b_user('sam'); old_u := pg_temp.b_user('old');
    insert into public.coaches (user_id, role, display_first_name) values (own_u, 'owner', 'Tess') returning id into own_c;
    insert into public.coaches (user_id, role, display_first_name) values (maya_u, 'coach', 'Maya') returning id into maya_c;
    insert into public.coaches (user_id, role, display_first_name) values (nina_u, 'coach', 'Nina') returning id into nina_c;
    insert into public.coaches (user_id, role, display_first_name, active) values (old_u, 'coach', 'Olly', false) returning id into old_c;
    insert into public.client_profiles (coach_id, name) values (maya_c, 'Sam Carter') returning id into sam_profile;

    -- ------------------------------------------------------------ 1. every role against every function
    -- Maya and Nina each have a set of codes to try against (made at aal2).
    perform pg_temp.b_as(nina_u, 'aal2');
    nina := array(select jsonb_array_elements_text(public.coach_recovery_codes_make() -> 'codes'));

    -- Someone signed out: no function, no helper, no table.
    perform pg_temp.b_anon();
    foreach fn in array array['select public.coach_auth_state()::text', 'select public.coach_authenticator_on(null)::text',
      'select public.coach_recovery_codes_make()::text', 'select public.coach_recovery_codes_saved()::text',
      $q$select public.coach_recovery_code_use('zzzz-zzzz')::text$q$, format('select public.coach_authenticator_reset(%L)::text', maya_c)] loop
      f := f || pg_temp.b_eq('1a signed out: ' || fn, pg_temp.b_n(fn), 'error 42501');
    end loop;

    -- The helpers are nobody's, whoever asks.
    for r in select * from (values ('anon', null::uuid, 'aal1'), ('client', sam_u, 'aal2'), ('associate', maya_u, 'aal2'), ('owner', own_u, 'aal2')) v(label, who, aal) loop
      if r.who is null then perform pg_temp.b_anon(); else perform pg_temp.b_as(r.who, r.aal); end if;
      foreach fn in array array['select public._coach_auth_aal2()::text', $q$select public._coach_code_plain('x')$q$,
        format('select public._coach_auth_lock(%L)::text', nina_u), format('select public._coach_auth_remove(%L, true)::text', nina_u),
        'select public._coach_auth_session_ok(now())::text'] loop
        f := f || pg_temp.b_eq('1b ' || r.label || ' calls a helper: ' || fn, pg_temp.b_n(fn), 'error 42501');
      end loop;
    end loop;

    -- A client, and a coach who is switched off, at aal2: told nothing, change nothing.
    for r in select * from (values ('client', sam_u), ('switched off', old_u)) v(label, who) loop
      perform pg_temp.b_as(r.who, 'aal2');
      f := f || pg_temp.b_eq('1c ' || r.label || ': state', pg_temp.b_n('select public.coach_auth_state()::text'), '{"coach": false}');
      foreach fn in array array['select public.coach_authenticator_on(null)::text', 'select public.coach_recovery_codes_make()::text',
        'select public.coach_recovery_codes_saved()::text', $q$select public.coach_recovery_code_use('zzzz-zzzz')::text$q$,
        format('select public.coach_recovery_code_use(%L)::text', nina[1]), format('select public.coach_authenticator_reset(%L)::text', nina_c)] loop
        f := f || pg_temp.b_eq('1c ' || r.label || ': ' || fn, pg_temp.b_n(fn), 'error 42501');
      end loop;
    end loop;

    -- An associate with only a password (aal1).
    perform pg_temp.b_as(maya_u, 'aal1');
    f := f || pg_temp.b_eq('1d associate aal1: state', pg_temp.b_n($q$select public.coach_auth_state() ->> 'coach'$q$), 'true');
    f := f || pg_temp.b_eq('1d associate aal1: turn on needs the code', pg_temp.b_n($q$select public.coach_authenticator_on(null) ->> 'status'$q$), 'needs_code');
    f := f || pg_temp.b_eq('1d associate aal1: make needs the code', pg_temp.b_n($q$select public.coach_recovery_codes_make() ->> 'status'$q$), 'needs_code');
    f := f || pg_temp.b_eq('1d associate aal1: nothing to tick', pg_temp.b_n($q$select public.coach_recovery_codes_saved() ->> 'status'$q$), 'none');
    f := f || pg_temp.b_eq('1d associate aal1: another coach''s code is no code of theirs', pg_temp.b_n(format($q$select public.coach_recovery_code_use(%L) ->> 'status'$q$, nina[1])), 'no_match');
    f := f || pg_temp.b_eq('1d associate aal1: resets nobody', pg_temp.b_n(format('select public.coach_authenticator_reset(%L)::text', nina_c)), 'error 42501');
    -- At aal2.
    perform pg_temp.b_as(maya_u, 'aal2');
    f := f || pg_temp.b_eq('1e associate aal2: turn on', pg_temp.b_n($q$select public.coach_authenticator_on(null) ->> 'status'$q$), 'on');
    j := public.coach_recovery_codes_make();
    codes := array(select jsonb_array_elements_text(j -> 'codes'));
    f := f || pg_temp.b_eq('1e associate aal2: make, with the set it made', concat_ws('/', j ->> 'status', (j ->> 'set_id') is not null), 'made/t');
    f := f || pg_temp.b_eq('1e associate aal2: tick that set', pg_temp.b_n(format($q$select public.coach_recovery_codes_saved(%L) ->> 'status'$q$, j ->> 'set_id')), 'saved');
    f := f || pg_temp.b_eq('1e associate aal2: still resets nobody (another, themself, the owner)', concat_ws('/',
      pg_temp.b_n(format('select public.coach_authenticator_reset(%L)::text', nina_c)),
      pg_temp.b_n(format('select public.coach_authenticator_reset(%L)::text', maya_c)),
      pg_temp.b_n(format('select public.coach_authenticator_reset(%L)::text', own_c))), 'error 42501/error 42501/error 42501');
    -- The owner.
    perform pg_temp.b_as(own_u, 'aal1');
    f := f || pg_temp.b_eq('1f owner aal1: the reset needs the owner''s code', pg_temp.b_n(format($q$select public.coach_authenticator_reset(%L) ->> 'status'$q$, nina_c)), 'needs_code');
    f := f || pg_temp.b_eq('1f owner aal1: is told they are the owner', pg_temp.b_n($q$select public.coach_auth_state() ->> 'owner'$q$), 'true');

    -- Every table, every way of writing, every role (nothing is written but through the functions).
    foreach tbl in array array['coach_authenticators', 'coach_recovery_codes', 'coach_authenticator_resets'] loop
      for r in select * from (values ('anon', null::uuid), ('client', sam_u), ('switched off', old_u), ('associate', maya_u), ('owner', own_u)) v(label, who) loop
        if r.who is null then perform pg_temp.b_anon(); else perform pg_temp.b_as(r.who, 'aal2'); end if;
        f := f || pg_temp.b_eq(format('1g %s inserts into %s', r.label, tbl), pg_temp.b_rows(format('insert into public.%I default values', tbl)), 'error 42501');
        f := f || pg_temp.b_eq(format('1g %s updates %s', r.label, tbl), pg_temp.b_rows(format('update public.%I set %I = %I', tbl,
          case when tbl = 'coach_authenticator_resets' then 'coach_user_id' else 'user_id' end,
          case when tbl = 'coach_authenticator_resets' then 'coach_user_id' else 'user_id' end)), 'error 42501');
        f := f || pg_temp.b_eq(format('1g %s deletes from %s', r.label, tbl), pg_temp.b_rows(format('delete from public.%I', tbl)), 'error 42501');
        f := f || pg_temp.b_eq(format('1g %s truncates %s', r.label, tbl), pg_temp.b_rows(format('truncate public.%I', tbl)), 'error 42501');
      end loop;
    end loop;
    perform pg_temp.b_anon();
    f := f || pg_temp.b_eq('1h signed out reads no table', concat_ws('/',
      pg_temp.b_n('select count(*) from public.coach_authenticators'),
      pg_temp.b_n('select count(id) from public.coach_recovery_codes'),
      pg_temp.b_n('select count(*) from public.coach_authenticator_resets')), 'error 42501/error 42501/error 42501');
    perform pg_temp.b_as(sam_u, 'aal2');
    f := f || pg_temp.b_eq('1i a client reads no row of any', concat_ws('/',
      pg_temp.b_n('select count(*) from public.coach_authenticators'),
      pg_temp.b_n('select count(id) from public.coach_recovery_codes'),
      pg_temp.b_n('select count(*) from public.coach_authenticator_resets')), '0/0/0');
    perform pg_temp.b_as(maya_u, 'aal2');
    f := f || pg_temp.b_eq('1j an associate reads only their own (row, codes)', concat_ws('/',
      pg_temp.b_n(format('select count(*) filter (where user_id <> %L) from public.coach_authenticators', maya_u)),
      pg_temp.b_n(format('select count(id) filter (where user_id <> %L) from public.coach_recovery_codes', maya_u)),
      pg_temp.b_n('select count(id) from public.coach_recovery_codes')), '0/0/10');
    perform pg_temp.b_as(own_u, 'aal2');
    f := f || pg_temp.b_eq('1k the owner reads no one else''s codes or row', concat_ws('/',
      pg_temp.b_n(format('select count(*) from public.coach_authenticators where user_id <> %L', own_u)),
      pg_temp.b_n(format('select count(id) from public.coach_recovery_codes where user_id <> %L', own_u))), '0/0');

    -- ------------------------------------------------------------ 2. the hash column
    perform pg_temp.b_admin();
    analyze public.coach_recovery_codes;
    for r in select * from (values ('associate', maya_u), ('owner', own_u), ('client', sam_u)) v(label, who) loop
      perform pg_temp.b_as(r.who, 'aal2');
      f := f || pg_temp.b_eq('2a ' || r.label || ': by name', pg_temp.b_n('select max(code_hash) from public.coach_recovery_codes'), 'error 42501');
      f := f || pg_temp.b_eq('2b ' || r.label || ': select *', pg_temp.b_n('select count(*) from (select * from public.coach_recovery_codes) x'), 'error 42501');
      f := f || pg_temp.b_eq('2c ' || r.label || ': the whole row', pg_temp.b_n('select max(t::text) from public.coach_recovery_codes t'), 'error 42501');
      f := f || pg_temp.b_eq('2d ' || r.label || ': row_to_json', pg_temp.b_n('select max(row_to_json(t)::text) from public.coach_recovery_codes t'), 'error 42501');
      f := f || pg_temp.b_eq('2e ' || r.label || ': a filter on it', pg_temp.b_n($q$select count(id) from public.coach_recovery_codes where code_hash like '$2%'$q$), 'error 42501');
      f := f || pg_temp.b_eq('2f ' || r.label || ': ordered by it', pg_temp.b_n('select count(*) from (select id from public.coach_recovery_codes order by code_hash) x'), 'error 42501');
      f := f || pg_temp.b_eq('2g ' || r.label || ': the planner''s statistics', pg_temp.b_n($q$select count(*) from pg_catalog.pg_stats where tablename = 'coach_recovery_codes' and attname = 'code_hash'$q$), '0');
    end loop;

    -- ------------------------------------------------------------ 4. the wait counters (Nina's codes)
    perform pg_temp.b_as(nina_u, 'aal1');
    f := f || pg_temp.b_eq('4a the 1st wrong code: 4 tries left', pg_temp.b_n($q$select concat_ws('/', x ->> 'status', x ->> 'tries_left') from public.coach_recovery_code_use('zzzz-zzz1') x$q$), 'no_match/4');
    f := f || pg_temp.b_eq('4a the 2nd: 3 left', pg_temp.b_n($q$select public.coach_recovery_code_use('zzzz-zzz2') ->> 'tries_left'$q$), '3');
    f := f || pg_temp.b_eq('4a the 3rd: 2 left', pg_temp.b_n($q$select public.coach_recovery_code_use('zzzz-zzz3') ->> 'tries_left'$q$), '2');
    f := f || pg_temp.b_eq('4a the 4th: 1 left', pg_temp.b_n($q$select public.coach_recovery_code_use('zzzz-zzz4') ->> 'tries_left'$q$), '1');
    f := f || pg_temp.b_eq('4b the 5th: wait 30 seconds', pg_temp.b_n($q$select concat_ws('/', x ->> 'status', x ->> 'wait_seconds') from public.coach_recovery_code_use('zzzz-zzz5') x$q$), 'wait/30');
    perform pg_temp.b_admin();
    before_wait := (select wait_until from public.coach_authenticators where user_id = nina_u);
    perform pg_temp.b_as(nina_u, 'aal2');
    f := f || pg_temp.b_eq('4c a wrong code during the wait: wait', pg_temp.b_n($q$select public.coach_recovery_code_use('zzzz-zzz6') ->> 'status'$q$), 'wait');
    f := f || pg_temp.b_eq('4c a right code during the wait (and at aal2): wait', pg_temp.b_n(format($q$select public.coach_recovery_code_use(%L) ->> 'status'$q$, nina[1])), 'wait');
    f := f || pg_temp.b_eq('4c the state says how long, read twice', pg_temp.b_n($q$select ((public.coach_auth_state() ->> 'wait_seconds')::int between 1 and 30 and (public.coach_auth_state() ->> 'wait_seconds')::int between 1 and 30)::text$q$), 'true');
    perform pg_temp.b_admin();
    f := f || pg_temp.b_eq('4d the wait isn''t stretched, nothing counted, nothing spent', (select concat_ws('/', wait_until = before_wait, wrong_tries,
      (select count(*) from public.coach_recovery_codes where user_id = nina_u and used_at is not null)) from public.coach_authenticators where user_id = nina_u), 't/0/0');
    perform pg_temp.b_as(maya_u, 'aal1');
    f := f || pg_temp.b_eq('4e Nina''s wait never holds Maya', pg_temp.b_n($q$select concat_ws('/', public.coach_auth_state() ->> 'wait_seconds', public.coach_recovery_code_use('zzzz-zzz7') ->> 'status')$q$), '0/no_match');
    perform pg_temp.b_admin();
    update public.coach_authenticators set wait_until = now() - interval '1 second' where user_id = nina_u;
    perform pg_temp.b_as(nina_u, 'aal1');
    f := f || pg_temp.b_eq('4f after the wait the count starts again: 4 left', pg_temp.b_n($q$select public.coach_recovery_code_use('zzzz-zzz8') ->> 'tries_left'$q$), '4');
    f := f || pg_temp.b_eq('4g then a right code gets in', pg_temp.b_n(format($q$select concat_ws('/', x ->> 'status', x ->> 'codes_left') from public.coach_recovery_code_use(%L) x$q$, nina[1])), 'used/9');
    f := f || pg_temp.b_eq('4h after a right code, a wrong one has 4 left again', pg_temp.b_n($q$select public.coach_recovery_code_use('zzzz-zzz9') ->> 'tries_left'$q$), '4');
    perform pg_temp.b_admin();
    f := f || pg_temp.b_eq('4i the counter can''t pass 5 (the table''s own check)', pg_temp.b_rows(format('update public.coach_authenticators set wrong_tries = 6 where user_id = %L', nina_u)), 'error 23514');

    -- ------------------------------------------------------------ 5. resets of the wrong people
    perform pg_temp.b_as(own_u, 'aal2');
    f := f || pg_temp.b_eq('5a a client''s account id, as if a coach', pg_temp.b_n(format($q$select public.coach_authenticator_reset(%L) ->> 'status'$q$, sam_u)), 'not_found');
    f := f || pg_temp.b_eq('5b a client''s profile id', pg_temp.b_n(format($q$select public.coach_authenticator_reset(%L) ->> 'status'$q$, sam_profile)), 'not_found');
    f := f || pg_temp.b_eq('5c an associate''s account id (not their coach id)', pg_temp.b_n(format($q$select public.coach_authenticator_reset(%L) ->> 'status'$q$, maya_u)), 'not_found');
    f := f || pg_temp.b_eq('5d a coach who is switched off', pg_temp.b_n(format($q$select public.coach_authenticator_reset(%L) ->> 'status'$q$, old_c)), 'not_found');
    f := f || pg_temp.b_eq('5e the owner''s own', pg_temp.b_n(format($q$select public.coach_authenticator_reset(%L) ->> 'status'$q$, own_c)), 'self');
    f := f || pg_temp.b_eq('5f nobody (null)', pg_temp.b_n($q$select public.coach_authenticator_reset(null) ->> 'status'$q$), 'not_found');
    f := f || pg_temp.b_eq('5g not a uuid at all', pg_temp.b_n($q$select public.coach_authenticator_reset('x'::uuid) ->> 'status'$q$), 'error 22P02');
    perform pg_temp.b_admin();
    f := f || pg_temp.b_eq('5h none of those was recorded or touched anyone''s codes', (select concat_ws('/', (select count(*) from public.coach_authenticator_resets rr join auth.users uu on uu.id = rr.coach_user_id where uu.email like 'p6a-breakit-%'),
      (select count(*) from public.coach_recovery_codes where user_id in (maya_u, nina_u)))), '0/20');
    -- Another owner row (a second owner) is never reset either.
    update public.coaches set role = 'owner' where id = nina_c;
    perform pg_temp.b_as(own_u, 'aal2');
    f := f || pg_temp.b_eq('5i an owner is never reset, even by the other owner', pg_temp.b_n(format($q$select public.coach_authenticator_reset(%L) ->> 'status'$q$, nina_c)), 'self');
    perform pg_temp.b_admin();
    update public.coaches set role = 'coach' where id = nina_c;
    -- An associate reset twice: the second finds nothing, and both are recorded.
    perform pg_temp.b_as(own_u, 'aal2');
    f := f || pg_temp.b_eq('5j reset Maya', pg_temp.b_n(format($q$select concat_ws('/', x ->> 'status', x ->> 'codes_removed') from public.coach_authenticator_reset(%L) x$q$, maya_c)), 'reset/10');
    f := f || pg_temp.b_eq('5j and again: nothing left to remove', pg_temp.b_n(format($q$select concat_ws('/', x ->> 'status', x ->> 'codes_removed') from public.coach_authenticator_reset(%L) x$q$, maya_c)), 'reset/0');
    perform pg_temp.b_admin();
    f := f || pg_temp.b_eq('5k both are recorded', (select count(*)::text from public.coach_authenticator_resets where coach_user_id = maya_u), '2');
    perform pg_temp.b_as(maya_u, 'aal1', now() + interval '1 minute');
    f := f || pg_temp.b_eq('5l Maya''s old code after the reset is refused', pg_temp.b_n(format($q$select public.coach_recovery_code_use(%L) ->> 'status'$q$, codes[2])), 'no_match');
    -- A coach who has never had a row is reset fine (the row is made, then cleared).
    perform pg_temp.b_admin();
    delete from public.coach_authenticators where user_id = nina_u;
    delete from public.coach_recovery_codes where user_id = nina_u;
    perform pg_temp.b_as(own_u, 'aal2');
    f := f || pg_temp.b_eq('5m a coach with no row yet', pg_temp.b_n(format($q$select concat_ws('/', x ->> 'status', x ->> 'codes_removed') from public.coach_authenticator_reset(%L) x$q$, nina_c)), 'reset/0');

    -- ------------------------------------------------------------ 6. odd inputs
    perform pg_temp.b_admin();
    update public.coach_authenticators set wrong_tries = 0, wait_until = null where user_id = maya_u;
    perform pg_temp.b_as(maya_u, 'aal2', now() + interval '1 minute');
    j := public.coach_recovery_codes_make();
    codes := array(select jsonb_array_elements_text(j -> 'codes'));
    f := f || pg_temp.b_eq('6a null: no error, no match', pg_temp.b_n('select public.coach_recovery_code_use(null) ->> ''status'''), 'no_match');
    f := f || pg_temp.b_eq('6b empty: no match', pg_temp.b_n($q$select public.coach_recovery_code_use('') ->> 'status'$q$), 'no_match');
    big := repeat('a', 10000);
    t0 := clock_timestamp();
    f := f || pg_temp.b_eq('6c 10,000 letters: no match', pg_temp.b_n(format($q$select public.coach_recovery_code_use(%L) ->> 'status'$q$, big)), 'no_match');
    f := f || pg_temp.b_eq('6d full-width letters (the page reads them; the database is sent plain ones): no match', pg_temp.b_n(format($q$select public.coach_recovery_code_use(%L) ->> 'status'$q$, 'ｚｚｚｚ－ｚｚｚｚ')), 'no_match');
    -- That is 4 wrong in a row; the 5th is the wait.
    f := f || pg_temp.b_eq('6e odd inputs count as wrong codes: the 5th is the wait', pg_temp.b_n($q$select public.coach_recovery_code_use(repeat('-', 10000)) ->> 'status'$q$), 'wait');
    f := f || pg_temp.b_eq('6f and they take no time to refuse (under a second)', ((clock_timestamp() - t0) < interval '1 second')::text, 'true');
    perform pg_temp.b_admin();
    update public.coach_authenticators set wrong_tries = 0, wait_until = null where user_id = maya_u;
    perform pg_temp.b_as(maya_u, 'aal1', now() + interval '1 minute');
    f := f || pg_temp.b_eq('6g a real code hidden in 10,000 characters of punctuation is still read as it', pg_temp.b_n(format($q$select public.coach_recovery_code_use(%L) ->> 'status'$q$,
      repeat('-', 5000) || left(codes[3], 4) || repeat(' ', 4990) || right(codes[3], 4))), 'used');
    f := f || pg_temp.b_eq('6h the tick with an odd set', concat_ws('/',
      pg_temp.b_n('select public.coach_recovery_codes_saved(null) ->> ''status'''),
      pg_temp.b_n(format($q$select public.coach_recovery_codes_saved(%L) ->> 'status'$q$, gen_random_uuid())),
      pg_temp.b_n($q$select public.coach_recovery_codes_saved('') ->> 'status'$q$)), 'saved/replaced/error 22P02');
    perform pg_temp.b_as(maya_u, 'aal2', now() + interval '1 minute');
    f := f || pg_temp.b_eq('6i turned on with any odd factor id, or none', concat_ws('/',
      pg_temp.b_n('select public.coach_authenticator_on(null) ->> ''status'''),
      pg_temp.b_n(format($q$select public.coach_authenticator_on(%L) ->> 'status'$q$, gen_random_uuid()))), 'on/on');

    -- Odd sign-in claims: never an error, always a yes or no.
    foreach want in array array[
      '{"amr": "password"}', '{"amr": [{"timestamp": "abc"}]}', '{"amr": [{"timestamp": 99999999999999}]}', '{"amr": [1, null, "x"]}',
      '{"amr": [{"method": "password"}], "iat": "x"}', '{"session_id": "not-a-uuid"}', '{"session_id": 7, "iat": null}', '{"amr": {}}'] loop
      perform pg_temp.b_claims(jsonb_build_object('sub', maya_u, 'role', 'authenticated', 'aal', 'aal1') || want::jsonb);
      f := f || pg_temp.b_eq('6j odd claims ' || want, pg_temp.b_n($q$select (public.coach_auth_state() ->> 'session_ok') in ('true', 'false')$q$), 'true');
    end loop;
    -- Claims with a later iat but an amr from before the reset: still told to sign in again.
    perform pg_temp.b_as(maya_u, 'aal1', now() + interval '1 hour', null, jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', floor(extract(epoch from now() - interval '1 hour'))::bigint)));
    f := f || pg_temp.b_eq('6k a refreshed token from before the reset (late iat, early amr)', pg_temp.b_n($q$select public.coach_auth_state() ->> 'session_ok'$q$), 'false');
    -- An amr with one entry before the reset and one after (the code given after it): the earliest counts.
    perform pg_temp.b_as(maya_u, 'aal2', now() + interval '1 hour', null, jsonb_build_array(
      jsonb_build_object('method', 'totp', 'timestamp', floor(extract(epoch from now() + interval '1 minute'))::bigint),
      jsonb_build_object('method', 'password', 'timestamp', floor(extract(epoch from now() - interval '1 hour'))::bigint)));
    f := f || pg_temp.b_eq('6l a code given after the reset doesn''t rescue a sign-in from before it', pg_temp.b_n($q$select public.coach_auth_state() ->> 'session_ok'$q$), 'false');

    -- ------------------------------------------------------------ 7. a sign-in from before the reset changes nothing
    -- Maya was reset in 5j (at the transaction's own time); a token whose sign-in began an hour earlier,
    -- at aal2 (where the database can't end its session, it keeps working).
    perform pg_temp.b_as(maya_u, 'aal2', now() + interval '1 hour', null, jsonb_build_array(
      jsonb_build_object('method', 'totp', 'timestamp', floor(extract(epoch from now() - interval '59 minutes'))::bigint),
      jsonb_build_object('method', 'password', 'timestamp', floor(extract(epoch from now() - interval '1 hour'))::bigint)));
    f := f || pg_temp.b_eq('7a it can''t make a new set of codes', pg_temp.b_n($q$select public.coach_recovery_codes_make() ->> 'status'$q$), 'signed_out');
    f := f || pg_temp.b_eq('7b it can''t turn an authenticator on', pg_temp.b_n($q$select public.coach_authenticator_on(null) ->> 'status'$q$), 'signed_out');
    f := f || pg_temp.b_eq('7c it can''t tick codes as saved', pg_temp.b_n($q$select public.coach_recovery_codes_saved() ->> 'status'$q$), 'signed_out');
    f := f || pg_temp.b_eq('7d it can''t use a code (one made since, by the new sign-in)', pg_temp.b_n(format($q$select public.coach_recovery_code_use(%L) ->> 'status'$q$, codes[4])), 'signed_out');
    f := f || pg_temp.b_eq('7e its state says so', pg_temp.b_n($q$select public.coach_auth_state() ->> 'session_ok'$q$), 'false');
    perform pg_temp.b_admin();
    f := f || pg_temp.b_eq('7f nothing changed: the new sign-in''s set is still the one in force', (select concat_ws('/', count(*), count(*) filter (where used_at is null)) from public.coach_recovery_codes where user_id = maya_u), '10/9');
    perform pg_temp.b_as(maya_u, 'aal2', now() + interval '1 minute');
    f := f || pg_temp.b_eq('7g a sign-in begun after the reset makes codes as before', pg_temp.b_n($q$select public.coach_recovery_codes_make() ->> 'status'$q$), 'made');

    -- ------------------------------------------------------------ NOTES (said, not failed)
    -- Same second: amr times are whole seconds, the reset's time isn't.
    perform pg_temp.b_as(own_u, 'aal2');
    perform public.coach_authenticator_reset(nina_c);
    perform pg_temp.b_as(nina_u, 'aal1', now(), null, jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', floor(extract(epoch from now()))::bigint)));
    raise notice 'NOTE 053: a sign-in begun in the same second as a reset reads session_ok %, so it may be asked to sign in once more (harmless)', public.coach_auth_state() ->> 'session_ok';
    -- Rule 41: no table rule asks for the authenticator level.
    perform pg_temp.b_as(maya_u, 'aal1', now() + interval '1 minute');
    raise notice 'NOTE 053: with only a password (aal1), an associate''s own sign-in still reads % client profile(s) and % note(s) straight from the tables: the code is enforced by the pages, not the database (CLAUDE.md sign-in rule 41)',
      pg_temp.b_n('select count(*) from public.client_profiles'), pg_temp.b_n('select count(*) from public.client_notes');

    perform pg_temp.b_admin();
    raise exception 'undo the test rows' using errcode = 'P0053', detail = array_to_string(f, E'\n');
  exception when sqlstate 'P0053' then
    perform pg_temp.b_admin();
  end;
  insert into b_failed select unnest(f);
end
$t$;

-- ---------------------------------------------------------------------------- 3. two transactions, one code (committed, then cleaned up)
begin;
do $s$
declare own_u uuid; maya_u uuid; maya_c uuid; j jsonb;
begin
  perform pg_temp.b_admin();
  own_u := pg_temp.b_user('t3-owner'); maya_u := pg_temp.b_user('t3-maya');
  insert into public.coaches (user_id, role, display_first_name) values (maya_u, 'coach', 'Maya') returning id into maya_c;
  perform pg_temp.b_as(maya_u, 'aal2');
  j := public.coach_recovery_codes_make();
  perform pg_temp.b_admin();
  insert into b_kept values ('maya', maya_u::text), ('owner', own_u::text), ('code', j -> 'codes' ->> 0), ('code2', j -> 'codes' ->> 1), ('set1', j ->> 'set_id');
end
$s$;
commit;

-- Tab 1 uses the code and commits.
begin;
do $s$
declare j jsonb; m uuid := (select v::uuid from b_kept where k = 'maya'); c text := (select v from b_kept where k = 'code');
begin
  perform pg_temp.b_as(m, 'aal1');
  j := public.coach_recovery_code_use(c);
  perform pg_temp.b_admin();
  insert into b_kept values ('tab1', j ->> 'status');
end
$s$;
commit;

-- Tab 2 tries the same code in its own transaction.
begin;
do $s$
declare j jsonb; m uuid := (select v::uuid from b_kept where k = 'maya'); c text := (select v from b_kept where k = 'code');
begin
  perform pg_temp.b_as(m, 'aal1');
  j := public.coach_recovery_code_use(c);
  perform pg_temp.b_admin();
  insert into b_kept values ('tab2', j ->> 'status');
end
$s$;
commit;

-- Two tabs make new codes one after the other; the first tab ticks its own (replaced) set.
begin;
do $s$
declare j jsonb; m uuid := (select v::uuid from b_kept where k = 'maya');
begin
  perform pg_temp.b_as(m, 'aal2');
  j := public.coach_recovery_codes_make();
  perform pg_temp.b_admin();
  insert into b_kept values ('setA', j ->> 'set_id'), ('codeA', j -> 'codes' ->> 0);
end
$s$;
commit;
begin;
do $s$
declare j jsonb; m uuid := (select v::uuid from b_kept where k = 'maya');
begin
  perform pg_temp.b_as(m, 'aal2');
  j := public.coach_recovery_codes_make();
  perform pg_temp.b_admin();
  insert into b_kept values ('setB', j ->> 'set_id'), ('codeB', j -> 'codes' ->> 0);
end
$s$;
commit;
begin;
do $s$
declare a text; b text; ua text; ub text; st text;
  m uuid := (select v::uuid from b_kept where k = 'maya');
  sa uuid := (select v::uuid from b_kept where k = 'setA'); sb uuid := (select v::uuid from b_kept where k = 'setB');
  ca text := (select v from b_kept where k = 'codeA'); cb text := (select v from b_kept where k = 'codeB');
begin
  perform pg_temp.b_as(m, 'aal2');
  a := public.coach_recovery_codes_saved(sa) ->> 'status';
  st := public.coach_auth_state() ->> 'codes_saved';
  b := public.coach_recovery_codes_saved(sb) ->> 'status';
  ua := public.coach_recovery_code_use(ca) ->> 'status';
  ub := public.coach_recovery_code_use(cb) ->> 'status';
  perform pg_temp.b_admin();
  insert into b_kept values ('tickA', a), ('savedAfterA', st), ('tickB', b), ('useA', ua), ('useB', ub);
end
$s$;
commit;

-- What part 3 found, then everything it made is taken away.
do $s$
declare
  f text[] := '{}';
  m uuid := (select v::uuid from b_kept where k = 'maya');
  o uuid := (select v::uuid from b_kept where k = 'owner');
begin
  f := f || pg_temp.b_eq('3a tab 1 uses the code', (select v from b_kept where k = 'tab1'), 'used');
  f := f || pg_temp.b_eq('3b tab 2, in its own transaction afterwards, is refused as a wrong code is', (select v from b_kept where k = 'tab2'), 'no_match');
  f := f || pg_temp.b_eq('3c the code was used once (the later sets replaced it, so none of the first set is left)', (select v from b_kept where k = 'tab1'), 'used');
  f := f || pg_temp.b_eq('3d new codes twice: the first tab''s tick is refused, and nothing is marked saved', concat_ws('/',
    (select v from b_kept where k = 'tickA'), (select v from b_kept where k = 'savedAfterA')), 'replaced/false');
  f := f || pg_temp.b_eq('3e the second tab''s tick counts', (select v from b_kept where k = 'tickB'), 'saved');
  f := f || pg_temp.b_eq('3f the first tab''s codes don''t work; the second''s do', concat_ws('/',
    (select v from b_kept where k = 'useA'), (select v from b_kept where k = 'useB')), 'no_match/used');
  delete from public.coach_authenticator_resets where coach_user_id in (m, o);
  delete from public.coach_recovery_codes where user_id in (m, o);
  delete from public.coach_authenticators where user_id in (m, o);
  delete from public.coaches where user_id in (m, o);
  delete from auth.users where id in (m, o);
  f := f || pg_temp.b_eq('3g everything part 3 made is gone', (select concat_ws('/', (select count(*) from auth.users where email like 'p6a-breakit-%'),
    (select count(*) from public.coach_authenticators where user_id in (m, o)), (select count(*) from public.coach_recovery_codes where user_id in (m, o)))), '0/0/0');
  insert into b_failed select unnest(f);
end
$s$;

do $s$
declare n integer := (select count(*) from b_failed);
begin
  if n > 0 then
    raise exception E'053 BREAK-IT FAILED (%):\n%', n, (select string_agg(msg, E'\n') from b_failed);
  end if;
  raise notice '053 BREAK-IT CHECKS PASSED';
end
$s$;
drop table b_kept;
drop table b_failed;
