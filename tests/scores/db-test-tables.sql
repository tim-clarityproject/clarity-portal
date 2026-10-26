sam uuid; sponsor_u uuid; lead_u uuid; lead_other uuid; admin_u uuid; boss uuid; nobody_u uuid;
org1 uuid; team1 uuid; team_other uuid; m_sam uuid; m2 uuid; m3 uuid; p2 uuid; p3 uuid;
plan_s uuid; o1 uuid; o2 uuid; o3 uuid; s_grow uuid; s_energy uuid; s_craft uuid;
spr uuid; sh_ref uuid; sh_train uuid; sh_late uuid; sh_read uuid; mon date;
summ uuid; plan2 uuid; plan3 uuid; spr2 uuid; spr3 uuid;
rq record; ptok text; psend uuid; b1 uuid; b2 uuid; t1s text; t1e text; t2s text; t2e text; q1s uuid; q1e uuid; q2s uuid; q2e uuid;
-- @DECLARE@
-- Week 1 of the sprint is the Monday two weeks ago, so both weeks are finished.
mon := date_trunc('week', current_date)::date - 14;
sam := pg_temp.t_user('sam'); sponsor_u := pg_temp.t_user('sponsor'); lead_u := pg_temp.t_user('leader');
lead_other := pg_temp.t_user('leaderother'); admin_u := pg_temp.t_user('admin'); boss := pg_temp.t_user('boss'); nobody_u := pg_temp.t_user('nobody');
p2 := pg_temp.t_user('second'); p3 := pg_temp.t_user('third');
insert into public.organisations (name) values ('Invented Org') returning id into org1;
insert into public.teams (organisation_id, name) values (org1, 'Team one') returning id into team1;
insert into public.teams (organisation_id, name) values (org1, 'Team other') returning id into team_other;
insert into public.organisation_admins (organisation_id, user_id) values (org1, admin_u);
insert into public.organisation_members (organisation_id, user_id) values (org1, sam) returning id into m_sam;
insert into public.team_members (member_id, team_id) values (m_sam, team1);
insert into public.seat_sponsors (member_id, sponsor_user_id) values (m_sam, sponsor_u);
insert into public.leader_teams (user_id, team_id) values (lead_u, team1), (lead_other, team_other);
perform pg_temp.t_as(sam);
perform public.membership_confirm(m_sam);

-- M5-1 as real rows: Sam works Monday to Friday; objective 1 is the organisation's.
insert into public.performance_plans (user_id, mission) values (sam, 'Grow the practice through referrals') returning id into plan_s;
insert into public.outcome_objectives (plan_id, user_id, name, kind, direction, start_value, start_set_on, target_value, by_when, source, organisation_id)
  values (plan_s, sam, 'Referral revenue', 'number', 'up', 20, mon - 280, 38, mon + 300, 'organisation', org1) returning id into o1;
insert into public.outcome_objectives (plan_id, user_id, name, kind, due_on) values (plan_s, sam, 'Coaching craft', 'milestone', mon + 200) returning id into o2;
insert into public.outcome_objectives (plan_id, user_id, name, kind, due_on) values (plan_s, sam, 'Energy', 'milestone', mon + 200) returning id into o3;
insert into public.objective_figures (objective_id, user_id, value, recorded_on) values (o1, sam, 31, mon + 5);
insert into public.plan_strategies (plan_id, user_id, name, sort_order) values (plan_s, sam, 'Grow through referrals', 1) returning id into s_grow;
insert into public.plan_strategies (plan_id, user_id, name, sort_order) values (plan_s, sam, 'Sustain my energy', 2) returning id into s_energy;
insert into public.plan_strategies (plan_id, user_id, name, sort_order) values (plan_s, sam, 'Deepen my coaching craft', 3) returning id into s_craft;
insert into public.strategy_objectives (strategy_id, objective_id, user_id) values (s_grow, o1, sam), (s_grow, o2, sam), (s_energy, o3, sam), (s_craft, o2, sam);
insert into public.sprints (user_id, plan_id, number, start_on, length_weeks, status) values (sam, plan_s, 1, mon, 2, 'finished') returning id into spr;
insert into public.sprint_habits (sprint_id, user_id, strategy_id, name) values (spr, sam, s_grow, 'Referral conversations') returning id into sh_ref;
insert into public.sprint_habits (sprint_id, user_id, strategy_id, name) values (spr, sam, s_energy, 'Training sessions') returning id into sh_train;
insert into public.sprint_habits (sprint_id, user_id, strategy_id, name) values (spr, sam, s_energy, 'Late finishes') returning id into sh_late;
insert into public.sprint_habits (sprint_id, user_id, strategy_id, name) values (spr, sam, s_craft, 'Reading') returning id into sh_read;
insert into public.sprint_habit_settings (sprint_habit_id, user_id, from_week, measure, target, target_per, limit_value, impact) values
  (sh_ref, sam, 1, 'count', 3, 'week', null, 3), (sh_train, sam, 1, 'count', 3, 'week', null, 3),
  (sh_late, sam, 1, 'yes_no_days_limit', null, null, 2, 2), (sh_read, sam, 1, 'amount', 20, 'day', null, 1);
