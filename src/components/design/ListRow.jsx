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

export function ListRow({ title, type, date, onClick, ...rest }) {
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
