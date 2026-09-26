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
        bottom: '32px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 3000,
        animation: 'slideUp 0.3s ease-out',
      }}
    >
      <style>{`
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateX(-50%) translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
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
          backgroundColor: '#5ECCC0',
          borderRadius: '12px',
          padding: '16px 24px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          boxShadow: '0 8px 24px rgba(94, 204, 192, 0.3)',
          minWidth: '160px',
          justifyContent: 'center',
        }}
      >
        {/* Animated Checkmark */}
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path
            d="M4 12.5L10 18.5L20 7.5"
            stroke="white"
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
            color: 'white',
            fontSize: '16px',
            fontWeight: '600',
            letterSpacing: '0.3px',
          }}
        >
          Saved
        </span>
      </div>
    </div>
  );
}
