-- =============================================================================
-- 057_coach_sessions_start.sql
-- Tidy pass follow-up 2 (23 Nov 2026): the held-sessions count on the server
-- (scale report point 5.1), so a coach's first visit on a new phone doesn't
-- wait for every session they have ever had.
--
-- WHAT THIS DOES (plain English)
--   The coach portal read every one of a coach's sessions, and the people in
--   each, before its first screen, because an engagement's "sessions held" is
--   counted from them on the device, and an engagement saved with a count
--   made from only some of them would move its base (050). For the owner that
--   was 4,425 sessions and 4,425 session people, about 3.6 MB, on every first
--   visit to a device.
--
--   One new function, coach_sessions_start(p_since, p_profiles), answers the
--   first visit in one go, all from one look at the database:
--     sessions  the coach's sessions from p_since on (the calendar's window),
--               every session of the clients named in p_profiles (a client's
--               page), and, from before p_since, only the ones the first
--               screens show: for each client and group the oldest still to
--               write up, the oldest recap not sent (and the oldest with
--               words in it), and the latest held;
--     people    the session people of exactly those sessions;
--     held      for each engagement, how many of the sessions NOT sent count
--               (050's rule: held, a no-show, or a late cancellation not
--               waived; a group session's own-engagement members too), so the
--               device's count is this plus what it holds, exactly as before;
--     nudges    how many recaps not sent are among the sessions NOT sent (the
--               "and 4 more are waiting" line).
--   The rest of the sessions follow after the page has drawn, as the older
--   to-dos already do. engagements.sessions_held is still kept by 050's
--   triggers, unchanged.
--
-- WHO SEES WHAT (unchanged)
--   It is SECURITY INVOKER: it reads coach_sessions and coach_session_people
--   under their own row rules, 054's restrictive "Coach data: needs the
--   6-digit code" rule included, so it can never show more than those reads
--   already do. It also stops at once, with 42501, for anyone who isn't an
--   active coach with the code given (my_coach_id() is empty then: a client,
--   a coach at aal1, a sign-in from before a reset, a coach no longer
--   active). Closed to anyone signed out (no execute for anon or PUBLIC).
--   No table, column, rule or data changes.
--
-- Additive and safe to run twice. Needs 049, 050 and 054 (stops without them).
-- Tests: supabase/057_coach_sessions_start_test.sql (the count always matches
-- the sessions) and supabase/057_coach_sessions_start_breakit_test.sql.
-- =============================================================================

do $$
begin
  if to_regclass('public.coach_session_people') is null
     or to_regprocedure('public.coach_code_ok()') is null
     or to_regprocedure('public.my_coach_id()') is null then
    raise exception '057 needs 049, 050 and 054 first.';
  end if;
end
$$;

create or replace function public.coach_sessions_start(p_since timestamptz, p_profiles uuid[] default '{}')
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_coach uuid := public.my_coach_id();
  v_since timestamptz := coalesce(p_since, '-infinity'::timestamptz);
  v_profiles uuid[] := coalesce(p_profiles, '{}');
  v_out jsonb;
begin
  -- An active coach with the code given, and nobody else (054's rule; my_coach_id() is empty without it).
  if v_coach is null then
    raise exception 'Give your 6-digit code to carry on.' using errcode = '42501';
  end if;

  with s as (
    -- The coach's own sessions, under the table's own rules.
    select * from public.coach_sessions where coach_id = v_coach
  ),
  older as (
    select s.*,
           rank() over (partition by profile_id, group_id, (outcome is null) order by starts_at) as by_oldest,
           rank() over (partition by profile_id, group_id, (outcome = 'held' and recap_sent_at is null) order by starts_at) as unsent_oldest,
           rank() over (partition by profile_id, group_id, (outcome = 'held' and recap_sent_at is null
                          and translate(coalesce(recap, ''), U&'\00A0\00AD\180E\200B\200C\200D\200E\200F\2028\2029\202A\202B\202C\202D\202E\2060\2061\2062\2063\2064\FEFF', '')
                              ~ '[^[:space:][:cntrl:]]') order by starts_at) as worded_oldest,
           rank() over (partition by profile_id, group_id, (outcome = 'held') order by starts_at desc) as held_latest
    from s where s.starts_at < v_since
  ),
  picked as (
    select id from s where s.starts_at >= v_since
    union select id from older where profile_id = any(v_profiles)
    union select o.id from older o join public.coach_session_people sp on sp.session_id = o.id where sp.profile_id = any(v_profiles)
    -- What the first screens show from before the window (ties all kept, so the device picks exactly as it did).
    union select id from older where outcome is null and by_oldest = 1
    union select id from older where outcome = 'held' and recap_sent_at is null and unsent_oldest = 1
    union select id from older where outcome = 'held' and recap_sent_at is null and worded_oldest = 1
      and translate(coalesce(recap, ''), U&'\00A0\00AD\180E\200B\200C\200D\200E\200F\2028\2029\202A\202B\202C\202D\202E\2060\2061\2062\2063\2064\FEFF', '')
          ~ '[^[:space:][:cntrl:]]'
    union select id from older where outcome = 'held' and held_latest = 1
  ),
  rest as (
    select * from older o where not exists (select 1 from picked p where p.id = o.id)
  ),
  counted as (
    select x.engagement_id, count(*)::integer as n from (
      select r.engagement_id from rest r
      where r.engagement_id is not null
        and (r.outcome in ('held', 'no_show') or (r.outcome = 'late_cancel' and not r.waived))
      union all
      select sp.engagement_id from public.coach_session_people sp join rest r on r.id = sp.session_id
      where sp.engagement_id is not null
        and (r.outcome in ('held', 'no_show') or (r.outcome = 'late_cancel' and not r.waived))
    ) x group by x.engagement_id
  )
  select jsonb_build_object(
    'since', v_since,
    'sessions', coalesce((select jsonb_agg(to_jsonb(t) order by t.starts_at, t.id) from public.coach_sessions t
                          where t.coach_id = v_coach and t.id in (select id from picked)), '[]'::jsonb),
    'people', coalesce((select jsonb_agg(to_jsonb(sp) order by sp.session_id, sp.profile_id) from public.coach_session_people sp
                        where sp.session_id in (select id from picked)), '[]'::jsonb),
    'held', coalesce((select jsonb_object_agg(c.engagement_id::text, c.n) from counted c), '{}'::jsonb),
    'nudges', (select count(*)::integer from rest r where r.outcome = 'held' and r.recap_sent_at is null)
  ) into v_out;
  return v_out;
end;
$$;
comment on function public.coach_sessions_start(timestamptz, uuid[]) is
  'A coach''s first load of sessions (057): those from p_since on, every one of the clients in p_profiles, the few older ones the first screens show, their session people, and for the rest each engagement''s count of sessions that count and the recaps not sent. Read under the tables'' own rules; nothing without the 6-digit code.';
revoke all on function public.coach_sessions_start(timestamptz, uuid[]) from public, anon;
grant execute on function public.coach_sessions_start(timestamptz, uuid[]) to authenticated;

select public.record_migration(57, '057_coach_sessions_start');
