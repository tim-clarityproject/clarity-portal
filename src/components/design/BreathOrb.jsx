import { useEffect, useRef, useState } from 'react';
import { ORB_PATTERNS, breathAt, howToBreathe } from '../../lib/breathOrb';
import { useOrbStyle } from './useOrbStyle';
import { SegmentedControl } from './Controls';
import './design.css';

// The Breathe orb (breathe-orb.html, approved 29 Oct; read in full with
// its notes). One shared part for every place the orb appears: the
// floating Breathe button now, Breathe and Sleep wind down when they are
// rebuilt. Two styles, the person's choice (useOrbStyle):
//
// - Rings: the approved orb with finer lines (Tim, 29 Oct, 17:39). A
//   filled circle with two echo rings grows and shrinks, coral on the
//   in-breath and mint on the out-breath (deeper in light), with the brand
//   crosshair turning 45 degrees in the centre. Every line is a fixed 1 to
//   1.25 pixels at any size.
// - Level: a fixed round ring that fills from the bottom as you breathe in
//   and empties as you breathe out: one mint line over a soft mint tint.
//   Still during a hold.
//
// Reduced motion (the mock-up's note): nothing grows, shrinks or turns.
// The orb stays at half a breath and fades brighter and dimmer with the
// breath, while the words carry the pace.
//
// pattern: a key of ORB_PATTERNS ('rest', 'sigh', 'box', 'vagal', 'wind')
// or a list of phases. startedAt: performance.now() when the pattern
// began (orbs and words given the same one breathe together). night:
// Sleep wind down's quieter colours (M19). size: 'tool' (Breathe, 300px,
// 164px on a phone) or 'night' (Sleep wind down, 220px, 190px on a phone);
// otherwise the size its place gives it.

function usePrefersStill() {
  const [still, setStill] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  ));
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return undefined;
    const on = (e) => setStill(e.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return still;
}

// A colour token as numbers, read through the browser so any colour
// format works (the tokens differ per mode).
function rgbOf(probe) {
  const m = /rgba?\(([^)]+)\)/.exec(getComputedStyle(probe).color || '');
  if (!m) return [0, 0, 0];
  return m[1].split(',').slice(0, 3).map((v) => Number.parseFloat(v));
}

const NS = ' vector-effect="non-scaling-stroke"';
let levelIds = 0;

function drawRings(b, colour, px, fade) {
  const c = `rgb(${colour.map(Math.round).join(',')})`;
  const lw = px < 80 ? 1 : 1.25;
  let svg = `<svg viewBox="-30 -30 60 60" aria-hidden="true"><circle r="27" fill="none" stroke-width="1"${NS} style="stroke:var(--line)"/>`;
  for (let k = 2; k >= 1; k -= 1) {
    const bk = Math.max(0, b - 0.08 * k);
    svg += `<circle r="${(9 + 15 * bk + 1.6 * k).toFixed(2)}" fill="none" stroke="${c}" stroke-width=".75"${NS} stroke-opacity="${((0.36 / k) * fade).toFixed(3)}"/>`;
  }
  svg += `<circle r="${(9 + 15 * b).toFixed(2)}" fill="${c}" fill-opacity="${(0.09 * fade).toFixed(3)}" stroke="${c}" stroke-opacity="${fade.toFixed(3)}" stroke-width="${lw}"${NS}/></svg>`;
  return svg;
}

function drawLevel(s, px, fade, id) {
  const R = 90;
  const h = 0.08 + 0.84 * s;
  const y = R - 2 * R * h;
  const xw = Math.sqrt(Math.max(0, R * R - y * y));
  return `<svg viewBox="-100 -100 200 200" aria-hidden="true"><defs><clipPath id="${id}"><circle r="${R}"/></clipPath></defs>`
    + `<rect x="-100" y="${y.toFixed(2)}" width="200" height="${(100 - y).toFixed(2)}" clip-path="url(#${id})" style="fill:var(--o-tint)" fill-opacity="${fade.toFixed(3)}"/>`
    + `<circle r="${R}" fill="none" style="stroke:var(--o-ring)" stroke-width="${px < 80 ? 1 : 1.25}"${NS}/>`
    + `<path d="M${(-xw).toFixed(2)} ${y.toFixed(2)}H${xw.toFixed(2)}" style="stroke:var(--o-out)" stroke-opacity="${fade.toFixed(3)}" stroke-width="${px < 80 ? 1.25 : 1.5}"${NS} stroke-linecap="round"/></svg>`;
}

