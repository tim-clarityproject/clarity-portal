# Methods: how every score in The Clarity Portal is worked out

Version 1.1 (draft for the build), written 26 Oct 2026, 18:16 onwards, by Claude for Tim (Dr. Tim Dutton, The Clarity Project LTD); scientific audit the same evening (see M22).

This is the single source of truth for every score, figure, flag and pattern the portal shows. The code follows it, the PDFs follow it, and the public "How it works" page is written from it. Where a mock-up shows a different figure, this document wins on the arithmetic and the decisions doc wins on everything else.

Companion: the claims register (claude/methods/claims-register.md) says how strong the evidence is behind each claim and each tool. Section IDs here (M1, M2…) and claim IDs there (C1, C2…) are used in code, tests and the evidence library.

## How to read this document

- **Every section starts "In plain words"**, for Tim, a CEO or anyone Tim sends it to. The exact rule follows, for Claude Code and for scientists.
- **Decided by Tim** is marked (Tim, date). **Claude's calls** are marked (Claude). Tim can change any Claude's call; a change gets a new version number and a line in the change log (M22).
- **For Claude Code:**
  1. One function per section in src/lib/scores/, named after its ID (for example `m5WeeklyPerformanceScore`). No score is worked out anywhere else.
  2. Every worked example in this document becomes a test case, with the same inputs and the same answer.
  3. Scores that coaches, sponsors and leaders see (M5, M6, M9, M18, M19) are also mirrored as database functions, tested against the same cases, so the screen and the database can never disagree.
  4. Every frozen summary (end-of-sprint summaries, organisation reports, PDFs) stores the methods version it was made with.
  5. docs/scoring-methods.md in the repo is a copy of this document. If the two differ, this one wins and the repo copy is updated.

---

## M0. Shared rules

### M0.1 Rounding and display
In plain words: the portal works with exact figures and only rounds when it shows them, so totals never drift.
- Calculate in full precision. Round only for display.
- Percentages and 0 to 100 scores: whole numbers, halves rounded up (84.5 shows as 85).
- **Comparisons with the standard use the rounded figure people see**, so a week shown as 85% is never coloured as below a standard of 85% (Claude).
- Hours: one decimal place ("7.1 hours"). Ratings out of 10: whole numbers on the dashboard (Tim, 26 Oct, 11:50). Money and counts: as entered, in the person's regional format.
- Changes ("+5", "−3"): the difference between the two rounded figures people can see, so the arithmetic on screen always adds up (Claude).

### M0.2 The person's day
- A day is the person's own local day, in the time zone of the device they log from, so logging follows them when they travel (experience rule 42).
- A day runs from 00:00 to 23:59 local time. An entry belongs to the day it is for, not the moment it was typed; past days can be filled in or changed any time (experience rule 7).

### M0.3 Working days (Tim, 26 Oct, 14:38)
In plain words: everyone sets which days they work, and only those days count. A day off never counts against anyone.
- Each person has a working pattern: any number of days, on any days. Default Monday to Friday.
- Daily habit targets, logging counts ("4 of your 5 working days") and daily reminders use working days only.
- Logging on a day off is welcome and counts towards that week's totals, but it is never expected and never counted as missing.
- A change to the working pattern applies from the next sprint week (Claude), so a week in progress never changes its targets.

### M0.4 Sprint time and sprint weeks
In plain words: a sprint is counted in sprint time, which stops during Recovery and starts again afterwards.
- A sprint has a start day (any day; Tim, 23 Oct), a length of 2 to 16 weeks (12 suggested) and a performance standard (M7).
- A sprint week is 7 days of sprint time from the start day. A sprint starting on a Thursday has Thursday to Wednesday weeks.
- **Recovery pauses sprint time (Tim, 26 Oct, 12:25):** from the moment Recovery starts until "I'm ready to go again", no day counts. The sprint end moves later by the days taken. A week interrupted by Recovery carries on from where it stopped when Recovery ends, so it still has 7 days of sprint time (Claude).
- A week is **finished** when its last day has passed. Its score is final once the weekly debrief is done or the debrief window closes, 3 days after the week ends (Tim, 23 Oct), whichever comes first. Later edits still update it (M0.6).

### M0.5 Which weeks count for ranges and patterns
A finished week is **eligible** for the usual range (M8) and patterns (M14) unless it is:
- a Recovery week, or a week mostly in Recovery;
- covered by a Travel and jet lag plan;
- marked "This week was unusual (ill, holiday, family)" in the debrief;
- thinly logged: fewer than 4 logged days, or for someone who works fewer than 4 days, fewer than all their working days (Claude; the pattern rules said "fewer than 4 days", which would rule out a 3-day week forever).
Ineligible weeks still have their own scores and show on charts (Recovery hatched, unusual weeks as a small grey dot).

### M0.6 Edits and frozen summaries
- A person's own scores update whenever they change a past entry; patterns are rechecked that night (pattern rule 23).
- What other people see is frozen: a sponsor's or leader's end-of-sprint summary is made when the sprint ends and stores its figures and the methods version. Later edits update the person's own view, not a summary already sent (Claude). The person's "What [sponsor] sees" page shows the frozen version.

### M0.7 Who sees what
The arithmetic is the same for everyone. Who may see a figure is set by the privacy decisions in the decisions doc (sponsor rule, "never feel monitored", totals only for groups, the eye). Every section below says who sees its figures.

---

## M1. Habit score (one measure, one week)

In plain words: each habit scores how close you came to your own target for the week, as a percentage, never above 100%.

Each habit has one measure, chosen by the person. Nothing is tracked by default. The weekly target for a daily habit is the daily target times the working days in that sprint week (M0.3).

| Measure type | Example | Weekly habit score |
|---|---|---|
| Count | Training sessions, target 3 a week | logged ÷ target, capped at 100% |
| Amount with a unit | Reading 20 minutes a working day | logged ÷ target, capped at 100% |
| Yes or no, once a week | Weekly strategic block | 100% if yes, 0% if no |
| Yes or no each day, against a target | At least 4 days with no screens after 21:00 | days with yes ÷ target days, capped at 100% |
| Yes or no each day, under a limit | No more than 2 late finishes | limit rule below, counting days with yes |
| Keep a count under a limit | No more than 2 coffees a day | limit rule below |
| Rating 1 to 5 | Focus, higher is better | rating rule below |

