import { useLayoutEffect, useRef } from 'react';
import PhoneActionBar from '../../components/ui/PhoneActionBar';
import { BackLink, DiscardLink } from '../../components/ui/DiscardLink';

// The footer action bar of the mock-up (Back and Discard on the left, the
// main button on the right), built from the portal's shared parts:
// BackLink and DiscardLink, and on phone the shared PhoneActionBar, fixed
// directly above the tab bar. On desktop the same row is pinned to the
// bottom of the window, like the Breathe page's bar (the floating buttons
// are hidden on these routes, as on /breathe). Its height is written to
// --wol-bar-height so the page and the toast clear it.
function Row({ onBack, onDiscard, primary }) {
  return (
    <div className="wol-ft-box">
      <div className="wol-ft-in">
        <div className="wol-ft-left">
          <BackLink onClick={onBack} />
          {onDiscard ? <DiscardLink onClick={onDiscard} aria-label="Discard" /> : null}
        </div>
        <button
          type="button"
          className="ui-btn-primary"
          onClick={primary.onClick}
          disabled={primary.disabled || primary.busy}
          aria-busy={primary.busy ? 'true' : undefined}
        >
          {primary.busy ? primary.busyLabel || primary.label : primary.label}
        </button>
      </div>
      {primary.error ? <p className="wol-ft-err" role="alert">{primary.error}</p> : null}
    </div>
  );
}

/**
 * @param {object} props
 * @param {() => void} props.onBack
 * @param {() => void} [props.onDiscard] - shows Discard when given
 * @param {{ label: string, onClick: () => void, disabled?: boolean, busy?: boolean, busyLabel?: string, error?: string }} props.primary
 */
export default function WheelFooter(props) {
  const deskRef = useRef(null);

  useLayoutEffect(() => {
    const desk = deskRef.current;
    const measure = () => {
      const phone = document.querySelector('.ui-phone-action-bar');
      const h = Math.max(desk ? desk.getBoundingClientRect().height : 0, phone ? phone.getBoundingClientRect().height : 0);
      document.documentElement.style.setProperty('--wol-bar-height', `${h}px`);
    };
    measure();
    window.addEventListener('resize', measure);
    let observer;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(measure);
      if (desk) observer.observe(desk);
      const phone = document.querySelector('.ui-phone-action-bar');
      if (phone) observer.observe(phone);
    }
    return () => {
      window.removeEventListener('resize', measure);
      observer?.disconnect();
    };
  }, []);

  return (
    <>
      <div ref={deskRef} className="wol-ft">
        <Row {...props} />
      </div>
      <PhoneActionBar>
        <Row {...props} />
      </PhoneActionBar>
    </>
  );
}
