import { useState, useContext } from 'react';
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
import { PageHeader } from '../components/design';
import pageText from '../content/pageText';

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
  if (!trimmed) return 'New tough conversation';
  return trimmed.length > MAX_NAME_LENGTH ? trimmed.slice(0, MAX_NAME_LENGTH) : trimmed;
}

export default function ToughConversationStep1Feedback() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const [decisionId, setDecisionId] = useState(location.state?.decisionId || null);

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
  const { message, showToast } = useToast();

  const displayObservation = cleanPhrase(observation, ['i\'ve noticed', 'i noticed', 'observed']);
  const displayImpact = cleanPhrase(impact, ['the impact of that is', 'the impact is', 'impact:', 'impacts:'], true);
  const displayNeed = cleanPhrase(need, ['so, what i need from you is', 'what i need is', 'what i need', 'i need you'], true);

  const suggestedName = currentTitle || suggestNameFrom(observation);

  const persistDraft = async (name) => {
    const payload = {
      form_data: { observation, impact, need, selectedQuestions, customQuestion },
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
      showToast(`Draft saved as ${name}.`);
      navigate('/decision-history');
    } catch (error) {
      console.error('[ToughConversationStep1Feedback] draft save failed:', error);
      setNameDialog(null);
      setSaveError('Could not save. Please try again.');
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
    navigate('/decision-history', { state: { toast: 'Discarded.' } });
  };

  const goContinue = () => {
    navigate('/tough-conversation-step-2', {
      state: { decisionId, observation, impact, need, selectedQuestions, customQuestion, problemTitle: currentTitle },
    });
  };

  const actionButtons = (
    <>
      <button type="button" className="ui-btn-primary" disabled={isSaving} onClick={goContinue}>
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
        <div className="plan-header">
          <PageHeader title="Have a tough conversation" info={pageText.toughConversationStep1Feedback} />
        </div>

        <div className={`plan-dq${observation.trim() ? ' on' : ''}`}>
          <div className="plan-dq-num">
            01
            <svg className="plan-dq-check" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
          </div>
          <div>
            <label className="plan-dq-label" htmlFor="tc-observation">I've noticed...</label>
            <p className="plan-dq-help">Name the thing you've observed. This can either be one big thing, or a pattern of 3+ smaller things.</p>
            <AutoGrowTextarea id="tc-observation" className="plan-dq-textarea" placeholder="Type here" value={observation} onChange={setObservation} />
          </div>
        </div>

        <div className={`plan-dq${impact.trim() ? ' on' : ''}`}>
          <div className="plan-dq-num">
            02
            <svg className="plan-dq-check" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
          </div>
          <div>
            <label className="plan-dq-label" htmlFor="tc-impact">The impact of that is...</label>
            <p className="plan-dq-help">Describe in a non-emotional manner the tangible impact of their actions.</p>
            <AutoGrowTextarea id="tc-impact" className="plan-dq-textarea" placeholder="Type here" value={impact} onChange={setImpact} />
          </div>
        </div>

        <div className={`plan-dq${need.trim() ? ' on' : ''}`}>
          <div className="plan-dq-num">
            03
            <svg className="plan-dq-check" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
          </div>
          <div>
            <label className="plan-dq-label" htmlFor="tc-need">So, what I need from you is...</label>
            <p className="plan-dq-help">Name the change or outcome that is required.</p>
            <AutoGrowTextarea id="tc-need" className="plan-dq-textarea" placeholder="Type here" value={need} onChange={setNeed} />
          </div>
        </div>

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
