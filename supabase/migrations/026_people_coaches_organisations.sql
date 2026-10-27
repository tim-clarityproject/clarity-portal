-- =============================================================================
-- 026_people_coaches_organisations.sql
-- Phase 1 data model, part 1 of 6: people, coaches, organisations, teams,
-- seats, viewers, sharing switches, and the one checked helper
-- (phase-1-data-model-spec.md sections 0, 1, 5 and 6)
--
-- WHAT THIS DOES (plain English)
--   Adds new tables alongside the old ones. Nothing old is changed.
--
--   People
--     person_settings        one row per person: "Which best describes you?",
--                            person or viewer account, country, time zone,
--                            units, theme, terms version, page preferences
--     working_patterns       which days someone works, with the date each
--                            pattern starts (a change applies from the next
--                            sprint week; methods M0.3)
--   Coaches
--     coaches                the coaches of The Clarity Project: owner (Tim)
--                            or coach, contact details, active or switched off
--     coach_away             a coach's away dates
--     coach_clients          who coaches whom, with the history of changes
--   Organisations
--     organisations, organisation_billing (owner only), organisation_admins,
--     organisation_access_codes and organisation_invites (both stored
--     hashed), teams (nested), organisation_members (seats and memberships,
--     with leaving), team_members, seat_sponsors, leader_teams (a leader
--     sees those teams and every team below), reporting_lines and
--     team_space_roles (foundations for the later Organisation area)
--   Sharing
--     sharing_switches       the person's switches ("What your coach sees",
--                            "What [sponsor] sees"), and
--     sharing_switch_history every change, with when
--
--   THE CHECKED HELPER: public.may_see(owner, part, item_shared)
--     "May the person signed in see this part of this person's data?"
--     Every rule on a personal table uses it (spec section 5). The parts and
--     their defaults are listed in one place: public.sharing_parts().
--     - Everyone sees all of their own data.
--     - A coach sees a client's part only while they are that client's
--       current coach and the part is shared. Switching a part off hides
--       its past too, because nothing is copied: the rule is checked on
--       every read.
--     - Parts chosen each time (a week's debrief, a piece of evidence) are
--       shared one item at a time, by the item's own switch.
--     - Organisation wellbeing is the one part an organisation can see, and
--       only the person can switch it on; it then shows named to their
--       sponsors and the leaders over their teams, and never after they leave.
--     - The owner (Tim) sees admin fields for everyone through checked
--       functions, but personal content only for his own clients, by the
--       same rules as any coach.
--
-- WHO CAN SEE WHAT
--   Row level security is on for every table. Nothing is readable by
--   everyone signed in, and nothing at all by someone signed out.
--
-- SAFE TO RUN TWICE
--   Yes. Tables, indexes and the list of parts are made only if missing;
--   functions, rules and triggers are replaced with the same versions.
--
-- HOW TO RUN
--   After 024 and 025. Then run supabase/026_people_coaches_organisations_test.sql,
--   which should end with ALL CHECKS PASSED.
-- =============================================================================

-- ---------------------------------------------------------------- shared bits

-- Keeps updated_at current on the Phase 1 tables.
create or replace function public.p1_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.p1_touch() from public, anon, authenticated;

-- A child row must belong to the same person as the row it hangs off, so
-- nobody can point their own row at someone else's (the gap the rules test
-- found in the old tables). Arguments: the parent table and the column
-- holding its id; a null parent id is allowed (an optional link).
create or replace function public.p1_same_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent_id uuid := (to_jsonb(new) ->> tg_argv[1])::uuid;
  parent_owner uuid;
begin
  if parent_id is null then
    return new;
  end if;
  execute format('select user_id from public.%I where id = $1', tg_argv[0]) into parent_owner using parent_id;
  if parent_owner is null or parent_owner <> new.user_id then
    raise exception 'That % belongs to someone else.', tg_argv[0] using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.p1_same_owner() from public, anon, authenticated;

-- ---------------------------------------------------------------- person_settings
create table if not exists public.person_settings (
  user_id            uuid primary key references auth.users (id) on delete cascade,
  describes_you      text check (describes_you in ('ceo_executive', 'head_coach', 'leader', 'other')),
  account_type       text not null default 'person' check (account_type in ('person', 'viewer')),
  country            text check (country ~ '^[A-Z]{2}$'),
  time_zone          text check (char_length(time_zone) between 1 and 64),
  units              text check (units in ('metric', 'imperial')),
  theme              text not null default 'device' check (theme in ('light', 'dark', 'device')),
  terms_version      text check (char_length(terms_version) <= 40),
  terms_accepted_at  timestamptz,
  page_preferences   jsonb not null default '{}'::jsonb
                     check (jsonb_typeof(page_preferences) = 'object' and pg_column_size(page_preferences) <= 16384),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
comment on table public.person_settings is
  'One row per person (spec 1). Viewer accounts only see dashboards. Own rows only.';

-- ---------------------------------------------------------------- working_patterns
create table if not exists public.working_patterns (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  starts_on  date not null,
  days       smallint[] not null
             check (cardinality(days) between 1 and 7 and days <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]),
  created_at timestamptz not null default now(),
  unique (user_id, starts_on)
);
comment on table public.working_patterns is
  'Working days, Monday 0 to Sunday 6, from a date (methods M0.3). No row means Monday to Friday.';

