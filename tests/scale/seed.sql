-- Invented data at Tim's scale (1,000 clients, 15 coaches), for tests/scale/run.mjs.
-- Runs only inside the rolled-back dry run (scripts/dry-run-on-test.sh):
-- nothing is kept. Ids are made from md5 of a label, so the data is the same
-- every run. The database's own triggers are paused while it is loaded (the
-- rules and triggers are checked elsewhere; this is about speed) and switched
-- back on before anything is timed.

do $off$
declare t text;
begin
  foreach t in array array['coaches', 'coach_clients', 'organisations', 'teams', 'organisation_members', 'team_members', 'seat_sponsors',
                           'leader_teams', 'performance_plans', 'outcome_objectives', 'objective_figures', 'plan_strategies',
                           'strategy_objectives', 'habits', 'sprints', 'sprint_habits', 'sprint_habit_settings', 'habit_logs', 'todos',
                           'wins', 'win_strategies', 'weekly_debriefs', 'week_scores', 'checkins', 'sharing_switches', 'sprint_summaries',
                           'feedback_requests', 'feedback_answers', 'pulse_sends', 'performance_evidence', 'organisation_admins'] loop
    execute format('alter table public.%I disable trigger user', t);
  end loop;
end
$off$;

-- people: 1,000 clients, 15 coaches (1 owner), and per organisation a
-- sponsor, a top leader, 3 child leaders and an admin
insert into auth.users (id, email, aud, role)
select md5('client' || i)::uuid, 'scale-client-' || i || '@example.invalid', 'authenticated', 'authenticated' from generate_series(1, 1000) i
union all select md5('coach' || k)::uuid, 'scale-coach-' || k || '@example.invalid', 'authenticated', 'authenticated' from generate_series(1, 15) k
union all select md5('sponsor' || o)::uuid, 'scale-sponsor-' || o || '@example.invalid', 'authenticated', 'authenticated' from generate_series(1, 20) o
union all select md5('leadtop' || o)::uuid, 'scale-leadtop-' || o || '@example.invalid', 'authenticated', 'authenticated' from generate_series(1, 20) o
union all select md5('leadchild' || o || '-' || c)::uuid, 'scale-leadchild-' || o || '-' || c || '@example.invalid', 'authenticated', 'authenticated'
          from generate_series(1, 20) o, generate_series(1, 3) c
union all select md5('admin' || o)::uuid, 'scale-admin-' || o || '@example.invalid', 'authenticated', 'authenticated' from generate_series(1, 20) o;
update public.profiles p set first_name = 'Client', last_name = 'Number ' || lpad(substr(u.email, 14, strpos(u.email, '@') - 14), 4, '0')
  from auth.users u where u.id = p.id and u.email like 'scale-client-%';

insert into public.coaches (id, user_id, role, display_first_name)
select md5('coachrow' || k)::uuid, md5('coach' || k)::uuid, case when k = 1 then 'owner' else 'coach' end, 'Coach' || k from generate_series(1, 15) k;
insert into public.coach_clients (client_id, coach_id, started_at)
select md5('client' || i)::uuid, md5('coachrow' || (1 + i % 15))::uuid, now() - interval '1 year' from generate_series(1, 1000) i;
insert into public.sharing_switches (user_id, part, is_on)
select md5('client' || i)::uuid, 'progress', true from generate_series(1, 1000, 2) i;

-- 20 organisations: a root team, 3 children, 2 grandchildren under each
insert into public.organisations (id, name) select md5('org' || o)::uuid, 'Scale organisation ' || o from generate_series(1, 20) o;
insert into public.teams (id, organisation_id, name, parent_team_id)
select md5('team' || o || '-0')::uuid, md5('org' || o)::uuid, 'Root', null from generate_series(1, 20) o
union all select md5('team' || o || '-' || c)::uuid, md5('org' || o)::uuid, 'Child ' || c, md5('team' || o || '-0')::uuid from generate_series(1, 20) o, generate_series(1, 3) c
union all select md5('team' || o || '-' || c || '-' || g)::uuid, md5('org' || o)::uuid, 'Grandchild ' || c || g, md5('team' || o || '-' || c)::uuid
          from generate_series(1, 20) o, generate_series(1, 3) c, generate_series(1, 2) g;
