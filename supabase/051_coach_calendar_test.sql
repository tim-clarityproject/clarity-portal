-- =============================================================================
-- 051_coach_calendar_test.sql
-- Checks 051_coach_calendar.sql. RUN ORDER: 026, 033, 049, 050, 051, then this.
--
-- WHAT IT DOES
--   Makes an invented owner (Tess), an associate (Maya), two client accounts
--   (Ella is Maya's, in New York; Sam is the owner's), guests who are signed
--   out, and the email server, and checks each reading and writing what it
--   should, and being refused what it shouldn't:
--     1. every new table is locked down, the functions are open only to who
--        they are for, and the migration recorded itself;
--     2. the shape checks: a repeat's rule, reminders, questions, a meeting
--        link, a real time zone;
--     3. a coach's calendar, call types, open times, links, polls and leads
--        are theirs alone: the owner reads nothing of an associate's, a
--        client and someone signed out read no table at all;
--     4. time zones (time-zone-safeguards.md): a New York Monday 07:30
--        series stays 07:30 there through 25 Oct and 1 Nov 2026 while UK
--        time goes 12:30, 11:30, 12:30; Phoenix, Sydney, Kolkata and St
--        John's show the right UK time on both sides of every clock change
--        in 2026; a Sydney morning is the day before in the UK;
--     5. repeats: every 2 weeks on chosen weekdays, monthly by weekday,
--        monthly on the 31st, a count, an end date, "this one" edited and
--        removed;
--     6. free times: quarter hours inside the open block, nothing over a
--        busy item (a personal one counts only as busy), the 15-minute gap
--        between calls, the notice, how far ahead, a day away, the weekly
--        hours, and 5 calls a day;
--     7. a booking page: its own call only; a guest books (quarter hours in
--        their own time, 07:00 to 20:00 unless early and late), the second
--        guest for the same start is refused, the lead is made, the guest
--        moves and cancels by their own key, 3 bookings an email;
--     8. a single-use link books once, ends when it says, and for a client
--        books a session;
--     9. a poll: each person sees only their own answers, up to 5 times;
--    10. a client books, moves and cancels their own sessions inside their
--        engagement, and is told the late rule first;
--    11. reminders: claimed once, by the email server only;
--    12. connections are the server's alone; the two starting call types
--        are made once.
--   Everything it makes is undone at the end.
--
--   NOT HERE (they are the app's, in the unit tests): reminders arriving
--   between 07:00 and 09:00 Los Angeles time (src/lib/time/reminders.js
--   decides the moment; the database only says which calls are coming and
--   records each send once), public holidays, and the words times are
--   shown in.
--
--   It ends with the notice 051 CHECKS PASSED, or stops with FAILED and a
--   list naming each check that failed.
-- =============================================================================
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
create or replace function pg_temp.t_server() returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  perform set_config('role', 'service_role', true);
end $f$;
create or replace function pg_temp.t_admin() returns void language plpgsql as $f$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
end $f$;
create or replace function pg_temp.t_user(p_label text) returns uuid language plpgsql as $f$
declare u uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, aud, role, email_confirmed_at)
  values (u, 'p6a-test-' || p_label || '-' || u || '@example.invalid', 'authenticated', 'authenticated', now());
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
-- A day and a clock time in London, as an instant.
create or replace function pg_temp.t_lon(p_day date, p_time text) returns timestamptz language sql as $f$
  select (p_day + p_time::time) at time zone 'Europe/London';
$f$;
-- A series' UK times on chosen days, as "DD HH24:MI" joined by commas.
create or replace function pg_temp.t_uk(p_coach uuid, p_item uuid, p_days date[]) returns text language sql as $f$
  select string_agg(to_char(o.starts_at at time zone 'Europe/London', 'DD HH24:MI'), ',' order by o.starts_at)
  from public._cal_occurrences(p_coach, '2026-01-01', '2027-01-01') o
  where o.item_id = p_item and o.occurrence_on = any (p_days);
$f$;
-- Every time of an item in a range, as days joined by commas.
create or replace function pg_temp.t_days(p_coach uuid, p_item uuid, p_from date, p_to date) returns text language sql as $f$
  select coalesce(string_agg(to_char(o.occurrence_on, 'YYYY-MM-DD'), ',' order by o.starts_at), 'none')
  from public._cal_occurrences(p_coach, p_from::timestamptz, p_to::timestamptz) o where o.item_id = p_item;
$f$;

do $t$
declare
  f text[] := '{}';
  tbl text;
  tables text[] := array[
    'coach_call_types', 'coach_polls', 'coach_poll_people', 'coach_poll_options', 'coach_poll_votes', 'coach_booking_links',
    'coach_leads', 'coach_cal_items', 'coach_cal_guests', 'coach_open_blocks', 'coach_bookings', 'coach_cal_reminder_sends',
    'coach_connections'];
  own_u uuid; maya_u uuid; ella_u uuid; sam_u uuid;
  own_c uuid; maya_c uuid;
  ella_email text; sam_email text;
  p_ella uuid := gen_random_uuid();  -- Maya's client, with an account, in New York
  p_sam uuid := gen_random_uuid();   -- the owner's client, with an account
  eng_e uuid := gen_random_uuid();   -- Ella's engagement: 3 sessions
  chem uuid := gen_random_uuid(); chem_key uuid := gen_random_uuid();   -- Maya's Chemistry Call and its page
  conn uuid := gen_random_uuid(); conn_key uuid := gen_random_uuid();   -- Maya's Connection Call and its page
  own_type uuid := gen_random_uuid(); own_key uuid := gen_random_uuid(); -- the owner's Chemistry Call
  blk uuid := gen_random_uuid(); blk2 uuid := gen_random_uuid();
  i_ny uuid := gen_random_uuid(); i_phx uuid := gen_random_uuid(); i_syd uuid := gen_random_uuid();
  i_kol uuid := gen_random_uuid(); i_stj uuid := gen_random_uuid();
  i_rep uuid := gen_random_uuid(); i_ex uuid := gen_random_uuid(); i_gone uuid := gen_random_uuid();
  i_pers uuid := gen_random_uuid(); i_call uuid := gen_random_uuid(); i_free uuid := gen_random_uuid();
  i_own uuid := gen_random_uuid();
  lnk uuid := gen_random_uuid(); lnk_key uuid := gen_random_uuid();
  lnk_old uuid := gen_random_uuid(); lnk_old_key uuid := gen_random_uuid();
  lnk_cl uuid := gen_random_uuid(); lnk_cl_key uuid := gen_random_uuid();
  poll uuid := gen_random_uuid(); pp_mia uuid := gen_random_uuid(); pp_paul uuid := gen_random_uuid();
  mia_key uuid := gen_random_uuid(); paul_key uuid := gen_random_uuid();
  o1 uuid := gen_random_uuid(); o2 uuid := gen_random_uuid(); o3 uuid := gen_random_uuid();
  wed10 date[] := array['2026-03-04', '2026-03-11', '2026-03-25', '2026-04-01', '2026-04-08', '2026-09-30', '2026-10-07', '2026-10-21', '2026-10-28', '2026-11-04']::date[];
  -- A Tuesday 7 to 13 days from now, and the Wednesday after it.
  d0 date := current_date + 7 + ((9 - extract(isodow from current_date + 7)::integer) % 7);
  d1 date;
  fixed_now timestamptz;
  g1 uuid; g2 uuid; s1 uuid; s2 uuid;
  v text; j jsonb;
