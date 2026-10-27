-- =============================================================================
-- 032_scores_in_database_test.sql
-- Checks 032_scores_in_database.sql. RUN ORDER: 026 to 032, then this.
--
-- Written by tests/scores/make-db-test.mjs from tests/scores/cases.mjs: the
-- same cases, inputs and answers as npm run test:scores, so the database and
-- the scoring library can never disagree. Don't edit it by hand: change the
-- cases and run node tests/scores/make-db-test.mjs.
--
-- WHAT IT DOES
--   1. Every shared case (M0.4 calendar, M5, M6, M9, M18, M19) through the
--      database copies.
--   2. The same arithmetic reached through the tables: M5-1 saved as real
--      rows and frozen (freeze_week), a frozen end-of-sprint summary
--      (make_sprint_summary), the organisation figures and their group-size
--      rules (org_figures), the pulse (pulse_results) and impact
--      (impact_results), as invented people. Everything is undone at the end.
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
create or replace function pg_temp.t_near(p_name text, p_got numeric, p_want numeric) returns text[] language sql as $f$
  select case when (p_got is null and p_want is null) or (p_got is not null and p_want is not null and abs(p_got - p_want) < 0.000001)
              then '{}'::text[]
              else array[format('%s: expected %s, got %s', p_name, coalesce(p_want::text, 'nothing'), coalesce(p_got::text, 'nothing'))] end;
$f$;

-- ---------------------------------------------------------------- the checks
do $t$
declare
  f text[] := '{}';
  r jsonb;
  sam uuid; sponsor_u uuid; lead_u uuid; lead_other uuid; admin_u uuid; boss uuid; nobody_u uuid;
  org1 uuid; team1 uuid; team_other uuid; m_sam uuid; m2 uuid; m3 uuid; p2 uuid; p3 uuid;
  plan_s uuid; o1 uuid; o2 uuid; o3 uuid; s_grow uuid; s_energy uuid; s_craft uuid;
  spr uuid; sh_ref uuid; sh_train uuid; sh_late uuid; sh_read uuid; mon date;
  summ uuid; plan2 uuid; plan3 uuid; spr2 uuid; spr3 uuid;
  rq record; ptok text; psend uuid; b1 uuid; b2 uuid; t1s text; t1e text; t2s text; t2e text; q1s uuid; q1e uuid; q2s uuid; q2e uuid;
