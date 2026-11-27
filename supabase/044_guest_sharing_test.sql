-- =============================================================================
-- 044_guest_sharing_test.sql: checks migration 044
--
-- Run after 044, on the test project only, inside a transaction that is
-- rolled back. To check that 044 is safe to run twice, run it twice first:
--   bash scripts/dry-run-on-test.sh supabase/migrations/044_guest_sharing.sql \
--     supabase/migrations/044_guest_sharing.sql supabase/044_guest_sharing_test.sql
-- and with the guest links underneath (035, 042 and 043 first):
--   bash scripts/dry-run-on-test.sh supabase/migrations/035_guest_links.sql \
--     supabase/migrations/042_guest_copy.sql supabase/migrations/043_tool_answers.sql \
--     supabase/migrations/044_guest_sharing.sql supabase/migrations/044_guest_sharing.sql \
--     supabase/044_guest_sharing_test.sql
--
-- WHAT IT DOES
--   Makes invented people (a coach, another coach, a guest who later makes
--   an account, someone else) and checks, as each of them:
--   A. the outside Health Check: shared by default; the guest's choice saved
--      with the link, email and code only; switching to Only you halfway and
--      back; no completion email while it is Only you, and one once it is
--      shared again; the coach learns it finished but never reads the
--      answers, by any route (the coach's function, the table, the email
--      server's function, a decisions row by its id); claiming into the
--      account with the same confirmed email, once, with the choice moving
--      with it, into the team of the same name.
--   B. other guest tools (only where 035 has run): the guest's choice by
--      visit key; the coach's answers refused (42501) while it is Only you,
--      and the lists still saying finished; the guest's own copy still
--      issued; claiming carries the choice into the saved item.
--   No email address is ever shown: addresses are compared inside the
--   database. Everything it makes is undone at the end.
--
--   It ends with the notice 044 CHECKS PASSED, or stops with FAILED and a
--   list naming each check that failed.
-- =============================================================================

-- ---------------------------------------------------------------- helpers
create or replace function pg_temp.t_as(p uuid) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated', 'aal', 'aal2')::text, true);  -- 054: signed in with the code
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
create or replace function pg_temp.t44_user(p_label text, p_email text default null, p_confirmed boolean default true) returns uuid language plpgsql as $f$
declare u uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, aud, role, email_confirmed_at)
  values (u, coalesce(p_email, '044-test-' || p_label || '-' || u || '@example.invalid'), 'authenticated', 'authenticated',
          case when p_confirmed then now() end);
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

-- ---------------------------------------------------------------- the checks
do $t$
declare
  f text[] := '{}';
  has_coaches boolean := to_regclass('public.coaches') is not null;
  has_guests boolean := to_regclass('public.guest_links') is not null and to_regprocedure('public.guest_set_sharing(text,boolean)') is not null;
  coach uuid; coach_b uuid; other_u uuid; claimer uuid; unconfirmed uuid;
  hc_email constant text := '044-test-guest-hc@example.invalid';
  l jsonb; tok text; code text; l2 jsonb; tok2 text;
  answers constant jsonb := '{"objective": "044 test objective", "csfs": [{"id": "f1", "text": "044 test Success Factor"}], "projects": [{"id": "p1", "text": "044 test project"}]}';
  j jsonb; d_id uuid; team_id text; done_day text;
  -- guest links
  gl jsonb; gtok text; gv text; gd jsonb; vno text;
