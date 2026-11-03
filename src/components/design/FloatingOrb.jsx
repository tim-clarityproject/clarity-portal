import { useEffect, useRef } from 'react';
import { BreathOrb } from './BreathOrb';
import { useOrbStyle } from './useOrbStyle';
import './design.css';

// The one floating button (Tim, 23 Oct: Breathe only; breathe-orb.html,
// 29 Oct). On desktop only, bottom right: a 60px pill with the small
// breathing orb in the person's chosen style (Rings, the starting choice,
// or Level) and the word "Breathe"; one click opens Breathe. At rest the
// orb breathes slowly, 4 seconds in and 4 out; the 8px crosshair inside
// Rings is the one exception to the 14px minimum (decorative, aria-hidden,
// part of the approved orb). Still with reduced motion. Never on phone
// (hidden by design.css wherever there is no mouse), where Breathe is in
// the menu. Chat to the coach is in the header (ChatButton).
//
// placement 'fixed': bottom right of the screen (real pages).
// placement 'inline': in the flow (the design gallery).
// style: the gallery shows both; real pages use the person's choice.
// pageKey: the page it sits on. A click in the first moment after it
// appears, after the page changes or after a click on anything else is
// ignored, as the guided tool ignores one after a move: it is the second
// half of a double tap on a button that was in the same corner (Start
// Performance Sprint 2 closes the guided tool over it, then Breathe).
const ARRIVE_GUARD_MS = 400;
export default function FloatingOrb({ onBreathe, placement = 'fixed', style, pageKey }) {
  const [chosen] = useOrbStyle();
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
  return (
    <div className={`ds-orb${placement === 'fixed' ? ' ds-orb--fixed' : ''}`}>
      <button ref={buttonRef} type="button" className="ds-breathe" onClick={breathe}>
        <BreathOrb style={style || chosen} pattern="rest" />
        Breathe
      </button>
    </div>
  );
}
