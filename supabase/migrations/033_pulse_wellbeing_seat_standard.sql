-- =============================================================================
-- 033_pulse_wellbeing_seat_standard.sql
-- Phase 1 step 4: Tim's answers of 27 Oct 2026 (methods version 1.2)
--
-- WHAT THIS DOES (plain English)
--   1. Team pulse (methods M18; Tim, 27 Oct, 14:20)
--      A boss sees a pulse's results (the measures, their own questions and
--      the comments) only once it has closed, and only with 3 or more
--      answers. With fewer, they see only how many answered. Named answers
--      still show one by one as they come in. Every other way to read a
--      pulse early is closed:
--        - pulse_results checks both rules (public.score_m18_shown);
--        - its "change since last time" uses the last pulse only if that
--          pulse's results showed too;
--        - the number of answers (feedback_my_requests) is hidden until the
--          pulse closes, so a boss can't watch it go up;
--        - a pulse can't be extended or reopened, so nobody can read the
--          totals, reopen it, and work out the next person's answers;
--        - when only 1 or 2 people stayed anonymous beside named answers,
--          the totals would give their answers away, so the results stay
--          private then too (Claude).
--      A pulse is open for 7 days, or less if the boss chooses. The stress
--      question is stored as before ('stress') and named Calm (higher is
--      calmer) wherever the database names the measures.
--
-- SAFE TO RUN TWICE
--   Yes. Constraints are added only where missing; functions are replaced
--   with the same versions.
--
-- HOW TO RUN
--   After 032. Then run supabase/033_pulse_wellbeing_seat_standard_test.sql.
-- =============================================================================

-- ---------------------------------------------------------------- 1. team pulse
-- Open for 7 days at most. Checked on every new or changed pulse; pulses
-- sent before this ran are left as they were.
do $c$
begin
  if not exists (select 1 from pg_constraint where conname = 'pulse_sends_open_7_days') then
    alter table public.pulse_sends
      add constraint pulse_sends_open_7_days check (closes_at <= opens_at + interval '7 days') not valid;
  end if;
end
$c$;

-- When results show, as m18ResultsShown (src/lib/scores/m18.js), tested on
-- the same cases: once closed, with 3 or more answers, and not when only 1
-- or 2 of them stayed anonymous beside named answers. The number of answers
-- shows only once the pulse has closed.
create or replace function public.score_m18_shown(p_closed boolean, p_answers integer, p_named integer)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case
    when not coalesce(p_closed, false) then jsonb_build_object('shown', false, 'reason', 'open', 'answers', null)
    when coalesce(p_answers, 0) < 3 then jsonb_build_object('shown', false, 'reason', 'too_few', 'answers', coalesce(p_answers, 0))
    when p_answers - coalesce(p_named, 0) between 1 and 2 then jsonb_build_object('shown', false, 'reason', 'too_few_anonymous', 'answers', p_answers)
    else jsonb_build_object('shown', true, 'reason', null, 'answers', p_answers)
  end;
$$;