insert into public.organisation_admins (organisation_id, user_id) select md5('org' || o)::uuid, md5('admin' || o)::uuid from generate_series(1, 20) o;
-- clients 1 to 400 have seats: 20 per organisation, in the grandchild teams
insert into public.organisation_members (id, organisation_id, user_id, started_on, confirmed_at)
select md5('member' || i)::uuid, md5('org' || (1 + (i - 1) / 20))::uuid, md5('client' || i)::uuid, date '2025-10-01', now() from generate_series(1, 400) i;
insert into public.team_members (member_id, team_id)
select md5('member' || i)::uuid, md5('team' || (1 + (i - 1) / 20) || '-' || (1 + i % 3) || '-' || (1 + i % 2))::uuid from generate_series(1, 400) i;
insert into public.seat_sponsors (member_id, sponsor_user_id) select md5('member' || i)::uuid, md5('sponsor' || (1 + (i - 1) / 20))::uuid from generate_series(1, 400) i;
insert into public.leader_teams (user_id, team_id)
select md5('leadtop' || o)::uuid, md5('team' || o || '-0')::uuid from generate_series(1, 20) o
union all select md5('leadchild' || o || '-' || c)::uuid, md5('team' || o || '-' || c)::uuid from generate_series(1, 20) o, generate_series(1, 3) c;

-- each client's plan: 3 objectives, 4 Strategies, 4 habits
insert into public.performance_plans (id, user_id, mission) select md5('plan' || i)::uuid, md5('client' || i)::uuid, 'Scale mission ' || i from generate_series(1, 1000) i;
insert into public.outcome_objectives (id, plan_id, user_id, name, kind, direction, start_value, start_set_on, target_value, by_when, source, organisation_id)
select md5('obj' || i || '-' || j)::uuid, md5('plan' || i)::uuid, md5('client' || i)::uuid, 'Objective ' || j, 'number', 'up', 20, date '2025-10-27', 40, date '2027-06-30',
       case when j = 1 and i <= 400 then 'organisation' else 'own' end, case when j = 1 and i <= 400 then md5('org' || (1 + (i - 1) / 20))::uuid end
from generate_series(1, 1000) i, generate_series(1, 3) j;
insert into public.plan_strategies (id, plan_id, user_id, name, sort_order)
select md5('strat' || i || '-' || s)::uuid, md5('plan' || i)::uuid, md5('client' || i)::uuid, 'Strategy ' || s, s from generate_series(1, 1000) i, generate_series(1, 4) s;
insert into public.strategy_objectives (strategy_id, objective_id, user_id)
select md5('strat' || i || '-' || s)::uuid, md5('obj' || i || '-' || (1 + (s - 1) % 3))::uuid, md5('client' || i)::uuid from generate_series(1, 1000) i, generate_series(1, 4) s;
insert into public.habits (id, plan_id, strategy_id, user_id, name, measure, target, target_per)
select md5('habit' || i || '-' || h)::uuid, md5('plan' || i)::uuid, md5('strat' || i || '-' || h)::uuid, md5('client' || i)::uuid, 'Habit ' || h, 'count', 3, 'week'
from generate_series(1, 1000) i, generate_series(1, 4) h;

-- a year of sprints: 4 finished 12-week sprints and one running
insert into public.sprints (id, user_id, plan_id, number, start_on, length_weeks, status)
select md5('sprint' || i || '-' || k)::uuid, md5('client' || i)::uuid, md5('plan' || i)::uuid, k, date '2025-10-27' + (k - 1) * 84, 12,
       case when k < 5 then 'finished' else 'running' end
from generate_series(1, 1000) i, generate_series(1, 5) k;
insert into public.sprint_habits (id, sprint_id, user_id, habit_id, strategy_id, name)
select md5('sh' || i || '-' || k || '-' || h)::uuid, md5('sprint' || i || '-' || k)::uuid, md5('client' || i)::uuid, md5('habit' || i || '-' || h)::uuid,
       md5('strat' || i || '-' || h)::uuid, 'Habit ' || h
from generate_series(1, 1000) i, generate_series(1, 5) k, generate_series(1, 4) h;
insert into public.sprint_habit_settings (sprint_habit_id, user_id, from_week, measure, target, target_per, impact)
select md5('sh' || i || '-' || k || '-' || h)::uuid, md5('client' || i)::uuid, 1, 'count', 3, 'week', 1 + h % 3
from generate_series(1, 1000) i, generate_series(1, 5) k, generate_series(1, 4) h;

