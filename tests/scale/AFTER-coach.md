# Scale and speed check: the coach portal after the fixes (fixer A)

Measured 22 Nov 2026 on feature/performance-overhaul with fixer A's commits (ca2a11f5, ef3b8abe, 19c6b603, ca5283e5 and the last one, "only a load after a server write waits for a second read"), on the same local stand-in as BASELINE.md (PGlite with PostgREST 16.5 and the real row rules, migrations to 055, the base-scale snapshot), served like Vercel. Nothing hosted was touched and nothing was sent. The working tree also held fixers B's and C's changes (migration 056 is not in this snapshot; their client-side changes are in the build). Raw results: `after-coach-results.jsonl`.

**One change to how "data shown" is read.** The app now adds prefetch links to the page's head about 2 s after it opens (the route split). The baseline's timer counts any change to the page, so every page read "data shown at 2.1 s" whatever its data did. These results use the same timer with changes inside the head left out. First screen, taps, requests, rows and bytes are measured exactly as in the baseline.

**Same caveat as the baseline.** PGlite answers one request at a time, so on a phone the database part of a cold visit takes about 3 s here (the owner's first reads end about 3.3 s in); on Supabase they run side by side.

## What changed

1. **The merge is one pass** (`mergeTable`, `mergeLoaded` in `src/lib/coach/store.js`). It copied the whole table for every row: 10.4 s of work for the owner. Now linear, checked row for row against the old merge on 300 random copies (`tests/performance/coach-store-merge.test.mjs`). Rows and tables that haven't changed are handed back as they were, compared field by field.
2. **Loading in tiers, nothing cut off.** First: every table in full but four, the calendar from 6 weeks back to 4 months ahead (every series and its stand-ins included), and the to-dos open or done in the last 60 days. Sessions and their people stay whole, because held sessions are counted from them and an engagement saved with a partial count would move its base. Later, after the page has drawn, once a visit: older to-dos, session notes, client notes, the activity log and lead events. Other calendar weeks are read as the coach moves to them (`ensureCalRange`, a month either side), an old session's page reads its own day, and search asks the database for calendar matches as it is typed (`findCalItems`). A read that fills 5,000 rows is read again a page of 1,000 at a time in key order until the table ends, so the owner's calendar no longer loses everything past 5,000. `coach_admin_clients` is read once a visit (again only when asked, or when the coach's own clients come or go).
3. **The device copy fits.** Over 2,000 rows (or refused by localStorage) it is kept in IndexedDB (`src/lib/coach/deviceCopy.js`), a table at a time, only the tables that changed, after the page has drawn. What waits to be sent stays in localStorage (`clarity-coach-local:`, marked partial), where Sign out leaves it. Sign out deletes the IndexedDB copy (`clearAppStorage`). Other tabs hear of changes by BroadcastChannel. A small copy (every test seed) is kept exactly as before.
4. **No retries for a lost connection** (`src/lib/noRetry.js`, set in `src/lib/supabase.js`). A read that fails for want of a connection is answered at once; a 503 or 520 is still tried again by postgrest-js.
5. **Taps.** The frame's lists are worked out once per change to their own table (`fromTable`). Opening the menu, search or the bell draws only the frame (`Frame`), not the page under it. Search's index is built once, quietly, with each calendar item's guests gathered once (it searched every guest for every item) and each item's words lower-cased once. The menu's counts and the call bar are memoised. Clients draws its first 60 rows at once and the rest straight after.
6. **A load after a server write sees it.** The coach portal's `/api` writes forget the reads fixer B's readShare.js keeps for 2.5 s, and `loadCoach(userId, { again: true })` queues one more load after one already on its way.

## Every coach page, before and after

Targets: the first screen under 1 s on 4G, every tap under 100 ms, no list that loads everything at once. "x" or "-" for a tap: none was found at that size (as in the baseline).

| Page | Who | Size | Cold first screen (before → after) | Cold data shown | Warm first screen | Warm data shown | Slowest tap | Requests | Rows | Data raw / gzip | First screen under 1 s on 4G | Taps under 100 ms | Whole lists over 500 rows or 200 kB |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Today | associate | laptop | 2.3 s → **1.0 s** | 2.3 s → **1.0 s** | 2.3 s → **412 ms** | 2.3 s → **412 ms** | 168 ms → **24 ms** | 83 → 82 | 10,001 → 7,747 | 5.4 MB → 3.4 MB / 289 kB | (laptop) | yes | 6 → 5 |
| To-dos | associate | laptop | 436 ms → **692 ms** | 2.3 s → **912 ms** | 376 ms → **368 ms** | 2.3 s → **376 ms** | 144 ms → **16 ms** | 83 → 82 | 10,002 → 7,748 | 5.4 MB → 3.4 MB / 289 kB | (laptop) | yes | 6 → 5 |
| Calendar week | associate | laptop | 436 ms → **688 ms** | 2.4 s → **1.0 s** | 384 ms → **372 ms** | 2.3 s → **439 ms** | 16 ms → **24 ms** | 191 → 82 | 10,015 → 8,179 | 5.4 MB → 3.8 MB / 319 kB | (laptop) | yes | 6 → 6 |
| Calendar month | associate | laptop | 428 ms → **684 ms** | 2.3 s → **988 ms** | 380 ms → **368 ms** | 2.3 s → **417 ms** | 16 ms → **24 ms** | 191 → 82 | 10,015 → 8,229 | 5.4 MB → 3.8 MB / 321 kB | (laptop) | yes | 6 → 6 |
| Clients (list; Board and Table are taps) | associate | laptop | 424 ms → **688 ms** | 2.3 s → **924 ms** | 372 ms → **364 ms** | 2.3 s → **403 ms** | 24 ms → **24 ms** | 82 → 81 | 10,001 → 7,747 | 5.4 MB → 3.4 MB / 289 kB | (laptop) | yes | 6 → 5 |
| A client with a year of history | associate | laptop | 2.5 s → **956 ms** | 2.5 s → **1.0 s** | 2.4 s → **428 ms** | 2.4 s → **428 ms** | 152 ms → **16 ms** | 192 → 82 | 10,135 → 7,867 | 5.5 MB → 3.4 MB / 293 kB | (laptop) | yes | 6 → 5 |
| Search | associate | laptop | 2.3 s → **936 ms** | 2.3 s → **936 ms** | 2.3 s → **408 ms** | 2.3 s → **408 ms** | 304 ms → **24 ms** | 83 → 82 | 10,001 → 7,747 | 5.4 MB → 3.4 MB / 289 kB | (laptop) | yes | 6 → 5 |
| Today | owner | laptop | 9.1 s → **1.1 s** | 9.1 s → **1.1 s** | 9.1 s → **484 ms** | 9.1 s → **523 ms** | 328 ms → **24 ms** | 195 → 84 | 32,674 → 27,847 | 15.8 MB → 11.9 MB / 1.0 MB | (laptop) | yes | 15 → 15 |
| To-dos | owner | laptop | 420 ms → **680 ms** | 9.0 s → **998 ms** | 384 ms → **364 ms** | 8.9 s → **381 ms** | 240 ms → **16 ms** | 194 → 83 | 32,674 → 27,847 | 15.8 MB → 11.9 MB / 1.0 MB | (laptop) | yes | 15 → 15 |
| Calendar week | owner | laptop | 436 ms → **688 ms** | 9.1 s → **1.3 s** | 388 ms → **380 ms** | 9.1 s → **519 ms** | 16 ms → **40 ms** | 193 → 83 | 32,673 → 28,836 | 15.8 MB → 12.8 MB / 1.1 MB | (laptop) | yes | 15 → 16 |
| Calendar month | owner | laptop | 424 ms → **676 ms** | 9.1 s → **1.2 s** | 384 ms → **364 ms** | 9.0 s → **462 ms** | 16 ms → **56 ms** | 193 → 83 | 32,673 → 28,911 | 15.8 MB → 12.9 MB / 1.1 MB | (laptop) | yes | 15 → 16 |
| Clients (list; Board and Table are taps) | owner | laptop | 428 ms → **692 ms** | 9.1 s → **1.1 s** | 396 ms → **384 ms** | 9.1 s → **773 ms** | 88 ms → **24 ms** | 193 → 82 | 32,673 → 27,846 | 15.8 MB → 11.9 MB / 1.0 MB | (laptop) | yes | 15 → 15 |
| A client with a year of history | owner | laptop | 9.3 s → **1.1 s** | 9.3 s → **1.2 s** | 9.3 s → **464 ms** | 9.3 s → **464 ms** | 240 ms → **16 ms** | 194 → 83 | 32,873 → 28,046 | 15.9 MB → 12.0 MB / 1.0 MB | (laptop) | yes | 15 → 15 |
| Leads | owner | laptop | 428 ms → **688 ms** | 9.1 s → **1.1 s** | 372 ms → **360 ms** | 9.1 s → **456 ms** | 288 ms → **24 ms** | 194 → 83 | 32,678 → 27,851 | 15.8 MB → 11.9 MB / 1.0 MB | (laptop) | yes | 15 → 15 |
| Network table | owner | laptop | 424 ms → **688 ms** | 9.1 s → **1.0 s** | 416 ms → **460 ms** | 9.0 s → **460 ms** | 240 ms → **16 ms** | 196 → 85 | 32,680 → 27,853 | 15.9 MB → 11.9 MB / 1.0 MB | (laptop) | yes | 15 → 15 |
| Network map | owner | laptop | 464 ms → **888 ms** | 9.1 s → **1.0 s** | 392 ms → **456 ms** | 9.0 s → **456 ms** | 248 ms → **24 ms** | 197 → 86 | 32,681 → 27,854 | 15.9 MB → 11.9 MB / 1.0 MB | (laptop) | yes | 15 → 15 |
| Search | owner | laptop | 9.2 s → **1.1 s** | 9.2 s → **1.1 s** | 9.2 s → **488 ms** | 9.2 s → **528 ms** | 544 ms → **32 ms** | 195 → 84 | 32,674 → 27,847 | 15.8 MB → 11.9 MB / 1.0 MB | (laptop) | yes | 15 → 15 |
| Today | associate | phone | 9.0 s → **3.1 s** | 9.0 s → **3.1 s** | 8.3 s → **676 ms** | 8.3 s → **676 ms** | - → **-** | 192 → 82 | 10,015 → 7,747 | 5.4 MB → 3.4 MB / 289 kB | cold no, warm yes | - | 6 → 5 |
| To-dos | associate | phone | 8.9 s → **2.9 s** | 8.9 s → **2.9 s** | 8.1 s → **496 ms** | 8.1 s → **539 ms** | 552 ms → **48 ms** | 191 → 81 | 10,015 → 7,747 | 5.4 MB → 3.4 MB / 289 kB | cold no, warm yes | yes | 6 → 5 |
| Calendar week | associate | phone | 1.4 s → **1.5 s** | 9.0 s → **3.3 s** | 512 ms → **492 ms** | 8.3 s → **701 ms** | - → **-** | 191 → 82 | 10,015 → 8,179 | 5.4 MB → 3.8 MB / 319 kB | cold no, warm yes | - | 6 → 6 |
| Calendar month | associate | phone | 1.4 s → **1.5 s** | 9.0 s → **3.2 s** | 476 ms → **492 ms** | 8.2 s → **668 ms** | - → **-** | 191 → 82 | 10,015 → 8,229 | 5.4 MB → 3.8 MB / 321 kB | cold no, warm yes | - | 6 → 6 |
| Clients (list; Board and Table are taps) | associate | phone | 1.4 s → **1.5 s** | 8.9 s → **3.0 s** | 500 ms → **520 ms** | 8.2 s → **649 ms** | - → **-** | 191 → 81 | 10,015 → 7,747 | 5.4 MB → 3.4 MB / 289 kB | cold no, warm yes | - | 6 → 5 |
| A client with a year of history | associate | phone | 9.5 s → **3.1 s** | 9.5 s → **3.2 s** | 8.7 s → **708 ms** | 8.7 s → **708 ms** | 32 ms → **32 ms** | 192 → 82 | 10,135 → 7,867 | 5.5 MB → 3.4 MB / 293 kB | cold no, warm yes | yes | 6 → 5 |
| Search | associate | phone | 9.0 s → **3.1 s** | 9.0 s → **3.1 s** | 8.2 s → **648 ms** | 8.2 s → **648 ms** | 1.1 s → **48 ms** | 192 → 82 | 10,015 → 7,747 | 5.4 MB → 3.4 MB / 289 kB | cold no, warm yes | yes | 6 → 5 |
| Today | owner | phone | 38.2 s → **3.9 s** | 38.2 s → **3.9 s** | 37.5 s → **976 ms** | 37.5 s → **1.3 s** | - → **-** | 195 → 84 | 32,674 → 27,847 | 15.8 MB → 11.9 MB / 1.0 MB | cold no, warm yes | - | 15 → 15 |
| To-dos | owner | phone | 37.8 s → **3.3 s** | 37.8 s → **3.3 s** | 37.0 s → **524 ms** | 37.0 s → **595 ms** | 928 ms → **48 ms** | 193 → 82 | 32,673 → 27,846 | 15.8 MB → 11.9 MB / 1.0 MB | cold no, warm yes | yes | 15 → 15 |
| Calendar week | owner | phone | 1.4 s → **1.5 s** | 38.1 s → **4.3 s** | 528 ms → **508 ms** | 37.4 s → **988 ms** | - → **-** | 193 → 83 | 32,673 → 28,836 | 15.8 MB → 12.8 MB / 1.1 MB | cold no, warm yes | - | 15 → 16 |
| Calendar month | owner | phone | 1.4 s → **1.5 s** | 37.9 s → **4.1 s** | 480 ms → **520 ms** | 37.2 s → **897 ms** | - → **-** | 193 → 83 | 32,673 → 28,911 | 15.8 MB → 12.9 MB / 1.1 MB | cold no, warm yes | - | 15 → 16 |
| Clients (list; Board and Table are taps) | owner | phone | 1.4 s → **1.5 s** | 38.3 s → **3.8 s** | 480 ms → **652 ms** | 37.4 s → **1.7 s** | - → **-** | 193 → 82 | 32,673 → 27,846 | 15.8 MB → 11.9 MB / 1.0 MB | cold no, warm yes | - | 15 → 15 |
| A client with a year of history | owner | phone | 39.8 s → **3.7 s** | 39.8 s → **4.1 s** | 39.1 s → **872 ms** | 39.1 s → **872 ms** | 32 ms → **32 ms** | 194 → 83 | 32,873 → 28,046 | 15.9 MB → 12.0 MB / 1.0 MB | cold no, warm yes | yes | 15 → 15 |
| Leads | owner | phone | 1.4 s → **1.5 s** | 38.0 s → **3.6 s** | 516 ms → **496 ms** | 37.3 s → **827 ms** | 32 ms → **16 ms** | 194 → 83 | 32,678 → 27,851 | 15.8 MB → 11.9 MB / 1.0 MB | cold no, warm yes | yes | 15 → 15 |
| Network table | owner | phone | 1.7 s → **1.7 s** | 37.8 s → **3.4 s** | 676 ms → **928 ms** | 37.1 s → **928 ms** | 24 ms → **24 ms** | 196 → 85 | 32,680 → 27,853 | 15.9 MB → 11.9 MB / 1.0 MB | cold no, warm yes | yes | 15 → 15 |
| Network map | owner | phone | 1.7 s → **1.7 s** | 37.8 s → **3.5 s** | 604 ms → **864 ms** | 37.0 s → **864 ms** | 920 ms → **48 ms** | 197 → 86 | 32,681 → 27,854 | 15.9 MB → 11.9 MB / 1.0 MB | cold no, warm yes | yes | 15 → 15 |
| Search | owner | phone | 38.3 s → **3.8 s** | 38.3 s → **3.8 s** | 37.7 s → **968 ms** | 37.7 s → **1.3 s** | 2.2 s → **56 ms** | 195 → 84 | 32,674 → 27,847 | 15.8 MB → 11.9 MB / 1.0 MB | cold no, warm yes | yes | 15 → 15 |


**Against the targets.**
- **Taps: met everywhere.** Slowest tap 56 ms (owner, month view and search on a slowed phone), from 2.2 s. Clients' List, Board and Table 16 to 24 ms (from 72 to 88 ms). Typing in search 16 ms.
- **First screen under 1 s on a phone: met on warm visits** (0.5 to 1.0 s, every page, both coaches), **not on a cold first visit**: 1.5 to 1.7 s for pages that draw before their data, 2.9 to 3.9 s for those whose biggest part is the data (Today, To-dos, a client, search). The baseline was 9.0 s (associate) and 38 s (owner). What is left is the first tier itself, about 7 MB raw and 600 kB compressed for the owner, almost all of it sessions and their people, which must stay whole for the counts; and the stand-in answering one request at a time.
- **Laptop:** data on screen in 0.9 to 1.3 s cold and 0.4 to 0.8 s warm (from 2.3 s and 9.1 s).
- **No list loading everything:** the calendar is never read whole (about 1,200 of the owner's 5,988 items first), and to-dos, session notes, client notes, the activity log and lead events no longer hold up the first screen. Still read whole, by design: sessions, session people, engagements and time entries (the counts and Today's attention list), and, for the owner, `coach_admin_clients` (1,000 rows, now once a visit, not twice a page).

## The coach portal after an offline reload

Traced with `tests/scale/offline-reload.mjs` (the page opened online, then offline, then reloaded).

| Who | Size | Before | After | What shows |
|---|---|---|---|---|
| owner | laptop | 7.4 s, empty Today ("No calls today") | **0.48 s** | Today with the coach's data |
| owner | phone (CPU 4x) | 8.8 s, empty | **0.81 s** | Today with the coach's data |
| associate | laptop | not traced | 0.41 s | Today with the coach's data |
| associate | phone (CPU 4x) | not traced | 0.57 s | Today with the coach's data |

**The 6-digit code rule.** It isn't weakened: offline, the gate asks exactly what it asked before and decides the same way; the 7 seconds were supabase-js retrying a read that could not succeed, and that read now fails at once.

## Tests

- `npm run test:performance` 999 passed; `npm run test:signin` 58 passed; `npm run test:scores` 111 passed (all exit 0). Coach unit tests with the new merge and no-retry tests: 405 passed.
- Coach flows (test-project build on 4317, stand-ins, strict): shell, clients, table, client 119 passed; day-plan, calls, week, left 629 passed; finances, client, move 106 passed; workshop, settings, associate 73 passed and 1 failed, "Lee Hart Invoices contact": the page says "Invoices" since run 4's CONTACT_ROLES, not a change here.
- Coach UI tester (run1, tue, todos, cal; owner and associate; dark): 1440 8,673 passed; 400 8,617 passed and 2 failed (cal-jump: a toast covers calendar day buttons on a phone; nothing here shows a toast).
- Coach break-it and the coach sign-in suites (coach-auth-flows, coach-auth-breakit) stop with the same failures and timeouts on the code from before these fixes, built from the same tree (reach /coach/boards, offline "Clock in" leaving the page, d-twice, d-taps, the recovery-codes tick): they are not from these changes. tests/phase4/offline.mjs was skipped: it saves to the test project.
