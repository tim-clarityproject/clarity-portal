-- =============================================================================
-- 055_own_questions.sql
-- Phase 6a run 7 (mock-up "Your own questions", version 3; Tim, 22 Nov 2026):
-- up to 2 questions of a person's own in the Daily plan, the Daily review
-- and the Weekly performance debrief, set only in My Account, Settings, and
-- questions a coach suggests to their own client.
--
-- WHAT THIS DOES (plain English)
--   own_questions            one row per question a person keeps: which tool
--                            (daily_plan, daily_review, weekly_debrief), its
--                            words (up to 120 characters), how it is answered
--                            (written, yes or no, or a rating with one of six
--                            five-word scales), its place (1 or 2), when it
--                            was made and changed, and when it was deleted
--                            (Undo brings it back; nothing is ever lost).
--                            At most 2 live questions a tool, kept by the
--                            database itself, so two tabs can't make a third.
--   own_question_answers     one row per answer: the question it answers,
--                            the words and answer kind AS THEY WERE when it
--                            was answered (editing a question never rewrites
--                            a past answer), the day it was for (the Daily
--                            plan and review) or the sprint week (the
--                            debrief), and the answer: words, yes or no, or a
--                            rating 1 to 5 with its score 0, 25, 50, 75 or
--                            100 (methods 1.5), stored but read by nothing
--                            yet: no Performance score, streak or pattern.
--                            A skipped question has no row.
--   own_question_suggestions a question a coach suggests to their own client:
--                            from which coach (with the coach's first name as
--                            it was), to which client, the tool, the words,
--                            the answer kind, and the client's choice
--                            (waiting, added, not now). The coach writes it
--                            only through own_question_suggest() and never
--                            reads it back, so Not now tells the coach
--                            nothing. A new suggestion from the same coach
--                            for the same tool takes the older waiting one's
--                            place ('replaced').
--
-- WHO SEES WHAT (row level security)
--   - A person reads and writes only their own questions and answers, and
--     reads and decides only the suggestions made to them.
--   - A coach reads a client's own questions and answers only where the
--     client already shares that tool with them: the weekly debrief, one week
--     at a time by that week's own switch (028's 'debrief' part, through
--     may_see, which covers a cover coach too). The Daily plan and the Daily
--     review are never shared, so their questions and answers never are.
--   - A coach makes a suggestion only for their own client
--     (own_question_suggest asks is_coach_of).
--   - Every coach path needs the 6-digit code, as in 054: is_coach_of and
--     may_see ask coach_code_ok(), and each table carries 054's restrictive
--     rule "Coach data: needs the 6-digit code" (the person's own rows pass
--     with no code, as every client's do).
--
-- SAFE TO RUN TWICE
--   Yes. Tables and indexes are made only if missing; functions, triggers,
--   rules and grants are replaced with the same versions. Additive: nothing
--   that exists changes. Needs 028 (weekly_debriefs), 049 and 054.
--
-- HOW TO RUN
--   After 054. Then supabase/055_own_questions_test.sql, which should end
--   with 055 CHECKS PASSED.
-- =============================================================================

-- ---------------------------------------------------------------- questions
create table if not exists public.own_questions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tool            text not null check (tool in ('daily_plan', 'daily_review', 'weekly_debrief')),
  wording         text not null check (char_length(btrim(wording)) between 1 and 120 and char_length(wording) <= 120),
  answer_type     text not null check (answer_type in ('written', 'yes_no', 'rating')),
  scale           text check (scale in ('often', 'much', 'good', 'agree', 'satisfied', 'likely')),
  position        smallint not null check (position in (1, 2)),
  from_suggestion uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  constraint own_questions_scale check ((answer_type = 'rating') = (scale is not null))
);
comment on table public.own_questions is
  'A person''s own questions (055): up to 2 live a tool, in the Daily plan, the Daily review and the weekly debrief.';
