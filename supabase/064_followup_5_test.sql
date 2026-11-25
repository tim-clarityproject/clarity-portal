-- =============================================================================
-- 064_followup_5_test.sql
-- Checks supabase/migrations/064_followup_5.sql. RUN ORDER: 049 to 063, then
-- 064 (twice is fine), then this. Dry run only, on a local stand-in or the
-- test project.
--
-- WHAT IT CHECKS
--   A small practice: Tess (the owner), Maya (an associate), Maya's clients
--   Ava (no account yet) and Ben (joined), and Ruth, Tess's own client.
--   1. The welcome email's link: Maya (with the code) makes a link for Ava;
--      it is open, says Maya's first name and nothing about Ava; a newer
--      link ends the older one; a link past its 7 days, a made-up one and a
--      malformed one are ended; once Ava joins, her link ends. Nobody but
--      the coach makes one (Tess for Maya's client, Maya without the code,
--      a client, someone signed out), and nobody reads the links' table.
--      An invite with a link waits on the person's Coaching page only while
--      the link is open; one from before 064 (no link) is unchanged.
--   2. Reminders: 064's sending_at is there, and the server alone writes it.
--   3. Invoice numbers: given only by invoice_take_number, once per
--      invoice (asked again it gives the same), in order with no gap, after
--      every number already handed out; next_invoice_number draws from the
--      same counter; nobody signed in may call either.
--   4. Payments: Tess (the owner) reads every payment, what landed and
--      Stripe's fee included; Maya reads none, not even her own clients'.
--   5. session_recap_readers: each person a sent recap goes to, with
--      has_account true only for a joined client; nothing before it is
--      sent, nothing for another coach's session.
--   6. coach_admin_agreements: Tess reads the business facts of Maya's
--      client's agreement; Maya, a client and Tess without the code are
--      refused.
--   7. The PDF part (its own block at the end): the Health Check's 30 days
--      and the signed agreements' kept PDFs; it ends with 064 PDF PART
--      CHECKS PASSED.
--   It ends with the notice 064 CHECKS PASSED, or stops with FAILED and a
--   list naming each check that failed. Everything it makes is undone.
-- =============================================================================
create or replace function pg_temp.f_as(p uuid, p_aal text) returns void language plpgsql as $f$
declare sid uuid := gen_random_uuid();
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
  if to_regclass('auth.sessions') is not null and p is not null then
    begin
      execute 'insert into auth.sessions (id, user_id, created_at, updated_at) values ($1, $2, $3, $3)' using sid, p, now();
    exception when others then
      raise notice '064: this database doesn''t let the test write auth.sessions (%)', sqlerrm;
    end;
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated', 'aal', p_aal,
    'amr', json_build_array(json_build_object('method', 'password', 'timestamp', floor(extract(epoch from now()))::bigint)),
    'iat', floor(extract(epoch from now()))::bigint, 'session_id', sid)::text, true);
  perform set_config('role', 'authenticated', true);
end $f$;
create or replace function pg_temp.f_anon() returns void language plpgsql as $f$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('role', 'anon', true);
end $f$;
create or replace function pg_temp.f_admin() returns void language plpgsql as $f$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
end $f$;
create or replace function pg_temp.f_user(p_label text) returns uuid language plpgsql as $f$
declare u uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, aud, role, email_confirmed_at)
  values (u, 'p064-' || p_label || '-' || u || '@example.invalid', 'authenticated', 'authenticated', now());
  return u;
end $f$;
-- Runs a statement as whoever is set; 'refused' when it raises, else its first value as text.
create or replace function pg_temp.f_try(p_sql text) returns text language plpgsql as $f$
declare v text;
begin
  execute p_sql into v;
  return coalesce(v, 'null');
exception when others then
  return 'refused';
end $f$;

do $t$
declare
  f text[] := '{}';
  tess_u uuid; maya_u uuid; ben_u uuid; ava_u uuid; tess_c uuid; maya_c uuid;
  p_ava uuid := gen_random_uuid(); p_ben uuid := gen_random_uuid(); p_ruth uuid := gen_random_uuid(); p_old uuid := gen_random_uuid();
  grp uuid := gen_random_uuid(); s_one uuid := gen_random_uuid(); s_grp uuid := gen_random_uuid(); s_tess uuid := gen_random_uuid();
  inv_a uuid := gen_random_uuid(); inv_b uuid := gen_random_uuid(); inv_c uuid := gen_random_uuid();
  ag uuid := gen_random_uuid();
  t1 text; t2 text; v text; j jsonb; n1 integer; n2 integer; n3 integer; start_at integer;
