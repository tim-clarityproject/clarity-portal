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
import Toast from '../components/ui/Toast';
import useToast from '../hooks/useToast';
import pageText from '../content/pageText';

// Worded exactly per the approved mock-up - topPriority/showUp/notDo are
// the real Supabase field names (unchanged); only the on-screen wording
// changed, including the two that were previously shortened on the
// summary (see DailyPlanSummary.jsx).
const QUESTIONS = [
  { key: 'gratitude', label: 'What are you grateful for today?' },
  { key: 'topPriority', label: 'What are your top priorities today?' },
  { key: 'showUp', label: "What's within your control today?" },
  { key: 'notDo', label: 'What do you not want to do today?' },
];

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// "Friday 2nd October" - today's device-local date, no year (per mock).
function formatTodayHeader(date) {
  const weekday = date.toLocaleDateString('en-GB', { weekday: 'long' });
  const month = date.toLocaleDateString('en-GB', { month: 'long' });
  return `${weekday} ${ordinal(date.getDate())} ${month}`;
}

function CheckIcon() {
  return (
    <svg className="plan-dq-check" viewBox="0 0 24 24" aria-hidden="true">
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}

export default function PlanMyDayStep1() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const [decisionId, setDecisionId] = useState(location.state?.decisionId || null);
  const [gratitude, setGratitude] = useState('');
  const [topPriority, setTopPriority] = useState('');
  const [showUp, setShowUp] = useState('');
  const [notDo, setNotDo] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [discardOpen, setDiscardOpen] = useState(false);
  const { message, showToast } = useToast();

  const values = { gratitude, topPriority, showUp, notDo };
  const setters = {
    gratitude: setGratitude,
    topPriority: setTopPriority,
    showUp: setShowUp,
    notDo: setNotDo,
  };

  // Loads an existing plan (edit, or resuming a draft) by id - the real
  // data source for Edit, replacing the old pattern of reading answers
  // straight off location.state (never actually wired to a real Edit
  // button before this task).
  useEffect(() => {
    if (!decisionId || !user) return;
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
        console.error('[PlanMyDayStep1] load failed:', error);
        return;
      }
      const formData = data?.form_data || {};
      setGratitude(formData.gratitude || '');
      setTopPriority(formData.topPriority || '');
      setShowUp(formData.showUp || '');
      setNotDo(formData.notDo || '');
    })();
    return () => { cancelled = true; };
  }, [decisionId, user?.id]);

  const buildTitle = () =>
    `Daily Plan - ${new Date().toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}`;

  const persist = async (draft) => {
    const payload = {
      form_data: { gratitude, topPriority, showUp, notDo },
      title: buildTitle(),
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
      if (!data || data.length === 0) throw new Error('Could not find this plan to update.');
      return decisionId;
    }

    const { data, error } = await supabase
      .from('decisions')
      .insert([{ user_id: user.id, tool_type: 'daily_plan', ...payload }])
      .select();
    if (error) throw error;
    if (!data || data.length === 0) throw new Error('Save did not return a plan.');
    return data[0].id;
  };

  const handleFinish = async () => {
    if (!user || isSaving) return;
    setSaveError('');
    setIsSaving(true);
    try {
      const savedId = await persist(false);
      clearProgress();
      navigate('/daily-plan-summary', { state: { decisionId: savedId, toast: 'Saved.' } });
    } catch (error) {
      console.error('[PlanMyDayStep1] Finish failed:', error);
      setSaveError('Could not save - please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!user || isSaving) return;
    setSaveError('');
    setIsSaving(true);
    try {
      const savedId = await persist(true);
      setDecisionId(savedId);
      showToast('Draft saved.');
      navigate('/my-plans');
    } catch (error) {
      console.error('[PlanMyDayStep1] Save as draft failed:', error);
      setSaveError('Could not save - please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  // Deletes the saved row only if it is still a draft - a completed
  // plan is never deleted by walking away from it. The condition lives
  // in the query (see discardDraft.js), so a completed row matches
  // nothing even though this page does not track its status (patch D1).
  const handleDiscard = async () => {
    setDiscardOpen(false);
    if (decisionId) {
      try {
        await discardDecisionDraft(user.id, decisionId);
      } catch (error) {
        console.error('[PlanMyDayStep1] draft delete on discard failed:', error);
      }
    }
    navigate('/my-plans');
  };

  const page = pageText.planMyDayStep1;
  const todayLabel = formatTodayHeader(new Date());

  const actionButtons = (
    <>
      <button type="button" className="ui-btn-primary" disabled={isSaving} onClick={handleFinish}>
        Finish
      </button>
      <button type="button" className="ui-btn-ghost" disabled={isSaving} onClick={handleSaveDraft}>
        Save as draft
      </button>
    </>
  );

  return (
    <div className="ui-root">
      <DesignHeader />

      <div className="plan-page plan-page--form">
        <div className="plan-header">
          <span className="plan-overline">{todayLabel}</span>
          <div className="ui-title">Daily intentions</div>
          <p className="ui-subtitle">{page.subtitle}</p>
        </div>

        {QUESTIONS.map((q, index) => {
          const answered = values[q.key].trim().length > 0;
          return (
            <div className={`plan-dq${answered ? ' on' : ''}`} key={q.key}>
              <div className="plan-dq-num">
                <span>{String(index + 1).padStart(2, '0')}</span>
                <CheckIcon />
              </div>
              <div>
                <label className="plan-dq-label" htmlFor={`dq-${q.key}`}>{q.label}</label>
                <AutoGrowTextarea
                  id={`dq-${q.key}`}
                  className="plan-dq-textarea"
                  value={values[q.key]}
                  placeholder="Type here"
                  onChange={(v) => setters[q.key](v)}
                />
              </div>
            </div>
          );
        })}

        {saveError && <p className="plan-save-error" role="alert">{saveError}</p>}

        <div className="plan-actions plan-actions--desktop">{actionButtons}</div>

        <div className="plan-discard-row">
          <DiscardLink onClick={() => setDiscardOpen(true)} />
        </div>
      </div>

      <PhoneActionBar>{actionButtons}</PhoneActionBar>

      <DiscardDialog
        isOpen={discardOpen}
        title="Discard this plan?"
        message="Anything you have not saved will be lost."
        onKeep={() => setDiscardOpen(false)}
        onDiscard={handleDiscard}
      />
      <Toast message={message} />
    </div>
  );
}
