-- Invented old-style plans (missions, strategies, tactics, versions, reviews)
-- for proving the plan conversion (scripts/convert-plans/run.mjs). Runs only
-- inside the rolled-back dry run on the test database; nothing is kept.
-- Invented names only.

insert into auth.users (id, email, aud, role)
select md5('oldplan-' || n)::uuid, 'oldplan-' || n || '@example.invalid', 'authenticated', 'authenticated' from generate_series(1, 6) n;
update public.profiles p set first_name = v.first, last_name = v.last
  from (values (1, 'Asha', 'Invented'), (2, 'Ben', 'Invented'), (3, 'Cleo', 'Invented'), (4, 'Dev', 'Invented'), (5, 'Elif', 'Invented'), (6, 'Femi', 'Invented')) v(n, first, last)
 where p.id = md5('oldplan-' || v.n)::uuid;

-- missions: one live each (person 6 has none live), plus archived ones
insert into public.missions (id, user_id, title, archived_at) values
  (md5('om-1')::uuid, md5('oldplan-1')::uuid, 'Build a sales team that grows without me in every deal', null),
  (md5('om-2')::uuid, md5('oldplan-2')::uuid, 'Lead the operations function so that the business can double without the wheels coming off, while keeping the people who make it work happy, healthy and growing in their roles', null),
  (md5('om-3')::uuid, md5('oldplan-3')::uuid, 'Be the calm, clear head of a growing clinic', null),
  (md5('om-4')::uuid, md5('oldplan-4')::uuid, 'Turn the product team into the best place to build things', null),
  (md5('om-5')::uuid, md5('oldplan-5')::uuid, 'Steady growth with my health intact', null),
  (md5('om-5-old')::uuid, md5('oldplan-5')::uuid, 'An older mission', now() - interval '200 days'),
  (md5('om-6-old')::uuid, md5('oldplan-6')::uuid, 'Only an archived mission', now() - interval '30 days');

insert into public.strategies (id, mission_id, name, description, sort_order) values
  (md5('os-1-1')::uuid, md5('om-1')::uuid, 'Grow through referrals', 'Ask, thank, follow up', 1),
  (md5('os-1-2')::uuid, md5('om-1')::uuid, 'Coach the team to close', null, 2),
  (md5('os-1-3')::uuid, md5('om-1')::uuid, 'Sustain my energy', null, 3),
  (md5('os-2-1')::uuid, md5('om-2')::uuid, 'Standardise how work flows across the three sites so that nobody has to reinvent the wheel every single week', null, 1),
  (md5('os-2-2')::uuid, md5('om-2')::uuid, 'Hire ahead of growth', null, 2),
  (md5('os-3-1')::uuid, md5('om-3')::uuid, 'Protect thinking time', null, 1),
  (md5('os-3-2')::uuid, md5('om-3')::uuid, 'Grow the patient list', null, 2),
  (md5('os-3-3')::uuid, md5('om-3')::uuid, 'A strategy with nothing in it yet', null, 3),
  (md5('os-4-1')::uuid, md5('om-4')::uuid, 'Ship smaller, sooner', null, 1),
  (md5('os-5-1')::uuid, md5('om-5')::uuid, 'Move every day', null, 1),
  (md5('os-5-2')::uuid, md5('om-5')::uuid, 'Grow revenue steadily', null, 2);

insert into public.tactics (id, strategy_id, action, type, target_value, unit, current_value, is_done, sort_order) values
  (md5('ot-1')::uuid, md5('os-1-1')::uuid, 'Referral conversations', 'measurable', 3, 'per week', 1, false, 1),
  (md5('ot-2')::uuid, md5('os-1-1')::uuid, 'Revenue from referrals', 'measurable', 250000, '£', 120000, false, 2),
  (md5('ot-3')::uuid, md5('os-1-1')::uuid, 'Email three past clients', 'tickable', null, null, null, false, 3),
  (md5('ot-4')::uuid, md5('os-1-2')::uuid, 'Weekly one-to-one with each rep', 'tickable', null, null, null, false, 1),
  (md5('ot-5')::uuid, md5('os-1-2')::uuid, 'Hire a second account executive', 'tickable', null, null, null, false, 2),
  (md5('ot-6')::uuid, md5('os-1-3')::uuid, 'Training sessions', 'measurable', 3, 'sessions', 2, false, 1),
  (md5('ot-7')::uuid, md5('os-1-3')::uuid, 'Book a holiday', 'tickable', null, null, null, true, 2),
  (md5('ot-8')::uuid, md5('os-2-1')::uuid, 'Map the order-to-cash process', 'tickable', null, null, null, false, 1),
  (md5('ot-9')::uuid, md5('os-2-1')::uuid, 'Daily stand-up with site leads', 'tickable', null, null, null, false, 2),
  (md5('ot-10')::uuid, md5('os-2-2')::uuid, 'Open roles filled', 'measurable', 6, null, 2, false, 1),
  (md5('ot-11')::uuid, md5('os-3-1')::uuid, 'Two-hour thinking block every Monday morning', 'tickable', null, null, null, false, 1),
  (md5('ot-12')::uuid, md5('os-3-1')::uuid, 'Reading', 'measurable', 20, 'minutes a day', 10, false, 2),
  (md5('ot-13')::uuid, md5('os-3-2')::uuid, 'Active patients', 'measurable', 1200, 'patients', 950, false, 1),
  (md5('ot-14')::uuid, md5('os-3-2')::uuid, 'Launch the new booking site by March', 'tickable', null, null, null, false, 2),
  (md5('ot-15')::uuid, md5('os-4-1')::uuid, 'Release every two weeks', 'tickable', null, null, null, false, 1),
  (md5('ot-16')::uuid, md5('os-4-1')::uuid, 'Customer NPS', 'measurable', 50, 'NPS', 31, false, 2),
  (md5('ot-17')::uuid, md5('os-4-1')::uuid, 'Talk to Priya about the roadmap 🚀', 'tickable', null, null, null, false, 3),
  (md5('ot-18')::uuid, md5('os-5-1')::uuid, 'Steps', 'measurable', 8000, 'steps', 5000, false, 1),
  (md5('ot-19')::uuid, md5('os-5-2')::uuid, 'Monthly revenue', 'measurable', 40000, 'GBP', 31000, false, 1),
  (md5('ot-20')::uuid, md5('os-5-2')::uuid, 'Something', 'measurable', null, null, null, false, 2);

insert into public.mission_versions (mission_id, user_id, major, minor, change_type, snapshot, change_note)
select md5('om-' || n)::uuid, md5('oldplan-' || n)::uuid, v, 0, case when v = 1 then 'start' else 'major' end, '{}', 'Invented version'
from generate_series(1, 5) n, generate_series(1, 1 + n % 3) v;
insert into public.mission_progress_reviews (mission_id, user_id, review_data)
select md5('om-' || n)::uuid, md5('oldplan-' || n)::uuid, '{}' from generate_series(1, 4) n, generate_series(1, n) r;
