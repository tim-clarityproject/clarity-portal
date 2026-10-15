import { useEffect, useRef } from 'react';

// The one filter control every list uses (My Plans, My Reviews, My
// Journals, Decision History ...). A single row of pills that never
// wraps: when there are more pills than fit, the row swipes left and
// right (momentum scrolling on iOS, scrollbar hidden), so the last pill
// is always reachable. There is no dropdown on phone any more - the
// same control is used at every width, so new tags added later behave
// the same way everywhere.
//
// The selected pill is scrolled into view inside the row (never the
// page: only the row's own scrollLeft changes). A trailing spacer keeps
// the last pill clear of the right edge. No fade overlay, no gradient.
// Look and counts are unchanged from the earlier pills.
export default function FilterPills({ filters, active, onSelect, countFor, label, sub = false }) {
  const rowRef = useRef(null);

  useEffect(() => {
    const row = rowRef.current;
    const pill = row?.querySelector('[aria-pressed="true"]');
    if (!row || !pill) return;
    const target = pill.offsetLeft - (row.clientWidth - pill.offsetWidth) / 2;
    row.scrollLeft = Math.max(0, target);
  }, [active, filters.length]);

  return (
    <>
      <style>{FILTER_PILLS_CSS}</style>
      <div
        ref={rowRef}
        className={`fpills${sub ? ' fpills--sub' : ''}`}
        role="group"
        aria-label={label}
      >
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            className="fpills-btn"
            aria-pressed={active === f.id}
            onClick={() => onSelect(f.id)}
          >
            {f.label}
            <i>{countFor(f)}</i>
          </button>
        ))}
      </div>
    </>
  );
}

const FILTER_PILLS_CSS = `
.ui-root .fpills {
  display: flex;
  flex-wrap: nowrap;
  gap: 2px;
  box-sizing: border-box;
  padding: 3px;
  border: 1px solid var(--line);
  border-radius: var(--radius-pill);
  max-width: 100%;
  width: max-content;
  overflow-x: auto;
  overflow-y: hidden;
  overscroll-behavior-x: contain;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}

.ui-root .fpills::-webkit-scrollbar {
  display: none;
}

/* Trailing space so the last pill is never clipped at the right edge. */
.ui-root .fpills::after {
  content: '';
  flex: 0 0 var(--space-2);
}

.ui-root .fpills--sub {
  margin-top: var(--space-2);
}

.ui-root .fpills-btn {
  flex: 0 0 auto;
  min-height: var(--tap-min);
  padding: 0 16px !important;
  border-radius: var(--radius-pill);
  border: none;
  background: transparent;
  font-family: var(--font-display);
  font-weight: 400;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-size: var(--fs-button) !important;
  color: var(--text-2);
  display: flex;
  align-items: center;
  gap: var(--space-2);
  white-space: nowrap;
  cursor: pointer;
  transition: background-color var(--dur) var(--ease), color var(--dur) var(--ease);
}

.ui-root .fpills-btn i {
  font-style: normal;
  font-family: var(--font-body);
  letter-spacing: 0;
  font-size: 12px;
  color: var(--placeholder);
}

.ui-root .fpills-btn:hover {
  color: var(--text);
}

.ui-root .fpills-btn[aria-pressed="true"] {
  background: var(--coral);
  color: var(--on-coral);
}

.ui-root .fpills-btn[aria-pressed="true"] i {
  color: var(--on-coral);
}

.ui-root .fpills-btn:focus-visible {
  outline: 2px solid var(--text);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .ui-root .fpills-btn {
    transition: none;
  }
}
`;
