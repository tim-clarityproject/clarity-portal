# Scale and speed check: baseline (before any fix)

Measured 22 Nov 2026 on feature/performance-overhaul at ad79e4ee (app code as at 4421ce3a). The data is invented and runs on a local stand-in for Supabase: PGlite with the official PostgREST 16.5 and the real row rules, with every migration up to 055 applied. Nothing hosted was touched and nothing was sent. You can rerun everything with tests/scale (README.md). The raw results are in `baseline-results.jsonl`.

**How it was measured.** The app is a production build served as Vercel does, with brotli. The database's answers are gzipped, as Supabase sends them. Each page was visited cold (a new browser, signed in, nothing on the device) and then warm (a second visit). "First screen" is the largest contentful paint. "Data shown" is when the page last changed before it went quiet. "Tap" is the time from a tap to the next paint (Event Timing, as INP measures it; anything under 16 ms reads as 16). The laptop is 1440 × 900 with no slowing. The phone is 390 × 844 on Chrome's "Fast 4G" (9 Mbps down, 1.5 up, 60 ms round trip) with its CPU slowed 4 times. The client is scale-client-0001, one of the owner's clients. The associate is coach 2 with 120 clients. The owner is coach 1 with 300 clients.

**A caveat.** PGlite is single-threaded WASM on one connection, so requests made at the same moment wait in line, and the database part of the times runs slower than on Supabase. Even so, every database read measured below takes under 0.3 s on its own (EXPLAIN ANALYZE). The large times come from what the browser does with the data (see the misses), and that carries over to the live site unchanged.

**Seed (actual counts).** 15 coaches (1 owner, 14 associates, each with an authenticator turned on and recovery codes saved; aal2). 1,000 clients: the owner 300, the associates 120, 90, 80, 70, 60, 55, 50, 45, 35, 30, 25, 20, 12 and 8. 40 organisations. A year per client: 5 sprints (4 finished, the fifth at week 5 of 12), 916,264 habit logs, 291,077 Daily plans, 255,055 Daily reviews, 2,000 own questions with 307,055 answers, 52,000 weekly debriefs, 52,000 week scores, 52,000 wins, 12,000 monthly reviews, 78,000 objective figures and 123,000 client to-dos (2 a week plus 3 in the Backlog). The coach side has 14,750 sessions (with their people and 12,095 notes), 30,901 calendar items over 2 years, 960 bookings, 300 booking links, 6,001 coach to-dos, 4,500 notifications, 2,000 activity-log entries, 2,000 time entries, 6,000 client notes and 1,000 engagements. The owner also has 400 leads (2,400 lead events), 1,500 Network people (5,336 ratings, 1,500 gives) and 120 organisation deals. There is no invoice table yet, and Finances is not built (the route shows "Coming soon"), so neither was seeded or timed. Choices made without Tim: the 6,000 to-dos are the coach portal's to-dos, and clients have their own on top. The owner is the coach with 300 clients.

Targets: the first screen under 1 s on 4G, every tap under 100 ms, and no list that loads everything at once.

## Every page

