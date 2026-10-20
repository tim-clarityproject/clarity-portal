import { average, oneDecimal } from '../../lib/wheelOfLife';
import { remap, sizeFor } from './wheelGeometry';
import { WheelLabels } from './WheelLabels';

// The sectional wheel, ported line for line from the approved mock-up's
// sectional() (wheel-of-life.html): round slices with a hole in the
// middle, ten bands per slice in a tonal coral ramp, empty bands as faint
// dots, the start of the range as a white hairline arc, the target as a
// dashed arc just outside its band (soft coral, mint once reached), a
// dial rim with ticks, and the average in the centre (or the crosshair
// when there are no labels). Animations live in wheelOfLife.css
// (.wol-enter .wol-sw .wol-sl), switched off under reduced motion.

/**
 * @param {object} props
 * @param {object[]} props.areas - the areas on the wheel, in wheel order
 * @param {Array<{ cls: 'now'|'start'|'o', scores: object }>} props.series - 'now' fills the slices, 'start' draws the hairline arcs ('o' is ignored here)
 * @param {object} [props.targets] - { key: target|null }; none drawn when absent
 * @param {object} [props.labelValues] - { key: score } shown after each label
 * @param {string} [props.highlightKey] - the area to light up
 * @param {'desktop'|'phone'|'mini'} [props.size='mini']
 * @param {boolean} [props.labels=false] - area names around the wheel, and the average in the centre
 * @param {string} [props.aria]
 */
