-- =============================================================================
-- 024_baseline_live_structure.sql
-- The live database's structure, written down in one place
--
-- WHAT THIS DOES (plain English)
--   Until now, parts of the live database had no migration at all (for
--   example profiles, breathing_sessions, profiles.role and
--   profiles.organisation), so nobody could rebuild it from this folder.
--   This file describes the whole structure as it is on live today:
--   18 tables (160 columns), 62 constraints, 24 indexes,
--   89 security rules, 13 functions and 7 triggers.
--   The tables are:
--     alignment_sessions, breathing_sessions, daily_journals, decisions,
--     guest_sessions, journal_entries, mission_progress_reviews,
--     mission_versions, missions, plans, profiles, reflections,
--     strategic_alignments, strategies, tactics, wheel_of_life_areas,
--     wheel_of_life_checkins, wheel_of_life_settings
--
--   It was taken from the test project (clarity-portal-test), which is a copy
--   of live's structure, with the two later changes Tim ran there (022 and
--   023, both waiting for go-live on live) left out, so it matches live.
--
--   It only ever ADDS what is missing. Anything already there is left exactly
--   as it is: no table, column, rule or function is changed, replaced or
--   removed, and no data is touched. On a database that already matches
--   (live and test today), it changes nothing at all.
--
--   Who may use what (grants): a missing table or function is made with the
--   grants its migration gave it (018 to 020 close the Health Check functions
--   and the Wheel of Life tables), and Supabase's usual grants otherwise.
--   Grants on things already there are never changed.
--
-- SAFE TO RUN TWICE
--   Yes. Every part checks first and is skipped if it is already there.
--
-- HOW TO CHECK IT
--   Run supabase/024_baseline_test.sql afterwards. It changes nothing, and
--   finishes with "ALL CHECKS PASSED", or names each difference.
--
-- WHEN TO RUN
--   Test project: now (SQL editor of clarity-portal-test), then the test file.
--   Live project: any time, then the test file. It changes nothing on live
--   unless something is missing there, which the test file would show first.
--
-- NOT INCLUDED (owned and kept by Supabase, the same on every project)
--   Supabase's own schemas (auth, storage, realtime and others), its other
--   extensions (pg_stat_statements, supabase_vault), and the realtime
--   publication. There are no storage buckets, views or custom types.
--
-- Made from the test project's catalogue on Mon 26 Oct 2026. If a later
-- migration changes something listed here, add it to "later_version" or
-- "later_addition" in supabase/024_baseline_test.sql.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Extensions the functions use (Supabase keeps them in the extensions schema)
-- -----------------------------------------------------------------------------

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;


-- -----------------------------------------------------------------------------
-- 2. Tables and their columns (a missing table is made whole; a missing column is added)
-- -----------------------------------------------------------------------------

-- Table alignment_sessions
do $b024$
begin
  if to_regclass('public.alignment_sessions') is null then
    create table public.alignment_sessions (
      id uuid default gen_random_uuid() not null,
      token text not null,
      access_code_hash text not null,
      client_label text not null,
      respondent_email text not null,
      created_by text,
      status text default 'invited'::text not null,
      current_step jsonb,
      data jsonb default '{}'::jsonb not null,
      version integer default 0 not null,
      failed_attempts integer default 0 not null,
      locked_until timestamp with time zone,
      link_disabled boolean default false not null,
      user_id uuid,
      created_at timestamp with time zone default now() not null,
      updated_at timestamp with time zone default now() not null,
      completed_at timestamp with time zone,
      notified_at timestamp with time zone,
      link_emails jsonb default '[]'::jsonb not null
    );
    revoke all on table public.alignment_sessions from public, anon, authenticated;
  else
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.alignment_sessions'::regclass
                     and attname = 'id' and not attisdropped) then
      alter table public.alignment_sessions add column id uuid default gen_random_uuid() not null;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.alignment_sessions'::regclass
                     and attname = 'token' and not attisdropped) then
      alter table public.alignment_sessions add column token text not null;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.alignment_sessions'::regclass
                     and attname = 'access_code_hash' and not attisdropped) then
      alter table public.alignment_sessions add column access_code_hash text not null;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.alignment_sessions'::regclass
                     and attname = 'client_label' and not attisdropped) then
      alter table public.alignment_sessions add column client_label text not null;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.alignment_sessions'::regclass
                     and attname = 'respondent_email' and not attisdropped) then
      alter table public.alignment_sessions add column respondent_email text not null;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.alignment_sessions'::regclass
                     and attname = 'created_by' and not attisdropped) then
      alter table public.alignment_sessions add column created_by text;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.alignment_sessions'::regclass
                     and attname = 'status' and not attisdropped) then
      alter table public.alignment_sessions add column status text default 'invited'::text not null;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.alignment_sessions'::regclass
                     and attname = 'current_step' and not attisdropped) then
      alter table public.alignment_sessions add column current_step jsonb;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.alignment_sessions'::regclass
                     and attname = 'data' and not attisdropped) then
      alter table public.alignment_sessions add column data jsonb default '{}'::jsonb not null;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.alignment_sessions'::regclass
                     and attname = 'version' and not attisdropped) then
      alter table public.alignment_sessions add column version integer default 0 not null;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.alignment_sessions'::regclass
                     and attname = 'failed_attempts' and not attisdropped) then
      alter table public.alignment_sessions add column failed_attempts integer default 0 not null;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.alignment_sessions'::regclass
                     and attname = 'locked_until' and not attisdropped) then
      alter table public.alignment_sessions add column locked_until timestamp with time zone;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.alignment_sessions'::regclass
                     and attname = 'link_disabled' and not attisdropped) then
      alter table public.alignment_sessions add column link_disabled boolean default false not null;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.alignment_sessions'::regclass
                     and attname = 'user_id' and not attisdropped) then
      alter table public.alignment_sessions add column user_id uuid;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.alignment_sessions'::regclass
                     and attname = 'created_at' and not attisdropped) then
      alter table public.alignment_sessions add column created_at timestamp with time zone default now() not null;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.alignment_sessions'::regclass
                     and attname = 'updated_at' and not attisdropped) then
      alter table public.alignment_sessions add column updated_at timestamp with time zone default now() not null;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.alignment_sessions'::regclass
                     and attname = 'completed_at' and not attisdropped) then
      alter table public.alignment_sessions add column completed_at timestamp with time zone;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.alignment_sessions'::regclass
                     and attname = 'notified_at' and not attisdropped) then
      alter table public.alignment_sessions add column notified_at timestamp with time zone;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.alignment_sessions'::regclass
                     and attname = 'link_emails' and not attisdropped) then
      alter table public.alignment_sessions add column link_emails jsonb default '[]'::jsonb not null;
    end if;
  end if;
end
$b024$;

-- Table breathing_sessions
do $b024$
begin
  if to_regclass('public.breathing_sessions') is null then
    create table public.breathing_sessions (
      id uuid default gen_random_uuid() not null,
      user_id uuid not null,
      breathing_mode text not null,
      duration integer default 0 not null,
      date timestamp with time zone default now(),
      created_at timestamp with time zone default now(),
      updated_at timestamp with time zone default now()
    );
  else
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.breathing_sessions'::regclass
                     and attname = 'id' and not attisdropped) then
      alter table public.breathing_sessions add column id uuid default gen_random_uuid() not null;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.breathing_sessions'::regclass
                     and attname = 'user_id' and not attisdropped) then
      alter table public.breathing_sessions add column user_id uuid not null;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.breathing_sessions'::regclass
                     and attname = 'breathing_mode' and not attisdropped) then
      alter table public.breathing_sessions add column breathing_mode text not null;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.breathing_sessions'::regclass
                     and attname = 'duration' and not attisdropped) then
      alter table public.breathing_sessions add column duration integer default 0 not null;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.breathing_sessions'::regclass
                     and attname = 'date' and not attisdropped) then
      alter table public.breathing_sessions add column date timestamp with time zone default now();
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.breathing_sessions'::regclass
                     and attname = 'created_at' and not attisdropped) then
      alter table public.breathing_sessions add column created_at timestamp with time zone default now();
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.breathing_sessions'::regclass
                     and attname = 'updated_at' and not attisdropped) then
      alter table public.breathing_sessions add column updated_at timestamp with time zone default now();
    end if;
  end if;
end
$b024$;

-- Table daily_journals
do $b024$
begin
  if to_regclass('public.daily_journals') is null then
    create table public.daily_journals (
      id uuid default gen_random_uuid() not null,
      user_id uuid not null,
      journal_date date not null,
      body jsonb default '[]'::jsonb not null,
      body_text text,
      status text default 'draft'::text not null,
      created_at timestamp with time zone default now(),
      updated_at timestamp with time zone default now()
    );
  else
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.daily_journals'::regclass
                     and attname = 'id' and not attisdropped) then
      alter table public.daily_journals add column id uuid default gen_random_uuid() not null;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.daily_journals'::regclass
                     and attname = 'user_id' and not attisdropped) then
      alter table public.daily_journals add column user_id uuid not null;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.daily_journals'::regclass
                     and attname = 'journal_date' and not attisdropped) then
      alter table public.daily_journals add column journal_date date not null;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.daily_journals'::regclass
                     and attname = 'body' and not attisdropped) then
      alter table public.daily_journals add column body jsonb default '[]'::jsonb not null;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.daily_journals'::regclass
                     and attname = 'body_text' and not attisdropped) then
      alter table public.daily_journals add column body_text text;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.daily_journals'::regclass
                     and attname = 'status' and not attisdropped) then
      alter table public.daily_journals add column status text default 'draft'::text not null;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.daily_journals'::regclass
                     and attname = 'created_at' and not attisdropped) then
      alter table public.daily_journals add column created_at timestamp with time zone default now();
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.daily_journals'::regclass
                     and attname = 'updated_at' and not attisdropped) then
      alter table public.daily_journals add column updated_at timestamp with time zone default now();
    end if;
  end if;
end
$b024$;

-- Table decisions
do $b024$
begin
  if to_regclass('public.decisions') is null then
    create table public.decisions (
      id uuid default gen_random_uuid() not null,
      user_id uuid not null,
      tool_type text,
      title text,
      form_data jsonb,
      status text default 'draft'::text,
      draft boolean default false,
      created_at timestamp without time zone default now(),
      updated_at timestamp without time zone default now()
    );
  else
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.decisions'::regclass
                     and attname = 'id' and not attisdropped) then
      alter table public.decisions add column id uuid default gen_random_uuid() not null;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.decisions'::regclass
                     and attname = 'user_id' and not attisdropped) then
      alter table public.decisions add column user_id uuid not null;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.decisions'::regclass
                     and attname = 'tool_type' and not attisdropped) then
      alter table public.decisions add column tool_type text;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.decisions'::regclass
                     and attname = 'title' and not attisdropped) then
      alter table public.decisions add column title text;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.decisions'::regclass
                     and attname = 'form_data' and not attisdropped) then
      alter table public.decisions add column form_data jsonb;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.decisions'::regclass
                     and attname = 'status' and not attisdropped) then
      alter table public.decisions add column status text default 'draft'::text;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.decisions'::regclass
                     and attname = 'draft' and not attisdropped) then
      alter table public.decisions add column draft boolean default false;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.decisions'::regclass
                     and attname = 'created_at' and not attisdropped) then
      alter table public.decisions add column created_at timestamp without time zone default now();
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.decisions'::regclass
                     and attname = 'updated_at' and not attisdropped) then
      alter table public.decisions add column updated_at timestamp without time zone default now();
    end if;
  end if;
end
$b024$;

-- Table guest_sessions
do $b024$
begin
  if to_regclass('public.guest_sessions') is null then
    create table public.guest_sessions (
      session_id text not null,
      form_data jsonb,
      created_at timestamp without time zone default now(),
      updated_at timestamp without time zone default now()
    );
  else
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.guest_sessions'::regclass
                     and attname = 'session_id' and not attisdropped) then
      alter table public.guest_sessions add column session_id text not null;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.guest_sessions'::regclass
                     and attname = 'form_data' and not attisdropped) then
      alter table public.guest_sessions add column form_data jsonb;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.guest_sessions'::regclass
                     and attname = 'created_at' and not attisdropped) then
      alter table public.guest_sessions add column created_at timestamp without time zone default now();
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.guest_sessions'::regclass
                     and attname = 'updated_at' and not attisdropped) then
      alter table public.guest_sessions add column updated_at timestamp without time zone default now();
    end if;
  end if;
end
$b024$;

