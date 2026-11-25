-- =============================================================================
-- 065_agreements_engine_test.sql
-- Checks supabase/migrations/065_agreements_engine.sql. RUN ORDER: 049 to 064,
-- then 065 (twice is fine), then this. Dry run only, on a local stand-in or
-- the test project.
--
-- WHAT IT CHECKS
--   A small invented practice: Tess (the owner), Maya (an associate); Sam
--   (Maya's client, self-funded), Una (Maya's client, funded by Northfield),
--   Ben (Tess's client, a block of hours); Northfield, an organisation.
--   1. The structure: 15 currencies on every money table and none other;
--      yen's rate fits; the new tables are in 054's list with their rule;
--      the migration recorded itself once.
--   2. Standard wording: the owner adds, every coach of the practice reads,
--      nobody changes or removes a version; an associate can't add.
--   3. Extras, talking points, Needs you, billing profiles: the coach's own;
--      the server's columns on a billing profile are kept from the coach.
--   4. Quotes: the link and number are the database's; Q- numbers once each
--      from 1; quote_open for someone signed out (first open recorded once,
--      nothing beyond the page's needs); the version is held while out as a
--      quote; accepting is the server's, once, extras only among those
--      offered; an expired quote says only that.
--   5. Signing version 2: waits while a change asked for is unanswered;
--      records the start-now tick (self-funded only) and the way of settling
--      (only where offered); my_agreements gives change_pending, never opens,
--      and a funded client no money.
--   6. The 14 days: a coaching session for Sam inside them is refused with
--      calm words; from the day after, it is kept; with the tick, at once.
--   7. Opens: the client's first open is recorded once, for the coach only.
--   8. Sponsors: the link opens for someone signed out; signing is the
--      server's, needs the PO where asked, happens once, and ends the link.
--   9. Approval: an associate's waiting agreement isn't sent until the owner
--      approves; only the owner approves.
--  10. my_hours, coach_fx_rates, the Fathom mark and who said what happened,
--      invoice sources once each, and invoices' new kinds.
--   It ends with the notice 065 CHECKS PASSED, or stops with FAILED and a
--   list naming each check that failed. Everything it makes is undone.
-- =============================================================================
create or replace function pg_temp.r_as(p uuid, p_aal text default 'aal1') returns void language plpgsql as $f$
declare sid uuid := gen_random_uuid();
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
  if to_regclass('auth.sessions') is not null and p is not null then
    begin
      execute 'insert into auth.sessions (id, user_id, created_at, updated_at) values ($1, $2, $3, $3)' using sid, p, now();
    exception when others then
      raise notice '065: this database doesn''t let the test write auth.sessions (%)', sqlerrm;
    end;
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated', 'aal', p_aal,
    'amr', json_build_array(json_build_object('method', 'password', 'timestamp', floor(extract(epoch from now()))::bigint)),
    'iat', floor(extract(epoch from now()))::bigint, 'session_id', sid)::text, true);
  perform set_config('role', 'authenticated', true);
end $f$;
create or replace function pg_temp.r_anon() returns void language plpgsql as $f$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('role', 'anon', true);
end $f$;
create or replace function pg_temp.r_server() returns void language plpgsql as $f$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  perform set_config('role', 'service_role', true);
end $f$;
create or replace function pg_temp.r_admin() returns void language plpgsql as $f$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
end $f$;
create or replace function pg_temp.r_user(p_label text) returns uuid language plpgsql as $f$
declare u uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, aud, role, email_confirmed_at)
  values (u, 'p065-' || p_label || '-' || u || '@example.invalid', 'authenticated', 'authenticated', now());
  return u;
end $f$;
-- One value, or 'error SQLSTATE'.
create or replace function pg_temp.r_try(p_sql text) returns text language plpgsql as $f$
declare v text;
begin
  execute p_sql into v;
  return coalesce(v, 'null');
exception when others then
  return 'error ' || sqlstate;
end $f$;
-- The message a refusal gives, or 'no error'.
create or replace function pg_temp.r_says(p_sql text) returns text language plpgsql as $f$
begin
  execute p_sql;
  return 'no error';
exception when others then
  return sqlerrm;
end $f$;
create or replace function pg_temp.r_eq(p_name text, p_got text, p_want text) returns text[] language sql as $f$
  select case when p_got is distinct from p_want
              then array[format('%s: expected %s, got %s', p_name, p_want, coalesce(p_got, 'nothing'))]
              else '{}'::text[] end;
$f$;
create or replace function pg_temp.r_png() returns text language sql immutable as $f$
  select 'data:image/png;base64,' || repeat('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg', 3);
$f$;

