import Crosshair from './Crosshair';
import ChartTips, { tipProps } from './ChartTips';
import './design.css';

// The sprint dial (decisions "Sprints"; M1 dial(), M6 dial()): one
// segment per week for any length from 2 to 16, with parallel gaps of
// constant width between the weeks, and a wider gap at the top where the
// brand crosshair marks the start and the end. Thin and precise, never
// filled wedges (Tim, 23 Oct).
//
// Two states so far:
// - set-up (Build your plan and Start a sprint, Ready): every week still
//   to come, faint, and in the centre "Weeks" over the length. Give
//   `length` only.
// - running (the Performance Sprint page, M1): give `weeks`. Finished
//   weeks are mint at or above the standard and grey below (Tim, 26 Oct:
//   mint means good, coral is never a data colour); this week fills in
//   the text colour as its days pass; weeks to come are faint. Day ticks
//   sit outside the ring, longer at the week edges, with a dot for
//   today, and the week numbers outside the ticks (desktop only, M1).
//   No key (26 Oct rule 3): every week has a pop-up saying what it is.
// The finished, paused and welcome-back states come with the
// end-of-sprint review and Recovery (Phase 2 steps 6 and 7).
//
// length:  the number of weeks (set-up)
// weeks:   [{ state: 'good'|'below'|'none'|'now'|'next', tip: { value, when, extra } }]
// dayInWeek: today's place in this week, 0 to 6 (running)
// centre:  { small, big, good } what the middle says (running)
// todayTip: the today dot's pop-up words, e.g. { value: 'Today', when: 'Wed 28 Oct' }
// crossTip: the crosshair's, e.g. { value: 'Start and end of the sprint', when: 'Mon 5 Oct to Sun 29 Nov' }
// label:   what a screen reader hears for the whole dial

const C = 180;      // centre, in the drawing's own units (0 to 360)
const R_OUT = 144;
const R_IN = 128;   // a 16-wide ring, as M1
const R_MID = (R_OUT + R_IN) / 2;
const GAP = 7;      // between weeks, the same width all the way across
const TOP_GAP = 40; // around the crosshair at the top
const PAD = 44;     // room around the ring for the ticks and week numbers (running)
const TICK_AT = R_OUT + 8;
const TICK_DAY = 5;
const TICK_WEEK = 9;
const NUMBER_AT = R_OUT + 32;

function point(deg, r) {
  const a = (deg * Math.PI) / 180;
  return [C + r * Math.cos(a), C + r * Math.sin(a)];
}

