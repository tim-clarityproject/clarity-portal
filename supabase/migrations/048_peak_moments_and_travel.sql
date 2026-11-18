-- =============================================================================
-- 048_peak_moments_and_travel.sql
-- Phase 8b (mock-ups M18, Peak moments, version 28, and M21, Travel plan,
-- version 7.2; Tim, 17 Nov 2026): where peak moments and travel plans are kept.
--
-- WHAT THIS DOES (plain English)
--   peak_moments         one row per peak moment: its name, work or personal,
--                        its kind (perform at my best, be fully present, or
--                        arrive at a break rested), its day or its start and
--                        end dates, where it is (a city and that city's time
--                        zone; empty means at home), how it repeats (a rule,
--                        never a list of dates), the lesson saved for the next
--                        one, and whether the person shares it with their coach.
--   peak_reviews         the review after each time a moment comes round
--                        (one per moment and day): the one-tap answer, what
--                        they'd keep, and the lesson.
--   travel_plans         one row per Travel plan: its name, usual sleep, the
--                        "I don't have caffeine" choice, and when it was made.
--   travel_flights       the plan's flights: out and home, each with its day,
--                        time, city and time zone at each end.
--   travel_plan_moments  which peak moments are the plan's key moments, each
--                        with its start time on the trip.
--   travel_ticks         the private ticks on a day's steps.
--   travel_away          the one thing a coach may see of a trip: that the
--                        person is away, where, when, and the time difference.
--   todos.source         gains 'peak_moment', for the to-do the lead-up
--                        question makes in the Daily plan (widened only).
--   Additive: new tables, one wider check. Nothing old reads the tables.
--
-- WHO CAN SEE WHAT
--   Everything here is the person's own: they read, add, change and remove
--   their own rows. A coach (public.is_coach_of) reads only:
--     - a peak moment the person has shared (shared = true), and its reviews;
--     - the away flag (travel_away).
--   Nobody else reads any of it, and a coach never reads a Travel plan, its
--   flights, its ticks or an unshared moment. Signed out reads nothing.
--
-- SAFE TO RUN TWICE
--   Yes: tables and indexes are made only when missing, and every rule and
--   trigger is dropped and made again. The to-do source check is replaced
--   by the same named check each time.
--
-- HOW TO RUN
--   After 026 (is_coach_of, p1_touch) and 028 (todos). Then run
--   supabase/048_peak_moments_and_travel_test.sql.
-- =============================================================================

do $need$
begin
  if to_regclass('public.todos') is null or to_regprocedure('public.is_coach_of(uuid)') is null then
    raise exception '048 needs 026 and 028 first (public.is_coach_of and public.todos).';
  end if;
end
$need$;

-- ---------------------------------------------------------------- peak moments
create table if not exists public.peak_moments (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null,
  area        text not null default 'work',
  kind        text not null default 'perform',
  starts_on   date not null,
  ends_on     date not null,
  place_city  text,
  place_zone  text,
  repeat_rule jsonb,
  lesson      text,
  shared      boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint peak_moments_name check (char_length(btrim(name)) between 1 and 80),
  constraint peak_moments_area check (area in ('work', 'personal')),
  constraint peak_moments_kind check (kind in ('perform', 'present', 'rested')),
  constraint peak_moments_dates check (ends_on >= starts_on and ends_on - starts_on <= 366),
  constraint peak_moments_place check ((place_city is null) = (place_zone is null)),
  constraint peak_moments_city check (place_city is null or char_length(btrim(place_city)) between 1 and 120),
  -- A real place name (Europe/London), never an offset or letters (time zone rule 2).
  constraint peak_moments_zone check (place_zone is null or place_zone ~ '^[A-Za-z]+(/[A-Za-z0-9_+-]+){1,2}$'),
  -- The repeat is a rule (time zone rule 3): { every: month_date | month_weekday | week | year, until?: YYYY-MM-DD }.
  constraint peak_moments_repeat check (
    repeat_rule is null or (
      jsonb_typeof(repeat_rule) = 'object'
      and repeat_rule ->> 'every' in ('month_date', 'month_weekday', 'week', 'year')
      and (repeat_rule ->> 'until' is null or (repeat_rule ->> 'until') ~ '^\d{4}-\d{2}-\d{2}$')
      and pg_column_size(repeat_rule) <= 2000
    )
  ),
  constraint peak_moments_lesson check (lesson is null or char_length(lesson) <= 600)
);
comment on table public.peak_moments is
  'A peak moment: a moment that needs more of the person''s energy, attention and focus (M18). Own rows; a coach reads one only when shared. Phase 8b, migration 048.';
