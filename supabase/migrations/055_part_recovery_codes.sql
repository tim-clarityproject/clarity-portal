-- =============================================================================
-- 055 part: a recovery code ends the coach's other sign-ins (Phase 6a run 7,
-- step 3; Claude's call). To be folded into 055 by the lead, who records it.
--
-- WHY
--   A coach uses a recovery code because the phone is lost, and the lost
--   phone may be in someone else's hands, still signed in. So using a code
--   ends every other sign-in of the account, as the owner's Reset does, and
--   keeps the one that used it (it goes straight on to set up the new
--   phone). You're in says so: "Your other sign-ins have ended."
--
-- HOW (three layers, each enough on its own where it can act)
--   1. The database's own marker (here): coach_authenticators gets
--      others_ended_at (when the code was used) and kept_session (the
--      sign-in that used it, from its token's session_id). Every check a
--      sign-in passes (053's _coach_auth_session_ok, and so 054's
--      coach_code_ok() and every coach rule and function) now refuses a
--      sign-in that began before others_ended_at and isn't the kept one,
--      exactly as it refuses one from before the owner's reset (its earliest
--      "amr" time). This holds on a hosted project whatever Supabase's own
--      tables allow, so a stolen phone's aal2 sign-in gets no coach data from
--      the moment the code is used, even in the hour its access token lasts.
--   2. Where the database can reach Supabase's own tables (as 053 tries),
--      every other session and its refresh tokens are removed here too.
--   3. The page then asks Supabase itself to end the account's other
--      sessions (supabase.auth.signOut({ scope: 'others' }), Supabase's own
--      logout, which keeps the session that asks), so the other devices'
--      refresh tokens stop working and they drop out of the client portal
--      too. It needs no service key and works on every deployment.
--   A sign-in whose token has no session_id can't be told apart from the
--   others, so no marker is set for it (it would shut itself out); real
--   Supabase tokens always carry one.
--
-- coach_auth_state() also says why a sign-in was ended ('ended_by':
-- 'reset', 'recovery' or 'session'), so Coach sign in can give the right
-- reason.
--
-- Additive and safe to run twice. Needs 053 and 054.
-- =============================================================================

do $need$
begin
  if to_regprocedure('public.coach_code_ok()') is null
     or to_regprocedure('public._coach_signed_in()') is null
     or to_regclass('public.coach_authenticators') is null then
    raise exception 'this part of 055 needs 053 and 054 first';
  end if;
end
$need$;

-- ---------------------------------------------------------------- the marker
alter table public.coach_authenticators add column if not exists others_ended_at timestamptz;
alter table public.coach_authenticators add column if not exists kept_session uuid;
comment on column public.coach_authenticators.others_ended_at is
  'When a recovery code was last used: every sign-in that began before it, other than kept_session, is ended (055).';
comment on column public.coach_authenticators.kept_session is
  'The sign-in (its session_id) that used the recovery code, which carries on (055).';

