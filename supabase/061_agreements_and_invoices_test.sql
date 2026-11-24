-- =============================================================================
-- 061_agreements_and_invoices_test.sql
-- Checks supabase/migrations/061_agreements_and_invoices.sql. RUN ORDER: 049
-- to 060, then 061 (twice is fine), then this. Dry run only, on a local
-- stand-in or the test project.
--
-- WHAT IT CHECKS
--   Invoice numbers come from 1201, in order, one each, never reused. A coach
--   makes an agreement (its reference CLARITY-AG-…), a version with its
--   terms, signs it and sends it; a version once sent can't change. The
--   self-funded client reads it with every figure (my_agreements); the
--   organisation-funded client reads theirs with no amount anywhere (terms,
--   clauses, total). The client signs (sign_agreement): the signing record
--   holds their full name, verified email, the time, their account and the
--   document's fingerprint; the earlier version is superseded; the coach gets
--   a notification; a second signing is told it's already signed. A change
--   is asked for on a clause and the coach reads it. my_invoices gives the
--   self-funded client their sent and paid invoices only, and the funded
--   client none. The owner reads an associate's invoices; the associate
--   never reads the owner's. A signature pasted as words in place of a
--   drawing, or a typed one with no name, is refused.
--
--   It ends with the notice 061 CHECKS PASSED, or stops with FAILED and a
--   list naming each check that failed. Everything it makes is undone.
-- =============================================================================
create or replace function pg_temp.g_as(p uuid, p_aal text) returns void language plpgsql as $f$
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
      raise notice '061: this database doesn''t let the test write auth.sessions (%)', sqlerrm;
    end;
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated', 'aal', p_aal,
    'amr', json_build_array(json_build_object('method', 'password', 'timestamp', floor(extract(epoch from now()))::bigint)),
    'iat', floor(extract(epoch from now()))::bigint, 'session_id', sid)::text, true);
  perform set_config('role', 'authenticated', true);
end $f$;
create or replace function pg_temp.g_admin() returns void language plpgsql as $f$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
end $f$;
create or replace function pg_temp.g_user(p_label text, p_confirmed boolean default true) returns uuid language plpgsql as $f$
declare u uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, aud, role, email_confirmed_at)
  values (u, 'p061-' || p_label || '-' || u || '@example.invalid', 'authenticated', 'authenticated', case when p_confirmed then now() end);
  return u;
end $f$;
create or replace function pg_temp.g_eq(p_name text, p_got text, p_want text) returns text[] language sql as $f$
  select case when p_got is distinct from p_want then array[format('%s: expected %s, got %s', p_name, p_want, coalesce(p_got, 'nothing'))] else '{}'::text[] end;
$f$;
create or replace function pg_temp.g_try(p_sql text) returns text language plpgsql as $f$
declare v text;
begin
  execute p_sql into v;
  return coalesce(v, 'ok');
exception when others then
  return 'error ' || sqlstate;
