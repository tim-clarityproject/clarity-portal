import { useId, useState } from 'react';
import DisclosureArrow from './DisclosureArrow';
import './design.css';

// A list of rows that each open in place (M1 debrief, "Your days"): the
// row's name, one grey line of what it holds (cut to one line on a wide
// screen, wrapping on a phone), and the disclosure arrow, which points up
// while open. The answers grow smoothly underneath, never jumping, and
// every row looks alike.
//
// items: [{ key, title, summary, render: () => content }]
export default function ExpandList({ label, items = [], className = '' }) {
  const [open, setOpen] = useState(() => new Set());
  const baseId = useId();
  const flip = (key) => setOpen((s) => {
    const next = new Set(s);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });
  return (
    <div className={`ds-expand ${className}`.trim()} role="list" aria-label={label}>
      {items.map((item, i) => {
        const isOpen = open.has(item.key);
        const bodyId = `${baseId}-${i}`;
        return (
          <div key={item.key} role="listitem" className={`ds-expand-item${isOpen ? ' ds-expand-item--open' : ''}`}>
            <button type="button" className="ds-expand-head" aria-expanded={isOpen} aria-controls={bodyId} onClick={() => flip(item.key)}>
              <span className="ds-expand-title">{item.title}</span>
              {item.summary && <span className="ds-expand-summary">{item.summary}</span>}
              <span className="ds-collapse-mark"><DisclosureArrow open={isOpen} /></span>
            </button>
            <div id={bodyId} className="ds-expand-body" inert={!isOpen}>
              <div>
                <div className="ds-expand-inner">{item.render?.()}</div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
