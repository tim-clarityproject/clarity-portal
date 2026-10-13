import { useState, useContext } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { clearProgress } from '../lib/saveProgress';
import { COACHING_QUESTIONS } from '../content/coachingQuestions';
import DesignHeader from '../components/DesignHeader';
import PhoneActionBar from '../components/ui/PhoneActionBar';
import AutoGrowTextarea from '../components/ui/AutoGrowTextarea';
import { DiscardLink, BackLink } from '../components/ui/DiscardLink';
import DiscardDialog from '../components/ui/DiscardDialog';
import NameDialog from '../components/ui/NameDialog';
import Toast from '../components/ui/Toast';
import useToast from '../hooks/useToast';

const MAX_NAME_LENGTH = 60;

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
    </svg>
  );
}

function CheckGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}

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

export default function ToughConversationStep2Coaching() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const [decisionId, setDecisionId] = useState(location.state?.decisionId || null);

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
  const { message, showToast } = useToast();

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
      form_data: { observation, impact, need, selectedQuestions, customQuestion },
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
        showToast(`Draft saved as ${name}.`);
        navigate('/decision-history');
      } else {
        clearProgress();
        navigate('/tough-conversation-summary', { state: { decisionId: savedId, toast: `Saved as ${name}.` } });
      }
    } catch (error) {
      console.error('[ToughConversationStep2Coaching] save failed:', error);
      setNameDialog(null);
      setSaveError('Could not save - please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleBack = () => {
    navigate('/tough-conversation-step-1', {
      state: { decisionId, observation, impact, need, selectedQuestions, customQuestion, problemTitle: currentTitle },
    });
  };

  const handleDiscard = () => {
    setDiscardOpen(false);
    navigate('/decision-history', { state: { toast: 'Discarded.' } });
  };

  const actionButtons = (
    <>
      <button type="button" className="ui-btn-primary" disabled={isSaving} onClick={() => setNameDialog('finish')}>
        Finish
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
        <div className="plan-back-row">
          <BackLink onClick={handleBack} />
        </div>

        <div className="plan-header">
          <div className="ui-title">Have a tough conversation</div>
          <p className="ui-subtitle">Plan your coaching and follow-up questions.</p>
        </div>

        <div className="tc-script">
          <div className="tc-script-head">
            <span className="plan-overline" style={{ marginBottom: 0 }}>Your conversation script</span>
            <button type="button" className="tc-copy-btn" onClick={copyScriptToClipboard}>
              <CopyIcon />
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>

          {editingField && (
            <div className="tc-edit-row">
              <AutoGrowTextarea
                className="plan-dq-textarea"
                autoFocus
                placeholder="Type here"
                value={editValue}
                onChange={setEditValue}
              />
              <div className="tc-edit-actions">
                <button type="button" className="tc-edit-save" onClick={saveEdit}>Save</button>
                <button type="button" className="tc-edit-cancel" onClick={() => setEditingField(null)}>Cancel</button>
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

        <p className="ui-subtitle">
          Now you have delivered your feedback, it's time to coach your staff member to find their own solutions. Choose the coaching questions that are most relevant to this conversation.
        </p>

        <div className="tc-ck-head">
          <span className="ui-section-heading">Coaching questions</span>
          <span className="tc-ck-count">{selectedQuestions.length} chosen</span>
        </div>
        <p className="tc-ck-help">Asking questions is an art. Select a few from below that might work for you, or type your own below.</p>

        <div className="tc-ck-list" role="group" aria-label="Coaching questions">
          {COACHING_QUESTIONS.map((question, index) => {
            const checked = selectedQuestions.includes(index);
            return (
              <button
                key={index}
                type="button"
                className="tc-ck"
                role="checkbox"
                aria-checked={checked}
                onClick={() => toggleQuestion(index)}
              >
                <span className="tc-ck-box" aria-hidden="true"><CheckGlyph /></span>
                <span className="tc-ck-text">{question}</span>
              </button>
            );
          })}
        </div>

        <div className="plan-field">
          <label htmlFor="tc-custom-question">Add your own question</label>
          <AutoGrowTextarea
            id="tc-custom-question"
            className="plan-dq-textarea"
            placeholder="Type here"
            value={customQuestion}
            onChange={setCustomQuestion}
          />
        </div>

        {saveError && <p className="plan-save-error" role="alert">{saveError}</p>}

        <div className="plan-actions plan-actions--desktop">{actionButtons}</div>

        <div className="plan-discard-row">
          <DiscardLink onClick={() => setDiscardOpen(true)} />
        </div>
      </div>

      <PhoneActionBar>{actionButtons}</PhoneActionBar>

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
      <Toast message={message} />
    </div>
  );
}
