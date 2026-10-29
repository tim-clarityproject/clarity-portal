-- =============================================================================
-- 037_alignment_choose_coach_test.sql: checks migration 037
--
-- Run after 034, 036 and 037, on the test project only, inside a transaction
-- that is rolled back. To check that 037 is safe to run twice, run it twice:
--   bash scripts/dry-run-on-test.sh supabase/migrations/034_alignment_coach_name.sql \
--     supabase/migrations/036_alignment_coach_only.sql supabase/migrations/037_alignment_choose_coach.sql \
--     supabase/migrations/037_alignment_choose_coach.sql supabase/037_alignment_choose_coach_test.sql
-- (On the feature branch, 035 goes before 036 as well.)
--
-- WHAT IT DOES
--   Makes invented people (Tim the owner, Adie a coach, two coaches who share
--   a first name, a coach who has left, and someone who is not a coach) and
--   checks who a new link can be made for: by first name or email, in the SQL
--   editor and signed in, with and without the coaches list (the list is
--   hidden for a moment inside the transaction to check the second). It
--   checks that a refused coach makes no link, that no message repeats an
--   email, that Adie reads the answers on a link made for her by name, and
--   that the helper stays closed to the app and the server. No email address
--   is ever shown. Everything it makes is undone at the end.
--
--   It ends with the notice 037 CHECKS PASSED, or stops with FAILED and a
--   list naming each check that failed.
-- =============================================================================

-- ---------------------------------------------------------------- helpers
create or replace function pg_temp.t_anon() returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('role', 'anon', true);
end $f$;
create or replace function pg_temp.t_as(p uuid) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $f$;
create or replace function pg_temp.t_admin() returns void language plpgsql as $f$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
end $f$;
-- the SQL editor with someone's sign-in (so auth.uid() is that person)
create or replace function pg_temp.t_admin_as(p uuid) returns void language plpgsql as $f$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p)::text, true);
end $f$;
create or replace function pg_temp.t37_user(p_label text) returns uuid language plpgsql as $f$
declare u uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, aud, role, email_confirmed_at)
  values (u, '037-test-' || p_label || '-' || u || '@example.invalid', 'authenticated', 'authenticated', now());
  update public.profiles set first_name = initcap(p_label), last_name = 'Test' where id = u;
  return u;
end $f$;
-- Makes a link for the coach given; returns the coach recorded ('none' for
-- no coach), or 'refused 42501: ...' / 'refused: ...' with the message.
create or replace function pg_temp.t37_make(p_coach text) returns text language plpgsql as $f$
declare j jsonb;
begin
  j := public.create_alignment_session('037 test organisation', '037-test-guest@example.invalid', p_coach);
  return coalesce((select s.coach_user_id::text from public.alignment_sessions s where s.token = j ->> 'token'), 'none');
exception when others then
  return case when sqlstate = '42501' then 'refused 42501: ' else 'refused: ' end || sqlerrm;
end $f$;
create or replace function pg_temp.t_eq(p_name text, p_got text, p_want text) returns text[] language sql as $f$
  select case when p_got is distinct from p_want
              then array[format('%s: expected %s, got %s', p_name, p_want, coalesce(p_got, 'nothing'))]
              else '{}'::text[] end;
$f$;
create or replace function pg_temp.t_refused(p_name text, p_got text) returns text[] language sql as $f$
  select case when p_got not like 'refused%'
              then array[format('%s: expected it to be refused, got %s', p_name, coalesce(p_got, 'nothing'))]
              when position('@' in p_got) > 0
              then array[format('%s: the message repeats an email', p_name)]
              else '{}'::text[] end;
$f$;

-- ---------------------------------------------------------------- the checks
do $t$
declare
  f text[] := '{}';
  tim uuid; adie uuid; sam1 uuid; sam2 uuid; gone uuid; other uuid;
  adie_email text;
  links_before integer;
  got text;
  j jsonb; tok text;
  answers constant jsonb := '{"objective": "037 test objective", "csfs": [{"id": "f1", "text": "037 test CSF"}], "projects": [{"id": "p1", "text": "037 test project"}]}';
