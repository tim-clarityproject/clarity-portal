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
-- ORDER: after 061, 062 and 063. Safe to run twice. Test:
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

-- @@PDF_PART@@

select public.record_migration(64, '064_followup_5');
