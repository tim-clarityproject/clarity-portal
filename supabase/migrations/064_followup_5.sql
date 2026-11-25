-- =============================================================================
-- 064_followup_5.sql
-- Follow-up 5 (25 Nov 2026): the approved emails made true, and signed
-- documents and money put right before go-live.
--
-- WHAT THIS DOES (plain English)
--   1. The welcome email's set-up link (item 1). "The link works for 7 days."
--      Each Invite (and each Send it again) makes a new link of its own,
--      kept here only as a fingerprint, that ends 7 days after it was made.
--      A newer link ends the older ones, and the link ends once the person
--      has joined. Create your account asks client_invite_link_state whether
--      the link still works: it says only "open" (with the coach's first
--      name) or "ended", and nothing about the person.
--   2. Reminders that may have gone (item 5). A reminder is marked as
--      sending (sending_at) before the email service is asked. If the email
--      service says no, it is let go; if it gives no answer, it stays marked
--      as sending for good, and Needs you asks the coach to check before
--      sending it again.
--   3. Invoice numbers (item 6). A CLARITY- number is given when the coach
--      presses Send and Stripe finalises the invoice, never when a draft is
--      made, from one counter that moves in the same step as the invoice
--      takes it, so a draft that fails or is never sent leaves no gap.
--      next_invoice_number (061) draws from the same counter, so a server
--      that hasn't been updated yet can never hand out the same number.
--   4. Payments (item 7). Only the owner (with the 6-digit code) reads the
--      payments table: what landed in pounds and Stripe's fee are business
--      figures. An associate still sees their clients' invoices, which say
--      what was paid and when.
--   5. A session's summary (item 3). session_recap_readers says, for each
--      person a recap goes to, whether they have a portal account that
--      reads it (a linked client). Someone without one gets the summary in
--      the email itself.
--
-- WHO SEES WHAT
--   portal_invite_links and invoice_number_counter: nobody but the server
--   and these functions. client_invite_link is the coach's own client only
--   (054's coach_owns_profile, so it needs the 6-digit code).
--   client_invite_link_state: anyone holding a link (signed in or not), and
--   it says nothing but open or ended and the coach's first name.
--   invoice_take_number: the server only.
--
--   6. The owner's admin view: coach_admin_agreements.
--   7. Signed agreements (item 4): each signed version's PDF is kept as made
--      at signing, with both signatures (its own header below says how). The
--      guest's Health Check PDF (item 2) needs nothing here.
--
-- ORDER: after 061, 062 and 063 (it needs 044 and 045 too). Safe to run twice. Test:
--   supabase/064_followup_5_test.sql (064 CHECKS PASSED).
-- =============================================================================

-- ---------------------------------------------------------------- 1. the welcome email's link
create table if not exists public.portal_invite_links (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.client_profiles (id) on delete cascade,
  token_hash  text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  made_at     timestamptz not null default now(),
  ends_at     timestamptz not null,
  ended_at    timestamptz,
  check (ends_at > made_at)
);
comment on table public.portal_invite_links is
  'The welcome email''s set-up links (064): one per Invite or Send it again, kept as a fingerprint only, each ending 7 days after it was made, when a newer one is made, or when the person joins.';
create index if not exists portal_invite_links_profile_idx on public.portal_invite_links (profile_id, made_at desc);
alter table public.portal_invite_links enable row level security;
revoke all on public.portal_invite_links from public, anon, authenticated;
grant select, insert, update, delete on public.portal_invite_links to service_role;

-- A new link for the coach's own client: older links end, the invite is recorded (as 049's client_invite does), and
-- the link itself is handed back once, to be put in the email. Only the fingerprint is kept.
create or replace function public.client_invite_link(p_profile uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_token text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_now timestamptz := now();
begin
  if not public.coach_owns_profile(p_profile) then
    raise exception 'That client isn''t yours.' using errcode = '42501';
  end if;
  if exists (select 1 from public.client_profiles where id = p_profile and email is null) then
    raise exception 'Add an email first.' using errcode = '22023';
  end if;
  if exists (select 1 from public.client_profiles where id = p_profile and (user_id is not null or merged_into is not null)) then
    raise exception 'They already have an account.' using errcode = 'CC409';
  end if;
  update public.portal_invite_links set ended_at = v_now where profile_id = p_profile and ended_at is null;
  insert into public.portal_invite_links (profile_id, token_hash, made_at, ends_at)
  values (p_profile, encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), v_now, v_now + interval '7 days');
  update public.client_profiles set invited_at = v_now where id = p_profile and user_id is null;
  return v_token;
