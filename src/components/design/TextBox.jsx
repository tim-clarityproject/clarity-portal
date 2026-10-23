import { forwardRef, useId, useImperativeHandle, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import FieldLabel from './FieldLabel';
import FocusWriter from './FocusWriter';
import { SaveStatus } from './Status';
import useCaretClear from './useCaretClear';
import useIsPhone from './useIsPhone';
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
// focusMode:    for long writing (journal, reflections, debrief answers):
//               on a phone, tapping the box opens focus mode
//               (FocusWriter.jsx), a full-screen writing page; Done puts
//               people back in the same place. On a laptop the box stays
//               in the page and grows.
const COUNT_FROM = 20;
const TAP_SLOP_PX = 10;

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
  focusMode = false,
  ...rest
}, forwardedRef) {
  const autoId = useId();
  const boxId = id || autoId;
  const ref = useRef(null);
  useImperativeHandle(forwardedRef, () => ref.current, []);
  useCaretClear(ref);
  const one = lines === 'one';
  const text = value ?? '';

  // Focus mode, on phone only.
  const isPhone = useIsPhone();
  const writer = focusMode && !one && isPhone;
  const [writing, setWriting] = useState(false);
  const writerRef = useRef(null);
  const fieldRef = useRef(null);
  const touch = useRef(null);

  // Opened inside the tap itself, so iPhone shows the keyboard straight
  // away for the writing page.
  const openWriter = () => {
    flushSync(() => setWriting(true));
    const el = writerRef.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    el.setSelectionRange(el.value.length, el.value.length);
  };

  const closeWriter = () => {
    writerRef.current?.blur();
    setWriting(false);
    // Back to this box's place on the page (not into the box, which would
    // open the writing page again).
    requestAnimationFrame(() => fieldRef.current?.focus({ preventScroll: true }));
  };

  const writerHandlers = writer ? {
    'aria-haspopup': 'dialog',
    onTouchStart: (e) => {
      const t = e.touches[0];
      touch.current = t ? { x: t.clientX, y: t.clientY } : null;
    },
    onTouchEnd: (e) => {
      const start = touch.current;
      const t = e.changedTouches[0];
      touch.current = null;
      if (!start || !t) return;
      if (Math.abs(t.clientX - start.x) > TAP_SLOP_PX || Math.abs(t.clientY - start.y) > TAP_SLOP_PX) return;
      e.preventDefault();
      openWriter();
    },
    // Reached another way (a screen reader, a keyboard): open it too.
    onFocus: () => { if (!writing) openWriter(); },
  } : {};

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
    <div ref={fieldRef} tabIndex={writer ? -1 : undefined} className={`ds-textbox-field ${className}`.trim()}>
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
          {...writerHandlers}
        />
      </div>
      {(showCount || saveState) && (
        <div className="ds-textbox-foot">
          {saveState ? <SaveStatus state={saveState} /> : <span />}
          {showCount && <span className="ds-count">{`${text.length} of ${maxLength}`}</span>}
        </div>
      )}
      {writer && (
        <FocusWriter
          ref={writerRef}
          open={writing}
          onClose={closeWriter}
          question={label || ariaLabel}
          who={who}
          coachName={coachName}
          value={text}
          onChange={onChange}
          placeholder={placeholder}
          maxLength={maxLength}
          saveState={saveState}
        />
      )}
    </div>
  );
});

export default TextBox;
