-- =============================================================================
-- 042_guest_copy_test.sql
-- Checks 042_guest_copy.sql. RUN ORDER: 026 to 035, 042, then this.
--
-- WHAT IT DOES
--   Makes invented people (the owner coach, a second coach, a stranger, and
--   two guests with no account) and checks the guest's copy from end to
--   end: only the server may ask, a wrong or ended visit is refused, the
--   right email, tool, coach and rows come back, another guest's rows and
--   another link's rows never do, a visit sees earlier work only once the
--   email is confirmed, the send limits, taking a count back when the email
--   didn't go, the locked table, whose link a link is (guest_link_info),
--   and that 042 is safe to run twice.
--   Everything it makes is undone at the end.
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
create or replace function pg_temp.t_user(p_label text) returns uuid language plpgsql as $f$
declare u uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, aud, role, email_confirmed_at)
  values (u, 'p42-test-' || p_label || '-' || u || '@example.invalid', 'authenticated', 'authenticated', now());
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
  owner_u uuid; coach2 uuid; stranger uuid;
  l1 jsonb; l2 jsonb; l3 jsonb; l4 jsonb;
  va text; va2 text; vb text; vf text; vp text; vr text;
  d1 jsonb; d2 jsonb; db jsonb; df jsonb;
  j jsonb; code text; guest_a uuid;