**Limit rule (decided 21 Oct):** at or under the limit scores 100%. Each one over takes it down by an equal step: score = 1 − (logged − limit) ÷ limit, never below 0%. A limit of 2: 3 scores 50%, 4 scores 0%. A limit of 0 (none at all): one over scores 0% (Claude: the step is worked out as if the limit were 1, so nothing divides by zero).

**Rating rule (Claude):** the week's average rating is compared with the target on the part of the scale above the floor, so the lowest rating scores 0% rather than 20%.
- Higher is better: score = (average − 1) ÷ (target − 1), capped at 100%. Target 4, average 3: 67%.
- Lower is better (for example pressure): score = (5 − average) ÷ (5 − target), capped at 100%. Target 2, average 3: 67%.
- A higher-is-better target can't be 1, and a lower-is-better target can't be 5, because both would always score 100%. Set-up offers 2 to 5 and 1 to 4.

**Days not logged (Claude):**
- Counts, amounts and yes-or-no targets: an unlogged day adds nothing, so the score reflects what was recorded.
- Limits and ratings: worked out from the days logged, but only if at least half the working days in the week were logged. Otherwise the habit scores 0% for that week and shows "Not logged". This stops a limit scoring 100% simply because nothing was entered. Filling in the days later updates the score.
- Every count has a sensible top number (3 times the daily target, or 20 if there is none; training sessions 3 a day, reflective notes 10), so nobody can log 20 late finishes in a day (experience rule 49).

**Changes mid-sprint:** a new target, measure or impact applies from the next sprint week; past weeks keep what they had (decided 21 Oct).

**Who sees it:** the person. Their coach, only if they share their progress. Never a sponsor or leader.

---

## M2. To-do score

In plain words: a to-do counts as done or not done in the week it was planned for.

- Done in its planned week: 100%. Not done by the end of that week: 0%, and it rolls into the next week, where it counts again (decided 21 Oct).
- Moved to another week **before** its week starts: no effect. Moved out **after** its week has started: counts as not done in that week (decided 21 Oct).
- Done **earlier** than planned: it moves to the week it was done and counts there as done (Claude), so nothing is lost and no week is credited twice.
- Every to-do belongs to one Strategy and has an impact of Low, Medium or High.
- To-dos added from Plan my day count in the sprint week like any other (Tim, 23 Oct).

---

## M3. Unplanned wins

In plain words: something you did that wasn't in the plan but moved things forward counts like a done to-do.

- A win counts as a done item (100%) in **every** Strategy picked, at the one impact level chosen for the whole win (Tim, 23 Oct, 13:52).
- It lifts a Strategy's score but can never take it above 100%, because it is an item in the same weighted average (M4).
- Every win is also saved to Performance Evidence and listed under Unplanned wins on the dashboard.
- Known limit: a week full of wins and few planned items will score highly. That is intended (the work happened), and the dashboard shows wins separately so it stays visible.

---

## M4. Strategy score (one Strategy, one week)

In plain words: a Strategy's score is the average of its habits, to-dos and wins that week, with the high-impact ones counting three times as much as the low-impact ones.

- Impact weights: Low 1, Medium 2, High 3. Default Medium (decided 21 Oct).
- Strategy score = Σ(weight × item score) ÷ Σ(weight), over the habits, to-dos and wins in that Strategy that week.
- A Strategy with nothing in it that week (no habit, no to-do planned, no win) is left out of the week's score rather than counted as 0%, and shows "Nothing planned this week" (Claude). The plan's alignment check already flags a Strategy with no tactics.
- **Who sees it:** the person; the coach if progress is shared; **sponsors and leaders see each Strategy's score in the end-of-sprint summary only** (Tim, 26 Oct, 17:29), never the items inside it.

---

## M5. Weekly Performance score

In plain words: the week's Performance score is how much of the week's plan you did, weighted by impact. A Strategy that serves two Outcome Objectives counts twice.

**Formula (decided 21 Oct):**
Weekly Performance score = Σ(Strategy score × number of Outcome Objectives it serves) ÷ Σ(number of Outcome Objectives each Strategy serves), over the Strategies scored that week.

- A Strategy always counts at least once, even if it serves no objective yet (Claude), so a half-built plan still scores.
- A week where nothing at all is planned has no score and shows "Nothing planned this week" (Claude).

**This week so far (Claude):** during the week, the live score uses the same formula with two changes, so it is fair on a Tuesday:
1. Habit targets are pro rata to the working days so far (2 of 5 working days gone: 40% of the weekly target).
2. To-dos still open count only once done; open to-dos count as not done only when the week finishes.
It is labelled "So far" wherever it shows.

**Worked example (test case M5-1).** Sam works Monday to Friday. Standard 85%.

| Strategy | Serves | Item | Impact | Item score |
|---|---|---|---|---|
| Grow through referrals | Objectives 1 and 2 | Referral conversations, 2 of 3 | High (3) | 66.7% |
| | | To-do: email three past clients, done | Medium (2) | 100% |
| | | Unplanned win | Low (1) | 100% |
| Sustain my energy | Objective 3 | Training sessions, 3 of 3 | High (3) | 100% |
| | | Late finishes, 3 against a limit of 2 | Medium (2) | 50% |
| Deepen my coaching craft | Objective 2 | Reading, 120 of 100 minutes | Low (1) | 100% (capped) |
| | | To-do: record a session review, not done | High (3) | 0% |

- Grow through referrals = (3 × 66.7 + 2 × 100 + 1 × 100) ÷ 6 = 83.3%.
- Sustain my energy = (3 × 100 + 2 × 50) ÷ 5 = 80.0%.
- Deepen my coaching craft = (1 × 100 + 3 × 0) ÷ 4 = 25.0%.
- Weekly Performance score = (2 × 83.3 + 1 × 80.0 + 1 × 25.0) ÷ 4 = 67.9%, shown as **68%**, below the standard of 85% (a grey week).

**Who sees it:** the person; the coach if progress is shared. Sponsors and leaders never see weekly scores, only the end-of-sprint summary (M6, M19).

---

## M6. Sprint figures

In plain words: the sprint's score is the average of its finished weeks.

