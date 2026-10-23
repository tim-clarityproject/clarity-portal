import { remap, sizeFor } from './wheelGeometry';
import { WheelLabels } from './WheelLabels';

// The radar wheel, ported line for line from the approved mock-up's
// wheel() (wheel-of-life.html): five rings (2 to 10), spokes that stop
// short of the centre like the crosshair in the mark, the latest check-in
// as a coral shape with dots, the start of the range as a dashed grey
// outline, check-ins in between as faint lines, and each target as a
// dashed soft-coral line with a small dot. Areas with no score draw only
// the segments they have. Needs three or more areas; the pages draw the
// sectional wheel instead when there are fewer (effectiveChartStyle).

function lineStyle(cls) {
  if (cls === 'now') return { style: { stroke: 'var(--coral)' }, strokeWidth: 2 };
  if (cls === 'start') return { style: { stroke: 'var(--text-2)' }, strokeWidth: 1.5, strokeDasharray: '5 4' };
  return { style: { stroke: 'var(--wol-between)' }, strokeWidth: 1 };
}

/**
 * @param {object} props
 * @param {object[]} props.areas - the areas on the wheel, in wheel order
 * @param {Array<{ cls: 'now'|'start'|'o', scores: object }>} props.series - drawn in the order given: in-between ('o') first, then 'start', then 'now'
 * @param {object} [props.targets] - { key: target|null }; none drawn when absent
 * @param {object} [props.labelValues] - { key: score } shown after each label
 * @param {string} [props.highlightKey] - the area whose spoke and label light up
 * @param {'desktop'|'phone'|'mini'} [props.size='mini']
 * @param {boolean} [props.labels=false]
 * @param {boolean} [props.ticks=false] - the ring values 2, 4, 6, 8
 * @param {string} [props.aria]
 */
