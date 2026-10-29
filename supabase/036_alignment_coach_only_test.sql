-- =============================================================================
-- 036_alignment_coach_only_test.sql: checks migration 036
--
-- Run after 034 and 036, on the test project only, inside a transaction that
-- is rolled back. To check that 036 is safe to run twice, run it twice first:
--   bash scripts/dry-run-on-test.sh supabase/migrations/034_alignment_coach_name.sql \
--     supabase/migrations/036_alignment_coach_only.sql supabase/migrations/036_alignment_coach_only.sql \
--     supabase/036_alignment_coach_only_test.sql
-- (On the feature branch, 035 goes before 036 as well.)
--
-- WHAT IT DOES
--   Makes invented people (the owner, a second coach, someone else signed
--   in) and three links: one made by the second coach, one made by the
--   owner, and an older one with no coach recorded. Each is filled in and
--   finished by its guest, then it checks who can read the answers (the
--   guest, the link's coach, the owner, anyone else, someone signed out, the
--   server's key), what the email server is told, the fill of older links,
--   and that running 036 twice left one of everything. Where Phase 1's
--   scores are there (029 to 032), it also checks that a newly frozen week
--   and a new check-in record methods version 1.4, and older rows keep theirs. No email address is
--   ever shown: addresses are compared inside the database.
--   Everything it makes is undone at the end.
--
--   It ends with the notice 036 CHECKS PASSED, or stops with FAILED and a
--   list naming each check that failed.
-- =============================================================================

-- ---------------------------------------------------------------- helpers
create or replace function pg_temp.t_as(p uuid) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $f$;
create or replace function pg_temp.t_anon() returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('role', 'anon', true);
end $f$;
create or replace function pg_temp.t_service() returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  perform set_config('role', 'service_role', true);
end $f$;
create or replace function pg_temp.t_admin() returns void language plpgsql as $f$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
end $f$;
-- Tim in the SQL editor, with a coach's sign-in (so auth.uid() is that coach)
create or replace function pg_temp.t_admin_as(p uuid) returns void language plpgsql as $f$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p)::text, true);
end $f$;
create or replace function pg_temp.t36_user(p_label text) returns uuid language plpgsql as $f$
declare u uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, aud, role, email_confirmed_at)
  values (u, '036-test-' || p_label || '-' || u || '@example.invalid', 'authenticated', 'authenticated', now());
  update public.profiles set first_name = initcap(p_label), last_name = 'Test' where id = u;
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
create or replace function pg_temp.t_eq(p_name text, p_got text, p_want text) returns text[] language sql as $f$
  select case when p_got is distinct from p_want
              then array[format('%s: expected %s, got %s', p_name, p_want, coalesce(p_got, 'nothing'))]
              else '{}'::text[] end;
$f$;
-- the token of a new link
create or replace function pg_temp.t_tok(j jsonb) returns text language sql as $f$ select j ->> 'token' $f$;

-- ---------------------------------------------------------------- the checks
do $t$
declare
  f text[] := '{}';
  owner_u uuid; coach2 uuid; other_u uuid;
  has_coaches boolean := to_regclass('public.coaches') is not null;
  l_coach jsonb; l_owner jsonb; l_old jsonb;
  t_coach text; t_owner text; t_old text;
  sam uuid; plan_s uuid; s_one uuid; o_one uuid; spr uuid; sh uuid; mon date; ck uuid;
  answers constant jsonb := '{"objective": "036 test objective", "csfs": [{"id": "f1", "text": "036 test CSF"}], "projects": [{"id": "p1", "text": "036 test project"}]}';
  j jsonb;
