import { useContext, useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { BackLink } from '../components/ui/DiscardLink';
import DesignHeader from '../components/DesignHeader';
import Toast from '../components/ui/Toast';
import useToast from '../hooks/useToast';
import pageText from '../content/pageText';
import { Loading, PageHeader } from '../components/design';

const RQ = [
  { key: 'a', label: 'What went well?' },
  { key: 'b', label: 'What would you do differently next time?' },
];

const SUMMARY_ROUTE = {
  daily_plan: '/daily-plan-summary',
  plan_meeting: '/meeting-summary',
  if_then_planning: '/if-then-planning-summary',
  inversion: '/inversion-thinking-summary',
  'tough-conversation': '/tough-conversation-summary',
};

const PLAN_LABEL = {
  daily_plan: "Your day's plan",
  plan_meeting: 'Your meeting plan',
  if_then_planning: 'Your plan',
  inversion: 'Your plan',
  'tough-conversation': 'Your plan',
};

export default function ReviewPlanSummary() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const entryId = location.state?.entryId;
  const planFromState = location.state?.plan || null;
  const planKindFromState = location.state?.planKind;

  const [entry, setEntry] = useState(null);
  const [plan, setPlan] = useState(planFromState);
  const [isLoading, setIsLoading] = useState(true);
  const { message, showToast } = useToast();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!entryId || !user) {
        setIsLoading(false);
        return;
      }
      try {
        const { data, error } = await supabase
          .from('journal_entries')
          .select('*')
          .eq('id', entryId)
          .eq('user_id', user.id)
          .single();
        if (error) throw error;
        if (cancelled || !data) return;
        let parsed = {};
        try { parsed = JSON.parse(data.content); } catch { /* ignore */ }
        setEntry({ ...data, data: parsed });

        // Reached directly (not via Finish, which already carries the
        // plan in state) - refetch it so Edit/View my plan still work.
        if (!planFromState && parsed.planId) {
          const { data: planRow } = await supabase
            .from('decisions')
            .select('*')
            .eq('id', parsed.planId)
            .eq('user_id', user.id)
            .single();
          if (!cancelled && planRow) setPlan(planRow);
        }
      } catch (error) {
        console.error('[ReviewPlanSummary] load failed:', error);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryId, user?.id]);

  useEffect(() => {
    if (location.state?.toast) {
      showToast(location.state.toast);
      navigate(location.pathname, { replace: true, state: { entryId, planKind: planKindFromState, plan: planFromState } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isLoading) {
    return (
      <div className="ui-root">
        <DesignHeader />
        <div className="plan-page"><Loading label="Loading your review" className="ds-loading--page" /></div>
      </div>
    );
  }

  if (!entry) {
    return (
      <div className="ui-root">
        <DesignHeader />
        <div className="plan-page"><p className="ui-subtitle">Review not found.</p></div>
      </div>
    );
  }

  const planKind = entry.data.planKind || planKindFromState || 'daily_plan';
  const hasPlan = Boolean(entry.data.planId) || Boolean(plan);
  const planId = entry.data.planId || plan?.id;

  return (
    <div className="ui-root">
      <DesignHeader />

      <div className="plan-page">
        <div className="plan-back-row">
          <BackLink onClick={() => navigate('/my-plans')} label="Back to my plans" />
        </div>

        <div className="plan-summary-head">
          <PageHeader title={entry.title} info={pageText.reviewPlanSummary} />
        </div>

        <div className="plan-sum">
          {RQ.map((q) => (
            <div className="plan-sum-row" key={q.key}>
              <p className="plan-sum-label">{q.label}</p>
              <p className="plan-sum-value">{entry.data[q.key] || <span className="plan-none">Not answered.</span>}</p>
            </div>
          ))}
          <div className="plan-sum-row">
            <p className="plan-sum-label">{PLAN_LABEL[planKind] || 'Your plan'}</p>
            <div className="plan-sum-value">
              {hasPlan ? (
                <button
                  type="button"
                  className="ui-btn-ghost"
                  onClick={() => navigate(SUMMARY_ROUTE[planKind] || '/my-plans', { state: { decisionId: planId } })}
                >
                  View my plan
                </button>
              ) : (
                <span className="plan-none">No daily plan for this day.</span>
              )}
            </div>
          </div>
        </div>

        <div className="plan-actions">
          <button
            type="button"
            className="ui-btn-ghost"
            onClick={() => navigate('/review-plan', { state: { planKind, plan } })}
          >
            Edit
          </button>
        </div>
      </div>

      <Toast message={message} />
    </div>
  );
}
