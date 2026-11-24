-- =============================================================================
-- 060_coach_first_screen_test.sql
-- Checks supabase/migrations/060_coach_first_screen.sql. RUN ORDER: 049 to
-- 059, then 060 (twice is fine), then this. Dry run only, on a local
-- stand-in or the test project.
--
-- WHAT IT CHECKS
--   A small practice of two coaches (Tess, the owner, and Maya, an
--   associate), each with clients, engagements (one ended), packs, time,
--   to-dos (open, done, planned today, later, for a client, in the
--   calendar's weeks), tags, fields and saved views, calendar items (in the
--   window, outside it, a series, a series' stand-in), their guests, busy
--   times, notifications read and not read, days and weeks, notes, an about,
--   a check-in, a poll with its option, person and vote, bookings in and out
--   of the window, open blocks and booking links. Then, as each coach with the
--   6-digit code, for every page (today, clients, a client's page, the
--   calendar):
--     every list coach_first_screen hands back is EXACTLY what a plain read
--     of that table gives the same coach with the page's filter, written out
--     again here (so the function never shows more or less than the portal's
--     own reads, and only what the table's own rules allow);
--     its sessions are exactly 057's coach_sessions_start for the same window
--     and clients;
--     a few rows named by hand are in or out (so a filter written the same
--     wrong way twice is caught too): Maya's to-do for today in, her later
--     and done ones out, her read notification out, her item outside the
--     window out and her series in, Tess's rows never in Maya's;
--     the owner's calendar has 058's associates' sessions, Maya's has none.
--
--   It ends with the notice 060 CHECKS PASSED, or stops with FAILED and a
--   list naming each check that failed. Everything it makes is undone.
-- =============================================================================
create or replace function pg_temp.f_as(p uuid, p_aal text) returns void language plpgsql as $f$
declare sid uuid := gen_random_uuid();
begin
  -- A made-up sign-in is written to auth.sessions where that table exists, as a real one is (055 refuses a session id
  -- that isn't there once a coach has a reset on record; the hosted test project has the table).
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
  if to_regclass('auth.sessions') is not null and p is not null then
    begin
      execute 'insert into auth.sessions (id, user_id, created_at, updated_at) values ($1, $2, $3, $3)' using sid, p, now();
    exception when others then
      raise notice '060: this database doesn''t let the test write auth.sessions (%)', sqlerrm;
    end;
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated', 'aal', p_aal,
    'amr', json_build_array(json_build_object('method', 'password', 'timestamp', floor(extract(epoch from now()))::bigint)),
    'iat', floor(extract(epoch from now()))::bigint, 'session_id', sid)::text, true);
  perform set_config('role', 'authenticated', true);
end $f$;
create or replace function pg_temp.f_admin() returns void language plpgsql as $f$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
end $f$;
create or replace function pg_temp.f_user(p_label text) returns uuid language plpgsql as $f$
declare u uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, aud, role, email_confirmed_at)
  values (u, 'p060-' || p_label || '-' || u || '@example.invalid', 'authenticated', 'authenticated', now());
  return u;
end $f$;

-- One list of the answer against the same table read plainly, as whoever is signed in now: equal as sets of rows.
create or replace function pg_temp.f_same(p_label text, p_got jsonb, p_want_sql text) returns text[] language plpgsql as $f$
declare
  got text;
  want text;
