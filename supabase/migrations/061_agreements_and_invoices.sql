-- =============================================================================
-- 061_agreements_and_invoices.sql
-- Phase 6b run 1 (24 Nov 2026): the data under agreements, signing, invoices,
-- payments and portal levels.
--
-- WHAT THIS DOES (plain English)
--   Coaching agreements, each with every version kept: its terms (funding,
--   rate, coaching sessions, rhythm, dates, currency and the exchange rate
--   with its moment, payment option, discount lines, expenses), the coach's
--   signature, the client's signature and the signing record (the typed full
--   name, the verified email, the date and time, the account, the document's
--   fingerprint). A client asks for a change on a clause; a sponsor
--   agreement keeps the sponsor's signed copy. Saved signatures, one's own.
--   Invoices drafted in Stripe (the Stripe id, a CLARITY- number from 1201
--   that is never reused or goes back, status, amounts, currency, due day,
--   purchase order), payments (from Stripe, or added by the coach), refunds
--   and credits (each with its credit note), expenses (a receipt optional),
--   the overdue reminders drafted, and whose reminders are paused. Stripe's
--   own messages, each handled exactly once. Portal levels (Free, Individual,
--   Executive) as subscriptions.
--
-- WHO SEES WHAT
--   Every coach table needs the coach's 6-digit code (054). A coach reads and
--   keeps their own agreements and expenses; the owner reads every coach's
--   invoices (Who needs attention); an associate never reads another coach's.
--   Invoices, payments, credit notes and reminders are written only by the
--   server (service_role), which talks to Stripe. A client never reads these
--   tables: my_agreements() and my_invoices() give them their own, and an
--   organisation-funded client who isn't the sponsor never gets an amount
--   (terms are cut to the rows they see). A client signs only through
--   sign_agreement(), which checks it is their own, the version sent and
--   signed by the coach, not already signed (two tabs), their email
--   verified, and the document unchanged since they read it.
--
-- Additive and safe to run twice. Needs 049 to 060 (stops without them).
-- Tests: supabase/061_agreements_and_invoices_test.sql and
-- supabase/061_agreements_and_invoices_breakit_test.sql.
-- =============================================================================

do $$
begin
  if to_regprocedure('public.coach_first_screen(text,timestamptz,timestamptz,date,timestamptz,uuid[])') is null
     or to_regprocedure('public.coach_code_ok()') is null or to_regprocedure('public.my_coach_id()') is null
     or to_regprocedure('public.coach_code_tables()') is null then
    raise exception '061 needs 049 to 060 first.';
  end if;
end
$$;

