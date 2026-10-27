// The rules test's Phase 1 part (migrations 026 to 032): the invented people,
// how they are linked, every new personal table, every new function, and
// the scenarios that take several steps. config.mjs brings it together.
//
// Invented people have no account on the test project: run.mjs makes them
// inside the rolled-back transaction, with made-up ids, so nothing is kept.

import { NOBODY, SIGNED_IN, ANYONE, ONLY, COACH_SEES, OWN_OR_COACH, COACH_ONLY } from './access.mjs';

// ---------------------------------------------------------------- people
export const INVENTED_PEOPLE = [
  { key: 'no_coach', label: 'No coach (Lee)', role: 'authenticated' },
  { key: 'sponsor', label: 'Sponsor (Morgan)', role: 'authenticated' },
  { key: 'leader_parent', label: 'Leader over the parent team (Casey)', role: 'authenticated' },
  { key: 'leader_child', label: 'Leader over the other child team (Riley)', role: 'authenticated' },
  { key: 'org_admin', label: 'Organisation admin (Avery)', role: 'authenticated' },
  { key: 'leaver', label: 'Leaver (Quinn)', role: 'authenticated' },
  { key: 'sponsor_two', label: 'Sponsor in the second organisation (Drew)', role: 'authenticated' },
];

// How they are linked (what the expectations below rely on). SETUP makes
// the same links in the database.
export const PHASE1_RELATIONSHIPS = [
  { from: 'owner_coach', kind: 'coach of', to: 'client' },
  { from: 'second_coach', kind: 'coach of', to: 'org_client' },
  { from: 'sponsor', kind: 'sponsor of', to: 'org_client' },
  { from: 'leader_parent', kind: 'leads', to: 'org_client' },
];

const id = (key) => `current_setting('rules.${key}')::uuid`;

// The organisation: a parent team with two child teams. Jordan (the
// organisation client) has a seat in child team one, sponsored by Morgan;
// Quinn had one too and has left. Casey leads the parent team (and so both
// children); Riley leads child team two only; Avery is the admin. Alex is
// the owner coach, coaching Sam; Priya coaches Jordan. Jordan shares
// Progress, not the monthly check-in, and shares their wellbeing with the
// organisation (the first one only: wellbeing is chosen per organisation,
// migration 033); Quinn shared theirs before leaving. Drew sponsors Jordan's
// seat in a second organisation.
export const SETUP = [`do $rel$
declare oc uuid; sc uuid; org uuid; tp uuid; tc1 uuid; tc2 uuid; mj uuid; ml uuid; pj uuid; pl uuid; sj uuid; sl uuid; qs uuid; rq uuid;
begin
  insert into public.coaches (user_id, role, display_first_name) values (${id('owner_coach')}, 'owner', 'Alex') returning id into oc;
  insert into public.coaches (user_id, role, display_first_name) values (${id('second_coach')}, 'coach', 'Priya') returning id into sc;
  perform set_config('rules.owner_coach_c', oc::text, true);
  insert into public.coach_clients (client_id, coach_id) values (${id('client')}, oc), (${id('org_client')}, sc);
  insert into public.organisations (name) values ('Rules test organisation') returning id into org;
  insert into public.teams (organisation_id, name) values (org, 'Parent') returning id into tp;
  insert into public.teams (organisation_id, name, parent_team_id) values (org, 'Child one', tp) returning id into tc1;
  insert into public.teams (organisation_id, name, parent_team_id) values (org, 'Child two', tp) returning id into tc2;
  perform set_config('rules.org', org::text, true);
  perform set_config('rules.team_c1', tc1::text, true);
  insert into public.organisation_admins (organisation_id, user_id) values (org, ${id('org_admin')});
  insert into public.organisation_members (organisation_id, user_id) values (org, ${id('org_client')}) returning id into mj;
  insert into public.organisation_members (organisation_id, user_id) values (org, ${id('leaver')}) returning id into ml;
  perform set_config('rules.m_org_client', mj::text, true);
  insert into public.team_members (member_id, team_id) values (mj, tc1), (ml, tc1);
  insert into public.seat_sponsors (member_id, sponsor_user_id) values (mj, ${id('sponsor')}), (ml, ${id('sponsor')});
  perform set_config('clarity.confirming', 'yes', true);
  update public.organisation_members set confirmed_at = now() where id in (mj, ml);
  perform set_config('clarity.confirming', '', true);
  insert into public.leader_teams (user_id, team_id) values (${id('leader_parent')}, tp), (${id('leader_child')}, tc2);
  insert into public.sharing_switches (user_id, part, is_on) values
    (${id('org_client')}, 'progress', true), (${id('org_client')}, 'checkin', false);
  insert into public.org_wellbeing_switches (user_id, organisation_id, is_on) values
    (${id('org_client')}, org, true), (${id('leaver')}, org, true);
  -- frozen summaries and a finished check-in for both seats
  insert into public.performance_plans (user_id, status) values (${id('org_client')}, 'archived') returning id into pj;
  insert into public.performance_plans (user_id, status) values (${id('leaver')}, 'archived') returning id into pl;
  insert into public.sprints (user_id, plan_id, number, start_on, status) values (${id('org_client')}, pj, 900, date '2026-01-05', 'finished') returning id into sj;
  insert into public.sprints (user_id, plan_id, number, start_on, status) values (${id('leaver')}, pl, 900, date '2026-01-05', 'finished') returning id into sl;
  insert into public.sprint_summaries (user_id, sprint_id, member_id, organisation_id, team_ids, sprint_number, sprint_start, sprint_end, summary, methods_version, sprint_average, standard) values
    (${id('org_client')}, sj, mj, org, array[tc1], 900, date '2026-01-05', date '2026-03-29', '{"objectives": [{"status": "on_track"}], "strategies": [{"average": 80}]}', '1.1', 86, 85),
    (${id('leaver')}, sl, ml, org, array[tc1], 900, date '2026-01-05', date '2026-03-29', '{"objectives": [{"status": "reached"}], "strategies": [{"average": 90}]}', '1.1', 90, 85);
  insert into public.checkins (user_id, month, answers, status) values
    (${id('org_client')}, date '2031-01-01', '{"H3": "often"}', 'finished'), (${id('leaver')}, date '2031-01-01', '{"H3": "rarely"}', 'finished');
  -- Jordan also has a seat in a second organisation, with a summary there,
  -- which nobody in the first organisation may see.
  declare o2 uuid; m2 uuid; s2 uuid; begin
    insert into public.organisations (name) values ('Second rules test organisation') returning id into o2;
    insert into public.organisation_members (organisation_id, user_id) values (o2, ${id('org_client')}) returning id into m2;
    perform set_config('clarity.confirming', 'yes', true);
    update public.organisation_members set confirmed_at = now() where id = m2;
    perform set_config('clarity.confirming', '', true);
    insert into public.seat_sponsors (member_id, sponsor_user_id) values (m2, ${id('sponsor_two')});
    perform set_config('rules.org2', o2::text, true);
    insert into public.sprints (user_id, plan_id, number, start_on, status) values (${id('org_client')}, pj, 901, date '2026-04-06', 'finished') returning id into s2;
    insert into public.sprint_summaries (user_id, sprint_id, member_id, organisation_id, team_ids, sprint_number, sprint_start, sprint_end, summary, methods_version)
      values (${id('org_client')}, s2, m2, o2, '{}', 901, date '2026-04-06', date '2026-06-28', '{"objectives": [], "strategies": []}', '1.1');
  end;
  -- Quinn leaves
  update public.organisation_members set ended_on = current_date where id = ml;
  update public.team_members set ended_on = current_date where member_id = ml;
  update public.seat_sponsors set ended_on = current_date where member_id = ml;
  -- Sam's feedback links, with known links: open (2 answers), expired, switched off, full (1 of 1)
  qs := (select q.id from public.feedback_question_sets q where q.tool_key = 'before_after_impact' order by q.version desc limit 1);
  insert into public.feedback_requests (asker_id, tool_key, question_set_id, token_hash, max_answers)
    values (${id('client')}, 'before_after_impact', qs, encode(extensions.digest(repeat('a', 64), 'sha256'), 'hex'), 2);
  insert into public.feedback_requests (asker_id, tool_key, question_set_id, token_hash, opens_at, expires_at)
    values (${id('client')}, 'before_after_impact', qs, encode(extensions.digest(repeat('b', 64), 'sha256'), 'hex'), now() - interval '40 days', now() - interval '1 day');
  insert into public.feedback_requests (asker_id, tool_key, question_set_id, token_hash, switched_off_at)
    values (${id('client')}, 'before_after_impact', qs, encode(extensions.digest(repeat('c', 64), 'sha256'), 'hex'), now());
  insert into public.feedback_requests (asker_id, tool_key, question_set_id, token_hash, max_answers)
    values (${id('client')}, 'before_after_impact', qs, encode(extensions.digest(repeat('d', 64), 'sha256'), 'hex'), 1) returning id into rq;
  insert into public.feedback_answers (request_id, answers) values (rq, '{}');
  perform set_config('rules.req_full', rq::text, true);
  -- Sam's team pulses (methods M18): one open with 3 answers (1 named), one
  -- closed with 2 answers, one closed with 3.
  declare pq uuid := (select q.id from public.feedback_question_sets q where q.tool_key = 'team_pulse' order by q.version desc limit 1);
          pr uuid; ps uuid; k text; a text := '{"energy": "high", "sleep": "good", "stress": "rarely", "workload": "often", "support": "often", "comment": "Fewer meetings."}';
  begin
    foreach k in array array['open', 'two', 'three'] loop
      insert into public.feedback_requests (asker_id, tool_key, question_set_id, token_hash, opens_at, expires_at, max_answers, switched_off_at)
        values (${id('client')}, 'team_pulse', pq, encode(extensions.digest(case k when 'open' then repeat('e', 64) else 'rules-pulse-' || k end, 'sha256'), 'hex'),
                now() - interval '1 day', now() + interval '6 days', 8, case when k = 'open' then null else now() end) returning id into pr;
      insert into public.pulse_sends (boss_id, kind, request_id, went_to, opens_at, closes_at)
        values (${id('client')}, 'short', pr, 8, now() - interval '1 day', now() + interval '6 days') returning id into ps;
      insert into public.feedback_answers (request_id, answers) select pr, a::jsonb from generate_series(1, case k when 'two' then 2 else 3 end);
      perform set_config('rules.pulse_' || k, ps::text, true);
      perform set_config('rules.pulse_req_' || k, pr::text, true);
    end loop;
    update public.feedback_answers set giver_name = 'Ola', name_added = true
     where id = (select id from public.feedback_answers where request_id = current_setting('rules.pulse_req_open')::uuid limit 1);
  end;
end
$rel$;`];

