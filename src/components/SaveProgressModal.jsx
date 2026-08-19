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
      navigate('/welcome', { state: { isGuest: location.state?.isGuest } });
    }, 1500);
  };

  const handleDiscard = () => {
    clearProgress();
    navigate('/welcome', { state: { isGuest: location.state?.isGuest } });
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        backdropFilter: 'blur(2px)',
      }}
    >
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '16px',
          padding: '40px',
          maxWidth: '420px',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.15)',
        }}
      >
        <h2
          style={{
            fontSize: '24px',
            fontWeight: 'bold',
            color: '#1a1a1a',
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
                color: '#666',
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
                  backgroundColor: '#F08571',
                  color: 'white',
                  fontWeight: '600',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => (e.target.style.backgroundColor = '#e07560')}
                onMouseLeave={(e) => (e.target.style.backgroundColor = '#F08571')}
              >
                Save & Exit
              </button>
              <button
                onClick={handleDiscard}
                style={{
                  padding: '12px 24px',
                  backgroundColor: 'transparent',
                  color: '#666',
                  fontWeight: '600',
                  border: '1px solid #e5e5e5',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.target.style.backgroundColor = '#f5f5f5';
                  e.target.style.borderColor = '#ccc';
                }}
                onMouseLeave={(e) => {
                  e.target.style.backgroundColor = 'transparent';
                  e.target.style.borderColor = '#e5e5e5';
                }}
              >
                Discard
              </button>
              <button
                onClick={onClose}
                style={{
                  padding: '12px 24px',
                  backgroundColor: 'transparent',
                  color: '#999',
                  fontWeight: '600',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '14px',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => (e.target.style.color = '#333')}
                onMouseLeave={(e) => (e.target.style.color = '#999')}
              >
                Keep Editing
              </button>
            </div>
          </>
        )}
        {saved && (
          <p
            style={{
              color: '#666',
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
