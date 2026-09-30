# Clarity Portal Codebase Guide

## Design rules (Clarity Portal)

1. **Dark first, pure black background.** The default is a pure black (#000000) background with white text. The light theme exists only as `[data-theme="light"]` and will be toggled via an Auto / Light / Dark switch on My Account in a later task. No default light theme.

2. **Never hard-code a colour, font, font size, spacing or timing.** All design values must come from `src/styles/tokens.css` (CSS variables starting with `--`) and all component classes from `src/styles/components.css`. This includes button styles, borders, text sizes, padding, gaps, animation duration, and motion curves.

3. **No gradients anywhere in the interface.** Buttons, borders, backgrounds and other elements use flat single colours only. The only gradient allowed anywhere is inside the supplied logo image files (which are never modified).

4. **Nekst (display font) is for titles, greetings, overlines, labels, tab names, dropdown prompts, buttons and the Your Mission label.** Always uppercase with wide letter spacing. Never below 10px. Never in paragraphs. DM Sans is for paragraphs, descriptions, typed answers, dropdown options and inputs. Inputs must be 16px minimum.

5. **Coral (#FF6F5C) is for actions and the active tab. Mint (#5FEFBB) is only for success or saved states.** Buttons use black text (#000000) on flat coral. The button classes are `.ui-btn-primary` (filled coral) and `.ui-btn-ghost` (outlined). Use var(--coral) and var(--mint-text) only.

6. **The crosshair (.ui-cross, cropped from the logo) is the only symbol for choose, add and expand actions.** Never smaller than 14px. Used in dropdowns, add buttons, and section expand/collapse triggers. Never used in the Your Mission bar. Apply with the .ui-cross class and size variants --sm (14px), --lg (24px). The .ui-cross--open modifier rotates 45 degrees when a section opens.

7. **Every page title uses PageHeading component and all subtitle text lives in src/content/pageText.js.** The overline names the section only (Plan, Ground, Review) and must never repeat a word from the title. PageHeading hides the overline automatically when repetition is detected. Home has no subtitle. Pages inside a section get the section name as overline.

8. **Use the word Mission everywhere, never Purpose.** The Your Mission bar, mission settings, and all related text use "Mission".

9. **Spacing uses only the scale --space-1 to --space-7 (4px, 8px, 16px, 24px, 32px, 48px, 80px).** Tap targets are at least 44px (var(--tap-min)). No arbitrary spacing values.

10. **Motion uses only the --ease curve and the --dur-fast (150ms), --dur (250ms) and --dur-slow (400ms) timings.** Animate only transform, opacity, colour and size. No bounce, spin or fly-in effects. Everything switches off under prefers-reduced-motion. Planned movements include: drawer slide with scrim fade, crosshair rotation when a section opens, smooth expand of the Your Mission pill, sliding highlight in segmented controls and tab bar, switch knob glide, modal fade and rise, dropdown fade, button hover lift, cross-fade between dark and light, page fade between routes.

11. **Logo files in public/brand are used as supplied and never redrawn, recoloured, stretched or cropped.** The files are lockup-full_colour-on-dark.png (full logo with wordmark for desktop header), mark_colour-on-dark.png (emblem/mark for phone), and crosshair_white.png / crosshair_black.png (mask images for CSS masks).

12. **HOME suggestion rules.** The Home page shows three action cards (Plan my day, Review my day, Refine my personal operating plan) with no subheading. At most ONE card carries the "Suggested for now" tag, chosen by this order using the device's local time and whether the action has been finished (started but unfinished counts as not done): First, on Friday/Saturday/Sunday, if this week's Weekly Momentum Review is not done, an extra fourth card "Weekly momentum review" appears at the top, tagged. Otherwise before 4pm, if today's plan is not done, Plan my day is tagged. Otherwise from 4pm, if today's review is not done, Review my day is tagged. Otherwise, if the personal operating plan has not been refined in the last 7 days, Refine my personal operating plan is tagged. Otherwise no tag. Check the `journal_entries` table (entry_date field for reviews) and `decisions` table (tool_type: 'daily_plan' and created_at for today's plan) and missions table (updated_at).

13. **The Account page sections, to be built in a later task, are: Profile, Mission (Statement and Show in header toggle), Appearance, Advanced (Breathing settings), Archived missions, and Danger zone.** Show in header is a switch (ui-switch). Delete is a quiet danger button (ui-btn-ghost--danger).

14. **Design tasks must not change logic, routing, database code or ProtectedLayout.jsx.** Design work happens on a feature branch and is merged to main only when explicitly asked. Every task ends with a summary in the specified format.

15. **The breathing tool (Breathe) is the showpiece of the portal.** Three techniques: Physiological sigh, Vagal breathing, Box breathing. A ring that swells and settles with faint echo rings for the first two techniques. For Box breathing, a coral line traces the rounded-square outline of the logo mark, one side per phase. The ring is coral on the in-breath and mint on the out-breath. The crosshair sits in the centre and rotates 45 degrees as the ring grows. All timings come from the Breathing Settings.

16. **Navigation structure (planned for a later task).** Home, Plan (which combines everything currently under Plan AND everything currently under Decide, including Decision Tools, Grow steps, Inversion steps and Tough Conversation), Ground, Review, My Account (with About and Log Out inside it). No separate Decide section. On phone, no hamburger menu; the five bottom tabs are Home, Ground, Plan, Review, Account. On desktop, the drawer has three groups: (1) Home; (2) Plan, Ground, Review sections; (3) My Account with About and Log Out pages inside.

17. **New design styles apply only inside the .ui-root scope.** Never put global rules on html, body, #root or bare element selectors (input, button, textarea, select). Define CSS variables on :root freely; they do not change appearance. New pages in future tasks will wrap themselves (or a key container) in `class="ui-root"` to opt into the dark theme and design system styles. Existing pages have no .ui-root class and remain untouched by the new CSS.
