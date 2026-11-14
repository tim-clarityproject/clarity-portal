-- =============================================================================
-- 043_tool_answers_test.sql
-- Checks 043_tool_answers.sql. RUN ORDER: 026, 043, then this.
--
-- WHAT IT DOES
--   Makes two invented people (Ada and Ben) and a coach linked to Ada, and checks:
--     1. the table is there, locked down (row security on, nothing for
--        someone signed out, own rows only) and the migration recorded itself;
--     2. a Team performance check saves as the app saves it (its own
--        statement, a draft written over itself, then completed), only the
--        two tools and the two statuses are taken, the answers must be an
--        object, and the name is 200 characters at most;
--     3. an Emotional wash can never be marked as shared;
--     4. nobody else (Ben, Ada's coach even when it is marked "You and
--        coach", someone signed out) reads, changes, removes or adds any of it;
--     5. the person removes their own, and it goes with their account.
--   Everything it makes is undone at the end.
--
--   It ends with the notice 043 CHECKS PASSED, or stops with FAILED and a
--   list naming each check that failed.
-- =============================================================================
-- ---------------------------------------------------------------- helpers
-- Temporary (this session only), as in the earlier tests: t_as acts as a
-- signed-in person, t_anon as someone signed out, t_admin goes back to the
-- admin role; t_n and t_rows return 'error <code>' instead of stopping
-- (42501 refused, 23505 a second copy, 23514 a check).
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
create or replace function pg_temp.t_admin() returns void language plpgsql as $f$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
end $f$;
create or replace function pg_temp.t_user(p_label text) returns uuid language plpgsql as $f$
declare u uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, aud, role)
  values (u, 'p4-test-' || p_label || '-' || u || '@example.invalid', 'authenticated', 'authenticated');
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
  a uuid; b uuid; coach_u uuid; coach_c uuid;
  r1 uuid := gen_random_uuid();
  r2 uuid := gen_random_uuid();
  v1 timestamptz;
  answers text := '{"version":1,"people":[{"id":"p1","name":"Priya Shah","role":"Head of Operations","trust":5,"alignment":4,"autonomy":4}],"last":null}';
  save_sql text := 'insert into public.tool_answers (id, user_id, tool, title, status, answers, shared_with_coach, finished_at, created_at, updated_at) values (%L, %L, ''team_check'', ''November team check'', %L, %L::jsonb, %L, %s, now(), now()) on conflict (id) do update set title = excluded.title, status = excluded.status, answers = excluded.answers, shared_with_coach = excluded.shared_with_coach, finished_at = excluded.finished_at, updated_at = excluded.updated_at';
