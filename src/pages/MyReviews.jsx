import { useContext, useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { formatPlainDayLabel } from '../lib/dateFormatter';
import { formatVersion } from '../lib/missionPlan';
import { deleteReview as deleteJournalEntryRow } from '../lib/reviewTool';
import { deleteJournal } from '../lib/dailyJournal';
import { isPlanReviewDraft, PLAN_REVIEW_TYPE } from '../lib/planReview';
import { discardReviewDraft, discardPlanReviewDraft, discardMissionReviewDraft } from '../lib/discardDraft';
import DesignHeader from '../components/DesignHeader';
import HistoryList from '../components/ui/HistoryList';
import DeleteDialog from '../components/ui/DeleteDialog';
import Toast from '../components/ui/Toast';
import useToast from '../hooks/useToast';

// Old 'progress' review_type has no filter pill of its own in the spec
// (All, Day, Weekly momentum, After-action, Plan, Journals) - bucketed
// under After-action (closest cousin: a written reflection) while
// keeping its own on-row label "Progress review", per section C's
// instruction that old rows "appear in My Reviews under type
// 'Progress review'".
const JOURNAL_ENTRY_META = {
  'plan-review': { typeLabel: 'Day review', source: 'day', fallback: 'Day review' },
  'weekly-momentum': { typeLabel: 'Weekly momentum check-in', source: 'weekly', fallback: 'Weekly momentum check-in' },
  'after-action': { typeLabel: 'After-action review', source: 'after-action', fallback: 'After-action review' },
  progress: { typeLabel: 'Progress review', source: 'after-action', fallback: 'Progress review' },
};

// "Plan" (filter id kept as-is - internal only, never shown) is
// renamed to "POP review" on Tim's explicit instruction (patch 2d),
// overriding my-reviews.html's own "Plan"/"Plan review" wording -
// Personal Operating Plan reviews, not to be confused with the
// Plan section/nav label elsewhere in the app, which is unrelated and
// untouched. Order unchanged: All, Day, Weekly momentum, After-action,
// POP review, Journals.
const FILTERS = [
  { id: 'day', label: 'Day', match: (r) => r.source === 'day' },
  { id: 'weekly', label: 'Weekly momentum', match: (r) => r.source === 'weekly' },
  { id: 'after-action', label: 'After-action', match: (r) => r.source === 'after-action' },
  { id: 'plan', label: 'POP review', match: (r) => r.source === 'plan' },
  { id: 'journals', label: 'Journals', match: (r) => r.source === 'journal' },
];

export default function MyReviews() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const [rows, setRows] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const { message, showToast } = useToast();

  const load = async () => {
    setError(null);
    let anySucceeded = false;
    const built = [];

    try {
      const { data, error: err } = await supabase
        .from('journal_entries')
        .select('*')
        .eq('user_id', user.id);
      if (err) throw err;
      anySucceeded = true;
      // Drafts are now listed too (patch D2 area C), tagged and with a
      // Continue action - they used to be filtered out here. A Day
      // review's draft state has to come from isPlanReviewDraft (its
      // marker may only be in the content JSON on older rows); every
      // other review_type reads the status column directly.
      (data || [])
        .filter((e) => JOURNAL_ENTRY_META[e.review_type])
        .forEach((e) => {
          const meta = JOURNAL_ENTRY_META[e.review_type];
          built.push({
            id: e.id,
            title: e.title || meta.fallback,
            typeLabel: meta.typeLabel,
            source: meta.source,
            date: e.created_at,
            isDraft: e.review_type === PLAN_REVIEW_TYPE ? isPlanReviewDraft(e) : e.status === 'draft',
            raw: e,
          });
        });
    } catch (err) {
      console.error('[MyReviews] journal_entries load failed:', err);
    }

    try {
      // No status filter any more (patch D2 area C): drafts are listed
      // too, and dropping the filter also means this query no longer
      // depends on the status column existing at all - it only reads
      // it per row below, defaulting to "not a draft".
      const { data, error: err } = await supabase
        .from('mission_progress_reviews')
        .select('*')
        .eq('user_id', user.id);
      if (err) throw err;
      anySucceeded = true;
      const versionIds = [...new Set((data || []).map((r) => r.plan_version_id).filter(Boolean))];
      let versionsById = {};
      if (versionIds.length) {
        const { data: versions } = await supabase.from('mission_versions').select('*').in('id', versionIds);
        versionsById = Object.fromEntries((versions || []).map((v) => [v.id, v]));
      }
      (data || []).forEach((r) => {
        const version = versionsById[r.plan_version_id];
        built.push({
          id: r.id,
          title: r.review_data?.mission_title || 'Personal operating plan',
          typeLabel: 'POP review',
          source: 'plan',
          date: r.created_at,
          version: version ? formatVersion(version.major, version.minor) : null,
          isDraft: r.status === 'draft',
          raw: r,
        });
      });
    } catch (err) {
      console.error('[MyReviews] mission_progress_reviews load failed (migration 014 may not be run yet):', err);
    }

    try {
      const { data, error: err } = await supabase
        .from('daily_journals')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'final');
      if (err) throw err;
      anySucceeded = true;
      (data || []).forEach((j) => {
        built.push({
          id: j.id,
          title: `Daily Journal, ${formatPlainDayLabel(j.journal_date)}`,
          typeLabel: 'Daily Journal',
          source: 'journal',
          date: j.created_at,
          raw: j,
        });
      });
    } catch (err) {
      console.error('[MyReviews] daily_journals load failed (migration 015 may not be run yet):', err);
    }

    setRows(built);
    if (!anySucceeded) {
      setError({ message: 'Could not load your reviews.', onRetry: load });
    }
    setIsLoading(false);
  };

  useEffect(() => {
    if (user) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    if (location.state?.toast) {
      showToast(location.state.toast);
      navigate(location.pathname, { replace: true, state: {} });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openRow = (row) => {
    if (row.source === 'day') navigate('/review-plan-summary', { state: { entryId: row.id } });
    else if (row.source === 'weekly' || row.source === 'after-action') navigate('/review-summary', { state: { entryId: row.id } });
    else if (row.source === 'plan') navigate('/mission-progress-review', { state: { reviewId: row.id } });
    else navigate(`/daily-journals/${row.raw.journal_date}`);
  };

  // HistoryList shows this as "Continue" on a draft row and as the
  // pencil on a finished one, so this handles both (patch D2 area C).
  // Every destination is an existing route - a draft just needs the
  // editing one rather than the read-only summary.
  const editRow = async (row) => {
    if (row.source === 'day') {
      if (!row.isDraft) {
        navigate('/review-plan-summary', { state: { entryId: row.id } });
        return;
      }
      // ReviewPlan finds its row by planKind + planId + the dateKey it
      // derives from the plan's own created_at, so Continue has to hand
      // it the plan itself. Only read on click, never on page load, so
      // this does not touch My Reviews' load time.
      const { planKind, planId } = row.raw.content ? JSON.parse(row.raw.content) : {};
      let plan = null;
      if (planId) {
        try {
          const { data } = await supabase.from('decisions').select('*').eq('id', planId).eq('user_id', user.id).single();
          plan = data || null;
        } catch (err) {
          console.error('[MyReviews] plan lookup for Continue failed:', err);
        }
      }
      navigate('/review-plan', { state: { planKind: planKind || 'daily_plan', plan } });
    } else if (row.source === 'weekly' || row.source === 'after-action') {
      // Same route and state the Review hub's "Continue your draft"
      // link already uses.
      navigate('/my-journal', { state: { entryId: row.id, reviewType: row.raw.review_type } });
    } else if (row.source === 'plan') {
      if (!row.isDraft) {
        navigate('/mission-progress-review', { state: { reviewId: row.id } });
        return;
      }
      // Deliberately missionId WITHOUT reviewId: that is the branch
      // that calls loadDraftReview(), shows the "Continuing your draft"
      // banner and lets its own Discard delete the draft. Passing
      // reviewId instead takes the finished-review branch, which does
      // neither.
      navigate('/personal-operating-plan-review', { state: { missionId: row.raw.mission_id } });
    } else {
      navigate('/daily-journal', { state: { date: row.raw.journal_date } });
    }
  };

  // A draft row's bin goes through patch D1's draft-only helpers, so a
  // bug here can never take a finished review with it; finished rows
  // keep their existing unconditional delete.
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const { id, source, isDraft } = deleteTarget;
    setDeleteTarget(null);
    try {
      if (source === 'plan') {
        if (isDraft) {
          await discardMissionReviewDraft(user.id, id);
        } else {
          const { error: err } = await supabase.from('mission_progress_reviews').delete().eq('id', id).eq('user_id', user.id);
          if (err) throw err;
        }
      } else if (source === 'journal') {
        await deleteJournal(user.id, id);
      } else if (isDraft && source === 'day') {
        await discardPlanReviewDraft(user.id, id);
      } else if (isDraft) {
        await discardReviewDraft(user.id, id);
      } else {
        await deleteJournalEntryRow(user.id, id);
      }
      setRows((prev) => prev.filter((r) => r.id !== id));
      showToast('Deleted.');
    } catch (err) {
      console.error('[MyReviews] delete failed:', err);
      showToast('Could not delete - please try again.');
    }
  };

  if (isLoading) {
    return (
      <div className="ui-root">
        <DesignHeader />
        <div className="plan-page"><p className="ui-subtitle">Loading...</p></div>
      </div>
    );
  }

  return (
    <div className="ui-root">
      <DesignHeader />

      <div className="plan-page">
        <HistoryList
          title="My Reviews"
          rows={rows}
          filters={FILTERS}
          newButton={{ label: 'New review', onClick: () => navigate('/review-section') }}
          emptyText="Nothing here. When you finish a review or save a journal it will appear in this list."
          error={error}
          onOpen={openRow}
          onEdit={editRow}
          onDelete={(row) => setDeleteTarget(row)}
        />
      </div>

      <DeleteDialog
        open={Boolean(deleteTarget)}
        title={deleteTarget?.source === 'journal' ? 'Delete this journal?' : 'Delete this review?'}
        body="This cannot be undone."
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
      <Toast message={message} />
    </div>
  );
}
