import { useMemo, useState, useContext } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { clearProgress } from '../lib/saveProgress';
import DesignHeader from '../components/DesignHeader';
import PhoneActionBar from '../components/ui/PhoneActionBar';
import AutoGrowTextarea from '../components/ui/AutoGrowTextarea';
import { DiscardLink, BackLink } from '../components/ui/DiscardLink';
import DiscardDialog from '../components/ui/DiscardDialog';
import NameDialog from '../components/ui/NameDialog';
import Toast from '../components/ui/Toast';
import useToast from '../hooks/useToast';

const MAX_NAME_LENGTH = 60;

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}

function suggestNameFrom(goal) {
  const trimmed = (goal || '').trim();
  if (!trimmed) return 'New inversion thinking';
  return trimmed.length > MAX_NAME_LENGTH ? trimmed.slice(0, MAX_NAME_LENGTH) : trimmed;
}

export default function InversionStep3Plan() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const [decisionId, setDecisionId] = useState(location.state?.decisionId || null);
  const goal = location.state?.goal || '';
  const risks = useMemo(() => (location.state?.risks || []).filter((r) => r.trim()), [location.state?.risks]);

  // riskAnswers carried forward only makes sense when it is already the
  // same length/order as risks (same session) - an old-shaped decision
  // with no riskAnswers (or a stale length after risks were edited in
  // step 2) starts every card blank rather than guessing a mapping.
  const incomingAnswers = location.state?.riskAnswers;
  const [riskAnswers, setRiskAnswers] = useState(
    incomingAnswers?.length === risks.length ? incomingAnswers : risks.map(() => '')
  );
  const [currentTitle, setCurrentTitle] = useState(location.state?.problemTitle || '');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [discardOpen, setDiscardOpen] = useState(false);
  const [nameDialog, setNameDialog] = useState(null); // null | 'finish' | 'draft'
  const { message, showToast } = useToast();

  const changeAnswer = (index, value) => {
    setRiskAnswers((prev) => prev.map((a, i) => (i === index ? value : a)));
  };

  const firstUnansweredIndex = riskAnswers.findIndex((a) => !a.trim());
  const allAnswered = firstUnansweredIndex === -1 && risks.length > 0;
  const suggestedName = currentTitle || suggestNameFrom(goal);

  const persist = async (draft, name) => {
    const payload = {
      form_data: { goal, fuckups: risks, riskAnswers },
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
      .insert({ user_id: user.id, tool_type: 'inversion', ...payload })
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
        navigate('/inversion-thinking-summary', { state: { decisionId: savedId, toast: `Saved as ${name}.` } });
      }
    } catch (error) {
      console.error('[InversionStep3Plan] save failed:', error);
      setNameDialog(null);
      setSaveError('Could not save - please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDiscard = () => {
    setDiscardOpen(false);
    navigate('/decision-history');
  };

  const goToStep = (path) => {
    navigate(path, { state: { decisionId, goal, risks, riskAnswers, problemTitle: currentTitle } });
  };

  const actionButtons = (
    <>
      <button type="button" className="ui-btn-primary" disabled={!allAnswered || isSaving} onClick={() => setNameDialog('finish')}>
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
        <div className="inv-stepper">
          <div className="inv-stepper-lines" aria-hidden="true">
            <i className="on" />
            <i className="on" />
            <i className="on" />
          </div>
          <span className="inv-stepper-label">Step 3 of 3</span>
        </div>

        <div className="plan-back-row">
          <BackLink onClick={() => goToStep('/inversion-step-2')} />
        </div>

        <div className="plan-header">
          <div className="ui-title">So what will you do?</div>
          <p className="ui-subtitle">For each risk, write what you will do to stop it happening.</p>
        </div>

        <div className="inv-recap">
          <p>{goal}</p>
          <button type="button" className="plan-link-btn" onClick={() => goToStep('/inversion-step-1')}>
            Change
          </button>
        </div>

        <div className="plan-section-top" style={{ marginBottom: 'var(--space-2)' }}>
          <span className="ui-section-heading">Risks</span>
          <button type="button" className="plan-link-btn" onClick={() => goToStep('/inversion-step-2')}>
            Change risks
          </button>
        </div>

        <div className="inv-cards">
          {risks.map((risk, index) => {
            const answer = riskAnswers[index] || '';
            const isAnswered = answer.trim().length > 0;
            const isNow = index === firstUnansweredIndex;
            return (
              <div className={`inv-card${isNow ? ' now' : ''}${isAnswered ? ' ok' : ''}`} key={index}>
                <div className="inv-card-row">
                  <span className="inv-card-num">{String(index + 1).padStart(2, '0')}</span>
                  <p>{risk}</p>
                  <span className="inv-card-check" aria-hidden="true"><CheckIcon /></span>
                </div>
                <AutoGrowTextarea
                  className="inv-card-textarea"
                  placeholder="Type here"
                  aria-label={`What will you do about risk ${index + 1}?`}
                  value={answer}
                  onChange={(v) => changeAnswer(index, v)}
                />
              </div>
            );
          })}
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
