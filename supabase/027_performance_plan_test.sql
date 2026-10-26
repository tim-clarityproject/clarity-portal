-- =============================================================================
-- 027_performance_plan_test.sql
-- Checks 027_performance_plan.sql. RUN ORDER: 026 and 027 first, then this.
--
-- WHAT IT DOES
--   Makes invented people (the owner coach and a second coach, a client of
--   each, an organisation member with a sponsor, and someone who sponsors
--   nobody), builds a plan, and checks who can see and change each part.
--   Everything it makes is undone at the end.
--
--   It ends with the notice ALL CHECKS PASSED, or stops with FAILED and a
--   list naming each check that failed.
-- =============================================================================

-- ---------------------------------------------------------------- helpers
-- Temporary (this session only). t_as acts as a signed-in person, as
-- Supabase does for the app; t_anon as someone signed out; t_admin goes
-- back to the admin role. t_n runs a query and returns its first value as
-- text, t_rows runs a change and returns how many rows it changed; both
-- return 'error <code>' instead of stopping (42501 means refused).
create or replace function pg_temp.t_as(p uuid) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $f$;
create or replace function pg_temp.t_anon() returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('role', 'anon', true);
end $f$;
create or replace function pg_temp.t_admin() returns void language plpgsql as $f$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
end $f$;
create or replace function pg_temp.t_user(p_label text) returns uuid language plpgsql as $f$
declare u uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, aud, role)
  values (u, 'p1-test-' || p_label || '-' || u || '@example.invalid', 'authenticated', 'authenticated');
  update public.profiles set first_name = initcap(p_label), last_name = 'Test' where id = u;
  return u;
end $f$;
create or replace function pg_temp.t_n(p_sql text) returns text language plpgsql as $f$
declare v text;
begin
  execute p_sql into v;
  return coalesce(v, 'null');
exception when others then
  return 'error ' || sqlstate;
end $f$;
create or replace function pg_temp.t_rows(p_sql text) returns text language plpgsql as $f$
declare n bigint;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n::text;
exception when others then
  return 'error ' || sqlstate;
end $f$;
create or replace function pg_temp.t_eq(p_name text, p_got text, p_want text) returns text[] language sql as $f$
  select case when p_got is distinct from p_want
              then array[format('%s: expected %s, got %s', p_name, p_want, coalesce(p_got, 'nothing'))]
              else '{}'::text[] end;
$f$;

-- ---------------------------------------------------------------- the checks
do $t$
declare
  f text[] := '{}';
  owner_u uuid; coach2_u uuid; client_a uuid; client_b uuid; member_u uuid; sponsor_u uuid; nobody_u uuid;
  owner_c uuid; coach2_c uuid; org1 uuid; org2 uuid; mem uuid;
  plan_a uuid; plan_b uuid; plan_m uuid; obj_a uuid; obj_b uuid; strat_a uuid; strat_b uuid; obj_org uuid; prop uuid;
