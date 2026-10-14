import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { TECHNIQUES, cycleDuration, phaseAt, mixColorTokens } from '../../lib/breathing';

export function useReducedMotion() {
  const [reduced, setReduced] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ));
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e) => setReduced(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return reduced;
}

// Drives the ring/box shapes: raw milliseconds elapsed since the
// session started (never wrapped to the cycle length here - echo-ring
// lookback (area C) needs to look back past a cycle boundary, so each
// consumer wraps it with phaseAt() itself) plus the shared coral<->mint
// colour chase (mock-up's cm += ((ex?1:0)-cm)*.06 - breathing-tool.html
// and breathing-and-about.html, identical). One rAF loop shared by
// both shapes instead of each re-deriving phase bookkeeping separately
// (the old code's three separate copies of this logic, each with its
// own small timing differences, is exactly the bug the spec asked to
// fix). Deliberately a separate instance from useBreathingPhase's own
// clock+chase (see that hook's comment) - not shared state, no risk
// to the active-session text matching this exactly frame-for-frame,
// just in step in practice.
function useCycleAnimation(technique, active) {
  const [elapsedMs, setElapsedMs] = useState(0);
  const [color, setColor] = useState('var(--coral)');
  const startRef = useRef(null);
  const cmRef = useRef(0);

  useEffect(() => {
    if (!active) {
      setElapsedMs(0);
      cmRef.current = 0;
      setColor('var(--coral)');
      return undefined;
    }
    startRef.current = Date.now();
    const totalMs = cycleDuration(technique) * 1000;
    let raf;
    const tick = () => {
      const ms = Date.now() - startRef.current;
      setElapsedMs(ms);
      const { isEnding } = phaseAt(technique, ((ms % totalMs) + totalMs) % totalMs);
      cmRef.current += ((isEnding ? 1 : 0) - cmRef.current) * 0.06;
      setColor(mixColorTokens('--coral', '--mint', cmRef.current));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, technique]);

  return { elapsedMs, color };
}

// Active-session phase label, countdown, elapsed timer and the
// phase label's own colour (mock-up's #phase/#count/#timer,
// breathing-tool.html:~95/122-125 and breathing-and-about.html's
// stt()/loop() - identical formulas in both). A separate rAF loop and
// colour-chase (cm) from RingVisual/BoxVisual's own (deliberately not
// shared state - each starts its own cm at 0 when a session starts and
// ticks via requestAnimationFrame, so in practice they stay in
// lock-step; there is no shared-state risk to the existing ring/box
// code). elapsedSeconds counts up for the whole session (never wraps
// per cycle), unlike the shape's own cycle clock.
export function useBreathingPhase(technique, active) {
  const reducedMotion = useReducedMotion();
  const driven = active && !reducedMotion;
  const [elapsedMs, setElapsedMs] = useState(0);
  const [color, setColor] = useState('var(--coral)');
  const startRef = useRef(null);
  const cmRef = useRef(0);

  useEffect(() => {
    if (!driven) {
      setElapsedMs(0);
      cmRef.current = 0;
      setColor('var(--coral)');
      return undefined;
    }
    startRef.current = Date.now();
    let raf;
    const tick = () => {
      const ms = Date.now() - startRef.current;
      setElapsedMs(ms);
      const cycleMs = ms % (cycleDuration(technique) * 1000);
      const { isEnding } = phaseAt(technique, cycleMs);
      cmRef.current += ((isEnding ? 1 : 0) - cmRef.current) * 0.06;
      setColor(mixColorTokens('--coral', '--mint', cmRef.current));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [driven, technique]);

  const cycleMs = elapsedMs % (cycleDuration(technique) * 1000);
  const { phaseIndex, remainingMs } = phaseAt(technique, cycleMs);
  const phases = TECHNIQUES[technique].phases;

  return {
    phaseLabel: phases[phaseIndex].phaseLabel,
    countdown: Math.max(1, Math.ceil(remainingMs / 1000 - 0.001)),
    elapsedSeconds: Math.floor(elapsedMs / 1000),
    color,
  };
}

// Mock-up's guide-circle radius (breathing-tool.html/breathing-and-
// about.html's r(s)=56+94*s, against a 150-radius guide) - min/max
// ratio 56/150 (~.373), echoes at +9/+18/+27 beyond their own
// (time-lagged) radius, opacity .36/i.
const MAX_R = 150;
const MIN_R = 56;
const ECHO_LAG_MS = 420;

// Mock-up's main orb fill-opacity (.07) applied to whatever the
// current blended colour is, since that colour is now a resolved
// rgb(...) string (mixColorTokens), not a CSS variable reference.
function colorToFill(rgbString) {
  return rgbString.replace('rgb(', 'rgba(').replace(/\)$/, ', 0.07)');
}

function RingVisual({ technique, active, size }) {
  const reducedMotion = useReducedMotion();
  const driven = active && !reducedMotion;
  const { elapsedMs, color } = useCycleAnimation(technique, driven);
  const totalMs = cycleDuration(technique) * 1000;
  const cycleMs = elapsedMs % totalMs;
  const { s } = phaseAt(technique, cycleMs);

  const mainScale = (driven ? MIN_R + (MAX_R - MIN_R) * s : MIN_R) / MAX_R;
  const rotation = driven ? s * 45 : 0;

  // Time-lagged replays of the main ring's own state (mock-up's
  // stt(tech,cycle,tm-i*.42)) - each echo shows where the ring was
  // ~0.42s/0.84s/1.26s ago, not a copy of its current size.
  const echoScales = [1, 2, 3].map((i) => {
    if (!driven) return mainScale;
    const lagMs = Math.max(elapsedMs - i * ECHO_LAG_MS, 0) % totalMs;
    const lag = phaseAt(technique, lagMs);
    return (MIN_R + (MAX_R - MIN_R) * lag.s + i * 9) / MAX_R;
  });

  return (
    <div className="breathing-visual breathing-visual--ring" style={{ '--s': `${size}px` }} aria-hidden="true">
      <style>{`
        .breathing-visual--ring { width: var(--s); height: var(--s); position: relative; flex-shrink: 0; }
        .bv-ring-guide, .bv-ring-echo, .bv-ring-main {
          position: absolute; top: 50%; left: 50%; width: 100%; height: 100%;
          border-radius: 50%; box-sizing: border-box; transform: translate(-50%, -50%) scale(var(--scale, 1));
        }
        .bv-ring-guide { border: 1px solid var(--line); }
        .bv-ring-echo { border: 1px solid var(--ring-color); }
        .bv-ring-main { border: 1.6px solid var(--ring-color); background: var(--ring-fill); }
        .bv-ring-cross.ui-cross {
          position: absolute; top: 50%; left: 50%;
          transform: translate(-50%, -50%) rotate(var(--rotate, 0deg));
          width: calc(var(--s) * .22); height: calc(var(--s) * .22); color: var(--coral);
          transition: transform 0.15s linear;
        }
      `}</style>
      <div className="bv-ring-guide" />
      {echoScales.map((echoScale, idx) => (
        <div
          key={idx}
          className="bv-ring-echo"
          style={{ '--scale': echoScale, '--ring-color': color, opacity: 0.36 / (idx + 1) }}
        />
      ))}
      <div
        className="bv-ring-main"
        style={{
          '--scale': mainScale,
          '--ring-color': color,
          '--ring-fill': driven ? colorToFill(color) : 'rgba(255, 111, 92, 0.07)',
        }}
      />
      <span className="bv-ring-cross ui-cross" style={{ '--rotate': `${rotation}deg` }} />
    </div>
  );
}

// Mock-up's own rounded-square path (breathing-and-about.html's BOXD),
// native to a -120..120 box with 76-radius corners, each corner split
// into two 45-degree arcs at the BOXC "tick" points - kept at native
// scale and only ever stretched by the <g> transform below, so the
// dot's getPointAtLength() lookup is pixel-identical to the mock's.
const BOXD = 'M-97.74 -97.74A76 76 0 0 1 -44 -120L44 -120A76 76 0 0 1 97.74 -97.74'
  + 'A76 76 0 0 1 120 -44L120 44A76 76 0 0 1 97.74 97.74A76 76 0 0 1 44 120'
  + 'L-44 120A76 76 0 0 1 -97.74 97.74A76 76 0 0 1 -120 44L-120 -44'
  + 'A76 76 0 0 1 -97.74 -97.74Z';
const BOXC = [[-97.74, -97.74], [97.74, -97.74], [97.74, 97.74], [-97.74, 97.74]];
const BOX_TICK_ANGLES = [225, 315, 45, 135];

function BoxVisual({ technique, active, size }) {
  const reducedMotion = useReducedMotion();
  const driven = active && !reducedMotion;
  const { elapsedMs, color } = useCycleAnimation(technique, driven);
  const totalMs = cycleDuration(technique) * 1000;
  const cycleMs = elapsedMs % totalMs;
  const { s } = phaseAt(technique, cycleMs);
  // Mock's own prog = (tm % cycle) / cycle - fraction of the WHOLE
  // cycle travelled, not just the current side (the four phases are
  // equal-length here, so this lines up with the side boundaries).
  const prog = driven ? cycleMs / totalMs : 0;

  const pathRef = useRef(null);
  const dotRef = useRef(null);
  const [pathLen, setPathLen] = useState(0);

  // Native box is 240 wide (-120..120); scale it to fill 80% of `size`,
  // same proportion the guide square already used.
  const boxScale = (size * 0.8) / 240;
  const half = size / 2;
  const innerScale = 0.22 + 0.74 * s;

  // Measured once the path is in the DOM (mock's own els.len = ...
  // getTotalLength()) rather than hand-computed, so it can never drift
  // from BOXD above.
  useLayoutEffect(() => {
    if (pathRef.current) setPathLen(pathRef.current.getTotalLength());
  }, [boxScale]);

  useLayoutEffect(() => {
    const path = pathRef.current;
    const dot = dotRef.current;
    if (!path || !dot || !pathLen) return;
    const { x, y } = path.getPointAtLength(prog * pathLen);
    dot.setAttribute('cx', x);
    dot.setAttribute('cy', y);
  }, [prog, pathLen]);

  return (
    <div className="breathing-visual breathing-visual--box" style={{ '--s': `${size}px` }} aria-hidden="true">
      <style>{`
        .breathing-visual--box { width: var(--s); height: var(--s); position: relative; flex-shrink: 0; }
      `}</style>
      <svg width={size} height={size} viewBox={`${-half} ${-half} ${size} ${size}`}>
        <g transform={`scale(${boxScale})`}>
          <rect x="-120" y="-120" width="240" height="240" rx="76" ry="76" fill="none" stroke="var(--line)" strokeWidth={1.5 / boxScale} />
          <rect
            x="-120" y="-120" width="240" height="240" rx="76" ry="76"
            fill={color} fillOpacity="0.08" transform={`scale(${innerScale})`}
          />
          {BOXC.map((c, i) => {
            const angle = (BOX_TICK_ANGLES[i] * Math.PI) / 180;
            const lit = driven && prog >= i / 4;
            const x1 = c[0] - 6 * Math.cos(angle);
            const y1 = c[1] - 6 * Math.sin(angle);
            const x2 = c[0] + 6 * Math.cos(angle);
            const y2 = c[1] + 6 * Math.sin(angle);
            return (
              <line
                key={i} x1={x1} y1={y1} x2={x2} y2={y2}
                stroke={lit ? 'var(--coral)' : 'var(--btn-line)'}
                strokeWidth={2 / boxScale} strokeLinecap="round"
              />
            );
          })}
          <path
            ref={pathRef} d={BOXD} fill="none" stroke={color}
            strokeWidth={1.8 / boxScale} strokeLinecap="round"
            strokeDasharray={pathLen ? `${prog * pathLen} ${pathLen}` : undefined}
          />
          {driven && <circle ref={dotRef} r={5.5 / boxScale} fill={color} cx="-97.74" cy="-97.74" />}
        </g>
      </svg>
    </div>
  );
}

export default function BreathingVisual({ technique, active = false, size = 150 }) {
  const tech = TECHNIQUES[technique] || TECHNIQUES.sigh;
  if (tech.shape === 'box') {
    return <BoxVisual technique={tech.key} active={active} size={size} />;
  }
  return <RingVisual technique={tech.key} active={active} size={size} />;
}
