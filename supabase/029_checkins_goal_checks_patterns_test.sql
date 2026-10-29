-- =============================================================================
-- 029_checkins_goal_checks_patterns_test.sql
-- Checks 029_checkins_goal_checks_patterns.sql. RUN ORDER: 026 to 029, then this.
--
-- WHAT IT DOES
--   Makes invented people (the owner coach and a second coach, a client of
--   each, someone without a coach, and a sponsor), saves check-ins, goal
--   checks and pattern cards, and checks the scores, the coach flags and who
--   can see what. Everything it makes is undone at the end.
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
  owner_u uuid; coach2_u uuid; client_a uuid; client_b uuid; loner uuid; sponsor_u uuid;
  owner_c uuid; coach2_c uuid; org1 uuid; mem uuid; plan_a uuid; obj_a uuid; plan_b uuid; obj_b uuid;
  ck uuid; ck2 uuid; flag_mood uuid; flag_pain uuid; card_pos uuid; card_neg uuid;
  m13_1 jsonb := '{"H1": "h7_8", "H2": "good", "H3": "sometimes", "H4": "h1_2_5", "H5": "d1", "H6": "h8_10", "H7": "good", "H8": "u8_14", "H9": "never", "H10": "ok", "H11": "high", "H12": "good", "H13": "a_little"}';
