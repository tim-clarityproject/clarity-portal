-- =============================================================================
-- 055_recovery_codes_test.sql
-- Checks 055's recovery codes part (part 2 of supabase/migrations/055_own_questions.sql,
-- folded into 055): using a recovery code ends the coach's other sign-ins and
-- keeps the one that used it. RUN ORDER: 053, 054, then 055, then this.
--
-- WHAT IT DOES
--   Makes an invented owner (Tess), two associates (Maya and Nina) and a
--   client (Sam). Maya has three sign-ins: her laptop (A, aal2, two hours
--   old), the lost phone (B, aal2, an hour old) and the computer she uses the
--   code on (C, aal1, a minute old). It checks:
--     1. the new columns are there, the helpers are nobody's, the functions
--        the screens use are still open to someone signed in;
--     2. before the code, the lost phone's sign-in reads coach data;
--     3. the code is used on C: "others_ended", the other two sessions and
--        their refresh tokens go where the database can reach them, C stays;
--     4. the lost phone (B) and the laptop (A) are refused from then on:
--        coach_code_ok() false, coach_auth_state() says 'recovery', every
--        authenticator function answers 'signed_out', no coach data;
--     5. the marker alone holds where the database couldn't remove a
--        session (B's session put back as a hosted project would leave it);
--     6. C carries on: aal1 now, and aal2 with the same session once the new
--        phone is on (its first sign-in time is still from before);
--     7. a new sign-in after the code is fine;
--     8. a second code used elsewhere ends C in turn;
--     9. the owner's reset still says 'reset' for a sign-in from before both;
--    10. a sign-in whose token has no session id sets no marker, so it never
--        shuts itself out (Nina);
--    11. a client is told nothing.
--   On the local stand-in, which has no Supabase auth.sessions or
--   auth.refresh_tokens, the test makes them in Supabase's shape for its own
--   run. Everything it makes is undone at the end.
--
--   It ends with the notice 055 RECOVERY CODES CHECKS PASSED, or stops with
--   FAILED and a list naming each check that failed.
-- =============================================================================
create or replace function pg_temp.r_as(p uuid, p_aal text, p_began timestamptz, p_session uuid) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated', 'aal', p_aal,
    'amr', json_build_array(json_build_object('method', 'password', 'timestamp', floor(extract(epoch from p_began))::bigint)),
    'iat', floor(extract(epoch from now()))::bigint, 'session_id', p_session)::text, true);
  perform set_config('role', 'authenticated', true);
end $f$;
create or replace function pg_temp.r_admin() returns void language plpgsql as $f$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
end $f$;
create or replace function pg_temp.r_user(p_label text) returns uuid language plpgsql as $f$
declare u uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, aud, role, email_confirmed_at)
  values (u, 'p6a-test-' || p_label || '-' || u || '@example.invalid', 'authenticated', 'authenticated', now());
  return u;
end $f$;
create or replace function pg_temp.r_n(p_sql text) returns text language plpgsql as $f$
declare v text;
begin
  execute p_sql into v;
  return coalesce(v, 'null');
exception when others then
  return 'error ' || sqlstate;
end $f$;
create or replace function pg_temp.r_eq(p_name text, p_got text, p_want text) returns text[] language sql as $f$
  select case when p_got is distinct from p_want
              then array[format('%s: expected %s, got %s', p_name, p_want, coalesce(p_got, 'nothing'))]
              else '{}'::text[] end;
$f$;

do $t$
declare
  f text[] := '{}';
  tess_u uuid; maya_u uuid; nina_u uuid; sam_u uuid;
  tess_c uuid; maya_c uuid; nina_c uuid;
  sa uuid := gen_random_uuid();   -- Maya's laptop
  sb uuid := gen_random_uuid();   -- the lost phone
  sc uuid := gen_random_uuid();   -- where the code is used
  sd uuid := gen_random_uuid();   -- a sign-in after the code
  se uuid := gen_random_uuid();   -- from before everything, for the reset
  codes text[];
  ncodes text[];
  j jsonb;
  auth_rows boolean := true;
