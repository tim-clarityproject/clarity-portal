-- =============================================================================
-- Group-call reminders (059's part from helper 1, run 8, item 1): checks
-- coach_cal_group_reminder_sends, cal_group_reminders_coming and
-- cal_group_reminder_claim. RUN after 049 to 058 and 059 (twice is fine).
--
--   - only the email server may list or claim; anyone signed in or out can't;
--   - a group call lists one row a guest and kind: each member's own zone
--     (their client profile's, else the call's), two members with one
--     address are one guest, a member with no address is left out;
--   - the Settings switches: the day before on unless switched off, 1 hour
--     before off unless switched on; nothing while the coach is away;
--   - a claim answers the guest's address once, then null (two runs that
--     overlap send once), and the claimed one is no longer listed; the
--     table holds no address, only its key;
--   - a member who left the group, a call cancelled or moved (its session
--     written up so), a call whose time changed, or a deleted call: nothing
--     listed and every claim refused;
--   - the single-call reminders (051) never list a group call;
--   - the coach reads their own sends only with the 6-digit code.
-- Ends with the notice GROUP REMINDERS CHECKS PASSED. Everything is undone.
-- =============================================================================
create or replace function pg_temp.g_as(p uuid, p_aal text) returns void language plpgsql as $f$
declare sid uuid := gen_random_uuid();
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
  if to_regclass('auth.sessions') is not null and p is not null then
    begin
      execute 'insert into auth.sessions (id, user_id, created_at, updated_at) values ($1, $2, $3, $3)' using sid, p, now();
    exception when others then null;
    end;
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated', 'aal', p_aal,
    'amr', json_build_array(json_build_object('method', 'password', 'timestamp', floor(extract(epoch from now()))::bigint)),
    'iat', floor(extract(epoch from now()))::bigint, 'session_id', sid)::text, true);
  perform set_config('role', 'authenticated', true);
end $f$;
create or replace function pg_temp.g_admin() returns void language plpgsql as $f$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
end $f$;
create or replace function pg_temp.g_eq(p_name text, p_got text, p_want text) returns text[] language sql immutable as $f$
  select case when p_got is not distinct from p_want then '{}'::text[] else array[p_name || ': got ' || coalesce(p_got, 'null') || ', wanted ' || coalesce(p_want, 'null')] end;
$f$;
create temp table if not exists g_seen (n integer);
grant select, insert, delete on g_seen to authenticated;

do $t$
declare
  f text[] := '{}';
  v text;
  maya_u uuid := gen_random_uuid(); maya_c uuid;
  p_ann uuid := gen_random_uuid(); p_cat uuid := gen_random_uuid(); p_one uuid := gen_random_uuid();
  grp uuid := gen_random_uuid();
  m_ann uuid := gen_random_uuid(); m_ben uuid := gen_random_uuid(); m_cat uuid := gen_random_uuid(); m_none uuid := gen_random_uuid();
  s_g uuid := gen_random_uuid(); s_one uuid := gen_random_uuid();
  it_g uuid := gen_random_uuid(); it_one uuid := gen_random_uuid();
  base timestamptz := date_trunc('hour', now()) + interval '3 days';
  t0 timestamptz;
