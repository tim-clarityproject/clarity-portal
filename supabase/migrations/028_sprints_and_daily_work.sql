-- =============================================================================
-- 028_sprints_and_daily_work.sql
-- Phase 1 data model, part 3 of 6: sprints and the work
-- (phase-1-data-model-spec.md section 3)
--
-- WHAT THIS DOES (plain English)
--     sprints                  Performance Sprint 1, 2 …: start day, 2 to 16
--                              weeks, the standard (50 to 100, default 85),
--                              running or finished, planned and actual end
--     sprint_habits            the plan's habits, copied when a sprint starts,
--     sprint_habit_settings    with each change to measure, target or impact
--                              and the sprint week it applies from
--     recovery_periods         Recovery: start, chosen length, extensions, the
--                              day "I'm ready to go again", "Let [coach] know"
--     recovery_recharge_answers  "What would help you recharge today?"
--     habit_logs               one value per sprint habit per local day; an
--                              odd entry is kept "to confirm"
--     todos, todo_moves        one-off tactics, and every move between weeks
--                              (recorded automatically), so methods M2 can be
--                              worked out exactly
--     wins, win_strategies     unplanned wins, each in one or more Strategies;
--                              every win is also saved to Performance Evidence
--     performance_evidence     moments captured, plus every win
--     day_plans (+ day_plan_todos, day_plan_strategies)       Plan my day
--     day_reviews (+ day_review_strategies)                   Review my day
--     weekly_debriefs          the weekly performance debrief's answers
--     week_scores              each week's frozen score and Strategy scores,
--                              with the methods version (written only by the
--                              checked functions in migration 032)
--     emotional_control_checks one row per "above or below the line" check
--
-- WHO CAN SEE WHAT (spec section 5)
--   The person: everything of their own.
--   Their coach: sprints and week scores if "Progress" is shared; a week's
--   debrief only if that week was shared; a Recovery's start and length if
--   "Let [coach] know" was ticked; recharge answers and evidence one item at
--   a time, as shared. Never logs, habits, to-dos, wins, day plans or day
--   reviews.
--   Sponsors and leaders: nothing here.
--
-- SAFE TO RUN TWICE
--   Yes. Tables and indexes are made only if missing; functions, rules and
--   triggers are replaced with the same versions.
--
-- HOW TO RUN
--   After 027. Then run supabase/028_sprints_and_daily_work_test.sql.
-- =============================================================================

create table if not exists public.sprints (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  plan_id        uuid not null references public.performance_plans (id) on delete cascade,
  number         integer not null check (number >= 1),
  label          text check (char_length(label) <= 60),
  start_on       date not null,
  length_weeks   integer not null default 12 check (length_weeks between 2 and 16),
  standard       integer not null default 85 check (standard between 50 and 100),
  status         text not null default 'running' check (status in ('running', 'finished')),
  planned_end_on date generated always as (start_on + (length_weeks * 7 - 1)) stored,
  actual_end_on  date,
  finished_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (user_id, number)
);
create unique index if not exists sprints_one_running on public.sprints (user_id) where status = 'running';
create index if not exists sprints_plan_idx on public.sprints (plan_id);
create index if not exists sprints_user_idx on public.sprints (user_id, start_on desc);

do $fk$
begin
  if not exists (select 1 from pg_constraint where conname = 'objective_figures_sprint_fk') then
    alter table public.objective_figures
      add constraint objective_figures_sprint_fk foreign key (sprint_id) references public.sprints (id) on delete set null;
  end if;
end
$fk$;
create index if not exists objective_figures_sprint_idx on public.objective_figures (sprint_id, sprint_week);

