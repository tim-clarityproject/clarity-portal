import { Fragment, useState } from 'react';
import { parseDbTimestamp, formatDayMonthTime } from '../../lib/dateFormatter';
import pageText from '../../content/pageText';
import { Button, Chevron, Dropdown, EmptyState, FilterButton, PageHeader, keepsHappeningLine, useCoach } from '../design';

// LIST ROW GUIDELINES (CLAUDE.md "List row guidelines"; a mock-up or a
// newer decision wins where it shows a detail). Every row of every list:
//   1. The name in words, left, wrapping only between words, and the date
//      on the right of it (writing rule 60, Tim 23 Oct, 19:51, newer than
//      the guidelines' date line; M3's recent rows). Never a date as the
//      name: the caller names its rows.
//   2. The tool, then the status tag (Draft / Reviewed), then the version
//      chip (e.g. Version 1.2), on one left-aligned line that wraps
//      cleanly.
//   3. Any count (e.g. 196 words), left-aligned under line 2.
//   4. On a phone, one right-aligned action row beneath, with a small even
//      gap above it; on a laptop the actions sit at the right of the row.
//      The text action (Continue, Review, View review) is the same size
//      and weight as the tool; the icons are the same size and spacing in
//      every row. A row with nothing to do has no action row.
//   Every element starts at the same left edge: no indents, no centring.
//   Filters sit behind the one Filter button, with one line saying what is
//   applied and Clear (guideline 6).
//
// Shared history list: My Plans, My Reviews and My Journals. Driven only
// by props: no data fetching, no Supabase calls, no navigation of its
// own. The caller supplies rows, decides what "open"/"edit"/"delete"
// mean, and renders its own dialogs/toasts around this component.
//
// A row: { id, title, typeLabel, date, dateLabel?, sortAt?, isDraft,
// reviewed, version, meta, canEdit, canDelete, canReview }. `dateLabel`
// is the date as shown ("Today", "Mon 19 Oct"); without one the saved
// timestamp is shown as "14 Oct, 19:26". `sortAt` (milliseconds) orders
// the rows and their month headings; without one `date` does.
//
// Row -> filter matching: by default a filter's `id` is matched against
// each row's own `typeLabel`, and the id 'all' always matches every row.
// A filter may instead carry its own `match(row)` predicate (My Plans and
// My Reviews filter by area).
//
// `subFilters`: an optional map of parent filter id -> a second array of
// {id,label[,match]} filter defs, a second drop-down once that parent is
// chosen (My Plans: "Which tool?" under Personal, "Which team?" under
// Strategic; `subLabels` names it). `initialFilter` and
// `initialSubFilter` open the list already filtered (a hub's "Open My
// Plans" link, an old address).
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

