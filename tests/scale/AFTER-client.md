# Scale and speed check: client pages and migration 056, after fixers B and C (step 3)

Measured 22 Nov 2026 on feature/performance-overhaul, on the same local stand-in as `BASELINE.md` (PGlite with PostgREST 16.5 and the real row rules, 1,000 clients and 15 coaches), with migration 056 applied to a copy of the scale snapshot (`base-scale-056.tar`; `base-scale.tar` untouched). The app is a production build against the stand-in only, served by `serve.mjs` (HTTP/1.1, brotli). Nothing hosted was touched and nothing was sent. Raw results: `after-client-results.jsonl` (same shape as `baseline-results.jsonl`). The build included fixer A's coach portal work in progress in the same working tree; it doesn't touch the client pages' loading.

**After C** (the same evening, the same stand-in, ports 54420 and 4349, `serve.mjs` still HTTP/1.1): each cell below reads original → after B → **after C**. Raw results: `after-c-client-results.jsonl`. The build included fixer A's coach portal work in progress; it doesn't touch the client pages' loading.

The client is scale-client-0001. "First screen" is the largest contentful paint; "data shown" is when the page last changed before going quiet. The phone is 390 × 844 on Chrome's Fast 4G with the CPU slowed 4 times.

## What changed

1. **Migration 056** (database): the coach rules that ran a check once per row now ask once (see the EXPLAIN table below).
2. **One read, shared** (`src/lib/readShare.js`, wired into `connectionFetch`): a database read identical to one already on its way, or answered in the last 2.5 s, gets that answer. Same address, same sign-in, same Accept/Prefer/Range; any write forgets everything (before and after it is sent); reads with their own abort signal, failed reads and non-database reads are never kept; a change of sign-in forgets everything. Five STABLE read-only functions (`my_coach`, `my_coach_invites`, `my_session_recaps`, `my_view_asks`, `my_cover_asks`) don't count as writes. The header's active-plan read now uses the pages' columns, so the two share one request.
3. **Loaders**: the Daily plan's (and so the Daily review's) day reads, and the dashboard's own reads, go out alongside the sprint page's instead of after them (one round trip less; the same reads).
4. **The guest claims** (`guest_claim`, `alignment_claim`: writes) wait 2 s and for an idle moment, so they don't make the first screen's shared reads be asked again.
5. **warmDevice** on the coach portal's pages: waits (looking every 30 s) until the coach is on a client page; its loaders are fetched only when it starts.
6. **App size**: every page is its own part (`App.jsx` `page()`); the opening part no longer imports the design index (`components/design/index.js`) or the performance loaders. Opening part: 1.72 MB → 609 kB of JavaScript (raw). The client pages' shared code is one part (`client-core`, 530 kB raw) instead of about 35 small files. index.html names the opening page's files for the address being opened (`openingPreload` in `vite.config.js`), the app holds its opening screen until that page's part is there (at most 4 s) so React's 300 ms Suspense hold-back never applies, and every other page's part loads one at a time from 6 s after opening, when idle. The service worker still precaches every built file.

## What changed (fixer C)

1. **One round of reads.** The sprint page, Home, the dashboard, Daily plan and Daily review now send every read at once (the debrief in two rounds, was four). What waited for the running sprint is read through it on the database (an embedded filter on `sprints`, one running sprint per person); a sprint habit's settings and logs, a day plan's to-dos and Strategies and a review's Strategies come inside their parent's read; the person's live objectives and Strategies (every plan's, a handful) are read once and narrowed on the device. The wins are read from 26 weeks back, and again from the sprint's start in the rare case it began earlier. Each page gets exactly the rows it had (`tests/performance/parallel-loaders.test.mjs`).
2. **One select per table.** The header (`AuthContext`, `MissionContext`), the menu (`menuPins.js`) and the loaders read `profiles` and `person_settings` with one column list each (`src/lib/sharedReads.js`); every sprint, every debrief, the objectives and the Strategies have one read each that every loader uses (`src/lib/performance/pageReads.js`), so `readShare.js` sends each once per page. Home: 3 reads of `day_plans` and 3 of `day_reviews` are one each (the two newest up to today).
3. **Sent as the app opens.** `main.jsx` sends the opening page's reads (Home, the dashboard, the sprint page, Daily plan, Daily review; nothing on any other page, nothing for someone not signed in on the device) before the page's own code arrives; the page's loaders make the same reads and get those answers. On the phone the reads now leave at about 0.48 s instead of 0.65 s.

