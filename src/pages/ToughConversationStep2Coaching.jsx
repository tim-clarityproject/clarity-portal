import { useState, useContext } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { discardDecisionDraft } from '../lib/discardDraft';
import { clearProgress } from '../lib/saveProgress';
import { useDraft } from '../lib/drafts';
import { COACHING_QUESTIONS } from '../content/coachingQuestions';
import FormTool from './toolFocus/FormTool';
import DiscardDialog from '../components/ui/DiscardDialog';
import NameDialog from '../components/ui/NameDialog';
import { TextBox, Button, useToast, Checkbox } from '../components/design';

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

export default function ToughConversationStep2Coaching() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const [decisionId, setDecisionId] = useState(location.state?.decisionId || null);

  // Stage D, Draft 11: the questions (3 of 4), then "When and where will you
  // have the conversation?" (4 of 4), the commit question: it can't be skipped.
  const [screen, setScreen] = useState('questions');
  const [whenWhere, setWhenWhere] = useState(location.state?.whenWhere || '');
  const [askedWhen, setAskedWhen] = useState(false);
  const success = location.state?.success || '';
  const [observation, setObservation] = useState(location.state?.observation || '');
  const [impact, setImpact] = useState(location.state?.impact || '');
  const [need, setNeed] = useState(location.state?.need || '');
  const [selectedQuestions, setSelectedQuestions] = useState(location.state?.selectedQuestions || []);
  const [customQuestion, setCustomQuestion] = useState(location.state?.customQuestion || '');
  const [currentTitle, setCurrentTitle] = useState(location.state?.problemTitle || '');
  const [editingField, setEditingField] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [copied, setCopied] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [discardOpen, setDiscardOpen] = useState(false);
  const [nameDialog, setNameDialog] = useState(null); // null | 'finish' | 'draft'
  const toast = useToast();

  // Typing survives a refresh or a closed tab (Tim, 26 Oct). Nothing is
  // loaded from the server here (the words arrive from step 1), so the
  // draft is ready at once. Back hands the words to step 1 and clears
  // this draft, so returning never brings older words over newer ones.
  const { clear: clearDraft } = useDraft({
    userId: user?.id,
    name: `tough-conversation-2:${location.state?.decisionId || 'new'}`,
    value: { observation, impact, need, selectedQuestions, customQuestion, whenWhere, editingField, editValue },
    ready: true,
    onRestore: (v) => {
      setWhenWhere(v.whenWhere || '');
      setObservation(v.observation || '');
      setImpact(v.impact || '');
      setNeed(v.need || '');
      setSelectedQuestions(Array.isArray(v.selectedQuestions) ? v.selectedQuestions : []);
      setCustomQuestion(v.customQuestion || '');
      setEditingField(v.editingField || null);
      setEditValue(v.editValue || '');
    },
  });

  const displayObservation = cleanPhrase(observation, ['i\'ve noticed', 'i noticed', 'observed']);
  const displayImpact = cleanPhrase(impact, ['the impact of that is', 'the impact is', 'impact:', 'impacts:'], true);
  const displayNeed = cleanPhrase(need, ['so, what i need from you is', 'what i need is', 'what i need', 'i need you'], true);

  const startEdit = (field) => {
    setEditingField(field);
    if (field === 'observation') setEditValue(observation);
    if (field === 'impact') setEditValue(impact);
    if (field === 'need') setEditValue(need);
  };

  const saveEdit = () => {
    if (editingField === 'observation') setObservation(editValue);
    if (editingField === 'impact') setImpact(editValue);
    if (editingField === 'need') setNeed(editValue);
    setEditingField(null);
    setEditValue('');
  };

  const copyScriptToClipboard = () => {
    const scriptText = `I've noticed ${displayObservation}. The impact of that is ${displayImpact}. So, what I need from you is ${displayNeed}.`;
    navigator.clipboard?.writeText(scriptText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleQuestion = (index) => {
    setSelectedQuestions((prev) => (
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]
    ));
  };

  const suggestedName = currentTitle || suggestNameFrom(observation);

  const persist = async (draft, name) => {
    const payload = {
      form_data: { success, observation, impact, need, selectedQuestions, customQuestion, whenWhere },
      title: name,
      draft,
      status: draft ? 'draft' : 'completed',
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

  const handleNameConfirm = async (name) => {
    if (!user || isSaving) return;
    const mode = nameDialog;
    setSaveError('');
    setIsSaving(true);
    try {
      const savedId = await persist(mode === 'draft', name);
      setCurrentTitle(name);
      setNameDialog(null);
      if (mode === 'draft') {
        setDecisionId(savedId);
        clearProgress();
        clearDraft();
        toast.show(`Draft saved as ${name}.`);
        navigate('/my-plans');
      } else {
        clearProgress();
        clearDraft();
        navigate('/give-difficult-feedback/summary', { state: { decisionId: savedId, toast: `Saved as ${name}.` } });
      }
    } catch (error) {
      console.error('[ToughConversationStep2Coaching] save failed:', error);
      setNameDialog(null);
      setSaveError('That didn’t save. Check your connection and try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleBack = () => {
    clearDraft();
    navigate('/give-difficult-feedback', {
      state: { decisionId, success, observation, impact, need, selectedQuestions, customQuestion, whenWhere, problemTitle: currentTitle, screen: 'script' },
    });
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
        console.error('[ToughConversationStep2Coaching] draft delete on discard failed:', error);
      }
    }
    clearDraft();
    navigate('/my-plans', { state: { toast: 'Discarded.' } });
  };

  const whenMissing = !whenWhere.trim();
  const dialogs = (
    <>
      <NameDialog
        open={nameDialog !== null}
        title={nameDialog === 'draft' ? 'Name this draft' : 'Name this decision'}
        message="Give it a name so you can find it in My decisions."
        suggestedName={suggestedName}
        onConfirm={handleNameConfirm}
        onCancel={() => setNameDialog(null)}
      />
      <DiscardDialog
        isOpen={discardOpen}
        title="Discard this entry?"
        message="Anything you have not saved will be lost."
        onKeep={() => setDiscardOpen(false)}
        onDiscard={handleDiscard}
      />
    </>
  );

  if (screen === 'when') {
    return (
      <div className="ui-root">
        <FormTool
          name="Give difficult feedback"
          step={4}
          steps={4}
          question="When and where will you have the conversation?"
          onNext={() => {
            if (whenMissing) { setAskedWhen(true); return; }
            if (!isSaving) setNameDialog('finish');
          }}
          nextLabel="Finish"
          need={askedWhen && whenMissing ? 'Type when and where to carry on.' : null}
          onBack={() => setScreen('questions')}
          saveError={saveError}
          onSaveDraft={() => { if (!isSaving) setNameDialog('draft'); }}
          onDiscard={() => setDiscardOpen(true)}
          closeTo="/interpersonal"
        >
          <TextBox id="tc-when" lines="many" focusMode ariaLabel="When and where will you have the conversation?" value={whenWhere} onChange={setWhenWhere} />
        </FormTool>
        {dialogs}
      </div>
    );
  }

  return (
    <div className="ui-root">
      <FormTool
        name="Give difficult feedback"
        step={3}
        steps={4}
        question="Which questions will you ask?"
        onNext={() => setScreen('when')}
        onBack={handleBack}
        saveError={saveError}
        onSaveDraft={() => { if (!isSaving) setNameDialog('draft'); }}
        onDiscard={() => setDiscardOpen(true)}
        closeTo="/interpersonal"
      >
        <div className="tc-script">
          <div className="tc-script-head">
            <span className="ds-label">Your conversation script</span>
            <Button variant="outline" onClick={copyScriptToClipboard}>
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>

          {editingField && (
            <div className="tc-edit-row">
              <TextBox
                lines="many"
                autoFocus
                ariaLabel="Edit your script"
                placeholder="Type here"
                value={editValue}
                onChange={setEditValue}
              />
              <div className="tc-edit-actions">
                <Button variant="outline" onClick={saveEdit}>Save</Button>
                <Button variant="text" onClick={() => setEditingField(null)}>Cancel</Button>
              </div>
            </div>
          )}

          <p className="tc-script-sent">
            I've noticed{' '}
            <span
              className={`tc-editable${displayObservation ? '' : ' tc-blank'}`}
              role="button"
              tabIndex={0}
              onClick={() => startEdit('observation')}
              onKeyDown={(e) => { if (e.key === 'Enter') startEdit('observation'); }}
            >
              {displayObservation || '_______________'}
            </span>
            . The impact of that is{' '}
            <span
              className={`tc-editable${displayImpact ? '' : ' tc-blank'}`}
              role="button"
              tabIndex={0}
              onClick={() => startEdit('impact')}
              onKeyDown={(e) => { if (e.key === 'Enter') startEdit('impact'); }}
            >
              {displayImpact || '_______________'}
            </span>
            . So, what I need from you is{' '}
            <span
              className={`tc-editable${displayNeed ? '' : ' tc-blank'}`}
              role="button"
              tabIndex={0}
              onClick={() => startEdit('need')}
              onKeyDown={(e) => { if (e.key === 'Enter') startEdit('need'); }}
            >
              {displayNeed || '_______________'}
            </span>
            .
          </p>
        </div>


        <div className="tc-ck-head">
          <span className="ds-label">Coaching questions</span>
          <span className="tc-ck-count">{selectedQuestions.length} chosen</span>
        </div>

        <div className="tc-ck-list" role="group" aria-label="Coaching questions">
          {COACHING_QUESTIONS.map((question, index) => {
            const checked = selectedQuestions.includes(index);
            return (
              <Checkbox key={index} checked={checked} onChange={() => toggleQuestion(index)}>
                {question}
              </Checkbox>
            );
          })}
        </div>

        <div className="plan-field">
          <TextBox
            id="tc-custom-question"
            label="Add your own question"
            lines="many"
            placeholder="Type here"
            value={customQuestion}
            onChange={setCustomQuestion}
          />
        </div>
      </FormTool>
      {dialogs}
    </div>
  );
}