-- Table journal_entries
do $b024$
begin
  if to_regclass('public.journal_entries') is null then
    create table public.journal_entries (
      id uuid default gen_random_uuid() not null,
      user_id uuid not null,
      entry_date date not null,
      review_type text not null,
      content text not null,
      created_at timestamp with time zone default now(),
      updated_at timestamp with time zone default now(),
      title text,
      status text default 'final'::text not null
    );
  else
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.journal_entries'::regclass
                     and attname = 'id' and not attisdropped) then
      alter table public.journal_entries add column id uuid default gen_random_uuid() not null;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.journal_entries'::regclass
                     and attname = 'user_id' and not attisdropped) then
      alter table public.journal_entries add column user_id uuid not null;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.journal_entries'::regclass
                     and attname = 'entry_date' and not attisdropped) then
      alter table public.journal_entries add column entry_date date not null;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.journal_entries'::regclass
                     and attname = 'review_type' and not attisdropped) then
      alter table public.journal_entries add column review_type text not null;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.journal_entries'::regclass
                     and attname = 'content' and not attisdropped) then
      alter table public.journal_entries add column content text not null;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.journal_entries'::regclass
                     and attname = 'created_at' and not attisdropped) then
      alter table public.journal_entries add column created_at timestamp with time zone default now();
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.journal_entries'::regclass
                     and attname = 'updated_at' and not attisdropped) then
      alter table public.journal_entries add column updated_at timestamp with time zone default now();
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.journal_entries'::regclass
                     and attname = 'title' and not attisdropped) then
      alter table public.journal_entries add column title text;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.journal_entries'::regclass
                     and attname = 'status' and not attisdropped) then
      alter table public.journal_entries add column status text default 'final'::text not null;
    end if;
  end if;
end
$b024$;

-- Table mission_progress_reviews
do $b024$
begin
  if to_regclass('public.mission_progress_reviews') is null then
    create table public.mission_progress_reviews (
      id uuid default gen_random_uuid() not null,
      mission_id uuid not null,
      user_id uuid not null,
      review_data jsonb default '{}'::jsonb not null,
      created_at timestamp with time zone default now(),
      plan_version_id uuid,
      status text default 'final'::text not null,
      updated_at timestamp with time zone default now()
    );
  else
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.mission_progress_reviews'::regclass
                     and attname = 'id' and not attisdropped) then
      alter table public.mission_progress_reviews add column id uuid default gen_random_uuid() not null;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.mission_progress_reviews'::regclass
                     and attname = 'mission_id' and not attisdropped) then
      alter table public.mission_progress_reviews add column mission_id uuid not null;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.mission_progress_reviews'::regclass
                     and attname = 'user_id' and not attisdropped) then
      alter table public.mission_progress_reviews add column user_id uuid not null;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.mission_progress_reviews'::regclass
                     and attname = 'review_data' and not attisdropped) then
      alter table public.mission_progress_reviews add column review_data jsonb default '{}'::jsonb not null;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.mission_progress_reviews'::regclass
                     and attname = 'created_at' and not attisdropped) then
      alter table public.mission_progress_reviews add column created_at timestamp with time zone default now();
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.mission_progress_reviews'::regclass
                     and attname = 'plan_version_id' and not attisdropped) then
      alter table public.mission_progress_reviews add column plan_version_id uuid;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.mission_progress_reviews'::regclass
                     and attname = 'status' and not attisdropped) then
      alter table public.mission_progress_reviews add column status text default 'final'::text not null;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.mission_progress_reviews'::regclass
                     and attname = 'updated_at' and not attisdropped) then
      alter table public.mission_progress_reviews add column updated_at timestamp with time zone default now();
    end if;
  end if;
end
$b024$;

-- Table mission_versions
do $b024$
begin
  if to_regclass('public.mission_versions') is null then
    create table public.mission_versions (
      id uuid default gen_random_uuid() not null,
      mission_id uuid not null,
      user_id uuid not null,
      major integer not null,
      minor integer default 0 not null,
      change_type text not null,
      snapshot jsonb not null,
      change_note text not null,
      restored_from uuid,
      created_at timestamp with time zone default now() not null
    );
  else
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.mission_versions'::regclass
                     and attname = 'id' and not attisdropped) then
      alter table public.mission_versions add column id uuid default gen_random_uuid() not null;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.mission_versions'::regclass
                     and attname = 'mission_id' and not attisdropped) then
      alter table public.mission_versions add column mission_id uuid not null;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.mission_versions'::regclass
                     and attname = 'user_id' and not attisdropped) then
      alter table public.mission_versions add column user_id uuid not null;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.mission_versions'::regclass
                     and attname = 'major' and not attisdropped) then
      alter table public.mission_versions add column major integer not null;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.mission_versions'::regclass
                     and attname = 'minor' and not attisdropped) then
      alter table public.mission_versions add column minor integer default 0 not null;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.mission_versions'::regclass
                     and attname = 'change_type' and not attisdropped) then
      alter table public.mission_versions add column change_type text not null;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.mission_versions'::regclass
                     and attname = 'snapshot' and not attisdropped) then
      alter table public.mission_versions add column snapshot jsonb not null;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.mission_versions'::regclass
                     and attname = 'change_note' and not attisdropped) then
      alter table public.mission_versions add column change_note text not null;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.mission_versions'::regclass
                     and attname = 'restored_from' and not attisdropped) then
      alter table public.mission_versions add column restored_from uuid;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.mission_versions'::regclass
                     and attname = 'created_at' and not attisdropped) then
      alter table public.mission_versions add column created_at timestamp with time zone default now() not null;
    end if;
  end if;
end
$b024$;

-- Table missions
do $b024$
begin
  if to_regclass('public.missions') is null then
    create table public.missions (
      id uuid default gen_random_uuid() not null,
      user_id uuid not null,
      title text not null,
      created_at timestamp with time zone default now(),
      updated_at timestamp with time zone default now(),
      archived_at timestamp with time zone
    );
  else
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.missions'::regclass
                     and attname = 'id' and not attisdropped) then
      alter table public.missions add column id uuid default gen_random_uuid() not null;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.missions'::regclass
                     and attname = 'user_id' and not attisdropped) then
      alter table public.missions add column user_id uuid not null;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.missions'::regclass
                     and attname = 'title' and not attisdropped) then
      alter table public.missions add column title text not null;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.missions'::regclass
                     and attname = 'created_at' and not attisdropped) then
      alter table public.missions add column created_at timestamp with time zone default now();
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.missions'::regclass
                     and attname = 'updated_at' and not attisdropped) then
      alter table public.missions add column updated_at timestamp with time zone default now();
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.missions'::regclass
                     and attname = 'archived_at' and not attisdropped) then
      alter table public.missions add column archived_at timestamp with time zone;
    end if;
  end if;
end
$b024$;

-- Table plans
do $b024$
begin
  if to_regclass('public.plans') is null then
    create table public.plans (
      id uuid default gen_random_uuid() not null,
      user_id uuid not null,
      name text,
      type text,
      form_data jsonb,
      status text default 'in_progress'::text,
      progress_percent integer default 0,
      created_at timestamp without time zone default now(),
      updated_at timestamp without time zone default now()
    );
  else
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.plans'::regclass
                     and attname = 'id' and not attisdropped) then
      alter table public.plans add column id uuid default gen_random_uuid() not null;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.plans'::regclass
                     and attname = 'user_id' and not attisdropped) then
      alter table public.plans add column user_id uuid not null;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.plans'::regclass
                     and attname = 'name' and not attisdropped) then
      alter table public.plans add column name text;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.plans'::regclass
                     and attname = 'type' and not attisdropped) then
      alter table public.plans add column type text;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.plans'::regclass
                     and attname = 'form_data' and not attisdropped) then
      alter table public.plans add column form_data jsonb;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.plans'::regclass
                     and attname = 'status' and not attisdropped) then
      alter table public.plans add column status text default 'in_progress'::text;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.plans'::regclass
                     and attname = 'progress_percent' and not attisdropped) then
      alter table public.plans add column progress_percent integer default 0;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.plans'::regclass
                     and attname = 'created_at' and not attisdropped) then
      alter table public.plans add column created_at timestamp without time zone default now();
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.plans'::regclass
                     and attname = 'updated_at' and not attisdropped) then
      alter table public.plans add column updated_at timestamp without time zone default now();
    end if;
  end if;
end
$b024$;

-- Table profiles
do $b024$
begin
if to_regclass('public.profiles') is null then
create table public.profiles (
  id uuid not null,
  first_name text,
  last_name text,
  email text,
  terms_accepted boolean default false,
  created_at timestamp without time zone default now(),
  updated_at timestamp without time zone default now(),
  role text,
  organisation text,
  personal_goal text,
  show_mission_in_header boolean default true,
  breathing_settings jsonb default '{"sound": false, "cycles": 5, "duration": 5}'::jsonb,
  goal_visibility jsonb default '{}'::jsonb,
  last_breathing_guide_shown timestamp without time zone
);
comment on column public.profiles.terms_accepted is 'Whether user has accepted 
  terms of service';
comment on column public.profiles.personal_goal is 'User''s personal goal/purpose displayed in header';
comment on column public.profiles.show_mission_in_header is 'Whether to display the mission statement in the page 
  header';
comment on column public.profiles.breathing_settings is 'User breathing guide 
  preferences (cycles, duration, sound)';
comment on column public.profiles.goal_visibility is 'Which goals are visible to 
  user (JSON object)';
comment on column public.profiles.last_breathing_guide_shown is 'Timestamp of 
  when breathing guide was last displayed to user';
else
if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.profiles'::regclass
                 and attname = 'id' and not attisdropped) then
  alter table public.profiles add column id uuid not null;
end if;
if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.profiles'::regclass
                 and attname = 'first_name' and not attisdropped) then
  alter table public.profiles add column first_name text;
end if;
if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.profiles'::regclass
                 and attname = 'last_name' and not attisdropped) then
  alter table public.profiles add column last_name text;
end if;
if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.profiles'::regclass
                 and attname = 'email' and not attisdropped) then
  alter table public.profiles add column email text;
end if;
if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.profiles'::regclass
                 and attname = 'terms_accepted' and not attisdropped) then
  alter table public.profiles add column terms_accepted boolean default false;
  comment on column public.profiles.terms_accepted is 'Whether user has accepted 
  terms of service';
end if;
if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.profiles'::regclass
                 and attname = 'created_at' and not attisdropped) then
  alter table public.profiles add column created_at timestamp without time zone default now();
end if;
if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.profiles'::regclass
                 and attname = 'updated_at' and not attisdropped) then
  alter table public.profiles add column updated_at timestamp without time zone default now();
end if;
if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.profiles'::regclass
                 and attname = 'role' and not attisdropped) then
  alter table public.profiles add column role text;
end if;
if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.profiles'::regclass
                 and attname = 'organisation' and not attisdropped) then
  alter table public.profiles add column organisation text;
end if;
if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.profiles'::regclass
                 and attname = 'personal_goal' and not attisdropped) then
  alter table public.profiles add column personal_goal text;
  comment on column public.profiles.personal_goal is 'User''s personal goal/purpose displayed in header';
end if;
if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.profiles'::regclass
                 and attname = 'show_mission_in_header' and not attisdropped) then
  alter table public.profiles add column show_mission_in_header boolean default true;
  comment on column public.profiles.show_mission_in_header is 'Whether to display the mission statement in the page 
  header';
end if;
if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.profiles'::regclass
                 and attname = 'breathing_settings' and not attisdropped) then
  alter table public.profiles add column breathing_settings jsonb default '{"sound": false, "cycles": 5, "duration": 5}'::jsonb;
  comment on column public.profiles.breathing_settings is 'User breathing guide 
  preferences (cycles, duration, sound)';
end if;
if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.profiles'::regclass
                 and attname = 'goal_visibility' and not attisdropped) then
  alter table public.profiles add column goal_visibility jsonb default '{}'::jsonb;
  comment on column public.profiles.goal_visibility is 'Which goals are visible to 
  user (JSON object)';
end if;
if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.profiles'::regclass
                 and attname = 'last_breathing_guide_shown' and not attisdropped) then
  alter table public.profiles add column last_breathing_guide_shown timestamp without time zone;
  comment on column public.profiles.last_breathing_guide_shown is 'Timestamp of 
  when breathing guide was last displayed to user';
end if;
end if;
end
$b024$;

-- Table reflections
do $b024$
begin
  if to_regclass('public.reflections') is null then
    create table public.reflections (
      id uuid default gen_random_uuid() not null,
      user_id uuid not null,
      title text,
      content text,
      linked_decision_id uuid,
      created_at timestamp without time zone default now(),
      updated_at timestamp without time zone default now()
    );
  else
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.reflections'::regclass
                     and attname = 'id' and not attisdropped) then
      alter table public.reflections add column id uuid default gen_random_uuid() not null;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.reflections'::regclass
                     and attname = 'user_id' and not attisdropped) then
      alter table public.reflections add column user_id uuid not null;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.reflections'::regclass
                     and attname = 'title' and not attisdropped) then
      alter table public.reflections add column title text;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.reflections'::regclass
                     and attname = 'content' and not attisdropped) then
      alter table public.reflections add column content text;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.reflections'::regclass
                     and attname = 'linked_decision_id' and not attisdropped) then
      alter table public.reflections add column linked_decision_id uuid;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.reflections'::regclass
                     and attname = 'created_at' and not attisdropped) then
      alter table public.reflections add column created_at timestamp without time zone default now();
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.reflections'::regclass
                     and attname = 'updated_at' and not attisdropped) then
      alter table public.reflections add column updated_at timestamp without time zone default now();
    end if;
  end if;
