import { useState } from 'react';

export default function NamingModal({ isOpen, itemType, onConfirm, onCancel, defaultName = '' }) {
  const [name, setName] = useState(defaultName);

  const handleConfirm = () => {
    if (name.trim()) {
      onConfirm(name.trim());
      setName('');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleConfirm();
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="ui-root naming-modal-overlay" onClick={onCancel}>
      <style>{`
        .ui-root.naming-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: var(--scrim);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }
        .ui-root.naming-modal-overlay input::placeholder { color: var(--label); }
      `}</style>
      <div
        style={{
          backgroundColor: 'var(--raised)',
          borderRadius: '12px',
          padding: '32px',
          maxWidth: '400px',
          width: '90%',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ fontSize: '18px', fontWeight: '600', color: 'var(--text)', marginBottom: '24px' }}>
          Give your {itemType} a name
        </h2>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type here"
          autoFocus
          style={{
            width: '100%',
            padding: '12px 16px',
            border: '2px solid var(--field-line)',
            borderRadius: '8px',
            backgroundColor: 'var(--card)',
            color: 'var(--text)',
            fontSize: '14px',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            boxSizing: 'border-box',
            marginBottom: '32px',
            outline: 'none',
          }}
          onFocus={(e) => (e.target.style.borderColor = 'var(--coral-text)')}
          onBlur={(e) => (e.target.style.borderColor = 'var(--field-line)')}
        />
        <div style={{ display: 'flex', gap: '16px', justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{
              padding: '12px 24px',
              backgroundColor: 'transparent',
              border: '2px solid var(--outline)',
              borderRadius: '6px',
              color: 'var(--text)',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s',
              minWidth: '100px',
              textAlign: 'center',
            }}
            onMouseEnter={(e) => {
              e.target.style.borderColor = 'var(--coral-text)';
              e.target.style.backgroundColor = 'var(--card)';
            }}
            onMouseLeave={(e) => {
              e.target.style.borderColor = 'var(--outline)';
              e.target.style.backgroundColor = 'transparent';
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!name.trim()}
            style={{
              padding: '12px 24px',
              backgroundColor: name.trim() ? 'var(--coral)' : 'var(--line)',
              border: 'none',
              borderRadius: '6px',
              color: name.trim() ? 'var(--on-coral)' : 'var(--label)',
              fontSize: '14px',
              fontWeight: '600',
              cursor: name.trim() ? 'pointer' : 'not-allowed',
              transition: 'all 0.2s',
              minWidth: '120px',
              textAlign: 'center',
            }}
            onMouseEnter={(e) => {
              if (name.trim()) {
                e.target.style.backgroundColor = 'var(--coral-hover)';
              }
            }}
            onMouseLeave={(e) => {
              if (name.trim()) {
                e.target.style.backgroundColor = 'var(--coral)';
              }
            }}
          >
            Save {itemType}
          </button>
        </div>
      </div>
    </div>
  );
}
