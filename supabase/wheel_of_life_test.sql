-- =============================================================================
-- wheel_of_life_test.sql
-- Checks 020_wheel_of_life.sql. RUN ORDER: 020 first, then this.
--
-- WHAT IT DOES
--   Everything happens inside one transaction that is ROLLED BACK at the end,
--   so nothing is left behind: not the two throwaway sign-ins it makes, not
--   their areas, check-ins or settings.
--
--   It acts as two fake signed-in people (A and B) using
--   "set local role authenticated" and "request.jwt.claims", the way Supabase
--   documents for testing row level security, and checks, in order:
--     1. A can add the ten standard areas and an own area, and read them back
--     2. a standard area with a label, a 25-character own label, a target of
--        11 and a duplicate area are all refused
--     3. setting a target works and stamps target_updated_at
--     4. A can save a check-in and read it back
--     5. a score of 11, a score of 5.5, an empty set of scores, a note or
--        focus for an area that was not scored, and a 501-character focus
--        note are all refused
--     6. A cannot edit a check-in or delete an area (not allowed at all)
--     7. A can save a chart style; an unknown style is refused
--     8. A cannot write a row in B's name
--     9. B sees none of A's rows and cannot change or delete them
--    10. someone signed out (anon) cannot read any of the tables
--   If every check passes it finishes with no error and the notice
--   "ALL CHECKS PASSED". If one fails, it stops with a message starting
--   "FAIL" saying which. Either way nothing is saved.
-- =============================================================================

begin;

do $$
declare
  u_a  uuid := gen_random_uuid();
  u_b  uuid := gen_random_uuid();
  c_id uuid;
  n    integer;
  ts   timestamptz;
  good_scores jsonb := '{"career":7,"financial":5}';
  good_areas  jsonb := '[{"key":"career","label":"Career / Work"},{"key":"financial","label":"Financial / Money"}]';
