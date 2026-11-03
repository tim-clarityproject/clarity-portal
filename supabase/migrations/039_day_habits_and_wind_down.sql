-- =============================================================================
-- 039_day_habits_and_wind_down.sql
-- Phase 4 step 7 (Tim, 30 Oct, decisions part 4): the one migration Phase 4
-- allows.
--
-- WHAT THIS DOES (plain English)
--     day_plan_habits      the habits chosen in Plan my day, one row per
--                          person and day, with the order of the day's
--                          choices and which one is the highest priority.
--                          Until now they were kept on the device only,
--                          so another device (or a new phone) never saw
--                          them.
--     wind_down_nights     the Sleep wind down's thoughts for tomorrow, one
--                          row per person and night (each thought up to 300
--                          characters), when the wind-down was finished and
--                          the sound chosen ('off' until chosen). Until now
--                          kept on the device only.
--     day_reviews.tomorrow each "for tomorrow" item up to 300 characters,
--                          as the to-dos they become. Added NOT VALID, so
--                          an older row with a longer item can never stop
--                          the migration; it is then checked at once when
--                          every saved row already fits (the usual case:
--                          the app has always kept them to 300). Either
--                          way, every new or changed row is checked.
--     todos.source         gains 'sleep_wind_down', for a to-do made the
--                          next morning from a wind-down thought (until
--                          now saved as 'other_tool'). Widened only: every
--                          saved to-do still fits.
--   Nothing old reads the new tables, and nothing moves: the app keeps
--   what they hold on the device until this has run, then moves it
--   across once and keeps the device copy as its offline cache.
--
-- WHERE THE ORB CHOICE LIVES (no change here)
--   The person's Breathe orb (Rings, the starting choice, or Level) is
--   kept in person_settings.page_preferences.orb_style (migration 026: a
--   jsonb object only the person reads and changes, already holding the
--   menu's pins). No column is needed.
--
-- WHO CAN SEE WHAT
--   day_plan_habits and wind_down_nights: own rows only: each person
--   reads, adds, changes and removes their own. Nothing is shared with a
--   coach (brief, step 7). A habit chosen for a day must be the same
--   person's sprint habit.
--
-- SAFE TO RUN TWICE
--   Yes: tables, indexes, triggers and rules are made only when missing or
--   are dropped and made again; functions are replaced; each limit is
--   added only when missing.
--
-- HOW TO RUN
--   After 026 to 028 (it uses p1_touch, sprint_habits, day_reviews and
--   todos). 038 is not needed first. Then run
--   supabase/039_day_habits_and_wind_down_test.sql.
-- =============================================================================

-- ---------------------------------------------------------------- the 300-character check
-- Every item of a list of words within a length. Pure, so a check
-- constraint may use it; people writing a row need to be able to run it.
create or replace function public.text_items_within(p_items text[], p_max integer)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce((select bool_and(char_length(x) <= p_max) from unnest(p_items) x), true);
$$;
revoke all on function public.text_items_within(text[], integer) from public, anon;
grant execute on function public.text_items_within(text[], integer) to authenticated, service_role;
comment on function public.text_items_within(text[], integer) is
  'True when every item of the list is at most p_max characters (039: the 300-character limit on "for tomorrow" items and wind-down thoughts).';

-- ---------------------------------------------------------------- day_plan_habits
create table if not exists public.day_plan_habits (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  local_date  date not null,
  -- The sprint habits chosen for the day (sprint_habits ids), three at most
  -- with the day's to-dos (Plan my day's "Choose up to 3.").
  habit_ids   uuid[] not null default '{}'::uuid[],
  -- The order of the day's choices, as "todo:<id>" or "habit:<id>", and
  -- the one that is the highest priority.
  pick_order  text[] not null default '{}'::text[],
  top_pick    text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint day_plan_habits_one_per_day unique (user_id, local_date),
  constraint day_plan_habits_three check (cardinality(habit_ids) <= 3 and array_position(habit_ids, null) is null),
  constraint day_plan_habits_order check (cardinality(pick_order) <= 6 and array_position(pick_order, null) is null
                                           and public.text_items_within(pick_order, 42)),
  constraint day_plan_habits_top check (top_pick ~ '^(todo|habit):[0-9a-f-]{36}$')
);
revoke all on table public.day_plan_habits from public, anon, authenticated;
comment on table public.day_plan_habits is
  'The habits chosen in Plan my day, with the order of the day''s choices and the highest priority, one row per person and day (Phase 4, migration 039). Own rows only.';

-- A habit chosen for a day is the person's own sprint habit. Checked for
-- each habit added (a habit taken away later stays harmlessly in the list).
create or replace function public.day_plan_habits_own()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  had uuid[] := '{}'::uuid[];
begin
  if tg_op = 'UPDATE' and new.user_id = old.user_id then
    had := old.habit_ids;
  end if;
  if exists (
    select 1 from unnest(new.habit_ids) h(id)
     where not (h.id = any (had))
       and not exists (select 1 from public.sprint_habits s where s.id = h.id and s.user_id = new.user_id)
  ) then
    raise exception 'That sprint habit belongs to someone else.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.day_plan_habits_own() from public, anon, authenticated;