// A gap of `width` centred on the line out from the centre at `deg`
// meets a circle of radius r this many degrees either side of it.
const half = (width, r) => (Math.asin(width / 2 / r) * 180) / Math.PI;
const f = (p) => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`;

function ring(o0, o1, i0, i1) {
  const large = o1 - o0 > 180 ? 1 : 0;
  return `M${f(point(o0, R_OUT))}A${R_OUT} ${R_OUT} 0 ${large} 1 ${f(point(o1, R_OUT))}`
    + `L${f(point(i1, R_IN))}A${R_IN} ${R_IN} 0 ${large} 0 ${f(point(i0, R_IN))}Z`;
}

/** One week's segment, between the gaps centred at `from` and `to` (degrees). */
function segmentPath(from, to, gapFrom, gapTo) {
  return ring(from + half(gapFrom, R_OUT), to - half(gapTo, R_OUT), from + half(gapFrom, R_IN), to - half(gapTo, R_IN));
}

/** The first part of a week's segment, to a fraction of its length: a straight cut at the end. */
function partPath(from, to, gapFrom, gapTo, part) {
  const o0 = from + half(gapFrom, R_OUT);
  const i0 = from + half(gapFrom, R_IN);
  const startMid = from + half(gapFrom, R_MID);
  const endMid = to - half(gapTo, R_MID);
  const end = startMid + (endMid - startMid) * Math.max(0, Math.min(1, part));
  return ring(o0, Math.max(o0, end), i0, Math.max(i0, end));
}

// Where week i starts and ends (degrees), the top gap centred straight up.
function layout(n) {
  const topDeg = 2 * half(TOP_GAP, R_MID);
  const step = (360 - topDeg) / n;
  const base = -90 + topDeg / 2;
  const edge = (i) => (i === 0 ? -90 : i === n ? 270 : base + i * step);
  const gap = (i) => (i === 0 || i === n ? TOP_GAP : GAP);
  const dayAngle = (d) => base + (d * step) / 7; // d days from the sprint's start
  return { step, base, edge, gap, dayAngle };
}

export default function SprintDial({ length, weeks, dayInWeek = 0, centre, todayTip, crossTip, label }) {
  const running = Array.isArray(weeks) && weeks.length > 0;
  const n = Math.max(2, Math.min(16, running ? weeks.length : Math.round(length) || 12));
  const L = layout(n);
  const words = label || `Sprint dial, ${n} weeks`;
  const box = running ? `${-PAD} ${-PAD} ${360 + 2 * PAD} ${360 + 2 * PAD}` : '0 0 360 360';
  const size = running ? 360 + 2 * PAD : 360;
  const crossTop = ((running ? PAD : 0) + C - R_MID) / size;
  const nowIndex = running ? weeks.findIndex((w) => w.state === 'now') : -1;

  const segments = Array.from({ length: n }, (_, i) => {
    const from = L.edge(i);
    const to = L.edge(i + 1);
    const d = segmentPath(from, to, L.gap(i), L.gap(i + 1));
    if (!running) return <path key={i} className="ds-sdial-seg ds-sdial-seg--next" d={d} />;
    const w = weeks[i];
    const tip = tipProps(w.tip || { value: `Week ${i + 1}` });
    if (w.state === 'now') {
      return (
        <g key={i} className="ds-sdial-week" {...tip}>
          <path className="ds-sdial-seg ds-sdial-seg--next" d={d} />
          <path className="ds-sdial-seg ds-sdial-seg--now" d={partPath(from, to, L.gap(i), L.gap(i + 1), (dayInWeek + 1) / 7)} />
        </g>
      );
    }
    return <path key={i} className={`ds-sdial-seg ds-sdial-seg--${w.state}`} d={d} {...tip} />;
  });

  let marks = null;
  if (running) {
    const ticks = [];
    for (let k = 0; k <= n * 7; k += 1) {
      const a = L.dayAngle(k);
      const long = k % 7 === 0;
      const p = point(a, TICK_AT);
      const q = point(a, TICK_AT + (long ? TICK_WEEK : TICK_DAY));
      ticks.push(<line key={k} className={`ds-sdial-tick${long ? ' ds-sdial-tick--week' : ''}`} x1={p[0].toFixed(2)} y1={p[1].toFixed(2)} x2={q[0].toFixed(2)} y2={q[1].toFixed(2)} />);
    }
    const numbers = weeks.map((w, i) => {
      const p = point((L.edge(i) + L.edge(i + 1)) / 2, NUMBER_AT);
      return (
        <text key={i} className={`ds-sdial-wn ds-sdial-wn--${w.state}`} x={p[0].toFixed(2)} y={p[1].toFixed(2)} textAnchor="middle" dominantBaseline="central" aria-hidden="true">
          {i + 1}
        </text>
      );
    });
    let dot = null;
    if (nowIndex >= 0) {
      const t = point(L.dayAngle(nowIndex * 7 + dayInWeek + 0.5), TICK_AT + 2);
      dot = <circle className="ds-sdial-today" cx={t[0].toFixed(2)} cy={t[1].toFixed(2)} r="3.5" {...tipProps(todayTip || { value: 'Today' })} />;
    }
    const cx = point(-90, R_MID);
    marks = (
      <>
        <g aria-hidden="true">{ticks}</g>
        {numbers}
        {dot}
        {/* The crosshair is drawn over this, as an image (never redrawn); this carries its pop-up. */}
        <rect className="ds-sdial-crosstip" x={cx[0] - 14} y={cx[1] - 14} width="28" height="28" {...tipProps(crossTip || { value: 'Start and end of the sprint' })} />
      </>
    );
  }

  const middle = running && centre
    ? (
      <span className="ds-sdial-centre ds-sdial-centre--running" aria-hidden="true">
        <span className="ds-sdial-small">{centre.small}</span>
        {centre.big != null && <span className={`ds-sdial-big ds-sdial-big--score${centre.good ? ' ds-sdial-big--good' : ''}`}>{centre.big}</span>}
      </span>
    )
    : (
      <span className="ds-sdial-centre" aria-hidden="true">
        <span className="ds-sdial-small">Weeks</span>
        <span className="ds-sdial-big">{n}</span>
      </span>
    );

  const svg = (
    <svg viewBox={box} role={running ? 'group' : 'img'} aria-label={words}>
      {segments}
      {marks}
    </svg>
  );

  return (
    <div className={`ds-sdial${running ? ' ds-sdial--running' : ''}`}>
      <div className="ds-sdial-ring">
        {running ? <ChartTips className="ds-sdial-tips">{svg}</ChartTips> : svg}
        <span className="ds-sdial-cross" aria-hidden="true" style={{ top: `${(crossTop * 100).toFixed(3)}%` }}><Crosshair tone="white" /></span>
        {middle}
      </div>
    </div>
  );
}
