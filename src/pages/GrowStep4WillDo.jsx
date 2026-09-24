import { useState, useContext, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FormContext } from '../context/FormContext';
import { AuthContext } from '../context/AuthContext';
import { useLoadDecisionStep } from '../hooks/useLoadDecisionStep';
import { supabase } from '../lib/supabase';
import { clearProgress } from '../lib/saveProgress';
import BackArrow from '../components/BackArrow';
import SaveDiscardButtons from '../components/SaveDiscardButtons';
import NamingModal from '../components/NamingModal';
import HomeHeader from '../components/HomeHeader';

export default function GrowStep4WillDo() {
  const navigate = useNavigate();
  const location = useLocation();
  const { updateFormData, getFieldValue } = useContext(FormContext);
  const { user } = useContext(AuthContext);
  const [draggedItem, setDraggedItem] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [editingIndex, setEditingIndex] = useState(null);
  const [editingValue, setEditingValue] = useState('');
  const [showNamingModal, setShowNamingModal] = useState(false);

  // Load decision data for edit mode; returns values from FormContext
  const { isLoading, isEditMode, error, onRetry, markDirty, clearDirty, willDo, options } = useLoadDecisionStep(['willDo', 'options']);

  const willDoValue = willDo || '';
  const optionsValue = options || [];

  // Clear on fresh start (new decision)
  useEffect(() => {
    if (!isEditMode && !location.state?.options) {
      updateFormData('willDo', '');
    }
  }, [isEditMode, location.state?.options, updateFormData]);

  const [isSaving, setIsSaving] = useState(false);
  const [currentTitle, setCurrentTitle] = useState(location.state?.title || '');
  const [validationError, setValidationError] = useState('');

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
      alert('Please log in to save decisions');
      return;
    }

    // Store the newDecisionId if provided (from SaveDiscardButtons auto-save)
    if (newDecisionId) {
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
        setValidationError(`Cannot mark as completed. Missing: ${missingFields.join(', ')}`);
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
      navigate('/decision-summary', { state: { decisionId } });
    } catch (error) {
      console.error('Error saving decision:', error);
      console.error('Error details:', error.message);
      alert(`Failed to save decision: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', paddingTop: '70px', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
      <HomeHeader />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '1200px', margin: '0 auto', width: '100%', padding: '64px 32px' }} className="page-container">
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '24px' }}>
          <button
            onClick={() => navigate('/decision-history')}
            style={{
              padding: '8px 16px',
              backgroundColor: 'transparent',
              border: '2px solid #e5e5e5',
              borderRadius: '6px',
              color: '#333',
              fontSize: '13px',
              fontWeight: '600',
              cursor: 'pointer',
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
            My Decisions
          </button>
        </div>
        <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: 'black', margin: 0, marginBottom: '32px' }}>What will I do?</h1>

        <div style={{ width: '100%', height: '4px', backgroundColor: '#e5e5e5', borderRadius: '2px', marginBottom: '32px', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: '100%', backgroundColor: '#F08571', transition: 'width 0.3s ease' }} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px', minHeight: '400px', marginBottom: '100px' }}>
          {/* Options List */}
          <div>
            <h2 style={{ fontSize: '14px', fontWeight: '600', color: '#333', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Your Prioritised Options
            </h2>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                padding: '16px',
                backgroundColor: '#fafafa',
                borderRadius: '8px',
                minHeight: '400px',
                border: '2px dashed #e5e5e5',
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
                    e.currentTarget.style.backgroundColor = '#F08571';
                    setDraggedItem(null);
                    setDragOverIndex(null);
                  }}
                  style={{
                    padding: '12px 16px',
                    backgroundColor: editingIndex === index ? '#e07560' : '#F08571',
                    border: '1px solid #F08571',
                    borderRadius: '6px',
                    cursor: editingIndex === index ? 'text' : 'grab',
                    fontSize: '14px',
                    color: 'white',
                    fontWeight: '600',
                    transition: 'all 0.2s ease',
                    opacity: draggedItem?.item === option && draggedItem?.index === index ? 0.5 : 1,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                  onMouseEnter={(e) => {
                    if (editingIndex !== index) {
                      e.currentTarget.style.backgroundColor = '#e07560';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (editingIndex !== index) {
                      e.currentTarget.style.backgroundColor = '#F08571';
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
                          fontSize: '14px',
                          fontWeight: '600',
                          fontFamily: 'inherit',
                          backgroundColor: 'transparent',
                          color: 'white',
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
                      color: 'rgba(255, 255, 255, 0.7)',
                      transition: 'color 0.2s',
                      flexShrink: 0,
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.color = 'white'}
                    onMouseLeave={(e) => e.currentTarget.style.color = 'rgba(255, 255, 255, 0.7)'}
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
            <h2 style={{ fontSize: '14px', fontWeight: '600', color: '#333', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              What Will You Do?
            </h2>
            <p style={{ fontSize: '13px', color: '#666', marginBottom: '16px', lineHeight: '1.5' }}>
              Be specific about how and when you will take action.
            </p>
            <textarea
              value={willDoValue}
              onChange={(e) => {
                updateFormData('will_do', e.target.value);
                markDirty('will_do');
              }}
              placeholder="Type here"
              style={{
                width: '100%',
                height: '100%',
                minHeight: '400px',
                padding: '16px',
                border: '2px solid #e5e5e5',
                borderRadius: '8px',
                fontSize: '14px',
                fontFamily: 'system-ui, -apple-system, sans-serif',
                boxSizing: 'border-box',
                outline: 'none',
                resize: 'none',
              }}
              onFocus={(e) => e.target.style.borderColor = '#F08571'}
              onBlur={(e) => e.target.style.borderColor = '#e5e5e5'}
            />
          </div>
        </div>

        {error && (
          <div style={{ padding: '16px', marginBottom: '16px', backgroundColor: '#ffebee', borderRadius: '8px', border: '1px solid #ef5350' }}>
            <p style={{ fontSize: '14px', color: '#c62828', margin: '0 0 12px 0', fontWeight: '500' }}>
              {error}
            </p>
            <button
              onClick={onRetry}
              style={{
                padding: '8px 16px',
                backgroundColor: '#ef5350',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => e.target.style.backgroundColor = '#e53935'}
              onMouseLeave={(e) => e.target.style.backgroundColor = '#ef5350'}
            >
              Retry
            </button>
          </div>
        )}

        {isLoading ? (
          <div style={{ padding: '16px', textAlign: 'center', color: '#999', fontSize: '14px' }}>
            Loading saved data...
          </div>
        ) : (
          <SaveDiscardButtons
            formData={{ willDo: willDoValue, options: optionsValue }}
            pageType="decision"
            toolType="grow"
            onNext={handleSaveClick}
            canNext={!error && willDoValue.trim() && !isSaving && !isLoading}
            onBack={() => navigate('/grow-step-3b-prioritize', { state: { decisionId: location.state?.decisionId } })}
            nextLabel={isSaving ? 'Saving...' : 'Finish'}
          />
        )}

        {validationError && (
          <div style={{ padding: '16px', marginTop: '16px', backgroundColor: '#ffebee', borderRadius: '8px', border: '1px solid #ef5350' }}>
            <p style={{ fontSize: '14px', color: '#c62828', margin: 0, fontWeight: '500' }}>
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
