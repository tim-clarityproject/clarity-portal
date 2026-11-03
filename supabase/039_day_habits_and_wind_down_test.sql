-- =============================================================================
-- 039_day_habits_and_wind_down_test.sql
-- Checks 039_day_habits_and_wind_down.sql. RUN ORDER: 026 to 028, 039, then this.
--
-- WHAT IT DOES
--   Makes two invented people (Ada and Ben), each with a plan, a Strategy,
--   a sprint and a sprint habit, and a coach linked to Ada, and checks:
--     1. the tables are there, locked down (row security on, nothing for
--        someone signed out, own rows only) and the migration recorded
--        itself;
--     2. day_plan_habits: one row per day, three habits at most, only the
--        person's own sprint habits, the order and the highest priority as
--        the app writes them, updated_at kept by the database, the app's
--        own statements (its save, its version-checked save, moving a
--        device copy across), and nobody else reads or writes any of it;
--     3. wind_down_nights: one row per night, each thought up to 300
--        characters, the app's statements, and nobody else (nor Ada's
--        coach, nor someone signed out) reads or writes any of it;
--     4. day_reviews.tomorrow: 300 characters each, for new and changed rows;
--     5. todos.source takes 'sleep_wind_down', and still refuses anything
--        not on the list.
--   Everything it makes is undone at the end.
--
--   It ends with the notice 039 CHECKS PASSED, or stops with FAILED and a
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
  plan_a uuid; plan_b uuid; st_a uuid; st_b uuid; spr_a uuid; spr_b uuid;
  h1 uuid; h2 uuid; h3 uuid; h4 uuid; hb uuid;
  td uuid := gen_random_uuid();
  dph uuid; wdn uuid; rev uuid;
  v1 timestamptz; v2 timestamptz;
