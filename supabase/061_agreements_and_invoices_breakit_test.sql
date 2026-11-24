-- =============================================================================
-- 061_agreements_and_invoices_breakit_test.sql
-- The break-it tester's checks of supabase/migrations/061_agreements_and_invoices.sql
-- (Phase 6b run 1; 24 Nov 2026). RUN ORDER: 049 to 060, then 061 (twice is
-- fine), then 061's main test, then this. Dry run only, on a local stand-in
-- or the test project.
--
-- WHAT IT TRIES
--   Someone signed out calling every 061 function; a client signing another
--   client's agreement, a version not sent, a version the coach hasn't
--   signed, a version that isn't the newest, with an email not confirmed,
--   or with a name of two letters; a client reading the agreements,
--   versions, invoices or payments tables directly (nothing); a coach
--   without the code reading their own (nothing); an associate reading the
--   owner's agreements and invoices (nothing); anyone signed in taking an
--   invoice number, reading Stripe's messages or writing a subscription.
--   It ends with the notice 061 BREAK-IT CHECKS PASSED, or stops with FAILED.
--   Everything it makes is undone.
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
      raise notice '061 break-it: this database doesn''t let the test write auth.sessions (%)', sqlerrm;
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
  values (u, 'p061-breakit-' || p_label || '-' || u || '@example.invalid', 'authenticated', 'authenticated', case when p_confirmed then now() end);
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
  tess_u uuid; maya_u uuid; ben_u uuid; sam_u uuid; nemo_u uuid;
  tess_c uuid; maya_c uuid;
  p_ben uuid := gen_random_uuid(); p_sam uuid := gen_random_uuid(); p_nemo uuid := gen_random_uuid(); p_tia uuid := gen_random_uuid();
  a_ben uuid; a_sam uuid; a_nemo uuid; a_tia uuid; v_ben uuid; v_sam uuid; v_draft uuid; v_unsigned uuid; v_nemo uuid; v_tia uuid;
  s_ben uuid; s_sam uuid; s_nemo uuid; inv uuid;
