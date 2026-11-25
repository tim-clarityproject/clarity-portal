-- =============================================================================
-- 065_agreements_engine.sql
-- Phase 6b run 3 (25 Nov 2026): agreements, quotes and invoicing, the engine.
--
-- WHAT THIS DOES (plain English)
--   1. Any of 15 currencies (M28's list: the European Central Bank's ones and
--      the UAE dirham from its fixed dollar peg) on every money table, through
--      one check, currency_ok(). An agreement's exchange rate holds yen too.
--   2. Five kinds of agreement (set sessions, a monthly retainer, a team
--      programme, a one-off piece of work, a block of hours), each with its own
--      standard wording. The wording itself is code (standardWording.js);
--      the database keeps only a coach's own new versions of a clause
--      (agreement_clause_standards, insert only) and each agreement's own
--      edits (agreement_versions.overrides), linked to the standard they
--      changed. A version sent never changes.
--   3. Quotes (agreement_quotes): Q- numbers from their own counter, taken at
--      Send and never reused; valid 14, 30 or 60 days; a private link read
--      only through quote_open(), which records the first open. Accepting
--      (quote_accept, the server's) makes the quote's version the agreement,
--      with the extras ticked and the way of settling chosen.
--   4. Opens (agreement_link_opens): the first time a client, a sponsor or a
--      quote's reader opens their link, for the coach only; never told to
--      the client.
--   5. Sponsors sign by a link with no account (sponsor_sign_links, kept as a
--      fingerprint; sponsor_signatures): sponsor_link_open() reads, and the
--      server signs through sponsor_sign().
--   6. Signing, version 2 (sign_agreement_v2): 061's checks, and it waits
--      while a change asked for is unanswered, records the "Start my coaching
--      straight away" tick (self-funded only) and the way of settling chosen.
--      A self-funded client who didn't tick it can't have a coaching session
--      booked inside their 14 days (coach_sessions_065 trigger).
--   7. Signing and first-payment reminders (agreement_reminders), cancelling
--      within 14 days (agreement_cancellations), invoices drawn from sessions
--      and logged hours (invoice_sources: nothing invoiced twice),
--      organisations' billing profiles and evidence, talking points, Needs
--      you's done and not now, and daily reference rates (fx_reference_rates).
--   8. An associate's agreement can wait for the owner's approval
--      (agreement_for_approval, agreement_approve).
--   9. A block of hours for its client (my_hours), what happened at a session
--      and who said so (coach_sessions.outcome_source), and the Fathom mark
--      (session_mark_from_fathom, the server's; wired in Phase 6c).
--
-- WHO SEES WHAT
--   Every new coach table needs the coach's 6-digit code (054's list gains
--   them). A coach keeps their own extras, quotes, billing profiles,
--   evidence, talking points and Needs you; reads their own opens,
--   reminders, cancellations and invoice sources (the server writes those).
--   Every coach of the practice reads the owner's standard wording and
--   packages; only the owner adds a standard. Sponsor links, sponsor
--   signatures, the quote counter and the reference rates are the server's
--   alone (rates read through coach_fx_rates()). Clients read only through
--   my_agreements(), my_invoices() and my_hours(); anyone with a link only
--   through quote_open() and sponsor_link_open().
--
-- Additive and safe to run twice. Needs 061 to 064 (stops without them).
-- Tests: supabase/065_agreements_engine_test.sql and
-- supabase/065_agreements_engine_breakit_test.sql, then 054's, 061's (and
-- its break-it), 062's, 063's and 064's.
-- =============================================================================

do $$
begin
  if to_regprocedure('public.invoice_take_number(uuid)') is null or to_regclass('public.pricing_packages') is null
     or to_regprocedure('public.agreement_pdf_source(uuid)') is null or to_regprocedure('public.coach_first_screen_lean(text,timestamptz,timestamptz,date,timestamptz,uuid[])') is null
     or to_regprocedure('public.coach_code_ok()') is null then
    raise exception '065 needs 061 to 064 first.';
  end if;
end
$$;

-- =============================================================================
-- 1. Currencies
-- =============================================================================
-- The currencies an agreement, invoice, quote or package may be in (risk 8: the ECB's daily list and the dirham's peg).
-- Stripe takes many more; each needs a daily rate source before it is offered.
create or replace function public.currency_ok(p_currency text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_currency in ('GBP', 'EUR', 'USD', 'CAD', 'AUD', 'NZD', 'CHF', 'AED', 'SGD', 'HKD', 'SEK', 'NOK', 'DKK', 'ZAR', 'JPY');
$$;
grant execute on function public.currency_ok(text) to public;

do $c$
declare t text;
begin
  foreach t in array array['agreement_versions', 'invoices', 'payments', 'credit_notes', 'expenses', 'proposals', 'pricing_packages',
                           'purchase_orders', 'finance_outgoings'] loop
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_currency_check');
    execute format('alter table public.%I add constraint %I check (public.currency_ok(currency))', t, t || '_currency_check');
  end loop;
  -- Units of the currency to £1, as 061 keeps it: yen is about 190, so the old "under 10" can't hold it. The column's
  -- type (numeric(10, 6), up to 9999.999999) is kept as it is, so a version's fingerprint (061: its rate written out as
  -- text) reads exactly as it did when it was signed.
  alter table public.agreement_versions drop constraint if exists agreement_versions_fx_rate_check;
  alter table public.agreement_versions add constraint agreement_versions_fx_rate_check check (fx_rate is null or (fx_rate > 0 and fx_rate < 10000));
  alter table public.proposals drop constraint if exists proposals_fx_rate_check;
  alter table public.proposals add constraint proposals_fx_rate_check check (fx_rate is null or (fx_rate > 0 and fx_rate < 10000));
end
$c$;

-- =============================================================================
-- 2. Changes to 061's and 062's tables
-- =============================================================================
-- ---------------------------------------------------------------- agreements
alter table public.agreements add column if not exists agreement_kind text not null default 'sessions';
alter table public.agreements add column if not exists package_id uuid references public.pricing_packages (id) on delete set null;
alter table public.agreements add column if not exists approval text not null default 'not_needed';
alter table public.agreements add column if not exists approval_note text;
alter table public.agreements add column if not exists approved_by uuid references public.coaches (id) on delete set null;
alter table public.agreements add column if not exists approved_at timestamptz;
alter table public.agreements add column if not exists paused_from date;
alter table public.agreements add column if not exists paused_to date;
alter table public.agreements add column if not exists ending_on date;
alter table public.agreements add column if not exists ending_by text;
alter table public.agreements add column if not exists team_parent_id uuid references public.agreements (id) on delete set null;
create index if not exists agreements_team_parent_idx on public.agreements (team_parent_id);
create index if not exists agreements_package_idx on public.agreements (package_id);
do $c$
begin
  alter table public.agreements drop constraint if exists agreements_status_check;
  alter table public.agreements add constraint agreements_status_check
    check (status in ('draft', 'sent', 'signed', 'ended', 'ended_not_renewed', 'cancelled', 'expired'));
  if not exists (select 1 from pg_constraint where conname = 'agreements_065_ok') then
    alter table public.agreements add constraint agreements_065_ok check (
      agreement_kind in ('sessions', 'retainer', 'team', 'oneoff', 'hours')
      and approval in ('not_needed', 'waiting', 'approved', 'changes_asked')
      and (approval_note is null or char_length(approval_note) <= 1000)
      and (ending_by is null or ending_by in ('client', 'coach'))
      and (paused_to is null or paused_from is null or paused_to > paused_from)
      and (team_parent_id is null or team_parent_id <> id));
  end if;
end
$c$;

-- ---------------------------------------------------------------- agreement_versions
alter table public.agreement_versions add column if not exists overrides jsonb not null default '{}'::jsonb;
alter table public.agreement_versions add column if not exists send_as text not null default 'agreement';
alter table public.agreement_versions add column if not exists personal_note text;
alter table public.agreement_versions add column if not exists expires_on date;
alter table public.agreement_versions add column if not exists start_now boolean;
alter table public.agreement_versions add column if not exists start_now_at timestamptz;
alter table public.agreement_versions add column if not exists settle_choice text;
alter table public.agreement_versions add column if not exists sponsor_signed_at timestamptz;
alter table public.agreement_versions add column if not exists sponsor_name text;
alter table public.agreement_versions add column if not exists sponsor_role text;
alter table public.agreement_versions add column if not exists sponsor_email text;
alter table public.agreement_versions add column if not exists sponsor_po text;
do $c$
declare v_name text;
begin
  if not exists (select 1 from pg_constraint where conname = 'agreement_versions_065_ok') then
    alter table public.agreement_versions add constraint agreement_versions_065_ok check (
      jsonb_typeof(overrides) = 'object' and pg_column_size(overrides) <= 40000
      and send_as in ('agreement', 'quote')
      and (personal_note is null or char_length(personal_note) <= 1000)
      and (settle_choice is null or settle_choice in ('upfront', 'plan'))
      and (start_now_at is null or start_now is true)
      and (sponsor_name is null or char_length(sponsor_name) <= 160)
      and (sponsor_role is null or char_length(sponsor_role) <= 120)
      and (sponsor_email is null or char_length(sponsor_email) <= 320)
      and (sponsor_po is null or char_length(sponsor_po) <= 100)
      and (expires_on is null or expires_on between date '2000-01-01' and date '2100-12-31'));
  end if;
  -- 061's "a signed version has its whole signing record" becomes: the coach signed it, and either the client signed it
  -- (061's record) or, for a sponsor agreement, the sponsor did (065's record). Found by what it says, whatever its name.
  for v_name in
    select c.conname from pg_constraint c
    where c.conrelid = 'public.agreement_versions'::regclass and c.contype = 'c'
      and pg_get_constraintdef(c.oid) like '%client_signed_at IS NOT NULL%' and c.conname <> 'agreement_versions_signed_record'
  loop
    execute format('alter table public.agreement_versions drop constraint %I', v_name);
  end loop;
  if not exists (select 1 from pg_constraint where conname = 'agreement_versions_signed_record') then
    alter table public.agreement_versions add constraint agreement_versions_signed_record check (
      status <> 'signed' or (coach_signed_at is not null and fingerprint is not null
        and ((client_signed_at is not null and signed_name is not null and signed_email is not null)
             or (sponsor_signed_at is not null and sponsor_name is not null))));
  end if;
end
$c$;

-- ---------------------------------------------------------------- invoices
alter table public.invoices add column if not exists version_id uuid references public.agreement_versions (id) on delete set null;
alter table public.invoices add column if not exists supplier_number text;
alter table public.invoices add column if not exists their_reference text;
alter table public.invoices add column if not exists timesheet boolean not null default false;
alter table public.invoices add column if not exists bank_details jsonb;
alter table public.invoices add column if not exists pdf_path text;
alter table public.invoices add column if not exists emailed_at timestamptz;
alter table public.invoices add column if not exists portal_uploaded_at timestamptz;
create index if not exists invoices_version_idx on public.invoices (version_id);
do $c$
begin
  alter table public.invoices drop constraint if exists invoices_kind_check;
  alter table public.invoices add constraint invoices_kind_check check (kind in ('instalment', 'one_off', 'expenses', 'late_cancel',
    'first_payment', 'deposit', 'delivered', 'org_hours', 'top_up', 'updated_price'));
  if not exists (select 1 from pg_constraint where conname = 'invoices_065_ok') then
    alter table public.invoices add constraint invoices_065_ok check (
      (supplier_number is null or char_length(supplier_number) <= 80)
      and (their_reference is null or char_length(their_reference) <= 160)
      and (bank_details is null or (jsonb_typeof(bank_details) = 'object' and pg_column_size(bank_details) <= 4000))
      and (pdf_path is null or char_length(pdf_path) <= 500));
  end if;
end
$c$;

-- ---------------------------------------------------------------- pricing_packages
alter table public.pricing_packages add column if not exists agreement_kind text not null default 'sessions';
alter table public.pricing_packages add column if not exists defaults jsonb not null default '{}'::jsonb;
alter table public.pricing_packages add column if not exists personal_note text;
do $c$
begin
  if not exists (select 1 from pg_constraint where conname = 'pricing_packages_065_ok') then
    alter table public.pricing_packages add constraint pricing_packages_065_ok check (
      agreement_kind in ('sessions', 'retainer', 'team', 'oneoff', 'hours')
      and jsonb_typeof(defaults) = 'object' and pg_column_size(defaults) <= 20000
      and (personal_note is null or char_length(personal_note) <= 1000));
  end if;
end
$c$;
-- The practice's owner, for a coach with the code: an associate's reads of the owner's packages and wording ask it
-- (an associate can't read the owner's coaches row).
create or replace function public.practice_owner_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.id from public.coaches c
  where c.role = 'owner' and c.active and public.coach_code_ok() and public.my_coach_id() is not null;
$$;
revoke all on function public.practice_owner_ids() from public, anon;
grant execute on function public.practice_owner_ids() to authenticated;

-- Every coach of the practice builds from the owner's packages (an associate's builder starts from them); only the
-- owner changes them (062's "Owner alone" stays for every write).
drop policy if exists "Coaches read the owner's packages" on public.pricing_packages;
create policy "Coaches read the owner's packages" on public.pricing_packages for select to authenticated
  using ((select public.my_coach_id()) is not null and coach_id in (select public.practice_owner_ids()));

-- ---------------------------------------------------------------- coach_sessions (050): who said what happened
alter table public.coach_sessions add column if not exists outcome_source text;
alter table public.coach_sessions add column if not exists outcome_at timestamptz;
do $c$
begin
  if not exists (select 1 from pg_constraint where conname = 'coach_sessions_outcome_source_ok') then
    alter table public.coach_sessions add constraint coach_sessions_outcome_source_ok check (outcome_source is null or outcome_source in ('coach', 'fathom'));
  end if;
end
$c$;

-- =============================================================================
-- 3. New tables
-- =============================================================================
-- A clause's paragraphs: 1 to 20, each { text: 1 to 2000 characters, why: up to 500 or none }.
create or replace function public.agreement_paragraphs_ok(p jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p) = 'array' and jsonb_array_length(p) between 1 and 20
    and not exists (
      select 1 from jsonb_array_elements(p) e
      where jsonb_typeof(e) <> 'object' or jsonb_typeof(e -> 'text') is distinct from 'string'
         or char_length(btrim(e ->> 'text')) not between 1 and 2000
         or (e ? 'why' and jsonb_typeof(e -> 'why') <> 'null' and (jsonb_typeof(e -> 'why') <> 'string' or char_length(e ->> 'why') > 500)));
$$;
grant execute on function public.agreement_paragraphs_ok(jsonb) to public;

create table if not exists public.agreement_clause_standards (
  id              uuid primary key default gen_random_uuid(),
  coach_id        uuid not null references public.coaches (id) on delete cascade,
  agreement_kind  text not null check (agreement_kind in ('sessions', 'retainer', 'team', 'oneoff', 'hours')),
  clause_key      text not null check (clause_key ~ '^[a-z][a-z0-9_]{0,39}$'),
  version         integer not null check (version between 1 and 9999),
  title           text not null check (char_length(btrim(title)) between 1 and 120),
  paragraphs      jsonb not null check (public.agreement_paragraphs_ok(paragraphs)),
  from_agreement  uuid references public.agreements (id) on delete set null,
  created_at      timestamptz not null default now(),
  unique (coach_id, agreement_kind, clause_key, version)
);
comment on table public.agreement_clause_standards is
  'A coach''s own standard wording of a clause (065), one row per new version ("Use this wording for everyone"). Version 0 of every clause is the code (src/lib/agreements/standardWording.js). Insert only; every coach of the practice reads the owner''s. Agreements already sent never change: each keeps its full text as sent.';

create table if not exists public.agreement_extras (
  id           uuid primary key default gen_random_uuid(),
  coach_id     uuid not null references public.coaches (id) on delete cascade,
  key          text not null check (key ~ '^[a-z][a-z0-9_]{0,39}$'),
  title        text not null check (char_length(btrim(title)) between 1 and 120),
  price_minor  bigint not null check (price_minor between 0 and 100000000),
  currency     text not null default 'GBP' check (public.currency_ok(currency)),
  hint         text check (char_length(hint) <= 120),
  position     integer not null default 0 check (position between 0 and 1000000),
  archived     boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (coach_id, key)
);
comment on table public.agreement_extras is 'A coach''s list of extras a quote may offer (065): an extra coaching session, a visit day, a team workshop day, a Health Check with a debrief. Nothing is offered by default.';

create table if not exists public.agreement_quotes (
  id                  uuid primary key default gen_random_uuid(),
  coach_id            uuid not null references public.coaches (id) on delete restrict,
  agreement_id        uuid not null references public.agreements (id) on delete cascade,
  version_id          uuid not null unique references public.agreement_versions (id) on delete cascade,
  number              integer unique check (number >= 1),
  valid_days          integer not null default 30 check (valid_days in (14, 30, 60)),
  valid_until         date check (valid_until is null or valid_until between date '2000-01-01' and date '2100-12-31'),
  status              text not null default 'draft' check (status in ('draft', 'sent', 'accepted', 'expired', 'withdrawn')),
  share_token         text not null unique default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''))
                      check (share_token ~ '^[0-9a-f]{64}$'),
  coach_signature_id  uuid references public.signatures (id) on delete set null,
  sent_at             timestamptz,
  accepted_at         timestamptz,
  accepted_extras     text[] check (accepted_extras is null or cardinality(accepted_extras) <= 20),
  accepted_choice     text check (accepted_choice is null or accepted_choice in ('upfront', 'plan')),
  reopened_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
