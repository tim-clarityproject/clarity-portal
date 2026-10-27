-- =============================================================================
-- 030_organisations_feedback_pulse.sql
-- Phase 1 data model, part 5 of 6: what organisations see, feedback links,
-- the team pulse and before and after impact
-- (phase-1-data-model-spec.md sections 5, 6, 7 and 8)
--
-- WHAT THIS DOES (plain English)
--   What sponsors and leaders see
--     sprint_summaries        the frozen end-of-sprint summary for a seat:
--                             the organisation's objectives and the
--                             development objective with their figures, and
--                             each serving Strategy's sprint score, with the
--                             methods version. Made only by the checked
--                             function in migration 032, never by the app.
--     Sponsors and leaders read these, and the wellbeing a person chooses to
--     share, only through the checked functions below. They never read a
--     personal table. Nothing named about someone who has left is returned.
--   Organisation measures (owner only to enter; spec 6)
--     org_measures, org_measure_figures, org_comparisons (owner only)
--   Feedback links (spec 7: the Health Check model)
--     feedback_question_sets  each tool's questions, as data
--     feedback_requests       one request and its link, stored hashed
--     feedback_answers        answers, never linked to an account
--     The requests and answers tables are locked: nobody reads or writes
--     them directly. Givers reach one request through feedback_open and
--     feedback_send, which refuse a link that is expired, switched off or
--     full. The asker reaches their own through checked functions.
--   Team pulse (spec 8)
--     pulse_sends, pulse_saved_questions, pulse_settings
--   Before and after impact (spec 6, methods M17)
--     impact_behaviours, impact_raters
--
-- SAFE TO RUN TWICE
--   Yes. The question sets are added only where missing.
--
-- HOW TO RUN
--   After 029. Then run supabase/030_organisations_feedback_pulse_test.sql.
-- =============================================================================

-- ---------------------------------------------------------------- frozen summaries
create table if not exists public.sprint_summaries (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  sprint_id       uuid not null unique references public.sprints (id) on delete cascade,
  member_id       uuid not null references public.organisation_members (id) on delete cascade,
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  team_ids        uuid[] not null default '{}'::uuid[],
  sprint_number   integer not null,
  sprint_start    date not null,
  sprint_end      date not null,
  summary         jsonb not null check (jsonb_typeof(summary) = 'object'),
  methods_version text not null,
  made_at         timestamptz not null default now()
);
comment on table public.sprint_summaries is
  'Frozen at the sprint''s end (methods M0.6, M6): only organisation and development objectives with their figures, and each serving Strategy''s sprint score. Later edits never change it.';
create index if not exists sprint_summaries_member_idx on public.sprint_summaries (member_id, sprint_end desc);
create index if not exists sprint_summaries_org_idx on public.sprint_summaries (organisation_id, sprint_end desc);
create index if not exists sprint_summaries_user_idx on public.sprint_summaries (user_id, sprint_end desc);
create index if not exists sprint_summaries_teams_idx on public.sprint_summaries using gin (team_ids);