create table if not exists public.sprint_habits (
  id          uuid primary key default gen_random_uuid(),
  sprint_id   uuid not null references public.sprints (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  habit_id    uuid references public.habits (id) on delete set null,
  strategy_id uuid not null references public.plan_strategies (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 80),
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);
create unique index if not exists sprint_habits_one_per_habit on public.sprint_habits (sprint_id, habit_id) where habit_id is not null;
create index if not exists sprint_habits_sprint_idx on public.sprint_habits (sprint_id, sort_order);
create index if not exists sprint_habits_habit_idx on public.sprint_habits (habit_id);
create index if not exists sprint_habits_strategy_idx on public.sprint_habits (strategy_id);
create index if not exists sprint_habits_user_idx on public.sprint_habits (user_id);

create table if not exists public.sprint_habit_settings (
  id              uuid primary key default gen_random_uuid(),
  sprint_habit_id uuid not null references public.sprint_habits (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  from_week       integer not null check (from_week >= 1),
  measure         text not null check (measure in ('count', 'amount', 'yes_no_weekly', 'yes_no_days_target',
                                                  'yes_no_days_limit', 'count_limit', 'rating')),
  unit            text check (char_length(unit) <= 30),
  target          numeric check (target >= 0),
  target_per      text check (target_per in ('day', 'week')),
  limit_value     numeric check (limit_value >= 0),
  limit_per       text check (limit_per in ('day', 'week')),
  direction       text check (direction in ('higher', 'lower')),
  top_number      numeric check (top_number > 0),
  impact          smallint not null default 2 check (impact between 1 and 3),
  created_at      timestamptz not null default now(),
  unique (sprint_habit_id, from_week),
  check (
    (measure in ('count', 'amount') and target is not null and target_per is not null)
    or (measure = 'yes_no_weekly')
    or (measure = 'yes_no_days_target' and (target is null or target between 1 and 7))
    or (measure = 'yes_no_days_limit' and limit_value between 0 and 7)
    or (measure = 'count_limit' and limit_value is not null and limit_per is not null)
    or (measure = 'rating' and direction is not null and target is not null
        and ((direction = 'higher' and target between 2 and 5) or (direction = 'lower' and target between 1 and 4)))
  )
);
comment on table public.sprint_habit_settings is
  'A sprint habit''s measure, target and impact from a sprint week onwards; past weeks keep what they had (decided 21 Oct).';
create index if not exists sprint_habit_settings_user_idx on public.sprint_habit_settings (user_id);

create table if not exists public.recovery_periods (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  sprint_id      uuid references public.sprints (id) on delete set null,
  started_at     timestamptz not null default now(),
  start_on       date not null,
  chosen_days    integer not null default 7 check (chosen_days between 1 and 30),
  extended_days  integer not null default 0 check (extended_days between 0 and 60),
  ended_at       timestamptz,
  end_on         date,
  let_coach_know boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check ((ended_at is null) = (end_on is null)),
  check (end_on is null or end_on >= start_on),
  check (start_on >= date '2020-01-01' and (end_on is null or end_on - start_on <= 120))
);
comment on table public.recovery_periods is
  'Recovery pauses sprint time from start_on until the day before end_on ("I''m ready to go again"; methods M0.4). The coach sees only that it started and until when, never why.';
create unique index if not exists recovery_periods_one_open on public.recovery_periods (user_id) where ended_at is null;
create index if not exists recovery_periods_user_idx on public.recovery_periods (user_id, start_on desc);
create index if not exists recovery_periods_sprint_idx on public.recovery_periods (sprint_id);

create table if not exists public.recovery_recharge_answers (
  id          uuid primary key default gen_random_uuid(),
  recovery_id uuid not null references public.recovery_periods (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  local_date  date not null,
  answer      text not null check (char_length(answer) <= 500),
  shared      boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (recovery_id, local_date)
);
create index if not exists recovery_recharge_answers_user_idx on public.recovery_recharge_answers (user_id, local_date);

create table if not exists public.habit_logs (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  sprint_habit_id uuid not null references public.sprint_habits (id) on delete cascade,
  local_date      date not null,
  value           numeric not null check (value >= 0),
  to_confirm      boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (sprint_habit_id, local_date)
);
comment on column public.habit_logs.to_confirm is
  'An odd entry (pattern rule 14), kept but left out of summaries and patterns until the person confirms it.';
create index if not exists habit_logs_user_date_idx on public.habit_logs (user_id, local_date);

create table if not exists public.todos (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  strategy_id  uuid not null references public.plan_strategies (id) on delete cascade,
  text         text not null check (char_length(btrim(text)) between 1 and 300),
  impact       smallint not null default 2 check (impact between 1 and 3),
  sprint_id    uuid references public.sprints (id) on delete set null,
  planned_week integer check (planned_week >= 1),
  created_on   date not null default current_date,
  done_on      date,
  source       text not null default 'manual'
               check (source in ('manual', 'plan_my_day', 'review_my_day', 'debrief', 'get_unstuck', 'pre_mortem',
                                 'meeting_plan', 'after_action_review', 'other_tool', 'conversion')),
  source_id    uuid,
  move_on      date,
  deleted_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check ((sprint_id is null) = (planned_week is null))
);
comment on column public.todos.move_on is
  'The person''s local day of their latest move, set by the app with the move; recorded in todo_moves (methods M2).';
create index if not exists todos_week_idx on public.todos (user_id, sprint_id, planned_week) where deleted_at is null;
create index if not exists todos_user_idx on public.todos (user_id, created_on);
create index if not exists todos_sprint_idx on public.todos (sprint_id, planned_week);
create index if not exists todos_strategy_idx on public.todos (strategy_id);
create index if not exists todos_done_idx on public.todos (user_id, done_on) where done_on is not null;

create table if not exists public.todo_moves (
  id             uuid primary key default gen_random_uuid(),
  todo_id        uuid not null references public.todos (id) on delete cascade,
  user_id        uuid not null references auth.users (id) on delete cascade,
  moved_on       date not null,
  from_sprint_id uuid references public.sprints (id) on delete set null,
  from_week      integer,
  to_sprint_id   uuid references public.sprints (id) on delete set null,
  to_week        integer,
  created_at     timestamptz not null default now()
);
create index if not exists todo_moves_todo_idx on public.todo_moves (todo_id, moved_on, created_at);
create index if not exists todo_moves_user_idx on public.todo_moves (user_id);
create index if not exists todo_moves_from_sprint_idx on public.todo_moves (from_sprint_id);
create index if not exists todo_moves_to_sprint_idx on public.todo_moves (to_sprint_id);

create table if not exists public.wins (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  what       text not null check (char_length(btrim(what)) between 1 and 300),
  local_date date not null,
  impact     smallint not null default 2 check (impact between 1 and 3),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists wins_user_date_idx on public.wins (user_id, local_date);

create table if not exists public.win_strategies (
  win_id      uuid not null references public.wins (id) on delete cascade,
  strategy_id uuid not null references public.plan_strategies (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  primary key (win_id, strategy_id)
);
create index if not exists win_strategies_strategy_idx on public.win_strategies (strategy_id);
create index if not exists win_strategies_user_idx on public.win_strategies (user_id);

create table if not exists public.performance_evidence (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  kind              text not null default 'moment' check (kind in ('moment', 'win')),
  text              text not null check (char_length(btrim(text)) between 1 and 1000),
  local_date        date not null,
  strategy_id       uuid references public.plan_strategies (id) on delete set null,
  win_id            uuid unique references public.wins (id) on delete cascade,
  shared_with_coach boolean not null default false,
  deleted_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check ((kind = 'win') = (win_id is not null))
);
create index if not exists performance_evidence_user_idx on public.performance_evidence (user_id, local_date desc);
create index if not exists performance_evidence_strategy_idx on public.performance_evidence (strategy_id);

create table if not exists public.day_plans (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  local_date       date not null,
  sleep_hours      numeric check (sleep_hours between 0 and 24 and sleep_hours * 2 = floor(sleep_hours * 2)),
  sleep_to_confirm boolean not null default false,
  sleep_quality    text check (sleep_quality in ('very_poor', 'poor', 'fair', 'good', 'very_good')),
  grateful_for     text check (char_length(grateful_for) <= 300),
  way_of_being     text check (char_length(way_of_being) <= 120),
  biggest_risk     text check (char_length(biggest_risk) <= 300),
  risk_response    text check (char_length(risk_response) <= 300),
  status           text not null default 'draft' check (status in ('draft', 'finished')),
  finished_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (user_id, local_date)
);

create table if not exists public.day_plan_todos (
  day_plan_id uuid not null references public.day_plans (id) on delete cascade,
  todo_id     uuid not null references public.todos (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  is_top      boolean not null default false,
  primary key (day_plan_id, todo_id)
);
create unique index if not exists day_plan_todos_one_top on public.day_plan_todos (day_plan_id) where is_top;
create index if not exists day_plan_todos_todo_idx on public.day_plan_todos (todo_id);
create index if not exists day_plan_todos_user_idx on public.day_plan_todos (user_id);

create table if not exists public.day_plan_strategies (
  day_plan_id uuid not null references public.day_plans (id) on delete cascade,
  strategy_id uuid not null references public.plan_strategies (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  primary key (day_plan_id, strategy_id)
);
create index if not exists day_plan_strategies_strategy_idx on public.day_plan_strategies (strategy_id);
create index if not exists day_plan_strategies_user_idx on public.day_plan_strategies (user_id);

create table if not exists public.day_reviews (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users (id) on delete cascade,
  local_date          date not null,
  way_of_being_rating smallint check (way_of_being_rating between 1 and 10),
  where_it_showed     text check (char_length(where_it_showed) <= 1000),
  went_well           text check (char_length(went_well) <= 4000),
  differently         text check (char_length(differently) <= 4000),
  tomorrow            text[] not null default '{}'::text[] check (cardinality(tomorrow) <= 3),
  on_my_mind          text check (char_length(on_my_mind) <= 4000),
  status              text not null default 'draft' check (status in ('draft', 'finished')),
  finished_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (user_id, local_date)
);

create table if not exists public.day_review_strategies (
  day_review_id uuid not null references public.day_reviews (id) on delete cascade,
  strategy_id   uuid not null references public.plan_strategies (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  level         smallint not null check (level between 1 and 3),
  primary key (day_review_id, strategy_id)
);
create index if not exists day_review_strategies_strategy_idx on public.day_review_strategies (strategy_id);
create index if not exists day_review_strategies_user_idx on public.day_review_strategies (user_id);

create table if not exists public.weekly_debriefs (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  sprint_id         uuid not null references public.sprints (id) on delete cascade,
  sprint_week       integer not null check (sprint_week >= 1),
  stress            text check (stress in ('not_at_all', 'a_little', 'moderately', 'quite_a_lot', 'very_much')),
  unusual           boolean not null default false,
  went_well         text check (char_length(went_well) <= 4000),
  got_in_way        text check (char_length(got_in_way) <= 4000),
  adjust            text check (char_length(adjust) <= 4000),
  shared_with_coach boolean not null default false,
  status            text not null default 'draft' check (status in ('draft', 'finished')),
  finished_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (sprint_id, sprint_week)
);
comment on column public.weekly_debriefs.unusual is '"This week was unusual (ill, holiday, family)": left out of the usual range and patterns (methods M0.5).';
create index if not exists weekly_debriefs_user_idx on public.weekly_debriefs (user_id, created_at desc);

create table if not exists public.week_scores (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  sprint_id       uuid not null references public.sprints (id) on delete cascade,
  sprint_week     integer not null check (sprint_week >= 1),
  week_start      date not null,
  week_end        date not null,
  score           numeric check (score between 0 and 100),
  strategy_scores jsonb not null default '[]'::jsonb check (jsonb_typeof(strategy_scores) = 'array'),
  eligible        boolean not null default false,
  final           boolean not null default false,
  methods_version text not null,
  frozen_at       timestamptz not null default now(),
  unique (sprint_id, sprint_week)
);
comment on table public.week_scores is
  'Each finished week''s score (methods M5) and Strategy scores (M4), saved when the debrief is done or its window closes (M0.4), with the methods version. Written only by public.freeze_week (migration 032).';
create index if not exists week_scores_user_idx on public.week_scores (user_id, week_end);

create table if not exists public.emotional_control_checks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  local_date  date not null,
  tool        text not null check (tool in ('after_action_review', 'meeting_review', 'feedback_review', 'above_below_line')),
  line        text not null check (line in ('above', 'below')),
  decision_id uuid references public.decisions (id) on delete set null,
  created_at  timestamptz not null default now()
);
comment on table public.emotional_control_checks is
  'Each "above or below the line" check (methods M12). The tools still save their content in decisions; this lets the dashboard count them.';
create index if not exists emotional_control_checks_user_idx on public.emotional_control_checks (user_id, local_date);
create index if not exists emotional_control_checks_decision_idx on public.emotional_control_checks (decision_id);

-- ---------------------------------------------------------------- same owner
do $owner$
declare r record;
begin
  for r in select * from (values
    ('sprints', 'performance_plans', 'plan_id'),
    ('objective_figures', 'sprints', 'sprint_id'),
    ('sprint_habits', 'sprints', 'sprint_id'),
    ('sprint_habits', 'habits', 'habit_id'),
    ('sprint_habits', 'plan_strategies', 'strategy_id'),
    ('sprint_habit_settings', 'sprint_habits', 'sprint_habit_id'),
    ('recovery_periods', 'sprints', 'sprint_id'),
    ('recovery_recharge_answers', 'recovery_periods', 'recovery_id'),
    ('habit_logs', 'sprint_habits', 'sprint_habit_id'),
    ('todos', 'plan_strategies', 'strategy_id'),
    ('todos', 'sprints', 'sprint_id'),
    ('win_strategies', 'wins', 'win_id'),
    ('win_strategies', 'plan_strategies', 'strategy_id'),
    ('performance_evidence', 'plan_strategies', 'strategy_id'),
    ('performance_evidence', 'wins', 'win_id'),
    ('day_plan_todos', 'day_plans', 'day_plan_id'),
    ('day_plan_todos', 'todos', 'todo_id'),
    ('day_plan_strategies', 'day_plans', 'day_plan_id'),
    ('day_plan_strategies', 'plan_strategies', 'strategy_id'),
    ('day_review_strategies', 'day_reviews', 'day_review_id'),
    ('day_review_strategies', 'plan_strategies', 'strategy_id'),
    ('weekly_debriefs', 'sprints', 'sprint_id'),
    ('emotional_control_checks', 'decisions', 'decision_id')
  ) v(child, parent, col) loop
    execute format('drop trigger if exists %I on public.%I', r.child || '_owner_' || r.col, r.child);
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.p1_same_owner(%L, %L)',
                   r.child || '_owner_' || r.col, r.child, r.parent, r.col);
  end loop;
end
$owner$;

-- ---------------------------------------------------------------- the work's own rules
-- Every move of a to-do between weeks is recorded, so methods M2 (moved
-- before or after its week started) can be worked out exactly.
create or replace function public.todos_record_move()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  tz text;
  day date;
begin
  if (new.sprint_id, new.planned_week) is not distinct from (old.sprint_id, old.planned_week) then
    return new;
  end if;
  day := new.move_on;
  if day is null or day is not distinct from old.move_on then
    select s.time_zone into tz from public.person_settings s where s.user_id = new.user_id;
    day := (now() at time zone coalesce(tz, 'UTC'))::date;
  end if;
  insert into public.todo_moves (todo_id, user_id, moved_on, from_sprint_id, from_week, to_sprint_id, to_week)
  values (new.id, new.user_id, day, old.sprint_id, old.planned_week, new.sprint_id, new.planned_week);
  return new;
end;
$$;
revoke all on function public.todos_record_move() from public, anon, authenticated;
drop trigger if exists todos_record_move on public.todos;
create trigger todos_record_move after update on public.todos
  for each row execute function public.todos_record_move();

-- Every win is also saved to Performance Evidence, and keeps it up to date.
create or replace function public.wins_to_evidence()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.performance_evidence (user_id, kind, text, local_date, win_id)
  values (new.user_id, 'win', new.what, new.local_date, new.id)
  on conflict (win_id) do update
    set text = excluded.text, local_date = excluded.local_date,
        deleted_at = new.deleted_at, updated_at = now();
  return new;
end;
$$;
revoke all on function public.wins_to_evidence() from public, anon, authenticated;
drop trigger if exists wins_to_evidence on public.wins;
create trigger wins_to_evidence after insert or update on public.wins
  for each row execute function public.wins_to_evidence();

-- Plan my day: up to 3 to-dos, one marked top; one or two Strategies of the day.
create or replace function public.day_plan_limits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'day_plan_todos'
     and (select count(*) from public.day_plan_todos where day_plan_id = new.day_plan_id) > 3 then
    raise exception 'Plan my day holds up to 3 to-dos.' using errcode = '23514';
  end if;
  if tg_table_name = 'day_plan_strategies'
     and (select count(*) from public.day_plan_strategies where day_plan_id = new.day_plan_id) > 2 then
    raise exception 'Choose one or two Strategies for the day.' using errcode = '23514';
  end if;
  return null;
end;
$$;
revoke all on function public.day_plan_limits() from public, anon, authenticated;
drop trigger if exists day_plan_todos_limit on public.day_plan_todos;
create constraint trigger day_plan_todos_limit after insert or update on public.day_plan_todos
  deferrable initially immediate for each row execute function public.day_plan_limits();
drop trigger if exists day_plan_strategies_limit on public.day_plan_strategies;
create constraint trigger day_plan_strategies_limit after insert or update on public.day_plan_strategies
  deferrable initially immediate for each row execute function public.day_plan_limits();

-- An odd night's sleep (outside 2 to 14 hours; methods M12) is kept but
-- marked to confirm whenever the hours change. The person confirms it by
-- setting sleep_to_confirm to false without changing the hours.
create or replace function public.day_plans_odd_sleep()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.sleep_hours is not null and (new.sleep_hours < 2 or new.sleep_hours > 14)
     and (tg_op = 'INSERT' or new.sleep_hours is distinct from old.sleep_hours) then
    new.sleep_to_confirm := true;
  elsif new.sleep_hours is null or (new.sleep_hours between 2 and 14) then
    new.sleep_to_confirm := false;
  end if;
  return new;
end;
$$;
revoke all on function public.day_plans_odd_sleep() from public, anon, authenticated;
drop trigger if exists day_plans_odd_sleep on public.day_plans;
create trigger day_plans_odd_sleep before insert or update on public.day_plans
  for each row execute function public.day_plans_odd_sleep();

do $touch$
declare t text;
begin
  foreach t in array array['sprints', 'recovery_periods', 'recovery_recharge_answers', 'habit_logs', 'todos', 'wins',
                           'performance_evidence', 'day_plans', 'day_reviews', 'weekly_debriefs'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.p1_touch()', t || '_touch', t);
  end loop;
end
$touch$;

-- ---------------------------------------------------------------- grants and rules
do $lock$
declare t text;
begin
  foreach t in array array['sprints', 'sprint_habits', 'sprint_habit_settings', 'recovery_periods', 'recovery_recharge_answers',
                           'habit_logs', 'todos', 'todo_moves', 'wins', 'win_strategies', 'performance_evidence',
                           'day_plans', 'day_plan_todos', 'day_plan_strategies', 'day_reviews', 'day_review_strategies',
                           'weekly_debriefs', 'week_scores', 'emotional_control_checks'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
  end loop;
end
$lock$;

-- (table, who else may read: SQL using the row's columns, or null for own only)
do $rules$
declare r record;
begin
  for r in select * from (values
    ('sprints', 'public.may_see(user_id, ''progress'')'),
    ('sprint_habits', null),
    ('sprint_habit_settings', null),
    ('recovery_periods', 'public.may_see(user_id, ''recovery_notice'', let_coach_know)'),
    ('recovery_recharge_answers', 'public.may_see(user_id, ''recharge'', shared)'),
    ('habit_logs', null),
    ('todos', null),
    ('wins', null),
    ('win_strategies', null),
    ('performance_evidence', 'public.may_see(user_id, ''evidence'', shared_with_coach and deleted_at is null)'),
    ('day_plans', null),
    ('day_plan_todos', null),
    ('day_plan_strategies', null),
    ('day_reviews', null),
    ('day_review_strategies', null),
    ('weekly_debriefs', 'public.may_see(user_id, ''debrief'', shared_with_coach)'),
    ('emotional_control_checks', null)
  ) v(t, also) loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', r.t);
    execute format('drop policy if exists "Read: own, or shared" on public.%I', r.t);
    execute format('create policy "Read: own, or shared" on public.%I for select to authenticated using (%s)', r.t,
                   case when r.also is null then 'user_id = (select auth.uid())'
                        else 'user_id = (select auth.uid()) or ' || r.also end);
    execute format('drop policy if exists "Own rows: add" on public.%I', r.t);
    execute format('create policy "Own rows: add" on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', r.t);
    execute format('drop policy if exists "Own rows: change" on public.%I', r.t);
    execute format('create policy "Own rows: change" on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', r.t);
    execute format('drop policy if exists "Own rows: remove" on public.%I', r.t);
    execute format('create policy "Own rows: remove" on public.%I for delete to authenticated using (user_id = (select auth.uid()))', r.t);
  end loop;
end
$rules$;

-- A to-do's moves are written only by the trigger.
grant select on public.todo_moves to authenticated;
drop policy if exists "Own to-do moves" on public.todo_moves;
create policy "Own to-do moves" on public.todo_moves for select to authenticated
  using (user_id = (select auth.uid()));

-- Week scores are written only by the checked functions (migration 032).
grant select on public.week_scores to authenticated;
drop policy if exists "Week scores: own, or progress shared" on public.week_scores;
create policy "Week scores: own, or progress shared" on public.week_scores for select to authenticated
  using (user_id = (select auth.uid()) or public.may_see(user_id, 'progress'));

select public.record_migration(28, '028_sprints_and_daily_work');