comment on table public.agreement_quotes is
  'A quote (065): built from an agreement''s draft version, its Q- number taken at Send (quote_take_number, never reused), valid 14, 30 or 60 days, read by its private link only through quote_open(). Accepting it (quote_accept, the server''s) makes that version the agreement.';
create index if not exists agreement_quotes_agreement_idx on public.agreement_quotes (agreement_id);

create table if not exists public.quote_number_counter (
  id           boolean primary key default true check (id),
  next_number  integer not null check (next_number >= 1)
);
comment on table public.quote_number_counter is 'The next Q- quote number (065). Taken in the same step as the quote records it, so a number is never skipped, reused or going back.';
insert into public.quote_number_counter (id, next_number)
select true, coalesce((select max(number) + 1 from public.agreement_quotes), 1)
on conflict (id) do nothing;

create table if not exists public.agreement_link_opens (
  id          uuid primary key default gen_random_uuid(),
  coach_id    uuid not null references public.coaches (id) on delete cascade,
  version_id  uuid references public.agreement_versions (id) on delete cascade,
  quote_id    uuid references public.agreement_quotes (id) on delete cascade,
  who         text not null check (who in ('client', 'sponsor', 'quote')),
  opened_at   timestamptz not null default now(),
  check ((version_id is not null) or (quote_id is not null))
);
comment on table public.agreement_link_opens is 'The first time each agreement or quote link was opened (065), recorded on the server as the page loads. Its coach''s alone: the client is never told.';
create unique index if not exists agreement_link_opens_version_once on public.agreement_link_opens (version_id, who) where version_id is not null and quote_id is null;
create unique index if not exists agreement_link_opens_quote_once on public.agreement_link_opens (quote_id) where quote_id is not null;

