-- =============================================================================
-- 051_coach_calendar.sql
-- Phase 6a run 3 (M11 Coach portal, seq 77; Tim, 19 Nov 2026): the data under
-- the calendar and booking in Clarity Coach.
--
-- THE TABLES, IN SHORT (read this instead of the whole file)
--
--   coach_call_types      a kind of call people can book, with its own page
--     id uuid, coach_id uuid, key text ('chemistry', 'connection' or the
--     coach's own; one of each key a coach), name text, description text,
--     minutes int (15 to 240, quarter hours), gap_before int, gap_after int
--     (minutes, 0 to 120), notice_hours int, ahead_weeks int (1 to 12),
--     day_limit int (calls a day, 1 to 20), questions jsonb (the questions
--     before booking), place_kind text (zoom | in_person | phone),
--     page_key uuid (its own booking link), active bool, makes_lead bool,
--     position int.
--
--   coach_polls           times offered to several people ("A poll")
--     id, coach_id, title, minutes, place_kind, time_zone (the anchor: a
--     place name), status (open | confirmed | cancelled),
--     confirmed_option_id uuid, confirmed_item_id uuid, notes.
--   coach_poll_people     who is asked: id, poll_id, coach_id, name, email,
--     profile_id, time_zone (theirs: "As Mia sees it"), vote_key uuid (their
--     own link), voted_at, position.
--   coach_poll_options    a time offered: id, poll_id, coach_id, starts_at,
--     ends_at, position. Its held time on the calendar is a coach_cal_items
--     row of kind 'hold' with poll_option_id.
--   coach_poll_votes      option_id, person_id, can bool, voted_at. Written
--     only by poll_vote(); the coach reads.
--
--   coach_booking_links   a single-use link
--     id, coach_id, key uuid (the link), purpose text ("What's it for?"),
--     for_name, for_email, call_name, profile_id (when it is for a client),
--     minutes, place_kind, notice_hours, ahead_weeks, expires_on date (empty:
--     no end date), used_at, booking_id, revoked_at.
--
--   coach_leads           a lead a booking made (run 4's Leads builds on it)
--     id, coach_id, name, email, source text (chemistry_page |
--     connection_page | booking_page | single_use_link | other),
--     call_type_key, booking_id, time_zone, answers jsonb, status text
--     ('new' to start), notes.
--
--   coach_cal_items       everything on a coach's calendar
--     id, coach_id,
--     kind text (client_call | chemistry | connection | own_time | admin |
--       writing | event | travel | other | hold),
--     calendar text (work | personal | family),
--     title text, starts_at timestamptz, ends_at timestamptz (UTC instants),
--     time_zone text (the anchor zone's place name, never an offset),
--     all_day bool, starts_on date, ends_on date (an all-day item's first
--       and last day, in its anchor zone),
--     repeat_rule jsonb (a rule in the anchor zone: see coach_cal_repeat_ok),
--     series_id uuid + occurrence_on date (this row stands in for that one
--       time of the series: "this one"), removed bool (that one time was
--       deleted), split_from uuid ("this and following": the series it was
--       cut from),
--     location text, place_kind text (zoom | in_person | phone),
--     meeting_link text (https), meeting_id text,
--     notes text, attachments jsonb, reminders jsonb ([{ minutes, by }]),
--     busy bool (busy or free), private bool,
--     profile_id, group_id, session_id (the coach_sessions row of a client
--       call), poll_option_id (held for a poll), travel_for (the item this
--       travel time belongs to),
--     google_event_id, google_calendar_id, google_etag, google_synced_at,
--     moved_in_google_at ("Moved in Google Calendar" until the coach has
--       seen it).
--     A placed to-do is NOT here: it stays a coach_todos row (planned_on,
--     planned_time, minutes).
--   coach_cal_guests      who is invited: id, item_id, coach_id, name, email,
--     profile_id, guest_coach_id, contact_id, reply (none | yes | no |
--     maybe), replied_at, invited_at, position.
--
--   coach_open_blocks     Open for calls: id, coach_id, starts_at, ends_at,
--     time_zone, call_type_id (empty: every call type). This week and the
--     four after it.
--
--   coach_bookings        a booking made through a page, a link or by a client
--     id, coach_id, call_type_id, link_id, item_id, session_id, profile_id,
--     lead_id, name, email, time_zone (the anchor: the booker's own),
--     starts_at, ends_at, answers jsonb, status (booked | cancelled),
--     source (page | link | client), guest_key uuid (the guest's own key to
--     move or cancel), moved_from, moved_at, cancelled_at, late_cancel bool,
--     moved_in_google_at. Written only by the functions below.
--
--   coach_cal_reminder_sends  a reminder that went, once: id, item_id,
--     coach_id, kind (day_before | hour_before | custom), occurrence_at,
--     people, sent_at. Written only by the email server.
--
--   coach_connections     Google Calendar and Zoom: coach_id, service
--     (google_calendar | zoom), status, account_label, calendars jsonb,
--     sync_token, secret (the service's token), last_synced_at, last_error.
--     The server's alone: no person reads it. coach_connections_mine() gives
--     a coach the status of their own, never the secret.
--
--   USED, NOT ADDED: coach_settings.working_hours and .booking_hours (049:
--   { mon: { from: '09:00', to: '17:00' }, ... }), .booking (reminder
--   switches remind_24, remind_1, remind_sms and the limits gap, per_day,
--   notice, ahead: read as their leading whole number), .calendars (the
--   show switches), .second_time_zone and .time_zone; coach_away (026).
--
-- FUNCTIONS
--   Anyone holding a key (signed out too):
--     booking_page(key)                      what a booking page or a
--                                            single-use link shows
--     booking_free_times(key, from, to)      the free starts, worked out here
--     booking_make(key, start, name, email, zone, answers, early_late)
--     booking_mine(guest_key), booking_move(guest_key, start, early_late),
--     booking_cancel(guest_key)
--     poll_page(vote_key), poll_vote(vote_key, votes)
--   A signed-in client:
--     my_booking_times(from, to, minutes), my_sessions_coming(),
--     my_session_book(start, minutes), my_session_move(session, start,
--     late_ok), my_session_cancel(session, late_ok)
--   A coach: coach_call_types_start(), coach_connections_mine()
--   The email server: cal_reminders_coming(now), cal_reminder_claim(...)
--
-- WHO SEES WHAT
--   - Every table is its coach's alone. An associate sees only their own
--     calendar. The owner never reads an associate's calendar items, busy
--     times, call types, bookings, polls or leads: 050's rule for sessions
--     (the coach's alone; the owner sees only an engagement's count) holds.
--   - Personal and family items never reach anyone else: a booking page, a
--     single-use link and a client only ever get free start times, worked
--     out in the database, in which those items count as busy.
--   - A booking page shows its own call type only, never the other one.
--   - A guest reaches only their own booking, by its own key; someone asked
--     in a poll only that poll, by their own key.
--   - A client reads no table here: they book, move and cancel their own
--     sessions through the my_ functions.
--
-- THE RULES KEPT HERE
--   - A time is a UTC instant with the place name of its anchor zone. A
--     repeat is a rule in the anchor zone, worked out each time
--     (_cal_occurrences), so 07:30 New York time stays 07:30 there.
--   - A booking starts on a quarter hour in the booker's own time, never
--     within the gap (15 minutes) of another call, never over something
--     busy, never past the calls-a-day limit (5), never inside the notice
--     needed, and only as far ahead as allowed. Two people racing for one
--     start never both get it.
--   - A page offers 07:00 to 20:00 in the visitor's own time unless they
--     chose "Show early and late times".
--   - A client who moves or cancels with under 24 hours' notice is told so
--     first; going on uses the session (050's late cancellation).
--
-- OLDER THINGS IT TOUCHES
--   None. (It reads coach_settings, coach_away, client_profiles,
--   engagements and coach_sessions, and writes coach_sessions only through
--   the client's own booking functions and when a calendar item with a
--   session moves.)
--
-- Additive and safe to run twice. Needs 049 and 050 (it stops with a clear
-- message without them). Test: supabase/051_coach_calendar_test.sql.
-- =============================================================================

do $need$
begin
  if to_regclass('public.client_profiles') is null or to_regprocedure('public.my_coach_id()') is null
     or to_regprocedure('public.coach_owns_profile(uuid)') is null or to_regprocedure('public._coach_notify(uuid,text,text,text,text,uuid)') is null then
    raise exception '051 needs 049 first (public.client_profiles, public.my_coach_id, public.coach_owns_profile and public._coach_notify).';
  end if;
  if to_regclass('public.coach_sessions') is null or to_regprocedure('public.coach_repeat_ok(jsonb)') is null
     or to_regprocedure('public.coach_owns_session(uuid)') is null then
    raise exception '051 needs 050 first (public.coach_sessions, public.coach_repeat_ok and public.coach_owns_session).';
  end if;
end
$need$;

-- ---------------------------------------------------------------- shared bits
-- A real time zone by its place name: the shape 049 asks for, and a name
-- this database knows.
create or replace function public.zone_is_real(p_zone text)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_zone is null or not public.zone_name_ok(p_zone) then return false; end if;
  perform now() at time zone p_zone;
  return true;
exception when others then
  return false;
end;
$$;

-- Only an https address is ever kept as a meeting link.
create or replace function public.https_link_ok(p_link text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_link is null or (char_length(p_link) <= 500 and p_link ~ '^https://[^[:space:]<>"]+$');
$$;

-- A calendar item's repeat: 050's rule (every day | weekday | week | month |
-- year, interval, weekdays 0 Sunday to 6 Saturday, until), plus
--   "by": "date" | "weekday"   a monthly repeat on the same date, or on the
--                              same weekday of the month (the 3rd Tuesday;
--                              a 5th one means the last)
--   "count": 1..730            it stops after this many times
-- It is worked out in the item's anchor zone, from its first day and time.
create or replace function public.coach_cal_repeat_ok(p_rule jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_rule is null then return true; end if;
  if not public.coach_repeat_ok(p_rule) then return false; end if;
  if p_rule ? 'by' and (jsonb_typeof(p_rule -> 'by') <> 'string' or (p_rule ->> 'by') not in ('date', 'weekday') or (p_rule ->> 'every') <> 'month') then return false; end if;
  if p_rule ? 'count' and (jsonb_typeof(p_rule -> 'count') <> 'number' or (p_rule ->> 'count')::numeric not between 1 and 730
     or (p_rule ->> 'count')::numeric <> trunc((p_rule ->> 'count')::numeric)) then return false; end if;
  return true;
end;
$$;

-- Reminders before an item: up to 5, each { "minutes": 0 to 40320 (4 weeks), "by": "email" | "phone" }.
create or replace function public.coach_cal_reminders_ok(p_list jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  r jsonb;
begin
  if p_list is null then return true; end if;
  if jsonb_typeof(p_list) <> 'array' or jsonb_array_length(p_list) > 5 then return false; end if;
  for r in select * from jsonb_array_elements(p_list) loop
    if jsonb_typeof(r) <> 'object' or coalesce(jsonb_typeof(r -> 'minutes'), '') <> 'number'
       or (r ->> 'minutes')::numeric not between 0 and 40320 or (r ->> 'minutes')::numeric <> trunc((r ->> 'minutes')::numeric)
       or coalesce(r ->> 'by', '') not in ('email', 'phone') then return false; end if;
  end loop;
  return true;
end;
$$;

-- Questions before booking: up to 10, each
--   { "id": 1 to 40 characters, "label": 1 to 200, "kind": "text" | "long" | "choice",
--     "options": up to 12 of 1 to 80 characters (choice only), "required": true | false }
create or replace function public.coach_cal_questions_ok(p_list jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  q jsonb;
  o jsonb;
begin
  if p_list is null then return true; end if;
  if jsonb_typeof(p_list) <> 'array' or jsonb_array_length(p_list) > 10 or pg_column_size(p_list) > 8192 then return false; end if;
  for q in select * from jsonb_array_elements(p_list) loop
    if jsonb_typeof(q) <> 'object' or coalesce(jsonb_typeof(q -> 'id'), '') <> 'string' or char_length(q ->> 'id') not between 1 and 40
       or coalesce(jsonb_typeof(q -> 'label'), '') <> 'string' or char_length(btrim(q ->> 'label')) not between 1 and 200
       or coalesce(q ->> 'kind', 'text') not in ('text', 'long', 'choice')
       or jsonb_typeof(coalesce(q -> 'required', 'false'::jsonb)) <> 'boolean' then return false; end if;
    if q ? 'options' then
      if jsonb_typeof(q -> 'options') <> 'array' or jsonb_array_length(q -> 'options') > 12 then return false; end if;
      for o in select * from jsonb_array_elements(q -> 'options') loop
        if jsonb_typeof(o) <> 'string' or char_length(btrim(o #>> '{}')) not between 1 and 80 then return false; end if;
      end loop;
    end if;
  end loop;
  return true;
end;
$$;

-- ---------------------------------------------------------------- call types
create table if not exists public.coach_call_types (
  id            uuid primary key default gen_random_uuid(),
  coach_id      uuid not null references public.coaches (id) on delete cascade,
  key           text not null check (key ~ '^[a-z][a-z0-9_]{0,39}$'),
  name          text not null check (char_length(btrim(name)) between 1 and 80),
  description   text check (char_length(description) <= 600),
  minutes       integer not null default 30 check (minutes between 15 and 240 and minutes % 15 = 0),
  gap_before    integer not null default 15 check (gap_before between 0 and 120 and gap_before % 5 = 0),
  gap_after     integer not null default 15 check (gap_after between 0 and 120 and gap_after % 5 = 0),
  notice_hours  integer not null default 24 check (notice_hours between 0 and 720),
  ahead_weeks   integer not null default 4 check (ahead_weeks between 1 and 12),
  day_limit     integer not null default 5 check (day_limit between 1 and 20),
  questions     jsonb not null default '[]'::jsonb check (public.coach_cal_questions_ok(questions)),
  place_kind    text not null default 'zoom' check (place_kind in ('zoom', 'in_person', 'phone')),
  page_key      uuid not null default gen_random_uuid(),
  active        boolean not null default true,
  makes_lead    boolean not null default true,
  position      integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
comment on table public.coach_call_types is
  'A kind of call people can book (Chemistry Call, Connection Call), each with its own page (page_key), length, gaps either side, notice, how far ahead, calls a day and questions. The coach''s alone; a page reads its own through booking_page().';
create unique index if not exists coach_call_types_key_idx on public.coach_call_types (coach_id, key);
create unique index if not exists coach_call_types_page_idx on public.coach_call_types (page_key);

-- ---------------------------------------------------------------- polls
create table if not exists public.coach_polls (
  id                   uuid primary key default gen_random_uuid(),
  coach_id             uuid not null references public.coaches (id) on delete cascade,
  title                text not null check (char_length(btrim(title)) between 1 and 200),
  minutes              integer not null default 60 check (minutes between 15 and 480 and minutes % 15 = 0),
  place_kind           text not null default 'zoom' check (place_kind in ('zoom', 'in_person', 'phone')),
  time_zone            text not null check (public.zone_name_ok(time_zone)),
  status               text not null default 'open' check (status in ('open', 'confirmed', 'cancelled')),
  confirmed_option_id  uuid,
  confirmed_item_id    uuid,
  notes                text check (char_length(notes) <= 2000),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
comment on table public.coach_polls is
  'Times offered to several people (a three-way meeting). Each time stays held on the calendar (coach_cal_items of kind hold) until the coach confirms one. The coach''s alone; a person asked reads it through poll_page() with their own key.';
create index if not exists coach_polls_coach_idx on public.coach_polls (coach_id, status);

create or replace function public.coach_owns_poll(p_poll uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.coach_polls p where p.id = p_poll and p.coach_id = public.my_coach_id());
$$;
revoke all on function public.coach_owns_poll(uuid) from public, anon;
grant execute on function public.coach_owns_poll(uuid) to authenticated;

create table if not exists public.coach_poll_people (
  id          uuid primary key default gen_random_uuid(),
  poll_id     uuid not null references public.coach_polls (id) on delete cascade,
  coach_id    uuid not null references public.coaches (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 120),
  email       text check (public.one_email_ok(email)),
  profile_id  uuid references public.client_profiles (id) on delete set null,
  time_zone   text check (public.zone_name_ok(time_zone)),
  vote_key    uuid not null default gen_random_uuid(),
  voted_at    timestamptz,
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);
comment on table public.coach_poll_people is 'Who a poll asks. vote_key is that person''s own link; time_zone is theirs ("As Mia sees it").';
create index if not exists coach_poll_people_poll_idx on public.coach_poll_people (poll_id, position);
create index if not exists coach_poll_people_coach_idx on public.coach_poll_people (coach_id);
create index if not exists coach_poll_people_profile_idx on public.coach_poll_people (profile_id);
create unique index if not exists coach_poll_people_key_idx on public.coach_poll_people (vote_key);

create table if not exists public.coach_poll_options (
  id          uuid primary key default gen_random_uuid(),
  poll_id     uuid not null references public.coach_polls (id) on delete cascade,
  coach_id    uuid not null references public.coaches (id) on delete cascade,
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  check (ends_at > starts_at and ends_at <= starts_at + interval '8 hours')
);
comment on table public.coach_poll_options is 'A time a poll offers (2 to 5 a poll, the app''s rule; never more than 5 here).';
create index if not exists coach_poll_options_poll_idx on public.coach_poll_options (poll_id, starts_at);
create index if not exists coach_poll_options_coach_idx on public.coach_poll_options (coach_id);

create table if not exists public.coach_poll_votes (
  option_id  uuid not null references public.coach_poll_options (id) on delete cascade,
  person_id  uuid not null references public.coach_poll_people (id) on delete cascade,
  can        boolean not null,
  voted_at   timestamptz not null default now(),
  primary key (option_id, person_id)
);
comment on table public.coach_poll_votes is 'Who can make which offered time. Written only by poll_vote(); the poll''s coach reads.';
create index if not exists coach_poll_votes_person_idx on public.coach_poll_votes (person_id);

-- ---------------------------------------------------------------- single-use links
create table if not exists public.coach_booking_links (
  id            uuid primary key default gen_random_uuid(),
  coach_id      uuid not null references public.coaches (id) on delete cascade,
  key           uuid not null default gen_random_uuid(),
  purpose       text not null check (char_length(btrim(purpose)) between 1 and 80),
  for_name      text check (char_length(for_name) <= 120),
  for_email     text check (public.one_email_ok(for_email)),
  call_name     text check (char_length(call_name) <= 120),
  profile_id    uuid references public.client_profiles (id) on delete set null,
  minutes       integer not null default 30 check (minutes between 15 and 240 and minutes % 15 = 0),
  place_kind    text not null default 'zoom' check (place_kind in ('zoom', 'in_person', 'phone')),
  notice_hours  integer not null default 24 check (notice_hours between 0 and 720),
  ahead_weeks   integer not null default 4 check (ahead_weeks between 1 and 12),
  expires_on    date,
  used_at       timestamptz,
  booking_id    uuid,
  revoked_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
comment on table public.coach_booking_links is
  'A single-use link: what it''s for, who it''s for, how long, when it ends (expires_on empty: no end date). It books once (used_at, set only by booking_make). For a client (profile_id) it offers the coach''s weekly hours; for anyone else, the Open for calls times.';
create unique index if not exists coach_booking_links_key_idx on public.coach_booking_links (key);
create index if not exists coach_booking_links_coach_idx on public.coach_booking_links (coach_id, created_at desc);
create index if not exists coach_booking_links_profile_idx on public.coach_booking_links (profile_id);

-- ---------------------------------------------------------------- leads (a booking makes one; run 4's Leads builds on this)
create table if not exists public.coach_leads (
  id             uuid primary key default gen_random_uuid(),
  coach_id       uuid not null references public.coaches (id) on delete cascade,
  name           text not null check (char_length(btrim(name)) between 1 and 120),
  email          text check (public.one_email_ok(email)),
  source         text not null default 'other' check (source in ('chemistry_page', 'connection_page', 'booking_page', 'single_use_link', 'other')),
  call_type_key  text check (char_length(call_type_key) <= 40),
  booking_id     uuid,
  time_zone      text check (public.zone_name_ok(time_zone)),
  answers        jsonb not null default '{}'::jsonb check (jsonb_typeof(answers) = 'object' and pg_column_size(answers) <= 20000),
  status         text not null default 'new' check (char_length(status) between 1 and 40),
  notes          text check (char_length(notes) <= 6000),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
comment on table public.coach_leads is
  'A lead a booking made by itself (051): the person''s name and email, where they came from, the booking, their time zone and their answers. The least Leads needs; the CRM (run 4) adds to this table and never makes a second one. status is free text (''new'' to start) until the CRM sets its stages.';
create index if not exists coach_leads_coach_idx on public.coach_leads (coach_id, created_at desc);
create index if not exists coach_leads_email_idx on public.coach_leads (coach_id, lower(email));

-- ---------------------------------------------------------------- calendar items
create table if not exists public.coach_cal_items (
  id                  uuid primary key default gen_random_uuid(),
  coach_id            uuid not null references public.coaches (id) on delete cascade,
  kind                text not null default 'other'
                      check (kind in ('client_call', 'chemistry', 'connection', 'own_time', 'admin', 'writing', 'event', 'travel', 'other', 'hold')),
  calendar            text not null default 'work' check (calendar in ('work', 'personal', 'family')),
  title               text not null check (char_length(btrim(title)) between 1 and 200),
  starts_at           timestamptz not null,
  ends_at             timestamptz not null,
  time_zone           text not null check (public.zone_name_ok(time_zone)),
  all_day             boolean not null default false,
  starts_on           date,
  ends_on             date,
  repeat_rule         jsonb check (public.coach_cal_repeat_ok(repeat_rule)),
  series_id           uuid references public.coach_cal_items (id) on delete cascade,
  occurrence_on       date,
  removed             boolean not null default false,
  split_from          uuid,
  location            text check (char_length(location) <= 200),
  place_kind          text check (place_kind in ('zoom', 'in_person', 'phone')),
  meeting_link        text check (public.https_link_ok(meeting_link)),
  meeting_id          text check (char_length(meeting_id) <= 120),
  notes               text check (char_length(notes) <= 6000),
  attachments         jsonb not null default '[]'::jsonb check (jsonb_typeof(attachments) = 'array' and jsonb_array_length(attachments) <= 10 and pg_column_size(attachments) <= 8192),
  reminders           jsonb not null default '[]'::jsonb check (public.coach_cal_reminders_ok(reminders)),
  busy                boolean not null default true,
  private             boolean not null default false,
  profile_id          uuid references public.client_profiles (id) on delete set null,
  group_id            uuid references public.coach_groups (id) on delete set null,
  session_id          uuid references public.coach_sessions (id) on delete set null,
  poll_option_id      uuid references public.coach_poll_options (id) on delete cascade,
  travel_for          uuid references public.coach_cal_items (id) on delete cascade,
  google_event_id     text check (char_length(google_event_id) <= 1024),
  google_calendar_id  text check (char_length(google_calendar_id) <= 320),
  google_etag         text check (char_length(google_etag) <= 200),
  google_synced_at    timestamptz,
  moved_in_google_at  timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (ends_at > starts_at and ends_at <= starts_at + interval '32 days'),
  check ((all_day and starts_on is not null and ends_on is not null and ends_on >= starts_on and ends_on <= starts_on + 31)
         or (not all_day and starts_on is null and ends_on is null)),
  check ((series_id is null) = (occurrence_on is null)),
  check (series_id is null or repeat_rule is null),
  check (not removed or series_id is not null),
  check (series_id is null or series_id <> id),
  check (travel_for is null or travel_for <> id)
);
comment on table public.coach_cal_items is
  'Everything on a coach''s calendar. starts_at and ends_at are UTC instants; time_zone is the anchor zone''s place name (the client''s for a client call), never an offset. A repeat is a rule in the anchor zone (repeat_rule), worked out each time. A row with series_id and occurrence_on stands in for that one time of the series (edited "this one"; removed: deleted). "This and following" ends the series (until) and starts a new one (split_from). Personal and family items are never shown to anyone else: other people only ever get free times in which they count as busy. The coach''s alone.';
comment on column public.coach_cal_items.moved_in_google_at is 'Set when a change read back from Google Calendar moved this item: it shows "Moved in Google Calendar" until the coach has seen it (the app clears it).';
create index if not exists coach_cal_items_coach_idx on public.coach_cal_items (coach_id, starts_at);
create index if not exists coach_cal_items_repeat_idx on public.coach_cal_items (coach_id) where repeat_rule is not null;
create unique index if not exists coach_cal_items_one_time_idx on public.coach_cal_items (series_id, occurrence_on) where series_id is not null;
create unique index if not exists coach_cal_items_session_idx on public.coach_cal_items (session_id) where session_id is not null;
create unique index if not exists coach_cal_items_google_idx on public.coach_cal_items (coach_id, google_calendar_id, google_event_id) where google_event_id is not null;
create index if not exists coach_cal_items_profile_idx on public.coach_cal_items (profile_id);
create index if not exists coach_cal_items_group_idx on public.coach_cal_items (group_id);
create index if not exists coach_cal_items_option_idx on public.coach_cal_items (poll_option_id);
create index if not exists coach_cal_items_travel_idx on public.coach_cal_items (travel_for);

create or replace function public.coach_owns_cal_item(p_item uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.coach_cal_items i where i.id = p_item and i.coach_id = public.my_coach_id());
$$;
revoke all on function public.coach_owns_cal_item(uuid) from public, anon;
grant execute on function public.coach_owns_cal_item(uuid) to authenticated;

create table if not exists public.coach_cal_guests (
  id              uuid primary key default gen_random_uuid(),
  item_id         uuid not null references public.coach_cal_items (id) on delete cascade,
  coach_id        uuid not null references public.coaches (id) on delete cascade,
  name            text check (char_length(name) <= 120),
  email           text check (public.one_email_ok(email)),
  profile_id      uuid references public.client_profiles (id) on delete set null,
  guest_coach_id  uuid references public.coaches (id) on delete set null,
  contact_id      uuid references public.organisation_contacts (id) on delete set null,
  reply           text not null default 'none' check (reply in ('none', 'yes', 'no', 'maybe')),
  replied_at      timestamptz,
  invited_at      timestamptz,
  position        integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (name is not null or email is not null)
);
comment on table public.coach_cal_guests is
  'Who is invited to an item ("Who''s invited?"): a pasted name and email, a person in the portal (profile_id), another coach or an organisation''s contact. reply is their answer through Google Calendar; invited_at is when the invite went.';
create index if not exists coach_cal_guests_item_idx on public.coach_cal_guests (item_id, position);
create unique index if not exists coach_cal_guests_email_idx on public.coach_cal_guests (item_id, lower(email)) where email is not null;
create index if not exists coach_cal_guests_coach_idx on public.coach_cal_guests (coach_id);
create index if not exists coach_cal_guests_profile_idx on public.coach_cal_guests (profile_id);
create index if not exists coach_cal_guests_guest_coach_idx on public.coach_cal_guests (guest_coach_id);
create index if not exists coach_cal_guests_contact_idx on public.coach_cal_guests (contact_id);

-- ---------------------------------------------------------------- Open for calls
create table if not exists public.coach_open_blocks (
  id            uuid primary key default gen_random_uuid(),
  coach_id      uuid not null references public.coaches (id) on delete cascade,
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  time_zone     text not null check (public.zone_name_ok(time_zone)),
  call_type_id  uuid references public.coach_call_types (id) on delete cascade,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (ends_at > starts_at and ends_at <= starts_at + interval '24 hours'),
  check (extract(minute from starts_at)::integer % 15 = 0 and extract(second from starts_at) = 0),
  check (extract(minute from ends_at)::integer % 15 = 0 and extract(second from ends_at) = 0)
);
comment on table public.coach_open_blocks is
  'Open for calls: a block of time people can book inside, on quarter hours, for this week and the four after it. call_type_id empty means every call type. Blocks that touch are joined by the app; the free times are worked out from them here, less anything busy.';
create index if not exists coach_open_blocks_coach_idx on public.coach_open_blocks (coach_id, starts_at);
create index if not exists coach_open_blocks_type_idx on public.coach_open_blocks (call_type_id);

-- ---------------------------------------------------------------- bookings
create table if not exists public.coach_bookings (
  id                  uuid primary key default gen_random_uuid(),
  coach_id            uuid not null references public.coaches (id) on delete cascade,
  call_type_id        uuid references public.coach_call_types (id) on delete set null,
  link_id             uuid references public.coach_booking_links (id) on delete set null,
  item_id             uuid references public.coach_cal_items (id) on delete set null,
  session_id          uuid references public.coach_sessions (id) on delete set null,
  profile_id          uuid references public.client_profiles (id) on delete set null,
  lead_id             uuid references public.coach_leads (id) on delete set null,
  name                text not null check (char_length(btrim(name)) between 1 and 120),
  email               text check (public.one_email_ok(email)),
  time_zone           text not null check (public.zone_name_ok(time_zone)),
  starts_at           timestamptz not null,
  ends_at             timestamptz not null,
  answers             jsonb not null default '{}'::jsonb check (jsonb_typeof(answers) = 'object' and pg_column_size(answers) <= 20000),
  status              text not null default 'booked' check (status in ('booked', 'cancelled')),
  source              text not null default 'page' check (source in ('page', 'link', 'client')),
  guest_key           uuid not null default gen_random_uuid(),
  moved_from          timestamptz,
  moved_at            timestamptz,
  cancelled_at        timestamptz,
  late_cancel         boolean not null default false,
  moved_in_google_at  timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (ends_at > starts_at)
);
comment on table public.coach_bookings is
  'A booking made through a booking page, a single-use link or by a client. time_zone is the anchor: the booker''s own zone. guest_key is the guest''s own key to move or cancel. Written only by the booking functions; its coach reads. Two bookings never hold the same start for one coach.';
create unique index if not exists coach_bookings_one_start_idx on public.coach_bookings (coach_id, starts_at) where status = 'booked';
create unique index if not exists coach_bookings_guest_idx on public.coach_bookings (guest_key);
create index if not exists coach_bookings_coach_idx on public.coach_bookings (coach_id, starts_at desc);
create index if not exists coach_bookings_type_idx on public.coach_bookings (call_type_id);
create index if not exists coach_bookings_link_idx on public.coach_bookings (link_id);
create index if not exists coach_bookings_item_idx on public.coach_bookings (item_id);
create index if not exists coach_bookings_session_idx on public.coach_bookings (session_id);
create index if not exists coach_bookings_profile_idx on public.coach_bookings (profile_id);
create index if not exists coach_bookings_lead_idx on public.coach_bookings (lead_id);
create index if not exists coach_bookings_email_idx on public.coach_bookings (coach_id, lower(email)) where status = 'booked';

-- ---------------------------------------------------------------- reminders that went
create table if not exists public.coach_cal_reminder_sends (
  id             uuid primary key default gen_random_uuid(),
  item_id        uuid not null references public.coach_cal_items (id) on delete cascade,
  coach_id       uuid not null references public.coaches (id) on delete cascade,
  kind           text not null check (kind in ('day_before', 'hour_before', 'custom')),
  occurrence_at  timestamptz not null,
  people         integer not null default 0 check (people between 0 and 5000),
  sent_at        timestamptz not null default now(),
  unique (item_id, kind, occurrence_at)
);
comment on table public.coach_cal_reminder_sends is
  'A reminder that went for one time of a calendar item, once: claimed here BEFORE it is sent, so nothing goes twice. Written only by the email server (the service role); its coach reads it.';
create index if not exists coach_cal_reminder_sends_coach_idx on public.coach_cal_reminder_sends (coach_id, sent_at desc);

-- ---------------------------------------------------------------- Google Calendar and Zoom (the server's alone)
create table if not exists public.coach_connections (
  coach_id        uuid not null references public.coaches (id) on delete cascade,
  service         text not null check (service in ('google_calendar', 'zoom')),
  status          text not null default 'off' check (status in ('off', 'on', 'needs_sign_in')),
  account_label   text check (char_length(account_label) <= 254),
  calendars       jsonb not null default '{}'::jsonb check (jsonb_typeof(calendars) = 'object' and pg_column_size(calendars) <= 8192),
  sync_token      text check (char_length(sync_token) <= 2000),
  secret          text check (char_length(secret) <= 8000),
  last_synced_at  timestamptz,
  last_error      text check (char_length(last_error) <= 300),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (coach_id, service)
);
comment on table public.coach_connections is
  'A coach''s connection to Google Calendar or Zoom. calendars maps work, personal and family to the Google calendars'' ids; secret is the service''s token. The server''s alone (the service role): no person reads a row. coach_connections_mine() tells a coach the status of their own, never the secret.';

-- ---------------------------------------------------------------- settings read as numbers
-- 049 keeps the Booking limits in coach_settings.booking, and run 2's
-- Settings rows saved them as typed ("15 minutes", "24 hours"). They are
-- read here as their leading whole number, kept inside sensible bounds.
create or replace function public._cal_setting(p_coach uuid, p_key text, p_default integer, p_low integer, p_high integer)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select least(p_high, greatest(p_low, coalesce(
    (select substring(s.booking ->> p_key from '^\s*(\d{1,4})')::integer from public.coach_settings s where s.coach_id = p_coach),
    p_default)));
$$;
revoke all on function public._cal_setting(uuid, text, integer, integer, integer) from public, anon, authenticated;

create or replace function public._cal_coach_zone(p_coach uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select s.time_zone from public.coach_settings s where s.coach_id = p_coach and public.zone_is_real(s.time_zone)), 'Europe/London');
$$;
revoke all on function public._cal_coach_zone(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- a coach's calendar, each time worked out
-- Every time a coach's items fall between two instants: single items as
-- they are, and each repeating item worked out from its rule in its own
-- anchor zone (the local day and time stay the same whatever either
-- country's clocks do). A time that a row stands in for ("this one"), or
-- that was removed, is left out of its series. is_call: a call with
-- someone (the gap between calls and the calls-a-day limit count these).
create or replace function public._cal_occurrences(p_coach uuid, p_from timestamptz, p_to timestamptz)
returns table (item_id uuid, starts_at timestamptz, ends_at timestamptz, kind text, busy boolean, is_call boolean, occurrence_on date)
language sql
stable
security definer
set search_path = ''
as $$
  -- Single items, and the rows that stand in for one time of a series.
  select i.id, i.starts_at, i.ends_at, i.kind, i.busy, i.kind in ('client_call', 'chemistry', 'connection'), i.occurrence_on
  from public.coach_cal_items i
  where i.coach_id = p_coach and i.repeat_rule is null and not i.removed
    and i.starts_at < p_to and i.ends_at > p_from
  union all
  -- Repeating items.
  select s.id, o.starts_at, o.starts_at + s.len, s.kind, s.busy, s.kind in ('client_call', 'chemistry', 'connection'), o.d
  from (
    select i.id, i.kind, i.busy, i.time_zone as tz, i.repeat_rule as r,
           (i.starts_at at time zone i.time_zone)::date as d0,
           (i.starts_at at time zone i.time_zone)::time as t0,
           i.ends_at - i.starts_at as len,
           greatest(1, coalesce((i.repeat_rule ->> 'interval')::integer, 1)) as n
    from public.coach_cal_items i
    where i.coach_id = p_coach and i.repeat_rule is not null and i.starts_at < p_to
  ) s
  cross join lateral (
    select g.d, ((g.d + s.t0) at time zone s.tz) as starts_at
    from (
      select x.d::date as d, row_number() over (order by x.d) as nth
      from generate_series(
             (case when s.r ? 'count' then s.d0 else greatest(s.d0, (p_from at time zone s.tz)::date - 33) end)::timestamp,
             least((p_to at time zone s.tz)::date, coalesce((s.r ->> 'until')::date, 'infinity'::date))::timestamp,
             interval '1 day') as x(d)
      where case s.r ->> 'every'
        when 'day' then (x.d::date - s.d0) % s.n = 0
        when 'weekday' then extract(isodow from x.d) < 6
        when 'week' then
          ((date_trunc('week', x.d)::date - date_trunc('week', s.d0::timestamp)::date) / 7) % s.n = 0
          and (case when jsonb_array_length(coalesce(s.r -> 'weekdays', '[]'::jsonb)) > 0
                    then (s.r -> 'weekdays') @> to_jsonb(extract(dow from x.d)::integer)
                    else extract(dow from x.d) = extract(dow from s.d0) end)
        when 'month' then
          ((extract(year from x.d)::integer * 12 + extract(month from x.d)::integer)
            - (extract(year from s.d0)::integer * 12 + extract(month from s.d0)::integer)) % s.n = 0
          and (case when s.r ->> 'by' = 'weekday'
                    then extract(dow from x.d) = extract(dow from s.d0)
                         and (case when extract(day from s.d0) > 28
                                   then extract(month from x.d + interval '7 days') <> extract(month from x.d)
                                   else ceil(extract(day from x.d) / 7.0) = ceil(extract(day from s.d0) / 7.0) end)
                    -- The same date, or the month's last day where it has no such date (as a coach's to-dos repeat).
                    else extract(day from x.d) = least(extract(day from s.d0), extract(day from (date_trunc('month', x.d) + interval '1 month - 1 day'))) end)
        when 'year' then
          (extract(year from x.d)::integer - extract(year from s.d0)::integer) % s.n = 0
          and extract(month from x.d) = extract(month from s.d0)
          and extract(day from x.d) = least(extract(day from s.d0), extract(day from (date_trunc('month', x.d) + interval '1 month - 1 day')))
        else false end
    ) g
    where (not (s.r ? 'count') or g.nth <= (s.r ->> 'count')::integer)
  ) o
  where o.starts_at < p_to and o.starts_at + s.len > p_from
    and not exists (select 1 from public.coach_cal_items e where e.series_id = s.id and e.occurrence_on = o.d);
$$;
revoke all on function public._cal_occurrences(uuid, timestamptz, timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------- free times
-- The starts a coach can be booked at between two instants, worked out
-- here so no page ever needs to see the calendar:
--   p_source 'open'   inside the Open for calls blocks (booking pages and
--                     single-use links for people outside)
--            'hours'  inside the coach's weekly hours (clients): Settings'
--                     "Open for bookings" when set, else the working day
--   - on a quarter hour, with the whole call inside one block;
--   - at least the notice ahead, and no further ahead than allowed;
--   - never over anything busy (personal and family items count as busy,
--     and so does a time held for a poll), and never on a day away;
--   - never within the gap of another call;
--   - never on a day that already holds the most calls allowed (the day is
--     the coach's own).
-- p_skip_item: the item being moved, which doesn't block its own new time.
create or replace function public._cal_free_times(
  p_coach uuid, p_source text, p_minutes integer, p_gap_before integer, p_gap_after integer, p_notice_hours integer,
  p_ahead_weeks integer, p_day_limit integer, p_from timestamptz, p_to timestamptz,
  p_skip_item uuid default null, p_type uuid default null, p_now timestamptz default now())
returns setof timestamptz
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_zone text := public._cal_coach_zone(p_coach);
  v_gap integer := public._cal_setting(p_coach, 'gap', 15, 0, 120);
  v_before integer := greatest(coalesce(p_gap_before, 0), v_gap);
  v_after integer := greatest(coalesce(p_gap_after, 0), v_gap);
  v_limit integer := least(coalesce(p_day_limit, 5), public._cal_setting(p_coach, 'per_day', 5, 1, 20));
  v_len interval := make_interval(mins => p_minutes);
  v_lo timestamptz;
  v_hi timestamptz;
  v_hours jsonb;
begin
  if p_minutes is null or p_minutes < 15 or p_from is null or p_to is null then return; end if;
  v_lo := greatest(p_from, p_now + make_interval(hours => coalesce(p_notice_hours, 24)));
  v_lo := date_bin(interval '15 minutes', v_lo + interval '14 minutes 59.999999 seconds', timestamptz '2000-01-01 00:00:00+00');
  -- Never more than 45 days in one question, however far ahead is allowed.
  v_hi := least(p_to, p_now + make_interval(weeks => coalesce(p_ahead_weeks, 4)), v_lo + interval '45 days');
  if v_hi < v_lo + v_len then return; end if;

  select case when s.booking_hours is not null and s.booking_hours <> '{}'::jsonb then s.booking_hours
              when s.working_hours is not null and s.working_hours <> '{}'::jsonb then s.working_hours end
  into v_hours from public.coach_settings s where s.coach_id = p_coach;
  v_hours := coalesce(v_hours, '{"mon":{"from":"09:00","to":"17:00"},"tue":{"from":"09:00","to":"17:00"},"wed":{"from":"09:00","to":"17:00"},"thu":{"from":"09:00","to":"17:00"},"fri":{"from":"09:00","to":"17:00"}}'::jsonb);

  return query
  with win as (
    select b.starts_at as a, b.ends_at as z
    from public.coach_open_blocks b
    where p_source = 'open' and b.coach_id = p_coach and b.starts_at < v_hi and b.ends_at > v_lo
      and (b.call_type_id is null or b.call_type_id = p_type)
    union all
    select ((d.d::date + (h.h ->> 'from')::time) at time zone v_zone), ((d.d::date + (h.h ->> 'to')::time) at time zone v_zone)
    from generate_series((v_lo at time zone v_zone)::date::timestamp, (v_hi at time zone v_zone)::date::timestamp, interval '1 day') as d(d)
    cross join lateral (select v_hours -> (array['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'])[extract(dow from d.d)::integer + 1] as h) h
    where p_source = 'hours' and jsonb_typeof(h.h) = 'object'
      and (h.h ->> 'from') ~ '^([01]\d|2[0-3]):[0-5]\d$' and (h.h ->> 'to') ~ '^([01]\d|2[0-3]):[0-5]\d$'
  ),
  busy as materialized (
    select o.starts_at as a, o.ends_at as z, o.is_call
    from public._cal_occurrences(p_coach, v_lo - interval '1 day', v_hi + interval '1 day') o
    where o.busy and o.item_id is distinct from p_skip_item
  ),
  calls as materialized (
    select (b.a at time zone v_zone)::date as d, count(*) as n from busy b where b.is_call group by 1
  )
  select s.s
  from generate_series(v_lo, v_hi - v_len, interval '15 minutes') as s(s)
  where exists (select 1 from win w where s.s >= w.a and s.s + v_len <= w.z)
    and not exists (select 1 from busy b
                    where case when b.is_call
                               then b.a < s.s + v_len + make_interval(mins => v_after) and b.z > s.s - make_interval(mins => v_before)
                               else b.a < s.s + v_len and b.z > s.s end)
    and coalesce((select c.n from calls c where c.d = (s.s at time zone v_zone)::date), 0) < v_limit
    and not exists (select 1 from public.coach_away a
                    where a.coach_id = p_coach and (s.s at time zone v_zone)::date between a.starts_on and a.ends_on)
  order by 1;
end;
$$;
revoke all on function public._cal_free_times(uuid, text, integer, integer, integer, integer, integer, integer, timestamptz, timestamptz, uuid, uuid, timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------- guards and followers
-- A calendar item keeps its coach, and its zone is a real place.
create or replace function public.coach_cal_items_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.coach_id := old.coach_id;
  end if;
  if (tg_op = 'INSERT' or new.time_zone is distinct from old.time_zone) and not public.zone_is_real(new.time_zone) then
    raise exception 'A calendar item''s time zone is a place name, like Europe/London.' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function public.coach_cal_items_guard() from public, anon, authenticated;
drop trigger if exists coach_cal_items_guard on public.coach_cal_items;
create trigger coach_cal_items_guard before insert or update on public.coach_cal_items
  for each row execute function public.coach_cal_items_guard();

-- When an item moves, the session and the booking it stands for move with
-- it (a sent recap's session stays where it was: 050). When it is deleted,
-- its booking is cancelled. The booking functions do this themselves.
create or replace function public.coach_cal_items_follow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_minutes integer;
begin
  if coalesce(current_setting('clarity.booking', true), '') = 'on' then
    if tg_op = 'DELETE' then return old; end if;
    return null;
  end if;
  if tg_op = 'DELETE' then
    update public.coach_bookings b set status = 'cancelled', cancelled_at = now()
    where b.item_id = old.id and b.status = 'booked';
    return old;
  end if;
  if new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at then
    v_minutes := (extract(epoch from (new.ends_at - new.starts_at)) / 60)::integer;
    if new.session_id is not null then
      update public.coach_sessions s
      set starts_at = new.starts_at, minutes = case when v_minutes in (30, 60, 90) then v_minutes else s.minutes end
      where s.id = new.session_id and (s.starts_at is distinct from new.starts_at or (v_minutes in (30, 60, 90) and s.minutes <> v_minutes));
    end if;
    update public.coach_bookings b
    set moved_from = case when b.starts_at is distinct from new.starts_at then b.starts_at else b.moved_from end,
        moved_at = case when b.starts_at is distinct from new.starts_at then now() else b.moved_at end,
        starts_at = new.starts_at, ends_at = new.ends_at,
        moved_in_google_at = coalesce(new.moved_in_google_at, b.moved_in_google_at)
    where b.item_id = new.id and b.status = 'booked';
  end if;
  return null;
end;
$$;
revoke all on function public.coach_cal_items_follow() from public, anon, authenticated;
drop trigger if exists coach_cal_items_follow on public.coach_cal_items;
create trigger coach_cal_items_follow after update of starts_at, ends_at on public.coach_cal_items
  for each row execute function public.coach_cal_items_follow();
-- Before the delete, while the booking still points at the item.
drop trigger if exists coach_cal_items_gone on public.coach_cal_items;
create trigger coach_cal_items_gone before delete on public.coach_cal_items
  for each row execute function public.coach_cal_items_follow();

-- Open for calls reaches this week and the four after it, and no further.
create or replace function public.coach_open_blocks_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then new.coach_id := old.coach_id; end if;
  if not public.zone_is_real(new.time_zone) then
    raise exception 'An open time''s time zone is a place name, like Europe/London.' using errcode = '22023';
  end if;
  if new.starts_at >= (date_trunc('week', now() at time zone new.time_zone) at time zone new.time_zone) + interval '35 days' then
    raise exception 'Open for calls reaches 4 weeks ahead.' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function public.coach_open_blocks_guard() from public, anon, authenticated;
drop trigger if exists coach_open_blocks_guard on public.coach_open_blocks;
create trigger coach_open_blocks_guard before insert or update on public.coach_open_blocks
  for each row execute function public.coach_open_blocks_guard();

-- A single-use link is used only by a booking: a plain save never marks it
-- used or unused, and never gives it another key.
create or replace function public.coach_booking_links_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('clarity.booking', true), '') = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.used_at := null; new.booking_id := null;
    return new;
  end if;
  new.coach_id := old.coach_id; new.key := old.key; new.used_at := old.used_at; new.booking_id := old.booking_id;
  return new;
end;
$$;
revoke all on function public.coach_booking_links_guard() from public, anon, authenticated;
drop trigger if exists coach_booking_links_guard on public.coach_booking_links;
create trigger coach_booking_links_guard before insert or update on public.coach_booking_links
  for each row execute function public.coach_booking_links_guard();

-- A poll offers at most 5 times.
create or replace function public.coach_poll_options_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.coach_poll_options o where o.poll_id = new.poll_id and o.id <> new.id) >= 5 then
    raise exception 'A poll offers up to 5 times.' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function public.coach_poll_options_guard() from public, anon, authenticated;
drop trigger if exists coach_poll_options_guard on public.coach_poll_options;
create trigger coach_poll_options_guard before insert on public.coach_poll_options
  for each row execute function public.coach_poll_options_guard();

-- ---------------------------------------------------------------- updated_at
do $touch$
declare t text;
begin
  foreach t in array array[
    'coach_call_types', 'coach_polls', 'coach_booking_links', 'coach_leads', 'coach_cal_items', 'coach_cal_guests',
    'coach_open_blocks', 'coach_bookings', 'coach_connections'
  ] loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.p1_touch()', t || '_touch', t);
  end loop;
end
$touch$;

-- ---------------------------------------------------------------- row security
do $lock$
declare t text;
begin
  foreach t in array array[
    'coach_call_types', 'coach_polls', 'coach_poll_people', 'coach_poll_options', 'coach_poll_votes', 'coach_booking_links',
    'coach_leads', 'coach_cal_items', 'coach_cal_guests', 'coach_open_blocks', 'coach_bookings', 'coach_cal_reminder_sends',
    'coach_connections'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
  end loop;
end
$lock$;

create or replace function pg_temp.rule(p_table text, p_name text, p_for text, p_using text, p_check text default null)
returns void
language plpgsql
as $f$
begin
  execute format('drop policy if exists %I on public.%I', p_name, p_table);
  execute format('create policy %I on public.%I for %s to authenticated%s%s', p_name, p_table, p_for,
    case when p_using is null then '' else ' using (' || p_using || ')' end,
    case when p_check is null then '' else ' with check (' || p_check || ')' end);
end
$f$;

do $rules$
declare
  mine text := 'coach_id = (select public.my_coach_id())';
  own_profile text := '(profile_id is null or (select public.coach_owns_profile(profile_id)))';
  t text;
begin
  -- The coach's alone, the owner included: call types, leads, open times.
  foreach t in array array['coach_call_types', 'coach_leads'] loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    perform pg_temp.rule(t, 'Coach alone', 'all', mine, mine);
  end loop;

  grant select, insert, update, delete on public.coach_open_blocks to authenticated;
  perform pg_temp.rule('coach_open_blocks', 'Coach alone', 'all', mine,
    mine || ' and (call_type_id is null or exists (select 1 from public.coach_call_types ct where ct.id = call_type_id and ct.coach_id = (select public.my_coach_id())))');

  grant select, insert, update, delete on public.coach_booking_links to authenticated;
  perform pg_temp.rule('coach_booking_links', 'Coach alone', 'all', mine, mine || ' and ' || own_profile);

  -- Polls, the people asked and the times offered: the coach's alone.
  grant select, insert, update, delete on public.coach_polls to authenticated;
  perform pg_temp.rule('coach_polls', 'Coach alone', 'all', mine, mine);
  grant select, insert, update, delete on public.coach_poll_people to authenticated;
  perform pg_temp.rule('coach_poll_people', 'Coach: own poll', 'all', mine,
    mine || ' and (select public.coach_owns_poll(poll_id)) and ' || own_profile);
  grant select, insert, update, delete on public.coach_poll_options to authenticated;
  perform pg_temp.rule('coach_poll_options', 'Coach: own poll', 'all', mine, mine || ' and (select public.coach_owns_poll(poll_id))');
  -- Votes: the coach reads; only poll_vote() writes.
  grant select on public.coach_poll_votes to authenticated;
  perform pg_temp.rule('coach_poll_votes', 'Coach: own poll, read', 'select',
    'exists (select 1 from public.coach_poll_options o where o.id = option_id and o.coach_id = (select public.my_coach_id()))');

  -- Calendar items: the coach's alone, pointing only at their own client,
  -- group, session, series and poll.
  grant select, insert, update, delete on public.coach_cal_items to authenticated;
  perform pg_temp.rule('coach_cal_items', 'Calendar: coach alone, read', 'select', mine);
  perform pg_temp.rule('coach_cal_items', 'Calendar: add', 'insert', null,
    mine || ' and ' || own_profile
         || ' and (group_id is null or (select public.coach_owns_group(group_id)))'
         || ' and (session_id is null or (select public.coach_owns_session(session_id)))'
         || ' and (series_id is null or (select public.coach_owns_cal_item(series_id)))'
         || ' and (travel_for is null or (select public.coach_owns_cal_item(travel_for)))'
         || ' and (poll_option_id is null or exists (select 1 from public.coach_poll_options o where o.id = poll_option_id and o.coach_id = (select public.my_coach_id())))');
  perform pg_temp.rule('coach_cal_items', 'Calendar: change', 'update', mine,
    mine || ' and ' || own_profile
         || ' and (group_id is null or (select public.coach_owns_group(group_id)))'
         || ' and (session_id is null or (select public.coach_owns_session(session_id)))'
         || ' and (series_id is null or (select public.coach_owns_cal_item(series_id)))'
         || ' and (travel_for is null or (select public.coach_owns_cal_item(travel_for)))'
         || ' and (poll_option_id is null or exists (select 1 from public.coach_poll_options o where o.id = poll_option_id and o.coach_id = (select public.my_coach_id())))');
  perform pg_temp.rule('coach_cal_items', 'Calendar: remove', 'delete', mine);

  grant select, insert, update, delete on public.coach_cal_guests to authenticated;
  perform pg_temp.rule('coach_cal_guests', 'Coach: own item', 'all', mine,
    mine || ' and (select public.coach_owns_cal_item(item_id)) and ' || own_profile);

  -- Bookings and reminder sends: the coach reads; only the functions and
  -- the email server write.
  grant select on public.coach_bookings to authenticated;
  perform pg_temp.rule('coach_bookings', 'Coach alone, read', 'select', mine);
  grant select on public.coach_cal_reminder_sends to authenticated;
  perform pg_temp.rule('coach_cal_reminder_sends', 'Coach alone, read', 'select', mine);
  -- coach_connections: no rule at all, so no person reads or writes a row.
end
$rules$;

grant select, insert, update, delete on public.coach_cal_reminder_sends to service_role;
grant select, insert, update, delete on public.coach_connections to service_role;
grant select, insert, update, delete on public.coach_cal_items to service_role;
grant select, insert, update, delete on public.coach_cal_guests to service_role;
grant select, update on public.coach_bookings to service_role;

-- ---------------------------------------------------------------- functions: the coach
-- The two call types every coach starts with, made the first time they are
-- asked for and never again: Chemistry Call and Connection Call, each with
-- its own page. Returns the coach's call types.
create or replace function public.coach_call_types_start()
returns setof public.coach_call_types
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_coach uuid := public.my_coach_id();
begin
  if v_coach is null then
    raise exception 'Only a coach can do this.' using errcode = '42501';
  end if;
  insert into public.coach_call_types (coach_id, key, name, minutes, notice_hours, ahead_weeks, position)
  values (v_coach, 'chemistry', 'Chemistry Call', 30, 24, 4, 0), (v_coach, 'connection', 'Connection Call', 30, 48, 2, 1)
  on conflict (coach_id, key) do nothing;
  return query select * from public.coach_call_types ct where ct.coach_id = v_coach order by ct.position, ct.created_at;
end;
$$;
revoke all on function public.coach_call_types_start() from public, anon;
grant execute on function public.coach_call_types_start() to authenticated;

-- A coach's own connections: whether each is on, the account it is, and
-- when it last synced. Never the token.
create or replace function public.coach_connections_mine()
returns table (service text, status text, account_label text, calendars jsonb, last_synced_at timestamptz, last_error text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.service, c.status, c.account_label, c.calendars, c.last_synced_at, c.last_error
  from public.coach_connections c where c.coach_id = public.my_coach_id();
$$;
revoke all on function public.coach_connections_mine() from public, anon;
grant execute on function public.coach_connections_mine() to authenticated;

-- ---------------------------------------------------------------- functions: a booking page and a single-use link
-- What a key opens: a call type's page or a single-use link, with the
-- numbers a booking needs. Never given to a page as it is.
create or replace function public._booking_target(p_key uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  t public.coach_call_types%rowtype;
  l public.coach_booking_links%rowtype;
  v_active boolean;
begin
  if p_key is null then return null; end if;
  select * into t from public.coach_call_types ct where ct.page_key = p_key;
  if found then
    select c.active into v_active from public.coaches c where c.id = t.coach_id;
    return jsonb_build_object('target', 'page', 'coach_id', t.coach_id, 'type_id', t.id, 'type_key', t.key, 'name', t.name,
      'description', t.description, 'minutes', t.minutes, 'gap_before', t.gap_before, 'gap_after', t.gap_after,
      'notice_hours', t.notice_hours, 'ahead_weeks', t.ahead_weeks, 'day_limit', t.day_limit, 'questions', t.questions,
      'place_kind', t.place_kind, 'source', 'open', 'makes_lead', t.makes_lead,
      'state', case when t.active and coalesce(v_active, false) then 'open' else 'closed' end);
  end if;
  select * into l from public.coach_booking_links bl where bl.key = p_key;
  if found then
    select c.active into v_active from public.coaches c where c.id = l.coach_id;
    return jsonb_build_object('target', 'link', 'coach_id', l.coach_id, 'link_id', l.id, 'profile_id', l.profile_id,
      'name', coalesce(nullif(btrim(l.call_name), ''), l.purpose), 'for_name', l.for_name, 'for_email', l.for_email,
      'minutes', l.minutes, 'gap_before', 15, 'gap_after', 15,
      'notice_hours', l.notice_hours, 'ahead_weeks', l.ahead_weeks, 'day_limit', 5, 'questions', '[]'::jsonb,
      'place_kind', l.place_kind, 'source', case when l.profile_id is null then 'open' else 'hours' end, 'makes_lead', l.profile_id is null,
      'state', case when l.revoked_at is not null or not coalesce(v_active, false) then 'closed'
                    when l.used_at is not null then 'used'
                    when l.expires_on is not null and l.expires_on < (now() at time zone public._cal_coach_zone(l.coach_id))::date then 'expired'
                    else 'open' end);
  end if;
  return null;
end;
$$;
revoke all on function public._booking_target(uuid) from public, anon, authenticated;

-- Anyone holding the key: what the page shows. Its own call only: never
-- the coach's other page, and nothing of the calendar.
-- state: open | closed | used | expired. Nothing at all for a key nobody has.
create or replace function public.booking_page(p_key uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'state', t.t ->> 'state', 'kind', t.t ->> 'target', 'name', t.t ->> 'name', 'description', t.t ->> 'description',
    'coach_first_name', (select c.display_first_name from public.coaches c where c.id = (t.t ->> 'coach_id')::uuid),
    'coach_time_zone', public._cal_coach_zone((t.t ->> 'coach_id')::uuid),
    'minutes', (t.t ->> 'minutes')::integer, 'place_kind', t.t ->> 'place_kind', 'questions', t.t -> 'questions',
    'notice_hours', (t.t ->> 'notice_hours')::integer, 'ahead_weeks', (t.t ->> 'ahead_weeks')::integer,
    'for_name', t.t ->> 'for_name')
  from (select public._booking_target(p_key) as t) t
  where t.t is not null;
$$;
revoke all on function public.booking_page(uuid) from public;
grant execute on function public.booking_page(uuid) to anon, authenticated;

-- The free starts for a page or a link between two instants (45 days at
-- most in one question). The page shows 07:00 to 20:00 in the visitor's own
-- time unless they chose "Show early and late times"; booking_make checks
-- that again.
create or replace function public.booking_free_times(p_key uuid, p_from timestamptz, p_to timestamptz)
returns table (starts_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  t jsonb := public._booking_target(p_key);
begin
  if t is null or t ->> 'state' <> 'open' then return; end if;
  return query
  select f from public._cal_free_times((t ->> 'coach_id')::uuid, t ->> 'source', (t ->> 'minutes')::integer,
    (t ->> 'gap_before')::integer, (t ->> 'gap_after')::integer, (t ->> 'notice_hours')::integer, (t ->> 'ahead_weeks')::integer,
    (t ->> 'day_limit')::integer, p_from, p_to, null, (t ->> 'type_id')::uuid) f;
end;
$$;
revoke all on function public.booking_free_times(uuid, timestamptz, timestamptz) from public;
grant execute on function public.booking_free_times(uuid, timestamptz, timestamptz) to anon, authenticated;

-- One coach's bookings are made one at a time, so two people racing for a
-- start never both get it.
create or replace function public._cal_lock(p_coach uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  select pg_advisory_xact_lock(hashtextextended('clarity-cal:' || p_coach::text, 0));
$$;
revoke all on function public._cal_lock(uuid) from public, anon, authenticated;

-- Is a start inside 07:00 to 20:00 in a zone (the whole call)?
create or replace function public._cal_sociable(p_start timestamptz, p_minutes integer, p_zone text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select (p_start at time zone p_zone)::time >= time '07:00'
     and (p_start at time zone p_zone)::date = ((p_start + make_interval(mins => p_minutes)) at time zone p_zone)::date
     and ((p_start + make_interval(mins => p_minutes)) at time zone p_zone)::time <= time '20:00';
$$;
revoke all on function public._cal_sociable(timestamptz, integer, text) from public, anon, authenticated;

-- Book it. Checks everything again, here, at the moment of booking, then
-- makes the calendar item, the booking and the lead in one go.
-- Returns { status, ... }:
--   booked     with guest_key (the guest's own key to move or cancel),
--              starts_at, ends_at, time_zone
--   taken      that start has just gone, or was never free
--   not_found | closed | used | expired      the page or link
--   name | email | zone | too_long | quarter | hours | too_many | full
-- 'hours': outside 07:00 to 20:00 in the booker's own time without
-- "Show early and late times". 'too_many': this email already holds 3
-- bookings to come with this coach. 'full': 30 bookings were made through
-- this coach's pages in the last 24 hours.
create or replace function public.booking_make(
  p_key uuid, p_start timestamptz, p_name text, p_email text, p_zone text,
  p_answers jsonb default '{}'::jsonb, p_early_late boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  t jsonb := public._booking_target(p_key);
  v_name text := btrim(coalesce(p_name, ''));
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_coach uuid;
  v_minutes integer;
  v_end timestamptz;
  v_item uuid := gen_random_uuid();
  v_booking uuid := gen_random_uuid();
  v_key uuid := gen_random_uuid();
  v_lead uuid;
  v_profile uuid;
  v_session uuid;
  v_kind text;
begin
  if t is null then return jsonb_build_object('status', 'not_found'); end if;
  if t ->> 'state' <> 'open' then return jsonb_build_object('status', t ->> 'state'); end if;
  if char_length(v_name) not between 1 and 120 then return jsonb_build_object('status', 'name'); end if;
  if v_email = '' or not public.one_email_ok(v_email) then return jsonb_build_object('status', 'email'); end if;
  if not public.zone_is_real(p_zone) then return jsonb_build_object('status', 'zone'); end if;
  if jsonb_typeof(coalesce(p_answers, '{}'::jsonb)) <> 'object' or pg_column_size(coalesce(p_answers, '{}'::jsonb)) > 20000 then
    return jsonb_build_object('status', 'too_long');
  end if;
  v_coach := (t ->> 'coach_id')::uuid;
  v_minutes := (t ->> 'minutes')::integer;
  -- A quarter hour in the booker's own time.
  if p_start is null or extract(minute from (p_start at time zone p_zone))::integer % 15 <> 0 or extract(second from p_start) <> 0 then
    return jsonb_build_object('status', 'quarter');
  end if;
  if not coalesce(p_early_late, false) and not public._cal_sociable(p_start, v_minutes, p_zone) then
    return jsonb_build_object('status', 'hours');
  end if;
  v_end := p_start + make_interval(mins => v_minutes);

  perform public._cal_lock(v_coach);
  if (select count(*) from public.coach_bookings b where b.coach_id = v_coach and b.status = 'booked'
        and lower(b.email) = v_email and b.starts_at > now()) >= 3 then
    return jsonb_build_object('status', 'too_many');
  end if;
  if (select count(*) from public.coach_bookings b where b.coach_id = v_coach and b.source in ('page', 'link')
        and b.created_at > now() - interval '24 hours') >= 30 then
    return jsonb_build_object('status', 'full');
  end if;
  if not exists (select 1 from public._cal_free_times(v_coach, t ->> 'source', v_minutes, (t ->> 'gap_before')::integer,
      (t ->> 'gap_after')::integer, (t ->> 'notice_hours')::integer, (t ->> 'ahead_weeks')::integer, (t ->> 'day_limit')::integer,
      p_start, v_end, null, (t ->> 'type_id')::uuid) f where f = p_start) then
    return jsonb_build_object('status', 'taken');
  end if;

  v_profile := (t ->> 'profile_id')::uuid;
  v_kind := case when v_profile is not null then 'client_call'
                 when t ->> 'type_key' = 'chemistry' then 'chemistry'
                 when t ->> 'type_key' = 'connection' then 'connection'
                 else 'other' end;
  perform set_config('clarity.booking', 'on', true);
  -- A link made for a client books one of their sessions.
  if v_profile is not null and v_minutes in (30, 60, 90) then
    v_session := gen_random_uuid();
    insert into public.coach_sessions (id, coach_id, profile_id, engagement_id, kind, starts_at, minutes)
    values (v_session, v_coach, v_profile,
            (select e.id from public.engagements e where e.profile_id = v_profile and e.coach_id = v_coach and e.status = 'active' order by e.created_at desc limit 1),
            'coaching', p_start, v_minutes);
  end if;
  insert into public.coach_cal_items (id, coach_id, kind, calendar, title, starts_at, ends_at, time_zone, place_kind, profile_id, session_id)
  values (v_item, v_coach, v_kind, 'work', v_name, p_start, v_end, p_zone, t ->> 'place_kind', v_profile, v_session);
  if coalesce((t ->> 'makes_lead')::boolean, false) then
    select l.id into v_lead from public.coach_leads l where l.coach_id = v_coach and lower(l.email) = v_email order by l.created_at limit 1;
    if v_lead is null then
      v_lead := gen_random_uuid();
      insert into public.coach_leads (id, coach_id, name, email, source, call_type_key, booking_id, time_zone, answers)
      values (v_lead, v_coach, v_name, v_email,
              case when t ->> 'target' = 'link' then 'single_use_link' when t ->> 'type_key' = 'chemistry' then 'chemistry_page'
                   when t ->> 'type_key' = 'connection' then 'connection_page' else 'booking_page' end,
              t ->> 'type_key', v_booking, p_zone, coalesce(p_answers, '{}'::jsonb));
    else
      update public.coach_leads set booking_id = v_booking where id = v_lead;
    end if;
  end if;
  insert into public.coach_bookings (id, coach_id, call_type_id, link_id, item_id, session_id, profile_id, lead_id, name, email,
                                     time_zone, starts_at, ends_at, answers, source, guest_key)
  values (v_booking, v_coach, (t ->> 'type_id')::uuid, (t ->> 'link_id')::uuid, v_item, v_session, v_profile, v_lead, v_name, v_email,
          p_zone, p_start, v_end, coalesce(p_answers, '{}'::jsonb), case when t ->> 'target' = 'link' then 'link' else 'page' end, v_key);
  if t ->> 'target' = 'link' then
    update public.coach_booking_links set used_at = now(), booking_id = v_booking where id = (t ->> 'link_id')::uuid;
  end if;
  perform set_config('clarity.booking', '', true);
  perform public._coach_notify(v_coach, 'booking', v_name || ' booked ' || (t ->> 'name'), null, 'booking', v_booking);
  return jsonb_build_object('status', 'booked', 'guest_key', v_key, 'starts_at', p_start, 'ends_at', v_end, 'time_zone', p_zone);
exception when unique_violation then
  perform set_config('clarity.booking', '', true);
  return jsonb_build_object('status', 'taken');
end;
$$;
revoke all on function public.booking_make(uuid, timestamptz, text, text, text, jsonb, boolean) from public;
grant execute on function public.booking_make(uuid, timestamptz, text, text, text, jsonb, boolean) to anon, authenticated;

-- The guest's own booking, by its own key: what the "move or cancel" page
-- shows. late: it starts in under 24 hours.
create or replace function public.booking_mine(p_guest_key uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'status', b.status, 'name', b.name, 'starts_at', b.starts_at, 'ends_at', b.ends_at, 'time_zone', b.time_zone,
    'call_name', coalesce(ct.name, nullif(btrim(l.call_name), ''), l.purpose, 'Call'),
    'coach_first_name', c.display_first_name,
    'place_kind', i.place_kind, 'meeting_link', i.meeting_link, 'location', i.location,
    'minutes', (extract(epoch from (b.ends_at - b.starts_at)) / 60)::integer,
    'notice_hours', coalesce(ct.notice_hours, l.notice_hours, 24), 'ahead_weeks', coalesce(ct.ahead_weeks, l.ahead_weeks, 4),
    'late', b.starts_at - now() < interval '24 hours', 'past', b.starts_at <= now())
  from public.coach_bookings b
  join public.coaches c on c.id = b.coach_id
  left join public.coach_call_types ct on ct.id = b.call_type_id
  left join public.coach_booking_links l on l.id = b.link_id
  left join public.coach_cal_items i on i.id = b.item_id
  where b.guest_key = p_guest_key and b.source in ('page', 'link');
$$;
revoke all on function public.booking_mine(uuid) from public;
grant execute on function public.booking_mine(uuid) to anon, authenticated;

-- The free starts a guest can move their booking to (its own time doesn't block it).
create or replace function public.booking_move_times(p_guest_key uuid, p_from timestamptz, p_to timestamptz)
returns table (starts_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  b public.coach_bookings%rowtype;
  ct public.coach_call_types%rowtype;
  l public.coach_booking_links%rowtype;
begin
  select * into b from public.coach_bookings x where x.guest_key = p_guest_key and x.source in ('page', 'link') and x.status = 'booked' and x.starts_at > now();
  if not found then return; end if;
  select * into ct from public.coach_call_types x where x.id = b.call_type_id;
  select * into l from public.coach_booking_links x where x.id = b.link_id;
  return query
  select f from public._cal_free_times(b.coach_id, case when b.profile_id is null then 'open' else 'hours' end,
    (extract(epoch from (b.ends_at - b.starts_at)) / 60)::integer, coalesce(ct.gap_before, 15), coalesce(ct.gap_after, 15),
    coalesce(ct.notice_hours, l.notice_hours, 24), coalesce(ct.ahead_weeks, l.ahead_weeks, 4), coalesce(ct.day_limit, 5),
    p_from, p_to, b.item_id, b.call_type_id) f;
end;
$$;
revoke all on function public.booking_move_times(uuid, timestamptz, timestamptz) from public;
grant execute on function public.booking_move_times(uuid, timestamptz, timestamptz) to anon, authenticated;

-- The guest moves their own booking. status: moved | taken | not_found |
-- quarter | hours. A booking that has started, or was cancelled, is not_found.
create or replace function public.booking_move(p_guest_key uuid, p_start timestamptz, p_early_late boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.coach_bookings%rowtype;
  v_minutes integer;
  v_end timestamptz;
begin
  select * into b from public.coach_bookings x where x.guest_key = p_guest_key and x.source in ('page', 'link');
  if not found or b.status <> 'booked' or b.starts_at <= now() then return jsonb_build_object('status', 'not_found'); end if;
  perform public._cal_lock(b.coach_id);
  select * into b from public.coach_bookings x where x.id = b.id for update;
  if b.status <> 'booked' then return jsonb_build_object('status', 'not_found'); end if;
  v_minutes := (extract(epoch from (b.ends_at - b.starts_at)) / 60)::integer;
  if p_start is null or extract(minute from (p_start at time zone b.time_zone))::integer % 15 <> 0 or extract(second from p_start) <> 0 then
    return jsonb_build_object('status', 'quarter');
  end if;
  if not coalesce(p_early_late, false) and not public._cal_sociable(p_start, v_minutes, b.time_zone) then
    return jsonb_build_object('status', 'hours');
  end if;
  v_end := p_start + make_interval(mins => v_minutes);
  if not exists (select 1 from public.booking_move_times(p_guest_key, p_start, v_end) f where f.starts_at = p_start) then
    return jsonb_build_object('status', 'taken');
  end if;
  perform set_config('clarity.booking', 'on', true);
  update public.coach_bookings set moved_from = b.starts_at, moved_at = now(), starts_at = p_start, ends_at = v_end where id = b.id;
  update public.coach_cal_items set starts_at = p_start, ends_at = v_end where id = b.item_id;
  update public.coach_sessions set starts_at = p_start where id = b.session_id and recap_sent_at is null;
  perform set_config('clarity.booking', '', true);
  perform public._coach_notify(b.coach_id, 'booking', b.name || ' moved their call', null, 'booking', b.id);
  return jsonb_build_object('status', 'moved', 'starts_at', p_start, 'ends_at', v_end, 'time_zone', b.time_zone);
exception when unique_violation then
  perform set_config('clarity.booking', '', true);
  return jsonb_build_object('status', 'taken');
end;
$$;
revoke all on function public.booking_move(uuid, timestamptz, boolean) from public;
grant execute on function public.booking_move(uuid, timestamptz, boolean) to anon, authenticated;

-- The guest cancels their own booking: its time is free again at once.
-- status: cancelled | not_found. late: it was under 24 hours away.
create or replace function public.booking_cancel(p_guest_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.coach_bookings%rowtype;
  v_late boolean;
begin
  select * into b from public.coach_bookings x where x.guest_key = p_guest_key and x.source in ('page', 'link') for update;
  if not found or b.status <> 'booked' or b.starts_at <= now() then return jsonb_build_object('status', 'not_found'); end if;
  v_late := b.starts_at - now() < interval '24 hours';
  perform set_config('clarity.booking', 'on', true);
  update public.coach_bookings set status = 'cancelled', cancelled_at = now(), late_cancel = v_late where id = b.id;
  delete from public.coach_cal_items where id = b.item_id;
  delete from public.coach_sessions where id = b.session_id and outcome is null and recap_sent_at is null;
  perform set_config('clarity.booking', '', true);
  perform public._coach_notify(b.coach_id, 'booking', b.name || ' cancelled their call', null, 'booking', b.id);
  return jsonb_build_object('status', 'cancelled', 'late', v_late);
end;
$$;
revoke all on function public.booking_cancel(uuid) from public;
grant execute on function public.booking_cancel(uuid) to anon, authenticated;

-- ---------------------------------------------------------------- functions: a poll
-- A person asked, by their own key: the poll, its times and their own
-- answers. Never anyone else's email or answers.
create or replace function public.poll_page(p_key uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'title', p.title, 'status', p.status, 'minutes', p.minutes, 'place_kind', p.place_kind,
    'coach_first_name', c.display_first_name, 'name', pp.name, 'time_zone', coalesce(pp.time_zone, p.time_zone),
    'voted', pp.voted_at is not null,
    'confirmed', (select jsonb_build_object('starts_at', o.starts_at, 'ends_at', o.ends_at) from public.coach_poll_options o where o.id = p.confirmed_option_id),
    'options', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'starts_at', o.starts_at, 'ends_at', o.ends_at,
                                            'can', (select v.can from public.coach_poll_votes v where v.option_id = o.id and v.person_id = pp.id))
                                          order by o.starts_at)
                         from public.coach_poll_options o where o.poll_id = p.id), '[]'::jsonb))
  from public.coach_poll_people pp
  join public.coach_polls p on p.id = pp.poll_id
  join public.coaches c on c.id = p.coach_id
  where pp.vote_key = p_key;
$$;
revoke all on function public.poll_page(uuid) from public;
grant execute on function public.poll_page(uuid) to anon, authenticated;

-- Their answers: { "<option id>": true | false, ... }. An answer can be
-- changed while the poll is open. Returns saved | closed | not_found | too_long.
create or replace function public.poll_vote(p_key uuid, p_votes jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  pp record;
  n integer;
begin
  select x.id, x.poll_id, x.name, x.voted_at, p.status, p.coach_id, p.title into pp
  from public.coach_poll_people x join public.coach_polls p on p.id = x.poll_id where x.vote_key = p_key;
  if not found then return 'not_found'; end if;
  if pp.status <> 'open' then return 'closed'; end if;
  if p_votes is null or jsonb_typeof(p_votes) <> 'object' or pg_column_size(p_votes) > 2000 then return 'too_long'; end if;
  insert into public.coach_poll_votes (option_id, person_id, can)
  select o.id, pp.id, (v.value #>> '{}')::boolean
  from jsonb_each(p_votes) v
  join public.coach_poll_options o on o.id::text = v.key and o.poll_id = pp.poll_id
  where jsonb_typeof(v.value) = 'boolean'
  on conflict (option_id, person_id) do update set can = excluded.can, voted_at = now();
  get diagnostics n = row_count;
  if n > 0 then
    update public.coach_poll_people set voted_at = now() where id = pp.id;
    if pp.voted_at is null then
      perform public._coach_notify(pp.coach_id, 'booking', pp.name || ' answered your poll', pp.title, 'poll', pp.poll_id);
    end if;
  end if;
  return 'saved';
end;
$$;
revoke all on function public.poll_vote(uuid, jsonb) from public;
grant execute on function public.poll_vote(uuid, jsonb) to anon, authenticated;

-- ---------------------------------------------------------------- functions: the client
-- The signed-in client's own profile with their coach: the coach, the
-- profile, their zone, and the engagement a session would count against.
create or replace function public._my_coaching()
returns table (profile_id uuid, coach_id uuid, name text, time_zone text, engagement_id uuid, minutes integer, sessions_total integer, sessions_held integer)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.coach_id, p.name, case when public.zone_is_real(p.time_zone) then p.time_zone else public._cal_coach_zone(p.coach_id) end,
         e.id, case when e.default_minutes in (30, 60, 90) then e.default_minutes else 60 end, e.sessions_total, e.sessions_held
  from public.client_profiles p
  join public.coaches c on c.id = p.coach_id and c.active
  left join lateral (select x.* from public.engagements x where x.profile_id = p.id and x.coach_id = p.coach_id and x.status = 'active'
                     order by x.created_at desc limit 1) e on true
  where p.user_id = (select auth.uid()) and p.merged_into is null and p.status <> 'past'
  limit 1;
$$;
revoke all on function public._my_coaching() from public, anon, authenticated;

-- The times the client's coach is free, from the coach's weekly hours less
-- anything busy. Never what the coach is busy with.
create or replace function public.my_booking_times(p_from timestamptz, p_to timestamptz, p_minutes integer default null)
returns table (starts_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  m record;
begin
  select * into m from public._my_coaching();
  if not found then return; end if;
  if p_minutes is not null and p_minutes not in (30, 60, 90) then return; end if;
  return query
  select f from public._cal_free_times(m.coach_id, 'hours', coalesce(p_minutes, m.minutes), 15, 15,
    public._cal_setting(m.coach_id, 'notice', 24, 0, 720), public._cal_setting(m.coach_id, 'ahead', 4, 1, 12), 5, p_from, p_to) f;
end;
$$;
revoke all on function public.my_booking_times(timestamptz, timestamptz, integer) from public, anon;
grant execute on function public.my_booking_times(timestamptz, timestamptz, integer) to authenticated;

-- The client's own sessions still to come. late: it starts in under 24
-- hours, so moving or cancelling it now uses the session.
create or replace function public.my_sessions_coming()
returns table (session_id uuid, starts_at timestamptz, minutes integer, time_zone text, place_kind text, meeting_link text,
               location text, coach_first_name text, late boolean, moved_in_google boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.starts_at, s.minutes, coalesce(i.time_zone, m.time_zone), i.place_kind, i.meeting_link, i.location,
         c.display_first_name, s.starts_at - now() < interval '24 hours', i.moved_in_google_at is not null
  from public._my_coaching() m
  join public.coach_sessions s on s.profile_id = m.profile_id and s.coach_id = m.coach_id
  join public.coaches c on c.id = s.coach_id
  left join public.coach_cal_items i on i.session_id = s.id
  where s.outcome is null and s.starts_at > now()
  order by s.starts_at
  limit 100;
$$;
revoke all on function public.my_sessions_coming() from public, anon;
grant execute on function public.my_sessions_coming() to authenticated;

-- The client books a session with their coach, inside their engagement.
-- status: booked (with session_id) | taken | quarter | no_coach |
-- none_left (every session of the engagement is held or booked).
create or replace function public.my_session_book(p_start timestamptz, p_minutes integer default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  m record;
  v_minutes integer;
  v_end timestamptz;
  v_session uuid := gen_random_uuid();
  v_item uuid := gen_random_uuid();
  v_booking uuid := gen_random_uuid();
begin
  select * into m from public._my_coaching();
  if not found then return jsonb_build_object('status', 'no_coach'); end if;
  v_minutes := coalesce(p_minutes, m.minutes);
  if v_minutes not in (30, 60, 90) then return jsonb_build_object('status', 'taken'); end if;
  if p_start is null or extract(minute from (p_start at time zone m.time_zone))::integer % 15 <> 0 or extract(second from p_start) <> 0 then
    return jsonb_build_object('status', 'quarter');
  end if;
  v_end := p_start + make_interval(mins => v_minutes);
  perform public._cal_lock(m.coach_id);
  if m.engagement_id is not null and m.sessions_total is not null
     and m.sessions_held + (select count(*) from public.coach_sessions s where s.engagement_id = m.engagement_id and s.outcome is null) >= m.sessions_total then
    return jsonb_build_object('status', 'none_left');
  end if;
  if not exists (select 1 from public.my_booking_times(p_start, v_end, v_minutes) f where f.starts_at = p_start) then
    return jsonb_build_object('status', 'taken');
  end if;
  perform set_config('clarity.booking', 'on', true);
  insert into public.coach_sessions (id, coach_id, profile_id, engagement_id, kind, starts_at, minutes)
  values (v_session, m.coach_id, m.profile_id, m.engagement_id, 'coaching', p_start, v_minutes);
  insert into public.coach_cal_items (id, coach_id, kind, calendar, title, starts_at, ends_at, time_zone, place_kind, profile_id, session_id)
  values (v_item, m.coach_id, 'client_call', 'work', m.name, p_start, v_end, m.time_zone, 'zoom', m.profile_id, v_session);
  insert into public.coach_bookings (id, coach_id, item_id, session_id, profile_id, name, time_zone, starts_at, ends_at, source)
  values (v_booking, m.coach_id, v_item, v_session, m.profile_id, m.name, m.time_zone, p_start, v_end, 'client');
  perform set_config('clarity.booking', '', true);
  perform public._coach_notify(m.coach_id, 'booking', m.name || ' booked a session', null, 'session', v_session);
  return jsonb_build_object('status', 'booked', 'session_id', v_session, 'starts_at', p_start, 'ends_at', v_end, 'time_zone', m.time_zone);
exception when unique_violation then
  perform set_config('clarity.booking', '', true);
  return jsonb_build_object('status', 'taken');
end;
$$;
revoke all on function public.my_session_book(timestamptz, integer) from public, anon;
grant execute on function public.my_session_book(timestamptz, integer) to authenticated;

-- The client moves one of their own sessions still to come.
-- With 24 hours or more to go it simply moves. With less, the answer is
-- { status: 'late', late: true } and nothing changes, so the page can show
-- the rule; asked again with p_late_ok, the old session is kept as a late
-- cancellation (it uses the session unless the coach waives it: 050) and a
-- new one is booked at the new time.
-- status: moved | late | taken | quarter | not_found.
create or replace function public.my_session_move(p_session uuid, p_start timestamptz, p_late_ok boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  m record;
  s public.coach_sessions%rowtype;
  v_item uuid;
  v_late boolean;
  v_end timestamptz;
  v_new uuid := gen_random_uuid();
  v_new_item uuid := gen_random_uuid();
begin
  select * into m from public._my_coaching();
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  perform public._cal_lock(m.coach_id);
  select * into s from public.coach_sessions x
  where x.id = p_session and x.profile_id = m.profile_id and x.coach_id = m.coach_id and x.outcome is null and x.starts_at > now() for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  v_late := s.starts_at - now() < interval '24 hours';
  if v_late and not coalesce(p_late_ok, false) then return jsonb_build_object('status', 'late', 'late', true); end if;
  if p_start is null or extract(minute from (p_start at time zone m.time_zone))::integer % 15 <> 0 or extract(second from p_start) <> 0 then
    return jsonb_build_object('status', 'quarter');
  end if;
  v_end := p_start + make_interval(mins => s.minutes);
  select i.id into v_item from public.coach_cal_items i where i.session_id = s.id;
  if not exists (select 1 from public._cal_free_times(m.coach_id, 'hours', s.minutes, 15, 15,
      public._cal_setting(m.coach_id, 'notice', 24, 0, 720), public._cal_setting(m.coach_id, 'ahead', 4, 1, 12), 5, p_start, v_end, v_item) f
      where f = p_start) then
    return jsonb_build_object('status', 'taken');
  end if;
  perform set_config('clarity.booking', 'on', true);
  if v_late then
    update public.coach_sessions set outcome = 'late_cancel', written_up_at = now() where id = s.id;
    update public.coach_bookings set status = 'cancelled', cancelled_at = now(), late_cancel = true where session_id = s.id and status = 'booked';
    delete from public.coach_cal_items where id = v_item;
    insert into public.coach_sessions (id, coach_id, profile_id, engagement_id, kind, starts_at, minutes)
    values (v_new, s.coach_id, s.profile_id, s.engagement_id, s.kind, p_start, s.minutes);
    insert into public.coach_cal_items (id, coach_id, kind, calendar, title, starts_at, ends_at, time_zone, place_kind, profile_id, session_id)
    values (v_new_item, s.coach_id, 'client_call', 'work', m.name, p_start, v_end, m.time_zone, 'zoom', s.profile_id, v_new);
    insert into public.coach_bookings (coach_id, item_id, session_id, profile_id, name, time_zone, starts_at, ends_at, source, moved_from, moved_at)
    values (s.coach_id, v_new_item, v_new, s.profile_id, m.name, m.time_zone, p_start, v_end, 'client', s.starts_at, now());
  else
    v_new := s.id;
    update public.coach_sessions set starts_at = p_start where id = s.id;
    update public.coach_cal_items set starts_at = p_start, ends_at = v_end where id = v_item;
    update public.coach_bookings set moved_from = starts_at, moved_at = now(), starts_at = p_start, ends_at = v_end where session_id = s.id and status = 'booked';
  end if;
  perform set_config('clarity.booking', '', true);
  perform public._coach_notify(m.coach_id, 'booking', m.name || ' moved a session', case when v_late then 'With under 24 hours’ notice.' end, 'session', v_new);
  return jsonb_build_object('status', 'moved', 'late', v_late, 'session_id', v_new, 'starts_at', p_start, 'ends_at', v_end);
exception when unique_violation then
  perform set_config('clarity.booking', '', true);
  return jsonb_build_object('status', 'taken');
end;
$$;
revoke all on function public.my_session_move(uuid, timestamptz, boolean) from public, anon;
grant execute on function public.my_session_move(uuid, timestamptz, boolean) to authenticated;

-- The client cancels one of their own sessions still to come. The same
-- late rule: under 24 hours it answers 'late' first, and going on keeps the
-- session as a late cancellation. With more notice it is simply taken off.
-- status: cancelled | late | not_found.
create or replace function public.my_session_cancel(p_session uuid, p_late_ok boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  m record;
  s public.coach_sessions%rowtype;
  v_late boolean;
begin
  select * into m from public._my_coaching();
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  select * into s from public.coach_sessions x
  where x.id = p_session and x.profile_id = m.profile_id and x.coach_id = m.coach_id and x.outcome is null and x.starts_at > now() for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  v_late := s.starts_at - now() < interval '24 hours';
  if v_late and not coalesce(p_late_ok, false) then return jsonb_build_object('status', 'late', 'late', true); end if;
  perform set_config('clarity.booking', 'on', true);
  update public.coach_bookings set status = 'cancelled', cancelled_at = now(), late_cancel = v_late where session_id = s.id and status = 'booked';
  delete from public.coach_cal_items where session_id = s.id;
  if v_late then
    update public.coach_sessions set outcome = 'late_cancel', written_up_at = now() where id = s.id;
  else
    delete from public.coach_sessions where id = s.id;
  end if;
  perform set_config('clarity.booking', '', true);
  perform public._coach_notify(m.coach_id, 'booking', m.name || ' cancelled a session', case when v_late then 'With under 24 hours’ notice.' end, 'session', s.id);
  return jsonb_build_object('status', 'cancelled', 'late', v_late);
end;
$$;
revoke all on function public.my_session_cancel(uuid, boolean) from public, anon;
grant execute on function public.my_session_cancel(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------- functions: the email server
-- The calls starting in the next 36 hours whose reminders may be due, one
-- row a call and kind not yet sent, with what the server needs to decide
-- the moment (in the reader's own time: src/lib/time/reminders.js) and to
-- write the email. Only the email server (the service role) may call it.
create or replace function public.cal_reminders_coming(p_now timestamptz default now())
returns table (item_id uuid, coach_id uuid, kind text, occurrence_at timestamptz, ends_at timestamptz, time_zone text, title text,
               place_kind text, meeting_link text, location text, coach_first_name text,
               person_name text, person_email text, person_zone text, frequent_traveller boolean, guest_key uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, i.coach_id, k.kind, o.starts_at, o.ends_at, i.time_zone, i.title, i.place_kind, i.meeting_link, i.location,
         c.display_first_name,
         coalesce(p.name, b.name), coalesce(p.email, b.email), coalesce(p.time_zone, b.time_zone, i.time_zone),
         coalesce(p.frequent_traveller, false), b.guest_key
  from public.coaches c
  cross join lateral public._cal_occurrences(c.id, p_now, p_now + interval '36 hours') o
  join public.coach_cal_items i on i.id = o.item_id
  left join public.client_profiles p on p.id = i.profile_id
  left join public.coach_bookings b on b.item_id = i.id and b.status = 'booked'
  cross join (values ('day_before'), ('hour_before')) k(kind)
  where c.active and o.is_call and o.starts_at > p_now
    and coalesce(p.email, b.email) is not null
    and (case k.kind when 'day_before' then coalesce(((select s.booking -> 'remind_24' from public.coach_settings s where s.coach_id = c.id) #>> '{}'), 'true') <> 'false'
                     else coalesce(((select s.booking -> 'remind_1' from public.coach_settings s where s.coach_id = c.id) #>> '{}'), 'false') = 'true' end)
    and not exists (select 1 from public.coach_away a where a.coach_id = c.id and (p_now at time zone 'UTC')::date between a.starts_on and a.ends_on)
    and not exists (select 1 from public.coach_cal_reminder_sends r where r.item_id = i.id and r.kind = k.kind and r.occurrence_at = o.starts_at);
$$;
revoke all on function public.cal_reminders_coming(timestamptz) from public, anon, authenticated;
grant execute on function public.cal_reminders_coming(timestamptz) to service_role;

-- Records a reminder, once: false when that kind had already gone for that
-- time of the item, so two servers never both send it. Called BEFORE sending.
create or replace function public.cal_reminder_claim(p_item uuid, p_kind text, p_occurrence timestamptz, p_people integer default 1)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.coach_cal_reminder_sends (item_id, coach_id, kind, occurrence_at, people)
  select i.id, i.coach_id, p_kind, p_occurrence, greatest(0, least(5000, coalesce(p_people, 0)))
  from public.coach_cal_items i where i.id = p_item
  on conflict (item_id, kind, occurrence_at) do nothing;
  return found;
end;
$$;
revoke all on function public.cal_reminder_claim(uuid, text, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.cal_reminder_claim(uuid, text, timestamptz, integer) to service_role;

-- ---------------------------------------------------------------- record it
do $log$
begin
  if to_regprocedure('public.record_migration(integer,text)') is not null then
    perform public.record_migration(51, '051_coach_calendar');
  end if;
end
$log$;
