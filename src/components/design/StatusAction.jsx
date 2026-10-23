import './design.css';

// A quiet action for a single status change (Tim, 23 Oct), e.g. an
// Outcome Objective milestone. The status sits on its own line ("Not
// yet" in the secondary text colour, or "Done" in mint), and under it a
// quiet underlined link that says what it does ("Mark as done", or "Mark
// as not done" once done). Never a tick box beside a title, and nothing
// beside a title bigger than the title. The link's tap area is 44px but
// doesn't push the layout.
export default function StatusAction({
  done,
  onChange,
  doneLabel = 'Done',
  notDoneLabel = 'Not yet',
  markDone = 'Mark as done',
  markNotDone = 'Mark as not done',
}) {
  return (
    <div className="ds-status-action">
      <p className={`ds-status-action-state${done ? ' ds-status-action-state--done' : ''}`} aria-live="polite">
        {done ? doneLabel : notDoneLabel}
      </p>
      <button type="button" className="ds-status-action-link" onClick={() => onChange(!done)}>
        {done ? markNotDone : markDone}
      </button>
    </div>
  );
}
