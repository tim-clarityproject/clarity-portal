import { useId } from 'react';
import { IconButton } from './Button';
import DatePicker from './Calendar';
import { Choice } from './Choice';
import FieldLabel from './FieldLabel';
import { NumberField } from './LoggingRow';
import TextBox from './TextBox';
import { todayKey } from './dates';
import { NAME_MAX, OBJECTIVE_KINDS, ratingHint, shortDate } from '../../lib/performance';
import './design.css';

// One Outcome Objective being written (M6 objCard): what result will be
// tracked, how (a number, a milestone or a rating out of 10, with M6's two
// lines under the choice), then where they are now, the target and the
// date from the calendar. Shared by Build your plan, editing the plan and
// the end-of-sprint review's "Add an objective".
//
// objective: { name, kind: 'number'|'milestone'|'rating', start, target, date }
//            (figures as typed; the page decides when it is complete)
// onChange:  (patch) => void
// onRemove:  removes it (the 45° crosshair); left out, there is no remove
// startLabel: the start box's question ("Where are you now?"; editing an
//            objective already in the plan asks "Where did you start?")
export default function ObjectiveEditor({
  objective: o,
  onChange,
  onRemove,
  startLabel = 'Where are you now?',
  placeholder = 'e.g. Coaching clients',
  nameId,
}) {
  const id = useId();
  const nameBox = nameId || `${id}-name`;
  const kind = OBJECTIVE_KINDS.find((k) => k.value === o.kind) || OBJECTIVE_KINDS[0];
  const rating = o.kind === 'rating';
  const figure = (key, label) => {
    const hint = rating ? ratingHint(o[key]) : null;
    return (
      <div className="ds-objed-field">
        <FieldLabel label={label} htmlFor={`${id}-${key}`} />
        <NumberField
          id={`${id}-${key}`}
          size="box"
          decimals={!rating}
          maxDigits={rating ? 2 : 9}
          unit={rating ? '/10' : undefined}
          value={o[key]}
          onChange={(v) => onChange({ [key]: v })}
          aria-describedby={hint ? `${id}-${key}-hint` : undefined}
        />
        {hint && <p id={`${id}-${key}-hint`} className="ds-hint">{hint}</p>}
      </div>
    );
  };
  const date = (label) => (
    <div className="ds-objed-field ds-objed-date">
      <DatePicker label={label} value={o.date || null} onChange={(d) => onChange({ date: d })} min={todayKey()} format={shortDate} />
    </div>
  );

  return (
    <div className="ds-objed">
      <FieldLabel label="What result will you track?" htmlFor={nameBox} />
      <div className="ds-objed-head">
        <TextBox
          id={nameBox}
          lines="one"
          maxLength={NAME_MAX}
          value={o.name}
          onChange={(name) => onChange({ name })}
          placeholder={placeholder}
        />
        {onRemove && <IconButton label="Remove this objective" onClick={onRemove} />}
      </div>
      <Choice
        label="How will you track it?"
        options={OBJECTIVE_KINDS.map((k) => ({ value: k.value, label: k.label }))}
        value={o.kind}
        onChange={(next) => onChange({ kind: next })}
      />
      <div className="ds-objed-lines">
        {kind.lines.map((line) => <p key={line} className="ds-hint">{line}</p>)}
      </div>
      {o.kind === 'milestone' ? (
        <div className="ds-objed-grid ds-objed-grid--two">{date('Done by when?')}</div>
      ) : (
        <div className="ds-objed-grid">
          {figure('start', startLabel)}
          {figure('target', 'What’s your target?')}
          {date('By when?')}
        </div>
      )}
    </div>
  );
}