-- ---------------------------------------------------------------- coaches
create table if not exists public.coaches (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null unique references auth.users (id) on delete cascade,
  role               text not null default 'coach' check (role in ('owner', 'coach')),
  display_first_name text not null check (char_length(btrim(display_first_name)) between 1 and 60),
  email              text check (char_length(email) <= 254),
  mobile             text check (mobile ~ '^\+[0-9]{6,15}$'),
  contact_ways       text[] not null default array['email']::text[]
                     check (contact_ways <@ array['email', 'whatsapp', 'imessage']::text[]),
  active             boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
comment on table public.coaches is
  'Coaches of The Clarity Project. owner (Tim) sees admin fields for every client; coach sees only their own clients (spec 1).';

create table if not exists public.coach_away (
  id         uuid primary key default gen_random_uuid(),
  coach_id   uuid not null references public.coaches (id) on delete cascade,
  starts_on  date not null,
  ends_on    date not null,
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);
create index if not exists coach_away_coach_idx on public.coach_away (coach_id, starts_on);

create table if not exists public.coach_clients (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references auth.users (id) on delete cascade,
  coach_id    uuid not null references public.coaches (id) on delete restrict,
  started_at  timestamptz not null default now(),
  ended_at    timestamptz,
  changed_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  check (ended_at is null or ended_at >= started_at)
);
comment on table public.coach_clients is
  'Who coaches whom. One current row per client (ended_at null); ended rows are the history ("Your coach is now ...").';
create unique index if not exists coach_clients_one_current on public.coach_clients (client_id) where ended_at is null;
create index if not exists coach_clients_coach_current on public.coach_clients (coach_id, client_id) where ended_at is null;
create index if not exists coach_clients_client_idx on public.coach_clients (client_id, started_at desc);
create index if not exists coach_clients_changed_by_idx on public.coach_clients (changed_by);

-- ---------------------------------------------------------------- organisations
create table if not exists public.organisations (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(btrim(name)) between 1 and 120),
  mission      text check (char_length(mission) <= 240),
  currency     text not null default 'GBP' check (currency ~ '^[A-Z]{3}$'),
  area_enabled boolean not null default false,
  seat_count   integer not null default 0 check (seat_count >= 0),
  seat_level   text check (char_length(seat_level) <= 40),
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on column public.organisations.area_enabled is 'The "Organisation area" switch (spec 6).';
create index if not exists organisations_created_by_idx on public.organisations (created_by);

-- Price per seat is set in the coach portal later (Phase 6b): owner only.
create table if not exists public.organisation_billing (
  organisation_id      uuid primary key references public.organisations (id) on delete cascade,
  price_per_seat_month numeric(10, 2) check (price_per_seat_month >= 0),
  updated_at           timestamptz not null default now()
);

create table if not exists public.organisation_admins (
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  added_by        uuid references auth.users (id) on delete set null,
  added_at        timestamptz not null default now(),
  primary key (organisation_id, user_id)
);
create index if not exists organisation_admins_user_idx on public.organisation_admins (user_id);
create index if not exists organisation_admins_added_by_idx on public.organisation_admins (added_by);

-- Access codes and invite links are secrets, so only a hash is kept (SHA-256, hex).
create table if not exists public.organisation_access_codes (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  code_hash       text not null unique check (code_hash ~ '^[0-9a-f]{64}$'),
  code_hint       text check (char_length(code_hint) <= 4),
  seats           integer not null check (seats >= 1),
  ends_on         date,
  switched_off_at timestamptz,
  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now()
);
create index if not exists organisation_access_codes_org_idx on public.organisation_access_codes (organisation_id);
create index if not exists organisation_access_codes_created_by_idx on public.organisation_access_codes (created_by);

create table if not exists public.teams (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  parent_team_id  uuid references public.teams (id) on delete set null,
  name            text not null check (char_length(btrim(name)) between 1 and 120),
  mission         text check (char_length(mission) <= 240),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (parent_team_id is null or parent_team_id <> id)
);
create index if not exists teams_org_idx on public.teams (organisation_id, name);
create index if not exists teams_parent_idx on public.teams (parent_team_id);

create table if not exists public.organisation_invites (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  team_id         uuid references public.teams (id) on delete set null,
  email           text not null check (email = lower(email) and char_length(email) between 3 and 254),
  token_hash      text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at      timestamptz not null default now() + interval '30 days',
  accepted_at     timestamptz,
  accepted_by     uuid references auth.users (id) on delete set null,
  revoked_at      timestamptz,
  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now()
);
create index if not exists organisation_invites_org_idx on public.organisation_invites (organisation_id, created_at desc);
create index if not exists organisation_invites_team_idx on public.organisation_invites (team_id);
create index if not exists organisation_invites_accepted_by_idx on public.organisation_invites (accepted_by);
create index if not exists organisation_invites_created_by_idx on public.organisation_invites (created_by);

-- Seats and memberships. Leaving ends the membership (ended_on); the person
-- keeps their account. Nothing named about someone who has left is ever
-- returned to the organisation again.
create table if not exists public.organisation_members (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  has_seat        boolean not null default true,
  seat_level      text check (char_length(seat_level) <= 40),
  started_on      date not null default current_date,
  ended_on        date,
  confirmed_at    timestamptz,
  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (ended_on is null or ended_on >= started_on)
);
comment on column public.organisation_members.confirmed_at is
  'Set only by the person (public.membership_confirm). Until then no sponsor or leader reaches anything of theirs, so nobody can be added to an organisation and seen without knowing.';
create unique index if not exists organisation_members_one_current on public.organisation_members (organisation_id, user_id) where ended_on is null;
create index if not exists organisation_members_user_idx on public.organisation_members (user_id);
create index if not exists organisation_members_org_idx on public.organisation_members (organisation_id, started_on) where ended_on is null;
create index if not exists organisation_members_created_by_idx on public.organisation_members (created_by);

create table if not exists public.team_members (
  id         uuid primary key default gen_random_uuid(),
  member_id  uuid not null references public.organisation_members (id) on delete cascade,
  team_id    uuid not null references public.teams (id) on delete cascade,
  started_on date not null default current_date,
  ended_on   date,
  created_at timestamptz not null default now(),
  check (ended_on is null or ended_on >= started_on)
);
create unique index if not exists team_members_one_current on public.team_members (team_id, member_id) where ended_on is null;
create index if not exists team_members_member_idx on public.team_members (member_id) where ended_on is null;

create table if not exists public.seat_sponsors (
  id              uuid primary key default gen_random_uuid(),
  member_id       uuid not null references public.organisation_members (id) on delete cascade,
  sponsor_user_id uuid not null references auth.users (id) on delete cascade,
  started_on      date not null default current_date,
  ended_on        date,
  created_at      timestamptz not null default now(),
  check (ended_on is null or ended_on >= started_on)
);
create unique index if not exists seat_sponsors_one_current on public.seat_sponsors (member_id, sponsor_user_id) where ended_on is null;
create index if not exists seat_sponsors_sponsor_idx on public.seat_sponsors (sponsor_user_id) where ended_on is null;

-- A leader (a free viewer account or a person with a seat) is given teams,
-- and sees those teams and every team below them.
create table if not exists public.leader_teams (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  team_id    uuid not null references public.teams (id) on delete cascade,
  added_by   uuid references auth.users (id) on delete set null,
  added_at   timestamptz not null default now(),
  ended_at   timestamptz
);
create unique index if not exists leader_teams_one_current on public.leader_teams (user_id, team_id) where ended_at is null;
create index if not exists leader_teams_team_idx on public.leader_teams (team_id) where ended_at is null;
create index if not exists leader_teams_added_by_idx on public.leader_teams (added_by);

-- Foundations for the later Organisation area (no screens yet).
create table if not exists public.reporting_lines (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  member_id       uuid not null references public.organisation_members (id) on delete cascade,
  reports_to_id   uuid not null references public.organisation_members (id) on delete cascade,
  started_on      date not null default current_date,
  ended_on        date,
  check (member_id <> reports_to_id)
);
create index if not exists reporting_lines_org_idx on public.reporting_lines (organisation_id);
create index if not exists reporting_lines_member_idx on public.reporting_lines (member_id);
create index if not exists reporting_lines_reports_to_idx on public.reporting_lines (reports_to_id);

create table if not exists public.team_space_roles (
  team_id    uuid not null references public.teams (id) on delete cascade,
  member_id  uuid not null references public.organisation_members (id) on delete cascade,
  role       text not null check (role in ('owner', 'editor', 'commenter', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (team_id, member_id)
);
create index if not exists team_space_roles_member_idx on public.team_space_roles (member_id);

-- ---------------------------------------------------------------- sharing
create table if not exists public.sharing_switches (
  user_id    uuid not null references auth.users (id) on delete cascade,
  part       text not null,
  is_on      boolean not null,
  changed_at timestamptz not null default now(),
  primary key (user_id, part)
);
comment on table public.sharing_switches is
  'The person''s switches for parts shared as a whole (mission, monthly check-in, progress, organisation wellbeing). No row means the part''s default (public.sharing_parts()).';

create table if not exists public.sharing_switch_history (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  part       text not null,
  is_on      boolean not null,
  changed_at timestamptz not null default now()
);
create index if not exists sharing_switch_history_user_idx on public.sharing_switch_history (user_id, changed_at desc);

-- The parts, in one place (spec 5). per_item parts are shared one item at a
-- time by the item's own switch (a week's debrief, a piece of evidence, a
-- Recovery's "Let [coach] know"); the others by sharing_switches.
create or replace function public.sharing_parts()
returns table (part text, audience text, default_on boolean, per_item boolean, label text)
language sql
immutable
set search_path = ''
as $$
  values
    ('mission',         'coach',        true,  false, 'Mission'),
    ('checkin',         'coach',        true,  false, 'Monthly check-in, including the First check-in'),
    ('progress',        'coach',        false, false, 'Progress: scores, Outcome Objective figures, the sprint at a glance and patterns'),
    ('debrief',         'coach',        false, true,  'Weekly debrief, chosen each week'),
    ('sweet_spot',      'coach',        false, true,  'Find my sweet spot, chosen each time'),
    ('session_prep',    'coach',        false, true,  'Session prep, chosen each time'),
    ('evidence',        'coach',        false, true,  'Performance Evidence, chosen each time'),
    ('recharge',        'coach',        false, true,  'Recovery: what would help you recharge, chosen each day'),
    ('recovery_notice', 'coach',        true,  true,  'Recovery: that it started and until when ("Let [coach] know")'),
    ('org_wellbeing',   'organisation', false, false, 'Wellbeing: Hardware and Software scores and areas, named, to the sponsor and leaders')
$$;
grant execute on function public.sharing_parts() to authenticated;
revoke all on function public.sharing_parts() from public, anon;

create or replace function public.sharing_switch_check()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from public.sharing_parts() p where p.part = new.part and not p.per_item) then
    raise exception 'Unknown sharing part: %', new.part using errcode = '22023';
  end if;
  new.changed_at := now();
  return new;
end;
$$;
revoke all on function public.sharing_switch_check() from public, anon, authenticated;

-- Every change is kept, with when (spec 5: "Store the switches with the date each changed").
create or replace function public.sharing_switch_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.is_on is distinct from old.is_on then
    insert into public.sharing_switch_history (user_id, part, is_on, changed_at)
    values (new.user_id, new.part, new.is_on, new.changed_at);
  end if;
  return new;
end;
$$;
revoke all on function public.sharing_switch_log() from public, anon, authenticated;

drop trigger if exists sharing_switches_check on public.sharing_switches;
create trigger sharing_switches_check before insert or update on public.sharing_switches
  for each row execute function public.sharing_switch_check();
drop trigger if exists sharing_switches_log on public.sharing_switches;
create trigger sharing_switches_log after insert or update on public.sharing_switches
  for each row execute function public.sharing_switch_log();

-- ---------------------------------------------------------------- who is who
-- These read the role tables directly (security definer), so the rules that
-- call them never loop back into each other. Each answers only for the
-- person signed in, so nobody can ask about two other people.

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.coaches c
    where c.user_id = (select auth.uid()) and c.role = 'owner' and c.active
  );
$$;

create or replace function public.is_coach()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.coaches c where c.user_id = (select auth.uid()) and c.active);
$$;

