import { useId, useRef } from 'react';
import FieldLabel from './FieldLabel';
import './design.css';

// A 1 to 10 scale (M5 Review my day, "On a scale of 1 to 10, how calm
// under pressure were you today?"): ten equal boxes in one row, five by
// two on a phone, with the meaning of each end in words underneath ("1 is
// not at all", "10 is completely"). The chosen number fills in the text
// colour; tapping it again clears it, so an answer can go back to none.
// A radio group: arrow keys move and choose, as people expect.
//
// lowLabel, highLabel: the words under each end.
// ariaLabel: names the group when the screen's question is its label.
export default function ScaleChoice({ label, ariaLabel, who, coachName, value = null, onChange, from = 1, to = 10, lowLabel, highLabel }) {
  const labelId = useId();
  const refs = useRef([]);
  const values = [];
  for (let v = from; v <= to; v += 1) values.push(v);
  const focusAt = value == null ? 0 : Math.max(0, values.indexOf(value));
  const moveTo = (i) => {
    const at = (i + values.length) % values.length;
    onChange(values[at]);
    refs.current[at]?.focus({ preventScroll: true });
  };
  return (
    <div className="ds-scale">
      <FieldLabel label={label} id={labelId} who={who} coachName={coachName} />
      <div
        className="ds-scale-row"
        role="radiogroup"
        aria-labelledby={label ? labelId : undefined}
        aria-label={label ? undefined : ariaLabel}
        style={{ '--scale-n': values.length }}
      >
        {values.map((v, i) => (
          <button
            key={v}
            ref={(el) => { refs.current[i] = el; }}
            type="button"
            role="radio"
            className="ds-scale-btn"
            aria-checked={value === v}
            tabIndex={i === focusAt ? 0 : -1}
            onClick={() => onChange(value === v ? null : v)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); moveTo(i + 1); }
              if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); moveTo(i - 1); }
              if (e.key === 'Home') { e.preventDefault(); moveTo(0); }
              if (e.key === 'End') { e.preventDefault(); moveTo(values.length - 1); }
            }}
          >
            {v}
          </button>
        ))}
      </div>
      {(lowLabel || highLabel) && (
        <div className="ds-scale-ends">
          <span>{lowLabel}</span>
          <span>{highLabel}</span>
        </div>
      )}
    </div>
  );
}
