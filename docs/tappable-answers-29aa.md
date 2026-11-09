# Tappable answers that aren't full sentences (rule 29aa)

Listed on 9 Nov 2026 for the Phase 5 follow-up (Step 3 of the 5 Nov prompt). Rule 29aa says every answer people can tap is a full sentence in their own voice, with no full stop on the button. **Nothing here has been reworded:** Claude writes the new wording, and the build changes it only after that.

Answers made from the person's own words (their Strategies, priorities, ways of being, activities, weeks and days) aren't listed: they are already the person's own.

## Monthly check-in (`/check-in`, `src/lib/performance/checkin.js`)

- Hours of sleep (H1): Under 5 hours, 5 to 6 hours, 6 to 7 hours, 7 to 8 hours, 8 to 9 hours, Over 9 hours
- Quality of sleep, how well you've eaten, physical health (H2, H7, H12): Very poor, Poor, Fair, Good, Very good
- Stress (H3) and the six Software statements (S1 to S6): Never, Rarely, Sometimes, Often, Always
- Exercise (H4): None, Under 1 hour, 1 to 2½ hours, 2½ to 5 hours, Over 5 hours
- Strength training (H5): 0 days, 1 day, 2 days or more
- Sitting (H6): Under 4 hours, 4 to 6 hours, 6 to 8 hours, 8 to 10 hours, Over 10 hours
- Heavy drinking sessions (H9): Never, Less than monthly, Monthly, Weekly, Daily or almost daily
- Mood, energy (H10, H11): Very low, Low, OK, High, Very high
- Pain or injury (H13): Not at all, A little, Moderately, Quite a lot, Very much
- Did you travel this month? (H14): No, Short trips, Long journeys or time zones
- Trips across 3 or more time zones (H15): None, 1, 2, 3, 4 or more
- Recovery after travelling (H16): Very poorly, Poorly, OK, Well, Very well
- Add to my sprint (`CheckIn.jsx`): As a habit, As a to-do

## Weekly debrief (`/debrief`, `src/lib/performance/debrief.js`)

- Stress this week: Not at all, A little, Moderately, Quite a lot, Very much

## Plan my day and Recovery (`PlanMyDay.jsx`, `Recovery.jsx`, `src/lib/performance/dayPlan.js`)

- Sleep quality: Very poor, Poor, Fair, Good, Very good
- Recovery: A few more days, Ready to go again (and "Add a few more days" on the sprint page)

## End-of-sprint review (`SprintReview.jsx`)

- Each habit: Keep, Change, Retire
- What's next?: Straight into Performance Sprint [next number], Recovery first

## Plan builder and the plan's panels (`src/lib/performance/builder.js`, `HabitEditor.jsx`, `ObjectiveEditor.jsx`, `TodoPanels.jsx`, `KeepChangeRow.jsx`)

- How it's measured (objectives): Number, Milestone, Rating /10
- How a habit is counted: Count, Amount with a unit, Yes or no each day, Yes or no each day, under a limit, Once a week, Keep a count under a limit, Rating 1 to 5
- Which way is better: Higher is better, Lower is better
- How much does it move its Strategy? (habits, to-dos, wins, the sprint page): Low, Medium, High
- Keep, change or remove a row: Keep, Change, Remove

## Stop doing audit (`StopDoingAudit.jsx`)

- For each activity: Stop, Automate, Delegate, Defer

## Health Check, in the portal (`src/pages/alignment/alignmentFlow.js`) and the outside page (`src/health-check`)

- How much a project contributes to each factor: None, Low, Medium, High
- Progress: Embryonic stage, Bad, Fair, Good, Excellent
- Resource required: Minimal, Low, Moderate, High, Very high
- Finish date (outside page): Not sure, Open-ended, with no agreed finish date (the other answers are months)

## Wheel of Life (`src/lib/wheelOfLife.js`)

- Period on the results: 3 months, 6 months, 12 months, All (a filter, listed for completeness)

## Settings-style choices (listed for completeness; probably not "answers")

- Colour mode: Light, Dark, Match my device
- Sprint page: Today, This week
- Chat to your coach: the app names (WhatsApp and the like)
