import { useState, useContext } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { discardDecisionDraft } from '../lib/discardDraft';
import { clearProgress } from '../lib/saveProgress';
import { useDraft } from '../lib/drafts';
import FormTool, { FormField } from './toolFocus/FormTool';
import DiscardDialog from '../components/ui/DiscardDialog';
import NameDialog from '../components/ui/NameDialog';
import { TextBox, useToast } from '../components/design';

const MAX_NAME_LENGTH = 60;

function cleanPhrase(text, phrasesToRemove, lowercaseFirst = false) {
  let cleaned = (text || '').trim();
  for (const phrase of phrasesToRemove) {
    const regex = new RegExp(`^${phrase}\\s*`, 'i');
    cleaned = cleaned.replace(regex, '');
  }
  cleaned = cleaned.trim();
  if (lowercaseFirst && cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toLowerCase() + cleaned.slice(1);
  }
  return cleaned;
}

function suggestNameFrom(observation) {
  const trimmed = (observation || '').trim();
  if (!trimmed) return 'New difficult feedback';
  return trimmed.length > MAX_NAME_LENGTH ? trimmed.slice(0, MAX_NAME_LENGTH) : trimmed;
}

export default function ToughConversationStep1Feedback() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const [decisionId, setDecisionId] = useState(location.state?.decisionId || null);

  // Stage D, Draft 11: "What would success look like for you?" comes first,
  // on its own screen (1 of 4), then the script (2 of 4); "When and where
  // will you have the conversation?" ends the tool on step 2's page.
  const [screen, setScreen] = useState(location.state?.screen === 'script' ? 'script' : 'success');
  const [success, setSuccess] = useState(location.state?.success || '');
  const whenWhere = location.state?.whenWhere || '';
  const [observation, setObservation] = useState(location.state?.observation || '');
  const [impact, setImpact] = useState(location.state?.impact || '');
  const [need, setNeed] = useState(location.state?.need || '');
  // Passed straight through to step 2 unchanged - step 1 has no UI for
  // these, so they are plain values here, not state.
  const selectedQuestions = location.state?.selectedQuestions || [];
  const customQuestion = location.state?.customQuestion || '';
  const [currentTitle, setCurrentTitle] = useState(location.state?.problemTitle || '');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [discardOpen, setDiscardOpen] = useState(false);
  const [nameDialog, setNameDialog] = useState(null); // null | 'draft'
  const toast = useToast();

  // Typing survives a refresh or a closed tab (Tim, 26 Oct). Nothing is
  // loaded from the server here (the words arrive with the page), so the
  // draft is ready at once. Continue hands the words to step 2 and clears
  // this draft, so going Back never brings older words over newer ones.
  const { clear: clearDraft } = useDraft({
    userId: user?.id,
    name: `tough-conversation-1:${location.state?.decisionId || 'new'}`,
    value: { success, observation, impact, need },
    ready: true,
    onRestore: (v) => {
      setSuccess(v.success || '');
      setObservation(v.observation || '');
      setImpact(v.impact || '');
      setNeed(v.need || '');
    },
  });

  const displayObservation = cleanPhrase(observation, ['i\'ve noticed', 'i noticed', 'observed']);
  const displayImpact = cleanPhrase(impact, ['the impact of that is', 'the impact is', 'impact:', 'impacts:'], true);
  const displayNeed = cleanPhrase(need, ['so, what i need from you is', 'what i need is', 'what i need', 'i need you'], true);

  const suggestedName = currentTitle || suggestNameFrom(observation);

  const persistDraft = async (name) => {
    const payload = {
      form_data: { success, observation, impact, need, selectedQuestions, customQuestion, whenWhere },
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
      .insert({ user_id: user.id, tool_type: 'tough-conversation', ...payload })
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
      clearDraft();
      toast.show(`Draft saved as ${name}.`);
      navigate('/my-plans');
    } catch (error) {
      console.error('[ToughConversationStep1Feedback] draft save failed:', error);
      setNameDialog(null);
      setSaveError('That didn’t save. Check your connection and try again.');
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
        console.error('[ToughConversationStep1Feedback] draft delete on discard failed:', error);
      }
    }
    clearDraft();
    navigate('/my-plans', { state: { toast: 'Discarded.' } });
  };

  const goContinue = () => {
    clearDraft();
    navigate('/give-difficult-feedback/questions', {
      state: { decisionId, success, observation, impact, need, selectedQuestions, customQuestion, whenWhere, problemTitle: currentTitle },
    });
  };

  if (screen === 'success') {
    return (
      <div className="ui-root">
        <FormTool
          name="Give difficult feedback"
          step={1}
          steps={4}
          question="What would success look like for you?"
          onNext={() => setScreen('script')}
          saveError={saveError}
          onSaveDraft={() => { if (!isSaving) setNameDialog('draft'); }}
          onDiscard={() => setDiscardOpen(true)}
          closeTo="/interpersonal"
        >
          <TextBox id="tc-success" lines="many" focusMode ariaLabel="What would success look like for you?" value={success} onChange={setSuccess} />
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

  return (
    <div className="ui-root">
      <FormTool
        name="Give difficult feedback"
        step={2}
        steps={4}
        question="What do you need to say?"
        onNext={() => { if (!isSaving) goContinue(); }}
        onBack={() => setScreen('success')}
        saveError={saveError}
        onSaveDraft={() => { if (!isSaving) setNameDialog('draft'); }}
        onDiscard={() => setDiscardOpen(true)}
        closeTo="/interpersonal"
      >
        <FormField label="What have you noticed?" htmlFor="tc-observation">
          <TextBox id="tc-observation" lines="many" focusMode ariaLabel="What have you noticed?" placeholder="I’ve noticed…" value={observation} onChange={setObservation} />
        </FormField>
        <FormField label="What’s the impact of that?" htmlFor="tc-impact">
          <TextBox id="tc-impact" lines="many" focusMode ariaLabel="What’s the impact of that?" placeholder="The impact of that is…" value={impact} onChange={setImpact} />
        </FormField>
        <FormField label="What do you need from them?" htmlFor="tc-need">
          <TextBox id="tc-need" lines="many" focusMode ariaLabel="What do you need from them?" placeholder="So, what I need from you is…" value={need} onChange={setNeed} />
        </FormField>
        <div className="tc-script">
          <p className="tc-script-sent">
            I've noticed{' '}
            <span className={displayObservation ? 'tc-filled' : 'tc-blank'}>{displayObservation || '_______________'}</span>
            . The impact of that is{' '}
            <span className={displayImpact ? 'tc-filled' : 'tc-blank'}>{displayImpact || '_______________'}</span>
            . So, what I need from you is{' '}
            <span className={displayNeed ? 'tc-filled' : 'tc-blank'}>{displayNeed || '_______________'}</span>
            .
          </p>
        </div>
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
