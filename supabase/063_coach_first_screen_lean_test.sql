-- =============================================================================
-- 063_coach_first_screen_lean_test.sql
-- Checks supabase/migrations/063_coach_first_screen_lean.sql. RUN ORDER: 049
-- to 060, then 063 (twice is fine), then this. Dry run only, on a local
-- stand-in or the test project.
--
-- WHAT IT CHECKS
--   A small practice of two coaches (Tess, the owner, and Maya, an
--   associate), with clients, engagements and sessions of every kind that
--   matters here: held with its recap sent, held with a recap not sent yet,
--   to write up, coming up, one older than the window, and a group session
--   whose people are the group's clients (each with their own engagement).
--   Then, as each coach with the 6-digit code, for every page (today,
--   clients, a client's page, the calendar):
--     everything coach_first_screen_lean gives back but its sessions is
--     EXACTLY coach_first_screen's answer (the page, the tables, the counts
--     held and the recaps not sent, the window's start, the associates'
--     sessions);
--     its sessions, with the coach_id put back and the sent recaps put back,
--     are EXACTLY 060's, in the same order; none carries a coach_id, and a
--     recap is left out exactly when it has been sent;
--     its sessions' people, with the profile and engagement put back from
--     their session where left out, are EXACTLY 060's without created_at;
--     a group session's person who isn't the session's own client keeps
--     their profile and engagement;
--     start.coach_id is the coach's own id and start.lean is true.
--   And who may ask: a coach without the code (aal1), a client and someone
--   signed out are refused, as coach_first_screen refuses them; nobody
--   signed out may run it at all.
--
--   It ends with the notice 063 CHECKS PASSED, or stops with FAILED and a
--   list naming each check that failed. Everything it makes is undone.
-- =============================================================================
create or replace function pg_temp.f_as(p uuid, p_aal text) returns void language plpgsql as $f$
declare sid uuid := gen_random_uuid();
begin
  -- A made-up sign-in is written to auth.sessions where that table exists, as a real one is (055 refuses a session id
  -- that isn't there once a coach has a reset on record; the hosted test project has the table).
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
  if to_regclass('auth.sessions') is not null and p is not null then
    begin
      execute 'insert into auth.sessions (id, user_id, created_at, updated_at) values ($1, $2, $3, $3)' using sid, p, now();
    exception when others then
      raise notice '063: this database doesn''t let the test write auth.sessions (%)', sqlerrm;
    end;
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated', 'aal', p_aal,
    'amr', json_build_array(json_build_object('method', 'password', 'timestamp', floor(extract(epoch from now()))::bigint)),
    'iat', floor(extract(epoch from now()))::bigint, 'session_id', sid)::text, true);
  perform set_config('role', 'authenticated', true);
end $f$;
create or replace function pg_temp.f_admin() returns void language plpgsql as $f$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
end $f$;
create or replace function pg_temp.f_user(p_label text) returns uuid language plpgsql as $f$
declare u uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, aud, role, email_confirmed_at)
  values (u, 'p063-' || p_label || '-' || u || '@example.invalid', 'authenticated', 'authenticated', now());
  return u;
end $f$;

-- One page's lean answer against 060's, as p_user with the code. Returns the checks that failed.
create or replace function pg_temp.f_page(p_label text, p_user uuid, p_coach uuid, p_page text, p_from timestamptz, p_to timestamptz,
                                          p_today date, p_since timestamptz, p_profiles uuid[] default '{}')
returns text[] language plpgsql as $f$
declare
  whole jsonb;
  lean jsonb;
  f text[] := '{}';
  restored jsonb;
  people jsonb;
  want_people jsonb;