begin
  select coalesce(string_agg(x::text, E'\n' order by x::text), '') into got from jsonb_array_elements(coalesce(p_got, '[]'::jsonb)) x;
  execute format('select coalesce(string_agg(to_jsonb(t)::text, E''\n'' order by to_jsonb(t)::text), '''') from (%s) t', p_want_sql) into want;
  if got is distinct from want then
    return array[format('%s: %s rows handed back, %s wanted', p_label,
      (select count(*) from jsonb_array_elements(coalesce(p_got, '[]'::jsonb))),
      (select count(*) from regexp_split_to_table(nullif(want, ''), E'\n')))];
  end if;
  return '{}';
end $f$;

-- Every list of one page's answer, as p_user with the code, against the plain reads.
create or replace function pg_temp.f_page(p_label text, p_user uuid, p_coach uuid, p_page text, p_from timestamptz, p_to timestamptz,
                                          p_today date, p_since timestamptz, p_profiles uuid[] default '{}')
returns text[] language plpgsql as $f$
declare
  r jsonb;
  t jsonb;
  f text[] := '{}';
  me text := quote_literal(p_coach);
  fromq text := quote_literal(p_from);
  toq text := quote_literal(p_to);
  fromday text := quote_literal(((p_from - interval '1 day') at time zone 'UTC')::date);
  today_q text := quote_literal(p_today);
  today14 text := quote_literal(p_today - 14);
  today21 text := quote_literal(p_today - 21);
  today_to text := quote_literal(((p_to + interval '1 day') at time zone 'UTC')::date);
  profs text := quote_literal(coalesce(p_profiles, '{}')) || '::uuid[]';
  window_items text;
  todos_sql text;
  engs text;
  expected text[] := array['coach_settings', 'client_profiles', 'coach_groups', 'coach_group_members', 'coach_call_types', 'coach_tags',
    'coach_todo_lists', 'coach_todo_headings', 'coach_away', 'coach_google_calendars', 'coach_notifications', 'organisations',
    'coach_cal_items', 'coach_cal_guests', 'coach_busy_times', 'coach_todos', 'coach_tag_links'];
  key text;
begin
  perform pg_temp.f_as(p_user, 'aal2');
  r := public.coach_first_screen(p_page, p_from, p_to, p_today, p_since, p_profiles);
  t := r->'tables';
  window_items := format('select i.* from public.coach_cal_items i where i.coach_id = %s and (i.repeat_rule is not null or (i.starts_at < %s and i.ends_at > %s) or (i.occurrence_on >= %s and i.occurrence_on <= %s))',
    me, toq, fromq, fromday, today_to);
  todos_sql := format('select d.* from public.coach_todos d where d.coach_id = %s and ((d.done_at is null and d.planned_on <= %s)', me, today_q)
    || case p_page
         when 'client' then format(' or (d.profile_id = any(%s) and (d.done_at is null or d.done_at >= now() - interval ''60 days''))', profs)
         when 'calendar' then format(' or (d.planned_on >= %s and d.planned_on <= %s and (d.done_at is null or d.done_at >= now() - interval ''60 days''))', fromday, today_to)
         else '' end || ')';

  -- Every page.
  f := f || pg_temp.f_same(p_label || ' coach_settings', t->'coach_settings', format('select * from public.coach_settings where coach_id = %s', me));
  f := f || pg_temp.f_same(p_label || ' client_profiles', t->'client_profiles', format('select * from public.client_profiles where coach_id = %s or id = any(%s)', me, profs));
  f := f || pg_temp.f_same(p_label || ' coach_groups', t->'coach_groups', format('select * from public.coach_groups where coach_id = %s', me));
  f := f || pg_temp.f_same(p_label || ' coach_group_members', t->'coach_group_members', format('select m.* from public.coach_group_members m join public.coach_groups g on g.id = m.group_id where g.coach_id = %s', me));
  f := f || pg_temp.f_same(p_label || ' coach_call_types', t->'coach_call_types', format('select * from public.coach_call_types where coach_id = %s', me));
  f := f || pg_temp.f_same(p_label || ' coach_tags', t->'coach_tags', format('select * from public.coach_tags where coach_id = %s', me));
  f := f || pg_temp.f_same(p_label || ' coach_todo_lists', t->'coach_todo_lists', format('select * from public.coach_todo_lists where coach_id = %s', me));
  f := f || pg_temp.f_same(p_label || ' coach_todo_headings', t->'coach_todo_headings', format('select * from public.coach_todo_headings where coach_id = %s', me));
  f := f || pg_temp.f_same(p_label || ' coach_away', t->'coach_away', format('select * from public.coach_away where coach_id = %s', me));
  f := f || pg_temp.f_same(p_label || ' coach_google_calendars', t->'coach_google_calendars', format('select * from public.coach_google_calendars where coach_id = %s', me));
  f := f || pg_temp.f_same(p_label || ' coach_notifications', t->'coach_notifications', format('select * from public.coach_notifications where coach_id = %s and read_at is null', me));
  f := f || pg_temp.f_same(p_label || ' organisations', t->'organisations', 'select * from public.organisations');
  f := f || pg_temp.f_same(p_label || ' coach_cal_items', t->'coach_cal_items', window_items);
  f := f || pg_temp.f_same(p_label || ' coach_cal_guests', t->'coach_cal_guests', format('select g.* from public.coach_cal_guests g where g.item_id in (select w.id from (%s) w)', window_items));
  f := f || pg_temp.f_same(p_label || ' coach_busy_times', t->'coach_busy_times', format('select * from public.coach_busy_times where coach_id = %s and starts_at < %s and ends_at > %s', me, toq, fromq));
  f := f || pg_temp.f_same(p_label || ' coach_todos', t->'coach_todos', todos_sql);
  f := f || pg_temp.f_same(p_label || ' coach_tag_links', t->'coach_tag_links',
    format('select l.* from public.coach_tag_links l where (l.item_kind = ''todo'' and l.item_id in (select x.id from (%s) x))', todos_sql)
    || case p_page
         when 'clients' then format(' or (l.item_kind = ''client'' and l.item_id in (select p.id from public.client_profiles p where p.coach_id = %s))', me)
         when 'client' then format(' or (l.item_kind = ''client'' and l.item_id = any(%s))', profs)
         else '' end);

  -- The page's own.
  if p_page in ('today', 'clients') then
    engs := format('select * from public.engagements where coach_id = %s and status <> ''ended''', me);
    expected := expected || array['engagements', 'engagement_packs', 'time_entries'];
  elsif p_page = 'client' then
    engs := format('select * from public.engagements where profile_id = any(%s)', profs);
    expected := expected || array['engagements', 'engagement_packs', 'engagement_projects', 'time_entries'];
    f := f || pg_temp.f_same(p_label || ' engagement_projects', t->'engagement_projects', format('select p.* from public.engagement_projects p where p.engagement_id in (select e.id from (%s) e)', engs));
  end if;
  if engs is not null then
    f := f || pg_temp.f_same(p_label || ' engagements', t->'engagements', engs);
    f := f || pg_temp.f_same(p_label || ' engagement_packs', t->'engagement_packs', format('select p.* from public.engagement_packs p where p.engagement_id in (select e.id from (%s) e)', engs));
    f := f || pg_temp.f_same(p_label || ' time_entries', t->'time_entries', format('select x.* from public.time_entries x where x.engagement_id in (select e.id from (%s) e)', engs));
  end if;
  if p_page = 'today' then
    expected := expected || array['coach_days', 'coach_weeks'];
    f := f || pg_temp.f_same(p_label || ' coach_days', t->'coach_days', format('select * from public.coach_days where coach_id = %s and day >= %s', me, today14));
    f := f || pg_temp.f_same(p_label || ' coach_weeks', t->'coach_weeks', format('select * from public.coach_weeks where coach_id = %s and week_start >= %s', me, today21));
  elsif p_page = 'clients' then
    expected := expected || array['coach_field_values', 'coach_fields', 'coach_views'];
    f := f || pg_temp.f_same(p_label || ' coach_field_values', t->'coach_field_values', format('select v.* from public.coach_field_values v where v.item_id in (select p.id from public.client_profiles p where p.coach_id = %s)', me));
    f := f || pg_temp.f_same(p_label || ' coach_fields', t->'coach_fields', format('select * from public.coach_fields where coach_id = %s', me));
    f := f || pg_temp.f_same(p_label || ' coach_views', t->'coach_views', format('select * from public.coach_views where coach_id = %s', me));
  elsif p_page = 'client' then
    expected := expected || array['client_notes', 'client_files', 'client_about', 'client_view_requests', 'client_check_ins', 'coach_cover', 'coach_field_values', 'coach_fields'];
    foreach key in array array['client_notes', 'client_files', 'client_about', 'client_view_requests', 'client_check_ins', 'coach_cover'] loop
      f := f || pg_temp.f_same(p_label || ' ' || key, t->key, format('select * from public.%I where profile_id = any(%s)', key, profs));
    end loop;
    f := f || pg_temp.f_same(p_label || ' coach_field_values', t->'coach_field_values', format('select * from public.coach_field_values where item_id = any(%s)', profs));
    f := f || pg_temp.f_same(p_label || ' coach_fields', t->'coach_fields', format('select * from public.coach_fields where coach_id = %s', me));
  elsif p_page = 'calendar' then
    expected := expected || array['coach_open_blocks', 'coach_bookings', 'coach_booking_links', 'coach_polls', 'coach_poll_options', 'coach_poll_people', 'coach_poll_votes'];
    f := f || pg_temp.f_same(p_label || ' coach_open_blocks', t->'coach_open_blocks', format('select * from public.coach_open_blocks where coach_id = %s', me));
    f := f || pg_temp.f_same(p_label || ' coach_bookings', t->'coach_bookings', format('select * from public.coach_bookings where coach_id = %s and starts_at < %s and ends_at > %s', me, toq, fromq));
    f := f || pg_temp.f_same(p_label || ' coach_booking_links', t->'coach_booking_links', format('select * from public.coach_booking_links where coach_id = %s', me));
    f := f || pg_temp.f_same(p_label || ' coach_polls', t->'coach_polls', format('select * from public.coach_polls where coach_id = %s', me));
    f := f || pg_temp.f_same(p_label || ' coach_poll_options', t->'coach_poll_options', format('select o.* from public.coach_poll_options o join public.coach_polls p on p.id = o.poll_id where p.coach_id = %s', me));
    f := f || pg_temp.f_same(p_label || ' coach_poll_people', t->'coach_poll_people', format('select o.* from public.coach_poll_people o join public.coach_polls p on p.id = o.poll_id where p.coach_id = %s', me));
    f := f || pg_temp.f_same(p_label || ' coach_poll_votes', t->'coach_poll_votes', format('select v.* from public.coach_poll_votes v join public.coach_poll_options o on o.id = v.option_id join public.coach_polls p on p.id = o.poll_id where p.coach_id = %s', me));
  end if;
  -- Nothing more than the page's own lists.
  if exists (select 1 from jsonb_object_keys(t) k where not (k = any(expected))) then
    f := f || format('%s: lists handed back that the page doesn''t read first: %s', p_label,
      (select string_agg(k, ', ') from jsonb_object_keys(t) k where not (k = any(expected))));
  end if;
  if exists (select 1 from unnest(expected) k where not (t ? k)) then
    f := f || format('%s: lists missing: %s', p_label, (select string_agg(k, ', ') from unnest(expected) k where not (t ? k)));
  end if;
  -- 057's sessions, exactly.
  if r->'start' is distinct from public.coach_sessions_start(p_since, p_profiles) then
    f := f || format('%s: its sessions are not 057''s coach_sessions_start', p_label);
  end if;
  -- 058's associates' sessions, on the calendar only.
  if p_page = 'calendar' then
    if r->'associates' is distinct from coalesce((select jsonb_agg(to_jsonb(a) order by a.starts_at) from public.coach_associate_sessions(p_from, p_to) a), '[]'::jsonb) then
      f := f || format('%s: its associates'' sessions are not 058''s coach_associate_sessions', p_label);
    end if;
  elsif r->'associates' is distinct from 'null'::jsonb and r->'associates' is not null then
    f := f || format('%s: associates'' sessions handed back off the calendar', p_label);
  end if;
  perform pg_temp.f_admin();
  return f;
