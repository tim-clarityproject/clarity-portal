-- =============================================================================
-- 054_coach_code_required.sql
-- Phase 6a run 6, item 1 (Claude's call, 21 Nov: close the gap before
-- go-live): the database asks for the coach's 6-digit code.
--
-- WHY
--   Until now only the page held a coach at Enter your code (sign-in rule
--   41): a stolen coach password plus direct calls to the database got past
--   the authenticator. From 054 the database itself accepts a coach's
--   request for coach data only when that sign-in has given its 6-digit code:
--   Supabase's own claim, (auth.jwt() ->> 'aal') = 'aal2'.
--
-- HOW (the standard Supabase way, in three parts)
--   1. One helper, public.coach_code_ok(): true when this sign-in is at aal2.
--   2. The checks every coach rule and coach function already asks are made
--      to ask it too, so nothing written in 026 to 053 has to change shape:
--        is_coach(), is_owner(), is_coach_of(), my_coach_id(),
--        my_owner_coach_id(), coach_owns_profile(), covers_profile() and
--        coach_has_client_in() answer "not a coach" until the code is given.
--      Every coach function (049 to 053's, network_page, free times for the
--      coach, the coach's reads of what clients share through may_see, the
--      older Health Check and guest-link functions for coaches) asks one of
--      them, so each refuses or answers nothing at aal1. The two that look a
--      coach up for themselves (coach_save_details, coach_client_list) ask
--      _coach_code_needed() first.
--   3. A restrictive rule on every coach table, "Coach data: needs the
--      6-digit code" (as restrictive: it is ANDed with every other rule), so
--      a table is shut at aal1 whatever its own rules say. Where a client
--      also reads or writes a table (their own profile, their files, a View
--      as client request, For next time, who their coach is, a suggestion),
--      only the coach's side is limited: the client's own rows pass with no
--      code, exactly as today. The tables are listed once, in
--      public.coach_code_tables(), and the test fails when a coach table is
--      added without the rule.
--
-- WHAT STILL WORKS AT aal1 (before the code)
--   Everything the sign-in screens need to get a coach to the code, or to
--   set up a new authenticator, or out again:
--     - reading one's own coaches row (the app's "is this a coach?"),
--     - coach_auth_state() (it never asked is_coach()),
--     - coach_authenticator_on(), coach_recovery_codes_make(): at aal1 they
--       still answer 'needs_code', as in 053,
--     - coach_recovery_codes_saved(), coach_recovery_code_use() (the
--       recovery code is used at aal1, by design),
--     - one's own coach_authenticators, coach_recovery_codes (never the
--       hash) and coach_authenticator_resets rows,
--     - signing out (Supabase's own, nothing here).
--   These five functions ask the ungated _coach_signed_in() and
--   _coach_owner_signed_in() instead; they are copied from 053 with only
--   that changed. coach_authenticator_reset() still needs the owner at
--   aal2 ('needs_code' at aal1).
--
-- A RECOVERY CODE NEVER OPENS COACH DATA
--   Supabase can't raise a sign-in to aal2 from a recovery code, so a
--   coach who uses one stays at aal1: 053's coach_recovery_code_use() (and
--   api/coach-auth-reset.js kind 'recovered') removes the lost phone's
--   factor, the page then has no factor to ask for and sends them to Set up
--   your authenticator, and turning on the new one is Supabase's verify,
--   which makes the sign-in aal2. Only then does any coach data open. That
--   is the safe standard: a recovery code lets the coach enrol a new
--   authenticator, nothing more.
--
-- CLIENTS, GUESTS AND PUBLIC PAGES ARE UNCHANGED
--   Clients never have a code to give, and none of their rules or functions
--   ask for one: their own rows, the client sides of coaching tables, the
--   /coaching page's functions (my_*, client_view_answer, cover_agree,
--   client_accept_invite, my_session_*), booking pages, polls, workshop
--   registration and surveys, guest links and the outside Health Check.
--   The server's key (service_role) passes every rule as before, so the
--   scheduled reminders and the inbound-email service are unchanged.
--
-- Additive (no table, column or data changes) and safe to run twice.
-- Needs 053. Ends by recording itself.
-- =============================================================================

do $need$
begin
  if to_regprocedure('public.coach_auth_state()') is null
     or to_regprocedure('public.coach_recovery_code_use(text)') is null then
    raise exception '054 needs 053 (the coach authenticator) first';
  end if;
end
$need$;

