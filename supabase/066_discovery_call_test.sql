-- =============================================================================
-- 066_discovery_call_test.sql
-- Checks supabase/migrations/066_discovery_call.sql. RUN ORDER: 049 to 065,
-- then 066 (twice is fine), then this. Dry run only, on a local stand-in or the
-- test project. Everything it makes is undone by the dry run's rollback.
--
-- WHAT IT CHECKS
--   - coach_call_types_start() makes the first call type as 'Discovery call'
--     (key 'chemistry') and the second as 'Connection Call';
--   - a call type still named 'Chemistry Call' is renamed by running 066's
--     update again, and a name the coach typed is left alone;
--   - no call type anywhere is still named 'Chemistry Call';
--   - the function is still closed to anyone signed out;
--   - booking_page gives coach_full_name (the coach's own, or null) beside
--     everything it gave before, and stays open to visitors.
--   It ends with the notice 066 CHECKS PASSED, or stops with FAILED.
-- =============================================================================
do $t$
declare
  v_fail text[] := '{}';
  v_coach uuid;
  v_other uuid;
  v_name text;
begin
  -- The function's own words.
  if position('''Discovery call''' in pg_get_functiondef('public.coach_call_types_start()'::regprocedure)) = 0 then
    v_fail := v_fail || 'coach_call_types_start makes the Discovery call';
  end if;
  if position('Chemistry Call' in pg_get_functiondef('public.coach_call_types_start()'::regprocedure)) > 0 then
    v_fail := v_fail || 'coach_call_types_start no longer names the Chemistry Call';
  end if;
  -- Signed out may not run it.
  if has_function_privilege('anon', 'public.coach_call_types_start()', 'execute') then
    v_fail := v_fail || 'closed to anyone signed out';
  end if;
  -- An old default and a coach's own name, then 066's update again.
  select id into v_coach from public.coaches order by created_at limit 1;
  if v_coach is not null then
    select id into v_other from public.coaches where id <> v_coach order by created_at limit 1;
    delete from public.coach_call_types where coach_id = v_coach and key = 'chemistry';
    insert into public.coach_call_types (coach_id, key, name, minutes, notice_hours, ahead_weeks, position)
      values (v_coach, 'chemistry', 'Chemistry Call', 30, 24, 4, 0);
    if v_other is not null then
      delete from public.coach_call_types where coach_id = v_other and key = 'chemistry';
      insert into public.coach_call_types (coach_id, key, name, minutes, notice_hours, ahead_weeks, position)
        values (v_other, 'chemistry', 'Our first chat', 30, 24, 4, 0);
    end if;
    update public.coach_call_types set name = 'Discovery call' where key = 'chemistry' and lower(btrim(name)) in ('chemistry call', 'chemistry calls');
    select name into v_name from public.coach_call_types where coach_id = v_coach and key = 'chemistry';
    if v_name is distinct from 'Discovery call' then v_fail := v_fail || 'the old default is renamed'; end if;
    if v_other is not null then
      select name into v_name from public.coach_call_types where coach_id = v_other and key = 'chemistry';
      if v_name is distinct from 'Our first chat' then v_fail := v_fail || 'a name the coach typed is left alone'; end if;
    end if;
  else
    raise notice '066: no coach on this database, so the rename was checked by the function''s words only';
  end if;
  if exists (select 1 from public.coach_call_types where lower(btrim(name)) in ('chemistry call', 'chemistry calls')) then
    v_fail := v_fail || 'no call type is still named Chemistry Call';
  end if;
  -- booking_page carries the coach's full name (or null), and still everything it carried before.
  if position('coach_full_name' in pg_get_functiondef('public.booking_page(uuid)'::regprocedure)) = 0
     or position('coach_first_name' in pg_get_functiondef('public.booking_page(uuid)'::regprocedure)) = 0 then
    v_fail := v_fail || 'booking_page gives the coach''s full name beside the first name';
  end if;
  if not has_function_privilege('anon', 'public.booking_page(uuid)', 'execute') then
    v_fail := v_fail || 'booking_page stays open to visitors';
  end if;
  declare v_key uuid; v_page jsonb; v_full text;
  begin
    select ct.page_key, c.full_name into v_key, v_full from public.coach_call_types ct join public.coaches c on c.id = ct.coach_id
      where ct.page_key is not null order by ct.created_at limit 1;
    if v_key is not null then
      v_page := public.booking_page(v_key);
      if (v_page ->> 'coach_full_name') is distinct from nullif(btrim(v_full), '') then v_fail := v_fail || 'booking_page''s full name is the coach''s own'; end if;
      if (v_page ->> 'name') is null or (v_page ->> 'minutes') is null then v_fail := v_fail || 'booking_page still gives the call''s name and length'; end if;
    end if;
  end;
  if exists (select 1 from public.migration_log where number = 66) is not true then
    v_fail := v_fail || '066 is recorded';
  end if;
  if array_length(v_fail, 1) > 0 then
    raise exception '066 FAILED: %', array_to_string(v_fail, '; ');
  end if;
  raise notice '066 CHECKS PASSED';
end
$t$;
