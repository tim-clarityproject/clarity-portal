import './design.css';

// The bold crosshair (Tim, 22 Oct: "Two crosshairs, never mixed up").
// A separate component from the standard Crosshair, so a build can never
// swap one for the other. It is only ever used in four places: the Home
// Screen icon, the favicon, the desktop menu button and the phone bar's
// centre button (the menus get it in Phase 0c).
//
// Drawn as clean lines at 2 times the standard line, with the two halves
// moved apart along the diagonal so the gap between them stays the same
// size as the standard crosshair's (design-reference-v3.html, bold()).
// White in dark mode and black in light mode (the text colour); on the
// app icons it stays white on black in both modes (tone 'icon').
// Always decorative: the button around it carries the words.

const STROKE = 15;                                    // 2 times the standard line, in the drawing's units
const CORNER_REACH = Math.hypot(35.5, 35.5) - 28;     // corner to centre, standard line
const STANDARD_GAP = CORNER_REACH - 7.5;              // the standard crosshair's gap
const SHIFT = ((STANDARD_GAP + STROKE) - CORNER_REACH) / 2 / Math.SQRT2;

export default function BoldCrosshair({ size, tone = 'text', className = '' }) {
  const s = SHIFT.toFixed(2);
  return (
    <svg
      className={`ds-bold-cross ds-bold-cross--${tone} ${className}`.trim()}
      viewBox="-6 -6 185 185"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
    >
      <g fill="none" strokeWidth={STROKE} strokeLinejoin="round">
        <path d="M89.5 4V68A14 14 0 0 0 103.5 82H169" transform={`translate(${s} -${s})`} />
        <path d="M82 169V103.5A14 14 0 0 0 68 89.5H4" transform={`translate(-${s} ${s})`} />
      </g>
    </svg>
  );
}