function rowTime(row) {
  if (typeof row.sortAt === 'number') return row.sortAt;
  const t = parseDbTimestamp(row.date).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function formatMonthHeading(time) {
  const date = new Date(time);
  if (!time || Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

function rowMatchesFilter(row, filterDef) {
  if (!filterDef || filterDef.id === 'all') return true;
  if (filterDef.match) return filterDef.match(row);
  return row.typeLabel === filterDef.id;
}

function countText(n) {
  return `${n} ${n === 1 ? 'entry' : 'entries'}`;
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
  subLabels = {},
  filterLabel = 'Which type?',
  initialFilter = 'all',
  initialSubFilter = 'all',
  newButton,
  emptyText = 'Nothing here yet.',
  error,
  onOpen,
  onEdit,
  onDelete,
  onReview,
}) {
  const allFilters = filters.length ? [{ id: 'all', label: 'All' }, ...filters] : [];
  const [activeFilter, setActiveFilter] = useState(() => (allFilters.some((f) => f.id === initialFilter) ? initialFilter : 'all'));
  const [activeSubFilter, setActiveSubFilter] = useState(() => (
    (subFilters[initialFilter] || []).some((f) => f.id === initialSubFilter) ? initialSubFilter : 'all'
  ));
  const [sortOrder, setSortOrder] = useState('new'); // 'new' | 'old'
  const [visibleCount, setVisibleCount] = useState(DEFAULT_VISIBLE);

  const coach = useCoach();
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
          <p>{error.message || 'That didn’t load. Check your connection and try again.'}</p>
          <p>{keepsHappeningLine(coach)}</p>
          {error.onRetry && (
            <Button onClick={error.onRetry}>Try again</Button>
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
  const sorted = [...filtered].sort((a, b) => (sortOrder === 'new' ? rowTime(b) - rowTime(a) : rowTime(a) - rowTime(b)));
  const visible = sorted.slice(0, visibleCount);
  const hasMore = sorted.length > visible.length;

  // "Showing Decisions, GROW." under the Filter button, or nothing applied.
  const appliedText = activeFilter === 'all' ? '' : [
    activeFilterDef?.label,
    activeSubFilter !== 'all' ? activeSubFilterDef?.label : null,
  ].filter(Boolean).join(', ');

  let lastMonth = '';

  return (
    <div className="ui-root hlist-wrap">
      <HistoryListStyles />

      <div className="hlist-head">
        <div>
          {title && <PageHeader title={title} info={pageText[pageKey]} />}
        </div>
        {newButton && (
          <Button icon={newButton.icon === undefined ? 'plus' : newButton.icon} className="hlist-new-desktop" onClick={newButton.onClick}>
            {newButton.label}
          </Button>
        )}
      </div>

      {allFilters.length > 0 && (
        <FilterButton
          applied={appliedText}
          onClear={() => { setActiveFilter('all'); setActiveSubFilter('all'); }}
        >
          <Dropdown
            label={filterLabel}
            options={allFilters.map((f) => ({ value: f.id, label: f.label, hint: countText(countForFilter(rows, f)) }))}
            value={activeFilter}
            onChange={(id) => { setActiveFilter(id); setActiveSubFilter('all'); }}
          />
          {allSubFilters && (
            <Dropdown
              label={subLabels[activeFilter] || `Which kind of ${activeFilterDef.label.toLowerCase()}?`}
              options={allSubFilters.map((f) => ({
                value: f.id,
                label: f.label,
                hint: countText(countForFilter(rows.filter((r) => rowMatchesFilter(r, activeFilterDef)), f)),
              }))}
              value={activeSubFilter}
              onChange={setActiveSubFilter}
            />
          )}
        </FilterButton>
      )}

      <div className="hlist-tools">
        <span>{filtered.length} {filtered.length === 1 ? 'entry' : 'entries'}</span>
        <button type="button" className="hlist-sort-link" onClick={() => setSortOrder((o) => (o === 'new' ? 'old' : 'new'))}>
          {sortOrder === 'new' ? 'Newest first' : 'Oldest first'}
          {/* The one chevron (Tim, 26 Oct): down for newest first, up for oldest first. */}
          <Chevron direction={sortOrder === 'new' ? 'down' : 'up'} size="sm" />
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="hlist-empty">
          <EmptyState as="p" question={rows.length === 0 ? emptyText : 'Nothing of this type yet.'} />
        </div>
      ) : (
        <>
          {visible.map((row) => {
            const mm = formatMonthHeading(rowTime(row));
            const showMonth = mm !== lastMonth;
            lastMonth = mm;
            const canReview = Boolean(onReview && row.canReview);
            const canContinue = Boolean(onEdit && row.isDraft && row.canEdit !== false);
            const canPencil = Boolean(onEdit && !row.isDraft && row.canEdit !== false);
            const canBin = Boolean(onDelete && row.canDelete !== false);
            return (
              <Fragment key={row.id}>
                {showMonth && <div className="hlist-month">{mm}</div>}
                <div className="hlist-row">
                  <button type="button" className="hlist-row-main" onClick={() => onOpen?.(row)}>
                    <span className="hlist-row-title">{row.title}</span>
                    <span className="hlist-row-date">{row.dateLabel ?? formatDayMonthTime(row.date)}</span>
                    <span className="hlist-row-sub">
                      <span className="hlist-row-tags">
                        <b>{row.typeLabel}</b>
                        {row.isDraft && <span className="hlist-draft-tag">Draft</span>}
                        {row.reviewed && <span className="hlist-reviewed-tag">Reviewed</span>}
                        {row.version && <span className="hlist-version">{row.version}</span>}
                      </span>
                      {row.meta && <span className="hlist-row-meta"><span>{row.meta}</span></span>}
                    </span>
                  </button>
                  {/* Always there on a laptop, empty or not, so every row's
                      date lines up; a phone shows no empty action row. */}
                  <div className={`hlist-row-controls${canReview || canContinue || canPencil || canBin ? '' : ' hlist-row-controls--empty'}`}>
                    {canReview && (
                      <button
                        type="button"
                        className="hlist-review-btn"
                        onClick={(e) => { e.stopPropagation(); onReview(row); }}
                      >
                        {row.reviewed ? 'View review' : 'Review'}
                      </button>
                    )}
                    {canContinue && (
                      <button
                        type="button"
                        className="hlist-continue-btn"
                        onClick={(e) => { e.stopPropagation(); onEdit(row); }}
                      >
                        Continue
                      </button>
                    )}
                    {canPencil && (
                      <button
                        type="button"
                        className="hlist-icon-btn"
                        aria-label={`Edit ${row.title}`}
                        onClick={(e) => { e.stopPropagation(); onEdit(row); }}
                      >
                        <PencilIcon />
                      </button>
                    )}
                    {canBin && (
                      <button
                        type="button"
                        className="hlist-icon-btn hlist-icon-btn--del"
                        aria-label={`Delete ${row.title}`}
                        onClick={(e) => { e.stopPropagation(); onDelete(row); }}
                      >
                        <BinIcon />
                      </button>
                    )}
                  </div>
                </div>
              </Fragment>
            );
          })}

          {hasMore && (
            <div className="hlist-show-more-wrap">
              <Button variant="text" onClick={() => setVisibleCount(sorted.length)}>
                Show more
              </Button>
            </div>
          )}
        </>
      )}

      {newButton && (
        <div className="hlist-new-phone-wrap">
          <Button icon={newButton.icon === undefined ? 'plus' : newButton.icon} onClick={newButton.onClick}>
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
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--space-3);
  margin-bottom: var(--space-4);
}
.hlist-head > div { min-width: 0; max-width: 100%; }

.hlist-new-phone-wrap {
  display: none;
  margin-top: var(--space-4);
  justify-content: center;
}

@media (max-width: 768px) {
  .ui-root .hlist-head .hlist-new-desktop { display: none !important; }
  .hlist-new-phone-wrap { display: flex; }
}

.hlist-tools {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-3);
  margin: 22px 0 4px;
  font-size: calc(13 * var(--u, 1px));
  color: var(--placeholder);
}

.ui-root .hlist-sort-link {
  display: inline-flex;
  align-items: center;
  gap: var(--icon-gap);
  min-height: var(--tap-min);
  padding: 0 !important;
  background: transparent;
  border: none;
  font-size: calc(13 * var(--u, 1px)) !important;
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
  letter-spacing: var(--ls-section-title);
  font-size: var(--fs-section-title);
  color: var(--text);
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
  .hlist-row:hover .hlist-row-date,
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
  /* A grid, not display:block: Safari lays a <button>'s block children
     out in a shrink-to-fit box and centres it. The name and the date
     share the first line (writing rule 60); the tool line and any count
     sit under the name, every line on the same left edge. */
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  column-gap: var(--space-3);
  align-items: baseline;
  align-content: center;
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
  font-size: calc(17 * var(--u, 1px));
  color: var(--text);
  line-height: 1.3;
  /* Wraps between words only - a date title never breaks mid-word.
     (overflow-wrap: break-word only splits a single word that is
     longer than the whole line.) */
  max-width: 100%;
  white-space: normal;
  overflow-wrap: break-word;
  word-break: normal;
  hyphens: none;
  transition: transform var(--dur) var(--ease), color var(--dur) var(--ease);
}

.hlist-row-date {
  grid-column: 2;
  grid-row: 1;
  font-size: var(--fs-meta);
  line-height: 1.3;
  color: var(--text-2);
  white-space: nowrap;
  transition: transform var(--dur) var(--ease);
}

.ui-root .hlist-row-main .hlist-row-sub {
  grid-column: 1;
}

.hlist-version {
  display: inline-block;
  padding: 1px 8px;
  border: 1px solid var(--line);
  border-radius: var(--radius-pill);
  font-family: var(--font-display);
  font-weight: 400;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-size: calc(10 * var(--u, 1px));
  color: var(--text-2);
  line-height: 1.4;
}

.hlist-draft-tag {
  display: inline-block;
  padding: 1px 8px;
  border: 1px solid var(--line);
  border-radius: var(--radius-pill);
  font-family: var(--font-display);
  font-weight: 400;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-size: calc(10 * var(--u, 1px));
  color: var(--text-2);
  line-height: 1.4;
}

.hlist-reviewed-tag {
  display: inline-block;
  padding: 1px 8px;
  border: 1px solid var(--good);
  border-radius: var(--radius-pill);
  font-family: var(--font-display);
  font-weight: 400;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-size: calc(10 * var(--u, 1px));
  color: var(--mint-text);
  line-height: 1.4;
}

.hlist-row-controls {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-1);
  flex-shrink: 0;
  min-width: var(--hlist-actions-w);
}

/* Phone row anatomy (<= 768px), the same for every row of every list:
     line 1  name, wraps between words only, and the date on the right
     line 2  tool, status tag (Draft / Reviewed), version chip
     line 3  any count
     actions one right-aligned row beneath, small even gap above (none
             when the row has nothing to do)
   Everything starts at the same left edge: nothing is indented or
   centred. Selectors carry .ui-root so they always out-rank the base
   rules declared further down this sheet (the earlier version of this
   block lost that fight - the stack stayed centre-aligned - and
   mobile.css's 14px button font beat the action text). On a laptop the
   actions sit at the right of the row: see the base rules. */
@media (max-width: 768px) {
  .ui-root .hlist-row {
    flex-wrap: wrap;
    align-items: flex-start;
  }
  .ui-root .hlist-row-main {
    flex: 1 1 100%;
    text-align: left;
    padding: var(--space-3) var(--space-2) var(--space-1) var(--space-3) !important;
  }
  .ui-root .hlist-row-controls--empty {
    display: none;
  }
  .ui-root .hlist-row-main:has(+ .hlist-row-controls--empty) {
    padding-bottom: var(--space-3) !important;
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
  .ui-root .hlist-row-controls {
    min-width: 0;
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
  font-size: calc(10 * var(--u, 1px)) !important;
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
  font-size: calc(10 * var(--u, 1px)) !important;
  white-space: nowrap;
  transition: color var(--dur-fast) var(--ease);
}

.ui-root .hlist-review-btn:hover,
.ui-root .hlist-review-btn:focus-visible {
  color: var(--text);
}

.ui-root .hlist-review-btn:focus-visible {
  outline: 2px solid var(--coral);
  outline-offset: 2px;
  border-radius: 4px;
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
  font-size: calc(13 * var(--u, 1px));
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
  font-size: calc(10 * var(--u, 1px));
  color: var(--text-2);
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

@media (prefers-reduced-motion: reduce) {
  .hlist-row,
  .hlist-row::before,
  .hlist-row-title,
  .hlist-row-meta,
  .hlist-sort-link,
  .hlist-icon-btn {
    transition: none !important;
  }
}
`;
