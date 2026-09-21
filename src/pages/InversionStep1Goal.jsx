import { useState, useContext, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FormContext } from '../context/FormContext';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import BackArrow from '../components/BackArrow';
import SaveDiscardButtons from '../components/SaveDiscardButtons';
import HomeHeader from '../components/HomeHeader';

export default function InversionStep1Goal() {
  const navigate = useNavigate();
  const location = useLocation();
  const { formData, updateFormData, getFieldValue } = useContext(FormContext);
  const { user } = useContext(AuthContext);
  const [goal, setGoal] = useState(() => location.state?.goal || '');
  const [isLoading, setIsLoading] = useState(false);
  const isGuest = location.state?.isGuest || false;

  useEffect(() => {
    if (!location.state?.decisionId && !location.state?.goal) {
      // Try to recover from localStorage first
      try {
        const saved = localStorage.getItem('clarity_form_data');
        if (saved) {
          const data = JSON.parse(saved);
          if (data.goal) {
            setGoal(data.goal);
            updateFormData('goal', data.goal);
            return;
          }
        }
      } catch (e) {
        // localStorage corrupted, clear it
        localStorage.removeItem('clarity_form_data');
      }

      // If no localStorage data, clear everything
      setGoal('');
      updateFormData('goal', '');
      updateFormData('fuckups', []);
      updateFormData('plan', '');
    }
  }, []);

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
          updateFormData('fuckups', formDataLoaded.fuckups || []);
          updateFormData('plan', formDataLoaded.plan || '');
        }
      } catch (err) {
        console.error('Error loading decision:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadDecision();
  }, [location.state?.decisionId, user?.id]);

  // Also load from location.state if available (when navigating between steps)
  useEffect(() => {
    if (location.state?.goal) {
      setGoal(location.state.goal);
      updateFormData('goal', location.state.goal);
    }
  }, [location.state?.goal, updateFormData]);

  const handleNext = (newDecisionId) => {
    if (goal.trim()) {
      updateFormData('goal', goal);
      const finalDecisionId = newDecisionId || location.state?.decisionId;
      navigate('/inversion-step-2', {
        state: {
          ...formData,
          goal,
          isGuest,
          decisionId: finalDecisionId
        }
      });
    }
  };

  return (
    <div style={{ minHeight: '100vh', paddingTop: '70px', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
      <HomeHeader isGuest={isGuest} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '800px', margin: '0 auto', width: '100%', padding: '64px 32px' }} className="page-container">
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
        <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: 'black', margin: 0, marginBottom: '32px' }}>What's your goal?</h1>

        <div style={{ marginBottom: '32px' }}>
          <div style={{ width: '100%', height: '4px', backgroundColor: '#e5e5e5', borderRadius: '2px', marginBottom: '24px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: '33.33%', backgroundColor: '#F08571', transition: 'width 0.3s ease' }} />
          </div>

          <textarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="Type here"
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
              resize: 'none',
            }}
            onFocus={(e) => e.target.style.borderColor = '#F08571'}
            onBlur={(e) => e.target.style.borderColor = '#e5e5e5'}
          />
        </div>

        <SaveDiscardButtons
          formData={{ goal }}
          pageType="decision"
          toolType="inversion"
          onNext={handleNext}
          canNext={goal.trim() ? true : false}
        />
      </div>
    </div>
  );
}
