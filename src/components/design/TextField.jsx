import { forwardRef, useId } from 'react';
import FieldLabel from './FieldLabel';
import './design.css';

// A one-line field for things that aren't free text: an email address,
// a password, a number (CLAUDE.md rule 18 keeps free text in TextBox,
// which grows). The same look as the text box: box colour, box-edge
// outline turning coral on focus, 17px, 20px each side, 58px high, 14px
// corners (design reference v3, Sign in).
const TextField = forwardRef(function TextField({ label, who, coachName, id, type = 'text', className = '', ...rest }, ref) {
  const autoId = useId();
  const fieldId = id || autoId;
  return (
    <div className={`ds-textbox-field ${className}`.trim()}>
      <FieldLabel label={label} htmlFor={fieldId} who={who} coachName={coachName} />
      <input ref={ref} id={fieldId} type={type} className="ds-field" {...rest} />
    </div>
  );
});

export default TextField;