drop trigger if exists day_plan_habits_own on public.day_plan_habits;
create trigger day_plan_habits_own before insert or update on public.day_plan_habits
  for each row execute function public.day_plan_habits_own();

-- ---------------------------------------------------------------- wind_down_nights
create table if not exists public.wind_down_nights (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  -- The night it is for: the person's local date, a wind-down before 04:00
  -- counting for the night before (as Review my day).
  night        date not null,
  thoughts     text[] not null default '{}'::text[],
  sound        text not null default 'off',
  finished_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint wind_down_nights_one_per_night unique (user_id, night),
  -- No limit on how many (M19), only a ceiling no one writing at night reaches.
  constraint wind_down_nights_thoughts check (cardinality(thoughts) <= 100 and array_position(thoughts, null) is null),
  constraint wind_down_nights_thoughts_300 check (public.text_items_within(thoughts, 300)),
  constraint wind_down_nights_sound check (char_length(sound) between 1 and 40)
);
revoke all on table public.wind_down_nights from public, anon, authenticated;
comment on table public.wind_down_nights is
  'The Sleep wind down''s thoughts for tomorrow (each up to 300 characters), when it was finished and the sound chosen, one row per person and night (Phase 4, migration 039). Own rows only, never shared with a coach.';

-- The database keeps updated_at itself (server time), so a save can carry
-- the version it was based on (the app's save-version guard).
drop trigger if exists day_plan_habits_touch on public.day_plan_habits;
create trigger day_plan_habits_touch before update on public.day_plan_habits
  for each row execute function public.p1_touch();
drop trigger if exists wind_down_nights_touch on public.wind_down_nights;
create trigger wind_down_nights_touch before update on public.wind_down_nights
  for each row execute function public.p1_touch();

-- ---------------------------------------------------------------- rules: own rows only
do $rules$
declare t text;
begin
  foreach t in array array['day_plan_habits', 'wind_down_nights'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('drop policy if exists "Own rows: read" on public.%I', t);
    execute format('create policy "Own rows: read" on public.%I for select to authenticated using (user_id = (select auth.uid()))', t);
    execute format('drop policy if exists "Own rows: add" on public.%I', t);
    execute format('create policy "Own rows: add" on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', t);
    execute format('drop policy if exists "Own rows: change" on public.%I', t);
    execute format('create policy "Own rows: change" on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('drop policy if exists "Own rows: remove" on public.%I', t);
    execute format('create policy "Own rows: remove" on public.%I for delete to authenticated using (user_id = (select auth.uid()))', t);
  end loop;
end
$rules$;

-- ---------------------------------------------------------------- "for tomorrow": 300 characters each
-- NOT VALID first, so an older row can never stop the migration; then
-- checked over every saved row when they all fit. A row that doesn't fit
-- stays as it is (and the constraint stays NOT VALID: it still checks
-- every row added or changed from now on).
do $tomorrow$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.day_reviews'::regclass and conname = 'day_reviews_tomorrow_300') then
    alter table public.day_reviews
      add constraint day_reviews_tomorrow_300 check (public.text_items_within(tomorrow, 300)) not valid;
  end if;
  if not exists (select 1 from public.day_reviews where not public.text_items_within(tomorrow, 300)) then
    alter table public.day_reviews validate constraint day_reviews_tomorrow_300;
  else
    raise notice '039: an older day review holds a "for tomorrow" item over 300 characters; the limit applies to new and changed rows.';
  end if;
end
$tomorrow$;

-- ---------------------------------------------------------------- todos.source: sleep wind down
-- 028's list, plus 'sleep_wind_down'. The old check is found by what it
-- holds (its name was made by the database), and replaced by a named one.
do $source$
declare c record;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.todos'::regclass and contype = 'c'
              and pg_get_constraintdef(oid) like '%source%'
              and pg_get_constraintdef(oid) like '%other_tool%'
  loop
    execute format('alter table public.todos drop constraint %I', c.conname);
  end loop;
  alter table public.todos add constraint todos_source_check
    check (source in ('manual', 'plan_my_day', 'review_my_day', 'debrief', 'get_unstuck', 'pre_mortem',
                      'meeting_plan', 'after_action_review', 'other_tool', 'conversion', 'sleep_wind_down'));
end
$source$;

-- Records itself where the migration log (025) is there; on a database
-- without it yet, this does nothing rather than stop the migration.
do $$
begin
  if to_regprocedure('public.record_migration(integer,text)') is not null then
    perform public.record_migration(39, '039_day_habits_and_wind_down');
  end if;
end;
$$;
