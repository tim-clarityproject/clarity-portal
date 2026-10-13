import { useState, useContext, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { clearProgress } from '../lib/saveProgress';
import { parseDbTimestamp, getLocalDateKey, formatReviewDate } from '../lib/dateFormatter';
import DesignHeader from '../components/DesignHeader';
import HistoryList from '../components/ui/HistoryList';
import DeleteDialog, { showDeletedToast } from '../components/ui/DeleteDialog';
import Toast from '../components/ui/Toast';
import useToast from '../hooks/useToast';

// "Combined history" tool types (mock: plan-section.html, S.plans) -
// a curated subset of `decisions` rows, not every decision tool_type
// (Inversion and Strategic alignment stay My decisions-only, by design
// of the approved mock's own DEC list).
const COMBINED_TOOL_TYPES = ['daily_plan', 'plan_meeting', 'if_then_planning', 'stop_doing_audit', 'grow', 'tough-conversation'];

const TYPE_LABEL = {
  daily_plan: 'Daily plan',
  plan_meeting: 'Meeting plan',
  if_then_planning: 'If-Then plan',
  stop_doing_audit: 'Time audit',
  grow: 'GROW',
  'tough-conversation': 'Tough feedback',
};

const DECISION_LABELS = ['If-Then plan', 'Time audit', 'GROW', 'Tough feedback'];

const FILTERS = [
  { id: 'Daily plan', label: 'Daily plans' },
  { id: 'Meeting plan', label: 'Meetings' },
  { id: 'dec', label: 'Decisions', match: (r) => DECISION_LABELS.includes(r.typeLabel) },
];

const SUB_FILTERS = {
  dec: [
    { id: 'If-Then plan', label: 'If-Then plan' },
    { id: 'Time audit', label: 'Time audit' },
    { id: 'GROW', label: 'GROW' },
    { id: 'Tough feedback', label: 'Tough feedback' },
  ],
};

const SUMMARY_ROUTE = {
  daily_plan: '/daily-plan-summary',
  plan_meeting: '/meeting-summary',
  if_then_planning: '/if-then-planning-summary',
  stop_doing_audit: '/stop-doing-audit-summary',
  grow: '/decision-summary',
  'tough-conversation': '/tough-conversation-summary',
};

const EDIT_ROUTE = {
  daily_plan: '/plan-my-day',
  plan_meeting: '/plan-meeting',
  if_then_planning: '/if-then-planning',
  stop_doing_audit: '/stop-doing-audit',
  grow: '/grow-step-1',
  'tough-conversation': '/tough-conversation-step-1',
};

function rowTitle(d) {
  if (d.tool_type === 'daily_plan') {
    return formatReviewDate(getLocalDateKey(parseDbTimestamp(d.created_at)));
  }
  return d.title || 'Untitled';
}

export default function MyPlans() {
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const [plans, setPlans] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const { message, showToast } = useToast();

  useEffect(() => {
    if (user) loadPlans();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const loadPlans = async () => {
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('decisions')
        .select('*')
        .eq('user_id', user.id)
        .in('tool_type', COMBINED_TOOL_TYPES)
        .order('created_at', { ascending: false });
      if (fetchError) throw fetchError;
      setPlans(data || []);
    } catch (err) {
      console.error('[MyPlans] load failed:', err);
      setError({ message: 'Could not load your plans.', onRetry: loadPlans });
    } finally {
      setIsLoading(false);
    }
  };

  const rows = useMemo(() => plans.map((d) => ({
    id: d.id,
    title: rowTitle(d),
    typeLabel: TYPE_LABEL[d.tool_type] || d.tool_type,
    date: d.created_at,
    isDraft: Boolean(d.draft || d.status === 'draft'),
    raw: d,
  })), [plans]);

  const openRow = (row) => {
    const route = SUMMARY_ROUTE[row.raw.tool_type] || '/decision-summary';
    navigate(route, { state: { decisionId: row.id, ...row.raw } });
  };

  const editRow = (row) => {
    const route = EDIT_ROUTE[row.raw.tool_type] || '/plan-section';
    navigate(route, { state: { decisionId: row.id, ...row.raw.form_data, problemTitle: row.raw.title } });
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const { id } = deleteTarget;
    setDeleteTarget(null);
    try {
      const { error: deleteError } = await supabase.from('decisions').delete().eq('id', id);
      if (deleteError) throw deleteError;
      setPlans((prev) => prev.filter((p) => p.id !== id));
      clearProgress();
      showDeletedToast(showToast);
    } catch (err) {
      console.error('[MyPlans] delete failed:', err);
      showToast('Could not delete - please try again.');
    }
  };

  return (
    <div className="ui-root">
      <DesignHeader />

      <div className="plan-page">
        {isLoading ? (
          <>
            <div className="ui-title">My Plans</div>
            <p className="ui-subtitle">Loading...</p>
          </>
        ) : (
          <HistoryList
            title="My Plans"
            subLine="Every plan and decision you have made, in one history."
            rows={rows}
            filters={FILTERS}
            subFilters={SUB_FILTERS}
            newButton={{ label: 'New plan', onClick: () => navigate('/planning-tools') }}
            emptyText="No plans yet."
            error={error}
            onOpen={openRow}
            onEdit={editRow}
            onDelete={(row) => setDeleteTarget(row)}
          />
        )}
      </div>

      <DeleteDialog
        open={Boolean(deleteTarget)}
        title="Delete this plan?"
        body={deleteTarget ? `"${deleteTarget.title}" will be removed for good. This cannot be undone.` : ''}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
      <Toast message={message} />
    </div>
  );
}