begin
  begin
    owner_u := pg_temp.t_user('owner'); coach2 := pg_temp.t_user('coach'); stranger := pg_temp.t_user('stranger');
    insert into public.coaches (user_id, role, display_first_name) values (owner_u, 'owner', 'Alex');
    insert into public.coaches (user_id, role, display_first_name) values (coach2, 'coach', 'Priya');

    -- guest A: two Get unstuck plans through Alex's link, and feedback through another of Alex's links
    perform pg_temp.t_as(owner_u);
    l1 := public.guest_link_create('grow');
    l3 := public.guest_link_create('give-feedback');
    l4 := public.guest_link_create('performance-plan');
    perform pg_temp.t_anon();
    va := public.guest_open(pg_temp.t_tok(l1), 'copy.guest.a@example.com', l1 ->> 'code') ->> 'visit';
    d1 := public.guest_save(va, 'decisions', '{"title": "Hire faster", "form_data": {"goal": "Cut our time to hire to 30 days", "version": 2}, "status": "draft"}');
    d2 := public.guest_save(va, 'decisions', '{"title": "Win the renewal", "form_data": {"goal": "Win the Northfield renewal", "version": 2}, "status": "complete"}');
    vf := public.guest_open(pg_temp.t_tok(l3), 'copy.guest.a@example.com', l3 ->> 'code') ->> 'visit';
    df := public.guest_save(vf, 'decisions', '{"title": "Feedback for Jo", "form_data": {"who": "Jo"}}');
    vp := public.guest_open(pg_temp.t_tok(l4), 'copy.guest.a@example.com', l4 ->> 'code') ->> 'visit';
    perform public.guest_save(vp, 'performance_plans', '{"mission": "Lead a calm, fast team"}');
    -- guest B: a plan through Priya's link
    perform pg_temp.t_as(coach2);
    l2 := public.guest_link_create('grow');
    perform pg_temp.t_anon();
    vb := public.guest_open(pg_temp.t_tok(l2), 'copy.guest.b@example.com', l2 ->> 'code') ->> 'visit';
    db := public.guest_save(vb, 'decisions', '{"title": "B''s own plan", "form_data": {"goal": "Something private"}}');
    perform pg_temp.t_admin();
    select id into guest_a from public.guests where email = 'copy.guest.a@example.com';
    -- one transaction gives every row the same time, so the order is set here
    update public.decisions set updated_at = now() - interval '2 hours' where id = (d1 ->> 'id')::uuid;
    update public.decisions set updated_at = now() - interval '1 hour' where id = (d2 ->> 'id')::uuid;

    -- ------------------------------------------------ 0. whose link is this? (guest_link_info)
    perform pg_temp.t_anon();
    j := public.guest_link_info(pg_temp.t_tok(l1));
    f := f || pg_temp.t_eq('0a signed out, a real link says its tool and coach', concat_ws(' | ', j ->> 'ok', j ->> 'tool', j ->> 'tool_label', j ->> 'coach_name', j ->> 'open'), 'true | grow | Get unstuck | Alex | true');
    f := f || pg_temp.t_eq('0b ... and nothing else: no email, code or id', (select string_agg(k, ',' order by k) from jsonb_object_keys(j) k), 'coach_name,ok,open,tool,tool_label');
    f := f || pg_temp.t_eq('0c another coach''s link says that coach', public.guest_link_info(pg_temp.t_tok(l2)) ->> 'coach_name', 'Priya');
    f := f || pg_temp.t_eq('0d an unknown link says only no', (select string_agg(k || '=' || (x ->> k), ',' order by k) from (select public.guest_link_info(repeat('a', 64)) as x) y, jsonb_object_keys(x) k), 'ok=false');
    f := f || pg_temp.t_eq('0e a malformed one, and none, too', (public.guest_link_info('x')::text) || (public.guest_link_info(null)::text) || (public.guest_link_info(upper(pg_temp.t_tok(l1)))::text), '{"ok": false}{"ok": false}{"ok": false}');
    perform pg_temp.t_as(stranger);
    f := f || pg_temp.t_eq('0f someone signed in may ask too (a shared device)', public.guest_link_info(pg_temp.t_tok(l1)) ->> 'tool', 'grow');
    perform pg_temp.t_admin();
    f := f || pg_temp.t_eq('0g asking counts no try', pg_temp.t_n(format('select count(*) from public.guest_link_attempts where link_id = %L and not ok', l1 ->> 'link_id')), '0');
    update public.guest_links set expires_at = now() - interval '1 second' where id = (l4 ->> 'link_id')::uuid;
    perform pg_temp.t_anon();
    f := f || pg_temp.t_eq('0h a link that has run out says it is closed', concat_ws(' ', public.guest_link_info(pg_temp.t_tok(l4)) ->> 'ok', public.guest_link_info(pg_temp.t_tok(l4)) ->> 'open'), 'true false');
    perform pg_temp.t_admin();
    update public.guest_links set expires_at = now() + interval '30 days' where id = (l4 ->> 'link_id')::uuid;

    -- ------------------------------------------------ 1. only the server may ask
    perform pg_temp.t_anon();
    f := f || pg_temp.t_eq('1a signed out can''t ask for a copy', pg_temp.t_n(format('select public.guest_copy_issue(%L) ->> ''email''', va)), 'error 42501');
    f := f || pg_temp.t_eq('1b ... or take a count back', pg_temp.t_n(format('select public.guest_copy_failed(%L) ->> ''ok''', va)), 'error 42501');
    perform pg_temp.t_as(stranger);
    f := f || pg_temp.t_eq('1c nor someone signed in', pg_temp.t_n(format('select public.guest_copy_issue(%L) ->> ''email''', va)), 'error 42501');
    perform pg_temp.t_as(owner_u);
    f := f || pg_temp.t_eq('1d nor the coach who made the link, even the owner', pg_temp.t_n(format('select public.guest_copy_issue(%L) ->> ''email''', va)), 'error 42501');
    f := f || pg_temp.t_eq('1e ... or take a count back', pg_temp.t_n(format('select public.guest_copy_failed(%L) ->> ''ok''', va)), 'error 42501');
    perform pg_temp.t_admin();
    f := f || pg_temp.t_eq('1f only the service role holds either function', pg_temp.t_n($q$
      select string_agg(p.proname || ':' || r.rolname, ',' order by p.proname, r.rolname)
      from pg_proc p cross join (select unnest(array['anon', 'authenticated', 'service_role']) as rolname) r
      where p.pronamespace = 'public'::regnamespace and p.proname in ('guest_copy_issue', 'guest_copy_failed')
        and has_function_privilege(r.rolname, p.oid, 'execute')$q$), 'guest_copy_failed:service_role,guest_copy_issue:service_role');
    f := f || pg_temp.t_eq('1g both run with a fixed search path, as the owner', pg_temp.t_n($q$
      select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('guest_copy_issue', 'guest_copy_failed')
        and p.prosecdef and p.proconfig @> array['search_path=""']$q$), '2');

    -- ------------------------------------------------ 2. a wrong or ended visit
    perform pg_temp.t_service();
    f := f || pg_temp.t_eq('2a a made-up visit key is refused', pg_temp.t_n(format('select public.guest_copy_issue(%L) ->> ''email''', repeat('b', 64))), 'error 42501');
    f := f || pg_temp.t_eq('2b a malformed one too', pg_temp.t_n('select public.guest_copy_issue(''x'') ->> ''email'''), 'error 42501');
    f := f || pg_temp.t_eq('2c ... and none at all', pg_temp.t_n('select public.guest_copy_issue(null) ->> ''email'''), 'error 42501');
    f := f || pg_temp.t_eq('2d taking a count back for a made-up visit changes nothing', (public.guest_copy_failed(repeat('b', 64)) ->> 'ok') || ' ' || (public.guest_copy_failed('x') ->> 'ok'), 'false false');
    perform pg_temp.t_admin();
    f := f || pg_temp.t_eq('2e nothing was counted for any of that', pg_temp.t_n('select count(*) from public.guest_copy_sends'), '0');

    -- ------------------------------------------------ 3. the right email, tool, coach and rows
    perform pg_temp.t_service();
    j := public.guest_copy_issue(va);
    f := f || pg_temp.t_eq('3a the guest''s own email, the tool and the coach''s first name', concat_ws(' | ', j ->> 'ok', j ->> 'email', j ->> 'tool', j ->> 'tool_label', j ->> 'coach_first_name'),
      'true | copy.guest.a@example.com | grow | Get unstuck | Alex');
    f := f || pg_temp.t_eq('3b the answer holds only those and the rows', (select string_agg(k, ',' order by k) from jsonb_object_keys(j) k), 'coach_first_name,email,ok,rows,tool,tool_label');
    f := f || pg_temp.t_eq('3c both plans made through this link, the newest first', (select string_agg(r ->> 'title', ' > ' order by o) from jsonb_array_elements(j -> 'rows') with ordinality x(r, o)), 'Win the renewal > Hire faster');
    f := f || pg_temp.t_eq('3d each row has only its id, title, answers, status and time', (select string_agg(distinct (select string_agg(k, ',' order by k) from jsonb_object_keys(r) k), ' / ') from jsonb_array_elements(j -> 'rows') r), 'form_data,id,status,title,updated_at');
    f := f || pg_temp.t_eq('3e the answers come back as saved', j -> 'rows' -> 0 -> 'form_data' ->> 'goal', 'Win the Northfield renewal');
    f := f || pg_temp.t_eq('3f another guest''s row never comes back', (j::text like '%Something private%' or j::text like '%' || (db ->> 'id') || '%')::text, 'false');
    f := f || pg_temp.t_eq('3g nor the guest''s own work through another link', (j::text like '%Feedback for Jo%')::text, 'false');
    f := f || pg_temp.t_eq('3h nor the other guest''s email', (j::text like '%copy.guest.b%')::text, 'false');
    j := public.guest_copy_issue(vb);
    f := f || pg_temp.t_eq('3i guest B gets B''s own: Priya''s link, B''s email, B''s one row', concat_ws(' | ', j ->> 'email', j ->> 'coach_first_name', jsonb_array_length(j -> 'rows')::text, j -> 'rows' -> 0 ->> 'title'),
      'copy.guest.b@example.com | Priya | 1 | B''s own plan');
    j := public.guest_copy_issue(vf);
    f := f || pg_temp.t_eq('3j a feedback link sends its own tool''s work only', concat_ws(' | ', j ->> 'tool', j ->> 'tool_label', jsonb_array_length(j -> 'rows')::text, j -> 'rows' -> 0 ->> 'title'),
      'give-feedback | Give difficult feedback | 1 | Feedback for Jo');
    f := f || pg_temp.t_eq('3k a Performance Plan link has no copy', public.guest_copy_issue(vp) ->> 'error', 'nothing');
    perform pg_temp.t_admin();
    f := f || pg_temp.t_eq('3l each copy is counted once, with its link and guest; nothing for "nothing"', pg_temp.t_n(format('select count(*) || '' '' || count(*) filter (where guest_id = %L) from public.guest_copy_sends', guest_a)), '3 2');
    f := f || pg_temp.t_eq('3m the count keeps no address and no answers', pg_temp.t_n($q$select string_agg(attname, ',' order by attnum) from pg_attribute where attrelid = 'public.guest_copy_sends'::regclass and attnum > 0 and not attisdropped$q$), 'id,link_id,guest_id,sent_at');

    -- ------------------------------------------------ 4. earlier work only once the email is confirmed
    perform pg_temp.t_anon();
    va2 := public.guest_open(pg_temp.t_tok(l1), 'copy.guest.a@example.com', l1 ->> 'code') ->> 'visit';
    perform pg_temp.t_service();
    f := f || pg_temp.t_eq('4a a new visit that hasn''t confirmed the email sees none of the earlier work', public.guest_copy_issue(va2) ->> 'error', 'nothing');
    code := public.guest_email_code_issue(va2) ->> 'code';
    perform pg_temp.t_anon();
    perform public.guest_email_confirm(va2, code);
    vr := public.guest_return_start('copy.guest.a@example.com') ->> 'visit';
    perform pg_temp.t_service();
    j := public.guest_copy_issue(va2);
    f := f || pg_temp.t_eq('4b once confirmed it gets this link''s rows, and still not another link''s', (j ->> 'ok') || ' ' || jsonb_array_length(j -> 'rows'), 'true 2');
    f := f || pg_temp.t_eq('4c a visit with no link (coming back with an email) gets nothing', (select string_agg(k || '=' || (x ->> k), ',' order by k) from (select public.guest_copy_issue(vr) as x) y, jsonb_object_keys(x) k), 'ok=false');

    -- ------------------------------------------------ 5. the limits
    -- so far this hour: two for A's first link (3a, 4b)
    f := f || pg_temp.t_eq('5a a third copy in the hour goes', public.guest_copy_issue(va) ->> 'ok', 'true');
    j := public.guest_copy_issue(va);
    f := f || pg_temp.t_eq('5b a fourth is refused: 3 a link each hour', concat_ws(' ', j ->> 'ok', j ->> 'error'), 'false limit');
    f := f || pg_temp.t_eq('5c ... and it says nothing else: no email, no rows', (select string_agg(k, ',' order by k) from jsonb_object_keys(j) k), 'error,ok');
    f := f || pg_temp.t_eq('5d ... from the same link''s other visit too', public.guest_copy_issue(va2) ->> 'error', 'limit');
    f := f || pg_temp.t_eq('5e another link is not held up by it', public.guest_copy_issue(vb) ->> 'ok', 'true');
    perform pg_temp.t_admin();
    f := f || pg_temp.t_eq('5f a refused copy is not counted', pg_temp.t_n(format('select count(*) from public.guest_copy_sends where link_id = %L', l1 ->> 'link_id')), '3');
    perform pg_temp.t_service();
    f := f || pg_temp.t_eq('5g the email didn''t go: the newest count is taken back', public.guest_copy_failed(va) ->> 'ok', 'true');
    perform pg_temp.t_admin();
    f := f || pg_temp.t_eq('5h ... one, and only this link''s', pg_temp.t_n(format('select count(*) filter (where link_id = %L) || '' '' || count(*) from public.guest_copy_sends', l1 ->> 'link_id')), '2 5');
    perform pg_temp.t_service();
    f := f || pg_temp.t_eq('5i ... so the copy can be asked for again', public.guest_copy_issue(va) ->> 'ok', 'true');
    f := f || pg_temp.t_eq('5j ... once', public.guest_copy_issue(va) ->> 'error', 'limit');
    perform pg_temp.t_admin();
    update public.guest_copy_sends set sent_at = now() - interval '61 minutes' where link_id = (l1 ->> 'link_id')::uuid;
    perform pg_temp.t_service();
    f := f || pg_temp.t_eq('5k after the hour a copy goes again', public.guest_copy_issue(va) ->> 'ok', 'true');
    f := f || pg_temp.t_eq('5l a count more than 10 minutes old is never taken back', (select (public.guest_copy_failed(va) ->> 'ok') || ' ' || (public.guest_copy_failed(va) ->> 'ok')), 'true false');
    perform pg_temp.t_admin();
    -- guest A today: 3 for the first link (over an hour ago) and 1 for the feedback link; 6 more make 10
    insert into public.guest_copy_sends (link_id, guest_id, sent_at)
    select (l3 ->> 'link_id')::uuid, guest_a, now() - interval '5 hours' from generate_series(1, 6);
    f := f || pg_temp.t_eq('5m (ten counted for guest A today)', pg_temp.t_n(format('select count(*) from public.guest_copy_sends where guest_id = %L and sent_at > now() - interval ''1 day''', guest_a)), '10');
    perform pg_temp.t_service();
    f := f || pg_temp.t_eq('5n an eleventh copy in a day is refused, whichever link: 10 a guest each day', (public.guest_copy_issue(va) ->> 'error') || ' ' || (public.guest_copy_issue(vf) ->> 'error'), 'limit limit');
    f := f || pg_temp.t_eq('5o another guest is not held up by it', public.guest_copy_issue(vb) ->> 'ok', 'true');
    perform pg_temp.t_admin();
    update public.guest_copy_sends set sent_at = now() - interval '25 hours' where guest_id = guest_a and link_id = (l3 ->> 'link_id')::uuid;
    perform pg_temp.t_service();
    f := f || pg_temp.t_eq('5p the next day a copy goes again', public.guest_copy_issue(va) ->> 'ok', 'true');

    -- ------------------------------------------------ 6. ended, closed and claimed
    perform pg_temp.t_admin();
    update public.guest_visits set expires_at = now() - interval '1 second' where key_hash = public._guest_hash(vb);
    perform pg_temp.t_service();
    f := f || pg_temp.t_eq('6a an ended visit is refused', pg_temp.t_n(format('select public.guest_copy_issue(%L) ->> ''email''', vb)), 'error 42501');
    perform pg_temp.t_as(owner_u);
    perform public.guest_link_switch_off((l3 ->> 'link_id')::uuid);
    perform pg_temp.t_service();
    f := f || pg_temp.t_eq('6b a visit whose link was switched off before the email was confirmed is refused', pg_temp.t_n(format('select public.guest_copy_issue(%L) ->> ''email''', vf)), 'error 42501');
    perform pg_temp.t_admin();
    update public.guests set claimed_at = now(), claimed_by = stranger where id = guest_a;
    perform pg_temp.t_service();
    f := f || pg_temp.t_eq('6c work that has moved into an account is refused', pg_temp.t_n(format('select public.guest_copy_issue(%L) ->> ''email''', va)), 'error 42501');

    perform pg_temp.t_anon();
    f := f || pg_temp.t_eq('6d a switched-off link says it is closed', public.guest_link_info(pg_temp.t_tok(l3)) ->> 'open', 'false');

    -- ------------------------------------------------ 7. the locked table and the structure
    perform pg_temp.t_anon();
    f := f || pg_temp.t_eq('7a signed out can''t read the counts', pg_temp.t_n('select count(*) from public.guest_copy_sends'), 'error 42501');
    perform pg_temp.t_as(owner_u);
    f := f || pg_temp.t_eq('7b nor the owner', pg_temp.t_n('select count(*) from public.guest_copy_sends'), 'error 42501');
    f := f || pg_temp.t_eq('7c ... or add one', pg_temp.t_n(format('insert into public.guest_copy_sends (link_id, guest_id) values (%L, %L) returning 1', l1 ->> 'link_id', guest_a)), 'error 42501');
    perform pg_temp.t_admin();
    f := f || pg_temp.t_eq('7d row security is on, with no rules', pg_temp.t_n($q$select (c.relrowsecurity)::text || ' ' || (select count(*) from pg_policy p where p.polrelid = c.oid) from pg_class c where c.oid = 'public.guest_copy_sends'::regclass$q$), 'true 0');
    f := f || pg_temp.t_eq('7e every foreign key has an index', pg_temp.t_n($q$
      select count(*) from pg_constraint c
      where c.contype = 'f' and c.conrelid = 'public.guest_copy_sends'::regclass
        and not exists (select 1 from pg_index i where i.indrelid = c.conrelid and (i.indkey::int2[])[0] = c.conkey[1])$q$), '0');
    delete from public.guest_links where id = (l2 ->> 'link_id')::uuid;
    f := f || pg_temp.t_eq('7f a link that goes takes its counts with it', pg_temp.t_n(format('select count(*) from public.guest_copy_sends where link_id = %L', l2 ->> 'link_id')), '0');
    f := f || pg_temp.t_eq('7g 042 recorded itself once, however often it ran', pg_temp.t_n('select count(*) from public.migration_log where number = 42'), '1');

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
