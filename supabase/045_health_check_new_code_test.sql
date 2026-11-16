-- =============================================================================
-- 045_health_check_new_code_test.sql: checks migration 045
--
-- Run after 045, on the test project only, inside a transaction that is
-- rolled back. To check that 045 is safe to run twice, run it twice first:
--   bash scripts/dry-run-on-test.sh supabase/migrations/045_health_check_new_code.sql \
--     supabase/migrations/045_health_check_new_code.sql supabase/045_health_check_new_code_test.sql
--
-- WHAT IT DOES
--   Makes invented people (a coach and someone else) and a Health Check link,
--   then plays the break-it tester's four tries against Only you:
--   the old code, the coach's own sign-in, a direct read of the table, and
--   switching the choice as the coach. Every one must be refused. Also:
--   the new code is never handed back to whoever made the change, only the
--   email server can read it, only for the guest's own address, 3 times an
--   hour; opening with it ends its keeping; switching back and forth needs
--   the current code and issues no second code; a coach who switches first
--   still never learns the code.
--   No email address or code is ever shown. Everything it makes is undone.
--
--   It ends with the notice 045 CHECKS PASSED, or stops with FAILED and a
--   list naming each check that failed.
-- =============================================================================

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
create or replace function pg_temp.t_service() returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  perform set_config('role', 'service_role', true);
end $f$;
create or replace function pg_temp.t_admin() returns void language plpgsql as $f$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
end $f$;
create or replace function pg_temp.t45_user(p_label text) returns uuid language plpgsql as $f$
declare u uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, aud, role, email_confirmed_at)
  values (u, '045-test-' || p_label || '-' || u || '@example.invalid', 'authenticated', 'authenticated', now());
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
create or replace function pg_temp.t_eq(p_name text, p_got text, p_want text) returns text[] language sql as $f$
  select case when p_got is distinct from p_want
              then array[format('%s: expected %s, got %s', p_name, p_want, coalesce(p_got, 'nothing'))]
              else '{}'::text[] end;
$f$;
-- the lockout counts every wrong try; the checks start each try afresh
create or replace function pg_temp.t_unlock(p_token text) returns void language plpgsql as $f$
begin
  perform pg_temp.t_admin();
  update public.alignment_sessions set failed_attempts = 0, locked_until = null where token = p_token;
end $f$;

do $t$
declare
  f text[] := '{}';
  has_coaches boolean := to_regclass('public.coaches') is not null;
  coach uuid; other_u uuid;
  hc_email constant text := '045-test-guest@example.invalid';
  answers constant jsonb := '{"objective": "045 test objective", "csfs": [{"id": "f1", "text": "045 test Success Factor"}], "projects": [{"id": "p1", "text": "045 test project"}]}';
  l jsonb; tok text; old_code text; new_code text; j jsonb;
  l2 jsonb; tok2 text; old2 text;
