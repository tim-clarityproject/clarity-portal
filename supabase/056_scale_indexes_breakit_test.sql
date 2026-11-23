-- =============================================================================
-- 056_scale_indexes_breakit_test.sql
-- The break-it tester's checks of supabase/migrations/056_scale_indexes.sql
-- (scale check, step 4; 23 Nov 2026). RUN ORDER: 054, 055, 056 (twice is
-- fine), then this. Dry run only, on a local stand-in or the test project.
--
-- WHAT IT DOES
--   Tries to read another coach's session people, session actions, session
--   notes, client notes, About them and client profiles by every way in that
--   056 touches, and checks that nothing comes back:
--     1. someone signed out (anon): no table, and no helper;
--     2. an associate with the code: never another coach's rows, through a
--        join (what an embed reads), through a covered client, or by calling
--        a helper directly (they take nothing, and answer only her own);
--     3. a coach whose code was given before her authenticator was reset (a
--        recovery code used in another tab): nothing, as at aal1;
--     4. a coach who is no longer active, with the code: nothing;
--     5. the owner before her code (aal1): not even her own;
--     6. a client, with or without aal2: none of the coach's rows about them;
--     7. writes that move a row onto another coach's session or client are
--        refused; a row changed in a way the read side would then hide is
--        refused too;
--     8. 056 run twice leaves one rule of each name, and no helper open to
--        everyone (PUBLIC).
--   Everything it makes is undone at the end.
--
--   It ends with the notice 056 BREAK-IT CHECKS PASSED, or stops with FAILED
--   and a list naming each check that failed.
-- =============================================================================
create or replace function pg_temp.b_as(p uuid, p_aal text, p_at timestamptz default now()) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated', 'aal', p_aal,
    'amr', json_build_array(json_build_object('method', 'password', 'timestamp', floor(extract(epoch from p_at))::bigint)),
    'iat', floor(extract(epoch from p_at))::bigint, 'session_id', gen_random_uuid())::text, true);
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
  values (u, 'p056-breakit-' || p_label || '-' || u || '@example.invalid', 'authenticated', 'authenticated', now());
  return u;
end $f$;
-- A count, or 'error <code>' when the database refuses.
create or replace function pg_temp.b_n(p_sql text) returns text language plpgsql as $f$
declare v text;
begin
  execute p_sql into v;
  return coalesce(v, 'null');
exception when others then
  return 'error ' || sqlstate;
end $f$;
create or replace function pg_temp.b_rows(p_sql text) returns text language plpgsql as $f$
declare n integer;
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
-- Every one of 056's six tables, counted as whoever is signed in, for these sessions and clients (an error kept as its code).
create or replace function pg_temp.b_six(p_sessions uuid[], p_profiles uuid[]) returns text language plpgsql as $f$
declare s text := quote_literal(p_sessions::text) || '::uuid[]';
        p text := quote_literal(p_profiles::text) || '::uuid[]';
begin
  return concat_ws('/',
    pg_temp.b_n('select count(*)::text from public.coach_session_people where session_id = any(' || s || ') or profile_id = any(' || p || ')'),
    pg_temp.b_n('select count(*)::text from public.coach_session_actions where session_id = any(' || s || ')'),
    pg_temp.b_n('select count(*)::text from public.coach_session_notes where session_id = any(' || s || ')'),
    pg_temp.b_n('select count(*)::text from public.client_notes where profile_id = any(' || p || ')'),
    pg_temp.b_n('select count(*)::text from public.client_about where profile_id = any(' || p || ')'),
    pg_temp.b_n('select count(*)::text from public.client_profiles where id = any(' || p || ')'));
end $f$;
create or replace function pg_temp.b_helpers() returns text language plpgsql as $f$
begin
  return concat_ws('/',
    pg_temp.b_n('select count(*)::text from public.coach_my_session_ids()'),
    pg_temp.b_n('select count(*)::text from public.coach_my_profile_ids()'),
    pg_temp.b_n('select count(*)::text from public.coach_covered_profile_ids()'));
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
  s_m uuid := gen_random_uuid(); s_n uuid := gen_random_uuid(); s_t uuid := gen_random_uuid(); s_g uuid := gen_random_uuid();
  today date := (now() at time zone 'Europe/London')::date;
  ss uuid[]; ps uuid[];
