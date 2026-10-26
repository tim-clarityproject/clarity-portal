import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { layoutChart, PROGRESS_WORDS } from './chartLayout';
import { roundPct } from '../../lib/alignmentScore';
import { ChartTips } from '../../components/design';

// Strategic importance versus progress: SVG dot-matrix field, crosshair
// centre lines and numbered project dots. Geometry comes from
// alignmentChart.js (a port of the mock-up's chart()). Colours are tokens,
// applied with style (var() does not resolve in presentation attributes
// everywhere). Only "important and moving well" is filled, in green (the
// mode's own mint, Tim 26 Oct); every other dot is a grey outline.
const FILL = {
  mi: 'var(--good)',
  co: 'var(--text-2)',
  n: 'var(--text-2)',
};

let measureCtx = null;
function measureText(text, fontSize) {
  try {
    if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
    measureCtx.font = `${fontSize}px "DM Sans", "Helvetica Neue", Arial, sans-serif`;
    return measureCtx.measureText(text).width;
  } catch {
    return text.length * fontSize * 0.55;
  }
}

/**
 * @param {Object} props
 * @param {{n: number, text: string, importance: number, progress: number|null}[]} props.rows
 *   ranked projects (n = attention rank)
 * @param {number|null} props.highlight rank number being highlighted
 * @param {(n: number|null) => void} props.onHighlight
 * @param {(id: string) => void} [props.onOpen] a dot was clicked or Enter pressed on it
 */