end;
$$;
revoke all on function public.client_invite_link(uuid) from public, anon;
grant execute on function public.client_invite_link(uuid) to authenticated;

-- Whether a link still works: { state: 'open', coach } or { state: 'ended' } (unknown, replaced, past its 7 days, or
-- the person has joined). Nothing about the person is ever said.
create or replace function public.client_invite_link_state(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v record;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('state', 'ended');
  end if;
  select l.ends_at, l.ended_at, p.user_id, p.merged_into, c.display_first_name as coach, c.active
    into v
    from public.portal_invite_links l
    join public.client_profiles p on p.id = l.profile_id
    left join public.coaches c on c.id = p.coach_id
    where l.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  if not found then
    return jsonb_build_object('state', 'ended');
  end if;
  if v.ended_at is not null or v.ends_at <= now() or v.user_id is not null or v.merged_into is not null or not coalesce(v.active, false) then
    return jsonb_build_object('state', 'ended', 'coach', left(coalesce(v.coach, ''), 60));
  end if;
  return jsonb_build_object('state', 'open', 'coach', left(coalesce(v.coach, ''), 60));
end;
$$;
revoke all on function public.client_invite_link_state(text) from public;
grant execute on function public.client_invite_link_state(text) to anon, authenticated;

-- Once the person has joined (049's client_accept_invite links the profile), their links end.
create or replace function public.client_invite_links_end()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_id is not null and old.user_id is null then
    update public.portal_invite_links set ended_at = now() where profile_id = new.id and ended_at is null;
  end if;
  return new;
end;
$$;
revoke all on function public.client_invite_links_end() from public, anon, authenticated;
drop trigger if exists client_invite_links_end on public.client_profiles;
create trigger client_invite_links_end after update of user_id on public.client_profiles
  for each row execute function public.client_invite_links_end();

-- 049's open invites, with one more rule: an invite sent with a set-up link waits only while a link is open (7 days
-- from the newest), so it ends with the email's link and Send it again opens it once more. An invite from before 064
-- (no link) is unchanged.
create or replace function public.my_coach_invites()
returns table (profile_id uuid, coach_first_name text, invited_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, c.display_first_name, p.invited_at
  from public.client_profiles p
  join public.coaches c on c.id = p.coach_id and c.active
  join auth.users u on u.id = (select auth.uid())
  where p.user_id is null and p.merged_into is null and p.invited_at is not null
    and u.email_confirmed_at is not null and lower(u.email) = p.email
    and (not exists (select 1 from public.portal_invite_links l where l.profile_id = p.id)
         or exists (select 1 from public.portal_invite_links l where l.profile_id = p.id and l.ended_at is null and l.ends_at > now()));
$$;
revoke all on function public.my_coach_invites() from public, anon;
grant execute on function public.my_coach_invites() to authenticated;

-- ---------------------------------------------------------------- 2. reminders that may have gone
alter table public.invoice_reminders add column if not exists sending_at timestamptz;
comment on column public.invoice_reminders.sending_at is
  'When the server asked the email service to send this reminder (064). Cleared when it went (sent_at) or was refused; left set when no answer came, so Needs you asks the coach to check before sending it again.';

-- ---------------------------------------------------------------- 3. invoice numbers when Stripe finalises
create table if not exists public.invoice_number_counter (
  id           boolean primary key default true check (id),
  next_number  integer not null check (next_number >= 1201)
);
comment on table public.invoice_number_counter is
  'The next CLARITY- invoice number (064). Taken in the same step as the invoice records it, so a number is never skipped, reused or going back.';
alter table public.invoice_number_counter enable row level security;
revoke all on public.invoice_number_counter from public, anon, authenticated;
grant select, insert, update on public.invoice_number_counter to service_role;
-- Starts after every number already handed out: those on invoices and those 061's sequence gave.
insert into public.invoice_number_counter (id, next_number)
select true, greatest(1201,
  coalesce((select max(number) + 1 from public.invoices), 1201),
  (select case when s.is_called then s.last_value + 1 else s.last_value end from public.clarity_invoice_number s))
on conflict (id) do nothing;

-- The invoice's number, given now if it has none: the server calls this just before Stripe finalises it. A second
-- call (a retry after Stripe didn't answer) gives the same number.
create or replace function public.invoice_take_number(p_invoice uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_number integer;
begin
  select i.number into v_number from public.invoices i where i.id = p_invoice for update;
  if not found then
    raise exception 'That invoice isn''t there.' using errcode = 'P0002';
  end if;
  if v_number is not null then
    return v_number;
  end if;
  update public.invoice_number_counter set next_number = next_number + 1 where id returning next_number - 1 into v_number;
  update public.invoices set number = v_number where id = p_invoice;
  return v_number;
end;
$$;
revoke all on function public.invoice_take_number(uuid) from public, anon, authenticated;
grant execute on function public.invoice_take_number(uuid) to service_role;

-- One Send at a time: the server marks the invoice while it asks Stripe (cleared after; a mark older than 2 minutes is
-- ignored), so two presses never finalise or email it twice (break-it tester, follow-up 5).
alter table public.invoices add column if not exists send_claimed_at timestamptz;

-- 061's next number, now from the same counter (a server from before this change asks it at draft time).
create or replace function public.next_invoice_number()
returns integer
language sql
volatile
security definer
set search_path = ''
as $$
  update public.invoice_number_counter set next_number = next_number + 1 where id returning next_number - 1;
$$;
revoke all on function public.next_invoice_number() from public, anon, authenticated;
grant execute on function public.next_invoice_number() to service_role;

-- ---------------------------------------------------------------- 4. payments: the owner's alone
drop policy if exists "Coach and owner read" on public.payments;
drop policy if exists "Owner reads" on public.payments;
create policy "Owner reads" on public.payments for select to authenticated
  using ((select public.my_coach_id()) is not null and coalesce((select public.is_owner()), false));

-- ---------------------------------------------------------------- 5. who reads a recap in the portal
-- 050's session_recap_people with one more fact: whether that person reads their summaries in the portal (a client
-- profile linked to an account). The same people, under the same rule: the caller's own session, once sent.
create or replace function public.session_recap_readers(p_session uuid)
returns table (name text, email text, has_account boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select p.name, p.email, p.user_id is not null and p.merged_into is null
  from public.coach_sessions s
  join public.client_profiles p on p.id = s.profile_id
  where s.id = p_session and s.recap_sent_at is not null and s.coach_id = public.my_coach_id() and p.email is not null
  union
  select m.name, coalesce(m.email, p.email), coalesce(p.user_id is not null and p.merged_into is null, false)
  from public.coach_sessions s
  join public.coach_group_members m on m.group_id = s.group_id
  left join public.client_profiles p on p.id = m.profile_id
  where s.id = p_session and s.recap_sent_at is not null and s.coach_id = public.my_coach_id() and coalesce(m.email, p.email) is not null;
$$;
revoke all on function public.session_recap_readers(uuid) from public, anon;
grant execute on function public.session_recap_readers(uuid) to authenticated;

-- ---------------------------------------------------------------- 6. the owner's admin view of a client
-- The owner opening an associate's client sees the admin facts (follow-up 5, item 10): with 049's coach_admin_clients
-- (allocation and engagement) and the invoices the owner already reads, each agreement's business facts. Never its
-- clauses, its signatures or anything of the coaching. The owner alone, with the 6-digit code (is_owner()).
create or replace function public.coach_admin_agreements(p_profile uuid)
returns table (agreement_id uuid, reference text, status text, version integer, coaching text, total_minor bigint,
               currency text, funded_by text, sent_at timestamptz, client_signed_at timestamptz, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not coalesce(public.is_owner(), false) then
    raise exception 'Only the owner can do this.' using errcode = '42501';
  end if;
  return query
  select a.id, a.reference, a.status, v.version, left(coalesce(v.terms->>'coaching', ''), 160), v.total_minor,
         v.currency, v.funded_by, v.sent_at, v.client_signed_at, a.created_at
  from public.agreements a
  left join public.agreement_versions v on v.agreement_id = a.id and v.version = a.current_version
  where a.profile_id = p_profile and a.kind = 'coaching'
  order by a.created_at desc
  limit 20;
end;
$$;
revoke all on function public.coach_admin_agreements(uuid) from public, anon;
grant execute on function public.coach_admin_agreements(uuid) to authenticated;

-- ---------------------------------------------------------------- 7. the PDFs (items 2 and 4)
-- =============================================================================
-- 064, the PDF part (follow-up 5, items 2 and 4)
--
-- WHAT THIS PART DOES (plain English)
--   A. The guest's Health Check copy (item 2): nothing here. Its results PDF
--      is made on the server from what 044's alignment_email_check already
--      hands it, and the results never close (Tim, 25 Nov: the 30 days is only
--      how long a link can be used to start a Health Check, rule of 27 Oct).
--   B. Signed agreements (item 4)
--        4. agreement_signed_pdfs: each signed version's PDF, made by the
--           server at the moment of signing with both signatures drawn, kept
--           exactly as made. Insert only: a trigger refuses every update,
--           delete and truncate, for every role (service_role too). Row
--           security on, no rules and no table rights for anyone: it is
--           reached only through the two functions below.
--        5. agreement_signed_pdf(version): the stored PDF (base64) for that
--           version's client, or the agreement's coach with the 6-digit code
--           (coach_code_ok(), as 061 and 062's coach functions); 'made: false'
--           while it waits to be made; 42501 for anyone else.
--        6. agreement_pdf_source(version), the server's key only: what the PDF
--           is made from, the version as my_agreements() gives it to the
--           client (an organisation-funded client's without any amount), both
--           signatures (the only place the coach's is read for the client's
--           PDF, and only by the server), the client's name and the zone its
--           times are read in.
--        7. agreement_signed_pdf_keep(version, pdf, file name), the server's
--           key only: keeps the first PDF made for a signed version and hands
--           back whichever was kept first; a second is never stored.
--
-- Additive and safe to run twice: columns and tables only if missing,
-- functions replaced with the same version, triggers and rules dropped and
-- made again, the backfill only where nothing is set.
-- Needs 044, 045 and 061 (it stops with a clear message without them).
-- Checks: the PDF part's test (064's test file), then
-- supabase/061_agreements_and_invoices_test.sql,
-- supabase/054_coach_code_required_test.sql,
-- supabase/044_guest_sharing_test.sql and
-- supabase/045_health_check_new_code_test.sql.
-- =============================================================================

do $needs$
begin
  if to_regclass('public.alignment_sessions') is null
     or not exists (select 1 from pg_catalog.pg_attribute
                     where attrelid = 'public.alignment_sessions'::regclass and attname = 'new_code' and not attisdropped) then
    raise exception '064 needs 045_health_check_new_code first.';
  end if;
  if to_regclass('public.agreement_versions') is null or to_regprocedure('public.sign_agreement(uuid,text,uuid,text)') is null
     or to_regprocedure('public.coach_code_ok()') is null or to_regprocedure('public.my_coach_id()') is null then
    raise exception '064 needs 061_agreements_and_invoices first.';
  end if;
end
$needs$;

-- =============================================================================
-- B. Signed agreements: the signed PDF, kept as it was made
-- =============================================================================
create table if not exists public.agreement_signed_pdfs (
  version_id  uuid primary key references public.agreement_versions (id) on delete restrict,
  pdf         bytea not null check (octet_length(pdf) between 1000 and 15000000),
  sha256      text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  file_name   text not null check (char_length(file_name) between 5 and 200 and file_name ~ '\.pdf$'),
  made_at     timestamptz not null default now()
);
comment on table public.agreement_signed_pdfs is
  'Each signed agreement version''s PDF (064, follow-up 5), made by the server at the moment of signing with both signatures drawn, and kept exactly as made: insert only, never changed or removed. Read only through agreement_signed_pdf(); written only through agreement_signed_pdf_keep() (the server''s key).';

alter table public.agreement_signed_pdfs enable row level security;
revoke all on table public.agreement_signed_pdfs from public, anon, authenticated, service_role;

-- What is stored is checked as it goes in: a PDF, its own fingerprint, and only for a signed version.
create or replace function public.agreement_signed_pdfs_in()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if substring(new.pdf from 1 for 5) <> convert_to('%PDF-', 'UTF8') then
    raise exception 'Only a PDF is kept here.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.agreement_versions v where v.id = new.version_id and v.client_signed_at is not null) then
    raise exception 'Only a signed version''s PDF is kept.' using errcode = '23514';
  end if;
  new.sha256 := encode(sha256(new.pdf), 'hex');
  new.made_at := now();
  return new;
end;
$$;
revoke all on function public.agreement_signed_pdfs_in() from public, anon, authenticated, service_role;
drop trigger if exists agreement_signed_pdfs_in on public.agreement_signed_pdfs;
create trigger agreement_signed_pdfs_in before insert on public.agreement_signed_pdfs
  for each row execute function public.agreement_signed_pdfs_in();

-- Never changed, never removed: for every role, the server's key included.
create or replace function public.agreement_signed_pdfs_kept()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'A signed agreement''s PDF is kept as it was made.' using errcode = '23514';
end;
$$;
revoke all on function public.agreement_signed_pdfs_kept() from public, anon, authenticated, service_role;
drop trigger if exists agreement_signed_pdfs_kept on public.agreement_signed_pdfs;
create trigger agreement_signed_pdfs_kept before update or delete on public.agreement_signed_pdfs
  for each row execute function public.agreement_signed_pdfs_kept();
drop trigger if exists agreement_signed_pdfs_kept_all on public.agreement_signed_pdfs;
create trigger agreement_signed_pdfs_kept_all before truncate on public.agreement_signed_pdfs
  for each statement execute function public.agreement_signed_pdfs_kept();

-- -----------------------------------------------------------------------------
-- agreement_signed_pdf (signed in): the stored PDF, for that version's client
-- or the agreement's coach with the 6-digit code
-- -----------------------------------------------------------------------------
create or replace function public.agreement_signed_pdf(p_version uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v record;
  k public.agreement_signed_pdfs;
begin
  if v_user is null then
    raise exception 'Sign in to carry on.' using errcode = '42501';
  end if;
  select ver.id, ver.coach_id, ver.client_signed_at, a.kind, p.user_id as client_user
    into v
    from public.agreement_versions ver
    join public.agreements a on a.id = ver.agreement_id
    left join public.client_profiles p on p.id = a.profile_id
   where ver.id = p_version;
  -- The version's own client, or its coach with the 6-digit code (054), as 061 and 062's coach functions.
  if not found or not (
       (v.kind = 'coaching' and v.client_user is not null and v.client_user = v_user)
       or (public.coach_code_ok() and v.coach_id = (select public.my_coach_id()))) then
    raise exception 'That agreement isn’t yours.' using errcode = '42501';
  end if;
  if v.client_signed_at is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed');
  end if;
  select * into k from public.agreement_signed_pdfs where version_id = p_version;
  if not found then
    return jsonb_build_object('ok', true, 'made', false);
  end if;
  return jsonb_build_object('ok', true, 'made', true, 'pdf', encode(k.pdf, 'base64'), 'sha256', k.sha256,
                            'file_name', k.file_name, 'made_at', k.made_at);
end;
$$;
revoke all on function public.agreement_signed_pdf(uuid) from public, anon, service_role;
grant execute on function public.agreement_signed_pdf(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- agreement_pdf_source (the server's key only): what a signed version's PDF is
-- made from. The version as my_agreements() gives it to its client (061: an
-- organisation-funded client's terms and clauses cut to the rows they see,
-- with no amount), both signatures, the client's name, and the zone its times
-- are read in (the client's saved zone, else the coach's, else the UK's).
-- -----------------------------------------------------------------------------
create or replace function public.agreement_pdf_source(p_version uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role text := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '');
  v public.agreement_versions;
  a public.agreements;
  p public.client_profiles;
  v_zone text;
begin
  -- the server (service role), or Tim in the SQL editor (no caller's claims)
  if not (v_role = 'service_role' or (v_role = '' and (select auth.uid()) is null)) then
    raise exception 'Only the server can do this.' using errcode = '42501';
  end if;
  select * into v from public.agreement_versions where id = p_version;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  select * into a from public.agreements where id = v.agreement_id;
  select * into p from public.client_profiles where id = a.profile_id;
  if a.kind <> 'coaching' or p.id is null then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if v.client_signed_at is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed');
  end if;
  v_zone := coalesce(nullif(p.time_zone, ''), (select nullif(cs.time_zone, '') from public.coach_settings cs where cs.coach_id = v.coach_id), 'Europe/London');

  return jsonb_build_object(
    'ok', true,
    'stored', exists (select 1 from public.agreement_signed_pdfs k where k.version_id = v.id),
    'client_name', p.name,
    'time_zone', v_zone,
    -- my_agreements()' own shape and cut (061), word for word
    'version', jsonb_build_object(
      'id', v.id, 'agreement_id', a.id, 'reference', a.reference, 'version', v.version, 'status', v.status,
      'current', v.version = a.current_version, 'sent_at', v.sent_at, 'client_signed_at', v.client_signed_at,
      'coach_signed_at', v.coach_signed_at, 'funded_by', v.funded_by,
      'currency', case when v.funded_by is null then v.currency end,
      'fx_rate', case when v.funded_by is null then v.fx_rate end, 'fx_at', case when v.funded_by is null then v.fx_at end,
      'total_minor', case when v.funded_by is null then v.total_minor end,
      'terms', case when v.funded_by is null then v.terms
               else (select coalesce(jsonb_object_agg(k, val), '{}'::jsonb) from jsonb_each(v.terms) as e(k, val)
                     where k = any (array['coaching', 'sessions', 'minutes', 'place', 'rhythm', 'startsOn', 'endsOn', 'ongoing', 'goals',
                                          'contactWays', 'clientName', 'clientEmail', 'coachName', 'coachFirst', 'coachEmail', 'fundedBy',
                                          'expensesAllowed', 'sponsor'])) end,
      'clauses', case when v.funded_by is null then v.clauses
                 else (select coalesce(jsonb_agg(c), '[]'::jsonb) from jsonb_array_elements(v.clauses) c where coalesce(c->>'money', 'false') <> 'true') end,
      'changes', v.changes, 'signed_name', v.signed_name, 'signed_email', v.signed_email, 'fingerprint', v.fingerprint,
      'client_signature_id', v.client_signature_id),
    -- The two signatures, drawn or typed. Only the server reads the coach's, to draw it on the PDF.
    'client_signature', (select jsonb_build_object('kind', s.kind, 'image', s.image, 'typed_name', s.typed_name)
                           from public.signatures s where s.id = v.client_signature_id and s.user_id = v.signed_user_id),
    'coach_signature', (select jsonb_build_object('kind', s.kind, 'image', s.image, 'typed_name', s.typed_name)
                          from public.signatures s join public.coaches c on c.user_id = s.user_id
                         where s.id = v.coach_signature_id and c.id = v.coach_id)
  );
end;
$$;
revoke all on function public.agreement_pdf_source(uuid) from public, anon, authenticated, service_role;
grant execute on function public.agreement_pdf_source(uuid) to service_role;

-- -----------------------------------------------------------------------------
-- agreement_signed_pdf_keep (the server's key only): keeps the first PDF made
-- for a signed version, and hands back the one kept (a second is never stored)
-- -----------------------------------------------------------------------------
create or replace function public.agreement_signed_pdf_keep(p_version uuid, p_pdf text, p_file_name text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_role text := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '');
  k public.agreement_signed_pdfs;
begin
  if not (v_role = 'service_role' or (v_role = '' and (select auth.uid()) is null)) then
    raise exception 'Only the server can do this.' using errcode = '42501';
  end if;
  if p_pdf is null or char_length(p_pdf) > 21000000 then
    raise exception 'Only a PDF is kept here.' using errcode = '22023';
  end if;
  insert into public.agreement_signed_pdfs (version_id, pdf, sha256, file_name)
  values (p_version, decode(p_pdf, 'base64'), repeat('0', 64), left(coalesce(p_file_name, ''), 200))
  on conflict (version_id) do nothing;
  select * into k from public.agreement_signed_pdfs where version_id = p_version;
  return jsonb_build_object('ok', true, 'pdf', encode(k.pdf, 'base64'), 'sha256', k.sha256, 'file_name', k.file_name, 'made_at', k.made_at);
end;
$$;
revoke all on function public.agreement_signed_pdf_keep(uuid, text, text) from public, anon, authenticated, service_role;
grant execute on function public.agreement_signed_pdf_keep(uuid, text, text) to service_role;

select public.record_migration(64, '064_followup_5');