begin
  d1 := d0 + 1;
  fixed_now := pg_temp.t_lon(d0 - 3, '09:00');

  -- 1. Locked down, and recorded.
  foreach tbl in array tables loop
    f := f || pg_temp.t_eq('1a ' || tbl || ' has row security', (select relrowsecurity::text from pg_class where oid = ('public.' || tbl)::regclass), 'true');
    f := f || pg_temp.t_eq('1b ' || tbl || ': nothing for someone signed out', (select count(*)::text from information_schema.role_table_grants where grantee in ('anon', 'public', 'PUBLIC') and table_schema = 'public' and table_name = tbl), '0');
    f := f || pg_temp.t_eq('1c ' || tbl || ': every rule is for signed-in people', (select count(*)::text from pg_policies where schemaname = 'public' and tablename = tbl and roles <> '{authenticated}'), '0');
    if tbl <> 'coach_connections' then
      f := f || pg_temp.t_eq('1d ' || tbl || ': has at least one rule', (select (count(*) > 0)::text from pg_policies where schemaname = 'public' and tablename = tbl), 'true');
    end if;
  end loop;
  f := f || pg_temp.t_eq('1e connections: no rule and no grant for any person', (select concat(
      (select count(*) from pg_policies where schemaname = 'public' and tablename = 'coach_connections'), '/',
      (select count(*) from information_schema.role_table_grants where grantee = 'authenticated' and table_schema = 'public' and table_name = 'coach_connections'))), '0/0');
  if to_regclass('public.migration_log') is not null then
    f := f || pg_temp.t_eq('1f the migration recorded itself, once', (select count(*)::text from public.migration_log where number = 51 and name = '051_coach_calendar'), '1');
  end if;
  f := f || pg_temp.t_eq('1g bookings, votes and reminder sends: signed-in people may only read them', (select string_agg(table_name || ':' || privs, ' ' order by table_name) from (
      select table_name, string_agg(privilege_type, ',' order by privilege_type) as privs from information_schema.role_table_grants
      where grantee = 'authenticated' and table_schema = 'public' and table_name in ('coach_bookings', 'coach_poll_votes', 'coach_cal_reminder_sends') group by 1) x),
    'coach_bookings:SELECT coach_cal_reminder_sends:SELECT coach_poll_votes:SELECT');
  f := f || pg_temp.t_eq('1h the page, guest and poll functions are open to someone signed out', (select concat(
      has_function_privilege('anon', 'public.booking_page(uuid)', 'execute'),
      has_function_privilege('anon', 'public.booking_free_times(uuid, timestamptz, timestamptz)', 'execute'),
      has_function_privilege('anon', 'public.booking_make(uuid, timestamptz, text, text, text, jsonb, boolean)', 'execute'),
      has_function_privilege('anon', 'public.booking_mine(uuid)', 'execute'),
      has_function_privilege('anon', 'public.booking_move_times(uuid, timestamptz, timestamptz)', 'execute'),
      has_function_privilege('anon', 'public.booking_move(uuid, timestamptz, boolean)', 'execute'),
      has_function_privilege('anon', 'public.booking_cancel(uuid)', 'execute'),
      has_function_privilege('anon', 'public.poll_page(uuid)', 'execute'),
      has_function_privilege('anon', 'public.poll_vote(uuid, jsonb)', 'execute'))), 'ttttttttt');
  f := f || pg_temp.t_eq('1i the client''s and the coach''s functions are closed to someone signed out', (select concat(
      has_function_privilege('anon', 'public.my_booking_times(timestamptz, timestamptz, integer)', 'execute'),
      has_function_privilege('anon', 'public.my_sessions_coming()', 'execute'),
      has_function_privilege('anon', 'public.my_session_book(timestamptz, integer)', 'execute'),
      has_function_privilege('anon', 'public.my_session_move(uuid, timestamptz, boolean)', 'execute'),
      has_function_privilege('anon', 'public.my_session_cancel(uuid, boolean)', 'execute'),
      has_function_privilege('anon', 'public.coach_call_types_start()', 'execute'),
      has_function_privilege('anon', 'public.coach_connections_mine()', 'execute'),
      has_function_privilege('anon', 'public.coach_owns_cal_item(uuid)', 'execute'),
      has_function_privilege('anon', 'public.coach_owns_poll(uuid)', 'execute'))), 'fffffffff');
  f := f || pg_temp.t_eq('1j the inner workings are closed to every person', (select concat(
      has_function_privilege('authenticated', 'public._cal_occurrences(uuid, timestamptz, timestamptz)', 'execute'),
      has_function_privilege('anon', 'public._cal_occurrences(uuid, timestamptz, timestamptz)', 'execute'),
      has_function_privilege('authenticated', 'public._cal_free_times(uuid, text, integer, integer, integer, integer, integer, integer, timestamptz, timestamptz, uuid, uuid, timestamptz)', 'execute'),
      has_function_privilege('anon', 'public._booking_target(uuid)', 'execute'),
      has_function_privilege('authenticated', 'public._booking_target(uuid)', 'execute'),
      has_function_privilege('authenticated', 'public._my_coaching()', 'execute'),
      has_function_privilege('authenticated', 'public._cal_setting(uuid, text, integer, integer, integer)', 'execute'),
      has_function_privilege('authenticated', 'public._cal_lock(uuid)', 'execute'))), 'ffffffff');
  f := f || pg_temp.t_eq('1k the email server''s functions are the server''s alone', (select concat(
      has_function_privilege('authenticated', 'public.cal_reminders_coming(timestamptz)', 'execute'),
      has_function_privilege('anon', 'public.cal_reminder_claim(uuid, text, timestamptz, integer)', 'execute'),
      has_function_privilege('authenticated', 'public.cal_reminder_claim(uuid, text, timestamptz, integer)', 'execute'),
      has_function_privilege('service_role', 'public.cal_reminders_coming(timestamptz)', 'execute'),
      has_function_privilege('service_role', 'public.cal_reminder_claim(uuid, text, timestamptz, integer)', 'execute'))), 'ffftt');

  -- 2. The shape checks.
  f := f || pg_temp.t_eq('2a a repeat: good rules', (select concat(
      public.coach_cal_repeat_ok(null),
      public.coach_cal_repeat_ok('{"every":"week","interval":2,"weekdays":[1,3],"until":"2027-01-31"}'),
      public.coach_cal_repeat_ok('{"every":"month","by":"weekday"}'),
      public.coach_cal_repeat_ok('{"every":"month","by":"date","count":12}'),
      public.coach_cal_repeat_ok('{"every":"day","count":730}'))), 'ttttt');
  f := f || pg_temp.t_eq('2b a repeat: bad rules', (select concat(
      public.coach_cal_repeat_ok('{"every":"fortnight"}'),
      public.coach_cal_repeat_ok('{"every":"week","by":"weekday"}'),
      public.coach_cal_repeat_ok('{"every":"month","by":"moon"}'),
      public.coach_cal_repeat_ok('{"every":"day","count":0}'),
      public.coach_cal_repeat_ok('{"every":"day","count":731}'),
      public.coach_cal_repeat_ok('{"every":"day","count":1.5}'),
      public.coach_cal_repeat_ok('{"every":"day","count":"3"}'))), 'fffffff');
  f := f || pg_temp.t_eq('2c reminders', (select concat(
      public.coach_cal_reminders_ok('[]'),
      public.coach_cal_reminders_ok('[{"minutes":60,"by":"email"},{"minutes":0,"by":"phone"}]'),
      public.coach_cal_reminders_ok('[{"minutes":60}]'),
      public.coach_cal_reminders_ok('[{"minutes":-5,"by":"email"}]'),
      public.coach_cal_reminders_ok('[{"minutes":60,"by":"pigeon"}]'),
      public.coach_cal_reminders_ok('{}'),
      public.coach_cal_reminders_ok((select jsonb_agg(jsonb_build_object('minutes', g, 'by', 'email')) from generate_series(1, 6) g)))), 'ttfffff');
  f := f || pg_temp.t_eq('2d questions', (select concat(
      public.coach_cal_questions_ok('[]'),
      public.coach_cal_questions_ok('[{"id":"q1","label":"What would you like from the call?","kind":"long","required":true},{"id":"q2","label":"How did you hear of us?","kind":"choice","options":["A friend","Leading Ideas"]}]'),
      public.coach_cal_questions_ok('[{"id":"q1","label":"  "}]'),
      public.coach_cal_questions_ok('[{"label":"No id"}]'),
      public.coach_cal_questions_ok('[{"id":"q1","label":"x","kind":"video"}]'),
      public.coach_cal_questions_ok('[{"id":"q1","label":"x","options":[7]}]'),
      public.coach_cal_questions_ok((select jsonb_agg(jsonb_build_object('id', 'q' || g, 'label', 'Question')) from generate_series(1, 11) g)))), 'ttfffff');
  f := f || pg_temp.t_eq('2e a meeting link is https only', (select concat(
      public.https_link_ok(null), public.https_link_ok('https://example.invalid/j/123'),
      public.https_link_ok('http://example.invalid/j/123'), public.https_link_ok('javascript:alert(1)'),
      public.https_link_ok('https://example.invalid/a b'))), 'ttfff');
  f := f || pg_temp.t_eq('2f a real time zone is a place name this database knows', (select concat(
      public.zone_is_real('America/New_York'), public.zone_is_real('Asia/Kolkata'), public.zone_is_real('America/St_Johns'),
      public.zone_is_real('EST'), public.zone_is_real('-05:00'), public.zone_is_real('Mars/Phobos'), public.zone_is_real(null))), 'tttffff');

  begin
    own_u := pg_temp.t_user('owner'); maya_u := pg_temp.t_user('maya'); ella_u := pg_temp.t_user('ella'); sam_u := pg_temp.t_user('sam');
    select email into ella_email from auth.users where id = ella_u;
    select email into sam_email from auth.users where id = sam_u;
    -- an owner may already be on this database; this test's owner is its own
    insert into public.coaches (user_id, role, display_first_name, full_name) values (own_u, 'owner', 'Tess', 'Tess Owner') returning id into own_c;
    insert into public.coaches (user_id, role, display_first_name, full_name) values (maya_u, 'coach', 'Maya', 'Maya Invented') returning id into maya_c;
    perform pg_temp.t_as(maya_u);
    insert into public.client_profiles (id, coach_id, name, email, time_zone) values (p_ella, maya_c, 'Ella Fraser', ella_email, 'America/New_York');
    perform public.client_invite(p_ella);
    insert into public.coach_settings (coach_id, time_zone, working_hours)
    values (maya_c, 'Europe/London', '{"tue":{"from":"09:00","to":"17:00"},"wed":{"from":"09:00","to":"17:00"}}');
    insert into public.engagements (id, coach_id, profile_id, kind, sessions_total) values (eng_e, maya_c, p_ella, 'sessions', 3);
    perform pg_temp.t_as(own_u);
    insert into public.client_profiles (id, coach_id, name, email) values (p_sam, own_c, 'Sam Okafor', sam_email);
    perform public.client_invite(p_sam);
    perform pg_temp.t_as(ella_u);
    f := f || pg_temp.t_eq('0a Ella accepts Maya''s invite', pg_temp.t_n(format('select public.client_accept_invite(%L)', p_ella)), 'linked');
    perform pg_temp.t_as(sam_u);
    f := f || pg_temp.t_eq('0b Sam accepts the owner''s invite', pg_temp.t_n(format('select public.client_accept_invite(%L)', p_sam)), 'linked');

    -- 3. Each coach's calendar is theirs alone.
    perform pg_temp.t_as(maya_u);
    f := f || pg_temp.t_eq('3a Maya makes her two call types', pg_temp.t_rows(format(
      'insert into public.coach_call_types (id, coach_id, key, name, minutes, notice_hours, ahead_weeks, page_key, questions, position) values '
      '(%L, %L, ''chemistry'', ''Chemistry Call'', 30, 24, 4, %L, ''[{"id":"q1","label":"What would you like from the call?","kind":"long"}]'', 0), '
      '(%L, %L, ''connection'', ''Connection Call'', 30, 48, 3, %L, ''[]'', 1)', chem, maya_c, chem_key, conn, maya_c, conn_key)), '2');
    f := f || pg_temp.t_eq('3b a second Chemistry Call for one coach is refused', pg_temp.t_rows(format('insert into public.coach_call_types (coach_id, key, name) values (%L, ''chemistry'', ''Another'')', maya_c)), 'error 23505');
    f := f || pg_temp.t_eq('3c a 20-minute call type is refused', pg_temp.t_rows(format('insert into public.coach_call_types (coach_id, key, name, minutes) values (%L, ''short'', ''Short'', 20)', maya_c)), 'error 23514');
    f := f || pg_temp.t_eq('3d her training, every Tuesday, a personal item and a free one', pg_temp.t_rows(format(
      'insert into public.coach_cal_items (id, coach_id, kind, calendar, title, starts_at, ends_at, time_zone, repeat_rule, busy, private, reminders, notes) values '
      '(%L, %L, ''own_time'', ''work'', ''Training'', %L, %L, ''Europe/London'', ''{"every":"week"}'', true, false, ''[{"minutes":30,"by":"phone"}]'', ''Bring the notes''), '
      '(%L, %L, ''other'', ''family'', ''Swimming with Esme'', %L, %L, ''Europe/London'', null, true, true, ''[]'', null), '
      '(%L, %L, ''event'', ''work'', ''Leaders dinner, maybe'', %L, %L, ''Europe/London'', null, false, false, ''[]'', null)',
      i_rep, maya_c, pg_temp.t_lon(d0 - 14, '07:00'), pg_temp.t_lon(d0 - 14, '08:30'),
      i_pers, maya_c, pg_temp.t_lon(d0, '10:30'), pg_temp.t_lon(d0, '11:00'),
      i_free, maya_c, pg_temp.t_lon(d0, '11:00'), pg_temp.t_lon(d0, '12:00'))), '3');
    f := f || pg_temp.t_eq('3e an offset is never a time zone', pg_temp.t_rows(format('insert into public.coach_cal_items (coach_id, title, starts_at, ends_at, time_zone) values (%L, ''x'', now(), now() + interval ''1 hour'', ''-05:00'')', maya_c)), 'error 22023');
    f := f || pg_temp.t_eq('3f nor are letters, nor a place that doesn''t exist', concat_ws('/',
      pg_temp.t_rows(format('insert into public.coach_cal_items (coach_id, title, starts_at, ends_at, time_zone) values (%L, ''x'', now(), now() + interval ''1 hour'', ''EST'')', maya_c)),
      pg_temp.t_rows(format('insert into public.coach_cal_items (coach_id, title, starts_at, ends_at, time_zone) values (%L, ''x'', now(), now() + interval ''1 hour'', ''Mars/Phobos'')', maya_c))), 'error 22023/error 22023');
    f := f || pg_temp.t_eq('3g an item ends after it starts, and has a zone', concat_ws('/',
      pg_temp.t_rows(format('insert into public.coach_cal_items (coach_id, title, starts_at, ends_at, time_zone) values (%L, ''x'', now(), now(), ''Europe/London'')', maya_c)),
      pg_temp.t_rows(format('insert into public.coach_cal_items (coach_id, title, starts_at, ends_at) values (%L, ''x'', now(), now() + interval ''1 hour'')', maya_c))), 'error 23514/error 22023');
    f := f || pg_temp.t_eq('3h an all-day item has its days; a timed one has none', concat_ws('/',
      pg_temp.t_rows(format('insert into public.coach_cal_items (coach_id, kind, title, starts_at, ends_at, time_zone, all_day, starts_on, ends_on) values (%L, ''travel'', ''Conference, Lisbon'', %L, %L, ''Europe/Lisbon'', true, %L, %L)', maya_c, ((d0 + 20)::timestamp at time zone 'Europe/Lisbon'), ((d0 + 23)::timestamp at time zone 'Europe/Lisbon'), d0 + 20, d0 + 22)),
      pg_temp.t_rows(format('insert into public.coach_cal_items (coach_id, title, starts_at, ends_at, time_zone, all_day) values (%L, ''x'', now(), now() + interval ''1 day'', ''Europe/London'', true)', maya_c)),
      pg_temp.t_rows(format('insert into public.coach_cal_items (coach_id, title, starts_at, ends_at, time_zone, starts_on, ends_on) values (%L, ''x'', now(), now() + interval ''1 hour'', ''Europe/London'', current_date, current_date)', maya_c))), '1/error 23514/error 23514');
    f := f || pg_temp.t_eq('3i a meeting link that isn''t https is refused', pg_temp.t_rows(format('update public.coach_cal_items set meeting_link = ''http://example.invalid/j/1'' where id = %L', i_free)), 'error 23514');
    f := f || pg_temp.t_eq('3j Maya can''t put the owner''s client on her calendar', pg_temp.t_rows(format('insert into public.coach_cal_items (coach_id, kind, title, starts_at, ends_at, time_zone, profile_id) values (%L, ''client_call'', ''Sam'', now(), now() + interval ''1 hour'', ''Europe/London'', %L)', maya_c, p_sam)), 'error 42501');
    f := f || pg_temp.t_eq('3k nor add an item to the owner''s calendar', pg_temp.t_rows(format('insert into public.coach_cal_items (coach_id, title, starts_at, ends_at, time_zone) values (%L, ''x'', now(), now() + interval ''1 hour'', ''Europe/London'')', own_c)), 'error 42501');
    f := f || pg_temp.t_eq('3l a guest with a name, one with an email, and one with neither', concat_ws('/',
      pg_temp.t_rows(format('insert into public.coach_cal_guests (item_id, coach_id, name, email) values (%L, %L, ''Dana Whitfield'', ''dana@example.invalid''), (%L, %L, ''Paul Garner'', null)', i_free, maya_c, i_free, maya_c)),
      pg_temp.t_rows(format('insert into public.coach_cal_guests (item_id, coach_id) values (%L, %L)', i_free, maya_c)),
      pg_temp.t_rows(format('insert into public.coach_cal_guests (item_id, coach_id, email) values (%L, %L, ''dana@example.invalid'')', i_free, maya_c))), '2/error 23514/error 23505');
    f := f || pg_temp.t_eq('3m her open times for the two days', pg_temp.t_rows(format(
      'insert into public.coach_open_blocks (id, coach_id, starts_at, ends_at, time_zone) values (%L, %L, %L, %L, ''Europe/London''), (%L, %L, %L, %L, ''Europe/London'')',
      blk, maya_c, pg_temp.t_lon(d0, '10:00'), pg_temp.t_lon(d0, '12:00'), blk2, maya_c, pg_temp.t_lon(d1, '10:00'), pg_temp.t_lon(d1, '16:00'))), '2');
    f := f || pg_temp.t_eq('3n an open time off the quarter hour, or 6 weeks ahead, is refused', concat_ws('/',
      pg_temp.t_rows(format('insert into public.coach_open_blocks (coach_id, starts_at, ends_at, time_zone) values (%L, %L, %L, ''Europe/London'')', maya_c, pg_temp.t_lon(d0, '13:10'), pg_temp.t_lon(d0, '14:00'))),
      pg_temp.t_rows(format('insert into public.coach_open_blocks (coach_id, starts_at, ends_at, time_zone) values (%L, %L, %L, ''Europe/London'')', maya_c, pg_temp.t_lon(current_date + 42, '10:00'), pg_temp.t_lon(current_date + 42, '11:00')))), 'error 23514/error 22023');

    perform pg_temp.t_as(own_u);
    f := f || pg_temp.t_eq('3o the owner makes their own call type and a personal item', concat(
      pg_temp.t_rows(format('insert into public.coach_call_types (id, coach_id, key, name, page_key) values (%L, %L, ''chemistry'', ''Chemistry Call'', %L)', own_type, own_c, own_key)),
      pg_temp.t_rows(format('insert into public.coach_cal_items (id, coach_id, kind, calendar, title, starts_at, ends_at, time_zone, private) values (%L, %L, ''other'', ''personal'', ''Dentist'', %L, %L, ''Europe/London'', true)', i_own, own_c, pg_temp.t_lon(d0, '10:00'), pg_temp.t_lon(d0, '11:00')))), '11');
    f := f || pg_temp.t_eq('3p the owner reads nothing of Maya''s calendar, call types, open times or guests', (select concat_ws('/',
      (select count(*) from public.coach_cal_items where coach_id = maya_c), (select count(*) from public.coach_call_types where coach_id = maya_c),
      (select count(*) from public.coach_open_blocks where coach_id = maya_c), (select count(*) from public.coach_cal_guests where coach_id = maya_c),
      (select count(*) from public.coach_cal_items))), '0/0/0/0/1');
    f := f || pg_temp.t_eq('3q nor changes or deletes any of it', concat_ws('/',
      pg_temp.t_rows(format('update public.coach_cal_items set title = ''Seen'' where id = %L', i_pers)),
      pg_temp.t_rows(format('delete from public.coach_cal_items where id = %L', i_rep)),
      pg_temp.t_rows(format('update public.coach_call_types set active = false where id = %L', chem)),
      pg_temp.t_rows(format('delete from public.coach_open_blocks where id = %L', blk))), '0/0/0/0');
    perform pg_temp.t_as(maya_u);
    f := f || pg_temp.t_eq('3r and Maya reads nothing of the owner''s (the Dentist is never hers to see)', (select concat_ws('/',
      (select count(*) from public.coach_cal_items where coach_id = own_c), (select count(*) from public.coach_call_types where coach_id = own_c),
      (select count(*) from public.coach_cal_items where title = 'Dentist'))), '0/0/0');
    f := f || pg_temp.t_eq('3s a plain save can''t give an item to another coach: it stays hers', concat(
      pg_temp.t_rows(format('update public.coach_cal_items set coach_id = %L where id = %L', own_c, i_free)), '/',
      pg_temp.t_n(format('select (coach_id = %L)::text from public.coach_cal_items where id = %L', maya_c, i_free))), '1/true');
    perform pg_temp.t_as(ella_u);
    f := f || pg_temp.t_eq('3t a client reads no calendar table', (select concat_ws('/',
      (select count(*) from public.coach_cal_items), (select count(*) from public.coach_call_types), (select count(*) from public.coach_open_blocks),
      (select count(*) from public.coach_bookings), (select count(*) from public.coach_polls), (select count(*) from public.coach_leads))), '0/0/0/0/0/0');
    perform pg_temp.t_anon();
    f := f || pg_temp.t_eq('3u someone signed out reads no table at all', concat_ws('/',
      pg_temp.t_n('select count(*) from public.coach_cal_items'), pg_temp.t_n('select count(*) from public.coach_call_types'),
      pg_temp.t_n('select count(*) from public.coach_bookings'), pg_temp.t_n('select count(*) from public.coach_open_blocks'),
      pg_temp.t_n('select count(*) from public.coach_leads'), pg_temp.t_n('select count(*) from public.coach_connections')),
      'error 42501/error 42501/error 42501/error 42501/error 42501/error 42501');

    -- 4. Time zones: a rule in the anchor zone never drifts.
    perform pg_temp.t_as(maya_u);
    f := f || pg_temp.t_eq('4a five series, each anchored where the client is', pg_temp.t_rows(format(
      'insert into public.coach_cal_items (id, coach_id, kind, title, starts_at, ends_at, time_zone, repeat_rule, busy) values '
      '(%L, %L, ''client_call'', ''New York, Mondays 07:30'', timestamp ''2026-10-19 07:30'' at time zone ''America/New_York'', timestamp ''2026-10-19 08:30'' at time zone ''America/New_York'', ''America/New_York'', ''{"every":"week"}'', false), '
      '(%L, %L, ''client_call'', ''Phoenix, Wednesdays 09:00'', timestamp ''2026-01-07 09:00'' at time zone ''America/Phoenix'', timestamp ''2026-01-07 10:00'' at time zone ''America/Phoenix'', ''America/Phoenix'', ''{"every":"week"}'', false), '
      '(%L, %L, ''client_call'', ''Sydney, Wednesdays 09:00'', timestamp ''2026-01-07 09:00'' at time zone ''Australia/Sydney'', timestamp ''2026-01-07 10:00'' at time zone ''Australia/Sydney'', ''Australia/Sydney'', ''{"every":"week"}'', false), '
      '(%L, %L, ''client_call'', ''Kolkata, Wednesdays 09:00'', timestamp ''2026-01-07 09:00'' at time zone ''Asia/Kolkata'', timestamp ''2026-01-07 10:00'' at time zone ''Asia/Kolkata'', ''Asia/Kolkata'', ''{"every":"week"}'', false), '
      '(%L, %L, ''client_call'', ''St John''''s, Wednesdays 09:00'', timestamp ''2026-01-07 09:00'' at time zone ''America/St_Johns'', timestamp ''2026-01-07 10:00'' at time zone ''America/St_Johns'', ''America/St_Johns'', ''{"every":"week"}'', false)',
      i_ny, maya_c, i_phx, maya_c, i_syd, maya_c, i_kol, maya_c, i_stj, maya_c)), '5');
    perform pg_temp.t_admin();
    f := f || pg_temp.t_eq('4b New York stays 07:30 through 25 Oct and 1 Nov 2026', (select string_agg(to_char(o.starts_at at time zone 'America/New_York', 'Dy DD Mon HH24:MI'), ', ' order by o.starts_at)
      from public._cal_occurrences(maya_c, '2026-10-18', '2026-11-08') o where o.item_id = i_ny), 'Mon 19 Oct 07:30, Mon 26 Oct 07:30, Mon 02 Nov 07:30');
    f := f || pg_temp.t_eq('4c while the coach''s UK time goes 12:30, 11:30, 12:30', (select string_agg(to_char(o.starts_at at time zone 'Europe/London', 'HH24:MI'), ', ' order by o.starts_at)
      from public._cal_occurrences(maya_c, '2026-10-18', '2026-11-08') o where o.item_id = i_ny), '12:30, 11:30, 12:30');
    f := f || pg_temp.t_eq('4d Phoenix never changes its clocks; the UK does', pg_temp.t_uk(maya_c, i_phx, wed10),
      '04 16:00,11 16:00,25 16:00,01 17:00,08 17:00,30 17:00,07 17:00,21 17:00,28 16:00,04 16:00');
    f := f || pg_temp.t_eq('4e Sydney changes the other way, and its morning is the day before in the UK', pg_temp.t_uk(maya_c, i_syd, wed10),
      '03 22:00,10 22:00,24 22:00,31 23:00,08 00:00,30 00:00,06 23:00,20 23:00,27 22:00,03 22:00');
    f := f || pg_temp.t_eq('4f Kolkata is never rounded to the hour', pg_temp.t_uk(maya_c, i_kol, wed10),
      '04 03:30,11 03:30,25 03:30,01 04:30,08 04:30,30 04:30,07 04:30,21 04:30,28 03:30,04 03:30');
    f := f || pg_temp.t_eq('4g St John''s, a half-hour zone that changes on the US dates', pg_temp.t_uk(maya_c, i_stj, wed10),
      '04 12:30,11 11:30,25 11:30,01 12:30,08 12:30,30 12:30,07 12:30,21 12:30,28 11:30,04 12:30');
    f := f || pg_temp.t_eq('4h every one of the year''s calls is at 09:00 where the client is', (select string_agg(x.n || ' at ' || x.t, ', ' order by x.title) from (
      select i.title, count(*) as n, string_agg(distinct to_char(o.starts_at at time zone i.time_zone, 'HH24:MI'), '+') as t
      from public._cal_occurrences(maya_c, '2026-01-01', '2027-01-01') o join public.coach_cal_items i on i.id = o.item_id
      where o.item_id in (i_phx, i_syd, i_kol, i_stj) group by i.title) x), '52 at 09:00, 52 at 09:00, 52 at 09:00, 52 at 09:00');
    f := f || pg_temp.t_eq('4i every start is on a quarter hour in the client''s own time', (select count(*)::text
      from public._cal_occurrences(maya_c, '2026-01-01', '2027-01-01') o join public.coach_cal_items i on i.id = o.item_id
      where o.item_id in (i_ny, i_phx, i_syd, i_kol, i_stj) and extract(minute from (o.starts_at at time zone i.time_zone))::integer % 15 <> 0), '0');
    delete from public.coach_cal_items where id in (i_ny, i_phx, i_syd, i_kol, i_stj);

    -- 5. Repeats.
    perform pg_temp.t_as(maya_u);
    f := f || pg_temp.t_eq('5a five more rules', pg_temp.t_rows(format(
      'insert into public.coach_cal_items (id, coach_id, title, starts_at, ends_at, time_zone, repeat_rule, busy) values '
      '(%L, %L, ''Every 2 weeks, Mon and Wed'', timestamp ''2027-03-01 09:00'' at time zone ''Europe/London'', timestamp ''2027-03-01 10:00'' at time zone ''Europe/London'', ''Europe/London'', ''{"every":"week","interval":2,"weekdays":[1,3]}'', false), '
      '(%L, %L, ''The 3rd Tuesday'', timestamp ''2027-03-16 09:00'' at time zone ''Europe/London'', timestamp ''2027-03-16 10:00'' at time zone ''Europe/London'', ''Europe/London'', ''{"every":"month","by":"weekday"}'', false), '
      '(%L, %L, ''The 31st'', timestamp ''2027-01-31 09:00'' at time zone ''Europe/London'', timestamp ''2027-01-31 10:00'' at time zone ''Europe/London'', ''Europe/London'', ''{"every":"month"}'', false), '
      '(%L, %L, ''Three times'', timestamp ''2027-03-01 09:00'' at time zone ''Europe/London'', timestamp ''2027-03-01 10:00'' at time zone ''Europe/London'', ''Europe/London'', ''{"every":"day","count":3}'', false), '
      '(%L, %L, ''Weekdays until the 9th'', timestamp ''2027-03-04 09:00'' at time zone ''Europe/London'', timestamp ''2027-03-04 10:00'' at time zone ''Europe/London'', ''Europe/London'', ''{"every":"weekday","until":"2027-03-09"}'', false)',
      i_ny, maya_c, i_phx, maya_c, i_syd, maya_c, i_kol, maya_c, i_stj, maya_c)), '5');
    perform pg_temp.t_admin();
    f := f || pg_temp.t_eq('5b every 2 weeks on Monday and Wednesday', pg_temp.t_days(maya_c, i_ny, '2027-03-01', '2027-04-01'), '2027-03-01,2027-03-03,2027-03-15,2027-03-17,2027-03-29,2027-03-31');
    f := f || pg_temp.t_eq('5c the 3rd Tuesday of each month', pg_temp.t_days(maya_c, i_phx, '2027-03-01', '2027-07-01'), '2027-03-16,2027-04-20,2027-05-18,2027-06-15');
    f := f || pg_temp.t_eq('5d the 31st, or the month''s last day', pg_temp.t_days(maya_c, i_syd, '2027-01-01', '2027-06-01'), '2027-01-31,2027-02-28,2027-03-31,2027-04-30,2027-05-31');
    f := f || pg_temp.t_eq('5e a count stops it, wherever the question starts', concat(pg_temp.t_days(maya_c, i_kol, '2027-03-01', '2027-04-01'), ' / ', pg_temp.t_days(maya_c, i_kol, '2027-03-03', '2027-04-01'), ' / ', pg_temp.t_days(maya_c, i_kol, '2027-03-04', '2027-04-01')),
      '2027-03-01,2027-03-02,2027-03-03 / 2027-03-03 / none');
    f := f || pg_temp.t_eq('5f weekdays until an end date', pg_temp.t_days(maya_c, i_stj, '2027-03-01', '2027-04-01'), '2027-03-04,2027-03-05,2027-03-08,2027-03-09');
    f := f || pg_temp.t_eq('5g the 09:00 stays 09:00 across the UK''s clock change (28 Mar 2027)', (select string_agg(to_char(o.starts_at at time zone 'UTC', 'DD HH24:MI'), ',' order by o.starts_at)
      from public._cal_occurrences(maya_c, '2027-03-14', '2027-04-01') o where o.item_id = i_ny), '15 09:00,17 09:00,29 08:00,31 08:00');
    perform pg_temp.t_as(maya_u);
    f := f || pg_temp.t_eq('5h "this one": one time moved to the afternoon, another removed', pg_temp.t_rows(format(
      'insert into public.coach_cal_items (id, coach_id, title, starts_at, ends_at, time_zone, series_id, occurrence_on, removed, busy) values '
      '(%L, %L, ''Every 2 weeks, moved'', timestamp ''2027-03-03 15:00'' at time zone ''Europe/London'', timestamp ''2027-03-03 16:00'' at time zone ''Europe/London'', ''Europe/London'', %L, ''2027-03-03'', false, false), '
      '(%L, %L, ''Every 2 weeks, removed'', timestamp ''2027-03-15 09:00'' at time zone ''Europe/London'', timestamp ''2027-03-15 10:00'' at time zone ''Europe/London'', ''Europe/London'', %L, ''2027-03-15'', true, false)',
      i_ex, maya_c, i_ny, i_gone, maya_c, i_ny)), '2');
    f := f || pg_temp.t_eq('5i a second stand-in for the same time is refused', pg_temp.t_rows(format('insert into public.coach_cal_items (coach_id, title, starts_at, ends_at, time_zone, series_id, occurrence_on) values (%L, ''x'', now(), now() + interval ''1 hour'', ''Europe/London'', %L, ''2027-03-03'')', maya_c, i_ny)), 'error 23505');
    perform pg_temp.t_admin();
    f := f || pg_temp.t_eq('5j the series leaves both out; the moved one shows at its new time', (select concat(pg_temp.t_days(maya_c, i_ny, '2027-03-01', '2027-03-20'), ' / ',
      (select to_char(o.starts_at at time zone 'Europe/London', 'DD HH24:MI') from public._cal_occurrences(maya_c, '2027-03-01', '2027-03-20') o where o.item_id = i_ex), ' / ',
      (select count(*) from public._cal_occurrences(maya_c, '2027-03-01', '2027-03-20') o where o.item_id = i_gone))), '2027-03-01,2027-03-17 / 03 15:00 / 0');
    delete from public.coach_cal_items where id in (i_ny, i_phx, i_syd, i_kol, i_stj);
    f := f || pg_temp.t_eq('5k deleting a series takes its stand-ins with it', (select count(*)::text from public.coach_cal_items where id in (i_ex, i_gone)), '0');

    -- 6. Free times, worked out at a fixed moment (three days before the Tuesday, 09:00 London).
    f := f || pg_temp.t_eq('6a quarter hours inside the open block, less the personal item (which only counts as busy)', (select string_agg(to_char(x at time zone 'Europe/London', 'HH24:MI'), ',' order by x)
      from public._cal_free_times(maya_c, 'open', 30, 15, 15, 24, 4, 5, pg_temp.t_lon(d0, '00:00'), pg_temp.t_lon(d1, '00:00'), null, chem, fixed_now) x), '10:00,11:00,11:15,11:30');
    f := f || pg_temp.t_eq('6b the item marked free blocks nothing; a 60-minute call fits once', (select string_agg(to_char(x at time zone 'Europe/London', 'HH24:MI'), ',' order by x)
      from public._cal_free_times(maya_c, 'open', 60, 15, 15, 24, 4, 5, pg_temp.t_lon(d0, '00:00'), pg_temp.t_lon(d1, '00:00'), null, chem, fixed_now) x), '11:00');
    update public.coach_cal_items set kind = 'chemistry', calendar = 'work' where id = i_pers;
    f := f || pg_temp.t_eq('6c the same half hour as a call keeps 15 minutes clear either side', (select string_agg(to_char(x at time zone 'Europe/London', 'HH24:MI'), ',' order by x)
      from public._cal_free_times(maya_c, 'open', 30, 15, 15, 24, 4, 5, pg_temp.t_lon(d0, '00:00'), pg_temp.t_lon(d1, '00:00'), null, chem, fixed_now) x), '11:15,11:30');
    f := f || pg_temp.t_eq('6d the item being moved doesn''t block its own new time', (select string_agg(to_char(x at time zone 'Europe/London', 'HH24:MI'), ',' order by x)
      from public._cal_free_times(maya_c, 'open', 30, 15, 15, 24, 4, 5, pg_temp.t_lon(d0, '00:00'), pg_temp.t_lon(d1, '00:00'), i_pers, chem, fixed_now) x), '10:00,10:15,10:30,10:45,11:00,11:15,11:30');
    update public.coach_cal_items set kind = 'other', calendar = 'family' where id = i_pers;
    f := f || pg_temp.t_eq('6e the notice needed: 23 and a half hours before 10:00, the first start is 10:30, and 11:00 is the first that is free', (select string_agg(to_char(x at time zone 'Europe/London', 'HH24:MI'), ',' order by x)
      from public._cal_free_times(maya_c, 'open', 30, 15, 15, 24, 4, 5, pg_temp.t_lon(d0, '00:00'), pg_temp.t_lon(d1, '00:00'), null, chem, pg_temp.t_lon(d0, '10:00') - interval '23 hours 30 minutes') x), '11:00,11:15,11:30');
    f := f || pg_temp.t_eq('6f no further ahead than allowed: nothing 5 weeks out with 4 weeks open', (select count(*)::text
      from public._cal_free_times(maya_c, 'open', 30, 15, 15, 24, 4, 5, pg_temp.t_lon(d0, '00:00'), pg_temp.t_lon(d1, '00:00'), null, chem, fixed_now - interval '35 days') x), '0');
    insert into public.coach_away (coach_id, starts_on, ends_on) values (maya_c, d0, d0);
    f := f || pg_temp.t_eq('6g nothing on a day away', (select count(*)::text
      from public._cal_free_times(maya_c, 'open', 30, 15, 15, 24, 4, 5, pg_temp.t_lon(d0, '00:00'), pg_temp.t_lon(d1, '00:00'), null, chem, fixed_now) x), '0');
    delete from public.coach_away where coach_id = maya_c;
    f := f || pg_temp.t_eq('6h the weekly hours (for clients): Tuesday 09:00 to 17:00, less the personal item', (select concat(count(*), ' from ', to_char(min(x) at time zone 'Europe/London', 'HH24:MI'), ' to ', to_char(max(x) at time zone 'Europe/London', 'HH24:MI'))
      from public._cal_free_times(maya_c, 'hours', 60, 15, 15, 24, 4, 5, pg_temp.t_lon(d0, '00:00'), pg_temp.t_lon(d1, '00:00'), null, null, fixed_now) x), '24 from 09:00 to 16:00');
    f := f || pg_temp.t_eq('6i the limits to start with: a 15-minute gap, 5 calls a day', concat_ws('/', public._cal_setting(maya_c, 'gap', 15, 0, 120), public._cal_setting(maya_c, 'per_day', 5, 1, 20)), '15/5');
    update public.coach_settings set booking = '{"gap":"30 minutes","per_day":"1","notice":"48 hours","ahead":"2 weeks","remind_24":true}' where coach_id = maya_c;
    f := f || pg_temp.t_eq('6j a typed limit is read as its number', concat_ws('/', public._cal_setting(maya_c, 'gap', 15, 0, 120), public._cal_setting(maya_c, 'per_day', 5, 1, 20),
      public._cal_setting(maya_c, 'notice', 24, 0, 720), public._cal_setting(maya_c, 'ahead', 4, 1, 12), public._cal_setting(maya_c, 'remind_24', 7, 0, 9)), '30/1/48/2/7');
    update public.coach_cal_items set kind = 'chemistry', calendar = 'work' where id = i_pers;
    f := f || pg_temp.t_eq('6k with 1 call a day at most, a day that holds a call has nothing free', (select count(*)::text
      from public._cal_free_times(maya_c, 'open', 30, 15, 15, 24, 4, 5, pg_temp.t_lon(d0, '00:00'), pg_temp.t_lon(d1, '00:00'), null, chem, fixed_now) x), '0');
    update public.coach_cal_items set kind = 'other', calendar = 'family' where id = i_pers;
    update public.coach_settings set booking = '{}' where coach_id = maya_c;

    -- 7. A booking page, as a guest who is signed out.
    perform pg_temp.t_anon();
    j := public.booking_page(chem_key);
    f := f || pg_temp.t_eq('7a the Chemistry Call page shows its own call', concat_ws('/', j ->> 'state', j ->> 'kind', j ->> 'name', j ->> 'coach_first_name', j ->> 'minutes', j ->> 'notice_hours', j ->> 'ahead_weeks', jsonb_array_length(j -> 'questions')), 'open/page/Chemistry Call/Maya/30/24/4/1');
    f := f || pg_temp.t_eq('7b and never the other one, the coach''s id or anything of the calendar', concat((j::text like '%Connection%'), (j::text like '%' || maya_c || '%'), (j::text like '%Swimming%'), (j::text like '%' || conn_key || '%')), 'ffff');
    f := f || pg_temp.t_eq('7c a key nobody has opens nothing', concat_ws('/', coalesce(public.booking_page(gen_random_uuid())::text, 'nothing'),
      (select count(*) from public.booking_free_times(gen_random_uuid(), now(), now() + interval '30 days')),
      public.booking_make(gen_random_uuid(), pg_temp.t_lon(d0, '10:00'), 'Nadia Osei', 'nadia@example.invalid', 'Europe/London') ->> 'status'), 'nothing/0/not_found');
    f := f || pg_temp.t_eq('7d the free times on the Tuesday', (select string_agg(to_char(starts_at at time zone 'Europe/London', 'HH24:MI'), ',' order by starts_at)
      from public.booking_free_times(chem_key, pg_temp.t_lon(d0, '00:00'), pg_temp.t_lon(d1, '00:00'))), '10:00,11:00,11:15,11:30');
    f := f || pg_temp.t_eq('7e what a booking needs', concat_ws('/',
      public.booking_make(chem_key, pg_temp.t_lon(d0, '10:00'), '  ', 'nadia@example.invalid', 'Europe/London') ->> 'status',
      public.booking_make(chem_key, pg_temp.t_lon(d0, '10:00'), 'Nadia Osei', 'nadia at example', 'Europe/London') ->> 'status',
      public.booking_make(chem_key, pg_temp.t_lon(d0, '10:00'), 'Nadia Osei', 'nadia@example.invalid', 'EST') ->> 'status',
      public.booking_make(chem_key, pg_temp.t_lon(d0, '10:00'), 'Nadia Osei', 'nadia@example.invalid', '+01:00') ->> 'status',
      public.booking_make(chem_key, pg_temp.t_lon(d0, '10:10'), 'Nadia Osei', 'nadia@example.invalid', 'Europe/London') ->> 'status',
      public.booking_make(chem_key, pg_temp.t_lon(d0, '10:00') + interval '30 seconds', 'Nadia Osei', 'nadia@example.invalid', 'Europe/London') ->> 'status',
      public.booking_make(chem_key, pg_temp.t_lon(d0, '10:00'), 'Nadia Osei', 'nadia@example.invalid', 'Europe/London', jsonb_build_object('q1', repeat('a', 30000))) ->> 'status',
      public.booking_make(chem_key, pg_temp.t_lon(d0, '10:15'), 'Nadia Osei', 'nadia@example.invalid', 'Europe/London') ->> 'status',
      public.booking_make(chem_key, pg_temp.t_lon(d0, '09:00'), 'Nadia Osei', 'nadia@example.invalid', 'Europe/London') ->> 'status'),
      'name/email/zone/zone/quarter/quarter/too_long/taken/taken');
    -- 10:00 in London is 23:00 in Auckland: outside 07:00 to 20:00 there.
    f := f || pg_temp.t_eq('7f a start in the guest''s night needs "Show early and late times"', public.booking_make(chem_key, pg_temp.t_lon(d0, '11:30'), 'Aroha Ngata', 'aroha@example.invalid', 'Pacific/Auckland') ->> 'status', 'hours');
    j := public.booking_make(chem_key, pg_temp.t_lon(d0, '11:30'), 'Aroha Ngata', 'Aroha@Example.invalid ', 'Pacific/Auckland', '{"q1":"A clearer year"}', true);
    g2 := (j ->> 'guest_key')::uuid;
    f := f || pg_temp.t_eq('7g with it, the booking is made, anchored to the guest''s own zone', concat_ws('/', j ->> 'status', j ->> 'time_zone', (g2 is not null)), 'booked/Pacific/Auckland/t');
    j := public.booking_make(chem_key, pg_temp.t_lon(d0, '10:00'), 'Nadia Osei', 'nadia@example.invalid', 'Europe/London', '{"q1":"To think out loud"}');
    g1 := (j ->> 'guest_key')::uuid;
    f := f || pg_temp.t_eq('7h Nadia books 10:00', j ->> 'status', 'booked');
    f := f || pg_temp.t_eq('7i a second guest for the same start is refused: one of two always loses', public.booking_make(chem_key, pg_temp.t_lon(d0, '10:00'), 'Dan Reid', 'dan@example.invalid', 'Europe/London') ->> 'status', 'taken');
    f := f || pg_temp.t_eq('7j the Connection Call page can''t take it either (one calendar)', public.booking_make(conn_key, pg_temp.t_lon(d0, '10:00'), 'Dan Reid', 'dan@example.invalid', 'Europe/London') ->> 'status', 'taken');
    f := f || pg_temp.t_eq('7k nothing is free within 15 minutes of either call', (select coalesce(string_agg(to_char(starts_at at time zone 'Europe/London', 'HH24:MI'), ',' order by starts_at), 'none')
      from public.booking_free_times(chem_key, pg_temp.t_lon(d0, '00:00'), pg_temp.t_lon(d1, '00:00'))), 'none');
    j := public.booking_mine(g1);
    f := f || pg_temp.t_eq('7l Nadia''s own booking, by her own key', concat_ws('/', j ->> 'status', j ->> 'name', j ->> 'call_name', j ->> 'coach_first_name', j ->> 'minutes', j ->> 'late', j ->> 'time_zone'), 'booked/Nadia Osei/Chemistry Call/Maya/30/false/Europe/London');
    f := f || pg_temp.t_eq('7m a key nobody has opens no booking', concat_ws('/', coalesce(public.booking_mine(gen_random_uuid())::text, 'nothing'), public.booking_cancel(gen_random_uuid()) ->> 'status', public.booking_move(gen_random_uuid(), pg_temp.t_lon(d1, '10:00')) ->> 'status'), 'nothing/not_found/not_found');

    perform pg_temp.t_admin();
    f := f || pg_temp.t_eq('7n the database itself refuses two bookings on one start', pg_temp.t_rows(format('insert into public.coach_bookings (coach_id, name, time_zone, starts_at, ends_at) values (%L, ''A second'', ''Europe/London'', %L, %L)', maya_c, pg_temp.t_lon(d0, '10:00'), pg_temp.t_lon(d0, '10:30'))), 'error 23505');
    perform pg_temp.t_as(maya_u);
    f := f || pg_temp.t_eq('7o Maya sees both calls on her calendar, in the guests'' own zones, with their leads and the bell', (select concat_ws(' / ',
      (select string_agg(i.title || ' ' || i.kind || ' ' || i.time_zone, ', ' order by i.starts_at) from public.coach_cal_items i where i.kind = 'chemistry'),
      (select string_agg(l.name || ' ' || l.source || ' ' || l.email || ' ' || l.time_zone, ', ' order by l.name) from public.coach_leads l),
      (select count(*) from public.coach_bookings where status = 'booked'),
      (select count(*) from public.coach_notifications n where n.kind = 'booking' and n.title like '% booked Chemistry Call'))),
      'Nadia Osei chemistry Europe/London, Aroha Ngata chemistry Pacific/Auckland / Aroha Ngata chemistry_page aroha@example.invalid Pacific/Auckland, Nadia Osei chemistry_page nadia@example.invalid Europe/London / 2 / 2');
    f := f || pg_temp.t_eq('7p a coach can''t write a booking by a plain save', concat_ws('/',
      pg_temp.t_rows(format('insert into public.coach_bookings (coach_id, name, time_zone, starts_at, ends_at) values (%L, ''x'', ''Europe/London'', now(), now() + interval ''1 hour'')', maya_c)),
      pg_temp.t_rows('update public.coach_bookings set status = ''cancelled''')), 'error 42501/error 42501');
    perform pg_temp.t_as(own_u);
    f := f || pg_temp.t_eq('7q the owner sees none of Maya''s bookings, leads or their notices', (select concat_ws('/', (select count(*) from public.coach_bookings), (select count(*) from public.coach_leads), (select count(*) from public.coach_notifications where title like '%Chemistry Call'))), '0/0/0');

    -- The guest moves, the coach moves, the guest cancels.
    perform pg_temp.t_anon();
    f := f || pg_temp.t_eq('7r Nadia can move to the Wednesday (her own time doesn''t block her)', (select concat(count(*), ' from ', to_char(min(starts_at) at time zone 'Europe/London', 'HH24:MI'))
      from public.booking_move_times(g1, pg_temp.t_lon(d1, '00:00'), pg_temp.t_lon(d1 + 1, '00:00'))), '23 from 10:00');
    f := f || pg_temp.t_eq('7s she moves to Wednesday 10:00; off the quarter hour is refused', concat_ws('/',
      public.booking_move(g1, pg_temp.t_lon(d1, '10:05')) ->> 'status', public.booking_move(g1, pg_temp.t_lon(d1, '10:00')) ->> 'status'), 'quarter/moved');
    f := f || pg_temp.t_eq('7t her old start is free again', (select string_agg(to_char(starts_at at time zone 'Europe/London', 'HH24:MI'), ',' order by starts_at)
      from public.booking_free_times(chem_key, pg_temp.t_lon(d0, '00:00'), pg_temp.t_lon(d1, '00:00'))), '10:00');
    perform pg_temp.t_as(maya_u);
    f := f || pg_temp.t_eq('7u the calendar item moved with her, and says where from', (select concat_ws('/', to_char(i.starts_at at time zone 'Europe/London', 'Dy HH24:MI'), to_char(b.moved_from at time zone 'Europe/London', 'Dy HH24:MI'))
      from public.coach_bookings b join public.coach_cal_items i on i.id = b.item_id where b.guest_key = g1), 'Wed 10:00/Tue 10:00');
    f := f || pg_temp.t_eq('7v Maya drags the call to 12:00: the booking follows', concat(
      pg_temp.t_rows(format('update public.coach_cal_items set starts_at = %L, ends_at = %L, moved_in_google_at = now() where id = (select item_id from public.coach_bookings where guest_key = %L)', pg_temp.t_lon(d1, '12:00'), pg_temp.t_lon(d1, '12:30'), g1)), '/',
      pg_temp.t_n(format('select concat_ws(''/'', to_char(starts_at at time zone ''Europe/London'', ''HH24:MI''), to_char(moved_from at time zone ''Europe/London'', ''HH24:MI''), (moved_in_google_at is not null)) from public.coach_bookings where guest_key = %L', g1))), '1/12:00/10:00/t');
    perform pg_temp.t_anon();
    j := public.booking_cancel(g2);
    v := public.booking_cancel(g2) ->> 'status';
    f := f || pg_temp.t_eq('7w Aroha cancels; a second cancel finds nothing', concat_ws('/', j ->> 'status', j ->> 'late', v, public.booking_mine(g2) ->> 'status'), 'cancelled/false/not_found/cancelled');
    perform pg_temp.t_as(maya_u);
    f := f || pg_temp.t_eq('7x her call is off the calendar and its lead stays', (select concat_ws('/', (select count(*) from public.coach_cal_items where title = 'Aroha Ngata'), (select count(*) from public.coach_leads where name = 'Aroha Ngata'))), '0/1');
    f := f || pg_temp.t_eq('7y Maya deletes Nadia''s call: the booking is cancelled', concat(
      pg_temp.t_rows(format('delete from public.coach_cal_items where id = (select item_id from public.coach_bookings where guest_key = %L)', g1)), '/',
      pg_temp.t_n(format('select status from public.coach_bookings where guest_key = %L', g1))), '1/cancelled');

    -- 3 bookings an email, and 5 calls a day.
    perform pg_temp.t_anon();
    f := f || pg_temp.t_eq('7z one email holds 3 bookings to come, and no more', concat_ws('/',
      public.booking_make(chem_key, pg_temp.t_lon(d1, '10:00'), 'Kit Lowe', 'kit@example.invalid', 'Europe/London') ->> 'status',
      public.booking_make(chem_key, pg_temp.t_lon(d1, '11:00'), 'Kit Lowe', 'kit@example.invalid', 'Europe/London') ->> 'status',
      public.booking_make(chem_key, pg_temp.t_lon(d1, '12:00'), 'Kit Lowe', 'kit@example.invalid', 'Europe/London') ->> 'status',
      public.booking_make(chem_key, pg_temp.t_lon(d1, '13:00'), 'Kit Lowe', 'KIT@example.invalid', 'Europe/London') ->> 'status'), 'booked/booked/booked/too_many');
    f := f || pg_temp.t_eq('7za two more people make 5 calls that day', concat_ws('/',
      public.booking_make(chem_key, pg_temp.t_lon(d1, '13:00'), 'Ruth Adeyemi', 'ruth@example.invalid', 'Europe/London') ->> 'status',
      public.booking_make(conn_key, pg_temp.t_lon(d1, '14:00'), 'Dan Reid', 'dan@example.invalid', 'Europe/London') ->> 'status'), 'booked/booked');
    f := f || pg_temp.t_eq('7zb so nothing more is free that day, on either page, and a sixth is refused', concat_ws('/',
      (select count(*) from public.booking_free_times(chem_key, pg_temp.t_lon(d1, '00:00'), pg_temp.t_lon(d1 + 1, '00:00'))),
      (select count(*) from public.booking_free_times(conn_key, pg_temp.t_lon(d1, '00:00'), pg_temp.t_lon(d1 + 1, '00:00'))),
      public.booking_make(chem_key, pg_temp.t_lon(d1, '15:00'), 'Priya Nair', 'priya@example.invalid', 'Europe/London') ->> 'status'), '0/0/taken');
    perform pg_temp.t_as(maya_u);
    f := f || pg_temp.t_eq('7zc one lead a person, however many bookings; the Connection Call made its own kind', (select concat_ws('/',
      (select count(*) from public.coach_leads where email = 'kit@example.invalid'), (select source from public.coach_leads where email = 'dan@example.invalid'),
      (select kind from public.coach_cal_items where title = 'Dan Reid'))), '1/connection_page/connection');
    f := f || pg_temp.t_eq('7zd a page switched off is closed', concat(
      pg_temp.t_rows(format('update public.coach_call_types set active = false where id = %L', conn)), '/',
      pg_temp.t_n(format('select public.booking_page(%L) ->> ''state''', conn_key)), '/',
      pg_temp.t_n(format('select public.booking_make(%L, %L, ''Late Comer'', ''late@example.invalid'', ''Europe/London'') ->> ''status''', conn_key, pg_temp.t_lon(d0, '10:00')))), '1/closed/closed');

    -- 8. Single-use links.
    f := f || pg_temp.t_eq('8a Maya makes three links: one open, one that ended yesterday, one for her client', pg_temp.t_rows(format(
      'insert into public.coach_booking_links (id, coach_id, key, purpose, for_name, minutes, expires_on, profile_id) values '
      '(%L, %L, %L, ''Sponsor call'', ''Dana Whitfield'', 60, null, null), (%L, %L, %L, ''Old call'', ''Paul Garner'', 30, current_date - 1, null), '
      '(%L, %L, %L, ''Coaching session'', ''Ella Fraser'', 60, null, %L)', lnk, maya_c, lnk_key, lnk_old, maya_c, lnk_old_key, lnk_cl, maya_c, lnk_cl_key, p_ella)), '3');
    f := f || pg_temp.t_eq('8b she can''t make one for the owner''s client', pg_temp.t_rows(format('insert into public.coach_booking_links (coach_id, purpose, profile_id) values (%L, ''x'', %L)', maya_c, p_sam)), 'error 42501');
    perform pg_temp.t_anon();
    j := public.booking_page(lnk_key);
    f := f || pg_temp.t_eq('8c the link''s own page', concat_ws('/', j ->> 'state', j ->> 'kind', j ->> 'name', j ->> 'minutes', j ->> 'coach_first_name', public.booking_page(lnk_old_key) ->> 'state'), 'open/link/Sponsor call/60/Maya/expired');
    v := concat_ws('/',
      public.booking_make(lnk_old_key, pg_temp.t_lon(d0, '11:00'), 'Paul Garner', 'paul@example.invalid', 'Europe/London') ->> 'status',
      public.booking_make(lnk_key, pg_temp.t_lon(d0, '11:00'), 'Dana Whitfield', 'dana@example.invalid', 'Europe/London') ->> 'status',
      public.booking_make(lnk_key, pg_temp.t_lon(d1, '15:00'), 'Dana Whitfield', 'dana@example.invalid', 'Europe/London') ->> 'status');
    f := f || pg_temp.t_eq('8d it books once', concat_ws('/', v, public.booking_page(lnk_key) ->> 'state',
      (select count(*) from public.booking_free_times(lnk_key, now(), now() + interval '30 days'))), 'expired/booked/used/used/0');
    perform pg_temp.t_as(maya_u);
    f := f || pg_temp.t_eq('8e a plain save never makes a used link new again, or gives it another key', concat(
      pg_temp.t_rows(format('update public.coach_booking_links set used_at = null, booking_id = null, key = gen_random_uuid() where id = %L', lnk)), '/',
      pg_temp.t_n(format('select concat_ws(''/'', (used_at is not null), (booking_id is not null), (key = %L)) from public.coach_booking_links where id = %L', lnk_key, lnk))), '1/t/t/t');
    f := f || pg_temp.t_eq('8f its lead says where it came from', (select source from public.coach_leads where email = 'dana@example.invalid'), 'single_use_link');
    perform pg_temp.t_anon();
    -- A client's link offers the coach's weekly hours (Tuesday 09:00 to 17:00), not the open block.
    f := f || pg_temp.t_eq('8g a client''s link offers the weekly hours and books a session', concat_ws('/',
      (select (count(*) > 4)::text from public.booking_free_times(lnk_cl_key, pg_temp.t_lon(d0, '00:00'), pg_temp.t_lon(d1, '00:00'))),
      public.booking_make(lnk_cl_key, pg_temp.t_lon(d0, '15:00'), 'Ella Fraser', ella_email, 'America/New_York') ->> 'status'), 'true/booked');
    perform pg_temp.t_as(maya_u);
    f := f || pg_temp.t_eq('8h the session is on her calendar as a client call in New York time, with no lead', (select concat_ws('/',
      (select concat_ws(' ', i.kind, i.time_zone, (i.session_id is not null), (i.profile_id = p_ella)) from public.coach_cal_items i where i.title = 'Ella Fraser'),
      (select concat_ws(' ', s.minutes, s.kind, (s.engagement_id = eng_e)) from public.coach_sessions s where s.profile_id = p_ella),
      (select count(*) from public.coach_leads where name = 'Ella Fraser'))), 'client_call America/New_York t t/60 coaching t/0');
    f := f || pg_temp.t_eq('8i dragging the call moves its session too', concat(
      pg_temp.t_rows(format('update public.coach_cal_items set starts_at = %L, ends_at = %L where title = ''Ella Fraser''', pg_temp.t_lon(d0, '15:30'), pg_temp.t_lon(d0, '17:00'))), '/',
      pg_temp.t_n(format('select concat_ws('' '', to_char(starts_at at time zone ''Europe/London'', ''HH24:MI''), minutes) from public.coach_sessions where profile_id = %L', p_ella))), '1/15:30 90');

    -- 9. A poll.
    f := f || pg_temp.t_eq('9a Maya offers three times to Mia and Paul, each held on her calendar', concat_ws('/',
      pg_temp.t_rows(format('insert into public.coach_polls (id, coach_id, title, minutes, time_zone) values (%L, %L, ''Three-way meeting'', 60, ''Europe/London'')', poll, maya_c)),
      pg_temp.t_rows(format('insert into public.coach_poll_people (id, poll_id, coach_id, name, email, time_zone, vote_key) values (%L, %L, %L, ''Mia Torres'', ''mia@example.invalid'', ''America/New_York'', %L), (%L, %L, %L, ''Paul Garner'', ''paul@example.invalid'', ''Europe/London'', %L)', pp_mia, poll, maya_c, mia_key, pp_paul, poll, maya_c, paul_key)),
      pg_temp.t_rows(format('insert into public.coach_poll_options (id, poll_id, coach_id, starts_at, ends_at) values (%L, %L, %L, %L, %L), (%L, %L, %L, %L, %L), (%L, %L, %L, %L, %L)',
        o1, poll, maya_c, pg_temp.t_lon(d0 + 6, '17:00'), pg_temp.t_lon(d0 + 6, '18:00'), o2, poll, maya_c, pg_temp.t_lon(d0 + 7, '17:00'), pg_temp.t_lon(d0 + 7, '18:00'), o3, poll, maya_c, pg_temp.t_lon(d0 + 8, '15:00'), pg_temp.t_lon(d0 + 8, '16:00'))),
      pg_temp.t_rows(format('insert into public.coach_cal_items (coach_id, kind, title, starts_at, ends_at, time_zone, poll_option_id) select %L, ''hold'', ''Mia and Paul'', o.starts_at, o.ends_at, ''Europe/London'', o.id from public.coach_poll_options o where o.poll_id = %L', maya_c, poll))), '1/2/3/3');
    f := f || pg_temp.t_eq('9b a poll offers up to 5 times', concat_ws('/',
      pg_temp.t_rows(format('insert into public.coach_poll_options (poll_id, coach_id, starts_at, ends_at) select %L, %L, now() + g * interval ''1 day'', now() + g * interval ''1 day'' + interval ''1 hour'' from generate_series(40, 41) g', poll, maya_c)),
      pg_temp.t_rows(format('insert into public.coach_poll_options (poll_id, coach_id, starts_at, ends_at) values (%L, %L, now() + interval ''50 days'', now() + interval ''50 days 1 hour'')', poll, maya_c))), '2/error 22023');
    perform pg_temp.t_admin();
    f := f || pg_temp.t_eq('9c a held time counts as busy', (select count(*)::text from public._cal_occurrences(maya_c, pg_temp.t_lon(d0 + 6, '00:00'), pg_temp.t_lon(d0 + 9, '00:00')) o where o.kind = 'hold' and o.busy and not o.is_call), '3');
    perform pg_temp.t_anon();
    j := public.poll_page(mia_key);
    f := f || pg_temp.t_eq('9d Mia opens the poll with her own key: its times, in her zone, and nobody else''s details', concat_ws('/', j ->> 'title', j ->> 'name', j ->> 'time_zone', j ->> 'coach_first_name', jsonb_array_length(j -> 'options'), j ->> 'voted', (j::text like '%Paul%'), (j::text like '%example.invalid%')), 'Three-way meeting/Mia Torres/America/New_York/Maya/5/false/f/f');
    v := concat_ws('/',
      public.poll_vote(mia_key, jsonb_build_object(o1::text, true, o2::text, true, o3::text, false)),
      public.poll_vote(mia_key, jsonb_build_object(o3::text, true, gen_random_uuid()::text, true, o1::text, 'yes')),
      public.poll_vote(gen_random_uuid(), '{}'), public.poll_vote(mia_key, '[]'));
    f := f || pg_temp.t_eq('9e she answers, and can change an answer; Paul''s page never shows hers', concat_ws('/', v,
      (select string_agg(coalesce(o ->> 'can', 'none'), ',' order by o ->> 'starts_at') from jsonb_array_elements(public.poll_page(mia_key) -> 'options') o),
      (select string_agg(coalesce(o ->> 'can', 'none'), ',' order by o ->> 'starts_at') from jsonb_array_elements(public.poll_page(paul_key) -> 'options') o),
      public.poll_page(mia_key) ->> 'voted'),
      'saved/saved/not_found/too_long/true,true,true,none,none/none,none,none,none,none/true');
    perform pg_temp.t_as(maya_u);
    f := f || pg_temp.t_eq('9f Maya reads the answers and is told once; she can''t write one', concat_ws('/',
      (select count(*) from public.coach_poll_votes), (select count(*) from public.coach_notifications where title = 'Mia Torres answered your poll'),
      pg_temp.t_rows(format('insert into public.coach_poll_votes (option_id, person_id, can) values (%L, %L, true)', o1, pp_paul))), '3/1/error 42501');
    perform pg_temp.t_as(own_u);
    f := f || pg_temp.t_eq('9g the owner reads nothing of the poll', (select concat_ws('/', (select count(*) from public.coach_polls), (select count(*) from public.coach_poll_people), (select count(*) from public.coach_poll_options), (select count(*) from public.coach_poll_votes))), '0/0/0/0');
    perform pg_temp.t_as(maya_u);
    update public.coach_polls set status = 'confirmed', confirmed_option_id = o2 where id = poll;
    perform pg_temp.t_anon();
    f := f || pg_temp.t_eq('9h once Maya confirms a time the poll is closed, and says which', concat_ws('/', public.poll_vote(paul_key, jsonb_build_object(o1::text, true)), public.poll_page(paul_key) ->> 'status', (public.poll_page(paul_key) -> 'confirmed' ->> 'starts_at') is not null), 'closed/confirmed/t');
    perform pg_temp.t_as(maya_u);
    f := f || pg_temp.t_eq('9i deleting the poll takes its people, times, answers and held times', concat(
      pg_temp.t_rows(format('delete from public.coach_polls where id = %L', poll)), '/',
      pg_temp.t_n('select concat_ws(''/'', (select count(*) from public.coach_poll_people), (select count(*) from public.coach_poll_options), (select count(*) from public.coach_poll_votes), (select count(*) from public.coach_cal_items where kind = ''hold''))')), '1/0/0/0/0');

    -- 10. The client books, moves and cancels their own sessions.
    perform pg_temp.t_as(ella_u);
    f := f || pg_temp.t_eq('10a Ella sees her session to come, in her own zone', (select concat_ws('/', count(*), min(time_zone), min(coach_first_name), bool_or(late)) from public.my_sessions_coming()), '1/America/New_York/Maya/f');
    f := f || pg_temp.t_eq('10b and her coach''s free times that Wednesday: nothing, with 5 calls already', (select count(*)::text from public.my_booking_times(pg_temp.t_lon(d1, '00:00'), pg_temp.t_lon(d1 + 1, '00:00'))), '0');
    f := f || pg_temp.t_eq('10c the Tuesday after has times, each on a quarter hour for her', (select concat((count(*) > 0), '/', count(*) filter (where extract(minute from (starts_at at time zone 'America/New_York'))::integer % 15 <> 0))
      from public.my_booking_times(pg_temp.t_lon(d0 + 7, '00:00'), pg_temp.t_lon(d0 + 8, '00:00'))), 't/0');
    j := public.my_session_book(pg_temp.t_lon(d0 + 7, '14:00'));
    s1 := (j ->> 'session_id')::uuid;
    f := f || pg_temp.t_eq('10d she books 14:00 London, anchored to her own New York time', concat_ws('/', j ->> 'status', j ->> 'time_zone', extract(minute from ((j ->> 'starts_at')::timestamptz at time zone 'America/New_York'))::integer % 15), 'booked/America/New_York/0');
    f := f || pg_temp.t_eq('10e the same start again, or off the quarter hour, is refused', concat_ws('/',
      public.my_session_book(pg_temp.t_lon(d0 + 7, '14:00')) ->> 'status', public.my_session_book(pg_temp.t_lon(d0 + 7, '16:05')) ->> 'status',
      public.my_session_book(pg_temp.t_lon(d0 + 7, '10:00'), 45) ->> 'status'), 'taken/quarter/taken');
    j := public.my_session_book(pg_temp.t_lon(d0 + 7, '16:00'));
    s2 := (j ->> 'session_id')::uuid;
    f := f || pg_temp.t_eq('10f a third session fills her engagement of 3; a fourth is none_left', concat_ws('/', j ->> 'status', public.my_session_book(pg_temp.t_lon(d0 + 7, '11:00')) ->> 'status'), 'booked/none_left');
    j := public.my_session_move(s1, pg_temp.t_lon(d0 + 7, '12:00'));
    f := f || pg_temp.t_eq('10g with notice, a move is just a move', concat_ws('/', j ->> 'status', j ->> 'late', (j ->> 'session_id')::uuid = s1), 'moved/false/t');
    perform pg_temp.t_as(sam_u);
    f := f || pg_temp.t_eq('10h Sam (the owner''s client) can''t see, move or cancel Ella''s sessions', concat_ws('/',
      (select count(*) from public.my_sessions_coming()), public.my_session_move(s1, pg_temp.t_lon(d0 + 7, '13:00')) ->> 'status', public.my_session_cancel(s1) ->> 'status'), '0/not_found/not_found');
    f := f || pg_temp.t_eq('10i and his coach''s times come from the owner''s own calendar, where only the Dentist is busy', (select string_agg(to_char(starts_at at time zone 'Europe/London', 'HH24:MI'), ',' order by starts_at)
      from public.my_booking_times(pg_temp.t_lon(d0, '09:00'), pg_temp.t_lon(d0, '13:00'))), '09:00,11:00,11:15,11:30,11:45,12:00');
    perform pg_temp.t_anon();
    f := f || pg_temp.t_eq('10j someone signed out can''t ask', concat_ws('/', pg_temp.t_n('select count(*) from public.my_sessions_coming()'), pg_temp.t_n(format('select public.my_session_book(%L)', pg_temp.t_lon(d0 + 7, '11:00')))), 'error 42501/error 42501');
    perform pg_temp.t_as(maya_u);
    f := f || pg_temp.t_eq('10k Maya sees Ella''s bookings and is told', (select concat_ws('/', (select count(*) from public.coach_bookings where source = 'client' and status = 'booked'), (select count(*) from public.coach_notifications where title = 'Ella Fraser booked a session'), (select count(*) from public.coach_notifications where title = 'Ella Fraser moved a session'))), '2/2/1');

    -- The late rule: the session is now 2 hours away.
    perform pg_temp.t_admin();
    update public.coach_cal_items set starts_at = now() + interval '2 hours', ends_at = now() + interval '3 hours' where session_id = s1;
    perform pg_temp.t_as(ella_u);
    f := f || pg_temp.t_eq('10l under 24 hours: she is told first, and nothing changes', concat_ws('/',
      (select bool_or(late) from public.my_sessions_coming()), public.my_session_move(s1, pg_temp.t_lon(d0 + 7, '10:00')) ->> 'status', public.my_session_cancel(s1) ->> 'status',
      (select count(*) from public.my_sessions_coming())), 't/late/late/3');
    j := public.my_session_move(s1, pg_temp.t_lon(d0 + 7, '10:00'), true);
    f := f || pg_temp.t_eq('10m going on moves it: a new session at the new time', concat_ws('/', j ->> 'status', j ->> 'late', (j ->> 'session_id')::uuid <> s1), 'moved/true/t');
    perform pg_temp.t_as(maya_u);
    f := f || pg_temp.t_eq('10n the old one is a late cancellation and uses a session', (select concat_ws('/',
      (select outcome from public.coach_sessions where id = s1), (select sessions_held from public.engagements where id = eng_e),
      (select count(*) from public.coach_cal_items where session_id = s1), (select count(*) from public.coach_bookings where session_id = s1 and status = 'cancelled' and late_cancel))), 'late_cancel/1/0/1');
    perform pg_temp.t_as(ella_u);
    j := public.my_session_cancel(s2);
    f := f || pg_temp.t_eq('10o with notice, a cancelled session is simply taken off', concat_ws('/', j ->> 'status', j ->> 'late', (select count(*) from public.my_sessions_coming())), 'cancelled/false/2');
    perform pg_temp.t_as(maya_u);
    f := f || pg_temp.t_eq('10p and uses nothing', (select concat_ws('/', (select count(*) from public.coach_sessions where id = s2), (select sessions_held from public.engagements where id = eng_e))), '0/1');

    -- 11. Reminders, for the email server only.
    perform pg_temp.t_server();
    f := f || pg_temp.t_eq('11a the calls coming in the next 36 hours: the day-before reminder only (the 1-hour one is off to start)', (select string_agg(concat_ws(' ', r.kind, r.title, r.person_zone, r.coach_first_name), ', ' order by r.title)
      from public.cal_reminders_coming(pg_temp.t_lon(d0, '15:30') - interval '20 hours') r where r.coach_id = maya_c), 'day_before Ella Fraser America/New_York Maya');
    f := f || pg_temp.t_eq('11b a reminder is claimed once', (select concat(
      public.cal_reminder_claim(r.item_id, r.kind, r.occurrence_at, 1), public.cal_reminder_claim(r.item_id, r.kind, r.occurrence_at, 1))
      from public.cal_reminders_coming(pg_temp.t_lon(d0, '15:30') - interval '20 hours') r where r.coach_id = maya_c), 'tf');
    f := f || pg_temp.t_eq('11c and is no longer coming', (select count(*)::text from public.cal_reminders_coming(pg_temp.t_lon(d0, '15:30') - interval '20 hours') r where r.coach_id = maya_c), '0');
    perform pg_temp.t_as(maya_u);
    f := f || pg_temp.t_eq('11d Maya reads what went, can''t write it, and can''t ask what is coming', concat_ws('/',
      (select count(*) from public.coach_cal_reminder_sends), pg_temp.t_rows('delete from public.coach_cal_reminder_sends'), pg_temp.t_n('select count(*) from public.cal_reminders_coming()')), '1/error 42501/error 42501');
    f := f || pg_temp.t_eq('11e Maya turns the 1-hour reminder on', pg_temp.t_rows(format('update public.coach_settings set booking = ''{"remind_1": true}'' where coach_id = %L', maya_c)), '1');
    perform pg_temp.t_server();
    f := f || pg_temp.t_eq('11f so the 1-hour one is coming too, and the day-before one has gone', (select string_agg(r.kind, ',' order by r.kind) from public.cal_reminders_coming(pg_temp.t_lon(d0, '15:30') - interval '20 hours') r where r.coach_id = maya_c), 'hour_before');

    -- 12. Connections, and the two starting call types.
    insert into public.coach_connections (coach_id, service, status, account_label, secret) values (maya_c, 'google_calendar', 'on', 'maya@example.invalid', 'not-a-real-token');
    perform pg_temp.t_as(maya_u);
    f := f || pg_temp.t_eq('12a Maya can''t read the connection''s row, only its status', concat_ws('/',
      pg_temp.t_n('select count(*) from public.coach_connections'),
      (select concat_ws(' ', service, status, account_label) from public.coach_connections_mine()),
      (select (to_jsonb(c)::text like '%not-a-real-token%') from public.coach_connections_mine() c)), 'error 42501/google_calendar on maya@example.invalid/f');
    perform pg_temp.t_as(own_u);
    f := f || pg_temp.t_eq('12b the owner sees nothing of it', (select count(*)::text from public.coach_connections_mine()), '0');
    f := f || pg_temp.t_eq('12c the starting call types are made once: the owner had one, and gains the other', (select concat_ws('/',
      (select string_agg(t.key || ' ' || t.minutes || ' ' || t.notice_hours || ' ' || t.ahead_weeks, ', ' order by t.key) from public.coach_call_types_start() t),
      (select count(*) from public.coach_call_types_start()), (select count(*) from public.coach_call_types where id = own_type))), 'chemistry 30 24 4, connection 30 48 2/2/1');
    perform pg_temp.t_as(ella_u);
    f := f || pg_temp.t_eq('12d a client can''t ask for them', pg_temp.t_n('select count(*) from public.coach_call_types_start()'), 'error 42501');

    perform pg_temp.t_admin();
    raise exception 'undo the test rows' using errcode = 'P0051';
  exception when sqlstate 'P0051' then
    perform pg_temp.t_admin();
  end;

  f := f || pg_temp.t_eq('13 everything the test made is undone', (select concat_ws('/', (select count(*) from auth.users where email like 'p6a-test-%@example.invalid'), (select count(*) from public.coach_cal_items where coach_id = maya_c), (select count(*) from public.coach_bookings where coach_id = maya_c), (select count(*) from public.coach_call_types where id in (chem, conn, own_type)))), '0/0/0/0');

  if cardinality(f) > 0 then
    raise exception E'051 FAILED (%):\n%', cardinality(f), array_to_string(f, E'\n');
  end if;
  raise notice '051 CHECKS PASSED';
end
$t$;
