import { useEffect, useRef, useState } from 'react';
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

// Drives a single number - milliseconds elapsed into the current cycle
// - off which every visual (ring scale/colour/rotation, box dot/ticks)
// is derived. One rAF loop shared by both shapes instead of each
// re-deriving phase/countdown bookkeeping separately (the old code's
// three separate copies of this logic, each with its own small
// timing differences, is exactly the bug the spec asked to fix).
function useCycleClock(technique, active) {
  const [elapsedMs, setElapsedMs] = useState(0);
  const startRef = useRef(null);

  useEffect(() => {
    if (!active) {
      setElapsedMs(0);
      return undefined;
    }
    startRef.current = Date.now();
    const totalMs = cycleDuration(technique) * 1000;
    let raf;
    const tick = () => {
      setElapsedMs((Date.now() - startRef.current) % totalMs);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, technique]);

  return elapsedMs;
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

function RingVisual({ technique, active, size }) {
  const reducedMotion = useReducedMotion();
  const driven = active && !reducedMotion;
  const elapsedMs = useCycleClock(technique, driven);
  const phases = TECHNIQUES[technique].phases;
  const coralTotal = phases.filter((p) => p.color === 'coral').reduce((s, p) => s + p.seconds * 1000, 0);
  const mintTotal = phases.filter((p) => p.color === 'mint').reduce((s, p) => s + p.seconds * 1000, 0);

  let frac = 0;
  let color = 'coral';
  if (driven) {
    if (elapsedMs < coralTotal) {
      frac = elapsedMs / coralTotal;
      color = 'coral';
    } else {
      frac = 1 - (elapsedMs - coralTotal) / mintTotal;
      color = 'mint';
    }
  }

  const MIN_SCALE = 0.62;
  const MAX_SCALE = 1;
  const scale = MIN_SCALE + frac * (MAX_SCALE - MIN_SCALE);
  const rotation = frac * 45;

  return (
    <div className="breathing-visual breathing-visual--ring" style={{ '--s': `${size}px` }} aria-hidden="true">
      <style>{`
        .breathing-visual--ring { width: var(--s); height: var(--s); position: relative; flex-shrink: 0; }
        .bv-ring-guide, .bv-ring-echo, .bv-ring-main {
          position: absolute; top: 50%; left: 50%; border-radius: 50%;
          box-sizing: border-box; transform: translate(-50%, -50%) scale(var(--scale, 1));
        }
        .bv-ring-guide { width: 100%; height: 100%; border: 1px solid var(--line); transform: translate(-50%, -50%); }
        .bv-ring-echo { border: 1px solid var(--ring-color); transition: border-color 0.4s linear; }
        .bv-ring-echo--1 { width: 148%; height: 148%; opacity: 0.1; }
        .bv-ring-echo--2 { width: 130%; height: 130%; opacity: 0.16; }
        .bv-ring-echo--3 { width: 114%; height: 114%; opacity: 0.3; }
        .bv-ring-main {
          width: 100%; height: 100%; border: 1.6px solid var(--ring-color);
          background: var(--ring-fill); transition: border-color 0.4s linear, background-color 0.4s linear;
        }
        .bv-ring-cross.ui-cross {
          position: absolute; top: 50%; left: 50%;
          transform: translate(-50%, -50%) rotate(var(--rotate, 0deg));
          width: calc(var(--s) * .22); height: calc(var(--s) * .22); color: var(--coral);
          transition: transform 0.15s linear;
        }
      `}</style>
      <div className="bv-ring-guide" />
      <div className="bv-ring-echo bv-ring-echo--1" style={{ '--scale': scale, '--ring-color': `var(--${color})` }} />
      <div className="bv-ring-echo bv-ring-echo--2" style={{ '--scale': scale, '--ring-color': `var(--${color})` }} />
      <div className="bv-ring-echo bv-ring-echo--3" style={{ '--scale': scale, '--ring-color': `var(--${color})` }} />
      <div
        className="bv-ring-main"
        style={{
          '--scale': scale,
          '--ring-color': `var(--${color})`,
          '--ring-fill': color === 'coral' ? 'rgba(255, 111, 92, 0.08)' : 'rgba(95, 239, 187, 0.08)',
        }}
      />
      <span className="bv-ring-cross ui-cross" style={{ '--rotate': `${rotation}deg` }} />
    </div>
  );
}

function cornerPoint(cx, cy, r, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

// Clockwise from top-left: TL(225deg) -> TR(315deg) -> BR(45deg) ->
// BL(135deg) -> back to TL (spec section 7). Each corner point is the
// middle of that corner's rounded arc, not the sharp virtual corner.
function boxCorners(size, radius) {
  return [
    cornerPoint(radius, radius, radius, 225),
    cornerPoint(size - radius, radius, radius, 315),
    cornerPoint(size - radius, size - radius, radius, 45),
    cornerPoint(radius, size - radius, radius, 135),
  ];
}

function BoxVisual({ technique, active, size }) {
  const reducedMotion = useReducedMotion();
  const driven = active && !reducedMotion;
  const elapsedMs = useCycleClock(technique, driven);
  const phases = TECHNIQUES[technique].phases;

  const boxSize = size * 0.8;
  const radius = boxSize * 0.18;
  const pad = (size - boxSize) / 2;
  const corners = boxCorners(boxSize, radius).map((c) => ({ x: c.x + pad, y: c.y + pad }));

  let sideIndex = 0;
  let sideProgress = 0;
  if (driven) {
    const perPhaseMs = phases[0].seconds * 1000;
    sideIndex = Math.min(3, Math.floor(elapsedMs / perPhaseMs));
    sideProgress = (elapsedMs % perPhaseMs) / perPhaseMs;
  }

  const from = corners[sideIndex];
  const to = corners[(sideIndex + 1) % 4];
  const dot = driven ? { x: from.x + (to.x - from.x) * sideProgress, y: from.y + (to.y - from.y) * sideProgress } : corners[0];
  const currentColor = driven ? phases[sideIndex].color : 'coral';

  const tickAngles = [225, 315, 45, 135];

  return (
    <div className="breathing-visual breathing-visual--box" style={{ '--s': `${size}px` }} aria-hidden="true">
      <style>{`
        .breathing-visual--box { width: var(--s); height: var(--s); position: relative; flex-shrink: 0; }
        .bv-box-dot { transition: fill 0.3s linear; }
        .bv-box-tick { transition: stroke 0.3s linear; }
      `}</style>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <rect x={pad} y={pad} width={boxSize} height={boxSize} rx={radius} ry={radius} fill="none" stroke="var(--line)" strokeWidth="1.5" />
        {corners.map((c, i) => {
          const angle = (tickAngles[i] * Math.PI) / 180;
          const lit = driven && i <= sideIndex;
          const x1 = c.x - 6 * Math.cos(angle);
          const y1 = c.y - 6 * Math.sin(angle);
          const x2 = c.x + 6 * Math.cos(angle);
          const y2 = c.y + 6 * Math.sin(angle);
          return (
            <line key={i} className="bv-box-tick" x1={x1} y1={y1} x2={x2} y2={y2} stroke={lit ? 'var(--coral)' : 'var(--line)'} strokeWidth="2" strokeLinecap="round" />
          );
        })}
        {driven && (
          <circle className="bv-box-dot" cx={dot.x} cy={dot.y} r="5" fill={`var(--${currentColor})`} />
        )}
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
