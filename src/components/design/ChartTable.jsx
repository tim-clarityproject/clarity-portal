import { useId, useState } from 'react';
import Collapsible from './Collapsible';
import './design.css';

// "Show as a table" (graphs rule, START-HERE 53; Phase 5): every chart can
// be read as words, so nothing depends on colour or on pointing. One
// shared part: a quiet fold under the chart, closed until opened, holding
// a plain table with thin lines between rows and a grey header row.
// Columns keep their width and cell text wraps (CLAUDE.md rule 20); under
// about 600px each row becomes a small card with the column names.
//
// columns: [{ key, label }]
// rows:    [{ key, cells: { [column key]: text or a part } }]
// rowHead: the first column names each row (a person and their role), so
//          it is the row's heading for screen readers; with it the table
//          takes M10's look (the name at body size, 12px above and below)
//          and stays a table on a phone, where its few narrow columns fit.
// link:    the way in is a quiet text link under the chart, "Show as a
//          table", which reads "Hide the table" while it is open (M10, 13
//          Nov), in place of the fold with its arrow. It says it opens
//          something in place (aria-expanded), so the page keeps its place
//          (rule 29aq).
function Table({ columns, rows, caption, rowHead }) {
  return (
    <table className={`ds-ctable${rowHead ? ' ds-ctable--people' : ''}`}>
      {caption && <caption className="ds-sr">{caption}</caption>}
      <thead>
        <tr>{columns.map((c) => <th key={c.key} scope="col">{c.label}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key}>
            {columns.map((c, i) => (rowHead && i === 0
              ? <th key={c.key} scope="row">{r.cells[c.key] ?? ''}</th>
              : <td key={c.key} data-label={c.label}>{r.cells[c.key] ?? ''}</td>))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function LinkedTable({ summary, hideSummary, children }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="ds-ctable-fold ds-ctable-fold--link">
      <button type="button" className="ds-link" aria-expanded={open} aria-controls={id} onClick={() => setOpen((v) => !v)}>
        {open ? hideSummary : summary}
      </button>
      <div id={id} className="ds-ctable-opened" hidden={!open}>{open && children}</div>
    </div>
  );
}

export default function ChartTable({ columns, rows, summary = 'Show as a table', hideSummary = 'Hide the table', caption, rowHead = false, link = false }) {
  if (!rows?.length) return null;
  const table = <Table columns={columns} rows={rows} caption={caption} rowHead={rowHead} />;
  if (link) return <LinkedTable summary={summary} hideSummary={hideSummary}>{table}</LinkedTable>;
  return (
    <div className="ds-ctable-fold">
      <Collapsible summary={summary}>{table}</Collapsible>
    </div>
  );
}
