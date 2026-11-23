-- =============================================================================
-- 057_coach_sessions_start_breakit_test.sql
-- Tries to get another coach's sessions or counts out of
-- coach_sessions_start() (supabase/migrations/057_coach_sessions_start.sql).
-- RUN ORDER: 050 to 056, then 057 (twice is fine), then this. Dry run only,
-- on a local stand-in or the test project.
--
-- WHAT IT DOES
--     1. someone signed out (anon): not allowed to call it;
--     2. a client, at aal1 and at aal2: stopped (42501);
--     3. a coach before her code (aal1): stopped, not even her own;
--     4. a coach whose code was given before her authenticator was reset: stopped;
--     5. a coach no longer active, with the code: stopped;
--     6. an associate with the code, naming another coach's client, a client
--        she covers and another coach's sessions' people: only her own
--        sessions, people and counts, whatever she names;
--     7. the owner with the code: only her own, never an associate's;
--     8. odd arguments (no date, a list of a thousand ids, a date far away)
--        give her own and nothing else;
--     9. 057 run twice: one function, SECURITY INVOKER, not open to PUBLIC or
--        anon.
--   Everything it makes is undone at the end.
--
--   It ends with the notice 057 BREAK-IT CHECKS PASSED, or stops with FAILED
--   and a list naming each check that failed.
-- =============================================================================
create or replace function pg_temp.k_as(p uuid, p_aal text, p_at timestamptz default now()) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated', 'aal', p_aal,
    'amr', json_build_array(json_build_object('method', 'password', 'timestamp', floor(extract(epoch from p_at))::bigint)),
    'iat', floor(extract(epoch from p_at))::bigint, 'session_id', gen_random_uuid())::text, true);
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
  values (u, 'p057-breakit-' || p_label || '-' || u || '@example.invalid', 'authenticated', 'authenticated', now());
  return u;
end $f$;
create or replace function pg_temp.k_eq(p_name text, p_got text, p_want text) returns text[] language sql as $f$
  select case when p_got is distinct from p_want
              then array[format('%s: expected %s, got %s', p_name, p_want, coalesce(p_got, 'nothing'))]
              else '{}'::text[] end;
$f$;
-- What one call gives, as the person signed in: 'error <code>', or "sessions/people/counted engagements/nudges"
-- with each of those that isn't p_coach's counted after a colon ("3/2/1/1 others 0/0/0").
create or replace function pg_temp.k_call(p_coach uuid, p_since timestamptz, p_profiles uuid[]) returns text language plpgsql as $f$
declare r jsonb; v_role text := current_setting('role'); v_out text;
begin
  begin
    r := public.coach_sessions_start(p_since, p_profiles);
  exception when others then
    return 'error ' || sqlstate;
  end;
  perform set_config('role', 'none', true);
  v_out := format('%s/%s/%s/%s others %s/%s/%s',
    jsonb_array_length(r->'sessions'), jsonb_array_length(r->'people'), (select count(*) from jsonb_object_keys(r->'held')), r->>'nudges',
    (select count(*) from jsonb_array_elements(r->'sessions') x where (x->>'coach_id')::uuid is distinct from p_coach),
    (select count(*) from jsonb_array_elements(r->'people') x join public.coach_sessions s on s.id = (x->>'session_id')::uuid where s.coach_id is distinct from p_coach),
    (select count(*) from jsonb_object_keys(r->'held') k join public.engagements e on e.id = k::uuid where e.coach_id is distinct from p_coach)
      + (select count(*) from jsonb_object_keys(r->'held') k where not exists (select 1 from public.engagements e where e.id = k::uuid)));
  perform set_config('role', v_role, true);
  return v_out;
end $f$;

do $t$
declare
  f text[] := '{}';
  tess_u uuid; maya_u uuid; nina_u uuid; sam_u uuid; gone_u uuid;
  tess_c uuid; maya_c uuid; nina_c uuid; gone_c uuid;
  p_sam uuid := gen_random_uuid();    -- Maya's client, with an account
  p_nina uuid := gen_random_uuid();   -- Nina's client, covered by Maya (agreed)
  p_tess uuid := gen_random_uuid();   -- Tess's own client
  p_gone uuid := gen_random_uuid();   -- the client of a coach no longer active
  e_m uuid := gen_random_uuid(); e_n uuid := gen_random_uuid(); e_t uuid := gen_random_uuid(); e_g uuid := gen_random_uuid();
  today date := (now() at time zone 'Europe/London')::date;
  win timestamptz := now() - interval '42 days';
  every uuid[];
  thousand uuid[];
  role_after text;