-- At most 2 live questions a tool: each holds place 1 or 2, once.
create unique index if not exists own_questions_place on public.own_questions (user_id, tool, position) where deleted_at is null;
create index if not exists own_questions_user_idx on public.own_questions (user_id, tool);

-- ---------------------------------------------------------------- answers
create table if not exists public.own_question_answers (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  question_id uuid not null references public.own_questions (id) on delete cascade,
  tool        text not null check (tool in ('daily_plan', 'daily_review', 'weekly_debrief')),
  occasion    text not null,
  on_date     date,
  sprint_id   uuid,
  week        integer check (week >= 1),
  wording     text not null check (char_length(btrim(wording)) between 1 and 120 and char_length(wording) <= 120),
  answer_type text not null check (answer_type in ('written', 'yes_no', 'rating')),
  scale       text check (scale in ('often', 'much', 'good', 'agree', 'satisfied', 'likely')),
  written     text check (char_length(written) <= 4000),
  yes_no      boolean,
  rating      smallint check (rating between 1 and 5),
  score       smallint generated always as ((rating - 1) * 25) stored,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (question_id, occasion),
  constraint own_answers_when check (
    (tool in ('daily_plan', 'daily_review') and on_date is not null and sprint_id is null and week is null
       and occasion = to_char(on_date, 'YYYY-MM-DD'))
    or (tool = 'weekly_debrief' and sprint_id is not null and week is not null
       and occasion = sprint_id::text || ':' || week::text)),
  constraint own_answers_kind check (
    (answer_type = 'written' and written is not null and char_length(btrim(written)) > 0 and yes_no is null and rating is null and scale is null)
    or (answer_type = 'yes_no' and yes_no is not null and written is null and rating is null and scale is null)
    or (answer_type = 'rating' and rating is not null and scale is not null and written is null and yes_no is null))
);
comment on table public.own_question_answers is
  'Answers to own questions (055), each with the words it was answered under. Ratings keep their score (0 to 100, methods 1.5); nothing reads it yet.';
create index if not exists own_question_answers_user_idx on public.own_question_answers (user_id, tool, on_date);
create index if not exists own_question_answers_week_idx on public.own_question_answers (user_id, sprint_id, week);

-- ---------------------------------------------------------------- suggestions
create table if not exists public.own_question_suggestions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  coach_user_id    uuid not null references auth.users (id) on delete cascade,
  coach_first_name text not null check (char_length(btrim(coach_first_name)) between 1 and 60),
  tool             text not null check (tool in ('daily_plan', 'daily_review', 'weekly_debrief')),
  wording          text not null check (char_length(btrim(wording)) between 1 and 120 and char_length(wording) <= 120),
  answer_type      text not null check (answer_type in ('written', 'yes_no', 'rating')),
  scale            text check (scale in ('often', 'much', 'good', 'agree', 'satisfied', 'likely')),
  status           text not null default 'waiting' check (status in ('waiting', 'added', 'not_now', 'replaced')),
  created_at       timestamptz not null default now(),
  decided_at       timestamptz,
  home_seen_at     timestamptz,
  constraint own_suggestions_scale check ((answer_type = 'rating') = (scale is not null))
);
comment on table public.own_question_suggestions is
  'A question a coach suggests to their own client (055). Made only by own_question_suggest(); the coach never reads it back.';
create index if not exists own_question_suggestions_user_idx on public.own_question_suggestions (user_id, status);

-- ---------------------------------------------------------------- updated_at
do $touch$
declare t text;
begin
  if to_regprocedure('public.p1_touch()') is not null then
    foreach t in array array['own_questions', 'own_question_answers'] loop
      execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
      execute format('create trigger %I before update on public.%I for each row execute function public.p1_touch()', t || '_touch', t);
    end loop;
  end if;
end
$touch$;