begin
  t0 := base - interval '20 hours';
  f := f || pg_temp.g_eq('1a only the email server may list or claim',
    concat(has_function_privilege('anon', 'public.cal_group_reminders_coming(timestamptz)', 'execute'),
           has_function_privilege('authenticated', 'public.cal_group_reminders_coming(timestamptz)', 'execute'),
           has_function_privilege('anon', 'public.cal_group_reminder_claim(uuid, uuid, text, timestamptz)', 'execute'),
           has_function_privilege('authenticated', 'public.cal_group_reminder_claim(uuid, uuid, text, timestamptz)', 'execute'),
           has_function_privilege('service_role', 'public.cal_group_reminders_coming(timestamptz)', 'execute'),
           has_function_privilege('service_role', 'public.cal_group_reminder_claim(uuid, uuid, text, timestamptz)', 'execute'),
           has_table_privilege('authenticated', 'public.coach_cal_group_reminder_sends', 'insert'),
           has_table_privilege('anon', 'public.coach_cal_group_reminder_sends', 'select')),
    'ffffttff');
  f := f || pg_temp.g_eq('1b the table asks for the 6-digit code',
    (select count(*)::text from pg_policies where schemaname = 'public' and tablename = 'coach_cal_group_reminder_sends'
       and policyname = 'Coach data: needs the 6-digit code' and permissive = 'RESTRICTIVE'), '1');

  begin
    insert into auth.users (id, email, aud, role, email_confirmed_at) values (maya_u, 'g059-maya-' || maya_u || '@example.invalid', 'authenticated', 'authenticated', now());
    insert into public.coaches (user_id, role, display_first_name) values (maya_u, 'coach', 'Maya') returning id into maya_c;
    insert into public.coach_settings (coach_id, time_zone) values (maya_c, 'Europe/London');
    insert into public.client_profiles (id, coach_id, name, email, time_zone) values
      (p_ann, maya_c, 'Ann Ito', 'ann.g059@example.invalid', 'America/New_York'),
      (p_cat, maya_c, 'Cat Ross', 'ben.g059@example.invalid', 'Asia/Tokyo'),
      (p_one, maya_c, 'Ola Single', 'ola.g059@example.invalid', 'Europe/London');
    insert into public.coach_groups (id, coach_id, name) values (grp, maya_c, 'Kestrel team');
    insert into public.coach_group_members (id, group_id, profile_id, name, email) values
      (m_ann, grp, p_ann, 'Ann Ito', 'old.ann.g059@example.invalid'),
      (m_ben, grp, null, 'Ben Hale', 'ben.g059@example.invalid'),
      (m_cat, grp, p_cat, 'Cat Ross', null),
      (m_none, grp, null, 'No Address', null);
    insert into public.coach_sessions (id, coach_id, profile_id, group_id, kind, starts_at, minutes) values
      (s_g, maya_c, null, grp, 'group', base, 60),
      (s_one, maya_c, p_one, null, 'coaching', base, 60);
    insert into public.coach_cal_items (id, coach_id, kind, title, starts_at, ends_at, time_zone, place_kind, meeting_link, group_id, session_id) values
      (it_g, maya_c, 'client_call', 'Kestrel team', base, base + interval '1 hour', 'Europe/London', 'zoom', 'https://zoom.example.invalid/j/1', grp, s_g);
    insert into public.coach_cal_items (id, coach_id, kind, title, starts_at, ends_at, time_zone, profile_id, session_id) values
      (it_one, maya_c, 'client_call', 'Ola Single', base + interval '2 hours', base + interval '3 hours', 'Europe/London', p_one, s_one);

    -- ---------------------------------------------------------------- who is listed
    select string_agg(r.kind || '|' || r.person_name || '|' || r.person_email || '|' || r.person_zone || '|' || r.group_name || '|' || r.has_account, ',' order by r.kind, r.person_name)
      into v from public.cal_group_reminders_coming(t0) r where r.coach_id = maya_c;
    f := f || pg_temp.g_eq('2a one row a guest: each in their own zone, the profile''s address first, one address once (the member with a profile), none without',
      v, 'day_before|Ann Ito|ann.g059@example.invalid|America/New_York|Kestrel team|false,day_before|Cat Ross|ben.g059@example.invalid|Asia/Tokyo|Kestrel team|false');
    f := f || pg_temp.g_eq('2b the single-call reminders never list the group call',
      (select string_agg(r.person_name, ',') from public.cal_reminders_coming(t0) r where r.coach_id = maya_c), 'Ola Single');

    -- ---------------------------------------------------------------- the switches, and away
    update public.coach_settings set booking = '{"remind_1": true}' where coach_id = maya_c;
    f := f || pg_temp.g_eq('3a 1 hour before is listed once switched on',
      (select count(*)::text from public.cal_group_reminders_coming(t0) r where r.coach_id = maya_c and r.kind = 'hour_before'), '2');
    update public.coach_settings set booking = '{"remind_24": false, "remind_1": true}' where coach_id = maya_c;
    f := f || pg_temp.g_eq('3b the day before goes once switched off',
      (select count(*)::text from public.cal_group_reminders_coming(t0) r where r.coach_id = maya_c and r.kind = 'day_before'), '0');
    f := f || pg_temp.g_eq('3c and its claim is refused', public.cal_group_reminder_claim(it_g, m_ann, 'day_before', base), null);
    update public.coach_settings set booking = '{}' where coach_id = maya_c;
    insert into public.coach_away (coach_id, starts_on, ends_on) values (maya_c, (t0 at time zone 'UTC')::date, (t0 at time zone 'UTC')::date + 1);
    f := f || pg_temp.g_eq('3d nothing while the coach is away',
      (select count(*)::text from public.cal_group_reminders_coming(t0) r where r.coach_id = maya_c), '0');
    delete from public.coach_away where coach_id = maya_c;

    -- ---------------------------------------------------------------- once
    f := f || pg_temp.g_eq('4a a claim answers the guest''s own address once, then nothing',
      concat_ws('/', public.cal_group_reminder_claim(it_g, m_ann, 'day_before', base), coalesce(public.cal_group_reminder_claim(it_g, m_ann, 'day_before', base), 'none')),
      'ann.g059@example.invalid/none');
    f := f || pg_temp.g_eq('4b Cat shares Ben''s address: Ben''s claim goes, Cat''s is the same guest',
      concat_ws('/', public.cal_group_reminder_claim(it_g, m_ben, 'day_before', base), coalesce(public.cal_group_reminder_claim(it_g, m_cat, 'day_before', base), 'none')),
      'ben.g059@example.invalid/none');
    f := f || pg_temp.g_eq('4c what was claimed is no longer listed',
      (select count(*)::text from public.cal_group_reminders_coming(t0) r where r.coach_id = maya_c), '0');
    f := f || pg_temp.g_eq('4d the table holds no address',
      (select count(*)::text from public.coach_cal_group_reminder_sends s where s.coach_id = maya_c and s.address_key ~ '^[0-9a-f]{64}$'
         and to_jsonb(s)::text not ilike '%example.invalid%'), '2');
    f := f || pg_temp.g_eq('4e no member of another group, and no kind unknown',
      concat(coalesce(public.cal_group_reminder_claim(it_g, gen_random_uuid(), 'hour_before', base), 'none'), '/',
             coalesce(public.cal_group_reminder_claim(it_g, m_ann, 'custom', base), 'none'), '/',
             coalesce(public.cal_group_reminder_claim(it_one, m_ann, 'hour_before', base + interval '2 hours'), 'none')),
      'none/none/none');

    -- ---------------------------------------------------------------- left, cancelled, moved
    update public.coach_settings set booking = '{"remind_1": true}' where coach_id = maya_c;
    delete from public.coach_group_members where id = m_ben;
    f := f || pg_temp.g_eq('5a a guest who left the group is no longer listed',
      (select string_agg(r.person_name, ',' order by r.person_name) from public.cal_group_reminders_coming(t0) r where r.coach_id = maya_c and r.kind = 'hour_before'),
      'Ann Ito,Cat Ross');
    f := f || pg_temp.g_eq('5b and their claim is refused', public.cal_group_reminder_claim(it_g, m_ben, 'hour_before', base), null);
    update public.coach_sessions set outcome = 'late_cancel', written_up_at = now() where id = s_g;
    f := f || pg_temp.g_eq('5c a call cancelled: nothing listed, every claim refused',
      concat((select count(*) from public.cal_group_reminders_coming(t0) r where r.coach_id = maya_c), '/', coalesce(public.cal_group_reminder_claim(it_g, m_ann, 'hour_before', base), 'none')), '0/none');
    update public.coach_sessions set outcome = 'moved', moved_to = base + interval '7 days' where id = s_g;
    f := f || pg_temp.g_eq('5d a call written up as moved: the same',
      concat((select count(*) from public.cal_group_reminders_coming(t0) r where r.coach_id = maya_c), '/', coalesce(public.cal_group_reminder_claim(it_g, m_ann, 'hour_before', base), 'none')), '0/none');
    update public.coach_sessions set outcome = null, moved_to = null, written_up_at = null where id = s_g;
    update public.coach_cal_items set starts_at = base + interval '1 day', ends_at = base + interval '1 day 1 hour' where id = it_g;
    f := f || pg_temp.g_eq('5e a call moved to another time: the old time''s claim is refused',
      coalesce(public.cal_group_reminder_claim(it_g, m_ann, 'hour_before', base), 'none'), 'none');
    f := f || pg_temp.g_eq('5f and the new time is listed, from its own moment',
      (select count(*)::text from public.cal_group_reminders_coming(base + interval '4 hours') r where r.coach_id = maya_c and r.occurrence_at = base + interval '1 day'), '4');
    delete from public.coach_cal_items where id = it_g;
    f := f || pg_temp.g_eq('5g a call deleted: nothing listed',
      (select count(*)::text from public.cal_group_reminders_coming(base + interval '4 hours') r where r.coach_id = maya_c), '0');

    -- ---------------------------------------------------------------- the coach reads their own, only with the code
    insert into public.coach_cal_items (id, coach_id, kind, title, starts_at, ends_at, time_zone, group_id) values
      (it_g, maya_c, 'client_call', 'Kestrel team', base, base + interval '1 hour', 'Europe/London', grp);
    perform public.cal_group_reminder_claim(it_g, m_ann, 'hour_before', base);
    perform pg_temp.g_as(maya_u, 'aal1');
    delete from g_seen;
    insert into g_seen select count(*) from public.coach_cal_group_reminder_sends;
    perform pg_temp.g_as(maya_u, 'aal2');
    insert into g_seen select count(*) from public.coach_cal_group_reminder_sends;
    perform pg_temp.g_admin();
    f := f || pg_temp.g_eq('6a the coach reads none before the code, their own after',
      (select string_agg(n::text, '/' order by n) from g_seen), '0/1');

    raise exception 'undo' using errcode = 'P0059';
  exception when sqlstate 'P0059' then
    perform pg_temp.g_admin();
  end;
  f := f || pg_temp.g_eq('7a everything the test made is undone',
    (select count(*)::text from auth.users where email like 'g059-%@example.invalid'), '0');

  if cardinality(f) > 0 then
    raise exception E'GROUP REMINDERS FAILED (%):\n%', cardinality(f), array_to_string(f, E'\n');
  end if;
  raise notice 'GROUP REMINDERS CHECKS PASSED';
end
$t$;
