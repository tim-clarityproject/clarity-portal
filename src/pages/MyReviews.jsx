import { useContext, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { getLocalDateKey } from '../lib/dateFormatter';
import { useCachedLoad } from '../lib/pageCache';
import { savedItemRef } from '../lib/savedItemDelete';
import { useOnline } from '../lib/connection';
import { FIRST_OPEN_OFFLINE } from '../lib/friendlyError';
import { listFilters, reviewRows } from '../lib/savedItems';
import { loadSavedReviews, SAVED_REVIEWS_CACHE } from '../lib/savedItemsApi';
import DesignHeader from '../components/DesignHeader';
import HistoryList from '../components/ui/HistoryList';
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
  // Opening a row takes the row along, so the opened item can delete
  // itself (SavedItemActions) and come back here.
  const open = (row) => row.to && navigate(row.to.path, {
    state: { ...(row.to.state || {}), savedItem: { ...savedItemRef(row), from: `${location.pathname}${location.search}` } },
  });

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
          onOpen={open}
          onEdit={editRow}
        />
      </div>

    </div>
  );
}
