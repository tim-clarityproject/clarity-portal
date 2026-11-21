-- =============================================================================
-- 053_coach_authenticator_test.sql
-- Checks 053_coach_authenticator.sql. RUN ORDER: 026, 049, then 053, then this.
--
-- WHAT IT DOES
--   Makes an invented owner (Tess), two associates (Maya and Nina), a client
--   account (Sam) and someone signed out, and checks:
--     1. the three tables are locked down: rules on, nothing written except
--        through the functions, the hash never readable, the functions open
--        only to someone signed in, the helpers to nobody; it recorded itself;
--     2. a client and someone signed out get nothing (Clients never see any
--        of this);
--     3. making codes needs a current 6-digit code (aal2): 10 codes, all
--        different, in the code's shape, kept only as bcrypt hashes;
--     4. turned on since, and the tick "I've saved them somewhere safe.";
--     5. a code is used once: typed in any case, with spaces or a dash; the
--        same code again is refused, with the same words as a wrong one;
--     6. 5 wrong codes in a row, then 30 seconds, when even a right code waits;
--     7. a used code removes the lost phone's factor where the database can;
--     8. new codes stop the old ones working;
--     9. the reset: an associate can't reset anyone (not another associate,
--        not themself, not the owner); the owner needs a current code, can't
--        reset themself, and resets an associate: codes, factors and every
--        session go, the reset is recorded (who reset whom, and when), and a
--        sign-in from before it is told to sign in again;
--    10. each reads only their own: the owner reads every reset, an
--        associate only their own, a client none;
--    11. a coach who is switched off is no longer a coach here.
--   On the local stand-in, which has no Supabase auth.mfa_factors,
--   auth.sessions or auth.refresh_tokens, the test makes them in Supabase's
--   shape for its own run. Everything it makes, those included, is undone at
--   the end.
--
--   It ends with the notice 053 CHECKS PASSED, or stops with FAILED and a
--   list naming each check that failed.
-- =============================================================================
create or replace function pg_temp.t_coach_as(p uuid, p_aal text default 'aal1', p_iat timestamptz default now(), p_session uuid default null) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated', 'aal', p_aal,
    'iat', floor(extract(epoch from p_iat))::bigint, 'session_id', p_session)::text, true);
  perform set_config('role', 'authenticated', true);
end $f$;
create or replace function pg_temp.t_anon() returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('role', 'anon', true);
end $f$;
create or replace function pg_temp.t_admin() returns void language plpgsql as $f$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
end $f$;
create or replace function pg_temp.t_user(p_label text) returns uuid language plpgsql as $f$
declare u uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, aud, role, email_confirmed_at)
  values (u, 'p6a-test-' || p_label || '-' || u || '@example.invalid', 'authenticated', 'authenticated', now());
  return u;
end $f$;
create or replace function pg_temp.t_n(p_sql text) returns text language plpgsql as $f$
declare v text;
begin
  execute p_sql into v;
  return coalesce(v, 'null');
exception when others then
  return 'error ' || sqlstate;
end $f$;
create or replace function pg_temp.t_rows(p_sql text) returns text language plpgsql as $f$
declare n bigint;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n::text;
exception when others then
  return 'error ' || sqlstate;
end $f$;
create or replace function pg_temp.t_eq(p_name text, p_got text, p_want text) returns text[] language sql as $f$
  select case when p_got is distinct from p_want
              then array[format('%s: expected %s, got %s', p_name, p_want, coalesce(p_got, 'nothing'))]
              else '{}'::text[] end;
$f$;

do $t$
declare
  f text[] := '{}';
  tbl text;
  own_u uuid; maya_u uuid; nina_u uuid; sam_u uuid; old_u uuid;
  own_c uuid; maya_c uuid; nina_c uuid; old_c uuid;
  j jsonb;
  codes text[];
  more text[];
  auth_rows boolean := true;   -- false where the test can't write Supabase's own auth tables
  sess uuid := gen_random_uuid();
  sess2 uuid := gen_random_uuid();
  before_reset timestamptz;
  owner_name text;
  i integer;