-- Is the person signed in the current, active coach of this client?
create or replace function public.is_coach_of(p_client uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.coach_clients cc
    join public.coaches c on c.id = cc.coach_id
    where cc.client_id = p_client and cc.ended_at is null
      and c.user_id = (select auth.uid()) and c.active
  );
$$;

create or replace function public.is_org_admin(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organisation_admins a
    where a.organisation_id = p_org and a.user_id = (select auth.uid())
  );
$$;

-- The teams the person signed in leads, and every team below them.
create or replace function public.my_leader_team_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  with recursive scope as (
    select lt.team_id as id, 1 as depth
    from public.leader_teams lt
    join public.teams t0 on t0.id = lt.team_id
    where lt.user_id = (select auth.uid()) and lt.ended_at is null
      -- an organisation's admin is never also a leader there (so an admin
      -- can't reach people by moving teams or members under a team they lead)
      and not exists (select 1 from public.organisation_admins a
                      where a.organisation_id = t0.organisation_id and a.user_id = (select auth.uid()))
    union
    select t.id, s.depth + 1
    from public.teams t
    join scope s on t.parent_team_id = s.id
    where s.depth < 50
  )
  select distinct id from scope;
$$;

-- Is this person a current member of a current team the signed-in leader
-- leads (directly or below)? Never true once they have left.
create or replace function public.in_my_leader_scope(p_person uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organisation_members m
    join public.team_members tm on tm.member_id = m.id and tm.ended_on is null
    where m.user_id = p_person and m.ended_on is null and m.confirmed_at is not null
      and tm.team_id in (select public.my_leader_team_ids())
  );
