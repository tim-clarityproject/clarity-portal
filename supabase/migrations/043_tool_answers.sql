-- =============================================================================
-- 043_tool_answers.sql
-- Phase 8a step 3 (mock-up M10, version 5.6; 14 Nov 2026): where the two
-- Visual tools keep their saved work.
--
-- WHAT THIS DOES (plain English)
--     tool_answers   one row per saved item of a tool that keeps its own
--                    answers: the Team performance check ('team_check':
--                    who reports to the person, with each one's trust,
--                    alignment and autonomy as 1 to 5, and the check
--                    before it) and the Emotional wash ('emotional_wash').
--                    Each row has the tool, a name for the lists, draft or
--                    completed, the answers themselves (one JSON value, up
--                    to about 200,000 characters), whether the person
--                    chose "You and [coach]", and when it was finished.
--   Additive: a new table only. Nothing old reads it and nothing else changes.
--
-- WHY A TABLE OF ITS OWN, NOT `decisions`
--   `decisions` takes only a fixed list of tool types, and 035 (not yet run
--   anywhere) drops and remakes that list. Adding to it here would be
--   undone, or refused, whenever 035 ran after 043. A table of its own
--   depends on neither, and keeps a private tool's rows (the Emotional
--   wash) away from anything a guest link or a coach's read reaches.
--
-- WHO CAN SEE WHAT
--   Own rows only: each person reads, adds, changes and removes their own.
--   Nobody else reads any of it: not a coach, not the people named in a
--   Team performance check, not someone signed out. `shared_with_coach`
--   records the person's choice ("You and Tim"); no rule or function reads
--   it yet, so a coach sees nothing until a later migration says how. An
--   Emotional wash can never be marked as shared (a check refuses it).
--
-- SAFE TO RUN TWICE
--   Yes: the table, its index, its trigger and its rules are made only when
--   missing, or dropped and made again.
--
-- HOW TO RUN
--   After 026 (it uses p1_touch when it is there; without it the app's own
--   updated_at is kept). Needs nothing of 035 or 042. Then run
--   supabase/043_tool_answers_test.sql.
-- =============================================================================

create table if not exists public.tool_answers (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  tool               text not null,
  title              text not null default '',
  status             text not null default 'draft',
  answers            jsonb not null default '{}'::jsonb,
  shared_with_coach  boolean not null default false,
  finished_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint tool_answers_tool check (tool in ('team_check', 'emotional_wash')),
  constraint tool_answers_status check (status in ('draft', 'completed')),
  constraint tool_answers_title check (char_length(title) <= 200),
  constraint tool_answers_answers check (jsonb_typeof(answers) = 'object' and pg_column_size(answers) <= 200000),
  -- An Emotional wash is private, like the Journal: never shared.
  constraint tool_answers_wash_private check (not (tool = 'emotional_wash' and shared_with_coach))
);
revoke all on table public.tool_answers from public, anon, authenticated;
comment on table public.tool_answers is
  'One saved item of a tool that keeps its own answers: the Team performance check (team_check) and the Emotional wash (emotional_wash). Phase 8a, migration 043. Own rows only; shared_with_coach records the person''s choice and nothing reads it yet.';
comment on column public.tool_answers.answers is
  'The tool''s answers as the app saves them (src/lib/teamCheck/model.js savedAnswers; the Emotional wash''s own).';

-- A person's saved items of one tool, newest first.
create index if not exists tool_answers_person_tool on public.tool_answers (user_id, tool, updated_at desc);

-- The database keeps updated_at itself where Phase 1's helper is there.
do $touch$
begin
  if to_regprocedure('public.p1_touch()') is not null then
    drop trigger if exists tool_answers_touch on public.tool_answers;
    create trigger tool_answers_touch before update on public.tool_answers
      for each row execute function public.p1_touch();
  end if;
end
$touch$;

-- ---------------------------------------------------------------- rules: own rows only
alter table public.tool_answers enable row level security;
revoke all on table public.tool_answers from public, anon, authenticated;
grant select, insert, update, delete on public.tool_answers to authenticated;
drop policy if exists "Own rows: read" on public.tool_answers;
create policy "Own rows: read" on public.tool_answers for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "Own rows: add" on public.tool_answers;
create policy "Own rows: add" on public.tool_answers for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "Own rows: change" on public.tool_answers;
create policy "Own rows: change" on public.tool_answers for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "Own rows: remove" on public.tool_answers;
create policy "Own rows: remove" on public.tool_answers for delete to authenticated using (user_id = (select auth.uid()));

-- Records itself in the migration log (025).
select public.record_migration(43, '043_tool_answers');
