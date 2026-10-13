import { useState, useContext, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { clearProgress } from '../lib/saveProgress';
import { getLocalDateKey, parseDbTimestamp } from '../lib/dateFormatter';
import { loadPlanReviews, findPlanReview } from '../lib/planReview';
import DesignHeader from '../components/DesignHeader';
import HistoryList from '../components/ui/HistoryList';
import DeleteDialog, { showDeletedToast } from '../components/ui/DeleteDialog';
import Toast from '../components/ui/Toast';
import useToast from '../hooks/useToast';

// Decision types with a "Review this plan" page (prompt 8).
const REVIEWABLE_TYPES = new Set(['inversion', 'tough-conversation']);

const TYPE_LABEL = {
  grow: 'GROW',
  inversion: 'Pre-mortem',
  'tough-conversation': 'Tough conversation',
  'strategic-alignment': 'Strategic alignment',
  if_then_planning: 'If-Then plan',
  stop_doing_audit: 'Stop doing audit',
};

const SUMMARY_ROUTE = {
  inversion: '/inversion-thinking-summary',
  'tough-conversation': '/tough-conversation-summary',
  if_then_planning: '/if-then-planning-summary',
  stop_doing_audit: '/stop-doing-audit-summary',
};

const EDIT_ROUTE = {
  grow: '/grow-step-1',
  inversion: '/inversion-step-1',
  'tough-conversation': '/tough-conversation-step-1',
  'strategic-alignment': '/goal-setting',
  if_then_planning: '/if-then-planning',
  stop_doing_audit: '/stop-doing-audit',
};

export default function DecisionHistory() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const [decisions, setDecisions] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const { message, showToast } = useToast();

  useEffect(() => {
    if (user) loadDecisions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // A Discard on any Inversion/Tough conversation/Stop doing audit step
  // lands here with a one-shot toast - show it once, then clear the
  // router state so refreshing/going back doesn't repeat it.
  useEffect(() => {
    if (location.state?.toast) {
      showToast(location.state.toast);
      navigate(location.pathname, { replace: true, state: {} });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadDecisions = async () => {
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('decisions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (fetchError) throw fetchError;
      setDecisions((data || []).filter((d) => d.tool_type !== 'daily_plan' && d.tool_type !== 'plan_meeting'));
      try {
        setReviews(await loadPlanReviews(user.id));
      } catch (reviewErr) {
        console.error('[DecisionHistory] review lookup failed (migration 013 may not be run yet):', reviewErr);
        setReviews([]);
      }
    } catch (err) {
      console.error('[DecisionHistory] load failed:', err);
      setError({ message: 'Could not load your decisions.', onRetry: loadDecisions });
    } finally {
      setIsLoading(false);
    }
  };

  const rows = useMemo(() => decisions.map((d) => {
    const isDraft = Boolean(d.draft || d.status === 'draft');
    const reviewable = REVIEWABLE_TYPES.has(d.tool_type) && !isDraft;
    let review = null;
    if (reviewable) {
      const dateKey = getLocalDateKey(parseDbTimestamp(d.created_at));
      review = findPlanReview(reviews, { planKind: d.tool_type, planId: d.id, dateKey });
    }
    return {
      id: d.id,
      title: d.title || 'Untitled decision',
      typeLabel: TYPE_LABEL[d.tool_type] || d.tool_type,
      date: d.created_at,
      isDraft,
      canReview: reviewable,
      reviewed: Boolean(review && !review.data.draft),
      reviewEntryId: review?.id || null,
      raw: d,
    };
  }), [decisions, reviews]);

  const openRow = (row) => {
    const route = SUMMARY_ROUTE[row.raw.tool_type] || '/decision-summary';
    navigate(route, { state: { decisionId: row.id } });
  };

  const editRow = (row) => {
    const route = EDIT_ROUTE[row.raw.tool_type] || '/decision-tools';
    navigate(route, { state: { decisionId: row.id, ...row.raw.form_data, problemTitle: row.raw.title } });
  };

  const reviewRow = (row) => {
    if (row.reviewed) {
      navigate('/review-plan-summary', { state: { entryId: row.reviewEntryId, planKind: row.raw.tool_type, plan: row.raw } });
    } else {
      navigate('/review-plan', { state: { planKind: row.raw.tool_type, plan: row.raw } });
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const { id } = deleteTarget;
    setDeleteTarget(null);
    try {
      const { error: deleteError } = await supabase.from('decisions').delete().eq('id', id);
      if (deleteError) throw deleteError;
      setDecisions((prev) => prev.filter((d) => d.id !== id));
      clearProgress();
      showDeletedToast(showToast);
    } catch (err) {
      console.error('[DecisionHistory] delete failed:', err);
      showToast('Could not delete - please try again.');
    }
  };

  return (
    <div className="ui-root">
      <DesignHeader />

      <div className="plan-page">
        <div className="dt-hrow">
          <div className="ui-title">My decisions</div>
          <button type="button" className="ui-btn-primary" onClick={() => navigate('/decision-tools')}>
            Make a decision
          </button>
        </div>

        {isLoading ? (
          <p className="ui-subtitle">Loading...</p>
        ) : (
          <HistoryList
            rows={rows}
            emptyText="No decisions yet."
            error={error}
            onOpen={openRow}
            onEdit={editRow}
            onReview={reviewRow}
            onDelete={(row) => setDeleteTarget(row)}
          />
        )}
      </div>

      <DeleteDialog
        open={Boolean(deleteTarget)}
        title="Delete this decision?"
        body={deleteTarget ? `"${deleteTarget.title}" will be removed for good. This cannot be undone.` : ''}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
      <Toast message={message} />
    </div>
  );
}
