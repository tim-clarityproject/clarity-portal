-- =============================================================================
-- 050_coach_day.sql
-- Phase 6a run 2 (M11 Coach portal, seq 77; Tim, 19 Nov 2026): the data under
-- the coaching day in Clarity Coach.
--
-- WHAT IT ADDS (nothing older is changed, apart from the two additions named
-- under "OLDER THINGS IT TOUCHES")
--   Coach to-dos (the coach's own, never the client's `todos`):
--     coach_todo_lists      a list ("Kestrel renewal"), for a client or an
--                           organisation if the coach likes, finished or not
--     coach_todo_headings   a list's headings
--     coach_todos           title, notes, Important, the planned day and time,
--                           the deadline, how long it takes (15 minutes to 8
--                           hours, in 15-minute steps), its list and heading,
--                           the client it belongs to (a lead's id waits for the
--                           CRM, 052), repeating as a rule, the reminder
--                           switch, done at, someday, after work, its order, a
--                           checklist, and the forwarded email it came from
--                           (sender and subject). No limit on how many. Tags
--                           are 049's own (coach_tag_links, kind 'todo').
--   Today:
--     coach_days            one row a coach and day: the morning plan's chosen
--                           to-dos in order, when it was planned, the evening
--                           shutdown's answers and when the day was closed
--     coach_weeks           one row a coach and week (its Monday): the energy
--                           rating (five words, Poor to Excellent) and the
--                           Friday weekly review's answers
--   Sessions:
--     coach_sessions        a session with a client or a group: when, how
--                           long (30, 60 or 90 minutes), what happened (it went
--                           ahead, a late cancellation with Waive it, a
--                           no-show, moved), the typed recap, sent at and by
--     coach_session_people  a group session's members whose session counts
--                           against their own engagement
--     coach_session_actions the recap's actions, each going to the client's
--                           this week or Backlog, and whether it is done
--     coach_session_notes   the coach's private notes (Focus, Insight, Next
--                           time) and For supervision: the coach's alone
--     session_prep          the client's own note for their next session
--                           ("For next time"), seen in the brief as
--                           "For this call"
--   Workshops:
--     workshop_sends        what has been sent for a workshop and when (the
--                           day-before and 1-hour reminders, the follow-up,
--                           the survey), so nothing is ever sent twice
--   Settings:
--     coach_settings.hidden_help   the explanations a coach chose
--                                  "Don't show me this again" for
--
-- WHO SEES WHAT
--   - A coach's to-dos, lists, days and weeks are theirs alone: no other
--     coach, the owner included, reads a row.
--   - A session's row (when, how long, what happened, the recap) is its
--     coach's. An associate's session content is never the owner's to read:
--     the owner sees only the engagement's count (049's admin facts).
--   - Private notes and For supervision are the coach's alone.
--   - A recap reaches the client only once sent, and only through
--     my_session_recaps(): a client reads no session table.
--   - session_prep is the client's own; their current coach reads it.
--
-- SESSIONS LEFT
--   engagements.sessions_held is now kept by the database: the count the
--   coach had before sessions were recorded (sessions_held_base, copied once
--   from sessions_held) plus every session that counts. A session counts
--   when it went ahead, was a no-show, or was cancelled late and not waived;
--   a moved one never counts. A coach who types a new count still can: the
--   base moves so the total is what they typed.
--
-- OLDER THINGS IT TOUCHES
--   - engagements gains sessions_held_base, and a trigger keeps
--     sessions_held as described above.
--   - coach_settings gains hidden_help.
--
-- Additive and safe to run twice. Needs 049 (it stops with a clear message
-- without it). Test: supabase/050_coach_day_test.sql.
-- =============================================================================

do $need$
begin
  if to_regclass('public.client_profiles') is null or to_regprocedure('public.my_coach_id()') is null
     or to_regprocedure('public.coach_owns_profile(uuid)') is null or to_regclass('public.engagements') is null then
    raise exception '050 needs 049 first (public.client_profiles, public.engagements, public.my_coach_id and public.coach_owns_profile).';
  end if;
end
$need$;

-- ---------------------------------------------------------------- shared bits
-- How long something takes: 15 minutes to 8 hours, in 15-minute steps.
create or replace function public.coach_minutes_ok(p_minutes integer)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_minutes is null or (p_minutes between 15 and 480 and p_minutes % 15 = 0);
$$;