end
$b024$;

-- Table strategic_alignments
do $b024$
begin
  if to_regclass('public.strategic_alignments') is null then
    create table public.strategic_alignments (
      id uuid default gen_random_uuid() not null,
      user_id uuid not null,
      title text,
      form_data jsonb,
      status text default 'draft'::text,
      created_at timestamp without time zone default now(),
      updated_at timestamp without time zone default now()
    );
  else
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.strategic_alignments'::regclass
                     and attname = 'id' and not attisdropped) then
      alter table public.strategic_alignments add column id uuid default gen_random_uuid() not null;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.strategic_alignments'::regclass
                     and attname = 'user_id' and not attisdropped) then
      alter table public.strategic_alignments add column user_id uuid not null;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.strategic_alignments'::regclass
                     and attname = 'title' and not attisdropped) then
      alter table public.strategic_alignments add column title text;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.strategic_alignments'::regclass
                     and attname = 'form_data' and not attisdropped) then
      alter table public.strategic_alignments add column form_data jsonb;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.strategic_alignments'::regclass
                     and attname = 'status' and not attisdropped) then
      alter table public.strategic_alignments add column status text default 'draft'::text;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.strategic_alignments'::regclass
                     and attname = 'created_at' and not attisdropped) then
      alter table public.strategic_alignments add column created_at timestamp without time zone default now();
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.strategic_alignments'::regclass
                     and attname = 'updated_at' and not attisdropped) then
      alter table public.strategic_alignments add column updated_at timestamp without time zone default now();
    end if;
  end if;
end
$b024$;

-- Table strategies
do $b024$
begin
  if to_regclass('public.strategies') is null then
    create table public.strategies (
      id uuid default gen_random_uuid() not null,
      mission_id uuid not null,
      name text not null,
      description text,
      sort_order integer default 0,
      created_at timestamp with time zone default now(),
      updated_at timestamp with time zone default now()
    );
  else
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.strategies'::regclass
                     and attname = 'id' and not attisdropped) then
      alter table public.strategies add column id uuid default gen_random_uuid() not null;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.strategies'::regclass
                     and attname = 'mission_id' and not attisdropped) then
      alter table public.strategies add column mission_id uuid not null;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.strategies'::regclass
                     and attname = 'name' and not attisdropped) then
      alter table public.strategies add column name text not null;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.strategies'::regclass
                     and attname = 'description' and not attisdropped) then
      alter table public.strategies add column description text;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.strategies'::regclass
                     and attname = 'sort_order' and not attisdropped) then
      alter table public.strategies add column sort_order integer default 0;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.strategies'::regclass
                     and attname = 'created_at' and not attisdropped) then
      alter table public.strategies add column created_at timestamp with time zone default now();
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.strategies'::regclass
                     and attname = 'updated_at' and not attisdropped) then
      alter table public.strategies add column updated_at timestamp with time zone default now();
    end if;
  end if;
end
$b024$;

-- Table tactics
do $b024$
begin
  if to_regclass('public.tactics') is null then
    create table public.tactics (
      id uuid default gen_random_uuid() not null,
      strategy_id uuid not null,
      action text not null,
      type text not null,
      target_value numeric,
      unit text,
      current_value numeric,
      is_done boolean default false,
      sort_order integer default 0,
      last_reviewed_at timestamp with time zone,
      created_at timestamp with time zone default now(),
      updated_at timestamp with time zone default now()
    );
  else
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.tactics'::regclass
                     and attname = 'id' and not attisdropped) then
      alter table public.tactics add column id uuid default gen_random_uuid() not null;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.tactics'::regclass
                     and attname = 'strategy_id' and not attisdropped) then
      alter table public.tactics add column strategy_id uuid not null;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.tactics'::regclass
                     and attname = 'action' and not attisdropped) then
      alter table public.tactics add column action text not null;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.tactics'::regclass
                     and attname = 'type' and not attisdropped) then
      alter table public.tactics add column type text not null;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.tactics'::regclass
                     and attname = 'target_value' and not attisdropped) then
      alter table public.tactics add column target_value numeric;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.tactics'::regclass
                     and attname = 'unit' and not attisdropped) then
      alter table public.tactics add column unit text;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.tactics'::regclass
                     and attname = 'current_value' and not attisdropped) then
      alter table public.tactics add column current_value numeric;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.tactics'::regclass
                     and attname = 'is_done' and not attisdropped) then
      alter table public.tactics add column is_done boolean default false;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.tactics'::regclass
                     and attname = 'sort_order' and not attisdropped) then
      alter table public.tactics add column sort_order integer default 0;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.tactics'::regclass
                     and attname = 'last_reviewed_at' and not attisdropped) then
      alter table public.tactics add column last_reviewed_at timestamp with time zone;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.tactics'::regclass
                     and attname = 'created_at' and not attisdropped) then
      alter table public.tactics add column created_at timestamp with time zone default now();
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.tactics'::regclass
                     and attname = 'updated_at' and not attisdropped) then
      alter table public.tactics add column updated_at timestamp with time zone default now();
    end if;
  end if;
end
$b024$;

-- Table wheel_of_life_areas
do $b024$
begin
  if to_regclass('public.wheel_of_life_areas') is null then
    create table public.wheel_of_life_areas (
      id uuid default gen_random_uuid() not null,
      user_id uuid not null,
      area_key text not null,
      kind text not null,
      label text,
      active boolean default true not null,
      sort_order integer default 0 not null,
      target smallint,
      target_updated_at timestamp with time zone,
      created_at timestamp with time zone default now() not null,
      updated_at timestamp with time zone default now() not null
    );
    revoke all on table public.wheel_of_life_areas from public, anon, authenticated;
    grant select, insert, update on table public.wheel_of_life_areas to authenticated;
  else
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.wheel_of_life_areas'::regclass
                     and attname = 'id' and not attisdropped) then
      alter table public.wheel_of_life_areas add column id uuid default gen_random_uuid() not null;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.wheel_of_life_areas'::regclass
                     and attname = 'user_id' and not attisdropped) then
      alter table public.wheel_of_life_areas add column user_id uuid not null;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.wheel_of_life_areas'::regclass
                     and attname = 'area_key' and not attisdropped) then
      alter table public.wheel_of_life_areas add column area_key text not null;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.wheel_of_life_areas'::regclass
                     and attname = 'kind' and not attisdropped) then
      alter table public.wheel_of_life_areas add column kind text not null;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.wheel_of_life_areas'::regclass
                     and attname = 'label' and not attisdropped) then
      alter table public.wheel_of_life_areas add column label text;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.wheel_of_life_areas'::regclass
                     and attname = 'active' and not attisdropped) then
      alter table public.wheel_of_life_areas add column active boolean default true not null;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.wheel_of_life_areas'::regclass
                     and attname = 'sort_order' and not attisdropped) then
      alter table public.wheel_of_life_areas add column sort_order integer default 0 not null;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.wheel_of_life_areas'::regclass
                     and attname = 'target' and not attisdropped) then
      alter table public.wheel_of_life_areas add column target smallint;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.wheel_of_life_areas'::regclass
                     and attname = 'target_updated_at' and not attisdropped) then
      alter table public.wheel_of_life_areas add column target_updated_at timestamp with time zone;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.wheel_of_life_areas'::regclass
                     and attname = 'created_at' and not attisdropped) then
      alter table public.wheel_of_life_areas add column created_at timestamp with time zone default now() not null;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.wheel_of_life_areas'::regclass
                     and attname = 'updated_at' and not attisdropped) then
      alter table public.wheel_of_life_areas add column updated_at timestamp with time zone default now() not null;
    end if;
  end if;
end
$b024$;

-- Table wheel_of_life_checkins
do $b024$
begin
  if to_regclass('public.wheel_of_life_checkins') is null then
    create table public.wheel_of_life_checkins (
      id uuid default gen_random_uuid() not null,
      user_id uuid not null,
      checkin_at timestamp with time zone default now() not null,
      checkin_date date not null,
      scores jsonb not null,
      areas jsonb not null,
      notes jsonb default '{}'::jsonb not null,
      focus_area_key text,
      focus_note text,
      created_at timestamp with time zone default now() not null
    );
    revoke all on table public.wheel_of_life_checkins from public, anon, authenticated;
    grant select, insert, delete on table public.wheel_of_life_checkins to authenticated;
  else
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.wheel_of_life_checkins'::regclass
                     and attname = 'id' and not attisdropped) then
      alter table public.wheel_of_life_checkins add column id uuid default gen_random_uuid() not null;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.wheel_of_life_checkins'::regclass
                     and attname = 'user_id' and not attisdropped) then
      alter table public.wheel_of_life_checkins add column user_id uuid not null;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.wheel_of_life_checkins'::regclass
                     and attname = 'checkin_at' and not attisdropped) then
      alter table public.wheel_of_life_checkins add column checkin_at timestamp with time zone default now() not null;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.wheel_of_life_checkins'::regclass
                     and attname = 'checkin_date' and not attisdropped) then
      alter table public.wheel_of_life_checkins add column checkin_date date not null;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.wheel_of_life_checkins'::regclass
                     and attname = 'scores' and not attisdropped) then
      alter table public.wheel_of_life_checkins add column scores jsonb not null;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.wheel_of_life_checkins'::regclass
                     and attname = 'areas' and not attisdropped) then
      alter table public.wheel_of_life_checkins add column areas jsonb not null;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.wheel_of_life_checkins'::regclass
                     and attname = 'notes' and not attisdropped) then
      alter table public.wheel_of_life_checkins add column notes jsonb default '{}'::jsonb not null;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.wheel_of_life_checkins'::regclass
                     and attname = 'focus_area_key' and not attisdropped) then
      alter table public.wheel_of_life_checkins add column focus_area_key text;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.wheel_of_life_checkins'::regclass
                     and attname = 'focus_note' and not attisdropped) then
      alter table public.wheel_of_life_checkins add column focus_note text;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.wheel_of_life_checkins'::regclass
                     and attname = 'created_at' and not attisdropped) then
      alter table public.wheel_of_life_checkins add column created_at timestamp with time zone default now() not null;
    end if;
  end if;
end
$b024$;

-- Table wheel_of_life_settings
do $b024$
begin
  if to_regclass('public.wheel_of_life_settings') is null then
    create table public.wheel_of_life_settings (
      user_id uuid not null,
      chart_style text default 'sectional'::text not null,
      updated_at timestamp with time zone default now() not null
    );
    revoke all on table public.wheel_of_life_settings from public, anon, authenticated;
    grant select, insert, update on table public.wheel_of_life_settings to authenticated;
  else
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.wheel_of_life_settings'::regclass
                     and attname = 'user_id' and not attisdropped) then
      alter table public.wheel_of_life_settings add column user_id uuid not null;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.wheel_of_life_settings'::regclass
                     and attname = 'chart_style' and not attisdropped) then
      alter table public.wheel_of_life_settings add column chart_style text default 'sectional'::text not null;
    end if;
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.wheel_of_life_settings'::regclass
                     and attname = 'updated_at' and not attisdropped) then
      alter table public.wheel_of_life_settings add column updated_at timestamp with time zone default now() not null;
    end if;
  end if;
end
$b024$;


-- -----------------------------------------------------------------------------
-- 3. Functions (made only if missing; an existing one is never replaced)
-- -----------------------------------------------------------------------------