create table if not exists public.sponsor_sign_links (
  id             uuid primary key default gen_random_uuid(),
  coach_id       uuid not null references public.coaches (id) on delete cascade,
  agreement_id   uuid not null references public.agreements (id) on delete cascade,
  version_id     uuid not null references public.agreement_versions (id) on delete cascade,
  token_hash     text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  sponsor_name   text not null check (char_length(btrim(sponsor_name)) between 1 and 160),
  sponsor_email  text not null check (char_length(sponsor_email) <= 320 and sponsor_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  sponsor_role   text check (char_length(sponsor_role) <= 120),
  expires_at     timestamptz not null,
  ended_at       timestamptz,
  created_at     timestamptz not null default now(),
  check (expires_at > created_at)
);
comment on table public.sponsor_sign_links is 'A sponsor''s signing link (065): kept as a fingerprint only, handed back once when sent. The server''s alone.';

create table if not exists public.sponsor_signatures (
  id          uuid primary key default gen_random_uuid(),
  coach_id    uuid not null references public.coaches (id) on delete cascade,
  version_id  uuid not null unique references public.agreement_versions (id) on delete restrict,
  image       text check (image is null or (image ~ '^data:image/png;base64,[A-Za-z0-9+/]+={0,2}$' and char_length(image) between 200 and 300000)),
  typed_name  text check (typed_name is null or char_length(btrim(typed_name)) between 3 and 160),
  created_at  timestamptz not null default now(),
  check ((image is not null) <> (typed_name is not null))
);
comment on table public.sponsor_signatures is 'A sponsor''s signature on their organisation''s agreement (065), drawn or typed. Made only by sponsor_sign(); the server''s alone.';

create table if not exists public.agreement_reminders (
  id          uuid primary key default gen_random_uuid(),
  coach_id    uuid not null references public.coaches (id) on delete cascade,
  version_id  uuid not null references public.agreement_versions (id) on delete cascade,
  kind        text not null check (kind in ('sign_3', 'sign_7', 'first_payment')),
  drafted_at  timestamptz not null default now(),
  sending_at  timestamptz,
  sent_at     timestamptz,
  unique (version_id, kind)
);
comment on table public.agreement_reminders is 'Signing reminders at 3 and 7 days, and the first payment''s after 24 hours (065): drafted by the nightly round, sent only when the coach presses Send (claimed first, 064''s sending_at pattern).';

create table if not exists public.agreement_cancellations (
  id                 uuid primary key default gen_random_uuid(),
  coach_id           uuid not null references public.coaches (id) on delete restrict,
  agreement_id       uuid not null unique references public.agreements (id) on delete restrict,
  version_id         uuid references public.agreement_versions (id) on delete set null,
  asked_on           date not null,
  sessions_had       integer not null default 0 check (sessions_had between 0 and 1000),
  per_session_minor  bigint not null default 0 check (per_session_minor between 0 and 100000000),
  paid_minor         bigint not null default 0 check (paid_minor between 0 and 100000000),
  refund_minor       bigint not null default 0 check (refund_minor between 0 and 100000000 and refund_minor <= paid_minor),
  credit_note_id     uuid references public.credit_notes (id) on delete set null,
  stripe_refund_id   text check (char_length(stripe_refund_id) <= 200),
  created_at         timestamptz not null default now()
);
comment on table public.agreement_cancellations is 'Cancelling within 14 days (065; UK Consumer Contracts Regulations, self-funded individuals only): what was settled, the coaching sessions had and the refund. Written by the server with its Stripe refund and credit note.';

create table if not exists public.invoice_sources (
  id             uuid primary key default gen_random_uuid(),
  coach_id       uuid not null references public.coaches (id) on delete cascade,
  invoice_id     uuid not null references public.invoices (id) on delete cascade,
  session_id     uuid references public.coach_sessions (id) on delete set null,
  time_entry_id  uuid references public.time_entries (id) on delete set null,
  minutes        integer not null default 0 check (minutes between 0 and 1440),
  released_at    timestamptz,
  created_at     timestamptz not null default now(),
  check ((session_id is null) or (time_entry_id is null))
);
comment on table public.invoice_sources is 'Each coaching session or logged time an invoice was drawn from (065). One live invoice for each (voiding releases it), so nothing is invoiced twice.';
create unique index if not exists invoice_sources_session_once on public.invoice_sources (session_id) where session_id is not null and released_at is null;
create unique index if not exists invoice_sources_entry_once on public.invoice_sources (time_entry_id) where time_entry_id is not null and released_at is null;
create index if not exists invoice_sources_invoice_idx on public.invoice_sources (invoice_id);

create table if not exists public.org_billing_profiles (
  id                  uuid primary key default gen_random_uuid(),
  coach_id            uuid not null references public.coaches (id) on delete cascade,
  organisation_id     uuid not null references public.organisations (id) on delete cascade,
  legal_name          text check (char_length(legal_name) <= 200),
  billing_address     text check (char_length(billing_address) <= 500),
  invoices_email      text check (invoices_email is null or (char_length(invoices_email) <= 320 and invoices_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  supplier_number     text check (char_length(supplier_number) <= 80),
  needs_po            boolean not null default false,
  their_reference     text check (char_length(their_reference) <= 160),
  hourly_rate_minor   bigint check (hourly_rate_minor is null or hourly_rate_minor between 0 and 100000000),
  currency            text not null default 'GBP' check (public.currency_ok(currency)),
  terms_days          integer not null default 30 check (terms_days in (14, 30, 60)),
  timesheet           boolean not null default false,
  evidence_required   boolean not null default false,
  supplier_portal     boolean not null default false,
  portal_url          text check (portal_url is null or (char_length(portal_url) <= 500 and portal_url ~ '^https://[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+(:[0-9]{1,5})?(/[^\s"<>]*)?$')),
  stripe_customer_id  text check (char_length(stripe_customer_id) <= 200),
  bank_details        jsonb check (bank_details is null or (jsonb_typeof(bank_details) = 'object' and pg_column_size(bank_details) <= 4000)),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (coach_id, organisation_id)
);
comment on table public.org_billing_profiles is
  'An organisation''s billing profile (065): legal name, address, invoices email, supplier number, whether a PO is needed (the number is in 062''s purchase_orders), their reference, terms, timesheet, evidence, supplier portal. Stripe''s customer and its bank transfer details are the server''s to write.';

create table if not exists public.invoice_evidence (
  id               uuid primary key default gen_random_uuid(),
  coach_id         uuid not null references public.coaches (id) on delete cascade,
  organisation_id  uuid not null references public.organisations (id) on delete cascade,
  invoice_id       uuid references public.invoices (id) on delete set null,
  storage_path     text not null check (storage_path ~ '^[0-9a-f-]{36}/finances/evidence/[0-9a-f-]{36}-[A-Za-z0-9_.-]{1,120}$' and storage_path !~ '\.\.'),
  file_name        text not null check (char_length(btrim(file_name)) between 1 and 160),
  mime             text not null check (mime in ('image/png', 'image/jpeg', 'application/pdf')),
  bytes            integer not null check (bytes between 1 and 10485760),
  position         integer not null default 0 check (position between 0 and 1000),
  created_at       timestamptz not null default now()
);
comment on table public.invoice_evidence is 'A screenshot or PDF an organisation needs with an invoice (065), in the coach-files bucket; each becomes its own page(s) of the one PDF.';
create index if not exists invoice_evidence_org_idx on public.invoice_evidence (organisation_id, position);

create table if not exists public.talking_points (
  id          uuid primary key default gen_random_uuid(),
  coach_id    uuid not null references public.coaches (id) on delete cascade,
  moment      text not null check (moment in ('price', 'renew', 'extra', 'ending', 'testimonial')),
  lines       jsonb not null default '[]'::jsonb,
  tip         text check (char_length(tip) <= 300),
  updated_at  timestamptz not null default now(),
  unique (coach_id, moment),
  check (jsonb_typeof(lines) = 'array' and jsonb_array_length(lines) <= 5 and pg_column_size(lines) <= 4000)
);
comment on table public.talking_points is 'A coach''s own talking points for the five moments people go soft on (065): for the coach to say, never written to the client. The defaults are code (talkingPoints.js).';

create table if not exists public.needs_you_done (
  id         uuid primary key default gen_random_uuid(),
  coach_id   uuid not null references public.coaches (id) on delete cascade,
  item_key   text not null check (char_length(item_key) between 1 and 200),
  state      text not null default 'done' check (state in ('done', 'not_now')),
  until      date check (until is null or until between date '2000-01-01' and date '2100-12-31'),
  at         timestamptz not null default now(),
  unique (coach_id, item_key)
);
comment on table public.needs_you_done is 'Needs you items the coach has dealt with or put off (065), by their key. Undo deletes the row.';

create table if not exists public.fx_reference_rates (
  day            date not null check (day between date '2000-01-01' and date '2100-12-31'),
  currency       text not null check (public.currency_ok(currency) and currency <> 'GBP'),
  units_per_gbp  numeric(18, 8) not null check (units_per_gbp > 0 and units_per_gbp < 100000),
  source         text not null check (source in ('ECB', 'peg')),
  fetched_at     timestamptz not null default now(),
  primary key (day, currency)
);
comment on table public.fx_reference_rates is 'Daily reference rates (065): units of each currency to £1, from the European Central Bank''s daily list (and the dirham from its dollar peg), written by the nightly round. Read only through coach_fx_rates().';

-- ---------------------------------------------------------------- rights and rules
do $rules$
declare t text;
begin
  foreach t in array array['agreement_clause_standards', 'agreement_extras', 'agreement_quotes', 'agreement_link_opens', 'agreement_reminders',
                           'agreement_cancellations', 'invoice_sources', 'org_billing_profiles', 'invoice_evidence', 'talking_points',
                           'needs_you_done', 'quote_number_counter', 'sponsor_sign_links', 'sponsor_signatures', 'fx_reference_rates'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
  -- The coach's own, to keep.
  foreach t in array array['agreement_extras', 'org_billing_profiles', 'invoice_evidence', 'talking_points', 'needs_you_done'] loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('drop policy if exists "Coach alone" on public.%I', t);
    execute format('create policy "Coach alone" on public.%I for all to authenticated using (coach_id = (select public.my_coach_id())) with check (coach_id = (select public.my_coach_id()))', t);
  end loop;
  -- The server writes these; their coach reads them.
  foreach t in array array['agreement_link_opens', 'agreement_reminders', 'agreement_cancellations', 'invoice_sources'] loop
    execute format('grant select on public.%I to authenticated', t);
    execute format('drop policy if exists "Coach reads" on public.%I', t);
    execute format('create policy "Coach reads" on public.%I for select to authenticated using (coach_id = (select public.my_coach_id()))', t);
  end loop;
end
$rules$;

-- A billing profile or evidence only for an organisation the coach sees.
drop policy if exists "Coach alone" on public.org_billing_profiles;
create policy "Coach alone" on public.org_billing_profiles for all to authenticated
  using (coach_id = (select public.my_coach_id()))
  with check (coach_id = (select public.my_coach_id()) and exists (select 1 from public.organisations o where o.id = organisation_id));
drop policy if exists "Coach alone" on public.invoice_evidence;
create policy "Coach alone" on public.invoice_evidence for all to authenticated
  using (coach_id = (select public.my_coach_id()))
  with check (coach_id = (select public.my_coach_id()) and exists (select 1 from public.organisations o where o.id = organisation_id)
              and (invoice_id is null or exists (select 1 from public.invoices i where i.id = invoice_id and i.coach_id = (select public.my_coach_id()))));

-- Standard wording: every coach of the practice reads their own and the owner's; only the owner adds, and nobody
-- changes or removes a version once made (agreements link to it).
grant select, insert on public.agreement_clause_standards to authenticated;
drop policy if exists "Practice reads" on public.agreement_clause_standards;
create policy "Practice reads" on public.agreement_clause_standards for select to authenticated
  using ((select public.my_coach_id()) is not null
         and (coach_id = (select public.my_coach_id()) or coach_id in (select public.practice_owner_ids())));
drop policy if exists "Owner adds" on public.agreement_clause_standards;
create policy "Owner adds" on public.agreement_clause_standards for insert to authenticated
  with check (coach_id = (select public.my_coach_id()) and coalesce((select public.is_owner()), false)
              and (from_agreement is null or exists (select 1 from public.agreements a where a.id = from_agreement and a.coach_id = (select public.my_coach_id()))));

-- Quotes: the coach's own, on their own agreement's own version.
grant select, insert, update, delete on public.agreement_quotes to authenticated;
drop policy if exists "Coach alone, read" on public.agreement_quotes;
create policy "Coach alone, read" on public.agreement_quotes for select to authenticated using (coach_id = (select public.my_coach_id()));
drop policy if exists "Coach alone, remove" on public.agreement_quotes;
create policy "Coach alone, remove" on public.agreement_quotes for delete to authenticated using (coach_id = (select public.my_coach_id()) and status in ('draft', 'withdrawn'));
drop policy if exists "Coach alone, own agreement" on public.agreement_quotes;
create policy "Coach alone, own agreement" on public.agreement_quotes for insert to authenticated with check (
  coach_id = (select public.my_coach_id())
  and exists (select 1 from public.agreement_versions v join public.agreements a on a.id = v.agreement_id
              where v.id = agreement_quotes.version_id and a.id = agreement_quotes.agreement_id and a.coach_id = (select public.my_coach_id()))
  and (coach_signature_id is null or exists (select 1 from public.signatures s where s.id = coach_signature_id and s.user_id = (select auth.uid()))));
drop policy if exists "Coach alone, own agreement, change" on public.agreement_quotes;
create policy "Coach alone, own agreement, change" on public.agreement_quotes for update to authenticated
  using (coach_id = (select public.my_coach_id()))
  with check (coach_id = (select public.my_coach_id())
    and (coach_signature_id is null or exists (select 1 from public.signatures s where s.id = coach_signature_id and s.user_id = (select auth.uid()))));

-- A quote's number, link, sending and acceptance are the server's: a coach writing directly keeps a draft or withdraws.
create or replace function public.agreement_quotes_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.share_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
    new.number := null; new.sent_at := null; new.accepted_at := null; new.accepted_extras := null; new.accepted_choice := null;
    new.reopened_at := null; new.valid_until := null;
    if new.status <> 'draft' then
      raise exception 'A quote is sent from the Send button.' using errcode = '42501';
    end if;
    return new;
  end if;
  new.share_token := old.share_token; new.number := old.number; new.sent_at := old.sent_at; new.accepted_at := old.accepted_at;
  new.accepted_extras := old.accepted_extras; new.accepted_choice := old.accepted_choice; new.reopened_at := old.reopened_at;
  new.valid_until := old.valid_until; new.agreement_id := old.agreement_id; new.version_id := old.version_id; new.coach_id := old.coach_id;
  if new.status is distinct from old.status and not (new.status = 'withdrawn' and old.status in ('draft', 'sent', 'expired')) then
    raise exception 'A quote is sent and accepted through its own steps.' using errcode = '42501';
  end if;
  if old.status <> 'draft' and (new.valid_days is distinct from old.valid_days or new.coach_signature_id is distinct from old.coach_signature_id) then
    raise exception 'A quote that has been sent can''t change. Make a new one instead.' using errcode = '23514';
  end if;
  return new;
end;
$$;
drop trigger if exists agreement_quotes_guard on public.agreement_quotes;
create trigger agreement_quotes_guard before insert or update on public.agreement_quotes for each row execute function public.agreement_quotes_guard();

-- A billing profile's Stripe customer and bank transfer details are the server's to write.
create or replace function public.org_billing_profiles_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated' then
    if tg_op = 'INSERT' then
      new.stripe_customer_id := null; new.bank_details := null;
    else
      new.stripe_customer_id := old.stripe_customer_id; new.bank_details := old.bank_details;
      new.coach_id := old.coach_id; new.organisation_id := old.organisation_id;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists org_billing_profiles_guard on public.org_billing_profiles;
create trigger org_billing_profiles_guard before insert or update on public.org_billing_profiles for each row execute function public.org_billing_profiles_guard();

-- Talking points: up to 5 lines of up to 300 characters each.
create or replace function public.talking_points_ok()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from jsonb_array_elements(new.lines) e where jsonb_typeof(e) <> 'string' or char_length(e #>> '{}') not between 1 and 300) then
    raise exception 'Each talking point is one line of up to 300 characters.' using errcode = '23514';
  end if;
  return new;
end;
$$;
drop trigger if exists talking_points_ok on public.talking_points;
create trigger talking_points_ok before insert or update on public.talking_points for each row execute function public.talking_points_ok();

-- Every 065 table with updated_at moves it on each change (049's p1_touch), so the offline queue spots a stale tab.
do $t$
declare t text;
begin
  foreach t in array array['agreement_extras', 'agreement_quotes', 'org_billing_profiles', 'talking_points'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.p1_touch()', t || '_touch', t);
  end loop;
end
$t$;

-- =============================================================================
-- 4. The guards on 061's tables, made again with 065's columns
-- =============================================================================
-- A version is fixed once sent (061), now with its overrides, personal note and send_as too. Only the client signs
-- (061), only the server or a sponsor's link signs for a sponsor, and only the client's signing records start now and
-- the way of settling. A draft that is out as a quote is held as sent, and an agreement waiting for the owner's
-- approval is sent only once approved.
create or replace function public.agreement_versions_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_person boolean := current_user = 'authenticated';
  v_quoted boolean := false;
begin
  if tg_op = 'DELETE' then
    if v_person and old.status <> 'draft' then
      raise exception 'A version that has been sent is kept. Make a new version instead.' using errcode = '23514';
    end if;
    if v_person and exists (select 1 from public.agreement_quotes q where q.version_id = old.id and q.status not in ('draft', 'withdrawn')) then
      raise exception 'This version is out as a quote, so it is kept.' using errcode = '23514';
    end if;
    return old;
  end if;
  if v_person and (tg_op = 'INSERT' or new.coach_signature_id is distinct from old.coach_signature_id)
     and new.coach_signature_id is not null
     and not exists (select 1 from public.signatures s where s.id = new.coach_signature_id and s.user_id = (select auth.uid())) then
    raise exception 'Sign with your own signature.' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    if v_person and (new.status not in ('draft', 'sent') or new.client_signed_at is not null or new.client_signature_id is not null
         or new.signed_name is not null or new.signed_email is not null or new.signed_user_id is not null or new.fingerprint is not null) then
      raise exception 'Only the client signs their agreement.' using errcode = '42501';
    end if;
    if v_person and (new.start_now is not null or new.start_now_at is not null or new.settle_choice is not null
         or new.sponsor_signed_at is not null or new.sponsor_name is not null or new.sponsor_role is not null
         or new.sponsor_email is not null or new.sponsor_po is not null) then
      raise exception 'Only the person signing records that.' using errcode = '42501';
    end if;
    if v_person and new.status = 'sent'
       and exists (select 1 from public.agreements a where a.id = new.agreement_id and a.approval in ('waiting', 'changes_asked')) then
      raise exception 'This agreement is sent once it is approved.' using errcode = '42501';
    end if;
  else
    new.agreement_id := old.agreement_id; new.coach_id := old.coach_id; new.version := old.version;
    if old.status in ('sent', 'signed', 'superseded') and (new.terms is distinct from old.terms or new.clauses is distinct from old.clauses
         or new.currency is distinct from old.currency or new.fx_rate is distinct from old.fx_rate or new.fx_at is distinct from old.fx_at
         or new.total_minor is distinct from old.total_minor or new.funded_by is distinct from old.funded_by
         or new.overrides is distinct from old.overrides or new.personal_note is distinct from old.personal_note
         or new.send_as is distinct from old.send_as) then
      raise exception 'A version that has been sent can’t change. Make a new version instead.' using errcode = '23514';
    end if;
    if old.status = 'signed' and new.status <> 'signed' and new.status <> 'superseded' then
      raise exception 'A signed version stays signed.' using errcode = '23514';
    end if;
    if old.status = 'superseded' and new.status <> 'superseded' then
      raise exception 'A version that has been replaced stays replaced.' using errcode = '23514';
    end if;
    if old.client_signed_at is not null and (new.client_signed_at is distinct from old.client_signed_at or new.signed_name is distinct from old.signed_name
         or new.signed_email is distinct from old.signed_email or new.fingerprint is distinct from old.fingerprint
         or new.client_signature_id is distinct from old.client_signature_id or new.signed_user_id is distinct from old.signed_user_id
         or new.start_now is distinct from old.start_now or new.start_now_at is distinct from old.start_now_at
         or new.settle_choice is distinct from old.settle_choice) then
      raise exception 'A signing record never changes.' using errcode = '23514';
    end if;
    if old.sponsor_signed_at is not null and (new.sponsor_signed_at is distinct from old.sponsor_signed_at or new.sponsor_name is distinct from old.sponsor_name
         or new.sponsor_role is distinct from old.sponsor_role or new.sponsor_email is distinct from old.sponsor_email
         or new.sponsor_po is distinct from old.sponsor_po or new.fingerprint is distinct from old.fingerprint) then
      raise exception 'A signing record never changes.' using errcode = '23514';
    end if;
    if v_person then
      if new.client_signed_at is distinct from old.client_signed_at or new.client_signature_id is distinct from old.client_signature_id
         or new.signed_name is distinct from old.signed_name or new.signed_email is distinct from old.signed_email
         or new.signed_user_id is distinct from old.signed_user_id or new.fingerprint is distinct from old.fingerprint then
        raise exception 'Only the client signs their agreement.' using errcode = '42501';
      end if;
      if new.start_now is distinct from old.start_now or new.start_now_at is distinct from old.start_now_at
         or new.settle_choice is distinct from old.settle_choice or new.sponsor_signed_at is distinct from old.sponsor_signed_at
         or new.sponsor_name is distinct from old.sponsor_name or new.sponsor_role is distinct from old.sponsor_role
         or new.sponsor_email is distinct from old.sponsor_email or new.sponsor_po is distinct from old.sponsor_po then
        raise exception 'Only the person signing records that.' using errcode = '42501';
      end if;
      if not (new.status = old.status or (old.status = 'draft' and new.status = 'sent') or (old.status = 'sent' and new.status = 'superseded')) then
        raise exception 'Only the client signs their agreement.' using errcode = '42501';
      end if;
      if old.status <> 'draft' and (new.coach_signed_at is distinct from old.coach_signed_at or new.coach_signature_id is distinct from old.coach_signature_id
           or new.sent_at is distinct from old.sent_at or new.expires_on is distinct from old.expires_on) then
        raise exception 'A version that has been sent can’t change. Make a new version instead.' using errcode = '23514';
      end if;
      if old.status = 'draft' then
        select exists (select 1 from public.agreement_quotes q where q.version_id = old.id and q.status not in ('draft', 'withdrawn')) into v_quoted;
        if v_quoted and (new.status <> old.status or new.terms is distinct from old.terms or new.clauses is distinct from old.clauses
             or new.currency is distinct from old.currency or new.fx_rate is distinct from old.fx_rate or new.total_minor is distinct from old.total_minor
             or new.funded_by is distinct from old.funded_by or new.overrides is distinct from old.overrides
             or new.personal_note is distinct from old.personal_note or new.send_as is distinct from old.send_as) then
          raise exception 'This version is out as a quote, so it can’t change. Withdraw the quote or make a new version.' using errcode = '23514';
        end if;
        if new.status = 'sent'
           and exists (select 1 from public.agreements a where a.id = new.agreement_id and a.approval in ('waiting', 'changes_asked')) then
          raise exception 'This agreement is sent once it is approved.' using errcode = '42501';
        end if;
      end if;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists agreement_versions_guard on public.agreement_versions;
create trigger agreement_versions_guard before insert or update or delete on public.agreement_versions for each row execute function public.agreement_versions_guard();

-- The agreement (061's guard), with 065's: only the owner (through agreement_approve) or the server approves or asks
-- for changes; cancelling and running out are the server's; a team member's agreement hangs under the coach's own.
create or replace function public.agreements_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_person boolean := current_user = 'authenticated';
  v_sent boolean;
begin
  if not v_person then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'DELETE' then
    if exists (select 1 from public.agreement_versions v where v.agreement_id = old.id and v.status <> 'draft') then
      raise exception 'An agreement that has been sent is kept.' using errcode = '23514';
    end if;
    return old;
  end if;
  if new.team_parent_id is not null and (tg_op = 'INSERT' or new.team_parent_id is distinct from old.team_parent_id)
     and not exists (select 1 from public.agreements p where p.id = new.team_parent_id and p.coach_id = (select public.my_coach_id())) then
    raise exception 'That team agreement isn’t yours.' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    if new.status not in ('draft', 'sent') then
      raise exception 'Only the client signs their agreement.' using errcode = '42501';
    end if;
    if new.approval not in ('not_needed', 'waiting') or new.approved_by is not null or new.approved_at is not null or new.approval_note is not null then
      raise exception 'The owner approves an agreement.' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.status = 'signed' and old.status <> 'signed' then
    raise exception 'Only the client signs their agreement.' using errcode = '42501';
  end if;
  if new.status is distinct from old.status and (new.status in ('cancelled', 'expired') or old.status in ('cancelled', 'expired')) then
    raise exception 'That happens through its own step.' using errcode = '42501';
  end if;
  -- A coach asks (again, for a new version after approval or after changes were asked for); only the owner answers, and
  -- once asked it never goes back to "not needed", so an agreement that waits is sent only once approved.
  if new.approval is distinct from old.approval and new.approval <> 'waiting' then
    raise exception 'The owner approves an agreement.' using errcode = '42501';
  end if;
  new.approved_by := old.approved_by; new.approved_at := old.approved_at;
  if new.approval_note is distinct from old.approval_note then
    new.approval_note := old.approval_note;
  end if;
  new.coach_id := old.coach_id;
  select exists (select 1 from public.agreement_versions v where v.agreement_id = old.id and v.status <> 'draft') into v_sent;
  if v_sent then
    new.profile_id := old.profile_id; new.organisation_id := old.organisation_id; new.kind := old.kind; new.agreement_kind := old.agreement_kind;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists agreements_guard on public.agreements;
create trigger agreements_guard before insert or update or delete on public.agreements for each row execute function public.agreements_guard();

-- =============================================================================
-- 5. What a client reads: my_agreements() and the PDF's source, one shape
-- =============================================================================
-- The version as its client sees it (061's shape, with 065's own keys). An organisation-funded client's terms keep
-- only the keys on this list, so no money key, named or not, ever reaches them; their clauses lose the money ones.
-- Never any opens (Opened is the coach's alone). Asked only by my_agreements() and agreement_pdf_source().
create or replace function public._agreement_client_view(p_version uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
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
                                          'expensesAllowed', 'sponsor',
                                          -- 065: the non-money parts of the new terms
                                          'kind', 'blocks', 'place', 'level', 'noticeHours', 'pausing', 'work'])) end,
      'clauses', case when v.funded_by is null then v.clauses
                 else (select coalesce(jsonb_agg(c), '[]'::jsonb) from jsonb_array_elements(v.clauses) c where coalesce(c->>'money', 'false') <> 'true') end,
      'changes', v.changes, 'signed_name', v.signed_name, 'signed_email', v.signed_email, 'fingerprint', v.fingerprint,
      'client_signature_id', v.client_signature_id,
      -- 065
      'agreement_kind', a.agreement_kind, 'send_as', v.send_as, 'personal_note', v.personal_note, 'expires_on', v.expires_on,
      'start_now', v.start_now, 'start_now_at', v.start_now_at, 'settle_choice', case when v.funded_by is null then v.settle_choice end,
      'change_pending', (select jsonb_build_object('clause_key', r.clause_key,
                                 'title', coalesce((select nullif(concat_ws('. ', c->>'number', c->>'title'), '')
                                                     from jsonb_array_elements(v.clauses) c where c->>'key' = r.clause_key limit 1), ''),
                                 'asked_at', r.created_at)
                         from public.agreement_change_requests r
                         where r.version_id = v.id and r.answered_at is null and v.status = 'sent' and v.version = a.current_version
                         order by r.created_at desc limit 1))
  from public.agreement_versions v
  join public.agreements a on a.id = v.agreement_id
  where v.id = p_version;
$$;
revoke all on function public._agreement_client_view(uuid) from public, anon, authenticated, service_role;

create or replace function public.my_agreements()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Sign in to carry on.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(public._agreement_client_view(v.id) order by a.created_at desc, v.version desc)
    from public.agreements a
    join public.client_profiles p on p.id = a.profile_id
    join public.agreement_versions v on v.agreement_id = a.id
    where a.kind = 'coaching' and p.user_id = v_user and v.status in ('sent', 'signed', 'superseded')
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.my_agreements() from public, anon;
grant execute on function public.my_agreements() to authenticated;

-- 064's PDF source, with the version in exactly my_agreements()' shape (064's test B2c).
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
    'version', public._agreement_client_view(v.id),
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

-- =============================================================================
-- 6. Signing, version 2
-- =============================================================================
-- 061's sign_agreement stays for pages from before 065. This one also: waits while a change asked for on this version is
-- unanswered; refuses a version past its "runs out" day; records the "Start my coaching straight away" tick for a
-- self-funded client (with its time when ticked); records the way of settling where the agreement offers a choice
-- (up front is the starting choice).
create or replace function public.sign_agreement_v2(p_version uuid, p_name text, p_signature uuid, p_fingerprint text,
                                                    p_start_now boolean default false, p_choice text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_email text;
  v_confirmed timestamptz;
  v record;
  v_sig record;
  v_now timestamptz := now();
  v_print text;
  v_name text;
  v_self boolean;
  v_offered boolean;
  v_choice text;
  v_zone text;
begin
  if v_user is null then raise exception 'Sign in to carry on.' using errcode = '42501'; end if;
  select u.email, u.email_confirmed_at into v_email, v_confirmed from auth.users u where u.id = v_user;
  if v_confirmed is null then raise exception 'Confirm your email address to sign.' using errcode = '42501'; end if;
  select ver.*, a.current_version, a.profile_id as a_profile, a.kind as a_kind, a.agreement_kind as a_agreement_kind, a.status as a_status,
         p.user_id as client_user, a.coach_id as a_coach, p.coach_id as p_coach, p.time_zone as p_zone
    into v
    from public.agreement_versions ver
    join public.agreements a on a.id = ver.agreement_id
    join public.client_profiles p on p.id = a.profile_id
    where ver.id = p_version
    for update of ver;
  if not found or v.client_user is distinct from v_user or v.a_kind <> 'coaching' or v.a_coach is distinct from v.p_coach then
    raise exception 'That agreement isn’t yours to sign.' using errcode = '42501';
  end if;
  if v.status = 'signed' then
    raise exception 'This agreement is already signed.' using errcode = 'CC409';
  end if;
  if v.status <> 'sent' or v.coach_signed_at is null or v.version <> v.current_version or v.a_status in ('cancelled', 'expired') then
    raise exception 'This version can’t be signed. Open the newest one.' using errcode = 'CC409';
  end if;
  v_zone := coalesce(nullif(v.p_zone, ''), 'Europe/London');
  if v.expires_on is not null and v.expires_on < (v_now at time zone v_zone)::date then
    raise exception 'This agreement has run out. Ask your coach to open it again.' using errcode = 'CC409';
  end if;
  if exists (select 1 from public.agreement_change_requests r where r.version_id = p_version and r.answered_at is null) then
    raise exception 'You asked for a change to this agreement. Your coach will send you a new version to sign.' using errcode = 'CC409';
  end if;
  v_print := public.agreement_fingerprint(p_version);
  if p_fingerprint is distinct from v_print then
    raise exception 'This agreement changed since you opened it. Open it again to read the newest version.' using errcode = 'CC409';
  end if;
  v_name := btrim(regexp_replace(coalesce(p_name, ''), '[' || U&'\200B-\200F\202A-\202E\2060-\2069\FEFF\00AD' || ']', '', 'g'));
  if char_length(v_name) < 3 or char_length(v_name) > 160 or v_name !~ '[[:alpha:]]' or v_name ~ '[<>{}]' then
    raise exception 'Type your full name to sign.' using errcode = '22023';
  end if;
  select * into v_sig from public.signatures s where s.id = p_signature and s.user_id = v_user;
  if not found then raise exception 'Use your signature to sign.' using errcode = '22023'; end if;

  v_self := v.funded_by is null;
  -- A choice between up front (5% off) and the plan is offered to a self-funded client when the coach left the offer
  -- on: a retainer, or set sessions settled any way but in full.
  v_offered := v_self and coalesce((v.terms ->> 'offerUpfront')::boolean, true)
    and (coalesce(v.terms ->> 'kind', v.a_agreement_kind) = 'retainer'
         or (coalesce(v.terms ->> 'kind', v.a_agreement_kind) = 'sessions' and coalesce(v.terms ->> 'settle', 'equal') <> 'full'));
  v_choice := case when v_offered then coalesce(case when p_choice in ('upfront', 'plan') then p_choice end, 'upfront') end;

  update public.agreement_versions set status = 'signed', client_signed_at = v_now, client_signature_id = v_sig.id,
    signed_name = v_name, signed_email = v_email, signed_user_id = v_user, fingerprint = v_print,
    start_now = case when v_self then coalesce(p_start_now, false) end,
    start_now_at = case when v_self and coalesce(p_start_now, false) then v_now end,
    settle_choice = v_choice
  where id = p_version;
  update public.agreement_versions set status = 'superseded' where agreement_id = v.agreement_id and id <> p_version and status in ('sent', 'signed');
  update public.agreements set status = 'signed', updated_at = v_now where id = v.agreement_id;
  insert into public.coach_notifications (coach_id, kind, title, detail, item_kind, item_id)
  select v.coach_id, 'agreement', p.name || ' signed their agreement', left(coalesce(v.terms->>'coaching', ''), 240), 'client', p.id
  from public.client_profiles p where p.id = v.a_profile;
  return jsonb_build_object('signed_at', v_now, 'fingerprint', v_print, 'version', v.version, 'start_now', case when v_self then coalesce(p_start_now, false) end,
                            'settle_choice', v_choice, 'self_funded', v_self);
end;
$$;
revoke all on function public.sign_agreement_v2(uuid, text, uuid, text, boolean, text) from public, anon;
grant execute on function public.sign_agreement_v2(uuid, text, uuid, text, boolean, text) to authenticated;

-- The client's agreement page records its first open (the coach's Sent, Opened, Signed, Settled). Their own sent
-- version only; nothing comes back, and nothing at all for anyone else's.
create or replace function public.agreement_mark_opened(p_version uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    return;
  end if;
  insert into public.agreement_link_opens (coach_id, version_id, who)
  select v.coach_id, v.id, 'client'
  from public.agreement_versions v
  join public.agreements a on a.id = v.agreement_id
  join public.client_profiles p on p.id = a.profile_id
  where v.id = p_version and p.user_id = v_user and a.kind = 'coaching' and v.status in ('sent', 'signed')
  on conflict do nothing;
end;
$$;
revoke all on function public.agreement_mark_opened(uuid) from public, anon;
grant execute on function public.agreement_mark_opened(uuid) to authenticated;

-- =============================================================================
-- 7. Quotes
-- =============================================================================
-- The quote's number, given now if it has none: the server calls this as the quote is sent. A second call gives the same.
create or replace function public.quote_take_number(p_quote uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_number integer;
begin
  select q.number into v_number from public.agreement_quotes q where q.id = p_quote for update;
  if not found then
    raise exception 'That quote isn''t there.' using errcode = 'P0002';
  end if;
  if v_number is not null then
    return v_number;
  end if;
  update public.quote_number_counter set next_number = next_number + 1 where id returning next_number - 1 into v_number;
  update public.agreement_quotes set number = v_number where id = p_quote;
  return v_number;
end;
$$;
revoke all on function public.quote_take_number(uuid) from public, anon, authenticated;
grant execute on function public.quote_take_number(uuid) to service_role;

-- A quote's private link: its own figures, wording and extras, its number and the coach's first name, while it is
-- sent and not past its day (London). The first open is recorded for the coach (each later one changes nothing). An
-- accepted quote says so and names the agreement's version to sign; one that has run out says only that, and whose.
create or replace function public.quote_open(p_token text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  q record;
  v_today date := (now() at time zone 'Europe/London')::date;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    return null;
  end if;
  select qq.*, v.terms, v.clauses, v.currency, v.fx_rate, v.total_minor, v.personal_note, v.version, c.display_first_name as coach_first
    into q
    from public.agreement_quotes qq
    join public.agreement_versions v on v.id = qq.version_id
    join public.coaches c on c.id = qq.coach_id
   where qq.share_token = p_token and qq.status in ('sent', 'accepted', 'expired');
  if not found then
    return null;
  end if;
  if q.status = 'expired' or (q.status = 'sent' and q.valid_until is not null and q.valid_until < v_today) then
    return jsonb_build_object('state', 'expired', 'coach_first', left(coalesce(q.coach_first, ''), 60), 'number', q.number);
  end if;
  if q.status = 'accepted' then
    return jsonb_build_object('state', 'accepted', 'coach_first', left(coalesce(q.coach_first, ''), 60), 'number', q.number,
                              'version_id', q.version_id);
  end if;
  insert into public.agreement_link_opens (coach_id, quote_id, version_id, who) values (q.coach_id, q.id, q.version_id, 'quote')
  on conflict do nothing;
  return jsonb_build_object('state', 'open', 'number', q.number, 'valid_until', q.valid_until, 'sent_at', q.sent_at,
    'coach_first', left(coalesce(q.coach_first, ''), 60), 'personal_note', q.personal_note, 'version', q.version,
    'terms', q.terms, 'clauses', q.clauses, 'currency', q.currency, 'fx_rate', q.fx_rate, 'total_minor', q.total_minor);
end;
$$;
revoke all on function public.quote_open(text) from public;
grant execute on function public.quote_open(text) to anon, authenticated, service_role;

-- Accepting a quote (the server's, from the quote page's Accept): once, while open; the extras only among those
-- offered; the choice only where offered. The server works out the wording and the total with the extras and the
-- choice (src/lib/agreements), so they come in here; the quote's version then becomes the agreement, signed by the
-- coach with the quote's signature, sent, and ready for the client to sign. Hands back the version's id.
create or replace function public.quote_accept(p_token text, p_extras text[], p_choice text, p_clauses jsonb, p_total_minor bigint)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  q record;
  v_now timestamptz := now();
  v_today date := (now() at time zone 'Europe/London')::date;
  v_offered text[];
  v_extras text[] := coalesce(p_extras, '{}');
  v_choice text;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    raise exception 'That quote isn''t there.' using errcode = 'P0002';
  end if;
  select qq.*, v.terms, v.status as v_status, v.funded_by, a.status as a_status
    into q
    from public.agreement_quotes qq
    join public.agreement_versions v on v.id = qq.version_id
    join public.agreements a on a.id = qq.agreement_id
   where qq.share_token = p_token
   for update of qq;
  if not found then
    raise exception 'That quote isn''t there.' using errcode = 'P0002';
  end if;
  if q.status = 'accepted' then
    raise exception 'This quote is already accepted.' using errcode = 'CC409';
  end if;
  if q.status <> 'sent' or (q.valid_until is not null and q.valid_until < v_today) or q.v_status <> 'draft' then
    raise exception 'This quote has run out. Ask your coach to open it again.' using errcode = 'CC409';
  end if;
  if jsonb_typeof(p_clauses) is distinct from 'array' or jsonb_array_length(p_clauses) = 0 or pg_column_size(p_clauses) > 60000
     or p_total_minor is null or p_total_minor not between 0 and 100000000 then
    raise exception 'The quote couldn''t be turned into the agreement.' using errcode = '22023';
  end if;
  select coalesce(array_agg(e ->> 'key'), '{}') into v_offered from jsonb_array_elements(coalesce(q.terms -> 'extrasOffered', '[]'::jsonb)) e;
  if cardinality(v_extras) > 20 or exists (select 1 from unnest(v_extras) x where not x = any (v_offered)) then
    raise exception 'Only the extras offered can be chosen.' using errcode = '22023';
  end if;
  v_choice := case when q.funded_by is null and coalesce((q.terms ->> 'offerUpfront')::boolean, true) and p_choice in ('upfront', 'plan')
                   then p_choice end;
  update public.agreement_versions
     set terms = terms || jsonb_build_object('extrasChosen', to_jsonb(v_extras), 'choice', v_choice),
         clauses = p_clauses, total_minor = p_total_minor, send_as = 'agreement', status = 'sent',
         coach_signed_at = v_now, coach_signature_id = coalesce(q.coach_signature_id, coach_signature_id), sent_at = v_now,
         expires_on = v_today + coalesce(nullif(q.terms ->> 'expiryDays', '')::integer, 30)
   where id = q.version_id;
  update public.agreements set status = 'sent', current_version = (select v.version from public.agreement_versions v where v.id = q.version_id),
    updated_at = v_now where id = q.agreement_id and status in ('draft', 'sent', 'expired');
  update public.agreement_quotes set status = 'accepted', accepted_at = v_now, accepted_extras = v_extras, accepted_choice = v_choice
   where id = q.id;
  return q.version_id;
end;
$$;
revoke all on function public.quote_accept(text, text[], text, jsonb, bigint) from public, anon, authenticated;
grant execute on function public.quote_accept(text, text[], text, jsonb, bigint) to service_role;

-- =============================================================================
-- 8. Sponsors
-- =============================================================================
-- A sponsor's link: the sponsor agreement's own figures and wording (the sponsor sees money), their name and role,
-- the organisation's name and the coach's first name, while the link is open. The first open is recorded.
create or replace function public.sponsor_link_open(p_token text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  l record;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    return null;
  end if;
  select sl.*, v.terms, v.clauses, v.currency, v.fx_rate, v.total_minor, v.status as v_status, v.version, v.sponsor_signed_at,
         v.personal_note, o.name as org_name, c.display_first_name as coach_first
    into l
    from public.sponsor_sign_links sl
    join public.agreement_versions v on v.id = sl.version_id
    join public.agreements a on a.id = sl.agreement_id and a.kind = 'sponsor'
    left join public.organisations o on o.id = a.organisation_id
    join public.coaches c on c.id = sl.coach_id
   where sl.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  if not found then
    return null;
  end if;
  if l.sponsor_signed_at is not null then
    return jsonb_build_object('state', 'signed', 'signed_at', l.sponsor_signed_at, 'coach_first', left(coalesce(l.coach_first, ''), 60),
                              'org_name', l.org_name, 'version_id', l.version_id);
  end if;
  if l.ended_at is not null or l.expires_at <= now() or l.v_status <> 'sent' then
    return jsonb_build_object('state', 'ended', 'coach_first', left(coalesce(l.coach_first, ''), 60));
  end if;
  insert into public.agreement_link_opens (coach_id, version_id, who) values (l.coach_id, l.version_id, 'sponsor') on conflict do nothing;
  return jsonb_build_object('state', 'open', 'version_id', l.version_id, 'version', l.version, 'sponsor_name', l.sponsor_name,
    'sponsor_role', l.sponsor_role, 'org_name', l.org_name, 'coach_first', left(coalesce(l.coach_first, ''), 60),
    'personal_note', l.personal_note, 'terms', l.terms, 'clauses', l.clauses, 'currency', l.currency, 'fx_rate', l.fx_rate,
    'total_minor', l.total_minor, 'needs_po', coalesce((l.terms ->> 'needsPO')::boolean, false),
    -- 061's fingerprint, worked out the same way here (agreement_fingerprint answers nobody signed out).
    'fingerprint', encode(sha256(convert_to(l.terms::text || '|' || l.clauses::text || '|' || l.currency || '|' || coalesce(l.fx_rate::text, ''), 'UTF8')), 'hex'));
end;
$$;
revoke all on function public.sponsor_link_open(text) from public;
grant execute on function public.sponsor_link_open(text) to anon, authenticated, service_role;

-- The sponsor signs (the server's, from the signing page): by the link, while open, the sponsor version only, unchanged
-- since it was read, with a real name, the PO where one is needed, and a drawn or typed signature. Once only; the
-- link ends with it.
create or replace function public.sponsor_sign(p_token text, p_name text, p_role text, p_po text, p_image text, p_typed text, p_fingerprint text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  l record;
  v_now timestamptz := now();
  v_name text;
  v_print text;
  v_po text := nullif(btrim(coalesce(p_po, '')), '');
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    raise exception 'That link isn''t working.' using errcode = 'P0002';
  end if;
  select sl.*, v.status as v_status, v.coach_signed_at, v.version, v.terms, v.sponsor_signed_at, a.current_version
    into l
    from public.sponsor_sign_links sl
    join public.agreement_versions v on v.id = sl.version_id
    join public.agreements a on a.id = sl.agreement_id and a.kind = 'sponsor'
   where sl.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
   for update of sl;
  if not found then
    raise exception 'That link isn''t working.' using errcode = 'P0002';
  end if;
  if l.sponsor_signed_at is not null then
    raise exception 'This agreement is already signed.' using errcode = 'CC409';
  end if;
  if l.ended_at is not null or l.expires_at <= v_now or l.v_status <> 'sent' or l.coach_signed_at is null or l.version <> l.current_version then
    raise exception 'That link isn''t working.' using errcode = 'CC409';
  end if;
  v_print := public.agreement_fingerprint(l.version_id);
  if p_fingerprint is distinct from v_print then
    raise exception 'This agreement changed since you opened it. Open it again to read the newest version.' using errcode = 'CC409';
  end if;
  v_name := btrim(regexp_replace(coalesce(p_name, ''), '[' || U&'\200B-\200F\202A-\202E\2060-\2069\FEFF\00AD' || ']', '', 'g'));
  if char_length(v_name) < 3 or char_length(v_name) > 160 or v_name !~ '[[:alpha:]]' or v_name ~ '[<>{}]' then
    raise exception 'Type your full name to sign.' using errcode = '22023';
  end if;
  if coalesce((l.terms ->> 'needsPO')::boolean, false) and v_po is null then
    raise exception 'Add the purchase order number to sign.' using errcode = '22023';
  end if;
  if v_po is not null and (char_length(v_po) > 100 or v_po ~ '[<>{}]') then
    raise exception 'Check the purchase order number.' using errcode = '22023';
  end if;
  if (p_image is null) = (nullif(btrim(coalesce(p_typed, '')), '') is null) then
    raise exception 'Draw or type your signature.' using errcode = '22023';
  end if;
  insert into public.sponsor_signatures (coach_id, version_id, image, typed_name)
  values (l.coach_id, l.version_id, p_image, nullif(btrim(coalesce(p_typed, '')), ''));
  update public.agreement_versions set status = 'signed', sponsor_signed_at = v_now, sponsor_name = v_name,
    sponsor_role = left(nullif(btrim(coalesce(p_role, l.sponsor_role, '')), ''), 120), sponsor_email = l.sponsor_email,
    sponsor_po = v_po, fingerprint = v_print
  where id = l.version_id;
  update public.agreement_versions set status = 'superseded' where agreement_id = l.agreement_id and id <> l.version_id and status in ('sent', 'signed');
  update public.agreements set status = 'signed', updated_at = v_now where id = l.agreement_id;
  update public.sponsor_sign_links set ended_at = v_now where agreement_id = l.agreement_id and ended_at is null;
  insert into public.coach_notifications (coach_id, kind, title, detail, item_kind, item_id)
  select l.coach_id, 'agreement', v_name || ' signed for ' || coalesce(o.name, 'their organisation'), left(coalesce(l.terms->>'coaching', ''), 240), 'organisation', o.id
  from public.agreements a left join public.organisations o on o.id = a.organisation_id where a.id = l.agreement_id;
  return jsonb_build_object('signed_at', v_now, 'version_id', l.version_id, 'fingerprint', v_print);
end;
$$;
revoke all on function public.sponsor_sign(text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.sponsor_sign(text, text, text, text, text, text, text) to service_role;

-- =============================================================================
-- 9. A block of hours, for its client
-- =============================================================================
-- The caller's own signed hours agreements: what is being built, the block in minutes, and each piece of time logged
-- (the day in the client's zone, the minutes, what it was for), with the minutes used. The rate and the block's money
-- only for a client who settles it themselves.
create or replace function public.my_hours()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Sign in to carry on.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'agreement_id', a.id, 'version_id', v.id, 'work', coalesce(v.terms #>> '{hours,work}', v.terms ->> 'work'),
      'block_minutes', case when coalesce((v.terms #>> '{hours,rateMinor}')::numeric, 0) > 0
                            then floor((v.terms #>> '{hours,blockMinor}')::numeric * 60 / (v.terms #>> '{hours,rateMinor}')::numeric)::integer end,
      'rate_minor', case when v.funded_by is null then (v.terms #>> '{hours,rateMinor}')::bigint end,
      'block_minor', case when v.funded_by is null then (v.terms #>> '{hours,blockMinor}')::bigint end,
      'currency', case when v.funded_by is null then v.currency end,
      'used_minutes', coalesce((select sum(greatest(0, round(extract(epoch from (t.ended_at - t.started_at)) / 60)))::integer
                                  from public.time_entries t where t.engagement_id = a.engagement_id and t.ended_at is not null), 0),
      'entries', coalesce((select jsonb_agg(jsonb_build_object(
                    'day', (t.started_at at time zone coalesce(nullif(p.time_zone, ''), 'Europe/London'))::date,
                    'minutes', greatest(0, round(extract(epoch from (t.ended_at - t.started_at)) / 60))::integer,
                    'note', t.note) order by t.started_at desc)
                  from public.time_entries t where t.engagement_id = a.engagement_id and t.ended_at is not null), '[]'::jsonb))
      order by a.created_at desc)
    from public.agreements a
    join public.client_profiles p on p.id = a.profile_id
    join public.agreement_versions v on v.agreement_id = a.id and v.version = a.current_version and v.status = 'signed'
    where p.user_id = v_user and a.kind = 'coaching' and a.agreement_kind = 'hours'
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.my_hours() from public, anon;
grant execute on function public.my_hours() to authenticated;

-- =============================================================================
-- 10. The owner approves an associate's agreement
-- =============================================================================
create or replace function public.agreement_for_approval(p_agreement uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r jsonb;
begin
  if not public.coach_code_ok() or not coalesce(public.is_owner(), false) then
    raise exception 'Only the owner can do this.' using errcode = '42501';
  end if;
  select jsonb_build_object('agreement_id', a.id, 'agreement_kind', a.agreement_kind, 'approval', a.approval, 'approval_note', a.approval_note,
           'coach_first', c.display_first_name, 'client_name', p.name, 'organisation_name', o.name,
           'version_id', v.id, 'version', v.version, 'terms', v.terms, 'overrides', v.overrides, 'clauses', v.clauses,
           'currency', v.currency, 'total_minor', v.total_minor, 'funded_by', v.funded_by)
    into r
    from public.agreements a
    join public.coaches c on c.id = a.coach_id and c.role <> 'owner'
    left join public.client_profiles p on p.id = a.profile_id
    left join public.organisations o on o.id = a.organisation_id
    left join public.agreement_versions v on v.agreement_id = a.id and v.version = a.current_version
   where a.id = p_agreement and a.approval in ('waiting', 'changes_asked', 'approved');
  return r;
end;
$$;
revoke all on function public.agreement_for_approval(uuid) from public, anon;
grant execute on function public.agreement_for_approval(uuid) to authenticated;

create or replace function public.agreement_approve(p_agreement uuid, p_ok boolean, p_note text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid;
  a record;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not public.coach_code_ok() or not coalesce(public.is_owner(), false) then
    raise exception 'Only the owner can do this.' using errcode = '42501';
  end if;
  v_me := public.my_coach_id();
  select ag.id, ag.approval, c.role into a
    from public.agreements ag join public.coaches c on c.id = ag.coach_id
   where ag.id = p_agreement for update of ag;
  if not found or a.role = 'owner' then
    raise exception 'That agreement isn’t waiting for you.' using errcode = '42501';
  end if;
  if a.approval <> 'waiting' then
    raise exception 'That agreement isn’t waiting for approval.' using errcode = 'CC409';
  end if;
  if not coalesce(p_ok, false) and v_note is null then
    raise exception 'Say what you’d like changed.' using errcode = '22023';
  end if;
  update public.agreements set approval = case when coalesce(p_ok, false) then 'approved' else 'changes_asked' end,
    approval_note = left(v_note, 1000), approved_by = case when coalesce(p_ok, false) then v_me end,
    approved_at = case when coalesce(p_ok, false) then now() end, updated_at = now()
   where id = p_agreement;
  return jsonb_build_object('approval', case when coalesce(p_ok, false) then 'approved' else 'changes_asked' end);
end;
$$;
revoke all on function public.agreement_approve(uuid, boolean, text) from public, anon;
grant execute on function public.agreement_approve(uuid, boolean, text) to authenticated;

-- =============================================================================
-- 11. Reference rates, sessions and the Fathom mark
-- =============================================================================
-- The newest day's reference rates, for a coach with the code: { day, rates: { EUR: 1.19, ... } } (units to £1).
create or replace function public.coach_fx_rates()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_day date;
begin
  if not public.coach_code_ok() or public.my_coach_id() is null then
    raise exception 'Only a coach can do this.' using errcode = '42501';
  end if;
  select max(day) into v_day from public.fx_reference_rates;
  if v_day is null then
    return jsonb_build_object('day', null, 'rates', '{}'::jsonb);
  end if;
  return jsonb_build_object('day', v_day, 'rates', (select jsonb_object_agg(r.currency, r.units_per_gbp) from public.fx_reference_rates r where r.day = v_day));
end;
$$;
revoke all on function public.coach_fx_rates() from public, anon;
grant execute on function public.coach_fx_rates() to authenticated;

-- A coaching session's Fathom summary marks it as happened (Phase 6c wires the summary in). Only when nothing was said
-- yet, or Fathom said it: the coach's own choice always stands. The server's alone.
create or replace function public.session_mark_from_fathom(p_session uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.coach_sessions set outcome = 'held', outcome_source = 'fathom', outcome_at = now(), moved_to = null, waived = false
   where id = p_session and (outcome is null or outcome_source = 'fathom');
  return found;
end;
$$;
revoke all on function public.session_mark_from_fathom(uuid) from public, anon, authenticated;
grant execute on function public.session_mark_from_fathom(uuid) to service_role;

-- Who said what happened at a session: the coach when they choose (a choice made directly is always the coach's), and
-- a self-funded client who didn't tick "Start my coaching straight away" has no coaching session inside their 14 days
-- (brief item 12; the client's own booking, the coach's and the server's alike: risk 29).
create or replace function public.coach_sessions_065()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  w record;
begin
  if current_user = 'authenticated' then
    if tg_op = 'INSERT' then
      new.outcome_source := case when new.outcome is not null then 'coach' end;
      new.outcome_at := case when new.outcome is not null then now() end;
    elsif new.outcome is distinct from old.outcome then
      new.outcome_source := case when new.outcome is not null then 'coach' end;
      new.outcome_at := case when new.outcome is not null then now() end;
    else
      new.outcome_source := old.outcome_source; new.outcome_at := old.outcome_at;
    end if;
  end if;
  if new.profile_id is not null and new.kind not in ('chemistry', 'other')
     and (tg_op = 'INSERT' or new.starts_at is distinct from old.starts_at or new.kind is distinct from old.kind or new.profile_id is distinct from old.profile_id) then
    select p.name, v.client_signed_at, (v.client_signed_at at time zone coalesce(nullif(p.time_zone, ''), 'Europe/London'))::date + 15 as bookable,
           coalesce(nullif(p.time_zone, ''), 'Europe/London') as zone
      into w
      from public.agreements a
      join public.client_profiles p on p.id = a.profile_id
      join public.agreement_versions v on v.agreement_id = a.id and v.version = a.current_version
     where a.profile_id = new.profile_id and a.kind = 'coaching' and a.status = 'signed'
       and v.status = 'signed' and v.funded_by is null and v.start_now is false
       and v.client_signed_at > now() - interval '16 days'
     order by v.client_signed_at desc
     limit 1;
    if found and new.starts_at < (w.bookable::timestamp at time zone w.zone) then
      raise exception '%', 'That’s inside ' || split_part(btrim(coalesce(w.name, 'the client')), ' ', 1) || '’s 14 days to change their mind. Book it from '
        || to_char(w.bookable, 'Dy FMDD Mon') || '.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.coach_sessions_065() from public, anon, authenticated;
drop trigger if exists coach_sessions_065 on public.coach_sessions;
create trigger coach_sessions_065 before insert or update on public.coach_sessions for each row execute function public.coach_sessions_065();

-- =============================================================================
-- 12. 054's list, with 065's tables
-- =============================================================================
create or replace function public.coach_code_tables()
returns table(table_name text, kind text)
language sql
immutable
set search_path = ''
as $$
  select t.table_name, t.kind from (values
    -- 026 and 035, the older coach tables
    ('coaches', 'own_coach_row'),
    ('coach_clients', 'own_client_id'),
    ('coach_away', 'coach'),
    ('client_suggestions', 'own_client_id'),
    -- 049
    ('coach_settings', 'coach'), ('coach_profiles', 'coach'),
    ('client_profiles', 'own_profile_row'), ('client_profile_coaches', 'coach'),
    ('client_about', 'coach'), ('client_notes', 'coach'),
    ('client_files', 'own_profile'), ('client_view_requests', 'own_profile'),
    ('client_merges', 'coach'), ('coach_cover', 'coach'),
    ('coach_tags', 'coach'), ('coach_tag_links', 'coach'), ('coach_fields', 'coach'), ('coach_field_values', 'coach'),
    ('coach_views', 'coach'), ('organisation_contacts', 'coach'), ('organisation_documents', 'coach'),
    ('coach_groups', 'coach'), ('coach_group_members', 'coach'),
    ('engagements', 'coach'), ('engagement_packs', 'coach'), ('engagement_projects', 'coach'), ('time_entries', 'coach'),
    ('workshops', 'coach'), ('workshop_attendees', 'coach'), ('workshop_materials', 'coach'), ('workshop_survey_answers', 'coach'),
    ('activity_log', 'coach'), ('data_requests', 'coach'), ('coach_notifications', 'coach'),
    -- 050
    ('coach_todo_lists', 'coach'), ('coach_todo_headings', 'coach'), ('coach_todos', 'coach'),
    ('coach_days', 'coach'), ('coach_weeks', 'coach'),
    ('coach_sessions', 'coach'), ('coach_session_people', 'coach'), ('coach_session_actions', 'coach'), ('coach_session_notes', 'coach'),
    ('session_prep', 'own_user_id'), ('workshop_sends', 'coach'),
    -- 051
    ('coach_call_types', 'coach'), ('coach_polls', 'coach'), ('coach_poll_people', 'coach'), ('coach_poll_options', 'coach'),
    ('coach_poll_votes', 'coach'), ('coach_booking_links', 'coach'), ('coach_leads', 'coach'),
    ('coach_cal_items', 'coach'), ('coach_cal_guests', 'coach'), ('coach_open_blocks', 'coach'), ('coach_bookings', 'coach'),
    ('coach_cal_reminder_sends', 'coach'), ('coach_connections', 'closed'),
    -- 052
    ('coach_lead_stages', 'coach'), ('coach_lead_events', 'coach'), ('coach_lead_merges', 'closed'),
    ('coach_automations', 'coach'), ('coach_automation_runs', 'coach'),
    ('coach_boards', 'coach'), ('coach_board_stages', 'coach'), ('coach_board_items', 'coach'),
    ('coach_emails', 'coach'), ('coach_email_bodies', 'coach'), ('coach_email_links', 'coach'),
    ('coach_email_waiting', 'coach'), ('coach_email_addresses', 'coach'),
    ('client_check_ins', 'coach'), ('organisation_deals', 'coach'), ('organisation_growth', 'coach'),
    ('network_people', 'coach'), ('network_ratings', 'coach'), ('network_gives', 'coach'),
    ('network_columns', 'coach'), ('network_merges', 'closed'),
    -- 053: one's own rows pass before the code (the sign-in screens need them)
    ('coach_authenticators', 'own_user_id'), ('coach_recovery_codes', 'own_user_id'),
    ('coach_authenticator_resets', 'own_coach_user_id'),
    -- 059 (run 8, item 1)
    ('coach_cal_group_reminder_sends', 'coach'),
    -- 059 (run 8, item 2)
    ('coach_google_calendars', 'coach'), ('coach_busy_times', 'coach'),
    -- 061 (Phase 6b run 1)
    ('agreements', 'coach'), ('agreement_versions', 'coach'), ('agreement_change_requests', 'coach'), ('sponsor_signed_copies', 'coach'),
    ('invoices', 'coach'), ('payments', 'coach'), ('credit_notes', 'coach'), ('expenses', 'coach'),
    ('invoice_reminders', 'coach'), ('invoice_reminder_pauses', 'coach'),
    -- 062 (Phase 6b run 2)
    ('finance_settings', 'coach'), ('finance_targets', 'coach'), ('finance_sectors', 'coach'), ('finance_outgoing_groups', 'coach'),
    ('finance_outgoings', 'coach'), ('bank_balance_checks', 'coach'), ('company_deadlines', 'coach'),
    ('pricing_packages', 'coach'), ('pricing_changes', 'coach'), ('discounts', 'coach'), ('proposals', 'coach'),
    ('supplier_pack_items', 'coach'), ('purchase_orders', 'coach'), ('associate_statements', 'coach'),
    -- 065 (Phase 6b run 3)
    ('agreement_clause_standards', 'coach'), ('agreement_extras', 'coach'), ('agreement_quotes', 'coach'),
    ('agreement_link_opens', 'coach'), ('agreement_reminders', 'coach'), ('agreement_cancellations', 'coach'),
    ('invoice_sources', 'coach'), ('org_billing_profiles', 'coach'), ('invoice_evidence', 'coach'),
    ('talking_points', 'coach'), ('needs_you_done', 'coach'),
    ('quote_number_counter', 'closed'), ('sponsor_sign_links', 'closed'), ('sponsor_signatures', 'closed'), ('fx_reference_rates', 'closed')
  ) as t(table_name, kind);
$$;
revoke all on function public.coach_code_tables() from public, anon;
grant execute on function public.coach_code_tables() to authenticated, service_role;

do $rules$
declare
  t text;
  v_name constant text := 'Coach data: needs the 6-digit code';
begin
  foreach t in array array['agreement_clause_standards', 'agreement_extras', 'agreement_quotes', 'agreement_link_opens', 'agreement_reminders',
                           'agreement_cancellations', 'invoice_sources', 'org_billing_profiles', 'invoice_evidence', 'talking_points',
                           'needs_you_done'] loop
    execute format('drop policy if exists %I on public.%I', v_name, t);
    execute format('create policy %I on public.%I as restrictive for all to authenticated using ((select public.coach_code_ok())) with check ((select public.coach_code_ok()))', v_name, t);
  end loop;
end
$rules$;

select public.record_migration(65, '065_agreements_engine');
