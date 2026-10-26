import { BOLD_CROSS_PATHS, BOLD_CROSS_STROKE, BOLD_CROSS_VIEWBOX } from '../../lib/boldCrosshair';
import './design.css';

// The bold crosshair (Tim, 22 Oct: "Two crosshairs, never mixed up").
// A separate component from the standard Crosshair, so a build can never
// swap one for the other. It is only ever used in four places: the Home
// Screen icon, the favicon, the desktop menu button and the phone bar's
// centre button, and in every PDF footer (drawn from the same shared
// drawing, src/lib/boldCrosshair.js).
//
// The drawing itself is shared (src/lib/boldCrosshair.js): clean lines at
// 2 times the standard line, the gap the same as the standard crosshair's.
// White in dark mode and black in light mode (the text colour); on the
// app icons it stays white on black in both modes (tone 'icon').
// Always decorative: the button around it carries the words.

export default function BoldCrosshair({ size, tone = 'text', className = '' }) {
  return (
    <svg
      className={`ds-bold-cross ds-bold-cross--${tone} ${className}`.trim()}
      viewBox={BOLD_CROSS_VIEWBOX.join(' ')}
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
    >
      <g fill="none" strokeWidth={BOLD_CROSS_STROKE} strokeLinejoin="round">
        {BOLD_CROSS_PATHS.map((p) => (
          <path key={p.d} d={p.d} transform={`translate(${p.dx.toFixed(2)} ${p.dy.toFixed(2)})`} />
        ))}
      </g>
    </svg>
  );
}
