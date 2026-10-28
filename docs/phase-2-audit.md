# Phase 2 audit (step 0, read only)

Written 28 Oct 2026 on branch `feature/performance-overhaul` (head 8b3a975; `main` is at 6362112, unchanged). Nothing in the repo or any database was changed.

## Files read

- Brief: `~/Downloads/clarity-phase-2/phase-2-plan-and-sprint.md` (10,574 bytes, COPY FROM HERE to END COPY).
- Mock-ups, every frame function, every review note (`NOTES`, `COMMON`, `TOASTS`):
  - `m1-performance-system.html` (143,321): `R.ipp`, `R.sprint`, `R.year` (not `R.debrief`), `mpanel`, `sysPanel`, `stratDetail`, `sheetPanel`, `hrow`, `daysYN`, `winRow`, `dial`, `dialLegend`, `mScore`/`sScore`/`wScore`, `mDef`/`weekLine`, `act`.
  - `m6-setup-flows.html` (124,812): `planSteps`, `missionStep`, `objCard`, `stratStep`, `lenBody`, `startBody`, `stdBody`, `row`, `dial`, `dial2`, `F.sprint`, `F.end`, `cal`, `foot`, `NOTES.plan/sprint/end` (not `signupSteps`/`intakeSteps`).
  - `m15-recovery.html` (177,951): `page()` screens `start`, `home`, `dash`, `sprint`, `end`, `back`, `coach`; `dstep`, `rdial`, `tick`, `whoB`, `visSheet`, `NOTES`, `TOASTS`.
- `individual-performance-system-one-pager.md` (3,356).
- `START-HERE.md` sections 5, 5a, 5b, 5d, 6 (rule 40), 9, 11.
- `portal-overhaul-decisions.md`: Recovery (26 Oct, lines 213 to 229), M1 feedback and rewrite (801 to 833), M6 approval (834 to 851), below-standard grey (853), Strategies are guided (866), Sign-up and Build your plan (1058), Three ways to track (1068), Phase 0b note "The dial and bar chart are built in Phase 2" (1088), IPP system pop-up to End-of-sprint review (1213 to 1398).
- `portal-overhaul-decisions-part-2.md`: headings, the M7b rules pass (% bar replaces step list, 239), seat standard (621), methods 1.2 notes (519 to 521).
- `~/Downloads/clarity-phase-1/phase-1-data-model-spec.md` sections 2, 3, 5, 13, 14 (for what the tables were meant to hold).
- Repo: `CLAUDE.md`; `docs/scoring-methods.md` (M0 to M12, M15); `src/lib/scores/*.js` (exports); `supabase/migrations/026` to `033`; `src/components/design/*` and `src/components/design/index.js`; `src/pages/designReference/DesignReference.jsx`, `useSprintDemo.jsx`; `src/lib/pageCache.js`, `drafts.js`, `syncQueue.js`; `src/App.jsx`; `src/components/DesignHeader.jsx`; `src/components/coach/CoachChat.jsx`; `supabase/MIGRATION_LOG.md`.

Key facts that shape everything below:
- No app code reads or writes any Phase 1 table yet (`grep` for `performance_plans`, `sprints`, `habit_logs`, `recovery_periods`, `sharing_switches` in `src/` finds nothing). Phase 2 builds the whole data layer.
- `saveOrQueue` (`src/lib/syncQueue.js`) handles `upsert`, `update` and `delete` on a table only. It cannot queue an RPC (`freeze_week`, `make_sprint_summary`, `my_fixed_standard`, `my_coach`).
- `week_scores` is written only by `public.freeze_week(sprint, week)`; there is no nightly job yet. Unless the app calls it, the coach (who reads `week_scores`, not the raw logs) sees nothing.
- `CoachContext` is fed from the static `src/content/coach` (Tim), not from `public.my_coach()`. Recovery's "Let [coach] know" needs the real coach, or none.
- `METHODS_VERSION` in `src/lib/scores/index.js` is `'1.1'` and `freeze_week` writes `'1.1'`, while `docs/scoring-methods.md` says version 1.3.

Legend for the tables: ✓ exists in `src/components/design`; **MISSING** not there; *partial* exists but lacks what the mock-up shows. Tables are `public.*` from 026 to 033. "Scores" are exports of `src/lib/scores/` unless marked DB (a database function from 032 or 033).

---

## 1. Every screen and state Phase 2 builds

### Step 1. The Individual Performance Plan (M1)

