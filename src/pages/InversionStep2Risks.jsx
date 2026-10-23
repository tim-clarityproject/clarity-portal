import { useState, useContext } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { discardDecisionDraft } from '../lib/discardDraft';
import { clearProgress } from '../lib/saveProgress';
import DesignHeader from '../components/DesignHeader';
import PhoneActionBar from '../components/ui/PhoneActionBar';
import { DiscardLink, BackLink } from '../components/ui/DiscardLink';
import DiscardDialog from '../components/ui/DiscardDialog';
import NameDialog from '../components/ui/NameDialog';
import pageText from '../content/pageText';
import { PageHeader, TextBox, Button, useToast } from '../components/design';

const MAX_NAME_LENGTH = 60;

function BinIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2.5 4.5h11M6 4.5V3h4v1.5M4 4.5l.6 8h6.8l.6-8M6.8 7v3.5M9.2 7v3.5" />
    </svg>
  );
}

function suggestNameFrom(goal) {
  const trimmed = (goal || '').trim();
  if (!trimmed) return 'New Pre-Mortem';
  return trimmed.length > MAX_NAME_LENGTH ? trimmed.slice(0, MAX_NAME_LENGTH) : trimmed;
}

export default function InversionStep2Risks() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const [decisionId, setDecisionId] = useState(location.state?.decisionId || null);
  const goal = location.state?.goal || '';
  const legacyPlan = location.state?.legacyPlan || '';

  const initialRisks = location.state?.risks?.length ? location.state.risks : ['', ''];
  const [risks, setRisks] = useState(initialRisks);
  const [currentTitle, setCurrentTitle] = useState(location.state?.problemTitle || '');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [discardOpen, setDiscardOpen] = useState(false);
  const [nameDialog, setNameDialog] = useState(null); // null | 'draft'
  const toast = useToast();

  const changeRisk = (index, value) => {
    setRisks((prev) => prev.map((r, i) => (i === index ? value : r)));
  };

  const addRisk = () => setRisks((prev) => [...prev, '']);

  const removeRisk = (index) => {
    if (risks.length <= 2) return;
    setRisks((prev) => prev.filter((_, i) => i !== index));
  };

  const filledCount = risks.filter((r) => r.trim()).length;
  const canContinue = filledCount >= 1;
  const suggestedName = currentTitle || suggestNameFrom(goal);

  const persistDraft = async (name) => {
    const payload = {
      form_data: { goal, risks },
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
      toast.show(`Draft saved as ${name}.`);
      navigate('/decision-history');
    } catch (error) {
      console.error('[InversionStep2Risks] draft save failed:', error);
      setNameDialog(null);
      setSaveError('Could not save. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleBack = () => {
    navigate('/inversion-step-1', { state: { decisionId, goal, risks, legacyPlan, problemTitle: currentTitle } });
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
        console.error('[InversionStep2Risks] draft delete on discard failed:', error);
      }
    }
    navigate('/decision-history', { state: { toast: 'Discarded.' } });
  };

  const goContinue = () => {
    const filled = risks.filter((r) => r.trim());
    navigate('/inversion-step-3', {
      state: { decisionId, goal, risks: filled, legacyPlan, problemTitle: currentTitle },
    });
  };

  const actionButtons = (
    <>
      <Button variant="primary" disabled={!canContinue || isSaving} onClick={goContinue}>
        Continue
      </Button>
      <Button variant="outline" disabled={isSaving} onClick={() => setNameDialog('draft')}>
        Save as draft
      </Button>
    </>
  );

  return (
    <div className="ui-root">
      <DesignHeader />

      <div className="plan-page plan-page--form">
        <div className="inv-stepper">
          <div className="inv-stepper-lines" aria-hidden="true">
            <i className="on" />
            <i className="on" />
            <i />
          </div>
          <span className="inv-stepper-label">Step 2 of 3</span>
        </div>

        <div className="plan-back-row">
          <BackLink onClick={handleBack} />
        </div>

        <div className="plan-header">
          <PageHeader title="Pre-mortem" info={pageText.inversionStep2Risks} />
          <h2 className="ds-question">List all the ways you could mess this up</h2>
        </div>

        {risks.map((risk, index) => (
          <div className="plan-obj-row" key={index}>
            <span className="plan-obj-num">{index + 1}.</span>
            <TextBox
              lines="one"
              placeholder="Type here"
              ariaLabel={`Risk ${index + 1}`}
              value={risk}
              onChange={(v) => changeRisk(index, v)}
            />
            <button
              type="button"
              className="plan-bin-btn"
              aria-label={`Remove risk ${index + 1}`}
              disabled={risks.length <= 2}
              onClick={() => removeRisk(index)}
            >
              <BinIcon />
            </button>
          </div>
        ))}
        <Button variant="outline" icon="plus" onClick={addRisk}>
          Add
        </Button>

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
    </div>
  );
}
