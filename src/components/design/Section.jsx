import { useEffect, useId, useState } from 'react';
import InfoIcon from './InfoIcon';
import './design.css';

const SEEN_PREFIX = 'ds-help-seen:';

function readSeen(key) {
  try {
    return window.localStorage.getItem(SEEN_PREFIX + key) === '1';
  } catch {
    return false;
  }
}

// Section (design reference: Section). An action-led title in Nekst
// capitals (what you do here: "Log today"), one short line, a divider
// above.
//
// helpKey: when given, the line shows on the first visit on this device,
//          then collapses to a small "i" beside the title that opens it
//          again (decisions: "Help text").
// as:      the heading element (h2 on a real page).
export default function Section({ title, line, helpKey, as: Heading = 'h2', id, children, className = '' }) {
  const lineId = useId();
  const [collapsed] = useState(() => (helpKey ? readSeen(helpKey) : false));
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    if (!helpKey) return;
    try {
      window.localStorage.setItem(SEEN_PREFIX + helpKey, '1');
    } catch {
      // Storage blocked: the line simply keeps showing.
    }
  }, [helpKey]);

  const showLine = line && (!collapsed || helpOpen);

  return (
    <section id={id} className={`ds-section ${className}`.trim()}>
      <div className="ds-section-head">
        <Heading className="ds-section-title">{title}</Heading>
        {line && collapsed && (
          <button
            type="button"
            className="ds-help-toggle"
            aria-expanded={helpOpen}
            aria-controls={lineId}
            aria-label={`About ${title}`}
            onClick={() => setHelpOpen((open) => !open)}
          >
            <InfoIcon />
          </button>
        )}
      </div>
      {line && (
        <p id={lineId} className="ds-section-line" hidden={!showLine}>
          {line}
        </p>
      )}
      {children && <div className="ds-section-body">{children}</div>}
    </section>
  );
}