| # | Screen or state | Where in the mock-up | Reads | Writes | Scores | Shared components |
|---|---|---|---|---|---|---|
| 1.1 | Plan page, normal | M1 `R.ipp` (Page "Individual Performance Plan"): back link "Plan", `heading('Individual Performance Plan','Version 3.2 · changed Fri 2 Oct')`, `.mission`, `.align`, Outcome Objectives `.objs` (`oval`, `otarget`, `opct`, `oKind`), Strategies `.tiles`, `acts` (Edit my plan, See version history) | `performance_plans` (mission, major, minor), `plan_versions` (latest `created_at` for "changed"), `outcome_objectives`, `objective_figures` (latest figure), `plan_strategies`, `strategy_objectives`, `habits`; for tile scores the running week: `sprints`, `sprint_habits`, `sprint_habit_settings`, `habit_logs`, `todos`, `todo_moves`, `wins`, `win_strategies`, `recovery_periods`, `working_patterns`, `person_settings` (time_zone); eyes: `sharing_switches` (mission, progress), DB `my_coach()` | `sharing_switches` (tapped eye) | `m9Objective` (progress, reached, status), `m9FigureOn`, `m9TimeLeft`; tiles: `m0SprintCalendar`, `m0WeekOfDay`, `m0WorkingDaysOfWeek`, `m5WeekFromRaw` with `soFarUntil` (its `strategies[].score`), `m7WeekColour`; alignment check: **MISSING** (a structural check, not in the methods) | `PageHeader` ✓ (meta + `onSystemLink`), `Chevron` ✓ (back), `Section` ✓, `WhoSees` / `CoachSees` ✓, `Tile` *partial* (serves numbers have no pop-up), `Bar` ✓, `StatusAction` ✓, `Button` ✓; **MISSING**: ObjectiveCard, AlignmentCheck, ObjectiveNumber pop-up |
| 1.2 | Alignment gap | M1 chrome "Example: alignment gap" (`st.gap`): `.align .bad` "Annual revenue has no Strategy working on it", `.ob.gap` "No Strategy working on this yet", tile `.tflag` "Serves no objective yet" | as 1.1 | none | alignment check **MISSING** | `Tile` `flag` ✓; ObjectiveCard flagged state **MISSING** |
| 1.3 | Objective kinds | `R.ipp` cards: number (Obj 1, Obj 3 with £ and k), rating (Obj 2 "target 9/10"), milestone (Obj 4 "Not yet"/"Done", `milBox` Mark as done, toast "Done. Publish my coaching book." with Undo) | `outcome_objectives`, `objective_figures` | `outcome_objectives.reached_on` (milestone) | `m9Objective`, `m9TimeLeft` | `StatusAction` ✓, `Bar` ✓, toast with Undo ✓ (`useToast().saved({onUndo})`) |
| 1.4 | Strategy detail, desktop | `stratDetail(si,'d')`: inline `.detail` below the tiles with the 45° close; "Habits" (each with `mDef` lines), "To-dos this sprint", "Work this sprint", "Edit this Strategy" | `plan_strategies`, `strategy_objectives`, `habits` (and the running `sprint_habit_settings`), `todos` (this sprint, open) | none | none (labels from the habit's settings) | `IconButton` ✓, `Section` ✓; **MISSING**: StrategyDetail. "Work this sprint" has no table (see section 4) |
| 1.5 | Strategy detail, phone | `sheetPanel` with `st.add=='strat'`: full sheet, back "Plan", title, `serves()` line, same body, "Edit this Strategy" | as 1.4 | none | none | `SlidePanel` ✓ (full screen on phone) |
| 1.6 | My Mission pill panel | `mpanel()` (`.mp`, opened by `MIS()`): "My Mission" + eye "You and Tim", mission, objectives strip `.mpo` ("31 of 40", "Not yet, by 30 Jun 2027"), "Performance score this week 82%", `sysLink`, "Open my plan" | `performance_plans`, `outcome_objectives`, `objective_figures`, `sharing_switches`, `my_coach()`, the week inputs as 1.1 | `sharing_switches` (eye) | `m9Objective`, `m5WeekFromRaw` (so far) | **MISSING**: MissionPanel. Today's pill is `src/components/DesignHeader.jsx`, fed by the old `MissionContext` (`missions` table) |
| 1.7 | The Individual Performance System pop-up | `sysPanel()`; wording from the one-pager (wins, word for word) | none (no personal detail) | none | none | `Popup` ✓ (full screen on phone); **MISSING**: the real content. The gallery's `SystemPopup` in `DesignReference.jsx` is a stand-in with different words and a Choice |
| 1.8 | Version history | Only a toast in M1 (`TOASTS.hist` "Opens version history."). **Not mocked** | `plan_versions` (major, minor, kind, change_note, snapshot, created_at) | none | none | `List`/`ListRow` ✓ (list row guidelines), `PageHeader` ✓ |
| 1.9 | No plan yet | **Not mocked** | `performance_plans` (none active) | none | none | `EmptyState` ✓ (question, then "Build my plan") |
| 1.10 | In Recovery | **Not mocked** (M15 rule: scores and standards hidden) | `recovery_periods` (open) | none | none | RecoveryNotice **MISSING** (see 7.9) |

### Step 2. Build your plan and editing (M6 "Build your plan")

All steps run in `GuidedTool` ✓ (full screen, Saving and Saved, Close, Back, Skip). M6 `F.plan` finish label "Start Performance Sprint 1", skip label "Skip".

| # | Screen or state | Where in the mock-up | Reads | Writes | Scores | Shared components |
|---|---|---|---|---|---|---|
| 2.1 | Mission (only when empty or skipped) | `missionStep(0)`: "What's your mission?", 2 nudges, See an example (`EXM.mission` by role), eye "You and Tim", 120 limit with "n of 120", "Not sure? Answer 3 questions" opens 3 boxes and "Draft my mission" (`act('draft')`), Next "Save my mission" | `performance_plans.mission`, `person_settings.describes_you` (role), old `missions` (to prefill; Claude's call) | `performance_plans` (insert the active plan; `mission`) | none | `TextBox` ✓ (`maxLength` count), `WhoSees` ✓, `Button` ✓, GuidedTool `example` by role ✓ |
| 2.2 | Outcome Objectives | Step "Objectives": tip "Everything saves as you go." with close, eye "Only you", `objCard` per objective (What result will you track?, remove, How will you track it? Number/Milestone/Rating /10, two-line hint per kind, Where are you now?, What's your target?, By when? or Done by when? opening the calendar), "Add an objective" up to 4 | `outcome_objectives` | `outcome_objectives` (name, kind, unit, direction, start_value, start_set_on, target_value, by_when, due_on, sort_order) | none | `SegmentedControl`/`Choice` ✓, `NumberField` ✓, `DatePicker`/`CalendarPopover` ✓, `IconButton` ✓, `AddButton` ✓, GuidedTool `tip` ✓; **MISSING**: ObjectiveEditor |
| 2.3 | Strategies, one screen per named objective | `stratStep(oi,k)`: "How will you move “X”?", nudge, help panel on the first ("A Strategy is a medium to long-term approach…" then "For example: …"), numbered rows with remove, "Add a Strategy", "Do any of your other Strategies help this too?" picks, "Need ideas? Pick one, then make it yours." (3 per role). Fallback step "What approaches will you use to achieve your objectives?" when no objective has a name | `plan_strategies`, `strategy_objectives` | `plan_strategies`, `strategy_objectives` | none | `HelpPanel` ✓, `TextField` ✓, `IconButton` ✓, `AddButton` ✓; pick rows (crosshair then words): use `AddButton` (rule 29), see 2 below |
| 2.4 | Habits | Step "Habits": "Which Strategy?" drop-down, `hcard` per habit (What will you do?, How will you measure it? drop-down of the 7 in `MT`, What's the target? with its suffix, How much impact? Low/Medium/High), "Add a habit" | `habits`, `plan_strategies` | `habits` (measure, unit, target, target_per, limit_value, limit_per, direction, top_number, impact, sort_order) | `MEASURES`, `m1TopNumber` | `Dropdown` ✓ (options with `hint`), `NumberField` ✓ (unit inside), `SegmentedControl` ✓; **MISSING**: HabitEditor |
| 2.5 | Sprint length | `lenBody(G,'g')`: 4, 6, 8, 12 (suggested), 16, plus the "Just started a new role?" tile (13 weeks) | none | kept in the draft until Ready | none | `Choice` ✓ (note "suggested"); template toggle tile *partial* (`Tile` has no pressed state) |
| 2.6 | Start day | `startBody`: Today, Mon 26 Oct (suggested), Another day (calendar "When does it start?") | none | draft | none | `Choice` ✓, `DatePicker` ✓, `todayKey`/`nextMondayKey` ✓ |
| 2.7 | Performance standard | `stdBody`: 75, 80, 85, 90, Other ("What percentage?" 50 to 100, "Any figure from 50 to 100."), "85% is suggested.", panel with the definition and example | DB `my_fixed_standard()` (033) | draft | `STANDARD_CHOICES`, `DEFAULT_STANDARD`, `m7MayChooseStandard`, `m7IsValidStandard`, `m7StandardFor` | `Choice` ✓, `NumberField` ✓, `HelpPanel` ✓ |
| 2.8 | Ready | Step "Ready": title "Your plan and first sprint", 2 nudges, set-up dial (`dial(n,null,['Weeks',n])`), eye, summary rows with Change (`row()`), `.align2` check | all of the above | finish: `performance_plans` (major 1, minor 0), `plan_versions` (kind `start`, snapshot), `sprints` (number 1, start_on, length_weeks, standard, label null), `sprint_habits`, `sprint_habit_settings` (from_week 1); toast "Saved. Performance Sprint 1 starts Mon 26 Oct." | alignment check **MISSING** | `GuidedSummary` ✓; **MISSING**: SprintDial (set-up state), AlignmentCheck |
| 2.9 | Saving, Saved, Close | `.fbar` with `saveInd()`; Close toast "Saved. Carry on from Home whenever you like." | none | every change as it is made (see risk R1) | none | `SaveStatus`, `WillSyncIndicator` ✓, `useDraft` ✓ |
| 2.10 | Editing the plan afterwards | Brief: "uses the same steps". Not separately mocked | as 2.2 to 2.4 | the same tables, then `plan_versions` (kind `major` or `minor`, snapshot) and `performance_plans.major`/`minor` | version rule **MISSING** as code (it is a decision, not a score: see 4) | GuidedTool ✓ |
| 2.11 | Working days | **Not in M6.** Decisions 26 Oct, 14:38: "M6 set-up gets the question" | `working_patterns` | `working_patterns` (starts_on, days) | `DEFAULT_WORKING_DAYS` | `MultiChoice` ✓ |

### Step 3. Start a sprint (M6 "Start a sprint", `F.sprint`)

| # | Screen or state | Where | Reads | Writes | Scores | Shared components |
|---|---|---|---|---|---|---|
| 3.1 | Length and label | step "Length", label "Performance Sprint 5": `lenBody(S,'s')` plus "What would you like to call it?" (placeholder by role, `LBL`), "Optional." | `sprints` (next number) | draft | none | `Choice` ✓, `TextField` ✓ |
| 3.2 | Start day | step "Start" (`startBody`) | none | draft | none | as 2.6 |
| 3.3 | Standard | step "Standard": "What's your performance standard this time?" | `my_fixed_standard()` | draft | as 2.7 | as 2.7 |
| 3.4 | Clear space (optional) | step "Clear space", label "Optional": Time audit and Delegation audit offers, each "10 min" | none | none | none | `Tile` ✓. Neither tool exists in the repo (see 3) |
| 3.5 | Habits | step "Habits", label "From Performance Sprint 4": `CARRY` rows with Keep/Change/Remove, "Add a habit" | `habits` (the plan's), the last sprint's `sprint_habit_settings` for the lines | draft | none | **MISSING**: KeepChangeRow; HabitEditor for Change and Add |
| 3.6 | Ready | step "Ready", title "Performance Sprint 5": set-up dial, rows Length, Label, Starts, Performance standard, Habits; finish "Start Performance Sprint 5", toast "Saved. Performance Sprint 5 starts Mon 26 Oct." | all above | `sprints` (insert; the previous one must be `finished` first, see R4), `sprint_habits` (copied from `habits`, `habit_id` set), `sprint_habit_settings` (from_week 1) | none | `GuidedSummary` ✓; SprintDial set-up **MISSING** |

### Step 4. The Performance Sprint page (M1 `R.sprint`)

| # | Screen or state | Where | Reads | Writes | Scores | Shared components |
|---|---|---|---|---|---|---|
| 4.1 | Header | `heading('Performance Sprint 4','Week 4 of 8 · Mon 28 Sep to Sun 22 Nov')`, back "Plan", system link | `sprints`, `recovery_periods` | none | `m0SprintCalendar`, `m0WeekOfDay` | `PageHeader` ✓ |
| 4.2 | Hero: dial, score, range, standard | `.hero`: `dial()` (one segment per week, crosshair at the top, day ticks, today dot, this week filling by day, week numbers desktop only), centre "Performance score this week" + live score, `dialLegend()`, `.usual` "Your usual range is 72 to 84%." / "Your standard is 85%.", `.std` "Standard reached this week", Log today (coral) + See to-dos | `sprints`, `sprint_habits`, `sprint_habit_settings`, `habit_logs`, `todos`, `todo_moves`, `wins`, `win_strategies`, `recovery_periods`, `working_patterns`, `weekly_debriefs` (unusual, status), `week_scores` (earlier sprints, for the range) | finished weeks: DB `freeze_week` | `m0SprintCalendar`, `m0WorkingDaysOfWeek`, `m5WeekFromRaw` (finished weeks, and this week with `soFarUntil`), `m0WeekIsFinal`, `m0WeekIsEligible`, `m8UsualRange` (`USUAL_RANGE_MIN_WEEKS`, `USUAL_RANGE_WEEKS`), `m7WeekColour`, `m0AtStandard`, `m0Round` | **MISSING**: SprintDial (the existing `Dial` has wedge gaps, no crosshair, no day ticks, no today dot, no part-filled week); `Stat` ✓ (`good`), `Button` ✓ |
| 4.3 | Sprint details fold | `.dtl` "Sprint details": Average performance score "79% · weeks 1 to 3", Sprint ends in "39 days", Length, Performance standard with "The weekly score that counts as a good week" | as 4.2 | none | `m6SprintFigures` (average, finishedWeeks), `m9TimeLeft` (ends in), `m0SprintCalendar` (`actualEnd`/`plannedEnd`) | `Collapsible` ✓ |
| 4.4 | Log today, day view | `sech('Log today')` with Today/This week, date line with Saving/Saved and eye "Only you", `hrow(k,m)` per measure: amount (number + unit, "8,400 of 10,000 steps today"), count (stepper to the top number, "1 of 4 this week"), yes or no each day under a limit ("Did you finish late today?" No/Yes), count under a limit (stepper), rating (1 to 5), once a week (tick, "Once this week"/"Done this week"); each row has the ">" button and a thin bar | `sprint_habits`, `sprint_habit_settings` (in force this week), `habit_logs` (this week) | `habit_logs` (upsert on `sprint_habit_id,local_date`; delete when cleared), through `saveOrQueue` | `m1HabitScore` (with `soFarUntil`), `m1TopNumber`, `m0WorkingDaysOfWeek` | `LoggingRow` *partial* (number and stepper only), `Stepper` ✓, `NumberField` ✓, `SegmentedControl` ✓, `Checkbox` ✓, `WhoSees` ✓, `SaveStatus` ✓; **MISSING**: LoggingRow kinds yes/no, rating, weekly tick, and the ">" button |
| 4.5 | Log this week, week view | `hrow` with `st.view=='week'`: seven day boxes (`.wkd`, later days disabled), `daysYN` Yes/No per day in words, weekly tick, `weekLine`, bar | as 4.4 | `habit_logs` for any day of this week so far | `m1HabitScore` | **MISSING**: LoggingWeekRow (day boxes and day Yes/No) |
| 4.6 | Habit panel | `sheetPanel` `st.add=='hab'`: Strategy, Target (`mDef`), This week (`weekLine`), the day boxes, "Edit this habit" ("Changes apply from next week." / "Past weeks keep what they had."), "How much does it move its Strategy?" Low/Medium/High, Done; toast "Impact set to Medium from next week." | `sprint_habit_settings`, `habit_logs` | `sprint_habit_settings` (new row, `from_week` = this week + 1) | `m1HabitScore` | `SlidePanel` ✓, `SegmentedControl` ✓; HabitEditor **MISSING** |
| 4.7 | To-dos this week | `sech('To-dos this week','Anything not done by Sunday rolls into next week.')`, eye, `tdsIn(CW)` rows: tick, Strategy line, "· rolled over from week 3", "· moved to week 5" (tick disabled), Move; win rows (`winRow`: mint tick, "· Unplanned win, Tue"); toast "Done. 3 of 4 this week." with Undo | `todos`, `todo_moves`, `wins`, `win_strategies`, `plan_strategies` | `todos.done_on` (local date) | `m2PlannedWeekAt`, `m2TodoScore`; the list itself (due this week, rolled over, moved out) **MISSING** as a helper (see 4) | `Checkbox` ✓, `useToast` ✓; **MISSING**: TodoRow (to-do, win and moved states) |
| 4.8 | Add a to-do panel | `sheetPanel` `'todo'`: What needs doing? (eye), Which Strategy does it serve?, How much will it move this Strategy?, Which week? (branded drop-down `ddSpec('wk')`), "Moving it before that week starts doesn't count against you.", Cancel, Add my to-do; toast "Added to this week." with Undo | `plan_strategies`, `sprints` | `todos` (text, strategy_id, impact, sprint_id, planned_week, created_on, source `manual`) | none | `SlidePanel` ✓, `TextBox` ✓, `Choice`/`Dropdown` ✓; **MISSING**: AddTodoPanel as a shared part (today only a gallery demo in `DesignReference.jsx`) |
| 4.9 | Add an unplanned win panel | `sheetPanel` `'win'`: two lines (counts as done, saved to your Performance Evidence), What did you do?, Which Strategies did it help? "Pick all that apply.", How much did it help?, Which day? (up to today), Add my win; toast "Win added to Grow through referrals." with Undo | `plan_strategies` | `wins` (what, local_date, impact), `win_strategies`; trigger `wins_to_evidence` writes `performance_evidence` | `m3WinItems` | `MultiChoice` ✓; **MISSING**: AddWinPanel as a shared part (gallery demo only) |
| 4.10 | Move this to-do | `sheetPanel` `'move'`: the to-do, "This week has started, so it won't count as done in week 4.", Which week should it move to? (later weeks); toast "Moved to week 6." with Undo | `todos` | `todos.planned_week`, `todos.move_on` (trigger `todos_record_move` writes `todo_moves`) | `m2TodoScore` rule | `SlidePanel` or `Sheet` ✓, `Choice` rows ✓ |
| 4.11 | Later in this sprint | `.fold` "Later in this sprint" with "3 to-dos planned for later weeks" or "Nothing planned for later weeks yet"; open: rows "· Week 5, Mon … to Sun …" with Move; empty "When you add a to-do for a later week, it shows here." | `todos` | as 4.7, 4.10 | none | `Collapsible` ✓ (summary line); TodoRow **MISSING** |
| 4.12 | Links at the foot | `acts`: Start my debrief, View your year, Open my plan | none | none | none | `Button` ✓ |
| 4.13 | Offline | brief: logging works offline | device queue | queued saves | none | `WillSyncIndicator` ✓, `ConnectionNotice` ✓, `useCachedLoad` ✓ |
| 4.14 | Lengths and units | M1 chrome: 5, 8, 12 weeks; Metric or US (water in litres or fl oz) | `person_settings.units` | none | none | unit conversion **MISSING** (no helper in `src/lib`) |
| 4.15 | No sprint, sprint not started yet, sprint over but not reviewed | **Not mocked** | `sprints` | none | `m0SprintCalendar` | `EmptyState` ✓ |

### Step 5. View your year (M1 `R.year`)

| # | Screen or state | Where | Reads | Writes | Scores | Shared components |
|---|---|---|---|---|---|---|
| 5.1 | The year chart | `R.year`: back "Performance Sprint", `heading('View your year','2026, week by week')`, 52 slim bars, "SPRINT n" brackets along the top, dashed "Standard 85%" labelled at its right end, hatched Recovery, week numbers every 4, months along the bottom, this week in the text colour, selected week outlined; `.ylg` legend | `sprints` (this year), `week_scores`, `recovery_periods`, `weekly_debriefs`, and this week live as 4.2 | `freeze_week` for any finished, unfrozen week | `m0SprintCalendar` per sprint, `m5WeekFromRaw` (this week so far), `m7WeekColour`; placing sprint weeks on the year's weeks **MISSING** (see 4) | **MISSING**: YearChart (`WeekChart` ✓ is one sprint's weeks); `ChartTips`/`tipProps` ✓ |
| 5.2 | Selected week | `.ysel`: Recovery ("A planned break between sprints, with nothing tracked."), still to come, "No sprint running", or "Week 41 · Performance Sprint 4, week 2" with "Debriefed"/"This week, so far", "Performance score 86%", and "Open this week" or "Open the week summary" | as 5.1 | none | as 5.1 | `Stat` ✓, `Button` ✓ |
| 5.3 | Sprints this year | `.blist`: "Performance Sprint 4 · running", "8 weeks, weeks 40 to 47", "Average performance score 84%" | `sprints`, `week_scores` | none | `m6SprintFigures` (average) | `List`/`ListRow` ✓ or `Stat` ✓ |

### Step 6. End-of-sprint review (M6 `F.end`)

| # | Screen or state | Where | Reads | Writes | Scores | Shared components |
|---|---|---|---|---|---|---|
| 6.1 | Finished | step "Finished", label "Performance Sprint 4": "Great sprint, Sam! You averaged 86%.", `dial2` (Average, 86%, Standard 85%; weeks draw in, then the glow), `.legend`, facts "Weeks at your standard 6 of 8" / "Up from 4 of 8 last sprint." and "Best week Week 4, 94%" / "12 to 18 Oct", `.since` "Since you started: Hardware score up 12, 1 objective done." Below the standard (M6 note): "Not your strongest sprint. What still went well?" | `sprints` (this and the last), `week_scores`, `checkins` (hardware_score first and latest), `outcome_objectives` (reached), first sprint's weeks | `freeze_week` (last weeks) | `m6SprintFigures` (average, weeksAtStandard, best), `m6SinceStarted`, `m0AtStandard`, `m0Change`; which opening to show **MISSING** | **MISSING**: SprintDial finished state (with the draw-in and mint glow); `Stat`/`StatGroup` ✓ |
| 6.2 | What worked best | step "Worked": "What worked best in this sprint?", "Name 1 or 2 things you'd keep doing.", See an example (`EXM.worked` by role), box, eye "Only you" | none | **no table** (see 4) | none | `TextBox` ✓ |
| 6.3 | Next time | step "Next time": "What would make the next sprint even better?", "Pick one thing you'd do differently.", example (`EXM.next`) | none | **no table** | none | `TextBox` ✓ |
| 6.4 | Objectives | step "Objectives": "Which objectives will you keep?", "Keep, change or retire each one.", rows "34 of 40, up 3 this sprint", "7/10, up 1 this sprint", "Milestone, not yet. By 31 Mar 2027", Keep/Change/Retire, Add an objective | `outcome_objectives`, `objective_figures` | `outcome_objectives` (`archived_at` on Retire; edits on Change; inserts), `strategy_objectives`, `plan_versions` (major), `performance_plans` | `m9FigureOn` (at sprint start and now), `m0Change`, `m9Objective` | **MISSING**: KeepChangeRow, ObjectiveEditor; `AddButton` ✓ |
| 6.5 | Habits that stuck | step "Habits": "Which habits have stuck?", rows "Held 8 of 8 weeks" with "Add to my plan" or mint tick "In your plan" | `sprint_habits` (`habit_id` null means sprint-only), `sprint_habit_settings`, `habit_logs` | `habits` (insert), `sprint_habits.habit_id`, `plan_versions` (minor) | `m1HabitScore` per finished week, then `m11HabitKeptUp`; which count as "stuck" **MISSING** | KeepChangeRow **MISSING** |
| 6.6 | What's next | step "Next": "What's next?", "Straight into Performance Sprint 5" (picked) or "Recovery first"; with Recovery, "How long a Recovery?" 1 to 4 weeks and "Nothing is tracked during Recovery."; finish "Set up Performance Sprint 5" or "Start my Recovery"; toasts "Saved. Set up Performance Sprint 5 next." / "Saved. Nothing is tracked during Recovery." | `sprints` | `sprints` (status `finished`, actual_end_on, finished_at); `recovery_periods` (if Recovery); DB `make_sprint_summary` for a seat | none | `Choice` ✓; day counter *partial* (see 7.1) |

### Step 7. Recovery, started any time (M15, all of it)

| # | Screen or state | Where | Reads | Writes | Scores | Shared components |
|---|---|---|---|---|---|---|
| 7.1 | Take a recovery week | `page()` `st.scr=='start'`: back "Home", label "Recovery", "How long would you like to recover for?", "Pick what feels right." / "You can end it early or add a few days.", day counter 1 to 30 (`dstep`, "1 week" suggested), "Your recovery ends on Mon 2 Nov.", soft panel "While you're in recovery" with 3 bullets, tick "Let Tim know" with "Tim will see that you've started a recovery week, and until when.", Start my recovery; toast "Your recovery week has started. Home now shows only the basics." | `sprints` (running), `recovery_periods` (none open), `my_coach()`, `person_settings.time_zone` | `recovery_periods` (sprint_id, start_on, chosen_days, let_coach_know) | `m0SprintCalendar` (the new end) | `Stepper` *partial* (no "1 week" wording or "suggested" note), `Checkbox` ✓, `StatementPanel` ✓ (soft panel), `Chevron` ✓, `Button` ✓ |
| 7.2 | Home in recovery | `'home'`: "Good morning, Sam", banner "You're in recovery until Mon 2 Nov." / "4 days left.", "What would help you recharge today?" box with "This is optional, like everything here." and a tappable eye, tiles Sleep ("How did you sleep last night?", "~1 minute") and Breathe ("1, 3 or 5 minutes"), links "Add a few more days" and "I'm ready to go again" | `recovery_periods`, `recovery_recharge_answers` | `recovery_recharge_answers` (recovery_id, local_date, answer, shared), `day_plans` sleep fields (Sleep tile) | none | `TextBox` ✓, `WhoSees` with `onChange` ✓, `Tile` ✓; **MISSING**: RecoveryBanner. Home itself is Phase 4 (see 5) |
| 7.3 | Dashboard in recovery | `'dash'`: page eye, calm panel ("You're in recovery until …", "Your scores and standards are hidden until you're back.", "Your sprint picks up from week 4 when you return.", "Show my results"), "What you can do now" links | none new | none | none | Phase 5 (no dashboard yet). RecoveryNotice **MISSING** |
| 7.4 | Sprint, paused | `'sprint'`: back "Personal", "Performance Sprint", `rdial(true)` ("Week 4 of 8", "PAUSED", no mint or grey, this week dashed), "Sprint 4 is paused at week 4 of 8.", "It picks up on Mon 2 Nov.", "It now ends on Sun 29 Nov instead of Sun 22 Nov.", links "Add a few more days" / "I'm ready to go again" | `sprints`, `recovery_periods` | `recovery_periods.extended_days`, or `ended_at` + `end_on` | `m0SprintCalendar` (with an assumed end, see 4) | SprintDial paused state **MISSING** |
| 7.5 | Add a few more days | toast only (`TOASTS.more` "Opens Add a few more days, with the same day counter.") | `recovery_periods` | `recovery_periods.extended_days` | none | day counter (7.1) |
| 7.6 | The end check-in | `'end'`: label "Recovery", "How are you feeling?", "Choose whether to pick up your sprint or take a few more days.", rows "I'm ready to go again" / "A few more days"; more: "How many more days?" counter and "Your recovery would now end on …"; "Pick up my sprint" or "Add the days" | `recovery_periods` | `recovery_periods` | `m0SprintCalendar` | `Choice` (rows) ✓, day counter |
| 7.7 | Welcome back | `'back'`: "Welcome back, Sam", "Let's start with this week.", `rdial(false)`, "Sprint 4 picks up today, at week 4 of 8.", "It ends on Sun 29 Nov.", Log today (coral) and Plan my day | `sprints`, `recovery_periods` | none | `m0SprintCalendar` | SprintDial **MISSING** |
| 7.8 | What Tim sees | `'coach'`: back "Clients", "Sam Patel", Recovery panel ("Sam started a recovery week on Mon 26 Oct, until Mon 2 Nov.", reminders lines, "Sam chose to let you know. They don't say why, and the portal never asks."), "Next coaching session" | `recovery_periods` (RLS: `may_see(user_id,'recovery_notice',let_coach_know)`), `coach_client_list()` | none | none | No coach portal exists (see 5). Coaching sessions have no table |
| 7.9 | Scores hidden, "Show my results" for this visit | M15 note "Your results"; decisions 26 Oct 16:29 | `recovery_periods` | none (a screen choice, not stored; spec section 3) | none | RecoveryNotice **MISSING** |

---

## 2. Missing shared components (build first, in the gallery)

Each goes in `src/components/design`, exported from `index.js`, with a section in `src/pages/designReference/DesignReference.jsx`, in dark and light.

1. **SprintDial** (decisions "Sprints": parallel gaps of constant width, the brand crosshair at the top marking start and end; Phase 0b note: "The dial and bar chart are built in Phase 2"). One component, five states:
   - *running* (M1 `dial()`): viewBox 420, R 136, ring 16 wide, 20° gap at the top for the standard crosshair (20px, masked from `crosshair_white/black`), one segment per week for any length 2 to 16, day ticks outside the ring (longer at week edges), a 3.5 dot for today, this week filling by day in the text colour, finished weeks mint at or above the standard and grey below, weeks to come faint (`--dial-next`), week numbers outside on desktop only, a pop-up per segment (`tipProps`), centre "Performance score this week" and the figure. The existing `Dial` uses angular (wedge) gaps, no crosshair, no ticks: either replace it or keep it as Home's mini dial and add this.
   - *setup* (M6 `dial()`): empty segments, centre "Weeks" / "12".
   - *finished* (M6 `dial2()`): thinner ring, wider top gap, weeks draw in one after another, then the crosshair glows mint; centre "Average", the figure in Nekst Light, "Standard 85%". Still with reduced motion.
   - *paused* (M15 `rdial(true)`): no mint and no grey, this week dashed, centre "Week 4 of 8" / "PAUSED".
   - *welcome back* (M15 `rdial(false)`): normal colours, centre "Week" / "4 OF 8".
2. **YearChart** (M1 `R.year`): 52 slim bars (5 wide, rounded), "SPRINT n" brackets above (current in the text colour), the standard as a dashed line labelled "Standard 85%" at its right end, Recovery hatched (pattern in `--g4`/`--below`), a 2px stub for weeks with nothing, week numbers every 4 and months along the bottom, the selected week outlined, every bar focusable with Enter and a `ChartTips` pop-up, "Show as a table" (graphs rule). Phone: full width with only what matters labelled.
3. **IndividualPerformanceSystem** pop-up content, word for word from the one-pager: heading "How it fits together" / "The Individual Performance System"; three lead lines; the plan box with the numbered chain 1 to 4 and the dashed joins "measured by", "delivered through", "carried out by"; the two-way link; the sprint box (one sentence per line, the brand crosshair before the last line); the dashboard box (dashed). Replaces the gallery's stand-in `SystemPopup`. Rule overrides for it are in section 3.
4. **MissionPanel** (M1 `mpanel()`): "My Mission" label with the eye, the mission, the objectives strip (name left, figure right: "31 of 40", "7/10 of 9/10", "Not yet, by 30 Jun 2027"), "Performance score this week" with the figure, the system link, "Open my plan". A panel under the pill on desktop and from the bottom on phone.
5. **ObjectiveCard** (M1 `.ob`): label line (kind and date), name, big figure with "of 40" or "target 9/10" (or Not yet/Done for a milestone), progress `Bar` in mint, `StatusAction` for milestones, foot "2 Strategies working on this" or the flagged "No Strategy working on this yet".
6. **ObjectiveNumber**: the small circled number, with the pop-up "Outcome Objective 2" then the name (ChartTips style, 12px inside the edges, hover, tap and focus). `Tile`'s `serves` uses it.
7. **AlignmentCheck** (M1 `.align`, M6 `.align2`): "Every objective has a Strategy" and "Every Strategy serves an objective" with a mint mark, or the needs-you version in words with an outline ("Annual revenue has no Strategy working on it").
8. **StrategyDetail** (M1 `stratDetail`): inline panel with close on desktop, full panel with back "Plan" on phone; Habits (name and measure line), To-dos this sprint, Work this sprint (empty state "Nothing tagged yet." / "When a tool finishes, you can tag it to this Strategy."), Edit this Strategy.
9. **LoggingRow, more kinds** (M1 `hrow`): `yesno` (No/Yes, the habit's question as its name), `rating` (1 to 5), `tick` (once a week), plus the ">" button (44px, label "[habit]: week, target and impact") on every kind. And **LoggingWeekRow**: seven day boxes (later days disabled, today marked) or seven day Yes/No buttons that say Yes or No in words, the week line and the bar.
10. **TodoRow** (M1 `.td` and `winRow`): tick, text, the Strategy line with tags ("rolled over from week 3", "moved to week 5", "Unplanned win, Tue" with the mint tick), Move as a text button; a moved row's tick disabled. Every row in one list looks alike. Reused by the debrief and Plan my day in Phase 3.
11. **AddTodoPanel** and **AddWinPanel**: the gallery demos made into shared parts, in the agreed order (what, Strategy, how much, when), with the M1 wording and the note "Moving it before that week starts doesn't count against you." Reused in Phase 3.
12. **KeepChangeRow** (M6 `.cr`): name, grey line, and a small Keep/Change/Remove (or Retire) segmented control, or an action ("Add to my plan") or a status ("In your plan" with a mint tick). Removed rows fade.
13. **ObjectiveEditor** (M6 `objCard`) and **HabitEditor** (M6 `hcard`): shared by Build your plan, editing, Start a sprint (Change, Add a habit), the habit panel and the end-of-sprint review.
14. **DayCounter**: `Stepper` with a formatted value ("3 days", "1 week", "2 weeks"), a "suggested" note under it, the 1 to 30 limits, and the end date line updating without anything else moving (M15 `dstep`; decisions 26 Oct 16:24 to 16:26).
15. **RecoveryNotice** and **RecoveryBanner** (M15 `.rcalm`, `.rbanner`): "You're in recovery until …", "4 days left.", "Your scores and standards are hidden until you're back.", "Show my results" (this visit only). Also the coach-side card (M15 `.rcoach`) for the coach portal later.
16. **Choice tile toggle** (M6 `.tmpl`): a pressed state on `Tile` for "Just started a new role?".

Not components, but missing helpers the screens need (pure code in `src/lib/`): a units converter (litres and US fl oz, stored in one unit; `person_settings.units`), a plan-version helper (major or minor from a before-and-after snapshot), and a Phase 1 data layer (plan, sprint, logs) that writes through `saveOrQueue` and reads through `useCachedLoad`.

---

## 3. Where a later approved rule overrides the mock-up

### Everywhere (from the brief's list, START-HERE 5 and 6, CLAUDE.md)
- Coral as a data colour becomes mint (dark #5FEFBB, light #0B7A52; `--good`): M1 `wcol()` and `dialLegend`, M1 year bars, M6 `dial2` met weeks, the live score (`style="color:var(--accent)"`), the M1 `col()` tile bars (were `--t2`), the M1 objective bars (`bar()` in `--t2`) and the M6 finished-dial glow ("glowing coral" in the M6 note). Below the standard stays grey (`--below`), never coral or peach.
- No keys on screen: drop `dialLegend()` (M1 sprint), `.ylg` (M1 year), `.legend` (M6 finished); label in place and give every mark a pop-up. The M1 note "A legend under the dial says which is which in words" is replaced.
- One add button: every "Add a to-do", "Add an unplanned win", "Add an objective", "Add a Strategy", "Add a habit" is `AddButton` (crosshair in the text colour, coral only on hover or focus, full width on a phone). The Strategy ideas and "your other Strategies" pick rows add something, so they use it too.
- The eye from the one icon set, and tappable (Tim, 26 Oct, 11:57): M1 and M6 eyes are static labels. On the plan: My Mission opens "Who can see this?" for the mission switch; the page eye can open "What [coach] sees" (mission, progress). Logs, habits, to-dos and wins can never be shared (spec section 5), so their eye opens "Who can see this?" saying so in words with no switch (as the guest Health Check's eye; Claude's call).
- The ⓘ and the system link from the one icon set (M1 uses a CSS mask; build with `InfoIcon` and `SystemLink`, inline SVG).
- One chevron: M1 `BK`, `MORE`, `AR` and M6 `CHL`/`CHR` paths become `Chevron`; drop-downs and folds use `DisclosureArrow`. M6's Back uses an arrow (`AR`), which becomes the chevron.
- Branded drop-downs only: already so in the mock-ups (`dd`); use `Dropdown`/`Choice`.
- Pop-ups 12px inside both edges; lists of terms as the word then its meaning.
- Rule 40 definitions word for word: the IPP lines already match ("This is the big aim…", "Progress on your mission is measured by your Outcome Objectives.", "Outcome Objectives are the results…", "Strategies are medium to long-term approaches…").
- Pills on phones stay on one line or become rows (M6 standard pills, Keep/Change/Remove, Recovery length).
- "~10 minutes" for tool times (rule 27): M6 "Clear space" shows "10 min".
- Time left in the unit that fits (START-HERE, 26 Oct, 10:47).
- Every line a full sentence; no dashes, semicolons, brackets; few colons; no bold (writing rules 24, 26, 48, 49).
- Text sizes from `--u`; tokens only (CLAUDE.md rules 2, 9, 10, "Text size follows the device").
- Numbered circles show "Outcome Objective 2" then the name (Tim, 26 Oct, 11:48): M1 `onum` uses a `title` attribute.

### Step 1, the plan
- `heading('Individual Performance Plan','Version 3.2 · changed Fri 2 Oct')`: meta items as `PageHeader` items, dates as "Today", "Yesterday", "Mon 19 Oct" (rule 28); "changed" starts with a capital as its own item.
- Objective cards: "Objective 1 · milestone · by 30 Jun 2027" says "Outcome Objective 1" where the name shows (rule 27) and adds the time left ("8 months left"; START-HERE "Time left to a date"). Dots between items go (icon-row rule: no dots).
- Objective progress bars mint (progress towards a target); a done milestone mint with a full bar (already).
- Strategy tile score: mint when at or above the standard, text colour below (M1 `col()` used grey for both).
- The system pop-up: wording from the one-pager, not `sysPanel()` (which leaves out the two-way link and the end-of-sprint line). Within the one-pager: "↓ Your tactics go into each sprint" and "↑ Your scores…" use text arrows, which CLAUDE.md 26 Oct rule 6 bans; the "coral outlined box" for the plan is a decorative coral that the 26 Oct colour rule (coral only for the main button, hover, focus, selected and the brand) no longer allows; and "with Recovery between sprints" is out of date now Recovery starts any time (M15). Recommended: keep the words, draw the two-way link with the turned `Chevron` (up and down), outline the plan box in the text colour, and keep "with Recovery between sprints" word for word but list it for Tim.
- My Mission panel: "Performance score this week" becomes "…this week so far" (M5: "labelled 'So far' wherever it shows"); figure mint at the standard.
- In Recovery: tile scores and the panel's score are hidden (M15 "scores and standards are hidden").

### Step 2, Build your plan
- The step list becomes the % complete bar in the text colour (START-HERE 5 "Guided tools", part 2 line 239, CLAUDE.md 26 Oct rule 1). M6 shows the step list for Build your plan, Start a sprint and the end-of-sprint review. `GuidedTool` `progress="percent"`.
- A working-days step is added (decisions 26 Oct, 14:38: "M6 set-up gets the question"). Not in M6.
- Organisation seats: the standard step shows 85% with no way to change it (part 2, 26 Oct, 23:49; `my_fixed_standard()`).
- Habits: a rating needs "Higher is better" or "Lower is better" (decisions "Process measures"; `habits` check needs `direction`, target 2 to 5 or 1 to 4). An amount needs its unit (`MT` says "e.g. steps or litres" but `hcard` has no unit box). Neither is in M6.
- Objectives: a number has a unit and goes up or down (spec section 2; `outcome_objectives.unit`, `direction`). M6 has neither box. Recommended: no unit box (keep the mock), and set `direction` to `down` when the target is below the start (Claude's call), listed for Tim.
- The help panel on the first Strategy screen: M6's wording is the newer agreed one ("A Strategy is a medium to long-term approach to achieving your objectives." then "For example: …"), which replaces the 22 Oct "The big 'how'" panel. No change.
- Saved toast "Saved. Carry on from Home whenever you like." stays (Home exists).

### Step 3, Start a sprint
- % bar instead of the step list (as step 2).
- "Clear space" step: "10 min" becomes "~10 minutes", and both tools (Time audit, Delegation audit) don't exist. See section 6.
- Standard fixed at 85% for organisation seats.
- "From Performance Sprint 4": the spec and brief say the sprint's habits are copied from the plan (`habits`). Recommended: list the plan's habits (which include any added to the plan at the last review), keep the step's wording, and list the label for Tim.

### Step 4, the sprint page
- Dial colours mint and grey, no legend, pop-ups per week (above).
- Centre and hero label "Performance score this week so far" (M5 "This week so far").
- "Standard reached this week" is a fragment (rule 48) and a so-far figure: recommended "You're at your standard so far this week." with the mint tick.
- Sprint details "Sprint ends in 39 days" becomes the time-left unit ("Sprint ends in 6 weeks"); "79% · weeks 1 to 3" loses the dot ("79%" then "Weeks 1 to 3.").
- Log today counts working days only (brief step 4; M0.3): the week view shows boxes for working days, plus any day off already logged; a day off in the day view says it can still be logged and never expects it (Claude's call, not mocked).
- Rating rows: the M1 line "Rated 1 to 5 today, aim for 4" stays; scoring follows M1's rating rule (floor at 1), which differs from the mock's `mScore` (average ÷ target).
- Habit scores follow `m1HabitScore`, not the mock's `mScore` (the mock has no daily-target pro rata, no "Not logged" rule).
- Move panel: the mock always says "This week has started…"; for a to-do in a later week (from "Later in this sprint") the move is free (M2), so that line is left out there (Claude's call).
- "Start my debrief" (Phase 3) is hidden until the debrief exists (Claude's call; a link to nothing breaks rule 41).

### Step 5, View your year
- Bars mint and grey, this week in the text colour, no legend; "Recovery" marked in words in the pop-up as well as hatched (rule 40, never colour alone).
- The selected-week line "A planned break between sprints, with nothing tracked." is out of date for any-time Recovery: recommended "You were in recovery this week." (Claude's call).
- "Open the week summary" waits for Phase 3's debrief summary; hidden until then.

### Step 6, end-of-sprint review
- Finished dial mint, glowing mint (experience rule 15 "glowing mint"; M6 note says coral).
- No legend: label in place.
- "Up from 4 of 8 last sprint." is a comparison with last sprint, which lives only in a chart pop-up (START-HERE 5: "comparisons with last sprint live only there", Tim, 11:44). Recommended: move it to the dial's pop-up.
- "Since you started: Hardware score up 12, 1 objective done." becomes "…1 objective reached." (START-HERE "Milestones are reached"), and shows only the parts that have data (rule 48 "Say only what's there"); with no check-ins yet, the Hardware part is left out.
- "Held 8 of 8 weeks" becomes "Kept up in 8 of 8 weeks" (M11 wording, Claude's call).
- "How long a Recovery?" 1 to 4 weeks becomes the M15 day counter, 1 to 30 days, 1 week suggested (decisions 26 Oct, 16:24 to 16:25, newer than M6's 23 Oct). "Nothing is tracked during Recovery." becomes the M15 lines (the sprint pauses, scores hidden).
- A goal check at the end of each sprint (methods M15 title; `goal_checks.occasion = 'sprint_end'`; decisions 26 Oct, 17:12 "We'll ask again at the end of each sprint") is newer than M6 but its screens are in M16 (Phase 8). Recommended: left out in Phase 2, listed.

### Step 7, Recovery
- M15 is the newest (26 Oct) and approved; it already follows mint and the eye. Remaining overrides:
  - The paused dial and welcome-back dial use M15's `rdial` (wedge gaps); use SprintDial's paused and normal states (parallel gaps, crosshair at the top).
  - "Let Tim know" and every "Tim" come from the person's own coach (`my_coach()`), never hard-coded; with no coach the tick line is left out (START-HERE 5a, rule 31).
  - "Plan, review and logging reminders pause" is said although no reminders exist yet; harmless, kept word for word.
  - "Let [coach] know" is a single tick box on a form row, which the 23 Oct tick-box rule limits to lists; M15 (26 Oct) is newer and approved, so the tick stays.

---

## 4. Figures and statuses the methods don't define, and database needs

### Figures or statuses not in `docs/scoring-methods.md`
1. **The alignment check** (every objective has a Strategy; every Strategy serves an objective). A structural status, not a score; decisions "Alignment rules". Needs a pure helper (suggest `src/lib/plan/alignment.js`, or a short M-section added by Claude for Tim).
2. **Which to-dos show in "To-dos this week"** (due this week, rolled over from earlier weeks, moved out after the week started, done this week) and the tags "rolled over from week 3" and "moved to week 5". M2 defines the scores, not the list. Needs a helper beside `m2TodoScore` in `src/lib/scores/m2.js` (built from `m2PlannedWeekAt`), with tests.
3. **"Done. 3 of 4 this week."**: the count of this week's to-dos done. Follows from 2.
4. **The per-row bar and line on Log today**: M1 uses today's figure against today's target for daily amounts ("8,400 of 10,000 steps today") and the week score otherwise. Recommended: the line is the logged value against the daily target (not a score); the bar is `m1HabitScore` with `soFarUntil` today. Needs Tim's nod or a line in M1.
5. **Placing sprint weeks on the year's weeks** (View your year: 52 slots, months, Recovery hatched). Sprints start on any day and stretch with Recovery, and Recovery now lasts any number of days. Recommended (Claude's call): a sprint week sits in the calendar week (Monday start) of its first day; a calendar week is "Recovery" when Recovery covers 4 or more of its days (`MOSTLY_RECOVERY_DAYS`), matching M0.5.
6. **The projected end while Recovery is running.** `m0SprintCalendar` returns `actualEnd: null` until Recovery ends, but M15 shows "It now ends on Sun 29 Nov instead of Sun 22 Nov." Recommended: call `m0SprintCalendar` with the open Recovery's end set to `start_on + chosen_days + extended_days`.
7. **What happens when the chosen Recovery end passes with no answer.** M0.4 pauses sprint time until "I'm ready to go again". Recommended: it stays paused and the end check-in shows on every visit to the sprint page.
8. **"Great sprint" or "Not your strongest sprint"**: the rule for which opening shows. Recommended: `m0AtStandard(average, standard)`.
9. **Which habits "have stuck"** (M6 shows 8, 7 and 6 of 8). Recommended: sprint habits not yet in the plan, kept up (M11) in at least 6 of every 8 finished weeks (75%; Claude's call), or simply every sprint-only habit with its M11 line.
10. **"Up 3 this sprint"** on objectives: M9.1 defines "improving this sprint" but not the size; it is `m0Change(m9FigureOn(now), m9FigureOn(sprint start))`. Fine to use, worth one line in M9.
11. **Sprint details "Average" before any week has finished**: no wording defined. Recommended: "Your average appears after your first week." (mirrors M8's wording).
12. **The first 90 days template**: M6 sets 13 weeks and the label "first 90 days in a new role"; no content (objectives, Strategies, habits) is defined anywhere. Recommended: 13 weeks and the label only.

### What truly needs a database change (no migration this phase; list for Tim)
1. **End-of-sprint review answers** ("What worked best in this sprint?", "What would make the next sprint even better?", and the keep/change/retire choices as a record). No table in 026 to 033 or the spec holds them; `journal_entries` and `decisions` have closed type lists. Without a change, the answers can only be kept on the device (`useDraft`) or folded into `plan_versions.change_note` (500 characters, only when the plan changes). Suggested: a `sprint_reviews` table (sprint_id unique, worked_best, next_better, finished_at), own rows only.
2. **"Work this sprint" on a Strategy** (tools tagged to a Strategy). No column links `decisions` or the new tools to `plan_strategies`; only `todos.source`/`source_id`. Phase 2 shows the empty state; the tagging needs a link table later.
3. **Coaching sessions** for the coach's Recovery screen ("Next coaching session"). No table. Not needed until the coach portal.
4. Not a change, but worth knowing: `outcome_objectives` and `habits` refuse half-filled rows (their checks need every field for the kind), so "save as you go" for a half-written objective or habit must stay on the device until it is complete (see R1). `recovery_periods.extended_days` tops out at 60 and `end_on - start_on` at 120, so repeated "A few more days" must stop at that cap.

Nothing else needs a change: plans, versions, objectives, figures, Strategies, habits, sprints, sprint habits and their settings, logs, to-dos and moves, wins (with evidence), Recovery and recharge answers, working days, sharing switches, week scores and the seat standard are all there.

---

## 5. Proposed routes (no clash with `src/App.jsx`; old pages stay)

Every route sits inside `<Route element={<ProtectedLayout />}>` (no change to `ProtectedLayout.jsx`; only new `<Route>` lines in `App.jsx`). None of these paths exists today (the old plan is `/personal-operating-plan*`, the old Strategies page `/strategies`, Plan hub `/plan-section`).

| Route | Page | Reached on the preview |
|---|---|---|
| `/performance-plan` | Individual Performance Plan (1.1 to 1.10; the pop-up and the Strategy detail open over it) | typed in; "Open my plan" on the sprint page, the Mission panel and View your year |
| `/performance-plan/history` | Version history (1.8) | "See version history" on the plan |
| `/performance-plan/history/:version` | One version, read only (e.g. `3.2`) | a row in the history |
| `/performance-plan/build` | Build your plan (step 2), full screen | typed in; the plan's empty state "Build my plan" |
| `/performance-plan/edit` | Editing the plan (same steps, no sprint steps); `?step=strategies&id=…` opens one step (for "Edit this Strategy") | "Edit my plan", "Edit this Strategy" |
| `/performance-sprint` | Performance Sprint (step 4), including paused, welcome back and "sprint over" states | typed in; links from the plan and the year |
| `/performance-sprint/start` | Start a sprint (step 3) | "Set up Performance Sprint 5" at the end of a review; the sprint page's "no sprint" state |
| `/performance-sprint/review` | End-of-sprint review for the latest finished or ended sprint (step 6); `/performance-sprint/review/:number` for an earlier one | the sprint page once its last week has passed ("Review this sprint") |
| `/performance-sprint/year` | View your year (step 5) | "View your year" on the sprint page |
| `/recovery` | Take a recovery week (7.1) | "Take a recovery week" beside the dial on the sprint page; "Start my Recovery" at the end of a review |
| `/recovery/today` | Recovery's daily page: the banner, "What would help you recharge today?", Sleep and Breathe, Add a few more days, I'm ready to go again (7.2's body, a stand-in until Home is rebuilt) | the paused sprint page |
| `/recovery/check-in` | The end check-in (7.6), also "Add a few more days" (7.5) with the same counter | the paused sprint page and `/recovery/today`; shown on the sprint page once the chosen end has come |

Where Recovery starts in Phase 2: the sprint page (beside the dial) and the end-of-sprint review. Left for their own phases: Home's quiet link and Home in recovery (7.2) and Welcome back at the top of Home (Phase 4), the debrief's link (Phase 3), My Account's link (its own phase), the dashboard in recovery (7.3, Phase 5), and the coach's client page (7.8, the coach portal). Until then 7.8 is checked through the rules test as the coach account (`recovery_periods` visible only when `let_coach_know`, only the dates).

The header's My Mission pill: `DesignHeader.jsx` reads the old `MissionContext` and goes to `/personal-operating-plan`. Recommended: when the person has an active `performance_plans` row, the pill shows that mission and opens MissionPanel; otherwise it stays as it is. That changes `DesignHeader.jsx` and `MissionContext`, not `ProtectedLayout.jsx`, the menus or the phone bar.

---

## 6. Suggested build order and risks

### Order
0. Step 0 checks (build, lint, `test:scores`, `test:patterns`, `test:rules -- --as-is`, `test:healthcheck`), then the missing helpers with tests: the to-do list helper in `m2.js` (section 4, item 2), the alignment check, the year-week placing, the projected Recovery end, units conversion, the plan-version rule. Add their worked examples to `tests/scores`.
1. The data layer (`src/lib/performance/`): load the active plan, the running sprint and this week in one go into `useCachedLoad`; every write through `saveOrQueue` with device ids; `freeze_week` called (online only, best effort) for each finished week without a final `week_scores` row, on loading the sprint page and at the review; coach from `my_coach()`; sharing switches.
2. Gallery parts, in this order (each needed by the next step): ObjectiveNumber, ObjectiveCard, AlignmentCheck, IndividualPerformanceSystem, MissionPanel, StrategyDetail (step 1); ObjectiveEditor, HabitEditor, Tile pressed state, SprintDial set-up state (step 2); KeepChangeRow (step 3); SprintDial running, LoggingRow kinds, LoggingWeekRow, TodoRow, AddTodoPanel, AddWinPanel (step 4); YearChart (step 5); SprintDial finished (step 6); DayCounter, RecoveryNotice, RecoveryBanner, SprintDial paused and welcome back (step 7).
3. Then the brief's steps 1 to 7 in order, each committed and pushed. Build your plan (step 2) must exist before the plan page can be filled on the preview, so step 1 can be tested with invented data made through step 2 once it lands, or step 2's saving can be built first and its screens second.

### Risks
- **R1 Save as you go against strict checks.** `outcome_objectives`, `habits` and `plan_strategies` refuse incomplete rows, and the plan's parent rows must exist before children (same-owner triggers). Keep each unfinished item on the device (`useDraft`) and write it once valid; send parents first (the queue keeps order). A queued child whose parent was refused stays "failed": surface it with `ErrorMessage keepsHappening`.
- **R2 Upserting logs.** `habit_logs` is unique on `(sprint_habit_id, local_date)`. Upserting with a fresh device `id` against an existing row changes its id; use `onConflict: 'sprint_habit_id,local_date'` and send no `id` (or a stable one per habit and day). Clearing a value must delete, as `value` can't be null.
- **R3 Coach sees nothing without freezing.** Week scores reach the coach only through `freeze_week`, which can't be queued. Call it when online; a later nightly job is outside this phase. Also `METHODS_VERSION` '1.1' against methods 1.3: flag for Tim.
- **R4 One running sprint.** `sprints_one_running` allows one `running` sprint per person. Start a sprint must finish the previous one first (status, `actual_end_on`, `finished_at`, `make_sprint_summary` for a seat), including when the review is skipped. A sprint that starts in the future is still `running` from the moment it's made, and its start can be moved before it begins.
- **R5 A sprint that's over but never reviewed** stays `running` for ever. The sprint page needs a "sprint over" state (not mocked; `portal-overhaul-decisions.md` line 1490: "Review this sprint" or "Start Recovery").
- **R6 Two missions.** The old `missions` table drives the header pill and the old plan; the new plan has `performance_plans.mission`. Prefill from the old one, gate the header change on having a new plan, and leave the conversion (spec section 13) to go-live.
- **R7 Recovery edges.** Recovery across a week boundary, a 16-week sprint, Recovery with no sprint running (`sprint_id` null, after "Recovery first"), extensions past 60 days, logging on Recovery days (they belong to the next week under `m0WeekOfDay`), and time zones (`person_settings.time_zone`, `person_today`). The break-it tester should run all of them.
- **R8 Last week of a sprint.** "Move" offers only later weeks of this sprint; in the last week the list is empty. Recommended: move to "No week yet" (`sprint_id` and `planned_week` null, allowed by the `todos` check) or into the next sprint once it exists; not mocked.
- **R9 Not mocked but needed:** version history, the empty plan, the empty or finished sprint, a day off in Log today, editing or deleting a to-do (experience rule 7), plan habit changes mid-sprint (spec: the plan's habits are copied when a sprint starts, so a habit added to the plan mid-sprint waits for the next sprint unless the person adds it to this sprint too; Claude's call), "Clear space" tools that don't exist (recommended: leave the optional step out and list it, as linking to nothing breaks rule 41), and Sprint length outside 4, 6, 8, 12, 16 (the brief says 2 to 16: recommended "Other" with a box, as the standard step does; Claude's call). Each must be built from shared parts and listed in the report as a difference, per CLAUDE.md rule 22.
- **R10 Hard-coded coach.** `CoachContext` comes from `src/content/coach` (Tim). Recovery and every eye must use `my_coach()`; someone with no coach sees "Only you" and no "Let [coach] know".
- **R11 Hidden scores in Recovery** must cover every Phase 2 page (plan tiles, Mission panel, sprint, year) and "Show my results" must not be stored (spec section 3).
- **R12 Gallery contract.** CLAUDE.md rule 14 says design work must not change logic, routing or database code; Phase 2 is a build phase, but the gallery parts should stay free of data code so they can be shown with invented data.
