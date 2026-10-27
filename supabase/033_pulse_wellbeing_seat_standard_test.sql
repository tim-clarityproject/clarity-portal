-- =============================================================================
-- 033_pulse_wellbeing_seat_standard_test.sql
-- Checks 033_pulse_wellbeing_seat_standard.sql. RUN ORDER: 026 to 033, then this.
--
-- WHAT IT DOES
--   Makes invented people (a boss and their team's answers, given with no
--   account) and checks:
--     1. the team pulse: when results show (the shared cases from
--        tests/scores/cases.mjs), every way a boss could read a pulse
--        early, the 7-day link, and the Calm name;
--     2. wellbeing shared per organisation: a person in two organisations
--        sharing with one, switching one off, who may switch, and moving
--        the old single switch over without losing or widening anything.
--   Everything it makes is undone at the end.
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
-- A pulse from the boss signed in, opened p_ago days ago, to p_went_to
-- people, with one rating question of their own. Returns the send and its link.
create or replace function pg_temp.t_pulse(p_went_to integer, p_ago integer, out send uuid, out tok text) language plpgsql as $f$
declare rq record;
begin
  select * into rq from public.pulse_send_create('short', p_went_to, now() - make_interval(days => p_ago), now() - make_interval(days => p_ago) + interval '7 days',
                                                 '[{"id": "q1", "kind": "rating", "text": "How clear are this month''s priorities?"}]');
  send := rq.send_id; tok := rq.token;
end $f$;
create or replace function pg_temp.t_answer(p_tok text, p_energy text, p_name text default null) returns text language plpgsql as $f$
begin
  perform pg_temp.t_anon();
  return public.feedback_send(p_tok, jsonb_build_object('energy', p_energy, 'sleep', 'good', 'stress', 'rarely', 'workload', 'often', 'support', 'often',
                                                        'own', jsonb_build_object('q1', 7), 'comment', 'Fewer meetings.'),
                              p_name, p_name is not null);
end $f$;
create or replace function pg_temp.t_close(p_send uuid) returns void language plpgsql as $f$
begin
  perform public.feedback_request_switch_off((select s.request_id from public.pulse_sends s where s.id = p_send));
end $f$;

-- ---------------------------------------------------------------- the checks
do $t$
declare
  f text[] := '{}';
  boss uuid; other uuid;
  p_open uuid; k_open text; p_two uuid; k_two text; p_three uuid; k_three text; p_next uuid; k_next text; p_full uuid; k_full text;
  p_named uuid; k_named text;
  r jsonb;
  mem uuid; spon_a uuid; spon_b uuid; lead_a uuid; adm_a uuid; outsider uuid; mover uuid; stayed_off uuid; spon_c uuid;
  org_a uuid; org_b uuid; org_c uuid; team_a uuid; m_a uuid; m_b uuid; m_c uuid;