// ---------------------------------------------------------------- tables
// The people whose rows each Phase 1 table is checked on: someone of each
// kind (the owner coach, a coach's client, another coach's client with a
// seat, someone without a coach, and someone who has left). Every person
// is checked as a viewer.
const OWNERS = ['owner_coach', 'client', 'org_client', 'no_coach', 'leaver'];
const D = (n) => `date '2030-01-01' + ${n}`;
const userRow = (cols) => ({ owner: 't.user_id', handTo: ({ other }) => `user_id = ${other}`, owners: OWNERS, ...cols });
const WRITES_NOBODY = { add: NOBODY, change: NOBODY, remove: NOBODY };

export const PHASE1_TABLES = [
  userRow({
    table: 'person_settings', key: 'user_id', keyIsOwner: true,
    make: ({ owner }) => `insert into public.person_settings (user_id) values (${owner}) on conflict (user_id) do nothing`,
    makeForCheck: ({ owner }) => `insert into public.person_settings (user_id) values (${owner})`,
    change: 'theme = t.theme',
    access: { remove: NOBODY }, note: 'Settings are changed, never removed (the account going removes them).',
  }),
  userRow({
    table: 'working_patterns',
    make: ({ owner, id: k, n }) => `insert into public.working_patterns (id, user_id, starts_on, days) values (${k}, ${owner}, ${D(n)}, '{0,1,2}')`,
    change: 'days = t.days',
  }),
  userRow({
    table: 'sharing_switches', key: 'user_id', keyIsOwner: true,
    make: ({ owner }) => `insert into public.sharing_switches (user_id, part, is_on) values (${owner}, 'mission', true) on conflict (user_id, part) do nothing`,
    makeForCheck: ({ owner }) => `insert into public.sharing_switches (user_id, part, is_on) values (${owner}, 'mission', true)`,
    change: 'is_on = t.is_on',
    access: { remove: NOBODY }, note: 'A switch is turned off, never removed.',
  }),
  userRow({
    table: 'sharing_switch_history',
    make: ({ owner, id: k }) => `insert into public.sharing_switch_history (id, user_id, part, is_on) values (${k}, ${owner}, 'mission', true)`,
    change: 'is_on = t.is_on',
    access: WRITES_NOBODY, note: 'Written only by the switches\' trigger.',
  }),
  userRow({
    table: 'performance_plans',
    make: ({ owner, id: k }) => `insert into public.performance_plans (id, user_id, mission) values (${k}, ${owner}, 'Rules test mission')`,
    makeForCheck: ({ owner, id: k }) => `insert into public.performance_plans (id, user_id, status) values (${k}, ${owner}, 'archived')`,
    change: 'mission = t.mission',
    access: { read: COACH_SEES('mission') },
  }),
  userRow({
    table: 'plan_versions', links: ['performance_plans'],
    make: ({ owner, id: k, n, rowOf }) => `insert into public.plan_versions (id, plan_id, user_id, major, minor, kind, snapshot) values (${k}, ${rowOf('performance_plans')}, ${owner}, 1, ${n}, 'minor', '{}')`,
    change: 'change_note = t.change_note',
    access: { change: NOBODY, remove: NOBODY }, note: 'Plan history is never changed or removed.',
  }),
  userRow({
    table: 'outcome_objectives', links: ['performance_plans'],
    make: ({ owner, id: k, rowOf }) => `insert into public.outcome_objectives (id, plan_id, user_id, name, kind, due_on) values (${k}, ${rowOf('performance_plans')}, ${owner}, 'Rules test', 'milestone', date '2030-01-01')`,
    change: 'name = t.name',
    access: { read: COACH_SEES('progress') },
  }),
  userRow({
    table: 'objective_figures', links: ['outcome_objectives'],
    make: ({ owner, id: k, n, rowOf }) => `insert into public.objective_figures (id, objective_id, user_id, value, recorded_on) values (${k}, ${rowOf('outcome_objectives')}, ${owner}, ${n}, current_date)`,
    change: 'value = t.value',
    access: { read: COACH_SEES('progress') },
  }),
  userRow({
    table: 'objective_proposals',
    make: ({ owner, id: k, rowOf }) => `insert into public.objective_proposals (id, objective_id, user_id, proposed_by, changes) values (${k}, ${rowOf('outcome_objectives')}, ${owner}, ${owner}, '{"target_value": 1}')`,
    change: 'note = t.note',
    access: WRITES_NOBODY, note: 'Written only through the sponsor and decide functions.',
  }),
  userRow({
    table: 'plan_strategies', links: ['performance_plans'],
    make: ({ owner, id: k, rowOf }) => `insert into public.plan_strategies (id, plan_id, user_id, name) values (${k}, ${rowOf('performance_plans')}, ${owner}, 'Rules test')`,
    change: 'name = t.name',
    access: { read: COACH_SEES('progress') },
  }),
  userRow({
    table: 'strategy_objectives', key: 'strategy_id', rowKey: ({ rowOf }) => rowOf('plan_strategies'),
    links: ['plan_strategies', 'outcome_objectives'],
    make: ({ owner, rowOf }) => `insert into public.strategy_objectives (strategy_id, objective_id, user_id) values (${rowOf('plan_strategies')}, ${rowOf('outcome_objectives')}, ${owner})`,
    change: 'created_at = t.created_at',
    access: { read: COACH_SEES('progress') },
  }),
  userRow({
    table: 'habits', links: ['plan_strategies'],
    make: ({ owner, id: k, rowOf }) => `insert into public.habits (id, plan_id, strategy_id, user_id, name, measure) values (${k}, ${rowOf('performance_plans')}, ${rowOf('plan_strategies')}, ${owner}, 'Rules test', 'yes_no_weekly')`,
    change: 'name = t.name',
  }),
  userRow({
    table: 'sprints', links: ['performance_plans'],
    make: ({ owner, id: k, n, rowOf }) => `insert into public.sprints (id, user_id, plan_id, number, start_on, status) values (${k}, ${owner}, ${rowOf('performance_plans')}, 100 + ${n}, current_date, 'finished')`,
    change: 'label = t.label',
    access: { read: COACH_SEES('progress') },
  }),
  userRow({
    table: 'sprint_habits', links: ['sprints', 'plan_strategies'],
    make: ({ owner, id: k, rowOf }) => `insert into public.sprint_habits (id, sprint_id, user_id, strategy_id, name) values (${k}, ${rowOf('sprints')}, ${owner}, ${rowOf('plan_strategies')}, 'Rules test')`,
    change: 'name = t.name',
  }),
  userRow({
    table: 'sprint_habit_settings', links: ['sprint_habits'],
    make: ({ owner, id: k, n, rowOf }) => `insert into public.sprint_habit_settings (id, sprint_habit_id, user_id, from_week, measure) values (${k}, ${rowOf('sprint_habits')}, ${owner}, ${n}, 'yes_no_weekly')`,
    change: 'impact = t.impact',
  }),
  userRow({
    table: 'recovery_periods',
    make: ({ owner, id: k, n }) => `insert into public.recovery_periods (id, user_id, start_on, end_on, ended_at) values (${k}, ${owner}, ${D(n)}, ${D(n)} + 3, now())`,
    change: 'extended_days = t.extended_days',
    access: { read: OWN_OR_COACH }, note: 'Let [coach] know is ticked by default: the coach sees that it started and until when.',
  }),
  userRow({
    table: 'recovery_recharge_answers', links: ['recovery_periods'],
    make: ({ owner, id: k, n, rowOf }) => `insert into public.recovery_recharge_answers (id, recovery_id, user_id, local_date, answer) values (${k}, ${rowOf('recovery_periods')}, ${owner}, ${D(n)}, 'Rules test')`,
    change: 'answer = t.answer',
  }),
  userRow({
    table: 'habit_logs', links: ['sprint_habits'],
    make: ({ owner, id: k, n, rowOf }) => `insert into public.habit_logs (id, user_id, sprint_habit_id, local_date, value) values (${k}, ${owner}, ${rowOf('sprint_habits')}, ${D(n)}, 1)`,
    change: 'value = t.value',
  }),
  userRow({
    table: 'todos', links: ['plan_strategies'],
    make: ({ owner, id: k, rowOf }) => `insert into public.todos (id, user_id, strategy_id, text) values (${k}, ${owner}, ${rowOf('plan_strategies')}, 'Rules test')`,
    change: 'text = t.text',
  }),
  userRow({
    table: 'todo_moves',
    make: ({ owner, id: k, rowOf }) => `insert into public.todo_moves (id, todo_id, user_id, moved_on) values (${k}, ${rowOf('todos')}, ${owner}, current_date)`,
    change: 'moved_on = t.moved_on',
    access: WRITES_NOBODY, note: 'Written only by the to-dos\' trigger.',
  }),
  userRow({
    table: 'wins',
    make: ({ owner, id: k }) => `insert into public.wins (id, user_id, what, local_date) values (${k}, ${owner}, 'Rules test', current_date)`,
    change: 'what = t.what',
  }),
  userRow({
    table: 'win_strategies', key: 'win_id', rowKey: ({ rowOf }) => rowOf('wins'), links: ['wins', 'plan_strategies'],
    make: ({ owner, rowOf }) => `insert into public.win_strategies (win_id, strategy_id, user_id) values (${rowOf('wins')}, ${rowOf('plan_strategies')}, ${owner})`,
    change: 'user_id = t.user_id',
  }),
  userRow({
    table: 'performance_evidence',
    make: ({ owner, id: k }) => `insert into public.performance_evidence (id, user_id, text, local_date) values (${k}, ${owner}, 'Rules test', current_date)`,
    change: 'text = t.text',
    note: 'Not shared: the coach sees a piece of evidence only once it is shared.',
  }),
  userRow({
    table: 'day_plans',
    make: ({ owner, id: k, n }) => `insert into public.day_plans (id, user_id, local_date) values (${k}, ${owner}, ${D(n)})`,
    change: 'grateful_for = t.grateful_for',
  }),
  userRow({
    table: 'day_plan_todos', key: 'day_plan_id', rowKey: ({ rowOf }) => rowOf('day_plans'), links: ['day_plans', 'todos'],
    make: ({ owner, rowOf }) => `insert into public.day_plan_todos (day_plan_id, todo_id, user_id) values (${rowOf('day_plans')}, ${rowOf('todos')}, ${owner})`,
    change: 'is_top = t.is_top',
  }),
  userRow({
    table: 'day_plan_strategies', key: 'day_plan_id', rowKey: ({ rowOf }) => rowOf('day_plans'), links: ['day_plans', 'plan_strategies'],
    make: ({ owner, rowOf }) => `insert into public.day_plan_strategies (day_plan_id, strategy_id, user_id) values (${rowOf('day_plans')}, ${rowOf('plan_strategies')}, ${owner})`,
    change: 'user_id = t.user_id',
  }),
  userRow({
    table: 'day_reviews',
    make: ({ owner, id: k, n }) => `insert into public.day_reviews (id, user_id, local_date) values (${k}, ${owner}, ${D(n)})`,
    change: 'went_well = t.went_well',
  }),
  userRow({
    table: 'day_review_strategies', key: 'day_review_id', rowKey: ({ rowOf }) => rowOf('day_reviews'), links: ['day_reviews', 'plan_strategies'],
    make: ({ owner, rowOf }) => `insert into public.day_review_strategies (day_review_id, strategy_id, user_id, level) values (${rowOf('day_reviews')}, ${rowOf('plan_strategies')}, ${owner}, 2)`,
    change: 'level = t.level',
  }),
  userRow({
    table: 'weekly_debriefs', links: ['sprints'],
    make: ({ owner, id: k, n, rowOf }) => `insert into public.weekly_debriefs (id, user_id, sprint_id, sprint_week) values (${k}, ${owner}, ${rowOf('sprints')}, ${n})`,
    change: 'went_well = t.went_well',
    note: 'Not shared this week: the coach doesn\'t see it.',
  }),
  userRow({
    table: 'week_scores',
    make: ({ owner, id: k, n, rowOf }) => `insert into public.week_scores (id, user_id, sprint_id, sprint_week, week_start, week_end, score, methods_version) values (${k}, ${owner}, ${rowOf('sprints')}, ${n}, current_date, current_date, 50, '1.1')`,
    change: 'score = t.score',
    access: { read: COACH_SEES('progress'), ...WRITES_NOBODY }, note: 'Written only by freeze_week.',
  }),
  userRow({
    table: 'emotional_control_checks',
    make: ({ owner, id: k }) => `insert into public.emotional_control_checks (id, user_id, local_date, tool, line) values (${k}, ${owner}, current_date, 'above_below_line', 'above')`,
    change: 'line = t.line',
  }),
  userRow({
    table: 'checkins',
    make: ({ owner, id: k, n }) => `insert into public.checkins (id, user_id, month) values (${k}, ${owner}, (date '2030-01-01' + make_interval(months => ${n}))::date)`,
    change: 'answers = t.answers',
    access: { read: COACH_SEES('checkin') },
  }),
  userRow({
    table: 'checkin_flags',
    make: ({ owner, id: k, rowOf }) => `insert into public.checkin_flags (id, checkin_id, user_id, code, reason) values (${k}, ${rowOf('checkins')}, ${owner}, 'H3', 'stress_always')`,
    change: 'draft_note = t.draft_note',
    access: { read: COACH_ONLY('checkin'), ...WRITES_NOBODY },
    note: 'Only the coach, while the check-in is shared; never the client. Written only by the check-in trigger and coach_flag_decide.',
  }),
  userRow({
    table: 'goal_checks', links: ['outcome_objectives'],
    make: ({ owner, id: k, rowOf }) => `insert into public.goal_checks (id, user_id, objective_id, occasion, enjoy, matters, guilty, someone_else) values (${k}, ${owner}, ${rowOf('outcome_objectives')}, 'sprint_end', 4, 4, 2, 2)`,
    change: 'enjoy = t.enjoy',
    access: { read: COACH_SEES('progress') },
  }),
  userRow({
    table: 'pattern_questions',
    make: ({ owner, id: k }) => `insert into public.pattern_questions (id, user_id, slot, label, cause, result) values (${k}, ${owner}, 1, 'Rules test', '{}', '{}')`,
    makeForCheck: ({ owner, id: k }) => `insert into public.pattern_questions (id, user_id, slot, label, cause, result, archived_at) values (${k}, ${owner}, 2, 'Rules test', '{}', '{}', now())`,
    change: 'label = t.label',
    access: { read: COACH_SEES('progress') },
  }),
  userRow({
    table: 'pattern_cards',
    make: ({ owner, id: k }) => `insert into public.pattern_cards (id, user_id, link_id, direction, strength, figures, methods_version) values (${k}, ${owner}, 'L1', 'positive', 'clear', '{}', '1.1')`,
    change: 'strength = t.strength',
    access: { read: COACH_SEES('progress'), ...WRITES_NOBODY }, note: 'Written only by the pattern job.',
  }),
  userRow({
    table: 'impact_behaviours',
    make: ({ owner, id: k }) => `insert into public.impact_behaviours (id, user_id, text) values (${k}, ${owner}, 'Rules test')`,
    change: 'text = t.text',
    access: { read: COACH_SEES('progress') },
  }),
  userRow({
    table: 'impact_raters',
    make: ({ owner, id: k }) => `insert into public.impact_raters (id, user_id, rater_label, rater_role) values (${k}, ${owner}, 'Rules test', 'colleague')`,
    change: 'rater_label = t.rater_label',
    access: { read: COACH_SEES('progress') },
  }),
  {
    table: 'pulse_sends', owner: 't.boss_id', owners: OWNERS, handTo: ({ other }) => `boss_id = ${other}`,
    make: ({ owner, id: k, n }) => `with r as (insert into public.feedback_requests (asker_id, tool_key, question_set_id, token_hash)
        values (${owner}, 'team_pulse', (select id from public.feedback_question_sets where tool_key = 'team_pulse' limit 1), encode(extensions.digest('rules-pulse-' || ${n} || ${owner}::text, 'sha256'), 'hex')) returning id)
      insert into public.pulse_sends (id, boss_id, kind, request_id, went_to, opens_at, closes_at) select ${k}, ${owner}, 'short', r.id, 5, now(), now() + interval '7 days' from r`,
    change: 'went_to = t.went_to',
    access: { add: NOBODY, change: NOBODY }, note: 'Made only through pulse_send_create; the boss can remove one.',
  },
  {
    table: 'org_wellbeing_switches', owner: 't.user_id', key: 'user_id', keyIsOwner: true, owners: ['org_client'],
    handTo: ({ other }) => `user_id = ${other}`,
    make: ({ owner }) => `insert into public.org_wellbeing_switches (user_id, organisation_id, is_on) values (${owner}, current_setting('rules.org')::uuid, true) on conflict (user_id, organisation_id) do nothing`,
    makeForCheck: ({ owner }) => `insert into public.org_wellbeing_switches (user_id, organisation_id, is_on) values (${owner}, current_setting('rules.org2')::uuid, false)`,
    change: 'is_on = t.is_on',
    access: { remove: NOBODY }, note: 'One switch per organisation the person is in (033). Turned off, never removed.',
  },
  {
    table: 'pulse_saved_questions', owner: 't.boss_id', owners: OWNERS, handTo: ({ other }) => `boss_id = ${other}`,
    make: ({ owner, id: k }) => `insert into public.pulse_saved_questions (id, boss_id, kind, text) values (${k}, ${owner}, 'rating', 'Rules test')`,
    change: 'text = t.text',
  },
  {
    table: 'pulse_settings', owner: 't.boss_id', key: 'boss_id', keyIsOwner: true, owners: OWNERS, handTo: ({ other }) => `boss_id = ${other}`,
    make: ({ owner }) => `insert into public.pulse_settings (boss_id) values (${owner}) on conflict (boss_id) do nothing`,
    makeForCheck: ({ owner }) => `insert into public.pulse_settings (boss_id) values (${owner})`,
    change: 'rhythm_days = t.rhythm_days',
  },
];