-- Function _alignment_auth(text,text,text)
do $b024$
begin
if to_regprocedure('public._alignment_auth(text,text,text)') is null then
CREATE FUNCTION public._alignment_auth(p_token text, p_email text, p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  s public.alignment_sessions;
begin
  select * into s from public.alignment_sessions
  where token = coalesce(p_token, '') for update;

  if not found or s.link_disabled then
    return jsonb_build_object('ok', false, 'error', 'invalid',
      'message', 'Those details don’t match. Check the email and access code you were sent.');
  end if;

  if s.locked_until is not null and s.locked_until > now() then
    return jsonb_build_object('ok', false, 'error', 'locked',
      'message', 'Too many attempts. Please try again in a few minutes.');
  end if;

  if lower(btrim(coalesce(p_email, ''))) = s.respondent_email
     and crypt(upper(btrim(coalesce(p_code, ''))), s.access_code_hash) = s.access_code_hash then
    if s.failed_attempts <> 0 or s.locked_until is not null then
      update public.alignment_sessions
         set failed_attempts = 0, locked_until = null where id = s.id;
    end if;
    return jsonb_build_object('ok', true, 'id', s.id);
  end if;

  if s.failed_attempts + 1 >= 5 then
    update public.alignment_sessions
       set failed_attempts = 0, locked_until = now() + interval '15 minutes'
     where id = s.id;
  else
    update public.alignment_sessions
       set failed_attempts = failed_attempts + 1 where id = s.id;
  end if;

  return jsonb_build_object('ok', false, 'error', 'invalid',
    'message', 'Those details don’t match. Check the email and access code you were sent.');
end;
$function$;
  revoke all on function public._alignment_auth(text, text, text) from public, anon, authenticated;
end if;
end
$b024$;

-- Function _alignment_validate(jsonb)
do $b024$
begin
if to_regprocedure('public._alignment_validate(jsonb)') is null then
CREATE FUNCTION public._alignment_validate(p_data jsonb)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
declare
  v jsonb; item jsonb; rater record; proj record; cval record;
  n numeric; arr_key text; arr_max integer;
begin
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    return 'The answers must be an object.';
  end if;
  if octet_length(p_data::text) > 204800 then
    return 'The answers are too large (200 KB limit).';
  end if;

  v := p_data -> 'objective';
  if v is not null then
    if jsonb_typeof(v) <> 'string' or char_length(p_data ->> 'objective') > 500 then
      return 'The objective must be text of at most 500 characters.';
    end if;
  end if;

  foreach arr_key in array array['csfs', 'projects'] loop
    arr_max := case arr_key when 'csfs' then 12 else 40 end;
    v := p_data -> arr_key;
    if v is not null then
      if jsonb_typeof(v) <> 'array' then
        return arr_key || ' must be a list.';
      end if;
      if jsonb_array_length(v) > arr_max then
        return 'Too many items in ' || arr_key || ' (limit ' || arr_max || ').';
      end if;
      for item in select * from jsonb_array_elements(v) loop
        if jsonb_typeof(item) <> 'object'
           or jsonb_typeof(item -> 'id') is distinct from 'string'
           or jsonb_typeof(item -> 'text') is distinct from 'string' then
          return 'Each item in ' || arr_key || ' needs a text id and text.';
        end if;
        if char_length(item ->> 'id') not between 1 and 64 then
          return 'An id in ' || arr_key || ' is the wrong length.';
        end if;
        if char_length(item ->> 'text') > 300 then
          return 'An item in ' || arr_key || ' is longer than 300 characters.';
        end if;
      end loop;
    end if;
  end loop;

  v := p_data -> 'ratings';
  if v is not null then
    if jsonb_typeof(v) <> 'object' then
      return 'ratings must be an object.';
    end if;
    for rater in select * from jsonb_each(v) loop
      if jsonb_typeof(rater.value) <> 'object' then
        return 'Each rater must be an object.';
      end if;
      for proj in select * from jsonb_each(rater.value) loop
        if jsonb_typeof(proj.value) <> 'object' then
          return 'Each project rating must be an object.';
        end if;

        if proj.value ? 'contrib' then
          if jsonb_typeof(proj.value -> 'contrib') <> 'object' then
            return 'contrib must be an object.';
          end if;
          for cval in select * from jsonb_each(proj.value -> 'contrib') loop
            if jsonb_typeof(cval.value) <> 'number' then
              return 'A contribution must be a number.';
            end if;
            n := (cval.value #>> '{}')::numeric;
            if n < 0 or n > 3 or n <> floor(n) then
              return 'A contribution must be a whole number from 0 to 3.';
            end if;
          end loop;
        end if;

        foreach arr_key in array array['progress', 'resource'] loop
          if proj.value ? arr_key then
            if jsonb_typeof(proj.value -> arr_key) <> 'number' then
              return arr_key || ' must be a number.';
            end if;
            n := (proj.value ->> arr_key)::numeric;
            if n < 1 or n > 5 or n <> floor(n) then
              return arr_key || ' must be a whole number from 1 to 5.';
            end if;
          end if;
        end loop;
      end loop;
    end loop;
  end if;

  return null;
end;
$function$;
  revoke all on function public._alignment_validate(jsonb) from public, anon, authenticated;
end if;
end
$b024$;

-- Function alignment_disable(text)
do $b024$
begin
if to_regprocedure('public.alignment_disable(text)') is null then
CREATE FUNCTION public.alignment_disable(p_token text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.alignment_sessions set link_disabled = true where token = p_token;
  if not found then
    return 'No session found for that token.';
  end if;
  return 'Link disabled.';
end;
$function$;
  revoke all on function public.alignment_disable(text) from public, anon, authenticated;
end if;
end
$b024$;

-- Function alignment_email_check(text,text,text,text)
do $b024$
begin
if to_regprocedure('public.alignment_email_check(text,text,text,text)') is null then
CREATE FUNCTION public.alignment_email_check(p_token text, p_email text, p_code text, p_kind text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  a      jsonb;
  s      public.alignment_sessions;
  recent jsonb;
begin
  if p_kind not in ('link', 'complete') then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  a := public._alignment_auth(p_token, p_email, p_code);
  if not (a ->> 'ok')::boolean then
    return a;
  end if;

  select * into s from public.alignment_sessions where id = (a ->> 'id')::uuid;

  if p_kind = 'link' then
    select coalesce(jsonb_agg(e), '[]'::jsonb) into recent
      from jsonb_array_elements_text(s.link_emails) as t(e)
     where e::timestamptz > now() - interval '24 hours';

    if jsonb_array_length(recent) >= 3 then
      return jsonb_build_object('ok', false, 'error', 'limit');
    end if;

    update public.alignment_sessions
       set link_emails = recent || to_jsonb(now()::text)
     where id = s.id;
  else
    if s.status <> 'complete' then
      return jsonb_build_object('ok', false, 'error', 'invalid');
    end if;
    if s.notified_at is not null then
      return jsonb_build_object('ok', false, 'error', 'already');
    end if;
    update public.alignment_sessions set notified_at = now() where id = s.id;
  end if;

  return jsonb_build_object(
    'ok', true, 'client_label', s.client_label,
    'respondent_email', s.respondent_email, 'status', s.status,
    'completed_at', s.completed_at, 'data', s.data);
end;
$function$;
  revoke all on function public.alignment_email_check(text, text, text, text) from public;
  grant execute on function public.alignment_email_check(text, text, text, text) to anon, authenticated;
end if;
end
$b024$;

-- Function alignment_email_failed(text,text,text,text)
do $b024$
begin
if to_regprocedure('public.alignment_email_failed(text,text,text,text)') is null then
CREATE FUNCTION public.alignment_email_failed(p_token text, p_email text, p_code text, p_kind text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  a jsonb;
  s public.alignment_sessions;
begin
  a := public._alignment_auth(p_token, p_email, p_code);
  if not (a ->> 'ok')::boolean then
    return a;
  end if;

  select * into s from public.alignment_sessions where id = (a ->> 'id')::uuid;

  if p_kind = 'complete' then
    update public.alignment_sessions set notified_at = null where id = s.id;
  elsif p_kind = 'link' and jsonb_array_length(s.link_emails) > 0 then
    update public.alignment_sessions
       set link_emails = link_emails - (jsonb_array_length(link_emails) - 1)
     where id = s.id;
  end if;

  return jsonb_build_object('ok', true);
end;
$function$;
  revoke all on function public.alignment_email_failed(text, text, text, text) from public;
  grant execute on function public.alignment_email_failed(text, text, text, text) to anon, authenticated;
end if;
end
$b024$;

-- Function alignment_list()
do $b024$
begin
if to_regprocedure('public.alignment_list()') is null then
CREATE FUNCTION public.alignment_list()
 RETURNS TABLE(client_label text, respondent_email text, status text, updated_at timestamp with time zone, completed_at timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select client_label, respondent_email, status, updated_at, completed_at
  from public.alignment_sessions
  order by updated_at desc;
$function$;
  revoke all on function public.alignment_list() from public, anon, authenticated;
end if;
end
$b024$;

-- Function alignment_open(text,text,text)
do $b024$
begin
if to_regprocedure('public.alignment_open(text,text,text)') is null then
CREATE FUNCTION public.alignment_open(p_token text, p_email text, p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  a jsonb;
  s public.alignment_sessions;
begin
  a := public._alignment_auth(p_token, p_email, p_code);
  if not (a ->> 'ok')::boolean then
    return a;
  end if;

  select * into s from public.alignment_sessions where id = (a ->> 'id')::uuid;

  return jsonb_build_object(
    'ok', true,
    'status', s.status,
    'current_step', s.current_step,
    'data', s.data,
    'version', s.version,
    'updated_at', s.updated_at,
    'completed_at', s.completed_at
  );
end;
$function$;
  revoke all on function public.alignment_open(text, text, text) from public;
  grant execute on function public.alignment_open(text, text, text) to anon, authenticated;
end if;
end
$b024$;

-- Function alignment_save(text,text,text,jsonb,jsonb,integer,boolean)
do $b024$
begin
if to_regprocedure('public.alignment_save(text,text,text,jsonb,jsonb,integer,boolean)') is null then
CREATE FUNCTION public.alignment_save(p_token text, p_email text, p_code text, p_data jsonb, p_current_step jsonb, p_expected_version integer, p_complete boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  a jsonb;
  s public.alignment_sessions;
  v_why text;
  v_new public.alignment_sessions;
begin
  a := public._alignment_auth(p_token, p_email, p_code);
  if not (a ->> 'ok')::boolean then
    return a;
  end if;

  v_why := public._alignment_validate(p_data);
  if v_why is not null then
    return jsonb_build_object('ok', false, 'error', 'invalid_data', 'message', v_why);
  end if;

  if p_current_step is not null and (
       jsonb_typeof(p_current_step) <> 'object'
       or octet_length(p_current_step::text) > 2000) then
    return jsonb_build_object('ok', false, 'error', 'invalid_data',
                              'message', 'current_step is not valid.');
  end if;

  select * into s from public.alignment_sessions where id = (a ->> 'id')::uuid;

  if p_expected_version is distinct from s.version then
    return jsonb_build_object(
      'ok', false, 'conflict', true, 'error', 'conflict',
      'data', s.data, 'current_step', s.current_step,
      'version', s.version, 'status', s.status,
      'updated_at', s.updated_at, 'completed_at', s.completed_at);
  end if;

  update public.alignment_sessions
     set data         = p_data,
         current_step = p_current_step,
         version      = s.version + 1,
         updated_at   = now(),
         status       = case
                          when s.status = 'complete' or coalesce(p_complete, false)
                            then 'complete'
                          else 'in_progress'
                        end,
         completed_at = case
                          when s.status = 'complete' then s.completed_at
                          when coalesce(p_complete, false) then now()
                          else null
                        end
   where id = s.id
   returning * into v_new;

  return jsonb_build_object(
    'ok', true, 'version', v_new.version, 'updated_at', v_new.updated_at,
    'status', v_new.status, 'completed_at', v_new.completed_at);
end;
$function$;
  revoke all on function public.alignment_save(text, text, text, jsonb, jsonb, integer, boolean) from public;
  grant execute on function public.alignment_save(text, text, text, jsonb, jsonb, integer, boolean) to anon, authenticated;
end if;
end
$b024$;

-- Function create_alignment_session(text,text)
do $b024$
begin
if to_regprocedure('public.create_alignment_session(text,text)') is null then
CREATE FUNCTION public.create_alignment_session(p_client_label text, p_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_token text;
  v_code  text := '';
  v_byte  integer;
begin
  if btrim(coalesce(p_client_label, '')) = '' or btrim(coalesce(p_email, '')) = '' then
    raise exception 'Client label and email are both required.';
  end if;

  v_token := translate(encode(gen_random_bytes(32), 'base64'), '+/=', '-_');
  v_token := regexp_replace(v_token, '\s', '', 'g');

  while char_length(v_code) < 6 loop
    v_byte := get_byte(gen_random_bytes(1), 0);
    if v_byte < 248 then
      v_code := v_code || substr(v_alphabet, (v_byte % 31) + 1, 1);
    end if;
  end loop;

  insert into public.alignment_sessions
    (token, access_code_hash, client_label, respondent_email, created_by)
  values
    (v_token, crypt(v_code, gen_salt('bf')), btrim(p_client_label),
     lower(btrim(p_email)), session_user);

  return jsonb_build_object(
    'token', v_token,
    'access_code', v_code,
    'link_path', '/health-check/' || v_token,
    'note', 'The access code is shown once and is not stored. Copy it now.');
end;
$function$;
  revoke all on function public.create_alignment_session(text, text) from public, anon, authenticated;
end if;
end
$b024$;

-- Function create_profile_on_signup()
do $b024$
begin
if to_regprocedure('public.create_profile_on_signup()') is null then
CREATE FUNCTION public.create_profile_on_signup()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  BEGIN 
    INSERT INTO public.profiles (id, email)
    VALUES (NEW.id, NEW.email)
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
  END;
  $function$;
end if;
end
$b024$;

-- Function update_updated_at()
do $b024$
begin
if to_regprocedure('public.update_updated_at()') is null then
CREATE FUNCTION public.update_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
  BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
  END;
  $function$;
end if;
end
$b024$;

-- Function wheel_of_life_checkin_valid(jsonb,jsonb,jsonb)
do $b024$
begin
if to_regprocedure('public.wheel_of_life_checkin_valid(jsonb,jsonb,jsonb)') is null then
CREATE FUNCTION public.wheel_of_life_checkin_valid(scores jsonb, notes jsonb, areas jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare
  k       text;
  v       jsonb;
  a       jsonb;
  n_keys  integer := 0;
  seen    text[] := '{}';
begin
  if scores is null or jsonb_typeof(scores) <> 'object' then return false; end if;
  if notes is null or jsonb_typeof(notes) <> 'object' then return false; end if;
  if areas is null or jsonb_typeof(areas) <> 'array' then return false; end if;

  for k, v in select e.key, e.value from jsonb_each(scores) e loop
    n_keys := n_keys + 1;
    if char_length(k) < 1 or char_length(k) > 60 then return false; end if;
    if jsonb_typeof(v) <> 'number' then return false; end if;
    if (v #>> '{}')::numeric <> trunc((v #>> '{}')::numeric) then return false; end if;
    if (v #>> '{}')::numeric < 0 or (v #>> '{}')::numeric > 10 then return false; end if;
  end loop;
  if n_keys < 1 or n_keys > 60 then return false; end if;

  for k, v in select e.key, e.value from jsonb_each(notes) e loop
    if not (scores ? k) then return false; end if;
    if jsonb_typeof(v) <> 'string' then return false; end if;
    if char_length(v #>> '{}') > 1000 then return false; end if;
  end loop;

  if jsonb_array_length(areas) <> n_keys then return false; end if;
  for a in select x from jsonb_array_elements(areas) x loop
    if jsonb_typeof(a) <> 'object' then return false; end if;
    if jsonb_typeof(a -> 'key') is distinct from 'string' then return false; end if;
    if jsonb_typeof(a -> 'label') is distinct from 'string' then return false; end if;
    if char_length(a ->> 'label') < 1 or char_length(a ->> 'label') > 100 then return false; end if;
    if not (scores ? (a ->> 'key')) then return false; end if;
    if (a ->> 'key') = any (seen) then return false; end if;
    seen := seen || (a ->> 'key');
  end loop;

  return true;
end;
$function$;
  revoke all on function public.wheel_of_life_checkin_valid(jsonb, jsonb, jsonb) from public, anon;
  grant execute on function public.wheel_of_life_checkin_valid(jsonb, jsonb, jsonb) to authenticated, service_role;
end if;
end
$b024$;

-- Function wheel_of_life_touch()
do $b024$
begin
if to_regprocedure('public.wheel_of_life_touch()') is null then
CREATE FUNCTION public.wheel_of_life_touch()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  new.updated_at := now();
  if tg_table_name = 'wheel_of_life_areas' then
    if new.target is distinct from old.target then
      new.target_updated_at := now();
    end if;
  end if;
  return new;
end;
$function$;
  revoke all on function public.wheel_of_life_touch() from public, anon, authenticated;
end if;
end
$b024$;


-- -----------------------------------------------------------------------------
-- 4. Constraints (primary keys, unique and checks first, then the links between tables)
-- -----------------------------------------------------------------------------

-- Keys and checks: alignment_sessions
do $b024$
begin
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.alignment_sessions'::regclass and conname = 'alignment_sessions_pkey') then
    alter table public.alignment_sessions add constraint alignment_sessions_pkey PRIMARY KEY (id);
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.alignment_sessions'::regclass and conname = 'alignment_sessions_token_key') then
    alter table public.alignment_sessions add constraint alignment_sessions_token_key UNIQUE (token);
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.alignment_sessions'::regclass and conname = 'alignment_sessions_respondent_email_check') then
    alter table public.alignment_sessions add constraint alignment_sessions_respondent_email_check CHECK ((respondent_email = lower(btrim(respondent_email))));
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.alignment_sessions'::regclass and conname = 'alignment_sessions_status_check') then
    alter table public.alignment_sessions add constraint alignment_sessions_status_check CHECK ((status = ANY (ARRAY['invited'::text, 'in_progress'::text, 'complete'::text])));
  end if;
end
$b024$;

-- Keys and checks: breathing_sessions
do $b024$
begin
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.breathing_sessions'::regclass and conname = 'breathing_sessions_pkey') then
    alter table public.breathing_sessions add constraint breathing_sessions_pkey PRIMARY KEY (id);
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.breathing_sessions'::regclass and conname = 'breathing_sessions_breathing_mode_check') then
    alter table public.breathing_sessions add constraint breathing_sessions_breathing_mode_check CHECK ((breathing_mode = ANY (ARRAY['vagal'::text, 'box'::text, 'sigh'::text])));
  end if;
end
$b024$;

-- Keys and checks: daily_journals
do $b024$
begin
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.daily_journals'::regclass and conname = 'daily_journals_pkey') then
    alter table public.daily_journals add constraint daily_journals_pkey PRIMARY KEY (id);
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.daily_journals'::regclass and conname = 'daily_journals_user_id_journal_date_key') then
    alter table public.daily_journals add constraint daily_journals_user_id_journal_date_key UNIQUE (user_id, journal_date);
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.daily_journals'::regclass and conname = 'daily_journals_status_check') then
    alter table public.daily_journals add constraint daily_journals_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'final'::text])));
  end if;
end
$b024$;

-- Keys and checks: decisions
do $b024$
begin
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.decisions'::regclass and conname = 'decisions_pkey') then
    alter table public.decisions add constraint decisions_pkey PRIMARY KEY (id);
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.decisions'::regclass and conname = 'decisions_tool_type_check') then
    alter table public.decisions add constraint decisions_tool_type_check CHECK ((tool_type = ANY (ARRAY['grow'::text, 'inversion'::text, 'tough-conversation'::text, 'strategic-alignment'::text, 'if_then_planning'::text, 'daily_plan'::text, 'plan_meeting'::text, 'stop_doing_audit'::text])));
  end if;
end
$b024$;

-- Keys and checks: guest_sessions
do $b024$
begin
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.guest_sessions'::regclass and conname = 'guest_sessions_pkey') then
    alter table public.guest_sessions add constraint guest_sessions_pkey PRIMARY KEY (session_id);
  end if;
end
$b024$;

-- Keys and checks: journal_entries
do $b024$
begin
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.journal_entries'::regclass and conname = 'journal_entries_pkey') then
    alter table public.journal_entries add constraint journal_entries_pkey PRIMARY KEY (id);
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.journal_entries'::regclass and conname = 'journal_entries_review_type_check') then
    alter table public.journal_entries add constraint journal_entries_review_type_check CHECK ((review_type = ANY (ARRAY['after-action'::text, 'progress'::text, 'weekly-momentum'::text, 'plan-review'::text])));
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.journal_entries'::regclass and conname = 'journal_entries_status_check') then
    alter table public.journal_entries add constraint journal_entries_status_check CHECK ((status = ANY (ARRAY['final'::text, 'draft'::text])));
  end if;
end
$b024$;

-- Keys and checks: mission_progress_reviews
do $b024$
begin
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.mission_progress_reviews'::regclass and conname = 'mission_progress_reviews_pkey') then
    alter table public.mission_progress_reviews add constraint mission_progress_reviews_pkey PRIMARY KEY (id);
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.mission_progress_reviews'::regclass and conname = 'mission_progress_reviews_status_check') then
    alter table public.mission_progress_reviews add constraint mission_progress_reviews_status_check CHECK ((status = ANY (ARRAY['final'::text, 'draft'::text])));
  end if;
end
$b024$;

-- Keys and checks: mission_versions
do $b024$
begin
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.mission_versions'::regclass and conname = 'mission_versions_pkey') then
    alter table public.mission_versions add constraint mission_versions_pkey PRIMARY KEY (id);
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.mission_versions'::regclass and conname = 'mission_versions_mission_id_major_minor_key') then
    alter table public.mission_versions add constraint mission_versions_mission_id_major_minor_key UNIQUE (mission_id, major, minor);
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.mission_versions'::regclass and conname = 'mission_versions_change_type_check') then
    alter table public.mission_versions add constraint mission_versions_change_type_check CHECK ((change_type = ANY (ARRAY['start'::text, 'major'::text, 'minor'::text, 'restore'::text])));
  end if;
end
$b024$;

-- Keys and checks: missions
do $b024$
begin
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.missions'::regclass and conname = 'missions_pkey') then
    alter table public.missions add constraint missions_pkey PRIMARY KEY (id);
  end if;
end
$b024$;

-- Keys and checks: plans
do $b024$
begin
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.plans'::regclass and conname = 'plans_pkey') then
    alter table public.plans add constraint plans_pkey PRIMARY KEY (id);
  end if;
end
$b024$;

-- Keys and checks: profiles
do $b024$
begin
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.profiles'::regclass and conname = 'profiles_pkey') then
    alter table public.profiles add constraint profiles_pkey PRIMARY KEY (id);
  end if;
end
$b024$;

-- Keys and checks: reflections
do $b024$
begin
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.reflections'::regclass and conname = 'reflections_pkey') then
    alter table public.reflections add constraint reflections_pkey PRIMARY KEY (id);
  end if;
end
$b024$;

-- Keys and checks: strategic_alignments
do $b024$
begin
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.strategic_alignments'::regclass and conname = 'strategic_alignments_pkey') then
    alter table public.strategic_alignments add constraint strategic_alignments_pkey PRIMARY KEY (id);
  end if;
end
$b024$;

-- Keys and checks: strategies
do $b024$
begin
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.strategies'::regclass and conname = 'strategies_pkey') then
    alter table public.strategies add constraint strategies_pkey PRIMARY KEY (id);
  end if;
end
$b024$;

-- Keys and checks: tactics
do $b024$
begin
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.tactics'::regclass and conname = 'tactics_pkey') then
    alter table public.tactics add constraint tactics_pkey PRIMARY KEY (id);
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.tactics'::regclass and conname = 'tactics_type_check') then
    alter table public.tactics add constraint tactics_type_check CHECK ((type = ANY (ARRAY['tickable'::text, 'measurable'::text])));
  end if;
end
$b024$;

-- Keys and checks: wheel_of_life_areas
do $b024$
begin
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.wheel_of_life_areas'::regclass and conname = 'wheel_of_life_areas_pkey') then
    alter table public.wheel_of_life_areas add constraint wheel_of_life_areas_pkey PRIMARY KEY (id);
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.wheel_of_life_areas'::regclass and conname = 'wheel_of_life_areas_user_key') then
    alter table public.wheel_of_life_areas add constraint wheel_of_life_areas_user_key UNIQUE (user_id, area_key);
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.wheel_of_life_areas'::regclass and conname = 'wheel_of_life_areas_key_check') then
    alter table public.wheel_of_life_areas add constraint wheel_of_life_areas_key_check CHECK ((((kind = 'standard'::text) AND (area_key = ANY (ARRAY['career'::text, 'financial'::text, 'health'::text, 'relationships'::text, 'romance'::text, 'growth'::text, 'fun'::text, 'home'::text, 'contribution'::text, 'meaning'::text]))) OR ((kind = 'own'::text) AND (area_key ~~ 'own\_%'::text) AND (char_length(area_key) <= 60))));
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.wheel_of_life_areas'::regclass and conname = 'wheel_of_life_areas_kind_check') then
    alter table public.wheel_of_life_areas add constraint wheel_of_life_areas_kind_check CHECK ((kind = ANY (ARRAY['standard'::text, 'own'::text])));
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.wheel_of_life_areas'::regclass and conname = 'wheel_of_life_areas_label_check') then
    alter table public.wheel_of_life_areas add constraint wheel_of_life_areas_label_check CHECK ((((kind = 'standard'::text) AND (label IS NULL)) OR ((kind = 'own'::text) AND (label IS NOT NULL) AND ((char_length(btrim(label)) >= 1) AND (char_length(btrim(label)) <= 24)))));
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.wheel_of_life_areas'::regclass and conname = 'wheel_of_life_areas_target_check') then
    alter table public.wheel_of_life_areas add constraint wheel_of_life_areas_target_check CHECK (((target >= 0) AND (target <= 10)));
  end if;
end
$b024$;

-- Keys and checks: wheel_of_life_checkins
do $b024$
begin
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.wheel_of_life_checkins'::regclass and conname = 'wheel_of_life_checkins_pkey') then
    alter table public.wheel_of_life_checkins add constraint wheel_of_life_checkins_pkey PRIMARY KEY (id);
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.wheel_of_life_checkins'::regclass and conname = 'wheel_of_life_checkins_focus_key_check') then
    alter table public.wheel_of_life_checkins add constraint wheel_of_life_checkins_focus_key_check CHECK (((focus_area_key IS NULL) OR (scores ? focus_area_key)));
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.wheel_of_life_checkins'::regclass and conname = 'wheel_of_life_checkins_focus_note_check') then
    alter table public.wheel_of_life_checkins add constraint wheel_of_life_checkins_focus_note_check CHECK (((focus_note IS NULL) OR (char_length(focus_note) <= 500)));
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.wheel_of_life_checkins'::regclass and conname = 'wheel_of_life_checkins_valid') then
    alter table public.wheel_of_life_checkins add constraint wheel_of_life_checkins_valid CHECK (public.wheel_of_life_checkin_valid(scores, notes, areas));
  end if;
end
$b024$;

-- Keys and checks: wheel_of_life_settings
do $b024$
begin
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.wheel_of_life_settings'::regclass and conname = 'wheel_of_life_settings_pkey') then
    alter table public.wheel_of_life_settings add constraint wheel_of_life_settings_pkey PRIMARY KEY (user_id);
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.wheel_of_life_settings'::regclass and conname = 'wheel_of_life_settings_chart_style_check') then
    alter table public.wheel_of_life_settings add constraint wheel_of_life_settings_chart_style_check CHECK ((chart_style = ANY (ARRAY['sectional'::text, 'radar'::text, 'delta'::text])));
  end if;
end
$b024$;

-- Links: alignment_sessions
do $b024$
begin
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.alignment_sessions'::regclass and conname = 'alignment_sessions_user_id_fkey') then
    alter table public.alignment_sessions add constraint alignment_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
  end if;
end
$b024$;

-- Links: breathing_sessions
do $b024$
begin
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.breathing_sessions'::regclass and conname = 'breathing_sessions_user_id_fkey') then
    alter table public.breathing_sessions add constraint breathing_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  end if;
end
$b024$;

-- Links: daily_journals
do $b024$
begin
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.daily_journals'::regclass and conname = 'daily_journals_user_id_fkey') then
    alter table public.daily_journals add constraint daily_journals_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  end if;
end
$b024$;

-- Links: decisions
do $b024$
begin
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.decisions'::regclass and conname = 'decisions_user_id_fkey') then
    alter table public.decisions add constraint decisions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  end if;
end
$b024$;

-- Links: journal_entries
do $b024$
begin
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.journal_entries'::regclass and conname = 'journal_entries_user_id_fkey') then
    alter table public.journal_entries add constraint journal_entries_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  end if;
end
$b024$;

-- Links: mission_progress_reviews
do $b024$
begin
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.mission_progress_reviews'::regclass and conname = 'mission_progress_reviews_mission_id_fkey') then
    alter table public.mission_progress_reviews add constraint mission_progress_reviews_mission_id_fkey FOREIGN KEY (mission_id) REFERENCES public.missions(id) ON DELETE CASCADE;
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.mission_progress_reviews'::regclass and conname = 'mission_progress_reviews_plan_version_id_fkey') then
    alter table public.mission_progress_reviews add constraint mission_progress_reviews_plan_version_id_fkey FOREIGN KEY (plan_version_id) REFERENCES public.mission_versions(id) ON DELETE SET NULL;
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.mission_progress_reviews'::regclass and conname = 'mission_progress_reviews_user_id_fkey') then
    alter table public.mission_progress_reviews add constraint mission_progress_reviews_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  end if;
end
$b024$;

-- Links: mission_versions
do $b024$
begin
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.mission_versions'::regclass and conname = 'mission_versions_mission_id_fkey') then
    alter table public.mission_versions add constraint mission_versions_mission_id_fkey FOREIGN KEY (mission_id) REFERENCES public.missions(id) ON DELETE CASCADE;
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.mission_versions'::regclass and conname = 'mission_versions_restored_from_fkey') then
    alter table public.mission_versions add constraint mission_versions_restored_from_fkey FOREIGN KEY (restored_from) REFERENCES public.mission_versions(id);
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.mission_versions'::regclass and conname = 'mission_versions_user_id_fkey') then
    alter table public.mission_versions add constraint mission_versions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  end if;
end
$b024$;

-- Links: missions
do $b024$
begin
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.missions'::regclass and conname = 'missions_user_id_fkey') then
    alter table public.missions add constraint missions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  end if;
end
$b024$;

-- Links: plans
do $b024$
begin
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.plans'::regclass and conname = 'plans_user_id_fkey') then
    alter table public.plans add constraint plans_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  end if;
end
$b024$;

-- Links: profiles
do $b024$
begin
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.profiles'::regclass and conname = 'profiles_id_fkey') then
    alter table public.profiles add constraint profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
  end if;
end
$b024$;

-- Links: reflections
do $b024$
begin
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.reflections'::regclass and conname = 'reflections_linked_decision_id_fkey') then
    alter table public.reflections add constraint reflections_linked_decision_id_fkey FOREIGN KEY (linked_decision_id) REFERENCES public.decisions(id) ON DELETE SET NULL;
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.reflections'::regclass and conname = 'reflections_user_id_fkey') then
    alter table public.reflections add constraint reflections_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  end if;
end
$b024$;

-- Links: strategic_alignments
do $b024$
begin
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.strategic_alignments'::regclass and conname = 'strategic_alignments_user_id_fkey') then
    alter table public.strategic_alignments add constraint strategic_alignments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  end if;
end
$b024$;

-- Links: strategies
do $b024$
begin
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.strategies'::regclass and conname = 'strategies_mission_id_fkey') then
    alter table public.strategies add constraint strategies_mission_id_fkey FOREIGN KEY (mission_id) REFERENCES public.missions(id) ON DELETE CASCADE;
  end if;
end
$b024$;

-- Links: tactics
do $b024$
begin
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.tactics'::regclass and conname = 'tactics_strategy_id_fkey') then
    alter table public.tactics add constraint tactics_strategy_id_fkey FOREIGN KEY (strategy_id) REFERENCES public.strategies(id) ON DELETE CASCADE;
  end if;
end
$b024$;

-- Links: wheel_of_life_areas
do $b024$
begin
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.wheel_of_life_areas'::regclass and conname = 'wheel_of_life_areas_user_id_fkey') then
    alter table public.wheel_of_life_areas add constraint wheel_of_life_areas_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  end if;
end
$b024$;

-- Links: wheel_of_life_checkins
do $b024$
begin
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.wheel_of_life_checkins'::regclass and conname = 'wheel_of_life_checkins_user_id_fkey') then
    alter table public.wheel_of_life_checkins add constraint wheel_of_life_checkins_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  end if;
end
$b024$;

-- Links: wheel_of_life_settings
do $b024$
begin
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.wheel_of_life_settings'::regclass and conname = 'wheel_of_life_settings_user_id_fkey') then
    alter table public.wheel_of_life_settings add constraint wheel_of_life_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  end if;
end
$b024$;


-- -----------------------------------------------------------------------------
-- 5. Indexes
-- -----------------------------------------------------------------------------

create index if not exists idx_breathing_sessions_date ON public.breathing_sessions USING btree (date);

create index if not exists idx_breathing_sessions_user_id ON public.breathing_sessions USING btree (user_id);

create index if not exists idx_daily_journals_user_date ON public.daily_journals USING btree (user_id, journal_date DESC);

create index if not exists idx_decisions_created_at ON public.decisions USING btree (created_at DESC);

create index if not exists idx_decisions_user_id ON public.decisions USING btree (user_id);

create index if not exists idx_journal_entries_created_at ON public.journal_entries USING btree (created_at DESC);

create index if not exists idx_journal_entries_entry_date ON public.journal_entries USING btree (entry_date DESC);

create index if not exists idx_journal_entries_status ON public.journal_entries USING btree (user_id, review_type, status);

create index if not exists idx_journal_entries_user_id ON public.journal_entries USING btree (user_id);

create index if not exists idx_mission_progress_reviews_created_at ON public.mission_progress_reviews USING btree (created_at DESC);

create index if not exists idx_mission_progress_reviews_mission_id ON public.mission_progress_reviews USING btree (mission_id);

create index if not exists idx_mission_progress_reviews_plan_version_id ON public.mission_progress_reviews USING btree (plan_version_id);

create index if not exists idx_mission_progress_reviews_user_id ON public.mission_progress_reviews USING btree (user_id);

create index if not exists idx_mission_versions_mission_major_minor ON public.mission_versions USING btree (mission_id, major DESC, minor DESC);

create index if not exists idx_missions_archived_at ON public.missions USING btree (archived_at);

create index if not exists idx_missions_user_id ON public.missions USING btree (user_id);

create index if not exists idx_reflections_created_at ON public.reflections USING btree (created_at DESC);

create index if not exists idx_reflections_user_id ON public.reflections USING btree (user_id);

create index if not exists idx_strategic_alignments_created_at ON public.strategic_alignments USING btree (created_at DESC);

create index if not exists idx_strategic_alignments_user_id ON public.strategic_alignments USING btree (user_id);

create index if not exists idx_strategies_mission_id ON public.strategies USING btree (mission_id);

create index if not exists idx_tactics_strategy_id ON public.tactics USING btree (strategy_id);

create index if not exists idx_wheel_of_life_areas_user ON public.wheel_of_life_areas USING btree (user_id);

create index if not exists idx_wheel_of_life_checkins_user_at ON public.wheel_of_life_checkins USING btree (user_id, checkin_at DESC);


-- -----------------------------------------------------------------------------
-- 6. Triggers (including the one that makes a profile when someone signs up)
-- -----------------------------------------------------------------------------

-- Trigger decisions.update_decisions_updated_at
do $b024$
begin
  if not exists (select 1 from pg_catalog.pg_trigger where tgrelid = 'public.decisions'::regclass and tgname = 'update_decisions_updated_at') then
    CREATE TRIGGER update_decisions_updated_at BEFORE UPDATE ON public.decisions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
  end if;
end
$b024$;

-- Trigger journal_entries.update_journal_entries_updated_at
do $b024$
begin
  if not exists (select 1 from pg_catalog.pg_trigger where tgrelid = 'public.journal_entries'::regclass and tgname = 'update_journal_entries_updated_at') then
    CREATE TRIGGER update_journal_entries_updated_at BEFORE UPDATE ON public.journal_entries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
  end if;
end
$b024$;

-- Trigger reflections.update_reflections_updated_at
do $b024$
begin
  if not exists (select 1 from pg_catalog.pg_trigger where tgrelid = 'public.reflections'::regclass and tgname = 'update_reflections_updated_at') then
    CREATE TRIGGER update_reflections_updated_at BEFORE UPDATE ON public.reflections FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
  end if;
end
$b024$;

-- Trigger strategic_alignments.update_strategic_alignments_updated_at
do $b024$
begin
  if not exists (select 1 from pg_catalog.pg_trigger where tgrelid = 'public.strategic_alignments'::regclass and tgname = 'update_strategic_alignments_updated_at') then
    CREATE TRIGGER update_strategic_alignments_updated_at BEFORE UPDATE ON public.strategic_alignments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
  end if;
end
$b024$;

-- Trigger wheel_of_life_areas.wheel_of_life_areas_touch
do $b024$
begin
  if not exists (select 1 from pg_catalog.pg_trigger where tgrelid = 'public.wheel_of_life_areas'::regclass and tgname = 'wheel_of_life_areas_touch') then
    CREATE TRIGGER wheel_of_life_areas_touch BEFORE UPDATE ON public.wheel_of_life_areas FOR EACH ROW EXECUTE FUNCTION public.wheel_of_life_touch();
  end if;
end
$b024$;

-- Trigger wheel_of_life_settings.wheel_of_life_settings_touch
do $b024$
begin
  if not exists (select 1 from pg_catalog.pg_trigger where tgrelid = 'public.wheel_of_life_settings'::regclass and tgname = 'wheel_of_life_settings_touch') then
    CREATE TRIGGER wheel_of_life_settings_touch BEFORE UPDATE ON public.wheel_of_life_settings FOR EACH ROW EXECUTE FUNCTION public.wheel_of_life_touch();
  end if;
end
$b024$;

-- Trigger auth.users.on_auth_user_created
do $b024$
begin
  if not exists (select 1 from pg_catalog.pg_trigger where tgrelid = 'auth.users'::regclass and tgname = 'on_auth_user_created') then
    CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.create_profile_on_signup();
  end if;
end
$b024$;


-- -----------------------------------------------------------------------------
-- 7. Row security switched on (it is on for every table)
-- -----------------------------------------------------------------------------

-- Row security
do $b024$
begin
  if not (select relrowsecurity from pg_catalog.pg_class where oid = 'public.alignment_sessions'::regclass) then
    alter table public.alignment_sessions enable row level security;
  end if;
  if not (select relrowsecurity from pg_catalog.pg_class where oid = 'public.breathing_sessions'::regclass) then
    alter table public.breathing_sessions enable row level security;
  end if;
  if not (select relrowsecurity from pg_catalog.pg_class where oid = 'public.daily_journals'::regclass) then
    alter table public.daily_journals enable row level security;
  end if;
  if not (select relrowsecurity from pg_catalog.pg_class where oid = 'public.decisions'::regclass) then
    alter table public.decisions enable row level security;
  end if;
  if not (select relrowsecurity from pg_catalog.pg_class where oid = 'public.guest_sessions'::regclass) then
    alter table public.guest_sessions enable row level security;
  end if;
  if not (select relrowsecurity from pg_catalog.pg_class where oid = 'public.journal_entries'::regclass) then
    alter table public.journal_entries enable row level security;
  end if;
  if not (select relrowsecurity from pg_catalog.pg_class where oid = 'public.mission_progress_reviews'::regclass) then
    alter table public.mission_progress_reviews enable row level security;
  end if;
  if not (select relrowsecurity from pg_catalog.pg_class where oid = 'public.mission_versions'::regclass) then
    alter table public.mission_versions enable row level security;
  end if;
  if not (select relrowsecurity from pg_catalog.pg_class where oid = 'public.missions'::regclass) then
    alter table public.missions enable row level security;
  end if;
  if not (select relrowsecurity from pg_catalog.pg_class where oid = 'public.plans'::regclass) then
    alter table public.plans enable row level security;
  end if;
  if not (select relrowsecurity from pg_catalog.pg_class where oid = 'public.profiles'::regclass) then
    alter table public.profiles enable row level security;
  end if;
  if not (select relrowsecurity from pg_catalog.pg_class where oid = 'public.reflections'::regclass) then
    alter table public.reflections enable row level security;
  end if;
  if not (select relrowsecurity from pg_catalog.pg_class where oid = 'public.strategic_alignments'::regclass) then
    alter table public.strategic_alignments enable row level security;
  end if;
  if not (select relrowsecurity from pg_catalog.pg_class where oid = 'public.strategies'::regclass) then
    alter table public.strategies enable row level security;
  end if;
  if not (select relrowsecurity from pg_catalog.pg_class where oid = 'public.tactics'::regclass) then
    alter table public.tactics enable row level security;
  end if;
  if not (select relrowsecurity from pg_catalog.pg_class where oid = 'public.wheel_of_life_areas'::regclass) then
    alter table public.wheel_of_life_areas enable row level security;
  end if;
  if not (select relrowsecurity from pg_catalog.pg_class where oid = 'public.wheel_of_life_checkins'::regclass) then
    alter table public.wheel_of_life_checkins enable row level security;
  end if;
  if not (select relrowsecurity from pg_catalog.pg_class where oid = 'public.wheel_of_life_settings'::regclass) then
    alter table public.wheel_of_life_settings enable row level security;
  end if;
end
$b024$;


-- -----------------------------------------------------------------------------
-- 8. Security rules (each made only if a rule with that name is missing)
-- -----------------------------------------------------------------------------

-- Rules: breathing_sessions
do $b024$
begin
if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'breathing_sessions'
                 and policyname = 'Users can delete their own breathing
  sessions') then
  create policy "Users can delete their own breathing
  sessions" on public.breathing_sessions as permissive for delete
    to public
    using ((auth.uid() = user_id));
end if;
if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'breathing_sessions'
                 and policyname = 'Users can insert their own breathing
  sessions') then
  create policy "Users can insert their own breathing
  sessions" on public.breathing_sessions as permissive for insert
    to public
    with check ((auth.uid() = user_id));
end if;
if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'breathing_sessions'
                 and policyname = 'Users can update their own breathing
  sessions') then
  create policy "Users can update their own breathing
  sessions" on public.breathing_sessions as permissive for update
    to public
    using ((auth.uid() = user_id));
end if;
if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'breathing_sessions'
                 and policyname = 'Users can view their own breathing
  sessions') then
  create policy "Users can view their own breathing
  sessions" on public.breathing_sessions as permissive for select
    to public
    using ((auth.uid() = user_id));
end if;
if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'breathing_sessions'
                 and policyname = 'delete_own_records') then
  create policy "delete_own_records" on public.breathing_sessions as permissive for delete
    to public
    using ((auth.uid() = user_id));
end if;
if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'breathing_sessions'
                 and policyname = 'insert_own_records') then
  create policy "insert_own_records" on public.breathing_sessions as permissive for insert
    to public
    with check ((auth.uid() = user_id));
end if;
if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'breathing_sessions'
                 and policyname = 'select_own_records') then
  create policy "select_own_records" on public.breathing_sessions as permissive for select
    to public
    using ((auth.uid() = user_id));
end if;
if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'breathing_sessions'
                 and policyname = 'update_own_records') then
  create policy "update_own_records" on public.breathing_sessions as permissive for update
    to public
    using ((auth.uid() = user_id))
    with check ((auth.uid() = user_id));
end if;
end
$b024$;

-- Rules: daily_journals
do $b024$
begin
  if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'daily_journals'
                   and policyname = 'Users can delete their own journals') then
    create policy "Users can delete their own journals" on public.daily_journals as permissive for delete
      to public
      using ((auth.uid() = user_id));
  end if;
  if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'daily_journals'
                   and policyname = 'Users can insert their own journals') then
    create policy "Users can insert their own journals" on public.daily_journals as permissive for insert
      to public
      with check ((auth.uid() = user_id));
  end if;
  if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'daily_journals'
                   and policyname = 'Users can update their own journals') then
    create policy "Users can update their own journals" on public.daily_journals as permissive for update
      to public
      using ((auth.uid() = user_id));
  end if;
  if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'daily_journals'
                   and policyname = 'Users can view their own journals') then
    create policy "Users can view their own journals" on public.daily_journals as permissive for select
      to public
      using ((auth.uid() = user_id));
  end if;
end
$b024$;

-- Rules: decisions
do $b024$
begin
  if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'decisions'
                   and policyname = 'Users can delete their own decisions') then
    create policy "Users can delete their own decisions" on public.decisions as permissive for delete
      to public
      using ((auth.uid() = user_id));
  end if;
  if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'decisions'
                   and policyname = 'Users can insert their own decisions') then
    create policy "Users can insert their own decisions" on public.decisions as permissive for insert
      to public
      with check ((auth.uid() = user_id));
  end if;
  if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'decisions'
                   and policyname = 'Users can update their own decisions') then
    create policy "Users can update their own decisions" on public.decisions as permissive for update
      to public
      using ((auth.uid() = user_id));
  end if;
  if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'decisions'
                   and policyname = 'Users can view their own decisions') then
    create policy "Users can view their own decisions" on public.decisions as permissive for select
      to public
      using ((auth.uid() = user_id));
  end if;
  if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'decisions'
                   and policyname = 'delete_own_records') then
    create policy "delete_own_records" on public.decisions as permissive for delete
      to public
      using ((auth.uid() = user_id));
  end if;
  if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'decisions'
                   and policyname = 'insert_own_records') then
    create policy "insert_own_records" on public.decisions as permissive for insert
      to public
      with check ((auth.uid() = user_id));
  end if;
  if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'decisions'
                   and policyname = 'select_own_records') then
    create policy "select_own_records" on public.decisions as permissive for select
      to public
      using ((auth.uid() = user_id));
  end if;
  if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'decisions'
                   and policyname = 'update_own_records') then
    create policy "update_own_records" on public.decisions as permissive for update
      to public
      using ((auth.uid() = user_id))
      with check ((auth.uid() = user_id));
  end if;
