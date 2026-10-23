import { useState, useContext, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FormContext } from '../context/FormContext';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import BackArrow from '../components/BackArrow';
import SaveDiscardButtons from '../components/SaveDiscardButtons';
import DesignHeader from '../components/DesignHeader';
import { useAutoExpandTextarea } from '../hooks/useAutoExpandTextarea';
import { Loading } from '../components/design';

export default function GrowStep1Goal() {
  const navigate = useNavigate();
  const location = useLocation();
  const { formData, updateFormData, getFieldValue, setLoadedDecisionId, clearFormData } = useContext(FormContext);
  const { user } = useContext(AuthContext);
  const [goal, setGoal] = useState(location.state?.goal || '');
  const [isLoading, setIsLoading] = useState(false);
  const refGoal = useRef(null);
  useAutoExpandTextarea(refGoal, goal);

  // Reset FormContext when creating fresh decision (no decisionId)
  // This prevents data leaks from previous decisions across browser refreshes
  useEffect(() => {
    if (!location.state?.decisionId) {
      clearFormData();
      setLoadedDecisionId(null);
    }
  }, [location.state?.decisionId, clearFormData, setLoadedDecisionId]);

  // Clear form and localStorage on fresh start, or recover from localStorage
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
      updateFormData('constraints', '');
      updateFormData('opportunities', '');
      updateFormData('options', []);
      updateFormData('will_do', '');
    }
  }, []);

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
          updateFormData('will_do', formDataLoaded.will_do || '');
          setLoadedDecisionId(decisionId);
        }
      } catch (err) {
        console.error('Error loading decision:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadDecision();
  }, [location.state?.decisionId, user?.id]);

  const problemTitle = location.state?.problemTitle;
  const decisionId = location.state?.decisionId;

  const handleNext = useCallback((newDecisionId) => {
    if (goal.trim()) {
      updateFormData('goal', goal);
      const finalDecisionId = newDecisionId || decisionId;
      navigate('/grow-step-2', {
        state: {
          problemTitle,
          goal,
          decisionId: finalDecisionId,
        }
      });
    }
  }, [goal, problemTitle, decisionId, navigate, updateFormData]);

  const handleChange = (e) => {
    const newGoal = e.target.value;
    setGoal(newGoal);
    updateFormData('goal', newGoal);
  };

  return (
    <div className="ui-root" style={{ minHeight: '100vh', paddingTop: 'var(--header-height)', backgroundColor: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      <DesignHeader />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '800px', margin: '0 auto', width: '100%', padding: '64px 32px' }} className="page-container">
        <div style={{ marginBottom: '48px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '24px' }}>
          <div>
            <h1 className="page-heading">Define your goal clearly</h1>
          </div>
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
              flexShrink: 0,
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

        <div style={{ marginBottom: '32px' }}>
          <div style={{ width: '100%', height: '4px', backgroundColor: 'var(--line)', borderRadius: '2px', marginBottom: '24px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: '25%', backgroundColor: 'var(--coral-text)', transition: 'width 0.3s ease' }} />
          </div>

          {isLoading && <Loading label="Loading your decision" />}

          <textarea
            ref={refGoal}
            value={goal}
            onChange={handleChange}
            placeholder="Type here"
            style={{
              backgroundColor: 'var(--card)',
              color: 'var(--text)',
              width: '100%',
              minHeight: '300px',
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
