-- =============================================================================
-- 058_reminder_schedule_breakit_test.sql
-- The break-it tester's checks of supabase/migrations/058_reminder_schedule.sql
-- (tidy pass follow-up 3; 23 Nov 2026). RUN ORDER: 049 to 057, then 058
-- (twice is fine), then 058's two tests, then this. Dry run only, on a local
-- stand-in or the test project. Nothing is ever sent: every call it makes is
-- to https://example.invalid (or a made-up host under .invalid) inside a step
-- that is undone, and pg_net only sends what a committed transaction queued.
--
-- WHAT IT TRIES
--   1. Running the jobs as anyone but the database's owner (the scheduler):
--      signed out, signed in, the owner coach with the code, the server's
--      key; each is refused, and no one but the owner may run them (no
--      PUBLIC execute either).
--   2. Odd values in Vault for the live address and the secret: empty,
--      spaces only, http, a path, a query, a fragment, a port, a name and
--      password before the host, a host ending in a dot, a lone host, an IP
--      address, a punycode host, another domain, a 4,000-character secret, a
--      secret with a tab or a new line in it, and two secrets of one name
--      (the newest is read). Only a plain https host with a usable secret is
--      asked, and only at its two addresses.
--   3. The secret is never written anywhere but the call's own header: not
--      in the address, not in the job's command, not in any notice the two
--      functions can raise.
--   4. Two runs at once: each queues its own two calls (the reminders
--      themselves are claimed once in the database, 050 and 051, and the
--      addresses' unit test tests/performance/reminders-once.test.mjs shows
--      each goes once); 058 run again keeps one job.
--   5. coach_associate_sessions as an associate, the owner at aal1, an owner
--      who is no longer active, a client, anyone signed out; with ranges
--      reversed, empty, null, infinite and huge; two associates' sessions
--      each under the right coach's name; a session with no client or group;
--      the owner's own sessions never included.
--   6. The suggestions rule when coaching ends and restarts on the same row,
--      when the coach is no longer active, when the coach's account is
--      deleted, when the client is deleted, and for another client of the
--      same coach.
--
--   It ends with the notice 058 BREAK-IT CHECKS PASSED, or stops with FAILED
--   and a list naming each check that failed. Everything it makes is undone.
-- =============================================================================
-- A sign-in, written to auth.sessions where that table exists (a hosted project
-- checks a sign-in is there once a coach has a reset on record; 056's break-it
-- test does the same). Undone with everything else.
create or replace function pg_temp.k_as(p uuid, p_aal text) returns void language plpgsql as $f$
declare sid uuid := gen_random_uuid();
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
  if to_regclass('auth.sessions') is not null and p is not null then
    begin
      execute 'insert into auth.sessions (id, user_id, created_at, updated_at) values ($1, $2, $3, $3)' using sid, p, now();
    exception when others then
      raise notice '058 break-it: this database doesn''t let the test write auth.sessions (%)', sqlerrm;
    end;
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated', 'aal', p_aal,
    'amr', json_build_array(json_build_object('method', 'password', 'timestamp', floor(extract(epoch from now()))::bigint)),
    'iat', floor(extract(epoch from now()))::bigint, 'session_id', sid)::text, true);
  perform set_config('role', 'authenticated', true);
end $f$;
create or replace function pg_temp.k_role(p_role text) returns void language plpgsql as $f$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', json_build_object('role', p_role)::text, true);
  perform set_config('role', p_role, true);
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
  values (u, 'p058-breakit-' || p_label || '-' || u || '@example.invalid', 'authenticated', 'authenticated', now());
  return u;
end $f$;
create or replace function pg_temp.k_eq(p_name text, p_got text, p_want text) returns text[] language sql immutable as $f$
  select case when p_got is not distinct from p_want then '{}'::text[] else array[p_name || ': got ' || coalesce(p_got, 'null') || ', wanted ' || coalesce(p_want, 'null')] end;
$f$;
-- Calls a function as the current role: its answer, or 'refused' when the database won't let this role run it.
create or replace function pg_temp.k_try(p_sql text) returns text language plpgsql as $f$
declare v text;
begin
  execute p_sql into v;
  return coalesce(v, 'null');
exception when insufficient_privilege then
  return 'refused';
when others then
  return 'error ' || sqlstate;
