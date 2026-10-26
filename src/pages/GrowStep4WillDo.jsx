import { useState, useContext, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FormContext } from '../context/FormContext';
import { useFormDraftReady } from '../hooks/useFormDraftReady';
import { AuthContext } from '../context/AuthContext';
import { useLoadDecisionStep } from '../hooks/useLoadDecisionStep';
import { supabase } from '../lib/supabase';
import { clearProgress } from '../lib/saveProgress';
import SaveDiscardButtons from '../components/SaveDiscardButtons';
import NamingModal from '../components/NamingModal';
import DesignHeader from '../components/DesignHeader';
import { Loading, PageHeader, TextBox, Button, useToast } from '../components/design';

// Never the raw error: say what happened, then what to do.
const LOAD_ERROR = 'Your decision didn’t load. Check your connection and try again.';

// Waits for a draft FormContext is putting back after a refresh (see
// useFormDraftReady), then shows the step.
export default function GrowStep4WillDo() {
  const { ready, isReload } = useFormDraftReady();
  if (!ready) {
    return (
      <div className="ui-root" style={{ minHeight: '100vh', paddingTop: 'var(--header-height)', backgroundColor: 'var(--bg)' }}>
        <DesignHeader />
        <Loading label="Loading your decision" />
      </div>
    );
  }
  return <GrowStep4WillDoForm isReload={isReload} />;
}