begin
  -- ------------------------------------------------------------ 9. run twice
  f := f || pg_temp.k_eq('9a one function after 057 ran twice, taking a date and a list',
    (select string_agg(pg_get_function_identity_arguments(p.oid), ';') from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'coach_sessions_start'),
    'p_since timestamp with time zone, p_profiles uuid[]');
  f := f || pg_temp.k_eq('9b it reads under the caller''s own rules (SECURITY INVOKER)',
    (select string_agg(p.prosecdef::text, ',') from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'coach_sessions_start'), 'false');
  f := f || pg_temp.k_eq('9c not open to PUBLIC or anon',
    (select count(*)::text from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
      where p.pronamespace = 'public'::regnamespace and p.proname = 'coach_sessions_start' and a.privilege_type = 'EXECUTE'
        and (a.grantee = 0 or a.grantee = 'anon'::regrole)), '0');

  begin
    perform pg_temp.k_admin();
    tess_u := pg_temp.k_user('tess'); maya_u := pg_temp.k_user('maya'); nina_u := pg_temp.k_user('nina');
    sam_u := pg_temp.k_user('sam'); gone_u := pg_temp.k_user('gone');
    insert into public.coaches (user_id, role, display_first_name) values (tess_u, 'owner', 'Tess') returning id into tess_c;
    insert into public.coaches (user_id, role, display_first_name) values (maya_u, 'coach', 'Maya') returning id into maya_c;
    insert into public.coaches (user_id, role, display_first_name) values (nina_u, 'coach', 'Nina') returning id into nina_c;
    insert into public.coaches (user_id, role, display_first_name) values (gone_u, 'coach', 'Rhys') returning id into gone_c;
    perform set_config('clarity.linking', 'on', true);
    insert into public.client_profiles (id, coach_id, name, email, user_id) values (p_sam, maya_c, 'Sam Okafor', 'sam.057b@example.invalid', sam_u);
    perform set_config('clarity.linking', '', true);
    insert into public.client_profiles (id, coach_id, name, email) values
      (p_nina, nina_c, 'Ella Fraser', 'ella.057b@example.invalid'),
      (p_tess, tess_c, 'Leo Grant', 'leo.057b@example.invalid'),
      (p_gone, gone_c, 'Ivy Moss', 'ivy.057b@example.invalid');
    insert into public.coach_cover (coach_id, cover_coach_id, profile_id, starts_on, ends_on, client_agreed_at) values
      (nina_c, maya_c, p_nina, today - 1, today + 7, now());
    insert into public.engagements (id, coach_id, profile_id, kind, sessions_total) values
      (e_m, maya_c, p_sam, 'sessions', 6), (e_n, nina_c, p_nina, 'sessions', 6), (e_t, tess_c, p_tess, 'sessions', 6), (e_g, gone_c, p_gone, 'sessions', 6);
    -- Each coach: one session in the window and two long before it, all held, recaps not sent.
    insert into public.coach_sessions (coach_id, profile_id, engagement_id, starts_at, outcome)
    select c, p, e, now() - d * interval '1 day', 'held'
    from (values (maya_c, p_sam, e_m), (nina_c, p_nina, e_n), (tess_c, p_tess, e_t), (gone_c, p_gone, e_g)) v(c, p, e), (values (5), (100), (200)) w(d);
    insert into public.coach_session_people (session_id, profile_id, engagement_id) select s.id, s.profile_id, s.engagement_id from public.coach_sessions s
      where s.engagement_id in (e_m, e_n, e_t, e_g);
    update public.coaches set active = false where id = gone_c;
    every := array[p_sam, p_nina, p_tess, p_gone];
    select array_agg(gen_random_uuid()) || every into thousand from generate_series(1, 1000);

    -- ------------------------------------------------------------ 1. signed out
    perform pg_temp.k_anon();
    f := f || pg_temp.k_eq('1 signed out: not allowed', pg_temp.k_call(null, win, every), 'error 42501');

    -- ------------------------------------------------------------ 2. a client
    perform pg_temp.k_as(sam_u, 'aal1');
    f := f || pg_temp.k_eq('2a Sam (a client): stopped', pg_temp.k_call(null, win, every), 'error 42501');
    perform pg_temp.k_as(sam_u, 'aal2');
    f := f || pg_temp.k_eq('2b Sam at aal2: stopped', pg_temp.k_call(null, win, every), 'error 42501');

    -- ------------------------------------------------------------ 3. a coach before her code
    perform pg_temp.k_as(maya_u, 'aal1');
    f := f || pg_temp.k_eq('3a Maya at aal1: stopped, not even her own', pg_temp.k_call(maya_c, win, every), 'error 42501');
    perform pg_temp.k_as(tess_u, 'aal1');
    f := f || pg_temp.k_eq('3b the owner at aal1: stopped', pg_temp.k_call(tess_c, win, every), 'error 42501');

    -- ------------------------------------------------------------ 4. a code given before a reset
    perform pg_temp.k_admin();
    insert into public.coach_authenticators (user_id, turned_on_at, last_reset_at) values (maya_u, now() - interval '1 day', now() - interval '1 minute')
      on conflict (user_id) do update set last_reset_at = excluded.last_reset_at;
    perform pg_temp.k_as(maya_u, 'aal2', now() - interval '1 hour');
    f := f || pg_temp.k_eq('4a Maya''s older sign-in, though aal2: stopped', pg_temp.k_call(maya_c, win, every), 'error 42501');

    -- ------------------------------------------------------------ 5. a coach no longer active
    perform pg_temp.k_as(gone_u, 'aal2');
    f := f || pg_temp.k_eq('5 Rhys, no longer active, with the code: stopped', pg_temp.k_call(gone_c, win, every), 'error 42501');

    -- ------------------------------------------------------------ 6. an associate with the code
    perform pg_temp.k_as(maya_u, 'aal2', now());
    -- In the window 1 session; before it, the oldest unsent and the latest held (2); everyone's client named: still only hers (all 3).
    f := f || pg_temp.k_eq('6a Maya, the window only: her own 3 sessions and people, no counts left over, nothing of anyone else''s',
      pg_temp.k_call(maya_c, win, '{}'), '3/3/0/0 others 0/0/0');
    f := f || pg_temp.k_eq('6b Maya naming every client (another coach''s, the one she covers, a gone coach''s): only her own',
      pg_temp.k_call(maya_c, win, every), '3/3/0/0 others 0/0/0');
    f := f || pg_temp.k_eq('6c Maya with nothing older sent: her own 3 and none older',
      pg_temp.k_call(maya_c, '-infinity', array[p_nina, p_tess]), '3/3/0/0 others 0/0/0');

    -- ------------------------------------------------------------ 7. the owner
    perform pg_temp.k_as(tess_u, 'aal2');
    f := f || pg_temp.k_eq('7 the owner naming every client: only her own, never an associate''s', pg_temp.k_call(tess_c, win, every), '3/3/0/0 others 0/0/0');

    -- ------------------------------------------------------------ 8. odd arguments
    perform pg_temp.k_as(maya_u, 'aal2');
    f := f || pg_temp.k_eq('8a no date at all: everything of hers, nothing else', pg_temp.k_call(maya_c, null, null), '3/3/0/0 others 0/0/0');
    f := f || pg_temp.k_eq('8b a list of a thousand ids', pg_temp.k_call(maya_c, win, thousand), '3/3/0/0 others 0/0/0');
    -- A date far ahead: everything is "older"; the oldest unsent and the latest held are sent, the middle one counted.
    f := f || pg_temp.k_eq('8c a date far ahead', pg_temp.k_call(maya_c, now() + interval '50 years', '{}'), '2/2/1/1 others 0/0/0');
    perform pg_temp.k_as(maya_u, 'aal2');
    perform public.coach_sessions_start(win, every);
    role_after := current_setting('role');
    f := f || pg_temp.k_eq('8d it leaves the caller as they were', role_after, 'authenticated');

    perform pg_temp.k_admin();
    raise exception 'undo the test rows' using errcode = 'P0057';
  exception when sqlstate 'P0057' then
    perform pg_temp.k_admin();
  end;

  f := f || pg_temp.k_eq('10 everything the test made is undone',
    (select count(*)::text from auth.users where email like 'p057-breakit-%@example.invalid'), '0');

  if cardinality(f) > 0 then
    raise exception E'057 BREAK-IT FAILED (%):\n%', cardinality(f), array_to_string(f, E'\n');
  end if;
  raise notice '057 BREAK-IT CHECKS PASSED';
end
$t$;
