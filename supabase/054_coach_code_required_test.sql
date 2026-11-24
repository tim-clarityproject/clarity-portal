-- =============================================================================
-- 054_coach_code_required_test.sql
-- Checks 054_coach_code_required.sql. RUN ORDER: 026 to 053, then 054, then
-- this. Safe to run again: everything it makes is undone at the end.
--
-- WHAT IT DOES
--   Makes an invented owner (Tess), two associates (Maya and Nina), two
--   clients with accounts (Sam, Maya's client, and Ola, Nina's) and someone
--   signed out, and checks:
--     1. the rule is on every coach table: each table named in
--        coach_code_tables() has "Coach data: needs the 6-digit code", as
--        restrictive, for signed-in people, for everything; the server's own
--        tables stay shut; and every coach table there is, by its name or in
--        the coach portal's list, is named there (a later coach table added
--        without the rule fails here); every function anyone signed in can
--        call that looks a coach up for itself asks for the code, or is on
--        the short list of client, public and sign-in functions; it
--        recorded itself;
--     2. a coach at aal1 (password only) reads nothing and writes nothing
--        in any coach table, and every coach function refuses or answers
--        nothing, the coach's reads of what clients share included;
--     3. the same coach at aal1 still has what the sign-in screens need:
--        their own coaches row, coach_auth_state(), 'needs_code' from Turn
--        it on, new codes and the owner's reset, a recovery code, the saved
--        tick, and their own authenticator rows;
--     4. at aal2 the same coach reads and writes as before;
--     5. a client at aal1 is unaffected: their own profile, who their coach
--        is, For next time, the /coaching page's functions, may_see on
--        their own data;
--     6. someone signed out still opens the public pages' functions;
--     7. who sees what is unchanged at aal2: an associate sees only their
--        own clients, the owner only the admin facts of an associate's
--        clients (never their notes or About them).
--
--   It ends with the notice 054 CHECKS PASSED, or stops with FAILED and a
--   list naming each check that failed.
-- =============================================================================
create or replace function pg_temp.t_as(p uuid, p_aal text default 'aal1') returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated', 'aal', p_aal)::text, true);
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
  insert into auth.users (id, email, aud, role, email_confirmed_at)
  values (u, 'p6a-test-' || p_label || '-' || u || '@example.invalid', 'authenticated', 'authenticated', now());
  return u;
end $f$;
-- One value, or 'error SQLSTATE'.
create or replace function pg_temp.t_n(p_sql text) returns text language plpgsql as $f$
declare v text;
begin
  execute p_sql into v;
  return coalesce(v, 'null');
exception when others then
  return 'error ' || sqlstate;
end $f$;
-- Rows touched, or 'error SQLSTATE'.
create or replace function pg_temp.t_rows(p_sql text) returns text language plpgsql as $f$
declare n bigint;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n::text;
exception when others then
  return 'error ' || sqlstate;
end $f$;
-- 'nothing' when a call is refused or answers nothing (no rows, null,
-- false, an empty list, or a jsonb with nothing in it); otherwise what it gave.
create or replace function pg_temp.t_nothing(p_sql text) returns text language plpgsql as $f$
declare v text; n bigint;
begin
  execute format('select count(*), max(x::text) from (%s) x', p_sql) into n, v;
  if n = 0 or v is null or v in ('(f)', '()', '(null)', '("")', '({})', '([])', '("[]")', '("{}")') then
    return 'nothing';
  end if;
  return 'gave ' || left(v, 80);
exception when others then
  return 'nothing';
end $f$;
create or replace function pg_temp.t_eq(p_name text, p_got text, p_want text) returns text[] language sql as $f$
  select case when p_got is distinct from p_want
              then array[format('%s: expected %s, got %s', p_name, p_want, coalesce(p_got, 'nothing'))]
              else '{}'::text[] end;
$f$;

do $t$
declare
  f text[] := '{}';
  t record;
  v text;
  q text;
  -- What anyone signed in may call that looks a coach up for itself without
  -- asking for the code: the clients' own functions, the public pages', and
  -- the sign-in screens' coach_auth_state(). A new coach function that looks
  -- a coach up must ask coach_code_ok() (or a check that does), or be added
  -- here with its reason.
  direct_ok text[] := array[
    'booking_mine', 'booking_page', 'poll_page',                       -- public pages: the coach's first name only
    'proposal_open',                                                   -- 062: a proposal's share link, its own words and the coach's first name
    'coach_auth_state',                                                -- the sign-in screens, before the code
    'my_coach', 'my_coach_invites', 'my_cover_asks', 'my_session_recaps',
    'my_sessions_coming', 'my_suggestions', 'my_view_asks',            -- a client's own coaching
    'own_suggestion_coach_current',                                    -- 058: whether a client's own coach still coaches them
    -- coach functions that ask a gated check (is_owner, is_coach, my_coach_id, my_owner_coach_id) first
    'client_add_for', 'client_move', 'coach_admin_clients', 'coach_list', 'coach_profile_decide',
    'coach_switch', 'coach_save_capacity', 'coach_email_addresses_start'];
  gated_checks text[] := array['is_coach', 'is_owner', 'is_coach_of', 'my_coach_id', 'my_owner_coach_id',
    'coach_owns_profile', 'covers_profile', 'coach_has_client_in'];
  -- Coach functions, each called at aal1: every one must refuse or answer nothing.
  calls text[];
  tess_u uuid; maya_u uuid; nina_u uuid; sam_u uuid; ola_u uuid;
  tess_c uuid; maya_c uuid; nina_c uuid;
  p_sam uuid := gen_random_uuid(); p_ola uuid := gen_random_uuid();
  todo_m uuid := gen_random_uuid(); note_m uuid := gen_random_uuid();
  lead_m uuid := gen_random_uuid(); net_t uuid := gen_random_uuid();
  sess_m uuid := gen_random_uuid();
