-- =============================================================================
-- 062_finances.sql
-- Phase 6b run 2 (24 Nov 2026): Finances, proposals and the paperwork for
-- organisations.
--
-- WHAT IT ADDS
--   finance_settings         the business's money settings: the financial year's first month (May), the monthly
--                            minimum (£2,000), each month or the same every month, the tax share (25%), the cash level
--                            to keep above (empty: 2 months of outgoings), the bank balance and when it was checked,
--                            whether no-shows are paid to associates, VAT (off until registered)
--   finance_targets          each month's own target
--   finance_sectors          Business, Sport, Medicine, Personal (editable)
--   finance_outgoing_groups  Associates, Software, Marketing, Travel, Training and supervision, Insurance and
--                            professional fees, Your pay, Tax (editable)
--   finance_outgoings        recurring outgoings (each month, quarter or year) and one-off costs, with a receipt
--   bank_balance_checks      every balance typed in, so the monthly check has a history
--   company_deadlines        corporation tax, the confirmation statement, accounts, VAT returns, with a repeat and
--                            an amount that shows on the cash flow
--   pricing_packages         packages and rates, for organisations and paying personally
--   pricing_changes          the price list's history (Update all prices)
--   discounts                named, by percentage or a fixed amount, for all or chosen packages (never "charity")
--   proposals                new work, renewals and yearly price reviews, with a private share link and its opens
--   supplier_pack_items      the business details organisations ask for, each with an optional expiry
--   purchase_orders          an organisation's POs: number, value, end, finance contact, invoice email, supplier
--                            reference, vendor portal
--   associate_statements     an associate's month: hours, rate, what counts, the total, and when Tim paid it
--   and on 061's tables: a payment made to the bank with no invoice (who paid, what for, the sector, a receipt);
--   an invoice's sector, purchase order and proposal; a client's and an organisation's sector and country.
--
-- WHO SEES WHAT
--   Everything here is the owner's alone, with the 6-digit code (054). An associate reads only their own monthly
--   statements. Payments and invoices are still written only by the server (061). The accountant never signs in.
--   A proposal's share link is read through proposal_open(token) only: the proposal's own words and figures, never
--   anything else, and each opening is counted.
--
-- Additive and safe to run twice. Needs 049 to 061. Ends with record_migration(62).
-- =============================================================================

do $$
begin
  if to_regclass('public.invoices') is null or to_regclass('public.payments') is null
     or to_regprocedure('public.coach_code_ok()') is null or to_regprocedure('public.my_coach_id()') is null
     or to_regprocedure('public.is_owner()') is null then
    raise exception '062 needs 049 to 061 first.';
  end if;
end
$$;

-- ---------------------------------------------------------------- settings and targets
create table if not exists public.finance_settings (
  id                 uuid primary key default gen_random_uuid(),
  coach_id           uuid not null unique references public.coaches (id) on delete cascade,
  year_start_month   integer not null default 5 check (year_start_month between 1 and 12),
  minimum_minor      bigint not null default 200000 check (minimum_minor between 0 and 100000000),
  targets_mode       text not null default 'each' check (targets_mode in ('each', 'same')),
  tax_share_percent  numeric(5, 2) not null default 25 check (tax_share_percent between 0 and 100),
  keep_above_minor   bigint check (keep_above_minor is null or keep_above_minor between 0 and 100000000),
  bank_balance_minor bigint check (bank_balance_minor is null or bank_balance_minor between -100000000 and 100000000),
  bank_checked_at    timestamptz,
  no_shows_paid      boolean not null default false,
  vat_registered     boolean not null default false,
  vat_registered_on  date,
  cash_months        integer not null default 6 check (cash_months in (3, 6, 12)),
  updated_at         timestamptz not null default now()
);
comment on table public.finance_settings is
  'The business''s money settings (062): the financial year''s first month, the monthly minimum, targets each month or the same, the tax share, the cash level to keep above (empty: 2 months of outgoings), the bank balance, no-shows paid or not, VAT. The owner''s alone.';

