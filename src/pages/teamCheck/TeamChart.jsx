import { useEffect, useId, useRef, useState } from 'react';
import { ChartTips, tipProps, useIsPhone } from '../../components/design';
import { AREA_NAME, chartDots, chartFrame, dotTip, firstName } from '../../lib/teamCheck/model';

// The Team performance check's chart (mock-up M10, version 5.6): alignment
// up, autonomy across, one small dot for each person with their first
// name. Three areas are named in place (High-performance in mint,
// Permission seekers and Chaotic in grey; the fourth has no name). A
// faint dashed ring shows where someone was at the last check, with a
// thin line to where they are now. Dots are never coral: mint in
// High-performance, an outline everywhere else. No key: every dot has the
// shared pop-up (ChartTips), and "Show as a table" gives the same answers.
//
// The measures are M10's own (chartFrame); the drawing scales with the
// column, and each dot's tap area stays 44px on screen whatever the scale.

const TAP = 22; // half of 44px

export default function TeamChart({ check, now = new Date() }) {
  const phone = useIsPhone();
  const f = chartFrame(phone);
  const dots = chartDots(check, f);
  const patternId = useId();
  const boxRef = useRef(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const read = () => {
      const w = el.getBoundingClientRect().width;
      if (w > 0) setScale(w / f.W);
    };
    read();
    const watch = new ResizeObserver(read);
    watch.observe(el);
    return () => watch.disconnect();
  }, [f.W]);
  const tap = TAP / Math.min(1, scale || 1);
  const { W, H, PL, PT, pw, ph, R, midX, midY } = f;
  const bottom = PT + ph;
  const area = phone ? 'tpc-chart-area tpc-chart-area--phone' : 'tpc-chart-area';

  return (
    <ChartTips className="tpc-chart">
      <div ref={boxRef}>
        <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label="Alignment against autonomy, one dot for each person">
          <defs>
            <pattern id={patternId} width="10" height="10" patternUnits="userSpaceOnUse" x={PL} y={PT}>
              <circle cx="5" cy="5" r="0.9" className="tpc-chart-grain" />
            </pattern>
          </defs>
          <rect x={PL} y={PT} width={pw} height={ph} fill={`url(#${patternId})`} />
          <g className="tpc-chart-lines">
            <line x1={PL} x2={PL + pw} y1={midY} y2={midY} />
            <line x1={midX} x2={midX} y1={PT} y2={bottom} />
            <line x1={PL} x2={PL + pw} y1={bottom} y2={bottom} />
          </g>
          <g aria-hidden="true">
            <text className="tpc-chart-axis" transform={`translate(${phone ? 12 : 14} ${PT + ph / 2}) rotate(-90)`} textAnchor="middle">Alignment</text>
            <text className="tpc-chart-end" x={PL - 8} y={PT + 12} textAnchor="end">High</text>
            <text className="tpc-chart-end" x={PL - 8} y={bottom} textAnchor="end">Low</text>
            <text className="tpc-chart-end" x={PL} y={bottom + 18}>Low</text>
            <text className="tpc-chart-end" x={PL + pw} y={bottom + 18} textAnchor="end">High</text>
            <text className="tpc-chart-axis" x={PL + pw / 2} y={bottom + 38} textAnchor="middle">Autonomy</text>
            <text className={`${area} tpc-chart-area--good`} data-chart-label x={PL + pw - 8} y={PT + 20} textAnchor="end">{AREA_NAME.hp}</text>
            <text className={area} data-chart-label x={PL + 8} y={PT + 20}>{AREA_NAME.ps}</text>
            <text className={area} data-chart-label x={PL + pw - 8} y={bottom - 12} textAnchor="end">{AREA_NAME.ch}</text>
          </g>
          <g aria-hidden="true">
            {dots.filter((d) => d.ring).map((d) => (
              <g key={d.person.id}>
                <circle className="tpc-chart-was" cx={d.ring.x.toFixed(1)} cy={d.ring.y.toFixed(1)} r={R} />
                {d.line && <line className="tpc-chart-moved" x1={d.line.x1.toFixed(1)} y1={d.line.y1.toFixed(1)} x2={d.line.x2.toFixed(1)} y2={d.line.y2.toFixed(1)} />}
              </g>
            ))}
          </g>
          {dots.map((d) => {
            const tip = dotTip(check, d.person, now);
            return (
              <g key={d.person.id} className="tpc-dot" {...tipProps({ value: tip.value, when: tip.when, extra: tip.extra })} aria-label={tip.label}>
                <circle className="tpc-dot-tap" cx={d.x.toFixed(1)} cy={d.y.toFixed(1)} r={tap.toFixed(1)} />
                <circle className={`tpc-dot-mark${d.good ? ' tpc-dot-mark--good' : ''}`} cx={d.x.toFixed(1)} cy={d.y.toFixed(1)} r={R} />
                <text className={`tpc-dot-name${phone ? ' tpc-dot-name--phone' : ''}`} x={(d.x + R + 6).toFixed(1)} y={(d.y + 4.5).toFixed(1)}>{firstName(d.person.name)}</text>
              </g>
            );
          })}
        </svg>
      </div>
    </ChartTips>
  );
}
