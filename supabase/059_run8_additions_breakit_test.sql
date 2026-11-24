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

-- =============================================================================
-- The run 8 break-it tester's checks (24 Nov): reminders and a coach away, on
-- the coach's own day at the UTC +14 and -11 edges; group reminders tried
-- hard (one address in two groups at once, an address changed between runs,
-- a guest with a zone nobody knows, the switches flipped between listing and
-- claiming, HTML in names). Everything it makes is undone. Ends with the
-- notice 059 BREAK-IT (TESTER) CHECKS PASSED.
-- =============================================================================
-- The moment p_day p_time in zone p_zone.
create or replace function pg_temp.g_at(p_zone text, p_day date, p_time text) returns timestamptz language sql as $f$
  select (p_day + p_time::time) at time zone p_zone;
$f$;
-- How many reminders (single and group) a coach has listed at a moment, as "single/group".
create or replace function pg_temp.g_listed(p_coach uuid, p_now timestamptz) returns text language sql as $f$
  select concat((select count(*) from public.cal_reminders_coming(p_now) r where r.coach_id = p_coach), '/',
                (select count(*) from public.cal_group_reminders_coming(p_now) r where r.coach_id = p_coach));
$f$;

do $t$
declare
  f text[] := '{}';
  v text;
  u uuid; c uuid; c2 uuid; u2 uuid;
  p_one uuid := gen_random_uuid();
  grp uuid := gen_random_uuid(); grp2 uuid := gen_random_uuid();
  m1 uuid := gen_random_uuid(); m2 uuid := gen_random_uuid(); m3 uuid := gen_random_uuid(); m4 uuid := gen_random_uuid();
  it_one uuid := gen_random_uuid(); it_g uuid := gen_random_uuid(); it_g2 uuid := gen_random_uuid();
  z text; d date; t_now timestamptz; t_call timestamptz;
  cases text[][] := array[
    -- zone, which edge, the time of p_now that day, away days (relative to d), wanted "single/group"
    array['America/Los_Angeles', 'away until d, Friday evening there (already the next day in UTC)', '20:00', '-3', '0', '0/0'],
    array['America/Los_Angeles', 'away until d, just after midnight there the next day', '00:30+1', '-3', '0', '1/1'],
    array['Pacific/Auckland', 'away from d, Saturday morning there (still the day before in UTC)', '08:00', '0', '3', '0/0'],
    array['Pacific/Auckland', 'away from d, the evening before there', '23:30-1', '0', '3', '1/1'],
    array['Pacific/Kiritimati', 'UTC+14, away from d, 00:15 there', '00:15', '0', '3', '0/0'],
    array['Pacific/Kiritimati', 'UTC+14, the minute before d there', '23:59-1', '0', '3', '1/1'],
    array['Pacific/Pago_Pago', 'UTC-11, away until d, 23:45 there', '23:45', '-3', '0', '0/0'],
    array['Pacific/Pago_Pago', 'UTC-11, 00:15 the day after d there', '00:15+1', '-3', '0', '1/1']];
  i integer;
  tm text; shift integer;
