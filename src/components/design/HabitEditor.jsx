import { useId } from 'react';
import { IconButton } from './Button';
import { Choice } from './Choice';
import Dropdown from './Dropdown';
import FieldLabel from './FieldLabel';
import { NumberField } from './LoggingRow';
import TextBox from './TextBox';
import {
  HABIT_MEASURES,
  IMPACTS,
  NAME_MAX,
  RATING_DIRECTIONS,
  UNIT_MAX,
  habitTargetHint,
  targetSuffix,
} from '../../lib/performance';
import './design.css';

// One habit being written (M6 hcard): what they'll do, how it's measured
// (the seven ways in methods M1, a branded drop-down with an example
// under each), the target with its words after the box ("a week", "days
// at most"), and how much it moves its Strategy. Two things M6 leaves out
// that the methods need: an amount's unit, and whether a higher or lower
// rating is better. Shared by Build your plan, editing the plan, Start a
// sprint (Change and Add a habit) and the sprint's habit panel.
//
// habit:    { name, measure, target, unit, per, direction, impact }
// onChange: (patch) => void; a new measure comes as { measure }, and the
//           page sets its default per (withMeasure in src/lib/performance)
// onRemove: the 45° crosshair (lists are rows, CLAUDE.md rule 30)
export default function HabitEditor({ habit: h, onChange, onRemove, placeholder = 'e.g. Training sessions', nameId }) {
  const id = useId();
  const nameBox = nameId || `${id}-name`;
  const hint = habitTargetHint(h);
  const suffix = targetSuffix(h);
  return (
    <div className="ds-habed">
      <FieldLabel label="What will you do?" htmlFor={nameBox} />
      <div className="ds-objed-head">
        <TextBox
          id={nameBox}
          lines="one"
          maxLength={NAME_MAX}
          value={h.name}
          onChange={(name) => onChange({ name })}
          placeholder={placeholder}
        />
        {onRemove && <IconButton label="Remove this habit" onClick={onRemove} />}
      </div>
      <Dropdown
        label="How will you measure it?"
        options={HABIT_MEASURES.map((m) => ({ value: m.value, label: m.label, hint: m.hint }))}
        value={h.measure}
        onChange={(measure) => onChange({ measure })}
      />
      {h.measure === 'amount' && (
        <TextBox
          label="What’s the unit?"
          lines="one"
          maxLength={UNIT_MAX}
          value={h.unit}
          onChange={(unit) => onChange({ unit })}
          placeholder="e.g. steps or litres"
          className="ds-habed-unit"
        />
      )}
      {h.measure === 'rating' && (
        <Choice
          label="Which is better?"
          options={RATING_DIRECTIONS}
          value={h.direction}
          onChange={(direction) => onChange({ direction })}
        />
      )}
      <div className="ds-habed-row">
        {h.measure !== 'yes_no_weekly' && (
          <div className="ds-habed-target">
            <FieldLabel label="What’s the target?" htmlFor={`${id}-target`} />
            <div className="ds-habed-target-box">
              <NumberField
                id={`${id}-target`}
                size="box"
                decimals={h.measure === 'amount'}
                maxDigits={7}
                value={h.target}
                onChange={(target) => onChange({ target })}
                aria-describedby={hint ? `${id}-hint` : undefined}
              />
              {suffix && <span className="ds-habed-suffix">{suffix}</span>}
            </div>
            {hint && <p id={`${id}-hint`} className="ds-hint">{hint}</p>}
          </div>
        )}
        <div className="ds-habed-impact">
          <Choice
            label="How much impact?"
            options={IMPACTS}
            value={h.impact}
            onChange={(impact) => onChange({ impact })}
          />
        </div>
      </div>
    </div>
  );
}