end
$b024$;

-- Rules: journal_entries
do $b024$
begin
  if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'journal_entries'
                   and policyname = 'Users can delete own entries') then
    create policy "Users can delete own entries" on public.journal_entries as permissive for delete
      to public
      using ((auth.uid() = user_id));
  end if;
  if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'journal_entries'
                   and policyname = 'Users can delete their own journal entries') then
    create policy "Users can delete their own journal entries" on public.journal_entries as permissive for delete
      to public
      using ((auth.uid() = user_id));
  end if;
  if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'journal_entries'
                   and policyname = 'Users can insert own entries') then
    create policy "Users can insert own entries" on public.journal_entries as permissive for insert
      to public
      with check ((auth.uid() = user_id));
  end if;
  if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'journal_entries'
                   and policyname = 'Users can insert their own journal entries') then
    create policy "Users can insert their own journal entries" on public.journal_entries as permissive for insert
      to public
      with check ((auth.uid() = user_id));
  end if;
  if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'journal_entries'
                   and policyname = 'Users can update own entries') then
    create policy "Users can update own entries" on public.journal_entries as permissive for update
      to public
      using ((auth.uid() = user_id));
  end if;
  if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'journal_entries'
                   and policyname = 'Users can update their own journal entries') then
    create policy "Users can update their own journal entries" on public.journal_entries as permissive for update
      to public
      using ((auth.uid() = user_id));
  end if;
  if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'journal_entries'
                   and policyname = 'Users can view own entries') then
    create policy "Users can view own entries" on public.journal_entries as permissive for select
      to public
      using ((auth.uid() = user_id));
  end if;
  if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'journal_entries'
                   and policyname = 'Users can view their own journal entries') then
    create policy "Users can view their own journal entries" on public.journal_entries as permissive for select
      to public
      using ((auth.uid() = user_id));
  end if;
  if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'journal_entries'
                   and policyname = 'delete_own_records') then
    create policy "delete_own_records" on public.journal_entries as permissive for delete
      to public
      using ((auth.uid() = user_id));
  end if;
  if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'journal_entries'
                   and policyname = 'insert_own_records') then
    create policy "insert_own_records" on public.journal_entries as permissive for insert
      to public
      with check ((auth.uid() = user_id));
  end if;
  if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'journal_entries'
                   and policyname = 'select_own_records') then
    create policy "select_own_records" on public.journal_entries as permissive for select
      to public
      using ((auth.uid() = user_id));
  end if;
  if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'journal_entries'
                   and policyname = 'update_own_records') then
    create policy "update_own_records" on public.journal_entries as permissive for update
      to public
      using ((auth.uid() = user_id))
      with check ((auth.uid() = user_id));
  end if;