begin
  -- Two throwaway sign-ins (rolled back at the end).
  insert into auth.users (id, email, aud, role) values
    (u_a, 'wol-test-a-' || u_a || '@example.invalid', 'authenticated', 'authenticated'),
    (u_b, 'wol-test-b-' || u_b || '@example.invalid', 'authenticated', 'authenticated');

  -- ---------------------------------------------------------------- person A
  perform set_config('request.jwt.claims', json_build_object('sub', u_a, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  if auth.uid() is distinct from u_a then raise exception 'FAIL: could not act as person A'; end if;

  -- 2. a standard area with a label is refused
  begin
    insert into public.wheel_of_life_areas (user_id, area_key, kind, label) values (u_a, 'career', 'standard', 'Career');
    raise exception 'FAIL: a standard area with a label was accepted';
  exception when check_violation then null;
  end;

  -- 1. the ten standard areas and one own area
  insert into public.wheel_of_life_areas (user_id, area_key, kind, sort_order)
  select u_a, k, 'standard', o - 1
  from unnest(array['career','financial','health','relationships','romance',
                    'growth','fun','home','contribution','meaning']) with ordinality as t(k, o)
  on conflict (user_id, area_key) do nothing;
  -- seeding twice is harmless
  insert into public.wheel_of_life_areas (user_id, area_key, kind, sort_order)
  values (u_a, 'career', 'standard', 0)
  on conflict (user_id, area_key) do nothing;
  insert into public.wheel_of_life_areas (user_id, area_key, kind, label, sort_order)
  values (u_a, 'own_0123456789abcdef', 'own', 'Travel', 100);

  select count(*) into n from public.wheel_of_life_areas where user_id = u_a;
  if n <> 11 then raise exception 'FAIL: A should see 11 areas, saw %', n; end if;

  -- 2. bad area rows are refused
  begin
    insert into public.wheel_of_life_areas (user_id, area_key, kind, label, sort_order)
    values (u_a, 'own_tooLong', 'own', repeat('x', 25), 101);
    raise exception 'FAIL: a 25-character own label was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.wheel_of_life_areas (user_id, area_key, kind, label, sort_order)
    values (u_a, 'own_blank', 'own', '   ', 101);
    raise exception 'FAIL: a blank own label was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.wheel_of_life_areas (user_id, area_key, kind) values (u_a, 'spirituality', 'standard');
    raise exception 'FAIL: an unknown standard key was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.wheel_of_life_areas (user_id, area_key, kind, label, sort_order)
    values (u_a, 'own_0123456789abcdef', 'own', 'Travel again', 102);
    raise exception 'FAIL: a duplicate area was accepted';
  exception when unique_violation then null;
  end;
  begin
    update public.wheel_of_life_areas set target = 11 where user_id = u_a and area_key = 'fun';
    raise exception 'FAIL: a target of 11 was accepted';
  exception when check_violation then null;
  end;

  -- 3. a target saves and stamps target_updated_at
  update public.wheel_of_life_areas set target = 5 where user_id = u_a and area_key = 'fun';
  select target_updated_at into ts from public.wheel_of_life_areas where user_id = u_a and area_key = 'fun';
  if ts is null then raise exception 'FAIL: target_updated_at was not set'; end if;
  update public.wheel_of_life_areas set target = null where user_id = u_a and area_key = 'fun';
  select count(*) into n from public.wheel_of_life_areas where user_id = u_a and area_key = 'fun' and target is null;
  if n <> 1 then raise exception 'FAIL: a target could not be cleared'; end if;

  -- 4. a good check-in saves and reads back
  insert into public.wheel_of_life_checkins (user_id, checkin_date, scores, areas, notes, focus_area_key, focus_note)
  values (u_a, current_date, good_scores, good_areas, '{"career":"A good month."}', 'financial', 'One small step')
  returning id into c_id;
  select count(*) into n from public.wheel_of_life_checkins where user_id = u_a;
  if n <> 1 then raise exception 'FAIL: A should see 1 check-in, saw %', n; end if;

  -- 5. bad check-ins are refused
  begin
    insert into public.wheel_of_life_checkins (user_id, checkin_date, scores, areas)
    values (u_a, current_date, '{"career":11,"financial":5}', good_areas);
    raise exception 'FAIL: a score of 11 was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.wheel_of_life_checkins (user_id, checkin_date, scores, areas)
    values (u_a, current_date, '{"career":5.5,"financial":5}', good_areas);
    raise exception 'FAIL: a score of 5.5 was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.wheel_of_life_checkins (user_id, checkin_date, scores, areas)
    values (u_a, current_date, '{"career":"7","financial":5}', good_areas);
    raise exception 'FAIL: a score written as text was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.wheel_of_life_checkins (user_id, checkin_date, scores, areas)
    values (u_a, current_date, '{}', '[]');
    raise exception 'FAIL: an empty set of scores was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.wheel_of_life_checkins (user_id, checkin_date, scores, areas)
    values (u_a, current_date, good_scores, '[{"key":"career","label":"Career / Work"}]');
    raise exception 'FAIL: an areas list that does not match the scores was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.wheel_of_life_checkins (user_id, checkin_date, scores, areas, notes)
    values (u_a, current_date, good_scores, good_areas, '{"health":"Not scored"}');
    raise exception 'FAIL: a note for an area that was not scored was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.wheel_of_life_checkins (user_id, checkin_date, scores, areas, notes)
    values (u_a, current_date, good_scores, good_areas, jsonb_build_object('career', repeat('x', 1001)));
    raise exception 'FAIL: a 1001-character note was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.wheel_of_life_checkins (user_id, checkin_date, scores, areas, focus_area_key)
    values (u_a, current_date, good_scores, good_areas, 'health');
    raise exception 'FAIL: a focus on an area that was not scored was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.wheel_of_life_checkins (user_id, checkin_date, scores, areas, focus_area_key, focus_note)
    values (u_a, current_date, good_scores, good_areas, 'career', repeat('x', 501));
    raise exception 'FAIL: a 501-character focus note was accepted';
  exception when check_violation then null;
  end;

  -- 6. check-ins cannot be edited; areas cannot be deleted
  begin
    update public.wheel_of_life_checkins set focus_note = 'changed' where id = c_id;
    raise exception 'FAIL: a check-in could be edited';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.wheel_of_life_areas where user_id = u_a;
    raise exception 'FAIL: an area could be deleted';
  exception when insufficient_privilege then null;
  end;

  -- 7. chart style
  insert into public.wheel_of_life_settings (user_id, chart_style) values (u_a, 'radar')
  on conflict (user_id) do update set chart_style = excluded.chart_style;
  insert into public.wheel_of_life_settings (user_id, chart_style) values (u_a, 'delta')
  on conflict (user_id) do update set chart_style = excluded.chart_style;
  select count(*) into n from public.wheel_of_life_settings where user_id = u_a and chart_style = 'delta';
  if n <> 1 then raise exception 'FAIL: the chart style did not save'; end if;
  begin
    update public.wheel_of_life_settings set chart_style = 'pie' where user_id = u_a;
    raise exception 'FAIL: an unknown chart style was accepted';
  exception when check_violation then null;
  end;

  -- 8. A cannot write in B's name
  begin
    insert into public.wheel_of_life_checkins (user_id, checkin_date, scores, areas)
    values (u_b, current_date, good_scores, good_areas);
    raise exception 'FAIL: A could save a check-in as B';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.wheel_of_life_areas (user_id, area_key, kind) values (u_b, 'career', 'standard');
    raise exception 'FAIL: A could add an area as B';
  exception when insufficient_privilege then null;
  end;

  -- ---------------------------------------------------------------- person B
  perform set_config('request.jwt.claims', json_build_object('sub', u_b, 'role', 'authenticated')::text, true);
  if auth.uid() is distinct from u_b then raise exception 'FAIL: could not act as person B'; end if;

  select count(*) into n from public.wheel_of_life_areas;
  if n <> 0 then raise exception 'FAIL: B can see % of A''s areas', n; end if;
  select count(*) into n from public.wheel_of_life_checkins;
  if n <> 0 then raise exception 'FAIL: B can see % of A''s check-ins', n; end if;
  select count(*) into n from public.wheel_of_life_settings;
  if n <> 0 then raise exception 'FAIL: B can see A''s settings'; end if;

  update public.wheel_of_life_areas set active = false, target = 0 where user_id = u_a;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: B changed % of A''s areas', n; end if;
  update public.wheel_of_life_settings set chart_style = 'sectional' where user_id = u_a;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: B changed A''s settings'; end if;
  delete from public.wheel_of_life_checkins where id = c_id;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: B deleted A''s check-in'; end if;

  -- ------------------------------------------------- back to A: all still there
  perform set_config('request.jwt.claims', json_build_object('sub', u_a, 'role', 'authenticated')::text, true);
  select count(*) into n from public.wheel_of_life_areas where active and target is null;
  if n <> 11 then raise exception 'FAIL: A''s areas were changed by B'; end if;
  delete from public.wheel_of_life_checkins where id = c_id;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: A could not delete their own check-in'; end if;

  -- ------------------------------------------------------------ signed out
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('role', 'anon', true);
  begin
    perform 1 from public.wheel_of_life_areas;
    raise exception 'FAIL: signed out, the areas table could be read';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.wheel_of_life_checkins;
    raise exception 'FAIL: signed out, the check-ins table could be read';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.wheel_of_life_settings;
    raise exception 'FAIL: signed out, the settings table could be read';
  exception when insufficient_privilege then null;
  end;

  raise notice 'ALL CHECKS PASSED';
end;
$$;

-- Throw everything away: the two test sign-ins and all of their rows.
rollback;
