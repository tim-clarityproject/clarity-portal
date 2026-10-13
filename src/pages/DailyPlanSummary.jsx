import { useContext, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { getLocalDateKey, parseDbTimestamp } from '../lib/dateFormatter';
import { loadPlanReviews, findPlanReview } from '../lib/planReview';
import DesignHeader from '../components/DesignHeader';
import { BackLink } from '../components/ui/DiscardLink';
import Toast from '../components/ui/Toast';
import useToast from '../hooks/useToast';

// Headings repeat the four questions word for word - see
// PlanMyDayStep1.jsx's QUESTIONS. Two of these were previously shortened
// here ("Top Priority", "What don't you want to do?"); field names
// (gratitude/topPriority/showUp/notDo) are unchanged, so older plans
// saved under the old headings still load and display correctly.
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

// "Friday 2nd Oct, 2026" - en-US only for the month abbreviation (en-GB's
// Intl data gives "Sept", 4 letters; the approved examples use "Sep").
function formatPlanDate(isoString) {
  const date = parseDbTimestamp(isoString);
  const weekday = date.toLocaleDateString('en-GB', { weekday: 'long' });
  const month = date.toLocaleDateString('en-US', { month: 'short' });
  const year = date.getFullYear();
  return `${weekday} ${ordinal(date.getDate())} ${month}, ${year}`;
}

export default function DailyPlanSummary() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const decisionId = location.state?.decisionId;
  const [plan, setPlan] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [reviewEntryId, setReviewEntryId] = useState(null);
  const { message, showToast } = useToast();

  useEffect(() => {
    if (decisionId && user) {
      loadPlan();
    } else {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decisionId, user?.id]);

  useEffect(() => {
    if (!plan || !user) return;
    let cancelled = false;
    (async () => {
      try {
        const reviews = await loadPlanReviews(user.id);
        if (cancelled) return;
        const dateKey = getLocalDateKey(parseDbTimestamp(plan.created_at));
        const existing = findPlanReview(reviews, { planKind: 'daily_plan', planId: plan.id, dateKey });
        if (existing && !existing.data.draft) setReviewEntryId(existing.id);
      } catch (error) {
        console.error('[DailyPlanSummary] review check failed:', error);
      }
    })();
    return () => { cancelled = true; };
  }, [plan, user?.id]);

  // Fires the toast carried from Finish on PlanMyDayStep1.jsx, then
  // drops it from history state so it doesn't reappear on back/forward.
  useEffect(() => {
    if (location.state?.toast) {
      showToast(location.state.toast);
      navigate(location.pathname, { replace: true, state: { decisionId } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadPlan = async () => {
    try {
      const { data, error } = await supabase
        .from('decisions')
        .select('*')
        .eq('id', decisionId)
        .eq('user_id', user.id)
        .single();

      if (error) throw error;
      if (data) setPlan(data);
    } catch (error) {
      console.error('[DailyPlanSummary] load failed:', error.message);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="ui-root">
        <DesignHeader />
        <div className="plan-page">
          <p className="ui-subtitle">Loading...</p>
        </div>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="ui-root">
        <DesignHeader />
        <div className="plan-page">
          <p className="ui-subtitle">Plan not found.</p>
          <div className="plan-actions">
            <button type="button" className="ui-btn-primary" onClick={() => navigate('/plan-my-day')}>
              Plan my day
            </button>
          </div>
        </div>
      </div>
    );
  }

  const formData = plan.form_data || {};
  const answered = QUESTIONS.filter((q) => formData[q.key] && formData[q.key].trim());

  return (
    <div className="ui-root">
      <DesignHeader />

      <div className="plan-page">
        <div className="plan-back-row">
          <BackLink onClick={() => navigate('/my-plans')} label="Back to my plans" />
        </div>

        <div className="plan-summary-head">
          <span className="plan-overline">Daily intentions</span>
          <div className="ui-title">{formatPlanDate(plan.created_at)}</div>
        </div>

        {answered.length > 0 && (
          <div className="plan-sum">
            {answered.map((q) => (
              <div className="plan-sum-row" key={q.key}>
                <div className="plan-sum-label">{q.label}</div>
                <p className="plan-sum-value">{formData[q.key]}</p>
              </div>
            ))}
          </div>
        )}

        <div className="plan-actions">
          <button
            type="button"
            className="ui-btn-primary"
            onClick={() => (
              reviewEntryId
                ? navigate('/review-plan-summary', { state: { entryId: reviewEntryId, planKind: 'daily_plan', plan } })
                : navigate('/review-plan', { state: { planKind: 'daily_plan', plan } })
            )}
          >
            {reviewEntryId ? 'View my review' : 'Review my day'}
          </button>
          <button
            type="button"
            className="ui-btn-ghost"
            onClick={() => navigate('/plan-my-day', { state: { decisionId: plan.id } })}
          >
            Edit
          </button>
        </div>
      </div>

      <Toast message={message} />
    </div>
  );
}