begin
  -- 1. The tables, locked down, and the log.
  f := f || pg_temp.t_eq('1a day_plan_habits has row security', (select relrowsecurity::text from pg_class where oid = 'public.day_plan_habits'::regclass), 'true');
  f := f || pg_temp.t_eq('1b wind_down_nights has row security', (select relrowsecurity::text from pg_class where oid = 'public.wind_down_nights'::regclass), 'true');
  f := f || pg_temp.t_eq('1c nothing for someone signed out', (select count(*)::text from information_schema.role_table_grants where grantee in ('anon', 'public') and table_name in ('day_plan_habits', 'wind_down_nights')), '0');
  f := f || pg_temp.t_eq('1d every rule is own rows only', (select count(*)::text from pg_policies where tablename in ('day_plan_habits', 'wind_down_nights') and coalesce(qual, with_check) not like '%auth.uid()%'), '0');
  f := f || pg_temp.t_eq('1e ... and there are eight, for signed-in people only', (select count(*)::text || ' ' || bool_and(roles = '{authenticated}')::text from pg_policies where tablename in ('day_plan_habits', 'wind_down_nights')), '8 true');
  f := f || pg_temp.t_eq('1f the habits check runs only as a trigger', (select has_function_privilege('authenticated', 'public.day_plan_habits_own()', 'execute')::text), 'false');
  f := f || pg_temp.t_eq('1g the 300-character check: signed in yes, signed out no', (select has_function_privilege('authenticated', 'public.text_items_within(text[],integer)', 'execute')::text || ' ' || has_function_privilege('anon', 'public.text_items_within(text[],integer)', 'execute')::text), 'true false');
  f := f || pg_temp.t_eq('1h the 300-character check itself', (select public.text_items_within(array[repeat('x', 300), 'y'], 300)::text || ' ' || public.text_items_within(array[repeat('x', 301)], 300)::text || ' ' || public.text_items_within('{}', 300)::text), 'true false true');
  f := f || pg_temp.t_eq('1i day_reviews has the limit', (select count(*)::text from pg_constraint where conrelid = 'public.day_reviews'::regclass and conname = 'day_reviews_tomorrow_300'), '1');
  if to_regclass('public.migration_log') is not null then
    f := f || pg_temp.t_eq('1j the migration recorded itself', (select count(*)::text from public.migration_log where number = 39 and name = '039_day_habits_and_wind_down'), '1');
  end if;

  begin
    a := pg_temp.t_user('ada');
    b := pg_temp.t_user('ben');
    insert into public.performance_plans (user_id) values (a) returning id into plan_a;
    insert into public.performance_plans (user_id) values (b) returning id into plan_b;
    insert into public.plan_strategies (user_id, plan_id, name) values (a, plan_a, 'Grow through referrals') returning id into st_a;
    insert into public.plan_strategies (user_id, plan_id, name) values (b, plan_b, 'Ship the new course') returning id into st_b;
    insert into public.sprints (user_id, plan_id, number, start_on) values (a, plan_a, 1, date '2026-09-28') returning id into spr_a;
    insert into public.sprints (user_id, plan_id, number, start_on) values (b, plan_b, 1, date '2026-09-28') returning id into spr_b;
    insert into public.sprint_habits (sprint_id, user_id, strategy_id, name) values (spr_a, a, st_a, 'Training sessions') returning id into h1;
    insert into public.sprint_habits (sprint_id, user_id, strategy_id, name) values (spr_a, a, st_a, 'Deep work blocks') returning id into h2;
    insert into public.sprint_habits (sprint_id, user_id, strategy_id, name) values (spr_a, a, st_a, 'Referral calls') returning id into h3;
    insert into public.sprint_habits (sprint_id, user_id, strategy_id, name) values (spr_a, a, st_a, 'Reading') returning id into h4;
    insert into public.sprint_habits (sprint_id, user_id, strategy_id, name) values (spr_b, b, st_b, 'Someone else''s habit') returning id into hb;
    coach_u := pg_temp.t_user('coach');
    insert into public.coaches (user_id, role, display_first_name) values (coach_u, 'coach', 'Invented') returning id into coach_c;
    insert into public.coach_clients (client_id, coach_id) values (a, coach_c);

    -- 2. day_plan_habits
    perform pg_temp.t_as(a);
    f := f || pg_temp.t_eq('2a my habit chosen for the day, with the order and the highest priority',
      pg_temp.t_rows(format('insert into public.day_plan_habits (user_id, local_date, habit_ids, pick_order, top_pick) values (%L, date ''2026-10-21'', array[%L]::uuid[], array[%L, %L], %L)',
        a, h1, 'todo:' || td, 'habit:' || h1, 'habit:' || h1)), '1');
    select id, updated_at into dph, v1 from public.day_plan_habits where user_id = a and local_date = date '2026-10-21';
    f := f || pg_temp.t_eq('2b one row per day', pg_temp.t_rows(format('insert into public.day_plan_habits (user_id, local_date) values (%L, date ''2026-10-21'')', a)), 'error 23505');
    f := f || pg_temp.t_eq('2c three habits is fine', pg_temp.t_rows(format('update public.day_plan_habits set habit_ids = array[%L, %L, %L]::uuid[] where id = %L', h1, h2, h3, dph)), '1');
    f := f || pg_temp.t_eq('2d four is refused', pg_temp.t_rows(format('update public.day_plan_habits set habit_ids = array[%L, %L, %L, %L]::uuid[] where id = %L', h1, h2, h3, h4, dph)), 'error 23514');
    f := f || pg_temp.t_eq('2e someone else''s habit is refused', pg_temp.t_rows(format('update public.day_plan_habits set habit_ids = array[%L]::uuid[] where id = %L', hb, dph)), 'error 42501');
    f := f || pg_temp.t_eq('2f ... and on a new day too', pg_temp.t_rows(format('insert into public.day_plan_habits (user_id, local_date, habit_ids) values (%L, date ''2026-10-22'', array[%L]::uuid[])', a, hb)), 'error 42501');
    f := f || pg_temp.t_eq('2g a habit that isn''t there is refused', pg_temp.t_rows(format('insert into public.day_plan_habits (user_id, local_date, habit_ids) values (%L, date ''2026-10-23'', array[gen_random_uuid()])', a)), 'error 42501');
    f := f || pg_temp.t_eq('2h a highest priority that is neither a to-do nor a habit is refused', pg_temp.t_rows(format('update public.day_plan_habits set top_pick = ''anything'' where id = %L', dph)), 'error 23514');
    f := f || pg_temp.t_eq('2i an order of seven is refused', pg_temp.t_rows(format('update public.day_plan_habits set pick_order = array_fill(%L::text, array[7]) where id = %L', 'habit:' || h1, dph)), 'error 23514');
    f := f || pg_temp.t_eq('2j the database moves updated_at on', pg_temp.t_n(format('select (updated_at >= %L)::text from public.day_plan_habits where id = %L', v1, dph)), 'true');
    -- The app's own statements (PostgREST): a save writes over the day's
    -- row; a version-checked save changes it only at the version it read;
    -- moving a device copy across never writes over a saved row.
    f := f || pg_temp.t_eq('2k the app''s save: the same day again writes over it',
      pg_temp.t_rows(format('insert into public.day_plan_habits (user_id, local_date, habit_ids, pick_order, top_pick) values (%L, date ''2026-10-21'', array[%L]::uuid[], array[%L], %L) on conflict (user_id, local_date) do update set habit_ids = excluded.habit_ids, pick_order = excluded.pick_order, top_pick = excluded.top_pick',
        a, h2, 'habit:' || h2, 'habit:' || h2)), '1');
    f := f || pg_temp.t_eq('2l ... one row, holding the new choice', pg_temp.t_n(format('select count(*)::text || '' '' || (min(habit_ids::text) = %L)::text from public.day_plan_habits where user_id = %L and local_date = date ''2026-10-21''', array[h2]::text, a)), '1 true');
    select updated_at into v2 from public.day_plan_habits where id = dph;
    f := f || pg_temp.t_eq('2m the version-checked save at the version read changes it', pg_temp.t_rows(format('update public.day_plan_habits set habit_ids = array[%L]::uuid[] where user_id = %L and local_date = date ''2026-10-21'' and updated_at = %L', h3, a, v2)), '1');
    f := f || pg_temp.t_eq('2n ... at an older version, nothing (the app shows the latest)', pg_temp.t_rows(format('update public.day_plan_habits set habit_ids = array[%L]::uuid[] where user_id = %L and local_date = date ''2026-10-21'' and updated_at = %L', h1, a, '2000-01-01')), '0');
    f := f || pg_temp.t_eq('2o moving a device copy across never writes over the saved row', pg_temp.t_rows(format('insert into public.day_plan_habits (user_id, local_date, habit_ids) values (%L, date ''2026-10-21'', array[%L]::uuid[]) on conflict (user_id, local_date) do nothing', a, h1)), '0');
    f := f || pg_temp.t_eq('2p a habit chosen earlier stays when another is added', pg_temp.t_rows(format('update public.day_plan_habits set habit_ids = array[%L, %L]::uuid[] where id = %L', h3, h4, dph)), '1');
    f := f || pg_temp.t_eq('2q written as someone else is refused', pg_temp.t_rows(format('insert into public.day_plan_habits (user_id, local_date) values (%L, date ''2026-10-21'')', b)), 'error 42501');
    perform pg_temp.t_as(b);
    f := f || pg_temp.t_eq('2r someone else can''t read it', pg_temp.t_n(format('select count(*)::text from public.day_plan_habits where user_id = %L', a)), '0');
    f := f || pg_temp.t_eq('2s ... or change it', pg_temp.t_rows(format('update public.day_plan_habits set top_pick = null where id = %L', dph)), '0');
    f := f || pg_temp.t_eq('2t ... or remove it', pg_temp.t_rows(format('delete from public.day_plan_habits where id = %L', dph)), '0');
    f := f || pg_temp.t_eq('2u ... or move it to themselves', pg_temp.t_rows(format('update public.day_plan_habits set user_id = %L where id = %L', b, dph)), '0');
    f := f || pg_temp.t_eq('2v ... or write a day for me', pg_temp.t_rows(format('insert into public.day_plan_habits (user_id, local_date) values (%L, date ''2026-10-25'')', a)), 'error 42501');
    perform pg_temp.t_as(coach_u);
    f := f || pg_temp.t_eq('2w my coach reads none of it', pg_temp.t_n(format('select count(*)::text from public.day_plan_habits where user_id = %L', a)), '0');
    perform pg_temp.t_anon();
    f := f || pg_temp.t_eq('2x signed out: nothing', pg_temp.t_n('select count(*)::text from public.day_plan_habits'), 'error 42501');
    f := f || pg_temp.t_eq('2y signed out: no writing', pg_temp.t_rows(format('insert into public.day_plan_habits (user_id, local_date) values (%L, date ''2026-10-26'')', a)), 'error 42501');
    perform pg_temp.t_as(a);
    f := f || pg_temp.t_eq('2z I can remove my own', pg_temp.t_rows(format('delete from public.day_plan_habits where id = %L', dph)), '1');

    -- 3. wind_down_nights
    perform pg_temp.t_as(a);
    f := f || pg_temp.t_eq('3a my thoughts for the night', pg_temp.t_rows(format('insert into public.wind_down_nights (user_id, night, thoughts) values (%L, date ''2026-10-21'', array[''Call Evan before 09:00'', ''Book a day off''])', a)), '1');
    select id, updated_at into wdn, v1 from public.wind_down_nights where user_id = a and night = date '2026-10-21';
    f := f || pg_temp.t_eq('3b the sound is off until chosen', pg_temp.t_n(format('select sound from public.wind_down_nights where id = %L', wdn)), 'off');
    f := f || pg_temp.t_eq('3c one row per night', pg_temp.t_rows(format('insert into public.wind_down_nights (user_id, night) values (%L, date ''2026-10-21'')', a)), 'error 23505');
    f := f || pg_temp.t_eq('3d a thought of 300 characters is fine', pg_temp.t_rows(format('update public.wind_down_nights set thoughts = array[repeat(''x'', 300), ''Short''] where id = %L', wdn)), '1');
    f := f || pg_temp.t_eq('3e 301 is refused', pg_temp.t_rows(format('update public.wind_down_nights set thoughts = array[''Short'', repeat(''x'', 301)] where id = %L', wdn)), 'error 23514');
    f := f || pg_temp.t_eq('3f an empty item is refused', pg_temp.t_rows(format('update public.wind_down_nights set thoughts = array[''Short'', null] where id = %L', wdn)), 'error 23514');
    f := f || pg_temp.t_eq('3g many thoughts are fine', pg_temp.t_rows(format('update public.wind_down_nights set thoughts = array_fill(''A thought''::text, array[40]) where id = %L', wdn)), '1');
    f := f || pg_temp.t_eq('3h finished, and the database moves updated_at on', pg_temp.t_rows(format('update public.wind_down_nights set finished_at = now() where id = %L', wdn)), '1');
    f := f || pg_temp.t_eq('3i ... (updated_at)', pg_temp.t_n(format('select (updated_at >= %L)::text from public.wind_down_nights where id = %L', v1, wdn)), 'true');
    f := f || pg_temp.t_eq('3j the app''s save: the same night again writes over it',
      pg_temp.t_rows(format('insert into public.wind_down_nights (user_id, night, thoughts, sound, finished_at) values (%L, date ''2026-10-21'', array[''Saved again''], ''off'', null) on conflict (user_id, night) do update set thoughts = excluded.thoughts, sound = excluded.sound, finished_at = excluded.finished_at', a)), '1');
    f := f || pg_temp.t_eq('3k ... one row', pg_temp.t_n(format('select count(*)::text || '' '' || min(thoughts[1]) from public.wind_down_nights where user_id = %L and night = date ''2026-10-21''', a)), '1 Saved again');
    f := f || pg_temp.t_eq('3l moving a device copy across never writes over the saved night', pg_temp.t_rows(format('insert into public.wind_down_nights (user_id, night, thoughts) values (%L, date ''2026-10-21'', array[''From the device'']) on conflict (user_id, night) do nothing', a)), '0');
    f := f || pg_temp.t_eq('3m ... and a night not saved yet is moved', pg_temp.t_rows(format('insert into public.wind_down_nights (user_id, night, thoughts) values (%L, date ''2026-10-20'', array[''From the device'']) on conflict (user_id, night) do nothing', a)), '1');
    f := f || pg_temp.t_eq('3n written as someone else is refused', pg_temp.t_rows(format('insert into public.wind_down_nights (user_id, night) values (%L, date ''2026-10-21'')', b)), 'error 42501');
    perform pg_temp.t_as(b);
    f := f || pg_temp.t_eq('3o someone else can''t read my thoughts', pg_temp.t_n(format('select count(*)::text from public.wind_down_nights where user_id = %L', a)), '0');
    f := f || pg_temp.t_eq('3p ... or change them', pg_temp.t_rows(format('update public.wind_down_nights set thoughts = ''{}'' where id = %L', wdn)), '0');
    f := f || pg_temp.t_eq('3q ... or remove them', pg_temp.t_rows(format('delete from public.wind_down_nights where id = %L', wdn)), '0');
    f := f || pg_temp.t_eq('3r ... or move them to themselves', pg_temp.t_rows(format('update public.wind_down_nights set user_id = %L where id = %L', b, wdn)), '0');
    f := f || pg_temp.t_eq('3s ... or write a night for me', pg_temp.t_rows(format('insert into public.wind_down_nights (user_id, night) values (%L, date ''2026-10-25'')', a)), 'error 42501');
    perform pg_temp.t_as(coach_u);
    f := f || pg_temp.t_eq('3t my coach reads none of it', pg_temp.t_n(format('select count(*)::text from public.wind_down_nights where user_id = %L', a)), '0');
    perform pg_temp.t_anon();
    f := f || pg_temp.t_eq('3u signed out: nothing', pg_temp.t_n('select count(*)::text from public.wind_down_nights'), 'error 42501');
    f := f || pg_temp.t_eq('3v signed out: no writing', pg_temp.t_rows(format('insert into public.wind_down_nights (user_id, night) values (%L, date ''2026-10-26'')', a)), 'error 42501');
    perform pg_temp.t_as(a);
    f := f || pg_temp.t_eq('3w I read my own nights', pg_temp.t_n(format('select count(*)::text from public.wind_down_nights where user_id = %L', a)), '2');
    f := f || pg_temp.t_eq('3x I can remove my own', pg_temp.t_rows(format('delete from public.wind_down_nights where id = %L', wdn)), '1');

    -- 4. day_reviews.tomorrow: 300 characters each.
    f := f || pg_temp.t_eq('4a three things for tomorrow, 300 characters each', pg_temp.t_rows(format('insert into public.day_reviews (user_id, local_date, tomorrow) values (%L, date ''2026-10-21'', array[repeat(''x'', 300), ''Call Evan'', ''Book a day off''])', a)), '1');
    select id into rev from public.day_reviews where user_id = a and local_date = date '2026-10-21';
    f := f || pg_temp.t_eq('4b 301 is refused', pg_temp.t_rows(format('update public.day_reviews set tomorrow = array[repeat(''x'', 301)] where id = %L', rev)), 'error 23514');
    f := f || pg_temp.t_eq('4c ... on a new review too', pg_temp.t_rows(format('insert into public.day_reviews (user_id, local_date, tomorrow) values (%L, date ''2026-10-22'', array[repeat(''x'', 301)])', a)), 'error 23514');
    f := f || pg_temp.t_eq('4d still three at most (028)', pg_temp.t_rows(format('update public.day_reviews set tomorrow = array[''a'', ''b'', ''c'', ''d''] where id = %L', rev)), 'error 23514');

    -- 5. todos.source
    f := f || pg_temp.t_eq('5a a to-do from last night''s sleep wind down', pg_temp.t_rows(format('insert into public.todos (user_id, strategy_id, text, source) values (%L, %L, ''Book a day off'', ''sleep_wind_down'')', a, st_a)), '1');
    f := f || pg_temp.t_eq('5b the older sources still save', pg_temp.t_rows(format('insert into public.todos (user_id, strategy_id, text, source) values (%L, %L, ''From another tool'', ''other_tool'')', a, st_a)), '1');
    f := f || pg_temp.t_eq('5c a source not on the list is refused', pg_temp.t_rows(format('insert into public.todos (user_id, strategy_id, text, source) values (%L, %L, ''Nowhere'', ''nowhere'')', a, st_a)), 'error 23514');
    perform pg_temp.t_admin();
    f := f || pg_temp.t_eq('5d one source check on todos', (select count(*)::text from pg_constraint where conrelid = 'public.todos'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%other_tool%'), '1');

    raise exception using errcode = 'TT001', message = 'undo the test';
  exception when sqlstate 'TT001' then null;
  end;
  perform pg_temp.t_admin();
  if cardinality(f) > 0 then
    raise exception 'FAILED (% of the checks): %', cardinality(f), array_to_string(f, ' | ');
  end if;
  raise notice '039 CHECKS PASSED';
end
$t$;
