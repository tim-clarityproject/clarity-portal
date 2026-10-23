import { forwardRef, useId, useImperativeHandle, useRef } from 'react';
import FieldLabel from './FieldLabel';
import { SaveStatus } from './Status';
import useCaretClear from './useCaretClear';
import './design.css';

// The steady text box (Tim, 21 Oct: the live journal bug; M6 and design
// reference v3 for the look). One shared box that never jumps:
//
// - It grows as people type by the grow-wrap method: an invisible copy of
//   the text sits in the same grid cell and sizes the box, so the box is
//   never shrunk and re-measured on a keystroke and the page is never
//   scrolled by code while typing.
// - The line being typed stays clear of the keyboard (useCaretClear.js:
//   only on focus, keyboard and rotation, never per keystroke).
// - Box colour, box-edge outline turning coral on focus, 17px text at
//   1.45, 20px each side and 15px top and bottom, 14px corners, at least
//   88px tall when empty (58px for one line).
// - It saves by itself: pass the state from useAutosave() as `saveState`
//   to show the shared Saving and Saved under the box.
//
// lines 'many': a long answer (Enter starts a new line).
// lines 'one':  a short answer that still grows if it's long, but Enter
//               never adds a line and pasted line breaks become spaces.
// who:          the who-sees lock label in the label row.
// maxLength:    shows "112 of 120" once within 20 of the limit.
const COUNT_FROM = 20;

const TextBox = forwardRef(function TextBox({
  label,
  ariaLabel,
  who,
  coachName,
  value,
  onChange,
  lines = 'many',
  placeholder,
  maxLength,
  saveState,
  id,
  className = '',
  onKeyDown,
  ...rest
}, forwardedRef) {
  const autoId = useId();
  const boxId = id || autoId;
  const ref = useRef(null);
  useImperativeHandle(forwardedRef, () => ref.current, []);
  useCaretClear(ref);
  const one = lines === 'one';
  const text = value ?? '';

  const change = (e) => {
    const next = one ? e.target.value.replace(/\r?\n/g, ' ') : e.target.value;
    onChange(next);
  };

  const keyDown = (e) => {
    if (one && e.key === 'Enter') e.preventDefault();
    onKeyDown?.(e);
  };

  const showCount = maxLength && text.length >= maxLength - COUNT_FROM;

  return (
    <div className={`ds-textbox-field ${className}`.trim()}>
      <FieldLabel label={label} htmlFor={label ? boxId : undefined} who={who} coachName={coachName} />
      {/* The trailing space keeps an empty last line its height. */}
      <div className={`ds-grow${one ? ' ds-grow--one' : ''}`} data-value={`${text} `}>
        <textarea
          ref={ref}
          id={boxId}
          className="ds-text"
          rows={1}
          value={text}
          onChange={change}
          onKeyDown={keyDown}
          placeholder={placeholder}
          maxLength={maxLength}
          aria-label={label ? undefined : ariaLabel}
          enterKeyHint={one ? 'done' : undefined}
          {...rest}
        />
      </div>
      {(showCount || saveState) && (
        <div className="ds-textbox-foot">
          {saveState ? <SaveStatus state={saveState} /> : <span />}
          {showCount && <span className="ds-count">{`${text.length} of ${maxLength}`}</span>}
        </div>
      )}
    </div>
  );
});

export default TextBox;
