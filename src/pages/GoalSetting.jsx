import { useState, useContext, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FormContext } from '../context/FormContext';
import SaveDiscardButtons from '../components/SaveDiscardButtons';
import HomeHeader from '../components/HomeHeader';

export default function GoalSetting() {
  const navigate = useNavigate();
  const location = useLocation();
  const { formData, updateFormData, getFieldValue } = useContext(FormContext);
  const [goal, setGoal] = useState(() => location.state?.goal || '');

  const problemTitle = location.state?.problemTitle || '';
  const path = location.state?.path || (problemTitle?.includes('team') ? 'team' : 'personal');
  const isGuest = location.state?.isGuest || false;

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

  const handleSubmit = (e) => {
    e.preventDefault();
    if (goal.trim()) {
      navigate('/risks-assessment', { state: { ...location.state, goal, path, isGuest } });
    }
  };

  const handleChange = (e) => {
    const newGoal = e.target.value;
    setGoal(newGoal);
    updateFormData('goal', newGoal);
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
      <HomeHeader isGuest={isGuest} />

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '1024px', margin: '0 auto', width: '100%', padding: '64px 32px' }}>
        <div style={{ marginBottom: '48px', textAlign: 'center' }}>
          {location.state?.problemTitle && (
            <p style={{ fontSize: '13px', color: '#999', fontWeight: '500', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {location.state.problemTitle}
            </p>
          )}
          <h1 style={{ fontSize: '32px', fontWeight: 'bold', color: 'black', margin: 0, marginBottom: '24px' }}>
            {path === 'team' ? "What is your team's big objective?" : 'What are you hoping to achieve?'}
          </h1>
          <div style={{ width: '100%', height: '4px', backgroundColor: '#e5e5e5', borderRadius: '2px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: path === 'team' ? '20%' : '25%', backgroundColor: '#F08571', transition: 'width 0.3s ease' }} />
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
          <textarea
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
            placeholder="Type here..."
            style={{
              padding: '16px',
              border: '2px solid #e5e5e5',
              borderRadius: '8px',
              fontSize: '16px',
              height: '100px',
              textAlign: 'center',
              fontFamily: 'inherit',
              resize: 'none',
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
          onNext={handleSubmit}
          canNext={goal.trim().length > 0}
        />
      </div>
    </div>
  );
}
