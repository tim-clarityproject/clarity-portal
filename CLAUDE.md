# Clarity Portal Codebase Guide

## Design rules (Clarity Portal)

1. **Dark and light modes both exist**, chosen as Light, Dark or Match my device (the starting choice). Existing pages stay in dark until each is rebuilt in its own phase. The pages that already show both modes are listed in `src/lib/colourMode/boot.js` (`BOTH_MODES`); every other page is held in dark whatever the device setting, so no page ever shows half in light mode.

2. **Never hard-code a colour, font, font size, spacing or timing.** All design values must come from `src/styles/tokens.css` (CSS variables starting with `--`) and all component classes from `src/styles/components.css`. This includes button styles, borders, text sizes, padding, gaps, animation duration, and motion curves.

3. **No gradients anywhere in the interface.** Buttons, borders, backgrounds and other elements use flat single colours only. The only gradient allowed anywhere is inside the supplied logo image files (which are never modified).

4. **Nekst capitals only for page titles, section names and buttons.** Always uppercase with wide letter spacing, never below 10px, never in paragraphs. Small labels, question headings and everything else are DM Sans in sentence case (paragraphs, descriptions, typed answers, drop-down options and inputs; inputs 16px minimum). No overlines.

5. **Coral (#FF6F5C) is for actions and the active tab. Mint (#5FEFBB) is only for success or saved states.** Buttons use black text (#000000) on flat coral. The button classes are `.ui-btn-primary` (filled coral) and `.ui-btn-ghost` (outlined). Use var(--coral) and var(--mint-text) only.

6. **The standard crosshair (Crosshair, cropped from the logo) is used only for add (a plus) and, turned 45 degrees, for close.** Anything that opens a list or a folded section (drop-downs, folds, expandable rows, the date box) uses DisclosureArrow, one half of the same crosshair crop, pointing down and turning to point up while open. Two exceptions: the turning crosshair of the loading spinner, and the breathing orb's 8px crosshair. The bold crosshair (BoldCrosshair) is used only for the Home Screen icon, the favicon, the desktop menu button and the phone bar's centre button. The crosshair is never smaller than 14px apart from the orb, and never redrawn.

7. **Page titles use the shared PageHeader** (src/components/design): the title, a quiet meta line, and any explanation behind the small "i". No overline and no intro line under the title. Each page's explanation lives in src/content/pageText.js and shows as one line behind the "i".

8. **Use the word Mission everywhere, never Purpose.** The Your Mission bar, mission settings, and all related text use "Mission".

9. **Spacing uses only the scale --space-1 to --space-7 (4px, 8px, 16px, 24px, 32px, 48px, 80px).** Tap targets are at least 44px (var(--tap-min)). No arbitrary spacing values.

10. **Motion uses only the --ease curve and the --dur-fast (150ms), --dur (250ms) and --dur-slow (400ms) timings.** Animate only transform, opacity, colour and size. No bounce, spin or fly-in effects. Everything switches off under prefers-reduced-motion. Planned movements include: drawer slide with scrim fade, crosshair rotation when a section opens, smooth expand of the Your Mission pill, sliding highlight in segmented controls and tab bar, switch knob glide, modal fade and rise, dropdown fade, button hover lift, cross-fade between dark and light, page fade between routes.

11. **Logo files in public/brand are used as supplied and never redrawn, recoloured, stretched or cropped.** The files are lockup-full_colour-on-dark.png (full logo with wordmark for desktop header), mark_colour-on-dark.png (emblem/mark for phone), and crosshair_white.png / crosshair_black.png (mask images for CSS masks).

    The logo mark always includes its crosshair. Light backgrounds: Emblem Logo POSITIVE (black crosshair, `public/brand/logomark-positive.png`). Dark backgrounds: Emblem Logo NEGATIVE (white crosshair, `public/brand/logomark-negative.png`).

12. Replaced by the overhaul: Home is rebuilt in Phase 4, and portal-overhaul-decisions.md describes the new design. Until then: **HOME suggestion rules.** The Home page shows three action cards (Plan my day, Review my day, Refine my personal operating plan) with no subheading. At most ONE card carries the "Suggested for now" tag, chosen by this order using the device's local time and whether the action has been finished (started but unfinished counts as not done): First, on Friday/Saturday/Sunday, if this week's Weekly Momentum Review is not done, an extra fourth card "Weekly momentum review" appears at the top, tagged. Otherwise before 4pm, if today's plan is not done, Plan my day is tagged. Otherwise from 4pm, if today's review is not done, Review my day is tagged. Otherwise, if the personal operating plan has not been refined in the last 7 days, Refine my personal operating plan is tagged. Otherwise no tag. Check the `journal_entries` table (entry_date field for reviews) and `decisions` table (tool_type: 'daily_plan' and created_at for today's plan) and missions table (updated_at).

13. Replaced by the overhaul: My Account is rebuilt in its own phase, and portal-overhaul-decisions.md describes the new design. Until then: **The Account page sections, to be built in a later task, are: Profile, Mission (Statement and Show in header toggle), Appearance, Archived missions, and Danger zone.** Show in header is a switch (ui-switch). Delete is a quiet danger button (ui-btn-ghost--danger).

14. **Design tasks must not change logic, routing, database code or ProtectedLayout.jsx.** Design work happens on a feature branch and is merged to main only when explicitly asked. Every task ends with a summary in the specified format.

15. **The breathing tool (Breathe) is the showpiece of the portal.** Three techniques: Physiological sigh, Vagal breathing, Box breathing. A ring that swells and settles with faint echo rings for the first two techniques. For Box breathing, a coral line traces the rounded-square outline of the logo mark, one side per phase. The ring is coral on the in-breath and mint on the out-breath. The crosshair sits in the centre and rotates 45 degrees as the ring grows. All timings come from the Breathing Settings.

16. Replaced by the overhaul: navigation is rebuilt in its own phase (Phase 4, with Home), and portal-overhaul-decisions.md describes the new design. Until then: **Navigation structure (planned for a later task).** Home, Plan (which combines everything currently under Plan AND everything currently under Decide, including Decision Tools, Grow steps, Inversion steps and Tough Conversation), Ground, Review, My Account (with About and Log Out inside it). No separate Decide section. On phone, no hamburger menu; the five bottom tabs are Home, Ground, Plan, Review, Account. On desktop, the drawer has three groups: (1) Home; (2) Plan, Ground, Review sections; (3) My Account with About and Log Out pages inside.

17. **Every page sits inside .ui-root.** Never put global rules on html, body, #root or bare element selectors (input, button, textarea, select). All design variables (--bg, --text, --coral, etc.) and component classes live only inside .ui-root and its data-theme variants. Everything a page opens, including pop-ups, panels, toasts and overlays, renders inside .ui-root too: if it attaches to document.body, give that element the .ui-root class so it sees the design variables.

18. **Every free-text box uses the shared steady text box (TextBox in src/components/design)**, with focus mode for long writing on phone. It grows to show all of its text with no hidden text, no scrolling inside the box and no max-height cap; the page scrolls instead, and the page never jumps while typing. AutoGrowTextarea is retired.

19. **Database timestamps are UTC with no time-zone ending on the live database.** Always read a saved created_at/updated_at (or similar) through parseDbTimestamp (src/lib/dateFormatter.js) before turning it into a Date, formatting it, sorting it or comparing it - never new Date(value) directly. Never use toISOString().split('T')[0] to get "today"'s date; use getLocalDateKey instead, which is built from the device's own getFullYear/getMonth/getDate. Times are shown on a 24 hour clock with no am or pm (07:53, 19:26) in the device's local time, always through formatClockTime or formatDayMonthTime in src/lib/dateFormatter.js - nothing formats a time on its own.

20. **Tables and grids must never squash.** Use fixed column widths, keep headings to one line, let cell text wrap (overflow-wrap: anywhere) and let rows grow to fit their content - never let a column crush its text or force a sideways scroll. Stack into cards under ~600px instead of shrinking a table.

21. **No swear words anywhere.** Not in product text, not in file names, not in code comments, not in variable or component names. If one is ever found, rename/reword it immediately.

22. **Mock-up files are the source of truth.** Before building or changing any page, open and read the actual mock-up file and spec in full. Never build from a summary or from memory. Copy markup, CSS values, wording and behaviour from the mock-up. If the built page differs, the mock-up wins. If something cannot match, stop and report it instead of simplifying. Every build summary must list the files read and any differences left.

23. **Wording and spelling: always write The Clarity Portal with a capital T on The, everywhere it is named.** Never "the Clarity Portal" or "a Clarity Portal account", even mid-sentence, in headings, buttons, legal text, emails, aria-labels, titles and toasts. Code identifiers, file names, CSS classes, URLs, environment variables and database values are not changed.

## List row guidelines

These are guidelines, to apply by default to every list built from the shared row (`src/components/ui/HistoryList.jsx`: My Plans, My Reviews, My Journals, Decision History). Where a mock-up shows a detail, the mock-up wins. They are about layout only, not saving or navigation.

On phone every row is built the same way:

1. **Line 1:** the title, left-aligned, wrapping only between words.
2. **Line 2:** the type label, then the status tag (Draft, Reviewed) beside it, then the version chip (for example Version 1.2) beside the tag, all on one left-aligned line that wraps cleanly. The version belongs here, not on the date line.
3. **Line 3:** the date and time (24 hour), then any count (for example 196 words), always left-aligned and directly under line 2, in the same place in every row.
4. **Actions:** one right-aligned row beneath with a small, even gap above it (spacing tokens). The text action (Continue, Review, View review) is the same size and weight as the type label, not larger; the pencil and bin icons are the same size and distance apart in every row.
5. Every element starts at the same left edge in every row: no indents, no centring. Desktop keeps its single-line row.
6. **Filters:** filters sit behind one Filter button (the shared `FilterButton`), with one line saying what is applied and Clear (Tim, 22 Oct). This replaces the swipeable pill row.

Note for mock-ups: Tim approved the type, status and version line in place of the mock-ups' version on the date line. His earlier approval of swipeable filter pills is replaced by guideline 6.
