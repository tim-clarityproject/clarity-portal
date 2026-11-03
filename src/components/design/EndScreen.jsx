import { useId } from 'react';
import { IconText } from './IconText';
import InfoIcon from './InfoIcon';
import useInfoToggle from './useInfoToggle';
import './design.css';

// Sleep wind down and Work's done for today (mock-up M19, approved by Tim
// on 29 Oct; Phase 4 step 6).
//
// EndScreen: the centred last screen of a tool. A title in Nekst capitals,
// a line or two in the secondary grey, one sentence each, then one button.
// Everything is centred, as on M19's breathing screen. `kind`:
//   'night' Sleep well (M19 .gn): 30px title, 24px on a phone; the page
//           holds nothing to act on, only words, so the button is outlined.
//   'done'  Work's done for today (M19 .wd): 28px title, 22px on a phone,
//           with the coral Back to Home.
// headingRef: focus goes to the title when the screen appears (GuidedTool
// passes tool.headingRef).
export function EndScreen({ kind = 'done', title, lines = [], action, headingRef }) {
  return (
    <div className={`ds-end ds-end--${kind}`}>
      <h2 ref={headingRef} tabIndex={-1} className="ds-end-title">{title}</h2>
      {lines.filter(Boolean).map((line) => <p key={line} className="ds-end-line">{line}</p>)}
      {action && <div className="ds-end-action">{action}</div>}
    </div>
  );
}

// Night colours (M19, "named night tokens"): each mode's own colours, one
// step quieter, so a night screen dims through low contrast in light and
// in dark, never forced dark. A part of a page (or a GuidedTool step's
// className) takes them with the ds-night class; NightScope wraps one.
export function NightScope({ children, className = '' }) {
  return <div className={`ds-night ${className}`.trim()}>{children}</div>;
}

// "Why write it down": an icon-with-words "i" (26 Oct rule 5) whose
// explanation opens in place under it, as every "i" opens (useInfoToggle):
// a title line, then its sentences.
export function InfoWords({ children, title, text = [] }) {
  const { open, buttonRef, panelRef, buttonProps } = useInfoToggle();
  const id = useId();
  const sentences = Array.isArray(text) ? text : [text];
  return (
    <>
      <IconText
        ref={buttonRef}
        icon={<InfoIcon />}
        aria-expanded={open}
        aria-controls={id}
        className="ds-info-words"
        {...buttonProps}
      >
        {children}
      </IconText>
      <div id={id} ref={panelRef} className="ds-info-words-panel" hidden={!open}>
        {title && <b>{title}</b>}
        {sentences.map((t) => <span key={t}>{t}</span>)}
      </div>
    </>
  );
}
