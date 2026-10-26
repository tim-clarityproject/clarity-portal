-- =============================================================================
-- 022_alignment_open_returns_organisation.sql
-- Strategic Alignment Health Check: the outside page gets the organisation name
--
-- WHAT THIS DOES (plain English)
--   alignment_open (what the outside Health Check page calls with the link,
--   email and access code) now also returns client_label: the organisation
--   name entered when the Health Check was set up. The PDF uses it in the
--   details line, the running header, "Confidential: for <organisation>" and
--   the file name.
--
--   Nothing else changes. The same link, email and access code checks run
--   first (public._alignment_auth, unchanged), so a person only ever gets the
--   name for their own session, and only after those checks pass. Wrong
--   details still get the same answer as before, and nothing new is added to
--   that answer. No table, column, grant or other function changes.
--
-- SAFE TO RUN TWICE
--   It only replaces one function with the same name and inputs, so running
--   it again gives the same result. "create or replace" keeps the function's
--   existing grants (execute for anon and authenticated, from 018).
--
-- WHEN TO RUN
--   Test project: now (in the SQL editor of clarity-portal-test).
--   Live project: only at go-live, after the branch's code is live. (See
--   "Go-live notes" in CLAUDE.md.) The new code works with or without it:
--   without it, the PDF simply has no organisation name, as today.
-- =============================================================================

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
    'client_label', s.client_label
  );
end;
$$;
