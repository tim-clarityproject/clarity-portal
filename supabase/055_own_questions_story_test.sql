-- =============================================================================
-- 055_own_questions_story_test.sql
-- A week told as a story, on top of 055_own_questions.sql (Phase 6a run 7,
-- the functionality tester). RUN ORDER: 026 to 054, then 055, then this.
-- Safe to run again: everything it makes is undone at the end.
--
-- THE STORY (invented people only; sprint 1 starts Monday 2 Nov 2026, so
-- week 3 is Monday 16 to Friday 20 Nov)
--   A. Sam sets up his own questions in all three tools: a written one in
--      the Daily plan, a yes or no and a rating (How often) in the Daily
--      review, a rating (How good) in the weekly debrief. He answers them
--      each working day (skipping some), and once on the Saturday; then the
--      debrief, which he shares with Tim for week 3 only. Every rating keeps
--      its score 0, 25, 50, 75 or 100, and nobody can write it.
--      Tim, his coach, with the code, reads the debrief question and week
--      3's answer, never week 2's (not shared), never a Daily plan or
--      review question or answer; at password only, nothing. When Sam turns
--      the week's switch off, Tim reads nothing again.
--   B. Tim suggests a Daily review question while Sam's Daily review is
--      full. Sam reads it with Tim's name from the data; Home marks it seen
--      once. He Replaces his yes or no question with it: the old one is
--      deleted first (a third live question is refused), its past answers
--      stay. A second suggestion, for the debrief, Sam declines with Not
--      now: Tim can't read that choice, and it can't be undone or redone.
--      A newer one for the same tool takes a waiting one's place.
--   C. On Wednesday Sam edits his Daily plan question's words, and on
--      Thursday his rating's scale: Monday's and Tuesday's answers keep the
--      words, kind and scale they were given under.
--   D. Ola has no own questions: none of the three tables holds anything of
--      hers, her debrief saves and shares with Maya as before, and Maya
--      reads nothing of Sam's.
--
--   It ends with the notice 055 STORY PASSED, or stops with FAILED and a
--   list naming each step that failed.
-- =============================================================================
create or replace function pg_temp.s_as(p uuid, p_aal text default 'aal1') returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated', 'aal', p_aal)::text, true);
  perform set_config('role', 'authenticated', true);
end $f$;
create or replace function pg_temp.s_admin() returns void language plpgsql as $f$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
end $f$;
create or replace function pg_temp.s_user(p_label text) returns uuid language plpgsql as $f$
declare u uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, aud, role, email_confirmed_at)
  values (u, 'p6a-story55-' || p_label || '-' || u || '@example.invalid', 'authenticated', 'authenticated', now());
  return u;
end $f$;
-- One value, or 'error SQLSTATE'.
create or replace function pg_temp.s_n(p_sql text) returns text language plpgsql as $f$
declare v text;
begin
  execute p_sql into v;
  return coalesce(v, 'null');
exception when others then
  return 'error ' || sqlstate;
end $f$;
-- Rows touched, or 'error SQLSTATE'.
create or replace function pg_temp.s_rows(p_sql text) returns text language plpgsql as $f$
declare n bigint;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n::text;
exception when others then
  return 'error ' || sqlstate;
end $f$;
-- 'nothing' when a call is refused or answers nothing; otherwise what it gave.
create or replace function pg_temp.s_nothing(p_sql text) returns text language plpgsql as $f$
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
create or replace function pg_temp.s_eq(p_name text, p_got text, p_want text) returns text[] language sql as $f$
  select case when p_got is distinct from p_want
              then array[format('%s: expected %s, got %s', p_name, p_want, coalesce(p_got, 'nothing'))]
              else '{}'::text[] end;
$f$;
-- One day's answer, as the app sends it (on_date and occasion the same day).
create or replace function pg_temp.s_day(p_q uuid, p_tool text, p_day date, p_wording text, p_type text, p_scale text,
                                         p_written text, p_yes boolean, p_rating int) returns text language sql as $f$
  select pg_temp.s_rows(format(
    $q$insert into public.own_question_answers (question_id, tool, occasion, on_date, wording, answer_type, scale, written, yes_no, rating)
       values (%L, %L, %L, %L, %L, %L, %L, %L, %L, %L)$q$,
    p_q, p_tool, to_char(p_day, 'YYYY-MM-DD'), p_day, p_wording, p_type, p_scale, p_written, p_yes, p_rating));