begin
  -- ---------------------------------------------------------------- 1. the rule is everywhere it must be
  for t in select * from public.coach_code_tables() loop
    if to_regclass('public.' || t.table_name) is null then
      f := f || format('1a %s is named but isn''t here', t.table_name);
      continue;
    end if;
    f := f || pg_temp.t_eq('1a ' || t.table_name || ' has row security',
      (select relrowsecurity::text from pg_class where oid = ('public.' || t.table_name)::regclass), 'true');
    if t.kind = 'closed' then
      f := f || pg_temp.t_eq('1b ' || t.table_name || ' stays the server''s alone: no rule, no grant',
        (select concat((select count(*) from pg_policies where schemaname = 'public' and tablename = t.table_name), '/',
                       (select count(*) from information_schema.role_table_grants where table_schema = 'public' and table_name = t.table_name
                          and grantee in ('anon', 'authenticated', 'public')))), '0/0');
    else
      f := f || pg_temp.t_eq('1b ' || t.table_name || ' has the code rule, restrictive, for signed-in people, for everything',
        (select concat(permissive, '/', array_to_string(roles, ','), '/', cmd, '/', (qual like '%coach_code_ok()%')::text, '/', (with_check like '%coach_code_ok()%')::text)
           from pg_policies where schemaname = 'public' and tablename = t.table_name and policyname = 'Coach data: needs the 6-digit code'),
        'RESTRICTIVE/authenticated/ALL/true/true');
      f := f || pg_temp.t_eq('1c ' || t.table_name || ': only its own side passes without the code',
        (select (case when t.kind = 'coach' then qual = '( SELECT coach_code_ok() AS coach_code_ok)' else qual like '(( SELECT coach_code_ok() AS coach_code_ok) OR %' end)::text
           from pg_policies where schemaname = 'public' and tablename = t.table_name and policyname = 'Coach data: needs the 6-digit code'),
        'true');
    end if;
  end loop;
  -- A later coach table, added without the rule, fails here: every table by
  -- a coach name, or in the coach portal's own list, must be named.
  for t in
    select c.relname as table_name from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
      and (c.relname ~ '^(coach|network|workshop|engagement|client_)'
           or c.relname in ('activity_log', 'data_requests', 'time_entries', 'session_prep',
                            'organisation_contacts', 'organisation_documents', 'organisation_deals', 'organisation_growth'))
      and c.relname not in (select x.table_name from public.coach_code_tables() x)
  loop
    f := f || format('1d %s holds coach data but isn''t in coach_code_tables(), so it has no code rule', t.table_name);
  end loop;
  -- The checks every coach rule asks, each asking for the code.
  foreach v in array gated_checks loop
    f := f || pg_temp.t_eq('1e ' || v || '() asks for the code',
      (select bool_and(p.prosrc ~ 'coach_code_ok\(')::text from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = v), 'true');
  end loop;
  -- A function anyone signed in can call that looks a coach up for itself must ask for the code.
  for t in
    select p.proname as table_name from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prosecdef
      and has_function_privilege('authenticated', p.oid, 'execute')
      and p.prosrc ~ 'public\.coaches'
      and p.prosrc !~ '(coach_code_ok|_coach_code_needed|_coach_signed_in|_coach_owner_signed_in)\('
      and not p.proname = any (direct_ok)
      and not p.proname = any (gated_checks)
  loop
    f := f || format('1f %s() looks a coach up without asking for the code', t.table_name);
  end loop;
  f := f || pg_temp.t_eq('1g the sign-in screens'' own checks can''t be called by anyone signed in',
    (select concat(has_function_privilege('authenticated', 'public._coach_signed_in()', 'execute'),
                   has_function_privilege('authenticated', 'public._coach_owner_signed_in()', 'execute'),
                   has_function_privilege('authenticated', 'public._coach_code_needed()', 'execute'))), 'fff');
  if to_regclass('public.migration_log') is not null then
    f := f || pg_temp.t_eq('1h the migration recorded itself, once',
      (select count(*)::text from public.migration_log where number = 54 and name = '054_coach_code_required'), '1');
  end if;

  begin
    -- ---------------------------------------------------------------- the people
    tess_u := pg_temp.t_user('tess'); maya_u := pg_temp.t_user('maya'); nina_u := pg_temp.t_user('nina');
    sam_u := pg_temp.t_user('sam'); ola_u := pg_temp.t_user('ola');
    insert into public.coaches (user_id, role, display_first_name) values (tess_u, 'owner', 'Tess') returning id into tess_c;
    insert into public.coaches (user_id, role, display_first_name) values (maya_u, 'coach', 'Maya') returning id into maya_c;
    insert into public.coaches (user_id, role, display_first_name) values (nina_u, 'coach', 'Nina') returning id into nina_c;
    insert into public.coach_clients (client_id, coach_id) values (sam_u, maya_c), (ola_u, nina_c);

    -- Maya's things, made at aal2.
    perform pg_temp.t_as(maya_u, 'aal2');
    f := f || pg_temp.t_eq('4a Maya at aal2 adds her client', pg_temp.t_rows(format('insert into public.client_profiles (id, coach_id, name, time_zone) values (%L, %L, ''Sam Invented'', ''Europe/London'')', p_sam, maya_c)), '1');
    f := f || pg_temp.t_eq('4b a note', pg_temp.t_rows(format('insert into public.client_notes (id, profile_id, coach_id, body) values (%L, %L, %L, ''Invented note'')', note_m, p_sam, maya_c)), '1');
    f := f || pg_temp.t_eq('4c About them', pg_temp.t_rows(format('insert into public.client_about (profile_id, coach_id, partner) values (%L, %L, ''Ama'')', p_sam, maya_c)), '1');
    f := f || pg_temp.t_eq('4d a to-do', pg_temp.t_rows(format('insert into public.coach_todos (id, coach_id, title) values (%L, %L, ''Invented to-do'')', todo_m, maya_c)), '1');
    f := f || pg_temp.t_eq('4e a tag', pg_temp.t_rows(format('insert into public.coach_tags (coach_id, name) values (%L, ''Invented'')', maya_c)), '1');
    f := f || pg_temp.t_eq('4f her settings', pg_temp.t_rows(format('insert into public.coach_settings (coach_id) values (%L) on conflict do nothing', maya_c)), '1');
    f := f || pg_temp.t_eq('4g a lead', pg_temp.t_rows(format('insert into public.coach_leads (id, coach_id, name) values (%L, %L, ''Invented lead'')', lead_m, maya_c)), '1');
    f := f || pg_temp.t_eq('4h a session', pg_temp.t_rows(format('insert into public.coach_sessions (id, coach_id, profile_id, starts_at, minutes) values (%L, %L, %L, now() + interval ''2 days'', 60)', sess_m, maya_c, p_sam)), '1');
    f := f || pg_temp.t_eq('4i Maya at aal2 reads her client, note, About them, to-do, tag, lead and session',
      concat_ws('/', (select count(*) from public.client_profiles), (select count(*) from public.client_notes), (select count(*) from public.client_about),
                (select count(*) from public.coach_todos), (select count(*) from public.coach_tags), (select count(*) from public.coach_leads),
                (select count(*) from public.coach_sessions)), '1/1/1/1/1/1/1');
    f := f || pg_temp.t_eq('4j and is a coach, of Sam, with her coach id', concat_ws('/', public.is_coach(), public.is_coach_of(sam_u), public.my_coach_id() = maya_c, public.coach_owns_profile(p_sam)), 't/t/t/t');
    f := f || pg_temp.t_eq('4k changes her to-do', pg_temp.t_rows(format('update public.coach_todos set title = ''Changed'' where id = %L', todo_m)), '1');
    f := f || pg_temp.t_eq('4l reads what Sam shares (the Mission, on by default)', public.may_see(sam_u, 'mission')::text, 'true');
    -- The coach list names every active coach to every coach (049, names only), so
    -- on a database with real coaches (the test project) only this test's three are
    -- counted, as 049's test 2u does.
    f := f || pg_temp.t_eq('4o the coach functions answer her at aal2',
      concat_ws('/', (select count(*) from public.coach_list() where coach_id in (tess_c, maya_c, nina_c)), (select count(*) from public.coach_client_list()),
                public.client_file_path_ok(p_sam::text || '/x.pdf'), pg_temp.t_rows('select public.coach_save_details(''Maya'', null, null, null)')),
      '3/1/t/1');

    -- Nina's client, and the owner's network, at aal2.
    perform pg_temp.t_as(nina_u, 'aal2');
    f := f || pg_temp.t_eq('4m Nina at aal2 adds hers', pg_temp.t_rows(format('insert into public.client_profiles (id, coach_id, name) values (%L, %L, ''Ola Invented'')', p_ola, nina_c)), '1');
    perform pg_temp.t_as(tess_u, 'aal2');
    f := f || pg_temp.t_eq('4n the owner at aal2 adds someone to Network', pg_temp.t_rows(format('insert into public.network_people (id, coach_id, name) values (%L, %L, ''Invented contact'')', net_t, tess_c)), '1');

    -- Sam, the client, at aal1 (clients have no code to give).
    perform pg_temp.t_admin();
    perform set_config('clarity.linking', 'on', true);
    update public.client_profiles set user_id = sam_u where id = p_sam;
    update public.client_profiles set user_id = ola_u where id = p_ola;
    perform set_config('clarity.linking', '', true);

    -- ---------------------------------------------------------------- 2. a coach at aal1 gets nothing
    perform pg_temp.t_as(maya_u, 'aal1');
    for t in select * from public.coach_code_tables() loop
      continue when to_regclass('public.' || t.table_name) is null;
      -- Her own sign-in rows pass; everything else is shut.
      if t.kind in ('own_coach_row', 'own_user_id', 'own_coach_user_id') then
        continue;
      end if;
      f := f || pg_temp.t_eq('2a Maya at aal1 reads nothing in ' || t.table_name,
        pg_temp.t_n(format('select count(*)::text from public.%I', t.table_name)), case when t.kind = 'closed' then 'error 42501' else '0' end);
      select a.attname into v from pg_attribute a
       where a.attrelid = ('public.' || t.table_name)::regclass and a.attnum > 0 and not a.attisdropped and a.attgenerated = ''
       order by a.attnum limit 1;
      f := f || pg_temp.t_eq('2b Maya at aal1 changes nothing in ' || t.table_name,
        (select case when x in ('0', 'error 42501') then 'nothing' else x end from pg_temp.t_rows(format('update public.%I set %I = %I', t.table_name, v, v)) x), 'nothing');
      f := f || pg_temp.t_eq('2c Maya at aal1 removes nothing in ' || t.table_name,
        (select case when x in ('0', 'error 42501') then 'nothing' else x end from pg_temp.t_rows(format('delete from public.%I', t.table_name)) x), 'nothing');
    end loop;
    f := f || pg_temp.t_eq('2d Maya at aal1 can''t add a to-do, a note, a tag or a lead',
      concat_ws('/', pg_temp.t_rows(format('insert into public.coach_todos (coach_id, title) values (%L, ''x'')', maya_c)),
                pg_temp.t_rows(format('insert into public.client_notes (profile_id, coach_id, body) values (%L, %L, ''x'')', p_sam, maya_c)),
                pg_temp.t_rows(format('insert into public.coach_tags (coach_id, name) values (%L, ''y'')', maya_c)),
                pg_temp.t_rows(format('insert into public.coach_leads (coach_id, name) values (%L, ''x'')', maya_c))),
      'error 42501/error 42501/error 42501/error 42501');
    perform pg_temp.t_as(tess_u, 'aal1');
    f := f || pg_temp.t_eq('2e the owner at aal1 can''t change a coach row, their own included',
      (select case when x in ('0', 'error 42501') then 'nothing' else x end from pg_temp.t_rows('update public.coaches set display_first_name = display_first_name || ''x''') x), 'nothing');
    perform pg_temp.t_as(maya_u, 'aal1');
    f := f || pg_temp.t_eq('2f Maya at aal1 is no coach to the checks',
      concat_ws('/', public.is_coach(), public.is_owner(), public.is_coach_of(sam_u), coalesce(public.my_coach_id()::text, 'none'),
                public.coach_owns_profile(p_sam), public.covers_profile(p_sam)), 'f/f/f/none/f/f');
    f := f || pg_temp.t_eq('2g Maya at aal1 reads nothing Sam shares', public.may_see(sam_u, 'mission')::text, 'false');
    calls := array[
      'select public.coach_list()', 'select public.coach_admin_clients()', 'select public.coach_client_list()',
      'select public.coach_connections_mine()', 'select public.coach_call_types_start()',
      format('select public.client_invite(%L)', p_sam), format('select public.session_send_recap(%L)', sess_m),
      format('select public.session_recap_people(%L)', sess_m), format('select public.session_recap_email_claim(%L)', sess_m),
      format('select public.workshop_follow_up_claim(%L)', gen_random_uuid()),
      format('select public.client_delete(%L, ''Sam Invented'')', p_sam),
      format('select public.client_add_for(%L, null, ''Invented'')', maya_c), format('select public.client_move(%L, %L)', p_sam, nina_c),
      'select public.coach_save_details(''Mallory'', null, null, null)', 'select public.coach_save_capacity(10)',
      format('select public.coach_switch(%L, false)', nina_c), format('select public.coach_profile_decide(%L, true)', nina_c),
      'select public.log_activity(''other'', ''x'')', format('select public.coach_has_client_in(%L)', gen_random_uuid()),
      format('select public.client_file_path_ok(%L)', p_sam::text || '/x.pdf'),
      'select public.my_booking_times(now(), now() + interval ''7 days'', 60)',
      format('select public.coach_shared_debrief(%L, null::uuid, 1)', sam_u)];
    foreach q in array calls loop
      f := f || pg_temp.t_eq('2h Maya at aal1: ' || q, pg_temp.t_nothing(q), 'nothing');
    end loop;
    -- Nothing changed by those calls.
    perform pg_temp.t_admin();
    f := f || pg_temp.t_eq('2i her details and Sam''s coach stayed as they were',
      concat_ws('/', (select display_first_name from public.coaches where id = maya_c), (select coach_id = maya_c from public.client_profiles where id = p_sam),
                (select active from public.coaches where id = nina_c)), 'Maya/t/t');

    -- The owner at aal1.
    perform pg_temp.t_as(tess_u, 'aal1');
    foreach q in array array[
      'select public.network_page()', 'select public.network_counts()', 'select public.coach_lead_stages_start()',
      'select public.coach_email_addresses_start()', 'select public.coach_admin_clients()',
      'select public.coach_email_add(''{}''::jsonb)', format('select public.network_merge(%L, %L, ''{}''::jsonb)', net_t, gen_random_uuid()),
      'select public.my_owner_coach_id()'] loop
      f := f || pg_temp.t_eq('2j the owner at aal1: ' || q, pg_temp.t_nothing(q), 'nothing');
    end loop;
    f := f || pg_temp.t_eq('2k the owner at aal1 reads no Network, no client and no one else''s reset',
      concat_ws('/', (select count(*) from public.network_people), (select count(*) from public.client_profiles), (select count(*) from public.coach_authenticator_resets)), '0/0/0');
    f := f || pg_temp.t_eq('2l the owner at aal1 reads only their own coaches row', (select count(*)::text from public.coaches), '1');

    -- ---------------------------------------------------------------- 3. what the sign-in screens need, at aal1
    perform pg_temp.t_as(maya_u, 'aal1');
    f := f || pg_temp.t_eq('3a Maya at aal1 reads her own coaches row', (select string_agg(display_first_name, ',') from public.coaches), 'Maya');
    f := f || pg_temp.t_eq('3b coach_auth_state() knows her as a coach', (public.coach_auth_state() ->> 'coach'), 'true');
    f := f || pg_temp.t_eq('3c Turn it on says it needs the code', (public.coach_authenticator_on(null) ->> 'status'), 'needs_code');
    f := f || pg_temp.t_eq('3d new codes need the code', (public.coach_recovery_codes_make() ->> 'status'), 'needs_code');
    f := f || pg_temp.t_eq('3e the saved tick answers (no codes yet)', (public.coach_recovery_codes_saved(null) ->> 'status'), 'none');
    f := f || pg_temp.t_eq('3f a recovery code is tried at aal1', pg_temp.t_n('select (public.coach_recovery_code_use(''abcd-efgh'') ->> ''status'') is not null'), 'true');
    f := f || pg_temp.t_eq('3g her own authenticator row reads at aal1', (select count(*)::text from public.coach_authenticators), '1');
    perform pg_temp.t_as(tess_u, 'aal1');
    f := f || pg_temp.t_eq('3h the owner''s reset at aal1 says it needs the code', pg_temp.t_n(format('select public.coach_authenticator_reset(%L) ->> ''status''', nina_c)), 'needs_code');

    -- Codes made at aal2, then the tick and a code used at aal1, as on a new phone.
    perform pg_temp.t_as(maya_u, 'aal2');
    v := (public.coach_recovery_codes_make() -> 'codes' ->> 0);
    f := f || pg_temp.t_eq('3i codes are made at aal2', (v is not null)::text, 'true');
    perform pg_temp.t_as(maya_u, 'aal1');
    f := f || pg_temp.t_eq('3j the tick at aal1', (public.coach_recovery_codes_saved(null) ->> 'status'), 'saved');
    f := f || pg_temp.t_eq('3k her own codes'' rows read at aal1 (never the hash)', (select count(*)::text from public.coach_recovery_codes), '10');
    f := f || pg_temp.t_eq('3l a recovery code works at aal1', (public.coach_recovery_code_use(v) ->> 'status'), 'used');
    f := f || pg_temp.t_eq('3m and still opens no coach data', concat_ws('/', (select count(*) from public.client_profiles), (select count(*) from public.coach_todos), public.is_coach()), '0/0/f');

    -- ---------------------------------------------------------------- 5. clients at aal1, as today
    perform pg_temp.t_as(sam_u, 'aal1');
    f := f || pg_temp.t_eq('5a Sam reads his own profile, and his coach link', concat_ws('/', (select count(*) from public.client_profiles), (select count(*) from public.coach_clients)), '1/1');
    f := f || pg_temp.t_eq('5b his coach is Maya', (select string_agg(first_name, ',') from public.my_coach()), 'Maya');
    f := f || pg_temp.t_eq('5c For next time: he writes and reads it', pg_temp.t_rows(format('insert into public.session_prep (user_id, body) values (%L, ''Invented'')', sam_u)), '1');
    f := f || pg_temp.t_eq('5d ... and reads it back', (select count(*)::text from public.session_prep), '1');
    foreach q in array array['select * from public.my_coach_invites()', 'select * from public.my_view_asks()', 'select * from public.my_cover_asks()',
                             'select * from public.my_session_recaps()', 'select * from public.my_sessions_coming()', 'select * from public.my_suggestions()'] loop
      f := f || pg_temp.t_eq('5e Sam''s /coaching page asks: ' || q, (select case when x like 'error%' then x else 'ok' end from pg_temp.t_rows(q) x), 'ok');
    end loop;
    f := f || pg_temp.t_eq('5f his own data is his', public.may_see(sam_u, 'mission')::text, 'true');
    f := f || pg_temp.t_eq('5g and no coach data', concat_ws('/', (select count(*) from public.client_notes), (select count(*) from public.coach_todos), (select count(*) from public.coach_sessions)), '0/0/0');
    perform pg_temp.t_as(maya_u, 'aal2');
    f := f || pg_temp.t_eq('5h Maya at aal2 reads Sam''s For next time', (select count(*)::text from public.session_prep), '1');
    perform pg_temp.t_as(maya_u, 'aal1');
    f := f || pg_temp.t_eq('5i ... and at aal1 doesn''t', (select count(*)::text from public.session_prep), '0');

    -- ---------------------------------------------------------------- 6. the public pages, signed out
    perform pg_temp.t_anon();
    foreach q in array array[format('select public.booking_page(%L)', gen_random_uuid()), format('select public.poll_page(%L)', gen_random_uuid()),
                             format('select public.workshop_page(%L)', gen_random_uuid()), format('select public.workshop_survey(%L)', gen_random_uuid())] loop
      f := f || pg_temp.t_eq('6a signed out: ' || q, (select case when x like 'error%' then x else 'ok' end from pg_temp.t_n(q) x), 'ok');
    end loop;

    -- ---------------------------------------------------------------- 7. who sees what, at aal2, as before
    perform pg_temp.t_as(maya_u, 'aal2');
    f := f || pg_temp.t_eq('7a Maya sees only her own client', (select string_agg(name, ',') from public.client_profiles), 'Sam Invented');
    f := f || pg_temp.t_eq('7b and no Network (the owner''s)', (select count(*)::text from public.network_people), '0');
    perform pg_temp.t_as(nina_u, 'aal2');
    f := f || pg_temp.t_eq('7c Nina sees only hers, and none of Maya''s notes', concat_ws('/', (select string_agg(name, ',') from public.client_profiles), (select count(*) from public.client_notes)), 'Ola Invented/0');
    perform pg_temp.t_as(tess_u, 'aal2');
    f := f || pg_temp.t_eq('7d the owner sees the admin facts of both associates'' clients',
      (select string_agg(name, ',' order by name) from public.coach_admin_clients() where name like '% Invented'), 'Ola Invented,Sam Invented');
    f := f || pg_temp.t_eq('7e ... never their notes or About them', concat_ws('/', (select count(*) from public.client_notes), (select count(*) from public.client_about)), '0/0');
    f := f || pg_temp.t_eq('7f the owner reads Network at aal2', (select count(*)::text from public.network_people where id = net_t), '1');

    perform pg_temp.t_admin();
    raise exception 'undo the test rows' using errcode = 'P0054';
  exception when sqlstate 'P0054' then
    perform pg_temp.t_admin();
  end;

  f := f || pg_temp.t_eq('8 everything the test made is undone',
    (select count(*)::text from auth.users where email like 'p6a-test-%@example.invalid'), '0');

  if cardinality(f) > 0 then
    raise exception E'054 FAILED (%):\n%', cardinality(f), array_to_string(f, E'\n');
  end if;
  raise notice '054 CHECKS PASSED';
