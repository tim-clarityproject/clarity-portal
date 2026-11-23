-- =============================================================================
-- 059_run8_additions_breakit_test.sql
-- The break-it checks of helper 2's part of supabase/migrations/059_run8_additions.sql
-- (Phase 6a run 8, item 2: Personal and Family calendars from Google).
-- RUN ORDER: 049 to 058, then 059 (twice is fine), then this. Dry run only.
--
-- WHAT IT TRIES
--   1. Moving a calendar or a busy time to another coach (a plain update, as
--      the coach); the same Google calendar twice for one coach; one
--      calendar for two coaches; a busy time pointing at another coach's
--      calendar, even written by the database's owner; the main calendar
--      made main while switched on.
--   2. Too much: a 101st calendar, a 5,001st busy time, a title of 301
--      characters, a Google id of 1,025.
--   3. Odd times: a busy time that began the day before and runs over the
--      day, an all-day one, one that ends exactly as a free start begins,
--      one exactly on a call's gap; each blocks just what it covers and
--      counts as no call.
--   4. Who: a coach who is no longer active reads nothing; the owner at
--      aal1; the server's key reads for the server; a deleted coach takes
--      everything with them.
--   It ends with the notice 059 BREAK-IT CHECKS PASSED, or stops with FAILED
--   and a list naming each check that failed. Everything it makes is undone.
-- =============================================================================
-- A sign-in with or without the code, written to auth.sessions where that table exists (as 056's break-it test does).
create or replace function pg_temp.g_as(p uuid, p_aal text default 'aal2') returns void language plpgsql as $f$
declare sid uuid := gen_random_uuid();
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
  if to_regclass('auth.sessions') is not null and p is not null then
    begin
      execute 'insert into auth.sessions (id, user_id, created_at, updated_at) values ($1, $2, $3, $3)' using sid, p, now();
    exception when others then
      raise notice '059 test: this database doesn''t let the test write auth.sessions (%)', sqlerrm;
    end;
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated', 'aal', p_aal,
    'amr', json_build_array(json_build_object('method', 'password', 'timestamp', floor(extract(epoch from now()))::bigint)),
    'iat', floor(extract(epoch from now()))::bigint, 'session_id', sid)::text, true);
  perform set_config('role', 'authenticated', true);
end $f$;
create or replace function pg_temp.g_anon() returns void language plpgsql as $f$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('role', 'anon', true);
end $f$;
create or replace function pg_temp.g_admin() returns void language plpgsql as $f$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
end $f$;
create or replace function pg_temp.g_user(p_label text) returns uuid language plpgsql as $f$
declare u uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, aud, role, email_confirmed_at)
  values (u, 'p059-test-' || p_label || '-' || u || '@example.invalid', 'authenticated', 'authenticated', now());
  return u;
end $f$;
create or replace function pg_temp.g_n(p_sql text) returns text language plpgsql as $f$
declare v text;
begin
  execute p_sql into v;
  return coalesce(v, 'null');
exception when others then
  return 'error ' || sqlstate;
end $f$;
create or replace function pg_temp.g_rows(p_sql text) returns text language plpgsql as $f$
declare n bigint;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n::text;
exception when others then
  return 'error ' || sqlstate;
end $f$;
create or replace function pg_temp.g_eq(p_name text, p_got text, p_want text) returns text[] language sql as $f$
  select case when p_got is distinct from p_want
              then array[format('%s: expected %s, got %s', p_name, p_want, coalesce(p_got, 'nothing'))]
              else '{}'::text[] end;
$f$;
create or replace function pg_temp.g_lon(p_day date, p_time text) returns timestamptz language sql as $f$
  select (p_day + p_time::time) at time zone 'Europe/London';
