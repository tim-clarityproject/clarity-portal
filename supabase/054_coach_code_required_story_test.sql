-- =============================================================================
-- 054_coach_code_required_story_test.sql
-- A coach day told as a story, on top of 054_coach_code_required.sql (Phase
-- 6a run 6, the functionality tester). RUN ORDER: 026 to 053, then 054, then
-- this. Safe to run again: everything it makes is undone at the end.
--
-- THE STORY (invented people only)
--   1. Tess, the owner, signs in on a new computer with her password (aal1):
--      the sign-in screens know her as a coach, and nothing else of the
--      coach portal answers: no client, no to-do, no session, no Network,
--      no lead, no poll, and every Today question answers nothing.
--   2. She gives her 6-digit code (aal2) and works her day: her client Sam
--      and yesterday's call; a to-do repeating "2 weeks after I finish it";
--      the recap written and sent once, as her tab shows it (a second
--      tab's older recap is refused); a poll confirmed once; an automation
--      switched off, whose next run is refused; a lead Won then undone, and
--      Cold then brought back; someone added to Network, read through
--      network_page().
--   3. The same day on her phone, password only (aal1, before the code):
--      none of what she made at aal2 is read, changed or sent from there.
--   4. Maya, an associate, at aal1 sees nothing; at aal2 she sees only her
--      own client, none of Tess's, no Network and no leads of Tess's.
--   5. Tess at aal2 sees only the admin facts of Maya's client, never her
--      notes or About them.
--   6. Sam, the client, at aal1 (clients have no code): his coach is Tess,
--      the sent recap is his to read, he writes For next time, and he reads
--      no coach data.
--
--   It ends with the notice 054 STORY PASSED, or stops with FAILED and a
--   list naming each step that failed.
-- =============================================================================
create or replace function pg_temp.s_as(p uuid, p_aal text default 'aal1') returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated', 'aal', p_aal)::text, true);
  perform set_config('role', 'authenticated', true);
end $f$;
create or replace function pg_temp.s_admin() returns void language plpgsql as $f$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
end $f$;
create or replace function pg_temp.s_user(p_label text) returns uuid language plpgsql as $f$
declare u uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, aud, role, email_confirmed_at)
  values (u, 'p6a-story-' || p_label || '-' || u || '@example.invalid', 'authenticated', 'authenticated', now());
  return u;
end $f$;
-- One value, or 'error SQLSTATE'.
create or replace function pg_temp.s_n(p_sql text) returns text language plpgsql as $f$
declare v text;
begin
  execute p_sql into v;
  return coalesce(v, 'null');
exception when others then
  return 'error ' || sqlstate;
end $f$;
-- Rows touched, or 'error SQLSTATE'.
create or replace function pg_temp.s_rows(p_sql text) returns text language plpgsql as $f$
declare n bigint;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n::text;
exception when others then
  return 'error ' || sqlstate;
end $f$;
-- Rows touched, a refusal and 0 rows both read as 'nothing'.
create or replace function pg_temp.s_none(p_sql text) returns text language plpgsql as $f$
declare x text := pg_temp.s_rows(p_sql);
begin
  return case when x in ('0', 'error 42501') then 'nothing' else x end;
end $f$;
-- 'nothing' when a call is refused or answers nothing; otherwise what it gave.
create or replace function pg_temp.s_nothing(p_sql text) returns text language plpgsql as $f$
declare v text; n bigint;
begin
  execute format('select count(*), max(x::text) from (%s) x', p_sql) into n, v;
  if n = 0 or v is null or v in ('(f)', '()', '(null)', '("")', '({})', '([])', '("[]")', '("{}")') then
    return 'nothing';
  end if;
  return 'gave ' || left(v, 80);
exception when others then
  return 'nothing';
end $f$;
create or replace function pg_temp.s_eq(p_name text, p_got text, p_want text) returns text[] language sql as $f$
  select case when p_got is distinct from p_want
              then array[format('%s: expected %s, got %s', p_name, p_want, coalesce(p_got, 'nothing'))]
              else '{}'::text[] end;