begin
  perform pg_temp.f_as(p_user, 'aal2');
  whole := public.coach_first_screen(p_page, p_from, p_to, p_today, p_since, p_profiles);
  lean := public.coach_first_screen_lean(p_page, p_from, p_to, p_today, p_since, p_profiles);
  perform pg_temp.f_admin();

  -- Everything but the sessions and their people is the same answer.
  if (lean - 'start') is distinct from (whole - 'start') then f := f || (p_label || ': the page, tables or associates differ from 060''s'); end if;
  if (lean->'start') - 'sessions' - 'people' - 'coach_id' - 'lean' is distinct from (whole->'start') - 'sessions' - 'people' then
    f := f || (p_label || ': the counts held, the recaps not sent or the window''s start differ from 060''s');
  end if;
  if (lean->'start'->>'coach_id') is distinct from p_coach::text then f := f || (p_label || ': start.coach_id isn''t the coach''s own'); end if;
  if (lean->'start'->'lean') is distinct from 'true'::jsonb then f := f || (p_label || ': start.lean isn''t true'); end if;

  -- The sessions: nothing of what is left out is there, and putting it back gives 060's exactly, in the same order.
  if exists (select 1 from jsonb_array_elements(lean->'start'->'sessions') x where x ? 'coach_id') then
    f := f || (p_label || ': a session still carries its coach_id');
  end if;
  if exists (select 1 from jsonb_array_elements(lean->'start'->'sessions') x where (x ? 'recap') = (x->>'recap_sent_at' is not null)) then
    f := f || (p_label || ': a recap is there once sent, or missing before');
  end if;
  select coalesce(jsonb_agg(l.x || jsonb_build_object('coach_id', lean->'start'->'coach_id')
                            || case when l.x ? 'recap' then '{}'::jsonb else jsonb_build_object('recap', w.x->'recap') end order by l.n), '[]'::jsonb)
    into restored
    from jsonb_array_elements(lean->'start'->'sessions') with ordinality l(x, n)
    left join jsonb_array_elements(whole->'start'->'sessions') with ordinality w(x, n) on w.n = l.n;
  if restored is distinct from whole->'start'->'sessions' then f := f || (p_label || ': the sessions, put back, aren''t 060''s'); end if;

  -- Their people: put back from their session, they are 060's without created_at.
  select coalesce(jsonb_agg(p.x
           || case when p.x ? 'profile_id' then '{}'::jsonb else jsonb_build_object('profile_id', s.x->'profile_id') end
           || case when p.x ? 'engagement_id' then '{}'::jsonb else jsonb_build_object('engagement_id', s.x->'engagement_id') end order by p.n), '[]'::jsonb)
    into people
    from jsonb_array_elements(lean->'start'->'people') with ordinality p(x, n)
    left join jsonb_array_elements(whole->'start'->'sessions') s(x) on s.x->>'id' = p.x->>'session_id';
  select coalesce(jsonb_agg(w.x - 'created_at' order by w.n), '[]'::jsonb) into want_people
    from jsonb_array_elements(whole->'start'->'people') with ordinality w(x, n);
  if people is distinct from want_people then f := f || (p_label || ': the sessions'' people, put back, aren''t 060''s'); end if;
  if exists (select 1 from jsonb_array_elements(lean->'start'->'people') x where x ? 'created_at') then
    f := f || (p_label || ': a session''s person still carries created_at');
  end if;
  return f;
end $f$;

-- Whether p_user at p_aal (null: signed out) is refused the lean first screen.
create or replace function pg_temp.f_refused(p_user uuid, p_aal text, p_signed_out boolean default false) returns boolean language plpgsql as $f$
begin
  if p_signed_out then
    perform set_config('role', 'anon', true);
    perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  else
    perform pg_temp.f_as(p_user, p_aal);
  end if;
  begin
    perform public.coach_first_screen_lean('today', now() - interval '1 day', now() + interval '8 days', (now() at time zone 'UTC')::date, now() - interval '42 days', '{}');
  exception when sqlstate '42501' then
    perform pg_temp.f_admin();
    return true;
  end;
  perform pg_temp.f_admin();
  return false;
end $f$;

do $t$
declare
  f text[] := '{}';
  r jsonb;
  day0 date := (now() at time zone 'UTC')::date;
  noon timestamptz := date_trunc('day', now()) + interval '12 hours';
  w_from timestamptz := now() - interval '1 day';
  w_to timestamptz := now() + interval '8 days';
  since timestamptz := now() - interval '42 days';
  tess_u uuid; maya_u uuid; tess_c uuid; maya_c uuid; client_u uuid;
  p_a uuid := gen_random_uuid(); p_b uuid := gen_random_uuid(); p_c uuid := gen_random_uuid();
  e_a uuid := gen_random_uuid(); e_b uuid := gen_random_uuid(); e_c uuid := gen_random_uuid();
  grp uuid := gen_random_uuid();
  s_sent uuid := gen_random_uuid(); s_unsent uuid := gen_random_uuid(); s_write uuid := gen_random_uuid(); s_next uuid := gen_random_uuid();
  s_old uuid := gen_random_uuid(); s_group uuid := gen_random_uuid(); s_tess uuid := gen_random_uuid();
  x jsonb;