begin
  if to_regclass('public.coaches') is null then
    raise exception 'FAILED: this test needs the coaches list (026), which the test project has.';
  end if;
  begin
    tim := pg_temp.t37_user('owner'); adie := pg_temp.t37_user('adie');
    sam1 := pg_temp.t37_user('samone'); sam2 := pg_temp.t37_user('samtwo');
    gone := pg_temp.t37_user('gone'); other := pg_temp.t37_user('other');
    select email into adie_email from auth.users where id = adie;
    execute 'insert into public.coaches (user_id, role, display_first_name, active) values
               ($1, ''owner'', ''Tim037'', true), ($2, ''coach'', ''Adie037'', true),
               ($3, ''coach'', ''Sam037'', true), ($4, ''coach'', ''Sam037'', true),
               ($5, ''coach'', ''Gone037'', false)'
      using tim, adie, sam1, sam2, gone;

    -- ------------------------------------------------ 1. Tim in the SQL editor
    perform pg_temp.t_admin();
    f := f || pg_temp.t_eq('1a a link for Adie by first name records Adie', pg_temp.t37_make('Adie037'), adie::text);
    f := f || pg_temp.t_eq('1b ... in any case, with spaces', pg_temp.t37_make('  aDIE037 '), adie::text);
    f := f || pg_temp.t_eq('1c ... or by her email', pg_temp.t37_make(upper(adie_email)), adie::text);
    f := f || pg_temp.t_eq('1d a link for Tim by first name records Tim', pg_temp.t37_make('Tim037'), tim::text);
    j := public.create_alignment_session('037 test organisation', '037-test-guest@example.invalid', 'Adie037');
    f := f || pg_temp.t_eq('1e the reply names the coach chosen', j ->> 'coach_name', 'Adie037');
    f := f || pg_temp.t_eq('1f ... and says a coach is recorded', j ->> 'coach_recorded', 'true');
    f := f || pg_temp.t_eq('1g ... and never holds an email', (position('@' in j::text) > 0)::text, 'false');
    f := f || pg_temp.t_eq('1h no coach given records nobody, as before', pg_temp.t37_make(null), 'none');
    f := f || pg_temp.t_eq('1i ... nor a blank one', pg_temp.t37_make('  '), 'none');
    j := public.create_alignment_session('037 test organisation', '037-test-guest@example.invalid');
    f := f || pg_temp.t_eq('1j the two-value form still records nobody',
      coalesce((select coach_user_id::text from public.alignment_sessions where token = j ->> 'token'), 'none'), 'none');

    select count(*) into links_before from public.alignment_sessions where client_label = '037 test organisation';
    f := f || pg_temp.t_refused('1k someone who is not a coach is refused (by email)',
      pg_temp.t37_make((select email from auth.users where id = other)));
    f := f || pg_temp.t_refused('1l ... a first name that is not a coach''s', pg_temp.t37_make('Other'));
    f := f || pg_temp.t_refused('1m ... an email no account has', pg_temp.t37_make('no-such-coach-037@example.invalid'));
    f := f || pg_temp.t_refused('1n ... a coach who has left', pg_temp.t37_make('Gone037'));
    got := pg_temp.t37_make('Sam037');
    f := f || pg_temp.t_refused('1o ... a first name two coaches share', got);
    f := f || pg_temp.t_eq('1p ... with a message that says to use the email', (got like '%Use the coach''s email instead%')::text, 'true');
    f := f || pg_temp.t_eq('1q ... and either of them can still be chosen by email',
      pg_temp.t37_make((select email from auth.users where id = sam2)), sam2::text);
    f := f || pg_temp.t_eq('1r a refused coach makes no link',
      (select count(*) from public.alignment_sessions where client_label = '037 test organisation')::text, (links_before + 1)::text);

    -- ------------------------------------------------ 2. someone signed in
    perform pg_temp.t_admin_as(tim);
    f := f || pg_temp.t_eq('2a the owner, signed in, may choose another coach', pg_temp.t37_make('Adie037'), adie::text);
    perform pg_temp.t_admin_as(adie);
    f := f || pg_temp.t_eq('2b a coach makes a link for themselves', pg_temp.t37_make('Adie037'), adie::text);
    f := f || pg_temp.t_eq('2c ... also with no coach given', pg_temp.t37_make(null), adie::text);
    got := pg_temp.t37_make('Tim037');
    f := f || pg_temp.t_eq('2d a coach can''t make a link for another coach', left(got, 13), 'refused 42501');
    perform pg_temp.t_admin_as(other);
    f := f || pg_temp.t_eq('2e someone who is not a coach can''t make a link for themselves', left(pg_temp.t37_make(null), 13), 'refused 42501');
    f := f || pg_temp.t_eq('2f ... nor for a coach', left(pg_temp.t37_make('Adie037'), 13), 'refused 42501');
    perform pg_temp.t_admin_as(gone);
    f := f || pg_temp.t_eq('2g a coach who has left can''t either', left(pg_temp.t37_make(null), 13), 'refused 42501');

    -- ------------------------------------------------ 3. Adie reads the answers on her link
    perform pg_temp.t_admin();
    j := public.create_alignment_session('037 test organisation', '037-test-guest-adie@example.invalid', 'Adie037');
    tok := j ->> 'token';
    perform pg_temp.t_anon();
    f := f || pg_temp.t_eq('3a the guest finishes the link made for Adie by name',
      public.alignment_save(tok, '037-test-guest-adie@example.invalid', j ->> 'access_code', answers, null, 0, true) ->> 'status', 'complete');
    f := f || pg_temp.t_eq('3b ... and is told it is Adie',
      public.alignment_open(tok, '037-test-guest-adie@example.invalid', j ->> 'access_code') ->> 'coach_name', 'Adie037');
    perform pg_temp.t_as(adie);
    f := f || pg_temp.t_eq('3c Adie reads the answers', (public.alignment_coach_answers(tok) -> 'data' = answers)::text, 'true');
    perform pg_temp.t_as(tim);
    f := f || pg_temp.t_eq('3d Tim (the owner) doesn''t', public.alignment_coach_answers(tok) ->> 'ok', 'false');
    perform pg_temp.t_as(sam1);
    f := f || pg_temp.t_eq('3e nor another coach', public.alignment_coach_answers(tok) ->> 'ok', 'false');
    perform pg_temp.t_admin();
    f := f || pg_temp.t_eq('3f the email server is told Adie''s address (compared here, never shown)',
      ((public.alignment_recipients(tok) ->> 'coach_email') = adie_email)::text, 'true');

    -- ------------------------------------------------ 4. without the coaches list (live before go-live)
    alter table public.coaches rename to coaches_hidden_037;
    f := f || pg_temp.t_eq('4a by email, the account is recorded', pg_temp.t37_make(adie_email), adie::text);
    got := pg_temp.t37_make('Adie037');
    f := f || pg_temp.t_refused('4b a first name is refused', got);
    f := f || pg_temp.t_eq('4c ... saying to give the email', (got like '%give the coach''s email%')::text, 'true');
    f := f || pg_temp.t_refused('4d an email no account has is refused', pg_temp.t37_make('no-such-coach-037@example.invalid'));
    f := f || pg_temp.t_eq('4e no coach given records nobody', pg_temp.t37_make(null), 'none');
    alter table public.coaches_hidden_037 rename to coaches;

    -- ------------------------------------------------ 5. who may call what
    f := f || pg_temp.t_eq('5a the helper is closed to the app, signed out and the server',
      (not has_function_privilege('anon', 'public._alignment_coach_id(text)', 'execute')
       and not has_function_privilege('authenticated', 'public._alignment_coach_id(text)', 'execute')
       and not has_function_privilege('service_role', 'public._alignment_coach_id(text)', 'execute'))::text, 'true');
    f := f || pg_temp.t_eq('5b making a link stays closed to the app and signed out',
      (not has_function_privilege('anon', 'public.create_alignment_session(text,text,text)', 'execute')
       and not has_function_privilege('authenticated', 'public.create_alignment_session(text,text,text)', 'execute')
       and not has_function_privilege('anon', 'public.create_alignment_session(text,text)', 'execute')
       and not has_function_privilege('authenticated', 'public.create_alignment_session(text,text)', 'execute'))::text, 'true');
    f := f || pg_temp.t_eq('5c the helper keeps search_path empty',
      (select (proconfig @> array['search_path=""'])::text from pg_proc where oid = 'public._alignment_coach_id(text)'::regprocedure), 'true');
    f := f || pg_temp.t_eq('5d one helper only',
      (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = '_alignment_coach_id'), '1');
    if to_regclass('public.migration_log') is not null then
      f := f || pg_temp.t_eq('5e the migration log records 037',
        (select count(*)::text from public.migration_log where number = 37), '1');
    end if;
  exception when others then
    perform pg_temp.t_admin();
    f := f || array['the checks stopped early: ' || sqlstate || ' ' || sqlerrm];
  end;
  perform pg_temp.t_admin();

  if cardinality(f) > 0 then
    raise exception E'037 test FAILED:\n%', array_to_string(f, E'\n');
  end if;
  raise notice '037 CHECKS PASSED';
end
$t$;
