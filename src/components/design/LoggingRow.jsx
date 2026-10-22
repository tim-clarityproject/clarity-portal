import { useId } from 'react';
import Crosshair from './Crosshair';
import { Bar } from './Stat';
import './design.css';

// Number entry: opens the number keypad on phone, with the unit shown
// inside the field. `value` is the text as typed; the page decides how
// to store it.
// maxDigits keeps entries to a sensible size; grouping commas typed or
// pasted in whole numbers ("12,000") are accepted and dropped.
export function NumberField({ value, onChange, unit, label, decimals = false, maxDigits = 7, ...rest }) {
  return (
    <label className="ds-num">
      <input
        className="ds-num-input"
        type="text"
        inputMode={decimals ? 'decimal' : 'numeric'}
        pattern={decimals ? '[0-9]*[.,]?[0-9]*' : '[0-9]*'}
        autoComplete="off"
        enterKeyHint="done"
        aria-label={label}
        value={value}
        onChange={(e) => {
          let next = e.target.value.trim();
          if (!decimals) next = next.replace(/[,\s]/g, '');
          const allowed = decimals ? /^[0-9]*[.,]?[0-9]*$/ : /^[0-9]*$/;
          if (allowed.test(next) && next.replace(/[.,]/, '').length <= maxDigits) onChange(next);
        }}
        {...rest}
      />
      {unit && <span className="ds-num-unit" aria-hidden="true">{unit}</span>}
    </label>
  );
}

// Stepper: minus, the count, then the crosshair plus (decisions:
// "counters keep the crosshair plus and a minus").
export function Stepper({ value, onChange, min = 0, max = Infinity, label }) {
  const outputId = useId();
  // At a limit the button stays focusable but does nothing (aria-disabled
  // rather than disabled), so keyboard focus is never dropped and a held
  // key never runs on into the other button.
  const step = (by) => {
    const next = Math.min(max, Math.max(min, value + by));
    if (next !== value) onChange(next);
  };
  return (
    <span className="ds-stepper" role="group" aria-label={label}>
      <button
        type="button"
        className="ds-stepper-btn"
        aria-label={`One fewer: ${label}`}
        aria-describedby={outputId}
        aria-disabled={value <= min}
        onClick={() => step(-1)}
      >
        −
      </button>
      <output id={outputId} className="ds-stepper-value" aria-live="polite">{value}</output>
      <button
        type="button"
        className="ds-stepper-btn"
        aria-label={`One more: ${label}`}
        aria-describedby={outputId}
        aria-disabled={value >= max}
        onClick={() => step(1)}
      >
        <Crosshair />
      </button>
    </span>
  );
}

// Logging row (design reference: Logging rows). One habit per row: the
// name, one grey line (today against today's target, and its strategy),
// the entry, and a thin bar underneath. No impact tags while logging.
//
// kind 'number':  a number field (value is text); give `unit`.
// kind 'stepper': minus and plus (value is a number); give `min`/`max`.
// progress:       0 to 1 for the thin bar.
export function LoggingRow({
  name,
  detail,
  kind = 'number',
  value,
  onChange,
  unit,
  decimals,
  min,
  max,
  progress,
  entryLabel,
}) {
  const label = entryLabel || name;
  return (
    <div className="ds-log">
      <div className="ds-log-main">
        <div className="ds-log-name">{name}</div>
        {detail && <div className="ds-log-detail">{detail}</div>}
      </div>
      {kind === 'stepper' ? (
        <Stepper value={value} onChange={onChange} min={min} max={max} label={label} />
      ) : (
        <NumberField value={value} onChange={onChange} unit={unit} decimals={decimals} label={label} />
      )}
      {progress != null && <Bar value={progress} />}
    </div>
  );
}