end
$b024$;

-- Rules: mission_progress_reviews
do $b024$
begin
  if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'mission_progress_reviews'
                   and policyname = 'Users can delete their own reviews') then
    create policy "Users can delete their own reviews" on public.mission_progress_reviews as permissive for delete
      to public
      using ((auth.uid() = user_id));
  end if;
  if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'mission_progress_reviews'
                   and policyname = 'Users can insert their own reviews') then
    create policy "Users can insert their own reviews" on public.mission_progress_reviews as permissive for insert
      to public
      with check ((auth.uid() = user_id));
  end if;
  if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'mission_progress_reviews'
                   and policyname = 'Users can view their own reviews') then
    create policy "Users can view their own reviews" on public.mission_progress_reviews as permissive for select
      to public
      using ((auth.uid() = user_id));
  end if;
end
$b024$;

-- Rules: mission_versions
do $b024$
begin
  if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'mission_versions'
                   and policyname = 'Users can insert their own plan versions') then
    create policy "Users can insert their own plan versions" on public.mission_versions as permissive for insert
      to public
      with check ((auth.uid() = user_id));
  end if;
  if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'mission_versions'
                   and policyname = 'Users can view their own plan versions') then
    create policy "Users can view their own plan versions" on public.mission_versions as permissive for select
      to public
      using ((auth.uid() = user_id));
  end if;
