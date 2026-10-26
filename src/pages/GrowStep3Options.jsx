import { useState, useContext, useCallback, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FormContext } from '../context/FormContext';
import { useFormDraftReady } from '../hooks/useFormDraftReady';
import { useLoadDecisionStep } from '../hooks/useLoadDecisionStep';
import SaveDiscardButtons from '../components/SaveDiscardButtons';
import OptionsTimer from '../components/OptionsTimer';
import DesignHeader from '../components/DesignHeader';
import { Crosshair, Loading, PageHeader, TextField, AddButton, Button } from '../components/design';

// Never the raw error: say what happened, then what to do.
const LOAD_ERROR = 'Your decision didn’t load. Check your connection and try again.';

// Waits for a draft FormContext is putting back after a refresh (see
// useFormDraftReady), then shows the step.
export default function GrowStep3Options() {
  const { ready, isReload } = useFormDraftReady();
  if (!ready) {
    return (
      <div className="ui-root" style={{ minHeight: '100vh', paddingTop: 'var(--header-height)', backgroundColor: 'var(--bg)' }}>
        <DesignHeader />
        <Loading label="Loading your decision" />
      </div>
    );
  }
  return <GrowStep3OptionsForm isReload={isReload} />;
}

function GrowStep3OptionsForm({ isReload }) {
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

  // Clear on fresh start (new decision). After a refresh the shared form
  // holds what was typed, put back from the device: keep it.
  useEffect(() => {
    if (isReload) return;
    if (!isEditMode && !location.state?.constraints) {
      updateFormData('options', ['', '', '']);
    }
  }, [isReload, isEditMode, location.state?.constraints, updateFormData]);

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
          <Button variant="outline" onClick={() => navigate('/decision-history')}>My Decisions</Button>
        </div>
        <PageHeader title="Get unstuck" />
        <h2 className="ds-question">What options do you have?</h2>

        <div style={{ marginTop: '24px', width: '100%', height: '4px', backgroundColor: 'var(--line)', borderRadius: '2px', marginBottom: '32px', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: '75%', backgroundColor: 'var(--text)', transition: 'width 0.3s ease' }} />
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

        <AddButton onClick={handleAddOption} style={{ marginBottom: '32px', alignSelf: 'flex-start' }}>Add option</AddButton>

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
