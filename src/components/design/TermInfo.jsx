import { useId } from 'react';
import InfoIcon from './InfoIcon';
import InfoPop from './InfoPop';
import useInfoToggle from './useInfoToggle';
import './design.css';

// A term or combined score that needs explaining (Tim, 5 Nov, 11:00 rule 3):
// the words, then the one "i" 6px after them, which opens a proper box
// saying what it is and how it's worked out (one sentence per line). The
// only place an "i" is kept.
export default function TermInfo({ children, lines = [], label }) {
  const id = useId();
  const { open, buttonRef, panelRef, buttonProps } = useInfoToggle();
  return (
    <span className="ds-term">
      {children}
      <button
        type="button"
        ref={buttonRef}
        className="ds-help-toggle ds-term-info"
        aria-label={label || `About ${typeof children === 'string' ? children : 'this'}`}
        aria-expanded={open}
        aria-controls={id}
        {...buttonProps}
      >
        <InfoIcon />
      </button>
      <InfoPop id={id} open={open} anchorRef={buttonRef} panelRef={panelRef} lines={lines} />
    </span>
  );
}
