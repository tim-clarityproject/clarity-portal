import { useState } from 'react';
import BreathingGuide from './BreathingGuide';

export default function BreathButton() {
  const [showBreathing, setShowBreathing] = useState(false);

  return (
    <>
      <button
        onClick={() => setShowBreathing(true)}
        style={{
          position: 'fixed',
          bottom: '100px',
          right: '24px',
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          backgroundColor: '#F08571',
          border: 'none',
          color: 'white',
          fontSize: '24px',
          fontWeight: 'bold',
          cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(240, 133, 113, 0.3)',
          transition: 'all 0.2s',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 999,
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
        💨
      </button>

      <BreathingGuide isOpen={showBreathing} onClose={() => setShowBreathing(false)} />
    </>
  );
}
