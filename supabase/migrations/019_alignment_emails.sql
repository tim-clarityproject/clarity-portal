-- =============================================================================
-- 019_alignment_emails.sql
-- Strategic Alignment Health Check: emails (link to results, completion notice)
--
-- WHAT THIS DOES (plain English)
--   1. alignment_open and alignment_save now also return completed_at, so the
--      one-pager date comes from the server.
--   2. Adds two columns to alignment_sessions: notified_at (when Tim and AD were
--      told the check was completed) and link_emails (when a "link to your
--      results" email was sent, so it can be limited).
--   3. Adds alignment_email_check, which the server function calls before
--      sending any email. It checks the link, email and access code (with the
--      same lockout as the rest), enforces the limits (a link email at most 3
--      times per session per 24 hours; the completion notice once ever), and
--      hands back what the email needs. It never returns the access code.
--   4. Adds alignment_email_failed, called if the email provider failed, so the
--      send can be tried again (it undoes the record of that send).
--
-- HOW TO RUN
--   Run this whole file ONCE in the Supabase SQL editor, AFTER 018. Safe to run
--   again. Then run supabase/alignment_emails_test.sql to check it.
-- =============================================================================

alter table public.alignment_sessions add column if not exists notified_at timestamptz;
alter table public.alignment_sessions add column if not exists link_emails jsonb not null default '[]'::jsonb;

-- -----------------------------------------------------------------------------
-- alignment_open: same as 018, plus completed_at
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
    'completed_at', s.completed_at
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- alignment_save: same as 018, plus completed_at in the result
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
      'updated_at', s.updated_at,
      'completed_at', s.completed_at
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
    'status', v_new.status,
    'completed_at', v_new.completed_at
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- alignment_email_check: called by the server function before it sends mail.
--   p_kind 'link'     a link-to-your-results email to the session's own address
--                     (at most 3 per session in any 24 hours)
--   p_kind 'complete' the completion notice to Tim and AD (once ever)
-- -----------------------------------------------------------------------------
create or replace function public.alignment_email_check(
  p_token text,
  p_email text,
  p_code  text,
  p_kind  text
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  a      jsonb;
  s      public.alignment_sessions;
  recent jsonb;
begin
  if p_kind not in ('link', 'complete') then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  a := public._alignment_auth(p_token, p_email, p_code);
  if not (a ->> 'ok')::boolean then
    return a;
  end if;

  select * into s from public.alignment_sessions where id = (a ->> 'id')::uuid;

  if p_kind = 'link' then
    select coalesce(jsonb_agg(e), '[]'::jsonb) into recent
      from jsonb_array_elements_text(s.link_emails) as t(e)
     where e::timestamptz > now() - interval '24 hours';

    if jsonb_array_length(recent) >= 3 then
      return jsonb_build_object('ok', false, 'error', 'limit');
    end if;

    update public.alignment_sessions
       set link_emails = recent || to_jsonb(now()::text)
     where id = s.id;
  else
    if s.status <> 'complete' then
      return jsonb_build_object('ok', false, 'error', 'invalid');
    end if;
    if s.notified_at is not null then
      return jsonb_build_object('ok', false, 'error', 'already');
    end if;

    update public.alignment_sessions set notified_at = now() where id = s.id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'client_label', s.client_label,
    'respondent_email', s.respondent_email,
    'status', s.status,
    'completed_at', s.completed_at,
    'data', s.data
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- alignment_email_failed: the email provider failed, so undo the record of
-- that send and the person (or the completion notice) can try again.
-- -----------------------------------------------------------------------------
create or replace function public.alignment_email_failed(
  p_token text,
  p_email text,
  p_code  text,
  p_kind  text
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

  if p_kind = 'complete' then
    update public.alignment_sessions set notified_at = null where id = s.id;
  elsif p_kind = 'link' and jsonb_array_length(s.link_emails) > 0 then
    update public.alignment_sessions
       set link_emails = link_emails - (jsonb_array_length(link_emails) - 1)
     where id = s.id;
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

-- -----------------------------------------------------------------------------
-- Who may call what
-- -----------------------------------------------------------------------------
revoke all on function public.alignment_email_check(text, text, text, text)  from public;
revoke all on function public.alignment_email_failed(text, text, text, text) from public;
grant execute on function public.alignment_email_check(text, text, text, text)  to anon, authenticated;
grant execute on function public.alignment_email_failed(text, text, text, text) to anon, authenticated;

-- alignment_open and alignment_save keep the grants from 018 (create or replace
-- does not change them).