export default function WheelRadar({
  areas, series, targets = null, labelValues = null, highlightKey = null,
  size = 'mini', labels = false, ticks = false, aria = 'Wheel of Life',
}) {
  const o = sizeFor(size, true);
  const M = remap(areas, series, targets, labels ? labelValues : null);
  const N = M.N;
  const STP = 360 / N;
  const hlIndex = highlightKey ? areas.findIndex((a) => a.key === highlightKey) : -1;

  function pt(idx, val) {
    const a = ((-90 + idx * STP) * Math.PI) / 180;
    const r = (val / 10) * o.R;
    return [o.cx + r * Math.cos(a), o.cy + r * Math.sin(a)];
  }

  // rings
  const rings = [];
  for (let k = 2; k <= 10; k += 2) {
    rings.push(
      <circle
        key={k}
        cx={o.cx}
        cy={o.cy}
        r={((k / 10) * o.R).toFixed(1)}
        fill="none"
        style={{ stroke: k === 10 ? 'var(--btn-line)' : 'var(--line)' }}
        strokeWidth="1"
        strokeDasharray={k === 10 ? undefined : '1.5 3.5'}
      />,
    );
  }

  // spokes with a gap at the centre, like the crosshair in the mark
  const gap = o.R * 0.09;
  const spokes = [];
  for (let i = 0; i < N; i += 1) {
    const a = ((-90 + i * STP) * Math.PI) / 180;
    const hl = hlIndex === i;
    spokes.push(
      <line
        key={i}
        x1={(o.cx + gap * Math.cos(a)).toFixed(1)}
        y1={(o.cy + gap * Math.sin(a)).toFixed(1)}
        x2={(o.cx + o.R * Math.cos(a)).toFixed(1)}
        y2={(o.cy + o.R * Math.sin(a)).toFixed(1)}
        style={{ stroke: hl ? 'var(--coral)' : 'var(--line)' }}
        strokeWidth={hl ? 1.5 : 1}
      />,
    );
  }

  // ring values: DM Sans at 10px (the mock-up's Nekst at fs-2 went below
  // Nekst's 10px minimum on phone)
  const tickLabels = ticks ? [2, 4, 6, 8].map((k) => (
    <text key={k} x={o.cx + 4} y={(o.cy - (k / 10) * o.R - 3).toFixed(1)} fontSize="12" style={{ fill: 'var(--placeholder)', fontFamily: 'var(--font-body)' }}>{k}</text>
  )) : null;

  // series
  const groups = M.series.map((sr, sIndex) => {
    const pts = [];
    let full = true;
    for (let i = 0; i < N; i += 1) {
      if (sr.v[i] == null) { full = false; pts.push(null); } else pts.push(pt(i, sr.v[i]));
    }
    const body = [];
    if (full) {
      const d = `${pts.map((p, j) => `${j ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('')}Z`;
      if (sr.cls === 'now') body.push(<path key="p" d={d} style={{ fill: 'var(--coral)', stroke: 'var(--coral)' }} fillOpacity=".14" strokeWidth="2" strokeLinejoin="round" />);
      else if (sr.cls === 'start') body.push(<path key="p" d={d} fill="none" style={{ stroke: 'var(--text-2)' }} strokeWidth="1.5" strokeDasharray="5 4" strokeLinejoin="round" />);
      else body.push(<path key="p" d={d} fill="none" style={{ stroke: 'var(--wol-between)' }} strokeWidth="1" strokeLinejoin="round" />);
    } else {
      // partial: draw segments between consecutive rated areas
      const stl = lineStyle(sr.cls);
      for (let i = 0; i < N; i += 1) {
        const p = pts[i];
        const q = pts[(i + 1) % N];
        if (p && q) body.push(<line key={`s${i}`} x1={p[0].toFixed(1)} y1={p[1].toFixed(1)} x2={q[0].toFixed(1)} y2={q[1].toFixed(1)} {...stl} strokeLinecap="round" />);
      }
    }
    if (sr.cls === 'now') {
      pts.forEach((p, j) => {
        if (p) body.push(<circle key={`d${j}`} cx={p[0].toFixed(1)} cy={p[1].toFixed(1)} r={hlIndex === j ? 4.5 : 3} style={{ fill: 'var(--coral)' }} />);
      });
    }
    return (
      <g key={`${sr.cls}${sIndex}`} className={`wol-ser wol-ser--${sr.cls}`} style={{ '--o': `${o.cx}px ${o.cy}px` }}>
        {body}
      </g>
    );
  });

  // targets: dashed soft-coral line through each area's target
  let targetMarks = null;
  if (M.tgt) {
    const tp = M.tgt.map((t, j) => (t == null ? null : pt(j, t)));
    const all = tp.every((p) => p);
    const marks = [];
    if (all) {
      marks.push(<path key="tgl" className="wol-tgl" d={`${tp.map((p, j) => `${j ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('')}Z`} fill="none" style={{ stroke: 'var(--text-2)' }} strokeWidth="1.25" strokeDasharray="2 3" strokeLinejoin="round" />);
    } else {
      for (let i = 0; i < N; i += 1) {
        const p1 = tp[i];
        const p2 = tp[(i + 1) % N];
        if (p1 && p2) marks.push(<line key={`t${i}`} x1={p1[0].toFixed(1)} y1={p1[1].toFixed(1)} x2={p2[0].toFixed(1)} y2={p2[1].toFixed(1)} style={{ stroke: 'var(--text-2)' }} strokeWidth="1.25" strokeDasharray="2 3" />);
      }
    }
    tp.forEach((p, j) => {
      if (p) marks.push(<circle key={`td${j}`} cx={p[0].toFixed(1)} cy={p[1].toFixed(1)} r="1.6" style={{ fill: 'var(--text-2)' }} />);
    });
    targetMarks = marks;
  }

  return (
    <svg className="wol-rw" viewBox={`0 0 ${o.w} ${o.h}`} role="img" aria-label={aria}>
      {rings}
      {spokes}
      {tickLabels}
      {groups}
      {targetMarks}
      {labels ? <WheelLabels o={o} M={M} hlIndex={hlIndex} /> : null}
    </svg>
  );
}
