import { useRef, useEffect, useState } from 'react';

export default function AutoTextarea({ value, onChange, maxLength, placeholder, disabled }) {
  const textareaRef = useRef(null);
  const [charCount, setCharCount] = useState(0);

  useEffect(() => {
    if (textareaRef.current) {
      // Reset height to auto to calculate scrollHeight
      textareaRef.current.style.height = 'auto';

      // Calculate minimum height (2 rows)
      const minHeight = 88;

      // Calculate maximum height (8 rows, approximately)
      const lineHeight = parseInt(window.getComputedStyle(textareaRef.current).lineHeight);
      const maxHeight = lineHeight * 8;

      // Set height to scrollHeight, constrained by min and max
      const newHeight = Math.min(Math.max(textareaRef.current.scrollHeight, minHeight), maxHeight);
      textareaRef.current.style.height = `${newHeight}px`;
    }

    if (maxLength && value) {
      setCharCount(value.length);
    }
  }, [value, maxLength]);

  const isAtLimit = maxLength ? charCount >= maxLength : false;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        rows={2}
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: 'var(--fs-input)',
          backgroundColor: 'var(--surface)',
          border: '1px solid var(--line)',
          borderRadius: 'var(--radius-input)',
          padding: '13px 14px',
          minHeight: '88px',
          maxHeight: 'calc(var(--fs-input) * 1.5 * 8)',
          color: 'var(--text)',
          caretColor: 'var(--coral)',
          boxSizing: 'border-box',
          resize: 'none',
          transition: 'border-color var(--dur) var(--ease)',
          overflow: 'hidden',
        }}
        onFocus={(e) => {
          e.target.style.borderColor = 'var(--coral)';
        }}
        onBlur={(e) => {
          e.target.style.borderColor = 'var(--line)';
        }}
      />
      {maxLength && charCount > 0 && (
        <div
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '12px',
            color: isAtLimit ? 'var(--coral-soft)' : 'var(--placeholder)',
            marginTop: '6px',
            transition: 'color var(--dur) var(--ease)',
          }}
        >
          {charCount}/{maxLength} characters
        </div>
      )}
    </div>
  );
}
