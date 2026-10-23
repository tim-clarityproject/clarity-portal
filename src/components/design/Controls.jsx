import { useId } from 'react';
import InlineChoice from './InlineChoice';
import './design.css';

// Segmented control (design reference: Controls): switches between views
// of the same thing ("Today" / "This week"). Pills when they fit on one
// line (equal widths on phone), otherwise full-width rows (Tim, 23 Oct).
export function SegmentedControl({ label, options, value, onChange, className = '' }) {
  return (
    <InlineChoice
      ariaLabel={label}
      options={options}
      value={value}
      onChange={onChange}
      semantics="pressed"
      className={className}
    />
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

// A group of pills (or rows, when they don't fit) where exactly one is
// chosen: radio buttons. Arrow keys move and choose, as people expect.
export function PillChoice(props) {
  return <InlineChoice {...props} semantics="radio" />;
}
