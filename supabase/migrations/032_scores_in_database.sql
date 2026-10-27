-- =============================================================================
-- 032_scores_in_database.sql
-- Phase 1: database copies of the scores coaches, sponsors and leaders see
-- (methods M5, M6, M9, M18 and M19, with the parts they rest on: M0.4's
-- sprint calendar, M1 habits, M2 to-dos, M4 Strategies and M17 before and
-- after impact), and the checked functions that use them
-- (phase-1-data-model-spec.md section 12)
--
-- WHAT THIS DOES (plain English)
--   The same arithmetic as src/lib/scores/, in the database, so what a coach,
--   sponsor or leader sees can never disagree with what the person sees.
--   Both are tested on exactly the same cases (tests/scores/cases.mjs;
--   supabase/032_scores_in_database_test.sql is written from it).
--
--   Pure functions (no table is read), one per section:
--     score_round, score_sprint_calendar (M0.4), score_m1_habit, score_m2_todo,
--     score_week_raw (M4 and M5 from a raw week), score_m6_sprint,
--     score_m9_objective, score_m17_impact, score_m18_pulse, score_m19_group
--   Checked functions that read the tables:
--     freeze_week           a finished week's score into week_scores (M0.4, M0.5)
--     make_sprint_summary   the frozen end-of-sprint summary for a seat (M6)
--     org_figures           the four layers for a leader's teams (M19), with
--                           the group-size rules: use figures only for groups
--                           of 3 or more seats; objective and Strategy figures
--                           at any size; self-reported totals at any size;
--                           the monthly check-in never
--     pulse_results         a boss's pulse results (M18)
--     impact_results        a person's before and after impact (M17)
--     coach_client_list     the coach's (or owner's) client list, paged and
--                           filtered, with personal fields only where shared
--
-- SAFE TO RUN TWICE
--   Yes. Functions are replaced with the same versions; two columns are
--   added to sprint_summaries only if missing.
--
-- HOW TO RUN
--   After 031. Then run supabase/032_scores_in_database_test.sql.
-- =============================================================================

-- The person's sprint average and standard, kept with each frozen summary
-- for the organisation's "% at their own standard" total only. The checked
-- functions that sponsors and leaders read never return them.
alter table public.sprint_summaries add column if not exists sprint_average numeric;
alter table public.sprint_summaries add column if not exists standard integer;

-- ---------------------------------------------------------------- M0.1
create or replace function public.score_round(p numeric)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case when p is null then null else floor(p + 0.5 + 0.000000001)::integer end;
$$;

-- ---------------------------------------------------------------- M0.4
-- A sprint's weeks in sprint time: Recovery days (from a Recovery's start to
-- the day before "ready") are skipped; while a Recovery is still running,
-- sprint time stops at its start. As m0SprintCalendar.
-- p_sprint: { start, lengthWeeks, recoveries: [{ start, end }] }
create or replace function public.score_sprint_calendar(p_sprint jsonb, p_today date)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  total integer := (p_sprint ->> 'lengthWeeks')::integer * 7;
  start_on date := (p_sprint ->> 'start')::date;
  horizon date := null;
  rec jsonb;
  rec_days date[] := '{}';
  d date;
  sprint_days date[] := '{}';
  weeks jsonb := '[]';
  w integer;
  wd date[];
  inside integer;
  open_rec boolean := false;
begin
  for rec in select * from jsonb_array_elements(coalesce(p_sprint -> 'recoveries', '[]')) loop
    if rec ->> 'end' is null then
      open_rec := true;
      horizon := least(coalesce(horizon, (rec ->> 'start')::date - 1), (rec ->> 'start')::date - 1);
      d := (rec ->> 'start')::date;
      while d <= greatest((rec ->> 'start')::date, p_today) loop
        rec_days := rec_days || d; d := d + 1;
      end loop;
    else
      d := (rec ->> 'start')::date;
      while d <= (rec ->> 'end')::date - 1 loop
        rec_days := rec_days || d; d := d + 1;
      end loop;
    end if;
  end loop;
  d := start_on;
  while cardinality(sprint_days) < total and (horizon is null or d <= horizon) loop
    if not (d = any (rec_days)) then
      sprint_days := sprint_days || d;
    end if;
    d := d + 1;
  end loop;
  w := 0;
  while w * 7 < cardinality(sprint_days) loop
    wd := sprint_days[w * 7 + 1 : least(w * 7 + 7, cardinality(sprint_days))];
    select count(*) into inside from unnest(rec_days) r where r between wd[1] and wd[cardinality(wd)];
    weeks := weeks || jsonb_build_object(
      'number', w + 1, 'start', wd[1], 'end', wd[cardinality(wd)], 'days', to_jsonb(wd),
      'recoveryDaysInside', inside, 'finished', cardinality(wd) = 7 and wd[cardinality(wd)] < p_today);
    w := w + 1;
  end loop;
  return jsonb_build_object(
    'weeks', weeks,
    'plannedEnd', start_on + total - 1,
    'actualEnd', case when open_rec or cardinality(sprint_days) < total then null else sprint_days[total] end);
end;
$$;

-- The sprint week a day belongs to (m0WeekOfDay).
create or replace function public.score_week_of_day(p_weeks jsonb, p_day date)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case when p_day is null or jsonb_array_length(coalesce(p_weeks, '[]')) = 0
                   or p_day < (p_weeks -> 0 ->> 'start')::date then null
         else (select (w ->> 'number')::integer from jsonb_array_elements(p_weeks) with ordinality x(w, i)
               where (w ->> 'end')::date >= p_day order by i limit 1) end;
$$;

-- ---------------------------------------------------------------- M1
create or replace function public.score_m1_limit(p_logged numeric, p_limit numeric)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case when p_logged <= p_limit then 100
              else greatest(0, 1 - (p_logged - p_limit) / greatest(p_limit, 1)) * 100 end;
$$;

