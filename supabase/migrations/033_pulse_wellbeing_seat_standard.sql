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
--          private then too (Claude);
--        - each figure (a measure, or one of the boss's own rating
--          questions) follows the same rule on the answers to it, so
--          someone skipping a question never leaves one answer on show;
--        - a pulse is made only through pulse_send_create, and a boss can't
--          answer their own pulse while signed in (signed out, nobody can
--          tell who answers a link: a known limit in methods M18 and M21).
--      A pulse is open for 7 days, or less if the boss chooses. The stress
--      question is stored as before ('stress') and named Calm (higher is
--      calmer) wherever the database names the measures.
--   2. Wellbeing shared per organisation (methods M19.4; Tim, 27 Oct)
--      org_wellbeing_switches: one switch for each organisation the person
--      is in. may_see checks the switch for the organisation the viewer
--      sponsors or leads in, so switching one off hides past months from
--      that organisation only. The old single switch moves over: "on"
--      becomes "on" for each organisation the person is in today (the reach
--      it had), so nothing already shared is lost or widened, and the
--      single switch is refused from then on. Leaving an organisation
--      switches its wellbeing off. Organisation pages use org_wellbeing_in
--      (person, organisation). A leader reaches wellbeing only through a
--      team in the same organisation, and a team with people or teams in
--      it can't be moved to another organisation.
--   3. Organisation seats have a fixed standard of 85% (methods M7; Tim,
--      26 Oct, 23:49)
--      While someone holds an active, confirmed membership with a seat,
--      every sprint they start, and every change to a sprint's standard,
--      gets 85, and their running sprint always has it. A different standard
--      is set to 85 rather than refused (Claude: a save made before they
--      joined, or waiting offline, keeps their other changes). People who
--      pay for themselves keep 50 to 100. Someone who leaves keeps 85 until
--      they change it. The rule lives in one function, fixed_standard_for,
--      where a coach override could be added later (not decided, not built).
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
    raise exception 'A pulse can stay open for up to 7 days. Choose a closing date within 7 days of opening.' using errcode = '22023';
  end if;
  days := greatest(1, ceil(extract(epoch from (closes - opens)) / 86400)::integer);
  -- The full check-in's questions are added as data when the pulse is built
  -- (tool team_checkin); until then sending one is refused.
  perform set_config('clarity.pulse_sending', 'yes', true);
  select * into req from public.feedback_request_create(
    case when p_kind = 'short' then 'team_pulse' else 'team_checkin' end, null, p_went_to, false, days, opens, null);
  perform set_config('clarity.pulse_sending', '', true);
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

-- One figure (a measure, or one of the boss's own rating questions) shows
-- only on the same terms as the pulse: 3 or more answers to that question,
-- and not just 1 or 2 anonymous ones beside named answers (break-it test,
-- 27 Oct: someone skipping a question could otherwise leave one person's
-- answer on show). As m18FigureShown, tested on the same cases.
create or replace function public.score_m18_figure_shown(p_answers integer, p_named integer)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_answers, 0) >= 3 and not (coalesce(p_answers, 0) - coalesce(p_named, 0) between 1 and 2);
$$;
revoke all on function public.score_m18_figure_shown(integer, integer) from public, anon;
grant execute on function public.score_m18_figure_shown(integer, integer) to authenticated;