insert into public.habit_logs (user_id, sprint_habit_id, local_date, value) values
  (sam, sh_ref, mon, 1), (sam, sh_ref, mon + 2, 1),
  (sam, sh_train, mon, 1), (sam, sh_train, mon + 2, 1), (sam, sh_train, mon + 4, 1),
  (sam, sh_late, mon, 1), (sam, sh_late, mon + 1, 1), (sam, sh_late, mon + 2, 1), (sam, sh_late, mon + 3, 0), (sam, sh_late, mon + 4, 0),
  (sam, sh_read, mon, 30), (sam, sh_read, mon + 1, 30), (sam, sh_read, mon + 2, 30), (sam, sh_read, mon + 3, 30);
insert into public.todos (user_id, strategy_id, text, impact, sprint_id, planned_week, created_on, done_on) values
  (sam, s_grow, 'Email three past clients', 2, spr, 1, mon - 1, mon + 1),
  (sam, s_craft, 'Record a session review', 3, spr, 1, mon - 1, null);
with w as (insert into public.wins (user_id, what, local_date, impact) values (sam, 'An unplanned referral', mon + 3, 1) returning id)
insert into public.win_strategies (win_id, strategy_id, user_id) select id, s_grow, sam from w;

-- freeze_week: M5-1 through the tables
f := f || pg_temp.t_near('T1 M5-1 frozen from the tables', pg_temp.t_n(format('select public.freeze_week(%L, 1)', spr))::numeric, 67.916667);
f := f || pg_temp.t_eq('T2 shown as 68', pg_temp.t_n(format('select public.score_round(score) from public.week_scores where sprint_id = %L and sprint_week = 1', spr)), '68');
f := f || pg_temp.t_near('T3 the Strategy scores kept with it', pg_temp.t_n(format('select (e ->> ''score'')::numeric from public.week_scores ws, jsonb_array_elements(ws.strategy_scores) e where ws.sprint_id = %L and ws.sprint_week = 1 and e ->> ''id'' = %L', spr, s_grow))::numeric, 83.333333);
f := f || pg_temp.t_eq('T4 eligible and final, with the methods version', pg_temp.t_n(format('select eligible || '' '' || final || '' '' || methods_version from public.week_scores where sprint_id = %L and sprint_week = 1', spr)), 'true true 1.1');
f := f || pg_temp.t_eq('T5 the table reader is for the checked functions only', pg_temp.t_n(format('select public.week_input(%L, 1, current_date)', spr)), 'error 42501');
perform pg_temp.t_admin();
f := f || pg_temp.t_eq('T5b the week from the tables is the week from the raw input', pg_temp.t_n(format(
  'select abs((public.score_week_raw(public.week_input(%L, 1, current_date)) ->> ''score'')::numeric - score) < 0.000001 from public.week_scores where sprint_id = %L and sprint_week = 1', spr, spr)), 'true');
perform pg_temp.t_as(nobody_u);
f := f || pg_temp.t_eq('T6 nobody else can freeze Sam''s week', pg_temp.t_n(format('select public.freeze_week(%L, 1)', spr)), 'error 42501');
f := f || pg_temp.t_eq('T7 ... or make the summary', pg_temp.t_n(format('select public.make_sprint_summary(%L)', spr)), 'error 42501');

