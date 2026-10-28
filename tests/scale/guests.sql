-- Guest links at scale (Phase 1 step 5): 15 coaches, 2,000 guests and
-- 10,000 links, with their visits and work, then the main guest and coach
-- reads timed as the people who would run them. Run after migration 035,
-- inside a rolled-back transaction on the TEST database only:
--
--   bash scripts/dry-run-on-test.sh supabase/migrations/033_pulse_wellbeing_seat_standard.sql \
--     supabase/migrations/034_alignment_coach_name.sql supabase/migrations/035_guest_links.sql tests/scale/guests.sql
--
-- Each read runs three times; the middle time (planning and running) is
-- reported as TIMING|name|ms. Anything a read writes is undone straight
-- away. Nothing is kept. Invented names and emails only.

-- ---------------------------------------------------------------- people
insert into auth.users (id, email, aud, role, email_confirmed_at)
select md5('gcoach' || k)::uuid, 'scale-gcoach-' || k || '@example.invalid', 'authenticated', 'authenticated', now()
from generate_series(1, 15) k;
insert into public.coaches (user_id, role, display_first_name)
select md5('gcoach' || k)::uuid, case when k = 1 then 'owner' else 'coach' end, 'Coach' || k from generate_series(1, 15) k
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------- guests, links, visits
-- Guest g belongs to coach 1 + g % 15 and has 5 links from them. Link i's
-- token is md5('glink' || i) || md5('glink2' || i); visit i's key likewise.
insert into public.guests (id, email, last_visit_at, created_at)
select md5('guest' || g)::uuid, 'scale-guest-' || g || '@example.invalid', now() - (g % 400) * interval '1 day', now() - interval '1 year'
from generate_series(1, 2000) g;

do $links$
declare code text := extensions.crypt('ABCDEF', extensions.gen_salt('bf'));
begin
  insert into public.guest_links (id, tool, coach_user_id, token_hash, code_hash, created_at, expires_at, guest_id, first_used_at, finished_at)
  select md5('linkrow' || i)::uuid,
         (array['grow', 'give-feedback', 'performance-plan', 'prepare-conversation'])[1 + i % 4],
         md5('gcoach' || (1 + (i % 2000) % 15))::uuid,
         public._guest_hash(md5('glink' || i) || md5('glink2' || i)), code,
         now() - (i % 300) * interval '1 day', now() - (i % 300) * interval '1 day' + interval '30 days',
         md5('guest' || (1 + i % 2000))::uuid, now() - (i % 300) * interval '1 day',
         case when i % 3 = 0 then now() - (i % 300) * interval '1 day' end
  from generate_series(1, 10000) i;
end
$links$;

insert into public.guest_visits (id, key_hash, guest_id, link_id, created_at, last_used_at, expires_at)
select md5('visitrow' || i)::uuid, public._guest_hash(md5('gvisit' || i) || md5('gvisit2' || i)), md5('guest' || (1 + i % 2000))::uuid,
       md5('linkrow' || i)::uuid, now(), now(), now() + interval '12 hours'
from generate_series(1, 10000) i;

insert into public.guest_link_attempts (link_id, at, ok)
select md5('linkrow' || i)::uuid, now() - (i % 300) * interval '1 day', a > 1
from generate_series(1, 10000) i, generate_series(1, 2) a;

-- ---------------------------------------------------------------- their work
-- Two decisions per GROW, feedback or conversation link; a plan with three
-- Strategies per plan link.
insert into public.decisions (id, guest_id, tool_type, title, form_data, created_at)
select md5('gdec' || i || '-' || d)::uuid, md5('guest' || (1 + i % 2000))::uuid,
       (array['grow', 'tough-conversation', null, 'difficult-conversation'])[1 + i % 4], 'Scale guest decision', '{"goal": "Invented"}', now() - (i % 300) * interval '1 day'
from generate_series(1, 10000) i, generate_series(1, 2) d
where i % 4 <> 2;
insert into public.guest_items (table_name, row_key, guest_id, link_id, visit_id)
select 'decisions', md5('gdec' || i || '-' || d)::uuid::text, md5('guest' || (1 + i % 2000))::uuid, md5('linkrow' || i)::uuid, md5('visitrow' || i)::uuid
from generate_series(1, 10000) i, generate_series(1, 2) d
where i % 4 <> 2;

insert into public.performance_plans (id, guest_id, mission, status, created_at)
select md5('gplan' || i)::uuid, md5('guest' || (1 + i % 2000))::uuid, 'Scale guest mission', 'archived', now() - (i % 300) * interval '1 day'
from generate_series(1, 10000) i where i % 4 = 2;
insert into public.plan_strategies (id, guest_id, plan_id, name, sort_order)
select md5('gstrat' || i || '-' || s)::uuid, md5('guest' || (1 + i % 2000))::uuid, md5('gplan' || i)::uuid, 'Scale Strategy ' || s, s
from generate_series(1, 10000) i, generate_series(1, 3) s where i % 4 = 2;
insert into public.guest_items (table_name, row_key, guest_id, link_id, visit_id)
select 'performance_plans', md5('gplan' || i)::uuid::text, md5('guest' || (1 + i % 2000))::uuid, md5('linkrow' || i)::uuid, md5('visitrow' || i)::uuid
from generate_series(1, 10000) i where i % 4 = 2
union all
select 'plan_strategies', md5('gstrat' || i || '-' || s)::uuid::text, md5('guest' || (1 + i % 2000))::uuid, md5('linkrow' || i)::uuid, md5('visitrow' || i)::uuid
from generate_series(1, 10000) i, generate_series(1, 3) s where i % 4 = 2;

