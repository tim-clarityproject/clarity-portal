import { Fragment, useEffect, useRef, useState } from 'react';
import { parseDbTimestamp, formatDayMonthTime } from '../../lib/dateFormatter';
import PageHeading from '../PageHeading';

// Shared history list - used (later, by prompts 6-10) by My Plans, My
// Reviews and My Journals. Driven only by props: no data fetching, no
// Supabase calls, no navigation of its own. The caller supplies rows,
// decides what "open"/"edit"/"delete" mean, and renders its own
// dialogs/toasts around this component.
//
// Row -> filter matching convention (not specified by the brief's row
// shape, which has no explicit filter/type id field): by default a
// filter's `id` is matched against each row's own `typeLabel`, and the
// id 'all' always matches every row. A filter may instead carry its own
// `match(row)` predicate (prompt 7, My Plans: a grouped filter like
// "Decisions" has no single typeLabel of its own) - this keeps every
// pre-existing filter (plain {id,label}, matched by typeLabel) working
// unchanged, it only opts in when a filter supplies `match`.
//
// `subFilters` (prompt 7, My Plans): an optional map of parent filter id
// -> a second array of {id,label[,match]} filter defs, shown as a
// second row of pills (desktop) / a second dropdown (phone) once that
// parent filter is active - e.g. choosing "Decisions" reveals a second
// level for If-Then/Time audit/GROW/Tough feedback.
const DEFAULT_VISIBLE = 50;

function PencilIcon() {
  return (
    <svg className="hlist-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4.5 19.5l1-4L16.8 4.2a1.8 1.8 0 0 1 2.5 0l.5.5a1.8 1.8 0 0 1 0 2.5L8.5 18.5z" />
      <path d="M14.5 6.5l3 3" />
    </svg>
  );
}

function BinIcon() {
  return (
    <svg className="hlist-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 7h14M10 7V4.5h4V7M7 7l.8 12.5h8.4L17 7M10.5 11v5M13.5 11v5" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg className="hlist-chevron" viewBox="0 0 24 24" aria-hidden="true">
      <path d="m6 9.5 6 6 6-6" />
    </svg>
  );
}