$f$;

do $s$
declare
  f text[] := '{}';
  sam uuid; ola uuid; tim_u uuid; maya_u uuid; tim_c uuid; maya_c uuid;
  plan uuid; spr uuid; ola_plan uuid; ola_spr uuid;
  q_plan uuid := gen_random_uuid(); q_yes uuid := gen_random_uuid(); q_rate uuid := gen_random_uuid();
  q_deb uuid := gen_random_uuid(); q_new uuid := gen_random_uuid();
  s1 uuid; s2 uuid; s3 uuid; s4 uuid;
  w_plan text := 'What would make today a win?';
  w_plan2 text := 'What one thing would make today a win?';
  w_yes text := 'Did I take a real break today?';
  w_rate text := 'How often did I listen before I spoke today?';
  w_deb text := 'How good was my focus this week?';
  d date;
  i int;
begin
  begin
    -- ---------------------------------------------------------------- the people
    perform pg_temp.s_admin();
    sam := pg_temp.s_user('sam'); ola := pg_temp.s_user('ola');
    tim_u := pg_temp.s_user('tim'); maya_u := pg_temp.s_user('maya');
    insert into public.coaches (user_id, role, display_first_name) values (tim_u, 'owner', 'Tim') returning id into tim_c;
    insert into public.coaches (user_id, role, display_first_name) values (maya_u, 'coach', 'Maya') returning id into maya_c;
    insert into public.coach_clients (client_id, coach_id) values (sam, tim_c), (ola, maya_c);
    insert into public.performance_plans (user_id) values (sam) returning id into plan;
    insert into public.sprints (user_id, plan_id, number, start_on) values (sam, plan, 1, date '2026-11-02') returning id into spr;
    insert into public.performance_plans (user_id) values (ola) returning id into ola_plan;
    insert into public.sprints (user_id, plan_id, number, start_on) values (ola, ola_plan, 1, date '2026-11-02') returning id into ola_spr;

    -- ================================================================ A. Sam's week
    perform pg_temp.s_as(sam);
    f := f || pg_temp.s_eq('A1 Sam starts with no own questions', pg_temp.s_n('select count(*) from public.own_questions'), '0');
    f := f || pg_temp.s_eq('A2 a written Daily plan question', pg_temp.s_rows(format(
      $q$insert into public.own_questions (id, tool, wording, answer_type, position) values (%L, 'daily_plan', %L, 'written', 1)$q$, q_plan, w_plan)), '1');
    f := f || pg_temp.s_eq('A3 a yes or no Daily review question', pg_temp.s_rows(format(
      $q$insert into public.own_questions (id, tool, wording, answer_type, position) values (%L, 'daily_review', %L, 'yes_no', 1)$q$, q_yes, w_yes)), '1');
    f := f || pg_temp.s_eq('A4 a rating Daily review question (How often)', pg_temp.s_rows(format(
      $q$insert into public.own_questions (id, tool, wording, answer_type, scale, position) values (%L, 'daily_review', %L, 'rating', 'often', 2)$q$, q_rate, w_rate)), '1');
    f := f || pg_temp.s_eq('A5 a rating debrief question (How good)', pg_temp.s_rows(format(
      $q$insert into public.own_questions (id, tool, wording, answer_type, scale, position) values (%L, 'weekly_debrief', %L, 'rating', 'good', 1)$q$, q_deb, w_deb)), '1');
    f := f || pg_temp.s_eq('A6 the user_id is filled in by the database', pg_temp.s_n(
      'select count(*) from public.own_questions where user_id = (select auth.uid())'), '4');

    -- Monday 16 and Tuesday 17: the plan's question under its first words.
    f := f || pg_temp.s_eq('A7 Monday''s plan answer', pg_temp.s_day(q_plan, 'daily_plan', '2026-11-16', w_plan, 'written', null, 'Finish the board paper by noon.', null, null), '1');
    f := f || pg_temp.s_eq('A8 Tuesday''s plan answer', pg_temp.s_day(q_plan, 'daily_plan', '2026-11-17', w_plan, 'written', null, 'A calm one-to-one with Priya.', null, null), '1');

    -- The review, each working day: yes Mon, no Tue, yes Wed, skipped Thu, yes Fri;
    -- the rating Often, Often, Sometimes, Often, Always.
    for i in 0..4 loop
      d := date '2026-11-16' + i;
      if i <> 3 then
        f := f || pg_temp.s_eq('A9 review yes or no ' || d, pg_temp.s_day(q_yes, 'daily_review', d, w_yes, 'yes_no', null, null, i <> 1, null), '1');
      end if;
    end loop;
    f := f || pg_temp.s_eq('A10 review rating Mon', pg_temp.s_day(q_rate, 'daily_review', '2026-11-16', w_rate, 'rating', 'often', null, null, 4), '1');
    f := f || pg_temp.s_eq('A10 review rating Tue', pg_temp.s_day(q_rate, 'daily_review', '2026-11-17', w_rate, 'rating', 'often', null, null, 4), '1');
    f := f || pg_temp.s_eq('A10 review rating Wed', pg_temp.s_day(q_rate, 'daily_review', '2026-11-18', w_rate, 'rating', 'often', null, null, 3), '1');
    -- (Thursday's and Friday's ratings come after the scale is edited, in C.)

    -- An answer on Saturday is kept: which days count is the page's (working days only).
    f := f || pg_temp.s_eq('A11 a Saturday answer is still kept', pg_temp.s_day(q_yes, 'daily_review', '2026-11-21', w_yes, 'yes_no', null, null, true, null), '1');
    f := f || pg_temp.s_eq('A12 an answer''s day must match its occasion', pg_temp.s_rows(format(
      $q$insert into public.own_question_answers (question_id, tool, occasion, on_date, wording, answer_type, yes_no) values (%L, 'daily_review', '2026-11-19', '2026-11-20', %L, 'yes_no', true)$q$, q_yes, w_yes)), 'error 23514');
    f := f || pg_temp.s_eq('A13 a re-answer replaces the day''s answer (upsert, as the queue sends it)', pg_temp.s_rows(format(
      $q$insert into public.own_question_answers (question_id, tool, occasion, on_date, wording, answer_type, yes_no) values (%L, 'daily_review', '2026-11-17', '2026-11-17', %L, 'yes_no', false)
         on conflict (question_id, occasion) do update set yes_no = excluded.yes_no, wording = excluded.wording$q$, q_yes, w_yes)), '1');
    f := f || pg_temp.s_eq('A14 taking an answer away (a skipped re-answer) deletes the row', pg_temp.s_rows(format(
      $q$delete from public.own_question_answers where question_id = %L and occasion = '2026-11-21' and user_id = %L$q$, q_yes, sam)), '1');

    -- ================================================================ C. edited mid-week
    -- Wednesday: the plan question's words change; Thursday: the rating's scale.
    f := f || pg_temp.s_eq('C1 Sam edits the Daily plan question''s words', pg_temp.s_rows(format(
      $q$update public.own_questions set wording = %L where id = %L$q$, w_plan2, q_plan)), '1');
    f := f || pg_temp.s_eq('C2 updated_at moves on an edit', pg_temp.s_n(format(
      $q$select (updated_at >= created_at)::text from public.own_questions where id = %L$q$, q_plan)), 'true');
    for i in 2..4 loop
      d := date '2026-11-16' + i;
      if i <> 3 then
        f := f || pg_temp.s_eq('C3 plan answer under the new words ' || d, pg_temp.s_day(q_plan, 'daily_plan', d, w_plan2, 'written', null, 'Answer for ' || d, null, null), '1');
      end if;
    end loop;
    f := f || pg_temp.s_eq('C4 Sam edits the rating''s scale to How good', pg_temp.s_rows(format(
      $q$update public.own_questions set scale = 'good', wording = 'How good was my listening today?' where id = %L$q$, q_rate)), '1');
    f := f || pg_temp.s_eq('C5 Thursday''s rating under the new scale', pg_temp.s_day(q_rate, 'daily_review', '2026-11-19', 'How good was my listening today?', 'rating', 'good', null, null, 4), '1');
    f := f || pg_temp.s_eq('C6 Friday''s rating under the new scale', pg_temp.s_day(q_rate, 'daily_review', '2026-11-20', 'How good was my listening today?', 'rating', 'good', null, null, 5), '1');
    f := f || pg_temp.s_eq('C7 Monday and Tuesday keep the first words, Wednesday on the new', pg_temp.s_n(format(
      $q$select string_agg(occasion || '=' || wording, ' | ' order by occasion) from public.own_question_answers where question_id = %L$q$, q_plan)),
      '2026-11-16=' || w_plan || ' | 2026-11-17=' || w_plan || ' | 2026-11-18=' || w_plan2 || ' | 2026-11-20=' || w_plan2);
    f := f || pg_temp.s_eq('C8 the rating''s earlier answers keep their words and scale', pg_temp.s_n(format(
      $q$select string_agg(occasion || ' ' || scale || ' ' || rating || ' ' || left(wording, 12), ' | ' order by occasion) from public.own_question_answers where question_id = %L$q$, q_rate)),
      '2026-11-16 often 4 How often di | 2026-11-17 often 4 How often di | 2026-11-18 often 3 How often di | 2026-11-19 good 4 How good was | 2026-11-20 good 5 How good was');
    f := f || pg_temp.s_eq('C9 an answer''s words can''t be left out', pg_temp.s_day(q_plan, 'daily_plan', '2026-11-19', '  ', 'written', null, 'x', null, null), 'error 23514');

    -- The scores: 0, 25, 50, 75 or 100, by the database, never by hand.
    f := f || pg_temp.s_eq('A15 the week''s rating scores', pg_temp.s_n(format(
      $q$select string_agg(score::text, ',' order by occasion) from public.own_question_answers where question_id = %L$q$, q_rate)), '75,75,50,75,100');
    f := f || pg_temp.s_eq('A16 non-rating answers have no score', pg_temp.s_n(
      $q$select count(*) from public.own_question_answers where answer_type <> 'rating' and score is not null$q$), '0');
    f := f || pg_temp.s_eq('A17 the score can''t be written on insert', pg_temp.s_rows(format(
      $q$insert into public.own_question_answers (question_id, tool, occasion, on_date, wording, answer_type, scale, rating, score) values (%L, 'daily_review', '2026-11-23', '2026-11-23', 'x', 'rating', 'good', 2, 100)$q$, q_rate)), 'error 428C9');
    f := f || pg_temp.s_eq('A18 a rating outside 1 to 5 is refused', pg_temp.s_day(q_rate, 'daily_review', '2026-11-23', 'x', 'rating', 'good', null, null, 6), 'error 23514');
    f := f || pg_temp.s_eq('A19 the working week''s yes or no answers', pg_temp.s_n(format(
      $q$select string_agg(occasion || '=' || yes_no, ',' order by occasion) from public.own_question_answers where question_id = %L$q$, q_yes)),
      '2026-11-16=true,2026-11-17=false,2026-11-18=true,2026-11-20=true');

    -- The debrief: week 2 (not shared) and week 3 (shared).
    perform pg_temp.s_admin();
    insert into public.weekly_debriefs (user_id, sprint_id, sprint_week, shared_with_coach) values (sam, spr, 2, false), (sam, spr, 3, false);
    perform pg_temp.s_as(sam);
    f := f || pg_temp.s_eq('A20 the week 2 debrief answer', pg_temp.s_rows(format(
      $q$insert into public.own_question_answers (question_id, tool, occasion, sprint_id, week, wording, answer_type, scale, rating) values (%L, 'weekly_debrief', %L, %L, 2, %L, 'rating', 'good', 2)$q$, q_deb, spr::text || ':2', spr, w_deb)), '1');
    f := f || pg_temp.s_eq('A21 the week 3 debrief answer (Very good)', pg_temp.s_rows(format(
      $q$insert into public.own_question_answers (question_id, tool, occasion, sprint_id, week, wording, answer_type, scale, rating) values (%L, 'weekly_debrief', %L, %L, 3, %L, 'rating', 'good', 4)$q$, q_deb, spr::text || ':3', spr, w_deb)), '1');
    f := f || pg_temp.s_eq('A22 a debrief answer''s occasion must name its week', pg_temp.s_rows(format(
      $q$insert into public.own_question_answers (question_id, tool, occasion, sprint_id, week, wording, answer_type, scale, rating) values (%L, 'weekly_debrief', %L, %L, 4, %L, 'rating', 'good', 4)$q$, q_deb, spr::text || ':3', spr, w_deb)), 'error 23514');
    f := f || pg_temp.s_eq('A23 the debrief score', pg_temp.s_n(format(
      $q$select score from public.own_question_answers where question_id = %L and week = 3$q$, q_deb)), '75');

    -- Nothing shared yet: Tim, with the code, reads nothing.
    perform pg_temp.s_as(tim_u, 'aal2');
    f := f || pg_temp.s_eq('A24 nothing shared: Tim reads no question', pg_temp.s_nothing('select id from public.own_questions'), 'nothing');
    f := f || pg_temp.s_eq('A25 nothing shared: Tim reads no answer', pg_temp.s_nothing('select id from public.own_question_answers'), 'nothing');
    -- Sam shares week 3's debrief.
    perform pg_temp.s_as(sam);
    f := f || pg_temp.s_eq('A26 Sam shares week 3 with Tim', pg_temp.s_rows(format(
      $q$update public.weekly_debriefs set shared_with_coach = true, status = 'finished', finished_at = now() where sprint_id = %L and sprint_week = 3$q$, spr)), '1');
    perform pg_temp.s_as(tim_u, 'aal2');
    f := f || pg_temp.s_eq('A27 Tim reads the debrief question, only that one', pg_temp.s_n(
      'select string_agg(tool || '': '' || wording, '','') from public.own_questions'), 'weekly_debrief: ' || w_deb);
    f := f || pg_temp.s_eq('A28 ... and week 3''s answer with its score, not week 2''s', pg_temp.s_n(
      'select string_agg(week || '':'' || rating || '':'' || score, '','') from public.own_question_answers'), '3:4:75');
    f := f || pg_temp.s_eq('A29 never a Daily plan or review answer', pg_temp.s_n(
      $q$select count(*) from public.own_question_answers where tool <> 'weekly_debrief'$q$), '0');
    f := f || pg_temp.s_eq('A30 Tim can''t change Sam''s answer', pg_temp.s_rows(
      'update public.own_question_answers set rating = 5'), '0');
    f := f || pg_temp.s_eq('A31 Tim can''t delete Sam''s answer', pg_temp.s_rows(
      'delete from public.own_question_answers'), '0');
    perform pg_temp.s_as(tim_u, 'aal1');
    f := f || pg_temp.s_eq('A32 at password only Tim reads nothing', concat_ws('/',
      pg_temp.s_nothing('select id from public.own_questions'), pg_temp.s_nothing('select id from public.own_question_answers')), 'nothing/nothing');
    -- Sam turns the week's switch off again.
    perform pg_temp.s_as(sam);
    perform pg_temp.s_rows(format($q$update public.weekly_debriefs set shared_with_coach = false where sprint_id = %L and sprint_week = 3$q$, spr));
    perform pg_temp.s_as(tim_u, 'aal2');
    f := f || pg_temp.s_eq('A33 switched off: Tim reads nothing again', concat_ws('/',
      pg_temp.s_nothing('select id from public.own_questions'), pg_temp.s_nothing('select id from public.own_question_answers')), 'nothing/nothing');
    perform pg_temp.s_as(sam);
    perform pg_temp.s_rows(format($q$update public.weekly_debriefs set shared_with_coach = true where sprint_id = %L and sprint_week = 3$q$, spr));

    -- ================================================================ B. Tim's suggestions
    perform pg_temp.s_as(tim_u, 'aal2');
    s1 := pg_temp.s_n(format($q$select public.own_question_suggest(%L, 'daily_review', 'What did I notice in myself when the pressure rose today?', 'written')$q$, sam))::uuid;
    f := f || pg_temp.s_eq('B1 Tim suggests a Daily review question', (s1 is not null)::text, 'true');
    f := f || pg_temp.s_eq('B2 Tim never reads it back', pg_temp.s_nothing('select id from public.own_question_suggestions'), 'nothing');
    f := f || pg_temp.s_eq('B3 Tim can''t write a suggestion directly', pg_temp.s_rows(format(
      $q$insert into public.own_question_suggestions (user_id, coach_user_id, coach_first_name, tool, wording, answer_type) values (%L, %L, 'Tim', 'daily_plan', 'Direct?', 'written')$q$, sam, tim_u)), 'error 42501');
    perform pg_temp.s_as(sam);
    f := f || pg_temp.s_eq('B4 Sam sees "Suggested by Tim" from the data, waiting, not yet seen on Home', pg_temp.s_n(
      $q$select coach_first_name || '/' || tool || '/' || status || '/' || (home_seen_at is null) from public.own_question_suggestions$q$), 'Tim/daily_review/waiting/true');
    f := f || pg_temp.s_eq('B5 Home marks it seen as it shows', pg_temp.s_rows(format(
      $q$update public.own_question_suggestions set home_seen_at = now() where id = %L$q$, s1)), '1');
    f := f || pg_temp.s_eq('B6 ... so Home has nothing more to show', pg_temp.s_nothing(
      $q$select id from public.own_question_suggestions where status = 'waiting' and home_seen_at is null$q$), 'nothing');
    -- Sam's Daily review is full: Add it offers Replace.
    f := f || pg_temp.s_eq('B7 the Daily review is full (2 live)', pg_temp.s_n(
      $q$select count(*) from public.own_questions where tool = 'daily_review' and deleted_at is null$q$), '2');
    f := f || pg_temp.s_eq('B8 adding before the replaced one is deleted is refused (a third live)', pg_temp.s_rows(format(
      $q$insert into public.own_questions (id, tool, wording, answer_type, position, from_suggestion) values (%L, 'daily_review', 'What did I notice in myself when the pressure rose today?', 'written', 1, %L)$q$, q_new, s1)), 'error 23505');
    f := f || pg_temp.s_eq('B9 Replace: the yes or no question is deleted first', pg_temp.s_rows(format(
      $q$update public.own_questions set deleted_at = now() where id = %L$q$, q_yes)), '1');
    f := f || pg_temp.s_eq('B10 ... then the suggestion takes its place', pg_temp.s_rows(format(
      $q$insert into public.own_questions (id, tool, wording, answer_type, position, from_suggestion) values (%L, 'daily_review', 'What did I notice in myself when the pressure rose today?', 'written', 1, %L)$q$, q_new, s1)), '1');
    f := f || pg_temp.s_eq('B11 ... and the suggestion is marked added', pg_temp.s_rows(format(
      $q$update public.own_question_suggestions set status = 'added' where id = %L$q$, s1)), '1');
    f := f || pg_temp.s_eq('B12 the Daily review''s live questions now', pg_temp.s_n(
      $q$select string_agg(position || ':' || answer_type, ',' order by position) from public.own_questions where tool = 'daily_review' and deleted_at is null$q$), '1:written,2:rating');
    f := f || pg_temp.s_eq('B13 the replaced question''s past answers stay', pg_temp.s_n(format(
      $q$select count(*) from public.own_question_answers where question_id = %L$q$, q_yes)), '4');
    f := f || pg_temp.s_eq('B14 the replaced question can''t come back while both places are taken (Undo then says full)', pg_temp.s_rows(format(
      $q$update public.own_questions set deleted_at = null where id = %L$q$, q_yes)), 'error 23505');
    -- A second suggestion, for the debrief: Not now.
    perform pg_temp.s_as(tim_u, 'aal2');
    s2 := pg_temp.s_n(format($q$select public.own_question_suggest(%L, 'weekly_debrief', 'Did I protect my thinking time this week?', 'yes_no')$q$, sam))::uuid;
    f := f || pg_temp.s_eq('B15 Tim suggests a debrief question', (s2 is not null)::text, 'true');
    perform pg_temp.s_as(sam);
    f := f || pg_temp.s_eq('B16 Sam says Not now', pg_temp.s_rows(format(
      $q$update public.own_question_suggestions set status = 'not_now' where id = %L$q$, s2)), '1');
    f := f || pg_temp.s_eq('B17 Not now can''t be turned into Add it later', pg_temp.s_rows(format(
      $q$update public.own_question_suggestions set status = 'added' where id = %L$q$, s2)), 'error CC409');
    f := f || pg_temp.s_eq('B18 ... nor back to waiting', pg_temp.s_rows(format(
      $q$update public.own_question_suggestions set status = 'waiting' where id = %L$q$, s2)), 'error CC409');
    f := f || pg_temp.s_eq('B19 Not now adds no question', pg_temp.s_n(
      $q$select count(*) from public.own_questions where tool = 'weekly_debrief' and deleted_at is null$q$), '1');
    f := f || pg_temp.s_eq('B20 no waiting suggestion is left for Sam', pg_temp.s_nothing(
      $q$select id from public.own_question_suggestions where status = 'waiting'$q$), 'nothing');
    perform pg_temp.s_as(tim_u, 'aal2');
    f := f || pg_temp.s_eq('B21 Tim can''t tell Not now from Add it', pg_temp.s_nothing('select status from public.own_question_suggestions'), 'nothing');
    -- A newer suggestion for the same tool takes the waiting one's place; a decided one stays as decided.
    s3 := pg_temp.s_n(format($q$select public.own_question_suggest(%L, 'daily_plan', 'What will I say no to today?', 'written')$q$, sam))::uuid;
    s4 := pg_temp.s_n(format($q$select public.own_question_suggest(%L, 'daily_plan', 'How much will I delegate today?', 'rating', 'much')$q$, sam))::uuid;
    perform pg_temp.s_as(sam);
    f := f || pg_temp.s_eq('B22 the newer daily_plan suggestion replaces the waiting one', pg_temp.s_n(
      $q$select string_agg(answer_type || ':' || status, ',' order by created_at, answer_type) from public.own_question_suggestions where tool = 'daily_plan'$q$),
      'rating:waiting,written:replaced');
    f := f || pg_temp.s_eq('B23 the debrief''s Not now is untouched', pg_temp.s_n(format(
      $q$select status from public.own_question_suggestions where id = %L$q$, s2)), 'not_now');
    f := f || pg_temp.s_eq('B24 a suggested rating keeps its scale', pg_temp.s_n(format(
      $q$select scale from public.own_question_suggestions where id = %L$q$, s4)), 'much');
    f := f || pg_temp.s_eq('B25 Sam can''t mark it replaced himself', pg_temp.s_rows(format(
      $q$update public.own_question_suggestions set status = 'replaced' where id = %L$q$, s4)), 'error 42501');
    -- The coach's view after Replace: the debrief still only.
    perform pg_temp.s_as(tim_u, 'aal2');
    f := f || pg_temp.s_eq('B26 Tim still reads no Daily review question, the suggested one included', pg_temp.s_n(
      $q$select count(*) from public.own_questions where tool = 'daily_review'$q$), '0');

    -- ================================================================ D. Ola, no own questions
    perform pg_temp.s_as(ola);
    f := f || pg_temp.s_eq('D1 Ola has no own questions, answers or suggestions', concat_ws('/',
      (select count(*) from public.own_questions), (select count(*) from public.own_question_answers), (select count(*) from public.own_question_suggestions)), '0/0/0');
    f := f || pg_temp.s_eq('D2 Ola''s debrief saves as before', pg_temp.s_rows(format(
      $q$insert into public.weekly_debriefs (user_id, sprint_id, sprint_week, went_well, shared_with_coach, status, finished_at) values (%L, %L, 3, 'Shipped the plan.', true, 'finished', now())$q$, ola, ola_spr)), '1');
    perform pg_temp.s_as(maya_u, 'aal2');
    f := f || pg_temp.s_eq('D3 Maya reads Ola''s shared debrief (028/038''s coach_shared_debrief, as before)', pg_temp.s_n(format(
      $q$select went_well from public.coach_shared_debrief(%L, %L, 3)$q$, ola, ola_spr)), 'Shipped the plan.');
    f := f || pg_temp.s_eq('D4 ... and no own question or answer (Ola has none, Sam''s aren''t hers to see)', concat_ws('/',
      pg_temp.s_nothing('select id from public.own_questions'), pg_temp.s_nothing('select id from public.own_question_answers')), 'nothing/nothing');
    f := f || pg_temp.s_eq('D5 Maya can''t suggest to Sam', pg_temp.s_n(format(
      $q$select public.own_question_suggest(%L, 'daily_review', 'Hello?', 'written')$q$, sam)), 'error 42501');
    perform pg_temp.s_as(ola);
    f := f || pg_temp.s_eq('D6 Ola reads none of Sam''s', concat_ws('/',
      pg_temp.s_nothing('select id from public.own_questions'), pg_temp.s_nothing('select id from public.own_question_answers'),
      pg_temp.s_nothing('select id from public.own_question_suggestions')), 'nothing/nothing/nothing');

    perform pg_temp.s_admin();
    raise exception 'undo the story rows' using errcode = 'P0055';
  exception when sqlstate 'P0055' then
    perform pg_temp.s_admin();
  end;

  f := f || pg_temp.s_eq('E everything the story made is undone',
    (select count(*)::text from auth.users where email like 'p6a-story55-%@example.invalid'), '0');
  if cardinality(f) > 0 then
    raise exception E'055 STORY FAILED (%):\n%', cardinality(f), array_to_string(f, E'\n');
  end if;
  raise notice '055 STORY PASSED';
end
$s$;
