-- =============================================================================
-- 058_reminder_schedule_suggestions_test.sql (058 part 3, written by helper 2): a coach's suggested question shows only while that coach still
-- coaches the client (tidy follow-up 3, run 7's 4). Run after 058. Everything
-- it makes is undone at the end. Ends with "058 SUGGESTIONS CHECKS PASSED".
-- =============================================================================
create or replace function pg_temp.t_as(p uuid, p_aal text default 'aal1') returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated', 'aal', p_aal)::text, true);
  perform set_config('role', 'authenticated', true);
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
  values (u, 'p6a-058s-' || p_label || '-' || u || '@example.invalid', 'authenticated', 'authenticated', now());
  return u;
end $f$;

do $t$
declare
  sam uuid := pg_temp.t_user('sam');
  tim_u uuid := pg_temp.t_user('tim');
  maya_u uuid := pg_temp.t_user('maya');
  tim_c uuid; maya_c uuid;
  n int;
  bad text[] := '{}';
begin
  insert into public.coaches (user_id, role, display_first_name) values (tim_u, 'owner', 'Tim') returning id into tim_c;
  insert into public.coaches (user_id, role, display_first_name) values (maya_u, 'coach', 'Maya') returning id into maya_c;
  insert into public.coach_clients (client_id, coach_id) values (sam, maya_c);
  insert into public.own_question_suggestions (user_id, coach_user_id, coach_first_name, tool, wording, answer_type)
  values (sam, tim_u, 'Tim', 'daily_review', 'Where did I lead today?', 'written'),
         (sam, maya_u, 'Maya', 'daily_plan', 'What matters most today?', 'written');

  -- 1. Maya coaches Sam: Sam reads Maya's, not Tim's (Tim doesn't coach Sam).
  perform pg_temp.t_as(sam);
  select count(*) into n from public.own_question_suggestions where coach_first_name = 'Maya';
  if n <> 1 then bad := bad || ('1. Maya coaching: ' || n); end if;
  select count(*) into n from public.own_question_suggestions;
  if n <> 1 then bad := bad || ('1. only Maya''s: ' || n); end if;
  perform pg_temp.t_admin();

  -- 2. Maya's coaching ends and Tim's starts: Sam reads Tim's only.
  update public.coach_clients set ended_at = now() where client_id = sam and coach_id = maya_c;
  insert into public.coach_clients (client_id, coach_id) values (sam, tim_c);
  perform pg_temp.t_as(sam);
  select count(*) into n from public.own_question_suggestions;
  if n <> 1 then bad := bad || ('2. Maya ended: ' || n); end if;
  select count(*) into n from public.own_question_suggestions where coach_first_name = 'Maya';
  if n <> 0 then bad := bad || ('2. Maya''s still read: ' || n); end if;
  -- 3. Sam can't mark the hidden one (nothing to update).
  update public.own_question_suggestions set status = 'added' where coach_first_name = 'Maya';
  get diagnostics n = row_count;
  if n <> 0 then bad := bad || ('3. hidden one changed: ' || n); end if;
  perform pg_temp.t_admin();

  -- 4. Tim no longer active: Sam reads none.
  update public.coaches set active = false where id = tim_c;
  perform pg_temp.t_as(sam);
  select count(*) into n from public.own_question_suggestions;
  if n <> 0 then bad := bad || ('4. Tim inactive: ' || n); end if;
  perform pg_temp.t_admin();

  -- 5. Nothing was deleted, and Maya coaching Sam again brings hers back.
  select count(*) into n from public.own_question_suggestions where user_id = sam;
  if n <> 2 then bad := bad || ('5. kept: ' || n); end if;
  update public.coach_clients set ended_at = now() where client_id = sam and coach_id = tim_c;
  insert into public.coach_clients (client_id, coach_id) values (sam, maya_c);
  perform pg_temp.t_as(sam);
  select count(*) into n from public.own_question_suggestions where coach_first_name = 'Maya' and status = 'waiting';
  if n <> 1 then bad := bad || ('5. back with Maya: ' || n); end if;
  -- 6. Another person never reads Sam's.
  perform pg_temp.t_as(maya_u);
  select count(*) into n from public.own_question_suggestions;
  if n <> 0 then bad := bad || ('6. coach reads them: ' || n); end if;
  perform pg_temp.t_admin();

  -- 7. Signed out: the helper isn't callable.
  if has_function_privilege('anon', 'public.own_suggestion_coach_current(uuid)', 'execute') then bad := bad || '7. anon can call it'::text; end if;

  delete from public.own_question_suggestions where user_id = sam;
  delete from public.coach_clients where client_id = sam;
  delete from public.coaches where id in (tim_c, maya_c);
  delete from auth.users where id in (sam, tim_u, maya_u);

  if array_length(bad, 1) > 0 then raise exception '058 suggestions checks failed: %', array_to_string(bad, ' | '); end if;
  raise notice '058 SUGGESTIONS CHECKS PASSED';
end
$t$;