$$;

-- Is the person signed in a current sponsor of this person's current seat?
create or replace function public.is_sponsor_of(p_person uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.seat_sponsors s
    join public.organisation_members m on m.id = s.member_id
    where m.user_id = p_person and m.ended_on is null and m.has_seat and m.confirmed_at is not null
      and s.sponsor_user_id = (select auth.uid()) and s.ended_on is null
      and not exists (select 1 from public.organisation_admins a
                      where a.organisation_id = m.organisation_id and a.user_id = (select auth.uid()))
  );
$$;

-- Is a whole-part switch on for this person (their row, or the default)?
create or replace function public.sharing_is_on(p_owner uuid, p_part text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select s.is_on from public.sharing_switches s where s.user_id = p_owner and s.part = p_part),
    (select p.default_on from public.sharing_parts() p where p.part = p_part),
    false
  );
$$;

-- THE CHECKED HELPER (spec 5): may the person signed in see this part of
-- this person's data? p_item_shared is the item's own switch, for parts
-- shared one item at a time.
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
    if not public.is_coach_of(p_owner) then
      return false;
    end if;
    if p.per_item then
      return coalesce(p_item_shared, false);
    end if;
    return public.sharing_is_on(p_owner, p_part);
  end if;
  -- organisation wellbeing: only by the person's choice, to their sponsors
  -- and the leaders over their teams, while they are a member
  return public.sharing_is_on(p_owner, p_part)
    and (public.is_sponsor_of(p_owner) or public.in_my_leader_scope(p_owner));
end;
$$;

