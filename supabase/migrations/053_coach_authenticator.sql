-- =============================================================================
-- 053_coach_authenticator.sql
-- Phase 6a run 5 (M26 seq 7, "Coach authenticator (18 Nov)"; Tim, 18 and 19
-- Nov 2026): the data under the coach authenticator's recovery codes and
-- the owner's reset.
--
-- WHAT IS SUPABASE'S AND WHAT IS OURS
--   The 6-digit codes are Supabase's own TOTP sign-in factor (auth.mfa_*):
--   set up, challenged and verified by Supabase, never stored here. This
--   migration keeps only what Supabase has no place for: when the
--   authenticator was turned on ("On since Wed 2 Dec"), the 10 recovery
--   codes (hashed, each used once), and a record of each reset.
--
-- THE TABLES, IN SHORT
--   coach_authenticators   one row a coach: turned_on_at (and the Supabase
--     factor that turned it on, an id, never its secret), codes_made_at,
--     codes_saved_at (the tick "I've saved them somewhere safe." for the
--     set in force), wrong_tries and wait_until (5 wrong recovery codes in
--     a row, then 30 seconds), recovered_at (the last recovery code used),
--     last_reset_at.
--   coach_recovery_codes   10 a set, one set a coach: set_id, position
--     (1 to 10), code_hash (bcrypt, cost 10: pgcrypto's crypt with
--     gen_salt('bf', 10)), made_at, used_at. The plain codes are returned
--     once, by coach_recovery_codes_make(), and never kept. The hash column
--     can't be read by anyone signed in (a column grant), only compared by
--     the functions below.
--   coach_authenticator_resets  who reset whom, and when, with what the
--     database could remove (null: it couldn't reach Supabase's own tables,
--     and the server's admin calls did it).
--
-- WHY BCRYPT
--   A code is 8 characters from 32 (40 random bits, from gen_random_bytes).
--   A fast salted hash of 40 bits can be run through in minutes by anyone
--   who copies the table; bcrypt at cost 10 makes that years a code, and
--   checking 10 codes at sign-in still takes well under a second. Guessing
--   through the page is held back too: 5 wrong codes in a row, then 30
--   seconds (wait_until), counted here, not only on the device.
--
-- THE FUNCTIONS (all as the person signed in; none for anon)
--   coach_auth_state()            what the screens need: coach or not, the
--     owner's first name (for "Ask Tim to reset your authenticator."),
--     turned on since, codes left of 10, the codes saved or not, the wait,
--     the last reset, and whether this sign-in began before it.
--   coach_authenticator_on(factor) "Turn it on" was accepted (aal2).
--   coach_recovery_codes_make()   a new set of 10 (aal2 only: "needs a
--     current code"); the old set stops working. Returns the plain codes
--     once.
--   coach_recovery_codes_saved()  the tick was ticked for the set in force.
--   coach_recovery_code_use(code) one code, used once, atomically: the
--     coach's row is locked first, so two tabs can't both use one code. A
--     used code removes the coach's lost TOTP factors where the database
--     can reach them (the server's admin call does it otherwise), so the
--     new phone can be set up.
--   coach_authenticator_reset(coach) the owner only, never their own, an
--     active associate only, the owner at aal2: removes the coach's codes
--     and, where the database can, their TOTP factors and every session
--     (so they are signed out everywhere), and records the reset.
--
-- WHAT GOES WHERE
--   SQL: every rule (who may, once only, the wait, the record), because the
--   database is the protection (Clarity Coach rule 9). The server function
--   (api/coach-auth-reset.js) adds Supabase's admin MFA calls with the
--   service key, on the live site only, because Supabase's own tables
--   (auth.mfa_factors, auth.sessions, auth.refresh_tokens) may not be
--   writable from a migration's functions on a hosted project; the SQL
--   tries, says what it removed, and carries on either way.
--
-- Additive and safe to run twice. Needs 026 (coaches, is_owner) and 049.
-- Ends by recording itself.
-- =============================================================================

do $need$
begin
  if to_regclass('public.coaches') is null or to_regprocedure('public.is_owner()') is null then
    raise exception '053 needs 026 (public.coaches, public.is_owner) first';
  end if;
  if to_regprocedure('public.my_coach_id()') is null then
    raise exception '053 needs 049 first';
  end if;
end
$need$;

-- ---------------------------------------------------------------- tables
create table if not exists public.coach_authenticators (
  user_id        uuid primary key references auth.users (id) on delete cascade,
  turned_on_at   timestamptz,
  factor_id      uuid,
  codes_made_at  timestamptz,
  codes_saved_at timestamptz,
  wrong_tries    integer not null default 0 check (wrong_tries between 0 and 5),
  wait_until     timestamptz,
  recovered_at   timestamptz,
  last_reset_at  timestamptz,
  updated_at     timestamptz not null default now()
);
comment on table public.coach_authenticators is
  'A coach''s authenticator, beside Supabase''s own TOTP factor: when it was turned on, the recovery codes'' state, the wait after 5 wrong codes, the last reset (053).';

create table if not exists public.coach_recovery_codes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  set_id     uuid not null,
  position   smallint not null check (position between 1 and 10),
  code_hash  text not null check (code_hash like '$2%' and char_length(code_hash) = 60),
  made_at    timestamptz not null default now(),
  used_at    timestamptz,
  unique (user_id, set_id, position)
);
create index if not exists coach_recovery_codes_user_idx on public.coach_recovery_codes (user_id) where used_at is null;
comment on table public.coach_recovery_codes is
  'Recovery codes, 10 a set, one set a coach, bcrypt-hashed, each used once (053). The plain codes are shown once and never kept.';

create table if not exists public.coach_authenticator_resets (
  id               uuid primary key default gen_random_uuid(),
  coach_user_id    uuid not null references auth.users (id) on delete cascade,
  reset_by         uuid references auth.users (id) on delete set null,
  reset_at         timestamptz not null default now(),
  codes_removed    integer not null default 0,
  factors_removed  integer,
  sessions_removed integer
);
create index if not exists coach_authenticator_resets_coach_idx on public.coach_authenticator_resets (coach_user_id, reset_at desc);
comment on table public.coach_authenticator_resets is
  'Each reset of a coach''s authenticator: who reset whom, and when (053). Null counts: the database couldn''t reach Supabase''s own tables, and the server did it.';

-- ---------------------------------------------------------------- rules
alter table public.coach_authenticators enable row level security;
alter table public.coach_recovery_codes enable row level security;
alter table public.coach_authenticator_resets enable row level security;

-- Read only, and only through these: every change goes through a function.
revoke all on public.coach_authenticators from public, anon, authenticated;
revoke all on public.coach_recovery_codes from public, anon, authenticated;
revoke all on public.coach_authenticator_resets from public, anon, authenticated;
grant select on public.coach_authenticators to authenticated;
-- Never the hash: a coach sees which of their codes are used, not what they were.
grant select (id, user_id, set_id, position, made_at, used_at) on public.coach_recovery_codes to authenticated;
grant select on public.coach_authenticator_resets to authenticated;
grant all on public.coach_authenticators, public.coach_recovery_codes, public.coach_authenticator_resets to service_role;

drop policy if exists "Coach authenticators: own" on public.coach_authenticators;
create policy "Coach authenticators: own" on public.coach_authenticators for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists "Coach recovery codes: own" on public.coach_recovery_codes;
create policy "Coach recovery codes: own" on public.coach_recovery_codes for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists "Coach authenticator resets: own or the owner" on public.coach_authenticator_resets;
create policy "Coach authenticator resets: own or the owner" on public.coach_authenticator_resets for select to authenticated
  using (coach_user_id = (select auth.uid()) or (select public.is_owner()));

-- ---------------------------------------------------------------- helpers
-- Whether this sign-in has given its 6-digit code (Supabase's aal2 claim).
create or replace function public._coach_auth_aal2()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((select auth.jwt()) ->> 'aal', '') = 'aal2';
$$;
revoke all on function public._coach_auth_aal2() from public, anon, authenticated;

-- A typed recovery code as it is kept: lower case, without spaces, dashes or
-- anything else that isn't a letter or digit, and "o" read as the zero it
-- must be (there's no "o" in a code). The app reads it the same way
-- (src/lib/signIn/coachAuth.js, readRecoveryCode).
create or replace function public._coach_code_plain(p_code text)
returns text
language sql
immutable
set search_path = ''
as $$
  select translate(regexp_replace(lower(coalesce(p_code, '')), '[^a-z0-9]', '', 'g'), 'o', '0');
$$;
revoke all on function public._coach_code_plain(text) from public, anon, authenticated;

-- The coach's own row, made when first needed, and locked for this
-- transaction: everything that changes a coach's codes runs one at a time.
create or replace function public._coach_auth_lock(p_user uuid)
returns public.coach_authenticators
language plpgsql
security definer
set search_path = ''
as $$
declare r public.coach_authenticators;
begin
  insert into public.coach_authenticators (user_id) values (p_user) on conflict (user_id) do nothing;
  select * into r from public.coach_authenticators where user_id = p_user for update;
  return r;
end;
$$;
revoke all on function public._coach_auth_lock(uuid) from public, anon, authenticated;

-- Removes a person's TOTP factors and, when asked, every session, where
-- the database can reach Supabase's own tables. Answers what it removed;
-- null for a part it couldn't reach (the server's admin calls do it then).
create or replace function public._coach_auth_remove(p_user uuid, p_sessions boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare f integer; s integer;
begin
  if to_regclass('auth.mfa_factors') is not null then
    begin
      execute 'delete from auth.mfa_factors where user_id = $1' using p_user;
      get diagnostics f = row_count;
    exception when others then f := null;
    end;
  end if;
  if p_sessions and to_regclass('auth.sessions') is not null then
    begin
      if to_regclass('auth.refresh_tokens') is not null then
        execute 'delete from auth.refresh_tokens where user_id = $1::text' using p_user;
      end if;
      execute 'delete from auth.sessions where user_id = $1' using p_user;
      get diagnostics s = row_count;
    exception when others then s := null;
    end;
  end if;
  return jsonb_build_object('factors', f, 'sessions', s);
end;
$$;
revoke all on function public._coach_auth_remove(uuid, boolean) from public, anon, authenticated;

-- Whether this sign-in is still good: it didn't begin before the coach's
-- last reset, and (where the database can see sessions) its session is
-- still there. A session from before a reset is told to sign in again.
-- When the sign-in began is the earliest of its "amr" times (Supabase keeps
-- them for the session, so a refreshed token carries the first sign-in's
-- time); "iat" only when there are none, because every refresh gives a new
-- iat: where the reset can't remove sessions, an hour's refresh would
-- otherwise let a sign-in from before it carry on (the functionality
-- tester, 21 Nov).
create or replace function public._coach_auth_session_ok(p_reset timestamptz)
returns boolean
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
    return false;
  end if;
  begin
    v_sid := nullif(v_claims ->> 'session_id', '')::uuid;
  exception when others then v_sid := null;
  end;
  if v_sid is null or to_regclass('auth.sessions') is null then
    return true;
  end if;
  begin
    execute 'select exists (select 1 from auth.sessions where id = $1)' into v_there using v_sid;
  exception when others then return true;
  end;
  return coalesce(v_there, true);
end;
$$;
revoke all on function public._coach_auth_session_ok(timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------- what the screens read
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
    'session_ok', public._coach_auth_session_ok(a.last_reset_at)
  );
end;
$$;

-- ---------------------------------------------------------------- turned on
create or replace function public.coach_authenticator_on(p_factor uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare me uuid := (select auth.uid()); a public.coach_authenticators;
begin
  if me is null or not public.is_coach() then
    raise exception 'coaches only' using errcode = '42501';
  end if;
  if not public._coach_auth_aal2() then
    return jsonb_build_object('status', 'needs_code');
  end if;
  a := public._coach_auth_lock(me);
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
  if me is null or not public.is_coach() then
    raise exception 'coaches only' using errcode = '42501';
  end if;
  if not public._coach_auth_aal2() then
    return jsonb_build_object('status', 'needs_code');
  end if;
  a := public._coach_auth_lock(me);
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
  return jsonb_build_object('status', 'made', 'codes', to_jsonb(v_codes), 'made_at', a.codes_made_at);
end;
$$;

create or replace function public.coach_recovery_codes_saved()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare me uuid := (select auth.uid()); a public.coach_authenticators;
begin
  if me is null or not public.is_coach() then
    raise exception 'coaches only' using errcode = '42501';
  end if;
  if not exists (select 1 from public.coach_recovery_codes where user_id = me) then
    return jsonb_build_object('status', 'none');
  end if;
  a := public._coach_auth_lock(me);
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
  if me is null or not public.is_coach() then
    raise exception 'coaches only' using errcode = '42501';
  end if;
  -- One at a time for this coach: a second tab waits here, then finds the code used.
  a := public._coach_auth_lock(me);
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
      return jsonb_build_object('status', 'wait', 'wait_seconds', 30);
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
  if me is null or not public.is_owner() then
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

-- ---------------------------------------------------------------- who may call
do $grants$
declare fn text;
begin
  foreach fn in array array[
    'public.coach_auth_state()',
    'public.coach_authenticator_on(uuid)',
    'public.coach_recovery_codes_make()',
    'public.coach_recovery_codes_saved()',
    'public.coach_recovery_code_use(text)',
    'public.coach_authenticator_reset(uuid)'] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end
$grants$;

-- ---------------------------------------------------------------- record it
do $log$
begin
  if to_regprocedure('public.record_migration(integer,text)') is not null then
    perform public.record_migration(53, '053_coach_authenticator');
  end if;
end
$log$;