- **Average Performance score this sprint** = the mean of the finished weeks' scores (M0.4). Unfinished weeks are not included; Recovery days are not weeks.
- **Weeks at your standard** = finished weeks whose shown score is at or above the standard ("5 of 8").
- **Best week** = the highest finished week. On a tie, the most recent (Claude).
- **Change since last sprint** = this sprint's average (so far) minus the previous sprint's final average, in points, from the rounded figures (M0.1). Shown as a glance figure ("+5", grey "−3").
- **Since you started** (end-of-sprint review): the change in the sprint average, the Hardware score and the count of objectives reached since the person's first sprint (experience rule 16).
- **End-of-sprint summary for sponsors and leaders (Tim, 26 Oct, 17:29 to 17:31):** frozen at the sprint's end (M0.6). It holds only the organisation's Outcome Objective figures (M9) and the score of each Strategy serving them (M4), averaged over the sprint. Nothing else.

---

## M7. Performance standard

In plain words: the standard is the weekly score you count as a good week. 85% means most of your plan, not all of it.

- Set per sprint. Default 85% (decided 21 Oct). Choices 75, 80, 85, 90 or Other, any whole number from 50 to 100 (Tim, 23 Oct).
- A week **at your standard** is a week whose shown score is at or above it. Those weeks are mint; below-standard weeks are neutral grey (Tim, 22 Oct and 26 Oct).
- Known limit: the standard is the person's own choice, not a norm. 85% for one person and 85% for another are not the same achievement, so standards and scores are never compared between people.

---

## M8. Usual range

In plain words: your usual range is the middle half of your recent weeks. A week inside it is a normal week for you.

- Worked out from the person's last 16 eligible finished weeks (M0.5), across sprints (Claude).
- It appears once there are at least 6 eligible weeks. Before that the screen says "Your usual range appears after 6 weeks." (Tim, 26 Oct).
- **Usual range = the 25th to the 75th percentile** of those weekly scores, by linear interpolation (the standard method in spreadsheets and most statistics software), rounded to whole numbers (Claude).
- Example (test case M8-1): weeks 78, 82, 85, 74, 88, 90, 81, 79 give a usual range of 79 to 86%.
- Shown as a pale band on the chart; pointing at it gives "Your usual range is 79 to 86%." (Tim, 26 Oct, 14:37).
- Known limit: with only 6 weeks the band is rough. It settles as weeks are added.

---

## M9. Outcome Objectives: progress, pace and status

In plain words: each Outcome Objective shows how far it has come towards its target, and whether, at the rate so far, it will get there by its date.

Each Outcome Objective is tracked one of three ways (Tim, 22 Oct): a number, a rating out of 10, or a milestone. The figure is updated in each weekly debrief.

### M9.1 Numbers and ratings
- **Start figure:** the figure when the objective was set (for organisation seats, the figure agreed at the First check-in).
- **Progress bar:** from zero to the target, with the current figure filling it (Tim, 26 Oct, 11:36). For an objective that should go down (fewer incidents), the bar shows progress from the start figure towards the target (Claude).
- **Pace (Claude, matching the agreed sentences):**
  - Rate so far = (current − start) ÷ months since it was set.
  - Rate needed = (target − current) ÷ months left to the by-when date.
  - **On pace** when the rate so far is at least the rate needed (for an objective that should go down, the same with the signs reversed).
  - Sentences: "You're on pace to reach 38 by 30 Jun 2027." or "Reaching 9/10 by 30 Jun 2027 needs 0.3 points a month, and you've averaged 0.2." (Tim, 26 Oct, 14:36).
  - Pace is only shown after 3 finished weeks since the objective was set, because results lag effort (Claude, 26 Oct).
  - Months are calendar months of 30.44 days.
- Worked example (test case M9-1): start 20 on 1 Jan 2026, target 38 by 30 Jun 2027, current 31 on 26 Oct 2026. Rate so far 1.12 a month; rate needed 0.86 a month. **On pace.**
- **Target reached:** the current figure is at or past the target. The bar fills mint and the row reads "Target reached" until the person sets a new target (Tim, 26 Oct).
- **Improving this sprint:** the latest figure is better than the figure at the start of the current sprint.
- **Not moving:** the figure has not changed for 3 finished weeks (Tim, 26 Oct, 11:50). Only then can it appear under What's holding you back.

### M9.2 Milestones
- Reached or not reached yet ("You haven't reached this milestone yet."; Tim, 26 Oct, 11:43).
- Time left in the unit that fits (Tim, 26 Oct, 10:47): days under 2 weeks, weeks under 3 months, then months; "due today" and "3 days overdue" at the ends. Calendar time.
- For pace and organisation figures, a milestone is **on track** when it is reached, or not yet due (Claude).

### M9.3 Effort on track
- An objective's **effort is on track** when the Strategies serving it averaged within 3 points of the standard or above it over the finished weeks of the current sprint (Claude, 26 Oct). Used in "The work behind it is on track."

**Who sees it:** the person; the coach if progress is shared; sponsors and leaders only for the organisation's objectives and the development objective, in the end-of-sprint summary.

---

## M10. What's improving and what's holding you back

In plain words: the top of the dashboard lists up to 3 things going well and up to 3 holding you back, each with one action.

Always about the current sprint (Tim, 26 Oct). Most important first.

**What's improving (in this order, up to 3):**
1. Outcome Objectives improving this sprint (M9.1), target reached first.
2. Strategies at or above the standard for the last 3 finished weeks running.
3. A habit kept up (target met) for 4 finished weeks running.
4. Sleep hours or quality up on the previous 4 weeks (M12).

**What's holding you back (in this order, up to 3, each with a one-tap fix):**
1. A Strategy below the standard in each of the last 2 finished weeks ("Plan it into this week").
2. An Outcome Objective not moving (M9.1) while its effort is on track ("Review this Strategy").
3. The habits with the lowest average score this sprint, if under 50% (Claude).
4. Recovery signals going the wrong way (Claude): average sleep down by half an hour or more on the previous 4 weeks, or weekly stress at "Quite a lot" or "Very much" in 2 weeks running.

Empty lists say so plainly (Tim, 26 Oct). Wording follows "name the number, not the person" (Tim, 26 Oct, 11:42).

---

## M11. Streaks, habits kept up and logging

In plain words: streaks count what you keep doing; a break quietly starts again.

- **Debrief streak:** sprint weeks in a row with a finished weekly debrief. Recovery doesn't break it (Claude). A missed week resets it quietly, with no message (decided 21 Oct; experience rule 5).
- **Habit kept up:** a finished week where the habit scored 100% (target met). Shown as "kept up in 6 of 8 weeks" (Claude).
- **Breathing:** Breathe sessions a week, exact count (fixed in Phase 1 step 0).
- **Logging:** a working day is logged when at least one habit was logged for it. "You logged on 4 of your 5 working days this week." (Tim, 26 Oct, 14:38).