-- One request's five measures: each figure, or null where it can't show.
create or replace function public.pulse_figures(p_request uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with every_answer as (
    select public.score_m18_pulse((select coalesce(jsonb_agg(a.answers), '[]') from public.feedback_answers a where a.request_id = p_request), null) -> 'measures' as m),
  named_answers as (
    select public.score_m18_pulse((select coalesce(jsonb_agg(a.answers), '[]') from public.feedback_answers a where a.request_id = p_request and a.name_added), null) -> 'measures' as m)
  select coalesce(jsonb_object_agg(e.k, jsonb_build_object(
           'figure', case when public.score_m18_figure_shown((e.v ->> 'answers')::integer, (n.m -> e.k ->> 'answers')::integer) then e.v -> 'figure' else 'null'::jsonb end,
           'answers', e.v -> 'answers',
           'shown', public.score_m18_figure_shown((e.v ->> 'answers')::integer, (n.m -> e.k ->> 'answers')::integer))), '{}')
  from every_answer, named_answers n, jsonb_each(every_answer.m) e(k, v);
$$;
revoke all on function public.pulse_figures(uuid) from public, anon, authenticated;

-- A boss's results for one send. Before it closes, or with fewer than 3
-- answers: only whether it has closed, how many answered (once closed), the
-- named answers and how many it went to. Once it shows: each figure that
-- may show (pulse_figures), the change since the last pulse where both
-- figures showed, their own questions (ratings on the same terms), comments
-- as written without names in a random order, the named answers and one
-- small next step from the lowest figure shown. Each measure carries its
-- name (the stress question is named Calm).
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
  cur jsonb;
  before jsonb := '{}';
  measures jsonb;
  lowest text;
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

  cur := public.pulse_figures(ps.request_id);
  -- last time: the boss's previous pulse of the same kind, used only if its
  -- own results showed (otherwise the change would give them away)
  select * into prev from public.pulse_sends p
   where p.boss_id = ps.boss_id and p.kind = ps.kind and p.opens_at < ps.opens_at order by p.opens_at desc limit 1;
  if prev.id is not null and (public.pulse_shown(prev.request_id) ->> 'shown')::boolean then
    before := public.pulse_figures(prev.request_id);
  end if;
  select jsonb_object_agg(m.key, (cur -> m.key) || jsonb_build_object(
           'name', names ->> m.key,
           'change', case when jsonb_typeof(cur -> m.key -> 'figure') = 'number' and jsonb_typeof(before -> m.key -> 'figure') = 'number'
                          then public.score_round((cur -> m.key ->> 'figure')::numeric) - public.score_round((before -> m.key ->> 'figure')::numeric) end)),
         (select m2.key from (values ('energy', 1), ('sleep', 2), ('stress', 3), ('workload', 4), ('support', 5)) m2(key, ord)
           where jsonb_typeof(cur -> m2.key -> 'figure') = 'number' order by (cur -> m2.key ->> 'figure')::numeric, m2.ord limit 1)
    into measures, lowest
    from (values ('energy'), ('sleep'), ('stress'), ('workload'), ('support')) m(key);
  return shown || jsonb_build_object(
    'measures', measures,
    'lowest', lowest,
    'wentTo', ps.went_to,
    'closesAt', ps.closes_at,
    'measureNames', names,
    'own', (select coalesce(jsonb_object_agg(q ->> 'id',
              case when q ->> 'kind' = 'rating' then (
                     select jsonb_build_object(
                       'average', case when public.score_m18_figure_shown(count(*)::integer, (count(*) filter (where a.name_added))::integer)
                                       then avg((a.answers -> 'own' ->> (q ->> 'id'))::numeric) end,
                       'answers', count(*),
                       'shown', public.score_m18_figure_shown(count(*)::integer, (count(*) filter (where a.name_added))::integer))
                     from public.feedback_answers a
                     where a.request_id = ps.request_id and jsonb_typeof(a.answers -> 'own' -> (q ->> 'id')) = 'number')
                   else jsonb_build_object('texts', (select coalesce(jsonb_agg(t order by random()), '[]') from (
                                                       select a.answers -> 'own' ->> (q ->> 'id') as t from public.feedback_answers a
                                                       where a.request_id = ps.request_id and coalesce(btrim(a.answers -> 'own' ->> (q ->> 'id')), '') <> '') x)) end), '{}')
            from jsonb_array_elements(ps.own_questions) q),
    'comments', (select coalesce(jsonb_agg(c order by random()), '[]') from (
                   select a.answers ->> 'comment' as c from public.feedback_answers a
                   where a.request_id = ps.request_id and coalesce(btrim(a.answers ->> 'comment'), '') <> '') x),
    'named', named,
    'nextStep', case lowest
                  when 'energy' then 'Ask your team what would give them more energy at work.'
                  when 'sleep' then 'Ask your team what gets in the way of a good night’s sleep.'
                  when 'stress' then 'Ask your team what is adding the most pressure right now.'
                  when 'workload' then 'Ask your team what would ease the workload.'
                  when 'support' then 'Ask each person what support would help them perform.' end);
end;
$$;

-- A pulse is made only through pulse_send_create (so it always has its
-- 7-day close and its results rules), and a boss can't answer their own
-- pulse while signed in. (Signed out, nobody can tell who answers a link:
-- methods M18 and M21 say so.)
create or replace function public.feedback_request_create(
  p_tool text, p_item uuid, p_max_answers integer default 1, p_hide_names_at_3 boolean default false,
  p_days integer default 30, p_opens_at timestamptz default null, p_subject_first_name text default null)
returns table (request_id uuid, token text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  qs uuid;
  t text := encode(extensions.gen_random_bytes(32), 'hex');
  opens timestamptz := coalesce(p_opens_at, now());
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in to ask for feedback.' using errcode = '42501';
  end if;
  if p_tool in ('team_pulse', 'team_checkin') and current_setting('clarity.pulse_sending', true) is distinct from 'yes' then
    raise exception 'A team pulse is sent from the team pulse page. Send it from there.' using errcode = '22023';
  end if;
  if p_days is null or p_days not between 1 and 365 then
    raise exception 'A link lasts 1 to 365 days.' using errcode = '22023';
  end if;
  select q.id into qs from public.feedback_question_sets q where q.tool_key = p_tool order by q.version desc limit 1;
  if qs is null then
    raise exception 'That tool has no questions yet.' using errcode = '22023';
  end if;
  insert into public.feedback_requests (asker_id, tool_key, item_id, question_set_id, token_hash, opens_at, expires_at,
                                        max_answers, hide_names_at_3, subject_first_name)
  values ((select auth.uid()), p_tool, p_item, qs, encode(extensions.digest(t, 'sha256'), 'hex'), opens,
          opens + make_interval(days => p_days), greatest(1, least(coalesce(p_max_answers, 1), 500)),
          coalesce(p_hide_names_at_3, false), left(btrim(p_subject_first_name), 60))
  returning id into request_id;
  token := t;
  return next;
end;
$$;

create or replace function public.feedback_send(p_token text, p_answers jsonb, p_name text default null, p_add_name boolean default false)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.feedback_requests;
  nm text := nullif(btrim(coalesce(p_name, '')), '');
begin
  r := public.feedback_open_request(p_token, true);
  if r.id is null then
    return 'closed';
  end if;
  if r.tool_key in ('team_pulse', 'team_checkin') and r.asker_id = (select auth.uid()) then
    raise exception 'This is your own pulse, so it can''t take your answers. Your team answers it.' using errcode = '42501';
  end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' or pg_column_size(p_answers) > 32768 then
    raise exception 'Those answers can''t be read.' using errcode = '22023';
  end if;
  if coalesce(p_add_name, false) and (nm is null or char_length(nm) > 60) then
    raise exception 'Add a name of up to 60 characters, or leave it off.' using errcode = '22023';
  end if;
  insert into public.feedback_answers (request_id, giver_name, name_added, answers)
  values (r.id, case when p_add_name then nm end, coalesce(p_add_name, false), p_answers);
  return 'sent';
end;
$$;

-- ---------------------------------------------------------------- 2. wellbeing, per organisation
-- One switch for each organisation the person is in (methods M19.4; Tim,
-- 27 Oct, 14:20). Off by default (no row). Switched on only while they are
-- a member there; switched off any time, which hides past months from that
-- organisation only. A switch is turned off, never removed.
create table if not exists public.org_wellbeing_switches (
  user_id         uuid not null references auth.users (id) on delete cascade,
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  is_on           boolean not null,
  changed_at      timestamptz not null default now(),
  primary key (user_id, organisation_id)
);
comment on table public.org_wellbeing_switches is
  'Wellbeing (Hardware and Software scores and areas, named) shared with one organisation, by the person''s choice (methods M19.4). No row means off.';
create index if not exists org_wellbeing_switches_org_idx on public.org_wellbeing_switches (organisation_id);

-- The switch history keeps which organisation a wellbeing switch was for.
alter table public.sharing_switch_history
  add column if not exists organisation_id uuid references public.organisations (id) on delete set null;

create or replace function public.org_wellbeing_switch_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (new.user_id is distinct from old.user_id or new.organisation_id is distinct from old.organisation_id) then
    raise exception 'A wellbeing switch stays with its person and organisation.' using errcode = '42501';
  end if;
  if new.is_on and not exists (select 1 from public.organisation_members m
                                where m.user_id = new.user_id and m.organisation_id = new.organisation_id and m.ended_on is null) then
    raise exception 'You can share your wellbeing only with an organisation you''re in.' using errcode = '42501';
  end if;
  new.changed_at := now();
  return new;
end;
$$;

create or replace function public.org_wellbeing_switch_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.is_on is distinct from old.is_on then
    insert into public.sharing_switch_history (user_id, part, is_on, changed_at, organisation_id)
    values (new.user_id, 'org_wellbeing', new.is_on, new.changed_at, new.organisation_id);
  end if;
  return new;
end;
$$;
revoke all on function public.org_wellbeing_switch_check() from public, anon, authenticated;
revoke all on function public.org_wellbeing_switch_log() from public, anon, authenticated;

drop trigger if exists org_wellbeing_switches_check on public.org_wellbeing_switches;
create trigger org_wellbeing_switches_check before insert or update on public.org_wellbeing_switches
  for each row execute function public.org_wellbeing_switch_check();
drop trigger if exists org_wellbeing_switches_log on public.org_wellbeing_switches;
create trigger org_wellbeing_switches_log after insert or update on public.org_wellbeing_switches
  for each row execute function public.org_wellbeing_switch_log();

alter table public.org_wellbeing_switches enable row level security;
revoke all on public.org_wellbeing_switches from public, anon, authenticated;
grant select, insert, update on public.org_wellbeing_switches to authenticated;
drop policy if exists "Own wellbeing switches" on public.org_wellbeing_switches;
drop policy if exists "Own wellbeing switches: read" on public.org_wellbeing_switches;
create policy "Own wellbeing switches: read" on public.org_wellbeing_switches for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists "Own wellbeing switches: add" on public.org_wellbeing_switches;
create policy "Own wellbeing switches: add" on public.org_wellbeing_switches for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists "Own wellbeing switches: change" on public.org_wellbeing_switches;
create policy "Own wellbeing switches: change" on public.org_wellbeing_switches for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- The parts list: wellbeing is now chosen per organisation (shared one
-- organisation at a time), so the single switch is refused with a clear
-- message.
create or replace function public.sharing_parts()
returns table (part text, audience text, default_on boolean, per_item boolean, label text)
language sql
immutable
set search_path = ''
as $$
  values
    ('mission',         'coach',        true,  false, 'Mission'),
    ('checkin',         'coach',        true,  false, 'Monthly check-in, including the First check-in'),
    ('progress',        'coach',        false, false, 'Progress: scores, Outcome Objective figures, the sprint at a glance and patterns'),
    ('debrief',         'coach',        false, true,  'Weekly debrief, chosen each week'),
    ('sweet_spot',      'coach',        false, true,  'Find my sweet spot, chosen each time'),
    ('session_prep',    'coach',        false, true,  'Session prep, chosen each time'),
    ('evidence',        'coach',        false, true,  'Performance Evidence, chosen each time'),
    ('recharge',        'coach',        false, true,  'Recovery: what would help you recharge, chosen each day'),
    ('recovery_notice', 'coach',        true,  true,  'Recovery: that it started and until when ("Let [coach] know")'),
    ('org_wellbeing',   'organisation', false, true,  'Wellbeing: Hardware and Software scores and areas, named, to the sponsor and leaders, chosen for each organisation')
$$;

create or replace function public.sharing_switch_check()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.part = 'org_wellbeing' then
    raise exception 'Wellbeing is now shared with each organisation separately. Use the switch for that organisation.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.sharing_parts() p where p.part = new.part and not p.per_item) then
    raise exception 'Unknown sharing part: %', new.part using errcode = '22023';
  end if;
  new.changed_at := now();
  return new;
end;
$$;

-- May the person signed in see this person's wellbeing, through a
-- membership in p_org (or in any organisation when p_org is null)? Only by
-- the person's choice for that organisation, to a sponsor of their seat
-- there or a leader over one of their teams there (the team in the same
-- organisation), while they are a confirmed member.
create or replace function public.wellbeing_visible(p_owner uuid, p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organisation_members m
    join public.org_wellbeing_switches w on w.user_id = m.user_id and w.organisation_id = m.organisation_id and w.is_on
    where m.user_id = p_owner and m.ended_on is null and m.confirmed_at is not null
      and (p_org is null or m.organisation_id = p_org)
      and ((m.has_seat
            and exists (select 1 from public.seat_sponsors s where s.member_id = m.id and s.sponsor_user_id = (select auth.uid()) and s.ended_on is null)
            and not exists (select 1 from public.organisation_admins a where a.organisation_id = m.organisation_id and a.user_id = (select auth.uid())))
           or exists (select 1 from public.team_members tm
                      join public.teams t on t.id = tm.team_id and t.organisation_id = m.organisation_id
                      where tm.member_id = m.id and tm.ended_on is null and tm.team_id in (select public.my_leader_team_ids())))
  );
$$;
revoke all on function public.wellbeing_visible(uuid, uuid) from public, anon, authenticated;

-- THE CHECKED HELPER (spec 5), as in 026, with wellbeing checked for each
-- organisation: a sponsor of the person's seat there, or a leader over one
-- of their teams there, and only while that organisation's switch is on.
create or replace function public.may_see(p_owner uuid, p_part text, p_item_shared boolean default null)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  viewer uuid := (select auth.uid());
  p record;
begin
  if viewer is null or p_owner is null then
    return false;
  end if;
  if viewer = p_owner then
    return true;
  end if;
  select * into p from public.sharing_parts() sp where sp.part = p_part;
  if not found then
    raise exception 'Unknown sharing part: %', p_part using errcode = '22023';
  end if;
  if p.audience = 'coach' then
    if not public.is_coach_of(p_owner) then
      return false;
    end if;
    if p.per_item then
      return coalesce(p_item_shared, false);
    end if;
    return public.sharing_is_on(p_owner, p_part);
  end if;
  -- organisation wellbeing: by the person's choice for each organisation
  return public.wellbeing_visible(p_owner, null);
end;
$$;

-- The person's organisations, each with its wellbeing switch, for the
-- "What [sponsor] sees" page.
create or replace function public.my_org_wellbeing_switches()
returns table (organisation_id uuid, organisation_name text, is_on boolean, changed_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id, o.name, coalesce(w.is_on, false), w.changed_at
  from public.organisation_members m
  join public.organisations o on o.id = m.organisation_id
  left join public.org_wellbeing_switches w on w.user_id = m.user_id and w.organisation_id = m.organisation_id
  where m.user_id = (select auth.uid()) and m.ended_on is null
  order by o.name;
$$;
revoke all on function public.my_org_wellbeing_switches() from public, anon;
grant execute on function public.my_org_wellbeing_switches() to authenticated;

-- Wellbeing for one organisation's pages: only what was shared with that
-- organisation, even for someone who is a sponsor or leader in two.
create or replace function public.org_wellbeing_in(p_person uuid, p_org uuid)
returns table (month date, hardware_score numeric, software_score numeric, area_scores jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select c.month, c.hardware_score, c.software_score, c.area_scores
  from public.checkins c
  where c.user_id = p_person and c.status = 'finished'
    and (p_person = (select auth.uid()) or public.wellbeing_visible(p_person, p_org))
  order by c.month desc;
$$;
revoke all on function public.org_wellbeing_in(uuid, uuid) from public, anon;
grant execute on function public.org_wellbeing_in(uuid, uuid) to authenticated;

-- Leaving an organisation switches its wellbeing off, so rejoining later
-- never shares it again without a fresh choice.
create or replace function public.organisation_members_wellbeing_off()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.ended_on is null and new.ended_on is not null then
    update public.org_wellbeing_switches set is_on = false
     where user_id = new.user_id and organisation_id = new.organisation_id and is_on;
  end if;
  return new;
end;
$$;
revoke all on function public.organisation_members_wellbeing_off() from public, anon, authenticated;
drop trigger if exists organisation_members_wellbeing_off on public.organisation_members;
create trigger organisation_members_wellbeing_off after update on public.organisation_members
  for each row execute function public.organisation_members_wellbeing_off();
-- Anyone who has already left: switched off (safe to run twice).
update public.org_wellbeing_switches w set is_on = false
 where w.is_on and not exists (select 1 from public.organisation_members m
                                where m.user_id = w.user_id and m.organisation_id = w.organisation_id and m.ended_on is null);

-- A team with people or teams in it stays in its organisation, so a team's
-- members can never sit in another organisation's team (break-it test).
create or replace function public.teams_keep_organisation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.organisation_id is distinct from old.organisation_id
     and (exists (select 1 from public.team_members tm where tm.team_id = old.id)
          or exists (select 1 from public.teams c where c.parent_team_id = old.id)) then
    raise exception 'A team with people or teams in it stays in its organisation. Make a new team there instead.' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.teams_keep_organisation() from public, anon, authenticated;
drop trigger if exists teams_keep_organisation on public.teams;
create trigger teams_keep_organisation before update on public.teams
  for each row execute function public.teams_keep_organisation();


-- Moving the single switch over (once; safe to run twice): an "on" switch
-- becomes an "on" switch for each organisation the person is in today,
-- which is exactly the reach it had, so nothing already shared is lost or
-- widened. The old rows are then removed (their history stays), so running
-- this again can never copy a switch into an organisation joined later.
create or replace function public.org_wellbeing_move_old_switches()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  moved integer;
begin
  insert into public.org_wellbeing_switches (user_id, organisation_id, is_on)
  select distinct s.user_id, m.organisation_id, true
  from public.sharing_switches s
  join public.organisation_members m on m.user_id = s.user_id and m.ended_on is null
  where s.part = 'org_wellbeing' and s.is_on
  on conflict (user_id, organisation_id) do nothing;
  get diagnostics moved = row_count;
  delete from public.sharing_switches where part = 'org_wellbeing';
  return moved;
end;
$$;
revoke all on function public.org_wellbeing_move_old_switches() from public, anon, authenticated;
select public.org_wellbeing_move_old_switches();

-- ---------------------------------------------------------------- 3. the fixed standard for organisation seats
-- The standard a person's sprints must have, or null when they choose their
-- own (50 to 100, 85 suggested). 85 while they hold an active, confirmed
-- membership with a seat (Tim, 26 Oct, 23:49; methods M7; spec section 6).
-- This is the one place the rule lives: a coach override (Tim's open
-- question, not decided) would be added here and nowhere else.
create or replace function public.fixed_standard_for(p_user uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case when exists (
    select 1 from public.organisation_members m
    where m.user_id = p_user and m.has_seat and m.ended_on is null and m.confirmed_at is not null
  ) then 85 end;
$$;
revoke all on function public.fixed_standard_for(uuid) from public, anon, authenticated;

-- For the screens: the signed-in person's fixed standard, or null when they
-- choose their own.
create or replace function public.my_fixed_standard()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select public.fixed_standard_for((select auth.uid()));
$$;
revoke all on function public.my_fixed_standard() from public, anon;
grant execute on function public.my_fixed_standard() to authenticated;

-- Every sprint someone in a seat starts, and every change to its standard,
-- gets 85; a running sprint always has it. A different standard is set to
-- 85 rather than refused (Claude), so a save made before they joined (a
-- draft, or one waiting offline in the sync queue) still keeps their other
-- changes instead of failing. Finished sprints keep the standard their
-- weeks were scored at unless the standard itself is changed. Someone who
-- leaves keeps 85 until they change it themselves.
create or replace function public.sprints_seat_standard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  fixed integer := public.fixed_standard_for(new.user_id);
begin
  if fixed is not null
     and (tg_op = 'INSERT' or new.status = 'running' or new.standard is distinct from old.standard) then
    new.standard := fixed;
  end if;
  return new;
end;
$$;
revoke all on function public.sprints_seat_standard() from public, anon, authenticated;
drop trigger if exists sprints_seat_standard on public.sprints;
create trigger sprints_seat_standard before insert or update on public.sprints
  for each row execute function public.sprints_seat_standard();

-- Taking up a seat (confirming it, or a membership becoming a seat) sets
-- the sprint they are running to 85 too, so the summary their organisation
-- gets at its end is at 85 (Claude).
create or replace function public.organisation_members_seat_standard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.has_seat and new.ended_on is null and new.confirmed_at is not null
     and (tg_op = 'INSERT' or not (old.has_seat and old.ended_on is null and old.confirmed_at is not null)) then
    update public.sprints set standard = 85
     where user_id = new.user_id and status = 'running' and standard is distinct from 85;
  end if;
  return new;
end;
$$;
revoke all on function public.organisation_members_seat_standard() from public, anon, authenticated;
drop trigger if exists organisation_members_seat_standard on public.organisation_members;
create trigger organisation_members_seat_standard after insert or update on public.organisation_members
  for each row execute function public.organisation_members_seat_standard();

-- Sprints already running for someone in a seat (none on live yet; safe to
-- run twice).
update public.sprints s set standard = 85
 where s.status = 'running' and s.standard is distinct from 85 and public.fixed_standard_for(s.user_id) = 85;

select public.record_migration(33, '033_pulse_wellbeing_seat_standard');