end $f$;

do $t$
declare
  f text[] := '{}';
  r jsonb;
  day0 date := (now() at time zone 'UTC')::date;
  noon timestamptz := date_trunc('day', now()) + interval '12 hours';
  w_from timestamptz := now() - interval '1 day';
  w_to timestamptz := now() + interval '8 days';
  since timestamptz := now() - interval '42 days';
  tess_u uuid; maya_u uuid; tess_c uuid; maya_c uuid;
  org uuid := gen_random_uuid();
  p_a uuid := gen_random_uuid(); p_b uuid := gen_random_uuid(); p_c uuid := gen_random_uuid(); p_d uuid := gen_random_uuid();
  e_a uuid := gen_random_uuid(); e_a_old uuid := gen_random_uuid(); e_c uuid := gen_random_uuid();
  t_today uuid := gen_random_uuid(); t_later uuid := gen_random_uuid(); t_done uuid := gen_random_uuid(); t_client uuid := gen_random_uuid();
  t_old uuid := gen_random_uuid(); t_cal uuid := gen_random_uuid(); t_tess uuid := gen_random_uuid();
  tag_m uuid := gen_random_uuid(); tag_t uuid := gen_random_uuid();
  i_in uuid := gen_random_uuid(); i_out uuid := gen_random_uuid(); i_series uuid := gen_random_uuid(); i_stand uuid := gen_random_uuid(); i_tess uuid := gen_random_uuid();
  fld uuid := gen_random_uuid(); poll uuid := gen_random_uuid(); opt uuid := gen_random_uuid(); person uuid := gen_random_uuid();
  gcal uuid := gen_random_uuid(); grp uuid := gen_random_uuid(); lst uuid := gen_random_uuid();
  s_m uuid := gen_random_uuid(); s_t uuid := gen_random_uuid();
  ids text;
