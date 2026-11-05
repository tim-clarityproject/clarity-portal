import { useEffect, useId, useRef, useState } from 'react';
import FieldLabel from './FieldLabel';
import TextBox from './TextBox';
import './design.css';

// Numbered priorities (Tim, 5 Nov, 10:38: "numbers beside them make it feel
// like a priority, not an empty text box"). Every "up to three" list: three
// numbered rows at once, 1, 2 and 3, the numbers in the display font like
// the plan's numbered Outcome Objectives, with no "Add another"; only the
// first is needed. The order is the priority: a row moves by dragging its
// number, or with the keyboard (focus the number, then the up or down
// arrow). Empty rows keep their place, so 1 stays 1.
//
// rows:      the typed rows (strings), up to `count`.
// itemLabel: (n) => what each box is called for screen readers.
export default function PriorityRows({ label, who, coachName, rows = [], onChange, count = 3, itemLabel = (n) => `Priority ${n}`, maxLength, placeholder }) {
  const labelId = useId();
  const shown = Array.from({ length: count }, (_, i) => rows[i] || '');
  const handles = useRef([]);
  const focusAfter = useRef(null);
  const [drag, setDrag] = useState(null); // { from, over }
  const rowEls = useRef([]);

  useEffect(() => {
    if (focusAfter.current == null) return;
    handles.current[focusAfter.current]?.focus();
    focusAfter.current = null;
  });

  const emit = (next) => {
    // Trailing empty rows are left off what is saved.
    let end = next.length;
    while (end > 0 && !String(next[end - 1] || '').trim()) end -= 1;
    onChange(next.slice(0, Math.max(end, 1)));
  };
  const set = (i, text) => emit(shown.map((r, j) => (j === i ? text : r)));
  const move = (from, to) => {
    if (to < 0 || to >= count || from === to) return;
    const next = [...shown];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    focusAfter.current = to;
    emit(next);
  };

  const onKey = (i) => (e) => {
    if (e.key === 'ArrowUp') { e.preventDefault(); move(i, i - 1); }
    if (e.key === 'ArrowDown') { e.preventDefault(); move(i, i + 1); }
  };
  const overIndex = (y) => {
    let best = 0;
    rowEls.current.forEach((el, j) => {
      if (!el) return;
      const b = el.getBoundingClientRect();
      if (y > b.top + b.height / 2) best = Math.min(count - 1, j + (y > b.bottom ? 1 : 0));
      if (y >= b.top && y <= b.bottom) best = j;
    });
    return best;
  };
  const onPointerDown = (i) => (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDrag({ from: i, over: i });
  };
  const onPointerMove = (e) => {
    if (!drag) return;
    const over = overIndex(e.clientY);
    if (over !== drag.over) setDrag({ ...drag, over });
  };
  const onPointerUp = () => {
    if (!drag) return;
    const { from, over } = drag;
    setDrag(null);
    move(from, over);
  };

  return (
    <div className="ds-prio" role="group" aria-labelledby={label ? labelId : undefined}>
      <FieldLabel label={label} id={labelId} who={who} coachName={coachName} />
      <ol className="ds-prio-rows">
        {shown.map((text, i) => (
          // The rows are the priorities: their place is their identity.
          // eslint-disable-next-line react/no-array-index-key
          <li key={i} ref={(el) => { rowEls.current[i] = el; }} className={`ds-prio-row${drag?.over === i && drag.from !== i ? ' ds-prio-row--over' : ''}${drag?.from === i ? ' ds-prio-row--moving' : ''}`}>
            <button
              type="button"
              ref={(el) => { handles.current[i] = el; }}
              className="ds-prio-n"
              aria-label={`${itemLabel(i + 1)}. To change the order, use the up and down arrows.`}
              onKeyDown={onKey(i)}
              onPointerDown={onPointerDown(i)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={() => setDrag(null)}
            >
              {i + 1}
            </button>
            <TextBox
              ariaLabel={itemLabel(i + 1)}
              lines="one"
              value={text}
              onChange={(v) => set(i, v)}
              maxLength={maxLength}
              placeholder={i === 0 ? placeholder : undefined}
            />
          </li>
        ))}
      </ol>
    </div>
  );
}
