-- =============================================================================
-- 055_own_questions_test.sql
-- Checks migration 055 (your own questions) for each role: the person, their
-- coach with the 6-digit code, the same coach at password only (aal1),
-- another coach, another client, and someone signed out. Run after 055.
-- Everything it makes is undone at the end, wherever it runs (the SQL editor
-- keeps what a test makes unless the test undoes it: before 23 Nov this test
-- left its four invented people behind, which failed 055_recovery_codes_test's
-- check 12). It ends with "055 CHECKS PASSED", or stops listing what failed.
-- =============================================================================
create or replace function pg_temp.t_as(p uuid, p_aal text default 'aal1') returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated', 'aal', p_aal)::text, true);
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
  insert into auth.users (id, email, aud, role, email_confirmed_at)
  values (u, 'p6a-test-' || p_label || '-' || u || '@example.invalid', 'authenticated', 'authenticated', now());
  return u;
end $f$;
-- One value, or 'error SQLSTATE'.
create or replace function pg_temp.t_n(p_sql text) returns text language plpgsql as $f$
declare v text;
begin
  execute p_sql into v;
  return coalesce(v, 'null');
exception when others then
  return 'error ' || sqlstate;
end $f$;
-- Rows touched, or 'error SQLSTATE'.
create or replace function pg_temp.t_rows(p_sql text) returns text language plpgsql as $f$
declare n bigint;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n::text;
exception when others then
  return 'error ' || sqlstate;
end $f$;
-- 'nothing' when a call is refused or answers nothing (no rows, null,
-- false, an empty list, or a jsonb with nothing in it); otherwise what it gave.
create or replace function pg_temp.t_nothing(p_sql text) returns text language plpgsql as $f$
declare v text; n bigint;
begin
  execute format('select count(*), max(x::text) from (%s) x', p_sql) into n, v;
  if n = 0 or v is null or v in ('(f)', '()', '(null)', '("")', '({})', '([])', '("[]")', '("{}")') then
    return 'nothing';
  end if;
  return 'gave ' || left(v, 80);
exception when others then
  return 'nothing';
end $f$;
create or replace function pg_temp.t_eq(p_name text, p_got text, p_want text) returns text[] language sql as $f$
  select case when p_got is distinct from p_want
              then array[format('%s: expected %s, got %s', p_name, p_want, coalesce(p_got, 'nothing'))]
              else '{}'::text[] end;
$f$;

do $t$
declare
  f text[] := '{}';
  sam uuid; ola uuid; tim_u uuid; maya_u uuid; tim_c uuid; maya_c uuid;
  plan uuid; spr uuid; ola_plan uuid; ola_spr uuid;
  q1 uuid := gen_random_uuid(); q2 uuid := gen_random_uuid(); q3 uuid := gen_random_uuid();
  qd uuid := gen_random_uuid(); qr uuid := gen_random_uuid();
  s1 uuid; s2 uuid; v text;
