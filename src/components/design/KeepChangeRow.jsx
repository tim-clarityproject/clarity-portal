import { Choice } from './Choice';
import './design.css';

// One thing carried into what comes next, with a choice for each (M6
// "Start a sprint": "Which habits are you bringing across?" Keep, Change
// or Remove; the end-of-sprint review's objectives use Keep, Change or
// Retire). The name, then its lines in grey (each a label, no dots
// between), then the choice as 44px pills (the approved size over M6's
// 36px tiny segments). A removed one keeps its row, its name struck
// through in grey, so it can be brought back. With Change, the editor
// (children) opens under the row.
//
// options: [{ value, label }]; the first is the starting choice.
// removeValue: the option that strikes the name through.
// action: something to do or a status instead of the choice (the
//         end-of-sprint review's habits that stuck: "Add to my plan", or
//         "In your plan" with a mint tick, M6).
const KEEP_CHANGE_REMOVE = Object.freeze([
  { value: 'keep', label: 'Keep' },
  { value: 'change', label: 'Change' },
  { value: 'remove', label: 'Remove' },
]);

export default function KeepChangeRow({
  name,
  lines = [],
  value,
  onChange,
  options = KEEP_CHANGE_REMOVE,
  removeValue = 'remove',
  changeValue = 'change',
  action,
  children,
}) {
  const current = value || options[0].value;
  const removed = current === removeValue;
  return (
    <div className={`ds-carry-row${removed ? ' ds-carry-row--removed' : ''}`}>
      <div className="ds-carry-head">
        <div className="ds-carry-text">
          <span className="ds-carry-name">{name}</span>
          {lines.filter(Boolean).map((l) => <small key={l} className="ds-carry-line">{l}</small>)}
        </div>
        {action ? <div className="ds-carry-action">{action}</div> : (
          <Choice
            form="pills"
            ariaLabel={`What happens to ${name}?`}
            options={options}
            value={current}
            onChange={onChange}
            className="ds-carry-choice"
          />
        )}
      </div>
      {current === changeValue && children ? <div className="ds-carry-edit">{children}</div> : null}
    </div>
  );
}

/** "In your plan" with the mint tick (M6 .inplan): a habit that stuck, now in the plan. */
export function InPlan({ children = 'In your plan' }) {
  return (
    <span className="ds-inplan">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
      {children}
    </span>
  );
}
