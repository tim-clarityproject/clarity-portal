-- =============================================================================
-- 030_organisations_feedback_pulse_test.sql
-- Checks 030_organisations_feedback_pulse.sql. RUN ORDER: 026 to 030, then this.
--
-- WHAT IT DOES
--   Makes invented people (someone asking for feedback, givers with no
--   account, a boss sending a pulse, an organisation with nested teams, a
--   member and a member who leaves, their sponsor, leaders inside and
--   outside their teams, an admin and the owner) and checks feedback links,
--   the pulse and what each organisation role can reach. Everything it
--   makes is undone at the end.
--
--   It ends with the notice ALL CHECKS PASSED, or stops with FAILED and a
--   list naming each check that failed.
-- =============================================================================

-- ---------------------------------------------------------------- helpers
-- Temporary (this session only). t_as acts as a signed-in person, as
-- Supabase does for the app; t_anon as someone signed out; t_admin goes
-- back to the admin role. t_n runs a query and returns its first value as
-- text, t_rows runs a change and returns how many rows it changed; both
-- return 'error <code>' instead of stopping (42501 means refused).
create or replace function pg_temp.t_as(p uuid) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $f$;
create or replace function pg_temp.t_anon() returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('role', 'anon', true);
end $f$;
create or replace function pg_temp.t_admin() returns void language plpgsql as $f$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
end $f$;
create or replace function pg_temp.t_user(p_label text) returns uuid language plpgsql as $f$
declare u uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, aud, role)
  values (u, 'p1-test-' || p_label || '-' || u || '@example.invalid', 'authenticated', 'authenticated');
  update public.profiles set first_name = initcap(p_label), last_name = 'Test' where id = u;
  return u;
end $f$;
create or replace function pg_temp.t_n(p_sql text) returns text language plpgsql as $f$
declare v text;
begin
  execute p_sql into v;
  return coalesce(v, 'null');
exception when others then
  return 'error ' || sqlstate;
end $f$;
create or replace function pg_temp.t_rows(p_sql text) returns text language plpgsql as $f$
declare n bigint;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n::text;
exception when others then
  return 'error ' || sqlstate;
end $f$;
create or replace function pg_temp.t_eq(p_name text, p_got text, p_want text) returns text[] language sql as $f$
  select case when p_got is distinct from p_want
              then array[format('%s: expected %s, got %s', p_name, p_want, coalesce(p_got, 'nothing'))]
              else '{}'::text[] end;
$f$;

-- ---------------------------------------------------------------- the checks
do $t$
declare
  f text[] := '{}';
  owner_u uuid; asker uuid; other uuid; boss uuid; member_u uuid; leaver_u uuid; sponsor_u uuid;
  lead_parent uuid; lead_other uuid; admin_u uuid;
  owner_c uuid; org1 uuid; t_parent uuid; t_child uuid; t_other uuid; m_mem uuid; m_lea uuid;
  req uuid; tok text; req2 uuid; tok2 uuid; tok3 text; req3 uuid; pulse_tok text; pulse_send uuid; plan_m uuid; plan_l uuid; spr_m uuid; spr_l uuid;
  r record;
