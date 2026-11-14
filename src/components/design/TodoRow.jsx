import { useId, useState } from 'react';
import keepWords from './keepWords';
import { Button } from './Button';
import './design.css';

// A to-do or an unplanned win in a list (M1 .td and winRow; reused by
// the weekly debrief and Daily plan in Phase 3). Every row in one list
// looks alike: the tick, the words and the Strategy line with its tags.
// Move lives inside the opened item (5e rule 18; Tim, 10 Nov): a to-do
// that can be moved opens when its words are tapped, and Move shows under
// them. At rest no row has a button another row lacks.
//
// - A to-do: the tick fills mint when done (Tim, 26 Oct) and the words
//   are struck through in grey.
// - A to-do moved out after its week started: its tick is off, because
//   it counts as not done in that week (M2), and the tag says where it went.
// - A win: always ticked (it counts as done, M3), with "Unplanned win, Tue".
// Tags are separate grey words, never joined by dots (icon-row rule).
//
// tags:   ['Rolled over from week 3'], read after the Strategy's name
// onMove: the to-do opens on a tap, showing Move (read out as "Move: [the to-do]")
// moveLabel: the opened row's own words in place of Move (the Backlog's
//         "Plan into a week"; Tim, 13 Nov, 10:42)
// plain:  shown, not ticked here (the debrief's Next week, M1): the box
//         is only a mark, mint when done, and nothing to press.
// lead:   words before the Strategy's name in the text colour (Home's
//         "Highest priority", M2 .hpri).
const TICK = <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>;

export function TodoList({ children, label, className = '' }) {
  return <div className={`ds-todos ${className}`.trim()} role="list" aria-label={label}>{children}</div>;
}

export default function TodoRow({ text, strategyName, tags = [], done = false, onToggle, disabled = false, onMove, moveLabel = 'Move', win = false, winTag, plain = false, lead }) {
  const textId = useId();
  const moreId = useId();
  const [open, setOpen] = useState(false);
  const words = (
    <>
      <span id={textId} className="ds-todo-text">{keepWords(text)}</span>
      <span className="ds-todo-line">
        {lead && <span className="ds-todo-lead">{lead}</span>}
        {strategyName && <span>{strategyName}</span>}
        {win && <span className="ds-todo-tag ds-todo-tag--win">{winTag}</span>}
        {tags.map((t) => <span key={t} className="ds-todo-tag">{t}</span>)}
      </span>
    </>
  );
  return (
    <div className={`ds-todo${done && !win ? ' ds-todo--done' : ''}${win ? ' ds-todo--win' : ''}`} role="listitem">
      {win || plain ? (
        <span className={`ds-check-box ds-todo-mark${plain && !done ? ' ds-todo-mark--open' : ''}`} aria-hidden="true"><span>{TICK}</span></span>
      ) : (
        <button
          type="button"
          role="checkbox"
          className="ds-check-box"
          aria-checked={done}
          aria-labelledby={textId}
          disabled={disabled}
          onClick={() => onToggle?.(!done)}
        >
          <span>{TICK}</span>
        </button>
      )}
      <div className="ds-todo-main">
        {onMove ? (
          <button type="button" className="ds-todo-open" aria-expanded={open} aria-controls={moreId} onClick={() => setOpen((v) => !v)}>
            {words}
          </button>
        ) : words}
        {onMove && open && (
          <div id={moreId} className="ds-todo-more">
            <Button variant="text" className="ds-todo-move" aria-label={`${moveLabel}: ${text}`} onClick={onMove}>{moveLabel}</Button>
          </div>
        )}
      </div>
    </div>
  );
}