-- a year of logs, one sprint at a time (about 1.4 million rows)
insert into public.habit_logs (user_id, sprint_habit_id, local_date, value)
select md5('client' || i)::uuid, md5('sh' || i || '-1-' || h)::uuid, date '2025-10-27' + d, (abs(hashtext(i || '-' || h || '-' || d)) % 3 > 0)::int
from generate_series(1, 1000) i, generate_series(1, 4) h, generate_series(0, 83) d where extract(isodow from date '2025-10-27' + d) < 6;
insert into public.habit_logs (user_id, sprint_habit_id, local_date, value)
select md5('client' || i)::uuid, md5('sh' || i || '-2-' || h)::uuid, date '2025-10-27' + 84 + d, (abs(hashtext(i || '-' || h || '-' || d)) % 3 > 0)::int
from generate_series(1, 1000) i, generate_series(1, 4) h, generate_series(0, 83) d where extract(isodow from date '2025-10-27' + 84 + d) < 6;
insert into public.habit_logs (user_id, sprint_habit_id, local_date, value)
select md5('client' || i)::uuid, md5('sh' || i || '-3-' || h)::uuid, date '2025-10-27' + 168 + d, (abs(hashtext(i || '-' || h || '-' || d)) % 3 > 0)::int
from generate_series(1, 1000) i, generate_series(1, 4) h, generate_series(0, 83) d where extract(isodow from date '2025-10-27' + 168 + d) < 6;
insert into public.habit_logs (user_id, sprint_habit_id, local_date, value)
select md5('client' || i)::uuid, md5('sh' || i || '-4-' || h)::uuid, date '2025-10-27' + 252 + d, (abs(hashtext(i || '-' || h || '-' || d)) % 3 > 0)::int
from generate_series(1, 1000) i, generate_series(1, 4) h, generate_series(0, 83) d where extract(isodow from date '2025-10-27' + 252 + d) < 6;
insert into public.habit_logs (user_id, sprint_habit_id, local_date, value)
select md5('client' || i)::uuid, md5('sh' || i || '-5-' || h)::uuid, date '2025-10-27' + 336 + d, (abs(hashtext(i || '-' || h || '-' || d)) % 3 > 0)::int
from generate_series(1, 1000) i, generate_series(1, 4) h, generate_series(0, 83) d
where date '2025-10-27' + 336 + d <= current_date and extract(isodow from date '2025-10-27' + 336 + d) < 6;

-- to-dos (3 a week), wins (1 a week), debriefs and week scores, for every week so far
insert into public.todos (user_id, strategy_id, text, sprint_id, planned_week, created_on, done_on)
select md5('client' || i)::uuid, md5('strat' || i || '-' || (1 + n % 4))::uuid, 'To-do ' || n, md5('sprint' || i || '-' || k)::uuid, w,
       date '2025-10-27' + (k - 1) * 84 + (w - 1) * 7 - 1,
       case when abs(hashtext(i || '-' || k || '-' || w || '-' || n)) % 10 < 7 then date '2025-10-27' + (k - 1) * 84 + (w - 1) * 7 + n end
from generate_series(1, 1000) i, generate_series(1, 5) k, generate_series(1, 12) w, generate_series(1, 3) n
where date '2025-10-27' + (k - 1) * 84 + (w - 1) * 7 <= current_date;
insert into public.wins (id, user_id, what, local_date, impact)
select md5('win' || i || '-' || k || '-' || w)::uuid, md5('client' || i)::uuid, 'A win', date '2025-10-27' + (k - 1) * 84 + (w - 1) * 7 + 2, 1
from generate_series(1, 1000) i, generate_series(1, 5) k, generate_series(1, 12) w
where date '2025-10-27' + (k - 1) * 84 + (w - 1) * 7 + 2 <= current_date;
insert into public.win_strategies (win_id, strategy_id, user_id)
select md5('win' || i || '-' || k || '-' || w)::uuid, md5('strat' || i || '-1')::uuid, md5('client' || i)::uuid
from generate_series(1, 1000) i, generate_series(1, 5) k, generate_series(1, 12) w
where date '2025-10-27' + (k - 1) * 84 + (w - 1) * 7 + 2 <= current_date;
insert into public.weekly_debriefs (user_id, sprint_id, sprint_week, stress, went_well, status, finished_at, shared_with_coach)
select md5('client' || i)::uuid, md5('sprint' || i || '-' || k)::uuid, w, 'a_little', 'It went well.', 'finished', now(), w % 2 = 0
from generate_series(1, 1000) i, generate_series(1, 5) k, generate_series(1, 12) w
where date '2025-10-27' + (k - 1) * 84 + w * 7 <= current_date;
insert into public.week_scores (user_id, sprint_id, sprint_week, week_start, week_end, score, strategy_scores, eligible, final, methods_version)
select md5('client' || i)::uuid, md5('sprint' || i || '-' || k)::uuid, w, date '2025-10-27' + (k - 1) * 84 + (w - 1) * 7, date '2025-10-27' + (k - 1) * 84 + w * 7 - 1,
       50 + abs(hashtext(i || '-' || k || '-' || w)) % 50,
       jsonb_build_array(jsonb_build_object('id', md5('strat' || i || '-1')::uuid, 'served', 1, 'score', 70)), true, true, '1.1'