---

## M12. Daily and weekly signals

These come from the daily tools and the debrief. None is part of the Performance score.

| Signal | From | How it's summarised | Green means |
|---|---|---|---|
| Sleep hours | Plan my day, "Total hours", half-hour steps | Average a night over the period | Nights of 7 hours or more (adult guideline, claim C20) |
| Sleep quality | Plan my day, Very poor to Very good | The most common answer; on a tie, the middle one (Claude) | Good or Very good |
| Stress | Weekly debrief, Not at all to Very much | Each week's answer, as a line | "Not at all" or "A little" |
| Way of being (for example calm under pressure) | Review my day, 1 to 10 | Average, whole number | 7 or more (Claude) |
| Emotional control | After-action reviews, meeting and feedback reviews, Above or below the line | Share of reviews above the line each week (Tim, 26 Oct) | 70% or more |
| Breathing | Breathe | Sessions a week | Any week with a session (Claude) |

Odd entries (for example 20 hours of sleep) are asked about once and left out of summaries and patterns until confirmed (pattern rule 14). Sensible ranges (Claude): sleep 2 to 14 hours.

---

## M13. Hardware and Software check-in

In plain words: two scores out of 100, from one-tap questions about the past month. Hardware is your body's physiology; Software is your decision-making, emotional control and communication. Higher is always better.

Source: hardware-software-check-in-spec.md (questions agreed by Tim, 22 and 23 Oct). The scoring is copied here exactly.

**Hardware areas (each 0 to 100):**
- Sleep: hours (Under 5 = 0, 5 to 6 = 40, 6 to 7 = 75, 7 to 8 = 100, 8 to 9 = 100, Over 9 = 70) and quality (Very poor 0, Poor 25, OK 50, Good 75, Very good 100), averaged.
- Stress: Never 100, Rarely 75, Sometimes 50, Often 25, Always 0.
- Movement: exercise (None 0, Under 1 hour 25, 1 to 2½ hours 60, 2½ to 5 hours 100, Over 5 hours 100), strength days (0 = 0, 1 = 50, 2 or more = 100), sitting (Under 4 hours 100, 4 to 6 = 75, 6 to 8 = 50, 8 to 10 = 25, Over 10 = 0), averaged.
- Fuel and alcohol: eating (Very poor 0 to Very good 100 in steps of 25), weekly units (None or 1 to 7 = 100, 8 to 14 = 80, 15 to 21 = 45, 22 to 35 = 20, Over 35 = 0), heavy sessions (Never 100, Less than monthly 75, Monthly 50, Weekly 25, Daily or almost daily 0), averaged.
- Mood and energy: the two answers (Very low 0 to Very high 100 in steps of 25), averaged.
- Health: physical health (Very poor 0 to Very good 100) and pain (Not at all 100, A little 75, Moderately 50, Quite a lot 25, Very much 0), averaged.
- Travel is context, not scored. It is marked on the graph.

**Software areas (each 0 to 100):** Never 0, Rarely 25, Sometimes 50, Often 75, Always 100, for each of the six statements.

**Hardware score** = the average of the six Hardware areas. **Software score** = the average of the six Software areas.

**Results (agreed 23 Oct):**
- Last month appears only after the answers (experience rule 50).
- Change = this month's score minus last month's, from the rounded figures.
- **What improved (Claude):** up to 3 areas that rose since last month, biggest rise first.
- **One thing to work on:** the lowest Hardware area. On a tie, in this order: Sleep, Movement, Fuel and alcohol, Stress, Mood and energy, Health (Claude).
- **Flags for the coach, never shown to the client (Tim, 23 Oct):** mood "Very low"; over 35 units a week, or heavy sessions weekly or more; under 5 hours' sleep or "Very poor" sleep two months running; stress "Always"; pain "Quite a lot" or "Very much". No flag when the client has switched the check-in off for their coach.

**Worked example (test case M13-1):** Sleep 7 to 8 hours (100) and Good (75): Sleep 87.5. Stress Sometimes: 50. Exercise 1 to 2½ hours (60), 1 strength day (50), sitting 8 to 10 hours (25): Movement 45. Eating Good (75), 8 to 14 units (80), heavy sessions Never (100): Fuel and alcohol 85. Mood OK (50), energy High (75): Mood and energy 62.5. Health Good (75), pain A little (75): Health 75. **Hardware score = (87.5 + 50 + 45 + 85 + 62.5 + 75) ÷ 6 = 67.5, shown as 68/100.**

**When a change is real (audit, 26 Oct, 18:55):** a single question can move one answer step from month to month by chance. Until there is real data, results say only what moved ("Sleep rose since last month"), never that someone has improved. After 3 months of real check-ins, Claude Code works out each area's typical month-to-month swing in people whose answers are otherwise steady (the "typical error" used in sports science, claim C47), and from then on "What improved" only lists rises bigger than that swing. The swing is recorded in the change log (M22).

