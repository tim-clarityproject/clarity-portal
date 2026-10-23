-- =============================================================================
-- Invented test data for The Clarity Portal's TEST project only.
--
-- Run through scripts/seed-test-data.sh, which checks it is talking to the
-- test project (clarity-portal-test) before connecting, and runs this whole
-- file as one transaction: if anything fails, nothing is kept.
--
-- Every name, company, figure and sentence here is invented. Nothing is
-- copied from the live database.
--
-- Safe to run again: it first removes the invented data it added before for
-- the four test accounts, then adds it afresh, so nothing is doubled.
--
-- The app has no coach, owner or organisation link in its database (every
-- table belongs to one person). So the coaching relationships below exist
-- only as wording in the invented profiles and plans:
--   Alex Morgan  coach-owner@example.com  owner coach
--   Priya Shah   coach-two@example.com    subcontractor coach
--   Sam Carter   client@example.com       client of Alex
--   Jordan Lee   org-client@example.com   client of Priya, paid for by
--                                         Northbridge Logistics
-- =============================================================================

set search_path = public, extensions;

-- -----------------------------------------------------------------------------
-- The four accounts, found by email
-- -----------------------------------------------------------------------------
create temp table seed_people (
  key          text primary key,
  email        text not null,
  first_name   text not null,
  last_name    text not null,
  job_role     text not null,
  organisation text,
  id           uuid
) on commit drop;

insert into seed_people (key, email, first_name, last_name, job_role, organisation) values
  ('alex',   'coach-owner@example.com', 'Alex',   'Morgan', 'Coach (owner)',              'The Clarity Project (test)'),
  ('priya',  'coach-two@example.com',   'Priya',  'Shah',   'Associate coach',            'The Clarity Project (test)'),
  ('sam',    'client@example.com',      'Sam',    'Carter', 'Founder',                    'Harbour Lane Studio'),
  ('jordan', 'org-client@example.com',  'Jordan', 'Lee',    'Head of Depot Operations',   'Northbridge Logistics');

update seed_people p set id = u.id
  from auth.users u
 where lower(u.email) = p.email;

do $check$
declare
  missing text;
begin
  select string_agg(email, ', ' order by email) into missing from seed_people where id is null;
  if missing is not null then
    raise exception 'These test accounts are missing from the test project: %', missing;
  end if;
  if to_regclass('public.profiles') is null or to_regclass('public.decisions') is null then
    raise exception 'The app''s tables are not in the test project yet. Run scripts/copy-structure-to-test.sh first.';
  end if;
end
$check$;

-- -----------------------------------------------------------------------------
-- Helpers (temporary: they disappear when this run ends)
-- -----------------------------------------------------------------------------

-- Sets a text column on a profile, only if the column exists on this
-- database (a few profile columns were added outside the saved migrations).
create function pg_temp.set_profile_text(p_id uuid, p_col text, p_val text)
returns void
language plpgsql
as $fn$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'profiles' and column_name = p_col) then
    execute format('update public.profiles set %I = $1 where id = $2', p_col) using p_val, p_id;
  end if;
end
$fn$;

-- A date as the app writes it in a few titles, e.g. "Friday 23rd Oct, 2026".
create function pg_temp.long_date(d date)
returns text
language sql
as $fn$
  select trim(to_char(d, 'Day')) || ' ' || to_char(d, 'FMDDth') || ' ' || to_char(d, 'Mon') || ', ' || to_char(d, 'YYYY');
$fn$;

-- A date and time of day as a timestamp (e.g. day 3 days ago at 07:40).
create function pg_temp.day_at(days_ago integer, hh integer, mi integer)
returns timestamptz
language sql
as $fn$
  select ((current_date - days_ago) + make_time(hh, mi, 0))::timestamptz;
$fn$;

-- -----------------------------------------------------------------------------
-- 1. Remove what an earlier run added (test accounts only)
-- -----------------------------------------------------------------------------
do $clear$
declare
  ids uuid[];
begin
  select array_agg(id) into ids from seed_people;

  -- Plan-review entries point at decisions by id inside their text, so they
  -- go first with the rest of journal_entries.
  delete from public.journal_entries where user_id = any (ids);
  delete from public.decisions where user_id = any (ids);
  -- Strategies, tactics, versions and progress reviews go with their mission.
  delete from public.mission_progress_reviews where user_id = any (ids);
  if to_regclass('public.mission_versions') is not null then
    delete from public.mission_versions where user_id = any (ids);
  end if;
  delete from public.missions where user_id = any (ids);
  if to_regclass('public.daily_journals') is not null then
    delete from public.daily_journals where user_id = any (ids);
  end if;
  if to_regclass('public.breathing_sessions') is not null then
    delete from public.breathing_sessions where user_id = any (ids);
  end if;
  if to_regclass('public.wheel_of_life_checkins') is not null then
    delete from public.wheel_of_life_checkins where user_id = any (ids);
    delete from public.wheel_of_life_areas where user_id = any (ids);
    delete from public.wheel_of_life_settings where user_id = any (ids);
  end if;
  if to_regclass('public.reflections') is not null then
    delete from public.reflections where user_id = any (ids);
  end if;
  if to_regclass('public.alignment_sessions') is not null then
    delete from public.alignment_sessions
     where respondent_email in (select email from seed_people) or user_id = any (ids);
  end if;
