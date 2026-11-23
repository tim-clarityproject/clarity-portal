import { useId } from 'react';
import InfoIcon from './InfoIcon';
import InfoPop from './InfoPop';
import useInfoToggle from './useInfoToggle';
import { ExplainInfo } from './Explain';
import './design.css';

// A term or combined score that needs explaining (Tim, 5 Nov, 11:00 rule 3):
// the words, then the one "i" 6px after them, which opens a proper box
// saying what it is and how it's worked out (one sentence per line). The
// only place an "i" is kept.
//
// explain: instead of lines, a longer explanation that opens in the side
// panel (Explain.jsx; Tim, 16 Nov: a pop-up holds one short line only).
// helpKey: its fixed name, which "Don’t show me this again" hides it under
// (src/lib/hiddenHelp.js, HELP_KEYS).
export default function TermInfo({ children, lines = [], label, explain, helpKey = null }) {
  const id = useId();
  const { open, buttonRef, panelRef, buttonProps } = useInfoToggle();
  if (explain) {
    return (
      <span className="ds-term">
        {children}
        <ExplainInfo explain={explain} helpKey={helpKey} label={label || `About ${typeof children === 'string' ? children : 'this'}`} />
      </span>
    );
  }
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
//   explain: a longer explanation for the side panel, instead of lines
//   helpKey: its fixed name, for "Don’t show me this again" (HELP_KEYS)
export function SentenceInfo({ children, lines = [], label, explain, helpKey = null }) {
  const id = useId();
  const { open, buttonRef, panelRef, buttonProps } = useInfoToggle();
  const text = typeof children === 'string' ? children.trim() : null;
  const at = text ? text.lastIndexOf(' ') : -1;
  const button = explain ? (
    <ExplainInfo explain={explain} helpKey={helpKey} label={label || explain.title} className="ds-guide-i ds-guide-i--end" />
  ) : (
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
      {!explain && <InfoPop id={id} open={open} anchorRef={buttonRef} panelRef={panelRef} lines={lines} />}
    </>
  );
}
