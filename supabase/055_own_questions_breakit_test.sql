-- =============================================================================
-- 055_own_questions_breakit_test.sql
-- The break-it tester's checks of 055's own questions (Phase 6a run 7, 22
-- Nov). RUN ORDER: 026 to 054, then 055, then this (after or without the
-- other 055 tests). Safe to run again: everything it makes is undone at the
-- end.
--
-- WHAT IT TRIES
--   b1  the 120-character limit with emoji and other wide characters, and
--       edge text: only spaces, line breaks, tabs, invisible characters; a
--       written answer of 4000 and 4001 characters;
--   b2  a third live question by every other road: two in one statement,
--       moving one onto the other's place, Undo when both places are full,
--       a deleted row on the same place (which never blocks);
--   b3  answering a question deleted while a tool was open (kept, as the
--       tool took its questions as it opened), and answers that don't fit
--       their day or their kind (an answer moved to another of the same
--       person's questions in the same tool is not stopped: only the person
--       can, and the app never does);
--   b5  a coach suggesting to someone else's client, a past client, a
--       non-client, themself, nobody; signed out; an inactive coach; bad
--       tools, kinds and scales; invisible or multi-line words (cleaned as
--       the app cleans them, so nothing empty reaches the client); and a
--       coach reaching a suggestion afterwards (read, change, remove);
--   b6  a coach at password only (aal1): no suggesting, no reading, while
--       their own questions as a person still work;
--   b7  a suggestion decided twice, and Add it racing Not now.
--   It ends with the notice 055 BREAK-IT CHECKS PASSED, or stops with
--   FAILED and a list naming each check that failed.
-- =============================================================================
create or replace function pg_temp.b_as(p uuid, p_aal text default 'aal1') returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated', 'aal', p_aal)::text, true);
  perform set_config('role', 'authenticated', true);
end $f$;
create or replace function pg_temp.b_anon() returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('role', 'anon', true);
end $f$;
create or replace function pg_temp.b_admin() returns void language plpgsql as $f$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
end $f$;
create or replace function pg_temp.b_user(p_label text) returns uuid language plpgsql as $f$
declare u uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, aud, role, email_confirmed_at)
  values (u, 'p6a-break55-' || p_label || '-' || u || '@example.invalid', 'authenticated', 'authenticated', now());
  return u;
end $f$;
create or replace function pg_temp.b_n(p_sql text) returns text language plpgsql as $f$
declare v text;
begin
  execute p_sql into v;
  return coalesce(v, 'null');
exception when others then
  return 'error ' || sqlstate;
end $f$;
create or replace function pg_temp.b_rows(p_sql text) returns text language plpgsql as $f$
declare n bigint;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n::text;
exception when others then
  return 'error ' || sqlstate;
end $f$;
create or replace function pg_temp.b_eq(p_name text, p_got text, p_want text) returns text[] language sql as $f$
  select case when p_got is distinct from p_want
              then array[format('%s: expected %s, got %s', p_name, p_want, coalesce(p_got, 'nothing'))]
              else '{}'::text[] end;
$f$;

do $b$
declare
  f text[] := '{}';
  sam uuid; ola uuid; pat uuid; tim_u uuid; maya_u uuid; ivy_u uuid; tim_c uuid; maya_c uuid; ivy_c uuid;
  q1 uuid := gen_random_uuid(); q2 uuid := gen_random_uuid(); q3 uuid := gen_random_uuid();
  qx uuid := gen_random_uuid(); qt uuid := gen_random_uuid();
  s1 uuid; v text;
  emoji text := U&'\+01F600';