export default function WheelSectional({
  areas, series, targets = null, labelValues = null, highlightKey = null,
  size = 'mini', labels = false, aria = 'Wheel of Life',
}) {
  const o = sizeFor(size, false);
  const M = remap(areas, series, targets, labels ? labelValues : null);
  const N = M.N;
  const STP = 360 / N;
  const hlIndex = highlightKey ? areas.findIndex((a) => a.key === highlightKey) : -1;
  let now = null;
  let start = null;
  M.series.forEach((sr) => {
    if (sr.cls === 'now') now = sr.v;
    if (sr.cls === 'start') start = sr.v;
  });
  const { R, cx, cy } = o;
  const H = R * 0.24;
  const bw = (R - H) / 10;
  const gp = R > 100 ? 1.6 : 2.2;

  function pt(deg, r) {
    const a = (deg * Math.PI) / 180;
    return [(cx + r * Math.cos(a)).toFixed(2), (cy + r * Math.sin(a)).toFixed(2)];
  }
  function ring(a1, a2, r0, r1) {
    const p1 = pt(a1, r1);
    const p2 = pt(a2, r1);
    const p3 = pt(a2, r0);
    const p4 = pt(a1, r0);
    const lg = (a2 - a1) > 180 ? 1 : 0;
    return `M${p1}A${r1.toFixed(2)} ${r1.toFixed(2)} 0 ${lg} 1 ${p2}L${p3}A${r0.toFixed(2)} ${r0.toFixed(2)} 0 ${lg} 0 ${p4}Z`;
  }
  function arc(a1, a2, r) {
    const p1 = pt(a1, r);
    const p2 = pt(a2, r);
    return `M${p1}A${r.toFixed(2)} ${r.toFixed(2)} 0 ${(a2 - a1) > 180 ? 1 : 0} 1 ${p2}`;
  }

  // outer dial: hairline rim with a tick at every slice edge, like an instrument
  const ticks = [];
  for (let i = 0; i < N; i += 1) {
    const t = pt(-90 + i * STP - STP / 2, R + 3);
    const t2 = pt(-90 + i * STP - STP / 2, R + 9);
    ticks.push(<line key={i} x1={t[0]} y1={t[1]} x2={t2[0]} y2={t2[1]} style={{ stroke: 'var(--btn-line)' }} strokeWidth="1" />);
  }

  const slices = [];
  for (let i = 0; i < N; i += 1) {
    const c = -90 + i * STP;
    const a1 = c - STP / 2 + gp;
    const a2 = c + STP / 2 - gp;
    const v = now ? now[i] : null;
    const hl = hlIndex === i;
    const parts = [];
    for (let k = 1; k <= 10; k += 1) {
      const r0 = H + (k - 1) * bw + 0.6;
      const r1 = H + k * bw - 0.6;
      if (v != null && k <= v) {
        parts.push(<path key={`b${k}`} d={ring(a1, a2, r0, r1)} style={{ fill: 'var(--coral)' }} fillOpacity={(0.32 + (0.68 * k) / v).toFixed(2)} />);
      } else {
        const m = pt(c, (r0 + r1) / 2);
        parts.push(<circle key={`b${k}`} cx={m[0]} cy={m[1]} r={R > 100 ? 1.1 : 0.9} style={{ fill: hl ? 'var(--placeholder)' : 'var(--wol-dot)' }} />);
      }
    }
    if (hl) parts.push(<path key="hl" d={ring(a1, a2, H, R)} fill="none" style={{ stroke: 'var(--coral)' }} strokeWidth="1" strokeOpacity=".6" />);
    if (start && start[i] != null && start[i] > 0) {
      const rs = H + start[i] * bw;
      parts.push(<path key="st" d={arc(a1 + 1.5, a2 - 1.5, rs)} fill="none" style={{ stroke: 'var(--text)' }} strokeWidth="1.5" strokeLinecap="round" />);
    }
    if (M.tgt && M.tgt[i] != null) {
      const rt = H + M.tgt[i] * bw + (R > 100 ? 2.5 : 2);
      const met = v != null && v >= M.tgt[i];
      parts.push(
        <path
          key="tg"
          d={arc(a1 + 0.5, a2 - 0.5, rt)}
          fill="none"
          style={{ stroke: met ? 'var(--mint)' : 'var(--coral-soft)' }}
          strokeWidth={R > 100 ? 2 : 1.6}
          strokeDasharray={R > 100 ? '2.5 2.5' : '2 2'}
        />,
      );
    }
    slices.push(
      <g key={areas[i].key} className="wol-sl" style={{ '--k': i }}>
        <title>{`${M.names[i]}${v != null ? `: ${v} of 10` : ''}`}</title>
        {parts}
      </g>,
    );
  }

  // centre: average score, set in Nekst (with labels); otherwise the crosshair
  const vals = (now || []).filter((x) => x != null);
  let centre;
  if (labels && vals.length) {
    centre = (
      <>
        <text x={cx} y={cy - 1} textAnchor="middle" style={{ fontFamily: 'var(--font-display)', fill: 'var(--text)' }} fontSize={R > 100 ? 18 : 13}>{oneDecimal(average(vals))}</text>
        <text x={cx} y={cy + (R > 100 ? 13 : 10)} textAnchor="middle" style={{ fontFamily: 'var(--font-display)', fill: 'var(--placeholder)' }} fontSize={R > 100 ? 7 : 6} letterSpacing="1.4">AVERAGE</text>
      </>
    );
  } else {
    const g = H * 0.32;
    centre = (
      <g style={{ stroke: 'var(--coral)' }} strokeWidth="1.2" strokeLinecap="round">
        <line x1={cx - g} y1={cy} x2={cx - g / 3} y2={cy} />
        <line x1={cx + g / 3} y1={cy} x2={cx + g} y2={cy} />
        <line x1={cx} y1={cy - g} x2={cx} y2={cy - g / 3} />
        <line x1={cx} y1={cy + g / 3} x2={cx} y2={cy + g} />
      </g>
    );
  }

  return (
    <svg className="wol-sw" viewBox={`0 0 ${o.w} ${o.h}`} role="img" aria-label={aria}>
      <circle cx={cx} cy={cy} r={(R + 6).toFixed(1)} fill="none" style={{ stroke: 'var(--line)' }} strokeWidth="1" />
      {ticks}
      {slices}
      <circle cx={cx} cy={cy} r={(H - 4).toFixed(1)} style={{ fill: 'var(--bg)', stroke: 'var(--line)' }} strokeWidth="1" />
      {centre}
      {labels ? <WheelLabels o={o} M={M} hlIndex={hlIndex} extra={8} /> : null}
    </svg>
  );
}