| Page | Who | Size | Cold first screen | Cold data shown | Warm first screen | Warm data shown | Slowest tap | Requests | Rows | Data sent (raw / compressed) | App bytes (cold) | First screen under 1 s on 4G | Taps under 100 ms | No whole list |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Home | client | laptop | 108 ms | 142 ms | 76 ms | 76 ms | 24 ms | 62 | 323 | 93 kB / 93 kB | 631 kB | (laptop) | yes | yes |
| Daily plan | client | laptop | 152 ms | 152 ms | 72 ms | 72 ms | 24 ms | 47 | 328 | 91 kB / 91 kB | 590 kB | (laptop) | yes | yes |
| Daily review | client | laptop | 152 ms | 152 ms | 64 ms | 64 ms | 16 ms | 45 | 331 | 91 kB / 91 kB | 590 kB | (laptop) | yes | yes |
| The sprint | client | laptop | 96 ms | 145 ms | 80 ms | 80 ms | 32 ms | 31 | 195 | 39 kB / 39 kB | 631 kB | (laptop) | yes | yes |
| Dashboard | client | laptop | 100 ms | 190 ms | 84 ms | 84 ms | 24 ms | 58 | 1,568 | 261 kB / 261 kB | 631 kB | (laptop) | yes | yes |
| Weekly debrief | client | laptop | 72 ms | 141 ms | 68 ms | 70 ms | - | 53 | 1,532 | 289 kB / 289 kB | 590 kB | (laptop) | - | yes |
| My Account | client | laptop | 116 ms | 116 ms | 64 ms | 67 ms | 24 ms | 16 | 109 | 51 kB / 51 kB | 590 kB | (laptop) | yes | yes |
| Home | client | phone | 1.4 s | 1.4 s | 164 ms | 164 ms | 40 ms | 62 | 323 | 92 kB / 16 kB | 548 kB | **no** | yes | yes |
| Daily plan | client | phone | 1.0 s | 1.2 s | 32 ms | 135 ms | 16 ms | 47 | 328 | 90 kB / 15 kB | 486 kB | **no** | yes | yes |
| Daily review | client | phone | 1.1 s | 1.3 s | 36 ms | 140 ms | 32 ms | 45 | 331 | 91 kB / 15 kB | 486 kB | **no** | yes | yes |
| The sprint | client | phone | 784 ms | 1.2 s | 172 ms | 172 ms | 24 ms | 31 | 195 | 39 kB / 10 kB | 590 kB | **no** | yes | yes |
| Dashboard | client | phone | 2.1 s | 2.1 s | 204 ms | 204 ms | 16 ms | 90 | 2,130 | 358 kB / 59 kB | 590 kB | **no** | yes | yes |
| Weekly debrief | client | phone | 1.0 s | 1.3 s | 32 ms | 183 ms | - | 53 | 1,532 | 289 kB / 46 kB | 486 kB | **no** | - | yes |
| My Account | client | phone | 796 ms | 986 ms | 128 ms | 180 ms | 24 ms | 16 | 109 | 51 kB / 6 kB | 590 kB | yes | yes | yes |
| Coach: Today | associate | laptop | 2.3 s | 2.3 s | 2.3 s | 2.3 s | 168 ms | 83 | 10,001 | 5.2 MB / 5.2 MB | 611 kB | (laptop) | **no** | **no** (6) |
| Coach: To-dos | associate | laptop | 436 ms | 2.3 s | 376 ms | 2.3 s | 144 ms | 83 | 10,002 | 5.2 MB / 5.2 MB | 611 kB | (laptop) | **no** | **no** (6) |
| Coach: Calendar week | associate | laptop | 436 ms | 2.4 s | 384 ms | 2.3 s | 16 ms | 191 | 10,015 | 5.2 MB / 5.2 MB | 611 kB | (laptop) | yes | **no** (6) |
| Coach: Calendar month | associate | laptop | 428 ms | 2.3 s | 380 ms | 2.3 s | 16 ms | 191 | 10,015 | 5.2 MB / 5.2 MB | 611 kB | (laptop) | yes | **no** (6) |
| Coach: Clients (list; Board and Table are taps) | associate | laptop | 424 ms | 2.3 s | 372 ms | 2.3 s | 24 ms | 82 | 10,001 | 5.2 MB / 5.2 MB | 611 kB | (laptop) | yes | **no** (6) |
| Coach: a client with a year of history | associate | laptop | 2.5 s | 2.5 s | 2.4 s | 2.4 s | 152 ms | 192 | 10,135 | 5.2 MB / 5.2 MB | 611 kB | (laptop) | **no** | **no** (6) |
| Coach: search | associate | laptop | 2.3 s | 2.3 s | 2.3 s | 2.3 s | 304 ms | 83 | 10,001 | 5.2 MB / 5.2 MB | 611 kB | (laptop) | **no** | **no** (6) |
| Coach: Today | owner | laptop | 9.1 s | 9.1 s | 9.1 s | 9.1 s | 328 ms | 195 | 32,674 | 15.1 MB / 15.1 MB | 611 kB | (laptop) | **no** | **no** (15) |
| Coach: To-dos | owner | laptop | 420 ms | 9.0 s | 384 ms | 8.9 s | 240 ms | 194 | 32,674 | 15.1 MB / 15.1 MB | 611 kB | (laptop) | **no** | **no** (15) |
| Coach: Calendar week | owner | laptop | 436 ms | 9.1 s | 388 ms | 9.1 s | 16 ms | 193 | 32,673 | 15.1 MB / 15.1 MB | 611 kB | (laptop) | yes | **no** (15) |
| Coach: Calendar month | owner | laptop | 424 ms | 9.1 s | 384 ms | 9.0 s | 16 ms | 193 | 32,673 | 15.1 MB / 15.1 MB | 611 kB | (laptop) | yes | **no** (15) |
| Coach: Clients (list; Board and Table are taps) | owner | laptop | 428 ms | 9.1 s | 396 ms | 9.1 s | 88 ms | 193 | 32,673 | 15.1 MB / 15.1 MB | 611 kB | (laptop) | yes | **no** (15) |
| Coach: a client with a year of history | owner | laptop | 9.3 s | 9.3 s | 9.3 s | 9.3 s | 240 ms | 194 | 32,873 | 15.2 MB / 15.2 MB | 611 kB | (laptop) | **no** | **no** (15) |
| Coach: Leads | owner | laptop | 428 ms | 9.1 s | 372 ms | 9.1 s | 288 ms | 194 | 32,678 | 15.1 MB / 15.1 MB | 611 kB | (laptop) | **no** | **no** (15) |
| Coach: Network table | owner | laptop | 424 ms | 9.1 s | 416 ms | 9.0 s | 240 ms | 196 | 32,680 | 15.1 MB / 15.1 MB | 611 kB | (laptop) | **no** | **no** (15) |
| Coach: Network map | owner | laptop | 464 ms | 9.1 s | 392 ms | 9.0 s | 248 ms | 197 | 32,681 | 15.1 MB / 15.1 MB | 611 kB | (laptop) | **no** | **no** (15) |
| Coach: search | owner | laptop | 9.2 s | 9.2 s | 9.2 s | 9.2 s | 544 ms | 195 | 32,674 | 15.1 MB / 15.1 MB | 611 kB | (laptop) | **no** | **no** (15) |
| Coach: Today | associate | phone | 9.0 s | 9.0 s | 8.3 s | 8.3 s | - | 192 | 10,015 | 5.2 MB / 408 kB | 486 kB | **no** | - | **no** (6) |
| Coach: To-dos | associate | phone | 8.9 s | 8.9 s | 8.1 s | 8.1 s | 552 ms | 191 | 10,015 | 5.2 MB / 408 kB | 486 kB | **no** | **no** | **no** (6) |
| Coach: Calendar week | associate | phone | 1.4 s | 9.0 s | 512 ms | 8.3 s | - | 191 | 10,015 | 5.2 MB / 408 kB | 486 kB | **no** | - | **no** (6) |
| Coach: Calendar month | associate | phone | 1.4 s | 9.0 s | 476 ms | 8.2 s | - | 191 | 10,015 | 5.2 MB / 408 kB | 486 kB | **no** | - | **no** (6) |
| Coach: Clients (list; Board and Table are taps) | associate | phone | 1.4 s | 8.9 s | 500 ms | 8.2 s | - | 191 | 10,015 | 5.2 MB / 408 kB | 486 kB | **no** | - | **no** (6) |
| Coach: a client with a year of history | associate | phone | 9.5 s | 9.5 s | 8.7 s | 8.7 s | 32 ms | 192 | 10,135 | 5.2 MB / 413 kB | 486 kB | **no** | yes | **no** (6) |
| Coach: search | associate | phone | 9.0 s | 9.0 s | 8.2 s | 8.2 s | 1128 ms | 192 | 10,015 | 5.2 MB / 408 kB | 486 kB | **no** | **no** | **no** (6) |
| Coach: Today | owner | phone | 38.2 s | 38.2 s | 37.5 s | 37.5 s | - | 195 | 32,674 | 15.1 MB / 1.3 MB | 486 kB | **no** | - | **no** (15) |
| Coach: To-dos | owner | phone | 37.8 s | 37.8 s | 37.0 s | 37.0 s | 928 ms | 193 | 32,673 | 15.1 MB / 1.3 MB | 486 kB | **no** | **no** | **no** (15) |
| Coach: Calendar week | owner | phone | 1.4 s | 38.1 s | 528 ms | 37.4 s | - | 193 | 32,673 | 15.1 MB / 1.3 MB | 486 kB | **no** | - | **no** (15) |
| Coach: Calendar month | owner | phone | 1.4 s | 37.9 s | 480 ms | 37.2 s | - | 193 | 32,673 | 15.1 MB / 1.3 MB | 486 kB | **no** | - | **no** (15) |
| Coach: Clients (list; Board and Table are taps) | owner | phone | 1.4 s | 38.3 s | 480 ms | 37.4 s | - | 193 | 32,673 | 15.1 MB / 1.3 MB | 486 kB | **no** | - | **no** (15) |
| Coach: a client with a year of history | owner | phone | 39.8 s | 39.8 s | 39.1 s | 39.1 s | 32 ms | 194 | 32,873 | 15.2 MB / 1.3 MB | 486 kB | **no** | yes | **no** (15) |
| Coach: Leads | owner | phone | 1.4 s | 38.0 s | 516 ms | 37.3 s | 32 ms | 194 | 32,678 | 15.1 MB / 1.3 MB | 486 kB | **no** | yes | **no** (15) |
| Coach: Network table | owner | phone | 1.7 s | 37.8 s | 676 ms | 37.1 s | 24 ms | 196 | 32,680 | 15.1 MB / 1.3 MB | 486 kB | **no** | yes | **no** (15) |
| Coach: Network map | owner | phone | 1.7 s | 37.8 s | 604 ms | 37.0 s | 920 ms | 197 | 32,681 | 15.1 MB / 1.3 MB | 486 kB | **no** | **no** | **no** (15) |
| Coach: search | owner | phone | 38.3 s | 38.3 s | 37.7 s | 37.7 s | 2176 ms | 195 | 32,674 | 15.1 MB / 1.3 MB | 486 kB | **no** | **no** | **no** (15) |