begin
  begin
    perform pg_temp.f_admin();
    tess_u := pg_temp.f_user('tess'); maya_u := pg_temp.f_user('maya'); client_u := pg_temp.f_user('client');
    insert into public.coaches (user_id, role, display_first_name) values (tess_u, 'owner', 'Tess') returning id into tess_c;
    insert into public.coaches (user_id, role, display_first_name) values (maya_u, 'coach', 'Maya') returning id into maya_c;
    insert into public.coach_settings (coach_id) values (maya_c), (tess_c) on conflict do nothing;
    insert into public.client_profiles (id, coach_id, name, email) values
      (p_a, maya_c, 'Ava F063', 'ava.f063@example.invalid'), (p_b, maya_c, 'Ben F063', 'ben.f063@example.invalid'),
      (p_c, tess_c, 'Cal F063', 'cal.f063@example.invalid');
    insert into public.engagements (id, coach_id, profile_id, kind, sessions_total, sessions_held_base, status) values
      (e_a, maya_c, p_a, 'sessions', 10, 0, 'active'), (e_b, maya_c, p_b, 'sessions', 6, 0, 'active'), (e_c, tess_c, p_c, 'sessions', 8, 0, 'active');
    insert into public.coach_groups (id, coach_id, name) values (grp, maya_c, 'F063 team');
    insert into public.coach_group_members (group_id, name, profile_id) values (grp, 'Ava F063', p_a), (grp, 'Ben F063', p_b);
    insert into public.coach_sessions (id, coach_id, profile_id, engagement_id, starts_at, minutes, kind, outcome, recap, recap_sent_at, written_up_at) values
      (s_sent, maya_c, p_a, e_a, noon - interval '10 days', 60, 'coaching', 'held', 'F063 a recap that went', now() - interval '9 days', now() - interval '10 days'),
      (s_unsent, maya_c, p_a, e_a, noon - interval '3 days', 60, 'coaching', 'held', 'F063 a recap still to send', null, now() - interval '3 days'),
      (s_write, maya_c, p_b, e_b, noon - interval '2 days', 60, 'coaching', null, null, null, null),
      (s_next, maya_c, p_b, e_b, noon + interval '2 days', 60, 'coaching', null, null, null, null),
      (s_old, maya_c, p_a, e_a, noon - interval '120 days', 60, 'coaching', 'held', 'F063 an old recap that went', now() - interval '119 days', now() - interval '120 days'),
      (s_tess, tess_c, p_c, e_c, noon - interval '5 days', 60, 'coaching', 'held', 'F063 Tess recap', now() - interval '4 days', now() - interval '5 days');
    insert into public.coach_sessions (id, coach_id, group_id, starts_at, minutes, kind, outcome, recap, recap_sent_at) values
      (s_group, maya_c, grp, noon - interval '4 days', 90, 'coaching', 'held', 'F063 group recap that went', now() - interval '4 days');
    -- Sent recaps are marked the way 050's session_send_recap marks them (its guard keeps a plain save from doing it).
    perform set_config('clarity.sending', 'on', true);
    update public.coach_sessions set recap_sent_at = now() - interval '1 day' where id in (s_sent, s_old, s_tess, s_group);
    perform set_config('clarity.sending', '', true);
    -- The group's people (each with their own engagement), and a session's own client as its person, as the portal writes them.
    insert into public.coach_session_people (session_id, profile_id, engagement_id) values
      (s_group, p_a, e_a), (s_group, p_b, e_b), (s_unsent, p_a, e_a), (s_next, p_b, e_b);

    -- Every page, as each coach with the code: the lean answer against 060's.
    f := f || pg_temp.f_page('1 Maya today', maya_u, maya_c, 'today', w_from, w_to, day0, since);
    f := f || pg_temp.f_page('2 Maya clients', maya_u, maya_c, 'clients', w_from, w_to, day0, since);
    f := f || pg_temp.f_page('3 Maya, Ava''s page', maya_u, maya_c, 'client', w_from, w_to, day0, since, array[p_a]);
    f := f || pg_temp.f_page('4 Maya calendar', maya_u, maya_c, 'calendar', now() - interval '3 days', now() + interval '25 days', day0, since);
    f := f || pg_temp.f_page('5 Tess today', tess_u, tess_c, 'today', w_from, w_to, day0, since);
    f := f || pg_temp.f_page('6 Tess clients', tess_u, tess_c, 'clients', w_from, w_to, day0, since);
    f := f || pg_temp.f_page('7 Tess, Cal''s page', tess_u, tess_c, 'client', w_from, w_to, day0, since, array[p_c]);
    f := f || pg_temp.f_page('8 Tess calendar', tess_u, tess_c, 'calendar', w_from, w_to, day0, since);

    -- By hand, so a rule written the same wrong way twice is caught too.
    perform pg_temp.f_as(maya_u, 'aal2');
    r := public.coach_first_screen_lean('today', w_from, w_to, day0, since, '{}');
    perform pg_temp.f_admin();
    select s.x into x from jsonb_array_elements(r->'start'->'sessions') s(x) where s.x->>'id' = s_unsent::text;
    if x is null or x->>'recap' is distinct from 'F063 a recap still to send' then f := f || '9 a recap not sent yet is there, word for word'::text; end if;
    select s.x into x from jsonb_array_elements(r->'start'->'sessions') s(x) where s.x->>'id' = s_sent::text;
    if x is null or x ? 'recap' or x->>'recap_sent_at' is null then f := f || '10 a sent recap is left out, its sending time kept'::text; end if;
    if exists (select 1 from jsonb_array_elements(r->'start'->'people') p(x) where p.x->>'session_id' = s_unsent::text and (p.x ? 'profile_id' or p.x ? 'engagement_id')) then
      f := f || '11 a session''s own client as its person carries no profile or engagement'::text;
    end if;
    if (select count(*) from jsonb_array_elements(r->'start'->'people') p(x) where p.x->>'session_id' = s_group::text and p.x ? 'profile_id' and p.x ? 'engagement_id') <> 2 then
      f := f || '12 a group session''s people keep their own profile and engagement'::text;
    end if;
    if r::text ~ 'F063 Tess' or r::text ~ 'Cal F063' or r::text ~ 'F063 a recap that went' or r::text ~ 'F063 group recap that went' then
      f := f || '13 something of Tess''s, or a sent recap, in Maya''s lean first screen'::text;
    end if;

    -- Who may ask.
    if not pg_temp.f_refused(maya_u, 'aal1') then f := f || '14 a coach without the 6-digit code is refused'::text; end if;
    if not pg_temp.f_refused(client_u, 'aal1') then f := f || '15 a client is refused'::text; end if;
    if not pg_temp.f_refused(null, null, true) then f := f || '16 someone signed out is refused'::text; end if;
    if has_function_privilege('anon', 'public.coach_first_screen_lean(text,timestamptz,timestamptz,date,timestamptz,uuid[])', 'execute') then
      f := f || '17 nobody signed out may run it'::text;
    end if;
    if not has_function_privilege('authenticated', 'public.coach_first_screen_lean(text,timestamptz,timestamptz,date,timestamptz,uuid[])', 'execute') then
      f := f || '18 a signed-in coach may run it'::text;
    end if;

    perform pg_temp.f_admin();
    raise exception 'undo the test rows' using errcode = 'P0063';
  exception when sqlstate 'P0063' then
    perform pg_temp.f_admin();
  end;

  f := f || (select case when count(*) = 0 then '{}'::text[] else array['19 everything the test made is undone'] end
             from auth.users where email like 'p063-%@example.invalid');
  if cardinality(f) > 0 then
    raise exception E'063 FAILED (%):\n%', cardinality(f), array_to_string(f, E'\n');
  end if;
  raise notice '063 CHECKS PASSED';
end
$t$;