end
$t$;

-- =============================================================================
-- Run 6, items 3, 6, 7 and 8 (builder B6): two tabs never undo each other.
--   9a-9e   the recap is sent only as the tab shows it (session_send_recap(session, recap)),
--   9f-9l   a poll is settled once (a second confirm is refused, CC409; Undo back to open works),
--   9m-9q   an automation's run is claimed only while it is on,
--   9r-9z   Won and Cold are kept from an ordinary save, and undone only by lead_unsettle() while
--           the lead is as the tab saw it.
-- Everything it makes is undone at the end. Ends with the notice 054 TWO TABS CHECKS PASSED.
-- =============================================================================
do $t2$
declare
  f text[] := '{}';
  tess_u uuid; tess_c uuid;
  p_sam uuid := gen_random_uuid();
  sess uuid := gen_random_uuid();
  poll uuid := gen_random_uuid(); opt1 uuid := gen_random_uuid(); opt2 uuid := gen_random_uuid();
  item1 uuid := gen_random_uuid(); item2 uuid := gen_random_uuid();
  auto uuid := gen_random_uuid();
  lead uuid := gen_random_uuid();
  won timestamptz := '2026-11-20 10:15:30.123+00';
  cold timestamptz := '2026-11-21 09:00:00.456+00';
begin
  begin
    tess_u := pg_temp.t_user('tess2');
    insert into public.coaches (user_id, role, display_first_name) values (tess_u, 'owner', 'Tess') returning id into tess_c;
    perform pg_temp.t_as(tess_u, 'aal2');
    insert into public.client_profiles (id, coach_id, name, time_zone) values (p_sam, tess_c, 'Sam Invented', 'Europe/London');

    -- ---------------------------------------------------------------- 3. the recap
    insert into public.coach_sessions (id, coach_id, profile_id, starts_at, minutes, outcome, recap)
    values (sess, tess_c, p_sam, now() - interval '1 day', 60, 'held', 'Line saved in the first tab.');
    f := f || pg_temp.t_eq('9a a second tab''s older recap isn''t sent', public.session_send_recap(sess, 'The older recap.'), 'changed');
    f := f || pg_temp.t_eq('9b ... and nothing was sent or changed',
      (select concat_ws('/', (recap_sent_at is null)::text, recap) from public.coach_sessions where id = sess), 'true/Line saved in the first tab.');
    f := f || pg_temp.t_eq('9c the recap as the tab shows it is sent', public.session_send_recap(sess, 'Line saved in the first tab.'), 'sent');
    f := f || pg_temp.t_eq('9d once', public.session_send_recap(sess, 'Line saved in the first tab.'), 'already_sent');
    f := f || pg_temp.t_eq('9e the older one-argument send still answers', public.session_send_recap(sess), 'already_sent');

    -- ---------------------------------------------------------------- 6. a poll is settled once
    insert into public.coach_polls (id, coach_id, title, time_zone) values (poll, tess_c, 'Invented three-way', 'Europe/London');
    insert into public.coach_poll_options (id, poll_id, coach_id, starts_at, ends_at, position) values
      (opt1, poll, tess_c, now() + interval '3 days', now() + interval '3 days 1 hour', 0),
      (opt2, poll, tess_c, now() + interval '4 days', now() + interval '4 days 1 hour', 1);
    f := f || pg_temp.t_eq('9f the first tab confirms', pg_temp.t_rows(format(
      'update public.coach_polls set status = ''confirmed'', confirmed_option_id = %L, confirmed_item_id = %L where id = %L', opt1, item1, poll)), '1');
    f := f || pg_temp.t_eq('9g the second tab''s confirm of another time is refused, as changed in another tab', pg_temp.t_rows(format(
      'update public.coach_polls set status = ''confirmed'', confirmed_option_id = %L, confirmed_item_id = %L where id = %L', opt2, item2, poll)), 'error CC409');
    f := f || pg_temp.t_eq('9h ... and the first confirm stands', (select confirmed_item_id::text from public.coach_polls where id = poll), item1::text);
    f := f || pg_temp.t_eq('9i the same confirm sent again is fine', pg_temp.t_rows(format(
      'update public.coach_polls set status = ''confirmed'', confirmed_option_id = %L, confirmed_item_id = %L where id = %L', opt1, item1, poll)), '1');
    f := f || pg_temp.t_eq('9j a confirmed poll can''t be cancelled from an older tab', pg_temp.t_rows(format(
      'update public.coach_polls set status = ''cancelled'' where id = %L', poll)), 'error CC409');
    f := f || pg_temp.t_eq('9k Undo puts it back to open', pg_temp.t_rows(format(
      'update public.coach_polls set status = ''open'', confirmed_option_id = null, confirmed_item_id = null where id = %L', poll)), '1');
    f := f || pg_temp.t_eq('9l then it can be confirmed again', pg_temp.t_rows(format(
      'update public.coach_polls set status = ''confirmed'', confirmed_option_id = %L, confirmed_item_id = %L where id = %L', opt2, item2, poll)), '1');

    -- ---------------------------------------------------------------- 7. a run only while the automation is on
    insert into public.coach_automations (id, coach_id, trigger, action, todo_title) values (auto, tess_c, 'lead_won', 'todo', 'Invented welcome');
    f := f || pg_temp.t_eq('9m a run is claimed while it is on', pg_temp.t_rows(format(
      'insert into public.coach_automation_runs (automation_id, coach_id, event_key) values (%L, %L, ''won:a'')', auto, tess_c)), '1');
    update public.coach_automations set active = false where id = auto;
    f := f || pg_temp.t_eq('9n switched off (in another tab): the next claim is refused', pg_temp.t_rows(format(
      'insert into public.coach_automation_runs (automation_id, coach_id, event_key) values (%L, %L, ''won:b'')', auto, tess_c)), 'error CC409');
    f := f || pg_temp.t_eq('9o ... and nothing ran', (select count(*)::text from public.coach_automation_runs where automation_id = auto), '1');
    f := f || pg_temp.t_eq('9p the run already claimed, sent again, is still "already there"', pg_temp.t_rows(format(
      'insert into public.coach_automation_runs (id, automation_id, coach_id, event_key) select id, automation_id, coach_id, event_key from public.coach_automation_runs where automation_id = %L on conflict (id) do nothing', auto)), '0');
    update public.coach_automations set active = true where id = auto;
    f := f || pg_temp.t_eq('9q switched on again, it runs again', pg_temp.t_rows(format(
      'insert into public.coach_automation_runs (automation_id, coach_id, event_key) values (%L, %L, ''won:c'')', auto, tess_c)), '1');

    -- ---------------------------------------------------------------- 8. Won and Cold
    insert into public.coach_leads (id, coach_id, name) values (lead, tess_c, 'Invented lead');
    update public.coach_leads set won_at = won where id = lead;
    f := f || pg_temp.t_eq('9r a tab left open saves the lead as it saw it',
      pg_temp.t_rows(format('update public.coach_leads set won_at = null, notes = ''typed later'' where id = %L', lead)), '1');
    f := f || pg_temp.t_eq('9r2 ... its change is kept, and Won stays',
      (select concat_ws('/', (won_at = won)::text, notes) from public.coach_leads where id = lead), 'true/typed later');
    f := f || pg_temp.t_eq('9s Undo from a tab that set Won at another moment is refused', public.lead_unsettle(lead, 'won', won + interval '1 second'), 'changed');
    f := f || pg_temp.t_eq('9t ... Won still stands', (select (won_at = won)::text from public.coach_leads where id = lead), 'true');
    f := f || pg_temp.t_eq('9u Undo from the tab that set it', public.lead_unsettle(lead, 'won', won), 'undone');
    f := f || pg_temp.t_eq('9v ... Won is gone', (select (won_at is null and won_profile_id is null)::text from public.coach_leads where id = lead), 'true');
    f := f || pg_temp.t_eq('9w Undo again (another tab got there first) says changed', public.lead_unsettle(lead, 'won', won), 'changed');
    update public.coach_leads set cold_at = cold, cold_reason = 'They went quiet.' where id = lead;
    perform pg_temp.t_rows(format('update public.coach_leads set cold_at = null, cold_reason = null where id = %L', lead));
    f := f || pg_temp.t_eq('9x Cold stays through an ordinary save', (select concat_ws('/', (cold_at = cold)::text, cold_reason) from public.coach_leads where id = lead), 'true/They went quiet.');
    f := f || pg_temp.t_eq('9y Back in the pipeline, from the tab that saw it cold', public.lead_unsettle(lead, 'cold', cold), 'undone');
    f := f || pg_temp.t_eq('9z ... Cold is gone', (select (cold_at is null and cold_reason is null)::text from public.coach_leads where id = lead), 'true');
    f := f || pg_temp.t_eq('9z2 a kind that isn''t Won or Cold is refused', pg_temp.t_n(format('select public.lead_unsettle(%L, ''lost'', now())', lead)), 'error 22023');

    -- At aal1 the new calls answer nothing (054's code check).
    perform pg_temp.t_as(tess_u, 'aal1');
    f := f || pg_temp.t_eq('9z3 at aal1 the two-argument send refuses', pg_temp.t_nothing(format('select public.session_send_recap(%L, ''x'')', sess)), 'nothing');
    f := f || pg_temp.t_eq('9z4 at aal1 lead_unsettle refuses', pg_temp.t_nothing(format('select public.lead_unsettle(%L, ''won'', now())', lead)), 'nothing');
    -- Someone else's lead.
    perform pg_temp.t_anon();
    f := f || pg_temp.t_eq('9z5 signed out, neither can be called', concat_ws('/',
      pg_temp.t_n(format('select public.session_send_recap(%L, ''x'')', sess)), pg_temp.t_n(format('select public.lead_unsettle(%L, ''won'', now())', lead))),
      'error 42501/error 42501');

    perform pg_temp.t_admin();
    raise exception 'undo the test rows' using errcode = 'P0054';
  exception when sqlstate 'P0054' then
    perform pg_temp.t_admin();
  end;

  f := f || pg_temp.t_eq('9z6 everything the test made is undone',
    (select count(*)::text from auth.users where email like 'p6a-test-%@example.invalid'), '0');
  if cardinality(f) > 0 then
    raise exception E'054 TWO TABS FAILED (%):\n%', cardinality(f), array_to_string(f, E'\n');
  end if;
  raise notice '054 TWO TABS CHECKS PASSED';
end
$t2$;