export const PHASE1_LOCKED_TABLES = [
  {
    table: 'feedback_requests',
    make: ({ id: k, n }) => `insert into public.feedback_requests (id, asker_id, tool_key, question_set_id, token_hash) values (${k}, ${id('client')}, 'before_after_impact', (select id from public.feedback_question_sets where tool_key = 'before_after_impact' limit 1), encode(extensions.digest('rules-locked-' || ${n}, 'sha256'), 'hex'))`,
    change: 'max_answers = t.max_answers',
  },
  {
    table: 'feedback_answers',
    make: ({ id: k }) => `insert into public.feedback_answers (id, request_id, answers) values (${k}, (select id from public.feedback_requests order by created_at limit 1), '{}')`,
    change: 'answers = t.answers',
  },
];

// ---------------------------------------------------------------- functions
const R = "'00000000-0000-0000-0000-000000000001'::uuid"; // matches nothing
const fn = (sig, call, access, note) => ({ sig, call: `select ${call}`, access, note });
export const PHASE1_FUNCTIONS = [
  // the checked helper and who-is-who: anyone signed in, for themselves
  ...['is_owner()', 'is_coach()', 'my_leader_team_ids()', 'my_coach()', 'sharing_parts()', 'my_coach_notes()', 'sponsor_people()', 'my_org_wellbeing_switches()']
    .map((s) => fn(s, `count(*) from public.${s}`, SIGNED_IN, 'Answers only for the person signed in.')),
  ...['is_coach_of(uuid)', 'is_org_admin(uuid)', 'in_my_leader_scope(uuid)', 'is_sponsor_of(uuid)', 'can_manage_org(uuid)',
      'org_of_member(uuid)', 'org_of_team(uuid)', 'in_org(uuid)', 'leads_in_org(uuid)', 'membership_confirm(uuid)', 'org_wellbeing(uuid)']
    .map((s) => fn(s, `count(*) from public.${s.replace('(uuid)', `(${R})`)}`, SIGNED_IN, 'Answers only for the person signed in.')),
  fn('may_see(uuid,text,boolean)', `public.may_see(${R}, 'mission', null)`, SIGNED_IN, 'The checked helper: for the person signed in.'),
  fn('sharing_is_on(uuid,text)', `public.sharing_is_on(${R}, 'mission')`, NOBODY, 'Would tell anyone whether someone\'s switch is on: for the rules only.'),
  fn('why_this_works(text)', "public.why_this_works('journal')", SIGNED_IN),
  fn('feedback_my_requests(text,integer,integer)', 'count(*) from public.feedback_my_requests()', SIGNED_IN),
  fn('leader_people(uuid,integer,integer)', 'count(*) from public.leader_people()', SIGNED_IN),
  fn('person_summaries(uuid,integer,integer)', `count(*) from public.person_summaries(${R})`, SIGNED_IN),
  fn('impact_results(uuid)', 'public.impact_results(auth.uid())', SIGNED_IN, 'The person\'s own.'),
  fn('feedback_request_create(text,uuid,integer,boolean,integer,timestamptz,text)', "count(*) from public.feedback_request_create('before_after_impact', null)", SIGNED_IN),
  fn('pulse_send_create(text,integer,timestamptz,timestamptz,jsonb)', "count(*) from public.pulse_send_create('short', 3, now(), now() + interval '7 days')", SIGNED_IN),
  // the outside pages
  fn('invite_open(text)', "count(*) from public.invite_open('nothing')", ANYONE, 'The Create my account page: the link is checked inside.'),
  fn('feedback_open(text)', "public.feedback_open('nothing')", ANYONE, 'Feedback givers have no account: the link is checked inside.'),
  fn('feedback_send(text,jsonb,text,boolean)', "public.feedback_send('nothing', '{}')", ANYONE, 'Feedback givers have no account: the link is checked inside.'),
  // role-checked: refused unless the person may
  fn('membership_end(uuid,date)', "public.membership_end(current_setting('rules.m_org_client')::uuid)", ONLY('org_admin', 'owner_coach'), 'The organisation\'s admin and the owner.'),
  fn('org_figures(uuid)', 'public.org_figures()', ONLY('leader_parent', 'leader_child'), 'Leaders only.'),
  fn('coach_client_list(uuid,text,uuid,integer,integer)', 'count(*) from public.coach_client_list()', ONLY('owner_coach', 'second_coach'), 'Coaches only.'),
  ...[
    ['sponsor_confirm_objective(uuid)', `sponsor_confirm_objective(${R})`],
    ['sponsor_propose_objective_change(uuid,jsonb,text)', `sponsor_propose_objective_change(${R}, '{"target_value": 1}')`],
    ['objective_proposal_decide(uuid,boolean)', `objective_proposal_decide(${R}, true)`],
    ['coach_flag_decide(uuid,text,text)', `coach_flag_decide(${R}, 'draft')`],
    ['coach_hide_pattern(uuid,boolean)', `coach_hide_pattern(${R}, true)`],
    ['feedback_request_answers(uuid)', `feedback_request_answers(${R})`],
    ['feedback_request_switch_off(uuid)', `feedback_request_switch_off(${R})`],
    ['feedback_request_extend(uuid,integer)', `feedback_request_extend(${R}, 1)`],
    ['freeze_week(uuid,integer)', `freeze_week(${R}, 1)`],
    ['make_sprint_summary(uuid)', `make_sprint_summary(${R})`],
    ['pulse_results(uuid)', `pulse_results(${R})`],
  ].map(([sig, call]) => fn(sig, `public.${call}`, NOBODY, 'Refused unless it is the person\'s own (none here).')),
  // the pure score functions: anyone signed in
  ...['score_round(numeric)', 'score_m15_reading(integer,integer,integer,integer)']
    .map((s) => fn(s, s.startsWith('score_round') ? 'public.score_round(1.5)' : 'public.score_m15_reading(3, 3, 3, 3)', SIGNED_IN)),
  fn('score_week_raw(jsonb)', `public.score_week_raw('{"week": {"days": []}}')`, SIGNED_IN),
  fn('score_m13_checkin(jsonb)', "public.score_m13_checkin('{}')", SIGNED_IN),
  fn('score_m18_shown(boolean,integer,integer)', 'public.score_m18_shown(true, 3, 0)', SIGNED_IN),
  fn('pulse_request_closed(uuid)', `public.pulse_request_closed(${R})`, NOBODY, 'Inside part of the pulse functions.'),
  fn('my_fixed_standard()', 'public.my_fixed_standard()', SIGNED_IN, 'The person\'s own: 85 in an organisation seat.'),
  fn('fixed_standard_for(uuid)', `public.fixed_standard_for(${R})`, NOBODY, 'Would tell anyone who has a seat: for the rules only.'),
  fn('org_wellbeing_move_old_switches()', 'public.org_wellbeing_move_old_switches()', NOBODY, 'Run once by migration 033.'),
  fn('score_m18_figure_shown(integer,integer)', 'public.score_m18_figure_shown(3, 0)', SIGNED_IN),
  fn('pulse_figures(uuid)', `public.pulse_figures(${R})`, NOBODY, 'Inside part of the pulse functions.'),
  fn('wellbeing_visible(uuid,uuid)', `public.wellbeing_visible(${R}, ${R})`, NOBODY, 'Inside part of may_see and org_wellbeing_in.'),
  fn('org_wellbeing_in(uuid,uuid)', `count(*) from public.org_wellbeing_in(${R}, ${R})`, SIGNED_IN),
  fn('pulse_shown(uuid)', `public.pulse_shown(${R})`, NOBODY, 'Inside part of the pulse functions.'),
  // inside parts and triggers: nobody calls them directly
  ...['p1_touch()', 'p1_same_owner()', 'sharing_switch_check()', 'sharing_switch_log()', 'teams_check()', 'team_members_check()',
      'reporting_lines_check()', 'organisation_members_check()', 'outcome_objectives_check()', 'todos_record_move()', 'wins_to_evidence()',
      'day_plan_limits()', 'day_plans_odd_sleep()', 'checkins_score()', 'checkins_flag()', 'impact_raters_check()',
      'org_wellbeing_switch_check()', 'org_wellbeing_switch_log()', 'sprints_seat_standard()', 'organisation_members_seat_standard()',
      'organisation_members_wellbeing_off()', 'teams_keep_organisation()']
    .map((s) => fn(s, `public.${s}`, NOBODY, 'Runs only as a trigger.')),
  fn('sponsor_may_act_on(uuid)', `public.sponsor_may_act_on(${R})`, NOBODY, 'Inside part of the sponsor functions.'),
  fn('feedback_open_request(text,boolean)', "public.feedback_open_request('x', false)", NOBODY, 'Inside part of the feedback functions.'),
  fn('week_input(uuid,integer,date,boolean)', `public.week_input(${R}, 1, current_date)`, NOBODY, 'Reads the tables: for the checked functions only.'),
  fn('sprint_calendar(uuid,date)', `public.sprint_calendar(${R}, current_date)`, NOBODY, 'Reads the tables: for the checked functions only.'),
  fn('person_today(uuid)', `public.person_today(${R})`, NOBODY, 'Reads a person\'s time zone: for the checked functions only.'),
  fn('objective_input(uuid)', `public.objective_input(${R})`, NOBODY, 'Reads the tables: for the checked functions only.'),
  fn('impact_result_for(uuid)', `public.impact_result_for(${R})`, NOBODY, 'Reads the tables: for the checked functions only.'),
];
// ---------------------------------------------------------------- scenarios
// Several steps, each as one person; the last step's value is compared
// with `expect` ("error 42501" matches any refusal). {person} is that
// person's id.
const s = (name, steps, expect) => ({ name, steps: steps.map(([as, sql]) => ({ as, sql })), expect });
const n = (sql) => `select (${sql})::text`;
// Wellbeing for one organisation ('org' or 'org2'), as the person signed in.
const WB = (org, on) => `insert into public.org_wellbeing_switches (user_id, organisation_id, is_on) values (auth.uid(), current_setting('rules.${org}')::uuid, ${on}) on conflict (user_id, organisation_id) do update set is_on = excluded.is_on returning 'switched'`;
const SWITCH = (who, part, on) => `insert into public.sharing_switches (user_id, part, is_on) values ({${who}}, '${part}', ${on}) on conflict (user_id, part) do update set is_on = excluded.is_on returning 'switched'`;

