-- =============================================================================
-- 050_coach_day_test.sql
-- Checks 050_coach_day.sql. RUN ORDER: 026, 033, 049, 050, then this.
--
-- WHAT IT DOES
--   Makes an invented owner (Tess), two associates (Maya and Cora), three
--   client accounts (Ella and Noor are Maya's, Sam is the owner's) and
--   someone signed out, and checks each role reading and writing what it
--   should, and being refused what it shouldn't:
--     1. every new table is locked down, and the migration recorded itself;
--     2. the shape checks: minutes, a repeat's rule, a checklist, and which
--        sessions count;
--     3. a coach's to-dos, lists, headings, days and weeks are theirs alone
--        (the owner included), and 500 to-dos at once are fine;
--     4. a session, its actions and its private notes are its coach's alone,
--        and only for that coach's own client, group and engagement;
--     5. sessions left: engagements.sessions_held follows the sessions, and
--        a count the coach types still stands;
--     6. the recap is sent once, by its coach, and what was sent is never
--        unsent, rewritten or deleted by a plain save;
--     7. the client reads only a sent recap and its ticked actions, through
--        my_session_recaps(), and marks only their own actions;
--     8. session_prep is the client's own, read by their current coach;
--     9. a coach sets their own coaching hours a week, and nobody else's;
--    10. workshop sends: once each, written only by the email server;
--    11. my_cover_asks and my_view_asks are the signed-in client's own;
--    12. coach_settings.hidden_help is an object.
--   Everything it makes is undone at the end.
--
--   It ends with the notice 050 CHECKS PASSED, or stops with FAILED and a
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

-- Read-backs used beside a write in one check. They are functions because a
-- sub-select in the same expression is worked out before the write runs.
create or replace function pg_temp.t_held(p uuid) returns text language plpgsql as $f$
begin
  return coalesce((select e.sessions_held::text from public.engagements e where e.id = p), 'none');
end $f$;
create or replace function pg_temp.t_sent(p uuid) returns text language plpgsql as $f$
begin
  return coalesce((select concat_ws('/', coalesce(s.recap_sent_at::text, 'not sent'), coalesce(s.recap_sent_by::text, 'by nobody'), coalesce(s.recap, 'no recap'))
                   from public.coach_sessions s where s.id = p), 'none');
end $f$;

do $t$
declare
  f text[] := '{}';
  tbl text;
  tables text[] := array[
    'coach_todo_lists', 'coach_todo_headings', 'coach_todos', 'coach_days', 'coach_weeks', 'coach_sessions',
    'coach_session_people', 'coach_session_actions', 'coach_session_notes', 'session_prep', 'workshop_sends'];
  own_u uuid; maya_u uuid; cora_u uuid; ella_u uuid; noor_u uuid; sam_u uuid;
  own_c uuid; maya_c uuid; cora_c uuid;
  ella_email text; noor_email text; sam_email text;
  p_ella uuid := gen_random_uuid();  -- Maya's client, with an account
  p_noor uuid := gen_random_uuid();  -- Maya's client, with an account (the group's second member)
  p_sam uuid := gen_random_uuid();   -- the owner's client, with an account
  l_m uuid := gen_random_uuid(); h_m uuid := gen_random_uuid(); t_m uuid := gen_random_uuid();
  l_o uuid := gen_random_uuid(); t_o uuid := gen_random_uuid();
  eng_m uuid := gen_random_uuid(); eng_o uuid := gen_random_uuid();
  grp uuid := gen_random_uuid();
  s1 uuid := gen_random_uuid();   -- held, with a recap: the one that is sent
  s2 uuid := gen_random_uuid();   -- a late cancellation
  s3 uuid := gen_random_uuid();   -- a no-show
  s4 uuid := gen_random_uuid();   -- moved
  s5 uuid := gen_random_uuid();   -- held, never sent
  s6 uuid := gen_random_uuid();   -- not written up yet
  a_late uuid := gen_random_uuid(); -- an action added after the recap went
  s7 uuid := gen_random_uuid();   -- held, no recap typed
  sg uuid := gen_random_uuid();   -- the group's session
  so uuid := gen_random_uuid();   -- the owner's session with Sam
  a1 uuid := gen_random_uuid(); a2 uuid := gen_random_uuid(); a3 uuid := gen_random_uuid();
  a5 uuid := gen_random_uuid(); ag uuid := gen_random_uuid(); ao uuid := gen_random_uuid();
  ws uuid := gen_random_uuid();   -- Maya's workshop, in March 2030
  ws2 uuid := gen_random_uuid();  -- Maya's workshop, started yesterday
  cover1 uuid := gen_random_uuid();
  monday date := date_trunc('week', current_date)::date;
  ws_start timestamptz := '2030-03-12 10:00:00'::timestamp at time zone 'Europe/London';
  v_sent timestamptz;
  v text;
