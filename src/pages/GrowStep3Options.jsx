import { useState, useContext, useCallback, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FormContext } from '../context/FormContext';
import { useLoadDecisionStep } from '../hooks/useLoadDecisionStep';
import SaveDiscardButtons from '../components/SaveDiscardButtons';
import OptionsTimer from '../components/OptionsTimer';
import HomeHeader from '../components/HomeHeader';

export default function GrowStep3Options() {
  const navigate = useNavigate();
  const location = useLocation();
  const { updateFormData, getFieldValue } = useContext(FormContext);
  const problemTitle = location.state?.problemTitle;
  const decisionId = location.state?.decisionId;

  // Load decision data for edit mode; returns values from FormContext
  const { isLoading, isEditMode, error, onRetry, markDirty, options } = useLoadDecisionStep(['options']);

  // Initialize with empty options array for new decisions
  const optionsValue = options || ['', '', ''];
  const [timerSeconds, setTimerSeconds] = useState(location.state?.timerSeconds || null);

  // Clear on fresh start (new decision)
  useEffect(() => {
    if (!isEditMode && !location.state?.constraints) {
      updateFormData('options', ['', '', '']);
    }
  }, [isEditMode, location.state?.constraints, updateFormData]);

  const handleOptionChange = (index, value) => {
    const newOptions = [...optionsValue];
    newOptions[index] = value;
    updateFormData('options', newOptions);
    markDirty('options');
  };

  const handleAddOption = () => {
    const newOptions = [...optionsValue, ''];
    updateFormData('options', newOptions);
    markDirty('options');
  };

  const handleRemoveOption = (index) => {
    const newOptions = optionsValue.filter((_, i) => i !== index);
    updateFormData('options', newOptions);
    markDirty('options');
  };

  const handleNext = useCallback((newDecisionId) => {
    // Prevent save while loading edit data
    if (isLoading) return;

    const filledOptions = optionsValue.filter(option => (option || '').trim());
    if (filledOptions.length >= 1) {
      const finalDecisionId = newDecisionId || decisionId;
      navigate('/grow-step-3b-prioritize', {
        state: {
          problemTitle,
          goal: getFieldValue('goal'),
          constraints: getFieldValue('constraints'),
          opportunities: getFieldValue('opportunities'),
          options: optionsValue,
          timerSeconds,
          decisionId: finalDecisionId,
        }
      });
    }
  }, [isLoading, optionsValue, decisionId, navigate, problemTitle, timerSeconds, getFieldValue]);

  const filledCount = optionsValue.filter(option => (option || '').trim()).length;
  const canSubmit = filledCount >= 1;

  return (
    <div style={{ minHeight: '100vh', paddingTop: '70px', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
      <HomeHeader />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '800px', margin: '0 auto', width: '100%', padding: '64px 32px' }} className="page-container">
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
        <h1 className="page-heading">What options do you have?</h1>

        <div style={{ width: '100%', height: '4px', backgroundColor: '#e5e5e5', borderRadius: '2px', marginBottom: '32px', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: '75%', backgroundColor: '#F08571', transition: 'width 0.3s ease' }} />
        </div>

        <OptionsTimer
          initialSeconds={timerSeconds}
          onTimeChange={(seconds) => setTimerSeconds(seconds)}
        />

        <div style={{ marginBottom: '32px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {optionsValue.map((option, index) => (
            <div key={index} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
              <input
                type="text"
                value={option}
                onChange={(e) => handleOptionChange(index, e.target.value)}
                placeholder="Type here"
                style={{
                  flex: 1,
                  padding: '12px 16px',
                  border: '2px solid #e5e5e5',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontFamily: 'system-ui, -apple-system, sans-serif',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
                onFocus={(e) => e.target.style.borderColor = '#F08571'}
                onBlur={(e) => e.target.style.borderColor = '#e5e5e5'}
              />
              <button
                onClick={() => handleRemoveOption(index)}
                title="Remove option"
                style={{
                  padding: '8px',
                  backgroundColor: 'transparent',
                  color: '#F08571',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginTop: '2px',
                }}
                onMouseEnter={(e) => e.target.style.backgroundColor = '#f0f0f0'}
                onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M6 6L18 18M6 18L18 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
          ))}
        </div>

        <button
          onClick={handleAddOption}
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
            marginBottom: '32px',
            alignSelf: 'flex-start',
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
          + Add Option
        </button>

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
            formData={{ options: optionsValue }}
            pageType="decision"
            toolType="grow"
            onNext={handleNext}
            canNext={!error && canSubmit}
            onBack={() => navigate('/grow-step-2', { state: { decisionId: location.state?.decisionId, problemTitle: location.state?.problemTitle } })}
          />
        )}
      </div>
    </div>
  );
}
