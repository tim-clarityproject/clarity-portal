-- =============================================================================
-- 020_wheel_of_life.sql
-- Wheel of Life review: database tables (per wheel-of-life-spec.md section 2)
--
-- WHAT THIS DOES (plain English)
--   Adds three new private tables for the Wheel of Life tool, which lives
--   inside the portal for logged-in people only:
--
--     wheel_of_life_areas     one row per area on a person's wheel (the ten
--                             standard areas plus any of their own), with
--                             on/off, order and an optional target score
--     wheel_of_life_checkins  one row per finished check-in: the scores, a
--                             snapshot of the areas, private notes and the
--                             one area chosen to focus on
--     wheel_of_life_settings  one row per person: which chart style they
--                             chose (sectional, radar or delta)
--
--   Row level security is on for all three: a signed-in person can only ever
--   see and change their own rows. Nobody who is signed out can read anything.
--   Areas are never deleted by the app (only switched off); check-ins can be
--   deleted but never edited. Deleting an account removes all of these rows
--   automatically (on delete cascade from auth.users).
--
-- HOW TO RUN
--   Tim runs this whole file ONCE in the Supabase SQL editor (Run, with no
--   selection). It is safe to run again: it only adds what is missing and
--   replaces its own two functions with the same versions.
--   THEN run supabase/wheel_of_life_test.sql to check everything works.
--
-- It does not touch any existing table, function or policy.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Keeps updated_at current, and stamps target_updated_at whenever the target
-- changes. Its own function (not the older public.update_updated_at in
-- schema.sql, which no migration creates, so it may not exist on the live
-- database).
-- -----------------------------------------------------------------------------
create or replace function public.wheel_of_life_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  -- Nested (not "and") so the settings table, which has no target column,
  -- never evaluates new.target.
  if tg_table_name = 'wheel_of_life_areas' then
    if new.target is distinct from old.target then
      new.target_updated_at := now();
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.wheel_of_life_touch() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Check-in validation, used by a check constraint on wheel_of_life_checkins.
--   scores: an object with 1 to 60 keys, every key 1 to 60 characters, every
--           value a whole number from 0 to 10
--   notes:  an object whose keys are all in scores and whose values are
--           strings of at most 1000 characters
--   areas:  an array of { "key", "label" } objects whose keys are exactly the
--           scores keys (each once), label a string of 1 to 100 characters
-- Returns false (never an error) for anything else, so a bad row is simply
-- refused by the check.
-- -----------------------------------------------------------------------------
create or replace function public.wheel_of_life_checkin_valid(scores jsonb, notes jsonb, areas jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  k       text;
  v       jsonb;
  a       jsonb;
  n_keys  integer := 0;
  seen    text[] := '{}';
begin
  if scores is null or jsonb_typeof(scores) <> 'object' then return false; end if;
  if notes is null or jsonb_typeof(notes) <> 'object' then return false; end if;
  if areas is null or jsonb_typeof(areas) <> 'array' then return false; end if;

  for k, v in select e.key, e.value from jsonb_each(scores) e loop
    n_keys := n_keys + 1;
    if char_length(k) < 1 or char_length(k) > 60 then return false; end if;
    if jsonb_typeof(v) <> 'number' then return false; end if;
    if (v #>> '{}')::numeric <> trunc((v #>> '{}')::numeric) then return false; end if;
    if (v #>> '{}')::numeric < 0 or (v #>> '{}')::numeric > 10 then return false; end if;
  end loop;
  if n_keys < 1 or n_keys > 60 then return false; end if;

  for k, v in select e.key, e.value from jsonb_each(notes) e loop
    if not (scores ? k) then return false; end if;
    if jsonb_typeof(v) <> 'string' then return false; end if;
    if char_length(v #>> '{}') > 1000 then return false; end if;
  end loop;

  if jsonb_array_length(areas) <> n_keys then return false; end if;
  for a in select x from jsonb_array_elements(areas) x loop
    if jsonb_typeof(a) <> 'object' then return false; end if;
    if jsonb_typeof(a -> 'key') is distinct from 'string' then return false; end if;
    if jsonb_typeof(a -> 'label') is distinct from 'string' then return false; end if;
    if char_length(a ->> 'label') < 1 or char_length(a ->> 'label') > 100 then return false; end if;
    if not (scores ? (a ->> 'key')) then return false; end if;
    if (a ->> 'key') = any (seen) then return false; end if;
    seen := seen || (a ->> 'key');
  end loop;

  return true;
end;
$$;

revoke all on function public.wheel_of_life_checkin_valid(jsonb, jsonb, jsonb) from public, anon;
-- The check constraint runs it as whoever saves the row, so they need it.
grant execute on function public.wheel_of_life_checkin_valid(jsonb, jsonb, jsonb) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2.1 wheel_of_life_areas
-- -----------------------------------------------------------------------------
create table if not exists public.wheel_of_life_areas (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  area_key           text not null,
  kind               text not null
                     constraint wheel_of_life_areas_kind_check
                     check (kind in ('standard', 'own')),
  -- Standard areas take their name from the app's code, so have no label.
  -- Own areas: 1 to 24 characters once spaces at the ends are trimmed.
  label              text null
                     constraint wheel_of_life_areas_label_check
                     check (
                       (kind = 'standard' and label is null)
                       or (kind = 'own' and label is not null
                           and char_length(btrim(label)) between 1 and 24)
                     ),
  active             boolean not null default true,
  -- Standard areas 0 to 9, own areas 100 upwards in the order added.
  sort_order         integer not null default 0,
  -- The person's target for this area, 0 to 10, or empty for no target.
  target             smallint null
                     constraint wheel_of_life_areas_target_check
                     check (target between 0 and 10),
  target_updated_at  timestamptz null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint wheel_of_life_areas_key_check check (
    (kind = 'standard' and area_key in ('career', 'financial', 'health', 'relationships',
      'romance', 'growth', 'fun', 'home', 'contribution', 'meaning'))
    or (kind = 'own' and area_key like 'own\_%' and char_length(area_key) <= 60)
  ),
  constraint wheel_of_life_areas_user_key unique (user_id, area_key)
);

create index if not exists idx_wheel_of_life_areas_user on public.wheel_of_life_areas (user_id);

drop trigger if exists wheel_of_life_areas_touch on public.wheel_of_life_areas;
create trigger wheel_of_life_areas_touch
  before update on public.wheel_of_life_areas
  for each row execute function public.wheel_of_life_touch();

alter table public.wheel_of_life_areas enable row level security;

revoke all on table public.wheel_of_life_areas from public, anon, authenticated;
grant select, insert, update on table public.wheel_of_life_areas to authenticated;

drop policy if exists "Users can view their own wheel areas" on public.wheel_of_life_areas;
create policy "Users can view their own wheel areas" on public.wheel_of_life_areas
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "Users can insert their own wheel areas" on public.wheel_of_life_areas;
create policy "Users can insert their own wheel areas" on public.wheel_of_life_areas
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "Users can update their own wheel areas" on public.wheel_of_life_areas;
create policy "Users can update their own wheel areas" on public.wheel_of_life_areas
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- No delete policy: the app never deletes an area (it switches it off).

-- -----------------------------------------------------------------------------
-- 2.2 wheel_of_life_checkins
-- -----------------------------------------------------------------------------
create table if not exists public.wheel_of_life_checkins (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  checkin_at      timestamptz not null default now(),
  -- The person's own local date when they pressed Finish check-in.
  checkin_date    date not null,
  -- { "<area_key>": 0-10 } for every area on the wheel at that moment.
  scores          jsonb not null,
  -- [ { "key", "label" } ] the areas on the wheel at that moment, in order.
  areas           jsonb not null,
  -- { "<area_key>": "note" } only for areas with a note. Private.
  notes           jsonb not null default '{}'::jsonb,
  focus_area_key  text null,
  focus_note      text null
                  constraint wheel_of_life_checkins_focus_note_check
                  check (focus_note is null or char_length(focus_note) <= 500),
  created_at      timestamptz not null default now(),
  constraint wheel_of_life_checkins_valid
    check (public.wheel_of_life_checkin_valid(scores, notes, areas)),
  constraint wheel_of_life_checkins_focus_key_check
    check (focus_area_key is null or scores ? focus_area_key)
);

create index if not exists idx_wheel_of_life_checkins_user_at
  on public.wheel_of_life_checkins (user_id, checkin_at desc);

alter table public.wheel_of_life_checkins enable row level security;

revoke all on table public.wheel_of_life_checkins from public, anon, authenticated;
grant select, insert, delete on table public.wheel_of_life_checkins to authenticated;

drop policy if exists "Users can view their own wheel check-ins" on public.wheel_of_life_checkins;
create policy "Users can view their own wheel check-ins" on public.wheel_of_life_checkins
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "Users can insert their own wheel check-ins" on public.wheel_of_life_checkins;
create policy "Users can insert their own wheel check-ins" on public.wheel_of_life_checkins
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own wheel check-ins" on public.wheel_of_life_checkins;
create policy "Users can delete their own wheel check-ins" on public.wheel_of_life_checkins
  for delete to authenticated using (auth.uid() = user_id);

-- No update policy: check-ins are not edited (delete and redo instead).

-- -----------------------------------------------------------------------------
-- 2.3 wheel_of_life_settings
-- -----------------------------------------------------------------------------
create table if not exists public.wheel_of_life_settings (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  chart_style  text not null default 'sectional'
               constraint wheel_of_life_settings_chart_style_check
               check (chart_style in ('sectional', 'radar', 'delta')),
  updated_at   timestamptz not null default now()
);

drop trigger if exists wheel_of_life_settings_touch on public.wheel_of_life_settings;
create trigger wheel_of_life_settings_touch
  before update on public.wheel_of_life_settings
  for each row execute function public.wheel_of_life_touch();

alter table public.wheel_of_life_settings enable row level security;

revoke all on table public.wheel_of_life_settings from public, anon, authenticated;
grant select, insert, update on table public.wheel_of_life_settings to authenticated;

drop policy if exists "Users can view their own wheel settings" on public.wheel_of_life_settings;
create policy "Users can view their own wheel settings" on public.wheel_of_life_settings
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "Users can insert their own wheel settings" on public.wheel_of_life_settings;
create policy "Users can insert their own wheel settings" on public.wheel_of_life_settings
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "Users can update their own wheel settings" on public.wheel_of_life_settings;
create policy "Users can update their own wheel settings" on public.wheel_of_life_settings
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
