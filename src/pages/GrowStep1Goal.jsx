import { useState, useContext, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FormContext } from '../context/FormContext';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import BackArrow from '../components/BackArrow';
import SaveDiscardButtons from '../components/SaveDiscardButtons';
import HomeHeader from '../components/HomeHeader';

export default function GrowStep1Goal() {
  const navigate = useNavigate();
  const location = useLocation();
  const { formData, updateFormData } = useContext(FormContext);
  const { user } = useContext(AuthContext);
  const [goal, setGoal] = useState(location.state?.goal || '');
  const [isLoading, setIsLoading] = useState(false);
  const isGuest = location.state?.isGuest || false;

  // Load existing decision if decisionId is provided
  useEffect(() => {
    const loadDecision = async () => {
      const decisionId = location.state?.decisionId;
      if (!decisionId || !user) return;

      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('decisions')
          .select('*')
          .eq('id', decisionId)
          .eq('user_id', user.id)
          .single();

        if (data) {
          setGoal(data.goal || '');
          updateFormData('goal', data.goal || '');
          // Load all GROW data into formData
          updateFormData('goal', data.goal || '');
          updateFormData('reality', data.reality || '');
          updateFormData('options', data.options || '');
          updateFormData('willDo', data.will_do || '');
        }
      } catch (err) {
        console.error('Error loading decision:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadDecision();
  }, [location.state?.decisionId, user, updateFormData]);

  const handleNext = () => {
    if (goal.trim()) {
      updateFormData('goal', goal);
      navigate('/grow-step-2', {
        state: {
          ...formData,
          goal,
          isGuest,
          decisionId: location.state?.decisionId
        }
      });
    }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
      <HomeHeader isGuest={isGuest} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '800px', margin: '0 auto', width: '100%', padding: '64px 32px' }}>
        <div style={{ marginBottom: '32px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button
            onClick={() => navigate('/decision-tools', { state: { isGuest } })}
            style={{
              backgroundColor: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '0',
            }}
          >
            <BackArrow />
          </button>
          <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: 'black', margin: 0 }}>Define your goal clearly</h1>
        </div>

        <div style={{ marginBottom: '32px' }}>
          <p style={{ fontSize: '13px', color: '#999', marginBottom: '24px' }}>Step 1 of 4</p>

          {isLoading && <p style={{ fontSize: '13px', color: '#999', marginBottom: '16px' }}>Loading decision...</p>}

          <textarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="What is the goal you want to achieve?"
            style={{
              width: '100%',
              minHeight: '300px',
              padding: '16px',
              border: '2px solid #e5e5e5',
              borderRadius: '8px',
              fontSize: '14px',
              fontFamily: 'system-ui, -apple-system, sans-serif',
              boxSizing: 'border-box',
              outline: 'none',
              resize: 'vertical',
            }}
            onFocus={(e) => e.target.style.borderColor = '#F08571'}
            onBlur={(e) => e.target.style.borderColor = '#e5e5e5'}
          />
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={handleNext}
            disabled={!goal.trim()}
            style={{
              flex: 1,
              padding: '14px 24px',
              backgroundColor: !goal.trim() ? '#ccc' : '#F08571',
              color: 'white',
              fontWeight: 'bold',
              border: 'none',
              borderRadius: '8px',
              cursor: !goal.trim() ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => !goal.trim() || (e.target.style.backgroundColor = '#e07560')}
            onMouseLeave={(e) => !goal.trim() || (e.target.style.backgroundColor = '#F08571')}
          >
            Next
          </button>

        </div>

        <SaveDiscardButtons formData={{ goal }} pageType="decision" toolType="grow" />
      </div>
    </div>
  );
}