begin
  begin
    owner_u := pg_temp.t_user('owner'); coach2_u := pg_temp.t_user('coachtwo');
    client_a := pg_temp.t_user('clienta'); client_b := pg_temp.t_user('clientb');
    member_u := pg_temp.t_user('member'); sponsor_u := pg_temp.t_user('sponsor'); nobody_u := pg_temp.t_user('nobody');
    insert into public.coaches (user_id, role, display_first_name) values (owner_u, 'owner', 'Owner') returning id into owner_c;
    insert into public.coaches (user_id, role, display_first_name) values (coach2_u, 'coach', 'Coachtwo') returning id into coach2_c;
    insert into public.coach_clients (client_id, coach_id) values (client_a, owner_c), (client_b, coach2_c);
    insert into public.organisations (name) values ('Invented Org') returning id into org1;
    insert into public.organisations (name) values ('Elsewhere Org') returning id into org2;
    insert into public.organisation_members (organisation_id, user_id) values (org1, member_u) returning id into mem;
    insert into public.seat_sponsors (member_id, sponsor_user_id) values (mem, sponsor_u);
    perform pg_temp.t_as(member_u);
    perform public.membership_confirm(mem);

    -- ------------------------------------------------ 1. a plan
    perform pg_temp.t_as(client_a);
    insert into public.performance_plans (user_id, mission) values (client_a, 'Build a team that wins without me in the room') returning id into plan_a;
    f := f || pg_temp.t_eq('1a a mission over 120 characters refused', pg_temp.t_rows(format('update public.performance_plans set mission = repeat(''x'', 121) where id = %L', plan_a)), 'error 23514');
    f := f || pg_temp.t_eq('1b one active plan each', pg_temp.t_rows(format('insert into public.performance_plans (user_id) values (%L)', client_a)), 'error 23505');
    insert into public.outcome_objectives (plan_id, user_id, name, kind, direction, start_value, target_value, by_when)
      values (plan_a, client_a, 'Revenue from referrals', 'number', 'up', 20, 38, date '2027-06-30') returning id into obj_a;
    f := f || pg_temp.t_eq('1c a rating of 11 refused', pg_temp.t_rows(format('insert into public.outcome_objectives (plan_id, user_id, name, kind, start_value, target_value, by_when) values (%L, %L, ''Calm'', ''rating'', 5, 11, date ''2027-01-01'')', plan_a, client_a)), 'error 23514');
    f := f || pg_temp.t_eq('1d a milestone with a target refused', pg_temp.t_rows(format('insert into public.outcome_objectives (plan_id, user_id, name, kind, due_on, target_value) values (%L, %L, ''Launch'', ''milestone'', date ''2027-01-01'', 5)', plan_a, client_a)), 'error 23514');
    f := f || pg_temp.t_eq('1e a milestone', pg_temp.t_rows(format('insert into public.outcome_objectives (plan_id, user_id, name, kind, due_on) values (%L, %L, ''Launch'', ''milestone'', date ''2027-01-01'')', plan_a, client_a)), '1');
    f := f || pg_temp.t_eq('1f an 81-character name refused', pg_temp.t_rows(format('insert into public.outcome_objectives (plan_id, user_id, name, kind, due_on) values (%L, %L, repeat(''n'', 81), ''milestone'', date ''2027-01-01'')', plan_a, client_a)), 'error 23514');
    f := f || pg_temp.t_eq('1g an objective can''t claim to be an organisation''s without one', pg_temp.t_rows(format('insert into public.outcome_objectives (plan_id, user_id, name, kind, due_on, source) values (%L, %L, ''Org'', ''milestone'', date ''2027-01-01'', ''organisation'')', plan_a, client_a)), 'error 42501');
    insert into public.plan_strategies (plan_id, user_id, name) values (plan_a, client_a, 'Grow through referrals') returning id into strat_a;
    insert into public.strategy_objectives (strategy_id, objective_id, user_id) values (strat_a, obj_a, client_a);
    f := f || pg_temp.t_eq('1h a habit', pg_temp.t_rows(format('insert into public.habits (plan_id, strategy_id, user_id, name, measure, target, target_per, impact) values (%L, %L, %L, ''Referral conversations'', ''count'', 3, ''week'', 3)', plan_a, strat_a, client_a)), '1');
    f := f || pg_temp.t_eq('1i a rating habit, higher is better, can''t have a target of 1', pg_temp.t_rows(format('insert into public.habits (plan_id, strategy_id, user_id, name, measure, target, direction) values (%L, %L, %L, ''Focus'', ''rating'', 1, ''higher'')', plan_a, strat_a, client_a)), 'error 23514');
    f := f || pg_temp.t_eq('1j a limit habit', pg_temp.t_rows(format('insert into public.habits (plan_id, strategy_id, user_id, name, measure, limit_value) values (%L, %L, %L, ''Late finishes'', ''yes_no_days_limit'', 2)', plan_a, strat_a, client_a)), '1');
    f := f || pg_temp.t_eq('1k a figure', pg_temp.t_rows(format('insert into public.objective_figures (objective_id, user_id, value, recorded_on) values (%L, %L, 31, current_date)', obj_a, client_a)), '1');
    f := f || pg_temp.t_eq('1l a version snapshot', pg_temp.t_rows(format('insert into public.plan_versions (plan_id, user_id, major, minor, kind, snapshot) values (%L, %L, 1, 0, ''start'', ''{}'')', plan_a, client_a)), '1');
    f := f || pg_temp.t_eq('1m plan history can''t be changed', pg_temp.t_rows(format('update public.plan_versions set change_note = ''x'' where plan_id = %L', plan_a)), 'error 42501');
    f := f || pg_temp.t_eq('1n plan history can''t be removed', pg_temp.t_rows(format('delete from public.plan_versions where plan_id = %L', plan_a)), 'error 42501');

    -- ------------------------------------------------ 2. nobody points at someone else's rows
    perform pg_temp.t_as(client_b);
    insert into public.performance_plans (user_id) values (client_b) returning id into plan_b;
    insert into public.plan_strategies (plan_id, user_id, name) values (plan_b, client_b, 'B strategy') returning id into strat_b;
    insert into public.outcome_objectives (plan_id, user_id, name, kind, due_on) values (plan_b, client_b, 'B milestone', 'milestone', date '2027-01-01') returning id into obj_b;
    f := f || pg_temp.t_eq('2a a strategy in someone else''s plan refused', pg_temp.t_rows(format('insert into public.plan_strategies (plan_id, user_id, name) values (%L, %L, ''Sneaky'')', plan_a, client_b)), 'error 42501');
    f := f || pg_temp.t_eq('2b linking to someone else''s objective refused', pg_temp.t_rows(format('insert into public.strategy_objectives (strategy_id, objective_id, user_id) values (%L, %L, %L)', strat_b, obj_a, client_b)), 'error 42501');
    f := f || pg_temp.t_eq('2c a figure on someone else''s objective refused', pg_temp.t_rows(format('insert into public.objective_figures (objective_id, user_id, value, recorded_on) values (%L, %L, 1, current_date)', obj_a, client_b)), 'error 42501');
    f := f || pg_temp.t_eq('2d a habit in someone else''s Strategy refused', pg_temp.t_rows(format('insert into public.habits (plan_id, strategy_id, user_id, name, measure) values (%L, %L, %L, ''Sneaky'', ''yes_no_weekly'')', plan_b, strat_a, client_b)), 'error 42501');
    f := f || pg_temp.t_eq('2e moving one''s own strategy into someone else''s plan refused', pg_temp.t_rows(format('update public.plan_strategies set plan_id = %L where id = %L', plan_a, strat_b)), 'error 42501');
    f := f || pg_temp.t_eq('2f another client sees nothing of the first', pg_temp.t_n(format('select (select count(*) from public.performance_plans where user_id = %1$L) + (select count(*) from public.outcome_objectives where user_id = %1$L) + (select count(*) from public.habits where user_id = %1$L)', client_a)), '0');

    -- ------------------------------------------------ 3. what the coach sees
    perform pg_temp.t_as(owner_u);
    f := f || pg_temp.t_eq('3a the coach sees the mission (on by default)', pg_temp.t_n(format('select count(*) from public.performance_plans where user_id = %L', client_a)), '1');
    f := f || pg_temp.t_eq('3b ... not the objectives (progress off)', pg_temp.t_n(format('select count(*) from public.outcome_objectives where user_id = %L', client_a)), '0');
    f := f || pg_temp.t_eq('3c ... never the habits', pg_temp.t_n(format('select count(*) from public.habits where user_id = %L', client_a)), '0');
    f := f || pg_temp.t_eq('3d ... nor the plan history', pg_temp.t_n(format('select count(*) from public.plan_versions where user_id = %L', client_a)), '0');
    f := f || pg_temp.t_eq('3e the coach can''t change a client''s mission', pg_temp.t_rows(format('update public.performance_plans set mission = ''x'' where id = %L', plan_a)), '0');
    f := f || pg_temp.t_eq('3f the owner sees nothing of another coach''s client', pg_temp.t_n(format('select count(*) from public.performance_plans where user_id = %L', client_b)), '0');
    perform pg_temp.t_as(client_a);
    insert into public.sharing_switches (user_id, part, is_on) values (client_a, 'progress', true);
    perform pg_temp.t_as(owner_u);
    f := f || pg_temp.t_eq('3g progress shared: objectives, figures, Strategies and links', pg_temp.t_n(format('select (select count(*) from public.outcome_objectives where user_id = %1$L) || '','' || (select count(*) from public.objective_figures where user_id = %1$L) || '','' || (select count(*) from public.plan_strategies where user_id = %1$L) || '','' || (select count(*) from public.strategy_objectives where user_id = %1$L)', client_a)), '2,1,1,1');
    f := f || pg_temp.t_eq('3h ... still never the habits', pg_temp.t_n(format('select count(*) from public.habits where user_id = %L', client_a)), '0');
    perform pg_temp.t_as(coach2_u);
    f := f || pg_temp.t_eq('3i another coach sees nothing', pg_temp.t_n(format('select count(*) from public.outcome_objectives where user_id = %L', client_a)), '0');
    perform pg_temp.t_as(client_a);
    update public.sharing_switches set is_on = false where user_id = client_a and part = 'progress';
    insert into public.sharing_switches (user_id, part, is_on) values (client_a, 'mission', false);
    perform pg_temp.t_as(owner_u);
    f := f || pg_temp.t_eq('3j switched off: past objectives hidden too', pg_temp.t_n(format('select count(*) from public.outcome_objectives where user_id = %L', client_a)), '0');
    f := f || pg_temp.t_eq('3k mission switched off: hidden', pg_temp.t_n(format('select count(*) from public.performance_plans where user_id = %L', client_a)), '0');

    -- ------------------------------------------------ 4. organisation objectives and the sponsor
    perform pg_temp.t_as(member_u);
    insert into public.performance_plans (user_id) values (member_u) returning id into plan_m;
    f := f || pg_temp.t_eq('4a an objective for an organisation you''re not in refused', pg_temp.t_rows(format('insert into public.outcome_objectives (plan_id, user_id, name, kind, due_on, source, organisation_id) values (%L, %L, ''Theirs'', ''milestone'', date ''2027-01-01'', ''organisation'', %L)', plan_m, member_u, org2)), 'error 42501');
    insert into public.outcome_objectives (plan_id, user_id, name, kind, direction, start_value, target_value, by_when, source, organisation_id)
      values (plan_m, member_u, 'Customer retention', 'number', 'up', 80, 90, date '2027-06-30', 'organisation', org1) returning id into obj_org;
    f := f || pg_temp.t_eq('4b the person can''t confirm it themselves', pg_temp.t_rows(format('update public.outcome_objectives set confirmed_at = now(), confirmed_by = %L where id = %L', member_u, obj_org)), '1');
    f := f || pg_temp.t_eq('4c ... it stays unconfirmed', pg_temp.t_n(format('select confirmed_at is null from public.outcome_objectives where id = %L', obj_org)), 'true');
    f := f || pg_temp.t_eq('4d one development objective', pg_temp.t_rows(format('insert into public.outcome_objectives (plan_id, user_id, name, kind, due_on, source, organisation_id) values (%L, %L, ''Grow into the role'', ''milestone'', date ''2027-01-01'', ''development'', %L)', plan_m, member_u, org1)), '1');
    f := f || pg_temp.t_eq('4e ... only one', pg_temp.t_rows(format('insert into public.outcome_objectives (plan_id, user_id, name, kind, due_on, source, organisation_id) values (%L, %L, ''Another'', ''milestone'', date ''2027-01-01'', ''development'', %L)', plan_m, member_u, org1)), 'error 23505');
    perform pg_temp.t_as(sponsor_u);
    f := f || pg_temp.t_eq('4f a sponsor never reads the objectives table', pg_temp.t_n(format('select count(*) from public.outcome_objectives where user_id = %L', member_u)), '0');
    f := f || pg_temp.t_eq('4g ... nor the plan', pg_temp.t_n(format('select count(*) from public.performance_plans where user_id = %L', member_u)), '0');
    f := f || pg_temp.t_eq('4h the sponsor confirms it', pg_temp.t_n(format('select public.sponsor_confirm_objective(%L)', obj_org)), 'true');
    f := f || pg_temp.t_eq('4i the sponsor can''t confirm an own objective', pg_temp.t_n(format('select public.sponsor_confirm_objective(%L)', obj_a)), 'error 42501');
    perform pg_temp.t_as(nobody_u);
    f := f || pg_temp.t_eq('4j someone who isn''t the sponsor can''t confirm', pg_temp.t_n(format('select public.sponsor_confirm_objective(%L)', obj_org)), 'error 42501');
    f := f || pg_temp.t_eq('4k ... nor propose', pg_temp.t_n(format('select public.sponsor_propose_objective_change(%L, ''{"target_value": 95}'')', obj_org)), 'error 42501');
    perform pg_temp.t_as(member_u);
    f := f || pg_temp.t_eq('4l confirmed', pg_temp.t_n(format('select confirmed_by = %L from public.outcome_objectives where id = %L', sponsor_u, obj_org)), 'true');
    update public.outcome_objectives set target_value = 85 where id = obj_org;
    f := f || pg_temp.t_eq('4m changing the target takes the confirmation away', pg_temp.t_n(format('select confirmed_at is null from public.outcome_objectives where id = %L', obj_org)), 'true');
    perform pg_temp.t_as(sponsor_u);
    f := f || pg_temp.t_eq('4n a sponsor can''t propose a change to the start figure', pg_temp.t_n(format('select public.sponsor_propose_objective_change(%L, ''{"start_value": 1}'')', obj_org)), 'error 22023');
    prop := pg_temp.t_n(format('select public.sponsor_propose_objective_change(%L, ''{"target_value": 92}'', ''Stretch it'')', obj_org))::uuid;
    f := f || pg_temp.t_eq('4o the sponsor sees their proposal', pg_temp.t_n(format('select status from public.objective_proposals where id = %L', prop)), 'waiting');
    f := f || pg_temp.t_eq('4p the sponsor can''t accept it for the person', pg_temp.t_n(format('select public.objective_proposal_decide(%L, true)', prop)), 'error 42501');
    f := f || pg_temp.t_eq('4q a sponsor can''t write a proposal directly', pg_temp.t_rows(format('insert into public.objective_proposals (objective_id, user_id, proposed_by, changes) values (%L, %L, %L, ''{}'')', obj_org, member_u, sponsor_u)), 'error 42501');
    perform pg_temp.t_as(member_u);
    f := f || pg_temp.t_eq('4r nothing changes until the person accepts', pg_temp.t_n(format('select target_value from public.outcome_objectives where id = %L', obj_org)), '85');
    f := f || pg_temp.t_eq('4s the person accepts', pg_temp.t_n(format('select public.objective_proposal_decide(%L, true)', prop)), 'accepted');
    f := f || pg_temp.t_eq('4t ... it applies, confirmed by the sponsor', pg_temp.t_n(format('select target_value || '' '' || (confirmed_by = %L) from public.outcome_objectives where id = %L', sponsor_u, obj_org)), '92 true');
    f := f || pg_temp.t_eq('4u a decided proposal can''t be decided again', pg_temp.t_n(format('select public.objective_proposal_decide(%L, false)', prop)), 'error 42501');
    perform pg_temp.t_as(client_a);
    f := f || pg_temp.t_eq('4v other people see no proposal', pg_temp.t_n('select count(*) from public.objective_proposals'), '0');

    -- ------------------------------------------------ 5. signed out
    perform pg_temp.t_anon();
    f := f || pg_temp.t_eq('5a signed out reads nothing', pg_temp.t_n('select count(*) from public.performance_plans'), 'error 42501');
    f := f || pg_temp.t_eq('5b signed out can''t propose', pg_temp.t_n(format('select public.sponsor_propose_objective_change(%L, ''{"target_value": 1}'')', obj_org)), 'error 42501');

    raise exception using errcode = 'TT001', message = 'undo the test';
  exception when sqlstate 'TT001' then null;
  end;
  perform pg_temp.t_admin();
  if cardinality(f) > 0 then
    raise exception 'FAILED (% of the checks): %', cardinality(f), array_to_string(f, ' | ');
  end if;
  raise notice 'ALL CHECKS PASSED';
end
$t$;