create table if not exists public.finance_targets (
  id            uuid primary key default gen_random_uuid(),
  coach_id      uuid not null references public.coaches (id) on delete cascade,
  month         date not null check (extract(day from month) = 1),
  target_minor  bigint not null check (target_minor between 0 and 100000000),
  updated_at    timestamptz not null default now(),
  unique (coach_id, month)
);
comment on table public.finance_targets is 'Each month''s own income target (062). A new financial year copies last year''s.';

create table if not exists public.finance_sectors (
  id          uuid primary key default gen_random_uuid(),
  coach_id    uuid not null references public.coaches (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 40),
  position    integer not null default 0 check (position between 0 and 1000000),
  archived    boolean not null default false,
  created_at  timestamptz not null default now()
);
create unique index if not exists finance_sectors_name_idx on public.finance_sectors (coach_id, lower(btrim(name)));

create table if not exists public.finance_outgoing_groups (
  id          uuid primary key default gen_random_uuid(),
  coach_id    uuid not null references public.coaches (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 60),
  position    integer not null default 0 check (position between 0 and 1000000),
  archived    boolean not null default false,
  created_at  timestamptz not null default now()
);
create unique index if not exists finance_outgoing_groups_name_idx on public.finance_outgoing_groups (coach_id, lower(btrim(name)));

create table if not exists public.finance_outgoings (
  id            uuid primary key default gen_random_uuid(),
  coach_id      uuid not null references public.coaches (id) on delete cascade,
  name          text not null check (char_length(btrim(name)) between 1 and 120),
  group_name    text not null check (char_length(btrim(group_name)) between 1 and 60),
  amount_minor  bigint not null check (amount_minor between 1 and 100000000),
  currency      text not null default 'GBP' check (currency in ('GBP', 'USD', 'EUR')),
  every         text not null default 'month' check (every in ('once', 'month', 'quarter', 'year')),
  starts_on     date not null,
  ends_on       date,
  associate_id  uuid references public.coaches (id) on delete set null,
  receipt_path  text check (char_length(receipt_path) <= 500),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on)
);
comment on table public.finance_outgoings is
  'Recurring outgoings (each month, quarter or year, from starts_on) and one-off costs (every = once, on starts_on), each in a group, with an optional receipt in coach-files (062).';
create index if not exists finance_outgoings_coach_idx on public.finance_outgoings (coach_id, starts_on);

create table if not exists public.bank_balance_checks (
  id             uuid primary key default gen_random_uuid(),
  coach_id       uuid not null references public.coaches (id) on delete cascade,
  balance_minor  bigint not null check (balance_minor between -100000000 and 100000000),
  checked_on     date not null,
  created_at     timestamptz not null default now()
);
create index if not exists bank_balance_checks_coach_idx on public.bank_balance_checks (coach_id, checked_on desc);

