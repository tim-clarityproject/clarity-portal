import { useId } from 'react';
import { Button } from './Button';
import './design.css';

// A to-do or an unplanned win in a list (M1 .td and winRow; reused by
// the weekly debrief and Plan my day in Phase 3). Every row in one list
// looks alike: the tick, the words, the Strategy line with its tags,
// and Move as a quiet text button.
//
// - A to-do: the tick fills mint when done (Tim, 26 Oct) and the words
//   are struck through in grey.
// - A to-do moved out after its week started: its tick is off, because
//   it counts as not done in that week (M2), and the tag says where it went.
// - A win: always ticked (it counts as done, M3), with "Unplanned win, Tue".
// Tags are separate grey words, never joined by dots (icon-row rule).
//
// tags:   ['rolled over from week 3'], read after the Strategy's name
// onMove: shows Move (read out as "Move: [the to-do]")
// plain:  shown, not ticked here (the debrief's Next week, M1): the box
//         is only a mark, mint when done, and nothing to press.
const TICK = <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>;

export function TodoList({ children, label, className = '' }) {
  return <div className={`ds-todos ${className}`.trim()} role="list" aria-label={label}>{children}</div>;
}

export default function TodoRow({ text, strategyName, tags = [], done = false, onToggle, disabled = false, onMove, win = false, winTag, plain = false }) {
  const textId = useId();
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
        <span id={textId} className="ds-todo-text">{text}</span>
        <span className="ds-todo-line">
          {strategyName && <span>{strategyName}</span>}
          {win && <span className="ds-todo-tag ds-todo-tag--win">{winTag}</span>}
          {tags.map((t) => <span key={t} className="ds-todo-tag">{t}</span>)}
        </span>
      </div>
      {onMove ? (
        <Button variant="text" className="ds-todo-move" aria-label={`Move: ${text}`} onClick={onMove}>Move</Button>
      ) : <span />}
    </div>
  );
}
