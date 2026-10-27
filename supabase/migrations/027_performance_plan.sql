-- =============================================================================
-- 027_performance_plan.sql
-- Phase 1 data model, part 2 of 6: the Individual Performance Plan
-- (phase-1-data-model-spec.md section 2)
--
-- WHAT THIS DOES (plain English)
--   One plan for everyone, in new tables alongside the old Personal
--   Operating Plan (missions, strategies, tactics stay as they are until
--   go-live; spec section 13 converts them).
--
--     performance_plans      the person's role mission (up to 120 characters)
--                            and the plan's version number
--     plan_versions          a snapshot of each version, never changed: major
--                            (mission changed, objective or Strategy added or
--                            removed, Strategy re-tagged) or minor
--     outcome_objectives     2 to 4 recommended: a number (up or down), a
--                            rating out of 10, or a milestone; the person's
--                            own, the organisation's (confirmed by the
--                            sponsor), or the one development objective
--     objective_figures      every update to an objective's figure
--     objective_proposals    a sponsor's proposed change to an organisation
--                            objective, which applies only when the person
--                            accepts it
--     plan_strategies        3 to 6 recommended; each serves one or more
--                            objectives (strategy_objectives)
--     habits                 tactics that repeat, in one Strategy, measured
--                            one of seven ways (methods M1)
--
-- WHO CAN SEE WHAT (spec section 5)
--   The person: everything of their own.
--   Their coach: the mission, if "Mission" is shared (on by default);
--   objectives, their figures and the Strategies, if "Progress" is shared
--   (off by default). Never the habits.
--   Sponsors and leaders: nothing here. They see only the frozen
--   end-of-sprint summary (migration 030).
--   Sponsors propose changes and confirm organisation objectives only through
--   the checked functions below.
--
-- SAFE TO RUN TWICE
--   Yes. Tables and indexes are made only if missing; functions, rules and
--   triggers are replaced with the same versions.
--
-- HOW TO RUN
--   After 026. Then run supabase/027_performance_plan_test.sql.
-- =============================================================================

