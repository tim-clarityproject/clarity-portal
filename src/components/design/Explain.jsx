import { useRef, useState } from 'react';
import { SlidePanel } from './Dialogs';
import InfoIcon from './InfoIcon';
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

const asList = (v) => (Array.isArray(v) ? v : v ? [v] : []);

export function ExplainPanel({ open, onClose, explain }) {
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

// A quiet text link under the thing it explains ("How to read the chart",
// "Why these steps help"), opening the panel.
export function ExplainLink({ explain, children, className = '' }) {
  const e = useExplain();
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
      <ExplainPanel open={e.open} onClose={e.close} explain={explain} />
    </>
  );
}

// The ⓘ beside a single term or a combined score, opening the panel. The
// button and its tap area are the same as every ⓘ (rule 25).
export function ExplainInfo({ explain, label, className = 'ds-help-toggle ds-term-info' }) {
  const e = useExplain();
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
      <ExplainPanel open={e.open} onClose={e.close} explain={explain} />
    </>
  );
}
