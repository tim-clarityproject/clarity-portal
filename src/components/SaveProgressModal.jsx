import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { saveProgress, clearProgress } from '../lib/saveProgress';
import { Button, Popup } from './design';

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

  return (
    <Popup
      open={isOpen}
      onClose={onClose}
      title={saved ? 'Progress Saved!' : 'Save Your Progress?'}
      footer={saved ? null : (
        <>
          <Button variant="primary" onClick={handleSave}>Save & Exit</Button>
          <Button variant="outline" onClick={handleDiscard}>Discard</Button>
          <Button variant="text" onClick={onClose}>Keep Editing</Button>
        </>
      )}
    >
      {!saved && (
        <p style={{ color: 'var(--text-2)', fontSize: 'calc(15 * var(--u, 1px))', lineHeight: '1.6', margin: 0 }}>
          You can save your responses to return to later or discard them.
        </p>
      )}
      {saved && (
        <p style={{ color: 'var(--text-2)', fontSize: 'calc(15 * var(--u, 1px))', lineHeight: '1.6', margin: 0 }}>
          Your progress has been saved. Redirecting to home
        </p>
      )}
    </Popup>
  );
}