-- make_sprint_summary: only the organisation's objective and the Strategy serving it
perform pg_temp.t_as(sam);
summ := pg_temp.t_n(format('select public.make_sprint_summary(%L)', spr))::uuid;
f := f || pg_temp.t_eq('T8 week 2 frozen too (nothing logged: 0)', pg_temp.t_n(format('select score::float8 from public.week_scores where sprint_id = %L and sprint_week = 2', spr)), '0');
f := f || pg_temp.t_eq('T9 the summary holds only the organisation''s objective', pg_temp.t_n(format('select string_agg(o ->> ''name'', '','') from public.sprint_summaries s, jsonb_array_elements(s.summary -> ''objectives'') o where s.id = %L', summ)), 'Referral revenue');
f := f || pg_temp.t_eq('T10 ... and only the Strategy serving it', pg_temp.t_n(format('select string_agg(g ->> ''name'', '','') from public.sprint_summaries s, jsonb_array_elements(s.summary -> ''strategies'') g where s.id = %L', summ)), 'Grow through referrals');
f := f || pg_temp.t_near('T11 its sprint score: the mean of its weeks (83.3 and 0)', pg_temp.t_n(format('select (g ->> ''average'')::numeric from public.sprint_summaries s, jsonb_array_elements(s.summary -> ''strategies'') g where s.id = %L', summ))::numeric, 41.666667);
f := f || pg_temp.t_eq('T12 the objective''s status at the sprint''s end', pg_temp.t_n(format('select o ->> ''status'' from public.sprint_summaries s, jsonb_array_elements(s.summary -> ''objectives'') o where s.id = %L', summ)), 'on_track');
f := f || pg_temp.t_eq('T13 nothing else in the summary', pg_temp.t_n(format('select string_agg(k, '','' order by k) from public.sprint_summaries s, jsonb_object_keys(s.summary) k where s.id = %L', summ)), 'objectives,strategies');
f := f || pg_temp.t_eq('T14 made once: asking again changes nothing', pg_temp.t_n(format('select public.make_sprint_summary(%L) = %L', spr, summ)), 'true');
perform pg_temp.t_as(sponsor_u);
f := f || pg_temp.t_eq('T15 the sponsor gets the summary, and never the sprint average', pg_temp.t_n(format('select string_agg(k, '','' order by k) from public.person_summaries(%L) p, jsonb_object_keys(p.summary) k', sam)), 'objectives,strategies');
f := f || pg_temp.t_eq('T16 the sponsor can''t read week scores', pg_temp.t_n(format('select count(*) from public.week_scores where user_id = %L', sam)), '0');
f := f || pg_temp.t_eq('T17 a sponsor isn''t a leader: no organisation figures', pg_temp.t_n('select public.org_figures()'), 'error 42501');

-- org_figures: one seat
perform pg_temp.t_as(lead_u);
r := pg_temp.t_n('select public.org_figures()')::jsonb;
f := f || pg_temp.t_eq('T18 one seat: counted', r ->> 'seats', '1');
f := f || pg_temp.t_eq('T19 one seat: no use figures', jsonb_typeof(r -> 'use'), 'null');
f := f || pg_temp.t_eq('T20 one seat: no share at their own standard', jsonb_typeof(r -> 'behaviour' -> 'atOwnStandard'), 'null');
f := f || pg_temp.t_near('T21 one seat: Strategy figures show', (r -> 'behaviour' ->> 'averageStrategyScore')::numeric, 41.666667);
f := f || pg_temp.t_eq('T22 one seat: the objective headline shows', r -> 'headline' ->> 'shown', '100');
f := f || pg_temp.t_eq('T23 no name anywhere in the figures', (r::text like '%Sam%' or r::text like format('%%%s%%', sam))::text, 'false');
perform pg_temp.t_as(lead_other);
f := f || pg_temp.t_eq('T24 another team''s leader can''t ask for this team', pg_temp.t_n(format('select public.org_figures(%L)', team1)), 'error 42501');
f := f || pg_temp.t_eq('T25 ... and their own team is empty', pg_temp.t_n('select public.org_figures() ->> ''seats'''), '0');
perform pg_temp.t_as(admin_u);
f := f || pg_temp.t_eq('T26 an admin gets no figures', pg_temp.t_n('select public.org_figures()'), 'error 42501');