create table if not exists public.company_deadlines (
  id            uuid primary key default gen_random_uuid(),
  coach_id      uuid not null references public.coaches (id) on delete cascade,
  name          text not null check (char_length(btrim(name)) between 1 and 120),
  kind          text not null default 'other' check (kind in ('corporation_tax', 'confirmation_statement', 'accounts', 'vat_return', 'other')),
  due_on        date not null,
  every         text not null default 'year' check (every in ('once', 'month', 'quarter', 'year')),
  amount_minor  bigint check (amount_minor is null or amount_minor between 0 and 100000000),
  done_on       date,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
comment on table public.company_deadlines is
  'Company deadlines (062), each added once with a repeat; shown in Needs you 2 weeks before. An amount shows on the cash flow (a tax date pays out the tax pot).';

-- ---------------------------------------------------------------- pricing
create table if not exists public.pricing_packages (
  id                    uuid primary key default gen_random_uuid(),
  coach_id              uuid not null references public.coaches (id) on delete cascade,
  sector                text check (char_length(sector) <= 40),
  name                  text not null check (char_length(btrim(name)) between 1 and 120),
  detail                text check (char_length(detail) <= 120),
  hours                 numeric(7, 2) check (hours is null or hours > 0 and hours <= 10000),
  per                   text not null default 'once' check (per in ('once', 'month', 'day')),
  org_price_minor       bigint check (org_price_minor is null or org_price_minor between 0 and 100000000),
  personal_price_minor  bigint check (personal_price_minor is null or personal_price_minor between 0 and 100000000),
  currency              text not null default 'GBP' check (currency in ('GBP', 'USD', 'EUR')),
  position              integer not null default 0 check (position between 0 and 1000000),
  archived              boolean not null default false,
  updated_at            timestamptz not null default now()
);
comment on table public.pricing_packages is
  'Packages and rates (062): organisations'' price (before VAT) and paying personally (including VAT), with the hours behind "About £750/hr". The products page reads its prices from here.';

create table if not exists public.pricing_changes (
  id          uuid primary key default gen_random_uuid(),
  coach_id    uuid not null references public.coaches (id) on delete cascade,
  label       text not null check (char_length(btrim(label)) between 1 and 160),
  percent     numeric(6, 2) check (percent is null or percent between -50 and 100),
  from_on     date,
  prices      jsonb not null default '[]'::jsonb check (jsonb_typeof(prices) = 'array' and pg_column_size(prices) <= 40000),
  created_at  timestamptz not null default now()
);

create table if not exists public.discounts (
  id            uuid primary key default gen_random_uuid(),
  coach_id      uuid not null references public.coaches (id) on delete cascade,
  name          text not null check (char_length(btrim(name)) between 1 and 80),
  percent       numeric(5, 2) check (percent is null or (percent > 0 and percent <= 100)),
  amount_minor  bigint check (amount_minor is null or amount_minor between 1 and 100000000),
  all_packages  boolean not null default true,
  package_ids   uuid[] not null default '{}' check (cardinality(package_ids) <= 200),
  archived      boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check ((percent is null) <> (amount_minor is null))
);
comment on table public.discounts is 'Named discounts (062), by percentage or a fixed amount, always shown as their own line under the full price. Never called charity.';

-- ---------------------------------------------------------------- proposals, the supplier pack, purchase orders
create table if not exists public.proposals (
  id               uuid primary key default gen_random_uuid(),
  coach_id         uuid not null references public.coaches (id) on delete cascade,
  kind             text not null default 'new' check (kind in ('new', 'renewal', 'price_review')),
  status           text not null default 'draft' check (status in ('draft', 'sent', 'won', 'lost')),
  lead_id          uuid references public.coach_leads (id) on delete set null,
  organisation_id  uuid references public.organisations (id) on delete set null,
  profile_id       uuid references public.client_profiles (id) on delete set null,
  agreement_id     uuid references public.agreements (id) on delete set null,
  title            text not null check (char_length(btrim(title)) between 1 and 200),
  lines            jsonb not null default '[]'::jsonb check (jsonb_typeof(lines) = 'array' and pg_column_size(lines) <= 20000),
  currency         text not null default 'GBP' check (currency in ('GBP', 'USD', 'EUR')),
  fx_rate          numeric(10, 6) check (fx_rate is null or (fx_rate > 0 and fx_rate < 10)),
  fx_at            timestamptz,
  total_minor      bigint check (total_minor is null or total_minor between 0 and 100000000),
  valid_until      date,
  share_token      text not null unique default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''))
                   check (share_token ~ '^[0-9a-f]{64}$'),
  opens            integer not null default 0 check (opens between 0 and 1000000),
  last_opened_at   timestamptz,
  sent_at          timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (currency = 'GBP' or (fx_rate is not null and fx_at is not null))
);
comment on table public.proposals is
  'Proposals for new work, renewals and yearly price reviews (062), with the exchange rate locked to the draft, a private share link (share_token, read only through proposal_open) and how often it was opened.';