-- ---------------------------------------------------------------- organisation measures
create table if not exists public.org_measures (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  name            text not null check (char_length(btrim(name)) between 1 and 120),
  unit            text check (char_length(unit) <= 30),
  baseline        numeric,
  target          numeric,
  by_when         date,
  source          text check (char_length(source) <= 200),
  entered_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists org_measures_org_idx on public.org_measures (organisation_id);
create index if not exists org_measures_entered_by_idx on public.org_measures (entered_by);

create table if not exists public.org_measure_figures (
  id          uuid primary key default gen_random_uuid(),
  measure_id  uuid not null references public.org_measures (id) on delete cascade,
  value       numeric not null,
  recorded_on date not null,
  source      text check (char_length(source) <= 200),
  entered_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists org_measure_figures_measure_idx on public.org_measure_figures (measure_id, recorded_on);
create index if not exists org_measure_figures_entered_by_idx on public.org_measure_figures (entered_by);

-- Comparison with teams not being coached: owner only (Tim, 26 Oct, 17:31).
create table if not exists public.org_comparisons (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  measure_id      uuid references public.org_measures (id) on delete cascade,
  group_label     text not null check (char_length(group_label) <= 120),
  coached         boolean not null,
  group_size      integer not null check (group_size >= 0),
  period_start    date not null,
  period_end      date not null,
  value_before    numeric,
  value_after     numeric,
  created_at      timestamptz not null default now(),
  check (period_end >= period_start)
);
create index if not exists org_comparisons_org_idx on public.org_comparisons (organisation_id);
create index if not exists org_comparisons_measure_idx on public.org_comparisons (measure_id);

-- ---------------------------------------------------------------- feedback links
create table if not exists public.feedback_question_sets (
  id             uuid primary key default gen_random_uuid(),
  tool_key       text not null check (tool_key ~ '^[a-z0-9_]{2,40}$'),
  version        integer not null check (version >= 1),
  questions      jsonb not null check (jsonb_typeof(questions) = 'array'),
  wording_status text not null default 'draft' check (wording_status in ('draft', 'confirmed')),
  created_at     timestamptz not null default now(),
  unique (tool_key, version)
);

create table if not exists public.feedback_requests (
  id              uuid primary key default gen_random_uuid(),
  asker_id        uuid not null references auth.users (id) on delete cascade,
  tool_key        text not null check (tool_key ~ '^[a-z0-9_]{2,40}$'),
  item_id         uuid,
  question_set_id uuid not null references public.feedback_question_sets (id) on delete restrict,
  token_hash      text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  opens_at        timestamptz not null default now(),
  expires_at      timestamptz not null default now() + interval '30 days',
  switched_off_at timestamptz,
  max_answers     integer not null default 1 check (max_answers between 1 and 500),
  hide_names_at_3 boolean not null default false,
  subject_first_name text check (char_length(subject_first_name) <= 60),
  created_at      timestamptz not null default now(),
  check (expires_at > opens_at)
);
comment on table public.feedback_requests is
  'Locked: reached only through the feedback_* functions. The link is 32 random bytes, kept only as its SHA-256 hash.';
create index if not exists feedback_requests_asker_idx on public.feedback_requests (asker_id, created_at desc);
create index if not exists feedback_requests_item_idx on public.feedback_requests (tool_key, item_id);
create index if not exists feedback_requests_question_set_idx on public.feedback_requests (question_set_id);

create table if not exists public.feedback_answers (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid not null references public.feedback_requests (id) on delete cascade,
  giver_name  text check (char_length(giver_name) between 1 and 60),
  name_added  boolean not null default false,
  answers     jsonb not null check (jsonb_typeof(answers) = 'object' and pg_column_size(answers) <= 32768),
  created_at  timestamptz not null default now(),
  check (name_added or giver_name is null)
);
comment on table public.feedback_answers is
  'Locked. Never linked to an account. A name is kept only when the giver chose to add it.';
create index if not exists feedback_answers_request_idx on public.feedback_answers (request_id, created_at);

-- ---------------------------------------------------------------- team pulse
create table if not exists public.pulse_sends (
  id            uuid primary key default gen_random_uuid(),
  boss_id       uuid not null references auth.users (id) on delete cascade,
  kind          text not null check (kind in ('short', 'full_checkin')),
  request_id    uuid not null unique references public.feedback_requests (id) on delete cascade,
  own_questions jsonb not null default '[]'::jsonb
                check (jsonb_typeof(own_questions) = 'array' and jsonb_array_length(own_questions) <= 3),
  went_to       integer not null check (went_to between 1 and 500),
  opens_at      timestamptz not null,
  closes_at     timestamptz not null,
  created_at    timestamptz not null default now(),
  check (closes_at > opens_at)
);
create index if not exists pulse_sends_boss_idx on public.pulse_sends (boss_id, opens_at desc);

create table if not exists public.pulse_saved_questions (
  id         uuid primary key default gen_random_uuid(),
  boss_id    uuid not null references auth.users (id) on delete cascade,
  kind       text not null check (kind in ('rating', 'text')),
  text       text not null check (char_length(btrim(text)) between 1 and 200),
  created_at timestamptz not null default now()
);
create index if not exists pulse_saved_questions_boss_idx on public.pulse_saved_questions (boss_id);

create table if not exists public.pulse_settings (
  boss_id          uuid primary key references auth.users (id) on delete cascade,
  rhythm_days      integer not null default 30 check (rhythm_days between 7 and 180),
  next_reminder_on date,
  updated_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------- before and after impact
create table if not exists public.impact_behaviours (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  member_id   uuid references public.organisation_members (id) on delete set null,
  text        text not null check (char_length(btrim(text)) between 1 and 120),
  sort_order  integer not null default 0,
  agreed_on   date,
  archived_at timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists impact_behaviours_user_idx on public.impact_behaviours (user_id);
create index if not exists impact_behaviours_member_idx on public.impact_behaviours (member_id);

create table if not exists public.impact_raters (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  rater_label      text not null check (char_length(btrim(rater_label)) between 1 and 60),
  rater_role       text not null check (rater_role in ('sponsor', 'colleague')),
  start_request_id uuid references public.feedback_requests (id) on delete set null,
  end_request_id   uuid references public.feedback_requests (id) on delete set null,
  created_at       timestamptz not null default now()
);
create index if not exists impact_raters_user_idx on public.impact_raters (user_id);
create index if not exists impact_raters_start_idx on public.impact_raters (start_request_id);
create index if not exists impact_raters_end_idx on public.impact_raters (end_request_id);

-- A rater's links must be the person's own requests.
create or replace function public.impact_raters_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.feedback_requests r
             where r.id in (new.start_request_id, new.end_request_id)
               and (r.asker_id <> new.user_id or r.tool_key <> 'before_after_impact')) then
    raise exception 'That link belongs to someone else.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.impact_raters_check() from public, anon, authenticated;
drop trigger if exists impact_raters_check on public.impact_raters;
create trigger impact_raters_check before insert or update on public.impact_raters
  for each row execute function public.impact_raters_check();

drop trigger if exists org_measures_touch on public.org_measures;
create trigger org_measures_touch before update on public.org_measures for each row execute function public.p1_touch();
drop trigger if exists pulse_settings_touch on public.pulse_settings;
create trigger pulse_settings_touch before update on public.pulse_settings for each row execute function public.p1_touch();

-- ---------------------------------------------------------------- grants and rules
do $lock$
declare t text;
begin
  foreach t in array array['sprint_summaries', 'org_measures', 'org_measure_figures', 'org_comparisons',
                           'feedback_question_sets', 'feedback_requests', 'feedback_answers',
                           'pulse_sends', 'pulse_saved_questions', 'pulse_settings', 'impact_behaviours', 'impact_raters'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
  end loop;
end
$lock$;
-- feedback_requests and feedback_answers stay locked: no grants, no rules.

-- Summaries: the person reads their own (what their sponsor sees). Nobody
-- writes them except public.make_sprint_summary (migration 032).
grant select on public.sprint_summaries to authenticated;
drop policy if exists "Own summaries" on public.sprint_summaries;
create policy "Own summaries" on public.sprint_summaries for select to authenticated
  using (user_id = (select auth.uid()));

-- Measures: the owner enters them; the organisation's admins and leaders read them.
create or replace function public.leads_in_org(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.teams t where t.organisation_id = p_org and t.id in (select public.my_leader_team_ids()));
$$;
revoke all on function public.leads_in_org(uuid) from public, anon;
grant execute on function public.leads_in_org(uuid) to authenticated;

grant select, insert, update, delete on public.org_measures to authenticated;
drop policy if exists "Measures: read" on public.org_measures;
create policy "Measures: read" on public.org_measures for select to authenticated
  using ((select public.is_owner()) or public.is_org_admin(organisation_id) or public.leads_in_org(organisation_id));
drop policy if exists "Measures: owner writes" on public.org_measures;
create policy "Measures: owner writes" on public.org_measures for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));

grant select, insert, update, delete on public.org_measure_figures to authenticated;
drop policy if exists "Measure figures: read" on public.org_measure_figures;
create policy "Measure figures: read" on public.org_measure_figures for select to authenticated
  using (exists (select 1 from public.org_measures m where m.id = measure_id
                 and ((select public.is_owner()) or public.is_org_admin(m.organisation_id) or public.leads_in_org(m.organisation_id))));
drop policy if exists "Measure figures: owner writes" on public.org_measure_figures;
create policy "Measure figures: owner writes" on public.org_measure_figures for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));