begin
  begin
    owner_u := pg_temp.t_user('owner'); asker := pg_temp.t_user('asker'); other := pg_temp.t_user('other'); boss := pg_temp.t_user('boss');
    member_u := pg_temp.t_user('member'); leaver_u := pg_temp.t_user('leaver'); sponsor_u := pg_temp.t_user('sponsor');
    lead_parent := pg_temp.t_user('leadparent'); lead_other := pg_temp.t_user('leadother'); admin_u := pg_temp.t_user('admin');
    insert into public.coaches (user_id, role, display_first_name) values (owner_u, 'owner', 'Owner') returning id into owner_c;
    insert into public.organisations (name) values ('Invented Org') returning id into org1;
    insert into public.teams (organisation_id, name) values (org1, 'Parent') returning id into t_parent;
    insert into public.teams (organisation_id, name, parent_team_id) values (org1, 'Child', t_parent) returning id into t_child;
    insert into public.teams (organisation_id, name) values (org1, 'Other') returning id into t_other;
    insert into public.organisation_admins (organisation_id, user_id) values (org1, admin_u);
    insert into public.organisation_members (organisation_id, user_id) values (org1, member_u) returning id into m_mem;
    insert into public.organisation_members (organisation_id, user_id) values (org1, leaver_u) returning id into m_lea;
    insert into public.team_members (member_id, team_id) values (m_mem, t_child), (m_lea, t_child);
    insert into public.seat_sponsors (member_id, sponsor_user_id) values (m_mem, sponsor_u), (m_lea, sponsor_u);
    insert into public.leader_teams (user_id, team_id) values (lead_parent, t_parent), (lead_other, t_other);
    perform pg_temp.t_as(member_u); perform public.membership_confirm(m_mem);
    perform pg_temp.t_as(leaver_u); perform public.membership_confirm(m_lea);
    perform pg_temp.t_admin();
    insert into public.performance_plans (user_id) values (member_u) returning id into plan_m;
    insert into public.performance_plans (user_id) values (leaver_u) returning id into plan_l;
    insert into public.sprints (user_id, plan_id, number, start_on, status) values (member_u, plan_m, 1, date '2026-07-01', 'finished') returning id into spr_m;
    insert into public.sprints (user_id, plan_id, number, start_on, status) values (leaver_u, plan_l, 1, date '2026-07-01', 'finished') returning id into spr_l;
    insert into public.sprint_summaries (user_id, sprint_id, member_id, organisation_id, team_ids, sprint_number, sprint_start, sprint_end, summary, methods_version)
      values (member_u, spr_m, m_mem, org1, array[t_child], 1, date '2026-07-01', date '2026-09-22', '{"objectives": [], "strategies": []}', '1.1'),
             (leaver_u, spr_l, m_lea, org1, array[t_child], 1, date '2026-07-01', date '2026-09-22', '{"objectives": [], "strategies": []}', '1.1');
    insert into public.checkins (user_id, month, answers, status) values (member_u, date '2026-10-01', '{"H3": "often", "S1": "often"}', 'finished');

    -- ------------------------------------------------ 1. a feedback link
    perform pg_temp.t_as(asker);
    select * into r from public.feedback_request_create('before_after_impact', null, 2);
    req := r.request_id; tok := r.token;
    f := f || pg_temp.t_eq('1a the link is 32 random bytes', length(tok)::text, '64');
    f := f || pg_temp.t_eq('1b only its hash is kept', pg_temp.t_n(format('select count(*) from public.feedback_requests where token_hash = %L', tok)), 'error 42501');
    perform pg_temp.t_admin();
    f := f || pg_temp.t_eq('1c ... never the link itself', pg_temp.t_n(format('select count(*) from public.feedback_requests where token_hash = %L', tok)), '0');
    perform pg_temp.t_anon();
    f := f || pg_temp.t_eq('1d someone with the link opens it: the questions and the asker''s first name', pg_temp.t_n(format('select (j ->> ''status'') || '' '' || (j ->> ''asker_first_name'') || '' '' || jsonb_array_length(j -> ''questions'') from public.feedback_open(%L) j', tok)), 'open Asker 2');
    f := f || pg_temp.t_eq('1e ... and nothing else of the asker', pg_temp.t_n(format('select count(*) from jsonb_object_keys(public.feedback_open(%L)) k where k not in (''status'', ''tool'', ''asker_first_name'', ''subject_first_name'', ''questions'', ''own_questions'', ''small_group'')', tok)), '0');
    f := f || pg_temp.t_eq('1f a giver sends answers, with no account', pg_temp.t_n(format('select public.feedback_send(%L, ''{"often": {"b1": "often"}}'', ''Robin'', true)', tok)), 'sent');
    f := f || pg_temp.t_eq('1g a second giver, without a name', pg_temp.t_n(format('select public.feedback_send(%L, ''{"often": {"b1": "sometimes"}}'', ''Kit'', false)', tok)), 'sent');
    f := f || pg_temp.t_eq('1h full: refused', pg_temp.t_n(format('select public.feedback_send(%L, ''{}'')', tok)), 'closed');
    f := f || pg_temp.t_eq('1i full: won''t open', pg_temp.t_n(format('select public.feedback_open(%L) ->> ''status''', tok)), 'closed');
    f := f || pg_temp.t_eq('1j a guessed link gets the same answer', pg_temp.t_n(format('select public.feedback_open(%L) ->> ''status''', repeat('a', 64))), 'closed');
    f := f || pg_temp.t_eq('1k a malformed link too', pg_temp.t_n('select public.feedback_open(''x'') ->> ''status'''), 'closed');
    f := f || pg_temp.t_eq('1l signed out can''t read the tables', pg_temp.t_n('select count(*) from public.feedback_answers'), 'error 42501');
    f := f || pg_temp.t_eq('1m signed out can''t make a request', pg_temp.t_n('select count(*) from public.feedback_request_create(''before_after_impact'', null)'), 'error 42501');
    perform pg_temp.t_as(asker);
    f := f || pg_temp.t_eq('1n the asker can''t read the tables directly either', pg_temp.t_n('select count(*) from public.feedback_answers'), 'error 42501');
    f := f || pg_temp.t_eq('1o the asker reads their answers; a name only where added', pg_temp.t_n(format('select string_agg(coalesce(giver_name, ''(no name)''), '','' order by created_at) from public.feedback_request_answers(%L)', req)), 'Robin,(no name)');
    f := f || pg_temp.t_eq('1p the asker lists their requests with counts', pg_temp.t_n('select answers from public.feedback_my_requests()'), '2');
    f := f || pg_temp.t_eq('1q answers are never linked to an account', pg_temp.t_n($q$select count(*) from pg_constraint where conrelid = 'public.feedback_answers'::regclass and confrelid = 'auth.users'::regclass$q$), '0');
    perform pg_temp.t_as(other);
    f := f || pg_temp.t_eq('1r someone else can''t read them', pg_temp.t_n(format('select count(*) from public.feedback_request_answers(%L)', req)), 'error 42501');
    f := f || pg_temp.t_eq('1s ... or switch the link off', pg_temp.t_n(format('select public.feedback_request_switch_off(%L)', req)), 'error 42501');
    f := f || pg_temp.t_eq('1t ... or extend it', pg_temp.t_n(format('select public.feedback_request_extend(%L, 10)', req)), 'error 42501');
    f := f || pg_temp.t_eq('1u ... or list it', pg_temp.t_n('select count(*) from public.feedback_my_requests()'), '0');

    -- ------------------------------------------------ 2. switched off, expired, not open yet
    perform pg_temp.t_as(asker);
    select * into r from public.feedback_request_create('before_after_impact', null, 5); req2 := r.request_id; tok3 := r.token;
    perform public.feedback_request_switch_off(req2);
    perform pg_temp.t_anon();
    f := f || pg_temp.t_eq('2a switched off: refused', pg_temp.t_n(format('select public.feedback_send(%L, ''{}'')', tok3)), 'closed');
    perform pg_temp.t_as(asker);
    select * into r from public.feedback_request_create('before_after_impact', null, 5); req3 := r.request_id; tok3 := r.token;
    perform pg_temp.t_admin();
    update public.feedback_requests set opens_at = now() - interval '40 days', expires_at = now() - interval '1 minute' where id = req3;
    perform pg_temp.t_anon();
    f := f || pg_temp.t_eq('2b expired: refused', pg_temp.t_n(format('select public.feedback_send(%L, ''{}'')', tok3)), 'closed');
    perform pg_temp.t_as(asker);
    f := f || pg_temp.t_eq('2c the asker extends it', pg_temp.t_n(format('select public.feedback_request_extend(%L, 7) > now()', req3)), 'true');
    perform pg_temp.t_anon();
    f := f || pg_temp.t_eq('2d extended: open again', pg_temp.t_n(format('select public.feedback_send(%L, ''{}'')', tok3)), 'sent');
    perform pg_temp.t_as(asker);
    select * into r from public.feedback_request_create('before_after_impact', null, 5, false, 30, now() + interval '1 day'); tok3 := r.token;
    perform pg_temp.t_anon();
    f := f || pg_temp.t_eq('2e not open yet: refused', pg_temp.t_n(format('select public.feedback_open(%L) ->> ''status''', tok3)), 'closed');
    perform pg_temp.t_as(asker);
    f := f || pg_temp.t_eq('2f an unknown tool has no questions', pg_temp.t_n('select count(*) from public.feedback_request_create(''no_such_tool'', null)'), 'error 22023');

    -- ------------------------------------------------ 3. the 360 rule: names hidden from 3 answers
    select * into r from public.feedback_request_create('before_after_impact', null, 5, true); req3 := r.request_id; tok3 := r.token;
    perform pg_temp.t_anon();
    perform public.feedback_send(tok3, '{}', 'Ana', true);
    perform public.feedback_send(tok3, '{}', 'Ben', true);
    perform pg_temp.t_as(asker);
    f := f || pg_temp.t_eq('3a two answers: names show', pg_temp.t_n(format('select count(giver_name) from public.feedback_request_answers(%L)', req3)), '2');
    perform pg_temp.t_anon();
    perform public.feedback_send(tok3, '{}', 'Cat', true);
    perform pg_temp.t_as(asker);
    f := f || pg_temp.t_eq('3b three answers: names hidden', pg_temp.t_n(format('select count(giver_name) from public.feedback_request_answers(%L)', req3)), '0');
    perform pg_temp.t_anon();
    f := f || pg_temp.t_eq('3c a 61-character name refused', pg_temp.t_n(format('select public.feedback_send(%L, ''{}'', repeat(''n'', 61), true)', tok3)), 'error 22023');

    -- ------------------------------------------------ 4. the team pulse
    perform pg_temp.t_as(boss);
    select * into r from public.pulse_send_create('short', 3, now(), now() + interval '7 days', '[{"id": "q1", "kind": "rating", "text": "How clear are this month''s priorities?"}]');
    pulse_send := r.send_id; pulse_tok := r.token;
    f := f || pg_temp.t_eq('4a four own questions refused', pg_temp.t_n($q$select count(*) from public.pulse_send_create('short', 3, now(), now() + interval '7 days', '[{"id":"a","kind":"text","text":"a"},{"id":"b","kind":"text","text":"b"},{"id":"c","kind":"text","text":"c"},{"id":"d","kind":"text","text":"d"}]')$q$), 'error 22023');
    f := f || pg_temp.t_eq('4b the full check-in waits for its questions', pg_temp.t_n('select count(*) from public.pulse_send_create(''full_checkin'', 3, now(), now() + interval ''7 days'')'), 'error 22023');
    perform pg_temp.t_anon();
    f := f || pg_temp.t_eq('4c the team sees the questions, the boss''s own, and the small-team note', pg_temp.t_n(format('select (j ->> ''tool'') || '' '' || jsonb_array_length(j -> ''own_questions'') || '' '' || (j ->> ''small_group'') from public.feedback_open(%L) j', pulse_tok)), 'team_pulse 1 true');
    perform public.feedback_send(pulse_tok, '{"energy": "high", "comment": "More focus time"}');
    perform public.feedback_send(pulse_tok, '{"energy": "low"}', 'Sam', true);
    perform pg_temp.t_as(boss);
    f := f || pg_temp.t_eq('4d pulse answers aren''t read one by one', pg_temp.t_n(format('select count(*) from public.feedback_request_answers((select request_id from public.pulse_sends where id = %L))', pulse_send)), 'error 42501');
    f := f || pg_temp.t_eq('4e the boss sees their sends', pg_temp.t_n('select count(*) from public.pulse_sends'), '1');
    perform pg_temp.t_as(other);
    f := f || pg_temp.t_eq('4f nobody else does', pg_temp.t_n('select count(*) from public.pulse_sends'), '0');

    -- ------------------------------------------------ 5. what sponsors, leaders and admins reach
    perform pg_temp.t_as(sponsor_u);
    f := f || pg_temp.t_eq('5a the sponsor lists the seats they sponsor', pg_temp.t_n('select count(*) from public.sponsor_people()'), '2');
    f := f || pg_temp.t_eq('5b ... and reads a seat''s frozen summary', pg_temp.t_n(format('select count(*) from public.person_summaries(%L)', member_u)), '1');
    f := f || pg_temp.t_eq('5c ... never the summaries table itself', pg_temp.t_n('select count(*) from public.sprint_summaries'), '0');
    f := f || pg_temp.t_eq('5d wellbeing off: nothing', pg_temp.t_n(format('select count(*) from public.org_wellbeing(%L)', member_u)), '0');
    perform pg_temp.t_as(lead_parent);
    f := f || pg_temp.t_eq('5e a leader over the parent team lists people below', pg_temp.t_n('select count(*) from public.leader_people()'), '2');
    f := f || pg_temp.t_eq('5f ... and reads their summary', pg_temp.t_n(format('select count(*) from public.person_summaries(%L)', member_u)), '1');
    f := f || pg_temp.t_eq('5g ... but not a team outside their scope', pg_temp.t_n(format('select count(*) from public.leader_people(%L)', t_other)), '0');
    perform pg_temp.t_as(lead_other);
    f := f || pg_temp.t_eq('5h a leader of another team sees no one there', pg_temp.t_n('select count(*) from public.leader_people()'), '0');
    f := f || pg_temp.t_eq('5i ... and no summary', pg_temp.t_n(format('select count(*) from public.person_summaries(%L)', member_u)), '0');
    perform pg_temp.t_as(admin_u);
    f := f || pg_temp.t_eq('5j an admin reads no summary', pg_temp.t_n(format('select count(*) from public.person_summaries(%L)', member_u)), '0');
    f := f || pg_temp.t_eq('5k ... no wellbeing', pg_temp.t_n(format('select count(*) from public.org_wellbeing(%L)', member_u)), '0');
    f := f || pg_temp.t_eq('5l ... and no one as a sponsor or leader', pg_temp.t_n('select (select count(*) from public.sponsor_people()) + (select count(*) from public.leader_people())'), '0');
    -- wellbeing switched on, by the person
    perform pg_temp.t_as(member_u);
    -- from migration 033 wellbeing is switched on for each organisation
    if to_regclass('public.org_wellbeing_switches') is null then
      insert into public.sharing_switches (user_id, part, is_on) values (member_u, 'org_wellbeing', true);
    else
      execute format('insert into public.org_wellbeing_switches (user_id, organisation_id, is_on) values (%L, %L, true)', member_u, org1);
    end if;
    perform pg_temp.t_as(sponsor_u);
    f := f || pg_temp.t_eq('5m switched on: the sponsor sees scores, named', pg_temp.t_n(format('select count(*) from public.org_wellbeing(%L) where hardware_score is not null', member_u)), '1');
    f := f || pg_temp.t_eq('5n ... never the answers', pg_temp.t_n($q$select count(*) from information_schema.routines r join information_schema.parameters p on p.specific_name = r.specific_name where r.routine_name = 'org_wellbeing' and p.parameter_mode = 'OUT' and p.parameter_name in ('answers', 'goals')$q$), '0');
    perform pg_temp.t_as(lead_parent);
    f := f || pg_temp.t_eq('5o the leader too', pg_temp.t_n(format('select count(*) from public.org_wellbeing(%L)', member_u)), '1');
    perform pg_temp.t_as(lead_other);
    f := f || pg_temp.t_eq('5p not a leader outside their teams', pg_temp.t_n(format('select count(*) from public.org_wellbeing(%L)', member_u)), '0');
    perform pg_temp.t_as(member_u);
    if to_regclass('public.org_wellbeing_switches') is null then
      update public.sharing_switches set is_on = false where user_id = member_u and part = 'org_wellbeing';
    else
      execute format('update public.org_wellbeing_switches set is_on = false where user_id = %L', member_u);
    end if;
    perform pg_temp.t_as(sponsor_u);
    f := f || pg_temp.t_eq('5q switched off: past months hidden too', pg_temp.t_n(format('select count(*) from public.org_wellbeing(%L)', member_u)), '0');
    -- the leaver leaves
    perform pg_temp.t_as(admin_u);
    perform public.membership_end(m_lea);
    perform pg_temp.t_as(sponsor_u);
    f := f || pg_temp.t_eq('5r after leaving: not listed', pg_temp.t_n('select count(*) from public.sponsor_people()'), '1');
    f := f || pg_temp.t_eq('5s ... and no past summary comes back', pg_temp.t_n(format('select count(*) from public.person_summaries(%L)', leaver_u)), '0');
    perform pg_temp.t_as(lead_parent);
    f := f || pg_temp.t_eq('5t ... for the leader either', pg_temp.t_n(format('select count(*) from public.person_summaries(%L)', leaver_u)), '0');
    f := f || pg_temp.t_eq('5u ... nor in the leader''s list', pg_temp.t_n('select count(*) from public.leader_people()'), '1');
    perform pg_temp.t_as(leaver_u);
    f := f || pg_temp.t_eq('5v the leaver still reads their own', pg_temp.t_n(format('select count(*) from public.person_summaries(%L)', leaver_u)), '1');
    perform pg_temp.t_as(member_u);
    f := f || pg_temp.t_eq('5w the person sees exactly what their sponsor sees', pg_temp.t_n('select count(*) from public.sprint_summaries'), '1');
    f := f || pg_temp.t_eq('5x ... and can''t change it', pg_temp.t_rows('update public.sprint_summaries set summary = ''{}'''), 'error 42501');

    -- ------------------------------------------------ 6. organisation measures and comparisons
    perform pg_temp.t_as(owner_u);
    f := f || pg_temp.t_eq('6a the owner enters a measure', pg_temp.t_rows(format('insert into public.org_measures (organisation_id, name, baseline, target) values (%L, ''Retention of key people'', 80, 90)', org1)), '1');
    f := f || pg_temp.t_eq('6b ... and a comparison', pg_temp.t_rows(format('insert into public.org_comparisons (organisation_id, group_label, coached, group_size, period_start, period_end) values (%L, ''Uncoached'', false, 12, date ''2026-01-01'', date ''2026-06-30'')', org1)), '1');
    perform pg_temp.t_as(admin_u);
    f := f || pg_temp.t_eq('6c the admin reads the measure', pg_temp.t_n('select count(*) from public.org_measures'), '1');
    f := f || pg_temp.t_eq('6d ... can''t enter one', pg_temp.t_rows(format('insert into public.org_measures (organisation_id, name) values (%L, ''x'')', org1)), 'error 42501');
    f := f || pg_temp.t_eq('6e ... and never sees the comparison', pg_temp.t_n('select count(*) from public.org_comparisons'), '0');
    perform pg_temp.t_as(lead_parent);
    f := f || pg_temp.t_eq('6f a leader reads the measure', pg_temp.t_n('select count(*) from public.org_measures'), '1');
    f := f || pg_temp.t_eq('6g ... not the comparison', pg_temp.t_n('select count(*) from public.org_comparisons'), '0');
    perform pg_temp.t_as(member_u);
    f := f || pg_temp.t_eq('6h a member doesn''t see measures', pg_temp.t_n('select count(*) from public.org_measures'), '0');

    -- ------------------------------------------------ 7. impact raters
    perform pg_temp.t_as(other);
    f := f || pg_temp.t_eq('7a a rater can''t use someone else''s link', pg_temp.t_rows(format('insert into public.impact_raters (user_id, rater_label, rater_role, start_request_id) values (%L, ''Sponsor'', ''sponsor'', %L)', other, req)), 'error 42501');
    perform pg_temp.t_as(asker);
    f := f || pg_temp.t_eq('7b the person''s own link is fine', pg_temp.t_rows(format('insert into public.impact_raters (user_id, rater_label, rater_role, start_request_id) values (%L, ''Sponsor'', ''sponsor'', %L)', asker, req)), '1');

    perform pg_temp.t_anon();
    f := f || pg_temp.t_eq('8a signed out reaches no organisation function', pg_temp.t_n('select count(*) from public.sponsor_people()'), 'error 42501');
    f := f || pg_temp.t_eq('8b ... nor the summaries', pg_temp.t_n(format('select count(*) from public.person_summaries(%L)', member_u)), 'error 42501');

    raise exception using errcode = 'TT001', message = 'undo the test';
  exception when sqlstate 'TT001' then null;
  end;
  perform pg_temp.t_admin();
  if cardinality(f) > 0 then
    raise exception 'FAILED (% of the checks): %', cardinality(f), array_to_string(f, ' | ');
  end if;
  raise notice 'ALL CHECKS PASSED';
end
$t$;
