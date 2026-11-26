import { useState, useContext } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { discardDecisionDraft } from '../lib/discardDraft';
import { clearProgress } from '../lib/saveProgress';
import { clearDraft as forgetDraft, useDraft } from '../lib/drafts';
import FormTool from './toolFocus/FormTool';
import DiscardDialog from '../components/ui/DiscardDialog';
import NameDialog from '../components/ui/NameDialog';
import { TextBox, AddButton, IconButton, useToast } from '../components/design';

const MAX_NAME_LENGTH = 60;

// Saved or discarded: no step of this pre-mortem keeps a draft on the
// device. Each step keeps its own (inversion-1, -2 and -3), named after
// the saved decision, or "new" for one not saved yet.
function forgetInversionDrafts(userId, recordKey) {
  [1, 2, 3].forEach((step) => forgetDraft(userId, `inversion-${step}:${recordKey}`));
}

function suggestNameFrom(goal) {
  const trimmed = (goal || '').trim();
  if (!trimmed) return 'New pre-mortem';
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

  // Typing survives a refresh or a closed tab (Tim, 26 Oct).
  const recordKey = location.state?.decisionId || 'new';
  const { clear: clearDraft } = useDraft({
    userId: user?.id,
    name: `inversion-2:${recordKey}`,
    value: { risks },
    ready: true,
    onRestore: (draft) => {
      if (Array.isArray(draft?.risks) && draft.risks.length) setRisks(draft.risks);
    },
  });
  const forgetDrafts = () => {
    clearDraft();
    forgetInversionDrafts(user?.id, recordKey);
  };

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
      forgetDrafts();
      toast.show(`Draft saved as ${name}.`);
      navigate('/my-plans');
    } catch (error) {
      console.error('[InversionStep2Risks] draft save failed:', error);
      setNameDialog(null);
      setSaveError('That didn’t save. Check your connection and try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleBack = () => {
    navigate('/pre-mortem', { state: { decisionId, goal, risks, legacyPlan, problemTitle: currentTitle } });
  };

  // Deletes the saved row only if it is still a draft - a completed
  // decision is never deleted by walking away from it. The condition
  // lives in the query (see discardDraft.js), which is what makes this
  // safe on the steps that never fetch the row and so cannot tell a
  // draft from a completed one in page code (patch D1).
  const handleDiscard = async () => {
    setDiscardOpen(false);
    forgetDrafts();
    if (decisionId) {
      try {
        await discardDecisionDraft(user.id, decisionId);
      } catch (error) {
        console.error('[InversionStep2Risks] draft delete on discard failed:', error);
      }
    }
    navigate('/my-plans', { state: { toast: 'Discarded.' } });
  };

  const goContinue = () => {
    const filled = risks.filter((r) => r.trim());
    navigate('/pre-mortem/plan', {
      state: { decisionId, goal, risks: filled, legacyPlan, problemTitle: currentTitle },
    });
  };

  const [asked, setAsked] = useState(false);

  return (
    <div className="ui-root">
      <FormTool
        name="Pre-mortem"
        step={2}
        steps={3}
        question="How could this go wrong?"
        hint="List all the ways you could mess this up."
        onNext={() => { if (!canContinue) { setAsked(true); return; } if (!isSaving) goContinue(); }}
        need={asked && !canContinue ? 'Type at least one risk to carry on.' : ''}
        onBack={handleBack}
        saveError={saveError}
        onSaveDraft={() => { if (!isSaving) setNameDialog('draft'); }}
        onDiscard={() => setDiscardOpen(true)}
        closeTo="/personal/plan"
      >
        {risks.map((risk, index) => (
          // The rows have no ids of their own; their order is their identity.
          // eslint-disable-next-line react/no-array-index-key
          <div className="ft-row" key={index}>
            <TextBox
              lines="one"
              placeholder="Type here"
              ariaLabel={`Risk ${index + 1}`}
              value={risk}
              onChange={(v) => changeRisk(index, v)}
            />
            {risks.length > 2 && <IconButton label={`Remove risk ${index + 1}`} onClick={() => removeRisk(index)} />}
          </div>
        ))}
        <AddButton onClick={addRisk}>
          Add risk
        </AddButton>
      </FormTool>

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
