-- Scale check seed, part 1: people. Invented names only, example.com
-- addresses, 07700 900xxx numbers. Ids are md5 of a label, so every run
-- makes the same people. Runs on the local stand-in only (tests/scale/seed.mjs).
-- Triggers are off while it loads (session_replication_role = replica): this
-- is about speed; the rules themselves are checked elsewhere. Check
-- constraints still hold.
set session_replication_role = replica;

create schema if not exists scale_seed;
drop table if exists scale_seed.dates, scale_seed.client_coach, scale_seed.names;
-- "Today" is the day the seed runs; a year back starts on the Monday 52 weeks before this week's.
create table scale_seed.dates as
select current_date as today, date_trunc('week', current_date)::date as cur_mon, (date_trunc('week', current_date)::date - 364) as y0;

-- 1,000 clients spread unevenly: the owner (coach 1) has 300.
create table scale_seed.client_coach as
with w(k, n) as (values (1, 300), (2, 120), (3, 90), (4, 80), (5, 70), (6, 60), (7, 55), (8, 50), (9, 45), (10, 35), (11, 30), (12, 25), (13, 20), (14, 12), (15, 8)),
r as (select k, n, (sum(n) over (order by k) - n)::int as lo from w)
select i, k from r, generate_series(lo + 1, lo + n) i;

create table scale_seed.names as
select i,
  (array['Ava','Ben','Cara','Dev','Eli','Fay','Gus','Hana','Ivo','Jade','Kit','Lena','Milo','Nia','Oren','Pia','Quin','Rhea','Seth','Tara',
         'Uma','Vic','Wren','Xavi','Yara','Zed','Abi','Bram','Cleo','Dax','Esme','Finn','Gia','Hugo','Iris','Jago','Kaya','Luca','Mira','Noor'])[1 + i % 40] as first_name,
  (array['Ashdown','Brookes','Carver','Dunmore','Ellwood','Fairley','Greaves','Holloway','Inchley','Jessop','Kirkby','Lomax','Marlow','Northcote','Oakley','Pemberton',
         'Quarry','Redfern','Stanway','Thornbury','Underhill','Vane','Westbrook','Yardley','Ashcombe','Blythe','Colley','Draycott','Everley','Fenwick','Garside','Hartley',
         'Ingram','Jarvis','Kember','Ludlow','Mercer','Netley','Orme','Pryor'])[1 + (i / 40) % 40] as last_name
from generate_series(1, 2000) i;

