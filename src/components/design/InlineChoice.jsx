import { useId, useLayoutEffect, useRef } from 'react';
import FieldLabel from './FieldLabel';
import useInlineForm from './useInlineForm';
import './design.css';

// Pills or full-width answer rows, chosen automatically (Tim, 23 Oct;
// M6 "How long a Recovery?" and "Which best describes you?"): pills
// only when every option fits on one line, equal widths on phone, never
// wrapping; otherwise rows. See useInlineForm.js.
//
// semantics 'radio':   pick one (Choice). Arrow keys move and choose.
// semantics 'pressed': a segmented control switching views.
// form:                'pills' or 'rows' to force one form.
// options:             [{ value, label, note }], note being a small grey
//                      word after the label, e.g. "suggested".
export default function InlineChoice({
  label,
  ariaLabel,
  options,
  value,
  onChange,
  semantics = 'radio',
  form: forced,
  who,
  coachName,
  className = '',
}) {
  const labelId = useId();
  const refs = useRef([]);
  const signature = options.map((o) => `${o.label}${o.note || ''}`).join('\u0000');
  const { form, isPhone, boxRef, measureRef } = useInlineForm(forced, signature);
  const radio = semantics === 'radio';
  const selectedIndex = Math.max(0, options.findIndex((o) => o.value === value));

  // When the space changes (the phone turns) and pills become rows or
  // back, the buttons are new; if one had focus, the same one gets it.
  const focused = useRef(null);
  useLayoutEffect(() => {
    const at = focused.current;
    if (at == null) return;
    const el = refs.current[at];
    const lost = !document.activeElement || document.activeElement === document.body
      || !boxRef.current?.contains(document.activeElement);
    if (el && lost) el.focus({ preventScroll: true });
  }, [form, boxRef]);

  const moveTo = (next) => {
    onChange(options[next].value);
    const el = refs.current[next];
    if (!el) return;
    // Only as far as needed to see it, never a jump to the end.
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: 'nearest' });
  };
  const move = (from, step) => moveTo((from + step + options.length) % options.length);

  const groupProps = {
    role: radio ? 'radiogroup' : 'group',
    'aria-labelledby': label ? labelId : undefined,
    'aria-label': label ? undefined : ariaLabel,
  };

  const buttons = options.map((option, i) => {
    const on = option.value === value;
    const stateProps = radio
      ? { role: 'radio', 'aria-checked': on, tabIndex: i === selectedIndex ? 0 : -1 }
      : { 'aria-pressed': on };
    return (
      <button
        key={option.value}
        ref={(el) => { refs.current[i] = el; }}
        type="button"
        className={form === 'pills' ? 'ds-seg-btn' : 'ds-answer'}
        {...stateProps}
        onClick={() => onChange(option.value)}
        onFocus={() => { focused.current = i; }}
        onBlur={(e) => { if (e.relatedTarget) focused.current = null; }}
        onKeyDown={radio ? (e) => {
          if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); move(i, 1); }
          if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); move(i, -1); }
          if (e.key === 'Home') { e.preventDefault(); moveTo(0); }
          if (e.key === 'End') { e.preventDefault(); moveTo(options.length - 1); }
        } : undefined}
      >
        <span>{option.label}</span>
        {option.note && <small className="ds-answer-note">{option.note}</small>}
      </button>
    );
  });

  return (
    <div className={`ds-choice ${className}`.trim()}>
      {label && <FieldLabel label={label} id={labelId} who={who} coachName={coachName} />}
      <div ref={boxRef} className="ds-inline">
        {!forced && (
          <div ref={measureRef} className="ds-seg ds-seg-measure" aria-hidden="true">
            {options.map((option) => (
              <span key={option.value} className="ds-seg-measure-pill">
                {option.label}
                {option.note && <small className="ds-answer-note">{option.note}</small>}
              </span>
            ))}
          </div>
        )}
        {/* Keyed by form, so switching between pills and rows is instant
            (a reused button would fade from one look to the other). */}
        {form === 'pills'
          ? <div key="pills" className={`ds-seg${isPhone ? ' ds-seg--equal' : ''}`} {...groupProps}>{buttons}</div>
          : <div key="rows" className="ds-rows" {...groupProps}>{buttons}</div>}
      </div>
    </div>
  );
}
