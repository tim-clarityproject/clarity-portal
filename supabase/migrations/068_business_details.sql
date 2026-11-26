-- =============================================================================
-- 068_business_details.sql
-- Polish 1, Stage C (the PDFs, approved by Tim on 25 Nov, 16:54): the business's
-- own details that every invoice, quotation, agreement and report prints, kept
-- in the coach's Settings, Business, never written into the code.
--
-- WHAT IT DOES (additive, safe to run twice)
--   1. finance_settings (062, the owner's one row) gains nine columns, each
--      empty until the owner types it in Settings, Business:
--        company_name         "The Clarity Project LTD" (the footer, From)
--        company_number       Companies House number (the footer)
--        website              "theclarityproject.co.uk" (the footer's link)
--        invoice_email        where questions and remittance advice go
--        vat_number           once VAT registered (vat_registered is 062's)
--        bank_name            "Example Bank plc"
--        bank_account_name    the name on the account
--        bank_sort_code       00-00-00
--        bank_account_number  eight digits
--      The row's rules are 062's: the owner's alone, with the 6-digit code.
--      The server reads it with its own key to make a PDF.
--   2. business_facts(): what any signed-in person's own documents print about
--      the business, for PDFs made in the browser (a client's weekly debrief,
--      their agreement before signing): the name, company number, website and
--      email only. Never the bank details or anything else of the settings.
--      Closed to anyone signed out.
-- No other table, column or rule changes.
-- =============================================================================

alter table public.finance_settings add column if not exists company_name text;
alter table public.finance_settings add column if not exists company_number text;
alter table public.finance_settings add column if not exists website text;
alter table public.finance_settings add column if not exists invoice_email text;
alter table public.finance_settings add column if not exists vat_number text;
alter table public.finance_settings add column if not exists bank_name text;
alter table public.finance_settings add column if not exists bank_account_name text;
alter table public.finance_settings add column if not exists bank_sort_code text;
alter table public.finance_settings add column if not exists bank_account_number text;

do $c$
begin
  if not exists (select 1 from pg_constraint where conname = 'finance_settings_business_ok') then
    alter table public.finance_settings add constraint finance_settings_business_ok check (
      (company_name is null or char_length(company_name) between 1 and 120)
      and (company_number is null or company_number ~ '^[A-Z0-9]{6,10}$')
      and (website is null or (char_length(website) between 4 and 120 and website !~ '\s'))
      and (invoice_email is null or (char_length(invoice_email) <= 254 and invoice_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'))
      and (vat_number is null or vat_number ~ '^[A-Z]{0,2}[0-9 ]{6,14}$')
      and (bank_name is null or char_length(bank_name) between 1 and 120)
      and (bank_account_name is null or char_length(bank_account_name) between 1 and 120)
      and (bank_sort_code is null or bank_sort_code ~ '^[0-9]{2}-[0-9]{2}-[0-9]{2}$')
      and (bank_account_number is null or bank_account_number ~ '^[0-9]{8}$')
    );
  end if;
end
$c$;

comment on column public.finance_settings.company_number is
  'The business''s Companies House number (068), printed in every PDF''s footer. Typed in Settings, Business; never hard-coded.';
comment on column public.finance_settings.bank_sort_code is
  'The business''s bank details (068), printed in an invoice''s Payment details. The owner''s alone; read by the server to make a PDF.';

create or replace function public.business_facts()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select jsonb_strip_nulls(jsonb_build_object(
      'company_name', s.company_name, 'company_number', s.company_number,
      'website', s.website, 'invoice_email', s.invoice_email))
    from public.finance_settings s
    join public.coaches c on c.id = s.coach_id
    where c.role = 'owner'
    order by c.created_at
    limit 1
  ), '{}'::jsonb)
  where auth.uid() is not null;
$$;
comment on function public.business_facts() is
  'What a signed-in person''s own PDFs print about the business (068): its name, company number, website and email. Never the bank details.';
revoke all on function public.business_facts() from public, anon;
grant execute on function public.business_facts() to authenticated, service_role;

select public.record_migration(68, '068_business_details');