**Known limits:** each area is one or two plain questions informed by validated measures, not a validated scale itself (Tim's audit, 22 Oct). The six areas are averaged with equal weight, which is our model. The scores are good for tracking one person's change month to month, not for diagnosis or for comparing people. The cut-points (for example Over 9 hours = 70) are our model, set against public guidelines (claims C20 to C24).

**Who sees it:** the person; their coach by default, unless switched off (Tim, 23 Oct). See M19.4 for organisations.

---

## M14. Patterns in your numbers

In plain words: the portal looks for a small, fixed set of links in your own numbers, such as better weeks after better sleep. It only shows one when the link is big enough to matter, very unlikely to be chance, holds up over time, and has passed tests on thousands of invented people. It never says one thing causes another.

The 23 pattern rules are in START-HERE section 5d. This section sets the exact method behind them (Claude, 26 Oct, following Tim's rules of 11:02 to 11:28).

### M14.1 The fixed list of links (rule 2)
| ID | Possible cause | Result | Data |
|---|---|---|---|
| L1 | Sleep hours: 7 or more against under 7 | That day's day score (M14.2) | Daily |
| L2 | Sleep quality: Good or Very good against the rest | That day's day score | Daily |
| L3 | Each habit: kept up (100%) against not | The weekly score of the Strategy it serves, **worked out without that habit** | Weekly |
| L4 | Weekly stress: "Not at all" or "A little" against the rest | Weekly Performance score | Weekly |
| L5 | Way of being, for example calm under pressure: weekly average 7 or more against under 7 | Weekly Performance score | Weekly |
| L6 | A Strategy at or above the standard against below | Its Outcome Objective's change 2 to 4 weeks later | Weekly |
| Q1, Q2 | Up to 2 of the person's own questions, built from their own habits and measures (rule 21) | Any result above | As chosen |

Coach-only links (rule 18) use the same list, reported in the other direction.

**No link may contain itself (audit, 26 Oct, 18:55).** A habit is part of its Strategy's score (M4), so "weeks you kept the habit" would always show a higher Strategy score, by arithmetic alone. Every result is therefore worked out with the cause taken out: L3 uses the Strategy score without that habit, and L1 and L2 leave any sleep habit out of the day score. The same rule applies to the person's own questions (Q1, Q2): a question whose result already contains its cause is refused, with "That one would always look linked, so it can't be checked."

### M14.2 The day score (only used for L1 and L2)
The Performance score has no daily version on screen. For daily links only, a **day score** is worked out: the impact-weighted share of that day's planned items done (daily habits against their daily target, and the to-dos chosen in that morning's Plan my day). It is never shown as a number, only described in "How was this worked out?" (Claude).

### M14.3 Data used (rules 3, 12, 13, 20)
- The last 26 weeks only (6 months). Eligible weeks and days only (M0.5). Working days only for daily links.
- At least 6 weeks in each group for weekly links, at least 20 days in each group for daily links.
- Odd entries left out until confirmed (M12).

### M14.4 Allowing for getting better (rule 11)
- Weekly results: each week's figure minus the median of the 9 eligible weeks centred on it (fewer at the ends, at least 5). This removes the person's general trend, so a pattern only shows if it beats their overall improvement.
- Daily results: each day's figure minus the average of the same weekday in the 4 weeks either side, so a pattern is never just "Mondays are different" (rule 13).
- What's left after this is called the **residual**. The **usual swing** is the standard deviation of the residuals.

### M14.5 The tests (rules 4 to 6, 15)
A link becomes a pattern card only when **all** of these pass:
1. **Not chance:** a shuffle (permutation) test of the gap between the two groups' average residuals, 10,000 shuffles, two-sided. Weekly data is shuffled within blocks of 8 neighbouring weeks; daily data within the same weekday, so the shuffle respects time and the weekly rhythm.
2. **Corrected for checking many links:** the Benjamini and Hochberg false discovery rate, across every link checked for that person that week, at 5% (claim C33).
3. **Big enough to matter:** the gap is at least half the usual swing, and at least 3 points when the result is a Performance score.
4. **Holds up:** splitting the eligible data into its earlier and later halves, each half has at least 3 weeks (or 10 days) in each group, and the gap points the same way in both halves and is at least a quarter of the usual swing in each.
5. **Cause before result:** L1, L2, L3 and L6 have the cause first by design (sleep before the day, the habit inside its Strategy's week, the Strategy 2 to 4 weeks before its objective). L4 and L5 are measured over the same week, so their order can't be shown; they must pass the **Strong** level below to appear (Claude).
6. **Positive only for the person (rule 7):** only links where the better group has the better result show to the client. Links in the other direction can only reach the coach (rule 18).

**Strength in words (rule 15):** **Strong link**: corrected chance under 1 in 100 and a gap at least as big as the usual swing. **Clear link**: passes every test above. Nothing weaker is shown.

### M14.6 Staying steady (rules 6, 17, 19, 23)
- Everything is recomputed from scratch each week, and the night after any edit.
- A card stays for at least 4 weeks once shown, unless it clearly fails: corrected chance over 1 in 5, or the gap reverses (Claude).
- At most 4 cards. At most one new card a week, introduced in the weekly debrief.
- **Looking every week raises the chance of a false card (audit, 26 Oct, 18:55).** The 5% correction holds for one look. Checking again every week for 26 weeks, and keeping a card for 4 weeks once shown, gives chance many more openings. So the real safeguard is the simulation in M14.7, which counts a false card at **any** weekly check over 26 weeks, with the 4-week rule switched on. The thresholds are set from that result, not from the 5% alone.

### M14.7 Proof before go-live (rule 10)
Claude Code runs the engine on invented people before go-live, and reports the results in its summary:
- **No real links:** 5,000 invented people, 26 weeks each, with realistic noise, good and bad spells that run on from week to week (autocorrelation), gaps in logging, slow improvement, Recovery weeks, and habits nested inside Strategies exactly as the portal stores them, but no real links. Target: fewer than 1 in 20 of them ever see a pattern card in 26 weeks. If the target fails, the corrected chance threshold is tightened until it passes, and the change is logged (M22).
- **Planted links:** 1,000 invented people with one planted link the size of their usual swing and at least 12 weeks in each group. Target: at least 8 in 10 found.
- The shuffle test, the correction and the trend removal each get their own test cases with known answers.

### M14.8 "How was this worked out?" (rule 8)
Every card explains, in plain words: the two groups and how many weeks or days are in each, each group's average, the person's usual swing, how unlikely chance is ("about 1 in 300"), and that it held in both halves.

**Known limits:** a pattern is a link in one person's own numbers, never proof of cause. Something else may drive both (a busy season, illness). That is why the wording is "in weeks you…", never "because".

---

## M15. Goal check (in Find my sweet spot, and at the end of each sprint)

In plain words: each Outcome Objective is rated on four reasons for going after it. The mix shows whether it is driven mostly by your own reasons or mostly by pressure. Reasons change, so it is asked again each sprint.

From self-concordance research (claims C4 and C5); four reasons, each 1 to 5 (Tim, 26 Oct, 17:02 and 17:12):
- "I enjoy it" (intrinsic) and "It matters to me" (identified): **own reasons** = their average.
- "I'd feel guilty or anxious if I didn't" (introjected) and "Someone else wants it, or it brings a reward" (external): **pressure** = their average.
- **Balance** = own reasons − pressure, from −4 to +4.

Wording (Claude, using the three agreed sentences plus one for when neither is strong):
| Balance and levels | Sentence |
|---|---|
| Balance +1.5 or more | "is driven mostly by your own reasons" |
| Balance −1.5 or less | "is driven mostly by pressure" |
| Otherwise, with own reasons 3 or more | "has your own reasons and some pressure too" |
| Otherwise, with both under 3 | "doesn't have a strong reason behind it yet" (new; Tim to confirm when the tool is built) |

- An organisation objective "driven mostly by pressure" flags the coach to raise it (Tim, 26 Oct, 17:26). Never the sponsor.
- Totals for organisations follow M19.4.
- Known limits: four single items, not the full research questionnaire; a self-report that people may answer as they think they should.

---

## M16. Answers from feedback links

In plain words: answers people give through a feedback link are shown beside the person's own, word for word. They are not scored unless the tool says so.

- Find my sweet spot, Understand their sweet spot and the other link tools (decided 26 Oct, 17:15 to 17:18) show answers as written, beside the person's own perspective.
- Ratings collected by link (for example the Life balance review from a partner, or Map my team) are averaged per item and shown beside the person's own rating, with the number of answers.
- A giver's name is hidden from others when 3 or more people answer, as in the 360 (Claude, 26 Oct, 17:18).
- Each tool's link questions and any scoring are written into this document when the tool is rebuilt.

---

## M17. Before and after impact

In plain words: at the start and end of coaching, the sponsor and 2 or 3 colleagues rate the same few behaviours. The change becomes one of the organisation's measures. It shows change, not proof that coaching caused it.

Agreed by Tim, 26 Oct, 17:18; the details are Claude's calls.
- **Behaviours:** 3 to 5, agreed with the sponsor before the First check-in and linked to the organisation's objectives. Written as things others can see ("Makes decisions in good time").
- **Raters:** the sponsor plus 2 or 3 colleagues the person chooses. The same people at the start and the end where possible.
- **Question:** "How often does [first name] do this?" Never, Rarely, Sometimes, Often, Always, scored 0, 25, 50, 75, 100 (the same scale as the check-in).
- **At the end** each rater also answers, for each behaviour, "Looking back, how often did [first name] do this at the start?" This allows for people changing their idea of what "Often" means once they've seen what good looks like (response shift, claim C27). The "looking back" rating has its own bias (people tend to remember the start as worse than it was), so both changes are reported and neither is relied on alone; the main figure is the end rating minus the start rating.
- **Change** = the average across behaviours and raters, end minus start, in points.
- **Improved** = a change of 10 points or more (Claude: about half a step on the scale).
- At least 2 raters must answer at both the start and the end, or the result reads "Not enough answers yet."
- **Who sees it:** the person and their coach. The organisation sees only totals across people (M19).
- Known limits: raters know coaching is happening; no comparison group; small numbers of raters.

---

## M18. Team pulse

In plain words: a boss sends a short check-in link to their team every so often. Answers are anonymous unless someone chooses to add their name. The boss sees team totals over time, each with one small next step.

Decided by Tim, 26 Oct, 17:35 to 17:38. The question wording below is a first draft (Claude), in performance language, for Tim to confirm with the M17 mock-up.

**The short pulse, about 2 minutes:**
| Measure | Draft question (period follows the rhythm, for example "In the past month") | Answers, scored 0 to 100 |
|---|---|---|
| Energy to perform | How much energy have you had to perform at your best? | Very low 0 to Very high 100 |
| Sleep | How would you rate the quality of your sleep? | Very poor 0 to Very good 100 |
| Stress | How often did you feel tense, restless, nervous or anxious? | Never 100 to Always 0 |
| Workload | How often was your workload manageable? | Never 0 to Always 100 |
| Support | How often did you have the support you needed to perform? | Never 0 to Always 100 |
| Open comment | What would help the team perform better? | Written, optional |

- Or the boss sends the full Hardware and Software check-in instead; its totals use M13.
- Up to 3 of the boss's own questions: a 1 to 10 rating (shown as an average out of 10) or a short written answer.
- **Team figure** = the average of the answers to each measure. Change = this time minus last time, from the rounded figures.
- Shown with the number of answers and how many it went to ("from 6 of 8").
- **Totals show at any number of answers (Tim, 17:35).** When the group is small, the page people answer on says: "Your answers are anonymous, but in a small team your boss may be able to guess who answered." (Claude).
- Named answers (the person's choice, made fresh each time) also show individually to the boss.
- Comments shown as written, without names, in a random order.
- Each result ends with one small next step for the boss, chosen from the lowest measure (for example "Ask your team what would ease the workload.").
- Nothing in the pulse asks about risk or harm (experience rule 51).
- Known limits: a few answers can swing a lot; people may answer as they think the boss wants; single plain questions, not validated scales.

---

## M19. Organisation figures (the four KPI layers)

In plain words: an organisation sees how its people are doing as totals by team, never one person's data. It leads with outcomes. Coaching contributes to these results alongside many other things, so every report says so.

Agreed by Tim, 26 Oct, 16:37 to 17:42. Leaders see the teams they are given, and every team below them (Claude, 17:33).

### M19.1 The headline (Tim, 26 Oct, 17:31 and 17:39)
**% of agreed Outcome Objectives on track or reached** across all seats in scope.
- Counts the organisation's objectives and the development objective on each seat. Not a person's own habits or anything else.
- **On track** = on pace (M9.1) or, for a milestone, not yet due (M9.2). **Reached** = target reached or milestone reached.
- **Too early to tell** = set less than 3 finished weeks ago. Left out of the percentage and shown as a count beside it ("4 too early to tell") (Claude).
- Uses each person's latest end-of-sprint summary (M0.6), so the figure changes as each person's sprint ends. The page says "As at each person's last finished sprint." (Claude).
- Example (test case M19-1): 40 objectives; 6 too early; of the other 34, 21 on track and 5 reached. Headline = 26 ÷ 34 = 76%.

### M19.2 Each team
The same figure for each team, then for each team below it. Shown at any team size, because it is built from the objective figures sponsors already see (M6).

### M19.3 The four layers
| Layer | What it shows | Worked out as | Shown for |
|---|---|---|---|
| 1 Use | Plans in place, sprints running, debriefs done | % of seats with a plan (a mission, at least 2 objectives and a Strategy); % with a sprint running; % of finished seat-weeks with a debrief | **Groups of 3 or more seats only** (Claude: for a team of 1 or 2 this would show one person's use of the portal, which the "never feel monitored" rule forbids) |
| 2 Behaviour | Follow-through and Strategy consistency | % of seats averaging at or above their own standard last sprint; average Strategy score; team pulse measures (M18) | Any size for Strategy scores; pulse as M18 |
| 3 Outcomes | Results moving | The headline (M19.1); before and after impact (M17): average change and % of people improved; Health Check alignment over versions (M20) | Any size |
| 4 Organisation | Measures agreed before starting | Each measure's baseline, target, by-when date and latest figure, entered in the coach portal with its source (for example retention of key people, time for new hires to get up to speed, promotions from within) | As agreed |

### M19.4 Self-reported figures (goal check, before and after, wellbeing)
- Goal check and before and after ratings: shown only as anonymous group totals, never who said what, at any group size (Tim, 26 Oct, 17:35).
- **The monthly Hardware and Software check-in never reaches an organisation, not even as a total (Tim, 26 Oct, 18:48),** keeping the promise "Your organisation never sees them."
- **Unless the person chooses (Tim, 26 Oct, 18:48):** anyone can make their own wellbeing visible to their organisation. It then shows **named**, never anonymous: their Hardware and Software scores and areas, latest and over time. Never their answers, written goals or coach flags. Off by default, switched on and off on the "What [sponsor] sees" page, and switching it off hides past months too (Claude).
- Otherwise, organisation wellbeing comes only from the team pulse (M18).

### M19.5 What every organisation report says (from M21)
- "Coaching contributes to these results alongside many other things. These figures show change over the same period, not proof of cause."
- The number of people and answers behind each figure.
- The methods version, and a link to "How it works".

### M19.6 Comparison with teams not being coached (Tim, 26 Oct, 17:31)
- Only where the organisation shares the same figures for other teams. **Visible only to Tim in the coach portal.**
- The change over the same period for coached and uncoached groups, side by side, with group sizes. Described, never claimed as cause; groups were not randomly assigned.

---

## M20. Tools that already score today

The live portal already scores two tools. Their rules are not changing in the overhaul, so this section documents them from the code as it is on 27 Oct 2026, with test cases (completed in Phase 1). The arithmetic stays in the code that does it today (`src/lib/alignmentScore.js` and `src/lib/wheelOfLife.js`); `src/lib/scores/m20.js` brings it together under this section's ID, and `tests/scores/scores.test.mjs` checks every rule below. The old strategic alignment tool's progress scale, Stop Doing hours, the Meeting planner's end time and "N of 5" are fixed in their rebuilds, and written in here then.

### M20.1 Strategic Alignment Health Check

In plain words: each project is scored on how much it helps the organisation's Critical Success Factors, which gives its strategic importance. Projects are also rated for progress and the resource they need. Important projects that are behind come first in the list of what needs attention.

**Ratings, from the person filling it in:**
- **Contribution:** for each project, a score of 0 to 3 against each Critical Success Factor.
- **Progress:** 1 Embryonic stage, 2 Bad, 3 Fair, 4 Good, 5 Excellent.
- **Resource required:** 1 Minimal, 2 Low, 3 Moderate, 4 High, 5 Very high.

**Strategic importance (0 to 100%)** = the project's contribution scores added together ÷ (the number of Critical Success Factors × 3) × 100.
- Only factors still on the list count. A score for a deleted factor is ignored, and the maximum uses the current number of factors.
- Kept exact; shown as a whole number (halves up).
- A project is **rated** once it has at least one contribution score for a current factor. An unrated project shows "Not rated", never 0%, on the page and the PDF alike, and is left out of averages.
- Example (test case M20-1): "Data platform" scores 0 + 2 + 2 + 3 = 7 against 4 factors, so the maximum is 4 × 3 = 12, and 7 ÷ 12 × 100 = 58.33%, shown as **58%**.

**Most in need of attention** = importance % × (5 − progress) ÷ 4 × (resource + 3) ÷ 8.
- Progress 1 (Embryonic) keeps the full importance; progress 5 (Excellent) scores 0.
- The resource multiplier runs from 0.5 (Minimal) to 1 (Very high): 0.5, 0.625, 0.75, 0.875, 1.
- A blank resource counts as Moderate (3), in the score and in the tie-break alike (fixed in Phase 1 step 0).
- A project with no progress rating scores −1, so it sorts last.
- The score stays out of 100.
- **Ranking and tie-break:** highest attention score first; on a tie, the higher importance; then the higher resource (a blank counting as Moderate).
- Examples (test case M20-2): Data platform (58.33%, Embryonic, Very high) = 58.33 × 4 ÷ 4 × 8 ÷ 8 = **58.33**. Leadership programme (41.67%, Bad, High) = 41.67 × 3 ÷ 4 × 7 ÷ 8 = **27.34**. Two projects at 50% with Fair progress: with resource Very high, 50 × 2 ÷ 4 × 8 ÷ 8 = 25.00, which ranks above resource Low, 50 × 2 ÷ 4 × 5 ÷ 8 = 15.63.

**Where a project sits on the importance against progress chart:**
- **Important and moving well** (green): importance above 50% with Good or Excellent progress.
- **Important but behind** (needs attention first): importance above 50% with Embryonic or Bad progress.
- Everything else is neutral: 50% or less, Fair progress (which sits on the line), or no progress rating. Exactly 50% is not above the line.
- Only projects with a progress rating are drawn on the chart.

**At a glance (PDF):** average strategic importance = the mean of the rated projects' exact importance, rounded; 0% when none is rated. The sentence counts the projects drawn that are important and moving well, and those important but behind.

**Alignment over time (M19.3; Claude, not in the code yet):** for each version of a team's Health Check, the share of its rated projects (rated, with a progress rating) that are important and moving well.

### M20.2 Life balance review (was Wheel of Life)

In plain words: the person rates how satisfied they are with each area of their life, from 0 to 10. The review shows what rose and fell since the start of the period, and how far each area is from any target set. There is no overall score.

**Areas:** the ten standard areas, in wheel order: Career / Work, Financial / Money, Health / Fitness, Relationships / Family, Romance / Partner, Personal Growth / Learning, Fun / Recreation, Physical Environment / Home, Contribution / Community, Purpose / Meaning. People can add their own areas (1 to 24 characters), which come after the standard ones in the order added. An area can be taken off the wheel and put back; its past scores are kept.

**Ratings:** each area **0 to 10** (the code and database allow 0; the earlier draft of this section said 1 to 10). Targets are also 0 to 10, one per area, optional.

**Figures, over the check-ins in the chosen period** (3, 6 or 12 months, or All, counted back from the newest check-in), for the areas on the wheel now:
- **Average** = the mean of the area scores present, ignoring areas with no score; shown to one decimal place ("6.6"). It is 0 when there are none.
- **Change for an area** = its latest score − its first score in the period. An area with no first score shows "New".
- **One check-in in the period:** Average, Highest, Lowest, and Areas at 7+ (areas scoring 7 or more, out of the areas on the wheel).
- **Two or more:** Average and how far it moved from the first check-in; Biggest rise; Biggest drop (areas with no first score are left out of both); Lowest now. When any area with a latest score has a target, the fourth figure becomes Furthest from target (or All met), with how many are on target.
- **On target:** the latest score is at or above the target; otherwise "N below".
- **Ties** go to the first area in wheel order.
- **The "what moved" view:** the bars are scaled to the biggest change in the period, at least 3. On the chart, areas that went up show in mint, and the last check-in is a faint outline.
- Example (test case M20-3, the mock-up's data, 8 May to 15 Oct 2026): average 6.6, up from 5.7; biggest rise +2, Relationships / Family; biggest drop −1, Fun / Recreation; furthest from target 2 below, Romance / Partner; 6 of 10 on target. With only 15 Oct: highest 8, Career / Work; lowest 4, Fun / Recreation; 6 of 10 areas at 7+.

**Who sees it:** the person only, unless they choose to share (unchanged in Phase 1).

---

## M21. Known limits, said plainly

These are said wherever the figures are explained, in "How it works", and in every organisation report (Tim, 26 Oct, 16:47: weak or mixed evidence is said plainly).
1. **The Performance score measures follow-through, not results.** It shows how much of your own plan you did. Results are tracked separately, as Outcome Objectives.
2. **Plans, targets, impact levels and standards are each person's own.** Scores are never compared between people, and the portal never ranks anyone.
3. **The weightings are our model.** Impact 1, 2 and 3, and counting a Strategy once for each objective it serves, are sensible choices, not findings from research.
4. **Most figures are self-reported.** They are as honest as the person entering them, which is why nothing is used to judge anyone (performance, never HR; Tim, 26 Oct, 17:42).
5. **Pace assumes steady progress.** Real results often come in steps.
6. **Patterns are links, not causes.**
7. **Check-in and pulse questions are plain single questions** informed by validated measures. They track change for one person or team; they don't diagnose.
8. **Organisation figures show change alongside coaching, not proof coaching caused it.**
9. **Small groups:** totals from a few people can swing a lot, and may let others guess who answered.
10. **Easy targets give high scores.** A plan with soft targets scores well without much effort. Targets are reviewed with the coach at each sprint's end, and the Outcome Objectives, not the Performance score, show whether results are moving.
11. **None of the portal's own scores has been validated yet.** Each is built from sound parts, and M23 says how each will be checked against real data.

---

## M23. Checking the scores against real data (audit, 26 Oct, 18:55)

In plain words: once real people use the portal, we check that the scores behave as they should, and say so honestly either way.

Run by Claude Code on anonymised data, results to Tim only, and recorded in the change log (M22). The findings are only ever described, never used to judge anyone.
1. **Does follow-through go with results?** After 2 full sprints across at least 30 people: whether people's Strategy scores go with their Outcome Objectives moving 2 to 4 weeks later (the same idea as pattern L6, across people). If it doesn't, the weightings are revisited.
2. **How steady are the check-in answers?** After 3 months: each area's typical month-to-month swing (M13), which sets what counts as a real change.
3. **Do patterns stay rare?** Every 3 months: the pattern engine is rerun on everyone's real data with the labels shuffled. False cards must stay under 1 in 20 people, as in the simulation (M14.7).
4. **Before and after impact:** once 20 people have both ratings, how far the "looking back" rating and the start rating differ, to see how much response shift there is.
Until each check has run, the "How it works" page says the score is "not yet checked against real data".

---

## M22. Change log

| Version | Date | Change |
|---|---|---|
| 1.1 (repo) | 27 Oct 2026 | M20 completed from the code in Phase 1 (Health Check: strategic importance, attention score, tie-break, chart areas, the PDF's average; Life balance review: areas, 0 to 10 ratings and every figure worked out). No arithmetic changed. |
| 1.1 | 26 Oct 2026 | Scientific audit (Tim, 18:47): no pattern may contain its own cause (L3 uses the Strategy score without that habit; sleep habits left out of the day score); each half needs 3 weeks or 10 days per group; weekly re-checking named as a risk and covered by the any-time simulation; autocorrelation and nested habits added to the simulation; check-in changes judged against each area's typical swing once real data exist (M13); the bias in "looking back" ratings stated (M17); organisations never see check-in totals, only named wellbeing a person chooses to share (Tim, 18:48; M19.4); two new limits (easy targets, not yet validated) and a plan for checking the scores against real data (M23). |
| 1.0 | 26 Oct 2026 | First version, from the decisions doc (21 to 26 Oct) and Claude's calls listed below. |

### Claude's calls in version 1.0 (for Tim to change if he wants)
1. Comparisons with the standard use the rounded figure people see (M0.1).
2. A change to the working pattern applies from the next sprint week (M0.3).
3. A week interrupted by Recovery carries on afterwards (M0.4).
4. Thin weeks for someone working fewer than 4 days: fewer than all their working days logged (M0.5).
5. Frozen summaries keep the figures as sent; later edits change only the person's own view (M0.6).
6. A limit of 0: one over scores 0% (M1).
7. Ratings scored on the part of the scale above the floor (M1).
8. Limits and ratings need half the working days logged, otherwise "Not logged" (M1).
9. A to-do done early counts in the week it was done (M2).
10. A Strategy with nothing in it that week is left out, not 0% (M4); a Strategy always counts at least once (M5).
11. "So far" scoring during the week (M5).
12. Best week ties go to the most recent (M6).
13. Usual range = 25th to 75th percentile of the last 16 eligible weeks (M8).
14. Pace = rate so far against rate needed; shown after 3 finished weeks (M9).
15. Effort on track = within 3 points of the standard (M9.3).
16. The detail of what's improving and what's holding you back (M10).
17. Recovery doesn't break the debrief streak; "kept up" means target met (M11).
18. The green thresholds for the way of being and breathing (M12).
19. What improved and the tie order for one thing to work on (M13).
20. The whole pattern method: groups, trend removal, shuffle test, correction, halves, Strong level for same-week links, steadiness and the proof targets (M14).
21. Goal check balance and the fourth sentence (M15).
22. Before and after impact details, including the "looking back" rating and the 10-point threshold (M17).
23. Team pulse draft questions and scoring (M18).
24. Organisation headline details, "too early to tell", and use figures only for groups of 3 or more (M19).
25. (Settled by Tim, 26 Oct, 18:48: organisations never see check-in totals; a person can choose to share their own wellbeing, named.) Sharing is off by default, shows scores and areas only, and switching it off hides past months too (M19.4).