begin
  begin
    owner_u := pg_temp.t_user('owner'); coach2_u := pg_temp.t_user('coachtwo');
    client_a := pg_temp.t_user('clienta'); client_b := pg_temp.t_user('clientb'); loner := pg_temp.t_user('loner'); sponsor_u := pg_temp.t_user('sponsor');
    insert into public.coaches (user_id, role, display_first_name) values (owner_u, 'owner', 'Owner') returning id into owner_c;
    insert into public.coaches (user_id, role, display_first_name) values (coach2_u, 'coach', 'Coachtwo') returning id into coach2_c;
    insert into public.coach_clients (client_id, coach_id) values (client_a, owner_c), (client_b, coach2_c);
    insert into public.organisations (name) values ('Invented Org') returning id into org1;
    insert into public.organisation_members (organisation_id, user_id) values (org1, client_a) returning id into mem;
    insert into public.seat_sponsors (member_id, sponsor_user_id) values (mem, sponsor_u);
    perform pg_temp.t_as(client_a);
    perform public.membership_confirm(mem);

    -- ------------------------------------------------ 1. scores worked out from the answers (M13)
    insert into public.checkins (user_id, kind, month, answers, hardware_score) values (client_a, 'monthly', date '2026-09-01', m13_1, 99) returning id into ck;
    f := f || pg_temp.t_eq('1a M13-1: Hardware 67.5, whatever the app sent', pg_temp.t_n(format('select hardware_score::float8 from public.checkins where id = %L', ck)), '67.5');
    f := f || pg_temp.t_eq('1b the area scores', pg_temp.t_n(format('select (area_scores -> ''hardware'' ->> ''movement'')::float8 || '','' || (area_scores -> ''hardware'' ->> ''sleep'')::float8 from public.checkins where id = %L', ck)), '45,87.5');
    f := f || pg_temp.t_eq('1c no Software answers: no Software score', pg_temp.t_n(format('select software_score from public.checkins where id = %L', ck)), 'null');
    f := f || pg_temp.t_eq('1d the methods version (1.1 from 029, 1.4 once 036 has run)', pg_temp.t_n(format('select (methods_version in (''1.1'', ''1.4''))::text from public.checkins where id = %L', ck)), 'true');
    f := f || pg_temp.t_eq('1e an unknown answer refused', pg_temp.t_rows(format('update public.checkins set answers = answers || ''{"H1": "twelve"}'' where id = %L', ck)), 'error 22023');
    f := f || pg_temp.t_eq('1f an unknown question refused', pg_temp.t_rows(format('update public.checkins set answers = answers || ''{"H17": "ok"}'' where id = %L', ck)), 'error 22023');
    f := f || pg_temp.t_eq('1g travel is yes or no', pg_temp.t_rows(format('update public.checkins set answers = answers || ''{"H14": "maybe"}'' where id = %L', ck)), 'error 22023');
    f := f || pg_temp.t_eq('1h a month starts on the 1st', pg_temp.t_rows(format('insert into public.checkins (user_id, month) values (%L, date ''2026-10-02'')', client_a)), 'error 23514');
    f := f || pg_temp.t_eq('1i goals only on the First check-in', pg_temp.t_rows(format('update public.checkins set goals = ''{"G1": "x"}'' where id = %L', ck)), 'error 23514');
    f := f || pg_temp.t_eq('1j the database and the library agree on M13-1 Software', pg_temp.t_n($q$select (public.score_m13_checkin('{"S1": "often", "S2": "sometimes", "S3": "always", "S4": "often", "S5": "rarely", "S6": "never"}') ->> 'software')::numeric(6,4)$q$), '54.1667');

    -- ------------------------------------------------ 2. flags for the coach
    update public.checkins set answers = answers || '{"H1": "under_5"}', status = 'finished' where id = ck;
    f := f || pg_temp.t_eq('2a no flag from one month of short sleep', pg_temp.t_n('select count(*) from public.checkin_flags'), '0');
    perform pg_temp.t_admin();
    insert into public.checkins (user_id, month, answers, status) values (client_a, date '2026-10-01', m13_1 || '{"H2": "very_poor", "H10": "very_low", "H13": "very_much"}', 'finished') returning id into ck2;
    perform pg_temp.t_as(client_a);
    f := f || pg_temp.t_eq('2b the client never sees a flag', pg_temp.t_n('select count(*) from public.checkin_flags'), '0');
    perform pg_temp.t_as(owner_u);
    f := f || pg_temp.t_eq('2c the coach sees the flags: mood, poor sleep two months running, pain', pg_temp.t_n(format('select string_agg(reason, '','' order by reason) from public.checkin_flags where checkin_id = %L', ck2)), 'mood_very_low,pain,poor_sleep_two_months');
    flag_mood := (select id from public.checkin_flags where checkin_id = ck2 and reason = 'mood_very_low');
    flag_pain := (select id from public.checkin_flags where checkin_id = ck2 and reason = 'pain');
    f := f || pg_temp.t_eq('2d the coach can''t write a flag directly', pg_temp.t_rows(format('update public.checkin_flags set status = ''sent'' where id = %L', flag_mood)), 'error 42501');
    f := f || pg_temp.t_eq('2e the coach drafts a note', pg_temp.t_n(format('select public.coach_flag_decide(%L, ''draft'', ''How are you doing this month?'')', flag_mood)), 'draft');
    f := f || pg_temp.t_eq('2f and sends it', pg_temp.t_n(format('select public.coach_flag_decide(%L, ''send'')', flag_mood)), 'send');
    f := f || pg_temp.t_eq('2g Not now for another', pg_temp.t_n(format('select public.coach_flag_decide(%L, ''not_now'')', flag_pain)), 'not_now');
    perform pg_temp.t_as(coach2_u);
    f := f || pg_temp.t_eq('2h another coach sees no flags', pg_temp.t_n('select count(*) from public.checkin_flags'), '0');
    f := f || pg_temp.t_eq('2i ... and can''t act on one', pg_temp.t_n(format('select public.coach_flag_decide(%L, ''not_now'')', flag_mood)), 'error 42501');
    perform pg_temp.t_as(client_a);
    f := f || pg_temp.t_eq('2j the client sees only the note that was sent', pg_temp.t_n('select string_agg(note, '','') from public.my_coach_notes()'), 'How are you doing this month?');
    f := f || pg_temp.t_eq('2k the client can''t act on a flag', pg_temp.t_n(format('select public.coach_flag_decide(%L, ''send'', ''x'')', flag_pain)), 'error 42501');

    -- ------------------------------------------------ 3. switching the check-in off
    insert into public.sharing_switches (user_id, part, is_on) values (client_a, 'checkin', false);
    perform pg_temp.t_as(owner_u);
    f := f || pg_temp.t_eq('3a off: past check-ins hidden from the coach', pg_temp.t_n(format('select count(*) from public.checkins where user_id = %L', client_a)), '0');
    f := f || pg_temp.t_eq('3b ... and their flags', pg_temp.t_n('select count(*) from public.checkin_flags'), '0');
    perform pg_temp.t_admin();
    insert into public.checkins (user_id, month, answers, status) values (client_a, date '2026-11-01', '{"H3": "always"}', 'finished');
    f := f || pg_temp.t_eq('3c off: no new flag is made', pg_temp.t_n(format('select count(*) from public.checkin_flags where user_id = %L and reason = ''stress_always''', client_a)), '0');
    insert into public.checkins (user_id, month, answers, status) values (loner, date '2026-11-01', '{"H3": "always"}', 'finished');
    f := f || pg_temp.t_eq('3d no coach: no flag', pg_temp.t_n(format('select count(*) from public.checkin_flags where user_id = %L', loner)), '0');
    perform pg_temp.t_as(sponsor_u);
    f := f || pg_temp.t_eq('3e a sponsor never reads check-ins', pg_temp.t_n(format('select count(*) from public.checkins where user_id = %L', client_a)), '0');

    -- ------------------------------------------------ 4. goal checks
    perform pg_temp.t_as(client_b);
    insert into public.performance_plans (user_id) values (client_b) returning id into plan_b;
    insert into public.outcome_objectives (plan_id, user_id, name, kind, due_on) values (plan_b, client_b, 'B', 'milestone', date '2027-01-01') returning id into obj_b;
    perform pg_temp.t_as(client_a);
    insert into public.performance_plans (user_id) values (client_a) returning id into plan_a;
    insert into public.outcome_objectives (plan_id, user_id, name, kind, due_on) values (plan_a, client_a, 'A', 'milestone', date '2027-01-01') returning id into obj_a;
    f := f || pg_temp.t_eq('4a a goal check', pg_temp.t_rows(format('insert into public.goal_checks (user_id, objective_id, occasion, enjoy, matters, guilty, someone_else) values (%L, %L, ''sprint_end'', 5, 4, 2, 1)', client_a, obj_a)), '1');
    f := f || pg_temp.t_eq('4b a rating of 6 refused', pg_temp.t_rows(format('insert into public.goal_checks (user_id, objective_id, occasion, enjoy, matters, guilty, someone_else) values (%L, %L, ''sprint_end'', 6, 4, 2, 1)', client_a, obj_a)), 'error 23514');
    f := f || pg_temp.t_eq('4c on someone else''s objective refused', pg_temp.t_rows(format('insert into public.goal_checks (user_id, objective_id, occasion, enjoy, matters, guilty, someone_else) values (%L, %L, ''sprint_end'', 3, 3, 3, 3)', client_a, obj_b)), 'error 42501');

    -- ------------------------------------------------ 5. pattern cards
    f := f || pg_temp.t_eq('5a the app can''t write a card', pg_temp.t_rows(format('insert into public.pattern_cards (user_id, link_id, direction, strength, figures, methods_version) values (%L, ''L1'', ''positive'', ''clear'', ''{}'', ''1.1'')', client_a)), 'error 42501');
    perform pg_temp.t_admin();
    insert into public.pattern_cards (user_id, link_id, direction, strength, figures, methods_version) values (client_a, 'L1', 'positive', 'clear', '{}', '1.1') returning id into card_pos;
    insert into public.pattern_cards (user_id, link_id, direction, strength, coach_only, figures, methods_version) values (client_a, 'L4', 'negative', 'strong', true, '{}', '1.1') returning id into card_neg;
    f := f || pg_temp.t_eq('5b a link that holds someone back must be coach-only', pg_temp.t_rows(format('insert into public.pattern_cards (user_id, link_id, direction, strength, figures, methods_version) values (%L, ''L4'', ''negative'', ''strong'', ''{}'', ''1.1'')', client_a)), 'error 23514');
    perform pg_temp.t_as(client_a);
    f := f || pg_temp.t_eq('5c the client sees their card, not the coach-only one', pg_temp.t_n('select string_agg(link_id, '','') from public.pattern_cards'), 'L1');
    perform pg_temp.t_as(owner_u);
    f := f || pg_temp.t_eq('5d progress off: the coach sees no cards', pg_temp.t_n(format('select count(*) from public.pattern_cards where user_id = %L', client_a)), '0');
    f := f || pg_temp.t_eq('5e ... and can''t hide one', pg_temp.t_n(format('select public.coach_hide_pattern(%L, true)', card_pos)), 'error 42501');
    perform pg_temp.t_as(client_a);
    insert into public.sharing_switches (user_id, part, is_on) values (client_a, 'progress', true);
    perform pg_temp.t_as(owner_u);
    f := f || pg_temp.t_eq('5f progress on: the coach sees both, coach-only included', pg_temp.t_n(format('select count(*) from public.pattern_cards where user_id = %L', client_a)), '2');
    f := f || pg_temp.t_eq('5g ... and the goal checks', pg_temp.t_n(format('select count(*) from public.goal_checks where user_id = %L', client_a)), '1');
    f := f || pg_temp.t_eq('5h the coach hides a card', pg_temp.t_n(format('select public.coach_hide_pattern(%L, true)', card_pos)), 'true');
    perform pg_temp.t_as(coach2_u);
    f := f || pg_temp.t_eq('5i another coach can''t', pg_temp.t_n(format('select public.coach_hide_pattern(%L, false)', card_pos)), 'error 42501');
    perform pg_temp.t_as(client_a);
    f := f || pg_temp.t_eq('5j hidden from the client', pg_temp.t_n('select count(*) from public.pattern_cards'), '0');
    f := f || pg_temp.t_eq('5k the client can''t unhide it', pg_temp.t_n(format('select public.coach_hide_pattern(%L, false)', card_pos)), 'error 42501');
    f := f || pg_temp.t_eq('5l up to 2 own questions', pg_temp.t_rows(format('insert into public.pattern_questions (user_id, slot, label, cause, result) values (%L, 3, ''x'', ''{}'', ''{}'')', client_a)), 'error 23514');
    insert into public.pattern_questions (user_id, slot, label, cause, result) values (client_a, 1, 'Calls and revenue', '{}', '{}');
    f := f || pg_temp.t_eq('5m one per slot', pg_temp.t_rows(format('insert into public.pattern_questions (user_id, slot, label, cause, result) values (%L, 1, ''y'', ''{}'', ''{}'')', client_a)), 'error 23505');

    perform pg_temp.t_anon();
    f := f || pg_temp.t_eq('6a signed out reads nothing', pg_temp.t_n('select count(*) from public.checkins'), 'error 42501');
    f := f || pg_temp.t_eq('6b signed out gets no notes', pg_temp.t_n('select count(*) from public.my_coach_notes()'), 'error 42501');

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
