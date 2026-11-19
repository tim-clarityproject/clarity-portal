-- =============================================================================
-- 049_coach_portal_foundation.sql
-- Phase 6a, run 1 of 4 (mock-up M11, Coach portal, version 3.6; Tim, 18 Nov
-- 2026): the data under the coach portal's foundation, Clarity Coach.
--
-- WHAT THIS DOES (plain English)
--   Coaches
--     coaches               gains the full name, the capacity target (15
--                           hours a week) and the hourly rate (associates).
--     coach_settings        one row per coach, their own: time zone, the
--                           editable list of time zones, the second time
--                           zone, quiet hours, notification switches, and
--                           the Settings rows later runs wire up (working
--                           hours, booking, calendars, email, note layouts).
--     coach_profiles        photo, bio, specialisms, and when the owner
--                           approved it.
--     coach_cover           cover while a coach is away: the cover coach,
--                           the client, the dates and the client's agreement.
--   Clients
--     client_profiles       one row per client in a coach's list, with or
--                           without a portal account: name, email, mobile,
--                           organisation, role, city, time zone (a place
--                           name), frequent traveller, referred by, status
--                           (active, paused or past), the board's stage,
--                           when they were invited and Getting started's ticks.
--     client_profile_coaches  who coached the profile, with the history.
--     client_about          About them (birthday, partner, children, other).
--     client_notes          private notes; up to 3 pinned for each client.
--     client_files          files shared both ways by a client and their coach.
--     client_view_requests  "Ask to view the portal": asked, answered, until.
--     client_merges         what a merge moved, so Undo can put it back.
--   One shared set of tags, custom fields and saved views
--     coach_tags, coach_tag_links (clients, leads, to-dos, the library),
--     coach_fields, coach_field_values, coach_views (up to 5 favourites).
--   Organisations
--     organisations.city, organisation_contacts (roles: sponsor, invoices)
--     and organisation_documents (with an optional expiry).
--   Groups and workshops
--     coach_groups, coach_group_members (each counts against their own
--     engagement or the group's), workshops, workshop_attendees (emails,
--     not clients; registered or on the waiting list; attendance),
--     workshop_materials, workshop_survey_answers.
--   Engagements (agreements and signatures are Phase 6b)
--     engagements, engagement_packs, engagement_projects and time_entries
--     (Clock in and Clock out, to the minute).
--   Records
--     activity_log (who, what, when), data_requests (export or delete),
--     coach_notifications (the bell).
--   Two private file stores: client-files and coach-files.
--   Additive: new tables, new columns, new functions. One function from
--   026/033 is replaced with one addition: public.may_see also answers for a
--   cover coach, between the cover dates, once the client has agreed.
--
-- WHO CAN SEE WHAT
--   - A coach reads and changes only their own clients' profiles (and may
--     take back one they have just added, while it has no account). An
--     associate never reads another coach's client.
--   - The owner reads only admin facts of an associate's clients (name,
--     coach, organisation, status, the engagement and its sessions), through
--     public.coach_admin_clients(), and the engagement rows themselves.
--     Never About them, notes, files, tags or fields.
--   - A cover coach reads the client's name and what the client shares
--     (may_see), only between the cover dates and after the client agreed.
--   - About them, pinned notes and private notes are the coach's alone.
--   - Tags, custom fields and saved views belong to the coach who made them.
--   - Organisation contacts and documents, the activity log and cover are
--     the owner's. A coach reads the organisations their own clients are in.
--   - A client reads their own files and adds to them; nothing else here.
--   - Someone signed out reaches only a workshop's registration page and its
--     survey, through four functions that take the page's own key.
--
-- SAFE TO RUN TWICE
--   Yes: tables, columns and indexes are made only when missing; functions,
--   rules and triggers are replaced with the same versions.
--
-- HOW TO RUN
--   After 026 and 033. Then run supabase/049_coach_portal_foundation_test.sql,
--   which ends with 049 CHECKS PASSED.
-- =============================================================================

do $need$
begin
  if to_regclass('public.coaches') is null or to_regprocedure('public.is_coach_of(uuid)') is null
     or to_regprocedure('public.wellbeing_visible(uuid,uuid)') is null then
    raise exception '049 needs 026 and 033 first (public.coaches, public.is_coach_of and public.wellbeing_visible).';
  end if;
end
$need$;

-- ---------------------------------------------------------------- shared bits
-- A time zone is a place name ("Europe/London"), never an offset or letters.
create or replace function public.zone_name_ok(p_zone text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_zone is null
      or p_zone = 'UTC'
      or (char_length(p_zone) <= 64 and p_zone ~ '^[A-Za-z][A-Za-z0-9_+-]*(/[A-Za-z0-9_+-]+){1,2}$');
$$;

-- One address only, as 035 asks of a guest's.
create or replace function public.one_email_ok(p_email text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_email is null
      or (char_length(p_email) between 3 and 254
          and p_email = lower(p_email)
          and p_email ~ '^[^@[:space:],;<>()\[\]\\":]+@[^@[:space:],;<>()\[\]\\":]+\.[^@[:space:],;<>()\[\]\\":]+$');
$$;

-- The signed-in person's own coach row, when they are an active coach.
create or replace function public.my_coach_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.id from public.coaches c where c.user_id = (select auth.uid()) and c.active;
$$;

-- ---------------------------------------------------------------- coaches
alter table public.coaches add column if not exists full_name text;
alter table public.coaches add column if not exists capacity_hours_week numeric(4, 1) not null default 15;
alter table public.coaches add column if not exists hourly_rate numeric(8, 2);
alter table public.coaches add column if not exists rate_currency text not null default 'GBP';
do $c$
begin
  if not exists (select 1 from pg_constraint where conname = 'coaches_full_name_len') then
    alter table public.coaches add constraint coaches_full_name_len check (full_name is null or char_length(btrim(full_name)) between 1 and 120);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'coaches_capacity_range') then
    alter table public.coaches add constraint coaches_capacity_range check (capacity_hours_week between 0 and 80);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'coaches_rate_range') then
    alter table public.coaches add constraint coaches_rate_range check (hourly_rate is null or hourly_rate between 0 and 100000);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'coaches_rate_currency') then
    alter table public.coaches add constraint coaches_rate_currency check (rate_currency ~ '^[A-Z]{3}$');
  end if;
end
$c$;
comment on column public.coaches.capacity_hours_week is 'The coaching hours a week this coach aims for (15 to start).';
comment on column public.coaches.hourly_rate is 'What an associate is paid an hour. The owner sets it.';

