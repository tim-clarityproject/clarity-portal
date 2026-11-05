-- =============================================================================
-- 040_checkin_extras_and_review_way_test.sql
-- Checks 040_checkin_extras_and_review_way.sql. RUN ORDER: 026 to 029, 040, then this.
--
-- WHAT IT DOES
--   Makes two invented people (Ada and Ben) and a coach linked to Ada, and
--   checks:
--     1. the three columns and their checks are there, the drinks check
--        works on its own, and the migration recorded itself;
--     2. checkins.drinks and checkins.trip: Ada saves and changes her own,
--        with the app's own statement (a save writes over the month's row);
--        the answers and scores are worked out exactly as before; a drink
--        not on the list, more than 99 of one, a negative count, text for a
--        number or a trip not on the list are refused;
--     3. day_reviews.way_of_being: up to 120 characters, the app's save;
--     4. who sees them: Ben never reads or changes Ada's; her coach reads
--        her check-in (drinks and trip with it) only while her check-in
--        sharing switch is on, and never her day review; someone signed out
--        reads nothing.
--   Everything it makes is undone at the end.
--
--   It ends with the notice 040 CHECKS PASSED, or stops with FAILED and a
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
  values (u, 'p5-test-' || p_label || '-' || u || '@example.invalid', 'authenticated', 'authenticated');
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
  ck uuid; rev uuid;
  hw numeric; hw2 numeric;
