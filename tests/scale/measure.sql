-- The reads the coming screens need, timed at Tim's scale (tests/scale/run.mjs).
-- Each runs three times as the person who would run it, with the rules on;
-- the middle time is reported, with any full scan of a big table. Anything a
-- read writes (freeze_week) is undone straight away.
do $m$
declare
  q record;
  j jsonb;
  times numeric[];
  ms numeric;
  seq text;
  i integer;
  x uuid := md5('client7')::uuid;
  s5 uuid := md5('sprint7-5')::uuid;
begin
  for q in select * from (values
    ('Sprint week: the week''s logs, as the person', md5('client7')::uuid,
     format('select sh.id, l.local_date, l.value from public.sprint_habits sh join public.habit_logs l on l.sprint_habit_id = sh.id where sh.sprint_id = %L and l.local_date between date ''2026-10-26'' and date ''2026-11-01''', s5)),
    ('Sprint week: the week''s to-dos, as the person', md5('client7')::uuid,
     format('select * from public.todos where user_id = %L and sprint_id = %L and planned_week = 11 and deleted_at is null', x, s5)),
    ('Sprint week: the score so far, worked out in the database', null::uuid,
     format('select public.score_week_raw(public.week_input(%L, 11, current_date, true))', s5)),
    ('Sprint week: freezing a finished week (freeze_week)', md5('client7')::uuid,
     format('select public.freeze_week(%L, 10)', s5)),
    ('Dashboard: this sprint''s week scores', md5('client7')::uuid,
     format('select sprint_week, score from public.week_scores where user_id = %L and sprint_id = %L order by sprint_week', x, s5)),
    ('Dashboard: the usual range (last 16 eligible weeks)', md5('client7')::uuid,
     format('select score from public.week_scores where user_id = %L and eligible order by week_end desc limit 16', x)),
    ('Dashboard: a year of week scores across sprints', md5('client7')::uuid,
     format('select sprint_id, sprint_week, score from public.week_scores where user_id = %L order by week_end', x)),
    ('Dashboard: objectives with their latest figures', md5('client7')::uuid,
     format('select o.id, o.name, f.value from public.outcome_objectives o left join lateral (select value from public.objective_figures f where f.objective_id = o.id order by recorded_on desc, created_at desc limit 1) f on true where o.user_id = %L and o.archived_at is null', x)),
    ('Dashboard: a year of check-ins', md5('client7')::uuid,
     format('select month, hardware_score, software_score from public.checkins where user_id = %L order by month', x)),
    ('Coach: client list, first page (67 clients)', md5('coach8')::uuid, 'select * from public.coach_client_list(null, null, null, 50, 0)'),
    ('Coach: client list, searched by name', md5('coach8')::uuid, 'select * from public.coach_client_list(null, ''Number 00'', null, 50, 0)'),
    ('Owner: every client, first page (1,000 clients)', md5('coach1')::uuid, 'select * from public.coach_client_list(null, null, null, 50, 0)'),
    ('Owner: every client, page 20', md5('coach1')::uuid, 'select * from public.coach_client_list(null, null, null, 50, 950)'),
    ('Owner: filtered by coach and organisation', md5('coach1')::uuid,
     format('select * from public.coach_client_list(%L, null, %L, 50, 0)', md5('coachrow8')::uuid, md5('org1')::uuid)),
    ('Coach: a client''s objectives, through the rules', md5('coach8')::uuid, format('select * from public.outcome_objectives where user_id = %L', x)),
    ('Coach: a client''s week scores, through the rules', md5('coach8')::uuid, format('select * from public.week_scores where user_id = %L', x)),
    ('Leader: organisation figures (20 seats, 10 teams)', md5('leadtop1')::uuid, 'select public.org_figures()'),
    ('Leader: one child team''s figures', md5('leadchild1-1')::uuid, 'select public.org_figures()'),
    ('Leader: people list, first page', md5('leadtop1')::uuid, 'select * from public.leader_people(null, 50, 0)'),
    ('Sponsor: their seats', md5('sponsor1')::uuid, 'select * from public.sponsor_people()'),
    ('Sponsor: one seat''s summaries', md5('sponsor1')::uuid, format('select * from public.person_summaries(%L)', md5('client1')::uuid)),
    ('Pulse: one send''s results, with the change since the last', md5('leadtop1')::uuid, format('select public.pulse_results(%L)', md5('pulse1-12')::uuid))
  ) v(name, who, sql) loop
    times := '{}';
    seq := null;
    for i in 1..3 loop
      begin
        if q.who is not null then
          perform set_config('request.jwt.claims', json_build_object('sub', q.who, 'role', 'authenticated')::text, true);
          perform set_config('role', 'authenticated', true);
        end if;
        execute format('explain (analyze, format json) %s', q.sql) into j;
        times := times || ((j -> 0 ->> 'Execution Time')::numeric + (j -> 0 ->> 'Planning Time')::numeric);
        seq := (select string_agg(distinct n ->> 'Relation Name', ', ')
                from jsonb_path_query(j, 'lax $.** ? (@."Node Type" == "Seq Scan")') n
                where (n ->> 'Actual Rows')::numeric + coalesce((n ->> 'Rows Removed by Filter')::numeric, 0) > 1000);
        raise exception using errcode = 'SC001', message = 'undo';
      exception when sqlstate 'SC001' then null;
      end;
    end loop;
    ms := (select t from unnest(times) t order by t offset 1 limit 1);
    raise notice 'TIMING|%|%|%', q.name, round(ms, 1), coalesce(seq, '');
  end loop;
  raise notice 'ROWS|habit_logs %|todos %|week_scores %|objective_figures %|checkins %|sprint_summaries %|feedback_answers %',
    (select count(*) from public.habit_logs), (select count(*) from public.todos), (select count(*) from public.week_scores),
    (select count(*) from public.objective_figures), (select count(*) from public.checkins), (select count(*) from public.sprint_summaries),
    (select count(*) from public.feedback_answers);
end
$m$;