end $f$;
grant execute on function pg_temp.k_try(text) to anon, authenticated, service_role;
create temp table if not exists k_seen (id uuid, coach_id uuid, coach_first_name text, starts_at timestamptz, minutes integer, kind text, client_name text);
grant select, insert, delete on k_seen to authenticated;

do $t$
declare
  f text[] := '{}';
  v text;
  n integer;
  has_cron boolean := to_regnamespace('cron') is not null and to_regclass('cron.job') is not null;
  has_net boolean := to_regnamespace('net') is not null and to_regclass('net.http_request_queue') is not null;
  has_vault boolean := to_regclass('vault.decrypted_secrets') is not null;
  q bigint := 0;
  good text := 'k058-secret-abcdefghij';
  long_secret text := repeat('k058', 1000);
  url_id uuid; secret_id uuid;
  tess_u uuid; maya_u uuid; ravi_u uuid; sam_u uuid; ann_u uuid; tess_c uuid; maya_c uuid; ravi_c uuid;
  p_sam uuid := gen_random_uuid(); p_ann uuid := gen_random_uuid(); p_leo uuid := gen_random_uuid();
  s_m uuid := gen_random_uuid(); s_r uuid := gen_random_uuid(); s_none uuid := gen_random_uuid(); s_t uuid := gen_random_uuid();
  base timestamptz := date_trunc('hour', now()) + interval '3 days';
  odd text[];
  want text[];
  i integer;
