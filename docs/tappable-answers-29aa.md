# Tappable answers that aren't full sentences (rule 29aa)

Listed on 9 Nov 2026 for the Phase 5 follow-up (Step 3 of the 5 Nov prompt). Rule 29aa says every answer people can tap is a full sentence in their own voice, with no full stop on the button.

**Reworded on 9 Nov 2026 (Phase 5 follow-up 2, Step 4), as Tim set out.** Each change shows old → new. Only the words people see changed: the saved values are the same, so older saved answers still open. Everything marked **left as it is** is a scale, a number, a date or a setting (rule 29i and Tim's list), not an answer.

Answers made from the person's own words (their Strategies, priorities, ways of being, activities, weeks and days) aren't listed: they are already the person's own.

## Monthly check-in (`/check-in`, `src/lib/performance/checkin.js`)

- Hours of sleep (H1): Under 5 hours, 5 to 6 hours, 6 to 7 hours, 7 to 8 hours, 8 to 9 hours, Over 9 hours. **Left as it is** (a band of hours).
- Quality of sleep, how well you've eaten, physical health (H2, H7, H12): Very poor, Poor, Fair, Good, Very good. **Left as it is** (a rating scale, rule 29i).
- Stress (H3) and the six Software statements (S1 to S6): Never, Rarely, Sometimes, Often, Always. **Left as it is** (a rating scale, rule 29i).
- Exercise (H4): None, Under 1 hour, 1 to 2½ hours, 2½ to 5 hours, Over 5 hours. **Left as it is** (a band of hours).
- Strength training (H5): 0 days, 1 day, 2 days or more. **Left as it is** (a band of days).
- Sitting (H6): Under 4 hours, 4 to 6 hours, 6 to 8 hours, 8 to 10 hours, Over 10 hours. **Left as it is** (a band of hours).
- Heavy drinking sessions (H9): Never, Less than monthly, Monthly, Weekly, Daily or almost daily. **Left as it is** (the drinks bands).
- Mood, energy (H10, H11): Very low, Low, OK, High, Very high. **Left as it is** (a rating scale, rule 29i).
- Pain or injury (H13): Not at all, A little, Moderately, Quite a lot, Very much. **Left as it is** (a rating scale, rule 29i).
- Did you travel this month? (H14), **reworded**: No → I didn’t travel; Short trips → I took short trips; Long journeys or time zones → I made long journeys or crossed time zones
- Trips across 3 or more time zones (H15): None, 1, 2, 3, 4 or more. **Left as it is** (numbers).
- Recovery after travelling (H16): Very poorly, Poorly, OK, Well, Very well. **Left as it is** (a rating scale, rule 29i).
- Add to my sprint (`CheckIn.jsx`), **reworded**: As a habit → Add it as a habit; As a to-do → Add it as a to-do

## Weekly debrief (`/debrief`, `src/lib/performance/debrief.js`)

- Stress this week: Not at all, A little, Moderately, Quite a lot, Very much. **Left as it is** (the stress scale).

## Plan my day and Recovery (`PlanMyDay.jsx`, `Recovery.jsx`, `src/lib/performance/dayPlan.js`)

- Sleep quality: Very poor, Poor, Fair, Good, Very good. **Left as it is** (sleep quality, a rating scale).
- Recovery's “How are you feeling?” (`Recovery.jsx`), **reworded**: A few more days → I need a few more days; Ready to go again → I’m ready to go again. The buttons that act (“Ready to go again”, “Pick up my sprint”, “Add a few more days” on the sprint page) are buttons, not answers, and keep their words (never “I” on a button, writing rule 13).

## End-of-sprint review (`SprintReview.jsx`)

- Each objective, **reworded**: Keep → Keep it as it is; Change → Change it; Retire → Retire it
- What's next?, **reworded**: Recovery first → I’ll take a recovery week first. “Straight into Performance Sprint [next number]” is **left as it is** (not on Tim's list; see the note at the end).

## Plan builder and the plan's panels (`src/lib/performance/builder.js`, `HabitEditor.jsx`, `ObjectiveEditor.jsx`, `TodoPanels.jsx`, `KeepChangeRow.jsx`)

- How will you track it? (objectives), **reworded**: Number → I’ll track a number; Milestone → I’ll track a milestone; Rating /10 → I’ll rate it out of 10
- How will you measure it? (habits, a drop-down), **reworded**: Count → I’ll count it each week; Amount with a unit → I’ll measure an amount each day; Yes or no each day → I’ll say yes or no each day; Yes or no each day, under a limit → I’ll say yes or no each day, under a limit; Once a week → I’ll say yes or no once a week; Keep a count under a limit → I’ll keep a daily count under a limit; Rating 1 to 5 → I’ll rate it from 1 to 5 each day. (Each keeps its example under it, such as “e.g. training sessions”. “Each week” and “each day” follow where the target counts when the habit is new.)
- Which way is better: Higher is better, Lower is better. **Left as they are** (Tim, 9 Nov).
- How much does it move its Strategy? (habits, to-dos, wins, the sprint page): Low, Medium, High. **Left as it is** (Low / Medium / High).
- Keep, change or remove a row (`KeepChangeRow.jsx`, Start a sprint's “Which habits are you bringing across?”), **reworded**: Keep → Keep it; Change → Change it; Remove → Remove it

## Stop doing audit (`StopDoingAudit.jsx`)

- For each activity, **reworded**: Stop → Stop doing it; Automate → Automate it; Delegate → Hand it to someone else; Defer → Do it later. The saved values (Stop, Automate, Delegate, Defer) are unchanged, so the older summary page still shows them as before; “Which one will you take action on first?” shows the new words in its brackets.

## Health Check, in the portal (`src/pages/alignment/alignmentFlow.js`) and the outside page (`src/health-check`)

- How much a project contributes to each factor: None, Low, Medium, High. **Left as it is** (one of the Health Check's three rating scales).
- Progress: Embryonic stage, Bad, Fair, Good, Excellent. **Left as it is** (a Health Check rating scale).
- Resource required: Minimal, Low, Moderate, High, Very high. **Left as it is** (a Health Check rating scale).
- Finish date (outside page): Not sure, Open-ended, with no agreed finish date (the other answers are months). **Left as it is** (the Health Check's finish date).

## Wheel of Life (`src/lib/wheelOfLife.js`)

- Period on the results: 3 months, 6 months, 12 months, All (a filter, listed for completeness). **Left as it is** (a filter, not an answer).

## Settings-style choices (listed for completeness; probably not "answers")

- Colour mode: Light, Dark, Match my device
- Sprint page: Today, This week
- Chat to your coach: the app names (WhatsApp and the like)

All three **left as they are** (settings, not answers).

## For Claude to check

- End-of-sprint review, What's next?: “Straight into Performance Sprint [next number]” now sits beside “I’ll take a recovery week first”. It wasn't on Tim's list, so it's unchanged; “I’ll go straight into Performance Sprint [next number]” would match.
- The saved review (`SprintReviewRead.jsx`) still reads back “Straight into the next sprint.” or “Recovery first.” (read-out lines, not answers).
- The design gallery's measure drop-down demo (`DesignReference.jsx`, `MEASURE_OPTIONS`) is a demo of the drop-down with its own short labels; unchanged.