begin
  begin
    owner_u := pg_temp.t36_user('owner'); coach2 := pg_temp.t36_user('adie'); other_u := pg_temp.t36_user('other');
    if has_coaches then
      execute 'insert into public.coaches (user_id, role, display_first_name) values ($1, ''owner'', ''Tim''), ($2, ''coach'', ''Adie'')'
        using owner_u, coach2;
    end if;

    -- ------------------------------------------------ making the three links (Tim, SQL editor)
    perform pg_temp.t_admin();
    l_coach := public.create_alignment_session('036 test organisation', '036-test-guest-one@example.invalid',
                                               (select upper(email) from auth.users where id = coach2));
    perform pg_temp.t_admin_as(owner_u);
    l_owner := public.create_alignment_session('036 test organisation', '036-test-guest-two@example.invalid');
    perform pg_temp.t_admin();
    l_old := public.create_alignment_session('036 test organisation', '036-test-guest-three@example.invalid');
    t_coach := pg_temp.t_tok(l_coach); t_owner := pg_temp.t_tok(l_owner); t_old := pg_temp.t_tok(l_old);
    -- an older link that has a first name from 034 but no coach recorded
    update public.alignment_sessions set coach_name = 'Adie' where token = t_old;

    f := f || pg_temp.t_eq('1a the second coach''s link records them',
      pg_temp.t_n(format('select (coach_user_id = %L)::text from public.alignment_sessions where token = %L', coach2, t_coach)), 'true');
    f := f || pg_temp.t_eq('1b ... and their first name',
      l_coach ->> 'coach_name', 'Adie');
    f := f || pg_temp.t_eq('1c a link made by the signed-in owner records them',
      pg_temp.t_n(format('select (coach_user_id = %L)::text from public.alignment_sessions where token = %L', owner_u, t_owner)), 'true');
    f := f || pg_temp.t_eq('1d a link made with no coach records nobody',
      pg_temp.t_n(format('select coach_user_id::text from public.alignment_sessions where token = %L', t_old)), 'null');
    f := f || pg_temp.t_eq('1e making a link never returns the coach''s email',
      (position('@' in l_coach::text) > 0)::text, 'false');

    -- ------------------------------------------------ each guest fills theirs in and finishes
    perform pg_temp.t_anon();
    f := f || pg_temp.t_eq('2a the guest saves on the coach''s link',
      public.alignment_save(t_coach, '036-test-guest-one@example.invalid', l_coach ->> 'access_code', answers, null, 0, true) ->> 'status', 'complete');
    f := f || pg_temp.t_eq('2b ... on the owner''s link',
      public.alignment_save(t_owner, '036-test-guest-two@example.invalid', l_owner ->> 'access_code', answers, null, 0, true) ->> 'status', 'complete');
    f := f || pg_temp.t_eq('2c ... on the older link',
      public.alignment_save(t_old, '036-test-guest-three@example.invalid', l_old ->> 'access_code', answers, null, 0, true) ->> 'status', 'complete');

    -- ------------------------------------------------ 3. the second coach's link
    -- the guest
    j := public.alignment_open(t_coach, '036-test-guest-one@example.invalid', l_coach ->> 'access_code');
    f := f || pg_temp.t_eq('3a the guest reads their answers', (j -> 'data' = answers)::text, 'true');
    f := f || pg_temp.t_eq('3b ... and is told the coach''s name', j ->> 'coach_name', 'Adie');
    -- signed out, without the code
    j := public.alignment_open(t_coach, '036-test-guest-one@example.invalid', 'AAAAAA');
    f := f || pg_temp.t_eq('3c signed out with a wrong code reads nothing', ((j ->> 'ok')::boolean or j ? 'data')::text, 'false');
    f := f || pg_temp.t_eq('3d signed out can''t ask for the coach''s answers',
      pg_temp.t_n(format('select public.alignment_coach_answers(%L)::text', t_coach)), 'error 42501');
    f := f || pg_temp.t_eq('3e signed out can''t read the table',
      pg_temp.t_n('select count(*) from public.alignment_sessions'), 'error 42501');
    -- the second coach
    perform pg_temp.t_as(coach2);
    j := public.alignment_coach_answers(t_coach);
    f := f || pg_temp.t_eq('3f the second coach reads the answers', (j -> 'data' = answers)::text, 'true');
    f := f || pg_temp.t_eq('3g ... and nothing from the table directly',
      pg_temp.t_n('select count(*) from public.alignment_sessions'), 'error 42501');
    -- the owner
    perform pg_temp.t_as(owner_u);
    j := public.alignment_coach_answers(t_coach);
    f := f || pg_temp.t_eq('3h the owner can''t read the second coach''s answers', ((j ->> 'ok')::boolean or j ? 'data')::text, 'false');
    f := f || pg_temp.t_eq('3i ... nor from the table',
      pg_temp.t_n('select count(*) from public.alignment_sessions'), 'error 42501');
    f := f || pg_temp.t_eq('3j ... nor through alignment_list',
      pg_temp.t_n('select count(*) from public.alignment_list()'), 'error 42501');
    f := f || pg_temp.t_eq('3k ... nor learn the coach''s address',
      pg_temp.t_n(format('select public.alignment_recipients(%L)::text', t_coach)), 'error 42501');
    -- someone else signed in
    perform pg_temp.t_as(other_u);
    j := public.alignment_coach_answers(t_coach);
    f := f || pg_temp.t_eq('3l someone else signed in reads nothing', ((j ->> 'ok')::boolean or j ? 'data')::text, 'false');
    -- the server's key
    perform pg_temp.t_service();
    f := f || pg_temp.t_eq('3m the server''s key can''t read the table',
      pg_temp.t_n('select count(*) from public.alignment_sessions'), 'error 42501');
    j := public.alignment_recipients(t_coach);
    perform pg_temp.t_admin();
    f := f || pg_temp.t_eq('3n the server learns the coach''s address',
      ((j ->> 'coach_email') = (select email from auth.users where id = coach2))::text, 'true');
    perform pg_temp.t_service();
    f := f || pg_temp.t_eq('3o ... and no answers', (j ? 'data' or position('036 test' in j::text) > 0)::text, 'false');
    f := f || pg_temp.t_eq('3p ... and nothing for a link that isn''t there', public.alignment_recipients('no-such-link') ->> 'ok', 'false');
    -- the email check (signed out, with the guest's details)
    perform pg_temp.t_anon();
    j := public.alignment_email_check(t_coach, '036-test-guest-one@example.invalid', l_coach ->> 'access_code', 'complete');
    f := f || pg_temp.t_eq('3q the email check says the link has a coach', j ->> 'has_coach', 'true');
    perform pg_temp.t_admin();
    f := f || pg_temp.t_eq('3r ... but never who',
      pg_temp.t_n(format('select (position(lower(email) in lower(%L)) > 0)::text from auth.users where id = %L', j::text, coach2)), 'false');

    -- ------------------------------------------------ 4. the owner's link
    perform pg_temp.t_as(owner_u);
    f := f || pg_temp.t_eq('4a the owner reads the answers on their own link', (public.alignment_coach_answers(t_owner) -> 'data' = answers)::text, 'true');
    perform pg_temp.t_as(coach2);
    f := f || pg_temp.t_eq('4b the second coach can''t', (public.alignment_coach_answers(t_owner) ? 'data')::text, 'false');
    perform pg_temp.t_service();
    j := public.alignment_recipients(t_owner);
    perform pg_temp.t_admin();
    f := f || pg_temp.t_eq('4c the server learns the owner''s address',
      ((j ->> 'coach_email') = (select email from auth.users where id = owner_u))::text, 'true');

    -- ------------------------------------------------ 5. the older link, with no coach recorded
    perform pg_temp.t_anon();
    j := public.alignment_open(t_old, '036-test-guest-three@example.invalid', l_old ->> 'access_code');
    f := f || pg_temp.t_eq('5a the guest reads their answers', (j -> 'data' = answers)::text, 'true');
    f := f || pg_temp.t_eq('5b ... and no coach is named ("your coach")', coalesce(j ->> 'coach_name', 'null'), 'null');
    j := public.alignment_email_check(t_old, '036-test-guest-three@example.invalid', l_old ->> 'access_code', 'complete');
    f := f || pg_temp.t_eq('5c the email check says no coach', j ->> 'has_coach', 'false');
    perform pg_temp.t_service();
    f := f || pg_temp.t_eq('5d the server gets no coach address, so it uses the owner list',
      coalesce(public.alignment_recipients(t_old) ->> 'coach_email', 'null'), 'null');
    perform pg_temp.t_as(coach2);
    f := f || pg_temp.t_eq('5e the second coach can''t read it', (public.alignment_coach_answers(t_old) ? 'data')::text, 'false');
    perform pg_temp.t_as(owner_u);
    if has_coaches then
      f := f || pg_temp.t_eq('5f the owner reads it, as today', (public.alignment_coach_answers(t_old) -> 'data' = answers)::text, 'true');
    else
      f := f || pg_temp.t_eq('5f with no owner on this database, nobody signed in reads it', (public.alignment_coach_answers(t_old) ? 'data')::text, 'false');
    end if;

    -- ------------------------------------------------ 6. filling older links
    perform pg_temp.t_admin();
    update public.alignment_sessions set coach_user_id = null, created_by = (select upper(email) from auth.users where id = coach2)
     where token = t_old;
    update public.alignment_sessions set coach_user_id = null, created_by = 'postgres' where token = t_owner;
    -- the fill, as in 036
    update public.alignment_sessions s
       set coach_user_id = u.id
      from auth.users u
     where s.coach_user_id is null
       and (s.created_by = u.id::text or lower(s.created_by) = lower(u.email))
       and (select count(*) from auth.users x
             where s.created_by = x.id::text or lower(s.created_by) = lower(x.email)) = 1
       and s.token in (t_old, t_owner);
    f := f || pg_temp.t_eq('6a an older link made by a known account is filled',
      pg_temp.t_n(format('select (coach_user_id = %L)::text from public.alignment_sessions where token = %L', coach2, t_old)), 'true');
    f := f || pg_temp.t_eq('6b an older link made in the SQL editor stays empty',
      pg_temp.t_n(format('select coach_user_id::text from public.alignment_sessions where token = %L', t_owner)), 'null');

    -- ------------------------------------------------ 7. who may call what, and running 036 twice
    f := f || pg_temp.t_eq('7a only the server may ask who gets the emails', (
      not has_function_privilege('anon', 'public.alignment_recipients(text)', 'execute')
      and not has_function_privilege('authenticated', 'public.alignment_recipients(text)', 'execute')
      and has_function_privilege('service_role', 'public.alignment_recipients(text)', 'execute'))::text, 'true');
    f := f || pg_temp.t_eq('7b only someone signed in may ask for a coach''s answers', (
      not has_function_privilege('anon', 'public.alignment_coach_answers(text)', 'execute')
      and has_function_privilege('authenticated', 'public.alignment_coach_answers(text)', 'execute'))::text, 'true');
    f := f || pg_temp.t_eq('7c the table is closed to the app and the server', (
      not has_table_privilege('anon', 'public.alignment_sessions', 'select')
      and not has_table_privilege('authenticated', 'public.alignment_sessions', 'select')
      and not has_table_privilege('service_role', 'public.alignment_sessions', 'select'))::text, 'true');
    f := f || pg_temp.t_eq('7d the admin functions are closed to the public key', (
      not has_function_privilege('anon', 'public.alignment_list()', 'execute')
      and not has_function_privilege('authenticated', 'public.alignment_list()', 'execute')
      and not has_function_privilege('anon', 'public.alignment_disable(text)', 'execute')
      and not has_function_privilege('anon', 'public._alignment_auth(text,text,text)', 'execute')
      and not has_function_privilege('anon', 'public._alignment_coach_id(text)', 'execute')
      and not has_function_privilege('authenticated', 'public._alignment_coach_id(text)', 'execute')
      and not has_function_privilege('anon', 'public.create_alignment_session(text,text,text)', 'execute')
      and not has_function_privilege('authenticated', 'public.create_alignment_session(text,text,text)', 'execute'))::text, 'true');
    f := f || pg_temp.t_eq('7e the outside page can still open and save', (
      has_function_privilege('anon', 'public.alignment_open(text,text,text)', 'execute')
      and has_function_privilege('anon', 'public.alignment_save(text,text,text,jsonb,jsonb,integer,boolean)', 'execute')
      and has_function_privilege('anon', 'public.alignment_email_check(text,text,text,text)', 'execute'))::text, 'true');
    f := f || pg_temp.t_eq('7f one coach_user_id link, one index', pg_temp.t_n($q$
      select (select count(*) from pg_constraint where conrelid = 'public.alignment_sessions'::regclass and contype = 'f'
                and conkey = array[(select attnum from pg_attribute where attrelid = 'public.alignment_sessions'::regclass and attname = 'coach_user_id')])
             || ' ' ||
             (select count(*) from pg_index where indrelid = 'public.alignment_sessions'::regclass
                and (indkey::int2[])[0] = (select attnum from pg_attribute where attrelid = 'public.alignment_sessions'::regclass and attname = 'coach_user_id'))$q$), '1 1');
    f := f || pg_temp.t_eq('7g deleting the coach''s account leaves the link with no coach', pg_temp.t_n($q$
      select (select confdeltype from pg_constraint where conrelid = 'public.alignment_sessions'::regclass and contype = 'f'
                and conkey = array[(select attnum from pg_attribute where attrelid = 'public.alignment_sessions'::regclass and attname = 'coach_user_id')])::text$q$), 'n');
    if to_regclass('public.migration_log') is not null then
      f := f || pg_temp.t_eq('7h 036 is in the migration log once, as ran',
        pg_temp.t_n($q$select count(*) || ' ' || min(status) from public.migration_log where number = 36 and name = '036_alignment_coach_only'$q$), '1 ran');
    end if;

    -- ------------------------------------------------ 8. the scoring methods version new rows get
    perform pg_temp.t_admin();
    if to_regprocedure('public.freeze_week(uuid,integer)') is not null and to_regclass('public.checkins') is not null then
      -- Week 1 of the sprint is the Monday two weeks ago, so it has finished.
      mon := date_trunc('week', current_date)::date - 14;
      sam := pg_temp.t36_user('sam');
      insert into public.performance_plans (user_id, mission) values (sam, '036 test mission') returning id into plan_s;
      insert into public.outcome_objectives (plan_id, user_id, name, kind, due_on) values (plan_s, sam, '036 test objective', 'milestone', mon + 200) returning id into o_one;
      insert into public.plan_strategies (plan_id, user_id, name, sort_order) values (plan_s, sam, '036 test Strategy', 1) returning id into s_one;
      insert into public.strategy_objectives (strategy_id, objective_id, user_id) values (s_one, o_one, sam);
      insert into public.sprints (user_id, plan_id, number, start_on, length_weeks, status) values (sam, plan_s, 1, mon, 2, 'finished') returning id into spr;
      insert into public.sprint_habits (sprint_id, user_id, strategy_id, name) values (spr, sam, s_one, '036 test habit') returning id into sh;
      insert into public.sprint_habit_settings (sprint_habit_id, user_id, from_week, measure, target, target_per, limit_value, impact) values (sh, sam, 1, 'count', 3, 'week', null, 3);
      insert into public.habit_logs (user_id, sprint_habit_id, local_date, value) values (sam, sh, mon, 1), (sam, sh, mon + 1, 1), (sam, sh, mon + 2, 1), (sam, sh, mon + 3, 1);
      -- an earlier frozen week, scored under 1.1, stays as it was
      insert into public.week_scores (user_id, sprint_id, sprint_week, week_start, week_end, score, methods_version) values (sam, spr, 2, mon + 7, mon + 13, 50, '1.1');
      perform pg_temp.t_as(sam);
      perform public.freeze_week(spr, 1);
      perform pg_temp.t_admin();
      f := f || pg_temp.t_eq('8a a newly frozen week records methods 1.4',
        pg_temp.t_n(format('select methods_version from public.week_scores where sprint_id = %L and sprint_week = 1', spr)), '1.4');
      f := f || pg_temp.t_eq('8b a week frozen earlier keeps its version',
        pg_temp.t_n(format('select methods_version from public.week_scores where sprint_id = %L and sprint_week = 2', spr)), '1.1');
      insert into public.checkins (user_id, kind, month) values (sam, 'monthly', date_trunc('month', current_date)::date) returning id into ck;
      f := f || pg_temp.t_eq('8c a new check-in records methods 1.4',
        pg_temp.t_n(format('select methods_version from public.checkins where id = %L', ck)), '1.4');
      f := f || pg_temp.t_eq('8d no function still writes 1.1', pg_temp.t_n($q$
        select count(*) from pg_proc where pronamespace = 'public'::regnamespace
           and proname in ('checkins_score', 'freeze_week', 'make_one_sprint_summary', 'org_figures')
           and prosrc like '%''1.1''%'$q$), '0');
    else
      raise notice 'ok 8: skipped (no Phase 1 scores on this database).';
    end if;

    raise exception using errcode = 'TT001', message = 'undo the test';
  exception when sqlstate 'TT001' then null;
  end;
  perform pg_temp.t_admin();
  if cardinality(f) > 0 then
    raise exception 'FAILED (% of the checks): %', cardinality(f), array_to_string(f, ' | ');
  end if;
  raise notice '036 CHECKS PASSED';
end
$t$;