begin
  begin
    perform pg_temp.k_admin();
    tess_u := pg_temp.k_user('tess'); maya_u := pg_temp.k_user('maya'); ben_u := pg_temp.k_user('ben'); sam_u := pg_temp.k_user('sam');
    nemo_u := pg_temp.k_user('nemo', false);
    insert into public.coaches (user_id, role, display_first_name) values (tess_u, 'owner', 'Tess') returning id into tess_c;
    insert into public.coaches (user_id, role, display_first_name) values (maya_u, 'coach', 'Maya') returning id into maya_c;
    perform set_config('clarity.linking', 'on', true);
    insert into public.client_profiles (id, coach_id, name, user_id) values (p_ben, maya_c, 'Ben K061', ben_u), (p_sam, maya_c, 'Sam K061', sam_u),
      (p_nemo, maya_c, 'Nemo K061', nemo_u), (p_tia, tess_c, 'Tia K061', null);
    perform set_config('clarity.linking', '', true);
    insert into public.agreements (coach_id, profile_id) values (maya_c, p_ben) returning id into a_ben;
    insert into public.agreements (coach_id, profile_id) values (maya_c, p_sam) returning id into a_sam;
    insert into public.agreements (coach_id, profile_id) values (maya_c, p_nemo) returning id into a_nemo;
    insert into public.agreements (coach_id, profile_id) values (tess_c, p_tia) returning id into a_tia;
    insert into public.agreement_versions (agreement_id, coach_id, version, status, coach_signed_at, sent_at) values (a_ben, maya_c, 1, 'sent', now(), now()) returning id into v_ben;
    insert into public.agreement_versions (agreement_id, coach_id, version, status, coach_signed_at, sent_at) values (a_sam, maya_c, 1, 'sent', now(), now()) returning id into v_sam;
    insert into public.agreement_versions (agreement_id, coach_id, version, status) values (a_sam, maya_c, 2, 'draft') returning id into v_draft;
    insert into public.agreement_versions (agreement_id, coach_id, version, status, sent_at) values (a_ben, maya_c, 2, 'sent', now()) returning id into v_unsigned;
    insert into public.agreement_versions (agreement_id, coach_id, version, status, coach_signed_at, sent_at) values (a_nemo, maya_c, 1, 'sent', now(), now()) returning id into v_nemo;
    insert into public.agreement_versions (agreement_id, coach_id, version, status, coach_signed_at, sent_at) values (a_tia, tess_c, 1, 'sent', now(), now()) returning id into v_tia;
    update public.agreements set current_version = 2 where id = a_ben;
    insert into public.signatures (user_id, kind, typed_name) values (ben_u, 'typed', 'Ben Carter') returning id into s_ben;
    insert into public.signatures (user_id, kind, typed_name) values (sam_u, 'typed', 'Sam Reid') returning id into s_sam;
    insert into public.signatures (user_id, kind, typed_name) values (nemo_u, 'typed', 'Nemo Fish') returning id into s_nemo;
    insert into public.invoices (coach_id, profile_id, number, status, total_minor) values (tess_c, p_tia, public.next_invoice_number(), 'sent', 1000) returning id into inv;

    -- 1. signed out
    perform pg_temp.k_anon();
    f := f || pg_temp.k_eq('1a signed out: my_agreements', pg_temp.k_try('select public.my_agreements()::text'), 'error 42501');
    f := f || pg_temp.k_eq('1b signed out: my_invoices', pg_temp.k_try('select public.my_invoices()::text'), 'error 42501');
    f := f || pg_temp.k_eq('1c signed out: sign_agreement', pg_temp.k_try(format('select public.sign_agreement(%L, ''x'', %L, ''x'')::text', v_ben, s_ben)), 'error 42501');
    f := f || pg_temp.k_eq('1d signed out: the tables', pg_temp.k_try('select count(*)::text from public.invoices'), 'error 42501');

    -- 2. clients signing what isn't theirs, or isn't signable
    perform pg_temp.k_as(sam_u, 'aal1');
    f := f || pg_temp.k_eq('2a Sam signing Ben''s agreement', pg_temp.k_try(format('select public.sign_agreement(%L, ''Sam Reid'', %L, public.agreement_fingerprint(%L))::text', v_ben, s_sam, v_ben)), 'error 42501');
    f := f || pg_temp.k_eq('2b Sam signing a draft version', pg_temp.k_try(format('select public.sign_agreement(%L, ''Sam Reid'', %L, public.agreement_fingerprint(%L))::text', v_draft, s_sam, v_draft)), 'error CC409');
    f := f || pg_temp.k_eq('2c Sam signing with a name of two letters', pg_temp.k_try(format('select public.sign_agreement(%L, ''Sa'', %L, public.agreement_fingerprint(%L))::text', v_sam, s_sam, v_sam)), 'error 22023');
    f := f || pg_temp.k_eq('2d Sam signing with a made-up fingerprint', pg_temp.k_try(format('select public.sign_agreement(%L, ''Sam Reid'', %L, %L)::text', v_sam, s_sam, repeat('a', 64))), 'error CC409');
    f := f || pg_temp.k_eq('2e Sam reads no agreement table rows', pg_temp.k_try('select (select count(*) from public.agreements) || ''/'' || (select count(*) from public.agreement_versions) || ''/'' || (select count(*) from public.invoices) || ''/'' || (select count(*) from public.payments)'), '0/0/0/0');
    f := f || pg_temp.k_eq('2f Sam can''t take an invoice number', pg_temp.k_try('select public.next_invoice_number()::text'), 'error 42501');
    f := f || pg_temp.k_eq('2g Sam can''t read Stripe''s messages', pg_temp.k_try('select count(*)::text from public.stripe_events'), 'error 42501');
    f := f || pg_temp.k_eq('2h Sam can''t give himself a portal level', pg_temp.k_try(format('insert into public.portal_subscriptions (user_id, level) values (%L, ''executive'') returning ''added''', sam_u)), 'error 42501');
    perform pg_temp.k_as(ben_u, 'aal1');
    f := f || pg_temp.k_eq('2i Ben signing a version the coach hasn''t signed', pg_temp.k_try(format('select public.sign_agreement(%L, ''Ben Carter'', %L, public.agreement_fingerprint(%L))::text', v_unsigned, s_ben, v_unsigned)), 'error CC409');
    f := f || pg_temp.k_eq('2j Ben signing version 1 when it isn''t the newest',
      pg_temp.k_try(format('select public.sign_agreement(%L, ''Ben Carter'', %L, public.agreement_fingerprint(%L))::text', v_ben, s_ben, v_ben)), 'error CC409');
    perform pg_temp.k_as(nemo_u, 'aal1');
    f := f || pg_temp.k_eq('2k Nemo, email not confirmed', pg_temp.k_try(format('select public.sign_agreement(%L, ''Nemo Fish'', %L, public.agreement_fingerprint(%L))::text', v_nemo, s_nemo, v_nemo)), 'error 42501');

    -- 3. coaches
    perform pg_temp.k_as(maya_u, 'aal1');
    f := f || pg_temp.k_eq('3a Maya without the code reads nothing of her own', pg_temp.k_try('select ((select count(*) from public.agreements) + (select count(*) from public.agreement_versions))::text'), '0');
    perform pg_temp.k_as(maya_u, 'aal2');
    f := f || pg_temp.k_eq('3b Maya never reads Tess''s agreement or invoice',
      (select (select count(*) from public.agreements where id = a_tia) || '/' || (select count(*) from public.invoices where id = inv)), '0/0');
    f := f || pg_temp.k_eq('3c Maya can''t make an agreement for Tess', pg_temp.k_try(format('insert into public.agreements (coach_id, profile_id) values (%L, %L) returning ''added''', tess_c, p_tia)), 'error 42501');
    f := f || pg_temp.k_eq('3d Maya can''t mark an invoice paid', pg_temp.k_try(format('update public.invoices set status = ''paid'' where id = %L returning ''changed''', inv)), 'ok');
    perform pg_temp.k_admin();
    f := f || pg_temp.k_eq('3e and it stays as it was', (select status from public.invoices where id = inv), 'sent');

    perform pg_temp.k_admin();
    raise exception 'undo the test rows' using errcode = 'P0061';
  exception when sqlstate 'P0061' then
    perform pg_temp.k_admin();
  end;
  f := f || pg_temp.k_eq('9 everything the test made is undone', (select count(*)::text from auth.users where email like 'p061-breakit-%@example.invalid'), '0');
  if cardinality(f) > 0 then
    raise exception E'061 BREAK-IT FAILED (%):\n%', cardinality(f), array_to_string(f, E'\n');
  end if;
  raise notice '061 BREAK-IT CHECKS PASSED';
end
$t$;
