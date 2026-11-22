-- Scale check seed, part 2: a year of each client's own work (plan, five
-- 12-week sprints, daily logs, Daily plans and reviews, own questions and
-- their answers, weekly debriefs, monthly reviews, to-dos and wins).
set session_replication_role = replica;

-- Each client's plan: 3 objectives, 4 Strategies, 4 habits.
insert into public.performance_plans (id, user_id, mission, status, major, minor, created_at)
select md5('plan' || i)::uuid, md5('client' || i)::uuid, 'Lead a calm, focused team and grow the business by a third.', 'active', 1, 0, now() - interval '380 days'
from generate_series(1, 1000) i;
insert into public.outcome_objectives (id, plan_id, user_id, name, kind, direction, start_value, start_set_on, target_value, by_when, sort_order, created_at)
select md5('obj' || i || '-' || j)::uuid, md5('plan' || i)::uuid, md5('client' || i)::uuid, (array['Revenue per month','Team engagement','Hours of deep work'])[j],
       'number', 'up', 20, (select y0 from scale_seed.dates), 40, (select today from scale_seed.dates) + 200, j, now() - interval '380 days'
from generate_series(1, 1000) i, generate_series(1, 3) j;
insert into public.plan_strategies (id, plan_id, user_id, name, sort_order, created_at)
select md5('strat' || i || '-' || s)::uuid, md5('plan' || i)::uuid, md5('client' || i)::uuid,
       (array['Protect deep work','Lead through others','Recover well','Grow key accounts'])[s], s, now() - interval '380 days'
from generate_series(1, 1000) i, generate_series(1, 4) s;
insert into public.strategy_objectives (strategy_id, objective_id, user_id)
select md5('strat' || i || '-' || s)::uuid, md5('obj' || i || '-' || (1 + (s - 1) % 3))::uuid, md5('client' || i)::uuid from generate_series(1, 1000) i, generate_series(1, 4) s;
insert into public.habits (id, plan_id, strategy_id, user_id, name, measure, target, target_per, direction, sort_order, created_at)
select md5('habit' || i || '-' || h)::uuid, md5('plan' || i)::uuid, md5('strat' || i || '-' || h)::uuid, md5('client' || i)::uuid,
       (array['Two hours of focus before 11','A one-to-one with each direct report','Lights out by 22:30','Call a key client'])[h],
       case when h = 3 then 'rating' else 'count' end, case when h = 3 then 4 else 3 end, case when h = 3 then null else 'week' end, case when h = 3 then 'higher' end, h, now() - interval '380 days'
from generate_series(1, 1000) i, generate_series(1, 4) h;

-- Five 12-week sprints: four finished, the fifth running (week 5 this week).
insert into public.sprints (id, user_id, plan_id, number, start_on, length_weeks, standard, status, actual_end_on, finished_at, created_at)
select md5('sprint' || i || '-' || k)::uuid, md5('client' || i)::uuid, md5('plan' || i)::uuid, k, d.y0 + (k - 1) * 84, 12, 85,
       case when k < 5 then 'finished' else 'running' end, case when k < 5 then d.y0 + k * 84 - 1 end,
       case when k < 5 then (d.y0 + k * 84)::timestamptz end, (d.y0 + (k - 1) * 84 - 2)::timestamptz
from generate_series(1, 1000) i, generate_series(1, 5) k, scale_seed.dates d;
insert into public.sprint_habits (id, sprint_id, user_id, habit_id, strategy_id, name, sort_order)
select md5('sh' || i || '-' || k || '-' || h)::uuid, md5('sprint' || i || '-' || k)::uuid, md5('client' || i)::uuid, md5('habit' || i || '-' || h)::uuid,
       md5('strat' || i || '-' || h)::uuid, (array['Two hours of focus before 11','A one-to-one with each direct report','Lights out by 22:30','Call a key client'])[h], h
from generate_series(1, 1000) i, generate_series(1, 5) k, generate_series(1, 4) h;
insert into public.sprint_habit_settings (sprint_habit_id, user_id, from_week, measure, target, target_per, direction, impact)
select md5('sh' || i || '-' || k || '-' || h)::uuid, md5('client' || i)::uuid, 1, case when h = 3 then 'rating' else 'count' end,
       case when h = 3 then 4 else 3 end, case when h = 3 then null else 'week' end, case when h = 3 then 'higher' end, 1 + h % 3
from generate_series(1, 1000) i, generate_series(1, 5) k, generate_series(1, 4) h;

-- A year of daily logs (weekdays; the rated habit every day): about 1.2 million rows.
insert into public.habit_logs (user_id, sprint_habit_id, local_date, value)
select md5('client' || i)::uuid, md5('sh' || i || '-' || (1 + n / 84) || '-' || h)::uuid, d.y0 + n,
       case when h = 3 then 1 + abs(hashtext(i || '-' || n)) % 5 else (abs(hashtext(i || '-' || h || '-' || n)) % 3 > 0)::int end
from generate_series(1, 1000) i, generate_series(1, 4) h, generate_series(0, 363) n, scale_seed.dates d
where d.y0 + n <= d.today and (h = 3 or extract(isodow from d.y0 + n) < 6) and abs(hashtext('log' || i || '-' || n)) % 10 < 8;

