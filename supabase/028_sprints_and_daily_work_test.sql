-- =============================================================================
-- 028_sprints_and_daily_work_test.sql
-- Checks 028_sprints_and_daily_work.sql. RUN ORDER: 026 to 028 first, then this.
--
-- WHAT IT DOES
--   Makes invented people (the owner coach and a second coach, and two
--   clients), runs a sprint with logs, to-dos, wins, evidence, a day plan, a
--   day review, debriefs and a Recovery, and checks who can see and change
--   each. Everything it makes is undone at the end.
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
  owner_u uuid; coach2_u uuid; client_a uuid; client_b uuid; owner_c uuid; coach2_c uuid;
  plan_a uuid; strat_a uuid; habit_a uuid; sprint_a uuid; sh_a uuid; todo1 uuid; todo2 uuid; todo3 uuid; todo4 uuid;
  win_a uuid; dp uuid; rec uuid; deb1 uuid; plan_b uuid; strat_b uuid; dec_b uuid;
begin
  begin
    owner_u := pg_temp.t_user('owner'); coach2_u := pg_temp.t_user('coachtwo');
    client_a := pg_temp.t_user('clienta'); client_b := pg_temp.t_user('clientb');
    insert into public.coaches (user_id, role, display_first_name) values (owner_u, 'owner', 'Owner') returning id into owner_c;
    insert into public.coaches (user_id, role, display_first_name) values (coach2_u, 'coach', 'Coachtwo') returning id into coach2_c;
    insert into public.coach_clients (client_id, coach_id) values (client_a, owner_c), (client_b, coach2_c);
    insert into public.person_settings (user_id, time_zone) values (client_a, 'Pacific/Auckland');
    perform pg_temp.t_as(client_b);
    insert into public.performance_plans (user_id) values (client_b) returning id into plan_b;
    insert into public.plan_strategies (plan_id, user_id, name) values (plan_b, client_b, 'B') returning id into strat_b;
    insert into public.decisions (user_id, tool_type, title) values (client_b, 'grow', 'B decision') returning id into dec_b;

    -- ------------------------------------------------ 1. a sprint
    perform pg_temp.t_as(client_a);
    insert into public.performance_plans (user_id) values (client_a) returning id into plan_a;
    insert into public.plan_strategies (plan_id, user_id, name) values (plan_a, client_a, 'Grow') returning id into strat_a;
    insert into public.habits (plan_id, strategy_id, user_id, name, measure, target, target_per) values (plan_a, strat_a, client_a, 'Calls', 'count', 3, 'week') returning id into habit_a;
    insert into public.sprints (user_id, plan_id, number, start_on) values (client_a, plan_a, 1, date '2026-10-22') returning id into sprint_a;
    f := f || pg_temp.t_eq('1a the planned end: 12 weeks from a Thursday', pg_temp.t_n(format('select planned_end_on from public.sprints where id = %L', sprint_a)), '2027-01-13');
    f := f || pg_temp.t_eq('1b a standard of 49 refused', pg_temp.t_rows(format('insert into public.sprints (user_id, plan_id, number, start_on, standard) values (%L, %L, 2, current_date, 49)', client_a, plan_a)), 'error 23514');
    f := f || pg_temp.t_eq('1c 17 weeks refused', pg_temp.t_rows(format('insert into public.sprints (user_id, plan_id, number, start_on, length_weeks, status) values (%L, %L, 2, current_date, 17, ''finished'')', client_a, plan_a)), 'error 23514');
    f := f || pg_temp.t_eq('1d one running sprint at a time', pg_temp.t_rows(format('insert into public.sprints (user_id, plan_id, number, start_on) values (%L, %L, 2, current_date)', client_a, plan_a)), 'error 23505');
    f := f || pg_temp.t_eq('1e a sprint on someone else''s plan refused', pg_temp.t_rows(format('insert into public.sprints (user_id, plan_id, number, start_on, status) values (%L, %L, 3, current_date, ''finished'')', client_a, plan_b)), 'error 42501');
    insert into public.sprint_habits (sprint_id, user_id, habit_id, strategy_id, name) values (sprint_a, client_a, habit_a, strat_a, 'Calls') returning id into sh_a;
    insert into public.sprint_habit_settings (sprint_habit_id, user_id, from_week, measure, target, target_per) values (sh_a, client_a, 1, 'count', 3, 'week');
    f := f || pg_temp.t_eq('1f a change from week 4 keeps weeks 1 to 3', pg_temp.t_rows(format('insert into public.sprint_habit_settings (sprint_habit_id, user_id, from_week, measure, target, target_per, impact) values (%L, %L, 4, ''count'', 4, ''week'', 3)', sh_a, client_a)), '1');
    f := f || pg_temp.t_eq('1g one setting per week', pg_temp.t_rows(format('insert into public.sprint_habit_settings (sprint_habit_id, user_id, from_week, measure) values (%L, %L, 4, ''yes_no_weekly'')', sh_a, client_a)), 'error 23505');
    f := f || pg_temp.t_eq('1h a sprint habit in someone else''s Strategy refused', pg_temp.t_rows(format('insert into public.sprint_habits (sprint_id, user_id, strategy_id, name) values (%L, %L, %L, ''x'')', sprint_a, client_a, strat_b)), 'error 42501');

    -- ------------------------------------------------ 2. logs
    f := f || pg_temp.t_eq('2a a log', pg_temp.t_rows(format('insert into public.habit_logs (user_id, sprint_habit_id, local_date, value) values (%L, %L, date ''2026-10-22'', 1)', client_a, sh_a)), '1');
    f := f || pg_temp.t_eq('2b one value per habit per day', pg_temp.t_rows(format('insert into public.habit_logs (user_id, sprint_habit_id, local_date, value) values (%L, %L, date ''2026-10-22'', 2)', client_a, sh_a)), 'error 23505');
    f := f || pg_temp.t_eq('2c a negative value refused', pg_temp.t_rows(format('insert into public.habit_logs (user_id, sprint_habit_id, local_date, value) values (%L, %L, date ''2026-10-23'', -1)', client_a, sh_a)), 'error 23514');
    f := f || pg_temp.t_eq('2d an odd entry kept to confirm', pg_temp.t_rows(format('insert into public.habit_logs (user_id, sprint_habit_id, local_date, value, to_confirm) values (%L, %L, date ''2026-10-24'', 19, true)', client_a, sh_a)), '1');

    -- ------------------------------------------------ 3. to-dos and their moves
    insert into public.todos (user_id, strategy_id, text, sprint_id, planned_week, created_on) values (client_a, strat_a, 'Email three past clients', sprint_a, 1, date '2026-10-21') returning id into todo1;
    insert into public.todos (user_id, strategy_id, text, sprint_id, planned_week) values (client_a, strat_a, 'Record a session review', sprint_a, 1) returning id into todo2;
    insert into public.todos (user_id, strategy_id, text) values (client_a, strat_a, 'Third') returning id into todo3;
    insert into public.todos (user_id, strategy_id, text) values (client_a, strat_a, 'Fourth') returning id into todo4;
    f := f || pg_temp.t_eq('3a a week without a sprint refused', pg_temp.t_rows(format('insert into public.todos (user_id, strategy_id, text, planned_week) values (%L, %L, ''x'', 1)', client_a, strat_a)), 'error 23514');
    update public.todos set planned_week = 3, move_on = date '2026-10-23' where id = todo1;
    f := f || pg_temp.t_eq('3b a move is recorded with the day given', pg_temp.t_n(format('select moved_on || '' '' || from_week || '' '' || to_week from public.todo_moves where todo_id = %L', todo1)), '2026-10-23 1 3');
    update public.todos set planned_week = 2 where id = todo2;
    f := f || pg_temp.t_eq('3c a move without a day uses the person''s own time zone', pg_temp.t_n(format('select moved_on = (now() at time zone ''Pacific/Auckland'')::date from public.todo_moves where todo_id = %L', todo2)), 'true');
    update public.todos set text = 'Email three past clients today' where id = todo1;
    f := f || pg_temp.t_eq('3d changing the words isn''t a move', pg_temp.t_n(format('select count(*) from public.todo_moves where todo_id = %L', todo1)), '1');
    f := f || pg_temp.t_eq('3e moves can''t be written by hand', pg_temp.t_rows(format('insert into public.todo_moves (todo_id, user_id, moved_on) values (%L, %L, current_date)', todo1, client_a)), 'error 42501');
    f := f || pg_temp.t_eq('3f a to-do in someone else''s Strategy refused', pg_temp.t_rows(format('insert into public.todos (user_id, strategy_id, text) values (%L, %L, ''x'')', client_a, strat_b)), 'error 42501');

    -- ------------------------------------------------ 4. wins and evidence
    insert into public.wins (user_id, what, local_date, impact) values (client_a, 'A referral came in unasked', date '2026-10-24', 1) returning id into win_a;
    insert into public.win_strategies (win_id, strategy_id, user_id) values (win_a, strat_a, client_a);
    f := f || pg_temp.t_eq('4a every win is saved to Performance Evidence', pg_temp.t_n(format('select kind || '' '' || text from public.performance_evidence where win_id = %L', win_a)), 'win A referral came in unasked');
    f := f || pg_temp.t_eq('4b a win in someone else''s Strategy refused', pg_temp.t_rows(format('insert into public.win_strategies (win_id, strategy_id, user_id) values (%L, %L, %L)', win_a, strat_b, client_a)), 'error 42501');
    f := f || pg_temp.t_eq('4c a moment of evidence', pg_temp.t_rows(format('insert into public.performance_evidence (user_id, text, local_date) values (%L, ''Ran the board meeting calmly'', current_date)', client_a)), '1');

    -- ------------------------------------------------ 5. Plan my day and Review my day
    insert into public.day_plans (user_id, local_date, sleep_hours) values (client_a, date '2026-10-26', 20) returning id into dp;
    f := f || pg_temp.t_eq('5a 20 hours of sleep is kept, to confirm', pg_temp.t_n(format('select sleep_to_confirm from public.day_plans where id = %L', dp)), 'true');
    update public.day_plans set sleep_to_confirm = false where id = dp;
    f := f || pg_temp.t_eq('5b the person confirms it', pg_temp.t_n(format('select sleep_to_confirm from public.day_plans where id = %L', dp)), 'false');
    update public.day_plans set sleep_hours = 6.5 where id = dp;
    f := f || pg_temp.t_eq('5c a sensible figure needs nothing', pg_temp.t_n(format('select sleep_to_confirm from public.day_plans where id = %L', dp)), 'false');
    f := f || pg_temp.t_eq('5d sleep in half hours only', pg_temp.t_rows(format('update public.day_plans set sleep_hours = 6.25 where id = %L', dp)), 'error 23514');
    insert into public.day_plan_todos (day_plan_id, todo_id, user_id, is_top) values (dp, todo1, client_a, true), (dp, todo2, client_a, false), (dp, todo3, client_a, false);
    f := f || pg_temp.t_eq('5e a fourth to-do refused', pg_temp.t_rows(format('insert into public.day_plan_todos (day_plan_id, todo_id, user_id) values (%L, %L, %L)', dp, todo4, client_a)), 'error 23514');
    f := f || pg_temp.t_eq('5f only one top priority', pg_temp.t_rows(format('update public.day_plan_todos set is_top = true where todo_id = %L', todo2)), 'error 23505');
    insert into public.day_plan_strategies (day_plan_id, strategy_id, user_id) values (dp, strat_a, client_a);
    f := f || pg_temp.t_eq('5g a Strategy of the day must be your own', pg_temp.t_rows(format('insert into public.day_plan_strategies (day_plan_id, strategy_id, user_id) values (%L, %L, %L)', dp, strat_b, client_a)), 'error 42501');
    f := f || pg_temp.t_eq('5h one plan per day', pg_temp.t_rows(format('insert into public.day_plans (user_id, local_date) values (%L, date ''2026-10-26'')', client_a)), 'error 23505');
    f := f || pg_temp.t_eq('5i up to 3 things for tomorrow', pg_temp.t_rows(format('insert into public.day_reviews (user_id, local_date, tomorrow) values (%L, current_date, array[''a'', ''b'', ''c'', ''d''])', client_a)), 'error 23514');
    f := f || pg_temp.t_eq('5j a day review', pg_temp.t_rows(format('insert into public.day_reviews (user_id, local_date, way_of_being_rating, tomorrow) values (%L, current_date, 7, array[''a''])', client_a)), '1');

    -- ------------------------------------------------ 6. debriefs, week scores, Recovery
    insert into public.weekly_debriefs (user_id, sprint_id, sprint_week, stress) values (client_a, sprint_a, 1, 'a_little') returning id into deb1;
    insert into public.weekly_debriefs (user_id, sprint_id, sprint_week, stress, shared_with_coach) values (client_a, sprint_a, 2, 'moderately', true);
    f := f || pg_temp.t_eq('6a one debrief per week', pg_temp.t_rows(format('insert into public.weekly_debriefs (user_id, sprint_id, sprint_week) values (%L, %L, 1)', client_a, sprint_a)), 'error 23505');
    f := f || pg_temp.t_eq('6b a person can''t write their own week score', pg_temp.t_rows(format('insert into public.week_scores (user_id, sprint_id, sprint_week, week_start, week_end, score, methods_version) values (%L, %L, 1, current_date, current_date, 100, ''1.1'')', client_a, sprint_a)), 'error 42501');
    insert into public.recovery_periods (user_id, sprint_id, start_on) values (client_a, sprint_a, current_date) returning id into rec;
    f := f || pg_temp.t_eq('6c one Recovery at a time', pg_temp.t_rows(format('insert into public.recovery_periods (user_id, start_on) values (%L, current_date)', client_a)), 'error 23505');
    f := f || pg_temp.t_eq('6d 31 days refused', pg_temp.t_rows(format('update public.recovery_periods set chosen_days = 31 where id = %L', rec)), 'error 23514');
    insert into public.recovery_recharge_answers (recovery_id, user_id, local_date, answer) values (rec, client_a, current_date, 'A long walk');
    insert into public.recovery_recharge_answers (recovery_id, user_id, local_date, answer, shared) values (rec, client_a, current_date + 1, 'Time with family', true);
    f := f || pg_temp.t_eq('6e an above or below the line check on someone else''s decision refused', pg_temp.t_rows(format('insert into public.emotional_control_checks (user_id, local_date, tool, line, decision_id) values (%L, current_date, ''after_action_review'', ''above'', %L)', client_a, dec_b)), 'error 42501');
    f := f || pg_temp.t_eq('6f an above or below the line check', pg_temp.t_rows(format('insert into public.emotional_control_checks (user_id, local_date, tool, line) values (%L, current_date, ''above_below_line'', ''below'')', client_a)), '1');
    perform pg_temp.t_admin();
    insert into public.week_scores (user_id, sprint_id, sprint_week, week_start, week_end, score, methods_version) values (client_a, sprint_a, 1, date '2026-10-22', date '2026-10-28', 68, '1.1');

    -- ------------------------------------------------ 7. what the coach sees
    perform pg_temp.t_as(owner_u);
    f := f || pg_temp.t_eq('7a never logs, to-dos, wins, day plans or day reviews', pg_temp.t_n(format($q$select (select count(*) from public.habit_logs where user_id = %1$L) + (select count(*) from public.todos where user_id = %1$L)
      + (select count(*) from public.wins where user_id = %1$L) + (select count(*) from public.day_plans where user_id = %1$L) + (select count(*) from public.day_reviews where user_id = %1$L)
      + (select count(*) from public.sprint_habits where user_id = %1$L) + (select count(*) from public.todo_moves where user_id = %1$L) + (select count(*) from public.emotional_control_checks where user_id = %1$L)$q$, client_a)), '0');
    -- After 038 (Tim, 30 Oct) the coach reads a shared week only through
    -- coach_shared_debrief, which leaves stress out; the table is own rows.
    if to_regprocedure('public.coach_shared_debrief(uuid,uuid,integer)') is null then
      f := f || pg_temp.t_eq('7b only the debrief week that was shared', pg_temp.t_n(format('select string_agg(sprint_week::text, '','') from public.weekly_debriefs where user_id = %L', client_a)), '2');
    else
      f := f || pg_temp.t_eq('7b only the debrief week that was shared (038)', pg_temp.t_n(format('select string_agg(w::text, '','') from generate_series(1, 2) w where exists (select 1 from public.coach_shared_debrief(%L, %L, w))', client_a, sprint_a)), '2');
      f := f || pg_temp.t_eq('7b2 ... and none of the table (038)', pg_temp.t_n(format('select count(*) from public.weekly_debriefs where user_id = %L', client_a)), '0');
    end if;
    f := f || pg_temp.t_eq('7c not the sprint or its scores (progress off)', pg_temp.t_n(format('select (select count(*) from public.sprints where user_id = %1$L) + (select count(*) from public.week_scores where user_id = %1$L)', client_a)), '0');
    f := f || pg_temp.t_eq('7d that Recovery started (Let your coach know is ticked by default)', pg_temp.t_n(format('select count(*) from public.recovery_periods where user_id = %L', client_a)), '1');
    f := f || pg_temp.t_eq('7e only the recharge answer that was shared', pg_temp.t_n(format('select string_agg(answer, '','') from public.recovery_recharge_answers where user_id = %L', client_a)), 'Time with family');
    f := f || pg_temp.t_eq('7f no evidence until shared', pg_temp.t_n(format('select count(*) from public.performance_evidence where user_id = %L', client_a)), '0');
    perform pg_temp.t_as(client_a);
    update public.performance_evidence set shared_with_coach = true where kind = 'moment';
    update public.recovery_periods set let_coach_know = false where id = rec;
    insert into public.sharing_switches (user_id, part, is_on) values (client_a, 'progress', true);
    perform pg_temp.t_as(owner_u);
    f := f || pg_temp.t_eq('7g evidence shared one item at a time', pg_temp.t_n(format('select count(*) from public.performance_evidence where user_id = %L', client_a)), '1');
    f := f || pg_temp.t_eq('7h Recovery hidden when Let your coach know is unticked', pg_temp.t_n(format('select count(*) from public.recovery_periods where user_id = %L', client_a)), '0');
    f := f || pg_temp.t_eq('7i progress shared: the sprint and its week scores', pg_temp.t_n(format('select (select count(*) from public.sprints where user_id = %1$L) || '','' || (select count(*) from public.week_scores where user_id = %1$L)', client_a)), '1,1');
    f := f || pg_temp.t_eq('7j ... still never the logs', pg_temp.t_n(format('select count(*) from public.habit_logs where user_id = %L', client_a)), '0');
    f := f || pg_temp.t_eq('7k the coach can''t change a shared debrief', pg_temp.t_rows(format('update public.weekly_debriefs set went_well = ''x'' where user_id = %L', client_a)), '0');
    perform pg_temp.t_as(client_a);
    update public.performance_evidence set deleted_at = now() where kind = 'moment';
    perform pg_temp.t_as(owner_u);
    f := f || pg_temp.t_eq('7l deleted evidence is hidden from the coach', pg_temp.t_n(format('select count(*) from public.performance_evidence where user_id = %L', client_a)), '0');
    perform pg_temp.t_as(coach2_u);
    f := f || pg_temp.t_eq('7m another coach sees nothing', pg_temp.t_n(format($q$select (select count(*) from public.sprints where user_id = %1$L) + (select count(*) from public.weekly_debriefs where user_id = %1$L) + (select count(*) from public.recovery_recharge_answers where user_id = %1$L)$q$, client_a)), '0');
    perform pg_temp.t_as(client_b);
    f := f || pg_temp.t_eq('7n another client sees nothing', pg_temp.t_n(format($q$select (select count(*) from public.sprints where user_id = %1$L) + (select count(*) from public.habit_logs where user_id = %1$L) + (select count(*) from public.performance_evidence where user_id = %1$L)$q$, client_a)), '0');

    -- ------------------------------------------------ 8. wins removed with Undo
    perform pg_temp.t_as(client_a);
    update public.wins set deleted_at = now() where id = win_a;
    f := f || pg_temp.t_eq('8a a deleted win leaves evidence too', pg_temp.t_n(format('select deleted_at is not null from public.performance_evidence where win_id = %L', win_a)), 'true');
    update public.wins set deleted_at = null where id = win_a;
    f := f || pg_temp.t_eq('8b Undo brings it back', pg_temp.t_n(format('select deleted_at is null from public.performance_evidence where win_id = %L', win_a)), 'true');

    perform pg_temp.t_anon();
    f := f || pg_temp.t_eq('9a signed out reads nothing', pg_temp.t_n('select count(*) from public.habit_logs'), 'error 42501');

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
