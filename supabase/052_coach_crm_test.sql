-- =============================================================================
-- 052_coach_crm_test.sql
-- Checks 052_coach_crm.sql. RUN ORDER: 026, 033, 049, 050, 051, 052, then this.
--
-- WHAT IT DOES
--   Makes an invented owner (Tess), an associate (Maya), a client account
--   (Sam, the owner's), someone signed out and the email server, and checks
--   each reading and writing what it should, and being refused what it
--   shouldn't:
--     1. every new table is locked down, the functions are open only to who
--        they are for, and the migration recorded itself;
--     2. the shape checks: a stage's likelihood, an automation's only two
--        actions, ratings 0 to 10, what was given and asked, an email's
--        people, a board's columns;
--     3. each role: the owner reads and writes Leads' stages, automations,
--        boards, emails and Network; an associate, a client and someone
--        signed out read none of them (an associate reads only a shared
--        board, and can't change it);
--     4. stages: the five to start, once; Won always last and 100%; a stage
--        with leads in it stays; a new lead takes the first stage; a booking
--        writes its own two timeline lines; contact moves last_contact_on;
--     5. merging two leads, and Undo;
--     6. automations: add a to-do or move a stage and nothing else; one run
--        for each automation and event;
--     7. emails: logged once, on the lead's, client's and Network person's
--        timelines by their address; someone not in the portal waits on
--        Leads, once; the copy-in address is the email server's alone; the
--        to-do address makes one to-do an email;
--     8. past clients' check-ins are their own coach's; the account map is
--        the owner's;
--     9. Network: Where to focus at every boundary, in the order checked;
--        when a catch-up is due; a rating's dated history; given and asked
--        counts; a page at a time (50), searched, sorted and narrowed;
--        archive with someone kept, and restore; merge with Undo; the map's
--        150; import with duplicates first;
--    10. 5,000 people: a page, a search and the map each answer quickly.
--   Everything it makes is undone at the end.
--
--   It ends with the notice 052 CHECKS PASSED, or stops with FAILED and a
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
-- Where to focus for four ratings, as the table works it out.
create or replace function pg_temp.t_focus(p_coach uuid, i integer, t integer, v integer, g integer) returns text language plpgsql as $f$
declare out text; pid uuid := gen_random_uuid();
begin
  insert into public.network_people (id, coach_id, name, influence, trust, value_delivery, what_you_get) values (pid, p_coach, 'Focus check', i, t, v, g);
  select coalesce(focus, 'none') into out from public.network_people where id = pid;
  delete from public.network_people where id = pid;
  return out;
end $f$;
-- The names on a page, joined by commas.
create or replace function pg_temp.t_names(p jsonb) returns text language sql as $f$
  select coalesce(string_agg(r ->> 'name', ',' order by i), 'none') from jsonb_array_elements(p -> 'rows') with ordinality as x(r, i);
$f$;

do $t$
declare
  f text[] := '{}';
  tbl text;
  tables text[] := array[
    'coach_lead_stages', 'coach_lead_events', 'coach_lead_merges', 'coach_automations', 'coach_automation_runs', 'coach_boards',
    'coach_board_stages', 'coach_board_items', 'coach_emails', 'coach_email_bodies', 'coach_email_links', 'coach_email_waiting',
    'coach_email_addresses', 'client_check_ins', 'organisation_deals', 'organisation_growth', 'network_people', 'network_ratings',
    'network_gives', 'network_columns', 'network_merges'];
  own_u uuid; maya_u uuid; sam_u uuid;
  own_c uuid; maya_c uuid;
  own_email text;
  org uuid := gen_random_uuid();
  p_sam uuid := gen_random_uuid();     -- the owner's client
  p_past uuid := gen_random_uuid();    -- the owner's past client
  p_nina uuid := gen_random_uuid();    -- Maya's client
  st_new uuid; st_call uuid; st_prop uuid; st_won uuid; st_extra uuid := gen_random_uuid();
  l_amy uuid := gen_random_uuid(); l_ruth uuid := gen_random_uuid(); l_dup uuid := gen_random_uuid(); l_maya uuid := gen_random_uuid();
  l_booked uuid := gen_random_uuid();
  a_todo uuid := gen_random_uuid(); a_stage uuid := gen_random_uuid();
  b_spk uuid := gen_random_uuid(); b_priv uuid := gen_random_uuid(); bs1 uuid := gen_random_uuid(); bs2 uuid := gen_random_uuid();
  bs_priv uuid := gen_random_uuid(); bi1 uuid := gen_random_uuid();
  n_dan uuid := gen_random_uuid(); n_sofia uuid := gen_random_uuid(); n_old uuid := gen_random_uuid(); n_old2 uuid := gen_random_uuid();
  n_dup uuid := gen_random_uuid(); n_col uuid := gen_random_uuid();
  g1 uuid := gen_random_uuid(); g2 uuid := gen_random_uuid(); g3 uuid := gen_random_uuid();
  e1 uuid; mg uuid; todo1 uuid;
  log_key text; todo_key text;
  today date := date '2026-11-19';
  t0 timestamptz; ms_page numeric; ms_search numeric; ms_map numeric; ms_sort numeric;
  v text; j jsonb; r text[];
begin
  -- 1. Locked down, and recorded.
  foreach tbl in array tables loop
    f := f || pg_temp.t_eq('1a ' || tbl || ' has row security', (select relrowsecurity::text from pg_class where oid = ('public.' || tbl)::regclass), 'true');
    f := f || pg_temp.t_eq('1b ' || tbl || ': nothing for someone signed out', (select count(*)::text from information_schema.role_table_grants where grantee in ('anon', 'public', 'PUBLIC') and table_schema = 'public' and table_name = tbl), '0');
    f := f || pg_temp.t_eq('1c ' || tbl || ': every rule is for signed-in people', (select count(*)::text from pg_policies where schemaname = 'public' and tablename = tbl and roles <> '{authenticated}'), '0');
    if tbl not in ('coach_lead_merges', 'network_merges') then
      f := f || pg_temp.t_eq('1d ' || tbl || ': has at least one rule', (select (count(*) > 0)::text from pg_policies where schemaname = 'public' and tablename = tbl), 'true');
    end if;
  end loop;
  f := f || pg_temp.t_eq('1e the merge records: no rule and no grant for any person', (select concat(
      (select count(*) from pg_policies where schemaname = 'public' and tablename in ('coach_lead_merges', 'network_merges')), '/',
      (select count(*) from information_schema.role_table_grants where grantee = 'authenticated' and table_schema = 'public' and table_name in ('coach_lead_merges', 'network_merges')))), '0/0');
  if to_regclass('public.migration_log') is not null then
    f := f || pg_temp.t_eq('1f the migration recorded itself, once', (select count(*)::text from public.migration_log where number = 52 and name = '052_coach_crm'), '1');
  end if;
  f := f || pg_temp.t_eq('1g the addresses'' keys can only be read; runs and links can''t be changed', (select string_agg(table_name || ':' || privs, ' ' order by table_name) from (
      select table_name, string_agg(privilege_type, ',' order by privilege_type) as privs from information_schema.role_table_grants
      where grantee = 'authenticated' and table_schema = 'public' and table_name in ('coach_email_addresses', 'coach_automation_runs', 'coach_email_links') group by 1) x),
    'coach_automation_runs:DELETE,INSERT,SELECT coach_email_addresses:SELECT coach_email_links:DELETE,INSERT,SELECT');
  f := f || pg_temp.t_eq('1h every function is closed to someone signed out', (select concat(
      has_function_privilege('anon', 'public.coach_lead_stages_start()', 'execute'),
      has_function_privilege('anon', 'public.lead_merge(uuid, uuid, jsonb)', 'execute'),
      has_function_privilege('anon', 'public.lead_unmerge(uuid)', 'execute'),
      has_function_privilege('anon', 'public.network_page(text, text, boolean, jsonb, boolean, integer, integer, date)', 'execute'),
      has_function_privilege('anon', 'public.network_map(text, integer, date)', 'execute'),
      has_function_privilege('anon', 'public.network_counts(date)', 'execute'),
      has_function_privilege('anon', 'public.network_archive(uuid[], uuid[])', 'execute'),
      has_function_privilege('anon', 'public.network_restore(uuid[], uuid[])', 'execute'),
      has_function_privilege('anon', 'public.network_duplicates(jsonb)', 'execute'),
      has_function_privilege('anon', 'public.network_import(jsonb)', 'execute'),
      has_function_privilege('anon', 'public.network_merge(uuid, uuid, jsonb)', 'execute'),
      has_function_privilege('anon', 'public.network_unmerge(uuid)', 'execute'),
      has_function_privilege('anon', 'public.coach_email_addresses_start()', 'execute'),
      has_function_privilege('anon', 'public.coach_email_add(jsonb)', 'execute'),
      has_function_privilege('anon', 'public.email_in(text, jsonb)', 'execute'),
      has_function_privilege('anon', 'public.my_owner_coach_id()', 'execute'))), 'ffffffffffffffff');
  f := f || pg_temp.t_eq('1i the email server''s function and the inner workings are closed to every person', (select concat(
      has_function_privilege('authenticated', 'public.email_in(text, jsonb)', 'execute'),
      has_function_privilege('service_role', 'public.email_in(text, jsonb)', 'execute'),
      has_function_privilege('authenticated', 'public._email_log(uuid, jsonb)', 'execute'),
      has_function_privilege('authenticated', 'public._network_recount(uuid)', 'execute'),
      has_function_privilege('authenticated', 'public._coach_today(uuid)', 'execute'))), 'ftfff');

  -- 2. The shape checks.
  f := f || pg_temp.t_eq('2a an email''s people', (select concat(
      public.coach_email_people_ok('[]'),
      public.coach_email_people_ok('[{"name":"Amy Cole","email":"amy@example.invalid"}]'),
      public.coach_email_people_ok('[{"name":"Amy Cole"}]'),
      public.coach_email_people_ok('[{"email":"Amy@Example.invalid"}]'),
      public.coach_email_people_ok('{"email":"amy@example.invalid"}'),
      public.coach_email_people_ok('["amy@example.invalid"]'))), 'ttffff');
  f := f || pg_temp.t_eq('2b a board''s columns', (select concat(
      public.coach_board_columns_ok('[]'),
      public.coach_board_columns_ok('[{"id":"date","name":"Date","kind":"date"},{"id":"fee","name":"Fee","kind":"money"}]'),
      public.coach_board_columns_ok('[{"id":"x","name":"X","kind":"formula"}]'),
      public.coach_board_columns_ok('[{"name":"No id","kind":"text"}]'),
      public.coach_board_columns_ok('{"id":"x"}'))), 'ttfff');

  begin
    perform pg_temp.t_admin();
    own_u := pg_temp.t_user('owner'); maya_u := pg_temp.t_user('maya'); sam_u := pg_temp.t_user('sam');
    select email into own_email from auth.users where id = own_u;
    insert into public.coaches (user_id, role, display_first_name, full_name, email) values (own_u, 'owner', 'Tess', 'Tess Owner', own_email) returning id into own_c;
    insert into public.coaches (user_id, role, display_first_name, full_name) values (maya_u, 'coach', 'Maya', 'Maya Invented') returning id into maya_c;
    insert into public.coach_settings (coach_id, time_zone) values (own_c, 'Europe/London'), (maya_c, 'Europe/London');
    insert into public.organisations (id, name) values (org, 'Kestrel Group (test)');
    insert into public.client_profiles (id, coach_id, name, email, organisation_id) values (p_sam, own_c, 'Sam Okafor', 'sam@example.invalid', org);
    insert into public.client_profiles (id, coach_id, name, email, status, ended_on) values (p_past, own_c, 'Grace Liu', 'grace@example.invalid', 'past', today - 180);
    insert into public.client_profiles (id, coach_id, name, email) values (p_nina, maya_c, 'Nina Shah', 'nina@example.invalid');
    perform set_config('clarity.linking', 'on', true);
    update public.client_profiles set user_id = sam_u where id = p_sam;
    perform set_config('clarity.linking', '', true);

    -- 4. Stages.
    perform pg_temp.t_as(maya_u);
    f := f || pg_temp.t_eq('4a an associate can''t start the stages', pg_temp.t_n('select count(*) from public.coach_lead_stages_start()'), 'error 42501');
    perform pg_temp.t_as(own_u);
    f := f || pg_temp.t_eq('4b the owner gets the five to start', (select string_agg(name || ' ' || likelihood, ', ' order by position) from public.coach_lead_stages_start()),
      'New 10, Call booked 25, Proposal sent 50, Deciding 70, Won 100');
    f := f || pg_temp.t_eq('4c and only once', (select count(*)::text from public.coach_lead_stages_start()), '5');
    select id into st_new from public.coach_lead_stages where name = 'New';
    select id into st_call from public.coach_lead_stages where name = 'Call booked';
    select id into st_prop from public.coach_lead_stages where name = 'Proposal sent';
    select id into st_won from public.coach_lead_stages where is_won;
    r := '{}';
    r := r || pg_temp.t_rows(format('insert into public.coach_lead_stages (id, coach_id, name, likelihood, position) values (%L, %L, ''Verbal yes'', 85, 4)', st_extra, own_c));
    r := r || pg_temp.t_rows(format('update public.coach_lead_stages set name = ''Said yes'', position = 9 where id = %L', st_extra));
    r := r || (select string_agg(name, ',' order by position) from public.coach_lead_stages);
    f := f || pg_temp.t_eq('4d a stage is added, renamed and moved', array_to_string(r, '/'), '1/1/New,Call booked,Proposal sent,Deciding,Said yes,Won');
    r := '{}';
    r := r || pg_temp.t_rows(format('update public.coach_lead_stages set position = 1000000 where id = %L', st_extra));
    r := r || (select position::text from public.coach_lead_stages where id = st_extra);
    r := r || pg_temp.t_rows(format('update public.coach_lead_stages set position = 1, likelihood = 40 where id = %L', st_won));
    r := r || (select position || ' ' || likelihood from public.coach_lead_stages where id = st_won);
    r := r || pg_temp.t_rows(format('update public.coach_lead_stages set is_won = false where id = %L', st_won));
    r := r || pg_temp.t_rows(format('delete from public.coach_lead_stages where id = %L', st_won));
    r := r || pg_temp.t_rows(format('insert into public.coach_lead_stages (coach_id, name, is_won) values (%L, ''Won again'', true)', own_c));
    f := f || pg_temp.t_eq('4e nothing sits after Won, and Won stays 100% and last', array_to_string(r, '/'), '1/999999/1/1000000 100/error 23514/error 23514/error 23505');
    f := f || pg_temp.t_eq('4f a likelihood over 100, and a second stage of one name, are refused', concat_ws('/',
      pg_temp.t_rows(format('insert into public.coach_lead_stages (coach_id, name, likelihood) values (%L, ''Sure thing'', 101)', own_c)),
      pg_temp.t_rows(format('insert into public.coach_lead_stages (coach_id, name) values (%L, '' new '')', own_c))), 'error 23514/error 23505');
    r := '{}';
    r := r || pg_temp.t_rows(format('insert into public.coach_leads (id, coach_id, name, email, source, organisation, value) values (%L, %L, ''Amy Cole'', ''amy@example.invalid'', ''manual'', ''Northfield Logistics'', 13500)', l_amy, own_c));
    r := r || (select (stage_id = st_new)::text from public.coach_leads where id = l_amy);
    f := f || pg_temp.t_eq('4g a new lead takes the first stage by itself', array_to_string(r, '/'), '1/true');
    insert into public.coach_leads (id, coach_id, name, email, source, stage_id, phone, notes) values (l_ruth, own_c, 'Ruth Adeyemi', 'ruth@example.invalid', 'referral', st_call, '07700 900213', 'From the Chemistry Call page');
    insert into public.coach_leads (id, coach_id, name, source, stage_id, organisation) values (l_dup, own_c, 'Ruth A. Adeyemi', 'import', st_call, 'Harbour City FC');
    r := '{}';
    r := r || replace(pg_temp.t_rows(format('delete from public.coach_lead_stages where id = %L', st_call)), '23001', '23503');
    r := r || pg_temp.t_rows(format('update public.coach_leads set stage_id = %L where stage_id = %L', st_extra, st_call));
    r := r || pg_temp.t_rows(format('delete from public.coach_lead_stages where id = %L', st_call));
    f := f || pg_temp.t_eq('4h a stage with leads in it stays until they have moved on', array_to_string(r, '/'), 'error 23503/2/1');
    update public.coach_leads set stage_id = st_prop where id in (l_ruth, l_dup);
    f := f || pg_temp.t_eq('4i won and cold never together; a value below zero is refused', concat_ws('/',
      pg_temp.t_rows(format('update public.coach_leads set won_at = now(), cold_at = now() where id = %L', l_amy)),
      pg_temp.t_rows(format('update public.coach_leads set value = -1 where id = %L', l_amy)),
      pg_temp.t_rows(format('update public.coach_leads set cold_at = now(), cold_reason = ''Budget frozen until spring'', cold_check_on = %L where id = %L', today + 90, l_dup)),
      pg_temp.t_rows(format('update public.coach_leads set cold_at = null, cold_reason = null, cold_check_on = null where id = %L', l_dup))), 'error 23514/error 23514/1/1');
    perform pg_temp.t_as(maya_u);
    r := '{}';
    r := r || pg_temp.t_rows(format('insert into public.coach_leads (id, coach_id, name, source) values (%L, %L, ''Jo Mensah'', ''chemistry_page'')', l_maya, maya_c));
    r := r || (select coalesce(stage_id::text, 'none') from public.coach_leads where id = l_maya);
    r := r || pg_temp.t_rows(format('update public.coach_leads set stage_id = %L where id = %L', st_new, l_maya));
    f := f || pg_temp.t_eq('4j Maya''s own lead (a booking on her page) has no stage, and can''t take the owner''s', array_to_string(r, '/'), '1/none/error 23514');

    -- A booking writes its own lines (as booking_make does, signed out, with the booking flag on).
    perform pg_temp.t_admin();
    perform set_config('clarity.booking', 'on', true);
    insert into public.coach_leads (id, coach_id, name, email, source, call_type_key, booking_id) values (l_booked, own_c, 'Nadia Osei', 'nadia@example.invalid', 'chemistry_page', 'chemistry', gen_random_uuid());
    update public.coach_leads set booking_id = gen_random_uuid() where id = l_booked;
    perform set_config('clarity.booking', '', true);
    update public.coach_leads set booking_id = gen_random_uuid() where id = l_booked;
    perform pg_temp.t_as(own_u);
    f := f || pg_temp.t_eq('4k a booking writes First contact and Booked a call, a second booking one more line, a plain save none', concat_ws('/',
      (select string_agg(kind, ',' order by happened_at, kind) from public.coach_lead_events where lead_id = l_booked),
      (select (stage_id = st_new)::text from public.coach_leads where id = l_booked),
      (select (last_contact_on is not null)::text from public.coach_leads where id = l_booked)), 'first_contact,booking,booking/true/true');
    r := '{}';
    r := r || pg_temp.t_rows(format('insert into public.coach_lead_events (coach_id, lead_id, kind, happened_on, title, data) values (%L, %L, ''call'', %L, ''Chemistry Call, 30 minutes'', ''{"minutes":30}'')', own_c, l_amy, today - 9));
    r := r || (select last_contact_on::text from public.coach_leads where id = l_amy);
    r := r || pg_temp.t_rows(format('insert into public.coach_lead_events (coach_id, lead_id, kind, happened_on, title) values (%L, %L, ''note'', %L, ''A thought'')', own_c, l_amy, today));
    r := r || pg_temp.t_rows(format('insert into public.coach_lead_events (coach_id, lead_id, kind, happened_on, title) values (%L, %L, ''call'', %L, ''An earlier call'')', own_c, l_amy, today - 30));
    r := r || (select last_contact_on::text from public.coach_leads where id = l_amy);
    r := r || pg_temp.t_rows(format('insert into public.coach_lead_events (coach_id, lead_id, kind) values (%L, %L, ''sms'')', own_c, l_amy));
    f := f || pg_temp.t_eq('4l the timeline: a call moves last contact forward, a note doesn''t, an older call doesn''t move it back', array_to_string(r, '/'),
      '1/' || (today - 9)::text || '/1/1/' || (today - 9)::text || '/error 23514');
    f := f || pg_temp.t_eq('4m a line can''t be put on another coach''s lead', pg_temp.t_rows(format('insert into public.coach_lead_events (coach_id, lead_id, kind) values (%L, %L, ''note'')', own_c, l_maya)), 'error 42501');
    f := f || pg_temp.t_eq('4n the discovery notes and Referred by are kept on the lead', pg_temp.t_rows(format(
      'update public.coach_leads set want_outcome = ''A leadership team that owns its decisions.'', want_pain = ''Every decision still comes back to her.'', who_decides = ''Amy, with her CEO.'', who_funds = ''Northfield, from the L&D budget.'', referred_by = ''Hannah Wells'', next_step = ''Follow up on the proposal'', next_step_on = %L where id = %L', today, l_amy)), '1');

    -- 3. Each role.
    f := f || pg_temp.t_eq('3a the owner reads their stages, leads and timeline', concat_ws('/',
      (select count(*) from public.coach_lead_stages), (select count(*) from public.coach_leads), (select count(*) from public.coach_lead_events)), '5/4/6');
    insert into public.coach_automations (id, coach_id, trigger, trigger_stage_id, action, todo_title, todo_days) values (a_todo, own_c, 'lead_stage', st_prop, 'todo', 'Follow up on the proposal', 3);
    insert into public.coach_boards (id, coach_id, name, columns, shared) values
      (b_spk, own_c, 'Speaking', '[{"id":"date","name":"Date","kind":"date"},{"id":"fee","name":"Fee","kind":"money"},{"id":"aud","name":"Audience","kind":"text"}]', false),
      (b_priv, own_c, 'Partners', '[]', false);
    insert into public.coach_board_stages (id, board_id, coach_id, name, position) values (bs1, b_spk, own_c, 'Ideas', 0), (bs2, b_spk, own_c, 'Pitched', 1), (bs_priv, b_priv, own_c, 'Talking', 0);
    insert into public.coach_board_items (id, board_id, coach_id, stage_id, title, field_values) values (bi1, b_spk, own_c, bs2, 'CIPD Festival of Work', '{"date":"2027-06-10","fee":4500,"aud":"800 HR leaders"}');
    insert into public.coach_board_items (board_id, coach_id, stage_id, title) values (b_priv, own_c, bs_priv, 'Henley Business School');
    insert into public.network_people (id, coach_id, name, organisation, role, email, influence, trust, value_delivery, what_you_get, rhythm_months, last_spoke_on) values
      (n_dan, own_c, 'Dan Reid', 'Harbour Lane', 'Referrer', 'dan@example.invalid', 6, 9, 7, 8, 3, date '2026-08-17'),
      (n_sofia, own_c, 'Sofia Marsh', 'Citadel', 'Key contact', 'sofia@example.invalid', 7, 4, 5, 6, 3, date '2026-08-10');
    insert into public.network_columns (id, coach_id, name, kind, note) values (n_col, own_c, 'Sector', 'text', 'The sector they work in.');
    insert into public.organisation_deals (organisation_id, name, kind, status, value, per, renews_on) values (org, 'Leadership Accelerator for Sam', 'agreement', 'active', 13460, 'once', date '2027-03-08');
    insert into public.organisation_growth (organisation_id, kind, title, note) values (org, 'seats', '6 of 20 seats are free.', 'The leadership team could use them for their own sprints.');
    insert into public.client_check_ins (coach_id, profile_id, months, due_on) values (own_c, p_past, 6, today + 23);
    f := f || pg_temp.t_eq('3b the owner reads everything of theirs', (select concat_ws('/',
      (select count(*) from public.coach_automations), (select count(*) from public.coach_boards), (select count(*) from public.coach_board_stages),
      (select count(*) from public.coach_board_items), (select count(*) from public.network_people), (select count(*) from public.network_columns),
      (select count(*) from public.organisation_deals), (select count(*) from public.organisation_growth), (select count(*) from public.client_check_ins))), '1/2/3/2/2/1/1/1/1');

    perform pg_temp.t_as(maya_u);
    f := f || pg_temp.t_eq('3c an associate reads none of it', (select concat_ws('/',
      (select count(*) from public.coach_lead_stages), (select count(*) from public.coach_leads where coach_id <> maya_c), (select count(*) from public.coach_lead_events),
      (select count(*) from public.coach_automations), (select count(*) from public.coach_automation_runs), (select count(*) from public.coach_boards),
      (select count(*) from public.coach_board_stages), (select count(*) from public.coach_board_items), (select count(*) from public.coach_emails),
      (select count(*) from public.coach_email_waiting), (select count(*) from public.coach_email_addresses), (select count(*) from public.network_people),
      (select count(*) from public.network_ratings), (select count(*) from public.network_gives), (select count(*) from public.network_columns),
      (select count(*) from public.organisation_deals), (select count(*) from public.organisation_growth), (select count(*) from public.client_check_ins))),
      '0/0/0/0/0/0/0/0/0/0/0/0/0/0/0/0/0/0');
    f := f || pg_temp.t_eq('3d nor through the functions, nor by writing', concat_ws('/',
      pg_temp.t_n('select public.network_page()'), pg_temp.t_n('select public.network_map()'), pg_temp.t_n('select public.network_counts()'),
      pg_temp.t_n(format('select public.network_archive(array[%L]::uuid[])', n_dan)), pg_temp.t_n(format('select public.network_restore(array[%L]::uuid[])', n_dan)),
      pg_temp.t_n('select public.network_duplicates(''[{"name":"Dan Reid"}]'')'), pg_temp.t_n('select public.network_import(''[{"name":"Someone New"}]'')'),
      pg_temp.t_n(format('select public.network_merge(%L, %L)', n_dan, n_sofia)), pg_temp.t_n('select count(*) from public.coach_email_addresses_start()'),
      pg_temp.t_n('select public.coach_email_add(''{"subject":"x"}'')'), pg_temp.t_n(format('select public.lead_merge(%L, %L)', l_amy, l_ruth)),
      pg_temp.t_rows(format('insert into public.network_people (coach_id, name) values (%L, ''Mine now'')', maya_c)),
      pg_temp.t_rows(format('insert into public.network_people (coach_id, name) values (%L, ''Yours'')', own_c)),
      pg_temp.t_rows(format('insert into public.coach_lead_stages (coach_id, name) values (%L, ''Mine'')', maya_c)),
      pg_temp.t_rows(format('insert into public.coach_automations (coach_id, trigger, action, todo_title) values (%L, ''lead_won'', ''todo'', ''x'')', maya_c)),
      pg_temp.t_rows(format('insert into public.coach_boards (coach_id, name) values (%L, ''Mine'')', maya_c)),
      pg_temp.t_rows(format('update public.network_people set name = ''Changed'' where id = %L', n_dan)),
      pg_temp.t_rows(format('delete from public.coach_lead_stages where id = %L', st_extra)),
      pg_temp.t_rows(format('insert into public.organisation_deals (organisation_id, name) values (%L, ''Mine'')', org))),
      'error 42501/error 42501/error 42501/error 42501/error 42501/error 42501/error 42501/error 42501/error 42501/error 42501/error 42501/error 42501/error 42501/error 42501/error 42501/error 42501/0/0/error 42501');
    r := '{}';
    r := r || pg_temp.t_rows(format('insert into public.client_check_ins (coach_id, profile_id, months, due_on) values (%L, %L, 3, %L)', maya_c, p_nina, today + 90));
    r := r || pg_temp.t_rows(format('insert into public.client_check_ins (coach_id, profile_id, months, due_on) values (%L, %L, 3, %L)', maya_c, p_past, today + 90));
    r := r || pg_temp.t_rows(format('insert into public.client_check_ins (coach_id, profile_id, months, due_on) values (%L, %L, 12, %L)', own_c, p_past, today + 90));
    r := r || pg_temp.t_rows(format('insert into public.client_check_ins (coach_id, profile_id, months, due_on) values (%L, %L, 4, %L)', maya_c, p_nina, today + 120));
    r := r || (select count(*)::text from public.client_check_ins);
    f := f || pg_temp.t_eq('3e Maya keeps her own past client''s check-ins, and never another coach''s', array_to_string(r, '/'), '1/error 42501/error 42501/error 23514/1');

    -- A shared board (off by default).
    perform pg_temp.t_as(own_u);
    update public.coach_boards set shared = true where id = b_spk;
    perform pg_temp.t_as(maya_u);
    f := f || pg_temp.t_eq('3f once shared, an associate reads that board, its stages and its cards, and only that board', (select concat_ws('/',
      (select string_agg(name, ',') from public.coach_boards), (select count(*) from public.coach_board_stages), (select string_agg(title, ',') from public.coach_board_items))),
      'Speaking/2/CIPD Festival of Work');
    f := f || pg_temp.t_eq('3g and can''t change it', concat_ws('/',
      pg_temp.t_rows(format('update public.coach_boards set name = ''Mine'' where id = %L', b_spk)),
      pg_temp.t_rows(format('update public.coach_board_items set title = ''Mine'' where id = %L', bi1)),
      pg_temp.t_rows(format('insert into public.coach_board_items (board_id, coach_id, stage_id, title) values (%L, %L, %L, ''Mine'')', b_spk, maya_c, bs1)),
      pg_temp.t_rows(format('insert into public.coach_board_items (board_id, coach_id, stage_id, title) values (%L, %L, %L, ''Mine'')', b_spk, own_c, bs1)),
      pg_temp.t_rows(format('delete from public.coach_board_stages where id = %L', bs1))), '0/0/error 42501/error 42501/0');
    perform pg_temp.t_as(sam_u);
    f := f || pg_temp.t_eq('3h a client reads no table here, not even a shared board', concat_ws('/',
      pg_temp.t_n('select count(*) from public.coach_boards'), pg_temp.t_n('select count(*) from public.coach_board_items'), pg_temp.t_n('select count(*) from public.network_people'),
      pg_temp.t_n('select count(*) from public.coach_lead_stages'), pg_temp.t_n('select count(*) from public.coach_lead_events'), pg_temp.t_n('select count(*) from public.coach_emails'),
      pg_temp.t_n('select count(*) from public.client_check_ins'), pg_temp.t_n('select count(*) from public.organisation_deals'), pg_temp.t_n('select public.network_page()'),
      pg_temp.t_n('select public.network_counts()')), '0/0/0/0/0/0/0/0/error 42501/error 42501');
    perform pg_temp.t_anon();
    f := f || pg_temp.t_eq('3i someone signed out is refused every table and function', concat_ws('/',
      pg_temp.t_n('select count(*) from public.network_people'), pg_temp.t_n('select count(*) from public.coach_lead_stages'), pg_temp.t_n('select count(*) from public.coach_boards'),
      pg_temp.t_n('select count(*) from public.coach_emails'), pg_temp.t_n('select count(*) from public.coach_lead_events'), pg_temp.t_n('select count(*) from public.client_check_ins'),
      pg_temp.t_n('select public.network_page()'), pg_temp.t_n('select public.email_in(''log.tess.abcdefgh'', ''{}'')')),
      'error 42501/error 42501/error 42501/error 42501/error 42501/error 42501/error 42501/error 42501');
    perform pg_temp.t_as(own_u);
    f := f || pg_temp.t_eq('3j a card''s stage is one of its own board''s', pg_temp.t_rows(format('update public.coach_board_items set stage_id = %L where id = %L', bs_priv, bi1)), 'error 23514');

    -- 5. Merging two leads, and Undo.
    insert into public.coach_lead_events (coach_id, lead_id, kind, happened_on, title) values (own_c, l_dup, 'note', today - 2, 'Met at the conference');
    insert into public.coach_todos (id, coach_id, title, lead_id) values (gen_random_uuid(), own_c, 'Send Ruth the workshop dates', l_dup) returning id into todo1;
    r := '{}';
    r := r || pg_temp.t_n(format('select (public.lead_merge(%L, %L, ''{"organisation":true}'') is not null)::text', l_ruth, l_dup));
    r := r || (select concat_ws(' ', name, organisation, phone) from public.coach_leads where id = l_ruth);
    r := r || (select (merged_into = l_ruth)::text from public.coach_leads where id = l_dup);
    r := r || (select count(*)::text from public.coach_lead_events where lead_id = l_ruth);
    r := r || (select (lead_id = l_ruth)::text from public.coach_todos where id = todo1);
    f := f || pg_temp.t_eq('5a two leads merge into one: the timeline and to-dos join, the chosen values are kept', array_to_string(r, '/'),
      'true/Ruth Adeyemi Harbour City FC 07700 900213/true/1/true');
    f := f || pg_temp.t_eq('5b the same two can''t be merged again, nor one with itself', concat_ws('/',
      pg_temp.t_n(format('select public.lead_merge(%L, %L)', l_ruth, l_dup)), pg_temp.t_n(format('select public.lead_merge(%L, %L)', l_ruth, l_ruth)),
      pg_temp.t_n(format('select public.lead_merge(%L, %L)', l_ruth, l_maya))), 'error 22023/error 22023/error 42501');
    -- A page that still shows the lead merged away (another tab, another device) saves it whole: it stays merged.
    r := '{}';
    r := r || pg_temp.t_rows(format('update public.coach_leads set merged_into = null, job_title = ''Partner'' where id = %L', l_dup));
    r := r || (select coalesce((merged_into = l_ruth)::text, 'not merged') || ' ' || coalesce(job_title, 'no role') from public.coach_leads where id = l_dup);
    f := f || pg_temp.t_eq('5b2 a save that clears merged_into (a stale page) keeps the lead merged; only Undo lets it go', array_to_string(r, '/'), '1/true Partner');
    perform pg_temp.t_admin();
    select id into mg from public.coach_lead_merges where kept_id = l_ruth;
    perform pg_temp.t_as(maya_u);
    f := f || pg_temp.t_eq('5c another coach can''t undo it', pg_temp.t_n(format('select public.lead_unmerge(%L)', mg)), 'error 22023');
    perform pg_temp.t_as(own_u);
    r := '{}';
    r := r || ('undone' || pg_temp.t_n(format('select public.lead_unmerge(%L)', mg)));
    r := r || (select concat_ws(' ', name, coalesce(organisation, 'no organisation')) from public.coach_leads where id = l_ruth);
    r := r || (select coalesce(merged_into::text, 'not merged') from public.coach_leads where id = l_dup);
    r := r || (select count(*)::text from public.coach_lead_events where lead_id = l_dup);
    r := r || (select (lead_id = l_dup)::text from public.coach_todos where id = todo1);
    r := r || pg_temp.t_n(format('select public.lead_unmerge(%L)', mg));
    f := f || pg_temp.t_eq('5d Undo puts both back as they were, once', array_to_string(r, '/'), 'undone/Ruth Adeyemi no organisation/not merged/1/true/error 22023');

    -- 6. Automations: add a to-do or move a stage, and nothing else.
    f := f || pg_temp.t_eq('6a the only two actions', concat_ws('/',
      pg_temp.t_rows(format('insert into public.coach_automations (id, coach_id, trigger, trigger_count, action, to_stage_id) values (%L, %L, ''proposal_opened'', 3, ''stage'', %L)', a_stage, own_c, st_extra)),
      pg_temp.t_rows(format('insert into public.coach_automations (coach_id, trigger, action, todo_title) values (%L, ''lead_won'', ''email'', ''Send a welcome'')', own_c)),
      pg_temp.t_rows(format('insert into public.coach_automations (coach_id, trigger, action, todo_title) values (%L, ''lead_won'', ''tag'', ''VIP'')', own_c)),
      pg_temp.t_rows(format('insert into public.coach_automations (coach_id, trigger, action, todo_title) values (%L, ''lead_won'', ''keep_in_touch'', ''3'')', own_c)),
      pg_temp.t_rows(format('insert into public.coach_automations (coach_id, trigger, action) values (%L, ''lead_won'', ''todo'')', own_c)),
      pg_temp.t_rows(format('insert into public.coach_automations (coach_id, trigger, action, todo_title, to_stage_id) values (%L, ''lead_won'', ''todo'', ''x'', %L)', own_c, st_new)),
      pg_temp.t_rows(format('insert into public.coach_automations (coach_id, trigger, action) values (%L, ''lead_won'', ''stage'')', own_c)),
      pg_temp.t_rows(format('insert into public.coach_automations (coach_id, trigger, action, todo_title) values (%L, ''birthday'', ''todo'', ''x'')', own_c)),
      pg_temp.t_rows(format('insert into public.coach_automations (coach_id, trigger, action, todo_title, todo_days) values (%L, ''call_booked'', ''todo'', ''Read their booking answers'', -1)', own_c))),
      '1/error 23514/error 23514/error 23514/error 23514/error 23514/error 23514/error 23514/1');
    f := f || pg_temp.t_eq('6b a stage move can''t point at the stage that sets it off, and a stage trigger names its stage', concat_ws('/',
      pg_temp.t_rows(format('insert into public.coach_automations (coach_id, trigger, trigger_stage_id, action, to_stage_id) values (%L, ''lead_stage'', %L, ''stage'', %L)', own_c, st_prop, st_prop)),
      pg_temp.t_rows(format('insert into public.coach_automations (coach_id, trigger, action, todo_title) values (%L, ''lead_stage'', ''todo'', ''x'')', own_c))), 'error 23514/error 23514');
    r := '{}';
    r := r || pg_temp.t_rows(format('insert into public.coach_automation_runs (automation_id, coach_id, event_key, lead_id) values (%L, %L, %L, %L)', a_todo, own_c, 'stage:' || l_amy || ':' || st_prop || ':1', l_amy));
    r := r || pg_temp.t_rows(format('insert into public.coach_automation_runs (automation_id, coach_id, event_key, lead_id) values (%L, %L, %L, %L)', a_todo, own_c, 'stage:' || l_amy || ':' || st_prop || ':1', l_amy));
    r := r || pg_temp.t_rows(format('insert into public.coach_automation_runs (automation_id, coach_id, event_key, lead_id) values (%L, %L, %L, %L)', a_todo, own_c, 'stage:' || l_amy || ':' || st_prop || ':2', l_amy));
    r := r || pg_temp.t_rows(format('update public.coach_automation_runs set event_key = ''again'' where automation_id = %L', a_todo));
    r := r || (select count(*)::text from public.coach_automation_runs where ran_at >= date_trunc('month', now()));
    f := f || pg_temp.t_eq('6c one run for each automation and event: the second is refused, another event runs', array_to_string(r, '/'), '1/error 23505/1/error 42501/2');
    f := f || pg_temp.t_eq('6d a to-do an automation made says which', pg_temp.t_rows(format('insert into public.coach_todos (coach_id, title, lead_id, automation_id, due_on) values (%L, ''Follow up on the proposal'', %L, %L, %L)', own_c, l_amy, a_todo, today + 3)), '1');

    -- 7. Emails logged by themselves.
    r := '{}';
    r := r || (select count(*)::text from public.coach_email_addresses_start());
    r := r || (select count(*)::text from public.coach_email_addresses_start());
    r := r || (select string_agg(kind, ',' order by kind) from public.coach_email_addresses);
    r := r || (select bool_and(key ~ ('^' || kind || '\.tess\.[a-z0-9]{8}$'))::text from public.coach_email_addresses);
    f := f || pg_temp.t_eq('7a the owner''s two addresses are made once', array_to_string(r, '/'), '2/2/log,todo/true');
    select key into log_key from public.coach_email_addresses where kind = 'log';
    select key into todo_key from public.coach_email_addresses where kind = 'todo';
    f := f || pg_temp.t_eq('7b the owner can''t hand an email in as the server, nor write a key', concat_ws('/',
      pg_temp.t_n(format('select public.email_in(%L, ''{"subject":"x"}'')', log_key)),
      pg_temp.t_rows(format('insert into public.coach_email_addresses (coach_id, kind, key) values (%L, ''log'', ''log.mine.12345678'')', own_c)),
      pg_temp.t_rows('update public.coach_email_addresses set key = ''log.mine.12345678''')), 'error 42501/error 42501/error 42501');
    perform pg_temp.t_server();
    j := public.email_in(log_key, jsonb_build_object('external_id', 'msg-1', 'direction', 'out', 'from', jsonb_build_object('name', 'Tess Owner', 'email', own_email),
      'to', jsonb_build_array(jsonb_build_object('name', 'Amy Cole', 'email', 'Amy@Example.invalid'), jsonb_build_object('name', 'Sarah Kent', 'email', 'sarah@example.invalid')),
      'cc', jsonb_build_array(jsonb_build_object('email', log_key || '@in.example.invalid'), jsonb_build_object('name', 'Dan Reid', 'email', 'dan@example.invalid'), jsonb_build_object('name', 'Sam Okafor', 'email', 'sam@example.invalid'), jsonb_build_object('name', 'Someone Copied', 'email', 'copied@example.invalid')),
      'subject', 'Leadership Accelerator proposal', 'body', E'Hello Amy,\n\nThe proposal is attached.\n\nTess', 'sent_at', '2026-11-12T10:00:00Z', 'link', 'https://mail.example.invalid/msg-1'));
    e1 := (j ->> 'email_id')::uuid;
    f := f || pg_temp.t_eq('7c the copy-in address logs it: on the lead''s, the Network person''s and the client''s timelines; the person not in the portal waits', concat_ws('/',
      j ->> 'status', j ->> 'new', j ->> 'links', j ->> 'waiting'), 'logged/true/3/1');
    r := '{}';
    r := r || (public.email_in(log_key, '{"external_id":"msg-1","subject":"Again"}'::jsonb) ->> 'new');
    r := r || (select count(*)::text from public.coach_emails);
    f := f || pg_temp.t_eq('7d handed in again, it is kept once', array_to_string(r, '/'), 'false/1');
    f := f || pg_temp.t_eq('7e an unknown key, and something that isn''t an email', concat_ws('/',
      public.email_in('log.nobody.00000000', '{"subject":"x"}'::jsonb) ->> 'status', public.email_in(log_key, '[]'::jsonb) ->> 'status'), 'unknown/unreadable');
    j := public.email_in(todo_key, jsonb_build_object('external_id', 'fwd-1', 'from', jsonb_build_object('name', 'Elena Ruiz', 'email', 'elena@example.invalid'), 'subject', 'Fwd: Speaking at the spring summit', 'snippet', 'Would you speak in April?', 'sent_at', '2026-11-18T08:00:00Z'));
    r := '{}';
    r := r || (j ->> 'status');
    r := r || (j ->> 'new');
    r := r || (public.email_in(todo_key, '{"external_id":"fwd-1","subject":"Fwd: Speaking at the spring summit"}'::jsonb) ->> 'new');
    r := r || (select string_agg(concat_ws(' | ', title, from_email_sender, from_email_subject), ';') from public.coach_todos where coach_id = own_c and from_email_ref is not null);
    f := f || pg_temp.t_eq('7f the to-do address makes one to-do an email, saying where it came from', array_to_string(r, '/'),
      'todo/true/false/Speaking at the spring summit | Elena Ruiz | Fwd: Speaking at the spring summit');
    perform pg_temp.t_as(own_u);
    f := f || pg_temp.t_eq('7g the owner reads the email, its body, whose it is and who waits', concat_ws('/',
      (select concat_ws(' ', direction, subject, source, hidden::text) from public.coach_emails where id = e1),
      (select (char_length(snippet) between 10 and 300)::text from public.coach_emails where id = e1),
      (select count(*) from public.coach_email_bodies where email_id = e1),
      (select string_agg(person_kind, ',' order by person_kind) from public.coach_email_links where email_id = e1),
      (select string_agg(concat_ws(' ', name, email, status), ',') from public.coach_email_waiting),
      (select count(*) from public.coach_lead_events where lead_id = l_amy and kind = 'email' and data ->> 'email_id' = e1::text),
      (select last_contact_on::text from public.coach_leads where id = l_amy), (select last_contact_on::text from public.client_profiles where id = p_sam)),
      'out Leadership Accelerator proposal copy_in false/true/1/client,lead,network/Sarah Kent sarah@example.invalid waiting/1/2026-11-12/2026-11-12');
    r := '{}';
    r := r || pg_temp.t_rows('update public.coach_email_waiting set status = ''dismissed'', decided_at = now() where email = ''sarah@example.invalid''');
    r := r || (public.coach_email_add('{"external_id":"g-2","source":"gmail","direction":"in","from":{"name":"Sarah Kent","email":"sarah@example.invalid"},"to":[],"subject":"Re: hello"}'::jsonb) ->> 'waiting');
    r := r || (select count(*)::text from public.coach_email_waiting);
    r := r || (select count(*)::text from public.coach_emails where source = 'gmail');
    f := f || pg_temp.t_eq('7h Not now is remembered: the same address isn''t asked about again', array_to_string(r, '/'), '1/0/1/1');
    f := f || pg_temp.t_eq('7i Hide this thread is the owner''s to set', pg_temp.t_rows(format('update public.coach_emails set hidden = true where id = %L', e1)), '1');

    -- 8. The account map.
    f := f || pg_temp.t_eq('8a Who''s who takes buyer, HR and participant beside sponsor and invoices; nothing else', concat_ws('/',
      pg_temp.t_rows(format('insert into public.organisation_contacts (organisation_id, name, roles) values (%L, ''Jo Mensah'', ''{hr,buyer}''), (%L, ''Lee Hart'', ''{invoices}''), (%L, ''Owen Price'', ''{participant}'')', org, org, org)),
      pg_temp.t_rows(format('insert into public.organisation_contacts (organisation_id, name, roles) values (%L, ''Someone'', ''{boss}'')', org))), '3/error 23514');
    f := f || pg_temp.t_eq('8b a deal''s kind, status and value are checked', concat_ws('/',
      pg_temp.t_rows(format('insert into public.organisation_deals (organisation_id, name, kind, status, value, per, opens) values (%L, ''Team workshops'', ''proposal'', ''sent'', 5640, ''once'', 2)', org)),
      pg_temp.t_rows(format('insert into public.organisation_deals (organisation_id, name, status) values (%L, ''x'', ''maybe'')', org)),
      pg_temp.t_rows(format('insert into public.organisation_deals (organisation_id, name, per) values (%L, ''x'', ''week'')', org))), '1/error 23514/error 23514');
    -- A coach's connections also take Gmail, and stay the server's alone.
    perform pg_temp.t_admin();
    f := f || pg_temp.t_eq('8c a coach''s connections take Gmail beside Google Calendar and Zoom; nothing else', concat_ws('/',
      pg_temp.t_rows(format('insert into public.coach_connections (coach_id, service, status, account_label, secret) values (%L, ''gmail'', ''on'', ''alex@example.invalid'', ''not-a-real-token'')', own_c)),
      pg_temp.t_rows(format('insert into public.coach_connections (coach_id, service) values (%L, ''zoom'') on conflict do nothing', own_c)),
      pg_temp.t_rows(format('insert into public.coach_connections (coach_id, service) values (%L, ''outlook'')', own_c))), '1/1/error 23514');
    perform pg_temp.t_as(own_u);
    f := f || pg_temp.t_eq('8d the Gmail connection is the server''s alone: its coach reads no row, only its status, never the secret', concat_ws('/',
      pg_temp.t_rows('select 1 from public.coach_connections'),
      (select string_agg(concat_ws(' ', service, status, account_label), ', ' order by service) from public.coach_connections_mine() where service = 'gmail'),
      pg_temp.t_rows(format('insert into public.coach_connections (coach_id, service) values (%L, ''gmail'')', own_c))), 'error 42501/gmail on alex@example.invalid/error 42501');

    -- 9. Network.
    f := f || pg_temp.t_eq('9a Keep close: trust 7 or more and what you get 7 or more (checked first)', concat_ws(' ',
      pg_temp.t_focus(own_c, 0, 7, 0, 7), pg_temp.t_focus(own_c, 10, 7, 0, 7), pg_temp.t_focus(own_c, 10, 10, 10, 10), pg_temp.t_focus(own_c, 5, 6, 5, 7), pg_temp.t_focus(own_c, 5, 7, 5, 6)),
      'keep_close keep_close keep_close none none');
    f := f || pg_temp.t_eq('9b Invest: influence 7 or more, with trust or value delivery 6 or less (before Maintain)', concat_ws(' ',
      pg_temp.t_focus(own_c, 7, 6, 10, 5), pg_temp.t_focus(own_c, 7, 10, 6, 5), pg_temp.t_focus(own_c, 7, 6, 6, 5), pg_temp.t_focus(own_c, 6, 6, 6, 5), pg_temp.t_focus(own_c, 7, 7, 6, 6), pg_temp.t_focus(own_c, 10, 0, 0, 0)),
      'invest invest invest none invest invest');
    f := f || pg_temp.t_eq('9c Maintain: influence, trust and value delivery all 7 or more', concat_ws(' ',
      pg_temp.t_focus(own_c, 7, 7, 7, 6), pg_temp.t_focus(own_c, 7, 7, 7, 0), pg_temp.t_focus(own_c, 10, 10, 10, 6), pg_temp.t_focus(own_c, 7, 7, 7, 7)),
      'maintain maintain maintain keep_close');
    f := f || pg_temp.t_eq('9d Rebalance?: influence 4 or less and what you get 4 or less', concat_ws(' ',
      pg_temp.t_focus(own_c, 4, 10, 10, 4), pg_temp.t_focus(own_c, 0, 0, 0, 0), pg_temp.t_focus(own_c, 5, 5, 5, 4), pg_temp.t_focus(own_c, 4, 5, 5, 5), pg_temp.t_focus(own_c, 5, 5, 5, 5)),
      'rebalance rebalance none none none');
    f := f || pg_temp.t_eq('9e no list until all four are rated; a rating is 0 to 10', concat_ws(' ',
      pg_temp.t_focus(own_c, null, 9, 9, 9), pg_temp.t_focus(own_c, 9, 9, 9, null), pg_temp.t_focus(own_c, null, null, null, null),
      pg_temp.t_rows(format('insert into public.network_people (coach_id, name, trust) values (%L, ''x'', 11)', own_c)),
      pg_temp.t_rows(format('insert into public.network_people (coach_id, name, influence) values (%L, ''x'', -1)', own_c))), 'none none none error 23514 error 23514');
    f := f || pg_temp.t_eq('9f M11''s own people land on M11''s lists', (select string_agg(name || ' ' || coalesce(focus, 'none') || ' ' || due_on, ', ' order by name) from public.network_people),
      'Dan Reid keep_close 2026-11-17, Sofia Marsh invest 2026-11-10');
    r := '{}';
    r := r || pg_temp.t_rows(format('update public.network_people set snoozed_until = %L where id = %L', today + 14, n_sofia));
    r := r || (select due_on::text from public.network_people where id = n_sofia);
    r := r || pg_temp.t_rows(format('update public.network_people set snoozed_until = null, rhythm_months = null where id = %L', n_sofia));
    r := r || (select coalesce(due_on::text, 'none') from public.network_people where id = n_sofia);
    r := r || pg_temp.t_rows(format('update public.network_people set rhythm_months = 3, last_spoke_on = null, added_on = ''2026-01-31'' where id = %L', n_sofia));
    r := r || (select due_on::text from public.network_people where id = n_sofia);
    r := r || pg_temp.t_rows(format('update public.network_people set last_spoke_on = ''2026-08-10'', rhythm_months = 25 where id = %L', n_sofia));
    r := r || pg_temp.t_rows(format('update public.network_people set last_spoke_on = ''2026-08-10'' where id = %L', n_sofia));
    f := f || pg_temp.t_eq('9g a catch-up is due the rhythm after you last spoke; "Not now, in 2 weeks" moves it; no rhythm, no due day; never spoken counts from the day they were added', array_to_string(r, '/'),
      '1/' || (today + 14)::text || '/1/none/1/2026-04-30/error 23514/1');
    r := '{}';
    r := r || (select count(*)::text from public.network_ratings where person_id = n_dan);
    r := r || pg_temp.t_rows(format('update public.network_people set trust = 8 where id = %L', n_dan));
    r := r || pg_temp.t_rows(format('update public.network_people set trust = 10, role = ''Sponsor'' where id = %L', n_dan));
    r := r || (select count(*)::text from public.network_ratings where person_id = n_dan);
    r := r || (select value::text from public.network_ratings where person_id = n_dan and rating = 'trust');
    f := f || pg_temp.t_eq('9h a rating''s dated history: written when it is first set and when it changes, one value a rating and day', array_to_string(r, '/'), '4/1/1/4/10');
    perform pg_temp.t_admin();
    update public.network_ratings set rated_on = rated_on - 30 where person_id = n_dan and rating = 'trust';
    perform pg_temp.t_as(own_u);
    update public.network_people set trust = 9 where id = n_dan;
    f := f || pg_temp.t_eq('9i and a later day adds a line', (select string_agg(value::text, ',' order by rated_on) from public.network_ratings where person_id = n_dan and rating = 'trust'), '10,9');
    r := '{}';
    r := r || pg_temp.t_rows(format('insert into public.network_gives (id, person_id, coach_id, direction, kind, note, happened_on) values (%L, %L, %L, ''gave'', ''idea'', ''Suggested a different approach to his team.'', %L), (%L, %L, %L, ''gave'', ''introduction'', null, %L), (%L, %L, %L, ''asked'', ''referral'', null, %L)',
        g1, n_dan, own_c, today, g2, n_dan, own_c, today - 40, g3, n_dan, own_c, today - 10));
    r := r || (select given_count || ' ' || asked_count from public.network_people where id = n_dan);
    r := r || pg_temp.t_rows(format('insert into public.network_gives (person_id, coach_id, direction, kind) values (%L, %L, ''gave'', ''referral'')', n_dan, own_c));
    r := r || pg_temp.t_rows(format('insert into public.network_gives (person_id, coach_id, direction, kind) values (%L, %L, ''asked'', ''idea'')', n_dan, own_c));
    r := r || pg_temp.t_rows(format('update public.network_people set given_count = 99, asked_count = 99 where id = %L', n_dan));
    r := r || (select given_count || ' ' || asked_count from public.network_people where id = n_dan);
    r := r || pg_temp.t_rows(format('delete from public.network_gives where id = %L', g2));
    r := r || (select given_count || ' ' || asked_count from public.network_people where id = n_dan);
    f := f || pg_temp.t_eq('9j what you''ve given and asked: their kinds, and the counts the table sorts by', array_to_string(r, '/'), '3/2 1/error 23514/error 23514/1/2 1/1/1 1');
    f := f || pg_temp.t_eq('9k your own columns: a value is kept under the column''s id', concat_ws('/',
      pg_temp.t_rows(format('update public.network_people set own = jsonb_build_object(%L, ''Sport'') where id = %L', n_col::text, n_dan)),
      pg_temp.t_rows(format('insert into public.network_columns (coach_id, name) values (%L, '' sector '')', own_c))), '1/error 23505');

    -- A page at a time. 120 more people: 60 active with ratings, 50 unrated, 10 long quiet.
    perform pg_temp.t_admin();
    insert into public.network_people (coach_id, name, organisation, role, email, influence, trust, value_delivery, what_you_get, rhythm_months, last_spoke_on, added_on)
    select own_c, 'Person ' || lpad(i::text, 3, '0'), case when i % 3 = 0 then 'Kestrel Group' when i % 3 = 1 then 'Vale Health' else 'Ashby Rugby' end,
           case when i % 2 = 0 then 'Sponsor' else 'Client' end, 'person' || i || '@example.invalid',
           case when i <= 60 then i % 11 end, case when i <= 60 then (i * 3) % 11 end, case when i <= 60 then (i * 5) % 11 end, case when i <= 60 then (i * 7) % 11 end,
           case when i <= 110 then (array[1, 2, 3, 6, 12])[1 + i % 5] end,
           case when i <= 110 then today - (i * 3) else date '2025-03-07' end, date '2025-01-01'
    from generate_series(1, 120) i;
    insert into public.network_people (id, coach_id, name, organisation, last_spoke_on, added_on) values
      (n_old, own_c, 'Zara Nash', 'Orbital Health', date '2025-05-12', date '2025-01-01'), (n_old2, own_c, 'Bea Reeves', 'Harbour City FC', null, date '2025-03-07');
    insert into public.network_people (id, coach_id, name, organisation, email, phone, influence) values (n_dup, own_c, 'Daniel Reid', 'Harbour Lane Partners', 'dan.reid@example.invalid', '07700 900141', 5);
    perform pg_temp.t_as(own_u);
    j := public.network_page(p_today => today);
    f := f || pg_temp.t_eq('9l a page is 50 people, by name, with the count of everyone', concat_ws('/',
      j ->> 'total', j ->> 'all', jsonb_array_length(j -> 'rows'), j #>> '{rows,0,name}', j #>> '{rows,49,name}'), '125/125/50/Bea Reeves/Person 047');
    j := public.network_page(p_offset => 100, p_today => today);
    f := f || pg_temp.t_eq('9m Show 50 more carries on where it stopped, to the end', concat_ws('/',
      jsonb_array_length(public.network_page(p_offset => 50, p_today => today) -> 'rows'), public.network_page(p_offset => 50, p_today => today) #>> '{rows,0,name}',
      jsonb_array_length(j -> 'rows'), j #>> '{rows,24,name}'), '50/Person 048/25/Zara Nash');
    j := public.network_page(p_search => '  KESTREL ', p_today => today);
    f := f || pg_temp.t_eq('9n search by name or organisation, whatever its capitals, with the count', concat_ws('/',
      j ->> 'total', j ->> 'all', public.network_page(p_search => 'reid', p_today => today) ->> 'total', public.network_page(p_search => 'no such person', p_today => today) ->> 'total',
      public.network_page(p_search => '%', p_today => today) ->> 'total', public.network_page(p_search => 'person 00_', p_today => today) ->> 'total'), '40/125/2/0/0/0');
    f := f || pg_temp.t_eq('9o every heading sorts, both ways, blanks last', concat_ws('/',
      public.network_page(p_sort => 'influence', p_desc => true, p_limit => 1, p_today => today) #>> '{rows,0,influence}',
      public.network_page(p_sort => 'influence', p_limit => 1, p_today => today) #>> '{rows,0,influence}',
      public.network_page(p_sort => 'due', p_limit => 2, p_today => today) #>> '{rows,0,name}',
      public.network_page(p_sort => 'due', p_desc => true, p_limit => 2, p_today => today) #>> '{rows,0,due_on}' is not null,
      public.network_page(p_sort => 'given', p_desc => true, p_limit => 1, p_today => today) #>> '{rows,0,name}',
      public.network_page(p_sort => 'focus', p_limit => 1, p_today => today) #>> '{rows,0,focus}',
      public.network_page(p_sort => 'last_spoke', p_desc => true, p_limit => 1, p_today => today) #>> '{rows,0,name}',
      public.network_page(p_sort => 'own:' || n_col, p_limit => 1, p_today => today) #>> '{rows,0,name}',
      public.network_page(p_sort => 'no such heading; drop table', p_limit => 1, p_today => today) #>> '{rows,0,name}',
      public.network_page(p_sort => 'own:not-a-column', p_limit => 1, p_today => today) #>> '{rows,0,name}'),
      '10/0/Person 110/t/Dan Reid/keep_close/Person 001/Dan Reid/Bea Reeves/Bea Reeves');
    f := f || pg_temp.t_eq('9p Show only narrows it: a list, no list, a role, a rhythm, an organisation, and two at once', concat_ws('/',
      (select count(*) from public.network_people where focus = 'keep_close') = (public.network_page(p_only => '{"focus":["keep_close"]}', p_today => today) ->> 'total')::bigint,
      (select count(*) from public.network_people where focus is null) = (public.network_page(p_only => '{"focus":["none"]}', p_today => today) ->> 'total')::bigint,
      public.network_page(p_only => '{"role":["Referrer"]}', p_today => today) ->> 'total',
      public.network_page(p_only => '{"rhythm":[12]}', p_today => today) ->> 'total',
      public.network_page(p_only => '{"rhythm":[0]}', p_today => today) ->> 'total',
      public.network_page(p_only => '{"organisation":["Citadel"]}', p_today => today) ->> 'total',
      public.network_page(p_only => '{"organisation":["Kestrel Group"],"role":["Sponsor"]}', p_today => today) ->> 'total',
      public.network_page(p_only => '{"rhythm":["twelve; drop"]}', p_today => today) ->> 'total',
      public.network_page(p_only => '"not an object"', p_today => today) ->> 'total'), 't/t/0/22/13/1/20/0/125');
    f := f || pg_temp.t_eq('9q Actions: Due now, most overdue first; Coming up, soonest first', concat_ws('/',
      ((public.network_page(p_sort => 'due', p_only => '{"due":"now"}', p_today => today) ->> 'total')::bigint = (select count(*) from public.network_people where archived_at is null and due_on <= today))::text,
      public.network_page(p_sort => 'due', p_only => '{"due":"now"}', p_limit => 8, p_today => today) #>> '{rows,0,name}',
      ((public.network_page(p_sort => 'due', p_only => '{"due":"coming"}', p_limit => 4, p_today => today) #>> '{rows,0,due_on}')::date > today)::text,
      ((public.network_counts(today) ->> 'due')::bigint = (select count(*) from public.network_people where archived_at is null and due_on <= today))::text), 'true/Person 110/true/true');

    -- Ready to archive, archive with someone kept, restore.
    j := public.network_page(p_only => '{"ready":true}', p_today => today);
    f := f || pg_temp.t_eq('9r Ready to archive? is everyone with no contact for 18 months and on no focus list (never spoken: since they were added)', concat_ws('/',
      j ->> 'total', public.network_counts(today) ->> 'ready', pg_temp.t_names(j)),
      '12/12/Bea Reeves,Person 111,Person 112,Person 113,Person 114,Person 115,Person 116,Person 117,Person 118,Person 119,Person 120,Zara Nash');
    r := '{}';
    r := r || public.network_archive((select array_agg((x ->> 'id')::uuid) from jsonb_array_elements(j -> 'rows') x where (x ->> 'id')::uuid <> n_old), array[n_old])::text;
    j := public.network_counts(today);
    r := r || (j ->> 'active') || (j ->> 'archived') || (j ->> 'ready');
    r := r || (public.network_page(p_today => today) ->> 'total');
    r := r || (public.network_page(p_archived => true, p_today => today) ->> 'total');
    r := r || (public.network_page(p_archived => true, p_today => today) #>> '{rows,0,name}');
    r := r || (select keep::text from public.network_people where id = n_old);
    r := r || (public.network_map('everyone', 150, today) ->> 'total');
    f := f || pg_temp.t_eq('9s "Archive 11": the ticked are archived, the unticked one is kept and never suggested again', array_to_string(r, '/'), '11/114/11/0/114/11/Bea Reeves/true/114');
    r := '{}';
    r := r || public.network_restore(array[n_old2])::text;
    j := public.network_counts(today);
    r := r || (j ->> 'archived') || (j ->> 'ready');
    r := r || public.network_restore((select array_agg(id) from public.network_people where archived_at is not null), array[n_old])::text;
    j := public.network_counts(today);
    r := r || (j ->> 'archived') || (j ->> 'ready');
    r := r || public.network_restore(array[n_old2])::text;
    f := f || pg_temp.t_eq('9t Undo and Restore put them back with their history; the kept one stays kept unless the Undo names them', array_to_string(r, '/'), '1/10/1/10/0/12/0');
    r := '{}';
    r := r || pg_temp.t_rows(format('update public.network_people set archived_at = now() where id = %L', n_old2));
    r := r || (public.network_counts(today) ->> 'archived');
    r := r || pg_temp.t_rows(format('update public.network_people set archived_at = null where id = %L', n_old2));
    r := r || (public.network_counts(today) ->> 'archived');
    f := f || pg_temp.t_eq('9u a person is archived and restored from their own page too', array_to_string(r, '/'), '1/1/1/0');

    -- Merge with Undo.
    insert into public.network_gives (person_id, coach_id, direction, kind) values (n_dup, own_c, 'asked', 'advice');
    update public.coach_leads set referred_by_person = n_dup, network_person_id = n_dup where id = l_amy;
    r := '{}';
    r := r || pg_temp.t_n(format('select (public.network_merge(%L, %L, ''{"organisation":true}'') is not null)::text', n_dan, n_dup));
    r := r || (select concat_ws(' | ', name, organisation, email, phone, influence, given_count, asked_count) from public.network_people where id = n_dan);
    r := r || (select (merged_into = n_dan)::text from public.network_people where id = n_dup);
    r := r || (select (referred_by_person = n_dan and network_person_id = n_dan)::text from public.coach_leads where id = l_amy);
    r := r || (public.network_page(p_search => 'reid', p_today => today) ->> 'total');
    r := r || (public.network_counts(today) ->> 'active');
    f := f || pg_temp.t_eq('9v two people merge into one: gives, asks and what points at them join; chosen values are kept; blanks are filled', array_to_string(r, '/'),
      'true/Dan Reid | Harbour Lane Partners | dan@example.invalid | 07700 900141 | 6 | 1 | 2/true/true/1/124');
    r := '{}';
    r := r || pg_temp.t_rows(format('update public.network_people set merged_into = null, role = ''Network'' where id = %L', n_dup));
    r := r || (select coalesce((merged_into = n_dan)::text, 'not merged') || ' ' || coalesce(role, 'no role') from public.network_people where id = n_dup);
    f := f || pg_temp.t_eq('9v2 a save that clears merged_into (a stale page) keeps the person merged; only Undo lets them go', array_to_string(r, '/'), '1/true Network');
    perform pg_temp.t_admin();
    select id into mg from public.network_merges where kept_id = n_dan;
    perform pg_temp.t_as(own_u);
    r := '{}';
    r := r || pg_temp.t_n(format('select public.network_merge(%L, %L)', n_sofia, n_dup));
    r := r || ('undone' || pg_temp.t_n(format('select public.network_unmerge(%L)', mg)));
    r := r || (select concat_ws(' | ', name, organisation, email, coalesce(phone, 'no phone'), given_count, asked_count) from public.network_people where id = n_dan);
    r := r || (select concat_ws(' | ', name, coalesce(merged_into::text, 'not merged'), given_count, asked_count) from public.network_people where id = n_dup);
    r := r || (select (referred_by_person = n_dup and network_person_id = n_dup)::text from public.coach_leads where id = l_amy);
    r := r || pg_temp.t_n(format('select public.network_unmerge(%L)', mg));
    r := r || (public.network_counts(today) ->> 'active');
    f := f || pg_temp.t_eq('9w Undo puts both back exactly, once; a merged person can''t be merged again', array_to_string(r, '/'),
      'error 22023/undone/Dan Reid | Harbour Lane | dan@example.invalid | no phone | 1 | 1/Daniel Reid | not merged | 0 | 1/true/error 22023/125');
    f := f || pg_temp.t_eq('9x Move to Leads keeps them in Network: the lead points at the person, who stays', concat_ws('/',
      pg_temp.t_rows(format('update public.coach_leads set network_person_id = %L, source = ''network'' where id = %L', n_dan, l_amy)),
      pg_temp.t_n(format('select count(*) from public.network_people where id = %L and archived_at is null', n_dan)),
      pg_temp.t_rows(format('update public.coach_leads set network_person_id = %L where id = %L', gen_random_uuid(), l_amy))), '1/1/error 23514');

    -- Import, duplicates first.
    j := public.network_duplicates('[{"name":"Brand New","email":"brand.new@example.invalid"},{"name":"dan reid"},{"name":"Somebody Else","email":"SOFIA@example.invalid"},{"name":""}]');
    f := f || pg_temp.t_eq('9y possible duplicates show first: the same email, or the same name whatever its capitals', (select string_agg(concat_ws(' ', d ->> 'index', d ->> 'name', d ->> 'by'), ', ' order by (d ->> 'index')::integer) from jsonb_array_elements(j) d),
      '1 Dan Reid name, 2 Sofia Marsh email');
    r := '{}';
    r := r || (public.network_import('[{"name":" Brand New ","email":"Brand.New@Example.invalid","organisation":"Quillmark","role":"Referrer","trust":8,"rhythm_months":3,"last_spoke_on":"2026-10-01"},{"name":"Rated Fully","influence":9,"trust":9,"value_delivery":9,"what_you_get":2},{"name":"  "}]') ->> 'added');
    r := r || (select concat_ws(' ', name, email, coalesce(focus, 'none'), due_on) from public.network_people where name = 'Brand New');
    r := r || (select focus from public.network_people where name = 'Rated Fully');
    r := r || pg_temp.t_n('select public.network_import(''[{"name":"Too keen","trust":12}]'')');
    r := r || pg_temp.t_n('select public.network_import(''{"name":"Not a list"}'')');
    f := f || pg_temp.t_eq('9z then everyone is added in one go; a missing rating is left blank and that person is on no list; a row with no name is left out', array_to_string(r, '/'),
      '2/Brand New brand.new@example.invalid none 2027-01-01/maintain/error 23514/error 22023');

    -- The map: up to 150, focus lists first, then most recently spoken to.
    j := public.network_map('everyone', 20, today);
    f := f || pg_temp.t_eq('9A the map takes people with a spot: Keep close, Maintain and Invest first, then who you spoke to most recently', concat_ws('/',
      jsonb_array_length(j -> 'rows'), j ->> 'total', (j ->> 'placed')::bigint = (select count(*) from public.network_people where archived_at is null and merged_into is null and influence is not null and trust is not null),
      (select bool_and(x ->> 'focus' in ('keep_close', 'maintain', 'invest'))::text from jsonb_array_elements(j -> 'rows') x),
      (public.network_map('rebalance', 150, today) ->> 'placed')::bigint = (select count(*) from public.network_people where focus = 'rebalance'),
      (select bool_and(x ->> 'focus' is null)::text from jsonb_array_elements(public.network_map('none', 150, today) -> 'rows') x),
      jsonb_array_length(public.network_map('everyone', 100000, today) -> 'rows') <= 500), '20/127/t/true/t/true/t');

    -- 10. Built for thousands: 5,000 people.
    perform pg_temp.t_admin();
    insert into public.network_people (coach_id, name, organisation, role, email, influence, trust, value_delivery, what_you_get, rhythm_months, last_spoke_on)
    select own_c, (array['Amara', 'Ben', 'Chloe', 'Dev', 'Ella', 'Finn', 'Grace', 'Hugo', 'Isla', 'Jamal'])[1 + i % 10] || ' ' || (array['Abbott', 'Banks', 'Carver', 'Doyle', 'Egan', 'Ford', 'Gill', 'Hale', 'Irwin', 'Joyce', 'Kerr', 'Lyle', 'Moss'])[1 + i % 13] || ' ' || i,
           (array['Citadel', 'Kestrel Group', 'Quillmark', 'Vale Health', 'Ashby Rugby', 'Corran Energy', 'Marlow Analytics'])[1 + i % 7], (array['Key contact', 'Sponsor', 'Client', 'Past client', 'Network', 'Referrer'])[1 + i % 6],
           'bulk' || i || '@example.invalid', i % 11, (i / 11) % 11, (i / 121) % 11, (i * 7) % 11, (array[1, 2, 3, 6, 12])[1 + i % 5], today - (i % 700)
    from generate_series(1, 4873) i;
    perform pg_temp.t_as(own_u);
    f := f || pg_temp.t_eq('10a 5,000 people are there', public.network_counts(today) ->> 'active', '5000');
    t0 := clock_timestamp(); j := public.network_page(p_today => today); ms_page := extract(epoch from clock_timestamp() - t0) * 1000;
    f := f || pg_temp.t_eq('10b a page is still 50 of 5,000', concat_ws('/', jsonb_array_length(j -> 'rows'), j ->> 'total'), '50/5000');
    t0 := clock_timestamp(); j := public.network_page(p_search => 'kestrel', p_sort => 'due', p_offset => 200, p_today => today); ms_search := extract(epoch from clock_timestamp() - t0) * 1000;
    f := f || pg_temp.t_eq('10c a search, sorted by when they are due, 200 rows in', concat_ws('/', jsonb_array_length(j -> 'rows'), (j ->> 'total')::integer > 600), '50/t');
    t0 := clock_timestamp(); j := public.network_page(p_sort => 'trust', p_desc => true, p_only => '{"focus":["invest","maintain"],"role":["Sponsor","Client"]}', p_today => today); ms_sort := extract(epoch from clock_timestamp() - t0) * 1000;
    f := f || pg_temp.t_eq('10d Show only two lists and two roles, highest trust first', concat_ws('/', jsonb_array_length(j -> 'rows'), j #>> '{rows,0,trust}'), '50/10');
    t0 := clock_timestamp(); j := public.network_map('everyone', 150, today); ms_map := extract(epoch from clock_timestamp() - t0) * 1000;
    f := f || pg_temp.t_eq('10e the map is 150 of 5,000', concat_ws('/', jsonb_array_length(j -> 'rows'), j ->> 'total'), '150/5000');
    f := f || pg_temp.t_eq('10f each of the four answers in under 2 seconds on the slowest stand-in', (greatest(ms_page, ms_search, ms_sort, ms_map) < 2000)::text, 'true');
    raise notice '052 speed with 5,000 Network people: a page % ms, a search sorted by due % ms, Show only sorted % ms, the map % ms',
      round(ms_page), round(ms_search), round(ms_sort), round(ms_map);

    perform pg_temp.t_admin();
    raise exception 'undo the test rows' using errcode = 'P0052';
  exception when sqlstate 'P0052' then
    perform pg_temp.t_admin();
  end;

  f := f || pg_temp.t_eq('11 everything the test made is undone', (select concat_ws('/', (select count(*) from auth.users where email like 'p6a-test-%@example.invalid'),
    (select count(*) from public.network_people where name like 'Person %' or name = 'Dan Reid'), (select count(*) from public.coach_lead_stages where name = 'Said yes'),
    (select count(*) from public.organisations where name = 'Kestrel Group (test)'))), '0/0/0/0');

  if cardinality(f) > 0 then
    raise exception E'052 FAILED (%):\n%', cardinality(f), array_to_string(f, E'\n');
  end if;
  raise notice '052 CHECKS PASSED';
end
$t$;
