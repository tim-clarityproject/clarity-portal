-- Scale check seed, part 3: each coach's working year (sessions, two years
-- of calendar, bookings and links, 6,000 coach to-dos, notifications,
-- the activity log, time entries).
set session_replication_role = replica;

insert into public.coach_call_types (id, coach_id, key, name, minutes, notice_hours, ahead_weeks, place_kind, active, makes_lead, position)
select md5('ct' || k || '-' || t)::uuid, md5('coachrow' || k)::uuid, (array['chemistry','coaching'])[t], (array['Chemistry call','Coaching call'])[t],
       (array[30, 60])[t], 24, 4, 'zoom', true, t = 1, t
from generate_series(1, 15) k, generate_series(1, 2) t;

-- Sessions: every 4 weeks for the last year (13), and the next two.
insert into public.coach_sessions (id, coach_id, profile_id, engagement_id, kind, starts_at, minutes, place, outcome, written_up_at, recap, created_at)
select md5('sess' || cc.i || '-' || n)::uuid, md5('coachrow' || cc.k)::uuid, md5('cprof' || cc.i)::uuid, md5('eng' || cc.i)::uuid, 'coaching',
       ((d.y0 + n * 28 + (cc.i % 5))::timestamp + make_interval(hours => 8 + cc.i % 9)) at time zone 'Europe/London', 60, 'Zoom',
       case when n <= 12 then (case when (cc.i + n) % 17 = 0 then 'no_show' else 'held' end) end,
       case when n <= 12 then ((d.y0 + n * 28 + (cc.i % 5))::timestamp + make_interval(hours => 10 + cc.i % 9)) at time zone 'Europe/London' end,
       case when n <= 12 then 'We looked at the week ahead and agreed two small steps.' end,
       ((d.y0 + n * 28 - 7)::timestamp) at time zone 'Europe/London'
from scale_seed.client_coach cc, generate_series(0, 14) n, scale_seed.dates d
where cc.i % 20 <> 0 or n <= 9;
insert into public.coach_session_people (session_id, profile_id, engagement_id)
select s.id, s.profile_id, s.engagement_id from public.coach_sessions s;
insert into public.coach_session_notes (session_id, coach_id, layout, focus, insight, next_time)
select s.id, s.coach_id, 'standard', 'The team restructure.', 'Wants to be asked, not told.', 'Ask how the board meeting went.'
from public.coach_sessions s where s.outcome = 'held';
-- Each session sits in the calendar too.
insert into public.coach_cal_items (coach_id, kind, title, starts_at, ends_at, time_zone, place_kind, meeting_link, profile_id, session_id, created_at)
select s.coach_id, 'client_call', p.name, s.starts_at, s.starts_at + interval '60 minutes', 'Europe/London', 'zoom', 'https://zoom.example.com/j/' || abs(hashtext(s.id::text)),
       s.profile_id, s.id, s.created_at
from public.coach_sessions s join public.client_profiles p on p.id = s.profile_id;
-- Two years of the rest of the calendar (a year back, a year ahead), weekdays: 2 items a day, the owner 3.
insert into public.coach_cal_items (coach_id, kind, title, starts_at, ends_at, time_zone, all_day, notes, created_at)
select md5('coachrow' || k)::uuid, (array['admin','own_time','writing'])[x], (array['Admin and email','Lunch and a walk','Write the newsletter'])[x],
       ((d.today + n)::timestamp + make_interval(hours => (array[8, 12, 16])[x])) at time zone 'Europe/London',
       ((d.today + n)::timestamp + make_interval(hours => (array[8, 12, 16])[x], mins => 45)) at time zone 'Europe/London', 'Europe/London', false,
       case when x = 3 then 'Draft in the shared folder.' end, now() - interval '400 days'
from generate_series(1, 15) k, generate_series(-365, 365) n, generate_series(1, 3) x, scale_seed.dates d
where extract(isodow from d.today + n) < 6 and (x < 3 or k = 1);
insert into public.coach_away (coach_id, starts_on, ends_on)
select md5('coachrow' || k)::uuid, d.today + w * 91 + k, d.today + w * 91 + k + 6 from generate_series(1, 15) k, generate_series(-4, 3) w, scale_seed.dates d;

