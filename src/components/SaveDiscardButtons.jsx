import { Trash2 } from 'lucide-react';
import { useContext, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { saveProgress, clearProgress, AUTO_SAVE_KEY } from '../lib/saveProgress';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { mergeFormData } from '../utils/mergeFormData';
import DiscardDialog from './ui/DiscardDialog';
import { Button } from './design';

export default function SaveDiscardButtons({ formData, pageType = 'decision', toolType = null, onNext = null, canNext = true, onBack = null, onSaveAsDraft = null, nextLabel = 'Continue' }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const [isSaving, setIsSaving] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);

  const saveToSupabase = async () => {
    if (!user || !toolType) return null;

    try {
      setIsSaving(true);
      const decisionId = location.state?.decisionId;
      const dateTitle = new Date().toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
      const title = location.state?.problemTitle || location.state?.title || dateTitle;

      if (decisionId) {
        // Update existing decision: merge new data with existing, never overwrite with undefined/null
        const { data: existingRecord, error: fetchError } = await supabase
          .from('decisions')
          .select('form_data')
          .eq('id', decisionId)
          .eq('user_id', user.id)
          .single();

        if (fetchError) {
          console.error('Error fetching existing decision:', fetchError);
          throw new Error(`Cannot save: Unable to load existing record for merging. ${fetchError.message}`);
        }

        const existingFormData = existingRecord?.form_data || {};
        const mergedFormData = mergeFormData(existingFormData, formData);

        const { data, error } = await supabase
          .from('decisions')
          .update({
            form_data: mergedFormData,
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
          // Update existing decision with draft status: merge instead of replace
          const { data: existingRecord, error: fetchError } = await supabase
            .from('decisions')
            .select('form_data')
            .eq('id', decisionId)
            .eq('user_id', user.id)
            .single();

          if (fetchError) {
            console.error('Error fetching existing decision:', fetchError);
            throw new Error(`Cannot save draft: Unable to load existing record for merging. ${fetchError.message}`);
          }

          const existingFormData = existingRecord?.form_data || {};
          const mergedFormData = mergeFormData(existingFormData, formData);

          await supabase
            .from('decisions')
            .update({
              form_data: mergedFormData,
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
    setDiscardOpen(false);
    clearProgress();
    if (pageType === 'decision') {
      navigate('/decision-tools');
    } else if (pageType === 'journal') {
      navigate('/my-journal');
    }
  };

  return (
    <div className="g1-save-row" style={{ display: 'flex', gap: '12px', justifyContent: 'center', alignItems: 'center', marginTop: '24px' }}>
      <style>{`
        .ui-root .g1-save-row { flex-wrap: wrap; }
        .ui-root .g1-save-row .ds-btn { white-space: nowrap; }
        @media (max-width: 768px) {
          .ui-root .g1-save-row .ds-btn--primary { flex: 1 1 100%; order: 10; }
        }
      `}</style>
      {onBack && (
        <Button variant="outline" type="button" onClick={onBack}>Back</Button>
      )}

      <button
        type="button"
        onClick={() => setDiscardOpen(true)}
        title="Discard this entry"
        style={{
          padding: '12px',
          backgroundColor: 'transparent',
          color: 'var(--coral-text)',
          border: 'none',
          borderRadius: '8px',
          cursor: 'pointer',
          transition: 'all 0.2s',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = 'var(--raised)';
          e.currentTarget.style.color = 'var(--coral-hover)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent';
          e.currentTarget.style.color = 'var(--coral-text)';
        }}
      >
        <Trash2 size={20} />
      </button>

      <Button variant="outline" type="button" onClick={onSaveAsDraft || handleSaveAsDraft}>Save as Draft</Button>

      {onNext && (
        <Button variant="primary" type="button" onClick={handleNext} disabled={!canNext || isSaving}>{isSaving ? 'Saving' : nextLabel}</Button>
      )}

      <DiscardDialog
        isOpen={discardOpen}
        title="Discard this entry?"
        message="Anything you have not saved will be lost."
        onKeep={() => setDiscardOpen(false)}
        onDiscard={handleDiscard}
      />
    </div>
  );
}
