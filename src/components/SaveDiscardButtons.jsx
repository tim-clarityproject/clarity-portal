import { Trash2 } from 'lucide-react';
import { saveProgress, clearProgress } from '../lib/saveProgress';
import { useLocation, useNavigate } from 'react-router-dom';

export default function SaveDiscardButtons({ formData, pageType = 'decision' }) {
  const navigate = useNavigate();
  const location = useLocation();
  const isGuest = location.state?.isGuest || false;

  const handleSaveAsDraft = () => {
    const pageIdentifier = location.pathname.replace('/', '');
    saveProgress(pageIdentifier, formData, location.state);
    alert('Progress saved! You can return to this later.');
  };

  const handleDiscard = () => {
    if (window.confirm('Are you sure you want to discard this entry?')) {
      clearProgress();
      if (pageType === 'decision') {
        navigate('/decision-tools', { state: { isGuest } });
      } else if (pageType === 'journal') {
        navigate('/my-journal', { state: { isGuest } });
      }
    }
  };

  return (
    <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginTop: '24px' }}>
      <button
        onClick={handleSaveAsDraft}
        style={{
          padding: '12px 24px',
          backgroundColor: 'transparent',
          color: '#F08571',
          fontWeight: '600',
          border: '2px solid #F08571',
          borderRadius: '8px',
          cursor: 'pointer',
          fontSize: '14px',
          transition: 'all 0.2s',
        }}
        onMouseEnter={(e) => {
          e.target.style.backgroundColor = '#FEE5DE';
          e.target.style.borderColor = '#e07560';
        }}
        onMouseLeave={(e) => {
          e.target.style.backgroundColor = 'transparent';
          e.target.style.borderColor = '#F08571';
        }}
      >
        Save as Draft
      </button>

      <button
        onClick={handleDiscard}
        style={{
          padding: '12px 24px',
          backgroundColor: 'transparent',
          color: '#d32f2f',
          fontWeight: '600',
          border: '2px solid #ffcdd2',
          borderRadius: '8px',
          cursor: 'pointer',
          fontSize: '14px',
          transition: 'all 0.2s',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}
        onMouseEnter={(e) => {
          e.target.style.backgroundColor = '#ffebee';
          e.target.style.borderColor = '#ef5350';
        }}
        onMouseLeave={(e) => {
          e.target.style.backgroundColor = 'transparent';
          e.target.style.borderColor = '#ffcdd2';
        }}
      >
        <Trash2 size={18} />
        Discard
      </button>
    </div>
  );
}