## Every client page, before and after

| Page | Size | Cold first screen | Cold data shown | Warm first screen | Slowest tap | Requests | Rows | Data (raw) | App bytes (cold, wire) and files | First screen under 1 s on 4G | Taps under 100 ms |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Home | laptop | 108 ms → 72 ms → **84 ms** | 142 ms → 109 ms → **86 ms** | 76 ms → 64 ms → **64 ms** | 24 ms → 24 ms → **24 ms** | 62 → 57 → **43** | 323 → 317 → **300** | 95 kB → 94 kB → **106 kB** | 646 kB / 10 → 584 kB / 35 → **573 kB / 36** | (laptop) | yes |
| Daily plan | laptop | 152 ms → 52 ms → **56 ms** | 152 ms → 109 ms → **89 ms** | 72 ms → 36 ms → **40 ms** | 24 ms → 16 ms → **24 ms** | 47 → 46 → **38** | 328 → 328 → **314** | 93 kB → 93 kB → **105 kB** | 604 kB / 9 → 530 kB / 30 → **520 kB / 31** | (laptop) | yes |
| Daily review | laptop | 152 ms → 56 ms → **100 ms** | 152 ms → 110 ms → **100 ms** | 64 ms → 56 ms → **52 ms** | 16 ms → 24 ms → **24 ms** | 45 → 42 → **32** | 331 → 330 → **314** | 93 kB → 93 kB → **105 kB** | 604 kB / 9 → 529 kB / 29 → **519 kB / 30** | (laptop) | yes |
| The sprint | laptop | 96 ms → 80 ms → **92 ms** | 145 ms → 109 ms → **92 ms** | 80 ms → 72 ms → **68 ms** | 32 ms → 24 ms → **24 ms** | 31 → 27 → **21** | 195 → 193 → **180** | 40 kB → 39 kB → **52 kB** | 646 kB / 10 → 576 kB / 33 → **565 kB / 34** | (laptop) | yes |
| Dashboard | laptop | 100 ms → 84 ms → **72 ms** | 190 ms → 148 ms → **103 ms** | 84 ms → 72 ms → **80 ms** | 24 ms → 24 ms → **24 ms** | 58 → 46 → **36** | 1,568 → 1,427 → **1,329** | 267 kB → 243 kB → **237 kB** | 646 kB / 10 → 572 kB / 32 → **561 kB / 33** | (laptop) | yes |
| Weekly debrief | laptop | 72 ms → 56 ms → **52 ms** | 141 ms → 122 ms → **102 ms** | 68 ms → 56 ms → **64 ms** | - → - → **-** | 53 → 44 → **36** | 1,532 → 1,522 → **1,300** | 296 kB → 294 kB → **284 kB** | 604 kB / 9 → 530 kB / 30 → **520 kB / 31** | (laptop) | yes |
| My Account | laptop | 116 ms → 84 ms → **92 ms** | 116 ms → 84 ms → **92 ms** | 64 ms → 52 ms → **60 ms** | 24 ms → 24 ms → **24 ms** | 16 → 13 → **12** | 109 → 108 → **107** | 52 kB → 52 kB → **51 kB** | 604 kB / 9 → 533 kB / 34 → **523 kB / 35** | (laptop) | yes |
| Home | phone | 1.36 s → 1.09 s → **796 ms** | 1.36 s → 1.09 s → **796 ms** | 164 ms → 172 ms → **176 ms** | 40 ms → 24 ms → **24 ms** | 62 → 59 → **45** | 323 → 317 → **300** | 94 kB → 94 kB → **106 kB** | 561 kB / 10 → 499 kB / 35 → **573 kB / 36** | yes (B: no, original: no) | yes |
| Daily plan | phone | 1.04 s → 928 ms → **520 ms** | 1.25 s → 1.04 s → **828 ms** | 32 ms → 44 ms → **40 ms** | 16 ms → 16 ms → **16 ms** | 47 → 48 → **40** | 328 → 328 → **313** | 92 kB → 93 kB → **104 kB** | 498 kB / 9 → 424 kB / 30 → **416 kB / 31** | yes (B: yes, original: no) | yes |
| Daily review | phone | 1.05 s → 924 ms → **520 ms** | 1.32 s → 1.03 s → **834 ms** | 36 ms → 48 ms → **44 ms** | 32 ms → 32 ms → **32 ms** | 45 → 44 → **34** | 331 → 330 → **314** | 93 kB → 93 kB → **105 kB** | 498 kB / 9 → 423 kB / 29 → **416 kB / 30** | yes (B: yes, original: no) | yes |
| The sprint | phone | 784 ms → 656 ms → **668 ms** | 1.18 s → 993 ms → **752 ms** | 172 ms → 188 ms → **188 ms** | 24 ms → 24 ms → **24 ms** | 31 → 29 → **21** | 195 → 193 → **180** | 39 kB → 39 kB → **52 kB** | 604 kB / 10 → 533 kB / 33 → **565 kB / 34** | yes (B: yes, original: yes) | yes |
| Dashboard | phone | 2.05 s → 1.22 s → **892 ms** | 2.05 s → 1.22 s → **892 ms** | 204 ms → 220 ms → **232 ms** | 16 ms → 24 ms → **24 ms** | 90 → 48 → **38** | 2,130 → 1,427 → **1,329** | 367 kB → 243 kB → **237 kB** | 604 kB / 10 → 530 kB / 32 → **520 kB / 33** | yes (B: no, original: no) | yes |
| Weekly debrief | phone | 1.04 s → 940 ms → **512 ms** | 1.31 s → 1.12 s → **997 ms** | 32 ms → 44 ms → **56 ms** | - → - → **-** | 53 → 46 → **38** | 1,532 → 1,522 → **1,300** | 296 kB → 294 kB → **284 kB** | 498 kB / 9 → 424 kB / 30 → **416 kB / 31** | yes (B: yes, original: no) | yes |
| My Account | phone | 796 ms → 680 ms → **684 ms** | 986 ms → 821 ms → **830 ms** | 128 ms → 140 ms → **144 ms** | 24 ms → 24 ms → **24 ms** | 16 → 13 → **12** | 109 → 108 → **107** | 52 kB → 52 kB → **51 kB** | 604 kB / 9 → 533 kB / 34 → **523 kB / 35** | yes (B: yes, original: yes) | yes |

