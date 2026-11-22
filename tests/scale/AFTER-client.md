# Scale and speed check: client pages and migration 056, after fixer B (step 3)

Measured 22 Nov 2026 on feature/performance-overhaul, on the same local stand-in as `BASELINE.md` (PGlite with PostgREST 16.5 and the real row rules, 1,000 clients and 15 coaches), with migration 056 applied to a copy of the scale snapshot (`base-scale-056.tar`; `base-scale.tar` untouched). The app is a production build against the stand-in only, served by `serve.mjs` (HTTP/1.1, brotli). Nothing hosted was touched and nothing was sent. Raw results: `after-client-results.jsonl` (same shape as `baseline-results.jsonl`). The build included fixer A's coach portal work in progress in the same working tree; it doesn't touch the client pages' loading.

The client is scale-client-0001. "First screen" is the largest contentful paint; "data shown" is when the page last changed before going quiet. The phone is 390 × 844 on Chrome's Fast 4G with the CPU slowed 4 times.

## What changed

1. **Migration 056** (database): the coach rules that ran a check once per row now ask once (see the EXPLAIN table below).
2. **One read, shared** (`src/lib/readShare.js`, wired into `connectionFetch`): a database read identical to one already on its way, or answered in the last 2.5 s, gets that answer. Same address, same sign-in, same Accept/Prefer/Range; any write forgets everything (before and after it is sent); reads with their own abort signal, failed reads and non-database reads are never kept; a change of sign-in forgets everything. Five STABLE read-only functions (`my_coach`, `my_coach_invites`, `my_session_recaps`, `my_view_asks`, `my_cover_asks`) don't count as writes. The header's active-plan read now uses the pages' columns, so the two share one request.
3. **Loaders**: the Daily plan's (and so the Daily review's) day reads, and the dashboard's own reads, go out alongside the sprint page's instead of after them (one round trip less; the same reads).
4. **The guest claims** (`guest_claim`, `alignment_claim`: writes) wait 2 s and for an idle moment, so they don't make the first screen's shared reads be asked again.
5. **warmDevice** on the coach portal's pages: waits (looking every 30 s) until the coach is on a client page; its loaders are fetched only when it starts.
6. **App size**: every page is its own part (`App.jsx` `page()`); the opening part no longer imports the design index (`components/design/index.js`) or the performance loaders. Opening part: 1.72 MB → 609 kB of JavaScript (raw). The client pages' shared code is one part (`client-core`, 530 kB raw) instead of about 35 small files. index.html names the opening page's files for the address being opened (`openingPreload` in `vite.config.js`), the app holds its opening screen until that page's part is there (at most 4 s) so React's 300 ms Suspense hold-back never applies, and every other page's part loads one at a time from 6 s after opening, when idle. The service worker still precaches every built file.

## Every client page, before and after