end
$clear$;

-- -----------------------------------------------------------------------------
-- 2. Accounts and profiles for all four
-- -----------------------------------------------------------------------------

-- Names in the sign-in record too: the app copies these onto the profile at
-- every sign-in, so they must agree. Confirmed, so password sign-in works.
update auth.users u
   set raw_user_meta_data = coalesce(u.raw_user_meta_data, '{}'::jsonb)
         || jsonb_build_object('first_name', p.first_name, 'last_name', p.last_name),
       email_confirmed_at = coalesce(u.email_confirmed_at, now())
  from seed_people p
 where u.id = p.id;

insert into public.profiles (id, email)
select id, email from seed_people
on conflict (id) do nothing;

do $profiles$
declare
  r record;
begin
  for r in select * from seed_people loop
    perform pg_temp.set_profile_text(r.id, 'first_name', r.first_name);
    perform pg_temp.set_profile_text(r.id, 'last_name', r.last_name);
    perform pg_temp.set_profile_text(r.id, 'role', r.job_role);
    perform pg_temp.set_profile_text(r.id, 'organisation', r.organisation);
  end loop;
end
$profiles$;

-- -----------------------------------------------------------------------------
-- 3. A few weeks of history for the two clients
-- -----------------------------------------------------------------------------
create function pg_temp.seed_client(p_user uuid, v integer)
returns void
language plpgsql
as $fn$
declare
  -- v = 1: Sam Carter, founder of Harbour Lane Studio, coached by Alex Morgan
  -- v = 2: Jordan Lee, depot operations at Northbridge Logistics, coached by Priya Shah
  mission_title text := (array[
    'Grow Harbour Lane Studio without giving up my evenings',
    'Lead the Northbridge depots through the new routing system calmly'])[v];
  strategy_names text[] := (array[
    array['Win better-fit clients', 'Protect deep-work time', 'Build a team I can lean on'],
    array['Make the routing rollout boring', 'Coach my shift leads', 'Look after my own energy']])[v:v];
  strategy_descs text[] := (array[
    array['Fewer, larger projects with clients who value design.',
          'Mornings are for design work, not email.',
          'Hire and train so the studio does not rely on me for everything.'],
    array['No missed deliveries during the switch-over.',
          'Shift leads solve problems before they reach me.',
          'Keep the pace sustainable through peak season.']])[v:v];
  tactic_actions text[] := (array[
    array['Send three proposals to retained-work prospects', 'Raise day rate for new clients',
          'Block 09:00 to 12:00 four days a week', 'Turn off email notifications before noon',
          'Write the junior designer role description', 'Hold a weekly studio review on Fridays'],
    array['Run the routing pilot at Leeds depot', 'Track on-time deliveries each week',
          'Hold a 1:1 with each shift lead every fortnight', 'Agree a decision guide for shift leads',
          'Leave the depot by 18:00 four days a week', 'Walk at lunchtime three times a week']])[v:v];
  tactic_types text[] := (array[
    array['measurable', 'tickable', 'measurable', 'tickable', 'tickable', 'measurable'],
    array['measurable', 'measurable', 'measurable', 'tickable', 'measurable', 'measurable']])[v:v];
  tactic_targets numeric[] := (array[array[3, null, 4, null, null, 4], array[1, 97, 6, null, 4, 3]])[v:v];
  tactic_units text[] := (array[
    array['proposals', null, 'days', null, null, 'reviews'],
    array['pilots', '%', '1:1s', null, 'days', 'walks']])[v:v];
  tactic_current numeric[] := (array[array[2, null, 3, null, null, 2], array[1, 94, 4, null, 3, 2]])[v:v];
  tactic_done boolean[] := (array[array[null, true, null, false, true, null], array[null, null, null, true, null, null]])[v:v];

  priorities text[] := (array[
    array['Finish the Larkspur Bakery brand concepts', 'Send the Morrow Cycles proposal',
          'Review the junior designer applications', 'Prepare for the Fenwick Gallery pitch',
          'Clear the invoices before the month ends', 'Draft the studio pricing page',
          'Final colour checks on the Larkspur packaging', 'Call two past clients about retained work',
          'Plan next month''s project schedule', 'Present concepts to Morrow Cycles'],
    array['Brief the Leeds shift leads on the routing pilot', 'Review last week''s late deliveries',
          'Agree the peak-season rota with HR', 'Walk the Doncaster depot floor',
          'Prepare the routing update for the board', 'Fortnightly 1:1s with Aisha and Tom',
          'Sort the driver handover issue at Leeds', 'Check the new scanners are on order',
          'Write the pilot lessons-learned note', 'Plan the Wakefield depot go-live']])[v:v];
  gratitude text[] := (array[
    array['A quiet studio this morning', 'A kind note from a client', 'Coffee with my sister',
          'The new desk lamp finally arrived', 'A good night''s sleep'],
    array['The night shift handled the van breakdown well', 'Aisha stepping up at Leeds',
          'A clear run on the motorway', 'My daughter''s school play', 'Sunshine at the depot']])[v:v];
  show_up text[] := (array[
    array['Focused and unhurried', 'Clear and confident with clients', 'Patient and curious'],
    array['Calm and visible on the floor', 'Listening before fixing', 'Steady under pressure']])[v:v];
  not_do text[] := (array[
    array['Check email before 12:00', 'Say yes to a rush job on the spot', 'Redo the junior''s work myself'],
    array['Jump in and solve every problem myself', 'Answer messages during 1:1s', 'Skip lunch']])[v:v];
  went_well text[] := (array[
    array['I kept the morning block and the concepts are nearly there.', 'The proposal went out on time and read well.',
          'I said no to a rush job without feeling guilty.', 'The pitch prep is in good shape.',
          'Invoices are cleared, which takes a weight off.'],
    array['The shift leads asked good questions about the pilot.', 'We found the cause of most late deliveries.',
          'HR agreed the rota without a fight.', 'I spent an hour on the floor and learned a lot.',
          'The board update is drafted and clear.']])[v:v];
  differently text[] := (array[
    array['Start the hardest task before opening anything else.', 'Leave more time for the final read-through.',
          'Ask for the brief in writing first.', 'Stop at 18:00 even if it is not perfect.',
          'Batch the admin into one slot.'],
    array['Let Aisha lead the briefing rather than me.', 'Share the figures before the meeting, not during it.',
          'Book the meeting room earlier.', 'Take notes on my phone, not on scraps of paper.',
          'Ask the drivers, not just the managers.']])[v:v];
  journal_texts text[] := (array[
    array['The studio feels calmer since I moved email to the afternoon. I am still tempted to check it, but the work is better.',
          'Worried about the Morrow Cycles budget. I think I am avoiding the conversation about scope.',
          'Good day. The Larkspur concepts came together and I left on time for once.',
          'Interviewed two designers. One of them asked better questions than I would have at that stage.',
          'Tired today. A slower day is fine. The plan still holds.'],
    array['The pilot is going better than I expected. The shift leads are more confident than they let on.',
          'I am avoiding the conversation with Tom about his timekeeping. It needs to happen this week.',
          'A good day would be leaving by 18:00 and still feeling on top of things.',
          'Grateful for Aisha. She handled the scanner failure without calling me.',
          'Peak season is coming. I want to go into it rested, not already running on empty.']])[v:v];

  journal_prompts text[] := array['What is on my mind?', 'What am I avoiding?', 'What would make today a good day?',
                                   'What am I grateful for?', 'What is on my mind?'];

  m_id uuid;
  s_ids uuid[] := '{}';
  t_ids uuid[] := '{}';
  s_id uuid;
  t_id uuid;
  v_id uuid;
  d_id uuid;
  i integer;
  j integer;
  n integer;
  plan_days integer[] := array[1, 2, 3, 4, 5, 8, 9, 10, 11, 12];
  reviewed_days integer[] := array[1, 2, 3, 5, 8];
  d date;
  snapshot jsonb;
  review_strategies jsonb := '[]'::jsonb;
  review_tactics jsonb := '{}'::jsonb;
  strat_tactics jsonb;
  last_sunday date := date_trunc('week', current_date)::date - 1;
  area_keys text[] := array['career', 'financial', 'health', 'relationships', 'romance',
                            'growth', 'fun', 'home', 'contribution', 'meaning'];
  area_labels text[] := array['Career / Work', 'Financial / Money', 'Health / Fitness',
                              'Relationships / Family', 'Romance / Partner', 'Personal Growth / Learning',
                              'Fun / Recreation', 'Physical Environment / Home',
                              'Contribution / Community', 'Purpose / Meaning'];
  scores_then integer[] := (array[array[6, 5, 4, 7, 6, 6, 3, 7, 4, 6], array[7, 6, 4, 6, 7, 5, 4, 6, 5, 6]])[v:v];
  scores_now integer[] := (array[array[7, 6, 5, 7, 6, 7, 5, 7, 4, 7], array[7, 6, 6, 7, 7, 6, 5, 6, 5, 7]])[v:v];
  areas_json jsonb;
  c_ids text[];
  p_ids text[];
  ratings jsonb := '{}'::jsonb;
  contrib jsonb;
