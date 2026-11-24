-- =============================================================================
-- 062_finances_test.sql
-- Checks supabase/migrations/062_finances.sql (Phase 6b run 2; 24 Nov 2026).
-- RUN ORDER: 049 to 061, then 062 (twice is fine), then this. Dry run only, on
-- a local stand-in or the test project.
--
-- WHAT IT CHECKS
--   The owner with the code keeps targets, outgoings, discounts (never called
--   charity), POs (https portals only), proposals and statements; negative and
--   huge figures are refused. An associate reads none of the business's money,
--   only their own statement, and changes nothing. Without the code, a client
--   and someone signed out read nothing. A proposal's link opens only while it
--   is sent, gives only its own words and counts each opening. A payment
--   straight to the bank names who paid. It ends with 062 CHECKS PASSED, or
--   stops with FAILED. Everything it makes is undone.
-- =============================================================================
create or replace function pg_temp.k_as(p uuid, p_aal text) returns void language plpgsql as $f$
declare sid uuid := gen_random_uuid();
begin
  -- A made-up sign-in is written to auth.sessions where that table exists, as a real one is (055 refuses a session id
  -- that isn't there once a coach has a reset on record; the hosted test project has the table).
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
  if to_regclass('auth.sessions') is not null and p is not null then
    begin
      execute 'insert into auth.sessions (id, user_id, created_at, updated_at) values ($1, $2, $3, $3)' using sid, p, now();
    exception when others then
      raise notice '062 test: this database doesn''t let the test write auth.sessions (%)', sqlerrm;
    end;
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated', 'aal', p_aal,
    'amr', json_build_array(json_build_object('method', 'password', 'timestamp', floor(extract(epoch from now()))::bigint)),
    'iat', floor(extract(epoch from now()))::bigint, 'session_id', sid)::text, true);
  perform set_config('role', 'authenticated', true);
end $f$;
create or replace function pg_temp.k_anon() returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('role', 'anon', true);
end $f$;
create or replace function pg_temp.k_admin() returns void language plpgsql as $f$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
end $f$;
create or replace function pg_temp.k_user(p_label text, p_confirmed boolean default true) returns uuid language plpgsql as $f$
declare u uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, aud, role, email_confirmed_at)
  values (u, 'p062-test-' || p_label || '-' || u || '@example.invalid', 'authenticated', 'authenticated', case when p_confirmed then now() end);
  return u;
end $f$;
create or replace function pg_temp.k_eq(p_name text, p_got text, p_want text) returns text[] language sql as $f$
  select case when p_got is distinct from p_want then array[format('%s: expected %s, got %s', p_name, p_want, coalesce(p_got, 'nothing'))] else '{}'::text[] end;
$f$;
create or replace function pg_temp.k_try(p_sql text) returns text language plpgsql as $f$
declare v text;
begin
  execute p_sql into v;
  return coalesce(v, 'ok');
exception when others then
  return 'error ' || sqlstate;
end $f$;

do $t$
declare
  f text[] := '{}';
  tess_u uuid; maya_u uuid; sam_u uuid;
  tess_c uuid; maya_c uuid;
  p_sam uuid := gen_random_uuid(); org uuid; po uuid; prop uuid; prop_draft uuid; tok text; tok_draft text; st uuid; st_other uuid;
