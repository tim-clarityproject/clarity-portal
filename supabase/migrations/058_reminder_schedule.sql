-- =============================================================================
-- 058_reminder_schedule.sql
-- Tidy pass follow-up 3 (23 Nov 2026). Two things, both additive.
--
-- WHAT THIS DOES (plain English)
--
-- 1. The reminders run from the database's own clock (Tim's answer to run 6's
--    17: no paid plan of any kind). Every 15 minutes Supabase's scheduler
--    (pg_cron) asks the live site's two reminder addresses, through pg_net:
--      /api/coach-reminders   a call's day-before and 1-hour reminders (051)
--      /api/workshop-emails   a workshop's day-before and 1-hour reminders (050)
--    each with the header  Authorization: Bearer <CRON_SECRET>.
--    The secret and the live address are read from Supabase Vault by name
--    when the job runs, never written here:
--      clarity_cron_secret   the same value as CRON_SECRET on Vercel (Production)
--      clarity_live_url      https://portal.theclarityproject.co.uk
--    With either missing the job does nothing (and says so in its notice).
--    Only the live site sends: the two addresses send only on the live site's
--    own deployment (maySend: Vercel's production), only to a caller with the
--    secret (anything else is answered 401), and a preview answers "preview"
--    without asking the database anything.
--    Nothing ever goes twice: each address claims a reminder in the database
--    BEFORE it emails (051's cal_reminder_claim, 050's workshop_send_claim:
--    one insert against a unique key, "on conflict do nothing", which answers
--    false to the second of two runs that overlap), so two runs at once, or a
--    run retried, send each reminder once at most.
--    Where pg_cron, pg_net or Vault aren't there (a local stand-in), nothing is
--    scheduled and a notice says so: the rest of 058 still runs.
--
-- 2. The owner sees an associate's coaching sessions, and only those (Tim's
--    answer to run 6's 25, as run 3's prompt said): one function,
--    coach_associate_sessions(p_from, p_to), gives the owner each associate's
--    sessions between two moments with their time, length, kind, the client's
--    (or group's) name and the coach's first name. Never a calendar item, a
--    note, a recap, a place or anything else: an associate's calendar stays
--    theirs alone (051's rules are unchanged). Only for the owner with the
--    6-digit code given (054); anyone else gets nothing. Sessions moved or
--    cancelled late are left out; at most 63 days and 2,000 sessions a call.
--
-- 3. A coach's suggested own question shows only while that coach still
--    coaches the client (run 7's 4; written by helper 2 of this run): the
--    client's read rule on own_question_suggestions asks
--    own_suggestion_coach_current(coach). Nothing is deleted; a waiting
--    suggestion comes back if the same coach coaches the client again.
--
-- WHO SEES WHAT
--   run_reminder_jobs() and _reminder_jobs_send() can be run by the database's
--   own scheduler only (no execute for PUBLIC, anon, authenticated or
--   service_role). coach_associate_sessions() is closed to anyone signed out.
--   own_suggestion_coach_current() is closed to anyone signed out. One rule
--   changes: "Own rows: read" on own_question_suggestions (055) now also asks
--   that the suggesting coach still coaches the client. No table, column or
--   data changes.
--
-- Additive and safe to run twice. Needs 049, 050, 051, 054 and 055 (stops
-- without them). Run after 057.
-- Tests: supabase/058_reminder_schedule_test.sql, then
-- supabase/058_reminder_schedule_suggestions_test.sql.
-- =============================================================================

do $$
begin
  if to_regclass('public.coach_sessions') is null
     or to_regclass('public.coach_cal_reminder_sends') is null
     or to_regprocedure('public.coach_code_ok()') is null
     or to_regprocedure('public.is_owner()') is null
     or to_regprocedure('public.my_coach_id()') is null
     or to_regclass('public.own_question_suggestions') is null then
    raise exception '058 needs 049, 050, 051, 054 and 055 first.';
  end if;
end
$$;

-- ---------------------------------------------------------------- 1. the reminders' schedule

-- pg_cron and pg_net, where this database offers them (Supabase does). A database without them (a local stand-in)
-- carries on without: the job below is then not scheduled.
do $$
begin
  if to_regnamespace('cron') is null and exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    begin
      create extension if not exists pg_cron with schema pg_catalog;
    exception when others then
      raise notice '058: pg_cron couldn''t be turned on here (%), so the reminders aren''t scheduled. Turn it on under Database, Extensions and run 058 again.', sqlerrm;
    end;
  end if;
  if to_regnamespace('net') is null and exists (select 1 from pg_available_extensions where name = 'pg_net') then
    begin
      create extension if not exists pg_net with schema extensions;
    exception when others then
      raise notice '058: pg_net couldn''t be turned on here (%). Turn it on under Database, Extensions and run 058 again.', sqlerrm;
    end;
  end if;
end
$$;

-- The two calls, to one address and with one secret. It asks nothing of a base that isn't https:// and a host with no
-- path, or a secret shorter than 16 characters (the reminder addresses refuse those anyway). pg_net queues each call
-- and sends it once this transaction has committed; the answers are kept for a while in net._http_response.
-- Returns how many calls were queued: 2, or 0.
create or replace function public._reminder_jobs_send(p_base text, p_secret text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_base text := btrim(coalesce(p_base, ''));
  v_head jsonb;
  v_path text;
begin
  if to_regnamespace('net') is null then
    raise notice '058: pg_net isn''t on this database, so no reminder address was asked.';
    return 0;
  end if;
  v_base := lower(regexp_replace(v_base, '/+$', '')); -- a host in capitals (Portal.TheClarityProject.co.uk) is the same address
  if v_base !~ '^https://[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'
     or char_length(coalesce(p_secret, '')) < 16 or p_secret ~ '\s' then
    raise notice '058: the live address or the secret in Vault isn''t usable, so no reminder address was asked.';
    return 0;
  end if;
  v_head := jsonb_build_object('Authorization', 'Bearer ' || p_secret);
  foreach v_path in array array['/api/coach-reminders', '/api/workshop-emails'] loop
    execute 'select net.http_get(url := $1, headers := $2, timeout_milliseconds := $3)' using v_base || v_path, v_head, 55000;
  end loop;
  return 2;
end;
$$;
comment on function public._reminder_jobs_send(text, text) is
  'The reminders'' two calls (058): GET <base>/api/coach-reminders and <base>/api/workshop-emails with Authorization: Bearer <secret>, through pg_net. The scheduler''s alone.';
revoke all on function public._reminder_jobs_send(text, text) from public, anon, authenticated, service_role;

-- What the scheduler runs every 15 minutes: reads the secret and the live address from Vault by name, then asks the
-- two addresses. Nothing at all without Vault, without either secret, or without pg_net. Returns how many calls were
-- queued.
create or replace function public.run_reminder_jobs()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret text;
  v_base text;
begin
  if to_regclass('vault.decrypted_secrets') is null then
    raise notice '058: Vault isn''t on this database, so the reminders weren''t asked for.';
    return 0;
  end if;
  execute 'select (select decrypted_secret from vault.decrypted_secrets where name = $1 order by created_at desc limit 1),
                  (select decrypted_secret from vault.decrypted_secrets where name = $2 order by created_at desc limit 1)'
    into v_secret, v_base using 'clarity_cron_secret', 'clarity_live_url';
  if v_secret is null or v_base is null then
    raise notice '058: clarity_cron_secret or clarity_live_url isn''t in Vault yet, so the reminders weren''t asked for.';
    return 0;
  end if;
  return public._reminder_jobs_send(v_base, v_secret);
end;
$$;
comment on function public.run_reminder_jobs() is
  'Run by pg_cron every 15 minutes (058): asks the live site for the due booking and workshop reminders, with the secret and the address from Vault (clarity_cron_secret, clarity_live_url). Each reminder is claimed in the database before it is sent, so it never goes twice.';
revoke all on function public.run_reminder_jobs() from public, anon, authenticated, service_role;

-- The job itself: one, named, every 15 minutes. Made again (never a second) when 058 runs again.
do $$
declare
  v_id bigint;
begin
  if to_regnamespace('cron') is null or to_regprocedure('cron.schedule(text,text,text)') is null then
    raise notice '058: pg_cron isn''t on this database, so the reminders aren''t scheduled here.';
    return;
  end if;
  for v_id in execute 'select jobid from cron.job where jobname = $1' using 'clarity-reminders' loop
    execute 'select cron.unschedule($1::bigint)' using v_id;
  end loop;
  execute 'select cron.schedule($1, $2, $3)' using 'clarity-reminders', '*/15 * * * *', 'select public.run_reminder_jobs()';
  raise notice '058: the reminders run every 15 minutes (cron job clarity-reminders).';
end
$$;

-- ---------------------------------------------------------------- 2. an associate's sessions, for the owner

create or replace function public.coach_associate_sessions(p_from timestamptz, p_to timestamptz)
returns table (id uuid, coach_id uuid, coach_first_name text, starts_at timestamptz, minutes integer, kind text, client_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  -- The owner only, with the 6-digit code given (054): anyone else, or the owner at aal1, gets nothing.
  if not public.coach_code_ok() or not coalesce(public.is_owner(), false) then
    return;
  end if;
  if p_from is null or p_to is null or p_to <= p_from then
    return;
  end if;
  return query
    select s.id, s.coach_id, c.display_first_name, s.starts_at, s.minutes, s.kind, coalesce(p.name, g.name)
    from public.coach_sessions s
    join public.coaches c on c.id = s.coach_id
    left join public.client_profiles p on p.id = s.profile_id
    left join public.coach_groups g on g.id = s.group_id
    where s.coach_id is distinct from public.my_coach_id()
      and s.starts_at >= p_from
      and s.starts_at < least(p_to, p_from + interval '63 days')
      and (s.outcome is null or s.outcome in ('held', 'no_show'))
    order by s.starts_at, s.id
    limit 2000;
end;
$$;
comment on function public.coach_associate_sessions(timestamptz, timestamptz) is
  'The owner''s view of associates'' coaching sessions (058; Tim''s answer to run 6''s 25): time, length, kind, the client''s or group''s name and the coach''s first name, never a calendar item or anything written. The owner only, with the 6-digit code; at most 63 days and 2,000 a call.';
revoke all on function public.coach_associate_sessions(timestamptz, timestamptz) from public, anon;
grant execute on function public.coach_associate_sessions(timestamptz, timestamptz) to authenticated;

-- ---------------------------------------------------------------- 3. a suggestion goes with its coach
-- (Tidy follow-up 3, run 7's 4; helper 2.) A coach's suggested question
-- shows only while that coach still coaches the client: once the coaching
-- ends (055's coach_clients.ended_at) or the coach is no longer active, the
-- client no longer reads it, so it leaves Settings and Home. Nothing is
-- deleted: if the same coach coaches the client again, a waiting suggestion
-- comes back. The client's own questions, including one added from a
-- suggestion, are never touched.
create or replace function public.own_suggestion_coach_current(p_coach_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.coach_clients cc
    join public.coaches c on c.id = cc.coach_id
    where cc.client_id = (select auth.uid()) and cc.ended_at is null
      and c.user_id = p_coach_user and c.active
  );
$$;
comment on function public.own_suggestion_coach_current(uuid) is
  'True while the signed-in client is still coached by this coach (058, run 7''s 4): own_question_suggestions are read only then.';
revoke all on function public.own_suggestion_coach_current(uuid) from public, anon;
grant execute on function public.own_suggestion_coach_current(uuid) to authenticated;

drop policy if exists "Own rows: read" on public.own_question_suggestions;
create policy "Own rows: read" on public.own_question_suggestions for select to authenticated
  using (user_id = (select auth.uid()) and public.own_suggestion_coach_current(coach_user_id));

select public.record_migration(58, '058_reminder_schedule');
