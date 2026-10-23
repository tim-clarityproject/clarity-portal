import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { saveProgress, clearProgress } from '../lib/saveProgress';

export default function SaveProgressModal({ formData, currentPage, isOpen, onClose }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    saveProgress(currentPage, formData, location.state);
    setSaved(true);
    setTimeout(() => {
      navigate('/welcome', { state: {  } });
    }, 1500);
  };

  const handleDiscard = () => {
    clearProgress();
    navigate('/welcome', { state: {  } });
  };

  if (!isOpen) return null;

  return (
    <div className="ui-root save-progress-overlay">
      <style>{`
        .ui-root.save-progress-overlay {
          position: fixed;
          inset: 0;
          background-color: var(--scrim);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }
      `}</style>
      <div
        style={{
          backgroundColor: 'var(--raised)',
          borderRadius: '16px',
          padding: '40px',
          maxWidth: '420px',
        }}
      >
        <h2
          style={{
            fontSize: '24px',
            fontWeight: 'bold',
            color: 'var(--text)',
            marginBottom: '12px',
            marginTop: 0,
          }}
        >
          {saved ? 'Progress Saved!' : 'Save Your Progress?'}
        </h2>
        {!saved && (
          <>
            <p
              style={{
                color: 'var(--text-2)',
                fontSize: '15px',
                marginBottom: '32px',
                lineHeight: '1.6',
                margin: '12px 0 32px 0',
              }}
            >
              You can save your responses to return to later or discard them.
            </p>
            <div
              style={{
                display: 'flex',
                gap: '12px',
                justifyContent: 'space-between',
                flexDirection: 'column',
              }}
            >
              <button
                onClick={handleSave}
                style={{
                  padding: '12px 24px',
                  backgroundColor: 'var(--coral)',
                  color: 'var(--on-coral)',
                  fontWeight: '600',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => (e.target.style.backgroundColor = 'var(--coral-hover)')}
                onMouseLeave={(e) => (e.target.style.backgroundColor = 'var(--coral)')}
              >
                Save & Exit
              </button>
              <button
                onClick={handleDiscard}
                style={{
                  padding: '12px 24px',
                  backgroundColor: 'transparent',
                  color: 'var(--text-2)',
                  fontWeight: '600',
                  border: '1px solid var(--outline)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.target.style.backgroundColor = 'var(--card)';
                  e.target.style.borderColor = 'var(--quiet-line)';
                }}
                onMouseLeave={(e) => {
                  e.target.style.backgroundColor = 'transparent';
                  e.target.style.borderColor = 'var(--outline)';
                }}
              >
                Discard
              </button>
              <button
                onClick={onClose}
                style={{
                  padding: '12px 24px',
                  backgroundColor: 'transparent',
                  color: 'var(--label)',
                  fontWeight: '600',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '14px',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => (e.target.style.color = 'var(--text)')}
                onMouseLeave={(e) => (e.target.style.color = 'var(--label)')}
              >
                Keep Editing
              </button>
            </div>
          </>
        )}
        {saved && (
          <p
            style={{
              color: 'var(--text-2)',
              fontSize: '15px',
              marginBottom: '0',
              lineHeight: '1.6',
            }}
          >
            Your progress has been saved. Redirecting to home...
          </p>
        )}
      </div>
    </div>
  );
}