do $grants$
declare f text;
begin
  foreach f in array array[
    'public.is_owner()', 'public.is_coach()', 'public.is_coach_of(uuid)', 'public.is_org_admin(uuid)',
    'public.my_leader_team_ids()', 'public.in_my_leader_scope(uuid)', 'public.is_sponsor_of(uuid)',
    'public.sharing_is_on(uuid, text)', 'public.may_see(uuid, text, boolean)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end
$grants$;
-- sharing_is_on would tell anyone whether any person's switch is on: it is
-- for the rules and the checked functions only.
revoke all on function public.sharing_is_on(uuid, text) from authenticated;

-- Can the person signed in manage this organisation's people and teams?
create or replace function public.can_manage_org(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_owner() or public.is_org_admin(p_org);
$$;
revoke all on function public.can_manage_org(uuid) from public, anon;
grant execute on function public.can_manage_org(uuid) to authenticated;

-- ---------------------------------------------------------------- team checks
-- A team's parent must be in the same organisation, and teams can't loop.
create or replace function public.teams_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  cur uuid := new.parent_team_id;
  hops integer := 0;
begin
  if new.parent_team_id is not null then
    if not exists (select 1 from public.teams t where t.id = new.parent_team_id and t.organisation_id = new.organisation_id) then
      raise exception 'A team''s parent must be in the same organisation.' using errcode = '23514';
    end if;
    while cur is not null loop
      if cur = new.id then
        raise exception 'A team can''t sit below itself.' using errcode = '23514';
      end if;
      hops := hops + 1;
      if hops > 50 then
        raise exception 'Teams nest at most 50 deep.' using errcode = '23514';
      end if;
      select t.parent_team_id into cur from public.teams t where t.id = cur;
    end loop;
  end if;
  return new;
end;
$$;
revoke all on function public.teams_check() from public, anon, authenticated;
drop trigger if exists teams_check on public.teams;
create trigger teams_check before insert or update on public.teams
  for each row execute function public.teams_check();

-- A membership's teams, sponsors and lines stay inside its organisation.
create or replace function public.team_members_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.organisation_members m join public.teams t on t.organisation_id = m.organisation_id
    where m.id = new.member_id and t.id = new.team_id
  ) then
    raise exception 'That team is in a different organisation.' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.team_members_check() from public, anon, authenticated;
drop trigger if exists team_members_check on public.team_members;
create trigger team_members_check before insert or update on public.team_members
  for each row execute function public.team_members_check();
drop trigger if exists team_space_roles_check on public.team_space_roles;
create trigger team_space_roles_check before insert or update on public.team_space_roles
  for each row execute function public.team_members_check();

create or replace function public.reporting_lines_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.organisation_members m
      where m.id in (new.member_id, new.reports_to_id) and m.organisation_id = new.organisation_id) <> 2 then
    raise exception 'Both people must be in this organisation.' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.reporting_lines_check() from public, anon, authenticated;
drop trigger if exists reporting_lines_check on public.reporting_lines;
create trigger reporting_lines_check before insert or update on public.reporting_lines
  for each row execute function public.reporting_lines_check();

-- Only the person confirms their own membership (public.membership_confirm);
-- nobody else can set or clear it.
create or replace function public.organisation_members_check()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.confirmed_at is not null and new.user_id is distinct from (select auth.uid()) and (select auth.uid()) is not null then
      new.confirmed_at := null;
    end if;
  elsif new.confirmed_at is distinct from old.confirmed_at and current_setting('clarity.confirming', true) is distinct from 'yes' then
    new.confirmed_at := old.confirmed_at;
  end if;
  if tg_op = 'UPDATE' and (new.user_id <> old.user_id or new.organisation_id <> old.organisation_id) then
    raise exception 'A membership can''t be moved to another person or organisation.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.organisation_members_check() from public, anon, authenticated;
drop trigger if exists organisation_members_check on public.organisation_members;
create trigger organisation_members_check before insert or update on public.organisation_members
  for each row execute function public.organisation_members_check();

