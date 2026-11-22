-- =============================================================================
-- 054_coach_code_required_breakit_test.sql
-- The break-it tester's checks of 054 (Phase 6a run 6, 22 Nov). RUN ORDER:
-- 026 to 053, then 054, then this (after or without the other 054 tests).
-- Safe to run again: everything it makes is undone at the end.
--
-- WHAT IT TRIES (each a way round the 6-digit code)
--   k1  an "aal" claim forged in other places or shapes: inside app_metadata
--       or user_metadata, inside amr, "AAL2", " aal2", ["aal2"], true, and
--       a signed-out request carrying aal2;
--   k2  an aal2 sign-in that began before the owner reset the coach's
--       authenticator (the earliest "amr" time, or "iat" when there is no
--       amr), against every coach table and the gated checks; and the same
--       coach signing in again after the reset;
--   k3  the reset marker itself: a coach can't clear or remove their own
--       authenticator row (so can't undo a reset), at aal1 or aal2;
--   k4  a coach who is also a client of another coach, at aal1: their
--       client side only, none of their coach data;
--   k5  a coach who made themself a client of themself: at aal1 the client's
--       side only (their own profile), never the coach's notes on it;
--   k6  every function anyone signed in may call that touches a coach table,
--       called at aal1 with empty arguments, as an associate and as the
--       owner: no one's data comes back (a calm status may) and nothing
--       changes;
--   k7  views over coach tables (none may bypass the rules);
--   k8  file storage: the coach's folder and a client's files at aal1;
--   k9  the coach rows' own writes: an associate making themself owner, a
--       client linking themself to a coach, at aal1 and aal2;
--   k10 the run 6 two-tab functions and guards at aal1.
--
--   It ends with the notice 054 BREAK-IT CHECKS PASSED, or stops with
--   FAILED and a list naming each check that failed.
-- =============================================================================
create or replace function pg_temp.k_claims(p_claims jsonb) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', p_claims::text, true);
  perform set_config('role', case when p_claims ? 'sub' then 'authenticated' else 'anon' end, true);
end $f$;
create or replace function pg_temp.k_as(p uuid, p_aal text default 'aal1') returns void language plpgsql as $f$
begin
  perform pg_temp.k_claims(jsonb_build_object('sub', p, 'role', 'authenticated', 'aal', p_aal));
end $f$;
create or replace function pg_temp.k_admin() returns void language plpgsql as $f$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
end $f$;
create or replace function pg_temp.k_user(p_label text) returns uuid language plpgsql as $f$
declare u uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, aud, role, email_confirmed_at)
  values (u, 'p6a-break-' || p_label || '-' || u || '@example.invalid', 'authenticated', 'authenticated', now());
  return u;
end $f$;
create or replace function pg_temp.k_n(p_sql text) returns text language plpgsql as $f$
declare v text;
begin
  execute p_sql into v;
  return coalesce(v, 'null');
exception when others then
  return 'error ' || sqlstate;
end $f$;
create or replace function pg_temp.k_rows(p_sql text) returns text language plpgsql as $f$
declare n bigint;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n::text;
exception when others then
  return 'error ' || sqlstate;
end $f$;
create or replace function pg_temp.k_nothing(p_sql text) returns text language plpgsql as $f$
declare v text; n bigint;
begin
  execute format('select count(*), max(x::text) from (%s) x', p_sql) into n, v;
  if n = 0 or v is null or v in ('(f)', '()', '(null)', '("")', '({})', '([])', '("[]")', '("{}")', '(0)') then
    return 'nothing';
  end if;
  return 'gave ' || left(v, 80);
exception when others then
  return 'nothing';
end $f$;
create or replace function pg_temp.k_eq(p_name text, p_got text, p_want text) returns text[] language sql as $f$
  select case when p_got is distinct from p_want
              then array[format('%s: expected %s, got %s', p_name, p_want, coalesce(p_got, 'nothing'))]
              else '{}'::text[] end;
