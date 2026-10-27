// The bold crosshair's one drawing (Tim, 22 Oct: "Two crosshairs, never
// mixed up"), shared by the BoldCrosshair component on screen and the PDF
// footer (Tim, 26 Oct, 16:13), so neither is ever redrawn.
//
// Clean lines at 2 times the standard line, with the two halves moved
// apart along the diagonal so the gap between them stays the size of the
// standard crosshair's (design-reference-v3.html, bold()).

export const BOLD_CROSS_STROKE = 15; // 2 times the standard line, in the drawing's units
const CORNER_REACH = Math.hypot(35.5, 35.5) - 28; // corner to centre, standard line
const STANDARD_GAP = CORNER_REACH - 7.5; // the standard crosshair's gap
const SHIFT = ((STANDARD_GAP + BOLD_CROSS_STROKE) - CORNER_REACH) / 2 / Math.SQRT2;

/** The drawing's box: x, y, width, height. */
export const BOLD_CROSS_VIEWBOX = [-6, -6, 185, 185];

/** The two halves: an SVG path and how far it moves apart from the other. */
export const BOLD_CROSS_PATHS = [
  { d: 'M89.5 4V68A14 14 0 0 0 103.5 82H169', dx: SHIFT, dy: -SHIFT },
  { d: 'M82 169V103.5A14 14 0 0 0 68 89.5H4', dx: -SHIFT, dy: SHIFT },
];
