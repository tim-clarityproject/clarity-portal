-- =============================================================================
-- 035_guest_links_test.sql
-- Checks 035_guest_links.sql. RUN ORDER: 026 to 035, then this.
--
-- WHAT IT DOES
--   Makes invented people (the owner coach, a second coach, a client, a
--   stranger, and guests with no account) and checks guest links from end
--   to end: making a link, opening it, wrong codes and the lock, closed
--   links, saving and reading a guest's own rows, earlier work only after
--   the email is confirmed, coming back without a link, what each coach
--   sees, claiming into an account, deleting, keeping for 2 years, and Send
--   to client. Everything it makes is undone at the end.
--
--   It ends with the notice ALL CHECKS PASSED, or stops with FAILED and a
--   list naming each check that failed.
-- =============================================================================

-- ---------------------------------------------------------------- helpers
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
create or replace function pg_temp.t_service() returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  perform set_config('role', 'service_role', true);
end $f$;
create or replace function pg_temp.t_admin() returns void language plpgsql as $f$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
end $f$;
create or replace function pg_temp.t_user(p_label text, p_email text default null, p_confirmed boolean default true) returns uuid language plpgsql as $f$
declare u uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, aud, role, email_confirmed_at)
  values (u, coalesce(p_email, 'p5-test-' || p_label || '-' || u || '@example.invalid'), 'authenticated', 'authenticated',
          case when p_confirmed then now() end);
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
create or replace function pg_temp.t_eq(p_name text, p_got text, p_want text) returns text[] language sql as $f$
  select case when p_got is distinct from p_want
              then array[format('%s: expected %s, got %s', p_name, p_want, coalesce(p_got, 'nothing'))]
              else '{}'::text[] end;
$f$;
-- the token part of a link path
create or replace function pg_temp.t_tok(j jsonb) returns text language sql as $f$ select substr(j ->> 'link_path', 8) $f$;

-- ---------------------------------------------------------------- the checks
do $t$
declare
  f text[] := '{}';
  owner_u uuid; coach2 uuid; client_u uuid; stranger uuid; acct_b uuid; acct_unconf uuid; acct_plan uuid;
  owner_c uuid; coach2_c uuid;
  l1 jsonb; l2 jsonb; l3 jsonb; l4 jsonb; l5 jsonb; l6 jsonb;
  va text; va2 text; vb text; vr text; vx text; vc text; vz text;
  d1 jsonb; d2 jsonb; plan_b jsonb; strat_b jsonb; obj_b jsonb; hab_b jsonb; plan_c jsonb;
  j jsonb; code text; n_before integer; n_after integer;
  sug uuid;
