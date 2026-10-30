import { useId } from 'react';
import FieldLabel from './FieldLabel';
import InlineChoice from './InlineChoice';
import { IMPACT_OPTIONS } from './impact';
import './design.css';

// Answer rows that each open Low, Medium and High inside once chosen (M5
// Review my day, "Which Strategies moved today?"; approved 23 Oct, 13:16).
// A chosen row is outlined in the text colour and shows the follow-up
// question with its three pills in the same row, starting at Medium; the
// rest of the list never moves except by that row growing. Choosing the
// row again takes it and its level away.
//
// values:   { [option value]: 1 | 2 | 3 } for the chosen rows.
// question: (label) => the follow-up, naming the thing (writing rule 64:
//           "How much did “Grow through referrals” move?").
// startAt:  the level a row starts on when chosen (Medium).
export default function LevelChoice({ label, ariaLabel, who, coachName, options, values = {}, onChange, question, startAt = 2, levels = IMPACT_OPTIONS }) {
  const labelId = useId();
  const baseId = useId();
  const toggle = (value) => {
    const next = { ...values };
    if (next[value] != null) delete next[value];
    else next[value] = startAt;
    onChange(next);
  };
  return (
    <div className="ds-choice">
      <FieldLabel label={label} id={labelId} who={who} coachName={coachName} />
      <div className="ds-levels" role="group" aria-labelledby={label ? labelId : undefined} aria-label={label ? undefined : ariaLabel}>
        {options.map((option, i) => {
          const on = values[option.value] != null;
          const askId = `${baseId}-${i}`;
          return (
            <div key={option.value} className={`ds-level-row${on ? ' ds-level-row--on' : ''}`}>
              <button type="button" className="ds-level-name" aria-pressed={on} onClick={() => toggle(option.value)}>
                <span>{option.label}</span>
              </button>
              {on && (
                <div className="ds-level-ask">
                  <span id={askId} className="ds-level-q">{question ? question(option.label) : 'How much?'}</span>
                  <InlineChoice
                    ariaLabel={question ? question(option.label) : 'How much?'}
                    options={levels}
                    value={values[option.value]}
                    onChange={(level) => onChange({ ...values, [option.value]: level })}
                    form="pills"
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