| Page | Size | Cold first screen | Cold data shown | Warm first screen | Slowest tap | Requests | Rows | Data (raw) | App bytes (cold, wire) and files | First screen under 1 s on 4G | Taps under 100 ms |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Home | laptop | 108 ms → **72 ms** | 142 ms → 109 ms | 76 ms → 64 ms | 24 ms → 24 ms | 62 → **57** | 323 → 317 | 95 kB → 94 kB | 646 kB / 10 → 584 kB / 35 | (laptop) | yes |
| Daily plan | laptop | 152 ms → **52 ms** | 152 ms → 109 ms | 72 ms → 36 ms | 24 ms → 16 ms | 47 → **46** | 328 → 328 | 93 kB → 93 kB | 604 kB / 9 → 530 kB / 30 | (laptop) | yes |
| Daily review | laptop | 152 ms → **56 ms** | 152 ms → 110 ms | 64 ms → 56 ms | 16 ms → 24 ms | 45 → **42** | 331 → 330 | 93 kB → 93 kB | 604 kB / 9 → 529 kB / 29 | (laptop) | yes |
| The sprint | laptop | 96 ms → **80 ms** | 145 ms → 109 ms | 80 ms → 72 ms | 32 ms → 24 ms | 31 → **27** | 195 → 193 | 40 kB → 39 kB | 646 kB / 10 → 576 kB / 33 | (laptop) | yes |
| Dashboard | laptop | 100 ms → **84 ms** | 190 ms → 148 ms | 84 ms → 72 ms | 24 ms → 24 ms | 58 → **46** | 1,568 → 1,427 | 267 kB → 243 kB | 646 kB / 10 → 572 kB / 32 | (laptop) | yes |
| Weekly debrief | laptop | 72 ms → **56 ms** | 141 ms → 122 ms | 68 ms → 56 ms | - → - | 53 → **44** | 1,532 → 1,522 | 296 kB → 294 kB | 604 kB / 9 → 530 kB / 30 | (laptop) | yes |
| My Account | laptop | 116 ms → **84 ms** | 116 ms → 84 ms | 64 ms → 52 ms | 24 ms → 24 ms | 16 → **13** | 109 → 108 | 52 kB → 52 kB | 604 kB / 9 → 533 kB / 34 | (laptop) | yes |
| Home | phone | 1.36 s → **1.09 s** | 1.36 s → 1.09 s | 164 ms → 172 ms | 40 ms → 24 ms | 62 → **59** | 323 → 317 | 94 kB → 94 kB | 561 kB / 10 → 499 kB / 35 | **no** (was no) | yes |
| Daily plan | phone | 1.04 s → **928 ms** | 1.25 s → 1.04 s | 32 ms → 44 ms | 16 ms → 16 ms | 47 → **48** | 328 → 328 | 92 kB → 93 kB | 498 kB / 9 → 424 kB / 30 | yes (was no) | yes |
| Daily review | phone | 1.05 s → **924 ms** | 1.32 s → 1.03 s | 36 ms → 48 ms | 32 ms → 32 ms | 45 → **44** | 331 → 330 | 93 kB → 93 kB | 498 kB / 9 → 423 kB / 29 | yes (was no) | yes |
| The sprint | phone | 784 ms → **656 ms** | 1.18 s → 993 ms | 172 ms → 188 ms | 24 ms → 24 ms | 31 → **29** | 195 → 193 | 39 kB → 39 kB | 604 kB / 10 → 533 kB / 33 | yes (was yes) | yes |
| Dashboard | phone | 2.05 s → **1.22 s** | 2.05 s → 1.22 s | 204 ms → 220 ms | 16 ms → 24 ms | 90 → **48** | 2,130 → 1,427 | 367 kB → 243 kB | 604 kB / 10 → 530 kB / 32 | **no** (was no) | yes |
| Weekly debrief | phone | 1.04 s → **940 ms** | 1.31 s → 1.12 s | 32 ms → 44 ms | - → - | 53 → **46** | 1,532 → 1,522 | 296 kB → 294 kB | 498 kB / 9 → 424 kB / 30 | yes (was no) | yes |
| My Account | phone | 796 ms → **680 ms** | 986 ms → 821 ms | 128 ms → 140 ms | 24 ms → 24 ms | 16 → **13** | 109 → 108 | 52 kB → 52 kB | 604 kB / 9 → 533 kB / 34 | yes (was yes) | yes |

Against the targets: taps are all under 100 ms. No client list loads everything. On the phone, the first screen is under 1 s on 5 of 7 pages (was 2 of 7); Home (1.09 s) and the Dashboard (1.22 s, was 2.05 s) still miss. In both, the last large paint is data that arrives in the third or fourth round of reads (Home's suggestion card, here "Sleep wind down" after 21:00, which waits for the wind-down and own-questions stores' table checks; the Dashboard's hero figure, which needs the sprint page's three rounds); the header and title are painted by about 700 ms.

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
