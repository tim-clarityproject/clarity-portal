import { Trash2 } from 'lucide-react';
import { useContext } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { saveProgress, clearProgress } from '../lib/saveProgress';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

export default function SaveDiscardButtons({ formData, pageType = 'decision', toolType = null, onNext = null, canNext = true, onBack = null, nextLabel = 'Continue' }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const isGuest = location.state?.isGuest || false;

  const handleSaveAsDraft = async () => {
    const pageIdentifier = location.pathname.replace('/', '');

    // Save to localStorage
    saveProgress(pageIdentifier, formData, location.state);

    // If authenticated, save to Supabase with draft flag
    if (user && toolType) {
      try {
        await supabase
          .from('decisions')
          .insert([{
            user_id: user.id,
            tool_type: toolType,
            title: formData.goal || 'Untitled Decision',
            form_data: formData,
            status: 'draft',
            draft: true
          }]);
      } catch (error) {
        console.error('Error saving draft to server:', error);
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
    <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', alignItems: 'center', marginTop: '24px' }}>
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          style={{
            padding: '12px 24px',
            backgroundColor: 'transparent',
            border: '2px solid #e5e5e5',
            borderRadius: '8px',
            color: '#333',
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
          Back
        </button>
      )}

      <button
        type="button"
        onClick={handleDiscard}
        title="Discard this entry"
        style={{
          padding: '12px',
          backgroundColor: 'transparent',
          color: '#F08571',
          border: 'none',
          borderRadius: '8px',
          cursor: 'pointer',
          transition: 'all 0.2s',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        onMouseEnter={(e) => {
          e.target.style.backgroundColor = '#FEE5DE';
          e.target.style.color = '#e07560';
        }}
        onMouseLeave={(e) => {
          e.target.style.backgroundColor = 'transparent';
          e.target.style.color = '#F08571';
        }}
      >
        <Trash2 size={20} />
      </button>

      <button
        type="button"
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
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
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

      {onNext && (
        <button
          type="button"
          onClick={onNext}
          disabled={!canNext}
          style={{
            padding: '12px 24px',
            backgroundColor: !canNext ? '#ccc' : '#F08571',
            color: 'white',
            fontWeight: 'bold',
            border: 'none',
            borderRadius: '8px',
            cursor: !canNext ? 'not-allowed' : 'pointer',
            fontSize: '14px',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => !canNext || (e.target.style.backgroundColor = '#e07560')}
          onMouseLeave={(e) => !canNext || (e.target.style.backgroundColor = '#F08571')}
        >
          {nextLabel}
        </button>
      )}
    </div>
  );
}