-- Bookings: the owner's from leads (in part 4); associates' chemistry calls, 40 each over the two years.
insert into public.coach_bookings (coach_id, call_type_id, name, email, time_zone, starts_at, ends_at, status, source, created_at)
select md5('coachrow' || k)::uuid, md5('ct' || k || '-1')::uuid, n.first_name || ' ' || n.last_name, 'scale-guest-' || k || '-' || b || '@example.com', 'Europe/London',
       ((d.today - 365 + b * 18)::timestamp + interval '15 hours 15 minutes') at time zone 'Europe/London',
       ((d.today - 365 + b * 18)::timestamp + interval '15 hours 45 minutes') at time zone 'Europe/London',
       case when b % 9 = 0 then 'cancelled' else 'booked' end, 'page', (d.today - 365 + b * 18 - 5)::timestamptz
from generate_series(2, 15) k, generate_series(1, 40) b, scale_seed.dates d join scale_seed.names n on true
where n.i = 1100 + k * 40 + b - 40;
insert into public.coach_booking_links (coach_id, purpose, for_name, for_email, call_name, minutes, expires_on, created_at)
select md5('coachrow' || k)::uuid, 'A first call', 'Guest ' || l, 'scale-link-' || k || '-' || l || '@example.com', 'Chemistry call', 30, d.today + 30 - l, now() - make_interval(days => l * 7)
from generate_series(1, 15) k, generate_series(1, 20) l, scale_seed.dates d;

-- 6,000 coach to-dos: the owner 1,500, the others the rest; 5 lists each.
insert into public.coach_todo_lists (id, coach_id, name, position, finished_at)
select md5('tlist' || k || '-' || l)::uuid, md5('coachrow' || k)::uuid, (array['Business admin','Marketing','Workshop prep','Book','Website'])[l], l,
       case when l = 5 then now() - interval '30 days' end
from generate_series(1, 15) k, generate_series(1, 5) l;
insert into public.coach_todos (coach_id, title, notes, important, planned_on, due_on, minutes, list_id, profile_id, someday, position, done_at, created_at)
select md5('coachrow' || t.k)::uuid, 'Follow up item ' || t.n, case when t.n % 7 = 0 then 'Check the notes from last time first.' end, t.n % 11 = 0,
       case when t.n % 10 in (0, 1) then null else d.today + (t.n % 120) - 90 end, case when t.n % 13 = 0 then d.today + t.n % 20 end,
       case when t.n % 4 = 0 then 30 end, case when t.n % 6 = 0 then md5('tlist' || t.k || '-' || (1 + t.n % 5))::uuid end,
       case when t.n % 5 = 0 then (select md5('cprof' || cc.i)::uuid from scale_seed.client_coach cc where cc.k = t.k order by cc.i offset (t.n % 8) limit 1) end,
       t.n % 10 = 0, t.n, case when t.n % 120 < 88 then (d.today + (t.n % 120) - 90)::timestamptz + interval '15 hours' end, (d.today - 100 + t.n % 90)::timestamptz
from (select k, n from generate_series(1, 15) k, generate_series(1, 1500) n where n <= case when k = 1 then 1500 else 321 + (k % 2) end) t, scale_seed.dates d;

insert into public.coach_notifications (coach_id, kind, title, detail, item_kind, created_at, read_at)
select md5('coachrow' || k)::uuid, (array['booking','call','sharing','other'])[1 + x % 4], 'Something happened, number ' || x, 'Detail ' || x, 'other',
       now() - make_interval(hours => x * 7), case when x > 5 then now() - make_interval(hours => x * 7 - 1) end
from generate_series(1, 15) k, generate_series(1, 300) x;
insert into public.activity_log (actor_id, actor_name, kind, summary, item, created_at)
select md5('coach' || (1 + x % 15))::uuid, 'Coach ' || (1 + x % 15), (array['move','export','other','agreement'])[1 + x % 4], 'did something to a client, entry ' || x || '.', '{}',
       now() - make_interval(hours => x * 5)
from generate_series(1, 2000) x;
insert into public.time_entries (engagement_id, coach_id, started_at, ended_at, note)
select md5('eng' || cc.i)::uuid, md5('coachrow' || cc.k)::uuid, (d.today - w * 7)::timestamptz + interval '9 hours', (d.today - w * 7)::timestamptz + interval '10 hours 30 minutes', 'Prep'
from scale_seed.client_coach cc, generate_series(1, 20) w, scale_seed.dates d where cc.i % 10 = 0;

do $$ begin raise notice 'SEED part 3: % sessions, % calendar items, % bookings, % coach to-dos', (select count(*) from public.coach_sessions),
  (select count(*) from public.coach_cal_items), (select count(*) from public.coach_bookings), (select count(*) from public.coach_todos); end $$;