create index if not exists peak_moments_person_day on public.peak_moments (user_id, starts_on);

create table if not exists public.peak_reviews (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  moment_id   uuid not null references public.peak_moments (id) on delete cascade,
  occurs_on   date not null,
  answer      text not null,
  kept        text,
  lesson      text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint peak_reviews_one unique (moment_id, occurs_on),
  constraint peak_reviews_answer check (answer in ('very_well', 'well', 'mixed', 'not_well', 'yes', 'partly', 'no')),
  constraint peak_reviews_kept check (kept is null or char_length(kept) <= 600),
  constraint peak_reviews_lesson check (lesson is null or char_length(lesson) <= 600)
);
comment on table public.peak_reviews is
  'The review after a peak moment, once for each time it comes round (M18). Own rows; a coach reads one only for a shared moment.';
create index if not exists peak_reviews_person on public.peak_reviews (user_id, occurs_on);

-- ---------------------------------------------------------------- travel plans
create table if not exists public.travel_plans (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  title        text not null default '',
  sleep_start  time not null default '23:00',
  sleep_end    time not null default '07:00',
  no_caffeine  boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint travel_plans_title check (char_length(title) <= 120)
);
comment on table public.travel_plans is
  'A Travel plan (M21): its usual sleep and the no-caffeine choice. Its steps are worked out by the app (src/lib/travel). Own rows only: no coach reads it.';
create index if not exists travel_plans_person on public.travel_plans (user_id, created_at desc);

create table if not exists public.travel_flights (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  plan_id     uuid not null references public.travel_plans (id) on delete cascade,
  leg         text not null,
  sort_order  smallint not null default 0,
  departs_on  date not null,
  departs_at  time not null,
  from_city   text not null,
  from_zone   text not null,
  arrives_on  date not null,
  arrives_at  time not null,
  to_city     text not null,
  to_zone     text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint travel_flights_leg check (leg in ('out', 'between', 'home')),
  constraint travel_flights_cities check (char_length(btrim(from_city)) between 1 and 120 and char_length(btrim(to_city)) between 1 and 120),
  constraint travel_flights_zones check (from_zone ~ '^[A-Za-z]+(/[A-Za-z0-9_+-]+){1,2}$' and to_zone ~ '^[A-Za-z]+(/[A-Za-z0-9_+-]+){1,2}$'),
  constraint travel_flights_days check (arrives_on >= departs_on - 1 and arrives_on <= departs_on + 2)
);
create index if not exists travel_flights_plan on public.travel_flights (plan_id, sort_order);

