-- =============================================================================
-- 031_evidence_library_test.sql
-- Checks 031_evidence_library.sql. RUN ORDER: 026 to 031, then this.
--
-- WHAT IT DOES
--   Checks the library holds the claims register version 1.1 exactly (its
--   counts and some wording word for word; `node scripts/make-evidence-seed.mjs
--   --check` compares every row with docs/claims-register.md), and who can
--   read and change it. Everything it makes is undone at the end.
--
--   It ends with the notice ALL CHECKS PASSED, or stops with FAILED and a
--   list naming each check that failed.
-- =============================================================================

-- ---------------------------------------------------------------- helpers
-- Temporary (this session only). t_as acts as a signed-in person, as
-- Supabase does for the app; t_anon as someone signed out; t_admin goes
-- back to the admin role. t_n runs a query and returns its first value as
-- text, t_rows runs a change and returns how many rows it changed; both
-- return 'error <code>' instead of stopping (42501 means refused).
create or replace function pg_temp.t_as(p uuid) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $f$;
create or replace function pg_temp.t_anon() returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('role', 'anon', true);
end $f$;
create or replace function pg_temp.t_admin() returns void language plpgsql as $f$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
end $f$;
create or replace function pg_temp.t_user(p_label text) returns uuid language plpgsql as $f$
declare u uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, aud, role)
  values (u, 'p1-test-' || p_label || '-' || u || '@example.invalid', 'authenticated', 'authenticated');
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
create or replace function pg_temp.t_rows(p_sql text) returns text language plpgsql as $f$
declare n bigint;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n::text;
exception when others then
  return 'error ' || sqlstate;
end $f$;
create or replace function pg_temp.t_eq(p_name text, p_got text, p_want text) returns text[] language sql as $f$
  select case when p_got is distinct from p_want
              then array[format('%s: expected %s, got %s', p_name, p_want, coalesce(p_got, 'nothing'))]
              else '{}'::text[] end;
$f$;

-- ---------------------------------------------------------------- the checks
do $t$
declare
  f text[] := '{}';
  owner_u uuid; coach_u uuid; client_u uuid;