-- One habit's score for one week, as m1HabitScore. p_week: { days,
-- workingDays, soFarUntil }. Returns { score, notLogged }.
create or replace function public.score_m1_habit(p_habit jsonb, p_logs jsonb, p_week jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  measure text := p_habit ->> 'measure';
  until date := (p_week ->> 'soFarUntil')::date;
  days date[] := array(select jsonb_array_elements_text(p_week -> 'days')::date);
  all_working date[] := array(select jsonb_array_elements_text(coalesce(p_week -> 'workingDays', '[]'))::date);
  working date[];
  n_used integer; total numeric; yes_days integer; logged_days integer; logged_working integer;
  share numeric;
  target numeric; got numeric; lim numeric;
  avg_rating numeric; t numeric;
begin
  working := array(select d from unnest(all_working) d where until is null or d <= until);
  with used as (
    select (l ->> 'date')::date as day,
           case jsonb_typeof(l -> 'value') when 'boolean' then (case when (l ->> 'value')::boolean then 1 else 0 end)
                else (l ->> 'value')::numeric end as v
    from jsonb_array_elements(coalesce(p_logs, '[]')) l
    where (l ->> 'date')::date = any (days)
      and not coalesce((l ->> 'toConfirm')::boolean, false)
      and l -> 'value' is not null and jsonb_typeof(l -> 'value') <> 'null'
      and (until is null or (l ->> 'date')::date <= until)
  )
  select count(*), coalesce(sum(v), 0), count(distinct day) filter (where v > 0), count(distinct day),
         count(distinct day) filter (where day = any (working))
    into n_used, total, yes_days, logged_days, logged_working
  from used;
  share := case when until is null then 1
                when cardinality(all_working) > 0 then cardinality(working)::numeric / cardinality(all_working)
                else 0 end;

  if measure in ('yes_no_days_limit', 'count_limit', 'rating') then
    if cardinality(working) = 0 and n_used = 0 then
      return jsonb_build_object('score', null, 'notLogged', false);
    end if;
    if logged_working * 2 < cardinality(working) then
      return jsonb_build_object('score', 0, 'notLogged', true);
    end if;
    if measure = 'rating' then
      if n_used = 0 then
        return jsonb_build_object('score', null, 'notLogged', false);
      end if;
      avg_rating := total / n_used;
      t := (p_habit ->> 'target')::numeric;
      if p_habit ->> 'direction' = 'lower' then
        return jsonb_build_object('score', least(1, greatest(0, (5 - avg_rating) / (5 - t))) * 100, 'notLogged', false);
      end if;
      return jsonb_build_object('score', least(1, greatest(0, (avg_rating - 1) / (t - 1))) * 100, 'notLogged', false);
    end if;
    if measure = 'yes_no_days_limit' then
      return jsonb_build_object('score', public.score_m1_limit(yes_days, (p_habit ->> 'limit')::numeric), 'notLogged', false);
    end if;
    lim := case when p_habit ->> 'limitPer' = 'day' then (p_habit ->> 'limit')::numeric * logged_days
                else (p_habit ->> 'limit')::numeric end;
    return jsonb_build_object('score', public.score_m1_limit(total, lim), 'notLogged', false);
  end if;

  if measure = 'yes_no_weekly' then
    if yes_days > 0 then
      return jsonb_build_object('score', 100, 'notLogged', false);
    end if;
    return jsonb_build_object('score', case when until is null then 0 end, 'notLogged', false);
  end if;

  if measure = 'yes_no_days_target' then
    target := coalesce((p_habit ->> 'target')::numeric, cardinality(all_working));
    got := yes_days;
  elsif measure in ('count', 'amount') then
    target := case when p_habit ->> 'targetPer' = 'day' then (p_habit ->> 'target')::numeric * cardinality(all_working)
                   else (p_habit ->> 'target')::numeric end;
    got := total;
  else
    raise exception 'Unknown measure: %', measure using errcode = '22023';
  end if;
  target := target * share;
  if target is null or target <= 0 then
    return jsonb_build_object('score', null, 'notLogged', false);
  end if;
  return jsonb_build_object('score', least(1, got / target) * 100, 'notLogged', false);
end;
$$;

-- ---------------------------------------------------------------- M2
-- The week a to-do was planned for at the start of a day (p_inclusive
-- false: moves on earlier days) or after the day (true: moves that day too).
create or replace function public.score_m2_planned(p_todo jsonb, p_day date, p_inclusive boolean)
returns integer
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    (select case when m -> 'toWeek' is null or jsonb_typeof(m -> 'toWeek') = 'null' then null else (m ->> 'toWeek')::integer end
       from jsonb_array_elements(coalesce(p_todo -> 'moves', '[]')) with ordinality x(m, i)
      where case when p_inclusive then (m ->> 'on')::date <= p_day else (m ->> 'on')::date < p_day end
      order by (m ->> 'on')::date desc, i desc limit 1),
    case when exists (select 1 from jsonb_array_elements(coalesce(p_todo -> 'moves', '[]')) m
                      where case when p_inclusive then (m ->> 'on')::date <= p_day else (m ->> 'on')::date < p_day end)
         then null
         else (p_todo ->> 'plannedWeek')::integer end);
$$;

-- A to-do's score in one week: 100, 0, or null when it doesn't count there.
-- As m2TodoScore.
create or replace function public.score_m2_todo(p_todo jsonb, p_week jsonb, p_weeks jsonb, p_so_far boolean)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
declare
  wk integer := (p_week ->> 'number')::integer;
  w_start date := (p_week ->> 'start')::date;
  w_end date := (p_week ->> 'end')::date;
  done_on date := (p_todo ->> 'doneOn')::date;
  created date := (p_todo ->> 'createdOn')::date;
  at_start integer; at_end integer;