-- ---------------------------------------------------------------- numbers
create sequence if not exists public.clarity_invoice_number start with 1201 minvalue 1201 no cycle;
create sequence if not exists public.clarity_agreement_number start with 1 minvalue 1 no cycle;
create sequence if not exists public.clarity_credit_note_number start with 1 minvalue 1 no cycle;
revoke all on sequence public.clarity_invoice_number, public.clarity_agreement_number, public.clarity_credit_note_number from public, anon, authenticated;
grant usage on sequence public.clarity_invoice_number, public.clarity_agreement_number, public.clarity_credit_note_number to service_role;
-- A coach makes their own agreements, so each takes its reference from here (a number tells nothing of anyone's).
grant usage on sequence public.clarity_agreement_number to authenticated;

-- ---------------------------------------------------------------- agreements
create table if not exists public.agreements (
  id               uuid primary key default gen_random_uuid(),
  coach_id         uuid not null references public.coaches (id) on delete restrict,
  kind             text not null default 'coaching' check (kind in ('coaching', 'sponsor')),
  profile_id       uuid references public.client_profiles (id) on delete restrict,
  organisation_id  uuid references public.organisations (id) on delete restrict,
  engagement_id    uuid references public.engagements (id) on delete set null,
  reference        text not null unique default ('CLARITY-AG-' || lpad(nextval('public.clarity_agreement_number')::text, 4, '0')),
  status           text not null default 'draft' check (status in ('draft', 'sent', 'signed', 'ended', 'ended_not_renewed')),
  renews_id        uuid references public.agreements (id) on delete set null,
  current_version  integer not null default 1 check (current_version between 1 and 999),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check ((kind = 'coaching' and profile_id is not null) or (kind = 'sponsor' and organisation_id is not null))
);
comment on table public.agreements is
  'A coaching agreement (or a sponsor agreement for an organisation) with every version kept (061, Phase 6b). Fits the engagement record (049): engagement_id names the engagement it sets out. The coach''s own; the client reads theirs only through my_agreements().';
create index if not exists agreements_coach_idx on public.agreements (coach_id, status);
create index if not exists agreements_profile_idx on public.agreements (profile_id);
create index if not exists agreements_organisation_idx on public.agreements (organisation_id);

create table if not exists public.agreement_versions (
  id                    uuid primary key default gen_random_uuid(),
  agreement_id          uuid not null references public.agreements (id) on delete cascade,
  coach_id              uuid not null references public.coaches (id) on delete restrict,
  version               integer not null check (version between 1 and 999),
  status                text not null default 'draft' check (status in ('draft', 'sent', 'signed', 'superseded')),
  terms                 jsonb not null default '{}'::jsonb check (jsonb_typeof(terms) = 'object' and pg_column_size(terms) <= 20000),
  clauses               jsonb not null default '[]'::jsonb check (jsonb_typeof(clauses) = 'array' and pg_column_size(clauses) <= 60000),
  currency              text not null default 'GBP' check (currency in ('GBP', 'USD')),
  fx_rate               numeric(10, 6) check (fx_rate is null or (fx_rate > 0 and fx_rate < 10)),
  fx_at                 timestamptz,
  total_minor           bigint check (total_minor is null or total_minor between 0 and 100000000),
  funded_by             text check (char_length(funded_by) <= 160),
  changes               jsonb not null default '[]'::jsonb check (jsonb_typeof(changes) = 'array' and pg_column_size(changes) <= 8000),
  coach_signed_at       timestamptz,
  coach_signature_id    uuid,
  sent_at               timestamptz,
  client_signed_at      timestamptz,
  client_signature_id   uuid,
  signed_name           text check (char_length(signed_name) <= 160),
  signed_email          text check (char_length(signed_email) <= 320),
  signed_user_id        uuid references auth.users (id) on delete set null,
  fingerprint           text check (fingerprint ~ '^[0-9a-f]{64}$'),
  pdf_path              text check (char_length(pdf_path) <= 500),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (agreement_id, version),
  check (currency = 'GBP' or (fx_rate is not null and fx_at is not null)),
  check (status <> 'signed' or (client_signed_at is not null and coach_signed_at is not null and signed_name is not null and signed_email is not null and fingerprint is not null))
);
comment on table public.agreement_versions is
  'Every version of an agreement (061): its terms and clauses as signed, the coach''s and the client''s signatures, and the signing record (typed full name, verified email, date and time, account, document fingerprint). A change is always a new version; none is ever changed once sent.';
create index if not exists agreement_versions_agreement_idx on public.agreement_versions (agreement_id, version);

-- A version is fixed once sent: only its signing (sign_agreement), its PDF's place and being superseded may change it.
-- A coach writing directly (the role authenticated; the client's signing runs inside sign_agreement as its owner) can
-- never write the client's signing record, never start a version as signed, never move a version backwards, and never
-- delete one that was sent (break-it tester, 6b run 1).
create or replace function public.agreement_versions_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_person boolean := current_user = 'authenticated';
begin
  if tg_op = 'DELETE' then
    if v_person and old.status <> 'draft' then
      raise exception 'A version that has been sent is kept. Make a new version instead.' using errcode = '23514';
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
  else
    new.agreement_id := old.agreement_id; new.coach_id := old.coach_id; new.version := old.version;
    if old.status in ('sent', 'signed', 'superseded') and (new.terms is distinct from old.terms or new.clauses is distinct from old.clauses
         or new.currency is distinct from old.currency or new.fx_rate is distinct from old.fx_rate or new.fx_at is distinct from old.fx_at
         or new.total_minor is distinct from old.total_minor or new.funded_by is distinct from old.funded_by) then
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
         or new.client_signature_id is distinct from old.client_signature_id or new.signed_user_id is distinct from old.signed_user_id) then
      raise exception 'A signing record never changes.' using errcode = '23514';
    end if;
    if v_person then
      if new.client_signed_at is distinct from old.client_signed_at or new.client_signature_id is distinct from old.client_signature_id
         or new.signed_name is distinct from old.signed_name or new.signed_email is distinct from old.signed_email
         or new.signed_user_id is distinct from old.signed_user_id or new.fingerprint is distinct from old.fingerprint then
        raise exception 'Only the client signs their agreement.' using errcode = '42501';
      end if;
      if not (new.status = old.status or (old.status = 'draft' and new.status = 'sent') or (old.status = 'sent' and new.status = 'superseded')) then
        raise exception 'Only the client signs their agreement.' using errcode = '42501';
      end if;
      if old.status <> 'draft' and (new.coach_signed_at is distinct from old.coach_signed_at or new.coach_signature_id is distinct from old.coach_signature_id
           or new.sent_at is distinct from old.sent_at) then
        raise exception 'A version that has been sent can’t change. Make a new version instead.' using errcode = '23514';
      end if;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists agreement_versions_guard on public.agreement_versions;
create trigger agreement_versions_guard before insert or update or delete on public.agreement_versions for each row execute function public.agreement_versions_guard();

-- The agreement itself: a coach writing directly never marks it signed, never moves it to another client once a
-- version has been sent, and never deletes one that has been sent (every version is kept).
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
  if tg_op = 'INSERT' then
    if new.status not in ('draft', 'sent') then
      raise exception 'Only the client signs their agreement.' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.status = 'signed' and old.status <> 'signed' then
    raise exception 'Only the client signs their agreement.' using errcode = '42501';
  end if;
  new.coach_id := old.coach_id;
  select exists (select 1 from public.agreement_versions v where v.agreement_id = old.id and v.status <> 'draft') into v_sent;
  if v_sent then
    new.profile_id := old.profile_id; new.organisation_id := old.organisation_id; new.kind := old.kind;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists agreements_guard on public.agreements;
create trigger agreements_guard before insert or update or delete on public.agreements for each row execute function public.agreements_guard();

-- The document's fingerprint: SHA-256 of its terms and clauses as stored.
create or replace function public.agreement_fingerprint(p_version uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select encode(sha256(convert_to(v.terms::text || '|' || v.clauses::text || '|' || v.currency || '|' || coalesce(v.fx_rate::text, ''), 'UTF8')), 'hex')
  from public.agreement_versions v
  join public.agreements a on a.id = v.agreement_id
  left join public.client_profiles p on p.id = a.profile_id
  where v.id = p_version
    -- The client's own or the coach's own only (break-it tester); the server and sign_agreement read any.
    and (coalesce(nullif(current_setting('role', true), 'none'), session_user) not in ('authenticated', 'anon')
         or p.user_id = (select auth.uid()) or v.coach_id = (select public.my_coach_id()));
$$;
revoke all on function public.agreement_fingerprint(uuid) from public, anon;
grant execute on function public.agreement_fingerprint(uuid) to authenticated, service_role;

create table if not exists public.agreement_change_requests (
  id           uuid primary key default gen_random_uuid(),
  version_id   uuid not null references public.agreement_versions (id) on delete cascade,
  coach_id     uuid not null references public.coaches (id) on delete restrict,
  clause_key   text not null check (char_length(clause_key) between 1 and 60),
  words        text not null check (char_length(btrim(words)) between 1 and 2000),
  asked_by     uuid references auth.users (id) on delete set null,
  answered_at  timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists agreement_change_requests_version_idx on public.agreement_change_requests (version_id);

create table if not exists public.sponsor_signed_copies (
  id            uuid primary key default gen_random_uuid(),
  agreement_id  uuid not null references public.agreements (id) on delete cascade,
  version_id    uuid not null references public.agreement_versions (id) on delete cascade,
  coach_id      uuid not null references public.coaches (id) on delete restrict,
  storage_path  text not null check (char_length(storage_path) between 1 and 500),
  uploaded_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------- saved signatures (one's own)
create table if not exists public.signatures (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  kind        text not null check (kind in ('drawn', 'typed')),
  image       text check (image is null or (image ~ '^data:image/png;base64,[A-Za-z0-9+/]+={0,2}$' and char_length(image) between 200 and 300000)),
  typed_name  text check (typed_name is null or char_length(btrim(typed_name)) between 3 and 160),
  created_at  timestamptz not null default now(),
  -- A drawn signature is a picture, never words pasted in; a typed one is a name, never a picture (break-it rule).
  check ((kind = 'drawn' and image is not null and typed_name is null) or (kind = 'typed' and typed_name is not null and image is null))
);
comment on table public.signatures is
  'A person''s signatures (061): drawn (a PNG drawing) or typed (their full name). The newest drawn one is their saved signature, offered first next time. One''s own alone.';
create index if not exists signatures_user_idx on public.signatures (user_id, created_at desc);
alter table public.signatures enable row level security;
revoke all on public.signatures from public, anon;
grant select, insert on public.signatures to authenticated;
grant select, insert, update, delete on public.signatures to service_role;
drop policy if exists "Own signatures" on public.signatures;
create policy "Own signatures" on public.signatures for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "Own signatures, add" on public.signatures;
create policy "Own signatures, add" on public.signatures for insert to authenticated with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------- invoices and money
create table if not exists public.invoices (
  id                 uuid primary key default gen_random_uuid(),
  coach_id           uuid not null references public.coaches (id) on delete restrict,
  agreement_id       uuid references public.agreements (id) on delete set null,
  profile_id         uuid references public.client_profiles (id) on delete set null,
  organisation_id    uuid references public.organisations (id) on delete set null,
  number             integer unique check (number >= 1201),
  stripe_invoice_id  text unique check (char_length(stripe_invoice_id) <= 200),
  stripe_customer_id text check (char_length(stripe_customer_id) <= 200),
  kind               text not null default 'instalment' check (kind in ('instalment', 'one_off', 'expenses', 'late_cancel')),
  status             text not null default 'draft' check (status in ('draft', 'sent', 'paid', 'void', 'uncollectible')),
  currency           text not null default 'GBP' check (currency in ('GBP', 'USD')),
  lines              jsonb not null default '[]'::jsonb check (jsonb_typeof(lines) = 'array' and pg_column_size(lines) <= 20000),
  total_minor        bigint not null default 0 check (total_minor between 0 and 100000000),
  paid_minor         bigint not null default 0 check (paid_minor between 0 and 100000000),
  terms_days         integer not null default 14 check (terms_days between 1 and 120),
  issued_on          date,
  due_on             date,
  po_number          text check (char_length(po_number) <= 100),
  settles_to         text not null default 'client' check (settles_to in ('client', 'organisation')),
  payer_name         text check (char_length(payer_name) <= 160),
  payer_email        text check (char_length(payer_email) <= 320),
  payer_zone         text check (char_length(payer_zone) <= 64),
  hosted_url         text check (hosted_url is null or (hosted_url ~ '^https://' and char_length(hosted_url) <= 1000)),
  session_id         uuid,
  instalment_n       integer check (instalment_n between 1 and 60),
  waived_at          timestamptz,
  sent_at            timestamptz,
  paid_at            timestamptz,
  voided_at          timestamptz,
  stripe_updated_at  timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (paid_minor <= total_minor or status in ('paid', 'void'))
);
comment on table public.invoices is
  'An invoice drafted in Stripe (061): its CLARITY- number (from 1201, never reused or going back), Stripe''s id, status, lines (each discount its own line), amounts, currency, due day and PO. Written only by the server, which talks to Stripe; nothing is sent until the coach presses Send. No late fees or interest, ever.';
create index if not exists invoices_coach_idx on public.invoices (coach_id, status, due_on);
create index if not exists invoices_profile_idx on public.invoices (profile_id);
create index if not exists invoices_agreement_idx on public.invoices (agreement_id);
-- One invoice for each instalment of an agreement, however often the server is asked (two tabs, a retry, the nightly round).
create unique index if not exists invoices_one_per_instalment on public.invoices (agreement_id, kind, instalment_n) where agreement_id is not null and instalment_n is not null and status <> 'void';

create table if not exists public.payments (
  id               uuid primary key default gen_random_uuid(),
  invoice_id       uuid not null references public.invoices (id) on delete restrict,
  coach_id         uuid not null references public.coaches (id) on delete restrict,
  stripe_id        text unique check (char_length(stripe_id) <= 200),
  amount_minor     bigint not null check (amount_minor > 0 and amount_minor <= 100000000),
  currency         text not null check (currency in ('GBP', 'USD')),
  landed_gbp_minor bigint check (landed_gbp_minor >= 0),
  fee_minor        bigint check (fee_minor >= 0),
  method           text check (char_length(method) <= 40),
  added_by_coach   boolean not null default false,
  paid_at          timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  check (added_by_coach or stripe_id is not null)
);
create index if not exists payments_invoice_idx on public.payments (invoice_id);
create index if not exists payments_coach_idx on public.payments (coach_id, paid_at);

create table if not exists public.credit_notes (
  id            uuid primary key default gen_random_uuid(),
  invoice_id    uuid not null references public.invoices (id) on delete restrict,
  coach_id      uuid not null references public.coaches (id) on delete restrict,
  kind          text not null check (kind in ('refund', 'credit')),
  number        text not null unique default ('CLARITY-CN-' || lpad(nextval('public.clarity_credit_note_number')::text, 4, '0')),
  amount_minor  bigint not null check (amount_minor > 0 and amount_minor <= 100000000),
  currency      text not null check (currency in ('GBP', 'USD')),
  stripe_id     text unique check (char_length(stripe_id) <= 200),
  reason        text check (char_length(reason) <= 500),
  pdf_path      text check (char_length(pdf_path) <= 500),
  created_at    timestamptz not null default now()
);
create index if not exists credit_notes_invoice_idx on public.credit_notes (invoice_id);

-- Never more refunded and credited than was settled on the invoice, checked with the invoice locked, so a refund and a
-- credit pressed at the same moment can't both pass (break-it tester, 6b run 1).
create or replace function public.credit_notes_within_paid()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_paid bigint;
  v_before bigint;
begin
  select i.paid_minor into v_paid from public.invoices i where i.id = new.invoice_id for update;
  select coalesce(sum(c.amount_minor), 0) into v_before from public.credit_notes c where c.invoice_id = new.invoice_id and c.id <> new.id;
  if v_before + new.amount_minor > coalesce(v_paid, 0) then
    raise exception 'That’s more than was settled on this invoice.' using errcode = '23514';
  end if;
  return new;
end;
$$;
drop trigger if exists credit_notes_within_paid on public.credit_notes;
create trigger credit_notes_within_paid before insert or update of amount_minor, invoice_id on public.credit_notes for each row execute function public.credit_notes_within_paid();

create table if not exists public.expenses (
  id            uuid primary key default gen_random_uuid(),
  coach_id      uuid not null references public.coaches (id) on delete restrict,
  profile_id    uuid references public.client_profiles (id) on delete set null,
  agreement_id  uuid references public.agreements (id) on delete set null,
  description   text not null check (char_length(btrim(description)) between 1 and 200),
  amount_minor  bigint not null check (amount_minor > 0 and amount_minor <= 10000000),
  currency      text not null default 'GBP' check (currency in ('GBP', 'USD')),
  spent_on      date not null,
  receipt_path  text check (char_length(receipt_path) <= 500),
  invoice_id    uuid references public.invoices (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists expenses_coach_idx on public.expenses (coach_id, spent_on);

create table if not exists public.invoice_reminders (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references public.invoices (id) on delete cascade,
  coach_id    uuid not null references public.coaches (id) on delete restrict,
  stage       integer not null check (stage in (3, 7, 14)),
  drafted_at  timestamptz not null default now(),
  sent_at     timestamptz,
  settle_by   date,
  unique (invoice_id, stage)
);

create table if not exists public.invoice_reminder_pauses (
  id               uuid primary key default gen_random_uuid(),
  coach_id         uuid not null references public.coaches (id) on delete cascade,
  profile_id       uuid references public.client_profiles (id) on delete cascade,
  organisation_id  uuid references public.organisations (id) on delete cascade,
  created_at       timestamptz not null default now(),
  check ((profile_id is not null) <> (organisation_id is not null)),
  unique (coach_id, profile_id), unique (coach_id, organisation_id)
);

-- Stripe's messages, each handled exactly once (the webhook claims the event id before acting on it).
create table if not exists public.stripe_events (
  id           text primary key check (char_length(id) between 1 and 200),
  type         text not null check (char_length(type) <= 120),
  object_id    text check (char_length(object_id) <= 200),
  stripe_at    timestamptz,
  received_at  timestamptz not null default now(),
  handled_at   timestamptz
);
alter table public.stripe_events enable row level security;
revoke all on public.stripe_events from public, anon, authenticated;
grant select, insert, update on public.stripe_events to service_role;

-- Portal levels for people who aren't coaching clients (Free, Individual, Executive), and what coaching gives.
create table if not exists public.portal_subscriptions (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references auth.users (id) on delete cascade,
  level                   text not null check (level in ('free', 'individual', 'executive')),
  source                  text not null default 'self' check (source in ('self', 'coaching')),
  stripe_subscription_id  text unique check (char_length(stripe_subscription_id) <= 200),
  status                  text not null default 'active' check (status in ('active', 'cancelling', 'cancelled', 'past_due')),
  first_invested_at       timestamptz,
  current_period_end      timestamptz,
  cancelled_at            timestamptz,
  stripe_updated_at       timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create index if not exists portal_subscriptions_user_idx on public.portal_subscriptions (user_id, status);
alter table public.portal_subscriptions enable row level security;
revoke all on public.portal_subscriptions from public, anon;
grant select on public.portal_subscriptions to authenticated;
grant select, insert, update, delete on public.portal_subscriptions to service_role;
drop policy if exists "Own level" on public.portal_subscriptions;
create policy "Own level" on public.portal_subscriptions for select to authenticated using (user_id = (select auth.uid()));

-- The business's own money settings (VAT off until registered, etc.), on the coach's settings row.
alter table public.coach_settings add column if not exists billing jsonb not null default '{}'::jsonb;
do $c$
begin
  if not exists (select 1 from pg_constraint where conname = 'coach_settings_billing_ok') then
    alter table public.coach_settings add constraint coach_settings_billing_ok check (jsonb_typeof(billing) = 'object' and pg_column_size(billing) <= 4000);
  end if;
end
$c$;

-- ---------------------------------------------------------------- the coach tables' own rules
-- A coach reads and keeps their own agreements, versions, change requests, sponsor copies and expenses. Invoices,
-- payments, credit notes, reminders and pauses are read by their coach and the owner; only the server writes the first
-- four. Pauses are the coach's to set.
do $rules$
declare t text;
begin
  foreach t in array array['agreements', 'agreement_versions', 'agreement_change_requests', 'sponsor_signed_copies', 'expenses',
                           'invoices', 'payments', 'credit_notes', 'invoice_reminders', 'invoice_reminder_pauses'] loop
    execute format('alter table public.%I enable row level security', t);
    -- Never anyone signed out, whatever the database's default grants are.
    execute format('revoke all on public.%I from public, anon', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
  foreach t in array array['agreements', 'agreement_versions', 'sponsor_signed_copies', 'expenses', 'invoice_reminder_pauses'] loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('drop policy if exists "Coach alone" on public.%I', t);
    execute format('create policy "Coach alone" on public.%I for all to authenticated using (coach_id = (select public.my_coach_id())) with check (coach_id = (select public.my_coach_id()))', t);
  end loop;
  -- An agreement only for the coach's own client (or an organisation they can see), a version only on their own
  -- agreement (break-it tester, 6b run 1: an associate could send one to the owner's client).
  execute 'drop policy if exists "Coach alone" on public.agreements';
  execute 'drop policy if exists "Coach alone, read" on public.agreements';
  execute 'create policy "Coach alone, read" on public.agreements for select to authenticated using (coach_id = (select public.my_coach_id()))';
  execute 'drop policy if exists "Coach alone, remove" on public.agreements';
  execute 'create policy "Coach alone, remove" on public.agreements for delete to authenticated using (coach_id = (select public.my_coach_id()))';
  execute 'drop policy if exists "Coach alone, own client" on public.agreements';
  execute 'create policy "Coach alone, own client" on public.agreements for insert to authenticated with check (coach_id = (select public.my_coach_id())
     and (profile_id is null or exists (select 1 from public.client_profiles p where p.id = profile_id and p.coach_id = (select public.my_coach_id())))
     and (organisation_id is null or exists (select 1 from public.organisations o where o.id = organisation_id)))';
  execute 'drop policy if exists "Coach alone, own client, change" on public.agreements';
  execute 'create policy "Coach alone, own client, change" on public.agreements for update to authenticated using (coach_id = (select public.my_coach_id()))
     with check (coach_id = (select public.my_coach_id())
     and (profile_id is null or exists (select 1 from public.client_profiles p where p.id = profile_id and p.coach_id = (select public.my_coach_id())))
     and (organisation_id is null or exists (select 1 from public.organisations o where o.id = organisation_id)))';
  execute 'drop policy if exists "Coach alone" on public.agreement_versions';
  execute 'drop policy if exists "Coach alone, read" on public.agreement_versions';
  execute 'create policy "Coach alone, read" on public.agreement_versions for select to authenticated using (coach_id = (select public.my_coach_id()))';
  execute 'drop policy if exists "Coach alone, remove" on public.agreement_versions';
  execute 'create policy "Coach alone, remove" on public.agreement_versions for delete to authenticated using (coach_id = (select public.my_coach_id()))';
  execute 'drop policy if exists "Coach alone, own agreement" on public.agreement_versions';
  execute 'create policy "Coach alone, own agreement" on public.agreement_versions for insert to authenticated with check (coach_id = (select public.my_coach_id())
     and exists (select 1 from public.agreements a where a.id = agreement_id and a.coach_id = (select public.my_coach_id())))';
  execute 'drop policy if exists "Coach alone, own agreement, change" on public.agreement_versions';
  execute 'create policy "Coach alone, own agreement, change" on public.agreement_versions for update to authenticated using (coach_id = (select public.my_coach_id()))
     with check (coach_id = (select public.my_coach_id()))';
  execute 'grant select, update on public.agreement_change_requests to authenticated';
  execute 'drop policy if exists "Coach alone" on public.agreement_change_requests';
  execute 'create policy "Coach alone" on public.agreement_change_requests for select to authenticated using (coach_id = (select public.my_coach_id()))';
  execute 'drop policy if exists "Coach answers" on public.agreement_change_requests';
  execute 'create policy "Coach answers" on public.agreement_change_requests for update to authenticated using (coach_id = (select public.my_coach_id())) with check (coach_id = (select public.my_coach_id()))';
  foreach t in array array['invoices', 'payments', 'credit_notes', 'invoice_reminders'] loop
    execute format('grant select on public.%I to authenticated', t);
    execute format('drop policy if exists "Coach and owner read" on public.%I', t);
    execute format('create policy "Coach and owner read" on public.%I for select to authenticated using (coach_id = (select public.my_coach_id()) or ((select public.my_coach_id()) is not null and coalesce((select public.is_owner()), false)))', t);
  end loop;
end
$rules$;

-- ---------------------------------------------------------------- a client's own, through these functions only
-- The caller's own agreements (coaching ones, sent or signed), every version. For an organisation-funded client the
-- money is cut from the terms (they see who funds it, never an amount: on screens, emails and PDFs).
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
    select jsonb_agg(jsonb_build_object(
      'id', v.id, 'agreement_id', a.id, 'reference', a.reference, 'version', v.version, 'status', v.status,
      'current', v.version = a.current_version, 'sent_at', v.sent_at, 'client_signed_at', v.client_signed_at,
      'coach_signed_at', v.coach_signed_at, 'funded_by', v.funded_by,
      'currency', case when v.funded_by is null then v.currency end,
      'fx_rate', case when v.funded_by is null then v.fx_rate end, 'fx_at', case when v.funded_by is null then v.fx_at end,
      'total_minor', case when v.funded_by is null then v.total_minor end,
      -- Funded: only the terms on this list are shown, so no money key, named or not, ever reaches them (break-it tester).
      'terms', case when v.funded_by is null then v.terms
               else (select coalesce(jsonb_object_agg(k, val), '{}'::jsonb) from jsonb_each(v.terms) as e(k, val)
                     where k = any (array['coaching', 'sessions', 'minutes', 'place', 'rhythm', 'startsOn', 'endsOn', 'ongoing', 'goals',
                                          'contactWays', 'clientName', 'clientEmail', 'coachName', 'coachFirst', 'coachEmail', 'fundedBy',
                                          'expensesAllowed', 'sponsor'])) end,
      'clauses', case when v.funded_by is null then v.clauses
                 else (select coalesce(jsonb_agg(c), '[]'::jsonb) from jsonb_array_elements(v.clauses) c where coalesce(c->>'money', 'false') <> 'true') end,
      'changes', v.changes, 'signed_name', v.signed_name, 'signed_email', v.signed_email, 'fingerprint', v.fingerprint,
      'client_signature_id', v.client_signature_id
    ) order by a.created_at desc, v.version desc)
    from public.agreements a
    join public.client_profiles p on p.id = a.profile_id
    join public.agreement_versions v on v.agreement_id = a.id
    where a.kind = 'coaching' and p.user_id = v_user and v.status in ('sent', 'signed', 'superseded')
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.my_agreements() from public, anon;
grant execute on function public.my_agreements() to authenticated;

-- The caller's own invoices: only where they settle them themselves (a self-funded client). A funded client gets none.
create or replace function public.my_invoices()
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
      'id', i.id, 'number', 'CLARITY-' || i.number, 'status', i.status, 'currency', i.currency, 'total_minor', i.total_minor,
      'paid_minor', i.paid_minor, 'due_on', i.due_on, 'issued_on', i.issued_on, 'paid_at', i.paid_at, 'hosted_url', i.hosted_url,
      'lines', i.lines, 'kind', i.kind
    ) order by i.number desc)
    from public.invoices i
    join public.client_profiles p on p.id = i.profile_id
    -- Decided by who settles this invoice, never by a newer version (break-it tester: a funded version sent later hid
    -- what the client still owed).
    where p.user_id = v_user and i.settles_to = 'client' and i.status in ('sent', 'paid') and i.number is not null
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.my_invoices() from public, anon;
grant execute on function public.my_invoices() to authenticated;

-- Signing. Only the client whose agreement it is, with a verified email, on the version that was sent and signed by
-- the coach, unchanged since they read it (p_fingerprint), and only once (a second tab, or a second press, is told).
create or replace function public.sign_agreement(p_version uuid, p_name text, p_signature uuid, p_fingerprint text)
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
begin
  if v_user is null then raise exception 'Sign in to carry on.' using errcode = '42501'; end if;
  select u.email, u.email_confirmed_at into v_email, v_confirmed from auth.users u where u.id = v_user;
  if v_confirmed is null then raise exception 'Confirm your email address to sign.' using errcode = '42501'; end if;
  select ver.*, a.current_version, a.profile_id as a_profile, a.kind as a_kind, p.user_id as client_user, a.coach_id as a_coach, p.coach_id as p_coach
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
  if v.status <> 'sent' or v.coach_signed_at is null or v.version <> v.current_version then
    raise exception 'This version can’t be signed. Open the newest one.' using errcode = 'CC409';
  end if;
  v_print := public.agreement_fingerprint(p_version);
  if p_fingerprint is distinct from v_print then
    raise exception 'This agreement changed since you opened it. Open it again to read the newest version.' using errcode = 'CC409';
  end if;
  -- A real name: invisible and direction marks taken out, at least one letter, no markup (break-it tester).
  v_name := btrim(regexp_replace(coalesce(p_name, ''), '[' || U&'\200B-\200F\202A-\202E\2060-\2069\FEFF\00AD' || ']', '', 'g'));
  if char_length(v_name) < 3 or char_length(v_name) > 160 or v_name !~ '[[:alpha:]]' or v_name ~ '[<>{}]' then
    raise exception 'Type your full name to sign.' using errcode = '22023';
  end if;
  select * into v_sig from public.signatures s where s.id = p_signature and s.user_id = v_user;
  if not found then raise exception 'Use your signature to sign.' using errcode = '22023'; end if;

  update public.agreement_versions set status = 'signed', client_signed_at = v_now, client_signature_id = v_sig.id,
    signed_name = v_name, signed_email = v_email, signed_user_id = v_user, fingerprint = v_print
  where id = p_version;
  update public.agreement_versions set status = 'superseded' where agreement_id = v.agreement_id and id <> p_version and status in ('sent', 'signed');
  update public.agreements set status = 'signed', updated_at = v_now where id = v.agreement_id;
  insert into public.coach_notifications (coach_id, kind, title, detail, item_kind, item_id)
  select v.coach_id, 'agreement', p.name || ' signed their agreement', left(coalesce(v.terms->>'coaching', ''), 240), 'client', p.id
  from public.client_profiles p where p.id = v.a_profile;
  return jsonb_build_object('signed_at', v_now, 'fingerprint', v_print, 'version', v.version);
end;
$$;
revoke all on function public.sign_agreement(uuid, text, uuid, text) from public, anon;
grant execute on function public.sign_agreement(uuid, text, uuid, text) to authenticated;

-- Asking for a change on a clause (the coach is told; a new version follows from the coach).
create or replace function public.ask_agreement_change(p_version uuid, p_clause text, p_words text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v record;
  v_id uuid;
begin
  if v_user is null then raise exception 'Sign in to carry on.' using errcode = '42501'; end if;
  select ver.id, ver.coach_id, ver.status, p.user_id into v
    from public.agreement_versions ver join public.agreements a on a.id = ver.agreement_id join public.client_profiles p on p.id = a.profile_id
    where ver.id = p_version;
  if not found or v.user_id is distinct from v_user then raise exception 'That agreement isn’t yours.' using errcode = '42501'; end if;
  if v.status <> 'sent' then raise exception 'This version can’t be changed now.' using errcode = 'CC409'; end if;
  if char_length(btrim(coalesce(p_words, ''))) = 0 then raise exception 'Write what you’d like changed to carry on.' using errcode = '22023'; end if;
  insert into public.agreement_change_requests (version_id, coach_id, clause_key, words, asked_by)
  values (p_version, v.coach_id, left(coalesce(nullif(btrim(p_clause), ''), 'general'), 60), left(btrim(p_words), 2000), v_user)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.ask_agreement_change(uuid, text, text) from public, anon;
grant execute on function public.ask_agreement_change(uuid, text, text) to authenticated;

-- The next invoice number: the server's alone, from the sequence, so none is ever reused or goes back.
create or replace function public.next_invoice_number()
returns integer
language sql
volatile
security definer
set search_path = ''
as $$ select nextval('public.clarity_invoice_number')::integer; $$;
revoke all on function public.next_invoice_number() from public, anon, authenticated;
grant execute on function public.next_invoice_number() to service_role;

-- ---------------------------------------------------------------- 054's list, with 061's coach tables
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
    ('invoice_reminders', 'coach'), ('invoice_reminder_pauses', 'coach')
  ) as t(table_name, kind);
$$;
revoke all on function public.coach_code_tables() from public, anon;
grant execute on function public.coach_code_tables() to authenticated, service_role;

do $rules$
declare
  t text;
  v_name constant text := 'Coach data: needs the 6-digit code';
begin
  foreach t in array array['agreements', 'agreement_versions', 'agreement_change_requests', 'sponsor_signed_copies', 'invoices', 'payments',
                           'credit_notes', 'expenses', 'invoice_reminders', 'invoice_reminder_pauses'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', v_name, t);
    execute format('create policy %I on public.%I as restrictive for all to authenticated using ((select public.coach_code_ok())) with check ((select public.coach_code_ok()))', v_name, t);
  end loop;
end
$rules$;

-- ---------------------------------------------------------------- the payer's one Stripe customer
-- Each instalment reuses the customer its agreement's payer already has in Stripe (a Bacs Direct Debit belongs to one
-- customer), kept on the invoice it was drafted for (functionality tester, 6b run 1).
alter table public.invoices add column if not exists stripe_customer_id text check (char_length(stripe_customer_id) <= 200);

-- ---------------------------------------------------------------- the nightly billing round, from the database's scheduler
-- Coach-portal rule 22: scheduled work is asked for by the database's own scheduler (pg_cron and pg_net, as 058), never
-- a Vercel cron. Once a day at 03:15 UTC it asks the live site's /api/billing-nightly with the same secret and address
-- from Vault as 058 (clarity_cron_secret, clarity_live_url). The round drafts only, never sends, and handles each Stripe
-- message once, so a second ask the same night does nothing twice. Nothing at all without pg_cron, pg_net or Vault.
create or replace function public.run_billing_nightly()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret text;
  v_base text;
begin
  if to_regclass('vault.decrypted_secrets') is null or to_regnamespace('net') is null then
    raise notice '061: Vault or pg_net isn''t on this database, so the billing round wasn''t asked for.';
    return 0;
  end if;
  execute 'select (select decrypted_secret from vault.decrypted_secrets where name = $1 order by created_at desc limit 1),
                  (select decrypted_secret from vault.decrypted_secrets where name = $2 order by created_at desc limit 1)'
    into v_secret, v_base using 'clarity_cron_secret', 'clarity_live_url';
  v_base := lower(regexp_replace(btrim(coalesce(v_base, '')), '/+$', ''));
  if v_base !~ '^https://[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'
     or char_length(coalesce(v_secret, '')) < 16 or v_secret ~ '\s' then
    raise notice '061: clarity_cron_secret or clarity_live_url isn''t usable in Vault, so the billing round wasn''t asked for.';
    return 0;
  end if;
  execute 'select net.http_get(url := $1, headers := $2, timeout_milliseconds := $3)'
    using v_base || '/api/billing-nightly', jsonb_build_object('Authorization', 'Bearer ' || v_secret), 290000;
  return 1;
end;
$$;
comment on function public.run_billing_nightly() is
  'Run by pg_cron once a day at 03:15 UTC (061): asks the live site''s /api/billing-nightly with the secret and address from Vault. Drafts only; never sends.';
revoke all on function public.run_billing_nightly() from public, anon, authenticated, service_role;

do $$
declare
  v_id bigint;
begin
  if to_regnamespace('cron') is null or to_regprocedure('cron.schedule(text,text,text)') is null then
    raise notice '061: pg_cron isn''t on this database, so the billing round isn''t scheduled here.';
    return;
  end if;
  for v_id in execute 'select jobid from cron.job where jobname = $1' using 'clarity-billing-nightly' loop
    execute 'select cron.unschedule($1::bigint)' using v_id;
  end loop;
  execute 'select cron.schedule($1, $2, $3)' using 'clarity-billing-nightly', '15 3 * * *', 'select public.run_billing_nightly()';
  raise notice '061: the billing round runs once a day at 03:15 UTC (cron job clarity-billing-nightly).';
end
$$;

select public.record_migration(61, '061_agreements_and_invoices');
