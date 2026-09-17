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
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onCancel}
    >
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          padding: '32px',
          maxWidth: '400px',
          width: '90%',
          boxShadow: '0 10px 40px rgba(0, 0, 0, 0.2)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#333', marginBottom: '16px', margin: 0 }}>
          Give your {itemType} a name
        </h2>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Name your ${itemType}...`}
          autoFocus
          style={{
            width: '100%',
            padding: '12px 16px',
            border: '2px solid #e5e5e5',
            borderRadius: '8px',
            fontSize: '14px',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            boxSizing: 'border-box',
            marginBottom: '24px',
            outline: 'none',
          }}
          onFocus={(e) => (e.target.style.borderColor = '#F08571')}
          onBlur={(e) => (e.target.style.borderColor = '#e5e5e5')}
        />
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{
              padding: '10px 20px',
              backgroundColor: 'transparent',
              border: '2px solid #e5e5e5',
              borderRadius: '6px',
              color: '#333',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.target.style.borderColor = '#F08571';
              e.target.style.backgroundColor = '#FEE5DE';
            }}
            onMouseLeave={(e) => {
              e.target.style.borderColor = '#e5e5e5';
              e.target.style.backgroundColor = 'transparent';
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!name.trim()}
            style={{
              padding: '10px 20px',
              backgroundColor: name.trim() ? '#F08571' : '#ccc',
              border: 'none',
              borderRadius: '6px',
              color: 'white',
              fontSize: '14px',
              fontWeight: '600',
              cursor: name.trim() ? 'pointer' : 'not-allowed',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              if (name.trim()) {
                e.target.style.backgroundColor = '#e07560';
              }
            }}
            onMouseLeave={(e) => {
              if (name.trim()) {
                e.target.style.backgroundColor = '#F08571';
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
