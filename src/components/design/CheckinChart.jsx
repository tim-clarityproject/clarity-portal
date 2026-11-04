import { useLayoutEffect, useRef, useState } from 'react';
import ChartTips, { tipProps } from './ChartTips';
import useIsPhone from './useIsPhone';
import { tripsWords } from '../../lib/performance/checkin';
import './design.css';

// The check-in's two-line graph (mock-up M12 "Over time", with M4's later
// look for the dashboard's card; Phase 5): the Hardware score and the
// Software score each month, out of 100. One shared part, so the
// check-in's results and the dashboard (Phase 5 step 2) draw it the same.
//
// - Hardware is a thin line in the text colour, Software a thin dashed
//   grey line (M4 v47). Coral is never a data colour (26 Oct rule 1, over
//   M12's coral Hardware line); a month that rose is a mint dot (rises
//   are mint), every other dot is its line's colour.
// - No key (26 Oct rule 3, over M12's legend): each line is named at its
//   right end with its latest score ("Hardware 68"); months along the
//   bottom; a small ring under a month with long-haul travel (M12). The
//   line zooms, with its lowest gridline labelled (graphs rule).
// - Every dot and ring has the shared pop-up (ChartTips): the score, then
//   the month, then the change on the month before.
// - Fewer than two months: the empty frame with one line saying when it
//   starts.
//
// points: checkinPoints() — [{ month, axis, when, hardware, software, trips }]

const H = { desktop: 220, phone: 200 };
const PAD = { left: 34, top: 14, bottom: 40 };
const END = { desktop: 96, phone: 86 }; // room for "Hardware 100" at the right end
const LABEL_STEP = 14;                  // the end labels never sit closer than this
const MIN_AXIS_GAP = 34;                // px between month names before some are left out

function scaleFloor(values) {
  const lo = Math.min(...values);
  return Math.max(0, Math.floor((lo - 10) / 10) * 10);
}

function change(points, i, key) {
  if (i === 0) return null;
  const a = points[i][key];
  const b = points[i - 1][key];
  if (a == null || b == null) return null;
  return a - b;
}

function changeWords(d, before) {
  if (d == null) return [];
  if (d > 0) return [`Up ${d} on ${before}.`];
  if (d < 0) return [`Down ${-d} on ${before}.`];
  return [`The same as ${before}.`];
}

export default function CheckinChart({ points = [], empty = 'Your graph starts here after your second check-in.', label = 'Hardware score and Software score by month, out of 100' }) {
  const phone = useIsPhone();
  const boxRef = useRef(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return undefined;
    const fit = () => setWidth(Math.round(el.getBoundingClientRect().width));
    fit();
    const watch = new ResizeObserver(fit);
    watch.observe(el);
    return () => watch.disconnect();
  }, []);

  if (points.length < 2) {
    return (
      <div className="ds-cchart ds-cchart--empty">
        <p className="ds-chart-empty">{empty}</p>
      </div>
    );
  }

  const W = Math.max(width, 240);
  const h = phone ? H.phone : H.desktop;
  const right = phone ? END.phone : END.desktop;
  const plotW = W - PAD.left - right;
  const plotH = h - PAD.top - PAD.bottom;
  const values = points.flatMap((p) => [p.hardware, p.software]).filter((v) => v != null);
  const lo = scaleFloor(values);
  const grid = [lo, ...(100 - lo >= 40 ? [Math.round((lo + 100) / 20) * 10] : []), 100];
  const n = points.length;
  const X = (i) => PAD.left + (n === 1 ? plotW / 2 : (i * plotW) / (n - 1));
  const Y = (v) => PAD.top + (1 - (v - lo) / (100 - lo)) * plotH;
  const series = [
    { key: 'hardware', name: 'Hardware', cls: 'ds-cchart-line--hw' },
    { key: 'software', name: 'Software', cls: 'ds-cchart-line--sw' },
  ];
  // The end labels: level with each line's last dot, kept apart.
  const ends = series.map((s) => {
    const last = [...points].reverse().find((p) => p[s.key] != null);
    return { ...s, value: last?.[s.key], y: last ? Y(last[s.key]) + 4 : null };
  });
  if (ends[0].y != null && ends[1].y != null && Math.abs(ends[0].y - ends[1].y) < LABEL_STEP) {
    const [top, bottom] = ends[0].y <= ends[1].y ? [ends[0], ends[1]] : [ends[1], ends[0]];
    const mid = (top.y + bottom.y) / 2;
    top.y = mid - LABEL_STEP / 2;
    bottom.y = mid + LABEL_STEP / 2;
  }
  const step = Math.max(1, Math.ceil(MIN_AXIS_GAP / Math.max(1, plotW / Math.max(1, n - 1))));
  const lastX = X(n - 1);

  return (
    <ChartTips className="ds-cchart">
      <div ref={boxRef} className="ds-cchart-box">
        {width > 0 && (
          <svg className="ds-cchart-svg" width={W} height={h} viewBox={`0 0 ${W} ${h}`} role="group" aria-label={label}>
            {grid.map((v) => (
              <g key={`g${v}`} aria-hidden="true">
                <line className="ds-cchart-grid" x1={PAD.left} x2={W - right + 6} y1={Y(v)} y2={Y(v)} />
                <text className="ds-cchart-text" x={PAD.left - 8} y={Y(v) + 4} textAnchor="end">{v}</text>
              </g>
            ))}
            {series.map((s) => {
              const pts = points.map((p, i) => (p[s.key] == null ? null : [X(i), Y(p[s.key])])).filter(Boolean);
              return <polyline key={s.key} className={`ds-cchart-line ${s.cls}`} points={pts.map((q) => `${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(' ')} aria-hidden="true" />;
            })}
            {series.map((s) => points.map((p, i) => {
              if (p[s.key] == null) return null;
              const d = change(points, i, s.key);
              const up = d != null && d > 0;
              return (
                <circle
                  key={`${s.key}${p.month}`}
                  className={`ds-cchart-dot ${up ? 'ds-cchart-dot--up' : s.cls}`}
                  cx={X(i)}
                  cy={Y(p[s.key])}
                  r={i === n - 1 ? 4 : 2.6}
                  {...tipProps({ value: `${s.name} score ${p[s.key]}/100`, when: p.when, extra: changeWords(d, i ? points[i - 1].when.split(' ')[0] : '') })}
                />
              );
            }))}
            {ends.map((e) => (e.y == null ? null : (
              <text key={`end${e.key}`} className={`ds-cchart-text ds-cchart-end ${e.cls}`} x={lastX + 10} y={e.y} aria-hidden="true">{`${e.name} ${e.value}`}</text>
            )))}
            {points.map((p, i) => (
              <g key={`m${p.month}`}>
                {(i % step === 0 || i === n - 1) && (
                  <text className="ds-cchart-text" x={X(i)} y={h - 20} textAnchor="middle" aria-hidden="true">{p.axis}</text>
                )}
                {p.trips > 0 && (
                  <circle className="ds-cchart-trip" cx={X(i)} cy={h - 7} r={3.5} {...tipProps({ value: tripsWords(p.trips), when: p.when, extra: ['Each crossed 3 or more time zones.'] })} />
                )}
              </g>
            ))}
          </svg>
        )}
      </div>
    </ChartTips>
  );
}