begin
  begin
    perform pg_temp.f_admin();
    tess_u := pg_temp.f_user('tess'); maya_u := pg_temp.f_user('maya');
    insert into public.coaches (user_id, role, display_first_name) values (tess_u, 'owner', 'Tess') returning id into tess_c;
    insert into public.coaches (user_id, role, display_first_name) values (maya_u, 'coach', 'Maya') returning id into maya_c;
    insert into public.organisations (id, name) values (org, 'F060 Harbour');
    insert into public.coach_settings (coach_id) values (maya_c), (tess_c) on conflict do nothing;
    insert into public.client_profiles (id, coach_id, name, email, organisation_id) values
      (p_a, maya_c, 'Ava F060', 'ava.f060@example.invalid', org), (p_b, maya_c, 'Ben F060', 'ben.f060@example.invalid', null),
      (p_c, tess_c, 'Cal F060', 'cal.f060@example.invalid', null), (p_d, tess_c, 'Dee F060', 'dee.f060@example.invalid', null);
    insert into public.engagements (id, coach_id, profile_id, kind, sessions_total, sessions_held_base, status) values
      (e_a, maya_c, p_a, 'sessions', 10, 0, 'active'), (e_a_old, maya_c, p_a, 'sessions', 6, 0, 'ended'), (e_c, tess_c, p_c, 'sessions', 8, 0, 'active');
    insert into public.engagement_packs (engagement_id, sessions) values (e_a, 4), (e_a_old, 2), (e_c, 3);
    insert into public.engagement_projects (engagement_id, name) values (e_a, 'F060 project'), (e_a_old, 'F060 old project');
    insert into public.time_entries (engagement_id, coach_id, started_at, ended_at) values
      (e_a, maya_c, now() - interval '3 days', now() - interval '3 days' + interval '1 hour'),
      (e_a_old, maya_c, now() - interval '90 days', now() - interval '90 days' + interval '1 hour'),
      (e_c, tess_c, now() - interval '2 days', now() - interval '2 days' + interval '1 hour');
    insert into public.coach_groups (id, coach_id, name) values (grp, maya_c, 'F060 team');
    insert into public.coach_group_members (group_id, name, profile_id) values (grp, 'Ava F060', p_a);
    insert into public.coach_todo_lists (id, coach_id, name) values (lst, maya_c, 'F060 list');
    insert into public.coach_todo_headings (list_id, coach_id, name) values (lst, maya_c, 'F060 heading');
    insert into public.coach_todos (id, coach_id, title, planned_on, done_at, profile_id) values
      (t_today, maya_c, 'F060 today', day0 - 1, null, null),
      (t_later, maya_c, 'F060 later', day0 + 2, null, null),
      (t_done, maya_c, 'F060 done', day0, now() - interval '1 day', null),
      (t_client, maya_c, 'F060 for Ava', null, null, p_a),
      (t_old, maya_c, 'F060 old done for Ava', day0 - 120, now() - interval '100 days', p_a),
      (t_cal, maya_c, 'F060 in the calendar weeks', day0 + 20, null, null),
      (t_tess, tess_c, 'F060 Tess today', day0, null, null);
    insert into public.coach_tags (id, coach_id, name) values (tag_m, maya_c, 'F060 tag'), (tag_t, tess_c, 'F060 Tess tag');
    insert into public.coach_tag_links (tag_id, item_kind, item_id, coach_id) values
      (tag_m, 'todo', t_today, maya_c), (tag_m, 'todo', t_later, maya_c), (tag_m, 'client', p_a, maya_c), (tag_m, 'client', p_b, maya_c),
      (tag_t, 'client', p_c, tess_c), (tag_t, 'todo', t_tess, tess_c);
    insert into public.coach_cal_items (id, coach_id, title, starts_at, ends_at, time_zone, repeat_rule) values
      (i_in, maya_c, 'F060 in', noon + interval '1 day', noon + interval '1 day 1 hour', 'Europe/London', null),
      (i_out, maya_c, 'F060 out', noon + interval '30 days', noon + interval '30 days 1 hour', 'Europe/London', null),
      (i_series, maya_c, 'F060 series', noon - interval '60 days', noon - interval '60 days' + interval '1 hour', 'Europe/London', '{"every":"week","interval":1}'::jsonb),
      (i_tess, tess_c, 'F060 Tess', noon + interval '1 day', noon + interval '1 day 1 hour', 'Europe/London', null);
    insert into public.coach_cal_items (id, coach_id, title, starts_at, ends_at, time_zone, series_id, occurrence_on) values
      (i_stand, maya_c, 'F060 stand-in', noon + interval '2 days', noon + interval '2 days 1 hour', 'Europe/London', i_series, day0 + 2);
    insert into public.coach_cal_guests (item_id, coach_id, name) values
      (i_in, maya_c, 'F060 guest in'), (i_out, maya_c, 'F060 guest out'), (i_tess, tess_c, 'F060 Tess guest');
    insert into public.coach_google_calendars (id, coach_id, google_id, name, busy_on) values (gcal, maya_c, 'f060-family', 'Family', true);
    insert into public.coach_busy_times (coach_id, calendar_id, event_id, title, starts_at, ends_at) values
      (maya_c, gcal, 'f060-in', 'F060 busy in', noon + interval '3 days', noon + interval '3 days 1 hour'),
      (maya_c, gcal, 'f060-out', 'F060 busy out', noon + interval '40 days', noon + interval '40 days 1 hour');
    insert into public.coach_notifications (coach_id, kind, title, read_at) values
      (maya_c, 'other', 'F060 new', null), (maya_c, 'other', 'F060 read', now());
    insert into public.coach_away (coach_id, starts_on, ends_on) values (maya_c, day0 + 50, day0 + 52);
    insert into public.coach_days (coach_id, day) values (maya_c, day0 - 3), (maya_c, day0 - 30) on conflict do nothing;
    insert into public.coach_weeks (coach_id, week_start) values
      (maya_c, date_trunc('week', day0)::date), (maya_c, date_trunc('week', day0)::date - 70) on conflict do nothing;
    insert into public.coach_fields (id, coach_id, name, kind, applies_to) values (fld, maya_c, 'F060 field', 'text', 'client');
    insert into public.coach_field_values (field_id, item_id, coach_id, value_text) values (fld, p_a, maya_c, 'F060 value');
    insert into public.coach_views (coach_id, list, name) values (maya_c, 'clients', 'F060 view');
    insert into public.client_notes (profile_id, coach_id, body) values (p_a, maya_c, 'F060 note'), (p_b, maya_c, 'F060 Ben note');
    insert into public.client_about (profile_id, coach_id, birthday_month, birthday_day) values (p_a, maya_c, 3, 4);
    insert into public.client_check_ins (coach_id, profile_id, months, due_on) values (maya_c, p_a, 3, day0 + 10);
    insert into public.coach_polls (id, coach_id, title, time_zone) values (poll, maya_c, 'F060 poll', 'Europe/London');
    insert into public.coach_poll_options (id, poll_id, coach_id, starts_at, ends_at) values (opt, poll, maya_c, noon + interval '4 days', noon + interval '4 days 1 hour');
    insert into public.coach_poll_people (id, poll_id, coach_id, name) values (person, poll, maya_c, 'F060 voter');
    insert into public.coach_poll_votes (option_id, person_id, can) values (opt, person, true);
    insert into public.coach_bookings (coach_id, name, time_zone, starts_at, ends_at) values
      (maya_c, 'F060 booked in', 'Europe/London', noon + interval '1 day', noon + interval '1 day 1 hour'),
      (maya_c, 'F060 booked out', 'Europe/London', noon + interval '60 days', noon + interval '60 days 1 hour');
    insert into public.coach_open_blocks (coach_id, starts_at, ends_at, time_zone) values (maya_c, noon + interval '5 days', noon + interval '5 days 2 hours', 'Europe/London');
    insert into public.coach_booking_links (coach_id, purpose) values (maya_c, 'book');
    insert into public.coach_sessions (id, coach_id, profile_id, engagement_id, starts_at, minutes, kind) values
      (s_m, maya_c, p_a, e_a, noon + interval '1 day', 60, 'coaching'), (s_t, tess_c, p_c, e_c, noon + interval '1 day', 60, 'coaching');

    -- Every page, as each coach with the code, against the plain reads.
    f := f || pg_temp.f_page('1 Maya today', maya_u, maya_c, 'today', w_from, w_to, day0, since);
    f := f || pg_temp.f_page('2 Maya clients', maya_u, maya_c, 'clients', w_from, w_to, day0, since);
    f := f || pg_temp.f_page('3 Maya, Ava''s page', maya_u, maya_c, 'client', w_from, w_to, day0, since, array[p_a]);
    f := f || pg_temp.f_page('4 Maya calendar', maya_u, maya_c, 'calendar', now() - interval '3 days', now() + interval '25 days', day0, since);
    f := f || pg_temp.f_page('5 Tess today', tess_u, tess_c, 'today', w_from, w_to, day0, since);
    f := f || pg_temp.f_page('6 Tess clients', tess_u, tess_c, 'clients', w_from, w_to, day0, since);
    f := f || pg_temp.f_page('7 Tess, Cal''s page', tess_u, tess_c, 'client', w_from, w_to, day0, since, array[p_c]);
    f := f || pg_temp.f_page('8 Tess calendar', tess_u, tess_c, 'calendar', w_from, w_to, day0, since);

    -- A few rows by hand, so a filter written the same wrong way twice is caught too.
    perform pg_temp.f_as(maya_u, 'aal2');
    r := public.coach_first_screen('today', w_from, w_to, day0, since, '{}');
    perform pg_temp.f_admin();
    select string_agg(x->>'title', ',' order by x->>'title') into ids from jsonb_array_elements(r->'tables'->'coach_todos') x;
    if ids is distinct from 'F060 today' then f := f || ('9 Maya''s Today to-dos are only the one for today: ' || coalesce(ids, 'none')); end if;
    select string_agg(x->>'title', ',' order by x->>'title') into ids from jsonb_array_elements(r->'tables'->'coach_notifications') x;
    if ids is distinct from 'F060 new' then f := f || ('10 Maya''s notifications are only the one not read: ' || coalesce(ids, 'none')); end if;
    select string_agg(x->>'title', ',' order by x->>'title') into ids from jsonb_array_elements(r->'tables'->'coach_cal_items') x;
    if ids is distinct from 'F060 in,F060 series,F060 stand-in' then f := f || ('11 Maya''s window holds the item in it, the series and its stand-in, never the one outside it: ' || coalesce(ids, 'none')); end if;
    select string_agg(x->>'name', ',' order by x->>'name') into ids from jsonb_array_elements(r->'tables'->'coach_cal_guests') x;
    if ids is distinct from 'F060 guest in' then f := f || ('12 Maya''s guests are only the window''s: ' || coalesce(ids, 'none')); end if;
    select string_agg(x->>'name', ',' order by x->>'name') into ids from jsonb_array_elements(r->'tables'->'client_profiles') x;
    if ids is distinct from 'Ava F060,Ben F060' then f := f || ('13 Maya''s clients are her own: ' || coalesce(ids, 'none')); end if;
    if exists (select 1 from jsonb_array_elements(r->'tables'->'engagements') x where x->>'id' = e_a_old::text) then f := f || '14 an ended engagement on Today''s first screen'::text; end if;
    if r::text ~ 'F060 Tess' or r::text ~ 'Cal F060' then f := f || '15 something of Tess''s in Maya''s first screen'::text; end if;
    perform pg_temp.f_as(maya_u, 'aal2');
    r := public.coach_first_screen('client', w_from, w_to, day0, since, array[p_a]);
    perform pg_temp.f_admin();
    select string_agg(x->>'title', ',' order by x->>'title') into ids from jsonb_array_elements(r->'tables'->'coach_todos') x;
    if ids is distinct from 'F060 for Ava,F060 today' then f := f || ('16 Ava''s page has her open to-do and today''s, never one done 100 days ago: ' || coalesce(ids, 'none')); end if;
    select string_agg(x->>'body', ',' order by x->>'body') into ids from jsonb_array_elements(r->'tables'->'client_notes') x;
    if ids is distinct from 'F060 note' then f := f || ('17 Ava''s page has only her notes: ' || coalesce(ids, 'none')); end if;
    perform pg_temp.f_as(maya_u, 'aal2');
    r := public.coach_first_screen('calendar', now() - interval '3 days', now() + interval '25 days', day0, since, '{}');
    perform pg_temp.f_admin();
    select string_agg(x->>'title', ',' order by x->>'title') into ids from jsonb_array_elements(r->'tables'->'coach_todos') x;
    if ids is distinct from 'F060 done,F060 in the calendar weeks,F060 later,F060 today' then f := f || ('18 the calendar has today''s to-dos and the ones in its weeks, done ones too (done yesterday): ' || coalesce(ids, 'none')); end if;
    if jsonb_array_length(r->'associates') <> 0 then f := f || '19 an associate''s calendar has associates'' sessions'::text; end if;
    perform pg_temp.f_as(tess_u, 'aal2');
    r := public.coach_first_screen('calendar', w_from, w_to, day0, since, '{}');
    perform pg_temp.f_admin();
    if not exists (select 1 from jsonb_array_elements(r->'associates') x where x->>'id' = s_m::text) then f := f || '20 the owner''s calendar has Maya''s session among the associates'' sessions'::text; end if;

    perform pg_temp.f_admin();
    raise exception 'undo the test rows' using errcode = 'P0060';
  exception when sqlstate 'P0060' then
    perform pg_temp.f_admin();
  end;

  f := f || (select case when count(*) = 0 then '{}'::text[] else array['21 everything the test made is undone'] end
             from auth.users where email like 'p060-%@example.invalid');
  if cardinality(f) > 0 then
    raise exception E'060 FAILED (%):\n%', cardinality(f), array_to_string(f, E'\n');
  end if;
  raise notice '060 CHECKS PASSED';
end
$t$;
