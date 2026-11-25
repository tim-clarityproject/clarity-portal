-- =============================================================================
-- 065_agreements_engine_breakit_test.sql
-- Tries to break supabase/migrations/065_agreements_engine.sql. RUN ORDER: 049
-- to 064, then 065 (twice is fine), then this (on its own, in a fresh copy:
-- its helpers are named b_ so they never meet 065's main test's).
--
-- WHAT IT TRIES
--   1. Someone signed out: every client and coach function refuses or
--      answers nothing; odd tokens give nothing; no table is readable.
--   2. A client: another client's agreement can't be signed, opened or
--      read; a coach's signing can't be done for them; a second tab's
--      signing is told; a version past its day or a cancelled agreement
--      can't be signed; a client can't write any 065 table.
--   3. A coach: a quote on someone else's agreement or version, a link or
--      number of their own choosing, acceptance by hand, opens, reminders,
--      cancellations and sources written by hand, another coach's team
--      agreement as a parent, cancelling or expiring by hand, approval by
--      hand or back to "not needed", the owner's packages changed, odd
--      evidence paths and types, an http portal, odd talking points, a
--      lower-case currency.
--   4. The server's functions with odd input: too many extras, a choice for
--      a funded agreement, wording that isn't a list, a sponsor's markup
--      name or signature both drawn and typed, a PO with markup.
--   5. The 14 days can't be stepped round by moving a session in, and a
--      group session and an older agreement are unaffected.
--   It ends with the notice 065 BREAK-IT CHECKS PASSED, or stops with FAILED
--   and a list naming each check that failed. Everything it makes is undone.
-- =============================================================================
create or replace function pg_temp.b_as(p uuid, p_aal text default 'aal1') returns void language plpgsql as $f$
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
create or replace function pg_temp.b_anon() returns void language plpgsql as $f$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('role', 'anon', true);
end $f$;
create or replace function pg_temp.b_server() returns void language plpgsql as $f$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  perform set_config('role', 'service_role', true);
end $f$;
create or replace function pg_temp.b_admin() returns void language plpgsql as $f$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
end $f$;
create or replace function pg_temp.b_user(p_label text) returns uuid language plpgsql as $f$
declare u uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, aud, role, email_confirmed_at)
  values (u, 'b065-' || p_label || '-' || u || '@example.invalid', 'authenticated', 'authenticated', now());
  return u;
end $f$;
create or replace function pg_temp.b_try(p_sql text) returns text language plpgsql as $f$
declare v text;
begin
  execute p_sql into v;
  return coalesce(v, 'null');
exception when others then
  return 'error ' || sqlstate;
end $f$;
-- 'nothing' when refused or empty; otherwise what came back.
create or replace function pg_temp.b_nothing(p_sql text) returns text language plpgsql as $f$
declare v text;
begin
  execute p_sql into v;
  if v is null or v in ('[]', '{}', 'null') then return 'nothing'; end if;
  return 'gave ' || left(v, 80);
exception when others then
  return 'nothing';
end $f$;
create or replace function pg_temp.b_eq(p_name text, p_got text, p_want text) returns text[] language sql as $f$
  select case when p_got is distinct from p_want
              then array[format('%s: expected %s, got %s', p_name, p_want, coalesce(p_got, 'nothing'))]
              else '{}'::text[] end;
$f$;
create or replace function pg_temp.b_png() returns text language sql immutable as $f$
  select 'data:image/png;base64,' || repeat('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg', 3);
$f$;

do $t$
declare
  f text[] := '{}';
  q text;
  tess_u uuid; maya_u uuid; sam_u uuid; zoe_u uuid; tess_c uuid; maya_c uuid;
  p_sam uuid := gen_random_uuid(); p_zoe uuid := gen_random_uuid(); org uuid := gen_random_uuid(); grp uuid := gen_random_uuid();
  sig_maya uuid; sig_sam uuid; sig_zoe uuid;
  a_sam uuid; v_sam uuid; a_zoe uuid; v_zoe uuid; a_tess uuid; v_tess uuid; a_spon uuid; v_spon uuid; qid uuid; tok text; pkg uuid;
  stok text := repeat('6', 64);
  clauses_one jsonb := '[{"key":"coaching","number":1,"title":"The coaching","paragraphs":[{"text":"You have 6 coaching sessions.","why":null}]}]';
  terms_q jsonb := '{"kind":"sessions","settle":"equal","offerUpfront":true,"extrasOffered":[{"key":"visit","title":"Visit day","priceMinor":250000}]}';
