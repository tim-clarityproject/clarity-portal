-- =============================================================================
-- 029_checkins_goal_checks_patterns.sql
-- Phase 1 data model, part 4 of 6: the Hardware and Software check-in, the
-- goal check and pattern cards (phase-1-data-model-spec.md sections 4, 9, 10)
--
-- WHAT THIS DOES (plain English)
--     checkins          the First check-in (with its five goals) and each
--                       monthly check-in: the option chosen for every question
--                       (not just its score, so scoring can change later), and
--                       the Hardware, Software and area scores with the
--                       methods version, worked out here from the answers
--                       (methods M13), so they always match
--     checkin_flags     flags for the coach (methods M13): which answer caused
--                       it, a draft note the coach can edit, then Send it or
--                       Not now. Made only when a check-in is finished, never
--                       when the check-in is switched off for the coach, and
--                       never shown to the client unless sent
--     goal_checks       four reasons rated 1 to 5 for an objective (methods M15)
--     pattern_cards     patterns found in a person's numbers (methods M14),
--                       written by the pattern job, never by the app
--     pattern_questions up to 2 of the person's own questions
--
-- WHO CAN SEE WHAT
--   The person: their own check-ins, goal checks, cards meant for them, and
--   any note their coach sent.
--   Their coach: check-ins if "Monthly check-in" is shared (on by default;
--   switching it off hides past check-ins too) and the flags on them; goal
--   checks, cards (coach-only ones included) and questions if "Progress" is
--   shared.
--   An organisation: never, not even as a total (Tim, 26 Oct, 18:48). The
--   one exception, by the person's choice, is in migration 030.
--
-- SAFE TO RUN TWICE
--   Yes.
--
-- HOW TO RUN
--   After 028. Then run supabase/029_checkins_goal_checks_patterns_test.sql.
-- =============================================================================

-- ---------------------------------------------------------------- M13 scoring
-- Points for one answer (methods M13), exactly as src/lib/scores/m13.js.
-- Null for an unanswered or unscored question (H14 to H16); an unknown
-- option is refused.
create or replace function public.score_m13_points(p_code text, p_option text)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
declare
  v numeric;
begin
  if p_option is null or p_code in ('H14', 'H15', 'H16') then
    return null;
  end if;
  v := case
    when p_code = 'H1' then case p_option when 'under_5' then 0 when 'h5_6' then 40 when 'h6_7' then 75
                                          when 'h7_8' then 100 when 'h8_9' then 100 when 'over_9' then 70 end
    when p_code in ('H2', 'H7', 'H12') then case p_option when 'very_poor' then 0 when 'poor' then 25 when 'ok' then 50
                                          when 'good' then 75 when 'very_good' then 100 end
    when p_code = 'H3' then case p_option when 'never' then 100 when 'rarely' then 75 when 'sometimes' then 50
                                          when 'often' then 25 when 'always' then 0 end
    when p_code = 'H4' then case p_option when 'none' then 0 when 'under_1' then 25 when 'h1_2_5' then 60
                                          when 'h2_5_5' then 100 when 'over_5' then 100 end
    when p_code = 'H5' then case p_option when 'd0' then 0 when 'd1' then 50 when 'd2_plus' then 100 end
    when p_code = 'H6' then case p_option when 'under_4' then 100 when 'h4_6' then 75 when 'h6_8' then 50
                                          when 'h8_10' then 25 when 'over_10' then 0 end
    when p_code = 'H8' then case p_option when 'none' then 100 when 'u1_7' then 100 when 'u8_14' then 80
                                          when 'u15_21' then 45 when 'u22_35' then 20 when 'over_35' then 0 end
    when p_code = 'H9' then case p_option when 'never' then 100 when 'less_than_monthly' then 75 when 'monthly' then 50
                                          when 'weekly' then 25 when 'daily' then 0 end
    when p_code in ('H10', 'H11') then case p_option when 'very_low' then 0 when 'low' then 25 when 'ok' then 50
                                          when 'high' then 75 when 'very_high' then 100 end
    when p_code = 'H13' then case p_option when 'not_at_all' then 100 when 'a_little' then 75 when 'moderately' then 50
                                          when 'quite_a_lot' then 25 when 'very_much' then 0 end
    when p_code in ('S1', 'S2', 'S3', 'S4', 'S5', 'S6') then case p_option when 'never' then 0 when 'rarely' then 25
                                          when 'sometimes' then 50 when 'often' then 75 when 'always' then 100 end
  end;
  if v is null then
    raise exception 'Unknown answer % for %', p_option, p_code using errcode = '22023';
  end if;
  return v;
