import { useContext, useCallback, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FormContext } from '../context/FormContext';
import { useLoadDecisionStep } from '../hooks/useLoadDecisionStep';
import BackArrow from '../components/BackArrow';
import SaveDiscardButtons from '../components/SaveDiscardButtons';
import DesignHeader from '../components/DesignHeader';
import { useAutoExpandTextarea } from '../hooks/useAutoExpandTextarea';
import { Loading } from '../components/design';

export default function GrowStep2Reality() {
  const navigate = useNavigate();
  const location = useLocation();
  const { updateFormData, getFieldValue } = useContext(FormContext);
  const refConstraints = useRef(null);
  const refOpportunities = useRef(null);

  // Load decision data for edit mode; returns values from FormContext
  const { isLoading, isEditMode, error, onRetry, markDirty, constraints, opportunities } = useLoadDecisionStep(['constraints', 'opportunities']);

  useAutoExpandTextarea(refConstraints, constraints);
  useAutoExpandTextarea(refOpportunities, opportunities);

  // Only clear on mount if starting fresh (no decisionId)
  useEffect(() => {
    if (!location.state?.decisionId) {
      updateFormData('constraints', '');
      updateFormData('opportunities', '');
    }
  }, []);

  const handleNext = useCallback((newDecisionId) => {
    // Prevent save while loading edit data
    if (isLoading) return;

    const constraintsValue = getFieldValue('constraints');
    const opportunitiesValue = getFieldValue('opportunities');

    if (constraintsValue.trim() || opportunitiesValue.trim()) {
      const finalDecisionId = newDecisionId || location.state?.decisionId;
      navigate('/grow-step-3', {
        state: {
          problemTitle: location.state?.problemTitle,
          goal: location.state?.goal,
          constraints: constraintsValue,
          opportunities: opportunitiesValue,
          decisionId: finalDecisionId
        }
      });
    }
  }, [isLoading, location.state?.problemTitle, location.state?.goal, location.state?.decisionId, navigate, getFieldValue]);

  const handleConstraintsChange = (e) => {
    const value = e.target.value;
    updateFormData('constraints', value);
    markDirty('constraints');
  };

  const handleOpportunitiesChange = (e) => {
    const value = e.target.value;
    updateFormData('opportunities', value);
    markDirty('opportunities');
  };

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
        <h1 className="page-heading">What's the current situation?</h1>

        <div style={{ width: '100%', height: '4px', backgroundColor: 'var(--line)', borderRadius: '2px', marginBottom: '32px', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: '50%', backgroundColor: 'var(--coral-text)', transition: 'width 0.3s ease' }} />
        </div>

        <div style={{ marginBottom: '32px' }}>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: 'var(--text)', marginBottom: '12px' }}>
            What are your constraints?
          </label>
          <textarea
            ref={refConstraints}
            value={constraints}
            onChange={handleConstraintsChange}
            placeholder="Type here"
            style={{
              backgroundColor: 'var(--card)',
              color: 'var(--text)',
              width: '100%',
              minHeight: '150px',
              padding: '16px',
              border: '2px solid var(--field-line)',
              borderRadius: '8px',
              fontSize: '14px',
              fontFamily: 'system-ui, -apple-system, sans-serif',
              boxSizing: 'border-box',
              outline: 'none',
              resize: 'none',
              overflow: 'hidden',
              marginBottom: '24px',
            }}
            onFocus={(e) => e.target.style.borderColor = 'var(--coral-text)'}
            onBlur={(e) => e.target.style.borderColor = 'var(--field-line)'}
          />

          <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: 'var(--text)', marginBottom: '12px' }}>
            What opportunities do you have?
          </label>
          <textarea
            ref={refOpportunities}
            value={opportunities}
            onChange={handleOpportunitiesChange}
            placeholder="Type here"
            style={{
              backgroundColor: 'var(--card)',
              color: 'var(--text)',
              width: '100%',
              minHeight: '150px',
              padding: '16px',
              border: '2px solid var(--field-line)',
              borderRadius: '8px',
              fontSize: '14px',
              fontFamily: 'system-ui, -apple-system, sans-serif',
              boxSizing: 'border-box',
              outline: 'none',
              resize: 'none',
              overflow: 'hidden',
            }}
            onFocus={(e) => e.target.style.borderColor = 'var(--coral-text)'}
            onBlur={(e) => e.target.style.borderColor = 'var(--field-line)'}
          />
        </div>

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
            formData={{ constraints: getFieldValue('constraints'), opportunities: getFieldValue('opportunities') }}
            pageType="decision"
            toolType="grow"
            onNext={handleNext}
            canNext={!error && ((getFieldValue('constraints') || '').trim() || (getFieldValue('opportunities') || '').trim())}
            onBack={() => navigate('/grow-step-1', { state: { decisionId: location.state?.decisionId, problemTitle: location.state?.problemTitle } })}
          />
        )}
      </div>
    </div>
  );
}