do $$ begin raise notice 'SEED part 2a: % habit logs', (select count(*) from public.habit_logs); end $$;

-- Daily plans (8 days in 10) and Daily reviews (7 in 10) for the year.
insert into public.day_plans (id, user_id, local_date, sleep_hours, sleep_quality, grateful_for, way_of_being, biggest_risk, risk_response, status, finished_at, created_at)
select md5('dp' || i || '-' || n)::uuid, md5('client' || i)::uuid, d.y0 + n, 6 + (abs(hashtext('s' || i || n)) % 5) * 0.5,
       (array['very_poor','poor','fair','good','very_good'])[1 + abs(hashtext('q' || i || n)) % 5], 'A good night and a clear morning.', 'Calm and curious',
       'Getting pulled into email', 'Close email until 11', 'finished', (d.y0 + n)::timestamptz + interval '7 hours', (d.y0 + n)::timestamptz + interval '7 hours'
from generate_series(1, 1000) i, generate_series(0, 363) n, scale_seed.dates d
where d.y0 + n <= d.today and abs(hashtext('dp' || i || '-' || n)) % 10 < 8;
insert into public.day_reviews (id, user_id, local_date, way_of_being_rating, way_of_being, where_it_showed, went_well, differently, tomorrow, status, finished_at, created_at)
select md5('dr' || i || '-' || n)::uuid, md5('client' || i)::uuid, d.y0 + n, 2 * (1 + abs(hashtext('w' || i || n)) % 5), 'Calm and curious',
       'In the leadership meeting.', 'Kept the morning for deep work.', 'Say no sooner.', array['Plan the week', 'Call Jo'], 'finished',
       (d.y0 + n)::timestamptz + interval '18 hours', (d.y0 + n)::timestamptz + interval '18 hours'
from generate_series(1, 1000) i, generate_series(0, 363) n, scale_seed.dates d
where d.y0 + n < d.today and abs(hashtext('dr' || i || '-' || n)) % 10 < 7;
-- The day plans' and reviews' parts for the last 4 weeks.
insert into public.day_plan_habits (user_id, local_date, habit_ids, pick_order, top_pick)
select p.user_id, p.local_date, array[md5('sh' || i || '-5-1')::uuid, md5('sh' || i || '-5-2')::uuid],
       array['habit:' || md5('sh' || i || '-5-1')::uuid, 'habit:' || md5('sh' || i || '-5-2')::uuid], 'habit:' || md5('sh' || i || '-5-1')::uuid
from generate_series(1, 1000) i join public.day_plans p on p.user_id = md5('client' || i)::uuid, scale_seed.dates d
where p.local_date >= d.cur_mon - 28;
insert into public.day_review_strategies (day_review_id, strategy_id, user_id, level)
select r.id, md5('strat' || i || '-' || s)::uuid, r.user_id, 1 + abs(hashtext(r.id::text || s)) % 3
from generate_series(1, 1000) i join public.day_reviews r on r.user_id = md5('client' || i)::uuid, generate_series(1, 4) s, scale_seed.dates d
where r.local_date >= d.cur_mon - 28;

do $$ begin raise notice 'SEED part 2b: % day plans, % day reviews', (select count(*) from public.day_plans), (select count(*) from public.day_reviews); end $$;

-- Own questions (run 7): one in the Daily review (a rating) and one in the weekly debrief (written), answered all year.
insert into public.own_questions (id, user_id, tool, wording, answer_type, scale, position, created_at)
select md5('oq' || i || '-r')::uuid, md5('client' || i)::uuid, 'daily_review', 'How well did I listen today?', 'rating', 'good', 1, now() - interval '380 days' from generate_series(1, 1000) i
union all
select md5('oq' || i || '-w')::uuid, md5('client' || i)::uuid, 'weekly_debrief', 'What would make next week easier?', 'written', null, 1, now() - interval '380 days' from generate_series(1, 1000) i;
insert into public.own_question_answers (user_id, question_id, tool, occasion, on_date, wording, answer_type, scale, rating, created_at)
select r.user_id, md5('oq' || i || '-r')::uuid, 'daily_review', to_char(r.local_date, 'YYYY-MM-DD'), r.local_date, 'How well did I listen today?', 'rating', 'good',
       1 + abs(hashtext(r.id::text)) % 5, r.created_at
from generate_series(1, 1000) i join public.day_reviews r on r.user_id = md5('client' || i)::uuid;

-- Weekly debriefs and frozen week scores for every finished week; wins weekly.
insert into public.weekly_debriefs (user_id, sprint_id, sprint_week, stress, went_well, got_in_way, adjust, status, finished_at, shared_with_coach, created_at)
select md5('client' || i)::uuid, md5('sprint' || i || '-' || k)::uuid, w, (array['not_at_all','a_little','moderately','quite_a_lot','very_much'])[1 + abs(hashtext(i || '-' || k || '-' || w)) % 5],
       'Kept two mornings clear.', 'Too many meetings on Wednesday.', 'Move the team meeting.', 'finished', (d.y0 + (k - 1) * 84 + w * 7 - 1)::timestamptz + interval '17 hours', w % 2 = 0,
       (d.y0 + (k - 1) * 84 + w * 7 - 1)::timestamptz + interval '17 hours'