create index if not exists proposals_coach_idx on public.proposals (coach_id, status);

create table if not exists public.supplier_pack_items (
  id          uuid primary key default gen_random_uuid(),
  coach_id    uuid not null references public.coaches (id) on delete cascade,
  kind        text not null default 'other' check (kind in ('business', 'bank_uk', 'bank_international', 'vat', 'insurance', 'dbs', 'policy', 'tax_form', 'other')),
  label       text not null check (char_length(btrim(label)) between 1 and 120),
  value       text check (char_length(value) <= 2000),
  file_path   text check (char_length(file_path) <= 500),
  expires_on  date,
  position    integer not null default 0 check (position between 0 and 1000000),
  updated_at  timestamptz not null default now()
);
comment on table public.supplier_pack_items is 'The supplier pack (062): business details, bank, VAT, insurance, DBS, policies and overseas tax forms, stored once, each with an optional expiry flagged in Needs you.';

create table if not exists public.purchase_orders (
  id               uuid primary key default gen_random_uuid(),
  coach_id         uuid not null references public.coaches (id) on delete cascade,
  organisation_id  uuid not null references public.organisations (id) on delete cascade,
  number           text not null check (char_length(btrim(number)) between 1 and 80),
  value_minor      bigint check (value_minor is null or value_minor between 0 and 100000000),
  currency         text not null default 'GBP' check (currency in ('GBP', 'USD', 'EUR')),
  starts_on        date,
  ends_on          date,
  finance_contact  text check (char_length(finance_contact) <= 160),
  invoice_email    text check (invoice_email is null or (char_length(invoice_email) <= 320 and invoice_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  supplier_ref     text check (char_length(supplier_ref) <= 80),
  portal_url       text check (portal_url is null or (char_length(portal_url) <= 500 and portal_url ~ '^https://[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+(:[0-9]{1,5})?(/[^\s"<>]*)?$')),
  status           text not null default 'open' check (status in ('open', 'closed')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organisation_id, number),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);
comment on table public.purchase_orders is 'An organisation''s purchase orders (062). The PO shows beside its invoices; one running low or ending is one quiet line in Needs you.';

-- ---------------------------------------------------------------- associates' pay
create table if not exists public.associate_statements (
  id                   uuid primary key default gen_random_uuid(),
  coach_id             uuid not null references public.coaches (id) on delete cascade,
  associate_id         uuid not null references public.coaches (id) on delete cascade,
  month                date not null check (extract(day from month) = 1),
  hours                numeric(7, 2) not null default 0 check (hours between 0 and 10000),
  rate_minor           bigint not null default 0 check (rate_minor between 0 and 10000000),
  late_cancel_minutes  integer not null default 0 check (late_cancel_minutes between 0 and 600000),
  no_show_minutes      integer not null default 0 check (no_show_minutes between 0 and 600000),
  total_minor          bigint not null default 0 check (total_minor between 0 and 100000000),
  lines                jsonb not null default '[]'::jsonb check (jsonb_typeof(lines) = 'array' and pg_column_size(lines) <= 20000),
  ready_on             date,
  paid_on              date,
  paid_minor           bigint check (paid_minor is null or paid_minor between 0 and 100000000),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (associate_id, month)
);
comment on table public.associate_statements is
  'An associate''s monthly statement (062): delivered hours (late cancellations that count paid as delivered; no-shows at the owner''s choice) at their hourly rate. The owner pays outside the portal and marks it paid; the associate reads their own.';

-- ---------------------------------------------------------------- on 061's tables, and the people
-- A payment made straight to the bank may have no invoice: who paid, what for, its sector and a receipt.
alter table public.payments alter column invoice_id drop not null;
alter table public.payments add column if not exists profile_id uuid references public.client_profiles (id) on delete set null;
alter table public.payments add column if not exists organisation_id uuid references public.organisations (id) on delete set null;
alter table public.payments add column if not exists payer_name text check (char_length(payer_name) <= 160);
alter table public.payments add column if not exists sector text check (char_length(sector) <= 40);
alter table public.payments add column if not exists what_for text check (char_length(what_for) <= 200);
alter table public.payments add column if not exists receipt_path text check (char_length(receipt_path) <= 500);
do $c$
begin
  if not exists (select 1 from pg_constraint where conname = 'payments_who_paid') then
    alter table public.payments add constraint payments_who_paid
      check (invoice_id is not null or profile_id is not null or organisation_id is not null or payer_name is not null);
  end if;
end
$c$;
-- A one-off invoice may be in euros and due on receipt (M11's New invoice): the three money tables take EUR, and an
-- invoice's terms may be 0 days. Agreements stay in pounds or dollars.
do $c$
begin
  alter table public.invoices drop constraint if exists invoices_currency_check;
  alter table public.invoices add constraint invoices_currency_check check (currency in ('GBP', 'USD', 'EUR'));
  alter table public.invoices drop constraint if exists invoices_terms_days_check;
  alter table public.invoices add constraint invoices_terms_days_check check (terms_days between 0 and 120);
  alter table public.payments drop constraint if exists payments_currency_check;
  alter table public.payments add constraint payments_currency_check check (currency in ('GBP', 'USD', 'EUR'));
  alter table public.credit_notes drop constraint if exists credit_notes_currency_check;
  alter table public.credit_notes add constraint credit_notes_currency_check check (currency in ('GBP', 'USD', 'EUR'));
end
$c$;
alter table public.invoices add column if not exists sector text check (char_length(sector) <= 40);
alter table public.invoices add column if not exists purchase_order_id uuid references public.purchase_orders (id) on delete set null;
alter table public.invoices add column if not exists proposal_id uuid references public.proposals (id) on delete set null;
alter table public.client_profiles add column if not exists sector text check (char_length(sector) <= 40);
alter table public.client_profiles add column if not exists country text check (country is null or country ~ '^[A-Z]{2}$');
alter table public.organisations add column if not exists sector text check (char_length(sector) <= 40);
alter table public.organisations add column if not exists country text check (country is null or country ~ '^[A-Z]{2}$');

-- ---------------------------------------------------------------- the owner's alone; an associate's own statements
do $rules$
declare t text;
begin
  foreach t in array array['finance_settings', 'finance_targets', 'finance_sectors', 'finance_outgoing_groups', 'finance_outgoings',
                           'bank_balance_checks', 'company_deadlines', 'pricing_packages', 'pricing_changes', 'discounts', 'proposals',
                           'supplier_pack_items', 'purchase_orders', 'associate_statements'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated, service_role', t);
    execute format('drop policy if exists "Owner alone" on public.%I', t);
    execute format('create policy "Owner alone" on public.%I for all to authenticated using (coach_id = (select public.my_coach_id()) and coalesce((select public.is_owner()), false)) with check (coach_id = (select public.my_coach_id()) and coalesce((select public.is_owner()), false))', t);
  end loop;
  execute 'drop policy if exists "Associate reads their own" on public.associate_statements';
  execute 'create policy "Associate reads their own" on public.associate_statements for select to authenticated using (associate_id = (select public.my_coach_id()))';
end
$rules$;

-- ---------------------------------------------------------------- a proposal's share link
-- Whoever has the link reads the proposal's own words and figures, only while it is sent, and each opening is counted.
-- The token is 64 random hex characters; nothing else about the coach, the lead or the business comes back.
create or replace function public.proposal_open(p_token text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  p record;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    return null;
  end if;
  -- Open while sent or won, and not past its "valid until" day (London); each opening counted, and noted on its lead
  -- as "Opened your proposal" so the CRM's watch sees it (functionality tester, run 2).
  -- Counted up to the column's limit (never an error), and noted on the lead at most once each half hour, so someone
  -- reloading the page never floods the CRM or sets off its "opened" automation by themselves (break-it tester).
  update public.proposals set opens = least(opens + 1, 1000000), last_opened_at = now()
  where share_token = p_token and status in ('sent', 'won')
    and (valid_until is null or valid_until >= (now() at time zone 'Europe/London')::date)
  returning *, (select pr.last_opened_at from public.proposals pr where pr.share_token = p_token) as was_opened_at into p;
  if not found then
    return null;
  end if;
  if p.lead_id is not null and (p.was_opened_at is null or p.was_opened_at < now() - interval '30 minutes') then
    insert into public.coach_lead_events (coach_id, lead_id, kind, title, data)
    values (p.coach_id, p.lead_id, 'proposal_opened', 'Opened your proposal', jsonb_build_object('name', left(p.title, 200), 'proposal_id', p.id));
  end if;
  return jsonb_build_object('title', p.title, 'lines', p.lines, 'currency', p.currency, 'total_minor', p.total_minor,
    'valid_until', p.valid_until, 'sent_at', p.sent_at,
    'coach_name', (select c.display_first_name from public.coaches c where c.id = p.coach_id));
end;
$$;
revoke all on function public.proposal_open(text) from public;
grant execute on function public.proposal_open(text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------- an associate's month, for the owner's statement
-- The owner can't read an associate's sessions (050), so each associate's delivered minutes for a month come from here:
-- held (or past with no outcome yet), late cancellations (counted as delivered unless waived) and no-shows (the owner decides whether they're paid),
-- in Europe/London months. Numbers only: never a client, a note or a time. The owner only, with the 6-digit code.
create or replace function public.associate_month_minutes(p_month date)
returns table (coach_id uuid, held_minutes integer, late_cancel_minutes integer, no_show_minutes integer, sessions integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.coach_code_ok() or not coalesce(public.is_owner(), false) or p_month is null or extract(day from p_month) <> 1 then
    return;
  end if;
  return query
    select s.coach_id,
      -- A past session with no outcome written yet counts as held until it's marked otherwise (the same rule as the
      -- forecast and the associate's own Today; UI tester, run 2).
      coalesce(sum(s.minutes) filter (where s.outcome = 'held' or (s.outcome is null and s.starts_at + make_interval(mins => s.minutes) <= now())), 0)::integer,
      coalesce(sum(s.minutes) filter (where s.outcome = 'late_cancel' and not coalesce(s.waived, false)), 0)::integer,
      coalesce(sum(s.minutes) filter (where s.outcome = 'no_show'), 0)::integer,
      count(*) filter (where s.outcome in ('held', 'late_cancel', 'no_show') or (s.outcome is null and s.starts_at + make_interval(mins => s.minutes) <= now()))::integer
    from public.coach_sessions s
    join public.coaches c on c.id = s.coach_id
    where c.role <> 'owner'
      and s.starts_at >= (p_month::timestamp at time zone 'Europe/London')
      and s.starts_at < ((p_month + interval '1 month')::timestamp at time zone 'Europe/London')
    group by s.coach_id;
end;
$$;
revoke all on function public.associate_month_minutes(date) from public, anon;
grant execute on function public.associate_month_minutes(date) to authenticated, service_role;


-- ---------------------------------------------------------------- the break-it tester's round (run 2, 25 Nov)
-- Every 062 table moves updated_at on each change (049's p1_touch), so a stale tab's save is spotted and refused by the
-- offline queue's "only if unchanged" check instead of silently undoing another device's edit.
do $t$
declare t text;
begin
  foreach t in array array['finance_settings', 'finance_targets', 'finance_outgoings', 'company_deadlines', 'pricing_packages',
                           'discounts', 'proposals', 'supplier_pack_items', 'purchase_orders', 'associate_statements'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.p1_touch()', t || '_touch', t);
  end loop;
end
$t$;

-- A discount is never called charity, however it is spelt: look-alike letters (Cyrillic, Greek, dotless i, digits)
-- read as their Latin twins and everything but letters taken out before the check.
create or replace function public.finance_name_says_charity(p_name text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(translate(lower(coalesce(p_name, '')), 'асеорхуіıјѕνοτ401|!$@', 'aceopxyiijsvotaoliisa'), '[^a-z]', '', 'g') ~ 'ch?ar[il]t';
$$;
do $c$
begin
  if not exists (select 1 from pg_constraint where conname = 'discounts_never_charity') then
    alter table public.discounts add constraint discounts_never_charity check (not public.finance_name_says_charity(name));
  end if;
  -- Receipts only in the coach's own folder of coach-files, as uploadReceipt names them.
  if not exists (select 1 from pg_constraint where conname = 'finance_outgoings_receipt_path_ok') then
    alter table public.finance_outgoings add constraint finance_outgoings_receipt_path_ok check (receipt_path is null
      or receipt_path ~ '^[0-9a-f-]{36}/finances/[a-z_]{1,20}/[0-9a-f-]{36}-[A-Za-z0-9_.-]{1,120}$' and receipt_path !~ '\.\.');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'payments_receipt_path_ok') then
    alter table public.payments add constraint payments_receipt_path_ok check (receipt_path is null
      or receipt_path ~ '^[0-9a-f-]{36}/finances/[a-z_]{1,20}/[0-9a-f-]{36}-[A-Za-z0-9_.-]{1,120}$' and receipt_path !~ '\.\.');
  end if;
  -- Days within reason (2000 to 2100), and a statement is never the owner's own.
  if not exists (select 1 from pg_constraint where conname = 'associate_statements_days_ok') then
    alter table public.associate_statements add constraint associate_statements_days_ok check (associate_id <> coach_id
      and month between date '2000-01-01' and date '2100-12-01'
      and (ready_on is null or ready_on between date '2000-01-01' and date '2100-12-31')
      and (paid_on is null or paid_on between date '2000-01-01' and date '2100-12-31'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'finance_targets_days_ok') then
    alter table public.finance_targets add constraint finance_targets_days_ok check (month between date '2000-01-01' and date '2100-12-01');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'finance_outgoings_days_ok') then
    alter table public.finance_outgoings add constraint finance_outgoings_days_ok check (starts_on between date '2000-01-01' and date '2100-12-31'
      and (ends_on is null or ends_on <= date '2100-12-31'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'company_deadlines_days_ok') then
    alter table public.company_deadlines add constraint company_deadlines_days_ok check (due_on between date '2000-01-01' and date '2100-12-31');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'bank_balance_checks_days_ok') then
    alter table public.bank_balance_checks add constraint bank_balance_checks_days_ok check (checked_on between date '2000-01-01' and date '2100-12-31');
  end if;
end
$c$;

-- A proposal only for the owner's own lead, client and agreement (never an associate's), and an organisation they see.
drop policy if exists "Owner alone" on public.proposals;
drop policy if exists "Owner alone, read" on public.proposals;
create policy "Owner alone, read" on public.proposals for select to authenticated
  using (coach_id = (select public.my_coach_id()) and coalesce((select public.is_owner()), false));
drop policy if exists "Owner alone, remove" on public.proposals;
create policy "Owner alone, remove" on public.proposals for delete to authenticated
  using (coach_id = (select public.my_coach_id()) and coalesce((select public.is_owner()), false));
drop policy if exists "Owner alone, own lead" on public.proposals;
create policy "Owner alone, own lead" on public.proposals for insert to authenticated with check (
  coach_id = (select public.my_coach_id()) and coalesce((select public.is_owner()), false)
  and (lead_id is null or exists (select 1 from public.coach_leads l where l.id = lead_id and l.coach_id = (select public.my_coach_id())))
  and (profile_id is null or exists (select 1 from public.client_profiles p where p.id = profile_id and p.coach_id = (select public.my_coach_id())))
  and (agreement_id is null or exists (select 1 from public.agreements a where a.id = agreement_id and a.coach_id = (select public.my_coach_id())))
  and (organisation_id is null or exists (select 1 from public.organisations o where o.id = organisation_id)));
drop policy if exists "Owner alone, own lead, change" on public.proposals;
create policy "Owner alone, own lead, change" on public.proposals for update to authenticated
  using (coach_id = (select public.my_coach_id()) and coalesce((select public.is_owner()), false))
  with check (
  coach_id = (select public.my_coach_id()) and coalesce((select public.is_owner()), false)
  and (lead_id is null or exists (select 1 from public.coach_leads l where l.id = lead_id and l.coach_id = (select public.my_coach_id())))
  and (profile_id is null or exists (select 1 from public.client_profiles p where p.id = profile_id and p.coach_id = (select public.my_coach_id())))
  and (agreement_id is null or exists (select 1 from public.agreements a where a.id = agreement_id and a.coach_id = (select public.my_coach_id())))
  and (organisation_id is null or exists (select 1 from public.organisations o where o.id = organisation_id)));
-- The share link is the database's own random token, never one the owner types.
create or replace function public.proposals_token_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.share_token := old.share_token;
  elsif current_user = 'authenticated' then
    new.share_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  end if;
  return new;
end;
$$;
drop trigger if exists proposals_token_guard on public.proposals;
create trigger proposals_token_guard before insert or update on public.proposals for each row execute function public.proposals_token_guard();

-- ---------------------------------------------------------------- the owner's starting lists
-- Each owner starts with the sectors and outgoing groups M11 draws, and the settings' defaults; nothing is added twice.
insert into public.finance_settings (coach_id)
select c.id from public.coaches c where c.role = 'owner'
on conflict (coach_id) do nothing;
insert into public.finance_sectors (coach_id, name, position)
select c.id, s.name, s.pos from public.coaches c
cross join (values ('Business', 1), ('Sport', 2), ('Medicine', 3), ('Personal', 4)) as s(name, pos)
where c.role = 'owner'
on conflict do nothing;
insert into public.finance_outgoing_groups (coach_id, name, position)
select c.id, g.name, g.pos from public.coaches c
cross join (values ('Associates', 1), ('Software', 2), ('Marketing', 3), ('Travel', 4), ('Training and supervision', 5),
                   ('Insurance and professional fees', 6), ('Your pay', 7), ('Tax', 8)) as g(name, pos)
where c.role = 'owner'
on conflict do nothing;

-- ---------------------------------------------------------------- 054's list, with 062's tables
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
    ('supplier_pack_items', 'coach'), ('purchase_orders', 'coach'), ('associate_statements', 'coach')
  ) as t(table_name, kind);
$$;
revoke all on function public.coach_code_tables() from public, anon;
grant execute on function public.coach_code_tables() to authenticated, service_role;

do $rules$
declare
  t text;
  v_name constant text := 'Coach data: needs the 6-digit code';
begin
  foreach t in array array['finance_settings', 'finance_targets', 'finance_sectors', 'finance_outgoing_groups', 'finance_outgoings',
                           'bank_balance_checks', 'company_deadlines', 'pricing_packages', 'pricing_changes', 'discounts', 'proposals',
                           'supplier_pack_items', 'purchase_orders', 'associate_statements'] loop
    execute format('drop policy if exists %I on public.%I', v_name, t);
    execute format('create policy %I on public.%I as restrictive for all to authenticated using ((select public.coach_code_ok())) with check ((select public.coach_code_ok()))', v_name, t);
  end loop;
end
$rules$;

select public.record_migration(62, '062_finances');
