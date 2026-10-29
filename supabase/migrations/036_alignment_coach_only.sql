-- =============================================================================
-- 036_alignment_coach_only.sql
-- Strategic Alignment Health Check: only the coach who sent the link sees the
-- answers (Tim, 29 Oct)
--
-- WHAT THIS DOES (plain English)
--   A person on Adie's link is told "Only you and Adie see your answers." This
--   makes that true.
--   1. Adds coach_user_id (may be empty) to alignment_sessions: the portal
--      account of the coach who made the link. If that account is ever
--      deleted, it goes back to empty.
--   2. Making a link fills it in, from the coach signed in or the coach email
--      given, found exactly as 034 finds the coach's first name:
--        select public.create_alignment_session('Acme Ltd', 'ceo@acme.com', 'coach@example.com');
--   3. Existing links are filled only where the coach is known for sure:
--      where created_by holds a portal account's id or email. Every other
--      older link stays empty, and goes to the owner as today.
--   4. Who can read a Health Check's answers:
--        the person who filled it in  (alignment_open, with their link, email
--                                      and access code, as before);
--        the coach who made the link  (new: alignment_coach_answers, signed in);
--        the owner                    only for older links with no coach
--                                      recorded (alignment_coach_answers);
--        nobody else. The server's key can no longer read the table directly
--        either: the table is closed to every role the app or the server use,
--        and is reached only through the checked functions.
--   5. The email server learns who gets which email from
--      alignment_recipients (the server's key only): the coach's address for a
--      coach's link, and nothing for an older link (the server then uses the
--      owner list, ALIGNMENT_NOTIFY_TO, as today). alignment_email_check says
--      only whether the link has a coach (has_coach), never who.
--   6. alignment_open names the coach (coach_name) only when the link has a
--      coach recorded, so an older link says "your coach" rather than naming
--      someone who may not be the one who gets the answers.
--   7. Closes again, on any database where they were left open, the admin
--      functions 018 and 034 closed (alignment_list and the rest).
--   8. The scoring methods version that new rows get is now 1.4 (Phase 1's
--      functions wrote 1.1). Rows already saved keep theirs. On a database
--      without Phase 1 (029 to 032) this part does nothing.
--   No coach's email is stored by this migration or returned to the page.
--
-- SAFE TO RUN TWICE
--   The column and index are added only if missing, the functions are
--   replaced with the same versions, the fill only touches empty rows, and
--   the revokes give the same result each time.
--
-- WHEN TO RUN
--   Test project: when Tim chooses, after 034. Live project: on release day,
--   after 034. Then set SUPABASE_SERVICE_ROLE_KEY in Vercel for the email
--   function. Test: supabase/036_alignment_coach_only_test.sql, which should
--   end with 036 CHECKS PASSED.
-- =============================================================================

alter table public.alignment_sessions
  add column if not exists coach_user_id uuid references auth.users (id) on delete set null;

comment on column public.alignment_sessions.coach_user_id is
  'The portal account of the coach who made the link (036). Only they see the answers. Empty: an older link, which goes to the owner.';

create index if not exists alignment_sessions_coach_user_idx on public.alignment_sessions (coach_user_id);

