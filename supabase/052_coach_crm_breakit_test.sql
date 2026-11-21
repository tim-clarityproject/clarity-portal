-- =============================================================================
-- 052_coach_crm_breakit_test.sql
-- The break-it tester's probes of 052_coach_crm.sql (Phase 6a run 4, 21 Nov).
-- RUN ORDER: 026, 033, 049, 050, 051, 052, then this. Run ONLY on the local
-- PGlite stand-in or a test project; never on live. It changes nothing: every
-- row it makes is undone at the end.
--
-- WHAT IT DOES (on top of 052_coach_crm_test.sql, which it doesn't repeat)
--   B1 who reaches what: a client and someone signed out against every table
--      and function of 052; an associate undoing the owner's merges; a shared
--      board read only and only that board's cards, closed again the moment
--      it is unshared or archived;
--   B2 network_page asked things no page sends: a sort or Show only written
--      to break the query, limits and offsets out of range, a search with
--      the wildcards % and _ in it;
--   B3 odd values: ratings of 11, -1 and 10.5, a rhythm of 0, a 300-character
--      name, a name of spaces, a value of 1e12, 60 stages, a to-do title of
--      5,000 characters, 200 automations, an automation naming a deleted
--      stage, 200 own columns, 5,001 rows at once;
--   B4 merges: A into B then B into C and both undone in turn, a merge undone
--      twice, a lead merged away merged again, a won lead merged away, and two
--      Network people chained the same way.
--
--   It ends with the notice 052 BREAK-IT CHECKS PASSED, or stops with FAILED
--   and a list naming each check that failed. Each finding it records but
--   doesn't fail on is a notice starting "052 BREAK-IT NOTE".
-- =============================================================================
create or replace function pg_temp.t_as(p uuid) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated', 'aal', 'aal2')::text, true);  -- 054: signed in with the code
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
  insert into auth.users (id, email, aud, role, email_confirmed_at)
  values (u, 'p6a-break-' || p_label || '-' || u || '@example.invalid', 'authenticated', 'authenticated', now());
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
-- A refusal of any kind (a permission, a check, a bad input): 'refused', or what came back.
create or replace function pg_temp.t_no(p_sql text) returns text language plpgsql as $f$
declare v text;
begin
  v := pg_temp.t_n(p_sql);
  return case when v like 'error %' then 'refused' else v end;
end $f$;

do $t$
declare
  f text[] := '{}';
  tbl text;
  fn text;
  tables text[] := array[
    'coach_lead_stages', 'coach_lead_events', 'coach_lead_merges', 'coach_automations', 'coach_automation_runs', 'coach_boards',
    'coach_board_stages', 'coach_board_items', 'coach_emails', 'coach_email_bodies', 'coach_email_links', 'coach_email_waiting',
    'coach_email_addresses', 'client_check_ins', 'organisation_deals', 'organisation_growth', 'network_people', 'network_ratings',
    'network_gives', 'network_columns', 'network_merges'];
  calls text[];
  own_u uuid; maya_u uuid; sam_u uuid;
  own_c uuid; maya_c uuid;
  own_email text;
  p_sam uuid := gen_random_uuid(); p_won uuid := gen_random_uuid();
  st_new uuid; st_dec uuid; st_won uuid; st_x uuid := gen_random_uuid();
  l_a uuid := gen_random_uuid(); l_b uuid := gen_random_uuid(); l_c uuid := gen_random_uuid(); l_w uuid := gen_random_uuid(); l_o uuid := gen_random_uuid();
  m1 uuid; m2 uuid; m3 uuid; nm1 uuid; nm2 uuid;
  n_p uuid := gen_random_uuid(); n_q uuid := gen_random_uuid(); n_r uuid := gen_random_uuid();
  b_sh uuid := gen_random_uuid(); b_pr uuid := gen_random_uuid(); bs1 uuid := gen_random_uuid(); bs2 uuid := gen_random_uuid(); bs3 uuid := gen_random_uuid();
  bi1 uuid := gen_random_uuid(); bi2 uuid := gen_random_uuid();
  a1 uuid := gen_random_uuid();
  today date := date '2026-11-19';
  t0 timestamptz;
  v text; j jsonb; r text[];
begin
  begin
    perform pg_temp.t_admin();
    own_u := pg_temp.t_user('owner'); maya_u := pg_temp.t_user('maya'); sam_u := pg_temp.t_user('sam');
    select email into own_email from auth.users where id = own_u;
    insert into public.coaches (user_id, role, display_first_name, full_name, email) values (own_u, 'owner', 'Tess', 'Tess Owner', own_email) returning id into own_c;
    insert into public.coaches (user_id, role, display_first_name, full_name) values (maya_u, 'coach', 'Maya', 'Maya Invented') returning id into maya_c;
    insert into public.coach_settings (coach_id, time_zone) values (own_c, 'Europe/London'), (maya_c, 'Europe/London');
    insert into public.client_profiles (id, coach_id, name, email) values (p_sam, own_c, 'Sam Okafor', 'sam.break@example.invalid');
    insert into public.client_profiles (id, coach_id, name, email) values (p_won, own_c, 'Leo Grant', 'leo.break@example.invalid');
    perform set_config('clarity.linking', 'on', true);
    update public.client_profiles set user_id = sam_u where id = p_sam;
    perform set_config('clarity.linking', '', true);

    perform pg_temp.t_as(own_u);
    perform public.coach_lead_stages_start();
    select id into st_new from public.coach_lead_stages where name = 'New';
    select id into st_dec from public.coach_lead_stages where name = 'Deciding';
    select id into st_won from public.coach_lead_stages where is_won;
    insert into public.coach_leads (id, coach_id, name, email, source, value) values
      (l_a, own_c, 'Chris Doyle', 'chris.break@example.invalid', 'manual', 1000),
      (l_b, own_c, 'Christopher Doyle', null, 'manual', 2000),
      (l_c, own_c, 'C. Doyle', null, 'manual', null),
      (l_o, own_c, 'Leo G.', null, 'manual', 500);
    insert into public.coach_leads (id, coach_id, name, email, source, stage_id, won_at, won_profile_id) values
      (l_w, own_c, 'Leo Grant', 'leo.break@example.invalid', 'manual', st_won, now(), p_won);
    insert into public.coach_lead_events (coach_id, lead_id, kind, happened_on, title) values
      (own_c, l_a, 'call', today - 3, 'A call'), (own_c, l_b, 'note', today - 2, 'B note'), (own_c, l_c, 'note', today - 1, 'C note'),
      (own_c, l_w, 'call', today - 40, 'The call that won it'), (own_c, l_w, 'won', today - 30, 'Won');
    insert into public.network_people (id, coach_id, name, influence, trust, value_delivery, what_you_get, rhythm_months, last_spoke_on) values
      (n_p, own_c, 'Dan Reid', 6, 9, 7, 8, 3, today - 90), (n_q, own_c, 'Daniel Reid', 5, 5, 5, 5, 6, today - 30), (n_r, own_c, 'D. Reid', null, null, null, null, null, null);
    insert into public.network_gives (person_id, coach_id, direction, kind, happened_on) values
      (n_p, own_c, 'gave', 'idea', today - 5), (n_q, own_c, 'asked', 'advice', today - 4), (n_r, own_c, 'gave', 'favour', today - 3);
    insert into public.coach_boards (id, coach_id, name, shared) values (b_sh, own_c, 'Speaking', true), (b_pr, own_c, 'Partners', false);
    insert into public.coach_board_stages (id, board_id, coach_id, name, position) values (bs1, b_sh, own_c, 'Ideas', 0), (bs2, b_sh, own_c, 'Pitched', 1), (bs3, b_pr, own_c, 'Talking', 0);
    insert into public.coach_board_items (id, board_id, coach_id, stage_id, title) values (bi1, b_sh, own_c, bs1, 'CIPD Festival of Work'), (bi2, b_pr, own_c, bs3, 'Henley Business School');
    m1 := public.lead_merge(l_b, l_a, '{}'::jsonb);
    nm1 := public.network_merge(n_q, n_p, '{}'::jsonb);
    perform public.lead_unmerge(m1);
    perform public.network_unmerge(nm1);

    -- B1. Who reaches what.
    calls := array[
      'select count(*) from public.coach_lead_stages_start()', format('select public.lead_merge(%L, %L)', l_a, l_b), format('select public.lead_unmerge(%L)', m1),
      'select public.network_page()', 'select public.network_map()', 'select public.network_counts()',
      format('select public.network_archive(array[%L]::uuid[])', n_p), format('select public.network_restore(array[%L]::uuid[])', n_p),
      'select public.network_duplicates(''[{"name":"Dan Reid"}]'')', 'select public.network_import(''[{"name":"Someone New"}]'')',
      format('select public.network_merge(%L, %L)', n_p, n_q), format('select public.network_unmerge(%L)', nm1),
      'select count(*) from public.coach_email_addresses_start()', 'select public.coach_email_add(''{"subject":"x"}'')',
      'select public.email_in(''abcdefgh'', ''{"subject":"x"}'')'];
    perform pg_temp.t_as(sam_u);
    r := '{}';
    foreach fn in array calls loop r := r || pg_temp.t_no(fn); end loop;
    f := f || pg_temp.t_eq('B1a a client is refused every one of 052''s functions', (select string_agg(x, ',') from unnest(r) x), array_to_string(array_fill('refused'::text, array[cardinality(calls)]), ','));
    r := '{}';
    foreach tbl in array tables loop r := r || pg_temp.t_n(format('select count(*) from public.%I', tbl)); end loop;
    r := r || pg_temp.t_n('select count(*) from public.coach_leads');
    f := f || pg_temp.t_eq('B1b a client reads nothing of any 052 table, nor the leads (or is refused)', (select string_agg(case when x in ('0', 'error 42501') then 'none' else x end, ',') from unnest(r) x),
      array_to_string(array_fill('none'::text, array[cardinality(tables) + 1]), ','));
    r := '{}';
    foreach fn in array calls loop r := r || pg_temp.t_no(fn); end loop;
    perform pg_temp.t_anon();
    r := '{}';
    foreach fn in array calls loop r := r || pg_temp.t_no(fn); end loop;
    f := f || pg_temp.t_eq('B1c someone signed out is refused every function', (select string_agg(x, ',') from unnest(r) x), array_to_string(array_fill('refused'::text, array[cardinality(calls)]), ','));
    r := '{}';
    foreach tbl in array tables loop r := r || pg_temp.t_n(format('select count(*) from public.%I', tbl)); end loop;
    f := f || pg_temp.t_eq('B1d someone signed out is refused every table', (select string_agg(case when x like 'error %' then 'refused' else x end, ',') from unnest(r) x),
      array_to_string(array_fill('refused'::text, array[cardinality(tables)]), ','));

    -- The owner merges again; the associate tries to undo it, and the network merge.
    perform pg_temp.t_as(own_u);
    m1 := public.lead_merge(l_b, l_a, '{}'::jsonb);
    nm1 := public.network_merge(n_q, n_p, '{}'::jsonb);
    perform pg_temp.t_as(maya_u);
    f := f || pg_temp.t_eq('B1e an associate can''t undo the owner''s merges, of leads or of Network', concat_ws('/',
      pg_temp.t_no(format('select public.lead_unmerge(%L)', m1)), pg_temp.t_no(format('select public.network_unmerge(%L)', nm1))), 'refused/refused');
    perform pg_temp.t_as(own_u);
    f := f || pg_temp.t_eq('B1f and both merges still stand for the owner', concat_ws('/',
      (select (merged_into = l_b)::text from public.coach_leads where id = l_a), (select (merged_into = n_q)::text from public.network_people where id = n_p)), 'true/true');
    perform public.lead_unmerge(m1);
    perform public.network_unmerge(nm1);

    -- A shared board: only its own cards, read only; closed at once when unshared or archived.
    perform pg_temp.t_as(maya_u);
    f := f || pg_temp.t_eq('B1g an associate reads the shared board, its stages and its cards, and nothing of the other', concat_ws('/',
      (select string_agg(name, ',') from public.coach_boards), (select string_agg(name, ',' order by position) from public.coach_board_stages),
      (select string_agg(title, ',') from public.coach_board_items), (select count(*) from public.coach_board_items where id = bi2)), 'Speaking/Ideas,Pitched/CIPD Festival of Work/0');
    f := f || pg_temp.t_eq('B1h and can''t change any of it: a card moved, renamed, added or deleted; a stage; the board unshared or renamed', concat_ws('/',
      pg_temp.t_rows(format('update public.coach_board_items set stage_id = %L where id = %L', bs2, bi1)),
      pg_temp.t_rows(format('update public.coach_board_items set title = ''Mine now'' where id = %L', bi1)),
      pg_temp.t_rows(format('insert into public.coach_board_items (board_id, coach_id, stage_id, title) values (%L, %L, %L, ''Sneaked in'')', b_sh, maya_c, bs1)),
      pg_temp.t_rows(format('insert into public.coach_board_items (board_id, coach_id, stage_id, title) values (%L, %L, %L, ''Sneaked in'')', b_sh, own_c, bs1)),
      pg_temp.t_rows(format('delete from public.coach_board_items where id = %L', bi1)),
      pg_temp.t_rows(format('update public.coach_board_stages set name = ''Renamed'' where id = %L', bs1)),
      pg_temp.t_rows(format('insert into public.coach_board_stages (board_id, coach_id, name) values (%L, %L, ''Mine'')', b_sh, maya_c)),
      pg_temp.t_rows(format('update public.coach_boards set shared = false, name = ''Taken'' where id = %L', b_sh)),
      pg_temp.t_rows(format('delete from public.coach_boards where id = %L', b_sh))), '0/0/error 42501/error 42501/0/0/error 42501/0/0');
    perform pg_temp.t_as(own_u);
    f := f || pg_temp.t_eq('B1i so the board is as it was', concat_ws('/', (select title || ' ' || (stage_id = bs1) from public.coach_board_items where id = bi1),
      (select count(*) from public.coach_board_items where board_id = b_sh), (select name || ' ' || shared from public.coach_boards where id = b_sh)), 'CIPD Festival of Work true/1/Speaking true');
    update public.coach_boards set shared = false where id = b_sh;
    perform pg_temp.t_as(maya_u);
    f := f || pg_temp.t_eq('B1j unshared, it closes at once: no board, stage or card', concat_ws('/',
      (select count(*) from public.coach_boards), (select count(*) from public.coach_board_stages), (select count(*) from public.coach_board_items)), '0/0/0');
    perform pg_temp.t_as(own_u);
    update public.coach_boards set shared = true, archived_at = now() where id = b_sh;
    perform pg_temp.t_as(maya_u);
    f := f || pg_temp.t_eq('B1k shared but archived (Delete the board): closed too', concat_ws('/',
      (select count(*) from public.coach_boards), (select count(*) from public.coach_board_stages), (select count(*) from public.coach_board_items)), '0/0/0');
    perform pg_temp.t_as(own_u);
    update public.coach_boards set archived_at = null where id = b_sh;

    -- B2. network_page asked things no page sends.
    perform pg_temp.t_as(own_u);
    insert into public.network_people (coach_id, name, organisation) values (own_c, '100% Sure Ltd', null), (own_c, 'Under_Score', 'A_B'), (own_c, 'Back\slash', null);
    r := '{}';
    r := r || pg_temp.t_n('select jsonb_array_length(public.network_page(p_sort => ''name; drop table public.network_people; --'') -> ''rows'')');
    r := r || pg_temp.t_n('select jsonb_array_length(public.network_page(p_sort => ''own:x'''' or 1=1 --'') -> ''rows'')');
    r := r || pg_temp.t_n('select jsonb_array_length(public.network_page(p_sort => ''own:'') -> ''rows'')');
    r := r || pg_temp.t_n('select jsonb_array_length(public.network_page(p_only => ''{"rhythm":["1); drop table x; --", 3, "abc", 99999]}'') -> ''rows'')');
    r := r || pg_temp.t_n('select jsonb_array_length(public.network_page(p_only => ''{"focus":"keep_close","role":{"x":1},"organisation":[null, 1, ["x"]],"due":5,"ready":"yes"}'') -> ''rows'')');
    r := r || pg_temp.t_n('select jsonb_array_length(public.network_page(p_only => ''[1,2]'') -> ''rows'')');
    r := r || pg_temp.t_n('select jsonb_array_length(public.network_page(p_only => ''{"role":["x''''); drop table y; --"]}'') -> ''rows'')');
    r := r || (select count(*)::text from public.network_people where coach_id = own_c);
    f := f || pg_temp.t_eq('B2a a sort or Show only written to break the query does nothing but answer', array_to_string(r, '/'), '6/6/6/1/0/6/0/6');
    r := '{}';
    r := r || pg_temp.t_n('select jsonb_array_length(public.network_page(p_limit => 100000) -> ''rows'')');
    r := r || pg_temp.t_n('select jsonb_array_length(public.network_page(p_limit => -5) -> ''rows'')');
    r := r || pg_temp.t_n('select jsonb_array_length(public.network_page(p_limit => 0) -> ''rows'')');
    r := r || pg_temp.t_n('select jsonb_array_length(public.network_page(p_offset => -100) -> ''rows'')');
    r := r || pg_temp.t_n('select jsonb_array_length(public.network_page(p_offset => 2147483647) -> ''rows'')');
    r := r || pg_temp.t_n('select jsonb_array_length(public.network_map(''everyone'', -1) -> ''rows'')');
    r := r || pg_temp.t_n('select jsonb_array_length(public.network_map(''something odd'', 100000) -> ''rows'')');
    f := f || pg_temp.t_eq('B2b limits and offsets out of range are held in range', array_to_string(r, '/'), '6/1/1/6/0/1/0');
    r := '{}';
    r := r || pg_temp.t_n('select string_agg(x ->> ''name'', '','') from jsonb_array_elements(public.network_page(p_search => ''%'') -> ''rows'') x');
    r := r || pg_temp.t_n('select string_agg(x ->> ''name'', '','') from jsonb_array_elements(public.network_page(p_search => ''_'') -> ''rows'') x');
    r := r || pg_temp.t_n('select string_agg(x ->> ''name'', '','') from jsonb_array_elements(public.network_page(p_search => ''\'') -> ''rows'') x');
    r := r || pg_temp.t_n(format('select public.network_page(p_search => %L) ->> ''total''', repeat('x', 100000)));
    f := f || pg_temp.t_eq('B2c a search for %, _ or \ finds only what holds it; a search of 100,000 characters answers', array_to_string(r, '/'), '100% Sure Ltd/Under_Score/Back\slash/0');
    delete from public.network_people where name in ('100% Sure Ltd', 'Under_Score', 'Back\slash');

    -- B3. Odd values.
    r := '{}';
    r := r || pg_temp.t_rows(format('insert into public.network_people (coach_id, name, influence) values (%L, ''Eleven'', 11)', own_c));
    r := r || pg_temp.t_rows(format('insert into public.network_people (coach_id, name, trust) values (%L, ''Minus'', -1)', own_c));
    r := r || pg_temp.t_rows(format('insert into public.network_people (coach_id, name, trust) values (%L, ''Ten and a half'', 10.5)', own_c));
    r := r || pg_temp.t_rows(format('insert into public.network_people (coach_id, name, trust) values (%L, ''Nine and a half'', 9.5)', own_c));
    r := r || (select coalesce(trust::text, 'none') from public.network_people where name = 'Nine and a half');
    r := r || pg_temp.t_rows(format('insert into public.network_people (coach_id, name, rhythm_months) values (%L, ''Never'', 0)', own_c));
    r := r || pg_temp.t_rows(format('insert into public.network_people (coach_id, name) values (%L, %L)', own_c, repeat('N', 300)));
    r := r || pg_temp.t_rows(format('insert into public.network_people (coach_id, name) values (%L, ''    '')', own_c));
    f := f || pg_temp.t_eq('B3a Network: 11, -1 and 10.5 refused (9.5 is rounded to 10 by the database), a rhythm of 0, a 300-character name and a name of spaces refused', array_to_string(r, '/'),
      'error 23514/error 23514/error 23514/1/10/error 23514/error 23514/error 23514');
    delete from public.network_people where name = 'Nine and a half';
    v := pg_temp.t_rows(format('insert into public.network_people (coach_id, name) values (%L, %L)', own_c, E'​​'));
    if v = '1' then
      raise notice '052 BREAK-IT NOTE: a Network name of only unseen characters (zero-width spaces) is kept by the database; the pages clean names before saving.';
      delete from public.network_people where coach_id = own_c and btrim(name, E'​') = '';
    end if;
    r := '{}';
    r := r || pg_temp.t_n('select public.network_import(''[{"name":"Rated eleven","influence":11}]'') ->> ''added''');
    r := r || pg_temp.t_n('select public.network_import(''[{"name":"Rated high","trust":"high"}]'') ->> ''added''');
    r := r || pg_temp.t_n('select public.network_import(''[{"name":"   "},{"name":""},{"name":null},{"name":"Kept"}]'') ->> ''added''');
    r := r || pg_temp.t_n(format('select public.network_import(%L) ->> ''added''', (select jsonb_agg(jsonb_build_object('name', 'Bulk ' || i)) from generate_series(1, 5001) i)));
    r := r || (select count(*)::text from public.network_people where name like 'Bulk %' or name like 'Rated %');
    f := f || pg_temp.t_eq('B3b an import with a rating of 11 or "high" is refused whole (the page clears them first); blank names are left out; 5,001 rows at once refused', array_to_string(r, '/'),
      'error 23514/error 22P02/1/error 22023/0');
    t0 := clock_timestamp();
    v := pg_temp.t_n(format('select public.network_import(%L) ->> ''added''', (select jsonb_agg(jsonb_build_object('name', 'Bulk ' || i, 'organisation', 'Org ' || (i % 40), 'influence', i % 11)) from generate_series(1, 5000) i)));
    f := f || pg_temp.t_eq('B3c 5,000 rows at once are added in one go, in under 5 seconds on the stand-in', concat_ws('/', v, (extract(epoch from clock_timestamp() - t0) < 5)::text), '5000/true');
    raise notice '052 BREAK-IT: 5,000 Network people imported in % ms', round(extract(epoch from clock_timestamp() - t0) * 1000);
    delete from public.network_people where name like 'Bulk %' or name = 'Kept';

    r := '{}';
    r := r || replace(replace(pg_temp.t_rows(format('update public.coach_leads set value = 1e12 where id = %L', l_c)), 'error 22003', 'refused'), 'error 23514', 'refused');
    r := r || pg_temp.t_rows(format('update public.coach_leads set value = 100000000 where id = %L', l_c));
    r := r || pg_temp.t_rows(format('update public.coach_leads set name = %L where id = %L', repeat('L', 300), l_c));
    r := r || pg_temp.t_rows(format('update public.coach_leads set name = ''   '' where id = %L', l_c));
    r := r || pg_temp.t_rows(format('update public.coach_leads set name = ''C. Doyle'', value = null where id = %L', l_c));
    f := f || pg_temp.t_eq('B3d a lead: a value of 1e12 refused (100,000,000 is the most), a 300-character name and a name of spaces refused', array_to_string(r, '/'),
      'refused/1/error 23514/error 23514/1');

    insert into public.coach_lead_stages (coach_id, name, likelihood, position) select own_c, 'Stage ' || i, i, 10 + i from generate_series(1, 60) i;
    f := f || pg_temp.t_eq('B3e 60 stages are kept, Won still last', concat_ws('/', (select count(*) from public.coach_lead_stages),
      (select name from public.coach_lead_stages order by position desc limit 1)), '65/Won');
    -- An automation naming a stage, and the stage deleted.
    insert into public.coach_lead_stages (id, coach_id, name, likelihood, position) values (st_x, own_c, 'Verbal yes', 85, 5);
    insert into public.coach_automations (id, coach_id, trigger, trigger_stage_id, action, todo_title, todo_days) values (a1, own_c, 'lead_stage', st_x, 'todo', 'Send the agreement', 1);
    insert into public.coach_automations (coach_id, trigger, trigger_stage_id, action, to_stage_id) values (own_c, 'lead_stage', st_dec, 'stage', st_x);
    delete from public.coach_lead_stages where name like 'Stage %' or id = st_x;
    f := f || pg_temp.t_eq('B3f deleting a stage takes the automations that name it with it (nothing left pointing at nothing)', concat_ws('/',
      (select count(*) from public.coach_automations), (select count(*) from public.coach_lead_stages)), '0/5');
    r := '{}';
    r := r || pg_temp.t_rows(format('insert into public.coach_automations (coach_id, trigger, action, todo_title) values (%L, ''lead_won'', ''todo'', %L)', own_c, repeat('T', 5000)));
    r := r || pg_temp.t_rows(format('insert into public.coach_automations (coach_id, trigger, action, todo_title) select %L, ''lead_won'', ''todo'', ''Thank them '' || i from generate_series(1, 200) i', own_c));
    r := r || pg_temp.t_rows(format('insert into public.coach_automations (coach_id, trigger, trigger_stage_id, action, to_stage_id) values (%L, ''lead_stage'', %L, ''stage'', %L)', own_c, st_dec, st_dec));
    r := r || pg_temp.t_rows(format('insert into public.coach_automations (coach_id, trigger, action, to_stage_id) values (%L, ''lead_won'', ''stage'', %L)', own_c, gen_random_uuid()));
    f := f || pg_temp.t_eq('B3g a to-do title of 5,000 characters refused; 200 automations kept; one moving a stage to itself, or to a stage that isn''t there, refused', array_to_string(r, '/'),
      'error 23514/200/error 23514/error 23514');
    delete from public.coach_automations;
    r := '{}';
    r := r || pg_temp.t_rows(format('insert into public.network_columns (coach_id, name, position) select %L, ''Column '' || i, i from generate_series(1, 200) i', own_c));
    r := r || pg_temp.t_rows(format('insert into public.network_columns (coach_id, name) values (%L, ''Name'')', own_c));
    r := r || pg_temp.t_rows(format('insert into public.network_columns (coach_id, name) values (%L, %L)', own_c, repeat('C', 61)));
    f := f || pg_temp.t_eq('B3h 200 own columns kept (no limit); a 61-character name refused', array_to_string(r, '/'), '200/1/error 23514');
    raise notice '052 BREAK-IT NOTE: the database keeps an own column called "Name" (a built-in''s name); the page refuses it (columnProblem).';
    delete from public.network_columns where coach_id = own_c;

    -- B4. Merges.
    m1 := public.lead_merge(l_b, l_a, '{}'::jsonb);     -- A into B
    m2 := public.lead_merge(l_c, l_b, '{}'::jsonb);     -- then B into C
    f := f || pg_temp.t_eq('B4a A into B then B into C: every line ends on C, A and B are merged away', concat_ws('/',
      (select string_agg(title, ',' order by title) from public.coach_lead_events where lead_id = l_c),
      (select (merged_into = l_b)::text from public.coach_leads where id = l_a), (select (merged_into = l_c)::text from public.coach_leads where id = l_b),
      (select email || ' ' || value from public.coach_leads where id = l_c)), 'A call,B note,C note/true/true/chris.break@example.invalid 2000.00');
    f := f || pg_temp.t_eq('B4b a lead already merged away can''t be merged again, either way', concat_ws('/',
      pg_temp.t_no(format('select public.lead_merge(%L, %L)', l_c, l_a)), pg_temp.t_no(format('select public.lead_merge(%L, %L)', l_a, l_c))), 'refused/refused');
    perform public.lead_unmerge(m2);
    perform public.lead_unmerge(m1);
    f := f || pg_temp.t_eq('B4c undone in turn, all three are exactly as before', concat_ws('/',
      (select string_agg(l.name || ':' || coalesce(l.email, '-') || ':' || coalesce(l.value::text, '-') || ':' || coalesce(l.merged_into::text, 'open') || ':' ||
        (select coalesce(string_agg(e.title, ',' order by e.title), '') from public.coach_lead_events e where e.lead_id = l.id), ' | ' order by l.name)
       from public.coach_leads l where l.id in (l_a, l_b, l_c))),
      'C. Doyle:-:-:open:C note | Chris Doyle:chris.break@example.invalid:1000.00:open:A call | Christopher Doyle:-:2000.00:open:B note');
    f := f || pg_temp.t_eq('B4d a merge undone twice: the second is refused, nothing moves', concat_ws('/', pg_temp.t_no(format('select public.lead_unmerge(%L)', m1)),
      (select count(*) from public.coach_lead_events where lead_id = l_a)), 'refused/1');
    -- A won lead merged away: where does the client's carried timeline go?
    m3 := public.lead_merge(l_o, l_w, '{}'::jsonb);
    j := jsonb_build_object(
      'kept_won', (select won_profile_id is not null from public.coach_leads where id = l_o),
      'carried', (select count(*) from public.coach_lead_events e join public.coach_leads l on l.id = e.lead_id where l.won_profile_id = p_won));
    if (j ->> 'kept_won')::boolean is not true then
      raise notice '052 BREAK-IT NOTE: a won lead merged into an open one leaves its client behind: the kept lead isn''t won, and the client''s page carries % of 2 timeline lines (lead_merge keeps won_at and won_profile_id on the lead merged away). The page now keeps the won lead (crm.js mergePair).', j ->> 'carried';
    end if;
    perform public.lead_unmerge(m3);
    f := f || pg_temp.t_eq('B4e and Undo puts the won lead back with its client''s timeline', (select count(*)::text from public.coach_lead_events e join public.coach_leads l on l.id = e.lead_id where l.won_profile_id = p_won), '2');
    m3 := public.lead_merge(l_w, l_o, '{}'::jsonb);
    f := f || pg_temp.t_eq('B4f merged the other way (the won lead kept), the client keeps every line, the other''s too', concat_ws('/',
      (select count(*) from public.coach_lead_events e join public.coach_leads l on l.id = e.lead_id where l.won_profile_id = p_won),
      (select (stage_id = st_won and won_at is not null)::text from public.coach_leads where id = l_w)), '2/true');
    perform public.lead_unmerge(m3);

    -- Network: P into Q, then Q into R; undone in turn.
    nm1 := public.network_merge(n_q, n_p, '{}'::jsonb);
    nm2 := public.network_merge(n_r, n_q, '{}'::jsonb);
    f := f || pg_temp.t_eq('B4g Network: P into Q into R: every give and ask on R, its blanks filled', concat_ws('/',
      (select given_count || ' ' || asked_count || ' ' || coalesce(trust::text, '-') || ' ' || coalesce(rhythm_months::text, '-') from public.network_people where id = n_r),
      (select count(*) from public.network_people where merged_into is not null and id in (n_p, n_q))), '2 1 5 6/2');
    f := f || pg_temp.t_eq('B4h a person merged away can''t be merged again', pg_temp.t_no(format('select public.network_merge(%L, %L)', n_r, n_p)), 'refused');
    perform public.network_unmerge(nm2);
    perform public.network_unmerge(nm1);
    f := f || pg_temp.t_eq('B4i undone in turn, all three are as before (gives, asks, ratings, rhythm)', (select string_agg(name || ':' || given_count || asked_count || ':' || coalesce(trust::text, '-') || ':' || coalesce(rhythm_months::text, '-') || ':' || coalesce(merged_into::text, 'open'), ' | ' order by name)
      from public.network_people where id in (n_p, n_q, n_r)), 'D. Reid:10:-:-:open | Dan Reid:10:9:3:open | Daniel Reid:01:5:6:open');
    f := f || pg_temp.t_eq('B4j a Network merge undone twice is refused', pg_temp.t_no(format('select public.network_unmerge(%L)', nm1)), 'refused');

    perform pg_temp.t_admin();
    raise exception 'undo the test rows' using errcode = 'P0052';
  exception when sqlstate 'P0052' then
    perform pg_temp.t_admin();
  end;

  f := f || pg_temp.t_eq('B9 everything the probes made is undone', (select concat_ws('/', (select count(*) from auth.users where email like 'p6a-break-%@example.invalid'),
    (select count(*) from public.network_people where name in ('Dan Reid', 'Daniel Reid', 'D. Reid')), (select count(*) from public.client_profiles where name = 'Leo Grant' and email = 'leo.break@example.invalid'))), '0/0/0');

  if cardinality(f) > 0 then
    raise exception E'052 BREAK-IT FAILED (%):\n%', cardinality(f), array_to_string(f, E'\n');
  end if;
  raise notice '052 BREAK-IT CHECKS PASSED';
end
$t$;