from generate_series(1, 1000) i, generate_series(1, 5) k, generate_series(1, 12) w
where date '2025-10-27' + (k - 1) * 84 + w * 7 <= current_date;
insert into public.objective_figures (objective_id, user_id, value, recorded_on, sprint_id, sprint_week)
select md5('obj' || i || '-' || j)::uuid, md5('client' || i)::uuid, 20 + n * 0.3, date '2025-10-27' + n * 7, null, null
from generate_series(1, 1000) i, generate_series(1, 3) j, generate_series(1, 52) n where date '2025-10-27' + n * 7 <= current_date;

-- twelve monthly check-ins each
insert into public.checkins (user_id, kind, month, status, answers, hardware_score, software_score, area_scores, methods_version, finished_at)
select md5('client' || i)::uuid, 'monthly', (date '2025-11-01' + make_interval(months => m))::date, 'finished', '{"H3": "often"}', 60, 55, '{}', '1.1', now()
from generate_series(1, 1000) i, generate_series(0, 11) m;

-- frozen summaries for every seat's finished sprints
insert into public.sprint_summaries (user_id, sprint_id, member_id, organisation_id, team_ids, sprint_number, sprint_start, sprint_end, summary, methods_version, sprint_average, standard)
select md5('client' || i)::uuid, md5('sprint' || i || '-' || k)::uuid, md5('member' || i)::uuid, md5('org' || (1 + (i - 1) / 20))::uuid,
       array[md5('team' || (1 + (i - 1) / 20) || '-' || (1 + i % 3) || '-' || (1 + i % 2))::uuid], k, date '2025-10-27' + (k - 1) * 84, date '2025-10-27' + k * 84 - 1,
       jsonb_build_object('objectives', jsonb_build_array(jsonb_build_object('status', (array['on_track', 'off_track', 'reached', 'too_early'])[1 + i % 4])),
                          'strategies', jsonb_build_array(jsonb_build_object('average', 60 + i % 40))), '1.1', 60 + i % 40, 85
from generate_series(1, 400) i, generate_series(1, 4) k;

-- each top leader sends a monthly pulse to their team of 20
insert into public.feedback_requests (id, asker_id, tool_key, question_set_id, token_hash, opens_at, expires_at, max_answers)
select md5('pulsereq' || o || '-' || m)::uuid, md5('leadtop' || o)::uuid, 'team_pulse',
       (select id from public.feedback_question_sets where tool_key = 'team_pulse' limit 1),
       encode(extensions.digest('scale-pulse-' || o || '-' || m, 'sha256'), 'hex'), now() - make_interval(days => 30 * (12 - m)), now() - make_interval(days => 30 * (12 - m)) + interval '7 days', 20
from generate_series(1, 20) o, generate_series(1, 12) m;
insert into public.pulse_sends (id, boss_id, kind, request_id, went_to, opens_at, closes_at)
select md5('pulse' || o || '-' || m)::uuid, md5('leadtop' || o)::uuid, 'short', md5('pulsereq' || o || '-' || m)::uuid, 20,
       now() - make_interval(days => 30 * (12 - m)), now() - make_interval(days => 30 * (12 - m)) + interval '7 days'
from generate_series(1, 20) o, generate_series(1, 12) m;
insert into public.feedback_answers (request_id, answers)
select md5('pulsereq' || o || '-' || m)::uuid,
       jsonb_build_object('energy', (array['very_low', 'low', 'ok', 'high', 'very_high'])[1 + a % 5], 'sleep', 'ok', 'stress', 'sometimes',
                          'workload', 'often', 'support', 'often', 'comment', case when a % 3 = 0 then 'A comment' end)
from generate_series(1, 20) o, generate_series(1, 12) m, generate_series(1, 14) a;

do $on$
declare t text;
begin
  foreach t in array array['coaches', 'coach_clients', 'organisations', 'teams', 'organisation_members', 'team_members', 'seat_sponsors',
                           'leader_teams', 'performance_plans', 'outcome_objectives', 'objective_figures', 'plan_strategies',
                           'strategy_objectives', 'habits', 'sprints', 'sprint_habits', 'sprint_habit_settings', 'habit_logs', 'todos',
                           'wins', 'win_strategies', 'weekly_debriefs', 'week_scores', 'checkins', 'sharing_switches', 'sprint_summaries',
                           'feedback_requests', 'feedback_answers', 'pulse_sends', 'performance_evidence', 'organisation_admins'] loop
    execute format('alter table public.%I enable trigger user', t);
    execute format('analyze public.%I', t);
  end loop;
end
$on$;
analyze auth.users;
analyze public.profiles;
