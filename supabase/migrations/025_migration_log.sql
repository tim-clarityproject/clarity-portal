-- =============================================================================
-- 025_migration_log.sql
-- A record, kept in each database, of which migrations have run there
--
-- WHAT THIS DOES (plain English)
--   Adds one small table, public.migration_log, with one row per migration:
--   its number, its name, whether it has run on this database, and when.
--   Each database (test and live) keeps its own list.
--
--   From 025 on, every migration records itself: its last line is
--     select public.record_migration(26, '026_what_it_does');
--   which marks it "ran" with the time, on whichever database it ran on.
--
--   Migrations 001 to 024 ran (or didn't) before this record existed, so they
--   are filled in as "not checked": a list for Tim to tick through on each
--   database. Nobody should read "not checked" as "ran". Two are marked:
--     012  "never run": it must not be run (see 017's notes).
--     003  a warning: dangerous to run again, because it would narrow the
--          tool types allowed and undo 005 and 011.
--   The two files without a number are listed too, with no number.
--
-- WHO CAN SEE IT
--   Only the database's admin role (postgres: the SQL editor and the
--   Supabase dashboard). The app's sign-ins (anon, authenticated) and the
--   service key can't read or change it: row security is on with no rules,
--   and their grants are removed. The same goes for record_migration.
--
-- SAFE TO RUN TWICE
--   Yes. The table and function are made only if missing, the list is filled
--   in only where a row is missing (a ticked row is never put back), and this
--   migration's own row is simply marked "ran" again.
--
-- HOW TO TICK A MIGRATION (SQL editor, on the database you checked)
--   update public.migration_log
--      set status = 'ran', checked_at = now()
--    where name = '007_create_personal_operating_plan';
--   To see the list:
--   select number, name, status, run_at, checked_at, warning
--     from public.migration_log order by number nulls last, name;
--   supabase/MIGRATION_LOG.md has the same list as a checklist, with what
--   each migration does and how to tell whether it ran.
--
-- WHEN TO RUN
--   Test project: now, after 024. Live project: at any time, after 024.
-- =============================================================================

create table if not exists public.migration_log (
  name        text primary key,
  number      integer unique,
  status      text not null default 'not checked'
              check (status in ('not checked', 'ran', 'never run')),
  run_at      timestamptz,
  checked_at  timestamptz,
  warning     text,
  note        text
);

comment on table public.migration_log is
  'Which migrations have run on this database. From 025 each migration records itself (record_migration); 001 to 024 were filled in as "not checked" for Tim to tick. Admin only.';

alter table public.migration_log enable row level security;
revoke all on table public.migration_log from public, anon, authenticated, service_role;

-- Marks a migration as run on this database, now. The last line of every
-- migration from 025 on.
create or replace function public.record_migration(p_number integer, p_name text)
returns void
language sql
set search_path = ''
as $$
  insert into public.migration_log (name, number, status, run_at)
  values (p_name, p_number, 'ran', now())
  on conflict (name) do update
    set number = excluded.number, status = 'ran', run_at = now();
$$;

revoke all on function public.record_migration(integer, text) from public, anon, authenticated, service_role;

-- The list for Tim to tick. Only rows that are missing are added.
insert into public.migration_log (number, name, status, warning, note) values
  (1,    '001_create_tables', 'not checked', null,
         'Decisions, reflections and strategic_alignments tables, with their rules.'),
  (2,    '002_create_journal_entries', 'not checked', null,
         'Reviews table (journal_entries), with its rules.'),
  (3,    '003_add_daily_plan_to_decisions', 'not checked',
         'Dangerous to run again: it narrows the tool types decisions allow, which undoes 005 and 011, and new saves of If-Then, meeting and Stop Doing plans would be refused.',
         'Adds daily_plan to the tool types decisions allow.'),
  (4,    '004_remove_unique_review_constraint', 'not checked', null,
         'Allows more than one review of the same type on the same day.'),
  (5,    '005_add_if_then_and_plan_tool_types', 'not checked', null,
         'Adds if_then_planning, daily_plan and plan_meeting to the tool types.'),
  (6,    '006_add_user_settings', 'not checked', null,
         'Breathing and other settings columns on profiles.'),
  (7,    '007_create_personal_operating_plan', 'not checked', null,
         'Personal Operating Plan tables: missions, strategies, tactics, mission_progress_reviews.'),
  (8,    '008_add_weekly_momentum_review_type', 'not checked', null,
         'Adds weekly-momentum to the review types.'),
  (9,    '009_add_archive_to_missions', 'not checked', null,
         'missions.archived_at, so a mission can be archived.'),
  (10,   '010_add_names_to_profiles', 'not checked', null,
         'First and last name on profiles.'),
  (11,   '011_add_stop_doing_audit_tool_type', 'not checked', null,
         'Adds stop_doing_audit to the tool types.'),
  (12,   '012_add_breathing_preference', 'never run',
         'Do not run: it adds profiles.breathing_preference, which the app no longer uses (the choice lives in breathing_settings). See 017.',
         'Never run on live, and must not be.'),
  (13,   '013_add_plan_review_type', 'not checked', null,
         'Adds plan-review to the review types.'),
  (14,   '014_add_mission_versions', 'not checked', null,
         'Personal Operating Plan version history (mission_versions).'),
  (15,   '015_create_daily_journals', 'not checked', null,
         'Daily Journal table (daily_journals).'),
  (16,   '016_add_journal_entries_status', 'not checked', null,
         'Draft or final status on reviews.'),
  (17,   '017_breathing_sessions_rls', 'not checked', null,
         'Rules on breathing_sessions. Live has the same rules under slightly different names.'),
  (18,   '018_alignment_sessions', 'not checked', null,
         'Strategic Alignment Health Check sessions and their checked functions.'),
  (19,   '019_alignment_emails', 'not checked', null,
         'Health Check emails: link to results and completion notice.'),
  (20,   '020_wheel_of_life', 'not checked', null,
         'Wheel of Life tables.'),
  (21,   '021_restore_terms_accepted_from_signup', 'not checked', null,
         'Data only: puts back "terms accepted" from the sign-up record. Live: only at go-live, after the new code is live.'),
  (22,   '022_alignment_open_returns_organisation', 'not checked', null,
         'The outside Health Check page gets the organisation name. Live: only at go-live.'),
  (23,   '023_mission_progress_reviews_update', 'not checked', null,
         'A POP review draft can be saved over itself. Live: at go-live, or earlier if Tim wants.'),
  (24,   '024_baseline_live_structure', 'not checked', null,
         'The live structure in one file. Tick it when supabase/024_baseline_test.sql says ALL CHECKS PASSED here.'),
  (25,   '025_migration_log', 'not checked', null,
         'This list. It marks itself "ran" on the next line.'),
  (null, 'add_personal_goal_to_profiles', 'not checked', null,
         'No number. profiles.personal_goal.'),
  (null, 'add_show_mission_in_header_to_profiles', 'not checked', null,
         'No number. profiles.show_mission_in_header.')
on conflict (name) do nothing;

-- Every migration ends with this line, with its own number and name.
select public.record_migration(25, '025_migration_log');