-- Sign-in accounts: clients scale-client-0001@example.com, coaches scale-coach-01@example.com.
insert into auth.users (id, email, aud, role, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
select md5('client' || i)::uuid, 'scale-client-' || lpad(i::text, 4, '0') || '@example.com', 'authenticated', 'authenticated', now() - interval '400 days',
       now() - interval '400 days', now(), '{"provider":"email"}'::jsonb, '{}'::jsonb
from generate_series(1, 1000) i
union all
select md5('coach' || k)::uuid, 'scale-coach-' || lpad(k::text, 2, '0') || '@example.com', 'authenticated', 'authenticated', now() - interval '500 days',
       now() - interval '500 days', now(), '{"provider":"email"}'::jsonb, '{}'::jsonb
from generate_series(1, 15) k;

insert into public.profiles (id, first_name, last_name, email, terms_accepted, created_at, updated_at)
select md5('client' || n.i)::uuid, n.first_name, n.last_name, 'scale-client-' || lpad(n.i::text, 4, '0') || '@example.com', true, now() - interval '400 days', now()
from scale_seed.names n where n.i <= 1000
union all
select md5('coach' || k)::uuid, n.first_name, n.last_name, 'scale-coach-' || lpad(k::text, 2, '0') || '@example.com', true, now() - interval '500 days', now()
from generate_series(1, 15) k join scale_seed.names n on n.i = 1500 + k;

insert into public.person_settings (user_id, time_zone, country, units, terms_version, terms_accepted_at)
select md5('client' || i)::uuid, 'Europe/London', 'GB', 'metric', '2026-10', now() - interval '400 days' from generate_series(1, 1000) i
union all
select md5('coach' || k)::uuid, 'Europe/London', 'GB', 'metric', '2026-10', now() - interval '500 days' from generate_series(1, 15) k;

-- 15 coaches: 1 owner, 14 associates; each has an authenticator with the code given (053, 054) and saved recovery codes.
insert into public.coaches (id, user_id, role, display_first_name, full_name, email, mobile, active, created_at)
select md5('coachrow' || k)::uuid, md5('coach' || k)::uuid, case when k = 1 then 'owner' else 'coach' end, n.first_name, n.first_name || ' ' || n.last_name,
       'scale-coach-' || lpad(k::text, 2, '0') || '@example.com', '+447700900' || lpad((900 + k)::text, 3, '0'), true, now() - interval '500 days'
from generate_series(1, 15) k join scale_seed.names n on n.i = 1500 + k;
insert into public.coach_authenticators (user_id, turned_on_at, factor_id, codes_made_at, codes_saved_at)
select md5('coach' || k)::uuid, now() - interval '30 days', md5('factor' || k)::uuid, now() - interval '30 days', now() - interval '30 days' from generate_series(1, 15) k;
insert into public.coach_recovery_codes (user_id, set_id, position, code_hash, made_at)
select md5('coach' || k)::uuid, md5('codeset' || k)::uuid, p, '$2a$10$' || rpad(md5('code' || k || '-' || p) || md5('more' || k || '-' || p), 53, 'x'), now() - interval '30 days'
from generate_series(1, 15) k, generate_series(1, 10) p;
insert into public.coach_settings (coach_id, time_zone, working_hours)
select md5('coachrow' || k)::uuid, 'Europe/London', '{}' from generate_series(1, 15) k;

-- 40 organisations; 40% of clients work in one.
insert into public.organisations (id, name, currency, city, created_at)
select md5('org' || o)::uuid, (array['Kestrel','Northfield','Harbour','Brightline','Ashgrove','Copperleaf','Redwater','Stonebridge','Fernhill','Larkspur'])[1 + o % 10]
       || ' ' || (array['Group','Logistics','Media','Partners','Health','Foods','Energy','Labs'])[1 + (o / 10) % 8] || ' ' || o,
       'GBP', (array['London','Leeds','Manchester','Bristol','Glasgow'])[1 + o % 5], now() - interval '600 days'
from generate_series(1, 40) o;

-- Each client: a coach (coach_clients, 026) and the coach's record of them (client_profiles, 049).
insert into public.coach_clients (client_id, coach_id, started_at)
select md5('client' || cc.i)::uuid, md5('coachrow' || cc.k)::uuid, now() - interval '380 days' from scale_seed.client_coach cc;
insert into public.client_profiles (id, coach_id, user_id, name, email, mobile, organisation_id, job_title, city, time_zone, status, stage, getting_started,
                                    last_contact_on, invited_at, ended_on, created_at)
select md5('cprof' || cc.i)::uuid, md5('coachrow' || cc.k)::uuid, md5('client' || cc.i)::uuid, n.first_name || ' ' || n.last_name,
       'scale-client-' || lpad(cc.i::text, 4, '0') || '@example.com', '+447700900' || lpad((cc.i % 900)::text, 3, '0'),
       case when cc.i % 5 < 2 then md5('org' || (1 + cc.i % 40))::uuid end,
       (array['Chief executive','Operations director','Head of people','Finance director','Consultant','Head coach','Editor','Founder'])[1 + cc.i % 8],
       (array['London','Leeds','Manchester','Bristol','Glasgow','Cardiff'])[1 + cc.i % 6], 'Europe/London',
       case when cc.i % 20 = 0 then 'past' when cc.i % 29 = 0 then 'paused' else 'active' end,
       case when cc.i % 20 = 0 then null else (array['starting','active','active','active','renewal_due','closing'])[1 + cc.i % 6] end,
       '{"first_review": true, "welcome_pack": true}', (select today from scale_seed.dates) - (cc.i % 30), now() - interval '380 days',
       case when cc.i % 20 = 0 then (select today from scale_seed.dates) - (cc.i % 90) end, now() - interval '380 days'
from scale_seed.client_coach cc join scale_seed.names n on n.i = cc.i;
insert into public.client_profile_coaches (profile_id, coach_id, started_at)
select md5('cprof' || cc.i)::uuid, md5('coachrow' || cc.k)::uuid, now() - interval '380 days' from scale_seed.client_coach cc;
insert into public.client_about (profile_id, coach_id, birthday_month, birthday_day, partner, other)
select md5('cprof' || cc.i)::uuid, md5('coachrow' || cc.k)::uuid, 1 + cc.i % 12, 1 + cc.i % 28, case when cc.i % 3 = 0 then 'Sam' end, 'Prefers early calls.'
from scale_seed.client_coach cc where cc.i % 2 = 0;
insert into public.client_notes (profile_id, coach_id, body, noted_on, pinned, created_at)
select md5('cprof' || cc.i)::uuid, md5('coachrow' || cc.k)::uuid, 'Note ' || x || ': keep the focus on the next small step.',
       (select today from scale_seed.dates) - x * 40, x = 1, now() - make_interval(days => x * 40)
from scale_seed.client_coach cc, generate_series(1, 6) x;
insert into public.sharing_switches (user_id, part, is_on)
select md5('client' || i)::uuid, p, true from generate_series(1, 1000) i, unnest(array['progress', 'plan', 'reviews']) p where i % 3 <> 0;

-- Engagements: one per client, 13 monthly sessions.
insert into public.engagements (id, coach_id, profile_id, kind, name, sessions_total, sessions_held, sessions_held_base, default_minutes, every_weeks, starts_on, ends_on, status, created_at)
select md5('eng' || cc.i)::uuid, md5('coachrow' || cc.k)::uuid, md5('cprof' || cc.i)::uuid, 'sessions', '12-month coaching', 15, 12, 0, 60, 4,
       (select y0 from scale_seed.dates), (select y0 from scale_seed.dates) + 420, case when cc.i % 20 = 0 then 'ended' else 'active' end, now() - interval '380 days'
from scale_seed.client_coach cc;

-- Tags and saved views per coach.
insert into public.coach_tags (id, coach_id, name, position)
select md5('tag' || k || '-' || t)::uuid, md5('coachrow' || k)::uuid, (array['Executive','Sport','Finance','Health','Founder','Renewal soon'])[t], t
from generate_series(1, 15) k, generate_series(1, 6) t;
insert into public.coach_tag_links (tag_id, item_kind, item_id, coach_id)
select md5('tag' || cc.k || '-' || (1 + cc.i % 6))::uuid, 'client', md5('cprof' || cc.i)::uuid, md5('coachrow' || cc.k)::uuid from scale_seed.client_coach cc
union all
select md5('tag' || cc.k || '-' || (1 + (cc.i + 3) % 6))::uuid, 'client', md5('cprof' || cc.i)::uuid, md5('coachrow' || cc.k)::uuid from scale_seed.client_coach cc where cc.i % 2 = 0;
insert into public.coach_views (coach_id, list, name, filters, sort, layout, favourite, position)
select md5('coachrow' || k)::uuid, 'clients', 'Executives', jsonb_build_object('tag', jsonb_build_array(md5('tag' || k || '-1')::uuid)), 'name', 'list', true, 0 from generate_series(1, 15) k
union all
select md5('coachrow' || k)::uuid, 'clients', 'Renewals', jsonb_build_object('tag', jsonb_build_array(md5('tag' || k || '-6')::uuid)), 'next', 'table', false, 1 from generate_series(1, 15) k;

select 1 from scale_seed.dates;
do $$ begin raise notice 'SEED part 1: % people, % coaches, % client profiles', (select count(*) from auth.users), (select count(*) from public.coaches), (select count(*) from public.client_profiles); end $$;
