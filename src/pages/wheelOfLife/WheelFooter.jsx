import { useLayoutEffect, useRef } from 'react';
import PhoneActionBar from '../../components/ui/PhoneActionBar';
import { BackLink, DiscardLink } from '../../components/ui/DiscardLink';
import { Button } from '../../components/design';

// The footer action bar of the mock-up (Back and Discard on the left, the
// main button on the right), built from the portal's shared parts:
// BackLink and DiscardLink, and on phone the shared PhoneActionBar, fixed
// directly above the tab bar. On desktop the same row is pinned to the
// bottom of the window, like the Breathe page's bar (the floating buttons
// are hidden on these routes, as on /breathe). Its height is written to
// --wol-bar-height so the page clears it, and the distance from the
// bottom of the window to the bar's top edge is written to the shared
// toast's --ds-toast-offset so toasts show above the bar, not over it.
function Row({ onBack, onDiscard, primary }) {
  return (
    <div className="wol-ft-box">
      <div className="wol-ft-in">
        <div className="wol-ft-left">
          <BackLink onClick={onBack} />
          {onDiscard ? <DiscardLink onClick={onDiscard} aria-label="Discard" /> : null}
        </div>
        <Button
          variant="primary"
          onClick={primary.onClick}
          disabled={primary.disabled || primary.busy}
          aria-busy={primary.busy ? 'true' : undefined}
        >
          {primary.busy ? primary.busyLabel || primary.label : primary.label}
        </Button>
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
    const html = document.documentElement;
    const measure = () => {
      const phone = document.querySelector('.ui-phone-action-bar');
      const deskBox = desk ? desk.getBoundingClientRect() : null;
      const phoneBox = phone ? phone.getBoundingClientRect() : null;
      const h = Math.max(deskBox ? deskBox.height : 0, phoneBox ? phoneBox.height : 0);
      html.style.setProperty('--wol-bar-height', `${h}px`);
      // On a phone the bar sits above the tab bar, so the toast clears
      // both: everything from the bar's top edge to the window bottom.
      const shown = [deskBox, phoneBox].filter((box) => box && box.height > 0);
      const clear = shown.length ? Math.max(...shown.map((box) => window.innerHeight - box.top)) : 0;
      html.style.setProperty('--ds-toast-offset', `${Math.max(0, clear)}px`);
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
      html.style.removeProperty('--ds-toast-offset');
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
