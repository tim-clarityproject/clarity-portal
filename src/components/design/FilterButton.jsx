import { useId, useRef, useState } from 'react';
import DisclosureArrow from './DisclosureArrow';
import './design.css';

// Filter: one Filter button that opens the dropdowns (children, usually
// Choice or Dropdown), then one plain line saying what is applied, with a
// Clear link. The disclosure arrow turns to point up while they are open.
//
// applied: words for what is applied ("day reviews from this month"), or
//          empty when nothing is.
export default function FilterButton({ label = 'Filter', applied, onClear, children }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const buttonRef = useRef(null);
  return (
    <div
      className="ds-filter"
      onKeyDown={(e) => {
        // Escape closes the panel, unless it is closing a drop-down inside it.
        if (e.key !== 'Escape' || !open) return;
        const t = e.target;
        const insideOpenList = t !== buttonRef.current
          && (t.getAttribute?.('aria-expanded') === 'true' || t.closest?.('[role="listbox"], [role="dialog"]'));
        if (insideOpenList) return;
        setOpen(false);
        buttonRef.current?.focus();
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        className="ds-btn ds-btn--outline"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        {label}
        <DisclosureArrow open={open} />
      </button>
      <div id={panelId} className="ds-filter-panel" hidden={!open}>
        {children}
      </div>
      <p className="ds-filter-line" aria-live="polite">
        <span>{applied ? `Showing ${applied}.` : 'Showing everything.'}</span>
        {applied && onClear && (
          <button
            type="button"
            className="ds-link"
            onClick={() => {
              onClear();
              // Clear disappears once nothing is applied; focus goes back to Filter.
              buttonRef.current?.focus();
            }}
          >
            Clear
          </button>
        )}
      </p>
    </div>
  );
}