begin
  begin
    perform pg_temp.f_admin();
    tess_u := pg_temp.f_user('tess'); maya_u := pg_temp.f_user('maya'); ben_u := pg_temp.f_user('ben'); ava_u := pg_temp.f_user('ava');
    insert into public.coaches (user_id, role, display_first_name) values (tess_u, 'owner', 'Tess') returning id into tess_c;
    insert into public.coaches (user_id, role, display_first_name) values (maya_u, 'coach', 'Maya') returning id into maya_c;
    insert into public.client_profiles (id, coach_id, name, email) values
      (p_ava, maya_c, 'Ava F064', (select email from auth.users where id = ava_u)),
      (p_ben, maya_c, 'Ben F064', 'ben.f064@example.invalid'),
      (p_ruth, tess_c, 'Ruth F064', 'ruth.f064@example.invalid'),
      (p_old, maya_c, 'Olu F064', 'olu.f064@example.invalid');
    perform set_config('clarity.linking', 'on', true);
    update public.client_profiles set user_id = ben_u where id = p_ben;
    perform set_config('clarity.linking', '', true);

    -- ---------------------------------------------------------------- 1. the welcome email's link
    perform pg_temp.f_as(maya_u, 'aal2');
    t1 := public.client_invite_link(p_ava);
    perform pg_temp.f_admin();
    if t1 !~ '^[0-9a-f]{64}$' then f := f || '1a the link is 64 hex characters'::text; end if;
    if (select count(*) from public.portal_invite_links where profile_id = p_ava and token_hash = encode(sha256(convert_to(t1, 'UTF8')), 'hex')) <> 1
       or exists (select 1 from public.portal_invite_links where token_hash = t1) then
      f := f || '1b only the fingerprint is kept'::text;
    end if;
    if (select ends_at - made_at from public.portal_invite_links where profile_id = p_ava) <> interval '7 days' then f := f || '1c it ends 7 days after it was made'::text; end if;
    if (select invited_at from public.client_profiles where id = p_ava) is null then f := f || '1d the invite is recorded'::text; end if;
    perform pg_temp.f_anon();
    j := public.client_invite_link_state(t1);
    perform pg_temp.f_admin();
    if j is distinct from jsonb_build_object('state', 'open', 'coach', 'Maya') then f := f || ('1e open, with the coach''s first name and nothing else: ' || j::text); end if;
    -- Ava, signed in with her confirmed email, sees the invite while the link is open.
    perform pg_temp.f_as(ava_u, 'aal1');
    if (select count(*) from public.my_coach_invites() where profile_id = p_ava) <> 1 then f := f || '1f an open link''s invite waits on her Coaching page'::text; end if;
    perform pg_temp.f_admin();
    -- Send it again: the newer link ends the older one.
    perform pg_temp.f_as(maya_u, 'aal2');
    t2 := public.client_invite_link(p_ava);
    perform pg_temp.f_anon();
    if public.client_invite_link_state(t1)->>'state' <> 'ended' then f := f || '1g a newer link ends the older one'::text; end if;
    if public.client_invite_link_state(t2)->>'state' <> 'open' then f := f || '1h the newer link is open'::text; end if;
    if public.client_invite_link_state(repeat('a', 64))::text <> '{"state": "ended"}' then f := f || '1i a made-up link is ended, and says nothing'::text; end if;
    if public.client_invite_link_state('not a link')::text <> '{"state": "ended"}' then f := f || '1j a malformed link is ended'::text; end if;
    perform pg_temp.f_admin();
    -- Past its 7 days: ended, and the invite no longer waits.
    update public.portal_invite_links set made_at = now() - interval '8 days', ends_at = now() - interval '1 day' where profile_id = p_ava and ended_at is null;
    perform pg_temp.f_anon();
    if public.client_invite_link_state(t2)->>'state' <> 'ended' then f := f || '1k a link past its 7 days is ended'::text; end if;
    perform pg_temp.f_as(ava_u, 'aal1');
    if exists (select 1 from public.my_coach_invites() where profile_id = p_ava) then f := f || '1l once the link has ended, the invite no longer waits'::text; end if;
    perform pg_temp.f_admin();
    -- An invite from before 064 (no link) is unchanged.
    update public.client_profiles set invited_at = now(), email = (select email from auth.users where id = ava_u) || '.old' where id = p_old;
    -- Who may make one.
    perform pg_temp.f_as(tess_u, 'aal2');
    if pg_temp.f_try(format('select public.client_invite_link(%L)', p_ava)) <> 'refused' then f := f || '1m the owner can''t make a link for an associate''s client'::text; end if;
    perform pg_temp.f_as(maya_u, 'aal1');
    if pg_temp.f_try(format('select public.client_invite_link(%L)', p_ava)) <> 'refused' then f := f || '1n a coach without the code can''t'::text; end if;
    perform pg_temp.f_as(maya_u, 'aal2');
    if pg_temp.f_try(format('select public.client_invite_link(%L)', p_ben)) <> 'refused' then f := f || '1o someone who has joined gets no link'::text; end if;
    if pg_temp.f_try(format('select public.client_invite_link(%L)', p_ruth)) <> 'refused' then f := f || '1p another coach''s client gets none'::text; end if;
    perform pg_temp.f_as(ben_u, 'aal1');
    if pg_temp.f_try(format('select public.client_invite_link(%L)', p_ava)) <> 'refused' then f := f || '1q a client can''t make one'::text; end if;
    if pg_temp.f_try('select count(*) from public.portal_invite_links') <> 'refused' then f := f || '1r nobody signed in reads the links'::text; end if;
    perform pg_temp.f_admin();
    if has_function_privilege('anon', 'public.client_invite_link(uuid)', 'execute') then f := f || '1s nobody signed out may make one'::text; end if;
    if not has_function_privilege('anon', 'public.client_invite_link_state(text)', 'execute') then f := f || '1t a link''s state is asked before signing in'::text; end if;
    -- Ava joins: her links end.
    perform pg_temp.f_as(maya_u, 'aal2');
    t2 := public.client_invite_link(p_ava);
    perform pg_temp.f_admin();
    perform set_config('clarity.linking', 'on', true);
    update public.client_profiles set user_id = ava_u where id = p_ava;
    perform set_config('clarity.linking', '', true);
    perform pg_temp.f_anon();
    if public.client_invite_link_state(t2)->>'state' <> 'ended' then f := f || '1u once the person has joined, the link is ended'::text; end if;
    perform pg_temp.f_admin();
    if exists (select 1 from public.portal_invite_links where profile_id = p_ava and ended_at is null) then f := f || '1v joining ends every link of theirs'::text; end if;

    -- ---------------------------------------------------------------- 2. reminders
    if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'invoice_reminders' and column_name = 'sending_at') then
      f := f || '2a invoice_reminders has sending_at'::text;
    end if;

    -- ---------------------------------------------------------------- 3. invoice numbers
    insert into public.invoices (id, coach_id, profile_id, kind, status, currency, lines, total_minor) values
      (inv_a, maya_c, p_ben, 'one_off', 'draft', 'GBP', '[{"description":"F064 a","amount":1000}]', 1000),
      (inv_b, maya_c, p_ben, 'one_off', 'draft', 'GBP', '[{"description":"F064 b","amount":2000}]', 2000),
      (inv_c, maya_c, p_ben, 'one_off', 'draft', 'GBP', '[{"description":"F064 c","amount":3000}]', 3000);
    select next_number into start_at from public.invoice_number_counter;
    if start_at <= coalesce((select max(number) from public.invoices), 1200) then f := f || '3a the counter starts after every number already given'::text; end if;
    n1 := public.invoice_take_number(inv_a);
    if public.invoice_take_number(inv_a) <> n1 then f := f || '3b asked again, the same number'::text; end if;
    n2 := public.next_invoice_number();
    n3 := public.invoice_take_number(inv_c);
    if n1 <> start_at or n2 <> start_at + 1 or n3 <> start_at + 2 then f := f || format('3c in order with no gap: %s %s %s from %s', n1, n2, n3, start_at); end if;
    if (select number from public.invoices where id = inv_b) is not null then f := f || '3d a draft never sent has no number'::text; end if;
    perform pg_temp.f_as(tess_u, 'aal2');
    if pg_temp.f_try(format('select public.invoice_take_number(%L)', inv_b)) <> 'refused' or pg_temp.f_try('select public.next_invoice_number()') <> 'refused'
       or pg_temp.f_try('select next_number from public.invoice_number_counter') <> 'refused' then
      f := f || '3e only the server gives numbers'::text;
    end if;
    perform pg_temp.f_admin();

    -- ---------------------------------------------------------------- 4. payments
    update public.invoices set status = 'sent' where id = inv_a;
    insert into public.payments (invoice_id, coach_id, stripe_id, amount_minor, currency, landed_gbp_minor, fee_minor, paid_at)
    values (inv_a, maya_c, 'py_f064_1', 1000, 'GBP', 1000, 35, now());
    perform pg_temp.f_as(tess_u, 'aal2');
    if pg_temp.f_try('select sum(fee_minor)::text from public.payments where stripe_id = ''py_f064_1''') <> '35' then f := f || '4a the owner reads Stripe''s fee'::text; end if;
    perform pg_temp.f_as(maya_u, 'aal2');
    if pg_temp.f_try('select count(*)::text from public.payments') <> '0' then f := f || '4b an associate reads no payment, her own clients'' included'::text; end if;
    if pg_temp.f_try(format('select count(*)::text from public.invoices where id = %L', inv_a)) <> '1' then f := f || '4c she still reads her client''s invoice'::text; end if;
    perform pg_temp.f_as(tess_u, 'aal1');
    if pg_temp.f_try('select count(*)::text from public.payments') not in ('0', 'refused') then f := f || '4d the owner without the code reads none'::text; end if;
    perform pg_temp.f_admin();

    -- ---------------------------------------------------------------- 5. who reads a recap in the portal
    insert into public.coach_groups (id, coach_id, name) values (grp, maya_c, 'F064 team');
    insert into public.coach_group_members (group_id, name, profile_id, email) values (grp, 'Ben F064', p_ben, null), (grp, 'Priya F064', null, 'priya.f064@example.invalid');
    insert into public.coach_sessions (id, coach_id, profile_id, starts_at, minutes, kind, outcome, recap) values
      (s_one, maya_c, p_ben, now() - interval '1 day', 60, 'coaching', 'held', 'F064 one');
    insert into public.coach_sessions (id, coach_id, group_id, starts_at, minutes, kind, outcome, recap) values
      (s_grp, maya_c, grp, now() - interval '1 day', 60, 'coaching', 'held', 'F064 group');
    insert into public.coach_sessions (id, coach_id, profile_id, starts_at, minutes, kind, outcome, recap) values
      (s_tess, tess_c, p_ruth, now() - interval '1 day', 60, 'coaching', 'held', 'F064 Tess');
    perform pg_temp.f_as(maya_u, 'aal2');
    if (select count(*) from public.session_recap_readers(s_grp)) <> 0 then f := f || '5a nothing before the recap is sent'::text; end if;
    perform pg_temp.f_admin();
    perform set_config('clarity.sending', 'on', true);
    update public.coach_sessions set recap_sent_at = now() where id in (s_one, s_grp, s_tess);
    perform set_config('clarity.sending', '', true);
    perform pg_temp.f_as(maya_u, 'aal2');
    select string_agg(r.name || ':' || r.has_account::text, ',' order by r.name) into v from public.session_recap_readers(s_grp) r;
    if v is distinct from 'Ben F064:true,Priya F064:false' then f := f || ('5b a group''s people, only the joined one with an account: ' || coalesce(v, 'none')); end if;
    select string_agg(r.name || ':' || r.has_account::text, ',') into v from public.session_recap_readers(s_one) r;
    if v is distinct from 'Ben F064:true' then f := f || ('5c a session''s own joined client: ' || coalesce(v, 'none')); end if;
    if (select count(*) from public.session_recap_readers(s_tess)) <> 0 then f := f || '5d nothing for another coach''s session'::text; end if;
    if (select count(*) from public.session_recap_readers(s_grp)) <> (select count(*) from public.session_recap_people(s_grp)) then
      f := f || '5e the same people as 050''s session_recap_people'::text;
    end if;
    perform pg_temp.f_admin();

    -- ---------------------------------------------------------------- 6. the owner's admin view
    insert into public.agreements (id, coach_id, profile_id, kind, status) values (ag, maya_c, p_ben, 'coaching', 'signed');
    insert into public.agreement_versions (agreement_id, coach_id, version, status, terms, total_minor, currency, funded_by)
    values (ag, maya_c, 1, 'draft', '{"coaching":"6-month coaching F064"}', 1800000, 'GBP', null);
    perform pg_temp.f_as(tess_u, 'aal2');
    select string_agg(a.coaching || '/' || a.total_minor::text || '/' || a.status, ',') into v from public.coach_admin_agreements(p_ben) a;
    if v is distinct from '6-month coaching F064/1800000/signed' then f := f || ('6a the owner reads the agreement''s business facts: ' || coalesce(v, 'none')); end if;
    perform pg_temp.f_as(tess_u, 'aal1');
    if pg_temp.f_try(format('select count(*)::text from public.coach_admin_agreements(%L)', p_ben)) <> 'refused' then f := f || '6b not without the code'::text; end if;
    perform pg_temp.f_as(maya_u, 'aal2');
    if pg_temp.f_try(format('select count(*)::text from public.coach_admin_agreements(%L)', p_ben)) <> 'refused' then f := f || '6c not an associate'::text; end if;
    perform pg_temp.f_as(ben_u, 'aal1');
    if pg_temp.f_try(format('select count(*)::text from public.coach_admin_agreements(%L)', p_ben)) <> 'refused' then f := f || '6d not a client'::text; end if;
    perform pg_temp.f_admin();
    if has_function_privilege('anon', 'public.coach_admin_agreements(uuid)', 'execute') then f := f || '6e nobody signed out'::text; end if;

    if to_regclass('public.migration_log') is not null then
      if (select count(*) from public.migration_log where number = 64 and name = '064_followup_5') <> 1 then f := f || '7 the migration recorded itself, once'::text; end if;
    end if;

    perform pg_temp.f_admin();
    raise exception 'undo the test rows' using errcode = 'P0064';
  exception when sqlstate 'P0064' then
    perform pg_temp.f_admin();
  end;

  f := f || (select case when count(*) = 0 then '{}'::text[] else array['8 everything the test made is undone'] end
             from auth.users where email like 'p064-%@example.invalid');
  if cardinality(f) > 0 then
    raise exception E'064 FAILED (%):\n%', cardinality(f), array_to_string(f, E'\n');
  end if;
  raise notice '064 CHECKS PASSED';
