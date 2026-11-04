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
// rows:    [{ key, cells: { [column key]: text } }]
export default function ChartTable({ columns, rows, summary = 'Show as a table', caption }) {
  if (!rows?.length) return null;
  return (
    <div className="ds-ctable-fold">
      <Collapsible summary={summary}>
        <table className="ds-ctable">
          {caption && <caption className="ds-sr">{caption}</caption>}
          <thead>
            <tr>{columns.map((c) => <th key={c.key} scope="col">{c.label}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                {columns.map((c) => <td key={c.key} data-label={c.label}>{r.cells[c.key] ?? ''}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </Collapsible>
    </div>
  );
}
