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
import { deleteCheckin, listCheckins } from '../lib/wheelOfLifeApi';
import { formatCheckinDate } from '../lib/wheelOfLife';
import { useCachedLoad } from '../lib/pageCache';
import DesignHeader from '../components/DesignHeader';
import HistoryList from '../components/ui/HistoryList';
import DeleteDialog from '../components/ui/DeleteDialog';
import { Loading, useToast } from '../components/design';

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
// untouched. Order: All, Day, Weekly momentum, After-action, Wheel of
// Life, POP review, Journals.
const FILTERS = [
  { id: 'day', label: 'Day', match: (r) => r.source === 'day' },
  { id: 'weekly', label: 'Weekly momentum', match: (r) => r.source === 'weekly' },
  { id: 'after-action', label: 'After-action', match: (r) => r.source === 'after-action' },
  { id: 'wheel', label: 'Wheel of Life', match: (r) => r.source === 'wheel' },
  { id: 'plan', label: 'POP review', match: (r) => r.source === 'plan' },
  { id: 'journals', label: 'Journals', match: (r) => r.source === 'journal' },
];

export default function MyReviews() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const toast = useToast();

  const load = async () => {
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

    try {
      // Wheel of Life check-ins: never edited, so no pencil (canEdit).
      const { data, error: err } = await listCheckins({ summaryOnly: true });
      if (err) throw new Error(err.message);
      anySucceeded = true;
      (data || []).forEach((c) => {
        built.push({
          id: c.id,
          title: `Wheel of Life, ${formatCheckinDate(c.date)}`,
          typeLabel: 'Wheel of Life',
          source: 'wheel',
          date: c.checkinAt,
          canEdit: false,
          raw: c,
        });
      });
    } catch (err) {
      console.error('[MyReviews] wheel_of_life_checkins load failed (migration 020 may not be run yet):', err);
    }

    if (!anySucceeded) throw new TypeError('Failed to fetch: nothing loaded');
    return built;
  };

  // Instant page (Tim, 26 Oct): the reviews shown last time appear at
  // once from the device, then refresh quietly in the background.
  const loaded = useCachedLoad({ userId: user?.id, name: 'my-reviews', load });
  const rows = loaded.data || [];
  const isLoading = loaded.loading;
  const error = loaded.error
    ? { message: 'Your reviews didn’t load. Check your connection and try again.', onRetry: loaded.reload }
    : null;
  const setRows = loaded.setData;

  useEffect(() => {
    if (location.state?.toast) {
      toast.show(location.state.toast);
      navigate(location.pathname, { replace: true, state: {} });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openRow = (row) => {
    if (row.source === 'day') navigate('/review-plan-summary', { state: { entryId: row.id } });
    else if (row.source === 'weekly' || row.source === 'after-action') navigate('/review-summary', { state: { entryId: row.id } });
    else if (row.source === 'plan') navigate('/mission-progress-review', { state: { reviewId: row.id } });
    else if (row.source === 'wheel') navigate(`/wheel-of-life/results?to=${row.raw.date}`);
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
      // Opens the review for editing, the same as a finished row.
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
      if (source === 'wheel') {
        const { error: err } = await deleteCheckin(id);
        if (err) throw new Error(err.message);
      } else if (source === 'plan') {
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
      toast.show('Deleted');
    } catch (err) {
      console.error('[MyReviews] delete failed:', err);
      toast.error('That didn’t delete. Check your connection and try again.');
    }
  };

  if (isLoading) {
    return (
      <div className="ui-root">
        <DesignHeader />
        <Loading label="Loading your reviews" className="ds-loading--page" />
      </div>
    );
  }

  return (
    <div className="ui-root">
      <DesignHeader />

      <div className="plan-page">
        <HistoryList
          title="My Reviews"
          pageKey="myReviews"
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
        title={deleteTarget?.source === 'journal' ? 'Delete this journal?' : (deleteTarget?.source === 'wheel' ? 'Delete this check-in?' : 'Delete this review?')}
        body="This cannot be undone."
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
