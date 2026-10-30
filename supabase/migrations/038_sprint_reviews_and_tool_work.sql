-- =============================================================================
-- 038_sprint_reviews_and_tool_work.sql
-- Phase 3 (Tim, 29 Oct): the one migration Phase 3 allows.
--
-- WHAT THIS DOES (plain English)
--     sprint_reviews         the end-of-sprint review's written answers, one
--                            row per sprint: what worked best, what to do
--                            better next time (each up to 4000 characters),
--                            what comes next (another sprint or Recovery
--                            first) and when it was finished. Until now the
--                            answers were kept on the device only.
--     tool_work_strategies   a tool's saved work (a decision tool's or a
--                            review's row) tagged to a Strategy of the plan,
--                            with the sprint and week it was done in, so the
--                            Strategy can show "Work this sprint".
--     the weekly stress answer kept private (Tim, 30 Oct): weekly_debriefs
--                            becomes own rows only, so its stress answer is
--                            read by the person alone, whatever they share.
--                            Their coach reads a shared debrief through
--                            coach_shared_debrief(person, sprint, week),
--                            which leaves stress out.
--   The two tables are additive and the old code never reads them. The
--   debrief change keeps every column and row; only who may read it
--   changes. The app reads and writes only its own debriefs, so it works
--   the same before and after.
--
-- WHY A CHECKED READ, NOT A TABLE OF ITS OWN FOR STRESS
--   Before 038, weekly_debriefs' "Read: own, or shared" rule let the
--   person's coach read the whole row once shared_with_coach was on,
--   stress included. A rule can only hide whole rows, never one column, so
--   the coach's part of the rule goes, and the coach gets a checked read
--   that names the shared columns and never stress. This keeps stress
--   where it is: no data moves, the app's reads, writes, drafts and
--   offline saves stay as they are, and no coach screen reads debriefs
--   yet. Moving stress to its own table would have meant moving data and
--   changing the app with a fallback, for the same result.
--
-- WHO CAN SEE WHAT
--   sprint_reviews and tool_work_strategies: own rows only: each person
--   reads, adds, changes and removes their own. No coach part yet (not
--   decided).
--   weekly_debriefs: own rows only from now on. The person's current coach
--   (an active coach linked to them now) reads a debrief only while it is
--   shared, through coach_shared_debrief, and gets the three written
--   answers (what went well, what got in the way, what to adjust), its
--   status and when it was finished: never stress, and never "this week
--   was unusual". Week scores and objective figures stay with the
--   Progress switch, as before. Every row a link points at (the
--   sprint, the Strategy, the decision, the journal entry) must belong to
--   the same person (p1_same_owner), so nobody can link someone else's
--   work. A guest's decision (no person) can never be linked.
--
-- SAFE TO RUN TWICE
--   Yes: tables, indexes, triggers and rules are made only when missing or
--   are dropped and made again; the function is replaced.
--
-- HOW TO RUN
--   After 026 to 028 (it uses p1_same_owner, p1_touch, sprints and
--   plan_strategies). Then run supabase/038_sprint_reviews_and_tool_work_test.sql.
-- =============================================================================

-- ---------------------------------------------------------------- sprint_reviews
create table if not exists public.sprint_reviews (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  sprint_id    uuid not null unique references public.sprints (id) on delete cascade,
  worked_best  text check (char_length(worked_best) <= 4000),
  next_better  text check (char_length(next_better) <= 4000),
  next_choice  text check (next_choice in ('sprint', 'recovery')),
  finished_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
revoke all on table public.sprint_reviews from public, anon, authenticated;
comment on table public.sprint_reviews is
  'The end-of-sprint review''s written answers, one per sprint (Phase 3, Tim 29 Oct). Own rows only.';

-- ---------------------------------------------------------------- tool_work_strategies
create table if not exists public.tool_work_strategies (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  decision_id       uuid references public.decisions (id) on delete cascade,
  journal_entry_id  uuid references public.journal_entries (id) on delete cascade,
  strategy_id       uuid not null references public.plan_strategies (id) on delete cascade,
  sprint_id         uuid references public.sprints (id) on delete set null,
  sprint_week       integer check (sprint_week >= 1),
  linked_on         date not null,
  created_at        timestamptz not null default now(),
  constraint tool_work_strategies_one_item check (num_nonnulls(decision_id, journal_entry_id) = 1),
  constraint tool_work_strategies_sprint_and_week check ((sprint_id is null) = (sprint_week is null)),
  -- One link per item and Strategy (an item may serve several Strategies).
  -- Plain unique keys (an empty item never clashes), so the app can send a
  -- second tag as "do nothing if it's there".
  constraint tool_work_strategies_decision_once unique (decision_id, strategy_id),
  constraint tool_work_strategies_journal_once unique (journal_entry_id, strategy_id)
);
revoke all on table public.tool_work_strategies from public, anon, authenticated;
comment on table public.tool_work_strategies is
  'A tool''s saved work (a decisions row or a journal_entries row, exactly one) tagged to a Strategy, with the sprint and week it was done in (Phase 3, Tim 29 Oct). Own rows only.';

-- "Work this sprint" under a Strategy, and a person's work by sprint and week.
create index if not exists tool_work_strategies_strategy on public.tool_work_strategies (strategy_id);
create index if not exists tool_work_strategies_person_sprint on public.tool_work_strategies (user_id, sprint_id, sprint_week);

-- ---------------------------------------------------------------- same owner, and updated_at
-- Every row a link points at belongs to the same person.
do $owner$
declare r record;
begin
  for r in select * from (values
    ('sprint_reviews', 'sprints', 'sprint_id'),
    ('tool_work_strategies', 'decisions', 'decision_id'),
    ('tool_work_strategies', 'journal_entries', 'journal_entry_id'),
    ('tool_work_strategies', 'plan_strategies', 'strategy_id'),
    ('tool_work_strategies', 'sprints', 'sprint_id')
  ) v(child, parent, col) loop
    execute format('drop trigger if exists %I on public.%I', r.child || '_owner_' || r.col, r.child);
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.p1_same_owner(%L, %L)',
                   r.child || '_owner_' || r.col, r.child, r.parent, r.col);
  end loop;
