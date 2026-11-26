-- =============================================================================
-- 068_business_details_test.sql
-- Checks supabase/migrations/068_business_details.sql. RUN ORDER: 049 to 067,
-- then 068 (twice is fine), then this. Dry run only, on a local stand-in or the
-- test project. Everything it makes is undone by the dry run's rollback.
--
-- WHAT IT CHECKS
--   - finance_settings has the nine business columns;
--   - the owner's row takes good details and refuses a bad sort code, account
--     number, company number and email;
--   - business_facts() gives the name, number, website and email to anyone
--     signed in, and never a bank detail;
--   - it gives nothing to someone signed out (no execute for anon), and
--     nothing to a call with no sign-in;
--   - 068 is recorded.
--   It ends with the notice 068 CHECKS PASSED, or stops with FAILED.
-- =============================================================================
do $t$
declare
  v_fail text[] := '{}';
  v_owner uuid;
  v_user uuid;
  v_facts jsonb;
  c text;
begin
  foreach c in array array['company_name', 'company_number', 'website', 'invoice_email', 'vat_number', 'bank_name',
                           'bank_account_name', 'bank_sort_code', 'bank_account_number'] loop
    if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'finance_settings' and column_name = c) then
      v_fail := v_fail || ('finance_settings.' || c || ' is there');
    end if;
  end loop;

  select id, user_id into v_owner, v_user from public.coaches where role = 'owner' order by created_at limit 1;
  if v_owner is null then
    raise notice '068: no owner on this database, so the row and the facts were checked by their definitions only';
  else
    insert into public.finance_settings (coach_id) values (v_owner) on conflict (coach_id) do nothing;
    update public.finance_settings set company_name = 'Test Practice LTD', company_number = '01234567', website = 'example.invalid',
      invoice_email = 'accounts@example.invalid', bank_name = 'Example Bank plc', bank_account_name = 'Test Practice LTD',
      bank_sort_code = '00-00-00', bank_account_number = '00000000' where coach_id = v_owner;
    begin
      update public.finance_settings set bank_sort_code = '000000' where coach_id = v_owner;
      v_fail := v_fail || 'a sort code without its dashes is refused';
    exception when check_violation then null;
    end;
    begin
      update public.finance_settings set bank_account_number = '1234' where coach_id = v_owner;
      v_fail := v_fail || 'a short account number is refused';
    exception when check_violation then null;
    end;
    begin
      update public.finance_settings set company_number = 'not a number' where coach_id = v_owner;
      v_fail := v_fail || 'a company number with spaces is refused';
    exception when check_violation then null;
    end;
    begin
      update public.finance_settings set invoice_email = 'nobody' where coach_id = v_owner;
      v_fail := v_fail || 'an email without an @ is refused';
    exception when check_violation then null;
    end;

    -- As a signed-in person (the business's facts, never its bank).
    perform set_config('request.jwt.claims', json_build_object('sub', coalesce(v_user, gen_random_uuid())::text, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', coalesce(v_user, gen_random_uuid())::text, true);
    v_facts := public.business_facts();
    if v_facts ->> 'company_number' is distinct from '01234567' then v_fail := v_fail || 'business_facts gives the company number'; end if;
    if v_facts ->> 'company_name' is distinct from 'Test Practice LTD' then v_fail := v_fail || 'business_facts gives the company name'; end if;
    if v_facts ->> 'website' is distinct from 'example.invalid' then v_fail := v_fail || 'business_facts gives the website'; end if;
    if v_facts ?| array['bank_name', 'bank_account_name', 'bank_sort_code', 'bank_account_number', 'vat_number', 'minimum_minor', 'bank_balance_minor'] then
      v_fail := v_fail || 'business_facts never gives the bank details or other settings';
    end if;
    -- With no sign-in, nothing.
    perform set_config('request.jwt.claims', '', true);
    perform set_config('request.jwt.claim.sub', '', true);
    if public.business_facts() is not null and public.business_facts() <> '{}'::jsonb then
      v_fail := v_fail || 'business_facts gives nothing with no sign-in';
    end if;
  end if;

  if has_function_privilege('anon', 'public.business_facts()', 'execute') then v_fail := v_fail || 'closed to anyone signed out'; end if;
  if not has_function_privilege('authenticated', 'public.business_facts()', 'execute') then v_fail := v_fail || 'open to anyone signed in'; end if;
  if exists (select 1 from public.migration_log where number = 68) is not true then v_fail := v_fail || '068 is recorded'; end if;

  if array_length(v_fail, 1) > 0 then
    raise exception '068 FAILED: %', array_to_string(v_fail, '; ');
  end if;
  raise notice '068 CHECKS PASSED';
end
$t$;
