import { useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { getLocalDateKey } from '../lib/dateFormatter';
import { deleteReview as deleteJournalEntryRow } from '../lib/reviewTool';
import { deleteJournal } from '../lib/dailyJournal';
import { discardReviewDraft, discardPlanReviewDraft, discardMissionReviewDraft } from '../lib/discardDraft';
import { deleteCheckin } from '../lib/wheelOfLifeApi';
import { useCachedLoad } from '../lib/pageCache';
import { useOnline } from '../lib/connection';
import { FIRST_OPEN_OFFLINE } from '../lib/friendlyError';
import { listFilters, reviewRows } from '../lib/savedItems';
import { loadSavedReviews, SAVED_REVIEWS_CACHE } from '../lib/savedItemsApi';
import DesignHeader from '../components/DesignHeader';
import HistoryList from '../components/ui/HistoryList';
import DeleteDialog from '../components/ui/DeleteDialog';
import { Loading, useToast } from '../components/design';

// My Reviews (Phase 4 step 4; decisions part 1 "My Plans and My
// Reviews"): one list of every saved review across the three areas, old
// and new, named in words (writing rule 60, src/lib/savedItems.js), with
// the area behind the one Filter button. ?area= (and &tool=) opens it
// filtered (the Review hub's link).
//
// Old reviews keep their own delete and edit (POP reviews read only, as
// Phase 3 left them). Day reviews, debriefs and end-of-sprint reviews open
// their own pages, where they are changed; they have no bin here. Journal
// entries are listed too ("Journal saved. It is in My Reviews too."), as
// "Journal entry", never their first words.

export default function MyReviews() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const toast = useToast();

  // Instant page (Tim, 26 Oct): the reviews shown last time appear at
  // once from the device, then refresh quietly in the background.
  const loaded = useCachedLoad({ userId: user?.id, name: SAVED_REVIEWS_CACHE, load: () => loadSavedReviews(user.id) });
  const online = useOnline();
  const today = getLocalDateKey();
  const rows = useMemo(() => reviewRows(loaded.data, today), [loaded.data, today]);
  const { filters, subFilters, subLabels } = useMemo(() => listFilters(rows), [rows]);
  const query = new URLSearchParams(location.search);
  const isLoading = loaded.loading;
  const error = loaded.error && !loaded.data
    ? { message: online ? 'Your reviews didn’t load. Check your connection and try again.' : FIRST_OPEN_OFFLINE, onRetry: loaded.reload }
    : null;

  useEffect(() => {
    if (location.state?.toast) {
      toast.show(location.state.toast);
      navigate(`${location.pathname}${location.search}`, { replace: true, state: {} });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const go = (to) => to && navigate(to.path, to.state ? { state: to.state } : undefined);

  // HistoryList shows this as "Continue" on a draft row and as the pencil
  // on a finished one, so this handles both (patch D2 area C).
  const editRow = async (row) => {
    if (row.source !== 'day') {
      go(row.edit || row.to);
      return;
    }
    if (!row.isDraft) {
      go(row.to);
      return;
    }
    // ReviewPlan finds its row by planKind + planId + the dateKey it
    // derives from the plan's own created_at, so Continue has to hand it
    // the plan itself. Only read on click, never on page load.
    let content = {};
    try { content = JSON.parse(row.raw.content) || {}; } catch { /* old row */ }
    const { planKind, planId } = content;
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
  };

  // A draft row's bin goes through patch D1's draft-only helpers, so a
  // bug here can never take a finished review with it; finished rows
  // keep their existing unconditional delete.
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const { dbId: id, source, isDraft } = deleteTarget;
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
      const drop = (list) => (list || []).filter((r) => r.id !== id);
      loaded.setData((prev) => ({
        ...prev,
        entries: drop(prev?.entries),
        missionReviews: drop(prev?.missionReviews),
        journals: drop(prev?.journals),
        checkins: drop(prev?.checkins),
      }));
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
          filters={filters}
          subFilters={subFilters}
          subLabels={subLabels}
          filterLabel="Which area?"
          initialFilter={query.get('area') || 'all'}
          initialSubFilter={query.get('tool') || 'all'}
          search={{ label: 'Search my reviews', placeholder: 'Search by name or tool' }}
          initialSearch={query.get('q') || ''}
          newButton={{ label: 'New review', onClick: () => navigate('/personal/review') }}
          emptyText="Nothing here. When you finish a review or save a journal it will appear in this list."
          error={error}
          onOpen={(row) => go(row.to)}
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
