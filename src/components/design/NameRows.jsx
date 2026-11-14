import { IconButton } from './Button';
import './design.css';

// A list people build themselves, one row each: the name, a quiet line
// under it, and the 45 degree crosshair to take the row away (M10's "Who
// reports to you?"; rule 30: lists are rows). The page owns the list and
// its "Deleted" with Undo.
//
//   rows:        [{ id, title, sub }]
//   onRemove:    (row, index) => …
//   removeLabel: (row) => what a screen reader hears ("Remove Priya Shah")
//   label:       the list's name for screen readers
export default function NameRows({ rows, onRemove, removeLabel = (row) => `Remove ${row.title}`, label }) {
  if (!rows?.length) return null;
  return (
    <ul className="ds-namerows" aria-label={label}>
      {rows.map((row, i) => (
        <li key={row.id} className="ds-namerow">
          <span className="ds-namerow-words">
            <b>{row.title}</b>
            {row.sub && <small>{row.sub}</small>}
          </span>
          {onRemove && <IconButton label={removeLabel(row)} onClick={() => onRemove(row, i)} />}
        </li>
      ))}
    </ul>
  );
}
