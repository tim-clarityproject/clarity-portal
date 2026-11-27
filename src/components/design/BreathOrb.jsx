import { useEffect, useRef, useState } from 'react';
import { ORB_PATTERNS, ORB_STILL_SIZE, breathAt, howToBreathe, orbSvg } from '../../lib/breathOrb';
import { useOrbStyle } from './useOrbStyle';
import { SegmentedControl } from './Controls';
import './design.css';

let clipIds = 0;

// The Breathe orb in the 25 Nov style (Tim, 26 Nov, decisions part 12; NEXT-BREATHE-TOOLS.md point 3, the approved
// tools mock-up). One shared part for Breathe and Sleep wind down (and the design gallery). Thin lines only: 1.25px in
// the text colour (white in dark), no fill colour, no coral and no mint (the coral and mint orb ended with this round).
//
// - Rings: a faint outer track (1px, the line colour), a ring that grows from small to nearly the track on the
//   in-breath and back on the out-breath, and a small fixed centre ring (the Breathe button's ring).
// - Level: an outline that fills from the bottom with the soft surface grey on the in-breath, with a fine level line
//   at the top of the fill.
// - shape 'square' (Box breathing only): every part a rounded square, the track, the growing square, the centre square
//   and Level's outline. No travelling dot.
//
// Every phase eases on a cosine curve (breathAt). Reduced motion: the orb holds at half a breath (the mock-up's .55)
// and its moving line fades brighter and dimmer with each breath; the words and the count carry on.
//
// pattern: a key of ORB_PATTERNS ('sigh', 'box', 'vagal', 'wind', 'rest') or a list of phases. startedAt:
// performance.now() when the pattern began (an orb and its words given the same one breathe together). night: Sleep
// wind down's quieter colours (the page's .ds-night tokens do the dimming; the class is kept for the gallery). size:
// 'tool' (280px, 240px on a phone; Sleep wind down's 'night' is the same orb). label: the image's name for screen
// readers.

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

export function BreathOrb({ style = 'rings', shape, pattern = 'rest', startedAt, night = false, size, label, className = '' }) {
  const artRef = useRef(null);
  const still = usePrefersStill();
  const [start] = useState(() => (typeof performance !== 'undefined' ? performance.now() : 0));
  const begin = startedAt ?? start;
  const phases = Array.isArray(pattern) ? pattern : (ORB_PATTERNS[pattern] || ORB_PATTERNS.rest);
  const phasesRef = useRef(phases);
  useEffect(() => { phasesRef.current = phases; }, [phases]);
  // Box breathing draws squares (point 3); everything else is round.
  const form = shape || (pattern === 'box' ? 'square' : 'round');

  useEffect(() => {
    const art = artRef.current;
    if (!art) return undefined;
    const id = `ds-borb-${(clipIds += 1)}`;
    let raf = 0;
    const frame = (now) => {
      // Gone (the screen changed between a frame and the clean-up): stop.
      if (!art.isConnected) return;
      const S = breathAt(phasesRef.current, (now - begin) / 1000);
      // Reduced motion: still at half a breath, its line fading with the breath.
      const s = still ? ORB_STILL_SIZE : S.size;
      const fade = still ? 0.35 + 0.65 * S.size : 1;
      art.innerHTML = orbSvg({ style, shape: form, s, fade, id });
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [style, form, still, begin]);

  return (
    <span
      className={`ds-borb ds-borb--${style} ds-borb--${form}${night ? ' ds-borb--night' : ''}${size ? ` ds-borb--${size}` : ''} ${className}`.trim()}
      data-orb-style={style}
      data-orb-shape={form}
      data-breathe-orb=""
      role={label ? 'img' : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : 'true'}
    >
      <span ref={artRef} className="ds-borb-art" />
    </span>
  );
}

/**
 * The words beside the orb (under it on a phone, never on top): the phase (20px), how to breathe (13px grey; nothing
 * during a hold, the line keeping its height), the seconds left (24px light, "seconds" 16px grey), then the exercise's
 * name (13px grey). The phase word is announced politely when it changes; the count is not read out each second.
 */
export function BreathWords({ pattern = 'rest', startedAt, name, className = '' }) {
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
    <div className={`ds-bwords ${className}`.trim()} data-breathe-words="">
      <div className="ds-bwords-word" aria-live="polite">{now.word}</div>
      <div className="ds-bwords-how">{howToBreathe(now.kind)}</div>
      <div className="ds-bwords-count" aria-hidden="true">
        <strong>{now.secondsLeft}</strong>
        <span>{now.secondsLeft === 1 ? 'second' : 'seconds'}</span>
      </div>
      {name && <div className="ds-bwords-name">{name}</div>}
    </div>
  );
}

// The Rings or Level switch (the design gallery; Breathe's own choose screen draws its row itself).
export function OrbStyleChoice({ className = '' }) {
  const [style, setStyle] = useOrbStyle();
  return (
    <SegmentedControl
      label="Orb"
      options={[{ value: 'rings', label: 'Rings' }, { value: 'level', label: 'Level' }]}
      value={style}
      onChange={setStyle}
      className={className}
    />
  );
}