begin
  begin
  perform pg_temp.t_admin();
  sam := pg_temp.t_user('sam'); ola := pg_temp.t_user('ola');
  tim_u := pg_temp.t_user('tim'); maya_u := pg_temp.t_user('maya');
  insert into public.coaches (user_id, role, display_first_name) values (tim_u, 'owner', 'Tim') returning id into tim_c;
  insert into public.coaches (user_id, role, display_first_name) values (maya_u, 'coach', 'Maya') returning id into maya_c;
  insert into public.coach_clients (client_id, coach_id) values (sam, tim_c), (ola, maya_c);
  insert into public.performance_plans (user_id) values (sam) returning id into plan;
  insert into public.sprints (user_id, plan_id, number, start_on) values (sam, plan, 1, date '2026-11-02') returning id into spr;
  insert into public.performance_plans (user_id) values (ola) returning id into ola_plan;
  insert into public.sprints (user_id, plan_id, number, start_on) values (ola, ola_plan, 1, date '2026-11-02') returning id into ola_spr;

  -- ---------------------------------------------------------------- 1. the person
  perform pg_temp.t_as(sam);
  f := f || pg_temp.t_eq('1a Sam adds a written Daily review question', pg_temp.t_rows(format(
    $q$insert into public.own_questions (id, tool, wording, answer_type, position) values (%L, 'daily_review', 'Where did I lead rather than manage today?', 'written', 1)$q$, q1)), '1');
  f := f || pg_temp.t_eq('1b Sam adds a rating question', pg_temp.t_rows(format(
    $q$insert into public.own_questions (id, tool, wording, answer_type, scale, position) values (%L, 'daily_review', 'How often did I listen before I spoke today?', 'rating', 'often', 2)$q$, qr)), '1');
  f := f || pg_temp.t_eq('1c a third live question in one tool is refused', pg_temp.t_rows(format(
    $q$insert into public.own_questions (id, tool, wording, answer_type, position) values (%L, 'daily_review', 'A third one', 'written', 1)$q$, q3)), 'error 23505');
  f := f || pg_temp.t_eq('1d a place other than 1 or 2 is refused', pg_temp.t_rows(format(
    $q$insert into public.own_questions (id, tool, wording, answer_type, position) values (%L, 'daily_review', 'A third one', 'written', 3)$q$, q3)), 'error 23514');
  f := f || pg_temp.t_eq('1e 121 characters are refused', pg_temp.t_rows(format(
    $q$insert into public.own_questions (tool, wording, answer_type, position) values ('daily_plan', %L, 'written', 1)$q$, repeat('a', 121))), 'error 23514');
  f := f || pg_temp.t_eq('1f 120 characters are kept', pg_temp.t_rows(format(
    $q$insert into public.own_questions (id, tool, wording, answer_type, position) values (%L, 'daily_plan', %L, 'written', 1)$q$, q2, repeat('a', 119) || '?')), '1');
  f := f || pg_temp.t_eq('1g a rating needs its scale', pg_temp.t_rows(
    $q$insert into public.own_questions (tool, wording, answer_type, position) values ('weekly_debrief', 'How good?', 'rating', 1)$q$), 'error 23514');
  f := f || pg_temp.t_eq('1h a yes or no takes no scale', pg_temp.t_rows(
    $q$insert into public.own_questions (tool, wording, answer_type, scale, position) values ('weekly_debrief', 'Did I?', 'yes_no', 'often', 1)$q$), 'error 23514');
  f := f || pg_temp.t_eq('1i Sam adds a debrief yes or no', pg_temp.t_rows(format(
    $q$insert into public.own_questions (id, tool, wording, answer_type, position) values (%L, 'weekly_debrief', 'Did I protect my thinking time this week?', 'yes_no', 1)$q$, qd)), '1');
  -- answers
  f := f || pg_temp.t_eq('1j a written answer for a day', pg_temp.t_rows(format(
    $q$insert into public.own_question_answers (question_id, tool, occasion, on_date, wording, answer_type, written) values (%L, 'daily_review', '2026-11-03', '2026-11-03', 'Where did I lead rather than manage today?', 'written', 'I let Priya run the call.')$q$, q1)), '1');
  f := f || pg_temp.t_eq('1k a rating answer keeps its score', pg_temp.t_rows(format(
    $q$insert into public.own_question_answers (question_id, tool, occasion, on_date, wording, answer_type, scale, rating) values (%L, 'daily_review', '2026-11-03', '2026-11-03', 'How often did I listen before I spoke today?', 'rating', 'often', 4)$q$, qr)), '1');
  f := f || pg_temp.t_eq('1l Often scores 75', pg_temp.t_n(format($q$select score from public.own_question_answers where question_id = %L$q$, qr)), '75');
  f := f || pg_temp.t_eq('1m Never scores 0 and Always 100', pg_temp.t_n(
    $q$select string_agg(((r - 1) * 25)::text, ',' order by r) from generate_series(1, 5) r$q$), '0,25,50,75,100');
  f := f || pg_temp.t_eq('1n the score can''t be written', pg_temp.t_rows(format(
    $q$update public.own_question_answers set score = 100 where question_id = %L$q$, qr)), 'error 428C9');
  f := f || pg_temp.t_eq('1o one answer a question a day', pg_temp.t_rows(format(
    $q$insert into public.own_question_answers (question_id, tool, occasion, on_date, wording, answer_type, written) values (%L, 'daily_review', '2026-11-03', '2026-11-03', 'Where?', 'written', 'Again')$q$, q1)), 'error 23505');
  f := f || pg_temp.t_eq('1p an answer of the wrong kind is refused', pg_temp.t_rows(format(
    $q$insert into public.own_question_answers (question_id, tool, occasion, on_date, wording, answer_type, written) values (%L, 'daily_review', '2026-11-04', '2026-11-04', 'How often?', 'rating', 'Often')$q$, qr)), 'error 23514');
  f := f || pg_temp.t_eq('1q an empty written answer is not kept', pg_temp.t_rows(format(
    $q$insert into public.own_question_answers (question_id, tool, occasion, on_date, wording, answer_type, written) values (%L, 'daily_review', '2026-11-04', '2026-11-04', 'Where?', 'written', '   ')$q$, q1)), 'error 23514');
  f := f || pg_temp.t_eq('1r a debrief answer names its sprint week', pg_temp.t_rows(format(
    $q$insert into public.own_question_answers (question_id, tool, occasion, sprint_id, week, wording, answer_type, yes_no) values (%L, 'weekly_debrief', %L, %L, 1, 'Did I protect my thinking time this week?', 'yes_no', true)$q$, qd, spr::text || ':1', spr)), '1');
  f := f || pg_temp.t_eq('1s an answer filed under another tool is refused', pg_temp.t_rows(format(
    $q$insert into public.own_question_answers (question_id, tool, occasion, on_date, wording, answer_type, yes_no) values (%L, 'daily_plan', '2026-11-04', '2026-11-04', 'Did I?', 'yes_no', true)$q$, qd)), 'error 42501');
  f := f || pg_temp.t_eq('1t a debrief answer for another person''s sprint is refused', pg_temp.t_rows(format(
    $q$insert into public.own_question_answers (question_id, tool, occasion, sprint_id, week, wording, answer_type, yes_no) values (%L, 'weekly_debrief', %L, %L, 2, 'Did I?', 'yes_no', true)$q$, qd, ola_spr::text || ':2', ola_spr)), 'error 42501');
  -- editing never rewrites past answers
  f := f || pg_temp.t_eq('1u Sam edits the wording', pg_temp.t_rows(format(
    $q$update public.own_questions set wording = 'Where did I lead today?' where id = %L$q$, q1)), '1');
  f := f || pg_temp.t_eq('1v the past answer keeps the words it was given to', pg_temp.t_n(format(
    $q$select wording from public.own_question_answers where question_id = %L$q$, q1)), 'Where did I lead rather than manage today?');
  f := f || pg_temp.t_eq('1w a question can''t move to another tool', pg_temp.t_rows(format(
    $q$update public.own_questions set tool = 'daily_plan' where id = %L$q$, q1)), 'error 42501');
  -- delete with Undo
  f := f || pg_temp.t_eq('1x deleting frees its place', pg_temp.t_rows(format(
    $q$update public.own_questions set deleted_at = now() where id = %L$q$, q1)), '1');
  f := f || pg_temp.t_eq('1y the past answer stays after the delete', pg_temp.t_n(format(
    $q$select count(*) from public.own_question_answers where question_id = %L$q$, q1)), '1');
  f := f || pg_temp.t_eq('1z Undo brings it back', pg_temp.t_rows(format(
    $q$update public.own_questions set deleted_at = null where id = %L$q$, q1)), '1');

  -- ---------------------------------------------------------------- 2. someone else, and signed out
  perform pg_temp.t_as(ola);
  f := f || pg_temp.t_eq('2a another client reads none of Sam''s questions', pg_temp.t_nothing('select id from public.own_questions'), 'nothing');
  f := f || pg_temp.t_eq('2b another client reads none of Sam''s answers', pg_temp.t_nothing('select id from public.own_question_answers'), 'nothing');
  f := f || pg_temp.t_eq('2c another client can''t write Sam''s question', pg_temp.t_rows(format(
    $q$insert into public.own_questions (user_id, tool, wording, answer_type, position) values (%L, 'daily_plan', 'Mine now', 'written', 2)$q$, sam)), 'error 42501');
  f := f || pg_temp.t_eq('2d another client changes nothing of Sam''s', pg_temp.t_rows(format(
    $q$update public.own_questions set wording = 'Changed' where id = %L$q$, q1)), '0');
  f := f || pg_temp.t_eq('2e another client can''t answer Sam''s question', pg_temp.t_rows(format(
    $q$insert into public.own_question_answers (question_id, tool, occasion, on_date, wording, answer_type, written) values (%L, 'daily_review', '2026-11-05', '2026-11-05', 'Where?', 'written', 'Me')$q$, q1)), 'error 42501');
  f := f || pg_temp.t_eq('2f a client can''t suggest a question', pg_temp.t_n(format(
    $q$select public.own_question_suggest(%L, 'daily_review', 'Hello?', 'written')$q$, sam)), 'error 42501');
  f := f || pg_temp.t_eq('2g a client can''t write a suggestion directly', pg_temp.t_rows(format(
    $q$insert into public.own_question_suggestions (user_id, coach_user_id, coach_first_name, tool, wording, answer_type) values (%L, %L, 'Tim', 'daily_review', 'Fake?', 'written')$q$, ola, tim_u)), 'error 42501');
  perform pg_temp.t_anon();
  f := f || pg_temp.t_eq('2h signed out reads no questions', pg_temp.t_n('select count(*) from public.own_questions'), 'error 42501');
  f := f || pg_temp.t_eq('2i signed out reads no answers', pg_temp.t_n('select count(*) from public.own_question_answers'), 'error 42501');
  f := f || pg_temp.t_eq('2j signed out can''t suggest', pg_temp.t_n(format(
    $q$select public.own_question_suggest(%L, 'daily_review', 'Hello?', 'written')$q$, sam)), 'error 42501');

  -- ---------------------------------------------------------------- 3. Sam's coach
  -- Nothing shared yet: the coach reads nothing, the Daily review never.
  perform pg_temp.t_as(tim_u, 'aal2');
  f := f || pg_temp.t_eq('3a the coach reads no daily questions', pg_temp.t_nothing(
    $q$select id from public.own_questions where tool <> 'weekly_debrief'$q$), 'nothing');
  f := f || pg_temp.t_eq('3b with no week shared, no debrief questions either', pg_temp.t_nothing('select id from public.own_questions'), 'nothing');
  perform pg_temp.t_admin();
  insert into public.weekly_debriefs (user_id, sprint_id, sprint_week, shared_with_coach) values (sam, spr, 1, true);
  insert into public.weekly_debriefs (user_id, sprint_id, sprint_week, shared_with_coach) values (sam, spr, 2, false);
  perform pg_temp.t_as(sam);
  perform pg_temp.t_rows(format(
    $q$insert into public.own_question_answers (question_id, tool, occasion, sprint_id, week, wording, answer_type, yes_no) values (%L, 'weekly_debrief', %L, %L, 2, 'Did I protect my thinking time this week?', 'yes_no', false)$q$, qd, spr::text || ':2', spr));
  perform pg_temp.t_as(tim_u, 'aal2');
  f := f || pg_temp.t_eq('3c a shared week: the coach reads the debrief question', pg_temp.t_n('select count(*) from public.own_questions'), '1');
  f := f || pg_temp.t_eq('3d ... and only the shared week''s answer', pg_temp.t_n('select string_agg(week::text, '','') from public.own_question_answers'), '1');
  f := f || pg_temp.t_eq('3e never a Daily review answer', pg_temp.t_n($q$select count(*) from public.own_question_answers where tool = 'daily_review'$q$), '0');
  f := f || pg_temp.t_eq('3f the coach can''t change the client''s question', pg_temp.t_rows(format(
    $q$update public.own_questions set wording = 'Coach words' where id = %L$q$, qd)), '0');
  f := f || pg_temp.t_eq('3g the coach can''t answer for the client', pg_temp.t_rows(format(
    $q$insert into public.own_question_answers (user_id, question_id, tool, occasion, sprint_id, week, wording, answer_type, yes_no) values (%L, %L, 'weekly_debrief', %L, %L, 3, 'Did I?', 'yes_no', true)$q$, sam, qd, spr::text || ':3', spr)), 'error 42501');
  -- suggesting
  s1 := pg_temp.t_n(format($q$select public.own_question_suggest(%L, 'daily_review', ' What did I notice in myself when the pressure rose today? ', 'written')$q$, sam))::uuid;
  f := f || pg_temp.t_eq('3h the coach suggests to their own client', (s1 is not null)::text, 'true');
  f := f || pg_temp.t_eq('3i the coach never reads a suggestion back', pg_temp.t_nothing('select id from public.own_question_suggestions'), 'nothing');
  f := f || pg_temp.t_eq('3j the coach can''t suggest to someone else''s client', pg_temp.t_n(format(
    $q$select public.own_question_suggest(%L, 'daily_review', 'Hello?', 'written')$q$, ola)), 'error 42501');
  f := f || pg_temp.t_eq('3k 121 characters are refused', pg_temp.t_n(format(
    $q$select public.own_question_suggest(%L, 'daily_review', %L, 'written')$q$, sam, repeat('b', 121))), 'error 22001');
  f := f || pg_temp.t_eq('3l an empty suggestion is refused', pg_temp.t_n(format(
    $q$select public.own_question_suggest(%L, 'daily_review', '  ', 'written')$q$, sam)), 'error 22023');
  -- at password only
  perform pg_temp.t_as(tim_u, 'aal1');
  f := f || pg_temp.t_eq('3m at password only: no debrief question', pg_temp.t_nothing('select id from public.own_questions'), 'nothing');
  f := f || pg_temp.t_eq('3n at password only: no answer', pg_temp.t_nothing('select id from public.own_question_answers'), 'nothing');
  f := f || pg_temp.t_eq('3o at password only: no suggestion', pg_temp.t_n(format(
    $q$select public.own_question_suggest(%L, 'daily_review', 'Hello?', 'written')$q$, sam)), 'error 42501');
  -- another coach
  perform pg_temp.t_as(maya_u, 'aal2');
  f := f || pg_temp.t_eq('3p another coach reads none of Sam''s', pg_temp.t_nothing('select id from public.own_questions where user_id <> (select auth.uid())'), 'nothing');
  f := f || pg_temp.t_eq('3q another coach can''t suggest to Sam', pg_temp.t_n(format(
    $q$select public.own_question_suggest(%L, 'daily_review', 'Hello?', 'written')$q$, sam)), 'error 42501');

  -- ---------------------------------------------------------------- 4. Sam's choice
  perform pg_temp.t_as(sam);
  f := f || pg_temp.t_eq('4a Sam sees the suggestion, trimmed, with Tim''s name from the data', pg_temp.t_n(
    $q$select coach_first_name || ': ' || wording || ' (' || status || ')' from public.own_question_suggestions$q$),
    'Tim: What did I notice in myself when the pressure rose today? (waiting)');
  f := f || pg_temp.t_eq('4b Sam can''t change its words', pg_temp.t_rows(format(
    $q$update public.own_question_suggestions set wording = 'Other' where id = %L$q$, s1)), 'error 42501');
  f := f || pg_temp.t_eq('4c Home marks it seen', pg_temp.t_rows(format(
    $q$update public.own_question_suggestions set home_seen_at = now() where id = %L$q$, s1)), '1');
  f := f || pg_temp.t_eq('4d Not now', pg_temp.t_rows(format(
    $q$update public.own_question_suggestions set status = 'not_now' where id = %L$q$, s1)), '1');
  f := f || pg_temp.t_eq('4e decided once', pg_temp.t_rows(format(
    $q$update public.own_question_suggestions set status = 'added' where id = %L$q$, s1)), 'error CC409');
  f := f || pg_temp.t_eq('4f Sam can''t mark one replaced', pg_temp.t_rows(
    $q$update public.own_question_suggestions set status = 'replaced'$q$), 'error CC409');
  perform pg_temp.t_as(tim_u, 'aal2');
  s1 := pg_temp.t_n(format($q$select public.own_question_suggest(%L, 'weekly_debrief', 'How good was my focus?', 'rating', 'good')$q$, sam))::uuid;
  s2 := pg_temp.t_n(format($q$select public.own_question_suggest(%L, 'weekly_debrief', 'How much did I enjoy it?', 'rating', 'much')$q$, sam))::uuid;
  perform pg_temp.t_as(sam);
  f := f || pg_temp.t_eq('4g a newer suggestion for the same tool replaces the waiting one', pg_temp.t_n(
    $q$select string_agg(scale || ' ' || status, ', ' order by created_at, scale) from public.own_question_suggestions where tool = 'weekly_debrief'$q$),
    'good replaced, much waiting');
  f := f || pg_temp.t_eq('4h Add it', pg_temp.t_rows(format(
    $q$update public.own_question_suggestions set status = 'added' where id = %L$q$, s2)), '1');
  f := f || pg_temp.t_eq('4i decided_at is set by the database', pg_temp.t_n(format(
    $q$select (decided_at is not null)::text from public.own_question_suggestions where id = %L$q$, s2)), 'true');
  perform pg_temp.t_as(ola);
  f := f || pg_temp.t_eq('4j another client reads no suggestion of Sam''s', pg_temp.t_nothing('select id from public.own_question_suggestions'), 'nothing');

  -- ---------------------------------------------------------------- 5. the code rule is on every table
  perform pg_temp.t_admin();
  f := f || pg_temp.t_eq('5a 054''s code rule on all three tables', pg_temp.t_n(
    $q$select count(*) from pg_policies where schemaname = 'public' and policyname = 'Coach data: needs the 6-digit code'
         and tablename in ('own_questions', 'own_question_answers', 'own_question_suggestions')$q$), '3');
  f := f || pg_temp.t_eq('5b recorded in the migration log', pg_temp.t_n(
    $q$select count(*) from public.migration_log where name = '055_own_questions'$q$), '1');

    perform pg_temp.t_admin();
    raise exception 'undo the test rows' using errcode = 'P0055';
  exception when sqlstate 'P0055' then
    perform pg_temp.t_admin();
  end;
  f := f || pg_temp.t_eq('5c everything the test made is undone',
    (select count(*)::text from auth.users where email like 'p6a-test-%@example.invalid' and id in (sam, ola, tim_u, maya_u)), '0');

  if array_length(f, 1) > 0 then
    raise exception 'FAILED (% of the checks): %', array_length(f, 1), array_to_string(f, ' | ');
  end if;
  raise notice '055 CHECKS PASSED';
end
$t$;