create table if not exists public.travel_plan_moments (
  plan_id     uuid not null references public.travel_plans (id) on delete cascade,
  moment_id   uuid not null references public.peak_moments (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  -- The key moment's start time on the trip, in its own city's time (a
  -- peak moment keeps a day, not a time; M21: "Tue 10 Nov at 09:00").
  starts_at   time,
  created_at  timestamptz not null default now(),
  primary key (plan_id, moment_id)
);
alter table public.travel_plan_moments add column if not exists starts_at time;

create table if not exists public.travel_ticks (
  plan_id     uuid not null references public.travel_plans (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  day         date not null,
  step        text not null,
  created_at  timestamptz not null default now(),
  primary key (plan_id, day, step),
  constraint travel_ticks_step check (step ~ '^[a-z_]{1,24}(:[0-9a-f-]{1,40})?$')
);
comment on table public.travel_ticks is
  'A tick on a day''s Travel plan step. Private: never read by a coach, and nothing ever says what wasn''t ticked.';

create table if not exists public.travel_away (
  plan_id      uuid primary key references public.travel_plans (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  city         text not null,
  zone         text not null,
  starts_on    date not null,
  ends_on      date not null,
  hours_apart  numeric(4, 2) not null,
  updated_at   timestamptz not null default now(),
  constraint travel_away_dates check (ends_on >= starts_on),
  constraint travel_away_zone check (zone ~ '^[A-Za-z]+(/[A-Za-z0-9_+-]+){1,2}$'),
  constraint travel_away_hours check (hours_apart between -26 and 26)
);
comment on table public.travel_away is
  'That the person is away, for their coach (M21: "Tim sees that you''re away in New York, and your key moments."). The coach portal reads it in Phase 6a.';
create index if not exists travel_away_person on public.travel_away (user_id, starts_on);

-- ---------------------------------------------------------------- updated_at
do $touch$
declare t text;
begin
  if to_regprocedure('public.p1_touch()') is not null then
    foreach t in array array['peak_moments', 'peak_reviews', 'travel_plans', 'travel_flights', 'travel_away'] loop
      execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
      execute format('create trigger %I before update on public.%I for each row execute function public.p1_touch()', t || '_touch', t);
    end loop;
  end if;
end
$touch$;

-- ---------------------------------------------------------------- rules
-- Own rows for every table; a coach reads shared moments, their reviews and the away flag.
do $rules$
declare t text;
begin
  foreach t in array array['peak_moments', 'peak_reviews', 'travel_plans', 'travel_flights', 'travel_plan_moments', 'travel_ticks', 'travel_away'] loop
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

drop policy if exists "Coach: shared moments" on public.peak_moments;
create policy "Coach: shared moments" on public.peak_moments for select to authenticated
  using (shared and public.is_coach_of(user_id));
drop policy if exists "Coach: reviews of shared moments" on public.peak_reviews;
create policy "Coach: reviews of shared moments" on public.peak_reviews for select to authenticated
  using (public.is_coach_of(user_id) and exists (select 1 from public.peak_moments m where m.id = moment_id and m.shared));
drop policy if exists "Coach: away" on public.travel_away;
create policy "Coach: away" on public.travel_away for select to authenticated
  using (public.is_coach_of(user_id));

-- A row that points at another person's plan or moment is refused: the
-- link, a flight, a tick, a review and the away flag all belong to the
-- plan's or moment's own person.
create or replace function public.peak_travel_same_person()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name in ('travel_flights', 'travel_ticks', 'travel_away', 'travel_plan_moments') then
    if not exists (select 1 from public.travel_plans p where p.id = new.plan_id and p.user_id = new.user_id) then
      raise exception 'That plan isn''t yours.' using errcode = '42501';
    end if;
  end if;
  if tg_table_name in ('peak_reviews', 'travel_plan_moments') then
    if not exists (select 1 from public.peak_moments m where m.id = new.moment_id and m.user_id = new.user_id) then
      raise exception 'That peak moment isn''t yours.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.peak_travel_same_person() from public, anon, authenticated;

do $same$
declare t text;
begin
  foreach t in array array['travel_flights', 'travel_ticks', 'travel_away', 'travel_plan_moments', 'peak_reviews'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_same_person', t);
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.peak_travel_same_person()', t || '_same_person', t);
  end loop;
end
$same$;

-- ---------------------------------------------------------------- todos.source: peak moment
-- The list as it is today (028, then 039's 'sleep_wind_down'), plus 'peak_moment'.
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
                      'meeting_plan', 'after_action_review', 'other_tool', 'conversion', 'sleep_wind_down', 'peak_moment'));
end
$source$;

do $$
begin
  if to_regprocedure('public.record_migration(integer,text)') is not null then
    perform public.record_migration(48, '048_peak_moments_and_travel');
  end if;
end;
$$;