-- ---------------------------------------------------------------- the answer belongs to its own question
-- An answer is the question's own person's, for the question's own tool;
-- the week's sprint is that person's own.
create or replace function public.own_answer_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.own_questions q
                 where q.id = new.question_id and q.user_id = new.user_id and q.tool = new.tool) then
    raise exception 'That question isn''t yours.' using errcode = '42501';
  end if;
  if new.sprint_id is not null and not exists (select 1 from public.sprints s where s.id = new.sprint_id and s.user_id = new.user_id) then
    raise exception 'That sprint isn''t yours.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.own_answer_check() from public, anon, authenticated;
drop trigger if exists own_question_answers_check on public.own_question_answers;
create trigger own_question_answers_check before insert or update on public.own_question_answers
  for each row execute function public.own_answer_check();

-- A question's person, and a suggestion's client, coach and words, never change.
create or replace function public.own_question_keep()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_table_name = 'own_questions' then
    if new.user_id is distinct from old.user_id or new.tool is distinct from old.tool then
      raise exception 'A question stays with its person and tool.' using errcode = '42501';
    end if;
  else
    if new.user_id is distinct from old.user_id or new.coach_user_id is distinct from old.coach_user_id
       or new.coach_first_name is distinct from old.coach_first_name or new.tool is distinct from old.tool
       or new.wording is distinct from old.wording or new.answer_type is distinct from old.answer_type
       or new.scale is distinct from old.scale or new.created_at is distinct from old.created_at then
      raise exception 'Only the choice can change on a suggestion.' using errcode = '42501';
    end if;
    if old.status <> 'waiting' and new.status <> old.status then
      raise exception 'That suggestion has already been answered.' using errcode = 'CC409';
    end if;
    if new.status = 'replaced' and old.status <> 'replaced' and coalesce(current_setting('own.suggesting', true), '') <> 'on' then
      raise exception 'Only a newer suggestion replaces one.' using errcode = '42501';
    end if;
    if new.status <> old.status then
      new.decided_at := now();
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.own_question_keep() from public, anon, authenticated;
drop trigger if exists own_questions_keep on public.own_questions;
create trigger own_questions_keep before update on public.own_questions
  for each row execute function public.own_question_keep();
drop trigger if exists own_question_suggestions_keep on public.own_question_suggestions;
create trigger own_question_suggestions_keep before update on public.own_question_suggestions
  for each row execute function public.own_question_keep();