begin
  -- ------------------------------------------------------------ 8. run twice: one rule of each name, nothing open to PUBLIC
  f := f || pg_temp.b_eq('8a one rule of each name after 056 ran twice',
    (select string_agg(tablename || ':' || n, ',' order by tablename) from (
       select tablename, count(*) n from pg_policies where schemaname = 'public'
          and (tablename, policyname) in (('coach_session_people', 'Coach: own session'), ('coach_session_actions', 'Coach: own session'),
                                          ('coach_session_notes', 'Coach alone'), ('client_notes', 'Coach alone'),
                                          ('client_about', 'Coach alone'), ('client_profiles', 'Profiles: read'))
        group by tablename) x),
    'client_about:1,client_notes:1,client_profiles:1,coach_session_actions:1,coach_session_notes:1,coach_session_people:1');
  f := f || pg_temp.b_eq('8b no helper open to PUBLIC',
    (select count(*)::text from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
      where p.pronamespace = 'public'::regnamespace and p.proname in ('coach_my_session_ids', 'coach_my_profile_ids', 'coach_covered_profile_ids')
        and a.grantee = 0 and a.privilege_type = 'EXECUTE'), '0');
  f := f || pg_temp.b_eq('8c the helpers take nothing (no coach or client can be named to them)',
    (select string_agg(p.pronargs::text, ',') from pg_proc p where p.pronamespace = 'public'::regnamespace
        and p.proname in ('coach_my_session_ids', 'coach_my_profile_ids', 'coach_covered_profile_ids')), '0,0,0');

  begin
    perform pg_temp.b_admin();
    tess_u := pg_temp.b_user('tess'); maya_u := pg_temp.b_user('maya'); nina_u := pg_temp.b_user('nina');
    sam_u := pg_temp.b_user('sam'); gone_u := pg_temp.b_user('gone');
    insert into public.coaches (user_id, role, display_first_name) values (tess_u, 'owner', 'Tess') returning id into tess_c;
    insert into public.coaches (user_id, role, display_first_name) values (maya_u, 'coach', 'Maya') returning id into maya_c;
    insert into public.coaches (user_id, role, display_first_name) values (nina_u, 'coach', 'Nina') returning id into nina_c;
    insert into public.coaches (user_id, role, display_first_name) values (gone_u, 'coach', 'Rhys') returning id into gone_c;
    perform set_config('clarity.linking', 'on', true);
    insert into public.client_profiles (id, coach_id, name, email, user_id) values (p_sam, maya_c, 'Sam Okafor', 'sam.056b@example.invalid', sam_u);
    perform set_config('clarity.linking', '', true);
    insert into public.client_profiles (id, coach_id, name, email) values
      (p_nina, nina_c, 'Ella Fraser', 'ella.056b@example.invalid'),
      (p_tess, tess_c, 'Leo Grant', 'leo.056b@example.invalid'),
      (p_gone, gone_c, 'Ivy Moss', 'ivy.056b@example.invalid');
    insert into public.coach_cover (coach_id, cover_coach_id, profile_id, starts_on, ends_on, client_agreed_at) values
      (nina_c, maya_c, p_nina, today - 1, today + 7, now());
    insert into public.coach_sessions (id, coach_id, profile_id, starts_at) values
      (s_m, maya_c, p_sam, now() - interval '1 day'), (s_n, nina_c, p_nina, now() - interval '1 day'),
      (s_t, tess_c, p_tess, now() - interval '1 day'), (s_g, gone_c, p_gone, now() - interval '1 day');
    insert into public.coach_session_people (session_id, profile_id) values (s_m, p_sam), (s_n, p_nina), (s_t, p_tess), (s_g, p_gone);
    insert into public.coach_session_actions (session_id, coach_id, title) values
      (s_m, maya_c, 'Book the review'), (s_n, nina_c, 'Send the notes'), (s_t, tess_c, 'Call back'), (s_g, gone_c, 'Close up');
    insert into public.coach_session_notes (session_id, coach_id, focus) values
      (s_m, maya_c, 'Maya''s focus'), (s_n, nina_c, 'Nina''s focus'), (s_t, tess_c, 'Tess''s focus'), (s_g, gone_c, 'Rhys''s focus');
    insert into public.client_notes (profile_id, coach_id, body) values
      (p_sam, maya_c, 'Maya''s note'), (p_nina, nina_c, 'Nina''s note'), (p_tess, tess_c, 'Tess''s note'), (p_gone, gone_c, 'Rhys''s note');
    insert into public.client_about (profile_id, coach_id, partner) values
      (p_sam, maya_c, 'Ali'), (p_nina, nina_c, 'Jo'), (p_tess, tess_c, 'Kim'), (p_gone, gone_c, 'Lou');
    update public.coaches set active = false where id = gone_c;
    ss := array[s_m, s_n, s_t, s_g];
    ps := array[p_sam, p_nina, p_tess, p_gone];

    -- ------------------------------------------------------------ 1. signed out
    perform pg_temp.b_anon();
    f := f || pg_temp.b_eq('1a signed out: none of the six tables',
      (select string_agg(case when x ~ '^(0|error 42501)$' then 'none' else x end, '/') from unnest(string_to_array(pg_temp.b_six(ss, ps), '/')) x),
      'none/none/none/none/none/none');
    f := f || pg_temp.b_eq('1b signed out: no helper', pg_temp.b_helpers(), 'error 42501/error 42501/error 42501');

    -- ------------------------------------------------------------ 2. an associate with the code
    perform pg_temp.b_as(maya_u, 'aal2');
    f := f || pg_temp.b_eq('2a Maya: only her own rows of the six (her client, plus the one she covers)',
      pg_temp.b_six(ss, ps), '1/1/1/1/1/2');
    f := f || pg_temp.b_eq('2b Maya through a join (an embed): never Nina''s notes, About them or session people on the client she covers',
      concat_ws('/',
        (select count(*) from public.client_profiles p join public.client_notes n on n.profile_id = p.id where p.id = p_nina),
        (select count(*) from public.client_profiles p join public.client_about a on a.profile_id = p.id where p.id = p_nina),
        (select count(*) from public.client_profiles p join public.coach_session_people sp on sp.profile_id = p.id where p.id = p_nina),
        (select count(*) from public.coach_sessions s join public.coach_session_notes n on n.session_id = s.id where s.id in (s_n, s_t))), '0/0/0/0');
    f := f || pg_temp.b_eq('2c Maya calling the helpers herself: only her own',
      concat_ws('/',
        (select count(*) from public.coach_my_session_ids() i where i in (s_n, s_t, s_g)),
        (select count(*) from public.coach_my_session_ids() i where i = s_m),
        (select count(*) from public.coach_my_profile_ids() i where i in (p_nina, p_tess, p_gone)),
        (select count(*) from public.coach_my_profile_ids() i where i = p_sam),
        (select string_agg(i::text, ',') from public.coach_covered_profile_ids() i)), concat_ws('/', 0, 1, 0, 1, p_nina::text));
    f := f || pg_temp.b_eq('2d Maya names Nina''s session or client in the filter: nothing',
      pg_temp.b_six(array[s_n, s_t], array[p_tess]), '0/0/0/0/0/0');

    -- ------------------------------------------------------------ 3. the code given before a reset (a recovery code used in another tab)
    perform pg_temp.b_admin();
    insert into public.coach_authenticators (user_id, turned_on_at, last_reset_at) values (maya_u, now() - interval '1 day', now() - interval '1 minute')
      on conflict (user_id) do update set last_reset_at = excluded.last_reset_at;
    perform pg_temp.b_as(maya_u, 'aal2', now() - interval '1 hour');
    f := f || pg_temp.b_eq('3a Maya''s older sign-in, though aal2, reads nothing after the reset', pg_temp.b_six(ss, ps), '0/0/0/0/0/0');
    f := f || pg_temp.b_eq('3b and the helpers answer nothing', pg_temp.b_helpers(), '0/0/0');
    perform pg_temp.b_as(maya_u, 'aal2', now());
    f := f || pg_temp.b_eq('3c her new sign-in reads her own again', pg_temp.b_six(ss, ps), '1/1/1/1/1/2');

    -- ------------------------------------------------------------ 4. a coach no longer active
    perform pg_temp.b_as(gone_u, 'aal2');
    f := f || pg_temp.b_eq('4a Rhys, no longer active, with the code: nothing', pg_temp.b_six(ss, ps), '0/0/0/0/0/0');
    f := f || pg_temp.b_eq('4b and the helpers answer nothing', pg_temp.b_helpers(), '0/0/0');

    -- ------------------------------------------------------------ 5. the owner
    perform pg_temp.b_as(tess_u, 'aal1');
    f := f || pg_temp.b_eq('5a the owner before her code: not even her own', pg_temp.b_six(ss, ps), '0/0/0/0/0/0');
    f := f || pg_temp.b_eq('5b and the helpers answer nothing', pg_temp.b_helpers(), '0/0/0');
    perform pg_temp.b_as(tess_u, 'aal2');
    f := f || pg_temp.b_eq('5c the owner with her code: only her own, never an associate''s', pg_temp.b_six(ss, ps), '1/1/1/1/1/1');

    -- ------------------------------------------------------------ 6. a client
    perform pg_temp.b_as(sam_u, 'aal1');
    f := f || pg_temp.b_eq('6a Sam: his own profile and nothing the coach keeps about him', pg_temp.b_six(ss, ps), '0/0/0/0/0/1');
    perform pg_temp.b_as(sam_u, 'aal2');
    f := f || pg_temp.b_eq('6b Sam at aal2: the same', pg_temp.b_six(ss, ps), '0/0/0/0/0/1');
    f := f || pg_temp.b_eq('6c Sam calling the helpers', pg_temp.b_helpers(), '0/0/0');

    -- ------------------------------------------------------------ 7. writes that would move a row out of reach
    perform pg_temp.b_as(maya_u, 'aal2');
    f := f || pg_temp.b_eq('7a Maya can''t move her session''s person onto Nina''s session',
      pg_temp.b_rows(format('update public.coach_session_people set session_id = %L where session_id = %L', s_n, s_m)), 'error 42501');
    f := f || pg_temp.b_eq('7b Maya can''t move her action onto Nina''s session',
      pg_temp.b_rows(format('update public.coach_session_actions set session_id = %L where session_id = %L', s_n, s_m)), 'error 42501');
    f := f || pg_temp.b_eq('7c Maya can''t put About them on the client she covers',
      pg_temp.b_rows(format('insert into public.client_about (profile_id, coach_id, partner) values (%L, %L, %L)', p_nina, maya_c, 'X')), 'error 42501');
    f := f || pg_temp.b_eq('7d Maya can''t write a note as Nina',
      pg_temp.b_rows(format('insert into public.client_notes (profile_id, coach_id, body) values (%L, %L, %L)', p_nina, nina_c, 'X')), 'error 42501');
    f := f || pg_temp.b_eq('7e Maya can''t delete Nina''s rows',
      concat_ws('/', pg_temp.b_rows(format('delete from public.client_notes where profile_id = %L', p_nina)),
                     pg_temp.b_rows(format('delete from public.coach_session_people where session_id = %L', s_n))), '0/0');
    perform pg_temp.b_admin();
    f := f || pg_temp.b_eq('7f Nina''s rows are all still there',
      concat_ws('/', (select count(*) from public.client_notes where profile_id = p_nina), (select count(*) from public.coach_session_people where session_id = s_n),
                     (select count(*) from public.coach_session_actions where session_id = s_n)), '1/1/1');

    perform pg_temp.b_admin();
    raise exception 'undo the test rows' using errcode = 'P0056';
  exception when sqlstate 'P0056' then
    perform pg_temp.b_admin();
  end;

  f := f || pg_temp.b_eq('9 everything the test made is undone',
    (select count(*)::text from auth.users where email like 'p056-breakit-%@example.invalid'), '0');

  if cardinality(f) > 0 then
    raise exception E'056 BREAK-IT FAILED (%):\n%', cardinality(f), array_to_string(f, E'\n');
  end if;
  raise notice '056 BREAK-IT CHECKS PASSED';
end
$t$;
