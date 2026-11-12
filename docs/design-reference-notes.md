# Notes for the design reference

Changes made in the build that the design reference (`design-reference.html`) should take up the next time it is updated. Newest first.

## 12 Nov 2026: every outlined edge takes the edges colour

Tim's rule (12 Nov): every outlined edge reaches at least 3 to 1 in light and dark. Each part below was drawn with a fainter line colour and now takes the edges colour, the same one as "Box edges" in the reference: `--field-line`, #858480 in light and #636362 in dark. Hover, focus and chosen states are unchanged.

| Part | Where it shows | Was | Before | Now |
|---|---|---|---|---|
| Outlined button (`.ds-btn--outline`) | "Start a new Health Check", "Open this week" | `--outline` (#B9B7B1 light, #3C3C3B dark) | 1.7 to 2.0 | edges colour |
| Add button (`AddButton`, an outlined button) | "Add a to-do", "Add another" | `--outline` | 1.9 | edges colour |
| Breathe button (header) | every page on a laptop | `--line` | 1.3 to 1.4 | edges colour |
| Chat button ("Chat to Tim") | header | `--outline` | 1.9 | edges colour |
| Segmented control, outer edge (`.ds-seg`) | "Today / This week" on the sprint page | `--line` | 1.2 to 1.4 | edges colour |
| Chip (`.ds-chip`) | the journal's prompt chips | `--line` | 1.3 to 1.4 | edges colour |
| Current step pill in a guided tool's step list | plan builder, sprint start | `--quiet-line` | 1.9 to 2.4 | edges colour |
| Older outlined buttons (`.ui-btn-ghost`, `.auth-btn-ghost`, `.dng`) | sign-in screens and pages not yet rebuilt | `--btn-line` | 1.9 | edges colour |
| Older text boxes and steppers (`.plan-input`, `.tsa-stepper`) | Plan a meeting, Time audit | `--line` | 1.3 | edges colour |

`--line`, `--btn-line` and `--outline` stay for lines between rows and for chart marks. They are no longer used for the outline of anything to tap or type into.

The reference's own examples of these parts (the Add button, the segmented control, chips, the outlined button) still draw the fainter colours, so they will look lighter than the build until the reference is updated.

## 12 Nov 2026: chevrons

- A chevron beside one line of text is shifted by the exact amount, with no rounding to whole pixels, so it stays within 0.5px at every text size.
- A chevron beside a name with a line under it (a dashboard fold, Home's "This week", Home's week line) is centred on the two lines together, from the top of the name's capitals to the last line's baseline.

## 12 Nov 2026: Windows high-contrast mode

Masked icons (the chevron, the close crosshair, ticks) are drawn in the system's text colour in Windows high-contrast mode. The reference does not show this mode.