export const SCENARIOS = [
  // a coach and the parts their clients share
  s('A coach sees their client\'s mission while it is shared', [['owner_coach', n('select count(*) from public.performance_plans where user_id = {client}')]], '1'),
  s('Switching the mission off hides it, past included', [['client', SWITCH('client', 'mission', false)], ['owner_coach', n('select count(*) from public.performance_plans where user_id = {client}')]], '0'),
  s('A coach sees objectives and week scores while Progress is shared', [['second_coach', n('select (select count(*) from public.outcome_objectives where user_id = {org_client}) + (select count(*) from public.week_scores where user_id = {org_client})')]], '2'),
  s('Switching Progress off hides objectives and past week scores', [['org_client', SWITCH('org_client', 'progress', false)], ['second_coach', n('select (select count(*) from public.outcome_objectives where user_id = {org_client}) + (select count(*) from public.week_scores where user_id = {org_client})')]], '0'),
  s('Switching it on again shows them again', [['org_client', SWITCH('org_client', 'progress', false)], ['org_client', SWITCH('org_client', 'progress', true)], ['second_coach', n('select count(*) from public.outcome_objectives where user_id = {org_client}')]], '1'),
  s('The check-in switched off: the coach sees no check-ins', [['second_coach', n('select count(*) from public.checkins where user_id = {org_client}')]], '0'),
  s('Nobody sees anything of someone without a coach', [['owner_coach', n('select public.may_see({no_coach}, \'mission\')')]], 'false'),
  // the owner, and other coaches' clients
  s('The owner sees another coach\'s client\'s admin fields', [['owner_coach', n('select count(*) from public.coach_client_list() where client_id = {org_client} and email is not null')]], '1'),
  s('... but not their personal content (mission, scores)', [['owner_coach', n('select (mission is null and latest_week_score is null) from public.coach_client_list() where client_id = {org_client}')]], 'true'),
  s('... and none of their tables', [['owner_coach', n('select (select count(*) from public.performance_plans where user_id = {org_client}) + (select count(*) from public.outcome_objectives where user_id = {org_client})')]], '0'),
  s('The owner sees their own client\'s mission in the list', [['owner_coach', n('select (mission is not null) from public.coach_client_list() where client_id = {client}')]], 'true'),
  s('The owner filters by coach', [['owner_coach', n('select count(*) from public.coach_client_list((select id from public.coaches where user_id = {second_coach}))')]], '1'),
  s('A coach lists only their own clients', [['second_coach', n('select count(*) from public.coach_client_list()')]], '1'),
  s('... and can\'t ask for another coach\'s', [['second_coach', n("select count(*) from public.coach_client_list(current_setting('rules.owner_coach_c')::uuid)")]], 'error 42501'),
  s('A client gets no client list', [['client', n('select count(*) from public.coach_client_list()')]], 'error 42501'),
  // the sponsor
  s('The sponsor lists their current seat only (not the leaver)', [['sponsor', n('select count(*) from public.sponsor_people()')]], '1'),
  s('The sponsor reads the seat\'s frozen summary, and none made in another organisation', [['sponsor', n('select count(*) from public.person_summaries({org_client})')]], '1'),
  s('The person reads their summaries from both organisations', [['org_client', n('select count(*) from public.person_summaries({org_client})')]], '2'),
  s('An admin can\'t name themselves a sponsor', [['org_admin', `with x as (insert into public.seat_sponsors (member_id, sponsor_user_id) values (current_setting('rules.m_org_client')::uuid, {org_admin}) returning 1) select count(*)::text from x`]], 'error 42501'),
  s('... or give themselves a team to lead', [['org_admin', `with x as (insert into public.leader_teams (user_id, team_id) values ({org_admin}, current_setting('rules.team_c1')::uuid) returning 1) select count(*)::text from x`]], 'error 42501'),
  s('... but can name someone else a sponsor', [['org_admin', `with x as (insert into public.seat_sponsors (member_id, sponsor_user_id) values (current_setting('rules.m_org_client')::uuid, {leader_child}) returning 1) select count(*)::text from x`]], '1'),
  s('... and nothing but objectives and Strategies in it', [['sponsor', n("select string_agg(distinct k, ',' order by k) from public.person_summaries({org_client}) p, jsonb_object_keys(p.summary) k")]], 'objectives,strategies'),
  s('The sponsor never reads a habit, log, to-do, day plan, review, journal, check-in or debrief', [['sponsor', n(`select (select count(*) from public.habits) + (select count(*) from public.habit_logs) + (select count(*) from public.todos)
      + (select count(*) from public.day_plans) + (select count(*) from public.day_reviews) + (select count(*) from public.daily_journals)
      + (select count(*) from public.journal_entries) + (select count(*) from public.checkins) + (select count(*) from public.weekly_debriefs)
      + (select count(*) from public.decisions) + (select count(*) from public.week_scores)`)]], '0'),
  s('Shared wellbeing reaches the sponsor, named: scores and areas', [['sponsor', n('select count(*) from public.org_wellbeing({org_client}) where hardware_score is not null')]], '1'),
  s('... switched off, past months are hidden too', [['org_client', WB('org', false)], ['sponsor', n('select count(*) from public.org_wellbeing({org_client})')]], '0'),
  s('Someone who isn\'t a member: no wellbeing', [['sponsor', n('select count(*) from public.org_wellbeing({client})')]], '0'),
  // wellbeing, chosen per organisation (methods M19.4; Tim, 27 Oct, 14:20)
  s('Jordan, in two organisations, shares wellbeing with the first only: the second\'s sponsor sees none', [['sponsor_two', n('select count(*) from public.org_wellbeing({org_client})')]], '0'),
  s('... switched on for the second, its sponsor sees it', [['org_client', WB('org2', true)], ['sponsor_two', n('select count(*) from public.org_wellbeing({org_client})')]], '1'),
  s('... switched off for the first, the first sees nothing, past months too', [['org_client', WB('org2', true)], ['org_client', WB('org', false)], ['sponsor', n('select count(*) from public.org_wellbeing({org_client})')]], '0'),
  s('... while the second still does', [['org_client', WB('org2', true)], ['org_client', WB('org', false)], ['sponsor_two', n('select count(*) from public.org_wellbeing({org_client})')]], '1'),
  s('... and the second\'s sponsor never reads the first organisation\'s summary', [['sponsor_two', n("select count(*) from public.person_summaries({org_client}) p where p.sprint_number = 900")]], '0'),
  s('The first organisation\'s pages show what was shared with it', [['sponsor', n("select count(*) from public.org_wellbeing_in({org_client}, current_setting('rules.org')::uuid)")]], '1'),
  s('... and nothing through another organisation', [['sponsor', n("select count(*) from public.org_wellbeing_in({org_client}, current_setting('rules.org2')::uuid)")]], '0'),
  s('Leaving switches that organisation\'s wellbeing off', [['leaver', n("select string_agg(is_on::text, ',') from public.org_wellbeing_switches")]], 'false'),
  s('Jordan lists both organisations with their switches', [['org_client', n("select string_agg(is_on::text, ',' order by organisation_name) from public.my_org_wellbeing_switches()")]], 'true,false'),
  s('Nobody can switch it on for an organisation they aren\'t in', [['no_coach', `with x as (insert into public.org_wellbeing_switches (user_id, organisation_id, is_on) values ({no_coach}, current_setting('rules.org')::uuid, true) returning 1) select count(*)::text from x`]], 'error 42501'),
  s('... or for someone else', [['sponsor', `with x as (insert into public.org_wellbeing_switches (user_id, organisation_id, is_on) values ({org_client}, current_setting('rules.org2')::uuid, true) returning 1) select count(*)::text from x`]], 'error 42501'),
  s('The single wellbeing switch is refused, with a clear message', [['org_client', SWITCH('org_client', 'org_wellbeing', true)]], 'error 22023'),
  // the fixed standard for organisation seats (methods M7; Tim, 26 Oct, 23:49)
  s('An organisation seat\'s new sprint is 85, whatever is asked', [['org_client', `with x as (insert into public.sprints (user_id, plan_id, number, start_on, status, standard) values ({org_client}, (select id from public.performance_plans where user_id = {org_client} limit 1), 950, current_date, 'finished', 70) returning standard) select standard::text from x`]], '85'),
  s('... and changing a sprint\'s standard is set back to 85', [['org_client', "with x as (update public.sprints set standard = 60 where user_id = {org_client} and number = 900 returning standard) select standard::text from x"]], '85'),
  s('... and the screens learn it is fixed', [['org_client', n('select public.my_fixed_standard()')]], '85'),
  s('Someone who pays for themselves chooses their own', [['client', `with x as (insert into public.sprints (user_id, plan_id, number, start_on, status, standard) values ({client}, (select id from public.performance_plans where user_id = {client} limit 1), 950, current_date, 'finished', 70) returning standard) select standard::text from x`]], '70'),
  s('... with no fixed standard', [['client', n('select public.my_fixed_standard()')]], 'null'),
  s('Someone who has left keeps 85', [['leaver', n('select standard from public.sprints where user_id = {leaver} and number = 900')]], '85'),
  s('... until they change it themselves', [['leaver', "with x as (update public.sprints set standard = 75 where user_id = {leaver} and number = 900 returning standard) select standard::text from x"]], '75'),
  s('Nobody can ask whether someone else has a seat', [['client', n('select public.fixed_standard_for({org_client})')]], 'error 42501'),
  // leaders
  s('A leader over the parent team sees the people below', [['leader_parent', n('select count(*) from public.leader_people()')]], '1'),
  s('... their summaries', [['leader_parent', n('select count(*) from public.person_summaries({org_client})')]], '1'),
  s('... and shared wellbeing', [['leader_parent', n('select count(*) from public.org_wellbeing({org_client})')]], '1'),
  s('A leader over the other child team sees no one in child team one', [['leader_child', n('select count(*) from public.leader_people()')]], '0'),
  s('... no summary', [['leader_child', n('select count(*) from public.person_summaries({org_client})')]], '0'),
  s('... no wellbeing', [['leader_child', n('select count(*) from public.org_wellbeing({org_client})')]], '0'),
  s('... and can\'t ask for figures for child team one', [['leader_child', n("select public.org_figures(current_setting('rules.team_c1')::uuid)")]], 'error 42501'),
  s('Use figures never show for a group under 3 seats', [['leader_parent', n("select jsonb_typeof(public.org_figures() -> 'use')")]], 'null'),
  s('... nor the share at their own standard', [['leader_parent', n("select jsonb_typeof(public.org_figures() -> 'behaviour' -> 'atOwnStandard')")]], 'null'),
  s('Objective and Strategy figures show at any size', [['leader_parent', n("select public.org_figures() -> 'headline' ->> 'counted'")]], '2'),
  s('Check-ins never reach the organisation\'s figures', [['leader_parent', n("select (public.org_figures()::text like '%hardware%')")]], 'false'),
  // the organisation admin
  s('The admin sees the current members only', [['org_admin', n("select count(*) from public.organisation_members where organisation_id = current_setting('rules.org')::uuid")]], '1'),
  s('The admin reads no summary', [['org_admin', n('select count(*) from public.person_summaries({org_client})')]], '0'),
  s('... no wellbeing', [['org_admin', n('select count(*) from public.org_wellbeing({org_client})')]], '0'),
  s('... no figures', [['org_admin', n('select public.org_figures()')]], 'error 42501'),
  s('... and no personal data', [['org_admin', n(`select (select count(*) from public.performance_plans) + (select count(*) from public.outcome_objectives) + (select count(*) from public.checkins)
      + (select count(*) from public.person_settings) + (select count(*) from public.sprint_summaries)`)]], '0'),
  // the leaver
  s('Nothing named about the leaver: no summary to the sponsor', [['sponsor', n('select count(*) from public.person_summaries({leaver})')]], '0'),
  s('... nor to the leader', [['leader_parent', n('select count(*) from public.person_summaries({leaver})')]], '0'),
  s('... no wellbeing, though they shared it', [['leader_parent', n('select count(*) from public.org_wellbeing({leaver})')]], '0'),
  s('... no membership to the admin', [['org_admin', n('select count(*) from public.organisation_members where user_id = {leaver}')]], '0'),
  s('... no sponsor link to the admin', [['org_admin', n("select count(*) from public.seat_sponsors where member_id not in (select id from public.organisation_members where ended_on is null)")]], '0'),
  s('... but their figures still count in the totals', [['leader_parent', n("select public.org_figures() ->> 'peopleCounted'")]], '2'),
  s('The leaver still sees their own past membership', [['leaver', n('select count(*) from public.organisation_members')]], '1'),
  s('... and no longer reads the organisation', [['leaver', n("select count(*) from public.organisations where id = current_setting('rules.org')::uuid")]], '0'),
  s('The owner sees the past membership', [['owner_coach', n('select count(*) from public.organisation_members where user_id = {leaver}')]], '1'),
  // feedback givers, with no account
  s('A feedback giver opens their link', [['signed_out', n(`select public.feedback_open(repeat('a', 64)) ->> 'status'`)]], 'open'),
  s('... an expired link won\'t open', [['signed_out', n(`select public.feedback_open(repeat('b', 64)) ->> 'status'`)]], 'closed'),
  s('... nor a switched-off one', [['signed_out', n(`select public.feedback_open(repeat('c', 64)) ->> 'status'`)]], 'closed'),
  s('... nor a full one', [['signed_out', n(`select public.feedback_send(repeat('d', 64), '{}')`)]], 'closed'),
  s('... and a link takes only as many answers as it was sent for', [['signed_out', n(`select public.feedback_send(repeat('a', 64), '{}')`)], ['signed_out', n(`select public.feedback_send(repeat('a', 64), '{}')`)], ['signed_out', n(`select public.feedback_send(repeat('a', 64), '{}')`)]], 'closed'),
  s('A giver can read nothing back', [['signed_out', n('select count(*) from public.feedback_answers')]], 'error 42501'),
  s('The asker reads the answers to their own request', [['client', n("select count(*) from public.feedback_request_answers(current_setting('rules.req_full')::uuid)")]], '1'),
  s('... nobody else can', [['org_client', n("select count(*) from public.feedback_request_answers(current_setting('rules.req_full')::uuid)")]], 'error 42501'),
  // the team pulse (methods M18; Tim, 27 Oct, 14:20); Sam's open pulse's link is repeat('e', 64)
  s('A boss can\'t read a pulse before it closes', [['client', n("select public.pulse_results(current_setting('rules.pulse_open')::uuid) ->> 'shown'")]], 'false'),
  s('... no totals, own questions or comments', [['client', n("select (r ? 'measures' or r ? 'own' or r ? 'comments' or r ? 'nextStep') from public.pulse_results(current_setting('rules.pulse_open')::uuid) r")]], 'false'),
  s('... not even how many have answered', [['client', n("select coalesce(answers::text, 'hidden') from public.feedback_my_requests() where id = current_setting('rules.pulse_req_open')::uuid")]], 'hidden'),
  s('... but a named answer shows as it comes in', [['client', n("select jsonb_array_length(public.pulse_results(current_setting('rules.pulse_open')::uuid) -> 'named')")]], '1'),
  s('... its answers never come one by one', [['client', n("select count(*) from public.feedback_request_answers(current_setting('rules.pulse_req_open')::uuid)")]], 'error 42501'),
  s('... and it can\'t be kept open longer', [['client', n("select public.feedback_request_extend(current_setting('rules.pulse_req_open')::uuid, 7)")]], 'error 22023'),
  s('Closed with 2 answers: the boss sees only how many answered', [['client', n("select (r ->> 'shown') || ' ' || (r ->> 'answers') || ' ' || (r ? 'measures' or r ? 'comments' or r ? 'own') from public.pulse_results(current_setting('rules.pulse_two')::uuid) r")]], 'false 2 false'),
  s('... and can\'t reopen it to collect a third', [['client', n("select public.feedback_request_extend(current_setting('rules.pulse_req_two')::uuid, 1)")]], 'error 22023'),
  s('Closed with 3 answers: the results show, the stress question named Calm', [['client', n("select (r ->> 'shown') || ' ' || (r -> 'measures' -> 'stress' ->> 'name') from public.pulse_results(current_setting('rules.pulse_three')::uuid) r")]], 'true Calm'),
  s('Nobody but the boss reads a pulse', [['org_client', n("select public.pulse_results(current_setting('rules.pulse_three')::uuid)")]], 'error 42501'),
  s('A boss can\'t answer their own pulse', [['client', n("select public.feedback_send(repeat('e', 64), '{}')")]], 'error 42501'),
  s('... but their team can', [['signed_out', n("select public.feedback_send(repeat('e', 64), '{}')")]], 'sent'),
  s('A pulse is made only through pulse_send_create', [['client', n("select count(*) from public.feedback_request_create('team_pulse', null, 500, false, 365)")]], 'error 22023'),
  s('A pulse can\'t stay open longer than 7 days', [['client', n("select count(*) from public.pulse_send_create('short', 5, now(), now() + interval '8 days')")]], 'error 22023'),
  // the organisation's own records
  s('Someone outside the organisation can\'t read it', [['no_coach', n("select count(*) from public.organisations where id = current_setting('rules.org')::uuid")]], '0'),
  s('A member reads their organisation', [['org_client', n("select count(*) from public.organisations where id = current_setting('rules.org')::uuid")]], '1'),
  s('The admin can\'t see the price', [['org_admin', n('select count(*) from public.organisation_billing')]], '0'),
  s('A client can\'t read the coaches table', [['client', n('select count(*) from public.coaches')]], '0'),
  s('A coach can\'t take someone as a client', [['second_coach', `with x as (insert into public.coach_clients (client_id, coach_id) values ({no_coach}, (select id from public.coaches where user_id = {second_coach})) returning 1) select count(*)::text from x`]], 'error 42501'),
  s('A coach can\'t make themselves owner', [['second_coach', `with x as (update public.coaches set role = 'owner' where user_id = {second_coach} returning 1) select count(*)::text from x`]], '0'),
  // the evidence library
  s('A client can\'t read the evidence library', [['client', n('select count(*) from public.evidence_claims')]], '0'),
  s('... but reads a tool\'s Why this works', [['client', n("select public.why_this_works('breathe') ->> 'tool'")]], 'Breathe'),
  s('A coach reads the library', [['second_coach', n('select count(*) from public.evidence_claims')]], '46'),
];
