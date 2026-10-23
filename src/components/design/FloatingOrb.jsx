import { useEffect, useId, useRef, useState } from 'react';
import useColourMode from '../../lib/colourMode/useColourMode';
import Crosshair from './Crosshair';
import { useThemeScope } from './themeScope';
import './design.css';

// The one floating button (decisions: "One floating button: a breathing
// mini orb"). A miniature of the breathing orb: it breathes slowly at
// rest (4 seconds in, 4 out, eased), coral on the in-breath and mint on
// the out-breath, with echo rings and the brand crosshair turning in the
// centre. Tapping it offers Breathe or Chat to Dr. Tim. Still with reduced
// motion. Desktop only, never on phone (hidden by design.css wherever
// there is no mouse).
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

export default function FloatingOrb({ onBreathe, onChat, placement = 'fixed' }) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const wrapRef = useRef(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const artRef = useRef(null);
  const scope = useThemeScope();
  const { mode } = useColourMode();
  useOrbDrawing(artRef, scope || mode);

  // Open: focus the first choice. Escape or a click elsewhere closes.
  useEffect(() => {
    if (!open) return undefined;
    menuRef.current?.querySelector('button')?.focus();
    const onPointer = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [open]);

  const choose = (action) => {
    setOpen(false);
    buttonRef.current?.focus();
    action?.();
  };

  return (
    <div
      ref={wrapRef}
      className={`ds-orb${placement === 'fixed' ? ' ds-orb--fixed' : ''}`}
      onKeyDown={(e) => {
        // Tab moves between the orb and its two choices; tabbing past either
        // end closes the menu and carries on through the page. Handled here
        // because Safari leaves buttons out of its own Tab order.
        if (e.key === 'Tab' && open) {
          const stops = [buttonRef.current, ...(menuRef.current?.querySelectorAll('button') || [])];
          const at = stops.indexOf(document.activeElement);
          const next = at + (e.shiftKey ? -1 : 1);
          if (at === -1 || next < 0 || next >= stops.length) {
            setOpen(false);
          } else {
            e.preventDefault();
            stops[next].focus();
          }
          return;
        }
        if (e.key === 'Escape' && open) {
          e.stopPropagation();
          setOpen(false);
          buttonRef.current?.focus();
        }
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        className="ds-orb-btn"
        aria-label="Breathe or chat to Dr. Tim"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        <span ref={artRef} className="ds-orb-art" aria-hidden="true">
          <svg viewBox="-30 -30 60 60">
            <circle r="27" fill="none" stroke="var(--line)" strokeWidth=".8" />
            <circle data-ring="2" r="9" fill="none" strokeWidth=".6" strokeOpacity=".18" />
            <circle data-ring="1" r="9" fill="none" strokeWidth=".6" strokeOpacity=".36" />
            <circle data-core="" r="9" fillOpacity=".09" strokeWidth=".9" />
          </svg>
          <Crosshair />
        </span>
      </button>
      {open && (
        <div ref={menuRef} id={menuId} className="ds-orb-menu" role="group" aria-label="Breathe or chat">
          <button type="button" className="ds-orb-item" onClick={() => choose(onBreathe)}>Breathe</button>
          <button type="button" className="ds-orb-item" onClick={() => choose(onChat)}>Chat to Dr. Tim</button>
        </div>
      )}
    </div>
  );
}