export default function AlignmentChart({ rows, highlight, onHighlight, onOpen }) {
  const wrapRef = useRef(null);
  const uid = useId().replace(/:/g, '');
  const [mode, setMode] = useState('d');
  const [fontTick, setFontTick] = useState(0);
  const tipOpenAtPress = useRef(false);

  // Phone geometry when the chart's own width is narrow; redraws on resize.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const apply = (w) => setMode(w < 560 ? 'p' : 'd');
    apply(el.getBoundingClientRect().width);
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver((entries) => apply(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Label widths depend on the body font being loaded.
  useEffect(() => {
    let off = false;
    document.fonts?.ready?.then(() => { if (!off) setFontTick((t) => t + 1); });
    return () => { off = true; };
  }, []);

  const g = useMemo(
    () => layoutChart(rows, mode, measureText),
    // fontTick forces a re-measure once fonts have loaded
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, mode, fontTick],
  );

  const { W, H, L, T, pw, ph, mx, my, gap, sp, fs, D, pts, labs, xs, ys } = g;
  const dotR = D ? 1 : 0.85;
  const pat = (key) => `${uid}-${key}`;
  const on = highlight != null;

  return (
    <ChartTips>
    <div ref={wrapRef} className={`al-chart al-enter${on ? ' al-hlon' : ''}`}>
      <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label="Strategic importance versus progress">
        <defs>
          {[['b', 'var(--line)', 0.9], ['mi', 'var(--good)', 0.55]].map(([k, c, o]) => (
            <pattern
              key={k}
              id={pat(k)}
              x={(mx % sp).toFixed(2)}
              y={(my % sp).toFixed(2)}
              width={sp}
              height={sp}
              patternUnits="userSpaceOnUse"
            >
              <circle cx={sp / 2} cy={sp / 2} r={dotR} style={{ fill: c }} fillOpacity={o} />
            </pattern>
          ))}
        </defs>

        <g className="al-zone" aria-hidden="true">
          <rect x={L} y={my} width={pw} height={T + ph - my} fill={`url(#${pat('b')})`} />
          <rect x={mx} y={T} width={L + pw - mx} height={my - T} fill={`url(#${pat('mi')})`} />
          <rect x={L} y={T} width={mx - L} height={my - T} fill={`url(#${pat('b')})`} />
        </g>

        {/* centre lines with a small gap, echoing the crosshair in the mark */}
        <g className="al-xl" style={{ stroke: 'var(--btn-line)' }} strokeWidth="1" aria-hidden="true">
          <line x1={L} y1={my} x2={mx - gap} y2={my} />
          <line x1={mx + gap} y1={my} x2={L + pw} y2={my} />
          <line x1={mx} y1={T} x2={mx} y2={my - gap} />
          <line x1={mx} y1={my + gap} x2={mx} y2={T + ph} />
        </g>

        {[[100, '100%'], [50, '50%'], [0, '0%']].map(([v, t]) => (
          <text
            key={t}
            className="al-axis-display"
            x={L - (D ? 12 : 6)}
            y={ys(v)}
            textAnchor="end"
            dominantBaseline="central"
            fontSize="10"
            style={{ fill: 'var(--placeholder)' }}
          >
            {t}
          </text>
        ))}
        {[1, 2, 3, 4, 5].map((v) => (
          <text key={v} x={xs(v)} y={T + ph + 18} textAnchor="middle" fontSize={D ? 12 : 10} style={{ fill: 'var(--placeholder)' }}>
            {D ? PROGRESS_WORDS[v - 1] : v}
          </text>
        ))}
        <text className="al-axis-display" x={L + pw / 2} y={H - 3} textAnchor="middle" fontSize="10" style={{ fill: 'var(--text-2)' }}>
          PROGRESS
        </text>
        {D ? (
          <text
            className="al-axis-display"
            transform={`translate(9 ${T + ph / 2}) rotate(-90)`}
            textAnchor="middle"
            fontSize="10"
            style={{ fill: 'var(--text-2)' }}
          >
            STRATEGIC IMPORTANCE
          </text>
        ) : (
          <text className="al-axis-display" x="0" y="8" fontSize="10" style={{ fill: 'var(--text-2)' }}>
            STRATEGIC IMPORTANCE
          </text>
        )}

        {pts.map((p, i) => {
          const solid = p.q === 'mi';
          const c = FILL[p.q];
          const name = `${p.n}, ${p.text}, strategic importance ${roundPct(p.importance)}%, progress ${PROGRESS_WORDS[p.progress - 1]}`;
          return (
            <g
              key={p.id ?? p.n}
              className={`al-pt${highlight === p.n ? ' al-hl' : ''}`}
              tabIndex={0}
              role="img"
              aria-label={name}
              data-tip={JSON.stringify({
                kind: `Project ${p.n}`,
                name: p.text,
                extra: [`Strategic importance ${roundPct(p.importance)}%.`, `Progress rated ${PROGRESS_WORDS[p.progress - 1]}.`],
              })}
              onMouseEnter={() => onHighlight(p.n)}
              onMouseLeave={() => onHighlight(null)}
              onFocus={() => onHighlight(p.n)}
              onBlur={() => onHighlight(null)}
              // On a phone the first tap shows the dot's pop-up and a
              // second tap opens the project; a click opens it at once.
              onPointerDown={(e) => { tipOpenAtPress.current = e.currentTarget.hasAttribute('aria-describedby'); }}
              onClick={onOpen ? () => {
                if (window.matchMedia?.('(hover: none)').matches && !tipOpenAtPress.current) return;
                onOpen(p.id);
              } : undefined}
              onKeyDown={onOpen ? (e) => { if (e.key === 'Enter') { e.preventDefault(); onOpen(p.id); } } : undefined}
              style={{ '--d': `${250 + i * 80}ms`, cursor: onOpen ? 'pointer' : undefined }}
            >
              <circle className="al-halo" cx={p.x.toFixed(1)} cy={p.y.toFixed(1)} r={p.r + 6} style={{ fill: c }} fillOpacity={solid ? 0.16 : 0.07} />
              <circle
                className="al-core"
                cx={p.x.toFixed(1)}
                cy={p.y.toFixed(1)}
                r={p.r}
                style={{ fill: solid ? c : 'var(--bg)', stroke: c }}
                strokeWidth="1"
              />
              <text
                className="al-axis-display al-pt-n"
                x={p.x.toFixed(1)}
                y={(p.y + 0.5).toFixed(1)}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={D ? 11 : 10}
                style={{ fill: solid ? 'var(--on-good)' : 'var(--text)', letterSpacing: 0 }}
              >
                {p.n}
              </text>
            </g>
          );
        })}

        {labs.map((l, i) => (
          <text
            key={l.p.n}
            className={`al-lab${highlight === l.p.n ? ' al-hl' : ''}`}
            style={{ '--d': `${400 + i * 80}ms`, fill: 'var(--text)' }}
            x={l.x.toFixed(1)}
            y={l.y.toFixed(1)}
            textAnchor={l.a}
            dominantBaseline="central"
            fontSize={fs}
            aria-hidden="true"
          >
            {l.text}
          </text>
        ))}
      </svg>
    </div>
    </ChartTips>
  );
}
