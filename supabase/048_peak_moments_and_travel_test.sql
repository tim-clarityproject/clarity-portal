-- =============================================================================
-- 048_peak_moments_and_travel_test.sql
-- Checks 048_peak_moments_and_travel.sql. RUN ORDER: 026, 028, 048, then this.
--
-- WHAT IT DOES
--   Makes two invented people (Ada and Ben) and a coach linked to Ada, and checks:
--     1. the seven tables are there and locked down (row security on,
--        nothing for someone signed out, own rows, a coach's three rules
--        only) and the migration recorded itself;
--     2. peak moments save as the app saves them (a day at home, two days
--        in New York repeating monthly, a shared one), the checks refuse
--        what can't be kept (a personal moment shared, a stop day that
--        isn't a real day or comes before the start), there is no limit,
--        and one review per day;
--     3. a Travel plan with its flights (landing from 2 days before to 3
--        days after the day it leaves, as the app allows), key moment, tick,
--        away flag and no-caffeine choice;
--     4. nobody points at, reads, changes or removes another person's;
--     5. a coach reads only shared work moments, their reviews and the away
--        flag, never the plan, its flights, key moments or ticks;
--     6. someone signed out reads nothing;
--     7. todos take the source peak_moment, and everything goes with the account.
--   Everything it makes is undone at the end.
--
--   It ends with the notice 048 CHECKS PASSED, or stops with FAILED and a
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
  values (u, 'p8b-test-' || p_label || '-' || u || '@example.invalid', 'authenticated', 'authenticated');
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
  m1 uuid := gen_random_uuid(); m2 uuid := gen_random_uuid(); m3 uuid := gen_random_uuid();
  p1 uuid := gen_random_uuid(); p2 uuid := gen_random_uuid();
  tbl text;