end;
$$;

-- Area scores, the Hardware score and the Software score (methods M13).
create or replace function public.score_m13_checkin(p_answers jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  with areas(kind, key, codes, ord) as (
    values ('hardware', 'sleep', array['H1', 'H2'], 1), ('hardware', 'movement', array['H4', 'H5', 'H6'], 2),
           ('hardware', 'fuel', array['H7', 'H8', 'H9'], 3), ('hardware', 'stress', array['H3'], 4),
           ('hardware', 'mood_energy', array['H10', 'H11'], 5), ('hardware', 'health', array['H12', 'H13'], 6),
           ('software', 'bouncing_back', array['S1'], 7), ('software', 'emotions', array['S2'], 8),
           ('software', 'focus', array['S3'], 9), ('software', 'decisions', array['S4'], 10),
           ('software', 'communication', array['S5'], 11), ('software', 'conflict', array['S6'], 12)
  ),
  scored as (
    select a.kind, a.key, a.ord,
           (select avg(public.score_m13_points(c, p_answers ->> c)) from unnest(a.codes) c) as score
    from areas a
  )
  select jsonb_build_object(
    'hardware', (select avg(score) from scored where kind = 'hardware'),
    'software', (select avg(score) from scored where kind = 'software'),
    'hardwareAreas', (select jsonb_object_agg(key, score order by ord) from scored where kind = 'hardware'),
    'softwareAreas', (select jsonb_object_agg(key, score order by ord) from scored where kind = 'software')
  );
$$;

-- The coach flags (methods M13), as src/lib/scores/m13.js m13Flags.
create or replace function public.score_m13_flags(p_answers jsonb, p_last jsonb)
returns table (code text, reason text)
language sql
immutable
set search_path = ''
as $$
  select f.code, f.reason from (values
    (case when p_answers ->> 'H10' = 'very_low' then 'H10' end, 'mood_very_low', 1),
    (case when p_answers ->> 'H8' = 'over_35' then 'H8' end, 'units_over_35', 2),
    (case when p_answers ->> 'H9' in ('weekly', 'daily') then 'H9' end, 'heavy_sessions_weekly', 3),
    (case when (p_answers ->> 'H1' = 'under_5' or p_answers ->> 'H2' = 'very_poor')
               and (p_last ->> 'H1' = 'under_5' or p_last ->> 'H2' = 'very_poor')
          then case when p_answers ->> 'H1' = 'under_5' then 'H1' else 'H2' end end, 'poor_sleep_two_months', 4),
    (case when p_answers ->> 'H3' = 'always' then 'H3' end, 'stress_always', 5),
    (case when p_answers ->> 'H13' in ('quite_a_lot', 'very_much') then 'H13' end, 'pain', 6)
  ) f(code, reason, ord)
  where f.code is not null
  order by f.ord;
$$;

do $grants$
declare f text;
begin
  foreach f in array array['public.score_m13_points(text, text)', 'public.score_m13_checkin(jsonb)', 'public.score_m13_flags(jsonb, jsonb)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end
$grants$;

-- ---------------------------------------------------------------- tables
create table if not exists public.checkins (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  kind            text not null default 'monthly' check (kind in ('first', 'monthly')),
  month           date not null check (extract(day from month) = 1),
  status          text not null default 'draft' check (status in ('draft', 'finished')),
  answers         jsonb not null default '{}'::jsonb check (jsonb_typeof(answers) = 'object'),
  goals           jsonb check (goals is null or jsonb_typeof(goals) = 'object'),
  hardware_score  numeric,
  software_score  numeric,
  area_scores     jsonb,
  methods_version text,
  finished_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, month),
  check (goals is null or kind = 'first')
);
comment on column public.checkins.goals is
  'First check-in only, coaching clients: G1 to G5 (G3 is three answers), written answers.';
create index if not exists checkins_user_idx on public.checkins (user_id, month desc);

create table if not exists public.checkin_flags (
  id          uuid primary key default gen_random_uuid(),
  checkin_id  uuid not null references public.checkins (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  code        text not null,
  reason      text not null check (reason in ('mood_very_low', 'units_over_35', 'heavy_sessions_weekly',
                                              'poor_sleep_two_months', 'stress_always', 'pain')),
  draft_note  text check (char_length(draft_note) <= 1000),
  status      text not null default 'new' check (status in ('new', 'sent', 'not_now')),
  sent_note   text check (char_length(sent_note) <= 1000),
  sent_at     timestamptz,
  decided_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (checkin_id, reason)
);
create index if not exists checkin_flags_user_idx on public.checkin_flags (user_id, status);
create index if not exists checkin_flags_decided_by_idx on public.checkin_flags (decided_by);

create table if not exists public.goal_checks (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  objective_id uuid not null references public.outcome_objectives (id) on delete cascade,
  occasion     text not null check (occasion in ('sweet_spot', 'sprint_end')),
  sprint_id    uuid references public.sprints (id) on delete set null,
  enjoy        smallint not null check (enjoy between 1 and 5),
  matters      smallint not null check (matters between 1 and 5),
  guilty       smallint not null check (guilty between 1 and 5),
  someone_else smallint not null check (someone_else between 1 and 5),
  checked_on   date not null default current_date,
  created_at   timestamptz not null default now()
);
comment on table public.goal_checks is
  'Methods M15. Own reasons, pressure and balance are worked out, not stored.';
create index if not exists goal_checks_objective_idx on public.goal_checks (objective_id, checked_on desc);
create index if not exists goal_checks_user_idx on public.goal_checks (user_id, checked_on desc);
create index if not exists goal_checks_sprint_idx on public.goal_checks (sprint_id);

create table if not exists public.pattern_questions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  slot        smallint not null check (slot in (1, 2)),
  label       text not null check (char_length(btrim(label)) between 1 and 120),
  cause       jsonb not null check (jsonb_typeof(cause) = 'object'),
  result      jsonb not null check (jsonb_typeof(result) = 'object'),
  archived_at timestamptz,
  created_at  timestamptz not null default now()
);
create unique index if not exists pattern_questions_one_per_slot on public.pattern_questions (user_id, slot) where archived_at is null;

create table if not exists public.pattern_cards (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  link_id            text not null check (link_id in ('L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'Q1', 'Q2')),
  subject_id         uuid,
  question_id        uuid references public.pattern_questions (id) on delete cascade,
  direction          text not null check (direction in ('positive', 'negative')),
  strength           text not null check (strength in ('strong', 'clear')),
  coach_only         boolean not null default false,
  figures            jsonb not null check (jsonb_typeof(figures) = 'object'),
  methods_version    text not null,
  first_shown_at     timestamptz not null default now(),
  last_confirmed_at  timestamptz not null default now(),
  removed_at         timestamptz,
  hidden_by_coach_at timestamptz,
  hidden_by          uuid references auth.users (id) on delete set null,
  created_at         timestamptz not null default now(),
  check (direction = 'positive' or coach_only)
);
comment on table public.pattern_cards is
  'Methods M14. figures holds what "How was this worked out?" shows: groups, sizes, averages, usual swing, chance. A negative link is coach-only (pattern rule 18).';
create index if not exists pattern_cards_user_idx on public.pattern_cards (user_id);
create index if not exists pattern_cards_question_idx on public.pattern_cards (question_id);
create index if not exists pattern_cards_hidden_by_idx on public.pattern_cards (hidden_by);

-- ---------------------------------------------------------------- check-in rules
-- Validates the answers and goals, and works out the scores (methods M13)
-- whatever the app sent, so they always match the answers.
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
  new.methods_version := '1.1';
  if new.status = 'finished' and new.finished_at is null then
    new.finished_at := now();
  end if;
  return new;
end;
$$;
revoke all on function public.checkins_score() from public, anon, authenticated;
drop trigger if exists checkins_score on public.checkins;
create trigger checkins_score before insert or update on public.checkins
  for each row execute function public.checkins_score();

-- When a check-in is finished, its flags are made for the coach: only if
-- the person has a coach and the check-in is shared with them.
create or replace function public.checkins_flag()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  last_answers jsonb;
begin
  if new.status <> 'finished' or (tg_op = 'UPDATE' and old.status = 'finished' and old.answers = new.answers) then
    return new;
  end if;
  if not exists (select 1 from public.coach_clients cc where cc.client_id = new.user_id and cc.ended_at is null)
     or not public.sharing_is_on(new.user_id, 'checkin') then
    return new;
  end if;
  select c.answers into last_answers from public.checkins c
   where c.user_id = new.user_id and c.status = 'finished' and c.month < new.month
   order by c.month desc limit 1;
  insert into public.checkin_flags (checkin_id, user_id, code, reason)
  select new.id, new.user_id, f.code, f.reason from public.score_m13_flags(new.answers, last_answers) f
  on conflict (checkin_id, reason) do nothing;
  return new;
end;
$$;
revoke all on function public.checkins_flag() from public, anon, authenticated;
drop trigger if exists checkins_flag on public.checkins;
create trigger checkins_flag after insert or update on public.checkins
  for each row execute function public.checkins_flag();

-- Same owner: goal checks hang off the person's own objective and sprint;
-- cards off their own question.
do $owner$
declare r record;
begin
  for r in select * from (values
    ('goal_checks', 'outcome_objectives', 'objective_id'),
    ('goal_checks', 'sprints', 'sprint_id'),
    ('pattern_cards', 'pattern_questions', 'question_id')
  ) v(child, parent, col) loop
    execute format('drop trigger if exists %I on public.%I', r.child || '_owner_' || r.col, r.child);
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.p1_same_owner(%L, %L)',
                   r.child || '_owner_' || r.col, r.child, r.parent, r.col);
  end loop;
end
$owner$;

do $touch$
declare t text;
begin
  foreach t in array array['checkins', 'checkin_flags'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.p1_touch()', t || '_touch', t);
  end loop;
end
$touch$;

-- ---------------------------------------------------------------- grants and rules
do $lock$
declare t text;
begin
  foreach t in array array['checkins', 'checkin_flags', 'goal_checks', 'pattern_questions', 'pattern_cards'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
  end loop;
end
$lock$;

do $rules$
declare r record;
begin
  for r in select * from (values
    ('checkins', 'checkin'),
    ('goal_checks', 'progress'),
    ('pattern_questions', 'progress')
  ) v(t, part) loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', r.t);
    execute format('drop policy if exists "Read: own, or shared" on public.%I', r.t);
    execute format('create policy "Read: own, or shared" on public.%I for select to authenticated using (user_id = (select auth.uid()) or public.may_see(user_id, %L))', r.t, r.part);
    execute format('drop policy if exists "Own rows: add" on public.%I', r.t);
    execute format('create policy "Own rows: add" on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', r.t);
    execute format('drop policy if exists "Own rows: change" on public.%I', r.t);
    execute format('create policy "Own rows: change" on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', r.t);
    execute format('drop policy if exists "Own rows: remove" on public.%I', r.t);
    execute format('create policy "Own rows: remove" on public.%I for delete to authenticated using (user_id = (select auth.uid()))', r.t);
  end loop;
end
$rules$;

-- Flags: only the client's coach, while the check-in is shared. Never the
-- client (a sent note reaches them through public.my_coach_notes()).
grant select on public.checkin_flags to authenticated;
drop policy if exists "Flags: the coach, while shared" on public.checkin_flags;
create policy "Flags: the coach, while shared" on public.checkin_flags for select to authenticated
  using (user_id <> (select auth.uid()) and public.may_see(user_id, 'checkin'));

-- Cards: the person sees the cards meant for them (not coach-only, not
-- hidden by the coach); the coach sees all of a client's cards while
-- "Progress" is shared. Only the pattern job writes them.
grant select on public.pattern_cards to authenticated;
drop policy if exists "Cards: read" on public.pattern_cards;
create policy "Cards: read" on public.pattern_cards for select to authenticated
  using ((user_id = (select auth.uid()) and not coach_only and hidden_by_coach_at is null)
         or (user_id <> (select auth.uid()) and public.may_see(user_id, 'progress')));

-- ---------------------------------------------------------------- checked functions
-- The coach edits a flag's note, then sends it or chooses Not now.
create or replace function public.coach_flag_decide(p_flag uuid, p_action text, p_note text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  f public.checkin_flags;
begin
  select * into f from public.checkin_flags where id = p_flag for update;
  if not found or f.user_id = (select auth.uid()) or not public.may_see(f.user_id, 'checkin') then
    raise exception 'That flag isn''t one of your clients''.' using errcode = '42501';
  end if;
  if p_action = 'draft' then
    update public.checkin_flags set draft_note = left(p_note, 1000) where id = p_flag;
  elsif p_action = 'send' then
    if coalesce(btrim(coalesce(p_note, f.draft_note)), '') = '' then
      raise exception 'Write a note before sending it.' using errcode = '22023';
    end if;
    update public.checkin_flags
       set status = 'sent', sent_note = left(coalesce(p_note, f.draft_note), 1000), sent_at = now(), decided_by = (select auth.uid())
     where id = p_flag;
  elsif p_action = 'not_now' then
    update public.checkin_flags set status = 'not_now', decided_by = (select auth.uid()) where id = p_flag;
  else
    raise exception 'Unknown action %', p_action using errcode = '22023';
  end if;
  return p_action;
end;
$$;

-- The client's notes from their coach: only what was sent, never why.
create or replace function public.my_coach_notes()
returns table (note text, sent_at timestamptz, checkin_month date)
language sql
stable
security definer
set search_path = ''
as $$
  select f.sent_note, f.sent_at, c.month
  from public.checkin_flags f join public.checkins c on c.id = f.checkin_id
  where f.user_id = (select auth.uid()) and f.status = 'sent'
  order by f.sent_at desc;
$$;

-- The coach hides one of a client's cards from the client (or shows it again).
create or replace function public.coach_hide_pattern(p_card uuid, p_hide boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid;
begin
  select user_id into owner_id from public.pattern_cards where id = p_card;
  if owner_id is null or owner_id = (select auth.uid()) or not public.may_see(owner_id, 'progress') then
    raise exception 'That card isn''t one of your clients''.' using errcode = '42501';
  end if;
  update public.pattern_cards
     set hidden_by_coach_at = case when p_hide then now() end,
         hidden_by = case when p_hide then (select auth.uid()) end
   where id = p_card;
  return p_hide;
end;
$$;

do $grants$
declare f text;
begin
  foreach f in array array['public.coach_flag_decide(uuid, text, text)', 'public.my_coach_notes()', 'public.coach_hide_pattern(uuid, boolean)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end
$grants$;

select public.record_migration(29, '029_checkins_goal_checks_patterns');
