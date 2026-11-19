-- =============================================================================
-- coach_test_roles.sql   TEST PROJECT ONLY (clarity-portal-test). Never live.
--
-- WHAT THIS DOES (plain English)
--   So the coach portal can be walked as the owner and as an associate on the
--   test project (Phase 6a run 1):
--     1. the test account whose email starts "coach-owner" becomes the owner
--        there (it is a coach today, and an older test's "Tim037" row holds
--        the owner's role), and
--     2. the second test coach (email starts "coach-two" or "coach-2") gets a
--        coach's row, switched on, called Maya.
--   It changes only rows in public.coaches, and only for those two invented
--   test accounts. Safe to run twice.
--
-- HOW TO RUN
--   Tim, in the SQL editor of the TEST project, after 049. Read the two
--   notices it prints.
-- =============================================================================
do $roles$
declare
  v_owner uuid;
  v_two uuid;
begin
  if current_database() is null then return; end if;
  select id into v_owner from auth.users where email like 'coach-owner%' order by created_at limit 1;
  select id into v_two from auth.users where (email like 'coach-two%' or email like 'coach-2%') order by created_at limit 1;
  if v_owner is null then
    raise notice 'No test account starts with coach-owner: nothing was changed.';
    return;
  end if;
  -- One owner: the older tests' leftover owner rows become coaches.
  update public.coaches set role = 'coach' where role = 'owner' and user_id <> v_owner;
  update public.coaches set role = 'owner', active = true where user_id = v_owner;
  raise notice 'The coach-owner test account is the owner on this project.';
  if v_two is null then
    raise notice 'No second test coach account was found (coach-two…): only the owner was set.';
    return;
  end if;
  insert into public.coaches (user_id, role, display_first_name, active)
  values (v_two, 'coach', 'Maya', true)
  on conflict (user_id) do update set role = 'coach', active = true;
  raise notice 'The second test coach has a coach''s row (an associate, Maya).';
end
$roles$;