begin
  begin
    coach := pg_temp.t44_user('coach'); coach_b := pg_temp.t44_user('coachb'); other_u := pg_temp.t44_user('other');
    if has_coaches then
      execute 'insert into public.coaches (user_id, role, display_first_name) values ($1, ''coach'', ''Rhys''), ($2, ''coach'', ''Priya'')'
        using coach, coach_b;
    end if;

    -- ------------------------------------------------ A1. a link, shared by default
    perform pg_temp.t_admin();
    l := public.create_alignment_session('044 test organisation', hc_email, (select upper(email) from auth.users where id = coach));
    tok := l ->> 'token'; code := l ->> 'access_code';
    f := f || pg_temp.t_eq('A1a a new Health Check is shared by default',
      pg_temp.t_n(format('select shared_with_coach::text from public.alignment_sessions where token = %L', tok)), 'true');
    f := f || pg_temp.t_eq('A1b the column is never empty',
      pg_temp.t_n($q$select is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'alignment_sessions' and column_name = 'shared_with_coach'$q$), 'NO');
    perform pg_temp.t_anon();
    j := public.alignment_open(tok, hc_email, code);
    f := f || pg_temp.t_eq('A1c the guest''s page reads the choice', j ->> 'shared_with_coach', 'true');
    perform public.alignment_save(tok, hc_email, code, answers, '{"screen": "objective"}', 0, false);

    -- ------------------------------------------------ A2. only the guest sets it
    f := f || pg_temp.t_eq('A2a a wrong code can''t set it',
      public.alignment_set_sharing(tok, hc_email, 'ZZZZZZ', false) ->> 'error', 'invalid');
    f := f || pg_temp.t_eq('A2b another email can''t set it',
      public.alignment_set_sharing(tok, 'someone@example.invalid', code, false) ->> 'error', 'invalid');
    f := f || pg_temp.t_eq('A2c a made-up link can''t set it',
      public.alignment_set_sharing('no-such-link', hc_email, code, false) ->> 'error', 'invalid');
    perform pg_temp.t_admin();
    -- the wrong tries above count towards the lockout, as every call's do; start again
    update public.alignment_sessions set failed_attempts = 0, locked_until = null where token = tok;
    perform pg_temp.t_anon();
    -- halfway through: Only you
    j := public.alignment_set_sharing(tok, ' ' || upper(hc_email) || ' ', lower(code), false);
    f := f || pg_temp.t_eq('A2d the guest chooses Only you halfway (email and code as typed)', (j ->> 'ok') || ' ' || (j ->> 'shared_with_coach'), 'true false');
    -- Where 045 has run, Only you gives the guest a new code by email (the
    -- old one stops working): the test carries on with the new one.
    perform pg_temp.t_admin();
    if exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'alignment_sessions' and column_name = 'new_code') then
      execute format('select coalesce(new_code, %L) from public.alignment_sessions where token = %L', code, tok) into code;
    end if;
    perform pg_temp.t_anon();
    f := f || pg_temp.t_eq('A2e ... and their page reads it back', public.alignment_open(tok, hc_email, code) ->> 'shared_with_coach', 'false');
    f := f || pg_temp.t_eq('A2f an empty choice is refused', public.alignment_set_sharing(tok, hc_email, code, null) ->> 'error', 'invalid');

    -- ------------------------------------------------ A3. finished with Only you: no email to anyone but the guest
    perform public.alignment_save(tok, hc_email, code, answers || '{"completedAt": "2026-11-14T10:00:00.000Z"}', '{"screen": "results"}', 1, true);
    f := f || pg_temp.t_eq('A3a no completion email while it is Only you',
      public.alignment_email_check(tok, hc_email, code, 'complete') ->> 'error', 'private');
    perform pg_temp.t_admin();
    f := f || pg_temp.t_eq('A3b ... and nothing is marked as sent',
      pg_temp.t_n(format('select (notified_at is null)::text from public.alignment_sessions where token = %L', tok)), 'true');
    perform pg_temp.t_service();
    f := f || pg_temp.t_eq('A3c the email server learns no coach address for it',
      public.alignment_recipients(tok) ->> 'error', 'private');
    perform pg_temp.t_anon();
    f := f || pg_temp.t_eq('A3d the guest''s own "Email my link" still works',
      public.alignment_email_check(tok, hc_email, code, 'link') ->> 'ok', 'true');

    -- ------------------------------------------------ A4. the coach, by every route
    perform pg_temp.t_as(coach);
    j := public.alignment_coach_answers(tok);
    f := f || pg_temp.t_eq('A4a the coach sees that it finished', (j ->> 'ok') || ' ' || (j ->> 'shared') || ' ' || (j ->> 'status'), 'true false complete');
    f := f || pg_temp.t_eq('A4b ... but no answers come back', (j ? 'data')::text || ' ' || (position('044 test objective' in j::text) > 0)::text, 'false false');
    f := f || pg_temp.t_eq('A4c the coach can''t read the table',
      pg_temp.t_n('select count(*) from public.alignment_sessions'), 'error 42501');
    f := f || pg_temp.t_eq('A4d ... nor ask the email server''s function',
      pg_temp.t_n(format('select public.alignment_recipients(%L)::text', tok)), 'error 42501');
    f := f || pg_temp.t_eq('A4e ... nor set the guest''s choice without their code',
      public.alignment_set_sharing(tok, hc_email, 'ZZZZZZ', true) ->> 'error', 'invalid');
    perform pg_temp.t_as(coach_b);
    f := f || pg_temp.t_eq('A4f another coach learns nothing at all',
      public.alignment_coach_answers(tok) ->> 'error', 'invalid');
    perform pg_temp.t_anon();
    f := f || pg_temp.t_eq('A4g someone signed out can''t call the coach''s function',
      pg_temp.t_n(format('select public.alignment_coach_answers(%L)::text', tok)), 'error 42501');
    perform pg_temp.t_admin();
    update public.alignment_sessions set failed_attempts = 0, locked_until = null where token = tok;

    -- ------------------------------------------------ A5. back to You and the coach: the email goes, once
    perform pg_temp.t_anon();
    j := public.alignment_set_sharing(tok, hc_email, code, true);
    f := f || pg_temp.t_eq('A5a switching back says the email hasn''t gone yet', (j ->> 'shared_with_coach') || ' ' || (j ->> 'notified') || ' ' || (j ->> 'status'), 'true false complete');
    j := public.alignment_email_check(tok, hc_email, code, 'complete');
    f := f || pg_temp.t_eq('A5b the completion email can go now', (j ->> 'ok') || ' ' || (j ->> 'has_coach'), 'true true');
    f := f || pg_temp.t_eq('A5c ... once only', public.alignment_email_check(tok, hc_email, code, 'complete') ->> 'error', 'already');
    perform pg_temp.t_service();
    j := public.alignment_recipients(tok);
    perform pg_temp.t_admin();
    f := f || pg_temp.t_eq('A5d the email server learns the coach''s address',
      ((j ->> 'coach_email') = (select email from auth.users where id = coach))::text, 'true');
    perform pg_temp.t_as(coach);
    f := f || pg_temp.t_eq('A5e the coach reads the answers', public.alignment_coach_answers(tok) -> 'data' ->> 'objective', '044 test objective');
    -- and Only you again, after the email went
    perform pg_temp.t_anon();
    perform public.alignment_set_sharing(tok, hc_email, code, false);
    perform pg_temp.t_as(coach);
    f := f || pg_temp.t_eq('A5f Only you again: the coach can''t read them any more', (public.alignment_coach_answers(tok) ? 'data')::text, 'false');

    -- ------------------------------------------------ A6. claiming into the account with the same confirmed email
    perform pg_temp.t_admin();
    -- an unfinished one with the same email stays outside; a finished one with a blank organisation is "My team"
    insert into public.alignment_sessions (token, access_code_hash, client_label, respondent_email, status, data)
    values ('044-test-unfinished', 'x', '044 test organisation', hc_email, 'in_progress', answers);
    insert into public.alignment_sessions (token, access_code_hash, client_label, respondent_email, status, data, completed_at, shared_with_coach)
    values ('044-test-no-organisation', 'x', '   ', hc_email, 'complete', answers, now() - interval '1 day', true);
    unconfirmed := pg_temp.t44_user('unconfirmed', upper(hc_email), false);
    perform pg_temp.t_as(unconfirmed);
    f := f || pg_temp.t_eq('A6a an account whose email isn''t confirmed claims nothing', public.alignment_claim()::text, '0');
    perform pg_temp.t_admin();
    delete from auth.users where id = unconfirmed;
    claimer := pg_temp.t44_user('claimer', ' ' || upper(hc_email), true);
    -- the account already has a team of that name (another letter case)
    insert into public.decisions (user_id, tool_type, title, form_data, status)
    values (claimer, 'strategic-alignment', '044 Test Organisation',
            jsonb_build_object('shape', 2, 'team', jsonb_build_object('id', '044-team', 'name', '044 Test Organisation'), 'date', '2026-10-01',
                               'made', 'team', 'from', null, 'data', answers, 'step', null, 'shared_with_coach', true), 'completed');
    done_day := to_char((select completed_at from public.alignment_sessions where token = tok) at time zone 'UTC', 'YYYY-MM-DD');
    perform pg_temp.t_as(other_u);
    f := f || pg_temp.t_eq('A6b someone else claims nothing of theirs', public.alignment_claim()::text, '0');
    perform pg_temp.t_anon();
    f := f || pg_temp.t_eq('A6c someone signed out can''t claim', pg_temp.t_n('select public.alignment_claim()::text'), 'error 42501');
    perform pg_temp.t_as(claimer);
    f := f || pg_temp.t_eq('A6d the account claims its two finished Health Checks', public.alignment_claim()::text, '2');
    f := f || pg_temp.t_eq('A6e ... claiming again moves nothing', public.alignment_claim()::text, '0');
    select d.id, d.form_data -> 'team' ->> 'id' into d_id, team_id from public.decisions d
     where d.user_id = claimer and d.form_data ? 'from_outside' and d.title = '044 test organisation';
    f := f || pg_temp.t_eq('A6f it joins the account''s team of the same name', team_id, '044-team');
    f := f || pg_temp.t_eq('A6g ... as a finished inside version of shape 2, made as a team',
      pg_temp.t_n(format($q$select concat_ws(' ', tool_type, status, draft::text, form_data ->> 'shape', form_data ->> 'made', form_data ->> 'date', form_data -> 'data' ->> 'objective')
                            from public.decisions where id = %L$q$, d_id)),
      'strategic-alignment completed false 2 team ' || done_day || ' 044 test objective');
    f := f || pg_temp.t_eq('A6h ... the guest''s Only you moves with it', pg_temp.t_n(format($q$select form_data ->> 'shared_with_coach' from public.decisions where id = %L$q$, d_id)), 'false');
    f := f || pg_temp.t_eq('A6i ... marked from outside, with the organisation', pg_temp.t_n(format($q$select (form_data -> 'from_outside' ->> 'organisation') || ' ' || ((form_data -> 'from_outside' ->> 'at') is not null)::text from public.decisions where id = %L$q$, d_id)), '044 test organisation true');
    f := f || pg_temp.t_eq('A6j a Health Check with no organisation becomes "My team", shared as chosen',
      pg_temp.t_n($q$select string_agg(title || ' ' || (form_data ->> 'shared_with_coach') || ' ' || (form_data -> 'team' ->> 'id' <> '044-team')::text, ',') from public.decisions where form_data -> 'from_outside' is not null and title = 'My team'$q$), 'My team true true');
    f := f || pg_temp.t_eq('A6k the claimer reads them the normal way', pg_temp.t_n('select count(*) from public.decisions where form_data ? ''from_outside'''), '2');
    perform pg_temp.t_admin();
    f := f || pg_temp.t_eq('A6l the session records whose account and which item',
      pg_temp.t_n(format('select (user_id = %L and claimed_at is not null and claimed_decision_id = %L)::text from public.alignment_sessions where token = %L', claimer, d_id, tok)), 'true');
    f := f || pg_temp.t_eq('A6m the unfinished one stays outside',
      pg_temp.t_n($q$select (claimed_at is null)::text from public.alignment_sessions where token = '044-test-unfinished'$q$), 'true');
    perform pg_temp.t_as(coach);
    f := f || pg_temp.t_eq('A6n the coach can''t read the claimed item by its id',
      pg_temp.t_n(format('select count(*) from public.decisions where id = %L', d_id)), '0');
    perform pg_temp.t_anon();
    f := f || pg_temp.t_eq('A6o the outside link still opens for the guest', public.alignment_open(tok, hc_email, code) ->> 'ok', 'true');

    -- ------------------------------------------------ B. other guest tools (035)
    if has_guests and has_coaches then
      perform pg_temp.t_as(coach);
      gl := public.guest_link_create('grow');
      gtok := substr(gl ->> 'link_path', 8);
      perform pg_temp.t_anon();
      j := public.guest_open(gtok, '044-test-guest-tool@example.invalid', gl ->> 'code');
      gv := j ->> 'visit';
      gd := public.guest_save(gv, 'decisions', '{"title": "044 test plan", "form_data": {"goal": "044 test goal"}}');
      f := f || pg_temp.t_eq('B1a a guest link is shared by default', public.guest_sharing(gv) ->> 'shared_with_coach', 'true');
      perform pg_temp.t_as(coach);
      f := f || pg_temp.t_eq('B1b the coach reads the answers while shared',
        pg_temp.t_n(format($q$select public.coach_guest_answers(%L::uuid) -> 'decisions' -> 0 ->> 'title'$q$, gl ->> 'link_id')), '044 test plan');
      -- halfway: Only you
      perform pg_temp.t_anon();
      j := public.guest_set_sharing(gv, false);
      f := f || pg_temp.t_eq('B2a the guest chooses Only you with their visit key', (j ->> 'ok') || ' ' || (j ->> 'shared_with_coach'), 'true false');
      f := f || pg_temp.t_eq('B2b ... and reads it back', public.guest_sharing(gv) ->> 'shared_with_coach', 'false');
      f := f || pg_temp.t_eq('B2c ... it is written into their saved item',
        (select o -> 'form_data' ->> 'shared_with_coach' from jsonb_array_elements(public.guest_rows(gv, 'decisions')) o limit 1), 'false');
      f := f || pg_temp.t_eq('B2d a made-up visit key is refused', pg_temp.t_n(format('select public.guest_set_sharing(%L, false)::text', repeat('f', 64))), 'error 42501');
      f := f || pg_temp.t_eq('B2e an empty choice is refused', pg_temp.t_n(format('select public.guest_set_sharing(%L, null)::text', gv)), 'error 22023');
      perform public.guest_save(gv, 'decisions', jsonb_build_object('id', gd ->> 'id', 'status', 'completed', 'form_data', '{"goal": "044 test goal", "shared_with_coach": false}'::jsonb));
      perform public.guest_finish(gv);
      perform pg_temp.t_as(coach);
      f := f || pg_temp.t_eq('B3a the coach''s answers are refused while it is Only you',
        pg_temp.t_n(format('select public.coach_guest_answers(%L::uuid)::text', gl ->> 'link_id')), 'error 42501');
      f := f || pg_temp.t_eq('B3b the coach''s links say it finished, and not shared',
        pg_temp.t_n(format('select (finished_at is not null)::text || '' '' || shared_with_coach::text from public.coach_links() where link_id = %L', gl ->> 'link_id')), 'true false');
      f := f || pg_temp.t_eq('B3c the coach''s guests say the same',
        pg_temp.t_n(format($q$select (l ->> 'finished_at' is not null)::text || ' ' || (l ->> 'shared_with_coach') from public.coach_guests() g, jsonb_array_elements(g.links) l where l ->> 'link_id' = %L$q$, gl ->> 'link_id')), 'true false');
      f := f || pg_temp.t_eq('B3d the coach can''t read the guest''s row by its id',
        pg_temp.t_n(format('select count(*) from public.decisions where id = %L', gd ->> 'id')), '0');
      f := f || pg_temp.t_eq('B3e ... nor the link table',
        pg_temp.t_n('select count(*) from public.guest_links'), 'error 42501');
      f := f || pg_temp.t_eq('B3f ... nor set the guest''s choice',
        pg_temp.t_n(format('select public.guest_set_sharing(%L, true)::text', repeat('e', 64))), 'error 42501');
      perform pg_temp.t_as(coach_b);
      f := f || pg_temp.t_eq('B3g another coach is refused too',
        pg_temp.t_n(format('select public.coach_guest_answers(%L::uuid)::text', gl ->> 'link_id')), 'error 42501');
      if to_regprocedure('public.guest_copy_issue(text)') is not null then
        -- with 046 a copy goes only to the address the link was made for
        if to_regprocedure('public.guest_link_create(text,text)') is not null then
          perform pg_temp.t_admin();
          execute format('update public.guest_links set for_email = %L where id = %L', '044-test-guest-tool@example.invalid', gl ->> 'link_id');
        end if;
        perform pg_temp.t_service();
        f := f || pg_temp.t_eq('B3h the guest still gets their own copy', public.guest_copy_issue(gv) ->> 'ok', 'true');
      end if;
      -- and back
      perform pg_temp.t_anon();
      perform public.guest_set_sharing(gv, true);
      perform pg_temp.t_as(coach);
      f := f || pg_temp.t_eq('B4a switched back, the coach reads the answers again',
        pg_temp.t_n(format($q$select public.coach_guest_answers(%L::uuid) -> 'decisions' -> 0 -> 'form_data' ->> 'shared_with_coach'$q$, gl ->> 'link_id')), 'true');
      -- a visit with no link (coming back with the email only) has nothing to set
      perform pg_temp.t_admin();
      vno := repeat('9', 64);
      insert into public.guest_visits (key_hash, guest_id, confirmed)
      select public._guest_hash(vno), g.id, true from public.guests g where g.email = '044-test-guest-tool@example.invalid';
      perform pg_temp.t_anon();
      f := f || pg_temp.t_eq('B4b a visit with no link has no choice to set', public.guest_set_sharing(vno, false) ->> 'error', 'no_link');
      -- Only you, then the account with the same confirmed email claims it
      perform public.guest_set_sharing(gv, false);
      perform pg_temp.t_admin();
      claimer := pg_temp.t44_user('toolclaimer', '044-test-guest-tool@example.invalid', true);
      perform pg_temp.t_as(claimer);
      f := f || pg_temp.t_eq('B5a the account claims the guest''s work', (public.guest_claim() > 0)::text, 'true');
      f := f || pg_temp.t_eq('B5b ... and the Only you moves with it',
        pg_temp.t_n(format($q$select form_data ->> 'shared_with_coach' from public.decisions where id = %L and user_id = %L$q$, gd ->> 'id', claimer)), 'false');
      perform pg_temp.t_as(coach);
      f := f || pg_temp.t_eq('B5c the coach still can''t read it',
        pg_temp.t_n(format('select count(*) from public.decisions where id = %L', gd ->> 'id')), '0');
    else
      raise notice 'ok B: skipped (035 has not run on this database, so 044''s guest links part is not here).';
    end if;

    raise exception using errcode = 'TT001', message = 'undo the test';
  exception when sqlstate 'TT001' then null;
  end;
  perform pg_temp.t_admin();
  if cardinality(f) > 0 then
    raise exception 'FAILED (% of the checks): %', cardinality(f), array_to_string(f, ' | ');
  end if;
  raise notice '044 CHECKS PASSED';
end
$t$;
