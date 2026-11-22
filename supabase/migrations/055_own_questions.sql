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
-- PART 2 (run 7, step 3): using a recovery code ends the coach's other
--   sign-ins and keeps the one that used it: coach_authenticators gains
--   others_ended_at and kept_session; _coach_auth_session_ok, coach_code_ok,
--   coach_recovery_code_use and coach_auth_state are redefined with the
--   same names and arguments. Test: supabase/055_recovery_codes_test.sql.
--
-- SAFE TO RUN TWICE
--   Yes. Tables and indexes are made only if missing; functions, triggers,
--   rules and grants are replaced with the same versions. Additive: nothing
--   that exists changes. Needs 028 (weekly_debriefs), 049 and 054.
--
-- HOW TO RUN
--   After 054. Then supabase/055_own_questions_test.sql (055 CHECKS PASSED)
--   and supabase/055_recovery_codes_test.sql (055 RECOVERY CODES CHECKS
--   PASSED), then 053's and 054's tests.
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

-- =============================================================================
-- PART 2: A USED RECOVERY CODE ENDS THE COACH'S OTHER SIGN-INS (run 7, step 3)
-- =============================================================================
-- =============================================================================
-- 055 part: a recovery code ends the coach's other sign-ins (Phase 6a run 7,
-- step 3; Claude's call). To be folded into 055 by the lead, who records it.
--
-- WHY
--   A coach uses a recovery code because the phone is lost, and the lost
--   phone may be in someone else's hands, still signed in. So using a code
--   ends every other sign-in of the account, as the owner's Reset does, and
--   keeps the one that used it (it goes straight on to set up the new
--   phone). You're in says so: "Your other sign-ins have ended."
--
-- HOW (three layers, each enough on its own where it can act)
--   1. The database's own marker (here): coach_authenticators gets
--      others_ended_at (when the code was used) and kept_session (the
--      sign-in that used it, from its token's session_id). Every check a
--      sign-in passes (053's _coach_auth_session_ok, and so 054's
--      coach_code_ok() and every coach rule and function) now refuses a
--      sign-in that began before others_ended_at and isn't the kept one,
--      exactly as it refuses one from before the owner's reset (its earliest
--      "amr" time). This holds on a hosted project whatever Supabase's own
--      tables allow, so a stolen phone's aal2 sign-in gets no coach data from
--      the moment the code is used, even in the hour its access token lasts.
--   2. Where the database can reach Supabase's own tables (as 053 tries),
--      every other session and its refresh tokens are removed here too.
--   3. The page then asks Supabase itself to end the account's other
--      sessions (supabase.auth.signOut({ scope: 'others' }), Supabase's own
--      logout, which keeps the session that asks), so the other devices'
--      refresh tokens stop working and they drop out of the client portal
--      too. It needs no service key and works on every deployment.
--   A sign-in whose token has no session_id can't be told apart from the
--   others, so no marker is set for it (it would shut itself out); real
--   Supabase tokens always carry one.
--
-- coach_auth_state() also says why a sign-in was ended ('ended_by':
-- 'reset', 'recovery' or 'session'), so Coach sign in can give the right
-- reason.
--
-- Additive and safe to run twice. Needs 053 and 054.
-- =============================================================================

do $need$
begin
  if to_regprocedure('public.coach_code_ok()') is null
     or to_regprocedure('public._coach_signed_in()') is null
     or to_regclass('public.coach_authenticators') is null then
    raise exception 'this part of 055 needs 053 and 054 first';
  end if;
end
$need$;

-- ---------------------------------------------------------------- the marker
alter table public.coach_authenticators add column if not exists others_ended_at timestamptz;
alter table public.coach_authenticators add column if not exists kept_session uuid;
comment on column public.coach_authenticators.others_ended_at is
  'When a recovery code was last used: every sign-in that began before it, other than kept_session, is ended (055).';
comment on column public.coach_authenticators.kept_session is
  'The sign-in (its session_id) that used the recovery code, which carries on (055).';

