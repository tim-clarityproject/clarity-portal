-- Scale check seed, part 4: the owner's selling side (400 leads with their
-- history and bookings, 1,500 Network people, organisation deals and
-- contacts, a board).
set session_replication_role = replica;

insert into public.coach_lead_stages (id, coach_id, name, likelihood, position, is_won)
select md5('stage' || s)::uuid, md5('coachrow1')::uuid, (array['New','First call booked','Proposal sent','Deciding','Won'])[s], (array[10, 25, 50, 75, 100])[s], s, s = 5
from generate_series(1, 5) s;

insert into public.coach_leads (id, coach_id, name, email, source, call_type_key, time_zone, status, notes, stage_id, organisation, job_title, phone, value, currency,
                                next_step, next_step_on, last_contact_on, won_at, cold_at, cold_reason, created_at)
select md5('lead' || l)::uuid, md5('coachrow1')::uuid, n.first_name || ' ' || n.last_name, 'scale-lead-' || lpad(l::text, 3, '0') || '@example.com',
       (array['chemistry_page','referral','network','manual','booking_page'])[1 + l % 5], 'chemistry', 'Europe/London',
       case when l % 7 = 0 then 'cold' when l % 11 = 0 then 'won' else 'open' end, 'Met at the leadership breakfast.',
       md5('stage' || (case when l % 11 = 0 then 5 else 1 + l % 4 end))::uuid, 'Company ' || (1 + l % 60), 'Managing director',
       '+447700900' || lpad((l % 1000)::text, 3, '0'), 6000 + (l % 10) * 1500, 'GBP',
       case when l % 7 <> 0 then 'Send the proposal' end, case when l % 7 <> 0 then d.today + (l % 30) - 10 end, d.today - l % 60,
       case when l % 11 = 0 and l % 7 <> 0 then (d.today - l % 200)::timestamptz end, case when l % 7 = 0 then (d.today - l % 150)::timestamptz end,
       case when l % 7 = 0 then 'Not the right time.' end, (d.today - 700 + l)::timestamptz
from generate_series(1, 400) l join scale_seed.names n on n.i = 1000 + l, scale_seed.dates d;
insert into public.coach_lead_events (coach_id, lead_id, kind, happened_at, title, detail)
select md5('coachrow1')::uuid, md5('lead' || l)::uuid, (array['first_contact','call','email','note','proposal','stage'])[e], (d.today - 700 + l + e * 5)::timestamptz,
       'Step ' || e, 'What happened at step ' || e || '.'
from generate_series(1, 400) l, generate_series(1, 6) e, scale_seed.dates d where d.today - 700 + l + e * 5 <= d.today;
insert into public.coach_bookings (coach_id, call_type_id, lead_id, name, email, time_zone, starts_at, ends_at, status, source, created_at)
select md5('coachrow1')::uuid, md5('ct1-1')::uuid, md5('lead' || l)::uuid, n.first_name || ' ' || n.last_name, 'scale-lead-' || lpad(l::text, 3, '0') || '@example.com', 'Europe/London',
       ((d.today - 365 + l * 1.8 * interval '1 day')::date::timestamp + interval '14 hours 15 minutes') at time zone 'Europe/London',
       ((d.today - 365 + l * 1.8 * interval '1 day')::date::timestamp + interval '14 hours 45 minutes') at time zone 'Europe/London',
       'booked', 'page', (d.today - 370 + l * 1.8 * interval '1 day')
from generate_series(1, 400) l join scale_seed.names n on n.i = 1000 + l, scale_seed.dates d;

-- 1,500 Network people, rated, with a few gives each.
insert into public.network_people (id, coach_id, name, organisation, role, email, phone, influence, trust, value_delivery, what_you_get, rhythm_months, last_spoke_on,
                                   added_on, given_count, asked_count, own, archived_at, notes, created_at)
select md5('net' || p)::uuid, md5('coachrow1')::uuid, n.first_name || ' ' || n.last_name || case when p > 1600 - 1000 then ' ' || p else '' end,
       'Company ' || (1 + p % 120), (array['Chief executive','Investor','Partner','Head of people','Founder'])[1 + p % 5],
       'scale-net-' || lpad(p::text, 4, '0') || '@example.com', '+447700900' || lpad((p % 1000)::text, 3, '0'),
       case when p % 9 <> 0 then p % 11 end, case when p % 9 <> 0 then (p * 3) % 11 end, case when p % 9 <> 0 then (p * 7) % 11 end, case when p % 9 <> 0 then (p * 5) % 11 end,
       1 + p % 6, d.today - (p % 400), d.today - 800 + p % 700, p % 4, p % 3, '{}', case when p % 25 = 0 then now() - interval '60 days' end,
       case when p % 4 = 0 then 'Met through the Kestrel board.' end, (d.today - 800 + p % 700)::timestamptz
from generate_series(1, 1500) p join scale_seed.names n on n.i = 1 + (p * 7) % 2000, scale_seed.dates d;
insert into public.network_ratings (person_id, coach_id, rating, rated_on, value)
select md5('net' || p)::uuid, md5('coachrow1')::uuid, r, d.today - p % 300, p % 11
from generate_series(1, 1500) p, unnest(array['influence','trust','value_delivery','what_you_get']) r, scale_seed.dates d where p % 9 <> 0;
insert into public.network_gives (person_id, coach_id, direction, kind, note, happened_on)
select md5('net' || p)::uuid, md5('coachrow1')::uuid, 'gave', (array['idea','resource','introduction','favour'])[g], 'Sent the article.', d.today - (p * g) % 300
from generate_series(1, 1500) p, generate_series(1, 2) g, scale_seed.dates d where p % 2 = 0;

-- Organisations: deals and contacts.
insert into public.organisation_deals (organisation_id, name, kind, status, value, currency, per, starts_on, renews_on)
select md5('org' || o)::uuid, 'Leadership programme ' || x, (array['agreement','proposal'])[1 + x % 2], (array['active','sent','ended','draft'])[1 + (o + x) % 4],
       12000 + o * 500, 'GBP', (array['year','once','month'])[1 + x % 3], d.today - 300 + o * 5, d.today + 65 + o * 5
from generate_series(1, 40) o, generate_series(1, 3) x, scale_seed.dates d;
insert into public.organisation_contacts (organisation_id, name, email, job_title, roles, note)
select md5('org' || o)::uuid, 'Contact ' || o || '-' || x, 'scale-contact-' || o || '-' || x || '@example.com', 'Chief of staff', array[(array['sponsor','invoices','hr'])[x]], 'Decides on renewals'
from generate_series(1, 40) o, generate_series(1, 3) x;

do $$ begin raise notice 'SEED part 4: % leads, % lead events, % Network people, % deals', (select count(*) from public.coach_leads), (select count(*) from public.coach_lead_events),
  (select count(*) from public.network_people), (select count(*) from public.organisation_deals); end $$;
drop schema if exists scale_seed_unused cascade;
