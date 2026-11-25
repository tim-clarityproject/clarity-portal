-- Takes out part 6 (06-polish-practice.sql, Alex Morgan's invented practice) in one step: every row whose id starts
-- 5eed0600-, and the rows that hang off them (session notes, profile history, Network ratings). Leaves part 5's
-- standing accounts as they were (Sam's link to Alex stays). Named so seed.mjs never runs it as a numbered part:
--   node db.mjs --from <with-06.tar> --dump <out.tar> seed/remove-06-polish.sql
-- The invoice and quote counters go back to the next number after what is left; the agreement reference sequence
-- simply moves on. Local only: never run on a hosted database.
begin;
delete from public.agreement_link_opens where id::text like '5eed0600-%' or version_id::text like '5eed0600-%';
delete from public.agreement_quotes where id::text like '5eed0600-%' or agreement_id::text like '5eed0600-%';
delete from public.sponsor_signatures where id::text like '5eed0600-%' or version_id::text like '5eed0600-%';
delete from public.credit_notes where id::text like '5eed0600-%' or invoice_id::text like '5eed0600-%';
delete from public.payments where id::text like '5eed0600-%' or invoice_id::text like '5eed0600-%';
delete from public.invoices where id::text like '5eed0600-%';
delete from public.time_entries where id::text like '5eed0600-%' or engagement_id::text like '5eed0600-%';
delete from public.coach_session_notes where session_id::text like '5eed0600-%';
delete from public.coach_cal_items where id::text like '5eed0600-%' and travel_for is not null;
delete from public.coach_cal_items where id::text like '5eed0600-%';
delete from public.coach_sessions where id::text like '5eed0600-%';
update public.agreements set engagement_id = null where id::text like '5eed0600-%';
delete from public.agreement_versions where agreement_id::text like '5eed0600-%';
delete from public.agreements where id::text like '5eed0600-%';
delete from public.signatures where id::text like '5eed0600-%';
delete from public.engagements where id::text like '5eed0600-%';
delete from public.coach_todos where id::text like '5eed0600-%';
delete from public.coach_todo_lists where id::text like '5eed0600-%';
delete from public.coach_lead_events where id::text like '5eed0600-%' or lead_id::text like '5eed0600-%';
delete from public.coach_leads where id::text like '5eed0600-%';
-- Won can't be deleted on its own (it is always the last stage), only with its coach: the guard steps aside here.
set local session_replication_role = replica;
delete from public.coach_lead_stages where id::text like '5eed0600-%';
set local session_replication_role = origin;
delete from public.network_gives where id::text like '5eed0600-%' or person_id::text like '5eed0600-%';
delete from public.network_ratings where person_id::text like '5eed0600-%';
delete from public.network_people where id::text like '5eed0600-%';
delete from public.client_notes where id::text like '5eed0600-%' or profile_id::text like '5eed0600-%';
delete from public.client_profile_coaches where profile_id::text like '5eed0600-%';
delete from public.client_profiles where id::text like '5eed0600-%';
delete from public.purchase_orders where id::text like '5eed0600-%';
delete from public.org_billing_profiles where id::text like '5eed0600-%';
delete from public.organisation_contacts where id::text like '5eed0600-%';
delete from public.organisations where id::text like '5eed0600-%';
delete from public.pricing_packages where id::text like '5eed0600-%';
delete from public.agreement_extras where id::text like '5eed0600-%';
delete from public.discounts where id::text like '5eed0600-%';
delete from public.finance_outgoings where id::text like '5eed0600-%';
delete from public.company_deadlines where id::text like '5eed0600-%';
delete from public.finance_targets where id::text like '5eed0600-%';
delete from public.bank_balance_checks where id::text like '5eed0600-%';
delete from public.finance_settings where id::text like '5eed0600-%';
delete from public.coach_call_types where id::text like '5eed0600-%';
delete from public.coach_away where id::text like '5eed0600-%';
delete from public.coach_clients where id::text like '5eed0600-%';
delete from public.person_settings where user_id::text like '5eed0600-%';
delete from public.profiles where id::text like '5eed0600-%';
delete from auth.users where id::text like '5eed0600-%';
update public.invoice_number_counter set next_number = coalesce((select max(number) + 1 from public.invoices), 1201);
update public.quote_number_counter set next_number = coalesce((select max(number) + 1 from public.agreement_quotes), 1);
commit;
do $$ begin raise notice 'SEED part 6 removed: % rows with its ids left', (select count(*) from public.client_profiles where id::text like '5eed0600-%')
  + (select count(*) from public.invoices where id::text like '5eed0600-%') + (select count(*) from auth.users where id::text like '5eed0600-%'); end $$;