-- A repeat is a rule, never a list of dates:
--   { "every": "day" | "weekday" | "week" | "month" | "year", "interval": 1..52,
--     "weekdays": [0..6] (week only), "until": "YYYY-MM-DD" (optional) }
create or replace function public.coach_repeat_ok(p_rule jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  d jsonb;
begin
  if p_rule is null then return true; end if;
  if jsonb_typeof(p_rule) <> 'object' or pg_column_size(p_rule) > 512 then return false; end if;
  if coalesce(p_rule ->> 'every', '') not in ('day', 'weekday', 'week', 'month', 'year') then return false; end if;
  if p_rule ? 'interval' and (jsonb_typeof(p_rule -> 'interval') <> 'number' or (p_rule ->> 'interval')::numeric not between 1 and 52
     or (p_rule ->> 'interval')::numeric <> trunc((p_rule ->> 'interval')::numeric)) then return false; end if;
  if p_rule ? 'weekdays' then
    if jsonb_typeof(p_rule -> 'weekdays') <> 'array' or jsonb_array_length(p_rule -> 'weekdays') > 7 then return false; end if;
    for d in select * from jsonb_array_elements(p_rule -> 'weekdays') loop
      if jsonb_typeof(d) <> 'number' or d::text not in ('0', '1', '2', '3', '4', '5', '6') then return false; end if;
    end loop;
  end if;
  if p_rule ? 'until' and (jsonb_typeof(p_rule -> 'until') <> 'string' or (p_rule ->> 'until') !~ '^\d{4}-\d{2}-\d{2}$') then return false; end if;
  return true;
end;
$$;

-- A to-do's checklist: up to 50 items, each { "text": 1 to 200 characters, "done": true | false }.
create or replace function public.coach_checklist_ok(p_list jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  i jsonb;
begin
  if p_list is null then return true; end if;
  if jsonb_typeof(p_list) <> 'array' or jsonb_array_length(p_list) > 50 then return false; end if;
  for i in select * from jsonb_array_elements(p_list) loop
    if jsonb_typeof(i) <> 'object' or coalesce(jsonb_typeof(i -> 'text'), '') <> 'string' or char_length(btrim(i ->> 'text')) not between 1 and 200
       or jsonb_typeof(coalesce(i -> 'done', 'false'::jsonb)) <> 'boolean' then return false; end if;
  end loop;
  return true;
end;
$$;

-- ---------------------------------------------------------------- coach to-dos
create table if not exists public.coach_todo_lists (
  id               uuid primary key default gen_random_uuid(),
  coach_id         uuid not null references public.coaches (id) on delete cascade,
  name             text not null check (char_length(btrim(name)) between 1 and 80),
  profile_id       uuid references public.client_profiles (id) on delete set null,
  organisation_id  uuid references public.organisations (id) on delete set null,
  position         integer not null default 0,
  finished_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
comment on table public.coach_todo_lists is 'A coach''s own to-do list ("Kestrel renewal"), with headings. The coach''s alone.';
create index if not exists coach_todo_lists_coach_idx on public.coach_todo_lists (coach_id, position);
create index if not exists coach_todo_lists_profile_idx on public.coach_todo_lists (profile_id);
create index if not exists coach_todo_lists_org_idx on public.coach_todo_lists (organisation_id);

create or replace function public.coach_owns_todo_list(p_list uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.coach_todo_lists l where l.id = p_list and l.coach_id = public.my_coach_id());
$$;
revoke all on function public.coach_owns_todo_list(uuid) from public, anon;
grant execute on function public.coach_owns_todo_list(uuid) to authenticated;

create table if not exists public.coach_todo_headings (
  id          uuid primary key default gen_random_uuid(),
  list_id     uuid not null references public.coach_todo_lists (id) on delete cascade,
  coach_id    uuid not null references public.coaches (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 80),
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists coach_todo_headings_list_idx on public.coach_todo_headings (list_id, position);
create index if not exists coach_todo_headings_coach_idx on public.coach_todo_headings (coach_id);

create table if not exists public.coach_todos (
  id                  uuid primary key default gen_random_uuid(),
  coach_id            uuid not null references public.coaches (id) on delete cascade,
  title               text not null check (char_length(btrim(title)) between 1 and 300),
  notes               text check (char_length(notes) <= 4000),
  important           boolean not null default false,
  planned_on          date,
  planned_time        time,
  first_planned_on    date,
  due_on              date,
  minutes             integer check (public.coach_minutes_ok(minutes)),
  list_id             uuid references public.coach_todo_lists (id) on delete set null,
  heading_id          uuid references public.coach_todo_headings (id) on delete set null,
  profile_id          uuid references public.client_profiles (id) on delete set null,
  lead_id             uuid,
  repeat_rule         jsonb check (public.coach_repeat_ok(repeat_rule)),
  repeat_of           uuid,
  remind              boolean not null default false,
  someday             boolean not null default false,
  after_work          boolean not null default false,
  checklist           jsonb not null default '[]'::jsonb check (public.coach_checklist_ok(checklist)),
  position            double precision not null default 0,
  done_at             timestamptz,
  from_email_sender   text check (char_length(from_email_sender) <= 200),
  from_email_subject  text check (char_length(from_email_subject) <= 300),
  from_email_at       timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (planned_time is null or planned_on is not null),
  check (not (someday and planned_on is not null))
);
comment on table public.coach_todos is
  'A coach''s own to-do (never the client''s todos). planned_on and planned_time are when the coach will do it; due_on is the deadline; first_planned_on is the day it was first planned for, so a carried-over one reads "From Fri 13 Nov". repeat_rule is a rule; ticking a repeating one makes the next (repeat_of names the one it follows). lead_id waits for the CRM (052).';
create index if not exists coach_todos_coach_day_idx on public.coach_todos (coach_id, planned_on) where done_at is null;
create index if not exists coach_todos_coach_done_idx on public.coach_todos (coach_id, done_at desc) where done_at is not null;
create index if not exists coach_todos_list_idx on public.coach_todos (list_id);
create index if not exists coach_todos_heading_idx on public.coach_todos (heading_id);
create index if not exists coach_todos_profile_idx on public.coach_todos (profile_id);

-- ---------------------------------------------------------------- Today
create table if not exists public.coach_days (
  coach_id     uuid not null references public.coaches (id) on delete cascade,
  day          date not null,
  plan_todos   uuid[] not null default '{}'::uuid[] check (cardinality(plan_todos) <= 500),
  planned_at   timestamptz,
  plan_skipped boolean not null default false,
  shutdown     jsonb not null default '{}'::jsonb check (jsonb_typeof(shutdown) = 'object' and pg_column_size(shutdown) <= 8192),
  closed_at    timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (coach_id, day)
);
comment on table public.coach_days is
  'A coach''s day: the morning plan''s chosen to-dos in order, when it was planned (or Not now), the evening shutdown''s answers and when the day was closed. The coach''s alone.';

create table if not exists public.coach_weeks (
  coach_id     uuid not null references public.coaches (id) on delete cascade,
  week_start   date not null check (extract(isodow from week_start) = 1),
  energy       text check (energy in ('poor', 'fair', 'good', 'very_good', 'excellent')),
  energy_at    timestamptz,
  review       jsonb not null default '{}'::jsonb check (jsonb_typeof(review) = 'object' and pg_column_size(review) <= 8192),
  reviewed_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (coach_id, week_start)
);
comment on table public.coach_weeks is
  'A coach''s week (its Monday): the capacity check, "Rate my energy" (Poor, Fair, Good, Very good, Excellent), and the Friday weekly review''s answers. Private to each coach: the owner never reads an associate''s.';

-- ---------------------------------------------------------------- sessions
create table if not exists public.coach_sessions (
  id              uuid primary key default gen_random_uuid(),
  coach_id        uuid not null references public.coaches (id) on delete restrict,
  profile_id      uuid references public.client_profiles (id) on delete cascade,
  group_id        uuid references public.coach_groups (id) on delete cascade,
  engagement_id   uuid references public.engagements (id) on delete set null,
  kind            text not null default 'coaching' check (kind in ('coaching', 'group', 'three_way', 'review', 'chemistry', 'other')),
  starts_at       timestamptz not null,
  minutes         integer not null default 60 check (minutes in (30, 60, 90)),
  place           text check (char_length(place) <= 120),
  outcome         text check (outcome in ('held', 'late_cancel', 'no_show', 'moved')),
  waived          boolean not null default false,
  moved_to        timestamptz,
  written_up_at   timestamptz,
  recap           text check (char_length(recap) <= 12000),
  recap_sent_at   timestamptz,
  recap_sent_by   uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check ((profile_id is not null) <> (group_id is not null)),
  check (not waived or outcome = 'late_cancel'),
  check (moved_to is null or outcome = 'moved')
);
comment on table public.coach_sessions is
  'A session with a client or a group. outcome is empty until the coach writes it up. The recap is typed and reaches the client only once sent (recap_sent_at), through my_session_recaps(). Its coach''s alone: the owner never reads an associate''s.';
create index if not exists coach_sessions_coach_idx on public.coach_sessions (coach_id, starts_at desc);
create index if not exists coach_sessions_profile_idx on public.coach_sessions (profile_id, starts_at desc);
create index if not exists coach_sessions_group_idx on public.coach_sessions (group_id, starts_at desc);
create index if not exists coach_sessions_engagement_idx on public.coach_sessions (engagement_id);
create index if not exists coach_sessions_sent_by_idx on public.coach_sessions (recap_sent_by);

create or replace function public.coach_owns_session(p_session uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.coach_sessions s where s.id = p_session and s.coach_id = public.my_coach_id());
$$;
revoke all on function public.coach_owns_session(uuid) from public, anon;
grant execute on function public.coach_owns_session(uuid) to authenticated;

create table if not exists public.coach_session_people (
  session_id     uuid not null references public.coach_sessions (id) on delete cascade,
  profile_id     uuid not null references public.client_profiles (id) on delete cascade,
  engagement_id  uuid references public.engagements (id) on delete set null,
  created_at     timestamptz not null default now(),
  primary key (session_id, profile_id)
);
comment on table public.coach_session_people is
  'A group session''s members whose session counts against their own engagement (049''s counts_against = own).';
create index if not exists coach_session_people_profile_idx on public.coach_session_people (profile_id);
create index if not exists coach_session_people_engagement_idx on public.coach_session_people (engagement_id);

create table if not exists public.coach_session_actions (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.coach_sessions (id) on delete cascade,
  coach_id    uuid not null references public.coaches (id) on delete cascade,
  title       text not null check (char_length(btrim(title)) between 1 and 300),
  send        boolean not null default true,
  goes_to     text not null default 'week' check (goes_to in ('week', 'backlog')),
  position    integer not null default 0,
  done_at     timestamptz,
  placed_at   timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.coach_session_actions is
  'A recap''s actions. send: it goes to the client with the recap. goes_to: the client''s this week or Backlog. done_at: Done in the next brief''s From last time. placed_at: the client has added it to their to-dos.';
create index if not exists coach_session_actions_session_idx on public.coach_session_actions (session_id, position);
create index if not exists coach_session_actions_coach_idx on public.coach_session_actions (coach_id);

create table if not exists public.coach_session_notes (
  session_id   uuid primary key references public.coach_sessions (id) on delete cascade,
  coach_id     uuid not null references public.coaches (id) on delete cascade,
  layout       text not null default 'regular' check (char_length(layout) <= 40),
  focus        text check (char_length(focus) <= 6000),
  insight      text check (char_length(insight) <= 6000),
  next_time    text check (char_length(next_time) <= 6000),
  supervision  text check (char_length(supervision) <= 6000),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on table public.coach_session_notes is
  'A session''s private notes (Focus, Insight, Next time) and For supervision. The coach''s alone: no other coach, the owner included, and never the client.';
create index if not exists coach_session_notes_coach_idx on public.coach_session_notes (coach_id);

create table if not exists public.session_prep (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  body        text not null check (char_length(btrim(body)) between 1 and 2000),
  noted_at    timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.session_prep is
  'For next time: a client''s own note for their next session, seen by their coach in the brief as "For this call". One at a time; the client clears or rewrites it.';

-- ---------------------------------------------------------------- workshops: what has been sent
create table if not exists public.workshop_sends (
  id           uuid primary key default gen_random_uuid(),
  workshop_id  uuid not null references public.workshops (id) on delete cascade,
  kind         text not null check (kind in ('day_before', 'hour_before', 'follow_up', 'survey')),
  sent_at      timestamptz not null default now(),
  people       integer not null default 0 check (people between 0 and 5000),
  sent_by      uuid references auth.users (id) on delete set null,
  unique (workshop_id, kind)
);
comment on table public.workshop_sends is
  'What has been sent for a workshop, once each: the two reminders, the follow-up and the survey. Written only by the email server (the service role); its coach reads it.';
create index if not exists workshop_sends_sent_by_idx on public.workshop_sends (sent_by);

-- ---------------------------------------------------------------- settings
alter table public.coach_settings add column if not exists hidden_help jsonb not null default '{}'::jsonb;
do $c$
begin
  if not exists (select 1 from pg_constraint where conname = 'coach_settings_hidden_help_shape') then
    alter table public.coach_settings add constraint coach_settings_hidden_help_shape
      check (jsonb_typeof(hidden_help) = 'object' and pg_column_size(hidden_help) <= 4096);
  end if;
end
$c$;
comment on column public.coach_settings.hidden_help is
  'The explanations this coach chose "Don''t show me this again" for ({ key: true }). Settings, Look shows them again.';

-- ---------------------------------------------------------------- sessions left
alter table public.engagements add column if not exists sessions_held_base integer;
update public.engagements set sessions_held_base = sessions_held where sessions_held_base is null;
alter table public.engagements alter column sessions_held_base set default 0;
alter table public.engagements alter column sessions_held_base set not null;
comment on column public.engagements.sessions_held_base is
  'The sessions held before sessions were recorded one by one (050). sessions_held is this plus every recorded session that counts.';

-- Does a session count as one of the engagement's?
create or replace function public.session_counts(p_outcome text, p_waived boolean)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_outcome in ('held', 'no_show') or (p_outcome = 'late_cancel' and not coalesce(p_waived, false)), false);
$$;

create or replace function public._engagement_recorded(p_engagement uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select (
    (select count(*) from public.coach_sessions s
     where s.engagement_id = p_engagement and public.session_counts(s.outcome, s.waived))
    + (select count(*) from public.coach_session_people sp join public.coach_sessions s on s.id = sp.session_id
       where sp.engagement_id = p_engagement and public.session_counts(s.outcome, s.waived))
  )::integer;
$$;
revoke all on function public._engagement_recorded(uuid) from public, anon, authenticated;

create or replace function public._engagement_recount(p_engagement uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_engagement is null then return; end if;
  perform set_config('clarity.recounting', 'on', true);
  update public.engagements e
  set sessions_held = least(1000, greatest(0, e.sessions_held_base + public._engagement_recorded(e.id)))
  where e.id = p_engagement;
  perform set_config('clarity.recounting', '', true);
end;
$$;
revoke all on function public._engagement_recount(uuid) from public, anon, authenticated;

-- A coach who types a new count still can: the base moves, so the total
-- stays what they typed however many sessions are recorded.
create or replace function public.engagements_held_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('clarity.recounting', true), '') = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.sessions_held_base := coalesce(new.sessions_held, 0);
    return new;
  end if;
  if new.sessions_held is distinct from old.sessions_held then
    new.sessions_held_base := new.sessions_held - public._engagement_recorded(new.id);
  else
    new.sessions_held_base := old.sessions_held_base;
  end if;
  return new;
end;
$$;
revoke all on function public.engagements_held_guard() from public, anon, authenticated;
drop trigger if exists engagements_held_guard on public.engagements;
create trigger engagements_held_guard before insert or update on public.engagements
  for each row execute function public.engagements_held_guard();

create or replace function public.coach_sessions_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  e uuid;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public._engagement_recount(old.engagement_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    if tg_op = 'INSERT' or new.engagement_id is distinct from old.engagement_id then
      perform public._engagement_recount(new.engagement_id);
    end if;
    -- A group session's own-engagement members follow what happened to it.
    for e in select sp.engagement_id from public.coach_session_people sp where sp.session_id = new.id and sp.engagement_id is not null loop
      perform public._engagement_recount(e);
    end loop;
  end if;
  return null;
end;
$$;
revoke all on function public.coach_sessions_count() from public, anon, authenticated;
drop trigger if exists coach_sessions_count on public.coach_sessions;
create trigger coach_sessions_count after insert or update of outcome, waived, engagement_id or delete on public.coach_sessions
  for each row execute function public.coach_sessions_count();

create or replace function public.coach_session_people_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then perform public._engagement_recount(old.engagement_id); end if;
  if tg_op in ('INSERT', 'UPDATE') then perform public._engagement_recount(new.engagement_id); end if;
  return null;
end;
$$;
revoke all on function public.coach_session_people_count() from public, anon, authenticated;
drop trigger if exists coach_session_people_count on public.coach_session_people;
create trigger coach_session_people_count after insert or update or delete on public.coach_session_people
  for each row execute function public.coach_session_people_count();

-- A session's rows can only point at the coach's own client, group and
-- engagement, and what was sent is never unsent or rewritten by a plain save.
create or replace function public.coach_sessions_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('clarity.sending', true), '') = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.recap_sent_at := null; new.recap_sent_by := null;
    return new;
  end if;
  new.coach_id := old.coach_id;
  new.recap_sent_at := old.recap_sent_at; new.recap_sent_by := old.recap_sent_by;
  if old.recap_sent_at is not null then
    -- Once sent, what the client was given stays as it was sent: the recap,
    -- that it went ahead, and when it was. (A session moved afterwards is a
    -- new session; this one keeps its recap.)
    new.recap := old.recap; new.outcome := old.outcome; new.waived := old.waived; new.moved_to := old.moved_to;
    new.starts_at := old.starts_at; new.profile_id := old.profile_id; new.group_id := old.group_id;
  end if;
  return new;
end;
$$;
revoke all on function public.coach_sessions_guard() from public, anon, authenticated;
drop trigger if exists coach_sessions_guard on public.coach_sessions;
create trigger coach_sessions_guard before insert or update on public.coach_sessions
  for each row execute function public.coach_sessions_guard();

-- Once a recap is sent, the actions that went with it stay as they were
-- sent: none is added to it, reworded, unticked or taken away. Done and
-- "added to my to-dos" still change (the client marks those).
create or replace function public.coach_session_actions_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sent boolean;
begin
  select s.recap_sent_at is not null into v_sent from public.coach_sessions s
  where s.id = (case when tg_op = 'DELETE' then old.session_id else new.session_id end);
  if not coalesce(v_sent, false) then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.send := false;
    return new;
  end if;
  if tg_op = 'DELETE' then
    if old.send then
      raise exception 'This action went with the recap, so it stays.' using errcode = '22023';
    end if;
    return old;
  end if;
  new.session_id := old.session_id; new.title := old.title; new.send := old.send; new.goes_to := old.goes_to;
  return new;
end;
$$;
revoke all on function public.coach_session_actions_guard() from public, anon, authenticated;
drop trigger if exists coach_session_actions_guard on public.coach_session_actions;
create trigger coach_session_actions_guard before insert or update or delete on public.coach_session_actions
  for each row execute function public.coach_session_actions_guard();

-- ---------------------------------------------------------------- updated_at
do $touch$
declare t text;
begin
  foreach t in array array[
    'coach_todo_lists', 'coach_todos', 'coach_days', 'coach_weeks', 'coach_sessions', 'coach_session_actions',
    'coach_session_notes', 'session_prep'
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
    'coach_todo_lists', 'coach_todo_headings', 'coach_todos', 'coach_days', 'coach_weeks', 'coach_sessions',
    'coach_session_people', 'coach_session_actions', 'coach_session_notes', 'session_prep', 'workshop_sends'
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
  t text;
begin
  -- The coach's alone: lists, days, weeks. Not the owner's to read.
  foreach t in array array['coach_days', 'coach_weeks'] loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    perform pg_temp.rule(t, 'Coach alone', 'all', mine, mine);
  end loop;

  grant select, insert, update, delete on public.coach_todo_lists to authenticated;
  perform pg_temp.rule('coach_todo_lists', 'Coach alone', 'all', mine,
    mine || ' and (profile_id is null or (select public.coach_owns_profile(profile_id)))');

  grant select, insert, update, delete on public.coach_todo_headings to authenticated;
  perform pg_temp.rule('coach_todo_headings', 'Coach alone', 'all', mine,
    mine || ' and (select public.coach_owns_todo_list(list_id))');

  grant select, insert, update, delete on public.coach_todos to authenticated;
  perform pg_temp.rule('coach_todos', 'Coach alone', 'all', mine,
    mine || ' and (list_id is null or (select public.coach_owns_todo_list(list_id)))'
         || ' and (profile_id is null or (select public.coach_owns_profile(profile_id)))');

  -- Sessions: the coach's own, for their own client, group and engagement.
  grant select, insert, update, delete on public.coach_sessions to authenticated;
  perform pg_temp.rule('coach_sessions', 'Sessions: coach alone, read', 'select', mine);
  perform pg_temp.rule('coach_sessions', 'Sessions: add', 'insert', null,
    mine || ' and (profile_id is null or (select public.coach_owns_profile(profile_id)))'
         || ' and (group_id is null or (select public.coach_owns_group(group_id)))'
         || ' and (engagement_id is null or (select public.coach_owns_engagement(engagement_id)))');
  perform pg_temp.rule('coach_sessions', 'Sessions: change', 'update', mine,
    mine || ' and (profile_id is null or (select public.coach_owns_profile(profile_id)))'
         || ' and (group_id is null or (select public.coach_owns_group(group_id)))'
         || ' and (engagement_id is null or (select public.coach_owns_engagement(engagement_id)))');
  -- A sent recap's session stays: the client has it.
  perform pg_temp.rule('coach_sessions', 'Sessions: remove unsent', 'delete', mine || ' and recap_sent_at is null');

  grant select, insert, update, delete on public.coach_session_people to authenticated;
  perform pg_temp.rule('coach_session_people', 'Coach: own session', 'all',
    '(select public.coach_owns_session(session_id))',
    '(select public.coach_owns_session(session_id)) and (select public.coach_owns_profile(profile_id))'
    || ' and (engagement_id is null or (select public.coach_owns_engagement(engagement_id)))');

  grant select, insert, update, delete on public.coach_session_actions to authenticated;
  perform pg_temp.rule('coach_session_actions', 'Coach: own session', 'all',
    mine || ' and (select public.coach_owns_session(session_id))', mine || ' and (select public.coach_owns_session(session_id))');

  grant select, insert, update, delete on public.coach_session_notes to authenticated;
  perform pg_temp.rule('coach_session_notes', 'Coach alone', 'all',
    mine || ' and (select public.coach_owns_session(session_id))', mine || ' and (select public.coach_owns_session(session_id))');

  -- For next time: the client's own; their current coach reads it.
  grant select, insert, update, delete on public.session_prep to authenticated;
  perform pg_temp.rule('session_prep', 'Prep: own, or their coach reads', 'select',
    'user_id = (select auth.uid()) or (select public.is_coach_of(user_id))');
  perform pg_temp.rule('session_prep', 'Prep: own, add', 'insert', null, 'user_id = (select auth.uid())');
  perform pg_temp.rule('session_prep', 'Prep: own, change', 'update', 'user_id = (select auth.uid())', 'user_id = (select auth.uid())');
  perform pg_temp.rule('session_prep', 'Prep: own, remove', 'delete', 'user_id = (select auth.uid())');

  -- What was sent for a workshop: its coach reads; only the email server writes.
  grant select on public.workshop_sends to authenticated;
  perform pg_temp.rule('workshop_sends', 'Coach: own workshop, read', 'select', '(select public.coach_owns_workshop(workshop_id))');
end
$rules$;

grant select, insert, update, delete on public.workshop_sends to service_role;

-- ---------------------------------------------------------------- functions: the coach
-- A coach sets the coaching hours a week they aim for (only the owner may
-- change a coach's row itself, 026).
create or replace function public.coach_save_capacity(p_hours numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.my_coach_id() is null then
    raise exception 'Only a coach can do this.' using errcode = '42501';
  end if;
  if p_hours is null or p_hours < 1 or p_hours > 80 or p_hours * 2 <> trunc(p_hours * 2) then
    raise exception 'Type a number of hours from 1 to 80.' using errcode = '22023';
  end if;
  update public.coaches set capacity_hours_week = p_hours where id = public.my_coach_id();
end;
$$;
revoke all on function public.coach_save_capacity(numeric) from public, anon;
grant execute on function public.coach_save_capacity(numeric) to authenticated;

-- Send the recap: only its coach, only once, and only with something in it.
-- Nothing is ever sent by itself: this runs when the coach presses Send.
-- Returns 'sent', or 'already_sent' when it had gone before (a second press,
-- another tab), so nobody is ever sent it twice.
create or replace function public.session_send_recap(p_session uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v record;
begin
  select s.id, s.coach_id, s.recap, s.recap_sent_at, s.outcome into v
  from public.coach_sessions s where s.id = p_session for update;
  if v.id is null or v.coach_id is distinct from public.my_coach_id() then
    raise exception 'That session isn''t yours.' using errcode = '42501';
  end if;
  if v.recap_sent_at is not null then
    return 'already_sent';
  end if;
  if v.outcome is distinct from 'held' then
    raise exception 'A recap goes only for a session that went ahead.' using errcode = '22023';
  end if;
  if v.recap is null or char_length(btrim(v.recap)) = 0 then
    raise exception 'Type the recap first.' using errcode = '22023';
  end if;
  perform set_config('clarity.sending', 'on', true);
  update public.coach_sessions set recap_sent_at = now(), recap_sent_by = (select auth.uid()) where id = p_session;
  perform set_config('clarity.sending', '', true);
  return 'sent';
end;
$$;
revoke all on function public.session_send_recap(uuid) from public, anon;
grant execute on function public.session_send_recap(uuid) to authenticated;

-- Who a sent recap goes to, for the email server only: each person's first
-- name and email (a client's own, or each member of a group who has one).
create or replace function public.session_recap_people(p_session uuid)
returns table (name text, email text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.name, p.email
  from public.coach_sessions s
  join public.client_profiles p on p.id = s.profile_id
  where s.id = p_session and s.recap_sent_at is not null and s.coach_id = public.my_coach_id() and p.email is not null
  union
  select m.name, coalesce(m.email, p.email)
  from public.coach_sessions s
  join public.coach_group_members m on m.group_id = s.group_id
  left join public.client_profiles p on p.id = m.profile_id
  where s.id = p_session and s.recap_sent_at is not null and s.coach_id = public.my_coach_id() and coalesce(m.email, p.email) is not null;
$$;
revoke all on function public.session_recap_people(uuid) from public, anon;
grant execute on function public.session_recap_people(uuid) to authenticated;

-- ---------------------------------------------------------------- functions: the client
-- The signed-in client's sent recaps, newest first, each with the actions
-- their coach ticked to send. Unsent recaps, unticked actions, private
-- notes and For supervision are never here.
create or replace function public.my_session_recaps()
returns table (session_id uuid, starts_at timestamptz, minutes integer, kind text, coach_first_name text, group_name text,
               recap text, sent_at timestamptz, actions jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.starts_at, s.minutes, s.kind, c.display_first_name, g.name, s.recap, s.recap_sent_at,
         coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'title', a.title, 'goes_to', a.goes_to,
                                                         'done', a.done_at is not null, 'placed', a.placed_at is not null)
                                    order by a.position, a.created_at)
                   from public.coach_session_actions a where a.session_id = s.id and a.send), '[]'::jsonb)
  from public.coach_sessions s
  join public.coaches c on c.id = s.coach_id
  left join public.coach_groups g on g.id = s.group_id
  where s.recap_sent_at is not null
    and (exists (select 1 from public.client_profiles p
                 where p.id = s.profile_id and p.user_id = (select auth.uid()) and p.merged_into is null)
      or exists (select 1 from public.coach_group_members m join public.client_profiles p on p.id = m.profile_id
                 where m.group_id = s.group_id and p.user_id = (select auth.uid()) and p.merged_into is null))
  order by s.starts_at desc
  limit 200;
$$;
revoke all on function public.my_session_recaps() from public, anon;
grant execute on function public.my_session_recaps() to authenticated;

-- The client marks one of their sent actions done (or not), or as added to
-- their to-dos. Only an action of a recap they were sent.
create or replace function public.my_session_action(p_action uuid, p_done boolean default null, p_placed boolean default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.coach_session_actions a
  set done_at = case when p_done is null then a.done_at when p_done then coalesce(a.done_at, now()) else null end,
      placed_at = case when p_placed is null then a.placed_at when p_placed then coalesce(a.placed_at, now()) else null end
  where a.id = p_action and a.send
    and exists (select 1 from public.my_session_recaps() r where r.session_id = a.session_id);
  if not found then
    raise exception 'That action isn''t yours.' using errcode = '42501';
  end if;
end;
$$;
revoke all on function public.my_session_action(uuid, boolean, boolean) from public, anon;
grant execute on function public.my_session_action(uuid, boolean, boolean) to authenticated;

-- What the signed-in client is being asked by a coach: cover to agree to
-- (the coach's and the cover coach's first names, and the dates). View
-- requests are read from their own table; invites from my_coach_invites().
create or replace function public.my_cover_asks()
returns table (cover_id uuid, coach_first_name text, cover_first_name text, starts_on date, ends_on date, agreed_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select cv.id, c.display_first_name, cc.display_first_name, cv.starts_on, cv.ends_on, cv.client_agreed_at
  from public.coach_cover cv
  join public.client_profiles p on p.id = cv.profile_id and p.user_id = (select auth.uid()) and p.merged_into is null
  join public.coaches c on c.id = cv.coach_id
  join public.coaches cc on cc.id = cv.cover_coach_id
  where cv.ends_on >= current_date
  order by cv.starts_on;
$$;
revoke all on function public.my_cover_asks() from public, anon;
grant execute on function public.my_cover_asks() to authenticated;

-- The coach's first name for each open View as client request of the
-- signed-in client (the request rows themselves are theirs to read, 049).
create or replace function public.my_view_asks()
returns table (request_id uuid, coach_first_name text, asked_at timestamptz, answered_at timestamptz, allowed boolean, expires_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, c.display_first_name, r.asked_at, r.answered_at, r.allowed, r.expires_at
  from public.client_view_requests r
  join public.client_profiles p on p.id = r.profile_id and p.user_id = (select auth.uid()) and p.merged_into is null
  join public.coaches c on c.id = r.coach_id
  where r.asked_at > now() - interval '7 days'
  order by r.asked_at desc
  limit 20;
$$;
revoke all on function public.my_view_asks() from public, anon;
grant execute on function public.my_view_asks() to authenticated;

-- ---------------------------------------------------------------- functions: the email server
-- The workshop emails that are due now and haven't gone: the day-before
-- reminder (from 07:00 the day before, in the workshop's own time zone, to
-- its start), and the 1-hour reminder (from 75 to 45 minutes before). One
-- row a person. Only the email server (the service role) may call it.
create or replace function public.workshop_emails_due(p_now timestamptz default now())
returns table (workshop_id uuid, kind text, title text, starts_at timestamptz, time_zone text, place text,
               coach_first_name text, attendee_name text, attendee_email text)
language sql
stable
security definer
set search_path = ''
as $$
  with due as (
    select w.id, 'day_before'::text as kind
    from public.workshops w
    where w.remind_day_before and w.starts_at is not null and w.starts_at > p_now
      and p_now >= ((date_trunc('day', w.starts_at at time zone coalesce(w.time_zone, 'Europe/London')) - interval '1 day' + interval '7 hours')
                    at time zone coalesce(w.time_zone, 'Europe/London'))
      and w.starts_at - p_now > interval '2 hours'
    union all
    select w.id, 'hour_before'
    from public.workshops w
    where w.remind_hour_before and w.starts_at is not null
      and w.starts_at - p_now between interval '45 minutes' and interval '75 minutes'
  )
  select w.id, d.kind, w.title, w.starts_at, w.time_zone, w.place, c.display_first_name, a.name, a.email
  from due d
  join public.workshops w on w.id = d.id
  join public.coaches c on c.id = w.coach_id
  join public.workshop_attendees a on a.workshop_id = w.id and a.status = 'registered' and a.email is not null
  where not exists (select 1 from public.workshop_sends s where s.workshop_id = w.id and s.kind = d.kind);
$$;
revoke all on function public.workshop_emails_due(timestamptz) from public, anon, authenticated;
grant execute on function public.workshop_emails_due(timestamptz) to service_role;

-- Records a send, once: false when that kind had already gone for the
-- workshop, so two servers never both send it. Called BEFORE sending.
create or replace function public.workshop_send_claim(p_workshop uuid, p_kind text, p_people integer, p_by uuid default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.workshop_sends (workshop_id, kind, people, sent_by)
  values (p_workshop, p_kind, greatest(0, least(5000, coalesce(p_people, 0))), p_by)
  on conflict (workshop_id, kind) do nothing;
  return found;
end;
$$;
revoke all on function public.workshop_send_claim(uuid, text, integer, uuid) from public, anon, authenticated;
grant execute on function public.workshop_send_claim(uuid, text, integer, uuid) to service_role;

-- The coach presses "Send the follow-up" (and the survey with it when its
-- switch is on): only their own workshop, only once each, and only after it
-- has started. Returns who it goes to, each with their own survey key; the
-- send is recorded here, before the email server sends, so a second press
-- returns nothing.
create or replace function public.workshop_follow_up_claim(p_workshop uuid)
returns table (kind text, attendee_name text, attendee_email text, survey_key uuid)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  w record;
  n integer;
  has_key boolean := exists (select 1 from information_schema.columns
                             where table_schema = 'public' and table_name = 'workshop_attendees' and column_name = 'survey_key');
begin
  select x.id, x.coach_id, x.starts_at, x.survey_on into w from public.workshops x where x.id = p_workshop for update;
  if w.id is null or w.coach_id is distinct from public.my_coach_id() then
    raise exception 'That workshop isn''t yours.' using errcode = '42501';
  end if;
  if w.starts_at is null or w.starts_at > now() then
    raise exception 'The follow-up goes after the workshop has started.' using errcode = '22023';
  end if;
  select count(*) into n from public.workshop_attendees a where a.workshop_id = p_workshop and a.status = 'registered' and a.email is not null;
  insert into public.workshop_sends (workshop_id, kind, people, sent_by) values (p_workshop, 'follow_up', n, (select auth.uid()))
  on conflict (workshop_id, kind) do nothing;
  if not found then
    return;
  end if;
  if w.survey_on then
    insert into public.workshop_sends (workshop_id, kind, people, sent_by) values (p_workshop, 'survey', n, (select auth.uid()))
    on conflict (workshop_id, kind) do nothing;
    update public.workshops set survey_sent_on = current_date where id = p_workshop and survey_sent_on is null;
  end if;
  if has_key then
    return query execute
      'select case when $2 then ''follow_up_survey'' else ''follow_up'' end, a.name, a.email, a.survey_key
       from public.workshop_attendees a where a.workshop_id = $1 and a.status = ''registered'' and a.email is not null'
      using p_workshop, w.survey_on;
  else
    return query
      select case when w.survey_on then 'follow_up_survey' else 'follow_up' end, a.name, a.email, null::uuid
      from public.workshop_attendees a where a.workshop_id = p_workshop and a.status = 'registered' and a.email is not null;
  end if;
end;
$$;
revoke all on function public.workshop_follow_up_claim(uuid) from public, anon;
grant execute on function public.workshop_follow_up_claim(uuid) to authenticated;

-- ---------------------------------------------------------------- record it
do $log$
begin
  if to_regprocedure('public.record_migration(integer,text)') is not null then
    perform public.record_migration(50, '050_coach_day');
  end if;
end
$log$;