-- ---------------------------------------------------------------- the helper
-- Whether this sign-in has given its 6-digit code (Supabase's aal2 claim).
-- Security invoker: it reads only the request's own claims.
create or replace function public.coach_code_ok()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((select auth.jwt()) ->> 'aal', '') = 'aal2';
$$;
comment on function public.coach_code_ok() is
  'True when this sign-in has given its 6-digit code (aal2). Every coach rule and coach function asks it (054).';
revoke all on function public.coach_code_ok() from public;
grant execute on function public.coach_code_ok() to anon, authenticated, service_role;

-- For a coach function that looks the coach up for itself: stops at aal1.
create or replace function public._coach_code_needed()
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if not public.coach_code_ok() then
    raise exception 'Give your 6-digit code to carry on.' using errcode = '42501';
  end if;
end;
$$;
revoke all on function public._coach_code_needed() from public, anon, authenticated;

-- The checks before the code, for the sign-in screens' own functions only
-- (never in a rule, never callable by anyone signed in).
create or replace function public._coach_signed_in()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.coaches c where c.user_id = (select auth.uid()) and c.active);
$$;
revoke all on function public._coach_signed_in() from public, anon, authenticated;

create or replace function public._coach_owner_signed_in()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.coaches c where c.user_id = (select auth.uid()) and c.role = 'owner' and c.active);
$$;
revoke all on function public._coach_owner_signed_in() from public, anon, authenticated;

-- ---------------------------------------------------------------- the checks every coach rule asks
-- Each is the same as before with "and the code is given" added. Same
-- names, arguments and results, so every rule and function that asks them
-- (026 to 053) now asks for the code too.
create or replace function public.is_coach()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.coach_code_ok()
     and exists (select 1 from public.coaches c where c.user_id = (select auth.uid()) and c.active);
$$;

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.coach_code_ok()
     and exists (
       select 1 from public.coaches c
       where c.user_id = (select auth.uid()) and c.role = 'owner' and c.active
     );
$$;

