-- =============================================================================
-- 058_reminder_schedule_test.sql
-- Checks supabase/migrations/058_reminder_schedule.sql. RUN ORDER: 049 to 057,
-- then 058 (twice is fine), then this. On a local stand-in or the test project.
--
-- WHAT IT CHECKS
--   The reminders' schedule:
--     - run_reminder_jobs() and _reminder_jobs_send() exist once each, run as
--       their owner with an empty search path, and nobody signed in or out,
--       nor the server's key, may run them;
--     - where pg_cron is there: exactly one job, clarity-reminders, every
--       15 minutes, running select public.run_reminder_jobs() (058 ran twice
--       and still one); where it isn't, that is said and skipped;
--     - the two calls go to <live address>/api/coach-reminders and
--       /api/workshop-emails with Authorization: Bearer <secret> (where pg_net
--       is there; checked against https://example.invalid inside a step that
--       is undone, so nothing is ever sent), and nothing is asked with an
--       address that isn't https://, has a path, or a secret under 16
--       characters;
--     - with Vault there and the two secrets missing, nothing is asked; with
--       them (made here only when neither name is in Vault yet, and undone),
--       both calls are asked; without Vault, nothing.
--   An associate's sessions, for the owner:
--     - the owner with the code gets each associate's sessions in the range:
--       time, length, kind, the client's or group's name and the coach's
--       first name, and nothing else (no column for a place, a recap or a
--       calendar item); moved and late-cancelled ones left out; never the
--       owner's own;
--     - the owner at aal1, an associate and a client get nothing;
--     - anyone signed out can't call it;
--     - the owner still reads none of the associate's calendar items (051).
--
--   It ends with the notice 058 CHECKS PASSED, or stops with FAILED and a
--   list naming each check that failed. Everything it makes is undone.
-- =============================================================================
create or replace function pg_temp.r_as(p uuid, p_aal text) returns void language plpgsql as $f$
declare sid uuid := gen_random_uuid();
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
  if to_regclass('auth.sessions') is not null and p is not null then
    begin
      execute 'insert into auth.sessions (id, user_id, created_at, updated_at) values ($1, $2, $3, $3)' using sid, p, now();
    exception when others then
      raise notice '058: this database doesn''t let the test write auth.sessions (%)', sqlerrm;
    end;
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated', 'aal', p_aal,
    'amr', json_build_array(json_build_object('method', 'password', 'timestamp', floor(extract(epoch from now()))::bigint)),
    'iat', floor(extract(epoch from now()))::bigint, 'session_id', sid)::text, true);
  perform set_config('role', 'authenticated', true);
end $f$;
create or replace function pg_temp.r_admin() returns void language plpgsql as $f$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
end $f$;
create or replace function pg_temp.r_user(p_label text) returns uuid language plpgsql as $f$
declare u uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, aud, role, email_confirmed_at)
  values (u, 'p058-' || p_label || '-' || u || '@example.invalid', 'authenticated', 'authenticated', now());
  return u;
end $f$;
create or replace function pg_temp.r_eq(p_name text, p_got text, p_want text) returns text[] language sql immutable as $f$
  select case when p_got is not distinct from p_want then '{}'::text[] else array[p_name || ': got ' || coalesce(p_got, 'null') || ', wanted ' || coalesce(p_want, 'null')] end;
$f$;
-- What the owner's call returned, kept to read as the database's owner.
create temp table if not exists r_seen (id uuid, coach_id uuid, coach_first_name text, starts_at timestamptz, minutes integer, kind text, client_name text);
grant select, insert, delete on r_seen to authenticated;

do $t$
declare
  f text[] := '{}';
  v text;
  n integer;
  has_cron boolean := to_regnamespace('cron') is not null and to_regclass('cron.job') is not null;
  has_net boolean := to_regnamespace('net') is not null and to_regclass('net.http_request_queue') is not null;
  has_vault boolean := to_regclass('vault.decrypted_secrets') is not null;
  queued_before bigint := 0;
  tess_u uuid; maya_u uuid; sam_u uuid; tess_c uuid; maya_c uuid;
  p_sam uuid := gen_random_uuid(); p_leo uuid := gen_random_uuid(); grp uuid := gen_random_uuid();
  s1 uuid := gen_random_uuid(); s2 uuid := gen_random_uuid(); s3 uuid := gen_random_uuid(); s4 uuid := gen_random_uuid();
  s5 uuid := gen_random_uuid(); s6 uuid := gen_random_uuid(); st uuid := gen_random_uuid();
  it uuid := gen_random_uuid();
  base timestamptz := date_trunc('hour', now()) + interval '2 days';