begin
  -- 1. The tables, locked down, and the log.
  foreach tbl in array array['peak_moments', 'peak_reviews', 'travel_plans', 'travel_flights', 'travel_plan_moments', 'travel_ticks', 'travel_away'] loop
    f := f || pg_temp.t_eq('1a ' || tbl || ' has row security', (select relrowsecurity::text from pg_class where oid = ('public.' || tbl)::regclass), 'true');
    f := f || pg_temp.t_eq('1b ' || tbl || ': nothing for someone signed out', (select count(*)::text from information_schema.role_table_grants where grantee in ('anon', 'public') and table_name = tbl), '0');
    f := f || pg_temp.t_eq('1c ' || tbl || ': signed-in people may read, add, change and remove, nothing more', (select string_agg(privilege_type, ',' order by privilege_type) from information_schema.role_table_grants where grantee = 'authenticated' and table_name = tbl), 'DELETE,INSERT,SELECT,UPDATE');
    f := f || pg_temp.t_eq('1d ' || tbl || ': every rule is for signed-in people and asks who they are', (select count(*)::text from pg_policies where tablename = tbl and (roles <> '{authenticated}' or coalesce(qual, with_check) not like '%auth.uid()%' and coalesce(qual, '') not like '%is_coach_of%')), '0');
  end loop;
  f := f || pg_temp.t_eq('1e a coach may read only shared moments, their reviews and the away flag', (select string_agg(tablename, ',' order by tablename) from pg_policies where policyname like 'Coach:%' and tablename in ('peak_moments', 'peak_reviews', 'travel_plans', 'travel_flights', 'travel_plan_moments', 'travel_ticks', 'travel_away')), 'peak_moments,peak_reviews,travel_away');
  if to_regclass('public.migration_log') is not null then
    f := f || pg_temp.t_eq('1f the migration recorded itself, once', (select count(*)::text from public.migration_log where number = 48 and name = '048_peak_moments_and_travel'), '1');
  end if;

  begin
    a := pg_temp.t_user('ada');
    b := pg_temp.t_user('ben');
    coach_u := pg_temp.t_user('coach');
    insert into public.coaches (user_id, role, display_first_name) values (coach_u, 'coach', 'Invented') returning id into coach_c;
    insert into public.coach_clients (client_id, coach_id) values (a, coach_c);

    -- 2. Peak moments as the app saves them.
    perform pg_temp.t_as(a);
    f := f || pg_temp.t_eq('2a a work moment for one day, at home', pg_temp.t_rows(format('insert into public.peak_moments (id, user_id, name, area, kind, starts_on, ends_on) values (%L, %L, ''Board meeting'', ''work'', ''perform'', ''2026-11-20'', ''2026-11-20'')', m1, a)), '1');
    f := f || pg_temp.t_eq('2b a personal one in New York, two days, repeating monthly', pg_temp.t_rows(format('insert into public.peak_moments (id, user_id, name, area, kind, starts_on, ends_on, place_city, place_zone, repeat_rule) values (%L, %L, ''Family weekend'', ''personal'', ''present'', ''2026-11-21'', ''2026-11-22'', ''New York'', ''America/New_York'', ''{"every":"month_date"}''::jsonb)', m2, a)), '1');
    f := f || pg_temp.t_eq('2c a shared one', pg_temp.t_rows(format('insert into public.peak_moments (id, user_id, name, kind, starts_on, ends_on, shared) values (%L, %L, ''Keynote'', ''perform'', ''2026-12-02'', ''2026-12-02'', true)', m3, a)), '1');
    f := f || pg_temp.t_eq('2d an empty name is refused', pg_temp.t_rows(format('insert into public.peak_moments (user_id, name, starts_on, ends_on) values (%L, ''  '', ''2026-11-20'', ''2026-11-20'')', a)), 'error 23514');
    f := f || pg_temp.t_eq('2e an end before the start is refused', pg_temp.t_rows(format('insert into public.peak_moments (user_id, name, starts_on, ends_on) values (%L, ''X'', ''2026-11-20'', ''2026-11-19'')', a)), 'error 23514');
    f := f || pg_temp.t_eq('2f a zone as an offset is refused', pg_temp.t_rows(format('update public.peak_moments set place_zone = ''-05:00'' where id = %L', m2)), 'error 23514');
    f := f || pg_temp.t_eq('2g a city without its zone is refused', pg_temp.t_rows(format('update public.peak_moments set place_zone = null where id = %L', m2)), 'error 23514');
    f := f || pg_temp.t_eq('2h a repeat that isn''t a rule is refused', pg_temp.t_rows(format('update public.peak_moments set repeat_rule = ''{"every":"daily"}''::jsonb where id = %L', m2)), 'error 23514');
    f := f || pg_temp.t_eq('2i a repeat with an end date is fine', pg_temp.t_rows(format('update public.peak_moments set repeat_rule = ''{"every":"month_weekday","until":"2027-06-30"}''::jsonb where id = %L', m2)), '1');
    f := f || pg_temp.t_eq('2j no limit: a hundred more save', pg_temp.t_rows(format('insert into public.peak_moments (user_id, name, starts_on, ends_on) select %L, ''Moment '' || g, ''2027-01-01''::date + g, ''2027-01-01''::date + g from generate_series(1, 100) g', a)), '100');
    f := f || pg_temp.t_eq('2k written as someone else is refused', pg_temp.t_rows(format('insert into public.peak_moments (user_id, name, starts_on, ends_on) values (%L, ''X'', ''2026-11-20'', ''2026-11-20'')', b)), 'error 42501');
    f := f || pg_temp.t_eq('2l a review after, once per day it comes round', pg_temp.t_rows(format('insert into public.peak_reviews (user_id, moment_id, occurs_on, answer, lesson) values (%L, %L, ''2026-11-20'', ''well'', ''Sleep early the night before.'')', a, m1)), '1');
    f := f || pg_temp.t_eq('2m a second review of the same day is refused', pg_temp.t_rows(format('insert into public.peak_reviews (user_id, moment_id, occurs_on, answer) values (%L, %L, ''2026-11-20'', ''well'')', a, m1)), 'error 23505');
    f := f || pg_temp.t_eq('2n a personal moment can''t be shared', pg_temp.t_rows(format('update public.peak_moments set shared = true where id = %L', m2)), 'error 23514');
    f := f || pg_temp.t_eq('2o ... nor saved shared', pg_temp.t_rows(format('insert into public.peak_moments (user_id, name, area, starts_on, ends_on, shared) values (%L, ''X'', ''personal'', ''2026-11-20'', ''2026-11-20'', true)', a)), 'error 23514');
    f := f || pg_temp.t_eq('2p a stop day that doesn''t exist is refused', pg_temp.t_rows(format('update public.peak_moments set repeat_rule = ''{"every":"week","until":"2027-02-30"}''::jsonb where id = %L', m2)), 'error 23514');
    f := f || pg_temp.t_eq('2q a stop day before the start is refused', pg_temp.t_rows(format('update public.peak_moments set repeat_rule = ''{"every":"week","until":"2026-11-01"}''::jsonb where id = %L', m2)), 'error 23514');
    f := f || pg_temp.t_eq('2r a stop day on the start day is fine', pg_temp.t_rows(format('update public.peak_moments set repeat_rule = ''{"every":"week","until":"2026-11-21"}''::jsonb where id = %L', m2)), '1');
    f := f || pg_temp.t_eq('2s a later start past its stop day is refused', pg_temp.t_rows(format('update public.peak_moments set starts_on = ''2026-11-28'', ends_on = ''2026-11-29'' where id = %L', m2)), 'error 23514');

    -- 3. A Travel plan.
    f := f || pg_temp.t_eq('3a a plan', pg_temp.t_rows(format('insert into public.travel_plans (id, user_id, title, sleep_start, sleep_end) values (%L, %L, ''New York trip'', ''22:30'', ''07:00'')', p1, a)), '1');
    f := f || pg_temp.t_eq('3b its flights', pg_temp.t_rows(format('insert into public.travel_flights (user_id, plan_id, leg, sort_order, departs_on, departs_at, from_city, from_zone, arrives_on, arrives_at, to_city, to_zone) values (%1$L, %2$L, ''out'', 0, ''2026-11-08'', ''11:00'', ''London'', ''Europe/London'', ''2026-11-08'', ''14:00'', ''New York'', ''America/New_York''), (%1$L, %2$L, ''home'', 1, ''2026-11-12'', ''19:00'', ''New York'', ''America/New_York'', ''2026-11-13'', ''07:00'', ''London'', ''Europe/London'')', a, p1)), '2');
    f := f || pg_temp.t_eq('3c its key moment', pg_temp.t_rows(format('insert into public.travel_plan_moments (plan_id, moment_id, user_id) values (%L, %L, %L)', p1, m2, a)), '1');
    f := f || pg_temp.t_eq('3d a tick and the away flag', pg_temp.t_rows(format('with t as (insert into public.travel_ticks (plan_id, user_id, day, step) values (%1$L, %2$L, ''2026-11-09'', ''light'') returning 1), w as (insert into public.travel_away (plan_id, user_id, city, zone, starts_on, ends_on, hours_apart) values (%1$L, %2$L, ''New York'', ''America/New_York'', ''2026-11-08'', ''2026-11-13'', -5) returning 1) select 1 from t, w', p1, a)), '1');
    f := f || pg_temp.t_eq('3e no caffeine', pg_temp.t_rows(format('update public.travel_plans set no_caffeine = true where id = %L', p1)), '1');
    f := f || pg_temp.t_eq('3g a flight landing 3 days after the day it leaves (30 hours, across the date line) saves', pg_temp.t_rows(format('insert into public.travel_flights (user_id, plan_id, leg, departs_on, departs_at, from_city, from_zone, arrives_on, arrives_at, to_city, to_zone) values (%L, %L, ''between'', ''2026-11-08'', ''23:30'', ''Honolulu'', ''Pacific/Honolulu'', ''2026-11-11'', ''05:30'', ''Kiritimati'', ''Pacific/Kiritimati'')', a, p1)), '1');
    f := f || pg_temp.t_eq('3h ... one landing 2 days before it, across the date line the other way, saves', pg_temp.t_rows(format('insert into public.travel_flights (user_id, plan_id, leg, departs_on, departs_at, from_city, from_zone, arrives_on, arrives_at, to_city, to_zone) values (%L, %L, ''between'', ''2026-11-10'', ''00:30'', ''Kiritimati'', ''Pacific/Kiritimati'', ''2026-11-08'', ''23:30'', ''Pago Pago'', ''Pacific/Pago_Pago'')', a, p1)), '1');
    f := f || pg_temp.t_eq('3i ... and 4 days after is refused', pg_temp.t_rows(format('insert into public.travel_flights (user_id, plan_id, leg, departs_on, departs_at, from_city, from_zone, arrives_on, arrives_at, to_city, to_zone) values (%L, %L, ''between'', ''2026-11-08'', ''11:00'', ''London'', ''Europe/London'', ''2026-11-12'', ''14:00'', ''New York'', ''America/New_York'')', a, p1)), 'error 23514');
    f := f || pg_temp.t_eq('3f a flight on a leg not on the list is refused', pg_temp.t_rows(format('insert into public.travel_flights (user_id, plan_id, leg, departs_on, departs_at, from_city, from_zone, arrives_on, arrives_at, to_city, to_zone) values (%L, %L, ''sideways'', ''2026-11-08'', ''11:00'', ''London'', ''Europe/London'', ''2026-11-08'', ''14:00'', ''New York'', ''America/New_York'')', a, p1)), 'error 23514');

    -- 4. Another person's plan or moment can't be pointed at.
    perform pg_temp.t_as(b);
    f := f || pg_temp.t_eq('4a Ben makes his own plan', pg_temp.t_rows(format('insert into public.travel_plans (id, user_id) values (%L, %L)', p2, b)), '1');
    f := f || pg_temp.t_eq('4b ... but can''t tick Ada''s', pg_temp.t_rows(format('insert into public.travel_ticks (plan_id, user_id, day, step) values (%L, %L, ''2026-11-09'', ''light'')', p1, b)), 'error 42501');
    f := f || pg_temp.t_eq('4c ... or link Ada''s moment to his plan', pg_temp.t_rows(format('insert into public.travel_plan_moments (plan_id, moment_id, user_id) values (%L, %L, %L)', p2, m1, b)), 'error 42501');
    f := f || pg_temp.t_eq('4d ... or review Ada''s moment', pg_temp.t_rows(format('insert into public.peak_reviews (user_id, moment_id, occurs_on, answer) values (%L, %L, ''2026-11-21'', ''yes'')', b, m1)), 'error 42501');
    f := f || pg_temp.t_eq('4e ... and reads none of Ada''s', pg_temp.t_n(format('select ((select count(*) from public.peak_moments where user_id = %1$L) + (select count(*) from public.travel_plans where user_id = %1$L) + (select count(*) from public.travel_away where user_id = %1$L) + (select count(*) from public.travel_ticks where user_id = %1$L))::text', a)), '0');
    f := f || pg_temp.t_eq('4f ... or changes or removes them', pg_temp.t_rows(format('with u as (update public.peak_moments set name = ''Mine'' where id = %L returning 1), d as (delete from public.travel_plans where id = %L returning 1) select 1 from u union all select 1 from d', m1, p1)), '0');

    -- 5. The coach: shared moments, their reviews and the away flag only.
    perform pg_temp.t_as(coach_u);
    f := f || pg_temp.t_eq('5a the coach reads only the shared moment', pg_temp.t_n(format('select string_agg(name, '','') from public.peak_moments where user_id = %L', a)), 'Keynote');
    f := f || pg_temp.t_eq('5b ... never the personal one in New York', pg_temp.t_n(format('select count(*)::text from public.peak_moments where id = %L', m2)), '0');
    f := f || pg_temp.t_eq('5c ... no review of an unshared moment', pg_temp.t_n(format('select count(*)::text from public.peak_reviews where user_id = %L', a)), '0');
    f := f || pg_temp.t_eq('5d ... the away flag', pg_temp.t_n(format('select city || '' '' || hours_apart::text from public.travel_away where user_id = %L', a)), 'New York -5.00');
    f := f || pg_temp.t_eq('5e ... never the plan, its flights, its key moments or its ticks', pg_temp.t_n(format('select ((select count(*) from public.travel_plans where user_id = %1$L) + (select count(*) from public.travel_flights where user_id = %1$L) + (select count(*) from public.travel_plan_moments where user_id = %1$L) + (select count(*) from public.travel_ticks where user_id = %1$L))::text', a)), '0');
    f := f || pg_temp.t_eq('5f ... and changes nothing', pg_temp.t_rows(format('update public.peak_moments set name = ''Coach'' where id = %L', m3)), '0');
    perform pg_temp.t_as(a);
    update public.peak_moments set shared = true where id = m1;
    perform pg_temp.t_as(coach_u);
    f := f || pg_temp.t_eq('5g once Ada shares a moment, its review shows too', pg_temp.t_n(format('select count(*)::text from public.peak_reviews where moment_id = %L', m1)), '1');
    perform pg_temp.t_admin();
    f := f || pg_temp.t_eq('5h the coach''s rules read work moments only, even one marked shared', (select count(*)::text from pg_policies where tablename in ('peak_moments', 'peak_reviews') and policyname like 'Coach:%' and qual like '%area%''work''%'), '2');

    -- 6. Signed out.
    perform pg_temp.t_anon();
    f := f || pg_temp.t_eq('6a signed out: nothing', pg_temp.t_n('select count(*)::text from public.peak_moments'), 'error 42501');
    f := f || pg_temp.t_eq('6b signed out: no away flags', pg_temp.t_n('select count(*)::text from public.travel_away'), 'error 42501');

    -- 7. The to-do source, and everything goes with the account.
    perform pg_temp.t_admin();
    f := f || pg_temp.t_eq('7a todos take the source peak_moment', (select (pg_get_constraintdef(oid) like '%peak_moment%')::text from pg_constraint where conrelid = 'public.todos'::regclass and conname = 'todos_source_check'), 'true');
    f := f || pg_temp.t_eq('7b ... and keep every earlier source', (select (pg_get_constraintdef(oid) like '%sleep_wind_down%' and pg_get_constraintdef(oid) like '%conversion%')::text from pg_constraint where conrelid = 'public.todos'::regclass and conname = 'todos_source_check'), 'true');
    delete from auth.users where id = a;
    f := f || pg_temp.t_eq('7c all of it goes with the account', (select ((select count(*) from public.peak_moments where user_id = a) + (select count(*) from public.travel_plans where user_id = a) + (select count(*) from public.travel_away where user_id = a) + (select count(*) from public.peak_reviews where user_id = a))::text), '0');

    raise exception using errcode = 'TT001', message = 'undo the test';
  exception when sqlstate 'TT001' then null;
  end;
  perform pg_temp.t_admin();
  if cardinality(f) > 0 then
    raise exception 'FAILED (% of the checks): %', cardinality(f), array_to_string(f, ' | ');
  end if;
  raise notice '048 CHECKS PASSED';
end
$t$;