begin
  -- ------------------------------------------------------------ 1. there, and locked down
  f := f || pg_temp.r_eq('1a the marker''s columns', (select count(*)::text from information_schema.columns
    where table_schema = 'public' and table_name = 'coach_authenticators' and column_name in ('others_ended_at', 'kept_session')), '2');
  f := f || pg_temp.r_eq('1b the helpers are nobody''s', concat_ws('/',
    has_function_privilege('authenticated', 'public._coach_auth_ended(timestamptz)', 'execute'),
    has_function_privilege('authenticated', 'public._coach_auth_end_others(uuid,uuid)', 'execute'),
    has_function_privilege('authenticated', 'public._coach_auth_session_ok(timestamptz)', 'execute'),
    has_function_privilege('anon', 'public._coach_auth_ended(timestamptz)', 'execute')), 'f/f/f/f');
  f := f || pg_temp.r_eq('1c the screens'' functions: signed in yes, signed out no', concat_ws('/',
    has_function_privilege('authenticated', 'public.coach_recovery_code_use(text)', 'execute'),
    has_function_privilege('authenticated', 'public.coach_auth_state()', 'execute'),
    has_function_privilege('anon', 'public.coach_recovery_code_use(text)', 'execute'),
    has_function_privilege('anon', 'public.coach_auth_state()', 'execute')), 't/t/f/f');
  f := f || pg_temp.r_eq('1d signed in still writes nothing of coach_authenticators', (select (has_table_privilege('authenticated', 'public.coach_authenticators', 'update')
    or has_table_privilege('authenticated', 'public.coach_authenticators', 'insert'))::text), 'false');

  begin
    -- Supabase's own tables, in their shape, on the stand-in only.
    if to_regclass('auth.sessions') is null then
      create table auth.sessions (id uuid primary key, user_id uuid not null references auth.users (id) on delete cascade,
        created_at timestamptz, updated_at timestamptz, factor_id uuid, aal text);
    end if;
    if to_regclass('auth.refresh_tokens') is null then
      create table auth.refresh_tokens (id bigserial primary key, token varchar(255), user_id varchar(255), revoked boolean,
        created_at timestamptz, updated_at timestamptz, parent varchar(255), session_id uuid references auth.sessions (id) on delete cascade);
    end if;

    perform pg_temp.r_admin();
    tess_u := pg_temp.r_user('tess'); maya_u := pg_temp.r_user('maya'); nina_u := pg_temp.r_user('nina'); sam_u := pg_temp.r_user('sam');
    insert into public.coaches (user_id, role, display_first_name) values (tess_u, 'owner', 'Tess') returning id into tess_c;
    insert into public.coaches (user_id, role, display_first_name) values (maya_u, 'coach', 'Maya') returning id into maya_c;
    insert into public.coaches (user_id, role, display_first_name) values (nina_u, 'coach', 'Nina') returning id into nina_c;
    begin
      execute 'insert into auth.sessions (id, user_id, created_at, updated_at) values ($1, $4, now(), now()), ($2, $4, now(), now()), ($3, $4, now(), now())'
        using sa, sb, sc, maya_u;
      execute 'insert into auth.refresh_tokens (token, user_id, session_id, revoked, created_at, updated_at) values
        ($1, $4, $5, false, now(), now()), ($2, $4, $6, false, now(), now()), ($3, $4, $7, false, now(), now())'
        using 'p6a-test-' || gen_random_uuid(), 'p6a-test-' || gen_random_uuid(), 'p6a-test-' || gen_random_uuid(), maya_u::text, sa, sb, sc;
    exception when others then
      auth_rows := false;
    end;

    -- Maya's codes, made on her laptop at aal2.
    perform pg_temp.r_as(maya_u, 'aal2', now() - interval '2 hours', sa);
    j := public.coach_recovery_codes_make();
    codes := array(select jsonb_array_elements_text(j -> 'codes'));
    perform public.coach_recovery_codes_saved();

    -- ------------------------------------------------------------ 2. before the code
    perform pg_temp.r_as(maya_u, 'aal2', now() - interval '1 hour', sb);
    f := f || pg_temp.r_eq('2a the lost phone reads coach data before the code', concat_ws('/', public.coach_code_ok(), public.is_coach(), public.my_coach_id() = maya_c), 't/t/t');
    j := public.coach_auth_state();
    f := f || pg_temp.r_eq('2b nothing ended yet', concat_ws('/', j ->> 'session_ok', coalesce(j ->> 'ended_by', 'none')), 'true/none');

    -- ------------------------------------------------------------ 3. the code, used on C
    perform pg_temp.r_as(maya_u, 'aal1', now() - interval '1 minute', sc);
    j := public.coach_recovery_code_use(codes[1]);
    f := f || pg_temp.r_eq('3a used, 9 left, the others ended', concat_ws('/', j ->> 'status', j ->> 'codes_left', j ->> 'others_ended'), 'used/9/true');
    if auth_rows then
      f := f || pg_temp.r_eq('3b two other sessions went', j ->> 'sessions_removed', '2');
      perform pg_temp.r_admin();
      f := f || pg_temp.r_eq('3c only C''s session and refresh token are left', concat_ws('/',
        (select string_agg(case id when sc then 'C' else 'other' end, ',') from auth.sessions where user_id = maya_u),
        (select string_agg(case session_id when sc then 'C' else 'other' end, ',') from auth.refresh_tokens where user_id = maya_u::text)), 'C/C');
    else
      raise notice '055: this database doesn''t let the test write auth.sessions, so 3b and 3c are left to Supabase''s own sign out';
    end if;
    perform pg_temp.r_admin();
    f := f || pg_temp.r_eq('3d the marker names C', (select concat_ws('/', kept_session = sc, others_ended_at is not null) from public.coach_authenticators where user_id = maya_u), 't/t');

    -- ------------------------------------------------------------ 4. the lost phone and the laptop are out
    foreach j in array array[jsonb_build_object('s', sb, 'b', now() - interval '1 hour', 'who', 'the lost phone'),
                             jsonb_build_object('s', sa, 'b', now() - interval '2 hours', 'who', 'the laptop')] loop
      perform pg_temp.r_as(maya_u, 'aal2', (j ->> 'b')::timestamptz, (j ->> 's')::uuid);
      f := f || pg_temp.r_eq('4a ' || (j ->> 'who') || ': no coach data', concat_ws('/', public.coach_code_ok(), public.is_coach(), coalesce(public.my_coach_id()::text, 'none')), 'f/f/none');
      f := f || pg_temp.r_eq('4b ' || (j ->> 'who') || ': told why', (select concat_ws('/', s ->> 'session_ok', s ->> 'ended_by') from (select public.coach_auth_state() s) x), 'false/recovery');
      f := f || pg_temp.r_eq('4c ' || (j ->> 'who') || ': changes nothing', concat_ws('/',
        public.coach_recovery_codes_make() ->> 'status', public.coach_recovery_codes_saved() ->> 'status',
        public.coach_authenticator_on(null) ->> 'status', public.coach_recovery_code_use(codes[2]) ->> 'status'), 'signed_out/signed_out/signed_out/signed_out');
    end loop;
    perform pg_temp.r_admin();
    f := f || pg_temp.r_eq('4d the code the lost phone tried wasn''t spent', (select (used_at is null)::text from public.coach_recovery_codes where user_id = maya_u and position = 2), 'true');

    -- ------------------------------------------------------------ 5. the marker alone (a hosted project that couldn't remove B)
    if auth_rows then
      execute 'insert into auth.sessions (id, user_id, created_at, updated_at) values ($1, $2, now(), now())' using sb, maya_u;
    end if;
    perform pg_temp.r_as(maya_u, 'aal2', now() - interval '1 hour', sb);
    f := f || pg_temp.r_eq('5a its session still there, the lost phone is still out', concat_ws('/', public.coach_code_ok(), public.coach_auth_state() ->> 'ended_by'), 'f/recovery');
    perform pg_temp.r_admin();
    if auth_rows then
      execute 'delete from auth.sessions where id = $1' using sb;
    end if;

    -- ------------------------------------------------------------ 6. C carries on
    perform pg_temp.r_as(maya_u, 'aal1', now() - interval '1 minute', sc);
    j := public.coach_auth_state();
    f := f || pg_temp.r_eq('6a C, at aal1: good, set-up owed', concat_ws('/', j ->> 'session_ok', coalesce(j ->> 'ended_by', 'none'), j ->> 'turned_on_at'), 'true/none');
    f := f || pg_temp.r_eq('6b C at aal1 still gets no coach data', public.coach_code_ok()::text, 'false');
    perform pg_temp.r_as(maya_u, 'aal2', now() - interval '1 minute', sc);
    f := f || pg_temp.r_eq('6c C at aal2 (the new phone on): coach data', concat_ws('/', public.coach_authenticator_on(gen_random_uuid()) ->> 'status', public.coach_code_ok(), public.is_coach()), 'on/t/t');

    -- ------------------------------------------------------------ 7. a new sign-in after the code
    perform pg_temp.r_admin();
    if auth_rows then
      execute 'insert into auth.sessions (id, user_id, created_at, updated_at) values ($1, $2, now(), now())' using sd, maya_u;
    end if;
    perform pg_temp.r_as(maya_u, 'aal2', now() + interval '1 minute', sd);
    f := f || pg_temp.r_eq('7a a sign-in begun after the code is fine', concat_ws('/', public.coach_auth_state() ->> 'session_ok', public.coach_code_ok()), 'true/t');

    -- ------------------------------------------------------------ 8. a second code, used on D, ends C
    perform pg_temp.r_as(maya_u, 'aal1', now() + interval '1 minute', sd);
    j := public.coach_recovery_code_use(codes[3]);
    f := f || pg_temp.r_eq('8a used on D, the others ended', concat_ws('/', j ->> 'status', j ->> 'codes_left', j ->> 'others_ended'), 'used/8/true');
    perform pg_temp.r_as(maya_u, 'aal2', now() - interval '1 minute', sc);
    f := f || pg_temp.r_eq('8b C is out now', concat_ws('/', public.coach_code_ok(), public.coach_auth_state() ->> 'ended_by'), 'f/recovery');
    perform pg_temp.r_as(maya_u, 'aal1', now() + interval '1 minute', sd);
    f := f || pg_temp.r_eq('8c D carries on', public.coach_auth_state() ->> 'session_ok', 'true');

    -- ------------------------------------------------------------ 9. the owner's reset still comes first
    perform pg_temp.r_as(tess_u, 'aal2', now() - interval '1 hour', null);
    f := f || pg_temp.r_eq('9a the owner resets Maya', public.coach_authenticator_reset(maya_c) ->> 'status', 'reset');
    perform pg_temp.r_as(maya_u, 'aal2', now() - interval '3 hours', se);
    f := f || pg_temp.r_eq('9b a sign-in from before both is told it was the reset', concat_ws('/', public.coach_auth_state() ->> 'ended_by', public.coach_code_ok()), 'reset/f');

    -- ------------------------------------------------------------ 10. no session id: no marker
    perform pg_temp.r_as(nina_u, 'aal2', now() - interval '1 hour', null);
    ncodes := array(select jsonb_array_elements_text(public.coach_recovery_codes_make() -> 'codes'));
    perform pg_temp.r_as(nina_u, 'aal1', now() - interval '1 minute', null);
    j := public.coach_recovery_code_use(ncodes[1]);
    f := f || pg_temp.r_eq('10a used, but no sign-in could be told apart', concat_ws('/', j ->> 'status', j ->> 'others_ended', coalesce(j ->> 'sessions_removed', 'null')), 'used/false/null');
    f := f || pg_temp.r_eq('10b so it never shuts itself out', concat_ws('/', public.coach_auth_state() ->> 'session_ok', public.coach_recovery_code_use(ncodes[2]) ->> 'status'), 'true/used');
    perform pg_temp.r_admin();
    f := f || pg_temp.r_eq('10c no marker for Nina', (select (others_ended_at is null and kept_session is null)::text from public.coach_authenticators where user_id = nina_u), 'true');

    -- ------------------------------------------------------------ 11. a client
    perform pg_temp.r_as(sam_u, 'aal1', now(), gen_random_uuid());
    f := f || pg_temp.r_eq('11a a client is told nothing', pg_temp.r_n('select public.coach_auth_state()::text'), '{"coach": false}');
    f := f || pg_temp.r_eq('11b a client uses no code', pg_temp.r_n($q$select public.coach_recovery_code_use('abcd-efgh')::text$q$), 'error 42501');

    perform pg_temp.r_admin();
    raise exception 'undo the test rows' using errcode = 'P0055';
  exception when sqlstate 'P0055' then
    perform pg_temp.r_admin();
  end;

  f := f || pg_temp.r_eq('12 everything the test made is undone', (select count(*)::text from auth.users where email like 'p6a-test-%@example.invalid'), '0');

  if cardinality(f) > 0 then
    raise exception E'055 RECOVERY CODES FAILED (%):\n%', cardinality(f), array_to_string(f, E'\n');
  end if;
  raise notice '055 RECOVERY CODES CHECKS PASSED';
end
$t$;
