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
| 001 | `001_create_tables` | Decisions, reflections and strategic_alignments tables, with their rules | ☑ | ☐ | Test: run or confirmed by Tim, 27 Oct 2026 |
| 002 | `002_create_journal_entries` | Reviews table (journal_entries) | ☑ | ☐ | Test: run or confirmed by Tim, 27 Oct 2026 |
| 003 | `003_add_daily_plan_to_decisions` | Adds daily_plan to the tool types | ☐ | ☐ | **Dangerous to run again**: it would narrow the tool types and undo 005 and 011, so If-Then, meeting and Stop Doing saves would be refused |
| 004 | `004_remove_unique_review_constraint` | More than one review of a type per day | ☑ | ☐ | Test: run or confirmed by Tim, 27 Oct 2026 |
| 005 | `005_add_if_then_and_plan_tool_types` | Adds if_then_planning, daily_plan, plan_meeting | ☑ | ☐ | Test: run or confirmed by Tim, 27 Oct 2026 |
| 006 | `006_add_user_settings` | Settings columns on profiles | ☑ | ☐ | Test: run or confirmed by Tim, 27 Oct 2026 |
| 007 | `007_create_personal_operating_plan` | missions, strategies, tactics, mission_progress_reviews | ☑ | ☐ | Test: run or confirmed by Tim, 27 Oct 2026 |
| 008 | `008_add_weekly_momentum_review_type` | Adds weekly-momentum review type | ☑ | ☐ | Test: run or confirmed by Tim, 27 Oct 2026 |
| 009 | `009_add_archive_to_missions` | missions.archived_at | ☑ | ☐ | Test: run or confirmed by Tim, 27 Oct 2026 |
| 010 | `010_add_names_to_profiles` | First and last name on profiles | ☑ | ☐ | Test: run or confirmed by Tim, 27 Oct 2026 |
| 011 | `011_add_stop_doing_audit_tool_type` | Adds stop_doing_audit tool type | ☑ | ☐ | Test: run or confirmed by Tim, 27 Oct 2026 |
| 012 | `012_add_breathing_preference` | profiles.breathing_preference | ✗ | ✗ | **Never run, and must not be**: the app keeps the choice in breathing_settings (see 017) |
| 013 | `013_add_plan_review_type` | Adds plan-review review type | ☑ | ☐ | Test: run or confirmed by Tim, 27 Oct 2026 |
| 014 | `014_add_mission_versions` | POP version history | ☑ | ☐ | Test: run or confirmed by Tim, 27 Oct 2026 |
| 015 | `015_create_daily_journals` | Daily Journal | ☑ | ☐ | Test: run or confirmed by Tim, 27 Oct 2026 |
| 016 | `016_add_journal_entries_status` | Draft or final reviews | ☑ | ☐ | Test: run or confirmed by Tim, 27 Oct 2026 |
| 017 | `017_breathing_sessions_rls` | Rules on breathing_sessions | ☑ | ☐ | Live has the same rules under slightly different names. Test: run or confirmed by Tim, 27 Oct 2026 |
| 018 | `018_alignment_sessions` | Health Check sessions and checked functions | ☑ | ☐ | Test: run or confirmed by Tim, 27 Oct 2026 |
| 019 | `019_alignment_emails` | Health Check emails | ☑ | ☐ | Test: run or confirmed by Tim, 27 Oct 2026 |
| 020 | `020_wheel_of_life` | Wheel of Life tables | ☑ | ☐ | Test: run or confirmed by Tim, 27 Oct 2026 |
| 021 | `021_restore_terms_accepted_from_signup` | Data only: puts back "terms accepted" | ☐ | ☐ | Live: only at go-live |
| 022 | `022_alignment_open_returns_organisation` | Health Check page gets the organisation name | ☑ | ☐ | Live: only at go-live. On test, its change is there (checked 26 Oct). Test: run or confirmed by Tim, 27 Oct 2026 |
| 023 | `023_mission_progress_reviews_update` | POP review drafts save over themselves | ☑ | ☐ | Live: at go-live or earlier. On test, its rule is there (checked 26 Oct). Test: run or confirmed by Tim, 27 Oct 2026 |
| 024 | `024_baseline_live_structure` | The live structure in one file | ☑ | ☐ | Then run `supabase/024_baseline_test.sql`. Test: run or confirmed by Tim, 27 Oct 2026 |
| 025 | `025_migration_log` | This list | ☑ | ☐ | Records itself. Test: run or confirmed by Tim, 27 Oct 2026 |
| 026 | `026_people_coaches_organisations` | Phase 1: people, coaches, organisations, teams, seats, sharing switches and the checked helper `may_see` | ☑ | ☐ | Test: `supabase/026_people_coaches_organisations_test.sql` (ALL CHECKS PASSED). Live: at go-live. Test: run or confirmed by Tim, 27 Oct 2026 |
| 027 | `027_performance_plan` | Phase 1: the Individual Performance Plan (mission, objectives, Strategies, habits, versions, sponsor proposals) | ☑ | ☐ | Test: `supabase/027_performance_plan_test.sql`. Live: at go-live. Test: run or confirmed by Tim, 27 Oct 2026 |
| 028 | `028_sprints_and_daily_work` | Phase 1: sprints, Recovery, logs, to-dos and their moves, wins, evidence, Plan and Review my day, debriefs, week scores | ☑ | ☐ | Test: `supabase/028_sprints_and_daily_work_test.sql`. Live: at go-live. Test: run or confirmed by Tim, 27 Oct 2026 |
| 029 | `029_checkins_goal_checks_patterns` | Phase 1: Hardware and Software check-ins with their scores and coach flags, goal checks, pattern cards | ☑ | ☐ | Test: `supabase/029_checkins_goal_checks_patterns_test.sql`. Live: at go-live. Test: run or confirmed by Tim, 27 Oct 2026 |
| 030 | `030_organisations_feedback_pulse` | Phase 1: frozen summaries and what sponsors and leaders read, organisation measures, feedback links (hashed, locked), team pulse, impact | ☑ | ☐ | Test: `supabase/030_organisations_feedback_pulse_test.sql`. Live: at go-live. Test: run or confirmed by Tim, 27 Oct 2026 |
| 031 | `031_evidence_library` | Phase 1: the evidence library, seeded from the claims register 1.1 | ☑ | ☐ | Test: `supabase/031_evidence_library_test.sql`. Made by `scripts/make-evidence-seed.mjs`. Live: at go-live. Test: run or confirmed by Tim, 27 Oct 2026 |
| 032 | `032_scores_in_database` | Phase 1: database copies of the scores (M5, M6, M9, M18, M19 and what they rest on), freeze_week, make_sprint_summary, org_figures, pulse_results, impact_results | ☑ | ☐ | Test: `supabase/032_scores_in_database_test.sql` (written from `tests/scores/cases.mjs`). Live: at go-live. Test: run or confirmed by Tim, 27 Oct 2026 |
| 033 | `033_pulse_wellbeing_seat_standard` | Phase 1 step 4: pulse results only once closed with 3 or more answers, the 7-day link and Calm; wellbeing shared per organisation (the old switch moved over); the fixed 85% standard for organisation seats | ☐ | ☐ | Test: `supabase/033_pulse_wellbeing_seat_standard_test.sql` (ALL CHECKS PASSED). Then `npm run test:rules -- --as-is`. Live: at go-live |
| – | `add_personal_goal_to_profiles` | profiles.personal_goal | ☐ | ☐ | No number |
| – | `add_show_mission_in_header_to_profiles` | profiles.show_mission_in_header | ☐ | ☐ | No number |

`supabase/schema.sql` is not a migration and is never run.
