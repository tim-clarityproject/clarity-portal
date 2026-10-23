import { useEffect, useRef } from 'react';
import useColourMode from '../../lib/colourMode/useColourMode';
import Crosshair from './Crosshair';
import { useThemeScope } from './themeScope';
import './design.css';

// The one floating button (Tim, 23 Oct: option 3, Breathe only). On
// desktop only, bottom right: the small breathing orb with the word
// "Breathe" beside it; one click opens Breathe. The orb is a miniature of
// the Breathe page's: it breathes slowly at rest (4 seconds in, 4 out,
// eased), coral on the in-breath and mint on the out-breath (deeper in
// light mode), with echo rings and the brand crosshair turning in the
// centre (8px: the one exception to the 14px minimum, as it is decorative,
// aria-hidden and part of the approved orb). Still with reduced motion. Never on phone (hidden by design.css
// wherever there is no mouse), where Breathe is in the menu. Chat to the
// coach is in the header (ChatButton).
//
// placement 'fixed': bottom right of the screen (real pages).
// placement 'inline': in the flow (the design gallery).

const BREATH_MS = 8000;
const FALLBACK_IN = [255, 111, 92];
const FALLBACK_OUT = [95, 239, 187];

function tokenRgb(el, name, fallback) {
  const hex = getComputedStyle(el).getPropertyValue(name).trim();
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return fallback;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function useOrbDrawing(artRef, mode) {
  useEffect(() => {
    const art = artRef.current;
    if (!art) return undefined;
    const rings = [...art.querySelectorAll('[data-ring]')];
    const core = art.querySelector('[data-core]');
    const cross = art.querySelector('.ds-cross');
    // Deeper coral and green in light mode (--orb-in, --orb-out).
    const inColour = tokenRgb(art, '--orb-in', FALLBACK_IN);
    const outColour = tokenRgb(art, '--orb-out', FALLBACK_OUT);
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let colour = inColour.slice();
    let raf = 0;
    const start = performance.now();

    const draw = (now) => {
      const still = motion.matches;
      // Same curve as the mock-up: eased in for 4s, eased out for 4s.
      const t = still ? 2000 : (now - start) % BREATH_MS;
      const half = BREATH_MS / 2;
      const inBreath = t < half;
      const p = inBreath ? t / half : (t - half) / half;
      const eased = (1 - Math.cos(Math.PI * p)) / 2;
      const b = inBreath ? eased : 1 - eased;
      const goal = inBreath ? inColour : outColour;
      colour = colour.map((v, i) => v + (goal[i] - v) * (still ? 1 : 0.06));
      const rgb = `rgb(${colour.map(Math.round).join(',')})`;

      rings.forEach((ring) => {
        const k = Number(ring.dataset.ring);
        const bk = Math.max(0, b - 0.08 * k);
        ring.setAttribute('r', (9 + 15 * bk + 1.6 * k).toFixed(2));
        ring.setAttribute('stroke', rgb);
      });
      core.setAttribute('r', (9 + 15 * b).toFixed(2));
      core.setAttribute('fill', rgb);
      core.setAttribute('stroke', rgb);
      cross.style.transform = `rotate(${(45 * b).toFixed(1)}deg)`;

      if (!still) raf = requestAnimationFrame(draw);
    };

    const restart = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(draw);
    };
    restart();
    motion.addEventListener?.('change', restart);
    return () => {
      cancelAnimationFrame(raf);
      motion.removeEventListener?.('change', restart);
    };
  }, [artRef, mode]);
}

export default function FloatingOrb({ onBreathe, placement = 'fixed' }) {
  const artRef = useRef(null);
  const scope = useThemeScope();
  const { mode } = useColourMode();
  useOrbDrawing(artRef, scope || mode);

  return (
    <div className={`ds-orb${placement === 'fixed' ? ' ds-orb--fixed' : ''}`}>
      <button type="button" className="ds-breathe" onClick={onBreathe}>
        <span ref={artRef} className="ds-orb-art" aria-hidden="true">
          <svg viewBox="-30 -30 60 60">
            <circle r="27" fill="none" stroke="var(--line)" strokeWidth=".8" />
            <circle data-ring="2" r="9" fill="none" strokeWidth=".6" strokeOpacity=".18" />
            <circle data-ring="1" r="9" fill="none" strokeWidth=".6" strokeOpacity=".36" />
            <circle data-core="" r="9" fillOpacity=".09" strokeWidth=".9" />
          </svg>
          <Crosshair />
        </span>
        Breathe
      </button>
    </div>
  );
}