end
$t$;

-- ============================================================================= the PDF part
-- =============================================================================
-- 064's test, the PDF part (follow-up 5, items 2 and 4). RUN ORDER: 044, 045
-- and 061 to 063, then 064 (twice is fine), then this. Dry run only, on a
-- local stand-in or the test project.
--
-- WHAT IT CHECKS
--   A. The guest's Health Check copy. An unfinished Health Check opens
--      however old it is. Finishing it starts its 30 days. Within them the
--      link and code open, save, switch and email; after them every one of
--      those answers 'expired' with a calm message, told only to the right
--      email and code (a wrong one is counted towards the lockout, the
--      replaced code is told 'expired' too), and the email server gets no
--      new code for it. "Email my link" keeps the results open for 30 days
--      from the send, and a send the email provider refused is undone
--      exactly. alignment_email_check still hands the server the answers for
--      the PDF. The coach's own read (alignment_coach_answers) is unchanged.
--      No finished Health Check is left without its start.
--   B. Signed agreements. A signed version's PDF waits to be made, is kept
--      by the server's key only, once (a second is never stored), and never
--      changed or removed (update, delete and truncate refused for the
--      server's key and for the database's owner alike). Its client reads it;
--      the agreement's coach reads it only with the 6-digit code; another
--      client, another coach and someone signed out never do; nobody reads
--      the table itself. The source the server makes it from is the server's
--      alone, holds both signatures, and is cut exactly as my_agreements()
--      for an organisation-funded client (no amount anywhere). The coach's
--      signature is never readable by the client. A version not yet signed,
--      or something that isn't a PDF, is never kept.
--
--   It ends with the notice 064 PDF PART CHECKS PASSED, or stops with FAILED
--   and a list naming each check that failed. Everything it makes is undone.
-- =============================================================================
create or replace function pg_temp.p_as(p uuid, p_aal text default 'aal1') returns void language plpgsql as $f$
declare sid uuid := gen_random_uuid();
begin
  -- A made-up sign-in is written to auth.sessions where that table exists, as a real one is (055).
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
  if to_regclass('auth.sessions') is not null and p is not null then
    begin
      execute 'insert into auth.sessions (id, user_id, created_at, updated_at) values ($1, $2, $3, $3)' using sid, p, now();
    exception when others then
      raise notice '064: this database doesn''t let the test write auth.sessions (%)', sqlerrm;
    end;
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated', 'aal', p_aal,
    'amr', json_build_array(json_build_object('method', 'password', 'timestamp', floor(extract(epoch from now()))::bigint)),
    'iat', floor(extract(epoch from now()))::bigint, 'session_id', sid)::text, true);
  perform set_config('role', 'authenticated', true);
