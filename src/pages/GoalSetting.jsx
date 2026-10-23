import { useState, useContext, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FormContext } from '../context/FormContext';
import { useLoadDecision } from '../hooks/useLoadDecision';
import SaveDiscardButtons from '../components/SaveDiscardButtons';
import DesignHeader from '../components/DesignHeader';
import { PageHeader, TextBox, Button } from '../components/design';

export default function GoalSetting() {
  const navigate = useNavigate();
  const location = useLocation();
  const { formData, updateFormData, getFieldValue } = useContext(FormContext);
  const [goal, setGoal] = useState(() => location.state?.goal || '');

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
    <div className="ui-root" style={{ minHeight: '100vh', paddingTop: 'var(--header-height)', backgroundColor: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      <DesignHeader />

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '800px', margin: '0 auto', width: '100%', padding: '64px 32px' }} className="page-container">
        <div style={{ marginBottom: '48px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
          <div style={{ flex: 1 }}>
            <PageHeader title="Strategic alignment" meta={[location.state?.problemTitle]} />
            <h2 className="ds-question">{path === 'team' ? "What is your team's big objective?" : 'What are you hoping to achieve?'}</h2>
          </div>
          <Button variant="outline" onClick={() => navigate('/decision-history')} style={{ flexShrink: 0 }}>My Decisions</Button>
        </div>
        <div style={{ width: '100%', height: '4px', backgroundColor: 'var(--line)', borderRadius: '2px', overflow: 'hidden', marginBottom: '24px' }}>
          <div style={{ height: '100%', width: path === 'team' ? '20%' : '25%', backgroundColor: 'var(--coral-text)', transition: 'width 0.3s ease' }} />
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
          <div style={{ marginBottom: '48px' }}>
          <TextBox
            ariaLabel={path === 'team' ? "What is your team's big objective?" : 'What are you hoping to achieve?'}
            lines="one"
            value={goal}
            onChange={(text) => handleChange({ target: { value: text } })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (goal.trim()) {
                  handleSubmit(e);
                }
              }
            }}
            placeholder="Type here"
          />
          </div>
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