end
$b024$;

-- Rules: missions
do $b024$
begin
  if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'missions'
                   and policyname = 'Users can delete their own missions') then
    create policy "Users can delete their own missions" on public.missions as permissive for delete
      to public
      using ((auth.uid() = user_id));
  end if;
  if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'missions'
                   and policyname = 'Users can insert their own missions') then
    create policy "Users can insert their own missions" on public.missions as permissive for insert
      to public
      with check ((auth.uid() = user_id));
  end if;
  if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'missions'
                   and policyname = 'Users can update their own missions') then
    create policy "Users can update their own missions" on public.missions as permissive for update
      to public
      using ((auth.uid() = user_id));
  end if;
  if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'missions'
                   and policyname = 'Users can view their own missions') then
    create policy "Users can view their own missions" on public.missions as permissive for select
      to public
      using ((auth.uid() = user_id));
  end if;
end
$b024$;

-- Rules: plans
do $b024$
begin
  if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'plans'
                   and policyname = 'Users can delete their own plans') then
    create policy "Users can delete their own plans" on public.plans as permissive for delete
      to public
      using ((auth.uid() = user_id));
  end if;
  if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'plans'
                   and policyname = 'Users can insert their own plans') then
    create policy "Users can insert their own plans" on public.plans as permissive for insert
      to public
      with check ((auth.uid() = user_id));
  end if;
  if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'plans'
                   and policyname = 'Users can update their own plans') then
    create policy "Users can update their own plans" on public.plans as permissive for update
      to public
      using ((auth.uid() = user_id));
  end if;
  if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'plans'
                   and policyname = 'Users can view their own plans') then
    create policy "Users can view their own plans" on public.plans as permissive for select
      to public
      using ((auth.uid() = user_id));
  end if;
  if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'plans'
                   and policyname = 'delete_own_records') then
    create policy "delete_own_records" on public.plans as permissive for delete
      to public
      using ((auth.uid() = user_id));
  end if;
  if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'plans'
                   and policyname = 'insert_own_records') then
    create policy "insert_own_records" on public.plans as permissive for insert
      to public
      with check ((auth.uid() = user_id));
  end if;
  if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'plans'
                   and policyname = 'select_own_records') then
    create policy "select_own_records" on public.plans as permissive for select
      to public
      using ((auth.uid() = user_id));
  end if;
  if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'plans'
                   and policyname = 'update_own_records') then
    create policy "update_own_records" on public.plans as permissive for update
      to public
      using ((auth.uid() = user_id))
      with check ((auth.uid() = user_id));
  end if;