end
$owner$;

-- A sprint taken away leaves the link (the work still served the
-- Strategy) without its sprint and week, never half of them: the foreign
-- key's "set null" is an update, so this runs before the pair is checked.
create or replace function public.tool_work_sprint_gone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.sprint_id is null then
    new.sprint_week := null;
  end if;
  return new;
end;
$$;
revoke all on function public.tool_work_sprint_gone() from public, anon, authenticated;

drop trigger if exists tool_work_strategies_sprint_gone on public.tool_work_strategies;
create trigger tool_work_strategies_sprint_gone before update on public.tool_work_strategies
  for each row execute function public.tool_work_sprint_gone();

-- The database keeps updated_at itself (server time), so a save can carry
-- the version it was based on (the app's save-version guard).
drop trigger if exists sprint_reviews_touch on public.sprint_reviews;
create trigger sprint_reviews_touch before update on public.sprint_reviews
  for each row execute function public.p1_touch();

-- ---------------------------------------------------------------- rules: own rows only
do $rules$
declare t text;
begin
  foreach t in array array['sprint_reviews', 'tool_work_strategies'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('drop policy if exists "Own rows: read" on public.%I', t);
    execute format('create policy "Own rows: read" on public.%I for select to authenticated using (user_id = (select auth.uid()))', t);
    execute format('drop policy if exists "Own rows: add" on public.%I', t);
    execute format('create policy "Own rows: add" on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', t);
    execute format('drop policy if exists "Own rows: change" on public.%I', t);
    execute format('create policy "Own rows: change" on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('drop policy if exists "Own rows: remove" on public.%I', t);
    execute format('create policy "Own rows: remove" on public.%I for delete to authenticated using (user_id = (select auth.uid()))', t);
  end loop;
end
$rules$;

-- ---------------------------------------------------------------- the weekly stress answer
-- (Tim, 30 Oct.) weekly_debriefs: the person's own rows only. 028's rule
-- "Read: own, or shared" gave the coach the whole row when shared, stress
-- included; it is replaced by name, so a second run finds it gone and
-- makes "Own rows: read" again. Adding, changing and removing stay 028's
-- own-rows rules.
drop policy if exists "Read: own, or shared" on public.weekly_debriefs;
drop policy if exists "Own rows: read" on public.weekly_debriefs;
create policy "Own rows: read" on public.weekly_debriefs for select to authenticated
  using (user_id = (select auth.uid()));

-- What the person's coach reads of a shared debrief: the written answers
-- and where it is up to, never stress or "unusual". Nothing (no row) for
-- anyone but their current coach, for a week not shared, or for a week
-- with no debrief; someone signed out can't call it.
create or replace function public.coach_shared_debrief(p_user uuid, p_sprint uuid, p_week integer)
returns table (debrief_id uuid, sprint_id uuid, sprint_week integer, went_well text, got_in_way text, adjust text,
               status text, finished_at timestamptz, updated_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select d.id, d.sprint_id, d.sprint_week, d.went_well, d.got_in_way, d.adjust, d.status, d.finished_at, d.updated_at
  from public.weekly_debriefs d
  where d.user_id = p_user and d.sprint_id = p_sprint and d.sprint_week = p_week
    and d.shared_with_coach
    and (select auth.uid()) is not null and d.user_id <> (select auth.uid())
    and public.is_coach_of(d.user_id);
$$;
revoke all on function public.coach_shared_debrief(uuid, uuid, integer) from public, anon;
grant execute on function public.coach_shared_debrief(uuid, uuid, integer) to authenticated;
comment on function public.coach_shared_debrief(uuid, uuid, integer) is
  'A shared weekly debrief, for the person''s current coach only: the written answers, never stress (Phase 3, Tim 30 Oct).';

-- Records itself where the migration log (025) is there; on a database
-- without it yet, this does nothing rather than stop the migration.
do $$
begin
  if to_regprocedure('public.record_migration(integer,text)') is not null then
    perform public.record_migration(38, '038_sprint_reviews_and_tool_work');
  end if;
end;
$$;
