import { useTipTarget } from './parts';
import { PROGS, stateSentence } from './words';

// Strategic importance against progress (mock-up M7b version 4, to the 26 Oct
// design rules): thin lines and space; a filled mint dot is moving well; needs
// attention is a soft coral outline with a second fine ring, never a fill;
// needs managing is an outline in the text colour; less important or too early
// to tell is a fine grey ring. No key: each area is named where it is, both
// axes are named, and every dot has a 44px tap area and a pop-up.

/** Where each dot goes: dots that would touch are moved apart, always inside the plot. */
export function placeDots(rows, geo) {
  const { X, Y, PL, PT, pw, ph, r0 } = geo;
  const gap = 2 * r0 + 8;
  const step = 2 * r0 + 10;
  const minX = PL + r0;
  const maxX = PL + pw - r0;
  const minY = PT + r0;
  const maxY = PT + ph - r0;
  const placed = [];
  const free = (x, y) => !placed.some((o) => Math.abs(o.x - x) < gap && Math.abs(o.y - y) < gap);
  return rows.filter((r) => r.progress != null).map((r) => {
    const x0 = X(r.progress);
    const y0 = Y(r.importance);
    // The mock-up's first moves: sideways, away from the edge, then a widening search.
    const dir = r.progress === 5 ? -1 : 1;
    const cands = [[x0, y0]];
    for (let t = 1; t <= 6; t += 1) cands.push([x0 + dir * step * t, y0]);
    for (let ring = 1; ring <= 12; ring += 1) {
      for (let dy = -ring; dy <= ring; dy += 1) {
        for (let dx = -ring; dx <= ring; dx += 1) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) === ring) cands.push([x0 + dx * step, y0 + dy * step * 0.8]);
        }
      }
    }
    const inside = ([x, y]) => x >= minX && x <= maxX && y >= minY && y <= maxY;
    const clamp = ([x, y]) => [Math.min(maxX, Math.max(minX, x)), Math.min(maxY, Math.max(minY, y))];
    const spot = cands.map(clamp).find(([x, y], i) => (i === 0 || inside(cands[i])) && free(x, y)) || clamp([x0, y0]);
    const dot = { row: r, x: spot[0], y: spot[1] };
    placed.push(dot);
    return dot;
  });
}

function Dot({ dot, r0, top, phone, PT }) {
  const { row, x, y } = dot;
  const q = row.q;
  // The top project's name sits above its dot, or below it when the area names are in the way.
  const above = y - r0 - (q === 'co' ? 14 : 10);
  const labelY = above - 12 < PT + 4 ? y + r0 + (q === 'co' ? 22 : 18) : above;
  const lines = [
    { label: `Project ${row.n}` },
    { bold: row.text },
    row.rated ? { big: `${row.pct}%`, small: 'strategic importance' } : { line: 'Strategic importance isn’t rated yet.' },
    { line: stateSentence(row) },
    { line: `Progress is ${PROGS[row.progress]}.` },
  ];
  const { isOpen: _open, ...t } = useTipTarget(lines);
  const fill = q === 'mi' ? 'var(--mint)' : 'var(--bg)';
  const stroke = q === 'mi' ? 'var(--mint)' : q === 'co' ? 'var(--soft)' : q === 'pe' ? 'var(--fg)' : 'var(--ph)';
  const tc = q === 'mi' ? 'var(--on-mint)' : q === 'co' ? 'var(--soft)' : q === 'pe' ? 'var(--fg)' : 'var(--ph)';
  const onKey = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); t.onFocus(); } };
  return (
    <g className="dot" tabIndex={0} role="button" aria-label={`Project ${row.n}, ${row.text}. ${stateSentence(row)}`} {...t} onKeyDown={onKey}>
      <circle className="hit" cx={x} cy={y} r={22} style={{ fill: 'transparent', stroke: 'none' }} />
      {q === 'co' && <circle cx={x} cy={y} r={r0 + 4} style={{ fill: 'none', stroke: 'var(--soft)' }} strokeWidth={1} />}
      <circle cx={x} cy={y} r={r0} style={{ fill, stroke }} strokeWidth={q ? 1.5 : 1} />
      <text x={x} y={y + 4} textAnchor="middle" fontSize={12} style={{ fill: tc }}>{row.n}</text>
      {top && !phone && (q === 'co' || q === 'pe') && (
        <text x={x} y={labelY} textAnchor="middle" fontSize={12.5} style={{ fill: 'var(--fg)' }}>{row.text.length > 48 ? `${Array.from(row.text).slice(0, 46).join('').trimEnd()}…` : row.text}</text>
      )}
    </g>
  );
}

