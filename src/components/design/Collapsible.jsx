import { useId, useState } from 'react';
import DisclosureArrow from './DisclosureArrow';
import './design.css';

// Show less, reveal more (decisions: "Calm, uncluttered pages"). One line
// with the key fact and the disclosure arrow; tapping opens the detail and
// the arrow turns to point up. The detail grows smoothly, never jumps.
export default function Collapsible({ summary, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  return (
    <div className={`ds-collapse${open ? ' ds-collapse--open' : ''}`}>
      <button
        type="button"
        className="ds-collapse-head"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((v) => !v)}
      >
        <span>{summary}</span>
        <span className="ds-collapse-mark"><DisclosureArrow open={open} /></span>
      </button>
      <div id={bodyId} className="ds-collapse-body" inert={!open}>
        <div>
          <div className="ds-collapse-inner">{children}</div>
        </div>
      </div>
    </div>
  );
}
