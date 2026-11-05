-- =============================================================================
-- 040_checkin_extras_and_review_way.sql
-- Phase 5 follow-up, step 1 (Tim, 5 Nov, decisions part 4, "Phase 5
-- preview fixes reported"): the answers kept only on the device move into
-- the database, so another device (or a new phone) sees them too.
--
-- WHAT THIS DOES (plain English)
--     checkins.drinks       the drinks counted for "On average, what do you
--                           drink in a week?": each kind and how many
--                           ({"pint": 4, "wine": 2, "other": 1.5}). The
--                           answer itself (the band, H8) stays in
--                           answers, as before, so the scores never
--                           change. Up to 99 of each drink; "other" is
--                           units typed, up to 999.
--     checkins.trip         which "Did you travel this month?" answer was
--                           chosen: 'no', 'short' or 'long'. H14 and H15
--                           stay in answers, as before.
--     day_reviews.way_of_being
--                           the way of being chosen in Review my day when
--                           the day wasn't planned ("How did you want to
--                           be today?"), up to 120 characters, as in
--                           day_plans.way_of_being (028).
--   Three new columns on rows that are already there. Nothing is moved and
--   no saved row changes: every new column starts empty. 029's check of
--   the answers (checkins_score) is not touched, so the scores are worked
--   out exactly as before.
--
-- WHO CAN SEE WHAT (no change)
--   The new columns sit on the same rows as the answers around them, so
--   they follow the same rules (028 and 029): each person reads, adds,
--   changes and removes their own; a check-in is read by the person's
--   coach only when its sharing switch is on (may_see, 'checkin'); a day
--   review is the person's own only. No rule is added or changed.
--
-- SAFE TO RUN TWICE
--   Yes: each column and each check is added only when missing, and the
--   function is replaced.
--
-- HOW TO RUN
--   After 028 and 029 (it changes checkins and day_reviews). 038 and 039
--   are not needed first. Then run
--   supabase/040_checkin_extras_and_review_way_test.sql.
--   Until it has run, the portal keeps these answers on the device, with
--   no error, and moves them across once it finds the columns.
-- =============================================================================

-- ---------------------------------------------------------------- the drinks check
-- A drinks count is an object of known drinks, each a number from 0 to 99
-- ("other" is units, 0 to 999). Pure, so a check constraint may use it.
create or replace function public.checkin_drinks_ok(p jsonb)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select p is null or (
    jsonb_typeof(p) = 'object'
    and pg_column_size(p) <= 2000
    and coalesce((
      select bool_and(
        e.key in ('pint', 'bottle', 'wine', 'wine_large', 'spirit', 'other')
        and jsonb_typeof(e.value) = 'number'
        and (e.value #>> '{}')::numeric >= 0
        and (e.value #>> '{}')::numeric <= case when e.key = 'other' then 999 else 99 end
      )
      from jsonb_each(p) e
    ), true)
  );
$$;
revoke all on function public.checkin_drinks_ok(jsonb) from public, anon;
grant execute on function public.checkin_drinks_ok(jsonb) to authenticated, service_role;
comment on function public.checkin_drinks_ok(jsonb) is
  'True when a check-in''s drinks count holds only known drinks, each 0 to 99 (other: units, 0 to 999). 040.';

-- ---------------------------------------------------------------- the columns
alter table public.checkins add column if not exists drinks jsonb;
alter table public.checkins add column if not exists trip text;
alter table public.day_reviews add column if not exists way_of_being text;

comment on column public.checkins.drinks is
  'The drinks counted for H8, each kind and how many; H8 in answers keeps the band (040).';
comment on column public.checkins.trip is
  'Which travel answer was chosen: no, short or long; H14 and H15 stay in answers (040).';
comment on column public.day_reviews.way_of_being is
  'The way of being chosen in Review my day when the day had no plan, up to 120 characters (040).';

do $checks$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.checkins'::regclass and conname = 'checkins_drinks_check') then
    alter table public.checkins add constraint checkins_drinks_check check (public.checkin_drinks_ok(drinks));
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.checkins'::regclass and conname = 'checkins_trip_check') then
    alter table public.checkins add constraint checkins_trip_check check (trip is null or trip in ('no', 'short', 'long'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.day_reviews'::regclass and conname = 'day_reviews_way_of_being_check') then
    alter table public.day_reviews add constraint day_reviews_way_of_being_check
      check (way_of_being is null or char_length(way_of_being) <= 120);
  end if;
end
$checks$;

-- Records itself where the migration log (025) is there; on a database
-- without it yet, this does nothing rather than stop the migration.
do $$
begin
  if to_regprocedure('public.record_migration(integer,text)') is not null then
    perform public.record_migration(40, '040_checkin_extras_and_review_way');
  end if;
end;
$$;
