import { useState, useContext, useEffect, useCallback } from 'react';
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
  const { formData, updateFormData, getFieldValue } = useContext(FormContext);
  const { user } = useContext(AuthContext);
  const [goal, setGoal] = useState(() => location.state?.goal || getFieldValue('goal') || '');
  const [isLoading, setIsLoading] = useState(false);
  const isGuest = location.state?.isGuest || false;

  // Load existing decision if decisionId is provided
  useEffect(() => {
    const loadDecision = async () => {
      const decisionId = location.state?.decisionId;
      if (!decisionId || !user) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        console.log('Loading decision:', decisionId);
        const { data, error } = await supabase
          .from('decisions')
          .select('*')
          .eq('id', decisionId)
          .eq('user_id', user.id)
          .single();

        if (error) {
          console.error('Error fetching decision:', error);
          setIsLoading(false);
          return;
        }

        if (data) {
          console.log('Decision loaded:', data);
          const formDataLoaded = data.form_data || {};
          setGoal(formDataLoaded.goal || data.title || '');
          updateFormData('goal', formDataLoaded.goal || data.title || '');
          updateFormData('constraints', formDataLoaded.constraints || '');
          updateFormData('opportunities', formDataLoaded.opportunities || '');
          updateFormData('options', formDataLoaded.options || []);
          updateFormData('willDo', formDataLoaded.will_do || '');
        }
      } catch (err) {
        console.error('Error loading decision:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadDecision();
  }, [location.state?.decisionId, user, updateFormData]);

  const problemTitle = location.state?.problemTitle;
  const decisionId = location.state?.decisionId;

  const handleNext = useCallback(() => {
    if (goal.trim()) {
      updateFormData('goal', goal);
      navigate('/grow-step-2', {
        state: {
          problemTitle,
          goal,
          isGuest,
          decisionId,
        }
      });
    }
  }, [goal, isGuest, problemTitle, decisionId, navigate, updateFormData]);

  const handleChange = (e) => {
    const newGoal = e.target.value;
    setGoal(newGoal);
    updateFormData('goal', newGoal);
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
      <HomeHeader isGuest={isGuest} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '800px', margin: '0 auto', width: '100%', padding: '64px 32px' }}>
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
              e.target.style.backgroundColor = '#FEE5DE';
            }}
            onMouseLeave={(e) => {
              e.target.style.borderColor = '#e5e5e5';
              e.target.style.backgroundColor = 'transparent';
            }}
          >
            My Decisions
          </button>
        </div>
        {location.state?.problemTitle && (
          <p style={{ fontSize: '13px', color: '#999', fontWeight: '500', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            {location.state.problemTitle}
          </p>
        )}
        <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: 'black', margin: 0, marginBottom: '32px' }}>Define your goal clearly</h1>

        <div style={{ marginBottom: '32px' }}>
          <div style={{ width: '100%', height: '4px', backgroundColor: '#e5e5e5', borderRadius: '2px', marginBottom: '24px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: '25%', backgroundColor: '#F08571', transition: 'width 0.3s ease' }} />
          </div>

          {isLoading && <p style={{ fontSize: '13px', color: '#999', marginBottom: '16px' }}>Loading decision...</p>}

          <textarea
            value={goal}
            onChange={handleChange}
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

        <SaveDiscardButtons
          formData={{ goal }}
          pageType="decision"
          toolType="grow"
          onNext={handleNext}
          canNext={goal.trim() ? true : false}
        />
      </div>
    </div>
  );
}
