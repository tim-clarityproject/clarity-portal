import { useState } from 'react';
import BreathingGuide from './BreathingGuide';

export default function BreathButton() {
  const [showBreathing, setShowBreathing] = useState(false);

  return (
    <>
      <style>{`
        .breathe-button {
          bottom: 104px;
          right: 24px;
          width: 48px;
          height: 48px;
        }
      `}</style>
      <button
        className="breathe-button"
        onClick={() => setShowBreathing(true)}
        style={{
          position: 'fixed',
          borderRadius: '50%',
          backgroundColor: '#F08571',
          border: 'none',
          color: 'white',
          fontSize: '8px',
          fontWeight: 'bold',
          cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(240, 133, 113, 0.3)',
          transition: 'all 0.2s',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 999,
          padding: 0,
          lineHeight: '1',
        }}
        onMouseEnter={(e) => {
          e.target.style.backgroundColor = '#e07560';
          e.target.style.transform = 'scale(1.1)';
        }}
        onMouseLeave={(e) => {
          e.target.style.backgroundColor = '#F08571';
          e.target.style.transform = 'scale(1)';
        }}
        title="Take a breath"
      >
        BREATHE
      </button>

      <BreathingGuide isOpen={showBreathing} onClose={() => setShowBreathing(false)} />
    </>
  );
}