Notes on the table. On the phone, the calendar and Clients have different controls (no Week/Month buttons, no Table), so a "-" there means no tap was found. Coach Today's "Notifications" button carries a count in its name, so it wasn't pressed. Search's "slowest tap" is opening the search box; typing in it is listed under the misses.

## Misses, worst first

1. **The coach portal loads all of the coach's data in one go, and the browser then takes far too long to take it in.** Owner: 38 s on a phone and 9.1 s on a laptop before any page shows data. Associate: 9.0 s and 2.3 s. This affects every coach page. Cause: payload, then render.
   - Payload: `fetchAll` in `src/lib/coach/store.js` reads 67 tables with `select('*').limit(5000)`, 6 at a time. For the owner that is 32,674 rows and 15.1 MB (1.3 MB gzipped). The biggest reads are `coach_cal_items` (5,000 rows, 4.7 MB), `coach_sessions` (4,425 rows, 2.7 MB), `coach_session_notes` (3,630 rows, 1.3 MB), `coach_todos` (1,500 rows, 1.1 MB), `coach_session_people` (4,425 rows), `coach_lead_events` (2,400), `time_entries` (2,000), `activity_log` (2,000), `client_notes` (1,800) and `engagements` (1,000). The rest of the 15 flagged reads are under 500 rows each but over 200 kB.
   - The database isn't the slow part. On the laptop, all 67 reads were answered 1.07 s after the first one. On the phone they were answered by 3.1 s. Yet data shows at 9.1 s and 38 s.
   - Render (the main cost): `loadCoach` merges the rows one at a time with `next = setRow(next, table, row, …)`. `setRow` copies the table's whole row and mark objects on every call, so the work grows with the square of the row count. The same merge replayed in Node with the owner's counts takes 10.4 s, and 1.5 s with the associate's. That matches the measured gap of about 8 s on the laptop, and the gap is 4 times wider with the phone's CPU slowed 4 times.
   - **A silent truncation.** The owner's `coach_cal_items` hits the 5,000-row limit (2 years of calendar), so items beyond it are quietly missing.

