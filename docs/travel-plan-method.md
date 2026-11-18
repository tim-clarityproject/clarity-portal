# How the Travel plan is worked out

The Travel plan (mock-up M21, version 7.2; Phase 8b Part B) is made by one small engine, `src/lib/travel`, with no screens and no database in it. Every number below lives in `src/lib/travel/rules.js` (`RULES`), and every rule is checked by `tests/performance/travel.test.mjs` (`npm run test:performance`). All time-zone work goes through the portal's one time library, `src/lib/time` (`instantAt`, `wallClock`, `offsetMinutes`, `addDays`, `daysBetween`, `dayKeyWords`, `clockChanges`); nothing in the engine reads an offset any other way. This page is written for Claude to check the engine against.

## What goes in and what comes out

`makeTravelPlan(input)` takes the flight out, the flight home (each with its dates, times, cities and place-name time zones), any flights between them (`legs`), the key moments (each in its own city and zone), usual sleep and "I don’t have caffeine". It gives back the whole plan: home and away, the days from 3 days before the flight out until the body clock is back home, each day's body clock, its % read-out and its steps in time order, the chart's data, and the clock changes during the trip. `replanFrom(plan, today, edits)` reworks a plan after an edit, from today onwards. `shortTrip(input)` says whether a trip is short.

## The rules

**Usual sleep** comes from the person's check-in. With no check-in it is 23:00 to 07:00. M21's example person's check-in says 22:30 to 06:30.

**A short trip** is 2 nights away or fewer (from the night the flight out lands to the night before the flight home leaves), or a time difference of 2 hours or less. It stays on home time: one page with the key day's few steps, each in local time, with home time where it matters ("Turn the lights out, which is 22:00 in London."), and no day-by-day plan and no chart. The key day is the first key moment's day, or the first full day away, and it runs from midnight to midnight on the clock of the place it's spent in: the key moment's city, or on the day the flight home leaves, the place it leaves from (never home's clock while the person is still away). Its steps are the usual home bedtime and wake time that fall on that day, in the order they come: going east, lights out comes first, after midnight ("02:00, Turn the lights out, which is 22:00 in London.", then "Get up"); going west, getting up comes first and lights out last. The last caffeine and the evening's low light are aimed at the night after getting up. Going east, daylight starts 2 hours after getting up ("Get daylight from now, not first thing."), so morning light doesn't move the clock towards the new zone. Going west, daylight early in the day and low light from 4 hours before bed, but **never daylight before 07:00 on the local clock**, which is still night there: getting up at 02:00 in New York on London time, it reads "Get daylight once it’s light, and keep the light low from 14:00." at 07:00. On the day the flight home leaves, a bedtime inside an overnight flight home becomes "On board", "Sleep on the flight home."; anything that would fall after leaving, or before landing, is left out (the last caffeine may still fall on a flight). **No time difference** (London to Lisbon in November: both zones read the same on every flight) is said plainly: "There’s no time difference, so keep your usual times.", and no step adds "which is … in London" (`sameTime` on the plan).

**A short trip west moves sleep just enough** (Tim, 18 Nov, 09:00): it stays on home time unless that means getting up before 05:00 or going to bed after 01:00 on the local clock; then the usual bedtime and wake time move together, later by the least that fits inside 05:00 to 01:00 (`sleepMove`; `RULES.shortWakeFrom`, `shortBedBy`), and every other step follows its own rule from the moved times. One line goes under the headline with the real time it would have been: "Your sleep moves a little so you’re not up at 02:00." London to New York for 2 nights on 23:00 to 07:00 gets up at 05:00 (10:00 in London) and turns the lights out at 21:00 (02:00 in London); London to Los Angeles moves 6 hours ("…not up at 23:00."). Going east nothing moves: London to Dubai keeps lights out at 02:00 and getting up at 10:00, as M21 draws it. (The New York example above, getting up at 02:00, is what the rule gave before.)

**Several stops.** The plan follows the place where most nights are spent: the body clock aims at that place's time, and the chart shows it. Every step is still written on the clock of wherever the person is that day, and each key moment in its own city's time.

**The body clock** is counted in hours from home time, east positive (New York from London in November is −5). Each day has a target, where the plan's sleep and light try to put the clock:

- Before the flight out (3 days): the sleep moves about an hour a day in the direction of travel: 30 minutes the first night, then an hour more each night (30 minutes, 1½ hours, 2½ hours), never past the new zone.
- The flight out and the days away: the new zone's time.
- The day before the flight home (when the trip has 3 nights or more): an hour back towards home ("You start moving back").
- After the flight home: home time.
- A night spent on a plane: asleep an hour after take-off, wherever the body clock is.

**Clock changes.** The body keeps true time. When the home zone's clocks change during the plan, the same body clock reads an hour more or less against home time, so it is moved by that hour on the day of the change (UK clocks going back: a body 3.2 hours later than London's summer time is 2.2 hours later than its winter time), and then follows its target as usual. A change in the away zone only changes the target (the day's difference), never the body clock. Carrying on after an edit rebases from the day before.

Each day the body clock closes half the gap to its target, never more than 1 hour a day going earlier (east), 1½ hours a day going later (west), or 1 hour a day before the flight out. So a short stay shifts only partly, as M21's London to New York example does: it reaches about 90% of New York time, then turns for home. Back home, within half an hour of home time counts as back, and the plan ends that day.

**The % adjusted** is how far the body clock has moved between the two zones, rounded to the nearest 5%, and always shown with "~": "Body clock ~80% adjusted to New York time", "Body clock on New York time" at 100%. From the day of the flight home it counts back: "Body clock ~60% back on London time", then "Body clock back on London time". With a clock change during the trip, each day uses that day's difference.

**Three steps a day**, each with its time, in time order with any key moments (a key moment comes before a step at the same time; a key moment with no time comes first; "On board" last):

- **Sleep.** Bedtime is the day's target, kept within 1½ hours of where the body clock is, to the nearest 30 minutes, with the wake time the usual length of sleep later. Before the flight: "Go to bed 30 minutes later than usual, and get up at 07:00." The day of a daytime flight: "Stay awake on the flight, and go to bed at 21:30." A night flight: "Sleep as soon as you can after take-off." The first night away going west adds "and rest in the dark if you wake early."
- **Caffeine.** The last caffeine is 9 hours before that night's bedtime, on the clock of wherever the person is then (on a flight, the destination's clock: the watch is set on boarding). Caffeine in the air is allowed (Tim, 18 Nov, 09:00): one that falls during a flight says so, "Have your last caffeine by 13:00, on the plane." With "I don’t have caffeine", there are no caffeine steps anywhere.
- **Light.** To move the clock later: bright light in the evening and low light in the morning. At home, "Keep the lights bright until bedtime." from 3½ hours before the usual bedtime; away, low light until 3½ hours after the body's own wake time, then daylight from 9 hours after it, into the evening. To move it earlier: bright light in the morning and low light in the evening, from an hour after the body's own wake time, for 4 hours ("Wear sunglasses until 10:00, then get daylight until 14:00." the morning after a night flight). **Never bright light in the 3 hours before the body's usual wake time**: the test checks every bright window of every plan against it. The day's light is aimed at where the clock goes next, so the last day away already turns for home.