from generate_series(1, 1000) i, generate_series(1, 5) k, generate_series(1, 12) w, scale_seed.dates d
where d.y0 + (k - 1) * 84 + w * 7 <= d.cur_mon;
insert into public.own_question_answers (user_id, question_id, tool, occasion, sprint_id, week, wording, answer_type, written, created_at)
select b.user_id, md5('oq' || i || '-w')::uuid, 'weekly_debrief', b.sprint_id::text || ':' || b.sprint_week, b.sprint_id, b.sprint_week, 'What would make next week easier?', 'written',
       'Fewer meetings on Wednesday.', b.created_at
from generate_series(1, 1000) i join public.weekly_debriefs b on b.user_id = md5('client' || i)::uuid;
insert into public.week_scores (user_id, sprint_id, sprint_week, week_start, week_end, score, strategy_scores, eligible, final, methods_version)
select md5('client' || i)::uuid, md5('sprint' || i || '-' || k)::uuid, w, d.y0 + (k - 1) * 84 + (w - 1) * 7, d.y0 + (k - 1) * 84 + w * 7 - 1,
       50 + abs(hashtext(i || '-' || k || '-' || w)) % 50,
       jsonb_build_array(jsonb_build_object('id', md5('strat' || i || '-1')::uuid, 'served', 1, 'score', 70), jsonb_build_object('id', md5('strat' || i || '-2')::uuid, 'served', 1, 'score', 80)),
       true, true, '1.1'
from generate_series(1, 1000) i, generate_series(1, 5) k, generate_series(1, 12) w, scale_seed.dates d
where d.y0 + (k - 1) * 84 + w * 7 <= d.cur_mon;
insert into public.wins (user_id, what, local_date, impact)
select md5('client' || i)::uuid, 'Closed the quarter early.', d.y0 + w * 7 + 2, 1 + w % 3
from generate_series(1, 1000) i, generate_series(0, 51) w, scale_seed.dates d where d.y0 + w * 7 + 2 <= d.today;
insert into public.objective_figures (objective_id, user_id, value, recorded_on)
select md5('obj' || i || '-' || j)::uuid, md5('client' || i)::uuid, 20 + n * 0.6, d.y0 + n * 14
from generate_series(1, 1000) i, generate_series(1, 3) j, generate_series(1, 26) n, scale_seed.dates d where d.y0 + n * 14 <= d.today;
insert into public.sprint_reviews (user_id, sprint_id, worked_best, next_better, next_choice, finished_at)
select md5('client' || i)::uuid, md5('sprint' || i || '-' || k)::uuid, 'Mornings kept clear.', 'Plan Fridays.', 'sprint', (d.y0 + k * 84)::timestamptz
from generate_series(1, 1000) i, generate_series(1, 4) k, scale_seed.dates d;

-- Twelve monthly reviews each.
insert into public.checkins (user_id, kind, month, status, answers, hardware_score, software_score, area_scores, methods_version, finished_at)
select md5('client' || i)::uuid, 'monthly', (date_trunc('month', d.today) - make_interval(months => m))::date, 'finished', '{"H3": "often"}', 55 + i % 30, 50 + i % 35, '{}', '1.1',
       (date_trunc('month', d.today) - make_interval(months => m))::timestamptz + interval '2 days'
from generate_series(1, 1000) i, generate_series(1, 12) m, scale_seed.dates d;

-- To-dos: two a week for the year (most done), plus this sprint's open ones and a Backlog.
insert into public.todos (user_id, strategy_id, text, impact, sprint_id, planned_week, created_on, done_on, created_at)
select md5('client' || i)::uuid, md5('strat' || i || '-' || (1 + n % 4))::uuid, 'Follow up with the board, item ' || n, 1 + n % 3,
       md5('sprint' || i || '-' || (1 + (w / 12)))::uuid, 1 + w % 12, d.y0 + w * 7 - 1,
       case when d.y0 + w * 7 + 2 < d.today and abs(hashtext(i || '-' || w || '-' || n)) % 10 < 8 then d.y0 + w * 7 + n end, (d.y0 + w * 7 - 1)::timestamptz
from generate_series(1, 1000) i, generate_series(0, 59) w, generate_series(1, 2) n, scale_seed.dates d
where d.y0 + w * 7 <= d.cur_mon + 7 * 7;
insert into public.todos (user_id, strategy_id, text, impact, created_on, created_at)
select md5('client' || i)::uuid, md5('strat' || i || '-' || (1 + n % 4))::uuid, 'Someday: ' || n, 1, d.today - n, (d.today - n)::timestamptz
from generate_series(1, 1000) i, generate_series(1, 3) n, scale_seed.dates d;

do $$ begin raise notice 'SEED part 2: % to-dos, % debriefs, % own answers, % check-ins', (select count(*) from public.todos), (select count(*) from public.weekly_debriefs),
  (select count(*) from public.own_question_answers), (select count(*) from public.checkins); end $$;