grant select, insert, update, delete on public.org_comparisons to authenticated;
drop policy if exists "Comparisons: owner only" on public.org_comparisons;
create policy "Comparisons: owner only" on public.org_comparisons for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));

-- Question sets: the owner manages them; everyone else gets questions
-- through the checked functions.
grant select, insert, update on public.feedback_question_sets to authenticated;
drop policy if exists "Question sets: owner" on public.feedback_question_sets;
create policy "Question sets: owner" on public.feedback_question_sets for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));

-- Pulse: the boss's own.
grant select, delete on public.pulse_sends to authenticated;
drop policy if exists "Own pulse sends" on public.pulse_sends;
create policy "Own pulse sends" on public.pulse_sends for select to authenticated using (boss_id = (select auth.uid()));
drop policy if exists "Own pulse sends: remove" on public.pulse_sends;
create policy "Own pulse sends: remove" on public.pulse_sends for delete to authenticated using (boss_id = (select auth.uid()));
grant select, insert, update, delete on public.pulse_saved_questions to authenticated;
drop policy if exists "Own saved questions" on public.pulse_saved_questions;
create policy "Own saved questions" on public.pulse_saved_questions for all to authenticated
  using (boss_id = (select auth.uid())) with check (boss_id = (select auth.uid()));
grant select, insert, update, delete on public.pulse_settings to authenticated;
drop policy if exists "Own pulse settings" on public.pulse_settings;
create policy "Own pulse settings" on public.pulse_settings for all to authenticated
  using (boss_id = (select auth.uid())) with check (boss_id = (select auth.uid()));

