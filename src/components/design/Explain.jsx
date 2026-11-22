import { useRef, useState } from 'react';
import { SlidePanel } from './Dialogs';
import InfoIcon from './InfoIcon';
import { Button } from './Button';
import useHiddenHelp from './useHiddenHelp';
import { helpKeyFor } from '../../lib/hiddenHelp';
import './design.css';

// Longer explanations open in the side panel (Tim, 16 Nov, 23:31; design
// reference "Explanations (16 Nov)", pattern M21 Travel plan version 6).
// A pop-up holds one short line only: a single term, a chart value, or who
// can see this. Anything longer (several terms together, what a chart's
// marks mean, how a score is worked out, why some steps help) opens here.
//
// The panel is the shared side panel ("Who can see this?"): from the right,
// 460px, over a dimmed page on a laptop; full screen on a phone. Escape,
// the close crosshair or the dimmed page closes it, and focus goes back to
// what opened it. Inside: the title says what it explains, as a sentence
// in DM Sans 20px; each term on its own line in the main colour with its
// meaning under it in grey, one sentence per line, a fine line between
// terms. No bullets, no bold, no ⓘ.
//
//   explain: { title, lines?: [sentence], terms?: [{ term, meaning: sentence | [sentences] }], after?: [sentence] }
//   action:  (close) => one quiet link at the very end (M21's "I don’t have
//            caffeine", which closes the panel as it acts), or nothing.
//
// Help that can be dismissed (Tim, 19 Nov; tidy pass, item 13): a panel
// opened by ExplainLink or ExplainInfo ends with "Don’t show me this
// again", which hides the link or ⓘ that opens it, with Undo; My Account,
// Appearance has "Hidden help" with "Show it again" (useHiddenHelp,
// src/lib/hiddenHelp.js). Each is hidden under its `helpKey`, or a key made
// from its title. A panel with its own action (M21's caffeine link, the
// coach portal's HelpLink) keeps that one link instead; `helpKey={false}`
// leaves it out.

const asList = (v) => (Array.isArray(v) ? v : v ? [v] : []);

export function ExplainPanel({ open, onClose, explain, action = null }) {
  if (!explain) return null;
  const { title, lines = [], terms = [], after = [] } = explain;
  return (
    <SlidePanel open={open} onClose={onClose} title={title} className="ds-who-panel ds-explain-panel">
      {lines.length > 0 && (
        <div className="ds-explain-lines">
          {lines.map((line) => <p key={line} className="ds-explain-line">{line}</p>)}
        </div>
      )}
      {terms.length > 0 && (
        <dl className="ds-explain-terms">
          {terms.map((t) => (
            <div key={t.term} className="ds-explain-term">
              <dt className="ds-explain-word">{t.term}</dt>
              {asList(t.meaning).map((m) => <dd key={m} className="ds-explain-meaning">{m}</dd>)}
            </div>
          ))}
        </dl>
      )}
      {after.length > 0 && (
        <div className="ds-explain-lines ds-explain-after">
          {after.map((line) => <p key={line} className="ds-explain-line">{line}</p>)}
        </div>
      )}
      {action && <div className="ds-explain-action">{action(onClose)}</div>}
    </SlidePanel>
  );
}

// Opening the panel: the state and the props for whatever opens it.
export function useExplain() {
  const [open, setOpen] = useState(false);
  const opener = useRef(null);
  return {
    open,
    show: () => setOpen(true),
    close: () => {
      setOpen(false);
      // Back to what opened it (the panel's own close also tries).
      requestAnimationFrame(() => opener.current?.focus?.());
    },
    opener,
  };
}

// "Don’t show me this again" for one explanation, and whether it is hidden.
function useDismiss(explain, helpKey, action) {
  const help = useHiddenHelp();
  const key = helpKey === false || action ? null : helpKeyFor(explain, helpKey);
  return {
    hidden: Boolean(key) && help.isHidden(key),
    action: key
      ? (close) => <Button variant="text" onClick={() => { close(); help.hide(key); }}>Don’t show me this again</Button>
      : action,
  };
}

// A quiet text link under the thing it explains ("How to read the chart",
// "Why these steps help"), opening the panel.
export function ExplainLink({ explain, children, className = '', action = null, helpKey = null }) {
  const e = useExplain();
  const dismiss = useDismiss(explain, helpKey, action);
  if (dismiss.hidden) return null;
  return (
    <>
      <button
        type="button"
        ref={e.opener}
        className={`ds-explain-link ${className}`.trim()}
        aria-haspopup="dialog"
        onClick={e.show}
      >
        {children}
      </button>
      <ExplainPanel open={e.open} onClose={e.close} explain={explain} action={dismiss.action} />
    </>
  );
}

// The ⓘ beside a single term or a combined score, opening the panel. The
// button and its tap area are the same as every ⓘ (rule 25).
export function ExplainInfo({ explain, label, className = 'ds-help-toggle ds-term-info', helpKey = null }) {
  const e = useExplain();
  const dismiss = useDismiss(explain, helpKey, null);
  if (dismiss.hidden) return null;
  return (
    <>
      <button
        type="button"
        ref={e.opener}
        className={className}
        aria-label={label || explain?.title || 'More about this'}
        aria-haspopup="dialog"
        onClick={e.show}
      >
        <InfoIcon />
      </button>
      <ExplainPanel open={e.open} onClose={e.close} explain={explain} action={dismiss.action} />
    </>
  );
}