-- An account for guest 7's email, for the claim.
insert into auth.users (id, email, aud, role, email_confirmed_at)
values (md5('gclaimer')::uuid, 'scale-guest-7@example.invalid', 'authenticated', 'authenticated', now());

analyze public.guests;
analyze public.guest_links;
analyze public.guest_visits;
analyze public.guest_link_attempts;
analyze public.guest_items;
analyze public.decisions;
analyze public.performance_plans;
analyze public.plan_strategies;

-- ---------------------------------------------------------------- the reads
do $m$
declare
  q record;
  j jsonb;
  times numeric[];
  ms numeric;
  i integer;
  tok text := md5('glink' || 1200) || md5('glink2' || 1200);    -- a GROW link made today, guest 1201
  vk text := md5('gvisit' || 1200) || md5('gvisit2' || 1200);
  vp text := md5('gvisit' || 1202) || md5('gvisit2' || 1202);   -- a plan link
  dec uuid := md5('gdec1200-1')::uuid;
  plan uuid := md5('gplan1202')::uuid;
  c8 uuid := md5('gcoach8')::uuid;
  owner uuid := md5('gcoach1')::uuid;
  p3_visit timestamptz; p3_id uuid;
begin
  -- the coach's third page starts after the second page's last row
  perform set_config('request.jwt.claims', json_build_object('sub', c8, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select g.last_visit_at, g.guest_id into p3_visit, p3_id from public.coach_guests(null, 50) g offset 49 limit 1;
  select g.last_visit_at, g.guest_id into p3_visit, p3_id from public.coach_guests(null, 50, p3_visit, p3_id) g offset 49 limit 1;
  perform set_config('role', 'none', true);

  for q in select * from (values
    ('Guest: opening a link (link, email and code)', null::uuid,
     format('select public.guest_open(%L, %L, ''ABCDEF'')', tok, 'scale-guest-1201@example.invalid')),
    ('Guest: reading their GROWs', null::uuid, format('select public.guest_rows(%L, ''decisions'')', vk)),
    ('Guest: saving a change to a GROW', null::uuid,
     format('select public.guest_save(%L, ''decisions'', %L)', vk, jsonb_build_object('id', dec, 'title', 'Changed'))),
    ('Guest: saving a new GROW', null::uuid, format('select public.guest_save(%L, ''decisions'', ''{"title": "New"}'')', vk)),
    ('Guest: adding a Strategy to their plan (parent checked)', null::uuid,
     format('select public.guest_save(%L, ''plan_strategies'', %L)', vp, jsonb_build_object('plan_id', plan, 'name', 'New Strategy'))),
    ('Guest: confirming the email (a wrong code)', null::uuid, format('select public.guest_email_confirm(%L, ''123456'')', vk)),
    ('Guest: deleting the answers given through a link', null::uuid, format('select public.guest_delete_link_answers(%L)', vk)),
    ('Coach: guest list, first page (about 133 guests)', c8, 'select * from public.coach_guests(null, 50)'),
    ('Coach: guest list, third page', c8, format('select * from public.coach_guests(null, 50, %L, %L)', p3_visit, p3_id)),
    ('Coach: links, first page (about 667 links)', c8, 'select * from public.coach_links(null, 50)'),
    ('Coach: one guest''s answers through a link', md5('gcoach' || (1 + 1202 % 15))::uuid, format('select public.coach_guest_answers(%L)', md5('linkrow1202')::uuid)),
    ('Coach: making a link', c8, 'select public.guest_link_create(''grow'')'),
    ('Owner: every guest, first page (2,000 guests)', owner, 'select * from public.coach_guests(null, 50)'),
    ('Owner: one coach''s guests', owner, format('select * from public.coach_guests(%L, 50)', c8)),
    ('Account: claiming a guest''s work (guest 7)', md5('gclaimer')::uuid, 'select public.guest_claim()'),
    ('Keeping: deleting guests older than 2 years (none due)', owner, 'select public.guest_purge_old()')
  ) v(name, who, sql) loop
    times := '{}';
    for i in 1..3 loop
      begin
        if q.who is not null then
          perform set_config('request.jwt.claims', json_build_object('sub', q.who, 'role', 'authenticated')::text, true);
          perform set_config('role', 'authenticated', true);
        else
          perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
          perform set_config('role', 'anon', true);
        end if;
        execute format('explain (analyze, format json) %s', q.sql) into j;
        times := times || ((j -> 0 ->> 'Execution Time')::numeric + (j -> 0 ->> 'Planning Time')::numeric);
        raise exception using errcode = 'SC001', message = 'undo';
      exception when sqlstate 'SC001' then null;
      end;
    end loop;
    perform set_config('role', 'none', true);
    ms := (select t from unnest(times) t order by t offset 1 limit 1);
    raise notice 'TIMING|%|%', q.name, round(ms, 1);
  end loop;
  raise notice 'ROWS|guests %|guest_links %|guest_visits %|guest_items %|guest decisions %|guest plans %|guest Strategies %',
    (select count(*) from public.guests), (select count(*) from public.guest_links), (select count(*) from public.guest_visits),
    (select count(*) from public.guest_items), (select count(*) from public.decisions where guest_id is not null),
    (select count(*) from public.performance_plans where guest_id is not null), (select count(*) from public.plan_strategies where guest_id is not null);
end
$m$;