Against the targets, after C: every client page's first screen is under 1 s on the phone (Home 0.80 s, the Dashboard 0.89 s; a second run gave 0.80 s and 0.89 s), and every laptop page under 0.11 s. Taps are all under 100 ms. No client list loads everything. Requests per cold visit fell on every page (Home 59 → 45, the Dashboard 48 → 38, the sprint page 29 → 21). Daily plan, Daily review and the debrief now show their first screen before their data (their largest paint comes first), so compare "data shown" there: 1.04 → 0.83 s, 1.03 → 0.83 s and 1.12 → 1.00 s.

After B: on the phone, the first screen was under 1 s on 5 of 7 pages (was 2 of 7); Home (1.09 s) and the Dashboard (1.22 s, was 2.05 s) still missed. In both, the last large paint was data that arrived in the third or fourth round of reads; the header and title were painted by about 700 ms.

Notes on C's numbers. The laptop's figures move 10 to 40 ms from run to run (a second laptop run gave Home 68 ms, Daily plan 68, Daily review 68, the sprint page 76, the Dashboard 72, the debrief 56, My Account 92), so the laptop rows that read higher than B's are within that; all are under 0.11 s. Data (raw) rises by about 12 kB on Home (the shared reads bring every sprint, debrief, objective and Strategy, and the wider profile and settings rows) and falls on the Dashboard. App bytes on Home and the sprint page rise by about 85 kB because the page now draws before the service worker has the two Nekst fonts, so they come over the network once instead of from its copy; the files are the same. `serve.mjs` and the stand-in speak HTTP/1.1, so a browser sends 6 requests at a time to each and every cross-origin read is preceded by a CORS check; HTTP/2 was not added, as every page meets the target without it (on hosted Supabase the first round's 20 reads go together).

