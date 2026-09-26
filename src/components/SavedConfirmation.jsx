import { useEffect } from 'react';

export default function SavedConfirmation({ isVisible, onDismiss }) {
  useEffect(() => {
    if (!isVisible) return;

    // Auto-dismiss after 2 seconds
    const timer = setTimeout(() => {
      onDismiss();
    }, 2000);

    return () => clearTimeout(timer);
  }, [isVisible, onDismiss]);

  if (!isVisible) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 5000,
        animation: 'fadeScaleIn 0.3s ease-out',
      }}
    >
      <style>{`
        @keyframes fadeScaleIn {
          from {
            opacity: 0;
            transform: translate(-50%, -50%) scale(0.8);
          }
          to {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1);
          }
        }

        @keyframes drawCheckmark {
          from {
            stroke-dashoffset: 50;
          }
          to {
            stroke-dashoffset: 0;
          }
        }
      `}</style>

      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '24px',
          width: '140px',
          height: '140px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '24px',
          boxShadow: '0 12px 40px rgba(0, 0, 0, 0.15)',
        }}
      >
        {/* Animated Checkmark - Larger */}
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" style={{ marginTop: '8px' }}>
          <path
            d="M4 12.5L10 18.5L20 7.5"
            stroke="#5ECCC0"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="50"
            style={{
              animation: 'drawCheckmark 0.6s ease-out forwards',
            }}
          />
        </svg>

        {/* Text */}
        <span
          style={{
            color: '#333',
            fontSize: '16px',
            fontWeight: '600',
            letterSpacing: '0.3px',
            marginBottom: '4px',
          }}
        >
          Saved
        </span>
      </div>
    </div>
  );
}