-- The person confirms a membership someone added for them.
create or replace function public.membership_confirm(p_member uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  perform set_config('clarity.confirming', 'yes', true);
  update public.organisation_members m set confirmed_at = now()
   where m.id = p_member and m.user_id = (select auth.uid()) and m.ended_on is null and m.confirmed_at is null;
  get diagnostics n = row_count;
  perform set_config('clarity.confirming', '', true);
  return n > 0;
end;
$$;
revoke all on function public.membership_confirm(uuid) from public, anon;
grant execute on function public.membership_confirm(uuid) to authenticated;

-- Someone leaves (spec 6): the membership ends with their teams, sponsor
-- links, reporting lines and team-space roles, and any teams they led in
-- this organisation. Their account stays, and becomes personal. From then
-- on nothing named about them is returned to the organisation.
create or replace function public.membership_end(p_member uuid, p_ended_on date default current_date)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.organisation_members;
begin
  select * into m from public.organisation_members where id = p_member and ended_on is null for update;
  if not found or not public.can_manage_org(m.organisation_id) then
    raise exception 'That person isn''t a current member you manage.' using errcode = '42501';
  end if;
  if p_ended_on is null or p_ended_on < m.started_on then
    raise exception 'A membership ends on or after it started.' using errcode = '22023';
  end if;
  update public.organisation_members set ended_on = p_ended_on where id = p_member;
  update public.team_members set ended_on = greatest(started_on, p_ended_on) where member_id = p_member and ended_on is null;
  update public.seat_sponsors set ended_on = greatest(started_on, p_ended_on) where member_id = p_member and ended_on is null;
  -- and the seats they sponsored, and their admin role, in this organisation
  update public.seat_sponsors s set ended_on = greatest(s.started_on, p_ended_on)
   where s.sponsor_user_id = m.user_id and s.ended_on is null
     and s.member_id in (select x.id from public.organisation_members x where x.organisation_id = m.organisation_id);
  delete from public.organisation_admins where organisation_id = m.organisation_id and user_id = m.user_id;
  update public.reporting_lines set ended_on = greatest(started_on, p_ended_on)
   where (member_id = p_member or reports_to_id = p_member) and ended_on is null;
  delete from public.team_space_roles where member_id = p_member;
  update public.leader_teams lt set ended_at = now()
   where lt.user_id = m.user_id and lt.ended_at is null
     and lt.team_id in (select t.id from public.teams t where t.organisation_id = m.organisation_id);
  return true;
end;
$$;
revoke all on function public.membership_end(uuid, date) from public, anon;
grant execute on function public.membership_end(uuid, date) to authenticated;

-- The organisation a row belongs to, for the rules below.
create or replace function public.org_of_member(p_member uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.organisation_id from public.organisation_members m where m.id = p_member;
$$;
create or replace function public.org_of_team(p_team uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select t.organisation_id from public.teams t where t.id = p_team;
$$;
revoke all on function public.org_of_member(uuid) from public, anon;
revoke all on function public.org_of_team(uuid) from public, anon;
grant execute on function public.org_of_member(uuid) to authenticated;
grant execute on function public.org_of_team(uuid) to authenticated;

-- Is the person signed in a current member of this organisation, or a
-- sponsor or leader in it (so they may read its name and mission)?
create or replace function public.in_org(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.organisation_members m
                 where m.organisation_id = p_org and m.user_id = (select auth.uid()) and m.ended_on is null)
      or exists (select 1 from public.seat_sponsors s join public.organisation_members m on m.id = s.member_id
                 where m.organisation_id = p_org and m.ended_on is null
                   and s.sponsor_user_id = (select auth.uid()) and s.ended_on is null)
      or exists (select 1 from public.teams t where t.organisation_id = p_org and t.id in (select public.my_leader_team_ids()));
$$;
revoke all on function public.in_org(uuid) from public, anon;
grant execute on function public.in_org(uuid) to authenticated;

-- ---------------------------------------------------------------- touch triggers
do $touch$
declare t text;
begin
  foreach t in array array['person_settings', 'coaches', 'organisations', 'organisation_billing', 'teams', 'organisation_members'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.p1_touch()', t || '_touch', t);
  end loop;
end
$touch$;

-- ---------------------------------------------------------------- grants and rules
do $lock$
declare t text;
begin
  foreach t in array array[
    'person_settings', 'working_patterns', 'coaches', 'coach_away', 'coach_clients',
    'organisations', 'organisation_billing', 'organisation_admins', 'organisation_access_codes',
    'organisation_invites', 'teams', 'organisation_members', 'team_members', 'seat_sponsors',
    'leader_teams', 'reporting_lines', 'team_space_roles', 'sharing_switches', 'sharing_switch_history'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
  end loop;
end
$lock$;

-- person_settings: own row only.
grant select, insert, update on public.person_settings to authenticated;
drop policy if exists "Own settings: read" on public.person_settings;
create policy "Own settings: read" on public.person_settings for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists "Own settings: add" on public.person_settings;
create policy "Own settings: add" on public.person_settings for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists "Own settings: change" on public.person_settings;
create policy "Own settings: change" on public.person_settings for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- working_patterns: own rows only.
grant select, insert, update, delete on public.working_patterns to authenticated;
drop policy if exists "Own working patterns" on public.working_patterns;
create policy "Own working patterns" on public.working_patterns for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- coaches: a coach reads their own row, the owner reads and changes every
-- row. Clients reach their coach's name and contact details through
-- public.my_coach().
grant select, insert, update, delete on public.coaches to authenticated;
drop policy if exists "Coaches: read" on public.coaches;
create policy "Coaches: read" on public.coaches for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_owner()));
drop policy if exists "Coaches: owner adds" on public.coaches;
create policy "Coaches: owner adds" on public.coaches for insert to authenticated
  with check ((select public.is_owner()));
drop policy if exists "Coaches: owner changes" on public.coaches;
create policy "Coaches: owner changes" on public.coaches for update to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));
drop policy if exists "Coaches: owner removes" on public.coaches;
create policy "Coaches: owner removes" on public.coaches for delete to authenticated
  using ((select public.is_owner()) and user_id <> (select auth.uid()));

grant select, insert, update, delete on public.coach_away to authenticated;
drop policy if exists "Coach away: the coach and the owner" on public.coach_away;
create policy "Coach away: the coach and the owner" on public.coach_away for all to authenticated
  using ((select public.is_owner()) or exists (select 1 from public.coaches c where c.id = coach_id and c.user_id = (select auth.uid())))
  with check ((select public.is_owner()) or exists (select 1 from public.coaches c where c.id = coach_id and c.user_id = (select auth.uid())));

-- coach_clients: the client sees their own history; a coach sees their own
-- clients' rows; the owner sees and changes every row (assigning coaches).
grant select, insert, update on public.coach_clients to authenticated;
drop policy if exists "Coach links: read" on public.coach_clients;
create policy "Coach links: read" on public.coach_clients for select to authenticated
  using (client_id = (select auth.uid())
         or (select public.is_owner())
         or exists (select 1 from public.coaches c where c.id = coach_id and c.user_id = (select auth.uid())));
drop policy if exists "Coach links: owner adds" on public.coach_clients;
create policy "Coach links: owner adds" on public.coach_clients for insert to authenticated
  with check ((select public.is_owner()));
drop policy if exists "Coach links: owner changes" on public.coach_clients;
create policy "Coach links: owner changes" on public.coach_clients for update to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));

