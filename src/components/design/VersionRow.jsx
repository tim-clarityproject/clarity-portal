import './design.css';

// One dated version in a list (M7's team list): its name in words ("October
// Health Check"), one quiet line under it (its headline), and the date on
// the right. The whole row opens it; on hover the name turns coral. Rows in
// a list look alike (5e rule 5).
//
//   <VersionList label="Leadership team">
//     <VersionRow name="October Health Check" line="2 of 5 important projects are moving well." date="Tue 27 Oct" onClick={…} />
//   </VersionList>
export function VersionList({ label, children }) {
  return <ul className="ds-version-list" aria-label={label}>{children}</ul>;
}

export default function VersionRow({ name, line, date, onClick }) {
  return (
    <li>
      <button type="button" className="ds-version-row" onClick={onClick}>
        <span className="ds-version-main">
          <b>{name}</b>
          {line && <small>{line}</small>}
        </span>
        {date && <span className="ds-version-date">{date}</span>}
      </button>
    </li>
  );
}
