-- =============================================================================
-- 047_day_plan_no_limit_test.sql: checks migration 047
--
-- Run after 047, on the test project only, inside a transaction that is
-- rolled back. To check that 047 is safe to run twice, run it twice first:
--   bash scripts/dry-run-on-test.sh supabase/migrations/047_day_plan_no_limit.sql \
--     supabase/migrations/047_day_plan_no_limit.sql supabase/047_day_plan_no_limit_test.sql
--
-- WHAT IT DOES
--   Makes one invented person with a plan, a Strategy, a sprint, eight sprint
--   habits and eight to-dos, and checks:
--   1. a day plan takes 6 to-dos and 2 habits (8 choices), in the order
--      chosen, with the 4th as the highest priority;
--   2. one or two Strategies for the day is still the rule (a third refused);
--   3. the guard limits are far beyond any day (100 habits, 200 choices,
--      100 to-dos), and an empty item is still refused;
--   4. the migration recorded itself, and the trigger still runs only as one.
--   Everything it makes is undone at the end.
--
--   It ends with the notice 047 CHECKS PASSED, or stops with FAILED and a
--   list naming each check that failed.
-- =============================================================================

create or replace function pg_temp.t_as(p uuid) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
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
  values (u, '047-test-' || p_label || '-' || u || '@example.invalid', 'authenticated', 'authenticated');
  return u;
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
  a uuid; plan_a uuid; st_a uuid; st_b uuid; st_c uuid; spr uuid; dp uuid;
  h uuid[] := '{}'; td uuid[] := '{}'; x uuid; i integer;
  picks text[];
begin
  begin
    a := pg_temp.t_user('ada');
    insert into public.performance_plans (user_id) values (a) returning id into plan_a;
    insert into public.plan_strategies (user_id, plan_id, name) values (a, plan_a, 'Grow through referrals') returning id into st_a;
    insert into public.plan_strategies (user_id, plan_id, name) values (a, plan_a, 'Ship the course') returning id into st_b;
    insert into public.plan_strategies (user_id, plan_id, name) values (a, plan_a, 'Protect deep work') returning id into st_c;
    insert into public.sprints (user_id, plan_id, number, start_on) values (a, plan_a, 1, date '2026-11-02') returning id into spr;
    for i in 1..8 loop
      insert into public.sprint_habits (sprint_id, user_id, strategy_id, name) values (spr, a, st_a, 'Habit ' || i) returning id into x;
      h := h || x;
      insert into public.todos (user_id, strategy_id, text, sprint_id, planned_week, created_on) values (a, st_a, 'To-do ' || i, spr, 3, date '2026-11-17') returning id into x;
      td := td || x;
    end loop;

    perform pg_temp.t_as(a);
    insert into public.day_plans (user_id, local_date) values (a, date '2026-11-17') returning id into dp;
    -- 1. six to-dos and two habits, the 4th the highest priority
    f := f || pg_temp.t_eq('1a six to-dos for the day', pg_temp.t_rows(format(
      'insert into public.day_plan_todos (day_plan_id, todo_id, user_id, is_top) select %L, t, %L, n = 4 from unnest(%L::uuid[]) with ordinality u(t, n) where n <= 6', dp, a, td)), '6');
    picks := array(select 'todo:' || t from unnest(td[1:6]) t) || array['habit:' || h[1], 'habit:' || h[2]];
    f := f || pg_temp.t_eq('1b two habits, with the order of all eight and the 4th on top', pg_temp.t_rows(format(
      'insert into public.day_plan_habits (user_id, local_date, habit_ids, pick_order, top_pick) values (%L, date ''2026-11-17'', %L::uuid[], %L::text[], %L)',
      a, array[h[1], h[2]], picks, 'todo:' || td[4])), '1');
    f := f || pg_temp.t_eq('1c all eight are kept, in that order', (select cardinality(pick_order)::text || ' ' || (pick_order[4] = 'todo:' || td[4])::text from public.day_plan_habits where user_id = a and local_date = date '2026-11-17'), '8 true');
    f := f || pg_temp.t_eq('1d the 4th is the one highest priority', (select count(*)::text from public.day_plan_todos where day_plan_id = dp and is_top and todo_id = td[4]), '1');
    f := f || pg_temp.t_eq('1e eight habits for a day are fine too', pg_temp.t_rows(format(
      'update public.day_plan_habits set habit_ids = %L::uuid[] where user_id = %L and local_date = date ''2026-11-17''', h, a)), '1');

    -- 2. Strategies of the day: still one or two
    f := f || pg_temp.t_eq('2a two Strategies for the day', pg_temp.t_rows(format(
      'insert into public.day_plan_strategies (day_plan_id, strategy_id, user_id) values (%L, %L, %L), (%L, %L, %L)', dp, st_a, a, dp, st_b, a)), '2');
    f := f || pg_temp.t_eq('2b a third is still refused', pg_temp.t_rows(format(
      'insert into public.day_plan_strategies (day_plan_id, strategy_id, user_id) values (%L, %L, %L)', dp, st_c, a)), 'error 23514');

    -- 3. the guard limits, and what each check still refuses
    f := f || pg_temp.t_eq('3a 201 choices are refused (the guard)', pg_temp.t_rows(format(
      'update public.day_plan_habits set pick_order = array_fill(%L::text, array[201]) where user_id = %L', 'todo:' || td[1], a)), 'error 23514');
    f := f || pg_temp.t_eq('3b an empty item in the order is still refused', pg_temp.t_rows(format(
      'update public.day_plan_habits set pick_order = array[%L, null] where user_id = %L', 'todo:' || td[1], a)), 'error 23514');
    f := f || pg_temp.t_eq('3c an empty habit is still refused', pg_temp.t_rows(format(
      'update public.day_plan_habits set habit_ids = array[%L, null]::uuid[] where user_id = %L', h[1], a)), 'error 23514');
    perform pg_temp.t_admin();
    f := f || pg_temp.t_eq('3d the guards are 100 habits, 200 choices and 100 to-dos', (
      select string_agg(conname, ',' order by conname) from pg_constraint
       where conrelid = 'public.day_plan_habits'::regclass and conname in ('day_plan_habits_many', 'day_plan_habits_order', 'day_plan_habits_three')), 'day_plan_habits_many,day_plan_habits_order');
    f := f || pg_temp.t_eq('3e the to-dos guard says 100', (select (prosrc like '%> 100%' and prosrc not like '%> 3 then%')::text from pg_proc where oid = 'public.day_plan_limits()'::regprocedure), 'true');

    -- 4. the log and the trigger
    f := f || pg_temp.t_eq('4a recorded in the migration log', (select count(*)::text from public.migration_log where number = 47), '1');
    f := f || pg_temp.t_eq('4b the limits run only as a trigger', (select has_function_privilege('authenticated', 'public.day_plan_limits()', 'execute')::text), 'false');

    raise exception using errcode = 'TT001', message = 'undo the test';
  exception when sqlstate 'TT001' then null;
  end;
  perform pg_temp.t_admin();
  if cardinality(f) > 0 then
    raise exception 'FAILED (% of the checks): %', cardinality(f), array_to_string(f, ' | ');
  end if;
  raise notice '047 CHECKS PASSED';
end
$t$;
