-- =============================================================================
-- 046_guest_reopen_test.sql: checks migration 046
--
-- Run after 046, on the test project only, inside a transaction that is
-- rolled back. To check that 046 is safe to run twice, run it twice first:
--   bash scripts/dry-run-on-test.sh supabase/migrations/046_guest_reopen.sql \
--     supabase/migrations/046_guest_reopen.sql supabase/046_guest_reopen_test.sql
--
-- WHAT IT DOES
--   Makes invented people (a coach, the owner, a client, guests with
--   example.com addresses) and checks:
--   R. reopening a link: while the guest shares with the coach, the link, the
--      email and the code bring back that link's earlier answers (read,
--      changed, deleted); once it is Only you they stay hidden until the email
--      is confirmed with the 6-digit code (guest_open says 'earlier_hidden');
--      another link's work, and work through other links, still needs the
--      email confirmed.
--   C. a link made for one email: it opens only with that email; the copy
--      goes only to it; a link made without one sends no copy; only a coach
--      may make one, with an email that looks right; the address is never
--      handed back.
--   G. who may call the new functions.
--   Everything it makes is undone at the end.
--
--   It ends with the notice 046 CHECKS PASSED, or stops with FAILED and a
--   list naming each check that failed.
-- =============================================================================

-- ---------------------------------------------------------------- helpers
create or replace function pg_temp.t_as(p uuid) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated', 'aal', 'aal2')::text, true);  -- 054: signed in with the code
  perform set_config('role', 'authenticated', true);
end $f$;
create or replace function pg_temp.t_anon() returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('role', 'anon', true);
end $f$;
create or replace function pg_temp.t_service() returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  perform set_config('role', 'service_role', true);
end $f$;
create or replace function pg_temp.t_admin() returns void language plpgsql as $f$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
end $f$;
create or replace function pg_temp.t_user(p_label text) returns uuid language plpgsql as $f$
declare u uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, aud, role, email_confirmed_at)
  values (u, '046-test-' || p_label || '-' || u || '@example.invalid', 'authenticated', 'authenticated', now());
  update public.profiles set first_name = initcap(p_label), last_name = 'Test' where id = u;
  return u;
end $f$;
create or replace function pg_temp.t_n(p_sql text) returns text language plpgsql as $f$
declare v text;
begin
  execute p_sql into v;
  return coalesce(v, 'null');
exception when others then
  return 'error ' || sqlstate;
end $f$;
create or replace function pg_temp.t_eq(p_name text, p_got text, p_want text) returns text[] language sql as $f$
  select case when p_got is distinct from p_want
              then array[format('%s: expected %s, got %s', p_name, p_want, coalesce(p_got, 'nothing'))]
              else '{}'::text[] end;
$f$;
create or replace function pg_temp.t_tok(j jsonb) returns text language sql as $f$ select substr(j ->> 'link_path', 8) $f$;

-- ---------------------------------------------------------------- the checks
do $t$
declare
  f text[] := '{}';
  owner_u uuid; client_u uuid;
  l1 jsonb; l2 jsonb; l3 jsonb; l4 jsonb;
  v1 text; v1b text; v1c text; v2 text; v3 text; v3b text; v4 text;
  d1 jsonb; d2 jsonb; d3 jsonb; j jsonb; code text;
