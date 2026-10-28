import Crosshair from './Crosshair';
import './design.css';

// The sprint dial (decisions "Sprints"; M1 dial(), M6 dial()): one
// segment per week for any length from 2 to 16, with parallel gaps of
// constant width between the weeks, and a wider gap at the top where the
// brand crosshair marks the start and the end. Thin and precise, never
// filled wedges (Tim, 23 Oct).
//
// This is the set-up state (Build your plan and Start a sprint, Ready):
// every week still to come, faint, and in the centre "Weeks" over the
// length. The running, finished, paused and welcome-back states are added
// with the Performance Sprint page (Phase 2 step 4 onwards).
//
// length: the number of weeks; label: what a screen reader hears.

const C = 180;      // centre, in the drawing's own units (0 to 360)
const R_OUT = 144;
const R_IN = 128;   // a 16-wide ring, as M1
const GAP = 7;      // between weeks, the same width all the way across
const TOP_GAP = 40; // around the crosshair at the top

function point(deg, r) {
  const a = (deg * Math.PI) / 180;
  return [C + r * Math.cos(a), C + r * Math.sin(a)];
}

// A gap of `width` centred on the line out from the centre at `deg`
// meets a circle of radius r this many degrees either side of it.
const half = (width, r) => (Math.asin(width / 2 / r) * 180) / Math.PI;

/** One week's segment, between the gaps centred at `from` and `to` (degrees). */
function segmentPath(from, to, gapFrom, gapTo) {
  const o0 = from + half(gapFrom, R_OUT);
  const o1 = to - half(gapTo, R_OUT);
  const i0 = from + half(gapFrom, R_IN);
  const i1 = to - half(gapTo, R_IN);
  const large = o1 - o0 > 180 ? 1 : 0;
  const f = (p) => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`;
  return `M${f(point(o0, R_OUT))}A${R_OUT} ${R_OUT} 0 ${large} 1 ${f(point(o1, R_OUT))}`
    + `L${f(point(i1, R_IN))}A${R_IN} ${R_IN} 0 ${large} 0 ${f(point(i0, R_IN))}Z`;
}

export default function SprintDial({ length, label }) {
  const n = Math.max(2, Math.min(16, Math.round(length) || 12));
  const step = 360 / n;
  const words = label || `Sprint dial, ${n} weeks`;
  return (
    <div className="ds-sdial">
      <div className="ds-sdial-ring">
        <svg viewBox="0 0 360 360" role="img" aria-label={words}>
          {Array.from({ length: n }, (_, i) => {
            const from = -90 + i * step;
            const to = from + step;
            return (
              <path
                key={i}
                className="ds-sdial-seg ds-sdial-seg--next"
                d={segmentPath(from, to, i === 0 ? TOP_GAP : GAP, i === n - 1 ? TOP_GAP : GAP)}
              />
            );
          })}
        </svg>
        <span className="ds-sdial-cross" aria-hidden="true"><Crosshair tone="white" /></span>
        <span className="ds-sdial-centre" aria-hidden="true">
          <span className="ds-sdial-small">Weeks</span>
          <span className="ds-sdial-big">{n}</span>
        </span>
      </div>
    </div>
  );
}