begin
  -- ---------------------------------------------------------------- the functions and who may run them
  f := f || pg_temp.r_eq('1a one run_reminder_jobs, one _reminder_jobs_send and one coach_associate_sessions after 058 ran twice',
    (select string_agg(proname || ':' || c, ',' order by proname) from (select proname, count(*)::text c from pg_proc
       where pronamespace = 'public'::regnamespace and proname in ('run_reminder_jobs', '_reminder_jobs_send', 'coach_associate_sessions') group by proname) x),
    '_reminder_jobs_send:1,coach_associate_sessions:1,run_reminder_jobs:1');
  f := f || pg_temp.r_eq('1b each runs as its owner with an empty search path',
    (select string_agg(proname || ':' || prosecdef::text || ':' || coalesce(array_to_string(proconfig, ';'), ''), ',' order by proname) from pg_proc
     where pronamespace = 'public'::regnamespace and proname in ('run_reminder_jobs', '_reminder_jobs_send', 'coach_associate_sessions')),
    '_reminder_jobs_send:true:search_path="",coach_associate_sessions:true:search_path="",run_reminder_jobs:true:search_path=""');
  f := f || pg_temp.r_eq('1c nobody signed in or out, nor the server''s key, may run the reminder jobs',
    (select concat(has_function_privilege('anon', 'public.run_reminder_jobs()', 'execute'),
                   has_function_privilege('authenticated', 'public.run_reminder_jobs()', 'execute'),
                   has_function_privilege('service_role', 'public.run_reminder_jobs()', 'execute'),
                   has_function_privilege('anon', 'public._reminder_jobs_send(text,text)', 'execute'),
                   has_function_privilege('authenticated', 'public._reminder_jobs_send(text,text)', 'execute'),
                   has_function_privilege('service_role', 'public._reminder_jobs_send(text,text)', 'execute'))),
    'ffffff');
  f := f || pg_temp.r_eq('1d an associate''s sessions: anyone signed out can''t ask, anyone signed in can (the function decides)',
    (select concat(has_function_privilege('anon', 'public.coach_associate_sessions(timestamptz,timestamptz)', 'execute'),
                   has_function_privilege('authenticated', 'public.coach_associate_sessions(timestamptz,timestamptz)', 'execute'))),
    'ft');
  f := f || pg_temp.r_eq('1e the function that reads coaches asks for the code (054''s rule)',
    (select (prosrc ~ 'coach_code_ok\(')::text from pg_proc where pronamespace = 'public'::regnamespace and proname = 'coach_associate_sessions'), 'true');
  if to_regclass('public.migration_log') is not null then
    f := f || pg_temp.r_eq('1f the migration recorded itself, once',
      (select count(*)::text from public.migration_log where number = 58 and name = '058_reminder_schedule'), '1');
  end if;

  -- ---------------------------------------------------------------- the schedule
  if has_cron then
    execute 'select string_agg(schedule || ''|'' || command, '','') from cron.job where jobname = $1' into v using 'clarity-reminders';
    f := f || pg_temp.r_eq('2a one job, clarity-reminders, every 15 minutes, running run_reminder_jobs()', v, '*/15 * * * *|select public.run_reminder_jobs()');
  else
    raise notice '058 test: pg_cron isn''t on this database, so the schedule wasn''t checked (058 said so and skipped it).';
  end if;

  begin
    -- ---------------------------------------------------------------- the calls (undone with everything else)
    perform pg_temp.r_admin();
    if has_net then
      execute 'select coalesce(max(id), 0) from net.http_request_queue' into queued_before;
      f := f || pg_temp.r_eq('3a an address and a good secret: two calls asked', public._reminder_jobs_send('https://example.invalid/', 'test-secret-058-abcdefgh')::text, '2');
      execute 'select string_agg(method || '' '' || url || '' '' || (headers ->> ''Authorization''), '','' order by id) from net.http_request_queue where id > $1' into v using queued_before;
      f := f || pg_temp.r_eq('3b the two addresses, each with the secret in its header',
        v, 'GET https://example.invalid/api/coach-reminders Bearer test-secret-058-abcdefgh,GET https://example.invalid/api/workshop-emails Bearer test-secret-058-abcdefgh');
      execute 'select coalesce(max(id), 0) from net.http_request_queue' into queued_before;
      f := f || pg_temp.r_eq('3c nothing is asked of an address that isn''t https, has a path, or a short secret',
        concat(public._reminder_jobs_send('http://example.invalid', 'test-secret-058-abcdefgh'),
               public._reminder_jobs_send('https://example.invalid/somewhere', 'test-secret-058-abcdefgh'),
               public._reminder_jobs_send('https://example.invalid', 'short'),
               public._reminder_jobs_send('https://example.invalid', 'test secret 058 with spaces'),
               public._reminder_jobs_send(null, null)), '00000');
      execute 'select count(*)::text from net.http_request_queue where id > $1' into v using queued_before;
      f := f || pg_temp.r_eq('3d and nothing was queued for them', v, '0');
    else
      f := f || pg_temp.r_eq('3a without pg_net nothing is asked', public._reminder_jobs_send('https://example.invalid', 'test-secret-058-abcdefgh')::text, '0');
    end if;

    if not has_vault then
      f := f || pg_temp.r_eq('4a without Vault the job asks nothing', public.run_reminder_jobs()::text, '0');
    else
      execute 'select count(*)::integer from vault.decrypted_secrets where name in ($1, $2)' into n using 'clarity_cron_secret', 'clarity_live_url';
      if n = 0 then
        f := f || pg_temp.r_eq('4a with Vault but neither secret in it, the job asks nothing', public.run_reminder_jobs()::text, '0');
        execute 'select vault.create_secret($1, $2)' using 'test-secret-058-abcdefgh', 'clarity_cron_secret';
        f := f || pg_temp.r_eq('4b with only the secret, still nothing', public.run_reminder_jobs()::text, '0');
        execute 'select vault.create_secret($1, $2)' using 'https://example.invalid', 'clarity_live_url';
        if has_net then
          execute 'select coalesce(max(id), 0) from net.http_request_queue' into queued_before;
          f := f || pg_temp.r_eq('4c with both, the job asks the two addresses', public.run_reminder_jobs()::text, '2');
          execute 'select string_agg(url, '','' order by id) from net.http_request_queue where id > $1' into v using queued_before;
          f := f || pg_temp.r_eq('4d from the live address in Vault', v, 'https://example.invalid/api/coach-reminders,https://example.invalid/api/workshop-emails');
        else
          f := f || pg_temp.r_eq('4c with both but no pg_net, nothing', public.run_reminder_jobs()::text, '0');
        end if;
      else
        raise notice '058 test: Vault already holds clarity_cron_secret or clarity_live_url here, so the job wasn''t run by the test.';
      end if;
    end if;

    -- ---------------------------------------------------------------- an associate's sessions, for the owner
    tess_u := pg_temp.r_user('tess'); maya_u := pg_temp.r_user('maya'); sam_u := pg_temp.r_user('sam');
    insert into public.coaches (user_id, role, display_first_name) values (tess_u, 'owner', 'Tess') returning id into tess_c;
    insert into public.coaches (user_id, role, display_first_name) values (maya_u, 'coach', 'Maya') returning id into maya_c;
    insert into public.client_profiles (id, coach_id, name, email) values
      (p_sam, maya_c, 'Sam Okafor 058', 'sam.058@example.invalid'), (p_leo, tess_c, 'Leo Grant 058', 'leo.058@example.invalid');
    insert into public.coach_clients (client_id, coach_id) values (sam_u, maya_c);
    insert into public.coach_groups (id, coach_id, name) values (grp, maya_c, 'Kestrel team 058');
    insert into public.coach_sessions (id, coach_id, profile_id, group_id, kind, starts_at, minutes, place, outcome, recap) values
      (s1, maya_c, p_sam, null, 'coaching', base, 60, 'Leeds office', null, null),
      (s2, maya_c, null, grp, 'group', base + interval '1 day', 90, null, null, null),
      (s3, maya_c, p_sam, null, 'review', base - interval '1 day', 30, null, 'held', 'Private words.'),
      (s4, maya_c, p_sam, null, 'coaching', base + interval '2 days', 60, null, 'moved', null),
      (s5, maya_c, p_sam, null, 'coaching', base + interval '3 days', 60, null, 'late_cancel', null),
      (s6, maya_c, p_sam, null, 'coaching', base + interval '80 days', 60, null, null, null),
      (st, tess_c, p_leo, null, 'coaching', base, 60, null, null, null);
    insert into public.coach_cal_items (id, coach_id, kind, title, starts_at, ends_at, time_zone)
    values (it, maya_c, 'own_time', 'Maya''s dentist 058', base + interval '4 hours', base + interval '5 hours', 'Europe/London');

    -- The owner, with the code.
    perform pg_temp.r_as(tess_u, 'aal2');
    delete from r_seen;
    insert into r_seen select * from public.coach_associate_sessions(base - interval '2 days', base + interval '30 days');
    perform pg_temp.r_admin();
    select string_agg(round(extract(epoch from starts_at - base) / 3600)::text || '|' || minutes || '|' || kind || '|' || client_name || '|' || coach_first_name, ',' order by starts_at)
      into v from r_seen where coach_id = maya_c;
    f := f || pg_temp.r_eq('5a the owner sees Maya''s sessions: time, length, kind, the client or group, and Maya''s name',
      v, '-24|30|review|Sam Okafor 058|Maya,0|60|coaching|Sam Okafor 058|Maya,24|90|group|Kestrel team 058|Maya');
    f := f || pg_temp.r_eq('5b never the owner''s own sessions', (select count(*)::text from r_seen where coach_id = tess_c), '0');
    f := f || pg_temp.r_eq('5c moved and late-cancelled sessions are left out, and none past the range',
      (select count(*)::text from r_seen where id in (s4, s5, s6)), '0');
    f := f || pg_temp.r_eq('5d only those seven columns (no place, recap or calendar item)',
      (select string_agg(x.a, ',' order by x.k) from unnest((select proargnames from pg_proc where pronamespace = 'public'::regnamespace and proname = 'coach_associate_sessions'))
         with ordinality x(a, k) where x.k > 2),
      'id,coach_id,coach_first_name,starts_at,minutes,kind,client_name');
    -- At most 63 days a call.
    perform pg_temp.r_as(tess_u, 'aal2');
    delete from r_seen;
    insert into r_seen select * from public.coach_associate_sessions(base - interval '2 days', base + interval '400 days');
    perform pg_temp.r_admin();
    f := f || pg_temp.r_eq('5e a range longer than 63 days stops at 63', (select count(*)::text from r_seen where id = s6), '0');
    -- Backwards or empty: nothing.
    perform pg_temp.r_as(tess_u, 'aal2');
    v := (select count(*)::text from public.coach_associate_sessions(base + interval '5 days', base));
    v := v || (select count(*)::text from public.coach_associate_sessions(null, base));
    perform pg_temp.r_admin();
    f := f || pg_temp.r_eq('5f a range that ends before it starts, or has no start, gives nothing', v, '00');

    -- The owner still reads none of Maya's calendar.
    perform pg_temp.r_as(tess_u, 'aal2');
    v := (select count(*)::text from public.coach_cal_items where id = it);
    perform pg_temp.r_admin();
    f := f || pg_temp.r_eq('6a the owner reads none of an associate''s calendar items', v, '0');

    -- Anyone else: nothing.
    perform pg_temp.r_as(tess_u, 'aal1');
    v := (select count(*)::text from public.coach_associate_sessions(base - interval '2 days', base + interval '30 days'));
    perform pg_temp.r_as(maya_u, 'aal2');
    v := v || (select count(*)::text from public.coach_associate_sessions(base - interval '2 days', base + interval '30 days'));
    perform pg_temp.r_as(sam_u, 'aal1');
    v := v || (select count(*)::text from public.coach_associate_sessions(base - interval '2 days', base + interval '30 days'));
    perform pg_temp.r_admin();
    f := f || pg_temp.r_eq('6b the owner without the code, an associate and a client get nothing', v, '000');

    perform pg_temp.r_admin();
    raise exception 'undo the test rows' using errcode = 'P0058';
  exception when sqlstate 'P0058' then
    perform pg_temp.r_admin();
  end;

  f := f || pg_temp.r_eq('7a everything the test made is undone',
    (select count(*)::text from auth.users where email like 'p058-%@example.invalid'), '0');
  if has_vault then
    execute 'select count(*)::text from vault.decrypted_secrets where decrypted_secret = $1' into v using 'test-secret-058-abcdefgh';
    f := f || pg_temp.r_eq('7b no test secret is left in Vault', v, '0');
  end if;
  if has_net then
    execute 'select count(*)::text from net.http_request_queue where url like $1' into v using 'https://example.invalid/%';
    f := f || pg_temp.r_eq('7c no test call is left to send', v, '0');
  end if;

  if cardinality(f) > 0 then
    raise exception E'058 FAILED (%):\n%', cardinality(f), array_to_string(f, E'\n');
  end if;
  raise notice '058 CHECKS PASSED';
end
$t$;
