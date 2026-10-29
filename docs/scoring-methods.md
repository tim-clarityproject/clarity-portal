# Methods: how every score in The Clarity Portal is worked out

Version 1.4 (draft for the build), written 26 Oct 2026, 18:16 onwards, by Claude for Tim (Dr. Tim Dutton, The Clarity Project LTD); scientific audit the same evening; Tim's decisions of 26, 27 and 28 Oct added (see M22).

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
- **Organisation seats (Tim, 26 Oct, 23:49):** anyone in a seat an organisation pays for has a fixed standard of 85%; they can't change it. People who pay for themselves choose their own, 50 to 100, 85 suggested.
- How it's kept (Claude, 27 Oct): while someone holds an active, confirmed seat, every new sprint and every change to a sprint's standard is saved as 85, and their running sprint is set to 85 when they take up the seat. A different figure is set to 85 rather than refused, so a save made before they joined keeps its other changes. Finished sprints keep the standard their weeks were scored at. Someone who leaves keeps 85 until they change it. Whether a coach can change it for one person is Tim's open question.
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
2. **Corrected for checking many links:** the Benjamini and Hochberg false discovery rate, across every link checked for that person that week, at 5% (claim C33). Tightened to 2.6% by the go-live simulation (M22, 27 Oct 2026).
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
- **Planted links:** 1,000 invented people with one planted link and at least 12 weeks in each group. **Target: at least 3 in 4 found for a link of 2 usual swings** (Tim, 27 Oct, 14:20, "rare but right"; was 8 in 10 at one swing, which half a year of data can't reach without too many false cards).
- **Rare but right (Tim, 27 Oct, 14:20):** the corrected chance threshold is 2.6% (set by the simulation, M22). Pattern cards are rare and appear only for strong links; How it works says so plainly: "A card only shows when a link is strong enough that it's very unlikely to be chance. Smaller links may be real but can't be told apart from normal ups and downs in half a year."
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
| Calm (shown as Calm; the question asks about stress) | How often did you feel tense, restless, nervous or anxious? | Never 100 to Always 0, so higher is calmer and every pulse figure reads higher is better (Claude, 26 Oct) |
| Workload | How often was your workload manageable? | Never 0 to Always 100 |
| Support | How often did you have the support you needed to perform? | Never 0 to Always 100 |
| Open comment | What would help the team perform better? | Written, optional |

- Or the boss sends the full Hardware and Software check-in instead; its totals use M13.
- Up to 3 of the boss's own questions: a 1 to 10 rating (shown as an average out of 10) or a short written answer.
- **Team figure** = the average of the answers to each measure. Change = this time minus last time, from the rounded figures.
- Shown with the number of answers and how many it went to ("from 6 of 8").
- **One link for the whole team, open for 7 days** (Claude, 26 Oct).
- **Results show only once the pulse closes, and only with 3 or more answers (Tim, 27 Oct, 14:20; replaces totals at any number, 26 Oct, 17:35).** Totals that changed after each answer would let a boss work out one person's answers. This covers the measures, the boss's own questions and the comments. With fewer than 3 answers the boss sees only "2 people answered, so the results stay private." When the group is small, the page people answer on still says: "Your answers are anonymous, but in a small team your boss may be able to guess who answered." (Claude).
- Named answers (the person's choice, made fresh each time) also show individually to the boss, as they come in.
- **When only 1 or 2 people stayed anonymous beside named answers, the results stay private too** (Claude, 27 Oct): the totals minus the named answers would give their answers away. The boss sees "4 people answered, but only 2 without a name, so the results stay private." The number of answers shows only once the pulse has closed, and a pulse can't be extended or reopened. Each figure (a measure, or one of the boss's own rating questions) follows the same rule on the answers to that question, so someone skipping a question never leaves one person's answer on show; the next step comes from the lowest figure that shows.
- **Known limit (break-it test, 27 Oct):** a pulse link is anonymous, so nobody can tell who answers it. A boss can't answer their own pulse while signed in, but one who opened the link signed out and answered it twice themselves could work out the one real answer. Say so plainly in How it works; the protection is that pulses go to whole teams, and that bosses are told the results exist to help the team, not to find out who said what.
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
- **Unless the person chooses (Tim, 26 Oct, 18:48):** anyone can make their own wellbeing visible to their organisation. It then shows **named**, never anonymous: their Hardware and Software scores and areas, latest and over time. Never their answers, written goals or coach flags. Off by default, switched on and off on the "What [sponsor] sees" page, and switching it off hides past months too (Claude). **Chosen separately for each organisation** a person has a seat in, one switch each (Tim, 27 Oct, 14:20). Switching one off hides past months from that organisation only. The earlier single switch became a switch for each organisation the person was in when it moved, which was exactly its reach (Claude). Leaving an organisation switches its wellbeing off, so rejoining never shares it again without a fresh choice (Claude).
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

The live portal already scores two tools. Their rules are not changing in the overhaul, so this section documents them from the code as it is on 27 Oct 2026, with test cases (completed in Phase 1). The arithmetic stays in the code that does it today (`src/lib/alignmentScore.js` and `src/lib/wheelOfLife.js`); `src/lib/scores/m20.js` brings it together under this section's ID, and `tests/scores/scores.test.mjs` checks every rule below, with the Health Check's version 1.4 rules in `tests/scores/m20-health-check.test.mjs`. The old strategic alignment tool's progress scale, Stop Doing hours, the Meeting planner's end time and "N of 5" are fixed in their rebuilds, and written in here then.

### M20.1 Strategic Alignment Health Check

In plain words: each project is scored on how much it helps the organisation's Critical Success Factors, which gives its strategic importance, counting the CSFs that matter most more. Projects are also rated for progress and the resource they need. Each Health Check sets its own line for "important". Important projects that are behind come first in the list of what needs attention. The results open with one headline figure and up to three questions, which hold up a mirror of what was rated and never judge (rule 65).

**Ratings, from the person filling it in:**
- **CSF level (Tim, 28 Oct, 14:27 and 14:40; version 1.4):** for each Critical Success Factor, how much it matters to the objective: 3 Critical, 2 Very important or 1 Important. Very important unless changed. The lowest level is "Important", never "Not important" (Claude; rule 65).
- **Contribution:** for each project, a score of 0 to 3 against each Critical Success Factor.
- **Progress:** 1 Embryonic stage, 2 Bad, 3 Fair, 4 Good, 5 Excellent.
- **Resource required:** 1 Minimal, 2 Low, 3 Moderate, 4 High, 5 Very high.

**Strategic importance (0 to 100%)** = Σ(contribution × weight) ÷ Σ(3 × weight) × 100, over the Critical Success Factors on the list (version 1.4).
- **The weights:** Critical counts 1.4, Very important 1.2 and Important 1 (Tim, 28 Oct, 14:40: "important = 100%, v important = 120%, critical = 140%"; first set at 3, 2 and 1 at 14:27). So a Critical CSF counts 40% more than an Important one, and a Very important one 20% more. The code sums with the same weights as whole numbers in the same ratio (7, 6 and 5), so the sums are exact.
- **Older Health Checks are unchanged:** with every CSF at Very important, every weight is the same and the formula is exactly the one before 1.4, the contribution scores added together ÷ (the number of CSFs × 3) × 100. A CSF with no level saved reads as Very important, so every older Health Check scores as before (tested to the last decimal place).
- Only factors still on the list count. A score for a deleted factor is ignored, and the maximum uses the current factors and their weights. Removing a CSF removes its weight with it (and Undo puts both back).
- Kept exact; shown as a whole number (halves up).
- A project is **rated** once it has at least one contribution score for a current factor. An unrated project shows "Not rated", never 0%, on the page and the PDF alike, and is left out of averages.
- Example (test case M20-1): "Data platform" scores 0 + 2 + 2 + 3 = 7 against 4 factors, so the maximum is 4 × 3 = 12, and 7 ÷ 12 × 100 = 58.33%, shown as **58%**.
- Example (test case M20-4, the mock-up's invented results, version 1.4): CSF levels Critical, Very important, Very important, Important, so weights 1.4, 1.2, 1.2 and 1, and the maximum is 3 × 4.8 = 14.4. "Customer success programme" rated High, High, Low, Medium (3, 3, 1, 2): 4.2 + 3.6 + 1.2 + 2 = 11, and 11 ÷ 14.4 × 100 = 76.39%, shown as **76%** (75% unweighted). "New office fit-out" rated None, None, Low, Low: 1.2 + 1 = 2.2, and 2.2 ÷ 14.4 × 100 = 15.28%, shown as **15%** (17% unweighted). Also Pricing review 57% (58% unweighted) and Enterprise sales team 83% (unchanged).

**Most in need of attention** = importance % × (5 − progress) ÷ 4 × (resource + 3) ÷ 8.
- The progress gap (5 − progress) is 3 for Bad, 2 for Fair, 1 for Good and 0 for Excellent. **Embryonic counts as 2.5** (Tim, 27 Oct, 14:36: below Bad, above Fair; was 4), because a project that has only just started is too early to tell, not furthest behind.
- The resource multiplier runs from 0.5 (Minimal) to 1 (Very high): 0.5, 0.625, 0.75, 0.875, 1.
- A blank resource counts as Moderate (3), in the score and in the tie-break alike (fixed in Phase 1 step 0).
- A project with no progress rating scores −1, so it sorts last.
- The score stays out of 100.
- **Ranking and tie-break:** highest attention score first; on a tie, the higher importance; then the higher resource (a blank counting as Moderate).
- Examples (test case M20-2): Data platform (58.33%, Embryonic, Very high) = 58.33 × 2.5 ÷ 4 × 8 ÷ 8 = **36.46** (was 58.33 before 27 Oct). Leadership programme (41.67%, Bad, High) = 41.67 × 3 ÷ 4 × 7 ÷ 8 = **27.34**. Two projects at 50% with Fair progress: with resource Very high, 50 × 2 ÷ 4 × 8 ÷ 8 = 25.00, which ranks above resource Low, 50 × 2 ÷ 4 × 5 ÷ 8 = 15.63.

**The line for important (Tim, 28 Oct, 14:25; version 1.4):** each Health Check sets its own line, 30% to 80% in steps of 10, 50% (suggested) unless changed. A project is **important** when its strategic importance is above the line. Exactly at the line is not above it. A Health Check with no line saved reads as 50%, so every older one is unchanged. Every rule below that says "above the line" uses this line: the four states, too early to tell, the headline and the questions. When two versions of a Health Check are compared, each keeps its own line, and the comparison says so if they differ (Claude).

**Where a project sits on the importance against progress chart:**
Four states (Tim, 27 Oct, 08:33 and 14:36, after Adie's feedback; was three). How each is drawn changed with M7b version 3 (Tim, 27 Oct, 15:41 to 15:51), so the 26 Oct design rules hold: mint means good, coral is never a data colour, "needs you" is an outline and never a fill, and there is no key on screen. Each state has a fixed name in the code:
- **Moving well** (`moving_well`): importance above the line with Good or Excellent progress. A filled mint dot.
- **Needs managing** (`needs_managing`): importance above the line with Fair progress. An outline in the text colour. Peach (#FFBD9E) is no longer used.
- **Needs attention** (`needs_attention`): importance above the line with Bad progress. A soft coral outline with a second fine ring, never a fill.
- **Less important, or too early to tell** (`less_important`): at or below the line at any progress, or Embryonic at any importance. A grey ring. Exactly at the line is not above it. An Embryonic project above the line is **too early to tell**; one at or below it is less important.
- **Every dot's outline is 1.5px** (Tim, 28 Oct, 14:34); the grey alone shows a dot is below the line.
- **Dot size shows resource (version 1.4):** Minimal or Low small, Moderate middle, High or Very high large. A blank resource counts as Moderate.
- Only projects with a progress rating are drawn on the chart.
- **On screen there is no key** (26 Oct, 11:37): each area is named where it sits (Needs attention, Needs managing and Moving well along the top, Less important at the bottom), and each dot's pop-up gives "Project 3", its name, its state and its figures. **The PDF keeps a key in words** (PDF rules 18 and 21), using the same four names.
- **Definitions:** each Progress, Contribution and Resource level has one short line shown under its choice on the rating screen and in the PDF's notes (drafted by Claude, edited and approved by Adie Shariff; Tim, 27 Oct).
- These rules apply to every Health Check, including ones finished before the change, when they're reopened; the answers given don't change, only how they're shown (Tim, 27 Oct, 14:36).

**Project dates (Tim, 27 Oct, 15:43; not scored):** each project can store the month and year it started, the month and year it's due to finish or "Open-ended", and optionally an exact date for either. All are optional. They're saved with the project in the Health Check's answers (no database change), asked one project at a time in the rating steps, and shown under each project's name on the one-pager and in the PDF: "Started Mar 2025", then "Due to finish Jun 2027" or "Open-ended, with no agreed finish date". An exact date shows as "Due to finish 30 Jun 2027". A due month before the start month is refused with a calm line.

**At a glance (PDF):** average strategic importance = the mean of the rated projects' exact importance, rounded; 0% when none is rated. The sentence counts the projects drawn that are moving well, and those that need attention.

**The headline (Tim, 28 Oct, 14:05 and 14:17; version 1.4):** the important projects are every project above the line with a progress rating, including those too early to tell, so the parts always add up to the total.
- Large: "[moving well] of [important]", for example "2 of 5".
- Then "important projects are moving well." ("is" when 1 is moving well).
- Then one line of the rest, in this order, each only when there is one: "1 needs managing, 1 needs attention and 1 is too early to tell." ("need" and "are" for more than one).
- With none important: "0", then "None of your important projects is under way yet."
- Example (the mock-up's invented results, line 50%): "2 of 5", "important projects are moving well.", "1 needs managing, 1 needs attention and 1 is too early to tell."

**The questions to start with (Tim, 28 Oct, 14:00 to 15:26; version 1.4):** up to three, the most urgent first, in this order. Each kind is asked about at most once, and a project named once isn't named again. Each reason says what was rated, as a mirror, never that something doesn't matter (rule 65). Dates read as Mon YYYY.
- **Timing:** a project above the line, with progress Bad or Fair, due to finish within 3 months of the Health Check's month or already past it; the highest in the attention order. An open-ended project, or one with no due month, is never asked about. "Is “[project]” worth a sprint of extra resource to finish by [Mon YYYY], or should its timeline change?" / "You rated its progress [Bad or Fair], and it’s due to finish in 2 months." The months read "this month", "next month", "in N months", or "it was due to finish in [Mon YYYY]" when the month is past. Months are counted between the due month and the Health Check's month, ignoring the day (Claude).
- **Progress:** the highest-ranked project that needs attention. "What would get “[project]” back on track?" / "You rated its progress Bad, and it’s above your line for important."
- **Resource:** a rated project with a progress rating, at or below the line, with resource High or Very high; the highest resource first, then the lowest importance, then the first in the list. "Is “[project]” worth the resource it takes?" / "You rated its resource High, and its strategic importance is 15%."
- **CSF cover:** a CSF that no project rates High; the heavier CSF first, then the first in the list. "What could strongly support “[CSF]”?" / "You didn’t rate any project High for this CSF." That CSF's card says "No project strongly supports this yet."
- **On track,** only with none of the above: "What will keep your important projects on track?" / "None of them needs action right now."
- On the example report the reasons say "They" and "their".
- Example (the mock-up's invented results, line 50%, Oct 2026): Timing, Enterprise sales team (finish by Dec 2026; "You rated its progress Bad, and it’s due to finish in 2 months."); Resource, New office fit-out ("You rated its resource High, and its strategic importance is 15%."); CSF cover, "A team with the right skills in the right roles". Enterprise sales team also needs attention, but it's already named, so there's no Progress question.

**Where they're saved (no database change):** each CSF's level is `level` (1, 2 or 3) on its item in the answers' `csfs` list, and the line is `importantLine` (30 to 80) at the top of the answers (`alignment_sessions.data`, which allows extra keys). None saved reads as Very important and 50%.

**Alignment over time (M19.3; Claude, not in the code yet):** for each version of a team's Health Check, the share of its rated projects (rated, with a progress rating) that are important and moving well.

### M20.2 Life balance review (was Wheel of Life)

In plain words: the person rates how satisfied they are with each area of their life, from 0 to 10. The review shows what rose and fell since the start of the period, and how far each area is from any target set. There is no overall score.

**Areas:** the ten standard areas, in wheel order: Career / Work, Financial / Money, Health / Fitness, Relationships / Family, Romance / Partner, Personal Growth / Learning, Fun / Recreation, Physical Environment / Home, Contribution / Community, Purpose / Meaning (kept as "Purpose / Meaning" by Tim, 27 Oct, 14:20: it's about meaning in life, not the portal's My Mission; an agreed exception to design rule 8). People can add their own areas (1 to 24 characters), which come after the standard ones in the order added. An area can be taken off the wheel and put back; its past scores are kept.

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
9. **Small groups:** totals from a few people can swing a lot, and may let others guess who answered. A pulse link can't tell who answers it, so a boss who answered their own pulse could work out a lone real answer (M18).
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
| 1.4 | 28 Oct 2026 | The Health Check's results rethink (M20.1; Tim, 28 Oct, 14:00 to 15:26): each CSF is Critical, Very important or Important, weighted 1.4, 1.2 and 1, so strategic importance = Σ(contribution × weight) ÷ Σ(3 × weight) × 100, and every CSF at Very important gives exactly the old figures (test case M20-4); each Health Check sets its own line for important, 30% to 80%, 50% unless changed, used everywhere "above 50%" was; the headline ("2 of 5" important projects moving well, with the rest adding up to the total); up to three questions to start with (Timing, Progress, Resource, CSF cover, or On track); dot size from resource. Older Health Checks score and read as before. |
| 1.2 (repo) | 27 Oct 2026 | Claude's calls in building 1.2 (migration 033): pulse results also stay private when only 1 or 2 people stayed anonymous beside named answers, and the count shows only once closed (M18); a seat's standard is set to 85 rather than refused, and set when the seat is taken up mid-sprint (M7); the single wellbeing switch moved to each organisation the person was in, which was its reach (M19.4). |
| 1.2 (repo) | 27 Oct 2026 | M14: the rerun for Tim's "rare but right" answer, with the planted link at 2 swings, and option (3) tried and not adopted (see "The rerun, 27 Oct 2026" below). The threshold stays at 2.6%. No other arithmetic changed. |
| 1.3 | 27 Oct 2026 | The Health Check's four states keep their rules but get fixed names (Moving well, Needs managing, Needs attention, Less important, or too early to tell) and are drawn to the 26 Oct design rules: mint for Moving well, outlines for the rest, no peach, no coral fill, no key on screen, a key in words in the PDF (Tim, 15:41 to 15:51); project dates saved with each project (Tim, 15:43); the At a glance sentence no longer says "behind" (M20.1). No arithmetic changed. |
| 1.2 | 27 Oct 2026 | Tim's decisions: organisation seats have a fixed 85% standard (M7; 26 Oct, 23:49); pattern cards are rare but right, the planted-link target set at 2 swings (M14.7); pulse results show only once the pulse closes, with 3 or more answers, and the stress measure shows as Calm (M18); wellbeing shared per organisation (M19.4); the Health Check gets four dot states, Embryonic as a ring and 2.5 in the attention score, and definitions under every choice (M20.1); Purpose / Meaning kept (M20.2). |
| 1.1 (repo) | 27 Oct 2026 | M14: the corrected chance threshold tightened from 5% to 2.6% by the go-live simulation; the planted-link target was not met, and the choice is Tim's (see "The pattern simulation" below). |
| 1.1 (repo) | 27 Oct 2026 | M20 completed from the code in Phase 1 (Health Check: strategic importance, attention score, tie-break, chart areas, the PDF's average; Life balance review: areas, 0 to 10 ratings and every figure worked out). No arithmetic changed. |
| 1.1 | 26 Oct 2026 | Scientific audit (Tim, 18:47): no pattern may contain its own cause (L3 uses the Strategy score without that habit; sleep habits left out of the day score); each half needs 3 weeks or 10 days per group; weekly re-checking named as a risk and covered by the any-time simulation; autocorrelation and nested habits added to the simulation; check-in changes judged against each area's typical swing once real data exist (M13); the bias in "looking back" ratings stated (M17); organisations never see check-in totals, only named wellbeing a person chooses to share (Tim, 18:48; M19.4); two new limits (easy targets, not yet validated) and a plan for checking the scores against real data (M23). |
| 1.0 | 26 Oct 2026 | First version, from the decisions doc (21 to 26 Oct) and Claude's calls listed below. |

### The pattern simulation, 27 Oct 2026 (M14.7)

Run by `npm run sim:patterns` (`scripts/sim-patterns.mjs`) on the engine itself (`src/lib/scores/m14.js`); the figures are in `tests/patterns/sim-results.json` (first run) and `tests/patterns/sim-results-seed2.json` (a fresh set of invented people). Every person was checked every week from week 8 to week 26, with the 4-week rule on. Uncertainty is the 95% interval.

- **No real links (5,000 people).** Realistic noise, good and bad spells that run on from week to week, gaps in logging, slow improvement, Recovery weeks, and habits nested in Strategies as the portal stores them; nothing caused anything. At the methods document's 5%, 6.6% of people (5.9% to 7.3%) saw a false card at some weekly check, above the target. Tightened step by step: 4% gave 5.5% (4.9% to 6.1%); 3.2% gave 4.5% (4.0% to 5.2%), whose interval still reached past 5%; **2.6% gave 3.8% (3.3% to 4.4%)**, with coach-only false cards at 4.1% (3.6% to 4.7%). **The threshold is now 2.6%** (Claude: the first at which the whole interval was below 1 in 20, for the person's cards and coach-only cards alike, rather than only the middle figure). On a fresh set of 5,000 people at 2.6%: 3.5% (3.0% to 4.0%); coach-only 3.5% (3.0% to 4.1%).
- **Why the 5% wasn't enough:** it holds for one look. Nineteen weekly looks, with cards that stay for 4 weeks once shown, give chance more openings, as M14.6 warned.
- **Planted links (1,000 people).** One habit lifting its Strategy's score (worked out without it) by the person's usual swing, with 12 or 13 eligible weeks in each group: found at week 26 for 11.4% (9.6% to 13.5%); on the fresh set, 13.5% (11.5% to 15.8%). **The target of 8 in 10 is not met.** With bigger links (for information, not a target): 1.5 swings, 43.7% (40.7% to 46.8%); 2 swings, 77.1% (74.4% to 79.6%).
- **Why:** with 12 weeks in each group, a gap of one usual swing is about as big as chance alone often gives. On its own, a planted link typically has a chance of 1 to 10 in 100. Correcting for the 8 to 13 links checked together each week, then needing both halves to agree and the gap to be at least half the swing, filters most of them out. Keeping false cards under 1 in 20 and finding 8 in 10 one-swing links within 26 weeks can't both be met with this method and this much data.
- **Early stopping:** a test may stop shuffling once its chance is clearly above the threshold (a test that far from passing can't change any decision). Against full 10,000-shuffle runs: 999 of 1,000 weekly checks gave the same cards, and 5,154 of 5,163 tests the same decision (4,986 of them had stopped early).
- **For Tim to decide** (nothing else was changed): (1) accept that cards are rare and appear for links of about 2 swings or more, which fits "never feel misled"; (2) need more data before a card can show, for example a year rather than 26 weeks; (3) check fewer links together, for example only habits kept in between a quarter and three quarters of weeks, since the others rarely have 6 weeks in each group; or (4) set the planted target at 2 swings. Claude Code can rerun the simulation for any of these in under a minute.

### The rerun, 27 Oct 2026 (Tim's answer: rare but right)

Run by `npm run sim:patterns -- --seed N --no-tighten` at the 2.6% threshold, with the planted link at 2 usual swings (the new target, M14.7) and 1 and 1.5 swings for information. Every person was checked every week from week 8 to week 26, with the 4-week rule on. Figures are at week 26, with the 95% interval. Files: `tests/patterns/sim-results.json` and `sim-results-seed2.json` (every habit checked), `sim-results-option3.json` and `sim-results-option3-seed2.json` (option 3), `sim-results-option3-narrow-seed1.json` and `-seed2.json` (a narrower band, for information).

| How links are checked | Set of people | False cards, the person's | False cards, coach-only | Found: 2 swings | 1.5 swings | 1 swing |
|---|---|---|---|---|---|---|
| Every habit (as now) | First | 3.8% (3.3% to 4.4%) | 4.1% (3.6% to 4.7%) | 74.0% (71.2% to 76.6%) | 43.7% | 15.3% |
| Every habit (as now) | Fresh | 3.5% (3.0% to 4.0%) | 3.5% (3.0% to 4.1%) | 76.5% (73.8% to 79.0%) | 43.9% | 13.3% |
| Option 3: habits kept in 25% to 75% of eligible weeks | First | 3.8% (3.3% to 4.4%) | 4.1% (3.6% to 4.7%) | 74.2% (71.4% to 76.8%) | 43.9% | 15.4% |
| Option 3: habits kept in 25% to 75% of eligible weeks | Fresh | 3.5% (3.0% to 4.0%) | 3.5% (3.0% to 4.1%) | 76.5% (73.8% to 79.0%) | 44.1% | 13.3% |
| For information: 33% to 67% | First | 3.8% (3.3% to 4.4%) | 4.2% (3.7% to 4.8%) | 75.8% (73.0% to 78.4%) | 45.8% | 16.1% |
| For information: 33% to 67% | Fresh | 3.6% (3.1% to 4.2%) | 3.5% (3.0% to 4.1%) | 78.2% (75.5% to 80.6%) | 46.0% | 13.9% |

- **False cards stay under 1 in 20** for the whole 95% interval, for the person's cards and coach-only cards alike, in every row.
- **The 2-swing target (3 in 4) is met on the fresh set and only just missed on the first:** 74.0%, with an interval from 71.2% to 76.6%. Across both sets, 1,505 of 2,000 (75.3%) were found. A link of 2 swings is right at the edge of what half a year of data can show.
- **Option 3 is not adopted (Claude, by Tim's rule: adopt it only if the 2-swing rate rises).** It changed almost nothing (74.0% to 74.2%, and 76.5% to 76.5%), because the engine already leaves out any habit without 6 weeks in each group, which over 26 weeks is about 27% to 73% kept. The narrower band adds about 2 points, but the simulation flatters it: every planted habit is kept about half the time, so a real link on a habit kept in 30% or 70% of weeks would never be checked. The setting stays in the code, switched off (`M14.l3KeptShare`), so it can be rerun.
- The figures for 1 swing differ from the first run (11.4% then, 15.3% now) only because the information rows now use a different set of invented people (seed + 17); the method is unchanged.

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
