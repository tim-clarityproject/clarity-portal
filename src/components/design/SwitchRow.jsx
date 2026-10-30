import { useId } from 'react';
import './design.css';

// A switch with its words (M1 debrief summary, "Share with Tim"): the
// words on the left (a short label, then one grey line saying what
// switching it on does) and the shared switch on the right, mint when on.
// The whole row reads as one switch to a screen reader; the switch has a
// 44px tap area.
//
// label: "Share with Tim"; note: "Tim will see this week's scores, …".
export default function SwitchRow({ label, note, checked = false, onChange, busy = false }) {
  const labelId = useId();
  const noteId = useId();
  return (
    <div className="ds-switchrow">
      <div className="ds-switchrow-words">
        <span id={labelId} className="ds-switchrow-label">{label}</span>
        {note && <span id={noteId} className="ds-switchrow-note">{note}</span>}
      </div>
      <button
        type="button"
        role="switch"
        className="ds-switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        aria-describedby={note ? noteId : undefined}
        aria-busy={busy || undefined}
        onClick={() => onChange(!checked)}
      />
    </div>
  );
}