begin
  begin
    perform pg_temp.b_admin();
    tess_u := pg_temp.b_user('tess'); maya_u := pg_temp.b_user('maya'); sam_u := pg_temp.b_user('sam'); zoe_u := pg_temp.b_user('zoe');
    insert into public.coaches (user_id, role, display_first_name) values (tess_u, 'owner', 'Tess') returning id into tess_c;
    insert into public.coaches (user_id, role, display_first_name) values (maya_u, 'coach', 'Maya') returning id into maya_c;
    insert into public.organisations (id, name) values (org, 'Kestrel B065');
    insert into public.client_profiles (id, coach_id, name, email, time_zone, organisation_id) values
      (p_sam, maya_c, 'Sam B065', 'sam.b065@example.invalid', 'Europe/London', org),
      (p_zoe, maya_c, 'Zoe B065', 'zoe.b065@example.invalid', 'Pacific/Auckland', null);
    perform set_config('clarity.linking', 'on', true);
    update public.client_profiles set user_id = sam_u where id = p_sam;
    update public.client_profiles set user_id = zoe_u where id = p_zoe;
    perform set_config('clarity.linking', '', true);
    insert into public.signatures (user_id, kind, image) values (maya_u, 'drawn', pg_temp.b_png()) returning id into sig_maya;
    insert into public.signatures (user_id, kind, typed_name) values (sam_u, 'typed', 'Sam B065') returning id into sig_sam;
    insert into public.signatures (user_id, kind, typed_name) values (zoe_u, 'typed', 'Zoe B065') returning id into sig_zoe;
    insert into public.agreements (id, coach_id, profile_id) values (gen_random_uuid(), maya_c, p_sam) returning id into a_sam;
    insert into public.agreement_versions (agreement_id, coach_id, version, status, terms, clauses, total_minor, coach_signed_at, coach_signature_id, sent_at)
    values (a_sam, maya_c, 1, 'sent', terms_q, clauses_one, 1800000, now(), sig_maya, now()) returning id into v_sam;
    insert into public.agreements (coach_id, profile_id) values (maya_c, p_zoe) returning id into a_zoe;
    insert into public.agreement_versions (agreement_id, coach_id, version, status, terms, clauses, total_minor, coach_signed_at, coach_signature_id, sent_at, expires_on)
    values (a_zoe, maya_c, 1, 'sent', terms_q, clauses_one, 1800000, now(), sig_maya, now(), date '2026-01-01') returning id into v_zoe;
    insert into public.client_profiles (id, coach_id, name) values (gen_random_uuid(), tess_c, 'Tia B065');
    insert into public.agreements (coach_id, profile_id) select tess_c, id from public.client_profiles where name = 'Tia B065' returning id into a_tess;
    insert into public.agreement_versions (agreement_id, coach_id, version, terms, clauses) values (a_tess, tess_c, 1, terms_q, clauses_one) returning id into v_tess;
    insert into public.pricing_packages (coach_id, name, agreement_kind, defaults) values (tess_c, '6-month coaching', 'sessions', '{"healthCheck":false}') returning id into pkg;
    insert into public.agreements (coach_id, kind, organisation_id, agreement_kind) values (tess_c, 'sponsor', org, 'team') returning id into a_spon;
    insert into public.agreement_versions (agreement_id, coach_id, version, status, terms, clauses, coach_signed_at, sent_at)
    values (a_spon, tess_c, 1, 'sent', '{"kind":"team"}', clauses_one, now(), now()) returning id into v_spon;
    insert into public.sponsor_sign_links (coach_id, agreement_id, version_id, token_hash, sponsor_name, sponsor_email, expires_at)
    values (tess_c, a_spon, v_spon, encode(sha256(convert_to(stok, 'UTF8')), 'hex'), 'Priya B065', 'priya.b065@example.invalid', now() + interval '30 days');

    -- ---------------------------------------------------------------- 1. someone signed out
    perform pg_temp.b_anon();
    foreach q in array array['select public.my_hours()::text', format('select public.agreement_mark_opened(%L)::text', v_sam),
                             format('select public.sign_agreement_v2(%L, ''Sam B065'', %L, ''x'', false, null)::text', v_sam, sig_sam),
                             format('select public.agreement_for_approval(%L)::text', a_sam), format('select public.agreement_approve(%L, true)::text', a_sam),
                             'select public.coach_fx_rates()::text', format('select public.quote_take_number(%L)::text', gen_random_uuid()),
                             format('select public.session_mark_from_fathom(%L)::text', gen_random_uuid()),
                             format('select public.quote_accept(%L, ''{}'', null, %L, 1)::text', repeat('a', 64), clauses_one),
                             format('select public.sponsor_sign(%L, ''A B C'', null, null, null, ''A B C'', ''x'')::text', stok),
                             'select public.practice_owner_ids()::text'] loop
      f := f || pg_temp.b_eq('1a signed out: ' || left(q, 60), pg_temp.b_nothing(q), 'nothing');
    end loop;
    foreach q in array array['agreement_clause_standards', 'agreement_extras', 'agreement_quotes', 'agreement_link_opens', 'agreement_reminders',
                             'agreement_cancellations', 'invoice_sources', 'org_billing_profiles', 'invoice_evidence', 'talking_points', 'needs_you_done',
                             'quote_number_counter', 'sponsor_sign_links', 'sponsor_signatures', 'fx_reference_rates'] loop
      f := f || pg_temp.b_eq('1b signed out reads no ' || q, pg_temp.b_try(format('select count(*)::text from public.%I', q)), 'error 42501');
    end loop;
    foreach q in array array['', 'x', repeat('g', 64), repeat('A', 64), repeat('a', 63), repeat('a', 65), ''' or 1=1 --', repeat('a', 64)] loop
      f := f || pg_temp.b_eq('1c an odd quote token gives nothing: ' || left(q, 12), coalesce(public.quote_open(q)::text, 'nothing'), 'nothing');
      f := f || pg_temp.b_eq('1d an odd sponsor token gives nothing: ' || left(q, 12), coalesce(public.sponsor_link_open(q)::text, 'nothing'), 'nothing');
    end loop;

    -- ---------------------------------------------------------------- 2. a client
    perform pg_temp.b_as(zoe_u, 'aal1');
    f := f || pg_temp.b_eq('2a Zoe can''t sign Sam''s', pg_temp.b_try(format('select public.sign_agreement_v2(%L, ''Zoe B065'', %L, public.agreement_fingerprint(%L), false, null)::text', v_sam, sig_zoe, v_sam)), 'error 42501');
    f := f || pg_temp.b_eq('2b nor sign with Sam''s signature on her own', pg_temp.b_try(format('select public.sign_agreement_v2(%L, ''Zoe B065'', %L, public.agreement_fingerprint(%L), false, null)::text', v_zoe, sig_sam, v_zoe)), 'error CC409');
    f := f || pg_temp.b_eq('2c her own has run out (on her own clock, in Auckland)', pg_temp.b_try(format('select public.sign_agreement_v2(%L, ''Zoe B065'', %L, public.agreement_fingerprint(%L), false, null)::text', v_zoe, sig_zoe, v_zoe)), 'error CC409');
    perform public.agreement_mark_opened(v_sam);
    f := f || pg_temp.b_eq('2d her open on Sam''s isn''t recorded, and she reads no opens', (select count(*)::text from public.agreement_link_opens), '0');
    f := f || pg_temp.b_eq('2e Sam''s agreement isn''t in hers', (select count(*)::text from jsonb_array_elements(public.my_agreements()) x where x->>'id' = v_sam::text), '0');
    foreach q in array array[
      format('insert into public.agreement_link_opens (coach_id, version_id, who) values (%L, %L, ''client'') returning ''added''', maya_c, v_zoe),
      format('insert into public.needs_you_done (coach_id, item_key) values (%L, ''x'') returning ''added''', maya_c),
      format('insert into public.agreement_extras (coach_id, key, title, price_minor) values (%L, ''x'', ''X'', 1) returning ''added''', maya_c),
      format('update public.agreement_versions set start_now = true where id = %L returning ''changed''', v_zoe)] loop
      f := f || pg_temp.b_eq('2f a client writes nothing: ' || left(q, 50), (select case when x in ('null', 'error 42501') then 'nothing' else x end from pg_temp.b_try(q) x), 'nothing');
    end loop;
    perform pg_temp.b_as(sam_u, 'aal1');
    f := f || pg_temp.b_eq('2g Sam signs', pg_temp.b_try(format('select (public.sign_agreement_v2(%L, ''Sam B065'', %L, public.agreement_fingerprint(%L), true, ''sideways'') ->> ''settle_choice'')', v_sam, sig_sam, v_sam)), 'upfront');
    f := f || pg_temp.b_eq('2h a second tab is told', pg_temp.b_try(format('select public.sign_agreement_v2(%L, ''Sam B065'', %L, public.agreement_fingerprint(%L), false, ''plan'')::text', v_sam, sig_sam, v_sam)), 'error CC409');
    perform pg_temp.b_admin();
    f := f || pg_temp.b_eq('2i the tick is kept with its time; an odd choice became the starting one', (select concat(start_now, '/', start_now_at is not null, '/', settle_choice) from public.agreement_versions where id = v_sam), 't/t/upfront');

    -- ---------------------------------------------------------------- 3. a coach
    perform pg_temp.b_as(maya_u, 'aal2');
    f := f || pg_temp.b_eq('3a a quote on the owner''s agreement', pg_temp.b_try(format('insert into public.agreement_quotes (coach_id, agreement_id, version_id) values (%L, %L, %L) returning ''added''', maya_c, a_tess, v_tess)), 'error 42501');
    f := f || pg_temp.b_eq('3b a quote pairing her agreement with someone else''s version', pg_temp.b_try(format('insert into public.agreement_quotes (coach_id, agreement_id, version_id) values (%L, %L, %L) returning ''added''', maya_c, a_zoe, v_sam)), 'error 42501');
    insert into public.agreement_versions (agreement_id, coach_id, version, terms, clauses, send_as) values (a_zoe, maya_c, 2, terms_q, clauses_one, 'quote');
    insert into public.agreement_quotes (coach_id, agreement_id, version_id, share_token) select maya_c, a_zoe, id, repeat('7', 64) from public.agreement_versions where agreement_id = a_zoe and version = 2 returning id, share_token into qid, tok;
    f := f || pg_temp.b_eq('3c her own link is never taken', (tok = repeat('7', 64))::text, 'false');
    update public.agreement_quotes set share_token = repeat('8', 64), number = 5, accepted_extras = '{visit}', valid_until = date '2099-01-01' where id = qid;
    f := f || pg_temp.b_eq('3d nor a link, number, acceptance or day set later', (select concat(share_token = tok, '/', coalesce(number::text, 'none'), '/', coalesce(accepted_extras::text, 'none'), '/', coalesce(valid_until::text, 'none')) from public.agreement_quotes where id = qid), 't/none/none/none');
    f := f || pg_temp.b_eq('3e accepting it by hand', pg_temp.b_try(format('update public.agreement_quotes set status = ''accepted'' where id = %L returning ''done''', qid)), 'error 42501');
    f := f || pg_temp.b_eq('3f withdrawing it is hers', pg_temp.b_try(format('update public.agreement_quotes set status = ''withdrawn'' where id = %L returning status', qid)), 'withdrawn');
    foreach q in array array[
      format('insert into public.agreement_link_opens (coach_id, version_id, who) values (%L, %L, ''client'') returning ''added''', maya_c, v_sam),
      format('insert into public.agreement_reminders (coach_id, version_id, kind) values (%L, %L, ''sign_3'') returning ''added''', maya_c, v_sam),
      format('insert into public.agreement_cancellations (coach_id, agreement_id, asked_on) values (%L, %L, current_date) returning ''added''', maya_c, a_sam),
      format('insert into public.fx_reference_rates (day, currency, units_per_gbp, source) values (current_date, ''EUR'', 1, ''ECB'') returning ''added''')] loop
      f := f || pg_temp.b_eq('3g the server''s rows by hand: ' || left(q, 50), pg_temp.b_try(q), 'error 42501');
    end loop;
    f := f || pg_temp.b_eq('3h another coach''s agreement as a team parent', pg_temp.b_try(format('insert into public.agreements (coach_id, profile_id, team_parent_id) values (%L, %L, %L) returning ''added''', maya_c, p_sam, a_tess)), 'error 42501');
    f := f || pg_temp.b_eq('3i cancelling by hand', pg_temp.b_try(format('update public.agreements set status = ''cancelled'' where id = %L returning ''done''', a_sam)), 'error 42501');
    f := f || pg_temp.b_eq('3j running out by hand', pg_temp.b_try(format('update public.agreements set status = ''expired'' where id = %L returning ''done''', a_zoe)), 'error 42501');
    update public.agreements set approval = 'waiting' where id = a_zoe;
    f := f || pg_temp.b_eq('3k once asked, never back to not needed', pg_temp.b_try(format('update public.agreements set approval = ''not_needed'' where id = %L returning ''done''', a_zoe)), 'error 42501');
    f := f || pg_temp.b_eq('3l nor the approval''s who and when', pg_temp.b_try(format('update public.agreements set approved_by = %L, approved_at = now() where id = %L returning coalesce(approved_by::text, ''none'')', maya_c, a_zoe)), 'none');
    f := f || pg_temp.b_eq('3m nor a new agreement marked approved', pg_temp.b_try(format('insert into public.agreements (coach_id, profile_id, approval) values (%L, %L, ''approved'') returning ''added''', maya_c, p_sam)), 'error 42501');
    f := f || pg_temp.b_eq('3n she reads the owner''s packages', (select count(*)::text from public.pricing_packages where id = pkg), '1');
    f := f || pg_temp.b_eq('3o but changes none', pg_temp.b_try(format('update public.pricing_packages set personal_note = ''x'' where id = %L returning ''changed''', pkg)), 'null');
    f := f || pg_temp.b_eq('3p evidence outside her finances folder', pg_temp.b_try(format('insert into public.invoice_evidence (coach_id, organisation_id, storage_path, file_name, mime, bytes) values (%L, %L, %L, ''x.png'', ''image/png'', 10) returning ''added''',
      maya_c, org, maya_c::text || '/finances/evidence/../' || gen_random_uuid()::text || '-x.png')), 'error 23514');
    f := f || pg_temp.b_eq('3q evidence of another kind', pg_temp.b_try(format('insert into public.invoice_evidence (coach_id, organisation_id, storage_path, file_name, mime, bytes) values (%L, %L, %L, ''x.svg'', ''image/svg+xml'', 10) returning ''added''',
      maya_c, org, maya_c::text || '/finances/evidence/' || gen_random_uuid()::text || '-x.svg')), 'error 23514');
    f := f || pg_temp.b_eq('3r a portal that isn''t https', pg_temp.b_try(format('insert into public.org_billing_profiles (coach_id, organisation_id, portal_url) values (%L, %L, ''http://portal.example'') returning ''added''', maya_c, org)), 'error 23514');
    f := f || pg_temp.b_eq('3s a talking point that isn''t words', pg_temp.b_try(format('insert into public.talking_points (coach_id, moment, lines) values (%L, ''price'', ''[1, 2]'') returning ''added''', maya_c)), 'error 23514');
    f := f || pg_temp.b_eq('3t a lower-case currency', pg_temp.b_try(format('insert into public.agreement_extras (coach_id, key, title, price_minor, currency) values (%L, ''visit'', ''Visit day'', 1, ''gbp'') returning ''added''', maya_c)), 'error 23514');
    f := f || pg_temp.b_eq('3u her signed version''s tick, changed by hand', pg_temp.b_try(format('update public.agreement_versions set settle_choice = ''plan'' where id = %L returning ''changed''', v_sam)), 'error 23514');
    perform pg_temp.b_as(maya_u, 'aal1');
    f := f || pg_temp.b_eq('3v without her code she reads none of the owner''s packages', (select count(*)::text from public.pricing_packages), '0');

    -- ---------------------------------------------------------------- 4. the server's functions with odd input
    perform pg_temp.b_server();
    update public.agreement_quotes set status = 'sent', sent_at = now(), valid_until = current_date + 30 where id = qid;
    f := f || pg_temp.b_eq('4a 21 extras', pg_temp.b_try(format('select public.quote_accept(%L, %L, null, %L, 1)::text', tok, array_fill('visit'::text, array[21]), clauses_one)), 'error 22023');
    f := f || pg_temp.b_eq('4b wording that isn''t a list', pg_temp.b_try(format('select public.quote_accept(%L, ''{}'', null, ''{"a":1}'', 1)::text', tok)), 'error 22023');
    f := f || pg_temp.b_eq('4c a total out of range', pg_temp.b_try(format('select public.quote_accept(%L, ''{}'', null, %L, -1)::text', tok, clauses_one)), 'error 22023');
    f := f || pg_temp.b_eq('4d a sponsor''s name in markup', pg_temp.b_try(format('select public.sponsor_sign(%L, ''<b>Priya</b>'', null, null, null, ''Priya B065'', public.agreement_fingerprint(%L))::text', stok, v_spon)), 'error 22023');
    f := f || pg_temp.b_eq('4e drawn and typed at once', pg_temp.b_try(format('select public.sponsor_sign(%L, ''Priya B065'', null, null, %L, ''Priya B065'', public.agreement_fingerprint(%L))::text', stok, pg_temp.b_png(), v_spon)), 'error 22023');
    f := f || pg_temp.b_eq('4f a PO in markup', pg_temp.b_try(format('select public.sponsor_sign(%L, ''Priya B065'', null, ''<script>'', null, ''Priya B065'', public.agreement_fingerprint(%L))::text', stok, v_spon)), 'error 22023');
    f := f || pg_temp.b_eq('4g an old fingerprint', pg_temp.b_try(format('select public.sponsor_sign(%L, ''Priya B065'', null, null, null, ''Priya B065'', %L)::text', stok, repeat('0', 64))), 'error CC409');
    perform pg_temp.b_admin();
    f := f || pg_temp.b_eq('4h nothing signed by any of those', (select concat(status, '/', coalesce(sponsor_name, 'none')) from public.agreement_versions where id = v_spon), 'sent/none');
    update public.agreement_versions set funded_by = 'Kestrel B065' where agreement_id = a_zoe and version = 2;
    perform pg_temp.b_server();
    perform public.quote_accept(tok, '{}', 'plan', clauses_one, 0);
    perform pg_temp.b_admin();
    f := f || pg_temp.b_eq('4i no way of settling for a funded agreement', (select coalesce(accepted_choice, 'none') from public.agreement_quotes where id = qid), 'none');

    -- ---------------------------------------------------------------- 5. the 14 days
    perform pg_temp.b_as(maya_u, 'aal2');
    f := f || pg_temp.b_eq('5a Sam ticked start now: a session tomorrow is kept', pg_temp.b_try(format('insert into public.coach_sessions (coach_id, profile_id, starts_at, minutes) values (%L, %L, now() + interval ''1 day'', 60) returning ''added''', maya_c, p_sam)), 'added');
    perform pg_temp.b_admin();
    insert into public.agreements (coach_id, profile_id) values (maya_c, p_zoe) returning id into a_zoe;
    insert into public.agreement_versions (agreement_id, coach_id, version, status, terms, clauses, total_minor, coach_signed_at, coach_signature_id, sent_at)
    values (a_zoe, maya_c, 1, 'sent', terms_q, clauses_one, 1800000, now(), sig_maya, now()) returning id into v_zoe;
    perform pg_temp.b_as(zoe_u, 'aal1');
    perform public.sign_agreement_v2(v_zoe, 'Zoe B065', sig_zoe, public.agreement_fingerprint(v_zoe), false, null);
    perform pg_temp.b_as(maya_u, 'aal2');
    insert into public.coach_sessions (id, coach_id, profile_id, kind, starts_at, minutes) values (gen_random_uuid(), maya_c, p_zoe, 'chemistry', now() + interval '1 day', 30);
    f := f || pg_temp.b_eq('5b a chemistry call can''t be turned into a coaching session inside them by moving it',
      pg_temp.b_try(format('update public.coach_sessions set kind = ''coaching'', starts_at = starts_at + interval ''1 hour'' where profile_id = %L and kind = ''chemistry'' returning ''moved''', p_zoe)), 'error 23514');
    insert into public.coach_groups (id, coach_id, name) values (grp, maya_c, 'Group B065');
    f := f || pg_temp.b_eq('5c a group session is unaffected', pg_temp.b_try(format('insert into public.coach_sessions (coach_id, group_id, starts_at, minutes) values (%L, %L, now() + interval ''1 day'', 60) returning ''added''', maya_c, grp)), 'added');

    raise exception 'undo the test rows' using errcode = 'P0065';
  exception when sqlstate 'P0065' then
    perform pg_temp.b_admin();
  end;
  f := f || pg_temp.b_eq('6 everything the test made is undone', (select count(*)::text from auth.users where email like 'b065-%@example.invalid'), '0');
  if cardinality(f) > 0 then
    raise exception E'065 BREAK-IT FAILED (%):\n%', cardinality(f), array_to_string(f, E'\n');
  end if;
  raise notice '065 BREAK-IT CHECKS PASSED';
end
$t$;
