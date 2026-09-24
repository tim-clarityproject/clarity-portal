import { useContext, useCallback, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FormContext } from '../context/FormContext';
import { useLoadDecisionStep } from '../hooks/useLoadDecisionStep';
import BackArrow from '../components/BackArrow';
import SaveDiscardButtons from '../components/SaveDiscardButtons';
import HomeHeader from '../components/HomeHeader';
import { useAutoExpandTextarea } from '../hooks/useAutoExpandTextarea';

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
        <h1 className="page-heading">What's the current situation?</h1>

        <div style={{ width: '100%', height: '4px', backgroundColor: '#e5e5e5', borderRadius: '2px', marginBottom: '32px', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: '50%', backgroundColor: '#F08571', transition: 'width 0.3s ease' }} />
        </div>

        <div style={{ marginBottom: '32px' }}>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#333', marginBottom: '12px' }}>
            What are your constraints?
          </label>
          <textarea
            ref={refConstraints}
            value={constraints}
            onChange={handleConstraintsChange}
            placeholder="Type here"
            style={{
              width: '100%',
              minHeight: '150px',
              padding: '16px',
              border: '2px solid #e5e5e5',
              borderRadius: '8px',
              fontSize: '14px',
              fontFamily: 'system-ui, -apple-system, sans-serif',
              boxSizing: 'border-box',
              outline: 'none',
              resize: 'none',
              overflow: 'hidden',
              marginBottom: '24px',
            }}
            onFocus={(e) => e.target.style.borderColor = '#F08571'}
            onBlur={(e) => e.target.style.borderColor = '#e5e5e5'}
          />

          <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#333', marginBottom: '12px' }}>
            What opportunities do you have?
          </label>
          <textarea
            ref={refOpportunities}
            value={opportunities}
            onChange={handleOpportunitiesChange}
            placeholder="Type here"
            style={{
              width: '100%',
              minHeight: '150px',
              padding: '16px',
              border: '2px solid #e5e5e5',
              borderRadius: '8px',
              fontSize: '14px',
              fontFamily: 'system-ui, -apple-system, sans-serif',
              boxSizing: 'border-box',
              outline: 'none',
              resize: 'none',
              overflow: 'hidden',
            }}
            onFocus={(e) => e.target.style.borderColor = '#F08571'}
            onBlur={(e) => e.target.style.borderColor = '#e5e5e5'}
          />
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