begin
  -- 1. The columns, their checks, and the log.
  f := f || pg_temp.t_eq('1a checkins.drinks is jsonb', (select data_type from information_schema.columns where table_schema = 'public' and table_name = 'checkins' and column_name = 'drinks'), 'jsonb');
  f := f || pg_temp.t_eq('1b checkins.trip is text', (select data_type from information_schema.columns where table_schema = 'public' and table_name = 'checkins' and column_name = 'trip'), 'text');
  f := f || pg_temp.t_eq('1c day_reviews.way_of_being is text', (select data_type from information_schema.columns where table_schema = 'public' and table_name = 'day_reviews' and column_name = 'way_of_being'), 'text');
  f := f || pg_temp.t_eq('1d the three checks', (select count(*)::text from pg_constraint where conname in ('checkins_drinks_check', 'checkins_trip_check', 'day_reviews_way_of_being_check')), '3');
  f := f || pg_temp.t_eq('1e the drinks check on its own',
    (select public.checkin_drinks_ok('{"pint": 4, "wine": 2, "other": 1.5}')::text || ' ' || public.checkin_drinks_ok(null)::text || ' '
         || public.checkin_drinks_ok('{}')::text || ' ' || public.checkin_drinks_ok('{"cider": 1}')::text || ' '
         || public.checkin_drinks_ok('{"pint": 100}')::text || ' ' || public.checkin_drinks_ok('{"other": 999}')::text || ' '
         || public.checkin_drinks_ok('{"pint": -1}')::text || ' ' || public.checkin_drinks_ok('{"pint": "4"}')::text || ' '
         || public.checkin_drinks_ok('[1]')::text),
    'true true true false false true false false false');
  f := f || pg_temp.t_eq('1f the drinks check: signed in yes, signed out no', (select has_function_privilege('authenticated', 'public.checkin_drinks_ok(jsonb)', 'execute')::text || ' ' || has_function_privilege('anon', 'public.checkin_drinks_ok(jsonb)', 'execute')::text), 'true false');
  f := f || pg_temp.t_eq('1g the rules on both tables are unchanged (still on, nothing for someone signed out)',
    (select bool_and(relrowsecurity)::text from pg_class where oid in ('public.checkins'::regclass, 'public.day_reviews'::regclass)) || ' '
    || (select count(*)::text from information_schema.role_table_grants where grantee in ('anon', 'public') and table_name in ('checkins', 'day_reviews')), 'true 0');
  if to_regclass('public.migration_log') is not null then
    f := f || pg_temp.t_eq('1h the migration recorded itself', (select count(*)::text from public.migration_log where number = 40 and name = '040_checkin_extras_and_review_way'), '1');
  end if;

  begin
    a := pg_temp.t_user('ada');
    b := pg_temp.t_user('ben');
    coach_u := pg_temp.t_user('coach');
    insert into public.coaches (user_id, role, display_first_name) values (coach_u, 'coach', 'Invented') returning id into coach_c;
    insert into public.coach_clients (client_id, coach_id) values (a, coach_c);

    -- 2. checkins.drinks and checkins.trip
    perform pg_temp.t_as(a);
    f := f || pg_temp.t_eq('2a my check-in with the drinks counted and the trip',
      pg_temp.t_rows(format('insert into public.checkins (user_id, month, answers, drinks, trip) values (%L, date ''2026-10-01'', ''{"H8": "u8_14", "H14": "yes", "H15": "2"}'', ''{"pint": 4}'', ''long'')', a)), '1');
    select id, hardware_score into ck, hw from public.checkins where user_id = a and month = date '2026-10-01';
    f := f || pg_temp.t_eq('2b read back as saved', pg_temp.t_n(format('select (drinks ->> ''pint'') || '' '' || trip || '' '' || (answers ->> ''H8'') from public.checkins where id = %L', ck)), '4 long u8_14');
    f := f || pg_temp.t_eq('2c the app''s save: the same month again writes over it',
      pg_temp.t_rows(format('insert into public.checkins (user_id, month, answers, drinks, trip) values (%L, date ''2026-10-01'', ''{"H8": "u8_14", "H14": "yes", "H15": "2"}'', ''{"pint": 3, "wine": 2}'', ''long'') on conflict (user_id, month) do update set answers = excluded.answers, drinks = excluded.drinks, trip = excluded.trip', a)), '1');
    select hardware_score into hw2 from public.checkins where id = ck;
    f := f || pg_temp.t_eq('2d ... one row, with the new counts', pg_temp.t_n(format('select count(*)::text || '' '' || min(drinks ->> ''wine'') from public.checkins where user_id = %L and month = date ''2026-10-01''', a)), '1 2');
    f := f || pg_temp.t_eq('2e the scores are worked out from the answers only, as before', (hw is not distinct from hw2)::text, 'true');
    f := f || pg_temp.t_eq('2f a drink not on the list is refused', pg_temp.t_rows(format('update public.checkins set drinks = ''{"cider": 1}'' where id = %L', ck)), 'error 23514');
    f := f || pg_temp.t_eq('2g more than 99 of one drink is refused', pg_temp.t_rows(format('update public.checkins set drinks = ''{"pint": 100}'' where id = %L', ck)), 'error 23514');
    f := f || pg_temp.t_eq('2h a negative count is refused', pg_temp.t_rows(format('update public.checkins set drinks = ''{"spirit": -1}'' where id = %L', ck)), 'error 23514');
    f := f || pg_temp.t_eq('2i text for a number is refused', pg_temp.t_rows(format('update public.checkins set drinks = ''{"pint": "four"}'' where id = %L', ck)), 'error 23514');
    f := f || pg_temp.t_eq('2j "other" units up to 999 are fine', pg_temp.t_rows(format('update public.checkins set drinks = ''{"other": 999}'' where id = %L', ck)), '1');
    f := f || pg_temp.t_eq('2k None (no drinks) is an empty count', pg_temp.t_rows(format('update public.checkins set drinks = ''{}'' where id = %L', ck)), '1');
    f := f || pg_temp.t_eq('2l a trip not on the list is refused', pg_temp.t_rows(format('update public.checkins set trip = ''cruise'' where id = %L', ck)), 'error 23514');
    f := f || pg_temp.t_eq('2m each travel answer saves', pg_temp.t_rows(format('update public.checkins set trip = ''short'' where id = %L', ck)) || ' '
      || pg_temp.t_rows(format('update public.checkins set trip = ''no'' where id = %L', ck)) || ' '
      || pg_temp.t_rows(format('update public.checkins set trip = null where id = %L', ck)), '1 1 1');
    f := f || pg_temp.t_eq('2n an older check-in with no drinks still saves', pg_temp.t_rows(format('insert into public.checkins (user_id, month, answers) values (%L, date ''2026-09-01'', ''{"H8": "none"}'')', a)), '1');
    f := f || pg_temp.t_eq('2o 029 still refuses an unknown answer key', pg_temp.t_rows(format('update public.checkins set answers = ''{"_drinks": {}}'' where id = %L', ck)), 'error 22023');
    update public.checkins set drinks = '{"pint": 4}', trip = 'long' where id = ck;

    -- 3. day_reviews.way_of_being
    f := f || pg_temp.t_eq('3a my review with the way I wanted to be', pg_temp.t_rows(format('insert into public.day_reviews (user_id, local_date, way_of_being, way_of_being_rating) values (%L, date ''2026-10-21'', ''Calm under pressure'', 7)', a)), '1');
    select id into rev from public.day_reviews where user_id = a and local_date = date '2026-10-21';
    f := f || pg_temp.t_eq('3b the app''s save writes over the day''s row',
      pg_temp.t_rows(format('insert into public.day_reviews (user_id, local_date, way_of_being) values (%L, date ''2026-10-21'', ''Decisive'') on conflict (user_id, local_date) do update set way_of_being = excluded.way_of_being', a)), '1');
    f := f || pg_temp.t_eq('3c ... and keeps the rest', pg_temp.t_n(format('select way_of_being || '' '' || way_of_being_rating from public.day_reviews where id = %L', rev)), 'Decisive 7');
    f := f || pg_temp.t_eq('3d 120 characters is fine', pg_temp.t_rows(format('update public.day_reviews set way_of_being = repeat(''x'', 120) where id = %L', rev)), '1');
    f := f || pg_temp.t_eq('3e 121 is refused', pg_temp.t_rows(format('update public.day_reviews set way_of_being = repeat(''x'', 121) where id = %L', rev)), 'error 23514');

    -- 4. Who sees them.
    perform pg_temp.t_as(b);
    f := f || pg_temp.t_eq('4a someone else can''t read my drinks', pg_temp.t_n(format('select count(*)::text from public.checkins where user_id = %L and drinks is not null', a)), '0');
    f := f || pg_temp.t_eq('4b ... or change them', pg_temp.t_rows(format('update public.checkins set drinks = ''{}'' where id = %L', ck)), '0');
    f := f || pg_temp.t_eq('4c ... or read my way of being', pg_temp.t_n(format('select count(*)::text from public.day_reviews where user_id = %L', a)), '0');
    f := f || pg_temp.t_eq('4d ... or change it', pg_temp.t_rows(format('update public.day_reviews set way_of_being = ''Ben'' where id = %L', rev)), '0');
    f := f || pg_temp.t_eq('4e ... or write a check-in for me', pg_temp.t_rows(format('insert into public.checkins (user_id, month, drinks) values (%L, date ''2026-08-01'', ''{}'')', a)), 'error 42501');
    perform pg_temp.t_admin();
    insert into public.sharing_switches (user_id, part, is_on) values (a, 'checkin', false)
      on conflict (user_id, part) do update set is_on = false;
    perform pg_temp.t_as(coach_u);
    f := f || pg_temp.t_eq('4f my coach, sharing off: not my check-in', pg_temp.t_n(format('select count(*)::text from public.checkins where user_id = %L', a)), '0');
    perform pg_temp.t_admin();
    update public.sharing_switches set is_on = true where user_id = a and part = 'checkin';
    perform pg_temp.t_as(coach_u);
    f := f || pg_temp.t_eq('4g my coach, sharing on: my check-in with its drinks and trip, as with its answers', pg_temp.t_n(format('select (drinks ->> ''pint'') || '' '' || trip from public.checkins where id = %L', ck)), '4 long');
    f := f || pg_temp.t_eq('4h ... but can''t change them', pg_temp.t_rows(format('update public.checkins set drinks = ''{}'' where id = %L', ck)), '0');
    f := f || pg_temp.t_eq('4i ... and never my day review', pg_temp.t_n(format('select count(*)::text from public.day_reviews where user_id = %L', a)), '0');
    perform pg_temp.t_anon();
    f := f || pg_temp.t_eq('4j signed out: no check-ins', pg_temp.t_n('select count(*)::text from public.checkins'), 'error 42501');
    f := f || pg_temp.t_eq('4k signed out: no day reviews', pg_temp.t_n('select count(*)::text from public.day_reviews'), 'error 42501');
    perform pg_temp.t_as(a);
    f := f || pg_temp.t_eq('4l I read my own', pg_temp.t_n(format('select count(*)::text from public.checkins where user_id = %L and drinks is not null', a)), '1');

    raise exception using errcode = 'TT001', message = 'undo the test';
  exception when sqlstate 'TT001' then null;
  end;
  perform pg_temp.t_admin();
  if cardinality(f) > 0 then
    raise exception 'FAILED (% of the checks): %', cardinality(f), array_to_string(f, ' | ');
  end if;
  raise notice '040 CHECKS PASSED';
end
$t$;
