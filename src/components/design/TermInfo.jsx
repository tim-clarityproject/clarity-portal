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

// An ⓘ at the end of a sentence, a label or a heading (rule 25; M7b's
// "Only you and Tim will see your answers.", "Success Factors" and the
// chart's heading): it sits after the last word and wraps with it, so it is
// never on a line of its own.
//   lines: as InfoPop's (sentences, or { title }, { term, meaning },
//          { heading }, { bullets })
//   label: what a screen reader hears for the ⓘ
export function SentenceInfo({ children, lines = [], label }) {
  const id = useId();
  const { open, buttonRef, panelRef, buttonProps } = useInfoToggle();
  const text = typeof children === 'string' ? children.trim() : null;
  const at = text ? text.lastIndexOf(' ') : -1;
  const button = (
    <button
      type="button"
      ref={buttonRef}
      className="ds-guide-i ds-guide-i--end"
      aria-label={label || 'More about this'}
      aria-expanded={open}
      aria-controls={id}
      {...buttonProps}
    >
      <InfoIcon />
    </button>
  );
  return (
    <>
      {text ? (
        <>
          {at >= 0 && `${text.slice(0, at)} `}
          <span className="ds-title-end">{text.slice(at + 1)}{button}</span>
        </>
      ) : <span className="ds-title-end">{children}{button}</span>}
      <InfoPop id={id} open={open} anchorRef={buttonRef} panelRef={panelRef} lines={lines} />
    </>
  );
}