end $f$;
create or replace function pg_temp.p_anon() returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('role', 'anon', true);
end $f$;
create or replace function pg_temp.p_service() returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  perform set_config('role', 'service_role', true);
end $f$;
create or replace function pg_temp.p_admin() returns void language plpgsql as $f$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
end $f$;
create or replace function pg_temp.p_user(p_label text) returns uuid language plpgsql as $f$
declare u uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, aud, role, email_confirmed_at)
  values (u, 'p064-' || p_label || '-' || u || '@example.invalid', 'authenticated', 'authenticated', now());
  return u;
end $f$;
create or replace function pg_temp.p_eq(p_name text, p_got text, p_want text) returns text[] language sql as $f$
  select case when p_got is distinct from p_want then array[format('%s: expected %s, got %s', p_name, p_want, coalesce(p_got, 'nothing'))] else '{}'::text[] end;
$f$;
-- One value, or 'error SQLSTATE'.
create or replace function pg_temp.p_try(p_sql text) returns text language plpgsql as $f$
declare v text;
begin
  execute p_sql into v;
  return coalesce(v, 'ok');
exception when others then
  return 'error ' || sqlstate;
end $f$;
-- The lockout counts every wrong try; the checks start each try afresh.
create or replace function pg_temp.p_unlock(p_token text) returns void language plpgsql as $f$
begin
  perform pg_temp.p_admin();
  update public.alignment_sessions set failed_attempts = 0, locked_until = null where token = p_token;