-- ---------------------------------------------------------------- why a sign-in is ended
-- Null while this sign-in is good; otherwise why it was ended:
--   'reset'    it began before the owner's last reset (053's check);
--   'recovery' it began before a recovery code was used, and isn't the
--              sign-in that used it (this part);
--   'session'  its session has gone from Supabase's own table (where the
--              database can see it).
-- When a sign-in began is the earliest of its "amr" times, else its iat
-- (053's reasoning, kept word for word).
create or replace function public._coach_auth_ended(p_reset timestamptz)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_claims jsonb := (select auth.jwt());
  v_iat bigint;
  v_sid uuid;
  v_there boolean;
  v_ended timestamptz;
  v_kept uuid;
begin
  begin
    select min((m ->> 'timestamp')::bigint) into v_iat
      from jsonb_array_elements(case when jsonb_typeof(v_claims -> 'amr') = 'array' then v_claims -> 'amr' else '[]'::jsonb end) m
     where jsonb_typeof(m) = 'object' and (m ->> 'timestamp') ~ '^[0-9]{1,12}$';
  exception when others then v_iat := null;
  end;
  if v_iat is null then
    begin
      v_iat := nullif(v_claims ->> 'iat', '')::bigint;
    exception when others then v_iat := null;
    end;
  end if;
  if p_reset is not null and v_iat is not null and to_timestamp(v_iat) < p_reset then
    return 'reset';
  end if;
  begin
    v_sid := nullif(v_claims ->> 'session_id', '')::uuid;
  exception when others then v_sid := null;
  end;
  select a.others_ended_at, a.kept_session into v_ended, v_kept
    from public.coach_authenticators a where a.user_id = (select auth.uid());
  -- A sign-in that can't say when it began is treated as one from before.
  if v_ended is not null and v_sid is distinct from v_kept
     and (v_iat is null or to_timestamp(v_iat) < v_ended) then
    return 'recovery';
  end if;
  if v_sid is null or to_regclass('auth.sessions') is null then
    return null;
  end if;
  begin
    execute 'select exists (select 1 from auth.sessions where id = $1)' into v_there using v_sid;
  exception when others then return null;
  end;
  return case when coalesce(v_there, true) then null else 'session' end;
end;
$$;
revoke all on function public._coach_auth_ended(timestamptz) from public, anon, authenticated;

-- 053's check, same name and arguments, so every function that asks it
-- (053's, 054's and coach_code_ok()) now also asks about a recovery code.
create or replace function public._coach_auth_session_ok(p_reset timestamptz)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return public._coach_auth_ended(p_reset) is null;
end;
$$;
revoke all on function public._coach_auth_session_ok(timestamptz) from public, anon, authenticated;

-- 054's helper: aal2, and not ended by a reset or a recovery code. Only an
-- account with a reset or a recovery code on record costs the full check.
create or replace function public.coach_code_ok()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_reset timestamptz;
  v_ended timestamptz;
begin
  if coalesce((select auth.jwt()) ->> 'aal', '') <> 'aal2' then
    return false;
  end if;
  select a.last_reset_at, a.others_ended_at into v_reset, v_ended
    from public.coach_authenticators a where a.user_id = (select auth.uid());
  if v_reset is null and v_ended is null then
    return true;
  end if;
  return public._coach_auth_session_ok(v_reset);
end;
$$;
comment on function public.coach_code_ok() is
  'True when this sign-in has given its 6-digit code (aal2) and wasn''t ended by a reset of its authenticator or by a recovery code used elsewhere. Every coach rule and coach function asks it (054, 055).';
revoke all on function public.coach_code_ok() from public;
grant execute on function public.coach_code_ok() to anon, authenticated, service_role;

-- Removes a person's other sessions and their refresh tokens, where the
-- database can reach Supabase's own tables. Answers how many sessions went,
-- or null where it couldn't (the page's own Supabase sign out does it then).
create or replace function public._coach_auth_end_others(p_user uuid, p_keep uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare s integer;
begin
  if p_keep is null or to_regclass('auth.sessions') is null then
    return null;
  end if;
  begin
    if to_regclass('auth.refresh_tokens') is not null then
      execute 'delete from auth.refresh_tokens where user_id = $1::text and session_id is distinct from $2' using p_user, p_keep;
    end if;
    execute 'delete from auth.sessions where user_id = $1 and id <> $2' using p_user, p_keep;
    get diagnostics s = row_count;
  exception when others then s := null;
  end;
  return s;
end;
$$;
revoke all on function public._coach_auth_end_others(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- a code, used
-- 054's version, with the other sign-ins ended once the code is right.
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
  v_sid uuid;
  v_sessions integer;
  r record;
begin
  if me is null or not public._coach_signed_in() then
    raise exception 'coaches only' using errcode = '42501';
  end if;
  -- One at a time for this coach: a second tab waits here, then finds the code used.
  a := public._coach_auth_lock(me);
  -- A sign-in from before the owner's reset, or ended by a code used
  -- elsewhere, changes nothing here.
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
  -- And it may be in someone else's hands: every other sign-in ends, this one carries on.
  begin
    v_sid := nullif((select auth.jwt()) ->> 'session_id', '')::uuid;
  exception when others then v_sid := null;
  end;
  v_sessions := public._coach_auth_end_others(me, v_sid);
  update public.coach_authenticators
     set wrong_tries = 0, wait_until = null, recovered_at = now(), turned_on_at = null, factor_id = null,
         others_ended_at = case when v_sid is null then others_ended_at else now() end,
         kept_session = case when v_sid is null then kept_session else v_sid end,
         updated_at = now()
   where user_id = me;
  return jsonb_build_object('status', 'used', 'codes_left', v_left, 'factors_removed', v_removed -> 'factors',
                            'others_ended', v_sid is not null, 'sessions_removed', v_sessions);
end;
$$;

-- ---------------------------------------------------------------- what the screens read
-- 053's, with why a sign-in was ended.
create or replace function public.coach_auth_state()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  c public.coaches;
  a public.coach_authenticators;
  v_left integer;
  v_total integer;
  v_owner text;
  v_ended text;
begin
  if me is null then
    raise exception 'signed in only' using errcode = '42501';
  end if;
  select * into c from public.coaches where user_id = me and active;
  if c.id is null then
    -- Clients never see any of this.
    return jsonb_build_object('coach', false);
  end if;
  select * into a from public.coach_authenticators where user_id = me;
  select count(*) filter (where used_at is null), count(*) into v_left, v_total
    from public.coach_recovery_codes where user_id = me;
  select o.display_first_name into v_owner from public.coaches o
    where o.role = 'owner' and o.active order by o.created_at limit 1;
  v_ended := public._coach_auth_ended(a.last_reset_at);
  return jsonb_build_object(
    'coach', true,
    'owner', c.role = 'owner',
    'owner_first_name', v_owner,
    'turned_on_at', a.turned_on_at,
    'codes_left', v_left,
    'codes_total', v_total,
    'codes_made_at', a.codes_made_at,
    'codes_saved', a.codes_saved_at is not null and v_total > 0,
    'wait_seconds', greatest(0, ceil(extract(epoch from (a.wait_until - now()))))::integer,
    'recovered_at', a.recovered_at,
    'last_reset_at', a.last_reset_at,
    'session_ok', v_ended is null,
    'ended_by', v_ended
  );
end;
$$;

do $grants$
declare fn text;
begin
  foreach fn in array array['public.coach_auth_state()', 'public.coach_recovery_code_use(text)'] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end
$grants$;
