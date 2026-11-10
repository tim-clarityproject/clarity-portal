import { useEffect, useId, useState } from 'react';
import keepWords from './keepWords';
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
// helpKey: when given, the line shows on the first visit on this device
//          only, then never again (Tim, 5 Nov: first-visit tips, no "i").
// as:      the heading element (h2 on a real page).
// eye:     who can see the section (WhoSees), inside the heading beside its
//          last word (5e rules 10 and 29d): once per section, never floating
//          at the far edge.
// aside:   a control at the right of the title (a segmented control).
export default function Section({ title, line, helpKey, as: Heading = 'h2', id, aside, eye, children, className = '' }) {
  const lineId = useId();
  const [collapsed] = useState(() => (helpKey ? readSeen(helpKey) : false));

  useEffect(() => {
    if (!helpKey) return;
    try {
      window.localStorage.setItem(SEEN_PREFIX + helpKey, '1');
    } catch {
      // Storage blocked: the line simply keeps showing.
    }
  }, [helpKey]);

  return (
    <section id={id} className={`ds-section ${className}`.trim()}>
      <div className="ds-section-head">
        <Heading className="ds-section-title">{keepWords(title)}{eye && <span className="ds-page-aside">{eye}</span>}</Heading>
        {aside && <div className="ds-section-aside">{aside}</div>}
      </div>
      {/* A first-visit tip: shown once, then never again (Tim, 5 Nov:
          no explaining text left on screens for every visit, no "i"). */}
      {line && !collapsed && <p id={lineId} className="ds-section-line">{line}</p>}
      {children && <div className="ds-section-body">{children}</div>}
    </section>
  );
}
