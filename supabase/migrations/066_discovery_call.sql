-- =============================================================================
-- 066_discovery_call.sql
-- Polish 1, Stage B (Tim, 25 Nov, walking the Stage A preview): the call people
-- book to talk about coaching is always the "Discovery call", never the
-- "Chemistry Call".
--
-- WHAT IT DOES (additive, safe to run twice)
--   1. coach_call_types_start(), the function that makes the two call types
--      every coach starts with (051), is made again word for word with the
--      first one named 'Discovery call'. Its key stays 'chemistry' (a key, not
--      words anyone reads: pages, bookings, leads and sessions keep pointing
--      at it).
--   2. A coach's call type still named 'Chemistry Call' (any case; the old
--      default, never edited) is renamed 'Discovery call'. A name the coach
--      typed themselves is left alone.
--   3. booking_page(key) (051) is made again word for word, with one more
--      field, coach_full_name: the coach's full name with any title, as they
--      typed it in Settings ("Dr Tim Dutton"), shown small above the booking
--      page's title (Tim's walk, item 28). Null when it isn't set, and the
--      page then shows nothing there. It is the coach's own public page, so
--      the name they chose for clients is meant to be read there.
-- No table, column, rule or key changes.
-- =============================================================================

create or replace function public.coach_call_types_start()
returns setof public.coach_call_types
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_coach uuid := public.my_coach_id();
begin
  if v_coach is null then
    raise exception 'Only a coach can do this.' using errcode = '42501';
  end if;
  insert into public.coach_call_types (coach_id, key, name, minutes, notice_hours, ahead_weeks, position)
  values (v_coach, 'chemistry', 'Discovery call', 30, 24, 4, 0), (v_coach, 'connection', 'Connection Call', 30, 48, 2, 1)
  on conflict (coach_id, key) do nothing;
  return query select * from public.coach_call_types ct where ct.coach_id = v_coach order by ct.position, ct.created_at;
end;
$$;
revoke all on function public.coach_call_types_start() from public, anon;
grant execute on function public.coach_call_types_start() to authenticated;

update public.coach_call_types set name = 'Discovery call' where key = 'chemistry' and lower(btrim(name)) in ('chemistry call', 'chemistry calls');

create or replace function public.booking_page(p_key uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'state', t.t ->> 'state', 'kind', t.t ->> 'target', 'name', t.t ->> 'name', 'description', t.t ->> 'description',
    'coach_first_name', (select c.display_first_name from public.coaches c where c.id = (t.t ->> 'coach_id')::uuid),
    'coach_full_name', (select nullif(btrim(c.full_name), '') from public.coaches c where c.id = (t.t ->> 'coach_id')::uuid),
    'coach_time_zone', public._cal_coach_zone((t.t ->> 'coach_id')::uuid),
    'minutes', (t.t ->> 'minutes')::integer, 'place_kind', t.t ->> 'place_kind', 'questions', t.t -> 'questions',
    'notice_hours', (t.t ->> 'notice_hours')::integer, 'ahead_weeks', (t.t ->> 'ahead_weeks')::integer,
    'for_name', t.t ->> 'for_name')
  from (select public._booking_target(p_key) as t) t
  where t.t is not null;
$$;
revoke all on function public.booking_page(uuid) from public;
grant execute on function public.booking_page(uuid) to anon, authenticated;

select public.record_migration(66, '066_discovery_call');