-- Has this request closed for good? Switched off, past its end, or full. A
-- pulse can't be extended or reopened (below), so once closed it stays
-- closed and its results can't change.
create or replace function public.pulse_request_closed(p_request uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select r.switched_off_at is not null or now() >= r.expires_at
         or (select count(*) from public.feedback_answers a where a.request_id = r.id) >= r.max_answers
  from public.feedback_requests r where r.id = p_request;
$$;

-- score_m18_shown for one request, from its answers.
create or replace function public.pulse_shown(p_request uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public.score_m18_shown(coalesce(public.pulse_request_closed(p_request), false),
                                (select count(*)::integer from public.feedback_answers a where a.request_id = p_request),
                                (select count(*)::integer from public.feedback_answers a where a.request_id = p_request and a.name_added));
$$;
revoke all on function public.pulse_request_closed(uuid) from public, anon, authenticated;
revoke all on function public.pulse_shown(uuid) from public, anon, authenticated;
revoke all on function public.score_m18_shown(boolean, integer, integer) from public, anon;
grant execute on function public.score_m18_shown(boolean, integer, integer) to authenticated;

-- A boss sends a pulse: one link for the team, open for 7 days unless they
-- choose a shorter time (no end given means 7 days).
create or replace function public.pulse_send_create(p_kind text, p_went_to integer, p_opens_at timestamptz, p_closes_at timestamptz,
                                                    p_own_questions jsonb default '[]'::jsonb)
returns table (send_id uuid, token text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  req record;
  q jsonb;
  days integer;
  opens timestamptz := coalesce(p_opens_at, now());
  closes timestamptz := coalesce(p_closes_at, coalesce(p_opens_at, now()) + interval '7 days');
begin
  if p_kind not in ('short', 'full_checkin') then
    raise exception 'A pulse is short or the full check-in.' using errcode = '22023';
  end if;
  if p_own_questions is null or jsonb_typeof(p_own_questions) <> 'array' or jsonb_array_length(p_own_questions) > 3 then
    raise exception 'Up to 3 of your own questions.' using errcode = '22023';
  end if;
  for q in select * from jsonb_array_elements(p_own_questions) loop
    if q ->> 'kind' not in ('rating', 'text') or coalesce(char_length(btrim(q ->> 'text')), 0) not between 1 and 200
       or coalesce(q ->> 'id', '') !~ '^[a-z0-9_]{1,20}$' then
      raise exception 'Each question needs an id, a kind (rating or text) and up to 200 characters.' using errcode = '22023';
    end if;
  end loop;
  if closes <= opens then
    raise exception 'A pulse closes after it opens.' using errcode = '22023';
  end if;
  if closes > opens + interval '7 days' then
    raise exception 'A pulse stays open for up to 7 days.' using errcode = '22023';
  end if;
  days := greatest(1, ceil(extract(epoch from (closes - opens)) / 86400)::integer);
  -- The full check-in's questions are added as data when the pulse is built
  -- (tool team_checkin); until then sending one is refused.
  select * into req from public.feedback_request_create(
    case when p_kind = 'short' then 'team_pulse' else 'team_checkin' end, null, p_went_to, false, days, opens, null);
  update public.feedback_requests set expires_at = closes where id = req.request_id;
  insert into public.pulse_sends (boss_id, kind, request_id, own_questions, went_to, opens_at, closes_at)
  values ((select auth.uid()), p_kind, req.request_id, p_own_questions, p_went_to, opens, closes)
  returning id into send_id;
  token := req.token;
  return next;
end;
$$;

-- The asker's own requests. A pulse's number of answers shows only once it
-- has closed, so a boss can't watch it go up as each person answers.
create or replace function public.feedback_my_requests(p_tool text default null, p_limit integer default 50, p_offset integer default 0)
returns table (id uuid, tool_key text, item_id uuid, created_at timestamptz, opens_at timestamptz, expires_at timestamptz,
               switched_off_at timestamptz, max_answers integer, answers bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.tool_key, r.item_id, r.created_at, r.opens_at, r.expires_at, r.switched_off_at, r.max_answers,
         case when r.tool_key in ('team_pulse', 'team_checkin') and not coalesce(public.pulse_request_closed(r.id), false) then null
              else (select count(*) from public.feedback_answers a where a.request_id = r.id) end
  from public.feedback_requests r
  where r.asker_id = (select auth.uid()) and (p_tool is null or r.tool_key = p_tool)
  order by r.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0);
$$;

-- Extending a link. A pulse can't be extended or reopened: reading the
-- totals, reopening and reading them again would give away the next
-- person's answers.
create or replace function public.feedback_request_extend(p_request uuid, p_days integer)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  e timestamptz;
begin
  if p_days is null or p_days not between 1 and 365 then
    raise exception 'Extend by 1 to 365 days.' using errcode = '22023';
  end if;
  if exists (select 1 from public.feedback_requests r
              where r.id = p_request and r.asker_id = (select auth.uid()) and r.tool_key in ('team_pulse', 'team_checkin')) then
    raise exception 'A pulse can''t be kept open longer or reopened. Send a new one instead.' using errcode = '22023';
  end if;
  update public.feedback_requests set expires_at = greatest(expires_at, now()) + make_interval(days => p_days)
   where id = p_request and asker_id = (select auth.uid())
   returning expires_at into e;
  if e is null then
    raise exception 'That request isn''t yours.' using errcode = '42501';
  end if;
  return e;
end;
$$;

-- A boss's results for one send. Before it closes, or with fewer than 3
-- answers: only whether it has closed, how many answered (once closed), the
-- named answers and how many it went to. Once it shows: the totals, the
-- change since the last pulse (only if that one showed too), their own
-- questions, comments as written without names in a random order, the named
-- answers and one small next step. Each measure carries its name (the
-- stress question is named Calm).
create or replace function public.pulse_results(p_send uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  ps public.pulse_sends;
  prev public.pulse_sends;
  shown jsonb;
  named jsonb;
  answers jsonb;
  prev_measures jsonb;
  res jsonb;
  names constant jsonb := '{"energy": "Energy to perform", "sleep": "Sleep", "stress": "Calm", "workload": "Workload", "support": "Support"}';
begin
  select * into ps from public.pulse_sends where id = p_send and boss_id = (select auth.uid());
  if not found then
    raise exception 'That pulse isn''t yours.' using errcode = '42501';
  end if;
  shown := public.pulse_shown(ps.request_id);
  named := (select coalesce(jsonb_agg(jsonb_build_object('name', a.giver_name, 'energy', a.answers ->> 'energy', 'sleep', a.answers ->> 'sleep',
                                                         'stress', a.answers ->> 'stress', 'workload', a.answers ->> 'workload', 'support', a.answers ->> 'support')
                                       order by a.created_at), '[]')
            from public.feedback_answers a where a.request_id = ps.request_id and a.name_added);
  if not (shown ->> 'shown')::boolean then
    return shown || jsonb_build_object('wentTo', ps.went_to, 'closesAt', ps.closes_at, 'named', named, 'measureNames', names);
  end if;

  select coalesce(jsonb_agg(a.answers), '[]') into answers from public.feedback_answers a where a.request_id = ps.request_id;
  -- last time: the boss's previous pulse of the same kind, used only if its
  -- own results showed (otherwise the change would give them away)
  select * into prev from public.pulse_sends p
   where p.boss_id = ps.boss_id and p.kind = ps.kind and p.opens_at < ps.opens_at order by p.opens_at desc limit 1;
  if prev.id is not null and (public.pulse_shown(prev.request_id) ->> 'shown')::boolean then
    select jsonb_object_agg(k, v -> 'figure') into prev_measures
      from jsonb_each(public.score_m18_pulse((select coalesce(jsonb_agg(a.answers), '[]') from public.feedback_answers a where a.request_id = prev.request_id), null) -> 'measures') e(k, v);
  end if;
  res := public.score_m18_pulse(answers, prev_measures);
  res := jsonb_set(res, '{measures}', (select jsonb_object_agg(k, v || jsonb_build_object('name', names ->> k)) from jsonb_each(res -> 'measures') e(k, v)));
  return res || shown || jsonb_build_object(
    'wentTo', ps.went_to,
    'closesAt', ps.closes_at,
    'measureNames', names,
    'own', (select coalesce(jsonb_object_agg(q ->> 'id',
              case when q ->> 'kind' = 'rating'
                   then jsonb_build_object('average', (select avg((a.answers -> 'own' ->> (q ->> 'id'))::numeric) from public.feedback_answers a
                                                       where a.request_id = ps.request_id and jsonb_typeof(a.answers -> 'own' -> (q ->> 'id')) = 'number'),
                                           'answers', (select count(*) from public.feedback_answers a
                                                       where a.request_id = ps.request_id and jsonb_typeof(a.answers -> 'own' -> (q ->> 'id')) = 'number'))
                   else jsonb_build_object('texts', (select coalesce(jsonb_agg(t order by random()), '[]') from (
                                                       select a.answers -> 'own' ->> (q ->> 'id') as t from public.feedback_answers a
                                                       where a.request_id = ps.request_id and coalesce(btrim(a.answers -> 'own' ->> (q ->> 'id')), '') <> '') x)) end), '{}')
            from jsonb_array_elements(ps.own_questions) q),
    'comments', (select coalesce(jsonb_agg(c order by random()), '[]') from (
                   select a.answers ->> 'comment' as c from public.feedback_answers a
                   where a.request_id = ps.request_id and coalesce(btrim(a.answers ->> 'comment'), '') <> '') x),
    'named', named,
    'nextStep', case res ->> 'lowest'
                  when 'energy' then 'Ask your team what would give them more energy at work.'
                  when 'sleep' then 'Ask your team what gets in the way of a good night’s sleep.'
                  when 'stress' then 'Ask your team what is adding the most pressure right now.'
                  when 'workload' then 'Ask your team what would ease the workload.'
                  when 'support' then 'Ask each person what support would help them perform.' end);
end;
$$;

select public.record_migration(33, '033_pulse_wellbeing_seat_standard');
