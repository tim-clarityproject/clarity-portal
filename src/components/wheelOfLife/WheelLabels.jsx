import { wrapLabel } from '../../lib/wheelOfLife';

// The labels around the wheel, shared by WheelSectional and WheelRadar
// (the mock-up's svgLab and its label loop, line for line).

/**
 * One area name around the wheel, on one to three lines, with the latest
 * score after the last line in coral (the mock-up's svgLab, line for line;
 * the score is never below 12px, the portal's smallest text - the
 * mock-up's fs-1 gave 9px on phone).
 */
export function WheelLabel({ x, y, anchor, pos, lines, fs, fill, val }) {
  const lh = 1.15;
  const n = lines.length;
  const d0 = pos === 'top' ? -(n - 1) * lh : (pos === 'bot' ? 0.75 : 0.35 - ((n - 1) * lh) / 2);
  return (
    <text x={x} y={y} textAnchor={anchor} fontSize={fs} style={{ fill }}>
      {lines.map((l, k) => (
        <tspan key={k} x={x} dy={`${(k ? lh : d0).toFixed(3)}em`}>
          {l}
          {k === n - 1 && val != null ? (
            <>
              {' '}
              <tspan style={{ fill: 'var(--coral)', fontFamily: 'var(--font-display)' }} fontSize={Math.max(12, fs - 1)}>{val}</tspan>
            </>
          ) : null}
        </tspan>
      ))}
    </text>
  );
}

/**
 * The labels around a wheel, one per area. `extra` is added to the label
 * radius (the sectional adds 8, beyond its rim).
 */
export function WheelLabels({ o, M, hlIndex, extra = 0 }) {
  const STP = 360 / M.N;
  const out = [];
  for (let i = 0; i < M.N; i += 1) {
    const a = ((-90 + i * STP) * Math.PI) / 180;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    const lr = o.R + o.lg + extra;
    const x = o.cx + lr * c;
    const y = o.cy + lr * sn;
    const anchor = c > 0.25 ? 'start' : (c < -0.25 ? 'end' : 'middle');
    const pos = sn > 0.5 ? 'bot' : (sn < -0.5 ? 'top' : 'mid');
    out.push(
      <WheelLabel
        key={i}
        x={x.toFixed(1)}
        y={y.toFixed(1)}
        anchor={anchor}
        pos={pos}
        lines={wrapLabel(M.names[i], o.wrap || 40)}
        fs={o.fs}
        fill={hlIndex === i ? 'var(--coral)' : 'var(--wol-label)'}
        val={M.labVals ? M.labVals[i] : null}
      />,
    );
  }
  return out;
}
