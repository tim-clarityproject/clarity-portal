# Clarity Portal Codebase Guide

**Working folder (from 26 Oct):** `~/code/clarity-portal`, outside OneDrive, so syncing never touches `.git` or `node_modules` mid-change. Start Claude Code there with `cd ~/code/clarity-portal && claude`. GitHub is the backup. The old copy under OneDrive (`Client Portal/clarity-portal`) is a fallback for one week only; never work in it.

## Design rules (Clarity Portal)

1. **Dark and light modes both exist**, chosen as Light, Dark or Match my device (the starting choice). Existing pages stay in dark until each is rebuilt in its own phase. The pages that already show both modes are listed in `src/lib/colourMode/boot.js` (`BOTH_MODES`); every other page is held in dark whatever the device setting, so no page ever shows half in light mode.

2. **Never hard-code a colour, font, font size, spacing or timing.** All design values must come from `src/styles/tokens.css` (CSS variables starting with `--`) and all component classes from `src/styles/components.css`. This includes button styles, borders, text sizes, padding, gaps, animation duration, and motion curves.

3. **No gradients anywhere in the interface.** Buttons, borders, backgrounds and other elements use flat single colours only. The only gradient allowed anywhere is inside the supplied logo image files (which are never modified).

4. **Nekst capitals only for page titles, section names and buttons.** Always uppercase with wide letter spacing, never below 10px, never in paragraphs. Small labels, question headings and everything else are DM Sans in sentence case (paragraphs, descriptions, typed answers, drop-down options and inputs; inputs 16px minimum). No overlines.

