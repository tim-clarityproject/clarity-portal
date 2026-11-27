import { useEffect, useRef } from 'react';
import { useFocusModeOn } from './Frame';
import { useBreatheButton } from './useBreatheButton';
import { usePortalPreparing } from '../../lib/portalPreparing';
import './design.css';

// The floating Breathe button (Tim, 26 Nov, decisions part 12; NEXT-BREATHE.md, mock-up option D). On a phone (under
// 1024px, where the menu is closed) a 48px round button bottom right: the card colour, a 1px line, no word (its name,
// "Breathe", is read out), and the fine two-circle ring breathing from 0.7 to 1.15 over 8 seconds, still under Reduce
// motion. No coral. On a laptop the menu is always open and Breathe is its plain item above My Account, so nothing
// floats over the page (design.css hides it there). It steps aside inside a tool (focus mode), on the Breathe page
// (App.jsx), while a client's portal is being prepared, and when the person switches "Show the Breathe button" off in My Account › Settings (useBreatheButton).
//
// The ring (.ds-breathe-ring) is the same fine two circles as the Breathe tools' centre ring.
//
// placement 'fixed': bottom right of the screen (real pages).
// placement 'inline': in the flow (the design gallery), always shown.
// pageKey: the page it sits on. A click in the first moment after it
// appears, after the page changes or after a click on anything else is
// ignored, as the guided tool ignores one after a move: it is the second
// half of a double tap on a button that was in the same corner (Start
// Performance Sprint 2 closes the guided tool over it, then Breathe).
const ARRIVE_GUARD_MS = 400;

export function BreatheRing({ className = '' }) {
  return (
    <svg className={`ds-breathe-ring ${className}`.trim()} viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <circle cx="10" cy="10" r="8" />
      <circle cx="10" cy="10" r="3" />
    </svg>
  );
}

export default function FloatingOrb({ onBreathe, placement = 'fixed', pageKey }) {
  const fixed = placement === 'fixed';
  // Inside a tool (focus mode, rule 21) it steps aside with the menu, so it never sits over a tool's foot.
  const focus = useFocusModeOn();
  const [shown] = useBreatheButton();
  // A client still being prepared sees the preparing page at Breathe's address, so the button would open nothing.
  const preparing = usePortalPreparing();
  const arrivedAt = useRef(0);
  const buttonRef = useRef(null);
  useEffect(() => {
    arrivedAt.current = Date.now();
  }, [pageKey]);
  useEffect(() => {
    const elsewhere = (e) => {
      if (!buttonRef.current?.contains(e.target)) arrivedAt.current = Date.now();
    };
    document.addEventListener('click', elsewhere, true);
    return () => document.removeEventListener('click', elsewhere, true);
  }, []);
  const breathe = (e) => {
    if (Date.now() - arrivedAt.current < ARRIVE_GUARD_MS) return;
    onBreathe?.(e);
  };
  if (fixed && (focus || !shown || preparing)) return null;
  return (
    <div className={`ds-orb${fixed ? ' ds-orb--fixed' : ''}`}>
      <button ref={buttonRef} type="button" className="ds-breathe" aria-label="Breathe" onClick={breathe}>
        <BreatheRing />
      </button>
    </div>
  );
}