create table if not exists public.performance_plans (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  mission    text check (char_length(mission) <= 120),
  status     text not null default 'active' check (status in ('active', 'archived')),
  major      integer not null default 1 check (major >= 1),
  minor      integer not null default 0 check (minor >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists performance_plans_one_active on public.performance_plans (user_id) where status = 'active';
create index if not exists performance_plans_user_idx on public.performance_plans (user_id, created_at desc);

create table if not exists public.plan_versions (
  id          uuid primary key default gen_random_uuid(),
  plan_id     uuid not null references public.performance_plans (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  major       integer not null check (major >= 1),
  minor       integer not null check (minor >= 0),
  kind        text not null check (kind in ('start', 'major', 'minor')),
  change_note text check (char_length(change_note) <= 500),
  snapshot    jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  created_at  timestamptz not null default now(),
  unique (plan_id, major, minor)
);
create index if not exists plan_versions_user_idx on public.plan_versions (user_id, created_at desc);

create table if not exists public.outcome_objectives (
  id               uuid primary key default gen_random_uuid(),
  plan_id          uuid not null references public.performance_plans (id) on delete cascade,
  user_id          uuid not null references auth.users (id) on delete cascade,
  name             text not null check (char_length(btrim(name)) between 1 and 80),
  kind             text not null check (kind in ('number', 'rating', 'milestone')),
  unit             text check (char_length(unit) <= 30),
  direction        text not null default 'up' check (direction in ('up', 'down')),
  start_value      numeric,
  start_set_on     date not null default current_date,
  target_value     numeric,
  by_when          date,
  due_on           date,
  reached_on       date,
  source           text not null default 'own' check (source in ('own', 'organisation', 'development')),
  organisation_id  uuid references public.organisations (id) on delete set null,
  confirmed_by     uuid references auth.users (id) on delete set null,
  confirmed_at     timestamptz,
  sort_order       integer not null default 0,
  archived_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (
    (kind = 'number' and start_value is not null and target_value is not null and by_when is not null and due_on is null)
    or (kind = 'rating' and direction = 'up' and start_value between 0 and 10 and target_value between 0 and 10
        and by_when is not null and due_on is null and unit is null)
    or (kind = 'milestone' and due_on is not null and start_value is null and target_value is null and unit is null)
  ),
  check (source = 'own' or organisation_id is not null),
  check (reached_on is null or kind = 'milestone')
);
create unique index if not exists outcome_objectives_one_development
  on public.outcome_objectives (plan_id) where source = 'development' and archived_at is null;
create index if not exists outcome_objectives_plan_idx on public.outcome_objectives (plan_id, sort_order);
create index if not exists outcome_objectives_user_idx on public.outcome_objectives (user_id);
create index if not exists outcome_objectives_org_idx on public.outcome_objectives (organisation_id) where organisation_id is not null;
create index if not exists outcome_objectives_confirmed_by_idx on public.outcome_objectives (confirmed_by);

create table if not exists public.objective_figures (
  id           uuid primary key default gen_random_uuid(),
  objective_id uuid not null references public.outcome_objectives (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  value        numeric not null,
  recorded_on  date not null,
  sprint_id    uuid,
  sprint_week  integer check (sprint_week >= 1),
  created_at   timestamptz not null default now()
);
create index if not exists objective_figures_objective_idx on public.objective_figures (objective_id, recorded_on, created_at);
create index if not exists objective_figures_user_idx on public.objective_figures (user_id, recorded_on);

create table if not exists public.objective_proposals (
  id           uuid primary key default gen_random_uuid(),
  objective_id uuid not null references public.outcome_objectives (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  proposed_by  uuid not null references auth.users (id) on delete cascade,
  changes      jsonb not null check (jsonb_typeof(changes) = 'object'),
  note         text check (char_length(note) <= 500),
  status       text not null default 'waiting' check (status in ('waiting', 'accepted', 'declined', 'withdrawn')),
  proposed_at  timestamptz not null default now(),
  decided_at   timestamptz
);
create index if not exists objective_proposals_objective_idx on public.objective_proposals (objective_id, proposed_at desc);
create index if not exists objective_proposals_user_idx on public.objective_proposals (user_id, status);
create index if not exists objective_proposals_proposed_by_idx on public.objective_proposals (proposed_by, status);

create table if not exists public.plan_strategies (
  id          uuid primary key default gen_random_uuid(),
  plan_id     uuid not null references public.performance_plans (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 80),
  description text check (char_length(description) <= 500),
  sort_order  integer not null default 0,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists plan_strategies_plan_idx on public.plan_strategies (plan_id, sort_order);
create index if not exists plan_strategies_user_idx on public.plan_strategies (user_id);

create table if not exists public.strategy_objectives (
  strategy_id  uuid not null references public.plan_strategies (id) on delete cascade,
  objective_id uuid not null references public.outcome_objectives (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (strategy_id, objective_id)
);
create index if not exists strategy_objectives_objective_idx on public.strategy_objectives (objective_id);
create index if not exists strategy_objectives_user_idx on public.strategy_objectives (user_id);

create table if not exists public.habits (
  id          uuid primary key default gen_random_uuid(),
  plan_id     uuid not null references public.performance_plans (id) on delete cascade,
  strategy_id uuid not null references public.plan_strategies (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 80),
  measure     text not null check (measure in ('count', 'amount', 'yes_no_weekly', 'yes_no_days_target',
                                              'yes_no_days_limit', 'count_limit', 'rating')),
  unit        text check (char_length(unit) <= 30),
  target      numeric check (target >= 0),
  target_per  text check (target_per in ('day', 'week')),
  limit_value numeric check (limit_value >= 0),
  limit_per   text check (limit_per in ('day', 'week')),
  direction   text check (direction in ('higher', 'lower')),
  top_number  numeric check (top_number > 0),
  impact      smallint not null default 2 check (impact between 1 and 3),
  sort_order  integer not null default 0,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (
    (measure in ('count', 'amount') and target is not null and target_per is not null)
    or (measure = 'yes_no_weekly')
    or (measure = 'yes_no_days_target' and (target is null or target between 1 and 7))
    or (measure = 'yes_no_days_limit' and limit_value between 0 and 7)
    or (measure = 'count_limit' and limit_value is not null and limit_per is not null)
    or (measure = 'rating' and direction is not null and target is not null
        and ((direction = 'higher' and target between 2 and 5) or (direction = 'lower' and target between 1 and 4)))
  )
);
comment on table public.habits is
  'Tactics that repeat (methods M1). Stored in one unit; converted for display. Never visible to a coach, sponsor or leader.';
create index if not exists habits_plan_idx on public.habits (plan_id, sort_order);
create index if not exists habits_strategy_idx on public.habits (strategy_id);
create index if not exists habits_user_idx on public.habits (user_id);

-- ---------------------------------------------------------------- same owner
do $owner$
declare r record;
begin
  for r in select * from (values
    ('plan_versions', 'performance_plans', 'plan_id'),
    ('outcome_objectives', 'performance_plans', 'plan_id'),
    ('objective_figures', 'outcome_objectives', 'objective_id'),
    ('plan_strategies', 'performance_plans', 'plan_id'),
    ('strategy_objectives', 'plan_strategies', 'strategy_id'),
    ('habits', 'performance_plans', 'plan_id')
  ) v(child, parent, col) loop
    execute format('drop trigger if exists %I on public.%I', r.child || '_same_owner', r.child);
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.p1_same_owner(%L, %L)',
                   r.child || '_same_owner', r.child, r.parent, r.col);
  end loop;
end
$owner$;
-- Second parents: a link's objective, and a habit's Strategy.
drop trigger if exists strategy_objectives_same_owner_2 on public.strategy_objectives;
create trigger strategy_objectives_same_owner_2 before insert or update on public.strategy_objectives
  for each row execute function public.p1_same_owner('outcome_objectives', 'objective_id');
drop trigger if exists habits_same_owner_2 on public.habits;
create trigger habits_same_owner_2 before insert or update on public.habits
  for each row execute function public.p1_same_owner('plan_strategies', 'strategy_id');

-- An organisation or development objective must be for an organisation the
-- person belongs to. Changing what one measures takes away the sponsor's
-- confirmation (Claude), unless it is the person accepting the sponsor's
-- own proposal.
create or replace function public.outcome_objectives_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.source <> 'own' and (tg_op = 'INSERT' or new.organisation_id is distinct from old.organisation_id) then
    if not exists (select 1 from public.organisation_members m
                   where m.user_id = new.user_id and m.organisation_id = new.organisation_id and m.ended_on is null) then
      raise exception 'That organisation objective is for an organisation you are not in.' using errcode = '42501';
    end if;
  end if;
  if tg_op = 'INSERT' then
    if current_setting('clarity.sponsor_confirming', true) is distinct from 'yes' then
      new.confirmed_by := null;
      new.confirmed_at := null;
    end if;
    return new;
  end if;
  if current_setting('clarity.sponsor_confirming', true) is distinct from 'yes' then
    if (new.confirmed_by, new.confirmed_at) is distinct from (old.confirmed_by, old.confirmed_at) then
      new.confirmed_by := old.confirmed_by;
      new.confirmed_at := old.confirmed_at;
    end if;
    if (new.name, new.kind, new.unit, new.direction, new.start_value, new.target_value, new.by_when, new.due_on, new.source, new.organisation_id)
       is distinct from
       (old.name, old.kind, old.unit, old.direction, old.start_value, old.target_value, old.by_when, old.due_on, old.source, old.organisation_id) then
      new.confirmed_by := null;
      new.confirmed_at := null;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.outcome_objectives_check() from public, anon, authenticated;
drop trigger if exists outcome_objectives_check on public.outcome_objectives;
create trigger outcome_objectives_check before insert or update on public.outcome_objectives
  for each row execute function public.outcome_objectives_check();

do $touch$
declare t text;
begin
  foreach t in array array['performance_plans', 'outcome_objectives', 'plan_strategies', 'habits'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.p1_touch()', t || '_touch', t);
  end loop;
end
$touch$;

-- ---------------------------------------------------------------- grants and rules
do $lock$
declare t text;
begin
  foreach t in array array['performance_plans', 'plan_versions', 'outcome_objectives', 'objective_figures',
                           'objective_proposals', 'plan_strategies', 'strategy_objectives', 'habits'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
  end loop;
end
$lock$;

-- The rules, as a table: (table, the part a coach needs, can the person change and remove rows).
do $rules$
declare r record;
begin
  for r in select * from (values
    ('performance_plans', 'mission'),
    ('outcome_objectives', 'progress'),
    ('objective_figures', 'progress'),
    ('plan_strategies', 'progress'),
    ('strategy_objectives', 'progress'),
    ('habits', null)
  ) v(t, part) loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', r.t);
    execute format('drop policy if exists "Read: own, or shared" on public.%I', r.t);
    execute format('create policy "Read: own, or shared" on public.%I for select to authenticated using (%s)', r.t,
                   case when r.part is null then 'user_id = (select auth.uid())'
                        else format('user_id = (select auth.uid()) or public.may_see(user_id, %L)', r.part) end);
    execute format('drop policy if exists "Own rows: add" on public.%I', r.t);
    execute format('create policy "Own rows: add" on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', r.t);
    execute format('drop policy if exists "Own rows: change" on public.%I', r.t);
    execute format('create policy "Own rows: change" on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', r.t);
    execute format('drop policy if exists "Own rows: remove" on public.%I', r.t);
    execute format('create policy "Own rows: remove" on public.%I for delete to authenticated using (user_id = (select auth.uid()))', r.t);
  end loop;
end
$rules$;

-- Plan history is never changed or removed (as mission_versions).
grant select, insert on public.plan_versions to authenticated;
drop policy if exists "Own plan history: read" on public.plan_versions;
create policy "Own plan history: read" on public.plan_versions for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists "Own plan history: add" on public.plan_versions;
create policy "Own plan history: add" on public.plan_versions for insert to authenticated
  with check (user_id = (select auth.uid()));

-- Proposals: read by the person and by whoever proposed; written only
-- through the functions below.
grant select on public.objective_proposals to authenticated;
drop policy if exists "Proposals: the person and the proposer" on public.objective_proposals;
create policy "Proposals: the person and the proposer" on public.objective_proposals for select to authenticated
  using (user_id = (select auth.uid()) or proposed_by = (select auth.uid()));

-- ---------------------------------------------------------------- sponsor functions
-- The objectives a sponsor may act on: organisation and development
-- objectives on the seat they sponsor, for that seat's organisation.
create or replace function public.sponsor_may_act_on(p_objective uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.outcome_objectives o
    join public.organisation_members m on m.user_id = o.user_id and m.organisation_id = o.organisation_id
                                        and m.ended_on is null and m.has_seat and m.confirmed_at is not null
    join public.seat_sponsors s on s.member_id = m.id and s.ended_on is null
    where o.id = p_objective and o.source in ('organisation', 'development') and o.archived_at is null
      and s.sponsor_user_id = (select auth.uid())
      and not exists (select 1 from public.organisation_admins a where a.organisation_id = m.organisation_id and a.user_id = (select auth.uid()))
  );
$$;
revoke all on function public.sponsor_may_act_on(uuid) from public, anon, authenticated;

-- A sponsor confirms an organisation or development objective as agreed.
create or replace function public.sponsor_confirm_objective(p_objective uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.sponsor_may_act_on(p_objective) then
    raise exception 'You can only confirm objectives for a seat you sponsor.' using errcode = '42501';
  end if;
  perform set_config('clarity.sponsor_confirming', 'yes', true);
  update public.outcome_objectives set confirmed_by = (select auth.uid()), confirmed_at = now() where id = p_objective;
  perform set_config('clarity.sponsor_confirming', '', true);
  return true;
end;
$$;

-- A sponsor proposes a change. Only these fields can be proposed.
create or replace function public.sponsor_propose_objective_change(p_objective uuid, p_changes jsonb, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id uuid;
  k text;
begin
  if not public.sponsor_may_act_on(p_objective) then
    raise exception 'You can only propose changes for a seat you sponsor.' using errcode = '42501';
  end if;
  if p_changes is null or jsonb_typeof(p_changes) <> 'object' or p_changes = '{}'::jsonb then
    raise exception 'Say what would change.' using errcode = '22023';
  end if;
  for k in select jsonb_object_keys(p_changes) loop
    if k not in ('name', 'target_value', 'by_when', 'due_on', 'unit', 'direction') then
      raise exception 'A sponsor can''t propose a change to %.', k using errcode = '22023';
    end if;
  end loop;
  -- checked now, so a proposal can always be accepted
  begin
    perform (p_changes ->> 'target_value')::numeric, (p_changes ->> 'by_when')::date, (p_changes ->> 'due_on')::date;
  exception when others then
    raise exception 'A target is a number and a date is a date.' using errcode = '22023';
  end;
  if p_changes ? 'direction' and p_changes ->> 'direction' not in ('up', 'down') then
    raise exception 'A direction is up or down.' using errcode = '22023';
  end if;
  if coalesce(char_length(p_changes ->> 'name'), 1) not between 1 and 80 or coalesce(char_length(p_changes ->> 'unit'), 0) > 30 then
    raise exception 'A name is up to 80 characters and a unit up to 30.' using errcode = '22023';
  end if;
  insert into public.objective_proposals (objective_id, user_id, proposed_by, changes, note)
  select o.id, o.user_id, (select auth.uid()), p_changes, left(p_note, 500)
  from public.outcome_objectives o where o.id = p_objective
  returning id into new_id;
  return new_id;
end;
$$;

-- The person accepts or declines a waiting proposal. Accepting applies it
-- and keeps the sponsor's confirmation, since they proposed it.
create or replace function public.objective_proposal_decide(p_proposal uuid, p_accept boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.objective_proposals;
  o public.outcome_objectives;
  still boolean;
begin
  select * into p from public.objective_proposals
   where id = p_proposal and user_id = (select auth.uid()) and status = 'waiting'
   for update;
  if not found then
    raise exception 'That proposal isn''t waiting for you.' using errcode = '42501';
  end if;
  if p_accept then
    select * into o from public.outcome_objectives where id = p.objective_id;
    still := exists (select 1 from public.seat_sponsors s join public.organisation_members m on m.id = s.member_id
                     where s.sponsor_user_id = p.proposed_by and s.ended_on is null and m.ended_on is null
                       and m.user_id = o.user_id and m.organisation_id = o.organisation_id);
    perform set_config('clarity.sponsor_confirming', 'yes', true);
    update public.outcome_objectives set
      name = coalesce(p.changes ->> 'name', o.name),
      target_value = coalesce((p.changes ->> 'target_value')::numeric, o.target_value),
      by_when = coalesce((p.changes ->> 'by_when')::date, o.by_when),
      due_on = coalesce((p.changes ->> 'due_on')::date, o.due_on),
      unit = coalesce(p.changes ->> 'unit', o.unit),
      direction = coalesce(p.changes ->> 'direction', o.direction),
      -- confirmed only if the proposer still sponsors the seat
      confirmed_by = case when still then p.proposed_by end,
      confirmed_at = case when still then now() end
    where id = p.objective_id;
    perform set_config('clarity.sponsor_confirming', '', true);
  end if;
  update public.objective_proposals
     set status = case when p_accept then 'accepted' else 'declined' end, decided_at = now()
   where id = p_proposal;
  return case when p_accept then 'accepted' else 'declined' end;
end;
$$;

do $grants$
declare f text;
begin
  foreach f in array array['public.sponsor_confirm_objective(uuid)', 'public.sponsor_propose_objective_change(uuid, jsonb, text)',
                           'public.objective_proposal_decide(uuid, boolean)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end
$grants$;

select public.record_migration(27, '027_performance_plan');