begin
  -- ------------------------------------------------------------ 1. locked down
  foreach tbl in array array['coach_authenticators', 'coach_recovery_codes', 'coach_authenticator_resets'] loop
    f := f || pg_temp.t_eq('1a rules on ' || tbl, (select relrowsecurity::text from pg_class where oid = ('public.' || tbl)::regclass), 'true');
    f := f || pg_temp.t_eq('1b signed out reads nothing of ' || tbl, (select has_table_privilege('anon', 'public.' || tbl, 'select'))::text, 'false');
    f := f || pg_temp.t_eq('1c signed in writes nothing of ' || tbl, (select (has_table_privilege('authenticated', 'public.' || tbl, 'insert')
      or has_table_privilege('authenticated', 'public.' || tbl, 'update') or has_table_privilege('authenticated', 'public.' || tbl, 'delete')))::text, 'false');
  end loop;
  f := f || pg_temp.t_eq('1d the hash is never readable', has_column_privilege('authenticated', 'public.coach_recovery_codes', 'code_hash', 'select')::text, 'false');
  f := f || pg_temp.t_eq('1e used_at is readable', has_column_privilege('authenticated', 'public.coach_recovery_codes', 'used_at', 'select')::text, 'true');
  f := f || pg_temp.t_eq('1f the functions: signed in yes, signed out no', concat_ws('/',
    has_function_privilege('authenticated', 'public.coach_auth_state()', 'execute'),
    has_function_privilege('anon', 'public.coach_auth_state()', 'execute'),
    has_function_privilege('anon', 'public.coach_recovery_code_use(text)', 'execute'),
    has_function_privilege('anon', 'public.coach_authenticator_reset(uuid)', 'execute'),
    has_function_privilege('anon', 'public.coach_recovery_codes_make()', 'execute')), 't/f/f/f/f');
  f := f || pg_temp.t_eq('1g the helpers are nobody''s', concat_ws('/',
    has_function_privilege('authenticated', 'public._coach_auth_remove(uuid,boolean)', 'execute'),
    has_function_privilege('authenticated', 'public._coach_auth_lock(uuid)', 'execute'),
    has_function_privilege('authenticated', 'public._coach_auth_session_ok(timestamptz)', 'execute')), 'f/f/f');
  f := f || pg_temp.t_eq('1h it recorded itself', (select count(*)::text from public.migration_log where number = 53 and status = 'ran'), '1');

  begin
    -- Supabase's own tables, in their shape, on the stand-in only.
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

    perform pg_temp.t_admin();
    own_u := pg_temp.t_user('owner'); maya_u := pg_temp.t_user('maya'); nina_u := pg_temp.t_user('nina');
    sam_u := pg_temp.t_user('sam'); old_u := pg_temp.t_user('old');
    insert into public.coaches (user_id, role, display_first_name) values (own_u, 'owner', 'Tess') returning id into own_c;
    insert into public.coaches (user_id, role, display_first_name) values (maya_u, 'coach', 'Maya') returning id into maya_c;
    insert into public.coaches (user_id, role, display_first_name) values (nina_u, 'coach', 'Nina') returning id into nina_c;
    insert into public.coaches (user_id, role, display_first_name, active) values (old_u, 'coach', 'Olly', false) returning id into old_c;

    owner_name := (select display_first_name from public.coaches where role = 'owner' and active order by created_at limit 1);

    -- ------------------------------------------------------------ 2. a client and someone signed out
    perform pg_temp.t_coach_as(sam_u, 'aal2');
    f := f || pg_temp.t_eq('2a a client is told nothing', pg_temp.t_n('select public.coach_auth_state()::text'), '{"coach": false}');
    f := f || pg_temp.t_eq('2b a client makes no codes', pg_temp.t_n('select public.coach_recovery_codes_make()::text'), 'error 42501');
    f := f || pg_temp.t_eq('2c a client uses no code', pg_temp.t_n($q$select public.coach_recovery_code_use('abcd-efgh')::text$q$), 'error 42501');
    f := f || pg_temp.t_eq('2d a client resets nobody', pg_temp.t_n(format('select public.coach_authenticator_reset(%L)::text', maya_c)), 'error 42501');
    f := f || pg_temp.t_eq('2e a client reads no rows', pg_temp.t_n('select count(*) from public.coach_authenticators'), '0');
    perform pg_temp.t_anon();
    f := f || pg_temp.t_eq('2f signed out: no state', pg_temp.t_n('select public.coach_auth_state()::text'), 'error 42501');
    f := f || pg_temp.t_eq('2g signed out: no code', pg_temp.t_n($q$select public.coach_recovery_code_use('abcd-efgh')::text$q$), 'error 42501');
    f := f || pg_temp.t_eq('2h signed out: no reset', pg_temp.t_n(format('select public.coach_authenticator_reset(%L)::text', maya_c)), 'error 42501');

    -- ------------------------------------------------------------ 3. making codes
    perform pg_temp.t_coach_as(maya_u, 'aal1');
    j := public.coach_auth_state();
    f := f || pg_temp.t_eq('3a a new coach: nothing yet', concat_ws('/', j ->> 'coach', j ->> 'owner', j ->> 'codes_left', j ->> 'codes_saved', j ->> 'turned_on_at', j ->> 'session_ok', j ->> 'wait_seconds'),
      'true/false/0/false/true/0');
    f := f || pg_temp.t_eq('3b the owner''s first name, from the data', j ->> 'owner_first_name', owner_name);
    f := f || pg_temp.t_eq('3c no codes without a current code', public.coach_recovery_codes_make() ->> 'status', 'needs_code');
    perform pg_temp.t_coach_as(maya_u, 'aal2');
    j := public.coach_recovery_codes_make();
    codes := array(select jsonb_array_elements_text(j -> 'codes'));
    f := f || pg_temp.t_eq('3d ten codes', concat_ws('/', j ->> 'status', cardinality(codes)), 'made/10');
    f := f || pg_temp.t_eq('3e all different', (select count(distinct c)::text from unnest(codes) c), '10');
    f := f || pg_temp.t_eq('3f each in the code''s shape', (select count(*)::text from unnest(codes) c where c ~ '^[abcdefghjkmnpqrstuvwxyz023456789]{4}-[abcdefghjkmnpqrstuvwxyz023456789]{4}$'), '10');
    perform pg_temp.t_admin();
    f := f || pg_temp.t_eq('3g kept only as bcrypt hashes', (select concat_ws('/', count(*), count(*) filter (where code_hash like '$2a$10$%'),
      count(*) filter (where code_hash = any (codes) or code_hash = any (array(select replace(c, '-', '') from unnest(codes) c)))) from public.coach_recovery_codes where user_id = maya_u), '10/10/0');
    perform pg_temp.t_coach_as(maya_u, 'aal2');
    f := f || pg_temp.t_eq('3h the hash can''t be read', pg_temp.t_n('select count(code_hash) from public.coach_recovery_codes'), 'error 42501');
    f := f || pg_temp.t_eq('3i the coach reads their own codes'' state', pg_temp.t_n('select count(*) from public.coach_recovery_codes where used_at is null'), '10');

    -- ------------------------------------------------------------ 4. turned on, and saved
    perform pg_temp.t_coach_as(maya_u, 'aal1');
    f := f || pg_temp.t_eq('4a turning on needs the code just given', public.coach_authenticator_on(null) ->> 'status', 'needs_code');
    perform pg_temp.t_coach_as(maya_u, 'aal2');
    f := f || pg_temp.t_eq('4b turned on', public.coach_authenticator_on(gen_random_uuid()) ->> 'status', 'on');
    f := f || pg_temp.t_eq('4c not saved until ticked', public.coach_auth_state() ->> 'codes_saved', 'false');
    f := f || pg_temp.t_eq('4d ticked', public.coach_recovery_codes_saved() ->> 'status', 'saved');
    j := public.coach_auth_state();
    f := f || pg_temp.t_eq('4e on since, 10 of 10, saved', concat_ws('/', (j ->> 'turned_on_at') is not null, j ->> 'codes_left', j ->> 'codes_total', j ->> 'codes_saved'), 't/10/10/true');
    perform pg_temp.t_coach_as(nina_u, 'aal2');
    f := f || pg_temp.t_eq('4f Nina has nothing to tick', public.coach_recovery_codes_saved() ->> 'status', 'none');

    -- ------------------------------------------------------------ 5. a code is used once
    perform pg_temp.t_admin();
    begin
      execute 'insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at) values ($1, $2, $3, ''totp'', ''verified'', now(), now())'
        using gen_random_uuid(), maya_u, 'p6a-test Maya phone';
    exception when others then
      auth_rows := false;
    end;
    perform pg_temp.t_coach_as(maya_u, 'aal1');
    j := public.coach_recovery_code_use('  ' || upper(replace(codes[1], '-', ' ')) || ' ');
    f := f || pg_temp.t_eq('5a a code typed in capitals with a space gets in, 9 left', concat_ws('/', j ->> 'status', j ->> 'codes_left'), 'used/9');
    j := public.coach_recovery_code_use(codes[1]);
    f := f || pg_temp.t_eq('5b the same code again: refused, as a wrong one is', j ->> 'status', 'no_match');
    j := public.coach_recovery_code_use(replace(codes[2], '-', ''));
    f := f || pg_temp.t_eq('5c without its dash, 8 left', concat_ws('/', j ->> 'status', j ->> 'codes_left'), 'used/8');
    j := public.coach_recovery_code_use(replace(codes[3], '0', 'O'));
    f := f || pg_temp.t_eq('5d an O read as the zero it must be', concat_ws('/', j ->> 'status', j ->> 'codes_left'), 'used/7');
    perform pg_temp.t_admin();
    f := f || pg_temp.t_eq('5e each use is dated', (select count(*)::text from public.coach_recovery_codes where user_id = maya_u and used_at is not null), '3');
    perform pg_temp.t_coach_as(maya_u, 'aal1');
    -- A second tab: the coach's row is locked by the first, and "used_at is null"
    -- is checked again under the lock, so the code is never used twice.
    f := f || pg_temp.t_eq('5f a second tab''s try with a used code', public.coach_recovery_code_use(codes[2]) ->> 'status', 'no_match');
    f := f || pg_temp.t_eq('5g a code of nonsense', public.coach_recovery_code_use('<script>') ->> 'status', 'no_match');

    -- ------------------------------------------------------------ 6. 5 wrong in a row, then 30 seconds
    -- 5f and 5g were 2 wrong in a row (the right codes before them reset the count).
    f := f || pg_temp.t_eq('6a the 3rd wrong one', public.coach_recovery_code_use('zzzz-zzzz') ->> 'status', 'no_match');
    j := public.coach_recovery_code_use('zzzz-zzzx');
    f := f || pg_temp.t_eq('6a the 4th wrong one, with 1 try left before the wait', concat_ws('/', j ->> 'status', j ->> 'tries_left'), 'no_match/1');
    j := public.coach_recovery_code_use('zzzz-zzzy');
    f := f || pg_temp.t_eq('6b the 5th wrong one: wait 30 seconds', concat_ws('/', j ->> 'status', j ->> 'wait_seconds'), 'wait/30');
    j := public.coach_recovery_code_use(codes[4]);
    f := f || pg_temp.t_eq('6c even a right code waits', j ->> 'status', 'wait');
    f := f || pg_temp.t_eq('6d the state says how long', ((public.coach_auth_state() ->> 'wait_seconds')::integer between 1 and 30)::text, 'true');
    perform pg_temp.t_admin();
    f := f || pg_temp.t_eq('6e the right code wasn''t spent while waiting', (select (used_at is null)::text from public.coach_recovery_codes where user_id = maya_u and position = 4), 'true');
    update public.coach_authenticators set wait_until = now() - interval '1 second' where user_id = maya_u;
    perform pg_temp.t_coach_as(maya_u, 'aal1');
    j := public.coach_recovery_code_use(codes[4]);
    f := f || pg_temp.t_eq('6f after the wait it gets in', concat_ws('/', j ->> 'status', j ->> 'codes_left'), 'used/6');

    -- ------------------------------------------------------------ 7. the lost phone's factor goes
    perform pg_temp.t_admin();
    if auth_rows then
      f := f || pg_temp.t_eq('7a the lost phone''s factor was removed', (select count(*)::text from auth.mfa_factors where user_id = maya_u), '0');
    else
      raise notice '053: this database doesn''t let the test write auth.mfa_factors, so 7a, 9h and 9i are left to the server''s admin calls';
    end if;
    perform pg_temp.t_coach_as(maya_u, 'aal1');
    j := public.coach_auth_state();
    f := f || pg_temp.t_eq('7b off until set up again, with when the code was used', concat_ws('/', j ->> 'turned_on_at', (j ->> 'recovered_at') is not null), 't');

    -- ------------------------------------------------------------ 8. new codes stop the old ones
    perform pg_temp.t_coach_as(maya_u, 'aal2');
    j := public.coach_recovery_codes_make();
    more := array(select jsonb_array_elements_text(j -> 'codes'));
    f := f || pg_temp.t_eq('8a a new set needs ticking again', public.coach_auth_state() ->> 'codes_saved', 'false');
    f := f || pg_temp.t_eq('8b an old code stops working', public.coach_recovery_code_use(codes[5]) ->> 'status', 'no_match');
    f := f || pg_temp.t_eq('8c 10 of 10 again', concat_ws('/', public.coach_auth_state() ->> 'codes_left', public.coach_auth_state() ->> 'codes_total'), '10/10');
    perform public.coach_recovery_codes_saved();

    -- ------------------------------------------------------------ 9. the reset
    perform pg_temp.t_coach_as(nina_u, 'aal2');
    perform public.coach_recovery_codes_make();
    perform pg_temp.t_admin();
    if auth_rows then
      execute 'insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at) values ($1, $2, $3, ''totp'', ''verified'', now(), now())'
        using gen_random_uuid(), maya_u, 'p6a-test Maya new phone';
      execute 'insert into auth.sessions (id, user_id, created_at, updated_at) values ($1, $2, now(), now()), ($3, $2, now(), now())' using sess, maya_u, sess2;
      execute 'insert into auth.refresh_tokens (token, user_id, session_id, revoked, created_at, updated_at) values ($1, $2, $3, false, now(), now())'
        using 'p6a-test-' || gen_random_uuid(), maya_u::text, sess;
    end if;

    perform pg_temp.t_coach_as(maya_u, 'aal2');
    f := f || pg_temp.t_eq('9a an associate can''t reset another', pg_temp.t_n(format('select public.coach_authenticator_reset(%L)::text', nina_c)), 'error 42501');
    f := f || pg_temp.t_eq('9b an associate can''t reset themself', pg_temp.t_n(format('select public.coach_authenticator_reset(%L)::text', maya_c)), 'error 42501');
    f := f || pg_temp.t_eq('9c an associate can''t reset the owner', pg_temp.t_n(format('select public.coach_authenticator_reset(%L)::text', own_c)), 'error 42501');
    perform pg_temp.t_coach_as(own_u, 'aal1');
    f := f || pg_temp.t_eq('9d the owner gives a current code first', public.coach_authenticator_reset(maya_c) ->> 'status', 'needs_code');
    perform pg_temp.t_coach_as(own_u, 'aal2');
    f := f || pg_temp.t_eq('9e the owner can''t reset their own', public.coach_authenticator_reset(own_c) ->> 'status', 'self');
    f := f || pg_temp.t_eq('9f nor someone who isn''t a coach', concat_ws('/', public.coach_authenticator_reset(gen_random_uuid()) ->> 'status', public.coach_authenticator_reset(old_c) ->> 'status'), 'not_found/not_found');
    before_reset := now() - interval '1 minute';
    j := public.coach_authenticator_reset(maya_c);
    f := f || pg_temp.t_eq('9g reset: the codes go', concat_ws('/', j ->> 'status', j ->> 'codes_removed'), 'reset/10');
    if auth_rows then
      f := f || pg_temp.t_eq('9h reset: the factors and every session go', concat_ws('/', j ->> 'factors_removed', j ->> 'sessions_removed'), '1/2');
      perform pg_temp.t_admin();
      f := f || pg_temp.t_eq('9i nothing of Maya''s sign-ins is left', (select concat_ws('/', (select count(*) from auth.mfa_factors where user_id = maya_u),
        (select count(*) from auth.sessions where user_id = maya_u), (select count(*) from auth.refresh_tokens where user_id = maya_u::text))), '0/0/0');
    end if;
    perform pg_temp.t_admin();
    f := f || pg_temp.t_eq('9j recorded: who reset whom, and when', (select concat_ws('/', count(*), bool_and(reset_by = own_u), bool_and(reset_at > now() - interval '1 minute'))
      from public.coach_authenticator_resets where coach_user_id = maya_u), '1/t/t');
    f := f || pg_temp.t_eq('9k Nina''s codes are untouched', (select count(*)::text from public.coach_recovery_codes where user_id = nina_u), '10');
    -- A sign-in from before the reset is told to sign in again; a new one is fine.
    perform pg_temp.t_coach_as(maya_u, 'aal1', before_reset);
    j := public.coach_auth_state();
    f := f || pg_temp.t_eq('9l a session from before the reset', concat_ws('/', j ->> 'session_ok', j ->> 'codes_left', j ->> 'turned_on_at', (j ->> 'last_reset_at') is not null), 'false/0/t');
    if auth_rows then
      perform pg_temp.t_coach_as(maya_u, 'aal1', now() + interval '1 minute', sess);
      f := f || pg_temp.t_eq('9m a session the reset removed, whatever its time', public.coach_auth_state() ->> 'session_ok', 'false');
    end if;
    perform pg_temp.t_coach_as(maya_u, 'aal1', now() + interval '1 minute');
    f := f || pg_temp.t_eq('9n signing in again after the reset is fine', public.coach_auth_state() ->> 'session_ok', 'true');
    f := f || pg_temp.t_eq('9o an old code after the reset', public.coach_recovery_code_use(more[1]) ->> 'status', 'no_match');

    -- ------------------------------------------------------------ 10. each reads only their own
    perform pg_temp.t_coach_as(maya_u, 'aal1', now() + interval '1 minute');
    f := f || pg_temp.t_eq('10a Maya reads her own row only', pg_temp.t_n(format('select concat_ws(''/'', count(*), count(*) filter (where user_id = %L)) from public.coach_authenticators', maya_u)), '1/1');
    f := f || pg_temp.t_eq('10b Maya reads her own reset', pg_temp.t_n('select count(*) from public.coach_authenticator_resets'), '1');
    f := f || pg_temp.t_eq('10c Maya reads none of Nina''s codes', pg_temp.t_n(format('select count(*) from public.coach_recovery_codes where user_id = %L', nina_u)), '0');
    f := f || pg_temp.t_eq('10d Maya changes nothing directly', pg_temp.t_rows(format('update public.coach_authenticators set last_reset_at = null where user_id = %L', maya_u)), 'error 42501');
    perform pg_temp.t_coach_as(nina_u, 'aal2');
    f := f || pg_temp.t_eq('10e Nina reads no reset', pg_temp.t_n('select count(*) from public.coach_authenticator_resets'), '0');
    f := f || pg_temp.t_eq('10f Nina can''t write a reset', pg_temp.t_rows(format('insert into public.coach_authenticator_resets (coach_user_id, reset_by) values (%L, %L)', own_u, nina_u)), 'error 42501');
    perform pg_temp.t_coach_as(own_u, 'aal2');
    f := f || pg_temp.t_eq('10g the owner reads every reset', pg_temp.t_n(format('select count(*) from public.coach_authenticator_resets where coach_user_id = %L', maya_u)), '1');
    f := f || pg_temp.t_eq('10h the owner reads no one else''s codes', pg_temp.t_n(format('select count(*) from public.coach_recovery_codes where user_id = %L', nina_u)), '0');
    perform pg_temp.t_coach_as(sam_u, 'aal2');
    f := f || pg_temp.t_eq('10i a client reads no reset', pg_temp.t_n('select count(*) from public.coach_authenticator_resets'), '0');

    -- ------------------------------------------------------------ 11. switched off
    perform pg_temp.t_coach_as(old_u, 'aal2');
    f := f || pg_temp.t_eq('11a a coach switched off is told nothing', pg_temp.t_n('select public.coach_auth_state()::text'), '{"coach": false}');
    f := f || pg_temp.t_eq('11b and makes no codes', pg_temp.t_n('select public.coach_recovery_codes_make()::text'), 'error 42501');

    perform pg_temp.t_admin();
    raise exception 'undo the test rows' using errcode = 'P0053';
  exception when sqlstate 'P0053' then
    perform pg_temp.t_admin();
  end;

  f := f || pg_temp.t_eq('12 everything the test made is undone', (select concat_ws('/', (select count(*) from auth.users where email like 'p6a-test-%@example.invalid'),
    (select count(*) from public.coach_authenticator_resets r where not exists (select 1 from auth.users u where u.id = r.coach_user_id)))), '0/0');

  if cardinality(f) > 0 then
    raise exception E'053 FAILED (%):\n%', cardinality(f), array_to_string(f, E'\n');
  end if;
  raise notice '053 CHECKS PASSED';
end
$t$;