$f$;
-- Rows in every coach table a request can read (0 or more), as one line.
create or replace function pg_temp.k_seen() returns text language plpgsql as $f$
declare t record; n bigint; total bigint := 0;
begin
  for t in select * from public.coach_code_tables() where kind <> 'closed' loop
    continue when to_regclass('public.' || t.table_name) is null;
    begin
      execute format('select count(*) from public.%I', t.table_name) into n;
    exception when others then n := 0;
    end;
    total := total + n;
  end loop;
  return total::text;
end $f$;
-- Every coach table's rows, as the server sees them (to prove nothing changed).
create or replace function pg_temp.k_all() returns text language plpgsql as $f$
declare t record; v text; acc text := '';
begin
  for t in select * from public.coach_code_tables() order by 1 loop
    continue when to_regclass('public.' || t.table_name) is null;
    execute format('select md5(coalesce(string_agg(x::text, ''|'' order by x::text), '''')) from public.%I x', t.table_name) into v;
    acc := acc || v;
  end loop;
  return md5(acc);
end $f$;

do $k$
declare
  f text[] := '{}';
  q text;
  v text;
  r record;
  before text;
  tess_u uuid; maya_u uuid; nina_u uuid; sam_u uuid;
  tess_c uuid; maya_c uuid; nina_c uuid;
  p_sam uuid := gen_random_uuid(); p_maya_at_nina uuid := gen_random_uuid(); p_maya_self uuid := gen_random_uuid();
  todo_m uuid := gen_random_uuid(); sess_m uuid := gen_random_uuid(); lead_m uuid := gen_random_uuid();
  epoch_now bigint := extract(epoch from now())::bigint;
  -- The sign-in screens' own functions and the plain lists: asked at aal1 on purpose, or holding no one's data.
  sweep_skip text[] := array['coach_auth_state', 'coach_authenticator_on', 'coach_recovery_codes_make', 'coach_recovery_codes_saved',
                             'coach_recovery_code_use', 'coach_authenticator_reset', 'coach_code_tables', 'coach_code_ok'];
begin
  begin
    -- ---------------------------------------------------------------- the people
    tess_u := pg_temp.k_user('tess'); maya_u := pg_temp.k_user('maya'); nina_u := pg_temp.k_user('nina'); sam_u := pg_temp.k_user('sam');
    insert into public.coaches (user_id, role, display_first_name) values (tess_u, 'owner', 'Tess') returning id into tess_c;
    insert into public.coaches (user_id, role, display_first_name) values (maya_u, 'coach', 'Maya') returning id into maya_c;
    insert into public.coaches (user_id, role, display_first_name) values (nina_u, 'coach', 'Nina') returning id into nina_c;
    insert into public.coach_clients (client_id, coach_id) values (sam_u, maya_c);

    perform pg_temp.k_as(maya_u, 'aal2');
    insert into public.client_profiles (id, coach_id, name, time_zone) values (p_sam, maya_c, 'Sam Invented', 'Europe/London');
    insert into public.client_notes (profile_id, coach_id, body) values (p_sam, maya_c, 'Invented note');
    insert into public.coach_todos (id, coach_id, title) values (todo_m, maya_c, 'Invented to-do');
    insert into public.coach_leads (id, coach_id, name) values (lead_m, maya_c, 'Invented lead');
    insert into public.coach_sessions (id, coach_id, profile_id, starts_at, minutes, outcome, recap)
    values (sess_m, maya_c, p_sam, now() - interval '1 day', 60, 'held', 'Invented recap');
    f := f || pg_temp.k_eq('0a Maya at aal2 sees her own coach data', (pg_temp.k_seen()::bigint >= 6)::text, 'true');
    perform pg_temp.k_admin();
    perform set_config('clarity.linking', 'on', true);
    update public.client_profiles set user_id = sam_u where id = p_sam;
    perform set_config('clarity.linking', '', true);

    -- ---------------------------------------------------------------- k1. a forged or misshapen aal claim
    foreach q in array array[
      jsonb_build_object('sub', maya_u, 'role', 'authenticated', 'aal', 'aal1', 'app_metadata', jsonb_build_object('aal', 'aal2'))::text,
      jsonb_build_object('sub', maya_u, 'role', 'authenticated', 'aal', 'aal1', 'user_metadata', jsonb_build_object('aal', 'aal2'))::text,
      jsonb_build_object('sub', maya_u, 'role', 'authenticated', 'user_metadata', jsonb_build_object('aal', 'aal2'))::text,
      jsonb_build_object('sub', maya_u, 'role', 'authenticated', 'aal', 'aal1', 'amr', jsonb_build_array(jsonb_build_object('method', 'totp', 'aal', 'aal2')))::text,
      jsonb_build_object('sub', maya_u, 'role', 'authenticated', 'aal', 'AAL2')::text,
      jsonb_build_object('sub', maya_u, 'role', 'authenticated', 'aal', ' aal2')::text,
      jsonb_build_object('sub', maya_u, 'role', 'authenticated', 'aal', 'aal2 ')::text,
      jsonb_build_object('sub', maya_u, 'role', 'authenticated', 'aal', jsonb_build_array('aal2'))::text,
      jsonb_build_object('sub', maya_u, 'role', 'authenticated', 'aal', jsonb_build_object('level', 'aal2'))::text,
      jsonb_build_object('sub', maya_u, 'role', 'authenticated', 'aal', true)::text,
      jsonb_build_object('sub', maya_u, 'role', 'authenticated', 'aal', 2)::text,
      jsonb_build_object('sub', maya_u, 'role', 'authenticated', 'aal', 'aal3')::text,
      jsonb_build_object('sub', maya_u, 'role', 'authenticated')::text] loop
      perform pg_temp.k_claims(q::jsonb);
      f := f || pg_temp.k_eq('k1 forged ' || q || ': no coach data, no coach to the checks',
        concat_ws('/', pg_temp.k_seen(), public.coach_code_ok(), public.is_coach(), coalesce(public.my_coach_id()::text, 'none'),
                  pg_temp.k_nothing('select * from public.coach_client_list()')),
        -- Her own coaches row is the one row she always reads.
        '1/f/f/none/nothing');
    end loop;
    -- Signed out, carrying aal2: still nobody.
    perform pg_temp.k_claims(jsonb_build_object('role', 'anon', 'aal', 'aal2'));
    f := f || pg_temp.k_eq('k1 signed out with aal2: no coach, no rows',
      concat_ws('/', pg_temp.k_n('select public.is_coach()::text'), pg_temp.k_n('select coalesce(public.my_coach_id()::text, ''none'')'),
                pg_temp.k_n('select count(*)::text from public.coach_todos')),
      'error 42501/error 42501/error 42501');

    -- ---------------------------------------------------------------- k2. an aal2 sign-in from before a reset
    perform pg_temp.k_as(tess_u, 'aal2');
    f := f || pg_temp.k_eq('k2a the owner resets Maya''s authenticator', (public.coach_authenticator_reset(maya_c) ->> 'status'), 'reset');
    -- The stolen sign-in: aal2, with its password and code times before the reset.
    perform pg_temp.k_claims(jsonb_build_object('sub', maya_u, 'role', 'authenticated', 'aal', 'aal2',
      'amr', jsonb_build_array(jsonb_build_object('method', 'totp', 'timestamp', epoch_now - 600), jsonb_build_object('method', 'password', 'timestamp', epoch_now - 700)),
      'iat', epoch_now + 30));
    f := f || pg_temp.k_eq('k2b an aal2 sign-in from before the reset is no coach to the checks',
      concat_ws('/', public.coach_code_ok(), public.is_coach(), coalesce(public.my_coach_id()::text, 'none'), public.coach_owns_profile(p_sam), public.is_coach_of(sam_u), public.may_see(sam_u, 'mission')),
      'f/f/none/f/f/f');
    f := f || pg_temp.k_eq('k2c ... and reads no coach data (only her own sign-in rows)',
      concat_ws('/', (select count(*) from public.client_profiles), (select count(*) from public.client_notes), (select count(*) from public.coach_todos),
                (select count(*) from public.coach_leads), (select count(*) from public.coach_sessions), (select count(*) from public.coach_clients)), '0/0/0/0/0/0');
    f := f || pg_temp.k_eq('k2d ... changes nothing and adds nothing',
      concat_ws('/', pg_temp.k_rows(format('update public.coach_todos set title = ''x'' where id = %L', todo_m)),
                pg_temp.k_rows(format('insert into public.coach_todos (coach_id, title) values (%L, ''x'')', maya_c))), '0/error 42501');
    foreach q in array array['select public.coach_client_list()', format('select public.session_send_recap(%L, ''Invented recap'')', sess_m),
                             format('select public.lead_unsettle(%L, ''won'', now())', lead_m), 'select public.my_booking_times(now(), now() + interval ''7 days'', 60)',
                             'select public.coach_save_details(''Mallory'', null, null, null)'] loop
      f := f || pg_temp.k_eq('k2e from before the reset: ' || q, pg_temp.k_nothing(q), 'nothing');
    end loop;
    -- With no amr, its iat decides.
    perform pg_temp.k_claims(jsonb_build_object('sub', maya_u, 'role', 'authenticated', 'aal', 'aal2', 'iat', epoch_now - 60));
    f := f || pg_temp.k_eq('k2f no amr and an iat before the reset: refused', public.coach_code_ok()::text, 'false');
    -- An amr that isn't a list, or holds rubbish, can't move the time later.
    perform pg_temp.k_claims(jsonb_build_object('sub', maya_u, 'role', 'authenticated', 'aal', 'aal2', 'iat', epoch_now - 60,
      'amr', jsonb_build_array(jsonb_build_object('method', 'totp', 'timestamp', 'soon'), 'password')));
    f := f || pg_temp.k_eq('k2g an amr of rubbish falls back to the iat: refused', public.coach_code_ok()::text, 'false');
    -- Maya signs in again after the reset (new password and code times): all hers again.
    perform pg_temp.k_claims(jsonb_build_object('sub', maya_u, 'role', 'authenticated', 'aal', 'aal2',
      'amr', jsonb_build_array(jsonb_build_object('method', 'totp', 'timestamp', epoch_now + 60), jsonb_build_object('method', 'password', 'timestamp', epoch_now + 30))));
    f := f || pg_temp.k_eq('k2h a sign-in after the reset is a coach again, with her data',
      concat_ws('/', public.coach_code_ok(), public.is_coach(), public.my_coach_id() = maya_c, (select count(*) from public.coach_todos), (select count(*) from public.client_notes)),
      't/t/t/1/1');
    -- Nobody else is touched by Maya's reset.
    perform pg_temp.k_claims(jsonb_build_object('sub', nina_u, 'role', 'authenticated', 'aal', 'aal2',
      'amr', jsonb_build_array(jsonb_build_object('method', 'totp', 'timestamp', epoch_now - 86400))));
    f := f || pg_temp.k_eq('k2i Nina, never reset, keeps her older sign-in', public.is_coach()::text, 'true');
    perform pg_temp.k_as(tess_u, 'aal2');
    f := f || pg_temp.k_eq('k2j and the owner who reset keeps theirs', public.is_owner()::text, 'true');

    -- ---------------------------------------------------------------- k3. the reset marker can't be undone by the coach
    foreach v in array array['aal1', 'aal2'] loop
      perform pg_temp.k_as(maya_u, v);
      f := f || pg_temp.k_eq('k3 Maya at ' || v || ' can''t clear or remove her reset',
        concat_ws('/', pg_temp.k_rows('update public.coach_authenticators set last_reset_at = null'),
                  pg_temp.k_rows('delete from public.coach_authenticators'),
                  pg_temp.k_rows('delete from public.coach_authenticator_resets'),
                  pg_temp.k_rows(format('insert into public.coach_authenticators (user_id) values (%L) on conflict do nothing', maya_u))),
        'error 42501/error 42501/error 42501/error 42501');
    end loop;
    perform pg_temp.k_admin();
    f := f || pg_temp.k_eq('k3 her reset is still there', ((select last_reset_at from public.coach_authenticators where user_id = maya_u) is not null)::text, 'true');

    -- ---------------------------------------------------------------- k6. every function that touches a coach table, at aal1, with empty arguments
    perform pg_temp.k_admin();
    before := pg_temp.k_all();
    for r in
      select p.proname, p.oid,
             format('select public.%I(%s)', p.proname,
                    coalesce((select string_agg('null::' || format_type(t, null), ', ' order by o)
                                from unnest(p.proargtypes::oid[]) with ordinality u(t, o)), '')) as call
      from pg_proc p
      where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
        and has_function_privilege('authenticated', p.oid, 'execute')
        and p.prorettype <> 'trigger'::regtype
        and not p.proname = any (sweep_skip)
        and p.prosrc ~ ('public\.(' || (select string_agg(table_name, '|') from public.coach_code_tables()) || ')\M'
                        || '|(is_coach|is_owner|is_coach_of|my_coach_id|my_owner_coach_id|coach_owns_profile|covers_profile|coach_has_client_in)\(')
    loop
      foreach v in array array[maya_u::text, tess_u::text] loop
        perform pg_temp.k_as(v::uuid, 'aal1');
        q := pg_temp.k_nothing(r.call);
        -- A calm status ({"status": "not_found"}, {"ok": false, ...}) holds no one's data; a name, an id or an email would.
        if q <> 'nothing' and q ~* '([0-9a-f]{8}-[0-9a-f]{4}-|invented|tess|maya|nina|sam|p6a-break|@)' then
          f := f || format('k6 %s at aal1 as %s: %s', r.call, case when v = maya_u::text then 'an associate' else 'the owner' end, q);
        end if;
      end loop;
    end loop;
    perform pg_temp.k_admin();
    f := f || pg_temp.k_eq('k6 nothing in any coach table changed', pg_temp.k_all(), before);

    -- ---------------------------------------------------------------- k4. a coach who is also a client of another coach
    insert into public.coach_clients (client_id, coach_id) values (maya_u, nina_c);
    perform pg_temp.k_as(nina_u, 'aal2');
    insert into public.client_profiles (id, coach_id, name, time_zone) values (p_maya_at_nina, nina_c, 'Maya as a client', 'Europe/London');
    insert into public.client_notes (profile_id, coach_id, body) values (p_maya_at_nina, nina_c, 'Nina''s invented note on Maya');
    perform pg_temp.k_admin();
    perform set_config('clarity.linking', 'on', true);
    update public.client_profiles set user_id = maya_u where id = p_maya_at_nina;
    perform set_config('clarity.linking', '', true);
    perform pg_temp.k_as(maya_u, 'aal1');
    f := f || pg_temp.k_eq('k4a Maya at aal1, as Nina''s client: her own client profile and coach link only',
      concat_ws('/', (select string_agg(name, ',') from public.client_profiles), (select count(*) from public.coach_clients),
                (select string_agg(first_name, ',') from public.my_coach())), 'Maya as a client/1/Nina');
    f := f || pg_temp.k_eq('k4b ... none of her coach data, and not Nina''s note on her',
      concat_ws('/', (select count(*) from public.client_notes), (select count(*) from public.coach_todos), (select count(*) from public.coach_leads),
                public.may_see(sam_u, 'mission'), public.is_coach_of(sam_u)), '0/0/0/f/f');
    f := f || pg_temp.k_eq('k4c ... and her own data is hers', public.may_see(maya_u, 'mission')::text, 'true');

    -- ---------------------------------------------------------------- k5. a coach who made themself their own client
    perform pg_temp.k_claims(jsonb_build_object('sub', maya_u, 'role', 'authenticated', 'aal', 'aal2',
      'amr', jsonb_build_array(jsonb_build_object('method', 'totp', 'timestamp', epoch_now + 60))));
    insert into public.client_profiles (id, coach_id, name, time_zone) values (p_maya_self, maya_c, 'Maya, coached by Maya', 'Europe/London');
    insert into public.client_notes (profile_id, coach_id, body) values (p_maya_self, maya_c, 'Invented private note');
    insert into public.client_about (profile_id, coach_id, partner) values (p_maya_self, maya_c, 'Invented');
    perform pg_temp.k_admin();
    perform set_config('clarity.linking', 'on', true);
    -- Two profiles can't share an account, so her profile with Nina steps aside for this part.
    update public.client_profiles set user_id = null where id = p_maya_at_nina;
    update public.client_profiles set user_id = maya_u where id = p_maya_self;
    perform set_config('clarity.linking', '', true);
    perform pg_temp.k_as(maya_u, 'aal1');
    f := f || pg_temp.k_eq('k5 her own client at aal1: the profile (the client''s side), never her notes or About them on it',
      concat_ws('/', (select string_agg(name, ',') from public.client_profiles), (select count(*) from public.client_notes), (select count(*) from public.client_about),
                public.coach_owns_profile(p_maya_self), public.client_file_path_ok(p_maya_self::text || '/x.pdf')),
      'Maya, coached by Maya/0/0/f/t');

    -- ---------------------------------------------------------------- k7. no view over coach tables gets round the rules
    for r in
      select c.relname, coalesce(c.reloptions::text, '') as opts from pg_class c
      where c.relnamespace = 'public'::regnamespace and c.relkind in ('v', 'm')
        and pg_get_viewdef(c.oid) ~ ('\m(' || (select string_agg(table_name, '|') from public.coach_code_tables()) || ')\M')
        and (has_table_privilege('authenticated', c.oid, 'select') or has_table_privilege('anon', c.oid, 'select'))
        and (c.relkind = 'm' or c.reloptions is null or not ('security_invoker=true' = any (c.reloptions)))
    loop
      f := f || format('k7 the view %s reads coach tables as its owner (%s), past the code rule', r.relname, r.opts);
    end loop;

    -- ---------------------------------------------------------------- k8. file storage at aal1
    if to_regclass('storage.objects') is not null then
      perform pg_temp.k_admin();
      insert into storage.objects (bucket_id, name, owner) values
        ('coach-files', maya_u::text || '/invented.pdf', maya_u),
        ('client-files', p_sam::text || '/invented.pdf', maya_u);
      perform pg_temp.k_as(maya_u, 'aal1');
      f := f || pg_temp.k_eq('k8a Maya at aal1 reads neither her folder nor her client''s files',
        pg_temp.k_n('select count(*)::text from storage.objects where bucket_id in (''coach-files'', ''client-files'') and name like ''%invented.pdf'''), '0');
      f := f || pg_temp.k_eq('k8b ... adds nothing to either',
        concat_ws('/', pg_temp.k_rows(format('insert into storage.objects (bucket_id, name, owner) values (''coach-files'', %L, %L)', maya_u::text || '/new.pdf', maya_u)),
                  pg_temp.k_rows(format('insert into storage.objects (bucket_id, name, owner) values (''client-files'', %L, %L)', p_sam::text || '/new.pdf', maya_u))),
        'error 42501/error 42501');
      f := f || pg_temp.k_eq('k8c ... and removes nothing',
        (select case when x in ('0', 'error 42501') then 'nothing' else x end from pg_temp.k_rows('delete from storage.objects where name like ''%invented.pdf''') x), 'nothing');
      perform pg_temp.k_as(sam_u, 'aal1');
      f := f || pg_temp.k_eq('k8d Sam at aal1 still reads his own files', pg_temp.k_n(format('select count(*)::text from storage.objects where bucket_id = ''client-files'' and name = %L', p_sam::text || '/invented.pdf')), '1');
      perform pg_temp.k_claims(jsonb_build_object('sub', maya_u, 'role', 'authenticated', 'aal', 'aal2',
        'amr', jsonb_build_array(jsonb_build_object('method', 'totp', 'timestamp', epoch_now + 60))));
      f := f || pg_temp.k_eq('k8e Maya at aal2 reads both', pg_temp.k_n('select count(*)::text from storage.objects where name like ''%invented.pdf'''), '2');
    end if;

    -- ---------------------------------------------------------------- k9. coach rows: who may make whom a coach or a client
    foreach v in array array['aal1', 'aal2'] loop
      perform pg_temp.k_claims(jsonb_build_object('sub', maya_u, 'role', 'authenticated', 'aal', v,
        'amr', jsonb_build_array(jsonb_build_object('method', 'totp', 'timestamp', epoch_now + 60))));
      f := f || pg_temp.k_eq('k9a Maya at ' || v || ' can''t make herself the owner, or another coach',
        concat_ws('/', (select case when x in ('0', 'error 42501') then 'nothing' else x end from pg_temp.k_rows(format('update public.coaches set role = ''owner'' where id = %L', maya_c)) x),
                  pg_temp.k_rows(format('insert into public.coaches (user_id, role, display_first_name) values (%L, ''owner'', ''Sam'')', sam_u))),
        'nothing/error 42501');
      perform pg_temp.k_as(sam_u, v);
      f := f || pg_temp.k_eq('k9b Sam at ' || v || ' can''t link himself to another coach, or end his link',
        concat_ws('/', pg_temp.k_rows(format('insert into public.coach_clients (client_id, coach_id) values (%L, %L)', sam_u, tess_c)),
                  (select case when x in ('0', 'error 42501') then 'nothing' else x end from pg_temp.k_rows('update public.coach_clients set ended_at = now()') x)),
        'error 42501/nothing');
    end loop;
    perform pg_temp.k_admin();
    f := f || pg_temp.k_eq('k9c the coach rows and Sam''s link stayed as they were',
      concat_ws('/', (select role from public.coaches where id = maya_c), (select count(*) from public.coaches where user_id = sam_u),
                (select count(*) from public.coach_clients where client_id = sam_u and ended_at is null)), 'coach/0/1');

    -- ---------------------------------------------------------------- k10. run 6's two-tab parts at aal1
    perform pg_temp.k_as(maya_u, 'aal1');
    f := f || pg_temp.k_eq('k10 at aal1: no recap sent, no Won undone, no automation run claimed, no poll made',
      concat_ws('/', pg_temp.k_n(format('select public.session_send_recap(%L, ''Invented recap'')', sess_m)),
                pg_temp.k_n(format('select public.lead_unsettle(%L, ''won'', now())', lead_m)),
                -- Refused either way: 054's claim guard (a BEFORE trigger) runs before the rules and says CC409 for an automation that isn't on.
                (select case when x in ('error 42501', 'error CC409') then 'error 42501' else x end
                   from pg_temp.k_rows(format('insert into public.coach_automation_runs (automation_id, coach_id, event_key) values (%L, %L, ''x'')', gen_random_uuid(), maya_c)) x),
                pg_temp.k_rows(format('insert into public.coach_polls (coach_id, title, time_zone) values (%L, ''x'', ''Europe/London'')', maya_c))),
      'error 42501/error 42501/error 42501/error 42501');
    perform pg_temp.k_admin();
    f := f || pg_temp.k_eq('k10 the recap stayed unsent', ((select recap_sent_at from public.coach_sessions where id = sess_m) is null)::text, 'true');

    perform pg_temp.k_admin();
    raise exception 'undo the test rows' using errcode = 'P0054';
  exception when sqlstate 'P0054' then
    perform pg_temp.k_admin();
  end;

  f := f || pg_temp.k_eq('k99 everything the test made is undone',
    (select count(*)::text from auth.users where email like 'p6a-break-%@example.invalid'), '0');

  if cardinality(f) > 0 then
    raise exception E'054 BREAK-IT FAILED (%):\n%', cardinality(f), array_to_string(f, E'\n');
  end if;
  raise notice '054 BREAK-IT CHECKS PASSED';
end
$k$;