begin
  begin
    boss := pg_temp.t_user('boss'); other := pg_temp.t_user('other');

    -- ------------------------------------------------ 1. the team pulse (M18)
    -- 1a. the shared cases (tests/scores/cases.mjs, M18_SHOWN_CASES)
    perform pg_temp.t_as(boss);
    f := f || pg_temp.t_eq('1a M18-shown-open', public.score_m18_shown(false, 5, 0)::text, '{"shown": false, "reason": "open", "answers": null}');
    f := f || pg_temp.t_eq('1a M18-shown-open-few', public.score_m18_shown(false, 2, 1)::text, '{"shown": false, "reason": "open", "answers": null}');
    f := f || pg_temp.t_eq('1a M18-shown-none', public.score_m18_shown(true, 0, 0)::text, '{"shown": false, "reason": "too_few", "answers": 0}');
    f := f || pg_temp.t_eq('1a M18-shown-two', public.score_m18_shown(true, 2, 0)::text, '{"shown": false, "reason": "too_few", "answers": 2}');
    f := f || pg_temp.t_eq('1a M18-shown-three', public.score_m18_shown(true, 3, 0)::text, '{"shown": true, "reason": null, "answers": 3}');
    f := f || pg_temp.t_eq('1a M18-shown-one-anonymous', public.score_m18_shown(true, 3, 2)::text, '{"shown": false, "reason": "too_few_anonymous", "answers": 3}');
    f := f || pg_temp.t_eq('1a M18-shown-two-anonymous', public.score_m18_shown(true, 4, 2)::text, '{"shown": false, "reason": "too_few_anonymous", "answers": 4}');
    f := f || pg_temp.t_eq('1a M18-shown-three-anonymous', public.score_m18_shown(true, 4, 1)::text, '{"shown": true, "reason": null, "answers": 4}');
    f := f || pg_temp.t_eq('1a M18-shown-all-named', public.score_m18_shown(true, 3, 3)::text, '{"shown": true, "reason": null, "answers": 3}');

    -- 1b. the 7-day link
    f := f || pg_temp.t_eq('1b a pulse can''t stay open 8 days',
      pg_temp.t_n('select count(*) from public.pulse_send_create(''short'', 5, now(), now() + interval ''8 days'')'), 'error 22023');
    p_open := (select send_id from public.pulse_send_create('short', 5, now(), null));
    f := f || pg_temp.t_eq('1c no end given: open for 7 days',
      pg_temp.t_n(format('select extract(day from s.closes_at - s.opens_at)::text from public.pulse_sends s where s.id = %L', p_open)), '7');
    f := f || pg_temp.t_eq('1d a shorter time is fine',
      pg_temp.t_n('select count(*) from public.pulse_send_create(''short'', 5, now(), now() + interval ''3 days'')'), '1');
    perform pg_temp.t_admin();
    f := f || pg_temp.t_eq('1e even the database refuses a pulse open longer than 7 days',
      pg_temp.t_rows(format('update public.pulse_sends set closes_at = opens_at + interval ''8 days'' where boss_id = %L', boss)), 'error 23514');

    -- 1f. open, with 3 answers (1 named): nothing but the named answer
    perform pg_temp.t_as(boss);
    select * into p_open, k_open from pg_temp.t_pulse(8, 4);
    perform pg_temp.t_answer(k_open, 'high'); perform pg_temp.t_answer(k_open, 'low'); perform pg_temp.t_answer(k_open, 'ok', 'Ola');
    perform pg_temp.t_as(boss);
    r := public.pulse_results(p_open);
    f := f || pg_temp.t_eq('1f open: the results don''t show', r ->> 'shown', 'false');
    f := f || pg_temp.t_eq('1g ... with the reason', r ->> 'reason', 'open');
    f := f || pg_temp.t_eq('1h ... no totals, own questions or comments', (r ? 'measures' or r ? 'own' or r ? 'comments' or r ? 'lowest' or r ? 'nextStep')::text, 'false');
    f := f || pg_temp.t_eq('1i ... not even how many answered', coalesce(r ->> 'answers', 'hidden'), 'hidden');
    f := f || pg_temp.t_eq('1j ... but the named answer shows as it comes in', (select string_agg(x ->> 'name', ',') from jsonb_array_elements(r -> 'named') x), 'Ola');
    f := f || pg_temp.t_eq('1k the list of requests hides the count while it''s open',
      pg_temp.t_n(format('select coalesce(answers::text, ''hidden'') from public.feedback_my_requests() where id = (select request_id from public.pulse_sends where id = %L)', p_open)), 'hidden');
    f := f || pg_temp.t_eq('1l a pulse''s answers never come one by one', pg_temp.t_n(format('select count(*) from public.feedback_request_answers((select request_id from public.pulse_sends where id = %L))', p_open)), 'error 42501');
    f := f || pg_temp.t_eq('1m a pulse can''t be kept open longer', pg_temp.t_n(format('select public.feedback_request_extend((select request_id from public.pulse_sends where id = %L), 7)', p_open)), 'error 22023');

    -- 1n. closed with 3 answers, but only 2 without a name: still private
    perform pg_temp.t_close(p_open);
    r := public.pulse_results(p_open);
    f := f || pg_temp.t_eq('1n closed, 3 answers, 1 named: results stay private', (r ->> 'shown') || ' ' || (r ->> 'reason') || ' ' || (r ->> 'answers'), 'false too_few_anonymous 3');
    f := f || pg_temp.t_eq('1o ... no totals', (r ? 'measures')::text, 'false');
    f := f || pg_temp.t_eq('1p ... and it can''t be reopened', pg_temp.t_n(format('select public.feedback_request_extend((select request_id from public.pulse_sends where id = %L), 7)', p_open)), 'error 22023');
    f := f || pg_temp.t_eq('1q once closed, the list shows how many answered',
      pg_temp.t_n(format('select answers::text from public.feedback_my_requests() where id = (select request_id from public.pulse_sends where id = %L)', p_open)), '3');

    -- 1r. closed with 2 answers: only how many answered
    select * into p_two, k_two from pg_temp.t_pulse(8, 3);
    perform pg_temp.t_answer(k_two, 'high'); perform pg_temp.t_answer(k_two, 'low');
    perform pg_temp.t_as(boss);
    perform pg_temp.t_close(p_two);
    r := public.pulse_results(p_two);
    f := f || pg_temp.t_eq('1r closed with 2 answers: only how many answered', (r ->> 'shown') || ' ' || (r ->> 'reason') || ' ' || (r ->> 'answers'), 'false too_few 2');
    f := f || pg_temp.t_eq('1s ... no totals, own questions or comments', (r ? 'measures' or r ? 'own' or r ? 'comments')::text, 'false');
    f := f || pg_temp.t_eq('1t a closed pulse with 2 answers can''t be reopened to add more', pg_temp.t_n(format('select public.feedback_request_extend((select request_id from public.pulse_sends where id = %L), 1)', p_two)), 'error 22023');

    -- 1u. closed with 3 anonymous answers: the results, with Calm
    select * into p_three, k_three from pg_temp.t_pulse(8, 2);
    perform pg_temp.t_answer(k_three, 'high'); perform pg_temp.t_answer(k_three, 'low'); perform pg_temp.t_answer(k_three, 'ok');
    perform pg_temp.t_as(boss);
    r := public.pulse_results(p_three);
    f := f || pg_temp.t_eq('1u 3 answers but still open: nothing yet', r ->> 'shown', 'false');
    perform pg_temp.t_close(p_three);
    r := public.pulse_results(p_three);
    f := f || pg_temp.t_eq('1v closed with 3 answers: the results show', (r ->> 'shown') || ' ' || (r ->> 'answers'), 'true 3');
    f := f || pg_temp.t_eq('1w ... energy is the average (75, 25, 50)', ((r -> 'measures' -> 'energy' ->> 'figure')::numeric = 50)::text, 'true');
    f := f || pg_temp.t_eq('1x ... the stress question is named Calm', r -> 'measures' -> 'stress' ->> 'name', 'Calm');
    f := f || pg_temp.t_eq('1y ... in the list of names too', r -> 'measureNames' ->> 'stress', 'Calm');
    f := f || pg_temp.t_eq('1z ... their own question and the comments', (r -> 'own' -> 'q1' ->> 'answers') || ' ' || jsonb_array_length(r -> 'comments'), '3 3');
    f := f || pg_temp.t_eq('1aa ... no change, as last time (2 answers) didn''t show', coalesce(r -> 'measures' -> 'energy' ->> 'change', 'none'), 'none');
    f := f || pg_temp.t_eq('1ab a closed pulse''s answers are final: no more can be sent', pg_temp.t_answer(k_three, 'very_high'), 'closed');

    -- 1ac. the next pulse: the change from last time, which showed
    perform pg_temp.t_as(boss);
    select * into p_next, k_next from pg_temp.t_pulse(8, 1);
    perform pg_temp.t_answer(k_next, 'very_high'); perform pg_temp.t_answer(k_next, 'high'); perform pg_temp.t_answer(k_next, 'high');
    perform pg_temp.t_as(boss);
    perform pg_temp.t_close(p_next);
    r := public.pulse_results(p_next);
    f := f || pg_temp.t_eq('1ac the change since last time, which showed (50 to 83)', r -> 'measures' -> 'energy' ->> 'change', '33');

    -- 1ad. full counts as closed: 3 of 3 answered
    select * into p_full, k_full from pg_temp.t_pulse(3, 0);
    perform pg_temp.t_answer(k_full, 'high'); perform pg_temp.t_answer(k_full, 'low'); perform pg_temp.t_answer(k_full, 'ok');
    perform pg_temp.t_as(boss);
    r := public.pulse_results(p_full);
    f := f || pg_temp.t_eq('1ad everyone answered: the results show without waiting', r ->> 'shown', 'true');

    -- 1ae. every answer named: the results show (nothing anonymous to give away)
    select * into p_named, k_named from pg_temp.t_pulse(5, 0);
    perform pg_temp.t_answer(k_named, 'high', 'Ana'); perform pg_temp.t_answer(k_named, 'low', 'Ben'); perform pg_temp.t_answer(k_named, 'ok', 'Cy');
    perform pg_temp.t_as(boss);
    perform pg_temp.t_close(p_named);
    r := public.pulse_results(p_named);
    f := f || pg_temp.t_eq('1ae all 3 named: the results show', (r ->> 'shown') || ' ' || jsonb_array_length(r -> 'named'), 'true 3');

    -- 1af. nobody else
    perform pg_temp.t_as(other);
    f := f || pg_temp.t_eq('1af nobody else reads the pulse', pg_temp.t_n(format('select public.pulse_results(%L)', p_three)), 'error 42501');
    perform pg_temp.t_anon();
    f := f || pg_temp.t_eq('1ag signed out: no score function', pg_temp.t_n('select public.score_m18_shown(true, 3, 0)'), 'error 42501');
    f := f || pg_temp.t_eq('1ah ... nor the inside parts', pg_temp.t_n(format('select public.pulse_shown(%L)', gen_random_uuid())), 'error 42501');
    perform pg_temp.t_as(boss);
    f := f || pg_temp.t_eq('1ai a boss can''t call the inside parts either', pg_temp.t_n(format('select public.pulse_request_closed(%L)', gen_random_uuid())), 'error 42501');

    -- ------------------------------------------------ 2. wellbeing, per organisation (M19.4)
    perform pg_temp.t_admin();
    mem := pg_temp.t_user('member'); spon_a := pg_temp.t_user('sponsora'); spon_b := pg_temp.t_user('sponsorb'); lead_a := pg_temp.t_user('leadera');
    adm_a := pg_temp.t_user('admina'); outsider := pg_temp.t_user('outsider'); mover := pg_temp.t_user('mover'); stayed_off := pg_temp.t_user('stayedoff');
    spon_c := pg_temp.t_user('sponsorc');
    insert into public.organisations (name) values ('Invented A') returning id into org_a;
    insert into public.organisations (name) values ('Invented B') returning id into org_b;
    insert into public.organisations (name) values ('Invented C') returning id into org_c;
    insert into public.teams (organisation_id, name) values (org_a, 'Team A') returning id into team_a;
    insert into public.organisation_admins (organisation_id, user_id) values (org_a, adm_a);
    insert into public.organisation_members (organisation_id, user_id) values (org_a, mem) returning id into m_a;
    insert into public.organisation_members (organisation_id, user_id) values (org_b, mem) returning id into m_b;
    insert into public.team_members (member_id, team_id) values (m_a, team_a);
    insert into public.seat_sponsors (member_id, sponsor_user_id) values (m_a, spon_a), (m_b, spon_b);
    insert into public.leader_teams (user_id, team_id) values (lead_a, team_a);
    perform pg_temp.t_as(mem); perform public.membership_confirm(m_a); perform public.membership_confirm(m_b);
    perform pg_temp.t_admin();
    insert into public.checkins (user_id, month, answers, status) values (mem, date '2031-01-01', '{"H3": "often"}', 'finished');

    perform pg_temp.t_as(spon_a);
    f := f || pg_temp.t_eq('2a off by default: sponsor A sees nothing', public.may_see(mem, 'org_wellbeing')::text, 'false');
    perform pg_temp.t_as(mem);
    f := f || pg_temp.t_eq('2b the person shares with organisation A', pg_temp.t_rows(format('insert into public.org_wellbeing_switches (user_id, organisation_id, is_on) values (%L, %L, true)', mem, org_a)), '1');
    f := f || pg_temp.t_eq('2c ... their page lists both organisations, A on and B off',
      pg_temp.t_n('select string_agg(organisation_name || '' '' || is_on, '', '' order by organisation_name) from public.my_org_wellbeing_switches()'), 'Invented A true, Invented B false');
    perform pg_temp.t_as(spon_a);
    f := f || pg_temp.t_eq('2d sponsor A sees it, named, with past months', pg_temp.t_n(format('select count(*) from public.org_wellbeing(%L) where hardware_score is not null', mem)), '1');
    perform pg_temp.t_as(lead_a);
    f := f || pg_temp.t_eq('2e the leader over their team in A sees it', public.may_see(mem, 'org_wellbeing')::text, 'true');
    perform pg_temp.t_as(spon_b);
    f := f || pg_temp.t_eq('2f sponsor B (the other organisation) sees nothing', pg_temp.t_n(format('select count(*) from public.org_wellbeing(%L)', mem)), '0');
    perform pg_temp.t_as(adm_a);
    f := f || pg_temp.t_eq('2g A''s admin sees nothing', public.may_see(mem, 'org_wellbeing')::text, 'false');
    f := f || pg_temp.t_eq('2h ... nor the switches', pg_temp.t_n(format('select count(*) from public.org_wellbeing_switches where user_id = %L', mem)), '0');

    perform pg_temp.t_as(mem);
    perform pg_temp.t_rows(format('insert into public.org_wellbeing_switches (user_id, organisation_id, is_on) values (%L, %L, true)', mem, org_b));
    perform pg_temp.t_rows(format('update public.org_wellbeing_switches set is_on = false where user_id = %L and organisation_id = %L', mem, org_a));
    perform pg_temp.t_as(spon_a);
    f := f || pg_temp.t_eq('2i switched off for A: A sees nothing, past months too', pg_temp.t_n(format('select count(*) from public.org_wellbeing(%L)', mem)), '0');
    perform pg_temp.t_as(lead_a);
    f := f || pg_temp.t_eq('2j ... nor does A''s leader', public.may_see(mem, 'org_wellbeing')::text, 'false');
    perform pg_temp.t_as(spon_b);
    f := f || pg_temp.t_eq('2k ... while B, switched on, still does', pg_temp.t_n(format('select count(*) from public.org_wellbeing(%L)', mem)), '1');

    perform pg_temp.t_as(mem);
    f := f || pg_temp.t_eq('2l a switch can''t be moved to another organisation', pg_temp.t_rows(format('update public.org_wellbeing_switches set organisation_id = %L where user_id = %L and organisation_id = %L', org_c, mem, org_a)), 'error 42501');
    f := f || pg_temp.t_eq('2m ... or removed', pg_temp.t_rows(format('delete from public.org_wellbeing_switches where user_id = %L', mem)), 'error 42501');
    f := f || pg_temp.t_eq('2n ... and can''t be switched on for an organisation they''re not in', pg_temp.t_rows(format('insert into public.org_wellbeing_switches (user_id, organisation_id, is_on) values (%L, %L, true)', mem, org_c)), 'error 42501');
    f := f || pg_temp.t_eq('2o the single switch is refused, with a clear message', pg_temp.t_rows(format('insert into public.sharing_switches (user_id, part, is_on) values (%L, ''org_wellbeing'', true)', mem)), 'error 22023');
    f := f || pg_temp.t_eq('2p every change is kept, with its organisation',
      pg_temp.t_n(format('select count(*) from public.sharing_switch_history where user_id = %L and part = ''org_wellbeing'' and organisation_id = %L', mem, org_a)), '2');
    perform pg_temp.t_as(outsider);
    f := f || pg_temp.t_eq('2q nobody can switch it on for someone else', pg_temp.t_rows(format('insert into public.org_wellbeing_switches (user_id, organisation_id, is_on) values (%L, %L, true)', mem, org_c)), 'error 42501');
    f := f || pg_temp.t_eq('2r ... or read their switches', pg_temp.t_n(format('select count(*) from public.org_wellbeing_switches where user_id = %L', mem)), '0');

    -- leaving: the switch stays, but nothing reaches the organisation
    perform pg_temp.t_admin();
    update public.organisation_members set ended_on = current_date where id = m_b;
    perform pg_temp.t_as(spon_b);
    f := f || pg_temp.t_eq('2s once they leave B, B sees nothing, though it was on', pg_temp.t_n(format('select count(*) from public.org_wellbeing(%L)', mem)), '0');
    perform pg_temp.t_as(mem);
    f := f || pg_temp.t_eq('2t ... and they can switch it off there afterwards', pg_temp.t_rows(format('update public.org_wellbeing_switches set is_on = false where user_id = %L and organisation_id = %L', mem, org_b)), '1');

    -- moving the old single switch over
    perform pg_temp.t_admin();
    insert into public.organisation_members (organisation_id, user_id) values (org_a, mover), (org_b, mover), (org_c, mover);
    update public.organisation_members set confirmed_at = now() where false; -- confirmed below as the person
    perform pg_temp.t_as(mover);
    perform public.membership_confirm((select id from public.organisation_members where user_id = mover and organisation_id = org_a));
    perform public.membership_confirm((select id from public.organisation_members where user_id = mover and organisation_id = org_b));
    perform pg_temp.t_admin();
    update public.organisation_members set ended_on = current_date where user_id = mover and organisation_id = org_b;
    m_c := (select id from public.organisation_members where user_id = mover and organisation_id = org_c);
    insert into public.seat_sponsors (member_id, sponsor_user_id) values (m_c, spon_c);
    alter table public.sharing_switches disable trigger sharing_switches_check;
    insert into public.sharing_switches (user_id, part, is_on) values (mover, 'org_wellbeing', true), (stayed_off, 'org_wellbeing', false);
    alter table public.sharing_switches enable trigger sharing_switches_check;
    f := f || pg_temp.t_eq('2u moving: two switches made (A, and C not yet confirmed)', public.org_wellbeing_move_old_switches()::text, '2');
    f := f || pg_temp.t_eq('2v ... on for A and C, none for B, which they left',
      (select string_agg(o.name, ', ' order by o.name) from public.org_wellbeing_switches w join public.organisations o on o.id = w.organisation_id where w.user_id = mover and w.is_on), 'Invented A, Invented C');
    f := f || pg_temp.t_eq('2w ... someone whose switch was off gets none', (select count(*) from public.org_wellbeing_switches where user_id = stayed_off)::text, '0');
    f := f || pg_temp.t_eq('2x ... the single switches are gone', (select count(*) from public.sharing_switches where part = 'org_wellbeing' and user_id in (mover, stayed_off))::text, '0');
    f := f || pg_temp.t_eq('2y ... and moving again changes nothing', public.org_wellbeing_move_old_switches()::text, '0');
    perform pg_temp.t_as(spon_c);
    f := f || pg_temp.t_eq('2z not widened: C sees nothing until they confirm, as before', public.may_see(mover, 'org_wellbeing')::text, 'false');
    perform pg_temp.t_as(mover);
    perform public.membership_confirm(m_c);
    perform pg_temp.t_as(spon_c);
    f := f || pg_temp.t_eq('2aa ... and once they confirm, as before', public.may_see(mover, 'org_wellbeing')::text, 'true');
    perform pg_temp.t_as(mover);
    f := f || pg_temp.t_eq('2ab nobody can call the move', pg_temp.t_n('select public.org_wellbeing_move_old_switches()'), 'error 42501');

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
