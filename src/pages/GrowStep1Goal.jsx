import { useState, useContext, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FormContext } from '../context/FormContext';
import { useFormDraftReady } from '../hooks/useFormDraftReady';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import SaveDiscardButtons from '../components/SaveDiscardButtons';
import DesignHeader from '../components/DesignHeader';
import { Loading, PageHeader, TextBox, Button } from '../components/design';

// Waits for a draft FormContext is putting back after a refresh (see
// useFormDraftReady), then shows the step.
export default function GrowStep1Goal() {
  const { ready, isReload } = useFormDraftReady();
  if (!ready) {
    return (
      <div className="ui-root" style={{ minHeight: '100vh', paddingTop: 'var(--header-height)', backgroundColor: 'var(--bg)' }}>
        <DesignHeader />
        <Loading label="Loading your decision" />
      </div>
    );
  }
  return <GrowStep1GoalForm isReload={isReload} />;
}

function GrowStep1GoalForm({ isReload }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { formData, updateFormData, loadedDecisionId, setLoadedDecisionId, clearFormData } = useContext(FormContext);
  const { user } = useContext(AuthContext);
  // After a refresh (or the browser's back button) the shared form already
  // holds this decision's typing, put back from the device: keep it rather
  // than starting fresh or reloading over it. Decided once, on opening.
  const [keepWork] = useState(() => isReload && (loadedDecisionId ?? null) === (location.state?.decisionId ?? null));
  const [goal, setGoal] = useState(() => (keepWork && formData.goal) || location.state?.goal || '');
  const [isLoading, setIsLoading] = useState(false);

  // Reset FormContext when creating fresh decision (no decisionId)
  // This prevents data leaks from previous decisions
  useEffect(() => {
    if (keepWork) return;
    if (!location.state?.decisionId) {
      clearFormData();
      setLoadedDecisionId(null);
    }
  }, [keepWork, location.state?.decisionId, clearFormData, setLoadedDecisionId]);

  // Blank every step on a fresh start
  useEffect(() => {
    if (keepWork) return;
    if (!location.state?.decisionId && !location.state?.goal) {
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
      if (!decisionId || !user || keepWork) {
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
        <div style={{ marginBottom: '48px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '24px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <PageHeader title="Get unstuck" meta={['Uses the GROW model.']} />
            <h2 className="ds-question">Define your goal clearly</h2>
          </div>
          <Button variant="outline" onClick={() => navigate('/decision-history')} style={{ flexShrink: 0 }}>My Decisions</Button>
        </div>

        <div style={{ marginBottom: '32px' }}>
          <div style={{ width: '100%', height: '4px', backgroundColor: 'var(--line)', borderRadius: '2px', marginBottom: '24px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: '25%', backgroundColor: 'var(--text)', transition: 'width 0.3s ease' }} />
          </div>

          {isLoading && <Loading label="Loading your decision" />}

          <TextBox
            ariaLabel="Define your goal clearly"
            lines="many"
            value={goal}
            onChange={(text) => handleChange({ target: { value: text } })}
            placeholder="Type here"
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
