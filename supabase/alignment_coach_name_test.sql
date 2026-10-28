-- =============================================================================
-- alignment_coach_name_test.sql: checks migration 034
--
-- Run after 034, on the test project only. It makes Health Check links, opens
-- them and checks what comes back, then removes what it made. Best run inside
-- a transaction that is rolled back:
--   bash scripts/dry-run-on-test.sh supabase/migrations/034_alignment_coach_name.sql supabase/alignment_coach_name_test.sql
-- It shows "034 CHECKS PASSED" at the end, or stops at the first check that
-- doesn't hold.
-- =============================================================================

do $$
declare
  v_email  text;
  v_first  text;
  r        jsonb;
  o        jsonb;
  v_failed boolean;
begin
  -- A portal account with a first name, to act as the coach.
  select u.email, btrim(p.first_name) into v_email, v_first
    from auth.users u join public.profiles p on p.id = u.id
   where nullif(btrim(p.first_name), '') is not null and u.email is not null
   order by u.created_at limit 1;
  if v_email is null then
    raise exception 'FAILED: the test project has no account with a first name to use as the coach.';
  end if;

  -- 1. A link made with the coach's email carries their first name.
  r := public.create_alignment_session('034 test organisation', '034-test-one@example.invalid', upper(v_email));
  if r ->> 'coach_name' is distinct from v_first then
    raise exception 'FAILED: making a link with the coach email gave % instead of the first name.', coalesce(r ->> 'coach_name', 'nothing');
  end if;
  o := public.alignment_open(r ->> 'token', '034-test-one@example.invalid', r ->> 'access_code');
  if not (o ->> 'ok')::boolean or o ->> 'coach_name' is distinct from v_first then
    raise exception 'FAILED: opening the link did not return the coach''s first name (%).', o;
  end if;
  if o ->> 'client_label' is distinct from '034 test organisation' then
    raise exception 'FAILED: opening the link no longer returns the organisation name.';
  end if;
  if o ? 'coach_email' or position(lower(v_email) in lower(o::text)) > 0 then
    raise exception 'FAILED: opening the link returned the coach''s email.';
  end if;
  raise notice 'ok 1: a link made with the coach email opens with their first name.';

  -- 2. A link made the old way (no coach) has no name, and still opens.
  r := public.create_alignment_session('034 test organisation', '034-test-two@example.invalid');
  o := public.alignment_open(r ->> 'token', '034-test-two@example.invalid', r ->> 'access_code');
  if not (o ->> 'ok')::boolean then
    raise exception 'FAILED: a link with no coach name did not open (%).', o;
  end if;
  if o ? 'coach_name' and jsonb_typeof(o -> 'coach_name') <> 'null' then
    raise exception 'FAILED: a link with no coach gave a coach name (%).', o ->> 'coach_name';
  end if;
  raise notice 'ok 2: a link with no coach name still opens, with no name.';

  -- 3. Wrong details still get the same answer as before, with no name.
  o := public.alignment_open(r ->> 'token', '034-test-two@example.invalid', 'AAAAAA');
  if (o ->> 'ok')::boolean or o ? 'coach_name' then
    raise exception 'FAILED: a wrong access code got more than the usual refusal (%).', o;
  end if;
  raise notice 'ok 3: a wrong access code gets the usual refusal and no name.';

  -- 4. A coach email no account has is refused, so a typo is noticed.
  v_failed := false;
  begin
    perform public.create_alignment_session('034 test organisation', '034-test-three@example.invalid', 'no-such-coach@example.invalid');
  exception when others then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'FAILED: a coach email with no account was accepted.';
  end if;
  raise notice 'ok 4: a coach email with no account is refused.';

  -- 5. Existing links: filled where created_by names an account.
  update public.alignment_sessions set created_by = upper(v_email), coach_name = null
   where respondent_email = '034-test-two@example.invalid';
  update public.alignment_sessions s
     set coach_name = nullif(btrim(p.first_name), '')
    from auth.users u join public.profiles p on p.id = u.id
   where s.coach_name is null and nullif(btrim(p.first_name), '') is not null
     and (s.created_by = u.id::text or lower(s.created_by) = lower(u.email))
     and s.respondent_email = '034-test-two@example.invalid';
  if (select coach_name from public.alignment_sessions where respondent_email = '034-test-two@example.invalid') is distinct from v_first then
    raise exception 'FAILED: an existing link made by a known coach was not filled.';
  end if;
  raise notice 'ok 5: an existing link made by a known coach is filled.';

  -- 6. Making links stays closed to the public key.
  if has_function_privilege('anon', 'public.create_alignment_session(text,text,text)', 'execute')
     or has_function_privilege('authenticated', 'public.create_alignment_session(text,text,text)', 'execute')
     or has_function_privilege('anon', 'public.create_alignment_session(text,text)', 'execute')
     or has_function_privilege('anon', 'public._alignment_coach_name(text)', 'execute') then
    raise exception 'FAILED: making a link can be called with the public key.';
  end if;
  if not has_function_privilege('anon', 'public.alignment_open(text,text,text)', 'execute') then
    raise exception 'FAILED: the outside page can no longer open a Health Check.';
  end if;
  raise notice 'ok 6: making links is closed to the public key; opening is still open.';

  delete from public.alignment_sessions where respondent_email like '034-test-%@example.invalid';
  raise notice '034 CHECKS PASSED';
end;
$$;
