import { useMemo } from 'react';
import { PillChoice } from './Controls';
import Dropdown from './Dropdown';
import { pillsFitOnPhone } from './choiceFit';
import './design.css';

export { Dropdown };

// Choice: one of several options. Renders pills when they fit, otherwise
// the branded drop-down. `mode` can force 'pills' or 'dropdown' where a
// page needs to.
export function Choice({ label, options, value, onChange, mode = 'auto', ...rest }) {
  const labels = options.map((o) => o.label).join('\u0000');
  const fits = useMemo(() => pillsFitOnPhone(labels.split('\u0000')), [labels]);
  const usePills = mode === 'pills' || (mode === 'auto' && fits);
  return usePills
    ? <PillChoice label={label} options={options} value={value} onChange={onChange} />
    : <Dropdown label={label} options={options} value={value} onChange={onChange} {...rest} />;
}