begin
  begin
    coach := pg_temp.t45_user('coach'); other_u := pg_temp.t45_user('other');
    if has_coaches then
      execute 'insert into public.coaches (user_id, role, display_first_name) values ($1, ''coach'', ''Adie'')' using coach;
    end if;

    -- ------------------------------------------------ N1. a link; the coach is given its code
    perform pg_temp.t_admin();
    l := public.create_alignment_session('045 test organisation', hc_email, (select upper(email) from auth.users where id = coach));
    tok := l ->> 'token'; old_code := l ->> 'access_code';
    perform pg_temp.t_anon();
    f := f || pg_temp.t_eq('N1a the guest opens with the code the coach passed on', public.alignment_open(tok, hc_email, old_code) ->> 'ok', 'true');
    perform public.alignment_save(tok, hc_email, old_code, answers, '{"screen": "objective"}', 0, false);
    perform pg_temp.t_admin();
    f := f || pg_temp.t_eq('N1b nothing is kept for sending yet',
      pg_temp.t_n(format('select (new_code is null and code_reissued_at is null)::text from public.alignment_sessions where token = %L', tok)), 'true');

    -- ------------------------------------------------ N2. the guest chooses Only you: a new code, never handed back
    perform pg_temp.t_anon();
    j := public.alignment_set_sharing(tok, hc_email, old_code, false);
    f := f || pg_temp.t_eq('N2a Only you is saved and says a new code is on its way', (j ->> 'ok') || ' ' || (j ->> 'shared_with_coach') || ' ' || (j ->> 'new_code'), 'true false true');
    perform pg_temp.t_admin();
    execute format('select new_code from public.alignment_sessions where token = %L', tok) into new_code;
    f := f || pg_temp.t_eq('N2b a new code is made, 6 characters from the code alphabet',
      (new_code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$')::text, 'true');
    f := f || pg_temp.t_eq('N2c ... different from the old one', (new_code <> upper(old_code))::text, 'true');
    f := f || pg_temp.t_eq('N2d ... and never in the answer to whoever made the change',
      (position(new_code in j::text) = 0 and not (j ? 'code'))::text, 'true');

    -- ------------------------------------------------ N3. try 1: the old code, by every call
    perform pg_temp.t_anon();
    f := f || pg_temp.t_eq('N3a the old code no longer opens it, and says the code has changed', public.alignment_open(tok, hc_email, old_code) ->> 'error', 'new_code');
    perform pg_temp.t_unlock(tok); perform pg_temp.t_anon();
    f := f || pg_temp.t_eq('N3b ... nor saves over it',
      public.alignment_save(tok, hc_email, old_code, '{"objective": "045 overwritten"}', '{"screen": "objective"}', 1, false) ->> 'error', 'new_code');
    perform pg_temp.t_unlock(tok); perform pg_temp.t_anon();
    f := f || pg_temp.t_eq('N3c ... nor switches it back to shared', public.alignment_set_sharing(tok, hc_email, old_code, true) ->> 'error', 'new_code');
    perform pg_temp.t_unlock(tok); perform pg_temp.t_anon();
    f := f || pg_temp.t_eq('N3d ... nor asks for the guest''s results email', public.alignment_email_check(tok, hc_email, old_code, 'link') ->> 'error', 'new_code');
    perform pg_temp.t_unlock(tok);
    f := f || pg_temp.t_eq('N3e ... and the answers were not changed',
      pg_temp.t_n(format('select data ->> ''objective'' from public.alignment_sessions where token = %L', tok)), '045 test objective');
    perform pg_temp.t_as(coach);
    f := f || pg_temp.t_eq('N3f the old code fails signed in as the coach too', public.alignment_open(tok, hc_email, old_code) ->> 'error', 'new_code');
    f := f || pg_temp.t_eq('N3g ... with the new code nowhere in the answer', (position(new_code in public.alignment_open(tok, hc_email, old_code)::text) = 0)::text, 'true');
    perform pg_temp.t_unlock(tok); perform pg_temp.t_anon();
    f := f || pg_temp.t_eq('N3h another email with the old code is simply wrong', public.alignment_open(tok, 'someone@example.invalid', old_code) ->> 'error', 'invalid');
    perform pg_temp.t_unlock(tok);

    -- ------------------------------------------------ N4. try 2: the coach's own sign-in
    perform pg_temp.t_as(coach);
    j := public.alignment_coach_answers(tok);
    f := f || pg_temp.t_eq('N4a the coach sees the link''s status only', (j ->> 'ok') || ' ' || (j ->> 'shared'), 'true false');
    f := f || pg_temp.t_eq('N4b ... with no answers and no code',
      ((j ? 'data') or position('045 test objective' in j::text) > 0 or position(new_code in j::text) > 0)::text, 'false');
    f := f || pg_temp.t_eq('N4c the coach can''t ask for the new code',
      pg_temp.t_n(format('select public.alignment_new_code_to_send(%L, %L, %L)::text', tok, hc_email, old_code)), 'error 42501');
    perform pg_temp.t_as(other_u);
    f := f || pg_temp.t_eq('N4d nor can anyone else signed in',
      pg_temp.t_n(format('select public.alignment_new_code_to_send(%L, %L, %L)::text', tok, hc_email, old_code)), 'error 42501');
    perform pg_temp.t_anon();
    f := f || pg_temp.t_eq('N4e nor someone signed out',
      pg_temp.t_n(format('select public.alignment_new_code_to_send(%L, %L, %L)::text', tok, hc_email, old_code)), 'error 42501');

    -- ------------------------------------------------ N5. try 3: straight to the table
    perform pg_temp.t_as(coach);
    f := f || pg_temp.t_eq('N5a the coach can''t read the table',
      pg_temp.t_n(format('select new_code from public.alignment_sessions where token = %L', tok)), 'error 42501');
    perform pg_temp.t_anon();
    f := f || pg_temp.t_eq('N5b nor can someone signed out',
      pg_temp.t_n(format('select new_code from public.alignment_sessions where token = %L', tok)), 'error 42501');
    perform pg_temp.t_service();
    f := f || pg_temp.t_eq('N5c nor the server''s key',
      pg_temp.t_n(format('select new_code from public.alignment_sessions where token = %L', tok)), 'error 42501');
    perform pg_temp.t_as(coach);
    f := f || pg_temp.t_eq('N5d the coach can''t write to it',
      pg_temp.t_n(format('update public.alignment_sessions set shared_with_coach = true where token = %L returning 1', tok)), 'error 42501');
    perform pg_temp.t_admin();
    f := f || pg_temp.t_eq('N5e row level security is on',
      pg_temp.t_n($q$select relrowsecurity::text from pg_class where oid = 'public.alignment_sessions'::regclass$q$), 'true');

    -- ------------------------------------------------ N6. the email server: the guest's own address only
    perform pg_temp.t_service();
    f := f || pg_temp.t_eq('N6a another email gets nothing', public.alignment_new_code_to_send(tok, 'someone@example.invalid', old_code) ->> 'error', 'invalid');
    f := f || pg_temp.t_eq('N6b a made-up code gets nothing', public.alignment_new_code_to_send(tok, hc_email, 'ZZZZZZ') ->> 'error', 'invalid');
    j := public.alignment_new_code_to_send(tok, ' ' || upper(hc_email) || ' ', lower(old_code));
    f := f || pg_temp.t_eq('N6c the guest''s open page (old code) asks for it to be sent', (j ->> 'ok') || ' ' || ((j ->> 'code') = new_code)::text, 'true true');
    f := f || pg_temp.t_eq('N6d ... to the address on the link',
      ((j ->> 'respondent_email') = hc_email)::text, 'true');
    f := f || pg_temp.t_eq('N6e the new code asks too', public.alignment_new_code_to_send(tok, hc_email, new_code) ->> 'ok', 'true');
    f := f || pg_temp.t_eq('N6f a third time in the hour', public.alignment_new_code_to_send(tok, hc_email, new_code) ->> 'ok', 'true');
    f := f || pg_temp.t_eq('N6g a fourth is refused', public.alignment_new_code_to_send(tok, hc_email, new_code) ->> 'error', 'limit');
    perform pg_temp.t_unlock(tok); perform pg_temp.t_service();
    perform public.alignment_new_code_to_send(tok, hc_email, 'ZZZZZ' || n) from generate_series(1, 5) n;
    f := f || pg_temp.t_eq('N6h five wrong codes lock it, as every other call (no guessing)',
      public.alignment_new_code_to_send(tok, hc_email, new_code) ->> 'error', 'locked');
    perform pg_temp.t_unlock(tok);

    -- ------------------------------------------------ N7. the guest opens with the new code
    perform pg_temp.t_anon();
    j := public.alignment_open(tok, hc_email, lower(new_code));
    f := f || pg_temp.t_eq('N7a the new code opens it, still Only you', (j ->> 'ok') || ' ' || (j ->> 'shared_with_coach') || ' ' || (j -> 'data' ->> 'objective'), 'true false 045 test objective');
    perform pg_temp.t_admin();
    f := f || pg_temp.t_eq('N7b ... and the new code is no longer kept',
      pg_temp.t_n(format('select (new_code is null and replaced_code_hash is null)::text from public.alignment_sessions where token = %L', tok)), 'true');
    perform pg_temp.t_service();
    f := f || pg_temp.t_eq('N7c nothing is left to send', public.alignment_new_code_to_send(tok, hc_email, new_code) ->> 'error', 'invalid');
    perform pg_temp.t_anon();
    f := f || pg_temp.t_eq('N7d the old code still opens nothing', public.alignment_open(tok, hc_email, old_code) ->> 'error', 'invalid');
    perform pg_temp.t_unlock(tok);

    -- ------------------------------------------------ N8. try 4: switching the choice as the coach
    perform pg_temp.t_as(coach);
    f := f || pg_temp.t_eq('N8a the coach can''t switch it back with the old code', public.alignment_set_sharing(tok, hc_email, old_code, true) ->> 'error', 'invalid');
    perform pg_temp.t_unlock(tok); perform pg_temp.t_as(coach);
    f := f || pg_temp.t_eq('N8b ... nor with no code', public.alignment_set_sharing(tok, hc_email, '', true) ->> 'error', 'invalid');
    perform pg_temp.t_unlock(tok);
    f := f || pg_temp.t_eq('N8c the choice is still Only you',
      pg_temp.t_n(format('select shared_with_coach::text from public.alignment_sessions where token = %L', tok)), 'false');

    -- ------------------------------------------------ N9. the guest switches back and forth with their code
    perform pg_temp.t_anon();
    j := public.alignment_set_sharing(tok, hc_email, new_code, true);
    f := f || pg_temp.t_eq('N9a back to You and Tim with the current code, no new code', (j ->> 'ok') || ' ' || (j ->> 'shared_with_coach') || ' ' || (j ->> 'new_code'), 'true true false');
    j := public.alignment_set_sharing(tok, hc_email, new_code, false);
    f := f || pg_temp.t_eq('N9b Only you again: no second code (nobody else has this one)', (j ->> 'ok') || ' ' || (j ->> 'shared_with_coach') || ' ' || (j ->> 'new_code'), 'true false false');
    f := f || pg_temp.t_eq('N9c the same code still opens it', public.alignment_open(tok, hc_email, new_code) ->> 'ok', 'true');
    perform public.alignment_save(tok, hc_email, new_code, answers || '{"completedAt": "2026-11-15T10:00:00.000Z"}', '{"screen": "results"}', 1, true);
    f := f || pg_temp.t_eq('N9d finished with Only you: no completion email', public.alignment_email_check(tok, hc_email, new_code, 'complete') ->> 'error', 'private');
    perform public.alignment_set_sharing(tok, hc_email, new_code, true);
    perform pg_temp.t_as(coach);
    j := public.alignment_coach_answers(tok);
    f := f || pg_temp.t_eq('N9e shared again by the guest: the coach reads the answers by their sign-in', (j ->> 'shared') || ' ' || (j -> 'data' ->> 'objective'), 'true 045 test objective');
    f := f || pg_temp.t_eq('N9f ... and never the code', (position(new_code in j::text) = 0)::text, 'true');
    perform pg_temp.t_anon();
    f := f || pg_temp.t_eq('N9g the coach''s old code still opens nothing while shared', public.alignment_open(tok, hc_email, old_code) ->> 'error', 'invalid');
    perform pg_temp.t_unlock(tok);

    -- ------------------------------------------------ N10. a coach who switches to Only you first never learns the code
    perform pg_temp.t_admin();
    l2 := public.create_alignment_session('045 test organisation two', hc_email, (select upper(email) from auth.users where id = coach));
    tok2 := l2 ->> 'token'; old2 := l2 ->> 'access_code';
    perform pg_temp.t_as(coach);
    j := public.alignment_set_sharing(tok2, hc_email, old2, false);
    f := f || pg_temp.t_eq('N10a the change gives back no code', ((j ->> 'new_code') = 'true' and not (j ? 'code'))::text, 'true');
    f := f || pg_temp.t_eq('N10b the coach''s code stops working at once', public.alignment_open(tok2, hc_email, old2) ->> 'error', 'new_code');
    perform pg_temp.t_unlock(tok2);
    perform pg_temp.t_as(coach);
    f := f || pg_temp.t_eq('N10c the coach can''t switch it back', public.alignment_set_sharing(tok2, hc_email, old2, true) ->> 'error', 'new_code');
    perform pg_temp.t_unlock(tok2);
    perform pg_temp.t_service();
    f := f || pg_temp.t_eq('N10d the new code goes only to the guest''s address',
      ((public.alignment_new_code_to_send(tok2, hc_email, old2) ->> 'respondent_email') = hc_email)::text, 'true');

    -- ------------------------------------------------ N12. Only you chosen before 045 (the coach still had the code)
    perform pg_temp.t_admin();
    l2 := public.create_alignment_session('045 test organisation three', hc_email, (select upper(email) from auth.users where id = coach));
    tok2 := l2 ->> 'token'; old2 := l2 ->> 'access_code';
    update public.alignment_sessions set shared_with_coach = false where token = tok2; -- as 044 left it
    f := f || pg_temp.t_eq('N12a 045 gives an earlier Only you a new code', (public._alignment_reissue_private() >= 1)::text, 'true');
    f := f || pg_temp.t_eq('N12b ... once (a second run passes it by)',
      pg_temp.t_n(format('select (public._alignment_reissue_private() = 0 and (select new_code is not null from public.alignment_sessions where token = %L))::text', tok2)), 'true');
    perform pg_temp.t_as(coach);
    f := f || pg_temp.t_eq('N12c the coach''s code no longer opens it', public.alignment_open(tok2, hc_email, old2) ->> 'ok', 'false');
    perform pg_temp.t_unlock(tok2); perform pg_temp.t_as(coach);
    f := f || pg_temp.t_eq('N12d ... nor saves over it', public.alignment_save(tok2, hc_email, old2, '{"objective": "x"}', '{"screen": "objective"}', 0, false) ->> 'ok', 'false');
    perform pg_temp.t_unlock(tok2); perform pg_temp.t_as(coach);
    f := f || pg_temp.t_eq('N12e ... nor switches it back', public.alignment_set_sharing(tok2, hc_email, old2, true) ->> 'ok', 'false');
    perform pg_temp.t_unlock(tok2); perform pg_temp.t_service();
    f := f || pg_temp.t_eq('N12f the guest''s page can have the new code sent to their address',
      ((public.alignment_new_code_to_send(tok2, hc_email, old2) ->> 'respondent_email') = hc_email)::text, 'true');
    perform pg_temp.t_admin();
    l2 := public.create_alignment_session('045 test organisation four', hc_email, (select upper(email) from auth.users where id = coach));
    perform public._alignment_reissue_private();
    f := f || pg_temp.t_eq('N12g a link still shared is left alone',
      pg_temp.t_n(format('select (code_reissued_at is null and new_code is null)::text from public.alignment_sessions where token = %L', l2 ->> 'token')), 'true');
    f := f || pg_temp.t_eq('N12h nobody but Tim may run the backfill',
      pg_temp.t_n($q$select string_agg(r, ',' order by r) from (values ('anon'), ('authenticated'), ('service_role')) v(r)
                     where has_function_privilege(r, 'public._alignment_reissue_private()', 'execute') or has_function_privilege(r, 'public._alignment_new_code()', 'execute')$q$), 'null');

    -- ------------------------------------------------ N11. rights on the functions
    perform pg_temp.t_admin();
    f := f || pg_temp.t_eq('N11a only the server may call alignment_new_code_to_send',
      pg_temp.t_n($q$select string_agg(r, ',' order by r) from (values ('anon'), ('authenticated'), ('service_role')) v(r)
                     where has_function_privilege(r, 'public.alignment_new_code_to_send(text,text,text)', 'execute')$q$), 'service_role');
    f := f || pg_temp.t_eq('N11b the guest''s choice stays callable signed out or in',
      pg_temp.t_n($q$select string_agg(r, ',' order by r) from (values ('anon'), ('authenticated'), ('service_role')) v(r)
                     where has_function_privilege(r, 'public.alignment_set_sharing(text,text,text,boolean)', 'execute')$q$), 'anon,authenticated');
    f := f || pg_temp.t_eq('N11c 045 is in the migration log',
      pg_temp.t_n($q$select count(*)::text from public.migration_log where number = 45$q$), '1');

    raise exception using errcode = 'TT001', message = 'undo the test';
  exception when sqlstate 'TT001' then null;
  end;
  perform pg_temp.t_admin();
  if cardinality(f) > 0 then
    raise exception 'FAILED (% of the checks): %', cardinality(f), array_to_string(f, ' | ');
  end if;
  raise notice '045 CHECKS PASSED';
end
$t$;