begin
  begin
    owner_u := pg_temp.t_user('owner'); client_u := pg_temp.t_user('client');
    insert into public.coaches (user_id, role, display_first_name) values (owner_u, 'owner', 'Alex');

    -- ------------------------------------------------ R. reopening, shared with the coach
    perform pg_temp.t_as(owner_u);
    l1 := public.guest_link_create('grow', 'reopen.guest@example.com');
    perform pg_temp.t_anon();
    j := public.guest_open(pg_temp.t_tok(l1), 'reopen.guest@example.com', l1 ->> 'code');
    v1 := j ->> 'visit';
    f := f || pg_temp.t_eq('R1a a first opening has nothing hidden', j ->> 'earlier_hidden', 'false');
    d1 := public.guest_save(v1, 'decisions', '{"title": "046 plan", "form_data": {"goal": "Hire faster"}}');
    -- the next day, in another tab or on another device: a new visit
    j := public.guest_open(pg_temp.t_tok(l1), 'reopen.guest@example.com', l1 ->> 'code');
    v1b := j ->> 'visit';
    f := f || pg_temp.t_eq('R1b opening again, shared: nothing hidden', j ->> 'earlier_hidden', 'false');
    f := f || pg_temp.t_eq('R1c ... the earlier answers come back', (select string_agg(o ->> 'title', ',') from jsonb_array_elements(public.guest_rows(v1b, 'decisions')) o), '046 plan');
    f := f || pg_temp.t_eq('R1d ... and can be changed', public.guest_save(v1b, 'decisions', jsonb_build_object('id', d1 ->> 'id', 'title', '046 plan, later')) ->> 'title', '046 plan, later');
    -- another link of the same guest: its work stays its own
    perform pg_temp.t_as(owner_u);
    l2 := public.guest_link_create('grow', 'reopen.guest@example.com');
    perform pg_temp.t_anon();
    v2 := public.guest_open(pg_temp.t_tok(l2), 'reopen.guest@example.com', l2 ->> 'code') ->> 'visit';
    f := f || pg_temp.t_eq('R1e a new link starts fresh: the other link''s work doesn''t show', jsonb_array_length(public.guest_rows(v2, 'decisions'))::text, '0');
    f := f || pg_temp.t_eq('R1f ... nor can it be changed from there', pg_temp.t_n(format('select public.guest_save(%L, ''decisions'', %L) ->> ''id''', v2, jsonb_build_object('id', d1 ->> 'id', 'title', 'x'))), 'error 42501');

    -- ------------------------------------------------ R2. Only you: hidden until the email is confirmed
    perform public.guest_set_sharing(v1b, false);
    j := public.guest_open(pg_temp.t_tok(l1), 'reopen.guest@example.com', l1 ->> 'code');
    v1c := j ->> 'visit';
    f := f || pg_temp.t_eq('R2a opening again after Only you says the earlier answers are hidden', j ->> 'earlier_hidden', 'true');
    f := f || pg_temp.t_eq('R2b ... and shows none of them (the coach knows the code)', jsonb_array_length(public.guest_rows(v1c, 'decisions'))::text, '0');
    f := f || pg_temp.t_eq('R2c ... nor lets them be changed', pg_temp.t_n(format('select public.guest_save(%L, ''decisions'', %L) ->> ''id''', v1c, jsonb_build_object('id', d1 ->> 'id', 'title', 'x'))), 'error 42501');
    f := f || pg_temp.t_eq('R2d ... nor deleted', public.guest_delete_link_answers(v1c)::text, '0');
    perform pg_temp.t_service();
    f := f || pg_temp.t_eq('R2e ... nor sent as a copy', public.guest_copy_issue(v1c) ->> 'error', 'nothing');
    j := public.guest_email_code_issue(v1c);
    code := j ->> 'code';
    f := f || pg_temp.t_eq('R2g the server gets a 6-digit code for the guest''s own email', (code ~ '^[0-9]{6}$')::text || ' ' || (j ->> 'email'), 'true reopen.guest@example.com');
    perform pg_temp.t_anon();
    f := f || pg_temp.t_eq('R2h the right code confirms the email', public.guest_email_confirm(v1c, code) ->> 'ok', 'true');
    f := f || pg_temp.t_eq('R2i ... and the earlier answers come back', (select string_agg(o ->> 'title', ',') from jsonb_array_elements(public.guest_rows(v1c, 'decisions')) o), '046 plan, later');
    -- back to shared: a new visit sees them again without a code
    perform public.guest_set_sharing(v1c, true);
    f := f || pg_temp.t_eq('R2j shared again: a new visit sees them with the link''s code alone',
      jsonb_array_length(public.guest_rows(public.guest_open(pg_temp.t_tok(l1), 'reopen.guest@example.com', l1 ->> 'code') ->> 'visit', 'decisions'))::text, '1');

    -- ------------------------------------------------ R3. deleting from a reopened, shared visit
    perform pg_temp.t_as(owner_u);
    l4 := public.guest_link_create('grow', 'delete.guest@example.com');
    perform pg_temp.t_anon();
    v4 := public.guest_open(pg_temp.t_tok(l4), 'delete.guest@example.com', l4 ->> 'code') ->> 'visit';
    perform public.guest_save(v4, 'decisions', '{"title": "To delete", "form_data": {}}');
    v4 := public.guest_open(pg_temp.t_tok(l4), 'delete.guest@example.com', l4 ->> 'code') ->> 'visit';
    f := f || pg_temp.t_eq('R3a Delete my answers on a reopened, shared visit takes the link''s answers', public.guest_delete_link_answers(v4)::text, '1');

    -- ------------------------------------------------ C. a link made for one email
    perform pg_temp.t_as(owner_u);
    l3 := public.guest_link_create('grow', ' For.One@Example.com ');
    f := f || pg_temp.t_eq('C1a the answer never hands the address back', (l3::text ilike '%for.one%')::text, 'false');
    perform pg_temp.t_admin();
    f := f || pg_temp.t_eq('C1b the link keeps the address, lowercased', pg_temp.t_n(format('select for_email from public.guest_links where id = %L', l3 ->> 'link_id')), 'for.one@example.com');
    perform pg_temp.t_anon();
    f := f || pg_temp.t_eq('C1c another email can''t open it, even first', public.guest_open(pg_temp.t_tok(l3), 'forwarded.to@example.com', l3 ->> 'code') ->> 'error', 'invalid');
    j := public.guest_open(pg_temp.t_tok(l3), 'for.one@example.com', l3 ->> 'code');
    v3 := j ->> 'visit';
    f := f || pg_temp.t_eq('C1d the email it was made for opens it', j ->> 'ok', 'true');
    d3 := public.guest_save(v3, 'decisions', '{"title": "For one", "form_data": {"goal": "x"}}');
    perform pg_temp.t_service();
    j := public.guest_copy_issue(v3);
    f := f || pg_temp.t_eq('C2a the copy goes to the address the link was made for', (j ->> 'ok') || ' ' || (j ->> 'email'), 'true for.one@example.com');
    -- a link made before 046, or without an address: no copy at all
    perform pg_temp.t_as(owner_u);
    l2 := public.guest_link_create('grow');
    perform pg_temp.t_anon();
    v3b := public.guest_open(pg_temp.t_tok(l2), 'typed.by.anyone@example.com', l2 ->> 'code') ->> 'visit';
    perform public.guest_save(v3b, 'decisions', '{"title": "No address", "form_data": {"goal": "x"}}');
    perform pg_temp.t_service();
    f := f || pg_temp.t_eq('C2b a link made without an address sends no copy: nothing typed is used', public.guest_copy_issue(v3b) ->> 'error', 'no_address');
    perform pg_temp.t_admin();
    f := f || pg_temp.t_eq('C2c ... and nothing was counted for it', pg_temp.t_n(format('select count(*) from public.guest_copy_sends where link_id = %L', l2 ->> 'link_id')), '0');
    perform pg_temp.t_as(owner_u);
    f := f || pg_temp.t_eq('C3a an email that doesn''t look right is refused', pg_temp.t_n('select public.guest_link_create(''grow'', ''not an email'') ->> ''code'''), 'error 22023');
    perform pg_temp.t_as(client_u);
    f := f || pg_temp.t_eq('C3b a client can''t make one', pg_temp.t_n('select public.guest_link_create(''grow'', ''x@example.com'') ->> ''code'''), 'error 42501');
    perform pg_temp.t_anon();
    f := f || pg_temp.t_eq('C3c nor someone signed out', pg_temp.t_n('select public.guest_link_create(''grow'', ''x@example.com'') ->> ''code'''), 'error 42501');

    -- ------------------------------------------------ G. who may call what
    perform pg_temp.t_admin();
    f := f || pg_temp.t_eq('G1 nobody signed in or out calls the new helper directly (as 035''s helpers)', pg_temp.t_n($q$
      select coalesce(string_agg(r.rolname, ','), 'none') from (select unnest(array['anon', 'authenticated']) as rolname) r
      where has_function_privilege(r.rolname, 'public._guest_link_shared(public.guest_visits, uuid)', 'execute')$q$), 'none');
    f := f || pg_temp.t_eq('G2 a coach (signed in) makes a link for an email; nobody signed out', pg_temp.t_n($q$
      select string_agg(r.rolname, ',' order by r.rolname) from (select unnest(array['anon', 'authenticated']) as rolname) r
      where has_function_privilege(r.rolname, 'public.guest_link_create(text, text)', 'execute')$q$), 'authenticated');
    f := f || pg_temp.t_eq('G3 the copy is still the server''s alone', pg_temp.t_n($q$
      select string_agg(r.rolname, ',' order by r.rolname) from (select unnest(array['anon', 'authenticated', 'service_role']) as rolname) r
      where has_function_privilege(r.rolname, 'public.guest_copy_issue(text)', 'execute')$q$), 'service_role');
    f := f || pg_temp.t_eq('G4 every changed function runs with a fixed search path, as the owner', pg_temp.t_n($q$
      select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace
        and p.proname in ('_guest_link_shared', '_guest_sees', 'guest_rows', 'guest_delete_link_answers', 'guest_copy_issue', 'guest_link_create', 'guest_open')
        and p.prosecdef and p.proconfig @> array['search_path=""']$q$), '8');
    f := f || pg_temp.t_eq('G5 recorded in the migration log', pg_temp.t_n('select count(*) from public.migration_log where number = 46'), '1');

    raise exception using errcode = 'TT001', message = 'undo the test';
  exception when sqlstate 'TT001' then null;
  end;
  perform pg_temp.t_admin();
  if cardinality(f) > 0 then
    raise exception 'FAILED (% of the checks): %', cardinality(f), array_to_string(f, ' | ');
  end if;
  raise notice '046 CHECKS PASSED';
end
$t$;
