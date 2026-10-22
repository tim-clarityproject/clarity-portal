import { useId, useRef } from 'react';
import './design.css';

// Segmented control (design reference: Controls): switches between views
// of the same thing ("Today" / "This week").
export function SegmentedControl({ label, options, value, onChange, className = '' }) {
  return (
    <div className={`ds-seg ${className}`.trim()} role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className="ds-seg-btn"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

// Chip: an on/off pill. For picking one of several, use Choice, which
// draws the same pills with the right keyboard behaviour.
export function Chip({ pressed = false, onClick, children, ...rest }) {
  return (
    <button type="button" className="ds-chip" aria-pressed={pressed} onClick={onClick} {...rest}>
      {children}
    </button>
  );
}

export function ChipRow({ children, label, className = '' }) {
  return (
    <div className={`ds-chips ${className}`.trim()} role="group" aria-label={label}>
      {children}
    </div>
  );
}

// Checkbox: a 22px box in a 44px target, coral with a black tick when
// done. The words beside it are its label and can be tapped too.
export function Checkbox({ checked, onChange, children, after }) {
  const labelId = useId();
  return (
    <div className="ds-check">
      <button
        type="button"
        role="checkbox"
        className="ds-check-box"
        aria-checked={checked}
        aria-labelledby={labelId}
        onClick={() => onChange(!checked)}
      >
        <span>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
        </span>
      </button>
      <span id={labelId} className="ds-check-label" onClick={() => onChange(!checked)}>
        {children}
      </span>
      {after}
    </div>
  );
}

// Impact tag: only shown while adding or editing a habit, to-do or
// unplanned win, never while logging (decisions: "Impact tags only when
// editing"). Renders nothing unless `editing`.
export function ImpactTag({ editing, children }) {
  if (!editing) return null;
  return <span className="ds-impact">{children}</span>;
}

// A group of pills where exactly one is chosen (radio buttons that look
// like chips). Arrow keys move and choose, as people expect.
export function PillChoice({ label, options, value, onChange }) {
  const labelId = useId();
  const refs = useRef([]);
  const selectedIndex = Math.max(0, options.findIndex((o) => o.value === value));

  const move = (from, step) => {
    const next = (from + step + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  };

  return (
    <div className="ds-choice">
      <span id={labelId} className="ds-field-label">{label}</span>
      <div className="ds-chips" role="radiogroup" aria-labelledby={labelId}>
        {options.map((option, i) => (
          <button
            key={option.value}
            ref={(el) => { refs.current[i] = el; }}
            type="button"
            role="radio"
            className="ds-chip"
            aria-checked={option.value === value}
            tabIndex={i === selectedIndex ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); move(i, 1); }
              if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); move(i, -1); }
            }}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