begin
  begin
    owner_u := pg_temp.t_user('owner'); coach_u := pg_temp.t_user('coach'); client_u := pg_temp.t_user('client');
    insert into public.coaches (user_id, role, display_first_name) values (owner_u, 'owner', 'Owner'), (coach_u, 'coach', 'Coach');

    -- ------------------------------------------------ 1. the seed, as the register
    f := f || pg_temp.t_eq('1a counts: references, claims, claim links, tools, tool links, flagged tools', pg_temp.t_n($q$select concat_ws(',',
      (select count(*) from public.evidence_references), (select count(*) from public.evidence_claims),
      (select count(*) from public.evidence_claim_references), (select count(*) from public.evidence_tools),
      (select count(*) from public.evidence_tool_claims), (select count(*) from public.evidence_tools where flagged))$q$), '33,46,39,37,69,21');
    f := f || pg_temp.t_eq('1b C1 word for word', pg_temp.t_n('select wording from public.evidence_claims where id = ''C1'''), 'Tracking your progress makes you more likely to reach your goals, especially when you record it or share it.');
    f := f || pg_temp.t_eq('1c C1 strength as written', pg_temp.t_n('select strength || '' / '' || strength_level from public.evidence_claims where id = ''C1'''), 'Moderate (close to strong) / moderate');
    f := f || pg_temp.t_eq('1d C9''s caveat word for word', pg_temp.t_n('select caveat from public.evidence_claims where id = ''C9'''), 'Few studies measured time to a habit, many at high risk of bias; the time varied from days to most of a year. Never say "66 days" as a rule.');
    f := f || pg_temp.t_eq('1e R26 as listed', pg_temp.t_n('select checked_on from public.evidence_references where id = ''R26'''), 'Book''s contents page, checked by Tim on the publisher''s preview, 26 Oct 2026');
    f := f || pg_temp.t_eq('1f R3 keeps both links', pg_temp.t_n('select cardinality(links) from public.evidence_references where id = ''R3'''), '2');
    f := f || pg_temp.t_eq('1g claims by strength (strong, moderate, early, our model)', pg_temp.t_n($q$select concat_ws(',', count(*) filter (where strength_level = 'strong'), count(*) filter (where strength_level = 'moderate'), count(*) filter (where strength_level = 'early'), count(*) filter (where strength_level = 'our_model')) from public.evidence_claims$q$), '11,16,6,13');
    f := f || pg_temp.t_eq('1h the check-in''s claims (C20 to C24 expanded)', pg_temp.t_n('select string_agg(claim_id, '','' order by claim_id) from public.evidence_tool_claims where tool_key = ''hardware_and_software_check_in'''), 'C11,C20,C21,C22,C23,C24,C30,C47');
    f := f || pg_temp.t_eq('1i no C34 (the register has none)', pg_temp.t_n('select count(*) from public.evidence_claims where id = ''C34'''), '0');

    -- ------------------------------------------------ 2. who reads and changes it
    perform pg_temp.t_as(client_u);
    f := f || pg_temp.t_eq('2a a client can''t read the library', pg_temp.t_n('select count(*) from public.evidence_claims'), '0');
    f := f || pg_temp.t_eq('2b a client reads a tool''s Why this works', pg_temp.t_n('select (j ->> ''tool'') || '' '' || jsonb_array_length(j -> ''claims'') || '' '' || jsonb_array_length(j -> ''claims'' -> 0 -> ''references'') from public.why_this_works(''breathe'') j'), 'Breathe 1 1');
    f := f || pg_temp.t_eq('2c an unknown tool gives nothing', pg_temp.t_n('select public.why_this_works(''no_such_tool'') is null'), 'true');
    perform pg_temp.t_as(coach_u);
    f := f || pg_temp.t_eq('2d a coach reads the library', pg_temp.t_n('select count(*) from public.evidence_claims'), '46');
    f := f || pg_temp.t_eq('2e a coach can''t change it', pg_temp.t_rows('update public.evidence_claims set wording = ''x'' where id = ''C1'''), '0');
    f := f || pg_temp.t_eq('2f a coach can''t switch Why this works off', pg_temp.t_rows('update public.evidence_tools set why_this_works_visible = false where key = ''breathe'''), '0');
    perform pg_temp.t_as(owner_u);
    f := f || pg_temp.t_eq('2g the owner switches it off', pg_temp.t_rows('update public.evidence_tools set why_this_works_visible = false where key = ''breathe'''), '1');
    f := f || pg_temp.t_eq('2h the owner adds a reference', pg_temp.t_rows('insert into public.evidence_references (id, citation) values (''R99'', ''Invented, for the test'')'), '1');
    perform pg_temp.t_as(client_u);
    f := f || pg_temp.t_eq('2i switched off: hidden from clients', pg_temp.t_n('select public.why_this_works(''breathe'') is null'), 'true');
    perform pg_temp.t_as(owner_u);
    f := f || pg_temp.t_eq('2j the record stays', pg_temp.t_n('select count(*) from public.evidence_tools where key = ''breathe'''), '1');
    perform pg_temp.t_anon();
    f := f || pg_temp.t_eq('3a signed out reads nothing', pg_temp.t_n('select public.why_this_works(''journal'')'), 'error 42501');

    raise exception using errcode = 'TT001', message = 'undo the test';
  exception when sqlstate 'TT001' then null;
  end;
  perform pg_temp.t_admin();
  if cardinality(f) > 0 then
    raise exception 'FAILED (% of the checks): %', cardinality(f), array_to_string(f, ' | ');
  end if;
  raise notice 'ALL CHECKS PASSED';
end
$t$;