$f$;
-- A booking page's free starts that day, as London times joined by commas.
create or replace function pg_temp.g_free(p_key uuid, p_day date) returns text language sql as $f$
  select coalesce(string_agg(to_char(starts_at at time zone 'Europe/London', 'HH24:MI'), ',' order by starts_at), 'none')
  from public.booking_free_times(p_key, pg_temp.g_lon(p_day, '00:00'), pg_temp.g_lon(p_day + 1, '00:00'));
$f$;
grant execute on function pg_temp.g_n(text) to anon, authenticated;
grant execute on function pg_temp.g_rows(text) to anon, authenticated;
grant execute on function pg_temp.g_free(uuid, date) to anon, authenticated;
grant execute on function pg_temp.g_lon(date, text) to anon, authenticated;

do $t$
declare
  f text[] := '{}';
  v text;
  own_u uuid; maya_u uuid; ravi_u uuid; own_c uuid; maya_c uuid; ravi_c uuid;
  g_m uuid := gen_random_uuid(); g_r uuid := gen_random_uuid(); g_main uuid := gen_random_uuid();
  b1 uuid := gen_random_uuid();
  chem_key uuid := gen_random_uuid();
  d0 date := current_date + 8 + (case extract(isodow from current_date + 8)::integer when 6 then 2 when 7 then 1 else 0 end);