**Every step on its own day.** Each step listed under a day falls on that date on the clock it's shown on, in time order, where the person is at that moment, and never on a plane apart from the flight's own steps. A bedtime may run past midnight, until noon the next day. A difference of more than 12 hours is read the short way round for the body clock (Los Angeles to Tokyo is 17 hours ahead, read as 7 behind), so the times worked out from home's clock are moved by whole days onto the day they're listed under. Then:

- **A night on board** is a flight that leaves that day and lands on a later date, with the plan's bedtime or the body's own bedtime (read as that night's on the departure's clock) from 3 hours before take-off until 3 hours before landing. Asleep at that bedtime, never sooner than an hour after take-off: an early flight east (06:00 London to Tokyo) sleeps at Tokyo's night, so its last caffeine is that morning before take-off, never the evening before.
- **A night on a flight that lands the same date** (Tokyo to Los Angeles, overnight, landing in the morning): "Sleep on the flight, and go to bed at 22:00."
- **A long day with no night.** A flight that lands a date later with no night on board (Los Angeles to Tokyo by day, crossing the date line) has no bedtime that day: "On board", "Stay awake on the flight." The next day starts at landing, with its light from landing.
- **A day in the air** (a 24-hour flight, London to Auckland, all of Wed 11 on the plane) has one step: "On board", "Rest on the flight, and sleep when you can."
- **Landing after bedtime.** Bed is never sooner than an hour after landing. Landing up to 4 hours after the planned bedtime moves bed to an hour after landing; later than that, the day has no night.
- **Never in bed within 3 hours of the next day's flight**: bed moves earlier to leave time to get there.
- **Light** never starts on a plane, before the person lands, or in the hour before bed: it moves to landing when the flight lands later that day ("Get daylight from landing until dark."), and otherwise there's no light step that day.
- **The last caffeine** may fall on a flight (on the destination's clock, as the method says); when that clock reads another date, it is shown on the clock the day started on, and when neither is that day, there's none that day. A day with no night has none (the next day has it). The UI tester's note that M21's Sun 8 caffeine (13:00 New York) falls during the 12:00 London flight stays as it is: it's a flight step under this rule.

`tests/performance/travel.test.mjs` checks all of this over 112 trips (the date line both ways, London and Auckland both ways, half-hour and 45-minute zones, Adelaide, St John's, flights at 06:00, 12:00, 19:00 and 23:30) and every short trip's key day on 14 routes.

**Never assume when someone is at their sharpest.** There is no sharpest-hours band anywhere: the test fails any plan that mentions one.

**Editing.** `replanFrom` keeps every day before today exactly as it was, and works the rest out again from where the body clock was at the end of yesterday. Before the trip has started it makes a new plan (a short one if the edit makes the trip short). Changing to no caffeine through an edit takes caffeine off today onwards; the screens' "I don’t have caffeine" sets `noCaffeine` on the whole plan.

## The worked example (M21)

London to New York, out Sun 8 Nov 2026 at 12:00 (lands 15:00), home Thu 12 Nov at 19:00 (lands Fri 13 at 07:00), usual sleep 22:30 to 06:30, key moments the investor dinner (Mon 9, 19:30), the Harbour board meeting (Tue 10, 09:00) and the Meridian lunch (Wed 11, 12:30). Times are New York time from Mon 9 to Wed 11 and London time otherwise; the two travel days label every time. M21's figures are in brackets where they differ.

| Day | Body clock | Read-out | Light | Caffeine | Sleep |
|---|---|---|---|---|---|
| Thu 5 | −0.2 (−0.4) | ~5% (~10%) | 19:00 | 14:00 | 23:00, up 07:00 |
| Fri 6 | −0.9 (−1.0) | ~20% | 19:00 | 15:00 (14:30) | 00:00 (23:30), up 08:00 (07:30) |
| Sat 7 | −1.7 (−1.8) | ~35% | 19:00 | 16:00 (15:30) | 01:00 (00:30) |
| Sun 8 | −3.2 (−2.7) | ~65% (~55%) | 15:30 New York | 13:00 New York (12:30 London) | 22:00 New York (21:30) |
| Mon 9 | −4.1 (−3.5) | ~80% (~70%) | 14:30 (14:00) | 13:30 (13:00) | 22:30 |
| Tue 10 | −4.5 (−4.2) | ~90% (~85%) | 07:30 (07:00) | 13:30 | 22:30 |
| Wed 11 | −4.3 (−3.9) | ~85% (~80%) | 07:00 (06:45) | 12:30 | 21:30 |
| Thu 12 | −3.4 (−3.0) | ~30% back (~40%) | 06:00 New York (05:30) | 11:00 New York | On board |
| Fri 13 | −2.4 (−2.1) | ~50% back (~60%) | 10:00 | 14:30 (14:00) | 23:30 (23:00) |
| Sat 14 | −1.4 (−1.2) | ~70% back (~75%) | 09:00 | 13:30 | 22:30 |
| Sun 15 | −0.7 (−0.5) | ~85% back (~90%) | 08:30 (08:00) | 13:30 | 22:30 |
| Mon 16 | 0 | back on London time | 07:30 | 13:30 | 22:30 |

Every step is within 30 minutes of M21; the worst difference is 30 minutes for each kind (light, caffeine, sleep and wake). The % read-out is within 10 points on every day. Where they differ, and which to trust:

- **Usual sleep.** The brief says 22:30 to 07:00; M21's Check screen, sleep panel and notes say 22:30 to 06:30, and its own steps only fit 06:30 ("go to bed 30 minutes later than usual, and get up at 07:00"). The test uses 06:30. Trust M21.
- **Before the flight (Fri 6, Sat 7).** M21 moves bedtime 30 minutes, then 1 hour, then 2 hours later; the engine moves it 30 minutes, then 1½, then 2½, which is "about an hour a day" as the brief says. Bedtime, wake time and caffeine are each 30 minutes later on those two days. Trust the rule: M21's steps are hand-written and move less than its own rule.
- **Away (Sun 8 to Wed 11).** M21's body clock moves about 0.8 hours a day; the engine's closes half the gap each day, capped at the brief's 1½ hours a day going west, so it runs about half an hour ahead of M21's and reads 10 points higher. That puts Sun 8's bedtime 30 minutes later and Tue 10 and Thu 12's morning light 30 minutes later. Trust the rule.
- **Sun 8's last caffeine.** M21 shows "12:30 London". Nine hours before a 21:30 New York bedtime is 12:30 New York time (17:30 London), on the plane with the watch already on New York time. The engine says 13:00 New York (its bedtime is 22:00). Trust the rule: M21 put the New York reading under a London label.
- **Mon 9's light.** M21 says "daylight from 14:00", the afternoon before an early New York dusk; the engine says 14:30 (9 hours after the body's wake time). The engine doesn't know sunset, so it never says "around 16:30".
- **Back home (Fri 13 to Sun 15).** M21's clock comes home a little faster, so the engine's Fri 13 bedtime and caffeine are 30 minutes later and Sun 15's light 30 minutes later.
- **Wed 11's light.** 07:00 against M21's 06:45: the engine gives times to the nearest 30 minutes.

## Sources

- Eastman CI and Burgess HJ (2009), How to travel the world without jet lag, Sleep Medicine Clinics 4(2), 241 to 255. (Moving sleep about an hour a day before the flight; light in the morning to move the clock earlier and in the evening to move it later; the body clock's low point about 3 hours before the usual wake time, and no bright light just before it.)
- Sack RL (2010), Jet lag, New England Journal of Medicine 362, 440 to 447. (The body clock adjusts by about an hour a day going east and a little more going west; a short trip can stay on home time.)
- Drake C and others (2013), Caffeine effects on sleep taken 0, 3, or 6 hours before going to bed, Journal of Clinical Sleep Medicine 9(11), 1195 to 1200. (Caffeine 6 hours before bed still cut sleep, so the plan allows 9.)

The plan doesn't cover medicines or supplements.
