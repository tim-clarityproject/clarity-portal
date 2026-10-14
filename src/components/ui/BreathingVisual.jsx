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

// The session dial's grow-to-fit size (breathe-redesign.html's own
// setup(): D = clamp(200, min(hostW-24, hostH-pt-stackH-28, 560))).
// `hostRef` is the full available area (the session overlay itself),
// `stackRef` the phase/count/timer/Done stack below the dial, `pt` any
// reserved top padding (the quick-open pop-up's floating header).
// Recalculates on resize via ResizeObserver, exactly as specified.
export function useDialSize(hostRef, stackRef, pt, active) {
  const [size, setSize] = useState(200);
  useLayoutEffect(() => {
    if (!active) return undefined;
    const host = hostRef.current;
    const stack = stackRef.current;
    if (!host || !stack) return undefined;
    const recalc = () => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      const d = Math.max(200, Math.min(w - 24, h - pt - stack.offsetHeight - 28, 560));
      setSize(Math.round(d));
    };
    recalc();
    const ro = new ResizeObserver(recalc);
    ro.observe(host);
    ro.observe(stack);
    return () => ro.disconnect();
  }, [active, hostRef, stackRef, pt]);
  return size;
}

// The engine clock (breathe-redesign.html's own engine()/frame()): runs
// for as long as `active` is true, full stop. Reduced motion does NOT
// stop this - the mock only turns off the crosshair rotation and the
// echo time-lag under reduced motion (rule 10 lists crosshair rotation
// specifically as something that switches off; the breathing size/
// colour itself keeps going, exactly as the mock's own REDUCE branches
// show - they never gate the rAF loop itself, only `mk`'s transform and
// which `s` the echoes read). cmRef/dirRef persist across frames so a
// hold phase (dir:-1) keeps the colour heading wherever the breath
// before it was going, rather than snapping back to neutral.
function useCycleAnimation(technique, active) {
  const [elapsedMs, setElapsedMs] = useState(0);
  const [color, setColor] = useState('var(--coral)');
  const startRef = useRef(null);
  const cmRef = useRef(0);
  const dirRef = useRef(0);

  useEffect(() => {
    if (!active) {
      setElapsedMs(0);
      cmRef.current = 0;
      dirRef.current = 0;
      setColor('var(--coral)');
      return undefined;
    }
    startRef.current = Date.now();
    const totalMs = cycleDuration(technique) * 1000;
    let raf;
    const tick = () => {
      const ms = Date.now() - startRef.current;
      setElapsedMs(ms);
      const { dir } = phaseAt(technique, ((ms % totalMs) + totalMs) % totalMs);
      if (dir >= 0) dirRef.current = dir;
      cmRef.current += (dirRef.current - cmRef.current) * 0.06;
      setColor(mixColorTokens('--coral', '--mint', cmRef.current));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, technique]);

  return { elapsedMs, color };
}

// Active-session phase label, countdown, elapsed timer and the phase
// label's own colour - a separate rAF loop/colour-chase from
// useCycleAnimation's own (each starts its own cm/dir at 0 when a
// session starts and ticks via requestAnimationFrame, so in practice
// they stay in lock-step; there is no shared-state risk to the ring/
// box code). elapsedSeconds counts up for the whole session (never
// wraps per cycle), unlike the shape's own cycle clock.
export function useBreathingPhase(technique, active) {
  const [elapsedMs, setElapsedMs] = useState(0);
  const [color, setColor] = useState('var(--coral)');
  const startRef = useRef(null);
  const cmRef = useRef(0);
  const dirRef = useRef(0);

  useEffect(() => {
    if (!active) {
      setElapsedMs(0);
      cmRef.current = 0;
      dirRef.current = 0;
      setColor('var(--coral)');
      return undefined;
    }
    startRef.current = Date.now();
    let raf;
    const tick = () => {
      const ms = Date.now() - startRef.current;
      setElapsedMs(ms);
      const cycleMs = ms % (cycleDuration(technique) * 1000);
      const { dir } = phaseAt(technique, cycleMs);
      if (dir >= 0) dirRef.current = dir;
      cmRef.current += (dirRef.current - cmRef.current) * 0.06;
      setColor(mixColorTokens('--coral', '--mint', cmRef.current));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, technique]);

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

// Mock-up's fixed 360-unit drawing frame (breathe-redesign.html:
// viewBox="-180 -180 360 360") - every coordinate below is a literal
// number straight out of the mock, not scaled by JS; the <svg>'s own
// width/height (the `size` prop, in real pixels) does all the scaling,
// so the frame "scales cleanly to any size" exactly as specified.
const FRAME = '-180 -180 360 360';

function ringRadius(s) {
  return 56 + 94 * s;
}

function RingVisual({ technique, active, size }) {
  const reducedMotion = useReducedMotion();
  const { elapsedMs, color } = useCycleAnimation(technique, active);
  const totalMs = cycleDuration(technique) * 1000;
  const cycleMs = elapsedMs % totalMs;
  const { s } = phaseAt(technique, cycleMs);

  const mainR = active ? ringRadius(s) : ringRadius(0);
  const rotation = active && !reducedMotion ? s * 45 : 0;

  // Time-lagged replays of the main ring's own state (mock's
  // stt(tech,cycle,tm-i*.42)); under reduced motion the echoes just
  // mirror the current s instead of lagging, per the mock's own REDUCE
  // branch in frame().
  const echoRadii = [1, 2, 3].map((i) => {
    if (!active) return mainR;
    const sAt = reducedMotion ? s : phaseAt(technique, ((elapsedMs - i * 420) % totalMs + totalMs) % totalMs).s;
    return ringRadius(sAt) + i * 9;
  });

  return (
    <div className="breathing-visual breathing-visual--ring" style={{ width: size, height: size }} aria-hidden="true">
      <style>{`
        .breathing-visual--ring svg { display: block; overflow: visible; }
        .bv-mark {
          position: absolute; top: 50%; left: 50%;
          transform: translate(-50%, -50%) rotate(var(--rotate, 0deg));
          width: 12%; height: 12%; color: var(--text);
          transition: transform 0.15s linear;
        }
        .breathing-visual--ring { position: relative; flex-shrink: 0; }
      `}</style>
      <svg width={size} height={size} viewBox={FRAME}>
        <circle r="150" fill="none" stroke="var(--line)" strokeWidth="1" />
        {echoRadii.map((r, idx) => (
          <circle key={idx} r={r} fill="none" stroke={color} strokeOpacity={0.36 / (idx + 1)} strokeWidth="1" />
        ))}
        <circle r={mainR} fill={color} fillOpacity="0.07" stroke={color} strokeWidth="1.6" />
      </svg>
      <span className="bv-mark ui-cross" style={{ '--rotate': `${rotation}deg` }} />
    </div>
  );
}

function BoxVisual({ technique, active, size }) {
  const reducedMotion = useReducedMotion();
  const { elapsedMs, color } = useCycleAnimation(technique, active);
  const totalMs = cycleDuration(technique) * 1000;
  const cycleMs = elapsedMs % totalMs;
  const { s } = phaseAt(technique, cycleMs);
  const prog = active ? cycleMs / totalMs : 0;
  const rotation = active && !reducedMotion ? s * 45 : 0;
  const innerScale = 0.22 + 0.74 * (active ? s : 0);

  // The progress outline is the guide rect itself (mock's own
  // approach - getTotalLength()/getPointAtLength() work directly on an
  // SVG basic shape), not a hand-authored path string.
  const progRef = useRef(null);
  const dotRef = useRef(null);
  const [pathLen, setPathLen] = useState(0);

  useLayoutEffect(() => {
    if (progRef.current) setPathLen(progRef.current.getTotalLength());
  }, []);

  useLayoutEffect(() => {
    const path = progRef.current;
    const dot = dotRef.current;
    if (!path || !dot || !pathLen) return;
    const { x, y } = path.getPointAtLength(prog * pathLen);
    dot.setAttribute('cx', x);
    dot.setAttribute('cy', y);
  }, [prog, pathLen]);

  return (
    <div className="breathing-visual breathing-visual--box" style={{ width: size, height: size }} aria-hidden="true">
      <style>{`
        .breathing-visual--box svg { display: block; overflow: visible; }
        .bv-mark {
          position: absolute; top: 50%; left: 50%;
          transform: translate(-50%, -50%) rotate(var(--rotate, 0deg));
          width: 12%; height: 12%; color: var(--text);
          transition: transform 0.15s linear;
        }
        .breathing-visual--box { position: relative; flex-shrink: 0; }
      `}</style>
      <svg width={size} height={size} viewBox={FRAME}>
        <rect x="-120" y="-120" width="240" height="240" rx="76" fill="none" stroke="var(--line)" strokeWidth="1" />
        <rect
          x="-120" y="-120" width="240" height="240" rx="76"
          fill={color} fillOpacity="0.08" transform={`scale(${innerScale})`}
        />
        <rect
          ref={progRef} x="-120" y="-120" width="240" height="240" rx="76"
          fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round"
          strokeDasharray={pathLen ? `${prog * pathLen} ${pathLen}` : undefined}
        />
        {active && <circle ref={dotRef} r="5.5" fill={color} cx="-120" cy="0" />}
      </svg>
      <span className="bv-mark ui-cross" style={{ '--rotate': `${rotation}deg` }} />
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
