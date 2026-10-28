-- =============================================================================
-- 034_alignment_coach_name.sql
-- Strategic Alignment Health Check: the page names the coach who sent the link
--
-- WHAT THIS DOES (plain English)
--   1. Adds coach_name (text, may be empty) to alignment_sessions: the first
--      name of the coach who made the link, as their profile has it.
--   2. Making a link fills it in:
--        select public.create_alignment_session('Acme Ltd', 'ceo@acme.com', 'coach@example.com');
--      The third value is the coach's own portal email; their first name is
--      taken from their profile. A coach signed in to the portal who makes a
--      link is used instead. The old two-value form still works exactly as
--      before; it fills the name only when a signed-in coach makes the link.
--      Both forms stay Tim only (no one with the public key may call them).
--   3. Existing links are filled from the coach who made them where that is
--      known: where created_by holds a portal account's id or email. Links
--      made in the SQL editor hold the database role there instead, so they
--      stay empty and the page says "your coach".
--   4. alignment_open (what the outside Health Check page calls) also returns
--      coach_name. It is the same as 022 otherwise: the same link, email and
--      access code checks run first, so a person only ever gets the name for
--      their own Health Check. Wrong details get the same answer as before.
--   The coach's email is never stored or returned to the page.
--
-- SAFE TO RUN TWICE
--   The column is added only if missing, the functions are replaced with the
--   same versions, and the fill only touches rows with no name yet.
--
-- WHEN TO RUN
--   Test project: when Tim chooses. Live project: on release day, after 022.
--   The page works with or without it (without it, it says "your coach").
-- =============================================================================

alter table public.alignment_sessions add column if not exists coach_name text;

comment on column public.alignment_sessions.coach_name is
  'First name of the coach who made the link, from their profile (034). Empty means the page says "your coach".';

-- -----------------------------------------------------------------------------
-- Internal helper: the coach's first name, from a signed-in coach or the
-- account with the given email. Null when there is no such account or no name.
-- Raises when an email is given but no account has it, so a typo is noticed.
-- -----------------------------------------------------------------------------
create or replace function public._alignment_coach_name(p_coach_email text)
returns text
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_id uuid := auth.uid();
begin
  if v_id is null and btrim(coalesce(p_coach_email, '')) <> '' then
    select u.id into v_id from auth.users u where lower(u.email) = lower(btrim(p_coach_email)) limit 1;
    if v_id is null then
      raise exception 'No portal account has the coach email %.', btrim(p_coach_email);
    end if;
  end if;
  if v_id is null then
    return null;
  end if;
  return (select nullif(btrim(p.first_name), '') from public.profiles p where p.id = v_id);
end;
$$;

-- -----------------------------------------------------------------------------
-- create_alignment_session with the coach (Tim only)
-- -----------------------------------------------------------------------------
create or replace function public.create_alignment_session(
  p_client_label text,
  p_email        text,
  p_coach_email  text
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; -- no 0 O 1 I L
  v_token    text;
  v_code     text := '';
  v_byte     integer;
  v_coach    text;
begin
  if btrim(coalesce(p_client_label, '')) = '' or btrim(coalesce(p_email, '')) = '' then
    raise exception 'Client label and email are both required.';
  end if;

  v_coach := public._alignment_coach_name(p_coach_email);

  -- 32 random bytes -> 43 URL-safe characters
  v_token := translate(encode(gen_random_bytes(32), 'base64'), '+/=', '-_');
  v_token := regexp_replace(v_token, '\s', '', 'g');

  -- 6 characters, unbiased: skip bytes >= 248 (31 * 8)
  while char_length(v_code) < 6 loop
    v_byte := get_byte(gen_random_bytes(1), 0);
    if v_byte < 248 then
      v_code := v_code || substr(v_alphabet, (v_byte % 31) + 1, 1);
    end if;
  end loop;

  insert into public.alignment_sessions
    (token, access_code_hash, client_label, respondent_email, created_by, coach_name)
  values
    (v_token, crypt(v_code, gen_salt('bf')), btrim(p_client_label),
     lower(btrim(p_email)), session_user, v_coach);

  return jsonb_build_object(
    'token', v_token,
    'access_code', v_code,
    'link_path', '/health-check/' || v_token,
    'coach_name', v_coach,
    'note', 'The access code is shown once and is not stored. Copy it now.'
  );
end;
$$;

-- The two-value form, as in 018, now passing on to the one above.
create or replace function public.create_alignment_session(
  p_client_label text,
  p_email        text
) returns jsonb
language sql
security definer
set search_path = public, extensions
as $$
  select public.create_alignment_session(p_client_label, p_email, null::text);
$$;

-- -----------------------------------------------------------------------------
-- alignment_open: as 022, plus coach_name
-- -----------------------------------------------------------------------------
create or replace function public.alignment_open(
  p_token text,
  p_email text,
  p_code  text
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  a jsonb;
  s public.alignment_sessions;
begin
  a := public._alignment_auth(p_token, p_email, p_code);
  if not (a ->> 'ok')::boolean then
    return a;
  end if;

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
    'coach_name', s.coach_name
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Existing links: filled where the coach who made them is known
-- -----------------------------------------------------------------------------
update public.alignment_sessions s
   set coach_name = nullif(btrim(p.first_name), '')
  from auth.users u
  join public.profiles p on p.id = u.id
 where s.coach_name is null
   and nullif(btrim(p.first_name), '') is not null
   and (s.created_by = u.id::text or lower(s.created_by) = lower(u.email));

-- -----------------------------------------------------------------------------
-- Who may call what (as 018: making links is Tim only; alignment_open keeps
-- its grants, as "create or replace" keeps them)
-- -----------------------------------------------------------------------------
revoke all on function public._alignment_coach_name(text)                     from public, anon, authenticated;
revoke all on function public.create_alignment_session(text, text, text)      from public, anon, authenticated;
revoke all on function public.create_alignment_session(text, text)            from public, anon, authenticated;

-- Records itself where the migration log (025) is there; on a database
-- without it yet, this does nothing rather than stop the migration.
do $$
begin
  if to_regprocedure('public.record_migration(integer,text)') is not null then
    perform public.record_migration(34, '034_alignment_coach_name');
  end if;
end;
$$;