begin
  -- ---------------------------------------------------------------- 1. only the scheduler runs the jobs
  f := f || pg_temp.k_eq('1a no PUBLIC execute on either job function',
    (select string_agg(proname || ':' || coalesce((select bool_or(a.grantee = 0) from aclexplode(p.proacl) a where a.privilege_type = 'EXECUTE'), false)::text, ',' order by proname)
     from pg_proc p where pronamespace = 'public'::regnamespace and proname in ('run_reminder_jobs', '_reminder_jobs_send')),
    '_reminder_jobs_send:false,run_reminder_jobs:false');
  f := f || pg_temp.k_eq('1b only the owner of the functions is granted them (no other role)',
    (select string_agg(distinct pg_get_userbyid(a.grantee), ',') from pg_proc p, aclexplode(p.proacl) a
     where pronamespace = 'public'::regnamespace and proname in ('run_reminder_jobs', '_reminder_jobs_send')
       and a.privilege_type = 'EXECUTE' and a.grantee <> p.proowner and pg_get_userbyid(a.grantee) not in ('postgres', 'supabase_admin')),
    null);
  v := '';
  perform pg_temp.k_role('anon');
  v := v || pg_temp.k_try('select public.run_reminder_jobs()::text') || '/' || pg_temp.k_try('select public._reminder_jobs_send(''https://example.invalid'', ''' || good || ''')::text');
  perform pg_temp.k_role('service_role');
  v := v || '/' || pg_temp.k_try('select public.run_reminder_jobs()::text') || '/' || pg_temp.k_try('select public._reminder_jobs_send(''https://example.invalid'', ''' || good || ''')::text');
  perform pg_temp.k_role('authenticated');
  v := v || '/' || pg_temp.k_try('select public.run_reminder_jobs()::text') || '/' || pg_temp.k_try('select public._reminder_jobs_send(''https://example.invalid'', ''' || good || ''')::text');
  perform pg_temp.k_admin();
  f := f || pg_temp.k_eq('1c signed out, the server''s key and anyone signed in are refused both', v, 'refused/refused/refused/refused/refused/refused');

  begin
    -- ---------------------------------------------------------------- 2. odd values in Vault
    perform pg_temp.k_admin();
    if has_net then
      odd := array[
        '', '   ', 'http://example.invalid', 'https://example.invalid/somewhere', 'https://example.invalid?x=1', 'https://example.invalid#top',
        'https://example.invalid:8443', 'https://user:pw@example.invalid', 'https://example.invalid.', 'https://localhost', 'https://',
        'example.invalid', '//example.invalid', 'https://exa mple.invalid', 'https://-bad.invalid', E'https://example.invalid\n/x',
        'https://192.168.0.1.invalid', 'https://xn--bcher-kva.invalid', 'https://other-site.invalid', 'HTTPS://EXAMPLE.INVALID/'];
      -- What each gives: 0 (nothing asked) for the first sixteen; a plain https host is asked, whichever domain (Vault is
      -- Tim's alone to write; the domain is never written in the migration, as Tim asked).
      want := array['0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '2', '2', '2', '2'];
      v := ''; i := 0;
      foreach i in array array[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20] loop
        if public._reminder_jobs_send(odd[i], good)::text is distinct from want[i] then
          v := v || '[' || replace(odd[i], E'\n', '\n') || ' gave ' || public._reminder_jobs_send(odd[i], good) || ']';
        end if;
      end loop;
      f := f || pg_temp.k_eq('2a only a plain https host (no path, query, fragment, port, password or single name) is asked', nullif(v, ''), null);
      execute 'select coalesce(max(id), 0) from net.http_request_queue' into q;
      v := concat(public._reminder_jobs_send('https://example.invalid', ''), public._reminder_jobs_send('https://example.invalid', '               '),
                  public._reminder_jobs_send('https://example.invalid', E'k058-secret\tabcdefghij'), public._reminder_jobs_send('https://example.invalid', E'k058-secret-abcdefghij\n'),
                  public._reminder_jobs_send('https://example.invalid', 'k058-short'));
      f := f || pg_temp.k_eq('2b a secret that is empty, spaces, has a tab or a new line, or is short: nothing asked', v, '00000');
      execute 'select count(*)::text from net.http_request_queue where id > $1' into v using q;
      f := f || pg_temp.k_eq('2c and nothing was queued for any of them', v, '0');
      execute 'select coalesce(max(id), 0) from net.http_request_queue' into q;
      f := f || pg_temp.k_eq('2d a 4,000-character secret is sent whole', public._reminder_jobs_send('https://example.invalid', long_secret)::text, '2');
      execute 'select string_agg(char_length(headers ->> ''Authorization'')::text, '','' order by id) from net.http_request_queue where id > $1' into v using q;
      f := f || pg_temp.k_eq('2e in the header, whole', v, (char_length(long_secret) + 7)::text || ',' || (char_length(long_secret) + 7)::text);

      -- ---------------------------------------------------------------- 3. the secret only in the header
      execute 'select coalesce(max(id), 0) from net.http_request_queue' into q;
      perform public._reminder_jobs_send('https://example.invalid', good);
      execute 'select count(*)::text || '':'' || count(*) filter (where position($2 in url) > 0)::text || '':'' || count(*) filter (where headers ->> ''Authorization'' = ''Bearer '' || $2)::text
               from net.http_request_queue where id > $1' into v using q, good;
      f := f || pg_temp.k_eq('3a two calls, the secret in neither address and in both headers', v, '2:0:2');
      execute 'select string_agg(distinct method, '','') from net.http_request_queue where id > $1' into v using q;
      f := f || pg_temp.k_eq('3b asked with GET, so no body carries anything', v, 'GET');
    else
      f := f || pg_temp.k_eq('2a without pg_net nothing is asked, whatever the values', concat(public._reminder_jobs_send('https://example.invalid', good), public._reminder_jobs_send('', '')), '00');
    end if;
    f := f || pg_temp.k_eq('3c no notice either function can raise names the secret, the header or the address',
      (select string_agg(proname, ',') from pg_proc where pronamespace = 'public'::regnamespace and proname in ('run_reminder_jobs', '_reminder_jobs_send')
         and prosrc ~* 'raise[^;]*(v_secret|p_secret|v_head|v_base|p_base)'), null);
    if has_cron then
      execute 'select count(*)::text from cron.job where jobname = $1 and command !~* ''secret|bearer|vault|https?://''' into v using 'clarity-reminders';
      f := f || pg_temp.k_eq('3d the job''s command (kept in cron.job and each run''s log) holds no secret, address or Vault name', v, '1');
    end if;

    -- Vault with two secrets of one name: the newest is read (a secret changed by adding a new one).
    if has_vault and has_net then
      execute 'select count(*)::integer from vault.decrypted_secrets where name in ($1, $2)' into n using 'clarity_cron_secret', 'clarity_live_url';
      if n = 0 and to_regclass('vault.secrets') is not null and exists (select 1 from information_schema.columns where table_schema = 'vault' and table_name = 'secrets' and column_name = 'created_at') then
        execute 'select vault.create_secret($1, $2)' into url_id using 'https://example.invalid', 'clarity_live_url';
        execute 'select vault.create_secret($1, $2)' into secret_id using good, 'clarity_cron_secret';
        execute 'select coalesce(max(id), 0) from net.http_request_queue' into q;
        -- ---------------------------------------------------------------- 4. two runs at once
        f := f || pg_temp.k_eq('4a two runs together each ask the two addresses (each reminder is still claimed once, 050 and 051)',
          concat(public.run_reminder_jobs(), public.run_reminder_jobs()), '22');
        execute 'select count(*)::text from net.http_request_queue where id > $1 and headers ->> ''Authorization'' = ''Bearer '' || $2' into v using q, good;
        f := f || pg_temp.k_eq('4b four calls, each with the secret read from Vault', v, '4');
        -- An address in Vault that isn't usable: nothing. Changed through Vault's own vault.update_secret (hosted Supabase
        -- refuses a direct write to vault.secrets, 42501, test project 24 Nov). Where even that is refused, 4c to 4e are
        -- skipped with a NOTE; the secrets made above are still undone with everything else (P0858 below).
        begin
          execute 'select vault.update_secret($1, $2)' using url_id, 'http://example.invalid';
          f := f || pg_temp.k_eq('4c an http address in Vault: the job asks nothing', public.run_reminder_jobs()::text, '0');
          execute 'select vault.update_secret($1, $2)' using url_id, '';
          f := f || pg_temp.k_eq('4d an empty address in Vault: nothing', public.run_reminder_jobs()::text, '0');
          execute 'select vault.update_secret($1, $2)' using url_id, 'https://example.invalid';
          execute 'select vault.update_secret($1, $2)' using secret_id, 'short';
          f := f || pg_temp.k_eq('4e a short secret in Vault: nothing', public.run_reminder_jobs()::text, '0');
        exception when insufficient_privilege or undefined_function then
          raise notice '058 break-it: NOTE for Tim: Vault''s secrets can''t be changed here (%), so 4c to 4e (an unusable address or secret in Vault) were skipped. 2a and 2b check the same values without Vault.', sqlerrm;
        end;
      else
        raise notice '058 break-it: Vault already holds clarity_cron_secret or clarity_live_url here (or isn''t the stand-in''s shape), so the job wasn''t run.';
      end if;
    end if;
    if has_cron then
      execute 'select count(*)::text from cron.job where jobname = $1' into v using 'clarity-reminders';
      f := f || pg_temp.k_eq('4f one job, however often 058 has run', v, '1');
    end if;

    -- ---------------------------------------------------------------- 5. an associate's sessions
    tess_u := pg_temp.k_user('tess'); maya_u := pg_temp.k_user('maya'); ravi_u := pg_temp.k_user('ravi');
    sam_u := pg_temp.k_user('sam'); ann_u := pg_temp.k_user('ann');
    insert into public.coaches (user_id, role, display_first_name) values (tess_u, 'owner', 'Tess') returning id into tess_c;
    insert into public.coaches (user_id, role, display_first_name) values (maya_u, 'coach', 'Maya') returning id into maya_c;
    insert into public.coaches (user_id, role, display_first_name) values (ravi_u, 'coach', 'Ravi') returning id into ravi_c;
    insert into public.client_profiles (id, coach_id, name, email) values
      (p_sam, maya_c, 'Sam K058', 'sam.k058@example.invalid'), (p_ann, ravi_c, 'Ann K058', 'ann.k058@example.invalid'),
      (p_leo, tess_c, 'Leo K058', 'leo.k058@example.invalid');
    insert into public.coach_clients (client_id, coach_id) values (sam_u, maya_c), (ann_u, maya_c);
    insert into public.coach_sessions (id, coach_id, profile_id, group_id, kind, starts_at, minutes) values
      (s_m, maya_c, p_sam, null, 'coaching', base, 60),
      (s_r, ravi_c, p_ann, null, 'review', base + interval '1 hour', 30),
      (s_none, ravi_c, p_sam, null, 'coaching', base + interval '2 hours', 90),
      (s_t, tess_c, p_leo, null, 'coaching', base, 60);

    perform pg_temp.k_as(tess_u, 'aal2');
    delete from k_seen;
    insert into k_seen select * from public.coach_associate_sessions(base - interval '1 day', base + interval '1 day');
    perform pg_temp.k_admin();
    f := f || pg_temp.k_eq('5a two associates'' sessions, each under the coach who holds it (Ravi covering Maya''s client too), never the owner''s own',
      (select string_agg(coach_first_name || '|' || coalesce(client_name, '-') || '|' || kind, ',' order by starts_at) from k_seen where id in (s_m, s_r, s_none, s_t)),
      'Maya|Sam K058|coaching,Ravi|Ann K058|review,Ravi|Sam K058|coaching');
    -- Ranges.
    perform pg_temp.k_as(tess_u, 'aal2');
    v := concat(
      (select count(*) from public.coach_associate_sessions(base + interval '1 day', base - interval '1 day')), '/',
      (select count(*) from public.coach_associate_sessions(base, base)), '/',
      (select count(*) from public.coach_associate_sessions(null, null)), '/',
      (select count(*) from public.coach_associate_sessions('-infinity', 'infinity')), '/',
      (select count(*) from public.coach_associate_sessions(base - interval '1 day', 'infinity') where id in (s_m, s_r, s_none)), '/',
      (select count(*) from public.coach_associate_sessions(base - interval '1000 years', base + interval '1000 years') where id in (s_m, s_r, s_none)), '/',
      (select count(*) from public.coach_associate_sessions(base - interval '62 days', base + interval '1 year') where id in (s_m, s_r, s_none)), '/',
      (select count(*) from public.coach_associate_sessions(base - interval '64 days', base + interval '1 year') where id in (s_m, s_r, s_none)));
    perform pg_temp.k_admin();
    f := f || pg_temp.k_eq('5b reversed, empty, null and endless-start ranges give nothing; an endless end stops at 63 days; a huge range never reaches far sessions',
      v, '0/0/0/0/3/0/3/0');
    -- Who gets nothing.
    v := '';
    perform pg_temp.k_as(maya_u, 'aal2');
    v := v || (select count(*) from public.coach_associate_sessions(base - interval '1 day', base + interval '1 day'))::text;
    perform pg_temp.k_as(tess_u, 'aal1');
    v := v || '/' || (select count(*) from public.coach_associate_sessions(base - interval '1 day', base + interval '1 day'))::text;
    perform pg_temp.k_as(sam_u, 'aal2');
    v := v || '/' || (select count(*) from public.coach_associate_sessions(base - interval '1 day', base + interval '1 day'))::text;
    perform pg_temp.k_as(null, 'aal2');
    v := v || '/' || (select count(*) from public.coach_associate_sessions(base - interval '1 day', base + interval '1 day'))::text;
    perform pg_temp.k_role('anon');
    v := v || '/' || pg_temp.k_try('select count(*)::text from public.coach_associate_sessions(now(), now() + interval ''1 day'')');
    perform pg_temp.k_admin();
    update public.coaches set active = false where id = tess_c;
    perform pg_temp.k_as(tess_u, 'aal2');
    v := v || '/' || (select count(*) from public.coach_associate_sessions(base - interval '1 day', base + interval '1 day'))::text;
    perform pg_temp.k_admin();
    update public.coaches set active = true where id = tess_c;
    f := f || pg_temp.k_eq('5c an associate, the owner without the code, a client, a sign-in with no account, anyone signed out, and an owner no longer active: nothing',
      v, '0/0/0/0/refused/0');
    -- An associate can't make herself owner (049's rule), so she can never read the others' sessions.
    perform pg_temp.k_as(maya_u, 'aal2');
    v := pg_temp.k_try('update public.coaches set role = ''owner'' where user_id = ''' || maya_u || ''' returning role');
    perform pg_temp.k_admin();
    f := f || pg_temp.k_eq('5d an associate can''t make herself owner', (select role from public.coaches where id = maya_c), 'coach');

    -- ---------------------------------------------------------------- 6. the suggestions rule
    insert into public.own_question_suggestions (user_id, coach_user_id, coach_first_name, tool, wording, answer_type)
    values (sam_u, maya_u, 'Maya', 'daily_plan', 'K058 what matters most?', 'written');
    perform pg_temp.k_as(sam_u, 'aal1');
    v := (select count(*) from public.own_question_suggestions where wording like 'K058%')::text;
    perform pg_temp.k_as(ann_u, 'aal1');
    v := v || '/' || (select count(*) from public.own_question_suggestions where wording like 'K058%')::text;
    perform pg_temp.k_admin();
    update public.coach_clients set ended_at = now() where client_id = sam_u and coach_id = maya_c;
    perform pg_temp.k_as(sam_u, 'aal1');
    v := v || '/' || (select count(*) from public.own_question_suggestions where wording like 'K058%')::text;
    perform pg_temp.k_admin();
    update public.coach_clients set ended_at = null where client_id = sam_u and coach_id = maya_c;
    perform pg_temp.k_as(sam_u, 'aal1');
    v := v || '/' || (select count(*) from public.own_question_suggestions where wording like 'K058%')::text;
    perform pg_temp.k_admin();
    update public.coaches set active = false where id = maya_c;
    perform pg_temp.k_as(sam_u, 'aal1');
    v := v || '/' || (select count(*) from public.own_question_suggestions where wording like 'K058%')::text;
    perform pg_temp.k_admin();
    update public.coaches set active = true where id = maya_c;
    f := f || pg_temp.k_eq('6a Sam reads it while Maya coaches him; another client of Maya''s never; hidden once ended, back when the same row restarts, hidden while Maya isn''t active',
      v, '1/0/0/1/0');
    -- The client deleted: the suggestion goes with him. The coach's account deleted: it goes too (055's cascade).
    insert into public.own_question_suggestions (user_id, coach_user_id, coach_first_name, tool, wording, answer_type)
    values (ann_u, maya_u, 'Maya', 'daily_review', 'K058 where did I lead?', 'written');
    delete from public.coach_clients where client_id = sam_u;
    delete from auth.users where id = sam_u;
    v := (select count(*) from public.own_question_suggestions where user_id = sam_u)::text;
    perform pg_temp.k_as(ann_u, 'aal1');
    v := v || '/' || (select count(*) from public.own_question_suggestions where wording like 'K058%')::text;
    perform pg_temp.k_admin();
    f := f || pg_temp.k_eq('6b a deleted client''s suggestions are gone; Ann reads hers while Maya coaches her', v, '0/1');
    perform pg_temp.k_as(ann_u, 'aal1');
    v := pg_temp.k_try('select public.own_suggestion_coach_current(null)::text') || '/' || pg_temp.k_try('select public.own_suggestion_coach_current(''' || gen_random_uuid() || ''')::text');
    perform pg_temp.k_admin();
    f := f || pg_temp.k_eq('6c no coach, or someone who isn''t a coach: false', v, 'false/false');

    perform pg_temp.k_admin();
    raise exception 'undo the test rows' using errcode = 'P0858';
  exception when sqlstate 'P0858' then
    perform pg_temp.k_admin();
  end;

  -- Things only Supabase decides (pg_net's own grants), said for Tim rather than failed: anyone who could read the
  -- queue for the moment a call waits there would see the header.
  if has_net then
    if has_table_privilege('authenticated', 'net.http_request_queue', 'select') or has_table_privilege('anon', 'net.http_request_queue', 'select') then
      raise notice '058 break-it: NOTE for Tim: signed-in or signed-out users may read net.http_request_queue here, where a call waits with its header for a moment.';
    end if;
  end if;

  f := f || pg_temp.k_eq('7a everything the test made is undone',
    (select count(*)::text from auth.users where email like 'p058-breakit-%@example.invalid'), '0');
  if has_vault then
    execute 'select count(*)::text from vault.decrypted_secrets where decrypted_secret in ($1, $2)' into v using good, long_secret;
    f := f || pg_temp.k_eq('7b no test secret is left in Vault', v, '0');
  end if;
  if has_net then
    execute 'select count(*)::text from net.http_request_queue where url like $1' into v using 'https://%.invalid%';
    f := f || pg_temp.k_eq('7c no test call is left to send', v, '0');
  end if;

  if cardinality(f) > 0 then
    raise exception E'058 BREAK-IT FAILED (%):\n%', cardinality(f), array_to_string(f, E'\n');
  end if;
  raise notice '058 BREAK-IT CHECKS PASSED';
end
$t$;
