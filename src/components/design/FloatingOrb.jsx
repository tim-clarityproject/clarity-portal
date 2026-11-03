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
export default function FloatingOrb({ onBreathe, placement = 'fixed', style }) {
  const [chosen] = useOrbStyle();
  return (
    <div className={`ds-orb${placement === 'fixed' ? ' ds-orb--fixed' : ''}`}>
      <button type="button" className="ds-breathe" onClick={onBreathe}>
        <BreathOrb style={style || chosen} pattern="rest" />
        Breathe
      </button>
    </div>
  );
}
