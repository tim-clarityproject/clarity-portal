import { useId } from 'react';
import FieldLabel from './FieldLabel';
import './design.css';

// Pick several (Tim, 23 Oct: "Which Strategies did it help?" with "Pick
// all that apply."): full-width answer rows that each turn on and off,
// the chosen ones with a shade and a coral tick, like the drop-down's
// chosen option. Not tick boxes: those are only for lists.
//
// hint: a short line under the question ("Pick all that apply.").
// ariaLabel: names the group when the screen's question is its label.
// max: the most that can be chosen (M5: two Strategies of the day, three
//      things to do today). Once it is reached the others grey out until
//      one is unchosen (Tim, 23 Oct).
// variant 'pick': the Do list in Plan my day (M5 .pk): each row has a
//      second line (the option's `detail`, then its `tags` as separate
//      grey words, never joined by dots) and a circle at the end that
//      fills with a tick once chosen, so every row has the same layout.
export default function MultiChoice({ label, ariaLabel, hint, options, values, onChange, who, coachName, max, variant }) {
  const labelId = useId();
  const hintId = useId();
  const full = max != null && values.length >= max;
  const toggle = (value) => {
    if (values.includes(value)) onChange(values.filter((v) => v !== value));
    else if (!full) onChange([...values, value]);
  };
  const pick = variant === 'pick';
  return (
    <div className="ds-choice">
      <FieldLabel label={label} id={labelId} who={who} coachName={coachName} />
      {hint && <p id={hintId} className="ds-hint ds-hint--above">{hint}</p>}
      <div className={`ds-rows${pick ? ' ds-rows--pick' : ''}`} role="group" aria-labelledby={label ? labelId : undefined} aria-label={label ? undefined : ariaLabel} aria-describedby={hint ? hintId : undefined}>
        {options.map((option) => {
          const on = values.includes(option.value);
          const off = full && !on;
          return (
            <button
              key={option.value}
              type="button"
              className={`ds-answer ${pick ? 'ds-answer--pick' : 'ds-answer--multi'}${off ? ' ds-answer--full' : ''}`}
              aria-pressed={on}
              disabled={off}
              onClick={() => toggle(option.value)}
            >
              {pick ? (
                <>
                  <span className="ds-pick-words">
                    <span className="ds-pick-name">{option.label}</span>
                    {(option.detail || option.tags?.length > 0) && (
                      <span className="ds-todo-line">
                        {option.detail && <span>{option.detail}</span>}
                        {option.tags?.map((t) => <span key={t} className="ds-todo-tag">{t}</span>)}
                      </span>
                    )}
                  </span>
                  <span className="ds-pick-mark" aria-hidden="true">
                    <svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
                  </span>
                </>
              ) : (
                <span>{option.label}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
