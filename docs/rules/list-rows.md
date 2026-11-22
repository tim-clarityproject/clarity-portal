# List row guidelines

Moved from CLAUDE.md on 22 Nov 2026 (Phase 6a run 7, step 0), word for word. These rules apply exactly as they did there; CLAUDE.md points here.

These are guidelines, to apply by default to every list built from the shared row (`src/components/ui/HistoryList.jsx`: My Plans, My Reviews, My Journals). Where a mock-up shows a detail, the mock-up wins. They are about layout only, not saving or navigation.

Every row is built the same way (Phase 4 step 4, writing rule 60, Tim 23 Oct):

1. **Line 1:** the name in words, left-aligned, wrapping only between words, and the date on the right ("Today", "Yesterday", "Mon 19 Oct"; `formatSavedDate`). Never a date as the name: day plans read "Today’s plan", "Yesterday’s plan", then "Day plan" (reviews the same), debriefs "Sprint 4, week 3", a journal "Journal entry", never its first words. The names live in one place, `src/lib/savedItems.js`.
2. **Line 2:** the tool, then the status tag (Draft, Reviewed) beside it, then the version chip (for example Version 1.2) beside the tag, all on one left-aligned line that wraps cleanly.
3. **Line 3:** any count (for example 196 words), left-aligned under line 2.
4. **Actions:** on a phone, one right-aligned row beneath with a small, even gap above it; on a laptop, at the right of the row in a fixed width so the dates line up. The text action (Continue, Review, View review) is the same size and weight as the tool, not larger; the pencil and bin icons are the same size and distance apart in every row. A row with nothing to do has no action row.
5. Every element starts at the same left edge in every row: no indents, no centring.
6. **Filters:** filters sit behind one Filter button (the shared `FilterButton`), with one line saying what is applied and Clear (Tim, 22 Oct). My Plans and My Reviews filter by area (Personal, Interpersonal, Strategic), then by tool (Strategic: by team); `?area=` and `&tool=` or `&team=` open them filtered.

My Plans and My Reviews are one list each across the three areas, holding every saved item, old and new (`src/lib/savedItemsApi.js`). The old My decisions list (`/decision-history`) redirects to My Plans. Plan, Review and Interpersonal hubs end with their last three saved items (`HubRecent`), never journal entries; Strategic's Health Check card lists the saved teams (`HubTeams`).