begin
  if coalesce((p_todo ->> 'deleted')::boolean, false) then
    return null;
  end if;
  if done_on is not null and public.score_week_of_day(p_weeks, done_on) = wk then
    return 100;
  end if;
  if done_on is not null and done_on < w_start then
    return null;
  end if;
  if created is not null and created > w_end then
    return null;
  end if;
  if p_so_far then
    return null;
  end if;
  at_start := case when created is not null and created > w_start then (p_todo ->> 'plannedWeek')::integer
                   else public.score_m2_planned(p_todo, w_start, false) end;
  at_end := public.score_m2_planned(p_todo, w_end, true);
  if (at_start is not null and at_start <= wk) or (at_end is not null and at_end <= wk) then
    return 0;
  end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------- M4 and M5
-- The week from its raw parts, as m5WeekFromRaw: the same input, the same
-- answer. Returns { score, strategies: [{ id, served, score }] }.
create or replace function public.score_week_raw(p jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  so_far boolean := p ->> 'soFarUntil' is not null;
  wk jsonb := jsonb_build_object('days', p -> 'week' -> 'days', 'workingDays', coalesce(p -> 'workingDays', '[]'), 'soFarUntil', p -> 'soFarUntil');
  weeks jsonb := coalesce(p -> 'weeks', jsonb_build_array(p -> 'week'));
  h jsonb; t jsonb; w jsonb; s jsonb; sid text;
  r jsonb;
  items jsonb := '[]';
  num numeric; den numeric; sc numeric;
  strategies jsonb := '[]';
  wnum numeric := 0; wden numeric := 0;
  wt integer;
begin
  for h in select * from jsonb_array_elements(coalesce(p -> 'habits', '[]')) loop
    r := public.score_m1_habit(h,
           (select coalesce(jsonb_agg(l), '[]') from jsonb_array_elements(coalesce(p -> 'logs', '[]')) l where l ->> 'habitId' = h ->> 'id'),
           wk);
    if r -> 'score' is not null and jsonb_typeof(r -> 'score') <> 'null' then
      items := items || jsonb_build_object('strategyId', h ->> 'strategyId', 'impact', coalesce(h -> 'impact', '2'::jsonb), 'score', r -> 'score');
    end if;
  end loop;
  for t in select * from jsonb_array_elements(coalesce(p -> 'todos', '[]')) loop
    sc := public.score_m2_todo(t, p -> 'week', weeks, so_far);
    if sc is not null then
      items := items || jsonb_build_object('strategyId', t ->> 'strategyId', 'impact', coalesce(t -> 'impact', '2'::jsonb), 'score', sc);
    end if;
  end loop;
  for w in select * from jsonb_array_elements(coalesce(p -> 'wins', '[]')) loop
    continue when coalesce((w ->> 'deleted')::boolean, false);
    continue when not ((w ->> 'date') in (select jsonb_array_elements_text(p -> 'week' -> 'days')));
    continue when so_far and (w ->> 'date')::date > (p ->> 'soFarUntil')::date;
    for sid in select distinct x from jsonb_array_elements_text(coalesce(w -> 'strategyIds', '[]')) x loop
      items := items || jsonb_build_object('strategyId', sid, 'impact', coalesce(w -> 'impact', '2'::jsonb), 'score', 100);
    end loop;
  end loop;
  for s in select * from jsonb_array_elements(coalesce(p -> 'strategies', '[]')) loop
    select sum(wt2 * (i ->> 'score')::numeric), sum(wt2) into num, den
    from (select i, case when (i ->> 'impact') in ('1', '2', '3') then (i ->> 'impact')::integer
                         when lower(i ->> 'impact') = 'low' then 1 when lower(i ->> 'impact') = 'high' then 3 else 2 end as wt2
          from jsonb_array_elements(items) i where i ->> 'strategyId' = s ->> 'id') x;
    sc := case when coalesce(den, 0) > 0 then num / den end;
    strategies := strategies || jsonb_build_object('id', s ->> 'id', 'served', coalesce((s ->> 'served')::integer, 0), 'score', sc);
    if sc is not null then
      wt := greatest(1, coalesce((s ->> 'served')::integer, 0));
      wnum := wnum + wt * sc;
      wden := wden + wt;
    end if;
  end loop;
  return jsonb_build_object('score', case when wden > 0 then wnum / wden end, 'strategies', strategies);
end;
$$;

-- ---------------------------------------------------------------- M6
-- p_weeks: [{ number, score, finished }]. As m6SprintFigures.
create or replace function public.score_m6_sprint(p_weeks jsonb, p_standard integer, p_previous numeric)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  with done as (
    select (w ->> 'number')::integer as n, (w ->> 'score')::numeric as s
    from jsonb_array_elements(coalesce(p_weeks, '[]')) w
    where coalesce((w ->> 'finished')::boolean, false) and w -> 'score' is not null and jsonb_typeof(w -> 'score') <> 'null'
  ),
  agg as (select avg(s) as average, count(*) as finished_weeks,
                 count(*) filter (where public.score_round(s) >= p_standard) as at_standard from done),
  best as (select n, s from done order by public.score_round(s) desc, n desc limit 1)
  select jsonb_build_object(
    'average', a.average,
    'finishedWeeks', a.finished_weeks,
    'weeksAtStandard', a.at_standard,
    'best', (select jsonb_build_object('number', n, 'score', s) from best),
    'change', case when p_previous is null or a.average is null then null
                   else public.score_round(a.average) - public.score_round(p_previous) end)
  from agg a;
$$;

-- ---------------------------------------------------------------- M9
-- One objective's progress, pace and status, as m9Objective.
create or replace function public.score_m9_objective(p_obj jsonb, p_as_of date, p_sprint_start date)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  kind text := p_obj ->> 'kind';
  start_on date := (p_obj ->> 'startOn')::date;
  weeks_since integer := floor((p_as_of - start_on) / 7.0);
  too_early boolean := weeks_since < 3;
  reached boolean; on_track boolean; due date;
  down boolean; sgn integer; cur numeric; st numeric; tg numeric; prog numeric;
  m_since numeric; m_left numeric; r_so_far numeric; r_needed numeric; on_pace boolean;
  at_sprint numeric; improving boolean; last_change date; val numeric; f record; not_moving boolean;
begin
  if kind = 'milestone' then
    due := (p_obj ->> 'dueOn')::date;
    reached := p_obj ->> 'reachedOn' is not null and (p_obj ->> 'reachedOn')::date <= p_as_of;
    on_track := reached or p_as_of <= due;
    return jsonb_build_object('kind', 'milestone', 'reached', reached, 'onTrack', on_track, 'tooEarly', too_early,
      'status', case when reached then 'reached' when too_early then 'too_early' when on_track then 'on_track' else 'off_track' end);
  end if;
  down := kind = 'number' and p_obj ->> 'direction' = 'down';
  sgn := case when down then -1 else 1 end;
  st := (p_obj ->> 'start')::numeric;
  tg := (p_obj ->> 'target')::numeric;
  -- the figure in force: the last entered on or before the day, else the start
  cur := coalesce((select (x ->> 'value')::numeric from jsonb_array_elements(coalesce(p_obj -> 'figures', '[]')) with ordinality y(x, i)
                   where (x ->> 'on')::date <= p_as_of order by (x ->> 'on')::date desc, i desc limit 1), st);
  reached := case when down then cur <= tg else cur >= tg end;
  if down then
    prog := case when st = tg then 100 else (st - cur) / (st - tg) * 100 end;
  else
    prog := case when tg = 0 then 100 else cur / tg * 100 end;
  end if;
  prog := least(100, greatest(0, prog));
  m_since := (p_as_of - start_on) / 30.44;
  m_left := ((p_obj ->> 'byWhen')::date - p_as_of) / 30.44;
  r_so_far := case when m_since > 0 then sgn * (cur - st) / m_since end;
  r_needed := case when m_left > 0 then sgn * (tg - cur) / m_left end;
  on_pace := case when reached then true when r_needed is null then false else r_so_far is not null and r_so_far >= r_needed end;
  if p_sprint_start is not null then
    at_sprint := coalesce((select (x ->> 'value')::numeric from jsonb_array_elements(coalesce(p_obj -> 'figures', '[]')) with ordinality y(x, i)
                           where (x ->> 'on')::date <= p_sprint_start - 1 order by (x ->> 'on')::date desc, i desc limit 1), st);
    improving := case when down then cur < at_sprint else cur > at_sprint end;
  else
    improving := false;
  end if;
  val := st; last_change := start_on;
  for f in select (x ->> 'on')::date as d, (x ->> 'value')::numeric as v
           from jsonb_array_elements(coalesce(p_obj -> 'figures', '[]')) with ordinality y(x, i)
           where (x ->> 'on')::date <= p_as_of order by (x ->> 'on')::date, i loop
    if f.v is distinct from val then last_change := f.d; val := f.v; end if;
  end loop;
  not_moving := not reached and floor((p_as_of - last_change) / 7.0) >= 3;
  return jsonb_build_object(
    'kind', kind, 'direction', case when down then 'down' else 'up' end, 'current', cur, 'progress', prog,
    'reached', reached, 'rateSoFar', r_so_far, 'rateNeeded', r_needed, 'onPace', on_pace, 'paceShown', not too_early,
    'improving', improving, 'notMoving', not_moving, 'tooEarly', too_early,
    'status', case when reached then 'reached' when too_early then 'too_early' when on_pace then 'on_track' else 'off_track' end);
end;
$$;

-- ---------------------------------------------------------------- M17
-- p_ratings: [{ raterId, phase: start|end|looking_back, behaviourId, answer }].
-- As m17BeforeAndAfter: only raters who answered at both the start and the end.
create or replace function public.score_m17_impact(p_ratings jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  with r as (
    select x ->> 'raterId' as rater, x ->> 'phase' as phase,
           case x ->> 'answer' when 'never' then 0 when 'rarely' then 25 when 'sometimes' then 50 when 'often' then 75 when 'always' then 100 end::numeric as v
    from jsonb_array_elements(coalesce(p_ratings, '[]')) x
  ),
  paired as (select rater from r where phase = 'start' intersect select rater from r where phase = 'end'),
  a as (
    select (select count(*) from paired) as raters,
           avg(v) filter (where phase = 'start') as s, avg(v) filter (where phase = 'end') as e,
           avg(v) filter (where phase = 'looking_back') as lb
    from r where rater in (select rater from paired) and v is not null
  )
  select case when raters < 2 then jsonb_build_object('enough', false, 'raters', raters)
         else jsonb_build_object('enough', true, 'raters', raters, 'start', s, 'end', e, 'lookingBack', lb,
                                 'change', e - s, 'lookingBackChange', e - lb, 'improved', public.score_round(e - s) >= 10) end
  from a;
$$;

-- ---------------------------------------------------------------- M18
-- The short pulse's five measures, as m18PulseResults: each the average of
-- its answers (0 to 100), the change from the rounded figures, and the
-- lowest (ties in the measures' order) for the next step.
create or replace function public.score_m18_pulse(p_answers jsonb, p_previous jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  with m(key, ord) as (values ('energy', 1), ('sleep', 2), ('stress', 3), ('workload', 4), ('support', 5)),
  v as (
    select m.key, m.ord,
      case m.key
        when 'energy' then case a ->> 'energy' when 'very_low' then 0 when 'low' then 25 when 'ok' then 50 when 'high' then 75 when 'very_high' then 100 end
        when 'sleep' then case a ->> 'sleep' when 'very_poor' then 0 when 'poor' then 25 when 'ok' then 50 when 'good' then 75 when 'very_good' then 100 end
        when 'stress' then case a ->> 'stress' when 'never' then 100 when 'rarely' then 75 when 'sometimes' then 50 when 'often' then 25 when 'always' then 0 end
        else case a ->> m.key when 'never' then 0 when 'rarely' then 25 when 'sometimes' then 50 when 'often' then 75 when 'always' then 100 end
      end::numeric as score
    from m cross join jsonb_array_elements(coalesce(p_answers, '[]')) a
  ),
  agg as (
    select m.key, m.ord, avg(v.score) as figure, count(v.score) as n
    from m left join v on v.key = m.key group by m.key, m.ord
  )
  select jsonb_build_object(
    'answers', jsonb_array_length(coalesce(p_answers, '[]')),
    'measures', (select jsonb_object_agg(key, jsonb_build_object(
                   'figure', figure, 'answers', n,
                   'change', case when p_previous -> key is null or jsonb_typeof(p_previous -> key) = 'null' or figure is null then null
                                  else public.score_round(figure) - public.score_round((p_previous ->> key)::numeric) end)) from agg),
    'lowest', (select key from agg where figure is not null order by figure, ord limit 1));
$$;

-- ---------------------------------------------------------------- M19
-- One group's figures, as m19GroupFigures. p_seats: [{ current, hasPlan,
-- sprintRunning, finishedSeatWeeks, debriefsDone, summary: { objectives:
-- [{ status }], strategies: [{ average }], averageScore, standard } }].
create or replace function public.score_m19_group(p_seats jsonb, p_impact jsonb default '[]', p_goal_checks jsonb default '[]')
returns jsonb
language sql
immutable
set search_path = ''
as $$
  with seats as (select x from jsonb_array_elements(coalesce(p_seats, '[]')) x),
  cur as (select x from seats where coalesce((x ->> 'current')::boolean, false)),
  summ as (select x -> 'summary' as s from seats where x -> 'summary' is not null and jsonb_typeof(x -> 'summary') = 'object'),
  st as (select o ->> 'status' as status from summ, jsonb_array_elements(coalesce(s -> 'objectives', '[]')) o),
  head as (
    select count(*) filter (where status = 'too_early') as too_early, count(*) filter (where status = 'reached') as reached,
           count(*) filter (where status = 'on_track') as on_track, count(*) as total from st),
  n as (select count(*) as seats, coalesce(sum((x ->> 'finishedSeatWeeks')::numeric), 0) as seat_weeks from cur),
  avg_s as (select s from summ where s -> 'averageScore' is not null and jsonb_typeof(s -> 'averageScore') <> 'null'),
  imp as (select x from jsonb_array_elements(coalesce(p_impact, '[]')) x where coalesce((x ->> 'enough')::boolean, false))
  select jsonb_build_object(
    'seats', n.seats,
    'peopleCounted', (select count(*) from summ),
    'headline', jsonb_build_object(
      'percent', case when h.total - h.too_early > 0 then (h.reached + h.on_track)::numeric / (h.total - h.too_early) * 100 end,
      'shown', public.score_round(case when h.total - h.too_early > 0 then (h.reached + h.on_track)::numeric / (h.total - h.too_early) * 100 end),
      'counted', h.total - h.too_early, 'onTrack', h.on_track, 'reached', h.reached, 'tooEarly', h.too_early),
    'use', case when n.seats >= 3 then jsonb_build_object(
      'plansInPlace', (select count(*) filter (where coalesce((x ->> 'hasPlan')::boolean, false)) from cur)::numeric / n.seats * 100,
      'sprintsRunning', (select count(*) filter (where coalesce((x ->> 'sprintRunning')::boolean, false)) from cur)::numeric / n.seats * 100,
      'debriefsDone', case when n.seat_weeks > 0 then (select coalesce(sum((x ->> 'debriefsDone')::numeric), 0) from cur) / n.seat_weeks * 100 end) end,
    'behaviour', jsonb_build_object(
      'atOwnStandard', case when n.seats >= 3 and (select count(*) from avg_s) > 0
                            then (select count(*) filter (where public.score_round((s ->> 'averageScore')::numeric) >= (s ->> 'standard')::integer) from avg_s)::numeric
                                 / (select count(*) from avg_s) * 100 end,
      'averageStrategyScore', (select avg((g ->> 'average')::numeric) from summ, jsonb_array_elements(coalesce(s -> 'strategies', '[]')) g
                               where g -> 'average' is not null and jsonb_typeof(g -> 'average') <> 'null')),
    'outcomes', jsonb_build_object(
      'impactPeople', (select count(*) from imp),
      'impactAverageChange', (select avg((x ->> 'change')::numeric) from imp),
      'impactImproved', case when (select count(*) from imp) > 0
                             then (select count(*) filter (where (x ->> 'improved')::boolean) from imp)::numeric / (select count(*) from imp) * 100 end),
    'goalChecks', case when jsonb_array_length(coalesce(p_goal_checks, '[]')) > 0 then (
      select jsonb_object_agg(r, (select count(*) from jsonb_array_elements(p_goal_checks) g where g ->> 'reading' = r))
      from unnest(array['own_reasons', 'mixed', 'no_strong_reason', 'pressure']) r) end,
    'note', 'Coaching contributes to these results alongside many other things. These figures show change over the same period, not proof of cause.')
  from head h, n;
$$;

-- M15's reading, for anonymous totals (as m15GoalCheck).
create or replace function public.score_m15_reading(p_enjoy integer, p_matters integer, p_guilty integer, p_someone_else integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when b >= 1.5 then 'own_reasons' when b <= -1.5 then 'pressure' when own >= 3 then 'mixed' else 'no_strong_reason' end
  from (select (p_enjoy + p_matters) / 2.0 as own, (p_enjoy + p_matters) / 2.0 - (p_guilty + p_someone_else) / 2.0 as b) x;
$$;

do $grants$
declare f text;
begin
  foreach f in array array[
    'public.score_round(numeric)', 'public.score_sprint_calendar(jsonb, date)', 'public.score_week_of_day(jsonb, date)',
    'public.score_m1_limit(numeric, numeric)', 'public.score_m1_habit(jsonb, jsonb, jsonb)',
    'public.score_m2_planned(jsonb, date, boolean)', 'public.score_m2_todo(jsonb, jsonb, jsonb, boolean)',
    'public.score_week_raw(jsonb)', 'public.score_m6_sprint(jsonb, integer, numeric)',
    'public.score_m9_objective(jsonb, date, date)', 'public.score_m17_impact(jsonb)', 'public.score_m18_pulse(jsonb, jsonb)',
    'public.score_m19_group(jsonb, jsonb, jsonb)', 'public.score_m15_reading(integer, integer, integer, integer)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end
$grants$;

-- ---------------------------------------------------------------- reading the tables
-- The person's local today, from their time zone (UTC if none).
create or replace function public.person_today(p_person uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (now() at time zone coalesce((select s.time_zone from public.person_settings s where s.user_id = p_person), 'UTC'))::date;
$$;

-- A sprint's calendar, from its Recoveries (those of the person that start
-- inside the sprint).
create or replace function public.sprint_calendar(p_sprint uuid, p_today date)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public.score_sprint_calendar(jsonb_build_object(
    'start', s.start_on, 'lengthWeeks', s.length_weeks,
    'recoveries', coalesce((select jsonb_agg(jsonb_build_object('start', r.start_on, 'end', r.end_on) order by r.start_on)
                            from public.recovery_periods r
                            where r.user_id = s.user_id
                              and (r.sprint_id = s.id or (r.sprint_id is null and r.start_on >= s.start_on
                                                          and r.start_on <= coalesce(s.actual_end_on, p_today)))), '[]')), p_today)
  from public.sprints s where s.id = p_sprint;
$$;

-- One week's raw input for score_week_raw, gathered from the tables.
create or replace function public.week_input(p_sprint uuid, p_week integer, p_today date, p_so_far boolean default false)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.sprints;
  cal jsonb;
  wk jsonb;
  pattern smallint[];
  working jsonb;
begin
  select * into s from public.sprints where id = p_sprint;
  if not found then
    return null;
  end if;
  cal := public.sprint_calendar(p_sprint, p_today);
  wk := cal -> 'weeks' -> (p_week - 1);
  if wk is null then
    return null;
  end if;
  pattern := coalesce((select w.days from public.working_patterns w
                       where w.user_id = s.user_id and w.starts_on <= (wk ->> 'start')::date
                       order by w.starts_on desc limit 1), array[0, 1, 2, 3, 4]::smallint[]);
  working := (select coalesce(jsonb_agg(d), '[]') from jsonb_array_elements_text(wk -> 'days') d
              where (extract(isodow from d::date)::integer - 1) = any (pattern));
  return jsonb_build_object(
    'week', jsonb_build_object('number', p_week, 'start', wk -> 'start', 'end', wk -> 'end', 'days', wk -> 'days'),
    'weeks', (select jsonb_agg(jsonb_build_object('number', w -> 'number', 'start', w -> 'start', 'end', w -> 'end')) from jsonb_array_elements(cal -> 'weeks') w),
    'workingDays', working,
    'recoveryDaysInside', wk -> 'recoveryDaysInside',
    'finished', wk -> 'finished',
    'soFarUntil', case when p_so_far and p_today between (wk ->> 'start')::date and (wk ->> 'end')::date then to_jsonb(p_today) end,
    'strategies', (select coalesce(jsonb_agg(jsonb_build_object('id', ps.id,
                     'served', (select count(*) from public.strategy_objectives so join public.outcome_objectives o on o.id = so.objective_id
                                where so.strategy_id = ps.id and o.archived_at is null))), '[]')
                   from public.plan_strategies ps where ps.plan_id = s.plan_id and ps.archived_at is null),
    'habits', (select coalesce(jsonb_agg(jsonb_build_object('id', sh.id, 'strategyId', sh.strategy_id, 'impact', st.impact, 'measure', st.measure,
                 'target', st.target, 'targetPer', st.target_per, 'limit', st.limit_value, 'limitPer', st.limit_per, 'direction', st.direction)), '[]')
               from public.sprint_habits sh
               join lateral (select * from public.sprint_habit_settings x where x.sprint_habit_id = sh.id and x.from_week <= p_week
                             order by x.from_week desc limit 1) st on true
               where sh.sprint_id = p_sprint),
    'logs', (select coalesce(jsonb_agg(jsonb_build_object('habitId', l.sprint_habit_id, 'date', l.local_date, 'value', l.value, 'toConfirm', l.to_confirm)), '[]')
             from public.habit_logs l join public.sprint_habits sh on sh.id = l.sprint_habit_id
             where sh.sprint_id = p_sprint and l.local_date between (wk ->> 'start')::date and (wk ->> 'end')::date),
    'todos', (select coalesce(jsonb_agg(jsonb_build_object(
                'id', t.id, 'strategyId', t.strategy_id, 'impact', t.impact, 'createdOn', t.created_on, 'doneOn', t.done_on,
                'plannedWeek', coalesce(
                   (select case when m.from_sprint_id = p_sprint then m.from_week end from public.todo_moves m
                     where m.todo_id = t.id order by m.moved_on, m.created_at limit 1),
                   case when not exists (select 1 from public.todo_moves m where m.todo_id = t.id) and t.sprint_id = p_sprint then t.planned_week end),
                'moves', (select coalesce(jsonb_agg(jsonb_build_object('on', m.moved_on, 'toWeek', case when m.to_sprint_id = p_sprint then m.to_week end)
                                                    order by m.moved_on, m.created_at), '[]')
                          from public.todo_moves m where m.todo_id = t.id))), '[]')
              from public.todos t
              where t.user_id = s.user_id and t.deleted_at is null
                and (t.sprint_id = p_sprint or exists (select 1 from public.todo_moves m where m.todo_id = t.id
                                                       and p_sprint in (m.from_sprint_id, m.to_sprint_id)))),
    'wins', (select coalesce(jsonb_agg(jsonb_build_object('id', w.id, 'date', w.local_date, 'impact', w.impact,
               'strategyIds', (select coalesce(jsonb_agg(ws.strategy_id), '[]') from public.win_strategies ws where ws.win_id = w.id))), '[]')
             from public.wins w where w.user_id = s.user_id and w.deleted_at is null
               and w.local_date between (wk ->> 'start')::date and (wk ->> 'end')::date)
  );
end;
$$;
revoke all on function public.week_input(uuid, integer, date, boolean) from public, anon, authenticated;
revoke all on function public.sprint_calendar(uuid, date) from public, anon, authenticated;
revoke all on function public.person_today(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- freeze_week
-- A finished week's score and Strategy scores into week_scores, with its
-- eligibility (M0.5) and whether it is final (the debrief done, or 3 days
-- after the week ended; M0.4). Later edits update it again; what sponsors
-- see is the end-of-sprint summary, which never changes. Only the person
-- (or the admin role, for the nightly job) can run it.
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
  if not found or ((select auth.uid()) is not null and (select auth.uid()) <> s.user_id) then
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
          coalesce(deb.status = 'finished', false) or today > (inp -> 'week' ->> 'end')::date + 3, '1.1', now())
  on conflict (sprint_id, sprint_week) do update
    set score = excluded.score, strategy_scores = excluded.strategy_scores, eligible = excluded.eligible,
        final = excluded.final, methods_version = excluded.methods_version, frozen_at = excluded.frozen_at;
  return (res ->> 'score')::numeric;
end;
$$;
revoke all on function public.freeze_week(uuid, integer) from public, anon;
grant execute on function public.freeze_week(uuid, integer) to authenticated;

-- An objective's figures as M9's input.
create or replace function public.objective_input(p_objective uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('kind', o.kind, 'direction', o.direction, 'start', o.start_value, 'startOn', o.start_set_on,
    'target', o.target_value, 'byWhen', o.by_when, 'dueOn', o.due_on, 'reachedOn', o.reached_on, 'unit', o.unit,
    'figures', (select coalesce(jsonb_agg(jsonb_build_object('on', f.recorded_on, 'value', f.value) order by f.recorded_on, f.created_at), '[]')
                from public.objective_figures f where f.objective_id = o.id))
  from public.outcome_objectives o where o.id = p_objective;
$$;
revoke all on function public.objective_input(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- make_sprint_summary
-- The frozen end-of-sprint summary for a seat (methods M6): only the
-- organisation's objectives and the development objective, with their
-- figures and status (M9) at the sprint's end, and the sprint score of each
-- Strategy serving them. Made once; never changed. Nothing for someone
-- without a current, confirmed seat.
create or replace function public.make_sprint_summary(p_sprint uuid)
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
  ends date;
  w jsonb;
  objectives jsonb;
  strategies jsonb;
  avg_score numeric;
  new_id uuid;
begin
  select * into s from public.sprints where id = p_sprint;
  if not found or ((select auth.uid()) is not null and (select auth.uid()) <> s.user_id) then
    raise exception 'That sprint isn''t yours.' using errcode = '42501';
  end if;
  select id into new_id from public.sprint_summaries where sprint_id = p_sprint;
  if new_id is not null then
    return new_id;
  end if;
  select * into m from public.organisation_members
   where user_id = s.user_id and ended_on is null and has_seat and confirmed_at is not null
   order by started_on limit 1;
  if not found then
    return null;
  end if;
  today := public.person_today(s.user_id);
  cal := public.sprint_calendar(p_sprint, today);
  ends := coalesce((cal ->> 'actualEnd')::date, today);
  if s.status <> 'finished' and ends >= today then
    raise exception 'A summary is made when the sprint ends.' using errcode = '22023';
  end if;
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
          jsonb_build_object('objectives', objectives, 'strategies', strategies), '1.1', avg_score, s.standard)
  on conflict (sprint_id) do nothing
  returning id into new_id;
  return new_id;
end;
$$;
revoke all on function public.make_sprint_summary(uuid) from public, anon;
grant execute on function public.make_sprint_summary(uuid) to authenticated;

-- ---------------------------------------------------------------- org_figures
-- The four layers (M19) for a leader's teams: one team and every team below
-- it, or everything they lead. Totals only, never a name. Someone who has
-- left still counts in totals, from the summaries made while they were in
-- these teams, but not as a seat. The monthly check-in is never used.
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
  return public.score_m19_group(seats || leavers, impact, goal)
         || jsonb_build_object('teams', cardinality(grp), 'methodsVersion', '1.1', 'asAt', 'As at each person''s last finished sprint.');
end;
$$;

-- ---------------------------------------------------------------- impact (M17)
-- One person's before and after impact from their raters' links: start
-- answers from each rater's start link, end and "looking back" answers from
-- their end link. Answers: { "often": { behaviourId: answer },
-- "looking_back": { behaviourId: answer } }.
create or replace function public.impact_result_for(p_person uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public.score_m17_impact(coalesce(jsonb_agg(x), '[]'))
  from (
    select jsonb_build_object('raterId', r.id, 'phase', ph.phase, 'behaviourId', kv.key, 'answer', kv.value #>> '{}') as x
    from public.impact_raters r
    cross join lateral (values ('start', r.start_request_id, 'often'), ('end', r.end_request_id, 'often'),
                               ('looking_back', r.end_request_id, 'looking_back')) ph(phase, request_id, answer_key)
    join public.feedback_answers a on a.request_id = ph.request_id
    cross join lateral jsonb_each(coalesce(a.answers -> ph.answer_key, '{}')) kv
    where r.user_id = p_person
      and kv.key in (select b.id::text from public.impact_behaviours b where b.user_id = p_person and b.archived_at is null)
  ) y;
$$;
revoke all on function public.impact_result_for(uuid) from public, anon, authenticated;

-- The person, or their coach while Progress is shared.
create or replace function public.impact_results(p_person uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.may_see(p_person, 'progress') then
    raise exception 'Only the person and their coach see this.' using errcode = '42501';
  end if;
  return public.impact_result_for(p_person);
end;
$$;

-- ---------------------------------------------------------------- pulse_results (M18)
-- A boss's results for one send: totals at any number of answers, the
-- change since their last send, their own questions, comments as written
-- without names in a random order, named answers (only where the giver
-- added their name), and one small next step.
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
  answers jsonb;
  prev_measures jsonb;
  res jsonb;
begin
  select * into ps from public.pulse_sends where id = p_send and boss_id = (select auth.uid());
  if not found then
    raise exception 'That pulse isn''t yours.' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(a.answers), '[]') into answers from public.feedback_answers a where a.request_id = ps.request_id;
  select * into prev from public.pulse_sends p
   where p.boss_id = ps.boss_id and p.kind = ps.kind and p.opens_at < ps.opens_at order by p.opens_at desc limit 1;
  if prev.id is not null then
    select jsonb_object_agg(k, v -> 'figure') into prev_measures
      from jsonb_each(public.score_m18_pulse((select coalesce(jsonb_agg(a.answers), '[]') from public.feedback_answers a where a.request_id = prev.request_id), null) -> 'measures') e(k, v);
  end if;
  res := public.score_m18_pulse(answers, prev_measures);
  return res || jsonb_build_object(
    'wentTo', ps.went_to,
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
    'named', (select coalesce(jsonb_agg(jsonb_build_object('name', a.giver_name, 'energy', a.answers ->> 'energy', 'sleep', a.answers ->> 'sleep',
                                                          'stress', a.answers ->> 'stress', 'workload', a.answers ->> 'workload', 'support', a.answers ->> 'support')
                                        order by a.created_at), '[]')
              from public.feedback_answers a where a.request_id = ps.request_id and a.name_added),
    'nextStep', case res ->> 'lowest'
                  when 'energy' then 'Ask your team what would give them more energy at work.'
                  when 'sleep' then 'Ask your team what gets in the way of a good night’s sleep.'
                  when 'stress' then 'Ask your team what is adding the most pressure right now.'
                  when 'workload' then 'Ask your team what would ease the workload.'
                  when 'support' then 'Ask each person what support would help them perform.' end);
end;
$$;

do $grants$
declare f text;
begin
  foreach f in array array['public.org_figures(uuid)', 'public.impact_results(uuid)', 'public.pulse_results(uuid)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end
$grants$;

-- ---------------------------------------------------------------- the coach's client list
-- A page of clients, with filters (coach, name, organisation). A coach sees
-- their own clients; the owner sees every client's admin fields (name,
-- email, coach, since when, organisation) and can filter by coach. The
-- mission and the latest week score appear only where the checked helper
-- allows, so only for the viewer's own clients and only while shared.
create or replace function public.coach_client_list(p_coach uuid default null, p_search text default null, p_organisation uuid default null,
                                                    p_limit integer default 50, p_offset integer default 0)
returns table (client_id uuid, first_name text, last_name text, email text, coach_id uuid, coach_first_name text,
               coaching_since timestamptz, organisation_name text, mission text, latest_week_score numeric, latest_week_end date, total bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me uuid := (select auth.uid());
  mine uuid;
  owner boolean := public.is_owner();
begin
  select c.id into mine from public.coaches c where c.user_id = me and c.active;
  if mine is null then
    raise exception 'Only coaches see a client list.' using errcode = '42501';
  end if;
  if not owner and p_coach is not null and p_coach <> mine then
    raise exception 'You see only your own clients.' using errcode = '42501';
  end if;
  return query
  with base as (
    select cc.client_id, cc.coach_id, cc.started_at
    from public.coach_clients cc
    where cc.ended_at is null
      and case when owner then (p_coach is null or cc.coach_id = p_coach) else cc.coach_id = mine end
  ),
  filtered as (
    select b.client_id, b.coach_id, b.started_at, p.first_name, p.last_name, p.email
    from base b left join public.profiles p on p.id = b.client_id
    where (p_search is null or btrim(p_search) = ''
           or (coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) ilike '%' || btrim(p_search) || '%')
      and (p_organisation is null or exists (select 1 from public.organisation_members m
                                             where m.user_id = b.client_id and m.organisation_id = p_organisation and m.ended_on is null))
  ),
  paged as (
    select f.*, count(*) over () as total
    from filtered f
    order by f.last_name nulls last, f.first_name nulls last, f.client_id
    limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0)
  )
  select pg.client_id, pg.first_name, pg.last_name, pg.email, pg.coach_id, c.display_first_name, pg.started_at,
         (select o.name from public.organisation_members m join public.organisations o on o.id = m.organisation_id
           where m.user_id = pg.client_id and m.ended_on is null order by m.started_on limit 1),
         case when public.may_see(pg.client_id, 'mission')
              then (select pp.mission from public.performance_plans pp where pp.user_id = pg.client_id and pp.status = 'active') end,
         case when public.may_see(pg.client_id, 'progress')
              then (select ws.score from public.week_scores ws where ws.user_id = pg.client_id order by ws.week_end desc limit 1) end,
         case when public.may_see(pg.client_id, 'progress')
              then (select max(ws.week_end) from public.week_scores ws where ws.user_id = pg.client_id) end,
         pg.total
  from paged pg join public.coaches c on c.id = pg.coach_id
  order by pg.last_name nulls last, pg.first_name nulls last, pg.client_id;
end;
$$;
revoke all on function public.coach_client_list(uuid, text, uuid, integer, integer) from public, anon;
grant execute on function public.coach_client_list(uuid, text, uuid, integer, integer) to authenticated;

select public.record_migration(32, '032_scores_in_database');
