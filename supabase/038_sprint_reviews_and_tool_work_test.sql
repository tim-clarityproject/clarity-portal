-- =============================================================================
-- 038_sprint_reviews_and_tool_work_test.sql
-- Checks 038_sprint_reviews_and_tool_work.sql. RUN ORDER: 026 to 028, 038, then this.
--
-- WHAT IT DOES
--   Makes two invented people, each with a plan, a Strategy, a sprint, a
--   decision tool's row and a journal entry, and checks:
--     1. the tables are there, locked down (row security on, nothing for
--        someone signed out) and the migration recorded itself;
--     2. sprint_reviews: one per sprint, the 4000-character limits, the two
--        next choices, updated_at kept by the database, own rows only, and
--        nobody can write a review for someone else's sprint;
--     3. tool_work_strategies: exactly one item, the sprint and week
--        together, once per item and Strategy, own rows only, nobody can
--        link someone else's decision, entry, Strategy or sprint, and the
--        link goes with its item, and keeps going without its sprint.
--   Everything it makes is undone at the end.
--
--   It ends with the notice 038 CHECKS PASSED, or stops with FAILED and a
--   list naming each check that failed.
-- =============================================================================

-- ---------------------------------------------------------------- helpers
-- Temporary (this session only), as in the earlier tests: t_as acts as a
-- signed-in person, t_anon as someone signed out, t_admin goes back to the
-- admin role; t_n and t_rows return 'error <code>' instead of stopping
-- (42501 refused, 23505 a second copy, 23514 a check).
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
  values (u, 'p3-test-' || p_label || '-' || u || '@example.invalid', 'authenticated', 'authenticated');
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

do $t$
declare
  f text[] := '{}';
  a uuid; b uuid;
  plan_a uuid; plan_b uuid;
  st_a uuid; st_a2 uuid; st_b uuid;
  spr_a uuid; spr_b uuid;
  dec_a uuid; dec_b uuid; dec_a2 uuid;
  je_a uuid; je_b uuid;
  rev_a uuid;
  before_at timestamptz;
  link_a uuid;
