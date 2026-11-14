import { useContext, useEffect, useId, useRef } from 'react';
import { AddButton, IconButton } from './Button';
import FieldLabel from './FieldLabel';
import TextBox from './TextBox';
import { ToastContext } from './toastContext';
import './design.css';

// Lists are rows (Tim, 26 Oct, 16:51; CLAUDE.md rule 30): when someone
// lists several things, each gets its own box, with "Add another" (the
// one add button) to add a row and the 45 degree crosshair to remove
// one, never one big box. Used by Daily review's "What are the most
// important things to do tomorrow?" (up to three).
//
// rows:      the typed rows (strings); at least one box always shows.
// max:       the most rows; Add another goes once it is reached.
// itemLabel: (n) => what each box is called for screen readers
//            ("Important thing 2 for tomorrow").
// maxLength: each row's limit.
// numbered: a small grey number before each box (M19's wind-down thoughts).
// max may be Infinity: Sleep wind down's thoughts have no limit (M19).
// removeAlways: the crosshair shows on a single row too (M9's lists); taking
//           the only row out leaves one empty box.
// undo:     taking a row out shows "Deleted" with Undo (M9; writing rule 28),
//           which puts it back where it was.
// onChange(rows, change): `change` is { removed: i } when a row is taken
//           out and { restored: i } when Undo puts it back, for a page that
//           keeps something beside each row.
export default function RowList({ label, who, coachName, rows = [], onChange, max = 3, itemLabel = (n) => `Item ${n}`, maxLength, placeholder, addLabel = 'Add another', numbered = false, removeAlways = false, undo = false }) {
  // Optional: a page with no toasts still removes rows, without Undo.
  const toast = useContext(ToastContext);
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
  // The rows as they are now, for an Undo pressed after more typing.
  const latest = useRef(shown);
  latest.current = shown;
  const remove = (i) => {
    const gone = shown[i];
    const next = shown.filter((_, j) => j !== i);
    focusNext.current = Math.max(0, i - 1);
    onChange(next.length ? next : [''], { removed: i });
    if (!undo || !toast) return;
    toast.saved({
      message: 'Deleted',
      onUndo: () => {
        const now = latest.current;
        // The one empty box left behind gives its place back.
        const base = now.length === 1 && !now[0] && shown.length === 1 ? [] : now;
        const at = Math.min(i, base.length);
        focusNext.current = at;
        onChange([...base.slice(0, at), gone, ...base.slice(at)], { restored: at });
      },
    });
  };

  return (
    <div className={`ds-rowlist${numbered ? ' ds-rowlist--numbered' : ''}`} role="group" aria-labelledby={label ? labelId : undefined}>
      <FieldLabel label={label} id={labelId} who={who} coachName={coachName} />
      <div className="ds-rowlist-rows">
        {shown.map((text, i) => (
          // The rows have no ids of their own; their order is their identity.
          // eslint-disable-next-line react/no-array-index-key
          <div key={i} className="ds-rowlist-row">
            {numbered && <span className="ds-rowlist-n" aria-hidden="true">{i + 1}</span>}
            <TextBox
              ref={(el) => { boxes.current[i] = el; }}
              ariaLabel={itemLabel(i + 1)}
              lines="one"
              value={text}
              onChange={(v) => set(i, v)}
              maxLength={maxLength}
              placeholder={i === 0 ? placeholder : undefined}
            />
            {(shown.length > 1 || removeAlways) && (
              <IconButton label={`Remove ${itemLabel(i + 1).charAt(0).toLowerCase()}${itemLabel(i + 1).slice(1)}`} className="ds-rowlist-remove" onClick={() => remove(i)} />
            )}
          </div>
        ))}
      </div>
      {shown.length < max && <AddButton className="ds-rowlist-add" onClick={add}>{addLabel}</AddButton>}
    </div>
  );
}