Notes on reading the table. The warm visits on the phone are 10 to 20 ms slower on four pages (the page's part is read from the cache before the page shows); all are under 0.25 s. App bytes count every static file of a cold visit (JavaScript, styles, fonts, images) over the wire. The files count rises because each page is its own part; `serve.mjs` speaks HTTP/1.1 (6 connections), so many small files cost more here than on Vercel's HTTP/2, where they come down together. Request counts fall less than hoped: most repeats left are the same table read with different columns or filters by different loaders (profiles 3 ways, person_settings 2 to 3, day_plans and day_reviews 3 each on Home), which sharing can't merge without changing the loaders themselves.

## Migration 056: EXPLAIN ANALYZE before and after (1,000 clients)

`node tests/scale/explain.mjs --from base-scale.tar` and `--from base-scale-056.tar`, as each person (aal2 for coaches).

| Who | Read | Rows | Before | After |
|---|---|---|---|---|
| owner | shell: coach_cal_items select * limit 5000 | 5000 | 17.8 ms | 16.6 ms |
| owner | shell: coach_sessions select * limit 5000 | 4425 | 2.9 ms | 2.8 ms |
| owner | shell: coach_session_people select * limit 5000 | 4425 | 296.4 ms | 11.1 ms |
| owner | shell: coach_session_notes select * limit 5000 | 3630 | 65.6 ms | 6.1 ms |
| owner | shell: client_notes select * limit 5000 | 1800 | 33.7 ms | 2.1 ms |
| owner | shell: engagements select * limit 5000 | 1000 | 0.6 ms | 0.8 ms |
| owner | shell: time_entries select * limit 5000 | 2000 | 0.8 ms | 0.9 ms |
| owner | shell: coach_todos select * limit 5000 | 1500 | 1.6 ms | 1.1 ms |
| owner | shell: coach_lead_events select * limit 5000 | 2400 | 1.1 ms | 1.1 ms |
| owner | shell: activity_log select * limit 5000 | 2000 | 0.8 ms | 0.8 ms |
| owner | shell: coach_notifications select * limit 5000 | 300 | 0.2 ms | 0.2 ms |
| owner | shell: client_profiles select * limit 5000 | 300 | 11.7 ms | 1.8 ms |
| owner | shell: coach_bookings select * limit 5000 | 400 | 0.3 ms | 0.3 ms |
| owner | shell: coach_leads select * limit 5000 | 400 | 0.3 ms | 0.4 ms |
| owner | rpc coach_admin_clients() | 1000 | 5.0 ms | 6.4 ms |
| owner | rpc coach_client_list() | 200 | 35.0 ms | 47.3 ms |
| owner | rpc network_page (table, first 50) | 1 | 9.2 ms | 6.5 ms |
| owner | rpc network_map() | 1 | 3.2 ms | 3.2 ms |
| owner | rpc network_counts() | 1 | 0.8 ms | 0.8 ms |
| associate | shell: coach_session_people (associate) | 1770 | 263.1 ms | 3.4 ms |
| associate | shell: coach_session_notes (associate) | 1451 | 26.3 ms | 2.0 ms |
| client | home: own_question_answers since 70 days or weekly | 99 | 0.3 ms | 0.2 ms |
| client | dashboard: habit_logs for 20 sprint habits | 918 | 7.9 ms | 7.4 ms |
| client | dashboard: day_plans 6 months | 152 | 1.2 ms | 1.3 ms |
| client | dashboard: day_reviews 6 months | 132 | 0.9 ms | 1.0 ms |
| client | home: week_scores all | 52 | 0.1 ms | 0.1 ms |
| client | sprint: todos this sprint and backlog | 27 | 0.1 ms | 0.1 ms |

The plan for the owner's session people, before: `Seq Scan … Filter: ((InitPlan 1).col1 AND (SubPlan 2)) Rows Removed by Filter: 10325` with `coach_owns_session()` run for each of the 14,750 rows. After: `Filter: ((InitPlan 1).col1 AND (ANY (session_id = (hashed SubPlan 2).col1)))`, the coach's sessions asked once. The scan of 14,750 small rows is still there but costs about 3 to 10 ms; it grows with the whole table only linearly and cheaply. The other reads in the baseline were checked for a missing index: `coach_todos (coach_id)` (only partial indexes before), `time_entries (coach_id, started_at desc)` and `client_profiles (coach_id)` (049's covers unmerged rows only) were added; the rest are index-backed or small. `coach_client_list` (35 to 47 ms, run to run) is a function, untouched by 056.
