-- Checks helper 3's part of 059 (the keep-in-touch automation). Run after 059. As the database owner; undone at the end.
-- Ends with the notice 059 CATCH-UP CHECKS PASSED, or stops with FAILED and what failed.
do $t$
declare
  u uuid := gen_random_uuid(); c uuid; a uuid := gen_random_uuid(); bad text := ''; n int;
  p uuid := gen_random_uuid();
begin
  insert into auth.users (id, email) values (u, 'catchup-test-' || u || '@example.invalid');
  insert into public.coaches (user_id, role, display_first_name, full_name) values (u, 'owner', 'Tess', 'Tess Invented') returning id into c;
  -- 1. the new kind saves, as a to-do, switched off
  insert into public.coach_automations (id, coach_id, trigger, action, todo_title, todo_days, active)
    values (a, c, 'catch_up_due', 'todo', 'Catch up with [first name]', 0, false);
  -- 2. it can never move a stage
  begin
    insert into public.coach_automations (coach_id, trigger, action, to_stage_id) values (c, 'catch_up_due', 'stage', null);
    bad := bad || ' catch-up-as-stage-taken';
  exception when check_violation then null; end;
  -- 3. a kind that isn't there is still refused
  begin
    insert into public.coach_automations (coach_id, trigger, action, todo_title) values (c, 'birthday', 'todo', 'x');
    bad := bad || ' birthday-taken';
  exception when check_violation then null; end;
  -- 4. every 052 kind still saves
  insert into public.coach_automations (coach_id, trigger, action, todo_title) values (c, 'lead_won', 'todo', 'x'), (c, 'coaching_ended', 'todo', 'x');
  -- 5. a run is claimed only while it is on (054)
  begin
    insert into public.coach_automation_runs (automation_id, coach_id, event_key) values (a, c, 'catchup:network:' || p || ':2026-12-01');
    bad := bad || ' off-claimed';
  exception when others then if sqlstate <> 'CC409' then bad := bad || ' off-' || sqlstate; end if; end;
  update public.coach_automations set active = true where id = a;
  -- 6. once per person per due date; a new due date is a new run
  insert into public.coach_automation_runs (automation_id, coach_id, event_key) values (a, c, 'catchup:network:' || p || ':2026-12-01');
  begin
    insert into public.coach_automation_runs (automation_id, coach_id, event_key) values (a, c, 'catchup:network:' || p || ':2026-12-01');
    bad := bad || ' twice-for-one-due-date';
  exception when unique_violation then null; end;
  insert into public.coach_automation_runs (automation_id, coach_id, event_key) values (a, c, 'catchup:network:' || p || ':2027-03-01');
  select count(*) into n from public.coach_automation_runs where automation_id = a;
  if n <> 2 then bad := bad || ' runs-' || n; end if;
  -- 7. the constraints are named and there once
  select count(*) into n from pg_constraint where conrelid = 'public.coach_automations'::regclass and conname in ('coach_automations_trigger_ok', 'coach_automations_catch_up_todo');
  if n <> 2 then bad := bad || ' constraints-' || n; end if;
  select count(*) into n from pg_constraint where conrelid = 'public.coach_automations'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%coaching_ended%';
  if n <> 1 then bad := bad || ' trigger-checks-' || n; end if;
  delete from public.coaches where id = c;
  delete from auth.users where id = u;
  if bad <> '' then raise exception '059 CATCH-UP FAILED:%', bad; end if;
  raise notice '059 CATCH-UP CHECKS PASSED';
end
$t$;
