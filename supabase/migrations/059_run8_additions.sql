-- =============================================================================
-- 059_run8_additions.sql
-- Phase 6a run 8 (Tim, 23 Nov 2026): three additions before go-live, all
-- additive and safe to run twice. Run after 058.
--
-- WHAT THIS DOES (plain English)
--
-- 1. Group-call reminders (run 8's 1; written by helper 1): a group call
--    gets the day-before and 1-hour reminders, one email to each guest at
--    their own address. A new table records each one that went, so none
--    goes twice; the email server alone reads the calls coming and claims
--    each reminder. A guest who has left the group, or a call cancelled or
--    moved, gets nothing.
--
-- 2. Your Personal and Family calendars from Google (run 8's 2; helper 2):
--      coach_google_calendars   every calendar on the coach's Google account,
--        with one switch each (busy_on), off until the coach switches it on.
--        The main calendar (is_main), the one already kept in step both
--        ways since 051, is listed but never takes the switch.
--      coach_busy_times         the events read from a calendar that is
--        switched on: a title and a start and end, nothing else. Read only:
--        the portal never writes to these calendars.
--    Both are the coach's alone: no other coach, not the owner, no client
--    and no one signed out reads a row, and both need the 6-digit code
--    (054). A busy time of a calendar that is switched on blocks that time
--    for booking pages, single-use links and clients booking their own
--    sessions, all of which only ever get free start times (051's
--    _cal_free_times, made again here with one more kind of busy). 058's
--    coach_associate_sessions reads coaching sessions only, so the owner
--    never sees an associate's busy times. Offer times and polls are
--    picked by the coach on their own calendar, which leaves out the same
--    busy times in the app.
--
-- 3. The keep-in-touch automation (run 8's 3; written by helper 3):
--    coach_automations may also start "When someone is due a catch-up", and
--    such an automation only ever adds a to-do. Its runs are 052's runs.
--
-- WHO SEES WHAT
--   coach_google_calendars and coach_busy_times: the coach's own rows, with
--   the code. coach_cal_group_reminder_sends: its coach reads, with the code;
--   only the email server writes. The group-reminder functions are the
--   email server's alone. coach_code_tables() gains the three tables.
--
-- OLDER THINGS IT TOUCHES
--   public.cal_reminders_coming(...) (051): made again, word for word, but
--     "never while the coach is away" is now the coach's own day, not the
--     UTC date (_coach_away_on; the group reminders use the same).
--   public.coach_code_tables() (054): made again with three more rows.
--   public._cal_free_times(...) (051): made again, word for word, with the
--     busy times of switched-on calendars added to what is busy.
--   coach_automations' trigger check (052): replaced by a named one that
--     also allows 'catch_up_due', and a new check that a catch-up only adds
--     a to-do.
--
-- Needs 049 to 058 (it stops without them). Tests:
-- supabase/059_run8_additions_test.sql (helper 2's part, ends 059 CHECKS PASSED),
-- supabase/059_run8_additions_breakit_test.sql, supabase/059_group_reminders_test.sql
-- and supabase/059_catch_up_test.sql.
-- =============================================================================

do $need$
begin
  if to_regclass('public.coach_cal_items') is null or to_regclass('public.coach_automations') is null
     or to_regprocedure('public.coach_code_ok()') is null or to_regprocedure('public.coach_code_tables()') is null
     or to_regprocedure('public.coach_associate_sessions(timestamptz,timestamptz)') is null
     or to_regprocedure('public._cal_free_times(uuid,text,integer,integer,integer,integer,integer,integer,timestamptz,timestamptz,uuid,uuid,timestamptz)') is null then
    raise exception '059 needs 049 to 058 first (public.coach_cal_items, public.coach_automations, public.coach_code_ok, public.coach_associate_sessions and public._cal_free_times).';
  end if;
end
$need$;

-- ---------------------------------------------------------------- Google calendars for busy times (run 8, item 2; helper 2)
-- Every calendar on the coach's Google account, as the app last read it, with
-- its switch. The app gives each row an id worked out from the coach and the
-- calendar's Google id, so two tabs or two devices make the same row.
create table if not exists public.coach_google_calendars (
  id          uuid primary key default gen_random_uuid(),
  coach_id    uuid not null references public.coaches (id) on delete cascade,
  google_id   text not null check (char_length(google_id) between 1 and 1024),
  name        text not null default '' check (char_length(name) <= 200),
  is_main     boolean not null default false,
  busy_on     boolean not null default false,
  position    integer not null default 0 check (position between 0 and 1000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (coach_id, google_id),
  -- The main calendar is kept in step both ways (051); it never takes the busy switch.
  constraint coach_google_calendars_main_not_busy check (not (is_main and busy_on))
);
comment on table public.coach_google_calendars is
  'Every calendar on a coach''s Google account (059, run 8), with its switch: busy_on shows its events as busy on the coach''s calendar and blocks those times for booking. Off until the coach switches it on. is_main: the calendar kept in step both ways since 051, which never takes the switch. The coach''s alone, with the 6-digit code.';
create index if not exists coach_google_calendars_coach_idx on public.coach_google_calendars (coach_id, position);

-- The events read from a calendar that is switched on: a title and its times, nothing else.
create table if not exists public.coach_busy_times (
  id           uuid primary key default gen_random_uuid(),
  coach_id     uuid not null references public.coaches (id) on delete cascade,
  calendar_id  uuid not null references public.coach_google_calendars (id) on delete cascade,
  event_id     text not null check (char_length(event_id) between 1 and 1024),
  title        text not null default '' check (char_length(title) <= 300),
  starts_at    timestamptz not null,
  ends_at      timestamptz not null,
  all_day      boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (calendar_id, event_id),
  check (ends_at > starts_at and ends_at <= starts_at + interval '31 days')
);
comment on table public.coach_busy_times is
  'A busy time read from one of the coach''s Google calendars that is switched on (059, run 8): the event''s title and its times only. Read only: nothing here is ever written back to Google. It blocks that time for booking pages, links and clients (_cal_free_times), who only ever get free start times. The coach''s alone, with the 6-digit code; never the owner''s or another coach''s to read.';
create index if not exists coach_busy_times_coach_idx on public.coach_busy_times (coach_id, starts_at);
create index if not exists coach_busy_times_calendar_idx on public.coach_busy_times (calendar_id);

-- A calendar keeps its coach and its Google id; a coach has at most 100.
create or replace function public.coach_google_calendars_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.coach_id := old.coach_id;
    new.google_id := old.google_id;
  elsif (select count(*) from public.coach_google_calendars c where c.coach_id = new.coach_id) >= 100 then
    raise exception 'A Google account shows up to 100 calendars here.' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function public.coach_google_calendars_guard() from public, anon, authenticated;
drop trigger if exists coach_google_calendars_guard on public.coach_google_calendars;
create trigger coach_google_calendars_guard before insert or update on public.coach_google_calendars
  for each row execute function public.coach_google_calendars_guard();

-- A busy time belongs to its calendar's coach, never to the main calendar, and keeps its calendar; at most 5,000 a coach.
create or replace function public.coach_busy_times_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  c record;
begin
  if tg_op = 'UPDATE' then
    new.coach_id := old.coach_id;
    new.calendar_id := old.calendar_id;
    new.event_id := old.event_id;
  end if;
  select g.coach_id, g.is_main into c from public.coach_google_calendars g where g.id = new.calendar_id;
  if not found or c.coach_id is distinct from new.coach_id then
    raise exception 'A busy time belongs to one of its coach''s own calendars.' using errcode = '42501';
  end if;
  if c.is_main then
    raise exception 'The main calendar is kept in step as calendar items, never as busy times.' using errcode = '22023';
  end if;
  if tg_op = 'INSERT' and (select count(*) from public.coach_busy_times b where b.coach_id = new.coach_id) >= 5000 then
    raise exception 'Up to 5,000 busy times are kept.' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function public.coach_busy_times_guard() from public, anon, authenticated;
drop trigger if exists coach_busy_times_guard on public.coach_busy_times;
create trigger coach_busy_times_guard before insert or update on public.coach_busy_times
  for each row execute function public.coach_busy_times_guard();

do $touch$
declare t text;
begin
  foreach t in array array['coach_google_calendars', 'coach_busy_times'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.p1_touch()', t || '_touch', t);
  end loop;
end
$touch$;

-- The coach's alone, the owner included; with the code (054's rule, below with coach_code_tables()).
alter table public.coach_google_calendars enable row level security;
alter table public.coach_busy_times enable row level security;
revoke all on table public.coach_google_calendars from public, anon, authenticated;
revoke all on table public.coach_busy_times from public, anon, authenticated;
grant select, insert, update, delete on public.coach_google_calendars to authenticated;
grant select, insert, update, delete on public.coach_busy_times to authenticated;
grant select, insert, update, delete on public.coach_google_calendars to service_role;
grant select, insert, update, delete on public.coach_busy_times to service_role;
drop policy if exists "Coach alone" on public.coach_google_calendars;
create policy "Coach alone" on public.coach_google_calendars for all to authenticated
  using (coach_id = (select public.my_coach_id())) with check (coach_id = (select public.my_coach_id()));
drop policy if exists "Coach alone" on public.coach_busy_times;
create policy "Coach alone" on public.coach_busy_times for all to authenticated
  using (coach_id = (select public.my_coach_id()))
  with check (coach_id = (select public.my_coach_id())
              and exists (select 1 from public.coach_google_calendars g where g.id = calendar_id and g.coach_id = (select public.my_coach_id())));

-- ---------------------------------------------------------------- a coach away, on their own day (run 8, break-it tester)
-- "Never while the coach is away" (coach rule 34) is the coach's own day: the
-- days away are dates on the coach's calendar, in the coach's own zone
-- (051's _cal_coach_zone: Settings' zone, else London). 051 read the moment
-- as a UTC date, so a coach in Los Angeles away until Friday still had
-- reminders go on Friday evening their time (already Saturday in UTC), and
-- one in Auckland away from Saturday had them go on Saturday morning there.
create or replace function public._coach_away_on(p_coach uuid, p_at timestamptz)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.coach_away a
                 where a.coach_id = p_coach
                   and (p_at at time zone public._cal_coach_zone(p_coach))::date between a.starts_on and a.ends_on);
$$;
revoke all on function public._coach_away_on(uuid, timestamptz) from public, anon, authenticated;

-- 051's cal_reminders_coming made again, word for word, but for the days
-- away, now on the coach's own day (above).
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
    and not public._coach_away_on(c.id, p_now)
    and not exists (select 1 from public.coach_cal_reminder_sends r where r.item_id = i.id and r.kind = k.kind and r.occurrence_at = o.starts_at);
$$;
revoke all on function public.cal_reminders_coming(timestamptz) from public, anon, authenticated;
grant execute on function public.cal_reminders_coming(timestamptz) to service_role;

-- ---------------------------------------------------------------- group-call reminders (run 8, item 1; helper 1, for 059)
-- A group call gets the same two reminders as a single call (the day before
-- at 18:00 and 1 hour before, each in every guest's own time zone, with the
-- same Settings switches): one email to each guest, to their own address
-- only. The guests are the group's members as they are when the reminder
-- goes: someone who has left the group (their member row deleted) gets
-- nothing, and nor does anyone when the call was cancelled or moved (its
-- session written up as cancelled or moved, its calendar item deleted, or
-- that time no longer one of the item's times).
--
--   coach_cal_group_reminder_sends  a group reminder that went to one guest,
--     once: item, kind, the call's time and the guest's address (kept as a
--     SHA-256 of the lowercased address, so the table holds no address).
--     Claimed BEFORE sending (unique key, "on conflict do nothing"), so two
--     runs that overlap never both send it. The coach reads their own (with
--     the 6-digit code, 054); only the email server writes.
--   cal_group_reminders_coming(now)  the group calls in the next 36 hours,
--     one row a guest and kind not yet sent (the email server only).
--   cal_group_reminder_claim(item, member, kind, time)  claims one guest's
--     reminder, checking again that the guest is still in the group and the
--     call still at that time; answers the address to send to, or null.
--
-- NOTE FOR 059: add ('coach_cal_group_reminder_sends', 'coach') to
-- coach_code_tables() (054's list) if 059 makes that function again; the
-- restrictive code rule is written here too, so the table is shut before the
-- code either way (054's test 1d needs it in the list).

create table if not exists public.coach_cal_group_reminder_sends (
  id             uuid primary key default gen_random_uuid(),
  item_id        uuid not null references public.coach_cal_items (id) on delete cascade,
  coach_id       uuid not null references public.coaches (id) on delete cascade,
  kind           text not null check (kind in ('day_before', 'hour_before')),
  occurrence_at  timestamptz not null,
  member_id      uuid references public.coach_group_members (id) on delete set null,
  address_key    text not null check (address_key ~ '^[0-9a-f]{64}$'),
  sent_at        timestamptz not null default now(),
  unique (item_id, kind, occurrence_at, address_key)
);
comment on table public.coach_cal_group_reminder_sends is
  'A group call''s reminder that went to one guest, once (059, run 8): claimed here BEFORE it is sent, so nothing goes twice. address_key is a SHA-256 of the guest''s lowercased address, never the address. Written only by the email server (the service role); its coach reads it with the 6-digit code.';
create index if not exists coach_cal_group_reminder_sends_coach_idx on public.coach_cal_group_reminder_sends (coach_id, sent_at desc);
create index if not exists coach_cal_group_reminder_sends_member_idx on public.coach_cal_group_reminder_sends (member_id);

alter table public.coach_cal_group_reminder_sends enable row level security;
revoke all on public.coach_cal_group_reminder_sends from public, anon, authenticated;
grant select on public.coach_cal_group_reminder_sends to authenticated;
grant select, insert, update, delete on public.coach_cal_group_reminder_sends to service_role;
drop policy if exists "Coach alone, read" on public.coach_cal_group_reminder_sends;
create policy "Coach alone, read" on public.coach_cal_group_reminder_sends for select to authenticated
  using (coach_id = (select public.my_coach_id()));
drop policy if exists "Coach data: needs the 6-digit code" on public.coach_cal_group_reminder_sends;
create policy "Coach data: needs the 6-digit code" on public.coach_cal_group_reminder_sends as restrictive for all to authenticated
  using ((select public.coach_code_ok())) with check ((select public.coach_code_ok()));

-- One guest's address key: the same for "Sam@X.com " and "sam@x.com".
create or replace function public._group_reminder_key(p_email text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(sha256(convert_to(lower(btrim(p_email)), 'UTF8')), 'hex');
$$;
revoke all on function public._group_reminder_key(text) from public, anon, authenticated;

-- Whether one time of a group call may still have its reminders: the item is
-- a group call that is still on the calendar at exactly that time, its
-- session (if it has one) not cancelled or moved.
create or replace function public._group_call_on(p_item uuid, p_occurrence timestamptz)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.coach_cal_items i
    join public.coaches c on c.id = i.coach_id and c.active
    join public.coach_groups g on g.id = i.group_id and g.coach_id = i.coach_id
    left join public.coach_sessions s on s.id = i.session_id
    cross join lateral public._cal_occurrences(i.coach_id, p_occurrence - interval '1 minute', p_occurrence + interval '1 minute') o
    where i.id = p_item and i.profile_id is null and not i.removed
      and o.item_id = i.id and o.starts_at = p_occurrence and o.is_call
      and (s.id is null or s.outcome is null or s.outcome in ('held', 'no_show'))
  );
$$;
revoke all on function public._group_call_on(uuid, timestamptz) from public, anon, authenticated;

-- The group calls starting in the next 36 hours whose reminders may be due:
-- one row a guest and kind not yet sent, with what the server needs to
-- decide the moment in the guest's own time (src/lib/coach/calendar.js's
-- remindersToSend) and to write the email. A guest's zone is their client
-- profile's, else the call's own anchor zone. Two members with one address
-- are one guest (the one with a client profile first). The email server (the service role) only.
create or replace function public.cal_group_reminders_coming(p_now timestamptz default now())
returns table (item_id uuid, coach_id uuid, kind text, occurrence_at timestamptz, ends_at timestamptz, time_zone text, title text,
               place_kind text, meeting_link text, location text, coach_first_name text, group_name text,
               member_id uuid, person_name text, person_email text, person_zone text, frequent_traveller boolean, has_account boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct on (x.item_id, x.kind, x.occurrence_at, public._group_reminder_key(x.person_email))
         x.item_id, x.coach_id, x.kind, x.occurrence_at, x.ends_at, x.time_zone, x.title, x.place_kind, x.meeting_link, x.location,
         x.coach_first_name, x.group_name, x.member_id, x.person_name, x.person_email, x.person_zone, x.frequent_traveller, x.has_account
  from (
    select i.id as item_id, i.coach_id, k.kind, o.starts_at as occurrence_at, o.ends_at, i.time_zone, i.title, i.place_kind, i.meeting_link, i.location,
           c.display_first_name as coach_first_name, g.name as group_name,
           m.id as member_id, coalesce(p.name, m.name) as person_name, btrim(coalesce(p.email, m.email)) as person_email,
           coalesce(p.time_zone, i.time_zone) as person_zone, coalesce(p.frequent_traveller, false) as frequent_traveller,
           (p.user_id is not null and p.merged_into is null) as has_account,
           (p.id is null) as no_profile, m.created_at as member_created
    from public.coaches c
    cross join lateral public._cal_occurrences(c.id, p_now, p_now + interval '36 hours') o
    join public.coach_cal_items i on i.id = o.item_id
    join public.coach_groups g on g.id = i.group_id and g.coach_id = c.id
    join public.coach_group_members m on m.group_id = g.id
    left join public.client_profiles p on p.id = m.profile_id
    left join public.coach_sessions s on s.id = i.session_id
    cross join (values ('day_before'), ('hour_before')) k(kind)
    where c.active and o.is_call and o.starts_at > p_now
      and i.profile_id is null and not i.removed
      and (s.id is null or s.outcome is null or s.outcome in ('held', 'no_show'))
      and coalesce(p.email, m.email) is not null
      and (case k.kind when 'day_before' then coalesce(((select st.booking -> 'remind_24' from public.coach_settings st where st.coach_id = c.id) #>> '{}'), 'true') <> 'false'
                       else coalesce(((select st.booking -> 'remind_1' from public.coach_settings st where st.coach_id = c.id) #>> '{}'), 'false') = 'true' end)
      and not public._coach_away_on(c.id, p_now)
      and not exists (select 1 from public.coach_cal_group_reminder_sends r
                      where r.item_id = i.id and r.kind = k.kind and r.occurrence_at = o.starts_at
                        -- by address, and by guest: one whose address changed after theirs went gets it once (the break-it tester)
                        and (r.address_key = public._group_reminder_key(coalesce(p.email, m.email)) or r.member_id = m.id))
  ) x
  -- One address once: a member with a client profile first (their own zone is known), then the earliest added.
  order by x.item_id, x.kind, x.occurrence_at, public._group_reminder_key(x.person_email), x.no_profile, x.member_created, x.member_id
  limit 5000;
$$;
revoke all on function public.cal_group_reminders_coming(timestamptz) from public, anon, authenticated;
grant execute on function public.cal_group_reminders_coming(timestamptz) to service_role;

-- Claims one guest's reminder, once, BEFORE it is sent: checks again that the
-- member is still in the call's group, the call still at that time and not
-- cancelled or moved, and that kind still switched on; then one insert
-- against the unique key. Answers the address to send to (the one the claim
-- was made for), or null when it had already gone or may not go.
create or replace function public.cal_group_reminder_claim(p_item uuid, p_member uuid, p_kind text, p_occurrence timestamptz)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_coach uuid;
begin
  if p_kind not in ('day_before', 'hour_before') or not public._group_call_on(p_item, p_occurrence) then
    return null;
  end if;
  select btrim(coalesce(p.email, m.email)), i.coach_id into v_email, v_coach
  from public.coach_cal_items i
  join public.coach_group_members m on m.group_id = i.group_id and m.id = p_member
  left join public.client_profiles p on p.id = m.profile_id
  where i.id = p_item;
  if v_email is null or v_email = '' then
    return null;
  end if;
  -- Never while the coach is away, on the coach's own day (the run 8 break-it tester).
  if public._coach_away_on(v_coach, now()) then
    return null;
  end if;
  if (case p_kind when 'day_before' then coalesce(((select st.booking -> 'remind_24' from public.coach_settings st where st.coach_id = v_coach) #>> '{}'), 'true') = 'false'
                  else coalesce(((select st.booking -> 'remind_1' from public.coach_settings st where st.coach_id = v_coach) #>> '{}'), 'false') <> 'true' end) then
    return null;
  end if;
  -- A guest whose address changed since theirs went (the break-it tester): still once.
  if exists (select 1 from public.coach_cal_group_reminder_sends r
             where r.item_id = p_item and r.kind = p_kind and r.occurrence_at = p_occurrence and r.member_id = p_member) then
    return null;
  end if;
  insert into public.coach_cal_group_reminder_sends (item_id, coach_id, kind, occurrence_at, member_id, address_key)
  values (p_item, v_coach, p_kind, p_occurrence, p_member, public._group_reminder_key(v_email))
  on conflict (item_id, kind, occurrence_at, address_key) do nothing;
  if not found then
    return null;
  end if;
  return v_email;
end;
$$;
revoke all on function public.cal_group_reminder_claim(uuid, uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.cal_group_reminder_claim(uuid, uuid, text, timestamptz) to service_role;

-- ---------------------------------------------------------------- the keep-in-touch automation (run 8, item 3; helper 3)
-- For 059 (helper 3, run 8's 3: the keep-in-touch automation). Additive only, safe to run twice.
-- 052's coach_automations.trigger check gains 'catch_up_due' ("When someone is due a catch-up, add a to-do").
-- A catch-up automation only ever adds a to-do (never moves a stage). Its runs are claimed with event_key
-- 'catchup:network:<person>:<due day>' or 'catchup:client:<profile>:<due day>', so 052's unique
-- (automation_id, event_key) already holds "once per person per due date": no change to the runs.
do $c$
declare r record;
begin
  -- 052 wrote the check inline, so Postgres named it; drop whichever check holds the trigger list.
  for r in select conname from pg_constraint
           where conrelid = 'public.coach_automations'::regclass and contype = 'c'
             and pg_get_constraintdef(oid) like '%lead_stage%' and pg_get_constraintdef(oid) like '%coaching_ended%'
             and conname <> 'coach_automations_trigger_ok'
  loop
    execute format('alter table public.coach_automations drop constraint %I', r.conname);
  end loop;
  if not exists (select 1 from pg_constraint where conname = 'coach_automations_trigger_ok') then
    alter table public.coach_automations add constraint coach_automations_trigger_ok
      check (trigger in ('lead_stage', 'proposal_opened', 'lead_quiet', 'call_booked', 'lead_won', 'coaching_ended', 'catch_up_due'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'coach_automations_catch_up_todo') then
    alter table public.coach_automations add constraint coach_automations_catch_up_todo
      check (trigger <> 'catch_up_due' or action = 'todo');
  end if;
end
$c$;
comment on constraint coach_automations_trigger_ok on public.coach_automations is
  'What can start an automation (052, and 059''s catch_up_due: someone in Network or a past client is due a catch-up). Nothing sends.';

-- ---------------------------------------------------------------- the coach tables (054's list, three more)
-- 054's coach_code_tables() made again, word for word, with 059's three
-- tables at the end, and 054's restrictive rule on each of them (helper 1's
-- part above writes its own table's rule too; it is the same rule).
create or replace function public.coach_code_tables()
returns table(table_name text, kind text)
language sql
immutable
set search_path = ''
as $$
  select t.table_name, t.kind from (values
    -- 026 and 035, the older coach tables
    ('coaches', 'own_coach_row'),
    ('coach_clients', 'own_client_id'),
    ('coach_away', 'coach'),
    ('client_suggestions', 'own_client_id'),
    -- 049
    ('coach_settings', 'coach'), ('coach_profiles', 'coach'),
    ('client_profiles', 'own_profile_row'), ('client_profile_coaches', 'coach'),
    ('client_about', 'coach'), ('client_notes', 'coach'),
    ('client_files', 'own_profile'), ('client_view_requests', 'own_profile'),
    ('client_merges', 'coach'), ('coach_cover', 'coach'),
    ('coach_tags', 'coach'), ('coach_tag_links', 'coach'), ('coach_fields', 'coach'), ('coach_field_values', 'coach'),
    ('coach_views', 'coach'), ('organisation_contacts', 'coach'), ('organisation_documents', 'coach'),
    ('coach_groups', 'coach'), ('coach_group_members', 'coach'),
    ('engagements', 'coach'), ('engagement_packs', 'coach'), ('engagement_projects', 'coach'), ('time_entries', 'coach'),
    ('workshops', 'coach'), ('workshop_attendees', 'coach'), ('workshop_materials', 'coach'), ('workshop_survey_answers', 'coach'),
    ('activity_log', 'coach'), ('data_requests', 'coach'), ('coach_notifications', 'coach'),
    -- 050
    ('coach_todo_lists', 'coach'), ('coach_todo_headings', 'coach'), ('coach_todos', 'coach'),
    ('coach_days', 'coach'), ('coach_weeks', 'coach'),
    ('coach_sessions', 'coach'), ('coach_session_people', 'coach'), ('coach_session_actions', 'coach'), ('coach_session_notes', 'coach'),
    ('session_prep', 'own_user_id'), ('workshop_sends', 'coach'),
    -- 051
    ('coach_call_types', 'coach'), ('coach_polls', 'coach'), ('coach_poll_people', 'coach'), ('coach_poll_options', 'coach'),
    ('coach_poll_votes', 'coach'), ('coach_booking_links', 'coach'), ('coach_leads', 'coach'),
    ('coach_cal_items', 'coach'), ('coach_cal_guests', 'coach'), ('coach_open_blocks', 'coach'), ('coach_bookings', 'coach'),
    ('coach_cal_reminder_sends', 'coach'), ('coach_connections', 'closed'),
    -- 052
    ('coach_lead_stages', 'coach'), ('coach_lead_events', 'coach'), ('coach_lead_merges', 'closed'),
    ('coach_automations', 'coach'), ('coach_automation_runs', 'coach'),
    ('coach_boards', 'coach'), ('coach_board_stages', 'coach'), ('coach_board_items', 'coach'),
    ('coach_emails', 'coach'), ('coach_email_bodies', 'coach'), ('coach_email_links', 'coach'),
    ('coach_email_waiting', 'coach'), ('coach_email_addresses', 'coach'),
    ('client_check_ins', 'coach'), ('organisation_deals', 'coach'), ('organisation_growth', 'coach'),
    ('network_people', 'coach'), ('network_ratings', 'coach'), ('network_gives', 'coach'),
    ('network_columns', 'coach'), ('network_merges', 'closed'),
    -- 053: one's own rows pass before the code (the sign-in screens need them)
    ('coach_authenticators', 'own_user_id'), ('coach_recovery_codes', 'own_user_id'),
    ('coach_authenticator_resets', 'own_coach_user_id'),
    -- 059 (run 8, item 1)
    ('coach_cal_group_reminder_sends', 'coach'),
    -- 059 (run 8, item 2)
    ('coach_google_calendars', 'coach'), ('coach_busy_times', 'coach')
  ) as t(table_name, kind);
$$;
revoke all on function public.coach_code_tables() from public, anon;
grant execute on function public.coach_code_tables() to authenticated, service_role;

do $rules$
declare
  t text;
  v_name constant text := 'Coach data: needs the 6-digit code';
begin
  foreach t in array array['coach_cal_group_reminder_sends', 'coach_google_calendars', 'coach_busy_times'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', v_name, t);
    execute format('create policy %I on public.%I as restrictive for all to authenticated using ((select public.coach_code_ok())) with check ((select public.coach_code_ok()))', v_name, t);
  end loop;
end
$rules$;

-- ---------------------------------------------------------------- free times (051's, with the Google busy times)
-- 051's _cal_free_times made again word for word, with one more kind of
-- busy: the busy times of the coach's Google calendars that are switched on.
-- Booking pages, single-use links and clients only ever get the free starts
-- it answers, never the busy times themselves.
-- The starts a coach can be booked at between two instants, worked out
-- here so no page ever needs to see the calendar:
--   p_source 'open'   inside the Open for calls blocks (booking pages and
--                     single-use links for people outside)
--            'hours'  inside the coach's weekly hours (clients): Settings'
--                     "Open for bookings" when set, else the working day
--   - on a quarter hour, with the whole call inside one block;
--   - at least the notice ahead, and no further ahead than allowed;
--   - never over anything busy (personal and family items count as busy,
--     and so does a time held for a poll, and, from 059, the busy times of
--     the Google calendars the coach has switched on), and never on a day away;
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
  -- Nothing is ever free years away, and a date at the edge of what can be held is never added to.
  if not (p_from between p_now - interval '2 years' and p_now + interval '2 years') then return; end if;
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
    union all
    -- 059: the busy times of the coach's Google calendars that are switched on (never a call).
    select g.starts_at, g.ends_at, false
    from public.coach_busy_times g
    join public.coach_google_calendars c on c.id = g.calendar_id and c.coach_id = p_coach
    where g.coach_id = p_coach and c.busy_on and not c.is_main
      and g.starts_at < v_hi + interval '1 day' and g.ends_at > v_lo - interval '1 day'
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

select public.record_migration(59, '059_run8_additions');
