import { Trash2 } from 'lucide-react';
import { useContext } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { saveProgress, clearProgress } from '../lib/saveProgress';
import { AuthContext } from '../context/AuthContext';
import { dataSyncManager } from '../lib/dataSyncManager';

export default function SaveDiscardButtons({ formData, pageType = 'decision', toolType = null }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const isGuest = location.state?.isGuest || false;

  const handleSaveAsDraft = async () => {
    const pageIdentifier = location.pathname.replace('/', '');

    // Save to localStorage
    saveProgress(pageIdentifier, formData, location.state);

    // If authenticated, also save to Supabase with draft flag
    if (user && toolType) {
      try {
        await dataSyncManager.syncLocalToServer(user.id, toolType, formData, true); // true = draft
      } catch (error) {
        console.error('Error syncing to server:', error);
      }
    }

    // Navigate to decision history
    navigate('/decision-history', { state: { isGuest } });
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
        title="Discard this entry"
        style={{
          padding: '12px',
          backgroundColor: 'transparent',
          color: '#d32f2f',
          border: 'none',
          borderRadius: '8px',
          cursor: 'pointer',
          transition: 'all 0.2s',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        onMouseEnter={(e) => {
          e.target.style.backgroundColor = '#ffebee';
          e.target.style.color = '#ef5350';
        }}
        onMouseLeave={(e) => {
          e.target.style.backgroundColor = 'transparent';
          e.target.style.color = '#d32f2f';
        }}
      >
        <Trash2 size={20} />
      </button>
    </div>
  );
}