do $t$
declare
  f text[] := '{}';
  tess_u uuid; maya_u uuid; sam_u uuid; ben_u uuid; una_u uuid;
  tess_c uuid; maya_c uuid;
  p_sam uuid := gen_random_uuid(); p_ben uuid := gen_random_uuid(); p_una uuid := gen_random_uuid();
  org uuid := gen_random_uuid(); eng_ben uuid := gen_random_uuid();
  sig_maya uuid; sig_tess uuid; sig_sam uuid; sig_ben uuid; sig_una uuid;
  a_q uuid; v_q uuid; q1 uuid; q2 uuid; tok text; tok2 text;
  a_sam uuid; v_sam uuid; a_una uuid; v_una uuid; a_ben uuid; v_ben uuid; a_spon uuid; v_spon uuid; a_wait uuid; v_wait uuid;
  sess uuid := gen_random_uuid();
  stok text := repeat('5', 64);
  j jsonb; v text; n1 integer; n2 integer; r uuid;
  terms_sessions jsonb := jsonb_build_object('kind', 'sessions', 'coaching', '6-month coaching', 'blocks', jsonb_build_array(jsonb_build_object('n', 1, 'minutes', 90), jsonb_build_object('n', 15, 'minutes', 60)),
    'settle', 'equal', 'offerUpfront', true, 'noticeHours', 24, 'expiryDays', 30,
    'extrasOffered', jsonb_build_array(jsonb_build_object('key', 'session', 'title', 'Extra coaching session', 'priceMinor', 75000),
                                       jsonb_build_object('key', 'visit', 'title', 'Visit day', 'priceMinor', 250000)));
  clauses_one jsonb := jsonb_build_array(jsonb_build_object('key', 'coaching', 'number', 1, 'title', 'The coaching',
    'paragraphs', jsonb_build_array(jsonb_build_object('text', 'You have 16 coaching sessions.', 'why', null))),
    jsonb_build_object('key', 'rearranging', 'number', 2, 'title', 'Rearranging and cancelling',
    'paragraphs', jsonb_build_array(jsonb_build_object('text', 'Up to 24 hours before.', 'why', 'Time held for you.'))));
