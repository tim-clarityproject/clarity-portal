import { useId, useMemo } from 'react';
import Crosshair from './Crosshair';
import { PillChoice } from './Controls';
import { pillsFitOnPhone } from './choiceFit';
import './design.css';

// Dropdown: the phone's own picker (the wheel on iPhone), drawn as a
// field with the crosshair as its "choose" mark.
export function Dropdown({ label, options, value, onChange }) {
  const id = useId();
  return (
    <div className="ds-choice">
      <label htmlFor={id} className="ds-field-label">{label}</label>
      <span className="ds-select">
        <span className="ds-select-value" aria-hidden="true">
          {options.find((o) => o.value === value)?.label}
        </span>
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
          {options.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <Crosshair />
      </span>
    </div>
  );
}

// Choice: one of several options. Renders pills when they fit, otherwise
// a dropdown. `mode` can force 'pills' or 'dropdown' where a page needs to.
export function Choice({ label, options, value, onChange, mode = 'auto' }) {
  const labels = options.map((o) => o.label).join('\u0000');
  const fits = useMemo(() => pillsFitOnPhone(labels.split('\u0000')), [labels]);
  const usePills = mode === 'pills' || (mode === 'auto' && fits);
  return usePills
    ? <PillChoice label={label} options={options} value={value} onChange={onChange} />
    : <Dropdown label={label} options={options} value={value} onChange={onChange} />;
}