2. **The coach's copy on the device is never kept, so a warm visit and an offline reload are no faster and show nothing.** Warm visits measure the same as cold ones on every coach page. After a visit, localStorage holds about 2 kB: `clarity-cache:<id>:coach` is missing for both the owner (about 15 MB of JSON) and the associate (about 5 MB). Both are over the browser's localStorage limit of about 5 MB per site. `writeJson` in `src/lib/deviceStore.js` catches the quota error and says nothing. Cause: payload, plus where the copy is stored. This also breaks "Works on a flight" for coaches at this scale.

3. **The coach portal after an offline reload takes 7.4 s on the laptop and 8.8 s on the phone, then shows an empty Today ("No calls today").** Trace from `tests/scale/offline-reload.mjs`:
   - `ProtectedLayout` holds every coach page behind the coach code check, `signInStop` in `src/lib/signIn/flow.js` calling `loadCoachAuth` in `src/lib/signIn/coachAuthData.js`.
   - Offline, the `coach_auth_state` RPC fails at once. `loadCoachAuth` then falls back to `ownCoachRow`, a `coaches` GET.
   - supabase-js 2.112's postgrest-js retries GETs on network errors 3 times, waiting 1 s, 2 s and 4 s (`DEFAULT_MAX_RETRIES`, `getRetryDelay`). `connectionFetch` fails fast when offline, but the retries still wait. The trace shows the same GETs failing at 51 ms, 1,059 ms, 3,066 ms and 7,073 ms, and the Loading screen leaves at 7,085 ms. That is the "about 7 seconds" from run 6.
   - The shell then shows at 7.4 s, empty, because of miss 2.
   - AuthContext's profile read and the Mission header reads go through the same 7-second retries.
   - The 6-digit code rule isn't involved in the wait. The wait is the fallback read and its retries. Cause: waterfall (retries).

