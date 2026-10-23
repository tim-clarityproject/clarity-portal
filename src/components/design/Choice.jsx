import { useMemo } from 'react';
import Dropdown from './Dropdown';
import InlineChoice from './InlineChoice';
import { needsDropdown } from './choiceFit';
import './design.css';

export { Dropdown };

// Choice: one of several options, in the form that suits it, decided
// automatically (the pill rule, Tim 22 Oct; pills on phones, Tim 23 Oct):
// - long or many options: the branded drop-down;
// - otherwise pills when they fit on one line (equal widths on phone,
//   never wrapping), or full-width answer rows when they don't.
// `form` can force 'pills', 'rows' or 'dropdown' where a screen needs to
// (e.g. one-tap answer lists are always rows).
export function Choice({ label, options, value, onChange, form = 'auto', ...rest }) {
  const signature = options.map((o) => `${o.label}|${o.hint || ''}`).join('\u0000');
  const long = useMemo(
    () => needsDropdown(options),
    // `signature` stands for the options' words.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [signature],
  );
  if (form === 'dropdown' || (form === 'auto' && long)) {
    return <Dropdown label={label} options={options} value={value} onChange={onChange} {...rest} />;
  }
  return (
    <InlineChoice
      label={label}
      options={options}
      value={value}
      onChange={onChange}
      form={form === 'pills' || form === 'rows' ? form : undefined}
      {...rest}
    />
  );
}