-- organisations: the owner does everything; its admins, members, sponsors
-- and leaders read it (name and mission). Only the owner sets one up.
grant select, insert, update, delete on public.organisations to authenticated;
drop policy if exists "Organisations: read" on public.organisations;
create policy "Organisations: read" on public.organisations for select to authenticated
  using ((select public.is_owner()) or public.is_org_admin(id) or public.in_org(id));
drop policy if exists "Organisations: owner adds" on public.organisations;
create policy "Organisations: owner adds" on public.organisations for insert to authenticated
  with check ((select public.is_owner()));
drop policy if exists "Organisations: owner changes" on public.organisations;
create policy "Organisations: owner changes" on public.organisations for update to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));
drop policy if exists "Organisations: owner removes" on public.organisations;
create policy "Organisations: owner removes" on public.organisations for delete to authenticated
  using ((select public.is_owner()));

grant select, insert, update, delete on public.organisation_billing to authenticated;
drop policy if exists "Billing: owner only" on public.organisation_billing;
create policy "Billing: owner only" on public.organisation_billing for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));

grant select, insert, delete on public.organisation_admins to authenticated;
drop policy if exists "Organisation admins: read" on public.organisation_admins;
create policy "Organisation admins: read" on public.organisation_admins for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_owner()) or public.is_org_admin(organisation_id));
drop policy if exists "Organisation admins: owner adds" on public.organisation_admins;
create policy "Organisation admins: owner adds" on public.organisation_admins for insert to authenticated
  with check ((select public.is_owner()));
drop policy if exists "Organisation admins: owner removes" on public.organisation_admins;
create policy "Organisation admins: owner removes" on public.organisation_admins for delete to authenticated
  using ((select public.is_owner()));

-- Codes and invites: the owner and the organisation's admins.
grant select, insert, update on public.organisation_access_codes to authenticated;
drop policy if exists "Access codes: managers" on public.organisation_access_codes;
create policy "Access codes: managers" on public.organisation_access_codes for all to authenticated
  using (public.can_manage_org(organisation_id)) with check (public.can_manage_org(organisation_id));
grant select, insert, update on public.organisation_invites to authenticated;
drop policy if exists "Invites: managers" on public.organisation_invites;
-- An accepted invite whose person has since left is not shown to the
-- organisation (it names them).
drop policy if exists "Invites: managers read" on public.organisation_invites;
create policy "Invites: managers read" on public.organisation_invites for select to authenticated
  using ((select public.is_owner())
         or (public.is_org_admin(organisation_id)
             and (accepted_by is null or exists (select 1 from public.organisation_members m
                   where m.user_id = accepted_by and m.organisation_id = organisation_invites.organisation_id and m.ended_on is null))));
drop policy if exists "Invites: managers add" on public.organisation_invites;
create policy "Invites: managers add" on public.organisation_invites for insert to authenticated
  with check (public.can_manage_org(organisation_id) and (team_id is null or public.org_of_team(team_id) = organisation_id));
drop policy if exists "Invites: managers change" on public.organisation_invites;
create policy "Invites: managers change" on public.organisation_invites for update to authenticated
  using (public.can_manage_org(organisation_id) and accepted_at is null)
  with check (public.can_manage_org(organisation_id) and (team_id is null or public.org_of_team(team_id) = organisation_id));

-- teams: managers change them; members of the organisation, its sponsors
-- and leaders read them.
grant select, insert, update, delete on public.teams to authenticated;
drop policy if exists "Teams: read" on public.teams;
create policy "Teams: read" on public.teams for select to authenticated
  using (public.can_manage_org(organisation_id) or public.in_org(organisation_id));
drop policy if exists "Teams: managers add" on public.teams;
create policy "Teams: managers add" on public.teams for insert to authenticated
  with check (public.can_manage_org(organisation_id));
drop policy if exists "Teams: managers change" on public.teams;
create policy "Teams: managers change" on public.teams for update to authenticated
  using (public.can_manage_org(organisation_id)) with check (public.can_manage_org(organisation_id));
drop policy if exists "Teams: managers remove" on public.teams;
create policy "Teams: managers remove" on public.teams for delete to authenticated
  using (public.can_manage_org(organisation_id));

-- organisation_members: the person sees their own memberships (current and
-- past). Managers see current ones only: once someone has left, nothing
-- named about them is returned to the organisation. Only the owner sees
-- past memberships of others. Sponsors and leaders reach people only
-- through the checked functions (migration 030).
grant select, insert, update, delete on public.organisation_members to authenticated;
drop policy if exists "Memberships: read" on public.organisation_members;
create policy "Memberships: read" on public.organisation_members for select to authenticated
  using (user_id = (select auth.uid())
         or (select public.is_owner())
         or (ended_on is null and public.is_org_admin(organisation_id)));
drop policy if exists "Memberships: managers add" on public.organisation_members;
create policy "Memberships: managers add" on public.organisation_members for insert to authenticated
  with check (public.can_manage_org(organisation_id) and ended_on is null and confirmed_at is null);
-- Admins change current memberships; someone leaves through public.membership_end.
drop policy if exists "Memberships: managers change" on public.organisation_members;
create policy "Memberships: managers change" on public.organisation_members for update to authenticated
  using ((select public.is_owner()) or (ended_on is null and public.is_org_admin(organisation_id)))
  with check ((select public.is_owner()) or (ended_on is null and public.is_org_admin(organisation_id)));
drop policy if exists "Memberships: owner removes" on public.organisation_members;
create policy "Memberships: owner removes" on public.organisation_members for delete to authenticated
  using ((select public.is_owner()));