create table if not exists public.coach_settings (
  coach_id         uuid primary key references public.coaches (id) on delete cascade,
  time_zone        text check (public.zone_name_ok(time_zone)),
  time_zones       jsonb check (time_zones is null or (jsonb_typeof(time_zones) = 'array' and jsonb_array_length(time_zones) between 1 and 200)),
  second_time_zone text check (public.zone_name_ok(second_time_zone)),
  quiet_from       time,
  quiet_to         time,
  notifications    jsonb not null default '{}'::jsonb check (jsonb_typeof(notifications) = 'object' and pg_column_size(notifications) <= 4096),
  phone_notifications boolean not null default false,
  working_hours    jsonb not null default '{}'::jsonb check (jsonb_typeof(working_hours) = 'object' and pg_column_size(working_hours) <= 4096),
  booking_hours    jsonb not null default '{}'::jsonb check (jsonb_typeof(booking_hours) = 'object' and pg_column_size(booking_hours) <= 4096),
  booking          jsonb not null default '{}'::jsonb check (jsonb_typeof(booking) = 'object' and pg_column_size(booking) <= 8192),
  calendars        jsonb not null default '{}'::jsonb check (jsonb_typeof(calendars) = 'object' and pg_column_size(calendars) <= 8192),
  email            jsonb not null default '{}'::jsonb check (jsonb_typeof(email) = 'object' and pg_column_size(email) <= 4096),
  note_layouts     jsonb not null default '{}'::jsonb check (jsonb_typeof(note_layouts) = 'object' and pg_column_size(note_layouts) <= 16384),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
comment on table public.coach_settings is
  'A coach''s own Settings (M11). time_zones is the editable list of place names; empty means the 21 cities the app starts with.';

create table if not exists public.coach_profiles (
  coach_id       uuid primary key references public.coaches (id) on delete cascade,
  photo_path     text check (char_length(photo_path) <= 400),
  bio            text check (char_length(bio) <= 2000),
  specialisms    text[] not null default '{}'::text[] check (cardinality(specialisms) <= 20),
  submitted_at   timestamptz,
  approved_at    timestamptz,
  approved_by    uuid references auth.users (id) on delete set null,
  edit_asked_at  timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
comment on table public.coach_profiles is
  'What a coach''s own clients see of them. A change by the coach takes the approval off until the owner approves again.';

-- ---------------------------------------------------------------- client profiles
create table if not exists public.client_profiles (
  id                 uuid primary key default gen_random_uuid(),
  coach_id           uuid not null references public.coaches (id) on delete restrict,
  user_id            uuid references auth.users (id) on delete set null,
  name               text not null check (char_length(btrim(name)) between 1 and 120),
  email              text check (public.one_email_ok(email)),
  mobile             text check (mobile ~ '^\+[0-9]{6,15}$'),
  organisation_id    uuid references public.organisations (id) on delete set null,
  job_title          text check (char_length(job_title) <= 120),
  city               text check (char_length(city) <= 80),
  time_zone          text check (public.zone_name_ok(time_zone)),
  frequent_traveller boolean not null default false,
  referred_by        text check (char_length(referred_by) <= 120),
  status             text not null default 'active' check (status in ('active', 'paused', 'past')),
  stage              text check (stage in ('starting', 'active', 'renewal_due', 'closing', 'paused')),
  getting_started    jsonb not null default '{}'::jsonb check (jsonb_typeof(getting_started) = 'object' and pg_column_size(getting_started) <= 2048),
  last_contact_on    date,
  invited_at         timestamptz,
  ended_on           date,
  merged_into        uuid references public.client_profiles (id) on delete set null,
  created_by         uuid references auth.users (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (merged_into is null or merged_into <> id)
);
comment on table public.client_profiles is
  'A client in a coach''s list, with or without a portal account (user_id is filled when the person accepts the invite). The coach''s own; the owner reads admin facts through coach_admin_clients().';
create unique index if not exists client_profiles_one_account on public.client_profiles (user_id) where user_id is not null and merged_into is null;
create index if not exists client_profiles_coach_idx on public.client_profiles (coach_id, status) where merged_into is null;
create index if not exists client_profiles_org_idx on public.client_profiles (organisation_id);
create index if not exists client_profiles_email_idx on public.client_profiles (lower(email));
create index if not exists client_profiles_merged_idx on public.client_profiles (merged_into);
create index if not exists client_profiles_created_by_idx on public.client_profiles (created_by);

create table if not exists public.client_profile_coaches (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.client_profiles (id) on delete cascade,
  coach_id    uuid not null references public.coaches (id) on delete restrict,
  started_at  timestamptz not null default now(),
  ended_at    timestamptz,
  changed_by  uuid references auth.users (id) on delete set null
);
create index if not exists client_profile_coaches_profile_idx on public.client_profile_coaches (profile_id, started_at desc);
create index if not exists client_profile_coaches_coach_idx on public.client_profile_coaches (coach_id);
create index if not exists client_profile_coaches_changed_by_idx on public.client_profile_coaches (changed_by);

-- Is this profile in the signed-in coach's own list?
create or replace function public.coach_owns_profile(p_profile uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.client_profiles p
    join public.coaches c on c.id = p.coach_id
    where p.id = p_profile and c.user_id = (select auth.uid()) and c.active
  );
$$;

-- Is this profile the signed-in person's own (they are the client)?
create or replace function public.profile_is_mine(p_profile uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.client_profiles p
    where p.id = p_profile and p.user_id = (select auth.uid()) and p.merged_into is null
  );
$$;

-- An account is linked only by the functions below (never by a plain save),
-- and the coach history follows every change of coach.
create or replace function public.client_profiles_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.user_id is not null and coalesce(current_setting('clarity.linking', true), '') <> 'on' then
      raise exception 'An account is linked when the person accepts their invite.' using errcode = '42501';
    end if;
    if new.created_by is null then
      new.created_by := (select auth.uid());
    end if;
    return new;
  end if;
  if new.user_id is distinct from old.user_id and coalesce(current_setting('clarity.linking', true), '') <> 'on' then
    raise exception 'An account is linked when the person accepts their invite.' using errcode = '42501';
  end if;
  if new.coach_id is distinct from old.coach_id and coalesce(current_setting('clarity.moving', true), '') <> 'on' then
    raise exception 'A client moves to another coach with Move to a coach.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.client_profiles_guard() from public, anon, authenticated;
drop trigger if exists client_profiles_guard on public.client_profiles;
create trigger client_profiles_guard before insert or update on public.client_profiles
  for each row execute function public.client_profiles_guard();

create or replace function public.client_profiles_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.coach_id is not distinct from old.coach_id then
      return new;
    end if;
    update public.client_profile_coaches set ended_at = now()
    where profile_id = new.id and ended_at is null;
  end if;
  insert into public.client_profile_coaches (profile_id, coach_id, changed_by)
  values (new.id, new.coach_id, (select auth.uid()));
  return new;
end;
$$;
revoke all on function public.client_profiles_history() from public, anon, authenticated;
drop trigger if exists client_profiles_history on public.client_profiles;
create trigger client_profiles_history after insert or update of coach_id on public.client_profiles
  for each row execute function public.client_profiles_history();

create table if not exists public.client_about (
  profile_id      uuid not null references public.client_profiles (id) on delete cascade,
  coach_id        uuid not null references public.coaches (id) on delete cascade,
  birthday_month  smallint check (birthday_month between 1 and 12),
  birthday_day    smallint check (birthday_day between 1 and 31),
  partner         text check (char_length(partner) <= 120),
  children        text check (char_length(children) <= 240),
  other           text check (char_length(other) <= 2000),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (profile_id, coach_id),
  check ((birthday_month is null) = (birthday_day is null))
);
comment on table public.client_about is 'About them: the coach''s alone. Nobody else reads it, the owner included.';
create index if not exists client_about_coach_idx on public.client_about (coach_id, birthday_month, birthday_day);

create table if not exists public.client_notes (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.client_profiles (id) on delete cascade,
  coach_id    uuid not null references public.coaches (id) on delete cascade,
  body        text not null check (char_length(btrim(body)) between 1 and 4000),
  noted_on    date not null default current_date,
  pinned      boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.client_notes is 'Private notes on a client: the coach''s alone. Up to 3 pinned for each client.';
create index if not exists client_notes_profile_idx on public.client_notes (profile_id, noted_on desc);
create index if not exists client_notes_coach_idx on public.client_notes (coach_id);

create or replace function public.client_notes_pins()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.pinned and (tg_op = 'INSERT' or not old.pinned or new.profile_id <> old.profile_id) then
    perform 1 from public.client_profiles p where p.id = new.profile_id for update;
    if (select count(*) from public.client_notes n
        where n.profile_id = new.profile_id and n.coach_id = new.coach_id and n.pinned and n.id <> new.id) >= 3 then
      raise exception 'Up to 3 notes can be pinned for each client.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.client_notes_pins() from public, anon, authenticated;
drop trigger if exists client_notes_pins on public.client_notes;
create trigger client_notes_pins before insert or update on public.client_notes
  for each row execute function public.client_notes_pins();

create table if not exists public.client_files (
  id             uuid primary key default gen_random_uuid(),
  profile_id     uuid not null references public.client_profiles (id) on delete cascade,
  name           text not null check (char_length(btrim(name)) between 1 and 200),
  storage_path   text not null check (char_length(storage_path) between 1 and 600),
  size_bytes     bigint check (size_bytes between 0 and 104857600),
  mime           text check (char_length(mime) <= 120),
  added_by       text not null check (added_by in ('coach', 'client')),
  added_by_user  uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now()
);
comment on table public.client_files is 'Files shared both ways by a client and their coach. Nobody else reads them.';
create index if not exists client_files_profile_idx on public.client_files (profile_id, created_at desc);
create index if not exists client_files_added_by_user_idx on public.client_files (added_by_user);

create table if not exists public.client_view_requests (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.client_profiles (id) on delete cascade,
  coach_id     uuid not null references public.coaches (id) on delete cascade,
  asked_at     timestamptz not null default now(),
  answered_at  timestamptz,
  allowed      boolean,
  expires_at   timestamptz
);
comment on table public.client_view_requests is 'View as client: the client is asked first; a yes lasts 30 minutes.';
create index if not exists client_view_requests_profile_idx on public.client_view_requests (profile_id, asked_at desc);
create index if not exists client_view_requests_coach_idx on public.client_view_requests (coach_id);

create table if not exists public.client_merges (
  id          uuid primary key default gen_random_uuid(),
  coach_id    uuid not null references public.coaches (id) on delete cascade,
  kept_id     uuid not null references public.client_profiles (id) on delete cascade,
  dropped_id  uuid not null references public.client_profiles (id) on delete cascade,
  before      jsonb not null,
  moved       jsonb not null,
  merged_at   timestamptz not null default now(),
  undone_at   timestamptz
);
create index if not exists client_merges_coach_idx on public.client_merges (coach_id, merged_at desc);
create index if not exists client_merges_kept_idx on public.client_merges (kept_id);
create index if not exists client_merges_dropped_idx on public.client_merges (dropped_id);

-- ---------------------------------------------------------------- cover
create table if not exists public.coach_cover (
  id                uuid primary key default gen_random_uuid(),
  coach_id          uuid not null references public.coaches (id) on delete cascade,
  cover_coach_id    uuid not null references public.coaches (id) on delete cascade,
  profile_id        uuid not null references public.client_profiles (id) on delete cascade,
  starts_on         date not null,
  ends_on           date not null,
  client_agreed_at  timestamptz,
  created_by        uuid references auth.users (id) on delete set null,
  created_at        timestamptz not null default now(),
  check (ends_on >= starts_on),
  check (cover_coach_id <> coach_id)
);
comment on table public.coach_cover is
  'Cover while a coach is away. The cover coach sees only what the client shares, between the dates, once the client has agreed.';
create index if not exists coach_cover_cover_idx on public.coach_cover (cover_coach_id, starts_on, ends_on);
create index if not exists coach_cover_coach_idx on public.coach_cover (coach_id);
create index if not exists coach_cover_profile_idx on public.coach_cover (profile_id);
create index if not exists coach_cover_created_by_idx on public.coach_cover (created_by);

-- Is the signed-in coach covering this profile today, with the client's yes?
create or replace function public.covers_profile(p_profile uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.coach_cover cv
    join public.coaches c on c.id = cv.cover_coach_id
    where cv.profile_id = p_profile and c.user_id = (select auth.uid()) and c.active
      and cv.client_agreed_at is not null
      and (now() at time zone 'Europe/London')::date between cv.starts_on and cv.ends_on
  );
$$;

-- The same question asked of a client's account.
create or replace function public.is_cover_of(p_client uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.client_profiles p
    where p.user_id = p_client and p.merged_into is null and public.covers_profile(p.id)
  );
$$;

-- THE CHECKED HELPER (026, 033), with one addition: a cover coach counts as
-- the coach between the cover dates, so they see exactly what the client
-- shares and nothing more.
create or replace function public.may_see(p_owner uuid, p_part text, p_item_shared boolean default null)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  viewer uuid := (select auth.uid());
  p record;
begin
  if viewer is null or p_owner is null then
    return false;
  end if;
  if viewer = p_owner then
    return true;
  end if;
  select * into p from public.sharing_parts() sp where sp.part = p_part;
  if not found then
    raise exception 'Unknown sharing part: %', p_part using errcode = '22023';
  end if;
  if p.audience = 'coach' then
    if not (public.is_coach_of(p_owner) or public.is_cover_of(p_owner)) then
      return false;
    end if;
    if p.per_item then
      return coalesce(p_item_shared, false);
    end if;
    return public.sharing_is_on(p_owner, p_part);
  end if;
  -- organisation wellbeing: by the person's choice for each organisation
  return public.wellbeing_visible(p_owner, null);
end;
$$;

-- ---------------------------------------------------------------- tags, fields, views
create table if not exists public.coach_tags (
  id          uuid primary key default gen_random_uuid(),
  coach_id    uuid not null references public.coaches (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 40),
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);
comment on table public.coach_tags is 'One shared set of tags for clients, leads, to-dos and the library. The coach''s own; clients never see them.';
create unique index if not exists coach_tags_one_name on public.coach_tags (coach_id, lower(btrim(name)));

create table if not exists public.coach_tag_links (
  tag_id      uuid not null references public.coach_tags (id) on delete cascade,
  item_kind   text not null check (item_kind in ('client', 'lead', 'todo', 'library')),
  item_id     uuid not null,
  coach_id    uuid not null references public.coaches (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (tag_id, item_kind, item_id)
);
create index if not exists coach_tag_links_item_idx on public.coach_tag_links (coach_id, item_kind, item_id);

create table if not exists public.coach_fields (
  id          uuid primary key default gen_random_uuid(),
  coach_id    uuid not null references public.coaches (id) on delete cascade,
  applies_to  text not null default 'client' check (applies_to in ('client', 'lead')),
  name        text not null check (char_length(btrim(name)) between 1 and 60),
  kind        text not null check (kind in ('text', 'number', 'date', 'choice')),
  options     jsonb not null default '[]'::jsonb check (jsonb_typeof(options) = 'array' and pg_column_size(options) <= 8192),
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.coach_fields is 'A coach''s own fields: text, number, date or a choice from a list. No limit on how many.';
create unique index if not exists coach_fields_one_name on public.coach_fields (coach_id, applies_to, lower(btrim(name)));

create table if not exists public.coach_field_values (
  field_id      uuid not null references public.coach_fields (id) on delete cascade,
  item_id       uuid not null,
  coach_id      uuid not null references public.coaches (id) on delete cascade,
  value_text    text check (char_length(value_text) <= 2000),
  value_number  numeric,
  value_date    date,
  updated_at    timestamptz not null default now(),
  primary key (field_id, item_id)
);
create index if not exists coach_field_values_item_idx on public.coach_field_values (coach_id, item_id);

create table if not exists public.coach_views (
  id          uuid primary key default gen_random_uuid(),
  coach_id    uuid not null references public.coaches (id) on delete cascade,
  list        text not null check (list in ('clients', 'leads', 'todos', 'library', 'network', 'board')),
  name        text not null check (char_length(btrim(name)) between 1 and 60),
  filters     jsonb not null default '{}'::jsonb check (jsonb_typeof(filters) = 'object' and pg_column_size(filters) <= 8192),
  sort        text check (char_length(sort) <= 60),
  columns     jsonb not null default '[]'::jsonb check (jsonb_typeof(columns) = 'array' and pg_column_size(columns) <= 8192),
  layout      text check (char_length(layout) <= 20),
  favourite   boolean not null default false,
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.coach_views is 'Saved views for any list: filters, sort, columns and layout. Up to 5 favourites show in the menu.';
create index if not exists coach_views_coach_idx on public.coach_views (coach_id, list);

create or replace function public.coach_views_favourites()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.favourite and (tg_op = 'INSERT' or not old.favourite) then
    perform 1 from public.coaches c where c.id = new.coach_id for update;
    if (select count(*) from public.coach_views v where v.coach_id = new.coach_id and v.favourite and v.id <> new.id) >= 5 then
      raise exception 'Up to 5 views can be in the menu.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.coach_views_favourites() from public, anon, authenticated;
drop trigger if exists coach_views_favourites on public.coach_views;
create trigger coach_views_favourites before insert or update on public.coach_views
  for each row execute function public.coach_views_favourites();

-- ---------------------------------------------------------------- organisations
alter table public.organisations add column if not exists city text;
do $c$
begin
  if not exists (select 1 from pg_constraint where conname = 'organisations_city_len') then
    alter table public.organisations add constraint organisations_city_len check (city is null or char_length(city) <= 80);
  end if;
end
$c$;

create table if not exists public.organisation_contacts (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations (id) on delete cascade,
  name             text not null check (char_length(btrim(name)) between 1 and 120),
  email            text check (public.one_email_ok(email)),
  mobile           text check (mobile ~ '^\+[0-9]{6,15}$'),
  job_title        text check (char_length(job_title) <= 120),
  roles            text[] not null default '{}'::text[] check (roles <@ array['sponsor', 'invoices']::text[]),
  note             text check (char_length(note) <= 240),
  last_contact_on  date,
  last_contact_how text check (last_contact_how in ('spoke', 'emailed')),
  created_by       uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
comment on table public.organisation_contacts is 'Who''s who at an organisation: Sponsor, Invoices contact, or both. The owner''s.';
create index if not exists organisation_contacts_org_idx on public.organisation_contacts (organisation_id);
create index if not exists organisation_contacts_created_by_idx on public.organisation_contacts (created_by);

create table if not exists public.organisation_documents (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations (id) on delete cascade,
  name             text not null check (char_length(btrim(name)) between 1 and 200),
  storage_path     text check (char_length(storage_path) <= 600),
  expires_on       date,
  created_by       uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now()
);
comment on table public.organisation_documents is 'An organisation''s documents, each with an optional expiry. Owner only.';
create index if not exists organisation_documents_org_idx on public.organisation_documents (organisation_id);
create index if not exists organisation_documents_created_by_idx on public.organisation_documents (created_by);

-- Does the signed-in coach have a client at this organisation?
create or replace function public.coach_has_client_in(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.client_profiles p
    join public.coaches c on c.id = p.coach_id
    where p.organisation_id = p_org and p.merged_into is null
      and c.user_id = (select auth.uid()) and c.active
  );
$$;

-- ---------------------------------------------------------------- groups
create table if not exists public.coach_groups (
  id               uuid primary key default gen_random_uuid(),
  coach_id         uuid not null references public.coaches (id) on delete restrict,
  organisation_id  uuid references public.organisations (id) on delete set null,
  name             text not null check (char_length(btrim(name)) between 1 and 120),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists coach_groups_coach_idx on public.coach_groups (coach_id);
create index if not exists coach_groups_org_idx on public.coach_groups (organisation_id);

create or replace function public.coach_owns_group(p_group uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.coach_groups g where g.id = p_group and g.coach_id = public.my_coach_id());
$$;

create table if not exists public.coach_group_members (
  id              uuid primary key default gen_random_uuid(),
  group_id        uuid not null references public.coach_groups (id) on delete cascade,
  profile_id      uuid references public.client_profiles (id) on delete set null,
  name            text not null check (char_length(btrim(name)) between 1 and 120),
  email           text check (public.one_email_ok(email)),
  counts_against  text not null default 'group' check (counts_against in ('own', 'group')),
  created_at      timestamptz not null default now()
);
comment on column public.coach_group_members.counts_against is 'Whether a group session counts against the member''s own engagement or the group''s.';
create index if not exists coach_group_members_group_idx on public.coach_group_members (group_id);
create index if not exists coach_group_members_profile_idx on public.coach_group_members (profile_id);

-- ---------------------------------------------------------------- engagements
create table if not exists public.engagements (
  id                   uuid primary key default gen_random_uuid(),
  coach_id             uuid not null references public.coaches (id) on delete restrict,
  profile_id           uuid references public.client_profiles (id) on delete cascade,
  group_id             uuid references public.coach_groups (id) on delete cascade,
  kind                 text not null default 'sessions' check (kind in ('sessions', 'fixed_period', 'ongoing', 'pay_as_you_go', 'pro_bono')),
  name                 text check (char_length(name) <= 120),
  sessions_total       integer check (sessions_total between 0 and 1000),
  sessions_held        integer not null default 0 check (sessions_held between 0 and 1000),
  default_minutes      integer not null default 60 check (default_minutes between 5 and 600),
  every_weeks          integer check (every_weeks between 1 and 52),
  starts_on            date,
  ends_on              date,
  time_credit_minutes  integer check (time_credit_minutes between 0 and 600000),
  funded_by            text check (char_length(funded_by) <= 120),
  status               text not null default 'active' check (status in ('active', 'ended')),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  check ((profile_id is not null) <> (group_id is not null)),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);
comment on table public.engagements is
  'The engagement record (agreements and signatures are Phase 6b): sessions, a fixed period, ongoing, pay as you go or pro bono; for one client or a group. sessions_held is counted here until sessions arrive in 050.';
create index if not exists engagements_coach_idx on public.engagements (coach_id, status);
create index if not exists engagements_profile_idx on public.engagements (profile_id);
create index if not exists engagements_group_idx on public.engagements (group_id);

create or replace function public.coach_owns_engagement(p_engagement uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.engagements e where e.id = p_engagement and e.coach_id = public.my_coach_id());
$$;

create table if not exists public.engagement_packs (
  id             uuid primary key default gen_random_uuid(),
  engagement_id  uuid not null references public.engagements (id) on delete cascade,
  sessions       integer check (sessions between 1 and 1000),
  minutes        integer check (minutes between 1 and 600000),
  bought_on      date not null default current_date,
  note           text check (char_length(note) <= 240),
  created_at     timestamptz not null default now(),
  check ((sessions is not null) or (minutes is not null))
);
create index if not exists engagement_packs_engagement_idx on public.engagement_packs (engagement_id);

create table if not exists public.engagement_projects (
  id             uuid primary key default gen_random_uuid(),
  engagement_id  uuid not null references public.engagements (id) on delete cascade,
  name           text not null check (char_length(btrim(name)) between 1 and 120),
  position       integer not null default 0,
  created_at     timestamptz not null default now()
);
create index if not exists engagement_projects_engagement_idx on public.engagement_projects (engagement_id);

create table if not exists public.time_entries (
  id             uuid primary key default gen_random_uuid(),
  engagement_id  uuid not null references public.engagements (id) on delete cascade,
  project_id     uuid references public.engagement_projects (id) on delete set null,
  coach_id       uuid not null references public.coaches (id) on delete cascade,
  started_at     timestamptz not null,
  ended_at       timestamptz,
  note           text check (char_length(note) <= 240),
  created_at     timestamptz not null default now(),
  check (ended_at is null or ended_at >= started_at),
  check (ended_at is null or ended_at <= started_at + interval '24 hours')
);
comment on table public.time_entries is 'Clock in and Clock out against a time credit, to the minute. One running entry for each coach.';
create unique index if not exists time_entries_one_running on public.time_entries (coach_id) where ended_at is null;
create index if not exists time_entries_engagement_idx on public.time_entries (engagement_id, started_at desc);
create index if not exists time_entries_project_idx on public.time_entries (project_id);

-- ---------------------------------------------------------------- workshops
create table if not exists public.workshops (
  id                    uuid primary key default gen_random_uuid(),
  coach_id              uuid not null references public.coaches (id) on delete restrict,
  organisation_id       uuid references public.organisations (id) on delete set null,
  title                 text not null check (char_length(btrim(title)) between 1 and 80),
  starts_at             timestamptz,
  ends_at               timestamptz,
  time_zone             text check (public.zone_name_ok(time_zone)),
  place                 text check (char_length(place) <= 120),
  capacity              integer not null default 20 check (capacity between 1 and 2000),
  page_key              uuid not null default gen_random_uuid(),
  registration_open     boolean not null default false,
  registration_closes_on date,
  questions             jsonb not null default '[]'::jsonb check (jsonb_typeof(questions) = 'array' and pg_column_size(questions) <= 8192),
  remind_day_before     boolean not null default true,
  remind_hour_before    boolean not null default false,
  survey_on             boolean not null default true,
  survey_questions      jsonb not null default '[]'::jsonb check (jsonb_typeof(survey_questions) = 'array' and pg_column_size(survey_questions) <= 8192),
  survey_sent_on        date,
  follow_up             text check (char_length(follow_up) <= 4000),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at >= starts_at)
);
comment on table public.workshops is 'A workshop: when and where, capacity, the registration page (page_key) and its questions, reminders, the follow-up and the survey.';
create unique index if not exists workshops_page_key on public.workshops (page_key);
create index if not exists workshops_coach_idx on public.workshops (coach_id, starts_at);
create index if not exists workshops_org_idx on public.workshops (organisation_id);

create or replace function public.coach_owns_workshop(p_workshop uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.workshops w where w.id = p_workshop and w.coach_id = public.my_coach_id());
$$;

create table if not exists public.workshop_attendees (
  id             uuid primary key default gen_random_uuid(),
  workshop_id    uuid not null references public.workshops (id) on delete cascade,
  name           text check (char_length(name) <= 120),
  email          text not null check (public.one_email_ok(email)),
  status         text not null default 'registered' check (status in ('registered', 'waiting', 'cancelled')),
  answers        jsonb not null default '{}'::jsonb check (jsonb_typeof(answers) = 'object' and pg_column_size(answers) <= 20000),
  attended       boolean not null default false,
  source         text not null default 'pasted' check (source in ('pasted', 'page')),
  survey_key     uuid not null default gen_random_uuid(),
  registered_at  timestamptz not null default now()
);
comment on table public.workshop_attendees is 'Attendees are emails, not clients. Registered or on the waiting list; attendance is ticked on the day.';
create unique index if not exists workshop_attendees_one_email on public.workshop_attendees (workshop_id, email);
create unique index if not exists workshop_attendees_survey_key on public.workshop_attendees (survey_key);

create table if not exists public.workshop_materials (
  id            uuid primary key default gen_random_uuid(),
  workshop_id   uuid not null references public.workshops (id) on delete cascade,
  name          text not null check (char_length(btrim(name)) between 1 and 200),
  storage_path  text check (char_length(storage_path) <= 600),
  link          text check (char_length(link) <= 600 and link ~ '^https://'),
  created_at    timestamptz not null default now()
);
create index if not exists workshop_materials_workshop_idx on public.workshop_materials (workshop_id);

create table if not exists public.workshop_survey_answers (
  id            uuid primary key default gen_random_uuid(),
  workshop_id   uuid not null references public.workshops (id) on delete cascade,
  attendee_id   uuid not null references public.workshop_attendees (id) on delete cascade,
  answers       jsonb not null check (jsonb_typeof(answers) = 'object' and pg_column_size(answers) <= 20000),
  submitted_at  timestamptz not null default now(),
  unique (attendee_id)
);
create index if not exists workshop_survey_answers_workshop_idx on public.workshop_survey_answers (workshop_id);

-- ---------------------------------------------------------------- records
create table if not exists public.activity_log (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references auth.users (id) on delete set null,
  actor_name  text check (char_length(actor_name) <= 120),
  kind        text not null check (kind in ('agreement', 'price', 'move', 'merge', 'delete', 'coach', 'export', 'other')),
  summary     text not null check (char_length(btrim(summary)) between 1 and 300),
  item        jsonb not null default '{}'::jsonb check (jsonb_typeof(item) = 'object' and pg_column_size(item) <= 4096),
  created_at  timestamptz not null default now()
);
comment on table public.activity_log is 'Who, what, when: agreements, prices, moving clients, merges and deletions. The owner reads it; rows are only ever added.';
create index if not exists activity_log_when_idx on public.activity_log (created_at desc);
create index if not exists activity_log_actor_idx on public.activity_log (actor_id);

create table if not exists public.data_requests (
  id            uuid primary key default gen_random_uuid(),
  coach_id      uuid not null references public.coaches (id) on delete cascade,
  profile_id    uuid references public.client_profiles (id) on delete set null,
  person_name   text not null check (char_length(btrim(person_name)) between 1 and 120),
  kind          text not null check (kind in ('export', 'delete')),
  requested_on  date not null default current_date,
  done_at       timestamptz,
  created_at    timestamptz not null default now()
);
comment on table public.data_requests is 'Data requests: an export or a deletion, dated.';
create index if not exists data_requests_coach_idx on public.data_requests (coach_id, requested_on desc);
create index if not exists data_requests_profile_idx on public.data_requests (profile_id);

create table if not exists public.coach_notifications (
  id          uuid primary key default gen_random_uuid(),
  coach_id    uuid not null references public.coaches (id) on delete cascade,
  kind        text not null check (kind in ('booking', 'agreement', 'payment', 'support', 'call', 'sharing', 'library', 'workshop', 'profile', 'other')),
  title       text not null check (char_length(btrim(title)) between 1 and 160),
  detail      text check (char_length(detail) <= 240),
  item_kind   text check (char_length(item_kind) <= 40),
  item_id     uuid,
  created_at  timestamptz not null default now(),
  read_at     timestamptz
);
comment on table public.coach_notifications is 'The bell: one row per thing a coach is told. The coach marks them read; only the database adds them.';
create index if not exists coach_notifications_coach_idx on public.coach_notifications (coach_id, created_at desc);
create index if not exists coach_notifications_unread_idx on public.coach_notifications (coach_id) where read_at is null;

-- ---------------------------------------------------------------- updated_at
do $touch$
declare t text;
begin
  foreach t in array array[
    'coach_settings', 'coach_profiles', 'client_profiles', 'client_about', 'client_notes', 'coach_fields',
    'coach_field_values', 'coach_views', 'organisation_contacts', 'coach_groups', 'engagements', 'workshops'
  ] loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.p1_touch()', t || '_touch', t);
  end loop;
end
$touch$;

-- A coach's change to their own profile takes the approval off; only the
-- owner's approval function puts it back.
create or replace function public.coach_profiles_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('clarity.approving', true), '') = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.approved_at := null; new.approved_by := null; new.edit_asked_at := null;
    return new;
  end if;
  new.approved_by := old.approved_by; new.edit_asked_at := old.edit_asked_at;
  if new.bio is distinct from old.bio or new.photo_path is distinct from old.photo_path
     or new.specialisms is distinct from old.specialisms then
    new.approved_at := null; new.approved_by := null;
  else
    new.approved_at := old.approved_at;
  end if;
  return new;
end;
$$;
revoke all on function public.coach_profiles_guard() from public, anon, authenticated;
drop trigger if exists coach_profiles_guard on public.coach_profiles;
create trigger coach_profiles_guard before insert or update on public.coach_profiles
  for each row execute function public.coach_profiles_guard();

-- ---------------------------------------------------------------- row security
do $lock$
declare t text;
begin
  foreach t in array array[
    'coach_settings', 'coach_profiles', 'coach_cover', 'client_profiles', 'client_profile_coaches', 'client_about',
    'client_notes', 'client_files', 'client_view_requests', 'client_merges', 'coach_tags', 'coach_tag_links',
    'coach_fields', 'coach_field_values', 'coach_views', 'organisation_contacts', 'organisation_documents',
    'coach_groups', 'coach_group_members', 'engagements', 'engagement_packs', 'engagement_projects', 'time_entries',
    'workshops', 'workshop_attendees', 'workshop_materials', 'workshop_survey_answers', 'activity_log',
    'data_requests', 'coach_notifications'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
  end loop;
end
$lock$;

-- Every rule below is dropped and made again by this one helper (this
-- session only): the table, the rule's name, what it is for, who it lets
-- through, and what a new or changed row must satisfy.
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
  -- Own rows by coach: settings, tags, fields, views, merges, data requests.
  foreach t in array array['coach_settings', 'coach_tags', 'coach_tag_links', 'coach_fields', 'coach_field_values', 'coach_views'] loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    perform pg_temp.rule(t, 'Coach: own rows', 'all', mine, mine);
  end loop;

  grant select on public.client_merges to authenticated;
  perform pg_temp.rule('client_merges', 'Coach: own merges', 'select', mine);

  grant select, insert, update on public.data_requests to authenticated;
  perform pg_temp.rule('data_requests', 'Coach: own requests, read', 'select', mine || ' or (select public.is_owner())');
  perform pg_temp.rule('data_requests', 'Coach: own requests, add', 'insert', null, mine);
  perform pg_temp.rule('data_requests', 'Coach: own requests, change', 'update', mine, mine);

  -- coach_profiles: the coach's own, and the owner reads every one.
  grant select, insert, update on public.coach_profiles to authenticated;
  perform pg_temp.rule('coach_profiles', 'Coach: own profile, read', 'select', mine || ' or (select public.is_owner())');
  perform pg_temp.rule('coach_profiles', 'Coach: own profile, add', 'insert', null, mine);
  perform pg_temp.rule('coach_profiles', 'Coach: own profile, change', 'update', mine, mine);

  -- coach_cover: the owner sets it; the two coaches read it.
  grant select, insert, update, delete on public.coach_cover to authenticated;
  perform pg_temp.rule('coach_cover', 'Cover: read', 'select',
    '(select public.is_owner()) or coach_id = (select public.my_coach_id()) or cover_coach_id = (select public.my_coach_id())');
  perform pg_temp.rule('coach_cover', 'Cover: owner adds', 'insert', null, '(select public.is_owner())');
  perform pg_temp.rule('coach_cover', 'Cover: owner changes', 'update', '(select public.is_owner())', '(select public.is_owner())');
  perform pg_temp.rule('coach_cover', 'Cover: owner removes', 'delete', '(select public.is_owner())');

  -- client_profiles: the coach's own list. A cover coach reads the row
  -- between the dates; the client reads their own. The owner adds a client
  -- for any coach, and reads associates' clients only through
  -- coach_admin_clients().
  grant select, insert, update, delete on public.client_profiles to authenticated;
  perform pg_temp.rule('client_profiles', 'Profiles: read', 'select',
    mine || ' or user_id = (select auth.uid()) or (select public.covers_profile(id))');
  perform pg_temp.rule('client_profiles', 'Profiles: add', 'insert', null, mine || ' or (select public.is_owner())');
  perform pg_temp.rule('client_profiles', 'Profiles: change', 'update', mine, mine);
  -- A coach takes back a client they have just added (Undo). Deleting a
  -- client's data for good goes through client_delete(), which is logged.
  perform pg_temp.rule('client_profiles', 'Profiles: remove own', 'delete', mine || ' and user_id is null');

  grant select on public.client_profile_coaches to authenticated;
  perform pg_temp.rule('client_profile_coaches', 'Profile coaches: read', 'select', mine || ' or (select public.is_owner())');

  -- About them and private notes: the coach's alone, for their own clients.
  foreach t in array array['client_about', 'client_notes'] loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    perform pg_temp.rule(t, 'Coach alone', 'all',
      mine || ' and (select public.coach_owns_profile(profile_id))', mine || ' and (select public.coach_owns_profile(profile_id))');
  end loop;

  -- client_files: the client and their coach, both ways.
  grant select, insert, delete on public.client_files to authenticated;
  perform pg_temp.rule('client_files', 'Files: read', 'select',
    '(select public.coach_owns_profile(profile_id)) or (select public.profile_is_mine(profile_id))');
  perform pg_temp.rule('client_files', 'Files: add', 'insert', null,
    'added_by_user = (select auth.uid()) and ((added_by = ''coach'' and (select public.coach_owns_profile(profile_id))) or (added_by = ''client'' and (select public.profile_is_mine(profile_id))))');
  perform pg_temp.rule('client_files', 'Files: remove own', 'delete',
    'added_by_user = (select auth.uid()) and ((select public.coach_owns_profile(profile_id)) or (select public.profile_is_mine(profile_id)))');

  grant select, insert on public.client_view_requests to authenticated;
  perform pg_temp.rule('client_view_requests', 'View requests: read', 'select',
    mine || ' or (select public.profile_is_mine(profile_id))');
  perform pg_temp.rule('client_view_requests', 'View requests: coach asks', 'insert', null,
    mine || ' and (select public.coach_owns_profile(profile_id)) and answered_at is null and allowed is null and expires_at is null');

  -- Organisations: a coach reads the ones their own clients are in (026
  -- already lets the owner, an admin and a member read). Contacts and
  -- documents are the owner's.
  perform pg_temp.rule('organisations', 'Organisations: a client''s coach reads', 'select', '(select public.coach_has_client_in(id))');
  foreach t in array array['organisation_contacts', 'organisation_documents'] loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    perform pg_temp.rule(t, 'Owner only', 'all', '(select public.is_owner())', '(select public.is_owner())');
  end loop;

  -- Groups and workshops: the coach's own, with their parts.
  foreach t in array array['coach_groups', 'workshops'] loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    perform pg_temp.rule(t, 'Coach: own rows', 'all', mine, mine);
  end loop;
  grant select, insert, update, delete on public.coach_group_members to authenticated;
  perform pg_temp.rule('coach_group_members', 'Coach: own group', 'all',
    '(select public.coach_owns_group(group_id))',
    '(select public.coach_owns_group(group_id)) and (profile_id is null or (select public.coach_owns_profile(profile_id)))');
  foreach t in array array['workshop_attendees', 'workshop_materials'] loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    perform pg_temp.rule(t, 'Coach: own workshop', 'all',
      '(select public.coach_owns_workshop(workshop_id))', '(select public.coach_owns_workshop(workshop_id))');
  end loop;
  grant select on public.workshop_survey_answers to authenticated;
  perform pg_temp.rule('workshop_survey_answers', 'Coach: own workshop', 'select', '(select public.coach_owns_workshop(workshop_id))');

  -- Engagements: the coach's own; the owner reads every one (admin facts).
  grant select, insert, update, delete on public.engagements to authenticated;
  perform pg_temp.rule('engagements', 'Engagements: read', 'select', mine || ' or (select public.is_owner())');
  perform pg_temp.rule('engagements', 'Engagements: add', 'insert', null,
    mine || ' and (profile_id is null or (select public.coach_owns_profile(profile_id))) and (group_id is null or (select public.coach_owns_group(group_id)))');
  perform pg_temp.rule('engagements', 'Engagements: change', 'update', mine,
    mine || ' and (profile_id is null or (select public.coach_owns_profile(profile_id))) and (group_id is null or (select public.coach_owns_group(group_id)))');
  perform pg_temp.rule('engagements', 'Engagements: remove', 'delete', mine);
  foreach t in array array['engagement_packs', 'engagement_projects'] loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    perform pg_temp.rule(t, 'Engagement parts: read', 'select',
      '(select public.coach_owns_engagement(engagement_id)) or (select public.is_owner())');
    perform pg_temp.rule(t, 'Engagement parts: add', 'insert', null, '(select public.coach_owns_engagement(engagement_id))');
    perform pg_temp.rule(t, 'Engagement parts: change', 'update',
      '(select public.coach_owns_engagement(engagement_id))', '(select public.coach_owns_engagement(engagement_id))');
    perform pg_temp.rule(t, 'Engagement parts: remove', 'delete', '(select public.coach_owns_engagement(engagement_id))');
  end loop;
  grant select, insert, update, delete on public.time_entries to authenticated;
  perform pg_temp.rule('time_entries', 'Time: read', 'select', mine || ' or (select public.is_owner())');
  perform pg_temp.rule('time_entries', 'Time: add', 'insert', null, mine || ' and (select public.coach_owns_engagement(engagement_id))');
  perform pg_temp.rule('time_entries', 'Time: change', 'update', mine, mine || ' and (select public.coach_owns_engagement(engagement_id))');
  perform pg_temp.rule('time_entries', 'Time: remove', 'delete', mine);

  -- The activity log: the owner reads; rows come only from log_activity().
  grant select on public.activity_log to authenticated;
  perform pg_temp.rule('activity_log', 'Activity: owner reads', 'select', '(select public.is_owner())');

  -- The bell: a coach reads their own and marks them read.
  grant select, update on public.coach_notifications to authenticated;
  perform pg_temp.rule('coach_notifications', 'Bell: own, read', 'select', mine);
  perform pg_temp.rule('coach_notifications', 'Bell: own, mark read', 'update', mine, mine);
end
$rules$;

-- Marking a notification read changes nothing else about it.
create or replace function public.coach_notifications_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.coach_id := old.coach_id; new.kind := old.kind; new.title := old.title; new.detail := old.detail;
  new.item_kind := old.item_kind; new.item_id := old.item_id; new.created_at := old.created_at;
  return new;
end;
$$;
revoke all on function public.coach_notifications_guard() from public, anon, authenticated;
drop trigger if exists coach_notifications_guard on public.coach_notifications;
create trigger coach_notifications_guard before update on public.coach_notifications
  for each row execute function public.coach_notifications_guard();

-- ---------------------------------------------------------------- functions: records
create or replace function public._coach_notify(p_coach uuid, p_kind text, p_title text, p_detail text, p_item_kind text, p_item uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.coach_notifications (coach_id, kind, title, detail, item_kind, item_id)
  values (p_coach, p_kind, left(p_title, 160), left(p_detail, 240), p_item_kind, p_item);
$$;
revoke all on function public._coach_notify(uuid, text, text, text, text, uuid) from public, anon, authenticated;

create or replace function public._log_activity(p_kind text, p_summary text, p_item jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.activity_log (actor_id, actor_name, kind, summary, item)
  values ((select auth.uid()),
          (select coalesce(c.full_name, c.display_first_name) from public.coaches c where c.user_id = (select auth.uid())),
          p_kind, left(p_summary, 300), coalesce(p_item, '{}'::jsonb));
$$;
revoke all on function public._log_activity(text, text, jsonb) from public, anon, authenticated;

-- A coach records something in the Activity log (an export, for one).
create or replace function public.log_activity(p_kind text, p_summary text, p_item jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_coach() then
    raise exception 'Only a coach can do this.' using errcode = '42501';
  end if;
  if p_kind not in ('export', 'other') then
    raise exception 'That kind is recorded by the portal itself.' using errcode = '22023';
  end if;
  perform public._log_activity(p_kind, p_summary, p_item);
end;
$$;
revoke all on function public.log_activity(text, text, jsonb) from public, anon;
grant execute on function public.log_activity(text, text, jsonb) to authenticated;

-- ---------------------------------------------------------------- functions: coaches
-- A coach changes their own name clients see, mobile and ways to reach them.
create or replace function public.coach_save_details(p_first_name text, p_full_name text, p_mobile text, p_contact_ways text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.coaches
  set display_first_name = btrim(p_first_name), full_name = nullif(btrim(coalesce(p_full_name, '')), ''),
      mobile = nullif(btrim(coalesce(p_mobile, '')), ''), contact_ways = coalesce(p_contact_ways, '{}'::text[])
  where user_id = (select auth.uid()) and active;
  if not found then
    raise exception 'Only a coach can do this.' using errcode = '42501';
  end if;
end;
$$;
revoke all on function public.coach_save_details(text, text, text, text[]) from public, anon;
grant execute on function public.coach_save_details(text, text, text, text[]) to authenticated;

create or replace function public.coach_profile_decide(p_coach uuid, p_approve boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_rows integer;
begin
  if not public.is_owner() then
    raise exception 'Only the owner can do this.' using errcode = '42501';
  end if;
  perform set_config('clarity.approving', 'on', true);
  if p_approve then
    update public.coach_profiles set approved_at = now(), approved_by = (select auth.uid()), edit_asked_at = null where coach_id = p_coach;
  else
    update public.coach_profiles set approved_at = null, approved_by = null, edit_asked_at = now() where coach_id = p_coach;
  end if;
  get diagnostics v_rows = row_count;
  perform set_config('clarity.approving', '', true);
  if v_rows = 0 then
    raise exception 'That coach has no profile yet.' using errcode = '22023';
  end if;
  select coalesce(full_name, display_first_name) into v_name from public.coaches where id = p_coach;
  perform public._coach_notify(p_coach, 'profile',
    case when p_approve then 'Your profile is approved' else 'An edit to your profile is asked for' end, null, 'profile', p_coach);
  perform public._log_activity('coach',
    case when p_approve then 'approved ' else 'asked for an edit to ' end || v_name || '’s profile.', jsonb_build_object('coach_id', p_coach));
end;
$$;
revoke all on function public.coach_profile_decide(uuid, boolean) from public, anon;
grant execute on function public.coach_profile_decide(uuid, boolean) to authenticated;

-- A coach is switched off only once their clients are moved.
create or replace function public.coach_switch(p_coach uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_name text;
begin
  if not public.is_owner() then
    raise exception 'Only the owner can do this.' using errcode = '42501';
  end if;
  if exists (select 1 from public.coaches where id = p_coach and role = 'owner') then
    raise exception 'The owner stays on.' using errcode = '22023';
  end if;
  if not p_active and exists (
    select 1 from public.client_profiles p where p.coach_id = p_coach and p.merged_into is null and p.status <> 'past'
  ) then
    raise exception 'Move this coach''s clients first.' using errcode = '23514';
  end if;
  update public.coaches set active = p_active where id = p_coach returning coalesce(full_name, display_first_name) into v_name;
  if not found then
    raise exception 'That coach isn''t here.' using errcode = '22023';
  end if;
  perform public._log_activity('coach', 'switched ' || v_name || case when p_active then ' on.' else ' off.' end, jsonb_build_object('coach_id', p_coach));
end;
$$;
revoke all on function public.coach_switch(uuid, boolean) from public, anon;
grant execute on function public.coach_switch(uuid, boolean) to authenticated;

-- The coaches, for the lists that name them (Move to a coach, "Maya's
-- client"): the owner gets every coach with their admin facts; an associate
-- gets only names.
create or replace function public.coach_list()
returns table (coach_id uuid, first_name text, full_name text, role text, active boolean, is_me boolean,
               clients bigint, hourly_rate numeric, rate_currency text, profile_waiting boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.display_first_name, c.full_name, c.role, c.active, c.user_id = (select auth.uid()),
         case when public.is_owner() then (select count(*) from public.client_profiles p where p.coach_id = c.id and p.merged_into is null and p.status <> 'past') end,
         case when public.is_owner() then c.hourly_rate end,
         case when public.is_owner() then c.rate_currency end,
         case when public.is_owner() then exists (select 1 from public.coach_profiles cp where cp.coach_id = c.id and cp.approved_at is null and cp.submitted_at is not null) end
  from public.coaches c
  where public.is_coach() and (c.active or public.is_owner())
  order by (c.role = 'owner') desc, c.display_first_name;
$$;
revoke all on function public.coach_list() from public, anon;
grant execute on function public.coach_list() to authenticated;

-- ---------------------------------------------------------------- functions: clients
-- The owner's admin facts for every client: name, coach, organisation,
-- status and the engagement with its sessions. Never coaching content.
create or replace function public.coach_admin_clients()
returns table (profile_id uuid, name text, coach_id uuid, coach_first_name text, organisation_id uuid,
               organisation_name text, status text, engagement_kind text, sessions_total integer,
               sessions_held integer, time_credit_minutes integer, ends_on date)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_owner() then
    raise exception 'Only the owner can do this.' using errcode = '42501';
  end if;
  return query
  select p.id, p.name, p.coach_id, c.display_first_name, p.organisation_id, o.name, p.status,
         e.kind,
         (e.sessions_total + coalesce((select sum(k.sessions) from public.engagement_packs k where k.engagement_id = e.id), 0))::integer,
         e.sessions_held, e.time_credit_minutes, e.ends_on
  from public.client_profiles p
  join public.coaches c on c.id = p.coach_id
  left join public.organisations o on o.id = p.organisation_id
  left join lateral (
    select * from public.engagements e2
    where e2.profile_id = p.id and e2.status = 'active' order by e2.created_at desc limit 1
  ) e on true
  where p.merged_into is null
  order by p.name;
end;
$$;
revoke all on function public.coach_admin_clients() from public, anon;
grant execute on function public.coach_admin_clients() to authenticated;

-- The owner adds a client for another coach. (A plain save can't hand the
-- new row back, because the owner may not read an associate's client.)
create or replace function public.client_add_for(p_coach uuid, p_id uuid, p_name text, p_email text default null, p_organisation uuid default null,
                                                 p_time_zone text default null, p_frequent_traveller boolean default false, p_referred_by text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_to text;
begin
  if not public.is_owner() then
    raise exception 'Only the owner can do this.' using errcode = '42501';
  end if;
  select display_first_name into v_to from public.coaches where id = p_coach and active;
  if v_to is null then
    raise exception 'Choose a coach who is switched on.' using errcode = '22023';
  end if;
  insert into public.client_profiles (id, coach_id, name, email, organisation_id, time_zone, frequent_traveller, referred_by)
  values (coalesce(p_id, gen_random_uuid()), p_coach, btrim(p_name), nullif(lower(btrim(coalesce(p_email, ''))), ''), p_organisation,
          p_time_zone, coalesce(p_frequent_traveller, false), nullif(btrim(coalesce(p_referred_by, '')), ''))
  returning id into p_id;
  return p_id;
end;
$$;
revoke all on function public.client_add_for(uuid, uuid, text, text, uuid, text, boolean, text) from public, anon;
grant execute on function public.client_add_for(uuid, uuid, text, text, uuid, text, boolean, text) to authenticated;

-- Move to a coach (owner). Returns the coach the client had, for Undo.
create or replace function public.client_move(p_profile uuid, p_to_coach uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v record;
  v_to text;
begin
  if not public.is_owner() then
    raise exception 'Only the owner can do this.' using errcode = '42501';
  end if;
  select p.id, p.name, p.coach_id, p.user_id into v from public.client_profiles p where p.id = p_profile and p.merged_into is null for update;
  if not found then
    raise exception 'That client isn''t here any more.' using errcode = '22023';
  end if;
  select coalesce(full_name, display_first_name) into v_to from public.coaches where id = p_to_coach and active;
  if v_to is null then
    raise exception 'Choose a coach who is switched on.' using errcode = '22023';
  end if;
  if v.coach_id = p_to_coach then
    return v.coach_id;
  end if;
  perform set_config('clarity.moving', 'on', true);
  update public.client_profiles set coach_id = p_to_coach where id = p_profile;
  perform set_config('clarity.moving', '', true);
  -- what belongs to the client's engagement goes with them; About them,
  -- notes, tags, fields and views stay with the coach who wrote them.
  update public.engagements set coach_id = p_to_coach where profile_id = p_profile;
  if v.user_id is not null then
    update public.coach_clients set ended_at = now(), changed_by = (select auth.uid()) where client_id = v.user_id and ended_at is null;
    insert into public.coach_clients (client_id, coach_id, changed_by) values (v.user_id, p_to_coach, (select auth.uid()));
  end if;
  perform public._log_activity('move', 'moved ' || v.name || ' to ' || v_to || '.', jsonb_build_object('profile_id', p_profile, 'from', v.coach_id, 'to', p_to_coach));
  return v.coach_id;
end;
$$;
revoke all on function public.client_move(uuid, uuid) from public, anon;
grant execute on function public.client_move(uuid, uuid) to authenticated;

-- Invite to the portal: only records that the coach pressed it. Nothing is
-- sent from here.
create or replace function public.client_invite(p_profile uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.coach_owns_profile(p_profile) then
    raise exception 'That client isn''t yours.' using errcode = '42501';
  end if;
  if exists (select 1 from public.client_profiles where id = p_profile and email is null) then
    raise exception 'Add an email first.' using errcode = '22023';
  end if;
  update public.client_profiles set invited_at = now() where id = p_profile and user_id is null;
end;
$$;
revoke all on function public.client_invite(uuid) from public, anon;
grant execute on function public.client_invite(uuid) to authenticated;

-- The signed-in person's open invites (their own confirmed email only).
create or replace function public.my_coach_invites()
returns table (profile_id uuid, coach_first_name text, invited_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, c.display_first_name, p.invited_at
  from public.client_profiles p
  join public.coaches c on c.id = p.coach_id and c.active
  join auth.users u on u.id = (select auth.uid())
  where p.user_id is null and p.merged_into is null and p.invited_at is not null
    and u.email_confirmed_at is not null and lower(u.email) = p.email;
$$;
revoke all on function public.my_coach_invites() from public, anon;
grant execute on function public.my_coach_invites() to authenticated;

-- The person accepts: the profile is linked to their account and its coach
-- becomes their coach. It never replaces a coach they already have.
create or replace function public.client_accept_invite(p_profile uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v record;
begin
  if not exists (select 1 from public.my_coach_invites() i where i.profile_id = p_profile) then
    raise exception 'That invite isn''t open.' using errcode = '42501';
  end if;
  select p.id, p.coach_id into v from public.client_profiles p where p.id = p_profile for update;
  if exists (select 1 from public.client_profiles p where p.user_id = v_me and p.merged_into is null) then
    return 'already_linked';
  end if;
  if exists (select 1 from public.coach_clients cc where cc.client_id = v_me and cc.ended_at is null and cc.coach_id <> v.coach_id) then
    return 'has_another_coach';
  end if;
  perform set_config('clarity.linking', 'on', true);
  update public.client_profiles set user_id = v_me where id = p_profile;
  perform set_config('clarity.linking', '', true);
  if not exists (select 1 from public.coach_clients cc where cc.client_id = v_me and cc.ended_at is null) then
    insert into public.coach_clients (client_id, coach_id, changed_by) values (v_me, v.coach_id, v_me);
  end if;
  perform public._coach_notify(v.coach_id, 'other', 'A client joined the portal', null, 'client', p_profile);
  return 'linked';
end;
$$;
revoke all on function public.client_accept_invite(uuid) from public, anon;
grant execute on function public.client_accept_invite(uuid) to authenticated;

-- The client answers "May your coach view your portal?"; a yes lasts 30 minutes.
create or replace function public.client_view_answer(p_request uuid, p_allowed boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.client_view_requests r
  set answered_at = now(), allowed = p_allowed, expires_at = case when p_allowed then now() + interval '30 minutes' end
  where r.id = p_request and r.answered_at is null and public.profile_is_mine(r.profile_id);
  if not found then
    raise exception 'That request isn''t open.' using errcode = '42501';
  end if;
end;
$$;
revoke all on function public.client_view_answer(uuid, boolean) from public, anon;
grant execute on function public.client_view_answer(uuid, boolean) to authenticated;

-- The client agrees to cover (the owner can record their yes as well).
create or replace function public.cover_agree(p_cover uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.coach_cover cv set client_agreed_at = now()
  where cv.id = p_cover and cv.client_agreed_at is null and public.profile_is_mine(cv.profile_id);
  if not found then
    raise exception 'That isn''t yours to agree.' using errcode = '42501';
  end if;
end;
$$;
revoke all on function public.cover_agree(uuid) from public, anon;
grant execute on function public.cover_agree(uuid) to authenticated;

-- Merge two of a coach's own profiles into one. p_values holds the fields
-- to keep from the one being merged away (only those named). Everything
-- attached moves across, and what moved is kept so Undo can put it back.
create or replace function public.client_merge(p_keep uuid, p_drop uuid, p_values jsonb default '{}'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_coach uuid := public.my_coach_id();
  k public.client_profiles%rowtype;
  d public.client_profiles%rowtype;
  v_moved jsonb := '{}'::jsonb;
  v_ids jsonb;
  v_merge uuid := gen_random_uuid();
begin
  if p_keep = p_drop then
    raise exception 'Choose two different people to merge.' using errcode = '22023';
  end if;
  if v_coach is null or not public.coach_owns_profile(p_keep) or not public.coach_owns_profile(p_drop) then
    raise exception 'Both clients must be yours.' using errcode = '42501';
  end if;
  select * into k from public.client_profiles where id = least(p_keep, p_drop) for update;
  select * into d from public.client_profiles where id = greatest(p_keep, p_drop) for update;
  select * into k from public.client_profiles where id = p_keep;
  select * into d from public.client_profiles where id = p_drop;
  if k.merged_into is not null or d.merged_into is not null then
    raise exception 'One of these has already been merged.' using errcode = '22023';
  end if;
  if k.user_id is not null and d.user_id is not null then
    raise exception 'Both have a portal account, so they stay two people.' using errcode = '22023';
  end if;

  with m as (update public.client_notes set profile_id = p_keep where profile_id = p_drop and coach_id = v_coach returning id)
  select coalesce(jsonb_agg(id), '[]'::jsonb) into v_ids from m;
  v_moved := v_moved || jsonb_build_object('notes', v_ids);
  with m as (update public.client_files set profile_id = p_keep where profile_id = p_drop returning id)
  select coalesce(jsonb_agg(id), '[]'::jsonb) into v_ids from m;
  v_moved := v_moved || jsonb_build_object('files', v_ids);
  with m as (update public.engagements set profile_id = p_keep where profile_id = p_drop returning id)
  select coalesce(jsonb_agg(id), '[]'::jsonb) into v_ids from m;
  v_moved := v_moved || jsonb_build_object('engagements', v_ids);
  with m as (update public.coach_group_members set profile_id = p_keep where profile_id = p_drop returning id)
  select coalesce(jsonb_agg(id), '[]'::jsonb) into v_ids from m;
  v_moved := v_moved || jsonb_build_object('members', v_ids);
  with m as (
    update public.coach_tag_links l set item_id = p_keep
    where l.item_kind = 'client' and l.item_id = p_drop and l.coach_id = v_coach
      and not exists (select 1 from public.coach_tag_links x where x.tag_id = l.tag_id and x.item_kind = 'client' and x.item_id = p_keep)
    returning tag_id)
  select coalesce(jsonb_agg(tag_id), '[]'::jsonb) into v_ids from m;
  v_moved := v_moved || jsonb_build_object('tags', v_ids);
  with m as (
    update public.coach_field_values fv set item_id = p_keep
    where fv.item_id = p_drop and fv.coach_id = v_coach
      and not exists (select 1 from public.coach_field_values x where x.field_id = fv.field_id and x.item_id = p_keep)
    returning field_id)
  select coalesce(jsonb_agg(field_id), '[]'::jsonb) into v_ids from m;
  v_moved := v_moved || jsonb_build_object('fields', v_ids);
  if not exists (select 1 from public.client_about a where a.profile_id = p_keep and a.coach_id = v_coach) then
    update public.client_about set profile_id = p_keep where profile_id = p_drop and coach_id = v_coach;
    v_moved := v_moved || jsonb_build_object('about', found);
  end if;

  insert into public.client_merges (id, coach_id, kept_id, dropped_id, before, moved)
  values (v_merge, v_coach, p_keep, p_drop, jsonb_build_object('keep', to_jsonb(k), 'drop', to_jsonb(d)), v_moved);

  perform set_config('clarity.linking', 'on', true);
  update public.client_profiles set user_id = null, merged_into = p_keep where id = p_drop;
  update public.client_profiles set
    name               = case when p_values ? 'name' then d.name else k.name end,
    email              = case when p_values ? 'email' then d.email else coalesce(k.email, d.email) end,
    mobile             = case when p_values ? 'mobile' then d.mobile else coalesce(k.mobile, d.mobile) end,
    organisation_id    = case when p_values ? 'organisation_id' then d.organisation_id else coalesce(k.organisation_id, d.organisation_id) end,
    job_title          = case when p_values ? 'job_title' then d.job_title else coalesce(k.job_title, d.job_title) end,
    city               = case when p_values ? 'city' then d.city else coalesce(k.city, d.city) end,
    time_zone          = case when p_values ? 'time_zone' then d.time_zone else coalesce(k.time_zone, d.time_zone) end,
    referred_by        = case when p_values ? 'referred_by' then d.referred_by else coalesce(k.referred_by, d.referred_by) end,
    frequent_traveller = k.frequent_traveller or d.frequent_traveller,
    user_id            = coalesce(k.user_id, d.user_id),
    invited_at         = coalesce(k.invited_at, d.invited_at)
  where id = p_keep;
  perform set_config('clarity.linking', '', true);

  perform public._log_activity('merge', 'merged ' || d.name || ' into ' || k.name || '.', jsonb_build_object('merge_id', v_merge));
  return v_merge;
end;
$$;
revoke all on function public.client_merge(uuid, uuid, jsonb) from public, anon;
grant execute on function public.client_merge(uuid, uuid, jsonb) to authenticated;

create or replace function public.client_unmerge(p_merge uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_coach uuid := public.my_coach_id();
  m public.client_merges%rowtype;
  k jsonb;
  d jsonb;
begin
  select * into m from public.client_merges where id = p_merge and coach_id = v_coach and undone_at is null for update;
  if not found then
    raise exception 'That merge can''t be undone any more.' using errcode = '22023';
  end if;
  k := m.before -> 'keep'; d := m.before -> 'drop';
  update public.client_notes set profile_id = m.dropped_id where id in (select (jsonb_array_elements_text(m.moved -> 'notes'))::uuid);
  update public.client_files set profile_id = m.dropped_id where id in (select (jsonb_array_elements_text(m.moved -> 'files'))::uuid);
  update public.engagements set profile_id = m.dropped_id where id in (select (jsonb_array_elements_text(m.moved -> 'engagements'))::uuid);
  update public.coach_group_members set profile_id = m.dropped_id where id in (select (jsonb_array_elements_text(m.moved -> 'members'))::uuid);
  update public.coach_tag_links set item_id = m.dropped_id
  where item_kind = 'client' and item_id = m.kept_id and tag_id in (select (jsonb_array_elements_text(m.moved -> 'tags'))::uuid);
  update public.coach_field_values set item_id = m.dropped_id
  where item_id = m.kept_id and field_id in (select (jsonb_array_elements_text(m.moved -> 'fields'))::uuid);
  if coalesce((m.moved ->> 'about')::boolean, false) then
    update public.client_about set profile_id = m.dropped_id where profile_id = m.kept_id and coach_id = v_coach;
  end if;
  perform set_config('clarity.linking', 'on', true);
  update public.client_profiles set
    name = k ->> 'name', email = k ->> 'email', mobile = k ->> 'mobile', organisation_id = (k ->> 'organisation_id')::uuid,
    job_title = k ->> 'job_title', city = k ->> 'city', time_zone = k ->> 'time_zone', referred_by = k ->> 'referred_by',
    frequent_traveller = (k ->> 'frequent_traveller')::boolean, user_id = (k ->> 'user_id')::uuid,
    invited_at = (k ->> 'invited_at')::timestamptz
  where id = m.kept_id;
  update public.client_profiles set merged_into = null, user_id = (d ->> 'user_id')::uuid where id = m.dropped_id;
  perform set_config('clarity.linking', '', true);
  update public.client_merges set undone_at = now() where id = p_merge;
  perform public._log_activity('merge', 'undid the merge of ' || (d ->> 'name') || ' into ' || (k ->> 'name') || '.', jsonb_build_object('merge_id', p_merge));
end;
$$;
revoke all on function public.client_unmerge(uuid) from public, anon;
grant execute on function public.client_unmerge(uuid) to authenticated;

-- Delete a client's data: the name is typed first, and it is logged.
-- (Invoices arrive in Phase 6b and are kept for 6 years there.)
create or replace function public.client_delete(p_profile uuid, p_typed_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_coach uuid := public.my_coach_id();
  v_name text;
begin
  if v_coach is null or not public.coach_owns_profile(p_profile) then
    raise exception 'That client isn''t yours.' using errcode = '42501';
  end if;
  select name into v_name from public.client_profiles where id = p_profile for update;
  if btrim(coalesce(p_typed_name, '')) <> btrim(v_name) then
    raise exception 'Type the name exactly to carry on.' using errcode = '22023';
  end if;
  delete from public.coach_tag_links where item_kind = 'client' and item_id = p_profile;
  delete from public.coach_field_values where item_id = p_profile and coach_id = v_coach;
  insert into public.data_requests (coach_id, profile_id, person_name, kind, done_at) values (v_coach, null, v_name, 'delete', now());
  delete from public.client_profiles where id = p_profile or merged_into = p_profile;
  perform public._log_activity('delete', 'deleted ' || v_name || '’s data.', '{}'::jsonb);
end;
$$;
revoke all on function public.client_delete(uuid, text) from public, anon;
grant execute on function public.client_delete(uuid, text) to authenticated;

-- ---------------------------------------------------------------- functions: a workshop's public page
-- Anyone holding the page's key: what the page shows. Never an attendee.
create or replace function public.workshop_page(p_key uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'title', w.title, 'starts_at', w.starts_at, 'ends_at', w.ends_at, 'time_zone', w.time_zone, 'place', w.place,
    'organisation', (select o.name from public.organisations o where o.id = w.organisation_id),
    'capacity', w.capacity,
    'taken', (select count(*) from public.workshop_attendees a where a.workshop_id = w.id and a.status = 'registered'),
    'open', w.registration_open and (w.registration_closes_on is null or w.registration_closes_on >= (now() at time zone coalesce(w.time_zone, 'Europe/London'))::date),
    'questions', w.questions)
  from public.workshops w where w.page_key = p_key;
$$;
revoke all on function public.workshop_page(uuid) from public;
grant execute on function public.workshop_page(uuid) to anon, authenticated;

-- Register: a place while there is one, otherwise the waiting list.
create or replace function public.workshop_register(p_key uuid, p_name text, p_email text, p_answers jsonb default '{}'::jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  w public.workshops%rowtype;
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_name text := btrim(coalesce(p_name, ''));
  v_taken bigint;
  v_status text;
  v_id uuid;
begin
  select * into w from public.workshops where page_key = p_key for update;
  if not found then
    return 'not_found';
  end if;
  if not (w.registration_open and (w.registration_closes_on is null or w.registration_closes_on >= (now() at time zone coalesce(w.time_zone, 'Europe/London'))::date)) then
    return 'closed';
  end if;
  if char_length(v_name) not between 1 and 120 then
    return 'name';
  end if;
  if v_email = '' or not public.one_email_ok(v_email) then
    return 'email';
  end if;
  if jsonb_typeof(coalesce(p_answers, '{}'::jsonb)) <> 'object' or pg_column_size(p_answers) > 20000 then
    return 'too_long';
  end if;
  select a.status into v_status from public.workshop_attendees a where a.workshop_id = w.id and a.email = v_email;
  if v_status in ('registered', 'waiting') then
    return 'already_' || v_status;
  end if;
  if (select count(*) from public.workshop_attendees a where a.workshop_id = w.id) >= 5000 then
    return 'closed';
  end if;
  select count(*) into v_taken from public.workshop_attendees a where a.workshop_id = w.id and a.status = 'registered';
  v_status := case when v_taken < w.capacity then 'registered' else 'waiting' end;
  insert into public.workshop_attendees (workshop_id, name, email, status, answers, source)
  values (w.id, v_name, v_email, v_status, coalesce(p_answers, '{}'::jsonb), 'page')
  on conflict (workshop_id, email) do update
    set name = excluded.name, status = excluded.status, answers = excluded.answers, source = 'page', registered_at = now()
  returning id into v_id;
  perform public._coach_notify(w.coach_id, 'workshop',
    v_name || case when v_status = 'registered' then ' registered for ' else ' joined the waiting list for ' end || w.title, null, 'workshop', w.id);
  return v_status;
end;
$$;
revoke all on function public.workshop_register(uuid, text, text, jsonb) from public;
grant execute on function public.workshop_register(uuid, text, text, jsonb) to anon, authenticated;

-- The survey, by the attendee's own key.
create or replace function public.workshop_survey(p_key uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('title', w.title, 'questions', w.survey_questions,
    'done', exists (select 1 from public.workshop_survey_answers s where s.attendee_id = a.id))
  from public.workshop_attendees a join public.workshops w on w.id = a.workshop_id
  where a.survey_key = p_key and w.survey_on;
$$;
revoke all on function public.workshop_survey(uuid) from public;
grant execute on function public.workshop_survey(uuid) to anon, authenticated;

create or replace function public.workshop_survey_answer(p_key uuid, p_answers jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare a record;
begin
  select at.id, at.workshop_id into a
  from public.workshop_attendees at join public.workshops w on w.id = at.workshop_id
  where at.survey_key = p_key and w.survey_on;
  if not found then
    return 'not_found';
  end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' or pg_column_size(p_answers) > 20000 then
    return 'too_long';
  end if;
  insert into public.workshop_survey_answers (workshop_id, attendee_id, answers) values (a.workshop_id, a.id, p_answers)
  on conflict (attendee_id) do nothing;
  if not found then
    return 'already';
  end if;
  return 'saved';
end;
$$;
revoke all on function public.workshop_survey_answer(uuid, jsonb) from public;
grant execute on function public.workshop_survey_answer(uuid, jsonb) to anon, authenticated;

-- The helpers the rules call are for signed-in people only.
do $grants$
declare f text;
begin
  foreach f in array array[
    'public.my_coach_id()', 'public.coach_owns_profile(uuid)', 'public.profile_is_mine(uuid)', 'public.covers_profile(uuid)',
    'public.is_cover_of(uuid)', 'public.coach_has_client_in(uuid)', 'public.coach_owns_group(uuid)',
    'public.coach_owns_engagement(uuid)', 'public.coach_owns_workshop(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end
$grants$;

-- ---------------------------------------------------------------- file stores
-- client-files: <profile id>/<file name>, for the client and their coach.
-- coach-files:  <the coach's own account id>/<file name>, theirs alone
--               (organisation documents, workshop materials, profile photo).
do $store$
begin
  if to_regclass('storage.buckets') is null then
    raise notice '049: no file storage on this database, so the two file stores were skipped.';
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit)
  values ('client-files', 'client-files', false, 104857600), ('coach-files', 'coach-files', false, 104857600)
  on conflict (id) do nothing;

  create or replace function public.client_file_path_ok(p_name text)
  returns boolean
  language plpgsql
  stable
  security definer
  set search_path = ''
  as $f$
  declare v_profile uuid;
  begin
    begin
      v_profile := split_part(p_name, '/', 1)::uuid;
    exception when others then
      return false;
    end;
    return public.coach_owns_profile(v_profile) or public.profile_is_mine(v_profile);
  end;
  $f$;
  revoke all on function public.client_file_path_ok(text) from public, anon;
  grant execute on function public.client_file_path_ok(text) to authenticated;

  drop policy if exists "Client files: the client and their coach read" on storage.objects;
  create policy "Client files: the client and their coach read" on storage.objects for select to authenticated
    using (bucket_id = 'client-files' and (select public.client_file_path_ok(name)));
  drop policy if exists "Client files: the client and their coach add" on storage.objects;
  create policy "Client files: the client and their coach add" on storage.objects for insert to authenticated
    with check (bucket_id = 'client-files' and (select public.client_file_path_ok(name)));
  drop policy if exists "Client files: remove your own" on storage.objects;
  create policy "Client files: remove your own" on storage.objects for delete to authenticated
    using (bucket_id = 'client-files' and owner = (select auth.uid()) and (select public.client_file_path_ok(name)));

  drop policy if exists "Coach files: own folder, read" on storage.objects;
  create policy "Coach files: own folder, read" on storage.objects for select to authenticated
    using (bucket_id = 'coach-files' and (select public.is_coach()) and split_part(name, '/', 1) = (select auth.uid())::text);
  drop policy if exists "Coach files: own folder, add" on storage.objects;
  create policy "Coach files: own folder, add" on storage.objects for insert to authenticated
    with check (bucket_id = 'coach-files' and (select public.is_coach()) and split_part(name, '/', 1) = (select auth.uid())::text);
  drop policy if exists "Coach files: own folder, remove" on storage.objects;
  create policy "Coach files: own folder, remove" on storage.objects for delete to authenticated
    using (bucket_id = 'coach-files' and (select public.is_coach()) and split_part(name, '/', 1) = (select auth.uid())::text);
end
$store$;

-- ---------------------------------------------------------------- record it
do $log$
begin
  if to_regprocedure('public.record_migration(integer,text)') is not null then
    perform public.record_migration(49, '049_coach_portal_foundation');
  end if;
end
$log$;