begin
  begin
    owner_u := pg_temp.t_user('owner'); coach2 := pg_temp.t_user('coach'); client_u := pg_temp.t_user('client'); stranger := pg_temp.t_user('stranger');
    insert into public.coaches (user_id, role, display_first_name) values (owner_u, 'owner', 'Alex') returning id into owner_c;
    insert into public.coaches (user_id, role, display_first_name) values (coach2, 'coach', 'Priya') returning id into coach2_c;
    insert into public.coach_clients (client_id, coach_id) values (client_u, owner_c);

    -- ------------------------------------------------ 1. making a link
    perform pg_temp.t_as(owner_u);
    l1 := public.guest_link_create('grow');
    f := f || pg_temp.t_eq('1a the link is 32 random bytes', length(pg_temp.t_tok(l1))::text, '64');
    f := f || pg_temp.t_eq('1b the code is 6 characters', ((l1 ->> 'code') ~ '^[A-HJ-NP-Z2-9]{6}$')::text, 'true');
    f := f || pg_temp.t_eq('1c it lasts 30 days', ((l1 ->> 'expires_at')::timestamptz - now() between interval '29 days 23 hours' and interval '30 days 1 minute')::text, 'true');
    f := f || pg_temp.t_eq('1d a coach can''t read the links table', pg_temp.t_n('select count(*) from public.guest_links'), 'error 42501');
    perform pg_temp.t_admin();
    f := f || pg_temp.t_eq('1e only the token''s hash is kept', pg_temp.t_n(format('select count(*) from public.guest_links where token_hash = %L or code_hash = %L', pg_temp.t_tok(l1), l1 ->> 'code')), '0');
    perform pg_temp.t_as(client_u);
    f := f || pg_temp.t_eq('1f a client can''t make a link', pg_temp.t_n('select public.guest_link_create(''grow'') ->> ''code'''), 'error 42501');
    perform pg_temp.t_anon();
    f := f || pg_temp.t_eq('1g nor someone signed out', pg_temp.t_n('select public.guest_link_create(''grow'') ->> ''code'''), 'error 42501');
    perform pg_temp.t_as(owner_u);
    f := f || pg_temp.t_eq('1h a tool with no guest use is refused', pg_temp.t_n('select public.guest_link_create(''journal'') ->> ''code'''), 'error 22023');

    -- ------------------------------------------------ 2. opening it
    perform pg_temp.t_anon();
    j := public.guest_open(pg_temp.t_tok(l1), ' Guest.A@Example.com ', lower(l1 ->> 'code'));
    va := j ->> 'visit';
    f := f || pg_temp.t_eq('2a the guest opens it with email and code', (j ->> 'ok') || ' ' || (j ->> 'tool') || ' ' || (j ->> 'coach_name'), 'true grow Alex');
    f := f || pg_temp.t_eq('2b the visit key is 32 random bytes, kept only hashed', length(va)::text, '64');
    f := f || pg_temp.t_eq('2c signed out can''t read the guest tables', pg_temp.t_n('select (select count(*) from public.guests) + (select count(*) from public.guest_visits)'), 'error 42501');
    f := f || pg_temp.t_eq('2d the link is tied to the first email: another is refused', public.guest_open(pg_temp.t_tok(l1), 'someone.else@example.com', l1 ->> 'code') ->> 'error', 'invalid');
    f := f || pg_temp.t_eq('2e the same email opens it again', public.guest_open(pg_temp.t_tok(l1), 'guest.a@example.com', l1 ->> 'code') ->> 'ok', 'true');
    f := f || pg_temp.t_eq('2f a guessed link: the same answer as a wrong code', public.guest_open(repeat('a', 64), 'guest.a@example.com', l1 ->> 'code') ->> 'error', 'invalid');
    f := f || pg_temp.t_eq('2g a malformed link too', public.guest_open('x', 'guest.a@example.com', 'AAAAAA') ->> 'error', 'invalid');
    perform pg_temp.t_admin();
    f := f || pg_temp.t_eq('2h the email is kept lowercased', pg_temp.t_n('select email from public.guests where email like ''guest.a%'''), 'guest.a@example.com');
    f := f || pg_temp.t_eq('2i no visit key is kept in plain text', pg_temp.t_n(format('select count(*) from public.guest_visits where key_hash = %L', va)), '0');

    -- ------------------------------------------------ 3. wrong codes and the lock
    perform pg_temp.t_as(owner_u);
    l2 := public.guest_link_create('grow');
    perform pg_temp.t_anon();
    for i in 1..4 loop perform public.guest_open(pg_temp.t_tok(l2), 'guest.c@example.com', 'ZZZZZZ'); end loop;
    f := f || pg_temp.t_eq('3a four wrong codes: the right one still opens it', public.guest_open(pg_temp.t_tok(l2), 'guest.c@example.com', l2 ->> 'code') ->> 'ok', 'true');
    for i in 1..5 loop perform public.guest_open(pg_temp.t_tok(l2), 'guest.c@example.com', 'ZZZZZZ'); end loop;
    f := f || pg_temp.t_eq('3b five wrong codes lock it, even for the right code', public.guest_open(pg_temp.t_tok(l2), 'guest.c@example.com', l2 ->> 'code') ->> 'error', 'locked');
    perform pg_temp.t_admin();
    f := f || pg_temp.t_eq('3c every try is recorded with its time', pg_temp.t_n(format('select count(*) from public.guest_link_attempts a join public.guest_links l on l.id = a.link_id where l.id = %L', l2 ->> 'link_id')), '10');
    update public.guest_links set locked_until = now() - interval '1 second' where id = (l2 ->> 'link_id')::uuid;
    perform pg_temp.t_anon();
    f := f || pg_temp.t_eq('3d after 15 minutes the right code opens it again', public.guest_open(pg_temp.t_tok(l2), 'guest.c@example.com', l2 ->> 'code') ->> 'ok', 'true');

    -- ------------------------------------------------ 4. saving and reading their own rows
    perform pg_temp.t_anon();
    d1 := public.guest_save(va, 'decisions', '{"title": "Stuck on hiring", "form_data": {"goal": "Hire two engineers"}, "tool_type": "inversion", "user_id": "00000000-0000-0000-0000-000000000001"}');
    f := f || pg_temp.t_eq('4a a guest saves a GROW: the tool type comes from the link', (d1 ->> 'tool_type') || ' ' || (d1 ->> 'title'), 'grow Stuck on hiring');
    f := f || pg_temp.t_eq('4b ... the owner and guest never come back', (d1 ? 'user_id' or d1 ? 'guest_id')::text, 'false');
    perform pg_temp.t_admin();
    f := f || pg_temp.t_eq('4c ... and the owner is always the guest, whatever was sent', pg_temp.t_n(format('select (user_id is null and guest_id is not null)::text from public.decisions where id = %L', d1 ->> 'id')), 'true');
    perform pg_temp.t_anon();
    f := f || pg_temp.t_eq('4d the guest changes it', public.guest_save(va, 'decisions', jsonb_build_object('id', d1 ->> 'id', 'title', 'Hiring, step 2')) ->> 'title', 'Hiring, step 2');
    f := f || pg_temp.t_eq('4e the guest reads their own rows', jsonb_array_length(public.guest_rows(va, 'decisions'))::text, '1');
    f := f || pg_temp.t_eq('4f a GROW link can''t start a Performance Plan', pg_temp.t_n(format('select public.guest_save(%L, ''performance_plans'', ''{"mission": "x"}'') ->> ''id''', va)), 'error 42501');
    f := f || pg_temp.t_eq('4g a table that isn''t a guest table is refused', pg_temp.t_n(format('select public.guest_save(%L, ''profiles'', ''{}'') ->> ''id''', va)), 'error 22023');
    f := f || pg_temp.t_eq('4h a made-up visit key is refused', pg_temp.t_n(format('select public.guest_rows(%L, ''decisions'')', repeat('b', 64))), 'error 42501');
    f := f || pg_temp.t_eq('4i signed out can''t read decisions directly', pg_temp.t_n('select count(*) from public.decisions where guest_id is not null'), case when has_table_privilege('anon', 'public.decisions', 'select') then '0' else 'error 42501' end);
    perform pg_temp.t_as(stranger);
    f := f || pg_temp.t_eq('4j nor a signed-in stranger', pg_temp.t_n('select count(*) from public.decisions where guest_id is not null'), '0');
    perform pg_temp.t_admin();
    f := f || pg_temp.t_eq('4k a row has exactly one owner', pg_temp.t_n('insert into public.decisions (tool_type) values (''grow'') returning 1'), 'error 23514');

    -- ------------------------------------------------ 5. the Performance Plan, and another guest
    perform pg_temp.t_as(coach2);
    l3 := public.guest_link_create('performance-plan');
    perform pg_temp.t_anon();
    vb := public.guest_open(pg_temp.t_tok(l3), 'guest.b@example.com', l3 ->> 'code') ->> 'visit';
    plan_b := public.guest_save(vb, 'performance_plans', '{"mission": "Lead a calm, fast team"}');
    strat_b := public.guest_save(vb, 'plan_strategies', jsonb_build_object('plan_id', plan_b ->> 'id', 'name', 'Hire well'));
    obj_b := public.guest_save(vb, 'outcome_objectives', jsonb_build_object('plan_id', plan_b ->> 'id', 'name', 'Revenue', 'kind', 'number', 'start_value', 1, 'target_value', 2, 'by_when', '2027-06-30', 'source', 'organisation', 'confirmed_by', owner_u));
    perform public.guest_save(vb, 'strategy_objectives', jsonb_build_object('strategy_id', strat_b ->> 'id', 'objective_id', obj_b ->> 'id'));
    hab_b := public.guest_save(vb, 'habits', jsonb_build_object('plan_id', plan_b ->> 'id', 'strategy_id', strat_b ->> 'id', 'name', 'Weekly one-to-ones', 'measure', 'yes_no_weekly'));
    f := f || pg_temp.t_eq('5a a guest builds a plan: mission, Strategy, objective, link and tactic', (select string_agg(t || '=' || jsonb_array_length(public.guest_rows(vb, t)), ',' order by t) from unnest(array['habits', 'outcome_objectives', 'performance_plans', 'plan_strategies', 'strategy_objectives']) t),
      'habits=1,outcome_objectives=1,performance_plans=1,plan_strategies=1,strategy_objectives=1');
    f := f || pg_temp.t_eq('5b a guest can''t set an organisation objective or a sponsor''s confirmation', (obj_b ->> 'source') || ' ' || coalesce(obj_b ->> 'confirmed_by', 'none'), 'own none');
    f := f || pg_temp.t_eq('5c a plan link can''t start a GROW', pg_temp.t_n(format('select public.guest_save(%L, ''decisions'', ''{"title": "x"}'') ->> ''id''', vb)), 'error 42501');
    f := f || pg_temp.t_eq('5d guest B can''t read guest A''s rows', jsonb_array_length(public.guest_rows(vb, 'decisions'))::text, '0');
    f := f || pg_temp.t_eq('5e ... or change them', pg_temp.t_n(format('select public.guest_save(%L, ''decisions'', %L) ->> ''id''', vb, jsonb_build_object('id', d1 ->> 'id', 'title', 'taken'))), 'error 42501');
    f := f || pg_temp.t_eq('5f ... or delete them', pg_temp.t_n(format('select public.guest_delete(%L, ''decisions'', %L)', vb, jsonb_build_object('id', d1 ->> 'id'))), 'error 42501');
    f := f || pg_temp.t_eq('5g guest A can''t hang a Strategy off guest B''s plan', pg_temp.t_n(format('select public.guest_save(%L, ''plan_strategies'', %L) ->> ''id''', va, jsonb_build_object('plan_id', plan_b ->> 'id', 'name', 'x'))), 'error 42501');
    perform pg_temp.t_admin();
    insert into public.decisions (user_id, tool_type, title) values (client_u, 'grow', 'The client''s own') returning to_jsonb(decisions) into j;
    perform pg_temp.t_anon();
    f := f || pg_temp.t_eq('5h ... or take over an account''s row by its id', pg_temp.t_n(format('select public.guest_save(%L, ''decisions'', %L) ->> ''id''', va,
      jsonb_build_object('id', j ->> 'id', 'title', 'taken'))), 'error 42501');

    -- ------------------------------------------------ 6. closed links
    perform pg_temp.t_as(owner_u);
    l4 := public.guest_link_create('give-feedback');
    perform pg_temp.t_anon();
    vx := public.guest_open(pg_temp.t_tok(l4), 'guest.a@example.com', l4 ->> 'code') ->> 'visit';
    perform pg_temp.t_as(coach2);
    f := f || pg_temp.t_eq('6a another coach can''t switch a link off', pg_temp.t_n(format('select public.guest_link_switch_off(%L)', l4 ->> 'link_id')), 'error 42501');
    perform pg_temp.t_as(owner_u);
    perform public.guest_link_switch_off((l4 ->> 'link_id')::uuid);
    perform pg_temp.t_anon();
    f := f || pg_temp.t_eq('6b a switched-off link refuses', public.guest_open(pg_temp.t_tok(l4), 'guest.a@example.com', l4 ->> 'code') ->> 'error', 'closed');
    f := f || pg_temp.t_eq('6c ... and so does a visit not yet confirmed', pg_temp.t_n(format('select public.guest_rows(%L, ''decisions'')', vx)), 'error 42501');
    perform pg_temp.t_admin();
    update public.guest_links set expires_at = now() - interval '1 second' where id = (l2 ->> 'link_id')::uuid;
    perform pg_temp.t_anon();
    f := f || pg_temp.t_eq('6d an expired link refuses', public.guest_open(pg_temp.t_tok(l2), 'guest.c@example.com', l2 ->> 'code') ->> 'error', 'closed');
    f := f || pg_temp.t_eq('6e a closed link still needs the right code to say so', public.guest_open(pg_temp.t_tok(l2), 'guest.c@example.com', 'ZZZZZZ') ->> 'error', 'invalid');

    -- ------------------------------------------------ 7. earlier work needs the email confirmed
    perform pg_temp.t_as(owner_u);
    l5 := public.guest_link_create('grow');
    perform pg_temp.t_anon();
    va2 := public.guest_open(pg_temp.t_tok(l5), 'guest.a@example.com', l5 ->> 'code') ->> 'visit';
    f := f || pg_temp.t_eq('7a a new link starts fresh: no earlier work shows', jsonb_array_length(public.guest_rows(va2, 'decisions'))::text, '0');
    d2 := public.guest_save(va2, 'decisions', '{"title": "Second GROW"}');
    f := f || pg_temp.t_eq('7b ... new work saves without confirming', jsonb_array_length(public.guest_rows(va2, 'decisions'))::text, '1');
    f := f || pg_temp.t_eq('7c ... earlier work can''t be changed', pg_temp.t_n(format('select public.guest_save(%L, ''decisions'', %L) ->> ''id''', va2, jsonb_build_object('id', d1 ->> 'id', 'title', 'x'))), 'error 42501');
    f := f || pg_temp.t_eq('7d signed out can''t ask for the email code', pg_temp.t_n(format('select public.guest_email_code_issue(%L) ->> ''code''', va2)), 'error 42501');
    perform pg_temp.t_service();
    j := public.guest_email_code_issue(va2);
    code := j ->> 'code';
    f := f || pg_temp.t_eq('7e the server gets a 6-digit code and the email to send it to', (code ~ '^[0-9]{6}$')::text || ' ' || (j ->> 'email'), 'true guest.a@example.com');
    perform pg_temp.t_admin();
    f := f || pg_temp.t_eq('7f the code is kept only hashed', pg_temp.t_n(format('select count(*) from public.guest_email_codes where code_hash = %L', code)), '0');
    perform pg_temp.t_anon();
    f := f || pg_temp.t_eq('7g a wrong code is refused', public.guest_email_confirm(va2, case when code = '000000' then '111111' else '000000' end) ->> 'error', 'invalid');
    f := f || pg_temp.t_eq('7h the right code confirms the email', public.guest_email_confirm(va2, code) ->> 'ok', 'true');
    f := f || pg_temp.t_eq('7i ... and earlier work shows', jsonb_array_length(public.guest_rows(va2, 'decisions'))::text, '2');
    f := f || pg_temp.t_eq('7j ... and can be changed', public.guest_save(va2, 'decisions', jsonb_build_object('id', d1 ->> 'id', 'title', 'Hiring, step 3')) ->> 'title', 'Hiring, step 3');
    f := f || pg_temp.t_eq('7k a used code doesn''t work twice', public.guest_email_confirm(va, code) ->> 'error', 'invalid');
    -- five wrong tries end a code
    vc := public.guest_open(pg_temp.t_tok(l1), 'guest.a@example.com', l1 ->> 'code') ->> 'visit';
    perform pg_temp.t_service();
    code := public.guest_email_code_issue(vc) ->> 'code';
    perform pg_temp.t_anon();
    for i in 1..5 loop perform public.guest_email_confirm(vc, case when code = '000000' then '111111' else '000000' end); end loop;
    f := f || pg_temp.t_eq('7l five wrong tries: the right code no longer works', public.guest_email_confirm(vc, code) ->> 'error', 'invalid');
    perform pg_temp.t_admin();
    update public.guest_email_codes set created_at = now() - interval '11 minutes', expires_at = now() - interval '1 minute'
     where visit_id = (select id from public.guest_visits where key_hash = public._guest_hash(vc));
    perform pg_temp.t_service();
    code := public.guest_email_code_issue(vc) ->> 'code';
    perform pg_temp.t_admin();
    update public.guest_email_codes set expires_at = now() - interval '1 second'
     where visit_id = (select id from public.guest_visits where key_hash = public._guest_hash(vc)) and used_at is null;
    perform pg_temp.t_anon();
    f := f || pg_temp.t_eq('7m a code more than 10 minutes old doesn''t work', public.guest_email_confirm(vc, code) ->> 'error', 'invalid');

    -- an account can't hand its own row to a guest
    perform pg_temp.t_as(client_u);
    f := f || pg_temp.t_eq('7n an account can''t hand its row to a guest', pg_temp.t_n(format('update public.decisions set guest_id = (select guest_id from public.decisions where id = %L), user_id = null where user_id = %L', d1 ->> 'id', client_u)), 'error 42501');
    f := f || pg_temp.t_eq('7o ... or give its row a second owner', pg_temp.t_n(format('update public.decisions set guest_id = %L where user_id = %L returning 1', gen_random_uuid(), client_u)), 'error 23514');
    -- ten codes a day at most for one email
    perform pg_temp.t_service();
    for i in 1..25 loop
      perform public.guest_email_code_issue(public.guest_return_start('guest.a@example.com') ->> 'visit');
    end loop;
    perform pg_temp.t_admin();
    f := f || pg_temp.t_eq('7p at most 20 email codes an hour for one email', pg_temp.t_n('select count(*) <= 20 from public.guest_email_codes c join public.guests g on g.id = c.guest_id where g.email = ''guest.a@example.com'' and c.created_at > now() - interval ''1 hour'''), 'true');
    delete from public.guest_email_codes where guest_id = (select id from public.guests where email = 'guest.a@example.com');
    delete from public.guest_visits where guest_id = (select id from public.guests where email = 'guest.a@example.com') and link_id is null;

    -- ------------------------------------------------ 8. coming back without a link
    perform pg_temp.t_anon();
    vr := public.guest_return_start('GUEST.A@example.com') ->> 'visit';
    f := f || pg_temp.t_eq('8a an unknown email gets the same answer', (select string_agg(k, ',' order by k) from jsonb_object_keys(public.guest_return_start('nobody@example.com')) k), 'confirmed,ok,visit');
    perform pg_temp.t_service();
    f := f || pg_temp.t_eq('8b ... but no code is sent for it', public.guest_email_code_issue(public.guest_return_start('nobody@example.com') ->> 'visit') ->> 'ok', 'false');
    code := public.guest_email_code_issue(vr) ->> 'code';
    perform pg_temp.t_anon();
    f := f || pg_temp.t_eq('8c before confirming: nothing shows', jsonb_array_length(public.guest_rows(vr, 'decisions'))::text, '0');
    perform public.guest_email_confirm(vr, code);
    f := f || pg_temp.t_eq('8d after confirming: their work shows, even from a closed link', jsonb_array_length(public.guest_rows(vr, 'decisions'))::text, '2');
    f := f || pg_temp.t_eq('8e ... and can be changed', public.guest_save(vr, 'decisions', jsonb_build_object('id', d2 ->> 'id', 'title', 'Second GROW, done')) ->> 'title', 'Second GROW, done');
    f := f || pg_temp.t_eq('8f ... but new work needs a link', pg_temp.t_n(format('select public.guest_save(%L, ''decisions'', ''{"title": "x"}'') ->> ''id''', vr)), 'error 42501');
    f := f || pg_temp.t_eq('8g each row says which link, tool and coach it came from', (select string_agg(distinct (x -> '_from' ->> 'tool') || ' ' || (x -> '_from' ->> 'coach_first_name'), ',') from jsonb_array_elements(public.guest_rows(vr, 'decisions')) x), 'grow Alex');
    f := f || pg_temp.t_eq('8h the guest lists their links once confirmed', jsonb_array_length(public.guest_my_links(vr))::text, '3');
    f := f || pg_temp.t_eq('8i ... only this visit''s link before', jsonb_array_length(public.guest_my_links(va))::text, '1');

    -- twenty wrong codes in a day: no more codes for that email today
    perform pg_temp.t_admin();
    update public.guest_email_codes set tries = 20 where id = (select id from public.guest_email_codes where guest_id = (select id from public.guests where email = 'guest.a@example.com') order by created_at desc limit 1);
    perform pg_temp.t_anon();
    vx := public.guest_return_start('guest.a@example.com') ->> 'visit';
    f := f || pg_temp.t_eq('8j twenty wrong codes in a day: confirming waits until tomorrow', public.guest_email_confirm(vx, '123456') ->> 'error', 'locked');
    perform pg_temp.t_service();
    f := f || pg_temp.t_eq('8k ... and no new code is sent', public.guest_email_code_issue(vx) ->> 'ok', 'false');
    perform pg_temp.t_admin();
    delete from public.guest_email_codes where guest_id = (select id from public.guests where email = 'guest.a@example.com');

    -- ------------------------------------------------ 9. what each coach sees
    perform pg_temp.t_as(owner_u);
    f := f || pg_temp.t_eq('9a the owner lists every guest', pg_temp.t_n('select count(*) from public.coach_guests()'), '3');
    f := f || pg_temp.t_eq('9b ... and every link', pg_temp.t_n('select count(*) from public.coach_links()'), '5');
    f := f || pg_temp.t_eq('9c ... or one coach''s', pg_temp.t_n(format('select count(*) from public.coach_guests(%L)', coach2)), '1');
    f := f || pg_temp.t_eq('9d the owner reads the answers to their own link', pg_temp.t_n(format('select jsonb_array_length(public.coach_guest_answers(%L) -> ''decisions'')', l1 ->> 'link_id')), '1');
    f := f || pg_temp.t_eq('9e ... but not to another coach''s', pg_temp.t_n(format('select public.coach_guest_answers(%L)', l3 ->> 'link_id')), 'error 42501');
    f := f || pg_temp.t_eq('9f no list ever holds a token or code', pg_temp.t_n(format('select ((select jsonb_agg(c)::text from public.coach_links() c) || (select jsonb_agg(g)::text from public.coach_guests() g)) ~ %L',
      pg_temp.t_tok(l1) || '|' || (l1 ->> 'code') || '|' || pg_temp.t_tok(l3))), 'false');
    perform pg_temp.t_as(coach2);
    f := f || pg_temp.t_eq('9g a coach lists only their own guests', pg_temp.t_n('select string_agg(email, '','') from public.coach_guests()'), 'guest.b@example.com');
    f := f || pg_temp.t_eq('9h ... and links', pg_temp.t_n('select count(*) from public.coach_links()'), '1');
    f := f || pg_temp.t_eq('9i ... can''t ask for another coach''s', pg_temp.t_n(format('select count(*) from public.coach_guests(%L)', owner_u)), 'error 42501');
    f := f || pg_temp.t_eq('9j ... reads their own guest''s plan', pg_temp.t_n(format('select jsonb_array_length(public.coach_guest_answers(%L) -> ''habits'')', l3 ->> 'link_id')), '1');
    -- guest B comes back without the link, confirms, and adds a Strategy: it counts under the plan's link
    perform pg_temp.t_anon();
    vx := public.guest_return_start('guest.b@example.com') ->> 'visit';
    perform pg_temp.t_service();
    code := public.guest_email_code_issue(vx) ->> 'code';
    perform pg_temp.t_anon();
    perform public.guest_email_confirm(vx, code);
    perform public.guest_save(vx, 'plan_strategies', jsonb_build_object('plan_id', plan_b ->> 'id', 'name', 'Added later'));
    perform pg_temp.t_as(coach2);
    f := f || pg_temp.t_eq('9q work added when coming back counts under its link', pg_temp.t_n(format('select jsonb_array_length(public.coach_guest_answers(%L) -> ''plan_strategies'')', l3 ->> 'link_id')), '2');
    perform pg_temp.t_anon();
    f := f || pg_temp.t_eq('9r a value the table can''t take gets one plain message', pg_temp.t_n(format('select public.guest_save(%L, ''habits'', %L) ->> ''id''', vb, jsonb_build_object('plan_id', plan_b ->> 'id', 'strategy_id', strat_b ->> 'id', 'name', 'x', 'measure', 'lots'))), 'error 22023');
    -- a second plan link: a new plan, and the earlier one is kept, archived
    perform pg_temp.t_as(coach2);
    l2 := public.guest_link_create('performance-plan');
    perform pg_temp.t_anon();
    vc := public.guest_open(pg_temp.t_tok(l2), 'guest.b@example.com', l2 ->> 'code') ->> 'visit';
    f := f || pg_temp.t_eq('9s a new plan link can''t replace a plan the visit can''t see', pg_temp.t_n(format('select public.guest_save(%L, ''performance_plans'', ''{"mission": "x"}'') ->> ''id''', vc)), 'error 42501');
    perform pg_temp.t_service();
    code := public.guest_email_code_issue(vc) ->> 'code';
    perform pg_temp.t_anon();
    perform public.guest_email_confirm(vc, code);
    f := f || pg_temp.t_eq('9s2 ... once confirmed, a guest with a plan starts a new one', (public.guest_save(vc, 'performance_plans', '{"mission": "Second plan"}') ->> 'status'), 'active');
    perform pg_temp.t_admin();
    f := f || pg_temp.t_eq('9t ... the earlier one is kept, archived', pg_temp.t_n(format('select status from public.performance_plans where id = %L', plan_b ->> 'id')), 'archived');
    perform pg_temp.t_as(coach2);
    f := f || pg_temp.t_eq('9k ... can''t read another coach''s guest''s answers', pg_temp.t_n(format('select public.coach_guest_answers(%L)', l1 ->> 'link_id')), 'error 42501');
    f := f || pg_temp.t_eq('9l a coach invites their own guest to an account', pg_temp.t_n(format('select public.guest_invite((select guest_id from public.coach_links() limit 1) ) ->> ''email''')), 'guest.b@example.com');
    f := f || pg_temp.t_eq('9m the list shows what was finished', pg_temp.t_n('select bool_or((x ->> ''finished_at'') is not null) from public.coach_guests(), jsonb_array_elements(links) x'), 'false');
    perform pg_temp.t_anon();
    perform public.guest_finish(vb);
    perform pg_temp.t_as(coach2);
    f := f || pg_temp.t_eq('9n ... once the guest finishes', pg_temp.t_n('select bool_or((x ->> ''finished_at'') is not null) from public.coach_guests(), jsonb_array_elements(links) x'), 'true');
    perform pg_temp.t_as(client_u);
    f := f || pg_temp.t_eq('9o a client has no guests', pg_temp.t_n('select count(*) from public.coach_guests()'), 'error 42501');
    perform pg_temp.t_as(owner_u);
    f := f || pg_temp.t_eq('9p a coach can''t invite a guest they never sent a link', pg_temp.t_n(format('select public.guest_invite((select guest_id from public.coach_guests(%L) limit 1))', coach2)), 'error 42501');

    -- ------------------------------------------------ 9b. from the break-it pass
    perform pg_temp.t_anon();
    vx := public.guest_return_start('nobody.here@example.com') ->> 'visit';
    vz := public.guest_return_start('guest.b@example.com') ->> 'visit';
    f := f || pg_temp.t_eq('9u coming back: an email with no work reads the same as one with work', (public.guest_rows(vx, 'decisions')::text = public.guest_rows(vz, 'decisions')::text)::text, 'true');
    f := f || pg_temp.t_eq('9v ... the same list of links', (public.guest_my_links(vx)::text = public.guest_my_links(vz)::text)::text, 'true');
    f := f || pg_temp.t_eq('9w ... the same answer to saving', (pg_temp.t_n(format('select public.guest_save(%L, ''plan_strategies'', ''{"name": "x"}'')', vx)) = pg_temp.t_n(format('select public.guest_save(%L, ''plan_strategies'', ''{"name": "x"}'')', vz)))::text, 'true');
    f := f || pg_temp.t_eq('9x ... and to finishing', (public.guest_finish(vx) = public.guest_finish(vz))::text, 'true');
    j := public.guest_save(vb, 'plan_versions', jsonb_build_object('plan_id', plan_b ->> 'id', 'major', 1, 'minor', 0, 'kind', 'start', 'snapshot', '{}'::jsonb));
    f := f || pg_temp.t_eq('9y plan history is added to', (j ->> 'kind'), 'start');
    f := f || pg_temp.t_eq('9z ... never changed', pg_temp.t_n(format('select public.guest_save(%L, ''plan_versions'', %L)', vb, jsonb_build_object('id', j ->> 'id', 'change_note', 'x'))), 'error 42501');
    f := f || pg_temp.t_eq('9z2 ... or deleted', pg_temp.t_n(format('select public.guest_delete(%L, ''plan_versions'', %L)', vb, jsonb_build_object('id', j ->> 'id'))), 'error 42501');
    f := f || pg_temp.t_eq('9z3 an empty row gets the plain message', pg_temp.t_n(format('select public.guest_save(%L, ''plan_strategies'', ''{}'')', vb)), 'error 22023');
    begin
      perform public.guest_save(vb, 'plan_strategies', jsonb_build_object('plan_id', plan_b ->> 'id', 'name', 'x', 'archived_at', '2026-01-01 00:00:00 Mars/Olympus'));
    exception when others then
      f := f || pg_temp.t_eq('9z4 an odd date gets the plain message', sqlerrm, 'Some of that couldn''t be saved as it is. Check it and try again.');
    end;
    f := f || pg_temp.t_eq('9z5 an email with a space inside is refused', public.guest_open(pg_temp.t_tok(l5), 'guest.a@exam ple.com', l5 ->> 'code') ->> 'error', 'invalid');
    f := f || pg_temp.t_eq('9z6 a tab after the email is the same guest', public.guest_open(pg_temp.t_tok(l1), 'guest.a@example.com' || chr(9), l1 ->> 'code') ->> 'ok', 'true');
    perform pg_temp.t_admin();
    f := f || pg_temp.t_eq('9z7 ... with no second record', pg_temp.t_n('select count(*) from public.guests where email like ''guest.a%'''), '1');
    -- a switched-off link: a confirmed visit edits, but starts nothing new
    perform pg_temp.t_service();
    code := public.guest_email_code_issue(public.guest_open(pg_temp.t_tok(l1), 'guest.a@example.com', l1 ->> 'code') ->> 'visit') ->> 'code';
    perform pg_temp.t_anon();
    vx := public.guest_open(pg_temp.t_tok(l1), 'guest.a@example.com', l1 ->> 'code') ->> 'visit';
    perform pg_temp.t_service();
    code := public.guest_email_code_issue(vx) ->> 'code';
    perform pg_temp.t_anon();
    perform public.guest_email_confirm(vx, code);
    perform pg_temp.t_as(owner_u);
    perform public.guest_link_switch_off((l1 ->> 'link_id')::uuid);
    perform pg_temp.t_anon();
    f := f || pg_temp.t_eq('9z8 a closed link starts no new work, even confirmed', pg_temp.t_n(format('select public.guest_save(%L, ''decisions'', ''{"title": "x"}'')', vx)), 'error 42501');
    f := f || pg_temp.t_eq('9z9 ... but earlier work can still be changed', public.guest_save(vx, 'decisions', jsonb_build_object('id', d1 ->> 'id', 'title', 'Hiring, step 3')) ->> 'title', 'Hiring, step 3');
    -- has_account answers count as wrong tries
    perform pg_temp.t_admin();
    perform pg_temp.t_user('hasacct', 'claimed.person@example.com', true);
    insert into public.guests (email, claimed_at) values ('claimed.person@example.com', now());
    perform pg_temp.t_as(owner_u);
    l4 := public.guest_link_create('grow');
    perform pg_temp.t_anon();
    for i in 1..5 loop perform public.guest_open(pg_temp.t_tok(l4), 'claimed.person@example.com', l4 ->> 'code'); end loop;
    f := f || pg_temp.t_eq('9z10 asking about emails with accounts locks the link too', public.guest_open(pg_temp.t_tok(l4), 'new.person@example.com', l4 ->> 'code') ->> 'error', 'locked');

    -- ------------------------------------------------ 10. deleting
    perform pg_temp.t_anon();
    j := public.guest_save(vb, 'plan_strategies', jsonb_build_object('plan_id', plan_b ->> 'id', 'name', 'To delete'));
    f := f || pg_temp.t_eq('10a a guest deletes one of their rows', public.guest_delete(vb, 'plan_strategies', jsonb_build_object('id', j ->> 'id'))::text, 'true');
    f := f || pg_temp.t_eq('10b ... and only that one', jsonb_array_length(public.guest_rows(vb, 'plan_strategies'))::text, '1');
    -- guest A: link 1 has d1, link 5 has d2
    f := f || pg_temp.t_eq('10c deleting a link''s answers removes that link''s only', public.guest_delete_link_answers(va2)::text, '1');
    f := f || pg_temp.t_eq('10d ... the other link''s work stays', (select string_agg(x ->> 'title', ',') from jsonb_array_elements(public.guest_rows(vr, 'decisions')) x), 'Hiring, step 3');
    f := f || pg_temp.t_eq('10e ... and another guest''s too', jsonb_array_length(public.guest_rows(vb, 'performance_plans'))::text, '1');
    perform pg_temp.t_admin();
    f := f || pg_temp.t_eq('10f nothing is left behind for the deleted rows', pg_temp.t_n(format('select count(*) from public.guest_items where table_name = ''decisions'' and row_key = %L', d2 ->> 'id')), '0');

    -- ------------------------------------------------ 11. claiming into an account
    perform pg_temp.t_admin();
    select count(*) into n_before from (
      select id::text from public.performance_plans where guest_id = (select id from public.guests where email = 'guest.b@example.com')
      union all select id::text from public.plan_strategies where guest_id = (select id from public.guests where email = 'guest.b@example.com')
      union all select id::text from public.outcome_objectives where guest_id = (select id from public.guests where email = 'guest.b@example.com')
      union all select strategy_id::text from public.strategy_objectives where guest_id = (select id from public.guests where email = 'guest.b@example.com')
      union all select id::text from public.habits where guest_id = (select id from public.guests where email = 'guest.b@example.com')
      union all select id::text from public.plan_versions where guest_id = (select id from public.guests where email = 'guest.b@example.com')) x;
    acct_unconf := pg_temp.t_user('unconfirmed', 'guest.b@example.com', false);
    perform pg_temp.t_as(acct_unconf);
    f := f || pg_temp.t_eq('11a an account with the email not yet confirmed claims nothing', public.guest_claim()::text, '0');
    perform pg_temp.t_admin();
    delete from auth.users where id = acct_unconf;
    acct_b := pg_temp.t_user('claimer', 'Guest.B@example.com', true);
    perform pg_temp.t_as(acct_b);
    f := f || pg_temp.t_eq('11b the confirmed account claims every row', public.guest_claim()::text, n_before::text);
    f := f || pg_temp.t_eq('11c ... and claiming again moves nothing', public.guest_claim()::text, '0');
    perform pg_temp.t_admin();
    select count(*) into n_after from (
      select id from public.performance_plans where user_id = acct_b union all select id from public.plan_strategies where user_id = acct_b
      union all select id from public.outcome_objectives where user_id = acct_b union all select strategy_id from public.strategy_objectives where user_id = acct_b
      union all select id from public.habits where user_id = acct_b union all select id from public.plan_versions where user_id = acct_b) x;
    f := f || pg_temp.t_eq('11d every row arrived once, nothing copied', n_after::text, n_before::text);
    f := f || pg_temp.t_eq('11e nothing is left with the guest', pg_temp.t_n('select (select count(*) from public.performance_plans p join public.guests g on g.id = p.guest_id where g.email = ''guest.b@example.com'') + (select count(*) from public.habits h join public.guests g on g.id = h.guest_id where g.email = ''guest.b@example.com'')'), '0');
    f := f || pg_temp.t_eq('11f the guest is marked claimed by the account', pg_temp.t_n(format('select (claimed_by = %L and claimed_at is not null)::text from public.guests where email = ''guest.b@example.com''', acct_b)), 'true');
    perform pg_temp.t_as(acct_b);
    f := f || pg_temp.t_eq('11g the account now reads its plans the normal way', pg_temp.t_n('select string_agg(mission, '','' order by mission) from public.performance_plans'), 'Lead a calm, fast team,Second plan');
    perform pg_temp.t_anon();
    f := f || pg_temp.t_eq('11h the old guest visit stops', pg_temp.t_n(format('select public.guest_rows(%L, ''performance_plans'')', vb)), 'error 42501');
    begin
      perform public.guest_rows(vb, 'performance_plans');
    exception when others then
      f := f || pg_temp.t_eq('11h2 ... and says to sign in', sqlerrm, 'This work has moved into an account. Sign in to see it.');
    end;
    f := f || pg_temp.t_eq('11i the link says to sign in', public.guest_open(pg_temp.t_tok(l3), 'guest.b@example.com', l3 ->> 'code') ->> 'error', 'has_account');
    -- an account that already has an active plan gets the guest's archived
    perform pg_temp.t_as(owner_u);
    l6 := public.guest_link_create('performance-plan');
    perform pg_temp.t_anon();
    vc := public.guest_open(pg_temp.t_tok(l6), 'guest.d@example.com', l6 ->> 'code') ->> 'visit';
    plan_c := public.guest_save(vc, 'performance_plans', '{"mission": "Guest plan"}');
    perform pg_temp.t_admin();
    acct_plan := pg_temp.t_user('hasplan', 'guest.d@example.com', true);
    insert into public.performance_plans (user_id, mission) values (acct_plan, 'Account plan');
    perform pg_temp.t_as(acct_plan);
    perform public.guest_claim();
    f := f || pg_temp.t_eq('11j an account with a plan keeps it; the guest''s comes in archived', pg_temp.t_n('select string_agg(mission || '':'' || status, '','' order by mission) from public.performance_plans'), 'Account plan:active,Guest plan:archived');
    perform pg_temp.t_as(stranger);
    f := f || pg_temp.t_eq('11k someone else claims nothing of theirs', public.guest_claim()::text, '0');

    -- ------------------------------------------------ 12. keeping for 2 years
    perform pg_temp.t_admin();
    update public.guests set last_visit_at = now() - interval '2 years 1 day' where email in ('guest.c@example.com', 'guest.b@example.com');
    perform pg_temp.t_as(coach2);
    f := f || pg_temp.t_eq('12a only the owner can delete old guests', pg_temp.t_n('select public.guest_purge_old()'), 'error 42501');
    perform pg_temp.t_as(owner_u);
    f := f || pg_temp.t_eq('12b old unclaimed guests go, with their work', pg_temp.t_n('select public.guest_purge_old()'), '1');
    perform pg_temp.t_admin();
    f := f || pg_temp.t_eq('12c a recent guest and a claimed one stay', pg_temp.t_n('select string_agg(email, '','' order by email) from public.guests'), 'claimed.person@example.com,guest.a@example.com,guest.b@example.com,guest.d@example.com');
    perform pg_temp.t_service();
    f := f || pg_temp.t_eq('12d the server can run it too', pg_temp.t_n('select public.guest_purge_old()'), '0');

    -- ------------------------------------------------ 13. Send to client
    perform pg_temp.t_as(owner_u);
    sug := public.suggest_tool(client_u, 'grow');
    f := f || pg_temp.t_eq('13z the same tool again is one suggestion', (public.suggest_tool(client_u, 'grow') = sug)::text, 'true');
    perform pg_temp.t_as(coach2);
    f := f || pg_temp.t_eq('13a a coach suggests only to their own clients', pg_temp.t_n(format('select public.suggest_tool(%L, ''grow'')', client_u)), 'error 42501');
    perform pg_temp.t_as(client_u);
    f := f || pg_temp.t_eq('13b the client sees "Alex suggests: Get unstuck"', pg_temp.t_n('select coach_first_name || '' suggests: '' || tool_label from public.my_suggestions()'), 'Alex suggests: Get unstuck');
    f := f || pg_temp.t_eq('13c ... can''t add one directly', pg_temp.t_n(format('insert into public.client_suggestions (coach_user_id, client_id, tool) values (%L, %L, ''grow'') returning 1', owner_u, client_u)), 'error 42501');
    f := f || pg_temp.t_eq('13d ... opens it', public.suggestion_opened(sug)::text, 'true');
    f := f || pg_temp.t_eq('13e ... dismisses it', public.suggestion_dismissed(sug)::text, 'true');
    f := f || pg_temp.t_eq('13f ... and it goes', pg_temp.t_n('select count(*) from public.my_suggestions()'), '0');
    perform pg_temp.t_as(owner_u);
    f := f || pg_temp.t_eq('13g the coach sees it was opened and dismissed', pg_temp.t_n('select (opened_at is not null and dismissed_at is not null)::text from public.client_suggestions'), 'true');
    perform pg_temp.t_as(stranger);
    f := f || pg_temp.t_eq('13h nobody else sees it', pg_temp.t_n('select count(*) from public.client_suggestions'), '0');
    f := f || pg_temp.t_eq('13i ... or dismisses it', public.suggestion_dismissed(sug)::text, 'false');

    -- ------------------------------------------------ 14. locked tables and the structure
    perform pg_temp.t_as(owner_u);
    f := f || pg_temp.t_eq('14a the owner can''t read guest tables directly', pg_temp.t_n('select (select count(*) from public.guest_items) + (select count(*) from public.guest_email_codes)'), 'error 42501');
    perform pg_temp.t_admin();
    f := f || pg_temp.t_eq('14b row security is on for every new table', pg_temp.t_n($q$select count(*) from pg_class where relnamespace = 'public'::regnamespace and relname in ('guests', 'guest_tools', 'guest_tables', 'guest_links', 'guest_link_attempts', 'guest_visits', 'guest_email_codes', 'guest_items', 'client_suggestions') and relrowsecurity$q$), '9');
    f := f || pg_temp.t_eq('14c every foreign key has an index', pg_temp.t_n($q$
      select count(*) from pg_constraint c
      where c.contype = 'f' and c.connamespace = 'public'::regnamespace
        and c.conrelid::regclass::text in ('guests', 'guest_links', 'guest_link_attempts', 'guest_visits', 'guest_email_codes', 'guest_items', 'client_suggestions',
                                            'decisions', 'performance_plans', 'plan_versions', 'outcome_objectives', 'plan_strategies', 'strategy_objectives', 'habits')
        and not exists (select 1 from pg_index i where i.indrelid = c.conrelid and (i.indkey::int2[])[0] = c.conkey[1])$q$), '0');

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