begin
  -- ---------------------------------------------------------------- 1. the structure
  f := f || pg_temp.r_eq('1a 15 currencies and no others', (select count(*)::text from unnest(array['GBP','EUR','USD','CAD','AUD','NZD','CHF','AED','SGD','HKD','SEK','NOK','DKK','ZAR','JPY']) c where public.currency_ok(c)), '15');
  f := f || pg_temp.r_eq('1b a made-up currency is refused', public.currency_ok('XYZ')::text, 'false');
  f := f || pg_temp.r_eq('1c every money table uses the one check',
    (select count(*)::text from pg_constraint where conname in ('agreement_versions_currency_check', 'invoices_currency_check', 'payments_currency_check',
       'credit_notes_currency_check', 'expenses_currency_check', 'proposals_currency_check', 'pricing_packages_currency_check',
       'purchase_orders_currency_check', 'finance_outgoings_currency_check') and pg_get_constraintdef(oid) like '%currency_ok(currency)%'), '9');
  f := f || pg_temp.r_eq('1d each new coach table is in 054''s list',
    (select count(*)::text from public.coach_code_tables() where table_name in ('agreement_clause_standards', 'agreement_extras', 'agreement_quotes',
       'agreement_link_opens', 'agreement_reminders', 'agreement_cancellations', 'invoice_sources', 'org_billing_profiles', 'invoice_evidence',
       'talking_points', 'needs_you_done') and kind = 'coach'), '11');
  f := f || pg_temp.r_eq('1e the server''s own tables are listed as closed',
    (select count(*)::text from public.coach_code_tables() where table_name in ('quote_number_counter', 'sponsor_sign_links', 'sponsor_signatures', 'fx_reference_rates') and kind = 'closed'), '4');
  f := f || pg_temp.r_eq('1f each coach table has the code rule',
    (select count(*)::text from pg_policies where schemaname = 'public' and policyname = 'Coach data: needs the 6-digit code' and permissive = 'RESTRICTIVE'
       and tablename in ('agreement_clause_standards', 'agreement_extras', 'agreement_quotes', 'agreement_link_opens', 'agreement_reminders',
                         'agreement_cancellations', 'invoice_sources', 'org_billing_profiles', 'invoice_evidence', 'talking_points', 'needs_you_done')), '11');
  if to_regclass('public.migration_log') is not null then
    f := f || pg_temp.r_eq('1g the migration recorded itself, once', (select count(*)::text from public.migration_log where number = 65 and name = '065_agreements_engine'), '1');
  end if;

  begin
    perform pg_temp.r_admin();
    tess_u := pg_temp.r_user('tess'); maya_u := pg_temp.r_user('maya'); sam_u := pg_temp.r_user('sam'); ben_u := pg_temp.r_user('ben'); una_u := pg_temp.r_user('una');
    insert into public.coaches (user_id, role, display_first_name) values (tess_u, 'owner', 'Tess') returning id into tess_c;
    insert into public.coaches (user_id, role, display_first_name) values (maya_u, 'coach', 'Maya') returning id into maya_c;
    insert into public.organisations (id, name) values (org, 'Northfield R065');
    insert into public.client_profiles (id, coach_id, name, email, time_zone) values
      (p_sam, maya_c, 'Sam R065', 'sam.r065@example.invalid', 'Europe/London'),
      (p_ben, tess_c, 'Ben R065', 'ben.r065@example.invalid', 'Europe/London'),
      (p_una, maya_c, 'Una R065', 'una.r065@example.invalid', 'Europe/London');
    update public.client_profiles set organisation_id = org where id = p_una;
    perform set_config('clarity.linking', 'on', true);
    update public.client_profiles set user_id = sam_u where id = p_sam;
    update public.client_profiles set user_id = ben_u where id = p_ben;
    update public.client_profiles set user_id = una_u where id = p_una;
    perform set_config('clarity.linking', '', true);
    insert into public.signatures (user_id, kind, image) values (maya_u, 'drawn', pg_temp.r_png()) returning id into sig_maya;
    insert into public.signatures (user_id, kind, image) values (tess_u, 'drawn', pg_temp.r_png()) returning id into sig_tess;
    insert into public.signatures (user_id, kind, typed_name) values (sam_u, 'typed', 'Sam R065') returning id into sig_sam;
    insert into public.signatures (user_id, kind, typed_name) values (ben_u, 'typed', 'Ben R065') returning id into sig_ben;
    insert into public.signatures (user_id, kind, typed_name) values (una_u, 'typed', 'Una R065') returning id into sig_una;

    -- A yen version holds its rate.
    perform pg_temp.r_as(maya_u, 'aal2');
    insert into public.agreements (coach_id, profile_id, agreement_kind) values (maya_c, p_sam, 'sessions') returning id into a_q;
    f := f || pg_temp.r_eq('1h a yen draft at 190 yen to the pound',
      pg_temp.r_try(format('insert into public.agreement_versions (agreement_id, coach_id, version, currency, fx_rate, fx_at) values (%L, %L, 9, ''JPY'', 190.123456, now()) returning ''added''', a_q, maya_c)), 'added');
    f := f || pg_temp.r_eq('1i a made-up currency is refused on a version',
      pg_temp.r_try(format('insert into public.agreement_versions (agreement_id, coach_id, version, currency, fx_rate, fx_at) values (%L, %L, 8, ''XYZ'', 1, now()) returning ''added''', a_q, maya_c)), 'error 23514');
    delete from public.agreement_versions where agreement_id = a_q and version = 9;

    -- ---------------------------------------------------------------- 2. standard wording
    perform pg_temp.r_as(tess_u, 'aal2');
    f := f || pg_temp.r_eq('2a the owner adds a standard version',
      pg_temp.r_try(format('insert into public.agreement_clause_standards (coach_id, agreement_kind, clause_key, version, title, paragraphs) values (%L, ''sessions'', ''rearranging'', 1, ''Rearranging and cancelling'', %L) returning ''added''',
        tess_c, '[{"text":"You can rearrange a coaching session up to 24 hours before it starts.","why":"It lets your coach offer the time to someone else."}]')), 'added');
    f := f || pg_temp.r_eq('2b a paragraph over 2000 characters is refused',
      pg_temp.r_try(format('insert into public.agreement_clause_standards (coach_id, agreement_kind, clause_key, version, title, paragraphs) values (%L, ''sessions'', ''data'', 1, ''Your data'', %L) returning ''added''',
        tess_c, jsonb_build_array(jsonb_build_object('text', repeat('x', 2001))))), 'error 23514');
    f := f || pg_temp.r_eq('2c a standard is never changed', pg_temp.r_try('update public.agreement_clause_standards set title = ''Changed'' returning ''changed'''), 'error 42501');
    f := f || pg_temp.r_eq('2d nor removed', pg_temp.r_try('delete from public.agreement_clause_standards returning ''gone'''), 'error 42501');
    perform pg_temp.r_as(maya_u, 'aal2');
    f := f || pg_temp.r_eq('2e an associate reads the owner''s wording', (select count(*)::text from public.agreement_clause_standards where coach_id = tess_c), '1');
    f := f || pg_temp.r_eq('2f an associate can''t add one',
      pg_temp.r_try(format('insert into public.agreement_clause_standards (coach_id, agreement_kind, clause_key, version, title, paragraphs) values (%L, ''sessions'', ''rearranging'', 1, ''Mine'', %L) returning ''added''',
        maya_c, '[{"text":"Mine."}]')), 'error 42501');
    perform pg_temp.r_as(maya_u, 'aal1');
    f := f || pg_temp.r_eq('2g without the code, nothing', (select count(*)::text from public.agreement_clause_standards), '0');
    perform pg_temp.r_as(sam_u, 'aal1');
    f := f || pg_temp.r_eq('2h a client reads none', (select count(*)::text from public.agreement_clause_standards), '0');

    -- ---------------------------------------------------------------- 3. the coach's own lists
    perform pg_temp.r_as(maya_u, 'aal2');
    insert into public.agreement_extras (coach_id, key, title, price_minor) values (maya_c, 'visit', 'Visit day', 250000);
    insert into public.talking_points (coach_id, moment, lines) values (maya_c, 'price', '["From January, my fee is £3,300 a month."]');
    f := f || pg_temp.r_eq('3a talking points hold at most 5 lines', pg_temp.r_try(format('insert into public.talking_points (coach_id, moment, lines) values (%L, ''renew'', ''["a","b","c","d","e","f"]'') returning ''added''', maya_c)), 'error 23514');
    insert into public.needs_you_done (coach_id, item_key, state) values (maya_c, 'signrem:x', 'done');
    f := f || pg_temp.r_eq('3b Needs you is one row a key', pg_temp.r_try(format('insert into public.needs_you_done (coach_id, item_key) values (%L, ''signrem:x'') returning ''added''', maya_c)), 'error 23505');
    insert into public.org_billing_profiles (coach_id, organisation_id, legal_name, needs_po, stripe_customer_id, bank_details)
    values (maya_c, org, 'Northfield Logistics Ltd', true, 'cus_made_up', '{"sort":"00-00-00"}');
    f := f || pg_temp.r_eq('3c the server''s columns are kept from the coach', (select concat(coalesce(stripe_customer_id, 'none'), '/', coalesce(bank_details::text, 'none')) from public.org_billing_profiles where organisation_id = org), 'none/none');
    perform pg_temp.r_as(tess_u, 'aal2');
    f := f || pg_temp.r_eq('3d the owner reads none of an associate''s lists',
      concat_ws('/', (select count(*) from public.agreement_extras), (select count(*) from public.talking_points), (select count(*) from public.needs_you_done), (select count(*) from public.org_billing_profiles)), '0/0/0/0');
    perform pg_temp.r_server();
    update public.org_billing_profiles set stripe_customer_id = 'cus_made_up', bank_details = '{"account":"made up"}' where organisation_id = org;
    f := f || pg_temp.r_eq('3e the server writes them', (select stripe_customer_id from public.org_billing_profiles where organisation_id = org), 'cus_made_up');

    -- ---------------------------------------------------------------- 4. quotes
    perform pg_temp.r_as(maya_u, 'aal2');
    insert into public.agreement_versions (agreement_id, coach_id, version, terms, clauses, total_minor, send_as, personal_note)
    values (a_q, maya_c, 1, terms_sessions, clauses_one, 1530000, 'quote', 'It was good to talk.') returning id into v_q;
    insert into public.agreement_quotes (coach_id, agreement_id, version_id, valid_days, coach_signature_id, share_token, number, status)
    values (maya_c, a_q, v_q, 30, sig_maya, repeat('0', 64), 99, 'draft') returning id, share_token, number into q1, tok, n1;
    f := f || pg_temp.r_eq('4a the link is the database''s own, and no number yet', concat(tok <> repeat('0', 64), '/', coalesce(n1::text, 'none')), 't/none');
    f := f || pg_temp.r_eq('4b a coach can''t send it herself', pg_temp.r_try(format('update public.agreement_quotes set status = ''sent'' where id = %L returning ''sent''', q1)), 'error 42501');
    f := f || pg_temp.r_eq('4c nor take a number', pg_temp.r_try(format('select public.quote_take_number(%L)::text', q1)), 'error 42501');
    perform pg_temp.r_server();
    n1 := public.quote_take_number(q1);
    n2 := public.quote_take_number(q1);
    f := f || pg_temp.r_eq('4d the server''s number is given once', (n1 = n2)::text, 'true');
    update public.agreement_quotes set status = 'sent', sent_at = now(), valid_until = (now() at time zone 'Europe/London')::date + 30 where id = q1;
    perform pg_temp.r_as(maya_u, 'aal2');
    f := f || pg_temp.r_eq('4e the version is held while it is out as a quote',
      pg_temp.r_try(format('update public.agreement_versions set total_minor = 1 where id = %L returning ''changed''', v_q)), 'error 23514');
    f := f || pg_temp.r_eq('4f and can''t be removed', pg_temp.r_try(format('delete from public.agreement_versions where id = %L returning ''gone''', v_q)), 'error 23514');
    perform pg_temp.r_anon();
    j := public.quote_open(tok);
    f := f || pg_temp.r_eq('4g the quote opens for someone signed out, with only what the page needs',
      (select string_agg(k, ',' order by k) from jsonb_object_keys(j) k), 'clauses,coach_first,currency,fx_rate,number,personal_note,sent_at,state,terms,total_minor,valid_until,version');
    f := f || pg_temp.r_eq('4h its number, state and coach', concat(j ->> 'number', '/', j ->> 'state', '/', j ->> 'coach_first'), concat(n1, '/open/Maya'));
    j := public.quote_open(tok);
    f := f || pg_temp.r_eq('4i a made-up link gives nothing', coalesce(public.quote_open(repeat('f', 64))::text, 'nothing'), 'nothing');
    f := f || pg_temp.r_eq('4j a malformed link gives nothing', coalesce(public.quote_open('not-a-token')::text, 'nothing'), 'nothing');
    f := f || pg_temp.r_eq('4k someone signed out can''t accept it', pg_temp.r_try(format('select public.quote_accept(%L, ''{}'', null, %L, 1)::text', tok, clauses_one)), 'error 42501');
    perform pg_temp.r_admin();
    f := f || pg_temp.r_eq('4l the first open is recorded once', (select count(*)::text from public.agreement_link_opens where quote_id = q1), '1');
    perform pg_temp.r_server();
    f := f || pg_temp.r_eq('4m only the extras offered', pg_temp.r_try(format('select public.quote_accept(%L, ''{workshop}'', ''plan'', %L, 1780000)::text', tok, clauses_one)), 'error 22023');
    r := public.quote_accept(tok, '{visit}', 'plan', clauses_one, 1780000);
    f := f || pg_temp.r_eq('4n accepting makes the quote''s version the agreement', (r = v_q)::text, 'true');
    perform pg_temp.r_admin();
    f := f || pg_temp.r_eq('4o sent, signed by the coach with the quote''s signature, extras and choice in',
      (select concat(status, '/', send_as, '/', coach_signature_id = sig_maya, '/', terms -> 'extrasChosen', '/', terms ->> 'choice', '/', total_minor, '/', expires_on = (now() at time zone 'Europe/London')::date + 30) from public.agreement_versions where id = v_q),
      'sent/agreement/t/["visit"]/plan/1780000/t');
    f := f || pg_temp.r_eq('4p the quote is accepted', (select concat(status, '/', accepted_extras::text, '/', accepted_choice) from public.agreement_quotes where id = q1), 'accepted/{visit}/plan');
    perform pg_temp.r_server();
    f := f || pg_temp.r_eq('4q once only', pg_temp.r_try(format('select public.quote_accept(%L, ''{}'', null, %L, 1)::text', tok, clauses_one)), 'error CC409');
    perform pg_temp.r_anon();
    j := public.quote_open(tok);
    f := f || pg_temp.r_eq('4r an accepted quote says so and names the version', concat(j ->> 'state', '/', j ->> 'version_id' = v_q::text), 'accepted/t');
    -- A second quote, past its day.
    perform pg_temp.r_as(maya_u, 'aal2');
    insert into public.agreement_versions (agreement_id, coach_id, version, terms, clauses, send_as) values (a_q, maya_c, 2, terms_sessions, clauses_one, 'quote') returning id into v_wait;
    insert into public.agreement_quotes (coach_id, agreement_id, version_id) values (maya_c, a_q, v_wait) returning id, share_token into q2, tok2;
    perform pg_temp.r_server();
    perform public.quote_take_number(q2);
    update public.agreement_quotes set status = 'sent', sent_at = now() - interval '40 days', valid_until = (now() at time zone 'Europe/London')::date - 1 where id = q2;
    f := f || pg_temp.r_eq('4s the next quote takes the next number', (select (number = n1 + 1)::text from public.agreement_quotes where id = q2), 'true');
    perform pg_temp.r_anon();
    f := f || pg_temp.r_eq('4t a quote past its day says only that', (select string_agg(k, ',' order by k) from jsonb_object_keys(public.quote_open(tok2)) k), 'coach_first,number,state');
    f := f || pg_temp.r_eq('4u ... and its state', public.quote_open(tok2) ->> 'state', 'expired');
    perform pg_temp.r_server();
    f := f || pg_temp.r_eq('4v an expired quote can''t be accepted', pg_temp.r_try(format('select public.quote_accept(%L, ''{}'', null, %L, 1)::text', tok2, clauses_one)), 'error CC409');
    perform pg_temp.r_admin();
    f := f || pg_temp.r_eq('4w an expired quote''s open isn''t recorded', (select count(*)::text from public.agreement_link_opens where quote_id = q2), '0');

    -- ---------------------------------------------------------------- 5. signing, version 2 (Sam signs the accepted quote)
    perform pg_temp.r_as(sam_u, 'aal1');
    perform public.ask_agreement_change(v_q, 'rearranging', 'Could the notice be 12 hours?');
    j := public.my_agreements() -> 0;
    f := f || pg_temp.r_eq('5a my_agreements names the change asked for, with its clause', concat(j #>> '{change_pending,clause_key}', '/', j #>> '{change_pending,title}'), 'rearranging/2. Rearranging and cancelling');
    f := f || pg_temp.r_eq('5b and never an open', (j ? 'opened')::text || '/' || (j ? 'opens')::text, 'false/false');
    v := pg_temp.r_says(format('select public.sign_agreement_v2(%L, ''Sam R065'', %L, public.agreement_fingerprint(%L), false, ''plan'')', v_q, sig_sam, v_q));
    f := f || pg_temp.r_eq('5c signing waits while the change is unanswered', v, 'You asked for a change to this agreement. Your coach will send you a new version to sign.');
    perform pg_temp.r_as(maya_u, 'aal2');
    update public.agreement_change_requests set answered_at = now() where version_id = v_q;
    perform pg_temp.r_as(sam_u, 'aal1');
    f := f || pg_temp.r_eq('5d nothing pending once answered', coalesce(public.my_agreements() -> 0 ->> 'change_pending', 'none'), 'none');
    f := f || pg_temp.r_eq('5e Sam signs, choosing the plan, without the start-now tick',
      pg_temp.r_try(format('select (public.sign_agreement_v2(%L, ''Sam R065'', %L, public.agreement_fingerprint(%L), false, ''plan'') ->> ''settle_choice'')', v_q, sig_sam, v_q)), 'plan');
    perform pg_temp.r_admin();
    f := f || pg_temp.r_eq('5f the signing record holds the tick (not ticked) and the choice',
      (select concat(status, '/', start_now, '/', coalesce(start_now_at::text, 'none'), '/', settle_choice) from public.agreement_versions where id = v_q), 'signed/f/none/plan');
    perform pg_temp.r_as(maya_u, 'aal2');
    f := f || pg_temp.r_eq('5g the coach can''t change the tick', pg_temp.r_try(format('update public.agreement_versions set start_now = true where id = %L returning ''changed''', v_q)), 'error 23514');
    -- Una, funded by Northfield: no choice, no tick, no money.
    insert into public.agreements (coach_id, profile_id, agreement_kind) values (maya_c, p_una, 'sessions') returning id into a_una;
    insert into public.agreement_versions (agreement_id, coach_id, version, status, terms, clauses, total_minor, funded_by, coach_signed_at, coach_signature_id, sent_at)
    values (a_una, maya_c, 1, 'sent', terms_sessions || '{"blocks":[{"n":12,"minutes":60}],"priceMode":"total"}', clauses_one, 1800000, 'Northfield R065', now(), sig_maya, now()) returning id into v_una;
    perform pg_temp.r_as(una_u, 'aal1');
    j := public.my_agreements() -> 0;
    f := f || pg_temp.r_eq('5h a funded client sees the non-money terms only',
      (select string_agg(k, ',' order by k) from jsonb_object_keys(j -> 'terms') k), 'blocks,coaching,kind,noticeHours');
    f := f || pg_temp.r_eq('5i and no amount', concat(coalesce(j ->> 'total_minor', 'none'), '/', coalesce(j ->> 'currency', 'none')), 'none/none');
    perform public.sign_agreement_v2(v_una, 'Una R065', sig_una, public.agreement_fingerprint(v_una), true, 'upfront');
    perform pg_temp.r_admin();
    f := f || pg_temp.r_eq('5j a funded client''s signing records no tick and no choice',
      (select concat(coalesce(start_now::text, 'none'), '/', coalesce(settle_choice, 'none')) from public.agreement_versions where id = v_una), 'none/none');

    -- ---------------------------------------------------------------- 6. the 14 days (Sam didn't tick start now)
    perform pg_temp.r_as(maya_u, 'aal2');
    v := pg_temp.r_says(format('insert into public.coach_sessions (coach_id, profile_id, starts_at, minutes) values (%L, %L, now() + interval ''3 days'', 60)', maya_c, p_sam));
    f := f || pg_temp.r_eq('6a a coaching session inside Sam''s 14 days is refused, with the day it can be',
      v, 'That’s inside Sam’s 14 days to change their mind. Book it from '
         || to_char((now() at time zone 'Europe/London')::date + 15, 'Dy FMDD Mon') || '.');
    f := f || pg_temp.r_eq('6b from the day after the 14 days it is kept',
      pg_temp.r_try(format('insert into public.coach_sessions (id, coach_id, profile_id, starts_at, minutes) values (%L, %L, %L, ((now() at time zone ''Europe/London'')::date + 15 + time ''10:00'') at time zone ''Europe/London'', 60) returning ''added''', sess, maya_c, p_sam)), 'added');
    f := f || pg_temp.r_eq('6c and can''t be moved inside them', pg_temp.r_try(format('update public.coach_sessions set starts_at = now() + interval ''2 days'' where id = %L returning ''moved''', sess)), 'error 23514');
    f := f || pg_temp.r_eq('6d a chemistry call isn''t a coaching session',
      pg_temp.r_try(format('insert into public.coach_sessions (coach_id, profile_id, kind, starts_at, minutes) values (%L, %L, ''chemistry'', now() + interval ''2 days'', 30) returning ''added''', maya_c, p_sam)), 'added');
    f := f || pg_temp.r_eq('6e a funded client has no 14 days',
      pg_temp.r_try(format('insert into public.coach_sessions (coach_id, profile_id, starts_at, minutes) values (%L, %L, now() + interval ''2 days'', 60) returning ''added''', maya_c, p_una)), 'added');

    -- ---------------------------------------------------------------- 7. opens
    perform pg_temp.r_as(sam_u, 'aal1');
    perform public.agreement_mark_opened(v_q);
    perform public.agreement_mark_opened(v_q);
    f := f || pg_temp.r_eq('7a the client reads no opens', pg_temp.r_try('select count(*)::text from public.agreement_link_opens'), '0');
    perform pg_temp.r_as(una_u, 'aal1');
    perform public.agreement_mark_opened(v_q);
    perform pg_temp.r_as(maya_u, 'aal2');
    f := f || pg_temp.r_eq('7b the coach reads the client''s first open, once (and nothing from someone else)', (select count(*)::text from public.agreement_link_opens where version_id = v_q and who = 'client'), '1');
    perform pg_temp.r_as(tess_u, 'aal2');
    f := f || pg_temp.r_eq('7c another coach reads none', (select count(*)::text from public.agreement_link_opens), '0');

    -- ---------------------------------------------------------------- 8. sponsors
    perform pg_temp.r_as(tess_u, 'aal2');
    insert into public.agreements (coach_id, kind, organisation_id, agreement_kind) values (tess_c, 'sponsor', org, 'team') returning id into a_spon;
    insert into public.agreement_versions (agreement_id, coach_id, version, status, terms, clauses, total_minor, coach_signed_at, coach_signature_id, sent_at)
    values (a_spon, tess_c, 1, 'sent', '{"kind":"team","needsPO":true,"coaching":"Team programme"}', clauses_one, 2700000, now(), sig_tess, now()) returning id into v_spon;
    perform pg_temp.r_server();
    insert into public.sponsor_sign_links (coach_id, agreement_id, version_id, token_hash, sponsor_name, sponsor_email, sponsor_role, expires_at)
    values (tess_c, a_spon, v_spon, encode(sha256(convert_to(stok, 'UTF8')), 'hex'), 'Priya R065', 'priya.r065@example.invalid', 'Head of People', now() + interval '30 days');
    perform pg_temp.r_anon();
    j := public.sponsor_link_open(stok);
    f := f || pg_temp.r_eq('8a the sponsor''s link opens for someone signed out', concat(j ->> 'state', '/', j ->> 'sponsor_name', '/', j ->> 'needs_po', '/', j ->> 'coach_first'), 'open/Priya R065/true/Tess');
    f := f || pg_temp.r_eq('8b the sponsor can''t sign directly', pg_temp.r_try(format('select public.sponsor_sign(%L, ''Priya R065'', null, ''PO 1'', null, ''Priya R065'', %L)::text', stok, j ->> 'fingerprint')), 'error 42501');
    f := f || pg_temp.r_eq('8c the sponsor reads no links or signatures', pg_temp.r_try('select count(*)::text from public.sponsor_sign_links'), 'error 42501');
    perform pg_temp.r_server();
    v := pg_temp.r_says(format('select public.sponsor_sign(%L, ''Priya R065'', null, null, null, ''Priya R065'', %L)', stok, j ->> 'fingerprint'));
    f := f || pg_temp.r_eq('8d a PO is needed to sign', v, 'Add the purchase order number to sign.');
    f := f || pg_temp.r_eq('8e signs with the PO', pg_temp.r_try(format('select (public.sponsor_sign(%L, ''Priya R065'', ''Head of People'', ''PO 4500918823'', null, ''Priya R065'', %L) ? ''signed_at'')::text', stok, j ->> 'fingerprint')), 'true');
    f := f || pg_temp.r_eq('8f once only', pg_temp.r_try(format('select public.sponsor_sign(%L, ''Priya R065'', null, ''PO 1'', null, ''Priya R065'', %L)::text', stok, j ->> 'fingerprint')), 'error CC409');
    perform pg_temp.r_admin();
    f := f || pg_temp.r_eq('8g the version is signed by the sponsor, with the PO, and the link has ended',
      (select concat(v.status, '/', v.sponsor_name, '/', v.sponsor_po, '/', (select l.ended_at is not null from public.sponsor_sign_links l where l.version_id = v.id), '/', (select count(*) from public.sponsor_signatures s where s.version_id = v.id))
         from public.agreement_versions v where v.id = v_spon), 'signed/Priya R065/PO 4500918823/t/1');
    perform pg_temp.r_anon();
    f := f || pg_temp.r_eq('8h the link then says it is signed', public.sponsor_link_open(stok) ->> 'state', 'signed');
    perform pg_temp.r_as(tess_u, 'aal2');
    f := f || pg_temp.r_eq('8i the sponsor''s record never changes', pg_temp.r_try(format('update public.agreement_versions set sponsor_po = ''PO 2'' where id = %L returning ''changed''', v_spon)), 'error 23514');
    f := f || pg_temp.r_eq('8j the coach reads the sponsor''s first open', (select count(*)::text from public.agreement_link_opens where version_id = v_spon and who = 'sponsor'), '1');

    -- ---------------------------------------------------------------- 9. an associate's agreement waits for the owner
    perform pg_temp.r_as(maya_u, 'aal2');
    insert into public.agreements (coach_id, profile_id, agreement_kind, approval) values (maya_c, p_sam, 'sessions', 'waiting') returning id into a_wait;
    insert into public.agreement_versions (agreement_id, coach_id, version, terms, clauses, total_minor, coach_signed_at, coach_signature_id)
    values (a_wait, maya_c, 1, terms_sessions, clauses_one, 1800000, now(), sig_maya) returning id into v_wait;
    f := f || pg_temp.r_eq('9a Maya can''t send it while it waits', pg_temp.r_try(format('update public.agreement_versions set status = ''sent'', sent_at = now() where id = %L returning ''sent''', v_wait)), 'error 42501');
    f := f || pg_temp.r_eq('9b nor approve it herself', pg_temp.r_try(format('update public.agreements set approval = ''approved'' where id = %L returning ''approved''', a_wait)), 'error 42501');
    f := f || pg_temp.r_eq('9c nor through the owner''s function', pg_temp.r_try(format('select public.agreement_approve(%L, true)::text', a_wait)), 'error 42501');
    perform pg_temp.r_as(tess_u, 'aal1');
    f := f || pg_temp.r_eq('9d the owner without her code reads nothing', pg_temp.r_try(format('select public.agreement_for_approval(%L)::text', a_wait)), 'error 42501');
    perform pg_temp.r_as(tess_u, 'aal2');
    j := public.agreement_for_approval(a_wait);
    f := f || pg_temp.r_eq('9e the owner reads it, with whose it is', concat(j ->> 'coach_first', '/', j ->> 'client_name', '/', j ->> 'approval'), 'Maya/Sam R065/waiting');
    f := f || pg_temp.r_eq('9f asking for changes needs a note', pg_temp.r_try(format('select public.agreement_approve(%L, false)::text', a_wait)), 'error 22023');
    f := f || pg_temp.r_eq('9g the owner approves', public.agreement_approve(a_wait, true) ->> 'approval', 'approved');
    perform pg_temp.r_as(maya_u, 'aal2');
    f := f || pg_temp.r_eq('9h approved, Maya sends it', pg_temp.r_try(format('update public.agreement_versions set status = ''sent'', sent_at = now() where id = %L returning ''sent''', v_wait)), 'sent');
    f := f || pg_temp.r_eq('9i the approval stays the owner''s', (select concat(approval, '/', approved_by = tess_c) from public.agreements where id = a_wait), 'approved/t');

    -- ---------------------------------------------------------------- 10. hours, rates, the Fathom mark, sources, invoices
    perform pg_temp.r_as(tess_u, 'aal2');
    insert into public.engagements (id, coach_id, profile_id, kind) values (eng_ben, tess_c, p_ben, 'ongoing');
    insert into public.agreements (coach_id, profile_id, agreement_kind, engagement_id) values (tess_c, p_ben, 'hours', eng_ben) returning id into a_ben;
    insert into public.agreement_versions (agreement_id, coach_id, version, status, terms, clauses, total_minor, coach_signed_at, coach_signature_id, sent_at)
    values (a_ben, tess_c, 1, 'sent', '{"kind":"hours","hours":{"work":"The team Health Check","rateMinor":15000,"blockMinor":200000},"offerUpfront":false}', clauses_one, 200000, now(), sig_tess, now()) returning id into v_ben;
    insert into public.time_entries (engagement_id, coach_id, started_at, ended_at, note) values
      (eng_ben, tess_c, now() - interval '3 days', now() - interval '3 days' + interval '120 minutes', 'Scoring for the team report'),
      (eng_ben, tess_c, now() - interval '2 days', now() - interval '2 days' + interval '190 minutes', 'Question set, second draft');
    perform pg_temp.r_as(ben_u, 'aal1');
    perform public.sign_agreement_v2(v_ben, 'Ben R065', sig_ben, public.agreement_fingerprint(v_ben), true, null);
    j := public.my_hours() -> 0;
    f := f || pg_temp.r_eq('10a my_hours: the block in minutes, the minutes used and each entry',
      concat(j ->> 'block_minutes', '/', j ->> 'used_minutes', '/', jsonb_array_length(j -> 'entries'), '/', j #>> '{entries,0,note}', '/', j ->> 'rate_minor'), '800/310/2/Question set, second draft/15000');
    perform pg_temp.r_as(sam_u, 'aal1');
    f := f || pg_temp.r_eq('10b another client has none', public.my_hours()::text, '[]');
    perform pg_temp.r_anon();
    f := f || pg_temp.r_eq('10c someone signed out is refused', pg_temp.r_try('select public.my_hours()::text'), 'error 42501');
    perform pg_temp.r_server();
    insert into public.fx_reference_rates (day, currency, units_per_gbp, source) values (date '2026-11-24', 'EUR', 1.19, 'ECB'), (date '2026-11-25', 'EUR', 1.19047619, 'ECB'), (date '2026-11-25', 'JPY', 192.3, 'ECB');
    perform pg_temp.r_as(maya_u, 'aal2');
    j := public.coach_fx_rates();
    f := f || pg_temp.r_eq('10d the newest day''s rates for a coach', concat(j ->> 'day', '/', j #>> '{rates,EUR}', '/', j #>> '{rates,JPY}'), '2026-11-25/1.19047619/192.30000000');
    f := f || pg_temp.r_eq('10e never the table itself', pg_temp.r_try('select count(*)::text from public.fx_reference_rates'), 'error 42501');
    perform pg_temp.r_as(maya_u, 'aal1');
    f := f || pg_temp.r_eq('10f nothing without the code', pg_temp.r_try('select public.coach_fx_rates()::text'), 'error 42501');
    perform pg_temp.r_as(sam_u, 'aal1');
    f := f || pg_temp.r_eq('10g nothing for a client', pg_temp.r_try('select public.coach_fx_rates()::text'), 'error 42501');
    -- The Fathom mark, and who said what happened.
    perform pg_temp.r_as(maya_u, 'aal2');
    f := f || pg_temp.r_eq('10h a coach can''t use the Fathom mark', pg_temp.r_try(format('select public.session_mark_from_fathom(%L)::text', sess)), 'error 42501');
    perform pg_temp.r_server();
    f := f || pg_temp.r_eq('10i the server marks it happened, by Fathom', public.session_mark_from_fathom(sess)::text, 'true');
    perform pg_temp.r_admin();
    f := f || pg_temp.r_eq('10j ... and says so', (select concat(outcome, '/', outcome_source, '/', outcome_at is not null) from public.coach_sessions where id = sess), 'held/fathom/t');
    perform pg_temp.r_as(maya_u, 'aal2');
    update public.coach_sessions set outcome = 'late_cancel', outcome_source = 'fathom' where id = sess;
    f := f || pg_temp.r_eq('10k the coach''s change is the coach''s', (select concat(outcome, '/', outcome_source) from public.coach_sessions where id = sess), 'late_cancel/coach');
    perform pg_temp.r_server();
    f := f || pg_temp.r_eq('10l Fathom never overrides the coach', public.session_mark_from_fathom(sess)::text, 'false');
    -- Invoice sources and the new kinds (the server's).
    perform pg_temp.r_server();
    insert into public.invoices (id, coach_id, profile_id, kind, total_minor, version_id) values (gen_random_uuid(), maya_c, p_sam, 'delivered', 75000, v_q);
    insert into public.invoice_sources (coach_id, invoice_id, session_id, minutes) select maya_c, i.id, sess, 60 from public.invoices i where i.version_id = v_q and i.kind = 'delivered';
    f := f || pg_temp.r_eq('10m a session is on one live invoice only',
      pg_temp.r_try(format('insert into public.invoice_sources (coach_id, invoice_id, session_id) select %L, i.id, %L from public.invoices i where i.version_id = %L returning ''added''', maya_c, sess, v_q)), 'error 23505');
    update public.invoice_sources set released_at = now() where session_id = sess;
    f := f || pg_temp.r_eq('10n once released (voided) it can be invoiced again',
      pg_temp.r_try(format('insert into public.invoice_sources (coach_id, invoice_id, session_id) select %L, i.id, %L from public.invoices i where i.version_id = %L returning ''added''', maya_c, sess, v_q)), 'added');
    f := f || pg_temp.r_eq('10o every new kind of invoice is taken',
      pg_temp.r_try(format('insert into public.invoices (coach_id, profile_id, kind, currency) select %L, %L, k, ''EUR'' from unnest(array[''first_payment'',''deposit'',''org_hours'',''top_up'',''updated_price'']) k returning ''added''', maya_c, p_sam)), 'added');
    perform pg_temp.r_as(maya_u, 'aal2');
    f := f || pg_temp.r_eq('10p the coach reads her sources but writes none',
      concat((select count(*) from public.invoice_sources), '/', pg_temp.r_try('delete from public.invoice_sources returning ''gone''')), '2/error 42501');

    raise exception 'undo the test rows' using errcode = 'P0065';
  exception when sqlstate 'P0065' then
    perform pg_temp.r_admin();
  end;
  f := f || pg_temp.r_eq('11 everything the test made is undone',
    (select count(*)::text from auth.users where email like 'p065-%@example.invalid'), '0');
  if cardinality(f) > 0 then
    raise exception E'065 FAILED (%):\n%', cardinality(f), array_to_string(f, E'\n');
  end if;
  raise notice '065 CHECKS PASSED';
end
$t$;