create or replace function public.is_coach_of(p_client uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.coach_code_ok()
     and exists (
       select 1
       from public.coach_clients cc
       join public.coaches c on c.id = cc.coach_id
       where cc.client_id = p_client and cc.ended_at is null
         and c.user_id = (select auth.uid()) and c.active
     );
$$;

create or replace function public.my_coach_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.id from public.coaches c
  where c.user_id = (select auth.uid()) and c.active and public.coach_code_ok();
$$;

create or replace function public.my_owner_coach_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.id from public.coaches c
  where c.user_id = (select auth.uid()) and c.active and c.role = 'owner' and public.coach_code_ok();
$$;

create or replace function public.coach_owns_profile(p_profile uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.coach_code_ok()
     and exists (
       select 1 from public.client_profiles p
       join public.coaches c on c.id = p.coach_id
       where p.id = p_profile and c.user_id = (select auth.uid()) and c.active
     );
$$;

create or replace function public.covers_profile(p_profile uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.coach_code_ok()
     and exists (
       select 1 from public.coach_cover cv
       join public.coaches c on c.id = cv.cover_coach_id
       where cv.profile_id = p_profile and c.user_id = (select auth.uid()) and c.active
         and cv.client_agreed_at is not null
         and (now() at time zone 'Europe/London')::date between cv.starts_on and cv.ends_on
     );
$$;

create or replace function public.coach_has_client_in(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.coach_code_ok()
     and exists (
       select 1 from public.client_profiles p
       join public.coaches c on c.id = p.coach_id
       where p.organisation_id = p_org and p.merged_into is null
         and c.user_id = (select auth.uid()) and c.active
     );
$$;

-- ---------------------------------------------------------------- functions that look the coach up themselves
create or replace function public.coach_save_details(p_first_name text, p_full_name text, p_mobile text, p_contact_ways text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public._coach_code_needed();
  update public.coaches
  set display_first_name = btrim(p_first_name), full_name = nullif(btrim(coalesce(p_full_name, '')), ''),
      mobile = nullif(btrim(coalesce(p_mobile, '')), ''), contact_ways = coalesce(p_contact_ways, '{}'::text[])
  where user_id = (select auth.uid()) and active;
  if not found then
    raise exception 'Only a coach can do this.' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.coach_client_list(p_coach uuid default null, p_search text default null, p_organisation uuid default null, p_limit integer default 50, p_offset integer default 0)
returns table(client_id uuid, first_name text, last_name text, email text, coach_id uuid, coach_first_name text, coaching_since timestamptz, organisation_name text, mission text, latest_week_score numeric, latest_week_end date, total bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me uuid := (select auth.uid());
  mine uuid;
  owner boolean := public.is_owner();
begin
  perform public._coach_code_needed();
  select c.id into mine from public.coaches c where c.user_id = me and c.active;
  if mine is null then
    raise exception 'Only coaches see a client list.' using errcode = '42501';
  end if;
  if not owner and p_coach is not null and p_coach <> mine then
    raise exception 'You see only your own clients.' using errcode = '42501';
  end if;
  return query
  with base as (
    select cc.client_id, cc.coach_id, cc.started_at
    from public.coach_clients cc
    where cc.ended_at is null
      and case when owner then (p_coach is null or cc.coach_id = p_coach) else cc.coach_id = mine end
  ),
  filtered as (
    select b.client_id, b.coach_id, b.started_at, p.first_name, p.last_name, p.email
    from base b left join public.profiles p on p.id = b.client_id
    where (p_search is null or btrim(p_search) = ''
           or (coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) ilike '%' || btrim(p_search) || '%')
      and (p_organisation is null or exists (select 1 from public.organisation_members m
                                             where m.user_id = b.client_id and m.organisation_id = p_organisation and m.ended_on is null))
  ),
  paged as (
    select f.*, count(*) over () as total
    from filtered f
    order by f.last_name nulls last, f.first_name nulls last, f.client_id
    limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0)
  )
  select pg.client_id, pg.first_name, pg.last_name, pg.email, pg.coach_id, c.display_first_name, pg.started_at,
         (select o.name from public.organisation_members m join public.organisations o on o.id = m.organisation_id
           where m.user_id = pg.client_id and m.ended_on is null order by m.started_on limit 1),
         case when public.may_see(pg.client_id, 'mission')
              then (select pp.mission from public.performance_plans pp where pp.user_id = pg.client_id and pp.status = 'active') end,
         case when public.may_see(pg.client_id, 'progress')
              then (select ws.score from public.week_scores ws where ws.user_id = pg.client_id order by ws.week_end desc limit 1) end,
         case when public.may_see(pg.client_id, 'progress')
              then (select max(ws.week_end) from public.week_scores ws where ws.user_id = pg.client_id) end,
         pg.total
  from paged pg join public.coaches c on c.id = pg.coach_id
  order by pg.last_name nulls last, pg.first_name nulls last, pg.client_id;
end;
$$;

-- ---------------------------------------------------------------- the sign-in screens' own functions (053), before the code
-- Copied from 053 word for word, except that they ask _coach_signed_in()
-- (and the reset _coach_owner_signed_in()) in place of is_coach() and
-- is_owner(), which now need the code: these must answer at aal1, exactly
-- as in 053 ('needs_code' where 053 says so).
create or replace function public.coach_authenticator_on(p_factor uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare me uuid := (select auth.uid()); a public.coach_authenticators;
begin
  if me is null or not public._coach_signed_in() then
    raise exception 'coaches only' using errcode = '42501';
  end if;
  if not public._coach_auth_aal2() then
    return jsonb_build_object('status', 'needs_code');
  end if;
  a := public._coach_auth_lock(me);
  -- A sign-in from before the owner's reset changes nothing here: where the
  -- database can't end its session, it could otherwise make a new set of
  -- codes for the account it was reset out of (the break-it tester, 21 Nov).
  if not public._coach_auth_session_ok(a.last_reset_at) then
    return jsonb_build_object('status', 'signed_out');
  end if;
  update public.coach_authenticators
     set turned_on_at = now(), factor_id = p_factor, wrong_tries = 0, wait_until = null, updated_at = now()
   where user_id = me
  returning * into a;
  return jsonb_build_object('status', 'on', 'turned_on_at', a.turned_on_at);
end;
$$;

-- ---------------------------------------------------------------- recovery codes
create or replace function public.coach_recovery_codes_make()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  alphabet constant text := 'abcdefghjkmnpqrstuvwxyz023456789';  -- 32: no i, l, o or 1
  v_set uuid := gen_random_uuid();
  v_codes text[] := '{}';
  v_plain text;
  b bytea;
  i integer;
  j integer;
  a public.coach_authenticators;
begin
  if me is null or not public._coach_signed_in() then
    raise exception 'coaches only' using errcode = '42501';
  end if;
  if not public._coach_auth_aal2() then
    return jsonb_build_object('status', 'needs_code');
  end if;
  a := public._coach_auth_lock(me);
  -- A sign-in from before the owner's reset changes nothing here: where the
  -- database can't end its session, it could otherwise make a new set of
  -- codes for the account it was reset out of (the break-it tester, 21 Nov).
  if not public._coach_auth_session_ok(a.last_reset_at) then
    return jsonb_build_object('status', 'signed_out');
  end if;
  delete from public.coach_recovery_codes where user_id = me;
  i := 1;
  while i <= 10 loop
    b := extensions.gen_random_bytes(8);
    v_plain := '';
    for j in 0..7 loop
      v_plain := v_plain || substr(alphabet, (get_byte(b, j) % 32) + 1, 1);
    end loop;
    continue when (left(v_plain, 4) || '-' || right(v_plain, 4)) = any (v_codes);
    insert into public.coach_recovery_codes (user_id, set_id, position, code_hash)
    values (me, v_set, i, extensions.crypt(v_plain, extensions.gen_salt('bf', 10)));
    v_codes := v_codes || (left(v_plain, 4) || '-' || right(v_plain, 4));
    i := i + 1;
  end loop;
  update public.coach_authenticators
     set codes_made_at = now(), codes_saved_at = null, wrong_tries = 0, wait_until = null, updated_at = now()
   where user_id = me
  returning * into a;
  return jsonb_build_object('status', 'made', 'codes', to_jsonb(v_codes), 'made_at', a.codes_made_at, 'set_id', v_set);
end;
$$;

-- The tick, for the set the page shows (p_set, from coach_recovery_codes_make).
-- A set replaced since (new codes made in another tab) is never ticked as
-- saved: its codes don't work, so the page says so (the break-it tester,
-- 21 Nov). The first version took no set; it is replaced here.
create or replace function public.coach_recovery_codes_saved(p_set uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare me uuid := (select auth.uid()); a public.coach_authenticators;
begin
  if me is null or not public._coach_signed_in() then
    raise exception 'coaches only' using errcode = '42501';
  end if;
  a := public._coach_auth_lock(me);
  -- A sign-in from before the owner's reset changes nothing here: where the
  -- database can't end its session, it could otherwise make a new set of
  -- codes for the account it was reset out of (the break-it tester, 21 Nov).
  if not public._coach_auth_session_ok(a.last_reset_at) then
    return jsonb_build_object('status', 'signed_out');
  end if;
  if not exists (select 1 from public.coach_recovery_codes where user_id = me) then
    return jsonb_build_object('status', 'none');
  end if;
  if p_set is not null and not exists (select 1 from public.coach_recovery_codes where user_id = me and set_id = p_set) then
    return jsonb_build_object('status', 'replaced');
  end if;
  update public.coach_authenticators set codes_saved_at = now(), updated_at = now() where user_id = me;
  return jsonb_build_object('status', 'saved');
end;
$$;

create or replace function public.coach_recovery_code_use(p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  a public.coach_authenticators;
  v_plain text := public._coach_code_plain(p_code);
  v_hit uuid;
  v_left integer;
  v_removed jsonb;
  r record;
begin
  if me is null or not public._coach_signed_in() then
    raise exception 'coaches only' using errcode = '42501';
  end if;
  -- One at a time for this coach: a second tab waits here, then finds the code used.
  a := public._coach_auth_lock(me);
  -- A sign-in from before the owner's reset changes nothing here: where the
  -- database can't end its session, it could otherwise make a new set of
  -- codes for the account it was reset out of (the break-it tester, 21 Nov).
  if not public._coach_auth_session_ok(a.last_reset_at) then
    return jsonb_build_object('status', 'signed_out');
  end if;
  if a.wait_until is not null and a.wait_until > now() then
    return jsonb_build_object('status', 'wait', 'wait_seconds', ceil(extract(epoch from (a.wait_until - now())))::integer);
  end if;
  if v_plain ~ '^[a-z0-9]{8}$' then
    for r in select id, code_hash from public.coach_recovery_codes where user_id = me and used_at is null order by position loop
      if extensions.crypt(v_plain, r.code_hash) = r.code_hash then
        v_hit := r.id;
        exit;
      end if;
    end loop;
  end if;
  if v_hit is null then
    -- Wrong or already used: the same answer either way, so it tells a guesser nothing.
    if a.wrong_tries + 1 >= 5 then
      update public.coach_authenticators set wrong_tries = 0, wait_until = now() + interval '30 seconds', updated_at = now() where user_id = me;
      -- 'started': this was the 5th, so the page says so once (a try during the wait doesn't).
      return jsonb_build_object('status', 'wait', 'wait_seconds', 30, 'started', true);
    end if;
    update public.coach_authenticators set wrong_tries = a.wrong_tries + 1, updated_at = now() where user_id = me;
    return jsonb_build_object('status', 'no_match', 'tries_left', 4 - a.wrong_tries);
  end if;
  update public.coach_recovery_codes set used_at = now() where id = v_hit and used_at is null;
  select count(*) into v_left from public.coach_recovery_codes where user_id = me and used_at is null;
  -- The phone is lost: its factor goes, so the new phone can be set up.
  v_removed := public._coach_auth_remove(me, false);
  update public.coach_authenticators
     set wrong_tries = 0, wait_until = null, recovered_at = now(), turned_on_at = null, factor_id = null, updated_at = now()
   where user_id = me;
  return jsonb_build_object('status', 'used', 'codes_left', v_left, 'factors_removed', v_removed -> 'factors');
end;
$$;

-- ---------------------------------------------------------------- the owner's reset
create or replace function public.coach_authenticator_reset(p_coach uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  t public.coaches;
  v_codes integer;
  v_removed jsonb;
  v_id uuid;
begin
  if me is null or not public._coach_owner_signed_in() then
    raise exception 'only the owner can reset an authenticator' using errcode = '42501';
  end if;
  if not public._coach_auth_aal2() then
    return jsonb_build_object('status', 'needs_code');
  end if;
  select * into t from public.coaches where id = p_coach;
  if t.id is null or not t.active then
    return jsonb_build_object('status', 'not_found');
  end if;
  if t.user_id = me or t.role = 'owner' then
    -- The owner's way back is a recovery code or a second phone.
    return jsonb_build_object('status', 'self');
  end if;
  perform public._coach_auth_lock(t.user_id);
  delete from public.coach_recovery_codes where user_id = t.user_id;
  get diagnostics v_codes = row_count;
  v_removed := public._coach_auth_remove(t.user_id, true);
  update public.coach_authenticators
     set turned_on_at = null, factor_id = null, codes_made_at = null, codes_saved_at = null,
         wrong_tries = 0, wait_until = null, recovered_at = null, last_reset_at = now(), updated_at = now()
   where user_id = t.user_id;
  insert into public.coach_authenticator_resets (coach_user_id, reset_by, codes_removed, factors_removed, sessions_removed)
  values (t.user_id, me, v_codes, (v_removed ->> 'factors')::integer, (v_removed ->> 'sessions')::integer)
  returning id into v_id;
  return jsonb_build_object('status', 'reset', 'reset_id', v_id, 'user_id', t.user_id, 'codes_removed', v_codes,
                            'factors_removed', v_removed -> 'factors', 'sessions_removed', v_removed -> 'sessions');
end;
$$;

-- ---------------------------------------------------------------- the coach tables
-- Every table that holds coach data, once. kind 'coach': coaches only, so
-- nothing passes before the code. 'closed': the server's alone (no rule and
-- no grant for anyone signed in, as 051 and 052 made them), so it needs no
-- rule of its own; the test checks it stays shut. Any other kind names the
-- person's own side, which passes with no code (clients, and a coach's own
-- sign-in rows).
create or replace function public.coach_code_tables()
returns table(table_name text, kind text)
language sql
immutable
set search_path = ''
as $$
  select t.table_name, t.kind from (values
    -- 026 and 035, the older coach tables
    ('coaches', 'own_coach_row'),
    ('coach_clients', 'own_client_id'),
    ('coach_away', 'coach'),
    ('client_suggestions', 'own_client_id'),
    -- 049
    ('coach_settings', 'coach'), ('coach_profiles', 'coach'),
    ('client_profiles', 'own_profile_row'), ('client_profile_coaches', 'coach'),
    ('client_about', 'coach'), ('client_notes', 'coach'),
    ('client_files', 'own_profile'), ('client_view_requests', 'own_profile'),
    ('client_merges', 'coach'), ('coach_cover', 'coach'),
    ('coach_tags', 'coach'), ('coach_tag_links', 'coach'), ('coach_fields', 'coach'), ('coach_field_values', 'coach'),
    ('coach_views', 'coach'), ('organisation_contacts', 'coach'), ('organisation_documents', 'coach'),
    ('coach_groups', 'coach'), ('coach_group_members', 'coach'),
    ('engagements', 'coach'), ('engagement_packs', 'coach'), ('engagement_projects', 'coach'), ('time_entries', 'coach'),
    ('workshops', 'coach'), ('workshop_attendees', 'coach'), ('workshop_materials', 'coach'), ('workshop_survey_answers', 'coach'),
    ('activity_log', 'coach'), ('data_requests', 'coach'), ('coach_notifications', 'coach'),
    -- 050
    ('coach_todo_lists', 'coach'), ('coach_todo_headings', 'coach'), ('coach_todos', 'coach'),
    ('coach_days', 'coach'), ('coach_weeks', 'coach'),
    ('coach_sessions', 'coach'), ('coach_session_people', 'coach'), ('coach_session_actions', 'coach'), ('coach_session_notes', 'coach'),
    ('session_prep', 'own_user_id'), ('workshop_sends', 'coach'),
    -- 051
    ('coach_call_types', 'coach'), ('coach_polls', 'coach'), ('coach_poll_people', 'coach'), ('coach_poll_options', 'coach'),
    ('coach_poll_votes', 'coach'), ('coach_booking_links', 'coach'), ('coach_leads', 'coach'),
    ('coach_cal_items', 'coach'), ('coach_cal_guests', 'coach'), ('coach_open_blocks', 'coach'), ('coach_bookings', 'coach'),
    ('coach_cal_reminder_sends', 'coach'), ('coach_connections', 'closed'),
    -- 052
    ('coach_lead_stages', 'coach'), ('coach_lead_events', 'coach'), ('coach_lead_merges', 'closed'),
    ('coach_automations', 'coach'), ('coach_automation_runs', 'coach'),
    ('coach_boards', 'coach'), ('coach_board_stages', 'coach'), ('coach_board_items', 'coach'),
    ('coach_emails', 'coach'), ('coach_email_bodies', 'coach'), ('coach_email_links', 'coach'),
    ('coach_email_waiting', 'coach'), ('coach_email_addresses', 'coach'),
    ('client_check_ins', 'coach'), ('organisation_deals', 'coach'), ('organisation_growth', 'coach'),
    ('network_people', 'coach'), ('network_ratings', 'coach'), ('network_gives', 'coach'),
    ('network_columns', 'coach'), ('network_merges', 'closed'),
    -- 053: one's own rows pass before the code (the sign-in screens need them)
    ('coach_authenticators', 'own_user_id'), ('coach_recovery_codes', 'own_user_id'),
    ('coach_authenticator_resets', 'own_coach_user_id')
  ) as t(table_name, kind);
$$;
revoke all on function public.coach_code_tables() from public, anon;
grant execute on function public.coach_code_tables() to authenticated, service_role;

do $rules$
declare
  t record;
  v_own text;
  v_using text;
  v_check text;
  v_name constant text := 'Coach data: needs the 6-digit code';
begin
  for t in select * from public.coach_code_tables() loop
    if to_regclass('public.' || t.table_name) is null or t.kind = 'closed' then
      continue;
    end if;
    v_own := case t.kind
      when 'coach' then null
      when 'own_coach_row' then 'user_id = (select auth.uid())'
      when 'own_client_id' then 'client_id = (select auth.uid())'
      when 'own_user_id' then 'user_id = (select auth.uid())'
      when 'own_coach_user_id' then 'coach_user_id = (select auth.uid())'
      when 'own_profile_row' then 'user_id = (select auth.uid())'
      when 'own_profile' then '(select public.profile_is_mine(profile_id))'
    end;
    v_using := '(select public.coach_code_ok())' || coalesce(' or ' || v_own, '');
    -- What the client writes for themself passes; a coach row never changes before the code.
    v_check := case when t.kind in ('own_coach_row', 'own_client_id') then '(select public.coach_code_ok())' else v_using end;
    execute format('alter table public.%I enable row level security', t.table_name);
    execute format('drop policy if exists %I on public.%I', v_name, t.table_name);
    execute format('create policy %I on public.%I as restrictive for all to authenticated using (%s) with check (%s)',
                   v_name, t.table_name, v_using, v_check);
  end loop;
end
$rules$;

-- ---------------------------------------------------------------- record it
do $log$
begin
  if to_regprocedure('public.record_migration(integer,text)') is not null then
    perform public.record_migration(54, '054_coach_code_required');
  end if;
end
$log$;
