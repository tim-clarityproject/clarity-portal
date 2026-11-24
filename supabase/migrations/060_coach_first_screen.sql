-- =============================================================================
-- 060_coach_first_screen.sql
-- Coach first screen run (24 Nov 2026): a coach portal page's first screen in
-- one read, so a coach's first visit on a new phone draws Today, Clients, a
-- client's page or the calendar before the rest of their data arrives.
--
-- WHAT THIS DOES (plain English)
--   On a device with nothing of the coach's on it yet, the coach portal asked
--   for about 80 lists, every one in full, before it drew anything: about 3 to
--   4 seconds on a slowed phone at Tim's size. One new function,
--   coach_first_screen(p_page, p_from, p_to, p_today, p_since, p_profiles),
--   hands back in one answer only the coach's own rows that one page's first
--   screen shows:
--     every page  the coach's settings, clients, groups (and their members),
--                 call types, tags, to-do lists and headings, away days,
--                 Google calendars, the notifications not read yet, the
--                 organisations, the calendar between p_from and p_to (every
--                 series and its stand-ins too, with their guests) and the
--                 busy times in it, and 057's coach_sessions_start answer;
--     every page  also the to-dos planned up to today and not done (the
--                 menu counts them), with their tags;
--     'today'     the active engagements (their packs and time), and the
--                 last few days' and weeks' plans and reviews;
--     'clients'   the active engagements (packs and time), the clients' tags
--                 and fields, and the coach's saved views and fields;
--     'client'    everything of the clients named in p_profiles: their
--                 engagements (packs, projects, time), to-dos, notes, files,
--                 about, tags, fields, view requests, check-ins and cover;
--     'calendar'  the to-dos placed between p_from and p_to, the open blocks,
--                 bookings and polls (with their options, people and votes),
--                 the booking links, and for the owner 058's
--                 coach_associate_sessions between p_from and p_to (it gives
--                 anyone else nothing).
--   Everything else follows straight after the page has drawn, read exactly
--   as before; the device then holds what it always did. Nothing is ever
--   worked out here: these are plain reads, the same rows the portal's own
--   reads return.
--
-- WHO SEES WHAT (unchanged)
--   It is SECURITY INVOKER: every row is read under its table's own rules,
--   054's restrictive "Coach data: needs the 6-digit code" rule included, so
--   it can never show more than those reads already do. It also stops at
--   once, with 42501, for anyone who isn't an active coach with the code given
--   (my_coach_id() is empty then: a client, a coach at aal1, a sign-in from
--   before a reset, a coach no longer active). Closed to anyone signed out (no
--   execute for anon or PUBLIC). No table, column, rule or data changes.
--
-- Additive and safe to run twice. Needs 049 to 059 (stops without them).
-- Tests: supabase/060_coach_first_screen_test.sql (each page's rows are
-- exactly what the portal's own reads give) and
-- supabase/060_coach_first_screen_breakit_test.sql.
-- =============================================================================

do $$
begin
  if to_regprocedure('public.coach_sessions_start(timestamptz,uuid[])') is null
     or to_regprocedure('public.coach_associate_sessions(timestamptz,timestamptz)') is null
     or to_regprocedure('public.coach_code_ok()') is null
     or to_regprocedure('public.my_coach_id()') is null
     or to_regclass('public.coach_busy_times') is null
     or to_regclass('public.coach_google_calendars') is null then
    raise exception '060 needs 049 to 059 first.';
  end if;
end
$$;

create or replace function public.coach_first_screen(
  p_page text,
  p_from timestamptz,
  p_to timestamptz,
  p_today date,
  p_since timestamptz,
  p_profiles uuid[] default '{}'
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_coach uuid := public.my_coach_id();
  v_page text := coalesce(p_page, '');
  v_profiles uuid[] := coalesce(p_profiles, '{}');
  -- The calendar's window as the portal reads it (store.js calWindow): items that overlap it, every series, and the
  -- stand-ins dated from the day before it to the day after it, in UTC.
  v_from timestamptz := coalesce(p_from, now());
  v_to timestamptz := coalesce(p_to, now());
  v_from_day date := ((coalesce(p_from, now()) - interval '1 day') at time zone 'UTC')::date;
  v_to_day date := ((coalesce(p_to, now()) + interval '1 day') at time zone 'UTC')::date;
  v_today date := coalesce(p_today, (now() at time zone 'UTC')::date);
  v_tables jsonb := '{}'::jsonb;
  v_rows jsonb;
begin
  -- An active coach with the code given, and nobody else (054's rule; my_coach_id() is empty without it).
  if v_coach is null then
    raise exception 'Give your 6-digit code to carry on.' using errcode = '42501';
  end if;
  if v_page not in ('today', 'clients', 'client', 'calendar') then
    raise exception 'coach_first_screen: no such page.' using errcode = '22023';
  end if;
  -- Ranges a page could never ask for are refused rather than read whole.
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > interval '400 days' or cardinality(v_profiles) > 50 then
    raise exception 'coach_first_screen: that range can''t be read in one go.' using errcode = '22023';
  end if;

  -- ---------------------------------------------------------------- every page
  v_tables := v_tables || jsonb_build_object(
    'coach_settings', coalesce((select jsonb_agg(to_jsonb(t)) from public.coach_settings t where t.coach_id = v_coach), '[]'::jsonb),
    'client_profiles', coalesce((select jsonb_agg(to_jsonb(t)) from public.client_profiles t where t.coach_id = v_coach or t.id = any(v_profiles)), '[]'::jsonb),
    'coach_groups', coalesce((select jsonb_agg(to_jsonb(t)) from public.coach_groups t where t.coach_id = v_coach), '[]'::jsonb),
    'coach_group_members', coalesce((select jsonb_agg(to_jsonb(m)) from public.coach_group_members m
                                     where m.group_id in (select g.id from public.coach_groups g where g.coach_id = v_coach)), '[]'::jsonb),
    'coach_call_types', coalesce((select jsonb_agg(to_jsonb(t)) from public.coach_call_types t where t.coach_id = v_coach), '[]'::jsonb),
    'coach_tags', coalesce((select jsonb_agg(to_jsonb(t)) from public.coach_tags t where t.coach_id = v_coach), '[]'::jsonb),
    'coach_todo_lists', coalesce((select jsonb_agg(to_jsonb(t)) from public.coach_todo_lists t where t.coach_id = v_coach), '[]'::jsonb),
    'coach_todo_headings', coalesce((select jsonb_agg(to_jsonb(t)) from public.coach_todo_headings t where t.coach_id = v_coach), '[]'::jsonb),
    'coach_away', coalesce((select jsonb_agg(to_jsonb(t)) from public.coach_away t where t.coach_id = v_coach), '[]'::jsonb),
    'coach_google_calendars', coalesce((select jsonb_agg(to_jsonb(t)) from public.coach_google_calendars t where t.coach_id = v_coach), '[]'::jsonb),
    'coach_notifications', coalesce((select jsonb_agg(to_jsonb(t)) from public.coach_notifications t where t.coach_id = v_coach and t.read_at is null), '[]'::jsonb),
    'organisations', coalesce((select jsonb_agg(to_jsonb(t)) from public.organisations t), '[]'::jsonb)
  );
  -- The calendar's window, with its guests and the busy times in it.
  with items as (
    select t.* from public.coach_cal_items t
    where t.coach_id = v_coach
      and (t.repeat_rule is not null
           or (t.starts_at < v_to and t.ends_at > v_from)
           or (t.occurrence_on >= v_from_day and t.occurrence_on <= v_to_day))
  )
  select jsonb_build_object(
    'coach_cal_items', coalesce((select jsonb_agg(to_jsonb(i)) from items i), '[]'::jsonb),
    'coach_cal_guests', coalesce((select jsonb_agg(to_jsonb(g)) from public.coach_cal_guests g where g.item_id in (select id from items)), '[]'::jsonb)
  ) into v_rows;
  v_tables := v_tables || v_rows || jsonb_build_object(
    'coach_busy_times', coalesce((select jsonb_agg(to_jsonb(t)) from public.coach_busy_times t
                                  where t.coach_id = v_coach and t.starts_at < v_to and t.ends_at > v_from), '[]'::jsonb)
  );

  -- ---------------------------------------------------------------- Today and Clients: the active engagements
  if v_page in ('today', 'clients') then
    with e as (select t.* from public.engagements t where t.coach_id = v_coach and t.status <> 'ended')
    select jsonb_build_object(
      'engagements', coalesce((select jsonb_agg(to_jsonb(x)) from e x), '[]'::jsonb),
      'engagement_packs', coalesce((select jsonb_agg(to_jsonb(p)) from public.engagement_packs p where p.engagement_id in (select id from e)), '[]'::jsonb),
      'time_entries', coalesce((select jsonb_agg(to_jsonb(t)) from public.time_entries t where t.engagement_id in (select id from e)), '[]'::jsonb)
    ) into v_rows;
    v_tables := v_tables || v_rows;
  end if;

  -- ---------------------------------------------------------------- Today
  if v_page = 'today' then
    v_tables := v_tables || jsonb_build_object(
      'coach_days', coalesce((select jsonb_agg(to_jsonb(t)) from public.coach_days t where t.coach_id = v_coach and t.day >= v_today - 14), '[]'::jsonb),
      'coach_weeks', coalesce((select jsonb_agg(to_jsonb(t)) from public.coach_weeks t where t.coach_id = v_coach and t.week_start >= v_today - 21), '[]'::jsonb)
    );
  end if;

  -- ---------------------------------------------------------------- Clients
  if v_page = 'clients' then
    v_tables := v_tables || jsonb_build_object(
      'coach_field_values', coalesce((select jsonb_agg(to_jsonb(v)) from public.coach_field_values v
                                      where v.item_id in (select p.id from public.client_profiles p where p.coach_id = v_coach)), '[]'::jsonb),
      'coach_fields', coalesce((select jsonb_agg(to_jsonb(t)) from public.coach_fields t where t.coach_id = v_coach), '[]'::jsonb),
      'coach_views', coalesce((select jsonb_agg(to_jsonb(t)) from public.coach_views t where t.coach_id = v_coach), '[]'::jsonb)
    );
  end if;

  -- ---------------------------------------------------------------- a client's page
  if v_page = 'client' then
    with e as (select t.* from public.engagements t where t.profile_id = any(v_profiles))
    select jsonb_build_object(
      'engagements', coalesce((select jsonb_agg(to_jsonb(x)) from e x), '[]'::jsonb),
      'engagement_packs', coalesce((select jsonb_agg(to_jsonb(p)) from public.engagement_packs p where p.engagement_id in (select id from e)), '[]'::jsonb),
      'engagement_projects', coalesce((select jsonb_agg(to_jsonb(p)) from public.engagement_projects p where p.engagement_id in (select id from e)), '[]'::jsonb),
      'time_entries', coalesce((select jsonb_agg(to_jsonb(t)) from public.time_entries t where t.engagement_id in (select id from e)), '[]'::jsonb)
    ) into v_rows;
    v_tables := v_tables || v_rows || jsonb_build_object(
      'client_notes', coalesce((select jsonb_agg(to_jsonb(t)) from public.client_notes t where t.profile_id = any(v_profiles)), '[]'::jsonb),
      'client_files', coalesce((select jsonb_agg(to_jsonb(t)) from public.client_files t where t.profile_id = any(v_profiles)), '[]'::jsonb),
      'client_about', coalesce((select jsonb_agg(to_jsonb(t)) from public.client_about t where t.profile_id = any(v_profiles)), '[]'::jsonb),
      'client_view_requests', coalesce((select jsonb_agg(to_jsonb(t)) from public.client_view_requests t where t.profile_id = any(v_profiles)), '[]'::jsonb),
      'client_check_ins', coalesce((select jsonb_agg(to_jsonb(t)) from public.client_check_ins t where t.profile_id = any(v_profiles)), '[]'::jsonb),
      'coach_cover', coalesce((select jsonb_agg(to_jsonb(t)) from public.coach_cover t where t.profile_id = any(v_profiles)), '[]'::jsonb),
      'coach_field_values', coalesce((select jsonb_agg(to_jsonb(v)) from public.coach_field_values v where v.item_id = any(v_profiles)), '[]'::jsonb),
      'coach_fields', coalesce((select jsonb_agg(to_jsonb(t)) from public.coach_fields t where t.coach_id = v_coach), '[]'::jsonb)
    );
  end if;

  -- ---------------------------------------------------------------- the calendar
  if v_page = 'calendar' then
    with polls as (select t.* from public.coach_polls t where t.coach_id = v_coach)
    select jsonb_build_object(
      'coach_open_blocks', coalesce((select jsonb_agg(to_jsonb(t)) from public.coach_open_blocks t where t.coach_id = v_coach), '[]'::jsonb),
      'coach_bookings', coalesce((select jsonb_agg(to_jsonb(t)) from public.coach_bookings t where t.coach_id = v_coach and t.starts_at < v_to and t.ends_at > v_from), '[]'::jsonb),
      'coach_booking_links', coalesce((select jsonb_agg(to_jsonb(t)) from public.coach_booking_links t where t.coach_id = v_coach), '[]'::jsonb),
      'coach_polls', coalesce((select jsonb_agg(to_jsonb(x)) from polls x), '[]'::jsonb),
      'coach_poll_options', coalesce((select jsonb_agg(to_jsonb(t)) from public.coach_poll_options t where t.poll_id in (select id from polls)), '[]'::jsonb),
      'coach_poll_people', coalesce((select jsonb_agg(to_jsonb(t)) from public.coach_poll_people t where t.poll_id in (select id from polls)), '[]'::jsonb),
      'coach_poll_votes', coalesce((select jsonb_agg(to_jsonb(v)) from public.coach_poll_votes v
                                    where v.option_id in (select o.id from public.coach_poll_options o where o.poll_id in (select id from polls))), '[]'::jsonb)
    ) into v_rows;
    v_tables := v_tables || v_rows;
  end if;

  -- ---------------------------------------------------------------- to-dos and tags, for every page
  -- The to-dos planned up to today and not done (Today's list, and the menu's count on every page); a client's own
  -- (their page); the ones placed in the calendar's weeks (the calendar). Done ones only as the portal's own first read
  -- has them: done in the last 60 days. Then the tags of those to-dos, and of the clients the page shows.
  with d as (
    select t.* from public.coach_todos t
    where t.coach_id = v_coach
      and ((t.done_at is null and t.planned_on <= v_today)
           or (v_page = 'client' and t.profile_id = any(v_profiles) and (t.done_at is null or t.done_at >= now() - interval '60 days'))
           or (v_page = 'calendar' and t.planned_on >= v_from_day and t.planned_on <= v_to_day
               and (t.done_at is null or t.done_at >= now() - interval '60 days')))
  )
  select jsonb_build_object(
    'coach_todos', coalesce((select jsonb_agg(to_jsonb(x)) from d x), '[]'::jsonb),
    'coach_tag_links', coalesce((select jsonb_agg(to_jsonb(l)) from public.coach_tag_links l
                                 where (l.item_kind = 'todo' and l.item_id in (select id from d))
                                    or (v_page = 'clients' and l.item_kind = 'client'
                                        and l.item_id in (select p.id from public.client_profiles p where p.coach_id = v_coach))
                                    or (v_page = 'client' and l.item_kind = 'client' and l.item_id = any(v_profiles))), '[]'::jsonb)
  ) into v_rows;
  v_tables := v_tables || v_rows;

  return jsonb_build_object(
    'page', v_page,
    'tables', v_tables,
    'start', public.coach_sessions_start(p_since, v_profiles),
    -- The owner's calendar also shows associates' coaching sessions (058): with its first screen, so no day is drawn
    -- one call short. 058's function itself gives anyone but the owner with the code nothing.
    'associates', case when v_page = 'calendar'
      then coalesce((select jsonb_agg(to_jsonb(a) order by a.starts_at) from public.coach_associate_sessions(v_from, v_to) a), '[]'::jsonb)
      else null end
  );
end;
$$;
comment on function public.coach_first_screen(text, timestamptz, timestamptz, date, timestamptz, uuid[]) is
  'A coach portal page''s first screen in one read (060): the coach''s own rows that Today, Clients, a client''s page or the calendar draw first, and 057''s first sessions. Plain reads under the tables'' own rules; nothing without the 6-digit code.';
revoke all on function public.coach_first_screen(text, timestamptz, timestamptz, date, timestamptz, uuid[]) from public, anon;
grant execute on function public.coach_first_screen(text, timestamptz, timestamptz, date, timestamptz, uuid[]) to authenticated;

select public.record_migration(60, '060_coach_first_screen');