begin
  begin
    -- ------------------------------------------------ 1. the shared cases (33 cases)
    r := public.score_week_raw($j${"week":{"number":1,"start":"2026-10-19","end":"2026-10-25","days":["2026-10-19","2026-10-20","2026-10-21","2026-10-22","2026-10-23","2026-10-24","2026-10-25"]},"weeks":[{"number":1,"start":"2026-10-19","end":"2026-10-25"},{"number":2,"start":"2026-10-26","end":"2026-11-01"},{"number":3,"start":"2026-11-02","end":"2026-11-08"}],"workingDays":["2026-10-19","2026-10-20","2026-10-21","2026-10-22","2026-10-23"],"soFarUntil":null,"strategies":[{"id":"grow","served":2},{"id":"energy","served":1},{"id":"craft","served":1}],"habits":[{"id":"referrals","strategyId":"grow","impact":3,"measure":"count","target":3,"targetPer":"week"},{"id":"training","strategyId":"energy","impact":3,"measure":"count","target":3,"targetPer":"week"},{"id":"late","strategyId":"energy","impact":2,"measure":"yes_no_days_limit","limit":2},{"id":"reading","strategyId":"craft","impact":1,"measure":"amount","target":20,"targetPer":"day"}],"logs":[{"habitId":"referrals","date":"2026-10-19","value":1},{"habitId":"referrals","date":"2026-10-21","value":1},{"habitId":"training","date":"2026-10-19","value":1},{"habitId":"training","date":"2026-10-21","value":1},{"habitId":"training","date":"2026-10-23","value":1},{"habitId":"late","date":"2026-10-19","value":1},{"habitId":"late","date":"2026-10-20","value":1},{"habitId":"late","date":"2026-10-21","value":1},{"habitId":"late","date":"2026-10-22","value":0},{"habitId":"late","date":"2026-10-23","value":0},{"habitId":"reading","date":"2026-10-19","value":30},{"habitId":"reading","date":"2026-10-20","value":30},{"habitId":"reading","date":"2026-10-21","value":30},{"habitId":"reading","date":"2026-10-22","value":30}],"todos":[{"id":"email","strategyId":"grow","impact":2,"createdOn":"2026-10-18","plannedWeek":1,"moves":[],"doneOn":"2026-10-20"},{"id":"record","strategyId":"craft","impact":3,"createdOn":"2026-10-18","plannedWeek":1,"moves":[],"doneOn":null}],"wins":[{"id":"win1","date":"2026-10-22","impact":1,"strategyIds":["grow"]}]}$j$::jsonb);
    f := f || pg_temp.t_near('M5-1: score', (r ->> 'score')::numeric, 67.916667);
    f := f || pg_temp.t_eq('M5-1: shown', public.score_round((r ->> 'score')::numeric)::text, '68');
    f := f || pg_temp.t_near('M5-1: Strategy grow', (select (x ->> 'score')::numeric from jsonb_array_elements(r -> 'strategies') x where x ->> 'id' = 'grow'), 83.333333);
    f := f || pg_temp.t_near('M5-1: Strategy energy', (select (x ->> 'score')::numeric from jsonb_array_elements(r -> 'strategies') x where x ->> 'id' = 'energy'), 80);
    f := f || pg_temp.t_near('M5-1: Strategy craft', (select (x ->> 'score')::numeric from jsonb_array_elements(r -> 'strategies') x where x ->> 'id' = 'craft'), 25);
    r := public.score_week_raw($j${"week":{"number":1,"start":"2026-10-19","end":"2026-10-25","days":["2026-10-19","2026-10-20","2026-10-21","2026-10-22","2026-10-23","2026-10-24","2026-10-25"]},"weeks":[{"number":1,"start":"2026-10-19","end":"2026-10-25"},{"number":2,"start":"2026-10-26","end":"2026-11-01"},{"number":3,"start":"2026-11-02","end":"2026-11-08"}],"workingDays":["2026-10-19","2026-10-20","2026-10-21","2026-10-22","2026-10-23"],"soFarUntil":null,"strategies":[{"id":"grow","served":1}],"habits":[],"logs":[],"todos":[],"wins":[]}$j$::jsonb);
    f := f || pg_temp.t_near('M5-empty: score', (r ->> 'score')::numeric, null);
    f := f || pg_temp.t_eq('M5-empty: shown', public.score_round((r ->> 'score')::numeric)::text, null);
    f := f || pg_temp.t_near('M5-empty: Strategy grow', (select (x ->> 'score')::numeric from jsonb_array_elements(r -> 'strategies') x where x ->> 'id' = 'grow'), null);
    r := public.score_week_raw($j${"week":{"number":1,"start":"2026-10-19","end":"2026-10-25","days":["2026-10-19","2026-10-20","2026-10-21","2026-10-22","2026-10-23","2026-10-24","2026-10-25"]},"weeks":[{"number":1,"start":"2026-10-19","end":"2026-10-25"},{"number":2,"start":"2026-10-26","end":"2026-11-01"},{"number":3,"start":"2026-11-02","end":"2026-11-08"}],"workingDays":["2026-10-19","2026-10-20","2026-10-21","2026-10-22","2026-10-23"],"soFarUntil":null,"strategies":[{"id":"a","served":0},{"id":"b","served":3}],"habits":[],"logs":[],"todos":[{"id":"t1","strategyId":"a","impact":2,"createdOn":"2026-10-18","plannedWeek":1,"moves":[],"doneOn":"2026-10-19"},{"id":"t2","strategyId":"b","impact":2,"createdOn":"2026-10-18","plannedWeek":1,"moves":[],"doneOn":null}],"wins":[]}$j$::jsonb);
    f := f || pg_temp.t_near('M5-serves-none: score', (r ->> 'score')::numeric, 25);
    f := f || pg_temp.t_eq('M5-serves-none: shown', public.score_round((r ->> 'score')::numeric)::text, '25');
    f := f || pg_temp.t_near('M5-serves-none: Strategy a', (select (x ->> 'score')::numeric from jsonb_array_elements(r -> 'strategies') x where x ->> 'id' = 'a'), 100);
    f := f || pg_temp.t_near('M5-serves-none: Strategy b', (select (x ->> 'score')::numeric from jsonb_array_elements(r -> 'strategies') x where x ->> 'id' = 'b'), 0);
    r := public.score_week_raw($j${"week":{"number":1,"start":"2026-10-19","end":"2026-10-25","days":["2026-10-19","2026-10-20","2026-10-21","2026-10-22","2026-10-23","2026-10-24","2026-10-25"]},"weeks":[{"number":1,"start":"2026-10-19","end":"2026-10-25"},{"number":2,"start":"2026-10-26","end":"2026-11-01"},{"number":3,"start":"2026-11-02","end":"2026-11-08"}],"workingDays":["2026-10-19","2026-10-20","2026-10-21","2026-10-22","2026-10-23"],"soFarUntil":"2026-10-20","strategies":[{"id":"s","served":1}],"habits":[{"id":"h","strategyId":"s","impact":2,"measure":"count","target":5,"targetPer":"week"}],"logs":[{"habitId":"h","date":"2026-10-19","value":1},{"habitId":"h","date":"2026-10-20","value":1},{"habitId":"h","date":"2026-10-22","value":1}],"todos":[{"id":"open","strategyId":"s","impact":3,"createdOn":"2026-10-18","plannedWeek":1,"moves":[],"doneOn":null}],"wins":[]}$j$::jsonb);
    f := f || pg_temp.t_near('M5-so-far: score', (r ->> 'score')::numeric, 100);
    f := f || pg_temp.t_eq('M5-so-far: shown', public.score_round((r ->> 'score')::numeric)::text, '100');
    f := f || pg_temp.t_near('M5-so-far: Strategy s', (select (x ->> 'score')::numeric from jsonb_array_elements(r -> 'strategies') x where x ->> 'id' = 's'), 100);
    r := public.score_week_raw($j${"week":{"number":1,"start":"2026-10-19","end":"2026-10-25","days":["2026-10-19","2026-10-20","2026-10-21","2026-10-22","2026-10-23","2026-10-24","2026-10-25"]},"weeks":[{"number":1,"start":"2026-10-19","end":"2026-10-25"},{"number":2,"start":"2026-10-26","end":"2026-11-01"},{"number":3,"start":"2026-11-02","end":"2026-11-08"}],"workingDays":["2026-10-19","2026-10-20","2026-10-21","2026-10-22","2026-10-23"],"soFarUntil":"2026-10-20","strategies":[{"id":"s","served":1}],"habits":[{"id":"h","strategyId":"s","impact":2,"measure":"count","target":5,"targetPer":"week"}],"logs":[{"habitId":"h","date":"2026-10-22","value":3}],"todos":[{"id":"later","strategyId":"s","impact":3,"createdOn":"2026-10-18","plannedWeek":1,"moves":[],"doneOn":"2026-10-22"}],"wins":[]}$j$::jsonb);
    f := f || pg_temp.t_near('M5-so-far-later-todo: score', (r ->> 'score')::numeric, 0);
    f := f || pg_temp.t_eq('M5-so-far-later-todo: shown', public.score_round((r ->> 'score')::numeric)::text, '0');
    f := f || pg_temp.t_near('M5-so-far-later-todo: Strategy s', (select (x ->> 'score')::numeric from jsonb_array_elements(r -> 'strategies') x where x ->> 'id' = 's'), 0);
    r := public.score_week_raw($j${"week":{"number":1,"start":"2026-10-19","end":"2026-10-25","days":["2026-10-19","2026-10-20","2026-10-21","2026-10-22","2026-10-23","2026-10-24","2026-10-25"]},"weeks":[{"number":1,"start":"2026-10-19","end":"2026-10-25"},{"number":2,"start":"2026-10-26","end":"2026-11-01"},{"number":3,"start":"2026-11-02","end":"2026-11-08"}],"workingDays":["2026-10-19","2026-10-20","2026-10-21","2026-10-22","2026-10-23"],"soFarUntil":null,"strategies":[{"id":"s","served":1}],"habits":[{"id":"h","strategyId":"s","impact":2,"measure":"count","target":3,"targetPer":"week"}],"logs":[{"habitId":"h","date":"2026-10-19","value":1},{"habitId":"h","date":"2026-10-20","value":-5},{"habitId":"h","date":"2026-10-21","value":"abc"}],"todos":[],"wins":[]}$j$::jsonb);
    f := f || pg_temp.t_near('M5-unusable-values: score', (r ->> 'score')::numeric, 33.333333);
    f := f || pg_temp.t_eq('M5-unusable-values: shown', public.score_round((r ->> 'score')::numeric)::text, '33');
    f := f || pg_temp.t_near('M5-unusable-values: Strategy s', (select (x ->> 'score')::numeric from jsonb_array_elements(r -> 'strategies') x where x ->> 'id' = 's'), 33.333333);
    r := public.score_week_raw($j${"week":{"number":1,"start":"2026-10-19","end":"2026-10-25","days":["2026-10-19","2026-10-20","2026-10-21","2026-10-22","2026-10-23","2026-10-24","2026-10-25"]},"weeks":[{"number":1,"start":"2026-10-19","end":"2026-10-25"},{"number":2,"start":"2026-10-26","end":"2026-11-01"},{"number":3,"start":"2026-11-02","end":"2026-11-08"}],"workingDays":["2026-10-19","2026-10-20","2026-10-21","2026-10-22","2026-10-23"],"soFarUntil":"2026-10-21","strategies":[{"id":"s","served":1}],"habits":[{"id":"block","strategyId":"s","impact":2,"measure":"yes_no_weekly"},{"id":"walk","strategyId":"s","impact":2,"measure":"yes_no_days_target","target":4}],"logs":[{"habitId":"walk","date":"2026-10-19","value":1},{"habitId":"walk","date":"2026-10-20","value":0},{"habitId":"walk","date":"2026-10-21","value":1}],"todos":[],"wins":[]}$j$::jsonb);
    f := f || pg_temp.t_near('M5-so-far-weekly-yes-no: score', (r ->> 'score')::numeric, 83.333333);
    f := f || pg_temp.t_eq('M5-so-far-weekly-yes-no: shown', public.score_round((r ->> 'score')::numeric)::text, '83');
    f := f || pg_temp.t_near('M5-so-far-weekly-yes-no: Strategy s', (select (x ->> 'score')::numeric from jsonb_array_elements(r -> 'strategies') x where x ->> 'id' = 's'), 83.333333);
    r := public.score_week_raw($j${"week":{"number":1,"start":"2026-10-19","end":"2026-10-25","days":["2026-10-19","2026-10-20","2026-10-21","2026-10-22","2026-10-23","2026-10-24","2026-10-25"]},"weeks":[{"number":1,"start":"2026-10-19","end":"2026-10-25"},{"number":2,"start":"2026-10-26","end":"2026-11-01"},{"number":3,"start":"2026-11-02","end":"2026-11-08"}],"workingDays":["2026-10-19","2026-10-20","2026-10-21","2026-10-22"],"soFarUntil":null,"strategies":[{"id":"s","served":1}],"habits":[{"id":"h","strategyId":"s","impact":2,"measure":"amount","target":10,"targetPer":"day"}],"logs":[{"habitId":"h","date":"2026-10-19","value":10},{"habitId":"h","date":"2026-10-20","value":10},{"habitId":"h","date":"2026-10-24","value":10}],"todos":[],"wins":[]}$j$::jsonb);
    f := f || pg_temp.t_near('M5-days-off: score', (r ->> 'score')::numeric, 75);
    f := f || pg_temp.t_eq('M5-days-off: shown', public.score_round((r ->> 'score')::numeric)::text, '75');
    f := f || pg_temp.t_near('M5-days-off: Strategy s', (select (x ->> 'score')::numeric from jsonb_array_elements(r -> 'strategies') x where x ->> 'id' = 's'), 75);
    r := public.score_week_raw($j${"week":{"number":1,"start":"2026-10-19","end":"2026-10-25","days":["2026-10-19","2026-10-20","2026-10-21","2026-10-22","2026-10-23","2026-10-24","2026-10-25"]},"weeks":[{"number":1,"start":"2026-10-19","end":"2026-10-25"},{"number":2,"start":"2026-10-26","end":"2026-11-01"},{"number":3,"start":"2026-11-02","end":"2026-11-08"}],"workingDays":["2026-10-19","2026-10-20","2026-10-21","2026-10-22","2026-10-23"],"soFarUntil":null,"strategies":[{"id":"s","served":1}],"habits":[{"id":"coffee","strategyId":"s","impact":2,"measure":"count_limit","limit":2,"limitPer":"day"},{"id":"focus","strategyId":"s","impact":2,"measure":"rating","target":4,"direction":"higher"}],"logs":[{"habitId":"coffee","date":"2026-10-19","value":1},{"habitId":"coffee","date":"2026-10-20","value":1},{"habitId":"focus","date":"2026-10-19","value":3},{"habitId":"focus","date":"2026-10-20","value":3},{"habitId":"focus","date":"2026-10-21","value":3}],"todos":[],"wins":[]}$j$::jsonb);
    f := f || pg_temp.t_near('M5-not-logged: score', (r ->> 'score')::numeric, 33.333333);
    f := f || pg_temp.t_eq('M5-not-logged: shown', public.score_round((r ->> 'score')::numeric)::text, '33');
    f := f || pg_temp.t_near('M5-not-logged: Strategy s', (select (x ->> 'score')::numeric from jsonb_array_elements(r -> 'strategies') x where x ->> 'id' = 's'), 33.333333);
    r := public.score_week_raw($j${"week":{"number":1,"start":"2026-10-19","end":"2026-10-25","days":["2026-10-19","2026-10-20","2026-10-21","2026-10-22","2026-10-23","2026-10-24","2026-10-25"]},"weeks":[{"number":1,"start":"2026-10-19","end":"2026-10-25"},{"number":2,"start":"2026-10-26","end":"2026-11-01"},{"number":3,"start":"2026-11-02","end":"2026-11-08"}],"workingDays":["2026-10-19","2026-10-20","2026-10-21","2026-10-22","2026-10-23"],"soFarUntil":null,"strategies":[{"id":"a","served":1},{"id":"b","served":1}],"habits":[{"id":"none","strategyId":"a","impact":2,"measure":"yes_no_days_limit","limit":0},{"id":"one","strategyId":"b","impact":2,"measure":"yes_no_days_limit","limit":0}],"logs":[{"habitId":"none","date":"2026-10-19","value":0},{"habitId":"none","date":"2026-10-20","value":0},{"habitId":"none","date":"2026-10-21","value":0},{"habitId":"one","date":"2026-10-19","value":1},{"habitId":"one","date":"2026-10-20","value":0},{"habitId":"one","date":"2026-10-21","value":0}],"todos":[],"wins":[]}$j$::jsonb);
    f := f || pg_temp.t_near('M5-limit-zero: score', (r ->> 'score')::numeric, 50);
    f := f || pg_temp.t_eq('M5-limit-zero: shown', public.score_round((r ->> 'score')::numeric)::text, '50');
    f := f || pg_temp.t_near('M5-limit-zero: Strategy a', (select (x ->> 'score')::numeric from jsonb_array_elements(r -> 'strategies') x where x ->> 'id' = 'a'), 100);
    f := f || pg_temp.t_near('M5-limit-zero: Strategy b', (select (x ->> 'score')::numeric from jsonb_array_elements(r -> 'strategies') x where x ->> 'id' = 'b'), 0);
    r := public.score_week_raw($j${"week":{"number":1,"start":"2026-10-19","end":"2026-10-25","days":["2026-10-19","2026-10-20","2026-10-21","2026-10-22","2026-10-23","2026-10-24","2026-10-25"]},"weeks":[{"number":1,"start":"2026-10-19","end":"2026-10-25"},{"number":2,"start":"2026-10-26","end":"2026-11-01"},{"number":3,"start":"2026-11-02","end":"2026-11-08"}],"workingDays":["2026-10-19","2026-10-20","2026-10-21","2026-10-22","2026-10-23"],"soFarUntil":null,"strategies":[{"id":"s","served":1}],"habits":[{"id":"p","strategyId":"s","impact":2,"measure":"rating","target":2,"direction":"lower"}],"logs":[{"habitId":"p","date":"2026-10-19","value":3},{"habitId":"p","date":"2026-10-20","value":3},{"habitId":"p","date":"2026-10-21","value":3},{"habitId":"p","date":"2026-10-22","value":5,"toConfirm":true}],"todos":[],"wins":[]}$j$::jsonb);
    f := f || pg_temp.t_near('M5-rating-lower: score', (r ->> 'score')::numeric, 66.666667);
    f := f || pg_temp.t_eq('M5-rating-lower: shown', public.score_round((r ->> 'score')::numeric)::text, '67');
    f := f || pg_temp.t_near('M5-rating-lower: Strategy s', (select (x ->> 'score')::numeric from jsonb_array_elements(r -> 'strategies') x where x ->> 'id' = 's'), 66.666667);
    r := public.score_week_raw($j${"week":{"number":2,"start":"2026-10-26","end":"2026-11-01","days":["2026-10-26","2026-10-27","2026-10-28","2026-10-29","2026-10-30","2026-10-31","2026-11-01"]},"weeks":[{"number":1,"start":"2026-10-19","end":"2026-10-25"},{"number":2,"start":"2026-10-26","end":"2026-11-01"},{"number":3,"start":"2026-11-02","end":"2026-11-08"}],"workingDays":["2026-10-26","2026-10-27","2026-10-28","2026-10-29","2026-10-30"],"soFarUntil":null,"strategies":[{"id":"s","served":1}],"habits":[],"logs":[],"todos":[{"id":"in-before","strategyId":"s","impact":1,"createdOn":"2026-10-19","plannedWeek":3,"moves":[{"on":"2026-10-25","toWeek":2}],"doneOn":"2026-10-27"},{"id":"out-after","strategyId":"s","impact":1,"createdOn":"2026-10-19","plannedWeek":2,"moves":[{"on":"2026-10-26","toWeek":3}],"doneOn":null},{"id":"rolled","strategyId":"s","impact":1,"createdOn":"2026-10-19","plannedWeek":1,"moves":[],"doneOn":null},{"id":"early","strategyId":"s","impact":1,"createdOn":"2026-10-19","plannedWeek":3,"moves":[],"doneOn":"2026-10-28"},{"id":"done-w1","strategyId":"s","impact":1,"createdOn":"2026-10-19","plannedWeek":2,"moves":[],"doneOn":"2026-10-21"},{"id":"out-before","strategyId":"s","impact":1,"createdOn":"2026-10-19","plannedWeek":2,"moves":[{"on":"2026-10-24","toWeek":3}],"doneOn":null}],"wins":[]}$j$::jsonb);
    f := f || pg_temp.t_near('M5-todo-rules: score', (r ->> 'score')::numeric, 50);
    f := f || pg_temp.t_eq('M5-todo-rules: shown', public.score_round((r ->> 'score')::numeric)::text, '50');
    f := f || pg_temp.t_near('M5-todo-rules: Strategy s', (select (x ->> 'score')::numeric from jsonb_array_elements(r -> 'strategies') x where x ->> 'id' = 's'), 50);
    r := public.score_week_raw($j${"week":{"number":1,"start":"2026-10-19","end":"2026-10-25","days":["2026-10-19","2026-10-20","2026-10-21","2026-10-22","2026-10-23","2026-10-24","2026-10-25"]},"weeks":[{"number":1,"start":"2026-10-19","end":"2026-10-25"},{"number":2,"start":"2026-10-26","end":"2026-11-01"},{"number":3,"start":"2026-11-02","end":"2026-11-08"}],"workingDays":["2026-10-19","2026-10-20","2026-10-21","2026-10-22","2026-10-23"],"soFarUntil":null,"strategies":[{"id":"a","served":1},{"id":"b","served":1}],"habits":[],"logs":[],"todos":[{"id":"t","strategyId":"a","impact":3,"createdOn":"2026-10-18","plannedWeek":1,"moves":[],"doneOn":null},{"id":"u","strategyId":"b","impact":2,"createdOn":"2026-10-18","plannedWeek":1,"moves":[],"doneOn":"2026-10-20"}],"wins":[{"id":"w","date":"2026-10-21","impact":3,"strategyIds":["a","b","a"]}]}$j$::jsonb);
    f := f || pg_temp.t_near('M5-wins-several: score', (r ->> 'score')::numeric, 75);
    f := f || pg_temp.t_eq('M5-wins-several: shown', public.score_round((r ->> 'score')::numeric)::text, '75');
    f := f || pg_temp.t_near('M5-wins-several: Strategy a', (select (x ->> 'score')::numeric from jsonb_array_elements(r -> 'strategies') x where x ->> 'id' = 'a'), 50);
    f := f || pg_temp.t_near('M5-wins-several: Strategy b', (select (x ->> 'score')::numeric from jsonb_array_elements(r -> 'strategies') x where x ->> 'id' = 'b'), 100);
    r := public.score_week_raw($j${"week":{"number":1,"start":"2026-10-19","end":"2026-10-25","days":["2026-10-19","2026-10-20","2026-10-21","2026-10-22","2026-10-23","2026-10-24","2026-10-25"]},"weeks":[{"number":1,"start":"2026-10-19","end":"2026-10-25"},{"number":2,"start":"2026-10-26","end":"2026-11-01"},{"number":3,"start":"2026-11-02","end":"2026-11-08"}],"workingDays":["2026-10-19","2026-10-20","2026-10-21","2026-10-22","2026-10-23"],"soFarUntil":null,"strategies":[{"id":"s","served":1}],"habits":[{"id":"h","strategyId":"s","impact":2,"measure":"amount","target":200,"targetPer":"week"}],"logs":[{"habitId":"h","date":"2026-10-19","value":169}],"todos":[],"wins":[]}$j$::jsonb);
    f := f || pg_temp.t_near('M5-half-rounds-up: score', (r ->> 'score')::numeric, 84.5);
    f := f || pg_temp.t_eq('M5-half-rounds-up: shown', public.score_round((r ->> 'score')::numeric)::text, '85');
    f := f || pg_temp.t_near('M5-half-rounds-up: Strategy s', (select (x ->> 'score')::numeric from jsonb_array_elements(r -> 'strategies') x where x ->> 'id' = 's'), 84.5);
    r := public.score_sprint_calendar($j${"start":"2026-10-01","lengthWeeks":2,"recoveries":[{"start":"2026-10-06","end":"2026-10-09"}]}$j$::jsonb, date '2026-10-30');
    f := f || pg_temp.t_eq('M0.4-recovery: weeks', (select jsonb_agg(w - 'days' order by (w ->> 'number')::integer) from jsonb_array_elements(r -> 'weeks') w)::text, $j$[{"number":1,"start":"2026-10-01","end":"2026-10-10","recoveryDaysInside":3,"finished":true},{"number":2,"start":"2026-10-11","end":"2026-10-17","recoveryDaysInside":0,"finished":true}]$j$::jsonb::text);
    f := f || pg_temp.t_eq('M0.4-recovery: planned end', r ->> 'plannedEnd', '2026-10-14');
    f := f || pg_temp.t_eq('M0.4-recovery: actual end', r ->> 'actualEnd', '2026-10-17');
    r := public.score_sprint_calendar($j${"start":"2026-10-01","lengthWeeks":2,"recoveries":[{"start":"2026-10-05","end":null}]}$j$::jsonb, date '2026-10-12');
    f := f || pg_temp.t_eq('M0.4-open-recovery: weeks', (select jsonb_agg(w - 'days' order by (w ->> 'number')::integer) from jsonb_array_elements(r -> 'weeks') w)::text, $j$[{"number":1,"start":"2026-10-01","end":"2026-10-04","recoveryDaysInside":0,"finished":false}]$j$::jsonb::text);
    f := f || pg_temp.t_eq('M0.4-open-recovery: planned end', r ->> 'plannedEnd', '2026-10-14');
    f := f || pg_temp.t_eq('M0.4-open-recovery: actual end', r ->> 'actualEnd', null);
    r := public.score_m6_sprint($j$[{"number":1,"score":70,"finished":true},{"number":2,"score":84.5,"finished":true},{"number":3,"score":90.2,"finished":true},{"number":4,"score":89.6,"finished":true},{"number":5,"score":null,"finished":true},{"number":6,"score":99,"finished":false}]$j$::jsonb, 85, 80.4);
    f := f || pg_temp.t_near('M6-basic: average', (r ->> 'average')::numeric, 83.575);
    f := f || pg_temp.t_eq('M6-basic: shown', public.score_round((r ->> 'average')::numeric)::text, '84');
    f := f || pg_temp.t_eq('M6-basic: finished weeks', r ->> 'finishedWeeks', '4');
    f := f || pg_temp.t_eq('M6-basic: weeks at the standard', r ->> 'weeksAtStandard', '3');
    f := f || pg_temp.t_eq('M6-basic: best week', r -> 'best' ->> 'number', '4');
    f := f || pg_temp.t_near('M6-basic: best score', (r -> 'best' ->> 'score')::numeric, 89.6);
    f := f || pg_temp.t_eq('M6-basic: change', r ->> 'change', '4');
    r := public.score_m6_sprint($j$[{"number":1,"score":50,"finished":false}]$j$::jsonb, 85, null);
    f := f || pg_temp.t_near('M6-none: average', (r ->> 'average')::numeric, null);
    f := f || pg_temp.t_eq('M6-none: shown', public.score_round((r ->> 'average')::numeric)::text, null);
    f := f || pg_temp.t_eq('M6-none: finished weeks', r ->> 'finishedWeeks', '0');
    f := f || pg_temp.t_eq('M6-none: weeks at the standard', r ->> 'weeksAtStandard', '0');
    f := f || pg_temp.t_eq('M6-none: best week', r -> 'best' ->> 'number', null);
    f := f || pg_temp.t_eq('M6-none: change', r ->> 'change', null);
    r := public.score_m9_objective($j${"kind":"number","direction":"up","start":20,"startOn":"2026-01-01","target":38,"byWhen":"2027-06-30","figures":[{"on":"2026-10-26","value":31}]}$j$::jsonb, date '2026-10-26', date '2026-10-01');
    f := f || pg_temp.t_eq('M9-1: status', r ->> 'status', 'on_track');
    f := f || pg_temp.t_eq('M9-1: onPace', r ->> 'onPace', 'true');
    f := f || pg_temp.t_near('M9-1: rateSoFar', (r ->> 'rateSoFar')::numeric, 1.123624);
    f := f || pg_temp.t_near('M9-1: rateNeeded', (r ->> 'rateNeeded')::numeric, 0.862672);
    f := f || pg_temp.t_near('M9-1: progress', (r ->> 'progress')::numeric, 81.578947);
    f := f || pg_temp.t_eq('M9-1: reached', r ->> 'reached', 'false');
    f := f || pg_temp.t_eq('M9-1: improving', r ->> 'improving', 'true');
    f := f || pg_temp.t_eq('M9-1: notMoving', r ->> 'notMoving', 'false');
    r := public.score_m9_objective($j${"kind":"number","direction":"down","start":20,"startOn":"2026-01-01","target":5,"byWhen":"2026-12-31","figures":[{"on":"2026-02-01","value":19},{"on":"2026-04-01","value":18}]}$j$::jsonb, date '2026-04-01', date '2026-03-15');
    f := f || pg_temp.t_eq('M9-down: status', r ->> 'status', 'off_track');
    f := f || pg_temp.t_eq('M9-down: onPace', r ->> 'onPace', 'false');
    f := f || pg_temp.t_near('M9-down: rateSoFar', (r ->> 'rateSoFar')::numeric, 0.676444);
    f := f || pg_temp.t_near('M9-down: rateNeeded', (r ->> 'rateNeeded')::numeric, 1.444234);
    f := f || pg_temp.t_near('M9-down: progress', (r ->> 'progress')::numeric, 13.333333);
    f := f || pg_temp.t_eq('M9-down: reached', r ->> 'reached', 'false');
    f := f || pg_temp.t_eq('M9-down: improving', r ->> 'improving', 'true');
    f := f || pg_temp.t_eq('M9-down: notMoving', r ->> 'notMoving', 'false');
    r := public.score_m9_objective($j${"kind":"number","direction":"down","start":20,"startOn":"2026-01-01","target":5,"byWhen":"2026-12-31","figures":[{"on":"2026-04-01","value":8}]}$j$::jsonb, date '2026-04-01', date '2026-03-15');
    f := f || pg_temp.t_eq('M9-down-on-pace: status', r ->> 'status', 'on_track');
    f := f || pg_temp.t_eq('M9-down-on-pace: onPace', r ->> 'onPace', 'true');
    f := f || pg_temp.t_near('M9-down-on-pace: rateSoFar', (r ->> 'rateSoFar')::numeric, 4.058667);
    f := f || pg_temp.t_near('M9-down-on-pace: rateNeeded', (r ->> 'rateNeeded')::numeric, 0.333285);
    f := f || pg_temp.t_near('M9-down-on-pace: progress', (r ->> 'progress')::numeric, 80);
    f := f || pg_temp.t_eq('M9-down-on-pace: reached', r ->> 'reached', 'false');
    f := f || pg_temp.t_eq('M9-down-on-pace: improving', r ->> 'improving', 'true');
    f := f || pg_temp.t_eq('M9-down-on-pace: notMoving', r ->> 'notMoving', 'false');
    r := public.score_m9_objective($j${"kind":"rating","start":5,"startOn":"2026-10-12","target":9,"byWhen":"2027-06-30","figures":[]}$j$::jsonb, date '2026-10-26', date '2026-10-12');
    f := f || pg_temp.t_eq('M9-too-early: status', r ->> 'status', 'too_early');
    f := f || pg_temp.t_eq('M9-too-early: onPace', r ->> 'onPace', 'false');
    f := f || pg_temp.t_near('M9-too-early: rateSoFar', (r ->> 'rateSoFar')::numeric, 0);
    f := f || pg_temp.t_near('M9-too-early: rateNeeded', (r ->> 'rateNeeded')::numeric, 0.492955);
    f := f || pg_temp.t_near('M9-too-early: progress', (r ->> 'progress')::numeric, 55.555556);
    f := f || pg_temp.t_eq('M9-too-early: reached', r ->> 'reached', 'false');
    f := f || pg_temp.t_eq('M9-too-early: improving', r ->> 'improving', 'false');
    f := f || pg_temp.t_eq('M9-too-early: notMoving', r ->> 'notMoving', 'false');
    r := public.score_m9_objective($j${"kind":"rating","start":5,"startOn":"2026-01-01","target":8,"byWhen":"2027-06-30","figures":[{"on":"2026-09-01","value":8}]}$j$::jsonb, date '2026-10-26', date '2026-10-01');
    f := f || pg_temp.t_eq('M9-reached: status', r ->> 'status', 'reached');
    f := f || pg_temp.t_eq('M9-reached: onPace', r ->> 'onPace', 'true');
    f := f || pg_temp.t_near('M9-reached: rateSoFar', (r ->> 'rateSoFar')::numeric, 0.306443);
    f := f || pg_temp.t_near('M9-reached: rateNeeded', (r ->> 'rateNeeded')::numeric, 0);
    f := f || pg_temp.t_near('M9-reached: progress', (r ->> 'progress')::numeric, 100);
    f := f || pg_temp.t_eq('M9-reached: reached', r ->> 'reached', 'true');
    f := f || pg_temp.t_eq('M9-reached: improving', r ->> 'improving', 'false');
    f := f || pg_temp.t_eq('M9-reached: notMoving', r ->> 'notMoving', 'false');
    r := public.score_m9_objective($j${"kind":"number","direction":"up","start":10,"startOn":"2026-06-01","target":20,"byWhen":"2027-06-01","figures":[{"on":"2026-07-01","value":12},{"on":"2026-09-20","value":12},{"on":"2026-10-05","value":12}]}$j$::jsonb, date '2026-10-26', date '2026-10-01');
    f := f || pg_temp.t_eq('M9-not-moving: status', r ->> 'status', 'off_track');
    f := f || pg_temp.t_eq('M9-not-moving: onPace', r ->> 'onPace', 'false');
    f := f || pg_temp.t_near('M9-not-moving: rateSoFar', (r ->> 'rateSoFar')::numeric, 0.41415);
    f := f || pg_temp.t_near('M9-not-moving: rateNeeded', (r ->> 'rateNeeded')::numeric, 1.117064);
    f := f || pg_temp.t_near('M9-not-moving: progress', (r ->> 'progress')::numeric, 60);
    f := f || pg_temp.t_eq('M9-not-moving: reached', r ->> 'reached', 'false');
    f := f || pg_temp.t_eq('M9-not-moving: improving', r ->> 'improving', 'false');
    f := f || pg_temp.t_eq('M9-not-moving: notMoving', r ->> 'notMoving', 'true');
    r := public.score_m9_objective($j${"kind":"number","direction":"up","start":10,"startOn":"2026-01-01","target":20,"byWhen":"2026-09-30","figures":[{"on":"2026-09-01","value":15}]}$j$::jsonb, date '2026-10-26', date '2026-10-01');
    f := f || pg_temp.t_eq('M9-overdue: status', r ->> 'status', 'off_track');
    f := f || pg_temp.t_eq('M9-overdue: onPace', r ->> 'onPace', 'false');
    f := f || pg_temp.t_near('M9-overdue: rateSoFar', (r ->> 'rateSoFar')::numeric, 0.510738);
    f := f || pg_temp.t_eq('M9-overdue: rateNeeded', r ->> 'rateNeeded', null);
    f := f || pg_temp.t_near('M9-overdue: progress', (r ->> 'progress')::numeric, 75);
    f := f || pg_temp.t_eq('M9-overdue: reached', r ->> 'reached', 'false');
    f := f || pg_temp.t_eq('M9-overdue: improving', r ->> 'improving', 'false');
    f := f || pg_temp.t_eq('M9-overdue: notMoving', r ->> 'notMoving', 'true');
    r := public.score_m9_objective($j${"kind":"milestone","startOn":"2026-01-01","dueOn":"2026-12-01","reachedOn":null}$j$::jsonb, date '2026-10-26', null);
    f := f || pg_temp.t_eq('M9-milestone-due: status', r ->> 'status', 'on_track');
    f := f || pg_temp.t_eq('M9-milestone-due: onTrack', r ->> 'onTrack', 'true');
    f := f || pg_temp.t_eq('M9-milestone-due: reached', r ->> 'reached', 'false');
    r := public.score_m9_objective($j${"kind":"milestone","startOn":"2026-01-01","dueOn":"2026-10-23","reachedOn":null}$j$::jsonb, date '2026-10-26', null);
    f := f || pg_temp.t_eq('M9-milestone-overdue: status', r ->> 'status', 'off_track');
    f := f || pg_temp.t_eq('M9-milestone-overdue: onTrack', r ->> 'onTrack', 'false');
    f := f || pg_temp.t_eq('M9-milestone-overdue: reached', r ->> 'reached', 'false');
    r := public.score_m9_objective($j${"kind":"milestone","startOn":"2026-01-01","dueOn":"2026-10-23","reachedOn":"2026-10-20"}$j$::jsonb, date '2026-10-26', null);
    f := f || pg_temp.t_eq('M9-milestone-reached: status', r ->> 'status', 'reached');
    f := f || pg_temp.t_eq('M9-milestone-reached: onTrack', r ->> 'onTrack', 'true');
    f := f || pg_temp.t_eq('M9-milestone-reached: reached', r ->> 'reached', 'true');
    r := public.score_m18_pulse($j$[{"energy":"high","sleep":"good","stress":"sometimes","workload":"often","support":"always","comment":"More focus time."},{"energy":"ok","sleep":"ok","stress":"often","workload":"sometimes","support":"often","comment":""},{"energy":"very_high","sleep":"very_good","stress":"rarely","workload":"often","support":"always","name":"Ola"},{"energy":"low","sleep":"poor","stress":"always","workload":"rarely","support":"sometimes","comment":"Fewer meetings."}]$j$::jsonb, $j${"energy":50,"sleep":60.4,"stress":50,"workload":40,"support":80}$j$::jsonb);
    f := f || pg_temp.t_eq('M18-1: answers', r ->> 'answers', '4');
    f := f || pg_temp.t_eq('M18-1: lowest', r ->> 'lowest', 'stress');
    f := f || pg_temp.t_near('M18-1: energy figure', (r -> 'measures' -> 'energy' ->> 'figure')::numeric, 62.5);
    f := f || pg_temp.t_eq('M18-1: energy answers', r -> 'measures' -> 'energy' ->> 'answers', '4');
    f := f || pg_temp.t_eq('M18-1: energy change', r -> 'measures' -> 'energy' ->> 'change', '13');
    f := f || pg_temp.t_near('M18-1: sleep figure', (r -> 'measures' -> 'sleep' ->> 'figure')::numeric, 62.5);
    f := f || pg_temp.t_eq('M18-1: sleep answers', r -> 'measures' -> 'sleep' ->> 'answers', '4');
    f := f || pg_temp.t_eq('M18-1: sleep change', r -> 'measures' -> 'sleep' ->> 'change', '3');
    f := f || pg_temp.t_near('M18-1: stress figure', (r -> 'measures' -> 'stress' ->> 'figure')::numeric, 37.5);
    f := f || pg_temp.t_eq('M18-1: stress answers', r -> 'measures' -> 'stress' ->> 'answers', '4');
    f := f || pg_temp.t_eq('M18-1: stress change', r -> 'measures' -> 'stress' ->> 'change', '-12');
    f := f || pg_temp.t_near('M18-1: workload figure', (r -> 'measures' -> 'workload' ->> 'figure')::numeric, 56.25);
    f := f || pg_temp.t_eq('M18-1: workload answers', r -> 'measures' -> 'workload' ->> 'answers', '4');
    f := f || pg_temp.t_eq('M18-1: workload change', r -> 'measures' -> 'workload' ->> 'change', '16');
    f := f || pg_temp.t_near('M18-1: support figure', (r -> 'measures' -> 'support' ->> 'figure')::numeric, 81.25);
    f := f || pg_temp.t_eq('M18-1: support answers', r -> 'measures' -> 'support' ->> 'answers', '4');
    f := f || pg_temp.t_eq('M18-1: support change', r -> 'measures' -> 'support' ->> 'change', '1');
    r := public.score_m18_pulse($j$[{"energy":"ok","sleep":"ok","stress":"never","workload":"always","support":"never"}]$j$::jsonb, null);
    f := f || pg_temp.t_eq('M18-one: answers', r ->> 'answers', '1');
    f := f || pg_temp.t_eq('M18-one: lowest', r ->> 'lowest', 'support');
    f := f || pg_temp.t_near('M18-one: energy figure', (r -> 'measures' -> 'energy' ->> 'figure')::numeric, 50);
    f := f || pg_temp.t_eq('M18-one: energy answers', r -> 'measures' -> 'energy' ->> 'answers', '1');
    f := f || pg_temp.t_eq('M18-one: energy change', r -> 'measures' -> 'energy' ->> 'change', null);
    f := f || pg_temp.t_near('M18-one: sleep figure', (r -> 'measures' -> 'sleep' ->> 'figure')::numeric, 50);
    f := f || pg_temp.t_eq('M18-one: sleep answers', r -> 'measures' -> 'sleep' ->> 'answers', '1');
    f := f || pg_temp.t_eq('M18-one: sleep change', r -> 'measures' -> 'sleep' ->> 'change', null);
    f := f || pg_temp.t_near('M18-one: stress figure', (r -> 'measures' -> 'stress' ->> 'figure')::numeric, 100);
    f := f || pg_temp.t_eq('M18-one: stress answers', r -> 'measures' -> 'stress' ->> 'answers', '1');
    f := f || pg_temp.t_eq('M18-one: stress change', r -> 'measures' -> 'stress' ->> 'change', null);
    f := f || pg_temp.t_near('M18-one: workload figure', (r -> 'measures' -> 'workload' ->> 'figure')::numeric, 100);
    f := f || pg_temp.t_eq('M18-one: workload answers', r -> 'measures' -> 'workload' ->> 'answers', '1');
    f := f || pg_temp.t_eq('M18-one: workload change', r -> 'measures' -> 'workload' ->> 'change', null);
    f := f || pg_temp.t_near('M18-one: support figure', (r -> 'measures' -> 'support' ->> 'figure')::numeric, 0);
    f := f || pg_temp.t_eq('M18-one: support answers', r -> 'measures' -> 'support' ->> 'answers', '1');
    f := f || pg_temp.t_eq('M18-one: support change', r -> 'measures' -> 'support' ->> 'change', null);
    r := public.score_m19_group($j$[{"current":true,"hasPlan":true,"sprintRunning":true,"finishedSeatWeeks":4,"debriefsDone":3,"summary":{"objectives":[{"status":"on_track"},{"status":"on_track"},{"status":"on_track"},{"status":"on_track"},{"status":"on_track"},{"status":"on_track"},{"status":"on_track"},{"status":"on_track"},{"status":"on_track"},{"status":"on_track"},{"status":"reached"},{"status":"reached"},{"status":"too_early"},{"status":"too_early"}],"strategies":[{"average":80},{"average":90}],"averageScore":86,"standard":85}},{"current":true,"hasPlan":true,"sprintRunning":true,"finishedSeatWeeks":4,"debriefsDone":3,"summary":{"objectives":[{"status":"on_track"},{"status":"on_track"},{"status":"on_track"},{"status":"on_track"},{"status":"on_track"},{"status":"on_track"},{"status":"reached"},{"status":"reached"},{"status":"off_track"},{"status":"off_track"},{"status":"off_track"},{"status":"too_early"},{"status":"too_early"}],"strategies":[{"average":80},{"average":90}],"averageScore":86,"standard":85}},{"current":true,"hasPlan":true,"sprintRunning":true,"finishedSeatWeeks":4,"debriefsDone":3,"summary":{"objectives":[{"status":"on_track"},{"status":"on_track"},{"status":"on_track"},{"status":"on_track"},{"status":"on_track"},{"status":"reached"},{"status":"off_track"},{"status":"off_track"},{"status":"off_track"},{"status":"off_track"},{"status":"off_track"},{"status":"too_early"},{"status":"too_early"}],"strategies":[{"average":80},{"average":90}],"averageScore":86,"standard":85}}]$j$::jsonb);
    f := f || pg_temp.t_near('M19-1: headline', (r -> 'headline' ->> 'percent')::numeric, 76.470588);
    f := f || pg_temp.t_eq('M19-1: shown', r -> 'headline' ->> 'shown', '76');
    f := f || pg_temp.t_eq('M19-1: counted', r -> 'headline' ->> 'counted', '34');
    f := f || pg_temp.t_eq('M19-1: too early', r -> 'headline' ->> 'tooEarly', '6');
    f := f || pg_temp.t_eq('M19-1: seats', r ->> 'seats', '3');
    f := f || pg_temp.t_near('M19-1: use plansInPlace', (r -> 'use' ->> 'plansInPlace')::numeric, 100);
    f := f || pg_temp.t_near('M19-1: use sprintsRunning', (r -> 'use' ->> 'sprintsRunning')::numeric, 100);
    f := f || pg_temp.t_near('M19-1: use debriefsDone', (r -> 'use' ->> 'debriefsDone')::numeric, 75);
    f := f || pg_temp.t_near('M19-1: at their own standard', (r -> 'behaviour' ->> 'atOwnStandard')::numeric, 100);
    f := f || pg_temp.t_near('M19-1: average Strategy score', (r -> 'behaviour' ->> 'averageStrategyScore')::numeric, 85);
    r := public.score_m19_group($j$[{"current":true,"hasPlan":true,"sprintRunning":true,"finishedSeatWeeks":4,"debriefsDone":3,"summary":{"objectives":[{"status":"on_track"},{"status":"off_track"}],"strategies":[{"average":80},{"average":90}],"averageScore":86,"standard":85}},{"current":true,"hasPlan":true,"sprintRunning":true,"finishedSeatWeeks":4,"debriefsDone":3,"summary":{"objectives":[{"status":"reached"}],"strategies":[{"average":60}],"averageScore":70,"standard":85}}]$j$::jsonb);
    f := f || pg_temp.t_near('M19-two-seats: headline', (r -> 'headline' ->> 'percent')::numeric, 66.666667);
    f := f || pg_temp.t_eq('M19-two-seats: shown', r -> 'headline' ->> 'shown', '67');
    f := f || pg_temp.t_eq('M19-two-seats: counted', r -> 'headline' ->> 'counted', '3');
    f := f || pg_temp.t_eq('M19-two-seats: too early', r -> 'headline' ->> 'tooEarly', '0');
    f := f || pg_temp.t_eq('M19-two-seats: seats', r ->> 'seats', '2');
    f := f || pg_temp.t_eq('M19-two-seats: use figures hidden', jsonb_typeof(r -> 'use'), 'null');
    f := f || pg_temp.t_near('M19-two-seats: at their own standard', (r -> 'behaviour' ->> 'atOwnStandard')::numeric, null);
    f := f || pg_temp.t_near('M19-two-seats: average Strategy score', (r -> 'behaviour' ->> 'averageStrategyScore')::numeric, 76.666667);
    r := public.score_m19_group($j$[{"current":true,"hasPlan":true,"sprintRunning":true,"finishedSeatWeeks":4,"debriefsDone":3,"summary":{"objectives":[{"status":"on_track"}],"strategies":[{"average":80},{"average":90}],"averageScore":86,"standard":85}},{"current":true,"hasPlan":true,"sprintRunning":true,"finishedSeatWeeks":4,"debriefsDone":3,"summary":{"objectives":[{"status":"on_track"}],"strategies":[{"average":80},{"average":90}],"averageScore":86,"standard":85}},{"current":false,"hasPlan":true,"sprintRunning":true,"finishedSeatWeeks":4,"debriefsDone":3,"summary":{"objectives":[{"status":"off_track"}],"strategies":[{"average":80},{"average":90}],"averageScore":86,"standard":85}}]$j$::jsonb);
    f := f || pg_temp.t_near('M19-leaver: headline', (r -> 'headline' ->> 'percent')::numeric, 66.666667);
    f := f || pg_temp.t_eq('M19-leaver: shown', r -> 'headline' ->> 'shown', '67');
    f := f || pg_temp.t_eq('M19-leaver: counted', r -> 'headline' ->> 'counted', '3');
    f := f || pg_temp.t_eq('M19-leaver: too early', r -> 'headline' ->> 'tooEarly', '0');
    f := f || pg_temp.t_eq('M19-leaver: seats', r ->> 'seats', '2');
    f := f || pg_temp.t_eq('M19-leaver: use figures hidden', jsonb_typeof(r -> 'use'), 'null');
    f := f || pg_temp.t_near('M19-leaver: at their own standard', (r -> 'behaviour' ->> 'atOwnStandard')::numeric, null);
    f := f || pg_temp.t_near('M19-leaver: average Strategy score', (r -> 'behaviour' ->> 'averageStrategyScore')::numeric, 85);

    -- ------------------------------------------------ 2. through the tables
    -- Week 1 of the sprint is the Monday two weeks ago, so both weeks are finished.
    mon := date_trunc('week', current_date)::date - 14;
    sam := pg_temp.t_user('sam'); sponsor_u := pg_temp.t_user('sponsor'); lead_u := pg_temp.t_user('leader');
    lead_other := pg_temp.t_user('leaderother'); admin_u := pg_temp.t_user('admin'); boss := pg_temp.t_user('boss'); nobody_u := pg_temp.t_user('nobody');
    p2 := pg_temp.t_user('second'); p3 := pg_temp.t_user('third');
    insert into public.organisations (name) values ('Invented Org') returning id into org1;
    insert into public.teams (organisation_id, name) values (org1, 'Team one') returning id into team1;
    insert into public.teams (organisation_id, name) values (org1, 'Team other') returning id into team_other;
    insert into public.organisation_admins (organisation_id, user_id) values (org1, admin_u);
    insert into public.organisation_members (organisation_id, user_id, started_on) values (org1, sam, mon - 30) returning id into m_sam;
    insert into public.team_members (member_id, team_id) values (m_sam, team1);
    insert into public.seat_sponsors (member_id, sponsor_user_id) values (m_sam, sponsor_u);
    insert into public.leader_teams (user_id, team_id) values (lead_u, team1), (lead_other, team_other);
    perform pg_temp.t_as(sam);
    perform public.membership_confirm(m_sam);
    
    -- M5-1 as real rows: Sam works Monday to Friday; objective 1 is the organisation's.
    insert into public.performance_plans (user_id, mission) values (sam, 'Grow the practice through referrals') returning id into plan_s;
    insert into public.outcome_objectives (plan_id, user_id, name, kind, direction, start_value, start_set_on, target_value, by_when, source, organisation_id)
      values (plan_s, sam, 'Referral revenue', 'number', 'up', 20, mon - 280, 38, mon + 300, 'organisation', org1) returning id into o1;
    insert into public.outcome_objectives (plan_id, user_id, name, kind, due_on) values (plan_s, sam, 'Coaching craft', 'milestone', mon + 200) returning id into o2;
    insert into public.outcome_objectives (plan_id, user_id, name, kind, due_on) values (plan_s, sam, 'Energy', 'milestone', mon + 200) returning id into o3;
    insert into public.objective_figures (objective_id, user_id, value, recorded_on) values (o1, sam, 31, mon + 5);
    insert into public.plan_strategies (plan_id, user_id, name, sort_order) values (plan_s, sam, 'Grow through referrals', 1) returning id into s_grow;
    insert into public.plan_strategies (plan_id, user_id, name, sort_order) values (plan_s, sam, 'Sustain my energy', 2) returning id into s_energy;
    insert into public.plan_strategies (plan_id, user_id, name, sort_order) values (plan_s, sam, 'Deepen my coaching craft', 3) returning id into s_craft;
    insert into public.strategy_objectives (strategy_id, objective_id, user_id) values (s_grow, o1, sam), (s_grow, o2, sam), (s_energy, o3, sam), (s_craft, o2, sam);
    insert into public.sprints (user_id, plan_id, number, start_on, length_weeks, status) values (sam, plan_s, 1, mon, 2, 'finished') returning id into spr;
    insert into public.sprint_habits (sprint_id, user_id, strategy_id, name) values (spr, sam, s_grow, 'Referral conversations') returning id into sh_ref;
    insert into public.sprint_habits (sprint_id, user_id, strategy_id, name) values (spr, sam, s_energy, 'Training sessions') returning id into sh_train;
    insert into public.sprint_habits (sprint_id, user_id, strategy_id, name) values (spr, sam, s_energy, 'Late finishes') returning id into sh_late;
    insert into public.sprint_habits (sprint_id, user_id, strategy_id, name) values (spr, sam, s_craft, 'Reading') returning id into sh_read;
    insert into public.sprint_habit_settings (sprint_habit_id, user_id, from_week, measure, target, target_per, limit_value, impact) values
      (sh_ref, sam, 1, 'count', 3, 'week', null, 3), (sh_train, sam, 1, 'count', 3, 'week', null, 3),
      (sh_late, sam, 1, 'yes_no_days_limit', null, null, 2, 2), (sh_read, sam, 1, 'amount', 20, 'day', null, 1);
    insert into public.habit_logs (user_id, sprint_habit_id, local_date, value) values
      (sam, sh_ref, mon, 1), (sam, sh_ref, mon + 2, 1),
      (sam, sh_train, mon, 1), (sam, sh_train, mon + 2, 1), (sam, sh_train, mon + 4, 1),
      (sam, sh_late, mon, 1), (sam, sh_late, mon + 1, 1), (sam, sh_late, mon + 2, 1), (sam, sh_late, mon + 3, 0), (sam, sh_late, mon + 4, 0),
      (sam, sh_read, mon, 30), (sam, sh_read, mon + 1, 30), (sam, sh_read, mon + 2, 30), (sam, sh_read, mon + 3, 30);
    insert into public.todos (user_id, strategy_id, text, impact, sprint_id, planned_week, created_on, done_on) values
      (sam, s_grow, 'Email three past clients', 2, spr, 1, mon - 1, mon + 1),
      (sam, s_craft, 'Record a session review', 3, spr, 1, mon - 1, null);
    with w as (insert into public.wins (user_id, what, local_date, impact) values (sam, 'An unplanned referral', mon + 3, 1) returning id)
    insert into public.win_strategies (win_id, strategy_id, user_id) select id, s_grow, sam from w;
    
    -- freeze_week: M5-1 through the tables
    f := f || pg_temp.t_near('T1 M5-1 frozen from the tables', pg_temp.t_n(format('select public.freeze_week(%L, 1)', spr))::numeric, 67.916667);
    f := f || pg_temp.t_eq('T2 shown as 68', pg_temp.t_n(format('select public.score_round(score) from public.week_scores where sprint_id = %L and sprint_week = 1', spr)), '68');
    f := f || pg_temp.t_near('T3 the Strategy scores kept with it', pg_temp.t_n(format('select (e ->> ''score'')::numeric from public.week_scores ws, jsonb_array_elements(ws.strategy_scores) e where ws.sprint_id = %L and ws.sprint_week = 1 and e ->> ''id'' = %L', spr, s_grow))::numeric, 83.333333);
    f := f || pg_temp.t_eq('T4 eligible and final, with the methods version', pg_temp.t_n(format('select eligible || '' '' || final || '' '' || methods_version from public.week_scores where sprint_id = %L and sprint_week = 1', spr)), 'true true 1.1');
    f := f || pg_temp.t_eq('T5 the table reader is for the checked functions only', pg_temp.t_n(format('select public.week_input(%L, 1, current_date)', spr)), 'error 42501');
    perform pg_temp.t_admin();
    f := f || pg_temp.t_eq('T5b the week from the tables is the week from the raw input', pg_temp.t_n(format(
      'select abs((public.score_week_raw(public.week_input(%L, 1, current_date)) ->> ''score'')::numeric - score) < 0.000001 from public.week_scores where sprint_id = %L and sprint_week = 1', spr, spr)), 'true');
    perform pg_temp.t_as(nobody_u);
    f := f || pg_temp.t_eq('T6 nobody else can freeze Sam''s week', pg_temp.t_n(format('select public.freeze_week(%L, 1)', spr)), 'error 42501');
    f := f || pg_temp.t_eq('T7 ... or make the summary', pg_temp.t_n(format('select public.make_sprint_summary(%L)', spr)), 'error 42501');
    
    -- make_sprint_summary: only the organisation's objective and the Strategy serving it
    perform pg_temp.t_as(sam);
    summ := pg_temp.t_n(format('select public.make_sprint_summary(%L)', spr))::uuid;
    f := f || pg_temp.t_eq('T8 week 2 frozen too (nothing logged: 0)', pg_temp.t_n(format('select score::float8 from public.week_scores where sprint_id = %L and sprint_week = 2', spr)), '0');
    f := f || pg_temp.t_eq('T9 the summary holds only the organisation''s objective', pg_temp.t_n(format('select string_agg(o ->> ''name'', '','') from public.sprint_summaries s, jsonb_array_elements(s.summary -> ''objectives'') o where s.id = %L', summ)), 'Referral revenue');
    f := f || pg_temp.t_eq('T10 ... and only the Strategy serving it', pg_temp.t_n(format('select string_agg(g ->> ''name'', '','') from public.sprint_summaries s, jsonb_array_elements(s.summary -> ''strategies'') g where s.id = %L', summ)), 'Grow through referrals');
    f := f || pg_temp.t_near('T11 its sprint score: the mean of its weeks (83.3 and 0)', pg_temp.t_n(format('select (g ->> ''average'')::numeric from public.sprint_summaries s, jsonb_array_elements(s.summary -> ''strategies'') g where s.id = %L', summ))::numeric, 41.666667);
    f := f || pg_temp.t_eq('T12 the objective''s status at the sprint''s end', pg_temp.t_n(format('select o ->> ''status'' from public.sprint_summaries s, jsonb_array_elements(s.summary -> ''objectives'') o where s.id = %L', summ)), 'on_track');
    f := f || pg_temp.t_eq('T13 nothing else in the summary', pg_temp.t_n(format('select string_agg(k, '','' order by k) from public.sprint_summaries s, jsonb_object_keys(s.summary) k where s.id = %L', summ)), 'objectives,strategies');
    f := f || pg_temp.t_eq('T14 made once: asking again changes nothing', pg_temp.t_n(format('select public.make_sprint_summary(%L) = %L', spr, summ)), 'true');
    perform pg_temp.t_as(sponsor_u);
    f := f || pg_temp.t_eq('T15 the sponsor gets the summary, and never the sprint average', pg_temp.t_n(format('select string_agg(k, '','' order by k) from public.person_summaries(%L) p, jsonb_object_keys(p.summary) k', sam)), 'objectives,strategies');
    f := f || pg_temp.t_eq('T16 the sponsor can''t read week scores', pg_temp.t_n(format('select count(*) from public.week_scores where user_id = %L', sam)), '0');
    f := f || pg_temp.t_eq('T17 a sponsor isn''t a leader: no organisation figures', pg_temp.t_n('select public.org_figures()'), 'error 42501');
    
    -- org_figures: one seat
    perform pg_temp.t_as(lead_u);
    r := pg_temp.t_n('select public.org_figures()')::jsonb;
    f := f || pg_temp.t_eq('T18 one seat: counted', r ->> 'seats', '1');
    f := f || pg_temp.t_eq('T19 one seat: no use figures', jsonb_typeof(r -> 'use'), 'null');
    f := f || pg_temp.t_eq('T20 one seat: no share at their own standard', jsonb_typeof(r -> 'behaviour' -> 'atOwnStandard'), 'null');
    f := f || pg_temp.t_near('T21 one seat: Strategy figures show', (r -> 'behaviour' ->> 'averageStrategyScore')::numeric, 41.666667);
    f := f || pg_temp.t_eq('T22 one seat: the objective headline shows', r -> 'headline' ->> 'shown', '100');
    f := f || pg_temp.t_eq('T23 no name anywhere in the figures', (r::text like '%Sam%' or r::text like format('%%%s%%', sam))::text, 'false');
    perform pg_temp.t_as(lead_other);
    f := f || pg_temp.t_eq('T24 another team''s leader can''t ask for this team', pg_temp.t_n(format('select public.org_figures(%L)', team1)), 'error 42501');
    f := f || pg_temp.t_eq('T25 ... and their own team is empty', pg_temp.t_n('select public.org_figures() ->> ''seats'''), '0');
    perform pg_temp.t_as(admin_u);
    f := f || pg_temp.t_eq('T26 an admin gets no figures', pg_temp.t_n('select public.org_figures()'), 'error 42501');
    
    -- three seats, then one leaves
    perform pg_temp.t_admin();
    insert into public.organisation_members (organisation_id, user_id) values (org1, p2) returning id into m2;
    insert into public.organisation_members (organisation_id, user_id) values (org1, p3) returning id into m3;
    insert into public.team_members (member_id, team_id) values (m2, team1), (m3, team1);
    update public.organisation_members set confirmed_at = now() where id in (m2, m3);
    f := f || pg_temp.t_eq('T26b not even the admin role can confirm for someone', pg_temp.t_n(format('select count(*) from public.organisation_members where id in (%L, %L) and confirmed_at is not null', m2, m3)), '0');
    perform pg_temp.t_as(p2); perform public.membership_confirm(m2);
    perform pg_temp.t_as(p3); perform public.membership_confirm(m3);
    perform pg_temp.t_admin();
    insert into public.performance_plans (user_id) values (p2) returning id into plan2;
    insert into public.performance_plans (user_id) values (p3) returning id into plan3;
    insert into public.sprints (user_id, plan_id, number, start_on, status) values (p2, plan2, 1, mon - 84, 'finished') returning id into spr2;
    insert into public.sprints (user_id, plan_id, number, start_on, status) values (p3, plan3, 1, mon - 84, 'finished') returning id into spr3;
    insert into public.sprint_summaries (user_id, sprint_id, member_id, organisation_id, team_ids, sprint_number, sprint_start, sprint_end, summary, methods_version, sprint_average, standard) values
      (p2, spr2, m2, org1, array[team1], 1, mon - 84, mon - 1, '{"objectives": [{"status": "off_track"}], "strategies": [{"average": 70}]}', '1.1', 90, 85),
      (p3, spr3, m3, org1, array[team1], 1, mon - 84, mon - 1, '{"objectives": [{"status": "reached"}], "strategies": [{"average": 90}]}', '1.1', 80, 85);
    perform pg_temp.t_as(lead_u);
    r := pg_temp.t_n('select public.org_figures()')::jsonb;
    f := f || pg_temp.t_eq('T27 three seats: use figures show', jsonb_typeof(r -> 'use'), 'object');
    f := f || pg_temp.t_near('T28 three seats: share at their own standard (Sam 34 and 90 of 85; 80 of 85)', (r -> 'behaviour' ->> 'atOwnStandard')::numeric, 33.333333);
    f := f || pg_temp.t_near('T29 three seats: average Strategy score', (r -> 'behaviour' ->> 'averageStrategyScore')::numeric, 67.222222);
    f := f || pg_temp.t_eq('T30 three seats: headline (on track, off track, reached)', r -> 'headline' ->> 'shown', '67');
    -- no subtraction: with Sam in team one and the other two in a team below it,
    -- team one minus that team is one seat, so the per-person figures stay hidden
    perform pg_temp.t_admin();
    insert into public.teams (id, organisation_id, name, parent_team_id) values (md5('subteam' || sam)::uuid, org1, 'Below team one', team1);
    update public.team_members set team_id = md5('subteam' || sam)::uuid where member_id in (m2, m3);
    perform pg_temp.t_as(lead_u);
    r := pg_temp.t_n('select public.org_figures()')::jsonb;
    f := f || pg_temp.t_eq('T30b no subtraction: 3 seats, but one team below holds 2 of them', coalesce(jsonb_typeof(r -> 'use'), 'missing') || ' ' || coalesce(jsonb_typeof(r -> 'behaviour' -> 'atOwnStandard'), 'missing'), 'null null');
    f := f || pg_temp.t_eq('T30c ... while objective figures still show', r -> 'headline' ->> 'counted', '3');
    perform pg_temp.t_admin();
    update public.team_members set team_id = team1 where member_id in (m2, m3);
    perform pg_temp.t_as(admin_u);
    perform public.membership_end(m3);
    perform pg_temp.t_as(lead_u);
    r := pg_temp.t_n('select public.org_figures()')::jsonb;
    f := f || pg_temp.t_eq('T31 someone left: two seats now', r ->> 'seats', '2');
    f := f || pg_temp.t_eq('T32 ... but their figures still count, anonymised', r ->> 'peopleCounted', '3');
    f := f || pg_temp.t_eq('T33 ... and with two seats, no use figures', jsonb_typeof(r -> 'use'), 'null');
    f := f || pg_temp.t_eq('T34 ... and nothing named about them comes back', pg_temp.t_n(format('select count(*) from public.person_summaries(%L)', p3)), '0');
    
    -- pulse_results (M18-1's answers)
    perform pg_temp.t_as(boss);
    select * into rq from public.pulse_send_create('short', 6, now(), now() + interval '7 days');
    psend := rq.send_id; ptok := rq.token;
    perform pg_temp.t_anon();
    perform public.feedback_send(ptok, '{"energy": "high", "sleep": "good", "stress": "sometimes", "workload": "often", "support": "always", "comment": "More focus time."}');
    perform public.feedback_send(ptok, '{"energy": "ok", "sleep": "ok", "stress": "often", "workload": "sometimes", "support": "often", "comment": ""}');
    perform public.feedback_send(ptok, '{"energy": "very_high", "sleep": "very_good", "stress": "rarely", "workload": "often", "support": "always"}', 'Ola', true);
    perform public.feedback_send(ptok, '{"energy": "low", "sleep": "poor", "stress": "always", "workload": "rarely", "support": "sometimes", "comment": "Fewer meetings."}');
    perform pg_temp.t_as(boss);
    r := pg_temp.t_n(format('select public.pulse_results(%L)', psend))::jsonb;
    f := f || pg_temp.t_eq('T35 the pulse: answers from how many', (r ->> 'answers') || ' of ' || (r ->> 'wentTo'), '4 of 6');
    f := f || pg_temp.t_near('T36 the pulse: workload as in M18-1', (r -> 'measures' -> 'workload' ->> 'figure')::numeric, 56.25);
    f := f || pg_temp.t_eq('T37 the pulse: comments as written, without names', jsonb_array_length(r -> 'comments')::text, '2');
    f := f || pg_temp.t_eq('T38 the pulse: only the answer with a name added shows named', (select string_agg(x ->> 'name', ',') from jsonb_array_elements(r -> 'named') x), 'Ola');
    f := f || pg_temp.t_eq('T39 the pulse: one small next step, from the lowest measure', r ->> 'nextStep', 'Ask your team what is adding the most pressure right now.');
    perform pg_temp.t_as(nobody_u);
    f := f || pg_temp.t_eq('T40 nobody else sees the pulse', pg_temp.t_n(format('select public.pulse_results(%L)', psend)), 'error 42501');
    
    -- impact_results (M17)
    perform pg_temp.t_as(sam);
    insert into public.impact_behaviours (user_id, member_id, text) values (sam, m_sam, 'Makes decisions in good time') returning id into b1;
    insert into public.impact_behaviours (user_id, member_id, text) values (sam, m_sam, 'Gives clear feedback') returning id into b2;
    select * into rq from public.feedback_request_create('before_after_impact', null); q1s := rq.request_id; t1s := rq.token;
    select * into rq from public.feedback_request_create('before_after_impact', null); q1e := rq.request_id; t1e := rq.token;
    select * into rq from public.feedback_request_create('before_after_impact', null); q2s := rq.request_id; t2s := rq.token;
    select * into rq from public.feedback_request_create('before_after_impact', null); q2e := rq.request_id; t2e := rq.token;
    insert into public.impact_raters (user_id, rater_label, rater_role, start_request_id, end_request_id) values
      (sam, 'Sponsor', 'sponsor', q1s, q1e), (sam, 'Colleague', 'colleague', q2s, q2e);
    perform pg_temp.t_anon();
    perform public.feedback_send(t1s, jsonb_build_object('often', jsonb_build_object(b1, 'sometimes', b2, 'sometimes')));
    perform public.feedback_send(t1e, jsonb_build_object('often', jsonb_build_object(b1, 'often', b2, 'often'), 'looking_back', jsonb_build_object(b1, 'rarely', b2, 'rarely')));
    perform public.feedback_send(t2s, jsonb_build_object('often', jsonb_build_object(b1, 'rarely', b2, 'rarely')));
    perform public.feedback_send(t2e, jsonb_build_object('often', jsonb_build_object(b1, 'sometimes', b2, 'sometimes')));
    perform pg_temp.t_as(sam);
    r := pg_temp.t_n(format('select public.impact_results(%L)', sam))::jsonb;
    f := f || pg_temp.t_near('T41 impact: end minus start (62.5 − 37.5)', (r ->> 'change')::numeric, 25);
    f := f || pg_temp.t_near('T42 impact: against the looking-back rating, same raters and behaviours (75 − 25)', (r ->> 'lookingBackChange')::numeric, 50);
    f := f || pg_temp.t_eq('T43 impact: improved (10 points or more)', r ->> 'improved', 'true');
    perform pg_temp.t_as(sponsor_u);
    f := f || pg_temp.t_eq('T44 impact: not for the sponsor', pg_temp.t_n(format('select public.impact_results(%L)', sam)), 'error 42501');
    perform pg_temp.t_as(lead_u);
    f := f || pg_temp.t_eq('T45 impact: a group under 3 seats doesn''t show it (each person''s is rated by others)', pg_temp.t_n('select public.org_figures() -> ''outcomes'' ->> ''impactPeople'''), 'null');
    perform pg_temp.t_anon();
    f := f || pg_temp.t_eq('T46 signed out reaches no score function', pg_temp.t_n('select public.score_round(1.5)'), 'error 42501');

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
