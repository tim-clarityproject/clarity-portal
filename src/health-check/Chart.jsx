import { useId } from 'react';
import { useTipTarget } from './parts';
import { PROGS, RES, stateSentence } from './words';

// Strategic importance against progress (mock-up M7b version 46, to the 26 Oct
// design rules): thin lines and space on a fine dotted background; a filled
// mint dot is moving well; needs attention is a soft coral outline with a
// second fine ring, never a fill; needs managing is an outline in the text
// colour; less important or too early to tell is a grey ring. Every outline is
// 1.5px (Tim, 28 Oct, 14:34). Dot size shows resource (m20DotSize). One line
// at Fair and one at the Health Check's own line; both axes named with only
// their ends labelled, and two area names (Tim, 28 Oct, 09:45). No project
// name on the chart: every dot has a 44px tap area and a pop-up.

/** The dot radii from m20DotSize, as the mock-up draws them (x0.85 on a phone). */
const RADIUS = { small: 8, middle: 12, large: 17 };
const dotRadius = (size, phone) => (phone ? Math.round(RADIUS[size] * 0.85) : RADIUS[size]);

/**
 * Where each dot goes. Dots that would touch are moved apart, but only within
 * the dot's own area of the chart (the same side of the Fair line and of the
 * Health Check's line; Fair stays on its line), so a moved dot never shows a
 * false state. When the area is full, a dot takes the spot that overlaps least.
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
    const [y1, y2] = row.importance > line ? [PT + r, cy - r - 2] : [Math.min(y0, cy + r + 2), PT + ph - r];
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

function Dot({ dot, lit }) {
  const { row, x, y, r } = dot;
  const q = row.q;
  const lines = [
    { label: `Project ${row.n}` },
    { bold: row.text },
    row.rated ? { big: `${row.pct}%`, small: 'strategic importance' } : { line: 'Strategic importance isn’t rated yet.' },
    { line: stateSentence(row) },
    ...(PROGS[row.progress] ? [{ line: `Progress is ${PROGS[row.progress]}.` }] : []),
    // a blank resource counts as Moderate, as its dot size does (m20DotSize)
    { line: `Resource required is ${(RES[row.resource] || RES[3])[0]}.` },
  ];
  const { isOpen: _open, ...t } = useTipTarget(lines);
  const fill = q === 'mi' ? 'var(--mint)' : 'var(--bg)';
  const stroke = q === 'mi' ? 'var(--mint)' : q === 'co' ? 'var(--soft)' : q === 'pe' ? 'var(--fg)' : 'var(--ph)';
  const tc = q === 'mi' ? 'var(--on-mint)' : q === 'co' ? 'var(--soft)' : q === 'pe' ? 'var(--fg)' : 'var(--ph)';
  const onKey = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); t.onFocus(); } };
  return (
    <g className={`dot${lit ? ' on' : ''}`} data-n={row.n} tabIndex={0} role="button" aria-label={`Project ${row.n}, ${row.text}. ${stateSentence(row)}`} {...t} onKeyDown={onKey}>
      <circle className="hit" cx={x} cy={y} r={22} />
      {q === 'co' && <circle cx={x} cy={y} r={r + 4} style={{ fill: 'none', stroke: 'var(--soft)' }} strokeWidth={1} />}
      <circle cx={x} cy={y} r={r} style={{ fill, stroke }} strokeWidth={1.5} />
      <text x={x} y={y + 4} textAnchor="middle" fontSize={r < 11 ? 11 : 12} style={{ fill: tc }}>{row.n}</text>
    </g>
  );
}

/**
 * @param {Object} props
 * @param {Object[]} props.rows resultRows
 * @param {number} props.line the Health Check's line for important
 * @param {boolean} props.phone
 * @param {string|null} [props.lit] a project id: its dot is lit and the others fade
 */
export default function Chart({ rows, line, phone, lit = null }) {
  const gid = `hc-dots-${useId().replace(/:/g, '')}`;
  const W = phone ? 320 : 880;
  const H = phone ? 328 : 428;
  const PL = phone ? 34 : 44;
  const PR = phone ? 16 : 24;
  const PT = 42;
  const PB = phone ? 52 : 56;
  const pw = W - PL - PR;
  const ph = H - PT - PB;
  // Dots sit inset from the plot's edges.
  const IN = phone ? 18 : 24;
  const X = (pg) => PL + IN + ((pg - 1) / 4) * (pw - 2 * IN);
  const Y = (im) => PT + (1 - im / 100) * ph;
  const cx = X(3);
  const cy = Y(line);
  const dots = placeDots(rows, { X, Y, PL, PT, pw, ph, cx, cy, line, radius: (row) => dotRadius(row.size, phone) });
  const small = { fontSize: 12, style: { fill: 'var(--ph)' } };
  return (
    <svg className={lit ? 'hl' : undefined} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Strategic importance against progress, one numbered dot per project">
      <defs>
        <pattern id={gid} width={10} height={10} patternUnits="userSpaceOnUse" x={PL} y={PT}>
          <circle cx={5} cy={5} r={0.9} style={{ fill: 'var(--line)' }} />
        </pattern>
      </defs>
      <rect x={PL} y={PT} width={pw} height={ph} fill={`url(#${gid})`} />
      <g style={{ stroke: 'var(--line)' }} strokeWidth={1}>
        <line x1={PL} x2={PL + pw} y1={cy} y2={cy} />
        <line x1={cx} x2={cx} y1={PT} y2={PT + ph} />
        <line x1={PL} x2={PL + pw} y1={PT + ph} y2={PT + ph} />
      </g>
      <text transform={`translate(${phone ? 12 : 16} ${PT + ph / 2}) rotate(-90)`} textAnchor="middle" fontSize={12.5} style={{ fill: 'var(--t2)' }}>Strategic importance</text>
      <text x={PL - 8} y={PT + 4} textAnchor="end" {...small}>High</text>
      <text x={PL - 8} y={PT + ph} textAnchor="end" {...small}>Low</text>
      <text x={PL} y={PT + ph + 20} {...small}>Embryonic</text>
      <text x={PL + pw} y={PT + ph + 20} textAnchor="end" {...small}>Excellent</text>
      <text x={PL + pw / 2} y={PT + ph + 42} textAnchor="middle" fontSize={12.5} style={{ fill: 'var(--t2)' }}>Progress</text>
      <text x={X(2)} y={PT - 24} textAnchor="middle" fontSize={12.5} style={{ fill: 'var(--soft)' }}>Needs attention</text>
      <text x={phone ? PL + pw : X(4.5)} y={PT - 24} textAnchor={phone ? 'end' : 'middle'} fontSize={12.5} style={{ fill: 'var(--mint)' }}>Moving well</text>
      {dots.map((d) => <Dot key={d.row.id} dot={d} lit={lit === d.row.id} />)}
    </svg>
  );
}
