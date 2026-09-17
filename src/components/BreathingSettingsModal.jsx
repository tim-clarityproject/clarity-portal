import { useState, useEffect } from 'react';

export default function BreathingSettingsModal({ isOpen, onClose }) {
  const [inhale, setInhale] = useState(4);
  const [hold, setHold] = useState(0);
  const [exhale, setExhale] = useState(6);

  useEffect(() => {
    // Load settings from localStorage
    const saved = localStorage.getItem('breathingSettings');
    if (saved) {
      try {
        const settings = JSON.parse(saved);
        setInhale(settings.inhale || 4);
        setHold(settings.hold || 0);
        setExhale(settings.exhale || 6);
      } catch (e) {
        console.error('Error loading breathing settings:', e);
      }
    }
  }, [isOpen]);

  const handleSave = () => {
    const settings = { inhale, hold, exhale };
    localStorage.setItem('breathingSettings', JSON.stringify(settings));
    onClose();
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
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          padding: '32px',
          maxWidth: '400px',
          width: '90%',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
        }}
      >
        <h2 style={{ fontSize: '20px', fontWeight: 'bold', color: 'black', marginBottom: '24px', margin: 0 }}>
          Breathing Settings
        </h2>

        <p style={{ fontSize: '13px', color: '#666', marginBottom: '24px' }}>
          Customize your breathing cycle. Always: Inhale → Hold (optional) → Exhale → Repeat
        </p>

        {/* Inhale */}
        <div style={{ marginBottom: '24px' }}>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#333', marginBottom: '8px' }}>
            Inhale Duration: {inhale} second{inhale !== 1 ? 's' : ''}
          </label>
          <input
            type="range"
            min="1"
            max="10"
            value={inhale}
            onChange={(e) => setInhale(parseInt(e.target.value))}
            style={{
              width: '100%',
              height: '6px',
              borderRadius: '3px',
              backgroundColor: '#e5e5e5',
              outline: 'none',
              cursor: 'pointer',
              accentColor: '#F08571',
            }}
          />
          <div style={{ fontSize: '12px', color: '#999', marginTop: '4px' }}>
            1-10 seconds
          </div>
        </div>

        {/* Hold */}
        <div style={{ marginBottom: '24px' }}>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#333', marginBottom: '8px' }}>
            Hold Duration: {hold} second{hold !== 1 ? 's' : ''} {hold === 0 ? '(optional)' : ''}
          </label>
          <input
            type="range"
            min="0"
            max="10"
            value={hold}
            onChange={(e) => setHold(parseInt(e.target.value))}
            style={{
              width: '100%',
              height: '6px',
              borderRadius: '3px',
              backgroundColor: '#e5e5e5',
              outline: 'none',
              cursor: 'pointer',
              accentColor: '#F08571',
            }}
          />
          <div style={{ fontSize: '12px', color: '#999', marginTop: '4px' }}>
            0-10 seconds
          </div>
        </div>

        {/* Exhale */}
        <div style={{ marginBottom: '32px' }}>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#333', marginBottom: '8px' }}>
            Exhale Duration: {exhale} second{exhale !== 1 ? 's' : ''}
          </label>
          <input
            type="range"
            min="1"
            max="10"
            value={exhale}
            onChange={(e) => setExhale(parseInt(e.target.value))}
            style={{
              width: '100%',
              height: '6px',
              borderRadius: '3px',
              backgroundColor: '#e5e5e5',
              outline: 'none',
              cursor: 'pointer',
              accentColor: '#F08571',
            }}
          />
          <div style={{ fontSize: '12px', color: '#999', marginTop: '4px' }}>
            1-10 seconds
          </div>
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={handleSave}
            style={{
              flex: 1,
              padding: '12px 24px',
              backgroundColor: '#F08571',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontWeight: '600',
              cursor: 'pointer',
              fontSize: '14px',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => e.target.style.backgroundColor = '#e07560'}
            onMouseLeave={(e) => e.target.style.backgroundColor = '#F08571'}
          >
            Save
          </button>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              padding: '12px 24px',
              backgroundColor: 'transparent',
              color: '#333',
              border: '2px solid #e5e5e5',
              borderRadius: '8px',
              fontWeight: '600',
              cursor: 'pointer',
              fontSize: '14px',
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
        </div>
      </div>
    </div>
  );
}
