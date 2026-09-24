import { Trash2 } from 'lucide-react';
import { useContext, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { saveProgress, clearProgress, AUTO_SAVE_KEY } from '../lib/saveProgress';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

export default function SaveDiscardButtons({ formData, pageType = 'decision', toolType = null, onNext = null, canNext = true, onBack = null, onSaveAsDraft = null, nextLabel = 'Continue' }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const [isSaving, setIsSaving] = useState(false);

  const saveToSupabase = async () => {
    if (!user || !toolType) return null;

    try {
      setIsSaving(true);
      const decisionId = location.state?.decisionId;
      const dateTitle = new Date().toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
      const title = location.state?.problemTitle || location.state?.title || dateTitle;

      if (decisionId) {
        // Update existing decision
        const { data, error } = await supabase
          .from('decisions')
          .update({
            form_data: formData,
            updated_at: new Date().toISOString()
          })
          .eq('id', decisionId)
          .eq('user_id', user.id)
          .select();

        if (error) {
          console.error('Error updating decision:', error);
          return null;
        }
        return decisionId;
      } else {
        // Insert new decision
        const { data, error } = await supabase
          .from('decisions')
          .insert([{
            user_id: user.id,
            tool_type: toolType,
            title,
            form_data: formData,
            status: 'in_progress'
          }])
          .select();

        if (error) {
          console.error('Error inserting decision:', error);
          return null;
        }
        return data?.[0]?.id;
      }
    } catch (error) {
      console.error('Error saving to Supabase:', error);
      return null;
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAsDraft = async () => {
    const pageIdentifier = location.pathname.replace('/', '');

    // If authenticated, save to Supabase with draft flag
    if (user && toolType) {
      try {
        setIsSaving(true);
        const decisionId = location.state?.decisionId;
        const dateTitle = new Date().toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
        const title = location.state?.problemTitle || location.state?.title || dateTitle;

        if (decisionId) {
          // Update existing decision with draft status
          await supabase
            .from('decisions')
            .update({
              form_data: formData,
              status: 'draft',
              draft: true,
              updated_at: new Date().toISOString()
            })
            .eq('id', decisionId)
            .eq('user_id', user.id);
        } else {
          // Insert new decision with draft status
          await supabase
            .from('decisions')
            .insert([{
              user_id: user.id,
              tool_type: toolType,
              title,
              form_data: formData,
              status: 'draft',
              draft: true
            }]);
        }
        // Clear localStorage after successful save
        clearProgress();
      } catch (error) {
        console.error('Error saving draft to server:', error);
        // Keep localStorage in case user wants to retry
        saveProgress(pageIdentifier, formData, location.state);
        setIsSaving(false);
        return;
      }
    } else {
      // Save to localStorage if not authenticated
      saveProgress(pageIdentifier, formData, location.state);
    }

    setIsSaving(false);
    // Navigate to decision history
    navigate('/decision-history');
  };

  const handleNext = async () => {
    if (!onNext || isSaving) return;

    // Auto-save to Supabase before proceeding
    if (user && toolType) {
      const newDecisionId = await saveToSupabase();
      if (newDecisionId) {
        // Pass the decisionId to the next step so it updates the same record
        onNext(newDecisionId);
      } else {
        // If save failed, still proceed but user won't have persistent data
        onNext(location.state?.decisionId);
      }
    } else {
      onNext(location.state?.decisionId);
    }
  };

  const handleDiscard = () => {
    if (window.confirm('Are you sure you want to discard this entry?')) {
      clearProgress();
      if (pageType === 'decision') {
        navigate('/decision-tools');
      } else if (pageType === 'journal') {
        navigate('/my-journal');
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
            e.target.style.backgroundColor = '#f9f9f9';
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
          e.target.style.backgroundColor = '#f9f9f9';
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
        onClick={onSaveAsDraft || handleSaveAsDraft}
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
          e.target.style.backgroundColor = '#f9f9f9';
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
          onClick={handleNext}
          disabled={!canNext || isSaving}
          style={{
            padding: '12px 24px',
            backgroundColor: !canNext || isSaving ? '#ccc' : '#F08571',
            color: 'white',
            fontWeight: 'bold',
            border: 'none',
            borderRadius: '8px',
            cursor: !canNext || isSaving ? 'not-allowed' : 'pointer',
            fontSize: '14px',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => (!canNext || isSaving) || (e.target.style.backgroundColor = '#e07560')}
          onMouseLeave={(e) => (!canNext || isSaving) || (e.target.style.backgroundColor = '#F08571')}
        >
          {isSaving ? 'Saving...' : nextLabel}
        </button>
      )}
    </div>
  );
}
