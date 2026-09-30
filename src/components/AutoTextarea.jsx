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

  const charCountPercent = maxLength ? (charCount / maxLength) * 100 : 0;
  const isNearLimit = charCountPercent >= 90;

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
          backgroundColor: 'var(--bg)',
          border: '1px solid var(--line)',
          borderRadius: 'var(--radius-input)',
          padding: '13px 14px',
          minHeight: '88px',
          maxHeight: 'calc(var(--fs-input) * 1.5 * 8)',
          color: 'var(--text)',
          boxSizing: 'border-box',
          resize: 'none',
          transition: 'border-color var(--dur) var(--ease)',
          overflow: 'hidden',
        }}
        onFocus={(e) => {
          e.target.style.borderColor = 'var(--coral)';
          e.target.style.outline = '2px solid var(--text)';
          e.target.style.outlineOffset = '3px';
        }}
        onBlur={(e) => {
          e.target.style.borderColor = 'var(--line)';
          e.target.style.outline = 'none';
        }}
      />
      {maxLength && charCount > 0 && (
        <div
          style={{
            fontSize: '13px',
            color: isNearLimit ? 'var(--coral-text)' : 'var(--text-2)',
            marginTop: 'var(--space-2)',
            textAlign: 'right',
            transition: 'color var(--dur) var(--ease)',
          }}
        >
          {charCount}/{maxLength} characters
        </div>
      )}
    </div>
  );
}