export default function Chart({ rows, phone }) {
  const W = phone ? 320 : 880;
  const H = phone ? 336 : 440;
  const PL = phone ? 50 : 70;
  const PR = phone ? 10 : 24;
  const PT = phone ? 50 : 34;
  const PB = phone ? 52 : 56;
  const pw = W - PL - PR;
  const ph = H - PT - PB;
  const X = (pg) => PL + ((pg - 1) / 4) * pw;
  const Y = (im) => PT + (1 - im / 100) * ph;
  const r0 = phone ? 11 : 12;
  const cx = PL + pw / 2;
  const cy = Y(50);
  const dots = placeDots(rows, { X, Y, PL, PT, pw, ph, r0 });
  const labs = phone
    ? [[PL + 2, 'start', 'Needs attention', 'var(--soft)', 30], [X(3), 'middle', 'Needs managing', 'var(--t2)', 12], [PL + pw, 'end', 'Moving well', 'var(--mint)', 30]]
    : [[X(2), 'middle', 'Needs attention', 'var(--soft)', 14], [X(3), 'middle', 'Needs managing', 'var(--t2)', 14], [X(4.5), 'middle', 'Moving well', 'var(--mint)', 14]];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Strategic importance against progress, one numbered dot per project">
      <g style={{ stroke: 'var(--line)' }} strokeWidth={1}>
        <line x1={PL} x2={PL + pw} y1={cy} y2={cy} />
        <line x1={cx} x2={cx} y1={PT} y2={PT + ph} />
        <line x1={PL} x2={PL + pw} y1={PT + ph} y2={PT + ph} />
      </g>
      {[0, 50, 100].map((v) => <text key={v} x={PL - 8} y={Y(v) + 4} textAnchor="end" fontSize={12} style={{ fill: 'var(--ph)' }}>{v}%</text>)}
      <text transform={`translate(${phone ? 12 : 16} ${PT + ph / 2}) rotate(-90)`} textAnchor="middle" fontSize={12.5} style={{ fill: 'var(--t2)' }}>Strategic importance</text>
      {phone ? (
        <>
          <text x={X(1)} y={PT + ph + 20} fontSize={12} style={{ fill: 'var(--ph)' }}>Embryonic</text>
          <text x={X(3)} y={PT + ph + 20} textAnchor="middle" fontSize={12} style={{ fill: 'var(--ph)' }}>Fair</text>
          <text x={X(5)} y={PT + ph + 20} textAnchor="end" fontSize={12} style={{ fill: 'var(--ph)' }}>Excellent</text>
        </>
      ) : [1, 2, 3, 4, 5].map((k) => (
        <text key={k} x={X(k)} y={PT + ph + 20} textAnchor={k === 1 ? 'start' : k === 5 ? 'end' : 'middle'} fontSize={12} style={{ fill: 'var(--ph)' }}>{PROGS[k]}</text>
      ))}
      <text x={cx} y={PT + ph + 42} textAnchor="middle" fontSize={12.5} style={{ fill: 'var(--t2)' }}>Progress</text>
      {labs.map((l) => <text key={l[2]} x={l[0]} y={PT - l[4]} textAnchor={l[1]} fontSize={12.5} style={{ fill: l[3] }}>{l[2]}</text>)}
      <text x={PL + pw} y={PT + ph - 10} textAnchor="end" fontSize={12.5} style={{ fill: 'var(--ph)' }}>Less important</text>
      {dots.map((d) => <Dot key={d.row.id} dot={d} r0={r0} top={d.row.n === 1} phone={phone} PT={PT} />)}
    </svg>
  );
}
