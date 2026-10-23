import { useContext, useMemo, useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { parseDbTimestamp, getLocalDateKey, formatReviewDayLabel } from '../lib/dateFormatter';
import { loadPlanReviews, findPlanReview, savePlanReview, isPlanReviewDraft } from '../lib/planReview';
import { discardPlanReviewDraft } from '../lib/discardDraft';
import DesignHeader from '../components/DesignHeader';
import PhoneActionBar from '../components/ui/PhoneActionBar';
import AutoGrowTextarea from '../components/ui/AutoGrowTextarea';
import { DiscardLink } from '../components/ui/DiscardLink';
import DiscardDialog from '../components/ui/DiscardDialog';
import Toast from '../components/ui/Toast';
import useToast from '../hooks/useToast';
import pageText from '../content/pageText';
import { DisclosureArrow, Loading, PageHeader } from '../components/design';

const RQ = [
  { key: 'a', label: 'What went well?' },
  { key: 'b', label: 'What would you do differently next time?' },
];

const TY = {
  daily_plan: { h: 'Review my day', sub: 'Reflect on what worked today.', panel: 'Your intentions for the day', summaryRoute: '/daily-plan-summary' },
  plan_meeting: { h: 'Review this meeting', sub: 'Reflect on what worked in this meeting.', panel: 'Your meeting plan', summaryRoute: '/meeting-summary' },
  if_then_planning: { h: 'Review this plan', sub: 'Reflect on what worked and what to change.', panel: 'Your plan', summaryRoute: '/if-then-planning-summary' },
  inversion: { h: 'Review this plan', sub: 'Reflect on what worked and what to change.', panel: 'Your plan', summaryRoute: '/inversion-thinking-summary' },
  'tough-conversation': { h: 'Review this plan', sub: 'Reflect on what worked and what to change.', panel: 'Your plan', summaryRoute: '/tough-conversation-summary' },
};

const DAILY_QUESTIONS = [
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

function formatLongDate(date) {
  const weekday = date.toLocaleDateString('en-GB', { weekday: 'long' });
  const month = date.toLocaleDateString('en-US', { month: 'short' });
  return `${weekday} ${ordinal(date.getDate())} ${month}, ${date.getFullYear()}`;
}

function PanelBody({ planKind, plan }) {
  const formData = plan?.form_data || {};
  if (planKind === 'plan_meeting') {
    const objectives = (formData.objectives || []).filter((o) => o.text?.trim());
    const agenda = (formData.flowItems || []).filter((r) => r.item?.trim());
    return (
      <div className="rp-panel-body">
        <div>
          <small>Objectives</small>
          {objectives.map((o, i) => <p key={o.id || i}>{i + 1}. {o.text}</p>)}
        </div>
        <div>
          <small>Agenda</small>
          {agenda.map((r, i) => <p key={r.id || i}>{r.item} · {r.length || 0} min</p>)}
        </div>
      </div>
    );
  }
  if (planKind === 'if_then_planning') {
    const items = (formData.items || []).filter((i) => i.ifCondition?.trim());
    return (
      <div className="rp-panel-body">
        <div>
          <small>Which situation are you concerned about?</small>
          <p>{formData.situation}</p>
        </div>
        <div>
          <small>Scenarios</small>
          {items.map((it, i) => <p key={i}>{it.ifCondition} → {it.thenAction}</p>)}
        </div>
      </div>
    );
  }
  if (planKind === 'inversion') {
    const risks = formData.risks || [];
    const answers = formData.riskAnswers || [];
    return (
      <div className="rp-panel-body">
        <div>
          <small>Goal</small>
          <p>{formData.goal}</p>
        </div>
        <div>
          <small>Risks</small>
          {risks.length > 0
            ? risks.map((r, i) => <p key={i}>{r}{answers[i] ? ` → ${answers[i]}` : ''}</p>)
            : <p>No risks recorded.</p>}
        </div>
      </div>
    );
  }
  if (planKind === 'tough-conversation') {
    return (
      <div className="rp-panel-body">
        <div>
          <small>Your script</small>
          <p>I've noticed {formData.observation}. The impact of that is {formData.impact}. So, what I need from you is {formData.need}.</p>
        </div>
        <div>
          <small>Coaching questions chosen</small>
          <p>{(formData.selectedQuestions || []).length} chosen{formData.customQuestion ? ' + your own question' : ''}</p>
        </div>
      </div>
    );
  }
  // daily_plan
  return (
    <div className="rp-panel-body">
      {DAILY_QUESTIONS.map((q) => (
        <div key={q.key}>
          <small>{q.label}</small>
          <p>{formData[q.key] || 'Not answered'}</p>
        </div>
      ))}
    </div>
  );
}

export default function ReviewPlan() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);

  const planKind = location.state?.planKind || 'daily_plan';
  const plan = location.state?.plan || null;

  const reviewDate = useMemo(() => (plan ? parseDbTimestamp(plan.created_at) : new Date()), [plan]);
  const dateKey = getLocalDateKey(reviewDate);
  const t = TY[planKind] || TY.daily_plan;

  const [entryId, setEntryId] = useState(null);
  // Whether the row being edited is a saved draft, so Discard can tell
  // it from a finished review (patch D1). Read through
  // isPlanReviewDraft() because rows saved before patch D2 only carry
  // the marker inside their content JSON, not the status column.
  const [existingIsDraft, setExistingIsDraft] = useState(false);
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [showPanel, setShowPanel] = useState(typeof window !== 'undefined' && window.innerWidth > 768);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [discardOpen, setDiscardOpen] = useState(false);
  const { message, showToast } = useToast();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) return;
      try {
        const reviews = await loadPlanReviews(user.id);
        if (cancelled) return;
        const existing = findPlanReview(reviews, { planKind, planId: plan?.id, dateKey });
        if (existing) {
          setEntryId(existing.id);
          setExistingIsDraft(isPlanReviewDraft(existing));
          setA(existing.data.a || '');
          setB(existing.data.b || '');
        }
      } catch (error) {
        console.error('[ReviewPlan] load failed:', error);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, planKind, plan?.id, dateKey]);

  const reviewTitle = planKind === 'daily_plan' ? formatLongDate(reviewDate) : (plan?.title || formatLongDate(reviewDate));

  const persist = async (draft) => {
    if (!user) return null;
    return savePlanReview({
      userId: user.id,
      entryId,
      planKind,
      planId: plan?.id || null,
      dateKey,
      title: reviewTitle,
      a,
      b,
      draft,
    });
  };

  const handleFinish = async () => {
    setSaveError('');
    setIsSaving(true);
    try {
      const savedId = await persist(false);
      navigate('/review-plan-summary', {
        state: { planKind, plan, entryId: savedId, toast: 'Review saved.' },
      });
    } catch (error) {
      console.error('[ReviewPlan] save failed:', error);
      setSaveError('Could not save. Please try again. This needs a database change the site owner has not run yet.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveDraft = async () => {
    setSaveError('');
    setIsSaving(true);
    try {
      const savedId = await persist(true);
      setEntryId(savedId);
      setExistingIsDraft(true);
      showToast('Draft saved.');
      navigate('/my-reviews');
    } catch (error) {
      console.error('[ReviewPlan] draft save failed:', error);
      setSaveError('Could not save. Please try again. This needs a database change the site owner has not run yet.');
    } finally {
      setIsSaving(false);
    }
  };

  // Deletes the saved row only when it is a DRAFT - a finished day
  // review is never deleted by walking away from it (patch D1).
  const handleDiscard = async () => {
    setDiscardOpen(false);
    if (entryId && existingIsDraft) {
      try {
        await discardPlanReviewDraft(user.id, entryId);
      } catch (error) {
        console.error('[ReviewPlan] draft delete on discard failed:', error);
      }
    }
    const target = plan ? t.summaryRoute : '/review-section';
    navigate(target, { state: plan ? { decisionId: plan.id, toast: 'Discarded.' } : { toast: 'Discarded.' } });
  };

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
          <PageHeader title={t.h} info={t.sub} meta={[formatReviewDayLabel(reviewDate)]} />
        </div>

        {isLoading ? (
          <Loading label="Loading your review" className="ds-loading--page" />
        ) : (
          <>
            {!plan && planKind === 'daily_plan' ? (
              <div className="rp-no-plan">
                <span>There is no daily plan for this day. You can still review it.</span>
                <button type="button" className="plan-link-btn" onClick={() => navigate('/plan-my-day')}>
                  Plan my day
                </button>
              </div>
            ) : (
              <div className="rp-panel-wrap">
                <div className="rp-panel-head">
                  <span className="rp-panel-label">{t.panel}</span>
                  <button type="button" className="plan-link-btn" aria-expanded={showPanel} onClick={() => setShowPanel((s) => !s)} style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    {showPanel ? 'Hide' : 'Show'}
                    <DisclosureArrow open={showPanel} />
                  </button>
                </div>
                {showPanel && <PanelBody planKind={planKind} plan={plan} />}
              </div>
            )}

            {RQ.map((q, index) => {
              const value = q.key === 'a' ? a : b;
              const setter = q.key === 'a' ? setA : setB;
              return (
                <div className={`plan-dq${value.trim() ? ' on' : ''}`} key={q.key}>
                  <div className="plan-dq-num">
                    {String(index + 1).padStart(2, '0')}
                    <svg className="plan-dq-check" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
                  </div>
                  <div>
                    <label className="plan-dq-label" htmlFor={`rp-${q.key}`}>{q.label}</label>
                    <AutoGrowTextarea id={`rp-${q.key}`} className="plan-dq-textarea" placeholder="Type here" value={value} onChange={setter} />
                  </div>
                </div>
              );
            })}

            {saveError && <p className="plan-save-error" role="alert">{saveError}</p>}

            <div className="plan-actions plan-actions--desktop">{actionButtons}</div>

            <div className="plan-discard-row">
              <DiscardLink onClick={() => setDiscardOpen(true)} />
            </div>
          </>
        )}
      </div>

      <PhoneActionBar>{actionButtons}</PhoneActionBar>

      <DiscardDialog
        isOpen={discardOpen}
        title="Discard this review?"
        message="Anything you have not saved will be lost."
        onKeep={() => setDiscardOpen(false)}
        onDiscard={handleDiscard}
      />
      <Toast message={message} />
    </div>
  );
}