begin
  -- 1. Locked down, and recorded.
  foreach tbl in array tables loop
    f := f || pg_temp.t_eq('1a ' || tbl || ' has row security', (select relrowsecurity::text from pg_class where oid = ('public.' || tbl)::regclass), 'true');
    f := f || pg_temp.t_eq('1b ' || tbl || ': nothing for someone signed out', (select count(*)::text from information_schema.role_table_grants where grantee in ('anon', 'public', 'PUBLIC') and table_schema = 'public' and table_name = tbl), '0');
    f := f || pg_temp.t_eq('1c ' || tbl || ': every rule is for signed-in people', (select count(*)::text from pg_policies where schemaname = 'public' and tablename = tbl and roles <> '{authenticated}'), '0');
    f := f || pg_temp.t_eq('1d ' || tbl || ': has at least one rule', (select (count(*) > 0)::text from pg_policies where schemaname = 'public' and tablename = tbl), 'true');
  end loop;
  if to_regclass('public.migration_log') is not null then
    f := f || pg_temp.t_eq('1e the migration recorded itself, once', (select count(*)::text from public.migration_log where number = 50 and name = '050_coach_day'), '1');
  end if;
  f := f || pg_temp.t_eq('1f workshop_sends: signed-in people may only read it', (select coalesce(string_agg(privilege_type, ',' order by privilege_type), 'none') from information_schema.role_table_grants where grantee = 'authenticated' and table_schema = 'public' and table_name = 'workshop_sends'), 'SELECT');
  f := f || pg_temp.t_eq('1g the email server''s functions are closed to people', (select concat(
      has_function_privilege('authenticated', 'public.workshop_emails_due(timestamptz)', 'execute'),
      has_function_privilege('anon', 'public.workshop_emails_due(timestamptz)', 'execute'),
      has_function_privilege('authenticated', 'public.workshop_send_claim(uuid, text, integer, uuid)', 'execute'),
      has_function_privilege('anon', 'public.workshop_send_claim(uuid, text, integer, uuid)', 'execute'),
      has_function_privilege('service_role', 'public.workshop_emails_due(timestamptz)', 'execute'),
      has_function_privilege('service_role', 'public.workshop_send_claim(uuid, text, integer, uuid)', 'execute'))), 'fffftt');
  f := f || pg_temp.t_eq('1h the counting functions are closed to people', (select concat(
      has_function_privilege('authenticated', 'public._engagement_recorded(uuid)', 'execute'),
      has_function_privilege('authenticated', 'public._engagement_recount(uuid)', 'execute'),
      has_function_privilege('anon', 'public._engagement_recount(uuid)', 'execute'))), 'fff');
  f := f || pg_temp.t_eq('1i nothing of 050 is open to someone signed out', (select concat(
      has_function_privilege('anon', 'public.session_send_recap(uuid)', 'execute'),
      has_function_privilege('anon', 'public.session_recap_people(uuid)', 'execute'),
      has_function_privilege('anon', 'public.my_session_recaps()', 'execute'),
      has_function_privilege('anon', 'public.my_session_action(uuid, boolean, boolean)', 'execute'),
      has_function_privilege('anon', 'public.my_cover_asks()', 'execute'),
      has_function_privilege('anon', 'public.my_view_asks()', 'execute'),
      has_function_privilege('anon', 'public.coach_save_capacity(numeric)', 'execute'),
      has_function_privilege('anon', 'public.workshop_follow_up_claim(uuid)', 'execute'),
      has_function_privilege('anon', 'public.coach_owns_session(uuid)', 'execute'),
      has_function_privilege('anon', 'public.coach_owns_todo_list(uuid)', 'execute'))), 'ffffffffff');

  -- 2. The shape checks.
  f := f || pg_temp.t_eq('2a minutes: 15, 45, 480 and none are fine', (select concat(public.coach_minutes_ok(15), public.coach_minutes_ok(45), public.coach_minutes_ok(480), public.coach_minutes_ok(null))), 'tttt');
  f := f || pg_temp.t_eq('2b minutes: 10, 20, 495, 0 and -15 are not', (select concat(public.coach_minutes_ok(10), public.coach_minutes_ok(20), public.coach_minutes_ok(495), public.coach_minutes_ok(0), public.coach_minutes_ok(-15))), 'fffff');
  f := f || pg_temp.t_eq('2c a repeat: good rules', (select concat(
      public.coach_repeat_ok(null),
      public.coach_repeat_ok('{"every":"day"}'),
      public.coach_repeat_ok('{"every":"weekday"}'),
      public.coach_repeat_ok('{"every":"week","interval":2,"weekdays":[1,3],"until":"2027-01-31"}'),
      public.coach_repeat_ok('{"every":"month","interval":52}'),
      public.coach_repeat_ok('{"every":"year","interval":1}'))), 'tttttt');
  f := f || pg_temp.t_eq('2d a repeat: bad rules', (select concat(
      public.coach_repeat_ok('[]'),
      public.coach_repeat_ok('{}'),
      public.coach_repeat_ok('{"every":"fortnight"}'),
      public.coach_repeat_ok('{"every":"week","interval":0}'),
      public.coach_repeat_ok('{"every":"week","interval":53}'),
      public.coach_repeat_ok('{"every":"week","interval":1.5}'),
      public.coach_repeat_ok('{"every":"week","interval":"2"}'),
      public.coach_repeat_ok('{"every":"week","weekdays":[7]}'),
      public.coach_repeat_ok('{"every":"week","weekdays":["1"]}'),
      public.coach_repeat_ok('{"every":"week","weekdays":1}'),
      public.coach_repeat_ok('{"every":"week","weekdays":[0,1,2,3,4,5,6,0]}'),
      public.coach_repeat_ok('{"every":"day","until":"31/01/2027"}'),
      public.coach_repeat_ok('{"every":"day","until":20270131}'))), 'fffffffffffff');
  f := f || pg_temp.t_eq('2e a checklist: good ones', (select concat(
      public.coach_checklist_ok(null),
      public.coach_checklist_ok('[]'),
      public.coach_checklist_ok('[{"text":"Call Dana","done":true},{"text":"Send the notes","done":false}]'),
      public.coach_checklist_ok('[{"text":"No done yet"}]'),
      public.coach_checklist_ok((select jsonb_agg(jsonb_build_object('text', 'Item ' || g, 'done', false)) from generate_series(1, 50) g)),
      public.coach_checklist_ok(jsonb_build_array(jsonb_build_object('text', repeat('a', 200)))))), 'tttttt');
  f := f || pg_temp.t_eq('2f a checklist: bad ones', (select concat(
      public.coach_checklist_ok('{}'),
      public.coach_checklist_ok('["Call Dana"]'),
      public.coach_checklist_ok('[{"text":""}]'),
      public.coach_checklist_ok('[{"text":"   "}]'),
      public.coach_checklist_ok('[{"text":7}]'),
      public.coach_checklist_ok('[{"text":"x","done":"yes"}]'),
      public.coach_checklist_ok((select jsonb_agg(jsonb_build_object('text', 'Item ' || g)) from generate_series(1, 51) g)),
      public.coach_checklist_ok(jsonb_build_array(jsonb_build_object('text', repeat('a', 201)))))), 'ffffffff');
  f := f || pg_temp.t_eq('2f2 a checklist item with no text is refused', public.coach_checklist_ok('[{"done":true}]')::text, 'false');
  f := f || pg_temp.t_eq('2g which sessions count', (select concat(
      public.session_counts('held', false), public.session_counts('no_show', false),
      public.session_counts('late_cancel', false), public.session_counts('late_cancel', null),
      public.session_counts('late_cancel', true), public.session_counts('moved', false),
      public.session_counts(null, false), public.session_counts(null, null),
      public.session_counts('held', true), public.session_counts('no_show', true))), 'ttttfffftt');

  begin
    own_u := pg_temp.t_user('owner'); maya_u := pg_temp.t_user('maya'); cora_u := pg_temp.t_user('cora');
    ella_u := pg_temp.t_user('ella'); noor_u := pg_temp.t_user('noor'); sam_u := pg_temp.t_user('sam');
    select email into ella_email from auth.users where id = ella_u;
    select email into noor_email from auth.users where id = noor_u;
    select email into sam_email from auth.users where id = sam_u;
    -- an owner may already be on this database; this test's owner is its own
    insert into public.coaches (user_id, role, display_first_name, full_name) values (own_u, 'owner', 'Tess', 'Tess Owner') returning id into own_c;
    insert into public.coaches (user_id, role, display_first_name, full_name) values (maya_u, 'coach', 'Maya', 'Maya Invented') returning id into maya_c;
    insert into public.coaches (user_id, role, display_first_name) values (cora_u, 'coach', 'Cora') returning id into cora_c;

    -- The people: each client is linked the way 049 links one (an invite the person accepts).
    perform pg_temp.t_as(maya_u);
    insert into public.client_profiles (id, coach_id, name, email) values (p_ella, maya_c, 'Ella Fraser', ella_email), (p_noor, maya_c, 'Noor Haddad', noor_email);
    perform public.client_invite(p_ella); perform public.client_invite(p_noor);
    perform pg_temp.t_as(own_u);
    insert into public.client_profiles (id, coach_id, name, email) values (p_sam, own_c, 'Sam Okafor', sam_email);
    perform public.client_invite(p_sam);
    perform pg_temp.t_as(ella_u);
    f := f || pg_temp.t_eq('0a Ella accepts Maya''s invite', pg_temp.t_n(format('select public.client_accept_invite(%L)', p_ella)), 'linked');
    perform pg_temp.t_as(noor_u);
    f := f || pg_temp.t_eq('0b Noor accepts Maya''s invite', pg_temp.t_n(format('select public.client_accept_invite(%L)', p_noor)), 'linked');
    perform pg_temp.t_as(sam_u);
    f := f || pg_temp.t_eq('0c Sam accepts the owner''s invite', pg_temp.t_n(format('select public.client_accept_invite(%L)', p_sam)), 'linked');
    perform pg_temp.t_admin();
    f := f || pg_temp.t_eq('0d each client has their coach', (select string_agg(c.display_first_name, ',' order by c.display_first_name) from public.coach_clients cc join public.coaches c on c.id = cc.coach_id where cc.client_id in (ella_u, noor_u, sam_u) and cc.ended_at is null), 'Maya,Maya,Tess');

    -- 3. Coach to-dos, lists, headings, days and weeks.
    perform pg_temp.t_as(maya_u);
    f := f || pg_temp.t_eq('3a Maya makes a list for her client', pg_temp.t_rows(format('insert into public.coach_todo_lists (id, coach_id, name, profile_id) values (%L, %L, ''Kestrel renewal'', %L)', l_m, maya_c, p_ella)), '1');
    f := f || pg_temp.t_eq('3b and a heading in it', pg_temp.t_rows(format('insert into public.coach_todo_headings (id, list_id, coach_id, name) values (%L, %L, %L, ''Before the call'')', h_m, l_m, maya_c)), '1');
    f := f || pg_temp.t_eq('3c and a to-do with everything on it', pg_temp.t_rows(format('insert into public.coach_todos (id, coach_id, title, notes, important, planned_on, planned_time, first_planned_on, due_on, minutes, list_id, heading_id, profile_id, repeat_rule, remind, checklist, from_email_sender, from_email_subject) values (%L, %L, ''Send Ella the proposal'', ''With the dates'', true, current_date, ''09:30'', current_date - 2, current_date + 3, 45, %L, %L, %L, ''{"every":"week","interval":2,"weekdays":[1]}'', true, ''[{"text":"Check the price","done":false}]'', ''dana@example.invalid'', ''Renewal'')', t_m, maya_c, l_m, h_m, p_ella)), '1');
    f := f || pg_temp.t_eq('3d a tag on the to-do (049''s own tags)', pg_temp.t_rows(format('with a as (insert into public.coach_tags (coach_id, name) values (%L, ''Renewals'') returning id) insert into public.coach_tag_links (tag_id, item_kind, item_id, coach_id) select id, ''todo'', %L, %L from a', maya_c, t_m, maya_c)), '1');
    f := f || pg_temp.t_eq('3e 20 minutes is refused', pg_temp.t_rows(format('insert into public.coach_todos (coach_id, title, minutes) values (%L, ''x'', 20)', maya_c)), 'error 23514');
    f := f || pg_temp.t_eq('3f so are 495 minutes, by a change', pg_temp.t_rows(format('update public.coach_todos set minutes = 495 where id = %L', t_m)), 'error 23514');
    f := f || pg_temp.t_eq('3g a repeat that isn''t a rule is refused', pg_temp.t_rows(format('insert into public.coach_todos (coach_id, title, repeat_rule) values (%L, ''x'', ''{"every":"fortnight"}'')', maya_c)), 'error 23514');
    f := f || pg_temp.t_eq('3h a checklist that isn''t one is refused', pg_temp.t_rows(format('insert into public.coach_todos (coach_id, title, checklist) values (%L, ''x'', ''[{"text":""}]'')', maya_c)), 'error 23514');
    f := f || pg_temp.t_eq('3i a time needs a day', pg_temp.t_rows(format('insert into public.coach_todos (coach_id, title, planned_time) values (%L, ''x'', ''09:00'')', maya_c)), 'error 23514');
    f := f || pg_temp.t_eq('3j someday has no day', pg_temp.t_rows(format('insert into public.coach_todos (coach_id, title, someday, planned_on) values (%L, ''x'', true, current_date)', maya_c)), 'error 23514');
    f := f || pg_temp.t_eq('3k no title is refused', pg_temp.t_rows(format('insert into public.coach_todos (coach_id, title) values (%L, ''   '')', maya_c)), 'error 23514');
    f := f || pg_temp.t_eq('3l 500 to-dos at once are fine', pg_temp.t_rows(format('insert into public.coach_todos (coach_id, title, position) select %L, ''Bulk '' || g, g from generate_series(1, 500) g', maya_c)), '500');
    f := f || pg_temp.t_eq('3m and she reads all 501', (select count(*)::text from public.coach_todos), '501');
    f := f || pg_temp.t_eq('3n her day, with the plan in order', pg_temp.t_rows(format('insert into public.coach_days (coach_id, day, plan_todos, planned_at, shutdown) values (%L, current_date, array[%L]::uuid[], now(), ''{"win":"The proposal went"}'')', maya_c, t_m)), '1');
    f := f || pg_temp.t_eq('3o her week, with her energy', pg_temp.t_rows(format('insert into public.coach_weeks (coach_id, week_start, energy, energy_at, review) values (%L, %L, ''good'', now(), ''{"went_well":"Calm week"}'')', maya_c, monday)), '1');
    f := f || pg_temp.t_eq('3p a week starts on a Monday', pg_temp.t_rows(format('insert into public.coach_weeks (coach_id, week_start, energy) values (%L, %L, ''good'')', maya_c, monday + 1)), 'error 23514');
    f := f || pg_temp.t_eq('3q energy is one of the five words', pg_temp.t_rows(format('update public.coach_weeks set energy = ''great'' where coach_id = %L', maya_c)), 'error 23514');
    f := f || pg_temp.t_eq('3r a day''s shutdown is an object', pg_temp.t_rows(format('update public.coach_days set shutdown = ''[]'' where coach_id = %L', maya_c)), 'error 23514');

    perform pg_temp.t_as(own_u);
    f := f || pg_temp.t_eq('3s the owner makes their own list and to-do', concat(
      pg_temp.t_rows(format('insert into public.coach_todo_lists (id, coach_id, name) values (%L, %L, ''Owner list'')', l_o, own_c)),
      pg_temp.t_rows(format('insert into public.coach_todos (id, coach_id, title, list_id, profile_id) values (%L, %L, ''Owner to-do'', %L, %L)', t_o, own_c, l_o, p_sam)),
      pg_temp.t_rows(format('insert into public.coach_days (coach_id, day) values (%L, current_date)', own_c)),
      pg_temp.t_rows(format('insert into public.coach_weeks (coach_id, week_start, energy) values (%L, %L, ''fair'')', own_c, monday))), '1111');
    f := f || pg_temp.t_eq('3t the owner reads only their own to-dos, lists, headings, days and weeks', (select concat_ws('/', (select count(*) from public.coach_todos), (select count(*) from public.coach_todo_lists), (select count(*) from public.coach_todo_headings), (select count(*) from public.coach_days), (select count(*) from public.coach_weeks))), '1/1/0/1/1');
    f := f || pg_temp.t_eq('3u never Maya''s, asked for by name', (select concat_ws('/', (select count(*) from public.coach_todos where coach_id = maya_c), (select count(*) from public.coach_todos where id = t_m), (select count(*) from public.coach_todo_lists where id = l_m), (select count(*) from public.coach_todo_headings where id = h_m), (select count(*) from public.coach_days where coach_id = maya_c), (select count(*) from public.coach_weeks where coach_id = maya_c))), '0/0/0/0/0/0');
    f := f || pg_temp.t_eq('3v the owner can''t change Maya''s to-do, list, heading, day or week', concat_ws('/',
      pg_temp.t_rows(format('update public.coach_todos set title = ''Changed'' where id = %L', t_m)),
      pg_temp.t_rows(format('update public.coach_todo_lists set name = ''Changed'' where id = %L', l_m)),
      pg_temp.t_rows(format('update public.coach_todo_headings set name = ''Changed'' where id = %L', h_m)),
      pg_temp.t_rows(format('update public.coach_days set plan_skipped = true where coach_id = %L', maya_c)),
      pg_temp.t_rows(format('update public.coach_weeks set energy = ''poor'' where coach_id = %L', maya_c))), '0/0/0/0/0');
    f := f || pg_temp.t_eq('3w nor delete them', concat_ws('/',
      pg_temp.t_rows(format('delete from public.coach_todos where coach_id = %L', maya_c)),
      pg_temp.t_rows(format('delete from public.coach_todo_lists where id = %L', l_m)),
      pg_temp.t_rows(format('delete from public.coach_todo_headings where id = %L', h_m)),
      pg_temp.t_rows(format('delete from public.coach_days where coach_id = %L', maya_c)),
      pg_temp.t_rows(format('delete from public.coach_weeks where coach_id = %L', maya_c))), '0/0/0/0/0');
    f := f || pg_temp.t_eq('3x nor add one for her', concat_ws('/',
      pg_temp.t_rows(format('insert into public.coach_todos (coach_id, title) values (%L, ''From the owner'')', maya_c)),
      pg_temp.t_rows(format('insert into public.coach_todo_lists (coach_id, name) values (%L, ''From the owner'')', maya_c)),
      pg_temp.t_rows(format('insert into public.coach_days (coach_id, day) values (%L, current_date + 1)', maya_c)),
      pg_temp.t_rows(format('insert into public.coach_weeks (coach_id, week_start) values (%L, %L)', maya_c, monday + 7))), 'error 42501/error 42501/error 42501/error 42501');
    f := f || pg_temp.t_eq('3y nor hand their own to-do to her', pg_temp.t_rows(format('update public.coach_todos set coach_id = %L where id = %L', maya_c, t_o)), 'error 42501');

    perform pg_temp.t_as(maya_u);
    f := f || pg_temp.t_eq('3z Maya''s are all still there, unchanged', (select concat_ws('/', (select count(*) from public.coach_todos), (select title from public.coach_todos where id = t_m), (select name from public.coach_todo_lists where id = l_m), (select energy from public.coach_weeks where coach_id = maya_c))), '501/Send Ella the proposal/Kestrel renewal/good');
    f := f || pg_temp.t_eq('3aa Maya reads none of the owner''s', (select concat_ws('/', (select count(*) from public.coach_todos where coach_id = own_c), (select count(*) from public.coach_todo_lists where id = l_o), (select count(*) from public.coach_days where coach_id = own_c), (select count(*) from public.coach_weeks where coach_id = own_c))), '0/0/0/0');
    f := f || pg_temp.t_eq('3ab a to-do can''t point at another coach''s list', pg_temp.t_rows(format('insert into public.coach_todos (coach_id, title, list_id) values (%L, ''x'', %L)', maya_c, l_o)), 'error 42501');
    f := f || pg_temp.t_eq('3ac nor be moved into one', pg_temp.t_rows(format('update public.coach_todos set list_id = %L where id = %L', l_o, t_m)), 'error 42501');
    f := f || pg_temp.t_eq('3ad nor at another coach''s client', pg_temp.t_rows(format('insert into public.coach_todos (coach_id, title, profile_id) values (%L, ''x'', %L)', maya_c, p_sam)), 'error 42501');
    f := f || pg_temp.t_eq('3ae nor be moved onto one', pg_temp.t_rows(format('update public.coach_todos set profile_id = %L where id = %L', p_sam, t_m)), 'error 42501');
    f := f || pg_temp.t_eq('3af a heading can''t go in another coach''s list', pg_temp.t_rows(format('insert into public.coach_todo_headings (list_id, coach_id, name) values (%L, %L, ''x'')', l_o, maya_c)), 'error 42501');
    f := f || pg_temp.t_eq('3ag a list can''t be for another coach''s client', pg_temp.t_rows(format('insert into public.coach_todo_lists (coach_id, name, profile_id) values (%L, ''x'', %L)', maya_c, p_sam)), 'error 42501');
    f := f || pg_temp.t_eq('3ah she can''t change or delete the owner''s to-do', concat(pg_temp.t_rows(format('update public.coach_todos set title = ''Mine'' where id = %L', t_o)), pg_temp.t_rows(format('delete from public.coach_todos where id = %L', t_o))), '00');
    f := f || pg_temp.t_eq('3ai she ticks her own, and deletes one', concat(pg_temp.t_rows(format('update public.coach_todos set done_at = now() where id = %L', t_m)), pg_temp.t_rows('delete from public.coach_todos where title = ''Bulk 500''')), '11');
    perform pg_temp.t_as(cora_u);
    f := f || pg_temp.t_eq('3aj another associate reads none of it', (select concat_ws('/', (select count(*) from public.coach_todos), (select count(*) from public.coach_todo_lists), (select count(*) from public.coach_todo_headings), (select count(*) from public.coach_days), (select count(*) from public.coach_weeks))), '0/0/0/0/0');
    perform pg_temp.t_as(ella_u);
    f := f || pg_temp.t_eq('3ak a client reads none of it', (select concat_ws('/', (select count(*) from public.coach_todos), (select count(*) from public.coach_todo_lists), (select count(*) from public.coach_todo_headings), (select count(*) from public.coach_days), (select count(*) from public.coach_weeks))), '0/0/0/0/0');
    f := f || pg_temp.t_eq('3al and can''t add a coach''s to-do', pg_temp.t_rows(format('insert into public.coach_todos (coach_id, title) values (%L, ''x'')', maya_c)), 'error 42501');
    perform pg_temp.t_anon();
    f := f || pg_temp.t_eq('3am someone signed out reads nothing', concat_ws('|', pg_temp.t_n('select count(*)::text from public.coach_todos'), pg_temp.t_n('select count(*)::text from public.coach_todo_lists'), pg_temp.t_n('select count(*)::text from public.coach_todo_headings'), pg_temp.t_n('select count(*)::text from public.coach_days'), pg_temp.t_n('select count(*)::text from public.coach_weeks')), 'error 42501|error 42501|error 42501|error 42501|error 42501');

    -- 4 and 5. Sessions, and sessions left.
    perform pg_temp.t_as(own_u);
    f := f || pg_temp.t_eq('5a the owner''s engagement and session with Sam', concat(
      pg_temp.t_rows(format('insert into public.engagements (id, coach_id, profile_id, kind, sessions_total) values (%L, %L, %L, ''sessions'', 6)', eng_o, own_c, p_sam)),
      pg_temp.t_rows(format('insert into public.coach_sessions (id, coach_id, profile_id, engagement_id, starts_at, outcome, recap) values (%L, %L, %L, %L, now() - interval ''2 days'', ''held'', ''Owner recap for Sam'')', so, own_c, p_sam, eng_o)),
      pg_temp.t_rows(format('insert into public.coach_session_actions (id, session_id, coach_id, title) values (%L, %L, %L, ''Sam writes the brief'')', ao, so, own_c)),
      pg_temp.t_rows(format('insert into public.coach_session_notes (session_id, coach_id, focus, supervision) values (%L, %L, ''OWNER-SECRET-FOCUS'', ''OWNER-SECRET-SUP'')', so, own_c))), '1111');
    f := f || pg_temp.t_eq('5b it counts: 0 before, 1 held', (select concat(sessions_held, '/', sessions_held_base) from public.engagements where id = eng_o), '1/0');

    perform pg_temp.t_as(maya_u);
    f := f || pg_temp.t_eq('5c Maya starts an engagement with 3 already held', pg_temp.t_rows(format('insert into public.engagements (id, coach_id, profile_id, kind, sessions_total, sessions_held) values (%L, %L, %L, ''sessions'', 12, 3)', eng_m, maya_c, p_ella)), '1');
    f := f || pg_temp.t_eq('5d the count before sessions is 3', (select concat(sessions_held, '/', sessions_held_base) from public.engagements where id = eng_m), '3/3');
    perform pg_temp.t_rows(format('insert into public.engagements (coach_id, profile_id, kind, name, sessions_total, sessions_held, sessions_held_base) values (%L, %L, ''sessions'', ''Moved across 050'', 12, 9, 6)', maya_c, p_ella));
    f := f || pg_temp.t_eq('5d2 an engagement moved across from a device keeps its own count before sessions', (select concat(sessions_held, '/', sessions_held_base) from public.engagements where name = 'Moved across 050'), '9/6');
    delete from public.engagements where name = 'Moved across 050';
    f := f || pg_temp.t_eq('5e a session not written up yet doesn''t count', concat(pg_temp.t_rows(format('insert into public.coach_sessions (id, coach_id, profile_id, engagement_id, starts_at, minutes) values (%L, %L, %L, %L, now() + interval ''7 days'', 90)', s6, maya_c, p_ella, eng_m)), '/', pg_temp.t_held(eng_m)), '1/3');
    f := f || pg_temp.t_eq('5f a session that went ahead makes 4', concat(pg_temp.t_rows(format('insert into public.coach_sessions (id, coach_id, profile_id, engagement_id, starts_at, outcome, written_up_at, recap) values (%L, %L, %L, %L, now() - interval ''1 day'', ''held'', now(), ''Good session: the plan is clear.'')', s1, maya_c, p_ella, eng_m)), '/', pg_temp.t_held(eng_m)), '1/4');
    f := f || pg_temp.t_eq('5g a late cancellation makes 5', concat(pg_temp.t_rows(format('insert into public.coach_sessions (id, coach_id, profile_id, engagement_id, starts_at, outcome, recap) values (%L, %L, %L, %L, now() - interval ''8 days'', ''late_cancel'', ''Cancelled on the day.'')', s2, maya_c, p_ella, eng_m)), '/', pg_temp.t_held(eng_m)), '1/5');
    f := f || pg_temp.t_eq('5h Waive it makes 4', concat(pg_temp.t_rows(format('update public.coach_sessions set waived = true where id = %L', s2)), '/', pg_temp.t_held(eng_m)), '1/4');
    f := f || pg_temp.t_eq('5i a no-show makes 5', concat(pg_temp.t_rows(format('insert into public.coach_sessions (id, coach_id, profile_id, engagement_id, starts_at, outcome) values (%L, %L, %L, %L, now() - interval ''15 days'', ''no_show'')', s3, maya_c, p_ella, eng_m)), '/', pg_temp.t_held(eng_m)), '1/5');
    f := f || pg_temp.t_eq('5j a moved one leaves it at 5', concat(pg_temp.t_rows(format('insert into public.coach_sessions (id, coach_id, profile_id, engagement_id, starts_at, outcome, moved_to) values (%L, %L, %L, %L, now() - interval ''3 days'', ''moved'', now() + interval ''4 days'')', s4, maya_c, p_ella, eng_m)), '/', pg_temp.t_held(eng_m)), '1/5');
    f := f || pg_temp.t_eq('5k the count before sessions is still 3', (select sessions_held_base::text from public.engagements where id = eng_m), '3');
    f := f || pg_temp.t_eq('5l deleting the no-show makes 4', concat(pg_temp.t_rows(format('delete from public.coach_sessions where id = %L', s3)), '/', pg_temp.t_held(eng_m)), '1/4');
    f := f || pg_temp.t_eq('5m changing something else leaves the count alone', concat(pg_temp.t_rows(format('update public.engagements set sessions_total = 14, name = ''Renewal'' where id = %L', eng_m)), '/', pg_temp.t_n(format('select concat(sessions_held, ''/'', sessions_held_base) from public.engagements where id = %L', eng_m))), '1/4/3');
    f := f || pg_temp.t_eq('5n the coach types 7 and it stays 7', concat(pg_temp.t_rows(format('update public.engagements set sessions_held = 7 where id = %L', eng_m)), '/', pg_temp.t_held(eng_m)), '1/7');
    f := f || pg_temp.t_eq('5o a further session that went ahead makes 8', concat(pg_temp.t_rows(format('insert into public.coach_sessions (id, coach_id, profile_id, engagement_id, starts_at, outcome, recap) values (%L, %L, %L, %L, now() - interval ''4 hours'', ''held'', ''Not sent yet.'')', s5, maya_c, p_ella, eng_m)), '/', pg_temp.t_held(eng_m)), '1/8');
    f := f || pg_temp.t_eq('5p writing up the waiting one as moved leaves 8, as held makes 9, and back to not written up 8', concat_ws('/',
      pg_temp.t_rows(format('update public.coach_sessions set outcome = ''moved'' where id = %L', s6)), pg_temp.t_held(eng_m),
      pg_temp.t_rows(format('update public.coach_sessions set outcome = ''held'' where id = %L', s6)), pg_temp.t_held(eng_m),
      pg_temp.t_rows(format('update public.coach_sessions set outcome = null where id = %L', s6)), pg_temp.t_held(eng_m)), '1/8/1/9/1/8');
    f := f || pg_temp.t_eq('5q taking a session off its engagement, and putting it back', concat_ws('/',
      pg_temp.t_rows(format('update public.coach_sessions set engagement_id = null where id = %L', s5)), pg_temp.t_held(eng_m),
      pg_temp.t_rows(format('update public.coach_sessions set engagement_id = %L where id = %L', eng_m, s5)), pg_temp.t_held(eng_m)), '1/7/1/8');
    f := f || pg_temp.t_eq('5r a group and its two members', concat(
      pg_temp.t_rows(format('insert into public.coach_groups (id, coach_id, name) values (%L, %L, ''Leadership team'')', grp, maya_c)),
      pg_temp.t_rows(format('insert into public.coach_group_members (group_id, profile_id, name, counts_against) values (%L, %L, ''Ella Fraser'', ''own''), (%L, %L, ''Noor Haddad'', ''group'')', grp, p_ella, grp, p_noor))), '12');
    f := f || pg_temp.t_eq('5s a group session alone leaves Ella''s count at 8', concat(pg_temp.t_rows(format('insert into public.coach_sessions (id, coach_id, group_id, kind, starts_at, outcome, recap) values (%L, %L, %L, ''group'', now() - interval ''5 days'', ''held'', ''Team recap: one priority each.'')', sg, maya_c, grp)), '/', pg_temp.t_held(eng_m)), '1/8');
    f := f || pg_temp.t_eq('5t with Ella as a member who counts against her own, 9', concat(pg_temp.t_rows(format('insert into public.coach_session_people (session_id, profile_id, engagement_id) values (%L, %L, %L)', sg, p_ella, eng_m)), '/', pg_temp.t_held(eng_m)), '1/9');
    f := f || pg_temp.t_eq('5u the group session moved makes 8, and held again 9', concat_ws('/',
      pg_temp.t_rows(format('update public.coach_sessions set outcome = ''moved'' where id = %L', sg)), pg_temp.t_held(eng_m),
      pg_temp.t_rows(format('update public.coach_sessions set outcome = ''held'' where id = %L', sg)), pg_temp.t_held(eng_m)), '1/8/1/9');
    f := f || pg_temp.t_eq('5v taking Ella off the group session makes 8, and back on 9', concat_ws('/',
      pg_temp.t_rows(format('delete from public.coach_session_people where session_id = %L and profile_id = %L', sg, p_ella)), pg_temp.t_held(eng_m),
      pg_temp.t_rows(format('insert into public.coach_session_people (session_id, profile_id, engagement_id) values (%L, %L, %L)', sg, p_ella, eng_m)), pg_temp.t_held(eng_m)), '1/8/1/9');

    -- 4. Shapes, and only her own client, group and engagement.
    f := f || pg_temp.t_eq('4a a session is 30, 60 or 90 minutes', pg_temp.t_rows(format('insert into public.coach_sessions (coach_id, profile_id, starts_at, minutes) values (%L, %L, now(), 45)', maya_c, p_ella)), 'error 23514');
    f := f || pg_temp.t_eq('4b Waive it is only for a late cancellation', pg_temp.t_rows(format('update public.coach_sessions set waived = true where id = %L', s1)), 'error 23514');
    f := f || pg_temp.t_eq('4c a session is with a client or a group, never both or neither', concat(
      pg_temp.t_rows(format('insert into public.coach_sessions (coach_id, profile_id, group_id, starts_at) values (%L, %L, %L, now())', maya_c, p_ella, grp)), '/',
      pg_temp.t_rows(format('insert into public.coach_sessions (coach_id, starts_at) values (%L, now())', maya_c))), 'error 23514/error 23514');
    f := f || pg_temp.t_eq('4d what happened is one of the four', pg_temp.t_rows(format('update public.coach_sessions set outcome = ''cancelled'' where id = %L', s6)), 'error 23514');
    f := f || pg_temp.t_eq('4e no session for another coach''s client', pg_temp.t_rows(format('insert into public.coach_sessions (coach_id, profile_id, starts_at) values (%L, %L, now())', maya_c, p_sam)), 'error 42501');
    f := f || pg_temp.t_eq('4f nor against another coach''s engagement', pg_temp.t_rows(format('insert into public.coach_sessions (coach_id, profile_id, engagement_id, starts_at, outcome) values (%L, %L, %L, now(), ''held'')', maya_c, p_ella, eng_o)), 'error 42501');
    f := f || pg_temp.t_eq('4g nor moved onto one', concat(
      pg_temp.t_rows(format('update public.coach_sessions set engagement_id = %L where id = %L', eng_o, s5)), '/',
      pg_temp.t_rows(format('update public.coach_sessions set profile_id = %L where id = %L', p_sam, s5))), 'error 42501/error 42501');
    f := f || pg_temp.t_eq('4h nor in another coach''s name', pg_temp.t_rows(format('insert into public.coach_sessions (coach_id, profile_id, starts_at) values (%L, %L, now())', own_c, p_ella)), 'error 42501');
    f := f || pg_temp.t_eq('4i a session keeps its coach', concat(pg_temp.t_rows(format('update public.coach_sessions set coach_id = %L where id = %L', cora_c, s5)), '/', pg_temp.t_n(format('select (coach_id = %L)::text from public.coach_sessions where id = %L', maya_c, s5))), '1/true');
    f := f || pg_temp.t_eq('4j a group session''s member can''t be another coach''s client, or count against another coach''s engagement', concat(
      pg_temp.t_rows(format('insert into public.coach_session_people (session_id, profile_id) values (%L, %L)', sg, p_sam)), '/',
      pg_temp.t_rows(format('insert into public.coach_session_people (session_id, profile_id, engagement_id) values (%L, %L, %L)', sg, p_noor, eng_o)), '/',
      pg_temp.t_rows(format('insert into public.coach_session_people (session_id, profile_id) values (%L, %L)', so, p_ella))), 'error 42501/error 42501/error 42501');
    f := f || pg_temp.t_eq('4k she reads no engagement of the owner''s', (select count(*)::text from public.engagements where id = eng_o), '0');
    f := f || pg_temp.t_eq('4l the recap''s actions and her private notes', concat(
      pg_temp.t_rows(format('insert into public.coach_session_actions (id, session_id, coach_id, title, send, goes_to, position) values (%L, %L, %L, ''Book the review'', true, ''week'', 1), (%L, %L, %L, ''Private nudge for Maya'', false, ''week'', 2), (%L, %L, %L, ''Send the notes'', true, ''backlog'', 3)', a1, s1, maya_c, a2, s1, maya_c, a3, s1, maya_c)),
      pg_temp.t_rows(format('insert into public.coach_session_actions (id, session_id, coach_id, title) values (%L, %L, %L, ''From the unsent session''), (%L, %L, %L, ''Each name one priority'')', a5, s5, maya_c, ag, sg, maya_c)),
      pg_temp.t_rows(format('insert into public.coach_session_notes (session_id, coach_id, focus, insight, next_time, supervision) values (%L, %L, ''SECRET-FOCUS'', ''SECRET-INSIGHT'', ''SECRET-NEXT'', ''SECRET-SUP'')', s1, maya_c))), '321');
    f := f || pg_temp.t_eq('4m no action or note on another coach''s session', concat(
      pg_temp.t_rows(format('insert into public.coach_session_actions (session_id, coach_id, title) values (%L, %L, ''x'')', so, maya_c)), '/',
      pg_temp.t_rows(format('insert into public.coach_session_notes (session_id, coach_id, focus) values (%L, %L, ''x'')', so, maya_c)), '/',
      pg_temp.t_rows(format('insert into public.coach_session_actions (session_id, coach_id, title) values (%L, %L, ''x'')', s1, own_c))), 'error 42501/error 42501/error 42501');
    f := f || pg_temp.t_eq('4n Maya reads none of the owner''s session, actions or notes', (select concat_ws('/', (select count(*) from public.coach_sessions where coach_id = own_c), (select count(*) from public.coach_sessions where id = so), (select count(*) from public.coach_session_actions where session_id = so), (select count(*) from public.coach_session_notes where session_id = so))), '0/0/0/0');
    f := f || pg_temp.t_eq('4o and can''t change or delete them', concat_ws('/',
      pg_temp.t_rows(format('update public.coach_sessions set recap = ''x'' where id = %L', so)),
      pg_temp.t_rows(format('delete from public.coach_sessions where id = %L', so)),
      pg_temp.t_rows(format('update public.coach_session_actions set title = ''x'' where id = %L', ao)),
      pg_temp.t_rows(format('delete from public.coach_session_notes where session_id = %L', so))), '0/0/0/0');

    perform pg_temp.t_as(own_u);
    f := f || pg_temp.t_eq('4p the owner reads none of Maya''s sessions, members, actions or notes', (select concat_ws('/', (select count(*) from public.coach_sessions where coach_id = maya_c), (select count(*) from public.coach_sessions), (select count(*) from public.coach_session_people), (select count(*) from public.coach_session_actions where coach_id = maya_c), (select count(*) from public.coach_session_actions), (select count(*) from public.coach_session_notes where coach_id = maya_c), (select count(*) from public.coach_session_notes))), '0/1/0/0/1/0/1');
    f := f || pg_temp.t_eq('4q never by its id either', (select concat_ws('/', (select count(*) from public.coach_sessions where id in (s1, s2, s4, s5, s6, sg)), (select count(*) from public.coach_session_actions where id in (a1, a2, a3, a5, ag)), (select count(*) from public.coach_session_notes where session_id = s1))), '0/0/0');
    f := f || pg_temp.t_eq('4r the owner can''t change or delete them', concat_ws('/',
      pg_temp.t_rows(format('update public.coach_sessions set recap = ''x'' where id = %L', s1)),
      pg_temp.t_rows(format('delete from public.coach_sessions where id = %L', s5)),
      pg_temp.t_rows(format('update public.coach_session_actions set title = ''x'' where id = %L', a1)),
      pg_temp.t_rows(format('update public.coach_session_notes set focus = ''x'' where session_id = %L', s1)),
      pg_temp.t_rows(format('delete from public.coach_session_people where session_id = %L', sg))), '0/0/0/0/0');
    f := f || pg_temp.t_eq('4s nor add a session for Maya''s client, even in Maya''s name', concat(
      pg_temp.t_rows(format('insert into public.coach_sessions (coach_id, profile_id, starts_at) values (%L, %L, now())', own_c, p_ella)), '/',
      pg_temp.t_rows(format('insert into public.coach_sessions (coach_id, profile_id, starts_at) values (%L, %L, now())', maya_c, p_ella)), '/',
      pg_temp.t_rows(format('insert into public.coach_session_notes (session_id, coach_id, focus) values (%L, %L, ''x'')', s5, own_c))), 'error 42501/error 42501/error 42501');
    f := f || pg_temp.t_eq('5w the owner still reads the engagement''s count (049''s admin facts): 9', (select sessions_held::text from public.engagements where id = eng_m), '9');
    f := f || pg_temp.t_eq('5x but can''t type a count for it', concat(pg_temp.t_rows(format('update public.engagements set sessions_held = 0 where id = %L', eng_m)), '/', pg_temp.t_held(eng_m)), '0/9');
    perform pg_temp.t_as(cora_u);
    f := f || pg_temp.t_eq('4t another associate reads no session at all', (select concat_ws('/', (select count(*) from public.coach_sessions), (select count(*) from public.coach_session_people), (select count(*) from public.coach_session_actions), (select count(*) from public.coach_session_notes))), '0/0/0/0');
    perform pg_temp.t_anon();
    f := f || pg_temp.t_eq('4u someone signed out reads no session table', concat_ws('|', pg_temp.t_n('select count(*)::text from public.coach_sessions'), pg_temp.t_n('select count(*)::text from public.coach_session_people'), pg_temp.t_n('select count(*)::text from public.coach_session_actions'), pg_temp.t_n('select count(*)::text from public.coach_session_notes'), pg_temp.t_n('select count(*)::text from public.session_prep'), pg_temp.t_n('select count(*)::text from public.workshop_sends')), 'error 42501|error 42501|error 42501|error 42501|error 42501|error 42501');
    f := f || pg_temp.t_eq('4v nor calls a function of 050', concat_ws('|', pg_temp.t_n('select count(*)::text from public.my_session_recaps()'), pg_temp.t_n(format('select public.session_send_recap(%L)', s1)), pg_temp.t_n('select public.coach_save_capacity(10)::text'), pg_temp.t_n('select count(*)::text from public.my_cover_asks()'), pg_temp.t_n('select count(*)::text from public.my_view_asks()')), 'error 42501|error 42501|error 42501|error 42501|error 42501');

    -- 7 (before sending). The client reads nothing yet.
    perform pg_temp.t_as(ella_u);
    f := f || pg_temp.t_eq('7a before sending Ella has no recap', (select count(*)::text from public.my_session_recaps()), '0');
    f := f || pg_temp.t_eq('7b and can''t mark an action of an unsent recap', pg_temp.t_n(format('select public.my_session_action(%L, true)::text', a1)), 'error 42501');
    f := f || pg_temp.t_eq('7c Ella reads no session table directly', (select concat_ws('/', (select count(*) from public.coach_sessions), (select count(*) from public.coach_session_people), (select count(*) from public.coach_session_actions), (select count(*) from public.coach_session_notes))), '0/0/0/0');

    -- 6. The recap.
    f := f || pg_temp.t_eq('6a a client can''t send a recap', pg_temp.t_n(format('select public.session_send_recap(%L)', s1)), 'error 42501');
    perform pg_temp.t_as(cora_u);
    f := f || pg_temp.t_eq('6b another associate can''t send Maya''s', pg_temp.t_n(format('select public.session_send_recap(%L)', s1)), 'error 42501');
    perform pg_temp.t_as(own_u);
    f := f || pg_temp.t_eq('6c nor can the owner', pg_temp.t_n(format('select public.session_send_recap(%L)', s1)), 'error 42501');
    perform pg_temp.t_as(maya_u);
    f := f || pg_temp.t_eq('6d nor Maya the owner''s, or one that isn''t there', concat(pg_temp.t_n(format('select public.session_send_recap(%L)', so)), '/', pg_temp.t_n(format('select public.session_send_recap(%L)', gen_random_uuid()))), 'error 42501/error 42501');
    f := f || pg_temp.t_eq('6e nobody else''s try sent it', (select (recap_sent_at is null and recap_sent_by is null)::text from public.coach_sessions where id = s1), 'true');
    f := f || pg_temp.t_eq('6f an empty recap is refused', concat(
      pg_temp.t_rows(format('insert into public.coach_sessions (id, coach_id, profile_id, starts_at, outcome) values (%L, %L, %L, now() - interval ''20 days'', ''held'')', s7, maya_c, p_ella)), '/',
      pg_temp.t_n(format('select public.session_send_recap(%L)', s7)), '/',
      pg_temp.t_rows(format('update public.coach_sessions set recap = ''   '' where id = %L', s7)), '/',
      pg_temp.t_n(format('select public.session_send_recap(%L)', s7))), '1/error 22023/1/error 22023');
    f := f || pg_temp.t_eq('6g a session that didn''t go ahead is refused: a late cancellation, a moved one, one not written up', concat_ws('/',
      pg_temp.t_n(format('select public.session_send_recap(%L)', s2)),
      pg_temp.t_rows(format('update public.coach_sessions set recap = ''Moved.'' where id = %L', s4)),
      pg_temp.t_n(format('select public.session_send_recap(%L)', s4)),
      pg_temp.t_rows(format('update public.coach_sessions set recap = ''Not yet.'' where id = %L', s6)),
      pg_temp.t_n(format('select public.session_send_recap(%L)', s6))), 'error 22023/1/error 22023/1/error 22023');
    f := f || pg_temp.t_eq('6h a new session can''t be saved as already sent', concat(
      pg_temp.t_rows(format('insert into public.coach_sessions (id, coach_id, profile_id, starts_at, outcome, recap, recap_sent_at, recap_sent_by) values (%L, %L, %L, now() - interval ''15 days'', ''held'', ''Sneaked.'', now(), %L)', s3, maya_c, p_ella, maya_u)), '/',
      pg_temp.t_sent(s3)), '1/not sent/by nobody/Sneaked.');
    f := f || pg_temp.t_eq('6i a plain save can''t mark one sent', concat(
      pg_temp.t_rows(format('update public.coach_sessions set recap_sent_at = now(), recap_sent_by = %L where id = %L', maya_u, s5)), '/',
      pg_temp.t_sent(s5)), '1/not sent/by nobody/Not sent yet.');
    perform pg_temp.t_as(ella_u);
    f := f || pg_temp.t_eq('6j so Ella still has nothing', (select count(*)::text from public.my_session_recaps()), '0');
    perform pg_temp.t_as(maya_u);
    f := f || pg_temp.t_eq('6k Maya sends it', pg_temp.t_n(format('select public.session_send_recap(%L)', s1)), 'sent');
    select recap_sent_at into v_sent from public.coach_sessions where id = s1;
    f := f || pg_temp.t_eq('6l it is marked sent, by her', (select (recap_sent_at is not null and recap_sent_by = maya_u)::text from public.coach_sessions where id = s1), 'true');
    f := f || pg_temp.t_eq('6m a second press says it had gone', pg_temp.t_n(format('select public.session_send_recap(%L)', s1)), 'already_sent');
    f := f || pg_temp.t_eq('6n and when it went doesn''t change', (select (recap_sent_at = v_sent and recap_sent_by = maya_u)::text from public.coach_sessions where id = s1), 'true');
    f := f || pg_temp.t_eq('6o a plain save can''t unsend it or rewrite it', concat(
      pg_temp.t_rows(format('update public.coach_sessions set recap_sent_at = null, recap_sent_by = null, recap = ''Rewritten after sending.'' where id = %L', s1)), '/',
      pg_temp.t_sent(s1)), concat_ws('/', '1', v_sent::text, maya_u::text, 'Good session: the plan is clear.'));
    f := f || pg_temp.t_eq('6p nor pass it to someone else, or date it again', concat(
      pg_temp.t_rows(format('update public.coach_sessions set recap_sent_at = now() - interval ''1 year'', recap_sent_by = %L where id = %L', own_u, s1)), '/',
      pg_temp.t_sent(s1)), concat_ws('/', '1', v_sent::text, maya_u::text, 'Good session: the plan is clear.'));
    f := f || pg_temp.t_eq('6q an unsent recap can still be rewritten', concat(pg_temp.t_rows(format('update public.coach_sessions set recap = ''Still a draft.'' where id = %L', s5)), '/', pg_temp.t_sent(s5)), '1/not sent/by nobody/Still a draft.');
    f := f || pg_temp.t_eq('6r a sent session can''t be deleted', concat(pg_temp.t_rows(format('delete from public.coach_sessions where id = %L', s1)), '/', pg_temp.t_n(format('select count(*)::text from public.coach_sessions where id = %L', s1))), '0/1');
    -- Once sent, what went to the client stays: a session moved afterwards keeps its recap and still went ahead.
    f := f || pg_temp.t_eq('6r2 a sent session can''t be turned into a moved one, or dated again', concat(pg_temp.t_rows(format('update public.coach_sessions set outcome = ''moved'', starts_at = starts_at + interval ''7 days'' where id = %L', s1)), '/', pg_temp.t_n(format('select outcome || (starts_at < now() + interval ''1 day'')::text from public.coach_sessions where id = %L', s1))), '1/heldtrue');
    f := f || pg_temp.t_eq('6r3 a sent action can''t be reworded, unticked or sent elsewhere', concat(pg_temp.t_rows(format('update public.coach_session_actions set title = ''Changed after sending'', send = false, goes_to = ''backlog'' where id = %L', a1)), '/', pg_temp.t_n(format('select (title <> ''Changed after sending'' and send)::text from public.coach_session_actions where id = %L', a1))), '1/true');
    f := f || pg_temp.t_eq('6r4 nor taken away', pg_temp.t_rows(format('delete from public.coach_session_actions where id = %L', a1)), 'error 22023');
    f := f || pg_temp.t_eq('6r5 an action added after sending never goes to the client', concat(pg_temp.t_rows(format('insert into public.coach_session_actions (id, session_id, coach_id, title, send) values (%L, %L, %L, ''Added after sending'', true)', a_late, s1, maya_c)), '/', pg_temp.t_n(format('select send::text from public.coach_session_actions where id = %L', a_late))), '1/false');
    f := f || pg_temp.t_eq('6r6 the recap''s email is claimed once: true, then false; never for an unsent one; a plain save can''t set or clear it', concat_ws('/', pg_temp.t_n(format('select public.session_recap_email_claim(%L)::text', s1)), pg_temp.t_n(format('select public.session_recap_email_claim(%L)::text', s1)), pg_temp.t_n(format('select public.session_recap_email_claim(%L)::text', s5)), pg_temp.t_rows(format('update public.coach_sessions set recap_emailed_at = null where id = %L', s1)), pg_temp.t_n(format('select (recap_emailed_at is not null)::text from public.coach_sessions where id = %L', s1))), 'true/false/false/1/true');
    f := f || pg_temp.t_eq('6s who it goes to: Ella''s own name and email', (select string_agg(name || ' ' || email, ',') from public.session_recap_people(s1)), 'Ella Fraser ' || ella_email);
    f := f || pg_temp.t_eq('6t and nobody for a recap not sent', (select count(*)::text from public.session_recap_people(s5)), '0');
    perform pg_temp.t_as(cora_u);
    f := f || pg_temp.t_eq('6u another coach is told nobody', (select count(*)::text from public.session_recap_people(s1)), '0');

    -- 7. The client's side.
    perform pg_temp.t_as(ella_u);
    f := f || pg_temp.t_eq('7d Ella has exactly the sent recap', (select string_agg(concat_ws('|', (session_id = s1)::text, recap, coach_first_name, coalesce(group_name, 'no group'), minutes, (r.sent_at = v_sent)::text), ';') from public.my_session_recaps() r), 'true|Good session: the plan is clear.|Maya|no group|60|true');
    f := f || pg_temp.t_eq('7e with only the actions ticked to send, in order', (select string_agg(a ->> 'title', ',' order by ord) from public.my_session_recaps() r, jsonb_array_elements(r.actions) with ordinality as x(a, ord)), 'Book the review,Send the notes');
    f := f || pg_temp.t_eq('7f each going where the coach chose, not done or placed yet', (select string_agg(concat_ws(':', a ->> 'goes_to', a ->> 'done', a ->> 'placed'), ',' order by ord) from public.my_session_recaps() r, jsonb_array_elements(r.actions) with ordinality as x(a, ord)), 'week:false:false,backlog:false:false');
    select string_agg(r::text, ' ') into v from public.my_session_recaps() r;
    f := f || pg_temp.t_eq('7g never the private notes, For supervision, an unticked action or an unsent recap', (v like '%SECRET%' or v like '%Private nudge%' or v like '%Still a draft%' or v like '%unsent session%')::text, 'false');
    f := f || pg_temp.t_eq('7h Ella marks her own action done and placed', pg_temp.t_n(format('select public.my_session_action(%L, true, true)::text', a1)), '');
    f := f || pg_temp.t_eq('7i and the recap says so', (select string_agg(concat_ws(':', a ->> 'title', a ->> 'done', a ->> 'placed'), ',' order by ord) from public.my_session_recaps() r, jsonb_array_elements(r.actions) with ordinality as x(a, ord)), 'Book the review:true:true,Send the notes:false:false');
    f := f || pg_temp.t_eq('7j she can undo done and leave placed', concat(pg_temp.t_n(format('select public.my_session_action(%L, false)::text', a1)), '/', pg_temp.t_n(format('select string_agg(concat_ws('':'', a ->> ''done'', a ->> ''placed''), '','') from public.my_session_recaps() r, jsonb_array_elements(r.actions) a where a ->> ''id'' = %L', a1))), '/false:true');
    f := f || pg_temp.t_eq('7k and mark it done again', pg_temp.t_n(format('select public.my_session_action(%L, true)::text', a1)), '');
    f := f || pg_temp.t_eq('7l an unticked action is refused', pg_temp.t_n(format('select public.my_session_action(%L, true)::text', a2)), 'error 42501');
    f := f || pg_temp.t_eq('7m an unsent session''s action is refused', pg_temp.t_n(format('select public.my_session_action(%L, true)::text', a5)), 'error 42501');
    f := f || pg_temp.t_eq('7n an action that isn''t there is refused', pg_temp.t_n(format('select public.my_session_action(%L, true)::text', gen_random_uuid())), 'error 42501');
    f := f || pg_temp.t_eq('7o Ella still reads no session table directly', (select concat_ws('/', (select count(*) from public.coach_sessions), (select count(*) from public.coach_session_people), (select count(*) from public.coach_session_actions), (select count(*) from public.coach_session_notes))), '0/0/0/0');
    f := f || pg_temp.t_eq('7p and can''t write to one', concat_ws('/',
      pg_temp.t_rows(format('update public.coach_session_actions set title = ''Mine now'', send = true where session_id = %L', s1)),
      pg_temp.t_rows(format('update public.coach_sessions set recap = ''Mine now'' where id = %L', s1)),
      pg_temp.t_rows(format('delete from public.coach_session_notes where session_id = %L', s1)),
      pg_temp.t_rows(format('insert into public.coach_session_actions (session_id, coach_id, title) values (%L, %L, ''x'')', s1, maya_c)),
      pg_temp.t_rows(format('insert into public.coach_session_notes (session_id, coach_id, focus) values (%L, %L, ''x'')', s5, maya_c))), '0/0/0/error 42501/error 42501');
    perform pg_temp.t_as(sam_u);
    f := f || pg_temp.t_eq('7q the second client gets nothing', (select count(*)::text from public.my_session_recaps()), '0');
    f := f || pg_temp.t_eq('7r and can''t mark Ella''s action', pg_temp.t_n(format('select public.my_session_action(%L, false, false)::text', a1)), 'error 42501');
    f := f || pg_temp.t_eq('7s Sam reads no session table directly either', (select concat_ws('/', (select count(*) from public.coach_sessions), (select count(*) from public.coach_session_actions), (select count(*) from public.coach_session_notes))), '0/0/0');
    perform pg_temp.t_as(noor_u);
    f := f || pg_temp.t_eq('7t nor does Maya''s other client get Ella''s recap, or mark her action', concat((select count(*) from public.my_session_recaps()), '/', pg_temp.t_n(format('select public.my_session_action(%L, false)::text', a1))), '0/error 42501');
    perform pg_temp.t_as(maya_u);
    f := f || pg_temp.t_eq('7u Maya sees what Ella did, and nothing else moved', (select string_agg(concat_ws(':', title, (done_at is not null)::text, (placed_at is not null)::text), ',' order by position) from public.coach_session_actions where session_id = s1), 'Added after sending:false:false,Book the review:true:true,Private nudge for Maya:false:false,Send the notes:false:false');
    f := f || pg_temp.t_eq('7v a coach has no recaps of their own', (select count(*)::text from public.my_session_recaps()), '0');
    f := f || pg_temp.t_eq('7w Maya sends the group''s recap', pg_temp.t_n(format('select public.session_send_recap(%L)', sg)), 'sent');
    f := f || pg_temp.t_eq('7x it goes to both members', (select string_agg(name, ',' order by name) from public.session_recap_people(sg)), 'Ella Fraser,Noor Haddad');
    perform pg_temp.t_as(noor_u);
    f := f || pg_temp.t_eq('7y a group recap reaches Noor', (select string_agg(concat_ws('|', (session_id = sg)::text, recap, group_name, kind, actions -> 0 ->> 'title'), ';') from public.my_session_recaps()), 'true|Team recap: one priority each.|Leadership team|group|Each name one priority');
    f := f || pg_temp.t_eq('7z and Noor marks the group''s action', pg_temp.t_n(format('select public.my_session_action(%L, true)::text', ag)), '');
    perform pg_temp.t_as(ella_u);
    f := f || pg_temp.t_eq('7aa and reaches Ella beside her own, newest first', (select string_agg(case session_id when s1 then 'own' when sg then 'group' else 'other' end, ',' order by n) from (select session_id, row_number() over () as n from public.my_session_recaps()) r), 'own,group');
    perform pg_temp.t_as(sam_u);
    f := f || pg_temp.t_eq('7ab and never Sam, who can''t mark its action', concat((select count(*) from public.my_session_recaps()), '/', pg_temp.t_n(format('select public.my_session_action(%L, true)::text', ag))), '0/error 42501');
    perform pg_temp.t_as(own_u);
    f := f || pg_temp.t_eq('7ac the owner sends their own to Sam', pg_temp.t_n(format('select public.session_send_recap(%L)', so)), 'sent');
    perform pg_temp.t_as(sam_u);
    f := f || pg_temp.t_eq('7ad Sam has exactly that one, from Tess', (select string_agg(concat_ws('|', recap, coach_first_name, actions -> 0 ->> 'title'), ';') from public.my_session_recaps()), 'Owner recap for Sam|Tess|Sam writes the brief');
    select string_agg(r::text, ' ') into v from public.my_session_recaps() r;
    f := f || pg_temp.t_eq('7ae never the owner''s private notes', (v like '%SECRET%')::text, 'false');
    perform pg_temp.t_as(ella_u);
    f := f || pg_temp.t_eq('7af Ella can''t mark Sam''s action', pg_temp.t_n(format('select public.my_session_action(%L, true)::text', ao)), 'error 42501');

    -- 6 (the end). An unsent session can be deleted; the count follows.
    perform pg_temp.t_as(maya_u);
    f := f || pg_temp.t_eq('6v sending changed no count: still 9', (select sessions_held::text from public.engagements where id = eng_m), '9');
    f := f || pg_temp.t_eq('6w an unsent session can be deleted, and the count drops to 8', concat(pg_temp.t_rows(format('delete from public.coach_sessions where id = %L', s5)), '/', pg_temp.t_held(eng_m)), '1/8');
    f := f || pg_temp.t_eq('6x its action went with it', (select count(*)::text from public.coach_session_actions where id = a5), '0');
    f := f || pg_temp.t_eq('6y the sent group session can''t be deleted either', pg_temp.t_rows(format('delete from public.coach_sessions where id = %L', sg)), '0');

    -- 8. session_prep.
    perform pg_temp.t_as(ella_u);
    f := f || pg_temp.t_eq('8a Ella writes her note for next time', pg_temp.t_rows(format('insert into public.session_prep (user_id, body) values (%L, ''I want to talk about the board paper.'')', ella_u)), '1');
    f := f || pg_temp.t_eq('8b one at a time', pg_temp.t_rows(format('insert into public.session_prep (user_id, body) values (%L, ''A second one'')', ella_u)), 'error 23505');
    f := f || pg_temp.t_eq('8c not for someone else', pg_temp.t_rows(format('insert into public.session_prep (user_id, body) values (%L, ''x'')', sam_u)), 'error 42501');
    f := f || pg_temp.t_eq('8d she changes it', pg_temp.t_rows(format('update public.session_prep set body = ''The board paper, and my week.'', noted_at = now() where user_id = %L', ella_u)), '1');
    f := f || pg_temp.t_eq('8e an empty one is refused, and one over 2,000 characters', concat(pg_temp.t_rows(format('update public.session_prep set body = ''  '' where user_id = %L', ella_u)), '/', pg_temp.t_rows(format('update public.session_prep set body = repeat(''a'', 2001) where user_id = %L', ella_u))), 'error 23514/error 23514');
    f := f || pg_temp.t_eq('8f she can''t hand it to someone else', pg_temp.t_rows(format('update public.session_prep set user_id = %L where user_id = %L', sam_u, ella_u)), 'error 42501');
    perform pg_temp.t_as(sam_u);
    f := f || pg_temp.t_eq('8g Sam writes his own', pg_temp.t_rows(format('insert into public.session_prep (user_id, body) values (%L, ''Sam: the restructure.'')', sam_u)), '1');
    f := f || pg_temp.t_eq('8h the other client reads only their own', (select string_agg(body, ',') from public.session_prep), 'Sam: the restructure.');
    f := f || pg_temp.t_eq('8i and can''t change or delete Ella''s', concat(pg_temp.t_rows(format('update public.session_prep set body = ''x'' where user_id = %L', ella_u)), pg_temp.t_rows(format('delete from public.session_prep where user_id = %L', ella_u))), '00');
    perform pg_temp.t_as(maya_u);
    f := f || pg_temp.t_eq('8j Ella''s coach reads hers, and only hers', (select string_agg(body, ',') from public.session_prep), 'The board paper, and my week.');
    f := f || pg_temp.t_eq('8k but can''t write, change or delete it', concat_ws('/',
      pg_temp.t_rows(format('update public.session_prep set body = ''From the coach'' where user_id = %L', ella_u)),
      pg_temp.t_rows(format('delete from public.session_prep where user_id = %L', ella_u)),
      pg_temp.t_rows(format('insert into public.session_prep (user_id, body) values (%L, ''From the coach'')', noor_u)),
      pg_temp.t_rows(format('insert into public.session_prep (user_id, body) values (%L, ''My own'')', maya_u))), '0/0/error 42501/1');
    f := f || pg_temp.t_eq('8l (a coach''s own account may keep one, as any account)', pg_temp.t_rows(format('delete from public.session_prep where user_id = %L', maya_u)), '1');
    perform pg_temp.t_as(cora_u);
    f := f || pg_temp.t_eq('8m another coach reads none', (select count(*)::text from public.session_prep), '0');
    perform pg_temp.t_as(own_u);
    f := f || pg_temp.t_eq('8n the owner reads their own client''s, never Maya''s client''s', (select string_agg(body, ',') from public.session_prep), 'Sam: the restructure.');
    f := f || pg_temp.t_eq('8o and can''t change Ella''s', pg_temp.t_rows(format('update public.session_prep set body = ''x'' where user_id = %L', ella_u)), '0');
    perform pg_temp.t_admin();
    update public.coach_clients set ended_at = now() where client_id = ella_u and ended_at is null;
    perform pg_temp.t_as(maya_u);
    f := f || pg_temp.t_eq('8p once Maya is no longer her coach she reads none', (select count(*)::text from public.session_prep), '0');
    perform pg_temp.t_admin();
    update public.coach_clients set ended_at = null where client_id = ella_u and coach_id = maya_c;
    perform pg_temp.t_as(ella_u);
    f := f || pg_temp.t_eq('8q Ella clears hers', concat(pg_temp.t_rows(format('delete from public.session_prep where user_id = %L', ella_u)), pg_temp.t_n('select count(*)::text from public.session_prep')), '10');

    -- 9. Coaching hours a week.
    perform pg_temp.t_admin();
    select coalesce(string_agg(id::text || ':' || capacity_hours_week, ',' order by id), 'none') into v from public.coaches where id not in (own_c, maya_c, cora_c);
    perform pg_temp.t_as(maya_u);
    f := f || pg_temp.t_eq('9a Maya sets her own to 12', pg_temp.t_n('select public.coach_save_capacity(12)::text'), '');
    f := f || pg_temp.t_eq('9b 0, 81, none and a third of an hour are refused', concat_ws('/', pg_temp.t_n('select public.coach_save_capacity(0)::text'), pg_temp.t_n('select public.coach_save_capacity(81)::text'), pg_temp.t_n('select public.coach_save_capacity(null)::text'), pg_temp.t_n('select public.coach_save_capacity(12.3)::text'), pg_temp.t_n('select public.coach_save_capacity(-5)::text')), 'error 22023/error 22023/error 22023/error 22023/error 22023');
    f := f || pg_temp.t_eq('9c half hours are fine', pg_temp.t_n('select public.coach_save_capacity(12.5)::text'), '');
    f := f || pg_temp.t_eq('9d and back to 12', pg_temp.t_n('select public.coach_save_capacity(12)::text'), '');
    perform pg_temp.t_as(ella_u);
    f := f || pg_temp.t_eq('9e a client is refused', pg_temp.t_n('select public.coach_save_capacity(12)::text'), 'error 42501');
    perform pg_temp.t_admin();
    f := f || pg_temp.t_eq('9f only Maya''s row changed', (select string_agg(display_first_name || ':' || capacity_hours_week::numeric(4, 1), ',' order by display_first_name) from public.coaches where id in (own_c, maya_c, cora_c)), 'Cora:15.0,Maya:12.0,Tess:15.0');
    f := f || pg_temp.t_eq('9g no other coach on this database was changed by it', (select (coalesce(string_agg(id::text || ':' || capacity_hours_week, ',' order by id), 'none') = v)::text from public.coaches where id not in (own_c, maya_c, cora_c)), 'true');

    -- 10. Workshops.
    perform pg_temp.t_as(maya_u);
    f := f || pg_temp.t_eq('10a Maya''s workshop on Tue 12 Mar 2030, 10:00 UK time, and one that started yesterday', concat(
      pg_temp.t_rows(format('insert into public.workshops (id, coach_id, title, starts_at, time_zone, place, remind_day_before, remind_hour_before) values (%L, %L, ''Leading under pressure'', %L, ''Europe/London'', ''Room 4'', true, true)', ws, maya_c, ws_start)),
      pg_temp.t_rows(format('insert into public.workshops (id, coach_id, title, starts_at, time_zone, survey_on) values (%L, %L, ''Feedback that lands'', now() - interval ''1 day'', ''Europe/London'', true)', ws2, maya_c)),
      pg_temp.t_rows(format('insert into public.workshop_attendees (workshop_id, name, email, status) values (%L, ''Dana W'', ''dana@example.invalid'', ''registered''), (%L, ''Femi A'', ''femi@example.invalid'', ''registered''), (%L, ''Grace L'', ''grace@example.invalid'', ''waiting''), (%L, ''Hal C'', ''hal@example.invalid'', ''cancelled'')', ws, ws, ws, ws)),
      pg_temp.t_rows(format('insert into public.workshop_attendees (workshop_id, name, email, status) values (%L, ''Dana W'', ''dana@example.invalid'', ''registered''), (%L, ''Ivo P'', ''ivo@example.invalid'', ''registered''), (%L, ''Jo K'', ''jo@example.invalid'', ''waiting'')', ws2, ws2, ws2))), '1143');
    f := f || pg_temp.t_eq('10b she can''t ask what is due, or claim a send', concat(pg_temp.t_n('select count(*)::text from public.workshop_emails_due()'), '/', pg_temp.t_n(format('select public.workshop_send_claim(%L, ''day_before'', 2)::text', ws))), 'error 42501/error 42501');
    f := f || pg_temp.t_eq('10c nor write what was sent', concat_ws('/',
      pg_temp.t_rows(format('insert into public.workshop_sends (workshop_id, kind, people) values (%L, ''day_before'', 2)', ws)),
      pg_temp.t_rows('update public.workshop_sends set people = 0'),
      pg_temp.t_rows('delete from public.workshop_sends')), 'error 42501/error 42501/error 42501');
    f := f || pg_temp.t_eq('10d the follow-up waits for the workshop to start', pg_temp.t_n(format('select count(*)::text from public.workshop_follow_up_claim(%L)', ws)), 'error 22023');
    perform pg_temp.t_as(cora_u);
    f := f || pg_temp.t_eq('10e another coach can''t send Maya''s follow-up', pg_temp.t_n(format('select count(*)::text from public.workshop_follow_up_claim(%L)', ws2)), 'error 42501');
    perform pg_temp.t_as(own_u);
    f := f || pg_temp.t_eq('10f nor the owner, nor a workshop that isn''t there', concat(pg_temp.t_n(format('select count(*)::text from public.workshop_follow_up_claim(%L)', ws2)), '/', pg_temp.t_n(format('select count(*)::text from public.workshop_follow_up_claim(%L)', gen_random_uuid()))), 'error 42501/error 42501');
    perform pg_temp.t_as(ella_u);
    f := f || pg_temp.t_eq('10g nor a client', pg_temp.t_n(format('select count(*)::text from public.workshop_follow_up_claim(%L)', ws2)), 'error 42501');
    perform pg_temp.t_admin();
    f := f || pg_temp.t_eq('10h nothing was recorded by any of that', (select count(*)::text from public.workshop_sends where workshop_id in (ws, ws2)), '0');
    f := f || pg_temp.t_eq('10i two days before, nothing is due', (select count(*)::text from public.workshop_emails_due(ws_start - interval '2 days') where workshop_id = ws), '0');
    f := f || pg_temp.t_eq('10j at 06:59 the day before, still nothing', (select count(*)::text from public.workshop_emails_due('2030-03-11 06:59:00'::timestamp at time zone 'Europe/London') where workshop_id = ws), '0');
    f := f || pg_temp.t_eq('10k from 07:00 the day before, the reminder for each registered attendee only', (select string_agg(concat_ws('|', kind, title, place, coach_first_name, attendee_name, attendee_email, time_zone, (starts_at = ws_start)::text), ';' order by attendee_name) from public.workshop_emails_due('2030-03-11 07:00:00'::timestamp at time zone 'Europe/London') where workshop_id = ws), 'day_before|Leading under pressure|Room 4|Maya|Dana W|dana@example.invalid|Europe/London|true;day_before|Leading under pressure|Room 4|Maya|Femi A|femi@example.invalid|Europe/London|true');
    f := f || pg_temp.t_eq('10l within 2 hours of the start it is too late for the day-before one', (select count(*)::text from public.workshop_emails_due(ws_start - interval '100 minutes') where workshop_id = ws), '0');
    f := f || pg_temp.t_eq('10m an hour before, the 1-hour reminder', (select string_agg(kind || ':' || attendee_name, ',' order by attendee_name) from public.workshop_emails_due(ws_start - interval '1 hour') where workshop_id = ws), 'hour_before:Dana W,hour_before:Femi A');
    f := f || pg_temp.t_eq('10n and not 44 or 76 minutes before, or after the start', (select concat_ws('/', (select count(*) from public.workshop_emails_due(ws_start - interval '44 minutes') where workshop_id = ws), (select count(*) from public.workshop_emails_due(ws_start - interval '76 minutes') where workshop_id = ws), (select count(*) from public.workshop_emails_due(ws_start + interval '1 minute') where workshop_id = ws))), '0/0/0');
    f := f || pg_temp.t_eq('10o the email server claims the day-before send', public.workshop_send_claim(ws, 'day_before', 2)::text, 'true');
    f := f || pg_temp.t_eq('10p a second claim of the same kind is refused', public.workshop_send_claim(ws, 'day_before', 2)::text, 'false');
    f := f || pg_temp.t_eq('10q once claimed, none of that kind is due', (select count(*)::text from public.workshop_emails_due('2030-03-11 08:00:00'::timestamp at time zone 'Europe/London') where workshop_id = ws), '0');
    f := f || pg_temp.t_eq('10r the 1-hour one is still due', (select count(*)::text from public.workshop_emails_due(ws_start - interval '1 hour') where workshop_id = ws), '2');
    f := f || pg_temp.t_eq('10r2 it is claimed once', concat(public.workshop_send_claim(ws, 'hour_before', 2)::text, '/', public.workshop_send_claim(ws, 'hour_before', 2)::text), 'true/false');
    f := f || pg_temp.t_eq('10r3 then it is not due', (select count(*)::text from public.workshop_emails_due(ws_start - interval '1 hour') where workshop_id = ws), '0');
    f := f || pg_temp.t_eq('10s a kind that isn''t one is refused', pg_temp.t_n(format('select public.workshop_send_claim(%L, ''newsletter'', 2)::text', ws)), 'error 23514');
    update public.workshops set remind_day_before = false where id = ws;
    delete from public.workshop_sends where workshop_id = ws and kind = 'day_before';
    f := f || pg_temp.t_eq('10t with the reminder switched off, none is due', (select count(*)::text from public.workshop_emails_due('2030-03-11 08:00:00'::timestamp at time zone 'Europe/London') where workshop_id = ws), '0');
    insert into public.workshop_sends (workshop_id, kind, people) values (ws, 'day_before', 2);
    perform pg_temp.t_as(maya_u);
    f := f || pg_temp.t_eq('10u Maya sends the follow-up: each registered attendee, once, with the survey', pg_temp.t_n(format('select string_agg(concat_ws(''|'', kind, attendee_name, attendee_email, (survey_key is not null)::text), '';'' order by attendee_name) from public.workshop_follow_up_claim(%L)', ws2)), 'follow_up_survey|Dana W|dana@example.invalid|true;follow_up_survey|Ivo P|ivo@example.invalid|true');
    f := f || pg_temp.t_eq('10v a second press returns nobody', pg_temp.t_n(format('select count(*)::text from public.workshop_follow_up_claim(%L)', ws2)), '0');
    f := f || pg_temp.t_eq('10w Maya reads what was sent for her workshops', (select string_agg(concat_ws(':', kind, people, case when sent_by = maya_u then 'Maya' when sent_by is null then 'server' else 'other' end), ',' order by kind) from public.workshop_sends where workshop_id in (ws, ws2)), 'day_before:2:server,follow_up:2:Maya,hour_before:2:server,survey:2:Maya');
    f := f || pg_temp.t_eq('10x and the survey is dated', (select (survey_sent_on = current_date)::text from public.workshops where id = ws2), 'true');
    f := f || pg_temp.t_eq('10y she still can''t write it', concat_ws('/',
      pg_temp.t_rows(format('update public.workshop_sends set people = 99 where workshop_id = %L', ws2)),
      pg_temp.t_rows(format('delete from public.workshop_sends where workshop_id = %L', ws2))), 'error 42501/error 42501');
    perform pg_temp.t_as(cora_u);
    f := f || pg_temp.t_eq('10z another coach reads none of it', (select count(*)::text from public.workshop_sends where workshop_id in (ws, ws2)), '0');
    perform pg_temp.t_as(own_u);
    f := f || pg_temp.t_eq('10aa nor the owner', (select count(*)::text from public.workshop_sends where workshop_id in (ws, ws2)), '0');
    perform pg_temp.t_as(ella_u);
    f := f || pg_temp.t_eq('10ab nor a client, who can''t write it either', concat((select count(*) from public.workshop_sends where workshop_id in (ws, ws2)), '/', pg_temp.t_rows(format('insert into public.workshop_sends (workshop_id, kind) values (%L, ''survey'')', ws))), '0/error 42501');

    -- 11. What a client is being asked.
    perform pg_temp.t_as(own_u);
    f := f || pg_temp.t_eq('11a the owner sets cover for Sam, and asks to view Sam''s portal', concat(
      pg_temp.t_rows(format('insert into public.coach_cover (id, coach_id, cover_coach_id, profile_id, starts_on, ends_on) values (%L, %L, %L, %L, current_date + 1, current_date + 9)', cover1, own_c, cora_c, p_sam)),
      pg_temp.t_rows(format('insert into public.client_view_requests (profile_id, coach_id) values (%L, %L)', p_sam, own_c))), '11');
    perform pg_temp.t_as(sam_u);
    f := f || pg_temp.t_eq('11b Sam sees the cover ask, with both first names and the dates', (select string_agg(concat_ws('|', (cover_id = cover1)::text, coach_first_name, cover_first_name, (starts_on = current_date + 1)::text, (ends_on = current_date + 9)::text, (agreed_at is null)::text), ';') from public.my_cover_asks()), 'true|Tess|Cora|true|true|true');
    f := f || pg_temp.t_eq('11c and the view ask, from Tess, not answered', (select string_agg(concat_ws('|', coach_first_name, (answered_at is null)::text, coalesce(allowed::text, 'not answered')), ';') from public.my_view_asks()), 'Tess|true|not answered');
    perform pg_temp.t_as(ella_u);
    f := f || pg_temp.t_eq('11d the other client sees neither', (select concat((select count(*) from public.my_cover_asks()), (select count(*) from public.my_view_asks()))), '00');
    perform pg_temp.t_as(maya_u);
    f := f || pg_temp.t_eq('11e Maya asks to view Ella''s portal', pg_temp.t_rows(format('insert into public.client_view_requests (profile_id, coach_id) values (%L, %L)', p_ella, maya_c)), '1');
    f := f || pg_temp.t_eq('11f a coach has no asks of their own', (select concat((select count(*) from public.my_cover_asks()), (select count(*) from public.my_view_asks()))), '00');
    perform pg_temp.t_as(ella_u);
    f := f || pg_temp.t_eq('11g Ella sees only her own ask, from Maya', (select string_agg(coach_first_name, ',') from public.my_view_asks()), 'Maya');
    perform pg_temp.t_as(sam_u);
    f := f || pg_temp.t_eq('11h Sam still sees only his own', (select concat((select string_agg(coach_first_name, ',') from public.my_view_asks()), '/', (select count(*) from public.my_cover_asks()))), 'Tess/1');
    f := f || pg_temp.t_eq('11i once Sam agrees, the ask says so', concat(pg_temp.t_n(format('select public.cover_agree(%L)::text', cover1)), '/', pg_temp.t_n('select (agreed_at is not null)::text from public.my_cover_asks()')), '/true');
    perform pg_temp.t_admin();
    update public.coach_cover set starts_on = current_date - 9, ends_on = current_date - 1 where id = cover1;
    perform pg_temp.t_as(sam_u);
    f := f || pg_temp.t_eq('11j cover that has ended is no longer asked', (select count(*)::text from public.my_cover_asks()), '0');

    -- 12. hidden_help.
    perform pg_temp.t_as(maya_u);
    f := f || pg_temp.t_eq('12a hidden_help starts empty and takes an object', concat(
      pg_temp.t_rows(format('insert into public.coach_settings (coach_id) values (%L)', maya_c)), '/',
      pg_temp.t_n(format('select hidden_help::text from public.coach_settings where coach_id = %L', maya_c)), '/',
      pg_temp.t_rows(format('update public.coach_settings set hidden_help = ''{"today_plan": true, "energy": true}'' where coach_id = %L', maya_c)), '/',
      pg_temp.t_n(format('select hidden_help ->> ''energy'' from public.coach_settings where coach_id = %L', maya_c))), '1/{}/1/true');
    f := f || pg_temp.t_eq('12b an array, a word or nothing is refused', concat_ws('/',
      pg_temp.t_rows(format('update public.coach_settings set hidden_help = ''["today_plan"]'' where coach_id = %L', maya_c)),
      pg_temp.t_rows(format('update public.coach_settings set hidden_help = ''"all"'' where coach_id = %L', maya_c)),
      pg_temp.t_rows(format('update public.coach_settings set hidden_help = null where coach_id = %L', maya_c))), 'error 23514/error 23514/error 23502');
    perform pg_temp.t_as(own_u);
    f := f || pg_temp.t_eq('12c the owner doesn''t read or change Maya''s', concat((select count(*) from public.coach_settings where coach_id = maya_c), pg_temp.t_rows(format('update public.coach_settings set hidden_help = ''{}'' where coach_id = %L', maya_c))), '00');

    perform pg_temp.t_admin();
    raise exception 'undo the test rows' using errcode = 'P0050';
  exception when sqlstate 'P0050' then
    perform pg_temp.t_admin();
  end;

  f := f || pg_temp.t_eq('13 everything the test made is undone', (select concat_ws('/', (select count(*) from auth.users where email like 'p6a-test-%@example.invalid'), (select count(*) from public.coach_todos where coach_id = maya_c), (select count(*) from public.coach_sessions where id in (s1, sg, so)))), '0/0/0');

  if cardinality(f) > 0 then
    raise exception E'050 FAILED (%):\n%', cardinality(f), array_to_string(f, E'\n');
  end if;
  raise notice '050 CHECKS PASSED';
end
$t$;