function formatMonthHeading(value) {
  const date = parseDbTimestamp(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

function rowMatchesFilter(row, filterDef) {
  if (!filterDef || filterDef.id === 'all') return true;
  if (filterDef.match) return filterDef.match(row);
  return row.typeLabel === filterDef.id;
}

function countForFilter(rows, filterDef) {
  if (filterDef.id === 'all') return rows.length;
  return rows.filter((r) => rowMatchesFilter(r, filterDef)).length;
}

export default function HistoryList({
  title,
  pageKey,
  rows = [],
  filters = [],
  subFilters = {},
  newButton,
  emptyText = 'Nothing here yet.',
  error,
  onOpen,
  onEdit,
  onDelete,
  onReview,
}) {
  const allFilters = filters.length ? [{ id: 'all', label: 'All' }, ...filters] : [];
  const [activeFilter, setActiveFilter] = useState('all');
  const [activeSubFilter, setActiveSubFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState('new'); // 'new' | 'old'
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [subDropdownOpen, setSubDropdownOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(DEFAULT_VISIBLE);
  const dropdownRef = useRef(null);
  const dropdownButtonRef = useRef(null);
  const optionRefs = useRef([]);
  const subDropdownRef = useRef(null);
  const subDropdownButtonRef = useRef(null);
  const subOptionRefs = useRef([]);

  const activeSubFilterList = subFilters[activeFilter];
  const allSubFilters = activeSubFilterList ? [{ id: 'all', label: 'All' }, ...activeSubFilterList] : null;

  // Close the phone filter dropdown(s) on outside tap and Escape.
  useEffect(() => {
    if (!dropdownOpen && !subDropdownOpen) return;
    const handlePointerDown = (e) => {
      if (dropdownOpen && dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
      if (subDropdownOpen && subDropdownRef.current && !subDropdownRef.current.contains(e.target)) {
        setSubDropdownOpen(false);
      }
    };
    const handleKey = (e) => {
      if (e.key !== 'Escape') return;
      if (subDropdownOpen) {
        setSubDropdownOpen(false);
        subDropdownButtonRef.current?.focus();
      } else if (dropdownOpen) {
        setDropdownOpen(false);
        dropdownButtonRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKey);
    };
  }, [dropdownOpen, subDropdownOpen]);

  const handleDropdownToggle = () => {
    setDropdownOpen((open) => !open);
  };

  const handleOptionSelect = (filterId) => {
    setActiveFilter(filterId);
    setActiveSubFilter('all');
    setDropdownOpen(false);
    dropdownButtonRef.current?.focus();
  };

  const handleSubOptionSelect = (filterId) => {
    setActiveSubFilter(filterId);
    setSubDropdownOpen(false);
    subDropdownButtonRef.current?.focus();
  };

  const handleListboxKeyDown = (e, index) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = optionRefs.current[index + 1] || optionRefs.current[0];
      next?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = optionRefs.current[index - 1] || optionRefs.current[optionRefs.current.length - 1];
      prev?.focus();
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleOptionSelect(allFilters[index].id);
    } else if (e.key === 'Escape') {
      setDropdownOpen(false);
      dropdownButtonRef.current?.focus();
    }
  };

  const handleSubListboxKeyDown = (e, index) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = subOptionRefs.current[index + 1] || subOptionRefs.current[0];
      next?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = subOptionRefs.current[index - 1] || subOptionRefs.current[subOptionRefs.current.length - 1];
      prev?.focus();
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleSubOptionSelect(allSubFilters[index].id);
    } else if (e.key === 'Escape') {
      setSubDropdownOpen(false);
      subDropdownButtonRef.current?.focus();
    }
  };

  if (error) {
    return (
      <div className="ui-root hlist-wrap">
        <HistoryListStyles />
        <div className="hlist-head">
          <div>
            {title && <PageHeading pageKey={pageKey} title={title} overline="" rule={false} />}
          </div>
        </div>
        <div className="hlist-error" role="alert">
          <p>{error.message || 'Something went wrong.'}</p>
          {error.onRetry && (
            <button type="button" className="hlist-ghost-btn" onClick={error.onRetry}>
              Try again
            </button>
          )}
        </div>
      </div>
    );
  }

  const activeFilterDef = allFilters.find((f) => f.id === activeFilter) || allFilters[0];
  const activeSubFilterDef = allSubFilters?.find((f) => f.id === activeSubFilter) || allSubFilters?.[0];

  const filtered = rows.filter((r) => (
    rowMatchesFilter(r, activeFilterDef) && (!activeSubFilterDef || rowMatchesFilter(r, activeSubFilterDef))
  ));
  const sorted = [...filtered].sort((a, b) => {
    const da = parseDbTimestamp(a.date).getTime();
    const db = parseDbTimestamp(b.date).getTime();
    return sortOrder === 'new' ? db - da : da - db;
  });
  const visible = sorted.slice(0, visibleCount);
  const hasMore = sorted.length > visible.length;

  let lastMonth = '';

  return (
    <div className="ui-root hlist-wrap">
      <HistoryListStyles />

      <div className="hlist-head">
        <div>
          {title && <PageHeading pageKey={pageKey} title={title} overline="" rule={false} />}
        </div>
        {newButton && (
          <button type="button" className="hlist-ghost-btn hlist-new-desktop" onClick={newButton.onClick}>
            + {newButton.label}
          </button>
        )}
      </div>

      {allFilters.length > 0 && (
        <>
          <div className="hlist-seg" role="group" aria-label="Filter by type">
            {allFilters.map((f) => (
              <button
                key={f.id}
                type="button"
                className="hlist-seg-btn"
                aria-pressed={activeFilter === f.id}
                onClick={() => { setActiveFilter(f.id); setActiveSubFilter('all'); }}
              >
                {f.label}
                <i>{countForFilter(rows, f)}</i>
              </button>
            ))}
          </div>

          {allSubFilters && (
            <div className="hlist-seg hlist-seg--sub" role="group" aria-label="Filter by decision type">
              {allSubFilters.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className="hlist-seg-btn"
                  aria-pressed={activeSubFilter === f.id}
                  onClick={() => setActiveSubFilter(f.id)}
                >
                  {f.label}
                  <i>{countForFilter(rows.filter((r) => rowMatchesFilter(r, activeFilterDef)), f)}</i>
                </button>
              ))}
            </div>
          )}

          <div className="hlist-dropdown-wrap" ref={dropdownRef}>
            <button
              type="button"
              ref={dropdownButtonRef}
              className="hlist-dropdown-btn"
              aria-expanded={dropdownOpen}
              aria-haspopup="listbox"
              onClick={handleDropdownToggle}
            >
              <span>
                {activeFilterDef?.label}
                <i>{countForFilter(rows, activeFilterDef)}</i>
              </span>
              <ChevronDownIcon />
            </button>
            {dropdownOpen && (
              <div className="hlist-dropdown-list" role="listbox" aria-label="Filter by type">
                {allFilters.map((f, i) => (
                  <button
                    key={f.id}
                    type="button"
                    ref={(el) => { optionRefs.current[i] = el; }}
                    role="option"
                    aria-selected={activeFilter === f.id}
                    className="hlist-dropdown-option"
                    onClick={() => handleOptionSelect(f.id)}
                    onKeyDown={(e) => handleListboxKeyDown(e, i)}
                  >
                    {f.label}
                    <i>{countForFilter(rows, f)}</i>
                  </button>
                ))}
              </div>
            )}
          </div>

          {allSubFilters && (
            <div className="hlist-dropdown-wrap hlist-dropdown-wrap--sub" ref={subDropdownRef}>
              <button
                type="button"
                ref={subDropdownButtonRef}
                className="hlist-dropdown-btn"
                aria-expanded={subDropdownOpen}
                aria-haspopup="listbox"
                onClick={() => setSubDropdownOpen((open) => !open)}
              >
                <span>
                  {activeSubFilterDef?.label}
                  <i>{countForFilter(rows.filter((r) => rowMatchesFilter(r, activeFilterDef)), activeSubFilterDef)}</i>
                </span>
                <ChevronDownIcon />
              </button>
              {subDropdownOpen && (
                <div className="hlist-dropdown-list" role="listbox" aria-label="Filter by decision type">
                  {allSubFilters.map((f, i) => (
                    <button
                      key={f.id}
                      type="button"
                      ref={(el) => { subOptionRefs.current[i] = el; }}
                      role="option"
                      aria-selected={activeSubFilter === f.id}
                      className="hlist-dropdown-option"
                      onClick={() => handleSubOptionSelect(f.id)}
                      onKeyDown={(e) => handleSubListboxKeyDown(e, i)}
                    >
                      {f.label}
                      <i>{countForFilter(rows.filter((r) => rowMatchesFilter(r, activeFilterDef)), f)}</i>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      <div className="hlist-tools">
        <span>{filtered.length} {filtered.length === 1 ? 'entry' : 'entries'}</span>
        <button type="button" className="hlist-sort-link" onClick={() => setSortOrder((o) => (o === 'new' ? 'old' : 'new'))}>
          {sortOrder === 'new' ? 'Newest first' : 'Oldest first'} ⇅
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="hlist-empty">
          {rows.length === 0 ? emptyText : 'Nothing of this type yet.'}
        </div>
      ) : (
        <>
          {visible.map((row) => {
            const mm = formatMonthHeading(row.date);
            const showMonth = mm !== lastMonth;
            lastMonth = mm;
            return (
              <Fragment key={row.id}>
                {showMonth && <div className="hlist-month">{mm}</div>}
                <div className="hlist-row">
                  <button type="button" className="hlist-row-main" onClick={() => onOpen?.(row)}>
                    <span className="hlist-row-title">{row.title}</span>
                    <span className="hlist-row-sub">
                      <span className="hlist-row-tags">
                        <b>{row.typeLabel}</b>
                        {row.isDraft && <span className="hlist-draft-tag">Draft</span>}
                        {row.reviewed && <span className="hlist-reviewed-tag">Reviewed</span>}
                      </span>
                      <span className="hlist-row-meta">
                        <span>{formatDayMonthTime(row.date)}</span>
                        {row.version && <span>{row.version}</span>}
                        {row.meta && <span>{row.meta}</span>}
                      </span>
                    </span>
                  </button>
                  <div className="hlist-row-controls">
                    {onReview && row.canReview !== false && (
                      <button
                        type="button"
                        className={`hlist-review-btn${row.reviewed ? ' done' : ''}`}
                        onClick={(e) => { e.stopPropagation(); onReview(row); }}
                      >
                        {row.reviewed ? 'View review' : 'Review'}
                      </button>
                    )}
                    {row.isDraft ? (
                      <button
                        type="button"
                        className="hlist-continue-btn"
                        onClick={(e) => { e.stopPropagation(); onEdit?.(row); }}
                      >
                        Continue
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="hlist-icon-btn"
                        aria-label={`Edit ${row.title}`}
                        onClick={(e) => { e.stopPropagation(); onEdit?.(row); }}
                      >
                        <PencilIcon />
                      </button>
                    )}
                    <button
                      type="button"
                      className="hlist-icon-btn hlist-icon-btn--del"
                      aria-label={`Delete ${row.title}`}
                      onClick={(e) => { e.stopPropagation(); onDelete?.(row); }}
                    >
                      <BinIcon />
                    </button>
                  </div>
                </div>
              </Fragment>
            );
          })}

          {hasMore && (
            <div className="hlist-show-more-wrap">
              <button type="button" className="hlist-show-more" onClick={() => setVisibleCount(sorted.length)}>
                Show more
              </button>
            </div>
          )}
        </>
      )}

      {newButton && (
        <div className="hlist-new-phone-wrap">
          <button type="button" className="hlist-ghost-btn" onClick={newButton.onClick}>
            + {newButton.label}
          </button>
        </div>
      )}
    </div>
  );
}

function HistoryListStyles() {
  return <style>{HLIST_CSS}</style>;
}

// Inline so the component is a single-file drop-in, same pattern already
// used by BreathingOrb.jsx/Toast.jsx elsewhere in this codebase. Values
// with no matching token are called out in the task summary.
const HLIST_CSS = `
.hlist-wrap { width: 100%; box-sizing: border-box; }

.hlist-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--space-3);
  margin-bottom: var(--space-4);
}

.ui-root .hlist-ghost-btn {
  min-height: var(--tap-min);
  padding: 0 20px !important;
  border: 1px solid var(--btn-line);
  border-radius: var(--radius-pill);
  font-family: var(--font-display);
  font-weight: 400;
  text-transform: uppercase;
  letter-spacing: 0.16em;
  font-size: var(--fs-button) !important;
  color: var(--text);
  background: transparent;
  cursor: pointer;
  white-space: nowrap;
  transition: border-color var(--dur) var(--ease);
}

.ui-root .hlist-ghost-btn:hover,
.ui-root .hlist-ghost-btn:focus-visible {
  border-color: var(--coral);
}

.ui-root .hlist-ghost-btn:focus-visible {
  outline: 2px solid var(--coral);
  outline-offset: 3px;
}

.hlist-new-phone-wrap {
  display: none;
  margin-top: var(--space-4);
  justify-content: center;
}

@media (max-width: 768px) {
  .hlist-new-desktop { display: none; }
  .hlist-new-phone-wrap { display: flex; }
}

/* Desktop pill filters */
.hlist-seg {
  display: none;
}

.hlist-seg--sub {
  margin-top: var(--space-2);
}

@media (min-width: 769px) {
  .hlist-seg {
    display: flex;
    border: 1px solid var(--line);
    border-radius: var(--radius-pill);
    padding: 3px;
    gap: 2px;
    overflow-x: auto;
    max-width: 100%;
    width: max-content;
  }
}

.ui-root .hlist-seg-btn {
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

.hlist-seg-btn i {
  font-style: normal;
  font-family: var(--font-body);
  letter-spacing: 0;
  font-size: 12px;
  color: var(--placeholder);
}

.hlist-seg-btn:hover {
  color: var(--text);
}

.hlist-seg-btn[aria-pressed="true"] {
  background: var(--coral);
  color: var(--on-coral);
}

.hlist-seg-btn[aria-pressed="true"] i {
  color: var(--on-coral);
}

.hlist-seg-btn:focus-visible {
  outline: 2px solid var(--text);
  outline-offset: 2px;
}

/* Phone dropdown */
.hlist-dropdown-wrap {
  position: relative;
}

.hlist-dropdown-wrap--sub {
  margin-top: var(--space-2);
}

@media (min-width: 769px) {
  .hlist-dropdown-wrap { display: none; }
}

.ui-root .hlist-dropdown-btn {
  width: 100%;
  box-sizing: border-box;
  min-height: 48px;
  padding: 0 18px !important;
  border: 1px solid var(--line);
  border-radius: var(--radius-pill);
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  font-family: var(--font-display);
  font-weight: 400;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-size: var(--fs-button) !important;
  color: var(--text);
  cursor: pointer;
  transition: border-color var(--dur) var(--ease);
}

.hlist-dropdown-btn span {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.hlist-dropdown-btn i {
  font-style: normal;
  font-family: var(--font-body);
  letter-spacing: 0;
  font-size: 13px;
  color: var(--placeholder);
}

.hlist-dropdown-btn:hover {
  border-color: var(--btn-line);
}

.hlist-dropdown-btn[aria-expanded="true"] {
  border-color: var(--coral);
}

.hlist-dropdown-btn:focus-visible {
  outline: 2px solid var(--coral);
  outline-offset: 2px;
}

.hlist-chevron {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: var(--coral);
  stroke-width: 1.3;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition: transform var(--dur) var(--ease);
  flex-shrink: 0;
}

.hlist-dropdown-btn[aria-expanded="true"] .hlist-chevron {
  transform: rotate(180deg);
}

.hlist-dropdown-list {
  position: absolute;
  left: 0;
  right: 0;
  top: calc(100% + 6px);
  z-index: 6;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-card);
  padding: 6px 0;
  overflow: hidden;
}

.ui-root .hlist-dropdown-option {
  width: 100%;
  box-sizing: border-box;
  min-height: 48px;
  padding: 0 18px 0 22px !important;
  background: transparent;
  border: none;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-family: var(--font-body);
  font-size: 15px !important;
  color: var(--text-2);
  position: relative;
  cursor: pointer;
}

.hlist-dropdown-option i {
  font-style: normal;
  font-size: 13px;
  color: var(--placeholder);
}

.hlist-dropdown-option::before {
  content: '';
  position: absolute;
  left: 0;
  top: 10px;
  bottom: 10px;
  width: 3px;
  background: var(--coral);
  transform: scaleY(0);
  transition: transform var(--dur) var(--ease);
}

.hlist-dropdown-option:hover,
.hlist-dropdown-option:focus-visible,
.hlist-dropdown-option[aria-selected="true"] {
  color: var(--text);
}

.hlist-dropdown-option:hover::before,
.hlist-dropdown-option:focus-visible::before,
.hlist-dropdown-option[aria-selected="true"]::before {
  transform: scaleY(1);
}

.hlist-dropdown-option:focus-visible {
  outline: 2px solid var(--coral);
  outline-offset: -2px;
}

/* Entries count + sort toggle */
.hlist-tools {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-3);
  margin: 22px 0 4px;
  font-size: 13px;
  color: var(--placeholder);
}

.ui-root .hlist-sort-link {
  min-height: var(--tap-min);
  padding: 0 !important;
  background: transparent;
  border: none;
  font-size: 13px !important;
  color: var(--text-2);
  cursor: pointer;
  transition: color var(--dur) var(--ease);
}

.ui-root .hlist-sort-link:hover,
.ui-root .hlist-sort-link:focus-visible {
  color: var(--text);
}

.ui-root .hlist-sort-link:focus-visible {
  outline: 2px solid var(--coral);
  outline-offset: 2px;
}

.hlist-month {
  font-family: var(--font-display);
  font-weight: 400;
  text-transform: uppercase;
  letter-spacing: 0.2em;
  font-size: var(--fs-button);
  color: var(--coral-text);
  margin: var(--space-5) 0 6px;
}

.hlist-month:first-of-type { margin-top: var(--space-3); }

.hlist-empty {
  padding: 40px 0;
  color: var(--text-2);
  font-size: var(--fs-body-sub);
  text-align: center;
}

.hlist-error {
  padding: 40px 0;
  color: var(--text-2);
  font-size: var(--fs-body-sub);
  text-align: center;
}

.hlist-error p { margin: 0 0 var(--space-3); }

/* Row */
.hlist-row {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  border-bottom: 1px solid var(--line);
}

.hlist-row::before {
  content: '';
  position: absolute;
  left: -14px;
  top: 14px;
  bottom: 14px;
  width: 2px;
  background: var(--coral);
  transform: scaleY(0);
  transition: transform var(--dur) var(--ease);
}

@media (min-width: 769px) {
  .hlist-row:hover::before,
  .hlist-row:focus-within::before {
    transform: scaleY(1);
  }
  .hlist-row:hover .hlist-row-title,
  .hlist-row:hover .hlist-row-tags,
  .hlist-row:hover .hlist-row-meta,
  .hlist-row:focus-within .hlist-row-title,
  .hlist-row:focus-within .hlist-row-tags,
  .hlist-row:focus-within .hlist-row-meta {
    transform: translateX(6px);
  }
  .hlist-row-main:hover .hlist-row-title {
    color: var(--coral-soft);
  }
}

.ui-root .hlist-row-main {
  all: unset;
  box-sizing: border-box;
  cursor: pointer;
  flex: 1;
  min-width: 0;
  padding: 18px 8px 18px 24px !important;
  display: block;
  min-height: var(--tap-min);
}

.ui-root .hlist-row-main:focus-visible {
  outline: 2px solid var(--coral);
  outline-offset: -2px;
  border-radius: 4px;
}

.hlist-row-title {
  display: block;
  font-size: 17px;
  color: var(--text);
  line-height: 1.3;
  /* Wraps between words only - a date title never breaks mid-word.
     (overflow-wrap: break-word only splits a single word that is
     longer than the whole line.) */
  white-space: normal;
  overflow-wrap: break-word;
  word-break: normal;
  hyphens: none;
  transition: transform var(--dur) var(--ease), color var(--dur) var(--ease);
}

.hlist-draft-tag {
  display: inline-block;
  padding: 1px 8px;
  border: 1px solid var(--coral);
  border-radius: var(--radius-pill);
  font-family: var(--font-display);
  font-weight: 400;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-size: 10px;
  color: var(--coral-text);
  line-height: 1.4;
}

.hlist-reviewed-tag {
  display: inline-block;
  padding: 1px 8px;
  border: 1px solid var(--mint);
  border-radius: var(--radius-pill);
  font-family: var(--font-display);
  font-weight: 400;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-size: 10px;
  color: var(--mint-text);
  line-height: 1.4;
}

.hlist-row-controls {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  flex-shrink: 0;
}

/* Phone: the title, then the tag and type label, then the date each get
   the whole row width, and the actions sit in their own row beneath,
   aligned right - so a Reviewed or Draft tag never squeezes the title
   (this departs from the mock-up's single-line truncated phone row, by
   Tim's request). Rows with and without tags share this structure. */
@media (max-width: 600px) {
  .hlist-row {
    flex-wrap: wrap;
    align-items: flex-start;
  }
  .ui-root .hlist-row-main {
    flex: 1 1 100%;
    padding-right: var(--space-2) !important;
  }
  .hlist-row-sub {
    flex-direction: column;
    align-items: flex-start;
    row-gap: var(--space-1);
  }
  .hlist-row-controls {
    flex: 1 1 100%;
    justify-content: flex-end;
    padding: 0 var(--space-1) var(--space-2) 24px;
  }
}

.ui-root .hlist-continue-btn {
  all: unset;
  cursor: pointer;
  box-sizing: border-box;
  min-height: var(--tap-min);
  padding: 0 var(--space-2) !important;
  color: var(--coral-text);
  font-family: var(--font-display);
  font-weight: 400;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-size: 10px;
  white-space: nowrap;
  transition: color var(--dur-fast) var(--ease);
}

.ui-root .hlist-continue-btn:hover,
.ui-root .hlist-continue-btn:focus-visible {
  color: var(--coral-soft);
}

.ui-root .hlist-continue-btn:focus-visible {
  outline: 2px solid var(--coral);
  outline-offset: 2px;
  border-radius: 4px;
}

.ui-root .hlist-review-btn {
  all: unset;
  cursor: pointer;
  box-sizing: border-box;
  min-height: var(--tap-min);
  padding: 0 var(--space-2) !important;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text-2);
  font-family: var(--font-display);
  font-weight: 400;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-size: 10px;
  white-space: nowrap;
  transition: color var(--dur-fast) var(--ease);
}

.ui-root .hlist-review-btn:hover,
.ui-root .hlist-review-btn:focus-visible {
  color: var(--text);
}

.ui-root .hlist-review-btn.done {
  color: var(--mint-text);
}

.ui-root .hlist-review-btn:focus-visible {
  outline: 2px solid var(--coral);
  outline-offset: 2px;
  border-radius: 4px;
}

.hlist-check {
  width: 13px;
  height: 13px;
  fill: none;
  stroke: var(--mint);
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.hlist-row-sub {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  column-gap: var(--space-3);
  row-gap: var(--space-1);
  margin-top: 5px;
}

.hlist-row-tags {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  transition: transform var(--dur) var(--ease);
}

.hlist-row-meta {
  font-size: 13px;
  color: var(--text-2);
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  align-items: center;
  transition: transform var(--dur) var(--ease);
}

.hlist-row-tags b {
  font-family: var(--font-display);
  font-weight: 400;
  text-transform: uppercase;
  letter-spacing: 0.16em;
  font-size: 10px;
  color: var(--coral-text);
}

.ui-root .hlist-icon-btn {
  all: unset;
  cursor: pointer;
  box-sizing: border-box;
  width: 44px;
  height: 44px;
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--placeholder);
  flex-shrink: 0;
  transition: color var(--dur-fast) var(--ease);
}

.ui-root .hlist-icon-btn:hover,
.ui-root .hlist-icon-btn:focus-visible {
  color: var(--text);
}

.ui-root .hlist-icon-btn--del:hover,
.ui-root .hlist-icon-btn--del:focus-visible {
  color: var(--coral);
}

.ui-root .hlist-icon-btn:focus-visible {
  outline: 2px solid var(--coral);
  outline-offset: -4px;
  border-radius: 8px;
}

.hlist-icon {
  width: 20px;
  height: 20px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.15;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* Phone (prompt 7f): same row, title/date on the left and the
   controls on the right, same line as desktop - not stacked under the
   title. The text wraps instead of truncating (a long title/date grows
   the row rather than forcing it onto its own line above the
   controls); the controls keep flex-shrink: 0 so they never squash. */
@media (max-width: 768px) {
  .hlist-row {
    align-items: flex-start;
    padding-bottom: 4px;
  }
  .hlist-row::before { display: none; }
  .ui-root .hlist-row-main {
    padding: 14px 8px 14px 16px !important;
  }
  .hlist-row-title {
    white-space: normal;
    overflow: visible;
    text-overflow: clip;
    overflow-wrap: anywhere;
  }
  .hlist-row-meta {
    flex-wrap: wrap;
    white-space: normal;
  }
  .hlist-row-controls {
    flex-shrink: 0;
    padding-top: 14px;
  }
}

.hlist-show-more-wrap {
  display: flex;
  justify-content: center;
  margin-top: var(--space-4);
}

.ui-root .hlist-show-more {
  min-height: var(--tap-min);
  padding: 0 20px !important;
  border: 1px solid var(--btn-line);
  border-radius: var(--radius-pill);
  background: transparent;
  font-family: var(--font-display);
  font-weight: 400;
  text-transform: uppercase;
  letter-spacing: 0.16em;
  font-size: var(--fs-button) !important;
  color: var(--text);
  cursor: pointer;
  transition: border-color var(--dur) var(--ease);
}

.ui-root .hlist-show-more:hover,
.ui-root .hlist-show-more:focus-visible {
  border-color: var(--coral);
}

@media (prefers-reduced-motion: reduce) {
  .hlist-row,
  .hlist-row::before,
  .hlist-row-title,
  .hlist-row-meta,
  .hlist-chevron,
  .hlist-dropdown-option::before,
  .hlist-ghost-btn,
  .hlist-seg-btn,
  .hlist-dropdown-btn,
  .hlist-sort-link,
  .hlist-show-more,
  .hlist-icon-btn {
    transition: none !important;
  }
}
`;
