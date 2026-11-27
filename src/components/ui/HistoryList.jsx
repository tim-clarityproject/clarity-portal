import { Fragment, useState } from 'react';
import { parseDbTimestamp, formatDayMonthTime } from '../../lib/dateFormatter';
import { noMatchLine, searchRows } from '../../lib/savedItems';
import { Button, Card, Chevron, Dropdown, EmptyState, FilterButton, PageOpening, SearchField, keepsHappeningLine, useCoach } from '../design';
import { rowName } from '../design/ListRow';

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
// Shared history list: My plans, My reviews and My journals. Driven only
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
// A filter may instead carry its own `match(row)` predicate (My plans and
// My reviews filter by area).
//
// `subFilters`: an optional map of parent filter id -> a second array of
// {id,label[,match]} filter defs, a second drop-down once that parent is
// chosen (My plans: "Which tool?" under Personal, "Which team?" under
// Strategic; `subLabels` names it). `initialFilter` and
// `initialSubFilter` open the list already filtered (a hub's "Open My
// Plans" link, an old address).
//
// `search` (My plans and My reviews, Phase 5 step 4): { label,
// placeholder } turns on a search box with the Filter button, which
// keeps the rows whose name or tool hold every word typed, on top of the
// filters, from the rows already on the device (so offline too).
// `initialSearch` opens it already searched (?q=).
const DEFAULT_VISIBLE = 50;



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
  line,
  rows = [],
  filters = [],
  subFilters = {},
  subLabels = {},
  filterLabel = 'Which type?',
  initialFilter = 'all',
  initialSubFilter = 'all',
  search,
  initialSearch = '',
  newButton,
  emptyText = 'Nothing here yet.',
  error,
  onOpen,
  onEdit,
  onReview,
}) {
  const allFilters = filters.length ? [{ id: 'all', label: 'All' }, ...filters] : [];
  const [activeFilter, setActiveFilter] = useState(() => (allFilters.some((f) => f.id === initialFilter) ? initialFilter : 'all'));
  const [activeSubFilter, setActiveSubFilter] = useState(() => (
    (subFilters[initialFilter] || []).some((f) => f.id === initialSubFilter) ? initialSubFilter : 'all'
  ));
  const [searchText, setSearchText] = useState(() => (search ? initialSearch || '' : ''));
  const [sortOrder, setSortOrder] = useState('new'); // 'new' | 'old'
  const [visibleCount, setVisibleCount] = useState(DEFAULT_VISIBLE);

  const coach = useCoach();
  const activeSubFilterList = subFilters[activeFilter];
  const allSubFilters = activeSubFilterList ? [{ id: 'all', label: 'All' }, ...activeSubFilterList] : null;

  if (error) {
    return (
      <div className="ui-root hlist-wrap">
        <HistoryListStyles />
        {title && <PageOpening title={title} line={line} />}
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

  const searching = Boolean(search && searchText.trim());
  const filtered = searchRows(rows.filter((r) => (
    rowMatchesFilter(r, activeFilterDef) && (!activeSubFilterDef || rowMatchesFilter(r, activeSubFilterDef))
  )), searching ? searchText : '');
  const sorted = [...filtered].sort((a, b) => (sortOrder === 'new' ? rowTime(b) - rowTime(a) : rowTime(a) - rowTime(b)));
  const visible = sorted.slice(0, visibleCount);
  const hasMore = sorted.length > visible.length;

  // "Showing Decisions, GROW." under the Filter button, or nothing applied.
  const appliedText = activeFilter === 'all' ? '' : [
    activeFilterDef?.label,
    activeSubFilter !== 'all' ? activeSubFilterDef?.label : null,
  ].filter(Boolean).join(', ');

  return (
    <div className={`ui-root hlist-wrap${rows.some((r) => (onReview && r.canReview) || (onEdit && r.isDraft && r.canEdit !== false)) ? '' : ' hlist-wrap--noactions'}`}>
      <HistoryListStyles />

      {/* Polish 1 (rule 12): the page opening, its one main button the list's "New plan". */}
      {title && <PageOpening title={title} line={line} action={newButton ? <NewButton newButton={newButton} /> : null} />}

      {search && rows.length > 0 && (
        <SearchField
          className="hlist-search"
          label={search.label}
          placeholder={search.placeholder}
          value={searchText}
          onChange={(v) => { setSearchText(v); setVisibleCount(DEFAULT_VISIBLE); }}
        />
      )}

      {allFilters.length > 0 && (
        <FilterButton
          applied={appliedText}
          searchFor={searching ? searchText : ''}
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

      {/* Nothing matches: the one calm line says it, with no "0 entries" or sort beside it (Tim, 5 Nov). */}
      {filtered.length > 0 && (
      <div className="hlist-tools">
        <span>{filtered.length} {filtered.length === 1 ? 'entry' : 'entries'}</span>
        <button type="button" className="hlist-sort-link ds-hlist-btn" onClick={() => setSortOrder((o) => (o === 'new' ? 'old' : 'new'))}>
          {sortOrder === 'new' ? 'Newest first' : 'Oldest first'}
          {/* The one chevron (Tim, 26 Oct): down for newest first, up for oldest first. */}
          <Chevron direction={sortOrder === 'new' ? 'down' : 'up'} size="sm" beside="words" />
        </button>
      </div>
      )}

      {filtered.length === 0 ? (
        <div className="hlist-empty">
          <EmptyState as="p" question={rows.length === 0 ? emptyText : searching ? noMatchLine(searchText) : 'Nothing of this type yet.'} />
        </div>
      ) : (
        <>
          {/* One card a month (Polish 1, rule 13): the month as its label, the rows as hairline rows. */}
          {monthGroups(visible).map(({ month, rows: monthRows }) => (
            <Card key={month || 'none'} label={month} className="hlist-card">
              {monthRows.map((row) => {
                const canReview = Boolean(onReview && row.canReview);
                const canContinue = Boolean(onEdit && row.isDraft && row.canEdit !== false);
                // No icons in rows (Tim, 5 Nov): every row is the same height;
                // editing and deleting sit inside the item once opened.
                return (
                  <div className="hlist-row" key={row.id}>
                    <button type="button" className="hlist-row-main ds-li ds-hlist-btn" onClick={() => onOpen?.(row)}>
                      <span className="hlist-row-title">{rowName(row.title, row.typeLabel, typeof row.date === 'string' ? row.date : null)}</span>
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
                    <div className={`hlist-row-controls${canReview || canContinue ? '' : ' hlist-row-controls--empty'}`}>
                      {canReview && (
                        <button
                          type="button"
                          className="hlist-review-btn ds-hlist-btn"
                          onClick={(e) => { e.stopPropagation(); onReview(row); }}
                        >
                          {row.reviewed ? 'View review' : 'Review'}
                        </button>
                      )}
                      {canContinue && (
                        <button
                          type="button"
                          className="hlist-continue-btn ds-hlist-btn"
                          onClick={(e) => { e.stopPropagation(); onEdit(row); }}
                        >
                          Continue
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </Card>
          ))}

          {hasMore && (
            <div className="hlist-show-more-wrap">
              <Button variant="text" onClick={() => setVisibleCount(sorted.length)}>
                Show more
              </Button>
            </div>
          )}
        </>
      )}

    </div>
  );
}

/** The visible rows in their months, in order ("November 2026"). */
function monthGroups(rows) {
  const groups = [];
  rows.forEach((row) => {
    const month = formatMonthHeading(rowTime(row));
    const last = groups[groups.length - 1];
    if (last && last.month === month) last.rows.push(row);
    else groups.push({ month, rows: [row] });
  });
  return groups;
}

function HistoryListStyles() {
  return <style>{HLIST_CSS}</style>;
}

// Inline so the component is a single-file drop-in, same pattern already
// used by Toast.jsx elsewhere in this codebase. Values
// with no matching token are called out in the task summary.
const HLIST_CSS = `
/* Polish 1, Stage B (B1): the lists to the 25 Nov reference. The opening is PageOpening; each month is
   one card (rule 13) with the month as its 13px grey label; the rows are hairline rows (rule 14): the
   name 16px at 500 on the left, the date 13px grey on the right on a laptop and under the name on a
   phone, the tool and its tags 13px grey under the name. No coloured side line, no sliding, no coral.
   The row's button carries the shared row's class (.ds-li) so it is read as the list row it is; the
   rules here (the same weight, later in the page) shape it. */
.hlist-wrap { width: 100%; box-sizing: border-box; }

.ui-root .hlist-search { margin-bottom: var(--space-3); }

.hlist-tools {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-3);
  margin: var(--space-3) 0 var(--space-2);
  font-size: var(--fs-meta);
  color: var(--text-2);
}

.ui-root .hlist-sort-link {
  display: inline-flex;
  align-items: center;
  gap: var(--icon-gap);
  min-height: var(--tap-min);
  padding: 0 !important;
  background: transparent;
  border: none;
  font-size: var(--fs-meta) !important;
  color: var(--text-2);
  cursor: pointer;
  transition: color var(--dur) var(--ease);
}

.ui-root .hlist-sort-link .ds-chevron-line { --chev-nudge: 0.2px; }

.ui-root .hlist-sort-link:hover,
.ui-root .hlist-sort-link:focus-visible { color: var(--text); }

.ui-root .hlist-sort-link:focus-visible {
  outline: var(--focus-w) solid var(--text);
  outline-offset: var(--space-px2);
}

.hlist-empty,
.hlist-error {
  padding: var(--space-4) 0;
  color: var(--text-2);
  font-size: var(--fs-text);
}

.hlist-error p { margin: 0 0 var(--space-3); }

/* Row */
.ui-root .hlist-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  border-top: var(--line-w) solid var(--line-soft);
}

.ui-root .ds-card-head + .hlist-row { border-top: 0; }

.ui-root .hlist-row-main {
  all: unset;
  box-sizing: border-box;
  cursor: pointer;
  border-top: 0;
  flex: 1;
  min-width: 0;
  padding: var(--card-row-y) 0 !important;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  column-gap: var(--space-3);
  align-items: baseline;
  align-content: center;
  text-align: left;
  min-height: var(--tap-min);
}

.ui-root .ds-card-head + .hlist-row .hlist-row-main { padding-top: var(--space-px6) !important; }
.ui-root .hlist-card > .hlist-row:last-child .hlist-row-main { padding-bottom: 0 !important; }

.ui-root .hlist-row-main:focus-visible {
  outline: var(--focus-w) solid var(--text);
  outline-offset: var(--space-px2);
  border-radius: var(--radius-control);
}

.ui-root .hlist-row-title {
  display: block;
  font-size: var(--fs-text);
  font-weight: var(--fw-medium);
  line-height: 1.4;
  color: var(--text);
  max-width: 100%;
  white-space: normal;
  overflow-wrap: break-word;
  word-break: normal;
  hyphens: none;
}

.ui-root .hlist-row-main:hover .hlist-row-title { text-decoration: underline; text-underline-offset: 4px; text-decoration-thickness: 1px; }

.ui-root .hlist-row-date {
  grid-column: 2;
  grid-row: 1;
  font-size: var(--fs-meta);
  line-height: 1.4;
  color: var(--text-2);
  white-space: nowrap;
}

.ui-root .hlist-row-main .hlist-row-sub { grid-column: 1; }

.ui-root :is(.hlist-version, .hlist-draft-tag, .hlist-reviewed-tag) {
  display: inline-block;
  padding: 0 var(--space-2);
  border: var(--line-w) solid var(--line);
  border-radius: var(--radius-control);
  font-family: var(--font-body);
  font-weight: var(--fw-regular);
  letter-spacing: normal;
  font-size: var(--fs-meta);
  line-height: 1.5;
  color: var(--text-2);
}

.ui-root .hlist-reviewed-tag { color: var(--mint-text); border-color: var(--good); }

.ui-root .hlist-wrap--noactions .hlist-row-controls { display: none; }

.ui-root .hlist-row-controls {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-1);
  flex-shrink: 0;
  min-width: var(--hlist-actions-w);
}

.ui-root :is(.hlist-continue-btn, .hlist-review-btn) {
  all: unset;
  cursor: pointer;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  min-height: var(--tap-min);
  padding: 0 var(--space-2) !important;
  font-family: var(--font-body);
  font-weight: var(--fw-regular);
  letter-spacing: normal;
  font-size: var(--fs-meta) !important;
  color: var(--text-2);
  text-decoration: underline;
  text-underline-offset: 4px;
  text-decoration-thickness: 1px;
  white-space: nowrap;
  transition: color var(--dur-fast) var(--ease);
}

.ui-root .hlist-continue-btn { color: var(--text); }

.ui-root :is(.hlist-continue-btn, .hlist-review-btn):hover,
.ui-root :is(.hlist-continue-btn, .hlist-review-btn):focus-visible { color: var(--text); }

.ui-root :is(.hlist-continue-btn, .hlist-review-btn):focus-visible {
  outline: var(--focus-w) solid var(--text);
  outline-offset: var(--space-px2);
  border-radius: var(--radius-control);
}

.ui-root .hlist-row-sub {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  column-gap: var(--space-3);
  row-gap: var(--space-1);
  margin-top: var(--space-1);
}

.ui-root .hlist-row-tags {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}

.ui-root .hlist-row-meta {
  font-size: var(--fs-meta);
  color: var(--text-2);
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  align-items: center;
}

.ui-root .hlist-row-tags b {
  font-family: var(--font-body);
  font-weight: var(--fw-regular);
  letter-spacing: normal;
  font-size: var(--fs-meta);
  color: var(--text-2);
}

/* A phone: the date goes under the name (rule 14), every line on one left edge; any action sits
   on its own line under the row, at its right. */
@media (max-width: 768px) {
  .ui-root .hlist-row { flex-wrap: wrap; align-items: flex-start; row-gap: 0; }
  .ui-root .hlist-row-main { flex: 1 1 100%; grid-template-columns: minmax(0, 1fr); }
  .ui-root .hlist-row-date { grid-column: 1; grid-row: auto; order: 3; margin-top: var(--space-1); }
  .ui-root .hlist-row-controls--empty { display: none; }
  .ui-root .hlist-row-controls { min-width: 0; flex: 1 1 100%; padding: 0 0 var(--space-1) 0; }
}

.hlist-show-more-wrap {
  display: flex;
  justify-content: flex-start;
  margin-top: var(--space-3);
}

@media (prefers-reduced-motion: reduce) {
  .ui-root .hlist-sort-link, .ui-root .hlist-continue-btn, .ui-root .hlist-review-btn { transition: none !important; }
}
`;

// "New plan", "New review", "New journal", "Continue today": a plain
// button. It opens a tool rather than adding a row to the list under it,
// so it is never the add row (Tim, 18 Nov).
function NewButton({ newButton, className = '' }) {
  return <Button variant="primary" className={className} onClick={newButton.onClick}>{newButton.label}</Button>;
}
