import { useId } from 'react';
import FieldLabel from './FieldLabel';
import './design.css';

// Pick several (Tim, 23 Oct: "Which Strategies did it help?" with "Pick
// all that apply."): full-width answer rows that each turn on and off,
// the chosen ones with a shade and a coral tick, like the drop-down's
// chosen option. Not tick boxes: those are only for lists.
//
// hint: a short line under the question ("Pick all that apply.").
export default function MultiChoice({ label, hint, options, values, onChange, who, coachName }) {
  const labelId = useId();
  const hintId = useId();
  const toggle = (value) => onChange(values.includes(value) ? values.filter((v) => v !== value) : [...values, value]);
  return (
    <div className="ds-choice">
      <FieldLabel label={label} id={labelId} who={who} coachName={coachName} />
      {hint && <p id={hintId} className="ds-hint ds-hint--above">{hint}</p>}
      <div className="ds-rows" role="group" aria-labelledby={labelId} aria-describedby={hint ? hintId : undefined}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className="ds-answer ds-answer--multi"
            aria-pressed={values.includes(option.value)}
            onClick={() => toggle(option.value)}
          >
            <span>{option.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
