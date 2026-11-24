-- =============================================================================
-- 060_coach_first_screen_breakit_test.sql
-- The break-it tester's checks of supabase/migrations/060_coach_first_screen.sql
-- (coach first screen run; 24 Nov 2026). RUN ORDER: 049 to 059, then 060
-- (twice is fine), then 060's main test, then this. Dry run only, on a local
-- stand-in or the test project.
--
-- WHAT IT TRIES
--   1. Someone signed out (anon): not allowed to call it at all.
--   2. Someone who isn't a coach (a client's own account), at aal1 and aal2:
--      stopped (42501).
--   3. A coach (and the owner) before their 6-digit code (aal1): stopped.
--   4. A coach whose code was given before her authenticator was reset: stopped.
--   5. A coach no longer active, with the code: stopped.
--   6. Odd asks, each refused with 22023 rather than read: a page that isn't
--      one of the four, no window, a window that ends before it starts, a
--      window of more than 400 days, more than 50 clients named.
--   7. An associate naming the owner's client, and a client of a coach she
--      doesn't cover: nothing of theirs comes back (not their profile, notes,
--      engagements, to-dos or sessions), and each list is still exactly what
--      her own plain reads give.
--   8. The owner naming an associate's client: each list is exactly what the
--      owner's own plain reads give (060 never widens them).
--   9. The function itself: one, SECURITY INVOKER, STABLE, search_path empty,
--      no PUBLIC or anon execute; and after 060 has run twice, still one.
--
--   It ends with the notice 060 BREAK-IT CHECKS PASSED, or stops with FAILED
--   and a list naming each check that failed. Everything it makes is undone.
-- =============================================================================
create or replace function pg_temp.k_as(p uuid, p_aal text, p_at timestamptz default now()) returns void language plpgsql as $f$
declare sid uuid := gen_random_uuid();
begin
  -- A made-up sign-in is written to auth.sessions where that table exists, as a real one is: once a coach has a reset
  -- or a recovery code on record, 055 refuses a session id that isn't there (the hosted test project has the table).
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
  if to_regclass('auth.sessions') is not null and p is not null then
    begin
      execute 'insert into auth.sessions (id, user_id, created_at, updated_at) values ($1, $2, $3, $3)' using sid, p, p_at;
    exception when others then
      raise notice '060 break-it: this database doesn''t let the test write auth.sessions (%)', sqlerrm;
    end;
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated', 'aal', p_aal,
    'amr', json_build_array(json_build_object('method', 'password', 'timestamp', floor(extract(epoch from p_at))::bigint)),
    'iat', floor(extract(epoch from p_at))::bigint, 'session_id', sid)::text, true);
  perform set_config('role', 'authenticated', true);
end $f$;
create or replace function pg_temp.k_anon() returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('role', 'anon', true);
end $f$;
create or replace function pg_temp.k_admin() returns void language plpgsql as $f$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
end $f$;
create or replace function pg_temp.k_user(p_label text) returns uuid language plpgsql as $f$
declare u uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, aud, role, email_confirmed_at)
  values (u, 'p060-breakit-' || p_label || '-' || u || '@example.invalid', 'authenticated', 'authenticated', now());
  return u;
end $f$;
create or replace function pg_temp.k_eq(p_name text, p_got text, p_want text) returns text[] language sql as $f$
  select case when p_got is distinct from p_want
              then array[format('%s: expected %s, got %s', p_name, p_want, coalesce(p_got, 'nothing'))]
              else '{}'::text[] end;
$f$;
-- One call as whoever is signed in: 'error <code>', or 'ok'.
create or replace function pg_temp.k_call(p_page text, p_from timestamptz, p_to timestamptz, p_profiles uuid[] default '{}') returns text language plpgsql as $f$
declare r jsonb;
begin
  r := public.coach_first_screen(p_page, p_from, p_to, current_date, now() - interval '42 days', p_profiles);
  return case when r is null then 'nothing' else 'ok' end;
exception when others then
  return 'error ' || sqlstate;
end $f$;
-- The whole answer as text, as whoever is signed in (an error as 'error <code>').
create or replace function pg_temp.k_answer(p_page text, p_profiles uuid[] default '{}') returns text language plpgsql as $f$
begin
  return public.coach_first_screen(p_page, now() - interval '1 day', now() + interval '8 days', current_date, now() - interval '42 days', p_profiles)::text;
exception when others then
  return 'error ' || sqlstate;
end $f$;

do $t$
declare
  f text[] := '{}';
  tess_u uuid; maya_u uuid; nina_u uuid; sam_u uuid; gone_u uuid;
  tess_c uuid; maya_c uuid; nina_c uuid; gone_c uuid;
  p_maya uuid := gen_random_uuid(); p_tess uuid := gen_random_uuid(); p_nina uuid := gen_random_uuid();
  e_t uuid := gen_random_uuid(); e_n uuid := gen_random_uuid();
  w_from timestamptz := now() - interval '1 day';
  w_to timestamptz := now() + interval '8 days';
  fifty_one uuid[];
  a text;