end $f$;
-- A small drawn signature (a real PNG's shape, as the signature pad saves it).
create or replace function pg_temp.g_png() returns text language sql immutable as $f$
  select 'data:image/png;base64,' || repeat('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg', 3);
$f$;

do $t$
declare
  f text[] := '{}';
  tess_u uuid; maya_u uuid; ben_u uuid; priya_u uuid;
  tess_c uuid; maya_c uuid;
  p_ben uuid := gen_random_uuid(); p_priya uuid := gen_random_uuid(); p_tess uuid := gen_random_uuid();
  a_ben uuid; a_priya uuid; v1 uuid; v2 uuid; vp uuid;
  sig_maya uuid; sig_ben uuid; sig_priya uuid;
  n1 integer; n2 integer;
  r jsonb; v text; fp text;
  inv_ben uuid; inv_draft uuid; inv_priya uuid; inv_tess uuid;
begin
  begin
    perform pg_temp.g_admin();
    tess_u := pg_temp.g_user('tess'); maya_u := pg_temp.g_user('maya'); ben_u := pg_temp.g_user('ben'); priya_u := pg_temp.g_user('priya');
    insert into public.coaches (user_id, role, display_first_name) values (tess_u, 'owner', 'Tess') returning id into tess_c;
    insert into public.coaches (user_id, role, display_first_name) values (maya_u, 'coach', 'Maya') returning id into maya_c;
    perform set_config('clarity.linking', 'on', true);
    insert into public.client_profiles (id, coach_id, name, email, user_id) values
      (p_ben, maya_c, 'Ben G061', 'ben.g061@example.invalid', ben_u), (p_priya, maya_c, 'Priya G061', 'priya.g061@example.invalid', priya_u),
      (p_tess, tess_c, 'Tia G061', 'tia.g061@example.invalid', null);
    perform set_config('clarity.linking', '', true);

    -- 1. invoice numbers
    n1 := public.next_invoice_number(); n2 := public.next_invoice_number();
    f := f || pg_temp.g_eq('1a invoice numbers start at 1201 or later and go up by one', (n1 >= 1201 and n2 = n1 + 1)::text, 'true');
    f := f || pg_temp.g_eq('1b the number can''t be set back below 1201', pg_temp.g_try('select setval(''public.clarity_invoice_number'', 1000)::text'), 'error 22003');

    -- 2. Maya makes, signs and sends Ben's agreement (self-funded) and Priya's (funded by Larkfield Health)
    perform pg_temp.g_as(maya_u, 'aal2');
    insert into public.signatures (user_id, kind, image) values (maya_u, 'drawn', pg_temp.g_png()) returning id into sig_maya;
    insert into public.agreements (coach_id, profile_id) values (maya_c, p_ben) returning id into a_ben;
    insert into public.agreements (coach_id, profile_id) values (maya_c, p_priya) returning id into a_priya;
    insert into public.agreement_versions (agreement_id, coach_id, version, status, terms, clauses, total_minor, coach_signed_at, coach_signature_id, sent_at)
    values (a_ben, maya_c, 1, 'sent', '{"coaching":"6-month coaching","investment":"£18,000, in 6 monthly instalments of £3,000","rate":{"minor":75000,"per":"hour"}}',
            '[{"key":"3","title":"Your investment","money":true,"text":"Your investment is £18,000 in pounds."},{"key":"4","title":"Rearranging and cancelling","text":"You can rearrange…"}]',
            1800000, now(), sig_maya, now())
    returning id into v1;
    insert into public.agreement_versions (agreement_id, coach_id, version, status, terms, clauses, total_minor, funded_by, coach_signed_at, coach_signature_id, sent_at)
    values (a_priya, maya_c, 1, 'sent', '{"coaching":"6-month coaching","investment":"£18,000","rate":{"minor":75000,"per":"hour"},"funded_by":"Larkfield Health"}',
            '[{"key":"3","title":"Your investment","money":true,"text":"Your investment is £18,000."},{"key":"4","title":"Rearranging and cancelling","text":"You can rearrange…"}]',
            1800000, 'Larkfield Health', now(), sig_maya, now())
    returning id into vp;
    f := f || pg_temp.g_eq('2a the agreement takes a reference CLARITY-AG-…', (select (reference ~ '^CLARITY-AG-\d{4,}$')::text from public.agreements where id = a_ben), 'true');
    f := f || pg_temp.g_eq('2b a version once sent can''t change its terms',
      pg_temp.g_try(format('update public.agreement_versions set terms = ''{}'' where id = %L returning ''changed''', v1)), 'error 23514');
    perform pg_temp.g_admin();

    -- 3. what each client reads
    perform pg_temp.g_as(ben_u, 'aal1');
    r := public.my_agreements();
    f := f || pg_temp.g_eq('3a Ben reads his one agreement, with its figures', concat(jsonb_array_length(r), '/', r->0->>'total_minor', '/', r->0->>'currency', '/', jsonb_array_length(r->0->'clauses')), '1/1800000/GBP/2');
    f := f || pg_temp.g_eq('3b Ben can''t read the agreements table itself', (select count(*)::text from public.agreements), '0');
    perform pg_temp.g_as(priya_u, 'aal1');
    r := public.my_agreements();
    f := f || pg_temp.g_eq('3c Priya reads hers, funded by Larkfield Health', concat(jsonb_array_length(r), '/', r->0->>'funded_by'), '1/Larkfield Health');
    f := f || pg_temp.g_eq('3d no amount for Priya anywhere: no £ or 1800000 in what she reads', (r::text ~ '£|1800000|75000|investment')::text, 'false');
    f := f || pg_temp.g_eq('3e Priya keeps the clauses without money', (select string_agg(c->>'key', ',') from jsonb_array_elements(r->0->'clauses') c), '4');
    perform pg_temp.g_admin();

    -- 4. Ben signs
    perform pg_temp.g_as(ben_u, 'aal1');
    insert into public.signatures (user_id, kind, image) values (ben_u, 'drawn', pg_temp.g_png()) returning id into sig_ben;
    fp := public.agreement_fingerprint(v1);
    r := public.sign_agreement(v1, 'Ben Carter', sig_ben, fp);
    f := f || pg_temp.g_eq('4a signed, with the fingerprint he read', r->>'fingerprint', fp);
    f := f || pg_temp.g_eq('4b a second signing is told it''s already signed', pg_temp.g_try(format('select public.sign_agreement(%L, ''Ben Carter'', %L, %L)::text', v1, sig_ben, fp)), 'error CC409');
    perform pg_temp.g_admin();
    f := f || pg_temp.g_eq('4c the signing record: name, verified email, account, time, fingerprint',
      (select concat(signed_name, '/', signed_email = (select email from auth.users where id = ben_u), '/', signed_user_id = ben_u, '/', client_signed_at is not null, '/', fingerprint = fp, '/', status)
       from public.agreement_versions where id = v1), 'Ben Carter/t/t/t/t/signed');
    f := f || pg_temp.g_eq('4d the agreement reads signed', (select status from public.agreements where id = a_ben), 'signed');
    f := f || pg_temp.g_eq('4e Maya is told', (select count(*)::text from public.coach_notifications where coach_id = maya_c and title = 'Ben G061 signed their agreement'), '1');
    f := f || pg_temp.g_eq('4f the signing record never changes',
      pg_temp.g_try(format('update public.agreement_versions set signed_name = ''Someone Else'' where id = %L returning ''changed''', v1)), 'error 23514');

    -- 5. a second version supersedes the first once signed; a change is asked for first
    perform pg_temp.g_as(maya_u, 'aal2');
    update public.agreements set current_version = 2 where id = a_ben;
    insert into public.agreement_versions (agreement_id, coach_id, version, status, terms, clauses, total_minor, coach_signed_at, coach_signature_id, sent_at, changes)
    values (a_ben, maya_c, 2, 'sent', '{"coaching":"6-month coaching, renewed"}', '[{"key":"4","title":"Rearranging and cancelling","text":"12 hours"}]', 900000, now(), sig_maya, now(), '["4"]')
    returning id into v2;
    perform pg_temp.g_as(ben_u, 'aal1');
    perform public.ask_agreement_change(v2, '4', 'Could the notice be 12 hours for early morning coaching sessions?');
    f := f || pg_temp.g_eq('5a an old fingerprint is refused', pg_temp.g_try(format('select public.sign_agreement(%L, ''Ben Carter'', %L, %L)::text', v2, sig_ben, fp)), 'error CC409');
    r := public.sign_agreement(v2, 'Ben Carter', sig_ben, public.agreement_fingerprint(v2));
    perform pg_temp.g_as(maya_u, 'aal2');
    f := f || pg_temp.g_eq('5b Maya reads the change asked for', (select string_agg(clause_key || ':' || words, ',') from public.agreement_change_requests where version_id = v2), '4:Could the notice be 12 hours for early morning coaching sessions?');
    f := f || pg_temp.g_eq('5c version 1 is superseded, version 2 signed', (select string_agg(version || ':' || status, ',' order by version) from public.agreement_versions where agreement_id = a_ben), '1:superseded,2:signed');
    perform pg_temp.g_admin();

    -- 6. invoices: the server writes them; who reads them
    insert into public.invoices (coach_id, agreement_id, profile_id, number, status, total_minor, due_on, issued_on, sent_at, hosted_url)
      values (maya_c, a_ben, p_ben, public.next_invoice_number(), 'sent', 300000, current_date + 14, current_date, now(), 'https://invoice.stripe.example/i1') returning id into inv_ben;
    insert into public.invoices (coach_id, agreement_id, profile_id, number, status, total_minor) values (maya_c, a_ben, p_ben, public.next_invoice_number(), 'draft', 300000) returning id into inv_draft;
    insert into public.invoices (coach_id, agreement_id, profile_id, number, status, total_minor, settles_to, due_on) values (maya_c, a_priya, p_priya, public.next_invoice_number(), 'sent', 300000, 'organisation', current_date + 30) returning id into inv_priya;
    insert into public.invoices (coach_id, profile_id, number, status, total_minor) values (tess_c, p_tess, public.next_invoice_number(), 'sent', 50000) returning id into inv_tess;
    perform pg_temp.g_as(ben_u, 'aal1');
    r := public.my_invoices();
    f := f || pg_temp.g_eq('6a Ben reads his sent invoice, never the draft', concat(jsonb_array_length(r), '/', r->0->>'total_minor', '/', (r->0->>'number') ~ '^CLARITY-\d+$'), '1/300000/t');
    perform pg_temp.g_as(priya_u, 'aal1');
    f := f || pg_temp.g_eq('6b Priya (funded) reads no invoice', jsonb_array_length(public.my_invoices())::text, '0');
    perform pg_temp.g_as(maya_u, 'aal2');
    f := f || pg_temp.g_eq('6c Maya reads her own invoices, never Tess''s', (select concat(count(*) filter (where coach_id = maya_c), '/', count(*) filter (where coach_id = tess_c)) from public.invoices where id in (inv_ben, inv_draft, inv_priya, inv_tess)), '3/0');
    f := f || pg_temp.g_eq('6d Maya can''t write an invoice herself (the server does)', pg_temp.g_try(format('insert into public.invoices (coach_id, total_minor) values (%L, 100) returning ''added''', maya_c)), 'error 42501');
    perform pg_temp.g_as(tess_u, 'aal2');
    f := f || pg_temp.g_eq('6e the owner reads every coach''s invoices', (select count(*)::text from public.invoices where id in (inv_ben, inv_draft, inv_priya, inv_tess)), '4');
    perform pg_temp.g_admin();

    -- 7. signatures
    perform pg_temp.g_as(priya_u, 'aal1');
    f := f || pg_temp.g_eq('7a a signature pasted as words in place of a drawing is refused',
      pg_temp.g_try(format('insert into public.signatures (user_id, kind, image) values (%L, ''drawn'', ''Priya G061'') returning ''added''', priya_u)), 'error 23514');
    f := f || pg_temp.g_eq('7b a typed signature needs a name', pg_temp.g_try(format('insert into public.signatures (user_id, kind) values (%L, ''typed'') returning ''added''', priya_u)), 'error 23514');
    f := f || pg_temp.g_eq('7c a signature for someone else is refused',
      pg_temp.g_try(format('insert into public.signatures (user_id, kind, typed_name) values (%L, ''typed'', ''Ben Carter'') returning ''added''', ben_u)), 'error 42501');
    insert into public.signatures (user_id, kind, typed_name) values (priya_u, 'typed', 'Priya Shah') returning id into sig_priya;
    f := f || pg_temp.g_eq('7d Priya can''t sign with Ben''s signature', pg_temp.g_try(format('select public.sign_agreement(%L, ''Priya Shah'', %L, %L)::text', vp, sig_ben, public.agreement_fingerprint(vp))), 'error 22023');
    r := public.sign_agreement(vp, 'Priya Shah', sig_priya, public.agreement_fingerprint(vp));
    f := f || pg_temp.g_eq('7e Priya signs with her typed signature', (r->>'version'), '1');
    perform pg_temp.g_admin();

    raise exception 'undo the test rows' using errcode = 'P0061';
  exception when sqlstate 'P0061' then
    perform pg_temp.g_admin();
  end;
  f := f || pg_temp.g_eq('8 everything the test made is undone', (select count(*)::text from auth.users where email like 'p061-%@example.invalid'), '0');
  if cardinality(f) > 0 then
    raise exception E'061 FAILED (%):\n%', cardinality(f), array_to_string(f, E'\n');
  end if;
  raise notice '061 CHECKS PASSED';
end
$t$;