begin
  -- 1. The tables, locked down, and the log.
  f := f || pg_temp.t_eq('1a sprint_reviews has row security', (select relrowsecurity::text from pg_class where oid = 'public.sprint_reviews'::regclass), 'true');
  f := f || pg_temp.t_eq('1b tool_work_strategies has row security', (select relrowsecurity::text from pg_class where oid = 'public.tool_work_strategies'::regclass), 'true');
  f := f || pg_temp.t_eq('1c nothing for someone signed out', (select count(*)::text from information_schema.role_table_grants where grantee in ('anon', 'public') and table_name in ('sprint_reviews', 'tool_work_strategies')), '0');
  f := f || pg_temp.t_eq('1d four rules on each, own rows only', (select count(*)::text from pg_policies where tablename in ('sprint_reviews', 'tool_work_strategies') and qual is distinct from null and qual not like '%auth.uid()%'), '0');
  f := f || pg_temp.t_eq('1e ... and there are eight', (select count(*)::text from pg_policies where tablename in ('sprint_reviews', 'tool_work_strategies')), '8');
  f := f || pg_temp.t_eq('1f the sprint-gone function can''t be called by people', (select has_function_privilege('authenticated', 'public.tool_work_sprint_gone()', 'execute')::text), 'false');
  if to_regclass('public.migration_log') is not null then
    f := f || pg_temp.t_eq('1g the migration recorded itself', (select count(*)::text from public.migration_log where number = 38 and name = '038_sprint_reviews_and_tool_work'), '1');
  end if;

  begin
    a := pg_temp.t_user('ada');
    b := pg_temp.t_user('ben');
    insert into public.performance_plans (user_id) values (a) returning id into plan_a;
    insert into public.performance_plans (user_id) values (b) returning id into plan_b;
    insert into public.plan_strategies (user_id, plan_id, name) values (a, plan_a, 'Grow through referrals') returning id into st_a;
    insert into public.plan_strategies (user_id, plan_id, name) values (a, plan_a, 'Protect my energy') returning id into st_a2;
    insert into public.plan_strategies (user_id, plan_id, name) values (b, plan_b, 'Ship the new course') returning id into st_b;
    insert into public.sprints (user_id, plan_id, number, start_on, status) values (a, plan_a, 1, date '2026-09-28', 'finished') returning id into spr_a;
    insert into public.sprints (user_id, plan_id, number, start_on, status) values (b, plan_b, 1, date '2026-09-28', 'finished') returning id into spr_b;
    insert into public.decisions (user_id, tool_type, title) values (a, 'grow', 'Invented decision') returning id into dec_a;
    insert into public.decisions (user_id, tool_type, title) values (a, 'plan_meeting', 'Invented meeting') returning id into dec_a2;
    insert into public.decisions (user_id, tool_type, title) values (b, 'grow', 'Someone else''s decision') returning id into dec_b;
    insert into public.journal_entries (user_id, entry_date, review_type, content) values (a, date '2026-10-21', 'after-action', 'Invented review') returning id into je_a;
    insert into public.journal_entries (user_id, entry_date, review_type, content) values (b, date '2026-10-21', 'after-action', 'Someone else''s review') returning id into je_b;

    -- 2. sprint_reviews
    perform pg_temp.t_as(a);
    f := f || pg_temp.t_eq('2a a review of my own sprint', pg_temp.t_rows(format('insert into public.sprint_reviews (user_id, sprint_id, worked_best, next_better, next_choice) values (%L, %L, ''Morning blocks'', ''Fewer evening calls'', ''sprint'')', a, spr_a)), '1');
    select id, updated_at into rev_a, before_at from public.sprint_reviews where sprint_id = spr_a;
    f := f || pg_temp.t_eq('2b one review per sprint', pg_temp.t_rows(format('insert into public.sprint_reviews (user_id, sprint_id) values (%L, %L)', a, spr_a)), 'error 23505');
    f := f || pg_temp.t_eq('2c 4000 characters is fine', pg_temp.t_rows(format('update public.sprint_reviews set worked_best = repeat(''x'', 4000) where id = %L', rev_a)), '1');
    f := f || pg_temp.t_eq('2d 4001 is refused (what worked best)', pg_temp.t_rows(format('update public.sprint_reviews set worked_best = repeat(''x'', 4001) where id = %L', rev_a)), 'error 23514');
    f := f || pg_temp.t_eq('2e 4001 is refused (what to do better)', pg_temp.t_rows(format('update public.sprint_reviews set next_better = repeat(''x'', 4001) where id = %L', rev_a)), 'error 23514');
    f := f || pg_temp.t_eq('2f Recovery first is a choice', pg_temp.t_rows(format('update public.sprint_reviews set next_choice = ''recovery'', finished_at = now() where id = %L', rev_a)), '1');
    f := f || pg_temp.t_eq('2g anything else is not', pg_temp.t_rows(format('update public.sprint_reviews set next_choice = ''holiday'' where id = %L', rev_a)), 'error 23514');
    f := f || pg_temp.t_eq('2h the database moves updated_at on (the save-version guard compares it)', pg_temp.t_n(format('select (updated_at >= %L)::text from public.sprint_reviews where id = %L', before_at, rev_a)), 'true');
    f := f || pg_temp.t_eq('2i a review of someone else''s sprint is refused', pg_temp.t_rows(format('insert into public.sprint_reviews (user_id, sprint_id) values (%L, %L)', a, spr_b)), 'error 42501');
    f := f || pg_temp.t_eq('2j a review written as someone else is refused', pg_temp.t_rows(format('insert into public.sprint_reviews (user_id, sprint_id) values (%L, %L)', b, spr_b)), 'error 42501');
    -- The app's own statements (PostgREST's upsert): saving the review
    -- again writes over it; moving a device copy never does.
    f := f || pg_temp.t_eq('2p the app''s save: a second save of the same sprint writes over it', pg_temp.t_rows(format('insert into public.sprint_reviews (user_id, sprint_id, worked_best, next_choice) values (%L, %L, ''Saved again'', ''sprint'') on conflict (sprint_id) do update set worked_best = excluded.worked_best, next_choice = excluded.next_choice', a, spr_a)), '1');
    f := f || pg_temp.t_eq('2q ... and it is one row', pg_temp.t_n(format('select count(*)::text || '' '' || min(worked_best) from public.sprint_reviews where sprint_id = %L', spr_a)), '1 Saved again');
    f := f || pg_temp.t_eq('2r moving a device copy across never writes over a saved answer', pg_temp.t_rows(format('insert into public.sprint_reviews (user_id, sprint_id, worked_best) values (%L, %L, ''From the device'') on conflict (sprint_id) do nothing', a, spr_a)), '0');
    perform pg_temp.t_as(b);
    f := f || pg_temp.t_eq('2k someone else can''t read it', pg_temp.t_n('select count(*)::text from public.sprint_reviews'), '0');
    f := f || pg_temp.t_eq('2l ... or change it', pg_temp.t_rows(format('update public.sprint_reviews set worked_best = ''Changed'' where id = %L', rev_a)), '0');
    f := f || pg_temp.t_eq('2m ... or remove it', pg_temp.t_rows(format('delete from public.sprint_reviews where id = %L', rev_a)), '0');
    f := f || pg_temp.t_eq('2n ... or move it to themselves', pg_temp.t_rows(format('update public.sprint_reviews set user_id = %L where id = %L', b, rev_a)), '0');
    perform pg_temp.t_anon();
    f := f || pg_temp.t_eq('2o signed out: nothing', pg_temp.t_n('select count(*)::text from public.sprint_reviews'), 'error 42501');

    -- 3. tool_work_strategies
    perform pg_temp.t_as(a);
    f := f || pg_temp.t_eq('3a my decision tagged to my Strategy, in sprint 1 week 4', pg_temp.t_rows(format('insert into public.tool_work_strategies (user_id, decision_id, strategy_id, sprint_id, sprint_week, linked_on) values (%L, %L, %L, %L, 4, date ''2026-10-21'')', a, dec_a, st_a, spr_a)), '1');
    select id into link_a from public.tool_work_strategies where decision_id = dec_a;
    f := f || pg_temp.t_eq('3a2 the app''s second tag of the same item and Strategy does nothing', pg_temp.t_rows(format('insert into public.tool_work_strategies (user_id, decision_id, strategy_id, linked_on) values (%L, %L, %L, current_date) on conflict (decision_id, strategy_id) do nothing', a, dec_a, st_a)), '0');
    f := f || pg_temp.t_eq('3b the same item and Strategy only once', pg_temp.t_rows(format('insert into public.tool_work_strategies (user_id, decision_id, strategy_id, linked_on) values (%L, %L, %L, current_date)', a, dec_a, st_a)), 'error 23505');
    f := f || pg_temp.t_eq('3c the same item to another Strategy is fine', pg_temp.t_rows(format('insert into public.tool_work_strategies (user_id, decision_id, strategy_id, linked_on) values (%L, %L, %L, current_date)', a, dec_a, st_a2)), '1');
    f := f || pg_temp.t_eq('3d a review (journal entry) tagged', pg_temp.t_rows(format('insert into public.tool_work_strategies (user_id, journal_entry_id, strategy_id, linked_on) values (%L, %L, %L, current_date)', a, je_a, st_a)), '1');
    f := f || pg_temp.t_eq('3e ... once', pg_temp.t_rows(format('insert into public.tool_work_strategies (user_id, journal_entry_id, strategy_id, linked_on) values (%L, %L, %L, current_date)', a, je_a, st_a)), 'error 23505');
    f := f || pg_temp.t_eq('3f both a decision and an entry is refused', pg_temp.t_rows(format('insert into public.tool_work_strategies (user_id, decision_id, journal_entry_id, strategy_id, linked_on) values (%L, %L, %L, %L, current_date)', a, dec_a2, je_a, st_a2)), 'error 23514');
    f := f || pg_temp.t_eq('3g neither is refused', pg_temp.t_rows(format('insert into public.tool_work_strategies (user_id, strategy_id, linked_on) values (%L, %L, current_date)', a, st_a)), 'error 23514');
    f := f || pg_temp.t_eq('3h a sprint without its week is refused', pg_temp.t_rows(format('insert into public.tool_work_strategies (user_id, decision_id, strategy_id, sprint_id, linked_on) values (%L, %L, %L, %L, current_date)', a, dec_a2, st_a, spr_a)), 'error 23514');
    f := f || pg_temp.t_eq('3i a week without its sprint is refused', pg_temp.t_rows(format('insert into public.tool_work_strategies (user_id, decision_id, strategy_id, sprint_week, linked_on) values (%L, %L, %L, 2, current_date)', a, dec_a2, st_a)), 'error 23514');
    f := f || pg_temp.t_eq('3j week 0 is refused', pg_temp.t_rows(format('insert into public.tool_work_strategies (user_id, decision_id, strategy_id, sprint_id, sprint_week, linked_on) values (%L, %L, %L, %L, 0, current_date)', a, dec_a2, st_a, spr_a)), 'error 23514');
    f := f || pg_temp.t_eq('3k someone else''s decision can''t be linked', pg_temp.t_rows(format('insert into public.tool_work_strategies (user_id, decision_id, strategy_id, linked_on) values (%L, %L, %L, current_date)', a, dec_b, st_a)), 'error 42501');
    f := f || pg_temp.t_eq('3l someone else''s journal entry can''t be linked', pg_temp.t_rows(format('insert into public.tool_work_strategies (user_id, journal_entry_id, strategy_id, linked_on) values (%L, %L, %L, current_date)', a, je_b, st_a)), 'error 42501');
    f := f || pg_temp.t_eq('3m nor to someone else''s Strategy', pg_temp.t_rows(format('insert into public.tool_work_strategies (user_id, decision_id, strategy_id, linked_on) values (%L, %L, %L, current_date)', a, dec_a2, st_b)), 'error 42501');
    f := f || pg_temp.t_eq('3n nor in someone else''s sprint', pg_temp.t_rows(format('insert into public.tool_work_strategies (user_id, decision_id, strategy_id, sprint_id, sprint_week, linked_on) values (%L, %L, %L, %L, 1, current_date)', a, dec_a2, st_a, spr_b)), 'error 42501');
    f := f || pg_temp.t_eq('3o nor moved onto someone else''s decision', pg_temp.t_rows(format('update public.tool_work_strategies set decision_id = %L where id = %L', dec_b, link_a)), 'error 42501');
    f := f || pg_temp.t_eq('3p nor written as someone else', pg_temp.t_rows(format('insert into public.tool_work_strategies (user_id, decision_id, strategy_id, linked_on) values (%L, %L, %L, current_date)', b, dec_b, st_b)), 'error 42501');
    f := f || pg_temp.t_eq('3q my meeting plan tagged too', pg_temp.t_rows(format('insert into public.tool_work_strategies (user_id, decision_id, strategy_id, linked_on) values (%L, %L, %L, current_date)', a, dec_a2, st_a)), '1');
    f := f || pg_temp.t_eq('3q2 moving it to another Strategy of mine is fine', pg_temp.t_rows(format('update public.tool_work_strategies set strategy_id = %L where decision_id = %L and strategy_id = %L', st_a2, dec_a2, st_a)), '1');
    perform pg_temp.t_as(b);
    f := f || pg_temp.t_eq('3r someone else can''t read my links', pg_temp.t_n('select count(*)::text from public.tool_work_strategies'), '0');
    f := f || pg_temp.t_eq('3s ... or remove them', pg_temp.t_rows(format('delete from public.tool_work_strategies where id = %L', link_a)), '0');
    perform pg_temp.t_anon();
    f := f || pg_temp.t_eq('3t signed out: nothing', pg_temp.t_n('select count(*)::text from public.tool_work_strategies'), 'error 42501');
    perform pg_temp.t_as(a);
    f := f || pg_temp.t_eq('3u I can remove my own link', pg_temp.t_rows(format('delete from public.tool_work_strategies where decision_id = %L and strategy_id = %L', dec_a, st_a2)), '1');

    -- The link goes with its item, and stays without its sprint.
    perform pg_temp.t_admin();
    delete from public.decisions where id = dec_a2;
    delete from public.sprints where id = spr_a;
    f := f || pg_temp.t_eq('3v a sprint taken away: the link stays, without sprint or week', (select coalesce(sprint_id::text, 'none') || ' ' || coalesce(sprint_week::text, 'none') from public.tool_work_strategies where id = link_a), 'none none');
    f := f || pg_temp.t_eq('3w ... and its review goes with it', (select count(*)::text from public.sprint_reviews where id = rev_a), '0');
    delete from public.decisions where id = dec_a;
    f := f || pg_temp.t_eq('3x a decision taken away takes its links', (select count(*)::text from public.tool_work_strategies where decision_id = dec_a or id = link_a), '0');
    delete from public.journal_entries where id = je_a;
    f := f || pg_temp.t_eq('3y a journal entry taken away takes its links', (select count(*)::text from public.tool_work_strategies where journal_entry_id = je_a), '0');

    raise exception using errcode = 'TT001', message = 'undo the test';
  exception when sqlstate 'TT001' then null;
  end;
  perform pg_temp.t_admin();
  if cardinality(f) > 0 then
    raise exception 'FAILED (% of the checks): %', cardinality(f), array_to_string(f, ' | ');
  end if;
  raise notice '038 CHECKS PASSED';
end
$t$;
