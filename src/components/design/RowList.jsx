import { useEffect, useId, useRef } from 'react';
import { AddButton, IconButton } from './Button';
import FieldLabel from './FieldLabel';
import TextBox from './TextBox';
import './design.css';

// Lists are rows (Tim, 26 Oct, 16:51; CLAUDE.md rule 30): when someone
// lists several things, each gets its own box, with "Add another" (the
// one add button) to add a row and the 45 degree crosshair to remove
// one, never one big box. Used by Review my day's "What are the most
// important things to do tomorrow?" (up to three).
//
// rows:      the typed rows (strings); at least one box always shows.
// max:       the most rows; Add another goes once it is reached.
// itemLabel: (n) => what each box is called for screen readers
//            ("Important thing 2 for tomorrow").
// maxLength: each row's limit.
export default function RowList({ label, who, coachName, rows = [], onChange, max = 3, itemLabel = (n) => `Item ${n}`, maxLength, placeholder, addLabel = 'Add another' }) {
  const labelId = useId();
  const shown = rows.length ? rows : [''];
  const boxes = useRef([]);
  const focusNext = useRef(null);

  useEffect(() => {
    if (focusNext.current == null) return;
    boxes.current[focusNext.current]?.focus();
    focusNext.current = null;
  });

  const set = (i, text) => onChange(shown.map((r, j) => (j === i ? text : r)));
  const add = () => {
    focusNext.current = shown.length;
    onChange([...shown, '']);
  };
  const remove = (i) => {
    const next = shown.filter((_, j) => j !== i);
    focusNext.current = Math.max(0, i - 1);
    onChange(next.length ? next : ['']);
  };

  return (
    <div className="ds-rowlist" role="group" aria-labelledby={label ? labelId : undefined}>
      <FieldLabel label={label} id={labelId} who={who} coachName={coachName} />
      <div className="ds-rowlist-rows">
        {shown.map((text, i) => (
          // The rows have no ids of their own; their order is their identity.
          // eslint-disable-next-line react/no-array-index-key
          <div key={i} className="ds-rowlist-row">
            <TextBox
              ref={(el) => { boxes.current[i] = el; }}
              ariaLabel={itemLabel(i + 1)}
              lines="one"
              value={text}
              onChange={(v) => set(i, v)}
              maxLength={maxLength}
              placeholder={i === 0 ? placeholder : undefined}
            />
            {shown.length > 1 && (
              <IconButton label={`Remove ${itemLabel(i + 1).charAt(0).toLowerCase()}${itemLabel(i + 1).slice(1)}`} className="ds-rowlist-remove" onClick={() => remove(i)} />
            )}
          </div>
        ))}
      </div>
      {shown.length < max && <AddButton className="ds-rowlist-add" onClick={add}>{addLabel}</AddButton>}
    </div>
  );
}
