# Migrations: what has run where

Each database keeps its own list in the table `public.migration_log` (from migration 025). This page is the same list as a checklist, one column for each database. **An empty box means "not checked", never "ran".**

## How migrations work here

- Tim runs every migration by hand in the Supabase SQL editor: on **clarity-portal-test** first, then on **clarity-portal-fresh** (live) when its notes say so.
- Files are numbered `NNN_what_it_does.sql`, and every new one is safe to run twice.
- **Every migration from 025 on ends with one line that records itself** on the database it ran on:

  ```sql
  select public.record_migration(26, '026_what_it_does');
  ```

- Before Tim runs one, it is dry-run on the test database inside a transaction that is rolled back (`bash scripts/dry-run-on-test.sh FILE.sql [TEST.sql]`), so nothing is kept.
- After any migration that changes the rules on a personal table, `npm run test:rules` is run on the test database.

## Ticking one off

When you know a migration has run on a database, mark it in that database's SQL editor:

```sql
update public.migration_log
   set status = 'ran', checked_at = now()
 where name = '007_create_personal_operating_plan';
```

To see the list:

```sql
select number, name, status, run_at, checked_at, warning
  from public.migration_log order by number nulls last, name;
```

**A shortcut for 001 to 020:** once `supabase/024_baseline_test.sql` says ALL CHECKS PASSED on a database, everything 001 to 020 make is there in its final form, so those can be ticked together. Leave out 012 (never run) and 003 (see its warning), and tick only after the test has passed:

```sql
update public.migration_log
   set status = 'ran', checked_at = now(), note = coalesce(note, '') || ' Ticked from the 024 baseline check.'
 where number between 1 and 20 and number not in (3, 12) and status = 'not checked';
```

## The list

| No. | File | What it does | Test | Live | Notes |
|---|---|---|---|---|---|
| 001 | `001_create_tables` | Decisions, reflections and strategic_alignments tables, with their rules | ☐ | ☐ | |
| 002 | `002_create_journal_entries` | Reviews table (journal_entries) | ☐ | ☐ | |
| 003 | `003_add_daily_plan_to_decisions` | Adds daily_plan to the tool types | ☐ | ☐ | **Dangerous to run again**: it would narrow the tool types and undo 005 and 011, so If-Then, meeting and Stop Doing saves would be refused |
| 004 | `004_remove_unique_review_constraint` | More than one review of a type per day | ☐ | ☐ | |
| 005 | `005_add_if_then_and_plan_tool_types` | Adds if_then_planning, daily_plan, plan_meeting | ☐ | ☐ | |
| 006 | `006_add_user_settings` | Settings columns on profiles | ☐ | ☐ | |
| 007 | `007_create_personal_operating_plan` | missions, strategies, tactics, mission_progress_reviews | ☐ | ☐ | |
| 008 | `008_add_weekly_momentum_review_type` | Adds weekly-momentum review type | ☐ | ☐ | |
| 009 | `009_add_archive_to_missions` | missions.archived_at | ☐ | ☐ | |
| 010 | `010_add_names_to_profiles` | First and last name on profiles | ☐ | ☐ | |
| 011 | `011_add_stop_doing_audit_tool_type` | Adds stop_doing_audit tool type | ☐ | ☐ | |
| 012 | `012_add_breathing_preference` | profiles.breathing_preference | ✗ | ✗ | **Never run, and must not be**: the app keeps the choice in breathing_settings (see 017) |
| 013 | `013_add_plan_review_type` | Adds plan-review review type | ☐ | ☐ | |
| 014 | `014_add_mission_versions` | POP version history | ☐ | ☐ | |
| 015 | `015_create_daily_journals` | Daily Journal | ☐ | ☐ | |
| 016 | `016_add_journal_entries_status` | Draft or final reviews | ☐ | ☐ | |
| 017 | `017_breathing_sessions_rls` | Rules on breathing_sessions | ☐ | ☐ | Live has the same rules under slightly different names |
| 018 | `018_alignment_sessions` | Health Check sessions and checked functions | ☐ | ☐ | |
| 019 | `019_alignment_emails` | Health Check emails | ☐ | ☐ | |
| 020 | `020_wheel_of_life` | Wheel of Life tables | ☐ | ☐ | |
| 021 | `021_restore_terms_accepted_from_signup` | Data only: puts back "terms accepted" | ☐ | ☐ | Live: only at go-live |
| 022 | `022_alignment_open_returns_organisation` | Health Check page gets the organisation name | ☐ | ☐ | Live: only at go-live. On test, its change is there (checked 26 Oct) |
| 023 | `023_mission_progress_reviews_update` | POP review drafts save over themselves | ☐ | ☐ | Live: at go-live or earlier. On test, its rule is there (checked 26 Oct) |
| 024 | `024_baseline_live_structure` | The live structure in one file | ☐ | ☐ | Then run `supabase/024_baseline_test.sql` |
| 025 | `025_migration_log` | This list | ☐ | ☐ | Records itself |
| – | `add_personal_goal_to_profiles` | profiles.personal_goal | ☐ | ☐ | No number |
| – | `add_show_mission_in_header_to_profiles` | profiles.show_mission_in_header | ☐ | ☐ | No number |

`supabase/schema.sql` is not a migration and is never run.
