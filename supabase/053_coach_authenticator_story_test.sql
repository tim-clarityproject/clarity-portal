-- =============================================================================
-- 053_coach_authenticator_story_test.sql
-- The functionality tester's story for 053 (Phase 6a run 5, 21 Nov), told
-- in the database alone. RUN ORDER: 026, 049, 053, then this (after 053's
-- own test, or instead of it). Everything it makes is undone at the end.
--
-- THE STORY (an invented owner, Tess, and an invented associate, Maya)
--   1. Maya's first sign-in: no authenticator and no codes yet; turning it
--      on and making codes need the code just given (aal2); 10 codes, kept
--      as bcrypt hashes only; ticked as saved.
--   2. Lost phone: a recovery code gets in (9 left), its phone's factor
--      goes, the same code again is refused, and so is a wrong one.
--   3. A new phone, then new codes in Sign-in security: the old codes stop
--      working and it reads 10 of 10 again, unsaved until ticked.
--   4. Codes down to 2 left: the count the 2-or-fewer line reads.
--   5. An associate can't reset anyone (not the owner, not themself).
--   6. The owner: can't reset their own; resets Maya at aal2: the codes,
--      factors and every session go, and the reset is recorded (who reset
--      whom, and when).
--   7. Maya's sign-in from before the reset is told to sign in again: by
--      its session being gone, and also where the database couldn't see
--      sessions, after a refresh gave its token a new iat (its amr time is
--      from before the reset).
--   8. Maya sets up again: a new sign-in is fine, a new set of codes, and
--      the codes from before the reset never work.
--
--   On the local stand-in, which has no Supabase auth.mfa_factors,
--   auth.sessions or auth.refresh_tokens, it makes them in Supabase's shape
--   for its own run. Ends with the notice 053 STORY PASSED, or stops with
--   FAILED and the list of each check that failed.
-- =============================================================================
create or replace function pg_temp.s_as(p uuid, p_aal text default 'aal1', p_iat timestamptz default now(),
  p_session uuid default null, p_signed_in timestamptz default null) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated', 'aal', p_aal,
    'iat', floor(extract(epoch from p_iat))::bigint, 'session_id', p_session,
    'amr', case when p_signed_in is null then null
                else json_build_array(json_build_object('method', 'password', 'timestamp', floor(extract(epoch from p_signed_in))::bigint)) end)::text, true);
  perform set_config('role', 'authenticated', true);
end $f$;
create or replace function pg_temp.s_admin() returns void language plpgsql as $f$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
end $f$;
create or replace function pg_temp.s_user(p_label text) returns uuid language plpgsql as $f$
declare u uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, aud, role, email_confirmed_at)
  values (u, 'p6a-story-' || p_label || '-' || u || '@example.invalid', 'authenticated', 'authenticated', now());
  return u;
end $f$;
create or replace function pg_temp.s_n(p_sql text) returns text language plpgsql as $f$
declare v text;
begin
  execute p_sql into v;
  return coalesce(v, 'null');
exception when others then
  return 'error ' || sqlstate;
end $f$;
create or replace function pg_temp.s_eq(p_name text, p_got text, p_want text) returns text[] language sql as $f$
  select case when p_got is distinct from p_want
              then array[format('%s: expected %s, got %s', p_name, p_want, coalesce(p_got, 'nothing'))]
              else '{}'::text[] end;
$f$;

do $t$
declare
  f text[] := '{}';
  own_u uuid; maya_u uuid; own_c uuid; maya_c uuid;
  j jsonb;
  codes text[]; fresh text[]; again text[];
  auth_rows boolean := true;
  sess uuid := gen_random_uuid();
  laptop uuid := gen_random_uuid();
  signed_in timestamptz := now() - interval '2 hours';
  i integer;