end $f$;
-- Moves a Health Check's clock back by some days (finishing, its start and its last email).
create or replace function pg_temp.p_age(p_token text, p_days integer) returns void language plpgsql as $f$
begin
  perform pg_temp.p_admin();
  update public.alignment_sessions
     set completed_at = completed_at - make_interval(days => p_days),
         results_open_from = results_open_from - make_interval(days => p_days),
         results_emailed_at = results_emailed_at - make_interval(days => p_days),
         results_emailed_before = results_emailed_before - make_interval(days => p_days),
         created_at = created_at - make_interval(days => p_days),
         link_emails = '[]'::jsonb
   where token = p_token;
end $f$;
-- A small drawn signature (a real PNG's shape, as the signature pad saves it).
create or replace function pg_temp.p_png() returns text language sql immutable as $f$
  select 'data:image/png;base64,' || repeat('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg', 3);
$f$;
-- A stand-in PDF (only its first bytes are a PDF's), as base64.
create or replace function pg_temp.p_pdf(p_fill text) returns text language sql immutable as $f$
  select encode(convert_to('%PDF-1.7 ' || repeat(p_fill, 1200), 'UTF8'), 'base64');
$f$;

do $t$
declare
  f text[] := '{}';
  -- A
  coach_u uuid;
  hc_email constant text := 'p064-guest@example.invalid';
  answers constant jsonb := '{"objective": "064 test objective", "csfs": [{"id": "f1", "text": "064 test Success Factor"}], "projects": [{"id": "p1", "text": "064 test project"}]}';
  l jsonb; tok text; code text; j jsonb; old_code text; tok2 text; code2 text; tok3 text; code3 text; new_code text;
  -- B
  tess_u uuid; maya_u uuid; ben_u uuid; priya_u uuid;
  tess_c uuid; maya_c uuid;
  p_ben uuid := gen_random_uuid(); p_priya uuid := gen_random_uuid();
  a_ben uuid; a_priya uuid; v1 uuid; v2 uuid; vp uuid;
  sig_maya uuid; sig_ben uuid; sig_priya uuid;
  r jsonb; kept text; myrow jsonb;
begin
  begin
    -- ============================================================ A. the guest's Health Check copy
    perform pg_temp.p_admin();
    f := f || pg_temp.p_eq('A0 every finished Health Check has its start (none closes as 064 runs)',
      (select count(*)::text from public.alignment_sessions where status = 'complete' and results_open_from is null), '0');
    coach_u := pg_temp.p_user('coach');
    insert into public.coaches (user_id, role, display_first_name) values (coach_u, 'coach', 'Adie');
    l := public.create_alignment_session('064 test organisation', hc_email, (select upper(email) from auth.users where id = coach_u));
    tok := l ->> 'token'; code := l ->> 'access_code';

    -- A1. unfinished: no end, however old
    perform pg_temp.p_anon();
    perform public.alignment_save(tok, hc_email, code, answers, '{"screen": "objective"}', 0, false);
    perform pg_temp.p_age(tok, 400);
    perform pg_temp.p_anon();
    f := f || pg_temp.p_eq('A1a an unfinished Health Check opens, 400 days on', public.alignment_open(tok, hc_email, code) ->> 'ok', 'true');
    perform pg_temp.p_admin();
    f := f || pg_temp.p_eq('A1b it has no end', (select coalesce(public._alignment_results_until(s)::text, 'none') from public.alignment_sessions s where token = tok), 'none');

    -- A2. finishing starts the 30 days
    perform pg_temp.p_anon();
    j := public.alignment_save(tok, hc_email, code, answers, '{"screen": "results"}', 1, true);
    f := f || pg_temp.p_eq('A2a finished', j ->> 'status', 'complete');
    perform pg_temp.p_admin();
    f := f || pg_temp.p_eq('A2b its 30 days start as it is finished',
      (select (results_open_from between now() - interval '1 minute' and now() + interval '1 minute')::text from public.alignment_sessions where token = tok), 'true');
    perform pg_temp.p_age(tok, 29);
    perform pg_temp.p_anon();
    f := f || pg_temp.p_eq('A2c on day 29 it still opens', public.alignment_open(tok, hc_email, code) ->> 'ok', 'true');
    f := f || pg_temp.p_eq('A2d a later save goes', public.alignment_save(tok, hc_email, code, answers, '{"screen": "results"}', 2, true) ->> 'ok', 'true');
    perform pg_temp.p_admin();
    f := f || pg_temp.p_eq('A2e ... and doesn''t move its start',
      (select (results_open_from < now() - interval '28 days')::text from public.alignment_sessions where token = tok), 'true');

    -- A3. after 30 days every call says it has closed
    perform pg_temp.p_age(tok, 2);
    perform pg_temp.p_anon();
    j := public.alignment_open(tok, hc_email, code);
    f := f || pg_temp.p_eq('A3a day 31: it doesn''t open, and says why', concat(j ->> 'ok', '/', j ->> 'error', '/', j ->> 'message'),
      'false/expired/These results were open for 30 days, and that time has passed. Ask the coach who sent you the link for a new one.');
    f := f || pg_temp.p_eq('A3b ... with nothing of the answers in its answer', (position('064 test' in j::text) = 0)::text, 'true');
    f := f || pg_temp.p_eq('A3c ... nor saves', public.alignment_save(tok, hc_email, code, answers, '{"screen": "results"}', 3, true) ->> 'error', 'expired');
    f := f || pg_temp.p_eq('A3d ... nor switches who sees it', public.alignment_set_sharing(tok, hc_email, code, false) ->> 'error', 'expired');
    f := f || pg_temp.p_eq('A3e ... nor emails the results', public.alignment_email_check(tok, hc_email, code, 'link') ->> 'error', 'expired');
    f := f || pg_temp.p_eq('A3f ... nor the coach''s completion email', public.alignment_email_check(tok, hc_email, code, 'complete') ->> 'error', 'expired');
    f := f || pg_temp.p_eq('A3g a wrong code learns nothing of it', public.alignment_open(tok, hc_email, 'ZZZZZZ') ->> 'error', 'invalid');
    perform pg_temp.p_admin();
    f := f || pg_temp.p_eq('A3h ... and is counted towards the lockout; the right code wasn''t',
      (select failed_attempts::text from public.alignment_sessions where token = tok), '1');
    f := f || pg_temp.p_eq('A3i the answers and the choice are as they were',
      (select concat(data ->> 'objective', '/', shared_with_coach) from public.alignment_sessions where token = tok), '064 test objective/t');
    perform pg_temp.p_as(coach_u, 'aal2');
    j := public.alignment_coach_answers(tok);
    f := f || pg_temp.p_eq('A3j the coach''s own read is unchanged', concat(j ->> 'ok', '/', j ->> 'shared', '/', j -> 'data' ->> 'objective'), 'true/true/064 test objective');
    perform pg_temp.p_unlock(tok);

    -- A4. "Email my link" keeps it open for 30 days from the send; a refused send is undone exactly
    perform pg_temp.p_admin();
    l := public.create_alignment_session('064 test organisation 2', hc_email, null);
    tok2 := l ->> 'token'; code2 := l ->> 'access_code';
    perform pg_temp.p_anon();
    perform public.alignment_save(tok2, hc_email, code2, answers, '{"screen": "results"}', 0, true);
    perform pg_temp.p_age(tok2, 20);
    perform pg_temp.p_anon();
    j := public.alignment_email_check(tok2, hc_email, code2, 'link');
    f := f || pg_temp.p_eq('A4a the results email is allowed, with the answers for the PDF',
      concat(j ->> 'ok', '/', j ->> 'status', '/', j -> 'data' ->> 'objective', '/', (j ->> 'completed_at') is not null), 'true/complete/064 test objective/t');
    perform pg_temp.p_age(tok2, 25);
    perform pg_temp.p_anon();
    f := f || pg_temp.p_eq('A4b 45 days after finishing, 25 after the email: it opens', public.alignment_open(tok2, hc_email, code2) ->> 'ok', 'true');
    j := public.alignment_email_check(tok2, hc_email, code2, 'link');
    f := f || pg_temp.p_eq('A4c a second email is allowed', j ->> 'ok', 'true');
    perform public.alignment_email_failed(tok2, hc_email, code2, 'link');
    perform pg_temp.p_admin();
    f := f || pg_temp.p_eq('A4d the refused send is undone: back to the email before',
      (select (results_emailed_at < now() - interval '24 days' and results_emailed_at > now() - interval '26 days')::text from public.alignment_sessions where token = tok2), 'true');
    perform pg_temp.p_age(tok2, 6);
    perform pg_temp.p_anon();
    f := f || pg_temp.p_eq('A4e 31 days after the last email that went: closed', public.alignment_open(tok2, hc_email, code2) ->> 'error', 'expired');

    -- A5. the replaced code (045) on closed results: 'expired', and no new code goes out
    perform pg_temp.p_admin();
    l := public.create_alignment_session('064 test organisation 3', hc_email, null);
    tok3 := l ->> 'token'; code3 := l ->> 'access_code';
    perform pg_temp.p_anon();
    perform public.alignment_save(tok3, hc_email, code3, answers, '{"screen": "results"}', 0, true);
    j := public.alignment_set_sharing(tok3, hc_email, code3, false);
    f := f || pg_temp.p_eq('A5a Only you replaced the code', j ->> 'new_code', 'true');
    perform pg_temp.p_age(tok3, 31);
    perform pg_temp.p_anon();
    f := f || pg_temp.p_eq('A5b the replaced code is told it has closed', public.alignment_open(tok3, hc_email, code3) ->> 'error', 'expired');
    perform pg_temp.p_unlock(tok3); perform pg_temp.p_service();
    f := f || pg_temp.p_eq('A5c the email server gets no new code for it', public.alignment_new_code_to_send(tok3, hc_email, code3) ->> 'error', 'expired');
    perform pg_temp.p_admin();
    select s.new_code into new_code from public.alignment_sessions s where s.token = tok3;
    perform pg_temp.p_unlock(tok3); perform pg_temp.p_anon();
    f := f || pg_temp.p_eq('A5d the new code, too, is told it has closed', public.alignment_open(tok3, hc_email, new_code) ->> 'error', 'expired');
    perform pg_temp.p_anon();
    f := f || pg_temp.p_eq('A5e someone signed out can''t ask when it closes',
      pg_temp.p_try(format('select public._alignment_results_until(s)::text from public.alignment_sessions s where token = %L', tok3)), 'error 42501');
    perform pg_temp.p_admin();

    -- ============================================================ B. signed agreements
    tess_u := pg_temp.p_user('tess'); maya_u := pg_temp.p_user('maya'); ben_u := pg_temp.p_user('ben'); priya_u := pg_temp.p_user('priya');
    insert into public.coaches (user_id, role, display_first_name) values (tess_u, 'owner', 'Tess') returning id into tess_c;
    insert into public.coaches (user_id, role, display_first_name) values (maya_u, 'coach', 'Maya') returning id into maya_c;
    perform set_config('clarity.linking', 'on', true);
    insert into public.client_profiles (id, coach_id, name, email, user_id, time_zone) values
      (p_ben, maya_c, 'Ben P064', 'ben.p064@example.invalid', ben_u, 'America/Chicago'),
      (p_priya, maya_c, 'Priya P064', 'priya.p064@example.invalid', priya_u, null);
    perform set_config('clarity.linking', '', true);

    perform pg_temp.p_as(maya_u, 'aal2');
    insert into public.signatures (user_id, kind, image) values (maya_u, 'drawn', pg_temp.p_png()) returning id into sig_maya;
    insert into public.agreements (coach_id, profile_id) values (maya_c, p_ben) returning id into a_ben;
    insert into public.agreements (coach_id, profile_id) values (maya_c, p_priya) returning id into a_priya;
    insert into public.agreement_versions (agreement_id, coach_id, version, status, terms, clauses, total_minor, coach_signed_at, coach_signature_id, sent_at)
    values (a_ben, maya_c, 1, 'sent', '{"coaching":"6-month coaching","investment":"£18,000","rate":{"minor":75000,"per":"hour"}}',
            '[{"key":"3","title":"Your investment","money":true,"text":"Your investment is £18,000."},{"key":"4","title":"Rearranging and cancelling","text":"You can rearrange."}]',
            1800000, now(), sig_maya, now())
    returning id into v1;
    insert into public.agreement_versions (agreement_id, coach_id, version, status, terms, clauses, total_minor, funded_by, coach_signed_at, coach_signature_id, sent_at)
    values (a_priya, maya_c, 1, 'sent', '{"coaching":"6-month coaching","investment":"£18,000","rate":{"minor":75000,"per":"hour"}}',
            '[{"key":"3","title":"Your investment","money":true,"text":"Your investment is £18,000."},{"key":"4","title":"Rearranging and cancelling","text":"You can rearrange."}]',
            1800000, 'Larkfield Health', now(), sig_maya, now())
    returning id into vp;

    -- Ben signs (drawn); Priya signs (typed)
    perform pg_temp.p_as(ben_u, 'aal1');
    insert into public.signatures (user_id, kind, image) values (ben_u, 'drawn', pg_temp.p_png()) returning id into sig_ben;
    perform public.sign_agreement(v1, 'Ben Carter', sig_ben, public.agreement_fingerprint(v1));
    perform pg_temp.p_as(priya_u, 'aal1');
    insert into public.signatures (user_id, kind, typed_name) values (priya_u, 'typed', 'Priya Shah') returning id into sig_priya;
    perform public.sign_agreement(vp, 'Priya Shah', sig_priya, public.agreement_fingerprint(vp));

    -- Ben's version 2, sent and not signed
    perform pg_temp.p_as(maya_u, 'aal2');
    update public.agreements set current_version = 2 where id = a_ben;
    insert into public.agreement_versions (agreement_id, coach_id, version, status, terms, clauses, total_minor, coach_signed_at, coach_signature_id, sent_at)
    values (a_ben, maya_c, 2, 'sent', '{"coaching":"6-month coaching, renewed"}', '[{"key":"4","title":"Rearranging and cancelling","text":"12 hours"}]', 900000, now(), sig_maya, now())
    returning id into v2;
    perform pg_temp.p_as(priya_u, 'aal1');
    myrow := public.my_agreements() -> 0;

    -- B1. before it is made
    perform pg_temp.p_as(ben_u, 'aal1');
    r := public.agreement_signed_pdf(v1);
    f := f || pg_temp.p_eq('B1a Ben''s signed PDF waits to be made', concat(r ->> 'ok', '/', r ->> 'made'), 'true/false');
    f := f || pg_temp.p_eq('B1b Ben can''t read the source the server makes it from', pg_temp.p_try(format('select public.agreement_pdf_source(%L)::text', v1)), 'error 42501');
    f := f || pg_temp.p_eq('B1c ... nor keep a PDF himself', pg_temp.p_try(format('select public.agreement_signed_pdf_keep(%L, %L, ''x.pdf'')::text', v1, pg_temp.p_pdf('a'))), 'error 42501');
    f := f || pg_temp.p_eq('B1d ... nor write the table', pg_temp.p_try(format('insert into public.agreement_signed_pdfs (version_id, pdf, sha256, file_name) values (%L, ''\x255044462d'', repeat(''0'', 64), ''x.pdf'') returning ''added''', v1)), 'error 42501');
    f := f || pg_temp.p_eq('B1e ... and Maya''s signature is still not his to read', (select count(*)::text from public.signatures where id = sig_maya), '0');

    -- B2. the source, the server's key only
    perform pg_temp.p_service();
    r := public.agreement_pdf_source(v1);
    f := f || pg_temp.p_eq('B2a the source holds both signatures, the figures and the client''s zone',
      concat(r ->> 'ok', '/', r ->> 'stored', '/', r -> 'coach_signature' ->> 'kind', '/', (r -> 'coach_signature' ->> 'image') = pg_temp.p_png(), '/',
             r -> 'client_signature' ->> 'kind', '/', r -> 'version' ->> 'total_minor', '/', r ->> 'time_zone', '/', r -> 'version' ->> 'signed_name', '/', r ->> 'client_name'),
      'true/false/drawn/t/drawn/1800000/America/Chicago/Ben Carter/Ben P064');
    r := public.agreement_pdf_source(vp);
    f := f || pg_temp.p_eq('B2b Priya''s (funded) has no amount anywhere in the version', ((r -> 'version')::text ~ '£|1800000|75000|investment')::text, 'false');
    f := f || pg_temp.p_eq('B2c ... and is exactly what my_agreements() gives Priya', ((r -> 'version') = myrow)::text, 'true');
    f := f || pg_temp.p_eq('B2d ... her typed signature, Maya''s drawn one, and the coach''s zone falls back to the UK''s',
      concat(r -> 'client_signature' ->> 'kind', '/', r -> 'client_signature' ->> 'typed_name', '/', r -> 'coach_signature' ->> 'kind', '/', r ->> 'time_zone'),
      'typed/Priya Shah/drawn/Europe/London');
    f := f || pg_temp.p_eq('B2e a version not yet signed has no source', (public.agreement_pdf_source(gen_random_uuid()) ->> 'ok'), 'false');

    -- B3. kept once, as made
    r := public.agreement_signed_pdf_keep(v1, pg_temp.p_pdf('a'), 'Coaching agreement, Ben Carter, 25 Nov 2026.pdf');
    kept := r ->> 'sha256';
    f := f || pg_temp.p_eq('B3a the server keeps the first PDF, with its own fingerprint',
      concat(r ->> 'ok', '/', kept = encode(sha256(decode(pg_temp.p_pdf('a'), 'base64')), 'hex'), '/', r ->> 'pdf' = pg_temp.p_pdf('a')), 'true/t/t');
    r := public.agreement_signed_pdf_keep(v1, pg_temp.p_pdf('b'), 'Another.pdf');
    f := f || pg_temp.p_eq('B3b a second is never stored: the first comes back', concat(r ->> 'sha256' = kept, '/', r ->> 'file_name'), 't/Coaching agreement, Ben Carter, 25 Nov 2026.pdf');
    f := f || pg_temp.p_eq('B3c the source now says it is stored', public.agreement_pdf_source(v1) ->> 'stored', 'true');
    f := f || pg_temp.p_eq('B3d something that isn''t a PDF is never kept',
      pg_temp.p_try(format('select public.agreement_signed_pdf_keep(%L, %L, ''x.pdf'')::text', vp, encode(convert_to(repeat('not a pdf ', 200), 'UTF8'), 'base64'))), 'error 22023');
    f := f || pg_temp.p_eq('B3e the server''s key can''t read or change the table itself',
      concat(pg_temp.p_try('select count(*)::text from public.agreement_signed_pdfs'), '/',
             pg_temp.p_try(format('update public.agreement_signed_pdfs set file_name = ''x.pdf'' where version_id = %L returning ''changed''', v1)), '/',
             pg_temp.p_try(format('delete from public.agreement_signed_pdfs where version_id = %L returning ''removed''', v1))), 'error 42501/error 42501/error 42501');
    perform pg_temp.p_admin();
    f := f || pg_temp.p_eq('B3f even the database''s owner can''t change it, remove it or empty the table',
      concat(pg_temp.p_try(format('update public.agreement_signed_pdfs set pdf = decode(%L, ''base64'') where version_id = %L returning ''changed''', pg_temp.p_pdf('c'), v1)), '/',
             pg_temp.p_try(format('delete from public.agreement_signed_pdfs where version_id = %L returning ''removed''', v1)), '/',
             pg_temp.p_try('truncate public.agreement_signed_pdfs')), 'error 23514/error 23514/error 23514');
    f := f || pg_temp.p_eq('B3g a version not yet signed is never kept',
      pg_temp.p_try(format('insert into public.agreement_signed_pdfs (version_id, pdf, sha256, file_name) values (%L, decode(%L, ''base64''), repeat(''0'', 64), ''x.pdf'') returning ''added''',
        v2, pg_temp.p_pdf('d'))),
      'error 23514');
    f := f || pg_temp.p_eq('B3h the signed version can''t be removed from under its kept PDF', pg_temp.p_try(format('delete from public.agreement_versions where id = %L returning ''removed''', v1)), 'error 23001');

    -- B4. who reads it
    perform pg_temp.p_as(ben_u, 'aal1');
    r := public.agreement_signed_pdf(v1);
    f := f || pg_temp.p_eq('B4a Ben reads his signed PDF as it was kept', concat(r ->> 'made', '/', r ->> 'sha256' = kept, '/', r ->> 'pdf' = pg_temp.p_pdf('a')), 'true/t/t');
    f := f || pg_temp.p_eq('B4b ... but never the table itself', pg_temp.p_try('select count(*)::text from public.agreement_signed_pdfs'), 'error 42501');
    perform pg_temp.p_as(priya_u, 'aal1');
    f := f || pg_temp.p_eq('B4c Priya never reads Ben''s', pg_temp.p_try(format('select public.agreement_signed_pdf(%L)::text', v1)), 'error 42501');
    perform pg_temp.p_as(maya_u, 'aal1');
    f := f || pg_temp.p_eq('B4d Maya without her 6-digit code reads nothing', pg_temp.p_try(format('select public.agreement_signed_pdf(%L)::text', v1)), 'error 42501');
    perform pg_temp.p_as(maya_u, 'aal2');
    r := public.agreement_signed_pdf(v1);
    f := f || pg_temp.p_eq('B4e Maya with her code reads the same file', concat(r ->> 'made', '/', r ->> 'sha256' = kept), 'true/t');
    f := f || pg_temp.p_eq('B4f ... and Priya''s waits to be made', public.agreement_signed_pdf(vp) ->> 'made', 'false');
    perform pg_temp.p_as(tess_u, 'aal2');
    f := f || pg_temp.p_eq('B4g another coach (the owner) never reads it', pg_temp.p_try(format('select public.agreement_signed_pdf(%L)::text', v1)), 'error 42501');
    perform pg_temp.p_anon();
    f := f || pg_temp.p_eq('B4h someone signed out never does', pg_temp.p_try(format('select public.agreement_signed_pdf(%L)::text', v1)), 'error 42501');
    perform pg_temp.p_admin();

    raise exception 'undo the test rows' using errcode = 'P0064';
  exception when sqlstate 'P0064' then
    perform pg_temp.p_admin();
  end;
  f := f || pg_temp.p_eq('C everything the test made is undone',
    (select concat((select count(*) from auth.users where email like 'p064-%@example.invalid'), '/', (select count(*) from public.alignment_sessions where respondent_email = 'p064-guest@example.invalid'))), '0/0');
  if cardinality(f) > 0 then
    raise exception E'064 PDF PART FAILED (%):\n%', cardinality(f), array_to_string(f, E'\n');
  end if;
  raise notice '064 PDF PART CHECKS PASSED';
end
$t$;
