import { useEffect, useId, useRef, useState } from 'react';
import ChartTips, { tipProps } from '../../components/design/ChartTips';
import { PROGS, RES, stateSentence } from '../../health-check/words';
import './healthCheck.css';

// Strategic importance against progress (mock-up M7b version 51, to the
// 26 Oct design rules), one shared drawing for the outside Health Check, the
// example report and the Health Check inside the portal: thin lines and space
// on a fine dotted background; a filled mint dot is moving well; needs
// attention is a soft coral outline with a second fine ring, never a fill;
// needs managing is an outline in the text colour; less important or too
// early to tell is a grey ring. Every outline is 1.5px. Dot size shows
// resource (m20DotSize). One line at Fair and one at the Health Check's own
// line; both axes named with only their ends labelled, and two area names. No
// project name on the chart: every dot has a 44px tap area at any size and
// the shared pop-up (ChartTips). Where close dots' tap areas overlap, a tap
// opens the dot whose centre is nearest it (ChartTips' nearest; follow-up 1).
//
// rows:  resultRows (src/health-check/words.js)
// line:  the Health Check's line for important
// lit:   a project id: its dot is lit and the others fade (a question pointed at)
// was:   for Compare two versions (M7): { [projectId]: { progress, importance } },
//        where each project stood in the earlier version. A dashed ring is
//        drawn there with a fine line to where it is now.
// notes: for Compare, one more line in each dot's pop-up, by project id
//        ("On Tue 14 Jul, its progress was “Fair”.", "It’s new since Tue 14 Jul.").

/** The dot radii from m20DotSize, as the mock-up draws them (x0.85 on a phone). */
const RADIUS = { small: 8, middle: 12, large: 17 };
const dotRadius = (size, phone) => (phone ? Math.round(RADIUS[size] * 0.85) : RADIUS[size]);

/**
 * Where each dot goes. Dots that would touch are moved apart, but only within
 * the dot's own area of the chart (the same side of the Fair line and of the
 * Health Check's line; Fair stays on its line), so a moved dot never shows a
 * false state. A dot that isn't moved sits at its true place. When the area is full, a dot takes the spot that overlaps least.
 * geo: X, Y, PL, PT, pw, ph, cx (the Fair line), cy (the line for important),
 * line, and radius(row).
 */
export function placeDots(rows, geo) {
  const { X, Y, PL, PT, pw, ph, cx, cy, line, radius } = geo;
  const placed = [];
  const clash = (x, y, r) => placed.reduce((m, o) => Math.min(m, Math.hypot(o.x - x, o.y - y) - o.r - r), Infinity);
  const free = (x, y, r) => !placed.some((o) => Math.abs(o.x - x) < r + o.r + 8 && Math.abs(o.y - y) < r + o.r + 8);
  return rows.filter((row) => row.progress >= 1 && row.progress <= 5).map((row) => {
    const r = radius(row);
    const step = 2 * r + 10;
    const x0 = X(row.progress);
    const y0 = Y(row.importance);
    const [x1, x2] = row.progress < 3 ? [PL + r, cx - r - 2] : row.progress > 3 ? [cx + r + 2, PL + pw - r] : [cx - step * 1.5, cx + step * 1.5];
    // A dot just either side of the line may cross it at its true place, as
    // the mock-up draws it; a moved one stays on its own side.
    const [y1, y2] = row.importance > line ? [PT + r, Math.max(y0, cy - r - 2)] : [Math.min(y0, cy + r + 2), PT + ph - r];
    const inArea = ([x, y]) => x >= x1 && x <= x2 && y >= y1 && y <= y2;
    const ring = (unit, rings) => {
      const out = [[x0, y0]];
      const dir = row.progress === 5 ? -1 : 1; // the mock-up's first moves: sideways, away from the edge
      for (let t = 1; t <= 6; t += 1) out.push([x0 + dir * unit * t, y0]);
      for (let k = 1; k <= rings; k += 1) {
        for (let dy = -k; dy <= k; dy += 1) for (let dx = -k; dx <= k; dx += 1) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) === k) out.push([x0 + dx * unit, y0 + dy * unit * 0.8]);
        }
      }
      return out.filter(inArea);
    };
    let spot = ring(step, 14).find(([x, y]) => free(x, y, r));
    if (!spot) {
      // The area is full: the spot furthest from every other dot.
      const fine = ring(step / 3, 40);
      spot = (fine.length ? fine : [[Math.min(x2, Math.max(x1, x0)), Math.min(y2, Math.max(y1, y0))]])
        .reduce((best, c) => (clash(c[0], c[1], r) > clash(best[0], best[1], r) ? c : best));
    }
    const dot = { row, x: spot[0], y: spot[1], r };
    placed.push(dot);
    return dot;
  });
}

/** What a dot's pop-up says: the kind first, small, then the name, then its figures and answers. */
export function dotTip(row, note = null) {
  return {
    kind: `Project ${row.n}`,
    name: row.text,
    extra: [
      row.rated ? `${row.pct}% strategic importance` : 'Strategic importance isn’t rated yet.',
      stateSentence(row),
      // the chosen answers in curly quotes
      ...(PROGS[row.progress] ? [`Progress is “${PROGS[row.progress]}”.`] : []),
      // a blank resource counts as Moderate, as its dot size does (m20DotSize), and isn't a chosen answer
      `Resource required is ${RES[row.resource] ? `“${RES[row.resource][0]}”` : RES[3][0]}.`,
      ...(note ? [note] : []),
    ],
  };
}