-- three seats, then one leaves
perform pg_temp.t_admin();
insert into public.organisation_members (organisation_id, user_id) values (org1, p2) returning id into m2;
insert into public.organisation_members (organisation_id, user_id) values (org1, p3) returning id into m3;
insert into public.team_members (member_id, team_id) values (m2, team1), (m3, team1);
update public.organisation_members set confirmed_at = now() where id in (m2, m3);
f := f || pg_temp.t_eq('T26b not even the admin role can confirm for someone', pg_temp.t_n(format('select count(*) from public.organisation_members where id in (%L, %L) and confirmed_at is not null', m2, m3)), '0');
perform pg_temp.t_as(p2); perform public.membership_confirm(m2);
perform pg_temp.t_as(p3); perform public.membership_confirm(m3);
perform pg_temp.t_admin();
insert into public.performance_plans (user_id) values (p2) returning id into plan2;
insert into public.performance_plans (user_id) values (p3) returning id into plan3;
insert into public.sprints (user_id, plan_id, number, start_on, status) values (p2, plan2, 1, mon - 84, 'finished') returning id into spr2;
insert into public.sprints (user_id, plan_id, number, start_on, status) values (p3, plan3, 1, mon - 84, 'finished') returning id into spr3;
insert into public.sprint_summaries (user_id, sprint_id, member_id, organisation_id, team_ids, sprint_number, sprint_start, sprint_end, summary, methods_version, sprint_average, standard) values
  (p2, spr2, m2, org1, array[team1], 1, mon - 84, mon - 1, '{"objectives": [{"status": "off_track"}], "strategies": [{"average": 70}]}', '1.1', 90, 85),
  (p3, spr3, m3, org1, array[team1], 1, mon - 84, mon - 1, '{"objectives": [{"status": "reached"}], "strategies": [{"average": 90}]}', '1.1', 80, 85);
perform pg_temp.t_as(lead_u);
r := pg_temp.t_n('select public.org_figures()')::jsonb;
f := f || pg_temp.t_eq('T27 three seats: use figures show', jsonb_typeof(r -> 'use'), 'object');
f := f || pg_temp.t_near('T28 three seats: share at their own standard (Sam 34 and 90 of 85; 80 of 85)', (r -> 'behaviour' ->> 'atOwnStandard')::numeric, 33.333333);
f := f || pg_temp.t_near('T29 three seats: average Strategy score', (r -> 'behaviour' ->> 'averageStrategyScore')::numeric, 67.222222);
f := f || pg_temp.t_eq('T30 three seats: headline (on track, off track, reached)', r -> 'headline' ->> 'shown', '67');
perform pg_temp.t_as(admin_u);
perform public.membership_end(m3);
perform pg_temp.t_as(lead_u);
r := pg_temp.t_n('select public.org_figures()')::jsonb;
f := f || pg_temp.t_eq('T31 someone left: two seats now', r ->> 'seats', '2');
f := f || pg_temp.t_eq('T32 ... but their figures still count, anonymised', r ->> 'peopleCounted', '3');
f := f || pg_temp.t_eq('T33 ... and with two seats, no use figures', jsonb_typeof(r -> 'use'), 'null');
f := f || pg_temp.t_eq('T34 ... and nothing named about them comes back', pg_temp.t_n(format('select count(*) from public.person_summaries(%L)', p3)), '0');