function GrowStep4WillDoForm({ isReload }) {
  const navigate = useNavigate();
  const toast = useToast();
  const location = useLocation();
  const { updateFormData, getFieldValue, clearFormData } = useContext(FormContext);
  const { user } = useContext(AuthContext);
  const [draggedItem, setDraggedItem] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [editingIndex, setEditingIndex] = useState(null);
  const [editingValue, setEditingValue] = useState('');
  const [showNamingModal, setShowNamingModal] = useState(false);

  // Load decision data for edit mode; returns values from FormContext
  const { isLoading, isEditMode, error, onRetry, markDirty, clearDirty, will_do, options } = useLoadDecisionStep(['will_do', 'options']);

  const willDoValue = will_do || '';
  const optionsValue = options || [];

  // Clear on fresh start (new decision). After a refresh the shared form
  // holds what was typed, put back from the device: keep it.
  useEffect(() => {
    if (isReload) return;
    if (!isEditMode && !location.state?.options) {
      updateFormData('will_do', '');
    }
  }, [isReload, isEditMode, location.state?.options, updateFormData]);

  const [isSaving, setIsSaving] = useState(false);
  const [currentTitle, setCurrentTitle] = useState(location.state?.title || '');
  const [validationError, setValidationError] = useState('');

  // Load decision title from Supabase when in edit mode
  useEffect(() => {
    if (isEditMode && location.state?.decisionId && user?.id) {
      const loadTitle = async () => {
        try {
          const { data } = await supabase
            .from('decisions')
            .select('title')
            .eq('id', location.state.decisionId)
            .eq('user_id', user.id)
            .single();
          if (data?.title) {
            setCurrentTitle(data.title);
          }
        } catch (error) {
          console.error('Error loading decision title:', error);
        }
      };
      loadTitle();
    }
  }, [isEditMode, location.state?.decisionId, user?.id]);

  const handleEditStart = (index, value) => {
    setEditingIndex(index);
    setEditingValue(value);
  };

  const handleEditSave = () => {
    if (editingIndex !== null) {
      const newOptions = [...optionsValue];
      newOptions[editingIndex] = editingValue;
      updateFormData('options', newOptions);
    }
    setEditingIndex(null);
    setEditingValue('');
  };

  const handleEditCancel = () => {
    setEditingIndex(null);
    setEditingValue('');
  };

  const handleDragStart = (e, item, index) => {
    setDraggedItem({ item, index });
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e, dropIndex) => {
    e.preventDefault();
    if (!draggedItem) return;

    const newOptions = [...optionsValue];
    newOptions.splice(draggedItem.index, 1);
    newOptions.splice(dropIndex, 0, draggedItem.item);

    updateFormData('options', newOptions);
    markDirty('options');
    setDraggedItem(null);
    setDragOverIndex(null);
  };

  const needsNaming = !currentTitle || currentTitle.match(/^\w{3},\s\w{3}\s\d{1,2},\s\d{4}$/);

  const handleSaveClick = (newDecisionId) => {
    // Prevent save while loading edit data
    if (isLoading) return;
    if (!willDoValue.trim()) return;

    if (false) {
      toast.error('Please log in to save decisions.');
      return;
    }

    // Store the newDecisionId if provided (from SaveDiscardButtons auto-save)
    // (guarded: location.state is null when the page was opened directly)
    if (newDecisionId && location.state) {
      location.state.decisionId = newDecisionId;
    }

    if (needsNaming) {
      setShowNamingModal(true);
    } else {
      handleSaveConfirmed(currentTitle);
    }
  };

  const handleSaveConfirmed = async (decisionName) => {
    setShowNamingModal(false);
    setValidationError('');
    setIsSaving(true);
    try {
      const goal = getFieldValue('goal') || '';
      const constraints = getFieldValue('constraints') || '';
      const opportunities = getFieldValue('opportunities') || '';
      const options = getFieldValue('options') || [];
      const willDo = willDoValue || '';

      // Validate all 5 fields are filled before marking as completed
      const missingFields = [];
      if (!goal.trim()) missingFields.push('Goal');
      if (!constraints.trim()) missingFields.push('Constraints');
      if (!opportunities.trim()) missingFields.push('Opportunities');
      if (!Array.isArray(options) || options.length === 0 || options.every(opt => !opt?.trim?.())) {
        missingFields.push('Options');
      }
      if (!willDo.trim()) missingFields.push('Will Do');

      if (missingFields.length > 0) {
        setValidationError(`This isn’t finished yet. Add ${missingFields.join(', ')} and try again.`);
        setIsSaving(false);
        return;
      }

      const formDataComplete = {
        goal,
        constraints,
        opportunities,
        options,
        will_do: willDo,
      };

      let decisionId = location.state?.decisionId;

      if (decisionId) {
        const { error } = await supabase
          .from('decisions')
          .update({
            form_data: formDataComplete,
            title: decisionName,
            status: 'completed',
            draft: false
          })
          .eq('id', decisionId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('decisions')
          .insert([{
            user_id: user.id,
            tool_type: 'grow',
            title: decisionName,
            form_data: formDataComplete,
            status: 'completed',
            draft: false
          }])
          .select();
        if (error) throw error;
        if (data && data.length > 0) {
          decisionId = data[0].id;
        }
      }

      setCurrentTitle(decisionName);
      clearProgress();
      clearDirty();
      toast.show('Saved');
      setTimeout(() => {
        // Finished and saved: the shared form, and its draft on the
        // device, are cleared (the summary loads from the server).
        clearFormData();
        navigate('/decision-summary', { state: { decisionId } });
      }, 1500);
    } catch (error) {
      console.error('Error saving decision:', error);
      console.error('Error details:', error.message);
      toast.error('That didn’t save. Check your connection and try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="ui-root" style={{ minHeight: '100vh', paddingTop: 'var(--header-height)', backgroundColor: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      <DesignHeader />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '1200px', margin: '0 auto', width: '100%', padding: '64px 32px' }} className="page-container">
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '24px' }}>
          <Button variant="outline" onClick={() => navigate('/decision-history')}>My Decisions</Button>
        </div>
        <PageHeader title="Get unstuck" />
        <h2 className="ds-question">What will I do?</h2>

        <div style={{ marginTop: '24px', width: '100%', height: '4px', backgroundColor: 'var(--line)', borderRadius: '2px', marginBottom: '32px', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: '100%', backgroundColor: 'var(--text)', transition: 'width 0.3s ease' }} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px', minHeight: '400px', marginBottom: '100px' }}>
          {/* Options List */}
          <div>
            <h2 style={{ fontSize: 'calc(14 * var(--u, 1px))', fontWeight: '600', color: 'var(--text)', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Your Prioritised Options
            </h2>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                padding: '16px',
                backgroundColor: 'var(--raised)',
                borderRadius: '8px',
                minHeight: '400px',
                border: '2px dashed var(--line)',
              }}
            >
              {optionsValue.map((option, index) => (
                <div
                  key={index}
                  draggable={editingIndex !== index}
                  onDragStart={(e) => handleDragStart(e, option, index)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, index)}
                  onDragEnd={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--coral)';
                    setDraggedItem(null);
                    setDragOverIndex(null);
                  }}
                  style={{
                    padding: '12px 16px',
                    backgroundColor: editingIndex === index ? 'var(--coral-hover)' : 'var(--coral)',
                    border: '1px solid var(--coral)',
                    borderRadius: '6px',
                    cursor: editingIndex === index ? 'text' : 'grab',
                    fontSize: 'calc(14 * var(--u, 1px))',
                    color: 'var(--on-coral)',
                    transition: 'all 0.2s ease',
                    opacity: draggedItem?.item === option && draggedItem?.index === index ? 0.5 : 1,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                  onMouseEnter={(e) => {
                    if (editingIndex !== index) {
                      e.currentTarget.style.backgroundColor = 'var(--coral-hover)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (editingIndex !== index) {
                      e.currentTarget.style.backgroundColor = 'var(--coral)';
                    }
                  }}
                >
                  <div style={{ flex: 1 }}>
                    {editingIndex === index ? (
                      <input
                        type="text"
                        value={editingValue}
                        onChange={(e) => setEditingValue(e.target.value)}
                        onBlur={handleEditSave}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleEditSave();
                          if (e.key === 'Escape') handleEditCancel();
                        }}
                        autoFocus
                        style={{
                          width: '100%',
                          border: 'none',
                          outline: 'none',
                          fontSize: 'calc(14 * var(--u, 1px))',
                          fontFamily: 'inherit',
                          backgroundColor: 'transparent',
                          color: 'var(--on-coral)',
                        }}
                      />
                    ) : (
                      `${index + 1}. ${option}`
                    )}
                  </div>
                  <button
                    onClick={() => handleEditStart(index, option)}
                    style={{
                      padding: '4px',
                      backgroundColor: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--on-coral)',
                      opacity: 0.7,
                      transition: 'opacity 0.2s',
                      flexShrink: 0,
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                    onMouseLeave={(e) => e.currentTarget.style.opacity = '0.7'}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Text Area */}
          <div>
            <h2 style={{ fontSize: 'calc(14 * var(--u, 1px))', fontWeight: '600', color: 'var(--text)', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              What Will You Do?
            </h2>
            <p style={{ fontSize: 'calc(13 * var(--u, 1px))', color: 'var(--text-2)', marginBottom: '16px', lineHeight: '1.5' }}>
              Be specific about how and when you will take action.
            </p>
            <TextBox
              ariaLabel="What will you do?"
              lines="many"
              focusMode
              value={willDoValue}
              onChange={(text) => {
                updateFormData('will_do', text);
                markDirty('will_do');
              }}
              placeholder="Type here"
            />
          </div>
        </div>

        {error && (
          <div style={{ padding: '16px', marginBottom: '16px', backgroundColor: 'var(--coral-soft-tint)', borderRadius: '8px', border: 'none' }}>
            <p style={{ fontSize: 'calc(14 * var(--u, 1px))', color: 'var(--text)', margin: '0 0 12px 0', fontWeight: '500' }}>
              {LOAD_ERROR}
            </p>
            <Button variant="outline" onClick={onRetry}>Retry</Button>
          </div>
        )}

        {isLoading ? (
          <Loading label="Loading your decision" />
        ) : (
          <SaveDiscardButtons
            formData={{ will_do: willDoValue, options: optionsValue }}
            pageType="decision"
            toolType="grow"
            onNext={handleSaveClick}
            canNext={!error && willDoValue.trim() && !isSaving && !isLoading}
            onBack={() => navigate('/grow-step-3b-prioritize', { state: { decisionId: location.state?.decisionId } })}
            nextLabel={isSaving ? 'Saving' : 'Finish'}
          />
        )}

        {validationError && (
          <div style={{ padding: '16px', marginTop: '16px', backgroundColor: 'var(--coral-soft-tint)', borderRadius: '8px', border: 'none' }}>
            <p style={{ fontSize: 'calc(14 * var(--u, 1px))', color: 'var(--text)', margin: 0, fontWeight: '500' }}>
              {validationError}
            </p>
          </div>
        )}

        <NamingModal
          isOpen={showNamingModal}
          itemType="decision"
          onConfirm={handleSaveConfirmed}
          onCancel={() => setShowNamingModal(false)}
        />
      </div>

    </div>
  );
}