end
$b024$;

-- Rules: profiles
do $b024$
begin
  if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'profiles'
                   and policyname = 'Allow profile creation on signup') then
    create policy "Allow profile creation on signup" on public.profiles as permissive for insert
      to public
      with check (true);
  end if;
  if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'profiles'
                   and policyname = 'Users can update their own profile') then
    create policy "Users can update their own profile" on public.profiles as permissive for update
      to public
      using ((auth.uid() = id));
  end if;
  if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'profiles'
                   and policyname = 'Users can view their own profile') then
    create policy "Users can view their own profile" on public.profiles as permissive for select
      to public
      using ((auth.uid() = id));
  end if;
  if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'profiles'
                   and policyname = 'delete_own_records') then
    create policy "delete_own_records" on public.profiles as permissive for delete
      to public
      using ((auth.uid() = id));
  end if;
  if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'profiles'
                   and policyname = 'insert_own_records') then
    create policy "insert_own_records" on public.profiles as permissive for insert
      to public
      with check ((auth.uid() = id));
  end if;
  if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'profiles'
                   and policyname = 'select_own_records') then
    create policy "select_own_records" on public.profiles as permissive for select
      to public
      using ((auth.uid() = id));
  end if;
  if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'profiles'
                   and policyname = 'update_own_records') then
    create policy "update_own_records" on public.profiles as permissive for update
      to public
      using ((auth.uid() = id))
      with check ((auth.uid() = id));
  end if;
end
$b024$;

-- Rules: reflections
do $b024$
begin
  if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'reflections'
                   and policyname = 'Users can delete their own reflections') then
    create policy "Users can delete their own reflections" on public.reflections as permissive for delete
      to public
      using ((auth.uid() = user_id));
  end if;
  if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'reflections'
                   and policyname = 'Users can insert their own reflections') then
    create policy "Users can insert their own reflections" on public.reflections as permissive for insert
      to public
      with check ((auth.uid() = user_id));
  end if;
  if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'reflections'
                   and policyname = 'Users can update their own reflections') then
    create policy "Users can update their own reflections" on public.reflections as permissive for update
      to public
      using ((auth.uid() = user_id));
  end if;
  if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'reflections'
                   and policyname = 'Users can view their own reflections') then
    create policy "Users can view their own reflections" on public.reflections as permissive for select
      to public
      using ((auth.uid() = user_id));
  end if;
  if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'reflections'
                   and policyname = 'delete_own_records') then
    create policy "delete_own_records" on public.reflections as permissive for delete
      to public
      using ((auth.uid() = user_id));
  end if;
  if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'reflections'
                   and policyname = 'insert_own_records') then
    create policy "insert_own_records" on public.reflections as permissive for insert
      to public
      with check ((auth.uid() = user_id));
  end if;
  if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'reflections'
                   and policyname = 'select_own_records') then
    create policy "select_own_records" on public.reflections as permissive for select
      to public
      using ((auth.uid() = user_id));
  end if;
  if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'reflections'
                   and policyname = 'update_own_records') then
    create policy "update_own_records" on public.reflections as permissive for update
      to public
      using ((auth.uid() = user_id))
      with check ((auth.uid() = user_id));
  end if;
end
$b024$;

-- Rules: strategic_alignments
do $b024$
begin
  if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'strategic_alignments'
                   and policyname = 'Users can delete their own alignments') then
    create policy "Users can delete their own alignments" on public.strategic_alignments as permissive for delete
      to public
      using ((auth.uid() = user_id));
  end if;
  if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'strategic_alignments'
                   and policyname = 'Users can insert their own alignments') then
    create policy "Users can insert their own alignments" on public.strategic_alignments as permissive for insert
      to public
      with check ((auth.uid() = user_id));
  end if;
  if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'strategic_alignments'
                   and policyname = 'Users can update their own alignments') then
    create policy "Users can update their own alignments" on public.strategic_alignments as permissive for update
      to public
      using ((auth.uid() = user_id));
  end if;
  if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'strategic_alignments'
                   and policyname = 'Users can view their own alignments') then
    create policy "Users can view their own alignments" on public.strategic_alignments as permissive for select
      to public
      using ((auth.uid() = user_id));
  end if;
  if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'strategic_alignments'
                   and policyname = 'delete_own_records') then
    create policy "delete_own_records" on public.strategic_alignments as permissive for delete
      to public
      using ((auth.uid() = user_id));
  end if;
  if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'strategic_alignments'
                   and policyname = 'insert_own_records') then
    create policy "insert_own_records" on public.strategic_alignments as permissive for insert
      to public
      with check ((auth.uid() = user_id));
  end if;
  if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'strategic_alignments'
                   and policyname = 'select_own_records') then
    create policy "select_own_records" on public.strategic_alignments as permissive for select
      to public
      using ((auth.uid() = user_id));
  end if;
  if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'strategic_alignments'
                   and policyname = 'update_own_records') then
    create policy "update_own_records" on public.strategic_alignments as permissive for update
      to public
      using ((auth.uid() = user_id))
      with check ((auth.uid() = user_id));
  end if;
end
$b024$;

-- Rules: strategies
do $b024$
begin
  if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'strategies'
                   and policyname = 'Users can delete strategies from their missions') then
    create policy "Users can delete strategies from their missions" on public.strategies as permissive for delete
      to public
      using ((mission_id IN ( SELECT missions.id
     FROM public.missions
    WHERE (missions.user_id = auth.uid()))));
  end if;
  if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'strategies'
                   and policyname = 'Users can insert strategies to their missions') then
    create policy "Users can insert strategies to their missions" on public.strategies as permissive for insert
      to public
      with check ((mission_id IN ( SELECT missions.id
     FROM public.missions
    WHERE (missions.user_id = auth.uid()))));
  end if;
  if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'strategies'
                   and policyname = 'Users can update strategies in their missions') then
    create policy "Users can update strategies in their missions" on public.strategies as permissive for update
      to public
      using ((mission_id IN ( SELECT missions.id
     FROM public.missions
    WHERE (missions.user_id = auth.uid()))));
  end if;
  if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'strategies'
                   and policyname = 'Users can view strategies from their missions') then
    create policy "Users can view strategies from their missions" on public.strategies as permissive for select
      to public
      using ((mission_id IN ( SELECT missions.id
     FROM public.missions
    WHERE (missions.user_id = auth.uid()))));
  end if;
end
$b024$;

-- Rules: tactics
do $b024$
begin
  if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'tactics'
                   and policyname = 'Users can delete tactics from their strategies') then
    create policy "Users can delete tactics from their strategies" on public.tactics as permissive for delete
      to public
      using ((strategy_id IN ( SELECT strategies.id
     FROM public.strategies
    WHERE (strategies.mission_id IN ( SELECT missions.id
             FROM public.missions
            WHERE (missions.user_id = auth.uid()))))));
  end if;
  if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'tactics'
                   and policyname = 'Users can insert tactics to their strategies') then
    create policy "Users can insert tactics to their strategies" on public.tactics as permissive for insert
      to public
      with check ((strategy_id IN ( SELECT strategies.id
     FROM public.strategies
    WHERE (strategies.mission_id IN ( SELECT missions.id
             FROM public.missions
            WHERE (missions.user_id = auth.uid()))))));
  end if;
  if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'tactics'
                   and policyname = 'Users can update tactics in their strategies') then
    create policy "Users can update tactics in their strategies" on public.tactics as permissive for update
      to public
      using ((strategy_id IN ( SELECT strategies.id
     FROM public.strategies
    WHERE (strategies.mission_id IN ( SELECT missions.id
             FROM public.missions
            WHERE (missions.user_id = auth.uid()))))));
  end if;
  if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'tactics'
                   and policyname = 'Users can view tactics from their strategies') then
    create policy "Users can view tactics from their strategies" on public.tactics as permissive for select
      to public
      using ((strategy_id IN ( SELECT strategies.id
     FROM public.strategies
    WHERE (strategies.mission_id IN ( SELECT missions.id
             FROM public.missions
            WHERE (missions.user_id = auth.uid()))))));
  end if;
end
$b024$;

-- Rules: wheel_of_life_areas
do $b024$
begin
  if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'wheel_of_life_areas'
                   and policyname = 'Users can insert their own wheel areas') then
    create policy "Users can insert their own wheel areas" on public.wheel_of_life_areas as permissive for insert
      to authenticated
      with check ((auth.uid() = user_id));
  end if;
  if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'wheel_of_life_areas'
                   and policyname = 'Users can update their own wheel areas') then
    create policy "Users can update their own wheel areas" on public.wheel_of_life_areas as permissive for update
      to authenticated
      using ((auth.uid() = user_id))
      with check ((auth.uid() = user_id));
  end if;
  if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'wheel_of_life_areas'
                   and policyname = 'Users can view their own wheel areas') then
    create policy "Users can view their own wheel areas" on public.wheel_of_life_areas as permissive for select
      to authenticated
      using ((auth.uid() = user_id));
  end if;
end
$b024$;

-- Rules: wheel_of_life_checkins
do $b024$
begin
  if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'wheel_of_life_checkins'
                   and policyname = 'Users can delete their own wheel check-ins') then
    create policy "Users can delete their own wheel check-ins" on public.wheel_of_life_checkins as permissive for delete
      to authenticated
      using ((auth.uid() = user_id));
  end if;
  if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'wheel_of_life_checkins'
                   and policyname = 'Users can insert their own wheel check-ins') then
    create policy "Users can insert their own wheel check-ins" on public.wheel_of_life_checkins as permissive for insert
      to authenticated
      with check ((auth.uid() = user_id));
  end if;
  if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'wheel_of_life_checkins'
                   and policyname = 'Users can view their own wheel check-ins') then
    create policy "Users can view their own wheel check-ins" on public.wheel_of_life_checkins as permissive for select
      to authenticated
      using ((auth.uid() = user_id));
  end if;
end
$b024$;

-- Rules: wheel_of_life_settings
do $b024$
begin
  if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'wheel_of_life_settings'
                   and policyname = 'Users can insert their own wheel settings') then
    create policy "Users can insert their own wheel settings" on public.wheel_of_life_settings as permissive for insert
      to authenticated
      with check ((auth.uid() = user_id));
  end if;
  if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'wheel_of_life_settings'
                   and policyname = 'Users can update their own wheel settings') then
    create policy "Users can update their own wheel settings" on public.wheel_of_life_settings as permissive for update
      to authenticated
      using ((auth.uid() = user_id))
      with check ((auth.uid() = user_id));
  end if;
  if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'wheel_of_life_settings'
                   and policyname = 'Users can view their own wheel settings') then
    create policy "Users can view their own wheel settings" on public.wheel_of_life_settings as permissive for select
      to authenticated
      using ((auth.uid() = user_id));
  end if;
end
$b024$;


-- -----------------------------------------------------------------------------
-- 9. Record this migration, once 025 (the migration log) exists
-- -----------------------------------------------------------------------------

do $b024$
begin
  if to_regprocedure('public.record_migration(integer,text)') is not null then
    perform public.record_migration(24, '024_baseline_live_structure');
  end if;
end
$b024$;