begin
  begin
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

    perform pg_temp.s_admin();
    own_u := pg_temp.s_user('owner'); maya_u := pg_temp.s_user('maya');
    insert into public.coaches (user_id, role, display_first_name) values (own_u, 'owner', 'Tess') returning id into own_c;
    insert into public.coaches (user_id, role, display_first_name) values (maya_u, 'coach', 'Maya') returning id into maya_c;

    -- ------------------------------------------------------------ 1. the first sign-in
    perform pg_temp.s_as(maya_u, 'aal1', now(), null, now());
    j := public.coach_auth_state();
    f := f || pg_temp.s_eq('1a a new associate: nothing on, no codes, the owner named', concat_ws('/', j ->> 'coach', j ->> 'owner', j ->> 'turned_on_at', j ->> 'codes_total', j ->> 'codes_saved', j ->> 'owner_first_name', j ->> 'session_ok'),
      'true/false/0/false/Tess/true');
    f := f || pg_temp.s_eq('1b turning it on needs the code just given', public.coach_authenticator_on(null) ->> 'status', 'needs_code');
    f := f || pg_temp.s_eq('1c and so do the codes', public.coach_recovery_codes_make() ->> 'status', 'needs_code');
    perform pg_temp.s_as(maya_u, 'aal2', now(), null, now());
    f := f || pg_temp.s_eq('1d Turn it on', public.coach_authenticator_on(gen_random_uuid()) ->> 'status', 'on');
    j := public.coach_recovery_codes_make();
    codes := array(select jsonb_array_elements_text(j -> 'codes'));
    f := f || pg_temp.s_eq('1e ten codes, all different', concat_ws('/', j ->> 'status', cardinality(codes), (select count(distinct c) from unnest(codes) c)), 'made/10/10');
    perform pg_temp.s_admin();
    f := f || pg_temp.s_eq('1f kept as bcrypt hashes only', (select concat_ws('/', count(*), count(*) filter (where code_hash like '$2a$10$%'),
      count(*) filter (where code_hash = any (codes) or code_hash = any (array(select replace(c, '-', '') from unnest(codes) c)))) from public.coach_recovery_codes where user_id = maya_u), '10/10/0');
    perform pg_temp.s_as(maya_u, 'aal2', now(), null, now());
    f := f || pg_temp.s_eq('1g not saved until ticked', public.coach_auth_state() ->> 'codes_saved', 'false');
    f := f || pg_temp.s_eq('1h the tick', public.coach_recovery_codes_saved() ->> 'status', 'saved');
    j := public.coach_auth_state();
    f := f || pg_temp.s_eq('1i on since, 10 of 10, saved', concat_ws('/', (j ->> 'turned_on_at') is not null, j ->> 'codes_left', j ->> 'codes_total', j ->> 'codes_saved'), 't/10/10/true');

    -- ------------------------------------------------------------ 2. the lost phone
    perform pg_temp.s_admin();
    begin
      execute 'insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at) values ($1, $2, $3, ''totp'', ''verified'', now(), now())'
        using gen_random_uuid(), maya_u, 'p6a-story lost phone';
    exception when others then auth_rows := false;
    end;
    perform pg_temp.s_as(maya_u, 'aal1', now(), null, now());
    f := f || pg_temp.s_eq('2a a wrong code', public.coach_recovery_code_use('zzzz-zzzz') ->> 'status', 'no_match');
    j := public.coach_recovery_code_use(upper(codes[1]));
    f := f || pg_temp.s_eq('2b a recovery code gets in: 9 left', concat_ws('/', j ->> 'status', j ->> 'codes_left'), 'used/9');
    f := f || pg_temp.s_eq('2c the same code again is refused, as a wrong one is', public.coach_recovery_code_use(codes[1]) ->> 'status', 'no_match');
    j := public.coach_auth_state();
    f := f || pg_temp.s_eq('2d off until set up again, 9 of 10, when it was used', concat_ws('/', j ->> 'turned_on_at', j ->> 'codes_left', j ->> 'codes_total', (j ->> 'recovered_at') is not null), '9/10/t');
    if auth_rows then
      perform pg_temp.s_admin();
      f := f || pg_temp.s_eq('2e the lost phone''s factor is gone', (select count(*)::text from auth.mfa_factors where user_id = maya_u), '0');
    end if;

    -- ------------------------------------------------------------ 3. a new phone, then new codes
    perform pg_temp.s_as(maya_u, 'aal2', now(), null, now());
    f := f || pg_temp.s_eq('3a the new phone turned on', public.coach_authenticator_on(gen_random_uuid()) ->> 'status', 'on');
    perform pg_temp.s_as(maya_u, 'aal1', now(), null, now());
    f := f || pg_temp.s_eq('3b Make new codes needs a current code', public.coach_recovery_codes_make() ->> 'status', 'needs_code');
    perform pg_temp.s_as(maya_u, 'aal2', now(), null, now());
    j := public.coach_recovery_codes_make();
    fresh := array(select jsonb_array_elements_text(j -> 'codes'));
    f := f || pg_temp.s_eq('3c a new set of 10, none the same as before', concat_ws('/', j ->> 'status', cardinality(fresh), (select count(*) from unnest(fresh) c where c = any (codes))), 'made/10/0');
    j := public.coach_auth_state();
    f := f || pg_temp.s_eq('3d 10 of 10 left, unsaved until ticked', concat_ws('/', j ->> 'codes_left', j ->> 'codes_total', j ->> 'codes_saved'), '10/10/false');
    perform public.coach_recovery_codes_saved();
    perform pg_temp.s_as(maya_u, 'aal1', now(), null, now());
    f := f || pg_temp.s_eq('3e an old code stops working', public.coach_recovery_code_use(codes[2]) ->> 'status', 'no_match');
    f := f || pg_temp.s_eq('3f nor does the one already used', public.coach_recovery_code_use(codes[1]) ->> 'status', 'no_match');

    -- ------------------------------------------------------------ 4. down to 2 left
    for i in 1..8 loop
      perform public.coach_recovery_code_use(fresh[i]);
    end loop;
    j := public.coach_auth_state();
    f := f || pg_temp.s_eq('4a 2 of 10 left', concat_ws('/', j ->> 'codes_left', j ->> 'codes_total'), '2/10');
    perform pg_temp.s_as(maya_u, 'aal2', now(), null, now());
    perform public.coach_authenticator_on(gen_random_uuid());

    -- ------------------------------------------------------------ 5. an associate can't reset
    f := f || pg_temp.s_eq('5a an associate can''t reset the owner', pg_temp.s_n(format('select public.coach_authenticator_reset(%L)::text', own_c)), 'error 42501');
    f := f || pg_temp.s_eq('5b nor themself', pg_temp.s_n(format('select public.coach_authenticator_reset(%L)::text', maya_c)), 'error 42501');
    perform pg_temp.s_admin();
    f := f || pg_temp.s_eq('5c nothing was recorded', (select count(*)::text from public.coach_authenticator_resets where coach_user_id in (own_u, maya_u)), '0');

    -- ------------------------------------------------------------ 6. the owner resets Maya
    if auth_rows then
      execute 'insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at) values ($1, $2, $3, ''totp'', ''verified'', now(), now())'
        using gen_random_uuid(), maya_u, 'p6a-story new phone';
      execute 'insert into auth.sessions (id, user_id, created_at, updated_at, aal) values ($1, $2, $4, $4, ''aal2''), ($3, $2, $4, $4, ''aal2'')' using sess, maya_u, laptop, signed_in;
      execute 'insert into auth.refresh_tokens (token, user_id, session_id, revoked, created_at, updated_at) values ($1, $2, $3, false, now(), now())'
        using 'p6a-story-' || gen_random_uuid(), maya_u::text, sess;
    end if;
    perform pg_temp.s_as(own_u, 'aal2', now(), null, now());
    f := f || pg_temp.s_eq('6a the owner can''t reset their own', public.coach_authenticator_reset(own_c) ->> 'status', 'self');
    perform pg_temp.s_as(own_u, 'aal1', now(), null, now());
    f := f || pg_temp.s_eq('6b the owner gives a current code first', public.coach_authenticator_reset(maya_c) ->> 'status', 'needs_code');
    perform pg_temp.s_as(own_u, 'aal2', now(), null, now());
    j := public.coach_authenticator_reset(maya_c);
    f := f || pg_temp.s_eq('6c reset: Maya''s 10 codes go (2 unused, 8 used)', concat_ws('/', j ->> 'status', j ->> 'codes_removed'), 'reset/10');
    if auth_rows then
      f := f || pg_temp.s_eq('6d and her factor, and both sessions', concat_ws('/', j ->> 'factors_removed', j ->> 'sessions_removed'), '1/2');
      perform pg_temp.s_admin();
      f := f || pg_temp.s_eq('6e nothing of her sign-ins is left', (select concat_ws('/', (select count(*) from auth.mfa_factors where user_id = maya_u),
        (select count(*) from auth.sessions where user_id = maya_u), (select count(*) from auth.refresh_tokens where user_id = maya_u::text))), '0/0/0');
    end if;
    perform pg_temp.s_admin();
    f := f || pg_temp.s_eq('6f recorded once: who reset whom, and when', (select concat_ws('/', count(*), bool_and(reset_by = own_u), bool_and(coach_user_id = maya_u), bool_and(reset_at > now() - interval '1 minute'))
      from public.coach_authenticator_resets where coach_user_id in (own_u, maya_u)), '1/t/t/t');
    perform pg_temp.s_as(own_u, 'aal2', now(), null, now());
    f := f || pg_temp.s_eq('6g the owner reads the record', pg_temp.s_n(format('select count(*) from public.coach_authenticator_resets where coach_user_id = %L', maya_u)), '1');

    -- ------------------------------------------------------------ 7. the sign-in from before the reset
    if auth_rows then
      perform pg_temp.s_as(maya_u, 'aal2', now() + interval '1 minute', sess, signed_in);
      f := f || pg_temp.s_eq('7a her open session (gone from the database) is told to sign in again', public.coach_auth_state() ->> 'session_ok', 'false');
    end if;
    -- Where the database can't see sessions: the token refreshed after the
    -- reset has a new iat, but its sign-in (amr) began before it.
    perform pg_temp.s_as(maya_u, 'aal2', now() + interval '1 minute', null, signed_in);
    f := f || pg_temp.s_eq('7b a refreshed token from before the reset is still told to sign in again', public.coach_auth_state() ->> 'session_ok', 'false');
    perform pg_temp.s_as(maya_u, 'aal1', signed_in, null, null);
    f := f || pg_temp.s_eq('7c a token with no amr falls back to its iat', public.coach_auth_state() ->> 'session_ok', 'false');
    j := public.coach_auth_state();
    f := f || pg_temp.s_eq('7d nothing is on and there are no codes', concat_ws('/', j ->> 'turned_on_at', j ->> 'codes_total', j ->> 'codes_saved'), '0/false');

    -- ------------------------------------------------------------ 8. Maya sets up again
    perform pg_temp.s_as(maya_u, 'aal1', now() + interval '1 minute', null, now() + interval '1 minute');
    f := f || pg_temp.s_eq('8a a new sign-in after the reset is fine', public.coach_auth_state() ->> 'session_ok', 'true');
    f := f || pg_temp.s_eq('8b a code from before the reset', public.coach_recovery_code_use(fresh[9]) ->> 'status', 'no_match');
    perform pg_temp.s_as(maya_u, 'aal2', now() + interval '1 minute', null, now() + interval '1 minute');
    f := f || pg_temp.s_eq('8c turned on again', public.coach_authenticator_on(gen_random_uuid()) ->> 'status', 'on');
    j := public.coach_recovery_codes_make();
    again := array(select jsonb_array_elements_text(j -> 'codes'));
    f := f || pg_temp.s_eq('8d a new set of 10', concat_ws('/', j ->> 'status', cardinality(again)), 'made/10');
    f := f || pg_temp.s_eq('8e ticked', public.coach_recovery_codes_saved() ->> 'status', 'saved');
    perform pg_temp.s_as(maya_u, 'aal1', now() + interval '1 minute', null, now() + interval '1 minute');
    f := f || pg_temp.s_eq('8f the last code from before the reset still doesn''t work', public.coach_recovery_code_use(fresh[10]) ->> 'status', 'no_match');
    j := public.coach_recovery_code_use(again[1]);
    f := f || pg_temp.s_eq('8g a new one does: 9 left', concat_ws('/', j ->> 'status', j ->> 'codes_left'), 'used/9');

    perform pg_temp.s_admin();
    raise exception 'undo the story' using errcode = 'P0053';
  exception when sqlstate 'P0053' then
    perform pg_temp.s_admin();
  end;

  f := f || pg_temp.s_eq('9 everything the story made is undone', (select concat_ws('/', (select count(*) from auth.users where email like 'p6a-story-%@example.invalid'),
    (select count(*) from public.coach_authenticator_resets r where not exists (select 1 from auth.users u where u.id = r.coach_user_id)))), '0/0');

  if cardinality(f) > 0 then
    raise exception E'053 STORY FAILED (%):\n%', cardinality(f), array_to_string(f, E'\n');
  end if;
  raise notice '053 STORY PASSED';
end
$t$;