begin
  -- ------------------------------------------------------------ 9. the function itself
  f := f || pg_temp.k_eq('9a one function, after 060 ran (twice is fine)',
    (select count(*)::text from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'coach_first_screen'), '1');
  f := f || pg_temp.k_eq('9b it reads under the caller''s own rules (SECURITY INVOKER), STABLE, with an empty search_path',
    (select string_agg(p.prosecdef::text || '/' || p.provolatile::text || '/' || coalesce(array_to_string(p.proconfig, ','), ''), ';') from pg_proc p
      where p.pronamespace = 'public'::regnamespace and p.proname = 'coach_first_screen'), 'false/s/search_path=""');
  f := f || pg_temp.k_eq('9c not open to PUBLIC or anon',
    (select count(*)::text from pg_proc p, aclexplode(p.proacl) a where p.pronamespace = 'public'::regnamespace and p.proname = 'coach_first_screen'
       and a.privilege_type = 'EXECUTE' and (a.grantee = 0 or a.grantee = 'anon'::regrole)), '0');

  begin
    perform pg_temp.k_admin();
    tess_u := pg_temp.k_user('tess'); maya_u := pg_temp.k_user('maya'); nina_u := pg_temp.k_user('nina');
    sam_u := pg_temp.k_user('sam'); gone_u := pg_temp.k_user('rhys');
    insert into public.coaches (user_id, role, display_first_name) values (tess_u, 'owner', 'Tess') returning id into tess_c;
    insert into public.coaches (user_id, role, display_first_name) values (maya_u, 'coach', 'Maya') returning id into maya_c;
    insert into public.coaches (user_id, role, display_first_name) values (nina_u, 'coach', 'Nina') returning id into nina_c;
    insert into public.coaches (user_id, role, display_first_name) values (gone_u, 'coach', 'Rhys') returning id into gone_c;
    update public.coaches set active = false where id = gone_c;
    insert into public.client_profiles (id, coach_id, name, email, user_id) values
      (p_maya, maya_c, 'Sam K060', 'sam.k060@example.invalid', null), (p_tess, tess_c, 'Tia K060 Tess', 'tia.k060@example.invalid', null),
      (p_nina, nina_c, 'Noor K060 Nina', 'noor.k060@example.invalid', null);
    insert into public.engagements (id, coach_id, profile_id, kind, sessions_total, sessions_held_base, status) values
      (e_t, tess_c, p_tess, 'sessions', 8, 0, 'active'), (e_n, nina_c, p_nina, 'sessions', 8, 0, 'active');
    insert into public.client_notes (profile_id, coach_id, body) values (p_tess, tess_c, 'K060 Tess secret note'), (p_nina, nina_c, 'K060 Nina secret note');
    insert into public.coach_todos (coach_id, title, profile_id) values (tess_c, 'K060 Tess to-do', p_tess), (nina_c, 'K060 Nina to-do', p_nina);
    insert into public.coach_sessions (coach_id, profile_id, engagement_id, starts_at, minutes, kind) values
      (tess_c, p_tess, e_t, now() + interval '1 day', 60, 'coaching'), (nina_c, p_nina, e_n, now() + interval '1 day', 60, 'coaching');
    select array_agg(gen_random_uuid()) into fifty_one from generate_series(1, 51);

    -- ------------------------------------------------------------ 1. signed out
    perform pg_temp.k_anon();
    f := f || pg_temp.k_eq('1 signed out: not allowed', pg_temp.k_call('today', w_from, w_to), 'error 42501');
    -- ------------------------------------------------------------ 2. a client
    perform pg_temp.k_as(sam_u, 'aal1');
    f := f || pg_temp.k_eq('2a Sam (a client): stopped', pg_temp.k_call('today', w_from, w_to), 'error 42501');
    perform pg_temp.k_as(sam_u, 'aal2');
    f := f || pg_temp.k_eq('2b Sam at aal2: stopped', pg_temp.k_call('client', w_from, w_to, array[p_maya]), 'error 42501');
    -- ------------------------------------------------------------ 3. before the code
    perform pg_temp.k_as(maya_u, 'aal1');
    f := f || pg_temp.k_eq('3a Maya at aal1: stopped, not even her own', pg_temp.k_call('today', w_from, w_to), 'error 42501');
    perform pg_temp.k_as(tess_u, 'aal1');
    f := f || pg_temp.k_eq('3b the owner at aal1: stopped', pg_temp.k_call('calendar', w_from, w_to), 'error 42501');
    -- ------------------------------------------------------------ 5. no longer active
    perform pg_temp.k_as(gone_u, 'aal2');
    f := f || pg_temp.k_eq('5 Rhys, no longer active, with the code: stopped', pg_temp.k_call('today', w_from, w_to), 'error 42501');

    -- ------------------------------------------------------------ 6. odd asks
    perform pg_temp.k_as(maya_u, 'aal2');
    f := f || pg_temp.k_eq('6a a page that isn''t one of the four', pg_temp.k_call('leads', w_from, w_to), 'error 22023');
    f := f || pg_temp.k_eq('6b no page', pg_temp.k_call(null, w_from, w_to), 'error 22023');
    f := f || pg_temp.k_eq('6c no window', pg_temp.k_call('calendar', null, null), 'error 22023');
    f := f || pg_temp.k_eq('6d a window that ends before it starts', pg_temp.k_call('calendar', w_to, w_from), 'error 22023');
    f := f || pg_temp.k_eq('6e more than 400 days', pg_temp.k_call('calendar', now() - interval '1 year', now() + interval '1 year'), 'error 22023');
    f := f || pg_temp.k_eq('6f more than 50 clients named', pg_temp.k_call('client', w_from, w_to, fifty_one), 'error 22023');
    f := f || pg_temp.k_eq('6g 50 clients named is fine', pg_temp.k_call('client', w_from, w_to, fifty_one[1:50]), 'ok');
    f := f || pg_temp.k_eq('6h a page name made to look like SQL', pg_temp.k_call('today''; drop table public.coaches; --', w_from, w_to), 'error 22023');

    -- ------------------------------------------------------------ 7. an associate naming others' clients
    perform pg_temp.k_as(maya_u, 'aal2');
    a := pg_temp.k_answer('client', array[p_tess, p_nina]);
    perform pg_temp.k_admin();
    f := f || pg_temp.k_eq('7a Maya naming Tess''s and Nina''s clients: an answer', left(a, 6), '{"page');
    f := f || pg_temp.k_eq('7b none of their names, notes, to-dos or engagements in it',
      (select string_agg(w, ',') from unnest(array['Tia K060 Tess', 'Noor K060 Nina', 'K060 Tess secret note', 'K060 Nina secret note', 'K060 Tess to-do', 'K060 Nina to-do', e_t::text, e_n::text]) w
       where position(w in a) > 0), null);
    f := f || pg_temp.k_eq('7c nor any of their sessions',
      (select count(*)::text from jsonb_array_elements((a::jsonb)->'start'->'sessions') x where (x->>'coach_id')::uuid <> maya_c), '0');
    f := f || pg_temp.k_eq('7d and no associates'' sessions off the calendar', (a::jsonb)->>'associates', null);

    -- ------------------------------------------------------------ 8. the owner naming an associate's client: her own reads, no wider
    perform pg_temp.k_as(tess_u, 'aal2');
    a := pg_temp.k_answer('client', array[p_maya]);
    f := f || pg_temp.k_eq('8a the owner''s answer holds only client profiles her own read gives',
      (select count(*)::text from jsonb_array_elements((a::jsonb)->'tables'->'client_profiles') x
        where not exists (select 1 from public.client_profiles p where p.id = (x->>'id')::uuid)), '0');
    f := f || pg_temp.k_eq('8b and only notes her own read gives',
      (select count(*)::text from jsonb_array_elements((a::jsonb)->'tables'->'client_notes') x
        where not exists (select 1 from public.client_notes n where n.id = (x->>'id')::uuid)), '0');
    f := f || pg_temp.k_eq('8c and only engagements her own read gives',
      (select count(*)::text from jsonb_array_elements((a::jsonb)->'tables'->'engagements') x
        where not exists (select 1 from public.engagements e where e.id = (x->>'id')::uuid)), '0');
    perform pg_temp.k_admin();

    -- ------------------------------------------------------------ 4. a code given before a reset (last: it changes Maya's sign-in)
    insert into public.coach_authenticators (user_id, turned_on_at, last_reset_at) values (maya_u, now() - interval '1 day', now() - interval '1 minute')
      on conflict (user_id) do update set last_reset_at = excluded.last_reset_at;
    perform pg_temp.k_as(maya_u, 'aal2', now() - interval '1 hour');
    f := f || pg_temp.k_eq('4 Maya''s older sign-in, though aal2: stopped', pg_temp.k_call('today', w_from, w_to), 'error 42501');

    perform pg_temp.k_admin();
    raise exception 'undo the test rows' using errcode = 'P0060';
  exception when sqlstate 'P0060' then
    perform pg_temp.k_admin();
  end;

  f := f || pg_temp.k_eq('10 everything the test made is undone',
    (select count(*)::text from auth.users where email like 'p060-breakit-%@example.invalid'), '0');
  if cardinality(f) > 0 then
    raise exception E'060 BREAK-IT FAILED (%):\n%', cardinality(f), array_to_string(f, E'\n');
  end if;
  raise notice '060 BREAK-IT CHECKS PASSED';
end
$t$;
