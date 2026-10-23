import { Fragment, useState } from 'react';
import { parseDbTimestamp, formatDayMonthTime } from '../../lib/dateFormatter';
import pageText from '../../content/pageText';
import FilterPills from './FilterPills';
import { Button, PageHeader } from '../design';

// LIST ROW GUIDELINES (guidelines to apply by default; a mock-up wins
// where it shows a detail). On phone every row of every list is built
// the same way:
//   1. Title - left-aligned, wraps only between words.
//   2. Type label, then the status tag (Draft / Reviewed), then the
//      version chip (e.g. Version 1.2), all on one left-aligned line
//      that wraps cleanly. The version lives here, not on the date line.
//   3. Date and time (24 hour), then any count (e.g. 196 words), always
//      left-aligned directly under line 2.
//   4. One right-aligned action row beneath, with a small even gap
//      above it. The text action (Continue, Review, View review) is the
//      same size and weight as the type label; the icons are the same
//      size and spacing in every row.
//   Every element starts at the same left edge: no indents, no centring.
//   Desktop keeps its single-line row. Filters are the shared
//   FilterPills row: one line, swipes sideways, never wraps, no
//   dropdown.
//
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
// second row of pills (the same swipeable row at every width) once that
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
  const [visibleCount, setVisibleCount] = useState(DEFAULT_VISIBLE);

  const activeSubFilterList = subFilters[activeFilter];
  const allSubFilters = activeSubFilterList ? [{ id: 'all', label: 'All' }, ...activeSubFilterList] : null;

  if (error) {
    return (
      <div className="ui-root hlist-wrap">
        <HistoryListStyles />
        <div className="hlist-head">
          <div>
            {title && <PageHeader title={title} info={pageText[pageKey]} />}
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
          {title && <PageHeader title={title} info={pageText[pageKey]} />}
        </div>
        {newButton && (
          <Button icon="plus" className="hlist-new-desktop" onClick={newButton.onClick}>
            {newButton.label}
          </Button>
        )}
      </div>

      {allFilters.length > 0 && (
        <>
          <FilterPills
            label="Filter by type"
            filters={allFilters}
            active={activeFilter}
            countFor={(f) => countForFilter(rows, f)}
            onSelect={(id) => { setActiveFilter(id); setActiveSubFilter('all'); }}
          />
          {allSubFilters && (
            <FilterPills
              sub
              label="Filter by decision type"
              filters={allSubFilters}
              active={activeSubFilter}
              countFor={(f) => countForFilter(rows.filter((r) => rowMatchesFilter(r, activeFilterDef)), f)}
              onSelect={setActiveSubFilter}
            />
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
                        {row.version && <span className="hlist-version hlist-version--phone">{row.version}</span>}
                      </span>
                      <span className="hlist-row-meta">
                        <span>{formatDayMonthTime(row.date)}</span>
                        {row.version && <span className="hlist-version--desktop">{row.version}</span>}
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
                    ) : row.canEdit !== false ? (
                      <button
                        type="button"
                        className="hlist-icon-btn"
                        aria-label={`Edit ${row.title}`}
                        onClick={(e) => { e.stopPropagation(); onEdit?.(row); }}
                      >
                        <PencilIcon />
                      </button>
                    ) : null /* row.canEdit false: a type that is never edited (Wheel of Life check-ins) */}
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
          <Button icon="plus" onClick={newButton.onClick}>
            {newButton.label}
          </Button>
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
  /* A flex column, not display:block: Safari lays a <button>'s block
     children out in a shrink-to-fit box and centres it, so short lines
     (type label, date, word count) drifted to the middle while a long
     title looked left-aligned. Flex with align-items:flex-start keeps
     every line on the left edge. */
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  text-align: left;
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

/* Phone row anatomy (<= 768px), the same for every row of every list:
     line 1  title, wraps between words only
     line 2  type label, status tag (Draft / Reviewed), version chip
     line 3  date and time, then any count
     actions one right-aligned row beneath, small even gap above
   Everything starts at the same left edge: nothing is indented or
   centred. Selectors carry .ui-root so they always out-rank the base
   rules declared further down this sheet (the earlier version of this
   block lost that fight - the stack stayed centre-aligned - and
   mobile.css's 14px button font beat the action text). Desktop keeps
   its single line: see the base rules. */
.hlist-version--phone {
  display: none;
}

.hlist-version--phone,
.hlist-version--desktop {
  font-family: var(--font-display);
  font-weight: 400;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-size: 10px;
  color: var(--text-2);
}

@media (max-width: 768px) {
  .ui-root .hlist-row {
    flex-wrap: wrap;
    align-items: flex-start;
  }
  .ui-root .hlist-row-main {
    flex: 1 1 100%;
    align-items: flex-start;
    text-align: left;
    padding: var(--space-3) var(--space-2) var(--space-1) var(--space-3) !important;
  }
  .ui-root .hlist-row-sub {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    row-gap: var(--space-1);
    margin-top: var(--space-1);
    width: 100%;
  }
  .ui-root .hlist-row-tags,
  .ui-root .hlist-row-meta {
    justify-content: flex-start;
    align-items: center;
    margin: 0;
    text-align: left;
  }
  .ui-root .hlist-row-tags {
    flex-wrap: wrap;
    gap: var(--space-2);
    /* One line height whether or not a tag is present, so the date
       line sits at the same distance below the title in every row. */
    min-height: calc(var(--space-3) + var(--space-1));
  }
  .ui-root .hlist-row-tags .hlist-version--phone {
    display: inline-block;
    padding: 1px 8px;
    border: 1px solid var(--line);
    border-radius: var(--radius-pill);
    line-height: 1.4;
  }
  .ui-root .hlist-row-meta .hlist-version--desktop {
    display: none;
  }
  .ui-root .hlist-row-controls {
    flex: 1 1 100%;
    justify-content: flex-end;
    gap: var(--space-1);
    padding: 0 var(--space-1) var(--space-1) var(--space-3);
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
  font-size: 10px !important;
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
  font-size: 10px !important;
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

/* Phone (<= 768px): one structure for every list - see the single
   phone block above (title, tags, date, then one right-aligned action
   row). The older side-by-side phone rule that lived here fought with
   it (overflow-wrap: anywhere split dates mid-word, and a 14px offset
   on the controls left a gap), so it was removed. */
@media (max-width: 768px) {
  .hlist-row::before { display: none; }
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
  .hlist-ghost-btn,
  .hlist-seg-btn,
  .hlist-sort-link,
  .hlist-show-more,
  .hlist-icon-btn {
    transition: none !important;
  }
}
`;
