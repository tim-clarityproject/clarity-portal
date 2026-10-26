import { Trash2 } from 'lucide-react';
import { useContext, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { saveProgress, clearProgress, AUTO_SAVE_KEY } from '../lib/saveProgress';
import { AuthContext } from '../context/AuthContext';
import { FormContext } from '../context/FormContext';
import { supabase } from '../lib/supabase';
import { mergeFormData } from '../utils/mergeFormData';
import DiscardDialog from './ui/DiscardDialog';
import { Button, ErrorMessage } from './design';

// A save that fails must never look saved (Tim, 26 Oct): the page stays
// where it is with everything typed, and says what happened and what to
// do (writing rule 15).
const SAVE_ERROR = 'That didn’t save. Check your connection and try again.';

export default function SaveDiscardButtons({ formData, pageType = 'decision', toolType = null, onNext = null, canNext = true, onBack = null, onSaveAsDraft = null, nextLabel = 'Continue' }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const { clearFormData } = useContext(FormContext);
  const [isSaving, setIsSaving] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [saveError, setSaveError] = useState('');

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
          throw fetchError;
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

        if (error) throw error;
        if (!data || data.length === 0) throw new Error('No decision was updated.');
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

        if (error) throw error;
        if (!data?.[0]?.id) throw new Error('No decision was saved.');
        return data[0].id;
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAsDraft = async () => {
    if (isSaving) return;
    setSaveError('');
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
            throw fetchError;
          }

          const existingFormData = existingRecord?.form_data || {};
          const mergedFormData = mergeFormData(existingFormData, formData);

          const { error: updateError } = await supabase
            .from('decisions')
            .update({
              form_data: mergedFormData,
              status: 'draft',
              draft: true,
              updated_at: new Date().toISOString()
            })
            .eq('id', decisionId)
            .eq('user_id', user.id);
          if (updateError) throw updateError;
        } else {
          // Insert new decision with draft status
          const { error: insertError } = await supabase
            .from('decisions')
            .insert([{
              user_id: user.id,
              tool_type: toolType,
              title,
              form_data: formData,
              status: 'draft',
              draft: true
            }]);
          if (insertError) throw insertError;
        }
        // Saved: the device's copies are no longer needed.
        clearProgress();
        clearFormData();
      } catch (error) {
        console.error('Error saving draft to server:', error);
        // Keep a copy on the device too, stay on the page with everything
        // typed, and say so.
        saveProgress(pageIdentifier, formData, location.state);
        setSaveError(SAVE_ERROR);
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
    setSaveError('');

    // Save before moving on. If it doesn't save, stay here with everything
    // typed and say so: moving on would make an unsaved step look saved.
    if (user && toolType) {
      try {
        const newDecisionId = await saveToSupabase();
        // Pass the decisionId to the next step so it updates the same record
        onNext(newDecisionId);
      } catch (error) {
        console.error('Error saving to Supabase:', error);
        setSaveError(SAVE_ERROR);
      }
    } else {
      onNext(location.state?.decisionId);
    }
  };

  const handleDiscard = () => {
    setDiscardOpen(false);
    clearProgress();
    clearFormData();
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
        aria-label="Discard this entry"
        style={{
          padding: '12px',
          backgroundColor: 'transparent',
          color: 'var(--label)',
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
          e.currentTarget.style.color = 'var(--label)';
        }}
      >
        <Trash2 size={20} />
      </button>

      <Button variant="outline" type="button" onClick={onSaveAsDraft || handleSaveAsDraft}>Save as Draft</Button>

      {onNext && (
        <Button variant="primary" type="button" onClick={handleNext} disabled={!canNext || isSaving}>{isSaving ? 'Saving' : nextLabel}</Button>
      )}

      {saveError && <div style={{ flex: '1 1 100%' }}><ErrorMessage>{saveError}</ErrorMessage></div>}

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
