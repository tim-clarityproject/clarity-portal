import { useId, useRef, useState } from 'react';

const LENGTH = 6;

/** Letters and numbers only, capitals, at most six characters. */
export const cleanCode = (value) => value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, LENGTH);

/**
 * The access code as six boxes. It is ONE real input laid invisibly over the
 * boxes, so phone autofill (one-time-code), paste, autocapitalisation and
 * screen readers all behave as with any single field. Enter submits the
 * surrounding form.
 *
 * @param {{value: string, onChange: (next: string) => void}} props
 */
export default function AccessCodeInput({ value, onChange }) {
  const id = useId();
  const inputRef = useRef(null);
  const [focused, setFocused] = useState(false);

  const toEnd = () => {
    const el = inputRef.current;
    if (el) {
      const end = el.value.length;
      el.setSelectionRange(end, end);
    }
  };

  const activeIndex = Math.min(value.length, LENGTH - 1);

  return (
    <div className="auth-field">
      <label htmlFor={id} className={`auth-field-label${focused ? ' focused' : ''}`}>
        Access code
      </label>
      <div className="al-otp" onClick={() => { inputRef.current?.focus(); toEnd(); }}>
        {Array.from({ length: LENGTH }, (_, i) => {
          const isActive = focused && i === activeIndex;
          return (
            <span key={i} className={`al-otp-box${isActive ? ' al-otp-box--active' : ''}`} aria-hidden="true">
              {value[i] || ''}
              {isActive && value.length < LENGTH && <i className="al-otp-caret" />}
            </span>
          );
        })}
        <input
          id={id}
          ref={inputRef}
          className="al-otp-input"
          value={value}
          maxLength={LENGTH}
          aria-label="Access code, 6 characters"
          autoComplete="one-time-code"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          inputMode="text"
          onChange={(e) => onChange(cleanCode(e.target.value))}
          onFocus={() => { setFocused(true); requestAnimationFrame(toEnd); }}
          onBlur={() => setFocused(false)}
          onSelect={toEnd}
          onPaste={(e) => {
            // A pasted code replaces whatever is there, so a full field can be re-pasted.
            const text = e.clipboardData?.getData('text');
            if (!text) return;
            e.preventDefault();
            onChange(cleanCode(text));
          }}
        />
      </div>
    </div>
  );
}
