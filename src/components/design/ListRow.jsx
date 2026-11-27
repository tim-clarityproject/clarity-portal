import './design.css';

// Lists (design reference: Lists; decisions: "Lists"). Each row shows
// the title and date only, with the type as a small grey word. No
// buttons on rows: the whole row is the button that opens it.
export function List({ children, label, className = '' }) {
  return (
    <ul className={`ds-list ${className}`.trim()} aria-label={label}>
      {children}
    </ul>
  );
}

// Without onClick a row is only words (M19's Close the day: "two labelled
// lists, so nothing looks tappable that isn't").
export function ListRow({ title, type, date, onClick, ...rest }) {
  if (!onClick) {
    return (
      <li>
        <div className="ds-row ds-row--still" {...rest}>
          <span className="ds-row-main">
            <span className="ds-row-title">{title}</span>
            {type && <span className="ds-row-type">{type}</span>}
          </span>
          {date && <span className="ds-row-date">{date}</span>}
        </div>
      </li>
    );
  }
  return (
    <li>
      <button type="button" className="ds-row" onClick={onClick} {...rest}>
        <span className="ds-row-main">
          <span className="ds-row-title">{title}</span>
          {type && <span className="ds-row-type">{type}</span>}
        </span>
        {date && <span className="ds-row-date">{date}</span>}
      </button>
    </li>
  );
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * A saved item's own name (Polish 1, "My plans and My reviews repeat 'Daily
 * plan' as their own subtitle"): a row never says the same words twice, so
 * an older Daily plan or Daily review, whose name would repeat its tool, is
 * named by its day ("Monday’s plan"), the tool staying under it.
 * dateKey: the item's own day, "YYYY-MM-DD".
 */
export function rowName(title, type, dateKey) {
  if (!title || title !== type || typeof dateKey !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(dateKey)) return title;
  const kind = type === 'Daily plan' ? 'plan' : type === 'Daily review' ? 'review' : null;
  if (!kind) return title;
  const [y, m, d] = dateKey.slice(0, 10).split('-').map(Number);
  return `${WEEKDAYS[new Date(y, m - 1, d).getDay()]}’s ${kind}`;
}