-- ---------------------------------------------------------------- why a sign-in is ended
-- Null while this sign-in is good; otherwise why it was ended:
--   'reset'    it began before the owner's last reset (053's check);
--   'recovery' it began before a recovery code was used, and isn't the
--              sign-in that used it (this part);
--   'session'  its session has gone from Supabase's own table (where the
--              database can see it).
-- When a sign-in began is the earliest of its "amr" times, else its iat
-- (053's reasoning, kept word for word).
create or replace function public._coach_auth_ended(p_reset timestamptz)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_claims jsonb := (select auth.jwt());
  v_iat bigint;
  v_sid uuid;
  v_there boolean;
  v_ended timestamptz;
  v_kept uuid;
begin
  begin
    select min((m ->> 'timestamp')::bigint) into v_iat
      from jsonb_array_elements(case when jsonb_typeof(v_claims -> 'amr') = 'array' then v_claims -> 'amr' else '[]'::jsonb end) m
     where jsonb_typeof(m) = 'object' and (m ->> 'timestamp') ~ '^[0-9]{1,12}$';
  exception when others then v_iat := null;
  end;
  if v_iat is null then
    begin
      v_iat := nullif(v_claims ->> 'iat', '')::bigint;
    exception when others then v_iat := null;
    end;
  end if;
  if p_reset is not null and v_iat is not null and to_timestamp(v_iat) < p_reset then
    return 'reset';
  end if;
  begin
    v_sid := nullif(v_claims ->> 'session_id', '')::uuid;
  exception when others then v_sid := null;
  end;
  select a.others_ended_at, a.kept_session into v_ended, v_kept
    from public.coach_authenticators a where a.user_id = (select auth.uid());
  -- A sign-in that can't say when it began is treated as one from before.
  if v_ended is not null and v_sid is distinct from v_kept
     and (v_iat is null or to_timestamp(v_iat) < v_ended) then
    return 'recovery';
  end if;
  if v_sid is null or to_regclass('auth.sessions') is null then
    return null;
  end if;
  begin
    execute 'select exists (select 1 from auth.sessions where id = $1)' into v_there using v_sid;
  exception when others then return null;
  end;
  return case when coalesce(v_there, true) then null else 'session' end;
end;
$$;
revoke all on function public._coach_auth_ended(timestamptz) from public, anon, authenticated;

-- 053's check, same name and arguments, so every function that asks it
-- (053's, 054's and coach_code_ok()) now also asks about a recovery code.
create or replace function public._coach_auth_session_ok(p_reset timestamptz)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return public._coach_auth_ended(p_reset) is null;
end;
$$;
revoke all on function public._coach_auth_session_ok(timestamptz) from public, anon, authenticated;

-- 054's helper: aal2, and not ended by a reset or a recovery code. Only an
-- account with a reset or a recovery code on record costs the full check.
create or replace function public.coach_code_ok()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_reset timestamptz;
  v_ended timestamptz;
begin
  if coalesce((select auth.jwt()) ->> 'aal', '') <> 'aal2' then
    return false;
  end if;
  select a.last_reset_at, a.others_ended_at into v_reset, v_ended
    from public.coach_authenticators a where a.user_id = (select auth.uid());
  if v_reset is null and v_ended is null then
    return true;
  end if;
  return public._coach_auth_session_ok(v_reset);
end;
$$;
comment on function public.coach_code_ok() is
  'True when this sign-in has given its 6-digit code (aal2) and wasn''t ended by a reset of its authenticator or by a recovery code used elsewhere. Every coach rule and coach function asks it (054, 055).';
revoke all on function public.coach_code_ok() from public;
grant execute on function public.coach_code_ok() to anon, authenticated, service_role;

-- Removes a person's other sessions and their refresh tokens, where the
-- database can reach Supabase's own tables. Answers how many sessions went,
-- or null where it couldn't (the page's own Supabase sign out does it then).
create or replace function public._coach_auth_end_others(p_user uuid, p_keep uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare s integer;
begin
  if p_keep is null or to_regclass('auth.sessions') is null then
    return null;
  end if;
  begin
    if to_regclass('auth.refresh_tokens') is not null then
      execute 'delete from auth.refresh_tokens where user_id = $1::text and session_id is distinct from $2' using p_user, p_keep;
    end if;
    execute 'delete from auth.sessions where user_id = $1 and id <> $2' using p_user, p_keep;
    get diagnostics s = row_count;
  exception when others then s := null;
  end;
  return s;
end;
$$;
revoke all on function public._coach_auth_end_others(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- a code, used
-- 054's version, with the other sign-ins ended once the code is right.
create or replace function public.coach_recovery_code_use(p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  a public.coach_authenticators;
  v_plain text := public._coach_code_plain(p_code);
  v_hit uuid;
  v_left integer;
  v_removed jsonb;
  v_sid uuid;
  v_sessions integer;
  r record;
begin
  if me is null or not public._coach_signed_in() then
    raise exception 'coaches only' using errcode = '42501';
  end if;
  -- One at a time for this coach: a second tab waits here, then finds the code used.
  a := public._coach_auth_lock(me);
  -- A sign-in from before the owner's reset, or ended by a code used
  -- elsewhere, changes nothing here.
  if not public._coach_auth_session_ok(a.last_reset_at) then
    return jsonb_build_object('status', 'signed_out');
  end if;
  if a.wait_until is not null and a.wait_until > now() then
    return jsonb_build_object('status', 'wait', 'wait_seconds', ceil(extract(epoch from (a.wait_until - now())))::integer);
  end if;
  if v_plain ~ '^[a-z0-9]{8}$' then
    for r in select id, code_hash from public.coach_recovery_codes where user_id = me and used_at is null order by position loop
      if extensions.crypt(v_plain, r.code_hash) = r.code_hash then
        v_hit := r.id;
        exit;
      end if;
    end loop;
  end if;
  if v_hit is null then
    -- Wrong or already used: the same answer either way, so it tells a guesser nothing.
    if a.wrong_tries + 1 >= 5 then
      update public.coach_authenticators set wrong_tries = 0, wait_until = now() + interval '30 seconds', updated_at = now() where user_id = me;
      -- 'started': this was the 5th, so the page says so once (a try during the wait doesn't).
      return jsonb_build_object('status', 'wait', 'wait_seconds', 30, 'started', true);
    end if;
    update public.coach_authenticators set wrong_tries = a.wrong_tries + 1, updated_at = now() where user_id = me;
    return jsonb_build_object('status', 'no_match', 'tries_left', 4 - a.wrong_tries);
  end if;
  update public.coach_recovery_codes set used_at = now() where id = v_hit and used_at is null;
  select count(*) into v_left from public.coach_recovery_codes where user_id = me and used_at is null;
  -- The phone is lost: its factor goes, so the new phone can be set up.
  v_removed := public._coach_auth_remove(me, false);
  -- And it may be in someone else's hands: every other sign-in ends, this one carries on.
  begin
    v_sid := nullif((select auth.jwt()) ->> 'session_id', '')::uuid;
  exception when others then v_sid := null;
  end;
  v_sessions := public._coach_auth_end_others(me, v_sid);
  update public.coach_authenticators
     set wrong_tries = 0, wait_until = null, recovered_at = now(), turned_on_at = null, factor_id = null,
         others_ended_at = case when v_sid is null then others_ended_at else now() end,
         kept_session = case when v_sid is null then kept_session else v_sid end,
         updated_at = now()
   where user_id = me;
  return jsonb_build_object('status', 'used', 'codes_left', v_left, 'factors_removed', v_removed -> 'factors',
                            'others_ended', v_sid is not null, 'sessions_removed', v_sessions);
end;
$$;

-- ---------------------------------------------------------------- what the screens read
-- 053's, with why a sign-in was ended.
create or replace function public.coach_auth_state()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  c public.coaches;
  a public.coach_authenticators;
  v_left integer;
  v_total integer;
  v_owner text;
  v_ended text;
begin
  if me is null then
    raise exception 'signed in only' using errcode = '42501';
  end if;
  select * into c from public.coaches where user_id = me and active;
  if c.id is null then
    -- Clients never see any of this.
    return jsonb_build_object('coach', false);
  end if;
  select * into a from public.coach_authenticators where user_id = me;
  select count(*) filter (where used_at is null), count(*) into v_left, v_total
    from public.coach_recovery_codes where user_id = me;
  select o.display_first_name into v_owner from public.coaches o
    where o.role = 'owner' and o.active order by o.created_at limit 1;
  v_ended := public._coach_auth_ended(a.last_reset_at);
  return jsonb_build_object(
    'coach', true,
    'owner', c.role = 'owner',
    'owner_first_name', v_owner,
    'turned_on_at', a.turned_on_at,
    'codes_left', v_left,
    'codes_total', v_total,
    'codes_made_at', a.codes_made_at,
    'codes_saved', a.codes_saved_at is not null and v_total > 0,
    'wait_seconds', greatest(0, ceil(extract(epoch from (a.wait_until - now()))))::integer,
    'recovered_at', a.recovered_at,
    'last_reset_at', a.last_reset_at,
    'session_ok', v_ended is null,
    'ended_by', v_ended
  );
end;
$$;

do $grants$
declare fn text;
begin
  foreach fn in array array['public.coach_auth_state()', 'public.coach_recovery_code_use(text)'] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end
$grants$;

do $$
begin
  if to_regprocedure('public.record_migration(integer,text)') is not null then
    perform public.record_migration(55, '055_own_questions');
  end if;
end;
$$;
