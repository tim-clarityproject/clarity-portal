import { useId } from 'react';
import './design.css';

// One answer of several, where the chosen answer's follow-up opens inside
// its own card (5e rule 29k; M10's Emotional wash: "Accept and act" opens
// "What’s one small step you’ll take?" in the same card). Each answer is a
// word with its line of meaning, and the drop-down's tick shows on the
// chosen one; its place is kept on every card, so choosing never moves the
// words.
//
//   <FollowChoice
//     ariaLabel="How will you wash “The chair has never rated me”?"
//     options={[{ value: 'act', label: 'Accept and act', hint: 'Simplify it and move to action.' }, …]}
//     value={value}
//     onChange={setValue}
//     follow={(value) => <FollowQuestion …>…</FollowQuestion>}   null for an answer with no follow-up
//   />
//
// Each answer is a button that can be pressed (not a radio that the arrow
// keys choose), because choosing one can do something at once (Trash lets
// a thought go).
export default function FollowChoice({ ariaLabel, options, value, onChange, follow }) {
  return (
    <div className="ds-choice">
      <div className="ds-rows ds-follow" role="group" aria-label={ariaLabel}>
        {options.map((option) => {
          const on = option.value === value;
          const inside = on && follow ? follow(option.value) : null;
          return (
            <div key={option.value} className={`ds-follow-card${on ? ' ds-follow-card--on' : ''}`}>
              <button type="button" className="ds-answer ds-answer--tick ds-follow-answer" aria-pressed={on} onClick={() => onChange(option.value)}>
                <span className="ds-answer-words">
                  {option.label}
                  {option.hint && <small className="ds-answer-hint">{option.hint}</small>}
                </span>
              </button>
              {inside && <div className="ds-follow-body">{inside}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * A follow-up's question: the question in the text colour, one quiet line
 * under it, then what answers it (starters, a text box). `children` is a
 * function given the question's ids: ({ labelId, hintId }) => content, so
 * the box can be named by the question.
 */
export function FollowQuestion({ label, hint, children }) {
  const labelId = useId();
  const hintId = useId();
  return (
    <div className="ds-follow-question">
      <p id={labelId} className="ds-follow-label">{label}</p>
      {hint && <p id={hintId} className="ds-follow-hint">{hint}</p>}
      {typeof children === 'function' ? children({ labelId, hintId: hint ? hintId : undefined }) : children}
    </div>
  );
}
