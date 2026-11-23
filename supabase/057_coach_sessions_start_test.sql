-- =============================================================================
-- 057_coach_sessions_start_test.sql
-- Checks supabase/migrations/057_coach_sessions_start.sql. RUN ORDER: 050 to
-- 056, then 057 (twice is fine), then this. Dry run only, on a local
-- stand-in or the test project.
--
-- WHAT IT CHECKS
--   The count always matches the sessions. After every change below, for
--   every engagement of the coach, and for four first loads (the calendar's
--   window, everything sent, nothing sent, and a client's page):
--     the device's count  = coach_sessions_start's `held` for the engagement
--                           + the sessions and session people it sent that count
--     equals the truth    = every session and own-engagement member that
--                           counts (050's rule), counted here straight from
--                           the tables;
--   and engagements.sessions_held is still the base plus the truth (050).
--   Also, each time: every session from p_since on is sent, with its people
--   and no one else's; the older ones the first screens show are sent (each
--   client's and group's oldest to write up, oldest recap not sent, oldest
--   recap with words, latest held); `nudges` plus the unsent recaps it sent
--   is every unsent recap; a client's page gets all that client's sessions;
--   and none of another coach's sessions or engagements appear.
--   The changes: a session added (held, no-show, late cancellation), waived
--   and un-waived, written up, moved (outcome), moved back, held turned into
--   a late cancellation, moved in time across the window and back, moved to
--   another engagement, moved to another client and engagement, a group
--   session's people added, given another engagement and taken away, the
--   group session cancelled late and waived, sessions deleted, a count typed
--   (the base moves), an engagement deleted, and another coach's changes.
--
--   It ends with the notice 057 CHECKS PASSED, or stops with FAILED and a
--   list naming each check that failed. Everything it makes is undone.
-- =============================================================================
create or replace function pg_temp.c_as(p uuid, p_aal text) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated', 'aal', p_aal,
    'amr', json_build_array(json_build_object('method', 'password', 'timestamp', floor(extract(epoch from now()))::bigint)),
    'iat', floor(extract(epoch from now()))::bigint, 'session_id', gen_random_uuid())::text, true);
  perform set_config('role', 'authenticated', true);
end $f$;
create or replace function pg_temp.c_admin() returns void language plpgsql as $f$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
end $f$;
create or replace function pg_temp.c_user(p_label text) returns uuid language plpgsql as $f$
declare u uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, aud, role, email_confirmed_at)
  values (u, 'p057-' || p_label || '-' || u || '@example.invalid', 'authenticated', 'authenticated', now());
  return u;
end $f$;
-- 050's rule, written out again here so the test doesn't lean on the code it checks.
create or replace function pg_temp.c_counts(p_outcome text, p_waived boolean) returns boolean language sql immutable as $f$
  select coalesce(p_outcome in ('held', 'no_show') or (p_outcome = 'late_cancel' and not coalesce(p_waived, false)), false);
