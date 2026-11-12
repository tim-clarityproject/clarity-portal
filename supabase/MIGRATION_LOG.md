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
| 034 | `034_alignment_coach_name` | Health Check: the coach's first name on each link, returned to the outside page ("You and Tim") | ☑ | ☐ | Test: `supabase/alignment_coach_name_test.sql` (034 CHECKS PASSED in a rolled-back dry run, 28 Oct). Live: on release day, after 022. Test: run by Tim, 29 Oct 2026, 17:30 (migration log: ran) |
| 035 | `035_guest_links` | Phase 1 step 5: guest links (any tool without an account): guests by email, coaches' links with hashed token and code, email confirmation codes, guest ownership of GROW, Give difficult feedback, Prepare for a difficult conversation and the Performance Plan's rows, claiming into an account, Send to client, keeping for 2 years | ☐ | ☐ | Test: `supabase/035_guest_links_test.sql` (ALL CHECKS PASSED in a rolled-back dry run, 28 Oct). Changes `decisions` (user_id may be empty for a guest's row; a new tool type). Live: at go-live |
| 036 | `036_alignment_coach_only` | Health Check: only the coach who sent the link sees the answers. The coach's account on each link (coach_user_id), a signed-in read for that coach (the owner only for older links), the email server's own way to learn who gets which email (service role only), the table closed to the server's key too; new check-ins, frozen weeks and sprint summaries record methods version 1.4 (saved rows keep 1.1) | ☑ | ☐ | Test: `supabase/036_alignment_coach_only_test.sql` (036 CHECKS PASSED in a rolled-back dry run, with 036 run twice, 29 Oct). Needs SUPABASE_SERVICE_ROLE_KEY in Vercel for the email function. Live: on release day, after 034. Test: run by Tim, 29 Oct 2026, 17:30, after 034: 036 CHECKS PASSED, baseline ALL CHECKS PASSED (381 parts), migration log: ran |
| 037 | `037_alignment_choose_coach` | Health Check: Tim chooses the coach a link is for (`'Tim'` or `'Adie'`, or their email) when he makes it in the SQL editor; it must be an active coach in `public.coaches` (an account's email where the list isn't there yet), and only the owner may choose another coach. Replaces `_alignment_coach_id` only | ☑ | ☐ | Test: `supabase/037_alignment_choose_coach_test.sql` (037 CHECKS PASSED in a rolled-back dry run, with 037 run twice, after 034 and 036, 29 Oct). Live: on release day, after 036. Then, after Tim's yes, `supabase/manual/alignment_links_set_coach.sql` records Adie on her older links, named by her portal email (by first name once the coaches list, 026, is there); it needs 036 and 037 only. Test: run by Tim, 3 Nov 2026, after 036: Success; migration log: ran |
| 038 | `038_sprint_reviews_and_tool_work` | Phase 3 (Tim, 29 Oct): `sprint_reviews` (the end-of-sprint review's two written answers, up to 4000 characters each, what comes next and when it finished; one per sprint) and `tool_work_strategies` (a decision's or a journal entry's work tagged to a Strategy, with its sprint and week; once per item and Strategy). Own rows only; every linked row must be the same person's. Also (Tim, 30 Oct) the weekly stress answer is private: `weekly_debriefs` becomes own rows only (028's "Read: own, or shared" replaced by "Own rows: read"), and the person's current coach reads a shared debrief through `coach_shared_debrief(person, sprint, week)`, which never returns stress. No data moves; the tables are additive | ☑ | ☐ | Test: `supabase/038_sprint_reviews_and_tool_work_test.sql` (038 CHECKS PASSED in a rolled-back dry run, with 038 run twice, after 035 and 037, then the baseline test, 30 Oct; checks 4a to 4t are the stress ones). `supabase/028_sprints_and_daily_work_test.sql` still passes after it. Then `npm run test:rules -- --as-is`. Live: at go-live, after this branch's code is live (safe earlier: nothing old reads it). Until it runs, the app keeps the answers and tags on the device. Test: run by Tim, 3 Nov 2026, after 037: Success, baseline ALL CHECKS PASSED; migration log: ran |
| 039 | `039_day_habits_and_wind_down` | Phase 4 step 7: `day_plan_habits` (the habits chosen in Plan my day, with the order of the day's choices and the highest priority; one row per person and day; three habits at most, only the person's own sprint habits) and `wind_down_nights` (Sleep wind down's thoughts, each up to 300 characters, when it was finished and the sound, 'off' until chosen; one row per person and night). Own rows only, never shared with a coach. Also: each `day_reviews.tomorrow` item up to 300 characters (added NOT VALID, then checked over saved rows when they all fit, so an older row never stops it), and `todos.source` widened with `sleep_wind_down`. The orb choice needs nothing: it lives in `person_settings.page_preferences.orb_style` (026) | ☑ | ☐ | Test: `supabase/039_day_habits_and_wind_down_test.sql` (039 CHECKS PASSED in rolled-back dry runs: 039 alone, and after 035, 037 and 038 with 039 run twice, then the 038 test and the baseline test, ALL CHECKS PASSED, 381 parts, 3 Nov). Doesn't need 038 first. Then `npm run test:rules -- --as-is`. Live: at go-live, after this branch's code is live (safe earlier: nothing old reads it). Until it runs, the app keeps the habits and thoughts on the device, with no error, and moves them across once. Test: run by Tim, 3 Nov 2026, after 038: Success, baseline ALL CHECKS PASSED; migration log: ran; then `npm run test:rules -- --as-is` ALL RULES CHECKS PASSED (19,305 checks, the four new tables included) |
| 040 | `040_checkin_extras_and_review_way` | Phase 5 follow-up (Tim, 5 Nov): three answers once kept on the device only now kept with their rows: `checkins.drinks` (each drink counted for "On average, what do you drink in a week?", up to 99 of each; "other" is units, up to 999; checked by `checkin_drinks_ok`), `checkins.trip` ('no', 'short' or 'long', the "Did you travel this month?" choice) and `day_reviews.way_of_being` (the way of being chosen in Review my day when the day had no plan, up to 120 characters). New columns only, empty to start; no rule changes, so they follow their rows' rules (own rows; a coach reads a check-in only while its sharing switch is on; a day review is own only). 029's answer check and the scores are untouched | ☑ | ☐ | Test: `supabase/040_checkin_extras_and_review_way_test.sql`. Doesn't need 038 or 039 first. Then `npm run test:rules -- --as-is`. Live: at go-live, after this branch's code is live (safe earlier: nothing old reads the columns). Until it runs, the app keeps these answers on the device, with no error, and moves them across once the columns are there. Test: Run by Tim, 9 Nov 2026 (migration log: ran, 9 Nov 2026, 14:10 UTC) |
| 041 | `041_confidence_bank_labels` | Phase 5 finish and both Phase 5 answers runs (Tim, 10 and 11 Nov; added to twice before it was ever run): nineteen stored labels change their words. (1 to 3) "Performance Evidence" becomes "Confidence Bank": the 'evidence' part's label in `sharing_parts()`, where claim C10 shows, and the tool's name. (4) The 'checkin' part's label in `sharing_parts()` becomes "Monthly review, including the First review". (5 to 7) Three tool names in `evidence_tools`: "Daily plan", "Daily review", "Monthly Hardware and Software review". (8 to 19) Where twelve claims show in `evidence_claims` (C3, C6, C11, C15, C20, C21, C22, C23, C24, C30, C47, C49): "Plan my day" becomes "Daily plan", "Review my day" "Daily review", "First check-in" "First review" and "Check-in" "Monthly review". Words only: every key, table, saved row and rule stays as it is, and nothing a person wrote is touched | ☑ Run by Tim, 12 Nov 2026 | ☐ | Test: `supabase/041_confidence_bank_labels_test.sql` (reads only). Needs 026, 031 and 033; skips what isn't there. Dry-run on the test project, run twice over then its test, passed on 11 Nov 2026, evening (rolled back); the test alone, without the migration, fails as it should. The test project has no C49 (seeded before it was added), so 18 of the 19 change there. Run on the test project by Tim on 12 Nov 2026, 22:32, with its test; `024_baseline_test` passed afterwards (ALL CHECKS PASSED, 381 parts). Live: at go-live, after 033 |
| – | `add_personal_goal_to_profiles` | profiles.personal_goal | ☐ | ☐ | No number |
| – | `add_show_mission_in_header_to_profiles` | profiles.show_mission_in_header | ☐ | ☐ | No number |

`supabase/schema.sql` is not a migration and is never run.