begin
  begin
    u := pg_temp.g_user('tester'); u2 := pg_temp.g_user('tester2');
    insert into public.coaches (user_id, role, display_first_name) values (u, 'coach', 'Maya') returning id into c;
    insert into public.coaches (user_id, role, display_first_name) values (u2, 'coach', 'Ravi') returning id into c2;
    insert into public.coach_settings (coach_id, time_zone, booking) values (c, 'Europe/London', '{"remind_24": true, "remind_1": true}');
    insert into public.client_profiles (id, coach_id, name, email, time_zone) values (p_one, c, 'Ola Single', 'ola.t059@example.invalid', 'Europe/London');
    insert into public.coach_groups (id, coach_id, name) values (grp, c, 'Kestrel <b>team</b>'), (grp2, c, 'Osprey & "friends"');
    insert into public.coach_group_members (id, group_id, profile_id, name, email) values (m1, grp, null, 'Ann <img src=x onerror=alert(1)>', 'ann.t059@example.invalid');
    insert into public.coach_cal_items (id, coach_id, kind, title, starts_at, ends_at, time_zone, profile_id) values
      (it_one, c, 'client_call', 'Ola Single', now() + interval '2 days', now() + interval '2 days 1 hour', 'Europe/London', p_one);
    insert into public.coach_cal_items (id, coach_id, kind, title, starts_at, ends_at, time_zone, group_id) values
      (it_g, c, 'client_call', 'Kestrel', now() + interval '2 days 2 hours', now() + interval '2 days 3 hours', 'Europe/London', grp);

    -- ---------------------------------------------------------------- 1. away is the coach's own day
    for i in 1 .. array_length(cases, 1) loop
      z := cases[i][1];
      d := (now() at time zone z)::date + 3;
      tm := split_part(cases[i][3], '+', 1); shift := 0;
      if cases[i][3] like '%+1' then shift := 1; end if;
      if cases[i][3] like '%-1' then tm := split_part(cases[i][3], '-', 1); shift := -1; end if;
      t_now := pg_temp.g_at(z, d + shift, tm);
      t_call := t_now + interval '20 hours';
      update public.coach_settings set time_zone = z where coach_id = c;
      update public.coach_cal_items set starts_at = t_call, ends_at = t_call + interval '1 hour' where id = it_one;
      update public.coach_cal_items set starts_at = t_call + interval '2 hours', ends_at = t_call + interval '3 hours' where id = it_g;
      delete from public.coach_away where coach_id = c;
      insert into public.coach_away (coach_id, starts_on, ends_on) values (c, d + cases[i][4]::integer, d + cases[i][5]::integer);
      -- Counted by kind once each: the day before and 1 hour before for each call, only whether any is listed matters.
      v := concat((select least(count(*), 1) from public.cal_reminders_coming(t_now) r where r.coach_id = c), '/',
                  (select least(count(*), 1) from public.cal_group_reminders_coming(t_now) r where r.coach_id = c));
      f := f || pg_temp.g_eq('1.' || i || ' ' || z || ': ' || cases[i][2], v, cases[i][6]);
    end loop;
    delete from public.coach_away where coach_id = c;
    -- A coach with no zone saved is on London's day.
    update public.coach_settings set time_zone = null where coach_id = c;
    d := (now() at time zone 'Europe/London')::date + 3;
    insert into public.coach_away (coach_id, starts_on, ends_on) values (c, d, d);
    f := f || pg_temp.g_eq('1.9 no zone saved: London''s day', concat(
      (select least(count(*), 1) from public.cal_reminders_coming(pg_temp.g_at('Europe/London', d, '00:10')) r where r.coach_id = c), '/',
      (select least(count(*), 1) from public.cal_reminders_coming(pg_temp.g_at('Europe/London', d - 1, '23:50')) r where r.coach_id = c)), '0/1');
    delete from public.coach_away where coach_id = c;
    -- A claim made while the coach is away (on their own day, now) is refused.
    update public.coach_settings set time_zone = 'Pacific/Kiritimati' where coach_id = c;
    update public.coach_cal_items set starts_at = now() + interval '3 hours', ends_at = now() + interval '4 hours' where id = it_g;
    insert into public.coach_away (coach_id, starts_on, ends_on) values (c, (now() at time zone 'Pacific/Kiritimati')::date, (now() at time zone 'Pacific/Kiritimati')::date);
    f := f || pg_temp.g_eq('1.10 a claim while the coach is away is refused', coalesce(public.cal_group_reminder_claim(it_g, m1, 'hour_before', now() + interval '3 hours'), 'none'), 'none');
    delete from public.coach_away where coach_id = c;
    update public.coach_settings set time_zone = 'Europe/London' where coach_id = c;

    raise exception 'undo the test rows' using errcode = 'P0860';
  exception when sqlstate 'P0860' then
    perform pg_temp.g_admin();
  end;

  f := f || pg_temp.g_eq('9a everything the test made is undone', (select count(*)::text from auth.users where email like 'p059-test-tester%@example.invalid'), '0');
  if cardinality(f) > 0 then
    raise exception E'059 BREAK-IT (TESTER) FAILED (%):\n%', cardinality(f), array_to_string(f, E'\n');
  end if;
  raise notice '059 BREAK-IT (TESTER) CHECKS PASSED';
end
$t$;