-- team_members, seat_sponsors, leader_teams, reporting_lines: the person
-- sees their own; managers see and change current rows only, so nothing
-- about someone who has left comes back to the organisation; the owner sees
-- all. (A rule "for all" would also let managers read past rows, so each
-- action has its own rule.)
do $mgr$
declare r record;
begin
  -- self_ok: an admin can't name themselves a seat's sponsor or give
  -- themselves teams to lead (only the owner or another admin can), so an
  -- admin never reaches summaries or wellbeing by their own hand.
  for r in select * from (values
    ('team_members', 'ended_on', 'public.org_of_member(member_id)',
     'exists (select 1 from public.organisation_members m where m.id = member_id and m.user_id = (select auth.uid()))', 'true'),
    ('seat_sponsors', 'ended_on', 'public.org_of_member(member_id)',
     'sponsor_user_id = (select auth.uid()) or exists (select 1 from public.organisation_members m where m.id = member_id and m.user_id = (select auth.uid()))',
     '(sponsor_user_id <> (select auth.uid()) or (select public.is_owner()))'),
    ('leader_teams', 'ended_at', 'public.org_of_team(team_id)', 'user_id = (select auth.uid())',
     '(user_id <> (select auth.uid()) or (select public.is_owner()))'),
    ('reporting_lines', 'ended_on', 'organisation_id',
     'exists (select 1 from public.organisation_members m where m.id in (member_id, reports_to_id) and m.user_id = (select auth.uid()))', 'true')
  ) v(t, ended, org, own, self_ok) loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', r.t);
    execute format('drop policy if exists "Managers: read current" on public.%I', r.t);
    execute format('create policy "Managers: read current" on public.%I for select to authenticated using (%s or (select public.is_owner()) or (%I is null and public.is_org_admin(%s)))',
                   r.t, r.own, r.ended, r.org);
    execute format('drop policy if exists "Managers: add" on public.%I', r.t);
    execute format('create policy "Managers: add" on public.%I for insert to authenticated with check (%I is null and public.can_manage_org(%s) and %s)', r.t, r.ended, r.org, r.self_ok);
    execute format('drop policy if exists "Managers: change current" on public.%I', r.t);
    execute format('create policy "Managers: change current" on public.%I for update to authenticated using ((select public.is_owner()) or (%I is null and public.is_org_admin(%s))) with check (((select public.is_owner()) or (%I is null and public.is_org_admin(%s))) and %s)',
                   r.t, r.ended, r.org, r.ended, r.org, r.self_ok);
    execute format('drop policy if exists "Managers: remove current" on public.%I', r.t);
    execute format('create policy "Managers: remove current" on public.%I for delete to authenticated using ((select public.is_owner()) or (%I is null and public.is_org_admin(%s)))', r.t, r.ended, r.org);
  end loop;
end
$mgr$;
-- Rules from earlier drafts of this file, removed if present.
drop policy if exists "Team members: read" on public.team_members;
drop policy if exists "Team members: managers change" on public.team_members;
drop policy if exists "Sponsors: read" on public.seat_sponsors;
drop policy if exists "Sponsors: managers change" on public.seat_sponsors;
drop policy if exists "Leaders: read" on public.leader_teams;
drop policy if exists "Leaders: managers change" on public.leader_teams;
drop policy if exists "Reporting lines: managers" on public.reporting_lines;

grant select, insert, update, delete on public.team_space_roles to authenticated;
drop policy if exists "Team space roles: managers" on public.team_space_roles;
create policy "Team space roles: managers" on public.team_space_roles for all to authenticated
  using (public.can_manage_org(public.org_of_team(team_id))) with check (public.can_manage_org(public.org_of_team(team_id)));

-- sharing: the person's own switches only. The history is written by the
-- trigger and read by its owner.
grant select, insert, update on public.sharing_switches to authenticated;
drop policy if exists "Own switches" on public.sharing_switches;
create policy "Own switches" on public.sharing_switches for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select on public.sharing_switch_history to authenticated;
drop policy if exists "Own switch history" on public.sharing_switch_history;
create policy "Own switch history" on public.sharing_switch_history for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------- checked functions
-- The client's own coach: first name, mobile and contact ways, and whether
-- they are away today. Null for someone without a coach.
create or replace function public.my_coach()
returns table (coach_id uuid, first_name text, mobile text, contact_ways text[], away_until date)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.display_first_name, c.mobile, c.contact_ways,
         (select max(a.ends_on) from public.coach_away a
           where a.coach_id = c.id and current_date between a.starts_on and a.ends_on)
  from public.coach_clients cc
  join public.coaches c on c.id = cc.coach_id and c.active
  where cc.client_id = (select auth.uid()) and cc.ended_at is null;
$$;
revoke all on function public.my_coach() from public, anon;
grant execute on function public.my_coach() to authenticated;

-- The outside Create my account page: an invite link's email and
-- organisation name, to fill in. Nothing for an expired, used or
-- withdrawn link.
create or replace function public.invite_open(p_token text)
returns table (email text, organisation_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select i.email, o.name
  from public.organisation_invites i
  join public.organisations o on o.id = i.organisation_id
  where i.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
    and i.accepted_at is null and i.revoked_at is null and i.expires_at > now();
$$;
revoke all on function public.invite_open(text) from public;
grant execute on function public.invite_open(text) to anon, authenticated;

select public.record_migration(26, '026_people_coaches_organisations');