-- Impact: the person, and their coach while "Progress" is shared. The
-- organisation sees only totals across people (migration 032).
do $rules$
declare t text;
begin
  foreach t in array array['impact_behaviours', 'impact_raters'] loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('drop policy if exists "Read: own, or shared" on public.%I', t);
    execute format('create policy "Read: own, or shared" on public.%I for select to authenticated using (user_id = (select auth.uid()) or public.may_see(user_id, ''progress''))', t);
    execute format('drop policy if exists "Own rows: add" on public.%I', t);
    execute format('create policy "Own rows: add" on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', t);
    execute format('drop policy if exists "Own rows: change" on public.%I', t);
    execute format('create policy "Own rows: change" on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('drop policy if exists "Own rows: remove" on public.%I', t);
    execute format('create policy "Own rows: remove" on public.%I for delete to authenticated using (user_id = (select auth.uid()))', t);
  end loop;
end
$rules$;
drop trigger if exists impact_behaviours_owner_member_id on public.impact_behaviours;
create trigger impact_behaviours_owner_member_id before insert or update on public.impact_behaviours
  for each row execute function public.p1_same_owner('organisation_members', 'member_id');

-- ---------------------------------------------------------------- question sets (data)
-- First drafts for Tim to confirm (methods M18, M17). Added only where missing.
insert into public.feedback_question_sets (tool_key, version, wording_status, questions) values
  ('team_pulse', 1, 'draft', '[
    {"key": "energy", "kind": "choice", "text": "How much energy have you had to perform at your best?", "options": ["very_low", "low", "ok", "high", "very_high"], "labels": ["Very low", "Low", "OK", "High", "Very high"]},
    {"key": "sleep", "kind": "choice", "text": "How would you rate the quality of your sleep?", "options": ["very_poor", "poor", "ok", "good", "very_good"], "labels": ["Very poor", "Poor", "OK", "Good", "Very good"]},
    {"key": "stress", "kind": "choice", "text": "How often did you feel tense, restless, nervous or anxious?", "options": ["never", "rarely", "sometimes", "often", "always"], "labels": ["Never", "Rarely", "Sometimes", "Often", "Always"]},
    {"key": "workload", "kind": "choice", "text": "How often was your workload manageable?", "options": ["never", "rarely", "sometimes", "often", "always"], "labels": ["Never", "Rarely", "Sometimes", "Often", "Always"]},
    {"key": "support", "kind": "choice", "text": "How often did you have the support you needed to perform?", "options": ["never", "rarely", "sometimes", "often", "always"], "labels": ["Never", "Rarely", "Sometimes", "Often", "Always"]},
    {"key": "comment", "kind": "text", "text": "What would help the team perform better?", "optional": true}
  ]'::jsonb),
  ('before_after_impact', 1, 'draft', '[
    {"key": "often", "kind": "choice_per_behaviour", "text": "How often does [first name] do this?", "options": ["never", "rarely", "sometimes", "often", "always"], "labels": ["Never", "Rarely", "Sometimes", "Often", "Always"]},
    {"key": "looking_back", "kind": "choice_per_behaviour", "phase": "end", "text": "Looking back, how often did [first name] do this at the start?", "options": ["never", "rarely", "sometimes", "often", "always"], "labels": ["Never", "Rarely", "Sometimes", "Often", "Always"]}
  ]'::jsonb)
on conflict (tool_key, version) do nothing;

-- ---------------------------------------------------------------- feedback link functions
-- The asker makes a request. The plain link is returned once and never kept.
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

-- The request behind a link, if it is open now: not expired, not switched
-- off, not full, and already open. For the functions below only.
create or replace function public.feedback_open_request(p_token text, p_lock boolean)
returns public.feedback_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.feedback_requests;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    return null;
  end if;
  if p_lock then
    select * into r from public.feedback_requests where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') for update;
  else
    select * into r from public.feedback_requests where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
  end if;
  if not found or r.switched_off_at is not null or now() >= r.expires_at or now() < r.opens_at
     or (select count(*) from public.feedback_answers a where a.request_id = r.id) >= r.max_answers then
    return null;
  end if;
  return r;
end;
$$;
revoke all on function public.feedback_open_request(text, boolean) from public, anon, authenticated;

-- A giver opens a link: the questions and the asker's first name, nothing
-- else. A closed or unknown link gets the same answer, so links can't be
-- guessed at.
create or replace function public.feedback_open(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.feedback_requests;
begin
  r := public.feedback_open_request(p_token, false);
  if r.id is null then
    return jsonb_build_object('status', 'closed');
  end if;
  return jsonb_build_object(
    'status', 'open',
    'tool', r.tool_key,
    'asker_first_name', (select nullif(btrim(p.first_name), '') from public.profiles p where p.id = r.asker_id),
    'subject_first_name', r.subject_first_name,
    'questions', (select q.questions from public.feedback_question_sets q where q.id = r.question_set_id),
    'own_questions', (select s.own_questions from public.pulse_sends s where s.request_id = r.id),
    'small_group', (select s.went_to < 5 from public.pulse_sends s where s.request_id = r.id)
  );
end;
$$;

-- A giver sends answers. The name is kept only when they chose to add it.
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

-- The asker's own requests, newest first, a page at a time.
create or replace function public.feedback_my_requests(p_tool text default null, p_limit integer default 50, p_offset integer default 0)
returns table (id uuid, tool_key text, item_id uuid, created_at timestamptz, opens_at timestamptz, expires_at timestamptz,
               switched_off_at timestamptz, max_answers integer, answers bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.tool_key, r.item_id, r.created_at, r.opens_at, r.expires_at, r.switched_off_at, r.max_answers,
         (select count(*) from public.feedback_answers a where a.request_id = r.id)
  from public.feedback_requests r
  where r.asker_id = (select auth.uid()) and (p_tool is null or r.tool_key = p_tool)
  order by r.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0);
$$;

-- The answers to one of the asker's own requests. Names show only where the
-- giver added one, and are hidden once 3 or more answer when the request
-- uses the 360 rule (methods M16). Pulse answers come through
-- public.pulse_results instead, as totals.
create or replace function public.feedback_request_answers(p_request uuid)
returns table (id uuid, giver_name text, answers jsonb, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  r public.feedback_requests;
  n bigint;
begin
  select * into r from public.feedback_requests where id = p_request and asker_id = (select auth.uid());
  if not found then
    raise exception 'That request isn''t yours.' using errcode = '42501';
  end if;
  if r.tool_key in ('team_pulse', 'team_checkin') then
    raise exception 'Pulse answers show as totals (public.pulse_results).' using errcode = '42501';
  end if;
  select count(*) into n from public.feedback_answers a where a.request_id = r.id;
  return query
    select a.id, case when r.hide_names_at_3 and n >= 3 then null else a.giver_name end, a.answers, a.created_at
    from public.feedback_answers a where a.request_id = r.id order by a.created_at;
end;
$$;

create or replace function public.feedback_request_switch_off(p_request uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.feedback_requests set switched_off_at = coalesce(switched_off_at, now())
   where id = p_request and asker_id = (select auth.uid());
  if not found then
    raise exception 'That request isn''t yours.' using errcode = '42501';
  end if;
  return true;
end;
$$;

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
  update public.feedback_requests set expires_at = greatest(expires_at, now()) + make_interval(days => p_days)
   where id = p_request and asker_id = (select auth.uid())
   returning expires_at into e;
  if e is null then
    raise exception 'That request isn''t yours.' using errcode = '42501';
  end if;
  return e;
end;
$$;

-- ---------------------------------------------------------------- pulse functions
-- A boss sends a pulse: one link, shared with their team, accepting as many
-- answers as people it went to.
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
  if p_closes_at <= p_opens_at then
    raise exception 'A pulse closes after it opens.' using errcode = '22023';
  end if;
  days := greatest(1, ceil(extract(epoch from (p_closes_at - p_opens_at)) / 86400)::integer);
  -- The full check-in's questions are added as data when the pulse is built
  -- (tool team_checkin); until then sending one is refused.
  select * into req from public.feedback_request_create(
    case when p_kind = 'short' then 'team_pulse' else 'team_checkin' end, null, p_went_to, false, days, p_opens_at, null);
  update public.feedback_requests set expires_at = p_closes_at where id = req.request_id;
  insert into public.pulse_sends (boss_id, kind, request_id, own_questions, went_to, opens_at, closes_at)
  values ((select auth.uid()), p_kind, req.request_id, p_own_questions, p_went_to, p_opens_at, p_closes_at)
  returning id into send_id;
  token := req.token;
  return next;
end;
$$;

-- ---------------------------------------------------------------- what sponsors and leaders read
-- A summary's people: current, confirmed seat-holders only. Someone who has
-- left is never returned, named, again.

-- Seats the person signed in sponsors.
create or replace function public.sponsor_people()
returns table (person_id uuid, first_name text, last_name text, organisation_id uuid, organisation_name text, latest_summary_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id, p.first_name, p.last_name, o.id, o.name,
         (select max(ss.made_at) from public.sprint_summaries ss where ss.member_id = m.id)
  from public.seat_sponsors s
  join public.organisation_members m on m.id = s.member_id and m.ended_on is null and m.has_seat and m.confirmed_at is not null
  join public.organisations o on o.id = m.organisation_id
  left join public.profiles p on p.id = m.user_id
  where s.sponsor_user_id = (select auth.uid()) and s.ended_on is null
  order by p.last_name, p.first_name;
$$;

-- People in the signed-in leader's teams and every team below, a page at a time.
create or replace function public.leader_people(p_team uuid default null, p_limit integer default 50, p_offset integer default 0)
returns table (person_id uuid, first_name text, last_name text, team_ids uuid[], latest_summary_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  with scope as (select public.my_leader_team_ids() as id),
  wanted as (
    select s.id from scope s
    where p_team is null
       or s.id in (with recursive below as (select p_team as id union select t.id from public.teams t join below b on t.parent_team_id = b.id)
                   select id from below)
  )
  select m.user_id, p.first_name, p.last_name, array_agg(distinct tm.team_id),
         (select max(ss.made_at) from public.sprint_summaries ss where ss.member_id = m.id)
  from public.organisation_members m
  join public.team_members tm on tm.member_id = m.id and tm.ended_on is null and tm.team_id in (select id from wanted)
  left join public.profiles p on p.id = m.user_id
  where m.ended_on is null and m.confirmed_at is not null
    and (p_team is null or p_team in (select id from scope))
  group by m.id, m.user_id, p.first_name, p.last_name
  order by p.last_name, p.first_name, m.user_id
  limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0);
$$;

-- One person's frozen summaries, for their sponsor or a leader over them,
-- only from their current membership. The person may read their own too.
create or replace function public.person_summaries(p_person uuid, p_limit integer default 12, p_offset integer default 0)
returns table (sprint_number integer, sprint_start date, sprint_end date, summary jsonb, methods_version text, made_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select ss.sprint_number, ss.sprint_start, ss.sprint_end, ss.summary, ss.methods_version, ss.made_at
  from public.sprint_summaries ss
  join public.organisation_members m on m.id = ss.member_id
  where ss.user_id = p_person
    and (p_person = (select auth.uid())
         or (m.ended_on is null and m.confirmed_at is not null and m.has_seat
             -- the viewer's link must be with this membership, so a sponsor or
             -- leader in one organisation never sees a summary made in another
             and (exists (select 1 from public.seat_sponsors s
                          where s.member_id = m.id and s.sponsor_user_id = (select auth.uid()) and s.ended_on is null)
                  or exists (select 1 from public.team_members tm
                             where tm.member_id = m.id and tm.ended_on is null
                               and tm.team_id in (select public.my_leader_team_ids())))))
  order by ss.sprint_end desc
  limit least(greatest(coalesce(p_limit, 12), 1), 100) offset greatest(coalesce(p_offset, 0), 0);
$$;

-- Wellbeing a person chooses to share with their organisation (Tim, 26 Oct,
-- 18:48): named, their Hardware and Software scores and areas, latest and
-- over time. Never the answers, the written goals or any coach flag.
-- Switching it off hides past months too.
create or replace function public.org_wellbeing(p_person uuid)
returns table (month date, hardware_score numeric, software_score numeric, area_scores jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select c.month, c.hardware_score, c.software_score, c.area_scores
  from public.checkins c
  where c.user_id = p_person and c.status = 'finished'
    and (p_person = (select auth.uid()) or public.may_see(p_person, 'org_wellbeing'))
  order by c.month desc;
$$;

do $grants$
declare f text;
begin
  foreach f in array array[
    'public.feedback_request_create(text, uuid, integer, boolean, integer, timestamptz, text)',
    'public.feedback_my_requests(text, integer, integer)', 'public.feedback_request_answers(uuid)',
    'public.feedback_request_switch_off(uuid)', 'public.feedback_request_extend(uuid, integer)',
    'public.pulse_send_create(text, integer, timestamptz, timestamptz, jsonb)',
    'public.sponsor_people()', 'public.leader_people(uuid, integer, integer)',
    'public.person_summaries(uuid, integer, integer)', 'public.org_wellbeing(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  foreach f in array array['public.feedback_open(text)', 'public.feedback_send(text, jsonb, text, boolean)'] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
end
$grants$;

select public.record_migration(30, '030_organisations_feedback_pulse');
