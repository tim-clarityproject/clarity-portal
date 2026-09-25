import { useState, useContext, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FormContext } from '../context/FormContext';
import { useLoadDecision } from '../hooks/useLoadDecision';
import SaveDiscardButtons from '../components/SaveDiscardButtons';
import HomeHeader from '../components/HomeHeader';
import { useAutoExpandTextarea } from '../hooks/useAutoExpandTextarea';

export default function GoalSetting() {
  const navigate = useNavigate();
  const location = useLocation();
  const { formData, updateFormData, getFieldValue } = useContext(FormContext);
  const [goal, setGoal] = useState(() => location.state?.goal || '');
  const refGoal = useRef(null);
  useAutoExpandTextarea(refGoal, goal);

  useLoadDecision(updateFormData);

  const problemTitle = location.state?.problemTitle || '';
  const path = location.state?.path || (problemTitle?.includes('team') ? 'team' : 'personal');

  useEffect(() => {
    // Sync goal from location.state when it exists (e.g., coming back from next page or resuming draft)
    if (location.state?.goal) {
      setGoal(location.state.goal);
      updateFormData('goal', location.state.goal);
    } else if (!location.state?.decisionId) {
      // Fresh decision: clear goal and localStorage
      setGoal('');
      updateFormData('goal', '');
      localStorage.removeItem('clarity_form_data');
      // Clear strategic-alignment auto-save keys
      localStorage.removeItem('strategic-alignment-autosave');
      localStorage.removeItem('strategic-alignment-progress');
    }
  }, [location.state?.problemTitle]);

  const handleSubmit = (e, newDecisionId) => {
    // Handle both form submission and SaveDiscardButtons call
    if (e?.preventDefault) {
      e.preventDefault();
    }
    if (goal.trim()) {
      const finalDecisionId = newDecisionId || location.state?.decisionId;
      navigate('/risks-assessment', { state: { ...location.state, goal, path, decisionId: finalDecisionId } });
    }
  };

  const handleChange = (e) => {
    const newGoal = e.target.value;
    setGoal(newGoal);
    updateFormData('goal', newGoal);
  };

  return (
    <div style={{ minHeight: '100vh', paddingTop: 'var(--header-height)', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
      <HomeHeader />

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '800px', margin: '0 auto', width: '100%', padding: '64px 32px' }} className="page-container">
        <div style={{ marginBottom: '48px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: 'black', margin: 0, marginBottom: '8px' }}>
              {path === 'team' ? "What is your team's big objective?" : 'What are you hoping to achieve?'}
            </h1>
            {location.state?.problemTitle && (
              <p style={{ fontSize: '14px', color: '#999', fontWeight: '400', margin: 0, marginBottom: '24px' }}>
                {location.state.problemTitle}
              </p>
            )}
          </div>
          <button
            onClick={() => navigate('/my-decisions')}
            style={{
              padding: '10px 16px',
              backgroundColor: 'transparent',
              border: '1px solid #e5e5e5',
              color: '#333',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: '600',
              borderRadius: '6px',
              transition: 'all 0.2s',
              whiteSpace: 'nowrap',
              marginTop: '4px',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#F08571';
              e.currentTarget.style.backgroundColor = '#f9f9f9';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#e5e5e5';
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            My Decisions
          </button>
        </div>
        <div style={{ width: '100%', height: '4px', backgroundColor: '#e5e5e5', borderRadius: '2px', overflow: 'hidden', marginBottom: '24px' }}>
          <div style={{ height: '100%', width: path === 'team' ? '20%' : '25%', backgroundColor: '#F08571', transition: 'width 0.3s ease' }} />
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
          <textarea
            ref={refGoal}
            value={goal}
            onChange={handleChange}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (goal.trim()) {
                  handleSubmit(e);
                }
              }
            }}
            placeholder="Type here"
            style={{
              padding: '16px',
              border: '2px solid #e5e5e5',
              borderRadius: '8px',
              fontSize: '16px',
              minHeight: '100px',
              textAlign: 'left',
              fontFamily: 'inherit',
              resize: 'none',
              overflow: 'hidden',
              outline: 'none',
              marginBottom: '48px',
            }}
            onFocus={(e) => e.target.style.borderColor = '#F08571'}
            onBlur={(e) => e.target.style.borderColor = '#e5e5e5'}
          />
        </form>

        <SaveDiscardButtons
          formData={{ goal }}
          pageType="decision"
          toolType="strategic-alignment"
          onNext={(newDecisionId) => handleSubmit(null, newDecisionId)}
          canNext={goal.trim().length > 0}
        />
      </div>
    </div>
  );
}