begin
  -- Personal operating plan: mission, three strategies, six tactics
  insert into public.missions (user_id, title, created_at, updated_at)
  values (p_user, mission_title, pg_temp.day_at(21, 19, 5), pg_temp.day_at(10, 18, 40))
  returning id into m_id;

  for i in 1..3 loop
    insert into public.strategies (mission_id, name, description, sort_order, created_at, updated_at)
    values (m_id, strategy_names[1][i], strategy_descs[1][i], i - 1, pg_temp.day_at(21, 19, 5), pg_temp.day_at(21, 19, 5))
    returning id into s_id;
    s_ids := s_ids || s_id;
    for j in 1..2 loop
      n := (i - 1) * 2 + j;
      insert into public.tactics (strategy_id, action, type, target_value, unit, current_value, is_done,
                                  sort_order, last_reviewed_at, created_at, updated_at)
      values (s_id, tactic_actions[1][n], tactic_types[1][n],
              case when tactic_types[1][n] = 'measurable' then tactic_targets[1][n] end,
              case when tactic_types[1][n] = 'measurable' then tactic_units[1][n] end,
              case when tactic_types[1][n] = 'measurable' then tactic_current[1][n] end,
              case when tactic_types[1][n] = 'tickable' then coalesce(tactic_done[1][n], false) end,
              j - 1, pg_temp.day_at(7, 17, 30), pg_temp.day_at(21, 19, 5), pg_temp.day_at(7, 17, 30))
      returning id into t_id;
      t_ids := t_ids || t_id;
    end loop;
  end loop;

  -- The plan as a snapshot, the way the app stores each version
  select jsonb_build_object(
           'schema_version', 1,
           'mission', jsonb_build_object('title', mission_title),
           'strategies', jsonb_agg(jsonb_build_object(
             'name', s.name, 'description', s.description, 'sort_order', s.sort_order,
             'tactics', (select coalesce(jsonb_agg(jsonb_build_object(
                           'action', t.action, 'type', t.type, 'target_value', t.target_value,
                           'unit', t.unit, 'current_value', t.current_value, 'is_done', t.is_done,
                           'sort_order', t.sort_order) order by t.sort_order), '[]'::jsonb)
                           from public.tactics t where t.strategy_id = s.id)
           ) order by s.sort_order))
    into snapshot
    from public.strategies s where s.mission_id = m_id;

  if to_regclass('public.mission_versions') is not null then
    -- Version 1.0 had one tactic fewer; 1.1 added it.
    insert into public.mission_versions (mission_id, user_id, major, minor, change_type, snapshot, change_note, created_at)
    values (m_id, p_user, 1, 0, 'start',
            jsonb_set(snapshot, '{strategies,2,tactics}', (snapshot #> '{strategies,2,tactics}') - 1),
            'First Version.', pg_temp.day_at(21, 19, 5));
    insert into public.mission_versions (mission_id, user_id, major, minor, change_type, snapshot, change_note, created_at)
    values (m_id, p_user, 1, 1, 'minor', snapshot, 'Tactic added.', pg_temp.day_at(10, 18, 40))
    returning id into v_id;
  end if;

  -- One finished progress review of the plan, a week ago
  for i in 1..3 loop
    strat_tactics := '[]'::jsonb;
    for j in 1..2 loop
      n := (i - 1) * 2 + j;
      strat_tactics := strat_tactics || (
        select jsonb_build_object(
                 'id', t.id, 'action', t.action, 'type', t.type,
                 'target_value', t.target_value, 'unit', t.unit,
                 'reviewed_is_done', case when t.type = 'tickable' then t.is_done end,
                 'reviewed_value', case when t.type = 'measurable' then t.current_value end,
                 'reviewed_note', case when n = 1 then 'Good progress this fortnight.' else '' end)
          from public.tactics t where t.id = t_ids[n]);
      review_tactics := review_tactics || (
        select jsonb_build_object(t.id::text, jsonb_build_object(
                 'isDone', coalesce(t.is_done, false),
                 'value', coalesce(to_jsonb(t.current_value), to_jsonb(''::text)),
                 'note', case when n = 1 then 'Good progress this fortnight.' else '' end))
          from public.tactics t where t.id = t_ids[n]);
    end loop;
    review_strategies := review_strategies || jsonb_build_array(
      (select jsonb_build_object('id', s.id, 'name', s.name, 'description', s.description, 'tactics', strat_tactics)
         from public.strategies s where s.id = s_ids[i]));
  end loop;

  if to_regclass('public.mission_versions') is not null then
    insert into public.mission_progress_reviews (mission_id, user_id, review_data, plan_version_id, status, created_at, updated_at)
    values (m_id, p_user,
            jsonb_build_object('mission_id', m_id, 'mission_title', mission_title,
                               'tactics', review_tactics, 'strategies', review_strategies),
            v_id, 'final', pg_temp.day_at(7, 17, 30), pg_temp.day_at(7, 17, 30));
  else
    insert into public.mission_progress_reviews (mission_id, user_id, review_data, created_at)
    values (m_id, p_user,
            jsonb_build_object('mission_id', m_id, 'mission_title', mission_title,
                               'tactics', review_tactics, 'strategies', review_strategies),
            pg_temp.day_at(7, 17, 30));
  end if;

  perform pg_temp.set_profile_text(p_user, 'personal_goal', mission_title);

  -- Daily plans over the last two weeks (none today, so Home suggests one),
  -- with day reviews for some of them
  for i in 1..array_length(plan_days, 1) loop
    d := current_date - plan_days[i];
    insert into public.decisions (user_id, tool_type, title, form_data, draft, status, created_at, updated_at)
    values (p_user, 'daily_plan',
            'Daily Plan - ' || to_char(d, 'Dy, Mon FMDD, YYYY'),
            jsonb_build_object(
              'gratitude', gratitude[1][((i - 1) % 5) + 1],
              'topPriority', priorities[1][i],
              'showUp', show_up[1][((i - 1) % 3) + 1],
              'notDo', not_do[1][((i - 1) % 3) + 1]),
            false, 'completed', pg_temp.day_at(plan_days[i], 7, 40 + (i % 5)), pg_temp.day_at(plan_days[i], 7, 48))
    returning id into d_id;

    if plan_days[i] = any (reviewed_days) then
      n := array_position(reviewed_days, plan_days[i]);
      insert into public.journal_entries (user_id, entry_date, review_type, title, content, status, created_at, updated_at)
      values (p_user, d, 'plan-review', pg_temp.long_date(d),
              jsonb_build_object('a', went_well[1][n], 'b', differently[1][n],
                                 'planKind', 'daily_plan', 'planId', d_id,
                                 'dateKey', to_char(d, 'YYYY-MM-DD'),
                                 'reviewType', 'plan-review', 'draft', false)::text,
              'final', pg_temp.day_at(plan_days[i], 17, 50), pg_temp.day_at(plan_days[i], 17, 55));
    end if;
  end loop;

  -- A meeting plan, with its day review
  insert into public.decisions (user_id, tool_type, title, form_data, draft, status, created_at, updated_at)
  values (p_user, 'plan_meeting',
          (array['Morrow Cycles kick-off', 'Routing pilot review with shift leads'])[v],
          jsonb_build_object(
            'title', (array['Morrow Cycles kick-off', 'Routing pilot review with shift leads'])[v],
            'date', to_char(current_date - 3, 'YYYY-MM-DD'),
            'time', (array['10:00', '14:30'])[v],
            'chair', (array['Sam Carter', 'Jordan Lee'])[v],
            'objectives', jsonb_build_array(
              jsonb_build_object('id', 1, 'text', (array['Agree the scope and the first milestone', 'Agree what to change before Wakefield'])[v]),
              jsonb_build_object('id', 2, 'text', (array['Confirm who signs off designs', 'Decide who owns the driver handover'])[v])),
            'flowItems', jsonb_build_array(
              jsonb_build_object('id', 1, 'item', 'Introductions', 'aim', 'Everyone knows who does what', 'lead', (array['Sam', 'Jordan'])[v], 'length', '10'),
              jsonb_build_object('id', 2, 'item', (array['Scope and budget', 'Pilot figures'])[v], 'aim', 'Shared view of where we are', 'lead', (array['Sam', 'Aisha'])[v], 'length', '20'),
              jsonb_build_object('id', 3, 'item', 'Next steps', 'aim', 'Owners and dates agreed', 'lead', (array['Sam', 'Jordan'])[v], 'length', '15')),
            'sections', jsonb_build_array('agenda'),
            'meetingContext', '', 'preReads', ''),
          false, 'completed', pg_temp.day_at(3, 8, 10), pg_temp.day_at(3, 8, 25))
  returning id into d_id;

  insert into public.journal_entries (user_id, entry_date, review_type, title, content, status, created_at, updated_at)
  values (p_user, current_date - 3, 'plan-review',
          (array['Morrow Cycles kick-off', 'Routing pilot review with shift leads'])[v],
          jsonb_build_object('a', 'We agreed the first milestone and everyone left clear on their part.',
                             'b', 'Send the agenda a day earlier.',
                             'planKind', 'plan_meeting', 'planId', d_id,
                             'dateKey', to_char(current_date - 3, 'YYYY-MM-DD'),
                             'reviewType', 'plan-review', 'draft', false)::text,
          'final', pg_temp.day_at(3, 16, 5), pg_temp.day_at(3, 16, 9));

  -- An If-Then plan
  insert into public.decisions (user_id, tool_type, title, form_data, draft, status, created_at, updated_at)
  values (p_user, 'if_then_planning',
          (array['When a rush job lands', 'When a shift lead calls me'])[v],
          jsonb_build_object(
            'situation', (array['Clients ask for rush work that breaks my morning block.',
                                'Shift leads call me about problems they could solve.'])[v],
            'items', jsonb_build_array(
              jsonb_build_object('id', 1,
                'ifCondition', (array['a client asks for something today', 'a shift lead calls with a problem'])[v],
                'thenAction', (array['I reply with the earliest slot after 12:00', 'I ask what they would do first'])[v]),
              jsonb_build_object('id', 2,
                'ifCondition', (array['I feel the urge to check email before noon', 'I am about to drive to a depot to fix it'])[v],
                'thenAction', (array['I write the thought down and keep designing', 'I wait ten minutes and call back'])[v]))),
          false, 'completed', pg_temp.day_at(6, 20, 15), pg_temp.day_at(6, 20, 25));

  -- A Stop Doing audit
  insert into public.decisions (user_id, tool_type, title, form_data, draft, status, created_at, updated_at)
  values (p_user, 'stop_doing_audit', 'Reclaiming my time',
          jsonb_build_object(
            'items', jsonb_build_array(
              jsonb_build_object('id', 1, 'activity', (array['Chasing late invoices', 'Checking every delivery report'])[v], 'timePerWeek', '3', 'action', 'Automate'),
              jsonb_build_object('id', 2, 'activity', (array['Social media posting', 'Covering for absent shift leads'])[v], 'timePerWeek', '4', 'action', 'Delegate'),
              jsonb_build_object('id', 3, 'activity', (array['Unpaid pitch work', 'Weekly status meeting nobody needs'])[v], 'timePerWeek', '2', 'action', 'Stop')),
            'firstAction', 3,
            'actionHow', (array['Tell the next prospect I do not pitch for free.', 'Replace it with a short written update.'])[v],
            'timeUse', (array['Two more hours of design each week.', 'One extra hour on the depot floor.'])[v]),
          false, 'completed', pg_temp.day_at(10, 19, 0), pg_temp.day_at(10, 19, 20));

  -- A GROW decision
  insert into public.decisions (user_id, tool_type, title, form_data, draft, status, created_at, updated_at)
  values (p_user, 'grow',
          (array['Whether to hire a junior designer', 'How to staff peak season'])[v],
          jsonb_build_object(
            'goal', (array['Have help in the studio by the new year.', 'Get through peak season with no missed deliveries.'])[v],
            'constraints', (array['Cash flow is tight in January.', 'Agency drivers are hard to find in December.'])[v],
            'opportunities', (array['Two strong applicants already.', 'Three drivers want extra shifts.'])[v],
            'options', (array[jsonb_build_array('Hire full time', 'Hire part time', 'Use a freelancer'),
                              jsonb_build_array('Book agency drivers now', 'Offer overtime', 'Move the rota')])[v],
            'will_do', (array['Offer a part-time role to start in January.', 'Book agency drivers now and offer overtime.'])[v]),
          false, 'completed', pg_temp.day_at(15, 20, 30), pg_temp.day_at(15, 20, 50));

  -- One more decision tool each, the second as a draft
  if v = 1 then
    insert into public.decisions (user_id, tool_type, title, form_data, draft, status, created_at, updated_at)
    values (p_user, 'inversion', 'Raising my day rate',
            jsonb_build_object(
              'goal', 'Raise my day rate for new clients from next month.',
              'risks', jsonb_build_array('I lose the smaller clients', 'I back down when asked'),
              'riskAnswers', jsonb_build_array('Offer them a fixed-price package.', 'Write the new rate down and practise saying it.')),
            false, 'completed', pg_temp.day_at(17, 21, 0), pg_temp.day_at(17, 21, 15));
  else
    insert into public.decisions (user_id, tool_type, title, form_data, draft, status, created_at, updated_at)
    values (p_user, 'tough-conversation', 'Talking to Tom about timekeeping',
            jsonb_build_object(
              'observation', 'Tom has started three of the last five shifts late.',
              'impact', 'The early vans leave late and the drivers wait around.',
              'need', 'Shifts that start on time, and to know if something is going on for him.',
              'selectedQuestions', jsonb_build_array(0, 2),
              'customQuestion', 'What would help you get in on time?'),
            true, 'draft', pg_temp.day_at(2, 21, 10), pg_temp.day_at(2, 21, 20));
  end if;

  -- After-action reviews
  for i in 1..2 loop
    d := current_date - (array[6, 13])[i];
    insert into public.journal_entries (user_id, entry_date, review_type, title, content, status, created_at, updated_at)
    values (p_user, d, 'after-action',
            (array[array['Fenwick Gallery pitch', 'Larkspur concepts presentation'],
                   array['Leeds pilot first week', 'Scanner failure at Doncaster']])[v][i],
            jsonb_build_object(
              'q1', (array['Win the work with a clear, confident pitch.', 'Run the first week with no missed deliveries.'])[v],
              'q2', (array['They liked the ideas but asked for a lower price.', 'Two late deliveries on the Tuesday.'])[v],
              'q3', (array['I had not prepared for the price question.', 'The driver handover was not clear.'])[v],
              'q4', (array['Agree my walk-away price before the meeting.', 'Write down the handover steps with the drivers.'])[v],
              'reviewType', 'after-action')::text,
            'final', pg_temp.day_at((array[6, 13])[i], 18, 30), pg_temp.day_at((array[6, 13])[i], 18, 45));
  end loop;

  -- Weekly momentum check-ins for the last three weeks
  for i in 1..3 loop
    d := last_sunday - (i - 1) * 7;
    insert into public.journal_entries (user_id, entry_date, review_type, title, content, status, created_at, updated_at)
    values (p_user, d, 'weekly-momentum',
            'Weekly momentum check-in, week of ' || to_char(d, 'FMDD Mon'),
            jsonb_build_object(
              'q1', (array['Kept three morning blocks out of four.', 'The pilot ran without a missed delivery.'])[v],
              'q2', (array['Email crept back in on Thursday.', 'I stepped in on two problems the leads could have solved.'])[v],
              'q3', (array['Protect Thursday morning as well.', 'Let Aisha run the Monday briefing.'])[v],
              'momentum', 3 + (i % 2), 'intentionality', 4, 'communication', 3 + ((i + 1) % 2),
              'performanceUnderPressure', 3,
              'reviewType', 'weekly-momentum')::text,
            'final', (d + time '17:15')::timestamptz, (d + time '17:30')::timestamptz);
  end loop;

  -- Daily journals: five finished, and today's started as a draft
  if to_regclass('public.daily_journals') is not null then
    for i in 1..5 loop
      d := current_date - (array[1, 3, 5, 7, 9])[i];
      insert into public.daily_journals (user_id, journal_date, body, body_text, status, created_at, updated_at)
      values (p_user, d,
              jsonb_build_array(jsonb_build_object('t', 'p', 'v', journal_prompts[i]),
                                jsonb_build_object('t', 't', 'v', journal_texts[1][i])),
              journal_texts[1][i], 'final',
              pg_temp.day_at((array[1, 3, 5, 7, 9])[i], 21, 10), pg_temp.day_at((array[1, 3, 5, 7, 9])[i], 21, 20));
    end loop;
    insert into public.daily_journals (user_id, journal_date, body, body_text, status, created_at, updated_at)
    values (p_user, current_date,
            jsonb_build_array(jsonb_build_object('t', 't', 'v', 'Started early today.')),
            'Started early today.', 'draft', now(), now());
  end if;

  -- Breathing sessions
  if to_regclass('public.breathing_sessions') is not null then
    for i in 1..6 loop
      insert into public.breathing_sessions (user_id, breathing_mode, duration, date)
      values (p_user, (array['sigh', 'box', 'vagal'])[((i - 1) % 3) + 1], 60 + i * 30,
              pg_temp.day_at(i * 2, 8, 5));
    end loop;
  end if;

  -- Wheel of Life: the ten standard areas, two check-ins, chart style
  if to_regclass('public.wheel_of_life_areas') is not null then
    for i in 1..10 loop
      insert into public.wheel_of_life_areas (user_id, area_key, kind, label, active, sort_order, target, target_updated_at)
      values (p_user, area_keys[i], 'standard', null, true, i - 1,
              case when i in (1, 3, 7) then 8 end,
              case when i in (1, 3, 7) then pg_temp.day_at(28, 20, 0) end);
    end loop;

    select jsonb_agg(jsonb_build_object('key', area_keys[k], 'label', area_labels[k]) order by k)
      into areas_json from generate_series(1, 10) as k;

    insert into public.wheel_of_life_checkins (user_id, checkin_at, checkin_date, scores, areas, notes, focus_area_key, focus_note)
    values (p_user, pg_temp.day_at(28, 20, 0), current_date - 28,
            (select jsonb_object_agg(area_keys[k], scores_then[1][k]) from generate_series(1, 10) as k),
            areas_json,
            jsonb_build_object('health', 'Not much exercise lately.'),
            'health', 'Walk three times a week.');
    insert into public.wheel_of_life_checkins (user_id, checkin_at, checkin_date, scores, areas, notes, focus_area_key, focus_note)
    values (p_user, pg_temp.day_at(2, 20, 0), current_date - 2,
            (select jsonb_object_agg(area_keys[k], scores_now[1][k]) from generate_series(1, 10) as k),
            areas_json,
            jsonb_build_object('fun', 'Back to Saturday football.'),
            'contribution', 'Find one way to help locally this month.');

    insert into public.wheel_of_life_settings (user_id, chart_style)
    values (p_user, (array['sectional', 'radar'])[v]);
  end if;

  -- Strategic Alignment Health Check: Jordan's, finished, for Northbridge.
  -- Its access code is random and unknown (no code is ever stored here);
  -- scripts/README-test-database.md shows how Tim sets one of his own.
  if v = 2 and to_regclass('public.alignment_sessions') is not null then
    c_ids := array[gen_random_uuid()::text, gen_random_uuid()::text, gen_random_uuid()::text, gen_random_uuid()::text];
    p_ids := array[gen_random_uuid()::text, gen_random_uuid()::text, gen_random_uuid()::text,
                   gen_random_uuid()::text, gen_random_uuid()::text];
    for i in 1..5 loop
      contrib := '{}'::jsonb;
      for j in 1..4 loop
        contrib := contrib || jsonb_build_object(c_ids[j], ((i + j) % 4));
      end loop;
      ratings := ratings || jsonb_build_object(p_ids[i], jsonb_build_object(
                   'contrib', contrib, 'progress', ((i % 5) + 1), 'resource', (((i + 2) % 5) + 1)));
    end loop;

    insert into public.alignment_sessions
      (token, access_code_hash, client_label, respondent_email, created_by, status, current_step,
       data, version, created_at, updated_at, completed_at)
    values (
      translate(regexp_replace(encode(gen_random_bytes(32), 'base64'), '\s', '', 'g'), '+/=', '-_'),
      crypt(encode(gen_random_bytes(16), 'hex'), gen_salt('bf')),
      'Northbridge Logistics', 'org-client@example.com', 'seed-test-data', 'complete',
      jsonb_build_object('screen', 'done'),
      jsonb_build_object(
        'objective', 'Make Northbridge the most reliable regional carrier in Yorkshire by the end of next year.',
        'csfs', jsonb_build_array(
          jsonb_build_object('id', c_ids[1], 'text', 'On-time delivery above 97%'),
          jsonb_build_object('id', c_ids[2], 'text', 'Drivers who stay with us'),
          jsonb_build_object('id', c_ids[3], 'text', 'Accurate tracking for customers'),
          jsonb_build_object('id', c_ids[4], 'text', 'Costs per drop under control')),
        'projects', jsonb_build_array(
          jsonb_build_object('id', p_ids[1], 'text', 'New routing system'),
          jsonb_build_object('id', p_ids[2], 'text', 'Driver mentoring scheme'),
          jsonb_build_object('id', p_ids[3], 'text', 'Customer tracking app'),
          jsonb_build_object('id', p_ids[4], 'text', 'Electric van trial'),
          jsonb_build_object('id', p_ids[5], 'text', 'Depot layout redesign')),
        'ratings', jsonb_build_object('owner', ratings),
        'completedAt', to_char(pg_temp.day_at(5, 15, 40) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
      12, pg_temp.day_at(9, 10, 0), pg_temp.day_at(5, 15, 40), pg_temp.day_at(5, 15, 40));
  end if;
end
$fn$;

do $clients$
declare
  r record;
begin
  for r in select * from seed_people where key in ('sam', 'jordan') loop
    perform pg_temp.seed_client(r.id, case r.key when 'sam' then 1 else 2 end);
  end loop;
end
$clients$;

-- -----------------------------------------------------------------------------
-- 4. What was added (one line, read by seed-test-data.sh)
-- -----------------------------------------------------------------------------
create function pg_temp.count_rows(p_table text)
returns bigint
language plpgsql
as $fn$
declare
  n bigint := 0;
begin
  if to_regclass('public.' || p_table) is not null then
    execute format('select count(*) from public.%I where user_id in (select id from seed_people)', p_table) into n;
  end if;
  return n;
end
$fn$;

select 'profiles ' || (select count(*) from public.profiles where id in (select id from seed_people))
    || ', plans and decisions ' || pg_temp.count_rows('decisions')
    || ', reviews ' || pg_temp.count_rows('journal_entries')
    || ', daily journals ' || pg_temp.count_rows('daily_journals')
    || ', missions ' || pg_temp.count_rows('missions')
    || ', plan versions ' || pg_temp.count_rows('mission_versions')
    || ', plan reviews ' || pg_temp.count_rows('mission_progress_reviews')
    || ', breathing sessions ' || pg_temp.count_rows('breathing_sessions')
    || ', Wheel of Life check-ins ' || pg_temp.count_rows('wheel_of_life_checkins')
    || ', health checks ' || (case when to_regclass('public.alignment_sessions') is null then 0
                                  else (select count(*) from public.alignment_sessions
                                         where respondent_email in (select email from seed_people)) end);