$f$;
-- The truth, straight from the tables (as the database's owner).
create or replace function pg_temp.c_truth(p_engagement uuid) returns integer language sql stable as $f$
  select ((select count(*) from public.coach_sessions s where s.engagement_id = p_engagement and pg_temp.c_counts(s.outcome, s.waived))
        + (select count(*) from public.coach_session_people sp join public.coach_sessions s on s.id = sp.session_id
           where sp.engagement_id = p_engagement and pg_temp.c_counts(s.outcome, s.waived)))::integer;
$f$;

-- What one first load sent, as rows.
create temp table if not exists c_sent (id uuid primary key, engagement_id uuid, outcome text, waived boolean, coach_id uuid);
create temp table if not exists c_sent_people (session_id uuid, profile_id uuid, engagement_id uuid);

-- Everything one first load must get right, as p_user (a coach with the code), for p_since and p_profiles.
create or replace function pg_temp.c_load(p_label text, p_user uuid, p_coach uuid, p_since timestamptz, p_profiles uuid[] default '{}')
returns text[] language plpgsql as $f$
declare
  r jsonb;
  f text[] := '{}';
  e record;
  dev integer;
  tr integer;
  got text[];
  want text[];
  n integer;
begin
  perform pg_temp.c_as(p_user, 'aal2');
  r := public.coach_sessions_start(p_since, p_profiles);
  perform pg_temp.c_admin();
  truncate c_sent; truncate c_sent_people;
  insert into c_sent select (x->>'id')::uuid, (x->>'engagement_id')::uuid, x->>'outcome', (x->>'waived')::boolean, (x->>'coach_id')::uuid
    from jsonb_array_elements(r->'sessions') x;
  insert into c_sent_people select (x->>'session_id')::uuid, (x->>'profile_id')::uuid, (x->>'engagement_id')::uuid
    from jsonb_array_elements(r->'people') x;

  -- The count, engagement by engagement.
  for e in select id, sessions_held, sessions_held_base from public.engagements where coach_id = p_coach order by created_at, id loop
    tr := pg_temp.c_truth(e.id);
    dev := coalesce((r->'held'->>e.id::text)::integer, 0)
      + (select count(*) from c_sent s where s.engagement_id = e.id and pg_temp.c_counts(s.outcome, s.waived))::integer
      + (select count(*) from c_sent_people sp join c_sent s on s.id = sp.session_id where sp.engagement_id = e.id and pg_temp.c_counts(s.outcome, s.waived))::integer;
    if dev is distinct from tr then
      f := f || format('%s: an engagement''s count on the device is %s, the sessions say %s', p_label, dev, tr);
    end if;
    if e.sessions_held is distinct from least(1000, greatest(0, e.sessions_held_base + tr)) then
      f := f || format('%s: sessions_held is %s, the base %s plus the sessions %s', p_label, e.sessions_held, e.sessions_held_base, tr);
    end if;
  end loop;
  -- No count for an engagement that isn't this coach's.
  if exists (select 1 from jsonb_object_keys(r->'held') k where k::uuid not in (select id from public.engagements where coach_id = p_coach)) then
    f := f || format('%s: a count for another coach''s engagement', p_label);
  end if;
  -- Only this coach's sessions, and exactly their people.
  if exists (select 1 from c_sent where coach_id is distinct from p_coach) then f := f || format('%s: another coach''s session was sent', p_label); end if;
  select array_agg(x order by x) into got from (select session_id::text || profile_id::text x from c_sent_people) a;
  select array_agg(x order by x) into want from (select sp.session_id::text || sp.profile_id::text x from public.coach_session_people sp where sp.session_id in (select id from c_sent)) a;
  if got::text[] is distinct from want::text[] then f := f || format('%s: the session people sent are not exactly those of the sessions sent', p_label); end if;
  -- Every session from p_since on.
  select count(*) into n from public.coach_sessions s where s.coach_id = p_coach and s.starts_at >= coalesce(p_since, '-infinity') and s.id not in (select id from c_sent);
  if n > 0 then f := f || format('%s: %s sessions from p_since on were not sent', p_label, n); end if;
  -- Every session of a client named.
  select count(*) into n from public.coach_sessions s where s.coach_id = p_coach and s.id not in (select id from c_sent)
    and (s.profile_id = any(p_profiles) or s.id in (select session_id from public.coach_session_people where profile_id = any(p_profiles)));
  if n > 0 then f := f || format('%s: %s sessions of the client named were not sent', p_label, n); end if;
  -- The older ones the first screens show: every tie of each.
  select count(*) into n from public.coach_sessions s where s.coach_id = p_coach and s.starts_at < coalesce(p_since, '-infinity') and s.id not in (select id from c_sent) and (
       (s.outcome is null and s.starts_at = (select min(o.starts_at) from public.coach_sessions o where o.coach_id = p_coach and o.starts_at < p_since and o.outcome is null
                                             and o.profile_id is not distinct from s.profile_id and o.group_id is not distinct from s.group_id))
    or (s.outcome = 'held' and s.recap_sent_at is null and s.starts_at = (select min(o.starts_at) from public.coach_sessions o where o.coach_id = p_coach and o.starts_at < p_since
                                             and o.outcome = 'held' and o.recap_sent_at is null and o.profile_id is not distinct from s.profile_id and o.group_id is not distinct from s.group_id))
    or (s.outcome = 'held' and s.starts_at = (select max(o.starts_at) from public.coach_sessions o where o.coach_id = p_coach and o.starts_at < p_since
                                             and o.outcome = 'held' and o.profile_id is not distinct from s.profile_id and o.group_id is not distinct from s.group_id)));
  if n > 0 then f := f || format('%s: %s older sessions the first screens show were not sent', p_label, n); end if;
  -- Recaps not sent: those sent plus `nudges` is all of them.
  select count(*) into n from public.coach_sessions s where s.coach_id = p_coach and s.outcome = 'held' and s.recap_sent_at is null;
  if n is distinct from (r->>'nudges')::integer + (select count(*) from c_sent s join public.coach_sessions t on t.id = s.id where t.outcome = 'held' and t.recap_sent_at is null)::integer then
    f := f || format('%s: unsent recaps %s, but nudges %s plus %s sent', p_label, n, r->>'nudges',
      (select count(*) from c_sent s join public.coach_sessions t on t.id = s.id where t.outcome = 'held' and t.recap_sent_at is null));
  end if;
  return f;
end $f$;

-- Four first loads after one change.
create or replace function pg_temp.c_all(p_label text, p_user uuid, p_coach uuid, p_client uuid) returns text[] language plpgsql as $f$
begin
  return pg_temp.c_load(p_label || ' (window)', p_user, p_coach, now() - interval '42 days')
      || pg_temp.c_load(p_label || ' (nothing older)', p_user, p_coach, '-infinity')
      || pg_temp.c_load(p_label || ' (all older)', p_user, p_coach, now() + interval '2 years')
      || pg_temp.c_load(p_label || ' (a client''s page)', p_user, p_coach, now() - interval '42 days', array[p_client]);
end $f$;

do $t$
declare
  f text[] := '{}';
  tess_u uuid; maya_u uuid; tess_c uuid; maya_c uuid;
  p_ella uuid := gen_random_uuid(); p_noor uuid := gen_random_uuid(); p_leo uuid := gen_random_uuid();
  grp uuid := gen_random_uuid();
  e1 uuid := gen_random_uuid(); e1b uuid := gen_random_uuid(); e2 uuid := gen_random_uuid(); eg uuid := gen_random_uuid(); et uuid := gen_random_uuid();
  s1 uuid := gen_random_uuid(); s2 uuid := gen_random_uuid(); s3 uuid := gen_random_uuid(); s4 uuid := gen_random_uuid();
  s5 uuid := gen_random_uuid(); s6 uuid := gen_random_uuid(); s7 uuid := gen_random_uuid(); s8 uuid := gen_random_uuid();
  s9 uuid := gen_random_uuid(); s10 uuid := gen_random_uuid(); st uuid := gen_random_uuid();
  ago constant interval := interval '1 day';
  v text;
begin
  f := f || (select case when count(*) = 1 then '{}'::text[] else array['0a one coach_sessions_start after 057 ran twice'] end
             from pg_proc where pronamespace = 'public'::regnamespace and proname = 'coach_sessions_start');
  begin
    perform pg_temp.c_admin();
    tess_u := pg_temp.c_user('tess'); maya_u := pg_temp.c_user('maya');
    insert into public.coaches (user_id, role, display_first_name) values (tess_u, 'owner', 'Tess') returning id into tess_c;
    insert into public.coaches (user_id, role, display_first_name) values (maya_u, 'coach', 'Maya') returning id into maya_c;
    insert into public.client_profiles (id, coach_id, name, email) values
      (p_ella, maya_c, 'Ella Fraser', 'ella.057@example.invalid'), (p_noor, maya_c, 'Noor Haddad', 'noor.057@example.invalid'),
      (p_leo, tess_c, 'Leo Grant', 'leo.057@example.invalid');
    insert into public.coach_groups (id, coach_id, name) values (grp, maya_c, 'Leadership team');
    insert into public.coach_group_members (group_id, profile_id, name, counts_against) values (grp, p_ella, 'Ella Fraser', 'own'), (grp, p_noor, 'Noor Haddad', 'group');
    -- Ella's engagement began with 3 held before sessions were recorded; the others with none.
    insert into public.engagements (id, coach_id, profile_id, kind, sessions_total, sessions_held, created_at) values
      (e1, maya_c, p_ella, 'sessions', 12, 3, now() - 300 * ago), (e1b, maya_c, p_ella, 'sessions', 6, 0, now() - 299 * ago),
      (e2, maya_c, p_noor, 'sessions', 8, 0, now() - 298 * ago), (et, tess_c, p_leo, 'sessions', 10, 1, now() - 297 * ago);
    insert into public.engagements (id, coach_id, group_id, kind, sessions_total, created_at) values (eg, maya_c, grp, 'sessions', 10, now() - 296 * ago);
    insert into public.coach_sessions (id, coach_id, profile_id, group_id, engagement_id, starts_at, outcome, waived, recap) values
      (s1, maya_c, p_ella, null, e1, now() - 100 * ago, 'held', false, 'We looked at the week.'),
      (s2, maya_c, p_ella, null, e1, now() - 80 * ago, 'held', false, 'Two small steps.'),
      (s3, maya_c, p_ella, null, e1, now() - 60 * ago, 'no_show', false, null),
      (s4, maya_c, p_ella, null, e1, now() - 50 * ago, 'late_cancel', false, null),
      (s5, maya_c, p_ella, null, e1, now() - 10 * ago, 'held', false, '   '),
      (s6, maya_c, p_ella, null, e1, now() + 7 * ago, null, false, null),
      (s7, maya_c, p_noor, null, e2, now() - 90 * ago, null, false, null),
      (s8, maya_c, null, grp, eg, now() - 70 * ago, 'held', false, 'The team agreed.'),
      (s9, maya_c, null, grp, eg, now() - 5 * ago, null, false, null),
      (st, tess_c, p_leo, null, et, now() - 75 * ago, 'held', false, 'Leo''s.');
    insert into public.coach_session_people (session_id, profile_id, engagement_id) values (s8, p_ella, e1), (s8, p_noor, null), (s9, p_ella, e1);
    -- s1's recap was sent (as the email server does it).
    perform set_config('clarity.sending', 'on', true);
    update public.coach_sessions set recap_sent_at = now() - 99 * ago where id = s1;
    perform set_config('clarity.sending', '', true);

    f := f || pg_temp.c_all('1 to begin with', maya_u, maya_c, p_ella);
    v := (select sessions_held::text from public.engagements where id = e1);
    f := f || case when v = '9' then '{}'::text[] else array['1b Ella''s count to begin with: expected 9 (3 before, s1 to s5, and s8''s member), got ' || v] end;
    f := f || pg_temp.c_all('1c Tess sees only her own', tess_u, tess_c, p_leo);

    -- Added: a held session, long ago.
    insert into public.coach_sessions (id, coach_id, profile_id, engagement_id, starts_at, outcome) values (s10, maya_c, p_ella, e1, now() - 120 * ago, 'held');
    f := f || pg_temp.c_all('2 a held session added', maya_u, maya_c, p_ella);
    -- Waived, then not.
    update public.coach_sessions set waived = true where id = s4;
    f := f || pg_temp.c_all('3 a late cancellation waived', maya_u, maya_c, p_ella);
    update public.coach_sessions set waived = false where id = s4;
    f := f || pg_temp.c_all('4 and un-waived', maya_u, maya_c, p_ella);
    -- Written up as held, moved, then held again.
    update public.coach_sessions set outcome = 'held', written_up_at = now() where id = s7;
    f := f || pg_temp.c_all('5 a session written up as held', maya_u, maya_c, p_noor);
    update public.coach_sessions set outcome = 'moved', moved_to = now() + 3 * ago where id = s7;
    f := f || pg_temp.c_all('6 then moved', maya_u, maya_c, p_noor);
    update public.coach_sessions set outcome = 'held', moved_to = null where id = s7;
    f := f || pg_temp.c_all('7 then held again', maya_u, maya_c, p_noor);
    -- Held turned into a late cancellation, and a session not held any more.
    update public.coach_sessions set outcome = 'late_cancel' where id = s5;
    f := f || pg_temp.c_all('8 held turned into a late cancellation', maya_u, maya_c, p_ella);
    update public.coach_sessions set outcome = null where id = s3;
    f := f || pg_temp.c_all('9 a no-show back to not written up', maya_u, maya_c, p_ella);
    -- Moved in time across the window, and back.
    update public.coach_sessions set starts_at = now() + 3 * ago where id = s2;
    f := f || pg_temp.c_all('10 a held session moved into the window', maya_u, maya_c, p_ella);
    update public.coach_sessions set starts_at = now() - 45 * ago where id = s2;
    f := f || pg_temp.c_all('11 and back out of it', maya_u, maya_c, p_ella);
    -- Another engagement; another client and engagement.
    update public.coach_sessions set engagement_id = e1b, outcome = 'no_show' where id = s3;
    f := f || pg_temp.c_all('12 moved to another engagement', maya_u, maya_c, p_ella);
    update public.coach_sessions set profile_id = p_noor, engagement_id = e2 where id = s10;
    f := f || pg_temp.c_all('13 moved to another client and engagement', maya_u, maya_c, p_noor);
    -- A group session's people.
    update public.coach_session_people set engagement_id = e2 where session_id = s8 and profile_id = p_noor;
    f := f || pg_temp.c_all('14 a group member given their own engagement', maya_u, maya_c, p_noor);
    update public.coach_session_people set engagement_id = e1b where session_id = s8 and profile_id = p_ella;
    f := f || pg_temp.c_all('15 a member moved to another engagement', maya_u, maya_c, p_ella);
    delete from public.coach_session_people where session_id = s8 and profile_id = p_ella;
    f := f || pg_temp.c_all('16 a member taken off', maya_u, maya_c, p_ella);
    insert into public.coach_session_people (session_id, profile_id, engagement_id) values (s8, p_ella, e1);
    f := f || pg_temp.c_all('17 and put back', maya_u, maya_c, p_ella);
    update public.coach_sessions set outcome = 'late_cancel' where id = s8;
    f := f || pg_temp.c_all('18 the group session cancelled late', maya_u, maya_c, p_noor);
    update public.coach_sessions set waived = true where id = s8;
    f := f || pg_temp.c_all('19 and waived', maya_u, maya_c, p_ella);
    -- Done as the coach herself, with the code, through the rules.
    perform pg_temp.c_as(maya_u, 'aal2');
    update public.coach_sessions set outcome = 'held', written_up_at = now() where id = s9;
    insert into public.coach_sessions (coach_id, profile_id, engagement_id, starts_at, outcome) values (maya_c, p_ella, e1, now() - 200 * ago, 'no_show');
    perform pg_temp.c_admin();
    f := f || pg_temp.c_all('20 Maya writes one up and adds an old no-show herself', maya_u, maya_c, p_ella);
    -- Deleted.
    delete from public.coach_sessions where id in (s6, s10);
    f := f || pg_temp.c_all('21 two sessions deleted', maya_u, maya_c, p_ella);
    -- A typed count: the base moves, the sessions still count on top.
    update public.engagements set sessions_held = 20 where id = e1;
    v := (select sessions_held::text from public.engagements where id = e1);
    f := f || case when v = '20' then '{}'::text[] else array['22a a typed 20 stays 20, got ' || v] end;
    f := f || pg_temp.c_all('22 a count typed', maya_u, maya_c, p_ella);
    insert into public.coach_sessions (coach_id, profile_id, engagement_id, starts_at, outcome) values (maya_c, p_ella, e1, now() - 150 * ago, 'held');
    v := (select sessions_held::text from public.engagements where id = e1);
    f := f || case when v = '21' then '{}'::text[] else array['23a one more held after the typed 20 is 21, got ' || v] end;
    f := f || pg_temp.c_all('23 one more held after it', maya_u, maya_c, p_ella);
    -- An engagement deleted: its sessions keep going, counted for nothing.
    delete from public.engagements where id = e2;
    f := f || pg_temp.c_all('24 an engagement deleted', maya_u, maya_c, p_noor);
    -- Another coach's changes touch none of Maya's.
    update public.coach_sessions set outcome = 'no_show' where id = st;
    insert into public.coach_sessions (coach_id, profile_id, engagement_id, starts_at, outcome) values (tess_c, p_leo, et, now() - 400 * ago, 'held');
    f := f || pg_temp.c_all('25 Tess''s own changes, seen by Maya', maya_u, maya_c, p_ella);
    f := f || pg_temp.c_all('26 and by Tess', tess_u, tess_c, p_leo);

    perform pg_temp.c_admin();
    raise exception 'undo the test rows' using errcode = 'P0057';
  exception when sqlstate 'P0057' then
    perform pg_temp.c_admin();
  end;

  f := f || (select case when count(*) = 0 then '{}'::text[] else array['27 everything the test made is undone'] end
             from auth.users where email like 'p057-%@example.invalid');

  if cardinality(f) > 0 then
    raise exception E'057 FAILED (%):\n%', cardinality(f), array_to_string(f, E'\n');
  end if;
  raise notice '057 CHECKS PASSED';
end
$t$;
