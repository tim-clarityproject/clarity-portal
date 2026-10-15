-- =============================================================================
-- 018_alignment_sessions.sql
-- Strategic Alignment Health Check: database and secure access
--
-- WHAT THIS DOES (plain English)
--   Creates one new private table, alignment_sessions, which holds one row per
--   invitation (one per client or team). Nobody can read or write that table
--   directly. Everything goes through a handful of locked-down functions:
--
--     create_alignment_session  Tim only (SQL editor): makes a link + code
--     alignment_open            the respondent: checks email + code, loads answers
--     alignment_save            the respondent: checks email + code, saves answers
--     alignment_disable         Tim only: switches a link off
--     alignment_list            Tim only: lists sessions (no hashes, no answers)
--
-- HOW TO RUN
--   Run this whole file ONCE in the Supabase SQL editor (Run, with no
--   selection). It is safe to run again: it only adds what is missing and
--   replaces the functions with the same versions.
--   THEN run supabase/alignment_sessions_test.sql to check everything works.
--
-- It does not touch any existing table, function or policy.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- -----------------------------------------------------------------------------
-- The table
-- -----------------------------------------------------------------------------
create table if not exists public.alignment_sessions (
  id                uuid primary key default gen_random_uuid(),
  token             text unique not null,
  access_code_hash  text not null,
  client_label      text not null,
  respondent_email  text not null
                    check (respondent_email = lower(btrim(respondent_email))),
  created_by        text,
  status            text not null default 'invited'
                    check (status in ('invited', 'in_progress', 'complete')),
  current_step      jsonb,
  -- { "objective": text,
  --   "csfs":      [ { "id", "text" } ],
  --   "projects":  [ { "id", "text" } ],
  --   "ratings":   { "<raterKey>": { "<projectId>": {
  --                    "contrib":  { "<csfId>": 0-3 },
  --                    "progress": 1-5,
  --                    "resource": 1-5 } } } }
  -- Ratings are keyed by ids, never by position. One rater key, "owner", for now.
  data              jsonb not null default '{}'::jsonb,
  version           integer not null default 0,
  failed_attempts   integer not null default 0,
  locked_until      timestamptz,
  link_disabled     boolean not null default false,
  user_id           uuid null references auth.users (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  completed_at      timestamptz
);

-- Row level security ON with NO policies, and no table rights for the public
-- roles: the table cannot be read or written except through the functions.
alter table public.alignment_sessions enable row level security;
revoke all on table public.alignment_sessions from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Internal helper: check token + email + code, with lockout.
-- Not callable by anyone except the other functions in this file.
-- Returns {"ok": true, "id": ...} or {"ok": false, "error": "..."}.
-- -----------------------------------------------------------------------------
create or replace function public._alignment_auth(
  p_token text,
  p_email text,
  p_code  text
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s public.alignment_sessions;
begin
  select * into s
  from public.alignment_sessions
  where token = coalesce(p_token, '')
  for update;

  -- Unknown token or switched-off link: same answer as a wrong code.
  if not found or s.link_disabled then
    return jsonb_build_object(
      'ok', false, 'error', 'invalid',
      'message', 'Those details don’t match. Check the email and access code you were sent.');
  end if;

  if s.locked_until is not null and s.locked_until > now() then
    return jsonb_build_object(
      'ok', false, 'error', 'locked',
      'message', 'Too many attempts. Please try again in a few minutes.');
  end if;

  if lower(btrim(coalesce(p_email, ''))) = s.respondent_email
     and crypt(upper(btrim(coalesce(p_code, ''))), s.access_code_hash) = s.access_code_hash then
    if s.failed_attempts <> 0 or s.locked_until is not null then
      update public.alignment_sessions
         set failed_attempts = 0, locked_until = null
       where id = s.id;
    end if;
    return jsonb_build_object('ok', true, 'id', s.id);
  end if;

  -- Wrong details: count it, and lock for 15 minutes after 5 misses.
  if s.failed_attempts + 1 >= 5 then
    update public.alignment_sessions
       set failed_attempts = 0, locked_until = now() + interval '15 minutes'
     where id = s.id;
  else
    update public.alignment_sessions
       set failed_attempts = failed_attempts + 1
     where id = s.id;
  end if;

  return jsonb_build_object(
    'ok', false, 'error', 'invalid',
    'message', 'Those details don’t match. Check the email and access code you were sent.');
end;
$$;

-- -----------------------------------------------------------------------------
-- Internal helper: validate the answers. Returns null when fine, otherwise a
-- short reason.
-- -----------------------------------------------------------------------------
create or replace function public._alignment_validate(p_data jsonb)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v        jsonb;
  item     jsonb;
  rater    record;
  proj     record;
  cval     record;
  n        numeric;
  arr_key  text;
  arr_max  integer;
begin
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    return 'The answers must be an object.';
  end if;
  if octet_length(p_data::text) > 204800 then
    return 'The answers are too large (200 KB limit).';
  end if;

  -- Objective
  v := p_data -> 'objective';
  if v is not null then
    if jsonb_typeof(v) <> 'string' or char_length(p_data ->> 'objective') > 500 then
      return 'The objective must be text of at most 500 characters.';
    end if;
  end if;

  -- Critical Success Factors (max 12) and projects (max 40)
  foreach arr_key in array array['csfs', 'projects'] loop
    arr_max := case arr_key when 'csfs' then 12 else 40 end;
    v := p_data -> arr_key;
    if v is not null then
      if jsonb_typeof(v) <> 'array' then
        return arr_key || ' must be a list.';
      end if;
      if jsonb_array_length(v) > arr_max then
        return 'Too many items in ' || arr_key || ' (limit ' || arr_max || ').';
      end if;
      for item in select * from jsonb_array_elements(v) loop
        if jsonb_typeof(item) <> 'object'
           or jsonb_typeof(item -> 'id') is distinct from 'string'
           or jsonb_typeof(item -> 'text') is distinct from 'string' then
          return 'Each item in ' || arr_key || ' needs a text id and text.';
        end if;
        if char_length(item ->> 'id') not between 1 and 64 then
          return 'An id in ' || arr_key || ' is the wrong length.';
        end if;
        if char_length(item ->> 'text') > 300 then
          return 'An item in ' || arr_key || ' is longer than 300 characters.';
        end if;
      end loop;
    end if;
  end loop;

  -- Ratings: { rater: { projectId: { contrib: {csfId: 0-3}, progress, resource } } }
  v := p_data -> 'ratings';
  if v is not null then
    if jsonb_typeof(v) <> 'object' then
      return 'ratings must be an object.';
    end if;
    for rater in select * from jsonb_each(v) loop
      if jsonb_typeof(rater.value) <> 'object' then
        return 'Each rater must be an object.';
      end if;
      for proj in select * from jsonb_each(rater.value) loop
        if jsonb_typeof(proj.value) <> 'object' then
          return 'Each project rating must be an object.';
        end if;

        if proj.value ? 'contrib' then
          if jsonb_typeof(proj.value -> 'contrib') <> 'object' then
            return 'contrib must be an object.';
          end if;
          for cval in select * from jsonb_each(proj.value -> 'contrib') loop
            if jsonb_typeof(cval.value) <> 'number' then
              return 'A contribution must be a number.';
            end if;
            n := (cval.value #>> '{}')::numeric;
            if n < 0 or n > 3 or n <> floor(n) then
              return 'A contribution must be a whole number from 0 to 3.';
            end if;
          end loop;
        end if;

        foreach arr_key in array array['progress', 'resource'] loop
          if proj.value ? arr_key then
            if jsonb_typeof(proj.value -> arr_key) <> 'number' then
              return arr_key || ' must be a number.';
            end if;
            n := (proj.value ->> arr_key)::numeric;
            if n < 1 or n > 5 or n <> floor(n) then
              return arr_key || ' must be a whole number from 1 to 5.';
            end if;
          end if;
        end loop;
      end loop;
    end loop;
  end if;

  return null;
end;
$$;

-- -----------------------------------------------------------------------------
-- create_alignment_session (Tim only)
-- Returns the token, the plain access code (shown ONCE, never stored) and the
-- link path.
-- -----------------------------------------------------------------------------
create or replace function public.create_alignment_session(
  p_client_label text,
  p_email        text
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
begin
  if btrim(coalesce(p_client_label, '')) = '' or btrim(coalesce(p_email, '')) = '' then
    raise exception 'Client label and email are both required.';
  end if;

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
    (token, access_code_hash, client_label, respondent_email, created_by)
  values
    (v_token, crypt(v_code, gen_salt('bf')), btrim(p_client_label),
     lower(btrim(p_email)), session_user);

  return jsonb_build_object(
    'token', v_token,
    'access_code', v_code,
    'link_path', '/health-check/' || v_token,
    'note', 'The access code is shown once and is not stored. Copy it now.'
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- alignment_open (the respondent)
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
    'updated_at', s.updated_at
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- alignment_save (the respondent)
-- -----------------------------------------------------------------------------
create or replace function public.alignment_save(
  p_token            text,
  p_email            text,
  p_code             text,
  p_data             jsonb,
  p_current_step     jsonb,
  p_expected_version integer,
  p_complete         boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  a      jsonb;
  s      public.alignment_sessions;
  v_why  text;
  v_new  public.alignment_sessions;
begin
  a := public._alignment_auth(p_token, p_email, p_code);
  if not (a ->> 'ok')::boolean then
    return a;
  end if;

  v_why := public._alignment_validate(p_data);
  if v_why is not null then
    return jsonb_build_object('ok', false, 'error', 'invalid_data', 'message', v_why);
  end if;

  if p_current_step is not null and (
       jsonb_typeof(p_current_step) <> 'object'
       or octet_length(p_current_step::text) > 2000) then
    return jsonb_build_object('ok', false, 'error', 'invalid_data',
                              'message', 'current_step is not valid.');
  end if;

  -- Row is already locked by _alignment_auth (same transaction).
  select * into s from public.alignment_sessions where id = (a ->> 'id')::uuid;

  if p_expected_version is distinct from s.version then
    return jsonb_build_object(
      'ok', false,
      'conflict', true,
      'error', 'conflict',
      'data', s.data,
      'current_step', s.current_step,
      'version', s.version,
      'status', s.status,
      'updated_at', s.updated_at
    );
  end if;

  update public.alignment_sessions
     set data         = p_data,
         current_step = p_current_step,
         version      = s.version + 1,
         updated_at   = now(),
         status       = case
                          when s.status = 'complete' or coalesce(p_complete, false)
                            then 'complete'
                          else 'in_progress'
                        end,
         completed_at = case
                          when s.status = 'complete' then s.completed_at
                          when coalesce(p_complete, false) then now()
                          else null
                        end
   where id = s.id
   returning * into v_new;

  return jsonb_build_object(
    'ok', true,
    'version', v_new.version,
    'updated_at', v_new.updated_at,
    'status', v_new.status
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Admin helpers (Tim only, from the SQL editor)
-- -----------------------------------------------------------------------------
create or replace function public.alignment_disable(p_token text)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.alignment_sessions set link_disabled = true where token = p_token;
  if not found then
    return 'No session found for that token.';
  end if;
  return 'Link disabled.';
end;
$$;

-- Lists sessions without hashes or answers. Use: select * from alignment_list();
create or replace function public.alignment_list()
returns table (
  client_label     text,
  respondent_email text,
  status           text,
  updated_at       timestamptz,
  completed_at     timestamptz
)
language sql
security definer
set search_path = public
as $$
  select client_label, respondent_email, status, updated_at, completed_at
  from public.alignment_sessions
  order by updated_at desc;
$$;

-- -----------------------------------------------------------------------------
-- Who may call what
-- -----------------------------------------------------------------------------
revoke all on function public._alignment_auth(text, text, text)               from public, anon, authenticated;
revoke all on function public._alignment_validate(jsonb)                      from public, anon, authenticated;
revoke all on function public.create_alignment_session(text, text)            from public, anon, authenticated;
revoke all on function public.alignment_disable(text)                         from public, anon, authenticated;
revoke all on function public.alignment_list()                                from public, anon, authenticated;
revoke all on function public.alignment_open(text, text, text)                from public;
revoke all on function public.alignment_save(text, text, text, jsonb, jsonb, integer, boolean) from public;

grant execute on function public.alignment_open(text, text, text)                 to anon, authenticated;
grant execute on function public.alignment_save(text, text, text, jsonb, jsonb, integer, boolean) to anon, authenticated;