-- pulse_results (M18-1's answers)
perform pg_temp.t_as(boss);
select * into rq from public.pulse_send_create('short', 6, now(), now() + interval '7 days');
psend := rq.send_id; ptok := rq.token;
perform pg_temp.t_anon();
perform public.feedback_send(ptok, '{"energy": "high", "sleep": "good", "stress": "sometimes", "workload": "often", "support": "always", "comment": "More focus time."}');
perform public.feedback_send(ptok, '{"energy": "ok", "sleep": "ok", "stress": "often", "workload": "sometimes", "support": "often", "comment": ""}');
perform public.feedback_send(ptok, '{"energy": "very_high", "sleep": "very_good", "stress": "rarely", "workload": "often", "support": "always"}', 'Ola', true);
perform public.feedback_send(ptok, '{"energy": "low", "sleep": "poor", "stress": "always", "workload": "rarely", "support": "sometimes", "comment": "Fewer meetings."}');
perform pg_temp.t_as(boss);
r := pg_temp.t_n(format('select public.pulse_results(%L)', psend))::jsonb;
f := f || pg_temp.t_eq('T35 the pulse: answers from how many', (r ->> 'answers') || ' of ' || (r ->> 'wentTo'), '4 of 6');
f := f || pg_temp.t_near('T36 the pulse: workload as in M18-1', (r -> 'measures' -> 'workload' ->> 'figure')::numeric, 56.25);
f := f || pg_temp.t_eq('T37 the pulse: comments as written, without names', jsonb_array_length(r -> 'comments')::text, '2');
f := f || pg_temp.t_eq('T38 the pulse: only the answer with a name added shows named', (select string_agg(x ->> 'name', ',') from jsonb_array_elements(r -> 'named') x), 'Ola');
f := f || pg_temp.t_eq('T39 the pulse: one small next step, from the lowest measure', r ->> 'nextStep', 'Ask your team what is adding the most pressure right now.');
perform pg_temp.t_as(nobody_u);
f := f || pg_temp.t_eq('T40 nobody else sees the pulse', pg_temp.t_n(format('select public.pulse_results(%L)', psend)), 'error 42501');

-- impact_results (M17)
perform pg_temp.t_as(sam);
insert into public.impact_behaviours (user_id, member_id, text) values (sam, m_sam, 'Makes decisions in good time') returning id into b1;
insert into public.impact_behaviours (user_id, member_id, text) values (sam, m_sam, 'Gives clear feedback') returning id into b2;
select * into rq from public.feedback_request_create('before_after_impact', null); q1s := rq.request_id; t1s := rq.token;
select * into rq from public.feedback_request_create('before_after_impact', null); q1e := rq.request_id; t1e := rq.token;
select * into rq from public.feedback_request_create('before_after_impact', null); q2s := rq.request_id; t2s := rq.token;
select * into rq from public.feedback_request_create('before_after_impact', null); q2e := rq.request_id; t2e := rq.token;
insert into public.impact_raters (user_id, rater_label, rater_role, start_request_id, end_request_id) values
  (sam, 'Sponsor', 'sponsor', q1s, q1e), (sam, 'Colleague', 'colleague', q2s, q2e);
perform pg_temp.t_anon();
perform public.feedback_send(t1s, jsonb_build_object('often', jsonb_build_object(b1, 'sometimes', b2, 'sometimes')));
perform public.feedback_send(t1e, jsonb_build_object('often', jsonb_build_object(b1, 'often', b2, 'often'), 'looking_back', jsonb_build_object(b1, 'rarely', b2, 'rarely')));
perform public.feedback_send(t2s, jsonb_build_object('often', jsonb_build_object(b1, 'rarely', b2, 'rarely')));
perform public.feedback_send(t2e, jsonb_build_object('often', jsonb_build_object(b1, 'sometimes', b2, 'sometimes')));
perform pg_temp.t_as(sam);
r := pg_temp.t_n(format('select public.impact_results(%L)', sam))::jsonb;
f := f || pg_temp.t_near('T41 impact: end minus start (62.5 − 37.5)', (r ->> 'change')::numeric, 25);
f := f || pg_temp.t_near('T42 impact: against the looking-back rating', (r ->> 'lookingBackChange')::numeric, 37.5);
f := f || pg_temp.t_eq('T43 impact: improved (10 points or more)', r ->> 'improved', 'true');
perform pg_temp.t_as(sponsor_u);
f := f || pg_temp.t_eq('T44 impact: not for the sponsor', pg_temp.t_n(format('select public.impact_results(%L)', sam)), 'error 42501');
perform pg_temp.t_as(lead_u);
f := f || pg_temp.t_eq('T45 impact: the organisation sees only the total across people', pg_temp.t_n('select public.org_figures() -> ''outcomes'' ->> ''impactPeople'''), '1');
perform pg_temp.t_anon();
f := f || pg_temp.t_eq('T46 signed out reaches no score function', pg_temp.t_n('select public.score_round(1.5)'), 'error 42501');
