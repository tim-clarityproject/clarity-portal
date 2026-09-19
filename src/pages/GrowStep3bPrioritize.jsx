import { useState, useContext, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FormContext } from '../context/FormContext';
import SaveDiscardButtons from '../components/SaveDiscardButtons';
import HomeHeader from '../components/HomeHeader';

export default function GrowStep3bPrioritize() {
  const navigate = useNavigate();
  const location = useLocation();
  const { formData, updateFormData, getFieldValue } = useContext(FormContext);
  const [availableOptions, setAvailableOptions] = useState(() => location.state?.availableOptions || location.state?.options || []);
  const [prioritizedOptions, setPrioritizedOptions] = useState(() => location.state?.prioritizedOptions || []);
  const [draggedItem, setDraggedItem] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [editingIndex, setEditingIndex] = useState(null);
  const [editingValue, setEditingValue] = useState('');
  const [editingSource, setEditingSource] = useState(null);
  const isGuest = location.state?.isGuest || false;

  useEffect(() => {
    if (!location.state?.decisionId && !location.state?.options) {
      setAvailableOptions([]);
      setPrioritizedOptions([]);
      updateFormData('availableOptions', []);
      updateFormData('prioritizedOptions', []);
      localStorage.removeItem('clarity_form_data');
    }
  }, []);

  const handleEditStart = (index, value, source) => {
    setEditingIndex(index);
    setEditingValue(value);
    setEditingSource(source);
  };

  const handleEditSave = () => {
    if (editingSource === 'available' && editingIndex !== null) {
      const newAvailable = [...availableOptions];
      newAvailable[editingIndex] = editingValue;
      setAvailableOptions(newAvailable);
      updateFormData('availableOptions', newAvailable);
    } else if (editingSource === 'prioritized' && editingIndex !== null) {
      const newPrioritized = [...prioritizedOptions];
      newPrioritized[editingIndex] = editingValue;
      setPrioritizedOptions(newPrioritized);
      updateFormData('prioritizedOptions', newPrioritized);
    }
    setEditingIndex(null);
    setEditingValue('');
    setEditingSource(null);
  };

  const handleEditCancel = () => {
    setEditingIndex(null);
    setEditingValue('');
    setEditingSource(null);
  };

  useEffect(() => {
    if (location.state?.availableOptions) {
      setAvailableOptions(location.state.availableOptions);
    } else if (location.state?.options) {
      setAvailableOptions(location.state.options);
    }
    if (location.state?.prioritizedOptions) {
      setPrioritizedOptions(location.state.prioritizedOptions);
    }
  }, [location.state?.availableOptions, location.state?.options, location.state?.prioritizedOptions]);

  useEffect(() => {
    const prioritizedSet = new Set(prioritizedOptions);
    const cleanedAvailable = availableOptions.filter(item => !prioritizedSet.has(item));

    if (cleanedAvailable.length !== availableOptions.length) {
      setAvailableOptions(cleanedAvailable);
      updateFormData('availableOptions', cleanedAvailable);
    }
  }, [prioritizedOptions]);

  const handleDragStart = (e, item, source, sourceIndex = null) => {
    setDraggedItem({ item, source, sourceIndex });
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDropOnSlot = (e, displayIndex) => {
    e.preventDefault();
    if (!draggedItem) return;

    const { item, source, sourceIndex } = draggedItem;
    const newPrioritized = [...prioritizedOptions];

    if (source === 'available') {
      const newAvailable = availableOptions.filter((_, i) => i !== sourceIndex);
      setAvailableOptions(newAvailable);
      updateFormData('availableOptions', newAvailable);
      const insertIndex = dragOverIndex !== null ? dragOverIndex : prioritizedOptions.length;
      newPrioritized.splice(insertIndex, 0, item);
    } else if (source === 'prioritized') {
      const insertIndex = dragOverIndex !== null ? dragOverIndex : displayIndex;
      if (sourceIndex !== insertIndex) {
        newPrioritized.splice(sourceIndex, 1);
        newPrioritized.splice(insertIndex, 0, item);
      }
    }

    setPrioritizedOptions(newPrioritized);
    updateFormData('prioritizedOptions', newPrioritized);
    setDraggedItem(null);
    setDragOverIndex(null);
  };

  const handleDropOnAvailable = (e) => {
    e.preventDefault();
    if (!draggedItem || draggedItem.source !== 'prioritized') return;

    const { sourceIndex, item } = draggedItem;
    const newPrioritized = prioritizedOptions.filter((_, i) => i !== sourceIndex);
    setPrioritizedOptions(newPrioritized);
    updateFormData('prioritizedOptions', newPrioritized);

    const newAvailable = [...availableOptions, item];
    setAvailableOptions(newAvailable);
    updateFormData('availableOptions', newAvailable);
    setDraggedItem(null);
    setDragOverIndex(null);
  };

  const getDisplayPrioritizedOptions = () => {
    if (!draggedItem || dragOverIndex === null) {
      return prioritizedOptions;
    }

    if (draggedItem.source === 'prioritized') {
      const newList = prioritizedOptions.filter((_, i) => i !== draggedItem.sourceIndex);
      newList.splice(dragOverIndex, 0, draggedItem.item);
      return newList;
    } else if (draggedItem.source === 'available') {
      const newList = [...prioritizedOptions];
      newList.splice(dragOverIndex, 0, draggedItem.item);
      return newList;
    }

    return prioritizedOptions;
  };

  const handleNext = () => {
    updateFormData('options', prioritizedOptions);
    navigate('/grow-step-4', {
      state: {
        problemTitle: location.state?.problemTitle,
        goal: location.state?.goal,
        constraints: location.state?.constraints,
        opportunities: location.state?.opportunities,
        options: prioritizedOptions,
        availableOptions: availableOptions,
        prioritizedOptions: prioritizedOptions,
        isGuest,
        decisionId: location.state?.decisionId,
      },
    });
  };

  const canSubmit = prioritizedOptions.length > 0;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
      <HomeHeader isGuest={isGuest} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '1000px', margin: '0 auto', width: '100%', padding: '64px 32px' }} className="page-container">
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '24px' }}>
          <button
            onClick={() => navigate('/decision-history', { state: { isGuest } })}
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
              e.target.style.backgroundColor = '#FEE5DE';
            }}
            onMouseLeave={(e) => {
              e.target.style.borderColor = '#e5e5e5';
              e.target.style.backgroundColor = 'transparent';
            }}
          >
            My Decisions
          </button>
        </div>
        {location.state?.problemTitle && (
          <p style={{ fontSize: '13px', color: '#999', fontWeight: '500', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            {location.state.problemTitle}
          </p>
        )}
        <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: 'black', margin: 0, marginBottom: '8px' }}>
          Prioritize your options
        </h1>
        <p style={{ fontSize: '14px', color: '#999', margin: 0, marginBottom: '32px' }}>
          Rank your best choices in order of fit
        </p>

        <div style={{ width: '100%', height: '4px', backgroundColor: '#e5e5e5', borderRadius: '2px', marginBottom: '32px', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: '75%', backgroundColor: '#F08571', transition: 'width 0.3s ease' }} />
        </div>

        <p style={{ fontSize: '14px', color: '#666', marginBottom: '24px', lineHeight: '1.6' }}>
          Drag and drop your options to the right to place them in order of fit for your situation. You can leave any ideas you think are bad on the left.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px', flex: 1 }}>
          {/* Available Options */}
          <div>
            <h2 style={{ fontSize: '14px', fontWeight: '600', color: '#333', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Your Options
            </h2>
            <div
              onDragOver={handleDragOver}
              onDrop={handleDropOnAvailable}
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
              {availableOptions.map((option, index) => (
                <div
                  key={index}
                  draggable={editingSource !== 'available' || editingIndex !== index}
                  onDragStart={(e) => handleDragStart(e, option, 'available', index)}
                  onDragEnd={(e) => {
                    e.currentTarget.style.backgroundColor = 'white';
                    e.currentTarget.style.borderColor = '#e5e5e5';
                    setDraggedItem(null);
                    setDragOverIndex(null);
                  }}
                  style={{
                    padding: '12px 16px',
                    backgroundColor: editingIndex === index && editingSource === 'available' ? '#f0f0f0' : 'white',
                    border: '1px solid #e5e5e5',
                    borderRadius: '6px',
                    cursor: editingIndex === index && editingSource === 'available' ? 'text' : 'grab',
                    fontSize: '14px',
                    color: '#333',
                    transition: 'all 0.2s',
                    opacity: draggedItem?.item === option && draggedItem?.source === 'available' && draggedItem?.sourceIndex === index ? 0.5 : 1,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                  onMouseEnter={(e) => {
                    if (!draggedItem && !(editingIndex === index && editingSource === 'available')) {
                      e.currentTarget.style.backgroundColor = '#FEE5DE';
                      e.currentTarget.style.borderColor = '#F08571';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!(editingIndex === index && editingSource === 'available')) {
                      e.currentTarget.style.backgroundColor = 'white';
                      e.currentTarget.style.borderColor = '#e5e5e5';
                    }
                  }}
                >
                  <div style={{ flex: 1 }}>
                    {editingIndex === index && editingSource === 'available' ? (
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
                          fontFamily: 'inherit',
                          backgroundColor: 'transparent',
                        }}
                      />
                    ) : (
                      option
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                    <button
                      onClick={() => handleEditStart(index, option, 'available')}
                      style={{
                        padding: '4px',
                        backgroundColor: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        color: '#999',
                        transition: 'color 0.2s',
                        flexShrink: 0,
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.color = '#F08571'}
                      onMouseLeave={(e) => e.currentTarget.style.color = '#999'}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                      </svg>
                    </button>
                    <button
                      onClick={() => {
                        const newAvailable = availableOptions.filter((_, i) => i !== index);
                        setAvailableOptions(newAvailable);
                        updateFormData('availableOptions', newAvailable);
                      }}
                      style={{
                        padding: '4px',
                        backgroundColor: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        color: '#999',
                        transition: 'color 0.2s',
                        flexShrink: 0,
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.color = '#F08571'}
                      onMouseLeave={(e) => e.currentTarget.style.color = '#999'}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        <line x1="10" y1="11" x2="10" y2="17"></line>
                        <line x1="14" y1="11" x2="14" y2="17"></line>
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
              {availableOptions.length === 0 && (
                <p style={{ color: '#999', fontSize: '13px', margin: 'auto 0', textAlign: 'center' }}>
                  All options ranked
                </p>
              )}
              <button
                onClick={() => {
                  const newAvailable = [...availableOptions, ''];
                  setAvailableOptions(newAvailable);
                  updateFormData('availableOptions', newAvailable);
                  setEditingIndex(newAvailable.length - 1);
                  setEditingSource('available');
                  setEditingValue('');
                }}
                style={{
                  padding: '8px 16px',
                  backgroundColor: 'transparent',
                  border: '1px solid #F08571',
                  borderRadius: '6px',
                  color: '#F08571',
                  fontSize: '13px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  alignSelf: 'flex-start',
                }}
                onMouseEnter={(e) => {
                  e.target.style.backgroundColor = '#FEE5DE';
                }}
                onMouseLeave={(e) => {
                  e.target.style.backgroundColor = 'transparent';
                }}
              >
                + Add Option
              </button>
            </div>
          </div>

          {/* Prioritized List */}
          <div>
            <h2 style={{ fontSize: '14px', fontWeight: '600', color: '#333', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Priority Order
            </h2>
            <div
              onDragOver={(e) => {
                handleDragOver(e);
                if (!draggedItem) {
                  setDragOverIndex(getDisplayPrioritizedOptions().length);
                  return;
                }

                const containerRect = e.currentTarget.getBoundingClientRect();
                const mouseY = e.clientY - containerRect.top - 16; // subtract padding
                const itemHeight = 48;
                const gap = 8;
                const totalItemHeight = itemHeight + gap;
                const estimatedIndex = Math.max(0, Math.min(getDisplayPrioritizedOptions().length, Math.round(mouseY / totalItemHeight)));

                setDragOverIndex(estimatedIndex);
              }}
              onDragLeave={(e) => {
                if (e.currentTarget === e.target) {
                  setDragOverIndex(null);
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (!draggedItem) return;
                if (draggedItem.source === 'available') {
                  const { item, sourceIndex } = draggedItem;
                  const newAvailable = availableOptions.filter((_, i) => i !== sourceIndex);
                  const newPrioritized = [...prioritizedOptions, item];
                  setAvailableOptions(newAvailable);
                  setPrioritizedOptions(newPrioritized);
                  updateFormData('availableOptions', newAvailable);
                  updateFormData('prioritizedOptions', newPrioritized);
                  setDraggedItem(null);
                  setDragOverIndex(null);
                }
              }}
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
              {getDisplayPrioritizedOptions().map((option, index) => {
                const originalIndex = prioritizedOptions.indexOf(option);
                return (
                  <div
                    key={index}
                    draggable={editingSource !== 'prioritized' || editingIndex !== originalIndex}
                    onDragStart={(e) => handleDragStart(e, option, 'prioritized', originalIndex)}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDropOnSlot(e, index)}
                    onDragEnd={(e) => {
                      e.currentTarget.style.backgroundColor = '#F08571';
                      e.currentTarget.style.color = 'white';
                      setDraggedItem(null);
                      setDragOverIndex(null);
                    }}
                    style={{
                      padding: '12px 16px',
                      backgroundColor: editingIndex === originalIndex && editingSource === 'prioritized' ? '#e07560' : '#F08571',
                      border: '1px solid #F08571',
                      borderRadius: '6px',
                      cursor: editingIndex === originalIndex && editingSource === 'prioritized' ? 'text' : 'grab',
                      fontSize: '14px',
                      color: 'white',
                      fontWeight: '600',
                      transition: 'all 0.2s ease',
                      opacity: draggedItem?.item === option && draggedItem?.source === 'prioritized' ? 0.5 : 1,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                    onMouseEnter={(e) => {
                      if (!(editingIndex === originalIndex && editingSource === 'prioritized')) {
                        e.currentTarget.style.backgroundColor = '#e07560';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!(editingIndex === originalIndex && editingSource === 'prioritized')) {
                        e.currentTarget.style.backgroundColor = '#F08571';
                      }
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      {editingIndex === originalIndex && editingSource === 'prioritized' ? (
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
                    <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                      <button
                        onClick={() => handleEditStart(originalIndex, option, 'prioritized')}
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
                      <button
                        onClick={() => {
                          const newPrioritized = prioritizedOptions.filter((_, i) => i !== originalIndex);
                          setPrioritizedOptions(newPrioritized);
                          updateFormData('prioritizedOptions', newPrioritized);
                        }}
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
                          <polyline points="3 6 5 6 21 6"></polyline>
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                          <line x1="10" y1="11" x2="10" y2="17"></line>
                          <line x1="14" y1="11" x2="14" y2="17"></line>
                        </svg>
                      </button>
                    </div>
                  </div>
                );
              })}
              {prioritizedOptions.length === 0 && (
                <p style={{ color: '#999', fontSize: '13px', margin: 'auto 0', textAlign: 'center' }}>
                  Drag options from the left to prioritize
                </p>
              )}
            </div>
            {prioritizedOptions.length > 0 && (
              <button
                onClick={() => {
                  const resetAvailable = [...availableOptions, ...prioritizedOptions];
                  setAvailableOptions(resetAvailable);
                  setPrioritizedOptions([]);
                  updateFormData('availableOptions', resetAvailable);
                  updateFormData('prioritizedOptions', []);
                }}
                style={{
                  marginTop: '12px',
                  padding: '10px 16px',
                  backgroundColor: 'transparent',
                  border: '1px solid #e5e5e5',
                  borderRadius: '6px',
                  color: '#999',
                  fontSize: '13px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.target.style.borderColor = '#F08571';
                  e.target.style.color = '#F08571';
                }}
                onMouseLeave={(e) => {
                  e.target.style.borderColor = '#e5e5e5';
                  e.target.style.color = '#999';
                }}
              >
                Reset All
              </button>
            )}
          </div>
        </div>

        <SaveDiscardButtons
          formData={{ ...formData, options: prioritizedOptions }}
          pageType="decision"
          toolType="grow"
          onNext={handleNext}
          canNext={canSubmit}
          onBack={() => navigate('/grow-step-3', { state: { ...location.state, options: [...availableOptions, ...prioritizedOptions], timerSeconds: location.state?.timerSeconds, isGuest, decisionId: location.state?.decisionId } })}
        />
      </div>
    </div>
  );
}
