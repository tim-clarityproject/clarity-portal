import { useState, useContext, useCallback, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FormContext } from '../context/FormContext';
import { useLoadDecisionStep } from '../hooks/useLoadDecisionStep';
import SaveDiscardButtons from '../components/SaveDiscardButtons';
import OptionsTimer from '../components/OptionsTimer';
import DesignHeader from '../components/DesignHeader';
import { Crosshair, Loading, PageHeader, TextField } from '../components/design';

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
    <div className="ui-root" style={{ minHeight: '100vh', paddingTop: 'var(--header-height)', backgroundColor: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      <DesignHeader />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '800px', margin: '0 auto', width: '100%', padding: '64px 32px' }} className="page-container">
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '24px' }}>
          <button
            onClick={() => navigate('/decision-history')}
            style={{
              padding: '8px 16px',
              backgroundColor: 'transparent',
              border: '2px solid var(--outline)',
              borderRadius: '6px',
              color: 'var(--text)',
              fontSize: '13px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.target.style.borderColor = 'var(--coral-text)';
              e.target.style.backgroundColor = 'var(--raised)';
            }}
            onMouseLeave={(e) => {
              e.target.style.borderColor = 'var(--outline)';
              e.target.style.backgroundColor = 'transparent';
            }}
          >
            My Decisions
          </button>
        </div>
        <PageHeader title="GROW" />
        <h2 className="ds-question">What options do you have?</h2>

        <div style={{ marginTop: '24px', width: '100%', height: '4px', backgroundColor: 'var(--line)', borderRadius: '2px', marginBottom: '32px', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: '75%', backgroundColor: 'var(--coral-text)', transition: 'width 0.3s ease' }} />
        </div>

        <OptionsTimer
          initialSeconds={timerSeconds}
          onTimeChange={(seconds) => setTimerSeconds(seconds)}
        />

        <div style={{ marginBottom: '32px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {optionsValue.map((option, index) => (
            <div key={index} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <div style={{ flexGrow: 1, flexBasis: 0, minWidth: 0 }}>
                <TextField
                  aria-label={`Option ${index + 1}`}
                  value={option}
                  onChange={(e) => handleOptionChange(index, e.target.value)}
                  placeholder="Type here"
                />
              </div>
              <button
                onClick={() => handleRemoveOption(index)}
                title="Remove option"
                style={{
                  padding: '8px',
                  backgroundColor: 'transparent',
                  color: 'var(--coral-text)',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginTop: '2px',
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--raised)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                aria-label="Remove option"
              >
                <Crosshair variant="close" />
              </button>
            </div>
          ))}
        </div>

        <button
          onClick={handleAddOption}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '12px 24px',
            backgroundColor: 'transparent',
            border: '2px solid var(--outline)',
            borderRadius: '8px',
            color: 'var(--text)',
            fontWeight: '600',
            cursor: 'pointer',
            fontSize: '14px',
            transition: 'all 0.2s',
            marginBottom: '32px',
            alignSelf: 'flex-start',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--coral-text)';
            e.currentTarget.style.backgroundColor = 'var(--raised)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--outline)';
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          <Crosshair />
          Add Option
        </button>

        {error && (
          <div style={{ padding: '16px', marginBottom: '16px', backgroundColor: 'var(--coral-soft-tint)', borderRadius: '8px', border: 'none' }}>
            <p style={{ fontSize: '14px', color: 'var(--text)', margin: '0 0 12px 0', fontWeight: '500' }}>
              {error}
            </p>
            <button
              onClick={onRetry}
              style={{
                padding: '8px 16px',
                backgroundColor: 'var(--coral)',
                color: 'var(--on-coral)',
                border: 'none',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => e.target.style.backgroundColor = 'var(--coral-hover)'}
              onMouseLeave={(e) => e.target.style.backgroundColor = 'var(--coral)'}
            >
              Retry
            </button>
          </div>
        )}

        {isLoading ? (
          <Loading label="Loading your decision" />
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
