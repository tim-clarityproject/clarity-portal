-- =============================================================================
-- 056_scale_indexes_test.sql
-- Checks supabase/migrations/056_scale_indexes.sql. RUN ORDER: 054, 055, 056,
-- then this.
--
-- WHAT IT DOES
--   Makes an invented owner (Tess), two associates (Maya and Nina) and a
--   client with an account (Sam). Maya and Nina each have a client, a session
--   with its person, actions and private notes, a note and About them. Maya
--   covers Nina's client (agreed, today) and also one not yet agreed. It
--   checks:
--     1. 056 recorded itself once; the three helpers are security definer,
--        closed to anyone signed out, open to someone signed in, and each
--        asks for the 6-digit code (054's rule); the rules' read sides use
--        them and no longer call a function row by row; the write sides
--        still check row by row; the new indexes are there;
--     2. with the code, each coach reads exactly their own rows, the same
--        rows the old row-by-row functions allowed (counted as the
--        database's owner), across every coach in the database;
--     3. without the code (aal1) a coach reads none of them;
--     4. the owner never reads an associate's sessions, notes or About them;
--     5. a cover coach reads the covered client's profile between the dates
--        once agreed, and not before the client agrees;
--     6. a client reads their own profile and nothing of the coach's;
--     7. writes are still checked: Maya can't add a person to Nina's session,
--        can't change Nina's notes, and can't move a note onto Nina's client.
--   Everything it makes is undone at the end.
--
--   It ends with the notice 056 CHECKS PASSED, or stops with FAILED and a
--   list naming each check that failed.
-- =============================================================================
create or replace function pg_temp.s_as(p uuid, p_aal text) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated', 'aal', p_aal,
    'amr', json_build_array(json_build_object('method', 'password', 'timestamp', floor(extract(epoch from now()))::bigint)),
    'iat', floor(extract(epoch from now()))::bigint, 'session_id', gen_random_uuid())::text, true);
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
  values (u, 'p056-test-' || p_label || '-' || u || '@example.invalid', 'authenticated', 'authenticated', now());
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
create or replace function pg_temp.s_rows(p_sql text) returns text language plpgsql as $f$
declare n integer;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n::text;
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
  helpers text[] := array['coach_my_session_ids', 'coach_my_profile_ids', 'coach_covered_profile_ids'];
  h text;
  tess_u uuid; maya_u uuid; nina_u uuid; sam_u uuid;
  tess_c uuid; maya_c uuid; nina_c uuid;
  p_sam uuid := gen_random_uuid();    -- Maya's client, with an account
  p_nina uuid := gen_random_uuid();   -- Nina's client, covered by Maya (agreed)
  p_wait uuid := gen_random_uuid();   -- Nina's client, cover not agreed yet
  s_m uuid := gen_random_uuid();      -- Maya's session
  s_n uuid := gen_random_uuid();      -- Nina's session
  s_t uuid := gen_random_uuid();      -- Tess's session
  today date := (now() at time zone 'Europe/London')::date;
  c record;
  want text; got text;