-- ---------------------------------------------------------------- rules
do $rules$
declare t text;
begin
  foreach t in array array['own_questions', 'own_question_answers', 'own_question_suggestions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('drop policy if exists "Own rows: read" on public.%I', t);
    execute format('create policy "Own rows: read" on public.%I for select to authenticated using (user_id = (select auth.uid()))', t);
  end loop;
  foreach t in array array['own_questions', 'own_question_answers'] loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('drop policy if exists "Own rows: add" on public.%I', t);
    execute format('create policy "Own rows: add" on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', t);
    execute format('drop policy if exists "Own rows: change" on public.%I', t);
    execute format('create policy "Own rows: change" on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('drop policy if exists "Own rows: remove" on public.%I', t);
    execute format('create policy "Own rows: remove" on public.%I for delete to authenticated using (user_id = (select auth.uid()))', t);
  end loop;
end
$rules$;

-- Suggestions: the client reads theirs and makes their choice; nothing else.
grant select on public.own_question_suggestions to authenticated;
grant update (status, home_seen_at) on public.own_question_suggestions to authenticated;
drop policy if exists "Own rows: choose" on public.own_question_suggestions;
create policy "Own rows: choose" on public.own_question_suggestions for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- A coach reads a client's debrief questions and answers only for a week the
-- client shares (028's 'debrief' part, one week at a time). may_see asks
-- is_coach_of or is_cover_of, which ask for the code (054).
create or replace function public.own_debrief_shared(p_owner uuid, p_sprint uuid, p_week integer)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_owner <> (select auth.uid())
     and public.may_see(p_owner, 'debrief', exists (
       select 1 from public.weekly_debriefs d
       where d.user_id = p_owner and d.shared_with_coach
         and (p_sprint is null or (d.sprint_id = p_sprint and d.sprint_week = p_week))));
$$;
comment on function public.own_debrief_shared(uuid, uuid, integer) is
  'Whether the caller, as the person''s coach or cover with the code, may read their debrief own questions (any shared week, when the sprint is null) or one week''s answers (055).';
revoke all on function public.own_debrief_shared(uuid, uuid, integer) from public, anon;
grant execute on function public.own_debrief_shared(uuid, uuid, integer) to authenticated;

drop policy if exists "Coach: shared debrief questions" on public.own_questions;
create policy "Coach: shared debrief questions" on public.own_questions for select to authenticated
  using (tool = 'weekly_debrief' and deleted_at is null and public.own_debrief_shared(user_id, null, null));
drop policy if exists "Coach: shared debrief answers" on public.own_question_answers;
create policy "Coach: shared debrief answers" on public.own_question_answers for select to authenticated
  using (tool = 'weekly_debrief' and public.own_debrief_shared(user_id, sprint_id, week));

-- 054's rule on every table a coach reaches: the coach's side needs the
-- code; the person's own rows pass with none.
do $code$
declare t text;
begin
  if to_regprocedure('public.coach_code_ok()') is null then
    return;
  end if;
  foreach t in array array['own_questions', 'own_question_answers', 'own_question_suggestions'] loop
    execute format('drop policy if exists "Coach data: needs the 6-digit code" on public.%I', t);
    execute format('create policy "Coach data: needs the 6-digit code" on public.%I as restrictive for all to authenticated '
                   'using ((select public.coach_code_ok()) or user_id = (select auth.uid())) '
                   'with check (user_id = (select auth.uid()))', t);
  end loop;
end
$code$;

-- ---------------------------------------------------------------- a coach suggests a question
-- Only for their own client, with the code. The coach's first name is
-- taken from their coaches row as it is now, never typed. A newer
-- suggestion from the same coach for the same tool takes the older waiting
-- one's place. Answers the new id, nothing about the client's choices.
create or replace function public.own_question_suggest(p_client uuid, p_tool text, p_wording text, p_answer_type text, p_scale text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_id uuid;
  v_words text := btrim(coalesce(p_wording, ''));
begin
  perform public._coach_code_needed();
  if p_client is null or not public.is_coach_of(p_client) then
    raise exception 'You can suggest a question only to your own client.' using errcode = '42501';
  end if;
  if char_length(v_words) = 0 then
    raise exception 'Type the question to carry on.' using errcode = '22023';
  end if;
  if char_length(v_words) > 120 then
    raise exception 'Questions can be up to 120 characters.' using errcode = '22001';
  end if;
  select c.display_first_name into v_name from public.coaches c where c.user_id = (select auth.uid()) and c.active;
  perform set_config('own.suggesting', 'on', true);
  update public.own_question_suggestions s set status = 'replaced'
   where s.user_id = p_client and s.coach_user_id = (select auth.uid()) and s.tool = p_tool and s.status = 'waiting';
  insert into public.own_question_suggestions (user_id, coach_user_id, coach_first_name, tool, wording, answer_type, scale)
  values (p_client, (select auth.uid()), v_name, p_tool, v_words, p_answer_type,
          case when p_answer_type = 'rating' then coalesce(p_scale, 'often') else null end)
  returning id into v_id;
  perform set_config('own.suggesting', '', true);
  return v_id;
end;
$$;
comment on function public.own_question_suggest(uuid, text, text, text, text) is
  'A coach suggests a question to their own client (055): needs is_coach_of (and so the code). Never tells the coach what the client chose.';
revoke all on function public.own_question_suggest(uuid, text, text, text, text) from public, anon;
grant execute on function public.own_question_suggest(uuid, text, text, text, text) to authenticated;

do $$
begin
  if to_regprocedure('public.record_migration(integer,text)') is not null then
    perform public.record_migration(55, '055_own_questions');
  end if;
end;
$$;
