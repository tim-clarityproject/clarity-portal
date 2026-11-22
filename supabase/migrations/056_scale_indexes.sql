-- =============================================================================
-- 056_scale_indexes.sql
-- Scale and speed check, step 3 (22 Nov 2026): the database misses found at
-- 1,000 clients and 15 coaches (tests/scale/BASELINE.md, miss 5).
--
-- WHAT THIS DOES (plain English)
--   Some of the coach portal's row rules asked "is this the coach's own
--   session?" (or client) once for EVERY row of EVERY coach, because the
--   rule called a function with the row's own session or client in it. With
--   14,750 sessions, reading a coach's session people took about 0.3 s and
--   grew with the whole table. The rules now ask once: "which sessions (or
--   clients) are this coach's?", and the database then picks the rows by
--   their key. Who can read what is exactly as before.
--
--   1. Three helpers, each answering the list once for the person signed in,
--      each asking for the 6-digit code (054's rule):
--        coach_my_session_ids()      the coach's own sessions
--        coach_my_profile_ids()      the coach's own clients (client_profiles)
--        coach_covered_profile_ids() the clients they cover now, agreed
--      They are security definer and give nothing to anyone without the
--      code, to a client, or to someone signed out (no execute for anon).
--   2. The read side (USING) of five rules uses them. The write side (WITH
--      CHECK) is unchanged, so adding or changing a row is checked as before:
--        coach_session_people  'Coach: own session'
--        coach_session_actions 'Coach: own session'
--        coach_session_notes   'Coach alone'
--        client_notes          'Coach alone'
--        client_about          'Coach alone'
--        client_profiles       'Profiles: read' (covers_profile(id) per row
--                              becomes the covered list, asked once)
--   3. Indexes a coach's own rows were read without (a whole-table scan):
--        coach_todos (coach_id), time_entries (coach_id, started_at desc),
--        client_profiles (coach_id) (049's index covers unmerged rows only).
--
-- WHAT IT DOESN'T CHANGE
--   No table, column or data. coach_owns_session, coach_owns_profile and
--   covers_profile keep their bodies and are still used by the write checks
--   and elsewhere. 054's restrictive "Coach data: needs the 6-digit code"
--   rule is untouched and still applies to every table here.
--
-- Additive and safe to run twice. Needs 049, 050 and 054 (stops without them).
-- Test: supabase/056_scale_indexes_test.sql.
-- =============================================================================

do $$
begin
  if to_regclass('public.coach_session_people') is null
     or to_regclass('public.client_notes') is null
     or to_regprocedure('public.coach_code_ok()') is null then
    raise exception '056 needs 049, 050 and 054 first.';
  end if;
end
$$;

-- ---------------------------------------------------------------- 1. the helpers
create or replace function public.coach_my_session_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.id from public.coach_sessions s
  where public.coach_code_ok() and s.coach_id = (select public.my_coach_id());
$$;
comment on function public.coach_my_session_ids() is
  'The signed-in coach''s own sessions, once, for the row rules (056). Nothing without the 6-digit code; the same answer as coach_owns_session() row by row.';
revoke all on function public.coach_my_session_ids() from public, anon;
grant execute on function public.coach_my_session_ids() to authenticated;

create or replace function public.coach_my_profile_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id from public.client_profiles p
  where public.coach_code_ok() and p.coach_id = (select public.my_coach_id());
$$;
comment on function public.coach_my_profile_ids() is
  'The signed-in coach''s own clients, once, for the row rules (056). Nothing without the 6-digit code; the same answer as coach_owns_profile() row by row.';
revoke all on function public.coach_my_profile_ids() from public, anon;
grant execute on function public.coach_my_profile_ids() to authenticated;

create or replace function public.coach_covered_profile_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select cv.profile_id from public.coach_cover cv
  join public.coaches c on c.id = cv.cover_coach_id
  where public.coach_code_ok()
    and c.user_id = (select auth.uid()) and c.active
    and cv.client_agreed_at is not null
    and (now() at time zone 'Europe/London')::date between cv.starts_on and cv.ends_on;
$$;
comment on function public.coach_covered_profile_ids() is
  'The clients the signed-in coach covers today with the client''s agreement, once, for the row rules (056). Nothing without the 6-digit code; the same answer as covers_profile() row by row.';
revoke all on function public.coach_covered_profile_ids() from public, anon;
grant execute on function public.coach_covered_profile_ids() to authenticated;

-- ---------------------------------------------------------------- 2. the rules' read side
drop policy if exists "Coach: own session" on public.coach_session_people;
create policy "Coach: own session" on public.coach_session_people for all to authenticated
  using (session_id in (select public.coach_my_session_ids()))
  with check ((select public.coach_owns_session(session_id)) and (select public.coach_owns_profile(profile_id))
              and (engagement_id is null or (select public.coach_owns_engagement(engagement_id))));

drop policy if exists "Coach: own session" on public.coach_session_actions;
create policy "Coach: own session" on public.coach_session_actions for all to authenticated
  using (coach_id = (select public.my_coach_id()) and session_id in (select public.coach_my_session_ids()))
  with check (coach_id = (select public.my_coach_id()) and (select public.coach_owns_session(session_id)));

drop policy if exists "Coach alone" on public.coach_session_notes;
create policy "Coach alone" on public.coach_session_notes for all to authenticated
  using (coach_id = (select public.my_coach_id()) and session_id in (select public.coach_my_session_ids()))
  with check (coach_id = (select public.my_coach_id()) and (select public.coach_owns_session(session_id)));

drop policy if exists "Coach alone" on public.client_notes;
create policy "Coach alone" on public.client_notes for all to authenticated
  using (coach_id = (select public.my_coach_id()) and profile_id in (select public.coach_my_profile_ids()))
  with check (coach_id = (select public.my_coach_id()) and (select public.coach_owns_profile(profile_id)));

drop policy if exists "Coach alone" on public.client_about;
create policy "Coach alone" on public.client_about for all to authenticated
  using (coach_id = (select public.my_coach_id()) and profile_id in (select public.coach_my_profile_ids()))
  with check (coach_id = (select public.my_coach_id()) and (select public.coach_owns_profile(profile_id)));

drop policy if exists "Profiles: read" on public.client_profiles;
create policy "Profiles: read" on public.client_profiles for select to authenticated
  using (coach_id = (select public.my_coach_id()) or user_id = (select auth.uid())
         or id in (select public.coach_covered_profile_ids()));

-- ---------------------------------------------------------------- 3. indexes
create index if not exists coach_todos_coach_idx on public.coach_todos (coach_id);
create index if not exists time_entries_coach_idx on public.time_entries (coach_id, started_at desc);
create index if not exists client_profiles_coach_all_idx on public.client_profiles (coach_id);

select public.record_migration(56, '056_scale_indexes');