-- The table: reached only through the checked functions. 018 closed it to the
-- app's roles; this closes it to the server's key too.
alter table public.alignment_sessions enable row level security;
revoke all on table public.alignment_sessions from public, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Internal helper: the coach's account, from a signed-in coach or the account
-- with the given email. Null when neither is given. Raises when an email is
-- given but no account has it, so a typo is noticed (as 034).
-- -----------------------------------------------------------------------------
create or replace function public._alignment_coach_id(p_coach_email text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id uuid := (select auth.uid());
begin
  if v_id is null and btrim(coalesce(p_coach_email, '')) <> '' then
    select u.id into v_id from auth.users u where lower(u.email) = lower(btrim(p_coach_email)) limit 1;
    if v_id is null then
      raise exception 'No portal account has the coach email %.', btrim(p_coach_email);
    end if;
  end if;
  return v_id;
end;
$$;

revoke all on function public._alignment_coach_id(text) from public, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- create_alignment_session with the coach (Tim only): as 034, plus the
-- coach's account
-- -----------------------------------------------------------------------------
create or replace function public.create_alignment_session(
  p_client_label text,
  p_email        text,
  p_coach_email  text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; -- no 0 O 1 I L
  v_token    text;
  v_code     text := '';
  v_byte     integer;
  v_coach_id uuid;
  v_coach    text;
begin
  if btrim(coalesce(p_client_label, '')) = '' or btrim(coalesce(p_email, '')) = '' then
    raise exception 'Client label and email are both required.';
  end if;

  v_coach_id := public._alignment_coach_id(p_coach_email);
  if v_coach_id is not null then
    v_coach := public._alignment_first_name(v_coach_id);
  end if;

  -- 32 random bytes -> 43 URL-safe characters
  v_token := translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/=', '-_');
  v_token := regexp_replace(v_token, '\s', '', 'g');

  -- 6 characters, unbiased: skip bytes >= 248 (31 * 8)
  while char_length(v_code) < 6 loop
    v_byte := get_byte(extensions.gen_random_bytes(1), 0);
    if v_byte < 248 then
      v_code := v_code || substr(v_alphabet, (v_byte % 31) + 1, 1);
    end if;
  end loop;

  insert into public.alignment_sessions
    (token, access_code_hash, client_label, respondent_email, created_by, coach_name, coach_user_id)
  values
    (v_token, extensions.crypt(v_code, extensions.gen_salt('bf')), btrim(p_client_label),
     lower(btrim(p_email)), session_user, v_coach, v_coach_id);

  return jsonb_build_object(
    'token', v_token,
    'access_code', v_code,
    'link_path', '/health-check/' || v_token,
    'coach_name', v_coach,
    'coach_recorded', v_coach_id is not null,
    'note', 'The access code is shown once and is not stored. Copy it now.'
  );
end;
$$;

revoke all on function public.create_alignment_session(text, text, text) from public, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- alignment_open: as 034, but the coach is named only when the link has a
-- coach recorded
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
    'coach_name', case when s.coach_user_id is not null then s.coach_name end
  );
end;
$$;

revoke all on function public.alignment_open(text, text, text) from public;
grant execute on function public.alignment_open(text, text, text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- alignment_email_check: as 019, plus has_coach (whether the link has a
-- coach recorded; never who)
-- -----------------------------------------------------------------------------
create or replace function public.alignment_email_check(
  p_token text,
  p_email text,
  p_code  text,
  p_kind  text
) returns jsonb
language plpgsql
security definer
set search_path = ''
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
    'data', s.data,
    'has_coach', s.coach_user_id is not null
  );
end;
$$;

revoke all on function public.alignment_email_check(text, text, text, text) from public;
grant execute on function public.alignment_email_check(text, text, text, text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- alignment_recipients (the email server only, with the server's key): the
-- address of the coach who made the link, or null for an older link (the
-- server then uses the owner list). No answers.
-- -----------------------------------------------------------------------------
create or replace function public.alignment_recipients(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role  text := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '');
  v_coach uuid;
begin
  -- the server (service role), or Tim in the SQL editor (no caller's claims)
  if not (v_role = 'service_role' or (v_role = '' and (select auth.uid()) is null)) then
    raise exception 'Only the email server can do this.' using errcode = '42501';
  end if;

  select s.coach_user_id into v_coach
    from public.alignment_sessions s
   where s.token = coalesce(p_token, '');
  if not found then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  return jsonb_build_object(
    'ok', true,
    'coach_email', (select u.email from auth.users u where u.id = v_coach)
  );
end;
$$;

revoke all on function public.alignment_recipients(text) from public, anon, authenticated;
grant execute on function public.alignment_recipients(text) to service_role;

-- -----------------------------------------------------------------------------
-- alignment_coach_answers (signed in): a Health Check's answers, only for the
-- coach who made the link, or the owner for an older link with no coach
-- recorded. Everyone else gets the same answer as a link that isn't there.
-- -----------------------------------------------------------------------------
create or replace function public.alignment_coach_answers(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me    uuid := (select auth.uid());
  v_owner boolean := false;
  s       public.alignment_sessions;
begin
  select * into s from public.alignment_sessions where token = coalesce(p_token, '');
  if v_me is null or not found then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  if s.coach_user_id is null and to_regprocedure('public.is_owner()') is not null then
    execute 'select public.is_owner()' into v_owner;
  end if;

  if s.coach_user_id is distinct from v_me and not (s.coach_user_id is null and v_owner) then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  return jsonb_build_object(
    'ok', true,
    'client_label', s.client_label,
    'respondent_email', s.respondent_email,
    'status', s.status,
    'updated_at', s.updated_at,
    'completed_at', s.completed_at,
    'data', s.data
  );
end;
$$;

revoke all on function public.alignment_coach_answers(text) from public, anon, authenticated, service_role;
grant execute on function public.alignment_coach_answers(text) to authenticated;

-- -----------------------------------------------------------------------------
-- Existing links: filled only where the coach who made them is known for
-- sure (created_by holds exactly one portal account's id or email)
-- -----------------------------------------------------------------------------
update public.alignment_sessions s
   set coach_user_id = u.id
  from auth.users u
 where s.coach_user_id is null
   and (s.created_by = u.id::text or lower(s.created_by) = lower(u.email))
   and (select count(*) from auth.users x
         where s.created_by = x.id::text or lower(s.created_by) = lower(x.email)) = 1;

-- -----------------------------------------------------------------------------
-- Who may call what: the admin functions stay Tim only (018 and 034), closed
-- again here wherever a database had them open
-- -----------------------------------------------------------------------------
revoke all on function public.alignment_list()                     from public, anon, authenticated;
revoke all on function public.alignment_disable(text)              from public, anon, authenticated;
revoke all on function public._alignment_auth(text, text, text)    from public, anon, authenticated;
revoke all on function public._alignment_validate(jsonb)           from public, anon, authenticated;
revoke all on function public.create_alignment_session(text, text) from public, anon, authenticated;
revoke all on function public._alignment_coach_name(text)          from public, anon, authenticated;
revoke all on function public._alignment_first_name(uuid)          from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- The scoring methods version new rows get: 1.4 (docs/scoring-methods.md,
-- Health Check 3). Phase 1's functions wrote '1.1'. Only what new rows get
-- changes: a check-in saved from now on (029's checkins_score), a week frozen
-- (032's freeze_week), a sprint summary made (032's make_one_sprint_summary),
-- and what org_figures reports. Rows already saved keep the version they were
-- scored under, so nothing existing is updated. No column has a default
-- version, so there is no default to change. Each function is 029's or 032's
-- exactly, apart from the version. On a database without Phase 1 (029 to
-- 032, for example the release branch's), this section does nothing.
-- -----------------------------------------------------------------------------
do $methods$
begin
  -- checkins_score(), from 029
  if to_regprocedure('public.checkins_score()') is not null then
    execute $def$
create or replace function public.checkins_score()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  k text;
  s jsonb;
begin
  for k in select jsonb_object_keys(new.answers) loop
    if k !~ '^(H([1-9]|1[0-6])|S[1-6])$' then
      raise exception 'Unknown question %', k using errcode = '22023';
    end if;
    if k = 'H14' and new.answers ->> k not in ('yes', 'no') then
      raise exception 'H14 is yes or no' using errcode = '22023';
    elsif k = 'H15' and (new.answers ->> k) !~ '^[0-9]{1,2}$' then
      raise exception 'H15 is a number of trips' using errcode = '22023';
    elsif k = 'H16' and char_length(new.answers ->> k) > 30 then
      raise exception 'H16 is one option' using errcode = '22023';
    end if;
    perform public.score_m13_points(k, new.answers ->> k);
  end loop;
  if new.goals is not null then
    for k in select jsonb_object_keys(new.goals) loop
      if k not in ('G1', 'G2', 'G3', 'G4', 'G5') then
        raise exception 'Unknown goal %', k using errcode = '22023';
      end if;
    end loop;
    if pg_column_size(new.goals) > 20000 then
      raise exception 'The goals are too long.' using errcode = '22023';
    end if;
  end if;
  s := public.score_m13_checkin(new.answers);
  new.hardware_score := (s ->> 'hardware')::numeric;
  new.software_score := (s ->> 'software')::numeric;
  new.area_scores := jsonb_build_object('hardware', s -> 'hardwareAreas', 'software', s -> 'softwareAreas');
  new.methods_version := '1.4';
  if new.status = 'finished' and new.finished_at is null then
    new.finished_at := now();
  end if;
  return new;
end;
$$;
$def$;
  end if;
  -- freeze_week(uuid,integer), from 032
  if to_regprocedure('public.freeze_week(uuid,integer)') is not null then
    execute $def$
create or replace function public.freeze_week(p_sprint uuid, p_week integer)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.sprints;
  today date;
  inp jsonb;
  res jsonb;
  deb public.weekly_debriefs;
  logged integer;
  eligible boolean;
begin
  select * into s from public.sprints where id = p_sprint;
  if not found or not public.acts_for(s.user_id) then
    raise exception 'That sprint isn''t yours.' using errcode = '42501';
  end if;
  today := public.person_today(s.user_id);
  inp := public.week_input(p_sprint, p_week, today, false);
  if inp is null or not (inp ->> 'finished')::boolean then
    return null;
  end if;
  res := public.score_week_raw(inp);
  select * into deb from public.weekly_debriefs where sprint_id = p_sprint and sprint_week = p_week;
  select count(distinct l.local_date) into logged
    from public.habit_logs l join public.sprint_habits sh on sh.id = l.sprint_habit_id
   where sh.sprint_id = p_sprint and not l.to_confirm
     and l.local_date between (inp -> 'week' ->> 'start')::date and (inp -> 'week' ->> 'end')::date;
  eligible := (inp ->> 'recoveryDaysInside')::integer < 4 and not coalesce(deb.unusual, false)
              and logged >= least(4, jsonb_array_length(inp -> 'workingDays'));
  insert into public.week_scores (user_id, sprint_id, sprint_week, week_start, week_end, score, strategy_scores, eligible, final, methods_version, frozen_at)
  values (s.user_id, p_sprint, p_week, (inp -> 'week' ->> 'start')::date, (inp -> 'week' ->> 'end')::date,
          (res ->> 'score')::numeric, res -> 'strategies', eligible,
          coalesce(deb.status = 'finished', false) or today > (inp -> 'week' ->> 'end')::date + 3, '1.4', now())
  on conflict (sprint_id, sprint_week) do update
    set score = excluded.score, strategy_scores = excluded.strategy_scores, eligible = excluded.eligible,
        final = excluded.final, methods_version = excluded.methods_version, frozen_at = excluded.frozen_at;
  return (res ->> 'score')::numeric;
end;
$$;
$def$;
  end if;
  -- make_one_sprint_summary(uuid,uuid,date), from 032
  if to_regprocedure('public.make_one_sprint_summary(uuid,uuid,date)') is not null then
    execute $def$
create or replace function public.make_one_sprint_summary(p_sprint uuid, p_member uuid, p_ends date)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.sprints;
  m public.organisation_members;
  today date;
  cal jsonb;
  ends date := p_ends;
  w jsonb;
  objectives jsonb;
  strategies jsonb;
  avg_score numeric;
  new_id uuid;
begin
  select * into s from public.sprints where id = p_sprint;
  select * into m from public.organisation_members where id = p_member;
  select id into new_id from public.sprint_summaries where sprint_id = p_sprint and member_id = p_member;
  if new_id is not null then
    return new_id;
  end if;
  today := public.person_today(s.user_id);
  cal := public.sprint_calendar(p_sprint, today);
  for w in select * from jsonb_array_elements(cal -> 'weeks') loop
    if (w ->> 'finished')::boolean then
      perform public.freeze_week(p_sprint, (w ->> 'number')::integer);
    end if;
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', o.id, 'name', o.name, 'source', o.source, 'kind', o.kind, 'unit', o.unit, 'direction', o.direction,
           'start', o.start_value, 'target', o.target_value, 'byWhen', o.by_when, 'dueOn', o.due_on)
           || (public.score_m9_objective(public.objective_input(o.id), least(ends, today), s.start_on)
               - 'paceShown' - 'tooEarly' - 'rateSoFar' - 'rateNeeded') order by o.sort_order, o.created_at), '[]')
    into objectives
    from public.outcome_objectives o
   where o.plan_id = s.plan_id and o.source in ('organisation', 'development') and o.archived_at is null
     and o.organisation_id = m.organisation_id;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', ps.id, 'name', ps.name,
           'serves', (select jsonb_agg(so.objective_id) from public.strategy_objectives so
                      where so.strategy_id = ps.id and so.objective_id in (select (x ->> 'id')::uuid from jsonb_array_elements(objectives) x)),
           'average', (select avg((e ->> 'score')::numeric) from public.week_scores ws, jsonb_array_elements(ws.strategy_scores) e
                       where ws.sprint_id = p_sprint and e ->> 'id' = ps.id::text and e -> 'score' is not null and jsonb_typeof(e -> 'score') <> 'null'))
           order by ps.sort_order, ps.created_at), '[]')
    into strategies
    from public.plan_strategies ps
   where ps.plan_id = s.plan_id
     and exists (select 1 from public.strategy_objectives so where so.strategy_id = ps.id
                 and so.objective_id in (select (x ->> 'id')::uuid from jsonb_array_elements(objectives) x));
  select avg(ws.score) into avg_score from public.week_scores ws where ws.sprint_id = p_sprint and ws.score is not null;
  insert into public.sprint_summaries (user_id, sprint_id, member_id, organisation_id, team_ids, sprint_number, sprint_start, sprint_end,
                                       summary, methods_version, sprint_average, standard)
  values (s.user_id, p_sprint, m.id, m.organisation_id,
          coalesce((select array_agg(tm.team_id) from public.team_members tm where tm.member_id = m.id and tm.ended_on is null), '{}'),
          s.number, s.start_on, ends,
          jsonb_build_object('objectives', objectives, 'strategies', strategies), '1.4', avg_score, s.standard)
  on conflict (sprint_id, member_id) do nothing
  returning id into new_id;
  return new_id;
end;
$$;
$def$;
  end if;
  -- org_figures(uuid), from 032
  if to_regprocedure('public.org_figures(uuid)') is not null then
    execute $def$
create or replace function public.org_figures(p_team uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  scope uuid[] := array(select public.my_leader_team_ids());
  grp uuid[];
  seats jsonb;
  leavers jsonb;
  impact jsonb;
  goal jsonb;
  small boolean;
  res jsonb;
begin
  if (select auth.uid()) is null or cardinality(scope) = 0 then
    raise exception 'Only a leader sees organisation figures.' using errcode = '42501';
  end if;
  if p_team is not null and not (p_team = any (scope)) then
    raise exception 'That team isn''t one you lead.' using errcode = '42501';
  end if;
  grp := case when p_team is null then scope
              else array(with recursive below as (select p_team as id union select t.id from public.teams t join below b on t.parent_team_id = b.id)
                         select id from below) end;
  -- current, confirmed seats in the group
  select coalesce(jsonb_agg(jsonb_build_object(
           'current', true,
           'hasPlan', exists (select 1 from public.performance_plans p where p.user_id = m.user_id and p.status = 'active'
                                and coalesce(btrim(p.mission), '') <> ''
                                and (select count(*) from public.outcome_objectives o where o.plan_id = p.id and o.archived_at is null) >= 2
                                and exists (select 1 from public.plan_strategies ps where ps.plan_id = p.id and ps.archived_at is null)),
           'sprintRunning', exists (select 1 from public.sprints sp where sp.user_id = m.user_id and sp.status = 'running'),
           'finishedSeatWeeks', (select count(*) from public.week_scores ws where ws.user_id = m.user_id and ws.week_end >= current_date - 84),
           'debriefsDone', (select count(*) from public.week_scores ws join public.weekly_debriefs d on d.sprint_id = ws.sprint_id and d.sprint_week = ws.sprint_week
                            where ws.user_id = m.user_id and ws.week_end >= current_date - 84 and d.status = 'finished'),
           'summary', (select jsonb_build_object('objectives', ss.summary -> 'objectives', 'strategies', ss.summary -> 'strategies',
                                                 'averageScore', ss.sprint_average, 'standard', ss.standard)
                       from public.sprint_summaries ss where ss.member_id = m.id order by ss.sprint_end desc limit 1))), '[]')
    into seats
    from public.organisation_members m
   where m.ended_on is null and m.confirmed_at is not null and m.has_seat
     and exists (select 1 from public.team_members tm where tm.member_id = m.id and tm.ended_on is null and tm.team_id = any (grp));
  -- people who have left: their latest summary made in these teams, anonymised
  select coalesce(jsonb_agg(jsonb_build_object('current', false, 'summary', x.summary)), '[]') into leavers
    from (select distinct on (ss.member_id)
                 jsonb_build_object('objectives', ss.summary -> 'objectives', 'strategies', ss.summary -> 'strategies',
                                    'averageScore', ss.sprint_average, 'standard', ss.standard) as summary
            from public.sprint_summaries ss join public.organisation_members m on m.id = ss.member_id
           where m.ended_on is not null and ss.team_ids && grp
           order by ss.member_id, ss.sprint_end desc) x;
  -- before and after impact, one result per current seat (anonymous totals)
  select coalesce(jsonb_agg(public.impact_result_for(m.user_id)), '[]') into impact
    from public.organisation_members m
   where m.ended_on is null and m.confirmed_at is not null and m.has_seat
     and exists (select 1 from public.team_members tm where tm.member_id = m.id and tm.ended_on is null and tm.team_id = any (grp));
  -- goal checks on organisation objectives: the latest for each, anonymous totals
  select coalesce(jsonb_agg(jsonb_build_object('reading', public.score_m15_reading(g.enjoy, g.matters, g.guilty, g.someone_else))), '[]') into goal
    from (select distinct on (g.objective_id) g.* from public.goal_checks g
            join public.outcome_objectives o on o.id = g.objective_id and o.source in ('organisation', 'development') and o.archived_at is null
            join public.organisation_members m on m.user_id = o.user_id and m.organisation_id = o.organisation_id
                                               and m.ended_on is null and m.confirmed_at is not null
           where exists (select 1 from public.team_members tm where tm.member_id = m.id and tm.ended_on is null and tm.team_id = any (grp))
           order by g.objective_id, g.checked_on desc, g.created_at desc) g;
  -- No subtraction: if this group minus any team below it would leave 1 or
  -- 2 seats, the per-person figures stay hidden here too (the use figures,
  -- the share at their own standard and impact), as for a group under 3.
  select exists (
    with seat_teams as (
      select distinct m.id as member, tm.team_id
      from public.organisation_members m
      join public.team_members tm on tm.member_id = m.id and tm.ended_on is null and tm.team_id = any (grp)
      where m.ended_on is null and m.confirmed_at is not null and m.has_seat),
    total as (select count(distinct member) as n from seat_teams)
    select 1 from unnest(grp) t, total
    where total.n - (select count(distinct st.member) from seat_teams st
                     where st.team_id in (with recursive below as (select t as id union select x.id from public.teams x join below b on x.parent_team_id = b.id)
                                          select id from below)) between 1 and 2
  ) into small;
  res := public.score_m19_group(seats || leavers, impact, goal);
  if small then
    res := jsonb_set(jsonb_set(res, '{use}', 'null'), '{behaviour,atOwnStandard}', 'null')
           || jsonb_build_object('outcomes', (res -> 'outcomes') || '{"impactPeople": null, "impactAverageChange": null, "impactImproved": null}');
  end if;
  return res || jsonb_build_object('teams', cardinality(grp), 'methodsVersion', '1.4', 'asAt', 'As at each person''s last finished sprint.');
end;
$$;
$def$;
  end if;
end;
$methods$;

-- Records itself where the migration log (025) is there; on a database
-- without it yet, this does nothing rather than stop the migration.
do $$
begin
  if to_regprocedure('public.record_migration(integer,text)') is not null then
    perform public.record_migration(36, '036_alignment_coach_only');
  end if;
end;
$$;