begin
  begin
    perform pg_temp.k_admin();
    tess_u := pg_temp.k_user('tess'); maya_u := pg_temp.k_user('maya'); sam_u := pg_temp.k_user('sam');
    insert into public.coaches (user_id, role, display_first_name) values (tess_u, 'owner', 'Tess') returning id into tess_c;
    insert into public.coaches (user_id, role, display_first_name) values (maya_u, 'coach', 'Maya') returning id into maya_c;
    perform set_config('clarity.linking', 'on', true);
    insert into public.client_profiles (id, coach_id, name, user_id) values (p_sam, maya_c, 'Sam K062', sam_u);
    perform set_config('clarity.linking', '', true);
    insert into public.organisations (name) values ('Kestrel K062') returning id into org;
    insert into public.finance_settings (coach_id) values (tess_c) on conflict (coach_id) do nothing;

    -- 1. the owner, with the code, keeps the business's money settings
    perform pg_temp.k_as(tess_u, 'aal2');
    f := f || pg_temp.k_eq('1a Tess sets a target', pg_temp.k_try(format('insert into public.finance_targets (coach_id, month, target_minor) values (%L, ''2026-11-01'', 500000) returning ''added''', tess_c)), 'added');
    f := f || pg_temp.k_eq('1b a target is for a whole month', pg_temp.k_try(format('insert into public.finance_targets (coach_id, month, target_minor) values (%L, ''2026-11-15'', 500000) returning ''added''', tess_c)), 'error 23514');
    f := f || pg_temp.k_eq('1c a negative target is refused', pg_temp.k_try(format('insert into public.finance_targets (coach_id, month, target_minor) values (%L, ''2026-12-01'', -1) returning ''added''', tess_c)), 'error 23514');
    f := f || pg_temp.k_eq('1d a huge outgoing is refused', pg_temp.k_try(format('insert into public.finance_outgoings (coach_id, name, group_name, amount_minor, starts_on) values (%L, ''Zoom'', ''Software'', 100000000000, ''2026-12-01'') returning ''added''', tess_c)), 'error 23514');
    f := f || pg_temp.k_eq('1e Tess adds a recurring outgoing', pg_temp.k_try(format('insert into public.finance_outgoings (coach_id, name, group_name, amount_minor, every, starts_on) values (%L, ''Zoom'', ''Software'', 1300, ''month'', ''2026-12-01'') returning ''added''', tess_c)), 'added');
    f := f || pg_temp.k_eq('1f a discount is never called charity', pg_temp.k_try(format('insert into public.discounts (coach_id, name, percent) values (%L, ''Charity rate'', 20) returning ''added''', tess_c)), 'error 23514');
    f := f || pg_temp.k_eq('1g a discount is a percentage or an amount, not both', pg_temp.k_try(format('insert into public.discounts (coach_id, name, percent, amount_minor) values (%L, ''Returning client'', 15, 5000) returning ''added''', tess_c)), 'error 23514');
    f := f || pg_temp.k_eq('1h Tess adds a discount', pg_temp.k_try(format('insert into public.discounts (coach_id, name, percent) values (%L, ''Returning client'', 15) returning ''added''', tess_c)), 'added');
    f := f || pg_temp.k_eq('1i a vendor portal is https only', pg_temp.k_try(format('insert into public.purchase_orders (coach_id, organisation_id, number, portal_url) values (%L, %L, ''PO-1'', ''javascript:alert(1)'') returning ''added''', tess_c, org)), 'error 23514');
    insert into public.purchase_orders (coach_id, organisation_id, number, value_minor, ends_on) values (tess_c, org, 'KG-4471', 2000000, '2027-03-31') returning id into po;
    insert into public.proposals (coach_id, organisation_id, title, total_minor, status, sent_at) values (tess_c, org, 'Leadership Accelerator', 1346000, 'sent', now()) returning id, share_token into prop, tok;
    insert into public.proposals (coach_id, organisation_id, title, total_minor) values (tess_c, org, 'Draft K062', 500000) returning id, share_token into prop_draft, tok_draft;
    f := f || pg_temp.k_eq('1j a dollar proposal needs its rate', pg_temp.k_try(format('insert into public.proposals (coach_id, title, currency) values (%L, ''Dollars'', ''USD'') returning ''added''', tess_c)), 'error 23514');
    insert into public.associate_statements (coach_id, associate_id, month, hours, rate_minor, total_minor) values (tess_c, maya_c, '2026-11-01', 22, 10000, 220000) returning id into st;
    f := f || pg_temp.k_eq('1k Tess marks Maya''s statement paid', pg_temp.k_try(format('update public.associate_statements set paid_on = ''2026-12-01'', paid_minor = 220000 where id = %L returning ''changed''', st)), 'changed');
    f := f || pg_temp.k_eq('1l one statement a month for each associate', pg_temp.k_try(format('insert into public.associate_statements (coach_id, associate_id, month) values (%L, %L, ''2026-11-01'') returning ''added''', tess_c, maya_c)), 'error 23505');
    f := f || pg_temp.k_eq('1m Tess can''t write a payment herself (the server does)', pg_temp.k_try(format('insert into public.payments (coach_id, amount_minor, currency, added_by_coach, payer_name) values (%L, 120000, ''GBP'', true, ''Northfield'') returning ''added''', tess_c)), 'error 42501');

    -- 2. an associate: nothing of the business, only their own statement
    perform pg_temp.k_as(maya_u, 'aal2');
    f := f || pg_temp.k_eq('2a Maya reads none of the business''s money', pg_temp.k_try('select ((select count(*) from public.finance_settings) + (select count(*) from public.finance_targets) + (select count(*) from public.finance_outgoings) + (select count(*) from public.discounts) + (select count(*) from public.proposals) + (select count(*) from public.purchase_orders) + (select count(*) from public.pricing_packages) + (select count(*) from public.company_deadlines) + (select count(*) from public.supplier_pack_items) + (select count(*) from public.bank_balance_checks))::text'), '0');
    f := f || pg_temp.k_eq('2b Maya reads her own statement', pg_temp.k_try('select count(*)::text from public.associate_statements'), '1');
    f := f || pg_temp.k_eq('2c Maya can''t change her statement', pg_temp.k_try(format('update public.associate_statements set total_minor = 990000 where id = %L returning ''changed''', st)), 'ok');
    f := f || pg_temp.k_eq('2d Maya can''t set a target', pg_temp.k_try(format('insert into public.finance_targets (coach_id, month, target_minor) values (%L, ''2027-01-01'', 1) returning ''added''', maya_c)), 'error 42501');
    f := f || pg_temp.k_eq('2e Maya can''t write into Tess''s settings', pg_temp.k_try(format('update public.finance_settings set minimum_minor = 0 where coach_id = %L returning ''changed''', tess_c)), 'ok');
    f := f || pg_temp.k_eq('2f Maya can''t make a statement for herself', pg_temp.k_try(format('insert into public.associate_statements (coach_id, associate_id, month, total_minor) values (%L, %L, ''2026-12-01'', 990000) returning ''added''', maya_c, maya_c)), 'error 42501');
    perform pg_temp.k_admin();
    f := f || pg_temp.k_eq('2g and Tess''s figures stay as they were', (select minimum_minor::text || '/' || (select total_minor::text from public.associate_statements where id = st) from public.finance_settings where coach_id = tess_c), '200000/220000');

    -- 3. without the code, a client, someone signed out
    perform pg_temp.k_as(tess_u, 'aal1');
    f := f || pg_temp.k_eq('3a Tess without the code reads nothing', pg_temp.k_try('select ((select count(*) from public.finance_targets) + (select count(*) from public.proposals) + (select count(*) from public.associate_statements))::text'), '0');
    perform pg_temp.k_as(sam_u, 'aal1');
    f := f || pg_temp.k_eq('3b a client reads nothing', pg_temp.k_try('select ((select count(*) from public.finance_targets) + (select count(*) from public.proposals) + (select count(*) from public.purchase_orders) + (select count(*) from public.associate_statements))::text'), '0');
    perform pg_temp.k_anon();
    f := f || pg_temp.k_eq('3c signed out: the tables', pg_temp.k_try('select count(*)::text from public.finance_targets'), 'error 42501');

    -- 4. the share link
    f := f || pg_temp.k_eq('4a a sent proposal opens by its link', pg_temp.k_try(format('select public.proposal_open(%L)->>''title''', tok)), 'Leadership Accelerator');
    f := f || pg_temp.k_eq('4b it gives nothing more than its own words', pg_temp.k_try(format('select (select string_agg(k, '','' order by k) from jsonb_object_keys(public.proposal_open(%L)) k)', tok)), 'coach_name,currency,lines,sent_at,title,total_minor,valid_until');
    f := f || pg_temp.k_eq('4c a draft never opens', pg_temp.k_try(format('select public.proposal_open(%L)::text', tok_draft)), 'ok');
    f := f || pg_temp.k_eq('4d a made-up link opens nothing', pg_temp.k_try(format('select public.proposal_open(%L)::text', repeat('0', 64))), 'ok');
    f := f || pg_temp.k_eq('4e nor anything that isn''t a link', pg_temp.k_try('select public.proposal_open(''x'' || chr(39) || '' or 1=1'')::text'), 'ok');
    perform pg_temp.k_admin();
    f := f || pg_temp.k_eq('4f each opening is counted', (select opens::text from public.proposals where id = prop), '2');

    -- 5. a payment straight to the bank: someone must have paid it
    f := f || pg_temp.k_eq('5a a bank payment names who paid', pg_temp.k_try(format('insert into public.payments (coach_id, amount_minor, currency, added_by_coach) values (%L, 120000, ''GBP'', true) returning ''added''', tess_c)), 'error 23514');
    f := f || pg_temp.k_eq('5b with a payer it is kept', pg_temp.k_try(format('insert into public.payments (coach_id, amount_minor, currency, added_by_coach, payer_name, sector, what_for) values (%L, 120000, ''GBP'', true, ''Northfield K062'', ''Business'', ''CLARITY-1212'') returning ''added''', tess_c)), 'added');

    perform pg_temp.k_admin();
    raise exception 'undo the test rows' using errcode = 'P0062';
  exception when sqlstate 'P0062' then
    perform pg_temp.k_admin();
  end;
  f := f || pg_temp.k_eq('9 everything the test made is undone', (select count(*)::text from auth.users where email like 'p062-test-%@example.invalid'), '0');
  if cardinality(f) > 0 then
    raise exception E'062 FAILED (%):\n%', cardinality(f), array_to_string(f, E'\n');
  end if;
  raise notice '062 CHECKS PASSED';
end
$t$;