export function BreathOrb({ style = 'rings', pattern = 'rest', startedAt, night = false, size, label, className = '' }) {
  const artRef = useRef(null);
  const crossRef = useRef(null);
  const inRef = useRef(null);
  const outRef = useRef(null);
  const still = usePrefersStill();
  const [start] = useState(() => (typeof performance !== 'undefined' ? performance.now() : 0));
  const begin = startedAt ?? start;
  const phases = Array.isArray(pattern) ? pattern : (ORB_PATTERNS[pattern] || ORB_PATTERNS.rest);
  const phasesRef = useRef(phases);
  useEffect(() => { phasesRef.current = phases; }, [phases]);

  useEffect(() => {
    const art = artRef.current;
    if (!art) return undefined;
    const id = `ds-borb-${(levelIds += 1)}`;
    let colour = null;
    let last = performance.now();
    let raf = 0;
    const frame = (now) => {
      // Gone (the screen changed between a frame and the clean-up): stop.
      if (!art.isConnected || !inRef.current || !outRef.current) return;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const S = breathAt(phasesRef.current, (now - begin) / 1000);
      const px = art.offsetWidth || 44;
      // Reduced motion: still at half a breath, fading with the breath.
      const size = still ? 0.5 : S.size;
      const fade = still ? 0.42 + 0.58 * S.size : 1;
      if (style === 'level') {
        art.innerHTML = drawLevel(size, px, fade, id);
      } else {
        const goal = rgbOf(S.kind === 'out' ? outRef.current : inRef.current);
        colour = !colour || still ? goal : colour.map((v, i) => v + (goal[i] - v) * (1 - Math.exp(-dt / 0.28)));
        art.innerHTML = drawRings(size, colour, px, fade);
        if (crossRef.current) {
          crossRef.current.style.transform = `translate(-50%, -50%) rotate(${(45 * size).toFixed(1)}deg)`;
          crossRef.current.style.opacity = fade.toFixed(3);
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [style, still, begin]);

  return (
    <span
      className={`ds-borb ds-borb--${style}${night ? ' ds-borb--night' : ''}${size ? ` ds-borb--${size}` : ''} ${className}`.trim()}
      data-orb-style={style}
      role={label ? 'img' : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : 'true'}
    >
      <span ref={artRef} className="ds-borb-art" />
      {style === 'rings' && <span ref={crossRef} className="ds-borb-cross" />}
      <span ref={inRef} className="ds-borb-probe ds-borb-probe--in" />
      <span ref={outRef} className="ds-borb-probe ds-borb-probe--out" />
    </span>
  );
}

// The phase word with how to breathe under it, and the seconds left,
// beside the orb (never on top of it). Sleep wind down has no words.
export function BreathWords({ pattern = 'rest', startedAt, className = '' }) {
  const [start] = useState(() => (typeof performance !== 'undefined' ? performance.now() : 0));
  const begin = startedAt ?? start;
  const phases = Array.isArray(pattern) ? pattern : (ORB_PATTERNS[pattern] || ORB_PATTERNS.rest);
  const [now, setNow] = useState(() => breathAt(phases, 0));
  useEffect(() => {
    const tick = () => {
      const S = breathAt(phases, (performance.now() - begin) / 1000);
      setNow((old) => (old && old.index === S.index && old.secondsLeft === S.secondsLeft ? old : S));
    };
    tick();
    const t = setInterval(tick, 100);
    return () => clearInterval(t);
  }, [phases, begin]);
  if (!now) return null;
  return (
    <div className={`ds-bwords ${className}`.trim()}>
      <div className="ds-bwords-phase" aria-live="polite">
        <span className="ds-bwords-word">{now.word}</span>
        <span className="ds-bwords-how">{howToBreathe(now.kind)}</span>
      </div>
      <div className="ds-bwords-count">
        <strong>{now.secondsLeft}</strong>
        <span>{now.secondsLeft === 1 ? 'second' : 'seconds'}</span>
      </div>
    </div>
  );
}

// The Rings or Level switch (inside Breathe, once it is rebuilt).
export function OrbStyleChoice({ className = '' }) {
  const [style, setStyle] = useOrbStyle();
  return (
    <SegmentedControl
      label="Orb style"
      options={[{ value: 'rings', label: 'Rings' }, { value: 'level', label: 'Level' }]}
      value={style}
      onChange={setStyle}
      className={className}
    />
  );
}