5. **Coral (#FF6F5C) is for actions and the active tab. Mint (#5FEFBB, deep green #0B7A52 in light) means good: success, saved, done, and data at or above the standard (see the 26 Oct design rules).** Buttons use black text (#000000) on flat coral. The button classes are `.ui-btn-primary` (filled coral) and `.ui-btn-ghost` (outlined). Use var(--coral), var(--good) and var(--mint-text) only.

6. **The standard crosshair (Crosshair, cropped from the logo) is used only for add (a plus) and, turned 45 degrees, for close.** Anything that opens a list or a folded section (drop-downs, folds, expandable rows, the date box) uses DisclosureArrow, one half of the same crosshair crop, pointing down and turning to point up while open; back and next use the same chevron turned (Chevron, 26 Oct design rule 6). Two exceptions: the turning crosshair of the loading spinner, and the breathing orb's 8px crosshair. The bold crosshair (BoldCrosshair) is used only for the Home Screen icon, the favicon, the desktop menu button, the phone bar's centre button and every PDF footer (Tim, 26 Oct, 16:13), always drawn from its one shared drawing (`src/lib/boldCrosshair.js`). The crosshair is never smaller than 14px apart from the orb, and never redrawn.

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

16. Replaced by the overhaul: navigation is rebuilt in its own phase (Phase 4, with Home), and portal-overhaul-decisions.md describes the new design. Until then: **Navigation structure (planned for a later task).** Home, Plan (which combines everything currently under Plan AND everything currently under Decide, including Decision Tools, Grow steps, Inversion steps and Tough Conversation), Reset, Review, My Account (with About and Log Out inside it). No separate Decide section. On phone, no hamburger menu; the five bottom tabs are Home, Reset, Plan, Review, Account. On desktop, the drawer has three groups: (1) Home; (2) Plan, Reset, Review sections; (3) My Account with About and Log Out pages inside.

17. **Every page sits inside .ui-root.** Never put global rules on html, body, #root or bare element selectors (input, button, textarea, select). (One exception: the root text size in `src/index.css`, so text follows the device's text-size setting.) All design variables (--bg, --text, --coral, etc.) and component classes live only inside .ui-root and its data-theme variants. Everything a page opens, including pop-ups, panels, toasts and overlays, renders inside .ui-root too: if it attaches to document.body, give that element the .ui-root class so it sees the design variables.

18. **Every free-text box uses the shared steady text box (TextBox in src/components/design)**, with focus mode for long writing on phone. It grows to show all of its text with no hidden text, no scrolling inside the box and no max-height cap; the page scrolls instead, and the page never jumps while typing. AutoGrowTextarea is retired.

19. **Database timestamps are UTC with no time-zone ending on the live database.** Always read a saved created_at/updated_at (or similar) through parseDbTimestamp (src/lib/dateFormatter.js) before turning it into a Date, formatting it, sorting it or comparing it - never new Date(value) directly. Never use toISOString().split('T')[0] to get "today"'s date; use getLocalDateKey instead, which is built from the device's own getFullYear/getMonth/getDate. Times are shown on a 24 hour clock with no am or pm (07:53, 19:26) in the device's local time, always through formatClockTime or formatDayMonthTime in src/lib/dateFormatter.js - nothing formats a time on its own.

20. **Tables and grids must never squash.** Use fixed column widths, keep headings to one line, let cell text wrap (overflow-wrap: anywhere) and let rows grow to fit their content - never let a column crush its text or force a sideways scroll. Stack into cards under ~600px instead of shrinking a table.

21. **No swear words anywhere.** Not in product text, not in file names, not in code comments, not in variable or component names. If one is ever found, rename/reword it immediately.

22. **Mock-up files are the source of truth.** Before building or changing any page, open and read the actual mock-up file and spec in full. Never build from a summary or from memory. Copy markup, CSS values, wording and behaviour from the mock-up. If the built page differs, the mock-up wins. If something cannot match, stop and report it instead of simplifying. Every build summary must list the files read and any differences left.

23. **Wording and spelling: always write The Clarity Portal with a capital T on The, everywhere it is named.** Never "the Clarity Portal" or "a Clarity Portal account", even mid-sentence, in headings, buttons, legal text, emails, aria-labels, titles and toasts. Code identifiers, file names, CSS classes, URLs, environment variables and database values are not changed.

24. **The eye means "who can see this".** Anything personal shows the shared WhoSees label (src/components/design): a 16px line eye (1.5px lines) in the colour of its words, then 14px words in the secondary grey (26 Oct design rule 5): ("Only you", "You and [coach's first name]", "Your team"), with "Who can see this:" for screen readers. The eye is the only who-sees icon; nothing uses a lock for who sees something.

25. **There is one "i", drawn the same everywhere** (InfoIcon in src/components/design): a 16px outlined circle with a small "i" inside, like ⓘ, drawn with 1.5px lines in the current text colour, with no disc behind it. Its button gives the 44px tap area with padding; the icon never grows. When an "i" explains a sentence it sits at the end of that sentence, 6px after the last word (var(--info-gap)), lined up with the middle of the text. It opens its explanation and Escape closes it.

26. **Names people see (Tim, 23 Oct).** The personal area once called Ground is **Reset** everywhere it shows. GROW is **Get unstuck**, and its first screen says "Uses the GROW model." in small text under the title. Inversion is **Pre-mortem** (the team version for strategy stays "Pre-mortem for an initiative" if it exists). Tools not built yet take their new names when they are built. Only the names people see change: routes, file names, database values and saved items keep their old names, and old saved items still open.

27. **Times for a tool read "~5 minutes"** (Tim, 23 Oct), never "About 5 minutes" or "5 min". Ranges stay as they are, for example "1, 3 or 5 minutes".

28. **Error messages say what happened, then what to do** (Tim's rule 15), for example "That didn’t save. Check your connection and try again." "Fail" and "failed" are never used in client text. After deleting something the message reads "Deleted" (with Undo where Undo exists), apart from deleting the whole account, which says "Your account has been deleted."

29. **One add button everywhere** (Tim, 26 Oct, 16:54): every button that adds something is the shared `AddButton` (src/components/design): an outlined pill, the brand crosshair in the text colour (not coral), words that say what it adds ("Add objective", "Add agenda item", "Add a to-do", "Add another"), coral only on hover or keyboard focus, and full width on a phone. No page builds its own.

30. **Lists are rows** (Tim, 26 Oct, 16:51): when someone lists several things, each gets its own box, with "Add another" (the `AddButton`) to add a row and the 45 degree crosshair (`IconButton`) to remove one, never one big box ("one per line" or similar). Tools that still ask for several things in one box change when each tool is rebuilt.

## Action first (Tim, 26 Oct)

Every later phase follows these.

1. **The portal is extremely action focused.** Big goals are moved by immediate, small next steps, and every screen helps someone see and take the next one.
2. **Every tool ends with clarity on at least one small next step**, which links into the performance system (added to the plan, the sprint, a to-do or a habit). The Journal is the one exception for now; others only when Tim agrees.
3. **Next steps are small enough to do this week, worded as an action, and shown where people will see them again** (Home, the sprint and the weekly debrief).

## 26 Oct design rules

Tim's rules of 26 Oct (design reference v15, M4 dashboard v46). Later phases follow them. The shared parts are in `src/components/design` and shown in the design gallery.

1. **Mint means good.** One design token for good, `--good`, set to the mint token (dark #5FEFBB, light #0B7A52) and resolved per mode on the part that uses it (declared on every `.ui-root`), never once on the root. It is used for: weeks at or above the standard, rises and "+1" style figures, the live score when at or above the standard, progress bars towards a performance target, week squares, mini charts, ticked boxes, celebrations, and Saved or done. Coral is for doing and for the brand only: the one main button, hover and focus, selected states, the brand crosshair and the PDF title line. Coral is never a data colour. Grey stays for below the standard; soft coral stays for "needs you". Client-facing words call it green ("Green weeks averaged 7 hours or more."). Step bars inside guided tools (the % complete bar and the older pages' step bars) are neutral, in the text colour, not mint: guided tools are doing screens where the coral button leads.
2. **Ticked boxes fill mint**, with a black tick in dark mode and a white tick in light mode (`--on-good`).
3. **No keys on screen.** Charts label things where they are (the standard as a labelled line at its right end, "Best" and "So far" on their bars, sprint or week names along the bottom) and every mark has a pop-up. No unexplained marks.
4. **Chart pop-ups: one shared pop-up** (`ChartTips` and `tipProps`). It shows the value first and larger, then when ("Sprint 4, week 2"), then any extra fact on its own line. It stays at least 12px inside both screen edges, flips below the mark when there's no room above, wraps instead of running off the side, and is hidden with display none when closed. It opens on hover, tap and keyboard focus. A pop-up that names something says what kind of thing it is first, small, then the name ("Outcome Objective 2", then the name).
5. **Icons with words, one standard** (`IconText`, `IconTextRow`): DM Sans 14px in the secondary grey; the icon drawn in a 16px square with 1.5px lines, the same colour as its words; 6px between icon and words, measured to the icon's visible edge; 20px between items, no dots between them. The icon is centred on the middle of the capital letters, checked by measuring. A tappable one is the same at rest, turns coral on hover or keyboard focus, and has a 44px tap area. Watch for older styles with !important that block the hover colour.
6. **One chevron everywhere** (`Chevron`; `DisclosureArrow` is the chevron that turns): back, open, close and drop-down chevrons are all the corner of the brand crosshair, only rotated. No other arrow or chevron icon anywhere in the portal, My Account and its settings included, and no text arrows (← → ↗); a link's words say where it goes.
7. **The eye can be tapped to change who sees it, there and then** (`WhoSees` with `onChange`, `CoachSees`). On one thing it opens "Who can see this?" with the thing's name, then "Only you" and "You and [coach's first name]"; choosing one saves at once, shows "Saved" and updates the eye. On a page it opens "What [coach] sees" with one switch per part. Both end with "You can also change this in My Account, under What your coach sees." and use the same settings as that page. Phones get it as a bottom panel (`Sheet`). (The sharing setting arrives in Phase 1; until then the panels run on a stand-in in the design gallery.)
8. **Units beside a big figure are full words, small and grey**: "7.1 hours", "6 weeks", "8/10". Never "h" or "wks". (`Stat`'s `unit`.)
9. **Every line a person reads is a full sentence with a subject and a verb** ("You're above your standard of 85%.", never "At your standard of 85%."). One sentence per line. Labels without a full stop are the only exception.
10. **Phones show less**: on a phone, a line that repeats what a chart or figure already shows appears only on tap.
11. **Each mode uses its own colours**: every colour is checked in dark and light, on a device set to light and on one set to dark.

**Smoothness (Phase 0e).** Pages show their last data at once from the device (`useCachedLoad` in `src/lib/pageCache.js`) and refresh quietly; the turning crosshair only on a first visit. Typing is kept as a draft on the device (`useDraft` in `src/lib/drafts.js`; the shared form in FormContext) and restored quietly with "Draft restored". Saves made offline wait on the device and are sent when the connection is back (`src/lib/syncQueue.js`, `saveDecisionOrQueue`), showing "Will sync", then "Saved". Being offline, or a failed sign-in refresh, never signs anyone out and never clears the device; only a deliberate Sign out does (`clearAppStorage`). Errors never show raw technical text (`friendlyError`); a lasting problem adds "If it keeps happening, let your coach know." (or "use Something not working? in My Account." without a coach; `ErrorMessage keepsHappening`).

**Text size follows the device** (Claude's call, 26 Oct): every text size is a multiple of `--u` (`calc(17 * var(--u))`), never a fixed px size, so text grows with the browser's text-size setting and, on iPhone and iPad, the Text Size setting (the one allowed global rule on html, in `src/index.css`), up to twice the standard size. Big display text (Nekst titles, big numbers, anything 20px and up) uses `--u-big` and grows by at most a quarter, so spaced capitals never split mid-word; the phone tab bar's labels stay 10px. Spacing, icons and tap areas stay fixed; layouts must wrap rather than break at the largest size (`tests/phase0e/app.mjs` checks every page at twice the standard size).

## PDF rules

Tim's PDF rules (26 Oct). Every PDF follows all 32. They are built into the shared template in `src/lib/pdf` (pdfkit, with its own page layout step), so no tool draws its own PDF: a tool describes its document (see the top of `src/lib/pdf/render.js`) and the template does the rest. The one Download PDF button is `PdfDownload` (src/components/design).

**Versions and paper**

1. **Light and Dark for tools** (Tim, 08:59): every tool that makes a PDF offers Light (for printing) and Dark (for sharing on a phone). Same layout, content and page breaks; only the colours and the logo file change. Coaching agreements, sponsor agreements, quotes and the supplier pack are light only, because they are printed, signed and filed.
2. **One button, then a choice:** one "Download PDF" button, which then offers "Light, for printing" and "Dark, for sharing".
3. **Paper matches the client's country** (Tim, 09:20): US Letter for the US and Canada, A4 for everyone else. Margins about 19mm on every side, with the footer inside them. (One shared helper, `paperFor` in `src/lib/pdf/paper.js`: the person's country setting once My Account has one, then the device's region, then its time zone.)
4. **No cover page** (Tim, 09:20): page 1 opens with the title block, then the content straight away.

**On every page**

5. **Title block (page 1):** the title in Nekst capitals, one or two lines; the 56px coral line; one grey line of details (organisation or person, date, type), each readable on its own ("Board or owner meeting", not "Board or owner").
5a. **Titles people type are limited to 80 characters, so a PDF title always fits two lines.** (The meeting plan's title, with the note "Titles can be up to 80 characters."; `src/lib/titleLimit.js`. The title block still shrinks to fit for older saved titles.)
6. **Updated, not version numbers** (Tim, 09:33): a tool PDF downloaded again after changes shows "Updated Mon 26 Oct 2026, 09:30" in its details line. Signed documents keep their reference and version number.
7. **Running header from page 2** (Tim, 09:20): small and grey: the document name on the left, the organisation or person on the right.
8. **Footer:** the real logo mark, the portal address as a working link, "Confidential: for [organisation or person]" when it holds a client's or team's own answers (Tim, 09:20), and "Page 2 of 4". A one-page PDF has no page number.
9. **The bold crosshair in the footer** (Tim, 26 Oct, 16:13, replacing the logomark PNGs): every PDF footer carries the bold crosshair, the 2 times line version used on the website's menu button and Home Screen icon, black on light pages and white on dark pages, drawn from the same shared bold crosshair (`src/lib/boldCrosshair.js`), never redrawn or recoloured. Logo files are still never redrawn or recoloured in mock-ups.
10. **No "Prepared by" panel** (Tim, 09:04). Who made it only shows where a signature is needed.

**What goes in**

11. **Blank answers are left out** (Tim, 09:33): the PDF shows only what was filled in, so it never looks half done. A section with nothing in it is left out with its heading.
12. **Summary first:** page 1 starts with an At a glance panel of two to four items, each laid out the same way.
13. **Contents list over 6 pages** (Tim, 09:33): a short list of sections with page numbers, under the At a glance panel.
14. **No link back to the portal** (Tim, 09:33): the PDF stands on its own; the portal address in the footer is enough.

**Type and colour**

15. **Fonts:** Nekst for the title, section headings (capitals, slightly letter-spaced) and big numbers (Nekst Light at 22pt and above); DM Sans for everything else. Body text 10pt with generous line spacing, lines no longer than about 62 characters, nothing smaller than 8.5pt. Words are never hyphenated across lines.
16. **Light colours:** white page, near-black text (#111110), grey for details (#636362), pale grey lines (#DCDCD9), light grey panels (#F4F4F3). **Dark colours:** black page, white text, grey details (#A3A3A0), dark lines (#262626), dark panels (#111110) with a thin edge so they hold on a dim phone. (These live in `src/lib/pdf/theme.js`, the one place a PDF colour is written.)
17. **Green means good** (Tim, 26 Oct; was coral): what is at or above the standard is green, deep green #0B7A52 on light pages and mint #5FEFBB on dark pages (`good` in `src/lib/pdf/theme.js`); below the standard is grey. Coral is only the title line. Never coral or green text. Keys call it green ("Green: important and moving well").
18. **Colour is never the only signal:** every bar has its value beside it and every chart has a key, so a black and white print still reads.
19. **The writing rules apply** (as in this file): labels before numbers, UK spelling, dates like "Mon 26 Oct 2026", 24-hour times, no dashes, "Dr. Tim Dutton" and "The Clarity Project LTD" exactly so.

**Parts**

20. **Shared parts only:** title block, running header, footer, At a glance panel, contents list, section heading, text, table, bar chart, dot chart, list and signature block. No tool draws its own. (The dot chart, as in the Health Check: one dot per item on labelled axes, divided by lines at the middle of each axis, with no quadrant names, as on the results page; green filled dots only for the good area, grey outlines for the rest; each dot numbered, with names beside the dots only when none would touch a label, dot or line, otherwise a numbered list beside or under the chart, or after the chart's key and sentence when the names are too many to fit with it; a key and a sentence after it. Behind the dots, the same pale areas as the results page (Tim, 26 Oct, 16:14): a field of small dots, pale green where projects are important and moving well and the pale line colour everywhere else, never coral, pale enough for a black and white print; each project dot has the same soft halo as on the results page.)
21. **Charts:** drawn to scale from zero, with the standard marked, values at the end of each bar, a key underneath, and a sentence after it saying what it means.
22. **Tables:** thin lines between rows only, no boxes or fills, a grey header row, numbers lined up on the right.

**Page breaks: nothing chopped** (Tim, 09:21 and 09:30)

23. **Kept together, always:** a heading with at least three lines of what follows; a panel; a chart with its key and its sentence; a table row; a list item; a question with its answer's first three lines; the signature block.
24. **Short sections move whole:** a section shorter than about a third of a page that won't fit in the space left moves to the next page whole.
25. **Long sections split only at natural points:** between paragraphs, table rows or list items, never inside one.
26. **Long answers split with three lines each side:** a client's long answer can carry on to the next page only between paragraphs, with at least three lines left behind and three carried over.
27. **Tables that carry on:** the next page repeats the heading with ", continued" ("Projects ranked by alignment, continued") and the column names.
28. **No stray lines:** never one or two lines alone at the top or bottom of a page, and a last page never holds just a line or two. Space at the end of a page is fine; content is never stretched to fill it.
29. **Light and dark break in the same places,** and A4 and US Letter are each checked.

**The file and checks**

30. **Real and readable:** fonts embedded, text selectable and searchable, links that work; tagged for screen readers with the right reading order, a text description for every chart, the language set to English (UK), and section bookmarks when it is over two pages. Bookmarks, the file's title and copied heading text are whole words in sentence case, never split by letter-spacing. (Headings in spaced capitals are drawn as whole words with the PDF's own letter-spacing and no pair kerning, and carry their written words as ActualText; `tests/pdf/make-pdfs.mjs` checks every bookmark, title and heading.)
30a. **No "…" anywhere in a PDF** (Tim, 26 Oct, 16:12): nothing is ever cut off. A long name wraps onto more lines instead: the footer's "Confidential: for [organisation]" line wraps upwards inside the footer and the running header's names wrap downwards, both bands growing to hold them inside the margins, with nothing overlapping; chart labels wrap or, for a single axis word, get smaller down to 8.5pt. `tests/pdf/make-pdfs.mjs` fails any PDF whose text holds "…", and checks the footer shows a long organisation name in full.
31. **Named in words and small:** for example "Health Check, Northfield Logistics, 26 Oct 2026.pdf", with "(dark)" at the end of the dark one; the file's properties carry the same title and "Dr. Tim Dutton, The Clarity Project LTD" as author; a typical PDF is under 1 MB.
32. **Stress-test pack before Tim sees it** (Tim, 09:30): every new or changed PDF is made with very short, very long and awkward content (long names, long answers, long tables, emoji, blank answers), in light and dark, on A4 and US Letter; every page break is checked against rules 23 to 29; Tim gets the pack to look through. Plus: open on a Mac and an iPhone, print a light page in black and white, and send the dark one through a chat app. Invented names only.

**How to check a PDF** (for rules 23 to 32): `node tests/pdf/make-pdfs.mjs <folder>` makes every PDF and the stress cases in light and dark, on A4 and US Letter, checks every page break and writes `break-report.txt`; add new documents there. Check the tags with veraPDF (`brew install verapdf`, then `verapdf --flavour ua1 --format text <folder>/*.pdf`; every file should say PASS). Fonts for PDFs are TTF or WOFF, never WOFF2: pdfkit cannot build in a WOFF2 font's letter shapes, so its text comes out blank.

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

## Migrations and the rules test

- **Every migration from 025 on ends with the line that records itself**: `select public.record_migration(26, '026_what_it_does');`. `public.migration_log` lists what has run on each database; `supabase/MIGRATION_LOG.md` is the same list as Tim's checklist. Migrations are safe to run twice and are dry-run first with `bash scripts/dry-run-on-test.sh FILE.sql [TEST.sql]` (test project only, always rolled back).
- **`supabase/migrations/024_baseline_live_structure.sql` is live's structure**, and `supabase/024_baseline_test.sql` checks a database against it. A later migration that changes something in the baseline adds it to `later_version` (or `later_addition`) in that test.
- **`npm run test:rules`** checks every personal table's rules for each test account and for someone signed out (`tests/rules/`). Every new table, role and rule in Phase 1 is added to `tests/rules/config.mjs`, and the test must pass before Tim runs the migration.

## Go-live notes

- **Baseline and migration log** (`024_baseline_live_structure.sql`, then `025_migration_log.sql`): safe on live at any time, as they only add what is missing (on live, only the log). Run `supabase/024_baseline_test.sql` on live after 024.
- **Terms accepted SQL** (`supabase/migrations/021_restore_terms_accepted_from_signup.sql`): run it on the live database only at go-live, after this branch's code is live. The old live code marks the terms as not accepted on every page load, so running it earlier would be undone straight away.
- **POP review drafts SQL** (`supabase/migrations/023_mission_progress_reviews_update.sql`, test: `supabase/mission_progress_reviews_update_test.sql`): adds the missing rule that lets a person change their own POP reviews, so a draft can be saved over itself. Run it on the test project now. It changes nothing the live code relies on, so it can run on live at go-live or earlier if Tim wants the fix there sooner.
- **`supabase/schema.sql` is never run**: it is an old sketch, and it would re-open `guest_sessions` (closed on live today: row security on, no rules).
- **Health Check organisation name SQL** (`supabase/migrations/022_alignment_open_returns_organisation.sql`): lets the outside Health Check page receive the organisation name for its own session, so the PDF can show it. Run it on the test project now; on the live database only at go-live, after this branch's code is live. The code works without it (the PDF then has no organisation name).
