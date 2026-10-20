// "Over time" in the Area by area table, ported line for line from the
// approved mock-up's spark() (wheel-of-life.html): one small bar per
// check-in in the range on a 0 to 10 scale, the latest in coral, earlier
// ones in grey, each with its score above it (when the bars are wide
// enough). A check-in with no score for the area shows a tiny dot.

/**
 * @param {object} props
 * @param {Array<number|null>} props.vals - the area's score in each check-in in the range, oldest first
 * @param {number} props.w - the room available (the mock-up: 140 on desktop, 200 on phone)
 */
export default function WheelSpark({ vals, w }) {
  const n = vals.length;
  const top = 14;
  const h = top + 38;
  const gap = 5;
  const bw = Math.max(4, Math.min(16, (w - (n - 1) * gap) / n));
  const tw = n * bw + (n - 1) * gap;
  const base = h - 1;
  const sc = h - top - 2;
  const lab = bw >= 9;
  let lastI = -1;
  vals.forEach((v, k) => { if (v != null) lastI = k; });

  return (
    <svg className="wol-hb2" width={tw.toFixed(0)} height={h} viewBox={`0 0 ${tw.toFixed(1)} ${h}`} aria-hidden="true">
      <line x1="0" y1={base} x2={tw.toFixed(1)} y2={base} style={{ stroke: 'var(--line)' }} strokeWidth="1" />
      {vals.map((v, k) => {
        const x = k * (bw + gap);
        if (v == null) {
          return <circle key={k} cx={(x + bw / 2).toFixed(1)} cy={base - 2} r="1.2" style={{ fill: 'var(--wol-between)' }} />;
        }
        const bh = Math.max(1.5, (v / 10) * sc);
        const last = k === lastI;
        const colour = last ? 'var(--coral)' : 'var(--text-2)';
        return (
          <g key={k}>
            <rect x={x.toFixed(1)} y={(base - bh).toFixed(1)} width={bw.toFixed(1)} height={bh.toFixed(1)} rx="1.5" style={{ fill: colour }} fillOpacity={last ? 1 : 0.32} />
            {lab ? (
              <text
                x={(x + bw / 2).toFixed(1)}
                y={(base - bh - 3).toFixed(1)}
                textAnchor="middle"
                fontSize="10"
                paintOrder="stroke"
                strokeWidth="3"
                style={{ fontFamily: 'var(--font-body)', stroke: 'var(--surface)', fill: colour }}
              >
                {v}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}