function Dot({ dot, lit, hit, note }) {
  const { row, x, y, r } = dot;
  const q = row.q || 'no';
  return (
    <g className={`hc-dot hc-dot--${q}${lit ? ' hc-dot--lit' : ''}`} data-n={row.n} {...tipProps(dotTip(row, note))} role="button" aria-label={`Project ${row.n}, ${row.text}. ${stateSentence(row)}`}>
      <circle className="hc-dot-tap" cx={x} cy={y} r={hit} />
      {row.q === 'co' && <circle className="hc-dot-ring" cx={x} cy={y} r={r + 4} />}
      <circle className="hc-dot-mark" cx={x} cy={y} r={r} />
      <text className={`hc-dot-n${r < 11 ? ' hc-dot-n--small' : ''}`} x={x} y={y + 4} textAnchor="middle">{row.n}</text>
    </g>
  );
}

/** M7b's own measures: 700 by 440 on a laptop, 340 by 340 on a phone. */
export function chartFrame(phone) {
  const W = phone ? 340 : 700;
  const H = phone ? 340 : 440;
  const PL = phone ? 40 : 46;
  const PR = phone ? 10 : 18;
  const PT = 36;
  const PB = phone ? 48 : 54;
  return { W, H, PL, PR, PT, PB, pw: W - PL - PR, ph: H - PT - PB, IN: phone ? 20 : 26 };
}

export default function HealthCheckChart({ rows, line, phone, lit = null, was = null, notes = null }) {
  const gid = `hc-dots-${useId().replace(/:/g, '')}`;
  const { W, H, PL, PT, pw, ph, IN } = chartFrame(phone);
  // Dots sit inset from the plot's edges.
  const X = (pg) => PL + IN + ((pg - 1) / 4) * (pw - 2 * IN);
  const Y = (im) => PT + (1 - im / 100) * ph;
  const cx = X(3);
  const cy = Y(line);
  const dots = placeDots(rows, { X, Y, PL, PT, pw, ph, cx, cy, line, radius: (row) => dotRadius(row.size, phone) });
  // Every dot keeps a 44px tap area, even when the chart is drawn smaller
  // than its own size (between a phone and a laptop). M7b draws 48px.
  const ref = useRef(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const svg = ref.current;
    if (!svg || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => {
      const w = svg.getBoundingClientRect().width;
      if (w) setScale(Math.max(1, W / w));
    });
    ro.observe(svg);
    return () => ro.disconnect();
  }, [W]);
  const hit = Math.ceil(24 * scale);
  const bottom = PT + ph;
  const small = phone ? ' hc-chart-area--phone' : '';
  return (
    <ChartTips className="hc-chart" nearest>
      <svg ref={ref} className={lit ? 'hc-chart--lit' : undefined} viewBox={`0 0 ${W} ${H}`} role="group" aria-label="Strategic importance against progress, one numbered dot for each project">
        <defs>
          <pattern id={gid} width={10} height={10} patternUnits="userSpaceOnUse" x={PL} y={PT}>
            <circle cx={5} cy={5} r={0.9} className="hc-chart-grain" />
          </pattern>
        </defs>
        <rect x={PL} y={PT} width={pw} height={ph} fill={`url(#${gid})`} />
        <g className="hc-chart-lines">
          <line x1={PL} x2={PL + pw} y1={cy} y2={cy} />
          <line x1={cx} x2={cx} y1={PT} y2={bottom} />
          <line x1={PL} x2={PL + pw} y1={bottom} y2={bottom} />
        </g>
        <g aria-hidden="true">
          <text className="hc-chart-axis" transform={`translate(${phone ? 12 : 14} ${PT + ph / 2}) rotate(-90)`} textAnchor="middle">Strategic importance</text>
          <text className="hc-chart-end" x={PL - 8} y={PT + 12} textAnchor="end">High</text>
          <text className="hc-chart-end" x={PL - 8} y={bottom} textAnchor="end">Low</text>
          <text className="hc-chart-end" x={PL} y={bottom + 18}>Embryonic</text>
          <text className="hc-chart-end" x={PL + pw} y={bottom + 18} textAnchor="end">Excellent</text>
          <text className="hc-chart-axis" x={PL + pw / 2} y={bottom + 40} textAnchor="middle">Progress</text>
          <text className={`hc-chart-area hc-chart-area--soft${small}`} data-chart-label x={X(2)} y={PT - 14} textAnchor="middle">Needs attention</text>
          <text className={`hc-chart-area hc-chart-area--good${small}`} data-chart-label x={phone ? PL + pw : X(4.5)} y={PT - 14} textAnchor={phone ? 'end' : 'middle'}>Moving well</text>
        </g>
        {was && (
          <g aria-hidden="true">
            {dots.filter((d) => was[d.row.id] && was[d.row.id].progress >= 1).map((d) => {
              const w = was[d.row.id];
              const wx = X(w.progress);
              const wy = Y(w.importance);
              // M7: drawn only where the project has moved, at the size it had then.
              if (Math.hypot(wx - d.x, wy - d.y) <= 8) return null;
              return (
                <g key={d.row.id}>
                  <line className="hc-chart-moved" x1={wx} y1={wy} x2={d.x} y2={d.y} />
                  <circle className="hc-chart-was" cx={wx} cy={wy} r={w.size ? dotRadius(w.size, phone) : d.r} />
                </g>
              );
            })}
          </g>
        )}
        {dots.map((d) => <Dot key={d.row.id} dot={d} lit={lit === d.row.id} hit={hit} note={notes?.[d.row.id] || null} />)}
      </svg>
    </ChartTips>
  );
}