begin
  begin
    perform pg_temp.b_admin();
    sam := pg_temp.b_user('sam'); ola := pg_temp.b_user('ola'); pat := pg_temp.b_user('pat');
    tim_u := pg_temp.b_user('tim'); maya_u := pg_temp.b_user('maya'); ivy_u := pg_temp.b_user('ivy');
    insert into public.coaches (user_id, role, display_first_name) values (tim_u, 'owner', 'Tim') returning id into tim_c;
    insert into public.coaches (user_id, role, display_first_name) values (maya_u, 'coach', 'Maya') returning id into maya_c;
    insert into public.coaches (user_id, role, display_first_name, active) values (ivy_u, 'coach', 'Ivy', false) returning id into ivy_c;
    insert into public.coach_clients (client_id, coach_id) values (sam, tim_c), (ola, maya_c);
    -- Pat was Tim's client and has moved to Ivy (now inactive).
    insert into public.coach_clients (client_id, coach_id, started_at, ended_at) values (pat, tim_c, now() - interval '30 days', now() - interval '1 day');
    insert into public.coach_clients (client_id, coach_id) values (pat, ivy_c);

    -- ------------------------------------------------------------ b1. the limit and edge text
    perform pg_temp.b_as(sam);
    f := f || pg_temp.b_eq('b1a 120 emoji are 120 characters, kept', pg_temp.b_rows(format(
      $q$insert into public.own_questions (id, tool, wording, answer_type, position) values (%L, 'daily_plan', %L, 'written', 1)$q$, q1, repeat(emoji, 120))), '1');
    f := f || pg_temp.b_eq('b1b 121 emoji are refused', pg_temp.b_rows(format(
      $q$insert into public.own_questions (tool, wording, answer_type, position) values ('daily_plan', %L, 'written', 2)$q$, repeat(emoji, 121))), 'error 23514');
    f := f || pg_temp.b_eq('b1c 120 letters with a space either side (122) are refused, not trimmed', pg_temp.b_rows(format(
      $q$insert into public.own_questions (tool, wording, answer_type, position) values ('daily_plan', %L, 'written', 2)$q$, ' ' || repeat('a', 120) || ' ')), 'error 23514');
    f := f || pg_temp.b_eq('b1d only spaces are refused', pg_temp.b_rows(
      $q$insert into public.own_questions (tool, wording, answer_type, position) values ('daily_plan', '     ', 'written', 2)$q$), 'error 23514');
    f := f || pg_temp.b_eq('b1e an empty string is refused', pg_temp.b_rows(
      $q$insert into public.own_questions (tool, wording, answer_type, position) values ('daily_plan', '', 'written', 2)$q$), 'error 23514');
    f := f || pg_temp.b_eq('b1f null words are refused', pg_temp.b_rows(
      $q$insert into public.own_questions (tool, wording, answer_type, position) values ('daily_plan', null, 'written', 2)$q$), 'error 23502');
    -- A written answer: 4000 wide characters kept, 4001 refused.
    f := f || pg_temp.b_eq('b1g a written answer of 4000 emoji is kept', pg_temp.b_rows(format(
      $q$insert into public.own_question_answers (question_id, tool, occasion, on_date, wording, answer_type, written) values (%L, 'daily_plan', '2026-11-16', '2026-11-16', 'Q', 'written', %L)$q$, q1, repeat(emoji, 4000))), '1');
    f := f || pg_temp.b_eq('b1h a written answer of 4001 characters is refused', pg_temp.b_rows(format(
      $q$insert into public.own_question_answers (question_id, tool, occasion, on_date, wording, answer_type, written) values (%L, 'daily_plan', '2026-11-17', '2026-11-17', 'Q', 'written', %L)$q$, q1, repeat('x', 4001))), 'error 23514');
    f := f || pg_temp.b_eq('b1i an answer''s words of 121 characters are refused', pg_temp.b_rows(format(
      $q$insert into public.own_question_answers (question_id, tool, occasion, on_date, wording, answer_type, written) values (%L, 'daily_plan', '2026-11-17', '2026-11-17', %L, 'written', 'Fine')$q$, q1, repeat('a', 121))), 'error 23514');

    -- ------------------------------------------------------------ b2. a third question by other roads
    f := f || pg_temp.b_eq('b2a two in one statement on one place: refused, neither kept', pg_temp.b_rows(
      $q$insert into public.own_questions (tool, wording, answer_type, position) values ('daily_review', 'One?', 'written', 1), ('daily_review', 'Two?', 'written', 1)$q$), 'error 23505');
    f := f || pg_temp.b_eq('b2b ... nothing was kept', pg_temp.b_n($q$select count(*) from public.own_questions where tool = 'daily_review'$q$), '0');
    perform pg_temp.b_rows(format($q$insert into public.own_questions (id, tool, wording, answer_type, position) values (%L, 'daily_review', 'First?', 'written', 1), (%L, 'daily_review', 'Second?', 'yes_no', 2)$q$, q2, q3));
    f := f || pg_temp.b_eq('b2c moving one onto the other''s place is refused', pg_temp.b_rows(format(
      $q$update public.own_questions set position = 1 where id = %L$q$, q3)), 'error 23505');
    f := f || pg_temp.b_eq('b2d a third with deleted_at set may sit on a taken place (it is not live)', pg_temp.b_rows(format(
      $q$insert into public.own_questions (id, tool, wording, answer_type, position, deleted_at) values (%L, 'daily_review', 'Old one?', 'written', 1, now())$q$, qx)), '1');
    f := f || pg_temp.b_eq('b2e ... but Undo of it while both places are full is refused', pg_temp.b_rows(format(
      $q$update public.own_questions set deleted_at = null where id = %L$q$, qx)), 'error 23505');
    perform pg_temp.b_rows(format($q$update public.own_questions set deleted_at = now() where id = %L$q$, q3));
    f := f || pg_temp.b_eq('b2f a freed place takes the Undo', pg_temp.b_rows(format(
      $q$update public.own_questions set deleted_at = null, position = 2 where id = %L$q$, qx)), '1');
    f := f || pg_temp.b_eq('b2g still 2 live in the tool', pg_temp.b_n(
      $q$select count(*) from public.own_questions where tool = 'daily_review' and deleted_at is null$q$), '2');
    f := f || pg_temp.b_eq('b2h a question can''t be given to someone else', pg_temp.b_rows(format(
      $q$update public.own_questions set user_id = %L where id = %L$q$, ola, q2)), 'error 42501');

    -- ------------------------------------------------------------ b3. answering a deleted question
    f := f || pg_temp.b_eq('b3a an answer to a question deleted while the tool was open is kept', pg_temp.b_rows(format(
      $q$insert into public.own_question_answers (question_id, tool, occasion, on_date, wording, answer_type, yes_no) values (%L, 'daily_review', '2026-11-18', '2026-11-18', 'Second?', 'yes_no', true)$q$, q3)), '1');
    f := f || pg_temp.b_eq('b3b a rating of 0 is refused', pg_temp.b_rows(format(
      $q$insert into public.own_question_answers (question_id, tool, occasion, on_date, wording, answer_type, scale, rating) values (%L, 'daily_review', '2026-11-19', '2026-11-19', 'Q', 'rating', 'often', 0)$q$, q2)), 'error 23514');
    f := f || pg_temp.b_eq('b3c a rating of 6 is refused', pg_temp.b_rows(format(
      $q$insert into public.own_question_answers (question_id, tool, occasion, on_date, wording, answer_type, scale, rating) values (%L, 'daily_review', '2026-11-19', '2026-11-19', 'Q', 'rating', 'often', 6)$q$, q2)), 'error 23514');
    f := f || pg_temp.b_eq('b3d an answer whose day and occasion disagree is refused', pg_temp.b_rows(format(
      $q$insert into public.own_question_answers (question_id, tool, occasion, on_date, wording, answer_type, written) values (%L, 'daily_review', '2026-11-19', '2026-11-20', 'Q', 'written', 'Hi')$q$, q2)), 'error 23514');
    f := f || pg_temp.b_eq('b3e an answer with a made-up scale is refused', pg_temp.b_rows(format(
      $q$insert into public.own_question_answers (question_id, tool, occasion, on_date, wording, answer_type, scale, rating) values (%L, 'daily_review', '2026-11-19', '2026-11-19', 'Q', 'rating', 'loud', 3)$q$, q2)), 'error 23514');
    f := f || pg_temp.b_eq('b3f an answer under someone else''s name is refused', pg_temp.b_rows(format(
      $q$insert into public.own_question_answers (user_id, question_id, tool, occasion, on_date, wording, answer_type, written) values (%L, %L, 'daily_review', '2026-11-19', '2026-11-19', 'Q', 'written', 'Hi')$q$, ola, q2)), 'error 42501');

    -- ------------------------------------------------------------ b5. suggestions from the wrong places
    perform pg_temp.b_as(maya_u, 'aal2');
    f := f || pg_temp.b_eq('b5a Maya to Sam (Tim''s client) is refused', pg_temp.b_n(format(
      $q$select public.own_question_suggest(%L, 'daily_review', 'Hello?', 'written')$q$, sam)), 'error 42501');
    perform pg_temp.b_as(tim_u, 'aal2');
    f := f || pg_temp.b_eq('b5b Tim to Ola (Maya''s client) is refused', pg_temp.b_n(format(
      $q$select public.own_question_suggest(%L, 'daily_review', 'Hello?', 'written')$q$, ola)), 'error 42501');
    f := f || pg_temp.b_eq('b5c Tim to Pat (a past client) is refused', pg_temp.b_n(format(
      $q$select public.own_question_suggest(%L, 'daily_review', 'Hello?', 'written')$q$, pat)), 'error 42501');
    f := f || pg_temp.b_eq('b5d Tim to himself is refused', pg_temp.b_n(format(
      $q$select public.own_question_suggest(%L, 'daily_review', 'Hello?', 'written')$q$, tim_u)), 'error 42501');
    f := f || pg_temp.b_eq('b5e Tim to nobody (null) is refused', pg_temp.b_n(
      $q$select public.own_question_suggest(null, 'daily_review', 'Hello?', 'written')$q$), 'error 42501');
    f := f || pg_temp.b_eq('b5f Tim to an id that is nobody is refused', pg_temp.b_n(format(
      $q$select public.own_question_suggest(%L, 'daily_review', 'Hello?', 'written')$q$, gen_random_uuid())), 'error 42501');
    perform pg_temp.b_as(ivy_u, 'aal2');
    f := f || pg_temp.b_eq('b5g an inactive coach to their own client is refused', pg_temp.b_n(format(
      $q$select public.own_question_suggest(%L, 'daily_review', 'Hello?', 'written')$q$, pat)), 'error 42501');
    perform pg_temp.b_anon();
    f := f || pg_temp.b_eq('b5h signed out is refused', pg_temp.b_n(format(
      $q$select public.own_question_suggest(%L, 'daily_review', 'Hello?', 'written')$q$, sam)), 'error 42501');
    perform pg_temp.b_as(tim_u, 'aal2');
    f := f || pg_temp.b_eq('b5i a made-up tool is refused', pg_temp.b_n(format(
      $q$select public.own_question_suggest(%L, 'journal', 'Hello?', 'written')$q$, sam)), 'error 23514');
    f := f || pg_temp.b_eq('b5j a made-up kind is refused', pg_temp.b_n(format(
      $q$select public.own_question_suggest(%L, 'daily_review', 'Hello?', 'essay')$q$, sam)), 'error 23514');
    f := f || pg_temp.b_eq('b5k a made-up scale is refused', pg_temp.b_n(format(
      $q$select public.own_question_suggest(%L, 'daily_review', 'Hello?', 'rating', 'loud')$q$, sam)), 'error 23514');
    f := f || pg_temp.b_eq('b5l a refused suggestion leaves the waiting one waiting', pg_temp.b_n(format(
      $q$select count(*) from public.own_question_suggestions where user_id = %L$q$, sam)), '0');
    f := f || pg_temp.b_eq('b5m only invisible characters are refused as empty', pg_temp.b_n(format(
      $q$select public.own_question_suggest(%L, 'daily_review', %L, 'written')$q$, sam, U&'\200B\FEFF\00AD')), 'error 22023');
    f := f || pg_temp.b_eq('b5n only line breaks and tabs are refused as empty', pg_temp.b_n(format(
      $q$select public.own_question_suggest(%L, 'daily_review', %L, 'written')$q$, sam, E'\n\t\r\n ')), 'error 22023');
    f := f || pg_temp.b_eq('b5o 121 emoji are refused', pg_temp.b_n(format(
      $q$select public.own_question_suggest(%L, 'daily_review', %L, 'written')$q$, sam, repeat(emoji, 121))), 'error 22001');
    s1 := pg_temp.b_n(format($q$select public.own_question_suggest(%L, 'daily_plan', %L, 'yes_no', 'often')$q$,
      sam, E'  What would make\ntoday a win?' || U&'\200B' || '  '))::uuid;
    perform pg_temp.b_admin();
    f := f || pg_temp.b_eq('b5p line breaks become a space and invisible characters go, as the app cleans them', pg_temp.b_n(format(
      $q$select wording || '|' || coalesce(scale, 'no scale') from public.own_question_suggestions where id = %L$q$, s1)), 'What would make today a win?|no scale');
    perform pg_temp.b_as(tim_u, 'aal2');
    f := f || pg_temp.b_eq('b5r 120 characters after cleaning are kept (as the coach)', pg_temp.b_n(format(
      $q$select (public.own_question_suggest(%L, 'weekly_debrief', %L, 'written') is not null)::text$q$, sam, ' ' || repeat('c', 120) || E'\n')), 'true');
    f := f || pg_temp.b_eq('b5s the coach changes nothing of a suggestion', pg_temp.b_rows(format(
      $q$update public.own_question_suggestions set status = 'not_now' where id = %L$q$, s1)), '0');
    f := f || pg_temp.b_eq('b5t the coach can''t remove a suggestion', pg_temp.b_rows(format(
      $q$delete from public.own_question_suggestions where id = %L$q$, s1)), 'error 42501');
    f := f || pg_temp.b_eq('b5u the coach can''t write one around the function', pg_temp.b_rows(format(
      $q$insert into public.own_question_suggestions (user_id, coach_user_id, coach_first_name, tool, wording, answer_type) values (%L, %L, 'Tim', 'daily_review', 'Direct?', 'written')$q$, sam, tim_u)), 'error 42501');
    f := f || pg_temp.b_eq('b5v the coach reads no Daily plan or review question of Sam''s', pg_temp.b_n(
      $q$select count(*) from public.own_questions where tool <> 'weekly_debrief'$q$), '0');

    -- ------------------------------------------------------------ b6. a coach at password only
    perform pg_temp.b_as(tim_u, 'aal1');
    f := f || pg_temp.b_eq('b6a at password only: no suggesting', pg_temp.b_n(format(
      $q$select public.own_question_suggest(%L, 'daily_review', 'Hello?', 'written')$q$, sam)), 'error 42501');
    f := f || pg_temp.b_eq('b6b at password only: own_debrief_shared says no', pg_temp.b_n(format(
      $q$select public.own_debrief_shared(%L, null, null)::text$q$, sam)), 'false');
    f := f || pg_temp.b_eq('b6c at password only: no suggestion read', pg_temp.b_n('select count(*) from public.own_question_suggestions'), '0');
    f := f || pg_temp.b_eq('b6d at password only: Tim''s own questions as a person still save', pg_temp.b_rows(format(
      $q$insert into public.own_questions (id, tool, wording, answer_type, position) values (%L, 'daily_review', 'Mine?', 'written', 1)$q$, qt)), '1');
    f := f || pg_temp.b_eq('b6e ... and read back', pg_temp.b_n('select count(*) from public.own_questions'), '1');
    perform pg_temp.b_as(tim_u, 'AAL2');
    f := f || pg_temp.b_eq('b6f a forged "AAL2" is no code', pg_temp.b_n(format(
      $q$select public.own_question_suggest(%L, 'daily_review', 'Hello?', 'written')$q$, sam)), 'error 42501');

    -- ------------------------------------------------------------ b7. deciding twice, and racing
    perform pg_temp.b_as(sam);
    f := f || pg_temp.b_eq('b7a Sam sees two waiting (one a tool), cleaned', pg_temp.b_n(
      $q$select string_agg(tool || ':' || status, ',' order by tool) from public.own_question_suggestions$q$), 'daily_plan:waiting,weekly_debrief:waiting');
    f := f || pg_temp.b_eq('b7b Add it', pg_temp.b_rows(format(
      $q$update public.own_question_suggestions set status = 'added' where id = %L$q$, s1)), '1');
    f := f || pg_temp.b_eq('b7c Not now from another tab after Add it is refused', pg_temp.b_rows(format(
      $q$update public.own_question_suggestions set status = 'not_now' where id = %L$q$, s1)), 'error CC409');
    f := f || pg_temp.b_eq('b7d Add it again is no change and no error', pg_temp.b_rows(format(
      $q$update public.own_question_suggestions set status = 'added' where id = %L$q$, s1)), '1');
    f := f || pg_temp.b_eq('b7e back to waiting is refused', pg_temp.b_rows(format(
      $q$update public.own_question_suggestions set status = 'waiting' where id = %L$q$, s1)), 'error CC409');
    f := f || pg_temp.b_eq('b7f Sam can''t rename the coach', pg_temp.b_rows(format(
      $q$update public.own_question_suggestions set coach_first_name = 'Bob' where id = %L$q$, s1)), 'error 42501');
    f := f || pg_temp.b_eq('b7g Sam can''t remove a suggestion', pg_temp.b_rows(format(
      $q$delete from public.own_question_suggestions where id = %L$q$, s1)), 'error 42501');
    perform pg_temp.b_as(ola);
    f := f || pg_temp.b_eq('b7h Ola can''t decide Sam''s', pg_temp.b_rows(format(
      $q$update public.own_question_suggestions set status = 'not_now' where id = %L$q$, s1)), '0');

    perform pg_temp.b_admin();
    raise exception 'undo the break-it rows' using errcode = 'P0055';
  exception when sqlstate 'P0055' then
    perform pg_temp.b_admin();
  end;

  f := f || pg_temp.b_eq('z everything the checks made is undone',
    (select count(*)::text from auth.users where email like 'p6a-break55-%@example.invalid'), '0');
  if cardinality(f) > 0 then
    raise exception E'055 BREAK-IT FAILED (%):\n%', cardinality(f), array_to_string(f, E'\n');
  end if;
  raise notice '055 BREAK-IT CHECKS PASSED';
end
$b$;