begin
  begin
    own_u := pg_temp.g_user('owner'); maya_u := pg_temp.g_user('maya'); ravi_u := pg_temp.g_user('ravi');
    insert into public.coaches (user_id, role, display_first_name) values (own_u, 'owner', 'Tess') returning id into own_c;
    insert into public.coaches (user_id, role, display_first_name) values (maya_u, 'coach', 'Maya') returning id into maya_c;
    insert into public.coaches (user_id, role, display_first_name) values (ravi_u, 'coach', 'Ravi') returning id into ravi_c;
    perform pg_temp.g_as(maya_u);
    insert into public.coach_settings (coach_id, time_zone) values (maya_c, 'Europe/London');
    insert into public.coach_call_types (coach_id, key, name, minutes, notice_hours, ahead_weeks, page_key) values (maya_c, 'chemistry', 'Chemistry Call', 30, 24, 4, chem_key);
    insert into public.coach_open_blocks (coach_id, starts_at, ends_at, time_zone) values (maya_c, pg_temp.g_lon(d0, '09:00'), pg_temp.g_lon(d0, '12:00'), 'Europe/London');
    insert into public.coach_google_calendars (id, coach_id, google_id, name, busy_on) values (g_m, maya_c, 'family.k059@group.calendar.example', 'Family', true);
    insert into public.coach_google_calendars (id, coach_id, google_id, name, is_main) values (g_main, maya_c, 'maya.k059@example.invalid', 'Work', true);
    perform pg_temp.g_as(ravi_u);
    insert into public.coach_google_calendars (id, coach_id, google_id, name, busy_on) values (g_r, ravi_c, 'family.k059@group.calendar.example', 'Family', true);

    -- ---------------------------------------------------------------- 1. moving things across
    f := f || pg_temp.g_eq('1a one Google calendar may be on two coaches'' accounts (a shared family calendar)', (select count(*)::text from public.coach_google_calendars where id = g_r), '1');
    perform pg_temp.g_as(maya_u);
    f := f || pg_temp.g_eq('1b the same calendar twice for one coach is refused', pg_temp.g_rows(format(
      'insert into public.coach_google_calendars (coach_id, google_id) values (%L, ''family.k059@group.calendar.example'')', maya_c)), 'error 23505');
    perform pg_temp.g_rows(format('update public.coach_google_calendars set coach_id = %L where id = %L', ravi_c, g_m));
    perform pg_temp.g_admin();
    f := f || pg_temp.g_eq('1c a calendar moved to another coach stays the coach''s own', (select coach_id::text from public.coach_google_calendars where id = g_m), maya_c::text);
    perform pg_temp.g_as(maya_u);
    insert into public.coach_busy_times (id, coach_id, calendar_id, event_id, title, starts_at, ends_at)
    values (b1, maya_c, g_m, 'k1', 'Swimming', pg_temp.g_lon(d0, '09:00'), pg_temp.g_lon(d0, '09:30'));
    perform pg_temp.g_rows(format('update public.coach_busy_times set coach_id = %L where id = %L', ravi_c, b1));
    perform pg_temp.g_admin();
    f := f || pg_temp.g_eq('1d a busy time moved to another coach stays the coach''s own', (select coach_id::text from public.coach_busy_times where id = b1), maya_c::text);
    f := f || pg_temp.g_eq('1e even the database''s owner can''t point a busy time at another coach''s calendar', pg_temp.g_rows(format(
      'insert into public.coach_busy_times (coach_id, calendar_id, event_id, starts_at, ends_at) values (%L, %L, ''k2'', now(), now() + interval ''1 hour'')', maya_c, g_r)), 'error 42501');
    perform pg_temp.g_as(maya_u);
    f := f || pg_temp.g_eq('1f a calendar switched on can''t become the main one', pg_temp.g_rows(format('update public.coach_google_calendars set is_main = true where id = %L', g_m)), 'error 23514');
    f := f || pg_temp.g_eq('1g a busy time can''t be added to the main calendar by making it main later either', concat_ws('/',
      pg_temp.g_rows(format('update public.coach_google_calendars set busy_on = false, is_main = true where id = %L', g_m))), '1');
    perform pg_temp.g_rows(format('update public.coach_busy_times set title = ''Swimming again'' where id = %L', b1));
    f := f || pg_temp.g_eq('1h and a busy time of a calendar made main can''t be changed (it would be kept as an item)', (select title from public.coach_busy_times where id = b1), 'Swimming');
    perform pg_temp.g_admin();
    update public.coach_google_calendars set is_main = false, busy_on = true where id = g_m;

    -- ---------------------------------------------------------------- 2. too much
    perform pg_temp.g_as(maya_u);
    f := f || pg_temp.g_eq('2a a title of 301 characters, a Google id of 1,025', concat_ws('/',
      pg_temp.g_rows(format('insert into public.coach_busy_times (coach_id, calendar_id, event_id, title, starts_at, ends_at) values (%L, %L, ''k3'', %L, now(), now() + interval ''1 hour'')', maya_c, g_m, repeat('a', 301))),
      pg_temp.g_rows(format('insert into public.coach_google_calendars (coach_id, google_id) values (%L, %L)', maya_c, repeat('g', 1025)))), 'error 23514/error 23514');
    perform pg_temp.g_admin();
    insert into public.coach_google_calendars (coach_id, google_id) select maya_c, 'k059-' || g || '@group.calendar.example' from generate_series(1, 98) g;
    perform pg_temp.g_as(maya_u);
    f := f || pg_temp.g_eq('2b a 101st calendar is refused', pg_temp.g_rows(format('insert into public.coach_google_calendars (coach_id, google_id) values (%L, ''one-too-many@example.invalid'')', maya_c)), 'error 22023');
    perform pg_temp.g_admin();
    delete from public.coach_google_calendars where google_id like 'k059-%';
    insert into public.coach_busy_times (coach_id, calendar_id, event_id, starts_at, ends_at)
      select maya_c, g_m, 'many-' || g, now() + make_interval(days => 60, mins => g), now() + make_interval(days => 60, mins => g + 1) from generate_series(1, 4999) g;
    perform pg_temp.g_as(maya_u);
    f := f || pg_temp.g_eq('2c a 5,001st busy time is refused', pg_temp.g_rows(format(
      'insert into public.coach_busy_times (coach_id, calendar_id, event_id, starts_at, ends_at) values (%L, %L, ''one-too-many'', now(), now() + interval ''1 hour'')', maya_c, g_m)), 'error 22023');
    perform pg_temp.g_admin();
    delete from public.coach_busy_times where event_id like 'many-%';

    -- ---------------------------------------------------------------- 3. odd times
    perform pg_temp.g_anon();
    f := f || pg_temp.g_eq('3a Swimming 09:00 to 09:30 blocks just that', pg_temp.g_free(chem_key, d0), '09:30,09:45,10:00,10:15,10:30,10:45,11:00,11:15,11:30');
    perform pg_temp.g_admin();
    insert into public.coach_busy_times (coach_id, calendar_id, event_id, title, starts_at, ends_at)
    values (maya_c, g_m, 'k-over', 'Away', pg_temp.g_lon(d0 - 1, '20:00'), pg_temp.g_lon(d0, '10:00'));
    perform pg_temp.g_anon();
    f := f || pg_temp.g_eq('3b one that began the evening before blocks the morning; a start just as it ends is free (never a call, so no gap)', pg_temp.g_free(chem_key, d0), '10:00,10:15,10:30,10:45,11:00,11:15,11:30');
    perform pg_temp.g_admin();
    insert into public.coach_busy_times (coach_id, calendar_id, event_id, title, starts_at, ends_at, all_day)
    values (maya_c, g_m, 'k-day', 'Inset day', pg_temp.g_lon(d0, '00:00'), pg_temp.g_lon(d0 + 1, '00:00'), true);
    perform pg_temp.g_anon();
    f := f || pg_temp.g_eq('3c an all-day one switched on blocks the whole day', pg_temp.g_free(chem_key, d0), 'none');
    perform pg_temp.g_as(ravi_u);
    update public.coach_google_calendars set busy_on = false where id = g_r;
    perform pg_temp.g_anon();
    f := f || pg_temp.g_eq('3d Ravi switching his copy of the shared calendar off changes nothing for Maya', pg_temp.g_free(chem_key, d0), 'none');

    -- ---------------------------------------------------------------- 4. who
    perform pg_temp.g_as(own_u, 'aal1');
    f := f || pg_temp.g_eq('4a the owner at aal1 reads nothing', (select concat_ws('/', (select count(*) from public.coach_google_calendars), (select count(*) from public.coach_busy_times))), '0/0');
    perform pg_temp.g_as(own_u);
    f := f || pg_temp.g_eq('4b the owner with the code reads nothing of Maya''s', (select concat_ws('/', (select count(*) from public.coach_google_calendars), (select count(*) from public.coach_busy_times))), '0/0');
    perform pg_temp.g_admin();
    update public.coaches set active = false where id = maya_c;
    perform pg_temp.g_as(maya_u);
    f := f || pg_temp.g_eq('4c a coach no longer active reads nothing', (select concat_ws('/', (select count(*) from public.coach_google_calendars), (select count(*) from public.coach_busy_times))), '0/0');
    perform pg_temp.g_admin();
    perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
    perform set_config('role', 'service_role', true);
    f := f || pg_temp.g_eq('4d the server''s key reads them (for the server alone)', (select (count(*) >= 3)::text from public.coach_busy_times), 'true');
    perform pg_temp.g_admin();
    delete from public.coaches where id = maya_c;
    f := f || pg_temp.g_eq('4e a deleted coach takes their calendars and busy times with them', (select concat_ws('/',
      (select count(*) from public.coach_google_calendars where coach_id = maya_c), (select count(*) from public.coach_busy_times where coach_id = maya_c))), '0/0');

    perform pg_temp.g_admin();
    raise exception 'undo the test rows' using errcode = 'P0859';
  exception when sqlstate 'P0859' then
    perform pg_temp.g_admin();
  end;

  f := f || pg_temp.g_eq('5a everything the test made is undone', (select count(*)::text from auth.users where email like 'p059-test-%@example.invalid'), '0');
  if cardinality(f) > 0 then
    raise exception E'059 BREAK-IT FAILED (%):\n%', cardinality(f), array_to_string(f, E'\n');
  end if;
  raise notice '059 BREAK-IT CHECKS PASSED';
end
$t$;