4. **Taps over 100 ms in the coach portal.** Opening search: owner 544 ms on the laptop and 2.2 s on the phone; associate 304 ms and 1.1 s. Typing in search: owner 96 ms on the laptop and 720 ms on the phone. Opening the menu: owner 240 to 330 ms on the laptop and about 930 ms on the phone; associate about 150 ms and 550 ms. Clients Board/Table/List switches: owner 80 to 88 ms on the laptop. Cause: render. The search box rebuilds its whole index on opening: every client, the 1,000 rows from `coach_admin_clients`, and all calendar items through `searchItems`. The menu works out today's to-dos and the Network counts as it opens.

5. **One database read is slow and grows with the whole table: `coach_session_people`.** 295 ms for the owner and 260 ms for the associate (EXPLAIN ANALYZE):
   ```
   Seq Scan on coach_session_people (actual time=0.482..293.759 rows=4425 loops=1)
     Filter: ((InitPlan 1).col1 AND (SubPlan 2))   Rows Removed by Filter: 10325
   ```
   The row rule `(select public.coach_owns_session(session_id))` runs a security-definer function for every row of every coach's sessions (14,750). There is no `coach_id` column to filter on first. The next costliest reads use the same per-row subplan: `coach_session_notes` (66 ms), `client_notes` (33 ms) and `client_profiles` (12 ms, a sequential scan). Every other read is under 17 ms. Cause: query (the rule's shape) and index (nothing selective on the coach).

6. **The client portal's first screen on a phone is just over 1 s on 6 of 7 pages.** Home 1.4 s, Dashboard 2.1 s, Daily plan, Daily review and the debrief 1.0 to 1.1 s (data by 1.2 to 1.3 s), the sprint 0.78 s (data 1.2 s). Only My Account is under 1 s. Warm visits take 30 to 200 ms everywhere. Cause: payload (app) and a request waterfall.
   - The app sends 486 to 590 kB over the wire (brotli). The main chunk, `index-*.js`, is 1.7 MB of JavaScript before compression, and it has to be parsed on a slowed CPU before anything paints. First contentful paint is about 340 ms.
   - Each page makes 16 to 90 requests. Home makes 62 with only 323 rows. Many repeat: `performance_plans` ×4, `profiles` ×3, `person_settings` ×3, `day_plans` ×3, `day_reviews` ×3, plus `guest_claim`, `alignment_claim` and `my_coach` on every page.
   - `warmDevice` begins its own reads 4 s in. On a coach page it adds about 110 requests for the coach's own client-side pages.
   - The Dashboard is the heaviest client page: 90 requests, 2,130 rows, 358 kB raw, including `habit_logs` 449 rows and `day_plans` 153. Every client read is index-backed and under 12 ms (EXPLAIN in `explain.mjs`).

7. **No list loads everything on the client side, and Network is paged properly.** `network_page` takes 50 at a time (6.5 ms) and `network_map` 150 (3.3 ms); search asks for matches only. The flagged whole-list reads are all in the coach shell (miss 1), plus `coach_admin_clients` (all 1,000 clients for the owner, 358 kB, called twice on every coach page). Clients' `coach_client_list` returned 200 rows for the owner.

## The coach portal after an offline reload (run 6 measured about 7 s)

7.4 s on the laptop and 8.8 s on a phone (owner, CPU slowed 4 times). The time is spent behind the coach code check's fallback read of the coach row, which supabase-js retries 1 s, 2 s and 4 s while offline (miss 3). After that the portal opens empty, because the coach's data was never kept on the device (miss 2). The 6-digit code rule itself costs nothing offline here. The wait comes from retrying a read that can't succeed.
