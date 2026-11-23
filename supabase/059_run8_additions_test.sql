-- =============================================================================
-- 059_run8_additions_test.sql
-- Checks helper 2's part of supabase/migrations/059_run8_additions.sql: your
-- Personal and Family calendars from Google (Phase 6a run 8, item 2).
-- RUN ORDER: 049 to 058, then 059 (twice is fine), then this. Helper 1's
-- part has its own test (supabase/059_group_reminders_test.sql), and so has
-- helper 3's (supabase/059_catch_up_test.sql).
--
-- WHAT IT DOES
--   Makes an invented owner (Tess), an associate (Maya) and a client account
--   (Ella, Maya's), and checks:
--     1. the two new tables are locked down: row security on, in
--        coach_code_tables() with 054's code rule, nothing for anyone signed
--        out, and the migration recorded itself;
--     2. Maya's calendars and busy times are hers alone: Tess (the owner),
--        Ella and anyone signed out read none of them; Maya herself reads
--        none before her 6-digit code; she can't write into Tess's;
--     3. the shape: the main calendar never takes the switch or a busy time,
--        a calendar keeps its coach and Google id, a busy time keeps its
--        calendar, ends after it starts;
--     4. free times (booking pages, links, clients): a busy time of a
--        calendar switched on blocks; one switched off doesn't; switching
--        it on blocks it at once; a calendar deleted takes its busy times
--        with it; a booking over a busy time is refused;
--     5. the owner's view of associates' sessions (058) shows sessions only,
--        never a busy time or its title;
--     6. a booking page and a client only ever get free starts, never a
--        busy time's title.
--   Everything it makes is undone at the end.
--
--   It ends with the notice 059 CHECKS PASSED, or stops with FAILED and a
--   list naming each check that failed.
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
  tbl text;
  v text;
  own_u uuid; maya_u uuid; ella_u uuid; own_c uuid; maya_c uuid;
  ella_email text;
  p_ella uuid := gen_random_uuid(); eng uuid := gen_random_uuid();
  chem uuid := gen_random_uuid(); chem_key uuid := gen_random_uuid();
  g_main uuid := gen_random_uuid(); g_pers uuid := gen_random_uuid(); g_fam uuid := gen_random_uuid(); g_tess uuid := gen_random_uuid();
  b_fam uuid := gen_random_uuid(); b_pers uuid := gen_random_uuid(); b_tess uuid := gen_random_uuid();
  s_maya uuid := gen_random_uuid();
  -- A weekday a week or so ahead: inside the notice and the 4 weeks a page reaches.
  d0 date := current_date + 8 + (case extract(isodow from current_date + 8)::integer when 6 then 2 when 7 then 1 else 0 end);
begin
  -- ---------------------------------------------------------------- 1. locked down
  foreach tbl in array array['coach_google_calendars', 'coach_busy_times'] loop
    f := f || pg_temp.g_eq('1a ' || tbl || ' has row security', (select relrowsecurity::text from pg_class where oid = ('public.' || tbl)::regclass), 'true');
    f := f || pg_temp.g_eq('1b ' || tbl || ' is in coach_code_tables() as a coach table', (select kind from public.coach_code_tables() where table_name = tbl), 'coach');
    f := f || pg_temp.g_eq('1c ' || tbl || ' has 054''s restrictive code rule',
      (select (permissive = 'RESTRICTIVE')::text from pg_policies where schemaname = 'public' and tablename = tbl and policyname = 'Coach data: needs the 6-digit code'), 'true');
    f := f || pg_temp.g_eq('1d nobody signed out may touch ' || tbl,
      (select concat(has_table_privilege('anon', 'public.' || tbl, 'select'), has_table_privilege('anon', 'public.' || tbl, 'insert'))), 'ff');
  end loop;
  f := f || pg_temp.g_eq('1e coach_code_tables() still lists 054''s tables and 059''s three',
    (select count(*)::text from public.coach_code_tables() where table_name in ('coach_cal_items', 'network_people', 'coach_authenticator_resets', 'coach_cal_group_reminder_sends', 'coach_google_calendars', 'coach_busy_times')), '6');
  f := f || pg_temp.g_eq('1f the guards can''t be called by anyone signed in',
    (select concat(has_function_privilege('authenticated', 'public.coach_google_calendars_guard()', 'execute'), has_function_privilege('authenticated', 'public.coach_busy_times_guard()', 'execute'))), 'ff');
  if to_regclass('public.migration_log') is not null then
    f := f || pg_temp.g_eq('1g 059 recorded itself', (select count(*)::text from public.migration_log where number = 59), '1');
  end if;

  begin
    own_u := pg_temp.g_user('owner'); maya_u := pg_temp.g_user('maya'); ella_u := pg_temp.g_user('ella');
    select email into ella_email from auth.users where id = ella_u;
    insert into public.coaches (user_id, role, display_first_name, full_name) values (own_u, 'owner', 'Tess', 'Tess Owner') returning id into own_c;
    insert into public.coaches (user_id, role, display_first_name, full_name) values (maya_u, 'coach', 'Maya', 'Maya Invented') returning id into maya_c;

    -- ---------------------------------------------------------------- 2 and 3. Maya's calendars
    perform pg_temp.g_as(maya_u);
    insert into public.client_profiles (id, coach_id, name, email, time_zone) values (p_ella, maya_c, 'Ella Fraser', ella_email, 'Europe/London');
    perform public.client_invite(p_ella);
    insert into public.coach_settings (coach_id, time_zone, working_hours)
    values (maya_c, 'Europe/London', '{"mon":{"from":"09:00","to":"17:00"},"tue":{"from":"09:00","to":"17:00"},"wed":{"from":"09:00","to":"17:00"},"thu":{"from":"09:00","to":"17:00"},"fri":{"from":"09:00","to":"17:00"}}');
    insert into public.engagements (id, coach_id, profile_id, kind, sessions_total) values (eng, maya_c, p_ella, 'sessions', 6);
    insert into public.coach_call_types (id, coach_id, key, name, minutes, notice_hours, ahead_weeks, page_key, position)
    values (chem, maya_c, 'chemistry', 'Chemistry Call', 30, 24, 4, chem_key, 0);
    insert into public.coach_open_blocks (coach_id, starts_at, ends_at, time_zone) values (maya_c, pg_temp.g_lon(d0, '10:00'), pg_temp.g_lon(d0, '12:00'), 'Europe/London');
    f := f || pg_temp.g_eq('2a Maya lists her three Google calendars; the two besides the main one start switched off', pg_temp.g_rows(format(
      'insert into public.coach_google_calendars (id, coach_id, google_id, name, is_main, position) values '
      '(%L, %L, ''maya@example.invalid'', ''Work'', true, 0), (%L, %L, ''personal.p059@group.calendar.example'', ''Personal'', false, 1), '
      '(%L, %L, ''family.p059@group.calendar.example'', ''Family'', false, 2)', g_main, maya_c, g_pers, maya_c, g_fam, maya_c)), '3');
    f := f || pg_temp.g_eq('2b off to start with', (select string_agg(busy_on::text, ',' order by position) from public.coach_google_calendars where coach_id = maya_c), 'false,false,false');
    f := f || pg_temp.g_eq('2c she switches Family on', pg_temp.g_rows(format('update public.coach_google_calendars set busy_on = true where id = %L', g_fam)), '1');
    f := f || pg_temp.g_eq('2d and keeps a busy time from each', pg_temp.g_rows(format(
      'insert into public.coach_busy_times (id, coach_id, calendar_id, event_id, title, starts_at, ends_at) values '
      '(%L, %L, %L, ''fam1'', ''School play'', %L, %L), (%L, %L, %L, ''pers1'', ''Physio'', %L, %L)',
      b_fam, maya_c, g_fam, pg_temp.g_lon(d0, '10:30'), pg_temp.g_lon(d0, '11:00'),
      b_pers, maya_c, g_pers, pg_temp.g_lon(d0, '11:15'), pg_temp.g_lon(d0, '11:45'))), '2');
    f := f || pg_temp.g_eq('3a the main calendar never takes the switch', pg_temp.g_rows(format('update public.coach_google_calendars set busy_on = true where id = %L', g_main)), 'error 23514');
    f := f || pg_temp.g_eq('3b nor a busy time', pg_temp.g_rows(format(
      'insert into public.coach_busy_times (coach_id, calendar_id, event_id, title, starts_at, ends_at) values (%L, %L, ''main1'', ''x'', now(), now() + interval ''1 hour'')', maya_c, g_main)), 'error 22023');
    f := f || pg_temp.g_eq('3c a busy time ends after it starts, and lasts at most 31 days', concat_ws('/',
      pg_temp.g_rows(format('insert into public.coach_busy_times (coach_id, calendar_id, event_id, starts_at, ends_at) values (%L, %L, ''z1'', now(), now())', maya_c, g_fam)),
      pg_temp.g_rows(format('insert into public.coach_busy_times (coach_id, calendar_id, event_id, starts_at, ends_at) values (%L, %L, ''z2'', now(), now() + interval ''40 days'')', maya_c, g_fam))), 'error 23514/error 23514');
    f := f || pg_temp.g_eq('3d one event once a calendar', pg_temp.g_rows(format(
      'insert into public.coach_busy_times (coach_id, calendar_id, event_id, starts_at, ends_at) values (%L, %L, ''fam1'', now(), now() + interval ''1 hour'')', maya_c, g_fam)), 'error 23505');
    perform pg_temp.g_rows(format('update public.coach_google_calendars set google_id = ''moved@example.invalid'' where id = %L', g_pers));
    perform pg_temp.g_rows(format('update public.coach_busy_times set calendar_id = %L, event_id = ''other'' where id = %L', g_pers, b_fam));
    f := f || pg_temp.g_eq('3e a calendar keeps its Google id, and a busy time its calendar and event',
      (select concat_ws('/', (select google_id from public.coach_google_calendars where id = g_pers), (select calendar_id::text || ':' || event_id from public.coach_busy_times where id = b_fam))),
      'personal.p059@group.calendar.example/' || g_fam || ':fam1');

    perform pg_temp.g_as(own_u);
    insert into public.coach_google_calendars (id, coach_id, google_id, name, busy_on) values (g_tess, own_c, 'tess.personal@group.calendar.example', 'Personal', true);
    insert into public.coach_busy_times (id, coach_id, calendar_id, event_id, title, starts_at, ends_at)
    values (b_tess, own_c, g_tess, 'tess1', 'Dentist', pg_temp.g_lon(d0, '09:00'), pg_temp.g_lon(d0, '10:00'));
    f := f || pg_temp.g_eq('2e the owner reads none of Maya''s calendars or busy times, only her own', (select concat_ws('/',
      (select count(*) from public.coach_google_calendars where coach_id = maya_c), (select count(*) from public.coach_busy_times where coach_id = maya_c),
      (select count(*) from public.coach_google_calendars), (select count(*) from public.coach_busy_times))), '0/0/1/1');
    f := f || pg_temp.g_eq('2f nor changes or deletes them', concat_ws('/',
      pg_temp.g_rows(format('update public.coach_google_calendars set busy_on = false where id = %L', g_fam)),
      pg_temp.g_rows(format('delete from public.coach_busy_times where id = %L', b_fam))), '0/0');
    f := f || pg_temp.g_eq('2g nor adds to them', concat_ws('/',
      pg_temp.g_rows(format('insert into public.coach_google_calendars (coach_id, google_id) values (%L, ''x@example.invalid'')', maya_c)),
      pg_temp.g_rows(format('insert into public.coach_busy_times (coach_id, calendar_id, event_id, starts_at, ends_at) values (%L, %L, ''x'', now(), now() + interval ''1 hour'')', maya_c, g_fam))), 'error 42501/error 42501');

    perform pg_temp.g_as(maya_u);
    f := f || pg_temp.g_eq('2h Maya can''t put a busy time in the owner''s calendar, even as her own row', concat_ws('/',
      pg_temp.g_rows(format('insert into public.coach_busy_times (coach_id, calendar_id, event_id, starts_at, ends_at) values (%L, %L, ''x'', now(), now() + interval ''1 hour'')', maya_c, g_tess)),
      pg_temp.g_rows(format('insert into public.coach_busy_times (coach_id, calendar_id, event_id, starts_at, ends_at) values (%L, %L, ''x'', now(), now() + interval ''1 hour'')', own_c, g_tess))), 'error 42501/error 42501');
    f := f || pg_temp.g_eq('2i Maya reads her own three calendars and two busy times', (select concat_ws('/',
      (select count(*) from public.coach_google_calendars), (select count(*) from public.coach_busy_times))), '3/2');
    perform pg_temp.g_as(maya_u, 'aal1');
    f := f || pg_temp.g_eq('2j before her 6-digit code she reads none, and adds none', concat_ws('/',
      (select count(*) from public.coach_google_calendars), (select count(*) from public.coach_busy_times),
      pg_temp.g_rows(format('insert into public.coach_google_calendars (coach_id, google_id) values (%L, ''aal1@example.invalid'')', maya_c))), '0/0/error 42501');

    perform pg_temp.g_as(ella_u);
    f := f || pg_temp.g_eq('2k Ella accepts Maya''s invite', pg_temp.g_n(format('select public.client_accept_invite(%L)', p_ella)), 'linked');
    f := f || pg_temp.g_eq('2l a client reads none of her coach''s calendars or busy times', (select concat_ws('/',
      pg_temp.g_n('select count(*)::text from public.coach_google_calendars'), pg_temp.g_n('select count(*)::text from public.coach_busy_times'))), '0/0');
    f := f || pg_temp.g_eq('6a and books from free starts only, which never fall on the School play', pg_temp.g_n(format(
      'select count(*)::text from public.my_booking_times(%L, %L, 30) where starts_at < %L and starts_at + interval ''30 minutes'' > %L',
      pg_temp.g_lon(d0, '00:00'), pg_temp.g_lon(d0 + 1, '00:00'), pg_temp.g_lon(d0, '11:00'), pg_temp.g_lon(d0, '10:30'))), '0');
    f := f || pg_temp.g_eq('6b her free starts that day are there (the hours around it)', pg_temp.g_n(format(
      'select (count(*) > 0)::text from public.my_booking_times(%L, %L, 30)', pg_temp.g_lon(d0, '00:00'), pg_temp.g_lon(d0 + 1, '00:00'))), 'true');

    perform pg_temp.g_anon();
    f := f || pg_temp.g_eq('2m someone signed out reads no table', concat_ws('/',
      pg_temp.g_n('select count(*)::text from public.coach_google_calendars'), pg_temp.g_n('select count(*)::text from public.coach_busy_times')), 'error 42501/error 42501');

    -- ---------------------------------------------------------------- 4. free times
    f := f || pg_temp.g_eq('4a the booking page: the School play (Family, on) blocks; Physio (Personal, off) doesn''t', pg_temp.g_free(chem_key, d0), '10:00,11:00,11:15,11:30');
    f := f || pg_temp.g_eq('6c the page''s own answer never names a busy time', (select (public.booking_page(chem_key)::text like any (array['%School play%', '%Physio%', '%Family%']))::text), 'false');
    perform pg_temp.g_as(maya_u);
    update public.coach_google_calendars set busy_on = true where id = g_pers;
    perform pg_temp.g_anon();
    f := f || pg_temp.g_eq('4b Personal switched on: Physio blocks at once', pg_temp.g_free(chem_key, d0), '10:00');
    perform pg_temp.g_as(maya_u);
    update public.coach_google_calendars set busy_on = false where id = g_fam;
    perform pg_temp.g_anon();
    f := f || pg_temp.g_eq('4c Family switched off: the School play no longer blocks', pg_temp.g_free(chem_key, d0), '10:00,10:15,10:30,10:45');
    f := f || pg_temp.g_eq('4d a booking over Physio is refused', public.booking_make(chem_key, pg_temp.g_lon(d0, '11:00'), 'Nadia Osei', 'nadia-p059@example.invalid', 'Europe/London') ->> 'status', 'taken');
    perform pg_temp.g_admin();
    f := f || pg_temp.g_eq('4e another coach''s busy time never blocks Maya (the owner''s Dentist, 09:00)',
      (select count(*)::text from public._cal_free_times(maya_c, 'hours', 30, 15, 15, 24, 4, 5, pg_temp.g_lon(d0, '09:00'), pg_temp.g_lon(d0, '09:30'))), '1');
    perform pg_temp.g_as(maya_u);
    delete from public.coach_google_calendars where id = g_pers;
    f := f || pg_temp.g_eq('4f a calendar deleted takes its busy times with it', (select count(*)::text from public.coach_busy_times where calendar_id = g_pers), '0');
    perform pg_temp.g_anon();
    f := f || pg_temp.g_eq('4g and they no longer block', pg_temp.g_free(chem_key, d0), '10:00,10:15,10:30,10:45,11:00,11:15,11:30');
    perform pg_temp.g_admin();
    f := f || pg_temp.g_eq('4h a busy time is never a call: it doesn''t count towards 5 calls a day or the gap', (select count(*)::text
      from public._cal_free_times(maya_c, 'hours', 30, 15, 15, 24, 4, 5, pg_temp.g_lon(d0, '11:00'), pg_temp.g_lon(d0, '11:30'))), '1');

    -- ---------------------------------------------------------------- 5. the owner's view of associates' sessions
    perform pg_temp.g_as(maya_u);
    insert into public.coach_sessions (id, coach_id, profile_id, kind, starts_at, minutes) values (s_maya, maya_c, p_ella, 'coaching', pg_temp.g_lon(d0, '14:00'), 60);
    update public.coach_google_calendars set busy_on = true where id = g_fam;
    perform pg_temp.g_as(own_u);
    f := f || pg_temp.g_eq('5a the owner sees Maya''s session, and nothing of her busy times', (select concat_ws('/', count(*), bool_or(id = s_maya),
        bool_or(coalesce(client_name, '') like '%School%' or id = b_fam))
      from public.coach_associate_sessions(pg_temp.g_lon(d0, '00:00'), pg_temp.g_lon(d0 + 1, '00:00'))), '1/t/f');

    perform pg_temp.g_admin();
    raise exception 'undo the test rows' using errcode = 'P0859';
  exception when sqlstate 'P0859' then
    perform pg_temp.g_admin();
  end;

  f := f || pg_temp.g_eq('7a everything the test made is undone', (select concat_ws('/',
    (select count(*) from auth.users where email like 'p059-test-%@example.invalid'),
    (select count(*) from public.coach_google_calendars where google_id like '%p059%'))), '0/0');

  if cardinality(f) > 0 then
    raise exception E'059 FAILED (%):\n%', cardinality(f), array_to_string(f, E'\n');
  end if;
  raise notice '059 CHECKS PASSED';
end
$t$;
