import { useState, useRef, useEffect, useId } from 'react';

// Shared field styles for the new pre-login Welcome flow. Styles live
// in src/styles/components.css under ".ui-root .auth-field-*" / ".auth-input".

// Triggers the 420ms shake class on an already-mounted field whenever
// `trigger` changes to a truthy, new value - lets a parent re-trigger
// the same shake on repeated invalid submits.
function useShake(trigger) {
  const [shaking, setShaking] = useState(false);
  const prevTrigger = useRef(trigger);
  useEffect(() => {
    if (trigger && trigger !== prevTrigger.current) {
      setShaking(true);
      const t = setTimeout(() => setShaking(false), 420);
      prevTrigger.current = trigger;
      return () => clearTimeout(t);
    }
    prevTrigger.current = trigger;
  }, [trigger]);
  return shaking;
}

export function AuthTextField({
  label,
  type = 'text',
  value,
  onChange,
  placeholder,
  error,
  shakeToken,
  id,
  ...inputProps
}) {
  const autoId = useId();
  const fieldId = id || autoId;
  const shaking = useShake(shakeToken ?? error);
  const [focused, setFocused] = useState(false);

  return (
    <div className="auth-field">
      <label htmlFor={fieldId} className={`auth-field-label${focused ? ' focused' : ''}`}>
        {label}
      </label>
      <input
        id={fieldId}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className={`auth-input${error ? ' error' : ''}${shaking ? ' shake' : ''}`}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? `${fieldId}-error` : undefined}
        {...inputProps}
      />
      {error && (
        <p id={`${fieldId}-error`} className="auth-field-error">{error}</p>
      )}
    </div>
  );
}

export function AuthPasswordField({
  label,
  labelExtra,
  value,
  onChange,
  placeholder,
  error,
  shakeToken,
  id,
  ...inputProps
}) {
  const autoId = useId();
  const fieldId = id || autoId;
  const shaking = useShake(shakeToken ?? error);
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(false);

  return (
    <div className="auth-field">
      <div className="auth-field-label-row">
        <label htmlFor={fieldId} className={`auth-field-label${focused ? ' focused' : ''}`}>
          {label}
        </label>
        {labelExtra}
      </div>
      <div className="auth-password-wrap">
        <input
          id={fieldId}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className={`auth-input auth-input-password${error ? ' error' : ''}${shaking ? ' shake' : ''}`}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? `${fieldId}-error` : undefined}
          {...inputProps}
        />
        <button
          type="button"
          className="auth-password-toggle"
          aria-pressed={visible}
          onClick={() => setVisible((v) => !v)}
        >
          {visible ? 'HIDE' : 'SHOW'}
        </button>
      </div>
      {error && (
        <p id={`${fieldId}-error`} className="auth-field-error">{error}</p>
      )}
    </div>
  );
}

export { useShake };