begin
  -- 1. The table, locked down, and the log.
  f := f || pg_temp.t_eq('1a tool_answers has row security', (select relrowsecurity::text from pg_class where oid = 'public.tool_answers'::regclass), 'true');
  f := f || pg_temp.t_eq('1b nothing for someone signed out', (select count(*)::text from information_schema.role_table_grants where grantee in ('anon', 'public') and table_name = 'tool_answers'), '0');
  f := f || pg_temp.t_eq('1c every rule is own rows only', (select count(*)::text from pg_policies where tablename = 'tool_answers' and coalesce(qual, with_check) not like '%auth.uid()%'), '0');
  f := f || pg_temp.t_eq('1d ... and there are four, for signed-in people only', (select count(*)::text || ' ' || bool_and(roles = '{authenticated}')::text from pg_policies where tablename = 'tool_answers'), '4 true');
  f := f || pg_temp.t_eq('1e signed-in people may read, add, change and remove, nothing more', (select string_agg(privilege_type, ',' order by privilege_type) from information_schema.role_table_grants where grantee = 'authenticated' and table_name = 'tool_answers'), 'DELETE,INSERT,SELECT,UPDATE');
  if to_regclass('public.migration_log') is not null then
    f := f || pg_temp.t_eq('1f the migration recorded itself, once', (select count(*)::text from public.migration_log where number = 43 and name = '043_tool_answers'), '1');
  end if;

  begin
    a := pg_temp.t_user('ada');
    b := pg_temp.t_user('ben');
    coach_u := pg_temp.t_user('coach');
    if to_regclass('public.coaches') is not null then
      insert into public.coaches (user_id, role, display_first_name) values (coach_u, 'coach', 'Invented') returning id into coach_c;
      insert into public.coach_clients (client_id, coach_id) values (a, coach_c);
    end if;

    -- 2. A Team performance check, as the app saves it.
    perform pg_temp.t_as(a);
    f := f || pg_temp.t_eq('2a the app''s save: a draft', pg_temp.t_rows(format(save_sql, r1, a, 'draft', answers, false, 'null')), '1');
    select updated_at into v1 from public.tool_answers where id = r1;
    f := f || pg_temp.t_eq('2b the same item again writes over itself, completed and shared', pg_temp.t_rows(format(save_sql, r1, a, 'completed', answers, true, 'now()')), '1');
    f := f || pg_temp.t_eq('2c ... one row, completed, with the answers as saved', pg_temp.t_n(format('select count(*)::text || '' '' || min(status) || '' '' || min(answers #>> ''{people,0,name}'') || '' '' || (min(finished_at) is not null)::text from public.tool_answers where user_id = %L', a)), '1 completed Priya Shah true');
    f := f || pg_temp.t_eq('2d updated_at never goes back', pg_temp.t_n(format('select (updated_at >= %L)::text from public.tool_answers where id = %L', v1, r1)), 'true');
    f := f || pg_temp.t_eq('2e a tool not on the list is refused', pg_temp.t_rows(format('insert into public.tool_answers (user_id, tool) values (%L, ''something_else'')', a)), 'error 23514');
    f := f || pg_temp.t_eq('2f a status not on the list is refused', pg_temp.t_rows(format('update public.tool_answers set status = ''finished'' where id = %L', r1)), 'error 23514');
    f := f || pg_temp.t_eq('2g answers that are a list are refused', pg_temp.t_rows(format('update public.tool_answers set answers = ''[]''::jsonb where id = %L', r1)), 'error 23514');
    f := f || pg_temp.t_eq('2h a name of 200 characters is fine', pg_temp.t_rows(format('update public.tool_answers set title = repeat(''x'', 200) where id = %L', r1)), '1');
    f := f || pg_temp.t_eq('2i 201 is refused', pg_temp.t_rows(format('update public.tool_answers set title = repeat(''x'', 201) where id = %L', r1)), 'error 23514');
    f := f || pg_temp.t_eq('2j answers far too large are refused', pg_temp.t_rows(format('update public.tool_answers set answers = jsonb_build_object(''x'', (select string_agg(md5(g::text), ''-'') from generate_series(1, 9000) g)) where id = %L', r1)), 'error 23514');
    f := f || pg_temp.t_eq('2k written as someone else is refused', pg_temp.t_rows(format('insert into public.tool_answers (user_id, tool) values (%L, ''team_check'')', b)), 'error 42501');

    -- 3. The Emotional wash is private.
    f := f || pg_temp.t_eq('3a an Emotional wash saves', pg_temp.t_rows(format('insert into public.tool_answers (id, user_id, tool, title, answers) values (%L, %L, ''emotional_wash'', ''Emotional wash'', ''{}''::jsonb)', r2, a)), '1');
    f := f || pg_temp.t_eq('3b ... and can never be marked as shared', pg_temp.t_rows(format('update public.tool_answers set shared_with_coach = true where id = %L', r2)), 'error 23514');
    f := f || pg_temp.t_eq('3c ... on a new one either', pg_temp.t_rows(format('insert into public.tool_answers (user_id, tool, shared_with_coach) values (%L, ''emotional_wash'', true)', a)), 'error 23514');
    f := f || pg_temp.t_eq('3d I read my own two', pg_temp.t_n(format('select count(*)::text from public.tool_answers where user_id = %L', a)), '2');

    -- 4. Nobody else.
    perform pg_temp.t_as(b);
    f := f || pg_temp.t_eq('4a someone else can''t read it', pg_temp.t_n(format('select count(*)::text from public.tool_answers where user_id = %L', a)), '0');
    f := f || pg_temp.t_eq('4b ... or change it', pg_temp.t_rows(format('update public.tool_answers set title = ''Mine now'' where id = %L', r1)), '0');
    f := f || pg_temp.t_eq('4c ... or remove it', pg_temp.t_rows(format('delete from public.tool_answers where id = %L', r1)), '0');
    f := f || pg_temp.t_eq('4d ... or move it to themselves', pg_temp.t_rows(format('update public.tool_answers set user_id = %L where id = %L', b, r1)), '0');
    f := f || pg_temp.t_eq('4e ... or add one for me', pg_temp.t_rows(format('insert into public.tool_answers (user_id, tool) values (%L, ''team_check'')', a)), 'error 42501');
    f := f || pg_temp.t_eq('4f ... or save over mine by its id', pg_temp.t_rows(format(save_sql, r1, b, 'draft', answers, false, 'null')), 'error 42501');
    perform pg_temp.t_as(coach_u);
    f := f || pg_temp.t_eq('4g my coach reads none of it, even one marked "You and coach"', pg_temp.t_n(format('select count(*)::text from public.tool_answers where user_id = %L', a)), '0');
    perform pg_temp.t_anon();
    f := f || pg_temp.t_eq('4h signed out: nothing', pg_temp.t_n('select count(*)::text from public.tool_answers'), 'error 42501');
    f := f || pg_temp.t_eq('4i signed out: no writing', pg_temp.t_rows(format('insert into public.tool_answers (user_id, tool) values (%L, ''team_check'')', a)), 'error 42501');

    -- 5. Removing.
    perform pg_temp.t_as(a);
    f := f || pg_temp.t_eq('5a the app''s delete takes my own away', pg_temp.t_rows(format('delete from public.tool_answers where id = %L and user_id = %L', r1, a)), '1');
    perform pg_temp.t_admin();
    delete from auth.users where id = a;
    f := f || pg_temp.t_eq('5b the rest goes with the account', (select count(*)::text from public.tool_answers where user_id = a), '0');

    raise exception using errcode = 'TT001', message = 'undo the test';
  exception when sqlstate 'TT001' then null;
  end;
  perform pg_temp.t_admin();
  if cardinality(f) > 0 then
    raise exception 'FAILED (% of the checks): %', cardinality(f), array_to_string(f, ' | ');
  end if;
  raise notice '043 CHECKS PASSED';
end
$t$;
