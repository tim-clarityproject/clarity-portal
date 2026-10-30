import './design.css';

// A note, never a task (writing rule 53; Tim, 23 Oct, 12:54): a soft
// panel with a small grey line saying what it is, the note itself in the
// text colour, and an optional small line after it saying what to do
// with it. No tick box, no tag and no row look, so it can never be read
// as one more thing on a list (M5 "Last night you also wrote this note.").
//
// label: "Last night you also wrote this note."
// after: "If it needs doing, add it as a to-do."
export default function NotePanel({ label, children, after, className = '' }) {
  return (
    <div className={`ds-note ${className}`.trim()} role="note">
      {label && <p className="ds-note-label">{label}</p>}
      <p className="ds-note-text">{children}</p>
      {after && <p className="ds-note-label ds-note-after">{after}</p>}
    </div>
  );
}
