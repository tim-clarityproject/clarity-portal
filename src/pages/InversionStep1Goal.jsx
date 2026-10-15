import { useState, useContext, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { discardDecisionDraft } from '../lib/discardDraft';
import { clearProgress } from '../lib/saveProgress';
import DesignHeader from '../components/DesignHeader';
import PhoneActionBar from '../components/ui/PhoneActionBar';
import AutoGrowTextarea from '../components/ui/AutoGrowTextarea';
import { DiscardLink } from '../components/ui/DiscardLink';
import DiscardDialog from '../components/ui/DiscardDialog';
import NameDialog from '../components/ui/NameDialog';
import Toast from '../components/ui/Toast';
import useToast from '../hooks/useToast';
import PageHeading from '../components/PageHeading';

const MAX_NAME_LENGTH = 60;

function suggestNameFrom(goal) {
  const trimmed = (goal || '').trim();
  if (!trimmed) return 'New Pre-Mortem';
  return trimmed.length > MAX_NAME_LENGTH ? trimmed.slice(0, MAX_NAME_LENGTH) : trimmed;
}

export default function InversionStep1Goal() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const [decisionId, setDecisionId] = useState(location.state?.decisionId || null);

  const [goal, setGoal] = useState(location.state?.goal || '');
  const [risks, setRisks] = useState(location.state?.risks || []);
  const [riskAnswers, setRiskAnswers] = useState(location.state?.riskAnswers || []);
  const [legacyPlan, setLegacyPlan] = useState(location.state?.legacyPlan || '');
  const [currentTitle, setCurrentTitle] = useState(location.state?.problemTitle || '');
  const [isLoading, setIsLoading] = useState(Boolean(decisionId) && !location.state?.goal);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [discardOpen, setDiscardOpen] = useState(false);
  const [nameDialog, setNameDialog] = useState(null); // null | 'draft'
  const { message, showToast } = useToast();

  useEffect(() => {
    if (!decisionId || !user || location.state?.goal) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('decisions')
        .select('*')
        .eq('id', decisionId)
        .eq('user_id', user.id)
        .single();
      if (cancelled) return;
      if (error) {
        console.error('[InversionStep1Goal] load failed:', error);
        setIsLoading(false);
        return;
      }
      if (data?.title) setCurrentTitle(data.title);
      const formData = data?.form_data || {};
      setGoal(formData.goal || data.title || '');
      setRisks(formData.risks || formData.fuckups || []);
      setRiskAnswers(formData.riskAnswers || []);
      setLegacyPlan(formData.riskAnswers ? '' : (formData.plan || ''));
      setIsLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decisionId, user?.id]);

  const buildState = (overrides = {}) => ({
    decisionId,
    goal,
    risks,
    riskAnswers,
    legacyPlan,
    problemTitle: currentTitle,
    ...overrides,
  });

  const persistDraft = async (name) => {
    const payload = {
      form_data: { goal, risks, riskAnswers },
      title: name,
      draft: true,
      status: 'draft',
      updated_at: new Date().toISOString(),
    };
    if (decisionId) {
      const { data, error } = await supabase
        .from('decisions')
        .update(payload)
        .eq('id', decisionId)
        .eq('user_id', user.id)
        .select();
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Could not find this entry to update.');
      return decisionId;
    }
    const { data, error } = await supabase
      .from('decisions')
      .insert({ user_id: user.id, tool_type: 'inversion', ...payload })
      .select();
    if (error) throw error;
    if (!data || data.length === 0) throw new Error('Save did not return an entry.');
    return data[0].id;
  };

  const handleSaveDraftConfirm = async (name) => {
    if (!user || isSaving) return;
    setSaveError('');
    setIsSaving(true);
    try {
      const savedId = await persistDraft(name);
      setDecisionId(savedId);
      setCurrentTitle(name);
      setNameDialog(null);
      clearProgress();
      showToast(`Draft saved as ${name}.`);
      navigate('/decision-history');
    } catch (error) {
      console.error('[InversionStep1Goal] draft save failed:', error);
      setNameDialog(null);
      setSaveError('Could not save - please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  // Deletes the saved row only if it is still a draft - a completed
  // decision is never deleted by walking away from it. The condition
  // lives in the query (see discardDraft.js), which is what makes this
  // safe on the steps that never fetch the row and so cannot tell a
  // draft from a completed one in page code (patch D1).
  const handleDiscard = async () => {
    setDiscardOpen(false);
    if (decisionId) {
      try {
        await discardDecisionDraft(user.id, decisionId);
      } catch (error) {
        console.error('[InversionStep1Goal] draft delete on discard failed:', error);
      }
    }
    navigate('/decision-history', { state: { toast: 'Discarded.' } });
  };

  const canContinue = goal.trim().length > 0;
  const suggestedName = currentTitle || suggestNameFrom(goal);

  const actionButtons = (
    <>
      <button
        type="button"
        className="ui-btn-primary"
        disabled={!canContinue || isSaving}
        onClick={() => navigate('/inversion-step-2', { state: buildState() })}
      >
        Continue
      </button>
      <button type="button" className="ui-btn-ghost" disabled={isSaving} onClick={() => setNameDialog('draft')}>
        Save as draft
      </button>
    </>
  );

  return (
    <div className="ui-root">
      <DesignHeader />

      <div className="plan-page plan-page--form">
        <div className="inv-stepper">
          <div className="inv-stepper-lines" aria-hidden="true">
            <i className="on" />
            <i />
            <i />
          </div>
          <span className="inv-stepper-label">Step 1 of 3</span>
        </div>

        <div className="plan-header">
          <PageHeading pageKey="inversionStep1Goal" title="What are you trying to achieve?" overline="" subtitle="" rule={false} />
        </div>

        {isLoading ? (
          <p className="ui-subtitle">Loading...</p>
        ) : (
          <div className="plan-field">
            <AutoGrowTextarea
              className="plan-dq-textarea"
              placeholder="Type here"
              aria-label="What are you trying to achieve?"
              value={goal}
              onChange={setGoal}
            />
          </div>
        )}

        {saveError && <p className="plan-save-error" role="alert">{saveError}</p>}

        <div className="plan-actions plan-actions--desktop">{actionButtons}</div>

        <div className="plan-discard-row">
          <DiscardLink onClick={() => setDiscardOpen(true)} />
        </div>
      </div>

      <PhoneActionBar>{actionButtons}</PhoneActionBar>

      <NameDialog
        open={nameDialog === 'draft'}
        title="Name this draft"
        message="Give it a name so you can find it in My decisions."
        suggestedName={suggestedName}
        onConfirm={handleSaveDraftConfirm}
        onCancel={() => setNameDialog(null)}
      />

      <DiscardDialog
        isOpen={discardOpen}
        title="Discard this entry?"
        message="Anything you have not saved will be lost."
        onKeep={() => setDiscardOpen(false)}
        onDiscard={handleDiscard}
      />
      <Toast message={message} />
    </div>
  );
}
