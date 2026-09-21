import { useState, useContext, useCallback, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FormContext } from '../context/FormContext';
import { useLoadDecision } from '../hooks/useLoadDecision';
import BackArrow from '../components/BackArrow';
import SaveDiscardButtons from '../components/SaveDiscardButtons';
import HomeHeader from '../components/HomeHeader';
import { useAutoExpandTextarea } from '../hooks/useAutoExpandTextarea';

export default function GrowStep2Reality() {
  const navigate = useNavigate();
  const location = useLocation();
  const { formData, updateFormData, getFieldValue } = useContext(FormContext);
  const [constraints, setConstraints] = useState(location.state?.constraints || '');
  const [opportunities, setOpportunities] = useState(location.state?.opportunities || '');
  const isGuest = location.state?.isGuest || false;
  const refConstraints = useRef(null);
  const refOpportunities = useRef(null);
  useAutoExpandTextarea(refConstraints, constraints);
  useAutoExpandTextarea(refOpportunities, opportunities);

  useLoadDecision(updateFormData);

  useEffect(() => {
    if (location.state?.constraints) setConstraints(location.state.constraints);
    if (location.state?.opportunities) setOpportunities(location.state.opportunities);
  }, [location.state?.constraints, location.state?.opportunities]);

  useEffect(() => {
    if (!location.state?.decisionId && !location.state?.goal) {
      setConstraints('');
      setOpportunities('');
      updateFormData('constraints', '');
      updateFormData('opportunities', '');
      localStorage.removeItem('clarity_form_data');
    }
  }, []);

  const handleNext = useCallback((newDecisionId) => {
    if (constraints.trim() || opportunities.trim()) {
      updateFormData('constraints', constraints);
      updateFormData('opportunities', opportunities);
      const finalDecisionId = newDecisionId || location.state?.decisionId;
      navigate('/grow-step-3', {
        state: {
          problemTitle: location.state?.problemTitle,
          goal: location.state?.goal,
          constraints,
          opportunities,
          isGuest,
          decisionId: finalDecisionId
        }
      });
    }
  }, [constraints, opportunities, isGuest, location.state?.problemTitle, location.state?.goal, location.state?.decisionId, navigate, updateFormData]);

  const handleConstraintsChange = (e) => {
    const value = e.target.value;
    setConstraints(value);
    updateFormData('constraints', value);
  };

  const handleOpportunitiesChange = (e) => {
    const value = e.target.value;
    setOpportunities(value);
    updateFormData('opportunities', value);
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
      <HomeHeader isGuest={isGuest} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '800px', marginTop: '56px', margin: '0 auto', width: '100%', padding: '64px 32px', marginTop: '56px' }} className="page-container">
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
        <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: 'black', margin: 0, marginBottom: '8px' }}>What's the current situation?</h1>

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

        <SaveDiscardButtons
          formData={{ constraints, opportunities }}
          pageType="decision"
          toolType="grow"
          onNext={handleNext}
          canNext={constraints.trim() || opportunities.trim()}
          onBack={() => navigate('/grow-step-1', { state: { ...location.state, isGuest, decisionId: location.state?.decisionId } })}
        />
      </div>
    </div>
  );
}
