-- =============================================================================
-- 047_day_plan_no_limit.sql: the Daily plan takes as many of this week's
-- habits and to-dos as a person chooses (Tim, 16 Nov, 19:03: "i dont think we
-- should be limiting people to only doing 3 to dos a day ... high performers
-- want to do lots"; this replaces "Up to three to-dos stays", decisions part 1,
-- 23 Oct, 13:06).
--
-- Needs 028 (day_plan_todos and its limit) and 039 (day_plan_habits): it stops
-- without them. Additive and safe to run twice.
--
-- WHAT IT DOES
--   1. 028's day_plan_limits() no longer stops a day plan at 3 to-dos. It
--      keeps "one or two Strategies for the day", and, only so that nobody
--      can fill the table, a day plan holds at most 100 to-dos: far beyond
--      any day, never something a person meets.
--   2. 039's day_plan_habits checks: habit_ids (three at most) and pick_order
--      (six at most) are replaced by 100 habits and 200 choices in a day, for
--      the same reason, with every other part of each check kept (no empty
--      item; each choice 42 characters at most).
--   Nothing else changes. The app no longer cuts the day's choices at three.
--
-- Test: supabase/047_day_plan_no_limit_test.sql (then 028's and 039's tests,
-- which follow 047 when it is there). Dry run, rolled back:
--   bash scripts/dry-run-on-test.sh supabase/migrations/047_day_plan_no_limit.sql \
--     supabase/migrations/047_day_plan_no_limit.sql supabase/047_day_plan_no_limit_test.sql
-- =============================================================================

do $need$
begin
  if to_regclass('public.day_plan_todos') is null or to_regprocedure('public.day_plan_limits()') is null then
    raise exception '047 needs migration 028 (the Daily plan''s tables) first.';
  end if;
  if to_regclass('public.day_plan_habits') is null then
    raise exception '047 needs migration 039 (day_plan_habits) first.';
  end if;
end
$need$;

-- ---------------------------------------------------------------- to-dos: no cap of three
create or replace function public.day_plan_limits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- As many to-dos as the person chooses (047); 100 only so that nobody can fill the table.
  if tg_table_name = 'day_plan_todos'
     and (select count(*) from public.day_plan_todos where day_plan_id = new.day_plan_id) > 100 then
    raise exception 'That''s as many to-dos as a day can hold.' using errcode = '23514';
  end if;
  if tg_table_name = 'day_plan_strategies'
     and (select count(*) from public.day_plan_strategies where day_plan_id = new.day_plan_id) > 2 then
    raise exception 'Choose one or two Strategies for the day.' using errcode = '23514';
  end if;
  return null;
end;
$$;
revoke all on function public.day_plan_limits() from public, anon, authenticated;

-- ---------------------------------------------------------------- habits: no cap of three
alter table public.day_plan_habits drop constraint if exists day_plan_habits_three;
alter table public.day_plan_habits drop constraint if exists day_plan_habits_many;
alter table public.day_plan_habits add constraint day_plan_habits_many
  check (cardinality(habit_ids) <= 100 and array_position(habit_ids, null) is null);

alter table public.day_plan_habits drop constraint if exists day_plan_habits_order;
alter table public.day_plan_habits add constraint day_plan_habits_order
  check (cardinality(pick_order) <= 200 and array_position(pick_order, null) is null
         and public.text_items_within(pick_order, 42));

comment on column public.day_plan_habits.habit_ids is
  'The sprint habits chosen for the day (sprint_habits ids): as many as the person chooses (047; 100 at most, only so the table cannot be filled).';

select public.record_migration(47, '047_day_plan_no_limit');