begin
  -- ------------------------------------------------------------ 1. there, and locked down
  if to_regclass('public.migration_log') is not null then
    f := f || pg_temp.s_eq('1a the migration recorded itself, once',
      (select count(*)::text from public.migration_log where number = 56 and name = '056_scale_indexes'), '1');
  end if;
  foreach h in array helpers loop
    f := f || pg_temp.s_eq('1b ' || h || '(): security definer, signed out no, signed in yes, asks for the code',
      (select concat_ws('/', p.prosecdef, has_function_privilege('anon', p.oid, 'execute'),
                        has_function_privilege('authenticated', p.oid, 'execute'), p.prosrc ~ 'coach_code_ok\(')
         from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = h), 't/f/t/t');
  end loop;
  f := f || pg_temp.s_eq('1c the read sides ask once, never row by row',
    (select string_agg(tablename || ':' || (qual ~ '(coach_owns_session|coach_owns_profile|covers_profile)\(')::text, ',' order by tablename)
       from pg_policies where schemaname = 'public'
        and (tablename, policyname) in (('coach_session_people', 'Coach: own session'), ('coach_session_actions', 'Coach: own session'),
                                        ('coach_session_notes', 'Coach alone'), ('client_notes', 'Coach alone'),
                                        ('client_about', 'Coach alone'), ('client_profiles', 'Profiles: read'))),
    'client_about:false,client_notes:false,client_profiles:false,coach_session_actions:false,coach_session_notes:false,coach_session_people:false');
  f := f || pg_temp.s_eq('1d the write sides still check each row',
    (select string_agg(tablename || ':' || (with_check ~ '(coach_owns_session|coach_owns_profile)\(')::text, ',' order by tablename)
       from pg_policies where schemaname = 'public'
        and (tablename, policyname) in (('coach_session_people', 'Coach: own session'), ('coach_session_actions', 'Coach: own session'),
                                        ('coach_session_notes', 'Coach alone'), ('client_notes', 'Coach alone'), ('client_about', 'Coach alone'))),
    'client_about:true,client_notes:true,coach_session_actions:true,coach_session_notes:true,coach_session_people:true');
  f := f || pg_temp.s_eq('1e the 6-digit code rule is still on every table here',
    (select count(*)::text from pg_policies where schemaname = 'public' and policyname = 'Coach data: needs the 6-digit code' and permissive = 'RESTRICTIVE'
        and tablename in ('coach_session_people', 'coach_session_actions', 'coach_session_notes', 'client_notes', 'client_about', 'client_profiles')), '6');
  f := f || pg_temp.s_eq('1f the new indexes',
    (select count(*)::text from pg_indexes where schemaname = 'public'
        and indexname in ('coach_todos_coach_idx', 'time_entries_coach_idx', 'client_profiles_coach_all_idx')), '3');
  f := f || pg_temp.s_eq('1g every rule here is for signed-in people',
    (select count(*)::text from pg_policies where schemaname = 'public' and roles <> '{authenticated}'
        and tablename in ('coach_session_people', 'coach_session_actions', 'coach_session_notes', 'client_notes', 'client_about', 'client_profiles')), '0');

  begin
    perform pg_temp.s_admin();
    tess_u := pg_temp.s_user('tess'); maya_u := pg_temp.s_user('maya'); nina_u := pg_temp.s_user('nina'); sam_u := pg_temp.s_user('sam');
    insert into public.coaches (user_id, role, display_first_name) values (tess_u, 'owner', 'Tess') returning id into tess_c;
    insert into public.coaches (user_id, role, display_first_name) values (maya_u, 'coach', 'Maya') returning id into maya_c;
    insert into public.coaches (user_id, role, display_first_name) values (nina_u, 'coach', 'Nina') returning id into nina_c;
    perform set_config('clarity.linking', 'on', true);
    insert into public.client_profiles (id, coach_id, name, email, user_id) values (p_sam, maya_c, 'Sam Okafor', 'sam.056@example.invalid', sam_u);
    perform set_config('clarity.linking', '', true);
    insert into public.client_profiles (id, coach_id, name, email) values
      (p_nina, nina_c, 'Ella Fraser', 'ella.056@example.invalid'),
      (p_wait, nina_c, 'Noor Haddad', 'noor.056@example.invalid');
    insert into public.coach_cover (coach_id, cover_coach_id, profile_id, starts_on, ends_on, client_agreed_at) values
      (nina_c, maya_c, p_nina, today - 1, today + 7, now()),
      (nina_c, maya_c, p_wait, today - 1, today + 7, null);
    insert into public.coach_sessions (id, coach_id, profile_id, starts_at) values
      (s_m, maya_c, p_sam, now() - interval '1 day'),
      (s_n, nina_c, p_nina, now() - interval '1 day');
    -- Tess's own client and session, to show the owner reads only her own.
    insert into public.client_profiles (id, coach_id, name, email) values (gen_random_uuid(), tess_c, 'Leo Grant', 'leo.056@example.invalid');
    insert into public.coach_sessions (id, coach_id, profile_id, starts_at)
      select s_t, tess_c, p.id, now() - interval '2 days' from public.client_profiles p where p.email = 'leo.056@example.invalid';
    insert into public.coach_session_people (session_id, profile_id) values (s_m, p_sam), (s_n, p_nina);
    insert into public.coach_session_actions (session_id, coach_id, title) values (s_m, maya_c, 'Book the review'), (s_n, nina_c, 'Send the notes');
    insert into public.coach_session_notes (session_id, coach_id, focus) values (s_m, maya_c, 'Maya''s focus'), (s_n, nina_c, 'Nina''s focus');
    insert into public.client_notes (profile_id, coach_id, body) values (p_sam, maya_c, 'Maya''s note'), (p_nina, nina_c, 'Nina''s note');
    insert into public.client_about (profile_id, coach_id, partner) values (p_sam, maya_c, 'Ali'), (p_nina, nina_c, 'Jo');

    -- ------------------------------------------------------------ 2. each coach reads exactly their own, as before
    perform pg_temp.s_as(maya_u, 'aal2');
    f := f || pg_temp.s_eq('2a Maya reads her own session people, actions and notes', concat_ws('/',
      (select count(*) from public.coach_session_people where session_id in (s_m, s_n)),
      (select count(*) from public.coach_session_actions where session_id in (s_m, s_n)),
      (select string_agg(focus, ',') from public.coach_session_notes where session_id in (s_m, s_n))), '1/1/Maya''s focus');
    f := f || pg_temp.s_eq('2b Maya reads her own note and About them, never Nina''s (even for a client she covers)', concat_ws('/',
      (select string_agg(body, ',') from public.client_notes where profile_id in (p_sam, p_nina)),
      (select string_agg(partner, ',') from public.client_about where profile_id in (p_sam, p_nina))), 'Maya''s note/Ali');

    -- Every coach in the database: what the rules give equals the row-by-row definition.
    for c in select co.id, co.user_id from public.coaches co where co.active loop
      perform pg_temp.s_admin();
      want := concat_ws('/',
        (select count(*) from public.coach_session_people sp join public.coach_sessions s on s.id = sp.session_id where s.coach_id = c.id),
        (select count(*) from public.coach_session_notes n join public.coach_sessions s on s.id = n.session_id where n.coach_id = c.id and s.coach_id = c.id),
        (select count(*) from public.coach_session_actions a join public.coach_sessions s on s.id = a.session_id where a.coach_id = c.id and s.coach_id = c.id),
        (select count(*) from public.client_notes n join public.client_profiles p on p.id = n.profile_id where n.coach_id = c.id and p.coach_id = c.id),
        (select count(*) from public.client_about n join public.client_profiles p on p.id = n.profile_id where n.coach_id = c.id and p.coach_id = c.id),
        (select count(*) from public.client_profiles p where p.coach_id = c.id
            or p.user_id = c.user_id
            or exists (select 1 from public.coach_cover cv where cv.profile_id = p.id and cv.cover_coach_id = c.id
                         and cv.client_agreed_at is not null and today between cv.starts_on and cv.ends_on)));
      perform pg_temp.s_as(c.user_id, 'aal2');
      got := concat_ws('/',
        (select count(*) from public.coach_session_people), (select count(*) from public.coach_session_notes),
        (select count(*) from public.coach_session_actions), (select count(*) from public.client_notes),
        (select count(*) from public.client_about), (select count(*) from public.client_profiles));
      f := f || pg_temp.s_eq('2c a coach reads the same rows as the row-by-row rules (' || c.id || ')', got, want);
    end loop;

    -- ------------------------------------------------------------ 3. without the code
    perform pg_temp.s_as(maya_u, 'aal1');
    f := f || pg_temp.s_eq('3a before the code Maya reads none of it', concat_ws('/',
      (select count(*) from public.coach_session_people), (select count(*) from public.coach_session_actions),
      (select count(*) from public.coach_session_notes), (select count(*) from public.client_notes),
      (select count(*) from public.client_about), (select count(*) from public.client_profiles where coach_id = maya_c or id = p_nina)), '0/0/0/0/0/0');
    f := f || pg_temp.s_eq('3b before the code the helpers answer nothing', concat_ws('/',
      (select count(*) from public.coach_my_session_ids()), (select count(*) from public.coach_my_profile_ids()),
      (select count(*) from public.coach_covered_profile_ids())), '0/0/0');

    -- ------------------------------------------------------------ 4. the owner
    perform pg_temp.s_as(tess_u, 'aal2');
    f := f || pg_temp.s_eq('4a the owner reads none of Maya''s or Nina''s sessions, notes or About them', concat_ws('/',
      (select count(*) from public.coach_session_people where session_id in (s_m, s_n)),
      (select count(*) from public.coach_session_actions where session_id in (s_m, s_n)),
      (select count(*) from public.coach_session_notes where session_id in (s_m, s_n)),
      (select count(*) from public.client_notes where coach_id in (maya_c, nina_c)),
      (select count(*) from public.client_about where coach_id in (maya_c, nina_c)),
      (select count(*) from public.client_profiles where id in (p_sam, p_nina, p_wait))), '0/0/0/0/0/0');
    f := f || pg_temp.s_eq('4b the owner reads her own session', (select count(*)::text from public.coach_sessions where id = s_t), '1');

    -- ------------------------------------------------------------ 5. cover
    perform pg_temp.s_as(maya_u, 'aal2');
    f := f || pg_temp.s_eq('5a Maya reads the client she covers (agreed), not the one waiting',
      (select string_agg(name, ',' order by name) from public.client_profiles where id in (p_nina, p_wait)), 'Ella Fraser');
    perform pg_temp.s_admin();
    update public.coach_cover set starts_on = today + 1 where profile_id = p_nina;
    perform pg_temp.s_as(maya_u, 'aal2');
    f := f || pg_temp.s_eq('5b not before the cover starts', (select count(*)::text from public.client_profiles where id = p_nina), '0');
    perform pg_temp.s_as(nina_u, 'aal2');
    f := f || pg_temp.s_eq('5c Nina reads her own clients', (select count(*)::text from public.client_profiles where id in (p_nina, p_wait)), '2');

    -- ------------------------------------------------------------ 6. a client
    perform pg_temp.s_as(sam_u, 'aal1');
    f := f || pg_temp.s_eq('6a Sam reads his own profile and nothing of the coach''s', concat_ws('/',
      (select count(*) from public.client_profiles), (select count(*) from public.coach_session_people),
      (select count(*) from public.coach_session_notes), (select count(*) from public.client_notes),
      (select count(*) from public.client_about), pg_temp.s_n('select count(*)::text from public.coach_my_session_ids()')), '1/0/0/0/0/0');
    perform pg_temp.s_as(sam_u, 'aal2');
    f := f || pg_temp.s_eq('6b even with aal2 a client is no coach', concat_ws('/',
      (select count(*) from public.coach_my_session_ids()), (select count(*) from public.coach_my_profile_ids()),
      (select count(*) from public.coach_covered_profile_ids())), '0/0/0');

    -- ------------------------------------------------------------ 7. writes
    perform pg_temp.s_as(maya_u, 'aal2');
    f := f || pg_temp.s_eq('7a Maya can''t add a person to Nina''s session',
      pg_temp.s_rows(format('insert into public.coach_session_people (session_id, profile_id) values (%L, %L)', s_n, p_sam)), 'error 42501');
    f := f || pg_temp.s_eq('7b Maya can''t change Nina''s notes',
      pg_temp.s_rows(format('update public.coach_session_notes set focus = %L where session_id = %L', 'x', s_n)), '0');
    f := f || pg_temp.s_eq('7c Maya can''t move her note onto Nina''s client',
      pg_temp.s_rows(format('update public.client_notes set profile_id = %L where profile_id = %L', p_nina, p_sam)), 'error 42501');
    f := f || pg_temp.s_eq('7d Maya can change her own notes',
      pg_temp.s_rows(format('update public.coach_session_notes set focus = %L where session_id = %L', 'Edited', s_m)), '1');
    f := f || pg_temp.s_eq('7e Maya can remove and add her own session''s person', concat_ws('/',
      pg_temp.s_rows(format('delete from public.coach_session_people where session_id = %L', s_m)),
      pg_temp.s_rows(format('insert into public.coach_session_people (session_id, profile_id) values (%L, %L)', s_m, p_sam))), '1/1');
    perform pg_temp.s_as(maya_u, 'aal1');
    f := f || pg_temp.s_eq('7f before the code Maya changes nothing',
      pg_temp.s_rows(format('update public.coach_session_notes set focus = %L where session_id = %L', 'x', s_m)), '0');

    perform pg_temp.s_admin();
    raise exception 'undo the test rows' using errcode = 'P0056';
  exception when sqlstate 'P0056' then
    perform pg_temp.s_admin();
  end;

  f := f || pg_temp.s_eq('8 everything the test made is undone',
    (select count(*)::text from auth.users where email like 'p056-test-%@example.invalid'), '0');

  if cardinality(f) > 0 then
    raise exception E'056 FAILED (%):\n%', cardinality(f), array_to_string(f, E'\n');
  end if;
  raise notice '056 CHECKS PASSED';
end
$t$;