$f$;

do $s$
declare
  f text[] := '{}';
  q text;
  tess_u uuid; maya_u uuid; sam_u uuid; kim_u uuid;
  tess_c uuid; maya_c uuid;
  p_sam uuid := gen_random_uuid(); p_kim uuid := gen_random_uuid();
  sess uuid := gen_random_uuid(); todo uuid := gen_random_uuid(); todo_next uuid := gen_random_uuid();
  poll uuid := gen_random_uuid(); opt1 uuid := gen_random_uuid(); opt2 uuid := gen_random_uuid(); item1 uuid := gen_random_uuid();
  auto uuid := gen_random_uuid(); lead uuid := gen_random_uuid(); net uuid := gen_random_uuid();
  maya_todo uuid := gen_random_uuid(); maya_note uuid := gen_random_uuid();
  won timestamptz := '2026-11-20 10:15:30.123+00';
  cold timestamptz := '2026-11-21 09:00:00.456+00';
  v_recap text := 'We agreed three steps for the board review.';
begin
  begin
    -- ---------------------------------------------------------------- the people
    tess_u := pg_temp.s_user('tess'); maya_u := pg_temp.s_user('maya');
    sam_u := pg_temp.s_user('sam'); kim_u := pg_temp.s_user('kim');
    insert into public.coaches (user_id, role, display_first_name) values (tess_u, 'owner', 'Tess') returning id into tess_c;
    insert into public.coaches (user_id, role, display_first_name) values (maya_u, 'coach', 'Maya') returning id into maya_c;
    insert into public.coach_clients (client_id, coach_id) values (sam_u, tess_c), (kim_u, maya_c);

    -- ---------------------------------------------------------------- 1. Tess on a new computer, password only
    perform pg_temp.s_as(tess_u, 'aal1');
    f := f || pg_temp.s_eq('1a the sign-in screens know Tess as a coach', public.coach_auth_state() ->> 'coach', 'true');
    f := f || pg_temp.s_eq('1b she reads only her own coaches row', (select string_agg(display_first_name, ',') from public.coaches), 'Tess');
    f := f || pg_temp.s_eq('1c no client, to-do, session, lead, poll, automation or Network',
      concat_ws('/', (select count(*) from public.client_profiles), (select count(*) from public.coach_todos), (select count(*) from public.coach_sessions),
                (select count(*) from public.coach_leads), (select count(*) from public.coach_polls), (select count(*) from public.coach_automations),
                (select count(*) from public.network_people)), '0/0/0/0/0/0/0');
    f := f || pg_temp.s_eq('1d she can''t add her client or a to-do before the code',
      concat_ws('/', pg_temp.s_rows(format('insert into public.client_profiles (id, coach_id, name) values (%L, %L, ''Sam Story'')', p_sam, tess_c)),
                pg_temp.s_rows(format('insert into public.coach_todos (coach_id, title) values (%L, ''x'')', tess_c))), 'error 42501/error 42501');
    foreach q in array array['select public.coach_client_list()', 'select public.coach_admin_clients()', 'select public.network_page()',
                             'select public.network_counts()', 'select public.coach_lead_stages_start()', 'select public.coach_list()'] loop
      f := f || pg_temp.s_eq('1e Today asks nothing of: ' || q, pg_temp.s_nothing(q), 'nothing');
    end loop;

    -- ---------------------------------------------------------------- 2. the code given: her day
    perform pg_temp.s_as(tess_u, 'aal2');
    f := f || pg_temp.s_eq('2a with the code she adds her client Sam', pg_temp.s_rows(format(
      'insert into public.client_profiles (id, coach_id, name, time_zone) values (%L, %L, ''Sam Story'', ''Europe/London'')', p_sam, tess_c)), '1');
    f := f || pg_temp.s_eq('2b yesterday''s call with Sam', pg_temp.s_rows(format(
      'insert into public.coach_sessions (id, coach_id, profile_id, starts_at, minutes, outcome) values (%L, %L, %L, now() - interval ''1 day'', 60, ''held'')', sess, tess_c, p_sam)), '1');
    f := f || pg_temp.s_eq('2c a to-do repeating "2 weeks after I finish it"', pg_temp.s_rows(format(
      'insert into public.coach_todos (id, coach_id, title, planned_on, repeat_rule) values (%L, %L, ''Send the invoices'', current_date, ''{"every":"week","interval":2,"from":"done"}'')', todo, tess_c)), '1');
    f := f || pg_temp.s_eq('2d ticked, and the next made 2 weeks after the day it was finished', concat_ws('/',
      pg_temp.s_rows(format('update public.coach_todos set done_at = now() where id = %L', todo)),
      pg_temp.s_rows(format('insert into public.coach_todos (id, coach_id, title, planned_on, repeat_rule, repeat_of) values (%L, %L, ''Send the invoices'', current_date + 14, ''{"every":"week","interval":2,"from":"done"}'', %L)', todo_next, tess_c, todo))), '1/1');
    f := f || pg_temp.s_eq('2e the recap is written', pg_temp.s_rows(format('update public.coach_sessions set recap = %L, written_up_at = now() where id = %L', v_recap, sess)), '1');
    f := f || pg_temp.s_eq('2f a second tab''s older recap is not sent', public.session_send_recap(sess, 'An older line.'), 'changed');
    f := f || pg_temp.s_eq('2g the recap as her tab shows it is sent', public.session_send_recap(sess, v_recap), 'sent');
    f := f || pg_temp.s_eq('2h and only once', public.session_send_recap(sess, v_recap), 'already_sent');
    -- 050's guard keeps a sent recap as it was sent (the change is quietly put back, not refused).
    perform pg_temp.s_rows(format('update public.coach_sessions set recap = ''Changed later'' where id = %L', sess));
    f := f || pg_temp.s_eq('2i a sent recap stays as it was sent', (select recap from public.coach_sessions where id = sess), v_recap);
    -- A poll, confirmed once.
    insert into public.coach_polls (id, coach_id, title, time_zone) values (poll, tess_c, 'Story three-way', 'Europe/London');
    insert into public.coach_poll_options (id, poll_id, coach_id, starts_at, ends_at, position) values
      (opt1, poll, tess_c, now() + interval '3 days', now() + interval '3 days 1 hour', 0),
      (opt2, poll, tess_c, now() + interval '4 days', now() + interval '4 days 1 hour', 1);
    f := f || pg_temp.s_eq('2j the poll is confirmed', pg_temp.s_rows(format(
      'update public.coach_polls set status = ''confirmed'', confirmed_option_id = %L, confirmed_item_id = %L where id = %L', opt1, item1, poll)), '1');
    f := f || pg_temp.s_eq('2k a second confirm of the other time is refused', pg_temp.s_rows(format(
      'update public.coach_polls set status = ''confirmed'', confirmed_option_id = %L, confirmed_item_id = %L where id = %L', opt2, gen_random_uuid(), poll)), 'error CC409');
    -- An automation switched off.
    insert into public.coach_automations (id, coach_id, trigger, action, todo_title) values (auto, tess_c, 'lead_won', 'todo', 'Story welcome pack');
    f := f || pg_temp.s_eq('2l she switches the automation off', pg_temp.s_rows(format('update public.coach_automations set active = false where id = %L', auto)), '1');
    f := f || pg_temp.s_eq('2m a run of it is refused while it is off', pg_temp.s_rows(format(
      'insert into public.coach_automation_runs (automation_id, coach_id, event_key) values (%L, %L, ''won:story'')', auto, tess_c)), 'error CC409');
    -- A lead Won then undone; Cold then brought back.
    insert into public.coach_leads (id, coach_id, name) values (lead, tess_c, 'Story lead');
    f := f || pg_temp.s_eq('2n the lead is Won', pg_temp.s_rows(format('update public.coach_leads set won_at = %L where id = %L', won, lead)), '1');
    f := f || pg_temp.s_eq('2o Undo, from the tab that set it', public.lead_unsettle(lead, 'won', won), 'undone');
    f := f || pg_temp.s_eq('2p the lead goes Cold', pg_temp.s_rows(format('update public.coach_leads set cold_at = %L, cold_reason = ''They went quiet.'' where id = %L', cold, lead)), '1');
    f := f || pg_temp.s_eq('2q Bring back', public.lead_unsettle(lead, 'cold', cold), 'undone');
    f := f || pg_temp.s_eq('2r the lead is in the pipeline again', (select (won_at is null and cold_at is null)::text from public.coach_leads where id = lead), 'true');
    -- Network.
    f := f || pg_temp.s_eq('2s someone added to Network', pg_temp.s_rows(format('insert into public.network_people (id, coach_id, name) values (%L, %L, ''Story contact'')', net, tess_c)), '1');
    f := f || pg_temp.s_eq('2t network_page() lists them', pg_temp.s_n('select (public.network_page() ->> ''total'')'), '1');
    f := f || pg_temp.s_eq('2u her day reads back: client, two to-dos, the session, the lead, the poll, the automation',
      concat_ws('/', (select count(*) from public.client_profiles), (select count(*) from public.coach_todos), (select count(*) from public.coach_sessions),
                (select count(*) from public.coach_leads), (select count(*) from public.coach_polls), (select count(*) from public.coach_automations)), '1/2/1/1/1/1');

    -- ---------------------------------------------------------------- 3. her phone, password only
    perform pg_temp.s_as(tess_u, 'aal1');
    f := f || pg_temp.s_eq('3a nothing she made is read before the code',
      concat_ws('/', (select count(*) from public.client_profiles), (select count(*) from public.coach_todos), (select count(*) from public.coach_sessions),
                (select count(*) from public.coach_leads), (select count(*) from public.coach_polls), (select count(*) from public.network_people)), '0/0/0/0/0/0');
    f := f || pg_temp.s_eq('3b nor changed', concat_ws('/',
      pg_temp.s_none(format('update public.coach_todos set title = ''x'' where id = %L', todo_next)),
      pg_temp.s_none(format('update public.coach_automations set active = true where id = %L', auto)),
      pg_temp.s_none(format('delete from public.network_people where id = %L', net))), 'nothing/nothing/nothing');
    f := f || pg_temp.s_eq('3c the recap is not sent and no lead is undone from there', concat_ws('/',
      pg_temp.s_nothing(format('select public.session_send_recap(%L, %L)', sess, v_recap)),
      pg_temp.s_nothing(format('select public.lead_unsettle(%L, ''won'', now())', lead))), 'nothing/nothing');
    perform pg_temp.s_admin();
    f := f || pg_temp.s_eq('3d so everything stands as she left it at aal2', concat_ws('/',
      (select title from public.coach_todos where id = todo_next), (select active::text from public.coach_automations where id = auto),
      (select count(*) from public.network_people where id = net)), 'Send the invoices/false/1');

    -- ---------------------------------------------------------------- 4. Maya, an associate
    perform pg_temp.s_as(maya_u, 'aal1');
    f := f || pg_temp.s_eq('4a Maya at aal1 sees nothing', concat_ws('/', (select count(*) from public.client_profiles), (select count(*) from public.coach_todos), public.is_coach()), '0/0/f');
    perform pg_temp.s_as(maya_u, 'aal2');
    f := f || pg_temp.s_eq('4b with the code she adds her client Kim', pg_temp.s_rows(format(
      'insert into public.client_profiles (id, coach_id, name, time_zone) values (%L, %L, ''Kim Story'', ''Europe/London'')', p_kim, maya_c)), '1');
    f := f || pg_temp.s_eq('4c a note and a to-do of her own', concat_ws('/',
      pg_temp.s_rows(format('insert into public.client_notes (id, profile_id, coach_id, body) values (%L, %L, %L, ''Story note'')', maya_note, p_kim, maya_c)),
      pg_temp.s_rows(format('insert into public.coach_todos (id, coach_id, title) values (%L, %L, ''Story to-do'')', maya_todo, maya_c))), '1/1');
    f := f || pg_temp.s_eq('4d she sees only her own client and to-do',
      concat_ws('/', (select string_agg(name, ',') from public.client_profiles), (select string_agg(title, ',') from public.coach_todos)), 'Kim Story/Story to-do');
    f := f || pg_temp.s_eq('4e none of Tess''s sessions, leads, polls or Network',
      concat_ws('/', (select count(*) from public.coach_sessions), (select count(*) from public.coach_leads), (select count(*) from public.coach_polls),
                (select count(*) from public.network_people)), '0/0/0/0');
    f := f || pg_temp.s_eq('4f and she can''t send Tess''s recap or undo Tess''s lead', concat_ws('/',
      pg_temp.s_nothing(format('select public.session_send_recap(%L, %L)', sess, v_recap)),
      pg_temp.s_nothing(format('select public.lead_unsettle(%L, ''cold'', %L)', lead, cold))), 'nothing/nothing');

    -- ---------------------------------------------------------------- 5. the owner and an associate's client
    perform pg_temp.s_as(tess_u, 'aal2');
    f := f || pg_temp.s_eq('5a Tess sees the admin facts of Maya''s client',
      (select string_agg(name, ',') from public.coach_admin_clients() where name = 'Kim Story'), 'Kim Story');
    f := f || pg_temp.s_eq('5b never Maya''s note or to-do', concat_ws('/',
      (select count(*) from public.client_notes where id = maya_note), (select count(*) from public.coach_todos where id = maya_todo)), '0/0');
    perform pg_temp.s_as(tess_u, 'aal1');
    f := f || pg_temp.s_eq('5c and before the code, not even those', pg_temp.s_nothing('select public.coach_admin_clients()'), 'nothing');

    -- ---------------------------------------------------------------- 6. Sam, the client, password only
    perform pg_temp.s_admin();
    perform set_config('clarity.linking', 'on', true);
    update public.client_profiles set user_id = sam_u where id = p_sam;
    perform set_config('clarity.linking', '', true);
    perform pg_temp.s_as(sam_u, 'aal1');
    f := f || pg_temp.s_eq('6a his coach is Tess', (select string_agg(first_name, ',') from public.my_coach()), 'Tess');
    f := f || pg_temp.s_eq('6b the sent recap is his to read', (select string_agg(r.recap, ',') from public.my_session_recaps() r), v_recap);
    f := f || pg_temp.s_eq('6c he writes For next time', pg_temp.s_rows(format('insert into public.session_prep (user_id, body) values (%L, ''Story question'')', sam_u)), '1');
    f := f || pg_temp.s_eq('6d he reads no coach data', concat_ws('/', (select count(*) from public.coach_todos), (select count(*) from public.coach_sessions),
      (select count(*) from public.coach_leads), (select count(*) from public.network_people), (select count(*) from public.client_notes)), '0/0/0/0/0');
    perform pg_temp.s_as(tess_u, 'aal2');
    f := f || pg_temp.s_eq('6e Tess with the code reads Sam''s For next time', (select count(*)::text from public.session_prep where user_id = sam_u), '1');
    perform pg_temp.s_as(tess_u, 'aal1');
    f := f || pg_temp.s_eq('6f without it, she doesn''t', (select count(*)::text from public.session_prep where user_id = sam_u), '0');

    perform pg_temp.s_admin();
    raise exception 'undo the story rows' using errcode = 'P0055';
  exception when sqlstate 'P0055' then
    perform pg_temp.s_admin();
  end;

  f := f || pg_temp.s_eq('7 everything the story made is undone',
    (select count(*)::text from auth.users where email like 'p6a-story-%@example.invalid'), '0');
  if cardinality(f) > 0 then
    raise exception E'054 STORY FAILED (%):\n%', cardinality(f), array_to_string(f, E'\n');
  end if;
  raise notice '054 STORY PASSED';
end
$s$;
