-- =============================================================================
-- 045_health_check_new_code.sql
-- Only you means only you: a new access code for the guest (Health Check
-- follow-up 1, step 1; Claude's call, 15 Nov, 09:25)
--
-- WHAT THIS DOES (plain English)
--   The coach who makes a Health Check link is given its access code, to pass
--   on with the link. Under 044 a guest who chose Only you still had that
--   same code, so the coach could open the answers on the outside page, and
--   even switch the choice back. Now:
--
--   1. The first time a guest chooses Only you, the code changes at once.
--      alignment_set_sharing(token, email, code, false) checks the current
--      code as before, then puts a new random code in its place and keeps
--      the new one, for the email server only, until the guest opens the
--      Health Check with it. The old code stops working for everything from
--      that moment: opening, saving, the choice, the emails. The new code is
--      never returned to whoever made the change, so even someone who held
--      the old code (the coach) never learns it.
--   2. The new code goes to the guest's own email only: the email server
--      (service role) asks alignment_new_code_to_send(token, email, code),
--      which accepts the current or the just-replaced code with the guest's
--      email, and answers with the address on the link (never one the
--      browser gives) and the new code, at most 3 times an hour.
--   3. Once the guest has opened the Health Check with the new code
--      (alignment_open), the kept copy and the old code's record are gone.
--   4. From then on the code is the guest's alone: switching between Only
--      you and You and Tim needs it, and switching to Only you again issues
--      no further code (nobody else has this one). The coach's completion
--      email never carries a code (api/alignment-email.js), so the coach
--      never learns it.
--   5. alignment_coach_answers is unchanged from 044: with Only you the coach
--      learns only that it finished.
--
-- WHO CAN REACH WHAT
--   alignment_set_sharing: as 044 (whoever holds the link, email and current
--   code). alignment_new_code_to_send: the email server only (service role),
--   or Tim in the SQL editor. The table stays closed to every role the app
--   and the server use (row level security on, no rules, no table rights).
--
-- SAFE TO RUN TWICE
--   Columns are added only if missing; every function is replaced with the
--   same version; nothing is updated.
--
-- WHEN TO RUN
--   After 044 (it stops with a clear message without it). Then run
--   supabase/045_health_check_new_code_test.sql, which should end with
--   045 CHECKS PASSED, then supabase/044_guest_sharing_test.sql, which
--   follows the new code where 045 is there. At go-live: after 044.
--   Until it has run, the page works as with 044 (the choice is saved and
--   the coach can't read the answers through the coach's route, but the
--   code is not changed).
-- =============================================================================

do $needs$
begin
  if to_regclass('public.alignment_sessions') is null
     or not exists (select 1 from pg_catalog.pg_attribute
                     where attrelid = 'public.alignment_sessions'::regclass and attname = 'shared_with_coach' and not attisdropped) then
    raise exception '045 needs 044_guest_sharing first. Run 044, then run this again.';
  end if;
end
$needs$;

-- -----------------------------------------------------------------------------
-- Columns
-- -----------------------------------------------------------------------------
alter table public.alignment_sessions add column if not exists code_reissued_at timestamptz;
alter table public.alignment_sessions add column if not exists new_code text;
alter table public.alignment_sessions add column if not exists replaced_code_hash text;
alter table public.alignment_sessions add column if not exists new_code_emails jsonb not null default '[]'::jsonb;

comment on column public.alignment_sessions.code_reissued_at is
  'When the guest chose Only you and was given a new access code (045). Set: the code is the guest''s alone, so the coach never had it.';
comment on column public.alignment_sessions.new_code is
  'The new access code, kept only until the guest opens the Health Check with it, for the email server to send to the guest (045). Never returned to a browser.';
comment on column public.alignment_sessions.replaced_code_hash is
  'The hash of the code the new one replaced, only so the guest''s open page can ask for the new code to be emailed again (045). Opens nothing.';
comment on column public.alignment_sessions.new_code_emails is
  'When the new code was emailed (045), for the limit of 3 an hour.';

-- Still closed: reached only through the checked functions (018, 036, 044).
alter table public.alignment_sessions enable row level security;
revoke all on table public.alignment_sessions from public, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- alignment_set_sharing (the guest): as 044, but the first Only you replaces
-- the code
-- -----------------------------------------------------------------------------
create or replace function public.alignment_set_sharing(
  p_token  text,
  p_email  text,
  p_code   text,
  p_shared boolean
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; -- no 0 O 1 I L, as 036
  a        jsonb;
  s        public.alignment_sessions;
  v_code   text := '';
  v_byte   integer;
  v_new    boolean := false;
begin
  a := public._alignment_auth(p_token, p_email, p_code);
  if not (a ->> 'ok')::boolean then
    return a;
  end if;
  if p_shared is null then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  select * into s from public.alignment_sessions where id = (a ->> 'id')::uuid for update;

  if not p_shared and s.code_reissued_at is null then
    -- The code the coach was given stops here: 6 characters, unbiased, as 036.
    while char_length(v_code) < 6 loop
      v_byte := get_byte(extensions.gen_random_bytes(1), 0);
      if v_byte < 248 then
        v_code := v_code || substr(v_alphabet, (v_byte % 31) + 1, 1);
      end if;
    end loop;
    update public.alignment_sessions
       set shared_with_coach = false,
           replaced_code_hash = access_code_hash,
           access_code_hash = extensions.crypt(v_code, extensions.gen_salt('bf')),
           new_code = v_code,
           code_reissued_at = now(),
           failed_attempts = 0,
           locked_until = null
     where id = s.id
    returning * into s;
    v_new := true;
  else
    update public.alignment_sessions
       set shared_with_coach = p_shared
     where id = s.id
    returning * into s;
  end if;

  return jsonb_build_object(
    'ok', true,
    'shared_with_coach', s.shared_with_coach,
    'status', s.status,
    'notified', s.notified_at is not null,
    -- true: the code has just changed and is on its way to the guest's
    -- email; the code itself is never returned
    'new_code', v_new
  );
end;
$$;

revoke all on function public.alignment_set_sharing(text, text, text, boolean) from public, anon, authenticated, service_role;
grant execute on function public.alignment_set_sharing(text, text, text, boolean) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- alignment_open: as 044; opening with the new code ends its keeping
-- -----------------------------------------------------------------------------
create or replace function public.alignment_open(
  p_token text,
  p_email text,
  p_code  text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a jsonb;
  s public.alignment_sessions;
begin
  a := public._alignment_auth(p_token, p_email, p_code);
  if not (a ->> 'ok')::boolean then
    return a;
  end if;

  update public.alignment_sessions
     set new_code = null, replaced_code_hash = null
   where id = (a ->> 'id')::uuid
     and (new_code is not null or replaced_code_hash is not null);

  select * into s from public.alignment_sessions where id = (a ->> 'id')::uuid;

  return jsonb_build_object(
    'ok', true,
    'status', s.status,
    'current_step', s.current_step,
    'data', s.data,
    'version', s.version,
    'updated_at', s.updated_at,
    'completed_at', s.completed_at,
    'client_label', s.client_label,
    'coach_name', case when s.coach_user_id is not null then s.coach_name end,
    'shared_with_coach', s.shared_with_coach
  );
end;
$$;

revoke all on function public.alignment_open(text, text, text) from public;
grant execute on function public.alignment_open(text, text, text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- alignment_new_code_to_send (the email server only): the new code and the
-- link's own address, for the guest's email
-- -----------------------------------------------------------------------------
create or replace function public.alignment_new_code_to_send(
  p_token text,
  p_email text,
  p_code  text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role  text := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '');
  s       public.alignment_sessions;
  v_code  text := upper(btrim(coalesce(p_code, '')));
  recent  jsonb;
begin
  -- the server (service role), or Tim in the SQL editor (no caller's claims)
  if not (v_role = 'service_role' or (v_role = '' and (select auth.uid()) is null)) then
    raise exception 'Only the email server can do this.' using errcode = '42501';
  end if;

  select * into s from public.alignment_sessions where token = coalesce(p_token, '') for update;
  if not found or s.link_disabled then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  -- The same lockout as every other call (018), so this can't be used to
  -- guess a code: 5 misses lock the link for 15 minutes.
  if s.locked_until is not null and s.locked_until > now() then
    return jsonb_build_object('ok', false, 'error', 'locked');
  end if;
  if lower(btrim(coalesce(p_email, ''))) <> s.respondent_email
     or not (extensions.crypt(v_code, s.access_code_hash) = s.access_code_hash
             or (s.replaced_code_hash is not null and extensions.crypt(v_code, s.replaced_code_hash) = s.replaced_code_hash)) then
    if s.failed_attempts + 1 >= 5 then
      update public.alignment_sessions set failed_attempts = 0, locked_until = now() + interval '15 minutes' where id = s.id;
    else
      update public.alignment_sessions set failed_attempts = failed_attempts + 1 where id = s.id;
    end if;
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if s.new_code is null then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  select coalesce(jsonb_agg(e), '[]'::jsonb) into recent
    from jsonb_array_elements_text(s.new_code_emails) as t(e)
   where e::timestamptz > now() - interval '1 hour';
  if jsonb_array_length(recent) >= 3 then
    return jsonb_build_object('ok', false, 'error', 'limit');
  end if;
  update public.alignment_sessions set new_code_emails = recent || to_jsonb(now()::text) where id = s.id;

  return jsonb_build_object(
    'ok', true,
    'respondent_email', s.respondent_email,
    'client_label', s.client_label,
    'code', s.new_code
  );
end;
$$;

revoke all on function public.alignment_new_code_to_send(text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.alignment_new_code_to_send(text, text, text) to service_role;

select public.record_migration(45, '045_health_check_new_code');
